// api/cadu/health.js — proxy para cadu-api /health
//
// Endpoint exposto: GET /api/cadu/health
// Sem auth, retorna liveness do cadu-api

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const apiUrl = process.env.CADU_API_URL;
  const token = process.env.CADU_API_TOKEN;
  if (!apiUrl || !token) {
    return res.status(503).json({ error: 'cadu_api_not_configured' });
  }

  try {
    const upstream = await fetch(`${apiUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'KinoCampus-Admin/1.0' },
      signal: AbortSignal.timeout(15000)
    });

    const text = await upstream.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    // mesmo status que upstream pra healthcheck ser honesto
    return res.status(upstream.status).json(body);
  } catch (err) {
    return res.status(502).json({ error: 'cadu_api_unreachable', message: String(err && err.message ? err.message : err) });
  }
};