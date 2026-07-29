'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const AUTH_UI = read('assets/js/core/kc-auth.ui.js');
const TERMS = read('termos.html');
const PRIVACY = read('privacidade.html');

function visibleVersion(source) {
  const match = source.match(/kc-legal-updated[^>]*>[\s\S]{0,80}?Versão\s+(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

describe('legal acceptance document versions', () => {
  test('new acceptance metadata records each document version independently', () => {
    const termsVersion = visibleVersion(TERMS);
    const privacyVersion = visibleVersion(PRIVACY);

    expect(termsVersion).toBe('2026-06-04');
    expect(privacyVersion).toBe('2026-07-29');
    expect(AUTH_UI).toContain(`const TERMS_VERSION = '${termsVersion}'`);
    expect(AUTH_UI).toContain(`const PRIVACY_VERSION = '${privacyVersion}'`);
    expect(AUTH_UI).toContain('terms_version: TERMS_VERSION');
    expect(AUTH_UI).toContain('privacy_version: PRIVACY_VERSION');
  });

  test('does not relabel legacy unversioned consent as acceptance of current texts', () => {
    expect(AUTH_UI).toContain("const LEGACY_UNVERSIONED = 'legacy-unversioned'");
    expect(AUTH_UI).toContain(
      'terms_version: String(meta.terms_version || LEGACY_UNVERSIONED)',
    );
    expect(AUTH_UI).toContain(
      'privacy_version: String(meta.privacy_version || LEGACY_UNVERSIONED)',
    );
    expect(AUTH_UI).not.toContain('const LEGAL_VERSION');
  });
});
