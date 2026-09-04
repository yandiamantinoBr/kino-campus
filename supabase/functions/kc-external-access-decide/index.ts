// KinoCampus -- Edge Function: kc-external-access-decide (v9.3.5.6)
//
// Decide uma solicitação de acesso externo (help_requests.type=external_access).
// Endpoint: POST /functions/v1/kc-external-access-decide
// Body: { help_request_id: uuid, decision: 'approved'|'rejected', admin_note?: string }
// Auth: requer Bearer JWT de admin
//
// Fluxo:
//   1. Valida JWT do caller + chama RPC atômica de decisão/claim. Somente
//      o claim persistido pode executar e concluir o efeito externo.
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
import { isCurrentSessionActive } from "../_shared/active-session.ts";
import {
  BoundedRequestBodyError,
  readBoundedRequestText,
} from "../_shared/bounded-request-body.ts";

type JsonObject = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_APP_BASE_URL = "https://www.kinocampus.com.br";
const DEFAULT_SMTP_HOST = "smtp.hostinger.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_FROM_NAME = "Kino Campus";
const DEFAULT_FROM_EMAIL = "contato@kinocampus.com.br";
const DEFAULT_ADMIN_EMAIL = "contato@kinocampus.com.br";
const MAX_REQUEST_BODY_BYTES = 8 * 1024;

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

function safeErrorCode(error: unknown, fallback: string) {
  const code = String(asObject(error).code || "").trim().toUpperCase();
  return /^[A-Z0-9_]{1,80}$/.test(code) ? code : fallback;
}

function brandedHeader() {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff4ec;border-radius:14px;padding:20px 24px;margin-bottom:24px">
      <tr>
        <td style="width:48px;vertical-align:middle">
          <table role="presentation" cellspacing="0" cellpadding="0" style="width:44px;height:44px;background:#FF6B00;border-radius:12px"><tr><td align="center" valign="middle">
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block"><path fill="#ffffff" d="M12 3.2 2.4 19.6c-.3.55.08 1.2.7 1.2h5.1l2.75-4.9c.45-.8 1.6-.8 2.05 0l2.75 4.9h5.1c.62 0 1-.65.7-1.2L12 3.2z"/></svg>
          </td></tr></table>
        </td>
        <td style="vertical-align:middle;padding-left:14px">
          <div style="font-size:1.45rem;font-weight:900;letter-spacing:-0.02em;line-height:1.1">
            <span style="color:#FF6B00">Kino</span><span style="color:#1a1a1a">Campus</span>
          </div>
          <div style="font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;margin-top:3px">Comunidade UFG</div>
        </td>
      </tr>
    </table>`;
}

function brandedFooter() {
  return `
    <p style="font-size:0.85rem;color:#6b7280;margin-top:32px">
      Equipe KinoCampus<br/>
      <a href="https://www.kinocampus.com.br" style="color:#ff6b00">www.kinocampus.com.br</a>
    </p>`;
}

function buildRejectionEmail(opts: { requesterName: string; baseUrl: string }) {
  const subject = "KinoCampus — Sobre sua solicitação de acesso";
  const greeting = opts.requesterName ? `Olá, ${escapeHtml(opts.requesterName)}!` : "Olá!";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.55">
      ${brandedHeader()}
      <h2 style="color:#ff6b00;font-size:1.3rem;margin:0 0 12px">Sobre sua solicitação</h2>
      <p>${greeting}</p>
      <p>Agradecemos seu interesse na <strong>comunidade KinoCampus</strong>. Após análise, <strong>não conseguimos aprovar seu acesso neste momento</strong>.</p>
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
  if (!(await isCurrentSessionActive(userClient))) {
    return json(401, { ok: false, error: "SESSION_NOT_ACTIVE" });
  }

  let body: { help_request_id?: unknown; decision?: unknown; admin_note?: unknown };
  try {
    const rawBody = await readBoundedRequestText(req, MAX_REQUEST_BODY_BYTES);
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not-object");
    }
    body = parsed;
  } catch (error) {
    if (
      error instanceof BoundedRequestBodyError &&
      error.code === "BODY_TOO_LARGE"
    ) {
      return json(413, { ok: false, error: "body_too_large" });
    }
    return json(400, { ok: false, error: "invalid_json" });
  }

  const helpRequestId = String(body.help_request_id || "").toLowerCase().trim();
  const decision = String(body.decision || "").toLowerCase().trim();
  const adminNote = String(body.admin_note || "").trim() || null;
  if (!UUID_RE.test(helpRequestId)) return json(400, { ok: false, error: "invalid_help_request_id" });
  if (decision !== "approved" && decision !== "rejected") return json(400, { ok: false, error: "invalid_decision" });
  if (adminNote && adminNote.length > 500) return json(400, { ok: false, error: "admin_note_too_long" });

  const deliveryClaimId = crypto.randomUUID();
  const { data: rpcData, error: rpcErr } = await userClient.rpc(
    "kc_admin_claim_external_access_delivery",
    {
      p_id: helpRequestId,
      p_decision: decision,
      p_note: adminNote,
      p_claim_id: deliveryClaimId,
    },
  );
  if (rpcErr) {
    const msg = rpcErr.message || "";
    if (msg.includes("not_authenticated")) return json(401, { ok: false, error: "not_authenticated" });
    if (msg.includes("not_authorized")) return json(403, { ok: false, error: "not_authorized" });
    if (msg.includes("not_found_or_not_pending")) return json(409, { ok: false, error: "already_decided" });
    console.error("[kc-external-access-decide] rpc failed", {
      code: safeErrorCode(rpcErr, "RPC_FAILED"),
    });
    return json(500, { ok: false, error: "rpc_failed" });
  }
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row || !row.out_id) return json(500, { ok: false, error: "empty_rpc_response" });

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const requesterEmail = String(row.out_contact_email || "").toLowerCase().trim();
  const requesterName = String(row.out_requester_name || "").trim();
  const metadata = asObject(row.out_metadata);
  const baseUrl = appBaseUrl();
  const deliveryKey = decision === "approved" ? "invite_email" : "rejection_email";
  const previousDelivery = asObject(metadata[deliveryKey]);
  const previousStatus = String(previousDelivery.status || "");
  const persistedClaimId = String(previousDelivery.claim_id || "");

  async function completeDelivery(delivery: JsonObject) {
    const { data, error } = await adminClient.rpc(
      "kc_complete_external_access_delivery",
      {
        p_id: row.out_id,
        p_decision: decision,
        p_claim_id: deliveryClaimId,
        p_delivery: delivery,
      },
    );
    if (error) {
      console.error("[kc-external-access-decide] delivery completion failed", {
        code: safeErrorCode(error, "DELIVERY_COMPLETION_FAILED"),
      });
      return false;
    }
    return data === true;
  }

  // Terminal results are replayed without delivery. A different in-flight
  // claim also returns without sending, which closes the concurrent-click race.
  if (["sent", "link_generated", "failed"].includes(previousStatus)) {
    const storedErrorCode = String(previousDelivery.error_code || "")
      .trim()
      .toUpperCase();
    const previousError = /^[A-Z0-9_]{1,80}$/.test(storedErrorCode)
      ? storedErrorCode
      : (previousStatus === "failed" || previousStatus === "link_generated"
        ? "DELIVERY_PROVIDER_FAILED"
        : null);
    return json(200, {
      ok: true,
      decision,
      decision_persisted: true,
      replayed: true,
      delivery_status: previousStatus,
      help_request_id: row.out_id,
      invite_sent: decision === "approved" && previousStatus === "sent",
      invite_sent_to: decision === "approved" ? requesterEmail : undefined,
      invite_link: decision === "approved" && previousStatus === "link_generated"
        ? String(previousDelivery.invite_link || "")
        : null,
      smtp_error: previousError,
      email_sent: decision === "rejected" && previousStatus === "sent",
      sent_to: decision === "rejected" ? requesterEmail : undefined,
    });
  }

  if (previousStatus === "processing" && persistedClaimId !== deliveryClaimId) {
    return json(200, {
      ok: true,
      decision,
      decision_persisted: true,
      replayed: true,
      delivery_status: "processing",
      help_request_id: row.out_id,
      invite_sent: decision === "approved" ? false : undefined,
      invite_sent_to: decision === "approved" ? requesterEmail : undefined,
      email_sent: decision === "rejected" ? false : undefined,
      sent_to: decision === "rejected" ? requesterEmail : undefined,
      message: "A decisão já foi registrada e a entrega está em processamento.",
    });
  }

  if (previousStatus !== "processing" || persistedClaimId !== deliveryClaimId) {
    console.error("[kc-external-access-decide] delivery claim missing", {
      decision,
      previousStatus,
    });
    return json(500, {
      ok: false,
      error: "delivery_claim_missing",
      decision_persisted: true,
    });
  }

  // ── APROVADO: usa auth.admin.inviteUserByEmail (SMTP do Supabase Auth) ──
  if (decision === "approved") {
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error: whitelistErr } = await adminClient
      .from("kc_invited_emails")
      .upsert({ email: requesterEmail, invited_by: user.id, note: null, expires_at: expiresAt, used_at: null }, { onConflict: "email" });
    if (whitelistErr) {
      const errorCode = safeErrorCode(
        whitelistErr,
        "WHITELIST_UPSERT_FAILED",
      );
      console.error("[kc-external-access-decide] whitelist upsert failed", {
        code: errorCode,
      });
      const failure = {
        status: "failed",
        provider: "supabase_auth",
        failed_at: new Date().toISOString(),
        error_code: errorCode,
      };
      const deliveryStatePersisted = await completeDelivery(failure);
      return json(200, {
        ok: true,
        decision: "approved",
        decision_persisted: true,
        delivery_status: "failed",
        delivery_state_persisted: deliveryStatePersisted,
        help_request_id: row.out_id,
        invite_sent_to: requesterEmail,
        invite_sent: false,
        invite_link: null,
        smtp_error: errorCode,
        message: "Solicitação aprovada, mas o convite não pôde ser preparado.",
      });
    }

    const redirectTo = `${baseUrl}/auth-callback.html`;
    const userMetadata = {
      is_invited_external: true,
      external_access_request_id: row.out_id,
      invited_by_admin_id: user.id,
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
        inviteSendError = safeErrorCode(
          inviteRes.error,
          "INVITE_EMAIL_PROVIDER_FAILED",
        );
        console.warn(
          "[kc-external-access-decide] invite email failed; trying manual link",
          { code: inviteSendError },
        );
        try {
          const linkRes = await adminClient.auth.admin.generateLink({ type: "invite", email: requesterEmail, options: { redirectTo, data: userMetadata } });
          if (!linkRes.error && linkRes.data) {
            const props = (linkRes.data as { properties?: { action_link?: string } }).properties;
            if (props && props.action_link) inviteLink = props.action_link;
          } else if (linkRes.error) {
            inviteSendError = safeErrorCode(
              linkRes.error,
              "INVITE_LINK_PROVIDER_FAILED",
            );
            console.error(
              "[kc-external-access-decide] manual invite link failed",
              { code: inviteSendError },
            );
          }
        } catch {
          inviteSendError = "INVITE_LINK_PROVIDER_FAILED";
          console.error(
            "[kc-external-access-decide] manual invite link failed",
            { code: inviteSendError },
          );
        }
        if (!inviteLink) {
          const failedDelivery = {
            status: "failed",
            provider: "supabase_auth",
            failed_at: new Date().toISOString(),
            error_code: inviteSendError || "INVITE_PROVIDER_FAILED",
          };
          const deliveryStatePersisted = await completeDelivery(failedDelivery);
          return json(200, {
            ok: true,
            decision: "approved",
            decision_persisted: true,
            delivery_status: "failed",
            delivery_state_persisted: deliveryStatePersisted,
            help_request_id: row.out_id,
            invite_sent_to: requesterEmail,
            invite_sent: false,
            invite_link: null,
            smtp_error: failedDelivery.error_code,
            message: "Solicitação aprovada, mas o convite não foi entregue.",
          });
        }
      }
    }

    const inviteMetaStatus = inviteSent
      ? { status: "sent", provider: "supabase_auth", sent_at: new Date().toISOString(), redirect_to: redirectTo }
      : { status: "link_generated", provider: "supabase_auth_manual_send", generated_at: new Date().toISOString(), redirect_to: redirectTo, invite_link: inviteLink, error_code: inviteSendError, note: "SMTP indisponível. Link gerado para envio manual." };

    const deliveryStatePersisted = await completeDelivery(inviteMetaStatus);

    return json(200, {
      ok: true,
      decision: "approved",
      decision_persisted: true,
      delivery_status: inviteSent ? "sent" : "link_generated",
      delivery_state_persisted: deliveryStatePersisted,
      help_request_id: row.out_id,
      invite_sent_to: requesterEmail,
      invite_sent: inviteSent,
      invite_link: inviteLink,
      smtp_error: inviteSendError,
      message: deliveryStatePersisted
        ? (inviteSent ? "Convite enviado via SMTP." : "Convite gerado. Copie o link e envie manualmente.")
        : "A entrega foi executada, mas o resultado não pôde ser confirmado no histórico. Revise o item em processamento.",
    });
  }

  // ── REJEITADO: envia via SMTP direto (denomailer + Hostinger) ──
  const email = buildRejectionEmail({ requesterName, baseUrl });
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
      sent_at: new Date().toISOString(),
    };
  } catch (e) {
    const errorCode = safeErrorCode(e, "SMTP_DELIVERY_FAILED");
    console.error("[kc-external-access-decide] rejection delivery failed", {
      code: errorCode,
    });
    rejectionResult = {
      status: "failed",
      provider: "hostinger_smtp",
      failed_at: new Date().toISOString(),
      error_code: errorCode,
    };
  }

  const deliveryStatePersisted = await completeDelivery(rejectionResult);

  const sentOk = rejectionResult.status === "sent";
  return json(200, {
    ok: true,
    decision: "rejected",
    decision_persisted: true,
    delivery_status: sentOk ? "sent" : "failed",
    delivery_state_persisted: deliveryStatePersisted,
    help_request_id: row.out_id,
    email_sent: sentOk,
    sent_to: requesterEmail,
    smtp_error: sentOk
      ? null
      : String(rejectionResult.error_code || "SMTP_DELIVERY_FAILED"),
  });
});
