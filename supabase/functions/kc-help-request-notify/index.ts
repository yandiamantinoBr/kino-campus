// KinoCampus -- Edge Function: kc-help-request-notify (v9.3.5.5)
//
// Notifica novas solicitações de "acesso externo" enviando 2 e-mails:
//   1. Admin (contato@kinocampus.com.br): nova solicitação para análise
//   2. Solicitante (row.contact_email): ACK "Recebemos sua solicitação"
//
// Provedor de envio: SMTP direto via denomailer (Hostinger SMTP), o mesmo
// usado pelo Supabase Auth. Não depende de Resend.
//
// Env vars necessárias (configuradas como secrets):
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injetadas)
//   - KC_SMTP_HOST (default: smtp.hostinger.com)
//   - KC_SMTP_PORT (default: 465)
//   - KC_SMTP_USER (e-mail da caixa autenticada)
//   - KC_SMTP_PASS (app password)
//   - KC_SMTP_FROM_NAME (default: "Kino Campus")
//   - KC_SMTP_FROM_EMAIL (default: contato@kinocampus.com.br)
//   - KC_ADMIN_NOTIFICATION_EMAIL (default: contato@kinocampus.com.br)
//   - KC_APP_BASE_URL (default: https://www.kinocampus.com.br)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

type JsonObject = Record<string, unknown>;

type HelpRequestRow = {
  id: string;
  type: string;
  topic: string;
  subtopic: string | null;
  subject: string;
  message: string;
  priority: string;
  status: string;
  page_path: string | null;
  contact_email: string;
  allow_contact: boolean;
  metadata: JsonObject;
  created_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_APP_BASE_URL = "https://www.kinocampus.com.br";
const DEFAULT_ADMIN_TO = "contato@kinocampus.com.br";
const DEFAULT_SMTP_HOST = "smtp.hostinger.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_FROM_NAME = "Kino Campus";
const DEFAULT_FROM_EMAIL = "contato@kinocampus.com.br";

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
  return (getEnv("KC_APP_BASE_URL", DEFAULT_APP_BASE_URL)).replace(/\/+$/, "");
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function asText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function isEmailLike(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asText(value).toLowerCase());
}

function escapeHtml(value: unknown) {
  return asText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncate(value: unknown, maxLength: number) {
  const text = asText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function isExternalAccess(row: HelpRequestRow) {
  const metadata = asObject(row.metadata);
  return row.type === "external_access" || asText(metadata.request_kind) === "external_access";
}

function hasSentNotification(row: HelpRequestRow) {
  const metadata = asObject(row.metadata);
  const emailNotification = asObject(metadata.email_notification);
  return asText(emailNotification.status) === "sent";
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

function buildAdminEmail(row: HelpRequestRow, baseUrl: string) {
  const metadata = asObject(row.metadata);
  const requesterName = asText(metadata.requester_name) || "Pessoa interessada";
  const affiliation = asText(metadata.affiliation_context) || "Não informado";
  const route = asText(metadata.route) || asText(row.page_path) || "Não informado";
  const adminUrl = `${baseUrl}/admin/moderation.html`;
  const subject = `[KinoCampus] Nova solicitação de acesso externo — ${truncate(requesterName, 80)}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:580px;margin:0 auto;color:#1f2937;line-height:1.55">
      ${brandedHeader()}
      <h2 style="color:#ff6b00;font-size:1.25rem;margin:0 0 12px">Nova solicitação de acesso externo</h2>
      <p>Uma pessoa sem e-mail institucional UFG solicitou acesso à comunidade.</p>
      <div style="background:#f3f4f6;border-radius:10px;padding:16px 18px;margin:16px 0">
        <p style="margin:6px 0"><strong>Nome:</strong> ${escapeHtml(requesterName)}</p>
        <p style="margin:6px 0"><strong>E-mail:</strong> <a href="mailto:${escapeHtml(row.contact_email)}" style="color:#ff6b00">${escapeHtml(row.contact_email)}</a></p>
        <p style="margin:6px 0"><strong>Vínculo / contexto:</strong> ${escapeHtml(affiliation)}</p>
        <p style="margin:6px 0"><strong>Origem:</strong> ${escapeHtml(route)}</p>
      </div>
      <h3 style="font-size:1rem;margin:18px 0 6px;color:#1f2937">Mensagem da pessoa</h3>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px;font-size:0.92rem;color:#374151;white-space:pre-wrap">${escapeHtml(row.message)}</div>
      <p style="text-align:center;margin:28px 0">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#ff6b00;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem">Abrir no admin</a>
      </p>
      <p style="font-size:0.85rem;color:#6b7280">No painel admin você pode <strong>aprovar</strong> (envia convite automaticamente por e-mail) ou <strong>recusar</strong> (registra a decisão e envia e-mail de retorno).</p>
      ${brandedFooter()}
    </div>`;

  const text = [
    "KinoCampus — Nova solicitação de acesso externo",
    "",
    "Uma pessoa sem e-mail institucional UFG solicitou acesso à comunidade.",
    "",
    `Nome: ${requesterName}`,
    `E-mail: ${row.contact_email}`,
    `Vínculo/contexto: ${affiliation}`,
    `Origem: ${route}`,
    "",
    "Mensagem:",
    row.message,
    "",
    `Painel admin: ${adminUrl}`,
    "",
    "Equipe KinoCampus",
  ].join("\n");
  return { subject, html, text };
}

function buildAckEmail(row: HelpRequestRow) {
  const metadata = asObject(row.metadata);
  const requesterName = asText(metadata.requester_name);
  const greeting = requesterName ? `Olá, ${escapeHtml(requesterName)}!` : "Olá!";
  const subject = "KinoCampus — Recebemos sua solicitação de acesso";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.55">
      ${brandedHeader()}
      <h2 style="color:#ff6b00;font-size:1.3rem;margin:0 0 12px">Recebemos sua solicitação</h2>
      <p>${greeting}</p>
      <p>Sua <strong>solicitação de acesso à comunidade KinoCampus</strong> foi recebida e está em análise pela nossa equipe.</p>
      <p>Você receberá um novo e-mail com a decisão nos próximos dias. Caso seja <strong>aprovada</strong>, virá com um link direto para criar sua conta.</p>
      <p style="font-size:0.9rem;color:#6b7280">Se você não solicitou esse acesso, pode ignorar este e-mail.</p>
      ${brandedFooter()}
    </div>`;

  const text = [
    "KinoCampus — Recebemos sua solicitação",
    "",
    greeting,
    "",
    "Sua solicitação de acesso à comunidade KinoCampus foi recebida e está em análise.",
    "",
    "Você receberá um novo e-mail com a decisão nos próximos dias.",
    "Caso seja aprovada, virá com um link direto para criar sua conta.",
    "",
    "Equipe KinoCampus",
  ].join("\n");
  return { subject, html, text };
}

/**
 * Sanitize Subject header to pure ASCII.
 *
 * denomailer@1.6.0 has two bugs that make encoded subjects unreadable:
 *  - Q-encoding drops spaces and mangles `=?...?=` delimiters with UTF-8.
 *  - Pre-encoded Base64 subjects (`=?UTF-8?B?...?=`) are wrapped/double-Q-encoded.
 *
 * Workaround: strip diacritics + replace special punctuation with ASCII so the
 * subject becomes pure printable ASCII without `=` or `?`. denomailer leaves
 * pure-ASCII subjects untouched, which is what Hostinger/Gmail expect.
 */
function encodeMimeSubject(subject: string): string {
  let s = String(subject || "");
  // Replace special punctuation with ASCII equivalents BEFORE diacritic strip.
  s = s
    .replace(/[—–]/g, "-") // em-dash, en-dash -> hyphen
    .replace(/[‘’‚‛]/g, "'") // smart single quotes
    .replace(/[“”„‟]/g, '"') // smart double quotes
    .replace(/…/g, "...") // ellipsis
    .replace(/ /g, " "); // nbsp
  // Strip diacritics (NFD: separate base char + combining mark, then drop marks).
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Drop any remaining non-ASCII (cyrillic, emoji, etc.) so denomailer can't
  // trigger its Q-encoder. Defensive: replace with `?` placeholder.
  s = s.replace(/[^\x20-\x7E]/g, "?");
  // Avoid `=?` sequence which denomailer might mistake for an encoded-word.
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

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}) {
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

async function updateMetadata(
  supabase: ReturnType<typeof createClient>,
  rowId: string,
  prevMetadata: JsonObject,
  patch: JsonObject,
) {
  const merged = { ...prevMetadata, ...patch };
  const { error } = await supabase
    .from("help_requests")
    .update({ metadata: merged })
    .eq("id", rowId);
  if (error) {
    console.error("[kc-help-request-notify] metadata update error:", error);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  let body: { help_request_id?: unknown };
  try {
    body = await req.json();
  } catch (_) {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const helpRequestId = asText(body.help_request_id).toLowerCase();
  if (!UUID_RE.test(helpRequestId)) {
    return json(400, { ok: false, error: "invalid_help_request_id" });
  }

  let supabaseUrl = "";
  let serviceRoleKey = "";
  let adminTo = "";
  let baseUrl = "";

  try {
    supabaseUrl = getEnv("SUPABASE_URL");
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_env");
    adminTo = getEnv("KC_ADMIN_NOTIFICATION_EMAIL", DEFAULT_ADMIN_TO);
    baseUrl = appBaseUrl();
  } catch (error) {
    console.error("[kc-help-request-notify] missing Supabase env:", error);
    return json(500, { ok: false, error: "missing_server_configuration" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("help_requests")
    .select("*")
    .eq("id", helpRequestId)
    .maybeSingle();

  if (error) {
    console.error("[kc-help-request-notify] select error:", error);
    return json(500, { ok: false, error: "help_request_lookup_failed" });
  }
  if (!data) return json(404, { ok: false, error: "help_request_not_found" });

  const row = data as HelpRequestRow;
  if (!isExternalAccess(row)) {
    return json(400, { ok: false, error: "help_request_is_not_external_access" });
  }
  if (hasSentNotification(row)) {
    return json(200, { ok: true, skipped: true, reason: "already_sent" });
  }

  const prevMetadata = asObject(row.metadata);
  const adminEmail = buildAdminEmail(row, baseUrl);
  const ackEmail = buildAckEmail(row);
  const requesterEmail = row.contact_email;

  // 1. Tenta enviar para o admin
  let adminResult: JsonObject;
  try {
    await sendEmail({
      to: adminTo,
      subject: adminEmail.subject,
      html: adminEmail.html,
      text: adminEmail.text,
      replyTo: isEmailLike(requesterEmail) ? requesterEmail : undefined,
    });
    adminResult = {
      status: "sent",
      provider: "hostinger_smtp",
      to: adminTo,
      reply_to: isEmailLike(requesterEmail) ? requesterEmail : null,
      sent_at: new Date().toISOString(),
    };
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.error("[kc-help-request-notify] admin send error:", msg);
    adminResult = {
      status: "failed",
      provider: "hostinger_smtp",
      to: adminTo,
      failed_at: new Date().toISOString(),
      error_message: msg,
    };
  }

  // 2. Tenta enviar ACK para o solicitante (best effort, não falha o request)
  let ackResult: JsonObject;
  if (isEmailLike(requesterEmail)) {
    try {
      await sendEmail({
        to: requesterEmail,
        subject: ackEmail.subject,
        html: ackEmail.html,
        text: ackEmail.text,
        replyTo: adminTo,
      });
      ackResult = {
        status: "sent",
        provider: "hostinger_smtp",
        to: requesterEmail,
        sent_at: new Date().toISOString(),
      };
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      console.error("[kc-help-request-notify] ack send error:", msg);
      ackResult = {
        status: "failed",
        provider: "hostinger_smtp",
        to: requesterEmail,
        failed_at: new Date().toISOString(),
        error_message: msg,
      };
    }
  } else {
    ackResult = { status: "skipped", reason: "no_valid_contact_email" };
  }

  await updateMetadata(supabase, row.id, prevMetadata, {
    email_notification: adminResult,
    ack_email: ackResult,
  });

  const adminOk = adminResult.status === "sent";
  return json(adminOk ? 200 : 502, {
    ok: adminOk,
    help_request_id: row.id,
    admin_notification: adminResult,
    ack_email: ackResult,
  });
});
