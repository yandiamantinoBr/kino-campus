'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROOF_SOURCE_ID = 'web.postgrest-phase-a-proof';

function fail(message) {
  throw new Error(message);
}

function readLocalStatus() {
  const command = process.platform === 'win32'
    ? (process.env.ComSpec || 'cmd.exe')
    : 'supabase';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'supabase status --output json']
    : ['status', '--output', 'json'];
  const result = spawnSync(
    command,
    args,
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) fail('Supabase local status is unavailable. Start the local stack first.');
  const start = result.stdout.indexOf('{');
  const end = result.stdout.lastIndexOf('}');
  if (start < 0 || end <= start) fail('Supabase local status did not contain JSON.');
  return JSON.parse(result.stdout.slice(start, end + 1));
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function authenticatedJwt(secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    aud: 'authenticated',
    exp: now + 300,
    iat: now,
    iss: 'supabase-demo',
    role: 'authenticated',
    sub: '00000000-0000-4000-8000-000000000123',
  }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function resolveContainer() {
  const config = fs.readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  const match = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);
  if (!match) fail('Unable to resolve a safe local Supabase project_id.');
  return `supabase_db_${match[1]}`;
}

function cleanup(container) {
  const result = spawnSync(
    'docker',
    [
      'exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres', '-c',
      `delete from public.kc_unit_meta where unit_id = '${PROOF_SOURCE_ID}';`,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) fail('Unable to clean the local PostgREST proof row.');
}

async function main() {
  const local = readLocalStatus();
  const restUrl = String(local.REST_URL || '').replace(/\/$/, '');
  const anonKey = local.ANON_KEY;
  const serviceKey = local.SERVICE_ROLE_KEY;
  const jwtSecret = local.JWT_SECRET;
  if (!restUrl || !anonKey || !serviceKey || !jwtSecret) fail('Local Supabase status omitted required test credentials.');

  const container = resolveContainer();
  cleanup(container);

  async function request(pathname, options) {
    const response = await fetch(restUrl + pathname, {
      method: options.method || 'GET',
      headers: {
        apikey: options.apiKey,
        Authorization: `Bearer ${options.bearer}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch (_error) { body = text; }
    }
    return { status: response.status, body };
  }

  const service = { apiKey: serviceKey, bearer: serviceKey };
  const anon = { apiKey: anonKey, bearer: anonKey };
  const authenticated = {
    apiKey: anonKey,
    bearer: authenticatedJwt(jwtSecret),
  };

  let primaryError = null;
  try {
    const contract = await request('/rpc/kc_cadu_metadata_contract', {
      ...service,
      method: 'POST',
      body: {},
    });
    if (contract.status !== 200 || !contract.body || contract.body.ready !== true) {
      fail(`service_role contract probe failed with HTTP ${contract.status}`);
    }

    for (const [role, credentials] of [['anon', anon], ['authenticated', authenticated]]) {
      const denied = await request('/rpc/kc_cadu_metadata_contract', {
        ...credentials,
        method: 'POST',
        body: {},
      });
      if (![401, 403, 404].includes(denied.status)) {
        fail(`${role} unexpectedly executed the contract probe (HTTP ${denied.status})`);
      }
      const directWrite = await request('/kc_unit_meta', {
        ...credentials,
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: { unit_id: PROOF_SOURCE_ID, tier: 1 },
      });
      if (![401, 403].includes(directWrite.status)) {
        fail(`${role} unexpectedly wrote metadata directly (HTTP ${directWrite.status})`);
      }
    }

    const rows = await request('/kc_unit_meta?select=unit_id,revision&order=unit_id.asc&limit=1000', service);
    if (rows.status !== 200 || !Array.isArray(rows.body)) fail('Unable to read the metadata revision snapshot.');
    const revisionSnapshot = Object.fromEntries(rows.body.map((row) => [row.unit_id, row.revision]));

    const createPayload = {
      p_source_id: PROOF_SOURCE_ID,
      p_tier: 1,
      p_note: 'PostgREST Phase-A proof',
      p_expected_exists: false,
      p_expected_revision: null,
      p_expected_meta_revisions: revisionSnapshot,
    };
    const created = await request('/rpc/kc_cadu_upsert_source_override', {
      ...service,
      method: 'POST',
      body: createPayload,
    });
    if (created.status !== 200 || !created.body || created.body.revision !== 1 || created.body.created !== true) {
      fail(`Named-argument stable CAS create failed with HTTP ${created.status}`);
    }

    const concurrentPayload = {
      ...createPayload,
      p_tier: 2,
      p_note: 'Concurrent CAS proof',
      p_expected_exists: true,
      p_expected_revision: 1,
      p_expected_meta_revisions: null,
    };
    const concurrent = await Promise.all([
      request('/rpc/kc_cadu_upsert_source_override', { ...service, method: 'POST', body: concurrentPayload }),
      request('/rpc/kc_cadu_upsert_source_override', { ...service, method: 'POST', body: concurrentPayload }),
    ]);
    const statuses = concurrent.map((item) => item.status).sort((a, b) => a - b);
    if (statuses[0] !== 200 || statuses[1] !== 412) {
      fail(`Concurrent CAS expected HTTP 200/412, received ${statuses.join('/')}`);
    }

    const shadowedLegacy = await request('/rpc/kc_cadu_upsert_legacy_override', {
      ...service,
      method: 'POST',
      body: {
        p_unit_id: 'POSTGREST-PHASE-A-PROOF',
        p_resolved_source_id: PROOF_SOURCE_ID,
        p_tier: 2,
        p_note: null,
        p_expected_exists: false,
        p_expected_revision: null,
      },
    });
    if (shadowedLegacy.status !== 409) {
      fail(`Stable-shadowed legacy write expected HTTP 409, received ${shadowedLegacy.status}`);
    }

    const finalRow = await request(`/kc_unit_meta?unit_id=eq.${encodeURIComponent(PROOF_SOURCE_ID)}&select=revision,tier`, service);
    if (finalRow.status !== 200 || !Array.isArray(finalRow.body) || finalRow.body.length !== 1 || finalRow.body[0].revision !== 2) {
      fail('The winning CAS update did not leave exactly revision 2.');
    }
  } catch (error) {
    primaryError = error;
  } finally {
    try { cleanup(container); } catch (cleanupError) {
      if (!primaryError) primaryError = cleanupError;
      else process.stderr.write(`Cleanup warning: ${cleanupError.message}\n`);
    }
  }

  if (primaryError) throw primaryError;
  process.stdout.write('Phase-A PostgREST role, named-argument and 409/412 CAS proof passed.\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
