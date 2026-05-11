// KinoCampus -- Edge Function: kc-external-access-decide (v9.3.5.5)
//
// Decide uma solicitação de acesso externo (help_requests.type=external_access).
// Endpoint: POST /functions/v1/kc-external-access-decide
// Body: { help_request_id: uuid, decision: 'approved'|'rejected', admin_note?: string }
// Auth: requer Bearer JWT de admin
//
// Fluxo:
//   1. Valida JWT do caller + chama RPC kc_admin_decide_external_access
//      (SECURITY DEFINER) que valida admin e atualiza help_requests.
//   2. Se APPROVED -> auth.admin.inviteUserByEmail (SMTP nativo do Auth,
//      configurado para usar Hostinger). Cria entry em auth.users com
//      metadata is_invited_external. Fallback: generateLink se SMTP falhar.
//   3. Se REJECTED -> envia e-mail via SMTP direto (denomailer + Hostinger).
//      Sem dependência de Resend.
//
// Env vars necessárias:
//   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto)
//   - KC_APP_BASE_URL (default: https://www.kinocampus.com.br)
//   - KC_SMTP_HOST, KC_SMTP_PORT, KC_SMTP_USER, KC_SMTP_PASS
//   - KC_SMTP_FROM_NAME, KC_SMTP_FROM_EMAIL
//   - KC_ADMIN_NOTIFICATION_EMAIL (para reply-to)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

type JsonObject = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_APP_BASE_URL = "https://www.kinocampus.com.br";
const DEFAULT_SMTP_HOST = "smtp.hostinger.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_FROM_NAME = "Kino Campus";
const DEFAULT_FROM_EMAIL = "contato@kinocampus.com.br";
const DEFAULT_ADMIN_EMAIL = "contato@kinocampus.com.br";

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

function getEnv(name: string, fallback = "") {
  return Deno.env.get(name)?.trim() || fallback;
}

function appBaseUrl() {
  return getEnv("KC_APP_BASE_URL", DEFAULT_APP_BASE_URL).replace(/\/+$/, "");
}

function escapeHtml(v: unknown) {
  return String(v ?? "")
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

function brandedHeader() {
  return `
    <div style="background:#ff6b00;border-radius:14px;padding:24px;text-align:center;color:#fff;margin-bottom:24px">
      <h1 style="margin:0;font-size:1.6rem;font-weight:800;letter-spacing:-0.02em">KinoCampus</h1>
      <p style="margin:6px 0 0;font-size:0.85rem;opacity:0.92;letter-spacing:0.15em;text-transform:uppercase">Comunidade UFG</p>
    </div>`;
}

function brandedFooter() {
  return `
    <p style="font-size:0.85rem;color:#6b7280;margin-top:32px">
      Equipe KinoCampus<br/>
      <a href="https://www.kinocampus.com.br" style="color:#ff6b00">www.kinocampus.com.br</a>
    </p>`;
}

function buildRejectionEmail(opts: { requesterName: string; adminNote: string | null; baseUrl: string }) {
  const subject = "KinoCampus — Sobre sua solicitação de acesso";
  const greeting = opts.requesterName ? `Olá, ${escapeHtml(opts.requesterName)}!` : "Olá!";
  const noteBlock = opts.adminNote
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;margin:14px 0"><strong>Observação da equipe:</strong> ${escapeHtml(opts.adminNote)}</div>`
    : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.55">
      ${brandedHeader()}
      <h2 style="color:#ff6b00;font-size:1.3rem;margin:0 0 12px">Sobre sua solicitação</h2>
      <p>${greeting}</p>
      <p>Agradecemos seu interesse na <strong>comunidade KinoCampus</strong>. Após análise, <strong>não conseguimos aprovar seu acesso neste momento</strong>.</p>
      ${noteBlock}
      <p>O KinoCampus prioriza acesso a perfis com vínculo institucional UFG. Caso você obtenha um e-mail institucional (<code>@ufg.br</code>, <code>@discente.ufg.br</code> ou <code>@egresso.ufg.br</code>), poderá criar sua conta diretamente em <a href="${escapeHtml(opts.baseUrl)}" style="color:#ff6b00">${escapeHtml(opts.baseUrl)}</a>.</p>
      <p>Se acreditar que sua solicitação foi mal interpretada, ou tiver mais contexto a compartilhar, basta responder este e-mail.</p>
      ${brandedFooter()}
    </div>`;

  const text = [
    "KinoCampus — Sobre sua solicitação",
    "",
    greeting,
    "",
    "Agradecemos seu interesse na comunidade KinoCampus. Após análise,",
    "não conseguimos aprovar seu acesso neste momento.",
    "",
    opts.adminNote ? `Observação da equipe: ${opts.adminNote}\n` : "",
    "O KinoCampus prioriza acesso a perfis com vínculo institucional UFG.",
    "Caso obtenha um e-mail UFG, poderá criar sua conta em " + opts.baseUrl,
    "",
    "Se acreditar que sua solicitação foi mal interpretada, responda este e-mail.",
    "",
    "Equipe KinoCampus",
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}

/**
 * Sanitize Subject header to pure ASCII (workaround for denomailer@1.6.0 bugs).
 * Strips diacritics, replaces special punctuation, drops residual non-ASCII.
 */
function encodeMimeSubject(subject: string): string {
  let s = String(subject || "");
  s = s
    .replace(/[—–]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ");
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[^\x20-\x7E]/g, "?");
  s = s.replace(/=\?/g, "= ?");
  return s;
}

async function getSmtpClient() {
  const host = getEnv("KC_SMTP_HOST", DEFAULT_SMTP_HOST);
  const port = Number(getEnv("KC_SMTP_PORT", String(DEFAULT_SMTP_PORT)));
  const user = getEnv("KC_SMTP_USER");
  const pass = getEnv("KC_SMTP_PASS");
  if (!user || !pass) throw new Error("missing_smtp_credentials");
  return new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: port === 465,
      auth: { username: user, password: pass },
    },
  });
}

async function sendEmail(opts: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  const fromName = getEnv("KC_SMTP_FROM_NAME", DEFAULT_FROM_NAME);
  const fromEmail = getEnv("KC_SMTP_FROM_EMAIL", DEFAULT_FROM_EMAIL);
  const client = await getSmtpClient();
  try {
    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: opts.to,
      subject: encodeMimeSubject(opts.subject),
      content: opts.text,
      html: opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  let SUPABASE_URL = "";
  let ANON_KEY = "";
  let SERVICE_ROLE_KEY = "";
  try {
    SUPABASE_URL = getEnv("SUPABASE_URL");
    ANON_KEY = getEnv("SUPABASE_ANON_KEY");
    SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) throw new Error("missing_env");
  } catch (e) {
    console.error("[kc-external-access-decide] missing env:", e);
    return json(500, { ok: false, error: "missing_server_configuration" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { ok: false, error: "missing_authorization" });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json(401, { ok: false, error: "invalid_session" });

  let body: { help_request_id?: unknown; decision?: unknown; admin_note?: unknown };
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const helpRequestId = String(body.help_request_id || "").toLowerCase().trim();
  const decision = String(body.decision || "").toLowerCase().trim();
  const adminNote = String(body.admin_note || "").trim() || null;
  if (!UUID_RE.test(helpRequestId)) return json(400, { ok: false, error: "invalid_help_request_id" });
  if (decision !== "approved" && decision !== "rejected") return json(400, { ok: false, error: "invalid_decision" });

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
  if (!row || !row.out_id) return json(500, { ok: false, error: "empty_rpc_response" });

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const requesterEmail = String(row.out_contact_email || "").toLowerCase().trim();
  const requesterName = String(row.out_requester_name || "").trim();
  const metadata = asObject(row.out_metadata);
  const baseUrl = appBaseUrl();

  // ── APROVADO: usa auth.admin.inviteUserByEmail (SMTP do Supabase Auth) ──
  if (decision === "approved") {
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error: whitelistErr } = await adminClient
      .from("kc_invited_emails")
      .upsert({ email: requesterEmail, invited_by: user.id, note: adminNote, expires_at: expiresAt, used_at: null }, { onConflict: "email" });
    if (whitelistErr) console.error("[kc-external-access-decide] whitelist upsert error:", whitelistErr);

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

    const inviteRes = await adminClient.auth.admin.inviteUserByEmail(requesterEmail, { redirectTo, data: userMetadata });

    if (!inviteRes.error) {
      inviteSent = true;
    } else {
      const msg = String(inviteRes.error.message || "");
      const alreadyExists = msg.includes("already been registered") || msg.includes("already registered") || msg.includes("email_exists");
      if (alreadyExists) {
        inviteSent = true;
      } else {
        inviteSendError = msg;
        console.warn("[kc-external-access-decide] inviteUserByEmail failed, fallback to generateLink:", msg);
        try {
          const linkRes = await adminClient.auth.admin.generateLink({ type: "invite", email: requesterEmail, options: { redirectTo, data: userMetadata } });
          if (!linkRes.error && linkRes.data) {
            const props = (linkRes.data as { properties?: { action_link?: string } }).properties;
            if (props && props.action_link) inviteLink = props.action_link;
          } else if (linkRes.error) {
            console.error("[kc-external-access-decide] generateLink also failed:", linkRes.error);
          }
        } catch (e) {
          console.error("[kc-external-access-decide] generateLink exception:", e);
        }
        if (!inviteLink) {
          try {
            await adminClient.from("help_requests").update({
              metadata: { ...metadata, invite_email: { status: "failed", provider: "supabase_auth", failed_at: new Date().toISOString(), error_message: msg } },
            }).eq("id", row.out_id);
          } catch (_) {}
          return json(502, { ok: false, error: "invite_email_failed", detail: msg });
        }
      }
    }

    const inviteMetaStatus = inviteSent
      ? { status: "sent", provider: "supabase_auth", sent_at: new Date().toISOString(), redirect_to: redirectTo }
      : { status: "link_generated", provider: "supabase_auth_manual_send", generated_at: new Date().toISOString(), redirect_to: redirectTo, invite_link: inviteLink, smtp_error: inviteSendError, note: "SMTP indisponível. Link gerado para envio manual." };

    try { await adminClient.from("help_requests").update({ metadata: { ...metadata, invite_email: inviteMetaStatus } }).eq("id", row.out_id); } catch (e) { console.error(e); }

    return json(200, {
      ok: true,
      decision: "approved",
      help_request_id: row.out_id,
      invite_sent_to: requesterEmail,
      invite_sent: inviteSent,
      invite_link: inviteLink,
      smtp_error: inviteSendError,
      message: inviteSent ? "Convite enviado via SMTP." : "Convite gerado. Copie o link e envie manualmente.",
    });
  }

  // ── REJEITADO: envia via SMTP direto (denomailer + Hostinger) ──
  const email = buildRejectionEmail({ requesterName, adminNote, baseUrl });
  const adminReplyTo = getEnv("KC_ADMIN_NOTIFICATION_EMAIL", DEFAULT_ADMIN_EMAIL);

  let rejectionResult: JsonObject;
  try {
    await sendEmail({
      to: requesterEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: adminReplyTo,
    });
    rejectionResult = {
      status: "sent",
      provider: "hostinger_smtp",
      to: requesterEmail,
      sent_at: new Date().toISOString(),
    };
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.error("[kc-external-access-decide] rejection send error:", msg);
    rejectionResult = {
      status: "failed",
      provider: "hostinger_smtp",
      to: requesterEmail,
      failed_at: new Date().toISOString(),
      error_message: msg,
    };
  }

  try {
    await adminClient.from("help_requests").update({
      metadata: { ...metadata, rejection_email: rejectionResult },
    }).eq("id", row.out_id);
  } catch (e) {
    console.error("[kc-external-access-decide] metadata update error:", e);
  }

  const sentOk = rejectionResult.status === "sent";
  return json(sentOk ? 200 : 502, {
    ok: sentOk,
    decision: "rejected",
    help_request_id: row.out_id,
    email_sent: sentOk,
    sent_to: requesterEmail,
    error: sentOk ? undefined : "rejection_email_failed",
  });
});
