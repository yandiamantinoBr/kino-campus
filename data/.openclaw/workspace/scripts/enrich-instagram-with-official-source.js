// enrich-instagram-with-official-source.js
// Fix B (2026-07-23): para items vindos do Instagram, adiciona o site oficial
// UFG da unidade correspondente em `enrichmentSources`, resolvendo o bloqueio
// `instagram_without_official_source` na Edge Function `cadu-publish`.
//
// FONTE DO MAPEAMENTO: ufg-sites-map.md (audit Yan 2026-07-10, 106 fontes
// validadas, 62 Instagrams detectados). Formato das linhas:
//   - NOME - https://site.ufg.br - IG: @handle
//
// Uso:
//   node enrich-instagram-with-official-source.js <publishItems.json>
//   node enrich-instagram-with-official-source.js --stdin < publishItems.json
//   node enrich-instagram-with-official-source.js --dry-run <publishItems.json>
//
// Saída: JSON no stdout com items enriquecidos + stats.
//
// Idempotente: se `enrichmentSources` já contém uma URL com host ufg.br/
// gov.br/even3.com.br/forms.gle, o item é pulado.

'use strict';

const fs = require('fs');
const path = require('path');

// ===== Configuração =====
const SITES_MAP_PATH = process.env.UFG_SITES_MAP_PATH
  || '/data/.openclaw/workspace/ufg-sites-map.md';
// Hosts que a Edge Function cadu-publish considera "fonte oficial não-Instagram"
// (constante hasOfficialNonInstagramSource em index.ts: ufg.br, gov.br, even3.com.br, forms.gle)
const OFFICIAL_HOST_PATTERN = /(^|\.)ufg\.br$|(^|\.)gov\.br$|even3\.com\.br$|forms\.gle$/i;
// Aliases de handles (handles antigos que foram renomeados no audit Yan 2026-07-10).
// Estes handles nao estao no mapa direto, mas precisamos resolver para o canonical
// que ESTA no mapa. Formato: alias -> canonical.
const HANDLE_ALIASES = {
  'odontologia.ufg': 'odontologiaufg',
  'icb.ufg': 'icb_acoes',
  'ppgacv.ufg': 'ppgacv',
  'cadu': 'cadu_bot',
};

// Map secundario: handles da secao "INSTAGRAM-ONLY" do ufg-sites-map.md.
// Esses handles estao CONFIRMADOS via audit 2026-07-10 mas alguns nao tem
// site proprio. Mapeamos para o site institucional mais provavel.
const INSTAGRAM_ONLY_HANDLES = {
  'ufg_oficial': 'https://ufg.br',
  'pesquisaeinovacaoufg': 'https://prpi.ufg.br',
  'posufg': 'https://pos.ufg.br',
  'proex.ufg': 'https://proex.ufg.br',
  'prograd_ufg': 'https://prograd.ufg.br',
  'praeufg': 'https://prae.ufg.br',
  'sri_ufg': 'https://sri.ufg.br',
  'institutoverbenaufg': 'https://institutoverbena.ufg.br',
  'cei.ufg': 'https://cei.ufg.br',
  'ciar_ufg': 'https://ciar.ufg.br',
  'face.ufg': 'https://face.ufg.br',
  'fanutufg': 'https://fanut.ufg.br',
  'iesa.ufg': 'https://iesa.ufg.br',
  'planetario.ufg': 'https://planetario.ufg.br',
  'editora.ufg': 'https://editora.ufg.br',
  'centroculturalufg': 'https://centrocultural.ufg.br',
  'herbarioufg': 'https://herbario.ufg.br',
  'institutoverbenaufg': 'https://institutoverbena.ufg.br',
  'fct.ufg': 'https://fct.ufg.br',
  'campusgoiasufg': 'https://campusgoias.ufg.br',
  'campusocidentalufg': 'https://cidadeocidental.ufg.br',
  'evzufg': 'https://evz.ufg.br',
  'fcs_ufg': 'https://fcs.ufg.br',
  'fav_ufg': 'https://fav.ufg.br',
  'fafilufg': 'https://fafil.ufg.br',
  'fcs_ufg': 'https://fcs.ufg.br',
  'ime_ufg': 'https://ime.ufg.br',
  'emc_ufg': 'https://emc.ufg.br',
  'direitoufg': 'https://direito.ufg.br',
  'iptsp_ufg': 'https://iptsp.ufg.br',
  'iqufg': 'https://iq.ufg.br',
  'iacufg': 'https://iac.ufg.br',
  'cepae_ufg': 'https://cepae.ufg.br',
  'museu_ufg': 'https://museu.ufg.br',
  'cerofufg': 'https://cerof.ufg.br',
  'sdh_ufg': 'https://sdh.ufg.br',
  'letras.ufg': 'https://letras.ufg.br',
  'propessoas_ufg': 'https://proex.ufg.br',
  'firminopolis_ufg': 'https://firminopolis.ufg.br',
  'ea.ufg': 'https://ea.ufg.br',
  'fen_ufg': 'https://fen.ufg.br',
  'ppgccufg': 'https://ppgcc.inf.ufg.br',
  'ppgnut.ufg': 'https://ppgnut.fanut.ufg.br',
  'ppgadm.ufg': 'https://ppgadm.face.ufg.br',
  'ppgcont.ufg': 'https://ppgcont.face.ufg.br',
  'ppgci': 'https://ppgci.fic.ufg.br',
  'ppgacv': 'https://pos.ufg.br/p/programa-pos-graduacao-arte-cultura-visual-ppgacv',
  'ppgif': 'https://ppgif.farmacia.ufg.br',
  'sibi_ufg': 'https://sibi.ufg.br',
  'jornalufg': 'https://jornal.ufg.br',
  'labmic.ufg': 'https://labmic.ufg.br',
  'fl_ufg_oficial': 'https://fl.ufg.br',
  'patiodaciencia_ufg': 'https://patiociencia.ufg.br',
  'tvufg': 'https://tv.ufg.br',
  'radioufg': 'https://radio.ufg.br',
  'cei.ufg': 'https://cei.ufg.br',
  'institutoverbenaufg': 'https://institutoverbena.ufg.br',
  'ppgact': 'https://ppgact.ufg.br',
  'ppgban': 'https://ppgban.ufg.br',
  'ppgcb': 'https://ppgcb.ufg.br',
  'ppgcef': 'https://ppgcef.ufg.br',
  'ppgdir': 'https://ppgdir.ufg.br',
  'ppgfil': 'https://pos.ufg.br/p/pos-graduacao-filosofia-ppgfil',
  'ppggmp': 'https://ppggmp.ufg.br',
  'ppgies': 'https://ppgies.ufg.br',
  'ppgmtsp': 'https://ppgmtsp.iptsp.ufg.br',
  'ppgoufg': 'https://ppgoufg.ufg.br',
  'ppgzufg': 'https://ppgzufg.ufg.br',
  'infufg': 'https://inf.ufg.br',
  'centroculturalufg': 'https://centrocultural.ufg.br',
  // Fix O (2026-07-24): 6 handles IG descobertos apos run 17d3ba87 que estavam
  // sem mapeamento no script (causavam 10 QUALITY_BLOCKED por instagram_without_official_source).
  // URLs verificadas via busca: site oficial UFG + link no perfil do IG.
  'fefufg': 'https://fe.ufg.br',                              // FE - Faculdade de Educacao
  'lapigufg': 'https://lapig.iesa.ufg.br',                    // LAPIG - Lab Sensoriamento Remoto (IESA)
  'poshistoriaufg': 'https://pos.historia.ufg.br',            // PPGH - Pos-Graduacao em Historia
  'ppgacv_ufg': 'https://pos.ufg.br/p/programa-pos-graduacao-arte-cultura-visual-ppgacv', // PPGACV (handle real com underscore)
  'ppggmp.ufg': 'https://ppggmp.ufg.br',                      // PPGGMP - Pos-Graduacao em Genetica e Melhoramento de Plantas (handle com dot)
  'centrodelinguasflufg': 'https://letras.ufg.br',            // Centro de Linguas = Orgao Complementar da FL
  // Fix S (2026-07-25): 3 handles IG descobertos apos run ef904a69 que causaram
  // 4 QUALITY_BLOCKED por instagram_without_official_source. URLs verificadas via
  // busca: site oficial UFG + link no perfil do IG.
  'ppgca_ufg': 'https://ppgca.evz.ufg.br',                     // PPGCA - Pos-Graduacao em Ciencias Agrarias (EVZ) - handle com underscore
  'ppgcb_ufg': 'https://pos.icb.ufg.br',                       // PPGCB - Pos-Graduacao em Ciencias Biologicas (ICB) - handle com underscore
  'floreser.ufg': 'https://ufg.br',                           // Flore-Ser - projeto de extensao UFG, sem site dedicado. Site principal como ref.
  // Fix T2 (2026-07-25): 3 handles IG descobertos apos run 5101099a que causaram
  // 3 QUALITY_BLOCKED por instagram_without_official_source. URLs verificadas via
  // busca (2026-07-25): site oficial UFG + link no perfil do IG.
  'em.ufg': 'https://em.ufg.br',                              // EM - Escola de Musica da UFG (sub-site com /p/ funcionando)
  'ppgban.ufg': 'https://biodiversidadeanimal.icb.ufg.br',     // PPGBAN - Pos-Graduacao em Biodiversidade Animal (sub-site do ICB)
  'ppgecoevolufg': 'https://www.ecoevol.ufg.br',              // PPGECOEVOL - Pos-Graduacao em Ecologia e Evolucao (handle sem dot)
};
// Hosts de CDN Instagram (para detectar quando enrichmentSources só tem Instagram)
const INSTAGRAM_CDN_HOSTS = [
  'instagram.com',
  'cdninstagram.com',
];

// ===== Parsing do ufg-sites-map.md =====
function loadHandleToSiteMap(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const map = new Map(); // handle (lowercase, sem @) -> { url, name }
  let currentSection = '';
  for (const line of raw.split(/\r?\n/)) {
    // Detecta secao: "## TIER X - ..."
    const sectionMatch = line.match(/^##\s+TIER\s+(\d+)\s*[-:]\s*(.*)/i);
    if (sectionMatch) {
      currentSection = `tier${sectionMatch[1]}`;
      continue;
    }
    // Detecta secao: "### NOME" ou "## NOME"
    if (line.match(/^#{1,3}\s+/)) {
      // Nao reseta currentSection, mas marca como "top-level"
      continue;
    }
    // Detecta entrada: "- NOME - https://url - IG: @handle"
    // O nome pode conter " - " (ex: "PPGADM - Administracao (FACE)") e a URL
    // pode estar entre parênteses no nome (ex: "UFG - Portal principal (ufg.br)"
    // sem URL explicita). Estrategia: tokenizar por " - " e identificar:
    //   - URL explicita: token que comeca com http(s)://
    //   - URL implicita: host simples (ex: "ufg.br", "pos.ufg.br") — converte para https://
    //   - handle IG: token que tem "IG: @..."
    const tokens = line.replace(/^-\s+/, '').split(/\s+-\s+/);
    let url = null;
    let handle = null;
    for (const token of tokens) {
      if (!url) {
        const urlMatch = token.match(/^https?:\/\/\S+/);
        if (urlMatch) {
          url = urlMatch[0];
        } else {
          // Tenta URL implicita: dominio ufg.br/gov.br nos parenteses ou solto
          const domainMatch = token.match(/\(?((?:[\w-]+\.)*ufg\.br|[\w-]+\.gov\.br)\)?$/);
          if (domainMatch) {
            url = `https://${domainMatch[1]}`;
          }
        }
      }
      if (!handle) {
        const handleMatch = token.match(/IG:\s*@?([\w._-]+)/i);
        if (handleMatch) handle = handleMatch[1];
      }
    }
    if (url && handle) {
      // O "name" eh tudo antes da URL
      const urlTokenIdx = tokens.findIndex(t => t.startsWith('http') || /\(?[\w-]+\.ufg\.br\)?$/.test(t));
      const name = urlTokenIdx > 0
        ? tokens.slice(0, urlTokenIdx).join(' - ').trim()
        : tokens.slice(0, tokens.findIndex(t => /IG:/i.test(t))).join(' - ').trim();
      const h = handle.toLowerCase().trim();
      // Resolver conflito: prioriza URL "mais oficial" (host mais curto = mais
      // institucional). Ex: "ufg.br" > "prograd.ufg.br" > "unidade.sub.ufg.br".
      // Tambem prioriza tier numerico menor (Tier 1 > Tier 2 > Tier 3).
      const existing = map.get(h);
      const newUrl = url.trim();
      const isMoreOfficial = (u) => {
        try {
          const host = new URL(u).hostname;
          // .ufg.br raiz eh mais oficial que .unidade.ufg.br
          return host.split('.').length <= 2;
        } catch { return false; }
      };
      const tierRank = (s) => {
        const m = String(s || '').match(/tier(\d+)/i);
        return m ? Number(m[1]) : 99;
      };
      if (!existing
          || tierRank(currentSection) < tierRank(existing.section)
          || (tierRank(currentSection) === tierRank(existing.section) && isMoreOfficial(newUrl))) {
        map.set(h, { url: newUrl, name: name || h, section: currentSection });
      }
    }
  }
  return map;
}

// ===== Detection =====
function extractInstagramHandle(item) {
  let handle = null;
  // sourceId = "ig:HANDLE:SHORTCODE" ou "ig:HANDLE:..."
  const sourceId = item.sourceId || '';
  let m = sourceId.match(/^ig:([^:]+):/);
  if (m) handle = m[1].toLowerCase();
  // sourceUrl = https://www.instagram.com/HANDLE/...
  if (!handle) {
    const sourceUrl = item.sourceUrl || item.url || '';
    m = sourceUrl.match(/instagram\.com\/([\w._-]+)(?:\/|$)/);
    if (m) {
      const h = m[1].toLowerCase();
      if (!['p', 'reel', 'reels', 'stories'].includes(h)) handle = h;
    }
  }
  if (!handle) return null;
  // Aplica alias se existir
  return HANDLE_ALIASES[handle] || handle;
}

function hasOfficialNonInstagramSource(enrichmentSources) {
  if (!Array.isArray(enrichmentSources)) return false;
  return enrichmentSources.some(src => {
    const url = typeof src === 'string' ? src : src?.url;
    if (!url) return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return OFFICIAL_HOST_PATTERN.test(host);
    } catch (_) {
      return false;
    }
  });
}

function hasOnlyInstagramSources(enrichmentSources) {
  if (!Array.isArray(enrichmentSources) || enrichmentSources.length === 0) return true;
  return enrichmentSources.every(src => {
    const url = typeof src === 'string' ? src : src?.url;
    if (!url) return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return INSTAGRAM_CDN_HOSTS.some(h => host === h || host.endsWith('.' + h));
    } catch (_) {
      return false;
    }
  });
}

// ===== Processamento =====
function enrichItem(item, handleMap) {
  const stats = { action: 'skipped', reason: null };
  const handle = extractInstagramHandle(item);
  if (!handle) {
    stats.reason = 'no_instagram_handle';
    return { item, stats };
  }
  const existing = Array.isArray(item.enrichmentSources) ? item.enrichmentSources : [];
  if (hasOfficialNonInstagramSource(existing)) {
    stats.reason = 'already_has_official_source';
    return { item, stats };
  }
  const site = handleMap.get(handle);
  if (!site) {
    // Fallback: usar o map secundario INSTAGRAM_ONLY_HANDLES
    if (INSTAGRAM_ONLY_HANDLES[handle]) {
      const newSource = {
        url: INSTAGRAM_ONLY_HANDLES[handle],
        label: `Site oficial — ${handle}`,
        type: 'official',
        auto_resolved: true,
        fallback: true,
      };
      const deduped = [...existing];
      if (!deduped.some(s => (typeof s === 'string' ? s : s?.url) === INSTAGRAM_ONLY_HANDLES[handle])) {
        deduped.push(newSource);
      }
      stats.action = 'enriched';
      stats.handle = handle;
      stats.siteUrl = INSTAGRAM_ONLY_HANDLES[handle];
      stats.fallback = true;
      return { item: { ...item, enrichmentSources: deduped }, stats };
    }
    stats.reason = `handle_not_in_registry:${handle}`;
    return { item, stats };
  }
  // Adiciona o site oficial como enrichmentSource
  const newSource = {
    url: site.url,
    label: `Site oficial — ${site.name}`,
    type: 'official',
    auto_resolved: true,
  };
  // Mantém os existentes e adiciona o novo (sem duplicar)
  const deduped = [...existing];
  if (!deduped.some(s => (typeof s === 'string' ? s : s?.url) === site.url)) {
    deduped.push(newSource);
  }
  return {
    item: { ...item, enrichmentSources: deduped },
    stats: { action: 'enriched', handle, siteUrl: site.url, siteName: site.name },
  };
}

function processItems(items, handleMap, { dryRun = false } = {}) {
  const stats = { processed: 0, enriched: 0, skipped: 0, byReason: {} };
  const updated = [];
  for (const item of items) {
    stats.processed += 1;
    const { item: newItem, stats: itemStats } = enrichItem(item, handleMap);
    if (itemStats.action === 'enriched' && !dryRun) {
      stats.enriched += 1;
      updated.push(newItem);
    } else if (itemStats.action === 'enriched' && dryRun) {
      stats.enriched += 1;
      // No dry-run, mostra o que SERIA
      updated.push({ ...item, _dryRunWouldEnrich: itemStats });
    } else {
      stats.skipped += 1;
      stats.byReason[itemStats.reason] = (stats.byReason[itemStats.reason] || 0) + 1;
      updated.push(item);
    }
  }
  return { items: updated, stats };
}

// ===== Main =====
function readStdinSync() {
  // Lê stdin de forma síncrona. Em produção o input vem via pipe do
  // pipeline-kino.js, então deve estar totalmente disponível antes do
  // process.stdin emitir 'end'.
  const chunks = [];
  const fd = 0; // stdin
  const buf = Buffer.alloc(4096);
  // fs.readSync é synchronous; usa em loop até EOF.
  const fsSync = require('fs');
  while (true) {
    const n = fsSync.readSync(fd, buf, 0, buf.length, null);
    if (n === 0) break;
    if (n < 0) break;
    chunks.push(buf.slice(0, n));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const stdin = args.includes('--stdin');
  const positional = args.filter(a => !a.startsWith('--'));

  let payload;
  if (stdin || !positional.length) {
    payload = JSON.parse(readStdinSync());
  } else {
    payload = JSON.parse(fs.readFileSync(positional[0], 'utf8'));
  }

  const items = Array.isArray(payload) ? payload
    : Array.isArray(payload.items) ? payload.items
    : Array.isArray(payload.publishable) ? payload.publishable
    : [];

  if (items.length === 0) {
    console.error('[enrich-ig] nenhum item encontrado no payload');
    process.exit(1);
  }

  if (!fs.existsSync(SITES_MAP_PATH)) {
    console.error(`[enrich-ig] ufg-sites-map.md nao encontrado em ${SITES_MAP_PATH}`);
    process.exit(2);
  }

  const handleMap = loadHandleToSiteMap(SITES_MAP_PATH);
  console.error(`[enrich-ig] carregados ${handleMap.size} handles do ufg-sites-map.md`);

  const { items: updated, stats } = processItems(items, handleMap, { dryRun });
  console.error(`[enrich-ig] stats: ${JSON.stringify(stats)}`);
  console.log(JSON.stringify({ items: updated, stats }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  loadHandleToSiteMap,
  extractInstagramHandle,
  hasOfficialNonInstagramSource,
  enrichItem,
  processItems,
};
