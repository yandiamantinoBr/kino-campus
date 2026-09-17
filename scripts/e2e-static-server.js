#!/usr/bin/env node
'use strict';

/**
 * Servidor estatico para E2E/LHCI que REPRODUZ o roteamento do Vercel.
 *
 * Motivo: desde 2026-09-17 as rotas publicas sao canonicas sem extensao
 * (/eventos, /perfil, /configuracoes) e o vercel.json faz:
 *   1) redirect 308 do .html para a rota canonica;
 *   2) rewrite da rota canonica para o arquivo .html correspondente.
 *
 * Um http-server puro serve apenas ARQUIVOS: a rota canonica devolvia 404 e os
 * testes E2E de navegacao (menus, logout, seletor de modulos) falhavam por um
 * motivo que nao existe em producao. Este servidor aplica exatamente as mesmas
 * regras de vercel.json, mantendo o ambiente local fiel.
 *
 * Uso: node scripts/e2e-static-server.js [--port 4000] [--root .]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.cwd(), readArg('--root') || '.');
const PORT = Number(readArg('--port') || process.env.PORT || 4000);

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REDIRECTS = new Map((vercel.redirects || []).map((item) => [item.source, item]));
const REWRITES = new Map(
  (vercel.rewrites || [])
    .filter((item) => !item.source.includes('(') && !item.source.includes(':'))
    .map((item) => [item.source, item.destination])
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function sendFile(res, filePath, status = 200) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(status, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const resolved = path.resolve(ROOT, '.' + decoded);
  return resolved.startsWith(ROOT) ? resolved : '';
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const queryIndex = rawUrl.indexOf('?');
  const urlPath = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : rawUrl.slice(queryIndex);

  // 1) redirects declarados (ex.: /eventos.html -> /eventos, permanente).
  // A query string e preservada, como o Vercel faz.
  const redirect = REDIRECTS.get(urlPath);
  if (redirect) {
    const destino = redirect.destination.includes('?')
      ? redirect.destination
      : redirect.destination + search;
    res.writeHead(redirect.permanent ? 308 : 307, { Location: destino });
    res.end();
    return;
  }

  // 2) rewrite da rota canonica para o arquivo servido. Alguns rewrites do
  // vercel.json apontam para funcoes serverless (ex.: /404.html -> api/og-product
  // e /product.html -> api/og-product): nesses casos servimos o caminho pedido
  // como arquivo estatico (404.html existe; product.html e renderizado pelo SSR
  // e nao faz parte do E2E estatico).
  const candidatos = [];
  const rewritten = REWRITES.get(urlPath);
  if (rewritten) candidatos.push(resolveSafe(rewritten));
  candidatos.push(resolveSafe(urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath));

  for (const candidato of candidatos) {
    if (candidato && fs.existsSync(candidato) && fs.statSync(candidato).isFile()) {
      sendFile(res, candidato);
      return;
    }
  }

  // 3) fallback: shell de 404 do projeto (mesma semantica do Vercel)
  const notFound = path.join(ROOT, '404.html');
  if (fs.existsSync(notFound)) {
    sendFile(res, notFound, 404);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('E2E static server (rewrites do vercel.json) em http://localhost:' + PORT);
  console.log('  redirects: ' + REDIRECTS.size + ' | rewrites: ' + REWRITES.size);
});
