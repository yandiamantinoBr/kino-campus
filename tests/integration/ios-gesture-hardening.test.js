const fs = require('fs');
const path = require('path');

describe('iOS gesture hardening', () => {
  test('styles preserve pinch zoom on auth/modal surfaces and horizontal rails', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/css/styles.css'), 'utf8');

    expect(css).toContain('.kc-auth-modal');
    expect(css).toContain('touch-action: pinch-zoom;');
    expect(css).toContain('.kc-auth-body');
    expect(css).toContain('touch-action: pan-y pinch-zoom;');
    expect(css).toContain('.kc-create-modal__body');
    expect(css).toContain('.kc-hero-carousel');
    expect(css).toContain('touch-action: pan-y pinch-zoom;');
    expect(css).toContain('.kc-opportunity-mobile-rail,');
    expect(css).toContain('touch-action: pan-x pan-y pinch-zoom;');
  });

  test('pull-to-refresh ignores horizontal gesture surfaces', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/js/features/kc-pull-to-refresh.js'), 'utf8');

    expect(js).toContain('function isHorizontalGestureSurface');
    expect(js).toContain(".kc-hero-carousel");
    expect(js).toContain(".kc-ranking-users");
    expect(js).toContain(".kc-feed-tabs");
    expect(js).toContain('HORIZONTAL_DRAG_THRESHOLD');
    expect(js).toContain('if (isHorizontalGestureSurface(e.target))');
  });

  test('touch pointers keep native hero and drag scrolling behavior', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/js/core/kc-core.js'), 'utf8');

    expect(js).toMatch(/const start = \(e\) => \{\s+if \(e\.pointerType === 'touch'\) return;/);
    expect(js).toMatch(/carousel\.addEventListener\("pointerdown", \(e\) => \{\s+if \(e\.pointerType === 'touch'\)/);
    expect(js).toContain("carousel.addEventListener('touchcancel'");
  });

  test('kc-public-shell usa min-height: 100dvh no body raiz (C6 — iOS Safari dynamic viewport)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/css/kc-public-shell.css'), 'utf8');
    expect(css).toContain('min-height: 100dvh');
  });

  test('admin-shell usa max-height: calc(100dvh ...) no .kc-modal (B5 — iOS Safari dynamic viewport)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/css/admin-shell.css'), 'utf8');
    expect(css).toContain('max-height: calc(100dvh - var(--kc-admin-modal-viewport-gap)');
  });

  test('admin-shell usa max-height: calc(100dvh ...) no .kc-admin-chart-modal (B5 — iOS Safari dynamic viewport)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/css/admin-shell.css'), 'utf8');
    expect(css).toContain('max-height: calc(100dvh - var(--kc-admin-chart-modal-viewport-gap)');
  });
});
