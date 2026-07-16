'use strict';

/**
 * Revisão profunda do Dashboard Admin — Fase B (UX/navegação).
 * Cobre:
 *  - Skeletons de carregamento (CSS shimmer + helpers no controller).
 *  - Toolbar enxuta (sem os 4 atalhos duplicados do menu do topo).
 *  - Privacidade/Saúde vinculadas ao período via _KCAD.privacy.refresh
 *    (alimentado pelo controller com overview.privacy + período + health real).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('Fase B — skeletons de carregamento', () => {
  let css;
  let ctrl;
  beforeAll(() => {
    css = r('assets/css/admin-shell.css');
    ctrl = r('assets/js/controllers/admin/admin-dashboard.controller.js');
  });

  test('admin-shell.css traz o CSS de shimmer compartilhado (.kc-skeleton + keyframes + card)', () => {
    expect(css).toContain('.kc-skeleton');
    expect(css).toContain('@keyframes kc-skeleton-shimmer');
    expect(css).toContain('.kc-admin-card.kc-skeleton-card');
  });

  test('respeita prefers-reduced-motion (sem animação)', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*kc-skeleton::after[\s\S]*animation:\s*none/);
  });

  test('controller define helpers de skeleton e os usa no início do load', () => {
    expect(ctrl).toContain('function skeletonCards(');
    expect(ctrl).toContain('function showDashboardSkeletons(');
    expect(ctrl).toContain('showDashboardSkeletons();');
    // Só injeta placeholder em grids ainda vazios (não sobrescreve dados).
    expect(ctrl).toContain('el.children.length === 0');
  });

  test('gate de acesso termina antes dos skeletons e não há cards-spinner estáticos concorrentes', () => {
    const html = r('admin/index.html');
    expect(ctrl).toMatch(/setLoading\(false\);[\s\S]*showDashboardSkeletons\(\);[\s\S]*setGridsLoading\(true\);/);
    expect(html).not.toContain('Carregando privacidade');
    expect(html).not.toContain('Carregando monetização');
  });
});

describe('Fase B — toolbar enxuta (sem atalhos duplicados)', () => {
  let toolbar;
  beforeAll(() => {
    const html = r('admin/index.html');
    const m = html.match(/<div class="kc-admin-toolbar">([\s\S]*?)<\/div>/);
    toolbar = m ? m[1] : '';
  });

  test('mantém apenas período + atualizar + exportações', () => {
    expect(toolbar).toContain('id="admin-period-filter"');
    expect(toolbar).toContain('id="admin-refresh-btn"');
    expect(toolbar).toContain('id="admin-export-xlsx"');
    expect(toolbar).toContain('id="admin-export-pdf"');
  });

  test('não repete os atalhos de página já presentes no menu do topo', () => {
    expect(toolbar).not.toMatch(/<a\s/i);
    ['moderation.html', 'reports.html', 'banners.html', 'privacy-analytics.html'].forEach((href) => {
      expect(toolbar).not.toContain(href);
    });
  });
});

describe('Fase B — Privacidade/Saúde vinculadas ao período', () => {
  let priv;
  let ctrl;
  beforeAll(() => {
    priv = r('assets/js/controllers/admin/admin-dashboard.privacy.js');
    ctrl = r('assets/js/controllers/admin/admin-dashboard.controller.js');
  });

  test('privacy.js expõe a API _KCAD.privacy (refresh + render por overview)', () => {
    expect(priv).toContain('window._KCAD.privacy = {');
    expect(priv).toContain('function refresh(');
    expect(priv).toContain('function renderFromOverview(');
  });

  test('o fallback por timer só roda se o controller não tiver assumido', () => {
    expect(priv).toContain('__privacyDriven');
    expect(priv).toContain('function autoFallback(');
    expect(priv).toMatch(/if \(window\._KCAD && window\._KCAD\.__privacyDriven\) return;/);
  });

  test('refresh renderiza por período quando há overview e cai no standalone sem ele', () => {
    expect(priv).toMatch(/if \(opts\.overview\)[\s\S]*renderFromOverview\(opts\.overview, opts\.periodLabel, opts\.periodDays\)/);
    expect(priv).toMatch(/loadPrivacySummary\(\{[\s\S]*periodDays: opts\.periodDays,[\s\S]*since: opts\.since/);
    expect(priv).toContain('isCurrentGeneration(generation)');
  });

  test('o controller alimenta privacy.refresh com overview + período + health real', () => {
    expect(ctrl).toContain('window._KCAD.privacy.refresh(');
    expect(ctrl).toMatch(/overview: overview \? overview\.privacy : null/);
    expect(ctrl).toContain('periodLabel: fullLabel');
    expect(ctrl).toContain('periodDays: periodDays');
    expect(ctrl).toContain('since: since');
    expect(ctrl).toContain('health: healthItems');
    // healthItems reflete sinais reais (RPC agregada, pulso diário, tendências).
    expect(ctrl).toMatch(/var healthItems = \[/);
  });
});

describe('Fase B - responsividade do dashboard admin', () => {
  const css = r('assets/css/admin-shell.css');

  test('inclui a largura exata de 768px no layout compacto', () => {
    expect(css).toContain('@media (max-width: 768.98px)');
  });

  test('audit log vira cartoes sem overflow horizontal no layout compacto', () => {
    expect(css).toMatch(
      /@media \(max-width: 768\.98px\)[\s\S]*\.kc-admin-audit-wrap\s*\{[\s\S]*overflow:\s*visible[\s\S]*\.kc-admin-audit-wrap table,[\s\S]*display:\s*block/
    );
  });

  test('navegacao inferior admin permite acessar todas as rotas por rolagem horizontal', () => {
    expect(css).toMatch(
      /body\.kc-admin-page \.kc-mobile-nav\s*\{[\s\S]*overflow-x:\s*auto[\s\S]*\}/
    );
    expect(css).toMatch(
      /body\.kc-admin-page \.kc-mobile-nav > a\s*\{[\s\S]*flex:\s*0 0 58px[\s\S]*min-width:\s*58px/
    );
  });
});
