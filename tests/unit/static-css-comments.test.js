/** @jest-environment node */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { tokenize, TokenType } = require('@csstools/css-tokenizer');
const { minifyCssComments, assertIdenticalCssTokens } = require('../../scripts/minify-static-css-comments');

const ROOT = path.resolve(__dirname, '../..');
const explanation = '/* Explanatory comment between complete stylesheet rules. */';

describe('top-level explanatory CSS comments only', () => {
  test('pins the already-used synchronous tokenizer as a production dependency', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    expect(manifest.dependencies['@csstools/css-tokenizer']).toBe('3.0.4');
    expect(lock.packages['node_modules/@csstools/css-tokenizer'].version).toBe('3.0.4');
    expect(lock.packages['node_modules/@csstools/css-tokenizer'].dev).not.toBe(true);
    expect(typeof tokenize).toBe('function');
  });

  test('changes only explanatory comments between complete top-level rules', () => {
    const rule = '.campus/* selector explanation stays */ > a { /* block explanation stays */ color: red; }';
    const input = `${explanation}\n${rule}\n${explanation}\n@media (min-width: 40rem) { ${explanation} .inside { color: blue; } }\n${explanation}`;
    expect(minifyCssComments(input)).toBe(`/**/\n${rule}\n/**/\n@media (min-width: 40rem) { ${explanation} .inside { color: blue; } }\n/**/`);
  });

  test.each([
    '/*! Important license remains */',
    '/* @license MIT License */',
    '/* @preserve supplied implementation */',
    '/* Copyright 2026 KinoCampus */',
    '/* SPDX-License-Identifier: ISC */',
    '/* Licence: CC BY 4.0 */',
    '/* @cc_on legacy conditional compilation */',
  ])('preserves legal/special comment exactly: %s', (comment) => {
    expect(minifyCssComments(`${explanation}\n${comment}\na{color:red}`)).toBe(`/**/\n${comment}\na{color:red}`);
  });

  test.each([
    '/**/', '/* */', '/*** ***/', '/* short */', '/*_*/',
    '/*\\*/', '/* hide from legacy Mac IE \\*/', '/*/*/', '/*/**/',
    '/* IE7 compatibility block */', '/* Internet Explorer conditional block */',
    '/* [if IE] conditional block */', '/* [endif] conditional block */',
    '/* <!-- legacy HTML wrapper --> */', '/* browser hack boundary */',
  ])('preserves ambiguous legacy/empty comment exactly: %s', (comment) => {
    const input = `${comment}\na { color: red; }`;
    expect(minifyCssComments(input)).toBe(input);
  });

  test('preserves complete legacy delimiter patterns and CDO/CDC tokens', () => {
    const input = '<!--\n/*\\*/\na { color: red; }\n/**/\nhtml>/**/body { color: blue; }\n/*/*/\nb { color: black; }\n/* */\n-->';
    expect(minifyCssComments(input)).toBe(input);
  });

  test.each(['sourceMappingURL=styles.css.map', 'sourceURL=styles-source.css'])('keeps mapped files entirely unchanged: %s', (directive) => {
    const input = `${explanation}\na { color: red; }\n/*# ${directive} */`;
    expect(minifyCssComments(input)).toBe(input);
  });

  test('preserves all CSSOM-observable value source text, not just non-comment tokens', () => {
    const rules = `
:root {
  --custom: foo/* custom value explanation */bar;
  --escaped: { one: two; /* raw custom block */ nested: [a/* raw list */b]; };
  --\\63 omment: calc(1px /* meaningful raw value */ + 2px);
}
@property --registered { syntax: "*"; inherits: true; initial-value: foo/* initial raw value */bar; }
.probe { width: var(--missing, calc(1px /* fallback explanation */ + 2px)); }
@supports (--custom: foo/* condition explanation */bar) { .probe { color: red; } }
@container style(--custom: foo/* style query explanation */bar) { .probe { height: 2px; } }
`;
    // JSDOM strips comments from these values unlike browsers. Assert their
    // ORIGINAL BYTES; a separate browser fixture verifies actual CSSOM values.
    expect(minifyCssComments(explanation + rules)).toBe('/**/' + rules);
  });

  test('does not touch strings, data URLs, escapes, calc whitespace or @rule parameters', () => {
    const rules = String.raw`
@import /* import explanation */ url("theme.css?x=/*literal*/") screen;
@namespace svg /* namespace explanation */ url(http://www.w3.org/2000/svg);
.foo\2f bar[data-label="/* string stays */"] {
  content: "quote: \" slash: \\ /* not a comment */ São João ⛺";
  background: url(data:image/svg+xml,%3C!--/*literal*/--%3E);
  border-image: url("data:image/svg+xml,<svg><!-- /* literal */ --></svg>");
  width: calc(100% /* calculation explanation */ - 2px);
}
`;
    expect(minifyCssComments(explanation + rules)).toBe('/**/' + rules);
  });

  test('keeps comments that separate identifiers/selectors or occur in nested rules', () => {
    const rules = `a/* identifier separator */b { color: red; }
@layer demo { ${explanation} @scope (.foo) { .bar { --tokens: a/* token separation */b; } } }
@supports selector(:is(.one/* selector condition */, .two)) { .one { color: red; } }`;
    expect(minifyCssComments(explanation + rules)).toBe('/**/' + rules);
  });

  test('retains BOM, charset position, CRLF, form feed, Unicode and trailing bytes', () => {
    const input = '\uFEFF@charset "UTF-8";\r\n' + explanation + '\r\na { content: "São João ⛺"; }\f\r\n';
    const output = minifyCssComments(input);
    expect(output).toBe('\uFEFF@charset "UTF-8";\r\n/**/\r\na { content: "São João ⛺"; }\f\r\n');
    expect(Buffer.from(output).subarray(0, 3)).toEqual(Buffer.from([0xEF, 0xBB, 0xBF]));
  });

  test('does not normalize escaped multiline strings', () => {
    const rule = '.a{content:"first\\\r\n  second";--value: "\\26  B";}';
    expect(minifyCssComments(explanation + rule)).toBe('/**/' + rule);
  });

  test.each(['/* unterminated', '.a{content:"broken\n}', '.a{background:url(bad"url)}'])('fails closed on lexical tokenization errors: %s', (input) => {
    expect(() => minifyCssComments(input, 'invalid.css')).toThrow('STATIC_CSS_MINIFY_FAILED:invalid.css');
  });

  test.each(['a { color: red;', '} a { color: red; }', 'a { --tokens: (one]; }'])('preserves browser-recoverable unbalanced blocks instead of guessing boundaries: %s', (rule) => {
    const input = explanation + rule;
    expect(minifyCssComments(input)).toBe(input);
  });

  test('runtime validation rejects any changed non-comment raw token or decoded data', () => {
    const input = 'a { width: 1px; }';
    const before = tokenize({ css: input });
    for (const mutate of [
      (tokens) => { tokens.find((token) => token[0] === TokenType.Whitespace)[1] = '\t'; },
      (tokens) => { tokens.find((token) => token[0] === TokenType.Dimension)[4].unit = 'em'; },
      (tokens) => { tokens.pop(); },
    ]) {
      const after = structuredClone(before);
      mutate(after);
      expect(() => assertIdenticalCssTokens(before, after)).toThrow(/CSS (?:non-comment token|token count) changed/);
    }
  });

  test('runtime validation rejects compaction of an observable nested comment', () => {
    const before = tokenize({ css: ':root{--v:foo/* explanation in value */bar}' });
    const after = tokenize({ css: ':root{--v:foo/**/bar}' });
    expect(() => assertIdenticalCssTokens(before, after)).toThrow('CSS comment contract changed');
  });

  test('is synchronous, deterministic and byte-idempotent, including empty input', () => {
    for (const input of ['', '/**/', explanation, '/*! legal */', '.a{color:red}', explanation + '.a{color:red}\n']) {
      const output = minifyCssComments(input);
      expect(typeof output).toBe('string');
      expect(minifyCssComments(input)).toBe(output);
      expect(minifyCssComments(output)).toBe(output);
      expect(Buffer.byteLength(output)).toBeLessThanOrEqual(Buffer.byteLength(input));
    }
  });

  test('preserves exact tokens and protected contexts across every repository stylesheet', () => {
    const files = fs.readdirSync(path.join(ROOT, 'assets/css'), { recursive: true }).filter((name) => name.endsWith('.css'));
    expect(files.length).toBeGreaterThan(15);
    let savedGzip = 0;
    for (const file of files) {
      const source = fs.readFileSync(path.join(ROOT, 'assets/css', file), 'utf8');
      const output = minifyCssComments(source, file);
      expect(() => assertIdenticalCssTokens(tokenize({ css: source }), tokenize({ css: output }))).not.toThrow();
      expect(minifyCssComments(output, file)).toBe(output);
      savedGzip += zlib.gzipSync(source).length - zlib.gzipSync(output).length;
    }
    expect(savedGzip).toBeGreaterThan(8000);
  });
});
