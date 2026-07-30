// KinoCampus - Edge Function: kc-create-privacy-help-guest
//
// Public browser gateway for guest LGPD Help submissions. The browser proves a
// fresh Cloudflare Turnstile challenge here; only this server-side handler can
// reach the service-role-only database wrapper. No challenge token, request
// payload, contact address, or provider response is written to logs.

import { createClient } from "jsr:@supabase/supabase-js@2.105.4";
import {
  BoundedRequestBodyError,
  readBoundedRequestText,
} from "../_shared/bounded-request-body.ts";

type JsonObject = Record<string, unknown>;

type RpcResult = {
  data: unknown;
  error: unknown;
};

export type PrivacyHelpGuestRpcClient = {
  rpc(
    functionName: string,
    args: JsonObject,
  ): PromiseLike<RpcResult>;
};

export type PrivacyHelpGuestDependencies = {
  getEnv?: (name: string) => string;
  fetch?: typeof fetch;
  createRpcClient?: (
    supabaseUrl: string,
    serviceRoleKey: string,
  ) => PrivacyHelpGuestRpcClient;
};

type RuntimeConfig = {
  allowedOrigins: ReadonlySet<string>;
  expectedHostnames: ReadonlySet<string>;
  supabaseUrl: string;
  serviceRoleKey: string;
  turnstileSecretKey: string;
};

type TurnstileVerification =
  | { state: "valid" }
  | { state: "invalid" }
  | { state: "unavailable" };

const PRIVACY_REQUEST_ROUTES = new Map([
  ["account_data_copy", "data_access_copy"],
  ["account_data_portability", "data_portability"],
  ["account_deletion", "account_erasure"],
]);
const IDEMPOTENCY_KEY_RE = /^[a-f0-9]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOSTNAME_RE =
  /^(?:localhost|(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/;
const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "help_privacy_guest";
const TURNSTILE_TIMEOUT_MS = 7_000;
const MAX_TURNSTILE_RESPONSE_BYTES = 16_384;
const SITEVERIFY_RETRY_AFTER_SECONDS = 10;
const TURNSTILE_TEST_SECRET_KEYS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export const MAX_REQUEST_BODY_BYTES = 40_960;
export const MAX_PRIVACY_PAYLOAD_BYTES = 32_768;
export const MAX_TURNSTILE_TOKEN_CHARS = 2_048;
export const MAX_CONCURRENT_SITEVERIFY_REQUESTS = 24;

// Best-effort backpressure per warm isolate. This deliberately has no queue:
// request bodies and challenge tokens are never retained while waiting. A
// deployment-level WAF/rate limit is still required because cold starts and
// multiple isolates do not share this counter.
let activeSiteverifyRequests = 0;

const RESPONSE_FIELDS = [
  "out_id",
  "out_created_at",
  "out_notification_claim",
  "out_notification_claim_expires_at",
  "out_data_subject_request",
  "out_protocol",
  "out_reused_existing",
  "out_idempotency_replayed",
] as const;

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultGetEnv(name: string): string {
  return Deno.env.get(name)?.trim() || "";
}

function normalizeSupabaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "")
    ) {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" ||
    hostname === "[::1]" || hostname === "0.0.0.0";
}

function parseExactOrigins(value: string): ReadonlySet<string> | null {
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) return null;

  const result = new Set<string>();
  for (const entry of entries) {
    try {
      const parsed = new URL(entry);
      const protocolAllowed = parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname));
      if (
        !protocolAllowed ||
        entry === "*" ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        (parsed.pathname !== "/" && parsed.pathname !== "") ||
        parsed.origin !== entry
      ) {
        return null;
      }
      result.add(parsed.origin);
    } catch {
      return null;
    }
  }
  return result.size ? result : null;
}

function parseExactHostnames(value: string): ReadonlySet<string> | null {
  const entries = value.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!entries.length) return null;

  const result = new Set<string>();
  for (const entry of entries) {
    if (
      entry === "*" ||
      entry.includes("://") ||
      entry.includes("/") ||
      entry.includes(":") ||
      !HOSTNAME_RE.test(entry)
    ) {
      return null;
    }
    result.add(entry);
  }
  return result.size ? result : null;
}

function loadRuntimeConfig(
  getEnv: (name: string) => string,
): RuntimeConfig | null {
  const turnstileEnvironment = getEnv("KC_TURNSTILE_ENVIRONMENT")
    .toLowerCase();
  const allowedOrigins = parseExactOrigins(
    getEnv("KC_PRIVACY_HELP_ALLOWED_ORIGINS"),
  );
  const expectedHostnames = parseExactHostnames(
    getEnv("KC_TURNSTILE_EXPECTED_HOSTNAMES"),
  );
  const supabaseUrl = normalizeSupabaseUrl(getEnv("SUPABASE_URL"));
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const turnstileSecretKey = getEnv("KC_TURNSTILE_SECRET_KEY");
  const productionUsesLoopback = turnstileEnvironment === "production" &&
    Boolean(
      allowedOrigins &&
          [...allowedOrigins].some((origin) =>
            isLoopbackHostname(new URL(origin).hostname)
          ) ||
        expectedHostnames &&
          [...expectedHostnames].some(isLoopbackHostname),
    );

  if (
    !allowedOrigins ||
    !expectedHostnames ||
    !supabaseUrl ||
    !serviceRoleKey ||
    serviceRoleKey.length > 16_384 ||
    (turnstileEnvironment !== "production" &&
      turnstileEnvironment !== "test") ||
    !turnstileSecretKey ||
    turnstileSecretKey.length > 4_096 ||
    (turnstileEnvironment === "production" &&
      TURNSTILE_TEST_SECRET_KEYS.has(turnstileSecretKey)) ||
    (turnstileEnvironment === "test" &&
      !TURNSTILE_TEST_SECRET_KEYS.has(turnstileSecretKey)) ||
    productionUsesLoopback
  ) {
    return null;
  }
  return {
    allowedOrigins,
    expectedHostnames,
    supabaseUrl,
    serviceRoleKey,
    turnstileSecretKey,
  };
}

function responseHeaders(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): Record<string, string> {
  const origin = request.headers.get("origin")?.trim() || "";
  return {
    ...(origin && allowedOrigins.has(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}

function json(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
  status: number,
  body: JsonObject,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...responseHeaders(request, allowedOrigins),
      ...extraHeaders,
    },
  });
}

function failure(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
  status: number,
  code: string,
  message: string,
  safeToReplace = false,
  extraHeaders: Record<string, string> = {},
): Response {
  return json(request, allowedOrigins, status, {
    ok: false,
    error: {
      code,
      message,
      ...(safeToReplace ? { idempotency: { safe_to_replace: true } } : {}),
    },
  }, extraHeaders);
}

function tryAcquireSiteverifySlot(): boolean {
  if (activeSiteverifyRequests >= MAX_CONCURRENT_SITEVERIFY_REQUESTS) {
    return false;
  }
  activeSiteverifyRequests += 1;
  return true;
}

function releaseSiteverifySlot(): void {
  activeSiteverifyRequests = Math.max(0, activeSiteverifyRequests - 1);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateGuestPayload(payload: JsonObject): string | null {
  let serialized = "";
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return "HELP_PAYLOAD_INVALID";
  }
  if (utf8Length(serialized) > MAX_PRIVACY_PAYLOAD_BYTES) {
    return "HELP_PAYLOAD_TOO_LARGE";
  }

  const type = normalizeText(payload.type);
  const topic = normalizeText(payload.topic);
  const subtopic = normalizeText(payload.subtopic);
  if (
    type !== "account_access" ||
    topic !== "onboarding_settings" ||
    !PRIVACY_REQUEST_ROUTES.has(subtopic)
  ) {
    return "HELP_PRIVACY_SCOPE_INVALID";
  }
  const normalizedIdempotencyKey = typeof payload.idempotency_key === "string"
    ? payload.idempotency_key.trim().toLowerCase()
    : "";
  if (!IDEMPOTENCY_KEY_RE.test(normalizedIdempotencyKey)) {
    return "HELP_IDEMPOTENCY_KEY_INVALID";
  }

  const expectedAuthState = normalizeText(payload.expected_auth_state);
  if (expectedAuthState && expectedAuthState !== "anonymous") {
    return "HELP_GUEST_AUTH_STATE_INVALID";
  }
  const expectedUserId = payload.expected_user_id;
  if (
    expectedUserId !== null &&
    typeof expectedUserId !== "undefined" &&
    String(expectedUserId).trim() !== ""
  ) {
    return "HELP_GUEST_AUTH_STATE_INVALID";
  }
  return null;
}

function parseEnvelope(value: unknown):
  | { token: string; payload: JsonObject }
  | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== 2 ||
    !keys.includes("turnstile_token") ||
    !keys.includes("payload") ||
    typeof value.turnstile_token !== "string" ||
    !isPlainObject(value.payload)
  ) {
    return null;
  }
  const token = value.turnstile_token.trim();
  if (
    !token ||
    token.length > MAX_TURNSTILE_TOKEN_CHARS ||
    /[\u0000-\u0020\u007f]/.test(token)
  ) {
    return null;
  }
  return { token, payload: value.payload };
}

async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declaredLength = response.headers.get("content-length")?.trim() || "";
  if (
    /^[0-9]+$/.test(declaredLength) &&
    Number(declaredLength) > maximumBytes
  ) {
    throw new Error("TURNSTILE_RESPONSE_TOO_LARGE");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        try {
          await reader.cancel("TURNSTILE_RESPONSE_TOO_LARGE");
        } catch {
          // Best effort. No provider body is retained or logged.
        }
        throw new Error("TURNSTILE_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled stream may already have released its lock.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function verifyTurnstile(
  token: string,
  config: RuntimeConfig,
  fetchImplementation: typeof fetch,
): Promise<TurnstileVerification> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);
  try {
    const response = await fetchImplementation(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        secret: config.turnstileSecretKey,
        response: token,
      }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return { state: "unavailable" };

    const raw = await readBoundedResponseText(
      response,
      MAX_TURNSTILE_RESPONSE_BYTES,
    );
    const result = JSON.parse(raw);
    if (!isPlainObject(result)) return { state: "unavailable" };
    if (result.success !== true) return { state: "invalid" };

    const action = typeof result.action === "string" ? result.action : "";
    const hostname = typeof result.hostname === "string"
      ? result.hostname.trim().toLowerCase()
      : "";
    if (
      action !== TURNSTILE_ACTION ||
      !hostname ||
      !config.expectedHostnames.has(hostname)
    ) {
      return { state: "invalid" };
    }
    return { state: "valid" };
  } catch {
    return { state: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

function rpcErrorShape(value: unknown): {
  code: string;
  detail: string;
  message: string;
} {
  if (!isPlainObject(value)) return { code: "", detail: "", message: "" };
  return {
    code: typeof value.code === "string" ? value.code : "",
    detail: typeof value.details === "string"
      ? value.details
      : typeof value.detail === "string"
      ? value.detail
      : "",
    message: typeof value.message === "string" ? value.message : "",
  };
}

function rpcFailure(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
  error: unknown,
): Response {
  const dbError = rpcErrorShape(error);
  const safeToReplace = dbError.detail === "HELP_IDEMPOTENCY_SAFE_TO_REPLACE";
  switch (dbError.message) {
    case "HELP_RATE_LIMIT_1H":
      return failure(
        request,
        allowedOrigins,
        429,
        "HELP_RATE_LIMIT_1H",
        "O limite temporário de pedidos foi atingido. Tente novamente mais tarde.",
        safeToReplace,
      );
    case "HELP_IDEMPOTENCY_KEY_RETIRED":
      return failure(
        request,
        allowedOrigins,
        409,
        "HELP_IDEMPOTENCY_KEY_RETIRED",
        "A tentativa anterior foi encerrada com segurança. Gere uma nova tentativa.",
        true,
      );
    case "HELP_IDEMPOTENCY_PAYLOAD_CONFLICT":
      return failure(
        request,
        allowedOrigins,
        409,
        "HELP_IDEMPOTENCY_PAYLOAD_CONFLICT",
        "A chave já está vinculada a outro conteúdo.",
      );
    case "HELP_IDEMPOTENCY_KEY_INVALID":
      return failure(
        request,
        allowedOrigins,
        400,
        "HELP_IDEMPOTENCY_KEY_INVALID",
        "A proteção contra duplicidade é inválida.",
      );
    case "HELP_IDEMPOTENCY_PAYLOAD_TOO_LARGE":
      return failure(
        request,
        allowedOrigins,
        413,
        "HELP_PAYLOAD_TOO_LARGE",
        "O pedido ultrapassa o limite permitido.",
        safeToReplace,
      );
    case "HELP_IDEMPOTENCY_PAYLOAD_INVALID":
    case "HELP_IDEMPOTENCY_SCOPE_INVALID":
      return failure(
        request,
        allowedOrigins,
        400,
        "HELP_PAYLOAD_INVALID",
        "O pedido de privacidade é inválido.",
        safeToReplace,
      );
    default:
      if (dbError.code === "22023" || dbError.code === "23514") {
        return failure(
          request,
          allowedOrigins,
          400,
          "HELP_PAYLOAD_INVALID",
          "O pedido de privacidade é inválido.",
          safeToReplace,
        );
      }
      return failure(
        request,
        allowedOrigins,
        500,
        "PRIVACY_HELP_CREATE_FAILED",
        "Não foi possível registrar o pedido de privacidade.",
        safeToReplace,
      );
  }
}

function projectRpcRow(value: unknown): JsonObject | null {
  const candidate = Array.isArray(value)
    ? value.length === 1 ? value[0] : null
    : value;
  if (!isPlainObject(candidate)) return null;

  const projected: JsonObject = {};
  for (const field of RESPONSE_FIELDS) projected[field] = candidate[field];
  if (
    typeof projected.out_id !== "string" ||
    !UUID_RE.test(projected.out_id) ||
    typeof projected.out_created_at !== "string" ||
    !Number.isFinite(Date.parse(projected.out_created_at)) ||
    projected.out_notification_claim !== null ||
    projected.out_notification_claim_expires_at !== null ||
    projected.out_data_subject_request !== null ||
    projected.out_protocol !== null ||
    typeof projected.out_reused_existing !== "boolean" ||
    typeof projected.out_idempotency_replayed !== "boolean"
  ) {
    return null;
  }
  return projected;
}

function defaultCreateRpcClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): PrivacyHelpGuestRpcClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as PrivacyHelpGuestRpcClient;
}

export async function handlePrivacyHelpGuest(
  request: Request,
  dependencies: PrivacyHelpGuestDependencies = {},
): Promise<Response> {
  const getEnv = dependencies.getEnv || defaultGetEnv;
  const config = loadRuntimeConfig(getEnv);
  const noOrigins = new Set<string>();
  if (!config) {
    return failure(
      request,
      noOrigins,
      503,
      "GUEST_PRIVACY_CONFIG_UNAVAILABLE",
      "O canal protegido de privacidade não está configurado.",
    );
  }

  const origin = request.headers.get("origin")?.trim() || "";
  if (!origin || !config.allowedOrigins.has(origin)) {
    return failure(
      request,
      config.allowedOrigins,
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origem não autorizada.",
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(request, config.allowedOrigins),
    });
  }
  if (request.method !== "POST") {
    return failure(
      request,
      config.allowedOrigins,
      405,
      "METHOD_NOT_ALLOWED",
      "Método não permitido.",
      false,
    );
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]
    ?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return failure(
      request,
      config.allowedOrigins,
      415,
      "CONTENT_TYPE_INVALID",
      "Envie o corpo como application/json.",
    );
  }

  let rawBody = "";
  try {
    rawBody = await readBoundedRequestText(request, MAX_REQUEST_BODY_BYTES);
  } catch (error) {
    if (
      error instanceof BoundedRequestBodyError &&
      error.code === "BODY_TOO_LARGE"
    ) {
      return failure(
        request,
        config.allowedOrigins,
        413,
        "REQUEST_BODY_TOO_LARGE",
        "O corpo da solicitação ultrapassa o limite permitido.",
      );
    }
    return failure(
      request,
      config.allowedOrigins,
      400,
      "REQUEST_BODY_INVALID",
      "O corpo da solicitação é inválido.",
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return failure(
      request,
      config.allowedOrigins,
      400,
      "REQUEST_BODY_INVALID",
      "O corpo da solicitação é inválido.",
    );
  }
  const envelope = parseEnvelope(parsedBody);
  if (!envelope) {
    return failure(
      request,
      config.allowedOrigins,
      400,
      "REQUEST_BODY_INVALID",
      "O corpo da solicitação é inválido.",
    );
  }

  const payloadError = validateGuestPayload(envelope.payload);
  if (payloadError === "HELP_PAYLOAD_TOO_LARGE") {
    return failure(
      request,
      config.allowedOrigins,
      413,
      payloadError,
      "O pedido ultrapassa o limite permitido.",
    );
  }
  if (payloadError) {
    return failure(
      request,
      config.allowedOrigins,
      400,
      payloadError,
      "O pedido de privacidade é inválido.",
    );
  }

  if (!tryAcquireSiteverifySlot()) {
    return failure(
      request,
      config.allowedOrigins,
      429,
      "GUEST_PRIVACY_BUSY",
      "O canal protegido está temporariamente ocupado. Tente novamente.",
      false,
      { "Retry-After": String(SITEVERIFY_RETRY_AFTER_SECONDS) },
    );
  }

  let verification: TurnstileVerification;
  try {
    verification = await verifyTurnstile(
      envelope.token,
      config,
      dependencies.fetch || fetch,
    );
  } finally {
    releaseSiteverifySlot();
  }
  if (verification.state === "invalid") {
    return failure(
      request,
      config.allowedOrigins,
      403,
      "TURNSTILE_INVALID",
      "A verificação antiabuso não foi aceita.",
    );
  }
  if (verification.state === "unavailable") {
    return failure(
      request,
      config.allowedOrigins,
      503,
      "TURNSTILE_UNAVAILABLE",
      "A verificação antiabuso está temporariamente indisponível.",
    );
  }

  const guestPayload: JsonObject = {
    ...envelope.payload,
    expected_auth_state: "anonymous",
    idempotency_key: String(envelope.payload.idempotency_key)
      .trim()
      .toLowerCase(),
  };
  delete guestPayload.expected_user_id;

  let rpcResult: RpcResult;
  try {
    const createRpcClient = dependencies.createRpcClient ||
      defaultCreateRpcClient;
    const client = createRpcClient(
      config.supabaseUrl,
      config.serviceRoleKey,
    );
    rpcResult = await client.rpc("kc_create_privacy_help_guest_v1", {
      p_payload: guestPayload,
    });
  } catch {
    return failure(
      request,
      config.allowedOrigins,
      503,
      "PRIVACY_HELP_CREATE_UNAVAILABLE",
      "O registro do pedido está temporariamente indisponível.",
    );
  }

  if (rpcResult.error) {
    return rpcFailure(request, config.allowedOrigins, rpcResult.error);
  }
  const row = projectRpcRow(rpcResult.data);
  if (!row) {
    return failure(
      request,
      config.allowedOrigins,
      502,
      "PRIVACY_HELP_RESPONSE_INVALID",
      "O servidor não confirmou uma referência segura para o pedido.",
    );
  }
  return json(request, config.allowedOrigins, 200, {
    ok: true,
    data: row,
  });
}

if (import.meta.main) {
  Deno.serve((request) => handlePrivacyHelpGuest(request));
}
