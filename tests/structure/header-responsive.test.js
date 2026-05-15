'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const styles = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
const themeBoot = fs.readFileSync(path.join(ROOT, 'assets/js/boot/kc-theme-boot.js'), 'utf8');

function activeHtmlFiles() {
  return [ROOT, path.join(ROOT, 'admin')].flatMap((dir) => (
    fs.readdirSync(dir)
      .filter((name) => name.endsWith('.html'))
      .map((name) => path.join(dir, name))
  ));
}

describe('header responsive shell', () => {
  test('keeps desktop search sizing stable without focus jumps', () => {
    expect(styles).toContain('Header responsivo estavel');
    expect(styles).toContain('flex-wrap: nowrap;');
    expect(styles).toContain('justify-content: center;');
    expect(styles).toContain('flex: 0 1 clamp(300px, 21vw, 390px);');
    expect(styles).toContain('max-width: 390px;');
    expect(styles).toContain('transition: border-color var(--transition-speed) ease, box-shadow var(--transition-speed) ease, background-color var(--transition-speed) ease;');
    expect(styles).toContain('.kc-header:not(.kc-header--admin) .kc-search-bar:focus-within');
    expect(styles).toContain('transform: none;');
  });

  test('keeps navigation labels beside the logo on medium widths', () => {
    expect(styles).toContain('@media (min-width: 769px) and (max-width: 1499px)');
    expect(styles).toContain('max-width: min(45vw, 720px);');
    expect(styles).toContain('justify-content: flex-start;');
    expect(styles).toContain('.kc-header:not(.kc-header--admin) .kc-nav-links a span');
    expect(styles).toContain('position: static;');
    expect(styles).toContain('overflow: visible;');
    expect(styles).toContain('clip: auto;');
    expect(styles).toContain('margin-left: 0;');
  });

  test('marks cached auth shell early to avoid header layout jump', () => {
    expect(themeBoot).toContain("const SHELL_SNAPSHOT_KEY = 'kc:9.0.0:shell:auth-shell';");
    expect(themeBoot).toContain("root.classList.add('kc-auth-shell-cached');");
    expect(styles).toContain('html.kc-auth-shell-cached .kc-header:not(.kc-header--admin) .kc-user-actions a.btn-login:not(.is-auth)');
  });

  test('keeps notification badge layered above the bell icon on every active page', () => {
    expect(styles).toContain('.kc-notif-bell {');
    expect(styles).toContain('isolation: isolate;');
    expect(styles).toContain('overflow: visible;');
    expect(styles).toContain('.kc-notif-bell > i {');
    expect(styles).toContain('z-index: 1;');
    expect(styles).toContain('.kc-notif-badge {');
    expect(styles).toContain('z-index: 2;');
    expect(styles).toContain('display: inline-flex;');

    const pagesWithBell = activeHtmlFiles().filter((file) => (
      fs.readFileSync(file, 'utf8').includes('kc-notif-bell')
    ));

    expect(pagesWithBell.length).toBeGreaterThan(0);
    pagesWithBell.forEach((file) => {
      const html = fs.readFileSync(file, 'utf8');
      expect(html).toContain('kc-notif-badge');
      expect(html).toMatch(/<link[^>]+href=["'][^"']*assets\/css\/styles\.css/);
    });
  });
});
