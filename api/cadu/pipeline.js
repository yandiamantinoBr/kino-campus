// KinoCampus — proxy Edge: /api/cadu/pipeline[/*] → cadu-api (VPS)
//
// Edge Function (Vercel runtime='edge') para suportar streaming SSE sem
// o timeout curto do Node serverless (~10s). Edge functions têm streaming
// nativo via Response body ReadableStream.
//
// Cobre tanto o "root" /api/cadu/pipeline quanto sub-paths:
//   - POST /api/cadu/pipeline/run          → cria run
//   - POST /api/cadu/pipeline/{id}/stop    → mata subprocess
//   - GET  /api/cadu/pipeline/{id}/stream  → SSE ao vivo (esse é o caso crítico)
//   - GET  /api/cadu/pipeline/{id}         → status
//   - GET  /api/cadu/pipeline/runs         → histórico

export const config = {
  runtime: "edge",
};

const CADU_API_URL = process.env.CADU_API_URL || "";
const CADU_API_TOKEN = process.env.CADU_API_TOKEN || "";

export default async function handler(req) {
  // CORS preflight (Edge runtime usa Web Request API)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (!CADU_API_URL || !CADU_API_TOKEN) {
    return new Response(
      JSON.stringify({ ok: false, error: "CADU_API_URL/TOKEN not configured" }),
      { status: 503, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  // Extrai sub-path: req.url vem completo (ex: "/api/cadu/pipeline/{id}/stream")
  const url = new URL(req.url);
  const subPath = url.pathname.replace(/^\/api\/cadu\/pipeline\/?/, "").replace(/^\//, "");

  // Detecta SSE: GET + path contém "/stream" no final
  const isSSE = req.method === "GET" && subPath.endsWith("/stream");

  // Monta URL upstream
  const targetUrl = `${CADU_API_URL.replace(/\/$/, "")}/api/pipeline${subPath ? "/" + subPath : ""}${url.search || ""}`;

  console.log(`[api/cadu/pipeline edge] ${req.method} ${subPath || "(root)"} isSSE=${isSSE} → ${targetUrl.replace(CADU_API_TOKEN, "***")}`);

  try {
    // SSE: faz streaming do upstream body pro browser sem buffering
    if (isSSE) {
      const upstream = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${CADU_API_TOKEN}`,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
      if (!upstream.ok || !upstream.body) {
        const errBody = await upstream.text().catch(() => "");
        return new Response(errBody || JSON.stringify({ error: "upstream failed" }), {
          status: upstream.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      // Passa o stream direto. Edge runtime suporta ReadableStream como body de Response.
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }

    // Non-SSE: fetch normal + repassa body
    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await req.text();
      } catch (e) {
        body = "";
      }
    }
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${CADU_API_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body || undefined,
    });
    const ct = upstream.headers.get("content-type") || "application/json";
    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": ct,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: `Upstream unreachable: ${e.message}` }),
      { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}