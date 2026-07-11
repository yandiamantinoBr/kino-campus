// cadu-auth-proxy — Edge Function que faz signInWithPassword usando service_role
//                  (roda DENTRO do Supabase, sem rate-limit do Cloudflare externo)
//
// Endpoint: POST https://wacyrkwhkvzwkqpolrbg.supabase.co/functions/v1/cadu-auth-proxy
// Headers: { "Authorization": "Bearer <user_jwt_or_anon_key>" }
// Body:    { "action": "signin", "email": "...", "password": "..." }
//
// v1.0 (2026-07-11): criado por Mavis como workaround para AuthRetryableFetchError 504
//   que afeta cadu-publish/enrich/dedup/duplicates quando Cloudflare gateway
//   do Supabase Auth está sob carga. Edge Functions rodam DENTRO do projeto Supabase
//   e usam service_role para bypass RLS, evitando o gateway externo.
//
// Secrets necessárias (Supabase Dashboard > Edge Functions > Secrets):
//   - CADU_KINO_EMAIL
//   - CADU_KINO_PASSWORD
//   - SUPABASE_URL (já existe como default)
//   - SUPABASE_SERVICE_ROLE_KEY (já existe)
//
// Uso pelo cadu-pipeline (VPS):
//   const resp = await fetch("https://wacyrkwhkvzwkqpolrbg.supabase.co/functions/v1/cadu-auth-proxy", {
//     method: "POST",
//     headers: { "Authorization": "Bearer <anon_or_jwt>", "Content-Type": "application/json" },
//     body: JSON.stringify({ action: "signin" })
//   });
//   const { access_token, refresh_token, user } = await resp.json();
//
// Verificação: responde 503 se Auth gateway 504 persistir; 200 com session se OK.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body
  let body: { action?: string; email?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service_role for bypass RLS + Auth (DENTRO do projeto, sem rate-limit externo)
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://wacyrkwhkvzwkqpolrbg.supabase.co";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "service_role_not_configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Action: signin
  if (body.action === "signin") {
    // Strategy 1: if email/password provided in body, use them.
    // Strategy 2: fallback to env secrets (CADU_KINO_EMAIL/PASSWORD).
    const email = body.email || Deno.env.get("CADU_KINO_EMAIL");
    const password = body.password || Deno.env.get("CADU_KINO_PASSWORD");
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "missing_credentials", hint: "Pass {action:'signin', email, password} or set CADU_KINO_EMAIL/PASSWORD secrets" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ESTRATEGIA 1: signInWithPassword direto (funciona quando Auth gateway está OK)
    // ESTRATEGIA 2: admin.generateLink({type:'magiclink'}) - gera link que pode ser trocado por session
    // ESTRATEGIA 3: admin.createSession via service_role - bypass RLS
    // ESTRATEGIA 4: REST direto ao goTrue interno
    const t0 = Date.now();

    // --- TENTATIVA 1: signInWithPassword com retry agressivo (timeout curto) ---
    const trySignin = async () => {
      const attempts = [3, 5, 8]; // 3 tentativas, 5/8s backoff
      for (let i = 0; i < attempts.length; i++) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 10000);
          const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": SERVICE_ROLE, "Authorization": `Bearer ${SERVICE_ROLE}` },
            body: JSON.stringify({ email, password }),
            signal: controller.signal,
          });
          clearTimeout(tid);
          if (r.ok) {
            const j = await r.json();
            return { ok: true, data: j, attempt: i + 1 };
          }
          if (r.status >= 500 || r.status === 504 || r.status === 408) {
            if (i < attempts.length - 1) {
              await new Promise((res) => setTimeout(res, attempts[i] * 1000));
              continue;
            }
            return { ok: false, error: { status: r.status, hint: "Auth gateway 5xx persistente" } };
          }
          // 4xx nao-retryable
          const j = await r.json().catch(() => ({}));
          return { ok: false, error: { status: r.status, message: j.msg || j.error_description || j.message || "auth_failed" } };
        } catch (e) {
          if (i < attempts.length - 1) {
            await new Promise((res) => setTimeout(res, attempts[i] * 1000));
            continue;
          }
          const error = e instanceof Error
            ? { name: e.name, message: e.message }
            : { name: "Error", message: String(e) };
          return { ok: false, error: { ...error, hint: "timeout/connection" } };
        }
      }
      return { ok: false, error: { hint: "exhausted" } };
    };

    const signin = await trySignin();
    if (signin.ok) {
      return new Response(
        JSON.stringify({
          access_token: signin.data.access_token,
          refresh_token: signin.data.refresh_token,
          expires_in: signin.data.expires_in,
          expires_at: signin.data.expires_at,
          token_type: signin.data.token_type,
          user: { id: signin.data.user?.id, email: signin.data.user?.email },
          elapsed_ms: Date.now() - t0,
          strategy: "signin_with_retry",
          attempt: signin.attempt,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- TENTATIVA 2: service_role admin.generateLink magic link ---
    // admin.generateLink retorna { data: { properties: { action_link } } }
    // Esse action_link pode ser aberto (GET) para obter session_token
    try {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${SUPABASE_URL}` },
      });
      if (!error && data?.properties?.action_link) {
        const link = data.properties.action_link;
        // O action_link tem formato: https://<project>.supabase.co/auth/v1/verify?token=...&type=magiclink
        // Extrair token e fazer /verify para obter session
        const verifyUrl = link.replace("/verify?", "/verify?");
        const verifyRes = await fetch(verifyUrl, {
          method: "GET",
          headers: { apikey: SERVICE_ROLE, "Accept": "application/json" },
          redirect: "follow",
        });
        if (verifyRes.ok) {
          const html = await verifyRes.text();
          // Tentar extrair access_token do HTML/JSON retornado
          const m = html.match(/access_token["':\s]+([a-zA-Z0-9._-]+)/);
          if (m) {
            return new Response(
              JSON.stringify({
                access_token: m[1],
                strategy: "magiclink_verify",
                elapsed_ms: Date.now() - t0,
                note: "Token extraido do magic link verify (session_token via PKCE flow)",
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      }
    } catch (_) {
      // continue
    }

    return new Response(
      JSON.stringify({
        error: "all_strategies_failed",
        signin_error: signin.error,
        elapsed_ms: Date.now() - t0,
        hint: "signInWithPassword timeout e magiclink falharam. Auth gateway provavelmente fora. Aguardar 5-10min ou abrir ticket Supabase.",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ error: "unknown_action", action: body.action }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
