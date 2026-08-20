'use strict';

const fs = require('fs');
const path = require('path');

const ERROR_PAGE_PATH = path.join(process.cwd(), '404.html');

function loadErrorPage() {
  return fs.readFileSync(ERROR_PAGE_PATH, 'utf8');
}

function handler(_req, res) {
  const body = loadErrorPage();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Robots-Tag', 'noindex, follow, noarchive');
  if (typeof res.status === 'function') return res.status(404).send(body);
  res.statusCode = 404;
  return res.end(body);
}

module.exports = handler;
module.exports.default = handler;
