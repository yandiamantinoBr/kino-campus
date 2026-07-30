import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  handlePrivacyHelpGuest,
  MAX_CONCURRENT_SITEVERIFY_REQUESTS,
  MAX_REQUEST_BODY_BYTES,
  MAX_TURNSTILE_TOKEN_CHARS,
  type PrivacyHelpGuestDependencies,
  type PrivacyHelpGuestRpcClient,
} from "./index.ts";

const ORIGIN = "https://www.kinocampus.com.br";
const VALID_TOKEN = "turnstile-token-valid";
const VALID_IDEMPOTENCY_KEY = "a".repeat(64);
const VALID_ROW = {
  out_id: "10000000-0000-4000-8000-000000000001",
  out_created_at: "2026-07-29T20:30:00.000Z",
  out_notification_claim: null,
  out_notification_claim_expires_at: null,
  out_data_subject_request: null,
  out_protocol: null,
  out_reused_existing: false,
  out_idempotency_replayed: false,
};
const VALID_PAYLOAD = {
  type: "account_access",
  topic: "onboarding_settings",
  subtopic: "account_data_copy",
  subject: "Solicitação de cópia",
  message: "Quero receber uma cópia dos meus dados.",
  priority: "normal",
  page_path: "/ajuda.html",
  contact_email: "guest@example.test",
  allow_contact: true,
  expected_auth_state: "anonymous",
  expected_user_id: null,
  idempotency_key: VALID_IDEMPOTENCY_KEY,
  metadata: {
    request_kind: "data_access_copy",
    data_scope: ["account"],
  },
};

function testEnv(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    KC_PRIVACY_HELP_ALLOWED_ORIGINS: ORIGIN,
    KC_TURNSTILE_EXPECTED_HOSTNAMES: "www.kinocampus.com.br",
    KC_TURNSTILE_ENVIRONMENT: "test",
    KC_TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    SUPABASE_URL: "https://project-ref.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-test",
    ...overrides,
  };
  return (name: string) => values[name] || "";
}

function request(
  body: unknown = {
    turnstile_token: VALID_TOKEN,
    payload: VALID_PAYLOAD,
  },
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", ORIGIN);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Request(
    "https://project-ref.supabase.co/functions/v1/kc-create-privacy-help-guest",
    {
      method: "POST",
      ...init,
      headers,
      body: init.body === null ? null : JSON.stringify(body),
    },
  );
}

function turnstileResponse(
  overrides: Record<string, unknown> = {},
): Response {
  return Response.json({
    success: true,
    action: "help_privacy_guest",
    hostname: "www.kinocampus.com.br",
    challenge_ts: "2026-07-29T20:30:00.000Z",
    ...overrides,
  });
}

async function responseJson(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function dependencies(options: {
  env?: (name: string) => string;
  fetch?: typeof fetch;
  rpc?: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
} = {}): PrivacyHelpGuestDependencies {
  const rpcClient: PrivacyHelpGuestRpcClient = {
    rpc: options.rpc ||
      (() => Promise.resolve({ data: [VALID_ROW], error: null })),
  };
  return {
    getEnv: options.env || testEnv(),
    fetch: options.fetch || (() => Promise.resolve(turnstileResponse())),
    createRpcClient: () => rpcClient,
  };
}

Deno.test("fails closed before CORS, Turnstile, or RPC when required config is absent", async () => {
  let fetchCalls = 0;
  let rpcCalls = 0;
  const response = await handlePrivacyHelpGuest(
    request(),
    dependencies({
      env: testEnv({ KC_TURNSTILE_SECRET_KEY: "" }),
      fetch: (() => {
        fetchCalls += 1;
        return Promise.resolve(turnstileResponse());
      }) as typeof fetch,
      rpc: () => {
        rpcCalls += 1;
        return Promise.resolve({ data: [VALID_ROW], error: null });
      },
    }),
  );

  assertEquals(response.status, 503);
  assertEquals(response.headers.get("access-control-allow-origin"), null);
  assertEquals(fetchCalls, 0);
  assertEquals(rpcCalls, 0);
  assertEquals(
    (await responseJson(response)).error,
    {
      code: "GUEST_PRIVACY_CONFIG_UNAVAILABLE",
      message: "O canal protegido de privacidade não está configurado.",
    },
  );
});

Deno.test("requires an exact configured browser Origin", async () => {
  for (const origin of ["", "https://evil.example", "null"]) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      origin,
    };
    const response = await handlePrivacyHelpGuest(
      request(undefined, { headers }),
      dependencies(),
    );
    assertEquals(response.status, 403);
    assertEquals(response.headers.get("access-control-allow-origin"), null);
    assertEquals(
      ((await responseJson(response)).error as Record<string, unknown>).code,
      "ORIGIN_NOT_ALLOWED",
    );
  }
});

Deno.test("answers an allowed preflight with the exact Supabase invoke headers", async () => {
  const response = await handlePrivacyHelpGuest(
    request(undefined, {
      method: "OPTIONS",
      body: null,
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
      },
    }),
    dependencies(),
  );

  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(
    response.headers.get("access-control-allow-headers"),
    "authorization, apikey, content-type, x-client-info",
  );
  assertEquals(
    response.headers.get("access-control-allow-methods"),
    "POST, OPTIONS",
  );
});

Deno.test("accepts POST only and requires application/json", async () => {
  const getResponse = await handlePrivacyHelpGuest(
    request(undefined, { method: "GET", body: null }),
    dependencies(),
  );
  assertEquals(getResponse.status, 405);
  assertEquals(
    ((await responseJson(getResponse)).error as Record<string, unknown>).code,
    "METHOD_NOT_ALLOWED",
  );

  const textResponse = await handlePrivacyHelpGuest(
    request(undefined, {
      headers: { origin: ORIGIN, "content-type": "text/plain" },
    }),
    dependencies(),
  );
  assertEquals(textResponse.status, 415);
  assertEquals(
    ((await responseJson(textResponse)).error as Record<string, unknown>).code,
    "CONTENT_TYPE_INVALID",
  );
});

Deno.test("rejects an oversized body before Turnstile validation", async () => {
  let fetchCalls = 0;
  const oversized = "x".repeat(MAX_REQUEST_BODY_BYTES + 1);
  const response = await handlePrivacyHelpGuest(
    new Request(
      "https://project-ref.supabase.co/functions/v1/kc-create-privacy-help-guest",
      {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
        },
        body: oversized,
      },
    ),
    dependencies({
      fetch: (() => {
        fetchCalls += 1;
        return Promise.resolve(turnstileResponse());
      }) as typeof fetch,
    }),
  );

  assertEquals(response.status, 413);
  assertEquals(fetchCalls, 0);
  assertEquals(
    ((await responseJson(response)).error as Record<string, unknown>).code,
    "REQUEST_BODY_TOO_LARGE",
  );
});

Deno.test("rejects malformed envelopes, long tokens, and non-guest payloads before Siteverify", async () => {
  const cases = [
    { payload: VALID_PAYLOAD },
    {
      turnstile_token: "x".repeat(MAX_TURNSTILE_TOKEN_CHARS + 1),
      payload: VALID_PAYLOAD,
    },
    {
      turnstile_token: VALID_TOKEN,
      payload: {
        ...VALID_PAYLOAD,
        expected_auth_state: "authenticated",
        expected_user_id: "10000000-0000-4000-8000-000000000001",
      },
    },
    {
      turnstile_token: VALID_TOKEN,
      payload: { ...VALID_PAYLOAD, subtopic: "generic_help" },
    },
  ];
  let fetchCalls = 0;
  for (const body of cases) {
    const response = await handlePrivacyHelpGuest(
      request(body),
      dependencies({
        fetch: (() => {
          fetchCalls += 1;
          return Promise.resolve(turnstileResponse());
        }) as typeof fetch,
      }),
    );
    assertEquals(response.status, 400);
  }
  assertEquals(fetchCalls, 0);
});

Deno.test("sends only secret and opaque token to Siteverify and never forwards the token to RPC", async () => {
  let rpcArgs: Record<string, unknown> | null = null;
  const response = await handlePrivacyHelpGuest(
    request({
      turnstile_token: VALID_TOKEN,
      payload: {
        ...VALID_PAYLOAD,
        idempotency_key: ` ${"A".repeat(64)} `,
      },
    }),
    dependencies({
      fetch: (async (input, init) => {
        assertEquals(
          String(input),
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        );
        const requestInit = init as {
          method?: string;
          body?: BodyInit | null;
        } | undefined;
        assertEquals(requestInit?.method, "POST");
        const form = new URLSearchParams(String(requestInit?.body || ""));
        assertEquals(
          form.get("secret"),
          "1x0000000000000000000000000000000AA",
        );
        assertEquals(form.get("response"), VALID_TOKEN);
        assertEquals([...form.keys()].sort(), ["response", "secret"]);
        return turnstileResponse();
      }) as typeof fetch,
      rpc: (functionName, args) => {
        assertEquals(functionName, "kc_create_privacy_help_guest_v1");
        rpcArgs = args;
        return Promise.resolve({ data: [VALID_ROW], error: null });
      },
    }),
  );

  assertEquals(response.status, 200);
  const body = await responseJson(response);
  assertEquals(body, { ok: true, data: VALID_ROW });
  assert(rpcArgs);
  const capturedArgs = rpcArgs as Record<string, unknown>;
  const payload = capturedArgs.p_payload as Record<string, unknown>;
  assertEquals(payload.expected_auth_state, "anonymous");
  assertEquals(payload.expected_user_id, undefined);
  assertEquals(payload.idempotency_key, "a".repeat(64));
  assertEquals(JSON.stringify(capturedArgs).includes(VALID_TOKEN), false);
});

Deno.test("rejects failed, wrong-action, and wrong-hostname Turnstile responses without RPC", async () => {
  const providerResponses = [
    turnstileResponse({ success: false }),
    turnstileResponse({ action: "another_action" }),
    turnstileResponse({ hostname: "evil.example" }),
  ];
  let rpcCalls = 0;
  for (const providerResponse of providerResponses) {
    const response = await handlePrivacyHelpGuest(
      request(),
      dependencies({
        fetch: (() =>
          Promise.resolve(providerResponse.clone())) as typeof fetch,
        rpc: () => {
          rpcCalls += 1;
          return Promise.resolve({ data: [VALID_ROW], error: null });
        },
      }),
    );
    assertEquals(response.status, 403);
    assertEquals(
      ((await responseJson(response)).error as Record<string, unknown>).code,
      "TURNSTILE_INVALID",
    );
  }
  assertEquals(rpcCalls, 0);
});

Deno.test("applies queue-free per-isolate Siteverify backpressure and reopens slots", async () => {
  let providerCalls = 0;
  let resolveAllEntered: (() => void) | null = null;
  let releaseProvider: (response: Response) => void = () => {
    throw new Error("provider release was not initialized");
  };
  const allEntered = new Promise<void>((resolve) => {
    resolveAllEntered = resolve;
  });
  const providerPending = new Promise<Response>((resolve) => {
    releaseProvider = resolve;
  });
  const pendingFetch = (() => {
    providerCalls += 1;
    if (providerCalls === MAX_CONCURRENT_SITEVERIFY_REQUESTS) {
      resolveAllEntered?.();
    }
    return providerPending.then((response) => response.clone());
  }) as typeof fetch;

  const inFlight = Array.from(
    { length: MAX_CONCURRENT_SITEVERIFY_REQUESTS },
    () =>
      handlePrivacyHelpGuest(
        request(),
        dependencies({ fetch: pendingFetch }),
      ),
  );
  await allEntered;

  const overflow = await handlePrivacyHelpGuest(
    request(),
    dependencies({ fetch: pendingFetch }),
  );
  assertEquals(overflow.status, 429);
  assertEquals(overflow.headers.get("retry-after"), "10");
  assertEquals(providerCalls, MAX_CONCURRENT_SITEVERIFY_REQUESTS);
  assertEquals(
    ((await responseJson(overflow)).error as Record<string, unknown>).code,
    "GUEST_PRIVACY_BUSY",
  );

  releaseProvider(turnstileResponse());
  const completed = await Promise.all(inFlight);
  completed.forEach((response) => assertEquals(response.status, 200));

  const reopened = await handlePrivacyHelpGuest(
    request(),
    dependencies({
      fetch: (() => Promise.resolve(turnstileResponse())) as typeof fetch,
    }),
  );
  assertEquals(reopened.status, 200);
});

Deno.test("fails closed on Siteverify transport, HTTP, malformed, or oversized responses", async () => {
  const providerCalls: Array<() => Promise<Response>> = [
    () => Promise.reject(new Error("network unavailable")),
    () => Promise.resolve(new Response("unavailable", { status: 503 })),
    () => Promise.resolve(new Response("{broken-json")),
    () =>
      Promise.resolve(
        new Response("x".repeat(16_385), {
          headers: { "content-type": "application/json" },
        }),
      ),
  ];
  for (const providerCall of providerCalls) {
    const response = await handlePrivacyHelpGuest(
      request(),
      dependencies({
        fetch: providerCall as typeof fetch,
      }),
    );
    assertEquals(response.status, 503);
    assertEquals(
      ((await responseJson(response)).error as Record<string, unknown>).code,
      "TURNSTILE_UNAVAILABLE",
    );
  }
});

Deno.test("maps known database failures to stable non-reflective errors", async () => {
  const response = await handlePrivacyHelpGuest(
    request(),
    dependencies({
      rpc: () =>
        Promise.resolve({
          data: null,
          error: {
            code: "P0001",
            message: "HELP_RATE_LIMIT_1H",
            details: "HELP_IDEMPOTENCY_SAFE_TO_REPLACE",
            hint: `do not reflect ${VALID_TOKEN} guest@example.test`,
          },
        }),
    }),
  );

  assertEquals(response.status, 429);
  const raw = await response.text();
  assertEquals(raw.includes(VALID_TOKEN), false);
  assertEquals(raw.includes("guest@example.test"), false);
  const body = JSON.parse(raw);
  assertEquals(body.error, {
    code: "HELP_RATE_LIMIT_1H",
    message:
      "O limite temporário de pedidos foi atingido. Tente novamente mais tarde.",
    idempotency: { safe_to_replace: true },
  });
});

Deno.test("rejects a database response that could disclose a notification claim or DSR", async () => {
  for (
    const unsafeRow of [
      { ...VALID_ROW, out_notification_claim: "secret-claim" },
      {
        ...VALID_ROW,
        out_data_subject_request: { protocol: "KC-DSR-unsafe" },
      },
      { ...VALID_ROW, out_protocol: "KC-DSR-20260729-AAAAAAAAAAAAAAAA" },
    ]
  ) {
    const response = await handlePrivacyHelpGuest(
      request(),
      dependencies({
        rpc: () => Promise.resolve({ data: [unsafeRow], error: null }),
      }),
    );
    assertEquals(response.status, 502);
    const raw = await response.text();
    assertEquals(raw.includes("secret-claim"), false);
    assertEquals(raw.includes("KC-DSR-unsafe"), false);
    assertEquals(
      (JSON.parse(raw).error as Record<string, unknown>).code,
      "PRIVACY_HELP_RESPONSE_INVALID",
    );
  }
});

Deno.test("configuration rejects wildcards and non-exact origin or hostname entries", async () => {
  const invalidConfigurations: Array<Record<string, string>> = [
    { KC_PRIVACY_HELP_ALLOWED_ORIGINS: "*" },
    { KC_PRIVACY_HELP_ALLOWED_ORIGINS: `${ORIGIN}/path` },
    { KC_PRIVACY_HELP_ALLOWED_ORIGINS: "http://kinocampus.com.br" },
    { KC_TURNSTILE_EXPECTED_HOSTNAMES: "*.kinocampus.com.br" },
    { KC_TURNSTILE_EXPECTED_HOSTNAMES: "https://www.kinocampus.com.br" },
  ];
  for (const override of invalidConfigurations) {
    const response = await handlePrivacyHelpGuest(
      request(),
      dependencies({ env: testEnv(override) }),
    );
    assertEquals(response.status, 503);
    assertMatch(
      JSON.stringify(await responseJson(response)),
      /GUEST_PRIVACY_CONFIG_UNAVAILABLE/,
    );
  }
});

Deno.test("production fails closed for every official Cloudflare test secret", async () => {
  for (
    const testSecret of [
      "1x0000000000000000000000000000000AA",
      "2x0000000000000000000000000000000AA",
      "3x0000000000000000000000000000000AA",
    ]
  ) {
    const response = await handlePrivacyHelpGuest(
      request(),
      dependencies({
        env: testEnv({
          KC_TURNSTILE_ENVIRONMENT: "production",
          KC_TURNSTILE_SECRET_KEY: testSecret,
        }),
      }),
    );
    assertEquals(response.status, 503);
    assertMatch(
      JSON.stringify(await responseJson(response)),
      /GUEST_PRIVACY_CONFIG_UNAVAILABLE/,
    );
  }
});

Deno.test("test keys require the explicit test environment", async () => {
  const testSecret = "1x0000000000000000000000000000000AA";
  const explicitTestResponse = await handlePrivacyHelpGuest(
    request(),
    dependencies({
      env: testEnv({
        KC_TURNSTILE_ENVIRONMENT: "test",
        KC_TURNSTILE_SECRET_KEY: testSecret,
      }),
    }),
  );
  assertEquals(explicitTestResponse.status, 200);

  for (const environment of ["", "development", "prod"]) {
    const response = await handlePrivacyHelpGuest(
      request(),
      dependencies({
        env: testEnv({
          KC_TURNSTILE_ENVIRONMENT: environment,
          KC_TURNSTILE_SECRET_KEY: testSecret,
        }),
      }),
    );
    assertEquals(response.status, 503);
  }
});

Deno.test("test environment rejects every non-test secret", async () => {
  const response = await handlePrivacyHelpGuest(
    request(),
    dependencies({
      env: testEnv({
        KC_TURNSTILE_ENVIRONMENT: "test",
        KC_TURNSTILE_SECRET_KEY: "not-an-official-test-secret",
      }),
    }),
  );
  assertEquals(response.status, 503);
});

Deno.test("production accepts an explicit non-test secret and rejects loopback configuration", async () => {
  const productionEnv = {
    KC_TURNSTILE_ENVIRONMENT: "production",
    KC_TURNSTILE_SECRET_KEY: "production-secret-placeholder",
  };
  const productionResponse = await handlePrivacyHelpGuest(
    request(),
    dependencies({ env: testEnv(productionEnv) }),
  );
  assertEquals(productionResponse.status, 200);

  for (
    const loopbackConfig of [
      {
        ...productionEnv,
        KC_PRIVACY_HELP_ALLOWED_ORIGINS: "http://127.0.0.1:3000",
      },
      {
        ...productionEnv,
        KC_TURNSTILE_EXPECTED_HOSTNAMES: "localhost",
      },
      {
        ...productionEnv,
        KC_TURNSTILE_EXPECTED_HOSTNAMES: "127.0.0.1",
      },
    ]
  ) {
    const response = await handlePrivacyHelpGuest(
      request(),
      dependencies({ env: testEnv(loopbackConfig) }),
    );
    assertEquals(response.status, 503);
  }
});
