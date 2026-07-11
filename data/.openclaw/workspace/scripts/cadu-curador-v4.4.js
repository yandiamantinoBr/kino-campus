#!/usr/bin/env node
/**
 * cadu-curador-v4.4.js — Curador UFG unificado v4.4
 *
 * MELHORIAS vs v4.2 (auditoria 2026-06-09):
 *   1. P0-BugFix-1: regex hasDeadline ampliada (tem até, submissão até, data limite, encerram em)
 *   2. P0-BugFix-2: heurística de deadline por data presente (PRPG/PROEX/PRAE)
 *   3. P0-BugFix-3: numItems aumentado 15→50 / 10→30 / 6→20
 *   4. P0-BugFix-4: bloqueio de imagens institucionais (Capa_para_Of*, modelo_of*, template_*)
 *   5. P1-BugFix-5: parser de cards card-concurso-* (Institutoverbena)
 *   6. P1-BugFix-6: score boost para categoria ProcessosSeletivos
 *   7. P1-BugFix-7: detecção de padrão "exposição de DD/MM a DD/MM" para Museu
 *
 * v4.5.2 (2026-06-11) — Auditoria MANUAL site-por-site (Tier 1+2+3 = 54 sites):
 *   1. P0-Fix-Update: resultados/homologações NÃO viram post novo (vão como update silencioso)
 *   2. P0-Fix-ForceDetail: sites sem fullText (prograd/farmacia/cepae/seinfra) SEMPRE fazem fetch detail
 *   3. P1-NumItems-Dynamic: feeds grandes (fe 50, quimica 60, museu 50) ganham numItems maior
 *   4. P1-NativeCats-Expanded: boost para palestra/seminario/oficina/evento/curso/concurso professor
 *   5. P1-IncludeTerms-Expanded: concurso professor efetivo/substituto, mutirão, webnário/live
 *   6. P1-NativeCats-Normalize: trim + collapse whitespace + case-insensitive
 *   7. P1-Sympla-Even3: detecta links de inscrição externos (Sympla, Even3, Google Forms) e adiciona a relevantLinks
 *
 * v4.6.0 (2026-07-10) — Inventario extensivo UFG (171 sites em sources.json):
 *   1. Adicionados 67 PPGs stricto sensu ao Tier 1 (publicam editais 3-4x/ano)
 *   2. Adicionado Campus Cidade Ocidental (co.ufg.br) ao Tier 2
 *   3. Adicionados 10+ estruturas vinculadas (CRTI, CPCBio, LaMCAD, IPElab, PTS, PITT, etc) ao Tier 2/3
 *   4. Adicionados midias (Jornal UFG, TV UFG, Radio UFG, Revistas UFG) ao Tier 2
 *   5. Adicionados PROEC, SECPLAN, PROPESSOAS ao Tier 1/2 (movidos do 3)
 *   6. Total: Tier 1 passou de 10 para 76+; Tier 2 de 26 para 63+; Tier 3 de 33 para 32+
 *   7. Yan pediu mapeamento extensivo com PPGs/labs/campi fora de Goiânia; ufg-sites-map.md v2.0 reflete.
 *
 * v4.6.1 (2026-07-10) — URLs REAIS dos PPGs (audit via Weby /feed):
 *   1. 29 PPGs com site proprio descoberto via teste de URLs (ppgX.unidade.ufg.br)
 *   2. PPGs sem site proprio usam pos.ufg.br/p/[...] como fallback
 *   3. Yan pediu "mais profundidade, mais analitico" — sites testados 1 a 1
 *   4. ufg-sites-map.md v3.0 + sources.json v3.0 refletem URLs REAIS (106 sites)
 *
 * Uso:
 *   node cadu-curador-v4.4.js           → full (Tier 1+2+3 + Browser IG)
 *   node cadu-curador-v4.4.js --quick   → Tier 1
 *   node cadu-curador-v4.4.js --daily   → Tier 1+2
 *   node cadu-curador-v4.4.js --ig-only → só Browser IG
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { normalizeImageUrl: normalizeCmsUrl, isThumbnailUrl } = require('./lib/image-utils.js');

// ============================================================
// CONFIG
// ============================================================

function isoDateInTimeZone(date, timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const BASE_DIR = '/data/.openclaw/workspace/data/ufg-scrape';
const IG_DIR = '/data/.openclaw/workspace/data/ufg-instagram';
const configuredReferenceDate = process.env.CADU_REFERENCE_DATE
  ? new Date(process.env.CADU_REFERENCE_DATE)
  : null;
const TODAY = configuredReferenceDate && !Number.isNaN(configuredReferenceDate.getTime())
  ? configuredReferenceDate
  : new Date();
const TODAY_ISO = isoDateInTimeZone(TODAY);
const TIMESTAMP = TODAY_ISO;
const CURRENT_YEAR = Number(TODAY_ISO.slice(0, 4));

// Helper: retorna data ISO de N dias atrás
function daysAgo(n) {
  const d = new Date(`${TODAY_ISO}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const MODE = process.argv.includes('--quick') ? 'quick' :
  (process.argv.includes('--daily') ? 'daily' :
    (process.argv.includes('--ig-only') ? 'ig-only' : 'full'));

const PUBLISH_THRESHOLD = 0.70; // Workflow Hardening 2026-06-01
const REVIEW_THRESHOLD = 0.50; // v4.4.2: 0.55 → 0.50 (mais itens em revisão manual)

// Supabase config (read from publisher .env)
const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';

// ============================================================
// UNIFIED TIER SYSTEM (curador + publisher merged, bugs fixed)
// ============================================================

const TIERS = {
  1: {
    label: 'Crítico (diário)',
    numItems: 50, // v4.4: era 15, agora 50 (auditoria 09/06)
    sites: {
      'ufg': { url: 'https://ufg.br', ig: 'ufg_oficial' },
      'secom': { url: 'https://secom.ufg.br', ig: null },
      'prpi': { url: 'https://prpi.ufg.br', ig: 'pesquisaeinovacaoufg' },
      'proex': { url: 'https://proex.ufg.br', ig: 'proex.ufg' },
      // v4.5.2: prograd SEMPRE retorna text=0 (só summary) — forçar detail fetch
      'prograd': { url: 'https://prograd.ufg.br', ig: 'prograd_ufg', forceDetailFetch: true },
      'prae': { url: 'https://prae.ufg.br', ig: 'praeufg' },
      'sri': { url: 'https://sri.ufg.br', ig: 'sri_ufg' },
      // v4.5.1 (2026-06-10): ADICIONADO systems endpoint para concursos oficiais
      // O Verbena tem /news (notícias) E sistemas.institutoverbena.ufg.br (concursos)
      // O curador usa /news, mas o sourceUrl pode ser do sistemas. Detectado via detectOfficialSource.
      'institutoverbena': { url: 'https://institutoverbena.ufg.br', ig: 'institutoverbenaufg' },
      'prpg': { url: 'https://prpg.ufg.br', ig: 'posufg' },
      'pos-ufg': { url: 'https://pos.ufg.br', ig: 'posufg' },
      'cei': { url: 'https://cei.ufg.br', ig: 'cei.ufg' },
      'proec': { url: 'https://proec.ufg.br', ig: 'proex.ufg' },
      'secplan': { url: 'https://secplan.ufg.br', ig: null },
      'propessoas': { url: 'https://propessoas.ufg.br', ig: 'propessoas_ufg' },
      'sdh': { url: 'https://sdh.ufg.br', ig: 'sdh_ufg' },
      'ciar': { url: 'https://ciar.ufg.br', ig: 'ciar_ufg' },
      'ipelab': { url: 'https://ipelab.ufg.br', ig: null },
      'pts': { url: 'https://parquesamambaia.ufg.br', ig: null },
      'pitt': { url: 'https://pitt.prpi.ufg.br', ig: null },
      'jornal-ufg': { url: 'https://jornal.ufg.br', ig: null },
      'tvufg': { url: 'https://tvufg.org.br', ig: 'tvufg' },
      // v4.6.1 (2026-07-10): URLs REAIS dos PPGs - testados via audit (29 com /feed)
      // Cada PPG tem seu proprio subdominio (padrao: ppgX.unidade.ufg.br)
      // Os que NAO tem site proprio usam pos.ufg.br/p/ como fallback.
      // Ciencias Agrarias
      'ppgagro': { url: 'https://ppgagro.agro.ufg.br', ig: null },
      'ppgca': { url: 'https://ppgca.evz.ufg.br', ig: null },
      'ppgcta': { url: 'https://ppgcta.agro.ufg.br', ig: null },
      'ppggmp': { url: 'https://ppggmp.agro.ufg.br', ig: null },
      'ppgz': { url: 'https://ppgz.evz.ufg.br', ig: null },
      'ppga': { url: 'https://ppga.agro.ufg.br', ig: null },
      // Ciencias Exatas e da Terra
      'ppgcc': { url: 'https://ppgcc.inf.ufg.br', ig: 'ppgccufg' },
      'ppgf': { url: 'https://pos.ufg.br/p/pos-graduacao-fisica-ppgf', ig: null },
      'ppgec': { url: 'https://pos.ufg.br/p/pos-graduacao-matematica-ppgime', ig: null },
      'ppgq': { url: 'https://ppgq.quimica.ufg.br', ig: null },
      'ppgea': { url: 'https://ppgea.fct.ufg.br', ig: null },
      'profmat': { url: 'https://profmat.ime.ufg.br', ig: null },
      // Ciencias Biologicas (sem site proprio - usam pos.ufg.br)
      'ppgban': { url: 'https://pos.ufg.br/p/pos-graduacao-biodiversidade-animal-ppgban', ig: null },
      'ppgrph': { url: 'https://pos.ufg.br/p/pos-graduacao-biologia-relacao-parasito-hospedeiro', ig: null },
      'ppgcb': { url: 'https://pos.ufg.br/p/pos-graduacao-ciencias-biologicas-ppgcb', ig: null },
      'ppgecoevol': { url: 'https://pos.ufg.br/p/pos-graduacao-ecologia-evolucao-ppgecoecvol', ig: null },
      'ppgmcf': { url: 'https://pos.ufg.br/p/pos-graduacao-multicentrico-ciencias-fisiologicas-ppgmcf', ig: null },
      'ppgbm': { url: 'https://pos.ufg.br/p/pos-graduacao-genetica-biologia-molecular', ig: null },
      // Ciencias da Saude
      'ppgaas': { url: 'https://ppgaas.farmacia.ufg.br', ig: null },
      'ppgcs': { url: 'https://pos.ufg.br/p/pos-graduacao-ciencias-saude-ppgcs', ig: null },
      'ppgcf': { url: 'https://ppgcf.farmacia.ufg.br', ig: null },
      'ppgef': { url: 'https://pos.ufg.br/p/pos-graduacao-educacao-fisica-ppgef', ig: null },
      'proef': { url: 'https://pos.ufg.br/p/mestrado-profissional-educacao-fisica-rede-nacional-proef', ig: null },
      'ppgenf': { url: 'https://pos.ufg.br/p/pos-graduacao-enfermagem-ppgenf', ig: null },
      'ppgif': { url: 'https://ppgif.farmacia.ufg.br', ig: null },
      'ppgmtsp': { url: 'https://ppgmtsp.iptsp.ufg.br', ig: null },
      'ppgfnf': { url: 'https://pos.ufg.br/p/pos-graduacao-nanotecnologia-farmaceutica-ppgnanofarma', ig: null },
      'ppgnut': { url: 'https://ppgnut.fanut.ufg.br', ig: 'ppgnut.ufg' },
      'ppgo': { url: 'https://pos.ufg.br/p/programa-pos-graduacao-odontologia-ppgo', ig: null },
      'ppgsc': { url: 'https://pos.ufg.br/p/pos-graduacao-saude-coletiva-ppgsc', ig: null },
      // Ciencias Humanas
      'ppgas': { url: 'https://ppgas.fcs.ufg.br', ig: null },
      'ppgcpri': { url: 'https://pos.ufg.br/p/pos-graduacao-ciencia-politica-ppgcpri', ig: null },
      'ppge': { url: 'https://pos.ufg.br/p/pos-graduacao-educacao-ppge', ig: null },
      'ppgfil': { url: 'https://pos.ufg.br/p/pos-graduacao-filosofia-ppgfil', ig: null },
      'ppgeo': { url: 'https://ppgeo.iesa.ufg.br', ig: null },
      'ppgh': { url: 'https://pos.ufg.br/p/pos-graduacao-historia-ppgh', ig: null },
      'ppgp': { url: 'https://pos.ufg.br/p/pos-graduacao-psicologia-ppgp', ig: null },
      'ppgs': { url: 'https://pos.ufg.br/p/pos-graduacao-sociologia-ppgs', ig: null },
      'profhistoria': { url: 'https://pos.ufg.br/p/pos-graduacao-ensino-historia-profhistoria', ig: null },
      // Engenharias
      'ppgeas': { url: 'https://ppgeas.eeca.ufg.br', ig: null },
      'ppgeec': { url: 'https://ppgeec.emc.ufg.br', ig: null },
      'ppgmec': { url: 'https://ppgmec.emc.ufg.br', ig: null },
      'ppgeq': { url: 'https://ppgeq.quimica.ufg.br', ig: null },
      'ppggecon': { url: 'https://pos.ufg.br/p/pos-graduacao-geotecnia-estruturas-construcao-civil-ppggecon', ig: null },
      // Linguistica, Letras e Artes
      'ppgacv': { url: 'https://pos.ufg.br/p/programa-pos-graduacao-arte-cultura-visual-ppgacv', ig: 'ppgacv' },
      'ppgac': { url: 'https://pos.ufg.br/p/pos-graduacao-artes-cena-ppgac', ig: null },
      'ppgll': { url: 'https://pos.ufg.br/p/pos-graduacao-letras-linguistica-ppgll', ig: null },
      'ppgmus': { url: 'https://ppgmus.em.ufg.br', ig: null },
      // Ciencias Sociais Aplicadas
      'ppgadm': { url: 'https://ppgadm.face.ufg.br', ig: 'ppgadm.ufg' },
      'ppgcont': { url: 'https://ppgcont.face.ufg.br', ig: null },
      'ppgecon': { url: 'https://ppgecon.face.ufg.br', ig: null },
      'ppgdr': { url: 'https://ppgdr.face.ufg.br', ig: null },
      'ppgci': { url: 'https://ppgci.fic.ufg.br', ig: null },
      'ppgcom': { url: 'https://ppgcom.fic.ufg.br', ig: null },
      'ppgda': { url: 'https://pos.ufg.br/p/pos-graduacao-direito-agrario-ppgda', ig: null },
      'ppgdp': { url: 'https://pos.ufg.br/p/pos-graduacao-direito-politicas-publicas-ppgdp', ig: null },
      'ppgpc': { url: 'https://pos.ufg.br/p/pos-graduacao-projeto-cidade-ppgprocidade', ig: null },
      'profiap': { url: 'https://profiap.fct.ufg.br', ig: null },
      // Programas Multidisciplinares
      'ppgciamb': { url: 'https://pos.ufg.br/p/pos-graduacao-ciencias-ambientais-ppgciamb', ig: null },
      'ppgdh': { url: 'https://pos.ufg.br/p/pos-graduacao-direitos-humanos-ppgdh', ig: null },
      'ppgecm': { url: 'https://pos.ufg.br/p/pos-graduacao-educacao-ciencias-matematica-ppgecm', ig: null },
      'ppgeeb': { url: 'https://pos.ufg.br/p/pos-graduacao-ensino-educacao-basica-ppgeeb', ig: null },
      'ppges': { url: 'https://pos.ufg.br/p/pos-graduacao-ensino-na-saude-ppges', ig: null },
      'ppgbb': { url: 'https://pos.ufg.br/p/pos-graduacao-biotenologia-biodiversidade', ig: null },
      'ppgculturas': { url: 'https://pos.ufg.br/p/pos-graduacao-performances-culturais-ppgpc', ig: null },
    },
  },
  2: {
    label: 'Frequente (2-3x/semana)',
    numItems: 30, // v4.4: era 10, agora 30 (auditoria 09/06)
    sites: {
      'ciar': { url: 'https://ciar.ufg.br', ig: 'ciar_ufg' },
      'iac': { url: 'https://iac.ufg.br', ig: null, numItemsOverride: 30 },
      'cerof': { url: 'https://cerof.ufg.br', ig: 'cerofufg', numItemsOverride: 30 },
      'centrocultural': { url: 'https://centrocultural.ufg.br', ig: 'centroculturalufg', numItemsOverride: 30 },
      'face': { url: 'https://face.ufg.br', ig: 'face.ufg' },
      // v4.5.2: FE tem 50 itens no feed — aumentar para 40 para não perder 20
      'fe': { url: 'https://fe.ufg.br', ig: null, numItemsOverride: 40 },
      'fen': { url: 'https://fen.ufg.br', ig: 'fen_ufg' },
      'fanut': { url: 'https://fanut.ufg.br', ig: 'fanutufg' },
      'evz': { url: 'https://evz.ufg.br', ig: 'evzufg' },
      'agro': { url: 'https://agro.ufg.br', ig: 'ea.ufg' },
      'icb': { url: 'https://icb.ufg.br', ig: 'icb.ufg' },
      'if': { url: 'https://if.ufg.br', ig: null },
      'iptsp': { url: 'https://iptsp.ufg.br', ig: 'iptsp_ufg' },
      'emac': { url: 'https://em.ufg.br', ig: 'em.ufg' },
      'direito': { url: 'https://direito.ufg.br', ig: 'direitoufg' },
      'fefd': { url: 'https://fef.ufg.br', ig: 'fefufg' },
      'propessoas': { url: 'https://propessoas.ufg.br', ig: 'propessoas_ufg' },
      'seti': { url: 'https://seti.ufg.br', ig: null },
      'inf': { url: 'https://inf.ufg.br', ig: 'infufg' },
      'emc': { url: 'https://emc.ufg.br', ig: 'emc_ufg' },
      'eeca': { url: 'https://eeca.ufg.br', ig: 'eeca_ufg' },
      'ime': { url: 'https://ime.ufg.br', ig: 'ime_ufg' },
      // v4.5.2: farmacia SEMPRE retorna text=0 (só summary) — forçar detail fetch
      'farmacia': { url: 'https://farmacia.ufg.br', ig: null, forceDetailFetch: true },
      'idiomassemfronteiras': { url: 'https://idiomassemfronteiras.sri.ufg.br', ig: null },
      'csa': { url: 'https://csa.goias.ufg.br', ig: 'campusgoiasufg' },
      'uaech': { url: 'https://uaech.goias.ufg.br', ig: null },
      // v4.6.0: Campus Cidade Ocidental (IIG) - 6 cursos EAD, alto potencial
      'cidadeocidental': { url: 'https://cidadeocidental.ufg.br', ig: 'campusocidentalufg' },
      'co': { url: 'https://co.ufg.br', ig: 'campusocidentalufg' },
      // v4.6.0: Midias UFG
      'jornal-ufg': { url: 'https://jornal.ufg.br', ig: null },
      'tvufg': { url: 'https://tvufg.org.br', ig: 'tvufg' },
      'radio-ufg': { url: 'https://radio.ufg.br', ig: null },
      'revistas-ufg': { url: 'https://revistas.ufg.br', ig: null },
      // v4.6.0: Estruturas PRPI/POS vinculadas
      'crti': { url: 'https://crti.ufg.br', ig: null },
      'cpcbio': { url: 'https://cpcbio.prpi.ufg.br', ig: null },
      'lamcad': { url: 'https://lamcad.ufg.br', ig: null },
      'labmic': { url: 'https://labmic.ufg.br', ig: null },
      'uc': { url: 'https://uc.ufg.br', ig: null },
      'hospitalveterinario': { url: 'https://hospitalveterinario.evz.ufg.br', ig: null },
      'museu': { url: 'https://museu.ufg.br', ig: 'museu_ufg' },
      'planetario': { url: 'https://planetario.ufg.br', ig: 'planetario.ufg' },
    },
  },
  3: {
    label: 'Semanal',
    numItems: 20, // v4.4: era 6, agora 20 (auditoria 09/06)
    sites: {
      'fav': { url: 'https://fav.ufg.br', ig: 'fav_ufg' },
      'fcs': { url: 'https://fcs.ufg.br', ig: 'fcs_ufg' },
      'letras': { url: 'https://letras.ufg.br', ig: 'letras.ufg' },
      // v4.5.3 (2026-07-09): Centro de Linguas UFG (sub-dominio letras) - cursos de idiomas
      'cl': { url: 'https://cl.letras.ufg.br', ig: 'centrodelinguasflufg' },
      'fic': { url: 'https://fic.ufg.br', ig: 'fic.ufg' },
      'fct': { url: 'https://fct.ufg.br', ig: 'campusaparecidaufg' },
      'medicina': { url: 'https://medicina.ufg.br', ig: null },
      'odonto': { url: 'https://odonto.ufg.br', ig: 'odontologia.ufg' },
      // v4.5.2: quimica tem 60 itens no feed — aumentar para 30 (não perder 40)
      'quimica': { url: 'https://quimica.ufg.br', ig: 'iqufg', numItemsOverride: 30 },
      // v4.5.2: museu tem 50 itens no feed — aumentar para 30
      'museu': { url: 'https://museu.ufg.br', ig: 'museu_ufg', numItemsOverride: 30 },
      'planetario': { url: 'https://planetario.ufg.br', ig: 'planetario.ufg' },
      'editora': { url: 'https://editora.ufg.br', ig: 'editora.ufg' },
      'bc': { url: 'https://bc.ufg.br', ig: 'sibi_ufg' },
      'proad': { url: 'https://proad.ufg.br', ig: null },
      'secplan': { url: 'https://secplan.ufg.br', ig: null },
      'ouvidoria': { url: 'https://ouvidoria.ufg.br', ig: null },
      // v4.5.2: cepae SEMPRE retorna text=0 — forçar detail fetch
      'cepae': { url: 'https://cepae.ufg.br', ig: 'cepae_ufg', forceDetailFetch: true },
      'filosofia': { url: 'https://filosofia.ufg.br', ig: 'fafilufg' },
      'iesa': { url: 'https://iesa.ufg.br', ig: 'iesaufg' },
      'campusgoias': { url: 'https://goias.ufg.br', ig: 'campusgoiasufg' },
      'historia': { url: 'https://historia.ufg.br', ig: null },
      'sin': { url: 'https://sin.ufg.br', ig: null },
      'sdh': { url: 'https://sdh.ufg.br', ig: 'sdh_ufg' },
      // v4.5.2: seinfra SEMPRE retorna text=0 — forçar detail fetch
      'seinfra': { url: 'https://seinfra.ufg.br', ig: null, forceDetailFetch: true },
      'cefis': { url: 'https://firminopolis.ufg.br', ig: 'firminopolis_ufg' },
      'cpa': { url: 'https://cpa.secplan.ufg.br', ig: null },
      'cidarq': { url: 'https://cidarq.ufg.br', ig: null },
      'cegraf': { url: 'https://cegraf.ufg.br', ig: null },
      'hospitalveterinario': { url: 'https://hospitalveterinario.evz.ufg.br', ig: null },
      'seacult': { url: 'https://seacult.ufg.br', ig: null },
    },
  },
};

// ============================================================
// CLASSIFIER (do publisher — melhor detecção de prazos)
// ============================================================

const MONTHS_PT = {
  'janeiro': 1, 'fevereiro': 2, 'marco': 3, 'março': 3, 'abril': 4,
  'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
  'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
};

const INCLUDE_TERMS = [
  'edital', 'chamada', 'processo seletivo', 'inscricao', 'inscricoes', 'selecao',
  'bolsa', 'bolsas', 'monitoria', 'estagio', 'vagas', 'curso', 'oficina',
  'palestra', 'seminario', 'congresso', 'evento', 'extensao', 'voluntariado',
  'pibic', 'pivic', 'probec', 'prpi', 'pesquisa', 'iniciacao cientifica',
  'mobilidade', 'calendario academico', 'prazo', 'oportunidade', 'concurso',
  'exposicao', 'concerto', 'espetaculo', 'mostra', 'festival',
  'mestrado', 'doutorado', 'pos-graduacao', 'suficiencia', 'idioma',
  'auxilio', 'apoio financeiro', 'permanencia', 'moradia', 'alimentacao',
  'capacitacao', 'hackaton', 'empreendedorismo', 'inovacao',
  'concurso publico', 'professor substituto', 'professor efetivo',
  'convocacao', 'chamada publica', 'credenciamento',
  'olimpiada', 'formacao', 'residencia', 'pet',
  'especializacao', 'concurso literario', 'vestibular',
  'premio', 'premiacao', 'maratona', 'intercambio',
  // v4.5.1 (2026-06-10): Termos adicionados após auditoria de sites
  'mudanca de grau', 'homologacao', 'publicado edital', 'publicada chamada',
  'prorrogacao', 'prorrogadas', 'retificacao', 'retificado',
  'abertas inscricoes', 'inscricoes abertas', 'inscricoes prorrogadas',
  'siu', 'sisu', 'pronera', 'probec', 'serex', 'csl', 'oeu', 'hackathon',
  'coreme', 'residencia medica', 'residencia multiprofissional',
  'ppg', 'pos graduacao', 'pet saude digital',
  // Idiomas sem Fronteiras
  'isf', 'idiomas sem fronteiras',
  // CICSIC, PIlC, etc
  'cicsic', 'pilc', 'mercosul', 'augm', 'pila',
  // Auxílios PRAE
  'subsidio', 'ru', 'restaurante universitario', 'moradia estudantil',
  // PRPI
  'fapeg', 'capes', 'cnpq',
  // Cotações
  'sisu+', 'sisu mais',
  // CONPEEX
  'conpeex', 'seminario de extensao',
  // v4.5.2 (2026-06-11): Termos adicionados após auditoria completa Tier 1+2+3
  'concurso professor efetivo', 'concurso professor substituto',
  'concurso publico para professor', 'selecao para professor',
  'webnario', 'webinar', 'live', 'transmissao ao vivo',
  'mutirao', 'acao voluntaria', 'trabalho voluntario',
  'programacao completa', // museu.ufg.br (sinal forte de evento cultural)
  'espaco das profissoes', // FF/medicina/odonto (evento institucional)
  'matricula', 'matriculas', 'matricula online',
  'segunda chamada', 'lista de espera',
];

const EXCLUDE_TERMS = [
  'nota de pesar', 'luto oficial', 'visita institucional', 'reuniao institucional',
  'homenagem', 'posse', 'balanco de gestao', 'relatorio de gestao',
  'eleicao para direcao', 'eleicao para diretoria', 'chapa homologada',
  // v4.5.1 (2026-06-10): REMOVIDOS 'resultado final' e 'resultado preliminar' e 'homologacao das inscricoes'
  // porque podem ser parte de um resultado de processo seletivo que importa.
  // A lógica de relevância fica no PUBLISH (dedup-kino + classifyItem), não no EXCLUDE.
  'convocacao de aprovados', 'avaliacao de desempenho', 'gabinete',
  'audiencia publica', 'prestacao de contas',
  // v4.2.1: Biographical/profile news (NOT opportunities)
  // NOTE: has() uses normalizeText() which strips accents,
  // so we provide BOTH accented and unaccented versions
  'trajetoria academica', 'trajetoria profissional',
  'perfil do servidor', 'perfil da servidora', 'servidor em destaque',
  'historia de vida', 'conheca o servidor',
  'entrevista com o professor', 'entrevista com a professora',
  'seguir a carreira academica', 'decidiu seguir a carreira',
  'construiu uma trajetoria', 'trajetoria dedicada',
  'se formou no instituto', 'formada no instituto', 'formado no instituto',
  // v5.0: Anti-institutional fluff (press releases, diplomatic trips, recognitions)
  'prospecta acordos', 'marcam presenca', 'marcou presenca',
  'reconhece os destaques', 'cerimonia reconhece', 'homenageia',
  'esta na china', 'estao na china', 'vice-reitora e professora',
  'expoente nacional', 'recebe expoente', 'recebeu a visita',
  'visita do embaixador', 'visita da embaixadora',
  'fortalece parceria com', 'estreita relacoes',
  'recebe representantes', 'recebeu representantes',
  'agenda de cooperacao', 'dialogo institucional',
  // v4.4.1: Eventos institucionais que não são oportunidades reais
  'inaugura o', 'inaugura nova', 'inauguracao de',
  'fecham parceria', 'fecha parceria', 'firmam parceria',
  'acolhida 2026', 'acolhida de ingressantes',
  'recebe novos estudantes', 'recebe alunos premiados',
  // v4.5.2 (2026-06-11): Defesas acadêmicas (rotina, não evento público)
  // Casos reais: "Defesa de dissertação de mestrado do discente X", "Exame de qualificação de doutorado do discente Y"
  // Não viram post — são de interesse restrito à banca/PPG
  'defesa de disserta', 'defesa de tese', 'exame de qualifica', 'defesa de memorial',
  'qualifica[çc][ãa]o de doutorado', 'qualifica[çc][ãa]o de mestrado',
  'bancas de defesa', 'banca examinadora',
  // v4.5.2 (2026-06-11): Releases de imprensa / notícias institucionais (NÃO oportunidades)
  // Casos reais: "Pesquisas na UFG pensam soluções para X", "UFG recebe Y expoente", "Aplicativo X destaque"
  // Diferem de eventos (que têm data + público) — são reportagens sobre algo que JÁ aconteceu
  'pesquisas na ufg pensam', 'pesquisas na ufg apontam', 'pesquisas na ufg mostram',
  'ufg recebe alunos', 'ufg recebe estudantes', 'ufg recebe pesquisador',
  'aplicativo.*[eé] destaq', 'aplicativo.*[eé] venced', 'app.*[eé] destaque',
  'jornal ufg vence', 'jornal ufg [eé] finalista',
  'docente da ufg fica', 'professora da ufg [eé]',
  'estudante da ufg vence', 'estudantes da ufg vencem', 'aluno da ufg vence', 'aluna da ufg vence',
  'estudante da ufg [eé]', 'aluno da ufg conquista', 'aluna da ufg conquista',
  'ufg [eé] reconhecida', 'ufg [eé] destaque', 'ufg ocupa posi[çc][ãa]o',
  'ufg est[aá] entre as', 'ufg figura entre', 'ufg [eé] listada',
  'ufg lan[çc]a guia', 'ufg lan[çc]a plataforma', 'ufg lan[çc]a manual', 'ufg lan[çc]a campanha',
  'ufg divulga guia', 'ufg divulga manual', 'ufg divulga plataforma',
  'ufg adere ao sisu', 'ufg adere ao sisu+', 'ufg adere [aà]',
  'ufg [eé] selecionada', 'ufg [eé] escolhida', 'ufg conquista',
  'ufg ganha pr[eê]mio', 'ufg vence pr[eê]mio', 'ufg recebe pr[eê]mio',
  'pr[eê]mio nacional', 'pr[eê]mio internacional',
  'vice-reitora e professora', 'vice-reitor participa', 'reitora participa',
  'centro de mem[oó]ria', 'museu da ufg', 'museu exp[oõ]e',
  // v4.5.2 (2026-06-11): Avisos institucionais / calendário (NÃO evento nem oportunidade)
  'confira os cursos participantes', 'confira os cursos do', 'confira o cronograma',
  'confira o edital completo', 'confira o resultado', 'confira a lista',
  'enade 2026', 'enade 2025', 'enade 2024',
  'calend[áa]rio de cola[çc][ãa]o', 'calend[áa]rio acad[eê]mico de',
  'cronograma de aul', 'calend[áa]rio de aul',
  'cronograma.*pr[oó]ximo', 'pr[oó]ximas aulas',
  'prazo de matr[íi]cula', 'matr[íi]cula online', 'matr[íi]cula presencial',
  // v4.5.2 (2026-06-11): Eventos internos / workshops fechados
  'reuni[ãa]o de professores', 'reuni[ãa]o de servidor', 'reuni[ãa]o do conselho',
  'reuni[ãa]o do n[úu]cleo', 'encontro de servidores',
  'capacita[çc][ãa]o interna', 'treinamento interno', 'forma[çc][ãa]o interna',
  // v4.5.2 (2026-06-11): Comunicados / avisos
  'comunicado de suspens[ãa]o', 'comunicado oficial', 'aviso importante',
  'aten[çc][ãa]o servidor', 'aten[çc][ãa]o comunidade', 'aten[çc][ãa]o docente',
  'feriado nacional', 'ponto facultativo', 'recesso administrativo',
];

// v4.5.2 (2026-06-11): HARD_EXCLUDE
// Itens que NUNCA devem virar post, mesmo se tiverem "edital" ou "bolsa" no texto.
// Casos reais: "Defesa de dissertação" (rotina, não é evento público),
// "Pesquisas na UFG pensam" (release de imprensa, não oportunidade),
// "Confira os cursos participantes do Enade" (aviso institucional).
// Diferem de EXCLUDE_TERMS: são absolutos, sem exceção por strong signal.
const HARD_EXCLUDE_PATTERNS = [
  // Defesas acadêmicas
  /defesa de (disserta[çc][ãa]o|tese|memorial)/i,
  /exame de qualifica[çc][ãa]o/i,
  /bancas? de defesa/i,
  /banca examinadora/i,
  /qualifica[çc][ãa]o de (doutorado|mestrado)/i,
  // Releases de imprensa / notícias institucionais
  /pesquisas na ufg pensam/i, /pesquisas na ufg apontam/i, /pesquisas na ufg mostram/i,
  /aplicativo.*[eé] destaq/i, /aplicativo.*[eé] venced/i, /app.*[eé] destaq/i,
  /aplicativo.*lan[çc]ado/i, /aplicativo.*conquist/i,
  /docente da ufg fica em/i, /professora da ufg [eé] premiad/i, /professor da ufg [eé] premiad/i,
  /estudante da ufg vence/i, /estudantes da ufg vencem/i,
  /aluno da ufg vence/i, /aluna da ufg vence/i,
  /aluno da ufg [eé] premiad/i, /aluna da ufg [eé] premiad/i,
  /aluno da ufg conquista/i, /aluna da ufg conquista/i,
  /estudante da ufg conquista/i, /estudantes da ufg conquistam/i,
  /ufg [eé] reconhecida/i, /ufg [eé] destaque/i, /ufg [eé] refer[êe]ncia/i,
  /ufg est[aá] entre as/i, /ufg figura entre/i, /ufg [eé] listada/i, /ufg [eé] citada/i,
  /ufg lan[çc]a guia/i, /ufg lan[çc]a plataforma/i, /ufg lan[çc]a manual/i, /ufg lan[çc]a campanha/i,
  /ufg divulga guia/i, /ufg divulga manual/i, /ufg divulga plataforma/i,
  /ufg adere ao sisu/i, /ufg adere ao sisu\+/i, /ufg adere [aà]/i,
  /ufg [eé] selecionada/i, /ufg [eé] escolhida/i, /ufg conquista/i,
  /ufg ganha pr[eê]mio/i, /ufg vence pr[eê]mio/i, /ufg recebe pr[eê]mio/i,
  /ufg na china/i, /ufg nos estados unidos/i, /ufg na europa/i,
  /vice-reitora e professora/i, /vice-reitor participa/i, /reitora participa/i,
  /reitora da ufg/i, /reitor da ufg/i,
  /se despede do diretor/i, /assumem? a r[aá]dio ufg/i,
  /avan[çc]a nas discuss[oõ]es sobre novo centro/i,
  /plataforma de gest[aã]o.*ser[aá] apresentada/i,
  /hist[oó]ria de luta estudantil/i,
  /novas regras.*atendimento/i,
  /subs[ií]dio no ru/i,
  // Avisos institucionais / calendário
  /confira os cursos participantes/i, /confira os cursos do/i,
  /confira o cronograma/i, /confira o resultado/i, /confira a lista/i,
  /enade 202[0-9]/i,
  /calend[áa]rio de cola[çc][ãa]o/i, /calend[áa]rio acad[eê]mico de/i,
  /cronograma de aul/i, /calend[áa]rio de aul/i,
  /cronograma.*pr[oó]ximo/i, /pr[oó]ximas aulas/i,
  /prazo de matr[íi]cula/i, /matr[íi]cula online/i, /matr[íi]cula presencial/i,
  // Eventos internos / workshops fechados
  /reuni[ãa]o de professores/i, /reuni[ãa]o de servidor/i, /reuni[ãa]o do conselho/i,
  /reuni[ãa]o do n[úu]cleo/i, /encontro de servidores/i,
  /capacita[çc][ãa]o interna/i, /treinamento interno/i, /forma[çc][ãa]o interna/i,
  /oficina interna/i, /workshop interno/i,
  // Comunicados
  /comunicado de suspens[ãa]o/i, /comunicado oficial/i, /aviso importante/i,
  /aten[çc][ãa]o servidor/i, /aten[çc][ãa]o comunidade/i, /aten[çc][ãa]o docente/i,
  /feriado nacional/i, /ponto facultativo/i, /recesso administrativo/i,
  // Mutirão
  /^mutir[ãa]o/i, /mutir[ãa]o de limpeza/i, /mutir[ãa]o de organiza/i,
  // Eleição interna
  /elei[çc][ãa]o para dire[çc][ãa]o/i, /elei[çc][ãa]o para coordena/i,
  /chapa homologada/i, /posse de/i, /posse da nova dire/i,
  // Notícias de bolsas/alunos premiados
  /ufg premia estudantes/i, /ufg premia alunos/i,
  /prê[m]mio.*concedido/i, /prê[m]mio.*recebido/i,
];

const OPP_SIGNALS = ['edital', 'chamada', 'processo seletivo', 'bolsa', 'monitoria', 'estagio', 'vagas', 'selecao', 'pibic', 'pivic', 'probec', 'pesquisa', 'fapeg', 'mobilidade', 'concurso', 'convocacao', 'credenciamento', 'hackaton', 'empreendedorismo', 'vestibular', 'residencia', 'pet', 'premio'];
const EVT_SIGNALS = ['evento', 'curso', 'oficina', 'palestra', 'seminario', 'congresso', 'mostra', 'festival', 'exposicao', 'concerto', 'espetaculo', 'capacitacao', 'olimpiada', 'suficiencia', 'formacao', 'especializacao', 'concurso literario', 'feira', 'encontro'];

function normalizeText(t) {
  if (!t) return '';
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text, term) {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;

  // Short institutional lexemes must be whole tokens. Without this boundary,
  // PET matched "petiscos" and RU matched words such as "frutas".
  if (normalizedTerm.length <= 3 && !normalizedTerm.includes(' ')) {
    return normalizedText.split(' ').includes(normalizedTerm);
  }

  return normalizedText.includes(normalizedTerm);
}

function isActionableUrl(rawUrl, label = '') {
  const url = String(rawUrl || '').trim();
  const normalizedLabel = normalizeText(label);
  if (!url) return false;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (host === 'forms.gle' || host.startsWith('forms.') || host === 'typeform.com' || host.endsWith('.typeform.com') ||
        host === 'even3.com.br' || host.endsWith('.even3.com.br') || host === 'sympla.com.br' || host.endsWith('.sympla.com.br') ||
        host === 'doity.com.br' || host.endsWith('.doity.com.br') || host === 'eventbrite.com' || host.endsWith('.eventbrite.com') ||
        ((host === 'docs.google.com' || host === 'google.com') && pathname.startsWith('/forms/'))) return true;
    if (/(?:^|\/)(?:inscri(?:cao|coes)|candidatura|apply|submissao|matricula)(?:[/?#-]|$)/i.test(pathname)) return true;
  } catch (_) {}
  return /\b(?:formulario|formularios|inscricao|inscricoes|candidatura|submissao|matricula)\b/.test(normalizedLabel) &&
    /^https?:\/\//i.test(url);
}

function collectActionEvidence(text, html, linkUrl, relevantLinks) {
  const evidence = [];
  const seen = new Set();
  const add = (type, value, source, label = '') => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) return;
    const key = `${type}:${normalizedValue.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    evidence.push({ type, value: normalizedValue, source, label: String(label || '').trim() });
  };

  const combined = `${text || ''} ${html || ''}`;
  const normalizedCombined = normalizeText(combined);
  const hasEmailActionContext = /\b(?:inscricao|candidatura|submissao|matricula|envie|encaminhe)\b.{0,100}\b(?:email|e mail)\b|\b(?:email|e mail)\b.{0,100}\b(?:inscricao|candidatura|submissao|matricula)\b/.test(normalizedCombined);
  const urlPattern = /(?:https?:\/\/|mailto:)[^\s"'<>]+/gi;
  for (const match of combined.match(urlPattern) || []) {
    const clean = match.replace(/[),.;]+$/, '');
    if (clean.startsWith('mailto:') && !hasEmailActionContext) continue;
    if (isActionableUrl(clean)) add(clean.startsWith('mailto:') ? 'email' : 'application_url', clean, 'content');
  }

  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  if (hasEmailActionContext) {
    for (const email of combined.match(emailPattern) || []) add('email', email, 'content');
  }

  if (isActionableUrl(linkUrl)) add('application_url', linkUrl, 'link_url');

  if (relevantLinks && typeof relevantLinks === 'object') {
    for (const [group, links] of Object.entries(relevantLinks)) {
      if (!Array.isArray(links)) continue;
      for (const link of links) {
        const linkLabel = `${group} ${link?.label || ''}`;
        const isEmail = /^mailto:/i.test(String(link?.url || ''));
        const hasApplicationLabel = /\b(?:formulario|formularios|inscricao|inscricoes|candidatura|submissao|matricula)\b/.test(normalizeText(linkLabel));
        if ((!isEmail || hasApplicationLabel) && isActionableUrl(link?.url, linkLabel)) {
          add(group === 'formularios' ? 'form' : 'application_url', link.url, 'relevant_links', link.label || group);
        }
      }
    }
  }

  return evidence;
}

function fetchUrl(url) {
  // S37/S52 fix: validar esquema HTTP(S) antes de chamar curl
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    return execSync(`curl -sL --max-time 15 '${url.replace(/'/g, "'\\''")}' 2>/dev/null`, {
      timeout: 18000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024
    });
  } catch (e) {
    return '';
  }
}

function fetchJson(url) {
  try {
    const raw = fetchUrl(url);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function cleanRawText(text) {
  // HARDENING 2026-06-04: Remove lixo do portal UFG (HTML residual)
  let cleaned = text;
  
  // Remove portal header/footer junk
  cleaned = cleaned.replace(/Portal do Governo Brasileiro\s*\n?\s*Atualize sua Barra de Governo\s*/gi, '');
  cleaned = cleaned.replace(/Tweet\s+WhatsApp\s+Facebook\s*/gi, '');
  cleaned = cleaned.replace(/Categorias:\s*Notícias\s*Listar Todas\s*Voltar\s*/gi, '');
  cleaned = cleaned.replace(/Escolha o site e o local onde quer compartilhar\s*Nenhum site disponível para compartilhar\s*Fechar\s*/gi, '');
  
  // Remove multiple "Confira o edital" / "Clique aqui" / "Saiba mais" / "Conheça a Pós UFG" boilerplate
  cleaned = cleaned.replace(/Confira o edital completo\s*ACESSE AQUI\s*/gi, '');
  cleaned = cleaned.replace(/Clique aqui para acessar o edital\.?\s*/gi, '');
  cleaned = cleaned.replace(/Saiba mais sobre o [A-Z]+\s*/gi, '');
  cleaned = cleaned.replace(/Interessado em outros processos seletivos[^.]+?\s*/gi, '');
  cleaned = cleaned.replace(/Conheça a Pós UFG!\s*/gi, '');
  
  // Remove trailing URLs without context
  cleaned = cleaned.replace(/\nhttps?:\/\/[^\s]+\n?$/gm, '');
  
  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned.trim();
}

// ============================================================
// v5.0: ENTITY EXTRACTION FOR DEDUP TRACKING
// ============================================================

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// F1 (2026-07-06): canonical URL parser — usado pelo content_hash e dedup.
// Normaliza formatos diferentes do mesmo evento pra mesma chave:
//   /events?event=39173        → ufg.br/events/39173
//   /e/39173-slug-do-evento    → ufg.br/events/39173
// Replicado em publish_auto_v5.js, dedup-kino.js e cleanup-dup-2026-07-06.js —
// manter as 4 versões sincronizadas.
function canonicalUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    const path = (u.pathname || '').replace(/\/$/, '');
    let eventId = u.searchParams.get('event');
    if (!eventId) {
      const m = path.match(/\/e\/(\d+)(?:-|$)/);
      if (m) eventId = m[1];
    }
    if (eventId && /^\d+$/.test(eventId)) {
      return `${host}/events/${eventId}`;
    }
    return (host + path).toLowerCase();
  } catch {
    let s = (url || '').toLowerCase().split('?')[0].split('#')[0].replace(/\/$/, '');
    return s;
  }
}

function extractEntities(title, description, linkUrl = '') {
  const combined = `${title || ''} ${description || ''}`;
  
  // Extract acronyms (3+ uppercase letters)
  const acronyms = [...new Set((combined.match(/\b[A-ZÀ-Ú]{3,}\b/g) || [])
    .filter(a => !['COM', 'PARA', 'DOS', 'DAS', 'QUE', 'NÃO', 'MAIS', 'PELO', 'PELA', 'SEU', 'SUA'].includes(a)))];
  
  // Extract event names
  const eventMatches = [];
  const eventPatterns = [
    /(\d{1,2}[º°])?\s*(Congresso|Simpósio|Encontro|Seminário|Conferência|Jornada|Fórum|Colóquium|Symposium)\s+(?:Internacional|Nacional|Regional\s+)?(?:de|do|da|das|dos|sobre|em)\s+([A-ZÀ-Ú][\w\s]{4,80}?)(?:\s+[-–]|\s*\(|$|\.|\s+[-–])/gi,
    /Programa\s+([A-ZÀ-Ú][\w\s]{3,60}?)(?:\s*[-–:(]|\s+oferecer|\s+lanç|\s+abriu|\s+divulga|\s+está|\s*torna|$)/gi,
    /Edital\s+(?:[nN][º°]\s*)?(\d{1,4}\/\d{4})/gi,
  ];
  for (const pattern of eventPatterns) {
    let m;
    while ((m = pattern.exec(combined)) !== null) {
      const name = (m[3] || m[2] || m[1] || '').trim();
      if (name.length > 3) eventMatches.push(name);
    }
  }
  // Also extract from title directly: "2º Simpósio Internacional de Genética e Biologia de Fungos"
  // Fallback pattern for "Xº [tipo] de [nome]"
  const titlePattern = /(\d{1,2}[º°])?\s*(Congresso|Simpósio|Encontro|Seminário|Conferência|Jornada|Fórum|Colóquium|Symposium|Programa|Edital)\s+(?:Internacional|Nacional|Regional\s+)?(?:de|do|da|das|dos|sobre|em|para|com)\s+([A-ZÀ-Ú][\w\s]{4,80}?)\s*(?:[-–]|$|\.|\(|\s+[-–])/gi;
  let tm;
  while ((tm = titlePattern.exec(title || '')) !== null) {
    const name = tm[3]?.trim();
    if (name && name.length > 3 && !eventMatches.some(e => e.toLowerCase().includes(name.toLowerCase().slice(0, 8)))) {
      eventMatches.push(name);
    }
  }
  
  // Extract keywords (2+ occurrences, filtered)
  const stopWords = new Set(['para', 'com', 'dos', 'das', 'uma', 'que', 'por', 'não', 'como', 'mais', 'pelo', 'pela', 'seu', 'sua', 'são', 'ser', 'ter', 'este', 'esta', 'isso', 'aquilo']);
  const words = combined.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
  const wordFreq = {};
  words.forEach(w => wordFreq[w] = (wordFreq[w] || 0) + 1);
  const keywords = Object.entries(wordFreq).filter(([_, c]) => c >= 2).map(([w]) => w).slice(0, 30);
  
  // Content hash for exact dedup
  // F1 (2026-07-06): incluir canonicalUrl(linkUrl) no hash garante que o mesmo
  // evento com descrição variando entre scrapes ainda bate como duplicata.
  // Antes era só title+description → hash mudava a cada run (description tem
  // data/hora/contadores), produzindo posts duplicados diários.
  const hashSeed = `${combined} ${canonicalUrl(linkUrl)}`;
  const normalized = hashSeed.toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúüç]/g, ' ').replace(/\s+/g, ' ').trim();
  const contentHash = simpleHash(normalized);
  
  // Extract edition numbers
  const editionMatch = combined.match(/(\d{1,2})[º°]\s*(edi[cç][aã]o|conpeex|semanas?\s+da)/i);
  const edition = editionMatch ? editionMatch[1] : null;
  
  return {
    entities: [...new Set([...acronyms, ...eventMatches, ...keywords])].slice(0, 25),
    acronyms,
    eventName: eventMatches[0] || null,
    edition,
    keywords,
    contentHash,
  };
}

function extractText(html) {
  if (!html) return '';
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

function extractImage(html, itemImage) {
  if (itemImage) return itemImage;
  if (!html) return '';
  const imgMatch = html.match(/<img[^>]+src="([^"]+\.(png|jpg|jpeg|webp))"/i) ||
    html.match(/url\('([^']+\.(png|jpg|jpeg|webp))'\)/i);
  return imgMatch ? imgMatch[1] : '';
}

// v4.4 P0-BugFix-4: Padrões de imagem institucional/oficial a serem bloqueados
// (templates de ofício, capa genérica, etc — apareceu no caso Fulbright + INF)
// v4.4.1: Adicionado suporte a URL-encoded (Capa_para_Of%C3%ADcios.png) + com/sem underline/space
// v4.4.5 (2026-07-02): Adicionados padrões de ícones sociais (Twitter/X, Facebook)
// que apareciam como og:image errada em eventos ufg.br/events?event=NNNNN
// (template UFG não tem og:image específica, scraper pegava IconeX.png do footer)
const decodeUrlSafe = (s) => decodeURIComponent(s || '').toLowerCase();
const INSTITUTIONAL_IMAGE_PATTERNS = [
  /capa_para_of[íi]cios/i,
  /capa[_\s-]para[_\s-]of[íi]cios/i,
  /modelo[_\s-]?of[íi]cio/i,
  /template[_\s-]?of[íi]cio/i,
  /of[íi]cio[_\s-]circular/i,
  /capa[_\s-]generica/i,
  /generic[_\s-]cover/i,
  /logo[_\s-]institucional/i,
  // URL-encoded variants
  /capa_para_of%c3%adcios/i,
  /modelo_of%c3%acio/i,
  /template_of%c3%acio/i,
  /of%c3%acio_circular/i,
  // Decoded patterns (work on decoded URL too)
  /capa[_\s-]?para[_\s-]?oficios/i,
  /modelo[_\s-]?oficio/i,
  /template[_\s-]?oficio/i,
];

// v4.4.5 (2026-07-02): Ícones sociais e assets do template UFG que aparecem
// na header/footer mas NÃO são do evento em si.
// Quando ufg.br/events?event=NNNNN retorna HTML, o scraper pegava a PRIMEIRA
// <img src="...">, que era IconeX.png (Twitter) do footer da UFG.
const BADGE_ICON_PATTERNS = [
  /iconex\.png/i,                       // Twitter/X logo do CMS UFG
  /ic-twitter/i,                        // Twitter icon SVG variant
  /ic-facebook/i,
  /ic-instagram/i,
  /ic-youtube/i,
  /ic-linkedin/i,
  /ic-whatsapp/i,
  /twitter\.com\//i,                    // URLs com path twitter.com
  /x\.com\//i,                          // URLs com path x.com (Twitter rebranding)
  /twimg\.com\//i,                      // CDN de imagens do Twitter
  /facebook\.com\/plugins/i,           // widgets de Facebook
  /logo[-_]?(?:ufg|usp|unicamp)/i,     // logos institucionais UFG/USP/Unicamp
  /selo[-_]?(?:oficial|certificado)/i,
  /favicon/i,                           // favicons não devem ser capa
  // Template UFG weby CMS
  /\/assets\/ufg\d?\//i,               // /assets/ufg2/ etc
  /\/weby\/assets\//i,
  // ATENCAO: so bloqueia /up/N/i/ (icons, 34x34) e NAO /up/N/o/ (originais reais).
  // cf. P0-A (2026-06-12) no cadu-curador: /up/N/o/ sao originais, /up/N/i/ sao icons.
  /\/weby\/up\/\d+\/i\//i,             // /weby/up/N/i/ icons (Twitter, etc)
];

function isInstitutionalImage(url) {
  if (!url) return false;
  const lower = String(url).toLowerCase();
  if (INSTITUTIONAL_IMAGE_PATTERNS.some(p => p.test(lower))) return true;
  if (BADGE_ICON_PATTERNS.some(p => p.test(lower))) return true;
  // Also check the decoded form
  try {
    const decoded = decodeUrlSafe(url);
    if (INSTITUTIONAL_IMAGE_PATTERNS.some(p => p.test(decoded))) return true;
    if (BADGE_ICON_PATTERNS.some(p => p.test(decoded))) return true;
  } catch (_) {}
  return false;
}

function normalizeImageUrl(raw, baseUrl) {
  try {
    const clean = String(raw || '').replace(/&amp;/g, '&').trim();
    if (!clean) return '';
    // P0-A (2026-06-12): troca /up/[N]/l/ por /up/[N]/o/ no CMS UFG.
    // O nome "/l/" é contra-intuitivo — é THUMBNAIL, não large.
    const upgraded = normalizeCmsUrl(clean);
    const url = new URL(upgraded, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return '';
    if (/\.svg(?:$|[?#])/i.test(url.pathname)) return '';
    if (isInstitutionalImage(upgraded)) return ''; // v4.4
    return url.toString();
  } catch (_) {
    return '';
  };
}

function extractImages(html, baseUrl, primary) {
  const urls = [];
  const add = (value) => {
    const url = normalizeImageUrl(value, baseUrl);
    if (url && !urls.includes(url)) urls.push(url);
  };
  add(primary);
  if (!html) return urls;
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
    /<img[^>]+src=["']([^"']+\.(?:png|jpe?g|webp)(?:\?[^"']*)?)["']/gi,
    /url\(["']?([^"')]+\.(?:png|jpe?g|webp)(?:\?[^"')]+)?)["']?\)/gi,
  ];
  // v4.4 P0-BugFix-4: filtrar imagens institucionais
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const candidate = match[1];
      if (isInstitutionalImage(candidate)) continue; // skip
      add(candidate);
    }
  }
  return urls.slice(0, 5);
}

function extractPdfLinks(html) {
  const pdfs = [];
  const regex = /href="([^"]+\.pdf)"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (!match[1].startsWith('/')) pdfs.push(match[1]);
  }
  // dedup
  return [...new Set(pdfs)].slice(0, 5);
}

// ============================================================
// EXTRACT RELEVANT LINKS — formularios, editais, paginas oficiais
// ============================================================
// Identifica links da pagina que sao uteis para o post:
// - Formularios (Google Forms, Typeform, forms.uFG, etc)
// - Editais em PDF
// - Paginas oficiais do programa/curso
// - Links de "inscricao", "edital", "processo seletivo"
// Saida: { formularios: [], editais: [], paginasOficiais: [] }
// ============================================================
function extractRelevantLinks(html, baseUrl) {
  if (!html) return { formularios: [], editais: [], paginasOficiais: [], outros: [] };
  
  const formularios = [];
  const editais = [];
  const paginasOficiais = [];
  const outros = [];
  const seen = new Set();
  
  // v4.3: Extrair o BLOCO DE CONTEUDO PRINCIPAL (entre o titulo e o rodape)
  // para evitar pegar links de menu/sidebar. Procura o inicio do artigo.
  let contentStart = 0;
  const articleStart = html.indexOf('class="noticia"');
  if (articleStart > 0) contentStart = articleStart;
  const mainStart = html.indexOf('<article');
  if (mainStart > 0) contentStart = Math.max(contentStart, mainStart);
  // Tambem: posicao do titulo (h1) é um bom comeco
  const h1Start = html.indexOf('<h1');
  if (h1Start > 0) contentStart = Math.max(contentStart, h1Start);
  
  const contentHtml = html.slice(contentStart);
  
  // Regex para extrair todos os <a href="...">label</a> APENAS do bloco de conteudo
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(contentHtml)) !== null) {
    const url = match[1].trim();
    const label = match[2].trim().toLowerCase();
    if (!url || seen.has(url)) continue;
    
    // Resolve URLs relativas
    let fullUrl = url;
    try {
      if (url.startsWith('/')) {
        const u = new URL(baseUrl);
        fullUrl = u.origin + url;
      } else if (!url.startsWith('http')) {
        const u = new URL(baseUrl);
        fullUrl = u.origin + '/' + url;
      }
    } catch (_) { continue; }
    
    seen.add(url);
    
    // 1) FORMULARIOS
    if (/google\.com\/forms|forms\.gle|typeform\.com|docs\.google\.com\/forms/i.test(fullUrl)) {
      formularios.push({ url: fullUrl, label: match[2].trim() });
      continue;
    }
    
    // 2) EDITAIS (PDFs)
    if (/\.pdf($|\?)/i.test(fullUrl)) {
      editais.push({ url: fullUrl, label: match[2].trim() });
      continue;
    }
    
    // 3) PAGINAS OFICIAIS do programa/curso (subdominios de UFG)
    const isUfgOfficial = /^https?:\/\/([a-z0-9-]+\.)*ufg\.br\//i.test(fullUrl);
    const isProgramaPage = /programa|p[oó]s|ppg|faculdade|departamento|curso/i.test(label) || 
                           /\/p\/[a-z0-9-]+/i.test(fullUrl) || // padrao de paginas UFG (/p/xxx)
                           /ppg[a-z]+|programa|p[oó]s|faculdade|departamento|curso/i.test(fullUrl);
    if (isUfgOfficial && isProgramaPage) {
      paginasOficiais.push({ url: fullUrl, label: match[2].trim() });
      continue;
    }
    
    // 4) Links de acao (inscricao, edital, etc) — ainda que externos
    if (/inscri[cç][aã]o|edital|processo seletivo|sele[cç][aã]o|editais abertos|saiba mais|confira/i.test(label)) {
      if (fullUrl !== baseUrl) {
        outros.push({ url: fullUrl, label: match[2].trim() });
      }
    }
  }
  // v4.5.2 P1-Sympla-Even3: detectar links externos de plataformas de inscrição no TEXTO
  // (não só em <a href>) — ex: "Link para inscrição: https://www.sympla.com.br/..."
  if (typeof html === 'string') {
    const symplaRegex = /(https?:\/\/(?:www\.)?(?:sympla|even3|even3\.com\.br|doity|eventbrite)\.com\.br?\/(?:evento|event)[^\s<"']+)/gi;
    const googleFormsRegex = /(https?:\/\/(?:docs\.google\.com\/forms|forms\.gle)\/[^\s<"']+)/gi;
    const addIfNew = (arr, url, label) => {
      if (arr.some(o => o.url === url)) return;
      arr.push({ url, label });
    };
    let m;
    while ((m = symplaRegex.exec(html)) !== null) {
      addIfNew(outros, m[1], 'Inscrição (Sympla/Even3)');
    }
    while ((m = googleFormsRegex.exec(html)) !== null) {
      addIfNew(formularios, m[1], 'Formulário Google');
    }
  }
  
  return {
    formularios: formularios.slice(0, 3),
    editais: editais.slice(0, 3),
    paginasOficiais: paginasOficiais.slice(0, 3),
    outros: outros.slice(0, 3),
  };
}

// ============================================================
// ANALYZE DATES (robust — do publisher classifier)
// ============================================================

function validIsoDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const iso = `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toISOString().slice(0, 10) !== iso) return '';
  return iso;
}

function parseDatePt(text) {
  const dates = [];
  const patterns = [
    /(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/gi,
    /(\d{2})\/(\d{2})\/(\d{4})/g,
    /(\d{2})\/(\d{2})\/(\d{2})(?!\d)/g,  // DD/MM/YY format (e.g. 08/06/26)
    /(\d{4})-(\d{2})-(\d{2})/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[2] && match[2].length > 2) {
        const day = parseInt(match[1]);
        const month = MONTHS_PT[match[2].toLowerCase()];
        const year = parseInt(match[3]) || CURRENT_YEAR;
        if (month && day >= 1 && day <= 31) {
          const iso = validIsoDate(year, month, day);
          if (iso) dates.push(iso);
        }
      } else if (match[0].includes('/')) {
        // DD/MM/YYYY or DD/MM/YY
        let year = parseInt(match[3]);
        if (year < 100) year += 2000;  // 26 → 2026
        const iso = validIsoDate(year, match[2], match[1]);
        if (iso) dates.push(iso);
      } else if (match[2]) {
        const iso = validIsoDate(match[1], match[2], match[3]);
        if (iso) dates.push(iso);
      }
    }
  }
  return [...new Set(dates)].sort();
}

function sentenceStart(text, index) {
  let start = 0;
  const boundary = /[.!?;]\s+/g;
  let match;
  while ((match = boundary.exec(text)) !== null && match.index < index) {
    start = match.index + match[0].length;
  }
  return start;
}

function lastMatchIndex(text, pattern) {
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let index = -1;
  let match;
  while ((match = regex.exec(text)) !== null) {
    index = match.index;
    if (match[0].length === 0) regex.lastIndex++;
  }
  return index;
}

function classifyDateRole(text, index) {
  const before = normalizeText(text.slice(sentenceStart(text, index), index));
  const resultIndex = lastMatchIndex(before, /\b(?:resultado|resultado final|resultado preliminar|homologacao|lista de aprovados)\b/g);
  const applicationIndex = lastMatchIndex(
    before,
    /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas|prazo\s+(?:de|para)\s+(?:inscricao|submissao|candidatura|matricula))\b/g
  );
  const eventContextIndex = lastMatchIndex(
    before,
    /\b(?:data|evento|curso|palestra|workshop|seminario|simposio|congresso|oficina|programacao|realizad[oa]s?|ocorre|acontece|comeca|inicia)\b/g
  );

  if (resultIndex > Math.max(applicationIndex, eventContextIndex)) {
    return 'resultPublishedAt';
  }

  // A course/event name commonly appears between "inscricoes" and its deadline.
  // Prefer the explicit registration cue over the nearer event noun in that case.
  const explicitApplicationDeadline = /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas)\b[^.!?;]{0,160}\b(?:ate|encerra|encerram|encerramento|limite|prazo final)\b[^.!?;]{0,35}$/.test(before);
  const explicitApplicationOpening = /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas)\b[^.!?;]{0,160}\b(?:abrem|abertas|abertura|iniciam|inicio)\b[^.!?;]{0,35}$/.test(before) &&
    !/\b(?:ate|encerra|encerram|limite|prazo final)\b[^.!?;]{0,35}$/.test(before);
  if (explicitApplicationDeadline) return 'applicationDeadline';
  if (explicitApplicationOpening) return 'applicationOpensAt';

  if (applicationIndex > eventContextIndex) {
    if (/\b(abrem|abertas|abertura|iniciam|inicio)\b[^.]{0,40}$/.test(before) &&
        !/\b(ate|encerra|encerram|limite|final)\b[^.]{0,30}$/.test(before)) {
      return 'applicationOpensAt';
    }
    return 'applicationDeadline';
  }

  if (eventContextIndex >= 0 && /\b(fim|termina|terminam|encerra|encerramento|ate)\b[^.]{0,20}$/.test(before)) {
    return 'eventEndsAt';
  }

  if (eventContextIndex >= 0 && /\b(data|comeca|inicio|inicia|iniciam|realizado de|realizada de|ocorre|acontece|de)\b[^.]{0,20}$/.test(before)) {
    return 'eventStartsAt';
  }

  if (eventContextIndex >= 0) return 'eventStartsAt';

  return 'contextDate';
}

function parseDateEvidence(text, source = 'item_text') {
  const occurrences = [];
  const coveredRanges = [];
  const monthPattern = 'janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';

  const excerptFor = (start, length) => text
    .slice(Math.max(0, start - 70), Math.min(text.length, start + length + 70))
    .replace(/\s+/g, ' ')
    .trim();

  const rolesForRange = (index, length) => {
    const nearbyBefore = normalizeText(text.slice(Math.max(sentenceStart(text, index), index - 220), index));
    const nearbyAfterRaw = text.slice(index + length, Math.min(text.length, index + length + 140));
    const nearbyAfter = normalizeText(nearbyAfterRaw.split(/[.!?;]/, 1)[0]);
    const registrationNamedAfterRange = /\b(?:aberta|abertas|aberto|abertos)\b[^.!?;]{0,80}$/.test(nearbyBefore) &&
      /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas)\b/.test(nearbyAfter);
    if (registrationNamedAfterRange) return ['applicationOpensAt', 'applicationDeadline'];

    const role = classifyDateRole(text, index);
    if (role === 'applicationDeadline' || role === 'applicationOpensAt') {
      return ['applicationOpensAt', 'applicationDeadline'];
    }
    if (role === 'resultPublishedAt') return ['resultPublishedAt', 'resultPublishedAt'];
    return ['eventStartsAt', 'eventEndsAt'];
  };

  const rangePatterns = [
    {
      regex: new RegExp(`(\\d{1,2})\\s+de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?\\s*(?:a|e|at[eé])\\s*(\\d{1,2})\\s+de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?`, 'gi'),
      toDates: (match) => {
        const firstYear = match[3] || match[6] || CURRENT_YEAR;
        const secondYear = match[6] || match[3] || CURRENT_YEAR;
        return [
          validIsoDate(firstYear, MONTHS_PT[match[2].toLowerCase()], match[1]),
          validIsoDate(secondYear, MONTHS_PT[match[5].toLowerCase()], match[4]),
        ];
      },
    },
    {
      regex: new RegExp(`(\\d{1,2})\\s*,\\s*(\\d{1,2})\\s+e\\s+(\\d{1,2})\\s+de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?`, 'gi'),
      toDates: (match) => [
        validIsoDate(match[5] || CURRENT_YEAR, MONTHS_PT[match[4].toLowerCase()], match[1]),
        validIsoDate(match[5] || CURRENT_YEAR, MONTHS_PT[match[4].toLowerCase()], match[3]),
      ],
    },
    {
      regex: new RegExp(`(\\d{1,2})\\s*(?:a|e|at[eé])\\s*(\\d{1,2})\\s+de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?`, 'gi'),
      toDates: (match) => [
        validIsoDate(match[4] || CURRENT_YEAR, MONTHS_PT[match[3].toLowerCase()], match[1]),
        validIsoDate(match[4] || CURRENT_YEAR, MONTHS_PT[match[3].toLowerCase()], match[2]),
      ],
    },
    {
      regex: /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:a|e|at[eé])\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/gi,
      toDates: (match) => {
        const firstYear = Number(match[3]) < 100 ? Number(match[3]) + 2000 : match[3];
        const secondYear = Number(match[6]) < 100 ? Number(match[6]) + 2000 : match[6];
        return [
          validIsoDate(firstYear, match[2], match[1]),
          validIsoDate(secondYear, match[5], match[4]),
        ];
      },
    },
  ];

  for (const { regex, toDates } of rangePatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (coveredRanges.some(({ start, end }) => match.index >= start && match.index < end)) continue;
      const [startDate, endDate] = toDates(match);
      if (!startDate || !endDate) continue;
      const [startRole, endRole] = rolesForRange(match.index, match[0].length);
      const excerpt = excerptFor(match.index, match[0].length);
      occurrences.push({ date: startDate, role: startRole, excerpt, source, index: match.index });
      occurrences.push({ date: endDate, role: endRole, excerpt, source, index: match.index + match[0].length - 1 });
      coveredRanges.push({ start: match.index, end: regex.lastIndex });
    }
  }

  const patterns = [
    {
      regex: /(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/gi,
      toIso: (match) => validIsoDate(match[3] || CURRENT_YEAR, MONTHS_PT[match[2].toLowerCase()], match[1]),
    },
    {
      regex: /(\d{4})-(\d{2})-(\d{2})/g,
      toIso: (match) => validIsoDate(match[1], match[2], match[3]),
    },
    {
      regex: /(\d{2})\/(\d{2})\/(\d{4})/g,
      toIso: (match) => validIsoDate(match[3], match[2], match[1]),
    },
    {
      regex: /(\d{2})\/(\d{2})\/(\d{2})(?!\d)/g,
      toIso: (match) => validIsoDate(Number(match[3]) + 2000, match[2], match[1]),
    },
  ];

  for (const { regex, toIso } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (coveredRanges.some(({ start, end }) => match.index >= start && match.index < end)) continue;
      const date = toIso(match);
      if (!date) continue;
      const role = classifyDateRole(text, match.index);
      const excerpt = excerptFor(match.index, match[0].length);
      occurrences.push({
        date,
        role,
        excerpt,
        source,
        index: match.index,
      });
    }
  }

  const seen = new Set();
  return occurrences
    .sort((a, b) => a.index - b.index)
    .filter((item) => {
      const key = `${item.date}:${item.role}:${normalizeText(item.excerpt)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ index, ...item }) => item);
}

function firstRoleDate(evidence, role) {
  const dates = evidence.filter(item => item.role === role).map(item => item.date).sort();
  return dates[0] || null;
}

function lastRoleDate(evidence, role) {
  const dates = evidence.filter(item => item.role === role).map(item => item.date).sort();
  return dates[dates.length - 1] || null;
}

function analyzeTemporalRelevance(text, html, webyDate, options = {}) {
  const htmlText = extractText(html || '');
  const fullText = `${text || ''} ${htmlText}`.trim();
  const publishedAt = options.publishedAt || webyDate || null;
  const updatedAt = options.updatedAt || null;
  const publishedDate = publishedAt ? String(publishedAt).slice(0, 10) : null;
  const evidenceSeen = new Set();
  const dateEvidence = [
    ...parseDateEvidence(text || '', 'item_text'),
    ...parseDateEvidence(htmlText, 'html'),
  ].filter((item) => {
    if (item.role === 'contextDate' && item.date === publishedDate) return false;
    const key = `${item.date}:${item.role}:${normalizeText(item.excerpt)}`;
    if (evidenceSeen.has(key)) return false;
    evidenceSeen.add(key);
    return true;
  });

  if (options.eventStartsAt) {
    dateEvidence.push({
      date: String(options.eventStartsAt).slice(0, 10),
      role: 'eventStartsAt',
      excerpt: 'structured event start',
      source: 'structured_event',
    });
  }
  if (options.eventEndsAt) {
    dateEvidence.push({
      date: String(options.eventEndsAt).slice(0, 10),
      role: 'eventEndsAt',
      excerpt: 'structured event end',
      source: 'structured_event',
    });
  }

  const filteredDates = [...new Set(dateEvidence.map(item => item.date))].sort();
  const futureDates = filteredDates.filter(date => date >= TODAY_ISO);
  const pastDates = filteredDates.filter(date => date < TODAY_ISO);
  const latestDate = filteredDates[filteredDates.length - 1] || null;

  const structuredEventStartsAt = options.eventStartsAt ? String(options.eventStartsAt).slice(0, 10) : null;
  const structuredEventEndsAt = options.eventEndsAt ? String(options.eventEndsAt).slice(0, 10) : null;
  const applicationOpensAt = firstRoleDate(dateEvidence, 'applicationOpensAt');
  const applicationDeadline = lastRoleDate(dateEvidence, 'applicationDeadline');
  const resultPublishedAt = lastRoleDate(dateEvidence, 'resultPublishedAt');
  const eventStartsAt = structuredEventStartsAt || firstRoleDate(dateEvidence, 'eventStartsAt');
  const eventEndsAt = structuredEventEndsAt || lastRoleDate(dateEvidence, 'eventEndsAt');

  const normalizedFullText = normalizeText(fullText);
  const statusDate = updatedAt || publishedAt;
  const statusDateOnly = statusDate ? String(statusDate).slice(0, 10) : null;
  const hasFreshStatus = Boolean(statusDateOnly && statusDateOnly >= daysAgo(30));
  const explicitlyClosed = /\b(?:inscricoes?|candidaturas?|submissoes?|matriculas?)\s+(?:encerradas?|fechadas?|finalizadas?)\b/.test(normalizedFullText);
  const explicitlyOpen = /\b(?:inscricoes?|candidaturas?|submissoes?|matriculas?)\s+(?:abertas?|reabertas?|prorrogadas?)\b/.test(normalizedFullText);
  const applicationStatus = explicitlyClosed
    ? 'closed'
    : (applicationDeadline
      ? (applicationDeadline >= TODAY_ISO ? 'open' : 'closed')
      : (explicitlyOpen && hasFreshStatus ? 'open' : 'unknown'));

  let eventStatus = 'unknown';
  if (eventEndsAt && eventEndsAt < TODAY_ISO) {
    eventStatus = 'finished';
  } else if (eventStartsAt && eventStartsAt > TODAY_ISO) {
    eventStatus = 'upcoming';
  } else if (eventStartsAt && eventStartsAt <= TODAY_ISO) {
    eventStatus = eventEndsAt && eventEndsAt >= TODAY_ISO
      ? 'ongoing'
      : (eventStartsAt === TODAY_ISO ? 'ongoing' : 'finished');
  } else if (eventEndsAt && eventEndsAt >= TODAY_ISO) {
    eventStatus = 'upcoming';
  }

  const hasUpcomingEvent = eventStatus === 'upcoming' || eventStatus === 'ongoing';
  const hasDeadline = Boolean(applicationDeadline);
  let isExpired = eventStatus === 'finished' ||
    (applicationStatus === 'closed' && !hasUpcomingEvent) ||
    (filteredDates.length > 0 && futureDates.length === 0 && eventStatus === 'unknown' && applicationStatus === 'unknown');

  const now = new Date();
  if (!isExpired) {
    const todayMatch = /\b(?:data|quando|acontece)\s*[:\s]?\s*(\d{1,2})\/(\d{1,2})(?:\s+(?:as|aos)\s+(\d{1,2})[h:](\d{2})?)?/i.exec(fullText);
    const timeMatch = /\b(?:horario|hora|h)[\s:]+(\d{1,2})[h:](\d{2})?\b/i.exec(fullText);
    if (todayMatch) {
      const itemDate = new Date(now.getFullYear(), Number(todayMatch[2]) - 1, Number(todayMatch[1]));
      const hour = todayMatch[3] ? Number(todayMatch[3]) : (timeMatch ? Number(timeMatch[1]) : null);
      if (itemDate < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ||
          (itemDate.toDateString() === now.toDateString() && hour !== null && hour < now.getHours())) {
        isExpired = true;
      }
    }
  }

  const isOld = Boolean(publishedDate && publishedDate < daysAgo(90));
  const isUpcoming = hasUpcomingEvent || applicationStatus === 'open' || futureDates.length > 0;

  return {
    publishedAt,
    updatedAt,
    eventStartsAt,
    eventEndsAt,
    applicationOpensAt,
    applicationDeadline,
    resultPublishedAt,
    applicationStatus,
    eventStatus,
    canApply: false,
    dateEvidence,
    dates: filteredDates,
    futureDates,
    pastDates,
    latestDate,
    hasDeadline,
    hasDeadlineByRegex: dateEvidence.some(item => item.role === 'applicationDeadline' && item.source !== 'structured_event'),
    hasDeadlineByHeuristic: false,
    isExpired: Boolean(isExpired),
    isOld,
    isUpcoming,
    webyDate: publishedAt,
  };
}

// ============================================================
// CATEGORY DETECTION (Kino Campus)
// ============================================================

// v4.4.1: Categorias VÁLIDAS no Kino Campus (CATEGORY_LABELS em mapper.js)
const VALID_OPP_CATEGORIES = ['estagios', 'bolsas', 'monitoria', 'pesquisa', 'empregos', 'voluntariado', 'freelancer'];
const VALID_EVT_CATEGORIES = ['academicos', 'culturais', 'workshops', 'esportivos', 'festas', 'sustentabilidade'];

function detectOpportunityCategory(text) {
  const nt = normalizeText(text);
  // v4.4.1: Apenas categorias KINO-válidas; ordem mais específico → genérico
  if (has(nt, 'vestibular') || has(nt, 'sisu') || has(nt, 'concurso') ||
      has(nt, 'professor substituto') || has(nt, 'selecao para') || has(nt, 'cargos de nivel superior')) {
    return 'empregos'; // concursos vão como empregos (Kino não tem 'concursos')
  }
  if (has(nt, 'estagio')) return 'estagios';
  if (has(nt, 'monitoria')) return 'monitoria';
  if (has(nt, 'voluntariado')) return 'voluntariado';
  if (has(nt, 'bolsa') || has(nt, 'auxilio') || has(nt, 'permanencia') ||
      has(nt, 'apoio financeiro') || has(nt, 'probec')) return 'bolsas';
  if (has(nt, 'pesquisa') || has(nt, 'pibic') || has(nt, 'pivic') || has(nt, 'fapeg') ||
      has(nt, 'mobilidade internacional') || has(nt, 'mestrado') || has(nt, 'doutorado') ||
      has(nt, 'pos-graduacao') || has(nt, 'residencia') || has(nt, 'premiacao') ||
      has(nt, 'idioma sem fronteiras') || has(nt, 'certificacao em idiomas')) return 'pesquisa';
  if (has(nt, 'emprego') || has(nt, 'trabalho') || has(nt, 'contratacao')) return 'empregos';
  return 'monitoria';
}

function detectEventCategory(text) {
  const nt = normalizeText(text);
  // v4.4.1: Apenas categorias KINO-válidas
  // Certificação linguística, provas → workshops (não culturais)
  if (has(nt, 'suficiencia em linguas') || has(nt, 'proficiencia em idiomas') ||
      has(nt, 'certificacao em idiomas') || has(nt, 'exames de proficiencia') ||
      has(nt, 'casle') || has(nt, 'proficiencia em leitura')) return 'workshops';
  // v4.4.1: Institucional (inauguração, parceria, acolhida) NÃO é categoria Kino
  // → enviar para 'academicos' (default) ou descartar no classificador
  if (has(nt, 'inauguracao') || has(nt, 'parceria') || has(nt, 'acordo de cooperacao') ||
      has(nt, 'acolhida') || has(nt, 'cerimonia de')) return 'academicos'; // melhor aproximação
  if (has(nt, 'cultura') || has(nt, 'cinema') || has(nt, 'musica') || has(nt, 'arte') ||
    has(nt, 'exposicao') || has(nt, 'concerto') || has(nt, 'espetaculo')) return 'culturais';
  if (has(nt, 'oficina') || has(nt, 'workshop') || has(nt, 'curso') || has(nt, 'capacitacao') ||
      has(nt, 'encontro academico') || has(nt, 'simpósio') || has(nt, 'simposio')) return 'workshops';
  if (has(nt, 'seminario') || has(nt, 'congresso') || has(nt, 'palestra') || has(nt, 'encontro')) return 'academicos';
  if (has(nt, 'esporte') || has(nt, 'jogos') || has(nt, 'danca')) return 'esportivos';
  if (has(nt, 'hackaton') || has(nt, 'maratona') || has(nt, 'competicao')) return 'workshops';
  if (has(nt, 'festa') || has(nt, 'celebracao') || has(nt, 'aniversario')) return 'festas';
  if (has(nt, 'sustentabilidade') || has(nt, 'meio ambiente') || has(nt, 'reciclagem')) return 'sustentabilidade';
  return 'academicos';
}

// ============================================================
// v4.5.2 (2026-06-11): CATEGORY OVERRIDE (v2)
// Auditoria 11/06 identificou que detectOpportunityCategory/detectEventCategory
// às vezes erra. Regras de override (alta confiança):
//   - "especialização" lato sensu → 'pesquisa' (não 'estagios' nem 'bolsas')
//   - "projeto de extensão" / "projeto rondon" → 'voluntariado'
//   - "processo seletivo para coordenador" → 'empregos'
//   - "mestrado/doutorado" → 'pesquisa' (não 'bolsas')
//   - "mobilidade internacional/acadêmica" → 'pesquisa'
//   - "concurso público" → 'empregos'
//   - "monitoria" → 'monitoria' (manter)
//   - "bolsa" / "auxílio" → 'bolsas'
// ============================================================
function categoryOverride(title, text, currentCategory, module) {
  const nt = normalizeText(title + ' ' + text);
  if (module !== 'oportunidades') return currentCategory;
  // Override pesquisa
  if (has(nt, 'especializacao') || has(nt, 'mestrado') || has(nt, 'doutorado') ||
      has(nt, 'pos-graduacao') || has(nt, 'pos graduacao') ||
      has(nt, 'mobilidade internacional') || has(nt, 'mobilidade academica') ||
      has(nt, 'mobilidade na italia') || has(nt, 'confap') || has(nt, 'fapeg') ||
      has(nt, 'cnpq') || has(nt, 'capes') || has(nt, 'intercambio academico')) {
    return 'pesquisa';
  }
  // Override voluntariado (projetos de extensão)
  if (has(nt, 'projeto rondon') || has(nt, 'projeto de extensao') ||
      has(nt, 'acao voluntaria') || has(nt, 'voluntariado') ||
      (has(nt, 'projetos de trabalho') && has(nt, 'extensao'))) {
    return 'voluntariado';
  }
  // Override empregos (processo seletivo para cargo, concurso)
  if ((has(nt, 'processo seletivo') || has(nt, 'selecao para')) &&
      (has(nt, 'coordenador') || has(nt, 'professor') || has(nt, 'diretor') ||
       has(nt, 'tutor') || has(nt, 'preceptor') || has(nt, 'cargo'))) {
    return 'empregos';
  }
  if (has(nt, 'concurso publico') || has(nt, 'concurso para') || has(nt, 'selecao simplificada')) {
    return 'empregos';
  }
  return currentCategory;
}

// ============================================================
// DETECT UPDATE SIGNALS (v5.1 — 2026-06-10)
// Detecta se o item é uma ATUALIZAÇÃO de um post já publicado
// (ex: prorrogação de prazo, retificação, adiamento, nova chamada).
// Esses itens NÃO devem virar novos posts; devem ENRIQUECER posts
// existentes via enrich-duplicates (atualizando cover, descrição e
// metadata.last_update). Decisão Yan 10/06/2026.
// ============================================================

function detectUpdateSignals(title, text) {
  const combinedText = `${title || ''} ${text || ''}`;
  const nt = normalizeText(combinedText);
  const result = { isUpdate: false, type: null, signals: [] };

  // Prorrogação de prazo (mais comum)
  if (/\b(prorrogad[oa]s?|prorroga[cç][aã]o|adiad[oa]s?|adiamento|nova data|novo prazo|prazo final (alterado|modificado|atualizado|prorrogado))\b/i.test(nt)) {
    result.isUpdate = true;
    result.type = 'prorrogacao_prazo';
    result.signals.push('keyword:prorrogacao');
  }

  // Retificação / errata
  if (/\b(retifica[cç][aã]o|retificado|errata|corrig[ei]d[oa]|republica[cç][aã]o|republicado)\b/i.test(nt)) {
    result.isUpdate = true;
    result.type = result.type || 'retificacao';
    result.signals.push('keyword:retificacao');
  }

  // Resultado / lista de aprovados (de um processo seletivo anterior)
  if (/\b(resultado (final|preliminar|definitivo|parcial)|lista (de aprovados|de selecionados|de classificados)|homologa[cç][aã]o|convocados?|aprovados?)\b/i.test(nt)) {
    result.isUpdate = true;
    result.type = result.type || 'resultado';
    result.signals.push('keyword:resultado');
  }

  // Cancelamento
  if (/\b(cancelad[oa]|suspens[oa]|suspens[aã]o)\b/i.test(nt)) {
    result.isUpdate = true;
    result.type = result.type || 'cancelamento';
    result.signals.push('keyword:cancelamento');
  }

  // 2ª chamada / reabertura
  if (/\b(2[ªa]\s*chamada|segunda chamada|reabertura|reabert[oa]|reaberto)\b/i.test(nt)) {
    result.isUpdate = true;
    result.type = result.type || 'reabertura';
    result.signals.push('keyword:reabertura');
  }

  return result;
}

// ============================================================
// DETECT OFFICIAL SOURCE (v5.2 — 2026-06-10)
// Caso real: post CICSIC (f92a2950) foi criado a partir de inf.ufg.br/n/201699
// (que é REPOST do PIlC-China). O source_url deveria apontar para a OFICIAL.
// Heurística v5.2: Se a página é de site da UFG (inf.ufg.br, prpi.ufg.br, etc)
// E tem links no HTML que apontam para uma fonte EXTERNA (não-UFG, não-CNPq, não-CAPES),
// e o texto menciona o nome da organização externa, retorna a URL externa como fonte.
// Retorna null se não detectar.
// ============================================================
const UFG_SITES = ['inf.ufg.br', 'prpi.ufg.br', 'prpg.ufg.br', 'proex.ufg.br', 'prograd.ufg.br', 'prae.ufg.br', 'sri.ufg.br', 'ciar.ufg.br', 'cei.ufg.br', 'em.ufg.br', 'emac.ufg.br', 'fanut.ufg.br', 'fen.ufg.br', 'iptsp.ufg.br', 'ib.ufg.br', 'icb.ufg.br', 'eeca.ufg.br', 'evz.ufg.br', 'ime.ufg.br', 'agro.ufg.br', 'fef.ufg.br', 'fefd.ufg.br', 'ufg.br'];

/**
 * Match any subdomain of ufg.br as a UFG site. Used as a fallback for units
 * not listed in UFG_SITES above (e.g. idiomassemfronteiras.sri.ufg.br was
 * missed because it's a subdomain of sri.ufg.br). Single source of truth:
 * if hostname ends with .ufg.br (and not just the root 'ufg.br'), accept.
 */
function isUfgHostname(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  if (h === 'ufg.br') return true;
  return h.endsWith('.ufg.br');
}
const TRUSTED_INSTITUTIONAL = ['ufg.br', 'capes.gov.br', 'cnpq.br', 'fapeg.go.gov.br', 'gov.br', 'mec.gov.br'];
function detectOfficialSource(itemUrl, fullText, relevantLinks) {
  try {
    const u = new URL(itemUrl);
    // Aceita qualquer subdomínio de ufg.br (NÃO apenas a lista hardcoded UFG_SITES).
    // Fix para idiomasemfronteiras.sri.ufg.br que estava sendo descartado.
    const isUfgSite = isUfgHostname(u.hostname);
    if (!isUfgSite) return null; // Já é fonte não-UFG, não precisa detectar
  } catch (_) { return null; }
  // Procura links externos no relevantLinks que NÃO são UFG, CNPq, CAPES, FAPEG
  if (relevantLinks && typeof relevantLinks === 'object') {
    for (const grupo of Object.values(relevantLinks)) {
      if (!Array.isArray(grupo)) continue;
      for (const linkObj of grupo) {
        const link = typeof linkObj === 'string' ? linkObj : (linkObj.url || linkObj.href);
        if (!link) continue;
        try {
          const lurl = new URL(link);
          const isUfg = isUfgHostname(lurl.hostname);
          const isTrusted = TRUSTED_INSTITUTIONAL.some(s => lurl.hostname.endsWith(s));
          if (!isUfg && !isTrusted) {
            return link; // Fonte externa encontrada
          }
        } catch (_) {}
      }
    }
  }
  return null;
}

// ============================================================
// v4.5.2 (2026-06-11): DETECT OFFICIAL SOURCE V2
// Caso real: "Projeto Rondon: PROEX — edital..." publicado pelo INF
// (inf.ufg.br/n/201523 é REPOST). A descrição diz "A PROEX abriu edital...".
// V2: Se o texto menciona explicitamente uma unidade UFG que NÃO é a fonte atual,
// E a fonte atual é de outra unidade UFG, marcar como repost e tentar descobrir a URL oficial.
// ============================================================
// Lista de unidades UFG (siglas) e seus domínios
// v4.5.2: cobrir TODAS as 54 unidades (não só pró-reitorias)
const UFG_UNITS = [
  // Pró-reitorias
  { sig: 'PROEX', hosts: ['proex.ufg.br', 'proec.ufg.br'], fullName: 'pr[oó]-reitoria de extens[ãa]o' },
  { sig: 'PROEC', hosts: ['proex.ufg.br', 'proec.ufg.br'], fullName: 'pr[oó]-reitoria de extens[ãa]o' },
  { sig: 'PRPG', hosts: ['prpg.ufg.br'], fullName: 'pr[oó]-reitoria de p[oó]s-gradua[çc][ãa]o' },
  { sig: 'PRPI', hosts: ['prpi.ufg.br'], fullName: 'pr[oó]-reitoria de pesquisa e inova[çc][ãa]o' },
  { sig: 'PROGRAD', hosts: ['prograd.ufg.br'], fullName: 'pr[oó]-reitoria de gradua[çc][ãa]o' },
  { sig: 'PRAE', hosts: ['prae.ufg.br'], fullName: 'pr[oó]-reitoria de assuntos estudantis' },
  { sig: 'PROPESSOAS', hosts: ['propessoas.ufg.br'], fullName: 'pr[oó]-reitoria de pessoas' },
  { sig: 'PROAD', hosts: ['proad.ufg.br'], fullName: 'pr[oó]-reitoria de administra[çc][ãa]o' },
  // Secretarias
  { sig: 'SECOM', hosts: ['secom.ufg.br'], fullName: 'secretaria de comunica[çc][ãa]o' },
  { sig: 'SRI', hosts: ['sri.ufg.br'], fullName: 'secretaria de rela[çc][oõ]es internacionais' },
  { sig: 'SECPLAN', hosts: ['secplan.ufg.br'], fullName: 'secretaria de planejamento' },
  { sig: 'SETI', hosts: ['seti.ufg.br'], fullName: 'secretaria de tecnologia' },
  { sig: 'SDH', hosts: ['sdh.ufg.br'], fullName: 'secretaria de direitos humanos' },
  { sig: 'SIN', hosts: ['sin.ufg.br'], fullName: 'secretaria de inclus[ãa]o' },
  { sig: 'SEINFRA', hosts: ['seinfra.ufg.br'], fullName: 'secretaria de infraestrutura' },
  // Centros especiais
  { sig: 'CEI', hosts: ['cei.ufg.br'], fullName: 'centro de empreendedorismo' },
  { sig: 'CIAR', hosts: ['ciar.ufg.br'], fullName: 'centro integrado' },
  { sig: 'CEPAE', hosts: ['cepae.ufg.br'], fullName: 'centro de ensino' },
  { sig: 'CIGS', hosts: ['cigs.ufg.br'], fullName: 'centro de gest[ãa]o' },
  // Unidades acadêmicas principais (siglas)
  { sig: 'INF', hosts: ['inf.ufg.br'], fullName: 'instituto de inform[áa]tica' },
  { sig: 'ICB', hosts: ['icb.ufg.br'], fullName: 'instituto de ci[êe]ncias biol[óo]gicas' },
  { sig: 'IF', hosts: ['if.ufg.br'], fullName: 'instituto de f[íi]sica' },
  { sig: 'IME', hosts: ['ime.ufg.br'], fullName: 'instituto de matem[áa]tica' },
  { sig: 'IQ', hosts: ['quimica.ufg.br', 'iq.ufg.br'], fullName: 'instituto de qu[íi]mica' },
  { sig: 'IESA', hosts: ['iesa.ufg.br'], fullName: 'instituto de estudos socioambientais' },
  { sig: 'IPTSP', hosts: ['iptsp.ufg.br'], fullName: 'instituto de patologia' },
  { sig: 'EA', hosts: ['agro.ufg.br'], fullName: 'escola de agronomia' },
  { sig: 'EECA', hosts: ['eeca.ufg.br'], fullName: 'escola de engenharia civil' },
  { sig: 'EMC', hosts: ['emc.ufg.br'], fullName: 'escola de engenharia el[ée]trica' },
  { sig: 'EM', hosts: ['em.ufg.br', 'emac.ufg.br'], fullName: 'escola de m[úu]sica' },
  { sig: 'EVZ', hosts: ['evz.ufg.br'], fullName: 'escola de veterin[áa]ria' },
  { sig: 'FANUT', hosts: ['fanut.ufg.br'], fullName: 'faculdade de nutri[çc][ãa]o' },
  { sig: 'FEN', hosts: ['fen.ufg.br'], fullName: 'faculdade de enfermagem' },
  { sig: 'FEF', hosts: ['fef.ufg.br', 'fefd.ufg.br'], fullName: 'faculdade de educa[çc][ãa]o f[íi]sica' },
  { sig: 'FE', hosts: ['fe.ufg.br'], fullName: 'faculdade de educa[çc][ãa]o' },
  { sig: 'FACE', hosts: ['face.ufg.br'], fullName: 'faculdade de administra[çc][ãa]o' },
  { sig: 'FAV', hosts: ['fav.ufg.br'], fullName: 'faculdade de artes visuais' },
  { sig: 'FCS', hosts: ['fcs.ufg.br'], fullName: 'faculdade de ci[êe]ncias sociais' },
  { sig: 'FIC', hosts: ['fic.ufg.br'], fullName: 'faculdade de informa[çc][ãa]o' },
  { sig: 'FL', hosts: ['letras.ufg.br'], fullName: 'faculdade de letras' },
  { sig: 'FM', hosts: ['medicina.ufg.br'], fullName: 'faculdade de medicina' },
  { sig: 'FO', hosts: ['odonto.ufg.br'], fullName: 'faculdade de odontologia' },
  { sig: 'FD', hosts: ['direito.ufg.br'], fullName: 'faculdade de direito' },
  { sig: 'FCT', hosts: ['fct.ufg.br'], fullName: 'faculdade de ci[êe]ncias e tecnologia' },
  { sig: 'FF', hosts: ['farmacia.ufg.br'], fullName: 'faculdade de farm[áa]cia' },
  { sig: 'FAFIL', hosts: ['filosofia.ufg.br'], fullName: 'faculdade de filosofia' },
  { sig: 'FH', hosts: ['historia.ufg.br'], fullName: 'faculdade de hist[óo]ria' },
  { sig: 'CAMPUS GOIÁS', hosts: ['goias.ufg.br'], fullName: 'campus goi[áa]s' },
  { sig: 'VERITAS', hosts: ['veritas.ufg.br'], fullName: 'hospital veritas' },
  // Órgãos suplementares
  { sig: 'MUSEU', hosts: ['museu.ufg.br'], fullName: 'museu antropol[óo]gico' },
  { sig: 'BC', hosts: ['bc.ufg.br'], fullName: 'sistema de bibliotecas' },
  { sig: 'SIBI', hosts: ['sibi.ufg.br'], fullName: 'sistema de bibliotecas' },
  { sig: 'PLANETÁRIO', hosts: ['planetario.ufg.br'], fullName: 'planet[áa]rio' },
  { sig: 'EDITORA', hosts: ['editora.ufg.br'], fullName: 'editora' },
  { sig: 'CEGRAF', hosts: ['cegraf.ufg.br'], fullName: 'centro editorial' },
  { sig: 'OUVIDORIA', hosts: ['ouvidoria.ufg.br'], fullName: 'ouvidoria' },
  { sig: 'CIDARQ', hosts: ['cidarq.ufg.br'], fullName: 'centro de documenta[çc][ãa]o' },
];
function detectOfficialSourceV2(itemUrl, fullText) {
  // V1: tenta achar fonte externa em relevantLinks
  const v1 = detectOfficialSource(itemUrl, fullText, null);
  if (v1) return v1;
  // V2: detectar REPOST entre unidades UFG
  try {
    const u = new URL(itemUrl);
    const currentHost = u.hostname;
    // Detectar qual unidade publicou
    let sourceUnit = null;
    let sourceFullName = null;
    for (const unit of UFG_UNITS) {
      if (unit.hosts.some(h => currentHost.endsWith(h))) {
        sourceUnit = unit.sig;
        sourceFullName = unit.fullName;
        break;
      }
    }
    if (!sourceUnit) return null; // Já é fonte não-UFG ou não detectada
    // Procurar menção a OUTRA unidade no texto (com verbo de publicação)
    const nt = normalizeText(fullText || '');
    for (const unit of UFG_UNITS) {
      if (unit.sig === sourceUnit) continue;
      // Padrão: "A PROEX abriu edital..." / "A PRPG lançou..." / "PROEC publicou..."
      const patterns = [
        new RegExp(`\\b${unit.sig}\\b.*?(?:abriu|publicou|divulgou|lançou|anunciou|tornou p[úu]blico|disponibilizou)\\b`, 'i'),
        new RegExp(`(?:abriu|publicou|divulgou|lançou|anunciou|tornou p[úu]blico|disponibilizou)\\b.*?\\b${unit.sig}\\b`, 'i'),
        // Sigla + Pontuação/sufixo (ex: "PROEX/UFG", "PROEX N.° 02/2026")
        new RegExp(`\\b${unit.sig}\\s*[/\\-]?\\s*UFG\\b`, 'i'),
        // Nome completo (ex: "Pró-Reitoria de Extensão")
      ];
      if (unit.fullName) {
        patterns.push(new RegExp(`\\b${unit.fullName}\\b`, 'i'));
      }
      for (const re of patterns) {
        if (re.test(nt)) {
          // Esta unidade é a real publicadora. Marcar como repost.
          return { repost: true, originalUnit: unit.sig, currentUnit: sourceUnit, originalHost: unit.hosts[0] };
        }
      }
    }
  } catch (_) {}
  return null;
}

// ============================================================
// NORMALIZE TITLE (v4.5 — 2026-06-10)
// Limpa título para formato canônico Kino:
//   - Trunca em MAX_TITLE_LEN (80 chars) com "..."
//   - Remove APENAS o verbo após a sigla (mantém "PROEC", remove "publica")
//   - Garante primeira letra maiúscula (exceto siglas)
//   - Remove whitespace extra
// Caso real auditado (10/06): "Instituto Verbena/UFG publica edital da Prefeitura Municipal de Minaçu/GO para cargos de nível superior" = 81 chars (excede limite 80)
// v4.5.1 (10/06): Bug fix — regex anterior removia a sigla junto com o verbo.
//   "UFG divulga edital X" virava "edital X" (sem UFG). Agora vira "UFG: edital X" (mantém sigla).
// ============================================================
const MAX_TITLE_LEN = 180;
// v4.5.1: cada padrão é (sigla) + (verbo) + (resto). Substitui por (sigla): + (resto)
// Evita consumir a sigla junto com o verbo.
const TITLE_VERB_AFTER_SIGLA = [
  { sig: 'PROEX', verbs: 'publica|divulga|lança|anuncia|torna público|disponibiliza', separator: ' — ' },
  { sig: 'PROEC', verbs: 'publica|divulga|lança|anuncia|torna público|disponibiliza', separator: ' — ' },
  { sig: 'UFG',   verbs: 'divulga|publica|lança|anuncia|torna público|disponibiliza|oferece|abre', separator: ' — ' },
  { sig: 'PRPG',  verbs: 'promove|oferece|divulga|publica|abre|anuncia', separator: ' — ' },
  { sig: 'PRPI',  verbs: 'divulga|publica|anuncia', separator: ' — ' },
  { sig: 'PROGRAD', verbs: 'divulga|publica|anuncia|abre', separator: ' — ' },
  { sig: 'PRAE',  verbs: 'divulga|publica|anuncia|abre', separator: ' — ' },
  { sig: 'SRI',   verbs: 'divulga|publica|anuncia|abre', separator: ' — ' },
];

function prettifyAllCapsTitle(title) {
  const letters = (title || '').match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || [];
  if (letters.length < 12) return title;
  const upper = (title || '').match(/[A-ZÀ-ÖØ-Þ]/g) || [];
  if (upper.length / letters.length < 0.72) return title;

  const small = new Set(['a', 'as', 'o', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com']);
  const acronyms = new Set(['UFG', 'UFJ', 'IFG', 'IFGOIANO', 'PET', 'PETBIO', 'IAPS', 'ICB', 'FEF', 'FEFD', 'EM', 'EMAC', 'PRAE', 'PROEX', 'PRPI', 'SRI']);

  let wordIndex = 0;
  return title.toLocaleLowerCase('pt-BR').replace(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g, (word) => {
    const rawUpper = word.toLocaleUpperCase('pt-BR');
    const previousIndex = wordIndex++;
    if (acronyms.has(rawUpper)) return rawUpper;
    if (/^[ivxlcdm]+$/i.test(word) && word.length <= 6) return rawUpper;
    if (previousIndex > 0 && small.has(word)) return word;
    return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
  });
}

function normalizeTitle(title) {
  if (!title) return title;
  let t = prettifyAllCapsTitle(title.trim().replace(/\s+/g, ' '));
  // Remove apenas o verbo após a sigla: "PROEC publica edital" → "PROEC — edital"
  for (const { sig, verbs, separator } of TITLE_VERB_AFTER_SIGLA) {
    const re = new RegExp(`\\b${sig}\\s+(?:${verbs})\\s+`, 'i');
    t = t.replace(re, `${sig.toUpperCase()}${separator}`);
  }
  // Trunca em MAX_TITLE_LEN, mas SEM reticências (Yan 15/06/2026: "... está horrível em todas as publicações").
  // Estratégia: cortar no último espaço dentro do limite, sem adicionar '…'.
  if (t.length > MAX_TITLE_LEN) {
    const cut = t.substring(0, MAX_TITLE_LEN);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > MAX_TITLE_LEN - 30) {
      t = cut.substring(0, lastSpace).trim();
    } else {
      t = cut.trim();
    }
  }
  return t;
}

// ============================================================
// CLASSIFY ITEM (v4 — merged best of both worlds)
// ============================================================

function classifyItem(title, text, html, sourceName, linkUrl, jsonItem) {
  const combinedText = `${title || ''} ${text || ''}`;
  const nt = normalizeText(combinedText);

  // v4.5.2: HARD_EXCLUDE — sempre descarta, sem exceção
  // Casos reais: defesa de tese, release de imprensa, aviso institucional
  for (const pattern of HARD_EXCLUDE_PATTERNS) {
    if (pattern.test(combinedText) || pattern.test(title || '')) {
      return { decision: 'discard', score: 0.05, module: '', category: '', reasons: ['hard_exclude'], dates: {}, expired: false };
    }
  }

  // Check exclude first
  const exc = EXCLUDE_TERMS.filter(t => has(nt, t));
  // v4.2.1: Only discard if 3+ exclude terms AND no strong signals (edital, bolsa, inscricao)
  const hasStrongSignal = /\b(edital|bolsa|inscricao|inscrições|processo seletivo|chamada publica|mobilidade|concurso publico)\b/i.test(nt);
  if (exc.length >= 3 && !hasStrongSignal) {
    return { decision: 'discard', score: 0.1, module: '', category: '', reasons: exc.map(t => `exclude:${t}`), dates: {}, expired: false };
  }

  const inc = INCLUDE_TERMS.filter(t => has(nt, t));
  const hasPdf = extractPdfLinks(html).length > 0;
  const pagesText = extractText(html);

  // v4.3: Native category boost from API tags
  // v4.5.2: normalizar + expandir strongNativeCats para eventos (palestra/seminario/oficina/curso)
  const nativeCats = (jsonItem?.nativeCategories || [])
    .map(c => String(c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const isEventJson = jsonItem?.sourceKind === 'event';
  const strongNativeCats = [
    'inscricoes abertas', 'editais', 'bolsas', 'processo seletivo', 'oportunidades', 'processosseletivos',
    // v4.5.2: Eventos (palestra, seminário, oficina, curso, evento)
    'palestra', 'seminario', 'oficina', 'curso', 'workshop', 'evento', 'eventos', 'capacitacao',
    'concurso professor efetivo', 'concurso professor substituto', 'concurso professor',
    // v4.5.2: Cultura
    'exposicao', 'programacao completa', 'agenda cultural',
    // v4.5.2: Ação social
    'mutirao', 'voluntariado', 'extensao',
  ];
  const nativeCatBoost = strongNativeCats.some(sc => nativeCats.some(nc => nc.includes(sc))) ? 0.08 : 0;

  // v4.4 P1-BugFix-6: Boost para "ProcessosSeletivos" em Institutoverbena
  const hasProcessoSeletivo = /processos?\s*seletivos?|concurso\s+publico|concurso\s+novo|card-concurso|card-processosseletivos/i.test(combinedText);
  const processoSeletivoBoost = hasProcessoSeletivo ? 0.10 : 0;

  // v4.4 P1-BugFix-7: Boost para padrões de exposição cultural (Museu, Fav, etc.)
  const hasExposicaoPattern = /exposicao\s+de\s+\d|exposicao\s+aberta|mostra\s+cultural|aberto\s+ao\s+publico\s+de|aberta\s+ao\s+publico\s+de/i.test(combinedText);
  const exposicaoBoost = hasExposicaoPattern ? 0.05 : 0;

  // v4.4.2 P0-Fix-C: Boost para TÍTULO com "Edital" + número (edital real, prazo presumido)
  const hasEditalInTitle = /^(edital|chamada|sele[çc][aã]o|processo\s+seletivo)/i.test((jsonItem?.title || title || '').trim());
  const editalTitleBoost = hasEditalInTitle ? 0.15 : 0; // v4.4.2: 0.10 → 0.15

  // v4.4.2 P0-Fix-D: Boost para HTML com PDF anexado (edital com link)
  const hasPdfInHtml = (html || '').match(/href="[^"]+\.pdf"/i);
  const pdfBoost = hasPdfInHtml ? 0.08 : 0; // v4.4.2: 0.05 → 0.08

  // v4.5.2 P1-LinkInscr-Text: Boost para texto com "Link para inscrição" / "Inscrições:" + URL
  // (sinal forte de evento com link de ação real, mesmo se detail fetch não rodar)
  const hasLinkInscrText = /\b(Link\s+para\s+(?:inscri[çc][aã]o|inscrever|inscrever-se)|Inscri[çc][oõ]es?\s*[:\)]|Inscreva-se)\b/i.test(combinedText);
  const linkInscrBoost = hasLinkInscrText ? 0.20 : 0; // v4.5.2: 0.10 → 0.20 (alta confiança)

  // Source boost
  const isProReitoria = ['ufg', 'secom', 'prpi', 'proex', 'prograd', 'prae', 'sri', 'prpg', 'cei'].includes(sourceName);
  const sourceBoost = isProReitoria ? 0.06 : 0;

  // Boost for international opportunities (v4.2)
  const hasInternational = /\b(alemanha|dinamarca|eua|estados unidos|frança|inglaterra|canadá|australia|japão|china|portugal|espanha|italia|internacional|intercambio|daad|erasmus|fulbright)\b/i.test(combinedText);
  const hasHighValueTerm = /\b(mestrado|doutorado|intercambio|intercâmbio)\b/i.test(combinedText);
  const internationalBoost = hasInternational ? 0.05 : (hasHighValueTerm ? 0.03 : 0);

  // Temporal analysis (key improvement vs v3)
  const temporal = analyzeTemporalRelevance(
    combinedText,
    html,
    jsonItem?.created_at || jsonItem?.updated_at,
    {
      publishedAt: jsonItem?.created_at || null,
      updatedAt: jsonItem?.updated_at || null,
      sourceKind: jsonItem?.sourceKind || 'news',
      eventStartsAt: jsonItem?.eventStartsAt || null,
      eventEndsAt: jsonItem?.eventEndsAt || null,
    }
  );

  // Scoring
  let score = 0.15 + sourceBoost + internationalBoost + nativeCatBoost + processoSeletivoBoost + exposicaoBoost + editalTitleBoost + pdfBoost + linkInscrBoost;
  score += Math.min(inc.length * 0.08, 0.48);
  if (temporal.hasDeadline && !temporal.isExpired) score += 0.12;
  if (temporal.isUpcoming) score += 0.08;
  if (isEventJson && temporal.isUpcoming && !temporal.isExpired) score += 0.18;
  if (hasPdf) score += 0.06;
  score = Math.min(score, 1); // FIX 2026-06-25 BUG C: cap em 1.0
  if (temporal.isOld) score -= 0.20;
  if (temporal.isExpired) score = Math.min(score, 0.49); // cap at 0.49 if expired

  // Exclude terms penalty
  const excludePenalty = Math.min((exc.length) * 0.25, 0.6);
  score -= excludePenalty;

  // v4.2.1: Detect biographical/profile news — these are NOT opportunities
  // Text about a person's career path with personal quotes and life narrative
  const isBioProfile = /trajet[oó]ria\s+(acad[êe]mica|profissional|dedicada)/i.test(nt) &&
    (/"[A-ZÀ-Ú][^"]{20,}"/.test(combinedText) || /“[A-ZÀ-Ú][^”]{20,}”/.test(combinedText) ||
     /\b(formada|formado|construiu|decidiu|identifiquei|lembra a professora|lembra o professor|concluiu a gradua[cç][aã]o)\b/i.test(nt));
  if (isBioProfile) {
    // Severely reduce score — biographical profiles are NOT publishable on Kino
    score = Math.min(score, 0.35);
  }

  // v5.0: Anti-institutional penalty — cap score for press releases and diplomatic fluff
  // NOTE: EXCLUDE_TERMS only flag for early discard (3+ hits). 
  // Here we cap score when title alone matches institutional patterns,
  // even if body text has relevant keywords.
  const institutionalTitlePatterns = [
    'prospecta acordos', 'marcam presenca', 'marcou presenca',
    'reconhece os destaques', 'cerimonia reconhece',
    'vice-reitora', 'vice-reitor', 'expoente nacional',
    'recebe representantes', 'visita do embaixador', 'visita da embaixadora',
  ];
  const titleIsInstitutional = institutionalTitlePatterns.some(p => has(jsonItem?.title || '', p));
  if (titleIsInstitutional) {
    // Cap score to max 0.69 (review only) for institutional titles
    score = Math.min(score, 0.69);
  }

  const oppScore = OPP_SIGNALS.filter(t => has(nt, t)).length;
  const evtScore = EVT_SIGNALS.filter(t => has(nt, t)).length;
  let module = isEventJson ? 'eventos' : (oppScore > evtScore ? 'oportunidades' : 'eventos');
  // v4.5.2 P0-Cat-Override: aplicar override de categoria
  let baseCategory = module === 'oportunidades' ? detectOpportunityCategory(nt) : detectEventCategory(nt);
  let category = categoryOverride(title, text, baseCategory, module);

  const sourceKind = jsonItem?.sourceKind || 'news';
  const actionIsNegated = /\b(?:sem|nao\s+(?:oferece|ha|possui|informa))\b.{0,60}\b(?:inscricao|vaga|formulario|candidatura|chamada)\b/i.test(nt);
  const actionEvidence = actionIsNegated
    ? []
    : collectActionEvidence(combinedText, html, linkUrl, jsonItem?.relevantLinks);
  const hasActionableCta = actionEvidence.length > 0;
  const hasUpcomingEvent = temporal.eventStatus === 'upcoming' || temporal.eventStatus === 'ongoing';
  const hasConcreteEventEvidence =
    /\b(?:participe|compareca|aberto\s+ao\s+publico|aberta\s+ao\s+publico|publico-alvo|entrada\s+(?:gratuita|franca))\b/.test(nt) ||
    /\b(?:local|horario|programacao|transmissao)\s*:/.test(nt);
  const hasActiveParticipationWindow = temporal.applicationStatus === 'open' &&
    /\b(?:inscricao|inscricoes|submissao|submissoes|candidatura|candidaturas)\b/.test(nt);
  const hasEventParticipation = isEventJson || actionEvidence.length > 0 || hasConcreteEventEvidence || hasActiveParticipationWindow;
  temporal.canApply = temporal.applicationStatus === 'open' && hasActionableCta;

  const updatedDate = jsonItem?.updated_at ? String(jsonItem.updated_at).slice(0, 10) : null;
  const hasCurrentUpdateSignal = Boolean(
    updatedDate && updatedDate >= daysAgo(30) &&
    temporal.applicationStatus === 'open' &&
    /\b(?:retifica[cç][aã]o|retificado|prorroga[cç][aã]o|prorrogad[oa]s?|novo\s+prazo|reabertura)\b/i.test(combinedText)
  );

  // Semantic module selection: a closed application can still describe an
  // upcoming event, but it is never an active opportunity.
  if (hasUpcomingEvent && (isEventJson || hasEventParticipation) && !temporal.canApply) {
    module = 'eventos';
  } else if (temporal.canApply && (sourceKind === 'opportunity' || oppScore > evtScore)) {
    module = 'oportunidades';
  }
  baseCategory = module === 'oportunidades' ? detectOpportunityCategory(nt) : detectEventCategory(nt);
  category = categoryOverride(title, text, baseCategory, module);

  const updatedRecently = Boolean(updatedDate && updatedDate >= daysAgo(30));
  const hasStrongHydrationSignal = sourceKind === 'opportunity' || hasEditalInTitle ||
    hasProcessoSeletivo || nativeCatBoost > 0 || hasLinkInscrText || inc.length >= 2;
  const shouldHydrate = !isEventJson && hasStrongHydrationSignal && (!temporal.isOld || updatedRecently);

  let forcedDiscardReason = null;
  const oldItemAllowed = (isEventJson && hasUpcomingEvent) || hasCurrentUpdateSignal;
  if (temporal.isOld && !oldItemAllowed) {
    forcedDiscardReason = 'old_without_current_window';
  } else if (sourceKind === 'news' && !temporal.canApply && !(hasUpcomingEvent && hasEventParticipation)) {
    forcedDiscardReason = 'news_without_action';
  } else if (module === 'oportunidades' && !temporal.canApply) {
    forcedDiscardReason = 'opportunity_without_active_window';
  } else if (module === 'eventos' && !hasUpcomingEvent) {
    forcedDiscardReason = 'event_without_future_schedule';
  }

  if (forcedDiscardReason) {
    score = Math.min(score, 0.49);
  } else if ((module === 'eventos' && hasUpcomingEvent && (isEventJson || hasEventParticipation)) ||
             (module === 'oportunidades' && temporal.canApply)) {
    score = Math.max(score, 0.72);
  }

  // Fix 2026-06-24: Itens antigos sem datas futuras devem ser descartados.
  // Ex: FACE (março), FEF Solidária (maio) — evento/inscrição já passou.
  const isStale = temporal.isOld && temporal.futureDates.length === 0 && !temporal.hasDeadline;
  
  // Fix 2026-06-24 #2: Eventos com webyDate > 30 dias provavelmente já aconteceram.
  // Se não há data futura extraída, o evento é passado → descartar.
  const webyDaysAgo = temporal.webyDate ? Math.floor((new Date() - new Date(temporal.webyDate)) / 86400000) : 0;
  const isEventExpired = module === 'eventos' && webyDaysAgo > 30 && temporal.futureDates.length === 0;

  if (isEventJson && temporal.isUpcoming && !temporal.isExpired) {
    const strongEventSignal = evtScore > 0 || nativeCats.length > 0 || /local:|data:|hor[aá]rio|programa[cç][aã]o/i.test(combinedText);
    score = Math.max(score, strongEventSignal ? 0.72 : 0.58);
  }

  // Product rule: KinoCampus events should be future/ongoing or actionable.
  // News items that merely mention "evento" but have no future date/deadline
  // must not become publishable event posts. Calendar JSON items are handled above.
  const newsEventWithoutFutureDate = !isEventJson &&
    module === 'eventos' &&
    temporal.futureDates.length === 0;
  if (newsEventWithoutFutureDate) {
    score = Math.min(score, (hasLinkInscrText || temporal.hasDeadline) ? (REVIEW_THRESHOLD + 0.19) : 0.49);
  }

  // Product rule: opportunities must be actionable with a real future
  // deadline/date. A release about a selection/chamada without a deadline
  // should be reviewed, not auto-published.
  const opportunityWithoutDeadline = !isEventJson &&
    module === 'oportunidades' &&
    !temporal.canApply;
  if (opportunityWithoutDeadline) {
    const hasDocumentAction = hasPdf || hasPdfInHtml || hasLinkInscrText;
    score = Math.min(score, hasDocumentAction ? (REVIEW_THRESHOLD + 0.19) : 0.49);
  }
  
  // Decision
  let decision;
  if (forcedDiscardReason || temporal.isExpired || isStale || isEventExpired) {
    decision = 'discard';
  } else if (score >= PUBLISH_THRESHOLD) {
    decision = 'publish';
  } else if (score >= REVIEW_THRESHOLD) {
    decision = 'review';
  } else {
    decision = 'discard';
  }

  const gateReason = forcedDiscardReason ||
    (temporal.isExpired ? 'temporal_expired' :
      (isStale ? 'stale_without_current_date' :
        (isEventExpired ? 'event_expired' :
          (decision === 'discard' ? 'below_relevance_threshold' : null))));

  const reasons = inc.slice();
  if (newsEventWithoutFutureDate) {
    reasons.push(hasLinkInscrText || temporal.hasDeadline ? 'news_event_without_future_date' : 'news_event_without_future_action');
  }
  if (opportunityWithoutDeadline) {
    reasons.push('opportunity_without_deadline');
  }
  if (forcedDiscardReason) {
    reasons.push(forcedDiscardReason);
  }
  if (module === 'eventos' && hasUpcomingEvent && temporal.applicationStatus === 'closed') {
    reasons.push('application_closed_event_upcoming');
  }

  return {
    decision,
    score,
    module,
    category,
    reasons,
    temporal,
    expired: temporal.isExpired,
    hasDeadline: temporal.hasDeadline,
    hasUpcoming: temporal.isUpcoming,
    actionEvidence,
    gateReason,
    shouldHydrate,
  };
}

// ============================================================
// EVENT SOURCE (v4.3 — P1-3)
// ============================================================

const EVENTS_JSON_URL = 'https://ufg.br/events.json';
const EVENTS_MAX_PAGES = 3; // Buscar até 3 páginas (75 eventos)
const EVENTS_LOOKAHEAD_DAYS = 90; // Eventos até 90 dias no futuro

function fetchEvents() {
  const allEvents = [];
  for (let page = 1; page <= EVENTS_MAX_PAGES; page++) {
    const url = page === 1 ? EVENTS_JSON_URL : `${EVENTS_JSON_URL}?page=${page}`;
    const json = fetchJson(url);
    if (!json || !json.events) break;
    allEvents.push(...json.events);
  }
  return allEvents;
}

function buildWebyEventLink(ev, baseUrl = 'https://ufg.br') {
  const cleanBase = String(baseUrl || 'https://ufg.br').replace(/\/+$/, '');
  if (ev?.id && cleanBase !== 'https://ufg.br') return `${cleanBase}/e/${ev.id}`;
  if (ev?.id && cleanBase === 'https://ufg.br') return `https://ufg.br/events?event=${ev.id}`;
  if (ev?.url && /^https?:\/\//i.test(ev.url)) return ev.url;
  return cleanBase;
}

function parseEventItem(ev, sourceName = 'eventos', baseUrl = 'https://ufg.br') {
  const name = ev.name || '';
  const information = extractText(ev.information || '');
  const beginAt = ev.begin_at || '';
  const endAt = ev.end_at || '';
  const place = ev.place || '';
  const image = ev.image || '';
  const categories = ev.category_list || [];
  const viewCount = ev.view_count || 0;
  const externalUrl = ev.url && /^https?:\/\//i.test(ev.url) ? ev.url : '';
  const link = buildWebyEventLink(ev, baseUrl);

  // Combine name + information for text analysis
  const serviceText = [
    beginAt ? `Data: ${beginAt.slice(0, 10)}` : '',
    endAt ? `Fim: ${endAt.slice(0, 10)}` : '',
    place ? `Local: ${place}` : '',
    externalUrl ? `Inscricoes/informacoes: ${externalUrl}` : '',
  ].filter(Boolean).join('. ');
  const combinedText = `${name} ${serviceText}. ${information}`;

  return {
    title: name,
    text: combinedText,
    link,
    image,
    images: [image].filter(Boolean),
    date: ev.created_at || ev.updated_at || beginAt,
    createdAt: ev.created_at || null,
    updatedAt: ev.updated_at || ev.created_at || beginAt,
    eventStartsAt: beginAt,
    eventEndsAt: endAt || beginAt,
    raw: ev,
    nativeCategories: categories,
    place,
    endAt,
    externalUrl,
    relevantLinks: externalUrl ? {
      formularios: [],
      editais: [],
      paginasOficiais: [{ url: externalUrl, label: 'Página externa do evento', type: 'event' }],
      outros: [],
    } : null,
    viewCount,
    sourceKind: 'event',
    eventSource: sourceName,
  };
}

function filterUpcomingEvents(events) {
  const now = new Date();
  const lookahead = new Date();
  lookahead.setDate(lookahead.getDate() + EVENTS_LOOKAHEAD_DAYS);

  return events.filter(ev => {
    const beginAt = ev.raw?.begin_at || ev.eventStartsAt || ev.date;
    if (!beginAt) return false;
    const beginDate = new Date(beginAt);
    if (Number.isNaN(beginDate.getTime())) return false;
    const endAt = ev.raw?.end_at || ev.eventEndsAt || ev.endAt || beginAt;
    const endDate = new Date(endAt);
    const effectiveEnd = Number.isNaN(endDate.getTime()) ? beginDate : endDate;
    // Keep future or ongoing events, up to the lookahead window.
    return effectiveEnd >= now && beginDate <= lookahead;
  });
}

// ============================================================
// INSTAGRAM SOURCE
// ============================================================

function fetchInstagramPosts(handle) {
  void handle;
  throw new Error('Instagram API publica desativada. Use scan-ig-browser.js via browser autenticado.');
}

// ============================================================
// SUPABASE CACHE — v4.2: lê chave do .env.local para evitar chave expirada
// ============================================================

function getSupabaseKey() {
  // 2026-07-08 fix: also accept KINOCAMPUS_* prefix used in production docker .env
  const direct = process.env.CADU_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
    || process.env.KINOCAMPUS_SUPABASE_ANON_KEY || process.env.KINOCAMPUS_SUPABASE_KEY;
  if (direct) return direct.trim();
  const candidates = [
    path.join(process.cwd(), '.env.local'),
    '/data/.openclaw/workspace/kino-campus/services/cadu-ufg-publisher/.env.local',
  ];
  for (const envPath of candidates) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/^(?:CADU_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|KINOCAMPUS_SUPABASE_ANON_KEY|KINOCAMPUS_SUPABASE_KEY)=(.+)$/m);
      if (match) return match[1].trim().replace(/^['"]|['"]$/g, '');
    } catch (_) {}
  }
  return '';
}

async function loadPublishedPosts() {
  try {
    const key = getSupabaseKey();
    if (!key) throw new Error('CADU_SUPABASE_ANON_KEY ausente no ambiente');
    const resp = execSync(
      `curl -s --max-time 10 -H "apikey: ${key}" "${SUPABASE_URL}/rest/v1/posts?select=title,metadata&status=eq.published&limit=1000"`,
      { timeout: 12000, encoding: 'utf8', maxBuffer: 512 * 1024 }
    );
    if (!resp) return { titles: [], links: [] };
    const posts = JSON.parse(resp);
    const titles = posts.map(p => normalizeText(p.title || ''));
    // v4.2: extract BOTH link AND source_url for dedup
    const links = [];
    for (const p of posts) {
      const meta = p.metadata || {};
      if (meta.link) links.push(meta.link);
      if (meta.source_url && meta.source_url !== meta.link) links.push(meta.source_url);
    }
    console.log(`   📚 Cache: ${titles.length} posts publicados carregados`);
    return { titles, links };
  } catch (e) {
    return { titles: [], links: [] };
  }
}

// ============================================================
// FETCH INDIVIDUAL NEWS PAGE (for review+ items)
// ============================================================

function fetchNewsDetail(url) {
  const html = fetchUrl(url);
  if (!html || html.length < 200) return { text: '', html: '', image: '', images: [], pdfs: [], relevantLinks: null };

  let text = extractText(html);
  // HARDENING 2026-06-04: Sanitize portal junk
  text = cleanRawText(text);
  // Extract image from the news page — v4.2: reject SVGs
  const imgMatch = html.match(/<img[^>]+src="([^"]+weby\/up\/\d+\/o\/[^"]+\.(png|jpg|jpeg))"/i) ||
    html.match(/<img[^>]+src="(https?:\/\/files\.cercomp\.ufg\.br\/weby\/[^"]+)"/i);
  let image = imgMatch ? imgMatch[1] : '';
  // v4.2: Reject SVG images (logos institucionais) — handle query strings
  if (image && image.toLowerCase().split('?')[0].endsWith('.svg')) image = '';
  const images = extractImages(html, url, image);
  image = images[0] || image;
  // v4.3 (2026-06-08): Extract relevant links for post CTA
  const relevantLinks = extractRelevantLinks(html, url);

  return { text: text.slice(0, 4000), html, image, images, pdfs: extractPdfLinks(html), relevantLinks };
}

// ============================================================
// PARSE WEBY JSON
// ============================================================

function parseWebyJson(json, sourceName, limit) {
  const items = [];
  const data = json?.news || json?.items || json?.data || [];
  const arr = Array.isArray(data) ? data.slice(0, limit) : [];
  for (const item of arr) {
    const title = item.title || item.titulo || '';
    // v4.3: Use item.text (full body HTML) first, fall back to summary
    // The JSON API has: summary (short excerpt) AND text (full article body)
    const rawText = item.text || item.summary || item.description || item.body || item.resumo || '';
    const text = extractText(rawText);
    const link = item.link || item.url || item.href ||
      (item.id ? `https://${sourceName === 'ufg' ? 'www.ufg.br' : sourceName + '.ufg.br'}/n/${item.id}` : '');
    let image = item.image || item.imagem || item.image_url || '';
    // v4.2: Reject SVG images (logos institucionais) — handle query strings
    if (image && image.toLowerCase().split('?')[0].endsWith('.svg')) image = '';
    // v4.4 P0-BugFix-4: Reject institutional templates (ofícios) também aqui
    if (image && isInstitutionalImage(image)) image = '';
    const createdAt = item.created_at || item.date || item.published_at || '';
    const updatedAt = item.updated_at || item.modified_at || item.changed_at || createdAt;
    const sourceKind = item.sourceKind || item.source_kind || item.kind || 'news';
    const eventStartsAt = item.begin_at || item.event_starts_at || null;
    const eventEndsAt = item.end_at || item.event_ends_at || null;
    // v4.3: Extract native categories from the API
    const nativeCategories = item.category_list || [];
    items.push({
      title,
      text,
      link,
      image,
      images: [image].filter(Boolean),
      date: createdAt,
      createdAt,
      updatedAt,
      sourceKind,
      eventStartsAt,
      eventEndsAt,
      raw: item,
      nativeCategories,
    });
  }
  return items;
}

function parseWebyEventsJson(json, sourceName, baseUrl, limit) {
  const data = json?.events || [];
  const arr = Array.isArray(data) ? data.slice(0, limit) : [];
  return arr.map(ev => parseEventItem(ev, sourceName, baseUrl));
}

// ============================================================
// v4.5.2: Helper para localizar o tier de um site
// ============================================================
function getSiteTier(name) {
  for (const [tier, data] of Object.entries(TIERS)) {
    if (data.sites && data.sites[name]) return parseInt(tier);
  }
  return null;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(`\n🔍 CuraDOR UFg v4.0 — Modo: ${MODE.toUpperCase()}`);
  console.log(`${'='.repeat(60)}\n`);

  // Load cache
  console.log('📚 Carregando cache de posts publicados...');
  const cache = await loadPublishedPosts();
  const publishedTitles = cache.titles;
  const publishedLinks = cache.links;

  const allResults = [];
  const publishable = [];
  const reviewable = [];
  const discarded = [];
  const instagramHits = [];
  const processedIds = new Set(); // v4.3 P1-7: Cross-site dedup by numeric ID
  const seenRunLinks = new Set();
  const seenRunTitles = [];

  function currentRunDuplicateReason(url, title) {
    if (url && seenRunLinks.has(url)) return 'run_link_duplicate';
    const normalized = normalizeText(title || '');
    if (normalized.length < 15) return null;
    const short = normalized.slice(0, 30);
    const long = normalized.slice(0, 50);
    const hit = seenRunTitles.some(seen => (
      (short.length > 15 && seen.includes(short)) ||
      (long.length > 20 && seen.includes(long)) ||
      (long.length > 20 && normalized.includes(seen.slice(0, 50)))
    ));
    return hit ? 'run_title_duplicate' : null;
  }

  function rememberRunItem(url, title) {
    if (url) seenRunLinks.add(url);
    const normalized = normalizeText(title || '');
    if (normalized.length >= 15) seenRunTitles.push(normalized);
  }

  // Process tiers
  const tiersToProcess = MODE === 'ig-only' ? [] :
    (MODE === 'quick' ? [1] : (MODE === 'daily' ? [1, 2] : [1, 2, 3]));

  let siteCount = 0;
  let jsonHits = 0;
  let eventJsonHits = 0;
  let localEventHits = 0;
  let htmlFallbacks = 0;

  // --- SITES ---
  for (const tier of tiersToProcess) {
    const tierData = TIERS[tier];
    if (!tierData) continue;
    console.log(`\n📡 Tier ${tier} — ${tierData.label} (${Object.keys(tierData.sites).length} sites)`);

    for (const [name, site] of Object.entries(tierData.sites)) {
      siteCount++;
      const baseUrl = site.url;
      const progressBar = '▌'.repeat(Math.min(5, Math.ceil(siteCount / 10)));
      process.stdout.write(`\r  ${progressBar} ${name.padEnd(18)} `);

      const effectiveLimit = site.numItemsOverride || tierData.numItems;
      const eventLimit = site.eventItemsOverride || Math.min(20, effectiveLimit);

      // Events first: KinoCampus has an explicit eventos module, and Weby unit
      // calendars expose future events better than news feeds.
      let items = [];
      const eventsJsonUrl = `${baseUrl}/events.json`;
      const eventsJsonData = fetchJson(eventsJsonUrl);
      if (eventsJsonData) {
        eventJsonHits++;
        const parsedEvents = parseWebyEventsJson(eventsJsonData, name, baseUrl, eventLimit);
        const upcomingEvents = filterUpcomingEvents(parsedEvents).slice(0, eventLimit);
        localEventHits += upcomingEvents.length;
        items.push(...upcomingEvents);
      }

      // News second: keep it for editais, inscricoes, bolsas, chamadas and
      // event announcements that are not present in events.json.
      const jsonUrl = `${baseUrl}/news.json`;
      const jsonData = fetchJson(jsonUrl);

      if (jsonData) {
        jsonHits++;
        // v4.5.2: usar numItemsOverride se definido no site, senão tierData.numItems
        items.push(...parseWebyJson(jsonData, name, effectiveLimit));
      }

      // HTML fallback
      if (items.length === 0) {
        const html = fetchUrl(baseUrl + '/news');
        if (html) {
          htmlFallbacks++;
          const linkRegex = /href="([^"]*\/[en]\/(\d+)[^"]*)"/gi;
          let match;
          while ((match = linkRegex.exec(html)) !== null) {
            let l = match[1];
            if (l.startsWith('/')) l = baseUrl + l;
            const newsHtml = fetchUrl(l);
            if (newsHtml) {
              const titleMatch = newsHtml.match(/<title>([^<]+)<\/title>/);
              const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Sem título';
              const text = extractText(newsHtml);
              items.push({ title, text: text.slice(0, 500), link: l, image: '', images: [], date: '' });
            }
            if (items.length >= (site.numItemsOverride || tierData.numItems)) break;
          }
        }
      }

      if (items.length === 0) {
        process.stdout.write('⚠️');
        continue;
      }

      // Classify each item
      let count = 0;
      const itemLimit = effectiveLimit + eventLimit;
      for (const item of items.slice(0, itemLimit)) {
        // v4.3 P1-7: Cross-site dedup by numeric news ID
        const newsId = (item.link || '').match(/\/n\/(\d+)/);
        const numericId = newsId ? newsId[1] : null;
        if (numericId && processedIds.has(numericId)) {
          // Already processed from another site — skip entirely
          continue;
        }
        if (numericId) processedIds.add(numericId);
        count++;

        const combinedText = `${item.title} ${item.text}`;

        // Initial classification
        const classificationContext = {
          created_at: item.createdAt || item.date,
          updated_at: item.updatedAt || item.date,
          nativeCategories: item.nativeCategories,
          sourceKind: item.sourceKind || 'news',
          eventStartsAt: item.eventStartsAt || null,
          eventEndsAt: item.eventEndsAt || null,
          relevantLinks: item.relevantLinks || null,
        };
        let classification = classifyItem(
          item.title, item.text, '', name, item.link,
          classificationContext
        );

        // For review+ items: fetch individual page for full text
        let fullText = item.text;
        let image = item.image;
        let images = Array.isArray(item.images) ? item.images : [item.image].filter(Boolean);
        let pdfs = [];
        let relevantLinks = null; // v4.3 — extracted from page
        let detailHtml = '';
        let finalTemporal = classification.temporal;

        if (classification.decision === 'publish' || classification.decision === 'review' || classification.shouldHydrate) {
          // v4.5.2 P0-Fix-ForceDetail: sites sem fullText (prograd/farmacia/cepae/seinfra)
          // SEMPRE fazem fetch detail, mesmo se text.length >= 500
          const siteConfig = TIERS[getSiteTier(name)]?.sites?.[name] || {};
          const forceDetail = siteConfig.forceDetailFetch === true;
          // v4.5.2: também fetch se detectou "Link para inscrição" (texto curto mas tem URL real)
          const hasInscrLink = /\b(Link\s+para\s+(?:inscri[çc][aã]o|inscrever|inscrever-se)|Inscri[çc][oõ]es?\s*[:\)]|Inscreva-se)\b/i.test(fullText || '');
          // v4.3: Skip detail fetch if API already gave us plenty of text (saves ~80% of time)
          if (classification.shouldHydrate || forceDetail || hasInscrLink || !fullText || fullText.length < 500) {
            const pageDetail = fetchNewsDetail(item.link);
            fullText = pageDetail.text || fullText;
            detailHtml = pageDetail.html || '';
            image = pageDetail.image || image;
            images = (pageDetail.images && pageDetail.images.length) ? pageDetail.images : images;
            pdfs = pageDetail.pdfs;
            // v4.5.2: extrair relevantLinks sempre que faz detail fetch (force ou hasInscrLink)
            if (pageDetail.relevantLinks) {
              relevantLinks = pageDetail.relevantLinks;
            }
          } else {
            // API already gave full text — just use it
            // But still try to extract better images if current is SVG or empty
            if (!image || (image.toLowerCase().split('?')[0].endsWith('.svg'))) {
              const pageDetail = fetchNewsDetail(item.link);
              detailHtml = pageDetail.html || '';
              image = pageDetail.image || image;
              if (pageDetail.images && pageDetail.images.length) images = pageDetail.images;
              pdfs = pageDetail.pdfs;
              if (pageDetail.relevantLinks) relevantLinks = pageDetail.relevantLinks;
            }
          }

          // Re-analyze with full text
          if (fullText) {
            classification = classifyItem(
              item.title,
              fullText,
              detailHtml,
              name,
              item.link,
              { ...classificationContext, relevantLinks }
            );
            finalTemporal = classification.temporal;
          }
        }

        // Check against published cache (link exact match > title fuzzy match)
        const isLinkDuplicate = item.link && publishedLinks.includes(item.link);
        const normalizedTitle = normalizeText(item.title);

        // v4.5.3 (2026-06-11) DEDUP v2: heurísticas mais agressivas
        // Casos reais de duplicação que passaram despercebidos:
        // - "IPHAN e UFG divulgam selecionados..." vs "IPHAN e UFG realizam projeto..."
        //   → primeira parte igual (IPHAN e UFG ... projeto Café e Cultura na Casa do)
        // - "Edital SRI nº 06/2026 — Mobilidade MARCA Agronomia" vs "Publicado edital para a Mobilidade Marca"
        //   → "Mobilidade Marca" no meio de ambos
        // - "Enade 2026: confira os cursos participantes" vs "Confira os cursos participantes do Enade 2026"
        //   → apenas "Enade 2026" + "confira os cursos participantes" compartilhados
        // Patch: usar Jaccard + Levenshtein + extrair "pivot tokens" (palavras-chave compartilhadas)

        // 1) Helper: extrair tokens significativos (ignorar stopwords)
        const stopWords = new Set(['a', 'o', 'de', 'da', 'do', 'e', 'para', 'em', 'no', 'na', 'os', 'as', 'dos', 'das', 'um', 'uma', 'uns', 'umas', 'por', 'com', 'sobre', 'aos', 'do', 'da', 'das', 'dos', 'no', 'na', 'pelo', 'pela']);
        function tokens(s) {
          return new Set((s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t)));
        }
        function jaccard(a, b) {
          const A = tokens(a), B = tokens(b);
          if (A.size === 0 || B.size === 0) return 0;
          let inter = 0;
          for (const t of A) if (B.has(t)) inter++;
          return inter / (A.size + B.size - inter);
        }
        // Heurística de pivot: extrair "tokens pivôs" (siglas, anos, eventos com nome) que devem match
        function pivotTokens(s) {
          const pivots = new Set();
          // Siglas 3+
          const acros = (s || '').match(/\b[A-Z]{3,}\b/g) || [];
          for (const a of acros) pivots.add(a.toLowerCase());
          // Anos
          const years = (s || '').match(/\b20\d{2}\b/g) || [];
          for (const y of years) pivots.add(y);
          // Edital NNN/YYYY
          const editais = (s || '').match(/\bedital\s+\d+\/\d+/gi) || [];
          for (const e of editais) pivots.add(e.toLowerCase().replace(/\s+/g, ' ').trim());
          return pivots;
        }
        // v4.2.1: Usar slice(0,50) para títulos curtos (menos chance de colisão entre entidades diferentes)
        // Mas também comparar slice(0,30) + slice(30,60) para cross-site duplicatas
        const isTitleDuplicate = !isLinkDuplicate && publishedTitles.some(pubTitle => {
          if (pubTitle.length < 15) return false;
          const short = normalizedTitle.slice(0, 30);
          const long = normalizedTitle.slice(0, 50);
          // Exact match on first 30 chars OR mutual containment of first 50 chars
          if ((short.length > 15 && pubTitle.includes(short)) ||
              (long.length > 20 && pubTitle.includes(long)) ||
              (long.length > 20 && normalizedTitle.includes(pubTitle.slice(0, 50)))) return true;
          // v4.5.3: Jaccard >= 0.40 entre títulos inteiros (era 0.45)
          // Caso real: "Publicado edital para a Mobilidade Marca" vs "Edital SRI nº 06/2026 — Mobilidade MARCA Agronomia" = 0.43
          if (jaccard(item.title || '', pubTitle) >= 0.40) return true;
          // v4.5.3: Pivot tokens — se houver 2+ pivots compartilhados, é duplicação
          const normPivots = pivotTokens(item.title || '');
          const pubPivots = pivotTokens(pubTitle);
          if (normPivots.size > 0 && pubPivots.size > 0) {
            let shared = 0;
            for (const p of normPivots) if (pubPivots.has(p)) shared++;
            if (shared >= 2) return true;
          }
          // v4.5.3: COMBO pivôs — pares de tokens que, juntos, indicam duplicação
          // Caso real: "edital" + "marca" ou "edital" + "enade" ou "iphan" + "ufg" + "café"
          const COMBOS = [
            ['edital', 'marca'],
            ['edital', 'enade'],
            ['edital', 'sisu'],
            ['edital', 'sisu+'],
            ['edital', 'conpeex'],
            ['conpeex', 'submissao'],
            ['movimento', 'empresa', 'junior'],
            ['empresa', 'junior'],
          ];
          for (const combo of COMBOS) {
            const allMatch = combo.every(c => tokens(item.title || '').has(c) || tokens(pubTitle).has(c));
            if (allMatch && combo.every(c => tokens(item.title || '').has(c) || tokens(pubTitle).has(c)) && combo.some(c => tokens(item.title || '').has(c)) && combo.some(c => tokens(pubTitle).has(c))) {
              return true;
            }
          }
          // v4.5.3 (refinamento 11:56 BRT): excluir falsos positivos
          // 1) Editais com números diferentes (edital 06/2026 ≠ edital 07/2026)
          const extractEditalNum = (s) => {
            const m = s.match(/n[º°°]?\s*(\d+)\s*\/\s*(\d{4})/i);
            return m ? `${m[1]}/${m[2]}` : null;
          };
          const numA = extractEditalNum(item.title || '');
          const numB = extractEditalNum(pubTitle);
          if (numA && numB && numA !== numB) return false;
          // 2) Um é "Resultado X" e o outro é aviso original
          const isResultA = /^(resultado|publicado|divulgado|aprovado|selecionados?|homologa[cç][aã]o)/i.test((item.title || '').trim());
          const isResultB = /^(resultado|publicado|divulgado|aprovado|selecionados?|homologa[cç][aã]o)/i.test(pubTitle.trim());
          if (isResultA !== isResultB) return false;
          // 3) Whitelist PPGs: se o título contém sigla de PPG conhecido, não dedup
          // PPGEAS, PPGCF, PPGECOEVOL, PPGECOFVOL, PPGECON, PPGGMP, PPGG, etc são programas diferentes
          const PPG_PROGRAMS = ['ppgeas', 'ppgecoevol', 'ppgecofvol', 'ppgecon', 'ppggecon', 'ppgfcf', 'ppgcf', 'ppgfmp', 'ppgmp', 'ppgf', 'ppgg', 'ppgfmp', 'ppgcont', 'ppggp', 'ppge', 'ppga', 'ppgeco', 'ppgedu', 'ppggg', 'ppgh', 'ppgi', 'ppgm', 'ppgo', 'ppgq', 'ppgta', 'ppgodonto', 'ppgfarma', 'ppgfisio', 'ppggd', 'ppggt'];
          const normLower = (item.title || '').toLowerCase().replace(/[^a-z]/g, '');
          const pubLower = pubTitle.toLowerCase().replace(/[^a-z]/g, '');
          if (PPG_PROGRAMS.some(p => normLower.includes(p)) || PPG_PROGRAMS.some(p => pubLower.includes(p))) {
            // É PPG — verificar se é o MESMO PPG (se for, dedup; se for diferente, skip)
            const ppgA = PPG_PROGRAMS.find(p => normLower.includes(p));
            const ppgB = PPG_PROGRAMS.find(p => pubLower.includes(p));
            if (ppgA && ppgB && ppgA !== ppgB) return false;
          }
          return false;
        });
        // v4.2.1: Cross-source dedup: check if same event appears on multiple unit sites
        // Strategy: extract roman numeral + event keyword OR standalone acronym (WIDaT, SIEPE, etc.)
        const isCrossSourceDup = !isLinkDuplicate && !isTitleDuplicate && publishedTitles.some(pubTitle => {
          if (pubTitle.length < 15) return false;
          // Pattern A: "IX WIDaT" / "IX Workshop de Informação" — roman numeral + event keyword
          const acroPattern1 = /(i[xv]+|\d+)\s*(workshop|seminario|encontro|congresso|simposio|conferencia|feira|jornada|widat|siepe|conpeex|coemco|semex|senpex|mostra|festival)/i;
          const normMatch1 = normalizedTitle.match(acroPattern1);
          const pubMatch1 = pubTitle.match(acroPattern1);
          if (normMatch1 && pubMatch1) {
            const normKey = normMatch1[0].replace(/\s+/g, '').toLowerCase();
            const pubKey = pubMatch1[0].replace(/\s+/g, '').toLowerCase();
            if (normKey === pubKey) return true;
          }
          // Pattern B: standalone acronyms (WIDaT, WIDAT, SIEPE, CONPEEX, COEMCO, etc.)
          // Extract 3+ letter uppercase acronyms from both titles
          const acroPattern2 = /\b([A-Z]{3,}(?:\/[A-Z]{3,})?)\b/g;
          const normAcros = [];
          const pubAcros = [];
          let m;
          const origTitle = item.title; // non-normalized for acronym detection
          while ((m = acroPattern2.exec(origTitle)) !== null) normAcros.push(m[1].toLowerCase());
          acroPattern2.lastIndex = 0;
          // For pubTitle we need the original — but publishedTitles is normalized.
          // Fallback: check if normalized version contains acronym-like tokens
          // (WIDaT → widat after normalizeText, SIEPE → siepe, etc.)
          const knownAcros = ['widat', 'siepe', 'conpeex', 'coemco', 'semex', 'senpex',
            'ceeo', 'conpeduc', 'cbeu', 'enacomp', 'erip', 'seminfo', 'enec'];
          for (const acro of knownAcros) {
            if (normalizedTitle.includes(acro) && pubTitle.includes(acro)) return true;
          }
          return false;
        });
        const runDuplicateReason = currentRunDuplicateReason(item.link, item.title);
        const isDuplicate = isLinkDuplicate || isTitleDuplicate || isCrossSourceDup || !!runDuplicateReason;
        if (isDuplicate && classification.decision !== 'discard') {
          classification.decision = 'discard';
          classification.reasons.push(runDuplicateReason || (isLinkDuplicate ? 'link_duplicate' : (isTitleDuplicate ? 'title_duplicate' : 'cross_source_duplicate')));
        }

        // v4.5.2: Detectar repost entre unidades UFG (V2)
        const officialSourceResult = detectOfficialSourceV2(item.link, fullText);
        const isRepost = officialSourceResult && typeof officialSourceResult === 'object' && officialSourceResult.repost;
        const finalSourceUrl = isRepost ? item.link : (detectOfficialSource(item.link, fullText, relevantLinks) || item.link);
        const itemRelevantLinks = relevantLinks || (item.externalUrl ? {
          formularios: [],
          editais: [],
          paginasOficiais: [{ url: item.externalUrl, label: 'Pagina externa do evento', type: 'event' }],
          outros: [],
        } : null);

        const record = {
          site: name,
          url: item.link,
          // v4.5.2 (2026-06-11): Detectar repost entre unidades UFG (V2)
          // Caso real: post Projeto Rondon (INF) é repost da PROEX. A V1 não detectou.
          sourceUrl: finalSourceUrl,
          // v4.5.2: marca repost para o publisher sinalizar visualmente
          repost: isRepost ? { originalUnit: officialSourceResult.originalUnit, currentUnit: officialSourceResult.currentUnit } : null,
          title: normalizeTitle(item.title),
          text: (fullText || '').slice(0, 2000),
          sourceId: name + ':' + finalSourceUrl,
          score: classification.score,
          decision: classification.decision,
          module: classification.module,
          category: classification.category,
          reasons: classification.reasons || [],
          dates: finalTemporal,
          image: image || '',
          images: images.slice(0, 5),
          pdfs: pdfs,
          relevantLinks: itemRelevantLinks, // v4.3: formularios, editais, paginas oficiais
          expired: classification.expired,
          duplicate: isDuplicate,
          // v5.1 (2026-06-10): Detecção de atualizações (prorrogação, retificação, etc)
          // NÃO vira novo post — deve enriquecer post existente via enrich-duplicates
          update: null, // preenchido abaixo
          updateType: null,
          updateSignals: [],
          // v5.0: Entity extraction for cross-unit dedup tracking
          entities: extractEntities(item.title, fullText, item.link),
          sourceKind: item.sourceKind || 'news',
          eventSource: item.eventSource || null,
          place: item.place || null,
          externalUrl: item.externalUrl || null,
          enrichmentSources: [
            { url: item.link, label: name, type: 'official' },
          ],
        };

        // v5.1: Detectar sinais de atualização no item
        const updateSig = detectUpdateSignals(item.title, fullText);
        if (updateSig.isUpdate) {
          record.update = true;
          record.updateType = updateSig.type;
          record.updateSignals = updateSig.signals;
          // v4.5.2 P0-Fix-Update: resultados/cancelamentos NÃO viram post novo.
          // Prorrogações e reaberturas podem virar (trazem info nova).
          const hasTerminalUpdateSignal = updateSig.type === 'resultado' ||
            updateSig.type === 'cancelamento' ||
            updateSig.signals.includes('keyword:resultado') ||
            updateSig.signals.includes('keyword:cancelamento');
          if (hasTerminalUpdateSignal) {
            classification.decision = 'discard';
            classification.reasons.push('update:' + updateSig.type);
          }
        }

        // Keep the persisted artifact consistent with post-update classification changes.
        record.decision = classification.decision;
        record.score = classification.score;
        record.expired = classification.expired;
        if (classification.decision !== 'discard' && !isDuplicate) {
          rememberRunItem(item.link, item.title);
        }

        allResults.push(record);
        if (classification.decision === 'publish') publishable.push(record);
        else if (classification.decision === 'review') reviewable.push(record);
        else discarded.push(record);
      }

      process.stdout.write(`${count} itens`);
    }
  }

  // --- EVENTOS (v4.3 P1-3) ---
  if (MODE !== 'ig-only') {
    console.log(`\n\n📅 EVENTOS — buscando próximos eventos...`);
    try {
      const allEvents = fetchEvents();
      console.log(`   📥 ${allEvents.length} eventos carregados (${EVENTS_MAX_PAGES} páginas)`);

      const parsed = allEvents.map(ev => parseEventItem(ev));
      const upcomingEvents = filterUpcomingEvents(parsed);
      console.log(`   ⏳ ${upcomingEvents.length} eventos futuros (próx. ${EVENTS_LOOKAHEAD_DAYS} dias)`);

      let eventCount = 0;
      for (const ev of upcomingEvents) {
        eventCount++;
        const classification = classifyItem(
          ev.title, ev.text, '', 'eventos', ev.link,
          {
            created_at: ev.createdAt || ev.raw?.created_at || ev.updatedAt || null,
            updated_at: ev.updatedAt || ev.createdAt || null,
            nativeCategories: ev.nativeCategories,
            sourceKind: ev.sourceKind,
            eventStartsAt: ev.eventStartsAt || ev.raw?.begin_at || null,
            eventEndsAt: ev.eventEndsAt || ev.endAt || ev.raw?.end_at || ev.eventStartsAt || null,
            relevantLinks: ev.relevantLinks || null,
          }
        );

        const evCategory = detectEventCategory(ev.title + ' ' + ev.text);

        const nt = normalizeText(ev.title).slice(0, 40);
        const runDuplicateReason = currentRunDuplicateReason(ev.link, ev.title);
        const isDup = publishedLinks.includes(ev.link) ||
          !!runDuplicateReason ||
          publishedTitles.some(pt => pt.includes(nt) || nt.includes(pt.slice(0, 40)));

        if (isDup && classification.decision !== 'discard') {
          classification.decision = 'discard';
          classification.reasons.push(runDuplicateReason || 'duplicate');
        }

        const record = {
          site: 'eventos',
          url: ev.link,
          sourceUrl: ev.link,
          title: normalizeTitle(ev.title),
          text: (ev.text || '').slice(0, 2000),
          sourceId: 'eventos:' + ev.raw.id,
          score: classification.score,
          decision: classification.decision,
          module: 'eventos',
          category: evCategory,
          reasons: classification.reasons || [],
          dates: {
            ...classification.temporal,
            beginAt: ev.eventStartsAt || ev.raw?.begin_at || null,
            endAt: ev.eventEndsAt || ev.endAt || ev.raw?.end_at || null,
          },
          image: ev.image || '',
          images: ev.images.slice(0, 5),
          pdfs: [],
          relevantLinks: ev.externalUrl ? {
            formularios: [],
            editais: [],
            paginasOficiais: [{ url: ev.externalUrl, label: 'Pagina externa do evento', type: 'event' }],
            outros: [],
          } : null,
          expired: false,
          duplicate: isDup,
          // v5.0: Entity extraction for cross-unit dedup tracking
          entities: extractEntities(ev.title, ev.text || ev.information || '', ev.link),
          sourceKind: ev.sourceKind || 'event',
          eventSource: ev.eventSource || 'eventos',
          place: ev.place || null,
          externalUrl: ev.externalUrl || null,
          enrichmentSources: [
            { url: ev.link, label: 'Eventos UFG', type: 'event' },
          ],
        };

        allResults.push(record);
        if (classification.decision !== 'discard' && !isDup) {
          rememberRunItem(ev.link, ev.title);
        }
        if (classification.decision === 'publish') publishable.push(record);
        else if (classification.decision === 'review') reviewable.push(record);
        else discarded.push(record);
      }
      process.stdout.write(`   ${eventCount} itens classificados\n`);
    } catch (e) {
      console.log(`   ⚠️ Eventos falhou: ${e.message.slice(0, 80)}`);
    }
  }

  // --- INSTAGRAM via BROWSER CDP (v4.2) ---
  // API pública web_profile_info foi descartada por shadow ban.
  // Agora usamos scan-ig-browser.js (WebSocket CDP no browser autenticado).
  if (MODE === 'full' || MODE === 'ig-only') {
    console.log('\n\n📸 INSTAgram via Browser — buscando posts...');
    console.log('   (API pública descartada — usando browser autenticado)');

    try {
      // Call the browser IG scanner
      const igScript = path.join(__dirname, 'scan-ig-browser.js');
      const igJson = execSync(
        `node "${igScript}" --json 2>/dev/null`,
        { timeout: 180000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }
      );
      
      // Load IG results from the output file
      const igFile = path.join(IG_DIR, `ig-browser-${TIMESTAMP}.json`);
      if (fs.existsSync(igFile)) {
        const igData = JSON.parse(fs.readFileSync(igFile, 'utf8'));
        const igResults = igData.results || [];
        
        for (const profile of igResults) {
          for (const post of (profile.posts || [])) {
            if (!post.relevant) continue;
            
            // Check against published (link + title)
            if (publishedLinks.includes(post.link)) continue;
            
            const nt = normalizeText(post.text || post.title);
            const inc = INCLUDE_TERMS.filter(t => has(nt, t));
            
            const oppScore = OPP_SIGNALS.filter(t => has(nt, t)).length;
            const evtScore = EVT_SIGNALS.filter(t => has(nt, t)).length;
            
            let score = 0.20;
            score += Math.min(inc.length * 0.08, 0.48);
            score = Math.max(0, Math.min(1, Number(score.toFixed(2))));
            
            const module = oppScore > evtScore ? 'oportunidades' : 'eventos';
            const category = module === 'oportunidades' ? detectOpportunityCategory(nt) : detectEventCategory(nt);
            
            let decision;
            if (score >= PUBLISH_THRESHOLD) decision = 'publish';
            else if (score >= REVIEW_THRESHOLD) decision = 'review';
            else decision = 'discard';
            
            const record = {
              site: post.source || `ig:@${profile.handle}`,
              url: post.link,
              sourceUrl: post.link,
              title: post.title,
              text: post.text || '',
              sourceId: `ig:${profile.handle}:${post.link.split('/').pop()}`,
              score, decision, module, category,
              dates: {
                futureDates: Array.isArray(post.futureDates) ? post.futureDates : [],
                hasDeadline: post.hasDeadline === true,
                sourcePublishedDate: post.date || '',
              },
              image: post.image || '',
              images: [post.image].filter(Boolean),
              pdfs: [],
              expired: false,
              source: 'instagram',
              enrichmentSources: [
                { url: post.link, label: `Instagram @${profile.handle}`, type: 'instagram' },
              ],
            };
            
            // Cross-source dedup
            const igNormTitle = normalizeText(post.title).slice(0, 40);
            const alreadyExists = allResults.some(r => normalizeText(r.title).slice(0, 40) === igNormTitle);
            if (alreadyExists) continue;
            
            allResults.push(record);
            instagramHits.push(record);
            if (decision === 'publish') publishable.push(record);
            else if (decision === 'review') reviewable.push(record);
            else discarded.push(record);
          }
        }
        console.log(`   ✅ ${instagramHits.length} posts relevantes classificados`);
      }
    } catch (e) {
      console.log(`   ⚠️ Browser IG falhou: ${e.message.slice(0, 80)}`);
      console.log(`   💡 Execute manualmente: node scripts/scan-ig-browser.js`);
    }
  }  // ============================================================
  // RELATÓRIO
  // ============================================================
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 RELATÓRIO CURADORIA v4.2');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Modo:        ${MODE.toUpperCase()}`);
  console.log(`  Sites:       ${siteCount}`);
  console.log(`  JSON hits:   ${jsonHits} | HTML: ${htmlFallbacks}`);
  console.log(`  Eventos:     ${localEventHits} futuros locais (${eventJsonHits} calendars)`);
  console.log(`  Instagram:   ${instagramHits.length} posts`);
  console.log(`  Total itens: ${allResults.length}`);
  console.log(`  ✅ PUBLISH:  ${publishable.length}`);
  console.log(`  🔍 REVIEW:   ${reviewable.length}`);
  console.log(`  ❌ DESCART:  ${discarded.length} (${discarded.filter(d=>d.expired).length} expirados, ${discarded.filter(d=>d.duplicate).length} duplicados)`);
  
  // Publishable
  if (publishable.length > 0) {
    console.log(`\n✅ PUBLICÁVEIS:`);
    for (const item of publishable) {
      console.log(`  [${item.score.toFixed(2)}] ${item.module}/${item.category} — ${item.site}`);
      console.log(`  📝 ${item.title.slice(0, 90)}`);
      console.log(`  🔗 ${item.url}`);
      if (item.image) console.log(`  🖼️  ${item.image.slice(0, 80)}`);
      if (item.dates.futureDates?.length) console.log(`  📅 ${item.dates.futureDates.join(', ')}`);
      console.log('');
    }
  }
  
  // Review
  if (reviewable.length > 0) {
    console.log(`\n🔍 REVISÃO (${reviewable.length} itens):`);
    for (const item of reviewable.slice(0, 20)) {
      console.log(`  [${item.score.toFixed(2)}] ${item.module}/${item.category} — ${item.site}`);
      console.log(`  📝 ${item.title.slice(0, 80)}`);
    }
    if (reviewable.length > 20) console.log(`  ... +${reviewable.length - 20} mais`);
  }
  
  // Save output
  const outFile = path.join(BASE_DIR, `curadoria-v4.4-${MODE}-${TIMESTAMP}.json`);
  fs.mkdirSync(BASE_DIR, { recursive: true });
  
  const output = {
    version: "4.2",
    mode: MODE,
    timestamp: new Date().toISOString(),
    thresholds: { publish: PUBLISH_THRESHOLD, review: REVIEW_THRESHOLD },
    stats: {
      totalSites: siteCount,
      jsonHits,
      eventJsonHits,
      localEventHits,
      htmlFallbacks,
      instagramHits: instagramHits.length,
      totalItems: allResults.length,
      publishable: publishable.length,
      reviewable: reviewable.length,
      discarded: discarded.length,
      expiredDiscarded: discarded.filter(d => d.expired).length,
      duplicateDiscarded: discarded.filter(d => d.duplicate).length,
    },
    publishable,
    reviewable,
    discarded,
  };
  
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\n📁 Relatório salvo: ${outFile}`);
  console.log();
}

if (require.main === module) {
  main().catch(e => { console.error('💥', e.message); process.exit(1); });
}

module.exports = {
  analyzeTemporalRelevance,
  classifyItem,
  has,
  parseEventItem,
  parseDatePt,
  parseWebyJson,
};
