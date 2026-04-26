const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('account-setup contact preview hardening', () => {
  test('account-setup preview reuses the shared contact action and reacts to the public-contact toggle', () => {
    const source = read('assets/js/controllers/account-setup.controller.js');

    expect(source).toContain('shared.buildContactAction');
    expect(source).toContain("contact_cta_enabled: $('#accountSetupCtaEnabled')?.checked !== false");
    expect(source).toContain('postUrl: buildPreviewPostUrl()');
    expect(source).toContain('viewProfileHref: buildProfileHref()');
    expect(source).toContain("ctaEnabled.addEventListener('change', updateContactPreview)");
  });
});
