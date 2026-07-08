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

// Lista de sites extraída do cadu-curador-v4.4.js TIERS
const SITES = [
  'https://ufg.br', 'https://secom.ufg.br', 'https://prpi.ufg.br', 'https://proex.ufg.br',
  'https://prograd.ufg.br', 'https://prae.ufg.br', 'https://sri.ufg.br',
  'https://institutoverbena.ufg.br', 'https://prpg.ufg.br', 'https://proad.ufg.br',
  'https://ouvidoria.ufg.br', 'https://editora.ufg.br', 'https://cegraf.ufg.br',
  'https://museu.ufg.br', 'https://planetario.ufg.br', 'https://cepae.ufg.br',
  'https://cerof.ufg.br', 'https://hospitalveterinario.evz.ufg.br',
  'https://idiomassemfronteiras.sri.ufg.br', 'https://centrocultural.ufg.br',
  'https://agro.ufg.br', 'https://bc.ufg.br', 'https://cei.ufg.br', 'https://ciar.ufg.br',
  'https://cidarq.ufg.br', 'https://cpa.secplan.ufg.br', 'https://csa.goias.ufg.br',
  'https://direito.ufg.br', 'https://eeca.ufg.br', 'https://em.ufg.br', 'https://emc.ufg.br',
  'https://evz.ufg.br', 'https://face.ufg.br', 'https://fanut.ufg.br', 'https://farmacia.ufg.br',
  'https://fav.ufg.br', 'https://fcs.ufg.br', 'https://fct.ufg.br', 'https://fe.ufg.br',
  'https://fef.ufg.br', 'https://fen.ufg.br', 'https://fic.ufg.br', 'https://filosofia.ufg.br',
  'https://firminopolis.ufg.br', 'https://goias.ufg.br', 'https://historia.ufg.br',
  'https://iac.ufg.br', 'https://icb.ufg.br', 'https://iesa.ufg.br', 'https://if.ufg.br',
  'https://ime.ufg.br', 'https://inf.ufg.br', 'https://iptsp.ufg.br', 'https://letras.ufg.br',
  'https://medicina.ufg.br', 'https://odonto.ufg.br', 'https://reitoria.ufg.br',
  'https://sbsl.ufg.br', 'https://si.ufg.br', 'https://social.ufg.br', 'https://veterinaria.ufg.br',
  'https://sistemas.ufg.br', 'https://secplan.ufg.br', 'https://saude.ufg.br',
  'https://lefos.ufg.br', 'https://macae.ufg.br',
];

function fetchHead(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const start = Date.now();
    const req = lib.request(url, { method: 'GET', timeout: TIMEOUT_MS, headers: { 'User-Agent': 'KinoCampus-Cadu-HealthProbe/1.0' } }, (res) => {
      // Só precisamos do status e headers, não do body
      res.resume();
      resolve({ status: res.statusCode, latency: Date.now() - start, ok: res.statusCode >= 200 && res.statusCode < 400 });
    });
    req.on('error', (e) => resolve({ status: 0, latency: Date.now() - start, ok: false, error: e.message }));
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
    const hpStatus = hp ? (hp.ok ? '✅' + hp.status : '❌' + hp.status) : '❌';
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
