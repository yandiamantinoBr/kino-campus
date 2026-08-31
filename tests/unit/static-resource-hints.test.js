/** @jest-environment node */
'use strict';
const parse5 = require('parse5');
const { supabasePreconnectOrigin, cspAllowsOrigin, addSupabasePreconnect } = require('../../scripts/static-resource-hints');
const ORIGIN = 'https://fixture-project.supabase.co';
const POLICY = "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co";
const HTML = '<!doctype html>\r\n<html><head>\r\n<meta charset="utf-8">\r\n<link rel="stylesheet" href="assets/css/styles.css?v=fixture">\r\n<script defer src="assets/js/core/kc-consent.js?v=fixture"></script>\r\n</head><body><main>Mesma plataforma</main></body></html>';

describe('one exact configured HTTPS Supabase origin', () => {
  test.each([ORIGIN, `${ORIGIN}/`, '  HTTPS://FIXTURE-PROJECT.SUPABASE.CO/  '])('normalizes supported origin %s', value => {
    expect(supabasePreconnectOrigin(value)).toBe(ORIGIN);
  });
  test.each([
    '', null, undefined, {}, 'http://fixture-project.supabase.co', 'wss://fixture-project.supabase.co',
    'https://supabase.co', 'https://fixture-project.supabase.co.evil.example', 'https://evil-supabase.co',
    'https://a.b.supabase.co', 'https://api.custom.example', 'https://user:password@fixture-project.supabase.co',
    `${ORIGIN}:443`, `${ORIGIN}:8443`, `${ORIGIN}/rest/v1`, `${ORIGIN}/%2e/`, `${ORIGIN}?`, `${ORIGIN}#`,
    `${ORIGIN}?apikey=fixture-not-a-key`, `${ORIGIN}/#fragment`, 'https://fixture-\nproject.supabase.co',
    'https://fixture-project.supabase.co./', '//fixture-project.supabase.co',
  ])('skips unsupported configuration without returning any input data: %s', value => {
    expect(supabasePreconnectOrigin(value)).toBe('');
  });
  test('uses configuration, never a fixed production project', () => {
    expect(supabasePreconnectOrigin('https://other-fixture.supabase.co')).toBe('https://other-fixture.supabase.co');
  });
});

describe('CSP is not widened or guessed', () => {
  test('never authorizes another origin even with the Supabase wildcard policy', () => {
    expect(cspAllowsOrigin(POLICY, 'https://other.example')).toBe(false);
    expect(cspAllowsOrigin(POLICY, '')).toBe(false);
  });
  test.each([POLICY, `connect-src ${ORIGIN}`, `default-src ${ORIGIN}`, 'CONNECT-SRC HTTPS://*.SUPABASE.CO'])('accepts reviewed allowance %s', policy => {
    expect(cspAllowsOrigin(policy, ORIGIN)).toBe(true);
  });
  test.each([
    '', null, "default-src 'self'", `default-src ${ORIGIN}; connect-src 'none'`,
    `connect-src 'none'; connect-src ${ORIGIN}`, 'connect-src wss://*.supabase.co',
    'connect-src https:', 'connect-src *', 'connect-src https://*.supabase.co.evil.example',
    `connect-src ${ORIGIN}/rest/v1`, `connect-src ${ORIGIN}, default-src 'none'`,
  ])('skips unsupported/denied allowance %s', policy => {
    expect(cspAllowsOrigin(policy, ORIGIN)).toBe(false);
  });
});

describe('copied home markup surgery', () => {
  test('inserts one anonymous connection hint after charset without altering other bytes', () => {
    const result = addSupabasePreconnect(HTML, ORIGIN, [POLICY]);
    const hint = `\r\n  <link rel="preconnect" href="${ORIGIN}" crossorigin="anonymous" />`;
    expect(result.changed).toBe(true);
    expect(result.html.replace(hint, '')).toBe(HTML);
    expect(result.html.indexOf('charset=')).toBeLessThan(result.html.indexOf('rel="preconnect"'));
    expect(result.html.indexOf('rel="preconnect"')).toBeLessThan(result.html.indexOf('rel="stylesheet"'));
    expect(result.html).not.toMatch(/apikey|authorization|sb_publishable_|prefetch|preload/);
    const document = parse5.parse(result.html);
    const head = document.childNodes.find(node => node.tagName === 'html').childNodes.find(node => node.tagName === 'head');
    expect(head.childNodes.filter(node => node.tagName === 'link')).toHaveLength(2);
  });
  test('is byte-idempotent and does not duplicate an existing equivalent origin hint', () => {
    const first = addSupabasePreconnect(HTML, ORIGIN, [POLICY]);
    expect(addSupabasePreconnect(first.html, ORIGIN, [POLICY])).toEqual({ html: first.html, changed: false, reason: 'already-present' });
  });
  test.each([ORIGIN, '//fixture-project.supabase.co'])('does not duplicate a valid preconnect already in the body: %s', href => {
    const html = HTML.replace('</body>', `<link rel="preconnect" href="${href}" crossorigin></body>`);
    expect(addSupabasePreconnect(html, ORIGIN, [POLICY])).toEqual({ html, changed: false, reason: 'already-present' });
  });
  test('keeps an unrelated preexisting hint untouched', () => {
    const source = HTML.replace('</head>', '<link rel="preconnect" href="https://already.example"></head>');
    const result = addSupabasePreconnect(source, ORIGIN, [POLICY]);
    expect(result.html).toContain('<link rel="preconnect" href="https://already.example">');
    expect((result.html.match(/fixture-project\.supabase\.co/g) || []).length).toBe(1);
  });
  test.each([[], [POLICY, "connect-src 'none'"], ['connect-src https:']].map(policies => [policies]))('honors every enforced policy or leaves HTML untouched: %j', policies => {
    expect(addSupabasePreconnect(HTML, ORIGIN, policies)).toMatchObject({ html: HTML, changed: false });
  });
  test('also respects restrictive HTML meta CSP', () => {
    const source = HTML.replace('</head>', '<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'"></head>');
    expect(addSupabasePreconnect(source, ORIGIN, [POLICY])).toMatchObject({ html: source, changed: false, reason: 'meta-csp-not-authorized' });
  });
  test.each(['<main>No explicit head</main>', '<!-- <head></head> --><main>Not a head</main>'])('does not serialize or repair unsupported HTML: %s', html => {
    expect(addSupabasePreconnect(html, ORIGIN, [POLICY])).toMatchObject({ html, changed: false });
  });
});
