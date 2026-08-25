#!/usr/bin/env node
/**
 * dedup-kino.js — Deduplicação dedicada de posts do Kino Campus
 *
 * Pipeline em 3 estágios (do mais barato ao mais caro):
 *   STAGE 1 (texto): Jaccard shingles + Levenshtein + match por URL canônica
 *   STAGE 2 (imagem): pHash perceptual 8x8 + detecção de logo inadequada
 *   STAGE 3 (semântico): DeepSeek em batch classifica se é mesmo evento / repost / distintos
 *
 * Ações:
 *   - Duplicata exata confirmada (Stage 1+3): hide do mais recente via Supabase
 *   - Logo inadequada detectada: flag em metadata + reportar para revisão manual
 *   - Repost confirmado (mesmo evento, fontes diferentes): hide do repost
 *
 * Uso:
 *   node scripts/dedup-kino.js --dry-run                  # padrão, lista sem aplicar
 *   node scripts/dedup-kino.js --apply                    # aplica ações automaticamente (CLI manual)
 *   node scripts/dedup-kino.js --auto-apply               # idem --apply, usado pelo pipeline
 *   node scripts/dedup-kino.js --days 30                  # lookback custom (padrão 90)
 *   node scripts/dedup-kino.js --limit 5                  # max pares a enviar ao DeepSeek
 *   node scripts/dedup-kino.js --no-llm                   # só stages 1+2
 *   node scripts/dedup-kino.js --report                   # apenas gera relatório
 *
 * Cron alvo: todos os dias às 10:00 BRT
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const { signInWithRetry, signOutCurrentSession } = require('./auth-retry');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let activeAuthClient = null;
const { writeJsonAtomic } = require('./lib/atomic-json-file.js');
const { canonicalUrl, webySameEvent } = require('./lib/canonical-url.js');
const {
  decideDuplicatePair,
  latestRelevantLifecycleDate,
} = require('./lib/post-identity.js');

// === Configuração ===

const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';
const BASE_DIR = '/data/.openclaw/workspace';
const REPORT_DIR = path.join(BASE_DIR, 'data/dedup-reports');
const ENV_FILE = '/data/.openclaw/workspace/kino-campus/services/cadu-ufg-publisher/.env.local';

// Thresholds
const JACCARD_THRESHOLD = 0.50;   // similaridade textual candidata (0-1)
const LEVENSHTEIN_THRESHOLD = 0.85; // similaridade de título (0-1)
const PHASH_HAMMING_MAX = 10;      // distância hamming máxima pHash 64-bit
const MIN_DESCRIPTION_LEN = 40;
const MAX_PAIRS_FOR_LLM = 30;      // limite de pares enviados à IA por execução

// Logos institucionais conhecidas (filename / url pattern → unidade)
// v1.2 (2026-06-10): Detecção ampliada para QUALQUER sigla XX_UFG ou
// XXX_UFG no caminho /up/NNN/o/ do Weby UFG. Caso real encontrado:
// "Curso de Especialização em Perícia" com EECA_UFG.svg (Eng. Civil).
const LOGO_INSTITUCIONAL_PATTERNS = [
  // Padrão geral: QUALQUER sigla de 2-5 chars seguida de _UFG em path /up/NNN/o/
  // (estrutura do Weby UFG para assets de unidades)
  { pattern: /\/up\/\d+\/o\/([a-z]{2,5})[-_]ufg/i, unit: 'UNIT' },
  // Sigla + UFG (sem underscore, ex: imeufg, infufg)
  { pattern: /\b(ime|inf|ib|icb|fanut|facomb|fav|fen|fgg|emac|emcs|fefd|eseffego|fo|fd|fm|iptsp|iesa|cegraf|ccom|eeca|esuc|evz|evea)\b[-_]?ufg/i, unit: 'UNIT' },
  // Padrões "logo-IME" / "IME-logo" / "logoIME"
  { pattern: /logo[-_]?(ime|inf|ib|icb|fanut|facomb|fav|fen|fgg|emac|emcs|eeca)\b/i, unit: 'UNIT' },
  { pattern: /\b(ime|inf|ib|icb|fanut|facomb|fav|fen|fgg|emac|emcs|eeca)[-_]logo/i, unit: 'UNIT' },
  // Sigla de unidade no meio do filename (2-5 chars)
  { pattern: /\b(ime|inf|ib|icb|fanut|facomb|fav|fen|fgg|emac|emcs|em|ccom|iesa|cegraf|eeca|evz|evea|esuc|ff|fev|fch|fl|famed)\b[._-][a-z0-9_.-]*\.(png|jpg|svg|webp)/i, unit: 'UNIT' },
];
// v1.2: Lista expandida de unidades pra verificar no título/descrição.
// Siglas UFG são SEMPRE em CAIXA ALTA, então a regex só conta matches
// em UPPERCASE (evita falso positivo de "em", "de", "a" etc que são
// stopwords em português).
const UNIT_SIGLAS = ['ime', 'inf', 'ib', 'icb', 'fanut', 'facomb', 'fav', 'fen', 'fgg', 'emac', 'emcs', 'fefd', 'eseffego', 'fo', 'fd', 'fm', 'iptsp', 'iesa', 'cegraf', 'ccom', 'em', 'fe', 'ff', 'fev', 'fch', 'fl', 'famed', 'eeca', 'esuc', 'evz', 'evea', 'ecl', 'ecc', 'eec', 'eeec', 'emc', 'emesc', 'ea', 'eaec', 'esa', 'esac', 'efc'];
const UNIT_REGEX_FOR_TITLE = new RegExp(`\\b(${UNIT_SIGLAS.join('|').toUpperCase()})\\b`);
// v1.2: Sinônimos (sigla → variações do nome que aparecem em texto)
// Reduz falsos positivos quando post fala "Farmacia" mas usa logo "FF".
const UNIT_SYNONYMS = {
  ff: ['farmacia', 'farma', 'farmacêutic', 'medicament'],
  fe: ['enfermagem'],
  fo: ['odontolog', 'odonto'],
  fd: ['direito'],
  fav: ['artes visuais', 'artes'],
  fen: ['enfermagem'],
  fgg: ['geografia'],
  fen: ['enfermagem'],
  fch: ['ciências humanas', 'historia', 'história', 'filosofia', 'ciencias humanas', 'ciências sociais'],
  famed: ['medicina', 'medic'],
  ccom: ['comunica', 'jornalism'],
  cegraf: ['grafica', 'editorial'],
  iesa: ['socioambientais', 'meio ambiente'],
  iptsp: ['saude publica', 'patologia', 'tropical'],
  eseffego: ['educacao fisica', 'ef'],
  facomb: ['comunicacao', 'jornalism'],
  eeca: ['engenharia civil', 'eng civil', 'engenharia ambiental'],
  esuc: ['enfermagem', 'saude coletiva'],
  evz: ['veterinaria', 'zootecnia'],
  evea: ['veterinaria'],
  emac: ['arte', 'cultura', 'music', 'teatro'],
  emcs: ['ciencias sociais'],
  iptsp: ['saude publica', 'medicina tropical'],
  iesa: ['socioambientais'],
  fgg: ['geografia'],
  fch: ['historia', 'história', 'filosofia', 'sociologia'],
  ecl: ['letras'],
  ecc: ['ciencias contabeis', 'contabeis'],
  eec: ['engenharia eletrica'],
  eeec: ['engenharia eletrica'],
  emc: ['engenharia mecanica', 'eng mecanica'],
  emesc: ['medic'],
  ea: ['engenharia'],
  eaec: ['engenharia'],
  esa: ['saude'],
  esac: ['saude'],
  efc: ['educacao', 'fisica'],
  ib: ['biologia', 'biolog'],
  icb: ['ciencias biologicas', 'biomedic'],
};
// v1.2: Mapear sigla → nome legível para mensagens
const UNIT_FULLNAMES = {
  ime: 'IME', inf: 'INF', ib: 'IB', icb: 'ICB',
  fanut: 'FANUT', facomb: 'FACOMB', fav: 'FAV', fen: 'FEN', fgg: 'FGG',
  emac: 'EMAC', emcs: 'EMCS', em: 'EM', emc: 'EMC',
  fe: 'FE', ff: 'FF', fefd: 'FEFD', eseffego: 'ESEFFEGO',
  fo: 'FO', fd: 'FD', fm: 'FM', iptsp: 'IPTSP',
  iesa: 'IESA', cegraf: 'CEGRAF', ccom: 'CCOM',
  eeca: 'EECA', esuc: 'ESUC', evz: 'EVZ', evea: 'EVEA',
  fch: 'FCH', fl: 'FL', famed: 'FAMED',
  fav: 'FAV', fch: 'FCH', ecl: 'ECL', ecc: 'ECC', eec: 'EEC', eeec: 'EEEC',
  emc: 'EMC', emesc: 'EMESC', ea: 'EA', eaec: 'EAEC', esa: 'ESA', esac: 'ESAC', efc: 'EFC',
};
// v1.2: Extrair sigla específica da URL da imagem
function extractSiglaFromUrl(url) {
  if (!url) return 'subunidade';
  // Tentar padrão /up/NNN/o/SIGLA_ufg primeiro
  const m1 = url.match(/\/up\/\d+\/o\/([a-z]{2,5})[-_]ufg/i);
  if (m1) {
    const sigla = m1[1].toLowerCase();
    if (UNIT_FULLNAMES[sigla]) return UNIT_FULLNAMES[sigla];
    return sigla.toUpperCase();
  }
  // Tentar outros padrões
  for (const { pattern } of LOGO_INSTITUCIONAL_PATTERNS) {
    const m = url.match(pattern);
    if (m) {
      const sig = m[1] || m[0];
      const siglaMatch = sig.match(/\b([a-z]{2,5})\b/i);
      if (siglaMatch && UNIT_FULLNAMES[siglaMatch[1].toLowerCase()]) {
        return UNIT_FULLNAMES[siglaMatch[1].toLowerCase()];
      }
    }
  }
  return 'subunidade';
}

// === Env ===

const env = {};
function loadEnv() {
  try {
    if (!fs.existsSync(ENV_FILE)) return;
    fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([^=#]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
}
loadEnv();

// Compose environment is authoritative; the legacy publisher file remains a
// compatibility fallback only. This mirrors the aliases advertised by the
// pipeline preflight instead of reporting a stage ready under unusable names.
const runtimeEnv = { ...env, ...process.env };
const ANON_KEY = runtimeEnv.CADU_SUPABASE_ANON_KEY
  || runtimeEnv.SUPABASE_ANON_KEY
  || runtimeEnv.KINOCAMPUS_SUPABASE_ANON_KEY;
const KINO_EMAIL = runtimeEnv.CADU_KINO_EMAIL || runtimeEnv.CADU_EMAIL;
const KINO_PASSWORD = runtimeEnv.CADU_KINO_PASSWORD || runtimeEnv.CADU_PASSWORD;
// 2026-08-25: switched default to deepseek-v4-flash-vision-exp (V4-Flash
// Vision Exp) with reasoning_effort=max for the semantic dedup classifier.
// Old text-only models stay in the allowed set as a defensive fallback so
// an operator can roll back via CADU_DEEPSEEK_MODEL env var.
const ALLOWED_DEEPSEEK_MODELS = new Set([
  'deepseek-v4-flash-vision-exp',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
]);

function resolveDeepSeekEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(String(value || 'https://api.deepseek.com/v1/chat/completions').trim());
  } catch (_) {
    throw new Error('DeepSeek endpoint must be a valid URL');
  }
  if (endpoint.protocol !== 'https:'
      || endpoint.hostname !== 'api.deepseek.com'
      || endpoint.port
      || endpoint.username
      || endpoint.password) {
    throw new Error('DeepSeek endpoint must use https://api.deepseek.com');
  }
  if (!['/chat/completions', '/v1/chat/completions'].includes(endpoint.pathname.replace(/\/+$/, ''))) {
    throw new Error('DeepSeek endpoint must target /v1/chat/completions');
  }
  endpoint.pathname = '/v1/chat/completions';
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString();
}

function resolveDeepSeekModel(value) {
  const model = String(value || 'deepseek-v4-flash-vision-exp').trim();
  if (!ALLOWED_DEEPSEEK_MODELS.has(model)) {
    throw new Error('DeepSeek model must be deepseek-v4-flash-vision-exp, deepseek-v4-flash, or deepseek-v4-pro');
  }
  return model;
}

const DEEPSEEK_API_KEY = runtimeEnv.CADU_DEEPSEEK_API_KEY
  || runtimeEnv.DEEPSEEK_API_KEY;
const DEEPSEEK_ENDPOINT = resolveDeepSeekEndpoint(
  runtimeEnv.CADU_DEEPSEEK_ENDPOINT || runtimeEnv.CADU_AI_ENDPOINT,
);
const DEEPSEEK_MODEL = resolveDeepSeekModel(
  runtimeEnv.CADU_DEEPSEEK_MODEL || runtimeEnv.DEEPSEEK_MODEL || runtimeEnv.CADU_AI_MODEL,
);

// === Stage 1: Texto ===

function normalize(t) {
  if (!t) return '';
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tokenize(t) {
  return normalize(t).split(' ').filter(w => w.length > 2);
}

function shingles(tokens, n = 3) {
  const s = new Set();
  for (let i = 0; i <= tokens.length - n; i++) {
    s.add(tokens.slice(i, i + n).join(' '));
  }
  return s;
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Levenshtein normalizado (1 = idêntico, 0 = totalmente diferente)
function levenshteinRatio(a, b) {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  if (m === 0 && n === 0) return 1;
  if (m === 0 || n === 0) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}

function detectLogoInstitucional(imageUrl) {
  if (!imageUrl) return null;
  for (const { pattern, unit } of LOGO_INSTITUCIONAL_PATTERNS) {
    if (pattern.test(imageUrl)) return { pattern: pattern.source, unit };
  }
  return null;
}

// === Stage 2: Imagem (pHash perceptual) ===

async function computePHash(imageUrl) {
  if (!imageUrl) return null;
  try {
    // Baixa imagem como buffer
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'CaduBot-Dedup/1.0' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null; // imagem muito pequena = provavelmente logo
    // Reduz para 8x8 grayscale
    const { data } = await sharp(buf)
      .resize(8, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Calcula média
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    // Cada pixel: 1 se >= média, 0 caso contrário → 64 bits
    let hash = '';
    for (let i = 0; i < data.length; i++) {
      hash += data[i] >= avg ? '1' : '0';
    }
    return hash;
  } catch (e) {
    return null;
  }
}

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) dist++;
  }
  return dist;
}

// Hash auxiliar: SHA256 do conteúdo bruto (detecta imagens IDÊNTICAS byte a byte)
async function computeContentHash(imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'CaduBot-Dedup/1.0' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

// === Stage 3: Semântica (DeepSeek) ===

async function callAI(prompt, retries = 3) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('Chave DeepSeek ausente');
  }
  const delays = [10000, 20000, 40000];
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(DEEPSEEK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: 'system',
              content: 'Você é um classificador de eventos acadêmicos UFG. Responda APENAS com JSON válido, sem markdown, sem tags <think>.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4000,
          temperature: 0.1,
          // 2026-08-25: V4-Flash Vision Exp with max reasoning.
          // The classifier benefits from richer thinking on ambiguous pairs.
          thinking: { type: 'enabled' },
          reasoning_effort: 'max',
          response_format: { type: 'json_object' },
        }),
        // Vision Exp with max reasoning can take >60s on a long pair list;
        // bump the per-call ceiling to 180s to give the model room before
        // the outer retry path kicks in. Retry is still 3x with 10/20/40s.
        signal: AbortSignal.timeout(180000),
      });
      if (res.status === 429) {
        const wait = delays[attempt] || 20000;
        console.log(`   ⏳ IA rate-limited, aguardando ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`IA HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '';
      // Remove blocos de raciocínio defensivamente, caso o upstream os envie.
      return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delays[attempt] || 5000));
    }
  }
  throw new Error('IA falhou após retries');
}

const SEMANTIC_PROMPT = (a, b) => `Analise se estes dois posts do Kino Campus (plataforma acadêmica UFG) tratam do MESMO EVENTO/EDITAL/OPORTUNIDADE ou se são distintos.

POST A:
- Título: ${a.title?.slice(0, 200)}
- Site: ${a._site || 'desconhecido'}
- Descrição (300 chars): ${(a.description || '').slice(0, 300)}

POST B:
- Título: ${b.title?.slice(0, 200)}
- Site: ${b._site || 'desconhecido'}
- Descrição (300 chars): ${(b.description || '').slice(0, 300)}

Responda SOMENTE este JSON (sem markdown, sem \`\`\`):
{
  "mesmo_evento": true|false,
  "tipo_relacao": "duplicata_exata" | "repost_mesma_fonte" | "mesmo_evento_fontes_diferentes" | "eventos_distintos" | "ambiguo",
  "confianca": 0.0-1.0,
  "recomendacao": "hide_b" | "hide_a" | "manter_ambos" | "revisar_manual",
  "motivo": "explicação curta em 1 frase"
}`;

async function classifySemantica(pairs) {
  console.log(`\n🧠 STAGE 3: Classificação semântica (DeepSeek) para ${pairs.length} pares...`);
  const results = [];
  for (let i = 0; i < pairs.length; i++) {
    const { a, b } = pairs[i];
    try {
      const raw = await callAI(SEMANTIC_PROMPT(a, b));
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log(`   ⚠️ IA retornou não-JSON: ${raw.slice(0, 100)}`);
        results.push({ a: a.id, b: b.id, error: 'invalid_json', raw: raw.slice(0, 300) });
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      results.push({ a: a.id, b: b.id, ...parsed });
      console.log(`   ${i+1}/${pairs.length} | ${a.title?.slice(0, 40)} ↔ ${b.title?.slice(0, 40)} → ${parsed.tipo_relacao} (${(parsed.confianca*100).toFixed(0)}%) → ${parsed.recomendacao}`);
      // Rate-limit: pequena pausa entre chamadas
      if (i < pairs.length - 1) await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.log(`   ⚠️ Par ${i+1} falhou: ${e.message.slice(0, 80)}`);
      results.push({ a: a.id, b: b.id, error: e.message.slice(0, 200) });
    }
  }
  return results;
}

// === Carregar posts do Supabase ===

async function fetchRecentPosts(supabase, bearer, days) {
  console.log(`📥 Carregando posts publicados dos últimos ${days} dias...`);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const all = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=id,title,description,image_url,metadata,status,module,category,expires_at,moderation_reason,created_at&status=eq.published&created_at=gte.${since}&order=created_at.desc&limit=${limit}&offset=${offset}`,
      {
        headers: {
          'apikey': ANON_KEY,
          'Authorization': bearer,
        },
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Supabase HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const batch = await res.json();
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  console.log(`   ${all.length} posts carregados`);
  return all;
}

// === Ações no Supabase ===

async function closePastEvents(supabase, bearer, today) {
  // v1.4 (2026-06-15): Auto-close de eventos com TODAS as datas passadas
  // PATCH direto em posts com module='eventos', status='published' e dates.dates todas < today
  // Adiciona metadata.closed_at, closed_reason, closed_by
  // Fix S3 (2026-07-25): expandido para TAMBEM processar module='oportunidades'
  // (inscricoes encerradas). Antes: 14 posts com data_evento/deadline passada
  // permaneceram published por SEMANAS (auditoria rodada 1). Agora: auto-hide.
  console.log(`\n🔒 AUTO-CLOSE: procurando posts com todas as datas no passado (eventos + oportunidades)...`);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?or=(module.eq.eventos,module.eq.oportunidades)&status=eq.published&limit=400&select=id,title,module,metadata`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': bearer } }
  );
  if (!res.ok) {
    console.log(`   ❌ Falha ao listar eventos: HTTP ${res.status}`);
    return { closed: 0, failed: 0 };
  }
  const events = await res.json();

  const pastEvents = events.filter(p => {
    // Close by semantic role: events use their latest event date and
    // opportunities use their application deadline. A result/publication
    // date must never close an otherwise active opportunity.
    const lifecycleDate = latestRelevantLifecycleDate(p);
    if (!lifecycleDate || lifecycleDate >= today) return false;
    p._autoCloseReferenceDate = lifecycleDate;

    // v1.6 (2026-07-16): Pular posts reativados nas últimas 48h.
    // O `mergeIntoExisting` (publish_auto_v5) preserva o post canônico
    // (regra P2-OLDEST), então o metadata.expires_at/data_evento do post
    // antigo pode estar no passado mesmo quando o item NOVO do curador é
    // para um evento futuro. Sem este guard, o auto-close fecha o post
    // imediatamente após a reativação, criando um loop
    // "reativar → auto-close → reativar → auto-close" a cada hora.
    // Freeze window de 48h é suficiente para o cadu-pipeline (que roda
    // manualmente) publicar uma nova versão / atualizar a metadata
    // com a data correta antes do próximo auto-close.
    const reactivatedAt = p.metadata?._reactivated_from_closed_at;
    if (reactivatedAt) {
      const reactivatedMs = Date.parse(reactivatedAt);
      if (!Number.isNaN(reactivatedMs) && (Date.now() - reactivatedMs) < (48 * 60 * 60 * 1000)) {
        console.log(`   ⏭️ skip (reactivated há <48h): ${p.title.slice(0, 60)}`);
        return false;
      }
    }
    return true;
  });

  console.log(`   ${events.length} eventos/oportunidades publicados | ${pastEvents.length} com todas as datas no passado`);

  let closed = 0, failed = 0;
  for (const evt of pastEvents) {
    const meta = {
      ...(evt.metadata || {}),
      closed_at: new Date().toISOString(),
      closed_reason: 'data_semantica_encerrada',
      closed_by: 'cadu-auto-close',
      closed_reference_date: evt._autoCloseReferenceDate,
    };

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?id=eq.${evt.id}&status=eq.published`,
      {
        method: 'PATCH',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': bearer,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ status: 'closed', metadata: meta }),
      }
    );
    const changed = r.ok ? await r.json().catch(() => []) : [];
    if (r.ok && Array.isArray(changed) && changed.length === 1) {
      closed++;
      console.log(`   ✅ closed: ${evt.title.slice(0, 70)}`);
    } else {
      failed++;
      console.log(`   ❌ fail: ${evt.title.slice(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  return { closed, failed };
}

async function hidePost(supabase, bearer, postId, reason, audit = {}) {
  // F1 (2026-07-06): preservar metadata existente (source_url, content_hash,
  // cover_url, cadu_published, etc). Bug B5: o PATCH substituía o jsonb inteiro
  // → posts hidden ficavam sem referência pra audit/dedup retroativo.
  // Agora carrega metadata antes, faz merge, depois PATCH.
  let existingMeta = {};
  try {
    const sel = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=metadata,status&id=eq.${postId}`,
      { headers: { 'apikey': ANON_KEY, 'Authorization': bearer } }
    );
    if (sel.ok) {
      const data = await sel.json();
      if (!Array.isArray(data) || !data[0] || data[0].status !== 'published') return false;
      if (data[0].metadata && typeof data[0].metadata === 'object') existingMeta = data[0].metadata;
    }
  } catch (_) { /* mantém existingMeta = {} se falhar */ }

  const hiddenAt = new Date().toISOString();
  const mergedMeta = {
    ...existingMeta,
    hidden_by_dedup: true,
    hidden_reason: reason,
    hidden_at: hiddenAt,
    ...(audit.keepId ? { merged_into_post_id: audit.keepId } : {}),
    ...(audit.method ? { dedup_method: audit.method } : {}),
    ...(Array.isArray(audit.evidence) && audit.evidence.length > 0
      ? { dedup_evidence: [...new Set(audit.evidence.map(String))].slice(0, 24) }
      : {}),
    cadu_reactivation_blocked: true,
    cadu_reactivation_block: {
      reason: 'dedup_confirmed',
      detail: reason,
      blocked_by: 'cadu-dedup',
      blocked_at: hiddenAt,
    },
  };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?id=eq.${postId}&status=eq.published`,
    {
      method: 'PATCH',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': bearer,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        status: 'hidden',
        metadata: mergedMeta,
      }),
    }
  );
  if (!res.ok) return false;
  const changed = await res.json().catch(() => []);
  return Array.isArray(changed) && changed.length === 1;
}

async function flagReviewIssue(supabase, bearer, action) {
  const postId = action.target;
  // Não altera a imagem (pode ser a única); apenas flagga para revisão
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?select=metadata&id=eq.${postId}`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': bearer } }
  );
  const data = await res.json();
  const currentMeta = data[0]?.metadata || {};
  const review = {
    kind: action.method || 'manual_review',
    reason: action.reason || '',
    peer_post_id: action.target_b || null,
    flagged_at: new Date().toISOString(),
  };
  const previous = Array.isArray(currentMeta.dedup_review_flags)
    ? currentMeta.dedup_review_flags
    : [];
  const dedupReviewFlags = [...previous, review]
    .filter((entry, index, all) => all.findIndex(candidate => (
      candidate.kind === entry.kind
      && candidate.reason === entry.reason
      && candidate.peer_post_id === entry.peer_post_id
    )) === index)
    .slice(-24);
  const newMeta = {
    ...currentMeta,
    dedup_review_required: true,
    dedup_review_flags: dedupReviewFlags,
    ...(action.method === 'stage2_logo' ? {
      logo_review_flag: true,
      logo_review_info: action.logo_info || {},
      logo_review_at: review.flagged_at,
      logo_review_source: action.reason || '',
    } : {}),
  };
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?id=eq.${postId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': bearer,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ metadata: newMeta }),
    }
  );
  return r2.ok;
}

// === Main ===

// v1.4 (2026-06-15): Auto-close é chamado de dentro do main ANTES do dedup
// para que os hides não operem em posts já encerrados.

async function main() {
  const args = process.argv.slice(2);
  // Fix Y (2026-07-25): aceita --apply (CLI manual) ou --auto-apply (invocado pelo pipeline)
  // ANTES: so --apply, e pipeline passava nada, entao dedup SEMPRE rodava em DRY-RUN.
  // Resultado: 9 hiddens reportados mas nao aplicados no run 58267b6c.
  // DEPOIS: pipeline passa --auto-apply explicitamente quando !DRY_RUN.
  const DRY_RUN = !(args.includes('--apply') || args.includes('--auto-apply'));
  const NO_LLM = args.includes('--no-llm');
  const REPORT_ONLY = args.includes('--report');
  const SKIP_AUTO_CLOSE = args.includes('--no-auto-close');
  // v1.3 (2026-06-10): Aceitar tanto --days=N quanto --days N (com espaço)
  const daysIdx = args.findIndex(a => a === '--days' || a.startsWith('--days='));
  let days = 90;
  if (daysIdx !== -1) {
    if (args[daysIdx] === '--days' && args[daysIdx + 1]) {
      days = parseInt(args[daysIdx + 1], 10);
    } else if (args[daysIdx].startsWith('--days=')) {
      days = parseInt(args[daysIdx].split('=')[1], 10);
    }
  }
  // v1.3: mesmo para --limit
  const limitIdx = args.findIndex(a => a === '--limit' || a.startsWith('--limit='));
  let limit = MAX_PAIRS_FOR_LLM;
  if (limitIdx !== -1) {
    if (args[limitIdx] === '--limit' && args[limitIdx + 1]) {
      limit = parseInt(args[limitIdx + 1], 10);
    } else if (args[limitIdx].startsWith('--limit=')) {
      limit = parseInt(args[limitIdx].split('=')[1], 10);
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('🧹 DEDUP-KINO — Deduplicação dedicada de posts');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN (apenas relatório)' : '🔴 APPLY (altera Supabase)'}`);
  console.log(`LLM (Stage 3): ${NO_LLM ? 'DESLIGADO' : 'ATIVO (IA)'}`);
  console.log(`Lookback: ${days} dias | Limite IA: ${limit} pares`);
  console.log('');

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

  if (!ANON_KEY) {
    console.error('❌ Chave anônima do Supabase ausente no ambiente');
    process.exit(1);
  }
  if (!KINO_EMAIL || !KINO_PASSWORD) {
    console.error('❌ Credenciais técnicas do KinoCampus ausentes no ambiente');
    process.exit(1);
  }
  if (!NO_LLM && !DEEPSEEK_API_KEY) {
    console.error('⚠️ Chave DeepSeek ausente; forçando --no-llm');
  }

  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  let auth;
  try {
    auth = await signInWithRetry(supabase, KINO_EMAIL, KINO_PASSWORD, {
      onAttempt: (a, e) => e && console.log(`  auth attempt ${a}: ${e.name || 'err'} status=${e.status || '?'}`),
    });
  } catch (e) {
    console.error('❌ Login falhou apos retries:', e.message);
    process.exit(1);
  }
  const bearer = `Bearer ${auth.session.access_token}`;
  activeAuthClient = supabase;
  console.log(`🔑 Logado como ${auth.user.id} (apos ${auth.attempts} tentativa(s))\n`);

  // === Carregar posts ===
  const posts = await fetchRecentPosts(supabase, bearer, days);
  if (posts.length < 2) {
    console.log('✅ Posts insuficientes para comparar.');
    return;
  }

  // Adicionar metadados úteis
  for (const p of posts) {
    p._tokens = tokenize(p.title);
    p._shingles = shingles(p._tokens);
    p._titleNorm = normalize(p.title);
    p._site = p.metadata?.source_site || p.metadata?.site || 'desconhecido';
    p._sourceUrl = p.metadata?.source_url || p.metadata?.link || '';
    p._canonicalUrl = canonicalUrl(p._sourceUrl);
    p._logoInfo = detectLogoInstitucional(p.image_url || '');
  }

  // === STAGE 1: Texto (V2 — token Jaccard + containment + substring) ===
  console.log(`\n📝 STAGE 1: Análise textual (V2: token Jaccard + containment + substring + URL canônica + Weby event slug)...`);
  const stage1Candidates = [];
  const exactUrlDups = [];
  // Fix W: duplicates that share the same Weby event slug (e.g., /e/39293-cerise-summit
  // and /n/202881-cerise-summit both refer to the same event)
  const webySlugDups = [];

  // Tokens genéricos que sozinhos não caracterizam evento (replicado do backfill-kino-fixes)
  const GENERIC_TOKENS = new Set([
    'mestrado','doutorado','vagas','abre','abertas','aberta','selecao','selecoes','processo',
    'seletivo','edital','bolsa','bolsas','inscricao','inscricoes','programa','projeto','divulga',
    'publica','publicado','publicada','evento','eventos','oportunidade','oportunidades',
    'vaga','edicao','gratuita','gratuito','gratis','nova','novo','novas','novos','havera',
    'tera','sera','acontece','realiza','promove','oferece','proex','ufg','universidade',
    'federal','goias','goiania','goias','brasil','brasileira','brasileiro','hoje','amanha',
    'participe','confira','inscreva','acesse','saiba','edicao','edicoes',
    'apoiando','oferecimento','campus','unidade','unidades','programa','programas',
  ]);

  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i], b = posts[j];
      // Match exato por URL canônica
      if (a._canonicalUrl && b._canonicalUrl && a._canonicalUrl === b._canonicalUrl) {
        exactUrlDups.push({ a, b, score: 1.0, method: 'canonical_url' });
        continue;
      }
      // Fix W (2026-07-25): match por slug de evento Weby
      // /e/39293-cerise-summit-2026 e /n/202881-cerise-summit-2026 compartilham slug
      if (webySameEvent(a._sourceUrl, b._sourceUrl)) {
        webySlugDups.push({ a, b, score: 1.0, method: 'weby_event_slug' });
        continue;
      }
      // V2: Jaccard de TOKENS (não shingles) + containment
      const ta = a._tokens, tb = b._tokens;
      const sa = new Set(ta), sb = new Set(tb);
      let inter = 0;
      const shared = [];
      for (const x of sa) if (sb.has(x)) { inter++; shared.push(x); }
      const j_tok = (sa.size + sb.size - inter) === 0 ? 0 : inter / (sa.size + sb.size - inter);
      const c_tok = Math.min(sa.size, sb.size) === 0 ? 0 : inter / Math.min(sa.size, sb.size);
      // V2: Substring check (>= 15 chars)
      const na = a._titleNorm, nb = b._titleNorm;
      const minN = na.length < nb.length ? na : nb;
      const sub = minN.length >= 15 && (na.includes(nb) || nb.includes(na));
      // V2: Distinctive tokens (não-genéricos, >=4 chars) compartilhados
      const distinctiveShared = shared.filter(t => !GENERIC_TOKENS.has(t) && t.length >= 4);
      // Decisão
      let isDup = false, method = null, score = 0;
      if (sub && distinctiveShared.length >= 1) {
        isDup = true; method = 'substring_v2'; score = 1.0;
      } else if (distinctiveShared.length >= 3 && (j_tok >= 0.30 || c_tok >= 0.50)) {
        isDup = true; method = 'distinctive_v2'; score = j_tok;
      } else if (j_tok >= 0.55 && shared.length >= 4) {
        isDup = true; method = 'jaccard_tokens_v2'; score = j_tok;
      } else if (c_tok >= 0.75 && shared.length >= 4) {
        isDup = true; method = 'containment_v2'; score = c_tok;
      } else if (j_tok >= JACCARD_THRESHOLD) {
        // Fallback: shingles 3-grams (legado)
        isDup = true; method = 'jaccard_shingles'; score = j_tok;
      } else {
        const lev = levenshteinRatio(a._titleNorm, b._titleNorm);
        if (lev >= LEVENSHTEIN_THRESHOLD) {
          isDup = true; method = 'levenshtein'; score = lev;
        }
      }
      if (isDup) {
        stage1Candidates.push({ a, b, score, method, jaccard: j_tok, containment: c_tok, shared: shared.length });
      }
    }
  }

  // Ordenar por score
  stage1Candidates.sort((x, y) => y.score - x.score);

  console.log(`   Duplicatas exatas (URL canônica): ${exactUrlDups.length}`);
  console.log(`   Duplicatas por slug de evento Weby (Fix W): ${webySlugDups.length}`);
  console.log(`   Candidatos textuais: ${stage1Candidates.length}`);
  if (stage1Candidates.length > 0) {
    console.log('   Top 5:');
    stage1Candidates.slice(0, 5).forEach(c => {
      console.log(`     [${c.method}] ${(c.score*100).toFixed(0)}% | ${c.a.title?.slice(0, 50)} ↔ ${c.b.title?.slice(0, 50)}`);
    });
  }

  // === STAGE 1.5: Content-Hash Dedup (Fix Q - 2026-07-25) ===
  // Caso real: posts com imagens IDENTICAS byte-a-byte mas URLs/titulos
  // diferentes. O Stage 2 (pHash) só roda em pares do Stage 1 (text-similar)
  // ou exactUrlDups — perdia 100% destes casos. Exemplo 2026-07-24:
  // 8 grupos de duplicatas, 15 posts (Centro de Linguas 3x, IX SIPACV 3x,
  // ICB 2x, etc). Content hash (SHA256 dos bytes) e' O(1) por post, nao
  // depende de pHash perceptual. Cobre o caso comum (mesma imagem
  // reutilizada). Diferencas de resize/compressao ainda caem no Stage 2.
  console.log(`\n🔍 STAGE 1.5: Content-Hash Dedup (imagens identicas byte-a-byte)...`);
  const contentHashDups = [];
  const hashToPosts = new Map();
  for (const p of posts) {
    if (!p._contentHash) {
      try {
        p._contentHash = await computeContentHash(p.image_url);
      } catch (e) {
        p._contentHash = null;
      }
    }
    if (!p._contentHash) continue;
    if (!hashToPosts.has(p._contentHash)) {
      hashToPosts.set(p._contentHash, []);
    }
    hashToPosts.get(p._contentHash).push(p);
  }
  let contentHashGroups = 0;
  for (const [hash, plist] of hashToPosts) {
    if (plist.length < 2) continue;
    contentHashGroups += 1;
    // Gerar todos os pares
    for (let i = 0; i < plist.length; i++) {
      for (let j = i + 1; j < plist.length; j++) {
        const a = plist[i], b = plist[j];
        const srcA = a.metadata?.source_unit || a._sourceUnit || '';
        const srcB = b.metadata?.source_unit || b._sourceUnit || '';
        const sameSource = Boolean(srcA && srcB && srcA === srcB);
        contentHashDups.push({
          a, b,
          method: 'content_hash',
          content_hash: hash,
          same_source: sameSource,
          source_unit_a: srcA,
          source_unit_b: srcB,
        });
      }
    }
  }
  console.log(`   Posts com image content_hash: ${hashToPosts.size}`);
  console.log(`   Grupos de duplicatas (>=2 posts/mesma imagem): ${contentHashGroups}`);
  console.log(`   Pares a investigar: ${contentHashDups.length}`);
  // Sample
  contentHashDups.slice(0, 5).forEach(d => {
    const tag = d.same_source ? '[SAME_SRC]' : '[DIFF_SRC]';
    console.log(`     ${tag} ${d.a.id.slice(0, 8)} ↔ ${d.b.id.slice(0, 8)}: ${d.a.title?.slice(0, 50)} ↔ ${d.b.title?.slice(0, 50)}`);
  });

  // === STAGE 2: Imagem ===
  console.log(`\n🖼️ STAGE 2: Análise de imagem (pHash + logo inadequada)...`);

  // Detectar logos inadequadas em TODOS os posts (não precisa de par)
  const logoIssues = [];
  for (const p of posts) {
    if (!p._logoInfo) continue;
    // Verifica se o post fala sobre aquela unidade (sigla OU nome completo)
    const titleAndDesc = p.title + ' ' + (p.description || '');
    const sigla = extractSiglaFromUrl(p.image_url);
    const siglaLower = sigla.toLowerCase();
    // Sigla em UPPERCASE no título
    const siglaInTitle = UNIT_REGEX_FOR_TITLE.test(titleAndDesc);
    // Sinonimos da unidade (ex: FF = "farmacia", "farmaceutica")
    const sinonimos = UNIT_SYNONYMS[siglaLower] || [];
    const sinonimoInTitle = sinonimos.some(s => titleAndDesc.toLowerCase().includes(s));
    if (!siglaInTitle && !sinonimoInTitle) {
      logoIssues.push({
        post: p,
        logo: p._logoInfo,
        reason: `image_url contém padrão de logo da subunidade "${sigla}" mas o post não menciona essa subunidade (nem sigla nem nome) no título/descrição`,
      });
    }
  }
  console.log(`   Logos inadequadas detectadas: ${logoIssues.length}`);
  logoIssues.slice(0, 5).forEach(li => {
    console.log(`     [${li.logo.unit}] ${li.post.title?.slice(0, 60)} → ${li.post.image_url?.slice(0, 60)}`);
  });

  // pHash para candidatos do Stage 1 (e URL exata, e Weby event slug - Fix W)
  const stage1AndUrl = [...stage1Candidates, ...exactUrlDups, ...webySlugDups];
  console.log(`   Calculando pHash de ${stage1AndUrl.length} pares...`);

  const imageConfirmedPairs = [];
  let processed = 0;
  for (const c of stage1AndUrl) {
    processed++;
    if (processed % 10 === 0) console.log(`     ${processed}/${stage1AndUrl.length}...`);
    const [hashA, hashB] = await Promise.all([
      computePHash(c.a.image_url),
      computePHash(c.b.image_url),
    ]);
    if (!hashA || !hashB) {
      c.phash_status = 'fetch_failed';
      continue;
    }
    const dist = hammingDistance(hashA, hashB);
    c.phash_distance = dist;
    c.phash_status = dist <= PHASH_HAMMING_MAX ? 'similar' : 'different';
    if (dist <= PHASH_HAMMING_MAX) {
      imageConfirmedPairs.push(c);
    }
    // Pausa leve para não martelar
    await new Promise(r => setTimeout(r, 100));
  }
  console.log(`   Pares com imagem similar (Hamming ≤ ${PHASH_HAMMING_MAX}): ${imageConfirmedPairs.length}`);

  // === STAGE 3: Semântica (DeepSeek) ===
  let semanticaResults = [];
  let pairsForLLM = [];

  if (!NO_LLM && DEEPSEEK_API_KEY) {
    // v1.3: Stage 3 só para casos AMBÍGUOS. Duplicatas exatas (URL canônica)
    // são 100% seguras e vão direto pro hide — IA só atrasaria.
    // Candidatos à IA:
    //   - image similar (Hamming ≤ 10) com Stage 1 não-exato
    //   - text candidates com Jaccard 0.50-0.85 OU Levenshtein 0.70-0.95
    //   - (NÃO inclui exact_url_dups)
    const seen = new Set();
    const addToLLM = (c) => {
      const key = [c.a.id, c.b.id].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      pairsForLLM.push(c);
    };
    // Image similar (não-duplicatas exatas)
    imageConfirmedPairs.filter(c => !c.method || c.method !== 'canonical_url').forEach(addToLLM);
    // Text candidates na zona ambígua
    stage1Candidates.filter(c => {
      if (c.method === 'canonical_url') return false;
      if (c.score >= 0.70 && c.score < 0.95) return true;
      return false;
    }).forEach(addToLLM);

    // Limitar
    pairsForLLM = pairsForLLM.slice(0, limit);

    if (pairsForLLM.length > 0) {
      semanticaResults = await classifySemantica(pairsForLLM);
    } else {
      console.log(`\n🧠 STAGE 3: Nenhum par candidato para DeepSeek.`);
    }
  }

  // === Compilar relatório ===
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply',
    days,
    total_posts: posts.length,
    stage1: {
      exact_url_dups: exactUrlDups.length,
      weby_event_slug_dups: webySlugDups.length,
      text_candidates: stage1Candidates.length,
    },
    stage1_5: {
      content_hash_groups: contentHashGroups,
      content_hash_pairs: contentHashDups.length,
      note: 'Exact image bytes are supporting evidence only.',
    },
    stage2: {
      image_similar_pairs: imageConfirmedPairs.length,
      logo_issues: logoIssues.length,
    },
    stage3: {
      llm_pairs_evaluated: pairsForLLM.length,
      semantica_results: semanticaResults,
    },
    actions_planned: [],
  };

  // Decidir ações baseadas em Stage 1+2+3
  const plannedActionKeys = new Set();
  const actionLog = (action) => {
    const actionKey = action.action === 'hide'
      ? `hide|${action.target}`
      : `${action.action}|${action.target}|${action.target_b || ''}|${action.method || ''}`;
    if (plannedActionKeys.has(actionKey)) return false;
    plannedActionKeys.add(actionKey);
    report.actions_planned.push(action);
    console.log(`   ${DRY_RUN ? '📋' : '🔴'} ${action.action}: ${action.target_title || action.target} — ${action.reason}`);
    return true;
  };
  const seenActions = new Set(); // dedup por target+method

  console.log(`\n🎯 DECISÕES:`);

  // (1) URL canônica idêntica → confirmar com PELO MENOS UM sinal adicional
  //     v1.7 (2026-07-16): o curator pode produzir múltiplos posts legítimos a
  //     partir de uma MESMA página de origem quando ela é uma "compilação" (ex:
  //     PRPG lista 14 programas de Aluno Especial numa única URL âncora, e o
  //     curator gera 1 post "compilação" + N posts individuais). Tratar URL
  //     canônica idêntica como duplicata absoluta escondia o post de compilação
  //     sempre que houvesse um post individual mais antigo no mesmo source_url.
  //     v1.7.1 (2026-07-16): refina o critério. confirmed = imagesSimilar
  //     (pHash match é prova forte) OU (titleSimilar >= 0.4 E sameOppType)
  //     (títulos parecidos do mesmo tipo de oportunidade é duplicata real).
  //     Apenas titleSimilar não basta — duas oportunidades distintas do mesmo
  //     tópico podem compartilhar palavras-chave no título. Apenas sameOppType
  //     também não basta — compilação (14 programas) e item específico
  //     (Psicologia) compartilham opportunityType mas são conteúdo distinto.
  const urlDupConfirmation = (c) => {
    const imagesSimilar = c.phash_status === 'similar';
    const opA = c.a.metadata?.opportunityType || '';
    const opB = c.b.metadata?.opportunityType || '';
    const sameOppType = opA && opB && opA === opB;
    const decision = decideDuplicatePair(c.a, c.b, {
      sameCanonicalUrl: true,
      sameImage: imagesSimilar,
    });
    return {
      imagesSimilar,
      titleSimilar: decision.signals.titles.strong,
      titleJaccard: decision.signals.titles.jaccard,
      sameOppType,
      confirmed: decision.autoHide,
      decision,
    };
  };
  for (const c of exactUrlDups) {
    const conf = urlDupConfirmation(c);
    const older = c.a.created_at < c.b.created_at ? c.a : c.b;
    const newer = older === c.a ? c.b : c.a;
    if (!conf.confirmed) {
      // Sem confirmação adicional: flag para revisão manual ao invés de
      // esconder cegamente. Mantém a URL canônica idêntica visível no relatório.
      const key = `flag|${c.a.id}|${c.b.id}|stage1_url_unconfirmed`;
      if (!seenActions.has(key)) {
        seenActions.add(key);
        actionLog({
          action: 'flag_review',
          target: c.a.id,
          target_b: c.b.id,
          target_title: c.a.title,
          target_b_title: c.b.title,
          reason: `URL canônica idêntica sem corroboração suficiente (pHash=${c.phash_status || 'n/a'}, title_jaccard=${(conf.titleJaccard*100).toFixed(0)}%, conflitos=${conf.decision.conflicts.join(',') || 'nenhum'}) — possível compilação vs item específico`,
          method: 'stage1_url_unconfirmed',
        });
      }
      continue;
    }
    const key = `hide|${newer.id}|stage1_url`;
    if (seenActions.has(key)) continue;
    seenActions.add(key);
    actionLog({
      action: 'hide',
      target: newer.id,
      target_title: newer.title,
      reason: `URL canônica idêntica + ${conf.decision.reasons.join(' + ')}`,
      method: 'stage1_url',
      keep_id: older.id,
    });
  }

  // Weby /e/ and /n/ pages with the same host+slug identify the same event.
  for (const c of webySlugDups) {
    const older = c.a.created_at < c.b.created_at ? c.a : c.b;
    const newer = older === c.a ? c.b : c.a;
    const decision = decideDuplicatePair(c.a, c.b, { sameWebyEvent: true });
    if (decision.autoHide) {
      actionLog({
        action: 'hide',
        target: newer.id,
        target_title: newer.title,
        reason: `Mesmo evento Weby (host + slug) + ${decision.reasons.join(' + ')}`,
        method: 'stage1_weby_event',
        keep_id: older.id,
      });
    } else {
      actionLog({
        action: 'flag_review',
        target: newer.id,
        target_b: older.id,
        target_title: newer.title,
        target_b_title: older.title,
        reason: `Mesmo slug Weby, mas há conflito de identidade: ${decision.conflicts.join(', ')}`,
        method: 'stage1_weby_conflict',
      });
    }
  }

  // (1.5) Content-hash is supporting evidence, never identity by itself.
  // Imagens IDENTICAS byte-a-byte (SHA256). Caso real: 8 grupos/15 posts
  // no run 2026-07-24 (Centro de Linguas 3x, IX SIPACV 3x, ICB 2x, etc).
  // Stage 2 pHash só roda em pares de Stage 1+URL-dup, perdia 100% destes.
  //
  for (const d of contentHashDups) {
    const older = d.a.created_at < d.b.created_at ? d.a : d.b;
    const newer = older === d.a ? d.b : d.a;
    const key = `act|${newer.id}|stage15_content_hash`;
    if (seenActions.has(key)) continue;
    seenActions.add(key);
    const decision = decideDuplicatePair(d.a, d.b, { sameImage: true });
    const reasonPrefix = d.same_source
      ? `Imagem IDÊNTICA byte-a-byte (SHA256=${d.content_hash.slice(0, 12)}...) + mesmo source_unit "${d.source_unit_a}"`
      : `Imagem IDÊNTICA byte-a-byte (SHA256=${d.content_hash.slice(0, 12)}...) mas source_units DIFERENTES: "${d.source_unit_a}" vs "${d.source_unit_b}" (provável bug de cache/imagem compartilhada — investigar formatador)`;
    if (decision.autoHide) {
      actionLog({
        action: 'hide',
        target: newer.id,
        target_title: newer.title,
        reason: `${reasonPrefix}; identidade corroborada por ${decision.reasons.join(' + ')}`,
        method: 'stage15_content_hash_auto',
        content_hash: d.content_hash,
        same_source: Boolean(d.same_source),
        source_unit_a: d.source_unit_a,
        keep_id: older.id,
      });
    } else {
      actionLog({
        action: 'flag_review',
        target: newer.id,
        target_b: older.id,
        target_title: newer.title,
        target_b_title: older.title,
        reason: `${reasonPrefix}; imagem isolada não prova identidade${decision.conflicts.length ? `; conflitos=${decision.conflicts.join(',')}` : ''}`,
        method: 'stage15_content_hash',
        content_hash: d.content_hash,
        same_source: Boolean(d.same_source),
        source_unit_a: d.source_unit_a,
        source_unit_b: d.source_unit_b,
      });
    }
  }

  // Deterministic cross-source duplicates are important because the inline
  // pipeline intentionally runs without the LLM. Require multiple independent
  // signals (title/entity/date/fingerprint) before hiding.
  for (const c of stage1Candidates) {
    const decision = decideDuplicatePair(c.a, c.b, {
      sameImage: Boolean(c.a._contentHash && c.a._contentHash === c.b._contentHash),
    });
    if (!decision.autoHide) continue;
    const older = c.a.created_at < c.b.created_at ? c.a : c.b;
    const newer = older === c.a ? c.b : c.a;
    actionLog({
      action: 'hide',
      target: newer.id,
      target_title: newer.title,
      reason: `Duplicata determinística entre fontes: ${decision.reasons.join(' + ')}`,
      method: 'stage1_deterministic_identity',
      keep_id: older.id,
      evidence: decision.reasons,
    });
  }
  // (2) Stage 3 confirmou mesmo evento com confiança alta. A IA nunca pode
  // anular um conflito determinístico nem escolher o canônico: preservamos o
  // post mais antigo e usamos a classificação apenas como evidência adicional.
  for (const r of semanticaResults) {
    if (r.mesmo_evento && r.confianca >= 0.75 && (r.recomendacao === 'hide_a' || r.recomendacao === 'hide_b')) {
      const postA = posts.find(p => p.id === r.a);
      const postB = posts.find(p => p.id === r.b);
      if (postA && postB) {
        const policy = decideDuplicatePair(postA, postB);
        if (policy.conflicts.length > 0) {
          actionLog({
            action: 'flag_review',
            target: postA.id,
            target_b: postB.id,
            target_title: postA.title,
            target_b_title: postB.title,
            reason: `IA indicou mesmo item (${(r.confianca*100).toFixed(0)}%), mas a identidade determinística encontrou: ${policy.conflicts.join(', ')}`,
            method: 'stage3_llm_conflict',
          });
          continue;
        }
        const older = postA.created_at <= postB.created_at ? postA : postB;
        const newer = older === postA ? postB : postA;
        actionLog({
          action: 'hide',
          target: newer.id,
          target_title: newer.title,
          reason: `IA: ${r.tipo_relacao} (conf ${(r.confianca*100).toFixed(0)}%) — ${r.motivo}`,
          method: 'stage3_llm',
          keep_id: older.id,
          evidence: [
            `llm:${r.tipo_relacao}`,
            `confidence:${Number(r.confianca).toFixed(2)}`,
            ...policy.reasons,
          ],
        });
      }
    } else if (r.mesmo_evento && r.confianca >= 0.6 && r.recomendacao === 'revisar_manual') {
      actionLog({
        action: 'flag_review',
        target: r.a,
        target_b: r.b,
        reason: `IA: ${r.tipo_relacao} (conf ${(r.confianca*100).toFixed(0)}%) — ${r.motivo} — requer revisão manual`,
        method: 'stage3_llm',
      });
    }
  }

  // (3) Logos inadequadas
  for (const li of logoIssues) {
    const key = `flag_review|${li.post.id}|stage2_logo`;
    if (seenActions.has(key)) continue;
    seenActions.add(key);
    actionLog({
      action: 'flag_review',
      target: li.post.id,
      target_title: li.post.title,
      reason: li.reason,
      method: 'stage2_logo',
      logo_info: li.logo,
    });
  }

  // === Aplicar ações (se não for dry-run) ===
  let autoCloseResult = { closed: 0, failed: 0 };
  if (!DRY_RUN && !REPORT_ONLY) {
    // v1.4 (2026-06-15): AUTO-CLOSE de eventos passados — roda ANTES dos hides
    if (!SKIP_AUTO_CLOSE) {
      const today = new Date().toISOString().slice(0, 10);
      autoCloseResult = await closePastEvents(supabase, bearer, today);
    } else {
      console.log(`\n🔒 AUTO-CLOSE: pulado (--no-auto-close).`);
    }
    console.log(`\n🔴 APLICANDO AÇÕES...`);
    let hidden = 0, flagged = 0, failed = 0;
    for (const a of report.actions_planned) {
      try {
        if (a.action === 'hide') {
          const ok = await hidePost(supabase, bearer, a.target, a.reason, {
            keepId: a.keep_id || '',
            method: a.method || '',
            evidence: a.evidence || [],
          });
          if (ok) { hidden++; console.log(`   ✅ hidden: ${a.target_title?.slice(0, 60)}`); }
          else { failed++; console.log(`   ❌ fail: ${a.target_title?.slice(0, 60)}`); }
        } else if (a.action === 'flag_review') {
          const ok = await flagReviewIssue(supabase, bearer, a);
          if (ok) { flagged++; console.log(`   🏳️ flagged: ${a.target_title?.slice(0, 60)}`); }
          else { failed++; console.log(`   ❌ fail flag: ${a.target_title?.slice(0, 60)}`); }
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        failed++;
        console.log(`   💥 ${a.action}: ${e.message.slice(0, 100)}`);
      }
    }
    report.applied = { hidden, flagged, failed };
  }

  // === Salvar relatório ===
  const dateStr = new Date().toISOString().slice(0, 10);
  const reportFile = path.join(REPORT_DIR, `dedup-${dateStr}.json`);
  writeJsonAtomic(reportFile, report);
  console.log(`\n📄 Relatório salvo: ${reportFile}`);

  // === Resumo final ===
  const hides = report.actions_planned.filter(a => a.action === 'hide').length;
  const flags = report.actions_planned.filter(a => a.action === 'flag_review').length;
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`📊 RESUMO:`);
  console.log(`   Posts analisados: ${posts.length}`);
  console.log(`   Duplicatas exatas (URL): ${exactUrlDups.length}`);
  console.log(`   Candidatos textuais: ${stage1Candidates.length}`);
  console.log(`   Pares com imagem similar: ${imageConfirmedPairs.length}`);
  console.log(`   Logos inadequadas: ${logoIssues.length}`);
  console.log(`   Pares enviados ao IA: ${pairsForLLM.length}`);
  console.log(`   ────────────────────────────────────────`);
  console.log(`   Ações PLANEJADAS:`);
  console.log(`     Hide (auto): ${hides}`);
  console.log(`     Flag (revisão): ${flags}`);
  if (!DRY_RUN && !REPORT_ONLY) {
    console.log(`   Ações APLICADAS:`);
    console.log(`     Hidden: ${report.applied?.hidden || 0}`);
    console.log(`     Flagged: ${report.applied?.flagged || 0}`);
    console.log(`     Failed: ${report.applied?.failed || 0}`);
    console.log(`   Auto-close (eventos passados):`);
    console.log(`     Closed: ${autoCloseResult.closed}`);
    console.log(`     Failed: ${autoCloseResult.failed}`);
  } else {
    console.log(`\n   ⚠️ Modo DRY-RUN. Use --apply para executar.`);
  }
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(e => {
  console.error('💥 Erro fatal:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
}).finally(() => signOutCurrentSession(activeAuthClient, {
  onError: e => console.error('⚠️ Logout local do Cadu falhou:', e.message),
}));
