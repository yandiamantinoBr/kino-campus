// KinoCampus - assisted LGPD export supplement administration.
//
// This function never accepts export contents from the browser. An
// authenticated administrator can diagnose processor blockers, attest a
// processor result, claim a queued job, build from the database, finalize the
// private artifact, retry a failed job, or purge an already eligible object.

import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.95.0";
import { isCurrentSessionActive } from "../_shared/active-session.ts";
import {
  buildDataProcessorMatrix,
  normalizeDataExportProcessorOutcomes,
  processorOutcomesAreDeliverable,
  toDataExportProcessorTasks,
} from "../_shared/data-processors.ts";
import {
  buildDataExport,
  containsPersistedDeliveryCapability,
} from "../kc-data-subject-request/index.ts";
import {
  BoundedRequestBodyError,
  readBoundedRequestText,
} from "../_shared/bounded-request-body.ts";

type JsonRecord = Record<string, unknown>;

const ARTIFACT_REF_RE = /^KEA-[A-F0-9]{32}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// The hosted Edge runtime has a 256 MiB memory ceiling. Building an export
// temporarily holds the object graph, JSON string and encoded bytes together,
// so the artifact cap must leave substantial headroom for the runtime/SDK.
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const SUPPLEMENT_READY_TTL_SECONDS = 7 * 24 * 60 * 60;
const PROCESSOR_DELIVERY_CHANNELS = new Set([
  "support_mailbox",
  "secure_file_transfer",
  "provider_portal",
  "in_person",
]);
const FORBIDDEN_PROCESSOR_CONTENT_KEYS = new Set([
  "bundle",
  "external_bundle",
  "processor_data",
  "processor_payload",
  "records",
  "content",
]);
const PROCESSOR_EVIDENCE_INPUT_KEYS = new Set([
  "action",
  "help_request_id",
  "artifact_ref",
  "processor",
  "outcome",
  "evidence_reference",
  "delivery_attested",
  "delivery_channel",
  "delivered_out_of_band_at",
  "delivered_at",
]);
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://kinocampus.com.br",
  "https://www.kinocampus.com.br",
  "https://kinocampus.vercel.app",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, maximum = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizedInputKey(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function containsForbiddenProcessorContent(
  value: unknown,
  depth = 0,
): boolean {
  if (!value || typeof value !== "object") return false;
  // The request body is bounded, but an unexpectedly deep object must still
  // fail closed instead of hiding forbidden processor content past the scan.
  if (depth > 5) return true;
  if (Array.isArray(value)) {
    return value.some((entry) =>
      containsForbiddenProcessorContent(entry, depth + 1)
    );
  }
  return Object.entries(value as JsonRecord).some(([key, entry]) =>
    FORBIDDEN_PROCESSOR_CONTENT_KEYS.has(normalizedInputKey(key)) ||
    containsForbiddenProcessorContent(entry, depth + 1)
  );
}

function containsUnexpectedProcessorEvidenceInput(value: JsonRecord): boolean {
  return Object.keys(value).some((key) =>
    !PROCESSOR_EVIDENCE_INPUT_KEYS.has(key)
  );
}

function env(name: string): string {
  try {
    return (Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function allowedOrigins(): Set<string> {
  const configured = env("KC_ALLOWED_ORIGINS").split(",").map((entry) =>
    entry.trim()
  ).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function headers(request: Request): Record<string, string> {
  const origin = request.headers.get("origin")?.trim() || "";
  return {
    ...(origin && allowedOrigins().has(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}

function response(
  request: Request,
  status: number,
  body: JsonRecord,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers(request),
    },
  });
}

function fail(
  request: Request,
  status: number,
  code: string,
  message: string,
): Response {
  return response(request, status, { ok: false, error: { code, message } });
}

function bearer(request: Request): string {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim() || "";
}

function jwtSessionId(token: string): string {
  try {
    const encoded = token.split(".")[1] || "";
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    const sessionId = text(payload?.session_id, 80).toLowerCase();
    return UUID_RE.test(sessionId) ? sessionId : "";
  } catch {
    return "";
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function adminStillAuthorized(
  userClient: SupabaseClient,
  actorId: string,
): Promise<boolean> {
  const { data, error } = await userClient
    .from("profiles")
    .select("id")
    .eq("id", actorId)
    .eq("is_admin", true)
    .maybeSingle();
  return !error && Boolean(data);
}

async function assertAdminWorkAuthorized(
  userClient: SupabaseClient,
  actorId: string,
): Promise<void> {
  if (!(await isCurrentSessionActive(userClient))) {
    throw new Error("SESSION_NOT_ACTIVE");
  }
  if (!(await adminStillAuthorized(userClient, actorId))) {
    throw new Error("ADMIN_REQUIRED");
  }
}

function safeArtifactSnapshot(value: unknown): JsonRecord | null {
  if (!isObject(value) || !isObject(value.artifact)) return null;
  return {
    artifact: value.artifact,
    request: isObject(value.request)
      ? {
        protocol: value.request.protocol,
        request_kind: value.request.request_kind,
        status: value.request.status,
        created_at: value.request.created_at,
        updated_at: value.request.updated_at,
      }
      : null,
  };
}

async function readArtifact(
  admin: SupabaseClient,
  actorId: string,
  actorSessionId: string,
  input: JsonRecord,
): Promise<JsonRecord | null> {
  const helpRequestId = text(input.help_request_id || input.helpRequestId, 80)
    .toLowerCase();
  const artifactRef = text(input.artifact_ref || input.artifactRef, 80)
    .toUpperCase();
  if (!UUID_RE.test(helpRequestId) && !ARTIFACT_REF_RE.test(artifactRef)) {
    return null;
  }
  const { data, error } = await admin.rpc(
    "kc_admin_read_data_export_artifact",
    {
      p_help_request_id: UUID_RE.test(helpRequestId) ? helpRequestId : null,
      p_artifact_ref: ARTIFACT_REF_RE.test(artifactRef) ? artifactRef : null,
      p_actor_id: actorId,
      p_actor_session_id: actorSessionId,
    },
  );
  if (error) {
    throw new Error(`ARTIFACT_READ_${text(error.code, 40) || "FAILED"}`);
  }
  return isObject(data) ? data : null;
}

function operationalErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("PROCESSORS_PENDING")) return "PROCESSORS_PENDING";
  if (message.includes("VERSION_CONFLICT")) return "VERSION_CONFLICT";
  if (message.includes("NOT_CLAIMABLE")) return "NOT_CLAIMABLE";
  if (message.includes("NOT_PURGEABLE")) return "NOT_PURGEABLE";
  if (message.includes("EXPORT_BUILD_PARTIAL")) return "EXPORT_BUILD_PARTIAL";
  if (message.includes("EXPORT_TOO_LARGE")) return "EXPORT_TOO_LARGE";
  if (message.includes("SUBJECT_NOT_ELIGIBLE")) {
    return "EXPORT_SUBJECT_NOT_ELIGIBLE";
  }
  if (message.includes("MEDIA_")) return "EXPORT_MEDIA_VALIDATION_FAILED";
  if (message.includes("EXPORT_TICKET_IDENTITY_NOT_VERIFIED")) {
    return "EXPORT_TICKET_IDENTITY_NOT_VERIFIED";
  }
  if (message.includes("EXPORT_TICKET_LINK_INPUT_INVALID")) {
    return "EXPORT_TICKET_LINK_INVALID";
  }
  if (message.includes("SESSION_NOT_ACTIVE")) return "SESSION_NOT_ACTIVE";
  if (message.includes("ADMIN_REQUIRED")) return "ADMIN_REQUIRED";
  return "EXPORT_ADMIN_OPERATION_FAILED";
}

async function markClaimFailed(
  admin: SupabaseClient,
  artifactRef: string,
  version: number,
  claimToken: string,
  errorCode: string,
): Promise<void> {
  if (
    !ARTIFACT_REF_RE.test(artifactRef) ||
    !Number.isSafeInteger(version) ||
    !/^[a-f0-9]{64}$/.test(claimToken)
  ) return;
  await admin.rpc("kc_fail_data_export_artifact", {
    p_artifact_ref: artifactRef,
    p_expected_version: version,
    p_claim_token: claimToken,
    p_error_code: errorCode,
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin")?.trim() || "";
  if (request.method === "OPTIONS") {
    return origin && !allowedOrigins().has(origin)
      ? fail(request, 403, "ORIGIN_NOT_ALLOWED", "Origem nao permitida.")
      : new Response(null, { status: 204, headers: headers(request) });
  }
  if (request.method !== "POST") {
    return fail(request, 405, "METHOD_NOT_ALLOWED", "Use POST.");
  }
  if (origin && !allowedOrigins().has(origin)) {
    return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Origem nao permitida.");
  }

  const supabaseUrl = env("SUPABASE_URL");
  const publicKey = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const token = bearer(request);
  if (!supabaseUrl || !publicKey || !serviceKey) {
    return fail(
      request,
      503,
      "EXPORT_ADMIN_UNAVAILABLE",
      "Servico administrativo indisponivel.",
    );
  }
  const actorSessionId = jwtSessionId(token);
  if (!token || !actorSessionId) {
    return fail(
      request,
      401,
      "SESSION_NOT_ACTIVE",
      "Entre novamente com uma conta administradora.",
    );
  }

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(
    token,
  );
  const actor = authData?.user || null;
  if (
    authError || !actor || actor.is_anonymous ||
    !(await isCurrentSessionActive(userClient))
  ) {
    return fail(
      request,
      401,
      "SESSION_NOT_ACTIVE",
      "Entre novamente com uma conta administradora.",
    );
  }
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("id,is_admin")
    .eq("id", actor.id)
    .eq("is_admin", true)
    .maybeSingle();
  if (profileError || !profile) {
    return fail(
      request,
      403,
      "ADMIN_REQUIRED",
      "Permissao administrativa obrigatoria.",
    );
  }

  let input: JsonRecord;
  try {
    const rawBody = await readBoundedRequestText(request, 65_536);
    const parsed = JSON.parse(rawBody);
    input = isObject(parsed) ? parsed : {};
  } catch (error) {
    if (
      error instanceof BoundedRequestBodyError &&
      error.code === "BODY_TOO_LARGE"
    ) {
      return fail(
        request,
        413,
        "BODY_TOO_LARGE",
        "Corpo da solicitacao muito grande.",
      );
    }
    return fail(request, 400, "INVALID_JSON", "Corpo JSON invalido.");
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const action = text(input.action, 40).toLowerCase();
  try {
    if (action === "purge_expired") {
      if (
        !(await isCurrentSessionActive(userClient)) ||
        !(await adminStillAuthorized(userClient, actor.id))
      ) {
        return fail(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "A sessao administrativa foi encerrada.",
        );
      }
      const requestedLimit = Number(input.limit);
      const limit = Number.isSafeInteger(requestedLimit)
        ? Math.max(1, Math.min(100, requestedLimit))
        : 25;
      const { data: batchData, error: batchError } = await admin.rpc(
        "kc_claim_expired_data_export_artifacts",
        {
          p_limit: limit,
          p_actor_id: actor.id,
          p_actor_session_id: actorSessionId,
        },
      );
      const batch = isObject(batchData) ? batchData : null;
      const claims = batch && Array.isArray(batch.artifacts)
        ? batch.artifacts.filter(isObject)
        : [];
      if (batchError || !batch) {
        throw new Error(
          `PURGE_BATCH_${text(batchError?.message, 160) || "FAILED"}`,
        );
      }

      let purgedCount = 0;
      const failures: JsonRecord[] = [];
      for (const claim of claims) {
        if (
          !(await isCurrentSessionActive(userClient)) ||
          !(await adminStillAuthorized(userClient, actor.id))
        ) {
          throw new Error("SESSION_NOT_ACTIVE");
        }
        const claimedRef = text(claim.artifact_ref, 80).toUpperCase();
        const claimedVersion = Number(claim.version);
        const bucketId = text(claim.bucket_id, 80);
        const objectPath = text(claim.object_path, 200);
        if (
          !ARTIFACT_REF_RE.test(claimedRef) ||
          !Number.isSafeInteger(claimedVersion) ||
          bucketId !== "kino-data-exports" ||
          (objectPath &&
            !/^objects\/[a-f0-9]{64}[.]json$/.test(objectPath))
        ) {
          failures.push({
            artifact_ref: claimedRef || null,
            code: "PURGE_CLAIM_INVALID",
          });
          continue;
        }
        if (objectPath) {
          const { error: removeError } = await admin.storage
            .from(bucketId)
            .remove([objectPath]);
          if (removeError) {
            failures.push({
              artifact_ref: claimedRef,
              code: "EXPORT_STORAGE_PURGE_FAILED",
            });
            continue;
          }
        }
        if (
          !(await isCurrentSessionActive(userClient)) ||
          !(await adminStillAuthorized(userClient, actor.id))
        ) {
          throw new Error("SESSION_NOT_ACTIVE");
        }
        const { error: finalizePurgeError } = await admin.rpc(
          "kc_purge_data_export_artifact",
          {
            p_artifact_ref: claimedRef,
            p_expected_version: claimedVersion,
            p_actor_id: actor.id,
            p_actor_session_id: actorSessionId,
          },
        );
        if (finalizePurgeError) {
          failures.push({
            artifact_ref: claimedRef,
            code: "EXPORT_PURGE_FINALIZE_FAILED",
          });
          continue;
        }
        purgedCount += 1;
      }
      return response(request, failures.length ? 207 : 200, {
        ok: failures.length === 0,
        claimed_count: claims.length,
        purged_count: purgedCount,
        failed_count: failures.length,
        failures,
        metadata_retained_for_failed_storage_deletions: true,
      });
    }

    if (action === "link_verified_ticket") {
      if (
        !(await isCurrentSessionActive(userClient)) ||
        !(await adminStillAuthorized(userClient, actor.id))
      ) {
        return fail(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "A sessao administrativa foi encerrada.",
        );
      }
      const helpRequestId = text(
        input.help_request_id || input.helpRequestId,
        80,
      ).toLowerCase();
      const accountEmail = text(
        input.account_email || input.accountEmail,
        255,
      ).toLowerCase();
      const requestKind = text(
        input.request_kind || input.requestKind,
        40,
      ).toLowerCase();
      const verificationChannel = text(
        input.identity_channel || input.verification_channel,
        80,
      ).toLowerCase();
      const identityReference = text(
        input.identity_reference || input.attestation_reference,
        500,
      );
      const verifiedAtInput = text(
        input.identity_verified_at || input.verified_at,
        80,
      );
      const verifiedAtMs = Date.parse(verifiedAtInput);
      const verifiedAt = Number.isFinite(verifiedAtMs)
        ? new Date(verifiedAtMs).toISOString()
        : "";
      const allowedChannels = new Set([
        "verified_email_challenge",
        "support_mailbox_reply",
        "identity_document_review",
        "in_person_verification",
      ]);
      if (
        !UUID_RE.test(helpRequestId) ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(accountEmail) ||
        !["data_access_copy", "data_portability"].includes(requestKind) ||
        !allowedChannels.has(verificationChannel) ||
        input.identity_attested !== true ||
        identityReference.length < 8 ||
        !verifiedAt ||
        verifiedAtMs < Date.now() - 30 * 24 * 60 * 60 * 1000 ||
        verifiedAtMs > Date.now() + 5 * 60 * 1000
      ) {
        return fail(
          request,
          400,
          "EXPORT_TICKET_LINK_INVALID",
          "Informe ticket, e-mail exato, tipo e comprovacao valida da identidade.",
        );
      }
      const attestationMaterial = [
        "kc-data-export-ticket-link-v1",
        helpRequestId,
        accountEmail,
        requestKind,
        verificationChannel,
        verifiedAt,
        identityReference,
      ].join("\n");
      const attestationSha256 = await sha256Hex(
        new TextEncoder().encode(attestationMaterial),
      );
      const { data, error } = await admin.rpc(
        "kc_link_verified_help_request_to_data_export",
        {
          p_help_request_id: helpRequestId,
          p_account_email: accountEmail,
          p_request_kind: requestKind,
          p_actor_id: actor.id,
          p_actor_session_id: actorSessionId,
          p_verification_channel: verificationChannel,
          p_attestation_sha256: attestationSha256,
          p_verified_at: verifiedAt,
          p_processors: toDataExportProcessorTasks(
            buildDataProcessorMatrix(),
          ),
        },
      );
      if (error || !isObject(data)) {
        throw new Error(
          `TICKET_LINK_${text(error?.message, 160) || "FAILED"}`,
        );
      }
      return response(request, 200, {
        ok: true,
        linked: data.linked === true,
        reused_existing: data.reused_existing === true,
        request: isObject(data.request) ? data.request : null,
        artifact: isObject(data.artifact) ? data.artifact : null,
      });
    }

    const snapshot = await readArtifact(
      admin,
      actor.id,
      actorSessionId,
      input,
    );
    if (!snapshot) {
      return fail(
        request,
        404,
        "ARTIFACT_NOT_FOUND",
        "Nenhum suplemento foi localizado para este atendimento.",
      );
    }
    const artifact = isObject(snapshot.artifact) ? snapshot.artifact : {};
    const artifactRef = text(artifact.artifact_ref, 80).toUpperCase();
    let artifactVersion = Number(artifact.version);

    if (action === "diagnose") {
      return response(request, 200, {
        ok: true,
        ...safeArtifactSnapshot(snapshot),
      });
    }

    if (action === "record_processor") {
      if (!(await isCurrentSessionActive(userClient))) {
        return fail(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "A sessao administrativa foi encerrada.",
        );
      }
      if (
        containsUnexpectedProcessorEvidenceInput(input) ||
        containsForbiddenProcessorContent(input)
      ) {
        return fail(
          request,
          400,
          "PROCESSOR_CONTENT_FORBIDDEN",
          "Nao envie arquivos, registros ou conteudo do operador pelo navegador.",
        );
      }
      const processorOutcome = text(input.outcome, 40).toLowerCase();
      const deliveryChannel = text(input.delivery_channel, 80).toLowerCase();
      const deliveredAtInput = text(
        input.delivered_out_of_band_at || input.delivered_at,
        80,
      );
      const deliveredAtMs = Date.parse(deliveredAtInput);
      const deliveredAt = Number.isFinite(deliveredAtMs)
        ? new Date(deliveredAtMs).toISOString()
        : "";
      const suppliedOutOfBand = processorOutcome === "supplied_out_of_band";
      if (
        !["supplied_out_of_band", "no_account_data"].includes(
          processorOutcome,
        ) ||
        (
          suppliedOutOfBand &&
          (
            input.delivery_attested !== true ||
            !PROCESSOR_DELIVERY_CHANNELS.has(deliveryChannel) ||
            !deliveredAt ||
            deliveredAtMs < Date.now() - 365 * 24 * 60 * 60 * 1000 ||
            deliveredAtMs > Date.now() + 5 * 60 * 1000
          )
        ) ||
        (
          !suppliedOutOfBand &&
          (
            input.delivery_attested === true ||
            deliveryChannel ||
            deliveredAtInput
          )
        )
      ) {
        return fail(
          request,
          400,
          "PROCESSOR_DELIVERY_ATTESTATION_INVALID",
          suppliedOutOfBand
            ? "Confirme o canal e a data da entrega feita fora da plataforma."
            : "Use a atestacao de entrega somente quando os dados foram enviados separadamente.",
        );
      }
      const { data, error } = await admin.rpc(
        "kc_record_data_export_processor_evidence",
        {
          p_artifact_ref: artifactRef,
          p_expected_version: artifactVersion,
          p_actor_id: actor.id,
          p_actor_session_id: actorSessionId,
          p_processor: text(input.processor, 80).toLowerCase(),
          p_outcome: processorOutcome,
          p_evidence_reference: text(input.evidence_reference, 500),
          p_delivery_attested: suppliedOutOfBand,
          p_delivery_channel: suppliedOutOfBand ? deliveryChannel : null,
          p_delivered_out_of_band_at: suppliedOutOfBand ? deliveredAt : null,
        },
      );
      if (error || !isObject(data)) {
        throw new Error(
          `PROCESSOR_EVIDENCE_${text(error?.message, 120) || "FAILED"}`,
        );
      }
      return response(request, 200, { ok: true, artifact: data });
    }

    if (action === "build" || action === "retry") {
      if (!(await isCurrentSessionActive(userClient))) {
        return fail(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "A sessao administrativa foi encerrada.",
        );
      }
      const artifactStatus = text(artifact.status, 40).toLowerCase();
      const artifactExpiresAt = Date.parse(text(artifact.expires_at, 80));
      if (
        artifactStatus === "ready" &&
        Number.isFinite(artifactExpiresAt) &&
        artifactExpiresAt > Date.now()
      ) {
        return response(request, 200, {
          ok: true,
          artifact,
          reused_existing: true,
        });
      }
      if (
        artifactStatus === "expired" ||
        (
          ["ready", "download_reserved"].includes(artifactStatus) &&
          (!Number.isFinite(artifactExpiresAt) ||
            artifactExpiresAt <= Date.now())
        )
      ) {
        const { data: recoveryData, error: recoveryError } = await admin.rpc(
          "kc_recover_expired_data_export_artifact",
          {
            p_artifact_ref: artifactRef,
            p_expected_version: artifactVersion,
            p_actor_id: actor.id,
            p_actor_session_id: actorSessionId,
            p_ttl_seconds: SUPPLEMENT_READY_TTL_SECONDS,
          },
        );
        const recovery = isObject(recoveryData) ? recoveryData : null;
        if (recoveryError || !recovery) {
          throw new Error(
            `RECOVERY_${text(recoveryError?.message, 160) || "FAILED"}`,
          );
        }
        if (recovery.reused_existing === true) {
          return response(request, 200, {
            ok: true,
            artifact: recovery,
            reused_existing: true,
          });
        }
        if (recovery.requires_rebuild !== true) {
          throw new Error("RECOVERY_INVALID_RESULT");
        }
        artifactVersion = Number(recovery.version);
      }

      const { data: claimData, error: claimError } = await admin.rpc(
        "kc_claim_data_export_artifact",
        {
          p_artifact_ref: artifactRef,
          p_expected_version: artifactVersion,
          p_actor_id: actor.id,
          p_actor_session_id: actorSessionId,
          p_lease_seconds: 900,
        },
      );
      const claim = isObject(claimData) ? claimData : null;
      if (claimError || !claim) {
        throw new Error(`CLAIM_${text(claimError?.message, 160) || "FAILED"}`);
      }
      const claimToken = text(claim.claim_token, 80);
      const claimVersion = Number(claim.version);
      const objectPath = text(claim.object_path, 200);
      const processorOutcomes = normalizeDataExportProcessorOutcomes(
        claim.processors,
      );
      let uploaded = false;

      try {
        if (!processorOutcomesAreDeliverable(processorOutcomes)) {
          throw new Error("EXPORT_PROCESSOR_OUTCOMES_INVALID");
        }
        const ownerUserId = text(snapshot.owner_user_id, 80).toLowerCase();
        const requestRow = isObject(snapshot.request) ? snapshot.request : null;
        if (
          !UUID_RE.test(ownerUserId) ||
          !requestRow ||
          !/^objects\/[a-f0-9]{64}[.]json$/.test(objectPath)
        ) {
          throw new Error("EXPORT_BUILD_REFERENCE_INVALID");
        }
        await assertAdminWorkAuthorized(userClient, actor.id);
        const { data: ownerData, error: ownerError } = await admin.auth.admin
          .getUserById(ownerUserId);
        if (ownerError || !ownerData.user) {
          throw new Error("EXPORT_BUILD_OWNER_NOT_FOUND");
        }

        const buildRequest = {
          ...requestRow,
          expires_at: new Date(
            Date.now() + SUPPLEMENT_READY_TTL_SECONDS * 1000,
          ).toISOString(),
        };
        const buildAuthorizationCheckpoint = (): Promise<void> =>
          assertAdminWorkAuthorized(userClient, actor.id);
        const built = await buildDataExport(
          admin,
          ownerData.user,
          buildRequest as never,
          {
            supplement: true,
            processorOutcomes,
            authorizationCheckpoint: buildAuthorizationCheckpoint,
          },
        );
        const manifest = isObject(built.payload.manifest)
          ? built.payload.manifest
          : {};
        const categoryResults = Array.isArray(manifest.category_results)
          ? manifest.category_results.filter(isObject)
          : [];
        const limits = isObject(manifest.limits) ? manifest.limits : {};
        const incompleteCategory = categoryResults.some((entry) =>
          entry.status !== "included" || entry.truncated === true
        );
        if (
          built.partial ||
          incompleteCategory ||
          limits.source_budget_exhausted === true ||
          manifest.signed_urls_embedded !== false ||
          containsPersistedDeliveryCapability(built.payload)
        ) {
          throw new Error("EXPORT_BUILD_PARTIAL");
        }

        await assertAdminWorkAuthorized(userClient, actor.id);
        const { data: mediaRefsData, error: mediaRefsError } = await admin.rpc(
          "kc_store_data_export_media_refs",
          {
            p_artifact_ref: artifactRef,
            p_expected_version: claimVersion,
            p_claim_token: claimToken,
            p_media_refs: built.supplementMediaRefs,
          },
        );
        const mediaRefsResult = isObject(mediaRefsData) ? mediaRefsData : null;
        if (
          mediaRefsError ||
          !mediaRefsResult ||
          Number(mediaRefsResult.media_ref_count) !==
            built.supplementMediaRefs.length
        ) {
          throw new Error(
            `EXPORT_MEDIA_REFS_${
              text(mediaRefsError?.message, 120) || "FAILED"
            }`,
          );
        }

        const serialized = JSON.stringify(built.payload);
        const bytes = new TextEncoder().encode(serialized);
        if (bytes.byteLength < 1 || bytes.byteLength > MAX_ARTIFACT_BYTES) {
          throw new Error("EXPORT_TOO_LARGE");
        }
        const digest = await sha256Hex(bytes);
        await assertAdminWorkAuthorized(userClient, actor.id);
        const {
          data: uploadAuthorizationData,
          error: uploadAuthorizationError,
        } = await admin.rpc("kc_authorize_data_export_artifact_upload", {
          p_artifact_ref: artifactRef,
          p_expected_version: claimVersion,
          p_claim_token: claimToken,
          p_lease_seconds: 1800,
        });
        const uploadAuthorization = isObject(uploadAuthorizationData)
          ? uploadAuthorizationData
          : null;
        if (
          uploadAuthorizationError ||
          !uploadAuthorization ||
          uploadAuthorization.artifact_ref !== artifactRef ||
          Number(uploadAuthorization.version) !== claimVersion ||
          uploadAuthorization.bucket_id !== "kino-data-exports" ||
          uploadAuthorization.object_path !== objectPath
        ) {
          throw new Error(
            `EXPORT_UPLOAD_AUTHORIZATION_${
              text(uploadAuthorizationError?.message, 120) || "FAILED"
            }`,
          );
        }
        // This is both the post-authorization checkpoint and the final
        // precondition immediately before the external Storage write.
        await assertAdminWorkAuthorized(userClient, actor.id);
        const { error: uploadError } = await admin.storage
          .from("kino-data-exports")
          .upload(objectPath, bytes, {
            contentType: "application/json",
            cacheControl: "0",
            upsert: true,
          });
        if (uploadError) {
          throw new Error("EXPORT_STORAGE_UPLOAD_FAILED");
        }
        uploaded = true;
        await assertAdminWorkAuthorized(userClient, actor.id);

        const categoryCounts = Object.fromEntries(
          categoryResults.map((
            entry,
          ) => [
            text(entry.key, 80).toLowerCase(),
            Math.max(0, Number(entry.included_count) || 0),
          ]).filter(([key]) => /^[a-z0-9][a-z0-9_]{1,79}$/.test(String(key))),
        );
        const payloadProcessorOutcomes = Array.isArray(
            built.payload.processor_outcomes,
          )
          ? built.payload.processor_outcomes
          : [];
        if (
          payloadProcessorOutcomes.length !== processorOutcomes.length
        ) {
          throw new Error("EXPORT_PROCESSOR_OUTCOMES_INVALID");
        }
        const persistedProcessorOutcomes = payloadProcessorOutcomes.map((
          raw,
        ) => {
          if (!isObject(raw)) {
            throw new Error("EXPORT_PROCESSOR_OUTCOMES_INVALID");
          }
          return {
            processor: raw.processor,
            treatment: raw.treatment,
            outcome: raw.outcome,
            evidence_sha256: raw.evidence_sha256,
            resolved_at: raw.resolved_at,
          };
        });
        await assertAdminWorkAuthorized(userClient, actor.id);
        const { data: finalizedData, error: finalizeError } = await admin.rpc(
          "kc_finalize_data_export_artifact",
          {
            p_artifact_ref: artifactRef,
            p_expected_version: claimVersion,
            p_claim_token: claimToken,
            p_sha256: digest,
            p_byte_size: bytes.byteLength,
            p_manifest: {
              schema_version: Number(built.payload.schema_version) || 1,
              category_count: Object.keys(categoryCounts).length,
              category_counts: categoryCounts,
              processor_outcomes: persistedProcessorOutcomes,
              media_ref_count: built.supplementMediaRefs.length,
              signed_urls_embedded: false,
              completeness: "complete",
            },
            p_ttl_seconds: SUPPLEMENT_READY_TTL_SECONDS,
          },
        );
        if (finalizeError || !isObject(finalizedData)) {
          throw new Error(
            `FINALIZE_${text(finalizeError?.message, 160) || "FAILED"}`,
          );
        }
        return response(request, 200, {
          ok: true,
          artifact: finalizedData,
        });
      } catch (buildError) {
        if (uploaded) {
          await admin.storage.from("kino-data-exports").remove([objectPath]);
        }
        await markClaimFailed(
          admin,
          artifactRef,
          claimVersion,
          claimToken,
          operationalErrorCode(buildError),
        );
        throw buildError;
      }
    }

    if (action === "purge") {
      if (!(await isCurrentSessionActive(userClient))) {
        return fail(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "A sessao administrativa foi encerrada.",
        );
      }
      const { data: purgeClaimData, error: purgeClaimError } = await admin.rpc(
        "kc_claim_data_export_artifact_purge",
        {
          p_artifact_ref: artifactRef,
          p_expected_version: artifactVersion,
          p_actor_id: actor.id,
          p_actor_session_id: actorSessionId,
        },
      );
      const purgeClaim = isObject(purgeClaimData) ? purgeClaimData : null;
      if (purgeClaimError || !purgeClaim) {
        throw new Error(
          `PURGE_CLAIM_${text(purgeClaimError?.message, 160) || "FAILED"}`,
        );
      }
      const objectPath = text(purgeClaim.object_path, 200);
      if (objectPath) {
        if (!/^objects\/[a-f0-9]{64}[.]json$/.test(objectPath)) {
          throw new Error("EXPORT_PURGE_PATH_INVALID");
        }
        const { error: removeError } = await admin.storage
          .from("kino-data-exports")
          .remove([objectPath]);
        if (removeError) throw new Error("EXPORT_STORAGE_PURGE_FAILED");
      }
      if (
        !(await isCurrentSessionActive(userClient)) ||
        !(await adminStillAuthorized(userClient, actor.id))
      ) {
        throw new Error("SESSION_NOT_ACTIVE");
      }
      const { data, error } = await admin.rpc(
        "kc_purge_data_export_artifact",
        {
          p_artifact_ref: artifactRef,
          p_expected_version: Number(purgeClaim.version),
          p_actor_id: actor.id,
          p_actor_session_id: actorSessionId,
        },
      );
      if (error || !isObject(data)) {
        throw new Error(`PURGE_${text(error?.message, 160) || "FAILED"}`);
      }
      return response(request, 200, { ok: true, artifact: data });
    }

    return fail(request, 400, "INVALID_ACTION", "Acao invalida.");
  } catch (error) {
    const code = operationalErrorCode(error);
    console.error("[kc-data-export-admin] operation failed", { action, code });
    const status = code === "SESSION_NOT_ACTIVE"
      ? 401
      : code === "PROCESSORS_PENDING" ||
          code === "EXPORT_BUILD_PARTIAL" ||
          code === "EXPORT_SUBJECT_NOT_ELIGIBLE" ||
          code === "EXPORT_MEDIA_VALIDATION_FAILED" ||
          code === "EXPORT_TICKET_IDENTITY_NOT_VERIFIED"
      ? 409
      : code === "EXPORT_TICKET_LINK_INVALID"
      ? 400
      : 500;
    return fail(
      request,
      status,
      code,
      code === "PROCESSORS_PENDING"
        ? "Conclua a revisao dos operadores antes de gerar o suplemento."
        : code === "EXPORT_BUILD_PARTIAL"
        ? "A coleta ainda apresenta lacunas; o atendimento permanece aberto."
        : code === "EXPORT_SUBJECT_NOT_ELIGIBLE"
        ? "A geracao foi interrompida porque o titular ou o pedido mudou, inclusive por exclusao concorrente."
        : code === "EXPORT_MEDIA_VALIDATION_FAILED"
        ? "Os anexos privados nao puderam ser comprovados; o suplemento nao foi publicado."
        : code === "EXPORT_TICKET_IDENTITY_NOT_VERIFIED"
        ? "O vinculo nao foi realizado. Revalide a identidade e confirme que o e-mail informado e exatamente o mesmo do ticket e da conta."
        : code === "EXPORT_TICKET_LINK_INVALID"
        ? "Os dados da verificacao administrativa estao incompletos ou invalidos."
        : code === "SESSION_NOT_ACTIVE"
        ? "A sessao administrativa foi encerrada."
        : "Nao foi possivel concluir a operacao do suplemento.",
    );
  }
});
