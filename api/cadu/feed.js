// api/cadu/feed.js — proxy para cadu-api /api/feed (chunks do Cadu)
//
// Endpoint exposto: GET /api/cadu/feed?limit=N
// Param: limit (1..200, default 20)

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

  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '20', 10) || 20));

  try {
    const upstream = await fetch(`${apiUrl.replace(/\/$/, '')}/api/feed?limit=${limit}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'KinoCampus-Admin/1.0'
      },
      signal: AbortSignal.timeout(25000)
    });

    const text = await upstream.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'cadu_api_error', status: upstream.status, body });
    }

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60'); // feed muda mais
    return res.status(200).json(body);
  } catch (err) {
    return res.status(502).json({ error: 'cadu_api_unreachable', message: String(err && err.message ? err.message : err) });
  }
};