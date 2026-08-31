/** @jest-environment node */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildStaticOutput, PUBLIC_ROOT_FILES } = require('../../scripts/build-static-output');
const { GROUPS } = require('../../scripts/bundle-static-definition-scripts');
const { minifyJavaScript } = require('../../scripts/minify-static-javascript');
const { applyStaticCacheRevision, verifyStaticCacheArtifact } = require('../../scripts/static-cache-revision');
const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(file, 'utf8');
let fixture;
let output;

function write(relative, content = '') {
  const file = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-home-definition-build-'));
  output = path.join(fixture, 'dist');
  write('index.html', read(path.join(ROOT, 'index.html')));
  write('_product.html', '<script defer src="assets/js/product.js?v=before"></script>');
  write('admin/index.html', '<script defer src="../assets/js/admin.js?v=before"></script>');
  write('assets/js/boot/kc-env.js', 'window.__fixture = true;');
  write('assets/css/styles.css', 'body { color: #222; }');
  write('data/database.json', '{}');
  for (const file of PUBLIC_ROOT_FILES) write(file, read(path.join(ROOT, file)));
  for (const file of GROUPS.flatMap(group => group.files)) write(file, read(path.join(ROOT, file)));
});

afterEach(() => {
  if (path.dirname(fixture) !== os.tmpdir() || !path.basename(fixture).startsWith('kc-home-definition-build-')) {
    throw new Error('Unexpected fixture cleanup path');
  }
  fs.rmSync(fixture, { recursive: true, force: true });
});

test('production build groups exactly 38 definitions after formatting and keeps source/other pages intact', () => {
  const source = read(path.join(fixture, 'index.html'));
  const result = buildStaticOutput({ sourceRoot: fixture, outputRoot: output, definitionBundles: true });
  expect(result.definitionBundles.scriptsBefore).toBe(99);
  expect(result.definitionBundles.scriptsAfter).toBe(65);
  expect(result.definitionBundles.groups).toHaveLength(4);
  const worker = read(path.join(output, 'sw.js'));
  expect(worker).toContain('/' + result.definitionBundles.groups[0].url);
  expect(worker).toContain('/assets/js/utils/kc-utils.string.js?v=8.6.4');
  expect(worker).not.toContain('/' + result.definitionBundles.groups[1].url);
  expect(read(path.join(fixture, 'sw.js'))).toBe(read(path.join(ROOT, 'sw.js')));
  expect(read(path.join(fixture, 'index.html'))).toBe(source);
  expect(read(path.join(output, '_product.html'))).toBe(read(path.join(fixture, '_product.html')));
  expect(read(path.join(output, 'admin/index.html'))).toBe(read(path.join(fixture, 'admin/index.html')));
  for (const group of result.definitionBundles.groups) {
    const bundle = read(path.join(output, group.file));
    for (const file of group.sources) {
      const original = read(path.join(fixture, file));
      const formatted = minifyJavaScript(original, file);
      expect(read(path.join(output, file))).toBe(formatted);
      expect(bundle).toContain(formatted.trim());
    }
  }
  const verified = applyStaticCacheRevision({ outputRoot: output, revision: 'reviewed-build-42' });
  expect(verified.htmlFiles).toBe(3);
  expect(verifyStaticCacheArtifact({ outputRoot: output }).revision).toBe('reviewed-build-42');
  expect(read(path.join(output, 'index.html')).match(/bundles\/[^"?]+\?v=reviewed-build-42/g)).toHaveLength(4);
});

test('strict opt-in cannot silently skip an absent production member', () => {
  const file = GROUPS[3].files.at(-1);
  const source = read(path.join(fixture, 'index.html'));
  write('index.html', source.replace(new RegExp('<script defer src="' + file.replaceAll('.', '\\.') + '[^"]*"></script>'), ''));
  expect(() => buildStaticOutput({ sourceRoot: fixture, outputRoot: output, definitionBundles: true }))
    .toThrow('STATIC_DEFINITION_BUNDLE_HTML_GROUP_MEMBERS');
  expect(fs.existsSync(path.join(output, 'assets/js/bundles'))).toBe(false);
});

test('rebuilding the same sources gives the same content hashes and HTML', () => {
  const first = buildStaticOutput({ sourceRoot: fixture, outputRoot: output, definitionBundles: true });
  const html = read(path.join(output, 'index.html'));
  const second = buildStaticOutput({ sourceRoot: fixture, outputRoot: output, definitionBundles: true });
  expect(second.definitionBundles.groups).toEqual(first.definitionBundles.groups);
  expect(read(path.join(output, 'index.html'))).toBe(html);
});

test('generic copy fixtures remain explicitly separate from the production entrypoints', () => {
  const result = buildStaticOutput({ sourceRoot: fixture, outputRoot: output });
  expect(result.definitionBundles).toBeNull();
  expect(read(path.join(output, 'index.html'))).toBe(read(path.join(fixture, 'index.html')));
  for (const filename of ['scripts/inject-env.js', 'scripts/build-static-output.js']) {
    expect(read(path.join(ROOT, filename))).toContain('definitionBundles: true');
  }
});

test('build parsers are exact production dependencies, not accidental test transitive dependencies', () => {
  const manifest = JSON.parse(read(path.join(ROOT, 'package.json')));
  const lock = JSON.parse(read(path.join(ROOT, 'package-lock.json')));
  for (const [name, version] of [['acorn', '8.18.0'], ['parse5', '7.3.0']]) {
    expect(manifest.dependencies[name]).toBe(version);
    expect(lock.packages[''].dependencies[name]).toBe(version);
    expect(lock.packages['node_modules/' + name].dev).not.toBe(true);
  }
});
