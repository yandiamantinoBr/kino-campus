// Returns an opaque, stable GA4 User-ID for an authenticated KinoCampus user.
// The Supabase UUID never leaves this function and the HMAC secret never leaves
// the Edge Functions runtime.

import { createClient } from "@supabase/supabase-js";
import {
  createAnalyticsSubjectId,
  isValidAnalyticsIdSecret,
} from "./subject.ts";

const MAX_BODY_BYTES = 1024;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.kinocampus.com.br",
  "https://kinocampus.com.br",
];

const BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function allowedOrigins(): string[] {
  const raw = env("KC_ANALYTICS_ID_ALLOWED_ORIGINS");
  if (!raw) return [...DEFAULT_ALLOWED_ORIGINS];

  const parsed = raw.split(",").map((value) => value.trim()).filter((value) => {
    try {
      const url = new URL(value);
      return value !== "*" && url.protocol === "https:" && url.origin === value;
    } catch (_) {
      return false;
    }
  });
  return parsed.length ? [...new Set(parsed)] : [...DEFAULT_ALLOWED_ORIGINS];
}

function headersFor(req: Request): Record<string, string> {
  const headers = { ...BASE_HEADERS };
  const origin = req.headers.get("origin") ?? "";
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function json(
  req: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headersFor(req),
    },
  });
}

async function bodyIsWithinLimit(req: Request): Promise<boolean> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return false;
  if (!req.body) return true;

  const reader = req.body.getReader();
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return true;
      received += chunk.value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        return false;
      }
    }
  } catch (_) {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins().includes(origin)) {
    return json(req, 403, { ok: false, error: "origin_not_allowed" });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headersFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!(await bodyIsWithinLimit(req))) {
    return json(req, 413, { ok: false, error: "request_too_large" });
  }

  const bearer = /^Bearer\s+([^\s]+)$/i.exec(
    req.headers.get("authorization")?.trim() ?? "",
  );
  if (!bearer) {
    return json(req, 401, { ok: false, error: "authentication_required" });
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") ||
    env("SUPABASE_SECRET_KEY");
  const analyticsSecret = env("KC_ANALYTICS_ID_SECRET");
  if (
    !supabaseUrl || !serviceKey || !isValidAnalyticsIdSecret(analyticsSecret)
  ) {
    return json(req, 503, { ok: false, error: "configuration_unavailable" });
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.getUser(bearer[1]);
    const userId = data?.user?.id ?? "";
    if (error || !userId) {
      return json(req, 401, { ok: false, error: "authentication_required" });
    }

    const subjectId = await createAnalyticsSubjectId(analyticsSecret, userId);
    return json(req, 200, { ok: true, subjectId });
  } catch (_) {
    return json(req, 503, { ok: false, error: "subject_id_unavailable" });
  }
});
