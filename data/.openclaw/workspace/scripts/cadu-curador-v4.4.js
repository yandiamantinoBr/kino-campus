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
 *   2. Adicionado Campus Cidade Ocidental ao Tier 2; `co.ufg.br` virou alias
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
 *   node cadu-curador-v4.4.js --daily --dry-run --output /tmp/run/curadoria.json
 *                                        → relatório efêmero, sem artefato canônico
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { writeJsonAtomic } = require('./lib/atomic-json-file.js');
const { normalizeImageUrl: normalizeCmsUrl, isThumbnailUrl } = require('./lib/image-utils.js');
const { resolveDryRunOutput } = require('./lib/dry-run-artifacts.js');
const { canonicalUrl } = require('./lib/canonical-url.js');
const { instagramPermalinkKey } = require('./lib/instagram-url.js');
const { fetchWithRetry } = require('./lib/network-fetch.js');
const {
  classifyInstagramPost: classifyScannedInstagramPost,
  getActiveInstagramHandles,
  instagramShortcode,
  resolveInstagramRunDateBrt,
  resolveInstagramSupervisorTimeout,
  validateInstagramArtifact,
} = require('./scan-ig-browser.js');

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

function clockInTimeZone(date, timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

const BASE_DIR = '/data/.openclaw/workspace/data/ufg-scrape';
const IG_DIR = '/data/.openclaw/workspace/data/ufg-instagram';
const configuredReferenceDate = process.env.CADU_REFERENCE_DATE
  ? new Date(process.env.CADU_REFERENCE_DATE)
  : null;
const configuredReferenceDateValid = configuredReferenceDate
  && !Number.isNaN(configuredReferenceDate.getTime());
const RUN_DATE_BRT = resolveInstagramRunDateBrt(
  process.env,
  configuredReferenceDateValid ? configuredReferenceDate : new Date(),
);
const pipelineReferenceDate = process.env.CADU_PIPELINE_RUN_ID
  ? new Date(`${RUN_DATE_BRT}T12:00:00-03:00`)
  : null;
const TODAY = configuredReferenceDateValid
  ? configuredReferenceDate
  : (pipelineReferenceDate || new Date());
const TODAY_ISO = configuredReferenceDateValid ? isoDateInTimeZone(TODAY) : RUN_DATE_BRT;
const TIMESTAMP = TODAY_ISO;
const CURRENT_YEAR = Number(TODAY_ISO.slice(0, 4));

// Helper: retorna data ISO de N dias atrás
function daysAgo(n) {
  const d = new Date(`${TODAY_ISO}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function parseCuratorArgs(argv) {
  const options = { mode: 'full', dryRun: false, output: null };
  let modeSeen = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (['--quick', '--daily', '--ig-only'].includes(arg)) {
      if (modeSeen) throw new Error('informe exatamente um modo do curador');
      options.mode = arg.slice(2);
      modeSeen = true;
    } else if (arg === '--dry-run') {
      if (options.dryRun) throw new Error('argumento duplicado: --dry-run');
      options.dryRun = true;
    } else if (arg === '--output') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--output requer um caminho');
      if (options.output) throw new Error('argumento duplicado: --output');
      options.output = value;
    } else {
      throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  return options;
}
const CURATOR_OPTIONS = require.main === module
  ? parseCuratorArgs(process.argv.slice(2))
  : { mode: 'full', dryRun: false, output: null };
const MODE = CURATOR_OPTIONS.mode;
const DRY_RUN = CURATOR_OPTIONS.dryRun;
const REQUESTED_OUTPUT_FILE = CURATOR_OPTIONS.output;
const EXPLICIT_OUTPUT_FILE = resolveDryRunOutput(REQUESTED_OUTPUT_FILE, {
  dryRun: DRY_RUN,
  label: 'Curator output',
});
const PIPELINE_RUN_ID = String(process.env.CADU_PIPELINE_RUN_ID || crypto.randomUUID());

const PUBLISH_THRESHOLD = 0.70; // Workflow Hardening 2026-06-01
const REVIEW_THRESHOLD = 0.50; // v4.4.2: 0.55 → 0.50 (mais itens em revisão manual)

// Supabase config (read from publisher .env)
const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';

const CURATOR_SOURCE_BINDINGS_PATH = path.join(__dirname, 'cadu-curator-source-bindings.json');
const CURATOR_SOURCE_BINDINGS_SCHEMA_VERSION = 1;

function normalizedTextSha256(value) {
  return crypto.createHash('sha256')
    .update(String(value).replace(/\r\n?/g, '\n'), 'utf8')
    .digest('hex');
}

function validateCuratorSourceBindingsArtifact(artifact, {
  curatorSourceText,
} = {}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new Error('curator source bindings must be an object');
  }
  const expectedRootKeys = [
    'bindings',
    'curatorScriptSha256',
    'registrySha256',
    'registryVersion',
    'schemaVersion',
  ];
  const rootKeys = Object.keys(artifact).sort();
  if (JSON.stringify(rootKeys) !== JSON.stringify(expectedRootKeys)) {
    throw new Error(`curator source bindings have unexpected keys: ${rootKeys.join(',')}`);
  }
  if (artifact.schemaVersion !== CURATOR_SOURCE_BINDINGS_SCHEMA_VERSION) {
    throw new Error(`unsupported curator source binding schema: ${String(artifact.schemaVersion)}`);
  }
  if (!/^20\d{2}-\d{2}-\d{2}\.[1-9]\d*$/.test(artifact.registryVersion)) {
    throw new Error('curator source bindings have an invalid registryVersion');
  }
  for (const field of ['registrySha256', 'curatorScriptSha256']) {
    if (!/^[0-9a-f]{64}$/.test(artifact[field])) {
      throw new Error(`curator source bindings have an invalid ${field}`);
    }
  }
  if (typeof curatorSourceText !== 'string') {
    throw new Error('curator source text is required to validate source bindings');
  }
  const actualScriptSha256 = normalizedTextSha256(curatorSourceText);
  if (!crypto.timingSafeEqual(
    Buffer.from(actualScriptSha256, 'hex'),
    Buffer.from(artifact.curatorScriptSha256, 'hex'),
  )) {
    throw new Error('curator source binding script hash mismatch');
  }
  if (!Array.isArray(artifact.bindings) || artifact.bindings.length < 1 || artifact.bindings.length > 500) {
    throw new Error('curator source bindings must contain 1-500 bindings');
  }
  const legacyIds = new Set();
  const sourceIds = new Set();
  const bindings = artifact.bindings.map((binding, index) => {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
      throw new Error(`curator source binding ${index} must be an object`);
    }
    const keys = Object.keys(binding).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['legacyId', 'sourceId'])) {
      throw new Error(`curator source binding ${index} has unexpected keys`);
    }
    const legacyId = String(binding.legacyId || '').trim().toLowerCase();
    const sourceId = String(binding.sourceId || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]{0,119}$/.test(legacyId) || legacyId !== binding.legacyId) {
      throw new Error(`curator source binding ${index} has an invalid legacyId`);
    }
    if (!/^web\.[a-z0-9][a-z0-9.-]{0,159}$/.test(sourceId) || sourceId !== binding.sourceId) {
      throw new Error(`curator source binding ${index} has an invalid sourceId`);
    }
    if (legacyIds.has(legacyId)) throw new Error(`duplicate curator binding legacyId: ${legacyId}`);
    if (sourceIds.has(sourceId)) throw new Error(`duplicate curator binding sourceId: ${sourceId}`);
    legacyIds.add(legacyId);
    sourceIds.add(sourceId);
    return Object.freeze({ legacyId, sourceId });
  });
  const sortedLegacyIds = [...legacyIds].sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
  if (bindings.some((binding, index) => binding.legacyId !== sortedLegacyIds[index])) {
    throw new Error('curator source bindings must be sorted by legacyId');
  }
  return Object.freeze({
    schemaVersion: artifact.schemaVersion,
    registryVersion: artifact.registryVersion,
    registrySha256: artifact.registrySha256,
    curatorScriptSha256: artifact.curatorScriptSha256,
    bindings: Object.freeze(bindings),
  });
}

function loadCuratorSourceBindings(filePath = CURATOR_SOURCE_BINDINGS_PATH, scriptPath = __filename) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.size < 2 || stat.size > 128 * 1024) {
    throw new Error('curator source binding artifact must be a regular JSON file no larger than 128 KiB');
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const artifact = JSON.parse(raw);
  return validateCuratorSourceBindingsArtifact(artifact, {
    curatorSourceText: fs.readFileSync(scriptPath, 'utf8'),
  });
}

const CURATOR_SOURCE_BINDINGS = loadCuratorSourceBindings();
const CURATOR_SOURCE_BINDING_INDEX = new Map(
  CURATOR_SOURCE_BINDINGS.bindings.map((binding) => [binding.legacyId, binding.sourceId]),
);

function resolveCanonicalSourceId(legacyId, site, bindingIndex = CURATOR_SOURCE_BINDING_INDEX) {
  const normalizedLegacyId = String(legacyId || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{0,119}$/.test(normalizedLegacyId)) {
    throw new Error(`invalid curator source legacy ID: ${normalizedLegacyId}`);
  }
  const expectedSourceId = bindingIndex instanceof Map
    ? bindingIndex.get(normalizedLegacyId)
    : null;
  if (!expectedSourceId) {
    throw new Error(`curator source has no canonical binding: ${normalizedLegacyId}`);
  }
  const explicitStableId = typeof site?.stableId === 'string' && site.stableId.trim()
    ? site.stableId.trim().toLowerCase()
    : null;
  if (explicitStableId && explicitStableId !== expectedSourceId) {
    throw new Error(
      `curator source ${normalizedLegacyId} stableId ${explicitStableId} does not match binding ${expectedSourceId}`,
    );
  }
  return expectedSourceId;
}

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
      // PROEX is the current canonical source. The former PROEC hostname is an
      // explicit redirect alias below and remains supported by historical text rules.
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
      'secplan': { url: 'https://secplan.ufg.br', ig: null },
      'propessoas': { url: 'https://propessoas.ufg.br', ig: 'propessoas_ufg' },
      'sdh': { url: 'https://sdh.ufg.br', ig: 'sdh_ufg' },
      'ciar': { url: 'https://ciar.ufg.br', ig: 'ciar_ufg' },
      'ipelab': { url: 'https://ipelab.ufg.br', ig: null },
      'pts': { url: 'https://parquesamambaia.ufg.br', ig: null },
      // Plataforma transacional Joomla, sem coleção editorial consumível.
      // Auditoria 2026-07-18: Weby endpoints 404 e feeds Joomla 200/vazios.
      'pitt': { url: 'https://pitt.prpi.ufg.br', ig: null, feedMode: 'none' },
      'jornal-ufg': { url: 'https://jornal.ufg.br', ig: null },
      // tvufg.org.br is WordPress (no /news.json). Keep for IG handle only; web scan skips via no-feed.
      'tvufg': { url: 'https://tvufg.org.br', ig: 'tvufg', feedMode: 'none' },
      // v4.7.1 (2026-07-18): promote reviewed PPG roots only after official
      // identity and live base/news/events/RSS transport checks. Catalog
      // landings that still lack a real collection remain explicit no-feed.
      // Ciencias Agrarias
      'ppgagro': { url: 'https://ppgagro.agro.ufg.br', ig: null },
      'ppgca': { url: 'https://ppgca.evz.ufg.br', ig: null },
      'ppgcta': { url: 'https://ppgcta.agro.ufg.br', ig: null },
      'ppggmp': { url: 'https://ppggmp.agro.ufg.br', ig: null },
      'ppgz': { url: 'https://ppgz.evz.ufg.br', ig: null },
      'ppga': { url: 'https://ppga.agro.ufg.br', ig: null },
      // Ciencias Exatas e da Terra
      'ppgcc': { url: 'https://ppgcc.inf.ufg.br', ig: 'ppgccufg' },
      // v4.6.2 (2026-07-15): feedUrl = Weby unit program-specific (verified /news.json).
      // Do NOT point feedUrl at shared portals (sic.ufg.br, weby.cercomp) — false positives.
      'ppgf': {
        url: 'https://pos.ufg.br/p/pos-graduacao-fisica-ppgf',
        feedUrl: 'https://posgraduacao.if.ufg.br',
        stableId: 'web.ufg.ppg.ppgf',
        newsAutoPublish: true,
        ig: null,
      },
      'ppgec': {
        url: 'https://pos.ufg.br/p/pos-graduacao-matematica-ppgime',
        feedUrl: 'https://posgraduacao.ime.ufg.br',
        stableId: 'web.ufg.ppg.ppgmat',
        newsAutoPublish: true,
        ig: null,
      },
      'ppgq': { url: 'https://ppgq.quimica.ufg.br', ig: null },
      'ppgea': { url: 'https://ppgea.fct.ufg.br', ig: null },
      'profmat': { url: 'https://profmat.ime.ufg.br', ig: null },
      // Ciencias Biologicas. Keep the PRPG directory page as identity evidence,
      // but collect only from the verified, program-specific Weby root.
      'ppgban': {
        url: 'https://pos.ufg.br/p/pos-graduacao-biodiversidade-animal-ppgban',
        feedUrl: 'https://biodiversidadeanimal.icb.ufg.br',
        stableId: 'web.ufg.ppg.ppgban',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgrph': {
        url: 'https://pos.ufg.br/p/pos-graduacao-biologia-relacao-parasito-hospedeiro',
        feedUrl: 'https://bioparasitohospedeiro.iptsp.ufg.br',
        stableId: 'web.ufg.ppg.ppgbrph',
        displayName: 'PPGBRPH',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgcb': {
        url: 'https://pos.ufg.br/p/pos-graduacao-ciencias-biologicas-ppgcb',
        feedUrl: 'https://pos.icb.ufg.br',
        stableId: 'web.ufg.ppg.ppgcb',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgecoevol': {
        url: 'https://pos.ufg.br/p/pos-graduacao-ecologia-evolucao-ppgecoecvol',
        feedUrl: 'https://ecoevol.ufg.br',
        stableId: 'web.ufg.ppg.ppgecoevol',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgmcf': { url: 'https://pos.ufg.br/p/pos-graduacao-multicentrico-ciencias-fisiologicas-ppgmcf', ig: null },
      'ppgbm': { url: 'https://pos.ufg.br/p/pos-graduacao-genetica-biologia-molecular', ig: null },
      'ppgbm-operational': { url: 'https://pgbm.icb.ufg.br', stableId: 'web.ufg.ppg.ppgbm', displayName: 'PPGBM', newsAutoPublish: true, ig: null },
      // Ciencias da Saude
      'ppgaas': { url: 'https://ppgaas.farmacia.ufg.br', ig: null },
      'ppgcs': {
        url: 'https://pos.ufg.br/p/pos-graduacao-ciencias-saude-ppgcs',
        feedUrl: 'https://cienciassaude.medicina.ufg.br',
        stableId: 'web.ufg.ppg.ppgcs',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgcf': { url: 'https://ppgcf.farmacia.ufg.br', ig: null },
      'ppgef': { url: 'https://pos.ufg.br/p/pos-graduacao-educacao-fisica-ppgef', ig: null },
      'ppgef-operational': {
        url: 'https://ppgef.fef.ufg.br',
        stableId: 'web.ufg.ppg.ppgef',
        displayName: 'PPGEF',
        newsAutoPublish: true,
        ig: null,
      },
      'proef': { url: 'https://pos.ufg.br/p/mestrado-profissional-educacao-fisica-rede-nacional-proef', ig: null },
      'ppgenf': { url: 'https://pos.ufg.br/p/pos-graduacao-enfermagem-ppgenf', ig: null },
      'ppgenfs-operational': {
        url: 'https://ppgenfs.fen.ufg.br',
        stableId: 'web.ufg.ppg.ppgenfs',
        displayName: 'PPGENFS',
        newsAutoPublish: true,
        ig: null,
      },
      'ppgif': { url: 'https://ppgif.farmacia.ufg.br', ig: null },
      'ppgmtsp': { url: 'https://ppgmtsp.iptsp.ufg.br', ig: null },
      'ppgfnf': { url: 'https://pos.ufg.br/p/pos-graduacao-nanotecnologia-farmaceutica-ppgnanofarma', ig: null },
      'ppgnut': { url: 'https://ppgnut.fanut.ufg.br', ig: 'ppgnut.ufg' },
      'ppgo': {
        url: 'https://pos.ufg.br/p/programa-pos-graduacao-odontologia-ppgo',
        feedUrl: 'https://posgraduacao.odonto.ufg.br',
        stableId: 'web.ufg.ppg.ppgo',
        newsAutoPublish: true,
        ig: null,
      },
      'ppgsc': {
        url: 'https://pos.ufg.br/p/pos-graduacao-saude-coletiva-ppgsc',
        feedUrl: 'https://pos-saudecoletiva.iptsp.ufg.br',
        stableId: 'web.ufg.ppg.ppgsc',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      // Ciencias Humanas
      'ppgas': { url: 'https://ppgas.fcs.ufg.br', ig: null },
      'ppgcpri': {
        url: 'https://pos.ufg.br/p/pos-graduacao-ciencia-politica-ppgcpri',
        feedUrl: 'https://cienciapoliticari.fcs.ufg.br',
        stableId: 'web.ufg.ppg.ppgcpri',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppge': {
        url: 'https://pos.ufg.br/p/pos-graduacao-educacao-ppge',
        feedUrl: 'https://ppge.fe.ufg.br',
        stableId: 'web.ufg.ppg.ppge',
        newsAutoPublish: true,
        ig: null,
      },
      'ppgfil': { url: 'https://pos.ufg.br/p/pos-graduacao-filosofia-ppgfil', ig: null },
      'ppgfil-operational': { url: 'https://pos.filosofia.ufg.br', stableId: 'web.ufg.ppg.ppgfil', displayName: 'PPGFIL', newsAutoPublish: true, ig: null },
      'ppgeo': { url: 'https://ppgeo.iesa.ufg.br', ig: null },
      'ppgh': {
        url: 'https://pos.ufg.br/p/pos-graduacao-historia-ppgh',
        feedUrl: 'https://pos.historia.ufg.br',
        stableId: 'web.ufg.ppg.ppgh',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgp': {
        url: 'https://pos.ufg.br/p/pos-graduacao-psicologia-ppgp',
        feedUrl: 'https://ppgp.fe.ufg.br',
        stableId: 'web.ufg.ppg.ppgp',
        newsAutoPublish: true,
        ig: null,
      },
      'ppgs': { url: 'https://pos.ufg.br/p/pos-graduacao-sociologia-ppgs', ig: null },
      'ppgs-operational': { url: 'https://pos-sociologia.fcs.ufg.br', stableId: 'web.ufg.ppg.ppgs', displayName: 'PPGS', newsAutoPublish: true, ig: null },
      'profhistoria': {
        url: 'https://pos.ufg.br/p/pos-graduacao-ensino-historia-profhistoria',
        feedUrl: 'https://prof.historia.ufg.br',
        stableId: 'web.ufg.ppg.profhistoria',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      // Engenharias
      'ppgeas': { url: 'https://ppgeas.eeca.ufg.br', ig: null },
      'ppgeec': { url: 'https://ppgeec.emc.ufg.br', ig: null },
      'ppgmec': { url: 'https://ppgmec.emc.ufg.br', ig: null },
      'ppgeq': { url: 'https://ppgeq.quimica.ufg.br', ig: null },
      'ppggecon': {
        url: 'https://pos.ufg.br/p/pos-graduacao-geotecnia-estruturas-construcao-civil-ppggecon',
        feedUrl: 'https://gecon.eeca.ufg.br',
        stableId: 'web.ufg.ppg.ppggecon',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgep-operational': {
        url: 'https://ppgep.fct.ufg.br',
        stableId: 'web.ufg.ppg.ppgep',
        displayName: 'PPGEP',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      // Linguistica, Letras e Artes
      'ppgacv': { url: 'https://pos.ufg.br/p/programa-pos-graduacao-arte-cultura-visual-ppgacv', ig: 'ppgacv_ufg' },
      'ppgacv-operational': { url: 'https://culturavisual.fav.ufg.br', stableId: 'web.ufg.ppg.ppgacv', displayName: 'PPGACV', newsAutoPublish: true, ig: 'ppgacv_ufg' },
      'ppgac': { url: 'https://pos.ufg.br/p/pos-graduacao-artes-cena-ppgac', ig: null },
      'ppgac-operational': { url: 'https://artesdacenappg.iac.ufg.br', stableId: 'web.ufg.ppg.ppgac.profile', displayName: 'PPGAC', newsAutoPublish: true, ig: null },
      'ppgll': { url: 'https://pos.ufg.br/p/pos-graduacao-letras-linguistica-ppgll', ig: null },
      'ppgll-operational': { url: 'https://pos.letras.ufg.br', stableId: 'web.ufg.ppg.ppgll', displayName: 'PPGLL', newsAutoPublish: true, ig: null },
      'ppgmus': { url: 'https://ppgmus.em.ufg.br', ig: null },
      // Ciencias Sociais Aplicadas
      'ppgadm': { url: 'https://ppgadm.face.ufg.br', ig: 'ppgadm.ufg' },
      'ppgcont': { url: 'https://ppgcont.face.ufg.br', ig: null },
      'ppgecon': { url: 'https://ppgecon.face.ufg.br', ig: null },
      'ppgdr': { url: 'https://ppgdr.face.ufg.br', ig: null },
      'ppgci': { url: 'https://ppgci.fic.ufg.br', ig: null },
      'ppgcom': { url: 'https://ppgcom.fic.ufg.br', ig: null },
      'ppgda': {
        url: 'https://pos.ufg.br/p/pos-graduacao-direito-agrario-ppgda',
        feedUrl: 'https://ppgda.direito.ufg.br',
        stableId: 'web.ufg.ppg.ppgda',
        newsAutoPublish: true,
        ig: null,
      },
      'ppgdp': {
        url: 'https://pos.ufg.br/p/pos-graduacao-direito-politicas-publicas-ppgdp',
        feedUrl: 'https://ppgdp.direito.ufg.br',
        stableId: 'web.ufg.ppg.ppgdp',
        newsAutoPublish: true,
        ig: null,
      },
      'ppgpc': {
        url: 'https://pos.ufg.br/p/pos-graduacao-projeto-cidade-ppgprocidade',
        feedUrl: 'https://projetoecidade.fav.ufg.br',
        stableId: 'web.ufg.ppg.ppgprocidade',
        displayName: 'PPGPROCIDADE',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'profiap': { url: 'https://profiap.fct.ufg.br', ig: null },
      // Programas Multidisciplinares
      'ppgciamb': { url: 'https://pos.ufg.br/p/pos-graduacao-ciencias-ambientais-ppgciamb', ig: null },
      'ppgciamb-operational': { url: 'https://ciamb.prpg.ufg.br', stableId: 'web.ufg.ppg.ppgciamb', displayName: 'PPGCIAMB', newsAutoPublish: true, ig: null },
      'ppgdh': {
        url: 'https://pos.ufg.br/p/pos-graduacao-direitos-humanos-ppgdh',
        feedUrl: 'https://pos.direitoshumanos.ufg.br',
        stableId: 'web.ufg.ppg.ppgdh',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgecm': {
        url: 'https://pos.ufg.br/p/pos-graduacao-educacao-ciencias-matematica-ppgecm',
        feedUrl: 'https://ppgecm.prpg.ufg.br',
        stableId: 'web.ufg.ppg.ppgecm',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgeeb': {
        url: 'https://pos.ufg.br/p/pos-graduacao-ensino-educacao-basica-ppgeeb',
        feedUrl: 'https://pos.cepae.ufg.br',
        stableId: 'web.ufg.ppg.ppgeeb',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppges': {
        url: 'https://pos.ufg.br/p/pos-graduacao-ensino-na-saude-ppges',
        feedUrl: 'https://ensinosaude.medicina.ufg.br',
        stableId: 'web.ufg.ppg.ppges',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgbb': {
        url: 'https://pos.ufg.br/p/pos-graduacao-biotenologia-biodiversidade',
        feedUrl: 'https://pgbb.prpg.ufg.br',
        stableId: 'web.ufg.ppg.ppgbb',
        newsAutoPublish: true,
        numItemsOverride: 20,
        ig: null,
      },
      'ppgculturas': {
        url: 'https://pos.ufg.br/p/pos-graduacao-performances-culturais-ppgpc',
        feedUrl: 'https://ppgact.medialab.ufg.br',
        stableId: 'web.ufg.ppg.ppgact',
        displayName: 'PPGACT',
        newsAutoPublish: true,
        ig: null,
      },
    },
  },
  2: {
    label: 'Frequente (2-3x/semana)',
    numItems: 30, // v4.4: era 10, agora 30 (auditoria 09/06)
    sites: {
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
      'seti': { url: 'https://seti.ufg.br', ig: null },
      'inf': { url: 'https://inf.ufg.br', ig: 'infufg' },
      'emc': { url: 'https://emc.ufg.br', ig: 'emc_ufg' },
      'eeca': { url: 'https://eeca.ufg.br', ig: 'eeca_ufg' },
      'ime': { url: 'https://ime.ufg.br', ig: 'ime_ufg' },
      // v4.5.2: farmacia SEMPRE retorna text=0 (só summary) — forçar detail fetch
      'farmacia': { url: 'https://farmacia.ufg.br', ig: null, forceDetailFetch: true },
      'idiomassemfronteiras': { url: 'https://idiomassemfronteiras.sri.ufg.br', ig: 'sri_ufg' },
      'csa': { url: 'https://csa.goias.ufg.br', ig: 'campusgoiasufg' },
      'uaech': { url: 'https://uaech.goias.ufg.br', ig: null },
      // v4.6.0: Campus Cidade Ocidental (IIG) - 6 cursos EAD, alto potencial
      'cidadeocidental': { url: 'https://cidadeocidental.ufg.br', ig: 'campusocidentalufg' },
      'ccn': { url: 'https://ccn.ufg.br', stableId: 'web.ufg.campus.caldas-novas', ig: null },
      // v4.6.0: Midias UFG
      'radio-ufg': { url: 'https://radio.ufg.br', ig: null },
      'revistas-ufg': { url: 'https://revistas.ufg.br', ig: null },
      // v4.6.0: Estruturas PRPI/POS vinculadas
      'crti': { url: 'https://crti.ufg.br', ig: null },
      'cpcbio': { url: 'https://cpcbio.prpi.ufg.br', ig: null },
      'lamcad': { url: 'https://lamcad.ufg.br', ig: null },
      // LabMic: portal PRPI com declaração @labmic.ufg; stableId canônico shadow.
      // IG permanece fora do scanner até canário autenticado (pending_verification).
      'labmic': {
        url: 'https://labmic.ufg.br',
        stableId: 'web.legacy.labmic',
        displayName: 'LabMic',
        ig: 'labmic.ufg',
        rolloutReviewOnly: true,
      },
      'uc': { url: 'https://uc.ufg.br', ig: null },
      'hospitalveterinario': { url: 'https://hospitalveterinario.evz.ufg.br', ig: null },
      // O Museu tem 50 itens no feed; mantenha a coleta única no Tier 2 com limite 30.
      'museu': { url: 'https://museu.ufg.br', ig: 'museu_ufg', numItemsOverride: 30 },
      // Pátio da Ciência: núcleo do Museu de Ciências; coletar a raiz própria
      // antes do agregador mc.ufg.br. IG declarado oficialmente, fora do scanner.
      'patiodaciencia': {
        url: 'https://patiodaciencia.ufg.br',
        stableId: 'web.legacy.patio-ciencia',
        displayName: 'Pátio da Ciência',
        ig: 'patiodaciencia_ufg',
        rolloutReviewOnly: true,
      },
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
      'editora': { url: 'https://editora.ufg.br', ig: 'editora.ufg' },
      'bc': { url: 'https://bc.ufg.br', ig: 'sibi_ufg' },
      'proad': { url: 'https://proad.ufg.br', ig: null },
      'ouvidoria': { url: 'https://ouvidoria.ufg.br', ig: null },
      // v4.5.2: cepae SEMPRE retorna text=0 — forçar detail fetch
      'cepae': { url: 'https://cepae.ufg.br', ig: 'cepae_ufg', forceDetailFetch: true },
      'filosofia': { url: 'https://filosofia.ufg.br', ig: 'fafilufg' },
      'iesa': { url: 'https://iesa.ufg.br', ig: 'iesa.ufg' },
      'campusgoias': { url: 'https://goias.ufg.br', ig: 'campusgoiasufg' },
      'historia': { url: 'https://historia.ufg.br', ig: null },
      'sin': { url: 'https://sin.ufg.br', ig: null },
      // v4.5.2: seinfra SEMPRE retorna text=0 — forçar detail fetch
      'seinfra': { url: 'https://seinfra.ufg.br', ig: null, forceDetailFetch: true },
      'cefis': { url: 'https://firminopolis.ufg.br', ig: 'firminopolis_ufg' },
      'cpa': { url: 'https://cpa.secplan.ufg.br', ig: null },
      'cidarq': { url: 'https://cidarq.ufg.br', ig: null },
      'cegraf': { url: 'https://cegraf.ufg.br', ig: null },
      'seacult': { url: 'https://seacult.ufg.br', ig: null },
    },
  },
};

// Redirect equivalence is deliberately explicit and offline. Do not discover
// redirects during validation: network state must not make the source inventory
// nondeterministic. Historical PROEC text remains valid, but only PROEX performs I/O.
const EXPLICIT_SOURCE_URL_REDIRECTS = Object.freeze({
  'https://proec.ufg.br': 'https://proex.ufg.br',
  // The old short hostname is catalog lineage only; do not collect it twice.
  'https://co.ufg.br': 'https://cidadeocidental.ufg.br',
  // Historical PPGIPC hostname now redirects to the renamed PPGACT Weby site.
  // Keep it as lineage only; all collection uses the destination below.
  'https://ppgipc.fcs.ufg.br': 'https://ppgact.medialab.ufg.br',
});

function normalizedTierSourceUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch (_) {
    throw new Error(`invalid source URL: ${String(rawUrl || '')}`);
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`invalid source URL: ${String(rawUrl || '')}`);
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString().replace(/\/$/, '');
}

function canonicalTierSourceUrl(rawUrl, redirects = EXPLICIT_SOURCE_URL_REDIRECTS) {
  const normalizedRedirects = new Map(
    Object.entries(redirects || {}).map(([from, to]) => [
      normalizedTierSourceUrl(from),
      normalizedTierSourceUrl(to),
    ]),
  );
  let current = normalizedTierSourceUrl(rawUrl);
  const visited = new Set();
  while (normalizedRedirects.has(current)) {
    if (visited.has(current)) {
      throw new Error(`source redirect alias cycle at ${current}`);
    }
    visited.add(current);
    current = normalizedRedirects.get(current);
  }
  return current;
}

function sourceEventsAutoPublish(site) {
  if (site?.eventsAutoPublish === true) return true;
  if (site?.eventsAutoPublish === false) return false;
  if (site?.rolloutReviewOnly === true) return false;
  // Preserve the adjudicated behavior of historical collectors that predate
  // literal stable IDs. New binding-only sources must opt into review with
  // rolloutReviewOnly instead of silently changing the legacy fleet.
  const stableId = String(site?.stableId || '').trim().toLowerCase();
  return !stableId.startsWith('web.ufg.ppg.');
}

function sourceNewsAutoPublish(site) {
  if (site?.newsAutoPublish === true) return true;
  if (site?.newsAutoPublish === false) return false;
  if (site?.rolloutReviewOnly === true) return false;
  const stableId = String(site?.stableId || '').trim().toLowerCase();
  // A newly promoted PPG root starts in review-only mode. Auto-publication is
  // enabled explicitly only after the source's news precision is adjudicated.
  return !stableId.startsWith('web.ufg.ppg.');
}

const SOURCE_DISPLAY_NAME_MAX_CHARS = 80;

function sourceDisplayName(legacyId, site) {
  if (site?.displayName === undefined || site?.displayName === null) {
    return String(legacyId || '').trim();
  }
  if (typeof site.displayName !== 'string') {
    throw new TypeError(`displayName for ${String(legacyId || '?')} must be a string`);
  }
  if (/[\u0000-\u001f\u007f-\u009f]/.test(site.displayName)) {
    throw new Error(`displayName for ${String(legacyId || '?')} contains control characters`);
  }
  const normalized = site.displayName.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > SOURCE_DISPLAY_NAME_MAX_CHARS) {
    throw new Error(
      `displayName for ${String(legacyId || '?')} must contain 1-${SOURCE_DISPLAY_NAME_MAX_CHARS} characters`,
    );
  }
  return normalized;
}

function validateTierSourceUniqueness(
  tiers,
  redirects = EXPLICIT_SOURCE_URL_REDIRECTS,
  bindingIndex = null,
) {
  if (!tiers || typeof tiers !== 'object' || Array.isArray(tiers)) {
    throw new Error('TIERS must be an object');
  }

  const idOwners = new Map();
  const stableIdOwners = new Map();
  const urlOwners = new Map();
  const collectionUrlOwners = new Map();
  const issues = [];
  const sources = [];
  const byTier = {};
  const boundLegacyIds = new Set();

  for (const [tier, tierConfig] of Object.entries(tiers)) {
    const sites = tierConfig?.sites;
    if (!sites || typeof sites !== 'object' || Array.isArray(sites)) {
      throw new Error(`TIERS[${tier}].sites must be an object`);
    }
    byTier[tier] = 0;

    for (const [rawId, site] of Object.entries(sites)) {
      const id = String(rawId).trim().toLowerCase();
      if (!id) throw new Error(`TIERS[${tier}] contains an empty source ID`);
      const owner = `tier ${tier}/${id}`;
      let displayName = id;
      try {
        displayName = sourceDisplayName(id, site);
      } catch (error) {
        issues.push(String(error?.message || error));
      }
      const stableId = bindingIndex
        ? resolveCanonicalSourceId(id, site, bindingIndex)
        : (typeof site?.stableId === 'string' && site.stableId.trim()
          ? site.stableId.trim().toLowerCase()
          : `web.legacy.${id}`);
      if (bindingIndex) boundLegacyIds.add(id);
      if (!/^web\.[a-z0-9.-]+$/.test(stableId)) {
        issues.push(`stable source ID "${stableId}" owned by ${owner} is invalid`);
      } else if (stableIdOwners.has(stableId)) {
        issues.push(`stable source ID "${stableId}" is owned by ${stableIdOwners.get(stableId)} and ${owner}`);
      } else {
        stableIdOwners.set(stableId, owner);
      }
      const canonicalUrl = canonicalTierSourceUrl(site?.url, redirects);
      const feedMode = typeof site?.feedMode === 'string' && site.feedMode.trim()
        ? site.feedMode.trim().toLowerCase()
        : null;
      const resolvedCollectionUrl = feedMode === 'none' ? null : resolveFeedBaseUrl(site);
      const collectionUrl = resolvedCollectionUrl
        ? canonicalTierSourceUrl(resolvedCollectionUrl, redirects)
        : null;

      if (idOwners.has(id)) {
        issues.push(`source ID "${id}" is owned by ${idOwners.get(id)} and ${owner}`);
      } else {
        idOwners.set(id, owner);
      }
      if (urlOwners.has(canonicalUrl)) {
        issues.push(
          `canonical URL "${canonicalUrl}" is owned by ${urlOwners.get(canonicalUrl)} and ${owner}`,
        );
      } else {
        urlOwners.set(canonicalUrl, owner);
      }
      if (collectionUrl && collectionUrlOwners.has(collectionUrl)) {
        issues.push(
          `collection URL "${collectionUrl}" is owned by ${collectionUrlOwners.get(collectionUrl)} and ${owner}`,
        );
      } else if (collectionUrl) {
        collectionUrlOwners.set(collectionUrl, owner);
      }

      byTier[tier] += 1;
      sources.push(Object.freeze({
        id,
        ...(site?.displayName === undefined || site?.displayName === null ? {} : { displayName }),
        stableId,
        tier: Number.isFinite(Number(tier)) ? Number(tier) : tier,
        canonicalUrl,
        collectionUrl,
        instagramHandle: typeof site?.ig === 'string' && site.ig.trim()
          ? site.ig.trim().replace(/^@/, '')
          : null,
        feedMode,
        newsAutoPublish: sourceNewsAutoPublish(site),
        eventsAutoPublish: sourceEventsAutoPublish(site),
        numItemsOverride: Number.isFinite(site?.numItemsOverride) ? site.numItemsOverride : null,
      }));
    }
  }

  if (issues.length > 0) {
    throw new Error(`ambiguous TIERS source inventory:\n- ${issues.join('\n- ')}`);
  }
  if (bindingIndex) {
    const missing = [...bindingIndex.keys()].filter((legacyId) => !boundLegacyIds.has(legacyId));
    const unexpected = [...boundLegacyIds].filter((legacyId) => !bindingIndex.has(legacyId));
    if (missing.length || unexpected.length || bindingIndex.size !== sources.length) {
      throw new Error(
        `curator source binding coverage mismatch: inventory=${sources.length} bindings=${bindingIndex.size}`
        + ` missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'}`,
      );
    }
  }

  return Object.freeze({
    totalSources: sources.length,
    uniqueIds: idOwners.size,
    uniqueCanonicalUrls: urlOwners.size,
    uniqueCollectionUrls: collectionUrlOwners.size,
    byTier: Object.freeze(byTier),
    sources: Object.freeze(sources),
  });
}

// Fail before any source I/O if a future edit reintroduces competing collectors.
const TIER_SOURCE_INVENTORY = validateTierSourceUniqueness(
  TIERS,
  EXPLICIT_SOURCE_URL_REDIRECTS,
  CURATOR_SOURCE_BINDING_INDEX,
);

const SOURCE_DIAGNOSTIC_STATES = Object.freeze([
  'ok',
  'partial',
  'empty',
  'no_feed',
  'quarantined',
  'budget',
  'error',
]);
const SOURCE_DIAGNOSTIC_STATE_SET = new Set(SOURCE_DIAGNOSTIC_STATES);
const SOURCE_DIAGNOSTIC_FAILURE_MAX_CHARS = 160;

function sanitizeSourceDiagnosticFailure(value) {
  let text = String(value || '')
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\b(authorization|api[-_]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s)\]}>]+/gi, (url) => safeDiagnosticUrl(url) || '[invalid-url]')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > SOURCE_DIAGNOSTIC_FAILURE_MAX_CHARS) {
    text = `${text.slice(0, SOURCE_DIAGNOSTIC_FAILURE_MAX_CHARS - 3)}...`;
  }
  return text;
}

function resolveSourceDiagnosticState({
  budgetInterrupted = false,
  collectedItems = 0,
  sourceHadSuccessfulResponse = false,
  sourceNewsHadSuccessfulResponse = false,
} = {}) {
  if (budgetInterrupted) return 'budget';
  if (Number(collectedItems) > 0) {
    return sourceNewsHadSuccessfulResponse ? 'ok' : 'partial';
  }
  if (!sourceNewsHadSuccessfulResponse) return 'error';
  return sourceHadSuccessfulResponse ? 'empty' : 'error';
}

function countSourceNewsUnavailableDiagnostics(diagnostics) {
  return (Array.isArray(diagnostics) ? diagnostics : []).filter(entry => (
    (entry?.state === 'partial' || entry?.state === 'error')
    && entry?.newsItems === null
  )).length;
}

function diagnosticCount(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function createSourceDiagnostic({
  site,
  legacyId,
  tier,
  collectionUrl = null,
  state,
  newsItems = null,
  eventItems = null,
  collectedItems = null,
  classifiedItems = null,
  elapsedMs = 0,
  failure = '',
} = {}) {
  if (!SOURCE_DIAGNOSTIC_STATE_SET.has(state)) {
    throw new Error(`invalid source diagnostic state: ${String(state || '')}`);
  }
  const normalizedLegacyId = String(legacyId || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(normalizedLegacyId)) {
    throw new Error(`invalid source diagnostic legacy ID: ${normalizedLegacyId}`);
  }
  const effectiveRegistryId = resolveCanonicalSourceId(normalizedLegacyId, site);
  const diagnostic = {
    sourceRegistryId: effectiveRegistryId,
    legacyId: normalizedLegacyId,
    displayName: sourceDisplayName(legacyId, site),
    declaredUrl: typeof site?.url === 'string' && site.url.trim() ? site.url.trim() : null,
    collectionUrl: typeof collectionUrl === 'string' && collectionUrl.trim()
      ? collectionUrl.trim()
      : null,
    tier: Number.isFinite(Number(tier)) ? Number(tier) : tier,
    state,
    newsItems: diagnosticCount(newsItems),
    eventItems: diagnosticCount(eventItems),
    collectedItems: diagnosticCount(collectedItems),
    classifiedItems: diagnosticCount(classifiedItems),
    elapsedMs: Math.max(0, Math.floor(Number(elapsedMs) || 0)),
  };
  const sanitizedFailure = sanitizeSourceDiagnosticFailure(failure);
  if (sanitizedFailure) diagnostic.failure = sanitizedFailure;
  return diagnostic;
}

function resolveCuratorGlobalBudgetMs(env = process.env, mode = 'daily') {
  const fullMode = String(mode || '').toLowerCase() === 'full';
  const configuredSupervisor = Number(env.CADU_CURATOR_TIMEOUT_MS);
  const supervisorMs = Number.isFinite(configuredSupervisor)
    && configuredSupervisor >= 60_000
    && configuredSupervisor <= 3_600_000
    ? Math.floor(configuredSupervisor)
    : (fullMode ? 2_400_000 : 1_500_000);
  const supervisorHeadroomMs = supervisorMs >= 120_000 ? 60_000 : 30_000;
  const safeCeilingMs = Math.max(
    30_000,
    Math.min(3_540_000, supervisorMs - supervisorHeadroomMs),
  );
  const configuredBudget = Number(env.CADU_CURATOR_GLOBAL_BUDGET_MS);
  const desiredMs = Number.isFinite(configuredBudget)
    && configuredBudget >= 30_000
    && configuredBudget <= 3_540_000
    ? Math.floor(configuredBudget)
    : (fullMode ? 2_100_000 : 1_320_000);
  return Math.min(desiredMs, safeCeilingMs);
}

function validateCompleteSourceDiagnostics(diagnostics, expectedLegacyIds) {
  const issues = [];
  if (!Array.isArray(diagnostics)) return { ok: false, issues: ['diagnostics_not_array'] };
  const expected = Array.isArray(expectedLegacyIds)
    ? expectedLegacyIds.map(value => String(value || '').trim().toLowerCase())
    : [];
  if (diagnostics.length !== expected.length) {
    issues.push(`diagnostic_count_mismatch:${diagnostics.length}/${expected.length}`);
  }
  diagnostics.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      issues.push(`diagnostic_not_object:${index}`);
      return;
    }
    if (entry.legacyId !== expected[index]) issues.push(`diagnostic_order_mismatch:${index}`);
    if (!SOURCE_DIAGNOSTIC_STATE_SET.has(entry.state)) issues.push(`diagnostic_state_invalid:${index}`);
    if (!Number.isInteger(entry.elapsedMs) || entry.elapsedMs < 0) {
      issues.push(`diagnostic_elapsed_invalid:${index}`);
    }
  });
  return { ok: issues.length === 0, issues };
}

// ============================================================
// CLASSIFIER (do publisher — melhor detecção de prazos)
// ============================================================

// Human safety adjudications. Keep the stable ID and URL backstop together so
// renaming a TIERS key cannot accidentally reactivate a quarantined endpoint.
const QUARANTINED_WEB_SOURCE_URLS = Object.freeze({
  'web.legacy.ead-face': 'https://ead.face.ufg.br',
  'web.legacy.ppgac': 'https://pos.ufg.br/p/pos-graduacao-artes-cena-ppgac',
  'web.legacy.ppgef': 'https://pos.ufg.br/p/pos-graduacao-educacao-fisica-ppgef',
  'web.legacy.ppgenf': 'https://pos.ufg.br/p/pos-graduacao-enfermagem-ppgenf',
  'web.legacy.revistas-ufg': 'https://revistas.ufg.br',
  'web.legacy.sea': 'https://sea.face.ufg.br',
});
const QUARANTINED_WEB_SOURCE_IDS = Object.freeze(Object.keys(QUARANTINED_WEB_SOURCE_URLS));
const QUARANTINED_WEB_SOURCE_URL_SET = new Set(Object.values(QUARANTINED_WEB_SOURCE_URLS));
const QUARANTINE_REVIEW_INTERVAL_DAYS = 7;
const QUARANTINED_WEB_SOURCE_META = Object.freeze({
  'web.legacy.ead-face': Object.freeze({
    reviewIssues: Object.freeze(['pending_official_evidence', 'transport_unverified', 'unreachable']),
    checkedAt: '2026-07-13',
  }),
  'web.legacy.ppgac': Object.freeze({
    reviewIssues: Object.freeze(['html_profile_not_feed', 'http_error', 'pending_official_evidence', 'transport_unverified']),
    checkedAt: '2026-07-13',
  }),
  'web.legacy.ppgef': Object.freeze({
    reviewIssues: Object.freeze(['html_profile_not_feed', 'http_error', 'pending_official_evidence', 'transport_unverified']),
    checkedAt: '2026-07-13',
  }),
  'web.legacy.ppgenf': Object.freeze({
    reviewIssues: Object.freeze(['html_profile_not_feed', 'http_error', 'pending_official_evidence', 'transport_unverified']),
    checkedAt: '2026-07-13',
  }),
  'web.legacy.revistas-ufg': Object.freeze({
    reviewIssues: Object.freeze(['content_integrity_violation', 'pending_official_evidence', 'platform_misclassified']),
    checkedAt: '2026-07-13',
  }),
  'web.legacy.sea': Object.freeze({
    reviewIssues: Object.freeze(['http_error', 'pending_official_evidence', 'transport_unverified']),
    checkedAt: '2026-07-13',
  }),
});

function normalizedSiteBaseUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function isQuarantinedLegacySource(nameOrId, rawUrl) {
  return getQuarantinedLegacySource(nameOrId, rawUrl) !== null;
}

function quarantineReviewAfter(checkedAt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(checkedAt || ''))) return null;
  const reviewDate = new Date(`${checkedAt}T12:00:00Z`);
  if (Number.isNaN(reviewDate.getTime())) return null;
  reviewDate.setUTCDate(reviewDate.getUTCDate() + QUARANTINE_REVIEW_INTERVAL_DAYS);
  return reviewDate.toISOString().slice(0, 10);
}

function getQuarantinedLegacySource(nameOrId, rawUrl) {
  const value = String(nameOrId || '').trim();
  const stableId = value.startsWith('web.legacy.') ? value : `web.legacy.${value}`;
  const matchedId = Object.prototype.hasOwnProperty.call(QUARANTINED_WEB_SOURCE_URLS, stableId)
    ? stableId
    : Object.entries(QUARANTINED_WEB_SOURCE_URLS)
      .find(([, url]) => normalizedSiteBaseUrl(url) === normalizedSiteBaseUrl(rawUrl))?.[0];
  if (!matchedId || !QUARANTINED_WEB_SOURCE_URL_SET.has(QUARANTINED_WEB_SOURCE_URLS[matchedId])) return null;
  const meta = QUARANTINED_WEB_SOURCE_META[matchedId] || {};
  const reviewAfter = quarantineReviewAfter(meta.checkedAt);
  return {
    id: matchedId,
    reviewIssues: [...(meta.reviewIssues || ['human_safety_adjudication'])],
    checkedAt: meta.checkedAt || null,
    reviewAfter,
    reviewDue: Boolean(reviewAfter && TODAY_ISO >= reviewAfter),
    recheckPolicy: 'manual_review_required',
  };
}

/**
 * pos.ufg.br/p/* pages are institutional catalog landings, not Weby unit roots.
 * They have no /news.json or /events.json of their own — scanning them always
 * yields siteSourcesEmpty and wastes ~3 HTTP calls per program.
 *
 * Prefer site.feedUrl when a real Weby unit root is known; otherwise skip with
 * a clear reason (siteSourcesNoFeed) instead of a generic ⚠️.
 */
function isPosUfgCatalogLanding(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'pos.ufg.br' && /^\/p\//i.test(parsed.pathname || '');
  } catch (_) {
    return false;
  }
}

/**
 * Resolve the HTTP root used for news.json / events.json /news HTML.
 * - Explicit site.feedUrl always wins (real Weby unit).
 * - Catalog landings without feedUrl return null (caller must skip I/O).
 * - Otherwise site.url.
 */
function resolveFeedBaseUrl(site) {
  if (!site || typeof site !== 'object') return null;
  const explicit = String(site.feedUrl || site.feed_url || '').trim();
  if (explicit) return normalizedSiteBaseUrl(explicit) || explicit.replace(/\/$/, '');
  const url = String(site.url || '').trim();
  if (!url) return null;
  if (isPosUfgCatalogLanding(url)) return null;
  return normalizedSiteBaseUrl(url) || url.replace(/\/$/, '');
}

function shouldUseNewsHtmlFallback(sourceNewsItems) {
  return sourceNewsItems === null || sourceNewsItems === 0;
}

function collectNewsHtmlFallbackItems(html, baseUrl, {
  pageCap = 8,
  fetchPage = fetchUrl,
  budgetExceeded = () => false,
} = {}) {
  const items = [];
  const seenUrls = new Set();
  const linkRegex = /href="([^"]*\/[en]\/(\d+)[^"]*)"/gi;
  const boundedPageCap = Math.max(0, Math.floor(Number(pageCap) || 0));
  let attempts = 0;
  let budgetInterrupted = false;
  let match;

  while ((match = linkRegex.exec(String(html || ''))) !== null) {
    let link = match[1];
    if (link.startsWith('/')) link = baseUrl + link;
    if (seenUrls.has(link)) continue;
    seenUrls.add(link);
    if (budgetExceeded()) {
      budgetInterrupted = true;
      break;
    }
    if (attempts >= boundedPageCap) break;
    attempts++;
    const newsHtml = fetchPage(link);
    if (!newsHtml) continue;
    const titleMatch = newsHtml.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Sem título';
    const text = extractText(newsHtml);
    items.push({ title, text: text.slice(0, 500), link, image: '', images: [], date: '' });
  }

  return { items, attempts, budgetInterrupted };
}

function applySourcePublicationPolicy(classification, item, site) {
  if (!classification || typeof classification !== 'object') return classification;
  if (classification.decision !== 'publish') {
    return classification;
  }
  const isEvent = item?.sourceKind === 'event';
  const autoPublish = isEvent ? sourceEventsAutoPublish(site) : sourceNewsAutoPublish(site);
  if (autoPublish) return classification;
  return {
    ...classification,
    decision: 'review',
    score: Math.min(classification.score, PUBLISH_THRESHOLD - 0.01),
    reasons: [
      ...(classification.reasons || []),
      isEvent ? 'source_event_review_only' : 'source_news_review_only',
    ],
  };
}

function applySourcePageAvailabilityPolicy(classification, {
  sourceKind = 'news',
  detailChecked = false,
  detailAvailable = false,
} = {}) {
  if (!classification || typeof classification !== 'object') return classification;
  if (classification.decision !== 'publish' || sourceKind === 'event') return classification;
  if (detailChecked && detailAvailable) return classification;
  return {
    ...classification,
    decision: 'review',
    score: Math.min(classification.score, PUBLISH_THRESHOLD - 0.01),
    reasons: [
      ...(classification.reasons || []),
      detailChecked ? 'source_page_unavailable' : 'source_page_unverified',
    ],
  };
}

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

const OPP_SIGNALS = [
  'edital', 'editais', 'chamada', 'processo seletivo', 'submissao', 'submissoes',
  'inscricao', 'inscricoes', 'candidatura', 'candidaturas', 'voluntariado', 'extensao',
  'bolsa', 'monitoria', 'estagio', 'vagas', 'selecao',
  'pibic', 'pivic', 'probec', 'pesquisa', 'fapeg', 'mobilidade', 'concurso',
  'convocacao', 'credenciamento', 'hackaton', 'empreendedorismo', 'vestibular',
  'residencia', 'pet', 'premio', 'auxilio', 'beneficio', 'subsidio',
];
const EVT_SIGNALS = ['evento', 'curso', 'oficina', 'palestra', 'seminario', 'congresso', 'mostra', 'festival', 'exposicao', 'concerto', 'espetaculo', 'capacitacao', 'olimpiada', 'suficiencia', 'formacao', 'especializacao', 'concurso literario', 'feira', 'encontro'];

// These patterns only run against normalizeText(), so spell the Portuguese
// morphology explicitly instead of using `editais?` (which matches "editai"
// and "editais", but not the singular "edital"). Submission is promoted to a
// strong signal only while the headline itself says that the window is open.
//
// Fix R (2026-07-25): STRONG_OPPORTUNITY_HEADLINE_PATTERN nao cobria
// "matricula" (processos academicos: Centro de Linguas, SIGAA, Aluno
// Especial 2026/2). Resultado: 3 posts de matricula do run 2026-07-24
// foram classificados como eventos/workshops em vez de oportunidades/pesquisa.
// Adicionado `matriculas?` ao pattern forte.
const OPPORTUNITY_HEADLINE_PATTERN = /\b(?:edit(?:al|ais)|chamadas?|processos? seletivos?|selecao|inscricao|inscricoes|submissao|submissoes|matricula|matriculas|oportunidades?|premios?|concursos?|bolsas?|monitorias?|estagios?|credenciamentos?|suficiencia|cursos?)\b/;
const STRONG_OPPORTUNITY_HEADLINE_PATTERN = /\b(?:edit(?:al|ais)|chamadas?|processos? seletivos?|concursos?|bolsas?|monitorias?|estagios?|credenciamentos?|oportunidades?|premios?|submiss(?:ao|oes) (?:aberta|abertas|aberto|abertos|prorrogada|prorrogadas|prorrogado|prorrogados)|selecao (?:de candidatos|de alunos especiais|para ingresso)|matriculas?|calendario academico|periodo (?:de )?matricula|rematricula)\b/;
const OPEN_SUBMISSION_HEADLINE_PATTERN = /\bsubmiss(?:ao|oes) (?:aberta|abertas|aberto|abertos|prorrogada|prorrogadas|prorrogado|prorrogados)\b/;

function normalizeText(t) {
  if (!t) return '';
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_DEDUPE_STOP_WORDS = new Set([
  'a', 'o', 'de', 'da', 'do', 'e', 'para', 'em', 'no', 'na', 'os', 'as',
  'dos', 'das', 'um', 'uma', 'uns', 'umas', 'por', 'com', 'sobre', 'aos',
  'pelo', 'pela',
]);
const TITLE_DEDUPE_COMBOS = Object.freeze([
  ['edital', 'marca'],
  ['edital', 'enade'],
  ['edital', 'sisu'],
  ['edital', 'conpeex'],
  ['conpeex', 'submissao'],
  ['movimento', 'empresa', 'junior'],
  ['empresa', 'junior'],
]);
const TITLE_PPG_PROGRAMS = Object.freeze([
  'ppgecoevol', 'ppgecofvol', 'ppggecon', 'ppgodonto', 'ppgfisio', 'ppgecon',
  'ppgeas', 'ppgfcf', 'ppgfmp', 'ppgcont', 'ppggp', 'ppgedu', 'ppggg',
  'ppgfarma', 'ppggd', 'ppggt', 'ppgcf', 'ppgmp', 'ppgeco', 'ppgta',
  'ppge', 'ppgf', 'ppgg', 'ppga', 'ppgh', 'ppgi', 'ppgm', 'ppgo', 'ppgq',
].sort((a, b) => b.length - a.length));

function titleDedupeTokens(value) {
  return new Set(normalizeText(value).split(/\s+/).filter(token => (
    token.length > 2 && !TITLE_DEDUPE_STOP_WORDS.has(token)
  )));
}

function titleDedupeJaccard(left, right) {
  const a = titleDedupeTokens(left);
  const b = titleDedupeTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function extractTitleEditalNumber(value) {
  const normalized = normalizeText(value);
  const match = normalized.match(/(?:\bedital\D{0,16}|\bn\s*)(\d{1,4})\s+(20\d{2})\b/i);
  return match ? `${Number(match[1])}/${match[2]}` : null;
}

function extractTitlePpgProgram(value) {
  const normalized = normalizeText(value);
  const direct = (normalized.match(/\bppg[a-z]{1,12}\b/g) || [])
    .sort((a, b) => b.length - a.length)[0];
  if (direct) return direct;
  const lettersOnly = normalizeText(value).replace(/[^a-z]/g, '');
  return TITLE_PPG_PROGRAMS.find(program => lettersOnly.includes(program)) || null;
}

function titleIdentityConflict(left, right) {
  const editalLeft = extractTitleEditalNumber(left);
  const editalRight = extractTitleEditalNumber(right);
  if (editalLeft && editalRight && editalLeft !== editalRight) return 'different_edital';

  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  // Publication verbs ("publicado/divulgado edital") describe the same
  // opportunity, not a later lifecycle. Only explicit result phases conflict.
  const resultPattern = /^(?:resultados?|lista\s+de\s+aprovados?|aprovados?|selecionados?|homologacao)\b/;
  if (resultPattern.test(normalizedLeft) !== resultPattern.test(normalizedRight)) return 'different_lifecycle';

  const ppgLeft = extractTitlePpgProgram(left);
  const ppgRight = extractTitlePpgProgram(right);
  if (ppgLeft && ppgRight && ppgLeft !== ppgRight) return 'different_ppg';

  const exclusivePivot = value => {
    const normalized = normalizeText(value);
    if (/\b(?:pos\s+doutorado|posdoc)\b/.test(normalized)) return 'academic:pos_doutorado';
    const hasMestrado = /\bmestrado\b/.test(normalized);
    const hasDoutorado = /\bdoutorado\b/.test(normalized);
    if (hasMestrado !== hasDoutorado) return `academic:${hasMestrado ? 'mestrado' : 'doutorado'}`;
    const employmentTypes = ['efetivo', 'substituto']
      .filter(type => new RegExp(`\\b${type}\\b`).test(normalized));
    if (employmentTypes.length === 1) return `employment:${employmentTypes[0]}`;
    return null;
  };
  const pivotLeft = exclusivePivot(left);
  const pivotRight = exclusivePivot(right);
  if (pivotLeft && pivotRight && pivotLeft !== pivotRight) return 'different_audience';

  const yearsLeft = [...new Set(normalizedLeft.match(/\b20\d{2}\b/g) || [])];
  const yearsRight = [...new Set(normalizedRight.match(/\b20\d{2}\b/g) || [])];
  if (yearsLeft.length === 1 && yearsRight.length === 1 && yearsLeft[0] !== yearsRight[0]) {
    return 'different_year';
  }
  return null;
}

function titleDedupePivots(value) {
  const normalized = normalizeText(value);
  const pivots = new Set(normalized.match(/\b20\d{2}\b/g) || []);
  const edital = extractTitleEditalNumber(value);
  if (edital) pivots.add(`edital:${edital}`);
  for (const token of titleDedupeTokens(value)) {
    if (/^[a-z]{3,8}$/.test(token)) {
      // Known institutional/event tokens are useful even after normalization.
      if (['widat', 'siepe', 'conpeex', 'coemco', 'semex', 'senpex', 'enade', 'sisu'].includes(token)) {
        pivots.add(token);
      }
    }
  }
  return pivots;
}

function titlesLikelyDuplicate(candidateTitle, publishedTitle) {
  const candidate = normalizeText(candidateTitle);
  const published = normalizeText(publishedTitle);
  if (candidate.length < 15 || published.length < 15) return false;
  if (titleIdentityConflict(candidateTitle, publishedTitle)) return false;
  if (candidate === published) return true;

  const short = candidate.slice(0, 30);
  const long = candidate.slice(0, 50);
  if ((short.length > 15 && published.includes(short))
      || (long.length > 20 && published.includes(long))
      || (published.length > 20 && candidate.includes(published.slice(0, 50)))) {
    return true;
  }
  if (titleDedupeJaccard(candidate, published) >= 0.40) return true;

  const candidatePivots = titleDedupePivots(candidateTitle);
  const publishedPivots = titleDedupePivots(publishedTitle);
  let sharedPivots = 0;
  for (const pivot of candidatePivots) if (publishedPivots.has(pivot)) sharedPivots += 1;
  if (sharedPivots >= 2) return true;

  const candidateTokens = titleDedupeTokens(candidate);
  const publishedTokens = titleDedupeTokens(published);
  return TITLE_DEDUPE_COMBOS.some(combo => (
    combo.every(token => candidateTokens.has(token))
    && combo.every(token => publishedTokens.has(token))
  ));
}

function canonicalWebNewsIdentity(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    const match = parsed.pathname.match(/\/n\/(\d+)(?:\b|\/)/i);
    if (!match) return null;
    return `${parsed.hostname.replace(/^www\./i, '').toLowerCase()}/n/${match[1]}`;
  } catch (_) {
    return null;
  }
}

function canonicalActionEndpoint(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  const email = value.replace(/^mailto:/i, '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `email:${email}`;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return '';
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString().replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function buildOpportunityActionFingerprints({ sourceRegistryId, module, temporal, actionEvidence } = {}) {
  if (module !== 'oportunidades') return [];
  const opensAt = String(temporal?.applicationOpensAt || '');
  const deadline = String(temporal?.applicationDeadline || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opensAt) || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return [];
  const source = String(sourceRegistryId || '').trim().toLowerCase();
  if (!source) return [];
  const endpoints = [...new Set((Array.isArray(actionEvidence) ? actionEvidence : [])
    .filter(evidence => evidence?.purpose === 'application'
      && evidence?.confidence === 'high'
      && ['email', 'form', 'application_url'].includes(evidence?.type))
    .map(evidence => canonicalActionEndpoint(evidence.value))
    .filter(Boolean))].sort();
  return endpoints.map(endpoint => crypto.createHash('sha256')
    .update(`${source}|${module}|${opensAt}|${deadline}|${endpoint}`)
    .digest('hex'));
}

function registerRunRankedCandidate(index, record, rawFingerprints, sharesIdentity) {
  if (!(index instanceof Map)) throw new TypeError('action candidate index must be a Map');
  const fingerprints = [...new Set((Array.isArray(rawFingerprints) ? rawFingerprints : []).filter(Boolean))];
  if (fingerprints.length === 0) return { accepted: true, superseded: [] };

  const bucketFor = fingerprint => {
    const value = index.get(fingerprint);
    return (Array.isArray(value) ? value : [value]).filter(Boolean);
  };
  const conflicts = [...new Set(fingerprints
    .flatMap(fingerprint => bucketFor(fingerprint))
    .filter(candidate => sharesIdentity(candidate, record)))];
  if (conflicts.length === 0) {
    for (const fingerprint of fingerprints) {
      const bucket = bucketFor(fingerprint);
      const next = [...new Set([...bucket, record])];
      index.set(fingerprint, next.length === 1 ? next[0] : next);
    }
    return { accepted: true, superseded: [] };
  }

  const rank = candidate => {
    const decision = candidate?.decision === 'publish' ? 2 : (candidate?.decision === 'review' ? 1 : 0);
    const score = Number.isFinite(candidate?.score) ? candidate.score : 0;
    return [decision, score];
  };
  const isBetter = (candidate, incumbent) => {
    const [candidateDecision, candidateScore] = rank(candidate);
    const [incumbentDecision, incumbentScore] = rank(incumbent);
    return candidateDecision > incumbentDecision
      || (candidateDecision === incumbentDecision && candidateScore > incumbentScore);
  };
  const incumbent = conflicts.reduce((best, candidate) => (
    !best || isBetter(candidate, best) ? candidate : best
  ), null);
  if (!isBetter(record, incumbent)) {
    return { accepted: false, superseded: [], incumbent };
  }

  const conflictSet = new Set(conflicts);
  const requestedFingerprints = new Set(fingerprints);
  for (const [fingerprint, candidate] of index.entries()) {
    const bucket = (Array.isArray(candidate) ? candidate : [candidate]).filter(Boolean);
    if (!bucket.some(indexed => conflictSet.has(indexed))) continue;
    const next = [...new Set([
      ...bucket.filter(indexed => !conflictSet.has(indexed)),
      ...(requestedFingerprints.has(fingerprint) ? [record] : []),
    ])];
    if (next.length === 0) index.delete(fingerprint);
    else index.set(fingerprint, next.length === 1 ? next[0] : next);
  }
  for (const fingerprint of fingerprints) {
    const bucket = bucketFor(fingerprint);
    const next = [...new Set([...bucket, record])];
    index.set(fingerprint, next.length === 1 ? next[0] : next);
  }
  return { accepted: true, superseded: conflicts };
}

function compatibleReferenceDates(left, right) {
  const leftDates = left?.dates || {};
  const rightDates = right?.dates || {};
  for (const field of ['applicationDeadline', 'eventStartsAt', 'eventEndsAt']) {
    if (leftDates[field] && rightDates[field] && leftDates[field] !== rightDates[field]) return false;
  }
  return true;
}

const OFFICIAL_REFERENCE_GENERIC_TITLE_TOKENS = new Set([
  ...TITLE_DEDUPE_STOP_WORDS,
  'abre', 'aberta', 'abertas', 'aberto', 'abertos', 'aluno', 'alunos',
  'bolsa', 'bolsas', 'candidatos', 'chamada', 'curso', 'cursos', 'divulga',
  'docentes', 'edital', 'estudante', 'estudantes', 'evento', 'inscricoes',
  'laboratorio', 'laboratorios', 'online', 'oportunidade', 'programa',
  'publica', 'selecao', 'ufg', 'vaga', 'vagas',
]);

function officialReferenceTitleAffinity(left, right) {
  if (normalizeText(left) === normalizeText(right) || titlesLikelyDuplicate(left, right)) return true;

  const acronyms = value => new Set((String(value || '').match(/\b[A-Z][A-Z0-9]{3,}\b/g) || [])
    .map(token => token.toLowerCase())
    .filter(token => token !== 'ufg'));
  const leftAcronyms = acronyms(left);
  const rightAcronyms = acronyms(right);
  if ([...leftAcronyms].some(token => rightAcronyms.has(token))) return true;

  const distinctive = value => new Set([...titleDedupeTokens(value)].filter(token => (
    token.length >= 5 && !/^20\d{2}$/.test(token) && !/^\d+$/.test(token) &&
    !OFFICIAL_REFERENCE_GENERIC_TITLE_TOKENS.has(token)
  )));
  const leftTokens = distinctive(left);
  const rightTokens = distinctive(right);
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared >= 2;
}

function registerRunActionCandidate(index, record) {
  const fingerprints = Array.isArray(record?.actionFingerprints) ? record.actionFingerprints : [];
  return registerRunRankedCandidate(index, record, fingerprints, (candidate, current) => {
    const candidateTitle = String(candidate?.title || '');
    const recordTitle = String(current?.title || '');
    if (!candidateTitle || !recordTitle || titleIdentityConflict(recordTitle, candidateTitle)) return false;
    return normalizeText(recordTitle) === normalizeText(candidateTitle)
      || titlesLikelyDuplicate(recordTitle, candidateTitle);
  });
}

function registerRunOfficialReferenceCandidate(index, record) {
  if (record?.update === true) return { accepted: true, superseded: [] };
  const identities = Array.isArray(record?.officialReferenceIdentities)
    ? record.officialReferenceIdentities
    : [];
  return registerRunRankedCandidate(index, record, identities, (candidate, current) => {
    if (candidate?.update === true || current?.update === true) return false;
    if (!candidate?.module || candidate.module !== current?.module) return false;
    const candidateTitle = String(candidate?.title || '');
    const recordTitle = String(current?.title || '');
    if (!candidateTitle || !recordTitle || titleIdentityConflict(recordTitle, candidateTitle)) return false;
    if (!compatibleReferenceDates(candidate, current)) return false;
    // Mirrors can use different verbs while retaining a distinctive acronym
    // (for example CASLE) or multiple uncommon title tokens. Generic overlap
    // such as "para estudantes" is intentionally insufficient.
    return officialReferenceTitleAffinity(recordTitle, candidateTitle);
  });
}

function cloneCandidateIndex(index) {
  return new Map([...index.entries()].map(([key, value]) => [
    key,
    Array.isArray(value) ? [...value] : value,
  ]));
}

function restoreCandidateIndex(index, snapshot) {
  index.clear();
  for (const [key, value] of snapshot.entries()) index.set(key, value);
}

function removeCandidateFromIndex(index, record) {
  for (const [key, value] of index.entries()) {
    const remaining = (Array.isArray(value) ? value : [value]).filter(candidate => candidate && candidate !== record);
    if (remaining.length === 0) index.delete(key);
    else index.set(key, remaining.length === 1 ? remaining[0] : remaining);
  }
}

function registerRunCandidateAcrossIndexes(actionIndex, officialReferenceIndex, record) {
  if (!(actionIndex instanceof Map) || !(officialReferenceIndex instanceof Map)) {
    throw new TypeError('candidate indexes must be Maps');
  }
  const actionSnapshot = cloneCandidateIndex(actionIndex);
  const referenceSnapshot = cloneCandidateIndex(officialReferenceIndex);
  const referenceResult = registerRunOfficialReferenceCandidate(officialReferenceIndex, record);
  if (!referenceResult.accepted) {
    restoreCandidateIndex(actionIndex, actionSnapshot);
    restoreCandidateIndex(officialReferenceIndex, referenceSnapshot);
    return { ...referenceResult, duplicateKind: 'official_reference' };
  }
  const actionResult = registerRunActionCandidate(actionIndex, record);
  if (!actionResult.accepted) {
    restoreCandidateIndex(actionIndex, actionSnapshot);
    restoreCandidateIndex(officialReferenceIndex, referenceSnapshot);
    return { ...actionResult, duplicateKind: 'action' };
  }
  const superseded = [...new Set([
    ...(referenceResult.superseded || []),
    ...(actionResult.superseded || []),
  ])];
  for (const displaced of superseded) {
    removeCandidateFromIndex(actionIndex, displaced);
    removeCandidateFromIndex(officialReferenceIndex, displaced);
  }
  return { accepted: true, superseded, duplicateKind: null };
}

function officialReferenceNewsIdentities(relevantLinks, ownUrl = '') {
  const ownIdentity = canonicalWebNewsIdentity(ownUrl);
  const identities = [];
  for (const links of Object.values(relevantLinks || {})) {
    for (const entry of Array.isArray(links) ? links : []) {
      const rawUrl = String(entry?.url || entry || '').trim();
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:' || !(parsed.hostname === 'ufg.br' || parsed.hostname.endsWith('.ufg.br'))) continue;
      } catch (_) {
        continue;
      }
      const identity = canonicalWebNewsIdentity(rawUrl);
      if (identity && identity !== ownIdentity && !identities.includes(identity)) identities.push(identity);
    }
  }
  return identities;
}

function has(text, term) {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;

  // These common words are suffixes of unrelated Portuguese words
  // (recurso/curso and carteira/arte). Match their real token forms only.
  if (normalizedTerm === 'curso') return /(?:^|\s)cursos?(?:\s|$)/.test(normalizedText);
  if (normalizedTerm === 'arte') return /(?:^|\s)artes?(?:\s|$)/.test(normalizedText);
  if (normalizedTerm === 'formacao') return /(?:^|\s)formacoes?(?:\s|$)/.test(normalizedText);

  // Short institutional lexemes must be whole tokens. Without this boundary,
  // PET matched "petiscos" and RU matched words such as "frutas".
  if (normalizedTerm.length <= 3 && !normalizedTerm.includes(' ')) {
    return normalizedText.split(' ').includes(normalizedTerm);
  }

  return normalizedText.includes(normalizedTerm);
}

function isActionableUrl(rawUrl, label = '', context = '') {
  const url = String(rawUrl || '').trim();
  const normalizedLabel = normalizeText(label);
  const normalizedContext = normalizeText(context);
  const semanticText = `${normalizedLabel} ${normalizedContext}`.trim();
  const applicationPurposePattern = /\b(?:inscricao|inscricoes|inscreva|candidatura|candidaturas|candidate|submissao|submissoes|submeta|matricula|matriculas|matricule|processo seletivo|envio de proposta|enviar proposta|ficha de inscricao)\b/;
  const benefitRequestPurpose = /\b(?:auxilio|beneficio|subsidio|permanencia|moradia|alimentacao)\b/.test(semanticText)
    && /\b(?:solicite|solicitacao|solicitacoes|requerimento|requerimentos|pedido|pedidos|cadastro|cadastros|preencha)\b/.test(semanticText);
  const hasApplicationPurpose = applicationPurposePattern.test(semanticText) || benefitRequestPurpose;
  const hasApplicationLabel = applicationPurposePattern.test(normalizedLabel);
  const hasNonApplicationPurpose = /\b(?:interposicao de recurso|pedido de recurso|recursos?|pesquisa|questionario|consulta|avaliacao|feedback|presenca|frequencia|certificado|diagnostico|levantamento|demanda|arquivo|arquivado|historico|edicao anterior|apenas como registro|inscricoes?\s+(?:encerradas?|fechadas?|finalizadas?)|candidaturas?\s+(?:encerradas?|fechadas?|finalizadas?)|prazo\s+(?:encerrado|fechado|finalizado))\b/.test(semanticText);
  if (!url) return false;
  if (hasNonApplicationPurpose) return false;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+/i.test(url)) return hasApplicationPurpose;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    let pathname = parsed.pathname.toLowerCase();
    try { pathname = decodeURIComponent(pathname); } catch (_) {}
    const trustedFormHost = host === 'forms.gle' || host === 'forms.office.com' || host === 'forms.microsoft.com' ||
      host === 'typeform.com' || host.endsWith('.typeform.com') ||
      /^forms(?:\.[a-z0-9-]+)*\.ufg\.br$/.test(host) ||
      ((host === 'docs.google.com' || host === 'google.com') && pathname.startsWith('/forms/'));
    const trustedEventHost = host === 'even3.com.br' || host.endsWith('.even3.com.br') ||
      host === 'sympla.com.br' || host.endsWith('.sympla.com.br') ||
      host === 'doity.com.br' || host.endsWith('.doity.com.br') ||
      host === 'eventbrite.com' || host.endsWith('.eventbrite.com');
    // A form provider is not proof of application purpose by itself: the same
    // platforms also host surveys, feedback and attendance forms.
    if (trustedFormHost) return hasApplicationPurpose;
    if (trustedEventHost) return hasApplicationPurpose;
    const trustedInstitutionalHost = host === 'ufg.br' || host.endsWith('.ufg.br') ||
      host.endsWith('.gov.br') || host.endsWith('.edu.br') || host.endsWith('.edu');
    if (/(?:^|\/)(?:inscri(?:cao|coes)|candidatura|apply|submissao|matricula)(?:[/?#-]|$)/i.test(pathname)) {
      return hasApplicationPurpose && trustedInstitutionalHost;
    }
    if (trustedInstitutionalHost) return hasApplicationPurpose && hasApplicationLabel;
  } catch (_) {}
  return false;
}

function isTrustedOfficialDetailsUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' &&
      (host === 'ufg.br' || host.endsWith('.ufg.br'));
  } catch (_) {
    return false;
  }
}

function isTrustedOfficialDetailResolution(requestedUrl, effectiveUrl, html = '') {
  if (!isTrustedOfficialDetailsUrl(requestedUrl) || !isTrustedOfficialDetailsUrl(effectiveUrl)) {
    return false;
  }
  try {
    const requested = new URL(requestedUrl);
    const effective = new URL(effectiveUrl);
    const requestedHost = requested.hostname.toLowerCase().replace(/^www\./, '');
    const effectiveHost = effective.hostname.toLowerCase().replace(/^www\./, '');
    if (requestedHost !== effectiveHost) return false;
    const requestedIdentity = requested.pathname.match(/^\/(n|e)\/(\d+)(?:[-/]|$)/i);
    if (requestedIdentity) {
      const effectiveIdentity = effective.pathname.match(/^\/(n|e)\/(\d+)(?:[-/]|$)/i);
      if (!effectiveIdentity || effectiveIdentity[1].toLowerCase() !== requestedIdentity[1].toLowerCase() ||
          effectiveIdentity[2] !== requestedIdentity[2]) {
        return false;
      }
    } else if (!effective.pathname || effective.pathname === '/' || /\/(?:login|signin|entrar)(?:\/|$)/i.test(effective.pathname)) {
      return false;
    }
    const visibleText = normalizeText(extractText(html).slice(0, 1500));
    return !/\b(?:erro 404|pagina nao encontrada|conteudo nao encontrado|page not found)\b/.test(visibleText);
  } catch (_) {
    return false;
  }
}

function localActionContext(text, index, length) {
  const value = String(text || '');
  let start = index;
  while (start > 0 && !/[.!?;\n]/.test(value[start - 1])) start -= 1;
  let end = index + length;
  while (end < value.length && !/[.!?;\n]/.test(value[end])) end += 1;
  return value.slice(start, end).trim();
}

function actionEndpointMetadata(value) {
  const raw = String(value || '').trim();
  if (/^mailto:/i.test(raw) || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && !/^https?:/i.test(raw))) {
    return { purpose: 'application', confidence: 'high', hostClass: 'email' };
  }
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const formProviders = new Set([
      'forms.gle', 'forms.office.com', 'forms.microsoft.com', 'docs.google.com',
      'google.com', 'typeform.com',
    ]);
    if (host === 'ufg.br' || host.endsWith('.ufg.br')) {
      return { purpose: 'application', confidence: 'high', hostClass: 'ufg' };
    }
    if (formProviders.has(host) || host.endsWith('.typeform.com')) {
      return { purpose: 'application', confidence: 'high', hostClass: 'form_provider' };
    }
    if (/(?:^|\.)(?:even3\.com\.br|sympla\.com\.br|doity\.com\.br|eventbrite\.com)$/.test(host)) {
      return { purpose: 'application', confidence: 'high', hostClass: 'event_platform' };
    }
    return { purpose: 'application', confidence: 'high', hostClass: 'institutional' };
  } catch (_) {
    return { purpose: 'application', confidence: 'high', hostClass: 'unknown' };
  }
}

function collectActionEvidence(text, html, linkUrl, relevantLinks, temporal = {}) {
  const evidence = [];
  const seen = new Set();
  const add = (type, value, source, label = '') => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) return;
    const key = `${type}:${normalizedValue.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    evidence.push({
      type,
      value: normalizedValue,
      source,
      label: String(label || '').trim(),
      ...actionEndpointMetadata(normalizedValue),
    });
  };
  const selectedWindowDates = new Set([
    temporal.applicationOpensAt,
    temporal.applicationDeadline,
  ].filter(Boolean));
  const multipleApplicationWindows = Number(temporal.applicationRangeCount || 0) > 1;
  const contextMatchesSelectedWindow = (context) => {
    const contextDates = applicationWindowDatesFromContext(context);
    if (selectedWindowDates.size === 0) return true;
    if (contextDates.length === 0) return !multipleApplicationWindows;
    return contextDates.some(date => selectedWindowDates.has(date));
  };
  const matchesSelectedWindow = (link) => {
    if (link?.actionable === false) return false;
    const linkDates = Array.isArray(link?.applicationWindowDates)
      ? link.applicationWindowDates.filter(Boolean)
      : [];
    if (selectedWindowDates.size === 0) return true;
    if (linkDates.length === 0) return !multipleApplicationWindows;
    return linkDates.some(date => selectedWindowDates.has(date));
  };

  // Only visible text participates in action inference. Raw HTML may contain
  // hidden, archived, analytics, or footer URLs that are not user actions.
  const combined = `${text || ''} ${extractText(html || '')}`.trim();
  const urlPattern = /(?:https?:\/\/|mailto:)[^\s"'<>]+/gi;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(combined)) !== null) {
    const clean = urlMatch[0].replace(/[),.;]+$/, '');
    const context = localActionContext(combined, urlMatch.index, clean.length);
    if (contextMatchesSelectedWindow(context) && isActionableUrl(clean, '', context)) {
      add(clean.startsWith('mailto:') ? 'email' : 'application_url', clean, 'content');
    }
  }

  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  let emailMatch;
  while ((emailMatch = emailPattern.exec(combined)) !== null) {
    const context = localActionContext(combined, emailMatch.index, emailMatch[0].length);
    if (contextMatchesSelectedWindow(context) && isActionableUrl(`mailto:${emailMatch[0]}`, '', context)) {
      add('email', emailMatch[0], 'content');
    }
  }

  // linkUrl is the source article, never the application endpoint.
  const visibleHtmlLinks = extractRelevantLinks(html || '', linkUrl || 'https://ufg.br');
  for (const [group, links] of Object.entries(visibleHtmlLinks)) {
    for (const link of links || []) {
      if (matchesSelectedWindow(link) && isActionableUrl(link?.url, link?.label, link?.label)) {
        add(group === 'formularios' ? 'form' : 'application_url', link.url, 'html_anchor', link.label || group);
      }
    }
  }

  if (relevantLinks && typeof relevantLinks === 'object') {
    for (const [group, links] of Object.entries(relevantLinks)) {
      if (!Array.isArray(links)) continue;
      for (const link of links) {
        const linkLabel = String(link?.label || '');
        const isEmail = /^mailto:/i.test(String(link?.url || ''));
        if (matchesSelectedWindow(link) && (!isEmail || linkLabel) && isActionableUrl(link?.url, linkLabel, linkLabel)) {
          add(group === 'formularios' ? 'form' : 'application_url', link.url, 'relevant_links', link.label || group);
        }
      }
    }
  }

  return evidence;
}

const FETCH_META_MARKER = '\n__CADU_FETCH_META__:';
const fetchDiagnostics = [];

function safeDiagnosticUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function classifyCurlFailure(exitCode, httpStatus = 0) {
  if (httpStatus >= 500) return { kind: 'http_5xx', retryable: true };
  if ([408, 425, 429].includes(httpStatus)) return { kind: `http_${httpStatus}`, retryable: true };
  if (httpStatus >= 400) return { kind: `http_${httpStatus}`, retryable: false };
  if (exitCode === 60) return { kind: 'tls_chain_error', retryable: false };
  if (exitCode === 28) return { kind: 'timeout', retryable: true };
  if (exitCode === 6) return { kind: 'dns_error', retryable: true };
  if (exitCode === 7) return { kind: 'connect_error', retryable: true };
  if ([35, 52, 56].includes(exitCode)) return { kind: 'network_error', retryable: true };
  return { kind: 'transport_error', retryable: false };
}

function parseCurlFetchResult(result, url) {
  const stdout = String(result?.stdout || '');
  const markerIndex = stdout.lastIndexOf(FETCH_META_MARKER);
  const body = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
  const metadata = markerIndex >= 0
    ? stdout.slice(markerIndex + FETCH_META_MARKER.length).trim()
    : '';
  const [statusToken = '', effectiveUrlToken = ''] = metadata.split('\t');
  const httpStatus = Number.parseInt(statusToken, 10) || 0;
  const effectiveUrl = effectiveUrlToken || String(url || '');
  const exitCode = Number.isInteger(result?.status) ? result.status : null;

  if (exitCode === 0 && httpStatus >= 200 && httpStatus < 400 && body.trim()) {
    return { ok: true, body, httpStatus, effectiveUrl, diagnostic: null };
  }

  const failure = exitCode === 0 && httpStatus >= 200 && httpStatus < 400
    ? { kind: 'empty_body', retryable: true }
    : classifyCurlFailure(exitCode, httpStatus);
  return {
    ok: false,
    body: '',
    httpStatus,
    effectiveUrl,
    diagnostic: {
      url: safeDiagnosticUrl(url),
      effectiveUrl: safeDiagnosticUrl(effectiveUrl),
      kind: failure.kind,
      retryable: failure.retryable,
      httpStatus: httpStatus || null,
      curlExitCode: exitCode,
    },
  };
}

function fetchUrlResultViaAiaRecovery(url) {
  const helper = path.join(__dirname, 'lib', 'tls-aia-fetch.js');
  const result = spawnSync(process.execPath, [helper, url], {
    timeout: 28000,
    encoding: 'utf8',
    maxBuffer: 2.5 * 1024 * 1024,
    windowsHide: true,
  });
  const stdout = String(result?.stdout || '').trim();
  if (!stdout) {
    return {
      ok: false,
      body: '',
      httpStatus: 0,
      effectiveUrl: '',
      diagnostic: {
        url: safeDiagnosticUrl(url),
        effectiveUrl: '',
        kind: 'tls_aia_helper_empty',
        retryable: false,
        httpStatus: null,
        curlExitCode: Number.isInteger(result?.status) ? result.status : null,
      },
    };
  }
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid_helper_payload');
    return {
      ok: parsed.ok === true,
      body: typeof parsed.body === 'string' ? parsed.body : '',
      httpStatus: Number(parsed.httpStatus) || 0,
      effectiveUrl: typeof parsed.effectiveUrl === 'string' ? parsed.effectiveUrl : String(url || ''),
      diagnostic: parsed.diagnostic && typeof parsed.diagnostic === 'object'
        ? parsed.diagnostic
        : null,
    };
  } catch (_) {
    return {
      ok: false,
      body: '',
      httpStatus: 0,
      effectiveUrl: '',
      diagnostic: {
        url: safeDiagnosticUrl(url),
        effectiveUrl: '',
        kind: 'tls_aia_helper_invalid_json',
        retryable: false,
        httpStatus: null,
        curlExitCode: Number.isInteger(result?.status) ? result.status : null,
      },
    };
  }
}

function fetchUrlResult(url) {
  // S37/S52 fix: validar esquema HTTP(S) e nunca usar shell ou bypass TLS.
  // Incomplete server chains (common on some *.ufg.br RNP ICPEdu hosts) are
  // recovered via AIA intermediate download + verified Node fetch — never -k.
  if (!/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      body: '',
      httpStatus: 0,
      effectiveUrl: '',
      diagnostic: {
        url: '',
        effectiveUrl: '',
        kind: 'invalid_url',
        retryable: false,
        httpStatus: null,
        curlExitCode: null,
      },
    };
  }
  // Retry policy: --retry 2 + --retry-all-errors cobre blips transitorios
  // (DNS, connection reset, 5xx) sem retry em 4xx (autorais). Combined com o
  // wrapper de retry do network-fetch.js para chamadas HTTPS feitas pelo Node.
  // Fix W2 (2026-07-25): --max-time 10 -> 20 (30 timeouts no run 58267b6c).
  // 10s era pouco para sites Weby/ICHL com HTML grande (>500KB) e TTFB lento.
  // 20s + retry 2x cobre 99% dos casos sem inflar tempo total do pipeline.
  const result = spawnSync('curl', [
    '-sS', '-L',
    '-A', 'Mozilla/5.0 (compatible; CADU-Curator/4.4; +https://kinocampus.com.br)',
    '--connect-timeout', '10',
    '--max-time', '20',
    '--retry', '2',
    '--retry-all-errors',
    '--retry-delay', '1',
    '--retry-max-time', '60',
    '--retry-connrefused',
    '--write-out', `${FETCH_META_MARKER}%{http_code}\t%{url_effective}`,
    url,
  ], {
    timeout: 30000,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  const parsed = parseCurlFetchResult(result, url);
  if (parsed.ok) return parsed;

  if (parsed.diagnostic?.kind === 'tls_chain_error' && /^https:/i.test(url)) {
    const recovered = fetchUrlResultViaAiaRecovery(url);
    if (recovered.ok && recovered.body) {
      // Success after AIA recovery: do not record the original TLS failure as a
      // source-health error; the unit feed was retrieved with full verification.
      return {
        ok: true,
        body: recovered.body,
        httpStatus: recovered.httpStatus || 200,
        effectiveUrl: recovered.effectiveUrl || url,
        diagnostic: null,
        recoveredFromTlsAia: true,
      };
    }
    if (parsed.diagnostic) fetchDiagnostics.push(parsed.diagnostic);
    if (recovered.diagnostic) fetchDiagnostics.push(recovered.diagnostic);
    return parsed;
  }

  if (parsed.diagnostic) fetchDiagnostics.push(parsed.diagnostic);
  return parsed;
}

function fetchUrl(url) {
  return fetchUrlResult(url).body;
}

function fetchJson(url) {
  const raw = fetchUrl(url);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    fetchDiagnostics.push({
      url: safeDiagnosticUrl(url),
      kind: 'invalid_json',
      retryable: false,
      httpStatus: 200,
      curlExitCode: 0,
    });
    return null;
  }
}

function summarizeSourceFetchDiagnostics(name, diagnostics = []) {
  const outcomes = diagnostics
    .filter(entry => entry && entry.kind)
    .map(entry => ({
      url: entry.url || '',
      effectiveUrl: entry.effectiveUrl || '',
      kind: entry.kind,
      retryable: entry.retryable === true,
      httpStatus: entry.httpStatus || null,
      curlExitCode: Number.isInteger(entry.curlExitCode) ? entry.curlExitCode : null,
    }));
  if (outcomes.length === 0) {
    return { name, reason: 'feed_empty', retryable: true, outcomes: [] };
  }
  const priority = {
    tls_chain_error: 100,
    dns_error: 90,
    connect_error: 85,
    timeout: 80,
    network_error: 75,
    http_5xx: 70,
    invalid_json: 60,
    empty_body: 50,
  };
  const primary = outcomes.reduce((best, current) =>
    (priority[current.kind] || 40) > (priority[best.kind] || 40) ? current : best
  );
  return {
    name,
    reason: primary.kind,
    retryable: primary.retryable,
    outcomes: outcomes.slice(0, 6),
  };
}

function isInstagramPostReadyForCuration(post) {
  if (!post || post.relevant !== true) return false;
  return post._needsDetail === false
    && String(post._detailStatus || '').toLowerCase() === 'succeeded';
}

function shouldIngestInstagramArtifact(mode, artifactPath, env = process.env) {
  // Pipeline multi-stage may mark IG as failed and ask the curator to proceed
  // with web/event collection only, without re-running a second full IG scan.
  if (String(env.CADU_PIPELINE_IG_SKIP || '').trim() === '1') return false;
  return mode === 'full' || mode === 'ig-only' || Boolean(String(artifactPath || '').trim());
}

function classifyInstagramCandidate(post, referenceDate = TODAY) {
  const classified = classifyScannedInstagramPost(post, referenceDate);
  const ready = isInstagramPostReadyForCuration(classified);
  let decision = 'discard';
  if (ready && classified.expired !== true) {
    if (classified.score >= PUBLISH_THRESHOLD) decision = 'publish';
    else if (classified.score >= REVIEW_THRESHOLD) decision = 'review';
  }
  return {
    ...classified,
    ready,
    decision,
  };
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

function balancedElementAt(html, startIndex) {
  const value = String(html || '');
  if (!value || startIndex < 0 || startIndex >= value.length) return '';
  const opening = /^<([a-z][a-z0-9:-]*)\b[^>]*>/i.exec(value.slice(startIndex));
  if (!opening) return '';
  const tag = opening[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = startIndex;
  let depth = 0;
  let token;
  while ((token = tokenPattern.exec(value)) !== null) {
    const isClosing = /^<\//.test(token[0]);
    const isSelfClosing = /\/>$/.test(token[0]);
    if (isClosing) depth -= 1;
    else if (!isSelfClosing) depth += 1;
    if (depth === 0) return value.slice(startIndex, tokenPattern.lastIndex);
  }
  return '';
}

function firstElementByTag(html, tagName) {
  const value = String(html || '');
  const safeTag = String(tagName || '').replace(/[^a-z0-9:-]/gi, '');
  if (!value || !safeTag) return '';
  const opening = new RegExp(`<${safeTag}\\b[^>]*>`, 'i').exec(value);
  return opening ? balancedElementAt(value, opening.index) : '';
}

function firstElementByClass(html, className) {
  const value = String(html || '');
  const wanted = String(className || '').trim().toLowerCase();
  if (!value || !wanted) return '';
  const openingPattern = /<([a-z][a-z0-9:-]*)\b[^>]*\bclass\s*=\s*(["'])([^"']*)\2[^>]*>/gi;
  let opening;
  while ((opening = openingPattern.exec(value)) !== null) {
    const classes = opening[3].toLowerCase().split(/\s+/).filter(Boolean);
    if (!classes.includes(wanted)) continue;
    return balancedElementAt(value, opening.index);
  }
  return '';
}

function removeElementsByTag(html, tagNames) {
  let value = String(html || '');
  for (const rawTag of tagNames) {
    const tag = String(rawTag || '').replace(/[^a-z0-9:-]/gi, '');
    if (!tag) continue;
    let opening;
    const pattern = new RegExp(`<${tag}\\b[^>]*>`, 'i');
    while ((opening = pattern.exec(value)) !== null) {
      const block = balancedElementAt(value, opening.index);
      if (!block) break;
      value = `${value.slice(0, opening.index)} ${value.slice(opening.index + block.length)}`;
    }
  }
  return value;
}

/**
 * Keep hydrated signals inside one structural content boundary. Weby pages
 * place navigation PDFs and related cards around the article; scanning the
 * complete response can therefore attach a different edital to this item.
 * Empty-body redirect notices retain their article so summary/related URL
 * evidence is not lost.
 */
function extractPrimaryContentHtml(html) {
  const value = String(html || '');
  if (!value) return '';
  const main = firstElementByTag(value, 'main');
  const mainContent = main && (
    firstElementByClass(main, 'news-show') ||
    firstElementByClass(main, 'noticia') ||
    firstElementByTag(main, 'article') ||
    removeElementsByTag(main, ['aside', 'nav', 'footer'])
  );
  const namedNews = firstElementByClass(value, 'news-show') || firstElementByClass(value, 'noticia');
  const primary = mainContent || namedNews || firstElementByTag(value, 'article');
  if (primary) return primary;
  const body = firstElementByClass(value, 'body');
  return body && extractText(body).length >= 80 ? body : value;
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

function extractImages(html, baseUrl, primary, metadataHtml = '') {
  const urls = [];
  const add = (value) => {
    const url = normalizeImageUrl(value, baseUrl);
    if (url && !urls.includes(url)) urls.push(url);
  };
  add(primary);
  if (!html) return urls;
  const metadataPatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
  ];
  const contentPatterns = [
    /<img[^>]+src=["']([^"']+\.(?:png|jpe?g|webp)(?:\?[^"']*)?)["']/gi,
    /url\(["']?([^"')]+\.(?:png|jpe?g|webp)(?:\?[^"')]+)?)["']?\)/gi,
  ];
  // v4.4 P0-BugFix-4: filtrar imagens institucionais
  for (const [sourceHtml, patterns] of [
    [metadataHtml || html, metadataPatterns],
    [html, contentPatterns],
  ]) for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sourceHtml)) !== null) {
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
function visibleAnchorContext(html, anchorIndex, anchorLength = 0, includePreviousBlock = false) {
  const value = String(html || '');
  for (const tag of ['p', 'li', 'tr']) {
    const openings = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    let match;
    let candidate = null;
    let previous = null;
    while ((match = openings.exec(value)) !== null && match.index <= anchorIndex) {
      previous = candidate;
      candidate = match;
    }
    if (!candidate) continue;
    const block = balancedElementAt(value, candidate.index);
    if (block && candidate.index + block.length >= anchorIndex + anchorLength) {
      if (!includePreviousBlock || !previous) return extractText(block);
      const previousBlock = balancedElementAt(value, previous.index);
      const gap = extractText(value.slice(previous.index + (previousBlock?.length || 0), candidate.index));
      if (previousBlock && previous.index + previousBlock.length <= candidate.index && gap.length <= 80) {
        return `${extractText(previousBlock)} ${extractText(block)}`.trim();
      }
      return extractText(block);
    }
  }
  return extractText(value.slice(Math.max(0, anchorIndex - 360), Math.min(value.length, anchorIndex + anchorLength + 220)));
}

function applicationWindowDatesFromContext(context) {
  return [...new Set(parseDateEvidence(String(context || ''), 'link_context')
    .filter(evidence => evidence.role === 'applicationOpensAt' || evidence.role === 'applicationDeadline')
    .map(evidence => evidence.date)
    .filter(Boolean))].sort();
}

function extractRelevantLinks(html, baseUrl) {
  if (!html) return { formularios: [], editais: [], paginasOficiais: [], outros: [] };
  
  const formularios = [];
  const editais = [];
  const paginasOficiais = [];
  const outros = [];
  const seen = new Set();
  const activeApplicationContext = context => {
    const normalized = normalizeText(context);
    return /\b(?:inscricao gratuita|(?:pre\s+)?inscricoes?(?:\s+(?:estarao|ficarao|permanecerao|serao))?\s+abertas?|formulario (?:de|para) inscricao|inscreva se)\b/.test(normalized)
      && !/\b(?:encerrad[ao]s?|edicao anterior|arquivo|arquivado|historico|apenas como registro)\b/.test(normalized);
  };
  
  // v4.3: Extrair o BLOCO DE CONTEUDO PRINCIPAL (entre o titulo e o rodape)
  // para evitar pegar links de menu/sidebar. Procura o inicio do artigo.
  const contentHtml = extractPrimaryContentHtml(html)
  // Tambem: posicao do titulo (h1) é um bom comeco
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<(div|section|aside)[^>]*(?:hidden|aria-hidden=["']true["']|display\s*:\s*none)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  
  // Extrair anchors visiveis do bloco de conteudo. Aceitar aspas simples e
  // labels com markup interno, mas nunca inferir acao a partir de atributos
  // escondidos fora do href/label visivel.
  const linkRegex = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(contentHtml)) !== null) {
    const url = match[2].trim();
    const visibleLabel = extractText(match[3]).trim();
    const label = visibleLabel.toLowerCase();
    if (!url || seen.has(url)) continue;
    
    // Resolve relative URLs without turning mailto:/javascript: into fake HTTPS paths.
    if (/^(?:javascript|data|tel):/i.test(url)) continue;
    let fullUrl = url;
    try {
      if (!/^mailto:/i.test(url)) {
        const resolved = new URL(url, baseUrl);
        if (!/^https?:$/.test(resolved.protocol)) continue;
        fullUrl = resolved.toString();
      }
    } catch (_) { continue; }
    
    seen.add(url);
    
    // 1) FORMULARIOS
    if (/google\.com\/forms|forms\.gle|typeform\.com|docs\.google\.com\/forms/i.test(fullUrl)) {
      const nearbyText = visibleAnchorContext(contentHtml, match.index, match[0].length);
      formularios.push({
        url: fullUrl,
        label: activeApplicationContext(nearbyText) ? 'Formulário de inscrição' : visibleLabel,
        actionable: isActionableUrl(fullUrl, visibleLabel, nearbyText),
        applicationWindowDates: applicationWindowDatesFromContext(nearbyText),
      });
      continue;
    }
    
    // 2) EDITAIS (PDFs)
    if (/\.pdf($|\?)/i.test(fullUrl)) {
      editais.push({ url: fullUrl, label: visibleLabel });
      continue;
    }
    
    // 3) PAGINAS OFICIAIS do programa/curso (subdominios de UFG)
    const isUfgOfficial = /^https?:\/\/([a-z0-9-]+\.)*ufg\.br(?:\/|$)/i.test(fullUrl);
    const isProgramaPage = /programa|p[oó]s|ppg|faculdade|departamento|curso/i.test(label) || 
                           /\/p\/[a-z0-9-]+/i.test(fullUrl) || // padrao de paginas UFG (/p/xxx)
                           /ppg[a-z]+|programa|p[oó]s|faculdade|departamento|curso/i.test(fullUrl);
    if (isUfgOfficial && isProgramaPage) {
      paginasOficiais.push({ url: fullUrl, label: visibleLabel });
      continue;
    }

    // Alguns portais usam a própria URL como texto visível (ex.: ENGOPE).
    // Isso é evidência pré-LLM, mas só é confiável para domínios oficiais UFG;
    // uma URL externa escrita como label não ganha autoridade por este caminho.
    const isVisibleOfficialUrl = /^https?:\/\//i.test(visibleLabel)
      && normalizedSiteBaseUrl(visibleLabel) === normalizedSiteBaseUrl(fullUrl);
    if (isUfgOfficial && isVisibleOfficialUrl
        && normalizedSiteBaseUrl(fullUrl) !== normalizedSiteBaseUrl(baseUrl)) {
      outros.push({ url: fullUrl, label: visibleLabel });
      continue;
    }
    
    // 4) Links de acao (inscricao, edital, etc) — ainda que externos
    if (/inscri[cç][aã]o|edital|processo seletivo|sele[cç][aã]o|editais abertos|saiba mais|confira/i.test(label)) {
      if (fullUrl !== baseUrl) {
        outros.push({ url: fullUrl, label: visibleLabel });
      }
    }
  }
  // v4.5.2 P1-Sympla-Even3: detectar links externos de plataformas de inscrição no TEXTO
  // (não só em <a href>) — ex: "Link para inscrição: https://www.sympla.com.br/..."
  if (typeof contentHtml === 'string') {
    const symplaRegex = /(https?:\/\/(?:www\.)?(?:sympla|even3|even3\.com\.br|doity|eventbrite)\.com\.br?\/(?:evento|event)[^\s<"']+)/gi;
    const googleFormsRegex = /(https?:\/\/(?:docs\.google\.com\/forms|forms\.gle)\/[^\s<"']+)/gi;
    const addIfNew = (arr, url, label) => {
      if (arr.some(o => o.url === url)) return;
      arr.push({ url, label });
    };
    let m;
    while ((m = symplaRegex.exec(contentHtml)) !== null) {
      addIfNew(outros, m[1], 'Inscrição (Sympla/Even3)');
    }
    while ((m = googleFormsRegex.exec(contentHtml)) !== null) {
      if (formularios.some(entry => entry.url === m[1])) continue;
      const nearbyText = visibleAnchorContext(contentHtml, m.index, m[0].length, true);
      const label = activeApplicationContext(nearbyText) ? 'Formulário de inscrição' : 'Formulário Google';
      formularios.push({
        url: m[1],
        label,
        actionable: isActionableUrl(m[1], label, nearbyText),
        applicationWindowDates: applicationWindowDatesFromContext(nearbyText),
      });
    }
  }
  
  return {
    formularios: formularios.slice(0, 3),
    editais: editais.slice(0, 3),
    paginasOficiais: paginasOficiais.slice(0, 3),
    outros: outros.slice(0, 3),
  };
}

function mergeRelevantLinks(...collections) {
  const merged = { formularios: [], editais: [], paginasOficiais: [], outros: [] };
  const seen = new Set();
  for (const collection of collections) {
    if (!collection || typeof collection !== 'object') continue;
    for (const key of Object.keys(merged)) {
      for (const entry of Array.isArray(collection[key]) ? collection[key] : []) {
        const url = String(entry?.url || '').trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        merged[key].push(entry);
      }
    }
  }
  return merged;
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
  const boundary = /(?:[.!?;]\s+|\r?\n+)/g;
  let match;
  while ((match = boundary.exec(text)) !== null && match.index < index) {
    start = match.index + match[0].length;
  }
  return start;
}

function sentenceEnd(text, index) {
  const value = String(text || '');
  const safeIndex = Math.max(0, index);
  const boundary = /(?:[.!?;](?=\s|$)|\r?\n+)/.exec(value.slice(safeIndex));
  return boundary ? safeIndex + boundary.index + boundary[0].length : value.length;
}

const RESTRICTED_ENROLLMENT_AUDIENCE = '(?:aprovad[oa]s?|selecionad[oa]s?|classificad[oa]s?|convocad[oa]s?)';
const RESTRICTED_ENROLLMENT_LABEL = `(?:matriculas?\\b.{0,100}\\b${RESTRICTED_ENROLLMENT_AUDIENCE}|${RESTRICTED_ENROLLMENT_AUDIENCE}\\b.{0,100}\\bmatriculas?)`;
const RESTRICTED_ENROLLMENT_BEFORE_DATE = new RegExp(`${RESTRICTED_ENROLLMENT_LABEL}(?:\\s+[a-z0-9]+){0,8}$`);
const RESTRICTED_ENROLLMENT_AFTER_DATE = new RegExp(`^(?:[a-z0-9]+\\s+){0,3}${RESTRICTED_ENROLLMENT_LABEL}\\b`);

function isRestrictedEnrollmentContext(text, index, length = 0) {
  const start = Math.max(sentenceStart(text, index), index - 180);
  const tail = text.slice(index + length);
  const boundary = /(?:[.!?;]\s+|\n+)/.exec(tail);
  const end = boundary ? index + length + boundary.index : Math.min(text.length, index + length + 180);
  const before = normalizeText(text.slice(start, index));
  const afterRaw = text.slice(index + length, end);
  const after = normalizeText(afterRaw);

  if (RESTRICTED_ENROLLMENT_BEFORE_DATE.test(before)) return true;

  // A label can follow a range in tables ("31/08 a 05/09 - matricula dos
  // aprovados"). Do not borrow the label from the next dated schedule row.
  return RESTRICTED_ENROLLMENT_AFTER_DATE.test(after) &&
    !/\b\d{1,2}\s*[/-]\s*\d{1,2}(?:\s*[/-]\s*\d{2,4})?\b/.test(afterRaw);
}

function isPostResultEnrollmentContext(text, index, length = 0) {
  const before = normalizeText(text.slice(Math.max(0, index - 420), index));
  const after = normalizeText(text.slice(index + length, Math.min(text.length, index + length + 180)));
  const terminalIndex = lastMatchIndex(
    before,
    /\b(?:resultado final|homologacao final|lista (?:final )?(?:de )?(?:aprovados|selecionados|classificados))\b/g,
  );
  const enrollmentIndex = lastMatchIndex(
    before,
    /\b(?:data|periodo|prazo) (?:da|de|para) matricula\b|\bmatricula (?:dos|das) (?:aprovados|selecionados|classificados|convocados)\b/g,
  );
  const reopenedApplicationIndex = lastMatchIndex(
    before,
    /\b(?:novas? inscricoes?|inscricoes? (?:reabertas?|abertas?)|reabertura|vagas? remanescentes?|novo processo seletivo)\b/g,
  );
  const enrollmentAfter = /^(?:\s*(?:-|:|para|dos|das))*\s*matricula\b/.test(after);
  if (terminalIndex < 0) return false;
  if (enrollmentAfter) return true;
  if (enrollmentIndex <= terminalIndex || before.length - enrollmentIndex > 220) return false;
  return reopenedApplicationIndex <= enrollmentIndex;
}

function maskUrlsForTemporalParsing(text) {
  return String(text || '').replace(/(?:https?:\/\/|mailto:)[^\s"'<>]+/gi, match => ' '.repeat(match.length));
}

function calendarDayDistance(fromIso, toIso) {
  const from = new Date(`${fromIso}T12:00:00Z`);
  const to = new Date(`${toIso}T12:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to - from) / 86400000);
}

function adjustInferredDate(iso, role, temporalDirection, context = '', anchorIso = TODAY_ISO) {
  if (!iso) return iso;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const normalizedContext = normalizeText(context);
  let targetYear = year;

  const semanticAnchor = /^\d{4}-\d{2}-\d{2}$/.test(anchorIso) ? anchorIso : TODAY_ISO;

  if (temporalDirection === 'future' && iso < semanticAnchor) {
    targetYear += 1;
  } else if (temporalDirection === 'past' && iso > semanticAnchor) {
    targetYear -= 1;
  } else if ((role === 'applicationDeadline' || role === 'applicationOpensAt') && iso < semanticAnchor) {
    // Around the year boundary, a fresh "inscricoes abertas ate janeiro"
    // normally refers to the next calendar year. A recently elapsed 10/7 on
    // 11/7 must remain in the current year and close the window.
    const hasOpenWindowLanguage = /\b(?:abertas?|reabertas?|prorrogadas?|seguem abertas?|podem ser feitas?)\b/.test(normalizedContext);
    if (hasOpenWindowLanguage && calendarDayDistance(iso, semanticAnchor) > 180) targetYear += 1;
  }

  return targetYear === year ? iso : validIsoDate(targetYear, month, day);
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

const PAST_EVENT_VERB_PATTERN = /\b(?:edicao\s+anterior|(?:foi|foram|era|eram)\s+(?:realizad[oa]s?|promovid[oa]s?|sediad[oa]s?|concluid[oa]s?|encerrad[oa]s?)|(?:teve|tiveram)\s+inicio|realizou|realizaram|promoveu|promoveram|sediou|sediaram|aconteceu|ocorreu|encerrou|encerraram|concluiu|concluiram|finalizou|finalizaram|reuniu|reuniram|contou\s+com|recebeu|receberam|celebrou|celebraram|marcou|marcaram|mobilizou|mobilizaram|participou|participaram|apresentou|apresentaram|debateu|debateram|discutiu|discutiram|registrou|registraram|atraiu|atrairam|contabilizou|contabilizaram)\b/;
const FUTURE_EVENT_VERB_PATTERN = /\b(?:(?:nova|proxima)\s+edicao|(?:sera|serao)\s+(?:realizad[oa]s?|promovid[oa]s?|sediad[oa]s?)|(?:vai|vao|ira|irao)\s+(?:acontecer|ocorrer|comecar|iniciar|ser\s+realizad[oa]|ter\s+inicio)|(?:esta|estao)\s+programad[oa]s?|(?:tera|terao)\s+inicio|realizara|realizarao|promovera|promoverao|sediara|sediarao|acontecera|acontecerao|ocorrera|ocorrerao|comecara|comecarao|iniciara|iniciarao|recebera|receberao|acontece|ocorre|comeca|inicia|proxim[oa]s?\s+(?:edicao|evento|encontro|palestra|oficina|seminario|curso|workshop|conferencia|jornada))\b/;

function firstMatchIndex(text, pattern) {
  const regex = new RegExp(pattern.source, pattern.flags.replace(/g/g, ''));
  const match = regex.exec(text);
  return match ? match.index : -1;
}

function temporalDirectionAt(text, index, length) {
  const start = sentenceStart(text, index);
  const tail = text.slice(index + length);
  const boundary = /[.!?;]/.exec(tail);
  const end = boundary ? index + length + boundary.index : text.length;
  const before = normalizeText(text.slice(start, index));
  const after = normalizeText(text.slice(index + length, end));
  const candidates = [];
  const pastBefore = lastMatchIndex(before, PAST_EVENT_VERB_PATTERN);
  const futureBefore = lastMatchIndex(before, FUTURE_EVENT_VERB_PATTERN);
  const pastAfter = firstMatchIndex(after, PAST_EVENT_VERB_PATTERN);
  const futureAfter = firstMatchIndex(after, FUTURE_EVENT_VERB_PATTERN);
  if (pastBefore >= 0) candidates.push({ direction: 'past', distance: before.length - pastBefore });
  if (futureBefore >= 0) candidates.push({ direction: 'future', distance: before.length - futureBefore });
  if (pastAfter >= 0) candidates.push({ direction: 'past', distance: pastAfter + 1 });
  if (futureAfter >= 0) candidates.push({ direction: 'future', distance: futureAfter + 1 });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.direction || 'unknown';
}

function classifyDateRole(text, index) {
  if (isRestrictedEnrollmentContext(text, index) || isPostResultEnrollmentContext(text, index)) return 'contextDate';

  const before = normalizeText(text.slice(sentenceStart(text, index), index));
  const adjudicationPublicationIndex = lastMatchIndex(
    before,
    /\b(?:relacao|lista) (?:d[ae]s? )?(?:inscricoes?|candidaturas?) (?:deferidas?|indeferidas?|homologadas?|selecionadas?|aprovadas?)\b[^.!?;]{0,120}\b(?:divulgad[ao]s?|publicad[ao]s?|disponibilizad[ao]s?)\b/g,
  );
  if (adjudicationPublicationIndex >= 0) return 'resultPublishedAt';
  const resultIndex = lastMatchIndex(before, /\b(?:resultado|resultado final|resultado preliminar|homologacao|lista de aprovados)\b/g);
  const genericApplicationIndex = lastMatchIndex(
    before,
    /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas|solicitacao|solicitacoes|requerimento|requerimentos|cadastro|cadastros|prazo\s+(?:de|para)\s+(?:inscricao|submissao|candidatura|matricula|solicitacao|requerimento|cadastro))\b/g
  );
  const benefitRequestIndex = lastMatchIndex(
    before,
    /\b(?:(?:pedido|pedidos)\b[^.!?;]{0,40}\b(?:auxilio|beneficio|subsidio|permanencia)|(?:auxilio|beneficio|subsidio|permanencia)\b[^.!?;]{0,40}\b(?:pedido|pedidos))\b/g,
  );
  const applicationIndex = Math.max(genericApplicationIndex, benefitRequestIndex);
  const eventContextIndex = lastMatchIndex(
    before,
    /\b(?:data|evento|edicao|processo\s+seletivo|curso|aula|aulas|prova|provas|palestra|workshop|seminario|simposio|congresso|oficina|semana|jornada|forum|coloquio|conferencia|festival|feira|mostra|encontro|programacao|realizad[oa]s?|sera\s+realizad[oa]|serao\s+realizad[oa]s?|ocorre|ocorrera|ocorrerao|acontece|acontecera|acontecerao|comeca|comecara|inicia|iniciara)\b/g
  );
  const nonApplicationResponseIndex = lastMatchIndex(
    before,
    /\b(?:pesquisa|questionario|consulta|levantamento|diagnostico|formulario\s+(?:de\s+)?(?:avaliacao|feedback)|interposicao\s+de\s+recurso|pedido\s+de\s+recurso)\b/g
  );

  if (nonApplicationResponseIndex > Math.max(resultIndex, applicationIndex, eventContextIndex)) {
    return 'contextDate';
  }

  if (resultIndex > Math.max(applicationIndex, eventContextIndex)) {
    return 'resultPublishedAt';
  }

  // A course/event name commonly appears between "inscricoes" and its deadline.
  // Prefer the explicit registration cue over the nearer event noun in that case.
  const explicitApplicationDeadline = /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas|solicitacao|solicitacoes|requerimento|requerimentos|cadastro|cadastros)\b[^.!?;]{0,160}\b(?:ate|encerra|encerram|encerramento|limite|prazo final)\b[^.!?;]{0,35}$/.test(before);
  const explicitApplicationOpening = /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas|solicitacao|solicitacoes|requerimento|requerimentos|cadastro|cadastros)\b[^.!?;]{0,160}\b(?:abrem|abertas|abertura|iniciam|inicio)\b[^.!?;]{0,35}$/.test(before) &&
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

function parseDateEvidence(text, source = 'item_text', anchorDate = TODAY_ISO) {
  const scanText = maskUrlsForTemporalParsing(text);
  const occurrences = [];
  const coveredRanges = [];
  const semanticAnchor = /^\d{4}-\d{2}-\d{2}$/.test(anchorDate) ? anchorDate : TODAY_ISO;
  const anchorYear = Number(semanticAnchor.slice(0, 4));
  const monthPattern = 'janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';

  const excerptFor = (start, length) => text
    .slice(Math.max(0, start - 70), Math.min(text.length, start + length + 70))
    .replace(/\s+/g, ' ')
    .trim();

  const rolesForRange = (index, length) => {
    if (isRestrictedEnrollmentContext(text, index, length) || isPostResultEnrollmentContext(text, index, length)) {
      return ['contextDate', 'contextDate'];
    }

    const nearbyBefore = normalizeText(text.slice(Math.max(sentenceStart(text, index), index - 220), index));
    const nearbyAfterRaw = text.slice(index + length, Math.min(text.length, index + length + 140));
    const nearbyAfter = normalizeText(nearbyAfterRaw.split(/[.!?;]/, 1)[0]);
    const projectExecutionRange = /\b(?:periodo|prazo) (?:de|da) (?:execucao|vigencia|desenvolvimento)(?: (?:do|da) projeto)?\b[^.!?;]{0,80}$/.test(nearbyBefore) ||
      /\b(?:projetos? )?(?:serao |sera )?(?:executad[oa]s?|desenvolvid[oa]s?)\b[^.!?;]{0,60}\b(?:no|durante o) periodo de\b[^.!?;]{0,15}$/.test(nearbyBefore);
    if (projectExecutionRange) return ['contextDate', 'contextDate'];
    const registrationNamedAfterRange = /\b(?:aberta|abertas|aberto|abertos)\b[^.!?;]{0,80}$/.test(nearbyBefore) &&
      /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas)\b/.test(nearbyAfter);
    if (registrationNamedAfterRange) return ['applicationOpensAt', 'applicationDeadline'];
    const registrationDeclaredAfterRange = /^(?:\s*(?:(?:(?:estara|estarao|ficara|ficarao|permanecera|permanecerao|sera|serao)\s+)?(?:aberta|abertas|aberto|abertos|aceita|aceitas|aceito|aceitos)\b[^.!?;]{0,45}\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas)|(?:as?\s+)?(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas)\b[^.!?;]{0,35}\b(?:estara|estarao|ficara|ficarao|permanecera|permanecerao|sera|serao)\s+(?:aberta|abertas|aberto|abertos|aceita|aceitas|aceito|aceitos)\b))/.test(nearbyAfter);
    if (registrationDeclaredAfterRange) return ['applicationOpensAt', 'applicationDeadline'];
    const registrationWindowBeforeRange = /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas)\b[^.!?;]{0,100}\b(?:aberta|abertas|reaberta|reabertas|prorrogada|prorrogadas|realizada|realizadas|periodo|datas?|dias?)\b[^.!?;]{0,45}$/.test(nearbyBefore);
    const explicitEventRange = /\b(?:evento|curso|aula|aulas|prova|provas|palestra|workshop|seminario|simposio|congresso|oficina|semana|jornada|forum|coloquio|conferencia|festival|feira|mostra|encontro)\b[^.!?;]{0,100}\b(?:sera|serao|acontece|acontecera|acontecerao|ocorre|ocorrera|ocorrerao|realizad[oa]s?)\b[^.!?;]{0,55}$/.test(nearbyBefore);
    if (registrationWindowBeforeRange && !explicitEventRange) return ['applicationOpensAt', 'applicationDeadline'];

    const role = classifyDateRole(text, index);
    if (role === 'contextDate') return ['contextDate', 'contextDate'];
    if (role === 'applicationDeadline' || role === 'applicationOpensAt') {
      return ['applicationOpensAt', 'applicationDeadline'];
    }
    if (role === 'resultPublishedAt') return ['resultPublishedAt', 'resultPublishedAt'];
    return ['eventStartsAt', 'eventEndsAt'];
  };

  const namedCrossMonthDates = (match) => {
    const startMonth = MONTHS_PT[match[2].toLowerCase()];
    const endMonth = MONTHS_PT[match[5].toLowerCase()];
    const startOrdinal = (Number(startMonth) * 100) + Number(match[1]);
    const endOrdinal = (Number(endMonth) * 100) + Number(match[4]);
    let firstYear = match[3] ? Number(match[3]) : (match[6] ? Number(match[6]) : anchorYear);
    let secondYear = match[6] ? Number(match[6]) : firstYear;
    // When only the final year is explicit, a Dec→Jan range belongs to the
    // previous year at its start ("30 Dec a 2 Jan de 2027").
    if (!match[3] && match[6] && endOrdinal < startOrdinal) firstYear = secondYear - 1;
    return [
      validIsoDate(firstYear, startMonth, match[1]),
      validIsoDate(secondYear, endMonth, match[4]),
    ];
  };

  const rangePatterns = [
    {
      // Full cross-month ranges with ordinal days must win before the legacy
      // same-month matcher can read the trailing "26" in year 2026 as a day.
      regex: new RegExp(`(?<!\\d)(\\d{1,2})\\s*(?:[oº°ªa]\\s*)?de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?\\s*(?:a|e|at[eé])\\s*(\\d{1,2})\\s*(?:[oº°ªa]\\s*)?de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?(?!\\d)`, 'gi'),
      toDates: namedCrossMonthDates,
      endYearOmitted: (match) => !match[6],
    },
    {
      regex: new RegExp(`(\\d{1,2})\\s+de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?\\s*(?:a|e|at[eé])\\s*(\\d{1,2})\\s+de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?`, 'gi'),
      toDates: namedCrossMonthDates,
      endYearOmitted: (match) => !match[6],
    },
    {
      regex: new RegExp(`(\\d{1,2})\\s*,\\s*(\\d{1,2})\\s+e\\s+(\\d{1,2})\\s+de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?`, 'gi'),
      toDates: (match) => [
        validIsoDate(match[5] || anchorYear, MONTHS_PT[match[4].toLowerCase()], match[1]),
        validIsoDate(match[5] || anchorYear, MONTHS_PT[match[4].toLowerCase()], match[3]),
      ],
    },
    {
      regex: new RegExp(`(\\d{1,2})\\s*(?:a|e|at[eé])\\s*(\\d{1,2})\\s+de\\s+(${monthPattern})(?:\\s+de\\s+(\\d{4}))?`, 'gi'),
      toDates: (match) => [
        validIsoDate(match[4] || anchorYear, MONTHS_PT[match[3].toLowerCase()], match[1]),
        validIsoDate(match[4] || anchorYear, MONTHS_PT[match[3].toLowerCase()], match[2]),
      ],
    },
    {
      regex: /(?<![\/\d])(\d{1,2})\s*(?:a|e|at[eé])\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\/\d])/gi,
      toDates: (match) => {
        let year = match[4] ? Number(match[4]) : anchorYear;
        if (year < 100) year += 2000;
        return [
          validIsoDate(year, match[3], match[1]),
          validIsoDate(year, match[3], match[2]),
        ];
      },
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
    {
      regex: /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|e|at[eé])\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\/\d])/gi,
      toDates: (match) => {
        let firstYear = match[3] ? Number(match[3]) : (match[6] ? Number(match[6]) : anchorYear);
        let secondYear = match[6] ? Number(match[6]) : firstYear;
        if (firstYear < 100) firstYear += 2000;
        if (secondYear < 100) secondYear += 2000;
        const startOrdinal = (Number(match[2]) * 100) + Number(match[1]);
        const endOrdinal = (Number(match[5]) * 100) + Number(match[4]);
        if (!match[3] && match[6] && endOrdinal < startOrdinal) firstYear = secondYear - 1;
        return [
          validIsoDate(firstYear, match[2], match[1]),
          validIsoDate(secondYear, match[5], match[4]),
        ];
      },
      endYearOmitted: (match) => !match[6],
    },
  ];

  let rangeSequence = 0;
  for (const { regex, toDates, endYearOmitted = () => false } of rangePatterns) {
    let match;
    while ((match = regex.exec(scanText)) !== null) {
      if (coveredRanges.some(({ start, end }) => match.index >= start && match.index < end)) continue;
      let [startDate, endDate] = toDates(match);
      if (!startDate || !endDate) continue;
      const [startRole, endRole] = rolesForRange(match.index, match[0].length);
      const excerpt = excerptFor(match.index, match[0].length);
      const yearInferred = !/(?:\b(?:19|20)\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/.test(match[0]);
      const temporalDirection = temporalDirectionAt(text, match.index, match[0].length);
      if (yearInferred) {
        startDate = adjustInferredDate(startDate, startRole, temporalDirection, excerpt, semanticAnchor);
        endDate = adjustInferredDate(endDate, endRole, temporalDirection, excerpt, semanticAnchor);
      }
      if (endDate < startDate && endYearOmitted(match)) {
        endDate = validIsoDate(
          Number(startDate.slice(0, 4)) + 1,
          Number(endDate.slice(5, 7)),
          Number(endDate.slice(8, 10))
        );
      }
      const rangeId = `${source}:range:${rangeSequence++}`;
      occurrences.push({ date: startDate, role: startRole, excerpt, source, yearInferred, temporalDirection, rangeId, index: match.index });
      occurrences.push({ date: endDate, role: endRole, excerpt, source, yearInferred, temporalDirection, rangeId, index: match.index + match[0].length - 1 });
      coveredRanges.push({ start: match.index, end: regex.lastIndex });
    }
  }

  const patterns = [
    {
      regex: /(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/gi,
      toIso: (match) => validIsoDate(match[3] || anchorYear, MONTHS_PT[match[2].toLowerCase()], match[1]),
    },
    {
      regex: /(\d{4})-(\d{2})-(\d{2})/g,
      toIso: (match) => validIsoDate(match[1], match[2], match[3]),
    },
    {
      regex: /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\/\d])/g,
      toIso: (match) => {
        let year = match[3] ? Number(match[3]) : anchorYear;
        if (year < 100) year += 2000;
        return validIsoDate(year, match[2], match[1]);
      },
    },
  ];

  for (const { regex, toIso } of patterns) {
    let match;
    while ((match = regex.exec(scanText)) !== null) {
      if (coveredRanges.some(({ start, end }) => match.index >= start && match.index < end)) continue;
      let date = toIso(match);
      if (!date) continue;
      const role = classifyDateRole(text, match.index);
      const excerpt = excerptFor(match.index, match[0].length);
      const yearInferred = !/(?:\b(?:19|20)\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/.test(match[0]);
      const temporalDirection = temporalDirectionAt(text, match.index, match[0].length);
      if (yearInferred) date = adjustInferredDate(date, role, temporalDirection, excerpt, semanticAnchor);
      occurrences.push({
        date,
        role,
        excerpt,
        source,
        yearInferred,
        temporalDirection,
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
    });
}

function firstRoleDate(evidence, role) {
  const dates = evidence.filter(item => item.role === role).map(item => item.date).sort();
  return dates[0] || null;
}

function lastRoleDate(evidence, role) {
  const dates = evidence.filter(item => item.role === role).map(item => item.date).sort();
  return dates[dates.length - 1] || null;
}

function preferredUpcomingRoleDate(evidence, role, fallback = 'first') {
  const roleEvidence = evidence.filter(item => item.role === role);
  const upcomingEvidence = roleEvidence.filter(item =>
    item.date >= TODAY_ISO || item.temporalDirection === 'structured' ||
      (item.yearInferred === true && item.temporalDirection === 'future')
  );
  const candidates = upcomingEvidence.length ? upcomingEvidence : roleEvidence;
  const dates = candidates.map(item => item.date).filter(Boolean).sort();
  return fallback === 'last' ? (dates.at(-1) || null) : (dates[0] || null);
}

function preferredUpcomingEventRange(evidence) {
  const groups = new Map();
  for (const item of evidence) {
    if (!item.rangeId || (item.role !== 'eventStartsAt' && item.role !== 'eventEndsAt')) continue;
    const group = groups.get(item.rangeId) || { rangeId: item.rangeId, start: null, end: null };
    if (item.role === 'eventStartsAt') group.start = item.date;
    if (item.role === 'eventEndsAt') group.end = item.date;
    groups.set(item.rangeId, group);
  }
  const complete = [...groups.values()]
    .filter(group => group.start && group.end && group.start <= group.end)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return complete.find(group => group.end >= TODAY_ISO) || null;
}

function preferredApplicationRange(evidence, sourceTexts = {}) {
  const groups = new Map();
  for (const item of evidence) {
    if (!item.rangeId || (item.role !== 'applicationOpensAt' && item.role !== 'applicationDeadline')) continue;
    const group = groups.get(item.rangeId) || {
      rangeId: item.rangeId,
      source: item.source,
      start: null,
      end: null,
      startIndex: item.index,
      endIndex: item.index,
    };
    if (item.role === 'applicationOpensAt') group.start = item.date;
    if (item.role === 'applicationDeadline') group.end = item.date;
    if (Number.isFinite(item.index)) {
      group.startIndex = Math.min(group.startIndex ?? item.index, item.index);
      group.endIndex = Math.max(group.endIndex ?? item.index, item.index);
    }
    groups.set(item.rangeId, group);
  }
  const complete = [...groups.values()]
    .filter(group => group.start && group.end && group.start <= group.end)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const isExplicitlyClosed = (group) => {
    const sourceText = String(sourceTexts[group.source] || '');
    if (!sourceText || !Number.isFinite(group.startIndex)) return false;
    const segmentStart = sentenceStart(sourceText, group.startIndex);
    const segmentEnd = sentenceEnd(sourceText, group.endIndex ?? group.startIndex);
    const segment = normalizeText(sourceText.slice(segmentStart, segmentEnd));
    return /\b(?:inscricoes?|candidaturas?|submissoes?|matriculas?)\b[^.!?;]{0,120}\b(?:encerradas?|fechadas?|finalizadas?|canceladas?|suspensas?)\b/.test(segment) ||
      /\b(?:encerradas?|fechadas?|finalizadas?|canceladas?|suspensas?)\b[^.!?;]{0,120}\b(?:inscricoes?|candidaturas?|submissoes?|matriculas?)\b/.test(segment);
  };
  const eligible = complete.filter(group => !isExplicitlyClosed(group));
  return eligible.find(group => group.start <= TODAY_ISO && group.end >= TODAY_ISO) ||
    eligible.find(group => group.start > TODAY_ISO) ||
    eligible.sort((a, b) => b.end.localeCompare(a.end))[0] ||
    complete.sort((a, b) => b.end.localeCompare(a.end))[0] ||
    null;
}

function distinctApplicationRangeCount(evidence) {
  const groups = new Map();
  for (const item of evidence) {
    if (!item.rangeId || (item.role !== 'applicationOpensAt' && item.role !== 'applicationDeadline')) continue;
    const group = groups.get(item.rangeId) || { start: null, end: null };
    if (item.role === 'applicationOpensAt') group.start = item.date;
    if (item.role === 'applicationDeadline') group.end = item.date;
    groups.set(item.rangeId, group);
  }
  return new Set([...groups.values()]
    .filter(group => group.start && group.end)
    .map(group => `${group.start}|${group.end}`)).size;
}

function normalizeStructuredDate(rawDate) {
  if (!rawDate) return null;
  const raw = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return validIsoDate(raw.slice(0, 4), raw.slice(5, 7), raw.slice(8, 10)) || null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return isoDateInTimeZone(parsed);
}

function looksLikePublicationTimestamp(evidence, publishedDate) {
  if (!publishedDate || evidence.date !== publishedDate) return false;
  return /\b(?:(?:publicad[oa]|atualizad[oa])\s+)?em\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+(?:as\s+)?\d{1,2}[:h]\d{2}\b/i.test(evidence.excerpt);
}

function lastApplicationStatusSignal(normalizedText, minIndex = 0, maxIndex = normalizedText.length) {
  const signals = [];
  const addMatches = (regex, statusGroup) => {
    let match;
    while ((match = regex.exec(normalizedText)) !== null) {
      if (match.index < minIndex || match.index >= maxIndex || match.index + match[0].length > maxIndex) continue;
      const token = match[statusGroup];
      const closed = /^(?:encerr|fech|finaliz|cancel|suspens)/.test(token);
      const reopened = /^(?:reabert|prorrog)/.test(token);
      const localContext = normalizedText.slice(Math.max(minIndex, match.index - 28), match.index + match[0].length);
      const explicitlyNotOpen = !closed && /\b(?:ainda\s+)?nao\b[^.!?;]{0,28}\b(?:esta|estao|permanece|permanecem|ficara|ficarao|sera|serao)?\s*abert/.test(localContext);
      const futureOpen = !closed && !explicitlyNotOpen &&
        /\b(?:estara|estarao|ficara|ficarao|sera|serao|abrira|abrirao)\b[^.!?;]{0,20}\babert/.test(localContext);
      signals.push({
        index: match.index,
        status: closed ? 'closed' : (explicitlyNotOpen ? 'not_open' : (futureOpen ? 'future_open' : 'open')),
        reopened,
        token,
      });
      if (match[0].length === 0) regex.lastIndex++;
    }
  };
  const applicationNoun = '(?:inscricoes?|candidaturas?|submissoes?|matriculas?|solicitacoes?|requerimentos?|cadastros?)';
  const statusToken = '(abertas?|reabertas?|prorrogadas?|encerradas?|fechadas?|finalizadas?|canceladas?|suspensas?)';
  addMatches(new RegExp(`\\b${applicationNoun}\\b[^.!?;]{0,120}\\b${statusToken}\\b`, 'g'), 1);
  addMatches(new RegExp(`\\b${statusToken}\\b[^.!?;]{0,120}\\b${applicationNoun}\\b`, 'g'), 1);
  addMatches(/\bprazo\b[^.!?;]{0,120}\b(prorrogad[oa]|reabert[oa]|encerrad[oa]|fechad[oa]|finalizad[oa]|cancelad[oa]|suspens[oa])\b/g, 1);
  return signals.sort((a, b) => a.index - b.index).at(-1) || null;
}

function analyzeTemporalRelevance(text, html, webyDate, options = {}) {
  const htmlText = extractText(html || '');
  const fullText = `${text || ''}.\n${htmlText}`.trim();
  const publishedAt = options.publishedAt || webyDate || null;
  const updatedAt = options.updatedAt || null;
  const publishedDate = normalizeStructuredDate(publishedAt);
  const updatedDate = normalizeStructuredDate(updatedAt);
  const semanticAnchor = updatedDate || publishedDate || TODAY_ISO;
  const evidenceSeen = new Set();
  const dateEvidence = [
    ...parseDateEvidence(text || '', 'item_text', semanticAnchor),
    ...parseDateEvidence(htmlText, 'html', semanticAnchor),
  ].filter((item) => {
    if (looksLikePublicationTimestamp(item, publishedDate)) return false;
    if (item.role === 'contextDate' && item.date === publishedDate) return false;
    const key = `${item.date}:${item.role}:${normalizeText(item.excerpt)}`;
    if (evidenceSeen.has(key)) return false;
    evidenceSeen.add(key);
    return true;
  });

  const structuredEventStartsAt = normalizeStructuredDate(options.eventStartsAt);
  const structuredEventEndsAt = normalizeStructuredDate(options.eventEndsAt);
  if (structuredEventStartsAt) {
    dateEvidence.push({
      date: structuredEventStartsAt,
      role: 'eventStartsAt',
      excerpt: 'structured event start',
      source: 'structured_event',
      yearInferred: false,
      temporalDirection: 'structured',
    });
  }
  if (structuredEventEndsAt) {
    dateEvidence.push({
      date: structuredEventEndsAt,
      role: 'eventEndsAt',
      excerpt: 'structured event end',
      source: 'structured_event',
      yearInferred: false,
      temporalDirection: 'structured',
    });
  }

  const filteredDates = [...new Set(dateEvidence.map(item => item.date))].sort();
  const futureDates = filteredDates.filter(date => date >= TODAY_ISO);
  const pastDates = filteredDates.filter(date => date < TODAY_ISO);
  const latestDate = filteredDates[filteredDates.length - 1] || null;

  const selectedApplicationRange = preferredApplicationRange(dateEvidence, {
    item_text: String(text || ''),
    html: htmlText,
  });
  const applicationRangeCount = distinctApplicationRangeCount(dateEvidence);
  const applicationOpensAt = selectedApplicationRange?.start || firstRoleDate(dateEvidence, 'applicationOpensAt');
  const selectedApplicationSourceText = selectedApplicationRange?.source === 'html'
    ? htmlText
    : String(text || '');
  const extensionCandidates = selectedApplicationRange ? dateEvidence
    .filter(item => item.role === 'applicationDeadline' && !item.rangeId &&
      item.source === selectedApplicationRange.source && Number.isFinite(item.index) &&
      item.index > selectedApplicationRange.endIndex &&
      /\b(?:prorrog|retific|novo prazo|prazo alterad|prazo estendid)\w*/.test(normalizeText(item.excerpt)))
    .sort((a, b) => a.index - b.index) : [];
  const belongsToSelectedApplicationEpisode = (item) => {
    const between = normalizeText(selectedApplicationSourceText.slice(selectedApplicationRange.endIndex, item.index));
    const distinctIdentityMarker = /\b(?:turma|edicao|chamada|etapa|grupo|modalidade)\s+(?:[a-z]|\d{1,4}|[ivxlcdm]{1,8})\b/.test(between);
    const interveningRange = dateEvidence.some(evidence =>
      evidence.source === selectedApplicationRange.source && evidence.rangeId &&
      evidence.rangeId !== selectedApplicationRange.rangeId && Number.isFinite(evidence.index) &&
      evidence.index > selectedApplicationRange.endIndex && evidence.index < item.index &&
      (evidence.role === 'applicationOpensAt' || evidence.role === 'applicationDeadline'));
    return !distinctIdentityMarker && !interveningRange;
  };
  const extensionDeadlineEvidence = extensionCandidates
    .filter(belongsToSelectedApplicationEpisode)
    .at(-1);
  const ambiguousExtensionEvidence = extensionCandidates
    .filter(item => !belongsToSelectedApplicationEpisode(item))
    .at(-1);
  const applicationDeadline = extensionDeadlineEvidence?.date || selectedApplicationRange?.end || lastRoleDate(dateEvidence, 'applicationDeadline');
  const resultPublishedAt = lastRoleDate(dateEvidence, 'resultPublishedAt');
  const preferredEventRange = preferredUpcomingEventRange(dateEvidence);
  const eventStartsAt = structuredEventStartsAt || preferredEventRange?.start || preferredUpcomingRoleDate(dateEvidence, 'eventStartsAt');
  const eventEndsAt = structuredEventEndsAt || preferredEventRange?.end || preferredUpcomingRoleDate(dateEvidence, 'eventEndsAt', 'last');

  const normalizedFullText = normalizeText(fullText);
  const statusDate = updatedAt || publishedAt;
  const statusDateOnly = normalizeStructuredDate(statusDate);
  const hasFreshStatus = Boolean(statusDateOnly && statusDateOnly >= daysAgo(30));
  const statusSourceText = selectedApplicationRange?.source === 'html' ? htmlText : String(text || '');
  const episodeStart = selectedApplicationRange && Number.isFinite(selectedApplicationRange.startIndex)
    ? sentenceStart(statusSourceText, selectedApplicationRange.startIndex)
    : 0;
  const statusAnchorIndex = extensionDeadlineEvidence?.index ?? selectedApplicationRange?.endIndex ?? statusSourceText.length;
  const nextApplicationRangeIndex = selectedApplicationRange
    ? dateEvidence
      .filter(item => item.source === selectedApplicationRange.source && item.rangeId &&
        item.rangeId !== selectedApplicationRange.rangeId && Number.isFinite(item.index) &&
        item.index > selectedApplicationRange.endIndex &&
        (item.role === 'applicationOpensAt' || item.role === 'applicationDeadline'))
      .map(item => item.index)
      .sort((a, b) => a - b)[0]
    : null;
  const sentenceEpisodeEnd = selectedApplicationRange
    ? sentenceEnd(statusSourceText, statusAnchorIndex)
    : statusSourceText.length;
  const episodeEnd = Number.isFinite(nextApplicationRangeIndex)
    ? Math.min(sentenceEpisodeEnd, nextApplicationRangeIndex)
    : sentenceEpisodeEnd;
  const normalizedStatusText = normalizeText(statusSourceText || normalizedFullText);
  const normalizedEpisodeStart = normalizeText(statusSourceText.slice(0, episodeStart)).length;
  const normalizedEpisodeEnd = normalizeText(statusSourceText.slice(0, episodeEnd)).length;
  const applicationSignal = lastApplicationStatusSignal(
    normalizedStatusText,
    normalizedEpisodeStart,
    normalizedEpisodeEnd,
  );
  const applicationWindowStarted = !applicationOpensAt || applicationOpensAt <= TODAY_ISO;
  let applicationStatus = 'unknown';
  if (applicationSignal?.status === 'closed') {
    applicationStatus = 'closed';
  } else if (applicationSignal?.status === 'not_open') {
    applicationStatus = applicationOpensAt && applicationOpensAt > TODAY_ISO ? 'scheduled' : 'unknown';
  } else if (applicationSignal?.status === 'future_open') {
    applicationStatus = applicationOpensAt
      ? (applicationWindowStarted ? 'open' : 'scheduled')
      : 'unknown';
  } else if (applicationDeadline) {
    if (applicationDeadline >= TODAY_ISO) {
      applicationStatus = applicationWindowStarted ? 'open' : 'scheduled';
    } else {
      applicationStatus = 'closed';
    }
  } else if (applicationSignal?.status === 'open' && hasFreshStatus &&
      applicationWindowStarted && !/^prorrog/.test(applicationSignal.token)) {
    applicationStatus = 'open';
  } else if (applicationSignal?.status === 'open' && applicationOpensAt > TODAY_ISO) {
    applicationStatus = 'scheduled';
  }

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

  const nowClock = clockInTimeZone(TODAY);
  if (!isExpired) {
    const normalizedClockText = String(fullText || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const todayMatch = /\b(?:data|quando|acontece)\s*[:\s]?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\s*,?\s*(?:(?:as|aos)\s+(\d{1,2})[h:](\d{2})?)?/i.exec(normalizedClockText);
    const timeMatch = /\b(?:horario|hora|h)[\s:]+(\d{1,2})[h:](\d{2})?\b/i.exec(normalizedClockText);
    if (todayMatch) {
      let itemYear = todayMatch[3] ? Number(todayMatch[3]) : CURRENT_YEAR;
      if (itemYear < 100) itemYear += 2000;
      const itemDate = validIsoDate(itemYear, Number(todayMatch[2]), Number(todayMatch[1]));
      const hour = todayMatch[4] ? Number(todayMatch[4]) : (timeMatch ? Number(timeMatch[1]) : null);
      const minute = todayMatch[5] ? Number(todayMatch[5]) : (timeMatch?.[2] ? Number(timeMatch[2]) : 0);
      const itemMinutes = hour === null ? null : (hour * 60) + minute;
      const nowMinutes = (nowClock.hour * 60) + nowClock.minute;
      if (itemDate && (itemDate < TODAY_ISO ||
          (itemDate === TODAY_ISO && itemMinutes !== null && itemMinutes < nowMinutes))) {
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
    eventRangeId: preferredEventRange?.rangeId || null,
    applicationRangeId: selectedApplicationRange?.rangeId || null,
    applicationRangeCount,
    applicationOpensAt,
    applicationDeadline,
    resultPublishedAt,
    applicationStatus,
    ambiguousApplicationExtension: ambiguousExtensionEvidence
      ? { date: ambiguousExtensionEvidence.date, excerpt: ambiguousExtensionEvidence.excerpt }
      : null,
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
      has(nt, 'professor substituto') || has(nt, 'cargos de nivel superior') ||
      (/\b(?:processo seletivo|selecao)\b/.test(nt) &&
       /\b(?:cargo|emprego|contratacao|professor|docente|tecnico|coordenador|diretor|tutor|preceptor)\b/.test(nt))) {
    return 'empregos'; // concursos vão como empregos (Kino não tem 'concursos')
  }
  if (has(nt, 'estagio')) return 'estagios';
  if (has(nt, 'monitoria')) return 'monitoria';
  if (has(nt, 'voluntariado')) return 'voluntariado';
  if (has(nt, 'bolsa') || has(nt, 'auxilio') || has(nt, 'permanencia') ||
      has(nt, 'apoio financeiro') || has(nt, 'probec')) return 'bolsas';
  if (/\b(?:alun[oa]s? especiais?|disciplinas? isoladas?)\b/.test(nt) &&
      /\b(?:ppg[a-z0-9]*|pos graduacao|mestrado|doutorado|programa de pos)\b/.test(nt)) return 'pesquisa';
  if (/\bppg[a-z0-9]*\b/.test(nt) ||
      has(nt, 'programa de pos') || has(nt, 'exame de suficiencia') ||
      has(nt, 'prova de suficiencia') || has(nt, 'suficiencia em linguas')) return 'pesquisa';
  if (/\b(?:submissao|submissoes|chamada)\b/.test(nt) &&
      /\b(?:dossie|artigo|artigos|revista|periodico|resumo|resumos|manuscrito|manuscritos)\b/.test(nt)) return 'pesquisa';
  if (has(nt, 'pesquisa') || has(nt, 'pibic') || has(nt, 'pivic') || has(nt, 'fapeg') ||
      has(nt, 'mobilidade internacional') || has(nt, 'mestrado') || has(nt, 'doutorado') ||
      has(nt, 'pos-graduacao') || has(nt, 'residencia') || has(nt, 'premiacao') ||
      has(nt, 'idioma sem fronteiras') || has(nt, 'certificacao em idiomas')) return 'pesquisa';
  if (has(nt, 'emprego') || has(nt, 'contratacao') ||
      /\b(?:vaga|vagas|oportunidade|oportunidades) (?:de|para) trabalho\b|\btrabalho remunerado\b/.test(nt)) return 'empregos';
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

function detectConflictingEventIdentity(text) {
  const normalized = normalizeText(text || '');
  const editions = new Set();
  const pattern = /\b([ivxlcdm]{1,8}|\d{1,3}[ao]?)\s+semana de historia\b/g;
  let match;
  while ((match = pattern.exec(normalized)) !== null) editions.add(match[1]);
  return editions.size > 1;
}

function detectMixedEventEpisodes(text, temporal) {
  const normalized = normalizeText(text || '');
  const markerPattern = /\b(?:(?:proxim[oa]|nov[oa]|segund[oa])\s+(?:aula publica|edicao|evento|encontro|atividade|sessao|palestra|oficina|seminario|curso|workshop|conferencia|jornada))\b/g;
  let marker;
  while ((marker = markerPattern.exec(normalized)) !== null) {
    const before = normalized.slice(0, marker.index);
    const after = normalized.slice(marker.index);
    const hasPastNarrative = PAST_EVENT_VERB_PATTERN.test(before) &&
      Array.isArray(temporal?.pastDates) && temporal.pastDates.length > 0;
    const hasFutureAnnouncement = FUTURE_EVENT_VERB_PATTERN.test(after) &&
      (temporal?.eventStartsAt >= TODAY_ISO || temporal?.eventEndsAt >= TODAY_ISO);
    if (hasPastNarrative && hasFutureAnnouncement) return true;
    if (marker[0].length === 0) markerPattern.lastIndex += 1;
  }
  return false;
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
  // A concrete opportunity type outranks a generic PPG/program affiliation.
  if ((has(nt, 'processo seletivo') || has(nt, 'selecao para')) &&
      /\b(?:coordenador|professor|docente|diretor|tutor|preceptor|tecnico|cargo|contratacao)\b/.test(nt)) {
    return 'empregos';
  }
  if (has(nt, 'concurso publico') || has(nt, 'concurso para') || has(nt, 'selecao simplificada')) {
    return 'empregos';
  }
  if (has(nt, 'estagio')) return 'estagios';
  if (has(nt, 'monitoria')) return 'monitoria';
  if (has(nt, 'projeto rondon') || has(nt, 'projeto de extensao') ||
      has(nt, 'acao voluntaria') || has(nt, 'voluntariado') ||
      (has(nt, 'projetos de trabalho') && has(nt, 'extensao'))) {
    return 'voluntariado';
  }
  if (/\b(?:bolsa|bolsas|auxilio|auxilios|apoio tecnico|apoio financeiro|permanencia|probec)\b/.test(nt)) {
    return 'bolsas';
  }
  // Override pesquisa
  if ((/\b(?:alun[oa]s? especiais?|disciplinas? isoladas?)\b/.test(nt) &&
       /\b(?:ppg[a-z0-9]*|pos graduacao|mestrado|doutorado|programa de pos)\b/.test(nt)) ||
      /\bppg[a-z0-9]*\b/.test(nt) ||
      (/\b(?:submissao|submissoes|chamada)\b/.test(nt) &&
       /\b(?:dossie|artigo|artigos|revista|periodico|resumo|resumos|manuscrito|manuscritos)\b/.test(nt)) ||
      has(nt, 'exame de suficiencia') || has(nt, 'prova de suficiencia') ||
      has(nt, 'suficiencia em linguas') || has(nt, 'proficiencia em idiomas') ||
      has(nt, 'especializacao') || has(nt, 'mestrado') || has(nt, 'doutorado') ||
      has(nt, 'pos-graduacao') || has(nt, 'pos graduacao') ||
      has(nt, 'mobilidade internacional') || has(nt, 'mobilidade academica') ||
      has(nt, 'mobilidade na italia') || has(nt, 'confap') || has(nt, 'fapeg') ||
      has(nt, 'cnpq') || has(nt, 'capes') || has(nt, 'intercambio academico')) {
    return 'pesquisa';
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
  // Lifecycle routing must describe the item itself. Scanning the hydrated
  // body used to match schedule rows, menus and related-news cards containing
  // "resultado"/"retificacao", diverting brand-new opportunities into the
  // duplicate updater. Titles are the stable, item-level lifecycle evidence.
  void text;
  const nt = normalizeText(title || '');
  const result = { isUpdate: false, type: null, signals: [] };

  // Prorrogação de prazo (mais comum)
  if (/\b(prorrogad[oa]s?|prorrogacao|prorroga(?:m|ram|ria|riam|ou)?|adiad[oa]s?|adiamento|adia(?:m|ram|ou)?|nova data|novo prazo|prazo final (?:alterado|modificado|atualizado|prorrogado)|estende(?:m|ram|u)? (?:o )?prazo|prazo estendid[oa])\b/.test(nt)) {
    result.isUpdate = true;
    result.type = 'prorrogacao_prazo';
    result.signals.push('keyword:prorrogacao');
  }

  // Retificação / errata
  if (/\b(retificacao|retificad[oa]s?|retifica(?:m|ram|ou)?|errata|corrigid[oa]s?|republicacao|republicad[oa]s?)\b/.test(nt)) {
    result.isUpdate = true;
    result.type = result.type || 'retificacao';
    result.signals.push('keyword:retificacao');
  }

  // Resultado / lista de aprovados (de um processo seletivo anterior)
  const lifecycleContext = '(?:edital|processo seletivo|selecao|chamada|concurso|bolsa|monitoria|inscric(?:ao|oes)|recursos?|isencao|matriculas?|candidatos?)';
  const resultHasStrongQualifier = /\bresultado(?:s)? (?:final|preliminar|definitivo|parcial)\b/.test(nt);
  const resultHasLifecycleContext = new RegExp(
    `(?:\\bresultado(?:s)?\\b.{0,80}\\b${lifecycleContext}\\b|\\b${lifecycleContext}\\b.{0,80}\\bresultado(?:s)?\\b)`,
  ).test(nt);
  const hasTerminalLifecycleList = /\blista (?:de aprovados|de selecionados|de classificados)\b|\bhomologacao (?:final |preliminar )?(?:das inscricoes|do resultado|dos resultados|da selecao)|\bconvocados?\b.{0,60}\b(?:processo seletivo|selecao|edital|chamada|matricula)\b/.test(nt);
  if (resultHasStrongQualifier || resultHasLifecycleContext || hasTerminalLifecycleList) {
    result.isUpdate = true;
    result.type = result.type || 'resultado';
    result.signals.push('keyword:resultado');
  }

  // Cancelamento
  if (/\b(cancelad[oa]s?|cancela(?:m|ram|ou)?|suspens[oa]|suspensao|suspende(?:m|ram|u)?)\b/.test(nt)) {
    result.isUpdate = true;
    result.type = result.type || 'cancelamento';
    result.signals.push('keyword:cancelamento');
  }

  // 2ª chamada / reabertura
  if (/\b(2(?:a|ª)?\s*chamada|segunda chamada|reabertura|reabert[oa]s?|reabre(?:m|ram|riu)?)\b/.test(nt)) {
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
  const combinedText = `${title || ''}.\n${text || ''}`;
  const nt = normalizeText(combinedText);
  const earlyDiscard = (gateReason, score, reasons = [gateReason]) => {
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
    return {
      decision: 'discard',
      score,
      module: '',
      category: '',
      reasons,
      temporal,
      dates: temporal,
      expired: temporal.isExpired,
      hasDeadline: temporal.hasDeadline,
      hasUpcoming: temporal.isUpcoming,
      actionEvidence: [],
      gateReason,
      shouldHydrate: false,
    };
  };

  // Institutional/retrospective copy is normally excluded. A dated, active
  // application signal is the narrow exception: keep it eligible for detail
  // hydration, then let the action/deadline gates decide with full evidence.
  let hardExcludeWasOverridden = false;
  for (const pattern of HARD_EXCLUDE_PATTERNS) {
    if (pattern.test(combinedText) || pattern.test(title || '')) {
      const probe = earlyDiscard('hard_exclude', 0.05);
      const hasBenefitContext = /\b(?:auxilio|beneficio|subsidio|permanencia|moradia|alimentacao)\b/.test(nt);
      const hasBenefitRequestLanguage = hasBenefitContext
        && /\b(?:solicitacao|solicitacoes|requerimento|requerimentos|pedido|pedidos|cadastro|cadastros)\b/.test(nt);
      const hasActiveApplicationLanguage = /\b(?:inscricao|inscricoes|candidatura|submissao|matricula)\b/.test(nt)
        || hasBenefitRequestLanguage;
      const hasCurrentWindow = probe.temporal?.applicationStatus === 'open'
        && Boolean(probe.temporal?.applicationDeadline);
      if (!hasActiveApplicationLanguage || !hasCurrentWindow) return probe;
      hardExcludeWasOverridden = true;
      break;
    }
  }

  // Check exclude first
  const exc = EXCLUDE_TERMS.filter(t => has(nt, t));
  // v4.2.1: Only discard if 3+ exclude terms AND no strong signals (edital, bolsa, inscricao)
  const hasStrongSignal = /\b(edital|bolsa|inscricao|inscrições|processo seletivo|chamada publica|mobilidade|concurso publico)\b/i.test(nt);
  if (exc.length >= 3 && !hasStrongSignal) {
    return earlyDiscard('excluded_terms', 0.1, exc.map(t => `exclude:${t}`));
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
  const eventNativeCats = [
    'palestra', 'seminario', 'oficina', 'curso', 'workshop', 'evento', 'eventos',
    'capacitacao', 'exposicao', 'programacao completa', 'agenda cultural',
  ];
  const hasNativeEventCategory = eventNativeCats.some(category =>
    nativeCats.some(nativeCategory => nativeCategory.includes(category))
  );
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
  const hasEditalInTitle = /^(?:edit(?:al|ais)|chamadas?|sele[çc][aã]o|processos?\s+seletivos?)\b/i.test((jsonItem?.title || title || '').trim());
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
  const actionEvidence = collectActionEvidence(combinedText, html, linkUrl, jsonItem?.relevantLinks, temporal);
  const hasActionableCta = actionEvidence.length > 0;
  const hasUpcomingEvent = temporal.eventStatus === 'upcoming' || temporal.eventStatus === 'ongoing';
  const isFutureEventEvidence = evidence =>
    (evidence.role === 'eventStartsAt' || evidence.role === 'eventEndsAt') && evidence.date >= TODAY_ISO;
  const hasRetrospectiveInferredDate = temporal.dateEvidence.some(evidence =>
    (evidence.role === 'eventStartsAt' || evidence.role === 'eventEndsAt') &&
    evidence.source !== 'structured_event' &&
    evidence.yearInferred === true &&
    evidence.temporalDirection === 'past'
  );
  const hasTrustedFutureSchedule = temporal.dateEvidence.some(evidence =>
    isFutureEventEvidence(evidence) &&
    (evidence.source === 'structured_event' ||
      evidence.yearInferred === false ||
      evidence.temporalDirection === 'future')
  );
  const hasTrustedUpcomingEvent = hasUpcomingEvent && (isEventJson || hasTrustedFutureSchedule);
  const hasConcreteEventEvidence =
    /\b(?:participe|compareca|aberto\s+ao\s+publico|aberta\s+ao\s+publico|publico-alvo|entrada\s+(?:gratuita|franca))\b/.test(nt) ||
    /\b(?:local|horario|programacao|transmissao)\s*:/.test(nt);
  const hasActiveParticipationWindow = temporal.applicationStatus === 'open' &&
    /\b(?:inscricao|inscricoes|submissao|submissoes|candidatura|candidaturas)\b/.test(nt);
  const hasEventParticipation = isEventJson || actionEvidence.length > 0 || hasConcreteEventEvidence ||
    hasActiveParticipationWindow || (hasTrustedFutureSchedule && hasNativeEventCategory);
  const hasExplicitUndatedEventRegistration = isEventJson
    && hasTrustedUpcomingEvent
    && hasActionableCta
    && temporal.applicationStatus === 'unknown'
    && /\b(?:inscricao gratuita|inscricoes? abertas?|formulario (?:de|para) inscricao|inscreva se)\b/.test(nt)
    && !/\binscricoes? encerrad[ao]s?\b/.test(nt);
  if (hasExplicitUndatedEventRegistration) temporal.applicationStatus = 'open';
  temporal.canApply = temporal.applicationStatus === 'open' && hasActionableCta;
  const mixedEventEpisodes = sourceKind === 'news' && detectMixedEventEpisodes(combinedText, temporal);
  const conflictingEventIdentity = sourceKind === 'news' && detectConflictingEventIdentity(combinedText);

  // Some official notices keep the application instructions in the article
  // or attached edital instead of exposing a separate form URL. The official
  // UFG page is a safe informational path in that case. Keep `canApply=false`
  // so downstream copy uses "Saiba mais", never a misleading direct CTA.
  const normalizedTitle = normalizeText(title || '');
  const hasOpportunityHeadline = OPPORTUNITY_HEADLINE_PATTERN.test(normalizedTitle);
  const hasStrongOpportunityHeadline = STRONG_OPPORTUNITY_HEADLINE_PATTERN.test(normalizedTitle);
  const hasOpenSubmissionHeadline = OPEN_SUBMISSION_HEADLINE_PATTERN.test(normalizedTitle);
  // Fix R (2026-07-25): expandido para cobrir titulos de matricula academica
  // que NAO sao apenas "orientacoes" ou "alunos regulares". Caso real: "Matriculas
  // do Centro de Linguas UFG comecam em 27 de julho" e "Matriculas 2026/2: 27/07
  // a 05/08 via SIGAA" - ambos foram classificados como eventos/workshops porque
  // o pattern antigo exigia keywords compostos ("orientacoes para matriculas" etc).
  // Agora qualquer "matriculas?" no titulo (start-of-string ou middle) +
  // (deadline futuro OU ano 20XX) vira oportunidade administrativa.
  const isAdministrativeEnrollmentNotice =
    /\b(?:orientacoes? (?:para )?matriculas?|matriculas? de alunos? regulares|estudantes? veteranos?|oferta de disciplinas?|calendario academico|periodo (?:letivo|de )?matriculas?|rematricula)\b/.test(normalizedTitle)
    || /^matriculas?\b/.test(normalizedTitle)
    || /\bmatriculas?\s+(?:20\d{2}|sigaa|siwa|via|sigaa-ufg)/.test(normalizedTitle);
  const hasApplicationLanguage = /\b(?:inscricao|inscricoes|candidatura|candidaturas|submissao|submissoes|matricula|matriculas|solicitacao|solicitacoes|prazo)\b/.test(nt);
  const explicitlyLacksApplicationInstructions = /\b(?:apenas|somente)\b[^.!?;]{0,60}\b(?:contato geral|informacoes gerais)\b|\bsem\b[^.!?;]{0,30}\b(?:formulario|link|orientacoes de inscricao)\b/.test(nt);
  const visiblePageLinks = extractRelevantLinks(html, linkUrl);
  const formProviderUrlPattern = /https?:\/\/(?:forms\.gle|(?:docs\.)?google\.com\/forms|forms\.(?:office|microsoft)\.com|[^\s/]+\.typeform\.com)\b/i;
  const hasRejectedStructuredApplicationLink = [jsonItem?.relevantLinks, visiblePageLinks]
    .filter(Boolean)
    .some(linkGroups => Object.entries(linkGroups).some(([group, links]) =>
      (Array.isArray(links) ? links : []).some(link => {
        const label = String(link?.label || '');
        const url = String(link?.url || '');
        const normalizedLabel = normalizeText(label);
        const applicationCandidate = group === 'formularios' ||
          /\b(?:formulario|inscricao|candidatura|submissao|matricula)\b/.test(normalizedLabel) ||
          formProviderUrlPattern.test(url);
        const appealOnly = /\b(?:interposicao|pedido) de recursos?\b|\bformulario de recursos?\b/.test(normalizedLabel);
        return applicationCandidate && !appealOnly &&
          (link?.actionable === false || !isActionableUrl(url, label, label));
      })));
  const hasOfficialApplicationDetails = !hasActionableCta &&
    sourceKind !== 'event' &&
    isTrustedOfficialDetailsUrl(linkUrl) &&
    ['open', 'scheduled'].includes(temporal.applicationStatus) &&
    Boolean(temporal.applicationDeadline && temporal.applicationDeadline >= TODAY_ISO) &&
    !temporal.isOld &&
    !temporal.isExpired &&
    hasOpportunityHeadline &&
    hasApplicationLanguage &&
    !explicitlyLacksApplicationInstructions &&
    !hasRejectedStructuredApplicationLink;
  const hasScheduledApplicationNotice = sourceKind !== 'event' &&
    isTrustedOfficialDetailsUrl(linkUrl) &&
    temporal.applicationStatus === 'scheduled' &&
    Boolean(temporal.applicationOpensAt && temporal.applicationOpensAt > TODAY_ISO) &&
    Boolean(temporal.applicationDeadline && temporal.applicationDeadline >= temporal.applicationOpensAt) &&
    !temporal.isOld &&
    !temporal.isExpired &&
    hasOpportunityHeadline &&
    hasApplicationLanguage &&
    !explicitlyLacksApplicationInstructions;
  const hasActiveOpportunityPath = temporal.canApply || hasOfficialApplicationDetails;
  const hasPublishableOpportunityPath = hasActiveOpportunityPath || hasScheduledApplicationNotice;
  temporal.applicationDetailsOnly = hasOfficialApplicationDetails || hasScheduledApplicationNotice;
  temporal.applicationScheduled = hasScheduledApplicationNotice;
  const hasEventAudienceRegistration = hasTrustedUpcomingEvent && (
    /\b(?:inscricao|inscricoes|candidatura|candidaturas)\b[^.!?;]{0,90}\b(?:como\s+)?(?:ouvinte|participante|participacao)\b/.test(nt) ||
    /\b(?:ouvinte|participante|participacao)\b[^.!?;]{0,90}\b(?:inscricao|inscricoes|candidatura|candidaturas)\b/.test(nt)
  );

  const updatedDate = normalizeStructuredDate(jsonItem?.updated_at);
  const hasCurrentUpdateSignal = Boolean(
    updatedDate && updatedDate >= daysAgo(30) &&
    temporal.applicationStatus === 'open' &&
    /\b(?:retifica[cç][aã]o|retificado|prorroga[cç][aã]o|prorrogad[oa]s?|novo\s+prazo|reabertura)\b/i.test(combinedText)
  );

  // Semantic module selection: a closed application can still describe an
  // upcoming event, but it is never an active opportunity.
  if (hasTrustedUpcomingEvent && (isEventJson || hasEventParticipation) &&
      (!hasPublishableOpportunityPath || hasEventAudienceRegistration)) {
    module = 'eventos';
  } else if (hasPublishableOpportunityPath &&
      (sourceKind === 'opportunity' || oppScore > evtScore || hasStrongOpportunityHeadline || isAdministrativeEnrollmentNotice)) {
    module = 'oportunidades';
  }
  baseCategory = module === 'oportunidades' ? detectOpportunityCategory(nt) : detectEventCategory(nt);
  category = categoryOverride(title, text, baseCategory, module);

  const updatedRecently = Boolean(updatedDate && updatedDate >= daysAgo(30));
  const hasActiveSubmissionWindow = hasOpenSubmissionHeadline &&
    temporal.applicationStatus === 'open' &&
    Boolean(temporal.applicationDeadline && temporal.applicationDeadline >= TODAY_ISO);
  const hasStrongHydrationSignal = sourceKind === 'opportunity' || hasEditalInTitle ||
    hasProcessoSeletivo || nativeCatBoost > 0 || hasLinkInscrText ||
    hasActiveSubmissionWindow || inc.length >= 2;
  const shouldHydrate = !isEventJson && hasStrongHydrationSignal && (!temporal.isOld || updatedRecently);

  // Yearless prose must carry an explicit forward direction before a news item
  // can use it as a future schedule. Structured and explicit-year dates remain
  // authoritative.
  const isPastCoverageWithInferredYear = sourceKind === 'news' &&
    !isEventJson &&
    !temporal.isOld &&
    hasRetrospectiveInferredDate &&
    !hasTrustedFutureSchedule;

  let forcedDiscardReason = null;
  const oldItemAllowed = (isEventJson && hasUpcomingEvent) || hasCurrentUpdateSignal;
  if (temporal.isOld && !oldItemAllowed) {
    forcedDiscardReason = 'old_without_current_window';
  } else if (isPastCoverageWithInferredYear) {
    forcedDiscardReason = 'past_event_coverage_inferred_year';
  } else if (sourceKind === 'news' && !hasPublishableOpportunityPath && !(hasTrustedUpcomingEvent && hasEventParticipation)) {
    forcedDiscardReason = 'news_without_action';
  } else if (module === 'oportunidades' && !hasPublishableOpportunityPath) {
    forcedDiscardReason = 'opportunity_without_active_window';
  } else if (module === 'eventos' && !hasTrustedUpcomingEvent) {
    forcedDiscardReason = 'event_without_future_schedule';
  }

  if (forcedDiscardReason) {
    score = Math.min(score, 0.49);
  } else if ((module === 'eventos' && hasTrustedUpcomingEvent && (isEventJson || hasEventParticipation)) ||
             (module === 'oportunidades' && hasPublishableOpportunityPath)) {
    score = Math.max(score, 0.72);
  }

  // Fix 2026-06-24: Itens antigos sem datas futuras devem ser descartados.
  // Ex: FACE (março), FEF Solidária (maio) — evento/inscrição já passou.
  const isStale = temporal.isOld && temporal.futureDates.length === 0 && !temporal.hasDeadline;
  
  // Fix 2026-06-24 #2: Eventos com webyDate > 30 dias provavelmente já aconteceram.
  // Se não há data futura extraída, o evento é passado → descartar.
  const webyDaysAgo = temporal.webyDate ? Math.floor((TODAY - new Date(temporal.webyDate)) / 86400000) : 0;
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
    !hasPublishableOpportunityPath;
  if (opportunityWithoutDeadline) {
    const hasDocumentAction = hasPdf || hasPdfInHtml || hasLinkInscrText;
    score = Math.min(score, hasDocumentAction ? (REVIEW_THRESHOLD + 0.19) : 0.49);
  }
  if (isAdministrativeEnrollmentNotice) {
    score = Math.min(score, PUBLISH_THRESHOLD - 0.01);
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

  const ambiguousCurrentExtension = Boolean(
    temporal.ambiguousApplicationExtension?.date &&
    temporal.ambiguousApplicationExtension.date >= TODAY_ISO,
  );
  const semanticReviewReason = mixedEventEpisodes
    ? 'mixed_event_episodes'
    : (conflictingEventIdentity
      ? 'conflicting_event_identity'
      : (ambiguousCurrentExtension ? 'ambiguous_application_extension' : null));
  if (semanticReviewReason && ((decision !== 'discard' && !temporal.isExpired) || ambiguousCurrentExtension)) {
    decision = 'review';
    score = Math.max(REVIEW_THRESHOLD, Math.min(score, PUBLISH_THRESHOLD - 0.01));
  }

  const gateReason = semanticReviewReason || forcedDiscardReason ||
    (temporal.isExpired ? 'temporal_expired' :
      (isStale ? 'stale_without_current_date' :
        (isEventExpired ? 'event_expired' :
          (decision === 'discard' ? 'below_relevance_threshold' : null))));

  const reasons = inc.slice();
  if (hardExcludeWasOverridden) reasons.push('hard_exclude_overridden_active_window');
  if (hasOfficialApplicationDetails) reasons.push('official_application_details');
  if (hasScheduledApplicationNotice) reasons.push('scheduled_application_window');
  if (newsEventWithoutFutureDate) {
    reasons.push(hasLinkInscrText || temporal.hasDeadline ? 'news_event_without_future_date' : 'news_event_without_future_action');
  }
  if (opportunityWithoutDeadline) {
    reasons.push('opportunity_without_deadline');
  }
  if (isAdministrativeEnrollmentNotice) {
    reasons.push('administrative_enrollment_review');
  }
  if (forcedDiscardReason) {
    reasons.push(forcedDiscardReason);
  }
  if (semanticReviewReason) reasons.push(semanticReviewReason);
  if (module === 'eventos' && hasTrustedUpcomingEvent && temporal.applicationStatus === 'closed') {
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
    mediaEligible: !mixedEventEpisodes && !conflictingEventIdentity,
  };
}

// ============================================================
// EVENT SOURCE (v4.3 — P1-3)
// ============================================================

const EVENTS_JSON_URL = 'https://ufg.br/events.json';
const EVENTS_PAGE_SIZE = (() => {
  const value = Number(process.env.CADU_EVENTS_PAGE_SIZE);
  return Number.isInteger(value) && value >= 25 && value <= 100 ? value : 100;
})();
const EVENTS_MAX_PAGES = (() => {
  const value = Number(process.env.CADU_EVENTS_MAX_PAGES);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : 10;
})();
const EVENTS_ONGOING_LOOKBACK_DAYS = (() => {
  const value = Number(process.env.CADU_EVENTS_ONGOING_LOOKBACK_DAYS);
  return Number.isInteger(value) && value >= 90 && value <= 730 ? value : 400;
})();
const EVENTS_LOOKAHEAD_DAYS = 90; // Eventos até 90 dias no futuro

/**
 * Soft unit-calendar misses (transport, budget, first-page availability).
 * These must NOT flip optional curator_coverage to partial — a single offline
 * or TLS-broken unit calendar is source health, not incomplete collection.
 *
 * Integrity failures mid-pagination (identity overlap, sort order, totals)
 * remain hard and still increment localEventPaginationFailures.
 */
function isLocalEventPaginationIntegrityFailure(reason) {
  const r = String(reason || '');
  return (
    /^events_identity_overlap:\d+$/.test(r)
    || /^events_total_changed:/.test(r)
    || /^events_sort_order_invalid:\d+$/.test(r)
    || /^events_page_overflow:\d+$/.test(r)
    || /^events_page_incomplete:[2-9]\d*$/.test(r)
    || /^events_begin_invalid:\d+$/.test(r)
    || /^events_total_invalid:\d+$/.test(r)
    || /^events_temporal_frontier_not_reached:/.test(r)
  );
}

function isLocalEventCalendarUnavailable(reason) {
  const r = String(reason || '');
  if (isLocalEventPaginationIntegrityFailure(r)) return false;
  return (
    /^events_page_unavailable:\d+$/.test(r)
    || /^events_budget_exceeded:\d+$/.test(r)
    || r === 'tls_chain_error'
    || r === 'events_endpoint_not_https'
    || r === 'events_page_size_invalid'
    || r === 'events_max_pages_invalid'
    || r === 'events_lookback_invalid'
    // First-page incomplete is transport/empty calendar, not mid-scan corruption.
    || r === 'events_page_incomplete:1'
  );
}

function fetchEventPages(endpoint, fetcher = fetchJson, options = {}) {
  const pageSize = Number.isInteger(options.pageSize) ? options.pageSize : EVENTS_PAGE_SIZE;
  const maxPages = Number.isInteger(options.maxPages) ? options.maxPages : EVENTS_MAX_PAGES;
  const ongoingLookbackDays = Number.isInteger(options.ongoingLookbackDays)
    ? options.ongoingLookbackDays
    : EVENTS_ONGOING_LOOKBACK_DAYS;
  const referenceDate = options.referenceDate instanceof Date
    && !Number.isNaN(options.referenceDate.getTime())
    ? options.referenceDate
    : TODAY;
  const canFetchPage = typeof options.canFetchPage === 'function'
    ? options.canFetchPage
    : () => true;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new RangeError('events_page_size_invalid');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) {
    throw new RangeError('events_max_pages_invalid');
  }
  if (!Number.isInteger(ongoingLookbackDays)
      || ongoingLookbackDays < 90
      || ongoingLookbackDays > 730) {
    throw new RangeError('events_lookback_invalid');
  }
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== 'https:') throw new Error('events_endpoint_not_https');

  const allEvents = [];
  const seen = new Set();
  const frontierDate = new Date(referenceDate.getTime());
  frontierDate.setUTCDate(frontierDate.getUTCDate() - ongoingLookbackDays);
  let expectedTotal = null;
  let rawFetched = 0;
  let previousBeginMs = Number.POSITIVE_INFINITY;
  let pagesScanned = 0;
  let stopReason = '';

  for (let page = 1; page <= maxPages; page++) {
    if (!canFetchPage(page)) throw new Error(`events_budget_exceeded:${page}`);
    const url = new URL(parsedEndpoint.href);
    url.searchParams.set('per_page', String(pageSize));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'begin_at');
    url.searchParams.set('direction', 'desc');
    let json = fetcher(url.href);
    if (!Array.isArray(json?.events)) json = fetcher(url.href);
    if (!Array.isArray(json?.events)) {
      throw new Error(`events_page_unavailable:${page}`);
    }
    const total = Number(json?.meta?.total);
    if (!Number.isInteger(total) || total < 0) {
      throw new Error(`events_total_invalid:${page}`);
    }
    if (expectedTotal === null) expectedTotal = total;
    if (total !== expectedTotal) throw new Error(`events_total_changed:${expectedTotal}->${total}`);

    const pageEvents = json.events;
    pagesScanned = page;
    if (pageEvents.length > pageSize || rawFetched + pageEvents.length > expectedTotal) {
      throw new Error(`events_page_overflow:${page}`);
    }
    if (pageEvents.length === 0) {
      if (rawFetched !== expectedTotal) throw new Error(`events_page_incomplete:${page}`);
      stopReason = 'total_reconciled';
      break;
    }

    const pageBeginTimes = [];
    for (const event of pageEvents) {
      const beginMs = Date.parse(String(event?.begin_at || ''));
      if (!Number.isFinite(beginMs)) throw new Error(`events_begin_invalid:${page}`);
      if (beginMs > previousBeginMs) throw new Error(`events_sort_order_invalid:${page}`);
      previousBeginMs = beginMs;
      pageBeginTimes.push(beginMs);
      const eventId = event?.id;
      const eventUrl = String(event?.url || '').trim();
      const identity = eventId !== null && eventId !== undefined && String(eventId).trim()
        ? `id:${String(eventId).trim()}`
        : eventUrl
          ? `url:${eventUrl}`
          : `body:${JSON.stringify(event)}`;
      // `meta.total` describes event identities, not response rows. Accepting an
      // identity twice would let overlapping pages satisfy rawFetched === total
      // while returning fewer unique events. Fail before either the total or the
      // temporal-frontier stop condition can certify a partial collection.
      if (seen.has(identity)) throw new Error(`events_identity_overlap:${page}`);
      seen.add(identity);
      allEvents.push(event);
    }
    rawFetched += pageEvents.length;
    if (rawFetched === expectedTotal) {
      stopReason = 'total_reconciled';
      break;
    }
    if (pageEvents.length < pageSize) throw new Error(`events_page_incomplete:${page}`);

    // The API is explicitly sorted by begin_at DESC. Once the oldest item on
    // a full page predates the bounded ongoing-event horizon, every later page
    // starts even earlier and cannot contribute a current publication.
    if (pageBeginTimes.at(-1) <= frontierDate.getTime()) {
      stopReason = 'temporal_frontier';
      break;
    }
  }

  if (!stopReason && rawFetched < (expectedTotal ?? 0)) {
    throw new Error(`events_temporal_frontier_not_reached:${rawFetched}/${expectedTotal}`);
  }
  Object.defineProperty(allEvents, 'pagination', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: Object.freeze({
      total: expectedTotal ?? 0,
      rawFetched,
      pagesScanned,
      complete: rawFetched === (expectedTotal ?? 0),
      coverageComplete: ['total_reconciled', 'temporal_frontier'].includes(
        stopReason || 'total_reconciled',
      ),
      stopReason: stopReason || 'total_reconciled',
      sort: 'begin_at:desc',
      ongoingLookbackDays,
    }),
  });
  return allEvents;
}

function fetchEvents(fetcher = fetchJson, options = {}) {
  return fetchEventPages(EVENTS_JSON_URL, fetcher, options);
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
  const rawInformation = String(ev.information || '');
  const information = extractText(rawInformation);
  const beginAt = ev.begin_at || '';
  const endAt = ev.end_at || '';
  const place = ev.place || '';
  const image = ev.image || '';
  const categories = ev.category_list || [];
  const viewCount = ev.view_count || 0;
  const externalUrl = ev.url && /^https?:\/\//i.test(ev.url) ? ev.url : '';
  const link = buildWebyEventLink(ev, baseUrl);
  const relevantLinks = extractRelevantLinks(rawInformation, link);
  if (externalUrl) {
    const target = /google\.com\/forms|forms\.gle|typeform\.com|docs\.google\.com\/forms/i.test(externalUrl)
      ? relevantLinks.formularios
      : relevantLinks.paginasOficiais;
    if (!target.some(entry => entry.url === externalUrl)) {
      target.push({
        url: externalUrl,
        label: target === relevantLinks.formularios ? 'Formulário do evento' : 'Página externa do evento',
        type: 'event',
      });
    }
  }
  const hasRelevantLinks = Object.values(relevantLinks).some(entries => entries.length > 0);

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
    relevantLinks: hasRelevantLinks ? relevantLinks : null,
    viewCount,
    sourceKind: 'event',
    eventSource: sourceName,
  };
}

function filterUpcomingEvents(events) {
  const now = new Date(TODAY.getTime());
  const lookahead = new Date(TODAY.getTime());
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
  const key = getSupabaseKey();
  if (!key) throw new Error('CADU_SUPABASE_ANON_KEY ausente no ambiente');
  const posts = await collectPublishedRows(
    page => fetchPublishedPostsPage(key, page),
    { pageSize: 1000, maxPages: 100 },
  );
  const titles = posts.map(p => normalizeText(p.title || ''));
  // v4.2: extract BOTH link AND source_url for dedup
  const links = [];
  for (const p of posts) {
    const meta = p.metadata || {};
    if (meta.link) links.push(meta.link);
    if (meta.source_url && meta.source_url !== meta.link) links.push(meta.source_url);
  }
  console.log(`   📚 Cache: ${titles.length} posts publicados carregados (paginação completa)`);
  return { titles, links };
}

async function collectPublishedRows(fetchPage, { pageSize = 1000, maxPages = 100 } = {}) {
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage deve ser função');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new TypeError('pageSize deve estar entre 1 e 1000');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
    throw new TypeError('maxPages deve estar entre 1 e 1000');
  }
  const rows = [];
  let total = null;
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const response = await fetchPage({ offset, limit: pageSize, page });
    if (!response || response.ok !== true || !Array.isArray(response.rows)) {
      throw new Error(`cache publicado: página ${page + 1} falhou (${response?.error || 'invalid_response'})`);
    }
    if (!Number.isInteger(response.total) || response.total < 0) {
      throw new Error(`cache publicado: total ausente/ambíguo na página ${page + 1}`);
    }
    if (total === null) total = response.total;
    if (response.total !== total) {
      throw new Error(`cache publicado: total mudou durante paginação (${total}→${response.total})`);
    }
    const expectedLength = Math.min(pageSize, Math.max(0, total - offset));
    if (response.rows.length !== expectedLength) {
      throw new Error(`cache publicado: página incompleta ${page + 1} (${response.rows.length}/${expectedLength})`);
    }
    rows.push(...response.rows);
    if (rows.length === total) return rows;
    if (rows.length > total) throw new Error('cache publicado: paginação excedeu o total');
  }
  throw new Error(`cache publicado: limite de ${maxPages} páginas atingido`);
}

function fetchPublishedPostsPage(key, { offset, limit }) {
  const url = `${SUPABASE_URL}/rest/v1/posts?select=id,title,metadata&status=eq.published&order=id.asc&limit=${limit}&offset=${offset}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    Prefer: 'count=exact',
    Range: `${offset}-${offset + limit - 1}`,
    'Range-Unit': 'items',
  };
  return new Promise((resolve) => {
    fetchWithRetry(url, {
      headers,
      timeoutMs: 12000,
      onRetry: (attempt, kind, _err, backoffMs) => {
        console.log(`[cache-supabase] retry ${attempt} pagina ${(offset / 1000) + 1}: ${kind} (${backoffMs}ms)`);
      },
    }).then((result) => {
      if (!result.ok) {
        if (result.kind === 'response_too_large') {
          resolve({ ok: false, rows: [], total: null, error: 'response_too_large' });
          return;
        }
        if (/^http_/.test(result.kind || '')) {
          resolve({ ok: false, rows: [], total: null, error: result.kind });
          return;
        }
        const errKind = result.kind || 'network_error';
        resolve({ ok: false, rows: [], total: null, error: errKind });
        return;
      }
      try {
        const rows = JSON.parse(result.body);
        if (!Array.isArray(rows)) throw new Error('resposta não é array');
        const range = String(result.headers['content-range'] || '');
        const match = range.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
        resolve({ ok: true, rows, total: match ? Number(match[1]) : null, error: null });
      } catch (_) {
        resolve({ ok: false, rows: [], total: null, error: 'invalid_json_or_range' });
      }
    }).catch((err) => {
      resolve({ ok: false, rows: [], total: null, error: 'unhandled_exception' });
    });
  });
}

// ============================================================
// FETCH INDIVIDUAL NEWS PAGE (for review+ items)
// ============================================================

function fetchNewsDetail(url, fetcher = fetchUrlResult) {
  const fetched = fetcher(url);
  const html = String(fetched?.body || '');
  const trustedResolution = fetched?.ok === true && html.length >= 200 &&
    isTrustedOfficialDetailResolution(url, fetched.effectiveUrl || url, html);
  if (!trustedResolution) {
    return {
      available: false,
      httpStatus: Number(fetched?.httpStatus) || null,
      finalUrl: safeDiagnosticUrl(fetched?.effectiveUrl || ''),
      failureKind: fetched?.diagnostic?.kind || (html.length < 200 ? 'empty_body' : 'untrusted_resolution'),
      text: '',
      html: '',
      image: '',
      images: [],
      pdfs: [],
      relevantLinks: null,
    };
  }

  const contentHtml = extractPrimaryContentHtml(html);
  let text = extractText(contentHtml);
  // HARDENING 2026-06-04: Sanitize portal junk
  text = cleanRawText(text);
  // Extract image from the news page — v4.2: reject SVGs
  const imgMatch = contentHtml.match(/<img[^>]+src="([^"]+weby\/up\/\d+\/o\/[^"]+\.(png|jpg|jpeg))"/i) ||
    contentHtml.match(/<img[^>]+src="(https?:\/\/files\.cercomp\.ufg\.br\/weby\/[^"]+)"/i);
  let image = imgMatch ? imgMatch[1] : '';
  // v4.2: Reject SVG images (logos institucionais) — handle query strings
  if (image && image.toLowerCase().split('?')[0].endsWith('.svg')) image = '';
  const images = extractImages(contentHtml, url, image, html);
  image = images[0] || image;
  // v4.3 (2026-06-08): Extract relevant links for post CTA
  const relevantLinks = extractRelevantLinks(contentHtml, url);

  return {
    available: true,
    httpStatus: Number(fetched?.httpStatus) || 200,
    finalUrl: safeDiagnosticUrl(fetched?.effectiveUrl || url),
    failureKind: null,
    text: text.slice(0, 4000),
    html: contentHtml,
    image,
    images,
    pdfs: extractPdfLinks(contentHtml),
    relevantLinks,
  };
}

// ============================================================
// PARSE WEBY JSON
// ============================================================

function isWebyNewsPayload(json) {
  return Boolean(json && typeof json === 'object' && !Array.isArray(json)
    && ['news', 'items', 'data'].some(key => Array.isArray(json[key])));
}

function parseWebyJson(json, sourceName, baseUrl, limit) {
  const items = [];
  const data = json?.news || json?.items || json?.data || [];
  const arr = Array.isArray(data) ? data.slice(0, limit) : [];
  // v4.7.0: Use baseUrl (full host with subdomain) when synthesizing the
  // canonical detail link, so sites living on subdomains like
  // idiomassemfronteiras.sri.ufg.br do NOT collapse to
  // idiomassemfronteiras.ufg.br (which is DNS NXDOMAIN). Fallback to the old
  // behavior only when baseUrl is missing.
  const synthBase = (() => {
    if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
      return baseUrl.replace(/\/+$/, '');
    }
    if (sourceName === 'ufg') return 'https://www.ufg.br';
    return `https://${sourceName}.ufg.br`;
  })();
  for (const item of arr) {
    const title = item.title || item.titulo || '';
    // v4.3: Use item.text (full body HTML) first, fall back to summary
    // The JSON API has: summary (short excerpt) AND text (full article body)
    const rawText = item.text || item.summary || item.description || item.body || item.resumo || '';
    const text = extractText(rawText);
    const link = item.link || item.url || item.href ||
      (item.id ? `${synthBase}/n/${item.id}` : '');
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
  const arr = Array.isArray(data)
    ? data.slice(0, Number.isInteger(limit) ? limit : data.length)
    : [];
  return arr.map(ev => parseEventItem(ev, sourceName, baseUrl));
}

function selectUpcomingLocalEvents(json, sourceName, baseUrl, {
  scanLimit = 100,
  outputLimit = 20,
} = {}) {
  const parsedEvents = parseWebyEventsJson(json, sourceName, baseUrl, scanLimit);
  return filterUpcomingEvents(parsedEvents).slice(0, outputLimit);
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
  const curatorStartedAt = Date.now();
  const GLOBAL_BUDGET_MS = resolveCuratorGlobalBudgetMs(process.env, MODE);
  const globalBudgetExceeded = () => (Date.now() - curatorStartedAt) >= GLOBAL_BUDGET_MS;
  console.log(`\n🔍 Curador UFG v4.4 — Modo: ${MODE.toUpperCase()}`);
  console.log(`${'='.repeat(60)}\n`);

  console.log(`Global source budget: ${Math.round(GLOBAL_BUDGET_MS / 1000)}s`);

  // Load cache
  console.log('📚 Carregando cache de posts publicados...');
  const cache = await loadPublishedPosts();
  const publishedTitles = cache.titles;
  const publishedLinks = cache.links;
  const publishedInstagramPermalinks = new Set(
    publishedLinks.map(instagramPermalinkKey).filter(Boolean),
  );

  const allResults = [];
  const publishable = [];
  const reviewable = [];
  const discarded = [];
  const instagramHits = [];
  let instagramDeferredDetails = 0;
  const processedIds = new Set(); // v4.3 P1-7: Cross-site dedup by numeric ID
  const seenRunLinks = new Set();
  const seenRunTitles = [];
  const runActionCandidates = new Map();
  const runOfficialReferenceCandidates = new Map();

  function currentRunDuplicateReason(url, title) {
    if (url && seenRunLinks.has(url)) return 'run_link_duplicate';
    const hit = seenRunTitles.some(seen => titlesLikelyDuplicate(title, seen));
    return hit ? 'run_title_duplicate' : null;
  }

  function rememberRunItem(url, title) {
    if (url) seenRunLinks.add(url);
    const normalized = normalizeText(title || '');
    if (normalized.length >= 15) seenRunTitles.push(normalized);
  }

  function forgetRunItem(record) {
    if (record?.url) seenRunLinks.delete(record.url);
    const normalized = normalizeText(record?.title || '');
    if (!normalized) return;
    for (let index = seenRunTitles.length - 1; index >= 0; index -= 1) {
      if (seenRunTitles[index] === normalized) seenRunTitles.splice(index, 1);
    }
  }

  function discardSupersededActionRecord(record) {
    forgetRunItem(record);
    for (const bucket of [publishable, reviewable]) {
      const index = bucket.indexOf(record);
      if (index >= 0) bucket.splice(index, 1);
    }
    record.decision = 'discard';
    record.duplicate = true;
    record.reasons = Array.isArray(record.reasons) ? record.reasons : [];
    if (!record.reasons.includes('superseded_run_action_duplicate')) {
      record.reasons.push('superseded_run_action_duplicate');
    }
    if (!discarded.includes(record)) discarded.push(record);
  }

  // Process tiers
  const tiersToProcess = MODE === 'ig-only' ? [] :
    (MODE === 'quick' ? [1] : (MODE === 'daily' ? [1, 2] : [1, 2, 3]));
  const expectedSourceDiagnosticIds = tiersToProcess.flatMap(tier =>
    Object.keys(TIERS[tier]?.sites || {}).map(id => id.toLowerCase())
  );
  const sourceDiagnostics = [];

  let siteCount = 0;
  let jsonHits = 0;
  let eventJsonHits = 0;
  let localEventHits = 0;
  let localEventPaginationFailures = 0;
  let localEventCalendarMisses = 0;
  let globalEventPagination = null;
  let globalEventCollectionFailure = null;
  let htmlFallbacks = 0;
  let siteSourcesOk = 0;
  let siteSourcesEmpty = 0;
  let siteSourcesNoFeed = 0;
  let siteSourcesQuarantined = 0;
  let siteSourcesBudgetSkipped = 0;
  const emptySourceNames = [];
  const emptySourceDetails = [];
  const noFeedSourceNames = [];
  const quarantinedSources = [];
  const budgetSkippedNames = [];
  // 2026-07-15 (b08a5737): one slow site (museu mid-scan) burned the whole 15min
  // pipeline curator budget → SIGTERM, zero publish. Cap per-site wall time.
  const SITE_BUDGET_MS = (() => {
    const raw = Number(process.env.CADU_SITE_BUDGET_MS);
    if (Number.isFinite(raw) && raw >= 10_000 && raw <= 180_000) return Math.floor(raw);
    return 75_000; // 75s default — enough for JSON + a few detail pages
  })();
  const HTML_FALLBACK_MAX_PAGES = (() => {
    const raw = Number(process.env.CADU_HTML_FALLBACK_MAX_PAGES);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 30) return Math.floor(raw);
    return 8;
  })();
  const DETAIL_FETCH_MAX_PER_SITE = (() => {
    const raw = Number(process.env.CADU_DETAIL_FETCH_MAX_PER_SITE);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 60) return Math.floor(raw);
    return 12;
  })();

  // --- SITES ---
  for (const tier of tiersToProcess) {
    const tierData = TIERS[tier];
    if (!tierData) continue;
    console.log(`\n📡 Tier ${tier} — ${tierData.label} (${Object.keys(tierData.sites).length} sites)`);

    for (const [name, site] of Object.entries(tierData.sites)) {
      const stableSourceId = resolveCanonicalSourceId(name, site);
      const publicSourceName = sourceDisplayName(name, site);
      if (isQuarantinedLegacySource(stableSourceId, site.url)) {
        const quarantine = getQuarantinedLegacySource(stableSourceId, site.url);
        siteSourcesQuarantined++;
        quarantinedSources.push({ name, ...quarantine });
        sourceDiagnostics.push(createSourceDiagnostic({
          site,
          legacyId: name,
          tier,
          state: 'quarantined',
          failure: quarantine.reviewIssues.join(','),
        }));
        console.log(
          `\n  [quarantine] ${stableSourceId} skipped before source I/O`
          + ` — reasons=${quarantine.reviewIssues.join(',')}`
          + ` checkedAt=${quarantine.checkedAt || 'unknown'}`
          + ` reviewAfter=${quarantine.reviewAfter || 'unknown'}`
          + ` reviewDue=${quarantine.reviewDue}`
          + ` recheck=${quarantine.recheckPolicy}`,
        );
        continue;
      }
      // Explicit non-Weby sources (e.g. WordPress TV) or catalog landings without feedUrl.
      const feedMode = String(site.feedMode || site.feed_mode || '').toLowerCase();
      const baseUrl = resolveFeedBaseUrl(site);
      if (feedMode === 'none' || baseUrl === null) {
        siteSourcesNoFeed++;
        noFeedSourceNames.push(name);
        const reason = feedMode === 'none'
          ? 'feedMode=none'
          : (isPosUfgCatalogLanding(site.url) ? 'pos.ufg.br/p catalog landing (no Weby feed)' : 'no feed base URL');
        sourceDiagnostics.push(createSourceDiagnostic({
          site,
          legacyId: name,
          tier,
          state: 'no_feed',
          failure: reason,
        }));
        console.log(`\n  [no-feed] ${stableSourceId} skipped — ${reason}`);
        continue;
      }
      if (globalBudgetExceeded()) {
        siteSourcesBudgetSkipped++;
        budgetSkippedNames.push(name);
        sourceDiagnostics.push(createSourceDiagnostic({
          site,
          legacyId: name,
          tier,
          collectionUrl: baseUrl,
          state: 'budget',
          failure: 'global_budget_exhausted_before_source_io',
        }));
        console.log(`\n  [global-budget] ${stableSourceId} skipped before source I/O`);
        continue;
      }
      // Count an attempt only after the global budget gate. Sources skipped
      // before any request remain visible in diagnostics, but must not inflate
      // the operational "collection attempted" metric.
      siteCount++;
      const sourceDiagnosticStart = fetchDiagnostics.length;
      const siteStartedAt = Date.now();
      const siteBudgetExceeded = () =>
        globalBudgetExceeded() || (Date.now() - siteStartedAt) >= SITE_BUDGET_MS;
      const progressBar = '▌'.repeat(Math.min(5, Math.ceil(siteCount / 10)));
      process.stdout.write(`\r  ${progressBar} ${name.padEnd(18)} `);

      const effectiveLimit = site.numItemsOverride || tierData.numItems;
      const eventLimit = site.eventItemsOverride || Math.min(20, effectiveLimit);
      let sourceHadSuccessfulResponse = false;
      let sourceNewsHadSuccessfulResponse = false;
      let sourceNewsItems = null;
      let sourceEventItems = null;
      let sourceClassifiedItems = 0;
      let sourceBudgetInterrupted = false;
      const sourceFailures = [];

      // Events first: KinoCampus has an explicit eventos module, and Weby unit
      // calendars expose future events better than news feeds.
      let items = [];
      try {
        const localEvents = fetchEventPages(`${baseUrl}/events.json`, fetchJson, {
          pageSize: 100,
          maxPages: EVENTS_MAX_PAGES,
          canFetchPage: page => page === 1 || !siteBudgetExceeded(),
        });
        sourceHadSuccessfulResponse = true;
        eventJsonHits++;
        const upcomingEvents = selectUpcomingLocalEvents({ events: localEvents }, name, baseUrl, {
          scanLimit: localEvents.length,
          outputLimit: eventLimit,
        });
        sourceEventItems = upcomingEvents.length;
        localEventHits += upcomingEvents.length;
        items.push(...upcomingEvents);
      } catch (error) {
        const reason = String(error?.message || error);
        sourceFailures.push(`events:${reason}`);
        if (siteBudgetExceeded() || /^events_budget_exceeded:/i.test(reason)) {
          sourceBudgetInterrupted = true;
        }
        // Only integrity failures (overlap, sort, totals) mark collection
        // incomplete. Transport / TLS / first-page empty / site budget are
        // source-health signals tracked as calendar misses.
        if (isLocalEventPaginationIntegrityFailure(reason)) {
          localEventPaginationFailures++;
          console.log(`\n  [events-blocked] ${stableSourceId} — ${reason}`);
        } else {
          localEventCalendarMisses++;
          console.log(`\n  [events-unavailable] ${stableSourceId} — ${reason}`);
        }
      }

      // News second: keep it for editais, inscricoes, bolsas, chamadas and
      // event announcements that are not present in events.json.
      const jsonUrl = `${baseUrl}/news.json`;
      let jsonData = null;
      if (siteBudgetExceeded()) {
        sourceBudgetInterrupted = true;
      } else {
        jsonData = fetchJson(jsonUrl);
      }

      if (isWebyNewsPayload(jsonData)) {
        sourceHadSuccessfulResponse = true;
        sourceNewsHadSuccessfulResponse = true;
        jsonHits++;
        // v4.5.2: usar numItemsOverride se definido no site, senão tierData.numItems
        // v4.7.0: passa baseUrl para que o synth-link preserve o subdomínio real
        // (idiomassemfronteiras.sri.ufg.br em vez de idiomassemfronteiras.ufg.br)
        const newsItems = parseWebyJson(jsonData, name, baseUrl, effectiveLimit);
        sourceNewsItems = newsItems.length;
        items.push(...newsItems);
      } else if (jsonData) {
        fetchDiagnostics.push({
          url: safeDiagnosticUrl(jsonUrl),
          kind: 'invalid_news_contract',
          retryable: false,
          httpStatus: 200,
          curlExitCode: 0,
        });
      }

      // HTML fallback — hard-cap detail pages so a broken feed cannot burn 15min
      if (shouldUseNewsHtmlFallback(sourceNewsItems) && !siteBudgetExceeded()) {
        const html = fetchUrl(baseUrl + '/news');
        if (html) {
          sourceHadSuccessfulResponse = true;
          sourceNewsHadSuccessfulResponse = true;
          htmlFallbacks++;
          const htmlPageCap = Math.min(
            HTML_FALLBACK_MAX_PAGES,
            site.numItemsOverride || tierData.numItems || 10,
          );
          const fallback = collectNewsHtmlFallbackItems(html, baseUrl, {
            pageCap: htmlPageCap,
            budgetExceeded: siteBudgetExceeded,
          });
          items.push(...fallback.items);
          sourceNewsItems = fallback.items.length;
          if (fallback.budgetInterrupted) sourceBudgetInterrupted = true;
        }
      }

      if (items.length === 0) {
        const sourceDetail = summarizeSourceFetchDiagnostics(
          name,
          fetchDiagnostics.slice(sourceDiagnosticStart),
        );
        if (siteBudgetExceeded()) {
          sourceBudgetInterrupted = true;
          siteSourcesBudgetSkipped++;
          budgetSkippedNames.push(name);
          process.stdout.write('⏱️');
        } else {
          siteSourcesEmpty++;
          emptySourceNames.push(name);
          if (sourceHadSuccessfulResponse) {
            sourceDetail.reason = 'feed_empty';
            sourceDetail.retryable = true;
          }
          emptySourceDetails.push(sourceDetail);
          process.stdout.write('⚠️');
        }
        const state = resolveSourceDiagnosticState({
          budgetInterrupted: sourceBudgetInterrupted,
          collectedItems: 0,
          sourceHadSuccessfulResponse,
          sourceNewsHadSuccessfulResponse,
        });
        const failureParts = [...sourceFailures];
        if (state === 'budget') failureParts.push('source_or_global_budget_exhausted');
        if (!sourceNewsHadSuccessfulResponse) failureParts.push('news_channel_unavailable');
        if (state === 'error') failureParts.push(sourceDetail.reason || 'source_fetch_failed');
        sourceDiagnostics.push(createSourceDiagnostic({
          site,
          legacyId: name,
          tier,
          collectionUrl: baseUrl,
          state,
          newsItems: sourceNewsItems,
          eventItems: sourceEventItems,
          collectedItems: 0,
          classifiedItems: 0,
          elapsedMs: Date.now() - siteStartedAt,
          failure: failureParts.join('; '),
        }));
        continue;
      }
      siteSourcesOk++;

      // Classify each item
      let count = 0;
      let detailFetches = 0;
      const itemLimit = effectiveLimit + eventLimit;
      for (const item of items.slice(0, itemLimit)) {
        if (siteBudgetExceeded()) {
          sourceBudgetInterrupted = true;
          siteSourcesBudgetSkipped++;
          if (!budgetSkippedNames.includes(name)) budgetSkippedNames.push(name);
          break;
        }
        // v4.3 P1-7: Cross-site dedup by numeric news ID
        const webNewsIdentity = canonicalWebNewsIdentity(item.link);
        if (webNewsIdentity && processedIds.has(webNewsIdentity)) {
          // Same Weby host/item through a URL variant — skip entirely. Numeric
          // IDs are not global, so equal /n/123 values on other hosts survive.
          continue;
        }
        if (webNewsIdentity) processedIds.add(webNewsIdentity);
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
        let relevantLinks = item.relevantLinks || null; // evidence from feed/event, then detail page
        let detailHtml = '';
        let detailChecked = false;
        let detailAvailable = false;
        let detailHttpStatus = null;
        let detailFinalUrl = '';
        let detailFailureKind = null;
        let finalTemporal = classification.temporal;

        if (classification.decision === 'publish' || classification.decision === 'review' || classification.shouldHydrate) {
          // v4.5.2 P0-Fix-ForceDetail: sites sem fullText (prograd/farmacia/cepae/seinfra)
          // SEMPRE fazem fetch detail, mesmo se text.length >= 500
          const siteConfig = TIERS[getSiteTier(name)]?.sites?.[name] || {};
          const forceDetail = siteConfig.forceDetailFetch === true;
          // v4.5.2: também fetch se detectou "Link para inscrição" (texto curto mas tem URL real)
          const hasInscrLink = /\b(Link\s+para\s+(?:inscri[çc][aã]o|inscrever|inscrever-se)|Inscri[çc][oõ]es?\s*[:\)]|Inscreva-se)\b/i.test(fullText || '');
          // v4.3: Skip detail fetch if API already gave us plenty of text (saves ~80% of time)
          // v4.6.3: also respect per-site wall budget + detail-fetch cap (b08a5737 hang).
          const shouldVerifyPublish = classification.decision === 'publish';
          const canDetailFetch = !siteBudgetExceeded() &&
            (detailFetches < DETAIL_FETCH_MAX_PER_SITE || shouldVerifyPublish);
          if (canDetailFetch && (shouldVerifyPublish || classification.shouldHydrate || forceDetail || hasInscrLink || !fullText || fullText.length < 500)) {
            detailFetches += 1;
            const pageDetail = fetchNewsDetail(item.link);
            detailChecked = true;
            detailAvailable = pageDetail.available === true;
            detailHttpStatus = pageDetail.httpStatus || null;
            detailFinalUrl = pageDetail.finalUrl || '';
            detailFailureKind = pageDetail.failureKind || null;
            fullText = pageDetail.text || fullText;
            detailHtml = pageDetail.html || '';
            image = pageDetail.image || image;
            images = (pageDetail.images && pageDetail.images.length) ? pageDetail.images : images;
            pdfs = pageDetail.pdfs;
            // v4.5.2: extrair relevantLinks sempre que faz detail fetch (force ou hasInscrLink)
            if (pageDetail.relevantLinks) {
              relevantLinks = mergeRelevantLinks(relevantLinks, pageDetail.relevantLinks);
            }
          } else if (canDetailFetch) {
            // API already gave full text — just use it
            // But still try to extract better images if current is SVG or empty
            if (!image || (image.toLowerCase().split('?')[0].endsWith('.svg'))) {
              detailFetches += 1;
              const pageDetail = fetchNewsDetail(item.link);
              detailChecked = true;
              detailAvailable = pageDetail.available === true;
              detailHttpStatus = pageDetail.httpStatus || null;
              detailFinalUrl = pageDetail.finalUrl || '';
              detailFailureKind = pageDetail.failureKind || null;
              detailHtml = pageDetail.html || '';
              image = pageDetail.image || image;
              if (pageDetail.images && pageDetail.images.length) images = pageDetail.images;
              pdfs = pageDetail.pdfs;
              if (pageDetail.relevantLinks) {
                relevantLinks = mergeRelevantLinks(relevantLinks, pageDetail.relevantLinks);
              }
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

        classification = applySourcePageAvailabilityPolicy(classification, {
          sourceKind: item.sourceKind || 'news',
          detailChecked,
          detailAvailable,
        });

        // A newly promoted program calendar can contain external conferences
        // selected by the unit, not events organized by UFG. Keep collecting
        // those structured records, but require review until the source-level
        // event precision has been adjudicated. News opportunities from the
        // same source continue through the normal action/deadline gates.
        classification = applySourcePublicationPolicy(classification, item, site);

        // Check against published cache (link exact match > title fuzzy match)
        const isLinkDuplicate = item.link && publishedLinks.includes(item.link);
        const normalizedTitle = normalizeText(item.title);

        // Identity conflicts are evaluated before any positive fuzzy signal.
        // This prevents recurring editions, different edital numbers and
        // different PPGs from being discarded by an earlier prefix match.
        const isTitleDuplicate = !isLinkDuplicate
          && publishedTitles.some(pubTitle => titlesLikelyDuplicate(item.title, pubTitle));
        // v4.2.1: Cross-source dedup: check if same event appears on multiple unit sites
        // Strategy: extract roman numeral + event keyword OR standalone acronym (WIDaT, SIEPE, etc.)
        const isCrossSourceDup = !isLinkDuplicate && !isTitleDuplicate && publishedTitles.some(pubTitle => {
          if (pubTitle.length < 15) return false;
          if (titleIdentityConflict(item.title, pubTitle)) return false;
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
        const actionFingerprints = buildOpportunityActionFingerprints({
          sourceRegistryId: stableSourceId,
          module: classification.module,
          temporal: finalTemporal,
          actionEvidence: classification.actionEvidence,
        });
        const decisionBeforeDuplicateGate = classification.decision;
        const runDuplicateReason = currentRunDuplicateReason(item.link, item.title);
        const hasPublishedDuplicate = isLinkDuplicate || isTitleDuplicate || isCrossSourceDup;
        const isDuplicate = hasPublishedDuplicate || !!runDuplicateReason;
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
        const officialReferenceIdentities = officialReferenceNewsIdentities(itemRelevantLinks, item.link);

        const record = {
          site: publicSourceName,
          legacyId: name,
          url: item.link,
          // v4.5.2 (2026-06-11): Detectar repost entre unidades UFG (V2)
          // Caso real: post Projeto Rondon (INF) é repost da PROEX. A V1 não detectou.
          sourceUrl: finalSourceUrl,
          // v4.5.2: marca repost para o publisher sinalizar visualmente
          repost: isRepost ? { originalUnit: officialSourceResult.originalUnit, currentUnit: officialSourceResult.currentUnit } : null,
          title: normalizeTitle(item.title),
          text: (fullText || '').slice(0, 4000),
          // Item identity must remain article-level. `sourceUrl` can point to
          // a shared directory/form after official-source detection and is
          // therefore not safe as the idempotency key.
          sourceId: `${stableSourceId}:${item.link}`,
          sourceRegistryId: stableSourceId,
          score: classification.score,
          decision: classification.decision,
          module: classification.module,
          category: classification.category,
          reasons: classification.reasons || [],
          dates: finalTemporal,
          image: classification.mediaEligible === false ? '' : (image || ''),
          images: classification.mediaEligible === false ? [] : images.slice(0, 5),
          pdfs: pdfs,
          relevantLinks: itemRelevantLinks, // v4.3: formularios, editais, paginas oficiais
          actionEvidence: classification.actionEvidence || [],
          actionFingerprints,
          officialReferenceIdentities,
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
            { url: item.link, label: publicSourceName, type: 'official' },
          ],
          sourcePageVerification: {
            checked: detailChecked,
            available: detailAvailable,
            httpStatus: detailHttpStatus,
            finalUrl: detailFinalUrl || null,
            failureKind: detailFailureKind,
          },
        };

        // v5.1: Detectar sinais de atualização no item
        const updateSig = detectUpdateSignals(item.title, fullText);
        let hasTerminalUpdateSignal = false;
        if (updateSig.isUpdate) {
          record.update = true;
          record.updateType = updateSig.type;
          record.updateSignals = updateSig.signals;
          // v4.5.2 P0-Fix-Update: resultados/cancelamentos NÃO viram post novo.
          // Prorrogações e reaberturas podem virar (trazem info nova).
          hasTerminalUpdateSignal = updateSig.type === 'resultado' ||
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
        const canArbitrateRunDuplicate = !hasPublishedDuplicate
          && !!runDuplicateReason
          && (actionFingerprints.length > 0 || officialReferenceIdentities.length > 0)
          && decisionBeforeDuplicateGate !== 'discard'
          && !hasTerminalUpdateSignal;
        if (canArbitrateRunDuplicate) {
          classification.decision = decisionBeforeDuplicateGate;
          classification.reasons = classification.reasons.filter(reason => reason !== runDuplicateReason);
          record.decision = decisionBeforeDuplicateGate;
          record.reasons = classification.reasons;
          record.duplicate = false;
        }
        if (classification.decision !== 'discard' && (!isDuplicate || canArbitrateRunDuplicate)) {
          const runSelection = registerRunCandidateAcrossIndexes(
            runActionCandidates,
            runOfficialReferenceCandidates,
            record,
          );
          if (!runSelection.accepted) {
            classification.decision = 'discard';
            classification.reasons.push(runSelection.duplicateKind === 'official_reference'
              ? 'run_official_reference_duplicate'
              : 'run_action_duplicate');
            record.decision = 'discard';
            record.duplicate = true;
          } else {
            runSelection.superseded.forEach(discardSupersededActionRecord);
            rememberRunItem(item.link, item.title);
          }
        }

        allResults.push(record);
        sourceClassifiedItems++;
        if (classification.decision === 'publish') publishable.push(record);
        else if (classification.decision === 'review') reviewable.push(record);
        else discarded.push(record);
      }

      const siteElapsed = Date.now() - siteStartedAt;
      const sourceDetail = summarizeSourceFetchDiagnostics(
        name,
        fetchDiagnostics.slice(sourceDiagnosticStart),
      );
      const failureParts = [...sourceFailures];
      if (sourceDetail.reason && sourceDetail.reason !== 'feed_empty') {
        failureParts.push(sourceDetail.reason);
      }
      if (sourceBudgetInterrupted) failureParts.push('source_or_global_budget_exhausted');
      if (!sourceNewsHadSuccessfulResponse) failureParts.push('news_channel_unavailable');
      const sourceState = resolveSourceDiagnosticState({
        budgetInterrupted: sourceBudgetInterrupted,
        collectedItems: items.length,
        sourceHadSuccessfulResponse,
        sourceNewsHadSuccessfulResponse,
      });
      sourceDiagnostics.push(createSourceDiagnostic({
        site,
        legacyId: name,
        tier,
        collectionUrl: baseUrl,
        state: sourceState,
        newsItems: sourceNewsItems,
        eventItems: sourceEventItems,
        collectedItems: items.length,
        classifiedItems: sourceClassifiedItems,
        elapsedMs: siteElapsed,
        failure: failureParts.join('; '),
      }));
      if (siteElapsed >= SITE_BUDGET_MS) {
        process.stdout.write(`${count} itens⏱️`);
      } else {
        process.stdout.write(`${count} itens`);
      }
    }
  }

  const sourceDiagnosticsValidation = validateCompleteSourceDiagnostics(
    sourceDiagnostics,
    expectedSourceDiagnosticIds,
  );
  if (!sourceDiagnosticsValidation.ok) {
    throw new Error(`source diagnostics incomplete: ${sourceDiagnosticsValidation.issues.join(',')}`);
  }

  // --- EVENTOS (v4.3 P1-3) ---
  if (MODE !== 'ig-only' && globalBudgetExceeded()) {
    globalEventCollectionFailure = 'global_budget_exhausted';
    console.log('\n\n[global-budget] Global events skipped; classified results were preserved.');
  } else if (MODE !== 'ig-only') {
    console.log(`\n\n📅 EVENTOS — buscando próximos eventos...`);
    try {
      const allEvents = fetchEvents(fetchJson, {
        canFetchPage: page => page === 1 || !globalBudgetExceeded(),
      });
      const eventPage = allEvents.pagination;
      globalEventPagination = { ...eventPage };
      console.log(
        `   📥 ${allEvents.length} eventos únicos; ${eventPage.rawFetched}/${eventPage.total} linhas `
        + `em ${eventPage.pagesScanned} página(s), parada=${eventPage.stopReason}`,
      );

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

        const runDuplicateReason = currentRunDuplicateReason(ev.link, ev.title);
        const isDup = publishedLinks.includes(ev.link) ||
          !!runDuplicateReason ||
          publishedTitles.some(publishedTitle => titlesLikelyDuplicate(ev.title, publishedTitle));

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
          relevantLinks: ev.relevantLinks || null,
          actionEvidence: classification.actionEvidence || [],
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
      globalEventCollectionFailure = String(e?.message || e).slice(0, 160);
      console.log(`   ⚠️ Eventos falhou: ${globalEventCollectionFailure.slice(0, 80)}`);
    }
  }

  // --- INSTAGRAM via BROWSER CDP (v4.2) ---
  // API pública web_profile_info foi descartada por shadow ban.
  // Agora usamos scan-ig-browser.js (WebSocket CDP no browser autenticado).
  const pipelineIgArtifact = String(process.env.CADU_PIPELINE_IG_ARTIFACT || '').trim();
  const pipelineIgSkip = String(process.env.CADU_PIPELINE_IG_SKIP || '').trim() === '1';
  let instagramArtifactProvenance = null;
  let instagramCollectionFailure = null;
  let instagramBudgetConstrained = false;
  if (pipelineIgSkip) {
    instagramCollectionFailure = 'pipeline_skip';
    console.log('\n\n📸 Instagram pulado (CADU_PIPELINE_IG_SKIP=1); resultados web/eventos preservados.');
  } else if (shouldIngestInstagramArtifact(MODE, pipelineIgArtifact)
      && globalBudgetExceeded()
      && !pipelineIgArtifact) {
    instagramCollectionFailure = 'global_budget_exhausted';
    console.log('\n\n[global-budget] Instagram skipped; classified results were preserved.');
  } else if (shouldIngestInstagramArtifact(MODE, pipelineIgArtifact)) {
    console.log('\n\n📸 INSTAgram via Browser — buscando posts...');
    console.log('   (API pública descartada — usando browser autenticado)');

    try {
      let igFile = path.join(IG_DIR, `ig-browser-${TIMESTAMP}.json`);
      if (pipelineIgArtifact) {
        igFile = DRY_RUN
          ? resolveDryRunOutput(pipelineIgArtifact, {
            dryRun: true,
            label: 'Curator Instagram input',
          })
          : path.resolve(pipelineIgArtifact);
        if (!DRY_RUN && igFile !== path.resolve(IG_DIR, `ig-browser-${TIMESTAMP}.json`)) {
          throw new Error('artefato IG fora do caminho canônico desta data BRT');
        }
        if (!igFile || !fs.existsSync(igFile)) throw new Error('artefato IG desta execução ausente');
      } else {
        if (DRY_RUN) throw new Error('dry-run full exige artefato IG efêmero explícito');
        // Execução standalone: dispara exatamente um scanner e compartilha o run id.
        const igScript = path.join(__dirname, 'scan-ig-browser.js');
        const igSupervisor = resolveInstagramSupervisorTimeout({
          profileCount: getActiveInstagramHandles().length,
          skipEnrich: false,
          env: process.env,
        });
        console.log(
          `   ⏱️ Supervisor IG: ${Math.ceil(igSupervisor.timeoutMs / 60000)} min `
          + `(contrato ${Math.ceil(igSupervisor.contractMs / 60000)} min, `
          + `${igSupervisor.profileCount} ativos + até ${igSupervisor.discoveredProfileCap} descobertos)`,
        );
        const globalBudgetRemainingMs = Math.max(
          1_000,
          GLOBAL_BUDGET_MS - (Date.now() - curatorStartedAt),
        );
        const instagramTimeoutMs = Math.min(igSupervisor.timeoutMs, globalBudgetRemainingMs);
        instagramBudgetConstrained = instagramTimeoutMs < igSupervisor.timeoutMs;
        execSync(
          `node "${igScript}"`,
          {
            timeout: instagramTimeoutMs,
            encoding: 'utf8',
            maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, CADU_PIPELINE_RUN_ID: PIPELINE_RUN_ID },
          }
        );
      }

      // Load IG results from the current run artifact.
      {
        const igData = JSON.parse(fs.readFileSync(igFile, 'utf8'));
        const igValidation = validateInstagramArtifact(igData, {
          expectedRunId: PIPELINE_RUN_ID,
          expectedDateBrt: TIMESTAMP,
          expectedStartedAt: process.env.CADU_PIPELINE_STARTED_AT,
          requireFullScope: true,
          expectedScope: 'all_active',
          requireDownstreamAck: true,
        });
        if (!igValidation.ok) throw new Error(`artefato IG inválido: ${igValidation.issues.join(', ')}`);
        const igStats = igData.stats || {};
        instagramArtifactProvenance = {
          runId: igData.artifactContract.runId,
          generatedAt: igData.artifactContract.generatedAt,
          contentSha256: igData.artifactContract.contentSha256,
          explicitPipelineInput: Boolean(pipelineIgArtifact),
          warnings: Array.isArray(igValidation.warnings) ? igValidation.warnings : [],
          profiles: {
            expected: igStats.profileCoverage?.expectedCount ?? null,
            successful: igStats.profileCoverage?.successfulCount ?? null,
            failed: igStats.profileCoverage?.failedCount ?? null,
          },
          posts: {
            occurrences: igStats.totalPostOccurrences ?? null,
            unique: igStats.uniquePosts ?? null,
            duplicates: igStats.duplicatePostOccurrences ?? null,
            relevantOccurrences: igStats.totalRelevantOccurrences ?? null,
            uniqueRelevant: igStats.uniqueRelevant ?? null,
          },
          detail: {
            eligible: igStats.detail?.eligible ?? null,
            requested: igStats.detail?.requested ?? null,
            succeeded: igStats.detail?.succeeded ?? null,
            completedFromCache: igStats.detail?.completedFromCache ?? null,
            partial: igStats.detail?.partial ?? null,
            failed: igStats.detail?.failed ?? null,
            deferred: igStats.detail?.deferred ?? null,
            deferredByBackoff: igStats.detail?.deferredByBackoff ?? null,
          },
        };
        if (igValidation.warnings?.length) {
          console.log(`   ⚠️ Saúde IG: ${igValidation.warnings.join(', ')}`);
          if (igValidation.warnings.includes('ig_detail_live_hydration_unavailable')) {
            instagramCollectionFailure = 'detail_live_hydration_unavailable';
          } else if (igValidation.warnings.includes('ig_detail_hydration_not_attempted')) {
            instagramCollectionFailure = 'detail_hydration_not_attempted';
          }
        }
        const igResults = igData.results;
        const consumedInstagramShortcodes = new Set();
        const deferredInstagramShortcodes = new Set();

        for (const profile of igResults) {
          for (const post of (profile.posts || [])) {
            const shortcode = instagramShortcode(post);
            if (!shortcode) continue;
            const classification = classifyInstagramCandidate(post, TODAY);
            if (!classification.ready) {
              if (classification.relevant === true && classification._needsDetail === true) {
                if (!consumedInstagramShortcodes.has(shortcode)) {
                  deferredInstagramShortcodes.add(shortcode);
                }
              }
              continue;
            }
            if (classification.relevant !== true) {
              continue;
            }
            deferredInstagramShortcodes.delete(shortcode);
            if (consumedInstagramShortcodes.has(shortcode)) continue;
            consumedInstagramShortcodes.add(shortcode);
            // Check against published (link + title)
            const postPermalinkKey = instagramPermalinkKey(post.link);
            if (publishedLinks.includes(post.link)
                || (postPermalinkKey && publishedInstagramPermalinks.has(postPermalinkKey))) continue;
            
            const nt = normalizeText(classification.text || classification.title);
            const module = classification.module
              || (OPP_SIGNALS.filter(t => has(nt, t)).length > EVT_SIGNALS.filter(t => has(nt, t)).length
                ? 'oportunidades'
                : 'eventos');
            const category = classification.category
              || (module === 'oportunidades' ? detectOpportunityCategory(nt) : detectEventCategory(nt));
            const { score, decision } = classification;
            const record = {
              site: classification.source || `ig:@${profile.handle}`,
              url: classification.link,
              sourceUrl: classification.link,
              title: classification.title,
              text: classification.text || '',
              sourceId: `ig:${profile.handle}:${shortcode}`,
              score, decision, module, category,
              dates: {
                allDates: Array.isArray(classification.allDates) ? classification.allDates : [],
                futureDates: Array.isArray(classification.futureDates) ? classification.futureDates : [],
                pastDates: Array.isArray(classification.pastDates) ? classification.pastDates : [],
                hasDeadline: classification.hasDeadline === true,
                temporalStatus: classification.temporalStatus || 'unknown',
                sourcePublishedDate: classification.date || '',
              },
              image: classification.image || '',
              images: [classification.image].filter(Boolean),
              pdfs: [],
              expired: classification.expired === true,
              reasons: [
                classification.relevanceReason,
                ...(classification.penaltySignals || []),
              ].filter(Boolean),
              actionEvidence: classification.actionEvidence || [],
              source: 'instagram',
              enrichmentSources: [
                { url: classification.link, label: `Instagram @${profile.handle}`, type: 'instagram' },
              ],
            };

            // Cross-source dedup
            const igNormTitle = normalizeText(classification.title).slice(0, 40);
            const alreadyExists = allResults.some(r => normalizeText(r.title).slice(0, 40) === igNormTitle);
            if (alreadyExists) continue;
            
            allResults.push(record);
            instagramHits.push(record);
            if (decision === 'publish') publishable.push(record);
            else if (decision === 'review') reviewable.push(record);
            else discarded.push(record);
          }
        }
        instagramDeferredDetails += deferredInstagramShortcodes.size;
        console.log(
          `   ✅ ${instagramHits.length} posts relevantes classificados`
          + ` | ${instagramDeferredDetails} aguardando detalhe completo`,
        );
      }
    } catch (e) {
      const detail = String(e?.message || e).slice(0, 160);
      if (instagramBudgetConstrained && globalBudgetExceeded()) {
        instagramCollectionFailure = 'global_budget_exhausted';
        console.log('[global-budget] Instagram stopped; classified web results were preserved.');
      } else if (pipelineIgArtifact) {
        // Pipeline-provided artifact integrity/load failure must not erase the
        // completed web/event collection above. Mark Instagram as failed and
        // continue with site candidates only for this run.
        instagramCollectionFailure = detail.startsWith('artefato IG')
          ? 'artifact_invalid'
          : 'pipeline_artifact_unavailable';
        console.log(`   ⚠️ Instagram da pipeline indisponível (${instagramCollectionFailure}): ${detail}`);
        console.log('   ↪️ Resultados web/eventos preservados; IG ausente nesta execução.');
      } else {
        // Standalone curator re-scan: treat browser/CDP operational faults as
        // soft failures so a full site pass is not discarded. Integrity is still
        // recorded via collectionIssues and blocks IG-dependent publication.
        instagramCollectionFailure = detail.includes('artefato IG')
          ? 'artifact_invalid'
          : 'browser_scan_failed';
        console.log(`   ⚠️ Instagram indisponível (${instagramCollectionFailure}): ${detail}`);
        console.log('   ↪️ Resultados web/eventos preservados; IG ausente nesta execução.');
      }
    }
  }  // ============================================================
  // RELATÓRIO
  // ============================================================
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 RELATÓRIO CURADORIA v4.4');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Modo:        ${MODE.toUpperCase()}`);
  console.log(`  Sites:       ${siteCount} escaneados | ok=${siteSourcesOk} vazios=${siteSourcesEmpty} no-feed=${siteSourcesNoFeed} quarentena=${siteSourcesQuarantined} budget-skip=${siteSourcesBudgetSkipped}`);
  console.log(`  JSON hits:   ${jsonHits} | HTML: ${htmlFallbacks}`);
  console.log(
    `  Eventos:     ${localEventHits} futuros locais (${eventJsonHits} calendars; `
    + `${localEventPaginationFailures} paginações bloqueadas`
    + (localEventCalendarMisses > 0 ? `; ${localEventCalendarMisses} calendários indisponíveis` : '')
    + `)`,
  );
  console.log(`  Instagram standalone: ${instagramHits.length} posts (cross-match é métrica separada)`);
  console.log(`  Total itens: ${allResults.length}`);
  console.log(`  ✅ PUBLISH:  ${publishable.length}`);
  console.log(`  🔍 REVIEW:   ${reviewable.length}`);
  console.log(`  ❌ DESCART:  ${discarded.length} (${discarded.filter(d=>d.expired).length} expirados, ${discarded.filter(d=>d.duplicate).length} duplicados)`);
  if (noFeedSourceNames.length > 0) {
    console.log(`  ℹ️  No-feed (landing/catalog/wordpress): ${noFeedSourceNames.slice(0, 40).join(', ')}${noFeedSourceNames.length > 40 ? ` (+${noFeedSourceNames.length - 40})` : ''}`);
  }
  if (emptySourceNames.length > 0) {
    const emptySummary = emptySourceDetails
      .slice(0, 40)
      .map(detail => `${detail.name}:${detail.reason}`)
      .join(', ');
    console.log(`  ⚠️  Fontes vazias após fetch: ${emptySummary}${emptySourceDetails.length > 40 ? ` (+${emptySourceDetails.length - 40})` : ''}`);
  }
  if (quarantinedSources.length > 0) {
    const quarantineSummary = quarantinedSources
      .map(source => `${source.id}[${source.reviewIssues.join('|')};reviewAfter=${source.reviewAfter || 'unknown'};due=${source.reviewDue};${source.recheckPolicy}]`)
      .join(', ');
    console.log(`  🛡️  Quarentena: ${quarantineSummary}`);
  }
  if (budgetSkippedNames.length > 0) {
    console.log(`  ⏱️  Fontes com orçamento de tempo esgotado (${SITE_BUDGET_MS}ms): ${budgetSkippedNames.slice(0, 40).join(', ')}${budgetSkippedNames.length > 40 ? ` (+${budgetSkippedNames.length - 40})` : ''}`);
  }
  
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

  if (allResults.length === 0) {
    throw new Error(
      `relatório vazio: 0 itens coletados; fontes com itens=${siteSourcesOk}, fontes vazias/falhas=${siteSourcesEmpty}`,
    );
  }

  const collectionIssues = [];
  if (globalEventCollectionFailure) {
    collectionIssues.push('global_events_collection_failed');
  } else if (MODE !== 'ig-only' && globalEventPagination?.coverageComplete !== true) {
    collectionIssues.push('global_events_pagination_incomplete');
  }
  if (localEventPaginationFailures > 0) {
    collectionIssues.push(`local_event_pagination_failures:${localEventPaginationFailures}`);
  }
  const sourceDiagnosticStateCounts = Object.fromEntries(
    SOURCE_DIAGNOSTIC_STATES.map(state => [
      state,
      sourceDiagnostics.filter(entry => entry.state === state).length,
    ]),
  );
  if (sourceDiagnosticStateCounts.budget > 0) {
    collectionIssues.push(`source_budget_exhausted:${sourceDiagnosticStateCounts.budget}`);
  }
  const sourceNewsUnavailableCount = countSourceNewsUnavailableDiagnostics(sourceDiagnostics);
  if (sourceNewsUnavailableCount > 0) {
    collectionIssues.push(`source_news_unavailable:${sourceNewsUnavailableCount}`);
  }
  if (instagramCollectionFailure) {
    collectionIssues.push('instagram_collection_failed');
    collectionIssues.push(`instagram_${instagramCollectionFailure}`);
  }
  if (globalEventCollectionFailure === 'global_budget_exhausted'
      || instagramCollectionFailure === 'global_budget_exhausted') {
    collectionIssues.push('global_budget_exhausted');
  }
  
  // Build output in memory. A dry-run only writes when pipeline-kino provided
  // an explicitly confined ephemeral destination.
  const output = {
    version: "4.4",
    mode: MODE,
    timestamp: new Date().toISOString(),
    thresholds: { publish: PUBLISH_THRESHOLD, review: REVIEW_THRESHOLD },
    stats: {
      totalSites: siteCount,
      collectionAttempted: siteCount,
      jsonHits,
      eventJsonHits,
      localEventHits,
      localEventPaginationFailures,
      localEventCalendarMisses,
      globalEventPagination,
      globalEventCollectionFailure,
      collectionComplete: collectionIssues.length === 0,
      collectionIssues,
      htmlFallbacks,
      siteSourcesOk,
      siteSourcesEmpty,
      siteSourcesNoFeed,
      siteSourcesQuarantined,
      siteSourcesBudgetSkipped,
      emptySourceNames: emptySourceNames.slice(0, 80),
      emptySourceDetails: emptySourceDetails.slice(0, 80),
      noFeedSourceNames: noFeedSourceNames.slice(0, 80),
      quarantinedSources: quarantinedSources.slice(0, 80),
      budgetSkippedNames: budgetSkippedNames.slice(0, 80),
      siteBudgetMs: SITE_BUDGET_MS,
      globalBudgetMs: GLOBAL_BUDGET_MS,
      globalElapsedMs: Math.max(0, Date.now() - curatorStartedAt),
      configuredSourcesConsidered: expectedSourceDiagnosticIds.length,
      sourceDiagnosticStateCounts,
      standaloneInstagramItems: instagramHits.length,
      instagramDeferredDetails,
      instagramArtifact: instagramArtifactProvenance,
      instagramCollectionFailure,
      instagramProfilesExpected: instagramArtifactProvenance?.profiles?.expected ?? null,
      instagramProfilesSuccessful: instagramArtifactProvenance?.profiles?.successful ?? null,
      instagramProfilesFailed: instagramArtifactProvenance?.profiles?.failed ?? null,
      instagramPostOccurrences: instagramArtifactProvenance?.posts?.occurrences ?? null,
      instagramUniquePosts: instagramArtifactProvenance?.posts?.unique ?? null,
      instagramDuplicatePostOccurrences: instagramArtifactProvenance?.posts?.duplicates ?? null,
      instagramRelevantOccurrences: instagramArtifactProvenance?.posts?.relevantOccurrences ?? null,
      instagramUniqueRelevant: instagramArtifactProvenance?.posts?.uniqueRelevant ?? null,
      instagramDetailEligible: instagramArtifactProvenance?.detail?.eligible ?? null,
      instagramDetailRequested: instagramArtifactProvenance?.detail?.requested ?? null,
      instagramDetailSucceeded: instagramArtifactProvenance?.detail?.succeeded ?? null,
      instagramDetailCompletedFromCache:
        instagramArtifactProvenance?.detail?.completedFromCache ?? null,
      instagramDetailPartial: instagramArtifactProvenance?.detail?.partial ?? null,
      instagramDetailFailed: instagramArtifactProvenance?.detail?.failed ?? null,
      instagramDetailDeferred: instagramArtifactProvenance?.detail?.deferred ?? null,
      instagramDetailDeferredByBackoff:
        instagramArtifactProvenance?.detail?.deferredByBackoff ?? null,
      // Compatibilidade: este campo nunca representou o cross-match.
      instagramHits: instagramHits.length,
      totalItems: allResults.length,
      publishable: publishable.length,
      reviewable: reviewable.length,
      discarded: discarded.length,
      expiredDiscarded: discarded.filter(d => d.expired).length,
      duplicateDiscarded: discarded.filter(d => d.duplicate).length,
    },
    sourceRegistry: {
      registryVersion: CURATOR_SOURCE_BINDINGS.registryVersion,
      registrySha256: CURATOR_SOURCE_BINDINGS.registrySha256,
    },
    sourceDiagnostics,
    publishable,
    reviewable,
    discarded,
  };
  output.artifactContract = {
    schemaVersion: 1,
    kind: 'curator-report',
    version: output.version,
    mode: output.mode,
    runId: PIPELINE_RUN_ID,
    dateBrt: TODAY_ISO,
    generatedAt: output.timestamp,
    contentSha256: crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex'),
  };
  
  if (!DRY_RUN || EXPLICIT_OUTPUT_FILE) {
    const outFile = EXPLICIT_OUTPUT_FILE || path.join(BASE_DIR, `curadoria-v4.4-${MODE}-${TIMESTAMP}.json`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    writeJsonAtomic(outFile, output);
    console.log(`\n📁 Relatório salvo: ${outFile}${DRY_RUN ? ' (efêmero)' : ''}`);
  } else {
    console.log('\n🏷️  DRY-RUN — relatório canônico não foi gravado');
  }
  console.log();
}

if (require.main === module) {
  main().catch(e => { console.error('💥', e.message); process.exit(1); });
}

module.exports = {
  CURATOR_SOURCE_BINDINGS,
  EXPLICIT_SOURCE_URL_REDIRECTS,
  QUARANTINED_WEB_SOURCE_IDS,
  SOURCE_DIAGNOSTIC_STATES,
  TIER_SOURCE_INVENTORY,
  analyzeTemporalRelevance,
  applySourcePageAvailabilityPolicy,
  applySourcePublicationPolicy,
  buildOpportunityActionFingerprints,
  canonicalWebNewsIdentity,
  canonicalTierSourceUrl,
  collectNewsHtmlFallbackItems,
  countSourceNewsUnavailableDiagnostics,
  classifyInstagramCandidate,
  classifyItem,
  detectUpdateSignals,
  extractPrimaryContentHtml,
  fetchEventPages,
  fetchEvents,
  fetchNewsDetail,
  fetchUrlResult,
  fetchUrlResultViaAiaRecovery,
  collectPublishedRows,
  classifyCurlFailure,
  isLocalEventCalendarUnavailable,
  isLocalEventPaginationIntegrityFailure,
  extractRelevantLinks,
  getQuarantinedLegacySource,
  has,
  isPosUfgCatalogLanding,
  isWebyNewsPayload,
  isTrustedOfficialDetailResolution,
  isTrustedOfficialDetailsUrl,
  isInstagramPostReadyForCuration,
  isQuarantinedLegacySource,
  isoDateInTimeZone,
  parseCuratorArgs,
  parseCurlFetchResult,
  parseEventItem,
  officialReferenceNewsIdentities,
  parseDatePt,
  parseWebyJson,
  registerRunActionCandidate,
  registerRunCandidateAcrossIndexes,
  registerRunOfficialReferenceCandidate,
  resolveCanonicalSourceId,
  resolveFeedBaseUrl,
  resolveSourceDiagnosticState,
  resolveCuratorGlobalBudgetMs,
  createSourceDiagnostic,
  sanitizeSourceDiagnosticFailure,
  selectUpcomingLocalEvents,
  shouldUseNewsHtmlFallback,
  shouldIngestInstagramArtifact,
  sourceEventsAutoPublish,
  sourceDisplayName,
  sourceNewsAutoPublish,
  summarizeSourceFetchDiagnostics,
  titleIdentityConflict,
  titlesLikelyDuplicate,
  validateTierSourceUniqueness,
  validateCuratorSourceBindingsArtifact,
  validateCompleteSourceDiagnostics,
  validateInstagramArtifact,
};
