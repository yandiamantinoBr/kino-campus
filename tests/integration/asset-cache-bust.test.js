/*
  asset-cache-bust.test.js — Cache-busting automático de assets no build (v76.4)

  Os assets (/assets/*) têm cache imutável de 1 ano com ?v fixo. Sem busting,
  navegadores que já visitaram continuam rodando JS/CSS antigos por muito tempo
  ("atualização demora a aparecer / outro navegador funciona"). O build passa a
  reescrever o ?v para um token do deploy — trocar a query muda só a CHAVE de
  cache, não o arquivo servido, então é seguro.
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const INJECT = path.join(ROOT, 'scripts', 'inject-env.js');
const FEED = path.join(ROOT, 'assets', 'js', 'controllers', 'public', 'kc-feed.controller.js');
const read = (p) => fs.readFileSync(p, 'utf8');

describe('inject-env.js — cache-bust automático de assets', () => {
  let s;
  beforeAll(() => { s = read(INJECT); });

  test('define applyAssetCacheBust', () => {
    expect(s).toContain('function applyAssetCacheBust');
  });

  test('só executa em CI/deploy (não toca a fonte em execução local)', () => {
    const idx = s.indexOf('function applyAssetCacheBust');
    expect(idx).toBeGreaterThan(-1);
    expect(s.slice(idx, idx + 400)).toContain('if (!isCI)');
  });

  test('usa um token do deploy (VERCEL_GIT_COMMIT_SHA)', () => {
    expect(s).toContain('VERCEL_GIT_COMMIT_SHA');
  });

  test('reescreve APENAS o valor da query ?v=', () => {
    expect(s).toContain('(\\?v=)[0-9A-Za-z._-]+');
  });

  test('cache-bust nunca derruba o build (envolto em try/catch)', () => {
    expect(s).toContain('applyAssetCacheBust()');
    expect(s).toContain('cache-bust de assets falhou');
  });
});

describe('cache-bust — a troca de ?v não altera o caminho do arquivo', () => {
  // Espelha o regex usado em inject-env.js (segurança: só a query muda).
  const bust = (html, token) => html.replace(/(\?v=)[0-9A-Za-z._-]+/g, `$1${token}`);

  test('troca o ?v de um script de asset, mantendo o caminho', () => {
    const html = '<script defer src="assets/js/controllers/public/kc-feed.controller.js?v=8.6.1"></script>';
    const out = bust(html, 'abc123def456');
    expect(out).toContain('kc-feed.controller.js?v=abc123def456');
    expect(out).toContain('assets/js/controllers/public/kc-feed.controller.js');
    expect(out).not.toContain('?v=8.6.1');
  });

  test('não altera referências sem ?v', () => {
    const html = '<link href="assets/css/styles.css" rel="stylesheet" />';
    expect(bust(html, 'abc123def456')).toBe(html);
  });
});

describe('kc-feed.controller.js — revalidação vazia não esvazia o feed', () => {
  test('guarda contra revalidação em segundo plano que volta vazia', () => {
    const s = read(FEED);
    expect(s).toContain('!normalized.length && state.renderedPosts.length');
  });
});

describe('cache-bust cobre subpastas servidas (admin/)', () => {
  test('inject-env coleta HTML recursivamente — não apenas a raiz', () => {
    const src = read(INJECT);
    expect(src).toContain('collectHtmlFiles');
    // Garante que a coleta NÃO é mais limitada à raiz do repositório.
    expect(src).not.toMatch(/readdirSync\(repoRoot\)\s*\.filter/);
  });

  test('a varredura encontra TODAS as páginas admin/*.html', () => {
    // Replica a varredura de inject-env.js para travar a cobertura do admin/.
    const SKIP = new Set([
      'node_modules', '.git', '.github', '.vercel', '.claude', 'tests', 'test',
      'docs', 'services', 'supabase', 'scripts', 'output', 'coverage', '.export-samples',
    ]);
    function walk(dir, depth, acc) {
      if (depth > 4) return acc;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return acc; }
      entries.forEach((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (SKIP.has(e.name) || e.name.startsWith('.')) return;
          walk(full, depth + 1, acc);
        } else if (/\.html$/i.test(e.name)) {
          acc.push(full);
        }
      });
      return acc;
    }
    const files = walk(ROOT, 0, []).map((f) => f.replace(/\\/g, '/'));
    expect(files.some((f) => f.endsWith('/admin/index.html'))).toBe(true);
    expect(files.filter((f) => /\/admin\//.test(f)).length).toBeGreaterThanOrEqual(6);
  });
});
