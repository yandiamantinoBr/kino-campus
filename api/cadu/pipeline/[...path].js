// KinoCampus — proxy Vercel (catch-all): /api/cadu/pipeline/* → cadu-api (VPS)
//
// Pega sub-paths: /run, /<run-id>, /<run-id>/stop, /<run-id>/stream
// O handler raiz `pipeline.js` cobre só o GET /api/cadu/pipeline (status geral).
//
// IMPORTANTE: SSE (GET /api/cadu/pipeline/:id/stream) NÃO funciona em
// Vercel serverless (timeout 10-60s). O cliente (admin/cadu.html)
// faz SSE direto pro cadu-api via Traefik do VPS.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const CADU_API_URL = process.env.CADU_API_URL || "";
  const CADU_API_TOKEN = process.env.CADU_API_TOKEN || "";
  if (!CADU_API_URL || !CADU_API_TOKEN) {
    return res.status(503).json({ ok: false, error: "CADU_API_URL/TOKEN not configured" });
  }

  // req.query.path é array dos segmentos depois de /api/cadu/pipeline/
  // Ex: /api/cadu/pipeline/run → path = ["run"]
  //     /api/cadu/pipeline/abc/stop → path = ["abc", "stop"]
  const subPath = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
  const targetUrl = `${CADU_API_URL.replace(/\/$/, "")}/api/pipeline${subPath ? "/" + subPath : ""}`;
  console.log(`[api/cadu/pipeline/*] ${req.method} path=${JSON.stringify(req.query.path)} url=${req.url} -> ${targetUrl}`);
  console.log(`[api/cadu/pipeline/*] ${req.method} path=${JSON.stringify(req.query.path)} → ${targetUrl}`);

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${CADU_API_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body || {}) : undefined,
    });
    const ct = upstream.headers.get("content-type") || "application/json";
    const body = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", ct).send(body);
  } catch (e) {
    res.status(502).json({ ok: false, error: `Upstream unreachable: ${e.message}` });
  }
}