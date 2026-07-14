'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Secrets = require('../../scripts/set-google-analytics-secrets.js');

const PRIVATE_KEY = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });

function account(label) {
  return Secrets.normalizeServiceAccount({
    type: 'service_account',
    private_key: PRIVATE_KEY,
    client_email: `${label}@example-project.iam.gserviceaccount.com`,
    project_id: 'must-not-be-stored',
  }, label);
}

describe('implantação segura dos secrets Google', () => {
  test('reduz a chave aos três campos necessários e gera JWT RS256', () => {
    const normalized = account('ga-reader');
    expect(Object.keys(normalized)).toEqual(['type', 'private_key', 'client_email']);
    expect(Secrets.createAssertion(normalized, 'scope').split('.')).toHaveLength(3);
  });

  test('gera env de linha única e digests do valor efetivamente enviado', () => {
    const payload = Secrets.buildSecretPayload({
      gaAccount: account('ga-reader'),
      searchConsoleAccount: account('sc-reader'),
      gaProperty: '540208497',
      searchConsoleSite: 'sc-domain:kinocampus.com.br',
    });
    const lines = payload.env.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines.every((line) => /^KC_[A-Z0-9_]+='[^']+'$/.test(line))).toBe(true);
    expect(payload.env).not.toContain('must-not-be-stored');
    expect(payload.digests.KC_GA4_PROPERTY_ID).toBe(Secrets.sha256('540208497'));
  });

  test('valida argumentos e propriedades Search Console', () => {
    expect(() => Secrets.parseArgs([])).toThrow(/project-ref/);
    expect(Secrets.validateSearchConsoleSite('sc-domain:kinocampus.com.br'))
      .toBe('sc-domain:kinocampus.com.br');
    expect(() => Secrets.validateSearchConsoleSite('http://example.com/'))
      .toThrow(/HTTPS/);
  });

  test('detecta qualquer digest remoto divergente', () => {
    expect(() => Secrets.verifyRemoteDigests(
      [{ name: 'KC_GA4_SA_KEY', value: 'wrong' }],
      { KC_GA4_SA_KEY: 'expected' }
    )).toThrow(/KC_GA4_SA_KEY/);
  });

  test('remove somente diretório temporário criado sob os.tmpdir', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-google-reporting-secrets-'));
    fs.writeFileSync(path.join(tempDir, '.env'), 'secret', { mode: 0o600 });
    Secrets.removeTemporaryDirectory(tempDir);
    expect(fs.existsSync(tempDir)).toBe(false);
    expect(() => Secrets.removeTemporaryDirectory(path.resolve(__dirname, '..')))
      .toThrow(/Recusa/);
  });
});
