#!/usr/bin/env node
/**
 * publish_auto_v5.js — Publicador do Cadu via Edge Function cadu-publish.
 * Lê o relatório do curador (curadoria-v4-*.json) e publica pelo endpoint oficial.
 *
 * Uso:
 *   node scripts/publish_auto_v5.js --dry-run
 *   node scripts/publish_auto_v5.js
 *   node scripts/publish_auto_v5.js arquivo.json
 *
 * v0.6 (2026-06-12): P0-A — aplica normalizeImageUrl em cada imagem do item
 *                   P0-B — valida tamanho da imagem armazenada após publish
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { normalizeImageUrl: normalizeCmsUrl, isThumbnailUrl, validateImageUrl } = require('./lib/image-utils.js');
const { resolveActionLabel } = require('./lib/curator-action-policy.js');

const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';

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
  path.join(process.cwd(), '.env.local'),
  '/data/.openclaw/workspace/kino-campus/services/cadu-ufg-publisher/.env.local',
].forEach(loadEnvFile);
const ANON_KEY = process.env.CADU_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || env.CADU_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

// F1 (2026-07-06): canonical URL parser. Normaliza formatos diferentes do mesmo
// evento pra mesma chave:
//   /events?event=39173        → ufg.br/events/39173
//   /e/39173-slug-do-evento    → ufg.br/events/39173
// Sincronizado com curador-v4.4.js, dedup-kino.js e cleanup-dup-2026-07-06.js.
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

const ENDPOINT = `${SUPABASE_URL}/functions/v1/cadu-publish`;
const BASE_DIR = '/data/.openclaw/workspace/data/ufg-scrape';
const MIN_SCORE = 0.70;  // Workflow Hardening 2026-06-01: must match curador

const DRY_RUN = process.argv.includes('--dry-run');
const CUSTOM_FILE = process.argv.find(a => a.endsWith('.json') && !a.startsWith('--'));

function findLatestReport() {
  const files = fs.readdirSync(BASE_DIR).filter(f => f.startsWith('_formatted_') && f.endsWith('.json'));
  if (!files.length) return null;
  files.sort((a, b) => {
    const ma = fs.statSync(path.join(BASE_DIR, a)).mtimeMs;
    const mb = fs.statSync(path.join(BASE_DIR, b)).mtimeMs;
    return mb - ma;
  });
  return path.join(BASE_DIR, files[0]);
}

function normalizeImages(rec) {
  const rawImages = [
    rec.image,
    rec.imageUrl,
    rec.image_url,
    rec.cover,
    ...(Array.isArray(rec.images) ? rec.images : []),
    ...(Array.isArray(rec.gallery) ? rec.gallery : []),
  ];
  const seen = new Set();
  return rawImages
    .filter(Boolean)
    .map(String)
    .map(s => s.trim())
    .filter(s => /^https?:\/\//i.test(s) && !/\.svg(?:$|[?#])/i.test(s))
    .map(s => normalizeCmsUrl(s)) // P0-A: troca /l/ por /o/ no CMS UFG
    .filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    })
    .slice(0, 6); // S19 fix: 6 imagens (cadu 6-image contract)
}

function normalizeEnrichmentSources(rec) {
  const sources = [
    rec.sourceUrl || rec.url,
    ...(Array.isArray(rec.enrichmentSources) ? rec.enrichmentSources : []),
    ...(Array.isArray(rec.sourcesChecked) ? rec.sourcesChecked : []),
  ];
  const seen = new Set();
  return sources
    .map(src => typeof src === 'string' ? { url: src, label: '', type: 'supplemental' } : src)
    .filter(src => src && /^https?:\/\//i.test(String(src.url || '')))
    .map(src => ({
      url: String(src.url).trim(),
      label: String(src.label || src.title || '').trim(),
      type: String(src.type || 'supplemental').trim(),
    }))
    .filter(src => {
      if (seen.has(src.url)) return false;
      seen.add(src.url);
      return true;
    })
    .slice(0, 12);
}

function recordToItem(rec) {
  const future = (rec.dates && Array.isArray(rec.dates.futureDates)) ? rec.dates.futureDates : [];
  const formattedDescription = rec.formattedDescription || rec.formatted_description || (rec.formatted ? rec.description : '');
  
  // HARDENING 2026-06-04: Rejeitar item sem formattedDescription (falta formatacao IA)
  if (!formattedDescription || formattedDescription.length < 80) {
    console.error(`   ⚠️ REJEITADO: sem formattedDescription (${formattedDescription.length}ch) — '${(rec.title||'').slice(0,60)}'`);
    return null;
  }

  // HARDENING 2026-06-23: Rejeitar item com TODAS as datas no passado (já expirou)
  // Se futureDates está vazio E há pastDates, o evento/oportunidade já passou.
  const recDates = rec.dates || {};
  const futureD = Array.isArray(recDates.futureDates) ? recDates.futureDates : [];
  const pastD = Array.isArray(recDates.pastDates) ? recDates.pastDates : [];
  if (futureD.length === 0 && pastD.length > 0) {
    console.error(`   ⚠️ REJEITADO: todas as datas no passado (${pastD.join(', ')}) — '${(rec.title||'').slice(0,60)}'`);
    return null;
  }
  
  const description = formattedDescription;
  const images = normalizeImages(rec);
  
  // Closed registration on a future event is informational, never an open
  // application CTA. Other records preserve the historical inference.
  const actionLabel = resolveActionLabel(rec, formattedDescription);
  
  // HARDENING 2026-06-04: contato padrao inferido
  let contato = rec.contato || '';
  if ((!contato || contato === 'Ver link oficial da UFG') && rec.site) {
    contato = `${rec.site.toLowerCase()}.ufg.br`;
  }
  
  return {
    module: rec.module || 'oportunidades',
    category: rec.category || '',
    // v1.1 (2026-06-13): preferir formattedTitle (gerado pelo formatador) sobre title
    title: rec.formattedTitle || rec.title || '',
    description,
    actionLabel,
    formattedDescription,
    location: rec.location || '',
    dateStart: future[0] || '',
    dateEnd: future.length > 1 ? future[future.length - 1] : '',
    gratuito: rec.module === 'eventos' ? true : undefined,
    link: rec.link || rec.sourceUrl || rec.url || '',
    linkAsCta: true,
    actionLabel,
    actionKey: rec.actionKey || '',
    contato,
    image: images[0] || '',
    images,
    pdfLinks: Array.isArray(rec.pdfLinks) ? rec.pdfLinks : (Array.isArray(rec.pdfs) ? rec.pdfs : []),
    extractedLinks: Array.isArray(rec.extractedLinks) ? rec.extractedLinks : [],
    enrichmentSources: normalizeEnrichmentSources(rec),
    enrichmentCheckedAt: rec.enrichmentCheckedAt || new Date().toISOString(),
    score: typeof rec.score === 'number' ? rec.score : undefined,
    dates: rec.dates || {},
    sourceUrl: rec.sourceUrl || rec.url || '',
    // S8 fix: formato canônico de sourceId = `${site}:${item.id || slug || url}`
    sourceId: rec.sourceId || (rec.site ? `${rec.site}:${rec.id || rec.slug || rec.url || ''}` : (rec.url || '')),
    sourceName: rec.sourceName || rec.site || 'UFG',
    area: rec.area || '',
    contato,
    tags: Array.isArray(rec.tags) ? rec.tags : [],
  };
}

// ============================================================
// P1-MERGE (2026-06-12): Funções client-side de dedup + merge
// Regra do Yan: manter SEMPRE a postagem mais antiga ou que tem mais interações
// ============================================================

/**
 * Normaliza título para comparação: lowercase, sem acentos, remove stopwords.
 */
function normalizeTitleForCompare(s) {
  if (!s) return '';
  // Remove acentos
  let n = s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Remove stopwords comuns em títulos de eventos
  const stop = new Set(['de','da','do','e','a','o','em','para','com','no','na','nos','nas','um','uma','uns','umas','os','as','—','-']);
  return n.split(' ').filter(w => w && !stop.has(w) && w.length > 2).join(' ');
}

/**
 * Compara 2 títulos normalizados. Retorna true se forem do "mesmo evento":
 * - Match exato: ambos têm a mesma sequência
 * - Match substring: um contém o outro
 * - Match fuzzy: 70%+ de similaridade (SequenceMatcher-like)
 */
function titlesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 15 && b.length >= 15 && (a.includes(b) || b.includes(a))) return true;
  // Fuzzy: trigrama overlap ≥ 50%
  const trigramsA = new Set();
  for (let i = 0; i < a.length - 2; i++) trigramsA.add(a.slice(i, i + 3));
  const trigramsB = new Set();
  for (let i = 0; i < b.length - 2; i++) trigramsB.add(b.slice(i, i + 3));
  let inter = 0;
  for (const t of trigramsA) if (trigramsB.has(t)) inter++;
  const total = Math.max(trigramsA.size, trigramsB.size);
  return total > 0 && inter / total >= 0.5;
}

/**
 * Busca posts existentes no DB que podem ser duplicatas do item.
 * Critérios:
 *   1. Mesmo sourceUrl (canônico)
 *   2. Mesmo sourceId
 *   3. Mesmo link (extra link do item)
 *   4. Título similar (slug match)
 *   5. Status != 'deleted'
 */
async function findExistingPostsClient(supabase, item) {
  const candidates = [];
  const seen = new Set();
  const tNorm = normalizeTitleForCompare(item.title);

  // Helper para adicionar
  const addCandidate = (p) => {
    if (!p || p.id === undefined || seen.has(p.id)) return;
    seen.add(p.id);
    candidates.push(p);
  };

  // F1 (2026-07-06): REMOVIDO filtro `.eq('author_id', supabase.auth.user?.id)`.
  // Bug B4: o signInWithPassword loga como `yandiamantino@egresso.ufg.br` (user
  // humano), mas os posts de evento foram criados pelo cadu-publish Edge Function
  // com `author_id` do bot (2345582d-...). O filtro zerava todas as queries,
  // então findExistingPostsClient SEMPRE retornava vazio, criando duplicatas.
  //
  // F1 (2026-07-06): NOVA query por canonical URL (Bug B3). Como a UFG tem 2
  // formatos de URL pro mesmo evento (`ufg.br/events?event=X` vs
  // `ufg.br/e/X-slug-do-evento`), o match raw por `source_url` falhava.

  // 1. Mesmo sourceUrl (raw) OU canonical URL equivalente
  const itemSourceCanonical = canonicalUrl(item.sourceUrl || item.link);
  if (item.sourceUrl) {
    const { data } = await supabase
      .from('posts')
      .select('id, title, status, created_at, view_count, share_count, coupon_clicks, description, image_url, metadata')
      .eq('metadata->>source_url', item.sourceUrl)
      .neq('status', 'deleted')
      .limit(5);
    if (data) data.forEach(addCandidate);
  }

  // 2. Mesmo sourceId
  if (item.sourceId) {
    const { data } = await supabase
      .from('posts')
      .select('id, title, status, created_at, view_count, share_count, coupon_clicks, description, image_url, metadata')
      .eq('metadata->>source_id', item.sourceId)
      .neq('status', 'deleted')
      .limit(5);
    if (data) data.forEach(addCandidate);
  }

  // 3. Mesmo link (item.link raw)
  if (item.link && item.link !== item.sourceUrl) {
    const { data } = await supabase
      .from('posts')
      .select('id, title, status, created_at, view_count, share_count, coupon_clicks, description, image_url, metadata')
      .eq('metadata->>link', item.link)
      .neq('status', 'deleted')
      .limit(5);
    if (data) data.forEach(addCandidate);
  }

  // 4. (F1) NOVO: match por canonical URL contra posts recentes.
  //    Pega posts atualizados nos últimos 14 dias e filtra in-Node por
  //    canonicalUrl(source_url) === canonicalUrl(item).
  //    Cobre o caso "ufg.br/events?event=X" vs "ufg.br/e/X-slug-do-evento".
  if (itemSourceCanonical) {
    const sinceIso = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
    const { data } = await supabase
      .from('posts')
      .select('id, title, status, created_at, updated_at, view_count, share_count, coupon_clicks, description, image_url, metadata')
      .gte('updated_at', sinceIso)
      .neq('status', 'deleted')
      .limit(100);
    if (data) {
      for (const p of data) {
        const pCanonical = canonicalUrl(p.metadata?.source_url || p.metadata?.link || '');
        if (pCanonical && pCanonical === itemSourceCanonical) {
          addCandidate(p);
        }
      }
    }
  }

  // 5. Título similar (slug match) — heurística: trigrama overlap ≥ 50%
  if (tNorm && tNorm.length >= 15) {
    const words = tNorm.split(' ').filter(w => w.length >= 5).sort((a, b) => b.length - a.length).slice(0, 2);
    for (const word of words) {
      const { data } = await supabase
        .from('posts')
        .select('id, title, status, created_at, view_count, share_count, coupon_clicks, description, image_url, metadata')
        .ilike('title', `%${word}%`)
        .neq('status', 'deleted')
        .limit(20);
      if (data) {
        for (const p of data) {
          const pNorm = normalizeTitleForCompare(p.title);
          if (titlesMatch(tNorm, pNorm)) {
            addCandidate(p);
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Mescla formatação de um item em um post existente.
 * Regra: manter o ID do post existente (que é o mais antigo, canônico).
 * Atualiza com: description mais completa, image maior, link da fonte mais recente.
 *
 * FIX 2026-07-15: Se o winner estiver `closed` (auto-close por data passada
 * ou admin_close), o item NOVO é evidência de que a UFG republicou o evento.
 * Reativar para `published` é a ação correta (regra Yan: "as pessoas
 * podem ter visto a mais antiga, eu não quero que na hora que vai ver não
 * tenha mais"). Caso contrário, o item novo vira `hidden` e nunca aparece
 * no KinoCampus — a UI mostra o post closed como encerrado, e o item
 * "novo" some. Sem reativação, o sistema parece "zero publish" mesmo
 * com N publicáveis identificados.
 */
async function mergeIntoExisting(supabase, postId, item, opts = {}) {
  const { reactivateIfHidden = true, reactivateIfClosed = true } = opts;
  // Pega o post existente
  const { data: existing } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (!existing) {
    console.warn(`   ⚠️ post ${postId} não encontrado`);
    return false;
  }

  const existingMeta = existing.metadata || {};
  // F2 B7 (2026-07-06): se o usuário marcou o post como 'manual_edits_lock=true'
  // (via painel admin / direto no DB), NÃO sobrescreve campos manuais.
  // Whitelist de AI-only (sobrescreve sempre): last_update, enrichment_sources,
  //   merged_at, merge_reason, cadu_run_id, dead_link_check.
  // Whitelist de manual (preserva se locked): description, image_url,
  //   image_gallery, category, module, tags, title, link_as_cta.
  // Se ainda não tem lock mas a descrição manual está muito maior que a da IA,
  // também respeita (heurística).
  const manualLock = existingMeta.manual_edits_lock === true || existingMeta.manual_edits_lock === 'true';
  const manualDesc = existingMeta.manual_description === true || existingMeta.manual_description === 'true';
  const manualImage = existingMeta.manual_image === true || existingMeta.manual_image === 'true';

  const patch = {};
  // Status: reativar se hidden ou closed
  if (reactivateIfHidden && existing.status === 'hidden') {
    patch.status = 'published';
  }
  // FIX 2026-07-15: reativar `closed` (auto-close por data passada) quando
  // há um item NOVO para o mesmo source. Caso contrário o item novo vira
  // `hidden` e o post closed fica inativo — UI mostra "encerrado" e nada
  // é publicado, mesmo com N publicáveis identificados pelo curador.
  if (reactivateIfClosed && existing.status === 'closed') {
    patch.status = 'published';
    // Anotar no metadata que o post foi reativado por novo item do curador
    // (audit trail — útil para debug futuro).
    patch._reactivated_from_closed_at = new Date().toISOString();
    patch._reactivated_from_closed_by = 'cadu-publish-merge';
  }

  // Description: pegar a mais completa, MAS respeitar manual edits
  const newDesc = (item.description || item.formattedDescription || '').trim();
  const curDesc = (existing.description || '').trim();
  const descLenDelta = newDesc.length - curDesc.length;
  if (descLenDelta > 50 && !(manualLock || manualDesc)) {
    patch.description = newDesc;
  } else if (descLenDelta > 200) {
    // Sobrepõe lock APENAS se a diferença é muito grande (200+ chars).
    // Sinaliza no metadata que houve overwrite de lock.
    patch.description = newDesc;
    patch._ai_description_overwrote_lock = true;
  }

  // Image: respeitar manual edits
  if (item.image && !(manualLock || manualImage)) {
    patch.image_url = item.image;
  } else if (item.image) {
    patch._ai_image_overwrote_lock = true;
  }

  // Metadata merge — AI-only fields (sempre sobrescreve, mesmo com lock)
  const mergedMeta = {
    ...existingMeta,
    source_url: item.sourceUrl || existingMeta.source_url,
    link: existingMeta.manual_link === true ? existingMeta.link : (item.link || existingMeta.link),
    sourceName: item.sourceName || existingMeta.sourceName,
    merged_at: new Date().toISOString(),
    merge_reason: 'P2-OLDEST (2026-07-02): preservou o post canônico (SEMPRE o mais antigo, independente de interações, regra Yan) e mesclou formatação/imagem do item atual se melhor.' + (manualLock ? ' (manual_edits_lock respeitado)' : ''),
  };
  patch.metadata = mergedMeta;

  if (Object.keys(patch).length === 0) {
    return false;  // nada para atualizar
  }
  const { error } = await supabase.from('posts').update(patch).eq('id', postId);
  if (error) {
    console.warn(`   ⚠️ merge falhou para ${postId}: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  if (!ANON_KEY) {
    console.error('❌ CADU_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY ausente no ambiente');
    process.exit(1);
  }
  const email = process.env.CADU_KINO_EMAIL || process.env.CADU_EMAIL || env.CADU_KINO_EMAIL || env.CADU_EMAIL;
  const password = process.env.CADU_KINO_PASSWORD || process.env.CADU_PASSWORD || env.CADU_KINO_PASSWORD || env.CADU_PASSWORD;
  if (!email || !password) {
    console.error('❌ CADU_KINO_EMAIL/CADU_KINO_PASSWORD ausentes no ambiente');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr || !auth || !auth.session) {
    console.error('❌ Login do Cadu falhou:', authErr ? authErr.message : 'sem sessão');
    process.exit(1);
  }
  const token = auth.session.access_token;
  console.log(`🔑 Logado como ${auth.user.id}`);

  const reportFile = CUSTOM_FILE || findLatestReport();
  if (!reportFile || !fs.existsSync(reportFile)) {
    console.error('❌ Relatório não encontrado em', BASE_DIR);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const candidates = (report.publishable || []).filter(p => p.score >= MIN_SCORE && !p.expired && !p.duplicate);
  console.log(`📄 ${reportFile}\n   Candidatos (score ≥ ${MIN_SCORE}): ${candidates.length}\n`);

  // ============================================================
  // RETRY COM BACKOFF — Resiliencia a 429/5xx do endpoint cadu-publish
  // 5 tentativas: 2s, 4s, 8s, 16s, 32s
  // ============================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAX_RETRIES = 5;
  const BASE_BACKOFF_MS = 2000;

  async function call(action, payload) {
    const body = JSON.stringify({ action, ...payload });
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body,
      });
      // 429 ou 5xx → retry com backoff
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.warn(`   ⏳ ${action} HTTP ${resp.status} (tentativa ${attempt}/${MAX_RETRIES}) — aguardando ${Math.round(backoff/1000)}s...`);
          await sleep(backoff);
          continue;
        }
        // Ultima tentativa falhou
        let errBody;
        try { errBody = await resp.json(); } catch (_) { errBody = { ok: false, code: 'HTTP_' + resp.status, http: resp.status }; }
        return errBody;
      }
      // 2xx ou 4xx (nao-429) → processa direto
      try {
        return await resp.json();
      } catch (_) {
        return { ok: false, code: 'BAD_RESPONSE', http: resp.status };
      }
    }
    return { ok: false, code: 'MAX_RETRIES_EXCEEDED' };
  }

  let published = 0, dup = 0, pending = 0, errors = 0, merged = 0;
  const publishedRecords = [];
  const mergedRecords = [];
  const duplicateRecords = [];
  const pendingRecords = [];
  const errorRecords = [];
  for (const rec of candidates) {
    const item = recordToItem(rec);
    
    // HARDENING 2026-06-04: pular itens rejeitados pelo recordToItem (ex: sem formattedDescription)
    if (!item) {
      errors++;
      errorRecords.push({
        title: rec.title || '',
        sourceUrl: rec.sourceUrl || rec.url || '',
        code: 'INVALID_ITEM',
      });
      continue;
    }

// P1-MERGE (2026-06-12): ANTES de chamar cadu-publish, detecta duplicatas
    // e mescla no mais antigo (regra do Yan). Cobre sourceUrl, sourceId, link, e título similar.
    //
    // P2-OLDEST (2026-07-02): Yan confirmou preferência SEMPRE pelo mais antigo
    // (created_at ASC) - "as pessoas podem ter visto e compartilhado a mais antiga,
    // eu não quero que na hora que vai ver não tenha mais na plataforma".
    // Tiebreaker mantido: mais interações (em caso de empate de timestamp).
    if (!DRY_RUN) {
      const existingList = await findExistingPostsClient(supabase, item);
      if (existingList.length > 0) {
        const winner = existingList.sort((a, b) => {
          // Critério primário: created_at ASC (mais antigo primeiro)
          const tsA = new Date(a.created_at || 0).getTime();
          const tsB = new Date(b.created_at || 0).getTime();
          if (tsA !== tsB) return tsA - tsB;
          // Tiebreaker: mais interações (se houver posts criados no mesmo segundo)
          const intA = (a.view_count || 0) + (a.share_count || 0) + (a.coupon_clicks || 0);
          const intB = (b.view_count || 0) + (b.share_count || 0) + (b.coupon_clicks || 0);
          return intB - intA;
        })[0];
        console.log(`🔁 [merge] ${item.title.slice(0, 50)} → canônico ${winner.id.slice(0, 8)} (${winner.status}, V:${winner.view_count}, oldest)`);
        for (const other of existingList) {
          if (other.id !== winner.id && other.status !== 'hidden') {
            await supabase.from('posts').update({ status: 'hidden' }).eq('id', other.id);
            console.log(`   🙈 escondeu ${other.id.slice(0, 8)} (mais novo)`);
          }
        }
        await mergeIntoExisting(supabase, winner.id, item);
        console.log(`   ✓ merge aplicado (preservou o mais antigo)`);
        merged++;
        mergedRecords.push({
          postId: winner.id,
          title: item.title,
          sourceUrl: item.sourceUrl || item.link || '',
          status: winner.status,
          source: 'client_dedup_oldest',
        });
        continue;
      }
    }
    
    const res = await call('publish', { item, options: { dryRun: DRY_RUN, runId: report.timestamp || '' } });

    if (DRY_RUN) {
      console.log(`📋 [DRY] ${item.module}/${item.category} — ${item.title.slice(0, 70)}`);
      if (!res.ok) console.log(`   ⚠️ ${res.code}: ${res.message || ''}`);
      continue;
    }
    if (res.ok && res.code === 'PUBLISHED') {
      console.log(`✅ ${item.title.slice(0, 70)} → ${res.url} (img:${res.media && res.media.uploaded})`);
      published++;
      publishedRecords.push({
        postId: res.post_id || '',
        title: item.title,
        sourceUrl: item.sourceUrl || item.link || '',
        url: res.url || '',
        imageUrl: res.image_url || (res.media && res.media.cover_url) || '',
      });
      // P0-B (2026-06-12): valida tamanho da imagem armazenada.
      // Se a capa ficou < 30KB, é provavelmente thumbnail — marca para revisão.
      const storedUrl = (res.image_url || (res.media && res.media.cover_url) || '').trim();
      if (storedUrl && storedUrl.includes('supabase.co/storage/')) {
        validateImageUrl(storedUrl, { minBytes: 30000, timeoutMs: 12000 })
          .then(v => {
            if (!v.ok) {
              console.warn(`   ⚠️ imagem armazenada suspeita: ${v.error || 'desconhecido'} (${v.bytes || 0}B) — ${storedUrl.slice(-60)}`);
            } else {
              console.log(`   📐 imagem: ${v.bytes}B ${v.contentType}`);
            }
          })
          .catch(() => { /* best-effort */ });
      }
    } else if (res.code === 'DUPLICATE') {
      // P1-merge (2026-06-12): Se cadu-publish detectou duplicata, mescla no existente
      if (res.post_id) {
        await mergeIntoExisting(supabase, res.post_id, item, { reactivateIfHidden: true });
        console.log(`🔁 [merge-cadu] ${item.title.slice(0, 50)} → ${res.post_id.slice(0, 8)} (era ${res.status})`);
        merged++;
        mergedRecords.push({
          postId: res.post_id,
          title: item.title,
          sourceUrl: item.sourceUrl || item.link || '',
          status: res.status || '',
          source: 'cadu_publish',
        });
      } else {
        console.log(`⏭️ já existe: ${item.title.slice(0, 60)}`);
        dup++;
        duplicateRecords.push({
          title: item.title,
          sourceUrl: item.sourceUrl || item.link || '',
        });
      }
    } else if (res.code === 'PENDING') {
      console.log(`🕓 pendente: ${item.title.slice(0, 60)} (${res.pending_reason || ''})`);
      pending++;
      pendingRecords.push({
        postId: res.post_id || '',
        title: item.title,
        sourceUrl: item.sourceUrl || item.link || '',
        reason: res.pending_reason || '',
      });
    } else if (res.code === 'QUALITY_BLOCKED') {
      console.log(`🚫 bloqueado qualidade: ${item.title.slice(0, 60)} — ${res.message || ''}`);
      errors++;
      errorRecords.push({
        title: item.title,
        sourceUrl: item.sourceUrl || item.link || '',
        code: res.code,
        message: res.message || '',
        quality: res.quality || null,
      });
    } else {
      console.log(`❌ ${item.title.slice(0, 50)}: ${res.code} ${res.message || ''}`);
      errors++;
      errorRecords.push({
        title: item.title,
        sourceUrl: item.sourceUrl || item.link || '',
        code: res.code || 'UNKNOWN',
        message: res.message || '',
      });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n📊 Publicados: ${published} | Merged: ${merged} | Duplicados: ${dup} | Pendentes: ${pending} | Erros: ${errors}`);
  if (DRY_RUN) console.log('⚠️ DRY-RUN — nada foi publicado de fato.');
  console.log('__CADU_PUBLISH_JSON__' + JSON.stringify({
    published,
    merged,
    duplicated: dup,
    pending,
    errors,
    dryRun: DRY_RUN,
    items: {
      published: publishedRecords,
      merged: mergedRecords,
      duplicated: duplicateRecords,
      pending: pendingRecords,
      errors: errorRecords,
    },
  }));
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
