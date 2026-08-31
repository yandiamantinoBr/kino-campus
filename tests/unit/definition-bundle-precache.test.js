/** @jest-environment node */
const { extendDefinitionShellPrecache } = require('../../scripts/bundle-static-definition-scripts');
const group = { sources: ['assets/js/utils/a.js'], url: 'assets/js/bundles/kc-home-utils.1234567890abcdefabcd.js?v=old' };

test('preserves old precache URLs, install/fetch code and source newline convention', () => {
  const before = "'use strict';\r\nvar SHELL_ASSETS = ['/assets/js/utils/a.js?v=a', '/assets/css/styles.css?v=b'];\r\nself.addEventListener('fetch', handler);";
  const after = extendDefinitionShellPrecache(before, [group]);
  expect(after).toContain('"/assets/js/utils/a.js?v=a"');
  expect(after).toContain('"/assets/css/styles.css?v=b"');
  expect(after).toContain('"/' + group.url + '"');
  expect(after).toMatch(/^'use strict';\r\n/);
  expect(after).toMatch(/;\r\nself\.addEventListener\('fetch', handler\);$/);
  expect(extendDefinitionShellPrecache(after, [group])).toBe(after);
});

test('does not turn non-precached definitions into an unrelated offline download', () => {
  const source = "var SHELL_ASSETS = ['/assets/css/styles.css?v=a'];";
  expect(extendDefinitionShellPrecache(source, [group])).toBe(source);
});

test.each([
  'var NO_SHELL = [];', 'var SHELL_ASSETS = compute();',
  'var SHELL_ASSETS = [window.url];', 'var SHELL_ASSETS = [,];',
  'var SHELL_ASSETS = []; var SHELL_ASSETS = [];',
])('fails closed for unsupported precache syntax: %s', source => {
  expect(() => extendDefinitionShellPrecache(source, [group])).toThrow('STATIC_DEFINITION_BUNDLE_SW_SHELL_ARRAY');
});

test('never embeds an unreviewed URL in the generated worker', () => {
  const source = "var SHELL_ASSETS = ['/assets/js/utils/a.js?v=a'];";
  expect(() => extendDefinitionShellPrecache(source, [{ ...group, url: 'https://example.invalid/script.js' }]))
    .toThrow('STATIC_DEFINITION_BUNDLE_SW_BUNDLE_URL');
});
