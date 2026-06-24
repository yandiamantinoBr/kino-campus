// api/cadu/sites.js — proxy para cadu-api /api/sites (VPS Hostinger)
//
// Autentica via Bearer token em CADU_API_TOKEN (env var do Vercel).
// Cache server-side: 5 minutos (cadu-api é o source of truth).
//
// Endpoint exposto: GET /api/cadu/sites
// Retorna: JSON array de SiteUnit (mesmo schema do cadu-api)
//
// ES module (api/package.json contém "type": "module").

export default async function handler(req, res) {
  // CORS permissivo dentro do domínio KinoCampus (admin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET' });
  }

  const apiUrl = process.env.CADU_API_URL;
  const token = process.env.CADU_API_TOKEN;

  if (!apiUrl || !token) {
    return res.status(503).json({
      error: 'cadu_api_not_configured',
      message: 'CADU_API_URL/CADU_API_TOKEN ausentes no servidor'
    });
  }

  try {
    const upstream = await fetch(`${apiUrl.replace(/\/$/, '')}/api/sites`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'KinoCampus-Admin/1.0'
      },
      // 25s timeout (Vercel serverless padrão é 10s pra hobby, 60s pro)
      signal: AbortSignal.timeout(25000)
    });

    const text = await upstream.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'cadu_api_error',
        status: upstream.status,
        body
      });
    }

    // Cache 5 min — cadu-api é o source of truth
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json(body);
  } catch (err) {
    return res.status(502).json({
      error: 'cadu_api_unreachable',
      message: String(err && err.message ? err.message : err)
    });
  }
}