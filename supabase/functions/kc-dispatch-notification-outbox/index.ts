import { createClient } from "jsr:@supabase/supabase-js@2";

type OutboxRow = {
  id: string;
  channel: "email" | "whatsapp";
  status: string;
  next_attempt_at: string;
  error_code: string | null;
  created_at: string;
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
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function parsePositiveInt(raw: unknown, fallback: number, max = 200) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeChannel(value: unknown) {
  const channel = String(value ?? "").trim().toLowerCase();
  if (channel === "email" || channel === "whatsapp") return channel;
  return null;
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

  const providerByChannel = {
    email: Deno.env.get("KC_NOTIFICATION_EMAIL_PROVIDER")?.trim() || null,
    whatsapp: Deno.env.get("KC_NOTIFICATION_WHATSAPP_PROVIDER")?.trim() || null,
  } as const;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let query = supabase
      .from("notification_delivery_outbox")
      .select("id, channel, status, next_attempt_at, error_code, created_at", { count: "exact" })
      .in("status", ["queued", "failed", "blocked"])
      .order("created_at", { ascending: true })
      .limit(batchLimit);

    if (channelFilter) {
      query = query.eq("channel", channelFilter);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[kc-dispatch-notification-outbox] outbox query failed", error);
      return json(500, { ok: false, error: "outbox_query_failed" });
    }

    const rows = Array.isArray(data) ? (data as OutboxRow[]) : [];
    const byChannel = { email: 0, whatsapp: 0 };
    const byStatus: Record<string, number> = {};
    const dispatchablePreview: string[] = [];
    const blockedPreview: string[] = [];

    for (const row of rows) {
      if (row.channel === "email" || row.channel === "whatsapp") {
        byChannel[row.channel] += 1;
      }
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;

      const providerReady = Boolean(providerByChannel[row.channel]);
      if (row.status === "queued" && providerReady && dispatchablePreview.length < 10) {
        dispatchablePreview.push(row.id);
      }
      if (row.status === "blocked" && blockedPreview.length < 10) {
        blockedPreview.push(row.id);
      }
    }

    const providerReady = {
      email: Boolean(providerByChannel.email),
      whatsapp: Boolean(providerByChannel.whatsapp),
    };

    return json(200, {
      ok: true,
      mode: dryRun ? "dry_run" : "inspection_only",
      note: "Foundation only in v11.20.2; provider dispatch remains disabled.",
      provider_ready: providerReady,
      provider_names: providerByChannel,
      batch_limit: batchLimit,
      selected_count: rows.length,
      total_matching_count: count ?? rows.length,
      channel_filter: channelFilter,
      by_channel: byChannel,
      by_status: byStatus,
      dispatchable_preview_ids: dispatchablePreview,
      blocked_preview_ids: blockedPreview,
      provider_not_configured: Object.entries(providerReady)
        .filter(([, ready]) => !ready)
        .map(([channel]) => channel),
    });
  } catch (error) {
    console.error("[kc-dispatch-notification-outbox] execution failed", error);
    return json(500, { ok: false, error: "internal_error" });
  }
});
