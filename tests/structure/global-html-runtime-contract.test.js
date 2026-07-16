'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.vercel',
  'coverage',
  'dist',
  'node_modules',
  'output',
  'playwright-report',
]);

function listHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) return [];

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(absolutePath);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.html')
      ? [absolutePath]
      : [];
  });
}

function relativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).replace(/\\/g, '/');
}

const HTML_FILES = listHtmlFiles(ROOT);

describe('contratos globais dos HTMLs', () => {
  test('Vercel Web Analytics não usa o endpoint CDN legado', () => {
    const offenders = HTML_FILES.filter((file) => (
      /https:\/\/cdn\.vercel-insights\.com\//i.test(
        fs.readFileSync(file, 'utf8')
      )
    )).map(relativePath);

    expect(offenders).toEqual([]);
  });

  test('todo ícone literal de carregamento é oculto de tecnologias assistivas', () => {
    const offenders = [];

    HTML_FILES.forEach((file) => {
      const html = fs.readFileSync(file, 'utf8');
      const iconTags = html.match(/<i\b[^>]*>/gi) || [];

      iconTags.forEach((tag) => {
        if (!/\bfa-(?:spinner|spin)\b/i.test(tag)) return;
        if (/\baria-hidden\s*=\s*(["'])true\1/i.test(tag)) return;
        offenders.push(`${relativePath(file)}: ${tag}`);
      });
    });

    expect(offenders).toEqual([]);
  });
});
