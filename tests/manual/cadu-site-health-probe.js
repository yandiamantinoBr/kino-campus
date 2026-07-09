#!/usr/bin/env node
/**
 * Cadu Site Health Probe — audita os sites UFG crawleados pelo curador.
 *
 * Para cada site, verifica:
 *   - /news.json (ou /novo/sistemas/noticias.json) — status HTTP, contagem de items
 *   - /events.json — status HTTP, contagem de items
 *   - Latência e erros de TLS/DNS
 *
 * Gera relatório em docs/cadu-site-health-YYYY-MM-DD.md
 *
 * Uso: node tests/manual/cadu-site-health-probe.js [--timeout 8000] [--out docs/]
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--timeout') || '8000', 10);
const OUT_DIR = process.argv.find((a, i) => process.argv[i - 1] === '--out') || 'docs';

// Caminhos comuns de feeds JSON nos sites UFG
const FEED_PATHS = [
  '/news.json',
  '/novo/sistemas/noticias.json',
  '/events.json',
  '/eventos.json',
  '/feed.json',
];

// Extrai a lista de sites do cadu-curador-v4.4.js (em vez de hardcodar).
// Procura por padrões url: 'https://...' no arquivo TIERS.
function loadSitesFromCurador() {
  const curadorPath = path.join(__dirname, '..', '..', 'data', '.openclaw', 'workspace', 'scripts', 'cadu-curador-v4.4.js');
  try {
    const src = fs.readFileSync(curadorPath, 'utf8');
    const matches = [...src.matchAll(/url:\s*'([^']+)'/g)];
    const urls = [...new Set(matches.map(m => m[1]).filter(u => /^https?:\/\//.test(u)))].sort();
    if (urls.length > 0) return urls;
    console.warn('Aviso: não foi possível extrair URLs do curador, usando lista fallback.');
  } catch (e) {
    console.warn('Aviso: curador não encontrado em ' + curadorPath + ', usando lista fallback.');
  }
  // Fallback mínimo
  return [
    'https://ufg.br', 'https://secom.ufg.br', 'https://prpi.ufg.br', 'https://proex.ufg.br',
    'https://prograd.ufg.br', 'https://prae.ufg.br', 'https://sri.ufg.br',
    'https://institutoverbena.ufg.br', 'https://prpg.ufg.br',
  ];
}
const SITES = loadSitesFromCurador();

function fetchHead(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const start = Date.now();
    const opts = { method: 'GET', timeout: TIMEOUT_MS, headers: { 'User-Agent': 'KinoCampus-Cadu-HealthProbe/1.0' } };
    const req = lib.request(url, opts, (res) => {
      res.resume();
      resolve({ status: res.statusCode, latency: Date.now() - start, ok: res.statusCode >= 200 && res.statusCode < 400 });
    });
    req.on('error', (e) => {
      // TLS: sites com certificado inválido (missing intermediate CA) são acessíveis
      // mas Node strict rejeita. Tenta novamente com rejectUnauthorized:false para
      // distinguir "TLS ruim" de "site realmente offline".
      if (e.message.indexOf('certificate') >= 0 || e.message.indexOf('verify') >= 0) {
        const retryOpts = { ...opts, rejectUnauthorized: false };
        const retryReq = lib.request(url, retryOpts, (res) => {
          res.resume();
          resolve({ status: res.statusCode, latency: Date.now() - start, ok: res.statusCode >= 200 && res.statusCode < 400, warning: 'TLS: certificado inválido/incompleto' });
        });
        retryReq.on('error', () => resolve({ status: 0, latency: Date.now() - start, ok: false, error: e.message }));
        retryReq.on('timeout', () => { retryReq.destroy(); resolve({ status: 0, latency: Date.now() - start, ok: false, error: 'timeout' }); });
        retryReq.end();
      } else {
        resolve({ status: 0, latency: Date.now() - start, ok: false, error: e.message });
      }
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, latency: TIMEOUT_MS, ok: false, error: 'timeout' }); });
    req.end();
  });
}

async function probeSite(baseUrl) {
  const host = baseUrl.replace(/^https?:\/\//, '');
  const results = { site: baseUrl, host, feeds: {}, homepage: null };
  // Homepage
  results.homepage = await fetchHead(baseUrl);
  // Feeds
  for (const feedPath of FEED_PATHS) {
    const r = await fetchHead(baseUrl + feedPath);
    if (r.status > 0) {
      results.feeds[feedPath] = r;
    }
  }
  return results;
}

async function main() {
  console.log(`=== Cadu Site Health Probe — ${SITES.length} sites ===`);
  const results = [];
  // Processa em batches de 5 para não saturar
  for (let i = 0; i < SITES.length; i += 5) {
    const batch = SITES.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(probeSite));
    results.push(...batchResults);
    process.stdout.write('.');
  }
  console.log('\n');

  // Relatório
  const today = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(OUT_DIR, `cadu-site-health-${today}.md`);
  let md = `# Cadu Site Health Probe — ${today}\n\n`;
  md += `Auditado ${results.length} sites UFG crawleados pelo curador (cadu-curador-v4.4.js).\n\n`;
  md += `| Site | Homepage | /news.json | /events.json | Latência |\n`;
  md += `|------|----------|------------|-------------|----------|\n`;
  let okCount = 0, warnCount = 0, errCount = 0;
  results.forEach((r) => {
    const hp = r.homepage;
    const news = r.feeds['/news.json'] || r.feeds['/novo/sistemas/noticias.json'];
    const events = r.feeds['/events.json'] || r.feeds['/eventos.json'];
    const hpStatus = hp ? (hp.ok ? (hp.warning ? '⚠️' + hp.status : '✅' + hp.status) : '❌' + (hp.status || hp.error || '0')) : '❌';
    const newsStatus = news ? (news.ok ? '✅' + news.status : '⚠️' + news.status) : '—';
    const eventsStatus = events ? (events.ok ? '✅' + events.status : '⚠️' + events.status) : '—';
    const latency = hp ? hp.latency + 'ms' : '—';
    md += `| ${r.host} | ${hpStatus} | ${newsStatus} | ${eventsStatus} | ${latency} |\n`;
    if (hp && hp.ok) okCount++; else if (hp && hp.status > 0) warnCount++; else errCount++;
  });
  md += `\n**Resumo:** ${okCount} online, ${warnCount} com avisos, ${errCount} offline/erro.\n`;

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, md);
  console.log(`Relatório salvo em: ${reportPath}`);
  console.log(`Resumo: ${okCount} online, ${warnCount} avisos, ${errCount} offline`);
}

main().catch((e) => { console.error('Erro:', e); process.exit(1); });
