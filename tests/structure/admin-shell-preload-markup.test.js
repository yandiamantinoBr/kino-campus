const fs = require('fs');
const path = require('path');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('admin shell preload hardening', () => {
  const adminPages = PAGE_MANIFEST.ADMIN_PAGES;

  test('admin pages share the same html preload classes and no longer inline boot cleanup', () => {
    adminPages.forEach((relativePath) => {
      const source = read(relativePath);
      const htmlTag = source.match(/<html\b[^>]*>/i);
      expect(htmlTag).not.toBeNull();
      expect(htmlTag[0]).toContain('lang="pt-BR"');
      expect(htmlTag[0]).toContain('class="kc-loading kc-theme-preload"');
      expect(source).not.toContain("document.documentElement.classList.remove('kc-loading')");
      expect(source).not.toContain('html.kc-theme-preload, html.kc-theme-preload *');
    });
  });

  test('admin shell owns preload release and preload css', () => {
    const shellSource = read('assets/js/api/admin-shell.js');
    const cssSource = read('assets/css/admin-shell.css');

    expect(shellSource).toContain('function releaseBootState()');
    expect(shellSource).toContain("document.documentElement.classList.remove('kc-loading');");
    expect(shellSource).toContain("document.documentElement.classList.remove('kc-theme-preload');");
    expect(cssSource).toContain('html.kc-theme-preload body.kc-admin-page,');
    expect(cssSource).toContain('html.kc-theme-preload body.kc-admin-page * {');
  });
});
