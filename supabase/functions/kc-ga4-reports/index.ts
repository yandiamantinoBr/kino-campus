// KinoCampus -- Edge Function: kc-ga4-reports (v8.6.5)
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
//   - KC_GA4_ALLOWED_ORIGINS   comma-separated HTTPS origins
//   - KC_GA4_MAX_LIMIT         default 1000 (hard cap 10000)
//
// Auth for the caller:
// - Caller must be authenticated as admin (profile.is_admin = true).
// - The function reads Authorization: Bearer <supabase_jwt> and validates
//   via service-role client. Non-admin requests get 403.

import { createClient } from "@supabase/supabase-js";
import {
  parseServiceAccountSecret,
  type ServiceAccountKey,
} from "../_shared/google-service-account.ts";

// ── Constants ────────────────────────────────────────────────────────────
const COMMON_CORS_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const DEFAULT_MAX_LIMIT = 1000;
const HARD_MAX_LIMIT = 10000;
const DEFAULT_CACHE_TTL_SEC = 300;
const MAX_CACHE_TTL_SEC = 3600;
const MAX_RESPONSE_CACHE_ENTRIES = 50;
const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.kinocampus.com.br",
  "https://kinocampus.com.br",
];

// ── Helpers ──────────────────────────────────────────────────────────────
function readAllowedOrigins(): string[] {
  const raw = (Deno.env.get("KC_GA4_ALLOWED_ORIGINS") ?? "").trim();
  if (!raw) return [...DEFAULT_ALLOWED_ORIGINS];
  const origins = raw.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "*")
    .map((origin) => {
      try {
        const parsed = new URL(origin);
        if (
          parsed.protocol !== "https:" || parsed.username || parsed.password ||
          parsed.pathname !== "/" || parsed.search || parsed.hash
        ) return null;
        return parsed.origin;
      } catch (_) {
        return null;
      }
    })
    .filter((origin): origin is string => origin !== null);
  return origins.length > 0
    ? [...new Set(origins)]
    : [...DEFAULT_ALLOWED_ORIGINS];
}

function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return readAllowedOrigins().includes(origin);
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = readAllowedOrigins();
  const headers: Record<string, string> = { ...COMMON_CORS_HEADERS };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeadersFor(req),
    },
  });
}

function getEnv(name: string, fallback = ""): string {
  return (Deno.env.get(name) ?? "").trim() || fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInteger(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GOOGLE_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (_) {
    throw new Error(
      controller.signal.aborted ? "google_timeout" : "google_unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ── Service Account JWT → OAuth2 token ───────────────────────────────────
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
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}

function importPrivateKey(pem: string): Promise<CryptoKey> {
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
    aud: TOKEN_URL,
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

  const tokenRes = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error("service_account_auth_failed");
  }
  const data = await tokenRes.json() as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("token_response_missing_access_token");
  }

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
interface CacheEntry {
  body: unknown;
  expiresAtMs: number;
}
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
  while (
    !responseCache.has(key) && responseCache.size >= MAX_RESPONSE_CACHE_ENTRIES
  ) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey !== undefined) responseCache.delete(firstKey);
    else break;
  }
  responseCache.set(key, { body, expiresAtMs: Date.now() + ttlSec * 1000 });
}

// ── Data API proxy ───────────────────────────────────────────────────────
async function callDataApi(
  saKey: ServiceAccountKey,
  propertyId: string,
  body: RunReportRequest,
): Promise<unknown> {
  const token = await getAccessToken(saKey);
  const url = `${DATA_API_BASE}/properties/${
    encodeURIComponent(propertyId)
  }:runReport`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("ga4_not_authorized");
    }
    if (res.status === 429) throw new Error("ga4_rate_limited");
    if (res.status >= 500) throw new Error("ga4_unavailable");
    throw new Error("ga4_request_rejected");
  }
  return await res.json();
}

// ── Request handlers ─────────────────────────────────────────────────────
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${
    entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${stableStringify(item)}`
    ).join(",")
  }}`;
}

function buildRequestKey(body: unknown): string {
  const stable = stableStringify(body);
  let hash = 0;
  for (let i = 0; i < stable.length; i++) {
    hash = (hash * 31 + stable.charCodeAt(i)) | 0;
  }
  return `runReport:${hash >>> 0}`;
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

function validateRequest(
  input: unknown,
  maxLimit: number,
): { ok: true; value: RunReportRequest } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "body must be object" };
  }
  const v = input as Record<string, unknown>;
  const allowedKeys = new Set([
    "dateRanges",
    "metrics",
    "dimensions",
    "limit",
    "offset",
    "orderBys",
    "dimensionFilter",
    "metricFilter",
  ]);
  if (Object.keys(v).some((key) => !allowedKeys.has(key))) {
    return { ok: false, error: "unsupported request field" };
  }

  if (
    !Array.isArray(v.dateRanges) || v.dateRanges.length === 0 ||
    v.dateRanges.length > 4
  ) {
    return { ok: false, error: "dateRanges must contain 1..4 items" };
  }
  for (const dr of v.dateRanges) {
    if (!dr || typeof dr !== "object") {
      return { ok: false, error: "each dateRange needs startDate and endDate" };
    }
    const dateRange = dr as Record<string, unknown>;
    const keys = Object.keys(dateRange);
    const validDate = (value: unknown): boolean => {
      if (typeof value !== "string") return false;
      if (/^(?:today|yesterday|\d{1,4}daysAgo)$/.test(value)) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value;
    };
    if (
      keys.some((key) =>
        key !== "startDate" && key !== "endDate" && key !== "name"
      ) ||
      !validDate(dateRange.startDate) ||
      !validDate(dateRange.endDate) ||
      (dateRange.name !== undefined &&
        (typeof dateRange.name !== "string" ||
          !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(dateRange.name)))
    ) return { ok: false, error: "invalid dateRange" };
  }

  const validFieldName = (value: unknown): boolean =>
    typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(value);

  if (
    !Array.isArray(v.metrics) || v.metrics.length === 0 || v.metrics.length > 10
  ) {
    return { ok: false, error: "metrics must contain 1..10 items" };
  }
  for (const m of v.metrics) {
    if (
      !m ||
      typeof m !== "object" ||
      Object.keys(m as Record<string, unknown>).some((key) => key !== "name") ||
      !validFieldName((m as Record<string, unknown>).name)
    ) {
      return { ok: false, error: "each metric needs {name}" };
    }
  }

  if (v.dimensions !== undefined) {
    if (!Array.isArray(v.dimensions) || v.dimensions.length > 9) {
      return { ok: false, error: "dimensions must contain 0..9 items" };
    }
    for (const dimension of v.dimensions) {
      if (
        !dimension ||
        typeof dimension !== "object" ||
        Object.keys(dimension as Record<string, unknown>).some((key) =>
          key !== "name"
        ) ||
        !validFieldName((dimension as Record<string, unknown>).name)
      ) return { ok: false, error: "each dimension needs {name}" };
    }
  }

  if (
    v.orderBys !== undefined &&
    (!Array.isArray(v.orderBys) || v.orderBys.length > 10)
  ) {
    return { ok: false, error: "orderBys must contain 0..10 items" };
  }
  if (
    v.dimensionFilter !== undefined &&
    (!v.dimensionFilter || typeof v.dimensionFilter !== "object" ||
      Array.isArray(v.dimensionFilter))
  ) {
    return { ok: false, error: "dimensionFilter must be object" };
  }
  if (
    v.metricFilter !== undefined &&
    (!v.metricFilter || typeof v.metricFilter !== "object" ||
      Array.isArray(v.metricFilter))
  ) {
    return { ok: false, error: "metricFilter must be object" };
  }

  if (v.limit !== undefined) {
    if (
      typeof v.limit !== "number" || !Number.isInteger(v.limit) ||
      v.limit < 1 || v.limit > maxLimit
    ) {
      return { ok: false, error: `limit must be integer 1..${maxLimit}` };
    }
  }

  if (v.offset !== undefined) {
    if (
      typeof v.offset !== "number" || !Number.isInteger(v.offset) ||
      v.offset < 0 || v.offset > 100000
    ) {
      return { ok: false, error: "offset must be integer 0..100000" };
    }
  }

  return { ok: true, value: v as RunReportRequest };
}

async function handleRunReport(
  req: Request,
  saKey: ServiceAccountKey,
  propertyId: string,
  body: unknown,
): Promise<Response> {
  const maxLimit = clampInteger(
    asNumber(
      getEnv("KC_GA4_MAX_LIMIT", String(DEFAULT_MAX_LIMIT)),
      DEFAULT_MAX_LIMIT,
    ),
    1,
    HARD_MAX_LIMIT,
  );
  const validation = validateRequest(body, maxLimit);
  if (!validation.ok) return json(req, 400, { error: validation.error });

  const cacheTtl = clampInteger(
    asNumber(
      getEnv("KC_GA4_CACHE_TTL_SEC", String(DEFAULT_CACHE_TTL_SEC)),
      DEFAULT_CACHE_TTL_SEC,
    ),
    0,
    MAX_CACHE_TTL_SEC,
  );
  const cacheKey = buildRequestKey(validation.value);
  const cached = cacheGet(cacheKey);
  if (cached) return json(req, 200, { ok: true, cached: true, data: cached });

  try {
    const data = await callDataApi(saKey, propertyId, validation.value);
    cacheSet(cacheKey, data, cacheTtl);
    return json(req, 200, { ok: true, cached: false, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const knownCodes = new Set([
      "service_account_auth_failed",
      "ga4_not_authorized",
      "ga4_rate_limited",
      "ga4_unavailable",
      "ga4_request_rejected",
      "google_timeout",
      "google_unavailable",
    ]);
    const code = knownCodes.has(msg) ? msg : "ga4_internal_error";
    const status = code === "ga4_rate_limited"
      ? 503
      : code === "ga4_internal_error"
      ? 500
      : 502;
    return json(req, status, { ok: false, error: code });
  }
}

function readSaKeyRaw(): string {
  // Do not trim: JSON secrets may be multi-line or base64-wrapped.
  return Deno.env.get("KC_GA4_SA_KEY") ?? "";
}

function resolveServiceAccount():
  | {
    ok: true;
    key: ServiceAccountKey;
    diagnostics: Record<string, unknown>;
  }
  | {
    ok: false;
    error: "missing_config" | "invalid_sa_key";
    reason?: string;
    diagnostics?: Record<string, unknown>;
  } {
  const saKeyJson = readSaKeyRaw();
  if (!saKeyJson) {
    return { ok: false, error: "missing_config" };
  }
  const parsed = parseServiceAccountSecret(saKeyJson);
  if (!parsed.ok) {
    return {
      ok: false,
      error: "invalid_sa_key",
      reason: parsed.reason,
      diagnostics: parsed.diagnostics as unknown as Record<string, unknown>,
    };
  }
  return {
    ok: true,
    key: parsed.key,
    diagnostics: parsed.diagnostics as unknown as Record<string, unknown>,
  };
}

async function handleDiagnose(
  req: Request,
  propertyId: string,
  saResolved: ReturnType<typeof resolveServiceAccount>,
): Promise<Response> {
  const saKey = saResolved.ok ? saResolved.key : null;
  const base: Record<string, unknown> = {
    ok: true,
    action: "diagnose",
    property_id_configured: /^\d{6,20}$/.test(propertyId),
    property_id_length: propertyId.length,
    sa_key_present: !!readSaKeyRaw(),
    sa_key_length: readSaKeyRaw().length,
    sa_parse_ok: !!saKey,
    sa_parse_reason: saResolved.ok
      ? null
      : ("reason" in saResolved ? saResolved.reason ?? null : null),
    sa_diagnostics: ("diagnostics" in saResolved
      ? saResolved.diagnostics
      : null) ?? null,
    oauth_ok: false,
    data_api_ok: false,
    client_email_domain_ok: saKey
      ? /\.gserviceaccount\.com$/i.test(saKey.client_email)
      : false,
  };

  if (!saKey || !/^\d{6,20}$/.test(propertyId)) {
    return json(req, 200, base);
  }

  try {
    const token = await getAccessToken(saKey);
    base.oauth_ok = !!token;
    const probe = await callDataApi(saKey, propertyId, {
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      metrics: [{ name: "sessions" }],
      limit: 1,
    });
    base.data_api_ok = !!probe;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    base.data_api_ok = false;
    base.probe_error = msg;
  }

  return json(req, 200, base);
}

// ── Router ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(req)) {
      return json(req, 403, { error: "origin_not_allowed" });
    }
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }

  if (!isOriginAllowed(req)) {
    return json(req, 403, { error: "origin_not_allowed" });
  }

  const path = new URL(req.url).pathname.replace(/\/$/, "");
  const isRunReport = path.endsWith("/runReport") || path === "" ||
    path.endsWith("/kc-ga4-reports");

  if (req.method !== "POST" || !isRunReport) {
    return json(req, 405, { error: "method_not_allowed" });
  }

  const caller = await resolveCaller(req);
  if (!caller.isAdmin) {
    return json(req, 403, { error: "admin_required" });
  }

  const propertyId = getEnv("KC_GA4_PROPERTY_ID");
  const saResolved = resolveServiceAccount();

  let body: unknown;
  try {
    const declaredLength = Number(req.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES
    ) {
      return json(req, 413, { error: "body_too_large" });
    }
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY_BYTES) {
      return json(req, 413, { error: "body_too_large" });
    }
    body = text.trim() ? JSON.parse(text) : {};
  } catch (_) {
    return json(req, 400, { error: "invalid_json" });
  }

  const action = body && typeof body === "object" && !Array.isArray(body)
    ? String((body as Record<string, unknown>).action || "runReport")
    : "runReport";

  if (action === "diagnose") {
    return await handleDiagnose(req, propertyId, saResolved);
  }

  if (!propertyId || !readSaKeyRaw()) {
    return json(req, 503, {
      error: "missing_config",
      detail:
        "Set KC_GA4_SA_KEY and KC_GA4_PROPERTY_ID via supabase secrets set",
    });
  }
  if (!/^\d{6,20}$/.test(propertyId)) {
    return json(req, 503, { error: "invalid_property_id" });
  }
  if (!saResolved.ok) {
    return json(req, 503, {
      error: "invalid_sa_key",
      reason: saResolved.reason,
      diagnostics: saResolved.diagnostics,
    });
  }

  // Strip non-GA4 fields (e.g. action) before validating runReport body.
  const reportBody = body && typeof body === "object" && !Array.isArray(body)
    ? Object.fromEntries(
      Object.entries(body as Record<string, unknown>).filter(([key]) =>
        key !== "action"
      ),
    )
    : body;

  return await handleRunReport(req, saResolved.key, propertyId, reportBody);
});
