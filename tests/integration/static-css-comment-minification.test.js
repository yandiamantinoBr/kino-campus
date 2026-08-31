/** @jest-environment node */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildStaticOutput } = require('../../scripts/build-static-output');
const { minifyCssComments, minifyStaticCssComments } = require('../../scripts/minify-static-css-comments');

describe('CSS comment compaction artifact boundary', () => {
  let fixtureRoot;
  let outputRoot;
  function write(relative, content) {
    const filename = path.join(fixtureRoot, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
  }
  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-css-comments-'));
    outputRoot = path.join(fixtureRoot, 'dist');
    ['index.html', '_product.html', 'admin/index.html'].forEach((file) => write(file, '<link rel="stylesheet" href="assets/css/styles.css?v=1">'));
    ['ads.txt', 'llms.txt', 'robots.txt', 'data/database.json'].forEach((file) => write(file, '{}'));
    write('sw.js', '/* service worker stays unchanged */ var CACHE_VERSION = "fixed";');
    write('assets/js/boot/kc-env.js', 'var KC_ENV={driver:"local"};');
    write('assets/css/styles.css', '/* Explanatory stylesheet section */\r\n:root { --value: foo/* raw custom value */bar; }\r\n');
    write('assets/css/nested/components.css', '/* Explanatory component section */ .a { color: red; }');
    write('assets/css/mapped.css', '/* Explanatory mapped section */ .a{color:blue} /*# sourceMappingURL=mapped.css.map */');
    write('assets/css/mapped.css.map', '{"version":3,"mappings":"AAAA"}');
    write('assets/vendor/official.css', '/* Official vendor explanatory comment */ .v { color: green; }');
    write('assets/vendor/official.js', '/* Official vendor JS */ var Vendor={};');
    write('assets/vendor/font.woff2', Buffer.from([0, 1, 2, 3, 4]));
    write('assets/other/styles.css', '/* Not in first-party CSS area */ body{color:white}');
    write('admin/admin.css', '/* Admin file outside CSS area */ body{color:white}');
    write('api/server.js', 'module.exports = () => 1;');
  });
  afterEach(() => { fs.rmSync(fixtureRoot, { recursive: true, force: true }); });

  test('only compacts copied assets/css, preserving source, HTML, vendor, fonts and other paths', () => {
    const files = ['index.html', '_product.html', 'admin/index.html', 'assets/css/styles.css', 'assets/css/nested/components.css', 'assets/css/mapped.css', 'assets/css/mapped.css.map', 'assets/vendor/official.css', 'assets/vendor/official.js', 'assets/vendor/font.woff2', 'assets/other/styles.css', 'admin/admin.css', 'sw.js', 'api/server.js'];
    const originals = Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(fixtureRoot, file))]));
    const result = buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
    expect(result.then).toBeUndefined();
    expect(result.css).toMatchObject({ files: 3, changedFiles: 2 });
    expect(Object.isFrozen(result.css)).toBe(true);
    expect(result.css.bytesAfter).toBeLessThan(result.css.bytesBefore);
    for (const file of files) expect(fs.readFileSync(path.join(fixtureRoot, file))).toEqual(originals[file]);
    for (const file of files.filter((name) => !['assets/css/styles.css', 'assets/css/nested/components.css', 'api/server.js'].includes(name))) {
      expect(fs.readFileSync(path.join(outputRoot, file))).toEqual(originals[file]);
    }
    for (const file of ['assets/css/styles.css', 'assets/css/nested/components.css']) {
      expect(fs.readFileSync(path.join(outputRoot, file), 'utf8')).toBe(minifyCssComments(originals[file].toString('utf8')));
    }
    expect(fs.existsSync(path.join(outputRoot, 'api/server.js'))).toBe(false);
  });

  test('repeat compaction is byte-identical with consistent statistics', () => {
    const first = buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot }).css;
    const repeat = minifyStaticCssComments({ sourceRoot: fixtureRoot, outputRoot });
    expect(repeat.changedFiles).toBe(0);
    expect(repeat.bytesBefore).toBe(first.bytesAfter);
    expect(repeat.bytesAfter).toBe(repeat.bytesBefore);
    expect(repeat.gzipBefore).toBe(first.gzipAfter);
  });

  test('lexical failure stops the build before replacing any copied CSS', () => {
    write('assets/css/z-invalid.css', '/* unclosed comment');
    expect(() => buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot })).toThrow('STATIC_CSS_MINIFY_FAILED:assets/css/z-invalid.css');
    expect(fs.readFileSync(path.join(outputRoot, 'assets/css/styles.css'))).toEqual(fs.readFileSync(path.join(fixtureRoot, 'assets/css/styles.css')));
    expect(fs.readFileSync(path.join(outputRoot, 'assets/css/nested/components.css'))).toEqual(fs.readFileSync(path.join(fixtureRoot, 'assets/css/nested/components.css')));
  });

  test('invalid UTF-8 fails closed instead of changing bytes through replacement characters', () => {
    write('assets/css/z-encoding.css', Buffer.from([0x61, 0x7B, 0xFF, 0x7D]));
    expect(() => buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot })).toThrow('STATIC_CSS_MINIFY_FAILED:assets/css/z-encoding.css');
    expect(fs.readFileSync(path.join(outputRoot, 'assets/css/styles.css'))).toEqual(fs.readFileSync(path.join(fixtureRoot, 'assets/css/styles.css')));
  });

  test('keeps a UTF-8 BOM/charset and CRLF verbatim in the actual file output', () => {
    const source = '\uFEFF@charset "UTF-8";\r\n/* Explanatory charset section */\r\na{content:"⛺"}\r\n';
    write('assets/css/bom.css', source);
    buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
    expect(fs.readFileSync(path.join(outputRoot, 'assets/css/bom.css'))).toEqual(Buffer.from('\uFEFF@charset "UTF-8";\r\n/**/\r\na{content:"⛺"}\r\n'));
  });

  test('refuses source/parent/inside-original-assets output targets', () => {
    for (const target of [fixtureRoot, path.dirname(fixtureRoot), path.join(fixtureRoot, 'assets'), path.join(fixtureRoot, 'assets/css')]) {
      expect(() => minifyStaticCssComments({ sourceRoot: fixtureRoot, outputRoot: target })).toThrow('STATIC_CSS_OUTPUT_UNSAFE');
    }
  });

  test('refuses symlink directories even when they point inside the output', () => {
    buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
    const original = fs.readFileSync(path.join(fixtureRoot, 'assets/css/styles.css'));
    fs.symlinkSync(path.join(fixtureRoot, 'assets/css'), path.join(outputRoot, 'assets/css/source-link'), 'junction');
    expect(() => minifyStaticCssComments({ sourceRoot: fixtureRoot, outputRoot })).toThrow('STATIC_CSS_SYMLINK');
    expect(fs.readFileSync(path.join(fixtureRoot, 'assets/css/styles.css'))).toEqual(original);
  });

  test('refuses an output directory symlink itself', () => {
    buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
    const alias = path.join(fixtureRoot, 'dist-link');
    fs.symlinkSync(outputRoot, alias, 'junction');
    expect(() => minifyStaticCssComments({ sourceRoot: fixtureRoot, outputRoot: alias })).toThrow('STATIC_CSS_SYMLINK');
  });

  test('refuses hardlinks which could otherwise mutate original sources', () => {
    buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
    const filename = path.join(fixtureRoot, 'assets/css/styles.css');
    const original = fs.readFileSync(filename);
    fs.linkSync(filename, path.join(outputRoot, 'assets/css/source-hardlink.css'));
    expect(() => minifyStaticCssComments({ sourceRoot: fixtureRoot, outputRoot })).toThrow('STATIC_CSS_HARDLINK');
    expect(fs.readFileSync(filename)).toEqual(original);
  });

  test('handles an empty CSS area without touching other outputs', () => {
    const emptyOutput = path.join(fixtureRoot, 'empty-dist');
    fs.mkdirSync(emptyOutput);
    expect(minifyStaticCssComments({ sourceRoot: fixtureRoot, outputRoot: emptyOutput })).toMatchObject({ files: 0, changedFiles: 0, bytesBefore: 0, bytesAfter: 0 });
  });
});
