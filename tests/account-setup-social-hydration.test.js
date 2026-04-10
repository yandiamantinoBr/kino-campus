const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('account-setup social hydration hardening', () => {
  test('account-setup normalizes social state and hydrates visibility deterministically', () => {
    const source = read('assets/js/controllers/account-setup.controller.js');

    expect(source).toContain('const SOCIAL_VISIBILITY_KEYS = Object.freeze(');
    expect(source).toContain('const SOCIAL_INPUT_KEYS = Object.freeze(SOCIAL_VISIBILITY_KEYS.filter((key) => key !== \'whatsapp\'))');
    expect(source).toContain('shared.normalizeSocialLinks');
    expect(source).toContain('shared.normalizeSocialVisibility');
    expect(source).toContain('hasSavedSocialVisibility');
    expect(source).toContain('const shouldDefaultWhatsappVisible = !hasSavedSocialVisibility(rawSocialVisibility)');
    expect(source).toContain('SOCIAL_VISIBILITY_KEYS.forEach((key) => {');
    expect(source).toContain('return SOCIAL_VISIBILITY_KEYS.reduce((acc, key) => {');
    expect(source).not.toContain('Object.keys(socialVisibility || {}).forEach');
  });
});
