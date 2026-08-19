#!/usr/bin/env node
/**
 * enrich-duplicates.js — Enriquecer posts existentes com informações de itens duplicados
 * 
 * Problema resolvido: quando o curador detecta que uma notícia é duplicata de um post
 * já publicado, as informações novas (prazo prorrogado, novo link, etc.) são perdidas.
 * 
 * Este script:
 *   1. Lê o relatório do curador e pega itens marcados como duplicate=true
 *   2. Para cada item duplicado, encontra o post correspondente no Supabase
 *   3. Se o item duplicado tem informações MAIS RECENTES (data de atualização),
 *      atualiza a descrição, metadata e imagens do post existente
 * 
 * Uso:
 *   node scripts/enrich-duplicates.js [report_file.json]
 *   node scripts/enrich-duplicates.js --dry-run
 */

'use strict';

const { signInWithRetry, signOutCurrentSession } = require('./auth-retry');
const { appendPostMediaIfAbsent } = require('./post-media-append');
const fs = require('fs');
const path = require('path');
const {
  URL_IDENTITY_VERSION,
  canonicalUrl,
  canonicalUrlDetails,
} = require('./lib/canonical-url.js');

const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';
const BASE_DIR = '/data/.openclaw/workspace/data/ufg-scrape';
const IG_DIR = '/data/.openclaw/workspace/data/ufg-instagram';
let activeAuthClient = null;

const env = {};
function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([^=#]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
}
[
  '/data/.openclaw/workspace/kino-campus/services/cadu-ufg-publisher/.env.local',
].forEach(loadEnvFile);
const ANON_KEY = process.env.CADU_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  || process.env.KINOCAMPUS_SUPABASE_ANON_KEY
  || env.CADU_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  || env.KINOCAMPUS_SUPABASE_ANON_KEY;

function parseDuplicateArgs(argv) {
  let dryRun = false;
  let reportFile = null;
  for (const arg of argv) {
    if (arg === '--dry-run') {
      if (dryRun) throw new Error('argumento duplicado: --dry-run');
      dryRun = true;
    } else if (!arg.startsWith('--') && arg.endsWith('.json')) {
      if (reportFile) throw new Error('informe exatamente um relatório JSON');
      reportFile = arg;
    } else {
      throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  if (!reportFile) {
    throw new Error('relatório explícito obrigatório; fallback para curadoria antiga foi desativado');
  }
  return { dryRun, reportFile };
}

const DUPLICATE_OPTIONS = require.main === module
  ? parseDuplicateArgs(process.argv.slice(2))
  : { dryRun: false, reportFile: null };
const IDENTITY_BLOCK_MARKER = '__CADU_DUPLICATE_IDENTITY_BLOCK__';

/**
 * Normaliza texto para comparação (remove acentos, lowercase, trim)
 */
function normalize(t) {
  if (!t) return '';
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Encontra o post mais similar no Supabase para um item duplicado
 */
// ============================================================
// v5.2 (2026-06-10): findMatchingPost com heurística apertada
// Bug fix: falsos matches por overlap genérico de palavras.
// Estratégia em 3 níveis (do mais forte ao mais fraco):
//   1. URL canônica (host+path) — quase 100% seguro
//   2. Match exato de TÍTULO (após normalize) — seguro
//   3. Match combinado: 5+ palavras significativas + 1+ sigla de programa em comum
// Se nenhum dos 3 bater, retorna null (NÃO chutar)
// ============================================================

// Siglas de programas UFG (3+ chars) que distinguem editais
const PROGRAM_KEYWORDS = [
  'piemp', 'prpi', 'prpg', 'prograd', 'proex', 'proec', 'prae', 'sri', 'ciar',
  'ppgcf', 'ppgcb', 'ppgq', 'ppgmec', 'ppgeas', 'ppgecoevol', 'ppgmp', 'ppgemp',
  'ppggmp', 'ppgsau', 'ppgia', 'ppggecon', 'ppggmp',
  'pronera', 'probic', 'prolicen', 'probec', 'pip', 'conpeex', 'serex', 'semic',
  'enade', 'pibid', 'pet', 'casle', 'oeu', 'isF', 'isf', 'conic', 'sbie',
  'cepeg', 'cce', 'cei', 'ceua', 'cepe', 'conpeex', 'finep', 'capes', 'cnpq',
  'fapeg', 'daad', 'fulbright', 'augm', 'pila', 'marca', 'brafagri', 'rondon',
  'wIdaT', 'widat', 'conpeex', 'siapro', 'papi', 'semaec',
  // Programas e eventos especificos
  'serhs', 'simpem', 'enepe', 'siint', 'cblc', 'sbg', 'siicusp', 'sifsc',
  // Numero de editais
  'edital', 'edital n', 'editais',
];

// Stopwords (palavras comuns que NAO devem contar como match)
const STOPWORDS_OVERLAP = new Set([
  'para', 'pode', 'pela', 'este', 'esta', 'isso', 'aqui', 'sobre', 'entre',
  'onde', 'quando', 'sobre', 'todos', 'todas', 'outros', 'outras', 'apenas',
  'a partir', 'alunos', 'aluno', 'estudantes', 'estudante', 'comunidade',
  'universitaria', 'universitario', 'universidade', 'federal', 'goias',
  'goiania', 'campus', 'edital', 'editais', 'processo', 'seletivo', 'selecao',
  'inscricoes', 'inscricao', 'inscric', 'abertas', 'aberta', 'publico',
  'prazos', 'prazo', 'publicado', 'publica', 'proex', 'ufg', 'reitoria',
  'prograd', 'prae', 'resultado', 'resultados', 'preliminar', 'final', 'parcial',
  'divulgado', 'divulgada', 'processo', 'seletivo', 'edital', 'conteudo',
  'programa', 'projeto', 'acao', 'acoes', 'bolsas', 'bolsa', 'vagas', 'vaga',
]);

function extractKeywords(text) {
  if (!text) return { words: new Set(), programs: new Set() };
  const norm = normalize(text);
  const allWords = norm.split(' ').filter(w => w.length > 2);
  // Remove stopwords
  const words = new Set();
  for (const w of allWords) {
    if (STOPWORDS_OVERLAP.has(w)) continue;
    if (w.length <= 2) continue;
    words.add(w);
  }
  // Detecta siglas de programa (case-insensitive)
  const programs = new Set();
  const lower = text.toLowerCase();
  for (const p of PROGRAM_KEYWORDS) {
    if (lower.includes(p)) programs.add(p);
  }
  return { words, programs };
}

// Cache de posts publicados (carregado 1x por run)
let _postsCache = null;
let _postsCacheTime = 0;
function resetPublishedPostsCacheForTests() {
  _postsCache = null;
  _postsCacheTime = 0;
}

async function getPublishedPosts(supabase) {
  const CACHE_TTL_MS = 60000; // 1 minuto
  if (_postsCache && Date.now() - _postsCacheTime < CACHE_TTL_MS) {
    return _postsCache;
  }
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const all = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const { data, error } = await supabase
      .from('posts')
      .select('id, title, description, metadata, image_url, created_at')
      .eq('status', 'published')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`published posts query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
    if (offset > 2000) break; // safety
  }
  // Pré-computa campos para cada post
  for (const p of all) {
    p._sourceUrl = postSourceUrl(p);
    p._canonicalDetails = canonicalUrlDetails(p._sourceUrl);
    p._canonical = p._canonicalDetails.key;
    p._titleNorm = normalize(p.title);
    // v5.3: separa keywords do TÍTULO (usado para overlap) vs full (programas)
    p._titleKeywords = extractKeywords(p.title).words;
    const k = extractKeywords(p.title + ' ' + (p.description || '').slice(0, 500));
    p._keywords = k.words;
    p._programs = k.programs;
  }
  _postsCache = all;
  _postsCacheTime = Date.now();
  return all;
}

function itemSourceUrl(item) {
  return String(item?.sourceUrl || item?.url || item?.link || '').trim();
}

function postSourceUrl(post) {
  return String(
    post?.metadata?.source_url
      || post?.metadata?.sourceUrl
      || post?.metadata?.link
      || post?._sourceUrl
      || '',
  ).trim();
}

function matchResult(post, method) {
  return {
    post,
    evidence: {
      method,
      identityVersion: URL_IDENTITY_VERSION,
      itemIndependentRevalidationRequired: true,
    },
  };
}

function normalizeMatchResult(value) {
  if (!value) return null;
  if (value.post && typeof value.post === 'object') {
    return {
      post: value.post,
      evidence: value.evidence && typeof value.evidence === 'object'
        ? value.evidence
        : { method: 'unknown' },
    };
  }
  // Compatibility for injected/test matchers. It is deliberately not trusted:
  // corroborateMutationIdentity recomputes every signal from item + post.
  return { post: value, evidence: { method: 'injected' } };
}

function sharedWordCount(leftWords, rightWords) {
  let count = 0;
  for (const word of leftWords) if (rightWords.has(word)) count++;
  return count;
}

/**
 * Recompute identity evidence immediately before any write.
 *
 * A heuristic candidate is never enough by itself. Strong canonical identity
 * wins; exact-title fallback additionally requires the same authority; the
 * loose title/program fallback requires an explicit matching edital number.
 */
function corroborateMutationIdentity(item, post, evidence = {}) {
  if (!post || typeof post !== 'object' || !String(post.id || '').trim()) {
    return { ok: false, reason: 'post_identity_missing' };
  }

  const itemDetails = canonicalUrlDetails(itemSourceUrl(item));
  const postDetails = canonicalUrlDetails(postSourceUrl(post));
  const itemTitle = normalize(item?.title);
  const postTitle = normalize(post?.title);
  const sameHost = itemDetails.valid && postDetails.valid && itemDetails.host === postDetails.host;

  if (itemDetails.valid && postDetails.valid && itemDetails.key === postDetails.key) {
    return {
      ok: true,
      reason: 'canonical_identity',
      method: 'canonical_url',
      identityVersion: URL_IDENTITY_VERSION,
      canonicalKey: itemDetails.key,
    };
  }

  // A known Weby event ID is authoritative. Never let a title heuristic
  // override two distinct IDs from the same event catalogue.
  if (
    itemDetails.kind === 'weby-event'
    && postDetails.kind === 'weby-event'
    && itemDetails.key !== postDetails.key
  ) {
    return {
      ok: false,
      reason: 'weby_event_id_conflict',
      identityVersion: URL_IDENTITY_VERSION,
    };
  }

  // Different semantic query identities on the same endpoint are also a hard
  // conflict (tracking-only parameters were removed by the canonicalizer).
  if (
    sameHost
    && itemDetails.path === postDetails.path
    && itemDetails.key !== postDetails.key
    && (itemDetails.key.includes('?') || postDetails.key.includes('?'))
  ) {
    return {
      ok: false,
      reason: 'semantic_query_conflict',
      identityVersion: URL_IDENTITY_VERSION,
    };
  }

  const itemEdital = extractEditalNumber(item?.title);
  const postEdital = extractEditalNumber(post?.title);
  const itemUnit = extractUnitFromTitle(item?.title);
  const postUnit = extractUnitFromTitle(post?.title);
  const editalCompatible = !(itemEdital || postEdital) || itemEdital === postEdital;
  const unitCompatible = !(itemUnit && postUnit) || itemUnit === postUnit;

  if (
    sameHost
    && itemTitle.length > 10
    && itemTitle === postTitle
    && editalCompatible
    && unitCompatible
  ) {
    return {
      ok: true,
      reason: 'exact_title_same_authority',
      method: 'exact_title',
      identityVersion: URL_IDENTITY_VERSION,
    };
  }

  if (evidence.method === 'title_program' && sameHost && itemEdital && itemEdital === postEdital) {
    const itemKeywords = extractKeywords(item?.title);
    const postKeywords = extractKeywords(post?.title);
    if (
      sharedWordCount(itemKeywords.words, postKeywords.words) >= 4
      && hasSpecificProgramMatch(itemKeywords.programs, postKeywords.programs)
      && unitCompatible
    ) {
      return {
        ok: true,
        reason: 'title_program_same_edital_authority',
        method: 'title_program',
        identityVersion: URL_IDENTITY_VERSION,
      };
    }
  }

  return {
    ok: false,
    reason: 'independent_identity_not_corroborated',
    identityVersion: URL_IDENTITY_VERSION,
  };
}

async function findMatchingPost(supabase, item) {
  const sourceUrl = itemSourceUrl(item);
  const itemCanonical = canonicalUrl(sourceUrl);
  const itemKw = extractKeywords(item.title + ' ' + (item.text || '').slice(0, 500));

  const posts = await getPublishedPosts(supabase);
  if (!posts.length) return null;

  // === ESTRATÉGIA 1: URL canônica (host+path) ===
  if (itemCanonical) {
    for (const p of posts) {
      if (p._canonical && p._canonical === itemCanonical) {
        return matchResult(p, 'canonical_url');
      }
    }
  }

  // === ESTRATÉGIA 2: Match exato de TÍTULO normalizado ===
  const itemTitleNorm = normalize(item.title);
  let unsafeCandidate = null;
  for (const p of posts) {
    if (p._titleNorm === itemTitleNorm && p._titleNorm.length > 10) {
      const candidate = matchResult(p, 'exact_title');
      if (corroborateMutationIdentity(item, p, candidate.evidence).ok) return candidate;
      unsafeCandidate ||= candidate;
    }
  }

  // === ESTRATÉGIA 3: Match combinado (SÓ títulos) ===
  // v5.4 (2026-06-10): Bug fix v5.3 — ainda passa falsos matches como
  //   "SRI Nº 04/2026" vs "SRI Nº 07/2026" (mesmo template, nº diferente)
  //   "PROEC Nº05/2026" vs "PROBEC 2026/2027" (siglas parciais em comum)
  // Nova regra: se AMBOS têm número de edital, devem ser iguais.
  // Se só um tem, exigir overlap de PROGRAMA mais raro (não 'sri'/'proec' genéricos).
  const itemTitleKw = extractKeywords(item.title);
  const itemUnit = extractUnitFromTitle(item.title);
  const itemEditalNum = extractEditalNumber(item.title);
  for (const p of posts) {
    // Calcula interseção de palavras significativas DO TÍTULO
    let inter = 0;
    for (const w of itemTitleKw.words) {
      if (p._titleKeywords && p._titleKeywords.has(w)) inter++;
    }
    if (inter < 4) continue; // Pouca similaridade

    // Exige match de pelo menos 1 sigla de programa (de title+text)
    let programMatch = false;
    for (const prog of itemKw.programs) {
      if (p._programs.has(prog)) { programMatch = true; break; }
    }
    if (itemKw.programs.size > 0 && !programMatch) continue; // Sem sigla em comum

    // v5.4: Se ambos têm número de edital, devem ser iguais
    const postEditalNum = extractEditalNumber(p.title);
    if (itemEditalNum && postEditalNum && itemEditalNum !== postEditalNum) {
      continue; // Editais diferentes (Nº 04/2026 vs Nº 07/2026)
    }

    // v5.4: Se um tem número e outro não, exigir programa mais específico
    if (itemEditalNum && !postEditalNum) {
      // Item tem edital, post não. Exige match de sigla ESPECÍFICA (não genérica)
      if (!hasSpecificProgramMatch(itemKw.programs, p._programs)) continue;
    }

    // Se temos unidades, devem ser iguais (penaliza match cross-unidade)
    const postUnit = extractUnitFromTitle(p.title);
    if (itemUnit && postUnit && itemUnit !== postUnit) {
      continue;
    }

    const candidate = matchResult(p, 'title_program');
    if (corroborateMutationIdentity(item, p, candidate.evidence).ok) return candidate;
    unsafeCandidate ||= candidate;
  }

  // Preserve an unsafe candidate only as diagnostic evidence. Both mutation
  // functions independently reject it and the CLI exits non-zero.
  return unsafeCandidate;
}

// v5.2: Extrai sigla de unidade a partir do título (INF, FAV, EMC, etc)
const UNIT_SIGLAS_FOR_MATCH = new Set([
  'ime', 'inf', 'ib', 'icb', 'fanut', 'facomb', 'fav', 'fen', 'fgg', 'emac', 'emcs',
  'fefd', 'eseffego', 'fo', 'fd', 'fm', 'iptsp', 'iesa', 'cegraf', 'ccom', 'em',
  'fe', 'ff', 'fev', 'fch', 'fl', 'famed', 'eeca', 'esuc', 'evz', 'evea', 'ime',
  'prpi', 'prpg', 'prograd', 'proex', 'proec', 'prae', 'sri', 'ciar', 'cei', 'face',
  'agro', 'evz', 'emc', 'eme', 'ime', 'eeca', 'ecl', 'ecc', 'eec', 'eeec',
]);
function extractUnitFromTitle(title) {
  if (!title) return null;
  const lower = title.toLowerCase();
  // Match sigla de unidade em CAIXA ALTA
  const upperMatch = title.match(/\b([A-Z]{2,6})\b/g);
  if (upperMatch) {
    for (const m of upperMatch) {
      if (UNIT_SIGLAS_FOR_MATCH.has(m.toLowerCase())) return m.toUpperCase();
    }
  }
  // Fallback: match no lowercase
  for (const u of UNIT_SIGLAS_FOR_MATCH) {
    const re = new RegExp(`\\b${u}\\b`, 'i');
    if (re.test(title)) return u.toUpperCase();
  }
  return null;
}

// v5.4: Extrai número de edital do título (ex: "Nº 04/2026", "nº 13/2026", "Edital 07/2026")
// Retorna string normalizada "04/2026" ou null
function extractEditalNumber(title) {
  if (!title) return null;
  // Padrão: Nº X/YYYY ou N. X/YYYY ou Edital X/YYYY (com ou sem 'Nº')
  // Aceita separadores: /, /, -, /
  const m = title.match(/(?:n[ºo°]|n\.?|edital)\s*(\d+)\s*[\/⁄\-\\]\s*(\d{2,4})/i);
  if (m) {
    return `${m[1]}/${m[2]}`;
  }
  // Padrão alternativo: EDITAL nº X (sem ano)
  const m2 = title.match(/(?:n[ºo°])\s*(\d{2,4})/i);
  if (m2) {
    return m2[1];
  }
  return null;
}

// v5.4: Programas ESPECÍFICOS (não genéricos como sri, proex, cei, face)
// Estes são os que distinguem editais diferentes
const SPECIFIC_PROGRAMS = new Set([
  'piemp', 'pip', 'probic', 'prolicen', 'probec', 'pibid', 'pet', 'casle', 'oeu',
  'conpeex', 'serex', 'enade', 'conic', 'sbie', 'finep', 'capes', 'cnpq', 'fapeg',
  'daad', 'fulbright', 'augm', 'pila', 'marca', 'brafagri', 'rondon', 'widat',
  'siapro', 'papi', 'semaec', 'nepih', 'jornal', 'siint', 'cblc', 'sbg', 'siicusp',
  'sifsc', 'serhs', 'simpem', 'enepe',
  // Programas de pós (siglas completas)
  'ppgcf', 'ppgcb', 'ppgq', 'ppgmec', 'ppgeas', 'ppgecoevol', 'ppgmp', 'ppgemp',
  'ppggmp', 'ppgsau', 'ppgia', 'ppggecon', 'ppgri', 'ppgav', 'ppgmus', 'ppgmc',
  'ppgpsi', 'ppgfar', 'ppgodont',
  // Outros editais conhecidos
  'prpi', 'prpg', 'pronera', 'cepeg', 'cepe', 'cei', 'ceua',
]);
function hasSpecificProgramMatch(progsA, progsB) {
  for (const p of progsA) {
    if (progsB.has(p) && SPECIFIC_PROGRAMS.has(p)) return true;
  }
  return false;
}

/**
 * Extrai texto legível de uma página HTML (para descrição)
 * S37 fix: substituído execSync+curl por fetch nativo (command injection risk)
 */
async function fetchPageText(url) {
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; KinoCadu/1.0)' },
      redirect: 'follow'
    });
    clearTimeout(timeout);
    if (!resp.ok) return '';
    return await resp.text();
  } catch (e) { return ''; }
}

/**
 * Extrai imagens de conteúdo de HTML
 * v4.3 (2026-06-08): Adicionado filtro de logos de programas/bolsas
 */
function extractContentImages(html) {
  if (!html) return [];
  
  const LOGO_FILENAMES = new Set(['ufg-v2.png', 'em_ufg.png', 'em-v6.png']);
  const LOGO_PATTERNS = [/logo/i, /shortcut/i, /marca-ai/i, /\bicon\b/i, /\bicon[-_]/i,
    /\binstagram\b/i, /\bfacebook\b/i, /\byoutube\b/i, /\blinkedin\b/i, /\btiktok\b/i,
    /\btwitter\b/i, /weby-shortcut/i, /icon-icons/i,
    /ppg[a-z]+\.png/i, // ppgcf.png, ppgcb.png, ppgq.png etc
    /^[a-z]{2,6}\.png$/i, // nomes curtos sem path (daad.png, capes.png, cnpq.png)
  ];
  const UNIT_LOGOS = [/\/i\/[^/]+\.(png|jpg)/i, /ufg-v\d/i];
  const SOCIAL_ICON_FILENAMES = new Set(['instagram.png', 'youtube_icon-icons.com_65537.png']);
  // v4.3: Logos especificos de programas/bolsas
  const PROGRAM_LOGO_NAMES = new Set([
    'ppgcf.png', 'ppgcb.png', 'ppgq.png', 'ppgmec.png', 'ppgeas.png', 'ppgecoevol.png',
    'ppgmp.png', 'ppgemp.png', 'ppggmp.png', 'ppgsau.png', 'ppgia.png',
    'daad.png', 'capes.png', 'cnpq.png', 'fapeg.png',
    'fesag.png', 'verbena.png', 'ufg-v2.png', 'ufg.png', 'ufg-v3.png', 'ufg-v4.png', 'ufg-v5.png',
  ]);
  
  const allImages = [];
  const seen = new Set();
  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
  let m;
  
  while ((m = imgRegex.exec(html)) !== null) {
    let src = m[1];
    if (src.startsWith('//')) src = 'https:' + src;
    if (seen.has(src)) continue;
    seen.add(src);
    allImages.push(src);
  }
  
  return allImages.filter(img => {
    const fn = img.split('/').pop()?.split('?')[0]?.toLowerCase() || '';
    if (LOGO_FILENAMES.has(fn)) return false;
    if (SOCIAL_ICON_FILENAMES.has(fn)) return false;
    if (PROGRAM_LOGO_NAMES.has(fn)) return false; // v4.3
    for (const pat of LOGO_PATTERNS) { if (pat.test(fn)) return false; }
    for (const pat of UNIT_LOGOS) { if (pat.test(img)) return false; }
    if (/\.svg($|[?#])/i.test(fn)) return false;
    if (!/\.(jpg|jpeg|png|webp)($|[?#])/i.test(fn)) return false;
    return true;
  }).slice(0, 10);
}

/**
 * Verifica se deve atualizar o post: item mais recente que o post?
 */
function shouldUpdate(item, existingPost) {
  // Se o item não tem data, não atualizar
  if (!item.dates?.webyDate && !item.dates?.latestDate) return false;
  
  const itemDate = item.dates?.webyDate || item.dates?.latestDate;
  const postDate = existingPost.created_at?.slice(0, 10);
  
  // Se o item é mais recente que o post, deve atualizar
  if (itemDate && postDate && itemDate > postDate) return true;
  
  // Se o item duplicado tem score >= 0.70 (alta relevância), considerar atualização
  if (item.score >= 0.70) return true;
  
  return false;
}

function normalizedHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!/^https?:$/.test(parsed.protocol)) return '';
    parsed.hash = '';
    return parsed.href;
  } catch (_) {
    return '';
  }
}

function selectNewMediaUrls(existingUrls, candidateUrls) {
  const known = new Set((Array.isArray(existingUrls) ? existingUrls : [])
    .map(normalizedHttpUrl)
    .filter(Boolean));
  const selected = [];
  for (const value of Array.isArray(candidateUrls) ? candidateUrls : []) {
    const url = normalizedHttpUrl(value);
    if (!url || known.has(url)) continue;
    known.add(url);
    selected.push(url);
  }
  return selected;
}

function mergeEnrichmentSources(existingSources, sourceUrl, updatedAt = new Date().toISOString()) {
  const incomingUrl = normalizedHttpUrl(sourceUrl);
  const incoming = incomingUrl
    ? [{ url: incomingUrl, label: `AtualizaÃ§Ã£o ${updatedAt.slice(0, 10)}`, type: 'update' }]
    : [];
  const priorities = { official: 4, event: 3, source: 3, update: 1 };
  const byUrl = new Map();
  const originalLength = Array.isArray(existingSources) ? existingSources.length : 0;

  [...(Array.isArray(existingSources) ? existingSources : []), ...incoming]
    .forEach((entry, index) => {
      const source = typeof entry === 'string' ? { url: entry } : (entry || {});
      const url = normalizedHttpUrl(source.url || source.value);
      if (!url) return;
      const type = String(source.type || 'source').trim().toLowerCase();
      const normalized = {
        ...source,
        url,
        type,
        _priority: priorities[type] || 2,
        _order: index,
        _incoming: index >= originalLength,
      };
      const current = byUrl.get(url);
      if (!current
          || normalized._priority > current._priority
          || (normalized._priority === current._priority && normalized._incoming)) {
        byUrl.set(url, normalized);
      }
    });

  return [...byUrl.values()]
    .sort((left, right) => right._priority - left._priority
      || Number(right._incoming) - Number(left._incoming)
      || left._order - right._order)
    .slice(0, 24)
    .map(({ _priority, _order, _incoming, ...source }) => source);
}

async function enrichDuplicate(supabase, item, options = {}) {
  const { dryRun = false, findMatchingPostFn = findMatchingPost } = options;
  
  console.log(`\n🔍 Item duplicado: ${item.title?.slice(0, 80)}`);
  console.log(`   Score: ${item.score} | Site: ${item.site}`);
  
  // Find matching post
  const match = normalizeMatchResult(await findMatchingPostFn(supabase, item));
  
  if (!match) {
    console.log(`   ⚠️ Nenhum post correspondente encontrado`);
    return { title: item.title, matched: false, updated: false, reason: 'NO_MATCH' };
  }
  const existingPost = match.post;
  const identity = corroborateMutationIdentity(item, existingPost, match.evidence);
  if (!identity.ok) {
    console.log(`   🛑 Candidato bloqueado: identidade não corroborada (${identity.reason})`);
    // Fix Z (2026-07-25): em vez de só logar, marcar o post existente com
    // metadata.flag_duplicate_blocked para que o autor possa revisar no Supabase.
    // ANTES: 9 blocked do run 58267b6c viraram "pendentes" sem ação - o
    // post existente não era flagado e o item blocked ficava no limbo.
    // DEPOIS: post existente recebe flag em metadata + retorna action: 'skip_publish'
    //         no report (pipeline nao publica o item blocked).
    if (!dryRun) {
      try {
        const currentMeta = existingPost.metadata || {};
        const newFlags = [
          ...(currentMeta.flags || []),
          {
            type: 'duplicate_blocked',
            reason: identity.reason,
            blockedItemTitle: item.title?.slice(0, 100),
            blockedItemUrl: itemSourceUrl(item)?.slice(0, 200),
            blockedItemSite: item.site,
            flaggedAt: new Date().toISOString(),
          },
        ];
        const { error: flagErr } = await supabase
          .from('posts')
          .update({ metadata: { ...currentMeta, flags: newFlags } })
          .eq('id', existingPost.id);
        if (flagErr) {
          console.log(`   ⚠️ flag_duplicate_blocked falhou: ${flagErr.message}`);
        } else {
          console.log(`   🏷️  post existente flagado: duplicate_blocked (${identity.reason})`);
        }
      } catch (e) {
        console.log(`   ⚠️ flag exception: ${e.message}`);
      }
    } else {
      console.log(`   🏷️  [DRY-RUN] nao flagou post existente`);
    }
    return {
      title: item.title,
      matched: true,
      updated: false,
      blocked: true,
      action: 'skip_publish',  // pipeline ignora esse item
      reason: 'IDENTITY_NOT_CORROBORATED',
      identityReason: identity.reason,
      postId: existingPost.id,
    };
  }
  
  console.log(`   🎯 Match: ${existingPost.title?.slice(0, 60)} (${existingPost.id})`);
  console.log(`   🔐 Identidade: ${identity.reason} (${identity.identityVersion})`);
  console.log(`   Post criado: ${existingPost.created_at}`);
  
  // Check if update is warranted
  if (!shouldUpdate(item, existingPost)) {
    console.log(`   ⏭️ Item não é mais recente/não justifica atualização`);
    return { title: item.title, matched: true, updated: false, reason: 'NOT_NEWER' };
  }
  
  console.log(`   📝 Atualização justificada — item mais recente`);
  
  if (dryRun) {
    console.log(`   🏷️ DRY-RUN — não aplicando mudanças`);
    return { title: item.title, matched: true, updated: true, dryRun: true };
  }
  
  // Fetch source page for images
  const sourceUrl = itemSourceUrl(item);
  const updates = {};
  
  if (sourceUrl) {
    const html = await fetchPageText(sourceUrl);
    if (html) {
      let newImages = extractContentImages(html);
      // v4.3 (2026-06-08): Filtro de TAMANHO MINIMO via HEAD (rejeita logos < 20KB)
      const MIN_SIZE_BYTES = 20000;
      const sizeFiltered = [];
      for (const imgUrl of newImages) {
        try {
          const headRes = await fetch(imgUrl, { method: 'HEAD' });
          const size = parseInt(headRes.headers.get('content-length') || '0', 10);
          if (size >= MIN_SIZE_BYTES) sizeFiltered.push(imgUrl);
          else console.log(`   ⏭️ img pequena demais (${size} bytes): ${imgUrl.slice(0, 60)}`);
        } catch (e) {
          sizeFiltered.push(imgUrl); // mantem se HEAD falhar
        }
      }
      newImages = sizeFiltered;
      
      if (newImages.length > 0) {
        console.log(`   🖼️ ${newImages.length} imagens (após filtro de tamanho)`);
        
        const { data: existingMedia, error: mediaReadError } = await supabase
          .from('post_media')
          .select('url')
          .eq('post_id', existingPost.id);
        if (mediaReadError) {
          throw new Error(`post_media read failed: ${mediaReadError.message}`);
        }
        newImages = selectNewMediaUrls(
          (existingMedia || []).map(media => media.url),
          newImages,
        );

        // Add only URLs that are not already attached to this post. The upsert
        // also closes a concurrent enricher race after the read above.
        const appended = await appendPostMediaIfAbsent(
          supabase,
          existingPost.id,
          newImages.slice(0, 4),
        );
        appended.inserted.forEach(media => {
          console.log(`   ✅ img: ${String(media.url || '').slice(0, 70)}...`);
        });
      }
    }
  }
  
  // Update enrichment sources in metadata
  const currentMeta = existingPost.metadata || {};
  const newSources = [
    ...(currentMeta.enrichment_sources || []),
    { url: sourceUrl, label: `Atualização ${new Date().toISOString().slice(0, 10)}`, type: 'update' },
  ];
  const compactSources = mergeEnrichmentSources(newSources, sourceUrl);
  
  const { error: patchErr } = await supabase
    .from('posts')
    .update({
      metadata: { ...currentMeta, enrichment_sources: compactSources },
    })
    .eq('id', existingPost.id);
  
  if (patchErr) {
    throw new Error(`metadata update failed: ${patchErr.message}`);
  } else {
    console.log(`   ✅ metadata atualizado`);
  }
  
  return { title: item.title, matched: true, updated: true, postId: existingPost.id };
}

/**
 * v5.1 (2026-06-10): Enriquece post existente com INFO DE ATUALIZAÇÃO
 * (prorrogação de prazo, retificação, resultado, cancelamento, reabertura).
 * DIFERENTE de enrichDuplicate: aqui a publicação EXISTENTE é mantida e
 * atualizada (capa, descrição, metadata) — NAO é duplicata a ser escondida.
 *
 * Ações:
 *   1. Encontrar post existente do mesmo evento
 *   2. Trocar image_url (cover) pela imagem nova do item
 *   3. Mover cover ANTIGA para post_media (gallery) — preserva histórico
 *   4. Adicionar metadata.last_update com source/date/type/summary
 */
async function enrichUpdate(supabase, item, options = {}) {
  const { dryRun = false, findMatchingPostFn = findMatchingPost } = options;

  console.log(`\n🔄 UPDATE: ${item.title?.slice(0, 80)}`);
  console.log(`   Tipo: ${item.updateType} | Site: ${item.site}`);
  console.log(`   Signals: ${item.updateSignals?.join(', ')}`);

  const match = normalizeMatchResult(await findMatchingPostFn(supabase, item));
  if (!match) {
    console.log(`   ⚠️ Nenhum post existente encontrado para atualizar`);
    return { title: item.title, kind: 'update', matched: false, reason: 'NO_MATCH' };
  }
  const existingPost = match.post;
  const identity = corroborateMutationIdentity(item, existingPost, match.evidence);
  if (!identity.ok) {
    console.log(`   🛑 Candidato bloqueado: identidade não corroborada (${identity.reason})`);
    return {
      title: item.title,
      kind: 'update',
      matched: true,
      updated: false,
      blocked: true,
      reason: 'IDENTITY_NOT_CORROBORATED',
      identityReason: identity.reason,
      postId: existingPost.id,
    };
  }

  console.log(`   🎯 Post alvo: ${existingPost.title?.slice(0, 60)} (${existingPost.id})`);
  console.log(`   🔐 Identidade: ${identity.reason} (${identity.identityVersion})`);

  if (dryRun) {
    console.log(`   🏷️ DRY-RUN — não aplicando mudanças`);
    return { title: item.title, kind: 'update', matched: true, dryRun: true, postId: existingPost.id };
  }

  const sourceUrl = itemSourceUrl(item);
  const updateLog = {
    source: sourceUrl,
    date: new Date().toISOString(),
    type: item.updateType,
    signals: item.updateSignals,
    summary: '',
  };

  // === AÇÃO 1: Trocar cover (nova imagem do item) ===
  let coverSwapped = false;
  if (item.image) {
    const newImageUrl = item.image;
    const oldImageUrl = existingPost.image_url;
    if (oldImageUrl && oldImageUrl !== newImageUrl) {
      // Mover cover antiga para post_media (gallery) — preserva histórico
      await appendPostMediaIfAbsent(supabase, existingPost.id, [oldImageUrl]);
      console.log(`   ✅ cover antiga preservada na gallery: ${oldImageUrl.slice(0, 60)}...`);
    }
    // Atualizar cover do post
    const { error: coverErr } = await supabase
      .from('posts')
      .update({ image_url: newImageUrl })
      .eq('id', existingPost.id);
    if (coverErr) {
      throw new Error(`cover update failed: ${coverErr.message}`);
    } else {
      coverSwapped = true;
      console.log(`   ✅ cover nova: ${newImageUrl.slice(0, 60)}...`);
      updateLog.summary += `Capa atualizada. `;
    }
  }

  // === AÇÃO 2: Adicionar imagens complementares ===
  if (sourceUrl) {
    const html = await fetchPageText(sourceUrl);
    if (html) {
      let newImages = extractContentImages(html);
      const MIN_SIZE_BYTES = 20000;
      const sizeFiltered = [];
      for (const imgUrl of newImages) {
        try {
          const headRes = await fetch(imgUrl, { method: 'HEAD' });
          const size = parseInt(headRes.headers.get('content-length') || '0', 10);
          if (size >= MIN_SIZE_BYTES) sizeFiltered.push(imgUrl);
        } catch (e) {
          sizeFiltered.push(imgUrl);
        }
      }
      newImages = sizeFiltered;
      await appendPostMediaIfAbsent(supabase, existingPost.id, newImages.slice(0, 4));
      if (newImages.length) console.log(`   🖼️  +${newImages.length} imagens complementares`);
    }
  }

  // === AÇÃO 3: Metadata.last_update ===
  const currentMeta = existingPost.metadata || {};
  const lastUpdate = {
    source: sourceUrl,
    date: new Date().toISOString(),
    type: item.updateType,
    signals: item.updateSignals,
    summary: updateLog.summary,
  };
  const { error: metaErr } = await supabase
    .from('posts')
    .update({
      metadata: { ...currentMeta, last_update: lastUpdate },
    })
    .eq('id', existingPost.id);
  if (metaErr) {
    throw new Error(`last_update metadata failed: ${metaErr.message}`);
  } else {
    console.log(`   ✅ metadata.last_update gravado`);
  }

  return {
    title: item.title,
    kind: 'update',
    matched: true,
    updated: true,
    postId: existingPost.id,
    coverSwapped,
    updateType: item.updateType,
  };
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  if (!ANON_KEY) {
    console.error('❌ ANON_KEY ausente');
    process.exit(1);
  }
  
  const email = process.env.CADU_KINO_EMAIL || process.env.CADU_EMAIL
    || env.CADU_KINO_EMAIL || env.CADU_EMAIL;
  const password = process.env.CADU_KINO_PASSWORD || process.env.CADU_PASSWORD
    || env.CADU_KINO_PASSWORD || env.CADU_PASSWORD;
  if (!email || !password) {
    console.error('❌ Credenciais ausentes');
    process.exit(1);
  }
  
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  let auth;
  try {
    auth = await signInWithRetry(supabase, email, password, {
      onAttempt: (a, e) => e && console.log(`  auth attempt ${a}: ${e.name || 'err'} status=${e.status || '?'}`),
    });
  } catch (e) {
    console.error('❌ Login falhou apos retries:', e.message);
    process.exit(1);
  }
  activeAuthClient = supabase;
  console.log(`🔑 Logado como ${auth.user.id} (apos ${auth.attempts} tentativa(s))`);
  
  const dryRun = DUPLICATE_OPTIONS.dryRun;
  const reportFile = DUPLICATE_OPTIONS.reportFile;
  
  console.log(`📄 ${reportFile}`);
  
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const discarded = report.discarded || [];
  const { duplicates, updates } = partitionEnrichmentWork(discarded);
  // v5.1 (2026-06-10): Itens com update=true são processados SEPARADAMENTE
  // como atualizações (prorrogação, retificação, etc) — NAO como duplicatas.

  console.log(`\n📊 Duplicatas: ${duplicates.length} / ${discarded.length} descartados`);
  console.log(`📊 Updates: ${updates.length} / ${discarded.length} descartados`);

  if (duplicates.length === 0 && updates.length === 0) {
    console.log('✅ Nenhuma duplicata ou atualização para processar');
    return;
  }

  if (duplicates.length > 0) {
    console.log(`\n📋 Duplicatas:`);
    duplicates.forEach((d, i) => {
      console.log(`  ${i+1}. [${d.site}] ${d.title?.slice(0, 70)} (score: ${d.score})`);
    });
  }
  if (updates.length > 0) {
    console.log(`\n🔄 Updates:`);
    updates.forEach((d, i) => {
      console.log(`  ${i+1}. [${d.site}] [${d.updateType}] ${d.title?.slice(0, 60)}`);
    });
  }

  console.log(`\n🔧 Processando...`);
  
  const results = [];
  // Processar duplicatas PRIMEIRO
  if (duplicates.length > 0) {
    console.log(`\n🔧 Processando duplicatas...`);
    for (const dup of duplicates) {
      const result = await enrichDuplicate(supabase, dup, { dryRun });
      results.push(result);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  // Processar updates DEPOIS
  if (updates.length > 0) {
    console.log(`\n🔄 Processando updates...`);
    for (const upd of updates) {
      const result = await enrichUpdate(supabase, upd, { dryRun });
      results.push(result);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n📊 RESUMO:`);
  console.log(`   Duplicatas processadas: ${duplicates.length}`);
  console.log(`   Updates processados: ${updates.length}`);
  console.log(`   Match encontrado: ${results.filter(r => r.matched).length}`);
  console.log(`   Atualizados: ${results.filter(r => r.updated).length}`);
  console.log(`   Não atualizados: ${results.filter(r => r.matched && !r.updated).length}`);
  if (results.some(r => r.coverSwapped)) {
    console.log(`   Covers trocadas: ${results.filter(r => r.coverSwapped).length}`);
  }

  if (dryRun) console.log('⚠️ DRY-RUN — nada foi alterado');
  const unmatched = results.filter(result => result.matched === false).length;
  const identityBlocked = results.filter(result => result.blocked === true).length;
  // 2026-07-15: fail-open por padrao. O pipeline NAO pode travar quando ha
  // duplicatas com identity conflict (38 updates bloqueados em 2026-07-15
  // quebraram 20 min de pipeline). O safety gate (corroborateMutationIdentity)
  // continua ativo para os writes, mas o exit code fica em 0 (success) a menos
  // que CADU_FAIL_CLOSED_DUPLICATES=1 esteja setado.
  const failClosed = process.env.CADU_FAIL_CLOSED_DUPLICATES === '1';
  if (identityBlocked > 0) {
    console.error(`${IDENTITY_BLOCK_MARKER}${JSON.stringify({
      schemaVersion: 1,
      identityVersion: URL_IDENTITY_VERSION,
      blocked: identityBlocked,
      dryRun,
      reasons: [...new Set(
        results.filter(result => result.blocked).map(result => result.identityReason),
      )],
    })}`);
    if (failClosed) process.exitCode = 2;
  }
  if (unmatched > 0) {
    console.error(`❌ ${unmatched} item(ns) marcados como duplicata/update sem post canônico correspondente`);
    if (failClosed) process.exitCode = 2;
  }
  if ((identityBlocked > 0 || unmatched > 0) && !failClosed) {
    console.error(`⚠️ Pipeline fail-open: ${identityBlocked + unmatched} item(ns) requerem revisão manual (não bloqueiam publicação).`);
  }
}

function partitionEnrichmentWork(discarded) {
  const items = Array.isArray(discarded) ? discarded.filter(Boolean) : [];
  // An update is also commonly marked as a duplicate because it targets an
  // existing post. It must follow the richer update path exactly once.
  return {
    duplicates: items.filter(item => item.duplicate === true && item.update !== true),
    updates: items.filter(item => item.update === true),
  };
}

if (require.main === module) {
  main()
    .catch(e => { console.error('💥', e.message); process.exitCode = 1; })
    .finally(() => signOutCurrentSession(activeAuthClient, {
      onError: e => console.error('⚠️ Logout local do Cadu falhou:', e.message),
    }));
}

module.exports = {
  IDENTITY_BLOCK_MARKER,
  URL_IDENTITY_VERSION,
  canonicalUrl,
  corroborateMutationIdentity,
  enrichDuplicate,
  enrichUpdate,
  findMatchingPost,
  mergeEnrichmentSources,
  parseDuplicateArgs,
  partitionEnrichmentWork,
  resetPublishedPostsCacheForTests,
  selectNewMediaUrls,
};
