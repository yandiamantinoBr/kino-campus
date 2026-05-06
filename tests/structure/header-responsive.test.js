'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const styles = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
const themeBoot = fs.readFileSync(path.join(ROOT, 'assets/js/boot/kc-theme-boot.js'), 'utf8');

describe('header responsive shell', () => {
  test('keeps desktop header in a single row with responsive search sizing', () => {
    expect(styles).toContain('Header responsivo estavel');
    expect(styles).toContain('flex-wrap: nowrap;');
    expect(styles).toContain('flex: 1 1 clamp(240px, 24vw, 420px);');
    expect(styles).toContain('transition: border-color var(--transition-speed) ease, box-shadow var(--transition-speed) ease, background-color var(--transition-speed) ease;');
    expect(styles).toContain('.kc-header:not(.kc-header--admin) .kc-search-bar:focus-within');
    expect(styles).toContain('transform: none;');
  });

  test('uses compact accessible navigation instead of wrapping on medium widths', () => {
    expect(styles).toContain('@media (min-width: 769px) and (max-width: 1499px)');
    expect(styles).toContain('.kc-header:not(.kc-header--admin) .kc-nav-links a span');
    expect(styles).toContain('clip: rect(0, 0, 0, 0);');
    expect(styles).toContain('width: 36px;');
    expect(styles).toContain('height: 36px;');
  });

  test('marks cached auth shell early to avoid header layout jump', () => {
    expect(themeBoot).toContain("const SHELL_SNAPSHOT_KEY = 'kc:9.0.0:shell:auth-shell';");
    expect(themeBoot).toContain("root.classList.add('kc-auth-shell-cached');");
    expect(styles).toContain('html.kc-auth-shell-cached .kc-header:not(.kc-header--admin) .kc-user-actions a.btn-login:not(.is-auth)');
  });
});
