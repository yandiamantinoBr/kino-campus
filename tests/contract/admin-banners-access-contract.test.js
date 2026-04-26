const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('admin banners access contract', () => {
  test('admin banners validates auth via KCAPI and profiles.is_admin without legacy cached profile fallbacks', () => {
    const source = read('assets/js/controllers/admin-banners.controller.js');

    expect(source).toContain('async function checkAdminAccess()');
    expect(source).toContain('window.KCAPI.getCurrentUser');
    expect(source).toContain(".from('profiles')");
    expect(source).toContain(".select('is_admin, display_name, full_name')");
    expect(source).not.toContain('window.__kcCurrentProfile');
    expect(source).not.toContain('if (!banners.length) loadBanners();');
    expect(source).not.toContain('const tryLoad = () => {');
  });
});
