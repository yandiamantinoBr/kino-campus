import { createClient } from "jsr:@supabase/supabase-js@2";

type ReasonCountMap = Record<string, number>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
const DEFAULT_THRESHOLD = 3;
const DEFAULT_COOLDOWN_HOURS = 24;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function asPositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function sanitizeBaseUrl(raw: string) {
  return raw.replace(/\/+$/, "");
}

function sanitizeReason(value: unknown) {
  const reason = typeof value === "string" ? value.trim().toLowerCase() : "";
  const normalized = reason.replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return normalized || "other";
}

function sanitizeSnippet(value: unknown, maxLength = 120) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

function formatReasonSummary(reasonCounts: ReasonCountMap) {
  return Object.entries(reasonCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(", ");
}

async function verifySignature(req: Request, postIdFromBody: string, secret: string) {
  const signature = req.headers.get("x-kc-signature")?.trim().toLowerCase() ?? "";
  const timestampRaw = req.headers.get("x-kc-timestamp")?.trim() ?? "";
  const postIdHeader = req.headers.get("x-kc-post-id")?.trim().toLowerCase() ?? "";

  if (
    !signature ||
    !timestampRaw ||
    !/^\d+$/.test(timestampRaw) ||
    !UUID_RE.test(postIdHeader)
  ) {
    return { ok: false, reason: "missing_or_invalid_signature_headers" } as const;
  }

  if (postIdHeader !== postIdFromBody) {
    return { ok: false, reason: "post_id_mismatch" } as const;
  }

  const timestamp = Number.parseInt(timestampRaw, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > SIGNATURE_MAX_AGE_SECONDS) {
    return { ok: false, reason: "stale_signature" } as const;
  }

  const expected = await hmacSha256Hex(secret, `${timestampRaw}.${postIdHeader}`);
  if (!timingSafeEqual(expected, signature)) {
    return { ok: false, reason: "signature_mismatch" } as const;
  }

  return { ok: true } as const;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (_) {
    return json(400, { ok: false, error: "invalid_request_body" });
  }

  let payload: { post_id?: unknown };
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch (_) {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const postId = typeof payload.post_id === "string" ? payload.post_id.trim().toLowerCase() : "";
  if (!UUID_RE.test(postId)) {
    return json(400, { ok: false, error: "invalid_post_id" });
  }

  let signatureSecret = "";
  let webhookUrl = "";
  let appBaseUrl = "";
  let supabaseUrl = "";
  let serviceRoleKey = "";
  let threshold = DEFAULT_THRESHOLD;
  let cooldownHours = DEFAULT_COOLDOWN_HOURS;

  try {
    signatureSecret = getRequiredEnv("KC_NOTIFY_HMAC_SECRET");
    webhookUrl = getRequiredEnv("ADMIN_REPORTS_WEBHOOK_URL");
    appBaseUrl = sanitizeBaseUrl(getRequiredEnv("KC_APP_BASE_URL"));
    supabaseUrl = getRequiredEnv("SUPABASE_URL");
    serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    threshold = asPositiveInt(Deno.env.get("REPORTS_THRESHOLD"), DEFAULT_THRESHOLD);
    cooldownHours = asPositiveInt(Deno.env.get("REPORTS_NOTIFY_COOLDOWN_HOURS"), DEFAULT_COOLDOWN_HOURS);
  } catch (error) {
    console.error("[notify-admin-reports-threshold] missing configuration", error);
    return json(500, { ok: false, error: "missing_server_configuration" });
  }

  const signatureCheck = await verifySignature(req, postId, signatureSecret);
  if (!signatureCheck.ok) {
    return json(401, { ok: false, error: "unauthorized", reason: signatureCheck.reason });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: openReports, error: reportsError } = await supabase
      .from("reports")
      .select("reason")
      .eq("post_id", postId)
      .eq("status", "open");

    if (reportsError) {
      throw new Error(`reports_query_failed:${reportsError.message}`);
    }

    const reasonCounts: ReasonCountMap = {};
    for (const report of openReports ?? []) {
      const reason = sanitizeReason((report as { reason?: unknown }).reason);
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }

    const openReportsCount = openReports?.length ?? 0;
    if (openReportsCount < threshold) {
      return json(200, {
        ok: true,
        skipped: "below_threshold",
        threshold,
        open_reports_count: openReportsCount,
      });
    }

    const cooldownSince = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
    const { data: recentNotification, error: recentNotificationError } = await supabase
      .from("audit_log")
      .select("id, created_at")
      .eq("action", "reports_threshold_notified")
      .eq("entity_type", "posts")
      .eq("entity_id", postId)
      .gte("created_at", cooldownSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      recentNotificationError &&
      recentNotificationError.code !== "PGRST116"
    ) {
      throw new Error(`audit_log_query_failed:${recentNotificationError.message}`);
    }

    if (recentNotification) {
      return json(200, {
        ok: true,
        skipped: "cooldown_active",
        threshold,
        open_reports_count: openReportsCount,
        last_notified_at: recentNotification.created_at,
      });
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, legacy_id, title")
      .eq("id", postId)
      .maybeSingle();

    if (postError) {
      throw new Error(`post_lookup_failed:${postError.message}`);
    }

    const postPublicRef = post?.legacy_id ? String(post.legacy_id) : postId;
    const postLink = `${appBaseUrl}/product.html?id=${encodeURIComponent(postPublicRef)}`;
    const titleSnippet = sanitizeSnippet(post?.title);
    const reasonSummary = formatReasonSummary(reasonCounts);

    const textLines = [
      "[Kino Campus] Limiar de denuncias atingido",
      `Post ref: ${postPublicRef}`,
      titleSnippet ? `Titulo: ${titleSnippet}` : "",
      `Reports abertos: ${openReportsCount}`,
      `Motivos: ${reasonSummary || "n/a"}`,
      `Link: ${postLink}`,
    ].filter(Boolean);
    const message = textLines.join("\n");

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        content: message,
        post_id: postId,
        post_link: postLink,
        open_reports_count: openReportsCount,
        threshold,
        reasons: reasonCounts,
      }),
    });

    if (!webhookResponse.ok) {
      const webhookBody = sanitizeSnippet(await webhookResponse.text(), 300);
      throw new Error(
        `webhook_failed:${webhookResponse.status}:${webhookBody || "empty_response"}`,
      );
    }

    const { error: auditInsertError } = await supabase
      .from("audit_log")
      .insert({
        actor_id: null,
        action: "reports_threshold_notified",
        entity_type: "posts",
        entity_id: postId,
        payload: {
          channel: "webhook",
          threshold,
          cooldown_hours: cooldownHours,
          open_reports_count: openReportsCount,
          reasons: reasonCounts,
          post_link: postLink,
          ...(titleSnippet ? { post_title_snippet: titleSnippet } : {}),
        },
      });

    if (auditInsertError) {
      throw new Error(`audit_log_insert_failed:${auditInsertError.message}`);
    }

    return json(200, {
      ok: true,
      notified: true,
      channel: "webhook",
      threshold,
      open_reports_count: openReportsCount,
      reasons: reasonCounts,
      post_link: postLink,
    });
  } catch (error) {
    console.error("[notify-admin-reports-threshold] execution failed", error);
    return json(500, { ok: false, error: "internal_error" });
  }
});
