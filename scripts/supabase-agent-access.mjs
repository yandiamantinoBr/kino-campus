#!/usr/bin/env node
/**
 * Agent helper: Supabase access via Management PAT + MCP (no browser).
 *
 * Usage:
 *   node scripts/supabase-agent-access.mjs doctor
 *   node scripts/supabase-agent-access.mjs sql "select count(*) from posts"
 *   node scripts/supabase-agent-access.mjs tables
 *   node scripts/supabase-agent-access.mjs rest posts?select=id&limit=3
 *
 * Requires user env: SUPABASE_ACCESS_TOKEN (sbp_...)
 * Optional: KC_SUPABASE_* in .env for PostgREST service_role path
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'wacyrkwhkvzwkqpolrbg';

function loadEnv() {
  const p = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const fileEnv = loadEnv();
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MCP_TOKEN;
const projectUrl = fileEnv.KC_SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const serviceKey = fileEnv.KC_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = fileEnv.KC_SUPABASE_ANON_KEY;

function httpJson(hostname, reqPath, method, headers, bodyObj) {
  const body = bodyObj == null ? null : JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: reqPath,
        method,
        headers: {
          ...headers,
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {}),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => {
          d += c;
        });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withMcp(fn) {
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN missing in environment');
  const mcpPath = `/mcp?project_ref=${PROJECT_REF}`;
  const post = (payload, session) =>
    httpJson(
      'mcp.supabase.com',
      mcpPath,
      'POST',
      {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, text/event-stream',
        ...(session ? { 'mcp-session-id': session } : {}),
      },
      payload,
    );

  const init = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'supabase-agent-access', version: '1' },
    },
  });
  const session = init.headers['mcp-session-id'];
  if (!session) throw new Error(`MCP init failed: ${init.body}`);
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session);

  const tool = async (name, args = {}) => {
    const r = await post(
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args },
      },
      session,
    );
    const parsed = JSON.parse(r.body);
    if (parsed.error) throw new Error(JSON.stringify(parsed.error));
    const text = parsed.result?.content?.map((c) => c.text || '').join('\n') || r.body;
    if (parsed.result?.isError) throw new Error(text);
    return text;
  };

  return fn({ tool, session });
}

async function doctor() {
  const out = { projectRef: PROJECT_REF, token: Boolean(token), projectUrl };
  if (token) {
    const proj = await httpJson(
      'api.supabase.com',
      `/v1/projects/${PROJECT_REF}`,
      'GET',
      { Authorization: `Bearer ${token}` },
    );
    out.mgmtProject = { status: proj.status, name: (() => {
      try { return JSON.parse(proj.body).name; } catch { return null; }
    })() };
    out.mcp = await withMcp(async ({ tool }) => {
      const tables = await tool('list_tables', { schemas: ['public'] });
      const sql = await tool('execute_sql', { query: 'select count(*)::int as posts from public.posts' });
      return { tablesPreview: tables.slice(0, 180), sqlPreview: sql.slice(0, 180) };
    });
  }
  if (serviceKey) {
    const r = await httpJson(
      new URL(projectUrl).hostname,
      '/rest/v1/posts?select=id&limit=1',
      'GET',
      { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    );
    out.restService = { status: r.status };
  }
  if (anonKey) {
    const r = await httpJson(
      new URL(projectUrl).hostname,
      '/rest/v1/posts?select=id&limit=1',
      'GET',
      { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    );
    out.restAnon = { status: r.status };
  }
  console.log(JSON.stringify(out, null, 2));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'doctor') return doctor();
  if (cmd === 'sql') {
    const query = rest.join(' ').trim();
    if (!query) throw new Error('sql requires a query');
    const text = await withMcp(({ tool }) => tool('execute_sql', { query }));
    console.log(text);
    return;
  }
  if (cmd === 'tables') {
    const text = await withMcp(({ tool }) => tool('list_tables', { schemas: ['public'] }));
    console.log(text);
    return;
  }
  if (cmd === 'rest') {
    if (!serviceKey) throw new Error('KC_SUPABASE_SERVICE_ROLE_KEY missing in .env');
    const restPath = '/' + (rest.join(' ').replace(/^\//, '') || 'rest/v1/posts?select=id&limit=3');
    const pathName = restPath.startsWith('/rest/') ? restPath : `/rest/v1/${restPath}`;
    const r = await httpJson(
      new URL(projectUrl).hostname,
      pathName,
      'GET',
      { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    );
    console.log(r.status, r.body);
    return;
  }
  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
