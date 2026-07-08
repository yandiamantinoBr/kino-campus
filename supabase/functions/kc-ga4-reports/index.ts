// KinoCampus -- Edge Function: kc-ga4-reports (v8.6.4)
//
// Server-side proxy for Google Analytics 4 Data API.
//
// Why this exists (Phase 2 of GA4-AUDIT-2026-07-08):
// - The frontend already sends kc_* events via KCEvents.track() (Phase 1).
// - Browsers cannot reliably render rich GA4 reports from inside the SPA
//   without exposing service-account credentials.
// - This function lets authorized admins query GA4 Data API server-side
//   and feed the Admin Privacy Analytics dashboard with historical +
//   segmented data the frontend cannot see.
//
// Auth flow:
// - Service Account JSON is stored as Edge Function secret
//   KC_GA4_SA_KEY (raw JSON string). NO file upload required.
// - We sign a JWT with RS256 using the SA private key (Web Crypto),
//   exchange it for an OAuth2 access token, and call the Data API.
// - Token is cached in memory until expiry.
//
// Required secrets (set via supabase secrets set ...):
//   - KC_GA4_SA_KEY            full JSON string of the service account key
//   - KC_GA4_PROPERTY_ID       numeric GA4 property ID (e.g. 540208497)
//
// Optional:
//   - KC_GA4_CACHE_TTL_SEC     default 300 (5 min)
//   - KC_GA4_ALLOWED_ORIGINS   default "*" (frontend pages in same origin)
//
// Auth for the caller:
// - Caller must be authenticated as admin (profile.is_admin = true).
// - The function reads Authorization: Bearer <supabase_jwt> and validates
//   via service-role client. Non-admin requests get 403.

import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

// ── Helpers ──────────────────────────────────────────────────────────────
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function getEnv(name: string, fallback = ""): string {
  return (Deno.env.get(name) ?? "").trim() || fallback;
}

function asText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Strip trailing slashes for URL joining
function trimPath(p: string): string {
  return p.replace(/\/+$/, "");
}

// ── Service Account JWT → OAuth2 token ───────────────────────────────────
interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
}

let cachedToken: { token: string; expiresAtMs: number } | null = null;

function base64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM envelope and whitespace
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken(saKey: ServiceAccountKey): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.token;
  }

  const key = await importPrivateKey(saKey.private_key);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const claim = base64url(JSON.stringify({
    iss: saKey.client_email,
    scope: GA4_SCOPE,
    aud: saKey.token_uri || TOKEN_URL,
    iat,
    exp,
  }));
  const signingInput = `${header}.${claim}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch(saKey.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`token_exchange_failed ${tokenRes.status}: ${errText.slice(0, 200)}`);
  }
  const data = await tokenRes.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("token_response_missing_access_token");

  cachedToken = {
    token: data.access_token,
    expiresAtMs: now + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.token;
}

// ── Caller auth ──────────────────────────────────────────────────────────
interface CallerContext {
  isAdmin: boolean;
  userId: string | null;
}

async function resolveCaller(req: Request): Promise<CallerContext> {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!jwt) return { isAdmin: false, userId: null };

  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return { isAdmin: false, userId: null };

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id ?? null;
    if (!userId) return { isAdmin: false, userId: null };

    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    return { isAdmin: profile?.is_admin === true, userId };
  } catch (_) {
    return { isAdmin: false, userId: null };
  }
}

// ── Cache ────────────────────────────────────────────────────────────────
interface CacheEntry { body: unknown; expiresAtMs: number }
const responseCache = new Map<string, CacheEntry>();

function cacheGet(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAtMs < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.body;
}

function cacheSet(key: string, body: unknown, ttlSec: number): void {
  if (responseCache.size > 50) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey !== undefined) responseCache.delete(firstKey);
  }
  responseCache.set(key, { body, expiresAtMs: Date.now() + ttlSec * 1000 });
}

// ── Data API proxy ───────────────────────────────────────────────────────
async function callDataApi(
  saKey: ServiceAccountKey,
  propertyId: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const token = await getAccessToken(saKey);
  const url = `${DATA_API_BASE}/${trimPath(path)}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...body,
      property: `properties/${propertyId}`,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ga4_data_api_${res.status}: ${errText.slice(0, 400)}`);
  }
  return await res.json();
}

// ── Request handlers ─────────────────────────────────────────────────────
function buildRequestKey(body: Record<string, unknown>): string {
  const stable = JSON.stringify(body, Object.keys(body).sort());
  let hash = 0;
  for (let i = 0; i < stable.length; i++) {
    hash = (hash * 31 + stable.charCodeAt(i)) | 0;
  }
  return `runReport:${hash}`;
}

interface RunReportRequest {
  dateRanges?: Array<{ startDate: string; endDate: string }>;
  metrics?: Array<{ name: string }>;
  dimensions?: Array<{ name: string }>;
  limit?: number;
  offset?: number;
  orderBys?: Array<Record<string, unknown>>;
  dimensionFilter?: Record<string, unknown>;
  metricFilter?: Record<string, unknown>;
}

function validateRequest(input: unknown): { ok: true; value: RunReportRequest } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "body must be object" };
  const v = input as Record<string, unknown>;

  if (!Array.isArray(v.dateRanges) || v.dateRanges.length === 0) {
    return { ok: false, error: "dateRanges[] required" };
  }
  for (const dr of v.dateRanges) {
    if (!dr || typeof dr !== "object" || typeof (dr as Record<string, unknown>).startDate !== "string" || typeof (dr as Record<string, unknown>).endDate !== "string") {
      return { ok: false, error: "each dateRange needs startDate and endDate" };
    }
  }

  if (!Array.isArray(v.metrics) || v.metrics.length === 0) {
    return { ok: false, error: "metrics[] required" };
  }
  for (const m of v.metrics) {
    if (!m || typeof m !== "object" || typeof (m as Record<string, unknown>).name !== "string") {
      return { ok: false, error: "each metric needs {name}" };
    }
  }

  if (v.dimensions !== undefined && !Array.isArray(v.dimensions)) {
    return { ok: false, error: "dimensions must be array" };
  }

  if (v.limit !== undefined) {
    const n = Number(v.limit);
    if (!Number.isFinite(n) || n < 1 || n > 250000) {
      return { ok: false, error: "limit must be 1..250000" };
    }
  }

  return { ok: true, value: v as RunReportRequest };
}

async function handleRunReport(
  saKey: ServiceAccountKey,
  propertyId: string,
  body: unknown,
): Promise<Response> {
  const validation = validateRequest(body);
  if (!validation.ok) return json(400, { error: validation.error });

  const cacheTtl = asNumber(getEnv("KC_GA4_CACHE_TTL_SEC", "300"), 300);
  const cacheKey = buildRequestKey(validation.value);
  const cached = cacheGet(cacheKey);
  if (cached) return json(200, { ok: true, cached: true, data: cached });

  try {
    const data = await callDataApi(saKey, propertyId, "", validation.value);
    cacheSet(cacheKey, data, cacheTtl);
    return json(200, { ok: true, cached: false, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuth = msg.includes("401") || msg.includes("403") || msg.includes("token");
    return json(isAuth ? 502 : 500, { ok: false, error: msg });
  }
}

// ── Router ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const path = new URL(req.url).pathname.replace(/\/$/, "");
  const isRunReport = path.endsWith("/runReport") || path === "" || path.endsWith("/kc-ga4-reports");

  if (req.method !== "POST" || !isRunReport) {
    return json(405, { error: "method_not_allowed" });
  }

  const caller = await resolveCaller(req);
  if (!caller.isAdmin) {
    return json(403, { error: "admin_required" });
  }

  const saKeyJson = getEnv("KC_GA4_SA_KEY");
  const propertyId = getEnv("KC_GA4_PROPERTY_ID");
  if (!saKeyJson || !propertyId) {
    return json(503, {
      error: "missing_config",
      detail: "Set KC_GA4_SA_KEY and KC_GA4_PROPERTY_ID via supabase secrets set",
    });
  }

  let saKey: ServiceAccountKey;
  try {
    saKey = JSON.parse(saKeyJson) as ServiceAccountKey;
    if (!saKey.private_key || !saKey.client_email) {
      throw new Error("SA key missing private_key or client_email");
    }
  } catch (e) {
    return json(503, { error: "invalid_sa_key", detail: e instanceof Error ? e.message : String(e) });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (_) {
    return json(400, { error: "invalid_json" });
  }

  return await handleRunReport(saKey, propertyId, body);
});