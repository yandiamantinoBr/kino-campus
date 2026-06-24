// KinoCampus — proxy Vercel: GET /api/cadu/pipeline → cadu-api
//
// Catch-all ([...path].js) só pega paths com pelo menos 1 segmento.
// Este handler cobre o "root" /api/cadu/pipeline (sem path).

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ detail: "Method Not Allowed" });

  const CADU_API_URL = process.env.CADU_API_URL || "";
  const CADU_API_TOKEN = process.env.CADU_API_TOKEN || "";
  if (!CADU_API_URL || !CADU_API_TOKEN) {
    return res.status(503).json({ ok: false, error: "CADU_API_URL/TOKEN not configured" });
  }

  const targetUrl = `${CADU_API_URL.replace(/\/$/, "")}/api/pipeline`;

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CADU_API_TOKEN}`,
        Accept: "application/json",
      },
    });
    const ct = upstream.headers.get("content-type") || "application/json";
    const body = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", ct).send(body);
  } catch (e) {
    res.status(502).json({ ok: false, error: `Upstream unreachable: ${e.message}` });
  }
}