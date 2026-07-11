const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('dependency automation contracts', () => {
  test('keeps Jest and Babel toolchains in compatible update groups', () => {
    const config = read('.github/dependabot.yml');

    expect(config).toMatch(
      /jest-toolchain:[\s\S]*?- jest\s+[\s\S]*?- jest-\*\s+[\s\S]*?- "@jest\/\*"\s+[\s\S]*?- babel-jest/
    );
    expect(config).toMatch(
      /babel-toolchain:[\s\S]*?- "@babel\/core"\s+[\s\S]*?- "@babel\/preset-env"/
    );
  });

  test('documents the pinned Supabase CLI release in every workflow', () => {
    const workflows = [
      read('.github/workflows/essential-validation.yml'),
      read('.github/workflows/edge-deploy.yml')
    ];

    workflows.forEach((workflow) => {
      expect(workflow).toContain(
        'supabase/setup-cli@46f7f98c7f948ad727d22c1e67fab04c223a0520 # v3.0.0'
      );
    });
  });
});
