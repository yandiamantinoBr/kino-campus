'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildStaticOutput, PUBLIC_ROOT_FILES } = require('../../scripts/build-static-output');

function write(root, relativePath, value = 'fixture') {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value, 'utf8');
}

describe('Vercel static output allowlist', () => {
  let fixtureRoot;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-vercel-output-'));
    ['index.html', '_product.html'].forEach((file) => write(fixtureRoot, file));
    PUBLIC_ROOT_FILES.forEach((file) => write(fixtureRoot, file));
    write(fixtureRoot, 'admin/index.html');
    write(fixtureRoot, 'assets/js/boot/kc-env.js');
    write(fixtureRoot, 'assets/js/boot/README.md', 'internal');
    write(fixtureRoot, 'data/database.json', '{}');
    write(fixtureRoot, 'data/.openclaw/private.js');
    write(fixtureRoot, 'supabase/migrations/private.sql');
    write(fixtureRoot, 'tests/integration/private.test.js');
    write(fixtureRoot, '.github/workflows/private.yml');
    write(fixtureRoot, 'scripts/inject-env.js');
    write(fixtureRoot, '.env', 'SECRET=never-copy');
    write(fixtureRoot, 'package.json', '{}');
  });

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('copies required site files but excludes repository internals', () => {
    const outputRoot = path.join(fixtureRoot, 'dist');
    buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });

    expect(fs.existsSync(path.join(outputRoot, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, 'admin/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, 'assets/js/boot/kc-env.js'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, 'data/database.json'))).toBe(true);
    for (const forbidden of [
      'supabase', 'tests', '.github', 'scripts', '.env', 'package.json',
      'assets/js/boot/README.md', 'data/.openclaw',
    ]) {
      expect(fs.existsSync(path.join(outputRoot, forbidden))).toBe(false);
    }
  });

  test('vercel config and ignore file keep both packaging defenses enabled', () => {
    const root = path.resolve(__dirname, '..', '..');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const ignore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');

    expect(config.outputDirectory).toBe('dist');
    expect(config.functions['api/og-product.js'].includeFiles).toBe('{_product.html,404.html}');
    for (const pattern of ['.env.*', '.github/**', 'docs/**', 'supabase/**', 'tests/**']) {
      expect(ignore).toContain(pattern);
    }
  });
});
