const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('profile/my-posts detail link hardening', () => {
  test('todos os geradores de links compartilháveis evitam o shell noindex', () => {
    const files = [
      'assets/js/core/kc-notifications.js',
      'assets/js/controllers/public/account-setup.controller.js',
      'assets/js/controllers/public/my-posts.controller.js',
      'assets/js/controllers/public/profile.collections.js',
      'assets/js/controllers/public/profile.controller.js',
      'assets/js/controllers/public/profile.presentation.js',
      'assets/js/controllers/public/settings.controller.js',
    ];

    files.forEach((file) => {
      const source = read(file);
      expect(source).toContain('product.html?id=');
      expect(source).not.toContain('_product.html?id=');
    });

    const helper = read('assets/js/utils/kc-utils.format.js');
    expect(helper).toContain("driver === 'local'");
    expect(helper).toContain("? '_product.html' : 'product.html'");
  });

  test('profile controller preserva o helper canônico e o injeta no split de collections', () => {
    const source = read('assets/js/controllers/public/profile.controller.js');

    expect(source).toContain('window.KCUtils.buildProductDetailHref');
    expect(source).toContain('buildPostDetailHref,');
    expect(source).toContain('return `product.html?id=${encodeURIComponent(normalized)}`;');
    expect(source).not.toContain('_product.html?id=');
  });

  test('profile collections module usa o helper canônico de detalhe de post', () => {
    const source = read('assets/js/controllers/public/profile.collections.js');

    expect(source).toContain("_buildPostDetailHref(post && (post.uuid || post.id || ''), deps)");
    expect(source).toContain("_buildPostDetailHref(item && (item.uuid || item.id || ''), deps)");
    expect(source).toContain("var postUrl = _buildPostDetailHref(postId, deps)");
    expect(source).toContain("'product.html?id=' + encodeURIComponent(normalized)");
    expect(source).not.toContain('_product.html?id=');
  });

  test('my-posts controller uses the shared canonical post detail helper', () => {
    const source = read('assets/js/controllers/public/my-posts.controller.js');

    expect(source).toContain('window.KCUtils.buildProductDetailHref');
    expect(source).toContain("return 'product.html?id=' + encodeURIComponent(normalized);");
    expect(source).not.toContain('_product.html?id=');
    expect(source).toContain('window.location.href = buildPostDetailHref(uuid);');
    expect(source).toContain('esc(buildPostDetailHref(uuid))');
  });
});
