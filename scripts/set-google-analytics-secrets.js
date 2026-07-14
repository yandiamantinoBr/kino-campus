'use strict';

/**
 * Safely validates and deploys the Google reporting credentials used by the
 * GA4/Search Console Edge Functions. Secret JSON is written only to a 0600
 * temporary env file; it is never interpolated into a shell command or argv.
 *
 * Usage:
 *   npm run analytics:secrets:set -- \
 *     --project-ref <supabase-project-ref> \
 *     --ga-key <service-account.json> \
 *     --ga-property <numeric-property-id> \
 *     --search-console-key <service-account.json> \
 *     --search-console-site <sc-domain:example.com|https://example.com/>
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const SC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TEMP_PREFIX = 'kc-google-reporting-secrets-';

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Argumento inesperado: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${key}`);
    values[key.slice(2)] = value;
    index += 1;
  }

  const required = [
    'project-ref',
    'ga-key',
    'ga-property',
    'search-console-key',
    'search-console-site',
  ];
  for (const key of required) {
    if (!values[key]) throw new Error(`Argumento obrigatório ausente: --${key}`);
  }
  if (!/^[a-z]{20}$/.test(values['project-ref'])) {
    throw new Error('--project-ref inválido');
  }
  if (!/^\d{6,20}$/.test(values['ga-property'])) {
    throw new Error('--ga-property deve ser numérico');
  }
  validateSearchConsoleSite(values['search-console-site']);
  return values;
}

function validateSearchConsoleSite(value) {
  if (/^sc-domain:[a-z0-9.-]+$/i.test(value)) return value;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error('--search-console-site inválido');
  }
  if (
    parsed.protocol !== 'https:' || parsed.username || parsed.password ||
    parsed.port || parsed.search || parsed.hash
  ) {
    throw new Error('--search-console-site deve ser HTTPS ou sc-domain');
  }
  return value;
}

function normalizeServiceAccount(value, sourceLabel) {
  if (
    !value || value.type !== 'service_account' ||
    typeof value.private_key !== 'string' ||
    !value.private_key.includes('-----BEGIN PRIVATE KEY-----') ||
    !value.private_key.includes('-----END PRIVATE KEY-----') ||
    typeof value.client_email !== 'string' ||
    !/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/i.test(value.client_email)
  ) {
    throw new Error(`${sourceLabel}: JSON de service account inválido`);
  }
  return {
    type: 'service_account',
    private_key: value.private_key,
    client_email: value.client_email,
  };
}

function loadServiceAccount(filePath, sourceLabel) {
  const resolved = fs.realpathSync(filePath);
  const stats = fs.statSync(resolved);
  if (!stats.isFile() || stats.size < 100 || stats.size > 128 * 1024) {
    throw new Error(`${sourceLabel}: arquivo inválido`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (_) {
    throw new Error(`${sourceLabel}: JSON ilegível`);
  }
  return normalizeServiceAccount(parsed, sourceLabel);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function dotenvLiteral(value) {
  if (value.includes("'")) throw new Error('Valor não pode conter aspas simples');
  return `'${value}'`;
}

function buildSecretPayload(config) {
  const gaJson = JSON.stringify(config.gaAccount);
  const searchConsoleJson = JSON.stringify(config.searchConsoleAccount);
  const entries = {
    KC_GA4_SA_KEY: gaJson,
    KC_GA4_PROPERTY_ID: config.gaProperty,
    KC_SEARCH_CONSOLE_SA_KEY: searchConsoleJson,
    KC_SEARCH_CONSOLE_SITE_URL: config.searchConsoleSite,
  };
  const env = Object.entries(entries)
    .map(([name, value]) => `${name}=${dotenvLiteral(value)}`)
    .join('\n') + '\n';
  const digests = Object.fromEntries(
    Object.entries(entries).map(([name, value]) => [name, sha256(value)])
  );
  return { env, digests };
}

function base64url(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return bytes.toString('base64url');
}

function createAssertion(account, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key);
  return `${unsigned}.${base64url(signature)}`;
}

async function exchangeAccessToken(account, scope) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createAssertion(account, scope),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`OAuth Google falhou com HTTP ${response.status}`);
  }
  return body.access_token;
}

async function verifyGoogleAccess(config) {
  const gaToken = await exchangeAccessToken(config.gaAccount, GA_SCOPE);
  const gaResponse = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${config.gaProperty}:runRealtimeReport`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${gaToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ metrics: [{ name: 'activeUsers' }], limit: 1 }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!gaResponse.ok) throw new Error(`GA4 Data API falhou com HTTP ${gaResponse.status}`);

  const searchToken = await exchangeAccessToken(config.searchConsoleAccount, SC_SCOPE);
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  const isoDate = (date) => date.toISOString().slice(0, 10);
  const site = encodeURIComponent(config.searchConsoleSite);
  const searchResponse = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${searchToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        startDate: isoDate(start),
        endDate: isoDate(end),
        rowLimit: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!searchResponse.ok) {
    throw new Error(`Search Console API falhou com HTTP ${searchResponse.status}`);
  }
  return { gaStatus: gaResponse.status, searchConsoleStatus: searchResponse.status };
}

function resolveSupabaseInvocation() {
  const candidates = [
    process.env.SUPABASE_CLI_JS,
    process.env.APPDATA && path.join(
      process.env.APPDATA,
      'npm',
      'node_modules',
      'supabase',
      'dist',
      'supabase.js'
    ),
    path.join(__dirname, '..', 'node_modules', 'supabase', 'dist', 'supabase.js'),
  ].filter(Boolean);
  const cliScript = candidates.find((candidate) => fs.existsSync(candidate));
  if (!cliScript) {
    throw new Error('Supabase CLI não encontrado; defina SUPABASE_CLI_JS');
  }
  return { command: process.execPath, prefix: [cliScript] };
}

function runSupabase(invocation, args) {
  const result = spawnSync(
    invocation.command,
    [...invocation.prefix, ...args],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }
  );
  if (result.status !== 0) {
    const safeError = String(result.stderr || result.stdout || 'falha desconhecida')
      .replace(/\u001b\[[0-9;]*m/g, '')
      .slice(-800);
    throw new Error(`Supabase CLI falhou: ${safeError}`);
  }
  return String(result.stdout || '').trim();
}

function parseSecretList(output) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Resposta inválida ao listar secrets');
  return JSON.parse(output.slice(start, end + 1));
}

function verifyRemoteDigests(list, expected) {
  const remote = new Map(list.map((entry) => [entry.name, entry.value]));
  const mismatches = Object.entries(expected)
    .filter(([name, digest]) => remote.get(name) !== digest)
    .map(([name]) => name);
  if (mismatches.length) {
    throw new Error(`Verificação de digest falhou: ${mismatches.join(', ')}`);
  }
}

function removeTemporaryDirectory(tempDir) {
  const resolved = path.resolve(tempDir);
  const allowedRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(allowedRoot) || !path.basename(resolved).startsWith(TEMP_PREFIX)) {
    throw new Error('Recusa ao remover diretório temporário inesperado');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const config = {
    gaAccount: loadServiceAccount(args['ga-key'], 'GA4'),
    searchConsoleAccount: loadServiceAccount(
      args['search-console-key'],
      'Search Console'
    ),
    gaProperty: args['ga-property'],
    searchConsoleSite: args['search-console-site'],
  };

  process.stdout.write('Validando OAuth e APIs Google... ');
  const preflight = await verifyGoogleAccess(config);
  console.log(`OK (GA4 ${preflight.gaStatus}, Search Console ${preflight.searchConsoleStatus})`);

  const payload = buildSecretPayload(config);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const envPath = path.join(tempDir, '.env');
  try {
    fs.writeFileSync(envPath, payload.env, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    const invocation = resolveSupabaseInvocation();
    runSupabase(invocation, [
      'secrets',
      'set',
      '--project-ref',
      args['project-ref'],
      '--env-file',
      envPath,
    ]);
    const listOutput = runSupabase(invocation, [
      'secrets',
      'list',
      '--project-ref',
      args['project-ref'],
      '--output',
      'json',
    ]);
    verifyRemoteDigests(parseSecretList(listOutput), payload.digests);
    console.log('Secrets atualizados e digests verificados sem expor credenciais.');
  } finally {
    removeTemporaryDirectory(tempDir);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Falha segura: ${String(error.message || error).slice(0, 900)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSecretPayload,
  createAssertion,
  dotenvLiteral,
  normalizeServiceAccount,
  parseArgs,
  parseSecretList,
  removeTemporaryDirectory,
  sha256,
  validateSearchConsoleSite,
  verifyRemoteDigests,
};
