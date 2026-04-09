const fs = require('fs');
const path = require('path');

describe('iOS gesture hardening', () => {
  test('styles preserve pinch zoom on auth/modal surfaces and horizontal rails', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'assets/css/styles.css'), 'utf8');

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
    const js = fs.readFileSync(path.resolve(__dirname, '..', 'assets/js/kc-pull-to-refresh.js'), 'utf8');

    expect(js).toContain('function isHorizontalGestureSurface');
    expect(js).toContain(".kc-hero-carousel");
    expect(js).toContain(".kc-ranking-users");
    expect(js).toContain(".kc-feed-tabs");
    expect(js).toContain('HORIZONTAL_DRAG_THRESHOLD');
    expect(js).toContain('if (isHorizontalGestureSurface(e.target))');
  });

  test('touch pointers keep native hero and drag scrolling behavior', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '..', 'assets/js/kc-core.js'), 'utf8');

    expect(js).toMatch(/const start = \(e\) => \{\s+if \(e\.pointerType === 'touch'\) return;/);
    expect(js).toMatch(/carousel\.addEventListener\("pointerdown", \(e\) => \{\s+if \(e\.pointerType === 'touch'\)/);
    expect(js).toContain("carousel.addEventListener('touchcancel'");
  });
});
