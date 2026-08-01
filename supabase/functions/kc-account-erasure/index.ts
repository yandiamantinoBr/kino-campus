// KinoCampus - Edge Function: kc-account-erasure
//
// Admin-only LGPD account-erasure workflow.
// Actions:
// - link_verified_identity
// - diagnose
// - apply_reversible
// - record_confirmation_delivery
// - cancel_reversible
// - generate_receipt
// - erase_confirmed
// - retry_finalize

import { createClient } from "jsr:@supabase/supabase-js@2.95.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { buildDataProcessorMatrix } from "../_shared/data-processors.ts";
import {
  BoundedRequestBodyError,
  readBoundedRequestText,
} from "../_shared/bounded-request-body.ts";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;
type WorkflowClaim = {
  request: JsonObject;
  token: string;
  version: number;
  expiresAt: string;
  actorId: string;
  sessionId: string;
  dataSubjectRequestStatus?: string | null;
};
type AuthUserInspection =
  | { state: "present"; user: JsonObject }
  | { state: "absent"; user: null }
  | { state: "unknown"; user: null };
type IdentityAssurance = {
  verified: boolean;
  source: string;
  help_user_id: string | null;
  target_user_id: string | null;
  evidence?: JsonObject;
};
type StorageObjectRef = {
  bucket: string;
  path: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;
const EXPORT_ARTIFACT_REF_RE = /^KEA-[A-F0-9]{32}$/;
const EXPORT_ARTIFACT_PATH_RE = /^objects\/[a-f0-9]{64}[.]json$/;
const DEFAULT_APP_BASE_URL = "https://www.kinocampus.com.br";
const DEFAULT_FROM_NAME = "KinoCampus";
const DEFAULT_FROM_EMAIL = "contato@kinocampus.com.br";
const DEFAULT_SMTP_HOST = "smtp.hostinger.com";
const DEFAULT_SMTP_PORT = 465;
const ACCOUNT_ERASURE_CONTRACT_VERSION = "kc-account-erasure-2026-08-01-v1";
const ACTION_CLAIM_TTL_SECONDS = 15 * 60;
const DEFAULT_COMPLETION_OUTBOX_TTL_SECONDS = 6 * 60 * 60;
const CANONICAL_ERASURE_KIND = "account_erasure";
const NON_ERASURE_KINDS = new Set(["data_access_copy", "data_portability"]);
const STORED_IDENTITY_ASSURANCE_SOURCES = new Set([
  "linked_authenticated_data_subject_request",
  "admin_verified_anonymous_erasure",
  "authenticated_help_request_owner_match",
  "legacy_manual_identity_verification",
]);
const IDENTITY_EVIDENCE_CHANNELS = new Set([
  "verified_email_challenge",
  "support_mailbox_reply",
  "identity_document_review",
  "in_person_verification",
]);
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.kinocampus.com.br",
  "https://kinocampus.com.br",
  "https://kinocampus.vercel.app",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];
const SUPPORTED_ACTIONS = new Set([
  "capabilities",
  "link_verified_identity",
  "diagnose",
  "apply_reversible",
  "record_confirmation_delivery",
  "cancel_reversible",
  "generate_receipt",
  "erase_confirmed",
  "retry_finalize",
]);

const WORKFLOW_RESPONSE_FIELDS = new Set([
  "status",
  "requested_at",
  "confirmation_requested_at",
  "confirmed_at",
  "reversible_applied_at",
  "erased_at",
  "email_hash",
  "target_email_domain",
  "confirmation_channel",
  "confirmation_received_at",
  "counts",
  "receipt",
  "metadata",
  "created_at",
  "updated_at",
  "retention_until",
]);

const PRIVATE_RESPONSE_KEYS = new Set([
  "auth_delete_checkpoint",
  "checkpoint",
  "checkpoint_state",
  "core_inventory",
  "repair_target_user_id",
  "reversible_snapshot",
  "action_claim",
  "operation_claim_token",
  "operation_claimed_at",
  "operation_claim_expires_at",
  "operation_claimed_by",
  "operation_claim_session_id",
  "intent_token",
  "request_id",
  "workflow_id",
  "data_subject_request_id",
  "help_request_id",
  "user_id",
  "processed_by",
  "confirmation_recorded_by",
  "actor_user_id",
  "recorded_by",
]);

class WorkflowError extends Error {
  status: number;
  code: string;
  details?: JsonObject;

  constructor(status: number, code: string, details?: JsonObject) {
    super(code);
    this.name = "WorkflowError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function allowedOrigins() {
  const configured = getEnv("KC_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin")?.trim() || "";
  return !origin || allowedOrigins().has(origin);
}

function securityHeaders(request: Request) {
  const origin = request.headers.get("origin")?.trim() || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function projectIdentityAssuranceForResponse(value: unknown): JsonObject {
  const assurance = asObject(value);
  const evidence = asObject(assurance.evidence);
  const rawSource = typeof assurance.source === "string"
    ? safeString(assurance.source, 120)
    : "";
  const projected: JsonObject = {
    verified: assurance.verified === true,
    source: rawSource || "missing",
  };
  if (typeof assurance.requires_manual_evidence === "boolean") {
    projected.requires_manual_evidence = assurance.requires_manual_evidence;
  }
  if (typeof assurance.help_user_id_matches_target === "boolean") {
    projected.help_user_id_matches_target =
      assurance.help_user_id_matches_target;
  }
  const projectedEvidence: JsonObject = {};
  for (
    const key of [
      "channel",
      "reference_hash",
      "event_at",
      "recorded_at",
    ]
  ) {
    const item = evidence[key];
    if (typeof item !== "string") continue;
    const safeItem = safeString(item, 80);
    if (!safeItem || UUID_RE.test(safeItem)) continue;
    if (key === "reference_hash" && !/^[a-f0-9]{64}$/.test(safeItem)) {
      continue;
    }
    if (key === "channel" && !/^[a-z][a-z0-9_-]{1,79}$/.test(safeItem)) {
      continue;
    }
    if (
      (key === "event_at" || key === "recorded_at") &&
      !Number.isFinite(Date.parse(safeItem))
    ) continue;
    projectedEvidence[key] = safeItem;
  }
  if (Object.keys(projectedEvidence).length) {
    projected.evidence = projectedEvidence;
  }
  return projected;
}

function isPrivateResponseKey(key: string) {
  const normalized = key.toLowerCase();
  return normalized.startsWith("auth_delete_") ||
    normalized.endsWith("_id") ||
    normalized.endsWith("_ids") ||
    normalized.endsWith("_by") ||
    PRIVATE_RESPONSE_KEYS.has(normalized);
}

function sanitizeResponseValue(value: unknown, key = ""): unknown {
  if (isPrivateResponseKey(key)) return undefined;
  if (key === "identity_assurance") {
    return projectIdentityAssuranceForResponse(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeResponseValue(item)).filter(
      (item) => item !== undefined,
    );
  }
  if (typeof value === "string" && UUID_RE.test(value.trim())) {
    return undefined;
  }
  if (!value || typeof value !== "object") return value;

  const source = value as JsonObject;
  if (key === "request") {
    const projected: JsonObject = {};
    for (const field of WORKFLOW_RESPONSE_FIELDS) {
      if (source[field] === undefined) continue;
      const safeValue = sanitizeResponseValue(source[field], field);
      if (safeValue !== undefined) projected[field] = safeValue;
    }
    return projected;
  }

  const projected: JsonObject = {};
  for (const [field, item] of Object.entries(source)) {
    const safeValue = sanitizeResponseValue(item, field);
    if (safeValue !== undefined) projected[field] = safeValue;
  }
  return projected;
}

function projectEdgeResponse(body: Record<string, unknown>) {
  const projected = sanitizeResponseValue(body) as Record<string, unknown>;
  projected.contract_version = ACCOUNT_ERASURE_CONTRACT_VERSION;
  return projected;
}

function json(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(projectEdgeResponse(body)), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...securityHeaders(request),
    },
  });
}

function getEnv(name: string, fallback = "") {
  return Deno.env.get(name)?.trim() || fallback;
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sessionIdFromAuthorization(authHeader: string) {
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[1])),
    );
    const sessionId = safeString(payload?.session_id, 80);
    return UUID_RE.test(sessionId) ? sessionId : null;
  } catch (_error) {
    return null;
  }
}

function completionOutboxKeyVersion() {
  const version = safeString(getEnv("KC_ERASURE_OUTBOX_KEY_VERSION", "v1"), 64);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(version)) {
    throw new Error("completion_outbox_key_version_invalid");
  }
  return version;
}

async function completionOutboxKey() {
  const encoded = getEnv("KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64");
  if (!encoded) throw new Error("completion_outbox_key_missing");
  let raw: Uint8Array;
  try {
    raw = decodeBase64Url(encoded);
  } catch (_error) {
    throw new Error("completion_outbox_key_invalid");
  }
  if (raw.length !== 32) throw new Error("completion_outbox_key_invalid");
  const keyBytes = new Uint8Array(32);
  keyBytes.set(raw);
  return crypto.subtle.importKey(
    "raw",
    keyBytes.buffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function completionOutboxEncryptionReady() {
  try {
    completionOutboxKeyVersion();
    await completionOutboxKey();
    return true;
  } catch (_error) {
    return false;
  }
}

function completionOutboxAad(
  workflowId: string,
  dataSubjectRequestId: string | null,
  keyVersion: string,
) {
  return new TextEncoder().encode(
    `kino-erasure-completion:${workflowId}:${
      dataSubjectRequestId || "legacy"
    }:${keyVersion}`,
  );
}

async function encryptCompletionRecipient(
  email: string,
  workflowId: string,
  dataSubjectRequestId: string | null,
) {
  if (!EMAIL_RE.test(email) || email.endsWith("@redacted.kinocampus.local")) {
    throw new Error("completion_recipient_unavailable");
  }
  const keyVersion = completionOutboxKeyVersion();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: completionOutboxAad(
        workflowId,
        dataSubjectRequestId,
        keyVersion,
      ),
      tagLength: 128,
    },
    await completionOutboxKey(),
    new TextEncoder().encode(email),
  );
  return {
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    nonce: encodeBase64Url(nonce),
    keyVersion,
  };
}

async function decryptCompletionRecipient(
  ciphertext: string,
  nonce: string,
  keyVersion: string,
  workflowId: string,
  dataSubjectRequestId: string | null,
) {
  if (keyVersion !== completionOutboxKeyVersion()) {
    throw new Error("completion_outbox_key_version_unavailable");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64Url(nonce),
        additionalData: completionOutboxAad(
          workflowId,
          dataSubjectRequestId,
          keyVersion,
        ),
        tagLength: 128,
      },
      await completionOutboxKey(),
      decodeBase64Url(ciphertext),
    );
    const email = normalizeEmail(new TextDecoder().decode(plaintext));
    if (!EMAIL_RE.test(email) || email.endsWith("@redacted.kinocampus.local")) {
      throw new Error("completion_recipient_invalid");
    }
    return email;
  } catch (_error) {
    throw new Error("completion_outbox_decryption_failed");
  }
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isAccountErasureHelpRequest(helpRequest: JsonObject | null) {
  if (!helpRequest) return false;
  const metadata = asObject(helpRequest.metadata);
  const requestKind = safeString(metadata.request_kind, 80).toLowerCase();
  const type = safeString(helpRequest.type, 80).toLowerCase();
  const topic = safeString(helpRequest.topic, 80).toLowerCase();
  const subtopic = safeString(helpRequest.subtopic, 80).toLowerCase();
  const canonicalTuple = type === "account_access" &&
    topic === "onboarding_settings" &&
    subtopic === "account_deletion";
  if (NON_ERASURE_KINDS.has(requestKind)) return false;
  if (requestKind) {
    return requestKind === CANONICAL_ERASURE_KIND && canonicalTuple;
  }
  if (canonicalTuple) return true;

  // Legacy fallback only. "LGPD" by itself is intentionally not an erasure signal.
  const text = normalizeSearchText([
    helpRequest.type,
    helpRequest.topic,
    helpRequest.subtopic,
    helpRequest.subject,
    helpRequest.message,
  ].join(" "));
  const hasErasureVerb =
    /\b(exclusao|excluir|eliminacao|eliminar|remocao|remover|apagar|deletar|encerrar)\b/
      .test(text);
  const hasPersonalAccountTarget =
    /\b(minha conta|conta do usuario|conta e dados|perfil|dados pessoais|dados cadastrais)\b/
      .test(text);
  const structuredAccountRequest = type === "account_access" &&
    topic === "onboarding_settings";
  return hasErasureVerb && hasPersonalAccountTarget && structuredAccountRequest;
}

function parseEvidenceTimestamp(value: unknown, field: string) {
  const raw = safeString(value, 80);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) {
    throw new WorkflowError(400, `${field}_required`);
  }
  if (parsed > Date.now() + (5 * 60 * 1000)) {
    throw new WorkflowError(400, `${field}_in_future`);
  }
  return new Date(parsed).toISOString();
}

async function buildEvidence(
  raw: unknown,
  opts: {
    kind:
      | "confirmation"
      | "delivery"
      | "cancellation"
      | "provider"
      | "identity"
      | "copy_gate";
    actorId: string;
    allowedChannels: string[];
    timestampField: string;
  },
) {
  const value = asObject(raw);
  if (value.attested !== true) {
    throw new WorkflowError(400, `${opts.kind}_attestation_required`);
  }
  const channel = safeString(value.channel, 80).toLowerCase();
  if (!opts.allowedChannels.includes(channel)) {
    throw new WorkflowError(400, `${opts.kind}_channel_invalid`);
  }
  const reference = safeString(value.reference, 320);
  if (reference.length < 6) {
    throw new WorkflowError(400, `${opts.kind}_reference_required`);
  }
  const eventAt = parseEvidenceTimestamp(
    value[opts.timestampField],
    `${opts.kind}_${opts.timestampField}`,
  );
  return {
    channel,
    reference_hash: await sha256Hex(reference),
    event_at: eventAt,
    recorded_at: new Date().toISOString(),
    recorded_by: opts.actorId,
  };
}

function identityLinkRpcError(error: unknown) {
  const message = safeString(
    asObject(error).message || asObject(error).details || error,
    600,
  );
  if (
    /PGRST202|could not find|schema cache|does not exist/i.test(message)
  ) {
    return new WorkflowError(503, "identity_link_capability_missing");
  }
  const databaseCode = [
    "ERASURE_IDENTITY_LINK_INPUT_INVALID",
    "ERASURE_IDENTITY_ACCOUNT_NOT_UNIQUE",
    "ERASURE_IDENTITY_ACCOUNT_CHANGED",
    "ERASURE_IDENTITY_PROFILE_MISSING",
    "ERASURE_IDENTITY_HELP_NOT_FOUND",
    "ERASURE_IDENTITY_HELP_MISMATCH",
    "ERASURE_IDENTITY_DSR_NOT_UNIQUE",
    "ERASURE_IDENTITY_DSR_MATERIALIZATION_CONFLICT",
    "ERASURE_IDENTITY_DSR_MISMATCH",
    "ERASURE_IDENTITY_WORKFLOW_NOT_UNIQUE",
    "ERASURE_IDENTITY_WORKFLOW_CHANGED",
    "ERASURE_IDENTITY_LINK_CONFLICT",
    "ERASURE_IDENTITY_HELP_STATE_INVALID",
    "ERASURE_IDENTITY_DSR_STATE_INVALID",
    "ERASURE_IDENTITY_SUBJECT_CLOSED",
    "ERASURE_IDENTITY_SUBJECT_CONFLICT",
    "ERASURE_IDENTITY_WORKFLOW_STATE_INVALID",
    "ERASURE_IDENTITY_DSR_CHANGED",
    "ERASURE_IDENTITY_HELP_CHANGED",
    "ERASURE_ADMIN_SESSION_REQUIRED",
    "ERASURE_ADMIN_REQUIRED",
    "ERASURE_ADMIN_SESSION_NOT_ACTIVE",
    "SERVICE_ROLE_REQUIRED",
  ].find((code) => message.includes(code));
  if (!databaseCode) {
    return new WorkflowError(409, "identity_link_failed");
  }
  const status = databaseCode === "ERASURE_IDENTITY_LINK_INPUT_INVALID"
    ? 400
    : (databaseCode === "ERASURE_IDENTITY_HELP_NOT_FOUND"
      ? 404
      : (databaseCode === "SERVICE_ROLE_REQUIRED" ||
          databaseCode.startsWith("ERASURE_ADMIN_")
        ? 403
        : 409));
  return new WorkflowError(status, databaseCode.toLowerCase());
}

async function linkVerifiedAccountErasureIdentity(
  adminClient: SupabaseClientLike,
  opts: {
    helpRequestId: string;
    accountEmail: string;
    actorId: string;
    actorSessionId: string;
    rawEvidence: unknown;
  },
) {
  const evidence = await buildEvidence(opts.rawEvidence, {
    kind: "identity",
    actorId: opts.actorId,
    allowedChannels: [
      "verified_email_challenge",
      "support_mailbox_reply",
      "identity_document_review",
      "in_person_verification",
    ],
    timestampField: "verified_at",
  });
  const contextualAttestationHash = await sha256Hex(
    [
      "kc:account-erasure-identity:v1",
      opts.helpRequestId,
      evidence.channel,
      evidence.reference_hash,
    ].join("|"),
  );
  const { data, error } = await adminClient.rpc(
    "kc_link_verified_help_request_to_account_erasure",
    {
      p_help_request_id: opts.helpRequestId,
      p_account_email: opts.accountEmail,
      p_actor_id: opts.actorId,
      p_actor_session_id: opts.actorSessionId,
      p_verification_channel: evidence.channel,
      p_attestation_sha256: contextualAttestationHash,
      p_verified_at: evidence.event_at,
    },
  );
  if (error) throw identityLinkRpcError(error);
  const result = asObject(Array.isArray(data) ? data[0] : data);
  if (
    result.ok !== true ||
    result.linked !== true ||
    !/^KC-DSR-[0-9]{8}-[A-F0-9]{16}$/.test(
      safeString(result.protocol, 64),
    )
  ) {
    throw new WorkflowError(409, "identity_link_result_invalid");
  }
  return result;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = safeString(value, 4000);
    if (text) return text;
  }
  return "";
}

function extractEmailFromText(value: unknown) {
  const text = String(value || "");
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return normalizeEmail(match?.[0] || "");
}

function extractUuidFromText(value: unknown) {
  const text = safeString(value, 4000);
  const match = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  return match?.[0]?.toLowerCase() || "";
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function safeString(value: unknown, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function escapeHtml(value: unknown) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function encodeMimeSubject(subject: string): string {
  let value = String(subject || "").normalize("NFKC");
  value = value
    .replace(/[—–]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, "...")
    .replace(/\u00a0/g, " ");
  value = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  value = value.replace(/[^\x20-\x7E]/g, "?");
  value = value.replace(/=\?/g, "= ?");
  return value;
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function loadLinkedDataSubjectRequest(
  adminClient: SupabaseClientLike,
  helpRequest: JsonObject,
  helpRequestId: string,
  userId: string | null,
) {
  const metadata = asObject(helpRequest.metadata);
  const metadataId = safeString(metadata.data_subject_request_id, 80);
  if (metadataId && !UUID_RE.test(metadataId)) {
    throw new WorkflowError(409, "data_subject_request_link_invalid");
  }

  let query = adminClient
    .from("data_subject_requests")
    .select(
      "id,protocol,user_id,help_request_id,subject_hash,request_kind,status,created_at,updated_at",
    );
  query = metadataId
    ? query.eq("id", metadataId)
    : query.eq("help_request_id", helpRequestId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (
    error &&
    !["42P01", "PGRST205", "PGRST116"].includes(String(error.code || ""))
  ) throw error;
  if (!data) {
    return {
      request: null,
      legacy: true,
      warning: metadataId
        ? "linked_data_subject_request_not_found"
        : "legacy_ticket_without_data_subject_request",
    };
  }
  if (
    safeString(data.request_kind, 80) !== CANONICAL_ERASURE_KIND ||
    safeString(data.help_request_id, 80) !== helpRequestId ||
    (
      userId &&
      (
        safeString(data.user_id, 80) !== userId ||
        safeString(helpRequest.user_id, 80) !== userId
      )
    )
  ) {
    throw new WorkflowError(409, "data_subject_request_link_mismatch");
  }
  return { request: data as JsonObject, legacy: false, warning: null };
}

function assessIdentityBinding(
  helpRequest: JsonObject,
  dataSubjectRequest: JsonObject | null,
  userId: string | null,
  existingWorkflow: JsonObject | null,
): IdentityAssurance {
  const helpUserId = extractUuidFromText(helpRequest.user_id) || null;
  const metadata = asObject(helpRequest.metadata);
  if (dataSubjectRequest) {
    const subjectUserId = extractUuidFromText(dataSubjectRequest.user_id) ||
      null;
    const dataSubjectRequestId = extractUuidFromText(dataSubjectRequest.id) ||
      null;
    const metadataRequestId =
      extractUuidFromText(metadata.data_subject_request_id) || null;
    const identitySource = safeString(metadata.identity_source, 80);
    if (
      !userId ||
      subjectUserId !== userId ||
      helpUserId !== userId ||
      !dataSubjectRequestId ||
      metadataRequestId !== dataSubjectRequestId ||
      !["authenticated_account", "admin_verified_anonymous_erasure"].includes(
        identitySource,
      )
    ) {
      throw new WorkflowError(409, "identity_target_mismatch", {
        identity_source: identitySource || null,
      });
    }
    if (identitySource === "admin_verified_anonymous_erasure") {
      const workflowMetadata = asObject(existingWorkflow?.metadata);
      const assurance = asObject(workflowMetadata.identity_assurance);
      const evidence = asObject(assurance.evidence);
      if (
        !existingWorkflow ||
        extractUuidFromText(existingWorkflow.help_request_id) !==
          extractUuidFromText(helpRequest.id) ||
        extractUuidFromText(existingWorkflow.data_subject_request_id) !==
          dataSubjectRequestId ||
        extractUuidFromText(existingWorkflow.user_id) !== userId ||
        assurance.verified !== true ||
        safeString(assurance.source, 120) !== identitySource ||
        extractUuidFromText(assurance.help_user_id) !== userId ||
        extractUuidFromText(assurance.target_user_id) !== userId ||
        safeString(evidence.channel, 80) !==
          safeString(metadata.identity_verification_channel, 80) ||
        safeString(evidence.reference_hash, 80) !==
          safeString(metadata.identity_attestation_hash, 80)
      ) {
        throw new WorkflowError(409, "identity_target_mismatch", {
          identity_source: identitySource,
          assurance: "canonical_workflow_proof_missing",
        });
      }
    }
    return {
      verified: true,
      source: identitySource === "authenticated_account"
        ? "linked_authenticated_data_subject_request"
        : "admin_verified_anonymous_erasure",
      help_user_id: helpUserId,
      target_user_id: userId,
    };
  }

  if (helpUserId) {
    if (!userId || helpUserId !== userId) {
      throw new WorkflowError(409, "identity_target_mismatch");
    }
    return {
      verified: true,
      source: "authenticated_help_request_owner_match",
      help_user_id: helpUserId,
      target_user_id: userId,
    };
  }

  return {
    verified: false,
    source: "legacy_anonymous_manual_verification_required",
    help_user_id: null,
    target_user_id: userId,
  };
}

function storedIdentityAssurance(
  request: JsonObject | null,
  context: {
    checkpoint?: JsonObject | null;
    helpRequest?: JsonObject | null;
    dataSubjectRequest?: JsonObject | null;
  } = {},
): IdentityAssurance | null {
  const value = asObject(asObject(request?.metadata).identity_assurance);
  if (value.verified !== true) return null;
  const source = safeString(value.source, 120);
  if (!STORED_IDENTITY_ASSURANCE_SOURCES.has(source)) return null;

  const checkpoint = asObject(context.checkpoint);
  const helpRequest = context.helpRequest || null;
  const dataSubjectRequest = context.dataSubjectRequest || null;
  const helpMetadata = asObject(helpRequest?.metadata);
  const storedHelpUserId = extractUuidFromText(value.help_user_id) || null;
  const storedTargetUserId = extractUuidFromText(value.target_user_id) || null;
  const checkpointTargetUserId = extractUuidFromText(checkpoint.targetUserId) ||
    extractUuidFromText(checkpoint.target_user_id) ||
    null;
  const workflowUserId = extractUuidFromText(request?.user_id) || null;
  const helpUserId = extractUuidFromText(helpRequest?.user_id) || null;
  const subjectUserId = extractUuidFromText(dataSubjectRequest?.user_id) ||
    null;
  const workflowHelpId = extractUuidFromText(request?.help_request_id) || null;
  const helpRequestId = extractUuidFromText(helpRequest?.id) || null;
  const workflowDataSubjectRequestId =
    extractUuidFromText(request?.data_subject_request_id) || null;
  const linkedDataSubjectRequestId =
    extractUuidFromText(dataSubjectRequest?.id) ||
    extractUuidFromText(helpMetadata.data_subject_request_id) ||
    null;

  if (
    workflowHelpId &&
    (!helpRequestId || workflowHelpId !== helpRequestId)
  ) return null;
  if (
    workflowDataSubjectRequestId &&
    (
      !linkedDataSubjectRequestId ||
      workflowDataSubjectRequestId !== linkedDataSubjectRequestId
    )
  ) return null;

  const knownTargetIds = [
    storedHelpUserId,
    storedTargetUserId,
    checkpointTargetUserId,
    workflowUserId,
    helpUserId,
    subjectUserId,
  ].filter((value): value is string => Boolean(value));
  if (knownTargetIds.some((value) => value !== knownTargetIds[0])) return null;
  if (
    checkpointTargetUserId &&
    storedTargetUserId &&
    checkpointTargetUserId !== storedTargetUserId
  ) return null;

  const evidence = asObject(value.evidence);
  if (
    ["admin_verified_anonymous_erasure", "legacy_manual_identity_verification"]
      .includes(source)
  ) {
    if (
      !IDENTITY_EVIDENCE_CHANNELS.has(safeString(evidence.channel, 80)) ||
      !/^[a-f0-9]{64}$/.test(
        safeString(evidence.reference_hash, 80).toLowerCase(),
      )
    ) return null;
  }

  const resolvedTargetUserId = knownTargetIds[0] || null;
  return {
    verified: true,
    source,
    help_user_id: storedHelpUserId || helpUserId || resolvedTargetUserId,
    target_user_id: storedTargetUserId || resolvedTargetUserId,
    evidence: Object.keys(evidence).length ? evidence : undefined,
  };
}

async function requireIdentityAssurance(
  base: IdentityAssurance,
  request: JsonObject,
  rawEvidence: unknown,
  actorId: string,
) {
  if (base.verified) return base;
  const stored = storedIdentityAssurance(request);
  if (stored?.verified && stored.target_user_id === base.target_user_id) {
    return stored;
  }

  const evidence = await buildEvidence(rawEvidence, {
    kind: "identity",
    actorId,
    allowedChannels: [
      "verified_email_challenge",
      "support_mailbox_reply",
      "identity_document_review",
      "in_person_verification",
    ],
    timestampField: "verified_at",
  });
  return {
    ...base,
    verified: true,
    source: "legacy_manual_identity_verification",
    evidence,
  } satisfies IdentityAssurance;
}

async function deriveSubjectHash(
  dataSubjectRequest: JsonObject | null,
  existingWorkflow: JsonObject | null,
) {
  const linkedHash = safeString(dataSubjectRequest?.subject_hash, 64)
    .toLowerCase();
  if (/^[a-f0-9]{64}$/.test(linkedHash)) return linkedHash;
  const existingHash = safeString(existingWorkflow?.email_hash, 64)
    .toLowerCase();
  const existingMetadata = asObject(existingWorkflow?.metadata);
  if (
    /^[a-f0-9]{64}$/.test(existingHash) &&
    (
      safeString(existingMetadata.subject_identifier_kind, 80) ===
        "opaque_random_v1" ||
      existingMetadata.auth_deleted === true ||
      safeString(existingWorkflow?.status, 80) !== "diagnosed"
    )
  ) {
    return existingHash;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function dataSubjectStatus(value: JsonObject | null) {
  return safeString(value?.status, 80);
}

async function transitionDataSubjectRequest(
  adminClient: SupabaseClientLike,
  request: JsonObject | null,
  newStatus: string,
  actorId: string,
  actorSessionId: string,
  eventType: string,
  publicMessage: string,
) {
  if (!request?.id) return null;
  const currentStatus = dataSubjectStatus(request);
  if (currentStatus === newStatus) return request;
  if (["cancelled", "completed", "expired"].includes(currentStatus)) {
    throw new WorkflowError(409, `data_subject_request_${currentStatus}`);
  }
  const { data, error } = await adminClient.rpc(
    "kc_transition_data_subject_request_for_admin_session",
    {
      p_request_id: request.id,
      p_expected_status: currentStatus,
      p_new_status: newStatus,
      p_actor_id: actorId,
      p_actor_session_id: actorSessionId,
      p_event_type: eventType,
      p_public_message: publicMessage,
    },
  );
  if (error) {
    const message = safeString(error.message || error, 300);
    const code = /could not find|schema cache|does not exist/i.test(message)
      ? "data_subject_transition_capability_missing"
      : "data_subject_status_conflict";
    throw new WorkflowError(409, code, { from: currentStatus, to: newStatus });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) {
    throw new WorkflowError(409, "data_subject_status_conflict", {
      from: currentStatus,
      to: newStatus,
    });
  }
  return row as JsonObject;
}

async function transitionDataSubjectThroughProcessing(
  adminClient: SupabaseClientLike,
  request: JsonObject | null,
  finalStatus:
    | "pending_confirmation"
    | "partial_failure"
    | "completed"
    | "cancelled"
    | "failed",
  actorId: string,
  actorSessionId: string,
  publicMessage: string,
) {
  if (!request) return null;
  let current = request;
  const status = dataSubjectStatus(current);
  if (status === finalStatus) return current;
  if (
    ["pending_confirmation", "partial_failure", "completed"].includes(
      finalStatus,
    ) &&
    ["received", "failed"].includes(status)
  ) {
    current = await transitionDataSubjectRequest(
      adminClient,
      current,
      "processing",
      actorId,
      actorSessionId,
      "status_changed",
      "Solicitacao em processamento.",
    ) || current;
  }
  return transitionDataSubjectRequest(
    adminClient,
    current,
    finalStatus,
    actorId,
    actorSessionId,
    finalStatus === "cancelled"
      ? "cancelled"
      : (finalStatus === "failed" ? "processing_error" : "status_changed"),
    publicMessage,
  );
}

async function getSmtpClient() {
  const user = getEnv("KC_SMTP_USER");
  const pass = getEnv("KC_SMTP_PASS");
  if (!user || !pass) throw new Error("missing_smtp_credentials");
  const port = Number(getEnv("KC_SMTP_PORT", String(DEFAULT_SMTP_PORT))) ||
    DEFAULT_SMTP_PORT;
  return new SMTPClient({
    connection: {
      hostname: getEnv("KC_SMTP_HOST", DEFAULT_SMTP_HOST),
      port,
      tls: port === 465,
      auth: { username: user, password: pass },
    },
  });
}

async function sendEmail(
  opts: { to: string; subject: string; html: string; text: string },
) {
  const client = await getSmtpClient();
  try {
    await client.send({
      from: `${getEnv("KC_SMTP_FROM_NAME", DEFAULT_FROM_NAME)} <${
        getEnv("KC_SMTP_FROM_EMAIL", DEFAULT_FROM_EMAIL)
      }>`,
      to: opts.to,
      subject: encodeMimeSubject(opts.subject),
      content: opts.text,
      html: opts.html,
      replyTo: getEnv("KC_ADMIN_NOTIFICATION_EMAIL", DEFAULT_FROM_EMAIL),
    });
  } finally {
    try {
      await client.close();
    } catch (_) { /* ignore */ }
  }
}

async function findAuthUserByEmail(
  adminClient: SupabaseClientLike,
  email: string,
) {
  const profileLookup = await adminClient
    .from("profiles")
    .select("id,email")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (!profileLookup.error && profileLookup.data?.id) {
    const byId = await adminClient.auth.admin.getUserById(
      String(profileLookup.data.id),
    );
    if (!byId.error && normalizeEmail(byId.data?.user?.email) === email) {
      return byId.data.user;
    }
  }

  const maxPages = Math.max(
    1,
    Math.min(100, Number(getEnv("KC_AUTH_USER_SCAN_MAX_PAGES", "50")) || 50),
  );
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (result.error) throw result.error;
    const users = Array.isArray(result.data?.users) ? result.data.users : [];
    const match = users.find((user: any) =>
      normalizeEmail(user?.email) === email
    );
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}

function isAuthUserNotFoundError(error: unknown) {
  const value = asObject(error);
  const status = Number(value.status || value.statusCode);
  const code = safeString(value.code, 120).toLowerCase();
  const message = safeString(value.message || error, 500).toLowerCase();
  return status === 404 ||
    ["user_not_found", "not_found"].includes(code) ||
    /user(?: with id)? not found|no user found/.test(message);
}

async function inspectAuthUserById(
  adminClient: SupabaseClientLike,
  userId: string,
): Promise<AuthUserInspection> {
  if (!UUID_RE.test(userId)) return { state: "unknown", user: null };
  try {
    const result = await adminClient.auth.admin.getUserById(userId);
    const user = result.data?.user;
    if (!result.error && user?.id && String(user.id) === userId) {
      return { state: "present", user: user as JsonObject };
    }
    if (result.error && isAuthUserNotFoundError(result.error)) {
      return { state: "absent", user: null };
    }
    return { state: "unknown", user: null };
  } catch (error) {
    return isAuthUserNotFoundError(error)
      ? { state: "absent", user: null }
      : { state: "unknown", user: null };
  }
}

async function safeCount(
  client: SupabaseClientLike,
  table: string,
  apply: (query: any) => any,
) {
  try {
    const query = apply(
      client.from(table).select("*", { count: "exact", head: true }),
    );
    const { count, error } = await query;
    if (error) return { count: 0, error: error.message || String(error) };
    return { count: Number(count) || 0, error: null };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function safeRows(
  client: SupabaseClientLike,
  table: string,
  columns: string,
  apply: (query: any) => any,
) {
  try {
    const { data, error } = await apply(client.from(table).select(columns));
    if (error) return { rows: [], error: error.message || String(error) };
    return { rows: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function safeRowsPaged(
  client: SupabaseClientLike,
  table: string,
  columns: string,
  apply: (query: any) => any,
  pageSize = 500,
) {
  const rows: any[] = [];
  try {
    for (let from = 0; from < 10000; from += pageSize) {
      const query = apply(client.from(table).select(columns)).range(
        from,
        from + pageSize - 1,
      );
      const { data, error } = await query;
      if (error) return { rows, error: error.message || String(error) };
      const page = Array.isArray(data) ? data : [];
      rows.push(...page);
      if (page.length < pageSize) return { rows, error: null };
    }
    return { rows, error: "row_scan_limit_exceeded" };
  } catch (error) {
    return {
      rows,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function safeRowsByIds(
  client: SupabaseClientLike,
  table: string,
  columns: string,
  ids: string[],
) {
  const rows: any[] = [];
  try {
    for (let from = 0; from < ids.length; from += 200) {
      const chunk = ids.slice(from, from + 200);
      const { data, error } = await client.from(table).select(columns).in(
        "id",
        chunk,
      );
      if (error) return { rows, error: error.message || String(error) };
      rows.push(...(Array.isArray(data) ? data : []));
    }
    return { rows, error: null };
  } catch (error) {
    return {
      rows,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readAuditIdentifierInventory(
  adminClient: SupabaseClientLike,
  userId: string,
) {
  const { data, error } = await adminClient.rpc(
    "kc_account_audit_identifier_inventory",
    {
      p_user_id: userId,
    },
  );
  if (error) {
    return {
      ok: false,
      audit_log_rows: 0,
      ad_campaign_audit_rows: 0,
      hero_banner_audit_rows: 0,
      identifiers_remaining: true,
      error: "audit_identifier_inventory_rpc_failed",
    };
  }
  const value = asObject(Array.isArray(data) ? data[0] : data);
  const result = {
    ok: value.ok === true,
    audit_log_rows: Number(value.audit_log_rows),
    ad_campaign_audit_rows: Number(value.ad_campaign_audit_rows),
    hero_banner_audit_rows: Number(value.hero_banner_audit_rows),
    identifiers_remaining: value.identifiers_remaining === true,
    error: null as string | null,
  };
  if (
    !result.ok ||
    typeof value.identifiers_remaining !== "boolean" ||
    !Number.isSafeInteger(result.audit_log_rows) ||
    result.audit_log_rows < 0 ||
    !Number.isSafeInteger(result.ad_campaign_audit_rows) ||
    result.ad_campaign_audit_rows < 0 ||
    !Number.isSafeInteger(result.hero_banner_audit_rows) ||
    result.hero_banner_audit_rows < 0
  ) {
    return {
      ...result,
      ok: false,
      error: "audit_identifier_inventory_invalid",
    };
  }
  return result;
}

async function redactAccountAuditIdentifiers(
  adminClient: SupabaseClientLike,
  userId: string,
) {
  const { data, error } = await adminClient.rpc(
    "kc_redact_account_audit_identifiers",
    {
      p_user_id: userId,
    },
  );
  if (error) throw new Error("audit_identifier_redaction_rpc_failed");
  const value = asObject(Array.isArray(data) ? data[0] : data);
  const summary = {
    audit_log_rows: Number(value.audit_log_rows),
    ad_campaign_audit_rows: Number(value.ad_campaign_audit_rows),
    hero_banner_audit_rows: Number(value.hero_banner_audit_rows),
    inventory_digest: safeString(value.inventory_digest, 64).toLowerCase(),
    identifiers_remaining: value.identifiers_remaining === true,
    events_preserved: value.events_preserved === true,
  };
  if (
    value.ok !== true ||
    !Number.isSafeInteger(summary.audit_log_rows) ||
    summary.audit_log_rows < 0 ||
    !Number.isSafeInteger(summary.ad_campaign_audit_rows) ||
    summary.ad_campaign_audit_rows < 0 ||
    !Number.isSafeInteger(summary.hero_banner_audit_rows) ||
    summary.hero_banner_audit_rows < 0 ||
    !/^[a-f0-9]{64}$/.test(summary.inventory_digest) ||
    summary.identifiers_remaining ||
    !summary.events_preserved
  ) {
    throw new Error("audit_identifier_redaction_postcondition_failed");
  }
  return summary;
}

async function readAuditEmailInventory(
  adminClient: SupabaseClientLike,
  email: string,
) {
  const { data, error } = await adminClient.rpc(
    "kc_account_audit_email_inventory",
    {
      p_email: email,
    },
  );
  if (error) {
    return {
      ok: false,
      audit_log_rows: 0,
      emails_remaining: true,
      error: "audit_email_inventory_rpc_failed",
    };
  }
  const value = asObject(Array.isArray(data) ? data[0] : data);
  const result = {
    ok: value.ok === true,
    audit_log_rows: Number(value.audit_log_rows),
    emails_remaining: value.emails_remaining === true,
    error: null as string | null,
  };
  if (
    !result.ok ||
    typeof value.emails_remaining !== "boolean" ||
    !Number.isSafeInteger(result.audit_log_rows) ||
    result.audit_log_rows < 0
  ) {
    return { ...result, ok: false, error: "audit_email_inventory_invalid" };
  }
  return result;
}

async function redactAccountAuditEmails(
  adminClient: SupabaseClientLike,
  email: string,
  subjectHash: string,
) {
  const { data, error } = await adminClient.rpc(
    "kc_redact_account_audit_emails",
    {
      p_email: email,
      p_subject_hash: subjectHash,
    },
  );
  if (error) throw new Error("audit_email_redaction_rpc_failed");
  const value = asObject(Array.isArray(data) ? data[0] : data);
  const summary = {
    audit_log_rows: Number(value.audit_log_rows),
    inventory_digest: safeString(value.inventory_digest, 64).toLowerCase(),
    emails_remaining: value.emails_remaining === true,
    events_preserved: value.events_preserved === true,
  };
  if (
    value.ok !== true ||
    !Number.isSafeInteger(summary.audit_log_rows) ||
    summary.audit_log_rows < 0 ||
    !/^[a-f0-9]{64}$/.test(summary.inventory_digest) ||
    summary.emails_remaining ||
    !summary.events_preserved
  ) {
    throw new Error("audit_email_redaction_postcondition_failed");
  }
  return summary;
}

async function readErasureCapabilities(adminClient: SupabaseClientLike) {
  const { data, error } = await adminClient.rpc(
    "kc_account_erasure_capabilities",
  );
  if (error) {
    return {
      ok: false,
      version: 0,
      chat_preserving_delete: false,
      cadu_set_null: false,
      unit_meta_set_null: false,
      community_content_preserving_delete: false,
      safety_records_preserving_delete: false,
      audit_identifier_redaction: false,
      audit_personal_email_redaction: false,
      help_request_redaction_postcondition: false,
      pre_erasure_copy_gate: false,
      export_artifact_erasure_purge: false,
      encrypted_completion_outbox: false,
      durable_subject_closure: false,
      renewable_operation_lease: false,
      admin_session_bound_claims: false,
      atomic_workflow_upsert: false,
      atomic_irreversible_dsr_transition: false,
      durable_auth_delete_checkpoint: false,
      write_quiescence: false,
      error: safeString(error.message || error, 300),
    };
  }
  const value = asObject(Array.isArray(data) ? data[0] : data);
  const capabilities = {
    version: Number(value.version) || 0,
    chat_preserving_delete: value.chat_preserving_delete === true,
    cadu_set_null: value.cadu_set_null === true,
    unit_meta_set_null: value.unit_meta_set_null === true,
    community_content_preserving_delete:
      value.community_content_preserving_delete === true,
    safety_records_preserving_delete:
      value.safety_records_preserving_delete === true,
    audit_identifier_redaction: value.audit_identifier_redaction === true,
    audit_personal_email_redaction:
      value.audit_personal_email_redaction === true,
    help_request_redaction_postcondition:
      value.help_request_redaction_postcondition === true,
    pre_erasure_copy_gate: value.pre_erasure_copy_gate === true,
    export_artifact_erasure_purge: value.export_artifact_erasure_purge === true,
    encrypted_completion_outbox: value.encrypted_completion_outbox === true,
    durable_subject_closure: value.durable_subject_closure === true,
    renewable_operation_lease: value.renewable_operation_lease === true,
    admin_session_bound_claims: value.admin_session_bound_claims === true,
    atomic_workflow_upsert: value.atomic_workflow_upsert === true,
    atomic_irreversible_dsr_transition:
      value.atomic_irreversible_dsr_transition === true,
    durable_auth_delete_checkpoint:
      value.durable_auth_delete_checkpoint === true,
    write_quiescence: value.write_quiescence === true,
  };
  return {
    ...capabilities,
    ok: capabilities.version >= 5 &&
      capabilities.chat_preserving_delete &&
      capabilities.cadu_set_null &&
      capabilities.unit_meta_set_null &&
      capabilities.community_content_preserving_delete &&
      capabilities.safety_records_preserving_delete &&
      capabilities.audit_identifier_redaction &&
      capabilities.audit_personal_email_redaction &&
      capabilities.help_request_redaction_postcondition &&
      capabilities.pre_erasure_copy_gate &&
      capabilities.export_artifact_erasure_purge &&
      capabilities.encrypted_completion_outbox &&
      capabilities.durable_subject_closure &&
      capabilities.renewable_operation_lease &&
      capabilities.admin_session_bound_claims &&
      capabilities.atomic_workflow_upsert &&
      capabilities.atomic_irreversible_dsr_transition &&
      capabilities.durable_auth_delete_checkpoint &&
      capabilities.write_quiescence,
    error: null,
  };
}

function extractStoragePath(value: unknown, bucket: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(profile-avatars|post-media|chat-media)\//.test(raw)) return raw;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = raw.indexOf(marker);
  if (idx >= 0) {
    return decodeURIComponent(raw.slice(idx + marker.length).split("?")[0]);
  }
  return "";
}

function uniq(values: string[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

async function getHelpRequest(
  adminClient: SupabaseClientLike,
  helpRequestId: string | null,
) {
  if (!helpRequestId) return null;
  const { data, error } = await adminClient
    .from("help_requests")
    .select("*")
    .eq("id", helpRequestId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getWorkflowByHelpRequest(
  adminClient: SupabaseClientLike,
  helpRequestId: string | null,
) {
  if (!helpRequestId) return null;
  const { data, error } = await adminClient
    .from("account_erasure_requests")
    .select("*")
    .eq("help_request_id", helpRequestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

async function findLatestHelpRequestByEmail(
  adminClient: SupabaseClientLike,
  email: string,
) {
  const cleanEmail = normalizeEmail(email);
  if (!EMAIL_RE.test(cleanEmail)) return null;

  const direct = await adminClient
    .from("help_requests")
    .select("*")
    .eq("contact_email", cleanEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (direct.error && direct.error.code !== "PGRST116") throw direct.error;
  if (direct.data) return direct.data;

  const metadata = await adminClient
    .from("help_requests")
    .select("*")
    .eq("metadata->>account_email", cleanEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (metadata.error && metadata.error.code !== "PGRST116") {
    throw metadata.error;
  }
  if (metadata.data) return metadata.data;

  return null;
}

function resolveTargetEmail(body: JsonObject, helpRequest: JsonObject | null) {
  const metadata = asObject(helpRequest?.metadata);
  const requestText = [
    helpRequest?.contact_email,
    helpRequest?.message,
    helpRequest?.subject,
    metadata.account_email,
    metadata.email,
  ].join(" ");
  const trustedCandidates = [
    metadata.account_email,
    helpRequest?.contact_email,
    metadata.email,
    extractEmailFromText(requestText),
  ].map(normalizeEmail);
  const trusted =
    trustedCandidates.find((candidate) => EMAIL_RE.test(candidate)) || "";
  const submittedCandidates = [
    body.target_email,
    body.targetEmail,
    asObject(body.target).email,
  ].map(normalizeEmail);
  const submitted =
    submittedCandidates.find((candidate) => EMAIL_RE.test(candidate)) || "";
  if (trusted && submitted && trusted !== submitted) {
    throw new WorkflowError(409, "target_email_mismatch");
  }
  return trusted || submitted;
}

function buildConfirmationEmail(email: string) {
  const subject = "Confirmação de solicitação de remoção de conta - KinoCampus";
  const phrase = "CONFIRMO A EXCLUSÃO DA MINHA CONTA KINOCAMPUS";
  const baseUrl = getEnv("KC_APP_BASE_URL", DEFAULT_APP_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const text = [
    "Olá.",
    "",
    `Recebemos sua solicitação de remoção da conta associada ao e-mail ${email}, com fundamento nos direitos previstos na LGPD.`,
    "",
    "Por segurança, antes de executar a eliminação irreversível dos dados cadastrais, precisamos confirmar que a solicitação partiu do titular da conta. Enquanto isso, iniciaremos o tratamento interno do pedido e poderemos restringir a visibilidade de dados vinculados à conta quando aplicável.",
    "",
    "Para confirmar a exclusão definitiva, responda este e-mail com a frase:",
    "",
    phrase,
    "",
    "Após a confirmação, a conta será removida e os dados cadastrais serão eliminados ou anonimizados conforme a Política de Privacidade do KinoCampus e as hipóteses legais de retenção mínima para segurança, auditoria e exercício regular de direitos.",
    "",
    "Caso tenha dúvidas ou queira algum esclarecimento adicional, responda este e-mail ou entre em contato por contato@kinocampus.com.br.",
    "",
    "Agradecemos por ter usado o KinoCampus. Caso queira voltar futuramente, será possível criar uma nova conta na plataforma.",
    "",
    "Atenciosamente,",
    "KinoCampus",
    baseUrl,
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmação de remoção de conta - KinoCampus</title>
</head>
<body style="margin:0;padding:0;background:#f7f8fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f8fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #eceff5;">
          <tr>
            <td style="padding:28px 32px;background:linear-gradient(135deg,#fff4ec,#ffffff);border-bottom:1px solid #eceff5;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="width:48px;height:48px;border-radius:14px;background:#ff7c00;color:#ffffff;text-align:center;font-size:22px;font-weight:800;line-height:48px;">K</td>
                  <td style="padding-left:14px;">
                    <div style="font-size:22px;font-weight:800;color:#111827;line-height:1;">KinoCampus</div>
                    <div style="margin-top:6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;">Comunidade UFG</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <div style="font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#ff7c00;">Privacidade e LGPD</div>
              <h1 style="margin:12px 0 12px;font-size:28px;line-height:1.18;color:#111827;">Confirme a remoção da sua conta</h1>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#4b5563;">Olá. Recebemos sua solicitação de remoção da conta associada ao e-mail <strong style="color:#111827;">${
    escapeHtml(email)
  }</strong>, com fundamento nos direitos previstos na LGPD.</p>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#4b5563;">Por segurança, antes de executar a eliminação irreversível dos dados cadastrais, precisamos confirmar que a solicitação partiu do titular da conta.</p>
              <div style="margin:24px 0;padding:18px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
                <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#7c2d12;">Para confirmar a exclusão definitiva, responda este e-mail com a frase abaixo:</p>
                <div style="padding:14px 16px;border-radius:14px;background:#111827;color:#ffffff;font-size:14px;font-weight:800;letter-spacing:.02em;line-height:1.5;">${
    escapeHtml(phrase)
  }</div>
              </div>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4b5563;">Após a confirmação, a conta será removida e os dados cadastrais serão eliminados ou anonimizados conforme a Política de Privacidade do KinoCampus e as hipóteses legais de retenção mínima para segurança, auditoria e exercício regular de direitos.</p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#4b5563;">Enquanto a confirmação não é recebida, iniciaremos o tratamento interno do pedido e poderemos restringir a visibilidade de dados vinculados à conta quando aplicável.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;">
                <tr><td><a href="mailto:contato@kinocampus.com.br" style="display:inline-block;padding:13px 20px;border-radius:999px;background:#ff7c00;color:#ffffff;text-decoration:none;font-weight:800;">Falar com o KinoCampus</a></td></tr>
              </table>
              <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">Agradecemos por ter usado o KinoCampus. Caso queira voltar futuramente, será possível criar uma nova conta na plataforma.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px;background:#f9fafb;border-top:1px solid #eceff5;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">Equipe KinoCampus<br /><a href="${
    escapeHtml(baseUrl)
  }" style="color:#ff7c00;text-decoration:none;">${escapeHtml(baseUrl)}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html, phrase };
}

function buildCompletionEmail(_requestId: string, receipt: JsonObject) {
  const subject = "Conclusão da solicitação de exclusão - KinoCampus";
  const baseUrl = getEnv("KC_APP_BASE_URL", DEFAULT_APP_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const completedAt =
    safeString(receipt.erased_at || receipt.completed_at, 80) ||
    new Date().toISOString();
  const protocolCandidate = safeString(receipt.protocol, 120).toUpperCase();
  const protocol = /^KC-DSR-[0-9]{8}-[A-F0-9]{16}$/.test(protocolCandidate)
    ? protocolCandidate
    : "";
  const providerEvidence = asObject(receipt.provider_evidence);
  const outcomes = asObject(providerEvidence.outcomes);
  const retentions = asObject(providerEvidence.retentions);
  const outcomeLabels: Record<string, string> = {
    deleted: "eliminado",
    retention_documented: "retenção mínima documentada",
    not_applicable: "não aplicável",
  };
  const providerLines = Object.entries(outcomes).map(
    ([provider, outcomeValue]) => {
      const outcome = safeString(outcomeValue, 80);
      const retention = asObject(retentions[provider]);
      const details = outcome === "retention_documented"
        ? `; base: ${safeString(retention.legal_basis, 280)}; revisão: ${
          safeString(retention.review_at, 80)
        }`
        : "";
      return `- ${provider}: ${outcomeLabels[outcome] || outcome}${details}`;
    },
  );
  const text = [
    "Olá.",
    "",
    "Concluímos o processamento da sua solicitação de exclusão de conta no KinoCampus.",
    protocol
      ? `Protocolo: ${protocol}`
      : "Referência pública: indisponível neste comprovante legado.",
    `Conclusão: ${completedAt}`,
    "",
    "O cadastro e os dados elegíveis foram eliminados; conteúdos compartilhados e registros de segurança foram desidentificados quando a preservação era necessária.",
    ...(providerLines.length
      ? ["", "Resultado por operador:", ...providerLines]
      : ["", "Não houve operador externo pendente de revisão."]),
    "",
    "Retenções mínimas somente permanecem quando documentadas com base e data de revisão, inclusive para segurança, auditoria, backups com expiração e exercício regular de direitos.",
    "",
    "Este comprovante não contém seu e-mail, conteúdo de mensagens, tokens ou outros dados pessoais brutos.",
    "",
    "Em caso de dúvida, escreva para contato@kinocampus.com.br.",
    "",
    "Atenciosamente,",
    "KinoCampus",
    baseUrl,
  ].join("\n");
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Conclusão da solicitação de exclusão</title></head>
<body style="margin:0;padding:24px;background:#f7f8fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f2937;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eceff5;border-radius:20px;padding:30px;">
    <div style="font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ff7c00;">Privacidade e LGPD</div>
    <h1 style="font-size:26px;line-height:1.2;color:#111827;">Solicitação concluída</h1>
    <p style="font-size:15px;line-height:1.7;color:#4b5563;">Concluímos o processamento da sua solicitação de exclusão de conta no KinoCampus.</p>
    <div style="padding:16px;border-radius:14px;background:#f9fafb;border:1px solid #e5e7eb;">
      <p style="margin:0 0 8px;"><strong>${
    protocol ? "Protocolo" : "Referência pública"
  }:</strong> ${
    protocol ? escapeHtml(protocol) : "indisponível neste comprovante legado"
  }</p>
      <p style="margin:0;"><strong>Conclusão:</strong> ${
    escapeHtml(completedAt)
  }</p>
    </div>
    <p style="font-size:14px;line-height:1.7;color:#4b5563;">O cadastro e os dados elegíveis foram eliminados; conteúdos compartilhados e registros de segurança foram desidentificados quando a preservação era necessária.</p>
    ${
    providerLines.length
      ? `<ul style="font-size:13px;line-height:1.7;color:#4b5563;">${
        providerLines.map((line) =>
          `<li>${escapeHtml(line.replace(/^-\s*/, ""))}</li>`
        ).join("")
      }</ul>`
      : ""
  }
    <p style="font-size:14px;line-height:1.7;color:#4b5563;">Retenções mínimas somente permanecem quando documentadas com base e data de revisão.</p>
    <p style="font-size:13px;line-height:1.7;color:#6b7280;">Este comprovante não contém seu e-mail, conteúdo de mensagens, tokens ou outros dados pessoais brutos.</p>
    <p style="font-size:13px;color:#6b7280;">Equipe KinoCampus · <a href="${
    escapeHtml(baseUrl)
  }" style="color:#ff7c00;">${escapeHtml(baseUrl)}</a></p>
  </div>
</body></html>`;
  return { subject, text, html };
}

function buildExternalProcessorMatrix() {
  const erasureTreatmentOverrides: Record<string, string> = {
    supabase_db_auth_storage: "automated_core_erasure",
    hostinger_smtp_mailbox: "pre_completion_and_delivery_retention_review",
    cadu_openclaw_hostinger_vps:
      "upstream_admin_identifier_and_review_audit_erasure_or_retention_review",
  };
  return buildDataProcessorMatrix().map((entry) => ({
    provider: entry.processor,
    treatment: erasureTreatmentOverrides[entry.processor] || entry.treatment,
    status: entry.status,
  }));
}

async function buildProviderEvidence(
  raw: unknown,
  actorId: string,
  tasks: JsonObject[],
) {
  const value = asObject(raw);
  const evidence = await buildEvidence(value, {
    kind: "provider",
    actorId,
    allowedChannels: ["admin_provider_review"],
    timestampField: "completed_at",
  });
  const outcomes = asObject(value.outcomes);
  const retentions = asObject(value.retentions);
  const allowedOutcomes = new Set([
    "deleted",
    "retention_documented",
    "not_applicable",
  ]);
  const requiredProviders = tasks
    .filter((task) => safeString(task.status, 80) === "manual_policy_follow_up")
    .map((task) => safeString(task.provider, 120))
    .filter(Boolean);
  for (const provider of requiredProviders) {
    const outcome = safeString(outcomes[provider], 80);
    if (!allowedOutcomes.has(outcome)) {
      throw new WorkflowError(400, "provider_outcomes_incomplete", {
        provider,
      });
    }
    if (
      provider === "hostinger_smtp_mailbox" &&
      outcome !== "retention_documented"
    ) {
      throw new WorkflowError(400, "notification_provider_retention_required", {
        provider,
      });
    }
    if (outcome === "retention_documented") {
      const retention = asObject(retentions[provider]);
      const legalBasis = safeString(retention.legal_basis, 280);
      const reviewAtRaw = safeString(retention.review_at, 80);
      const reviewAt = Date.parse(reviewAtRaw);
      if (legalBasis.length < 8) {
        throw new WorkflowError(400, "provider_retention_basis_required", {
          provider,
        });
      }
      if (!Number.isFinite(reviewAt)) {
        throw new WorkflowError(400, "provider_retention_review_at_required", {
          provider,
        });
      }
      if (reviewAt <= Date.now()) {
        throw new WorkflowError(
          400,
          "provider_retention_review_must_be_future",
          { provider },
        );
      }
    }
  }
  const normalizedRetentions = Object.fromEntries(
    requiredProviders
      .filter((provider) =>
        safeString(outcomes[provider], 80) === "retention_documented"
      )
      .map((provider) => {
        const retention = asObject(retentions[provider]);
        return [
          provider,
          {
            legal_basis: safeString(retention.legal_basis, 280),
            review_at: new Date(Date.parse(safeString(retention.review_at, 80)))
              .toISOString(),
            processing_scope: provider === "hostinger_smtp_mailbox"
              ? "pre_completion_and_delivery"
              : "operator_retention",
          },
        ];
      }),
  );
  return {
    ...evidence,
    outcomes: Object.fromEntries(
      requiredProviders.map((
        provider,
      ) => [provider, safeString(outcomes[provider], 80)]),
    ),
    retentions: normalizedRetentions,
  };
}

async function upsertWorkflow(
  adminClient: SupabaseClientLike,
  opts: {
    helpRequestId: string | null;
    userId: string | null;
    email: string;
    emailHash: string;
    dataSubjectRequestId?: string | null;
    adminUserId: string;
    adminSessionId: string;
    counts?: JsonObject;
    status?: string;
    metadata?: JsonObject;
  },
) {
  if (!opts.helpRequestId) {
    throw new WorkflowError(400, "erasure_help_request_required");
  }
  const domain = opts.email.includes("@")
    ? opts.email.split("@").pop() || null
    : null;
  if (opts.status && opts.status !== "diagnosed") {
    throw new WorkflowError(409, "workflow_upsert_status_invalid");
  }
  const { data, error } = await adminClient.rpc(
    "kc_upsert_account_erasure_workflow",
    {
      p_help_request_id: opts.helpRequestId,
      p_data_subject_request_id: opts.dataSubjectRequestId || null,
      p_user_id: opts.userId,
      p_email_hash: opts.emailHash,
      p_target_email_domain: domain,
      p_actor_id: opts.adminUserId,
      p_actor_session_id: opts.adminSessionId,
      p_counts: opts.counts || {},
      p_metadata: opts.metadata || {},
    },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new WorkflowError(409, "workflow_upsert_invalid");
  return row as JsonObject;
}

async function claimWorkflowAction(
  adminClient: SupabaseClientLike,
  request: JsonObject,
  action: string,
  adminUserId: string,
  adminSessionId: string,
  dataSubjectRequest: JsonObject | null = null,
): Promise<WorkflowClaim> {
  const expectedVersion = Number(request.operation_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new WorkflowError(409, "workflow_claim_capability_missing");
  }
  const claimRpc = action === "erase_confirmed"
    ? "kc_claim_account_erasure_irreversible_operation_v2"
    : "kc_claim_account_erasure_operation";
  const claimArgs: JsonObject = {
    p_request_id: request.id,
    p_expected_status: request.status,
    p_expected_version: expectedVersion,
    p_actor_id: adminUserId,
    p_actor_session_id: adminSessionId,
    p_ttl_seconds: ACTION_CLAIM_TTL_SECONDS,
  };
  if (action === "erase_confirmed") {
    claimArgs.p_data_subject_request_id = dataSubjectRequest?.id || null;
    claimArgs.p_expected_data_subject_status = dataSubjectRequest
      ? dataSubjectStatus(dataSubjectRequest)
      : null;
  }
  const { data, error } = await adminClient.rpc(claimRpc, claimArgs);
  if (error) {
    const message = safeString(error.message || error, 300);
    if (/already.claimed|55P03/i.test(message)) {
      throw new WorkflowError(409, "workflow_action_in_progress", { action });
    }
    if (/status.conflict|version.conflict|40001/i.test(message)) {
      throw new WorkflowError(409, "workflow_state_conflict", { action });
    }
    const copyGateCode = message.match(
      /ERASURE_COPY_(?:GUIDANCE_DECISION_REQUIRED|PREFERENCE_INVALID|REQUEST_LINK_INVALID|REQUEST_NOT_LINKED|NOT_PROVEN_DELIVERED|GATE_FAILED)/i,
    )?.[0]?.toLowerCase();
    if (copyGateCode) {
      throw new WorkflowError(409, copyGateCode, { action });
    }
    if (/ATOMIC_DSR_(?:STATUS_CONFLICT|TERMINAL)/i.test(message)) {
      throw new WorkflowError(
        409,
        "data_subject_request_cancelled_or_changed",
        {
          action,
        },
      );
    }
    if (/ATOMIC_DSR_(?:LINK|SUBJECT)_MISMATCH/i.test(message)) {
      throw new WorkflowError(409, "data_subject_request_link_mismatch", {
        action,
      });
    }
    if (/could not find|schema cache|does not exist/i.test(message)) {
      throw new WorkflowError(409, "workflow_claim_capability_missing");
    }
    throw error;
  }
  const claimed = Array.isArray(data) ? data[0] : data;
  const token = safeString(
    claimed?.out_claim_token || claimed?.operation_claim_token,
    80,
  );
  const version = Number(
    claimed?.out_operation_version || claimed?.operation_version,
  );
  const expiresAt = safeString(
    claimed?.out_claim_expires_at || claimed?.operation_claim_expires_at,
    80,
  );
  const dataSubjectRequestStatus = safeString(
    claimed?.out_data_subject_request_status,
    80,
  ) || null;
  if (
    !UUID_RE.test(token) || !Number.isInteger(version) ||
    version <= expectedVersion
  ) {
    throw new WorkflowError(409, "workflow_claim_invalid");
  }
  const result = await adminClient
    .from("account_erasure_requests")
    .select("*")
    .eq("id", request.id)
    .eq("operation_claim_token", token)
    .eq("operation_version", version)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new WorkflowError(409, "workflow_state_conflict", { action });
  }
  return {
    request: result.data as JsonObject,
    token,
    version,
    expiresAt,
    actorId: adminUserId,
    sessionId: adminSessionId,
    dataSubjectRequestStatus,
  };
}

function authDeleteCheckpointFromWorkflow(request: JsonObject | null) {
  const state = safeString(request?.auth_delete_state, 80);
  const intentToken = safeString(request?.auth_delete_intent_token, 80);
  const targetUserId = safeString(request?.auth_delete_target_user_id, 80);
  const intentAt = safeString(request?.auth_delete_intent_at, 80);
  if (
    !["intent_recorded", "confirmed_absent"].includes(state) ||
    !UUID_RE.test(intentToken) ||
    !UUID_RE.test(targetUserId) ||
    !Number.isFinite(Date.parse(intentAt))
  ) return null;
  return { state, intentToken, targetUserId, intentAt };
}

async function readAuthDeleteRecoveryStatus(
  adminClient: SupabaseClientLike,
  workflowId: string,
) {
  const { data, error } = await adminClient.rpc(
    "kc_account_erasure_auth_delete_recovery_status",
    { p_workflow_id: workflowId },
  );
  if (error) {
    const message = safeString(error.message || error, 300);
    if (/could not find|schema cache|does not exist/i.test(message)) {
      throw new WorkflowError(409, "auth_delete_recovery_capability_missing");
    }
    throw error;
  }
  const value = asObject(Array.isArray(data) ? data[0] : data);
  return {
    ok: value.ok === true,
    error: safeString(value.error, 160) || null,
    checkpointState: safeString(value.checkpoint_state, 80),
    intentToken: safeString(value.intent_token, 80),
    targetUserId: safeString(value.target_user_id, 80),
    identityVerified: value.identity_verified === true,
    closureVerified: value.closure_verified === true,
    coreInventoryReady: value.core_inventory_ready === true,
    authUserPresent: value.auth_user_present === true,
  };
}

async function checkpointAuthDeleteIntent(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  targetUserId: string,
  coreInventory: JsonObject,
  checkpoint: JsonObject,
) {
  await renewWorkflowClaim(adminClient, claim);
  const { data, error } = await adminClient.rpc(
    "kc_checkpoint_account_erasure_auth_delete_intent",
    {
      p_workflow_id: claim.request.id,
      p_operation_claim_token: claim.token,
      p_expected_version: claim.version,
      p_actor_id: claim.actorId,
      p_actor_session_id: claim.sessionId,
      p_target_user_id: targetUserId,
      p_core_inventory: coreInventory,
      p_checkpoint: checkpoint,
    },
  );
  if (error) {
    const message = safeString(error.message || error, 300);
    if (/could not find|schema cache|does not exist/i.test(message)) {
      throw new WorkflowError(409, "auth_delete_checkpoint_capability_missing");
    }
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as JsonObject | null;
  const stored = authDeleteCheckpointFromWorkflow(row);
  if (!row?.id || !stored || stored.targetUserId !== targetUserId) {
    throw new WorkflowError(409, "auth_delete_checkpoint_invalid");
  }
  claim.request = row;
  return row;
}

async function confirmAuthDeleteAbsence(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
) {
  const checkpoint = authDeleteCheckpointFromWorkflow(claim.request);
  if (!checkpoint) {
    throw new WorkflowError(409, "auth_delete_checkpoint_missing");
  }
  const { data, error } = await adminClient.rpc(
    "kc_confirm_account_erasure_auth_deleted",
    {
      p_workflow_id: claim.request.id,
      p_operation_claim_token: claim.token,
      p_expected_version: claim.version,
      p_actor_id: claim.actorId,
      p_actor_session_id: claim.sessionId,
      p_intent_token: checkpoint.intentToken,
    },
  );
  if (error) {
    const message = safeString(error.message || error, 300);
    if (/AUTH_USER_STILL_PRESENT/i.test(message)) {
      throw new WorkflowError(409, "auth_user_still_present");
    }
    if (/could not find|schema cache|does not exist/i.test(message)) {
      throw new WorkflowError(409, "auth_delete_checkpoint_capability_missing");
    }
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as JsonObject | null;
  if (
    !row?.id ||
    safeString(row.auth_delete_state, 80) !== "confirmed_absent" ||
    asObject(row.metadata).auth_deleted !== true
  ) {
    throw new WorkflowError(409, "auth_delete_confirmation_invalid");
  }
  claim.request = row;
  return row;
}

async function renewWorkflowClaim(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
) {
  const { data, error } = await adminClient.rpc(
    "kc_renew_account_erasure_operation",
    {
      p_request_id: claim.request.id,
      p_operation_claim_token: claim.token,
      p_expected_version: claim.version,
      p_actor_id: claim.actorId,
      p_actor_session_id: claim.sessionId,
      p_ttl_seconds: ACTION_CLAIM_TTL_SECONDS,
    },
  );
  if (error) {
    const message = safeString(error.message || error, 300);
    if (/ADMIN_SESSION_NOT_ACTIVE|SESSION_NOT_ACTIVE|42501/i.test(message)) {
      throw new WorkflowError(401, "session_not_active");
    }
    throw new WorkflowError(409, "workflow_claim_lost");
  }
  const renewed = Array.isArray(data) ? data[0] : data;
  const token = safeString(
    renewed?.out_claim_token || renewed?.operation_claim_token,
    80,
  );
  const version = Number(
    renewed?.out_operation_version || renewed?.operation_version,
  );
  const expiresAt = safeString(
    renewed?.out_claim_expires_at || renewed?.operation_claim_expires_at,
    80,
  );
  if (
    token !== claim.token ||
    version !== claim.version ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now()
  ) {
    throw new WorkflowError(409, "workflow_claim_lost");
  }
  claim.expiresAt = expiresAt;
  return claim;
}

async function readPreErasureCopyGate(
  adminClient: SupabaseClientLike,
  workflowId: string,
) {
  const { data, error } = await adminClient.rpc(
    "kc_account_erasure_copy_gate_status",
    {
      p_workflow_id: workflowId,
    },
  );
  if (error) {
    throw new WorkflowError(409, "erasure_copy_gate_capability_missing");
  }
  const value = asObject(Array.isArray(data) ? data[0] : data);
  if (typeof value.ok !== "boolean") {
    throw new WorkflowError(409, "erasure_copy_gate_response_invalid");
  }
  return value;
}

async function recordPreErasureCopyDecision(
  adminClient: SupabaseClientLike,
  workflowId: string,
  adminUserId: string,
  adminSessionId: string,
  rawDecision: unknown,
) {
  const value = asObject(rawDecision);
  if (!Object.keys(value).length) return null;
  const decision = safeString(value.decision, 80).toLowerCase();
  if (!["request_copy_first", "no_copy_needed"].includes(decision)) {
    throw new WorkflowError(400, "copy_gate_decision_invalid");
  }
  const evidence = await buildEvidence(value, {
    kind: "copy_gate",
    actorId: adminUserId,
    allowedChannels: ["admin_guidance_review"],
    timestampField: "decided_at",
  });
  const { data, error } = await adminClient.rpc(
    "kc_record_account_erasure_copy_decision",
    {
      p_workflow_id: workflowId,
      p_actor_id: adminUserId,
      p_actor_session_id: adminSessionId,
      p_decision: decision,
      p_reference_hash: evidence.reference_hash,
      p_decided_at: evidence.event_at,
      p_attested: true,
    },
  );
  if (error) {
    const message = safeString(error.message || error, 300);
    if (/NOT_APPLICABLE/i.test(message)) {
      throw new WorkflowError(409, "copy_gate_decision_not_applicable");
    }
    throw new WorkflowError(409, "copy_gate_decision_record_failed");
  }
  const result = asObject(Array.isArray(data) ? data[0] : data);
  if (result.decision_recorded !== true) {
    throw new WorkflowError(409, "copy_gate_decision_record_invalid");
  }
  return result;
}

function clearLegacyActionClaim(metadata: JsonObject) {
  const next = { ...metadata };
  delete next.action_claim;
  return next;
}

async function updateClaimedWorkflow(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  payload: JsonObject,
  release = false,
) {
  await renewWorkflowClaim(adminClient, claim);
  const updatePayload: JsonObject = { ...payload };
  if (updatePayload.metadata) {
    updatePayload.metadata = clearLegacyActionClaim(
      asObject(updatePayload.metadata),
    );
  }
  if (release) {
    updatePayload.operation_claim_token = null;
    updatePayload.operation_claimed_at = null;
    updatePayload.operation_claim_expires_at = null;
    updatePayload.operation_claimed_by = null;
    updatePayload.operation_claim_session_id = null;
  }
  const { data, error } = await adminClient
    .from("account_erasure_requests")
    .update(updatePayload)
    .eq("id", claim.request.id)
    .eq("operation_claim_token", claim.token)
    .eq("operation_version", claim.version)
    .eq("operation_claimed_by", claim.actorId)
    .eq("operation_claim_session_id", claim.sessionId)
    .gt("operation_claim_expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new WorkflowError(409, "workflow_claim_lost");
  claim.request = data as JsonObject;
  return claim.request;
}

async function releaseWorkflowClaim(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  context: string,
) {
  try {
    await updateClaimedWorkflow(adminClient, claim, {}, true);
  } catch (_error) {
    console.error("[kc-account-erasure] claim_release_failed", context);
  }
}

async function reconcileAuthDeleteAbsence(
  adminClient: SupabaseClientLike,
  request: JsonObject,
  adminUserId: string,
  adminSessionId: string,
) {
  const claim = await claimWorkflowAction(
    adminClient,
    request,
    "recover_auth_delete",
    adminUserId,
    adminSessionId,
  );
  await confirmAuthDeleteAbsence(adminClient, claim);
  return updateClaimedWorkflow(
    adminClient,
    claim,
    { metadata: asObject(claim.request.metadata) },
    true,
  );
}

async function completionOutboxStatus(
  adminClient: SupabaseClientLike,
  workflowId: string,
) {
  const { data, error } = await adminClient.rpc(
    "kc_account_erasure_completion_outbox_status",
    {
      p_workflow_id: workflowId,
    },
  );
  if (error) throw new Error("completion_outbox_status_failed");
  const value = asObject(Array.isArray(data) ? data[0] : data);
  const status = safeString(value.status, 40);
  if (
    value.ok !== true || !["missing", "staged", "accepted"].includes(status)
  ) {
    throw new Error("completion_outbox_status_invalid");
  }
  return {
    status,
    expiresAt: safeString(value.expires_at, 80) || null,
    keyVersion: safeString(value.key_version, 64) || null,
  };
}

async function ensureCompletionOutbox(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  email: string,
  dataSubjectRequestId: string | null,
) {
  await renewWorkflowClaim(adminClient, claim);
  const current = await completionOutboxStatus(
    adminClient,
    String(claim.request.id),
  );
  if (current.status !== "missing") {
    if (current.keyVersion !== completionOutboxKeyVersion()) {
      throw new Error("completion_outbox_key_version_unavailable");
    }
    return current;
  }

  const encrypted = await encryptCompletionRecipient(
    email,
    String(claim.request.id),
    dataSubjectRequestId,
  );
  const configuredTtl = Number(
    getEnv(
      "KC_ERASURE_OUTBOX_TTL_SECONDS",
      String(DEFAULT_COMPLETION_OUTBOX_TTL_SECONDS),
    ),
  );
  const ttlSeconds = Math.max(
    900,
    Math.min(
      86400,
      Number.isFinite(configuredTtl)
        ? Math.trunc(configuredTtl)
        : DEFAULT_COMPLETION_OUTBOX_TTL_SECONDS,
    ),
  );
  await renewWorkflowClaim(adminClient, claim);
  const { data, error } = await adminClient.rpc(
    "kc_stage_account_erasure_completion_outbox",
    {
      p_workflow_id: claim.request.id,
      p_operation_claim_token: claim.token,
      p_data_subject_request_id: dataSubjectRequestId,
      p_recipient_ciphertext: encrypted.ciphertext,
      p_recipient_nonce: encrypted.nonce,
      p_key_version: encrypted.keyVersion,
      p_ttl_seconds: ttlSeconds,
    },
  );
  if (error) throw new Error("completion_outbox_stage_failed");
  const value = asObject(Array.isArray(data) ? data[0] : data);
  if (
    value.ok !== true ||
    !["staged", "accepted"].includes(safeString(value.status, 40)) ||
    safeString(value.key_version, 64) !== encrypted.keyVersion
  ) {
    throw new Error("completion_outbox_stage_invalid");
  }
  return {
    status: safeString(value.status, 40),
    expiresAt: safeString(value.expires_at, 80) || null,
    keyVersion: safeString(value.key_version, 64),
  };
}

async function deliverCompletionEmailFromOutbox(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  dataSubjectRequestId: string | null,
  draft: { subject: string; html: string; text: string },
) {
  await renewWorkflowClaim(adminClient, claim);
  const current = await completionOutboxStatus(
    adminClient,
    String(claim.request.id),
  );
  if (current.status === "missing") {
    throw new Error("completion_outbox_expired_or_missing");
  }
  await renewWorkflowClaim(adminClient, claim);
  const { data, error } = await adminClient.rpc(
    "kc_claim_account_erasure_completion_outbox",
    {
      p_workflow_id: claim.request.id,
      p_operation_claim_token: claim.token,
    },
  );
  if (error) {
    const message = safeString(error.message || error, 300);
    if (/DELIVERY_ALREADY_CLAIMED|55P03/i.test(message)) {
      throw new Error("completion_outbox_delivery_in_progress");
    }
    if (/OUTBOX_NOT_FOUND|P0002/i.test(message)) {
      throw new Error("completion_outbox_expired_or_missing");
    }
    throw new Error("completion_outbox_claim_failed");
  }
  const value = asObject(Array.isArray(data) ? data[0] : data);
  const status = safeString(value.status, 40);
  if (value.ok === false && status === "expired") {
    throw new Error("completion_outbox_expired_or_missing");
  }
  if (value.ok !== true || !["staged", "accepted"].includes(status)) {
    throw new Error("completion_outbox_claim_invalid");
  }
  if (status === "accepted") {
    const acceptedAt = safeString(value.accepted_at, 80);
    if (!acceptedAt) throw new Error("completion_outbox_acceptance_invalid");
    return { acceptedAt, alreadyAccepted: true };
  }

  const ciphertext = safeString(value.recipient_ciphertext, 2048);
  const nonce = safeString(value.recipient_nonce, 64);
  const keyVersion = safeString(value.key_version, 64);
  const deliveryClaimToken = safeString(value.delivery_claim_token, 80);
  if (
    !ciphertext ||
    !nonce ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(keyVersion) ||
    !UUID_RE.test(deliveryClaimToken)
  ) {
    throw new Error("completion_outbox_claim_invalid");
  }
  const recipient = await decryptCompletionRecipient(
    ciphertext,
    nonce,
    keyVersion,
    String(claim.request.id),
    dataSubjectRequestId,
  );
  try {
    await renewWorkflowClaim(adminClient, claim);
    await sendEmail({
      to: recipient,
      subject: draft.subject,
      html: draft.html,
      text: draft.text,
    });
  } catch (error) {
    await renewWorkflowClaim(adminClient, claim);
    const release = await adminClient.rpc(
      "kc_release_account_erasure_completion_delivery",
      {
        p_workflow_id: claim.request.id,
        p_operation_claim_token: claim.token,
        p_delivery_claim_token: deliveryClaimToken,
      },
    );
    const released = asObject(
      Array.isArray(release.data) ? release.data[0] : release.data,
    );
    if (release.error || released.ok !== true || released.released !== true) {
      console.error(
        "[kc-account-erasure] completion_delivery_claim_release_failed",
      );
    }
    throw error;
  }
  await renewWorkflowClaim(adminClient, claim);
  const acceptance = await adminClient.rpc(
    "kc_accept_account_erasure_completion_delivery",
    {
      p_workflow_id: claim.request.id,
      p_operation_claim_token: claim.token,
      p_delivery_claim_token: deliveryClaimToken,
    },
  );
  if (acceptance.error) throw new Error("completion_outbox_accept_failed");
  const accepted = asObject(
    Array.isArray(acceptance.data) ? acceptance.data[0] : acceptance.data,
  );
  const acceptedAt = safeString(accepted.accepted_at, 80);
  if (
    accepted.ok !== true ||
    accepted.status !== "accepted" ||
    accepted.ciphertext_deleted !== true ||
    !acceptedAt
  ) {
    throw new Error("completion_outbox_accept_invalid");
  }
  return { acceptedAt, alreadyAccepted: false };
}

function completionNotificationPendingCode(error: unknown) {
  const message = safeString(
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : error,
    300,
  );
  if (message.includes("completion_outbox_expired_or_missing")) {
    return "completion_outbox_expired_manual_delivery_required";
  }
  if (message.includes("completion_outbox_delivery_in_progress")) {
    return "completion_outbox_delivery_in_progress";
  }
  if (
    message.includes("completion_outbox_accept_failed") ||
    message.includes("completion_outbox_accept_invalid")
  ) {
    return "completion_outbox_delivery_ambiguous";
  }
  return "completion_notification_pending";
}

async function discardCompletionOutbox(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  strict = true,
) {
  await renewWorkflowClaim(adminClient, claim);
  const { data, error } = await adminClient.rpc(
    "kc_discard_account_erasure_completion_outbox",
    {
      p_workflow_id: claim.request.id,
      p_operation_claim_token: claim.token,
    },
  );
  const value = asObject(Array.isArray(data) ? data[0] : data);
  if (error || value.ok !== true || value.ciphertext_deleted !== true) {
    if (strict) throw new Error("completion_outbox_discard_failed");
    console.error("[kc-account-erasure] completion_outbox_discard_failed");
    return false;
  }
  return true;
}

function actionAllowedFromStatus(action: string, request: JsonObject) {
  const status = safeString(request.status, 80) || "diagnosed";
  const metadata = asObject(request.metadata);
  const failureStage = safeString(metadata.failure_stage, 80);
  if (action === "diagnose" || action === "generate_receipt") return true;
  if (action === "apply_reversible") {
    return status === "diagnosed" ||
      status === "reversible_applied" ||
      (status === "failed" &&
        ["apply_reversible", "confirmation_delivery"].includes(failureStage));
  }
  if (action === "record_confirmation_delivery") {
    return status === "reversible_applied" ||
      (status === "failed" && failureStage === "confirmation_delivery");
  }
  if (action === "cancel_reversible") {
    return [
      "diagnosed",
      "reversible_applied",
      "pending_confirmation",
      "failed",
      "cancelled",
    ].includes(status);
  }
  if (action === "erase_confirmed") {
    return ["pending_confirmation", "confirmed"].includes(status) ||
      (["failed", "partial_failure"].includes(status) &&
        [
          "account_ban",
          "session_revocation",
          "database_quiescence",
          "storage_cleanup",
          "export_artifact_purge",
          "database_cleanup",
        ].includes(failureStage)) ||
      status === "erased";
  }
  if (action === "retry_finalize") {
    return (
      ["failed", "partial_failure"].includes(status) &&
      [
        "completion_email",
        "completion_outbox",
        "help_redaction",
        "external_processors",
        "data_subject_finalization",
        "final_workflow",
        "postconditions",
      ].includes(failureStage)
    ) || (
      status === "erased" &&
      metadata.notification_pending === true &&
      !["sent", "sent_manual"].includes(
        safeString(metadata.completion_email_status, 80),
      )
    );
  }
  return false;
}

function assertActionAllowed(action: string, request: JsonObject) {
  if (actionAllowedFromStatus(action, request)) return;
  throw new WorkflowError(409, "invalid_workflow_transition", {
    action,
    status: safeString(request.status, 80),
    failure_stage: safeString(asObject(request.metadata).failure_stage, 80),
  });
}

async function markWorkflowFailure(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  adminUserId: string,
  stage: string,
  error: unknown,
  metadataPatch: JsonObject = {},
) {
  const detail = error instanceof WorkflowError
    ? error.code
    : `${stage}_failed`;
  const metadata = {
    ...asObject(claim.request.metadata),
    failure_stage: stage,
    retryable: true,
    failure_detail: safeString(detail, 500),
    failed_at: new Date().toISOString(),
    ...metadataPatch,
  };
  return updateClaimedWorkflow(
    adminClient,
    claim,
    {
      status: metadataPatch.auth_deleted === true ||
          metadataPatch.irreversible_effects_applied === true
        ? "partial_failure"
        : "failed",
      processed_by: adminUserId,
      metadata,
    },
    true,
  );
}

async function collectTargetHelpRequestIds(
  adminClient: SupabaseClientLike,
  userId: string | null,
  email: string,
  linkedHelpRequestId?: string | null,
) {
  const ids = new Set<string>();
  if (linkedHelpRequestId) ids.add(linkedHelpRequestId);
  const lookups: Array<Promise<{ rows: any[]; error: string | null }>> = [
    safeRowsPaged(
      adminClient,
      "help_requests",
      "id",
      (query) => query.eq("contact_email", email),
    ),
    safeRowsPaged(
      adminClient,
      "help_requests",
      "id",
      (query) => query.eq("metadata->>account_email", email),
    ),
    safeRowsPaged(
      adminClient,
      "help_requests",
      "id",
      (query) => query.eq("metadata->>email", email),
    ),
  ];
  if (userId) {
    lookups.push(
      safeRowsPaged(
        adminClient,
        "help_requests",
        "id",
        (query) => query.eq("user_id", userId),
      ),
    );
  }
  const results = await Promise.all(lookups);
  for (const result of results) {
    for (const row of result.rows) if (row?.id) ids.add(String(row.id));
  }
  return {
    ids: Array.from(ids),
    errors: results.map((result) => result.error).filter(Boolean) as string[],
  };
}

async function buildDiagnostics(
  adminClient: SupabaseClientLike,
  userId: string | null,
  email: string,
  linkedHelpRequestId?: string | null,
) {
  const counts: JsonObject = {};
  const behavioralRowIds: JsonObject = {};
  const warnings: string[] = [];
  const errors: string[] = [];
  const recordCount = async (
    key: string,
    table: string,
    apply: (query: any) => any,
    critical = false,
  ) => {
    const result = await safeCount(adminClient, table, apply);
    counts[key] = result.count;
    if (result.error) {
      const detail = `${key}: ${result.error}`;
      warnings.push(detail);
      if (critical) errors.push(detail);
    }
    return result.count;
  };

  const helpRequestScan = await collectTargetHelpRequestIds(
    adminClient,
    userId,
    email,
    linkedHelpRequestId,
  );
  counts.help_requests = helpRequestScan.ids.length;
  for (const detail of helpRequestScan.errors) {
    errors.push(`help_requests: ${detail}`);
  }

  if (!userId) {
    return {
      user_found: false,
      counts,
      post_ids: [],
      help_request_ids: helpRequestScan.ids,
      warnings: ["auth_user_not_found", ...warnings],
      errors,
      blockers: ["auth_user_not_found"],
      external_processors: buildExternalProcessorMatrix(),
    };
  }

  const profileRows = await safeRowsPaged(
    adminClient,
    "profiles",
    "id,is_admin",
    (query) => query.eq("id", userId),
  );
  counts.profiles = profileRows.rows.length;
  if (profileRows.error) errors.push(`profiles: ${profileRows.error}`);
  const targetIsAdmin = profileRows.rows.some((row: any) =>
    row?.is_admin === true
  );
  const activeAdmins = await safeCount(
    adminClient,
    "profiles",
    (query) => query.eq("is_admin", true),
  );
  counts.active_admins = activeAdmins.count;
  if (activeAdmins.error) errors.push(`active_admins: ${activeAdmins.error}`);
  const capabilities = await readErasureCapabilities(adminClient);
  if (!capabilities.ok) {
    warnings.push(
      `erasure_capabilities: ${capabilities.error || "required_flags_missing"}`,
    );
  }
  const outboxEncryptionReady = await completionOutboxEncryptionReady();
  if (!outboxEncryptionReady) {
    warnings.push("completion_outbox_encryption_unavailable");
  }
  const auditIdentifierScan = await readAuditIdentifierInventory(
    adminClient,
    userId,
  );
  const auditEmailScan = await readAuditEmailInventory(adminClient, email);
  counts.audit_log_identifier_rows = auditIdentifierScan.audit_log_rows;
  counts.ad_campaign_audit_identifier_rows =
    auditIdentifierScan.ad_campaign_audit_rows;
  counts.hero_banner_audit_identifier_rows =
    auditIdentifierScan.hero_banner_audit_rows;
  counts.audit_log_personal_email_rows = auditEmailScan.audit_log_rows;
  if (!auditIdentifierScan.ok) {
    errors.push(
      auditIdentifierScan.error || "audit_identifier_inventory_failed",
    );
  }
  if (!auditEmailScan.ok) {
    errors.push(auditEmailScan.error || "audit_email_inventory_failed");
  }

  const postRows = await safeRowsPaged(
    adminClient,
    "posts",
    "id,status,visibility,image_url,metadata",
    (query) => query.eq("author_id", userId),
  );
  const postIds = postRows.rows.map((row: any) => row.id).filter(Boolean);
  counts.posts = postRows.rows.length;
  if (postRows.error) errors.push(`posts: ${postRows.error}`);
  counts.post_media = postIds.length
    ? await recordCount(
      "post_media",
      "post_media",
      (query) => query.in("post_id", postIds),
      true,
    )
    : 0;

  const authoredComments = await safeRowsPaged(
    adminClient,
    "comments",
    "id,post_id",
    (query) => query.eq("author_id", userId),
  );
  const authoredCommentIds = authoredComments.rows.map((row: any) => row.id)
    .filter(Boolean);
  counts.comments = authoredCommentIds.length;
  if (authoredComments.error) {
    errors.push(`comments: ${authoredComments.error}`);
  }
  counts.comment_likes_on_authored_comments = authoredCommentIds.length
    ? await recordCount(
      "comment_likes_on_authored_comments",
      "comment_likes",
      (query) =>
        query.in("comment_id", authoredCommentIds).neq("user_id", userId),
      true,
    )
    : 0;
  await recordCount(
    "comment_likes",
    "comment_likes",
    (query) => query.eq("user_id", userId),
  );
  await recordCount(
    "post_votes",
    "post_votes",
    (query) => query.eq("voter_id", userId),
  );
  await recordCount(
    "saved_posts",
    "saved_posts",
    (query) => query.eq("user_id", userId),
  );
  const authoredReports = await safeRowsPaged(
    adminClient,
    "reports",
    "id",
    (query) => query.eq("reporter_id", userId),
  );
  const authoredReportIds = authoredReports.rows.map((row: any) => row.id)
    .filter(Boolean);
  counts.reports = authoredReportIds.length;
  if (authoredReports.error) errors.push(`reports: ${authoredReports.error}`);
  for (
    const table of [
      "post_view_events",
      "search_queries",
      "home_category_affinity",
      "search_preferences",
      "privacy_analytics_events",
      "privacy_consent_events",
      "user_legal_acceptances",
    ]
  ) {
    const rows = await safeRowsPaged(
      adminClient,
      table,
      "id",
      (query) => query.eq("user_id", userId),
    );
    const ids = rows.rows.map((row: any) => row.id).filter(Boolean);
    counts[table] = ids.length;
    behavioralRowIds[table] = ids;
    if (rows.error) errors.push(`${table}: ${rows.error}`);
  }
  await recordCount(
    "user_blocks",
    "user_blocks",
    (query) => query.or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
  );
  const blocksReceived = await safeRowsPaged(
    adminClient,
    "user_blocks",
    "id,blocker_id,blocked_id,blocked_subject_hash",
    (query) => query.eq("blocked_id", userId).neq("blocker_id", userId),
  );
  counts.user_blocks_received = blocksReceived.rows.length;
  if (blocksReceived.error) {
    errors.push(`user_blocks_received: ${blocksReceived.error}`);
  }
  await recordCount(
    "user_ratings",
    "user_ratings",
    (query) =>
      query.or(`rater_user_id.eq.${userId},target_user_id.eq.${userId}`),
  );
  const ratingsReceived = await safeRowsPaged(
    adminClient,
    "user_ratings",
    "id,rater_user_id,target_user_id",
    (query) => query.eq("target_user_id", userId).neq("rater_user_id", userId),
  );
  counts.user_ratings_received = ratingsReceived.rows.length;
  if (ratingsReceived.error) {
    errors.push(`user_ratings_received: ${ratingsReceived.error}`);
  }

  const conversations = await safeRowsPaged(
    adminClient,
    "chat_conversations",
    "id,participant_low,participant_high",
    (query) =>
      query.or(`participant_low.eq.${userId},participant_high.eq.${userId}`),
  );
  const conversationIds = conversations.rows.map((row: any) => row.id).filter(
    Boolean,
  );
  counts.chat_conversations = conversationIds.length;
  if (conversations.error) {
    errors.push(`chat_conversations: ${conversations.error}`);
  }
  const targetChatMessages = await safeRowsPaged(
    adminClient,
    "chat_messages",
    "id,conversation_id",
    (query) => query.eq("sender_id", userId),
  );
  counts.chat_messages = targetChatMessages.rows.length;
  if (targetChatMessages.error) {
    errors.push(`chat_messages: ${targetChatMessages.error}`);
  }
  const thirdPartyChatRows = conversationIds.length
    ? await safeRowsPaged(
      adminClient,
      "chat_messages",
      "id,conversation_id",
      (query) =>
        query.in("conversation_id", conversationIds).neq("sender_id", userId),
    )
    : { rows: [], error: null };
  const thirdPartyChatMessages = thirdPartyChatRows.rows.length;
  counts.chat_messages_third_party = thirdPartyChatMessages;
  if (thirdPartyChatRows.error) {
    errors.push(`chat_messages_third_party: ${thirdPartyChatRows.error}`);
  }
  await recordCount(
    "chat_read_state",
    "chat_read_state",
    (query) => query.eq("user_id", userId),
  );
  await recordCount(
    "chat_reactions",
    "chat_reactions",
    (query) => query.eq("user_id", userId),
  );

  await recordCount(
    "notifications",
    "notifications",
    (query) => query.eq("user_id", userId),
  );
  await recordCount(
    "notification_preferences",
    "notification_preferences",
    (query) => query.eq("user_id", userId),
  );
  await recordCount(
    "notification_channel_targets",
    "notification_channel_targets",
    (query) => query.eq("user_id", userId),
  );
  const outboxRows = await safeRowsPaged(
    adminClient,
    "notification_delivery_outbox",
    "id",
    (query) => query.eq("user_id", userId),
  );
  const outboxIds = outboxRows.rows.map((row: any) => row.id).filter(Boolean);
  counts.notification_delivery_outbox = outboxIds.length;
  if (outboxRows.error) {
    warnings.push(`notification_delivery_outbox: ${outboxRows.error}`);
  }
  counts.notification_delivery_attempts = outboxIds.length
    ? await recordCount(
      "notification_delivery_attempts",
      "notification_delivery_attempts",
      (query) => query.in("outbox_id", outboxIds),
    )
    : 0;

  await recordCount(
    "kc_invited_emails",
    "kc_invited_emails",
    (query) => query.eq("email", email),
  );
  await recordCount(
    "kc_admin_chart_prefs",
    "kc_admin_chart_prefs",
    (query) => query.eq("user_id", userId),
  );
  await recordCount(
    "kc_trusted_publishers",
    "kc_trusted_publishers",
    (query) => query.eq("user_id", userId),
  );
  await recordCount(
    "post_flood_limits",
    "post_flood_limits",
    (query) => query.eq("user_id", userId),
  );
  await recordCount(
    "post_flood_resets",
    "post_flood_resets",
    (query) => query.eq("user_id", userId),
  );
  await recordCount(
    "post_limits",
    "post_limits",
    (query) => query.eq("user_id", userId),
  );
  const caduRequested = await recordCount(
    "cadu_reviews_requested",
    "cadu_institutional_source_reviews",
    (query) => query.eq("requested_by", userId),
  );
  const caduResolved = await recordCount(
    "cadu_reviews_resolved",
    "cadu_institutional_source_reviews",
    (query) => query.eq("resolved_by", userId),
  );
  await recordCount(
    "audit_log_actor",
    "audit_log",
    (query) => query.eq("actor_id", userId),
  );

  const blockers: string[] = [];
  if (targetIsAdmin && activeAdmins.count <= 1) {
    blockers.push("last_admin_continuity_required");
  }
  if (!capabilities.ok) blockers.push("safe_erasure_schema_unavailable");
  if (!outboxEncryptionReady) {
    blockers.push("completion_outbox_encryption_unavailable");
  }
  if (errors.length) blockers.push("diagnostics_incomplete");

  return {
    user_found: true,
    target_is_admin: targetIsAdmin,
    erasure_capabilities: capabilities,
    completion_outbox: { encryption_ready: outboxEncryptionReady },
    counts,
    post_ids: postIds,
    authored_comment_ids: authoredCommentIds,
    authored_report_ids: authoredReportIds,
    behavioral_row_ids: behavioralRowIds,
    received_rating_ids: ratingsReceived.rows.map((row: any) => row.id).filter(
      Boolean,
    ),
    received_block_ids: blocksReceived.rows.map((row: any) => row.id).filter(
      Boolean,
    ),
    conversation_ids: conversationIds,
    chat_message_ids: targetChatMessages.rows.map((row: any) => row.id).filter(
      Boolean,
    ),
    third_party_chat_message_ids: thirdPartyChatRows.rows.map((row: any) =>
      row.id
    ).filter(Boolean),
    help_request_ids: helpRequestScan.ids,
    warnings: [...warnings, ...(postRows.error ? [postRows.error] : [])],
    errors,
    blockers,
    shared_chat_risk: {
      conversation_count: conversationIds.length,
      third_party_message_count: thirdPartyChatMessages,
      policy: capabilities.chat_preserving_delete
        ? "preserve_third_party_timeline_and_null_target_identifiers"
        : "hard_delete_blocked_until_safe_schema",
    },
    external_processors: buildExternalProcessorMatrix(),
  };
}

async function insertAudit(
  adminClient: SupabaseClientLike,
  action: string,
  requestId: string,
  adminUserId: string,
  payload: JsonObject,
) {
  const { error } = await adminClient.from("audit_log").insert({
    action,
    entity_type: "account_erasure_requests",
    entity_id: requestId,
    actor_id: adminUserId,
    payload,
  });
  if (error) console.error("[kc-account-erasure] audit_insert_failed");
}

async function mergeHelpRequestMetadata(
  adminClient: SupabaseClientLike,
  helpRequest: JsonObject | null,
  patch: JsonObject,
  status?: string,
) {
  if (!helpRequest?.id) return null;
  const nextMetadata = { ...asObject(helpRequest.metadata), ...patch };
  const updates: JsonObject = { metadata: nextMetadata };
  if (status) updates.status = status;
  const { data, error } = await adminClient
    .from("help_requests")
    .update(updates)
    .eq("id", helpRequest.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function persistWorkflowMetadata(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  metadata: JsonObject,
) {
  return updateClaimedWorkflow(adminClient, claim, { metadata });
}

async function readProfileReversibleSnapshot(
  adminClient: SupabaseClientLike,
  userId: string,
) {
  const before = await adminClient
    .from("profiles")
    .select("profile_public,contact_cta_enabled,social_visibility")
    .eq("id", userId)
    .maybeSingle();
  if (before.error) throw before.error;
  return {
    profile_public: Boolean(before.data?.profile_public),
    contact_cta_enabled: Boolean(before.data?.contact_cta_enabled),
    social_visibility: asObject(before.data?.social_visibility),
  };
}

async function updateProfileReversible(
  adminClient: SupabaseClientLike,
  userId: string,
  snapshot?: JsonObject,
) {
  const before = snapshot ||
    await readProfileReversibleSnapshot(adminClient, userId);
  const payload = {
    profile_public: false,
    contact_cta_enabled: false,
    social_visibility: {},
  };
  const { error } = await adminClient.from("profiles").update(payload).eq(
    "id",
    userId,
  );
  if (error) throw error;
  return {
    profile_public: Boolean(before.profile_public),
    contact_cta_enabled: Boolean(before.contact_cta_enabled),
    social_visibility: asObject(before.social_visibility),
  };
}

async function updateOwnedPostsReversible(
  adminClient: SupabaseClientLike,
  userId: string,
  requestId: string,
) {
  const scan = await safeRowsPaged(
    adminClient,
    "posts",
    "id,status,visibility,metadata",
    (query) => query.eq("author_id", userId),
  );
  if (scan.error) throw new Error(`posts_snapshot_failed: ${scan.error}`);
  let updated = 0;
  for (const row of scan.rows as any[]) {
    const currentMetadata = asObject(row.metadata);
    const currentErasure = asObject(currentMetadata.lgpd_erasure);
    if (currentErasure.request_id && currentErasure.request_id !== requestId) {
      throw new WorkflowError(
        409,
        "post_restricted_by_another_erasure_request",
        { post_id: row.id },
      );
    }
    const nextMetadata = {
      ...currentMetadata,
      lgpd_erasure: {
        ...currentErasure,
        request_id: requestId,
        stage: "pending_confirmation",
        reversible_applied_at: new Date().toISOString(),
        previous_status: currentErasure.previous_status ||
          String(row.status || "published"),
        previous_visibility: currentErasure.previous_visibility ||
          String(row.visibility || "community"),
      },
    };
    const nextStatus = ["published", "pending", "closed", "expired"].includes(
        String(row.status || ""),
      )
      ? "hidden"
      : String(row.status || "hidden");
    const { error } = await adminClient
      .from("posts")
      .update({
        status: nextStatus,
        visibility: "community",
        metadata: nextMetadata,
      })
      .eq("id", row.id);
    if (error) throw error;
    updated += 1;
  }
  return updated;
}

async function restoreReversibleChanges(
  adminClient: SupabaseClientLike,
  request: JsonObject,
  userId: string | null,
) {
  if (!userId) throw new WorkflowError(409, "reversible_restore_user_missing");
  const requestMetadata = asObject(request.metadata);
  const snapshot = asObject(
    asObject(requestMetadata.reversible_snapshot).profile,
  );
  if (!Object.keys(snapshot).length) {
    throw new WorkflowError(409, "reversible_snapshot_missing");
  }

  const profileRestore = await adminClient
    .from("profiles")
    .update({
      profile_public: snapshot.profile_public === true,
      contact_cta_enabled: snapshot.contact_cta_enabled === true,
      social_visibility: asObject(snapshot.social_visibility),
    })
    .eq("id", userId);
  if (profileRestore.error) throw profileRestore.error;

  const posts = await safeRowsPaged(
    adminClient,
    "posts",
    "id,status,visibility,metadata",
    (query) => query.eq("author_id", userId),
  );
  if (posts.error) throw new Error(`posts_restore_scan_failed: ${posts.error}`);
  let restoredPosts = 0;
  for (const row of posts.rows as any[]) {
    const metadata = asObject(row.metadata);
    const marker = asObject(metadata.lgpd_erasure);
    if (safeString(marker.request_id, 80) !== safeString(request.id, 80)) {
      continue;
    }
    const nextMetadata = { ...metadata };
    delete nextMetadata.lgpd_erasure;
    const result = await adminClient
      .from("posts")
      .update({
        status: safeString(marker.previous_status, 80) || row.status,
        visibility: safeString(marker.previous_visibility, 80) ||
          row.visibility,
        metadata: nextMetadata,
      })
      .eq("id", row.id);
    if (result.error) throw result.error;
    restoredPosts += 1;
  }
  return { restored_posts: restoredPosts, profile_restored: true };
}

async function removeStoragePaths(
  adminClient: SupabaseClientLike,
  paths: StorageObjectRef[],
  heartbeat?: () => Promise<unknown>,
) {
  const clean = uniqStorageRefs(paths);
  const removed: string[] = [];
  const errors: string[] = [];
  const buckets = new Map<string, string[]>();
  for (const item of clean) {
    const bucketPaths = buckets.get(item.bucket) || [];
    bucketPaths.push(item.path);
    buckets.set(item.bucket, bucketPaths);
  }
  for (const [bucket, bucketPaths] of buckets) {
    for (let i = 0; i < bucketPaths.length; i += 50) {
      if (heartbeat) await heartbeat();
      const chunk = bucketPaths.slice(i, i + 50);
      const { error } = await adminClient.storage.from(bucket).remove(chunk);
      if (error) errors.push(`${bucket}:storage_remove_failed`);
      else removed.push(...chunk.map((path) => `${bucket}/${path}`));
    }
  }
  return { removed, errors };
}

function dataExportArtifactCleanupSummary(value: unknown) {
  const source = asObject(value);
  const nonNegativeInteger = (input: unknown) => {
    const parsed = Number(input);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  };
  return {
    claimed_count: nonNegativeInteger(source.claimed_count),
    purged_count: nonNegativeInteger(source.purged_count),
    storage_objects_removed: nonNegativeInteger(source.storage_objects_removed),
    batches: nonNegativeInteger(source.batches),
    blocked_active_claim_count: nonNegativeInteger(
      source.blocked_active_claim_count,
    ),
    retry_after: safeString(source.retry_after, 80) || null,
    postcondition_verified: source.postcondition_verified === true,
  };
}

function mergeDataExportArtifactCleanup(first: unknown, second: unknown) {
  const left = dataExportArtifactCleanupSummary(first);
  const right = dataExportArtifactCleanupSummary(second);
  const claimedCount = left.purged_count + right.claimed_count;
  const purgedCount = left.purged_count + right.purged_count;
  return {
    claimed_count: claimedCount,
    purged_count: purgedCount,
    storage_objects_removed: left.storage_objects_removed +
      right.storage_objects_removed,
    batches: left.batches + right.batches,
    blocked_active_claim_count: right.blocked_active_claim_count,
    retry_after: right.retry_after,
    postcondition_verified: right.postcondition_verified === true &&
      claimedCount === purgedCount,
  };
}

async function releaseDataExportArtifactErasurePurge(
  adminClient: SupabaseClientLike,
  artifactRef: string,
  version: number,
  erasureRequestId: string,
  errorCode: string,
) {
  const { error } = await adminClient.rpc(
    "kc_release_data_export_artifact_erasure_purge",
    {
      p_artifact_ref: artifactRef,
      p_expected_version: version,
      p_erasure_request_id: erasureRequestId,
      p_error_code: errorCode,
    },
  );
  return !error;
}

async function purgeDataExportArtifactsForErasure(
  adminClient: SupabaseClientLike,
  userId: string,
  erasureRequestId: string,
  heartbeat?: () => Promise<unknown>,
) {
  let claimedCount = 0;
  let purgedCount = 0;
  let storageObjectsRemoved = 0;
  let batches = 0;
  while (batches < 100) {
    if (heartbeat) await heartbeat();
    batches += 1;
    const { data, error } = await adminClient.rpc(
      "kc_claim_data_export_artifacts_for_erasure",
      {
        p_user_id: userId,
        p_erasure_request_id: erasureRequestId,
        p_limit: 100,
      },
    );
    if (error) {
      throw new WorkflowError(409, "data_export_artifact_claim_failed", {
        claimed_count: claimedCount,
        purged_count: purgedCount,
        storage_objects_removed: storageObjectsRemoved,
      });
    }
    const batch = asObject(Array.isArray(data) ? data[0] : data);
    const artifactsValue = batch.artifacts;
    const artifacts = Array.isArray(artifactsValue)
      ? artifactsValue.map(asObject)
      : [];
    const batchClaimedCount = Number(batch.claimed_count);
    const blockedActiveClaimCount = Number(batch.blocked_active_claim_count);
    const retryAfter = safeString(batch.retry_after, 80);
    const retryAfterTimestamp = retryAfter
      ? Date.parse(retryAfter)
      : Number.NaN;
    if (
      batch.ok !== true ||
      !Array.isArray(artifactsValue) ||
      safeString(batch.erasure_request_id, 80) !== erasureRequestId ||
      !Number.isSafeInteger(batchClaimedCount) ||
      batchClaimedCount < 0 ||
      batchClaimedCount !== artifacts.length ||
      !Number.isSafeInteger(blockedActiveClaimCount) ||
      blockedActiveClaimCount < 0 ||
      (
        blockedActiveClaimCount > 0 &&
        (!retryAfter || !Number.isFinite(retryAfterTimestamp))
      ) ||
      typeof batch.has_more !== "boolean" ||
      batch.metadata_retained_until_storage_confirmation !== true ||
      (
        batch.has_more === true &&
        artifacts.length === 0 &&
        blockedActiveClaimCount === 0
      )
    ) {
      throw new WorkflowError(409, "data_export_artifact_claim_invalid", {
        claimed_count: claimedCount,
        purged_count: purgedCount,
        storage_objects_removed: storageObjectsRemoved,
      });
    }

    claimedCount += artifacts.length;
    for (const artifact of artifacts) {
      if (heartbeat) await heartbeat();
      const artifactRef = safeString(artifact.artifact_ref, 80);
      const version = Number(artifact.version);
      const bucket = safeString(artifact.bucket_id, 80);
      const objectPath = safeString(artifact.object_path, 200);
      if (
        !EXPORT_ARTIFACT_REF_RE.test(artifactRef) ||
        !Number.isSafeInteger(version) ||
        version < 1 ||
        bucket !== "kino-data-exports" ||
        (objectPath && !EXPORT_ARTIFACT_PATH_RE.test(objectPath))
      ) {
        throw new WorkflowError(409, "data_export_artifact_claim_invalid", {
          claimed_count: claimedCount,
          purged_count: purgedCount,
          storage_objects_removed: storageObjectsRemoved,
        });
      }

      if (objectPath) {
        const { error: removeError } = await adminClient.storage
          .from(bucket)
          .remove([objectPath]);
        if (removeError) {
          const released = await releaseDataExportArtifactErasurePurge(
            adminClient,
            artifactRef,
            version,
            erasureRequestId,
            "EXPORT_ERASURE_STORAGE_PURGE_FAILED",
          );
          throw new WorkflowError(
            409,
            "data_export_artifact_storage_purge_failed",
            {
              claimed_count: claimedCount,
              purged_count: purgedCount,
              storage_objects_removed: storageObjectsRemoved,
              purge_claim_released: released,
            },
          );
        }
      }

      if (heartbeat) await heartbeat();
      const { data: completeData, error: completeError } = await adminClient
        .rpc(
          "kc_complete_data_export_artifact_erasure_purge",
          {
            p_artifact_ref: artifactRef,
            p_expected_version: version,
            p_erasure_request_id: erasureRequestId,
          },
        );
      const completed = asObject(
        Array.isArray(completeData) ? completeData[0] : completeData,
      );
      const completedVersion = Number(completed.version);
      if (
        completeError ||
        safeString(completed.artifact_ref, 80) !== artifactRef ||
        safeString(completed.status, 40) !== "purged" ||
        !Number.isSafeInteger(completedVersion) ||
        completedVersion <= version
      ) {
        const released = await releaseDataExportArtifactErasurePurge(
          adminClient,
          artifactRef,
          version,
          erasureRequestId,
          "EXPORT_ERASURE_FINALIZE_FAILED",
        );
        throw new WorkflowError(409, "data_export_artifact_finalize_failed", {
          claimed_count: claimedCount,
          purged_count: purgedCount,
          storage_objects_removed: storageObjectsRemoved,
          purge_claim_released: released,
        });
      }
      purgedCount += 1;
      if (objectPath) storageObjectsRemoved += 1;
    }

    if (blockedActiveClaimCount > 0) {
      throw new WorkflowError(
        409,
        "data_export_artifact_active_build_in_progress",
        {
          claimed_count: claimedCount,
          purged_count: purgedCount,
          storage_objects_removed: storageObjectsRemoved,
          batches,
          blocked_active_claim_count: blockedActiveClaimCount,
          retry_after: retryAfter,
          postcondition_verified: false,
        },
      );
    }
    if (batch.has_more !== true) {
      return {
        claimed_count: claimedCount,
        purged_count: purgedCount,
        storage_objects_removed: storageObjectsRemoved,
        batches,
        blocked_active_claim_count: 0,
        retry_after: null,
        postcondition_verified: claimedCount === purgedCount,
      };
    }
  }
  throw new WorkflowError(409, "data_export_artifact_batch_limit_exceeded", {
    claimed_count: claimedCount,
    purged_count: purgedCount,
    storage_objects_removed: storageObjectsRemoved,
  });
}

function uniqStorageRefs(values: StorageObjectRef[]) {
  const seen = new Set<string>();
  const result: StorageObjectRef[] = [];
  for (const value of values) {
    const bucket = safeString(value?.bucket, 120);
    const path = safeString(value?.path, 1024);
    const key = `${bucket}\n${path}`;
    if (!bucket || !path || seen.has(key)) continue;
    seen.add(key);
    result.push({ bucket, path });
  }
  return result;
}

async function listStoragePrefix(
  adminClient: SupabaseClientLike,
  bucket: string,
  prefix: string,
  maxDepth: number,
) {
  const files: string[] = [];
  const errors: string[] = [];
  const queue = [{ prefix: prefix.replace(/\/+$/, ""), depth: 0 }];
  let scanned = 0;
  while (queue.length) {
    const current = queue.shift()!;
    for (let offset = 0; offset < 10000; offset += 1000) {
      const { data, error } = await adminClient.storage.from(bucket).list(
        current.prefix,
        {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        },
      );
      if (error) {
        errors.push(`${bucket}:storage_list_failed`);
        break;
      }
      const rows = Array.isArray(data) ? data : [];
      scanned += rows.length;
      if (scanned > 10000) {
        errors.push("storage_object_scan_limit_exceeded");
        return { files, errors };
      }
      for (const row of rows as any[]) {
        const name = safeString(row?.name, 260);
        if (!name) continue;
        const path = `${current.prefix}/${name}`;
        if (row?.id || row?.metadata) files.push(path);
        else if (current.depth < maxDepth) {
          queue.push({ prefix: path, depth: current.depth + 1 });
        } else errors.push(`${bucket}:storage_tree_depth_exceeded`);
      }
      if (rows.length < 1000) break;
    }
  }
  return { files, errors };
}

async function collectStoragePaths(
  adminClient: SupabaseClientLike,
  userId: string,
  postIds: string[],
  conversationIds: string[] = [],
) {
  const mediaBucket = getEnv("KC_STORAGE_BUCKET", "kino-media");
  const chatBucket = getEnv("KC_CHAT_STORAGE_BUCKET", "kino-chat-media");
  const paths: StorageObjectRef[] = [];
  const errors: string[] = [];
  const addMediaPath = (value: unknown) => {
    const path = extractStoragePath(value, mediaBucket);
    if (path) paths.push({ bucket: mediaBucket, path });
  };
  const addChatPath = (value: unknown) => {
    const path = extractStoragePath(value, chatBucket) ||
      extractStoragePath(value, mediaBucket) ||
      safeString(value, 1024);
    if (!path.startsWith("chat-media/")) return;
    paths.push({ bucket: chatBucket, path });
    // Cutover safety: old chat objects can still exist in the public media bucket.
    paths.push({ bucket: mediaBucket, path });
  };

  const profileRows = await safeRowsPaged(
    adminClient,
    "profiles",
    "avatar_path,avatar_url",
    (query) => query.eq("id", userId),
  );
  if (profileRows.error) errors.push(`profiles_storage: ${profileRows.error}`);
  for (const row of profileRows.rows as any[]) {
    addMediaPath(row.avatar_path);
    addMediaPath(row.avatar_url);
  }

  if (postIds.length) {
    const mediaRows = await safeRowsPaged(
      adminClient,
      "post_media",
      "url",
      (query) => query.in("post_id", postIds),
    );
    if (mediaRows.error) errors.push(`post_media_storage: ${mediaRows.error}`);
    for (const row of mediaRows.rows as any[]) addMediaPath(row.url);

    const postRows = await safeRowsPaged(
      adminClient,
      "posts",
      "image_url,metadata",
      (query) => query.in("id", postIds),
    );
    if (postRows.error) errors.push(`posts_storage: ${postRows.error}`);
    for (const row of postRows.rows as any[]) {
      const metadata = asObject(row.metadata);
      addMediaPath(row.image_url);
      addMediaPath(metadata.image_url);
      addMediaPath(metadata.cover_url);
    }
  }

  const chatRows = await safeRowsPaged(
    adminClient,
    "chat_messages",
    "media_path",
    (query) => query.eq("sender_id", userId),
  );
  if (chatRows.error) errors.push(`chat_storage: ${chatRows.error}`);
  for (const row of chatRows.rows as any[]) addChatPath(row.media_path);

  const prefixes = [
    { bucket: mediaBucket, prefix: `profile-avatars/${userId}`, depth: 0 },
    { bucket: mediaBucket, prefix: `post-media/${userId}`, depth: 2 },
    ...conversationIds.map((conversationId) => ({
      bucket: chatBucket,
      prefix: `chat-media/${conversationId}/${userId}`,
      depth: 0,
    })),
    ...conversationIds.map((conversationId) => ({
      bucket: mediaBucket,
      prefix: `chat-media/${conversationId}/${userId}`,
      depth: 0,
    })),
  ];
  for (let from = 0; from < prefixes.length; from += 20) {
    const scans = await Promise.all(
      prefixes.slice(from, from + 20).map((item) =>
        listStoragePrefix(adminClient, item.bucket, item.prefix, item.depth)
      ),
    );
    scans.forEach((scan, index) => {
      const item = prefixes[from + index];
      paths.push(...scan.files.map((path) => ({ bucket: item.bucket, path })));
      errors.push(...scan.errors);
    });
  }

  return { paths: uniqStorageRefs(paths), errors };
}

async function scanOwnedStorageObjects(
  adminClient: SupabaseClientLike,
  userId: string,
  conversationIds: string[],
) {
  const mediaBucket = getEnv("KC_STORAGE_BUCKET", "kino-media");
  const chatBucket = getEnv("KC_CHAT_STORAGE_BUCKET", "kino-chat-media");
  const files: StorageObjectRef[] = [];
  const errors: string[] = [];
  const prefixes = [
    { bucket: mediaBucket, prefix: `profile-avatars/${userId}`, depth: 0 },
    { bucket: mediaBucket, prefix: `post-media/${userId}`, depth: 2 },
    ...conversationIds.map((conversationId) => ({
      bucket: chatBucket,
      prefix: `chat-media/${conversationId}/${userId}`,
      depth: 0,
    })),
    ...conversationIds.map((conversationId) => ({
      bucket: mediaBucket,
      prefix: `chat-media/${conversationId}/${userId}`,
      depth: 0,
    })),
  ];
  for (let from = 0; from < prefixes.length; from += 20) {
    const scans = await Promise.all(
      prefixes.slice(from, from + 20).map((item) =>
        listStoragePrefix(adminClient, item.bucket, item.prefix, item.depth)
      ),
    );
    scans.forEach((scan, index) => {
      const item = prefixes[from + index];
      files.push(...scan.files.map((path) => ({ bucket: item.bucket, path })));
      errors.push(...scan.errors);
    });
  }
  return { paths: uniqStorageRefs(files), errors };
}

function assertNoErasureBlockers(diagnostics: JsonObject) {
  const blockers = Array.isArray(diagnostics.blockers)
    ? diagnostics.blockers.map((value) => safeString(value, 120)).filter(
      Boolean,
    )
    : [];
  if (blockers.length) {
    throw new WorkflowError(409, "erasure_preflight_blocked", { blockers });
  }
}

function diagnosticIds(diagnostics: JsonObject, key: string) {
  const value = diagnostics[key];
  if (!Array.isArray(value)) return [];
  return uniq(value.map((item) => safeString(item, 80)).filter(Boolean));
}

function erasureInventoryFromDiagnostics(diagnostics: JsonObject) {
  const behavioral = asObject(diagnostics.behavioral_row_ids);
  const behavioralRowIds = Object.fromEntries(
    Object.entries(behavioral).map(([table, values]) => [
      table,
      Array.isArray(values)
        ? uniq(values.map((item) => safeString(item, 80)).filter(Boolean))
        : [],
    ]),
  );
  return {
    postIds: diagnosticIds(diagnostics, "post_ids"),
    authoredCommentIds: diagnosticIds(diagnostics, "authored_comment_ids"),
    authoredReportIds: diagnosticIds(diagnostics, "authored_report_ids"),
    conversationIds: diagnosticIds(diagnostics, "conversation_ids"),
    targetChatMessageIds: diagnosticIds(diagnostics, "chat_message_ids"),
    thirdPartyChatMessageIds: diagnosticIds(
      diagnostics,
      "third_party_chat_message_ids",
    ),
    receivedRatingIds: diagnosticIds(diagnostics, "received_rating_ids"),
    receivedBlockIds: diagnosticIds(diagnostics, "received_block_ids"),
    behavioralRowIds,
  };
}

async function sanitizeAuthoredComments(
  adminClient: SupabaseClientLike,
  commentIds: string[],
  heartbeat?: () => Promise<unknown>,
) {
  if (!commentIds.length) return 0;
  let updated = 0;
  for (let from = 0; from < commentIds.length; from += 200) {
    if (heartbeat) await heartbeat();
    const chunk = commentIds.slice(from, from + 200);
    const { data, error } = await adminClient
      .from("comments")
      .update({
        author_name: "Conta excluida",
        body: "Comentario removido por solicitacao LGPD.",
      })
      .in("id", chunk)
      .select("id");
    if (error) throw error;
    updated += Array.isArray(data) ? data.length : 0;
  }
  if (updated !== commentIds.length) {
    throw new Error(
      `comment_sanitization_count_mismatch:${updated}/${commentIds.length}`,
    );
  }
  return updated;
}

async function sanitizeAuthoredReports(
  adminClient: SupabaseClientLike,
  reportIds: string[],
  heartbeat?: () => Promise<unknown>,
) {
  if (!reportIds.length) return 0;
  let updated = 0;
  for (let from = 0; from < reportIds.length; from += 200) {
    if (heartbeat) await heartbeat();
    const chunk = reportIds.slice(from, from + 200);
    const { data, error } = await adminClient
      .from("reports")
      .update({ details: null })
      .in("id", chunk)
      .select("id");
    if (error) throw error;
    updated += Array.isArray(data) ? data.length : 0;
  }
  if (updated !== reportIds.length) {
    throw new Error(
      `report_sanitization_count_mismatch:${updated}/${reportIds.length}`,
    );
  }
  return updated;
}

async function deleteBehavioralAndConsentData(
  adminClient: SupabaseClientLike,
  userId: string,
  rowIds: Record<string, string[]>,
  heartbeat?: () => Promise<unknown>,
) {
  const tables = [
    "post_view_events",
    "search_queries",
    "privacy_analytics_events",
    "privacy_consent_events",
    "home_category_affinity",
    "search_preferences",
  ];
  const deleted: Record<string, number> = {};
  for (const table of tables) {
    if (heartbeat) await heartbeat();
    const ids = Array.isArray(rowIds[table]) ? rowIds[table] : [];
    const result = ids.length
      ? await adminClient.from(table).delete().in("id", ids).select("id")
      : { data: [], error: null };
    if (result.error) throw new Error(`${table}_delete_failed`);
    const deletedCount = Array.isArray(result.data) ? result.data.length : 0;
    if (deletedCount !== ids.length) {
      throw new Error(
        `${table}_delete_count_mismatch:${deletedCount}/${ids.length}`,
      );
    }
    const remaining = await safeCount(
      adminClient,
      table,
      (query) => query.eq("user_id", userId),
    );
    if (remaining.error || remaining.count !== 0) {
      throw new Error(`${table}_delete_postcondition_failed`);
    }
    deleted[table] = deletedCount;
  }
  return deleted;
}

async function sanitizeOwnedChat(
  adminClient: SupabaseClientLike,
  userId: string,
  messageIds: string[],
  erasedAt: string,
  heartbeat?: () => Promise<unknown>,
) {
  let messagesSanitized = 0;
  for (let from = 0; from < messageIds.length; from += 200) {
    if (heartbeat) await heartbeat();
    const chunk = messageIds.slice(from, from + 200);
    const { data, error } = await adminClient
      .from("chat_messages")
      .update({
        content: null,
        media_path: null,
        e2e_envelope: null,
        deleted_at: erasedAt,
      })
      .eq("sender_id", userId)
      .in("id", chunk)
      .select("id");
    if (error) throw error;
    messagesSanitized += Array.isArray(data) ? data.length : 0;
  }
  if (messagesSanitized !== messageIds.length) {
    throw new Error(
      `chat_sanitization_count_mismatch:${messagesSanitized}/${messageIds.length}`,
    );
  }

  if (heartbeat) await heartbeat();
  const conversations = await adminClient
    .from("chat_conversations")
    .update({
      last_message_preview: "Mensagem removida",
      last_message_sender: null,
    })
    .eq("last_message_sender", userId);
  if (conversations.error) throw conversations.error;

  if (heartbeat) await heartbeat();
  const reactions = await adminClient.from("chat_reactions").delete().eq(
    "user_id",
    userId,
  );
  if (reactions.error) throw reactions.error;
  if (heartbeat) await heartbeat();
  const readState = await adminClient.from("chat_read_state").delete().eq(
    "user_id",
    userId,
  );
  if (readState.error) throw readState.error;
  return { messages_sanitized: messagesSanitized };
}

async function sanitizeOwnedPosts(
  adminClient: SupabaseClientLike,
  postIds: string[],
  erasedAt: string,
  heartbeat?: () => Promise<unknown>,
) {
  let sanitized = 0;
  for (const postId of postIds) {
    if (heartbeat) await heartbeat();
    const result = await adminClient
      .from("posts")
      .update({
        title: "Publicacao removida por solicitacao LGPD",
        description: "Conteudo removido por solicitacao LGPD.",
        location: null,
        status: "hidden",
        visibility: "community",
        image_url: null,
        metadata: {
          lgpd_erasure: {
            erased_on: erasedAt.slice(0, 10),
            content_removed: true,
          },
        },
      })
      .eq("id", postId)
      .select("id");
    if (result.error) throw new Error("post_sanitization_failed");
    const affectedIds = Array.isArray(result.data)
      ? result.data.map((row: any) => safeString(row?.id, 80)).filter(Boolean)
      : [];
    if (affectedIds.length !== 1 || affectedIds[0] !== postId) {
      throw new Error("post_sanitization_count_mismatch");
    }
    sanitized += affectedIds.length;
  }
  if (sanitized !== postIds.length) {
    throw new Error("post_sanitization_count_mismatch");
  }
  if (postIds.length) {
    if (heartbeat) await heartbeat();
    const mediaDelete = await adminClient.from("post_media").delete().in(
      "post_id",
      postIds,
    );
    if (mediaDelete.error) throw mediaDelete.error;
  }
  return sanitized;
}

function stripHelpRequestPersonalMetadata(value: unknown, receipt: JsonObject) {
  void value;
  return {
    request_kind: CANONICAL_ERASURE_KIND,
    lgpd_erasure: {
      request_id: receipt.request_id,
      subject_hash: receipt.subject_hash,
      erased_at: receipt.erased_at,
      contact_redacted: true,
      content_redacted: true,
      postcondition_version: 2,
    },
  };
}

async function redactTargetHelpRequests(
  adminClient: SupabaseClientLike,
  helpRequestIds: string[],
  emailHash: string,
  receipt: JsonObject,
) {
  const ids = uniq(helpRequestIds);
  if (!ids.length) return 0;
  const redactionReceipt = asObject(
    stripHelpRequestPersonalMetadata({}, receipt).lgpd_erasure,
  );
  const { data, error } = await adminClient.rpc(
    "kc_redact_account_help_requests",
    {
      p_help_request_ids: ids,
      p_subject_hash: emailHash,
      p_receipt: redactionReceipt,
    },
  );
  if (error) throw new Error("help_redaction_rpc_failed");
  const result = asObject(Array.isArray(data) ? data[0] : data);
  const updated = Number(result.rows_redacted);
  if (
    result.ok !== true ||
    Number(result.expected_rows) !== ids.length ||
    Number(result.found_rows) !== ids.length ||
    !Number.isSafeInteger(updated) ||
    updated !== ids.length ||
    Number(result.personal_fields_remaining) !== 0 ||
    Number(result.postcondition_version) !== 2
  ) {
    throw new Error("help_redaction_postcondition_failed");
  }
  return updated;
}

async function verifyCorePostconditions(
  adminClient: SupabaseClientLike,
  userId: string,
  email: string,
  inventory: {
    postIds: string[];
    authoredCommentIds: string[];
    authoredReportIds: string[];
    conversationIds: string[];
    targetChatMessageIds: string[];
    thirdPartyChatMessageIds: string[];
    receivedRatingIds: string[];
    receivedBlockIds: string[];
    behavioralRowIds: Record<string, string[]>;
  },
) {
  const failures: string[] = [];
  const authCheck = await adminClient.auth.admin.getUserById(userId);
  if (authCheck.data?.user) failures.push("auth_user_still_present");
  if (authCheck.error) {
    const status = Number((authCheck.error as any).status);
    const message = normalizeSearchText((authCheck.error as any).message);
    if (status !== 404 && !/not found|user not found/.test(message)) {
      failures.push(
        `auth_verification_failed:${
          safeString((authCheck.error as any).message, 180)
        }`,
      );
    }
  }
  const profile = await safeCount(
    adminClient,
    "profiles",
    (query) => query.eq("id", userId),
  );
  if (profile.error) {
    failures.push(`profile_verification_failed:${profile.error}`);
  }
  if (profile.count !== 0) failures.push("profile_still_present");

  if (inventory.postIds.length) {
    const posts = await safeRowsByIds(
      adminClient,
      "posts",
      "id,title,description,image_url,metadata",
      inventory.postIds,
    );
    if (posts.error) failures.push(`post_verification_failed:${posts.error}`);
    if (posts.rows.length !== inventory.postIds.length) {
      failures.push("inventoried_posts_not_preserved");
    }
    for (const post of posts.rows as any[]) {
      const marker = asObject(asObject(post.metadata).lgpd_erasure);
      if (
        post.image_url ||
        marker.content_removed !== true ||
        marker.request_id ||
        UUID_RE.test(JSON.stringify(post.metadata || {})) ||
        safeString(post.title, 200) !==
          "Publicacao removida por solicitacao LGPD"
      ) {
        failures.push(`post_not_sanitized:${safeString(post.id, 80)}`);
      }
    }
  }

  if (inventory.authoredCommentIds.length) {
    const comments = await safeRowsByIds(
      adminClient,
      "comments",
      "id,author_id,author_name,body",
      inventory.authoredCommentIds,
    );
    if (comments.error) {
      failures.push(`comment_verification_failed:${comments.error}`);
    }
    if (comments.rows.length !== inventory.authoredCommentIds.length) {
      failures.push("authored_comments_not_preserved");
    }
    for (const comment of comments.rows as any[]) {
      if (
        comment.author_id !== null ||
        safeString(comment.author_name, 80) !== "Conta excluida" ||
        safeString(comment.body, 120) !==
          "Comentario removido por solicitacao LGPD."
      ) {
        failures.push(`comment_not_sanitized:${safeString(comment.id, 80)}`);
      }
    }
  }

  if (inventory.authoredReportIds.length) {
    const reports = await safeRowsByIds(
      adminClient,
      "reports",
      "id,reporter_id,details",
      inventory.authoredReportIds,
    );
    if (reports.error) {
      failures.push(`report_verification_failed:${reports.error}`);
    }
    if (reports.rows.length !== inventory.authoredReportIds.length) {
      failures.push("moderation_reports_lost");
    }
    for (const report of reports.rows as any[]) {
      if (report.reporter_id !== null || report.details !== null) {
        failures.push(
          `moderation_report_not_sanitized:${safeString(report.id, 80)}`,
        );
      }
    }
  }

  if (inventory.conversationIds.length) {
    const conversations = await safeRowsByIds(
      adminClient,
      "chat_conversations",
      "id,participant_low,participant_high,last_message_sender",
      inventory.conversationIds,
    );
    if (conversations.error) {
      failures.push(
        `chat_conversation_verification_failed:${conversations.error}`,
      );
    }
    if (conversations.rows.length !== inventory.conversationIds.length) {
      failures.push("chat_conversations_not_preserved");
    }
    for (const conversation of conversations.rows as any[]) {
      if (
        conversation.participant_low === userId ||
        conversation.participant_high === userId ||
        conversation.last_message_sender === userId
      ) {
        failures.push(
          `chat_conversation_identifier_retained:${
            safeString(conversation.id, 80)
          }`,
        );
      }
    }
  }

  if (inventory.targetChatMessageIds.length) {
    const targetMessages = await safeRowsByIds(
      adminClient,
      "chat_messages",
      "id,sender_id,content,media_path,e2e_envelope,deleted_at",
      inventory.targetChatMessageIds,
    );
    if (targetMessages.error) {
      failures.push(`chat_message_verification_failed:${targetMessages.error}`);
    }
    if (targetMessages.rows.length !== inventory.targetChatMessageIds.length) {
      failures.push("target_chat_messages_not_preserved");
    }
    for (const message of targetMessages.rows as any[]) {
      if (
        message.sender_id !== null ||
        message.content !== null ||
        message.media_path !== null ||
        message.e2e_envelope !== null ||
        !message.deleted_at
      ) {
        failures.push(
          `target_chat_message_not_sanitized:${safeString(message.id, 80)}`,
        );
      }
    }
  }

  if (inventory.thirdPartyChatMessageIds.length) {
    const thirdPartyMessages = await safeRowsByIds(
      adminClient,
      "chat_messages",
      "id",
      inventory.thirdPartyChatMessageIds,
    );
    if (thirdPartyMessages.error) {
      failures.push(
        `third_party_chat_verification_failed:${thirdPartyMessages.error}`,
      );
    }
    if (
      thirdPartyMessages.rows.length !==
        inventory.thirdPartyChatMessageIds.length
    ) {
      failures.push("third_party_chat_messages_lost");
    }
  }

  if (inventory.receivedRatingIds.length) {
    const ratings = await safeRowsByIds(
      adminClient,
      "user_ratings",
      "id,target_user_id,rater_user_id",
      inventory.receivedRatingIds,
    );
    if (ratings.error) {
      failures.push(`received_ratings_verification_failed:${ratings.error}`);
    }
    if (ratings.rows.length !== inventory.receivedRatingIds.length) {
      failures.push("received_ratings_lost");
    }
    for (const rating of ratings.rows as any[]) {
      if (rating.target_user_id !== null) {
        failures.push(
          `received_rating_target_retained:${safeString(rating.id, 80)}`,
        );
      }
    }
  }

  if (inventory.receivedBlockIds.length) {
    const blocks = await safeRowsByIds(
      adminClient,
      "user_blocks",
      "id,blocker_id,blocked_id,blocked_subject_hash",
      inventory.receivedBlockIds,
    );
    if (blocks.error) {
      failures.push(`received_blocks_verification_failed:${blocks.error}`);
    }
    if (blocks.rows.length !== inventory.receivedBlockIds.length) {
      failures.push("received_blocks_lost");
    }
    for (const block of blocks.rows as any[]) {
      if (
        block.blocked_id !== null ||
        !/^[a-f0-9]{64}$/.test(safeString(block.blocked_subject_hash, 64))
      ) {
        failures.push(
          `received_block_not_pseudonymized:${safeString(block.id, 80)}`,
        );
      }
    }
  }

  for (const [table, ids] of Object.entries(inventory.behavioralRowIds)) {
    if (!ids.length) continue;
    const rows = await safeRowsByIds(adminClient, table, "id", ids);
    if (rows.error) failures.push(`${table}_verification_failed:${rows.error}`);
    if (rows.rows.length !== 0) failures.push(`${table}_rows_retained`);
  }

  const auditIdentifierScan = await readAuditIdentifierInventory(
    adminClient,
    userId,
  );
  if (!auditIdentifierScan.ok) {
    failures.push("audit_identifier_postcondition_scan_failed");
  }
  if (
    auditIdentifierScan.audit_log_rows !== 0 ||
    auditIdentifierScan.ad_campaign_audit_rows !== 0 ||
    auditIdentifierScan.hero_banner_audit_rows !== 0 ||
    auditIdentifierScan.identifiers_remaining
  ) {
    failures.push("audit_identifier_still_present");
  }
  const auditEmailScan = await readAuditEmailInventory(adminClient, email);
  if (!auditEmailScan.ok) {
    failures.push("audit_email_postcondition_scan_failed");
  }
  if (auditEmailScan.audit_log_rows !== 0 || auditEmailScan.emails_remaining) {
    failures.push("audit_personal_email_still_present");
  }

  const [reactions, readState, caduRequested, caduResolved, unitMeta] =
    await Promise.all([
      safeCount(
        adminClient,
        "chat_reactions",
        (query) => query.eq("user_id", userId),
      ),
      safeCount(
        adminClient,
        "chat_read_state",
        (query) => query.eq("user_id", userId),
      ),
      safeCount(
        adminClient,
        "cadu_institutional_source_reviews",
        (query) => query.eq("requested_by", userId),
      ),
      safeCount(
        adminClient,
        "cadu_institutional_source_reviews",
        (query) => query.eq("resolved_by", userId),
      ),
      safeCount(
        adminClient,
        "kc_unit_meta",
        (query) => query.eq("updated_by", userId),
      ),
    ]);
  for (
    const [name, check] of [
      ["chat_reactions", reactions],
      ["chat_read_state", readState],
      ["cadu_requested_by", caduRequested],
      ["cadu_resolved_by", caduResolved],
      ["kc_unit_meta_updated_by", unitMeta],
    ] as const
  ) {
    if (check.error) {
      failures.push(`${name}_verification_failed:${check.error}`);
    }
    if (check.count !== 0) failures.push(`${name}_identifier_retained`);
  }

  return {
    ok: failures.length === 0,
    failures,
    preserved: {
      posts: inventory.postIds.length,
      authored_comments: inventory.authoredCommentIds.length,
      moderation_reports: inventory.authoredReportIds.length,
      chat_conversations: inventory.conversationIds.length,
      target_chat_message_tombstones: inventory.targetChatMessageIds.length,
      third_party_chat_messages: inventory.thirdPartyChatMessageIds.length,
      received_ratings: inventory.receivedRatingIds.length,
      received_blocks: inventory.receivedBlockIds.length,
    },
  };
}

function storedCoreInventory(value: unknown) {
  const raw = asObject(value);
  const ids = (key: string) => {
    const input = raw[key];
    return Array.isArray(input)
      ? uniq(input.map((item) => safeString(item, 80)).filter(Boolean))
      : [];
  };
  const behavioral = asObject(raw.behavioralRowIds);
  return {
    postIds: ids("postIds"),
    authoredCommentIds: ids("authoredCommentIds"),
    authoredReportIds: ids("authoredReportIds"),
    conversationIds: ids("conversationIds"),
    targetChatMessageIds: ids("targetChatMessageIds"),
    thirdPartyChatMessageIds: ids("thirdPartyChatMessageIds"),
    receivedRatingIds: ids("receivedRatingIds"),
    receivedBlockIds: ids("receivedBlockIds"),
    behavioralRowIds: Object.fromEntries(
      Object.entries(behavioral).map(([table, values]) => [
        table,
        Array.isArray(values)
          ? uniq(values.map((item) => safeString(item, 80)).filter(Boolean))
          : [],
      ]),
    ),
  };
}

async function repairFailedPostconditions(
  adminClient: SupabaseClientLike,
  claim: WorkflowClaim,
  adminUserId: string,
  email: string,
) {
  const metadata = asObject(claim.request.metadata);
  const userId = extractUuidFromText(metadata.repair_target_user_id);
  const inventory = storedCoreInventory(metadata.core_inventory);
  if (!userId || !Object.keys(inventory.behavioralRowIds).length) {
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      adminUserId,
      "postconditions",
      new Error("core_repair_inventory_missing"),
      {
        auth_deleted: true,
        repair_target_user_id: userId || null,
        core_inventory: inventory,
      },
    );
    return { ok: false, request, error: "core_repair_inventory_missing" };
  }

  try {
    const heartbeat = () => renewWorkflowClaim(adminClient, claim);
    const repairedAt = new Date().toISOString();
    await sanitizeOwnedPosts(
      adminClient,
      inventory.postIds,
      repairedAt,
      heartbeat,
    );
    await sanitizeAuthoredComments(
      adminClient,
      inventory.authoredCommentIds,
      heartbeat,
    );
    await sanitizeAuthoredReports(
      adminClient,
      inventory.authoredReportIds,
      heartbeat,
    );
    await sanitizeOwnedChat(
      adminClient,
      userId,
      inventory.targetChatMessageIds,
      repairedAt,
      heartbeat,
    );
    await deleteBehavioralAndConsentData(
      adminClient,
      userId,
      inventory.behavioralRowIds,
      heartbeat,
    );
    await heartbeat();
    const auditRepair = await redactAccountAuditIdentifiers(
      adminClient,
      userId,
    );
    await heartbeat();
    const auditEmailRepair = await redactAccountAuditEmails(
      adminClient,
      email,
      safeString(claim.request.email_hash, 64),
    );

    const storage = await scanOwnedStorageObjects(
      adminClient,
      userId,
      inventory.conversationIds,
    );
    if (storage.errors.length) {
      throw new Error("core_repair_storage_scan_failed");
    }
    if (storage.paths.length) {
      const removal = await removeStoragePaths(
        adminClient,
        storage.paths,
        heartbeat,
      );
      if (removal.errors.length) {
        throw new Error("core_repair_storage_remove_failed");
      }
    }
    const storageAfter = await scanOwnedStorageObjects(
      adminClient,
      userId,
      inventory.conversationIds,
    );
    if (storageAfter.errors.length || storageAfter.paths.length) {
      throw new Error("core_repair_storage_postcondition_failed");
    }

    const postconditions = await verifyCorePostconditions(
      adminClient,
      userId,
      email,
      inventory,
    );
    if (!postconditions.ok) {
      throw new Error(
        `core_repair_postconditions_failed:${
          postconditions.failures.join("|")
        }`,
      );
    }
    const coreReceipt = {
      ...asObject(claim.request.receipt),
      ...asObject(metadata.core_receipt),
      postconditions,
      audit_identifier_repair: auditRepair,
      audit_email_repair: auditEmailRepair,
      repair_completed_at: repairedAt,
    };
    const request = await persistWorkflowMetadata(adminClient, claim, {
      ...metadata,
      core_receipt: coreReceipt,
      failure_stage: "external_processors",
      retryable: true,
      repair_completed_at: repairedAt,
    });
    return { ok: true, request, receipt: coreReceipt };
  } catch (error) {
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      adminUserId,
      "postconditions",
      error,
      {
        auth_deleted: true,
        repair_target_user_id: userId,
        core_inventory: inventory,
      },
    );
    return { ok: false, request, error: "core_repair_failed" };
  }
}

async function revokeTargetSessions(
  adminClient: SupabaseClientLike,
  userId: string,
) {
  const { data, error } = await adminClient.rpc(
    "kc_revoke_user_sessions_for_erasure",
    {
      p_user_id: userId,
    },
  );
  if (error) {
    return {
      ok: false,
      status: "failed",
      error: "session_revocation_rpc_failed",
      access_token_window: "existing_jwt_may_remain_valid_until_exp",
    };
  }
  const result = asObject(Array.isArray(data) ? data[0] : data);
  const sessionsDeleted = Number(result.sessions_deleted);
  const refreshTokensDeleted = Number(result.refresh_tokens_deleted);
  if (
    result.ok !== true ||
    !Number.isFinite(sessionsDeleted) ||
    sessionsDeleted < 0 ||
    !Number.isFinite(refreshTokensDeleted) ||
    refreshTokensDeleted < 0
  ) {
    return {
      ok: false,
      status: "failed",
      error: "session_revocation_result_invalid",
      access_token_window: "existing_jwt_may_remain_valid_until_exp",
    };
  }
  return {
    ok: true,
    status: "refresh_sessions_revoked",
    sessions_deleted: sessionsDeleted,
    refresh_tokens_deleted: refreshTokensDeleted,
    access_token_window: "existing_jwt_may_remain_valid_until_exp",
    immediate_access_token_revocation_claimed: false,
  };
}

async function banTargetAccount(
  adminClient: SupabaseClientLike,
  userId: string,
) {
  const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (error || !data?.user) {
    return {
      ok: false,
      status: "failed",
      error: error ? "account_ban_provider_failed" : "ban_result_invalid",
    };
  }
  return {
    ok: true,
    status: "login_and_refresh_blocked",
    banned_until: safeString(data.user.banned_until, 80) || null,
    access_token_window: "existing_jwt_may_remain_valid_until_exp",
    immediate_access_token_revocation_claimed: false,
  };
}

async function applyReversible(
  adminClient: SupabaseClientLike,
  opts: {
    request: JsonObject;
    helpRequest: JsonObject | null;
    userId: string | null;
    email: string;
    emailHash: string;
    adminUserId: string;
    adminSessionId: string;
    diagnostics: JsonObject;
    dataSubjectRequest: JsonObject | null;
    identityAssurance: IdentityAssurance;
  },
) {
  assertActionAllowed("apply_reversible", opts.request);
  if (safeString(opts.request.status, 80) === "pending_confirmation") {
    return {
      request: opts.request,
      email: { status: "already_sent", draft: null },
      warnings: [],
      idempotent: true,
    };
  }
  if (!opts.userId) throw new WorkflowError(404, "auth_user_not_found");
  const claim = await claimWorkflowAction(
    adminClient,
    opts.request,
    "apply_reversible",
    opts.adminUserId,
    opts.adminSessionId,
  );
  const heartbeat = () => renewWorkflowClaim(adminClient, claim);
  let claimedRequest = claim.request;
  let dataSubjectRequest = opts.dataSubjectRequest;
  const warnings: string[] = [];
  let hiddenPosts = 0;
  try {
    if (
      dataSubjectRequest &&
      ["received", "failed"].includes(dataSubjectStatus(dataSubjectRequest))
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "processing",
        opts.adminUserId,
        opts.adminSessionId,
        "status_changed",
        "Aplicando medidas reversiveis de protecao.",
      );
    }
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "cancelled"
    ) {
      throw new WorkflowError(409, "data_subject_request_cancelled");
    }
    const requestMetadata = asObject(claimedRequest.metadata);
    const reversibleSnapshot = asObject(requestMetadata.reversible_snapshot);
    let profileSnapshot = asObject(reversibleSnapshot.profile);
    if (!Object.keys(profileSnapshot).length) {
      profileSnapshot = await readProfileReversibleSnapshot(
        adminClient,
        opts.userId,
      );
      claimedRequest = await persistWorkflowMetadata(adminClient, claim, {
        ...requestMetadata,
        reversible_snapshot: {
          ...reversibleSnapshot,
          profile: profileSnapshot,
          captured_at: new Date().toISOString(),
        },
      });
    }
    await heartbeat();
    await updateProfileReversible(adminClient, opts.userId, profileSnapshot);
    await heartbeat();
    hiddenPosts = await updateOwnedPostsReversible(
      adminClient,
      opts.userId,
      String(claimedRequest.id),
    );
  } catch (error) {
    if (
      dataSubjectRequest &&
      ["processing", "pending_confirmation"].includes(
        dataSubjectStatus(dataSubjectRequest),
      )
    ) {
      try {
        dataSubjectRequest = await transitionDataSubjectRequest(
          adminClient,
          dataSubjectRequest,
          "failed",
          opts.adminUserId,
          opts.adminSessionId,
          "processing_error",
          "Nao foi possivel concluir esta etapa. A equipe revisara o pedido.",
        );
      } catch (_syncError) {
        console.error("[kc-account-erasure] dsr_failure_sync_failed");
      }
    }
    const failedRequest = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "apply_reversible",
      error,
    );
    throw new WorkflowError(500, "reversible_step_failed", {
      request_id: failedRequest.id,
    });
  }

  const emailDraft = buildConfirmationEmail(opts.email);
  let emailStatus = "not_sent";
  try {
    await sendEmail({
      to: opts.email,
      subject: emailDraft.subject,
      html: emailDraft.html,
      text: emailDraft.text,
    });
    emailStatus = "sent";
  } catch (error) {
    emailStatus = "draft_only";
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  const nextStatus = emailStatus === "sent"
    ? "pending_confirmation"
    : "reversible_applied";
  const nowIso = new Date().toISOString();
  if (
    emailStatus === "sent" &&
    dataSubjectRequest &&
    dataSubjectStatus(dataSubjectRequest) !== "pending_confirmation"
  ) {
    dataSubjectRequest = await transitionDataSubjectRequest(
      adminClient,
      dataSubjectRequest,
      "pending_confirmation",
      opts.adminUserId,
      opts.adminSessionId,
      "status_changed",
      "Aguardando confirmacao do titular.",
    );
  }
  const nextMetadata = {
    lgpd_erasure: {
      request_id: claimedRequest.id,
      email_hash: opts.emailHash,
      stage: nextStatus,
      confirmation_email_status: emailStatus,
      requires_manual_delivery: emailStatus !== "sent",
      identity_assurance_source: opts.identityAssurance.source,
      updated_at: nowIso,
    },
  };
  await mergeHelpRequestMetadata(
    adminClient,
    opts.helpRequest,
    nextMetadata,
    "in_progress",
  );

  const claimedMetadata = asObject(claimedRequest.metadata);
  const updatePayload: JsonObject = {
    status: nextStatus,
    reversible_applied_at: nowIso,
    counts: opts.diagnostics.counts || {},
    metadata: {
      ...claimedMetadata,
      action_claim: null,
      confirmation_email_status: emailStatus,
      confirmation_delivery: emailStatus === "sent"
        ? {
          status: "sent",
          channel: "automatic_smtp",
          sent_at: nowIso,
          recorded_by: opts.adminUserId,
        }
        : {
          status: "draft_only",
          channel: "manual_required",
          failed_at: nowIso,
        },
      hidden_posts: hiddenPosts,
      identity_assurance: opts.identityAssurance,
      warnings,
      failure_stage: emailStatus === "sent" ? null : "confirmation_delivery",
      retryable: emailStatus !== "sent",
    },
  };
  if (emailStatus === "sent") updatePayload.confirmation_requested_at = nowIso;
  const data = await updateClaimedWorkflow(
    adminClient,
    claim,
    updatePayload,
    true,
  );

  await insertAudit(
    adminClient,
    "lgpd_erasure_reversible_applied",
    String(claimedRequest.id),
    opts.adminUserId,
    {
      email_hash: opts.emailHash,
      user_found: Boolean(opts.userId),
      hidden_posts: hiddenPosts,
      identity_assurance_source: opts.identityAssurance.source,
      confirmation_email_status: emailStatus,
      warnings,
    },
  );

  return {
    request: data,
    data_subject_request: dataSubjectRequest,
    email: { status: emailStatus, draft: emailDraft },
    warnings,
    requires_manual_delivery: emailStatus !== "sent",
  };
}

async function recordConfirmationDelivery(
  adminClient: SupabaseClientLike,
  opts: {
    request: JsonObject;
    helpRequest: JsonObject | null;
    adminUserId: string;
    adminSessionId: string;
    evidence: unknown;
    dataSubjectRequest: JsonObject | null;
  },
) {
  assertActionAllowed("record_confirmation_delivery", opts.request);
  if (safeString(opts.request.status, 80) === "pending_confirmation") {
    return { request: opts.request, idempotent: true };
  }
  const evidence = await buildEvidence(opts.evidence, {
    kind: "delivery",
    actorId: opts.adminUserId,
    allowedChannels: ["manual_email", "support_mailbox"],
    timestampField: "delivered_at",
  });
  const claim = await claimWorkflowAction(
    adminClient,
    opts.request,
    "record_confirmation_delivery",
    opts.adminUserId,
    opts.adminSessionId,
  );
  await renewWorkflowClaim(adminClient, claim);
  const nowIso = new Date().toISOString();
  let dataSubjectRequest = opts.dataSubjectRequest;
  if (
    dataSubjectRequest &&
    dataSubjectStatus(dataSubjectRequest) !== "pending_confirmation"
  ) {
    dataSubjectRequest = await transitionDataSubjectThroughProcessing(
      adminClient,
      dataSubjectRequest,
      "pending_confirmation",
      opts.adminUserId,
      opts.adminSessionId,
      "Aguardando confirmacao do titular.",
    );
  }
  const metadata = {
    ...asObject(claim.request.metadata),
    action_claim: null,
    confirmation_email_status: "sent_manual",
    confirmation_delivery: {
      ...evidence,
      status: "sent_manual",
    },
    failure_stage: null,
    retryable: false,
  };
  const data = await updateClaimedWorkflow(
    adminClient,
    claim,
    {
      status: "pending_confirmation",
      confirmation_requested_at: (evidence as any).event_at || nowIso,
      processed_by: opts.adminUserId,
      metadata,
    },
    true,
  );
  await mergeHelpRequestMetadata(adminClient, opts.helpRequest, {
    lgpd_erasure: {
      ...asObject(asObject(opts.helpRequest?.metadata).lgpd_erasure),
      request_id: claim.request.id,
      stage: "pending_confirmation",
      confirmation_email_status: "sent_manual",
      updated_at: nowIso,
    },
  }, "in_progress");
  await insertAudit(
    adminClient,
    "lgpd_erasure_confirmation_delivery_recorded",
    String(claim.request.id),
    opts.adminUserId,
    {
      channel: evidence.channel,
      reference_hash: evidence.reference_hash,
      event_at: evidence.event_at,
    },
  );
  return { request: data, evidence, data_subject_request: dataSubjectRequest };
}

async function cancelReversible(
  adminClient: SupabaseClientLike,
  opts: {
    request: JsonObject;
    helpRequest: JsonObject | null;
    userId: string | null;
    adminUserId: string;
    adminSessionId: string;
    reason: string;
    dataSubjectRequest: JsonObject | null;
  },
) {
  assertActionAllowed("cancel_reversible", opts.request);
  if (safeString(opts.request.status, 80) === "cancelled") {
    return { request: opts.request, idempotent: true };
  }
  if (opts.reason.length < 8) {
    throw new WorkflowError(400, "cancellation_reason_required");
  }
  const claim = await claimWorkflowAction(
    adminClient,
    opts.request,
    "cancel_reversible",
    opts.adminUserId,
    opts.adminSessionId,
  );
  await renewWorkflowClaim(adminClient, claim);
  let restoration = { restored_posts: 0, profile_restored: false };
  if (safeString(opts.request.status, 80) !== "diagnosed") {
    restoration = await restoreReversibleChanges(
      adminClient,
      claim.request,
      opts.userId,
    );
  }
  const reasonHash = await sha256Hex(opts.reason);
  const nowIso = new Date().toISOString();
  let dataSubjectRequest = opts.dataSubjectRequest;
  if (
    dataSubjectRequest && dataSubjectStatus(dataSubjectRequest) !== "cancelled"
  ) {
    dataSubjectRequest = await transitionDataSubjectRequest(
      adminClient,
      dataSubjectRequest,
      "cancelled",
      opts.adminUserId,
      opts.adminSessionId,
      "cancelled",
      "Solicitacao cancelada e medidas reversiveis restauradas.",
    );
  }
  const metadata = {
    ...asObject(claim.request.metadata),
    action_claim: null,
    cancelled: {
      reason_hash: reasonHash,
      cancelled_at: nowIso,
      cancelled_by: opts.adminUserId,
      ...restoration,
    },
    failure_stage: null,
    retryable: false,
  };
  const data = await updateClaimedWorkflow(
    adminClient,
    claim,
    { status: "cancelled", processed_by: opts.adminUserId, metadata },
    true,
  );
  await mergeHelpRequestMetadata(adminClient, opts.helpRequest, {
    reversible_restore_required: false,
    cancellation_requested: false,
    lgpd_erasure: {
      request_id: claim.request.id,
      stage: "cancelled",
      cancelled_at: nowIso,
      reason_hash: reasonHash,
    },
  }, "resolved");
  await insertAudit(
    adminClient,
    "lgpd_erasure_cancelled",
    String(claim.request.id),
    opts.adminUserId,
    {
      reason_hash: reasonHash,
      ...restoration,
    },
  );
  return {
    request: data,
    restoration,
    data_subject_request: dataSubjectRequest,
  };
}

async function eraseConfirmed(
  adminClient: SupabaseClientLike,
  opts: {
    request: JsonObject;
    helpRequest: JsonObject | null;
    userId: string | null;
    email: string;
    emailHash: string;
    adminUserId: string;
    adminSessionId: string;
    confirmationPhrase: string;
    confirmationEvidence: unknown;
    diagnostics: JsonObject;
    dataSubjectRequest: JsonObject | null;
    identityAssurance: IdentityAssurance;
    copyGateDecision: unknown;
  },
) {
  assertActionAllowed("erase_confirmed", opts.request);
  if (safeString(opts.request.status, 80) === "erased") {
    return {
      ok: true,
      request: opts.request,
      receipt: asObject(opts.request.receipt),
      idempotent: true,
    };
  }
  const expected = `EXCLUIR ${opts.email}`;
  if (opts.confirmationPhrase !== expected) {
    return {
      ok: false,
      status: 409,
      error: "confirmation_phrase_mismatch",
      expected,
    };
  }
  if (!opts.userId) {
    return { ok: false, status: 404, error: "auth_user_not_found" };
  }
  assertNoErasureBlockers(opts.diagnostics);

  const requestMetadata = asObject(opts.request.metadata);
  const deliveryStatus = safeString(
    requestMetadata.confirmation_email_status,
    80,
  );
  if (
    !["sent", "sent_manual"].includes(deliveryStatus) ||
    !opts.request.confirmation_requested_at
  ) {
    return {
      ok: false,
      status: 409,
      error: "confirmation_delivery_not_proven",
    };
  }
  const confirmationEvidence = await buildEvidence(opts.confirmationEvidence, {
    kind: "confirmation",
    actorId: opts.adminUserId,
    allowedChannels: ["email_reply", "support_mailbox_reply"],
    timestampField: "received_at",
  });
  const confirmationRequestedAt = Date.parse(
    safeString(opts.request.confirmation_requested_at, 80),
  );
  if (
    Number.isFinite(confirmationRequestedAt) &&
    Date.parse(confirmationEvidence.event_at) <
      confirmationRequestedAt - (5 * 60 * 1000)
  ) {
    return { ok: false, status: 409, error: "confirmation_predates_delivery" };
  }

  await recordPreErasureCopyDecision(
    adminClient,
    String(opts.request.id),
    opts.adminUserId,
    opts.adminSessionId,
    opts.copyGateDecision,
  );
  const preErasureCopyGate = await readPreErasureCopyGate(
    adminClient,
    String(opts.request.id),
  );
  if (preErasureCopyGate.ok !== true) {
    return {
      ok: false,
      status: 409,
      error: safeString(preErasureCopyGate.error, 120).toLowerCase() ||
        "erasure_copy_gate_failed",
      copy_gate: preErasureCopyGate,
    };
  }

  const claim = await claimWorkflowAction(
    adminClient,
    opts.request,
    "erase_confirmed",
    opts.adminUserId,
    opts.adminSessionId,
    opts.dataSubjectRequest,
  );
  const heartbeat = () => renewWorkflowClaim(adminClient, claim);
  let claimedRequest = claim.request;
  let dataSubjectRequest = opts.dataSubjectRequest;
  const confirmedAt = new Date().toISOString();
  const dataSubjectTransitioned = Boolean(
    dataSubjectRequest &&
      claim.dataSubjectRequestStatus === "processing",
  );
  if (dataSubjectRequest && claim.dataSubjectRequestStatus) {
    dataSubjectRequest = {
      ...dataSubjectRequest,
      status: claim.dataSubjectRequestStatus,
    };
  }
  try {
    // The v2 database claim has already moved the linked DSR to processing in
    // the same transaction that acquired the workflow lease and wrote closure.
    // If owner cancellation won the row lock, the entire claim was rolled back.
    claimedRequest = await updateClaimedWorkflow(adminClient, claim, {
      status: "confirmed",
      confirmed_at: confirmationEvidence.event_at,
      confirmation_channel: confirmationEvidence.channel,
      confirmation_evidence_hash: confirmationEvidence.reference_hash,
      confirmation_received_at: confirmationEvidence.event_at,
      confirmation_recorded_by: opts.adminUserId,
      processed_by: opts.adminUserId,
      metadata: {
        ...asObject(claimedRequest.metadata),
        confirmation_evidence: confirmationEvidence,
        identity_assurance: opts.identityAssurance,
        pre_erasure_copy_gate: preErasureCopyGate,
      },
    });
  } catch (error) {
    if (
      dataSubjectTransitioned &&
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      try {
        dataSubjectRequest = await transitionDataSubjectRequest(
          adminClient,
          dataSubjectRequest,
          "failed",
          opts.adminUserId,
          opts.adminSessionId,
          "processing_error",
          "A confirmacao nao foi consolidada. Nenhum dado foi excluido.",
        );
      } catch (_syncError) {
        console.error("[kc-account-erasure] dsr_confirmation_rollback_failed");
      }
    }
    await releaseWorkflowClaim(adminClient, claim, "confirmation_cas");
    throw error;
  }
  await insertAudit(
    adminClient,
    "lgpd_erasure_confirmed",
    String(claimedRequest.id),
    opts.adminUserId,
    {
      subject_hash: opts.emailHash,
      confirmation_reference_hash: confirmationEvidence.reference_hash,
      confirmation_channel: confirmationEvidence.channel,
    },
  );

  let operationalDiagnostics = opts.diagnostics;
  let inventory = erasureInventoryFromDiagnostics(operationalDiagnostics);
  let {
    postIds,
    authoredCommentIds,
    authoredReportIds,
    conversationIds,
    targetChatMessageIds,
    thirdPartyChatMessageIds,
    receivedRatingIds,
    receivedBlockIds,
  } = inventory;
  const initialStorageScan = await collectStoragePaths(
    adminClient,
    opts.userId,
    postIds,
    conversationIds,
  );
  if (initialStorageScan.errors.length) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "failed",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "Falha no inventario antes da exclusao. A equipe revisara o pedido.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "storage_cleanup",
      new Error(initialStorageScan.errors.join(" | ")),
      {
        confirmation_evidence: confirmationEvidence,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "storage_inventory_incomplete",
      request,
      errors: initialStorageScan.errors,
      data_subject_request: dataSubjectRequest,
    };
  }

  await heartbeat();
  const accountBan = await banTargetAccount(adminClient, opts.userId);
  if (!accountBan.ok) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "failed",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "Falha antes da exclusao da conta. A equipe revisara o pedido.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "account_ban",
      new Error(accountBan.error || "account_ban_failed"),
      { confirmation_evidence: confirmationEvidence, account_ban: accountBan },
    );
    return {
      ok: false,
      status: 409,
      error: "account_ban_failed",
      request,
      data_subject_request: dataSubjectRequest,
    };
  }

  await heartbeat();
  const sessionRevocation = await revokeTargetSessions(
    adminClient,
    opts.userId,
  );
  if (!sessionRevocation.ok) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A conta foi restringida, mas a exclusao requer revisao.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "session_revocation",
      new Error(sessionRevocation.error || "session_revocation_failed"),
      {
        confirmation_evidence: confirmationEvidence,
        account_ban: accountBan,
        session_revocation: sessionRevocation,
        irreversible_effects_applied: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "session_revocation_failed",
      request,
      data_subject_request: dataSubjectRequest,
    };
  }

  try {
    // The database write barrier keys off the now-revoked Auth session. Rebuild
    // every row identifier only after that barrier is active; the preflight
    // snapshot is informational and must never be the sole cleanup inventory.
    operationalDiagnostics = await buildDiagnostics(
      adminClient,
      opts.userId,
      opts.email,
      safeString(opts.helpRequest?.id, 80) || null,
    );
    assertNoErasureBlockers(operationalDiagnostics);
    inventory = erasureInventoryFromDiagnostics(operationalDiagnostics);
    ({
      postIds,
      authoredCommentIds,
      authoredReportIds,
      conversationIds,
      targetChatMessageIds,
      thirdPartyChatMessageIds,
      receivedRatingIds,
      receivedBlockIds,
    } = inventory);
  } catch (error) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A conta foi restringida, mas o inventario bloqueado requer revisao.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "database_quiescence",
      error,
      {
        confirmation_evidence: confirmationEvidence,
        account_ban: accountBan,
        session_revocation: sessionRevocation,
        irreversible_effects_applied: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "database_quiescence_verification_failed",
      request,
      data_subject_request: dataSubjectRequest,
    };
  }

  const lockedStorageScan = await collectStoragePaths(
    adminClient,
    opts.userId,
    postIds,
    conversationIds,
  );
  if (lockedStorageScan.errors.length) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A conta foi restringida, mas o inventario requer revisao.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "storage_cleanup",
      new Error(lockedStorageScan.errors.join(" | ")),
      {
        confirmation_evidence: confirmationEvidence,
        account_ban: accountBan,
        session_revocation: sessionRevocation,
        irreversible_effects_applied: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "storage_inventory_incomplete",
      request,
      errors: lockedStorageScan.errors,
      data_subject_request: dataSubjectRequest,
    };
  }
  const storagePaths = uniqStorageRefs([
    ...initialStorageScan.paths,
    ...lockedStorageScan.paths,
  ]);
  const storageCleanup = await removeStoragePaths(
    adminClient,
    storagePaths,
    heartbeat,
  );
  if (storageCleanup.errors.length) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A exclusao foi parcialmente executada e requer revisao.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "storage_cleanup",
      new Error(storageCleanup.errors.join(" | ")),
      {
        confirmation_evidence: confirmationEvidence,
        storage_removed_count: storageCleanup.removed.length,
        storage_cleanup_errors: storageCleanup.errors,
        account_ban: accountBan,
        session_revocation: sessionRevocation,
        irreversible_effects_applied: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "storage_cleanup_failed",
      request,
      storage_cleanup: storageCleanup,
      data_subject_request: dataSubjectRequest,
    };
  }

  const previousExportArtifactCleanup = dataExportArtifactCleanupSummary(
    asObject(claimedRequest.metadata).data_export_artifact_cleanup,
  );
  let exportArtifactCleanup = previousExportArtifactCleanup;
  try {
    const currentExportArtifactCleanup =
      await purgeDataExportArtifactsForErasure(
        adminClient,
        opts.userId,
        String(claimedRequest.id),
        heartbeat,
      );
    exportArtifactCleanup = mergeDataExportArtifactCleanup(
      previousExportArtifactCleanup,
      currentExportArtifactCleanup,
    );
    claimedRequest = await updateClaimedWorkflow(
      adminClient,
      claim,
      {
        metadata: {
          ...asObject(claimedRequest.metadata),
          data_export_artifact_cleanup: exportArtifactCleanup,
        },
      },
    );
  } catch (error) {
    const currentFailure = error instanceof WorkflowError
      ? asObject(error.details)
      : {};
    exportArtifactCleanup = mergeDataExportArtifactCleanup(
      previousExportArtifactCleanup,
      currentFailure,
    );
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A conta foi restringida, mas os arquivos de exportacao exigem nova tentativa.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "export_artifact_purge",
      error,
      {
        confirmation_evidence: confirmationEvidence,
        storage_removed_count: storageCleanup.removed.length,
        data_export_artifact_cleanup: exportArtifactCleanup,
        account_ban: accountBan,
        session_revocation: sessionRevocation,
        irreversible_effects_applied: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: error instanceof WorkflowError
        ? error.code
        : "data_export_artifact_purge_failed",
      request,
      storage_cleanup: storageCleanup,
      data_export_artifact_cleanup: exportArtifactCleanup,
      data_subject_request: dataSubjectRequest,
    };
  }

  let sanitizedPosts = 0;
  let sanitizedComments = 0;
  let sanitizedReports = 0;
  let sanitizedChat = { messages_sanitized: 0 };
  let deletedBehavioralData: Record<string, number> = {};
  let sanitizedAuditIdentifiers = {
    audit_log_rows: 0,
    ad_campaign_audit_rows: 0,
    hero_banner_audit_rows: 0,
    inventory_digest: "",
    identifiers_remaining: false,
    events_preserved: true,
  };
  let sanitizedAuditEmails = {
    audit_log_rows: 0,
    inventory_digest: "",
    emails_remaining: false,
    events_preserved: true,
  };
  try {
    await heartbeat();
    sanitizedPosts = await sanitizeOwnedPosts(
      adminClient,
      postIds,
      confirmedAt,
      heartbeat,
    );
    sanitizedComments = await sanitizeAuthoredComments(
      adminClient,
      authoredCommentIds,
      heartbeat,
    );
    sanitizedReports = await sanitizeAuthoredReports(
      adminClient,
      authoredReportIds,
      heartbeat,
    );
    sanitizedChat = await sanitizeOwnedChat(
      adminClient,
      opts.userId,
      targetChatMessageIds,
      confirmedAt,
      heartbeat,
    );
    deletedBehavioralData = await deleteBehavioralAndConsentData(
      adminClient,
      opts.userId,
      inventory.behavioralRowIds,
      heartbeat,
    );
    await heartbeat();
    sanitizedAuditIdentifiers = await redactAccountAuditIdentifiers(
      adminClient,
      opts.userId,
    );
    await heartbeat();
    sanitizedAuditEmails = await redactAccountAuditEmails(
      adminClient,
      opts.email,
      opts.emailHash,
    );
    await heartbeat();
    const inviteDelete = await adminClient.from("kc_invited_emails").delete()
      .eq("email", opts.email);
    if (inviteDelete.error) throw inviteDelete.error;
  } catch (error) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A exclusao foi parcialmente executada e requer revisao.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "database_cleanup",
      error,
      {
        confirmation_evidence: confirmationEvidence,
        storage_removed_count: storageCleanup.removed.length,
        posts_sanitized: sanitizedPosts,
        comments_sanitized: sanitizedComments,
        reports_sanitized: sanitizedReports,
        chat_messages_sanitized: sanitizedChat.messages_sanitized,
        behavioral_and_consent_rows_deleted: deletedBehavioralData,
        audit_identifiers_sanitized: sanitizedAuditIdentifiers,
        audit_emails_sanitized: sanitizedAuditEmails,
        data_export_artifact_cleanup: exportArtifactCleanup,
        core_inventory: inventory,
        repair_target_user_id: opts.userId,
        account_ban: accountBan,
        session_revocation: sessionRevocation,
        irreversible_effects_applied: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "database_cleanup_failed",
      request,
      data_subject_request: dataSubjectRequest,
    };
  }

  const lateStorageScan = await scanOwnedStorageObjects(
    adminClient,
    opts.userId,
    conversationIds,
  );
  if (lateStorageScan.errors.length) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A exclusao foi parcialmente executada e requer revisao do armazenamento.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "storage_cleanup",
      new Error(lateStorageScan.errors.join(" | ")),
      {
        confirmation_evidence: confirmationEvidence,
        account_ban: accountBan,
        session_revocation: sessionRevocation,
        storage_removed_count: storageCleanup.removed.length,
        irreversible_effects_applied: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "storage_verification_failed",
      request,
      errors: lateStorageScan.errors,
      data_subject_request: dataSubjectRequest,
    };
  }
  if (lateStorageScan.paths.length) {
    const lateRemoval = await removeStoragePaths(
      adminClient,
      lateStorageScan.paths,
      heartbeat,
    );
    storageCleanup.removed.push(...lateRemoval.removed);
    storageCleanup.errors.push(...lateRemoval.errors);
    const finalStorageScan = await scanOwnedStorageObjects(
      adminClient,
      opts.userId,
      conversationIds,
    );
    if (
      storageCleanup.errors.length ||
      finalStorageScan.errors.length ||
      finalStorageScan.paths.length
    ) {
      if (
        dataSubjectRequest &&
        dataSubjectStatus(dataSubjectRequest) === "processing"
      ) {
        dataSubjectRequest = await transitionDataSubjectRequest(
          adminClient,
          dataSubjectRequest,
          "partial_failure",
          opts.adminUserId,
          opts.adminSessionId,
          "processing_error",
          "A exclusao foi parcialmente executada e requer revisao do armazenamento.",
        );
      }
      const verificationErrors = [
        ...storageCleanup.errors,
        ...finalStorageScan.errors,
        ...(finalStorageScan.paths.length
          ? ["storage_objects_still_present"]
          : []),
      ];
      const request = await markWorkflowFailure(
        adminClient,
        claim,
        opts.adminUserId,
        "storage_cleanup",
        new Error(verificationErrors.join(" | ")),
        {
          confirmation_evidence: confirmationEvidence,
          account_ban: accountBan,
          session_revocation: sessionRevocation,
          storage_removed_count: storageCleanup.removed.length,
          data_export_artifact_cleanup: exportArtifactCleanup,
          irreversible_effects_applied: true,
        },
      );
      return {
        ok: false,
        status: 409,
        error: "storage_verification_failed",
        request,
        errors: verificationErrors,
        data_subject_request: dataSubjectRequest,
      };
    }
  }

  const authDeleteCheckpoint = {
    schema_version: 1,
    confirmation_reference_hash: confirmationEvidence.reference_hash,
    counts: operationalDiagnostics.counts || {},
    storage_removed_count: storageCleanup.removed.length,
    posts_sanitized: sanitizedPosts,
    comments_sanitized: sanitizedComments,
    reports_sanitized: sanitizedReports,
    chat_messages_sanitized: sanitizedChat.messages_sanitized,
    behavioral_and_consent_rows_deleted: deletedBehavioralData,
    audit_identifiers_sanitized: sanitizedAuditIdentifiers,
    audit_emails_sanitized: sanitizedAuditEmails,
    data_export_artifact_cleanup: exportArtifactCleanup,
    account_ban: accountBan,
    session_revocation: sessionRevocation,
  };
  claimedRequest = await checkpointAuthDeleteIntent(
    adminClient,
    claim,
    opts.userId,
    inventory,
    authDeleteCheckpoint,
  );

  // Do not invoke the admin sign-out API with a user UUID: Supabase expects a target JWT.
  // deleteUser is an external, non-transactional boundary. Its response alone cannot
  // distinguish "not committed" from "committed but the response was lost", so every
  // attempt is followed by getUserById and the database-bound checkpoint proof.
  await heartbeat();
  let deleteCallReportedError = false;
  try {
    // The second argument is deliberately false: this LGPD path requires the
    // Auth row to be permanently removed, never merely soft-deleted.
    const deleteResult = await adminClient.auth.admin.deleteUser(
      opts.userId,
      false,
    );
    deleteCallReportedError = Boolean(deleteResult.error);
  } catch (_error) {
    deleteCallReportedError = true;
  }
  const authInspection = await inspectAuthUserById(adminClient, opts.userId);
  const authRecoveryProof = await readAuthDeleteRecoveryStatus(
    adminClient,
    String(claimedRequest.id),
  );
  const authAbsentProven = authInspection.state === "absent" &&
    authRecoveryProof.ok &&
    authRecoveryProof.targetUserId === opts.userId &&
    authRecoveryProof.identityVerified &&
    authRecoveryProof.closureVerified &&
    authRecoveryProof.coreInventoryReady &&
    authRecoveryProof.authUserPresent === false;

  if (!authAbsentProven) {
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A exclusao foi parcialmente executada e requer revisao.",
      );
    }
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "database_cleanup",
      new WorkflowError(
        authInspection.state === "present" && authRecoveryProof.authUserPresent
          ? 409
          : 503,
        authInspection.state === "present" && authRecoveryProof.authUserPresent
          ? "auth_delete_failed"
          : "auth_delete_outcome_unknown",
      ),
      {
        confirmation_evidence: confirmationEvidence,
        storage_removed_count: storageCleanup.removed.length,
        posts_sanitized: sanitizedPosts,
        comments_sanitized: sanitizedComments,
        reports_sanitized: sanitizedReports,
        chat_messages_sanitized: sanitizedChat.messages_sanitized,
        behavioral_and_consent_rows_deleted: deletedBehavioralData,
        audit_identifiers_sanitized: sanitizedAuditIdentifiers,
        data_export_artifact_cleanup: exportArtifactCleanup,
        core_inventory: inventory,
        repair_target_user_id: opts.userId,
        auth_delete_provider_reported_error: deleteCallReportedError,
        account_ban: accountBan,
        session_revocation: sessionRevocation,
        irreversible_effects_applied: true,
      },
    );
    const outcomeUnknown = authInspection.state !== "present" ||
      authRecoveryProof.authUserPresent !== true;
    return {
      ok: false,
      status: outcomeUnknown ? 503 : 409,
      error: outcomeUnknown
        ? "auth_delete_outcome_unknown"
        : "auth_delete_failed",
      request,
      retryable: true,
      data_subject_request: dataSubjectRequest,
    };
  }
  // A provider error is intentionally ignored only after both getUserById and
  // PostgreSQL agree that the exact checkpoint target is absent.
  claimedRequest = await confirmAuthDeleteAbsence(adminClient, claim);

  const postconditions = await verifyCorePostconditions(
    adminClient,
    opts.userId,
    opts.email,
    inventory,
  );
  const erasedAt = new Date().toISOString();
  const receipt = {
    request_id: claimedRequest.id,
    protocol: safeString(dataSubjectRequest?.protocol, 120) || null,
    subject_hash: opts.emailHash,
    result: "core_erased_pending_external_review",
    erased_at: erasedAt,
    counts: operationalDiagnostics.counts || {},
    posts_sanitized: sanitizedPosts,
    comments_sanitized: sanitizedComments,
    reports_sanitized: sanitizedReports,
    chat_messages_sanitized: sanitizedChat.messages_sanitized,
    behavioral_and_consent_rows_deleted: deletedBehavioralData,
    audit_identifiers_sanitized: sanitizedAuditIdentifiers,
    audit_emails_sanitized: sanitizedAuditEmails,
    data_export_artifact_cleanup: exportArtifactCleanup,
    storage_removed_count: storageCleanup.removed.length,
    storage_cleanup_errors: [],
    auth_delete_outcome: deleteCallReportedError
      ? "provider_error_absence_proven"
      : "provider_success_absence_proven",
    postconditions,
    session_control: {
      pre_delete_account_restriction: accountBan.status,
      banned_until: accountBan.banned_until,
      refresh_sessions: sessionRevocation.status,
      sessions_deleted: sessionRevocation.sessions_deleted,
      refresh_tokens_deleted: sessionRevocation.refresh_tokens_deleted,
      access_token_window: sessionRevocation.access_token_window,
      immediate_access_token_revocation_claimed:
        sessionRevocation.immediate_access_token_revocation_claimed,
      sensitive_operations_must_validate_session_or_user: true,
    },
    external_processors: operationalDiagnostics.external_processors ||
      buildExternalProcessorMatrix(),
  };
  if (!postconditions.ok) {
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "postconditions",
      new Error(postconditions.failures.join(" | ")),
      {
        auth_deleted: true,
        confirmation_evidence: confirmationEvidence,
        core_receipt: receipt,
        core_inventory: inventory,
        repair_target_user_id: opts.userId,
      },
    );
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) === "processing"
    ) {
      dataSubjectRequest = await transitionDataSubjectRequest(
        adminClient,
        dataSubjectRequest,
        "partial_failure",
        opts.adminUserId,
        opts.adminSessionId,
        "processing_error",
        "A conta foi removida, mas algumas verificacoes requerem revisao.",
      );
    }
    return {
      ok: false,
      status: 409,
      error: "erasure_postconditions_failed",
      request,
      receipt,
      data_subject_request: dataSubjectRequest,
    };
  }

  const externalProcessors = Array.isArray(receipt.external_processors)
    ? receipt.external_processors
    : buildExternalProcessorMatrix();
  const helpRequestIds =
    Array.isArray((operationalDiagnostics as any).help_request_ids)
      ? (operationalDiagnostics as any).help_request_ids
      : (opts.helpRequest?.id ? [String(opts.helpRequest.id)] : []);
  // No external provider is silently declared complete. The core deletion is done,
  // but the workflow remains retryable/partial until an admin records provider outcomes.
  if (
    dataSubjectRequest &&
    dataSubjectStatus(dataSubjectRequest) !== "partial_failure"
  ) {
    dataSubjectRequest = await transitionDataSubjectRequest(
      adminClient,
      dataSubjectRequest,
      "partial_failure",
      opts.adminUserId,
      opts.adminSessionId,
      "status_changed",
      "Nucleo da conta removido; revisao de provedores em andamento.",
    );
  }
  const data = await updateClaimedWorkflow(
    adminClient,
    claim,
    {
      status: "partial_failure",
      confirmed_at: confirmationEvidence.event_at,
      receipt,
      counts: operationalDiagnostics.counts || {},
      auth_delete_state: null,
      auth_delete_intent_token: null,
      auth_delete_target_user_id: null,
      auth_delete_intent_at: null,
      auth_delete_confirmed_at: null,
      metadata: {
        ...asObject(claimedRequest.metadata),
        auth_deleted: true,
        core_erased_at: erasedAt,
        confirmation_evidence: confirmationEvidence,
        failure_stage: "external_processors",
        retryable: true,
        help_request_ids: helpRequestIds,
        external_processors: externalProcessors,
        storage_cleanup_errors: [],
        auth_delete_checkpoint: null,
        core_inventory: null,
        repair_target_user_id: null,
      },
    },
    true,
  );

  await insertAudit(
    adminClient,
    "lgpd_erasure_core_completed",
    String(claimedRequest.id),
    opts.adminUserId,
    {
      subject_hash: opts.emailHash,
      counts: operationalDiagnostics.counts || {},
      confirmation_reference_hash: confirmationEvidence.reference_hash,
      storage_removed_count: storageCleanup.removed.length,
      posts_sanitized: sanitizedPosts,
      comments_sanitized: sanitizedComments,
      reports_sanitized: sanitizedReports,
      chat_messages_sanitized: sanitizedChat.messages_sanitized,
      data_export_artifacts_purged: exportArtifactCleanup.purged_count,
      data_export_storage_objects_removed:
        exportArtifactCleanup.storage_objects_removed,
      external_follow_up_required: true,
    },
  );

  return {
    ok: false,
    status: 202,
    error: "external_processor_follow_up_required",
    request: data,
    receipt,
    storage_cleanup: storageCleanup,
    external_processors: externalProcessors,
    data_subject_request: dataSubjectRequest,
  };
}

async function retryFinalize(
  adminClient: SupabaseClientLike,
  opts: {
    request: JsonObject;
    helpRequest: JsonObject | null;
    email: string;
    emailHash: string;
    adminUserId: string;
    adminSessionId: string;
    providerEvidence: unknown;
    completionDeliveryEvidence: unknown;
    dataSubjectRequest: JsonObject | null;
  },
) {
  assertActionAllowed("retry_finalize", opts.request);
  const requestMetadata = asObject(opts.request.metadata);
  if (requestMetadata.auth_deleted !== true) {
    throw new WorkflowError(409, "core_erasure_not_completed");
  }
  if (safeString(opts.request.status, 80) === "erased") {
    const rawDeliveryEvidence = asObject(opts.completionDeliveryEvidence);
    const manualDeliveryRequested = Boolean(
      safeString(rawDeliveryEvidence.reference, 500) ||
        safeString(rawDeliveryEvidence.delivered_at, 80) ||
        rawDeliveryEvidence.attested === true,
    );
    const claim = await claimWorkflowAction(
      adminClient,
      opts.request,
      "retry_finalize",
      opts.adminUserId,
      opts.adminSessionId,
    );
    let dataSubjectRequest = opts.dataSubjectRequest;
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) !== "completed"
    ) {
      try {
        dataSubjectRequest = await transitionDataSubjectThroughProcessing(
          adminClient,
          dataSubjectRequest,
          "completed",
          opts.adminUserId,
          opts.adminSessionId,
          "Solicitacao de exclusao concluida.",
        );
      } catch (_error) {
        await releaseWorkflowClaim(
          adminClient,
          claim,
          "data_subject_finalization_retry",
        );
        return {
          ok: false,
          status: 409,
          error: "data_subject_finalization_failed",
          request: claim.request,
          data_subject_request: dataSubjectRequest,
        };
      }
    }
    if (!manualDeliveryRequested) {
      const receipt = { ...asObject(claim.request.receipt) };
      const completionDraft = buildCompletionEmail(
        String(claim.request.id),
        receipt,
      );
      try {
        const delivery = await deliverCompletionEmailFromOutbox(
          adminClient,
          claim,
          safeString(dataSubjectRequest?.id, 80) ||
            safeString(claim.request.data_subject_request_id, 80) ||
            null,
          completionDraft,
        );
        receipt.completion_delivery = {
          status: "sent",
          channel: "automatic_smtp",
          sent_at: delivery.acceptedAt,
          accepted_from_outbox: true,
        };
        const data = await updateClaimedWorkflow(
          adminClient,
          claim,
          {
            receipt,
            metadata: {
              ...asObject(claim.request.metadata),
              completion_email_status: "sent",
              completion_email_sent_at: delivery.acceptedAt,
              notification_pending: false,
              failure_stage: null,
              retryable: false,
            },
          },
          true,
        );
        return {
          ok: true,
          request: data,
          receipt,
          email: {
            status: delivery.alreadyAccepted ? "accepted_previously" : "sent",
          },
          data_subject_request: dataSubjectRequest,
        };
      } catch (error) {
        const data = await updateClaimedWorkflow(
          adminClient,
          claim,
          {
            metadata: {
              ...asObject(claim.request.metadata),
              completion_email_status: "draft_only",
              notification_pending: true,
              failure_stage: null,
              retryable: true,
            },
          },
          true,
        );
        return {
          ok: false,
          status: 202,
          error: completionNotificationPendingCode(error),
          request: data,
          receipt,
          email: { status: "draft_only", draft: completionDraft },
          data_subject_request: dataSubjectRequest,
        };
      }
    }

    const deliveryEvidence = await buildEvidence(
      opts.completionDeliveryEvidence,
      {
        kind: "delivery",
        actorId: opts.adminUserId,
        allowedChannels: ["manual_email", "support_mailbox"],
        timestampField: "delivered_at",
      },
    );
    await discardCompletionOutbox(adminClient, claim, true);
    const receipt = {
      ...asObject(claim.request.receipt),
      completion_delivery: {
        ...deliveryEvidence,
        status: "sent_manual",
      },
    };
    const data = await updateClaimedWorkflow(
      adminClient,
      claim,
      {
        receipt,
        metadata: {
          ...asObject(claim.request.metadata),
          completion_email_status: "sent_manual",
          completion_email_sent_at: deliveryEvidence.event_at,
          notification_pending: false,
          failure_stage: null,
          retryable: false,
        },
      },
      true,
    );
    await insertAudit(
      adminClient,
      "lgpd_erasure_completion_delivery_recorded",
      String(data.id),
      opts.adminUserId,
      {
        delivery_reference_hash: deliveryEvidence.reference_hash,
        channel: deliveryEvidence.channel,
      },
    );
    return {
      ok: true,
      request: data,
      receipt,
      data_subject_request: dataSubjectRequest,
    };
  }
  const tasks = Array.isArray(requestMetadata.external_processors)
    ? requestMetadata.external_processors.map(asObject)
    : buildExternalProcessorMatrix();
  const providerEvidence = await buildProviderEvidence(
    opts.providerEvidence,
    opts.adminUserId,
    tasks,
  );
  const claim = await claimWorkflowAction(
    adminClient,
    opts.request,
    "retry_finalize",
    opts.adminUserId,
    opts.adminSessionId,
  );
  let claimedRequest = claim.request;
  let dataSubjectRequest = opts.dataSubjectRequest;
  if (safeString(requestMetadata.failure_stage, 80) === "postconditions") {
    const repair = await repairFailedPostconditions(
      adminClient,
      claim,
      opts.adminUserId,
      opts.email,
    );
    if (!repair.ok) {
      return {
        ok: false,
        status: 409,
        error: repair.error,
        request: repair.request,
        data_subject_request: dataSubjectRequest,
      };
    }
    claimedRequest = repair.request;
  }
  const coreReceipt = {
    ...asObject(claimedRequest.receipt),
    ...asObject(asObject(claimedRequest.metadata).core_receipt),
  };
  try {
    await ensureCompletionOutbox(
      adminClient,
      claim,
      opts.email,
      safeString(dataSubjectRequest?.id, 80) || null,
    );
  } catch (error) {
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "completion_outbox",
      error,
      {
        auth_deleted: true,
        provider_evidence: providerEvidence,
        completion_email_status: "not_sent",
        notification_pending: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "completion_outbox_unavailable",
      request,
    };
  }

  const helpRequestIds =
    Array.isArray(asObject(claimedRequest.metadata).help_request_ids)
      ? (asObject(claimedRequest.metadata).help_request_ids as unknown[]).map((
        value,
      ) => safeString(value, 80)).filter(Boolean)
      : (opts.helpRequest?.id ? [String(opts.helpRequest.id)] : []);
  let redactedHelpRequests = 0;
  const finalReceipt: JsonObject = {
    ...coreReceipt,
    protocol: safeString(dataSubjectRequest?.protocol, 120) ||
      safeString(coreReceipt.protocol, 120) || null,
    result: "erased",
    provider_evidence: providerEvidence,
    finalized_at: new Date().toISOString(),
  };
  try {
    await renewWorkflowClaim(adminClient, claim);
    redactedHelpRequests = await redactTargetHelpRequests(
      adminClient,
      helpRequestIds,
      opts.emailHash,
      finalReceipt,
    );
  } catch (error) {
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "help_redaction",
      error,
      {
        auth_deleted: true,
        provider_evidence: providerEvidence,
        completion_email_status: "not_sent",
      },
    );
    return { ok: false, status: 409, error: "help_redaction_failed", request };
  }

  finalReceipt.help_requests_redacted = redactedHelpRequests;
  const finalMetadata: JsonObject = {
    ...asObject(claimedRequest.metadata),
    action_claim: null,
    failure_stage: null,
    retryable: false,
    provider_evidence: providerEvidence,
    completion_email_status: "pending",
    notification_pending: true,
    finalized_at: finalReceipt.finalized_at,
  };
  delete finalMetadata.core_receipt;
  delete finalMetadata.repair_target_user_id;
  delete finalMetadata.core_inventory;
  delete finalMetadata.help_request_ids;
  delete finalMetadata.auth_delete_checkpoint;
  const finalIdentity = asObject(finalMetadata.identity_assurance);
  if (finalIdentity.verified === true) {
    finalMetadata.identity_assurance = {
      verified: true,
      source: safeString(finalIdentity.source, 120),
      evidence: Object.keys(asObject(finalIdentity.evidence)).length
        ? asObject(finalIdentity.evidence)
        : undefined,
    };
  }
  let data: JsonObject;
  try {
    data = await updateClaimedWorkflow(
      adminClient,
      claim,
      {
        status: "erased",
        erased_at: coreReceipt.erased_at || finalReceipt.finalized_at,
        target_email_domain: null,
        processed_by: opts.adminUserId,
        receipt: finalReceipt,
        auth_delete_state: null,
        auth_delete_intent_token: null,
        auth_delete_target_user_id: null,
        auth_delete_intent_at: null,
        auth_delete_confirmed_at: null,
        metadata: finalMetadata,
      },
    );
  } catch (error) {
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "final_workflow",
      error,
      {
        auth_deleted: true,
        provider_evidence: providerEvidence,
        completion_email_status: "not_sent",
      },
    );
    return { ok: false, status: 409, error: "final_workflow_failed", request };
  }
  try {
    // This is intentionally the last privacy-state transition. At this point
    // every linked help row has passed the database postcondition and the
    // internal workflow is final; a failure can still downgrade the workflow
    // without ever exposing a completed DSR beside retained ticket PII.
    if (
      dataSubjectRequest &&
      dataSubjectStatus(dataSubjectRequest) !== "completed"
    ) {
      dataSubjectRequest = await transitionDataSubjectThroughProcessing(
        adminClient,
        dataSubjectRequest,
        "completed",
        opts.adminUserId,
        opts.adminSessionId,
        "Solicitacao de exclusao concluida.",
      );
    }
  } catch (error) {
    const request = await markWorkflowFailure(
      adminClient,
      claim,
      opts.adminUserId,
      "data_subject_finalization",
      error,
      {
        auth_deleted: true,
        provider_evidence: providerEvidence,
        completion_email_status: "not_sent",
        help_redaction_verified: true,
      },
    );
    return {
      ok: false,
      status: 409,
      error: "data_subject_finalization_failed",
      request,
    };
  }
  await insertAudit(
    adminClient,
    "lgpd_erasure_finalized",
    String(claimedRequest.id),
    opts.adminUserId,
    {
      subject_hash: opts.emailHash,
      provider_reference_hash: providerEvidence.reference_hash,
      provider_outcomes: providerEvidence.outcomes,
      help_requests_redacted: redactedHelpRequests,
    },
  );
  const completionDraft = buildCompletionEmail(
    String(claimedRequest.id),
    finalReceipt,
  );
  let completionDelivery: { acceptedAt: string; alreadyAccepted: boolean };
  try {
    completionDelivery = await deliverCompletionEmailFromOutbox(
      adminClient,
      claim,
      safeString(dataSubjectRequest?.id, 80) || null,
      completionDraft,
    );
  } catch (error) {
    data = await updateClaimedWorkflow(
      adminClient,
      claim,
      {
        metadata: {
          ...asObject(data.metadata),
          completion_email_status: "draft_only",
          notification_pending: true,
          failure_stage: null,
          retryable: true,
        },
      },
      true,
    );
    return {
      ok: false,
      status: 202,
      error: completionNotificationPendingCode(error),
      request: data,
      receipt: finalReceipt,
      email: { status: "draft_only", draft: completionDraft },
      data_subject_request: dataSubjectRequest,
    };
  }
  const completionSentAt = completionDelivery.acceptedAt;
  finalReceipt.completion_delivery = {
    status: "sent",
    channel: "automatic_smtp",
    sent_at: completionSentAt,
    accepted_from_outbox: true,
  };
  data = await updateClaimedWorkflow(
    adminClient,
    claim,
    {
      receipt: finalReceipt,
      metadata: {
        ...asObject(data.metadata),
        completion_email_status: "sent",
        completion_email_sent_at: completionSentAt,
        notification_pending: false,
        failure_stage: null,
        retryable: false,
      },
    },
    true,
  );
  return {
    ok: true,
    request: data,
    receipt: finalReceipt,
    email: {
      status: completionDelivery.alreadyAccepted
        ? "accepted_previously"
        : "sent",
    },
    data_subject_request: dataSubjectRequest,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(req)) {
      return json(req, 403, { ok: false, error: "origin_not_allowed" });
    }
    return new Response(null, { status: 204, headers: securityHeaders(req) });
  }
  if (!isAllowedOrigin(req)) {
    return json(req, 403, { ok: false, error: "origin_not_allowed" });
  }
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const ANON_KEY = getEnv("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return json(req, 500, { ok: false, error: "missing_server_configuration" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, 401, { ok: false, error: "missing_authorization" });
  }
  const adminSessionId = sessionIdFromAuthorization(authHeader);
  if (!adminSessionId) {
    return json(req, 401, { ok: false, error: "invalid_session" });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json(req, 401, { ok: false, error: "invalid_session" });
  }

  const { data: activeSession, error: activeSessionError } = await userClient
    .rpc(
      "kc_is_current_session_active",
    );
  if (activeSessionError || activeSession !== true) {
    return json(req, 401, { ok: false, error: "session_not_active" });
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) {
    return json(req, 403, { ok: false, error: "not_authorized" });
  }

  let body: JsonObject;
  try {
    const rawBody = await readBoundedRequestText(req, 32_768);
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_json_object");
    }
    body = parsed as JsonObject;
  } catch (error) {
    if (
      error instanceof BoundedRequestBodyError &&
      error.code === "BODY_TOO_LARGE"
    ) {
      return json(req, 413, { ok: false, error: "body_too_large" });
    }
    return json(req, 400, { ok: false, error: "invalid_json" });
  }

  const action = safeString(body.action || body.actionKey, 40);
  const expectedContractVersion = safeString(
    body.expected_contract_version || body.expectedContractVersion,
    120,
  );
  const rawHelpRequestId = firstString(
    body.help_request_id,
    body.helpRequestId,
    asObject(body.help_request).id,
    asObject(body.helpRequest).id,
  );
  let helpRequestId = extractUuidFromText(rawHelpRequestId);
  if (!SUPPORTED_ACTIONS.has(action)) {
    return json(req, 400, { ok: false, error: "invalid_action" });
  }
  if (rawHelpRequestId && !helpRequestId) {
    return json(req, 400, { ok: false, error: "invalid_help_request_id" });
  }

  try {
    if (action === "capabilities") {
      const capabilities = await readErasureCapabilities(adminClient);
      const ready = capabilities.ok === true;
      return json(req, ready ? 200 : 503, {
        ok: ready,
        action,
        error: ready ? null : "schema_capabilities_incomplete",
        capabilities: {
          schema_version: capabilities.version,
          safe_erasure_schema: ready,
          write_quiescence: capabilities.write_quiescence,
          encrypted_completion_outbox: capabilities.encrypted_completion_outbox,
          admin_session_bound_claims: capabilities.admin_session_bound_claims,
          durable_auth_delete_checkpoint:
            capabilities.durable_auth_delete_checkpoint,
        },
      });
    }
    if (expectedContractVersion !== ACCOUNT_ERASURE_CONTRACT_VERSION) {
      return json(req, 409, {
        ok: false,
        error: "account_erasure_contract_mismatch",
      });
    }
    if (!helpRequestId) {
      return json(req, 400, {
        ok: false,
        error: "erasure_help_request_required",
      });
    }
    let helpRequest = await getHelpRequest(adminClient, helpRequestId);
    if (!helpRequest || !helpRequestId) {
      return json(req, 404, {
        ok: false,
        error: "erasure_help_request_required",
      });
    }
    if (!isAccountErasureHelpRequest(helpRequest)) {
      return json(req, 409, {
        ok: false,
        error: "help_request_is_not_account_erasure",
        request_kind:
          safeString(asObject(helpRequest.metadata).request_kind, 80) || null,
        subtopic: safeString(helpRequest.subtopic, 80) || null,
      });
    }
    let existingWorkflow = await getWorkflowByHelpRequest(
      adminClient,
      helpRequestId,
    );

    if (action === "link_verified_identity") {
      const accountEmail = normalizeEmail(firstString(
        body.account_email,
        body.accountEmail,
        body.target_email,
        body.targetEmail,
        asObject(body.target).email,
      ));
      if (!EMAIL_RE.test(accountEmail)) {
        throw new WorkflowError(400, "valid_account_email_required");
      }
      const link = await linkVerifiedAccountErasureIdentity(adminClient, {
        helpRequestId,
        accountEmail,
        actorId: user.id,
        actorSessionId: adminSessionId,
        rawEvidence: body.identity_evidence || body.identityEvidence,
      });
      const linkedWorkflow = await getWorkflowByHelpRequest(
        adminClient,
        helpRequestId,
      );
      if (!linkedWorkflow) {
        throw new WorkflowError(409, "identity_link_workflow_missing");
      }
      return json(req, 200, {
        ok: true,
        action,
        linked: true,
        idempotent: link.idempotent === true,
        protocol: safeString(link.protocol, 64),
        data_subject_request_status: safeString(
          link.data_subject_request_status,
          80,
        ),
        workflow_status: safeString(link.workflow_status, 80),
        request: linkedWorkflow,
        identity_assurance: {
          verified: true,
          source: safeString(link.identity_source, 120) ||
            "admin_verified_anonymous_erasure",
        },
      });
    }

    let existingMetadata = asObject(existingWorkflow?.metadata);
    const checkpointHint = authDeleteCheckpointFromWorkflow(existingWorkflow);
    let authDeleteRecovery:
      | Awaited<
        ReturnType<typeof readAuthDeleteRecoveryStatus>
      >
      | null = null;
    let checkpointAuthInspection: AuthUserInspection | null = null;
    if (checkpointHint && existingWorkflow?.id) {
      authDeleteRecovery = await readAuthDeleteRecoveryStatus(
        adminClient,
        String(existingWorkflow.id),
      );
      if (
        !authDeleteRecovery.ok ||
        authDeleteRecovery.targetUserId !== checkpointHint.targetUserId ||
        authDeleteRecovery.intentToken !== checkpointHint.intentToken
      ) {
        throw new WorkflowError(409, "auth_delete_recovery_proof_invalid", {
          proof_error: authDeleteRecovery.error,
        });
      }
      checkpointAuthInspection = await inspectAuthUserById(
        adminClient,
        checkpointHint.targetUserId,
      );
      if (
        checkpointAuthInspection.state === "unknown" ||
        authDeleteRecovery.authUserPresent !==
          (checkpointAuthInspection.state === "present")
      ) {
        throw new WorkflowError(503, "auth_delete_outcome_unresolved");
      }
    }
    const helpEmail = normalizeEmail(helpRequest.contact_email);
    const helpOwnerId = extractUuidFromText(helpRequest.user_id) || null;
    const postCoreRecovery = Boolean(
      checkpointHint &&
        checkpointAuthInspection?.state === "absent" &&
        authDeleteRecovery?.authUserPresent === false,
    );
    const postCoreOperation = existingMetadata.auth_deleted === true ||
      postCoreRecovery;
    let ownerAuthInspection: AuthUserInspection | null = null;
    if (!checkpointHint && helpOwnerId) {
      ownerAuthInspection = await inspectAuthUserById(
        adminClient,
        helpOwnerId,
      );
      if (ownerAuthInspection.state === "unknown") {
        throw new WorkflowError(503, "auth_user_lookup_unresolved");
      }
    }
    const submittedOrHelpEmail = postCoreOperation && EMAIL_RE.test(helpEmail)
      ? helpEmail
      : (helpOwnerId ? "" : resolveTargetEmail(body, helpRequest));
    const authUser = checkpointAuthInspection?.state === "present"
      ? checkpointAuthInspection.user
      : ownerAuthInspection?.state === "present"
      ? ownerAuthInspection.user
      : (checkpointHint
        ? null
        : (helpOwnerId
          ? null
          : await findAuthUserByEmail(adminClient, submittedOrHelpEmail)));
    const currentAuthEmail = normalizeEmail(authUser?.email);
    const email = !postCoreOperation && EMAIL_RE.test(currentAuthEmail)
      ? currentAuthEmail
      : submittedOrHelpEmail;
    if (!EMAIL_RE.test(email)) {
      return json(req, 400, {
        ok: false,
        error: "valid_target_email_required",
      });
    }
    const userId = authUser?.id
      ? String(authUser.id)
      : (checkpointAuthInspection?.state === "present"
        ? checkpointHint?.targetUserId || null
        : null);
    if (!postCoreOperation && helpOwnerId && helpOwnerId !== userId) {
      throw new WorkflowError(409, "identity_target_mismatch");
    }
    const accountEmailChanged = Boolean(
      !postCoreOperation &&
        userId &&
        EMAIL_RE.test(helpEmail) &&
        EMAIL_RE.test(currentAuthEmail) &&
        helpEmail !== currentAuthEmail,
    );
    if (
      existingWorkflow?.user_id &&
      userId &&
      safeString(existingWorkflow.user_id, 80) !== userId
    ) {
      throw new WorkflowError(409, "workflow_target_mismatch");
    }
    const dataSubjectLink = await loadLinkedDataSubjectRequest(
      adminClient,
      helpRequest,
      helpRequestId,
      userId,
    );
    let dataSubjectRequest = dataSubjectLink.request;
    if (!postCoreOperation) {
      const metadataRequestId = extractUuidFromText(
        asObject(helpRequest.metadata).data_subject_request_id,
      );
      const linkedRequestId = extractUuidFromText(dataSubjectRequest?.id);
      const linkedSubjectId = extractUuidFromText(dataSubjectRequest?.user_id);
      if (
        !userId ||
        !dataSubjectRequest ||
        !metadataRequestId ||
        metadataRequestId !== linkedRequestId ||
        helpOwnerId !== userId ||
        linkedSubjectId !== userId
      ) {
        throw new WorkflowError(409, "identity_link_required");
      }
    }
    const identityAssurance = postCoreOperation
      ? storedIdentityAssurance(existingWorkflow, {
        checkpoint: checkpointHint || authDeleteRecovery,
        helpRequest,
        dataSubjectRequest,
      })
      : assessIdentityBinding(
        helpRequest,
        dataSubjectRequest,
        userId,
        existingWorkflow,
      );
    if (accountEmailChanged) {
      const synchronizedHelpRequest = await mergeHelpRequestMetadata(
        adminClient,
        helpRequest,
        {
          account_email: currentAuthEmail,
          account_email_authority: "auth_user_uuid",
          account_email_synchronized_at: new Date().toISOString(),
        },
      );
      if (
        !synchronizedHelpRequest ||
        extractUuidFromText(synchronizedHelpRequest.user_id) !== userId ||
        normalizeEmail(synchronizedHelpRequest.contact_email) !==
          currentAuthEmail
      ) {
        throw new WorkflowError(409, "identity_email_synchronization_failed");
      }
      helpRequest = synchronizedHelpRequest;
    }
    if (postCoreOperation && !identityAssurance?.verified) {
      throw new WorkflowError(
        409,
        "identity_assurance_missing_after_core_erasure",
      );
    }
    const emailHash = await deriveSubjectHash(
      dataSubjectRequest,
      existingWorkflow,
    );
    const diagnostics = await buildDiagnostics(
      adminClient,
      userId,
      email,
      helpRequestId,
    );
    if (accountEmailChanged) {
      const diagnosticWarnings = Array.isArray((diagnostics as any).warnings)
        ? (diagnostics as any).warnings
        : [];
      (diagnostics as any).warnings = [
        ...diagnosticWarnings,
        "account_email_synchronized_from_auth_uuid",
      ];
    }
    (diagnostics as any).identity_assurance = {
      verified: identityAssurance?.verified === true,
      source: identityAssurance?.source || "missing",
      requires_manual_evidence: identityAssurance?.verified !== true,
      help_user_id_matches_target: Boolean(
        identityAssurance?.help_user_id &&
          identityAssurance.help_user_id === identityAssurance.target_user_id,
      ),
    };
    (diagnostics as any).data_subject_request = dataSubjectRequest
      ? {
        id: dataSubjectRequest.id,
        protocol: dataSubjectRequest.protocol,
        status: dataSubjectRequest.status,
      }
      : null;
    if (dataSubjectLink.warning) {
      const diagnosticWarnings = Array.isArray((diagnostics as any).warnings)
        ? (diagnostics as any).warnings
        : [];
      (diagnostics as any).warnings = [
        ...diagnosticWarnings,
        dataSubjectLink.warning,
      ];
    }
    let request = await upsertWorkflow(adminClient, {
      helpRequestId: helpRequestId || null,
      userId,
      email,
      emailHash,
      dataSubjectRequestId: dataSubjectRequest?.id
        ? String(dataSubjectRequest.id)
        : null,
      adminUserId: user.id,
      adminSessionId,
      counts: asObject((diagnostics as any).counts),
      metadata: {
        source: "admin-help-requests",
        request_kind: CANONICAL_ERASURE_KIND,
        identifier_source: dataSubjectRequest?.id
          ? "data_subject_request_opaque_subject_token"
          : "workflow_opaque_subject_token",
        subject_identifier_kind: dataSubjectRequest?.id
          ? "dsr_opaque_random_v1"
          : "opaque_random_v1",
        legacy_without_data_subject_request: dataSubjectLink.legacy,
        identity_binding_source: identityAssurance?.source || "missing",
        auth_user_found: Boolean(userId),
        last_action: action,
      },
    });

    if (postCoreRecovery && existingMetadata.auth_deleted !== true) {
      request = await reconcileAuthDeleteAbsence(
        adminClient,
        request,
        user.id,
        adminSessionId,
      );
      existingWorkflow = request;
      existingMetadata = asObject(request.metadata);
      if (action !== "retry_finalize") {
        return json(req, 409, {
          ok: false,
          error: "auth_delete_reconciled_retry_finalize_required",
          retryable: true,
          next_action: "retry_finalize",
          request,
          data_subject_request: dataSubjectRequest,
          target: {
            subject_hash: emailHash,
            email_hash: emailHash,
            user_found: false,
          },
        });
      }
    }

    const linkedStatus = dataSubjectStatus(dataSubjectRequest);
    if (
      linkedStatus === "cancelled" &&
      !["diagnose", "cancel_reversible"].includes(action)
    ) {
      throw new WorkflowError(409, "data_subject_request_cancelled", {
        restoration_required: safeString(request.status, 80) !== "cancelled",
      });
    }
    if (
      ["completed", "expired"].includes(linkedStatus) &&
      !["diagnose", "generate_receipt", "retry_finalize"].includes(action)
    ) {
      throw new WorkflowError(409, `data_subject_request_${linkedStatus}`);
    }

    if (action === "diagnose") {
      await insertAudit(
        adminClient,
        "lgpd_erasure_diagnosed",
        String(request.id),
        user.id,
        {
          subject_hash: emailHash,
          user_found: Boolean(userId),
          counts: asObject((diagnostics as any).counts),
          blockers: Array.isArray((diagnostics as any).blockers)
            ? (diagnostics as any).blockers
            : [],
        },
      );
      return json(req, 200, {
        ok: true,
        action,
        request,
        diagnostics,
        target: {
          subject_hash: emailHash,
          email_hash: emailHash,
          user_found: Boolean(userId),
        },
      });
    }

    if (action === "apply_reversible") {
      const verifiedIdentity = await requireIdentityAssurance(
        identityAssurance as IdentityAssurance,
        request,
        body.identity_evidence || body.identityEvidence,
        user.id,
      );
      const result = await applyReversible(adminClient, {
        request,
        helpRequest,
        userId,
        email,
        emailHash,
        adminUserId: user.id,
        adminSessionId,
        diagnostics,
        dataSubjectRequest,
        identityAssurance: verifiedIdentity,
      });
      return json(req, 200, {
        ok: true,
        action,
        diagnostics,
        ...result,
        target: {
          subject_hash: emailHash,
          email_hash: emailHash,
          user_found: Boolean(userId),
        },
      });
    }

    if (action === "record_confirmation_delivery") {
      await requireIdentityAssurance(
        identityAssurance as IdentityAssurance,
        request,
        body.identity_evidence || body.identityEvidence,
        user.id,
      );
      const result = await recordConfirmationDelivery(adminClient, {
        request,
        helpRequest,
        adminUserId: user.id,
        adminSessionId,
        evidence: body.delivery_evidence || body.deliveryEvidence,
        dataSubjectRequest,
      });
      return json(req, 200, {
        ok: true,
        action,
        diagnostics,
        ...result,
        target: {
          subject_hash: emailHash,
          email_hash: emailHash,
          user_found: Boolean(userId),
        },
      });
    }

    if (action === "cancel_reversible") {
      const result = await cancelReversible(adminClient, {
        request,
        helpRequest,
        userId,
        adminUserId: user.id,
        adminSessionId,
        reason: safeString(
          body.cancellation_reason || body.cancellationReason,
          500,
        ),
        dataSubjectRequest,
      });
      return json(req, 200, {
        ok: true,
        action,
        diagnostics,
        ...result,
        target: {
          subject_hash: emailHash,
          email_hash: emailHash,
          user_found: Boolean(userId),
        },
      });
    }

    if (action === "generate_receipt") {
      const receipt = {
        request_id: request.id,
        subject_hash: emailHash,
        user_found: Boolean(userId),
        counts: asObject((diagnostics as any).counts),
        status: request.status,
        result: safeString(asObject(request.receipt).result, 120) ||
          "diagnostic_only",
        blockers: Array.isArray((diagnostics as any).blockers)
          ? (diagnostics as any).blockers
          : [],
        shared_chat_risk: asObject((diagnostics as any).shared_chat_risk),
        external_processors: (diagnostics as any).external_processors ||
          buildExternalProcessorMatrix(),
        session_control: {
          access_token_window: "existing_jwt_may_remain_valid_until_exp",
          immediate_access_token_revocation_claimed: false,
        },
        generated_at: new Date().toISOString(),
      };
      return json(req, 200, {
        ok: true,
        action,
        request,
        diagnostics,
        receipt,
        target: {
          subject_hash: emailHash,
          email_hash: emailHash,
          user_found: Boolean(userId),
        },
      });
    }

    if (action === "retry_finalize") {
      const result = await retryFinalize(adminClient, {
        request,
        helpRequest,
        email,
        emailHash,
        adminUserId: user.id,
        adminSessionId,
        providerEvidence: body.provider_evidence || body.providerEvidence,
        completionDeliveryEvidence: body.completion_delivery_evidence ||
          body.completionDeliveryEvidence ||
          body.delivery_evidence ||
          body.deliveryEvidence,
        dataSubjectRequest,
      });
      if (!result.ok) {
        return json(
          req,
          Number(result.status) || 409,
          {
            ...result,
            retryable: true,
            next_action: "retry_finalize",
          } as Record<string, unknown>,
        );
      }
      return json(req, 200, {
        ...result,
        ok: true,
        action,
        diagnostics,
        target: {
          subject_hash: emailHash,
          email_hash: emailHash,
          user_found: Boolean(userId),
        },
      });
    }

    const erase = await eraseConfirmed(adminClient, {
      request,
      helpRequest,
      userId,
      email,
      emailHash,
      adminUserId: user.id,
      adminSessionId,
      confirmationPhrase: safeString(
        body.confirmation_phrase || body.confirmationPhrase,
        320,
      ),
      confirmationEvidence: body.confirmation_evidence ||
        body.confirmationEvidence,
      diagnostics,
      dataSubjectRequest,
      copyGateDecision: body.copy_gate_decision || body.copyGateDecision,
      identityAssurance: await requireIdentityAssurance(
        identityAssurance as IdentityAssurance,
        request,
        body.identity_evidence || body.identityEvidence,
        user.id,
      ),
    });
    if (!erase.ok) {
      return json(
        req,
        Number(erase.status) || 409,
        erase as Record<string, unknown>,
      );
    }
    return json(req, 200, {
      ...erase,
      ok: true,
      action,
      diagnostics,
      target: {
        subject_hash: emailHash,
        email_hash: emailHash,
        user_found: Boolean(userId),
      },
    });
  } catch (error) {
    console.error(
      "[kc-account-erasure] request_failed",
      error instanceof WorkflowError ? error.code : "account_erasure_failed",
    );
    if (error instanceof WorkflowError) {
      return json(req, error.status, {
        ok: false,
        error: error.code,
        ...(error.details || {}),
      });
    }
    return json(req, 500, {
      ok: false,
      error: "account_erasure_failed",
    });
  }
});
