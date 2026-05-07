import { createClient } from "jsr:@supabase/supabase-js@2";

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
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const NOTIFICATION_TO = "contato@kinocampus.com.br";

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

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function getOptionalEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  return value || null;
}

function appBaseUrl() {
  return (getOptionalEnv("KC_APP_BASE_URL") || DEFAULT_APP_BASE_URL).replace(/\/+$/, "");
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

function buildEmail(row: HelpRequestRow, baseUrl: string) {
  const metadata = asObject(row.metadata);
  const requesterName = asText(metadata.requester_name) || "Pessoa interessada";
  const affiliation = asText(metadata.affiliation_context) || "Não informado";
  const route = asText(metadata.route) || asText(row.page_path) || "Não informado";
  const adminUrl = `${baseUrl}/admin/help-requests.html`;
  const subject = `[KinoCampus] Solicitação de acesso externo - ${truncate(requesterName, 80)}`;
  const html = [
    "<h1>Solicitação de acesso externo</h1>",
    "<p>Uma pessoa sem e-mail institucional solicitou acesso ao KinoCampus.</p>",
    "<ul>",
    `<li><strong>Nome:</strong> ${escapeHtml(requesterName)}</li>`,
    `<li><strong>E-mail:</strong> ${escapeHtml(row.contact_email)}</li>`,
    `<li><strong>Vínculo/contexto:</strong> ${escapeHtml(affiliation)}</li>`,
    `<li><strong>Origem:</strong> ${escapeHtml(route)}</li>`,
    `<li><strong>Pedido:</strong> ${escapeHtml(row.message)}</li>`,
    "</ul>",
    `<p><a href="${escapeHtml(adminUrl)}">Abrir solicitações no admin</a></p>`,
  ].join("");
  const text = [
    "Solicitação de acesso externo",
    "",
    `Nome: ${requesterName}`,
    `E-mail: ${row.contact_email}`,
    `Vínculo/contexto: ${affiliation}`,
    `Origem: ${route}`,
    `Pedido: ${row.message}`,
    "",
    `Admin: ${adminUrl}`,
  ].join("\n");
  return { subject, html, text };
}

async function readProviderBody(response: Response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as JsonObject;
  } catch (_) {
    return { raw };
  }
}

async function updateEmailNotification(
  supabase: ReturnType<typeof createClient>,
  row: HelpRequestRow,
  emailNotification: JsonObject,
) {
  const metadata = {
    ...asObject(row.metadata),
    email_notification: emailNotification,
  };

  const { error } = await supabase
    .from("help_requests")
    .update({ metadata })
    .eq("id", row.id);

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
  let emailProvider = "";
  let emailApiKey = "";
  let emailFrom = "";
  let emailReplyTo = "";
  let baseUrl = "";

  try {
    supabaseUrl = getRequiredEnv("SUPABASE_URL");
    serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    emailProvider = (getOptionalEnv("KC_NOTIFICATION_EMAIL_PROVIDER") || "").toLowerCase();
    emailApiKey = getOptionalEnv("KC_NOTIFICATION_EMAIL_API_KEY") || "";
    emailFrom = getOptionalEnv("KC_NOTIFICATION_EMAIL_FROM") || "";
    emailReplyTo = getOptionalEnv("KC_NOTIFICATION_EMAIL_REPLY_TO") || "";
    baseUrl = appBaseUrl();
  } catch (error) {
    console.error("[kc-help-request-notify] missing Supabase configuration:", error);
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

  if (emailProvider !== "resend" || !emailApiKey || !emailFrom) {
    const failed = {
      status: "failed",
      provider: emailProvider || "missing",
      to: NOTIFICATION_TO,
      failed_at: new Date().toISOString(),
      error_code: "missing_resend_configuration",
      error_message: "Configure KC_NOTIFICATION_EMAIL_PROVIDER=resend, KC_NOTIFICATION_EMAIL_API_KEY e KC_NOTIFICATION_EMAIL_FROM.",
    };
    await updateEmailNotification(supabase, row, failed);
    return json(500, { ok: false, error: "missing_resend_configuration" });
  }

  const email = buildEmail(row, baseUrl);
  const replyTo = isEmailLike(row.contact_email) ? row.contact_email : emailReplyTo;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${emailApiKey}`,
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [NOTIFICATION_TO],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const responseBody = await readProviderBody(response);
  if (!response.ok) {
    const failed = {
      status: "failed",
      provider: "resend",
      to: NOTIFICATION_TO,
      failed_at: new Date().toISOString(),
      response_code: String(response.status),
      response_body: responseBody,
      error_code: "provider_http_error",
      error_message: asText(responseBody.message) || asText(responseBody.error) || `HTTP ${response.status}`,
    };
    await updateEmailNotification(supabase, row, failed);
    return json(502, { ok: false, error: "resend_failed", response_code: response.status });
  }

  const sent = {
    status: "sent",
    provider: "resend",
    to: NOTIFICATION_TO,
    reply_to: replyTo || null,
    sent_at: new Date().toISOString(),
    response_code: String(response.status),
    response_body: responseBody,
  };
  await updateEmailNotification(supabase, row, sent);

  return json(200, { ok: true, help_request_id: row.id, email_notification: sent });
});
