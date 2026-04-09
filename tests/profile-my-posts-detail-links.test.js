const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('profile/my-posts detail link hardening', () => {
  test('profile controller uses the shared canonical post detail helper', () => {
    const source = read('assets/js/controllers/profile.controller.js');

    expect(source).toContain('window.KCUtils.buildProductDetailHref');
    expect(source).not.toContain("link.href = 'product.html?id='");
    expect(source).not.toContain("const postUrl = postId ? 'product.html?id='");
    expect(source).not.toContain("const postUrl = 'product.html?id='");
    expect(source).toContain('buildPostDetailHref(post.uuid || post.id || \'\')');
    expect(source).toContain('buildPostDetailHref(item.uuid || item.id || \'\')');
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
