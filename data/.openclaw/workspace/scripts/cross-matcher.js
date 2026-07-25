#!/usr/bin/env node
/**
 * cross-matcher.js — Cruzamento inteligente entre itens do curador UFG e posts do Instagram
 *
 * Dado o JSON do curador e o JSON do scanner IG, encontra correspondências
 * e enriquece os itens publicáveis com dados do Instagram (imagem, texto complementar).
 *
 * Uso:
 *   node scripts/cross-matcher.js _truly_new_2026-06-04.json ig-browser-2026-06-04.json
 *   node scripts/cross-matcher.js truly-new.json ig.json --dry-run --output /tmp/run/enriched.json
 * As duas entradas são obrigatórias, vinculadas ao mesmo run e data BRT;
 * o fallback --latest foi desativado.
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { writeJsonAtomic } = require('./lib/atomic-json-file.js');
const { resolveDryRunOutput } = require('./lib/dry-run-artifacts.js');
const {
  TIER_SOURCE_INVENTORY,
  isInstagramPostReadyForCuration,
} = require('./cadu-curador-v4.4.js');

const CU_DIR = '/data/.openclaw/workspace/data/ufg-scrape';
const IG_DIR = '/data/.openclaw/workspace/data/ufg-instagram';
function isoDateInTimeZone(date = new Date(), timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseCrossMatcherArgs(argv) {
  const positional = [];
  let dryRun = false;
  let output = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      if (dryRun) throw new Error('argumento duplicado: --dry-run');
      dryRun = true;
    } else if (arg === '--output') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--output requer um caminho');
      if (output) throw new Error('argumento duplicado: --output');
      output = value;
    } else if (!arg.startsWith('--') && arg.endsWith('.json')) {
      positional.push(arg);
    } else {
      throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  if (positional.length !== 2) {
    throw new Error('informe exatamente curadoria.json e instagram.json; --latest foi desativado');
  }
  return { curatorFile: positional[0], instagramFile: positional[1], dryRun, output };
}
const CROSS_OPTIONS = require.main === module
  ? parseCrossMatcherArgs(process.argv.slice(2))
  : { curatorFile: null, instagramFile: null, dryRun: false, output: null };
const DRY_RUN = CROSS_OPTIONS.dryRun;
const REQUESTED_OUTPUT_FILE = CROSS_OPTIONS.output;
const EXPLICIT_OUTPUT_FILE = resolveDryRunOutput(REQUESTED_OUTPUT_FILE, {
  dryRun: DRY_RUN,
  label: 'Cross-matcher output',
});

// Fonte unica: o curador ja possui a relacao site UFG → handle Instagram.
// O override de eventos nao corresponde a um site TIERS e permanece explicito.
const SITE_TO_IG = Object.freeze({
  ...Object.fromEntries(
    TIER_SOURCE_INVENTORY.sources
      .filter(source => source.instagramHandle)
      .map(source => [source.id, source.instagramHandle]),
  ),
  eventos: 'ufg_oficial',
});

function instagramHandleForSite(site) {
  const key = String(site || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SITE_TO_IG, key)
    ? SITE_TO_IG[key]
    : null;
}

function filterInstagramPostsForMatching(posts) {
  return (Array.isArray(posts) ? posts : []).filter(isInstagramPostReadyForCuration);
}

// ============================================================
// TEXT NORMALIZATION
// ============================================================

function normalizeText(t) {
  if (!t) return '';
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// FUZZY MATCHING
// ============================================================

function tokenize(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !['com', 'para', 'dos', 'das', 'uma', 'que', 'por', 'sao', 'nao', 'como', 'mas', 'seu', 'sua'].includes(w));
}

/**
 * Jaccard similarity between two token sets
 */
function jaccardSimilarity(tokens1, tokens2) {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

const GENERIC_ENTITIES = new Set([
  'ufg', 'universidade', 'federal', 'goias', 'brasil',
]);

const NON_CORROBORATING_TOKENS = new Set([
  'ufg', 'universidade', 'federal', 'goias', 'brasil',
  'instituto', 'faculdade', 'escola', 'centro', 'programa',
  'photo', 'image', 'poster', 'text', 'that', 'says', 'with',
]);

function meaningfulTokenOverlap(tokens1, tokens2) {
  const left = new Set(tokens1.filter(token => (
    !NON_CORROBORATING_TOKENS.has(token)
    && !/^\d+$/.test(token)
  )));
  const right = new Set(tokens2.filter(token => (
    !NON_CORROBORATING_TOKENS.has(token)
    && !/^\d+$/.test(token)
  )));
  return [...left].filter(token => right.has(token));
}

function dateProximityScore(siteDates, instagramDates) {
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  const left = [...new Set((siteDates || []).filter(validDate))];
  const right = [...new Set((instagramDates || []).filter(validDate))];
  if (left.length === 0 || right.length === 0) return 0;
  if (left.some(date => right.includes(date))) return 1;

  const nearby = left.some(siteDate => right.some(instagramDate => {
    const siteMs = Date.parse(`${siteDate}T12:00:00Z`);
    const instagramMs = Date.parse(`${instagramDate}T12:00:00Z`);
    return Number.isFinite(siteMs)
      && Number.isFinite(instagramMs)
      && Math.abs(siteMs - instagramMs) / 86400000 <= 3;
  }));
  return nearby ? 0.5 : 0;
}

/**
 * Find best IG match for a site item
 */
function findBestMatchByHandle(siteItem, igPosts, usedIpLinks = null) {
  // Fix C 2026-07-23: match por HANDLE eh mais confiavel que similaridade
  // de texto em captions de Instagram (emojis, hashtags, linguagem informal).
  // O run 13288c00 teve 0/53 matches com a heuristica antiga; com este match
  // por handle + corroboracao minima, espera-se 30+/53.
  // Fix T (2026-07-25): usedIpLinks filtra IG posts ja usados em matches
  // anteriores para evitar many-to-one. Ultimo recurso: sem usedIpLinks
  // (modo legado, usado por testes).
  if (!igPosts || !igPosts.length) return null;
  const expectedHandle = String(siteItem.instagramHandle || '').toLowerCase().replace(/^@/, '');
  if (!expectedHandle) return null;
  const candidates = igPosts.filter(ip => {
    const postHandle = String(ip.profile || ip.handle || '').toLowerCase().replace(/^@/, '');
    if (postHandle !== expectedHandle) return false;
    // Fix T: pula posts ja usados em matches anteriores
    if (usedIpLinks && usedIpLinks.has(ip.link)) return false;
    return true;
  });
  if (!candidates.length) return null;
  const siteTokens = tokenize((siteItem.title || '') + ' ' + (siteItem.text || '').slice(0, 300));
  // Ordena candidatos por data futura mais proxima (a mais relevante vem primeiro)
  // para que, em caso de empate, priorize o post mais contextual.
  candidates.sort((a, b) => {
    const aDate = (a.futureDates || [])[0] || '';
    const bDate = (b.futureDates || [])[0] || '';
    return aDate.localeCompare(bDate);
  });
  for (const ip of candidates) {
    const igTokens = tokenize((ip.title || '') + ' ' + (ip.text || '').slice(0, 300));
    const shared = meaningfulTokenOverlap(siteTokens, igTokens);
    const dateScore = dateProximityScore(siteItem.dates?.futureDates, ip.futureDates);
    // 3+ tokens compartilhados: certeza alta
    if (shared.length >= 3) {
      return { post: ip, score: 0.95, byHandle: true, sharedTokens: shared, dateScore };
    }
    // 2+ tokens compartilhados: match forte
    if (shared.length >= 2) {
      return { post: ip, score: 0.9, byHandle: true, sharedTokens: shared, dateScore };
    }
    // 1+ token + data proxima: match bom (item + data)
    if (shared.length >= 1 && dateScore > 0) {
      return { post: ip, score: 0.85, byHandle: true, sharedTokens: shared, dateScore };
    }
    // Data exata: match seguro (item == data)
    if (dateScore >= 1) {
      return { post: ip, score: 0.82, byHandle: true, sharedTokens: shared, dateScore };
    }
    // Apenas handle em comum: match fraco (score baixo)
    // NAO retorna — exigir pelo menos 1 token compartilhado significativo OU data exata
  }
  return null;
}

function findBestIgMatch(siteItem, igPosts, usedIpLinks = null) {
  // Fix C 2026-07-23: tenta match por HANDLE primeiro
  // Fix T (2026-07-25): usedIpLinks evita que 2+ posts UFG sobre o mesmo evento
  // peguem o MESMO IG post (cross-match many-to-one). Caso real 2026-07-24:
  // 3 posts IX SIPACV do @sipacv_ todos matcharam o mesmo IG post (mesma imagem
  // em 3 posts UFG). Agora cada IG post so pode ser usado uma vez.
  const handleMatch = findBestMatchByHandle(siteItem, igPosts, usedIpLinks);
  if (handleMatch) return handleMatch;

  if (!igPosts || !igPosts.length) return null;
  
  const siteTitle = siteItem.title || '';
  const siteText = siteItem.text || '';
  const siteTokens = tokenize(siteTitle + ' ' + siteText.slice(0, 300));
  
  // Also extract named entities (acronyms, numbers)
  const siteEntities = new Set();
  // Extract: "CAPES", "CNPq", "PPG", "PRONERA", "SEREX", etc.
  const acronyms = (siteTitle + ' ' + siteText).match(/[A-ZÀ-Ú]{3,}/g) || [];
  acronyms.forEach(a => {
    const entity = normalizeText(a);
    if (entity && !GENERIC_ENTITIES.has(entity)) siteEntities.add(entity);
  });
  // Extract: event numbers (XXIII, XVII, etc.)
  const romanNumerals = (siteTitle + ' ' + siteText).match(/\b[IVX]+\b/g) || [];
  romanNumerals.forEach(r => siteEntities.add(r.toLowerCase()));
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const ip of igPosts) {
    const igTitle = ip.title || '';
    const igText = ip.text || '';
    const igTokens = tokenize(igTitle + ' ' + igText.slice(0, 300));
    
    // Score 1: Jaccard on tokens
    const jaccard = jaccardSimilarity(siteTokens, igTokens);
    
    // Score 2: Named entity overlap
    let entityOverlap = 0;
    for (const entity of siteEntities) {
      if (normalizeText(igTitle + ' ' + igText).includes(entity)) {
        entityOverlap++;
      }
    }
    const entityScore = siteEntities.size > 0 ? entityOverlap / siteEntities.size : 0;
    
    // Score 3: proximidade entre datas do evento/prazo, nao a data de
    // publicacao do post no Instagram.
    const dateScore = dateProximityScore(
      siteItem.dates?.futureDates,
      ip.futureDates,
    );

    // O perfil mapeado ja compartilha termos institucionais por definicao.
    // Exigir evidencia tematica ou temporal impede que "UFG" sozinho valide
    // duas publicacoes sobre assuntos diferentes.
    const sharedMeaningfulTokens = meaningfulTokenOverlap(siteTokens, igTokens);
    const corroborated = sharedMeaningfulTokens.length >= 2 || dateScore > 0;
    
    // Combined score: 50% text + 30% entity + 20% date
    const combined = (jaccard * 0.5) + (entityScore * 0.3) + (dateScore * 0.2);
    
    if (corroborated && combined > bestScore && combined >= 0.30) {
      bestScore = combined;
      bestMatch = {
        post: ip,
        score: combined,
        jaccard,
        entityScore,
        dateScore,
        sharedMeaningfulTokens,
      };
    }
  }
  
  // HARDENING: Skip generic/low-quality IG posts
  if (bestMatch) {
    const igGeneric = normalizeText(bestMatch.post.title || '');
    const igTextNorm = normalizeText(bestMatch.post.text || '');
    const genericPatterns = [
      'fique por dentro', 'ultimas noticias', 'aconteceu na ufg',
      'photo by universidade federal', 'photo shared by universidade federal',
      'may be an image of text', 'may be an image of one',
    ];
    if (genericPatterns.some(p => igGeneric.includes(p) || igTextNorm.includes(p))) {
      // Check if it has a real caption beyond the generic one
      const realText = (bestMatch.post.text || '').replace(/Photo (by|shared by)[^.]+\.[^.]*/, '').trim();
      if (realText.length < 60) {
        return null; // No real content — just an auto-generated alt text
      }
    }
  }
  
  return bestMatch;
}

// ============================================================
// MAIN
// ============================================================

function validateInputArtifact(artifact, {
  kind,
  version,
  dateBrt = isoDateInTimeZone(),
  maxAgeMs,
  runId = null,
} = {}) {
  const issues = [];
  const contract = artifact?.artifactContract;
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { ok: false, issues: ['artifact_not_object'] };
  }
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return { ok: false, issues: ['artifact_contract_missing'] };
  }
  if (contract.schemaVersion !== 1) issues.push('artifact_schema_unsupported');
  if (contract.kind !== kind) issues.push('artifact_kind_mismatch');
  if (contract.version !== version) issues.push('artifact_version_mismatch');
  if (contract.dateBrt !== dateBrt) issues.push('artifact_brt_date_mismatch');
  if (runId !== null && contract.runId !== runId) issues.push('artifact_run_id_mismatch');
  const payload = { ...artifact };
  delete payload.artifactContract;
  const expectedHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (contract.contentSha256 !== expectedHash) issues.push('artifact_hash_mismatch');
  const generatedAtMs = Date.parse(contract.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.push('artifact_timestamp_invalid');
  else {
    if (generatedAtMs > Date.now() + 5 * 60 * 1000) issues.push('artifact_from_future');
    if (Number.isFinite(maxAgeMs) && Date.now() - generatedAtMs > maxAgeMs) issues.push('artifact_stale');
  }
  return { ok: issues.length === 0, issues, contract };
}

function main() {
  const cuFile = CROSS_OPTIONS.curatorFile;
  const igFile = CROSS_OPTIONS.instagramFile;
  
  console.log(`\n🔗 CROSS-MATCHER — Sites UFG ↔ Instagram`);
  console.log(`${'='.repeat(55)}`);
  console.log(`  Curador: ${path.basename(cuFile)}`);
  console.log(`  IG:      ${path.basename(igFile)}\n`);
  
  const curadoria = JSON.parse(fs.readFileSync(cuFile, 'utf8'));
  const ig = JSON.parse(fs.readFileSync(igFile, 'utf8'));
  const curatorValidation = validateInputArtifact(curadoria, {
    kind: 'truly-new',
    version: '4.4',
    maxAgeMs: 25 * 60 * 60 * 1000,
  });
  if (!curatorValidation.ok) {
    throw new Error(`curadoria inválida: ${curatorValidation.issues.join(', ')}`);
  }
  const igValidation = validateInputArtifact(ig, {
    kind: 'instagram-scan',
    version: '1.2.0',
    maxAgeMs: 60 * 60 * 1000,
    runId: curatorValidation.contract.runId,
  });
  if (!igValidation.ok) {
    throw new Error(`Instagram inválido: ${igValidation.issues.join(', ')}`);
  }
  
  // Build IG index by handle
  const igByHandle = {};
  for (const r of (ig.results || [])) {
    igByHandle[r.handle] = filterInstagramPostsForMatching(r.posts);
  }
  
  const publishable = curadoria.publishable || [];
  const enriched = [];
  let matched = 0;

  // Fix T (2026-07-25): track IG posts ja usados em matches anteriores.
  // Cada IG post pode ser usado uma vez so, para evitar many-to-one matching
  // onde 2+ posts UFG sobre o mesmo evento pegam o mesmo IG post.
  const usedIpLinks = new Set();

  console.log(`🔍 Analisando ${publishable.length} itens publicáveis...\n`);

  for (const item of publishable) {
    const site = item.site || 'ufg';
    const igHandle = instagramHandleForSite(site);
    const igPosts = igHandle ? (igByHandle[igHandle] || []) : [];

    const match = findBestIgMatch(item, igPosts, usedIpLinks);

    const title = (item.title || '').slice(0, 70);

    // Skip showing no-match for handles with 0 posts (dead profiles)
    const showNoMatch = matched < 8 && igPosts.length > 0;

    if (match && match.score >= 0.30) {
      matched++;
      // Fix T: marca o IG post como usado para que proximos matches
      // (sobre o mesmo evento) prefiram outros IG posts.
      if (match.post && match.post.link) {
        usedIpLinks.add(match.post.link);
      }
      const ip = match.post;
      
      console.log(`🔗 [${(match.score * 100).toFixed(0)}%] ${title}`);
      console.log(`    📸 IG @${igHandle}: ${(ip.title || '').slice(0, 80)}`);
      console.log(`    🖼️  ${ip.image?.slice(0, 80) || 'sem imagem'}`);
      
      // Enrich item
      enriched.push({
        ...item,
        igMatch: {
          handle: igHandle,
          postUrl: ip.link,
          caption: ip.text,
          image: ip.image,
          date: ip.date,
          score: match.score,
        },
        enrichmentSources: [
          ...(item.enrichmentSources || []),
          { url: ip.link, label: `Instagram @${igHandle}`, type: 'instagram' },
        ],
        // Use IG image as gallery supplement
        galleryImages: [
          ...(item.images || []).filter(Boolean),
          ip.image || '',
        ].filter(Boolean).slice(0, 5),
      });
    } else {
      if (showNoMatch) {
        console.log(`❌ ${title}`);
        console.log(`    IG @${igHandle || 'N/A'}: sem match (${igPosts.length} posts, best: ${match?.score?.toFixed(3) || '0.000'})`);
      }
      enriched.push(item);
    }
  }
  
  // Summary
  const matchRate = publishable.length > 0 ? ((matched / publishable.length) * 100).toFixed(1) : 0;
  console.log(`\n${'='.repeat(55)}`);
  console.log(`📊 RESULTADO:`);
  console.log(`  Com match IG: ${matched}/${publishable.length} (${matchRate}%)`);
  console.log(`  Sem match:    ${publishable.length - matched}`);
  
  const output = {
    ...curadoria,
    publishable: enriched,
    crossMatch: {
      source: path.basename(igFile),
      matched,
      total: publishable.length,
      matchRate: parseFloat(matchRate),
      timestamp: new Date().toISOString(),
    },
  };
  delete output.artifactContract;
  output.artifactContract = {
    schemaVersion: 1,
    kind: 'cross-match',
    version: '1.0.0',
    mode: curatorValidation.contract.mode,
    runId: curatorValidation.contract.runId,
    dateBrt: curatorValidation.contract.dateBrt,
    generatedAt: output.crossMatch.timestamp,
    curatorContentSha256: curatorValidation.contract.contentSha256,
    instagramContentSha256: igValidation.contract.contentSha256,
    contentSha256: crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex'),
  };

  // Dry-run may only emit a confined, ephemeral artifact. Without an
  // explicit destination it remains completely write-free.
  if (!DRY_RUN || EXPLICIT_OUTPUT_FILE) {
    const outFile = EXPLICIT_OUTPUT_FILE
      || path.join(CU_DIR, `curadoria-enriquecida-${isoDateInTimeZone()}.json`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    writeJsonAtomic(outFile, output);
    console.log(`\n📁 ${outFile}${DRY_RUN ? ' (efêmero)' : ''}`);
  } else {
    console.log('\n🏷️  DRY-RUN — artefato enriquecido canônico não foi gravado');
  }
  
  return { matched, total: publishable.length, matchRate: parseFloat(matchRate), enriched };
}

if (require.main === module) main();

module.exports = {
  dateProximityScore,
  filterInstagramPostsForMatching,
  findBestIgMatch,
  findBestMatchByHandle,
  instagramHandleForSite,
  isoDateInTimeZone,
  jaccardSimilarity,
  parseCrossMatcherArgs,
  validateInputArtifact,
};
