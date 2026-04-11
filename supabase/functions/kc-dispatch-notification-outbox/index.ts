import { createClient } from "jsr:@supabase/supabase-js@2";

type Channel = "email" | "whatsapp";
type JsonObject = Record<string, unknown>;

type OutboxRow = {
  id: string;
  notification_id: string | null;
  user_id: string;
  event_type: string;
  channel: Channel;
  status: string;
  destination: string | null;
  destination_source: string | null;
  payload: JsonObject;
  attempts_count: number;
  last_attempt_at: string | null;
  next_attempt_at: string;
  locked_at: string | null;
  locked_by: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

type EmailProviderConfig = {
  name: string | null;
  ready: boolean;
  missing: string[];
  apiKey: string | null;
  from: string | null;
  replyTo: string | null;
  appBaseUrl: string;
};

type WhatsAppProviderConfig = {
  name: string | null;
  ready: boolean;
  missing: string[];
  accountSid: string | null;
  authToken: string | null;
  from: string | null;
  contentSid: string | null;
  statusCallback: string | null;
  templateName: string | null;
  rateLimitWindowMinutes: number;
  rateLimitMaxPerWindow: number;
  appBaseUrl: string;
};

type EmailEnvelope = {
  subject: string;
  html: string;
  text: string;
  actionUrl: string;
  preferencesUrl: string;
  title: string;
  preview: string;
};

type WhatsAppEnvelope = {
  text: string;
  actionUrl: string;
  preferencesUrl: string;
  title: string;
  preview: string;
  contentSid: string | null;
  contentVariables: JsonObject;
  templateName: string | null;
};

type DispatchResult = {
  ok: boolean;
  provider: string;
  responseCode: string;
  responseBody: JsonObject;
  errorCode: string | null;
  errorMessage: string | null;
  envelope: EmailEnvelope | WhatsAppEnvelope;
  nextAttemptAt?: string | null;
};

const DEFAULT_APP_BASE_URL = "https://www.kinocampus.com.br";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TWILIO_MESSAGES_ENDPOINT = "https://api.twilio.com/2010-04-01/Accounts";
const MODULE_PATHS: Record<string, string> = {
  "achados-perdidos": "/achados-perdidos.html",
  "caronas": "/caronas-feed.html",
  "compra-venda": "/compra-venda-feed.html",
  "eventos": "/eventos.html",
  "moradia": "/moradia.html",
  "oportunidades": "/oportunidades.html",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
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

function parsePositiveInt(raw: unknown, fallback: number, max = 200) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeChannel(value: unknown): Channel | null {
  const channel = String(value ?? "").trim().toLowerCase();
  if (channel === "email" || channel === "whatsapp") return channel;
  return null;
}

function normalizeJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function asText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function truncate(text: string, maxLength: number) {
  const normalized = asText(text);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeSnippet(value: unknown, maxLength = 280) {
  return truncate(asText(value).replace(/[\u0000-\u001f\u007f]+/g, " "), maxLength);
}

function maskEmail(value: string | null) {
  const email = asText(value);
  if (!email.includes("@")) return "";
  const [localPart, domainPart] = email.split("@");
  if (!localPart || !domainPart) return "";
  if (localPart.length <= 2) return `${localPart[0] ?? "*"}***@${domainPart}`;
  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

function normalizeDigits(value: string | null) {
  return asText(value).replace(/\D+/g, "");
}

function isWhatsAppE164(value: string | null) {
  return /^\+[1-9]\d{7,14}$/.test(asText(value));
}

function maskWhatsAppDestination(value: string | null) {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  if (digits.length <= 4) return `+${digits}`;
  const visiblePrefix = digits.slice(0, Math.min(4, Math.max(1, digits.length - 4)));
  return `+${visiblePrefix}${"*".repeat(Math.max(0, digits.length - visiblePrefix.length - 4))}${digits.slice(-4)}`;
}

function toWhatsAppChannelAddress(value: string | null) {
  const destination = asText(value);
  if (!destination) return "";
  return destination.startsWith("whatsapp:") ? destination : `whatsapp:${destination}`;
}

function isEmailLike(value: string | null) {
  const email = asText(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseJsonBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function toProviderBody(raw: string) {
  const parsed = parseJsonBody(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as JsonObject;
  }
  if (raw.trim()) return { raw: safeSnippet(raw, 1200) };
  return {};
}

function buildAppBaseUrl() {
  return (getOptionalEnv("KC_APP_BASE_URL") || DEFAULT_APP_BASE_URL).replace(/\/+$/, "");
}

function getEmailProviderConfig(appBaseUrl: string): EmailProviderConfig {
  const name = getOptionalEnv("KC_NOTIFICATION_EMAIL_PROVIDER")?.toLowerCase() || null;
  const apiKey = getOptionalEnv("KC_NOTIFICATION_EMAIL_API_KEY");
  const from = getOptionalEnv("KC_NOTIFICATION_EMAIL_FROM");
  const replyTo = getOptionalEnv("KC_NOTIFICATION_EMAIL_REPLY_TO");
  const missing: string[] = [];

  if (name === "resend") {
    if (!apiKey) missing.push("KC_NOTIFICATION_EMAIL_API_KEY");
    if (!from) missing.push("KC_NOTIFICATION_EMAIL_FROM");
  } else if (!name) {
    missing.push("KC_NOTIFICATION_EMAIL_PROVIDER");
  }

  return {
    name,
    ready: name === "resend" && missing.length === 0,
    missing,
    apiKey,
    from,
    replyTo,
    appBaseUrl,
  };
}

function getWhatsAppProviderConfig(appBaseUrl: string): WhatsAppProviderConfig {
  const name = getOptionalEnv("KC_NOTIFICATION_WHATSAPP_PROVIDER")?.toLowerCase() || null;
  const accountSid = getOptionalEnv("KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID");
  const authToken = getOptionalEnv("KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN");
  const from = getOptionalEnv("KC_NOTIFICATION_WHATSAPP_FROM");
  const contentSid = getOptionalEnv("KC_NOTIFICATION_WHATSAPP_CONTENT_SID");
  const statusCallback = getOptionalEnv("KC_NOTIFICATION_WHATSAPP_STATUS_CALLBACK");
  const templateName = getOptionalEnv("KC_NOTIFICATION_WHATSAPP_TEMPLATE_NAME");
  const rateLimitWindowMinutes = parsePositiveInt(
    Deno.env.get("KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_WINDOW_MINUTES"),
    60,
    1440,
  );
  const rateLimitMaxPerWindow = parsePositiveInt(
    Deno.env.get("KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_MAX_PER_WINDOW"),
    6,
    100,
  );
  const missing: string[] = [];

  if (name === "twilio") {
    if (!accountSid) missing.push("KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID");
    if (!authToken) missing.push("KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN");
    if (!from) missing.push("KC_NOTIFICATION_WHATSAPP_FROM");
    if (!contentSid) missing.push("KC_NOTIFICATION_WHATSAPP_CONTENT_SID");
  } else if (!name) {
    missing.push("KC_NOTIFICATION_WHATSAPP_PROVIDER");
  }

  return {
    name,
    ready: name === "twilio" && missing.length === 0,
    missing,
    accountSid,
    authToken,
    from,
    contentSid,
    statusCallback,
    templateName,
    rateLimitWindowMinutes,
    rateLimitMaxPerWindow,
    appBaseUrl,
  };
}

function buildNotificationUrl(row: OutboxRow, appBaseUrl: string) {
  const payload = normalizeJsonObject(row.payload);
  const data = normalizeJsonObject(payload.data);
  const explicitUrl = asText(data.url || data.href || payload.url);
  if (/^https?:\/\//i.test(explicitUrl)) return explicitUrl;

  const postId = asText(data.post_id);
  if (postId) {
    return `${appBaseUrl}/_product.html?id=${encodeURIComponent(postId)}`;
  }

  const moduleName = asText(data.module);
  if (moduleName && MODULE_PATHS[moduleName]) {
    return `${appBaseUrl}${MODULE_PATHS[moduleName]}`;
  }

  return `${appBaseUrl}/settings.html`;
}

function buildEventLabel(eventType: string) {
  switch (eventType) {
    case "comment_on_post":
      return "Novo comentario";
    case "comment_reply":
      return "Nova resposta";
    case "vote_on_post":
      return "Novo voto";
    case "post_expired":
      return "Post expirado";
    case "post_reported":
      return "Post denunciado";
    default:
      return "Notificacao";
  }
}

function buildEmailEnvelope(row: OutboxRow, appBaseUrl: string): EmailEnvelope {
  const payload = normalizeJsonObject(row.payload);
  const eventType = asText(payload.event_type || row.event_type || "system").toLowerCase();
  const eventLabel = buildEventLabel(eventType);
  const title = truncate(asText(payload.title) || eventLabel, 120);
  const body = truncate(asText(payload.body) || "Voce tem uma nova atualizacao na plataforma.", 500);
  const actionUrl = buildNotificationUrl(row, appBaseUrl);
  const preferencesUrl = `${appBaseUrl}/settings.html`;
  const subject = `[KinoCampus] ${truncate(title || eventLabel, 120)}`;
  const preview = truncate(body || title || eventLabel, 120);

  const safeTitle = escapeHtml(title || eventLabel);
  const safeBody = escapeHtml(body);
  const safeActionUrl = escapeHtml(actionUrl);
  const safePreferencesUrl = escapeHtml(preferencesUrl);
  const safeEventLabel = escapeHtml(eventLabel);

  const html = [
    "<!doctype html>",
    "<html lang=\"pt-BR\">",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
    `<title>${escapeHtml(subject)}</title>`,
    "</head>",
    "<body style=\"margin:0;padding:0;background:#f6f3ef;color:#1a1a1a;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;\">",
    "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f6f3ef;padding:24px 12px;\">",
    "<tr><td align=\"center\">",
    "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #f0e7df;\">",
    "<tr><td style=\"padding:24px 28px;background:linear-gradient(135deg,#ff7a18 0%,#ff9f4a 100%);color:#ffffff;\">",
    "<div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.88;\">KinoCampus</div>",
    `<div style="margin-top:10px;font-size:28px;line-height:1.2;font-weight:700;">${safeTitle}</div>`,
    `<div style="margin-top:10px;font-size:13px;line-height:1.4;opacity:0.92;">${safeEventLabel}</div>`,
    "</td></tr>",
    "<tr><td style=\"padding:28px;\">",
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#2b2b2b;">${safeBody}</p>`,
    `<p style="margin:0 0 22px;"><a href="${safeActionUrl}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#111111;color:#ffffff;text-decoration:none;font-weight:700;">Abrir no KinoCampus</a></p>`,
    `<p style="margin:0;font-size:13px;line-height:1.6;color:#666666;">Voce esta recebendo este e-mail porque habilitou notificacoes por e-mail nas suas preferencias. Para ajustar os canais, acesse <a href="${safePreferencesUrl}" style="color:#ff7a18;">Configuracoes</a>.</p>`,
    "</td></tr>",
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");

  const text = [
    "KinoCampus",
    "",
    title || eventLabel,
    body,
    "",
    `Abrir no KinoCampus: ${actionUrl}`,
    `Gerenciar notificacoes: ${preferencesUrl}`,
  ].filter(Boolean).join("\n");

  return {
    subject,
    html,
    text,
    actionUrl,
    preferencesUrl,
    title: title || eventLabel,
    preview,
  };
}

function buildWhatsAppEnvelope(
  row: OutboxRow,
  providerConfig: WhatsAppProviderConfig,
): WhatsAppEnvelope {
  const payload = normalizeJsonObject(row.payload);
  const eventType = asText(payload.event_type || row.event_type || "system").toLowerCase();
  const eventLabel = buildEventLabel(eventType);
  const title = truncate(asText(payload.title) || eventLabel, 120);
  const body = truncate(asText(payload.body) || "Voce tem uma nova atualizacao na plataforma.", 500);
  const actionUrl = buildNotificationUrl(row, providerConfig.appBaseUrl);
  const preferencesUrl = `${providerConfig.appBaseUrl}/settings.html`;
  const preview = truncate(body || title || eventLabel, 120);
  const text = [
    `KinoCampus: ${title || eventLabel}`,
    body,
    `Abrir: ${actionUrl}`,
    `Preferencias: ${preferencesUrl}`,
  ].filter(Boolean).join("\n");

  return {
    text,
    actionUrl,
    preferencesUrl,
    title: title || eventLabel,
    preview,
    contentSid: providerConfig.contentSid,
    templateName: providerConfig.templateName,
    contentVariables: {
      "1": title || eventLabel,
      "2": body || "Voce tem uma nova atualizacao no KinoCampus.",
      "3": actionUrl,
    },
  };
}

async function getRecentWhatsAppWindow(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  providerConfig: WhatsAppProviderConfig,
) {
  const sinceDate = new Date(Date.now() - providerConfig.rateLimitWindowMinutes * 60 * 1000);
  const sinceIso = sinceDate.toISOString();
  const { data, error } = await supabase
    .from("notification_delivery_outbox")
    .select("sent_at")
    .eq("user_id", userId)
    .eq("channel", "whatsapp")
    .eq("status", "sent")
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: true });

  if (error) {
    throw new Error(`whatsapp_rate_limit_query_failed:${error.message}`);
  }

  const rows = Array.isArray(data)
    ? data.filter((row) => asText((row as Record<string, unknown>).sent_at))
    : [];
  const oldest = rows.length ? asText((rows[0] as Record<string, unknown>).sent_at) : "";

  return {
    count: rows.length,
    sinceIso,
    nextAllowedAt: oldest
      ? new Date(new Date(oldest).getTime() + providerConfig.rateLimitWindowMinutes * 60 * 1000).toISOString()
      : null,
  };
}

async function claimDispatchBatch(
  supabase: ReturnType<typeof createClient>,
  channel: Channel,
  limit: number,
  workerId: string,
) {
  const { data, error } = await supabase.rpc("kc_claim_notification_delivery_batch", {
    p_channel: channel,
    p_limit: limit,
    p_worker: workerId,
  });

  if (error) {
    throw new Error(`claim_batch_failed:${error.message}`);
  }

  return Array.isArray(data)
    ? data.map((row) => ({
      ...row,
      payload: normalizeJsonObject((row as Record<string, unknown>).payload),
    })) as OutboxRow[]
    : [];
}

async function recordAttempt(
  supabase: ReturnType<typeof createClient>,
  outboxId: string,
  status: "sent" | "failed" | "blocked" | "cancelled" | "skipped",
  provider: string,
  responseCode: string,
  responseBody: JsonObject,
  errorCode: string | null,
  errorMessage: string | null,
  nextAttemptAt: string | null,
) {
  const { data, error } = await supabase.rpc("kc_record_notification_delivery_attempt", {
    p_outbox_id: outboxId,
    p_status: status,
    p_provider: provider,
    p_response_code: responseCode,
    p_response_body: responseBody,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_next_attempt_at: nextAttemptAt,
  });

  if (error) {
    throw new Error(`record_attempt_failed:${error.message}`);
  }

  if (Array.isArray(data)) return (data[0] ?? null) as OutboxRow | null;
  return data as OutboxRow | null;
}

function computeNextAttemptAt(previousAttempts: number) {
  const attemptNumber = Math.max(1, previousAttempts + 1);
  const delayMinutes = Math.min(12 * 60, 5 * (2 ** Math.min(attemptNumber - 1, 7)));
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

async function sendEmailWithResend(
  row: OutboxRow,
  providerConfig: EmailProviderConfig,
): Promise<DispatchResult> {
  const destination = asText(row.destination);
  const envelope = buildEmailEnvelope(row, providerConfig.appBaseUrl);

  if (!isEmailLike(destination)) {
    return {
      ok: false,
      provider: "resend",
      responseCode: "invalid_destination",
      responseBody: { destination: destination || null },
      errorCode: "invalid_destination",
      errorMessage: "Destino de e-mail invalido ou ausente no item do outbox.",
      envelope,
    };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify({
      from: providerConfig.from,
      to: [destination],
      subject: envelope.subject,
      html: envelope.html,
      text: envelope.text,
      ...(providerConfig.replyTo ? { reply_to: providerConfig.replyTo } : {}),
    }),
  });

  const raw = await res.text();
  const responseBody = toProviderBody(raw);

  if (!res.ok) {
    const providerError =
      asText(responseBody.error) ||
      asText(responseBody.message) ||
      asText((responseBody as JsonObject).name) ||
      safeSnippet(raw, 240) ||
      `provider_http_${res.status}`;

    return {
      ok: false,
      provider: "resend",
      responseCode: String(res.status),
      responseBody,
      errorCode: `provider_http_${res.status}`,
      errorMessage: providerError,
      envelope,
    };
  }

  return {
    ok: true,
    provider: "resend",
    responseCode: String(res.status),
    responseBody,
    errorCode: null,
    errorMessage: null,
    envelope,
  };
}

async function dispatchEmail(
  row: OutboxRow,
  providerConfig: EmailProviderConfig,
): Promise<DispatchResult> {
  if (providerConfig.name !== "resend") {
    return {
      ok: false,
      provider: providerConfig.name || "unknown",
      responseCode: "unsupported_provider",
      responseBody: {},
      errorCode: "unsupported_provider",
      errorMessage: `Provider de e-mail nao suportado nesta fase: ${providerConfig.name || "none"}.`,
      envelope: buildEmailEnvelope(row, providerConfig.appBaseUrl),
    };
  }

  return sendEmailWithResend(row, providerConfig);
}

async function sendWhatsAppWithTwilio(
  supabase: ReturnType<typeof createClient>,
  row: OutboxRow,
  providerConfig: WhatsAppProviderConfig,
): Promise<DispatchResult> {
  const destination = asText(row.destination);
  const envelope = buildWhatsAppEnvelope(row, providerConfig);

  if (!isWhatsAppE164(destination)) {
    return {
      ok: false,
      provider: "twilio",
      responseCode: "invalid_destination",
      responseBody: { destination: destination || null },
      errorCode: "invalid_destination",
      errorMessage: "Destino de WhatsApp invalido ou ausente no item do outbox.",
      envelope,
    };
  }

  const recentWindow = await getRecentWhatsAppWindow(supabase, row.user_id, providerConfig);
  if (recentWindow.count >= providerConfig.rateLimitMaxPerWindow) {
    return {
      ok: false,
      provider: "twilio",
      responseCode: "rate_limited",
      responseBody: {
        rate_limit_window_minutes: providerConfig.rateLimitWindowMinutes,
        rate_limit_max_per_window: providerConfig.rateLimitMaxPerWindow,
        recent_count: recentWindow.count,
      },
      errorCode: "rate_limited",
      errorMessage: "Janela operacional de WhatsApp excedida para este usuario.",
      envelope,
      nextAttemptAt: recentWindow.nextAllowedAt,
    };
  }

  const endpoint = `${TWILIO_MESSAGES_ENDPOINT}/${providerConfig.accountSid}/Messages.json`;
  const body = new URLSearchParams();
  body.set("To", toWhatsAppChannelAddress(destination));
  body.set("From", toWhatsAppChannelAddress(providerConfig.from));
  body.set("ContentSid", providerConfig.contentSid || "");
  body.set("ContentVariables", JSON.stringify(envelope.contentVariables));
  if (providerConfig.statusCallback) body.set("StatusCallback", providerConfig.statusCallback);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${providerConfig.accountSid}:${providerConfig.authToken}`)}`,
    },
    body,
  });

  const raw = await res.text();
  const responseBody = toProviderBody(raw);
  if (!res.ok) {
    const providerError =
      asText(responseBody.message) ||
      asText(responseBody.error_message) ||
      safeSnippet(raw, 240) ||
      `provider_http_${res.status}`;

    return {
      ok: false,
      provider: "twilio",
      responseCode: String(res.status),
      responseBody,
      errorCode: `provider_http_${res.status}`,
      errorMessage: providerError,
      envelope,
    };
  }

  return {
    ok: true,
    provider: "twilio",
    responseCode: String(res.status),
    responseBody,
    errorCode: null,
    errorMessage: null,
    envelope,
  };
}

async function dispatchWhatsApp(
  supabase: ReturnType<typeof createClient>,
  row: OutboxRow,
  providerConfig: WhatsAppProviderConfig,
): Promise<DispatchResult> {
  if (providerConfig.name !== "twilio") {
    return {
      ok: false,
      provider: providerConfig.name || "unknown",
      responseCode: "unsupported_provider",
      responseBody: {},
      errorCode: "unsupported_provider",
      errorMessage: `Provider de WhatsApp nao suportado nesta fase: ${providerConfig.name || "none"}.`,
      envelope: buildWhatsAppEnvelope(row, providerConfig),
    };
  }

  return sendWhatsAppWithTwilio(supabase, row, providerConfig);
}

async function processDispatchChannel(
  supabase: ReturnType<typeof createClient>,
  channel: Channel,
  batchLimit: number,
  executionId: string,
  emailProvider: EmailProviderConfig,
  whatsappProvider: WhatsAppProviderConfig,
) {
  const workerId = [
    `kc-dispatch-${channel}`,
    executionId,
  ].join(":");
  const claimedRows = await claimDispatchBatch(supabase, channel, batchLimit, workerId);
  const sentIds: string[] = [];
  const failedIds: string[] = [];
  const blockedIds: string[] = [];
  const summaries: Record<string, unknown>[] = [];

  let sentCount = 0;
  let failedCount = 0;
  let blockedCount = 0;

  for (const row of claimedRows) {
    let result: DispatchResult;
    try {
      result = channel === "email"
        ? await dispatchEmail(row, emailProvider)
        : await dispatchWhatsApp(supabase, row, whatsappProvider);
    } catch (error) {
      result = {
        ok: false,
        provider: channel === "email" ? emailProvider.name || "unknown" : whatsappProvider.name || "unknown",
        responseCode: "runtime_exception",
        responseBody: {},
        errorCode: "runtime_exception",
        errorMessage: safeSnippet((error as Error)?.message || String(error), 240),
        envelope: channel === "email"
          ? buildEmailEnvelope(row, emailProvider.appBaseUrl)
          : buildWhatsAppEnvelope(row, whatsappProvider),
      };
    }

    let finalStatus: "sent" | "failed" | "blocked" = "sent";
    let nextAttemptAt: string | null = null;
    if (!result.ok) {
      finalStatus = result.errorCode === "invalid_destination" ? "blocked" : "failed";
      if (finalStatus === "failed") {
        nextAttemptAt = result.nextAttemptAt || computeNextAttemptAt(row.attempts_count);
      }
    }

    await recordAttempt(
      supabase,
      row.id,
      finalStatus,
      result.provider,
      result.responseCode,
      result.responseBody,
      result.errorCode,
      result.errorMessage,
      nextAttemptAt,
    );

    if (finalStatus === "sent") {
      sentCount += 1;
      sentIds.push(row.id);
    } else if (finalStatus === "blocked") {
      blockedCount += 1;
      blockedIds.push(row.id);
    } else {
      failedCount += 1;
      failedIds.push(row.id);
    }

    if (summaries.length < 10) {
      summaries.push({
        id: row.id,
        status: finalStatus,
        destination_masked: channel === "email" ? maskEmail(row.destination) : maskWhatsAppDestination(row.destination),
        response_code: result.responseCode,
        error_code: result.errorCode,
        next_attempt_at: nextAttemptAt,
        title: channel === "email"
          ? (result.envelope as EmailEnvelope).subject
          : (result.envelope as WhatsAppEnvelope).title,
      });
    }
  }

  return {
    channel,
    workerId,
    claimedRows,
    claimed_count: claimedRows.length,
    processed_count: claimedRows.length,
    sent_count: sentCount,
    failed_count: failedCount,
    blocked_count: blockedCount,
    sent_ids: sentIds,
    failed_ids: failedIds,
    blocked_ids: blockedIds,
    summaries,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  let supabaseUrl = "";
  let serviceRoleKey = "";
  let dispatchSecret = "";

  try {
    supabaseUrl = getRequiredEnv("SUPABASE_URL");
    serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    dispatchSecret = getRequiredEnv("KC_NOTIFICATION_DISPATCH_SECRET");
  } catch (error) {
    console.error("[kc-dispatch-notification-outbox] missing configuration", error);
    return json(500, { ok: false, error: "missing_server_configuration" });
  }

  const providedSecret = req.headers.get("x-kc-dispatch-secret")?.trim() ?? "";
  if (!providedSecret || !timingSafeEqual(providedSecret, dispatchSecret)) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const dryRun = body.dryRun !== false;
  const channelFilter = normalizeChannel(body.channel);
  const batchLimit = parsePositiveInt(
    body.limit,
    parsePositiveInt(Deno.env.get("KC_NOTIFICATION_DISPATCH_BATCH_LIMIT"), 25),
  );
  const appBaseUrl = buildAppBaseUrl();
  const emailProvider = getEmailProviderConfig(appBaseUrl);
  const whatsappProvider = getWhatsAppProviderConfig(appBaseUrl);
  const providerByChannel = {
    email: emailProvider.name,
    whatsapp: whatsappProvider.name,
  } as const;
  const providerReady = {
    email: emailProvider.ready,
    whatsapp: whatsappProvider.ready,
  };
  const providerIssues = {
    email: emailProvider.ready
      ? []
      : emailProvider.missing.length > 0
        ? emailProvider.missing
        : [`unsupported_provider:${emailProvider.name || "none"}`],
    whatsapp: whatsappProvider.ready
      ? []
      : whatsappProvider.missing.length > 0
        ? whatsappProvider.missing
        : [`unsupported_provider:${whatsappProvider.name || "none"}`],
  };

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let previewQuery = supabase
      .from("notification_delivery_outbox")
      .select(
        "id, notification_id, user_id, event_type, channel, status, destination, destination_source, payload, attempts_count, last_attempt_at, next_attempt_at, locked_at, locked_by, error_code, error_message, created_at",
        { count: "exact" },
      )
      .in("status", ["queued", "failed", "blocked"])
      .order("created_at", { ascending: true })
      .limit(batchLimit);

    if (channelFilter) {
      previewQuery = previewQuery.eq("channel", channelFilter);
    }

    const { data, error, count } = await previewQuery;
    if (error) {
      console.error("[kc-dispatch-notification-outbox] outbox query failed", error);
      return json(500, { ok: false, error: "outbox_query_failed" });
    }

    const rows = Array.isArray(data)
      ? data.map((row) => ({
        ...row,
        payload: normalizeJsonObject((row as Record<string, unknown>).payload),
      })) as OutboxRow[]
      : [];

    const byChannel = { email: 0, whatsapp: 0 };
    const byStatus: Record<string, number> = {};
    const dispatchablePreviewIds: string[] = [];
    const blockedPreviewIds: string[] = [];
    const emailPreviews: Record<string, unknown>[] = [];
    const whatsappPreviews: Record<string, unknown>[] = [];

    for (const row of rows) {
      byChannel[row.channel] += 1;
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;

      if (row.status === "queued" && providerReady[row.channel] && dispatchablePreviewIds.length < 10) {
        dispatchablePreviewIds.push(row.id);
      }

      if (row.status === "blocked" && blockedPreviewIds.length < 10) {
        blockedPreviewIds.push(row.id);
      }

      if (row.channel === "email" && emailPreviews.length < 5) {
        const envelope = buildEmailEnvelope(row, appBaseUrl);
        emailPreviews.push({
          id: row.id,
          status: row.status,
          destination_masked: maskEmail(row.destination),
          provider_ready: providerReady.email,
          subject: envelope.subject,
          preview: envelope.preview,
          action_url: envelope.actionUrl,
          attempts_count: row.attempts_count,
          error_code: row.error_code,
        });
      }

      if (row.channel === "whatsapp" && whatsappPreviews.length < 5) {
        const envelope = buildWhatsAppEnvelope(row, whatsappProvider);
        whatsappPreviews.push({
          id: row.id,
          status: row.status,
          destination_masked: maskWhatsAppDestination(row.destination),
          provider_ready: providerReady.whatsapp,
          title: envelope.title,
          preview: envelope.preview,
          action_url: envelope.actionUrl,
          content_sid: envelope.contentSid,
          template_name: envelope.templateName,
          attempts_count: row.attempts_count,
          error_code: row.error_code,
        });
      }
    }

    if (dryRun) {
      return json(200, {
        ok: true,
        mode: "dry_run",
        note: "Email e WhatsApp usam a mesma outbox. O envio real fica gated por segredos e provider validos.",
        provider_ready: providerReady,
        provider_names: providerByChannel,
        provider_issues: providerIssues,
        batch_limit: batchLimit,
        selected_count: rows.length,
        total_matching_count: count ?? rows.length,
        channel_filter: channelFilter,
        by_channel: byChannel,
        by_status: byStatus,
        dispatchable_preview_ids: dispatchablePreviewIds,
        blocked_preview_ids: blockedPreviewIds,
        email_previews: emailPreviews,
        whatsapp_previews: whatsappPreviews,
      });
    }

    const requestedChannels = channelFilter
      ? [channelFilter]
      : (["email", "whatsapp"] as Channel[]);
    const executionId = Deno.env.get("SB_EXECUTION_ID")?.trim() || crypto.randomUUID();
    const channelResults: Record<string, unknown> = {};
    const skippedChannels: string[] = [];

    for (const channel of requestedChannels) {
      if (!providerReady[channel]) {
        skippedChannels.push(channel);
        channelResults[channel] = {
          channel,
          skipped: true,
          reason: "provider_not_configured",
          provider_issues: providerIssues[channel],
          claimed_count: 0,
          processed_count: 0,
          sent_count: 0,
          failed_count: 0,
          blocked_count: 0,
          summaries: [],
        };
        continue;
      }

      channelResults[channel] = await processDispatchChannel(
        supabase,
        channel,
        batchLimit,
        executionId,
        emailProvider,
        whatsappProvider,
      );
    }

    if (requestedChannels.length === 1) {
      const channel = requestedChannels[0];
      const singleResult = channelResults[channel] as Record<string, unknown>;
      return json(200, {
        ok: true,
        mode: "dispatch",
        channel,
        provider_ready: providerReady,
        provider_names: providerByChannel,
        skipped_channels: skippedChannels,
        ...singleResult,
      });
    }

    return json(200, {
      ok: true,
      mode: "dispatch",
      provider_ready: providerReady,
      provider_names: providerByChannel,
      provider_issues: providerIssues,
      skipped_channels: skippedChannels,
      channels: channelResults,
    });
  } catch (error) {
    console.error("[kc-dispatch-notification-outbox] execution failed", error);
    return json(500, { ok: false, error: "internal_error" });
  }
});
