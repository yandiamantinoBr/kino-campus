#!/usr/bin/env node
/**
 * pipeline-kino.js — Pipeline Completo Kino Campus
 * 
 * Integra: curador v4.4 → formatador IA → publish_auto_v5 → endpoint
 * 
 * Fluxo completo automatizado:
 *   1. Scan sites UFG (curador v4.4, modo daily)
 *   2. Scan Instagram via browser CDP (se --ig)
 *   3. Classificação + dedup
 *   4. Formatação IA de descrições (itens publish)
 *   5. Publicação via endpoint cadu-publish (se --publish)
 * 
 * Uso:
 *   node scripts/pipeline-kino.js                    → scan + classify
 *   node scripts/pipeline-kino.js --ig               → scan + IG + classify
 *   node scripts/pipeline-kino.js --format           → scan + formatar descrições
 *   node scripts/pipeline-kino.js --publish          → scan + formatar + publicar
 *   node scripts/pipeline-kino.js --full             → TUDO (full scan + IG + publish)
 *   node scripts/pipeline-kino.js --dry-run          → scan + formatar (sem publicar)
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
// CONFIG
// ============================================================

const BASE_DIR = '/data/.openclaw/workspace';
const SCRIPTS_DIR = path.join(BASE_DIR, 'scripts');
const DATA_DIR = path.join(BASE_DIR, 'data/ufg-scrape');
const TIMESTAMP = new Date().toISOString().slice(0, 10);
const START_TIME = Date.now();
const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';

// ============================================================
// FLAGS v4.4 — Estágios para evitar OOM (2026-06-08)
// ============================================================
// --stage=ig        → só scan Instagram
// --stage=curator   → só curador UFG sites
// --stage=duplicates → só enriquecimento de duplicatas
// --stage=format    → só formatação IA (após curador já ter rodado)
// --stage=publish   → só publicação (após format ter rodado)
// --stage=enrich    → só enriquecimento de imagens
// --stage=all       → tudo de uma vez (legado, alto consumo RAM)
//
// Cada estágio libera memória ao terminar (process.exit após conclusao).
// Recomendado: 3 crons separados (curator 8h, format 8:30, publish 9h).
// ============================================================
const STAGE_FLAGS = process.argv.filter(a => a.startsWith('--stage=')).map(a => a.slice(8));
const STAGE = STAGE_FLAGS.length === 0 ? 'all' : 'multi';
const ACTIVE_STAGES = STAGE === 'all' ? ['ig', 'curator', 'duplicates', 'format', 'publish', 'enrich'] : STAGE_FLAGS;
const WITH_IG = ACTIVE_STAGES.includes('ig');
const WITH_CURATOR = ACTIVE_STAGES.includes('curator');
const WITH_DUPLICATES = ACTIVE_STAGES.includes('duplicates');
const WITH_FORMAT = ACTIVE_STAGES.includes('format');
const WITH_PUBLISH = ACTIVE_STAGES.includes('publish');
const WITH_ENRICH = ACTIVE_STAGES.includes('enrich');
const DRY_RUN = process.argv.includes('--dry-run');
const FULL_MODE = process.argv.includes('--full');

// ── Load env vars from .env.local (same logic as publish_auto_v5.js) ──
(function loadEnvFiles() {
  const files = [
    path.join(BASE_DIR, '.env.local'),
    path.join(BASE_DIR, 'kino-campus/services/cadu-ufg-publisher/.env.local'),
  ];
  files.forEach(filePath => {
    try {
      if (!fs.existsSync(filePath)) return;
      fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([^=#]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
      });
    } catch (_) {}
  });
})();

// ============================================================
// HELPERS
// ============================================================

function log(icon, msg) {
  const elapsed = ((Date.now() - START_TIME) / 1000).toFixed(1);
  console.log(`[${elapsed}s] ${icon} ${msg}`);
}

// ============================================================
// RUN STEP — Streaming stdio + captura para regex
// ============================================================
// Usa spawn em vez de execSync para que o stdout do child seja ECOADO
// no terminal (visivel no log) E capturado em buffer para o pubMatch.
// Solucao para o bug de "0 publicados" reportado em 2026-06-08.
// ============================================================
function getSupabaseKey() {
  return (process.env.CADU_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
}

function addPostUrlToSet(urls, value) {
  const url = String(value || '').trim();
  if (url) urls.add(url);
}

function loadFileCacheUrls(cacheFile) {
  const urls = new Set();
  try {
    if (!fs.existsSync(cacheFile)) return urls;
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const p of (cache.posts || [])) {
      addPostUrlToSet(urls, p.metadata_link);
      addPostUrlToSet(urls, p.metadata?.source_url);
      addPostUrlToSet(urls, p.metadata?.link);
    }
  } catch (e) {
    log('⚠️', `Cache Supabase em arquivo falhou: ${e.message ? e.message.slice(0, 100) : 'unknown'}`);
  }
  return urls;
}

function fetchLivePublishedUrls() {
  const key = getSupabaseKey();
  if (!key) return Promise.resolve(new Set());
  const url = `${SUPABASE_URL}/rest/v1/posts?select=metadata&status=eq.published&limit=1000`;
  return new Promise((resolve) => {
    const urls = new Set();
    const req = https.get(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      timeout: 12000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            log('⚠️', `Cache Supabase vivo HTTP ${res.statusCode}`);
            resolve(urls);
            return;
          }
          const posts = JSON.parse(body);
          if (Array.isArray(posts)) {
            posts.forEach((p) => {
              const meta = p.metadata || {};
              addPostUrlToSet(urls, meta.source_url);
              addPostUrlToSet(urls, meta.link);
            });
          }
        } catch (e) {
          log('⚠️', `Parse do cache Supabase vivo falhou: ${e.message ? e.message.slice(0, 100) : 'unknown'}`);
        }
        resolve(urls);
      });
    });
    req.on('error', (e) => {
      log('⚠️', `Cache Supabase vivo falhou: ${e.message ? e.message.slice(0, 100) : 'unknown'}`);
      resolve(urls);
    });
    req.on('timeout', () => {
      req.destroy();
      log('⚠️', 'Cache Supabase vivo timeout');
      resolve(urls);
    });
  });
}

async function loadKnownPublishedUrls(cacheFile) {
  const fileUrls = loadFileCacheUrls(cacheFile);
  const liveUrls = await fetchLivePublishedUrls();
  const merged = new Set([...fileUrls, ...liveUrls]);
  log('📦', `Cache Supabase: ${merged.size} URLs (${fileUrls.size} arquivo, ${liveUrls.size} vivo)`);
  return merged;
}

function dateValues(item) {
  const dates = item.dates || {};
  return [
    ...(Array.isArray(dates.futureDates) ? dates.futureDates : []),
    dates.dateStart,
    dates.dateEnd,
    dates.latestDate,
    item.dateStart,
    item.dateEnd,
  ].filter(Boolean).map(v => String(v).slice(0, 10));
}

function hasFutureDate(item) {
  const today = new Date().toISOString().slice(0, 10);
  return dateValues(item).some(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= today);
}

function publishReadinessIssues(item) {
  const issues = [];
  const dates = item.dates || {};
  const module = item.module || '';
  const desc = item.formattedDescription || item.description || '';
  const blocking = Array.isArray(item.qualityBlockingIssues) ? item.qualityBlockingIssues : [];
  if (blocking.length) issues.push(...blocking);
  if (item.needsReview === true) issues.push('needs_review');
  if (!desc || desc.length < 80) issues.push('weak_description');
  if (dates.isExpired === true || dates.expired === true || item.expired === true) issues.push('expired');
  if (module === 'eventos' && !hasFutureDate(item)) issues.push('no_future_event_date');
  if (module === 'oportunidades' && !hasFutureDate(item) && dates.hasDeadline !== true) issues.push('opportunity_without_deadline');
  return [...new Set(issues)];
}

function runStep(cmd, label) {
  log('⏳', label);
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, timeout: 900000, env: process.env });
    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutBuf += text;
      process.stdout.write(text); // ECOAR no terminal
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuf += text;
      process.stderr.write(text); // ECOAR erros
    });
    child.on('close', (code) => {
      if (code === 0) {
        log('✅', `${label} — OK`);
        resolve(stdoutBuf);
      } else {
        log('❌', `${label} — exit code ${code}`);
        resolve(null);
      }
    });
    child.on('error', (err) => {
      log('❌', `${label} — ERRO: ${err.message.slice(0, 100)}`);
      resolve(null);
    });
  });
}

// ============================================================
// PIPELINE
// ============================================================

async function main() {
  console.log(`\n🚀 PIPELINE KINO CAMPUS — ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Estágios: ${ACTIVE_STAGES.join(', ').toUpperCase()}`);
  console.log(`  IG: ${WITH_IG ? '✅' : '❌'} | Curador: ${WITH_CURATOR ? '✅' : '❌'} | Duplicatas: ${WITH_DUPLICATES ? '✅' : '❌'} | Formatar: ${WITH_FORMAT ? '✅' : '❌'} | Publicar: ${WITH_PUBLISH ? '✅' : '❌'} | Enrich: ${WITH_ENRICH ? '✅' : '❌'}`);
  if (DRY_RUN) console.log(`  ⚠️  DRY-RUN — nada será publicado`);
  console.log();

  // ── STEP 1: Scan Instagram (se --ig) ──────────────────────────
  if (WITH_IG) {
    log('📸', 'Iniciando scan Instagram via browser (45 perfis)...');
    const igOk = await runStep(
      `node "${path.join(SCRIPTS_DIR, 'scan-ig-browser.js')}" --skip-enrich`,
      'Instagram scan'
    );
    if (!igOk) {
      log('ℹ️', 'Continuando com dados de sites apenas');
    }
    // v4.5: Browser CDP roda dentro do openclaw container (CDP 18800).
    // NAO tentar matar daqui (chrome está em outro PID namespace, e pkill nao existe
    // em python:3.12-slim nem na imagem openclaw). O ensure-browser-cdp.py (cron */5)
    // garante que o browser está UP, e o scanner reconnecta no próximo run.
    log('🧹', 'Browser CDP mantido (auto-restart via ensure-browser-cdp.py)');
  }

  // ── STEP 2: Curador v4.2 (scan sites UFG) ─────────────────────
  let reportFile = null;
  let report = null;
  let publishable = [];
  let trulyNew = [];
  const trulyNewFile = path.join(DATA_DIR, `_truly_new_${TIMESTAMP}.json`);

  if (!WITH_CURATOR) {
    log('⏭️', 'Curador pulado (estágios: ' + ACTIVE_STAGES.join(',') + ')');
  } else {
  const curadorMode = FULL_MODE ? '' : '--daily';
  const curadorCmd = `node ${path.join(SCRIPTS_DIR, 'cadu-curador-v4.4.js')} ${curadorMode}`;
  const curadorOutput = await runStep(curadorCmd, `Curador v4.2 (${curadorMode || 'full'})`);
  
  if (!curadorOutput) {
    log('💥', 'Curador falhou — abortando pipeline');
    process.exit(1);
  }

  // Find the generated report — priorizar arquivo do MODO do curador (--daily → daily-)
  // Bug fix 2026-06-08: sort() de string priorizava "quick" sobre "daily" alfabeticamente,
  // fazendo o pipeline ler relatórios de dias anteriores. Agora filtra pelo modo.
  const curadorFilter = curadorMode === '' ? '' : `-${curadorMode.replace('--','')}`;
  const todayPrefix = `curadoria-v4.4${curadorFilter}-${TIMESTAMP}`;
  const allFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('curadoria-v4.4-') && f.endsWith('.json'))
    .sort()
    .reverse();
  // 1) Tenta arquivo do MODO + DIA atual
  const sameDay = allFiles.find(f => f === `${todayPrefix}.json`);
  if (sameDay) {
    reportFile = path.join(DATA_DIR, sameDay);
  } else {
    // 2) Fallback: o mais recente do MESMO modo
    const sameMode = allFiles.find(f => f.includes(curadorFilter));
    if (sameMode) {
      reportFile = path.join(DATA_DIR, sameMode);
      log('⚠️', `Relatorio do modo ${curadorMode || 'full'} do dia nao encontrado — usando ${sameMode}`);
    } else {
      // 3) Ultimo recurso: o mais recente absoluto
      reportFile = path.join(DATA_DIR, allFiles[0]);
      log('⚠️', `Relatorio do modo ${curadorMode || 'full'} nao encontrado — usando ${allFiles[0]}`);
    }
  }
  
  if (!reportFile) {
    log('💥', 'Nenhum relatório do curador encontrado');
    process.exit(1);
  }
  
  log('📂', `Relatório: ${path.basename(reportFile)}`);
  report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  publishable = report.publishable || [];
  
  log('📊', `Curador: ${report.stats?.totalItems || '?'} itens, ${publishable.length} publicáveis, ${(report.reviewable || []).length} revisão`);

  // ── STEP 2.1: Filtrar itens já existentes no Supabase (cache) ──
  const CACHE_FILE = path.join(DATA_DIR, '..', 'kino-posts-cache.json');
  const cacheUrls = await loadKnownPublishedUrls(CACHE_FILE);
  
  // Filter publishable items that don't already exist (by sourceUrl match)
  trulyNew = publishable.filter(p => {
    const url = p.url || p.sourceUrl || '';
    if (url && cacheUrls.has(url)) return false;
    return true;
  });
  
  if (trulyNew.length < publishable.length) {
    log('🔍', `${publishable.length - trulyNew.length} itens já existem no Supabase (pulados via cache)`);
  }
  
  // Replace publishable with truly new items for downstream steps
  report.publishable = trulyNew;
  report.stats.publishable = trulyNew.length;
  
  // SALVA _truly_new para estágios posteriores (format, publish, enrich)
  // Fix 2026-06-24: _truly_new nunca era salvo → --stage=format quebrava
  fs.writeFileSync(trulyNewFile, JSON.stringify({ ...report, publishable: trulyNew, stats: { ...report.stats, publishable: trulyNew.length } }, null, 2));
  log('💾', `_truly_new_${TIMESTAMP}.json salvo (${trulyNew.length} itens)`);
  } // fecha else do WITH_CURATOR

  if (!publishable.length && WITH_CURATOR && !WITH_DUPLICATES) {
    log('✅', 'Nenhum item novo para publicar. Curador concluído.');
    printSummary(report, 0);
    process.exit(0);
  }
  
  if (!trulyNew.length && WITH_CURATOR && !WITH_DUPLICATES) {
    log('✅', 'Todos os itens publicáveis já existem no Supabase.');
    printSummary(report, 0);
    process.exit(0);
  } else if (!trulyNew.length && WITH_CURATOR && WITH_DUPLICATES) {
    log('ℹ️', 'Todos os publicáveis já existem; mantendo duplicatas/updates antes de encerrar.');
  }
  
  // Stage=format sem curator: carregar trulyNew do _truly_new_YYYY-MM-DD.json
  // OU gerar a partir do curadoria-daily se _truly_new não existir
  // Fix 2026-06-24: fallback para curadoria-daily + cache Supabase quando _truly_new ausente
  if (!WITH_CURATOR && (WITH_FORMAT || WITH_PUBLISH || WITH_ENRICH)) {
    if (fs.existsSync(trulyNewFile)) {
      const tn = JSON.parse(fs.readFileSync(trulyNewFile, 'utf8'));
      trulyNew = tn.publishable || [];
      report = tn;
      log('📂', `Carregados ${trulyNew.length} trulyNew de ${path.basename(trulyNewFile)} (sem curator)`);
    } else {
      // Fallback: carregar curadoria-daily direto e filtrar contra cache Supabase
      log('⚠️', `_truly_new_${TIMESTAMP}.json nao encontrado — gerando do curador...`);
      const dailyFile = path.join(DATA_DIR, `curadoria-v4.4-daily-${TIMESTAMP}.json`);
      if (fs.existsSync(dailyFile)) {
        report = JSON.parse(fs.readFileSync(dailyFile, 'utf8'));
        const rawPublishable = report.publishable || [];
        
        // Cross-reference com cache Supabase (mesma lógica do STEP 2.1)
        const CACHE_FILE_FB = path.join(DATA_DIR, '..', 'kino-posts-cache.json');
        const cacheUrlsFb = await loadKnownPublishedUrls(CACHE_FILE_FB);
        
        trulyNew = rawPublishable.filter(p => {
          const url = p.url || p.sourceUrl || '';
          return !url || !cacheUrlsFb.has(url);
        });
        report.publishable = trulyNew;
        report.trulyNew = trulyNew;
        log('🔍', `${rawPublishable.length} publicáveis → ${trulyNew.length} trulyNew (${rawPublishable.length - trulyNew.length} já no Supabase)`);
        
        // Salva para próximos estágios
        fs.writeFileSync(trulyNewFile, JSON.stringify(report, null, 2));
        log('💾', `_truly_new_${TIMESTAMP}.json salvo (fallback)`);
      } else {
        log('💥', `Curadoria ${path.basename(dailyFile)} nao encontrada. Rode o curador primeiro.`);
        process.exit(1);
      }
    }
  }
  
  // ── STEP 2b: Processar duplicatas (enriquecer posts existentes) ──
  // Executa mesmo quando há trulyNew items — duplicatas com info nova devem atualizar posts antigos
  if (WITH_DUPLICATES && report && !DRY_RUN) {
    const duplicates = (report.discarded || []).filter(d => d.duplicate);
    if (duplicates.length > 0) {
      log('🔄', `${duplicates.length} duplicatas — verificando atualizações...`);
      const enrichDupCmd = `node ${path.join(SCRIPTS_DIR, 'enrich-duplicates.js')} ${reportFile}`;
      await runStep(enrichDupCmd, `Enriquecimento de duplicatas (${duplicates.length})`);
    } else {
      log('ℹ️', 'Nenhuma duplicata para processar');
    }
  } else {
    log('⏭️', 'Enriquecimento de duplicatas pulado (estágios: ' + ACTIVE_STAGES.join(',') + ')');
  }

  // ── STEP 2.5: Cross-match com Instagram (se --ig) ──────────
  if (WITH_IG && WITH_CURATOR && trulyNew.length > 0) {
    const igFiles = fs.readdirSync(path.join(BASE_DIR, 'data/ufg-instagram'))
      .filter(f => f.startsWith('ig-browser-') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (igFiles.length > 0) {
      const igFile = path.join(BASE_DIR, 'data/ufg-instagram', igFiles[0]);
      log('🔗', `Cross-match: sites UFG ↔ Instagram (${path.basename(igFile)})`);
      
      try {
        execSync(`node ${path.join(SCRIPTS_DIR, 'cross-matcher.js')} ${reportFile} ${igFile}`, {
          timeout: 30000, encoding: 'utf8', maxBuffer: 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        // Reload enriched report (cross-matcher saves a new file)
        const enrichedFile = path.join(DATA_DIR, `curadoria-enriquecida-${TIMESTAMP}.json`);
        if (fs.existsSync(enrichedFile)) {
          const enriched = JSON.parse(fs.readFileSync(enrichedFile, 'utf8'));
          const enrichedTrulyNew = enriched.publishable || [];
          const matchCount = enriched.crossMatch?.matched || 0;
          log('✅', `Cross-match: ${matchCount}/${enrichedTrulyNew.length} itens enriquecidos com Instagram`);
        }
      } catch (e) {
        log('⚠️', `Cross-match: ${e.message.slice(0, 60)}`);
        log('ℹ️', 'Continuando sem enriquecimento IG');
      }
    } else {
      log('ℹ️', 'Nenhum arquivo IG encontrado — pulando cross-match');
    }
  }

  // ── STEP 3: Formatação IA (obrigatória via --publish/--format) ─
  let formattedItems = trulyNew;
  const formattedFile = path.join(DATA_DIR, `_formatted_${TIMESTAMP}.json`);
  
  if (!WITH_FORMAT) {
    log('⏭️', 'Formatador pulado (estágios: ' + ACTIVE_STAGES.join(',') + ')');
    if (ACTIVE_STAGES.includes('format') || ACTIVE_STAGES.includes('publish') || ACTIVE_STAGES.includes('enrich')) {
      // Modo stage: precisa carregar formattedItems do disco
      const stageFormatted = formattedFile;
      if (trulyNew.length === 0) {
        formattedItems = [];
        log('ℹ️', 'Formatted ignorado: _truly_new do dia está vazio');
      } else if (fs.existsSync(stageFormatted)) {
        const f = JSON.parse(fs.readFileSync(stageFormatted, 'utf8'));
        if (f.items) {
          formattedItems = f.items;
          log('📂', `Carregados ${formattedItems.length} itens formatados de ${path.basename(stageFormatted)}`);
        }
      } else {
        log('⚠️', `Arquivo ${path.basename(stageFormatted)} nao encontrado. Rodar --stage=format antes.`);
      }
    }
  } else if (WITH_FORMAT && trulyNew.length === 0) {
    log('ℹ️', 'Formatador: 0 itens trulyNew para formatar');
    fs.writeFileSync(formattedFile, JSON.stringify({
      items: [],
      generatedAt: new Date().toISOString(),
      source: path.basename(trulyNewFile),
      reason: 'no_truly_new',
    }, null, 2));
    log('💾', `${path.basename(formattedFile)} salvo vazio (no-op)`);
  } else if (WITH_FORMAT && trulyNew.length > 0) {
    // ── Pre-check: consulta Supabase para separar novos de já publicados ──
    // Itens já publicados não precisam de formatação (vão direto pro merge no Stage 3)
    let needsFormatting = trulyNew;
    let alreadyPublished = [];
    
    try {
      const { spawnSync } = require('child_process');
      // Usa o publish_auto_v5.js para checar existentes (já tem a lógica pronta)
      const checkFile = path.join(DATA_DIR, `_check_existing_${TIMESTAMP}.json`);
      fs.writeFileSync(checkFile, JSON.stringify({ publishable: trulyNew }));
      
      // Roda publish_auto_v5 em modo check-only (--dry-run)
      // Isso popula o report com info de itens existentes sem publicar
      const checkResult = spawnSync('node', [
        path.join(SCRIPTS_DIR, 'publish_auto_v5.js'),
        checkFile,
        '--dry-run'
      ], { timeout: 30000, encoding: 'utf8', env: process.env });
      
      // Tenta extrair sourceUrls de itens que já tem post
      const existingUrls = new Set();
      const output = checkResult.stdout || '';
      const mergeMatches = output.matchAll(/merge-cadu.*?→\s+(\S+)\s+\(era\s+(\w+)\)/g);
      for (const m of mergeMatches) {
        // Marca como existente — o título está no log, precisamos casar com sourceUrl
        // Por simplicidade: toda linha de merge-cadu indica item existente
      }
      
      // Abordagem alternativa: usa fetch direto no Supabase REST
      const https = require('https');
      const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';
      const ANON_KEY = process.env.CADU_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
      
      if (ANON_KEY) {
        // Pega todos os source_urls existentes em batch (1 query)
        const urls = trulyNew.map(i => i.sourceUrl || i.url).filter(Boolean);
        if (urls.length > 0) {
          // Usa o endpoint RPC ou uma query IN
          const orConditions = urls.map((u, i) => `metadata->>source_url.eq.${encodeURIComponent(u)}`).join(',');
          // Limita a 20 URLs por query pra não estourar URL length
          const batchSize = 20;
          for (let b = 0; b < urls.length; b += batchSize) {
            const batch = urls.slice(b, b + batchSize);
            const orFilter = batch.map(u => `metadata->>source_url.eq.${encodeURIComponent(u)}`).join(',');
            const queryUrl = `${SUPABASE_URL}/rest/v1/posts?select=id,metadata->source_url&or=(${orFilter})&status=neq.deleted&limit=${batchSize}`;
            
            try {
              const existingCheck = await new Promise((resolve) => {
                const req = https.get(queryUrl, {
                  headers: {
                    'apikey': ANON_KEY,
                    'Authorization': `Bearer ${ANON_KEY}`,
                    'Accept': 'application/json'
                  },
                  timeout: 10000
                }, (res) => {
                  let body = '';
                  res.on('data', c => body += c);
                  res.on('end', () => {
                    try { resolve(JSON.parse(body)); } catch { resolve([]); }
                  });
                });
                req.on('error', () => resolve([]));
                req.on('timeout', () => { req.destroy(); resolve([]); });
              });
              
              if (Array.isArray(existingCheck)) {
                existingCheck.forEach(post => {
                  const url = post.source_url;  // Supabase flatten: metadata->>source_url vira source_url
                  if (url) existingUrls.add(url);
                });
              }
            } catch (e) {
              // FIX 2026-06-25 FRAG F: NAO silenciar falha de query Supabase.
              // Se existingUrls ficar vazio, todos os itens vao pra needsFormatting
              // e o publish falha em massa. Pelo menos logar pra debug.
              log('⚠️', `Pre-check Supabase falhou: ${e.message ? e.message.slice(0, 100) : 'unknown'}. Formatando todos os ${trulyNew.length} itens (cache miss).`);
            }
          }
        }
      }
      
      // Split
      needsFormatting = trulyNew.filter(i => {
        const url = i.sourceUrl || i.url;
        return !existingUrls.has(url);
      });
      alreadyPublished = trulyNew.filter(i => {
        const url = i.sourceUrl || i.url;
        return existingUrls.has(url);
      });
      
      if (alreadyPublished.length > 0) {
        log('📋', `${alreadyPublished.length} itens já publicados — pulando formatação, vão direto pro merge`);
        log('🆕', `${needsFormatting.length} itens realmente novos — serão formatados`);
      }
      
      try { fs.unlinkSync(checkFile); } catch (_) {}
    } catch (e) {
      log('⚠️', `Pre-check existentes falhou: ${e.message.slice(0, 60)}. Formatando todos.`);
      needsFormatting = trulyNew;
      alreadyPublished = [];
    }
    
    // Se não há itens novos, pula formatação
    let tempFile = null;
    if (needsFormatting.length === 0) {
      log('⏭️', 'Nenhum item novo para formatar — todos já publicados (ou dedup já cobriu)');
      // FIX 2026-06-25: nao publicar itens sem formattedDescription.
      // Quando o pre-check marca 100% como alreadyPublished (falso positivo ou URL duplicada),
      // precisamos GARANTIR que eles nao vao pro publish — senao o publisher rejeita todos
      // com "sem formattedDescription (0ch)" (vide run 49c7ccec - 7 erros).
      // O dedup stage (Stage 2) ja atualizou capas/metadata dos posts existentes.
      formattedItems = [];
      fs.writeFileSync(formattedFile, JSON.stringify({
        items: [],
        generatedAt: new Date().toISOString(),
        source: path.basename(trulyNewFile),
        skippedAlreadyPublished: alreadyPublished.length,
        reason: 'all_already_published',
      }, null, 2));
      log('💾', `${path.basename(formattedFile)} salvo vazio (todos ja publicados)`);
    } else {
    log('🤖', `Formatando ${needsFormatting.length} itens com DeepSeek V4 Pro...`);
    
    // Write needsFormatting items to temp file for formatador
    tempFile = path.join(DATA_DIR, `_temp_format_${TIMESTAMP}.json`);
    fs.writeFileSync(tempFile, JSON.stringify({ publishable: needsFormatting }));
    
    const formatResult = await runStep(
      `node ${path.join(SCRIPTS_DIR, 'formatador-ia.js')} ${tempFile} --output ${formattedFile}`,
      `Formatador IA (${trulyNew.length} itens)`
    );
    
    if (formatResult) {
      try {
        if (fs.existsSync(formattedFile)) {
          const formatted = JSON.parse(fs.readFileSync(formattedFile, 'utf8'));
          if (formatted.items && formatted.items.length > 0) {
            formattedItems = formatted.items;
            log('✅', `${formatted.items.filter(i => i.formatted).length}/${formattedItems.length} itens formatados`);
          }
        }
      } catch (e) {
        log('⚠️', `Parse do arquivo formatado falhou: ${e.message.slice(0, 50)}`);
      }
      // Parse the JSON output from formatador (last JSON object in output)
      try {
        const jsonMatch = formatResult.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g);
        if (jsonMatch) {
          const lastJson = jsonMatch[jsonMatch.length - 1];
          const formatted = JSON.parse(lastJson);
          if (formatted.items && formatted.items.length > 0) {
            formattedItems = formatted.items;
            log('✅', `${formatted.items.filter(i => i.formatted).length}/${formattedItems.length} itens formatados`);
          }
        }
      } catch (e) {
        log('⚠️', `Parse do formatador falhou: ${e.message.slice(0, 50)}`);
        log('ℹ️', 'Usando descrições originais (sem formatação IA)');
      }
    }
    } // end else (needsFormatting > 0)
    
    // ── POST-FORMAT: Scrub past dates from descriptions ──
    // Fix 2026-06-24: Edge Function quality gate bloqueia deadline_past/event_past.
    // Remove datas vencidas das descrições formatadas para evitar QUALITY_BLOCKED.
    if (formattedItems.length > 0) {
      const hoje = new Date();
      const hojeStr = hoje.toISOString().slice(0, 10);
      let scrubbedCount = 0;
      
      const meses = {janeiro:1,fevereiro:2,março:3,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
      const dateRegex = /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(de\s+)?(20\d{2})?\b/gi;
      
      for (const item of formattedItems) {
        const desc = item.formattedDescription || item.description || '';
        let changed = false;
        let newDesc = desc;
        
        newDesc = newDesc.replace(dateRegex, (match, dia, mesNome, _, ano) => {
          const mesIdx = meses[mesNome.toLowerCase()] || 1;
          const anoNum = ano ? parseInt(ano) : hoje.getFullYear();
          const dataStr = `${anoNum}-${String(mesIdx).padStart(2,'0')}-${String(parseInt(dia)).padStart(2,'0')}`;
          if (dataStr < hojeStr) {
            changed = true;
            return '';
          }
          return match;
        });
        
        if (changed) {
          newDesc = newDesc.replace(/\*\*\s+\*\*/g, '');
          newDesc = newDesc.replace(/📅\s*\n?/g, '');
          newDesc = newDesc.replace(/\n{3,}/g, '\n\n');
          newDesc = newDesc.replace(/\s{2,}/g, ' ');
          newDesc = newDesc.trim();
          item.formattedDescription = newDesc;
          item.description = newDesc;
          scrubbedCount++;
        }
      }
      if (scrubbedCount > 0) log('🧹', `${scrubbedCount} descrições tiveram datas vencidas removidas`);
    }
    
    // Cleanup temp file
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }
  }

  // ── STEP 4: Publicação (se --publish) ────────────────────────
  let published = 0;
  let publishErrors = 0;
  let qualityBlocked = 0;   // FIX 2026-07-02: decisao editorial, NAO falha tecnica
  let technicalErrors = 0;  // FIX 2026-07-02: erros de HTTP/JSON/etc → exit 2
  let publishedRunItems = [];
  
  if (WITH_PUBLISH && formattedItems.length > 0) {
    const skippedForQuality = [];
    const publishItems = [];
    for (const item of formattedItems) {
      const issues = publishReadinessIssues(item);
      if (issues.length) {
        skippedForQuality.push({
          title: item.title,
          sourceUrl: item.sourceUrl || item.url || item.link || '',
          module: item.module,
          issues,
          reasons: item.reasons || [],
          dates: item.dates || {},
        });
      } else {
        publishItems.push(item);
      }
    }

    if (skippedForQuality.length > 0) {
      const skippedFile = path.join(DATA_DIR, `_publish_skipped_quality_${TIMESTAMP}.json`);
      fs.writeFileSync(skippedFile, JSON.stringify({
        generatedAt: new Date().toISOString(),
        skipped: skippedForQuality,
      }, null, 2));
      log('🚧', `${skippedForQuality.length} itens enviados para revisão antes do publish (${path.basename(skippedFile)})`);
    }

    if (publishItems.length === 0) {
      log('ℹ️', 'Publicação: nenhum item apto após filtro de qualidade');
    } else {
    // Write formatted items for publish_auto_v5
    const publishFile = path.join(DATA_DIR, `_temp_publish_${TIMESTAMP}.json`);
    fs.writeFileSync(publishFile, JSON.stringify({
      publishable: publishItems.map(item => ({
        module: item.module,
        category: item.category,
        title: item.title,
        description: item.formattedDescription || item.description || item.text || '',
        formattedDescription: item.formattedDescription || '',
        text: item.text || item.description || '',
        url: item.sourceUrl || item.url || item.link || '',
        image: item.image || '',
        images: Array.isArray(item.images)
          ? item.images
          : [item.image, item.imageUrl, item.image_url, item.cover].filter(Boolean),
        sourceId: item.sourceId || `${item.site || 'ufg'}:${item.sourceUrl || item.url}`,
        sourceUrl: item.sourceUrl || item.url,
        sourceName: item.sourceName || item.site || 'UFG',
        enrichmentSources: Array.isArray(item.enrichmentSources)
          ? item.enrichmentSources
          : [item.sourceUrl || item.url].filter(Boolean).map(url => ({ url, label: 'Fonte oficial', type: 'official' })),
        link: item.link || item.sourceUrl || item.url || '',
        linkAsCta: item.linkAsCta !== false,
        actionLabel: item.actionLabel || '',
        actionKey: item.actionKey || '',
        contato: item.contato || '',
        score: item.score,
        dates: item.dates || {},
        pdfLinks: item.pdfLinks || item.pdfs || [],
        tags: item.tags || [],
        area: item.area || '',
        gratuito: item.module === 'eventos' ? true : undefined,
      })),
    }));
    
    const publishCmd = DRY_RUN
      ? `node ${path.join(SCRIPTS_DIR, 'publish_auto_v5.js')} --dry-run ${publishFile}`
      : `node ${path.join(SCRIPTS_DIR, 'publish_auto_v5.js')} ${publishFile}`;
    
    log('📤', `${DRY_RUN ? 'DRY-RUN' : 'PUBLICANDO'} ${publishItems.length} itens...`);
    const publishResult = await runStep(publishCmd, `Publicação (${publishItems.length} itens)`);
    
    if (publishResult) {
      // Count published
      const pubMatch = publishResult.match(/Publicados:\s*(\d+)/);
      if (pubMatch) published = parseInt(pubMatch[1]);
      const errMatch = publishResult.match(/Erros:\s*(\d+)/);
      if (errMatch) publishErrors = parseInt(errMatch[1]);
      const jsonMatch = publishResult.match(/__CADU_PUBLISH_JSON__(\{[^\n]+\})/);
      if (jsonMatch) {
        try {
          const summary = JSON.parse(jsonMatch[1]);
          if (Number.isFinite(summary.published)) published = summary.published;
          if (Number.isFinite(summary.errors)) publishErrors = summary.errors;
          publishedRunItems = [
            ...(summary.items?.published || []),
            ...(summary.items?.merged || []),
          ];
          // FIX 2026-07-02: classificar erros. QUALITY_BLOCKED e decisao editorial
          // (deadline_past, conteudo inadequado) — NAO conta como falha tecnica.
          // Erros tecnicos (HTTP fail, JSON invalid, etc) sao os unicos que devem
          // marcar o run como failed (exit 2). Antes disso QUALITY_BLOCKED sozinho
          // fazia o alerta Cadu disparar como "critical" e o run todo era marcado
          // failed mesmo tendo publicado 1+ post com sucesso.
          const errItems = summary.items?.errors || [];
          qualityBlocked = errItems.filter(e => e?.code === 'QUALITY_BLOCKED').length;
          technicalErrors = errItems.filter(e => e?.code && e.code !== 'QUALITY_BLOCKED').length;
        } catch (e) {
          log('⚠️', `Parse do resumo publish falhou: ${e.message ? e.message.slice(0, 80) : 'unknown'}`);
        }
      }
    }
    
    try { fs.unlinkSync(publishFile); } catch (_) {}
    }
  }

  // ── STEP 5: Enriquecimento de Imagens (se --publish) ───────
  let enrichedImages = 0;
  
  if (WITH_ENRICH && published > 0 && !DRY_RUN) {
    log('🖼️', 'Enriquecendo imagens complementares dos posts publicados...');
    
    const enrichItems = publishedRunItems
      .filter(item => item.postId && item.sourceUrl)
      .map(item => ({
        postId: item.postId,
        title: item.title,
        sourceUrl: item.sourceUrl,
      }));
    
    if (enrichItems.length > 0) {
      const enrichFile = path.join(DATA_DIR, `_temp_enrich_${TIMESTAMP}.json`);
      fs.writeFileSync(enrichFile, JSON.stringify({ items: enrichItems }));
      
      const enrichCmd = `node ${path.join(SCRIPTS_DIR, 'enrich-images.js')} --file ${enrichFile}`;
      const enrichResult = await runStep(enrichCmd, `Enriquecimento de imagens (${enrichItems.length} fontes)`);
      
      if (enrichResult) {
        try {
          // FIX 2026-06-26 FRAG F v2: pegar ULTIMO array JSON valido.
          // O regex antigo `/\[([\s\S]*?)\]/` non-greedy pegava o primeiro `]`
          // do output (podia ser de log), quebrando o parse do array real.
          const jsonMatches = enrichResult.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
          if (jsonMatches && jsonMatches.length > 0) {
            // Pega o maior match (geralmente o array JSON completo vem por ultimo
            // depois de logs/texto do stdout)
            const lastJson = jsonMatches.reduce((a, b) => a.length > b.length ? a : b);
            const results = JSON.parse(lastJson);
            enrichedImages = results.filter(r => r.added > 0).length;
          }
        } catch (e) {
          // FIX 2026-06-25 FRAG F: NAO silenciar parse do enrich result.
          // Se o formato mudou, queremos saber pra corrigir o regex.
          log('⚠️', `Parse do enrich result falhou: ${e.message ? e.message.slice(0, 80) : 'unknown'}`);
        }
      }
      
      try { fs.unlinkSync(enrichFile); } catch (_) {}
    } else {
      log('ℹ️', 'Enriquecimento pulado: publisher nao retornou postId/sourceUrl dos itens do run');
    }
  }

  // ── STEP 6 (F2 B6, 2026-07-06): Deduplicação inline pós-publish ─
  // Antes o `dedup-kino.js` rodava SÓ em cron diário → posts duplicados
  // ficavam visíveis no site por horas/dias. Agora roda inline ao final
  // do publish (mesma sessão), fechando a janela de duplicação.
  // Usa --no-llm (sem IA) + --days=7 (lookback curto) pra ser rápido.
  if (WITH_PUBLISH && (published > 0 || qualityBlocked > 0) && !DRY_RUN) {
    log('🔁', 'Dedup inline pós-publish (--no-llm --days=7) — fecha janela de duplicação visível');
    const dedupCmd = `node ${path.join(SCRIPTS_DIR, 'dedup-kino.js')} --no-llm --days=7`;
    try {
      const dedupResult = await runStep(dedupCmd, 'Dedup inline');
      // (dedupResult é std-out string; log aparece no run, nao precisa parsear)
    } catch (e) {
      log('⚠️', `Dedup inline falhou (publicação já foi ok, dedup roda em cron depois): ${e.message ? e.message.slice(0, 80) : 'unknown'}`);
    }
  } else if (WITH_PUBLISH && (published > 0 || qualityBlocked > 0) && DRY_RUN) {
    log('ℹ️', 'DRY-RUN: dedup inline pulado (rodar com --no-dry-run em prod)');
  }

  // ── FINAL SUMMARY ────────────────────────────────────────────
  printSummary(report || {}, published, enrichedImages);
  if (WITH_PUBLISH && publishErrors > 0) {
    // FIX 2026-07-02: QUALITY_BLOCKED e separado de erros tecnicos.
    // Se TODOS os erros foram decisao editorial (deadline_past, etc),
    // exit 0 (success) e log mostra quantos foram rejeitados.
    // So marca como failed (exit 2) se houver erros tecnicos reais.
    if (technicalErrors > 0) {
      log('❌', `Publish terminou com ${technicalErrors} erro(s) tecnico(s) + ${qualityBlocked} bloqueio(s) de qualidade; marcando run como falho`);
      process.exitCode = 2;
    } else if (qualityBlocked > 0) {
      log('⚠️', `Publish rejeitou ${qualityBlocked} item(ns) por barreira de qualidade editorial (NAO falhou); run OK`);
      // process.exitCode permanece 0 (success)
    }
  }
}

function printSummary(report, published, enrichedImages = 0) {
  const elapsed = ((Date.now() - START_TIME) / 1000).toFixed(1);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 PIPELINE CONCLUÍDO em ${elapsed}s`);
  console.log(`${'='.repeat(60)}`);
  
  const stats = report.stats || {};
  console.log(`  Sites escaneados:  ${stats.totalSites || '?'}`);
  console.log(`  Total itens:       ${stats.totalItems || '?'}`);
  console.log(`  📝 Publicáveis:    ${stats.publishable || 0}`);
  console.log(`  🔍 Revisão:        ${stats.reviewable || 0}`);
  console.log(`  ❌ Descartados:    ${stats.discarded || 0}`);
  
  if (WITH_PUBLISH) {
    console.log(`  📤 Publicados:     ${published}${DRY_RUN ? ' (dry-run)' : ''}`);
    if (enrichedImages > 0) {
      console.log(`  🖼️  Imagens comp.:  ${enrichedImages} posts enriquecidos`);
    }
  }
  
  console.log(`\n📁 Relatório: data/ufg-scrape/curadoria-v4.4-*-${TIMESTAMP}.json`);
  console.log();
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
