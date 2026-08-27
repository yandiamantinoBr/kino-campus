'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const packageJson = require('../../package.json');
const vercel = require('../../vercel.json');
const tsconfig = require('../../tsconfig.contracts.json');
const umdPilotConfig = require('../../tsconfig.umd-pilot.json');

describe('TypeScript como gate de contratos sem alterar o runtime', () => {
  test('usa configuração estrita, isolada e sem emissão', () => {
    expect(tsconfig.compilerOptions).toMatchObject({
      strict: true,
      noEmit: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
    });
    expect(tsconfig.include).toEqual(['types/**/*.ts']);
    expect(tsconfig.exclude).toEqual(expect.arrayContaining([
      'assets/**',
      'admin/**',
      'dist/**',
      'supabase/functions/**',
    ]));
  });

  test('mantém TypeScript apenas em dev e fora do build Vercel', () => {
    expect(packageJson.devDependencies.typescript).toBe('5.9.3');
    expect(packageJson.dependencies).not.toHaveProperty('typescript');
    expect(packageJson.scripts['typecheck:contracts']).toBe(
      'tsc --project tsconfig.contracts.json --pretty false',
    );
    expect(packageJson.scripts['typecheck:umd-pilot']).toBe(
      'tsc --project tsconfig.umd-pilot.json --pretty false',
    );
    expect(vercel.installCommand).toMatch(/^npm ci --omit=dev(?:\s|$)/);
    expect(vercel.buildCommand).not.toMatch(/tsc|typecheck|typescript/i);
  });

  test('limita checkJs estrito ao módulo UMD puro de Tags', () => {
    expect(umdPilotConfig.extends).toBe('./tsconfig.contracts.json');
    expect(umdPilotConfig.compilerOptions).toMatchObject({
      allowJs: true,
      checkJs: true,
    });
    expect(umdPilotConfig.include).toEqual(expect.arrayContaining([
      'types/umd-pilot.globals.d.ts',
      'types/umd-pilot/**/*.ts',
      'assets/js/shared/kc-post-user-tags.shared.js',
    ]));
    expect(umdPilotConfig.include.filter((entry) => entry.startsWith('assets/'))).toEqual([
      'assets/js/shared/kc-post-user-tags.shared.js',
    ]);
  });

  test('artefato estático não copia os contratos TypeScript', () => {
    const buildScript = fs.readFileSync(
      path.join(ROOT, 'scripts/build-static-output.js'),
      'utf8',
    );
    expect(buildScript).not.toMatch(/['"]types['"]/);
    expect(fs.existsSync(path.join(ROOT, 'types/supabase.generated.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'types/posts.contracts.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'types/umd-pilot/post-user-tags.type-test.ts'))).toBe(true);
  });
});
