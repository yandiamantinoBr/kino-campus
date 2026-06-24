// api/cadu/publish.js — proxy para cadu-api POST /api/publish (VPS Hostinger)
//
// Recebe um site sugerido pelo admin Cadu e dispara a publicação no feed KinoCampus.
// O cadu-api usa o CADU_PUBLISH_TOKEN pra chamar o KinoCampus publish endpoint
// (services/cadu-ufg-publisher ou supabase/functions/cadu-publish).
//
// Endpoint exposto: POST /api/cadu/publish
// Body: { name, url, instagram?, note?, tier?, category?, source? }
// Auth: Bearer com CADU_API_TOKEN (mesma chave dos outros endpoints).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST' });

  const apiUrl = process.env.CADU_API_URL;
  const token = process.env.CADU_API_TOKEN;
  if (!apiUrl || !token) {
    return res.status(503).json({ error: 'cadu_api_not_configured', message: 'CADU_API_URL/CADU_API_TOKEN ausentes' });
  }

  // Validação mínima do body — cadu-api vai validar melhor
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!body.name || typeof body.name !== 'string') {
    return res.status(400).json({ error: 'invalid_body', message: 'Campo "name" é obrigatório' });
  }
  if (!body.url || typeof body.url !== 'string' || !/^https?:\/\//i.test(body.url)) {
    return res.status(400).json({ error: 'invalid_body', message: 'Campo "url" deve ser uma URL http(s)' });
  }

  try {
    const upstream = await fetch(`${apiUrl.replace(/\/$/, '')}/api/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'KinoCampus-Admin/1.0'
      },
      body: JSON.stringify({
        name: body.name.trim(),
        url: body.url.trim(),
        instagram: body.instagram || null,
        note: body.note || null,
        tier: body.tier || null,
        category: body.category || null,
        source: body.source || 'cadu-admin'
      }),
      signal: AbortSignal.timeout(30000)
    });

    const text = await upstream.text();
    let respBody;
    try { respBody = JSON.parse(text); } catch { respBody = { raw: text }; }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'cadu_api_error',
        status: upstream.status,
        body: respBody
      });
    }

    return res.status(200).json(respBody);
  } catch (err) {
    return res.status(502).json({
      error: 'cadu_api_unreachable',
      message: String(err && err.message ? err.message : err)
    });
  }
}
