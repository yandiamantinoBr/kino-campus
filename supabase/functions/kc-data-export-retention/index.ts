// KinoCampus - authenticated, scheduled Storage-first export retention.
//
// The gateway JWT check is intentionally disabled for this machine-to-machine
// endpoint. pg_cron signs each short-lived request with a dedicated HMAC key;
// the reusable key itself is never placed in pg_net's request queue.

import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.95.0";
import {
  BoundedRequestBodyError,
  readBoundedRequestText,
} from "../_shared/bounded-request-body.ts";

type JsonRecord = Record<string, unknown>;

const MAX_BATCH_SIZE = 100;
const MAX_REMOVE_ATTEMPTS = 3;
const SIGNATURE_WINDOW_SECONDS = 120;
const SIGNED_PATH = "/functions/v1/kc-data-export-retention";
const ARTIFACT_REF_RE = /^KEA-[A-F0-9]{32}$/;
const OBJECT_PATH_RE = /^objects\/[a-f0-9]{64}[.]json$/;
const ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX_64_RE = /^[a-f0-9]{64}$/;

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, maximum = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function env(name: string): string {
  try {
    return (Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maximum = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmacSha256Hex(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)),
  );
}

function response(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeErrorCode(value: unknown, fallback: string): string {
  const normalized = text(value, 64).toUpperCase();
  return ERROR_CODE_RE.test(normalized) ? normalized : fallback;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function removeObjectWithRetry(
  admin: SupabaseClient,
  bucketId: string,
  objectPath: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_REMOVE_ATTEMPTS; attempt += 1) {
    const { error } = await admin.storage.from(bucketId).remove([objectPath]);
    if (!error) return true;
    if (attempt < MAX_REMOVE_ATTEMPTS) {
      await delay(attempt * 150);
    }
  }
  return false;
}

async function finishRun(
  admin: SupabaseClient,
  runId: string,
  status: "succeeded" | "partial_failure" | "failed",
  claimedCount: number,
  purgedCount: number,
  failedCount: number,
  failureCodes: string[],
  errorCode: string | null,
): Promise<boolean> {
  const { error } = await admin.rpc(
    "kc_finish_data_export_retention_run",
    {
      p_run_id: runId,
      p_status: status,
      p_claimed_count: claimedCount,
      p_purged_count: purgedCount,
      p_failed_count: failedCount,
      p_failure_codes: Array.from(new Set(failureCodes)).slice(0, 100),
      p_error_code: errorCode,
    },
  );
  return !error;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return response(405, {
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." },
    });
  }

  const expectedSecret = env("KC_DATA_EXPORT_RETENTION_SECRET");
  if (expectedSecret.length < 32 || expectedSecret.length > 256) {
    console.error(
      "[kc-data-export-retention] configuration unavailable",
      { code: "RETENTION_SECRET_NOT_CONFIGURED" },
    );
    return response(503, {
      ok: false,
      error: {
        code: "RETENTION_UNAVAILABLE",
        message: "Servico de retencao indisponivel.",
      },
    });
  }

  const signatureVersion = text(
    request.headers.get("x-kc-signature-version"),
    10,
  );
  const signedPath = text(request.headers.get("x-kc-signed-path"), 100);
  const timestampText = text(request.headers.get("x-kc-timestamp"), 20);
  const nonce = text(request.headers.get("x-kc-nonce"), 50).toLowerCase();
  const suppliedSignature = text(
    request.headers.get("x-kc-signature"),
    80,
  ).toLowerCase();
  const timestamp = Number(timestampText);
  if (
    signatureVersion !== "v1" ||
    signedPath !== SIGNED_PATH ||
    !/^[0-9]{10}$/.test(timestampText) ||
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) >
      SIGNATURE_WINDOW_SECONDS ||
    !UUID_RE.test(nonce) ||
    !HEX_64_RE.test(suppliedSignature)
  ) {
    return response(401, {
      ok: false,
      error: {
        code: "RETENTION_AUTH_REQUIRED",
        message: "Autenticacao de servico obrigatoria.",
      },
    });
  }

  let rawBody: string;
  try {
    rawBody = await readBoundedRequestText(request, 1024);
  } catch (error) {
    if (
      error instanceof BoundedRequestBodyError &&
      error.code === "BODY_TOO_LARGE"
    ) {
      return response(413, {
        ok: false,
        error: { code: "BODY_TOO_LARGE", message: "Corpo muito grande." },
      });
    }
    return response(400, {
      ok: false,
      error: { code: "INVALID_BODY", message: "Corpo invalido." },
    });
  }
  const bodyHash = await sha256Hex(rawBody);
  const canonicalRequest = [
    "POST",
    SIGNED_PATH,
    timestampText,
    nonce,
    bodyHash,
  ].join("\n");
  const expectedSignature = await hmacSha256Hex(
    expectedSecret,
    canonicalRequest,
  );
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) {
    return response(401, {
      ok: false,
      error: {
        code: "RETENTION_AUTH_REQUIRED",
        message: "Autenticacao de servico obrigatoria.",
      },
    });
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[kc-data-export-retention] configuration unavailable",
      { code: "SUPABASE_SERVICE_CONFIGURATION_MISSING" },
    );
    return response(503, {
      ok: false,
      error: {
        code: "RETENTION_UNAVAILABLE",
        message: "Servico de retencao indisponivel.",
      },
    });
  }

  let input: JsonRecord;
  try {
    const parsed = JSON.parse(rawBody);
    input = isObject(parsed) ? parsed : {};
  } catch {
    return response(400, {
      ok: false,
      error: { code: "INVALID_JSON", message: "Corpo JSON invalido." },
    });
  }

  const inputKeys = Object.keys(input).sort();
  if (
    inputKeys.join(",") !== "action,limit,source" ||
    text(input.action, 40).toLowerCase() !== "purge_expired"
  ) {
    return response(400, {
      ok: false,
      error: {
        code: "RETENTION_ACTION_INVALID",
        message: "Acao de retencao invalida.",
      },
    });
  }
  const requestedLimit = Number(input.limit);
  const requestedSource = text(input.source, 32).toLowerCase();
  if (
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > MAX_BATCH_SIZE ||
    !new Set(["pg_cron", "manual", "retry"]).has(requestedSource)
  ) {
    return response(400, {
      ok: false,
      error: {
        code: "RETENTION_PAYLOAD_INVALID",
        message: "Parametros de retencao invalidos.",
      },
    });
  }
  const limit = requestedLimit;
  const source = requestedSource;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: beginData, error: beginError } = await admin.rpc(
    "kc_begin_data_export_retention_run",
    {
      p_source: source,
      p_requested_limit: limit,
      p_request_nonce: nonce,
      p_request_signed_at: new Date(timestamp * 1000).toISOString(),
    },
  );
  const runId = isObject(beginData) ? text(beginData.run_id, 80) : "";
  if (beginError || !runId) {
    console.error(
      "[kc-data-export-retention] run start failed",
      { code: "RETENTION_RUN_START_FAILED" },
    );
    return response(503, {
      ok: false,
      error: {
        code: "RETENTION_RUN_START_FAILED",
        message: "Nao foi possivel iniciar a retencao.",
      },
    });
  }
  if (isObject(beginData) && beginData.reused_existing === true) {
    return response(202, {
      ok: true,
      run_id: runId,
      replay_ignored: true,
    });
  }

  let claimedCount = 0;
  let purgedCount = 0;
  const failureCodes: string[] = [];

  try {
    const { data: batchData, error: batchError } = await admin.rpc(
      "kc_claim_expired_data_export_artifacts",
      { p_limit: limit, p_actor_id: null },
    );
    const batch = isObject(batchData) ? batchData : null;
    const claims = batch && Array.isArray(batch.artifacts)
      ? batch.artifacts.filter(isObject)
      : [];
    if (batchError || !batch) {
      throw new Error("RETENTION_BATCH_CLAIM_FAILED");
    }
    claimedCount = claims.length;

    for (const claim of claims) {
      const artifactRef = text(claim.artifact_ref, 80).toUpperCase();
      const version = Number(claim.version);
      const bucketId = text(claim.bucket_id, 80);
      const objectPath = text(claim.object_path, 200);
      if (
        !ARTIFACT_REF_RE.test(artifactRef) ||
        !Number.isSafeInteger(version) ||
        bucketId !== "kino-data-exports" ||
        (objectPath && !OBJECT_PATH_RE.test(objectPath))
      ) {
        failureCodes.push("RETENTION_CLAIM_INVALID");
        continue;
      }

      if (
        objectPath &&
        !(await removeObjectWithRetry(admin, bucketId, objectPath))
      ) {
        failureCodes.push("RETENTION_STORAGE_REMOVE_FAILED");
        continue;
      }

      const { error: finalizeError } = await admin.rpc(
        "kc_purge_data_export_artifact",
        {
          p_artifact_ref: artifactRef,
          p_expected_version: version,
          p_actor_id: null,
        },
      );
      if (finalizeError) {
        failureCodes.push(
          safeErrorCode(
            finalizeError.message,
            "RETENTION_PURGE_FINALIZE_FAILED",
          ),
        );
        continue;
      }
      purgedCount += 1;
    }

    const failedCount = claimedCount - purgedCount;
    const status = failedCount > 0 ? "partial_failure" : "succeeded";
    const finished = await finishRun(
      admin,
      runId,
      status,
      claimedCount,
      purgedCount,
      failedCount,
      failureCodes,
      failedCount > 0 ? "EXPORT_RETENTION_PURGE_PARTIAL_FAILURE" : null,
    );
    if (!finished) {
      console.error(
        "[kc-data-export-retention] run finish failed",
        { code: "RETENTION_RUN_FINISH_FAILED" },
      );
      return response(500, {
        ok: false,
        error: {
          code: "RETENTION_RUN_FINISH_FAILED",
          message: "Retencao executada, mas o monitoramento falhou.",
        },
      });
    }

    return response(failedCount > 0 ? 207 : 200, {
      ok: failedCount === 0,
      run_id: runId,
      claimed_count: claimedCount,
      storage_cleaned_count: purgedCount,
      failed_count: failedCount,
      failure_codes: Array.from(new Set(failureCodes)),
      retry_scheduled: failedCount > 0,
      metadata_retained_for_retry: failedCount > 0,
    });
  } catch (error) {
    const errorCode = safeErrorCode(
      error instanceof Error ? error.message : error,
      "EXPORT_RETENTION_WORKER_FAILED",
    );
    await finishRun(
      admin,
      runId,
      "failed",
      claimedCount,
      purgedCount,
      Math.max(0, claimedCount - purgedCount),
      [errorCode],
      errorCode,
    );
    console.error(
      "[kc-data-export-retention] execution failed",
      { code: errorCode },
    );
    return response(500, {
      ok: false,
      error: {
        code: "RETENTION_EXECUTION_FAILED",
        message: "Falha operacional registrada para nova tentativa.",
      },
    });
  }
});
