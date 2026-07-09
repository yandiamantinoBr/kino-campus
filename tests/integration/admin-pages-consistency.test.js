'use strict';

/**
 * Revisão profunda /admin/ (rodada 3) — Fase 2 (carregamento + a11y).
 * Cobre a consistência transversal das páginas admin canônicas:
 *  - skeleton CSS compartilhado em admin-shell.css (não mais inline no dashboard);
 *  - estados de carregamento (skeletons) injetados em cada página;
 *  - aria-current="page" no link de navegação ativo (acessibilidade).
 */

const fs = require('fs');
const path = require('path');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ADMIN_PAGES = PAGE_MANIFEST.ADMIN_PAGES;

const SKELETON_CONTROLLERS = [
  'assets/js/controllers/admin/admin-reports.controller.js',
  'assets/js/controllers/admin/admin-moderation.controller.js',
  'assets/js/controllers/admin/admin-banners.controller.js',
  'assets/js/controllers/admin/admin-help-requests.controller.js',
  'assets/js/controllers/admin/admin-privacy-analytics.controller.js'
];

describe('Rodada 3 Fase 2 — skeleton compartilhado', () => {
  test('admin-shell.css define o skeleton compartilhado por todas as páginas admin', () => {
    const css = r('assets/css/admin-shell.css');
    expect(css).toContain('body.kc-admin-page .kc-skeleton');
    expect(css).toContain('@keyframes kc-skeleton-shimmer');
    expect(css).toContain('body.kc-admin-page .kc-admin-card.kc-skeleton-card');
  });

  test('o dashboard não mantém mais o CSS de skeleton inline (evita duplicação)', () => {
    const html = r('admin/index.html');
    expect(html).not.toContain('@keyframes kc-skeleton-shimmer');
  });

  test('cada controller das 5 páginas injeta skeleton de carregamento', () => {
    SKELETON_CONTROLLERS.forEach((p) => {
      const src = r(p);
      expect(src).toContain('function showLoadingSkeletons(');
      expect(src).toContain('showLoadingSkeletons();');
      expect(src).toContain('kc-skeleton');
      // só preenche containers ainda vazios (não sobrescreve conteúdo real)
      expect(src).toMatch(/!\s*\w+\.children\.length/);
    });
  });
});

describe('Rodada 3 Fase 2 — navegação acessível', () => {
  test('as páginas admin marcam o link ativo com aria-current="page"', () => {
    ADMIN_PAGES.forEach((p) => {
      const html = r(p);
      expect(html).toContain('class="kc-admin-nav__link active" aria-current="page"');
    });
  });

  test('cada página tem exatamente um link de navegação ativo', () => {
    ADMIN_PAGES.forEach((p) => {
      const html = r(p);
      const matches = html.match(/kc-admin-nav__link active/g) || [];
      expect(matches).toHaveLength(1);
    });
  });
});
