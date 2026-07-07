#!/usr/bin/env node
/**
 * enrich-event-link.js — Enriquecimento de evento UFG via browser headless (CDP)
 *
 * Recebe uma URL de evento UFG (ex: https://ufg.br/events?event=39173 ou
 * https://ufg.br/e/39272-slug), descobre o slug canonico, e usa Chromium
 * (CDP via /json/new + per-target WebSocket) pra navegar ate a pagina
 * canonica do evento, extraindo:
 *
 *   - og:title / og:description / og:image / og:url
 *   - link[rel="canonical"]
 *   - texto principal (Local, Periodo, etc)
 *   - PDF links
 *
 * Por que este script e necessario:
 *
 *  - A URL `/events?event=N` retorna HTML so com footer da home (evento
 *    e' exibido num modal JS, nao na pagina rendereizada).
 *  - A URL canonica e' `/e/{slug}`, mas o slug vem em `/events.json`
 *    (endpoint JSON nao-SPA).
 *
 * Algoritmo:
 *
 *   1. Se URL ja e `/e/{slug}`: navega direto no browser.
 *   2. Se URL e `/events?event=N`: baixa /events.json (curl), procura
 *      o id, acha slug, navega em `/e/{slug}`.
 *   3. Extrai metadata via Runtime.evaluate.
 *
 * Padrao de conexao CDP segue scan-ig-browser.js (per-target WebSocket),
 * NAO usar /devtools/browser (concorrente com sessoes autenticadas existentes).
 *
 * Uso:
 *
 *   node scripts/enrich-event-link.js --file item.json
 *   echo '{"url":"https://ufg.br/events?event=39173"}' | node scripts/enrich-event-link.js
 *
 * Saida (stdout): JSON com metadata enriquecido ou erro estruturado.
 * Exit codes: 0 = ok, 1 = enrichment falhou, 2 = uso incorreto,
 *             3 = host bloqueado, 4 = slug nao encontrado
 */

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const WebSocket = require('ws');

// ============================================================
// CONFIG
// ============================================================

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 18800;
const EVENTS_JSON_URL = 'https://ufg.br/events.json';
const NAV_TIMEOUT_MS = 18_000;
const POST_LOAD_WAIT_MS = 3_000;
const CDP_RPC_TIMEOUT_MS = 25_000;
const CURL_TIMEOUT_MS = 12_000;

const ALLOWED_HOSTS = new Set([
  'ufg.br',
  'www.ufg.br',
  'files.cercomp.ufg.br',
  'sistemas.ufg.br',
  'noticias.ufg.br',
]);

function isAllowedHost(hostname) {
  if (!hostname) return false;
  if (ALLOWED_HOSTS.has(hostname)) return true;
  return hostname.endsWith('.ufg.br');
}

// ============================================================
// HTTP helpers (Node puro, sem dependencias externas)
// ============================================================

function httpFetch(urlString, { maxBytes = 8 * 1024 * 1024, timeoutMs = CURL_TIMEOUT_MS } = {}) {
  const target = new URL(urlString);
  const lib = target.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = lib.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome Chrome/130 Safari/537.36',
          'Accept': 'application/json, text/html;q=0.9, */*;q=0.8',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          // Segue redirect manualmente (HTTPS -> HTTPS) ate 3 levels
          const next = new URL(res.headers.location, urlString).toString();
          res.resume();
          if (next === urlString) return resolve({ ok: false, error: 'redirect_loop' });
          httpFetch(next, { maxBytes, timeoutMs }).then(resolve);
          return;
        }
        if (status !== 200) {
          res.resume();
          return resolve({ ok: false, error: `status_${status}` });
        }
        let received = 0;
        const chunks = [];
        res.on('data', (c) => {
          received += c.length;
          if (received <= maxBytes) chunks.push(c);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ ok: true, body, status });
        });
      },
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(timeoutMs, function () { req.destroy(new Error('timeout')); });
    req.end();
  });
}

// /json/new (sem query) cria target em about:blank — CDP HTTP endpoint.
async function createBlankTarget() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://${CDP_HOST}:${CDP_PORT}/json/new`,
      { method: 'PUT' },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`/json/new status ${res.statusCode}: ${body.slice(0, 100)}`));
          }
          try { resolve(JSON.parse(body)); }
          catch (_) { reject(new Error('invalid JSON from /json/new')); }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(5_000, function () { req.destroy(); reject(new Error('/json/new timeout')); });
    req.end();
  });
}

async function closeTarget(targetId) {
  return new Promise((resolve) => {
    const req = http.request(
      `http://${CDP_HOST}:${CDP_PORT}/json/close/${targetId}`,
      { method: 'GET' },
      (res) => { res.on('data', () => {}); res.on('end', () => resolve()); },
    );
    req.on('error', () => resolve());
    req.setTimeout(3_000, function () { req.destroy(); resolve(); });
    req.end();
  });
}

// ============================================================
// CDPClient per-target
// ============================================================

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.loadHandlers = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: false });
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch (_) { return; }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: r, reject: rj } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rj(new Error(msg.error.message || 'CDP error'));
          else r(msg.result);
        } else if (msg.method === 'Page.loadEventFired') {
          const handlers = this.loadHandlers;
          this.loadHandlers = [];
          for (const h of handlers) { try { h(); } catch (_) {} }
        }
      });
      setTimeout(() => reject(new Error('CDP connect timeout')), 5_000);
    });
  }

  async send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, CDP_RPC_TIMEOUT_MS);
    });
  }

  onLoad(handler) { this.loadHandlers.push(handler); }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

// ============================================================
// EXTRACT expression
// ============================================================

const EXTRACT_EXPR = `
  (() => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute('content') || null;
    const canonical = document.querySelector('link[rel="canonical"]')?.href
      || meta('meta[property="og:url"]')
      || location.href;
    const mainText = (document.querySelector('main')?.innerText
      || document.querySelector('article')?.innerText
      || document.querySelector('#content')?.innerText
      || document.body?.innerText
      || '').slice(0, 6000);
    const pdfLinks = Array.from(
      document.querySelectorAll('a[href$=".pdf"], a[href*=".pdf?"]'))
      .map((a) => a.href)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 10);
    return JSON.stringify({
      finalUrl: location.href,
      title: document.title,
      ogTitle: meta('meta[property="og:title"]'),
      ogDescription: meta('meta[property="og:description"]'),
      ogImage: meta('meta[property="og:image"]'),
      description: meta('meta[name="description"]'),
      canonical,
      mainText,
      pdfLinks,
      textLength: (document.body?.innerText || '').length,
      linksCount: document.querySelectorAll('a').length,
    });
  })();
`;

/**
 * Navega ate `targetUrl`, espera load, extrai metadata via Runtime.evaluate.
 */
async function navigateAndExtract(cdp, targetUrl) {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const loadedPromise = new Promise((resolve) => {
    cdp.onLoad(() => resolve('event'));
    setTimeout(() => resolve('timeout'), NAV_TIMEOUT_MS);
  });

  const navResult = await cdp.send('Page.navigate', { url: targetUrl });
  if (navResult?.errorText) {
    throw new Error(`Page.navigate error: ${navResult.errorText}`);
  }

  const loadedReason = await loadedPromise;

  // Scroll para trigger lazy-load + grace JS
  await cdp.send('Runtime.evaluate', {
    expression: `
      (async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 1500));
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 500));
        return 'scrolled';
      })();
    `,
    awaitPromise: true,
    returnByValue: true,
  });
  await new Promise((r) => setTimeout(r, POST_LOAD_WAIT_MS));

  const evResult = await cdp.send('Runtime.evaluate', {
    expression: EXTRACT_EXPR,
    returnByValue: true,
  });

  let metadata = null;
  if (evResult?.result?.value) {
    try { metadata = JSON.parse(evResult.result.value); } catch (_) {}
  }

  if (!metadata) throw new Error('extraction returned no metadata');
  return { metadata, loadedReason };
}

async function withChromiumExtraction(navigateFn) {
  let target;
  try {
    target = await createBlankTarget();
  } catch (e) {
    throw new Error(`createTarget failed: ${e.message}`);
  }
  if (!target?.webSocketDebuggerUrl) {
    if (target?.id) await closeTarget(target.id);
    throw new Error('createTarget did not return webSocketDebuggerUrl');
  }

  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  try {
    await cdp.connect();
    const { metadata, loadedReason } = await navigateFn(cdp);
    return { metadata, loadedReason };
  } finally {
    cdp.close();
    if (target?.id) await closeTarget(target.id).catch(() => {});
  }
}

// ============================================================
// /events.json helpers (camada 1, sem browser)
// ============================================================

async function fetchEventsJson() {
  const res = await httpFetch(EVENTS_JSON_URL);
  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  try {
    const parsed = JSON.parse(res.body);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: 'invalid_json' };
  }
}

/**
 * Resolve canonical slug given various URL forms.
 * Returns canonical ufg.br/e/{slug} URL or null.
 */
async function resolveCanonicalUrl(sourceUrl) {
  let url;
  try { url = new URL(sourceUrl); } catch (_) { return null; }
  if (!isAllowedHost(url.hostname)) return null;

  // Ja' e /e/{slug}?
  const eMatch = url.pathname.match(/^\/e\/(\d+-[a-z0-9-]+)$/i);
  if (eMatch) return url.toString();

  // /events?event=N → resolve via /events.json
  const eventId = url.searchParams.get('event');
  if (url.pathname === '/events' || url.pathname === '/events/') {
    if (eventId) {
      const ev = await fetchEventsJson();
      if (ev.ok && Array.isArray(ev.data?.events)) {
        const found = ev.data.events.find((e) => String(e.id) === String(eventId));
        if (found?.slug) return `https://ufg.br/e/${found.slug}`;
      }
      // fallback: assume slug == id (nao vale a pena)
      return null;
    }
  }

  // URL desconhecida: tenta navegar como esta
  return url.toString();
}

async function enrichUrl(sourceUrl) {
  const startedAt = new Date().toISOString();
  const canonicalUrl = await resolveCanonicalUrl(sourceUrl);

  // Se nao achou slug → tenta navegar como esta
  const navigateUrl = canonicalUrl || sourceUrl;

  const { metadata, loadedReason } = await withChromiumExtraction((cdp) =>
    navigateAndExtract(cdp, navigateUrl),
  );

  // Detecta se a pagina renderizada foi de fato um evento
  // (heuristica simples: mainText > 500 chars e contem "evento" ou "Local:")
  const looksLikeEvent = metadata.mainText && (
    metadata.mainText.length > 500 ||
    /local:|período|período do evento|inscri[çc][õo]es?|edital/i.test(metadata.mainText)
  );

  return {
    sourceUrl,
    canonicalUrl,
    navigateUrl,
    enrichmentMethod: 'cdp-chromium',
    enrichedAt: startedAt,
    loadedReason,
    looksLikeEvent: !!looksLikeEvent,
    metadata,
  };
}

// ============================================================
// CLI
// ============================================================

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
  });
}

async function readCliInput() {
  const argv = process.argv.slice(2);
  const fileIdx = argv.indexOf('--file');
  if (fileIdx >= 0) {
    const p = argv[fileIdx + 1];
    if (!p) { console.error('--file requer caminho'); process.exit(2); }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  if (argv[0] && argv[0].startsWith('{')) {
    return JSON.parse(argv[0]);
  }
  if (!process.stdin.isTTY) {
    const buf = await readStdin();
    if (buf.trim()) return JSON.parse(buf);
  }
  console.error('Uso: enrich-event-link.js "{\\"url\\":\\"...\\"}" | --file item.json');
  process.exit(2);
}

async function main() {
  const input = await readCliInput();
  const sourceUrl = input.url || input.sourceUrl;
  if (!sourceUrl) {
    console.error(JSON.stringify({ ok: false, error: 'missing url' }));
    process.exit(2);
  }

  let url;
  try { url = new URL(sourceUrl); }
  catch (_) { console.error(JSON.stringify({ ok: false, error: 'invalid url' })); process.exit(2); }

  if (!isAllowedHost(url.hostname)) {
    console.error(JSON.stringify({
      ok: false,
      error: `host nao permitido: ${url.hostname}`,
      allowedSuffixes: ['ufg.br'],
    }));
    process.exit(3);
  }

  try {
    const enriched = await enrichUrl(sourceUrl);
    if (!enriched.canonicalUrl) {
      console.error(JSON.stringify({ ok: false, error: 'slug_nao_encontrado', sourceUrl }));
      process.exit(4);
    }
    console.log(JSON.stringify({ ok: true, item: { ...input, ...enriched } }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message, sourceUrl }));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: e.message }));
    process.exit(1);
  });
}

module.exports = { enrichUrl, resolveCanonicalUrl, fetchEventsJson, isAllowedHost };
