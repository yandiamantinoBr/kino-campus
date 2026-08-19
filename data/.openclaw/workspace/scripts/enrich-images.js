#!/usr/bin/env node
/**
 * enrich-images.js — Extrai imagens complementares da página fonte
 * e adiciona ao post via caduEditPost.
 *
 * Comportamento:
 *   1. Busca HTML da sourceUrl
 *   2. Extrai todas as <img> de conteúdo (filtra logos/icons)
 *   3. Verifica quais já estão no post (dedup por filename)
 *   4. Adiciona as novas imagens ao post (até 5 total)
 *
 * Uso:
 *   node scripts/enrich-images.js <postId> <sourceUrl> [existingImageUrl]
 *   node scripts/enrich-images.js --post abc-123 --url https://emac.ufg.br/n/201612
 *   node scripts/enrich-images.js --file items.json  (lote)
 *
 * v2 (2026-07-15) — fail-soft: erros de fetch em uma fonte (DNS NXDOMAIN, HTML
 * vazio) NÃO derrubam o status do pipeline. Cada item registra o erro no
 * array `results`. Por default, erros parciais não derrubam o pipeline; o exit
 * code só é 2 quando todos os itens falham. Use --strict para forçar exit 2
 * quando houver qualquer erro (compatibilidade legada).
 *   node scripts/enrich-images.js --from-recent 20
 * 
 * Output: JSON com { added, total, images: [...] }
 */

'use strict';

const { signInWithRetry, signOutCurrentSession } = require('./auth-retry');
const {
  appendPostMediaIfAbsent,
  buildCanonicalGalleryImageUrls,
} = require('./post-media-append');
const {
  nonEnrichableSourceReason,
  selectEnrichmentSourceUrl,
} = require('./lib/enrichment-source-selector');
const {
  isKnownPlaceholderImageUrl,
  normalizeImageUrl,
} = require('./lib/image-utils');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG
// ============================================================

const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';
const BASE_DIR = '/data/.openclaw/workspace';
let activeAuthClient = null;

// Load env
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
  path.join(process.cwd(), '.env.local'),
].forEach(loadEnvFile);
const ANON_KEY = process.env.CADU_SUPABASE_ANON_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.KINOCAMPUS_SUPABASE_ANON_KEY
  || env.CADU_SUPABASE_ANON_KEY
  || env.SUPABASE_ANON_KEY
  || env.KINOCAMPUS_SUPABASE_ANON_KEY;

function parseEnrichArgs(argv) {
  const options = {
    dryRun: false, mode: null, file: null, recentCount: null, postId: null, sourceUrl: null,
    // v2 (2026-07-15): fail-soft por default. Erros de fetch/HTML em uma
    // fonte individual ficam no array results, e o exit code é 0 (success)
    // mesmo com erros parciais. Use --strict para reverter ao comportamento
    // legado (exit code 2 quando há qualquer erro).
    strict: process.env.CADU_ENRICH_STRICT === '1',
  };
  const positional = [];
  const valueFlagsSeen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      if (options.dryRun) throw new Error('argumento duplicado: --dry-run');
      options.dryRun = true;
    } else if (arg === '--strict') {
      // v2: força exit code 2 ao primeiro erro (compat legada)
      if (options.strict) throw new Error('argumento duplicado: --strict');
      options.strict = true;
    } else if (['--file', '--from-recent', '--post', '--url'].includes(arg)) {
      if (valueFlagsSeen.has(arg)) throw new Error(`argumento duplicado: ${arg}`);
      valueFlagsSeen.add(arg);
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requer um valor`);
      if (arg === '--file') options.file = value;
      else if (arg === '--from-recent') options.recentCount = value;
      else if (arg === '--post') options.postId = value;
      else options.sourceUrl = value;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    } else {
      throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  if (options.file) options.mode = 'file';
  if (options.recentCount !== null) {
    if (options.mode) throw new Error('modos de enriquecimento não podem ser combinados');
    const count = Number(options.recentCount);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new Error('--from-recent deve ser inteiro entre 1 e 100');
    }
    options.recentCount = count;
    options.mode = 'recent';
  }
  if (options.postId || options.sourceUrl) {
    if (options.mode) throw new Error('modos de enriquecimento não podem ser combinados');
    if (!options.postId || !options.sourceUrl) throw new Error('--post e --url são obrigatórios juntos');
    options.mode = 'single';
  }
  if (positional.length) {
    if (options.mode || positional.length !== 2) throw new Error('argumentos posicionais inválidos');
    [options.postId, options.sourceUrl] = positional;
    options.mode = 'single';
  }
  if (!options.mode) throw new Error('informe --file, --from-recent ou --post/--url');
  if (options.sourceUrl && !/^https?:\/\//i.test(options.sourceUrl)) throw new Error('sourceUrl inválida');
  return options;
}

/**
 * Decide o exit code de uma execução de enriquecimento sem efeitos colaterais.
 * O modo default tolera falhas parciais, mas sinaliza falha total. O modo
 * estrito preserva o comportamento legado de falhar quando qualquer item erra.
 */
function decideEnrichExitCode(results, { strict = false } = {}) {
  const outcomes = Array.isArray(results) ? results : [];
  const errorCount = outcomes.filter(result => result && result.error).length;

  if (strict) return errorCount > 0 ? 2 : 0;
  return outcomes.length > 0 && errorCount === outcomes.length ? 2 : 0;
}

const ENRICH_OPTIONS = require.main === module
  ? parseEnrichArgs(process.argv.slice(2))
  : { dryRun: false, mode: null };

// ============================================================
// HELPERS
// ============================================================

// S37 fix: substituído execSync+curl por fetch nativo (command injection risk)
const FETCH_HTML_MAX_ATTEMPTS = 2;
const FETCH_HTML_TIMEOUT_MS = 15000;
const FETCH_HTML_BACKOFF_MS = 250;

function isRetryableHttpStatus(status) {
  return status === 408
    || status === 425
    || status === 429
    || (status >= 500 && status <= 599);
}

function isRetryableFetchError(error) {
  if (!error) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  if (error instanceof TypeError) return true;
  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'EAI_AGAIN',
    'ENETUNREACH',
    'ENOTFOUND',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ].includes(error.code);
}

async function fetchHtml(url, {
  fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = FETCH_HTML_TIMEOUT_MS,
  backoffMs = FETCH_HTML_BACKOFF_MS,
  logger = console,
} = {}) {
  if (!/^https?:\/\//i.test(url) || typeof fetchImpl !== 'function') return '';

  const requestTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : FETCH_HTML_TIMEOUT_MS;
  const retryBackoff = Number.isFinite(backoffMs) && backoffMs >= 0
    ? backoffMs
    : FETCH_HTML_BACKOFF_MS;

  for (let attempt = 1; attempt <= FETCH_HTML_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeout);
    let retryReason = '';

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; KinoCadu/1.0)' },
        redirect: 'follow',
      });

      if (!response.ok) {
        if (!isRetryableHttpStatus(response.status)) return '';
        retryReason = `HTTP ${response.status}`;
      } else {
        const html = await response.text();
        if (typeof html === 'string' && html.trim()) return html;
        retryReason = 'resposta vazia';
      }
    } catch (error) {
      if (!isRetryableFetchError(error)) {
        logger.error?.(`   ⚠️ Erro ao buscar ${url}: ${(error.message || '').slice(0, 80)}`);
        return '';
      }
      retryReason = error.name === 'AbortError'
        ? `timeout após ${requestTimeout}ms`
        : (error.message || error.code || 'erro de rede').slice(0, 80);
    } finally {
      clearTimeout(timeout);
    }

    if (attempt === FETCH_HTML_MAX_ATTEMPTS) {
      logger.error?.(`   ⚠️ Erro ao buscar ${url} após ${attempt} tentativas: ${retryReason}`);
      return '';
    }

    logger.warn?.(`   ⚠️ Tentativa ${attempt} falhou (${retryReason}); repetindo busca...`);
    await sleep(retryBackoff);
  }

  return '';
}

/**
 * Extrai imagens de conteúdo da página, filtrando logos/icons/shortcuts.
 * Ordem: imagens do corpo da notícia (weby up/), depois og:image.
 * v4.4 (2026-06-10): Filtro de DOM — só imagens dentro de <article> ou <main>,
 * rejeita imagens dentro de <footer>, <header>, <nav>, <aside>.
 * Caso real: post Rondon do INF (10/06) tinha 5 "imagens" no post, todas
 * logos/selos de rodape; a unica imagem de conteudo (Capa_para_Oficios.png)
 * estava em <article> e foi ignorada pelo extrator antigo.
 */
function extractContentImages(html, sourceUrl) {
  if (!html) return [];

  // v4.4: Extrai bloco de conteudo principal (article/main) ou cai pra body
  // inteiro se nao encontrar. Remove explicitamente footer/header/nav/aside.
  let contentScope = html;
  let usedScope = 'body';
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (articleMatch) {
    contentScope = articleMatch[1];
    usedScope = 'article';
  } else if (mainMatch) {
    contentScope = mainMatch[1];
    usedScope = 'main';
  } else {
    // Sem article/main: remove footer/header/nav/aside do body
    contentScope = html
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  }

  // v4.6 (2026-06-10): EXTRAI swipers/carousels/galerias também.
  // Caso real: site PIlC-China (brazil.pilcchina.org/home) usa React com
  // className "adm-swiper-item" para os banners do carrossel. Esses banners
  // SÃO o conteúdo principal da página, mas o filtro de DOM só pegava
  // <article>/<main>. Agora incluímos swipers no escopo.
  const swiperMatch = html.match(/<div[^>]*class=["'][^"']*adm-swiper[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (swiperMatch) {
    contentScope = contentScope + '\n' + swiperMatch[0];
    usedScope += '+swiper';
  } else {
    // Fallback: pegar divs com class contendo "swiper", "carousel", "slider", "gallery"
    const carouselRegex = /<div[^>]*class=["'][^"']*(?:swiper|carousel|slider|gallery|hero)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = carouselRegex.exec(html)) !== null) {
      contentScope = contentScope + '\n' + m[0];
    }
    if (carouselRegex.lastIndex > 0) usedScope += '+carousel';
  }

  const allImages = [];
  const seen = new Set();
  
  // Regex para todas as imagens no escopo de conteudo
  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
  let m;
  
  while ((m = imgRegex.exec(contentScope)) !== null) {
    let src = m[1];
    
    // Resolve relative URLs
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('/')) {
      const base = new URL(sourceUrl);
      src = `${base.protocol}//${base.host}${src}`;
    }
    
    if (seen.has(src)) continue;
    seen.add(src);
    allImages.push(src);
  }
  
  // Filtro: remover logos, icons, shortcuts
  // NOTA: whatsapp NÃO está aqui porque muitas notícias usam WhatsApp_Image_*.jpeg como imagem de conteúdo
  const LOGO_PATTERNS = [
    /logo/i, /shortcut/i, /marca-ai/i,
    /\bicon\b/i, /\bicon[-_]/i,
    /\binstagram\b/i, /\bfacebook\b/i, /\byoutube\b/i,
    /\blinkedin\b/i, /\btiktok\b/i, /\btwitter\b/i,
    /weby-shortcut/i, /icon-icons/i,
    // v4.3 (2026-06-08): Padroes comuns de logos de programas/bolsas
    /ppg[a-z]+\.png/i, // ppgcf.png, ppgcb.png, ppgq.png etc
    /^[a-z]{2,6}\.png$/i, // nomes curtos sem path (daad.png, capes.png, cnpq.png)
  ];
  
  // Filenames específicos que são logos de redes sociais
  const SOCIAL_ICON_FILENAMES = new Set([
    'instagram.png', 'youtube_icon-icons.com_65537.png',
  ]);
  
  // Padrões específicos de logos de unidades (imagens pequenas de header)
  const UNIT_LOGOS = [
    /\/i\/[^/]+\.(png|jpg)/i,  // imagens em /i/ (thumbnail) de header
    /ufg-v\d/i,
  ];
  
  // Nomes específicos de arquivos de logo (case insensitive, basename match)
  const LOGO_FILENAMES = new Set([
    'ufg-v2.png', 'em_ufg.png', 'em-v6.png',
  ]);
  
  const contentImages = allImages.filter(img => {
    const fn = img.split('/').pop()?.split('?')[0]?.toLowerCase() || '';

    if (isKnownPlaceholderImageUrl(img)) {
      return false;
    }
    
    // Check against LOGO_FILENAMES set
    if (LOGO_FILENAMES.has(fn)) {
      return false;
    }
    
    // Check against SOCIAL_ICON_FILENAMES
    if (SOCIAL_ICON_FILENAMES.has(fn)) {
      return false;
    }
    
    // Check against LOGO_PATTERNS
    for (const pat of LOGO_PATTERNS) {
      if (pat.test(fn)) return false;
    }
    
    // Check UNIT_LOGOS (unit header thumbnails like /i/EM-v6.png)
    for (const pat of UNIT_LOGOS) {
      if (pat.test(img)) return false;
    }
    
    // Skip SVG
    if (/\.svg($|[?#])/i.test(fn)) return false;
    // Must be image
    if (!/\.(jpg|jpeg|png|webp)($|[?#])/i.test(fn)) return false;
    return true;
  });
  
  // Prioritize: og:image first, then weby images with /o/ (original) > /l/ (large)
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  
  // v4.3 (2026-06-08): Reject logos de programas comuns que passam pelo filtro basico
  // Estes sao logos de header/footer, NAO conteudo editorial
  const PROGRAM_LOGO_NAMES = new Set([
    'ppgcf.png', 'ppgcb.png', 'ppgq.png', 'ppgmec.png', 'ppgeas.png', 'ppgecoevol.png',
    'ppgmp.png', 'ppgemp.png', 'ppggmp.png', 'ppgsau.png', 'ppgia.png',
    'daad.png', 'capes.png', 'cnpq.png', 'fapeg.png',
    'fesag.png', 'verbena.png', 'ufg-v2.png', 'ufg.png', 'ufg-v3.png', 'ufg-v4.png', 'ufg-v5.png',
  ]);
  
  const finalImages = contentImages.map(normalizeImageUrl).filter(Boolean).filter(img => {
    const fn = (img.split('/').pop() || '').split('?')[0].toLowerCase();
    if (PROGRAM_LOGO_NAMES.has(fn)) return false;
    return true;
  });
  
  const sorted = [...finalImages].sort((a, b) => {
    // og:image first
    if (ogImage && a === ogImage[1]) return -1;
    if (ogImage && b === ogImage[1]) return 1;
    // /o/ (original size) before /l/ (large thumbnail)
    const aO = a.includes('/o/') ? 1 : 0;
    const bO = b.includes('/o/') ? 1 : 0;
    return bO - aO;
  });
  
  return sorted.slice(0, 10); // max 10 candidates
}

/**
 * Compara duas listas de imagens pelo filename (ignorando query strings)
 */
// v4.5 (2026-06-10): dedup inteligente que normaliza /l/ vs /o/ e dedup por basename
// Caso real: post Ceti-Saúde PROFEPI (16bb5c36) tinha 2 imagens DIFERENTES no <article>:
//   - /l/Ceti-Saude_Recomenda_-_curso_online.png (36KB, banner horizontal 190x127)
//   - /o/curso_-_trilha_de_formação.png (687KB, cartaz vertical 1183x1718)
//   - 2 filenames diferentes, mas a 36KB é "qualidade pior" do CONTEÚDO 687KB
//   - A 36KB NÃO deveria ser adicionada se já existe a 687KB (mesmo arquivo, /l/ vs /o/)
// Bug também: post Prêmio Jovem Cientista (9c2a2512) tem capa /o/ 2.4MB + gallery /l/ 20KB
//   do MESMO arquivo (mesmo basename) — duplicata por /l/ vs /o/
function dedupByFilename(existing, candidates) {
  // Normaliza: transforma /l/ em /o/ para dedup correto
  function normalizeUrl(url) {
    return (url || '').replace(/\/l\//g, '/o/').split('?')[0].toLowerCase();
  }
  function basename(url) {
    // Pega o basename sem query e sem path version prefix
    return (url || '').split('?')[0].split('/').pop()?.toLowerCase().replace(/\.(png|jpg|jpeg|webp|svg)$/i, '');
  }
  // Set de URLs normalizadas já presentes (incluindo cover e gallery)
  const existingNorm = new Set(existing.map(normalizeUrl));
  // Set de basenames já presentes (para dedup mesmo se a URL tem /l/ vs /o/ diferentes)
  const existingBasenames = new Set(existing.map(basename).filter(Boolean));
  
  return candidates.filter(url => {
    const fn = url.split('/').pop()?.split('?')[0]?.toLowerCase();
    if (!fn) return false;
    // Dedup 1: URL normalizada exata já existe
    if (existingNorm.has(normalizeUrl(url))) return false;
    // Dedup 2: mesmo basename (sem extensão) já existe — provavelmente é /l/ vs /o/ do mesmo arquivo
    const bn = basename(url);
    if (bn && existingBasenames.has(bn)) return false;
    return true;
  });
}

// ============================================================
// CORE: Enriquecer um post com imagens da fonte
// ============================================================

async function enrichPost(supabase, token, postId, sourceUrl, options = {}) {
  const { dryRun = false } = options;
  
  console.log(`\n🔍 Enriquecendo imagens do post ${postId}`);
  console.log(`   Fonte: ${sourceUrl}`);

  const nonEnrichableReason = nonEnrichableSourceReason(sourceUrl);
  if (nonEnrichableReason === 'form_provider') {
    console.log('   Fonte de formulario preservada como CTA; sem HTML editorial para enriquecer');
    return {
      added: 0,
      total: 0,
      images: [],
      skipped: true,
      skipReason: 'NON_ENRICHABLE_SOURCE',
    };
  }
  
  // 1. Buscar post atual para saber quais imagens já tem
  const { data: post, error: getErr } = await supabase
    .from('posts')
    .select('id, title, image_url, metadata')
    .eq('id', postId)
    .single();
  
  if (getErr || !post) {
    console.error(`   ❌ Post não encontrado: ${getErr?.message || 'null'}`);
    return { added: 0, total: 0, images: [], error: 'POST_NOT_FOUND' };
  }
  
  const existingImages = [];
  if (post.image_url) existingImages.push(post.image_url);
  
  // Buscar post_media existentes
  const { data: media, error: mediaError } = await supabase
    .from('post_media')
    .select('url')
    .eq('post_id', postId);
  
  if (mediaError) {
    return { added: 0, total: existingImages.length, images: existingImages, error: 'MEDIA_QUERY_FAILED' };
  }
  if (media) {
    for (const m of media) {
      if (m.url && !existingImages.includes(m.url)) {
        existingImages.push(m.url);
      }
    }
  }
  
  console.log(`   Imagens atuais: ${existingImages.length}`);
  
  // 2. Buscar HTML da fonte
  const html = await fetchHtml(sourceUrl);
  if (!html) {
    console.error(`   ❌ HTML vazio da fonte`);
    return { added: 0, total: existingImages.length, images: existingImages, error: 'HTML_EMPTY' };
  }
  
  // 3. Extrair imagens de conteúdo
  const candidates = extractContentImages(html, sourceUrl);
  console.log(`   Candidatas extraídas: ${candidates.length}`);
  if (candidates.length > 0) {
    candidates.slice(0, 5).forEach((c, i) => {
      console.log(`     ${i+1}. ${c.slice(0, 80)}`);
    });
  }
  
  // 4. Filtrar as que não estão já no post
  let newImages = dedupByFilename(existingImages, candidates);
  console.log(`   Novas (não duplicadas): ${newImages.length}`);

  // v4.3 (2026-06-08): Filtro de TAMANHO MÍNIMO via HEAD request
  // Rejeita imagens com menos de 20KB (logos geralmente < 10KB, conteúdo real > 30KB)
  // v4.5 (2026-06-10): Aumentado para 30KB — pega 36KB que passou antes mas é banner de baixa qualidade.
  // Bug real: post PROFEPI (16bb5c36) tinha imagem 36KB no gallery, mas era banner de
  // qualidade pior do que a capa 998KB. Aumentar threshold reduz gallery "lixo".
  const MIN_SIZE_BYTES = 30000;
  const sizeFiltered = [];
  for (const imgUrl of newImages) {
    try {
      const headRes = await fetch(imgUrl, { method: 'HEAD' });
      const size = parseInt(headRes.headers.get('content-length') || '0', 10);
      if (size >= MIN_SIZE_BYTES) {
        sizeFiltered.push(imgUrl);
      } else {
        console.log(`   ⏭️ img pequena demais (${size} bytes): ${imgUrl.slice(0, 70)}`);
      }
    } catch (e) {
      // Em caso de erro no HEAD, mantem a imagem (não rejeita por erro de rede)
      sizeFiltered.push(imgUrl);
    }
  }
  newImages = sizeFiltered;
  console.log(`   Após filtro de tamanho (>= ${MIN_SIZE_BYTES/1000}KB): ${newImages.length}`);

  // v4.4 (2026-06-10): Filtro de DIMENSOES via download + sharp metadata.
  // Rejeita imagens com width < 200px OU height < 100px OU aspect ratio muito
  // horizontal (logos/selos de rodape). Heuristica simples mas eficaz:
  //   - Icone quadrado pequeno: rejeitar (logo de rede social, p.ex.)
  //   - Faixa horizontal pequena (width > 4x height): rejeitar (selo/logo de rodape)
  //   - Imagem grande e bem proporcionada: manter
  // Caso real: 10/06/2026 — post Rondon do INF tinha 5 "imagens", todas logos
  // (selo "Acesso a Informacao" 30x30, selo "Acesso a Informacao" 103x39,
  //  logo UFG 121x51, logo INF, icone social). Filtro de tamanho (20KB) NAO
  // pegou img3 (11KB) nem img5 (7KB) porque a compressao PNG dessas logos
  // finas as vezes passa do limite.
  let sharpLib = null;
  try { sharpLib = require('sharp'); } catch (_) { /* sharp não instalado */ }
  if (sharpLib) {
    const dimFiltered = [];
    for (const imgUrl of newImages) {
      try {
        const r = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) { dimFiltered.push(imgUrl); continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        const meta = await sharpLib(buf).metadata();
        const w = meta.width || 0, h = meta.height || 0;
        const aspect = h > 0 ? w / h : 0;
        const tooSmall = w < 200 || h < 100;
        const tooFlat = aspect >= 4; // faixa muito horizontal = selo/logo de rodape
        if (tooSmall || tooFlat) {
          console.log(`   ⏭️ img com dimensao inadequada (${w}x${h}, aspect ${aspect.toFixed(2)}): ${imgUrl.slice(0, 70)}`);
        } else {
          dimFiltered.push(imgUrl);
        }
      } catch (e) {
        dimFiltered.push(imgUrl); // mantem se download falhar
      }
    }
    newImages = dimFiltered;
    console.log(`   Após filtro de dimensao (w>=200, h>=100, aspect<4): ${newImages.length}`);
  }

  if (newImages.length === 0) {
    console.log(`   ✅ Post já tem todas as imagens disponíveis`);
    return { added: 0, total: existingImages.length, images: existingImages };
  }
  
  // 5. Limitar a 5 imagens totais
  const allImages = [...existingImages, ...newImages].slice(0, 5);
  const toAdd = newImages.slice(0, Math.max(0, 5 - existingImages.length));
  
  console.log(`   Para adicionar: ${toAdd.length} (total final: ${allImages.length})`);
  
  if (toAdd.length === 0) {
    return { added: 0, total: allImages.length, images: allImages };
  }
  
  if (dryRun) {
    console.log(`   🏷️ DRY-RUN — não aplicando mudanças`);
    return { added: toAdd.length, total: allImages.length, images: allImages, dryRun: true };
  }
  
  // 6. Inserir novas imagens no post_media + atualizar metadata.gallery_image_urls
  //    NOTA: cadu-publish edit não processa array images corretamente,
  //    então fazemos inserção direta no Supabase
  
  console.log(`   📤 Inserindo ${toAdd.length} imagens no post_media...`);
  
  try {
    // 6a. Inserir em lote sem violar a unicidade em execuções concorrentes.
    const appendResult = await appendPostMediaIfAbsent(supabase, postId, toAdd);
    const inserted = appendResult.inserted.length;
    appendResult.inserted.forEach(mediaRow => {
      console.log(`   ✅ post_media inserido: ${String(mediaRow.url || '').slice(0, 70)}...`);
    });

    // A corrida pode ter sido vencida por outra etapa. Releia o estado que o
    // banco efetivamente aceitou antes de espelhar a galeria no metadata.
    const { data: canonicalMedia, error: canonicalMediaError } = await supabase
      .from('post_media')
      .select('id,url,is_cover,sort_order')
      .eq('post_id', postId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (canonicalMediaError) {
      throw new Error(`post_media canonical read failed: ${canonicalMediaError.message}`);
    }
    const canonicalImages = buildCanonicalGalleryImageUrls(post.image_url, canonicalMedia, 5);
    
    // 6b. Atualizar metadata.gallery_image_urls
    const currentMeta = post.metadata || {};
    const updatedMeta = {
      ...currentMeta,
      gallery_image_urls: canonicalImages,
    };
    
    const { error: patchErr } = await supabase
      .from('posts')
      .update({ metadata: updatedMeta })
      .eq('id', postId);
    
    if (patchErr) {
      throw new Error(`gallery metadata update failed: ${patchErr.message}`);
    } else {
      console.log(`   ✅ metadata.gallery_image_urls atualizado (${canonicalImages.length} imgs)`);
    }
    
    console.log(`   ✅ ${inserted} imagens adicionadas ao post`);
    return { added: inserted, total: canonicalImages.length, images: canonicalImages };
  } catch (e) {
    console.error(`   ❌ Erro na inserção: ${e.message}`);
    return { added: 0, total: existingImages.length, images: existingImages, error: 'INSERT_ERROR' };
  }
}

// ============================================================
// BATCH: Processar múltiplos posts de um relatório
// ============================================================

async function enrichBatch(supabase, token, items, options = {}) {
  const results = [];
  
  for (const item of items) {
    const postId = item.postId || item.id;
    const sourceUrl = selectEnrichmentSourceUrl({
      preferredUrls: [item.sourcePageUrl, item.canonicalSourceUrl],
      enrichmentSources: item.enrichmentSources || item.enrichment_sources,
      fallbackUrls: [item.sourceUrl, item.source_url, item.url],
    });
    
    if (!postId || !sourceUrl) {
      console.log(`\n⏭️ Pulando item sem postId/sourceUrl: ${item.title?.slice(0, 50) || '?'}`);
      results.push({ postId, sourceUrl, added: 0, error: 'MISSING_FIELDS' });
      continue;
    }
    
    const result = await enrichPost(supabase, token, postId, sourceUrl, options);
    results.push({ postId, sourceUrl, ...result });
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  return results;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  if (!ANON_KEY) {
    console.error('❌ CADU_SUPABASE_ANON_KEY ausente');
    process.exit(1);
  }
  
  const email = process.env.CADU_KINO_EMAIL || process.env.CADU_EMAIL || env.CADU_KINO_EMAIL || env.CADU_EMAIL;
  const password = process.env.CADU_KINO_PASSWORD || process.env.CADU_PASSWORD || env.CADU_KINO_PASSWORD || env.CADU_PASSWORD;
  
  if (!email || !password) {
    console.error('❌ CADU_KINO_EMAIL/CADU_KINO_PASSWORD ausentes');
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
  const token = auth.session.access_token;
  activeAuthClient = supabase;
  console.log(`🔑 Logado como ${auth.user.id} (apos ${auth.attempts} tentativa(s))`);
  
  const dryRun = ENRICH_OPTIONS.dryRun;
  
  // Parse args
  let postId = null, sourceUrl = null;
  
  if (ENRICH_OPTIONS.mode === 'file') {
    // Batch mode
    const file = ENRICH_OPTIONS.file;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const items = data.items || data.publishable || data;
    
    if (!Array.isArray(items)) {
      console.error('❌ --file deve conter array de itens');
      process.exit(1);
    }
    
    console.log(`📦 Processando ${items.length} posts em lote...`);
    const results = await enrichBatch(supabase, token, items, { dryRun });
    
    const added = results.filter(r => r.added > 0).length;
    const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
    
    console.log(`\n📊 RESUMO:`);
    console.log(`   Posts processados: ${results.length}`);
    console.log(`   Posts com novas imagens: ${added}`);
    console.log(`   Total imagens adicionadas: ${totalAdded}`);
    console.log(`   Erros: ${results.filter(r => r.error).length}`);
    
    if (dryRun) console.log('⚠️ DRY-RUN — nada foi alterado');
    
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = decideEnrichExitCode(results, ENRICH_OPTIONS);
    return;
  }
  
  // --from-recent mode: get last N published posts and enrich them
  if (ENRICH_OPTIONS.mode === 'recent') {
    const count = ENRICH_OPTIONS.recentCount;
    
    console.log(`📦 Buscando últimos ${count} posts publicados...`);
    
    const { data: recentPosts, error: recentErr } = await supabase
      .from('posts')
      .select('id, title, metadata')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(count);
    
    if (recentErr) {
      console.error('❌ Erro ao buscar posts recentes:', recentErr.message);
      process.exit(1);
    }
    
    console.log(`   Encontrados: ${recentPosts.length}`);
    
    const results = [];
    for (const post of recentPosts) {
      const sourceUrl = selectEnrichmentSourceUrl({
        enrichmentSources: post.metadata?.enrichment_sources,
        fallbackUrls: [post.metadata?.source_url],
      });
      if (!sourceUrl) {
        console.log(`\n⏭️ ${post.title?.slice(0, 50)} — sem source_url`);
        results.push({ postId: post.id, sourceUrl: '', added: 0, error: 'NO_SOURCE_URL' });
        continue;
      }
      
      // Check if already has gallery images
      const { data: media, error: mediaError } = await supabase
        .from('post_media')
        .select('id')
        .eq('post_id', post.id);
      
      if (mediaError) {
        results.push({ postId: post.id, sourceUrl, added: 0, error: 'MEDIA_QUERY_FAILED' });
        continue;
      }
      // Skip posts that already have 3+ media items (already enriched or multiple images)
      if (media && media.length >= 3) {
        console.log(`\n⏭️ ${post.title?.slice(0, 50)} — já tem ${media.length} imagens`);
        results.push({ postId: post.id, sourceUrl, added: 0, total: media.length, skipped: true });
        continue;
      }
      
      const result = await enrichPost(supabase, token, post.id, sourceUrl, { dryRun });
      results.push({ postId: post.id, sourceUrl, ...result });
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
    
    const added = results.filter(r => r.added > 0).length;
    const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
    
    console.log(`\n📊 RESUMO:`);
    console.log(`   Posts processados: ${results.length}`);
    console.log(`   Posts com novas imagens: ${added}`);
    console.log(`   Total imagens adicionadas: ${totalAdded}`);
    console.log(`   Pulados (já enriquecidos): ${results.filter(r => r.skipped).length}`);
    console.log(`   Erros: ${results.filter(r => r.error).length}`);
    // v2 (2026-07-15): hint visual do fail-soft
    if (!ENRICH_OPTIONS.strict) {
      const ec = results.filter(r => r.error).length;
      if (ec > 0 && ec < results.length) {
        console.log(`   ⚠️ Fail-soft: ${ec} erro(s) parcial(is) — pipeline NÃO falha (exit 0). Use --strict para reverter.`);
      }
    }

    if (dryRun) console.log('⚠️ DRY-RUN — nada foi alterado');

    console.log(JSON.stringify(results, null, 2));
    // v2 (2026-07-15): fail-soft em modo recent/file. Só exit 2 em --strict
    // ou quando TODAS as fontes falharam.
    process.exitCode = decideEnrichExitCode(results, ENRICH_OPTIONS);
    return;
  }
  
  // Single post mode
  postId = ENRICH_OPTIONS.postId;
  sourceUrl = ENRICH_OPTIONS.sourceUrl;
  
  if (!postId || !sourceUrl) {
    console.error('Uso: node enrich-images.js --post <id> --url <sourceUrl>');
    console.error('     node enrich-images.js --file items.json');
    console.error('     node enrich-images.js --from-recent 5');
    process.exit(1);
  }
  
  const result = await enrichPost(supabase, token, postId, sourceUrl, { dryRun });
  console.log(JSON.stringify(result, null, 2));
  // Em single-post, um erro representa falha total; --strict preserva a mesma
  // saída 2 que os modos em lote usam quando todos os itens falham.
  process.exitCode = decideEnrichExitCode([result], ENRICH_OPTIONS);
}

if (require.main === module) {
  main()
    .catch(e => { console.error('💥', e.message); process.exitCode = 1; })
    .finally(() => signOutCurrentSession(activeAuthClient, {
      onError: e => console.error('⚠️ Logout local do Cadu falhou:', e.message),
    }));
}

module.exports = {
  decideEnrichExitCode,
  dedupByFilename,
  enrichBatch,
  enrichPost,
  extractContentImages,
  fetchHtml,
  nonEnrichableSourceReason,
  parseEnrichArgs,
  selectEnrichmentSourceUrl,
};
