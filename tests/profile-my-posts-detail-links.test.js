const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('profile/my-posts detail link hardening', () => {
  test('profile controller preserva o helper canônico e o injeta no split de collections', () => {
    const source = read('assets/js/controllers/profile.controller.js');

    expect(source).toContain('window.KCUtils.buildProductDetailHref');
    expect(source).toContain('buildPostDetailHref,');
    expect(source).not.toContain("link.href = 'product.html?id='");
    expect(source).not.toContain("const postUrl = postId ? 'product.html?id='");
    expect(source).not.toContain("const postUrl = 'product.html?id='");
  });

  test('profile collections module usa o helper canônico de detalhe de post', () => {
    const source = read('assets/js/controllers/profile.collections.js');

    expect(source).toContain("_buildPostDetailHref(post && (post.uuid || post.id || ''), deps)");
    expect(source).toContain("_buildPostDetailHref(item && (item.uuid || item.id || ''), deps)");
    expect(source).toContain("var postUrl = _buildPostDetailHref(postId, deps)");
    expect(source).not.toContain("link.href = 'product.html?id='");
    expect(source).not.toContain("var postUrl = postId ? 'product.html?id='");
    expect(source).not.toContain("var postUrl = 'product.html?id='");
  });

  test('my-posts controller uses the shared canonical post detail helper', () => {
    const source = read('assets/js/controllers/my-posts.controller.js');

    expect(source).toContain('window.KCUtils.buildProductDetailHref');
    expect(source).not.toContain("window.location.href = 'product.html?id='");
    expect(source).not.toContain("var viewBtn = '<a href=\"product.html?id='");
    expect(source).not.toContain("'<a href=\"product.html?id='");
    expect(source).toContain('window.location.href = buildPostDetailHref(uuid);');
    expect(source).toContain('esc(buildPostDetailHref(uuid))');
  });
});
