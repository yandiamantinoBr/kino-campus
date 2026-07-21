// KinoCampus -- secure, read-only Search Console proxy.
//
// Required Edge Function secrets:
//   KC_SEARCH_CONSOLE_SA_KEY       dedicated Google service-account JSON
//   KC_SEARCH_CONSOLE_SITE_URL     Search Console property URL
//
// Optional configuration:
//   KC_SEARCH_CONSOLE_ALLOWED_ORIGINS (falls back to KC_GA4_ALLOWED_ORIGINS)
//   KC_SEARCH_CONSOLE_CACHE_TTL_SEC   (default 300, hard cap 900)
//
// The caller must also present a valid Supabase user JWT and have
// profiles.is_admin = true. Google credentials and upstream error bodies are
// never returned to the caller.

import { createClient } from "@supabase/supabase-js";
import {
  parseServiceAccountSecret,
  type ServiceAccountKey,
} from "../_shared/google-service-account.ts";
import {
  type ConfiguredSite,
  type InspectUrlRequest,
  parseConfiguredSite,
  type SearchAnalyticsRequest,
  type SearchConsoleRequest,
  validateInspectionUrl,
  validateRequest,
} from "./validation.ts";

const FUNCTION_NAME = "kc-search-console-reports";
const SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const WEBMASTERS_API_BASE = "https://www.googleapis.com/webmasters/v3";
const URL_INSPECTION_ENDPOINT =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_CACHE_TTL_SEC = 300;
const MAX_CACHE_TTL_SEC = 900;
const MAX_CACHE_ENTRIES = 50;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.kinocampus.com.br",
  "https://kinocampus.com.br",
];

const COMMON_RESPONSE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function getEnv(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function normalizeAllowedOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" &&
        !(parsed.protocol === "http:" &&
          (parsed.hostname === "localhost" ||
            parsed.hostname === "127.0.0.1"))) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    return parsed.origin;
  } catch (_) {
    return null;
  }
}

function readAllowedOrigins(): string[] {
  const configured = getEnv("KC_SEARCH_CONSOLE_ALLOWED_ORIGINS") ||
    getEnv("KC_GA4_ALLOWED_ORIGINS");
  if (!configured) return [...DEFAULT_ALLOWED_ORIGINS];

  const origins = configured
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "*")
    .map(normalizeAllowedOrigin)
    .filter((value): value is string => value !== null);

  return origins.length > 0
    ? [...new Set(origins)]
    : [...DEFAULT_ALLOWED_ORIGINS];
}

function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !origin || readAllowedOrigins().includes(origin);
}

function corsHeadersFor(req: Request): Record<string, string> {
  const headers = { ...COMMON_RESPONSE_HEADERS };
  const origin = req.headers.get("origin");
  if (origin && readAllowedOrigins().includes(origin)) {
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
      ...corsHeadersFor(req),
    },
  });
}

class PublicProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
  ) {
    super(code);
    this.name = "PublicProblem";
  }
}

function problem(status: number, code: string, detail: string): PublicProblem {
  return new PublicProblem(status, code, detail);
}

function problemResponse(req: Request, error: PublicProblem): Response {
  return json(req, error.status, {
    ok: false,
    error: error.code,
    detail: error.detail,
  });
}

interface CallerContext {
  isAdmin: boolean;
}

async function resolveCaller(req: Request): Promise<CallerContext> {
  const authHeader = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authHeader.trim());
  if (!match) return { isAdmin: false };

  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceKey) return { isAdmin: false };

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: userData, error: userError } = await admin.auth.getUser(
      match[1],
    );
    const userId = userData?.user?.id ?? null;
    if (userError || !userId) return { isAdmin: false };

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();

    return { isAdmin: !profileError && profile?.is_admin === true };
  } catch (_) {
    return { isAdmin: false };
  }
}

function parseServiceAccount(raw: string): ServiceAccountKey | null {
  const parsed = parseServiceAccountSecret(raw);
  return parsed.ok ? parsed.key : null;
}

function parseServiceAccountDetailed(raw: string) {
  return parseServiceAccountSecret(raw);
}

function base64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array
    ? input
    : new Uint8Array(input);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(
    atob(body),
    (character) => character.charCodeAt(0),
  );
  return await crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
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
    if (controller.signal.aborted) {
      throw problem(
        504,
        "google_timeout",
        "Google did not answer within the allowed time.",
      );
    }
    throw problem(502, "google_unavailable", "Google could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
}

let cachedToken: {
  token: string;
  clientEmail: string;
  expiresAtMs: number;
} | null = null;

async function getAccessToken(
  serviceAccount: ServiceAccountKey,
): Promise<string> {
  const now = Date.now();
  if (
    cachedToken &&
    cachedToken.clientEmail === serviceAccount.client_email &&
    cachedToken.expiresAtMs > now + 60_000
  ) {
    return cachedToken.token;
  }

  try {
    const privateKey = await importPrivateKey(serviceAccount.private_key);
    const issuedAt = Math.floor(now / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64url(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: SEARCH_CONSOLE_SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }));
    const signingInput = `${header}.${claim}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(signingInput),
    );
    const assertion = `${signingInput}.${base64url(signature)}`;

    const response = await fetchWithTimeout(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) {
      throw problem(
        502,
        "service_account_auth_failed",
        "Google rejected the configured service-account credentials.",
      );
    }

    const data = await response.json() as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof data.access_token !== "string" || data.access_token === "") {
      throw problem(
        502,
        "service_account_auth_failed",
        "Google did not return an access token.",
      );
    }
    const expiresIn = typeof data.expires_in === "number" &&
        Number.isFinite(data.expires_in)
      ? Math.min(3600, Math.max(120, Math.floor(data.expires_in)))
      : 3600;
    cachedToken = {
      token: data.access_token,
      clientEmail: serviceAccount.client_email,
      expiresAtMs: now + (expiresIn - 60) * 1000,
    };
    return cachedToken.token;
  } catch (error) {
    if (error instanceof PublicProblem) throw error;
    throw problem(
      502,
      "service_account_auth_failed",
      "The configured service-account key could not be used.",
    );
  }
}

function googleApiProblem(status: number): PublicProblem {
  if (status === 401) {
    return problem(
      502,
      "service_account_auth_failed",
      "Google did not authorize the service account.",
    );
  }
  if (status === 403 || status === 404) {
    return problem(
      503,
      "search_console_not_ready",
      "Enable the Search Console API in Google Cloud and grant the service account access to KC_SEARCH_CONSOLE_SITE_URL.",
    );
  }
  if (status === 429) {
    return problem(
      503,
      "search_console_rate_limited",
      "The Search Console API quota is temporarily exhausted.",
    );
  }
  if (status >= 500) {
    return problem(
      502,
      "search_console_unavailable",
      "The Search Console API is temporarily unavailable.",
    );
  }
  return problem(
    502,
    "search_console_request_rejected",
    "Google rejected the validated Search Console request.",
  );
}

async function fetchGoogleJson(
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetchWithTimeout(url, init);
  if (!response.ok) throw googleApiProblem(response.status);
  try {
    return await response.json();
  } catch (_) {
    throw problem(
      502,
      "search_console_invalid_response",
      "Google returned an unreadable Search Console response.",
    );
  }
}

function googleHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function callSearchAnalytics(
  token: string,
  site: ConfiguredSite,
  request: SearchAnalyticsRequest,
): Promise<unknown> {
  const url = `${WEBMASTERS_API_BASE}/sites/${
    encodeURIComponent(site.siteUrl)
  }/searchAnalytics/query`;
  const body: Record<string, unknown> = {
    startDate: request.startDate,
    endDate: request.endDate,
    rowLimit: request.rowLimit,
    type: request.type,
  };
  if (request.dimensions.length > 0) body.dimensions = request.dimensions;

  return await fetchGoogleJson(url, {
    method: "POST",
    headers: googleHeaders(token),
    body: JSON.stringify(body),
  });
}

async function callSitemaps(
  token: string,
  site: ConfiguredSite,
): Promise<unknown> {
  const url = `${WEBMASTERS_API_BASE}/sites/${
    encodeURIComponent(site.siteUrl)
  }/sitemaps`;
  return await fetchGoogleJson(url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}` },
  });
}

async function callInspectUrl(
  token: string,
  site: ConfiguredSite,
  request: InspectUrlRequest,
): Promise<unknown> {
  return await fetchGoogleJson(URL_INSPECTION_ENDPOINT, {
    method: "POST",
    headers: googleHeaders(token),
    body: JSON.stringify({
      inspectionUrl: request.inspectionUrl,
      siteUrl: site.siteUrl,
      languageCode: "pt-BR",
    }),
  });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${
    entries.map(([key, entry]) =>
      `${JSON.stringify(key)}:${stableStringify(entry)}`
    ).join(",")
  }}`;
}

function cacheKey(site: ConfiguredSite, request: SearchConsoleRequest): string {
  const stable = stableStringify({ siteUrl: site.siteUrl, request });
  let hash = 2166136261;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${request.action}:${hash >>> 0}`;
}

interface CacheEntry {
  data: unknown;
  expiresAtMs: number;
}

const responseCache = new Map<string, CacheEntry>();

function cacheTtlSeconds(): number {
  const configured = Number(getEnv("KC_SEARCH_CONSOLE_CACHE_TTL_SEC"));
  if (!Number.isFinite(configured) || configured < 0) {
    return DEFAULT_CACHE_TTL_SEC;
  }
  return Math.min(MAX_CACHE_TTL_SEC, Math.floor(configured));
}

function cacheGet(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key: string, data: unknown, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return;
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
  responseCache.set(key, {
    data,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  });
}

async function executeRequest(
  serviceAccount: ServiceAccountKey,
  site: ConfiguredSite,
  request: SearchConsoleRequest,
): Promise<unknown> {
  const token = await getAccessToken(serviceAccount);
  if (request.action === "searchAnalytics") {
    return await callSearchAnalytics(token, site, request);
  }
  if (request.action === "sitemaps") {
    return await callSitemaps(token, site);
  }
  return await callInspectUrl(token, site, request);
}

async function readJsonBody(req: Request): Promise<unknown> {
  const contentType = (req.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw problem(
      415,
      "content_type_required",
      "Content-Type must be application/json.",
    );
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES
  ) {
    throw problem(
      413,
      "body_too_large",
      "Request body exceeds the allowed size.",
    );
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY_BYTES) {
    throw problem(
      413,
      "body_too_large",
      "Request body exceeds the allowed size.",
    );
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    throw problem(400, "invalid_json", "Request body must contain valid JSON.");
  }
}

async function handlePost(req: Request): Promise<Response> {
  const caller = await resolveCaller(req);
  if (!caller.isAdmin) {
    return json(req, 403, { ok: false, error: "admin_required" });
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req);
  } catch (error) {
    if (error instanceof PublicProblem) return problemResponse(req, error);
    return problemResponse(
      req,
      problem(400, "invalid_request", "The request could not be read."),
    );
  }

  const validation = validateRequest(rawBody);
  if (!validation.ok) {
    return json(req, 400, {
      ok: false,
      error: "invalid_request",
      detail: validation.error,
    });
  }

  // Prefer raw env for SA JSON (avoid trim edge-cases on multi-line secrets).
  const serviceAccountRaw = Deno.env.get("KC_SEARCH_CONSOLE_SA_KEY") ?? "";
  const configuredSiteRaw = getEnv("KC_SEARCH_CONSOLE_SITE_URL");
  if (!serviceAccountRaw || !configuredSiteRaw) {
    return problemResponse(
      req,
      problem(
        503,
        "missing_config",
        "Set KC_SEARCH_CONSOLE_SA_KEY and KC_SEARCH_CONSOLE_SITE_URL as Supabase Edge Function secrets.",
      ),
    );
  }

  const serviceAccountParsed = parseServiceAccountDetailed(serviceAccountRaw);
  if (!serviceAccountParsed.ok) {
    return json(req, 503, {
      ok: false,
      error: "invalid_service_account_config",
      detail:
        "KC_SEARCH_CONSOLE_SA_KEY must contain a valid Google service-account JSON key.",
      reason: serviceAccountParsed.reason,
      diagnostics: serviceAccountParsed.diagnostics,
    });
  }
  const serviceAccount = serviceAccountParsed.key;

  const siteResult = parseConfiguredSite(configuredSiteRaw);
  if (!siteResult.ok) {
    return problemResponse(
      req,
      problem(
        503,
        "invalid_site_config",
        "KC_SEARCH_CONSOLE_SITE_URL must be an HTTPS URL-prefix property or sc-domain property.",
      ),
    );
  }

  let request = validation.value;
  if (request.action === "inspectUrl") {
    const inspectionResult = validateInspectionUrl(
      request.inspectionUrl,
      siteResult.value,
    );
    if (!inspectionResult.ok) {
      return json(req, 400, {
        ok: false,
        error: "invalid_request",
        detail: inspectionResult.error,
      });
    }
    request = { ...request, inspectionUrl: inspectionResult.value };
  }

  const key = cacheKey(siteResult.value, request);
  const cached = cacheGet(key);
  if (cached !== null) {
    return json(req, 200, {
      ok: true,
      action: request.action,
      cached: true,
      data: cached,
    });
  }

  try {
    const data = await executeRequest(
      serviceAccount,
      siteResult.value,
      request,
    );
    cacheSet(key, data, cacheTtlSeconds());
    return json(req, 200, {
      ok: true,
      action: request.action,
      cached: false,
      data,
    });
  } catch (error) {
    if (error instanceof PublicProblem) return problemResponse(req, error);
    return problemResponse(
      req,
      problem(
        500,
        "internal_error",
        "The Search Console request could not be completed.",
      ),
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(req)) {
      return json(req, 403, { ok: false, error: "origin_not_allowed" });
    }
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }

  if (!isOriginAllowed(req)) {
    return json(req, 403, { ok: false, error: "origin_not_allowed" });
  }

  const pathSegments = new URL(req.url).pathname.split("/").filter(Boolean);
  const routeMatches = pathSegments.length === 0 ||
    pathSegments.at(-1) === FUNCTION_NAME;
  if (req.method !== "POST" || !routeMatches) {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  return await handlePost(req);
});
