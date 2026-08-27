'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const packageJson = require('../../package.json');
const vercel = require('../../vercel.json');
const tsconfig = require('../../tsconfig.contracts.json');

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
    expect(vercel.installCommand).toMatch(/^npm ci --omit=dev(?:\s|$)/);
    expect(vercel.buildCommand).not.toMatch(/tsc|typecheck|typescript/i);
  });

  test('artefato estático não copia os contratos TypeScript', () => {
    const buildScript = fs.readFileSync(
      path.join(ROOT, 'scripts/build-static-output.js'),
      'utf8',
    );
    expect(buildScript).not.toMatch(/['"]types['"]/);
    expect(fs.existsSync(path.join(ROOT, 'types/supabase.generated.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'types/posts.contracts.ts'))).toBe(true);
  });
});
