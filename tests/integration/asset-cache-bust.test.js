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
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const INJECT = path.join(ROOT, 'scripts', 'inject-env.js');
const CACHE_REVISION = path.join(ROOT, 'scripts', 'static-cache-revision.js');
const FEED = path.join(ROOT, 'assets', 'js', 'controllers', 'public', 'kc-feed.controller.js');
const read = (p) => fs.readFileSync(p, 'utf8');
const { buildStaticOutput } = require('../../scripts/build-static-output');
const {
  resolveBuildRevision,
  applyStaticCacheRevision,
  verifyStaticCacheArtifact,
} = require('../../scripts/static-cache-revision');

describe('inject-env.js — cache-bust automático de assets', () => {
  let s;
  beforeAll(() => { s = read(INJECT); });

  test('define applyAssetCacheBust', () => {
    expect(s).toContain('function applyAssetCacheBust');
  });

  test('execução local sem revisão não altera o artefato por acidente', () => {
    const idx = s.indexOf('function applyAssetCacheBust');
    expect(idx).toBeGreaterThan(-1);
    expect(s.slice(idx, idx + 800)).toContain('if (!revision)');
    expect(s.slice(idx, idx + 800)).toContain('if (productionBuild)');
    expect(s.slice(idx, idx + 800)).toContain('return null');
  });

  test('usa um token do deploy (VERCEL_GIT_COMMIT_SHA)', () => {
    expect(read(CACHE_REVISION)).toContain('VERCEL_GIT_COMMIT_SHA');
  });

  test('usa a mesma revisão para HTML, precache e namespace do Service Worker', () => {
    expect(s).toContain('applyStaticCacheRevision');
    expect(s).toContain('result.htmlAssets');
    expect(s).toContain('result.shellAssets');
  });

  test('produção exige revisão e não tolera fallback silencioso', () => {
    expect(s).toContain('applyAssetCacheBust()');
    expect(s).toContain('KC_BUILD_REVISION_REQUIRED');
    expect(s).not.toContain('cache-bust de assets falhou (ignorado)');
    expect(s).not.toContain('Date.now()');
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

describe('dist — revisão única do HTML e Service Worker', () => {
  let fixtureRoot;
  let outputRoot;
  const revision = 'abc123def456';

  function write(relativePath, content = '') {
    const target = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-static-cache-'));
    write(
      'index.html',
      '<link href="assets/css/styles.css?v=old-css"><script src="assets/js/app.js?v=old-js"></script>',
    );
    write(
      '_product.html',
      '<script src="assets/js/product.js?v=old-product"></script>',
    );
    write(
      'admin/index.html',
      '<script src="../assets/js/admin.js?v=old-admin"></script>',
    );
    write('assets/css/styles.css', 'body{}');
    write('assets/js/app.js', '');
    write('assets/js/product.js', '');
    write('assets/js/admin.js', '');
    write('assets/js/boot/kc-env.js', '');
    write('data/database.json', '{}');
    write('ads.txt', '');
    write('llms.txt', '');
    write('robots.txt', '');
    write('sw.js', read(path.join(ROOT, 'sw.js')));
    outputRoot = path.join(fixtureRoot, 'dist');
    buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
  });

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('valida o artefato dist gerado, não apenas o código-fonte', () => {
    const result = applyStaticCacheRevision({ outputRoot, revision });
    const verified = verifyStaticCacheArtifact({ outputRoot, revision });
    const indexArtifact = read(path.join(outputRoot, 'index.html'));
    const adminArtifact = read(path.join(outputRoot, 'admin', 'index.html'));
    const swArtifact = read(path.join(outputRoot, 'sw.js'));

    expect(result.changedHtml).toBeGreaterThanOrEqual(3);
    expect(verified.revision).toBe(revision);
    expect(indexArtifact).toContain(`styles.css?v=${revision}`);
    expect(indexArtifact).toContain(`app.js?v=${revision}`);
    expect(adminArtifact).toContain(`admin.js?v=${revision}`);
    expect(swArtifact).toContain(`var CACHE_VERSION = 'kc-shell-${revision}';`);
    expect(swArtifact).toContain(`/assets/css/styles.css?v=${revision}`);
    expect(swArtifact).not.toContain('/assets/css/styles.css?v=8.6.12');
  });

  test('falha se um HTML do dist divergir do Service Worker', () => {
    applyStaticCacheRevision({ outputRoot, revision });
    const indexPath = path.join(outputRoot, 'index.html');
    fs.writeFileSync(
      indexPath,
      read(indexPath).replace(`app.js?v=${revision}`, 'app.js?v=stale-build'),
      'utf8',
    );
    expect(() => verifyStaticCacheArtifact({ outputRoot, revision }))
      .toThrow(/DIST_ASSET_REVISION_MISMATCH:index\.html/);
  });

  test('falha se o precache do dist divergir do namespace da revisão', () => {
    applyStaticCacheRevision({ outputRoot, revision });
    const swPath = path.join(outputRoot, 'sw.js');
    fs.writeFileSync(
      swPath,
      read(swPath).replace(
        `/assets/css/styles.css?v=${revision}`,
        '/assets/css/styles.css?v=stale-precache',
      ),
      'utf8',
    );
    expect(() => verifyStaticCacheArtifact({ outputRoot, revision }))
      .toThrow(/DIST_ASSET_REVISION_MISMATCH:sw/);
  });

  test('resolve a revisão explícita antes das revisões dos provedores', () => {
    expect(resolveBuildRevision({
      KC_BUILD_REVISION: 'release-42',
      VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
    })).toBe('release-42');
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
    const src = read(CACHE_REVISION);
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
