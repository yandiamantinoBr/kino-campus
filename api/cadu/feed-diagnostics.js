// api/cadu/feed-diagnostics.js - diagnostico read-only do feed publico para o painel Cadu.
//
// GET /api/cadu/feed-diagnostics?limit=80&rpcLimit=10&triageLimit=12
//
// Executa a mesma politica shadow usada pelo CLI `benchmark:feed-ranking-shadow`,
// mas protegida pelo gate admin de /api/cadu/* e sem escrita no Supabase.

import { createRequire } from 'module';
import { requireCaduAdmin } from '../../server/cadu-auth.mjs';

const require = createRequire(import.meta.url);
const Shadow = require('../../scripts/analyze-feed-ranking-shadow.js');

export const config = {
  maxDuration: 60,
};

function intParam(value, fallback, max) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Use GET' });
  }

  const admin = await requireCaduAdmin(req, res);
  if (!admin) return;

  const now = Array.isArray(req.query.now) ? req.query.now[0] : req.query.now;
  const options = {
    limit: intParam(req.query.limit, 80, 200),
    rpcLimit: intParam(req.query.rpcLimit || req.query.rpc_limit, 10, 50),
    triageLimit: intParam(req.query.triageLimit || req.query.triage_limit, 12, 50),
    modules: ['eventos', 'oportunidades'],
    statuses: ['published'],
    sortBys: req.query.noRpc === '1' ? [] : ['votos', 'recentes', 'comentados'],
    now: typeof now === 'string' && now ? now : new Date().toISOString(),
    envUrl: 'https://www.kinocampus.com.br/assets/js/boot/kc-env.js',
    supabaseUrl: process.env.KC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    anonKey: process.env.KC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  };

  try {
    const report = await Shadow.run(options);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ ok: true, report });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: 'feed_diagnostics_failed',
      message: String(error && error.message ? error.message : error),
    });
  }
}
