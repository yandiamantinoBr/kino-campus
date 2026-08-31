/** @jest-environment node */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { GROUPS, bundleStaticDefinitionScripts } = require('../../scripts/bundle-static-definition-scripts');
const { minifyJavaScript } = require('../../scripts/minify-static-javascript');
const ROOT = path.resolve(__dirname, '../..');
const MEMBERS = GROUPS.flatMap(group => group.files);
let sourceRoot;
let outputRoot;

function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}
function read(root, relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function htmlFixture() {
  return '<!doctype html><html><head><script src="assets/js/boot/protected.js"></script></head><body>\n'
    + GROUPS.map((group, index) => '<script defer src="assets/js/gap-' + index + '.js?v=keep"></script>\n'
      + group.files.map(file => `<script defer src="${file}?v=before"></script>`).join('\n')).join('\n')
    + '\n<script defer src="assets/js/end.js?v=keep"></script></body></html>';
}
function mutateHtml(transform, both = true) {
  write(outputRoot, 'index.html', transform(read(outputRoot, 'index.html')));
  if (both) write(sourceRoot, 'index.html', transform(read(sourceRoot, 'index.html')));
}
function run(options = {}) { return bundleStaticDefinitionScripts({ sourceRoot, outputRoot, ...options }); }
function assertUntouched(callback) {
  const before = read(outputRoot, 'index.html');
  expect(callback).toThrow(/STATIC_DEFINITION_BUNDLE_/);
  expect(read(outputRoot, 'index.html')).toBe(before);
  expect(fs.existsSync(path.join(outputRoot, 'assets/js/bundles'))).toBe(false);
}

beforeEach(() => {
  sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-definition-bundles-'));
  outputRoot = path.join(sourceRoot, 'dist');
  for (const [index, file] of MEMBERS.entries()) {
    const source = `(function () { 'use strict'; function value() { return ${index}; } window._KCU = window._KCU || {}; window._KCU.test${index} = { value }; })();\n`;
    write(sourceRoot, file, source);
    write(outputRoot, file, source);
  }
  for (const root of [sourceRoot, outputRoot]) {
    write(root, 'index.html', htmlFixture());
    write(root, 'other.html', '<html>unmodified other page</html>');
    write(root, 'assets/vendor/sdk.js', '/* third party kept untouched */');
  }
});
afterEach(() => {
  if (sourceRoot && path.dirname(sourceRoot) === os.tmpdir() && path.basename(sourceRoot).startsWith('kc-definition-bundles-')) {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

describe('opt-in static definition bundle artifacts', () => {
  test('replaces exactly four contiguous groups, keeps originals and all other assets, and is idempotent', () => {
    const originalHtml = read(sourceRoot, 'index.html');
    const originals = MEMBERS.map(file => read(outputRoot, file));
    const result = run();
    expect(result.changed).toBe(true);
    expect(result.scriptsBefore - result.scriptsAfter).toBe(34);
    expect(result.groups).toHaveLength(4);
    expect(read(sourceRoot, 'index.html')).toBe(originalHtml);
    expect(MEMBERS.map(file => read(outputRoot, file))).toEqual(originals);
    expect(read(outputRoot, 'other.html')).toBe('<html>unmodified other page</html>');
    expect(read(outputRoot, 'assets/vendor/sdk.js')).toBe('/* third party kept untouched */');
    for (const artifact of result.groups) {
      const hash = crypto.createHash('sha256').update(read(outputRoot, artifact.file)).digest('hex');
      expect(artifact.hash).toBe(hash);
      expect(artifact.file).toContain(hash.slice(0, 20));
      expect(read(outputRoot, 'index.html')).toContain(`${artifact.file}?v=before`);
    }
    const once = read(outputRoot, 'index.html');
    expect(run().changed).toBe(false);
    expect(read(outputRoot, 'index.html')).toBe(once);
    expect(read(outputRoot, 'index.html').match(/gap-\d\.js\?v=keep/g)).toHaveLength(4);
  });

  test('current real home and all 38 existing minified programs pass without source edits', () => {
    for (const file of MEMBERS) {
      const source = read(ROOT, file);
      write(sourceRoot, file, source);
      write(outputRoot, file, minifyJavaScript(source, file));
    }
    const html = read(ROOT, 'index.html');
    write(sourceRoot, 'index.html', html);
    write(outputRoot, 'index.html', html);
    const result = run();
    expect(result.scriptsBefore).toBe(99);
    expect(result.scriptsAfter).toBe(65);
    expect(result.groups.every(group => group.bytes > 0)).toBe(true);
    expect(read(outputRoot, 'index.html')).toContain('assets/js/core/kc-consent.js');
    expect(read(outputRoot, 'index.html')).toContain('assets/js/api/kc-supabase.client.js');
  });

  test('output AST must match source even if both pass the definition allowlist', () => {
    write(outputRoot, MEMBERS[37], read(outputRoot, MEMBERS[37]).replace('return 37', 'return 999'));
    assertUntouched(() => run());
  });

  test.each(['source', 'output'])('invalid last %s program causes no partial bundle writes', target => {
    write(target === 'source' ? sourceRoot : outputRoot, MEMBERS[37], '(() => {');
    assertUntouched(() => run());
  });

  test.each(['source', 'output'])('future eager initializer in %s fails closed', target => {
    write(target === 'source' ? sourceRoot : outputRoot, MEMBERS[37], '(function () { "use strict"; queueMicrotask(function () {}); })();');
    assertUntouched(() => run());
  });

  test.each([
    ['async', tag => tag.replace('defer', 'defer async')],
    ['module', tag => tag.replace('defer', 'defer type="module"')],
    ['nonce', tag => tag.replace('defer', 'defer nonce="abc"')],
    ['integrity', tag => tag.replace('defer', 'defer integrity="sha256-example"')],
    ['nomodule', tag => tag.replace('defer', 'defer nomodule')],
    ['onload', tag => tag.replace('defer', 'defer onload="boot()"')],
    ['no defer', tag => tag.replace('defer ', '')],
    ['defer value', tag => tag.replace('defer ', 'defer="false" ')],
    ['duplicate defer', tag => tag.replace('defer ', 'defer defer ')],
    ['duplicate src', tag => tag.replace('defer ', 'defer src="other.js" ')],
    ['inline contents', tag => tag.replace('</script>', 'boot()</script>')],
    ['unsupported query', tag => tag.replace('?v=before', '?token=sensitive')],
    ['extra query', tag => tag.replace('?v=before', '?v=before&other=1')],
    ['missing end tag', tag => tag.replace('</script>', '')],
    ['wrapped in div', tag => '<div>' + tag + '</div>'],
    ['wrapped in template', tag => '<template>' + tag + '</template>'],
    ['duplicate tag', tag => tag + '\n' + tag],
  ])('rejects %s without writes', (_name, transform) => {
    const tag = `<script defer src="${MEMBERS[0]}?v=before"></script>`;
    mutateHtml(html => html.replace(tag, transform(tag)));
    assertUntouched(() => run());
  });

  test.each(['<!-- boundary -->', '<script defer src="other.js"></script>', '<span>gap</span>'])('does not cross intervening HTML %s', boundary => {
    mutateHtml(html => html.replace(`<script defer src="${MEMBERS[1]}`, boundary + `<script defer src="${MEMBERS[1]}`));
    assertUntouched(() => run());
  });

  test('rejects reversed source order', () => {
    mutateHtml(html => html.replace(MEMBERS[0], '__TEMP__').replace(MEMBERS[1], MEMBERS[0]).replace('__TEMP__', MEMBERS[1]));
    assertUntouched(() => run());
  });

  test('requires source index contract even when copied index was repaired', () => {
    write(sourceRoot, 'index.html', read(sourceRoot, 'index.html').replace(`defer src="${MEMBERS[0]}`, `async src="${MEMBERS[0]}`));
    assertUntouched(() => run());
  });

  test('content hash is stable while explicit cache revision changes only the HTML URL', () => {
    const first = run({ revision: 'release-a' });
    write(outputRoot, 'index.html', read(sourceRoot, 'index.html'));
    const second = run({ revision: 'release-b' });
    expect(second.groups.map(group => group.file)).toEqual(first.groups.map(group => group.file));
    expect(read(outputRoot, 'index.html')).toContain('?v=release-b');
    expect(read(outputRoot, 'index.html')).not.toContain('?v=release-a');
  });

  test('mixed old revisions use bundle hash revision', () => {
    mutateHtml(html => html.replace(`${MEMBERS[1]}?v=before`, `${MEMBERS[1]}?v=different`));
    const result = run();
    expect(read(outputRoot, 'index.html')).toContain(`${result.groups[0].file}?v=${result.groups[0].hash.slice(0, 20)}`);
  });

  test('invalid revision fails before creating bundles', () => {
    assertUntouched(() => run({ revision: '" onload="bad' }));
  });

  test.each(['source', 'assets', 'node_modules', 'elsewhere'])('rejects unsafe %s output root', name => {
    const target = name === 'source' ? sourceRoot : path.join(sourceRoot, name);
    fs.mkdirSync(target, { recursive: true });
    expect(() => run({ outputRoot: target })).toThrow(/UNSAFE_/);
  });

  test('rejects output outside source', () => {
    expect(() => run({ outputRoot: os.tmpdir() })).toThrow(/UNSAFE_/);
  });

  test.each(['source-asset', 'output-asset', 'source-index', 'output-index'])('rejects hardlinked %s', kind => {
    const root = kind.startsWith('source') ? sourceRoot : outputRoot;
    const file = kind.endsWith('index') ? 'index.html' : MEMBERS[37];
    fs.linkSync(path.join(root, file), path.join(sourceRoot, 'hardlink-copy'));
    assertUntouched(() => run());
  });

  test('rejects output junction before writes', () => {
    const link = path.join(sourceRoot, 'dist-link');
    fs.symlinkSync(outputRoot, link, 'junction');
    expect(() => run({ outputRoot: link })).toThrow(/UNSAFE_ROOT/);
  });

  test('rejects nested output directory junction', () => {
    const original = path.join(outputRoot, 'assets', 'js', 'utils');
    const moved = path.join(sourceRoot, 'moved-utils');
    fs.renameSync(original, moved);
    fs.symlinkSync(moved, original, 'junction');
    assertUntouched(() => run());
  });

  test('rejects invalid UTF-8 instead of substituting source bytes', () => {
    write(outputRoot, MEMBERS[37], Buffer.from([0xc3, 0x28]));
    assertUntouched(() => run());
  });

  test('preexisting bundle corruption is not silently overwritten', () => {
    const result = run();
    write(outputRoot, result.groups[0].file, 'corrupt');
    const html = read(outputRoot, 'index.html');
    expect(() => run()).toThrow(/HASH_COLLISION/);
    expect(read(outputRoot, 'index.html')).toBe(html);
    expect(read(outputRoot, result.groups[0].file)).toBe('corrupt');
  });

  test('preexisting bundle hardlink is rejected', () => {
    const result = run();
    fs.linkSync(path.join(outputRoot, result.groups[0].file), path.join(sourceRoot, 'bundle-hardlink'));
    expect(() => run()).toThrow(/HARDLINK/);
  });

  test('partial rerun is rejected rather than double execution', () => {
    run();
    mutateHtml(html => html.replace('</body>', `<script defer src="${MEMBERS[0]}?v=before"></script></body>`), false);
    expect(() => run()).toThrow(/HTML_PARTIAL_GROUP/);
  });
});
