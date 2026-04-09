const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('settings contact preview link hardening', () => {
  test('settings controller uses the shared canonical detail helper for contact preview', () => {
    const source = read('assets/js/controllers/settings.controller.js');

    expect(source).toContain('window.KCUtils.buildProductDetailHref');
    expect(source).toContain('function buildPreviewPostUrl()');
    expect(source).toContain('postUrl: buildPreviewPostUrl()');
    expect(source).not.toContain('/product.html?id=demo');
  });
});
