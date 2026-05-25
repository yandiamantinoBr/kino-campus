// KinoCampus - Edge Function: kc-account-erasure
//
// Admin-only LGPD account-erasure workflow.
// Actions:
// - diagnose
// - apply_reversible
// - generate_receipt
// - erase_confirmed

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = ReturnType<typeof createClient>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;
const DEFAULT_APP_BASE_URL = "https://www.kinocampus.com.br";
const DEFAULT_FROM_NAME = "KinoCampus";
const DEFAULT_FROM_EMAIL = "contato@kinocampus.com.br";
const DEFAULT_SMTP_HOST = "smtp.hostinger.com";
const DEFAULT_SMTP_PORT = 465;

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

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function safeString(value: unknown, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function escapeHtml(value: unknown) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getSmtpClient() {
  const user = getEnv("KC_SMTP_USER");
  const pass = getEnv("KC_SMTP_PASS");
  if (!user || !pass) throw new Error("missing_smtp_credentials");
  const port = Number(getEnv("KC_SMTP_PORT", String(DEFAULT_SMTP_PORT))) || DEFAULT_SMTP_PORT;
  return new SMTPClient({
    connection: {
      hostname: getEnv("KC_SMTP_HOST", DEFAULT_SMTP_HOST),
      port,
      tls: port === 465,
      auth: { username: user, password: pass },
    },
  });
}

async function sendEmail(opts: { to: string; subject: string; html: string; text: string }) {
  const client = await getSmtpClient();
  try {
    await client.send({
      from: `${getEnv("KC_SMTP_FROM_NAME", DEFAULT_FROM_NAME)} <${getEnv("KC_SMTP_FROM_EMAIL", DEFAULT_FROM_EMAIL)}>`,
      to: opts.to,
      subject: opts.subject,
      content: opts.text,
      html: opts.html,
      replyTo: getEnv("KC_ADMIN_NOTIFICATION_EMAIL", DEFAULT_FROM_EMAIL),
    });
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }
}

async function findAuthUserByEmail(adminClient: SupabaseClientLike, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const result = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const users = Array.isArray(result.data?.users) ? result.data.users : [];
    const match = users.find((user: any) => normalizeEmail(user?.email) === email);
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}

async function safeCount(
  client: SupabaseClientLike,
  table: string,
  apply: (query: any) => any,
) {
  try {
    const query = apply(client.from(table).select("*", { count: "exact", head: true }));
    const { count, error } = await query;
    if (error) return { count: 0, error: error.message || String(error) };
    return { count: Number(count) || 0, error: null };
  } catch (error) {
    return { count: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function safeRows(
  client: SupabaseClientLike,
  table: string,
  columns: string,
  apply: (query: any) => any,
) {
  try {
    const { data, error } = await apply(client.from(table).select(columns));
    if (error) return { rows: [], error: error.message || String(error) };
    return { rows: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function extractStoragePath(value: unknown, bucket: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(profile-avatars|post-media|chat-media)\//.test(raw)) return raw;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = raw.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(raw.slice(idx + marker.length).split("?")[0]);
  return "";
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

async function getHelpRequest(adminClient: SupabaseClientLike, helpRequestId: string | null) {
  if (!helpRequestId) return null;
  const { data, error } = await adminClient
    .from("help_requests")
    .select("*")
    .eq("id", helpRequestId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function resolveTargetEmail(body: JsonObject, helpRequest: JsonObject | null) {
  const metadata = asObject(helpRequest?.metadata);
  return normalizeEmail(
    body.target_email ||
    metadata.account_email ||
    helpRequest?.contact_email ||
    "",
  );
}

function buildConfirmationEmail(email: string) {
  const subject = "Confirmacao de solicitacao de remocao de conta - KinoCampus";
  const phrase = "CONFIRMO A EXCLUSAO DA MINHA CONTA KINOCAMPUS";
  const baseUrl = getEnv("KC_APP_BASE_URL", DEFAULT_APP_BASE_URL).replace(/\/+$/, "");
  const text = [
    "Ola.",
    "",
    `Recebemos sua solicitacao de remocao da conta associada ao e-mail ${email}, com fundamento nos direitos previstos na LGPD.`,
    "",
    "Por seguranca, antes de executar a eliminacao irreversivel dos dados cadastrais, precisamos confirmar que a solicitacao partiu do titular da conta. Enquanto isso, iniciaremos o tratamento interno do pedido e poderemos restringir a visibilidade de dados vinculados a conta quando aplicavel.",
    "",
    "Para confirmar a exclusao definitiva, responda este e-mail com a frase:",
    "",
    phrase,
    "",
    "Apos a confirmacao, a conta sera removida e os dados cadastrais serao eliminados ou anonimizados conforme a Politica de Privacidade do KinoCampus e as hipoteses legais de retencao minima para seguranca, auditoria e exercicio regular de direitos.",
    "",
    "Caso tenha duvidas ou queira algum esclarecimento adicional, responda este e-mail ou entre em contato por contato@kinocampus.com.br.",
    "",
    "Agradecemos por ter usado o KinoCampus. Caso queira voltar futuramente, sera possivel criar uma nova conta na plataforma.",
    "",
    "Atenciosamente,",
    "KinoCampus",
    baseUrl,
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:620px;margin:0 auto;color:#1f2937;line-height:1.55">
      <div style="background:#ff6b00;border-radius:14px;padding:24px;text-align:center;color:#fff;margin-bottom:24px">
        <h1 style="margin:0;font-size:1.6rem">KinoCampus</h1>
        <p style="margin:6px 0 0;font-size:.85rem;letter-spacing:.15em;text-transform:uppercase">Comunidade UFG</p>
      </div>
      <p>Ola.</p>
      <p>Recebemos sua solicitacao de remocao da conta associada ao e-mail <strong>${escapeHtml(email)}</strong>, com fundamento nos direitos previstos na LGPD.</p>
      <p>Por seguranca, antes de executar a eliminacao irreversivel dos dados cadastrais, precisamos confirmar que a solicitacao partiu do titular da conta. Enquanto isso, iniciaremos o tratamento interno do pedido e poderemos restringir a visibilidade de dados vinculados a conta quando aplicavel.</p>
      <p>Para confirmar a exclusao definitiva, responda este e-mail com a frase:</p>
      <pre style="background:#111827;color:#fff;border-radius:10px;padding:12px;white-space:pre-wrap">${phrase}</pre>
      <p>Apos a confirmacao, a conta sera removida e os dados cadastrais serao eliminados ou anonimizados conforme a Politica de Privacidade do KinoCampus e as hipoteses legais de retencao minima para seguranca, auditoria e exercicio regular de direitos.</p>
      <p>Caso tenha duvidas, responda este e-mail ou entre em contato por <a href="mailto:contato@kinocampus.com.br" style="color:#ff6b00">contato@kinocampus.com.br</a>.</p>
      <p>Agradecemos por ter usado o KinoCampus. Caso queira voltar futuramente, sera possivel criar uma nova conta na plataforma.</p>
      <p style="color:#6b7280">Atenciosamente,<br/>KinoCampus<br/><a href="${escapeHtml(baseUrl)}" style="color:#ff6b00">${escapeHtml(baseUrl)}</a></p>
    </div>`;

  return { subject, text, html, phrase };
}

async function upsertWorkflow(
  adminClient: SupabaseClientLike,
  opts: {
    helpRequestId: string | null;
    userId: string | null;
    email: string;
    emailHash: string;
    adminUserId: string;
    counts?: JsonObject;
    status?: string;
    metadata?: JsonObject;
  },
) {
  let existing = null;
  if (opts.helpRequestId) {
    const { data, error } = await adminClient
      .from("account_erasure_requests")
      .select("*")
      .eq("help_request_id", opts.helpRequestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    existing = data || null;
  }
  if (!existing) {
    const { data, error } = await adminClient
      .from("account_erasure_requests")
      .select("*")
      .eq("email_hash", opts.emailHash)
      .neq("status", "erased")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    existing = data || null;
  }

  const domain = opts.email.includes("@") ? opts.email.split("@").pop() || null : null;
  const payload = {
    help_request_id: opts.helpRequestId,
    user_id: opts.userId,
    email_hash: opts.emailHash,
    target_email_domain: domain,
    processed_by: opts.adminUserId,
    counts: opts.counts || {},
    status: opts.status || "diagnosed",
    metadata: opts.metadata || {},
  };

  if (existing?.id) {
    const { data, error } = await adminClient
      .from("account_erasure_requests")
      .update({
        user_id: payload.user_id,
        target_email_domain: payload.target_email_domain,
        processed_by: payload.processed_by,
        counts: payload.counts,
        status: payload.status || existing.status || "diagnosed",
        metadata: { ...asObject(existing.metadata), ...payload.metadata },
      })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const { data, error } = await adminClient
    .from("account_erasure_requests")
    .insert(payload)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function buildDiagnostics(adminClient: SupabaseClientLike, userId: string | null, email: string) {
  if (!userId) {
    return {
      user_found: false,
      counts: {},
      warnings: ["auth_user_not_found"],
    };
  }

  const postRows = await safeRows(adminClient, "posts", "id,status,image_url,metadata", (query) => query.eq("author_id", userId));
  const postIds = postRows.rows.map((row: any) => row.id).filter(Boolean);
  const counts: JsonObject = {
    profiles: (await safeCount(adminClient, "profiles", (query) => query.eq("id", userId))).count,
    posts: postRows.rows.length,
    post_media: postIds.length ? (await safeCount(adminClient, "post_media", (query) => query.in("post_id", postIds))).count : 0,
    comments: (await safeCount(adminClient, "comments", (query) => query.eq("author_id", userId))).count,
    post_votes: (await safeCount(adminClient, "post_votes", (query) => query.eq("voter_id", userId))).count,
    saved_posts: (await safeCount(adminClient, "saved_posts", (query) => query.eq("user_id", userId))).count,
    reports: (await safeCount(adminClient, "reports", (query) => query.eq("reporter_id", userId))).count,
    help_requests: (await safeCount(adminClient, "help_requests", (query) => query.or(`user_id.eq.${userId},contact_email.eq.${email}`))).count,
    chat_conversations: (await safeCount(adminClient, "chat_conversations", (query) => query.or(`participant_low.eq.${userId},participant_high.eq.${userId}`))).count,
    chat_messages: (await safeCount(adminClient, "chat_messages", (query) => query.eq("sender_id", userId))).count,
    notification_preferences: (await safeCount(adminClient, "notification_preferences", (query) => query.eq("user_id", userId))).count,
    privacy_analytics_events: (await safeCount(adminClient, "privacy_analytics_events", (query) => query.eq("user_id", userId))).count,
    privacy_consent_events: (await safeCount(adminClient, "privacy_consent_events", (query) => query.eq("user_id", userId))).count,
  };

  return {
    user_found: true,
    counts,
    post_ids: postIds,
    warnings: postRows.error ? [postRows.error] : [],
  };
}

async function insertAudit(
  adminClient: SupabaseClientLike,
  action: string,
  requestId: string,
  adminUserId: string,
  payload: JsonObject,
) {
  const { error } = await adminClient.from("audit_log").insert({
    action,
    entity_type: "account_erasure_requests",
    entity_id: requestId,
    actor_id: adminUserId,
    payload,
  });
  if (error) console.error("[kc-account-erasure] audit insert failed:", error);
}

async function mergeHelpRequestMetadata(
  adminClient: SupabaseClientLike,
  helpRequest: JsonObject | null,
  patch: JsonObject,
  status?: string,
) {
  if (!helpRequest?.id) return null;
  const nextMetadata = { ...asObject(helpRequest.metadata), ...patch };
  const updates: JsonObject = { metadata: nextMetadata };
  if (status) updates.status = status;
  const { data, error } = await adminClient
    .from("help_requests")
    .update(updates)
    .eq("id", helpRequest.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function updateProfileReversible(adminClient: SupabaseClientLike, userId: string) {
  const payload = {
    profile_public: false,
    contact_cta_enabled: false,
    social_visibility: {},
  };
  const { error } = await adminClient.from("profiles").update(payload).eq("id", userId);
  if (!error) return null;
  const fallback = await adminClient.from("profiles").update({ profile_public: false }).eq("id", userId);
  return fallback.error ? fallback.error.message : error.message;
}

async function updateOwnedPostsReversible(adminClient: SupabaseClientLike, userId: string, requestId: string) {
  const { rows } = await safeRows(adminClient, "posts", "id,status,metadata", (query) => query.eq("author_id", userId));
  let updated = 0;
  for (const row of rows as any[]) {
    const currentMetadata = asObject(row.metadata);
    const nextMetadata = {
      ...currentMetadata,
      lgpd_erasure: {
        request_id: requestId,
        stage: "pending_confirmation",
        reversible_applied_at: new Date().toISOString(),
      },
    };
    const nextStatus = ["published", "pending", "closed", "expired"].includes(String(row.status || ""))
      ? "hidden"
      : String(row.status || "hidden");
    const { error } = await adminClient
      .from("posts")
      .update({ status: nextStatus, visibility: "community", metadata: nextMetadata })
      .eq("id", row.id);
    if (!error) updated += 1;
  }
  return updated;
}

async function removeStoragePaths(adminClient: SupabaseClientLike, paths: string[]) {
  const bucket = getEnv("KC_STORAGE_BUCKET", "kino-media");
  const clean = uniq(paths);
  const removed: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < clean.length; i += 50) {
    const chunk = clean.slice(i, i + 50);
    const { error } = await adminClient.storage.from(bucket).remove(chunk);
    if (error) errors.push(error.message || String(error));
    else removed.push(...chunk);
  }
  return { removed, errors };
}

async function collectStoragePaths(adminClient: SupabaseClientLike, userId: string, postIds: string[]) {
  const bucket = getEnv("KC_STORAGE_BUCKET", "kino-media");
  const paths: string[] = [];

  const profileRows = await safeRows(adminClient, "profiles", "avatar_path,avatar_url", (query) => query.eq("id", userId));
  for (const row of profileRows.rows as any[]) {
    paths.push(extractStoragePath(row.avatar_path, bucket));
    paths.push(extractStoragePath(row.avatar_url, bucket));
  }

  if (postIds.length) {
    const mediaRows = await safeRows(adminClient, "post_media", "url", (query) => query.in("post_id", postIds));
    for (const row of mediaRows.rows as any[]) paths.push(extractStoragePath(row.url, bucket));

    const postRows = await safeRows(adminClient, "posts", "image_url,metadata", (query) => query.in("id", postIds));
    for (const row of postRows.rows as any[]) {
      const metadata = asObject(row.metadata);
      paths.push(extractStoragePath(row.image_url, bucket));
      paths.push(extractStoragePath(metadata.image_url, bucket));
      paths.push(extractStoragePath(metadata.cover_url, bucket));
    }
  }

  const chatRows = await safeRows(adminClient, "chat_messages", "media_path", (query) => query.eq("sender_id", userId));
  for (const row of chatRows.rows as any[]) paths.push(extractStoragePath(row.media_path, bucket));

  return uniq(paths);
}

async function applyReversible(
  adminClient: SupabaseClientLike,
  opts: {
    request: JsonObject;
    helpRequest: JsonObject | null;
    userId: string | null;
    email: string;
    emailHash: string;
    adminUserId: string;
    diagnostics: JsonObject;
  },
) {
  const warnings: string[] = [];
  let hiddenPosts = 0;
  if (opts.userId) {
    const profileWarning = await updateProfileReversible(adminClient, opts.userId);
    if (profileWarning) warnings.push(`profile_update: ${profileWarning}`);
    hiddenPosts = await updateOwnedPostsReversible(adminClient, opts.userId, String(opts.request.id));
  }

  const emailDraft = buildConfirmationEmail(opts.email);
  let emailStatus = "not_sent";
  try {
    await sendEmail({ to: opts.email, subject: emailDraft.subject, html: emailDraft.html, text: emailDraft.text });
    emailStatus = "sent";
  } catch (error) {
    emailStatus = "draft_only";
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  const nextMetadata = {
    lgpd_erasure: {
      request_id: opts.request.id,
      email_hash: opts.emailHash,
      stage: "pending_confirmation",
      confirmation_email_status: emailStatus,
      updated_at: new Date().toISOString(),
    },
  };
  await mergeHelpRequestMetadata(adminClient, opts.helpRequest, nextMetadata, "in_progress");

  const { data, error } = await adminClient
    .from("account_erasure_requests")
    .update({
      status: "pending_confirmation",
      confirmation_requested_at: new Date().toISOString(),
      reversible_applied_at: new Date().toISOString(),
      counts: opts.diagnostics.counts || {},
      metadata: {
        ...asObject(opts.request.metadata),
        confirmation_email_status: emailStatus,
        hidden_posts: hiddenPosts,
        warnings,
      },
    })
    .eq("id", opts.request.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;

  await insertAudit(adminClient, "lgpd_erasure_reversible_applied", String(opts.request.id), opts.adminUserId, {
    email_hash: opts.emailHash,
    user_found: Boolean(opts.userId),
    hidden_posts: hiddenPosts,
    confirmation_email_status: emailStatus,
    warnings,
  });

  return { request: data, email: { status: emailStatus, draft: emailDraft }, warnings };
}

async function eraseConfirmed(
  adminClient: SupabaseClientLike,
  opts: {
    request: JsonObject;
    helpRequest: JsonObject | null;
    userId: string | null;
    email: string;
    emailHash: string;
    adminUserId: string;
    confirmationPhrase: string;
    diagnostics: JsonObject;
  },
) {
  const expected = `EXCLUIR ${opts.email}`;
  if (opts.confirmationPhrase !== expected) {
    return { ok: false, status: 409, error: "confirmation_phrase_mismatch", expected };
  }
  if (!opts.userId) return { ok: false, status: 404, error: "auth_user_not_found" };

  const postIds = Array.isArray((opts.diagnostics as any).post_ids) ? (opts.diagnostics as any).post_ids : [];
  const storagePaths = await collectStoragePaths(adminClient, opts.userId, postIds);
  const storageCleanup = await removeStoragePaths(adminClient, storagePaths);
  const nowIso = new Date().toISOString();
  const redactedEmail = `lgpd-${opts.emailHash.slice(0, 12)}@redacted.kinocampus.local`;

  for (const postId of postIds) {
    await adminClient
      .from("posts")
      .update({
        title: "Publicacao removida por solicitacao LGPD",
        description: "Conteudo removido por solicitacao LGPD.",
        location: null,
        status: "hidden",
        visibility: "community",
        image_url: null,
        metadata: {
          lgpd_erasure: {
            request_id: opts.request.id,
            erased_at: nowIso,
            content_removed: true,
          },
        },
      })
      .eq("id", postId);
  }

  if (postIds.length) {
    await adminClient.from("post_media").delete().in("post_id", postIds);
  }

  await adminClient
    .from("help_requests")
    .update({
      contact_email: redactedEmail,
      subject: "Solicitacao LGPD atendida",
      message: "Conteudo removido por solicitacao LGPD.",
      status: "resolved",
      metadata: {
        lgpd_erasure: {
          request_id: opts.request.id,
          email_hash: opts.emailHash,
          erased_at: nowIso,
          contact_redacted: true,
        },
      },
    })
    .or(`user_id.eq.${opts.userId},contact_email.eq.${opts.email}`);

  try {
    const signOutFn = (adminClient.auth.admin as any).signOut;
    if (typeof signOutFn === "function") await signOutFn.call(adminClient.auth.admin, opts.userId);
  } catch (error) {
    console.warn("[kc-account-erasure] admin signOut failed:", error);
  }

  const deleteResult = await adminClient.auth.admin.deleteUser(opts.userId);
  if (deleteResult.error) throw deleteResult.error;

  const receipt = {
    request_id: opts.request.id,
    email_hash: opts.emailHash,
    erased_at: nowIso,
    counts: opts.diagnostics.counts || {},
    storage_removed_count: storageCleanup.removed.length,
    storage_cleanup_errors: storageCleanup.errors,
  };

  const { data, error } = await adminClient
    .from("account_erasure_requests")
    .update({
      status: "erased",
      confirmed_at: nowIso,
      erased_at: nowIso,
      receipt,
      counts: opts.diagnostics.counts || {},
      metadata: {
        ...asObject(opts.request.metadata),
        storage_cleanup_errors: storageCleanup.errors,
      },
    })
    .eq("id", opts.request.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;

  await insertAudit(adminClient, "lgpd_erasure_confirmed", String(opts.request.id), opts.adminUserId, {
    email_hash: opts.emailHash,
    counts: opts.diagnostics.counts || {},
    storage_removed_count: storageCleanup.removed.length,
    storage_cleanup_errors: storageCleanup.errors,
  });

  return { ok: true, request: data, receipt, storage_cleanup: storageCleanup };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const ANON_KEY = getEnv("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: "missing_server_configuration" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { ok: false, error: "missing_authorization" });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json(401, { ok: false, error: "invalid_session" });

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) return json(403, { ok: false, error: "not_authorized" });

  let body: JsonObject;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const action = safeString(body.action, 40);
  const helpRequestId = safeString(body.help_request_id, 80);
  if (helpRequestId && !UUID_RE.test(helpRequestId)) return json(400, { ok: false, error: "invalid_help_request_id" });
  if (!["diagnose", "apply_reversible", "generate_receipt", "erase_confirmed"].includes(action)) {
    return json(400, { ok: false, error: "invalid_action" });
  }

  try {
    const helpRequest = await getHelpRequest(adminClient, helpRequestId || null);
    const email = resolveTargetEmail(body, helpRequest);
    if (!EMAIL_RE.test(email)) return json(400, { ok: false, error: "valid_target_email_required" });
    const emailHash = await sha256Hex(email);
    const authUser = await findAuthUserByEmail(adminClient, email);
    const userId = authUser?.id ? String(authUser.id) : null;
    const diagnostics = await buildDiagnostics(adminClient, userId, email);
    const request = await upsertWorkflow(adminClient, {
      helpRequestId: helpRequestId || null,
      userId,
      email,
      emailHash,
      adminUserId: user.id,
      counts: asObject((diagnostics as any).counts),
      status: action === "diagnose" ? "diagnosed" : undefined,
      metadata: {
        source: "admin-help-requests",
        auth_user_found: Boolean(userId),
        last_action: action,
      },
    });

    if (action === "diagnose") {
      await insertAudit(adminClient, "lgpd_erasure_diagnosed", String(request.id), user.id, {
        email_hash: emailHash,
        user_found: Boolean(userId),
        counts: asObject((diagnostics as any).counts),
      });
      return json(200, { ok: true, action, request, diagnostics, target: { email_hash: emailHash, user_found: Boolean(userId) } });
    }

    if (action === "apply_reversible") {
      const result = await applyReversible(adminClient, {
        request,
        helpRequest,
        userId,
        email,
        emailHash,
        adminUserId: user.id,
        diagnostics,
      });
      return json(200, { ok: true, action, diagnostics, ...result, target: { email_hash: emailHash, user_found: Boolean(userId) } });
    }

    if (action === "generate_receipt") {
      const receipt = {
        request_id: request.id,
        email_hash: emailHash,
        user_found: Boolean(userId),
        counts: asObject((diagnostics as any).counts),
        status: request.status,
        generated_at: new Date().toISOString(),
      };
      return json(200, { ok: true, action, request, diagnostics, receipt, target: { email_hash: emailHash, user_found: Boolean(userId) } });
    }

    const erase = await eraseConfirmed(adminClient, {
      request,
      helpRequest,
      userId,
      email,
      emailHash,
      adminUserId: user.id,
      confirmationPhrase: safeString(body.confirmation_phrase, 320),
      diagnostics,
    });
    if (!erase.ok) return json(Number(erase.status) || 409, erase as Record<string, unknown>);
    return json(200, { ok: true, action, diagnostics, ...erase, target: { email_hash: emailHash, user_found: Boolean(userId) } });
  } catch (error) {
    console.error("[kc-account-erasure] failed:", error);
    return json(500, {
      ok: false,
      error: "account_erasure_failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});
