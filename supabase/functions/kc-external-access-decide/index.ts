// KinoCampus -- Edge Function: kc-external-access-decide (v9.3.5.4)
//
// Decide uma solicitacao de acesso externo (help_requests com type=external_access).
// Endpoint: POST /functions/v1/kc-external-access-decide
// Body: { help_request_id: uuid, decision: 'approved'|'rejected', admin_note?: string }
// Auth: requer Bearer JWT de admin
//
// Fluxo:
//  1. Valida JWT do caller + is_admin via profile
//  2. Chama RPC kc_admin_decide_external_access (SECURITY DEFINER) que
//     valida ainda novamente e atualiza help_requests
//  3. Se approved -> auth.admin.inviteUserByEmail (SMTP NATIVO do Supabase
//     Auth -- nao precisa de Resend). Cria entry em auth.users com
//     metadata is_invited_external. Tambem upsert em kc_invited_emails
//     para a whitelist.
//  4. Se rejected -> envia e-mail via Resend SE configurado. Senao,
//     registra metadata.email_rejection_pending=true para reenvio futuro.
//
// Templates dos emails sao customizaveis em Auth > Email Templates no Supabase.

import { createClient } from "jsr:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_APP_BASE_URL = "https://www.kinocampus.com.br";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function getEnv(name: string, required = false) {
  const v = Deno.env.get(name)?.trim();
  if (!v && required) throw new Error(`missing_env:${name}`);
  return v || "";
}

function appBaseUrl() {
  return (getEnv("KC_APP_BASE_URL") || DEFAULT_APP_BASE_URL).replace(/\/+$/, "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function buildRejectionEmail(opts: {
  requesterName: string;
  adminNote: string | null;
  baseUrl: string;
}) {
  const subject = "KinoCampus -- Solicitação de acesso analisada";
  const greeting = opts.requesterName ? `Olá, ${escapeHtml(opts.requesterName)}!` : "Olá!";
  const noteBlock = opts.adminNote
    ? `<p><strong>Observação da equipe:</strong> ${escapeHtml(opts.adminNote)}</p>`
    : "";
  const html = `
    <div style="font-family:system-ui,sans-serif;color:#1f2937;line-height:1.55;max-width:560px">
      <h1 style="color:#ff6b00;font-size:1.4rem;margin:0 0 16px">KinoCampus -- Sobre sua solicitação</h1>
      <p>${greeting}</p>
      <p>Agradecemos o seu interesse na <strong>comunidade KinoCampus</strong>. Após análise,
      <strong>não conseguimos aprovar seu acesso neste momento</strong>.</p>
      ${noteBlock}
      <p>O KinoCampus prioriza acesso à comunidade UFG e perfis com vínculo institucional
      claramente identificável. Caso você obtenha um e-mail institucional UFG, poderá
      criar a sua conta diretamente em <a href="${escapeHtml(opts.baseUrl)}">${escapeHtml(opts.baseUrl)}</a>.</p>
      <p>Se acreditar que sua solicitação foi mal interpretada ou tiver mais contexto a
      compartilhar, responda este e-mail e nossa equipe analisará novamente.</p>
      <p style="color:#6b7280;font-size:0.85rem;margin-top:32px">
        Atenciosamente,<br/>Equipe KinoCampus
      </p>
    </div>
  `.trim();
  const text = [
    "KinoCampus -- Sobre sua solicitação",
    "",
    opts.requesterName ? `Olá, ${opts.requesterName}!` : "Olá!",
    "",
    "Agradecemos o seu interesse na comunidade KinoCampus. Após análise,",
    "não conseguimos aprovar seu acesso neste momento.",
    "",
    opts.adminNote ? `Observação da equipe: ${opts.adminNote}` : "",
    "",
    "O KinoCampus prioriza acesso à comunidade UFG e perfis com vínculo institucional.",
    "Caso obtenha um e-mail institucional UFG, poderá criar a sua conta em",
    opts.baseUrl,
    "",
    "Se acreditar que sua solicitação foi mal interpretada, responda este e-mail.",
    "",
    "Atenciosamente,",
    "Equipe KinoCampus",
  ].filter(Boolean).join("\n");
  return { subject, html, text };
}

async function sendRejectionViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  apiKey: string;
  from: string;
  replyTo?: string;
}) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  });
  const raw = await res.text();
  let body: JsonObject = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  // Envs essenciais
  let SUPABASE_URL = "";
  let ANON_KEY = "";
  let SERVICE_ROLE_KEY = "";
  try {
    SUPABASE_URL = getEnv("SUPABASE_URL", true);
    ANON_KEY = getEnv("SUPABASE_ANON_KEY", true);
    SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY", true);
  } catch (e) {
    console.error("[kc-external-access-decide] missing env:", e);
    return json(500, { ok: false, error: "missing_server_configuration" });
  }

  // 1. JWT do caller
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { ok: false, error: "missing_authorization" });
  }

  // Cliente em nome do caller -- usa RLS para validar admin via RPC
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return json(401, { ok: false, error: "invalid_session" });
  }

  // 2. Body
  let body: { help_request_id?: unknown; decision?: unknown; admin_note?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  const helpRequestId = String(body.help_request_id || "").toLowerCase().trim();
  const decision = String(body.decision || "").toLowerCase().trim();
  const adminNote = String(body.admin_note || "").trim() || null;

  if (!UUID_RE.test(helpRequestId)) {
    return json(400, { ok: false, error: "invalid_help_request_id" });
  }
  if (decision !== "approved" && decision !== "rejected") {
    return json(400, { ok: false, error: "invalid_decision" });
  }

  // 3. Chama RPC SECURITY DEFINER (valida is_admin + atualiza row)
  const { data: rpcData, error: rpcErr } = await userClient.rpc(
    "kc_admin_decide_external_access",
    { p_id: helpRequestId, p_decision: decision, p_note: adminNote },
  );
  if (rpcErr) {
    console.error("[kc-external-access-decide] rpc error:", rpcErr);
    const msg = rpcErr.message || "";
    if (msg.includes("not_authenticated")) return json(401, { ok: false, error: "not_authenticated" });
    if (msg.includes("not_authorized")) return json(403, { ok: false, error: "not_authorized" });
    if (msg.includes("not_found_or_not_pending")) return json(409, { ok: false, error: "already_decided" });
    return json(500, { ok: false, error: "rpc_failed", detail: msg });
  }
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row || !row.out_id) {
    return json(500, { ok: false, error: "empty_rpc_response" });
  }

  // Cliente admin (service role) para auth admin operations
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const requesterEmail = String(row.out_contact_email || "").toLowerCase().trim();
  const requesterName = String(row.out_requester_name || "").trim();
  const metadata = asObject(row.out_metadata);
  const baseUrl = appBaseUrl();

  // 4a. APROVADO: envia invite via SMTP NATIVO do Supabase Auth
  if (decision === "approved") {
    // Whitelist (permite que o usuario complete cadastro mesmo nao-institucional)
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error: whitelistErr } = await adminClient
      .from("kc_invited_emails")
      .upsert(
        { email: requesterEmail, invited_by: user.id, note: adminNote, expires_at: expiresAt, used_at: null },
        { onConflict: "email" },
      );
    if (whitelistErr) {
      console.error("[kc-external-access-decide] whitelist upsert error:", whitelistErr);
    }

    // Convite real via Supabase Auth (SMTP nativo)
    const redirectTo = `${baseUrl}/auth-callback.html`;
    const userMetadata = {
      is_invited_external: true,
      external_access_request_id: row.out_id,
      invited_by_admin_id: user.id,
      admin_note: adminNote,
    };

    let inviteSent = false;
    let inviteLink: string | null = null;
    let inviteSendError: string | null = null;

    // Tentativa 1: inviteUserByEmail (envia via SMTP)
    const inviteRes = await adminClient.auth.admin.inviteUserByEmail(requesterEmail, {
      redirectTo,
      data: userMetadata,
    });

    if (!inviteRes.error) {
      inviteSent = true;
    } else {
      const msg = String(inviteRes.error.message || "");
      const alreadyExists = msg.includes("already been registered") ||
                             msg.includes("already registered") ||
                             msg.includes("email_exists");
      if (alreadyExists) {
        // E-mail ja registrado: ok, segue (whitelist ja foi feita acima)
        inviteSent = true;
      } else {
        // SMTP falhou OU outro erro. Fallback: generateLink (nao depende de SMTP).
        inviteSendError = msg;
        console.warn("[kc-external-access-decide] inviteUserByEmail failed, falling back to generateLink:", msg);
        try {
          const linkRes = await adminClient.auth.admin.generateLink({
            type: "invite",
            email: requesterEmail,
            options: {
              redirectTo,
              data: userMetadata,
            },
          });
          if (!linkRes.error && linkRes.data) {
            // SDK retorna properties.action_link em alguns shapes
            const props = (linkRes.data as { properties?: { action_link?: string } }).properties;
            if (props && props.action_link) {
              inviteLink = props.action_link;
            }
          } else if (linkRes.error) {
            console.error("[kc-external-access-decide] generateLink also failed:", linkRes.error);
          }
        } catch (e) {
          console.error("[kc-external-access-decide] generateLink exception:", e);
        }

        // Se nem inviteUserByEmail nem generateLink funcionaram, retorna erro
        if (!inviteLink) {
          try {
            await adminClient.from("help_requests").update({
              metadata: {
                ...metadata,
                invite_email: {
                  status: "failed",
                  provider: "supabase_auth",
                  failed_at: new Date().toISOString(),
                  error_message: msg,
                },
              },
            }).eq("id", row.out_id);
          } catch (_) { /* noop */ }
          return json(502, { ok: false, error: "invite_email_failed", detail: msg });
        }
      }
    }

    // Registra status do envio em metadata
    const inviteMetaStatus = inviteSent
      ? {
          status: "sent",
          provider: "supabase_auth",
          sent_at: new Date().toISOString(),
          redirect_to: redirectTo,
        }
      : {
          status: "link_generated",
          provider: "supabase_auth_manual_send",
          generated_at: new Date().toISOString(),
          redirect_to: redirectTo,
          invite_link: inviteLink,
          smtp_error: inviteSendError,
          note: "SMTP nao configurado/falhou. Link de convite gerado para envio manual.",
        };

    try {
      await adminClient.from("help_requests").update({
        metadata: { ...metadata, invite_email: inviteMetaStatus },
      }).eq("id", row.out_id);
    } catch (e) {
      console.error("[kc-external-access-decide] metadata update error:", e);
    }

    return json(200, {
      ok: true,
      decision: "approved",
      help_request_id: row.out_id,
      invite_sent_to: requesterEmail,
      invite_sent: inviteSent,
      invite_link: inviteLink, // null se enviado por SMTP, URL se fallback manual
      smtp_error: inviteSendError,
      message: inviteSent
        ? "Convite enviado por e-mail via SMTP."
        : "Convite gerado (SMTP indisponivel). Copie o link e envie manualmente.",
    });
  }

  // 4b. REJEITADO: tenta enviar via Resend (se configurado); senao, registra para retry
  const provider = (getEnv("KC_NOTIFICATION_EMAIL_PROVIDER") || "").toLowerCase();
  const apiKey = getEnv("KC_NOTIFICATION_EMAIL_API_KEY");
  const from = getEnv("KC_NOTIFICATION_EMAIL_FROM");

  if (provider !== "resend" || !apiKey || !from) {
    // Resend nao configurado: registra status como "pending_provider_setup"
    try {
      await adminClient.from("help_requests").update({
        metadata: {
          ...metadata,
          rejection_email: {
            status: "pending_provider_setup",
            provider: "missing",
            queued_at: new Date().toISOString(),
            error_message: "Configure Resend para enviar e-mail de recusa automatico.",
          },
        },
      }).eq("id", row.out_id);
    } catch (_) { /* noop */ }
    return json(200, {
      ok: true,
      decision: "rejected",
      help_request_id: row.out_id,
      email_sent: false,
      reason: "email_provider_not_configured",
      message: "Solicitacao marcada como rejeitada. E-mail de recusa nao enviado porque Resend nao esta configurado.",
    });
  }

  const email = buildRejectionEmail({ requesterName, adminNote, baseUrl });
  const resendRes = await sendRejectionViaResend({
    to: requesterEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    apiKey,
    from,
    replyTo: getEnv("KC_NOTIFICATION_EMAIL_REPLY_TO") || "contato@kinocampus.com.br",
  });

  if (!resendRes.ok) {
    try {
      await adminClient.from("help_requests").update({
        metadata: {
          ...metadata,
          rejection_email: {
            status: "failed",
            provider: "resend",
            failed_at: new Date().toISOString(),
            response_code: String(resendRes.status),
            response_body: resendRes.body,
            error_message: `HTTP ${resendRes.status}`,
          },
        },
      }).eq("id", row.out_id);
    } catch (_) { /* noop */ }
    return json(502, {
      ok: false,
      error: "rejection_email_failed",
      decision: "rejected",
      help_request_id: row.out_id,
      detail: `HTTP ${resendRes.status}`,
    });
  }

  try {
    await adminClient.from("help_requests").update({
      metadata: {
        ...metadata,
        rejection_email: {
          status: "sent",
          provider: "resend",
          sent_at: new Date().toISOString(),
          to: requesterEmail,
        },
      },
    }).eq("id", row.out_id);
  } catch (e) {
    console.error("[kc-external-access-decide] metadata update error:", e);
  }

  return json(200, {
    ok: true,
    decision: "rejected",
    help_request_id: row.out_id,
    email_sent: true,
    sent_to: requesterEmail,
  });
});
