// KinoCampus - Edge Function: kc-data-subject-request
//
// Authenticated data-subject requests (LGPD):
//   create   -> protocol + help ticket (atomic RPC)
//   list/get -> owner-scoped status
//   download -> bounded JSON generated on demand
//   supplement -> private assisted artifact when direct delivery is incomplete
//   cancel   -> owner-scoped cancellation before completion

import {
  createClient,
  type SupabaseClient,
  type User,
} from "jsr:@supabase/supabase-js@2.95.0";
import {
  buildDataProcessorMatrix,
  type DataExportProcessorOutcome,
  normalizeDataExportProcessorOutcomes,
  processorOutcomesAreDeliverable,
  toDataExportProcessorTasks,
  toDefaultDataExportProcessorOutcomes,
} from "../_shared/data-processors.ts";
import { isCurrentSessionActive } from "../_shared/active-session.ts";
import {
  BoundedRequestBodyError,
  readBoundedRequestText,
} from "../_shared/bounded-request-body.ts";
import {
  MAX_SUPPLEMENT_MEDIA_REFERENCES,
  signSupplementMediaTargets,
  SUPPLEMENT_MEDIA_SIGNED_URL_SECONDS,
} from "../_shared/supplement-media-signing.ts";

type JsonRecord = Record<string, unknown>;
type RequestKind = "data_access_copy" | "data_portability" | "account_erasure";
type RequestStatus =
  | "received"
  | "processing"
  | "ready"
  | "pending_confirmation"
  | "completed"
  | "cancelled"
  | "failed"
  | "partial_failure"
  | "expired";

type DataSubjectRequest = {
  id: string;
  protocol: string;
  help_request_id: string | null;
  request_kind: RequestKind;
  status: RequestStatus;
  requested_format: "json";
  request_source: "settings" | "help" | "api";
  export_schema_version: number;
  scope: unknown[];
  ready_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  retention_until: string;
  created_at: string;
  updated_at: string;
};

type CategoryManifest = {
  key: string;
  status: "included" | "unavailable";
  included_count: number;
  truncated: boolean;
  omitted_fields: string[];
  note?: string;
};

type ExportBuild = {
  payload: JsonRecord;
  partial: boolean;
  supplementMediaRefs: SupplementMediaRef[];
};

export type SupplementMediaRef = {
  media_ref: string;
  object_path: string;
};

type ExportBudget = {
  sourceBytes: number;
  sourceRows: number;
  exhausted: boolean;
  maximumSourceBytes: number;
  maximumSourceRows: number;
};

export type DataExportBuildOptions = {
  supplement?: boolean;
  processorOutcomes?: DataExportProcessorOutcome[];
  authorizationCheckpoint?: () => Promise<void>;
};

const REQUEST_KINDS = new Set<RequestKind>([
  "data_access_copy",
  "data_portability",
  "account_erasure",
]);
const EXPORT_KINDS = new Set<RequestKind>([
  "data_access_copy",
  "data_portability",
]);
const PROTOCOL_RE = /^KC-DSR-[0-9]{8}-[A-F0-9]{16}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PAGE_SIZE = 500;
const MAX_CATEGORY_ROWS = 2_500;
const MAX_CHAT_MEDIA_ROWS = 100;
const MAX_EXPORT_SOURCE_ROWS = 25_000;
const MAX_EXPORT_SOURCE_BYTES = 3 * 1024 * 1024;
const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const MAX_SUPPLEMENT_CATEGORY_ROWS = 10_000;
const MAX_SUPPLEMENT_SOURCE_ROWS = 100_000;
const MAX_SUPPLEMENT_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_SUPPLEMENT_ARTIFACT_BYTES = 16 * 1024 * 1024;
const EXPORT_WINDOW_MS = 15 * 60 * 1000;
const CHAT_MEDIA_SIGNED_URL_MAX_SECONDS = 10 * 60;
const CHAT_MEDIA_BUCKET = "kino-chat-media";
const LEGACY_CHAT_MEDIA_BUCKET = "kino-media";
const REQUEST_SELECT = [
  "id",
  "protocol",
  "help_request_id",
  "request_kind",
  "status",
  "requested_format",
  "request_source",
  "export_schema_version",
  "scope",
  "ready_at",
  "expires_at",
  "completed_at",
  "cancelled_at",
  "retention_until",
  "created_at",
  "updated_at",
].join(",");
const SECRET_KEY_RE =
  /(^|_)(password|passcode|secret|token|authorization|cookie|session|e2e|provider_response|service_role|api_key|private_key)(_|$)/i;
const THIRD_PARTY_ID_KEY_RE =
  /(^|_)(author|sender|target|rater|actor|admin|participant|blocked|post|comment|message|conversation|entity)_?id$/i;
const AUTH_USER_METADATA_ALLOWLIST = new Set([
  "display_name",
  "full_name",
  "name",
  "avatar_url",
  "picture",
  "affiliation",
  "locale",
  "preferred_username",
  "terms_accepted",
  "terms_version",
  "privacy_version",
  "legal_accepted_at",
  "legal_acceptance_source",
]);
const POST_METADATA_ALLOWLIST = new Set([
  "subcategory",
  "subcategoryLabel",
  "categoryKey",
  "categoryLabel",
  "categoria",
  "categoriaKey",
  "subcategoria",
  "subcategoriaKey",
  "tags",
  "tagKeys",
  "condicao",
  "precoTexto",
  "sustentavel",
  "emoji",
  "verificado",
  "visibility",
  "gallery_image_urls",
  "gallery_count",
  "cover_url",
  "image_url",
  "actionKey",
  "actionLabel",
  "regionKey",
  "regionLabel",
  "regionZoneKey",
  "regionZoneLabel",
  "regiao",
  "regiaoLabel",
  "housingTypeKey",
  "housingTypeLabel",
  "housingFeatureKeys",
  "housingFeatureLabels",
  "marcadoresMoradia",
  "lostFoundLocationKey",
  "lostFoundLocationLabel",
  "lostFoundLocationIcon",
  "lostFoundLocationEmoji",
  "localizacao",
  "location",
  "detalhes",
  "orcamento",
  "area",
  "areaLabel",
  "areaKey",
  "workMode",
  "workModeLabel",
  "employmentType",
  "employmentTypeLabel",
  "regimeContratacao",
  "contato",
  "remuneracao",
  "modalidadeTrabalho",
  "recompensa",
  "entrega",
  "data_evento",
  "data_fim_evento",
  "hora_evento",
  "link",
  "link_as_cta",
  "gratuito",
  "origem",
  "destino",
  "horario",
  "contribuicao",
  "vagas",
  "caronasFeatureKeys",
  "caronasFeatureLabels",
  "marcadoresCarona",
]);
const OPTIONAL_SCHEMA_ERROR_CODES = new Set([
  "42P01",
  "42703",
  "PGRST200",
  "PGRST204",
  "PGRST205",
]);
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.kinocampus.com.br",
  "https://kinocampus.com.br",
  "https://kinocampus.vercel.app",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

function env(name: string): string {
  return Deno.env.get(name)?.trim() || "";
}

function allowedOrigins(): Set<string> {
  const configured = env("KC_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin")?.trim() || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function securityHeaders(request: Request): Record<string, string> {
  return {
    ...corsHeaders(request),
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(
  request: Request,
  status: number,
  body: JsonRecord,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...securityHeaders(request),
      ...extraHeaders,
    },
  });
}

function failure(
  request: Request,
  status: number,
  code: string,
  message: string,
): Response {
  return json(request, status, {
    ok: false,
    error: { code, message },
  });
}

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, max = 4000): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeProtocol(value: unknown): string {
  return asString(value, 64).toUpperCase();
}

function normalizeRequestKind(value: unknown): RequestKind | null {
  const normalized = asString(value, 80).toLowerCase() as RequestKind;
  return REQUEST_KINDS.has(normalized) ? normalized : null;
}

function normalizeSource(value: unknown): "settings" | "help" | "api" {
  const normalized = asString(value, 30).toLowerCase();
  return normalized === "help" || normalized === "api"
    ? normalized
    : "settings";
}

function normalizeRpcRow(value: unknown): DataSubjectRequest | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isPlainObject(row) || !PROTOCOL_RE.test(asString(row.protocol, 64))) {
    return null;
  }
  return row as unknown as DataSubjectRequest;
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")?.trim() || "";
  return !origin || allowedOrigins().has(origin);
}

function extractBearer(request: Request): string {
  const header = request.headers.get("authorization")?.trim() || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return await sha256BytesHex(bytes);
}

async function sha256BytesHex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(value).buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizedUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    if (parsed.username || parsed.password) return "";
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function normalizedMetadataKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isSensitiveMetadataKey(key: string): boolean {
  const normalized = normalizedMetadataKey(key);
  return SECRET_KEY_RE.test(normalized) ||
    THIRD_PARTY_ID_KEY_RE.test(normalized);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (
    value == null || typeof value === "boolean" || typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "string") {
    const clipped = value.slice(0, 20_000);
    return /^https?:\/\//i.test(clipped) ? sanitizedUrl(clipped) : clipped;
  }
  if (depth >= 8) return "[depth-limited]";
  if (Array.isArray(value)) {
    return value.slice(0, 2_000).map((entry) =>
      sanitizeValue(entry, depth + 1)
    );
  }
  if (!isPlainObject(value)) return String(value).slice(0, 1000);

  const output: JsonRecord = {};
  Object.entries(value).slice(0, 300).forEach(([key, entry]) => {
    if (isSensitiveMetadataKey(key)) return;
    output[key] = sanitizeValue(entry, depth + 1);
  });
  return output;
}

function sanitizeAllowedObject(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): JsonRecord {
  if (!isPlainObject(value)) return {};
  const output: JsonRecord = {};
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (isSensitiveMetadataKey(key)) continue;
    output[key] = sanitizeValue(value[key]);
  }
  return output;
}

function mediaReference(value: unknown): JsonRecord | null {
  const raw = asString(value, 4000);
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    const marker = "/storage/v1/object/";
    const markerIndex = parsed.pathname.indexOf(marker);
    const safe: JsonRecord = {
      kind: markerIndex >= 0 ? "supabase_storage_url" : "external_https_url",
      url: `${parsed.origin}${parsed.pathname}`,
    };
    if (markerIndex >= 0) {
      safe.object_path = decodeURIComponent(
        parsed.pathname.slice(markerIndex + marker.length),
      ).slice(0, 2000);
    }
    return safe;
  } catch {
    if (
      raw.includes("..") ||
      raw.startsWith("/") ||
      !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,1999}$/.test(raw)
    ) {
      return null;
    }
    return { kind: "storage_object_path", object_path: raw };
  }
}

export function partitionChatMediaCandidates(
  messages: JsonRecord[],
  maximumSignedMedia: number,
): {
  allMessageCount: number;
  signed: Array<{ row: JsonRecord; index: number }>;
  deferred: Array<{ row: JsonRecord; index: number }>;
} {
  const mediaCandidates = messages
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => asString(row.media_path, 2000));
  return {
    allMessageCount: messages.length,
    signed: mediaCandidates.slice(0, maximumSignedMedia),
    deferred: mediaCandidates.slice(maximumSignedMedia),
  };
}

export function unavailablePrivateChatMediaReference(
  reason:
    | "supplement_media_limit_reached"
    | "direct_signed_url_limit_reached"
    | "ownership_validation_failed",
): JsonRecord {
  return {
    kind: "private_chat_attachment",
    delivery: "manual_supplement_required",
    reason,
  };
}

function redactedErasureReceipt(value: unknown): JsonRecord {
  const receipt = isPlainObject(value) ? value : {};
  const postconditions = isPlainObject(receipt.postconditions)
    ? receipt.postconditions
    : {};
  return {
    result: sanitizeValue(receipt.result || null),
    erased_at: sanitizeValue(receipt.erased_at || null),
    counts: sanitizeValue(receipt.counts || {}),
    posts_sanitized: sanitizeValue(receipt.posts_sanitized || 0),
    storage_removed_count: sanitizeValue(receipt.storage_removed_count || 0),
    postconditions: {
      ok: postconditions.ok === true,
    },
    session_control: sanitizeValue(receipt.session_control || {}),
    external_processors: sanitizeValue(receipt.external_processors || []),
  };
}

function isOptionalSchemaError(error: unknown): boolean {
  if (!isPlainObject(error)) return false;
  return OPTIONAL_SCHEMA_ERROR_CODES.has(asString(error.code, 40));
}

async function fetchRows(
  client: SupabaseClient,
  table: string,
  columns: string,
  applyFilters: (query: any) => any,
  orderColumn = "created_at",
  budget?: ExportBudget,
  maximumRows = MAX_CATEGORY_ROWS,
  authorizationCheckpoint?: () => Promise<void>,
): Promise<{ rows: JsonRecord[]; truncated: boolean; unavailable: boolean }> {
  const rows: JsonRecord[] = [];
  let offset = 0;
  const encoder = new TextEncoder();

  if (budget?.exhausted) {
    return { rows, truncated: true, unavailable: false };
  }

  while (offset <= maximumRows) {
    await authorizationCheckpoint?.();
    const remaining = maximumRows - rows.length;
    if (remaining < 1) {
      return { rows, truncated: true, unavailable: false };
    }
    const requestSize = Math.min(PAGE_SIZE, remaining + 1);
    let query = client.from(table).select(columns);
    query = applyFilters(query);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    query = query.range(offset, offset + requestSize - 1);

    const { data, error } = await query;
    await authorizationCheckpoint?.();
    if (error) {
      if (isOptionalSchemaError(error)) {
        console.warn(
          `[kc-data-subject-request] optional category unavailable: ${table}`,
          {
            code: error.code,
          },
        );
        return { rows: [], truncated: false, unavailable: true };
      }
      throw new Error(
        `EXPORT_QUERY_FAILED:${table}:${asString(error.code, 40)}`,
      );
    }

    const page = Array.isArray(data) ? data as unknown as JsonRecord[] : [];
    const acceptedPage = page.slice(0, remaining);
    for (const entry of acceptedPage) {
      if (budget) {
        const encoded = encoder.encode(JSON.stringify(entry)).byteLength;
        if (
          budget.sourceRows + 1 > budget.maximumSourceRows ||
          budget.sourceBytes + encoded > budget.maximumSourceBytes
        ) {
          budget.exhausted = true;
          return { rows, truncated: true, unavailable: false };
        }
        budget.sourceRows += 1;
        budget.sourceBytes += encoded;
      }
      rows.push(entry);
    }
    if (page.length > remaining) {
      return { rows, truncated: true, unavailable: false };
    }
    if (page.length < requestSize) {
      return { rows, truncated: false, unavailable: false };
    }
    offset += page.length;
  }

  return { rows, truncated: true, unavailable: false };
}

async function countMatchingRows(
  client: SupabaseClient,
  table: string,
  applyFilters: (query: any) => any,
): Promise<number | null> {
  let query = client.from(table).select("*", { count: "exact", head: true });
  query = applyFilters(query);
  const { count, error } = await query;
  if (error) {
    if (isOptionalSchemaError(error)) return null;
    throw new Error(`EXPORT_COUNT_FAILED:${table}:${asString(error.code, 40)}`);
  }
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

async function signedChatMediaReference(
  admin: SupabaseClient,
  mediaPath: unknown,
  downloadExpiresAt: string | null,
): Promise<{ media: JsonRecord | null; delivered: boolean }> {
  const rawPath = asString(mediaPath, 2000);
  if (!rawPath) return { media: null, delivered: true };

  const base = mediaReference(rawPath);
  if (!base || base.kind !== "storage_object_path") {
    return { media: base, delivered: false };
  }

  const remainingSeconds = downloadExpiresAt
    ? Math.floor((Date.parse(downloadExpiresAt) - Date.now()) / 1000)
    : CHAT_MEDIA_SIGNED_URL_MAX_SECONDS;
  const expiresIn = Math.max(
    1,
    Math.min(CHAT_MEDIA_SIGNED_URL_MAX_SECONDS, remainingSeconds),
  );
  const signedExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  for (const bucket of [CHAT_MEDIA_BUCKET, LEGACY_CHAT_MEDIA_BUCKET]) {
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(rawPath, expiresIn);
    const signedUrl = !error && data ? asString(data.signedUrl, 20_000) : "";
    if (!signedUrl) continue;
    return {
      delivered: true,
      media: {
        ...base,
        bucket,
        delivery: "short_lived_signed_url",
        download_url: signedUrl,
        download_expires_at: signedExpiresAt,
      },
    };
  }

  return {
    delivered: false,
    media: {
      ...base,
      bucket: CHAT_MEDIA_BUCKET,
      delivery: "manual_supplement_required",
    },
  };
}

function ownedChatMediaObjectPath(
  mediaPath: unknown,
  conversationId: string,
  userId: string,
  validConversationIds: ReadonlySet<string>,
): string | null {
  const rawPath = asString(mediaPath, 2000);
  const expectedPrefix = `chat-media/${conversationId}/${userId}/`;
  if (
    !validConversationIds.has(conversationId) ||
    !rawPath.startsWith(expectedPrefix) ||
    !/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|gif|mp3|m4a|ogg|wav|aac|pdf|doc|docx)$/i
      .test(rawPath.slice(expectedPrefix.length))
  ) return null;
  return rawPath;
}

function newSupplementMediaRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `KEM-${
    Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  }`;
}

export function containsPersistedDeliveryCapability(
  value: unknown,
  depth = 0,
): boolean {
  if (value == null) return false;
  // Persisted exports are generated by this service and do not need
  // unbounded nesting. Reject an unexpectedly deep container rather than
  // allowing a capability key to hide beyond the bounded traversal.
  if (depth > 12) return Array.isArray(value) || isPlainObject(value);
  if (Array.isArray(value)) {
    return value.some((entry) =>
      containsPersistedDeliveryCapability(entry, depth + 1)
    );
  }
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, entry]) => {
    const normalized = normalizedMetadataKey(key);
    if (
      ["download_url", "signed_url", "signed_url_token"].includes(normalized) &&
      entry != null
    ) return true;
    return containsPersistedDeliveryCapability(entry, depth + 1);
  });
}

export async function withRecomputedExportIntegrity(
  value: JsonRecord,
): Promise<JsonRecord> {
  const { integrity: _discardedIntegrity, ...core } = value;
  const canonical = JSON.stringify(core);
  return {
    ...core,
    integrity: {
      algorithm: "SHA-256",
      scope: "all_top_level_fields_except_integrity_serialized_as_utf8_json",
      payload_sha256: await sha256Hex(canonical),
      payload_bytes: new TextEncoder().encode(canonical).byteLength,
    },
  };
}

export async function exportIntegrityIsValid(
  value: JsonRecord,
): Promise<boolean> {
  if (!isPlainObject(value.integrity)) return false;
  const expectedHash = asString(value.integrity.payload_sha256, 80)
    .toLowerCase();
  const expectedBytes = Number(value.integrity.payload_bytes);
  if (
    value.integrity.algorithm !== "SHA-256" ||
    !/^[a-f0-9]{64}$/.test(expectedHash) ||
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 1
  ) return false;
  const recomputed = await withRecomputedExportIntegrity(value);
  const observed = isPlainObject(recomputed.integrity)
    ? recomputed.integrity
    : {};
  return observed.payload_sha256 === expectedHash &&
    observed.payload_bytes === expectedBytes;
}

export async function rehydrateSupplementMediaForDownload(
  admin: SupabaseClient,
  storedPayload: JsonRecord,
  rawMappings: unknown,
  userId: string,
): Promise<JsonRecord> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(userId) ||
    containsPersistedDeliveryCapability(storedPayload)
  ) {
    throw new Error("EXPORT_STORED_MEDIA_CAPABILITY_INVALID");
  }

  const cloned = structuredClone(storedPayload);
  const data = isPlainObject(cloned.data) ? cloned.data : null;
  const messages = data && Array.isArray(data.chat_messages_authored)
    ? data.chat_messages_authored
    : [];
  const manifest = isPlainObject(cloned.manifest) ? cloned.manifest : null;
  const mediaManifest = isPlainObject(cloned.media_manifest)
    ? cloned.media_manifest
    : null;
  if (
    !data ||
    !manifest ||
    !mediaManifest ||
    mediaManifest.signed_urls_embedded !== false ||
    !Array.isArray(rawMappings) ||
    rawMappings.length > MAX_SUPPLEMENT_MEDIA_REFERENCES
  ) {
    throw new Error(
      Array.isArray(rawMappings) &&
        rawMappings.length > MAX_SUPPLEMENT_MEDIA_REFERENCES
        ? "EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED"
        : "EXPORT_MEDIA_MANIFEST_INVALID",
    );
  }

  const mappings = new Map<string, {
    bucketId: string;
    objectPath: string;
  }>();
  for (const rawMapping of rawMappings) {
    if (!isPlainObject(rawMapping)) {
      throw new Error("EXPORT_MEDIA_MAPPING_INVALID");
    }
    const mediaRef = asString(rawMapping.media_ref, 80).toUpperCase();
    const bucketId = asString(rawMapping.bucket_id, 80);
    const objectPath = asString(rawMapping.object_path, 2000);
    if (
      !/^KEM-[A-F0-9]{32}$/.test(mediaRef) ||
      ![CHAT_MEDIA_BUCKET, LEGACY_CHAT_MEDIA_BUCKET].includes(bucketId) ||
      !/^chat-media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,255}$/
        .test(objectPath) ||
      objectPath.split("/")[2] !== userId ||
      mappings.has(mediaRef)
    ) {
      throw new Error("EXPORT_MEDIA_MAPPING_INVALID");
    }
    mappings.set(mediaRef, { bucketId, objectPath });
  }

  const expectedRefCount = Number(mediaManifest.safe_chat_media_ref_count);
  const expectedManifestRefCount = Number(manifest.media_ref_count);
  if (
    !Number.isSafeInteger(expectedRefCount) ||
    expectedRefCount < 0 ||
    expectedRefCount > MAX_SUPPLEMENT_MEDIA_REFERENCES ||
    expectedRefCount !== mappings.size ||
    !Number.isSafeInteger(expectedManifestRefCount) ||
    expectedManifestRefCount !== mappings.size ||
    manifest.signed_urls_embedded !== false
  ) {
    throw new Error("EXPORT_MEDIA_MAPPING_COUNT_MISMATCH");
  }

  const targets: Array<{
    media: JsonRecord;
    mediaRef: string;
    bucketId: string;
    objectPath: string;
  }> = [];
  const usedRefs = new Set<string>();
  for (const message of messages) {
    if (!isPlainObject(message) || !isPlainObject(message.media)) continue;
    if (message.media.delivery !== "signed_at_download") continue;
    const mediaRef = asString(message.media.media_ref, 80).toUpperCase();
    const mapping = mappings.get(mediaRef);
    if (!mapping) throw new Error("EXPORT_MEDIA_MAPPING_MISSING");
    usedRefs.add(mediaRef);
    targets.push({
      media: message.media,
      mediaRef,
      bucketId: mapping.bucketId,
      objectPath: mapping.objectPath,
    });
  }
  if (usedRefs.size !== mappings.size) {
    throw new Error("EXPORT_MEDIA_MAPPING_ORPHANED");
  }

  const signingStartedAt = Date.now();
  const signedExpiresAt = new Date(
    signingStartedAt + SUPPLEMENT_MEDIA_SIGNED_URL_SECONDS * 1000,
  ).toISOString();
  const signedByMediaRef = await signSupplementMediaTargets(
    [...mappings.entries()].map(([mediaRef, mapping]) => ({
      mediaRef,
      bucketId: mapping.bucketId,
      objectPath: mapping.objectPath,
    })),
    async (bucketId, objectPaths, expiresInSeconds) => {
      const { data: signedData, error } = await admin.storage
        .from(bucketId)
        .createSignedUrls(objectPaths, expiresInSeconds);
      if (error || !Array.isArray(signedData)) {
        throw new Error("EXPORT_MEDIA_SIGNING_FAILED");
      }
      return signedData.map((entry) => ({
        objectPath: asString(entry.path, 2000),
        signedUrl: asString(entry.signedUrl, 20_000),
      }));
    },
  );
  for (const target of targets) {
    const signedUrl = signedByMediaRef.get(target.mediaRef);
    if (!signedUrl) throw new Error("EXPORT_MEDIA_SIGNING_FAILED");
    target.media.delivery = "short_lived_signed_url";
    target.media.download_url = signedUrl;
    target.media.download_expires_at = signedExpiresAt;
  }

  mediaManifest.delivery =
    "private_chat_media_signed_only_for_this_authenticated_delivery";
  mediaManifest.signed_urls_embedded = targets.length > 0;
  mediaManifest.signed_chat_media_count = targets.length;
  mediaManifest.download_urls_expire_at = targets.length > 0
    ? signedExpiresAt
    : null;
  manifest.media_delivery =
    "Private chat media capabilities are minted only after owner/session and artifact-integrity checks.";
  return await withRecomputedExportIntegrity(cloned);
}

async function transitionRequest(
  admin: SupabaseClient,
  row: DataSubjectRequest,
  newStatus: RequestStatus,
  eventType: string,
  publicMessage: string,
): Promise<DataSubjectRequest> {
  const { data, error } = await admin.rpc(
    "kc_transition_data_subject_request",
    {
      p_request_id: row.id,
      p_expected_status: row.status,
      p_new_status: newStatus,
      p_actor_id: null,
      p_event_type: eventType,
      p_public_message: publicMessage.slice(0, 280),
    },
  );
  if (error) {
    throw new Error(
      `DSR_TRANSITION_FAILED:${asString(error.code, 40)}:${
        asString(error.message, 160)
      }`,
    );
  }
  const transitioned = normalizeRpcRow(data);
  if (!transitioned) throw new Error("DSR_TRANSITION_RETURNED_INVALID_ROW");
  return transitioned;
}

async function transitionRequestForActiveSession(
  admin: SupabaseClient,
  row: DataSubjectRequest,
  newStatus: RequestStatus,
  eventType: string,
  publicMessage: string,
  userId: string,
  sessionId: string,
): Promise<DataSubjectRequest> {
  const { data, error } = await admin.rpc(
    "kc_transition_data_subject_request_for_active_session",
    {
      p_request_id: row.id,
      p_expected_status: row.status,
      p_new_status: newStatus,
      p_user_id: userId,
      p_session_id: sessionId,
      p_event_type: eventType,
      p_public_message: publicMessage.slice(0, 280),
    },
  );
  if (error) {
    const message = asString(error.message, 160);
    if (message.includes("SESSION_NOT_ACTIVE")) {
      throw new Error("DSR_SESSION_NOT_ACTIVE");
    }
    throw new Error(
      `DSR_TRANSITION_FAILED:${asString(error.code, 40)}:${message}`,
    );
  }
  const transitioned = normalizeRpcRow(data);
  if (!transitioned) throw new Error("DSR_TRANSITION_RETURNED_INVALID_ROW");
  return transitioned;
}

async function reserveDownloadAttempt(
  admin: SupabaseClient,
  row: DataSubjectRequest,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("kc_reserve_data_subject_download", {
    p_request_id: row.id,
    p_user_id: userId,
    p_limit: 5,
    p_window_seconds: Math.trunc(EXPORT_WINDOW_MS / 1000),
  });
  if (error) {
    throw new Error(`DOWNLOAD_RATE_RESERVE_FAILED:${asString(error.code, 40)}`);
  }
  return data === true;
}

function jwtSessionId(token: string): string | null {
  try {
    const segment = token.split(".")[1] || "";
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const payload = JSON.parse(atob(normalized));
    const sessionId = isPlainObject(payload)
      ? asString(payload.session_id, 80).toLowerCase()
      : "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        .test(sessionId)
      ? sessionId
      : null;
  } catch {
    return null;
  }
}

async function enqueueSupplementArtifact(
  admin: SupabaseClient,
  row: DataSubjectRequest,
  userId: string,
): Promise<JsonRecord | null> {
  const { data, error } = await admin.rpc("kc_enqueue_data_export_artifact", {
    p_request_id: row.id,
    p_user_id: userId,
    p_processors: toDataExportProcessorTasks(buildDataProcessorMatrix()),
  });
  if (error) {
    throw new Error(
      `EXPORT_ARTIFACT_ENQUEUE_FAILED:${asString(error.code, 40)}`,
    );
  }
  return isPlainObject(data) ? data : null;
}

async function readSupplementArtifact(
  admin: SupabaseClient,
  requestId: string,
  userId: string,
): Promise<JsonRecord | null> {
  const { data, error } = await admin.rpc(
    "kc_read_data_export_artifact_for_owner",
    {
      p_request_id: requestId,
      p_user_id: userId,
    },
  );
  if (error) {
    throw new Error(`EXPORT_ARTIFACT_READ_FAILED:${asString(error.code, 40)}`);
  }
  return isPlainObject(data) ? data : null;
}

async function readOwnRequest(
  userClient: SupabaseClient,
  protocol: string,
): Promise<DataSubjectRequest | null> {
  const { data, error } = await userClient
    .from("data_subject_requests")
    .select(REQUEST_SELECT)
    .eq("protocol", protocol)
    .maybeSingle();
  if (error) {
    throw new Error(`REQUEST_LOOKUP_FAILED:${asString(error.code, 40)}`);
  }
  return data as DataSubjectRequest | null;
}

async function expireOwnRequests(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("data_subject_requests")
    .select(REQUEST_SELECT)
    .eq("user_id", userId)
    .eq("status", "ready")
    .lt("expires_at", now);
  if (error) {
    console.error("[kc-data-subject-request] expiration lookup failed", {
      code: error.code,
    });
    return;
  }
  for (const candidate of Array.isArray(data) ? data : []) {
    try {
      await transitionRequest(
        admin,
        candidate as unknown as DataSubjectRequest,
        "expired",
        "expired",
        "A janela de download expirou; o protocolo permanece disponivel.",
      );
    } catch (transitionError) {
      console.warn("[kc-data-subject-request] expiration CAS skipped", {
        code: transitionError instanceof Error
          ? transitionError.message.split(":")[0].slice(0, 80)
          : "UNKNOWN",
      });
    }
  }
}

async function prepareExportRequest(
  admin: SupabaseClient,
  row: DataSubjectRequest,
): Promise<DataSubjectRequest> {
  if (!EXPORT_KINDS.has(row.request_kind)) return row;
  if (!["received", "failed"].includes(row.status)) return row;

  // Nao existe trabalho assincrono nesta etapa: a janela e apenas reservada.
  // Uma unica RPC faz CAS + ready_at/expires_at + evento atomicamente, evitando
  // deixar o protocolo preso em "processing" se a Function cair entre calls.
  return await transitionRequest(
    admin,
    row,
    "ready",
    "status_changed",
    "Exportacao pronta para download por tempo limitado.",
  );
}

function requestPublicShape(row: DataSubjectRequest): JsonRecord {
  return {
    id: row.id,
    protocol: row.protocol,
    help_request_id: row.help_request_id,
    request_kind: row.request_kind,
    status: row.status,
    requested_format: row.requested_format,
    request_source: row.request_source,
    export_schema_version: row.export_schema_version,
    scope: Array.isArray(row.scope) ? row.scope : [],
    ready_at: row.ready_at,
    expires_at: row.expires_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    retention_until: row.retention_until,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function buildDataExport(
  admin: SupabaseClient,
  user: User,
  requestRow: DataSubjectRequest,
  options: DataExportBuildOptions = {},
): Promise<ExportBuild> {
  const userId = user.id;
  const supplement = options.supplement === true;
  const authorizationCheckpoint = options.authorizationCheckpoint;
  await authorizationCheckpoint?.();
  const maximumCategoryRows = supplement
    ? MAX_SUPPLEMENT_CATEGORY_ROWS
    : MAX_CATEGORY_ROWS;
  const maximumChatMediaRows = supplement
    ? MAX_SUPPLEMENT_MEDIA_REFERENCES
    : MAX_CHAT_MEDIA_ROWS;
  const maximumSourceRows = supplement
    ? MAX_SUPPLEMENT_SOURCE_ROWS
    : MAX_EXPORT_SOURCE_ROWS;
  const maximumSourceBytes = supplement
    ? MAX_SUPPLEMENT_SOURCE_BYTES
    : MAX_EXPORT_SOURCE_BYTES;
  const processorOutcomes = supplement
    ? normalizeDataExportProcessorOutcomes(options.processorOutcomes || [])
    : toDefaultDataExportProcessorOutcomes(buildDataProcessorMatrix());
  const blockingProcessors = processorOutcomes.filter((entry) =>
    entry.outcome === "manual_follow_up"
  );
  const processorOutcomesComplete = processorOutcomesAreDeliverable(
    processorOutcomes,
  );
  const categories: JsonRecord = {};
  const categoryManifest: CategoryManifest[] = [];
  const localReferenceMaps = new Map<string, Map<string, string>>();
  const supplementMediaRefs: SupplementMediaRef[] = [];
  const supplementMediaRefsByPath = new Map<string, string>();
  const exportBudget: ExportBudget = {
    sourceBytes: 0,
    sourceRows: 0,
    exhausted: false,
    maximumSourceBytes,
    maximumSourceRows,
  };
  let partial = !processorOutcomesComplete;

  function localRef(kind: string, value: unknown): string | null {
    const raw = asString(value, 200);
    if (!raw) return null;
    let references = localReferenceMaps.get(kind);
    if (!references) {
      references = new Map<string, string>();
      localReferenceMaps.set(kind, references);
    }
    const existing = references.get(raw);
    if (existing) return existing;
    const created = `${kind}-${String(references.size + 1).padStart(4, "0")}`;
    references.set(raw, created);
    return created;
  }

  async function loadCategory(
    key: string,
    table: string,
    columns: string,
    filter: (query: any) => any,
    transform: (row: JsonRecord) => unknown,
    options: {
      orderColumn?: string;
      omittedFields?: string[];
      note?: string;
      maximumRows?: number;
    } = {},
  ): Promise<JsonRecord[]> {
    const result = await fetchRows(
      admin,
      table,
      columns,
      filter,
      options.orderColumn === undefined ? "created_at" : options.orderColumn,
      exportBudget,
      options.maximumRows ?? maximumCategoryRows,
      authorizationCheckpoint,
    );
    if (result.unavailable || result.truncated) partial = true;
    const transformed = result.rows.map(transform) as JsonRecord[];
    categories[key] = transformed;
    categoryManifest.push({
      key,
      status: result.unavailable ? "unavailable" : "included",
      included_count: transformed.length,
      truncated: result.truncated,
      omitted_fields: options.omittedFields || [],
      ...(options.note ? { note: options.note } : {}),
    });
    return result.rows;
  }

  categories.authentication = {
    account_ref: localRef("account", user.id),
    email: user.email || null,
    phone: user.phone || null,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    confirmed_at: user.confirmed_at || null,
    email_confirmed_at: user.email_confirmed_at || null,
    phone_confirmed_at: user.phone_confirmed_at || null,
    providers: Array.isArray(user.identities)
      ? user.identities.map((identity) => ({
        provider: identity.provider,
        identity_id: identity.identity_id,
        created_at: identity.created_at,
        last_sign_in_at: identity.last_sign_in_at,
      }))
      : [],
    user_metadata: sanitizeAllowedObject(
      user.user_metadata || {},
      AUTH_USER_METADATA_ALLOWLIST,
    ),
  };
  categoryManifest.push({
    key: "authentication",
    status: "included",
    included_count: 1,
    truncated: false,
    omitted_fields: [
      "app_metadata",
      "access_tokens",
      "refresh_tokens",
      "session_secrets",
      "unrecognized_user_metadata",
      "administrative_notes",
      "invitation_workflow_metadata",
    ],
  });

  const profiles = await loadCategory(
    "profile",
    "profiles",
    [
      "id",
      "full_name",
      "email",
      "display_name",
      "bio",
      "avatar_url",
      "avatar_path",
      "created_at",
      "updated_at",
      "verified",
      "onboarding_completed_at",
      "affiliation",
      "gender_identity",
      "gender_identity_custom",
      "race_color",
      "contact_primary_method",
      "contact_cta_enabled",
      "social_links",
      "social_visibility",
      "profile_public",
      "rating_avg",
      "rating_count",
    ].join(","),
    (query) => query.eq("id", userId),
    (row) => {
      const { id, avatar_url, avatar_path, ...safeProfile } = row;
      return {
        ...(sanitizeValue(safeProfile) as JsonRecord),
        profile_ref: localRef("profile", id),
        avatar: mediaReference(avatar_path || avatar_url),
      };
    },
    {
      orderColumn: "created_at",
      omittedFields: ["is_admin", "raw_authorization_claims"],
      note:
        "Midia representada apenas por referencia segura, sem URL assinada.",
    },
  );
  if (!profiles.length) categories.profile = [];

  const postRows = await loadCategory(
    "posts",
    "posts",
    [
      "id",
      "legacy_id",
      "title",
      "description",
      "price",
      "location",
      "module",
      "category",
      "metadata",
      "created_at",
      "updated_at",
      "status",
      "votos",
      "visibility",
      "expires_at",
      "bumped_at",
      "coupon_clicks",
      "share_count",
      "last_comment_at",
      "view_count",
      "image_url",
    ].join(","),
    (query) => query.eq("author_id", userId),
    (row) => {
      const { id, image_url, metadata, ...safePost } = row;
      return {
        ...(sanitizeValue(safePost) as JsonRecord),
        post_ref: localRef("post", id),
        metadata: sanitizeAllowedObject(metadata, POST_METADATA_ALLOWLIST),
        cover_media: mediaReference(image_url),
      };
    },
    {
      omittedFields: [
        "author_id",
        "moderation_reason",
        "highlight_score",
        "unrecognized_metadata",
        "action_evidence",
        "action_fingerprints",
        "action_fingerprint_contract",
        "action_fingerprint_v2",
        "closed_by",
        "deleted_by",
        "hidden_by_audit",
        "reactivated_by",
      ],
    },
  );

  const postIds = postRows.map((row) => asString(row.id, 80)).filter(Boolean);
  const postMediaRows: JsonRecord[] = [];
  let postMediaUnavailable = false;
  let postMediaTruncated = false;
  for (let index = 0; index < postIds.length; index += 100) {
    const chunk = postIds.slice(index, index + 100);
    const result = await fetchRows(
      admin,
      "post_media",
      "id,post_id,url,is_cover,created_at,sort_order",
      (query) => query.in("post_id", chunk),
      "created_at",
      exportBudget,
      undefined,
      authorizationCheckpoint,
    );
    postMediaRows.push(...result.rows);
    postMediaUnavailable ||= result.unavailable;
    postMediaTruncated ||= result.truncated;
    if (
      postMediaRows.length >= maximumCategoryRows || exportBudget.exhausted
    ) {
      postMediaTruncated = true;
      break;
    }
  }
  categories.post_media = postMediaRows.slice(0, maximumCategoryRows).map((
    row,
  ) => ({
    media_ref: localRef("media", row.id),
    post_ref: localRef("post", row.post_id),
    is_cover: row.is_cover,
    sort_order: row.sort_order,
    created_at: row.created_at,
    media: mediaReference(row.url),
  }));
  partial ||= postMediaUnavailable || postMediaTruncated;
  categoryManifest.push({
    key: "post_media",
    status: postMediaUnavailable ? "unavailable" : "included",
    included_count: (categories.post_media as unknown[]).length,
    truncated: postMediaTruncated,
    omitted_fields: ["url_query", "signed_url_tokens", "binary_content"],
    note: "Somente manifesto; arquivos binarios nao integram este JSON.",
  });

  await loadCategory(
    "comments_authored",
    "comments",
    "id,post_id,parent_id,body,author_name,likes,created_at",
    (query) => query.eq("author_id", userId),
    (row) => ({
      comment_ref: localRef("comment", row.id),
      post_ref: localRef("post", row.post_id),
      parent_comment_ref: localRef("comment", row.parent_id),
      body: sanitizeValue(row.body),
      author_name: sanitizeValue(row.author_name),
      likes: row.likes,
      created_at: row.created_at,
    }),
    {
      omittedFields: ["author_id", "third_party_post_content"],
      note:
        "Relacionamentos usam referencias locais opacas, nunca UUIDs de terceiros.",
    },
  );
  await loadCategory(
    "comment_likes",
    "comment_likes",
    "id,comment_id,created_at",
    (query) => query.eq("user_id", userId),
    (row) => ({
      like_ref: localRef("comment-like", row.id),
      comment_ref: localRef("comment", row.comment_id),
      created_at: row.created_at,
    }),
    { omittedFields: ["user_id", "comment_author"] },
  );
  await loadCategory(
    "post_votes",
    "post_votes",
    "id,post_id,direction,created_at",
    (query) => query.eq("voter_id", userId),
    (row) => ({
      vote_ref: localRef("vote", row.id),
      post_ref: localRef("post", row.post_id),
      direction: row.direction,
      created_at: row.created_at,
    }),
    { omittedFields: ["voter_id", "post_author"] },
  );
  await loadCategory(
    "saved_posts",
    "saved_posts",
    "id,post_id,kind,created_at,updated_at",
    (query) => query.eq("user_id", userId),
    (row) => ({
      saved_ref: localRef("saved-post", row.id),
      post_ref: localRef("post", row.post_id),
      kind: row.kind,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
    { omittedFields: ["user_id", "post_author"] },
  );
  await loadCategory(
    "reports_submitted",
    "reports",
    "id,post_id,entity_id,reason,status,entity_type,created_at",
    (query) => query.eq("reporter_id", userId),
    (row) => ({
      report_ref: localRef("report", row.id),
      target_ref: row.entity_type === "comment"
        ? localRef("comment", row.entity_id)
        : localRef("post", row.post_id || row.entity_id),
      reason: row.reason,
      status: row.status,
      entity_type: row.entity_type,
      created_at: row.created_at,
    }),
    {
      omittedFields: ["reporter_id", "details", "reported_party"],
      note: "Texto/identidade da parte denunciada sao excluidos.",
    },
  );

  const ratingsGiven = await loadCategory(
    "ratings_given",
    "user_ratings",
    "id,target_user_id,context_post_id,rating,comment,created_at,updated_at",
    (query) => query.eq("rater_user_id", userId),
    (row) => ({
      rating_ref: localRef("rating", row.id),
      target_profile_ref: localRef("profile", row.target_user_id),
      context_post_ref: localRef("post", row.context_post_id),
      rating: row.rating,
      comment: sanitizeValue(row.comment),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
    {
      omittedFields: ["rater_user_id"],
      note:
        "Identidade da pessoa avaliada e substituida por referencia local opaca.",
    },
  );
  const ratingsReceived = await loadCategory(
    "ratings_received",
    "user_ratings",
    "id,rater_user_id,context_post_id,rating,created_at,updated_at",
    (query) => query.eq("target_user_id", userId),
    (row) => ({
      rating_ref: localRef("rating", row.id),
      rater_profile_ref: localRef("profile", row.rater_user_id),
      context_post_ref: localRef("post", row.context_post_id),
      rating: row.rating,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
    {
      omittedFields: ["target_user_id", "comment"],
      note: "Identidade e texto livre do avaliador sao excluidos.",
    },
  );
  categories.rating_summary = {
    given_count: ratingsGiven.length,
    received_count: ratingsReceived.length,
  };

  await loadCategory(
    "blocks_created",
    "user_blocks",
    "id,blocked_id,reason,created_at",
    (query) => query.eq("blocker_id", userId),
    (row) => ({
      block_ref: localRef("block", row.id),
      blocked_profile_ref: localRef("profile", row.blocked_id),
      reason: sanitizeValue(row.reason),
      created_at: row.created_at,
    }),
    {
      omittedFields: ["blocker_id", "blocked_subject_hash", "blocked_profile"],
      note:
        "A identidade da pessoa bloqueada e substituida por referencia local opaca.",
    },
  );

  const chatConversations = await fetchRows(
    admin,
    "chat_conversations",
    "id,created_at,last_message_at,last_message_type",
    (query) =>
      query.or(
        `participant_low.eq.${userId},participant_high.eq.${userId}`,
      ),
    "created_at",
    exportBudget,
    undefined,
    authorizationCheckpoint,
  );
  partial ||= chatConversations.unavailable || chatConversations.truncated;
  categories.chat_conversations = chatConversations.rows.map((row) => ({
    conversation_ref: localRef("conversation", row.id),
    created_at: row.created_at,
    last_message_at: row.last_message_at,
    last_message_type: row.last_message_type,
  }));
  categoryManifest.push({
    key: "chat_conversations",
    status: chatConversations.unavailable ? "unavailable" : "included",
    included_count: chatConversations.rows.length,
    truncated: chatConversations.truncated,
    omitted_fields: [
      "participant_low",
      "participant_high",
      "last_message_sender",
      "last_message_preview",
      "archive_flags",
    ],
    note:
      "Somente datas/tipo e referencia local; nenhum dado do outro participante.",
  });

  const chatMessages = await loadCategory(
    "chat_messages_authored",
    "chat_messages",
    "id,conversation_id,message_type,content,media_path,created_at,edited_at,deleted_at",
    (query) => query.eq("sender_id", userId),
    (row) => row,
    {
      omittedFields: [
        "sender_id",
        "conversation_id",
        "e2e_envelope",
        "messages_from_other_participants",
      ],
      note: "Somente mensagens de autoria do titular.",
    },
  );
  const readStates = await fetchRows(
    admin,
    "chat_read_state",
    "conversation_id,last_read_at",
    (query) => query.eq("user_id", userId),
    "last_read_at",
    exportBudget,
    undefined,
    authorizationCheckpoint,
  );
  partial ||= readStates.unavailable || readStates.truncated;

  const validConversationIds = new Set(
    chatConversations.rows.map((row) => asString(row.id, 80)).filter(Boolean),
  );
  const chatMessageExports: JsonRecord[] = chatMessages.map((row) => ({
    message_ref: localRef("message", row.id),
    conversation_ref: localRef("conversation", row.conversation_id),
    message_type: row.message_type,
    content: sanitizeValue(row.content),
    media: null,
    created_at: row.created_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
  }));
  let chatMediaDeliveryFailures = 0;
  const mediaPlan = partitionChatMediaCandidates(
    chatMessages,
    maximumChatMediaRows,
  );
  const signedMediaCandidates = mediaPlan.signed;
  const deferredMediaCandidates = mediaPlan.deferred;
  for (const candidate of deferredMediaCandidates) {
    chatMessageExports[candidate.index].media = {
      ...unavailablePrivateChatMediaReference(
        supplement
          ? "supplement_media_limit_reached"
          : "direct_signed_url_limit_reached",
      ),
      bucket: CHAT_MEDIA_BUCKET,
    };
  }
  chatMediaDeliveryFailures += deferredMediaCandidates.length;

  for (let index = 0; index < signedMediaCandidates.length; index += 10) {
    const chunk = signedMediaCandidates.slice(index, index + 10);
    await authorizationCheckpoint?.();
    const signedResults = await Promise.all(chunk.map(async ({ row }) => {
      const conversationId = asString(row.conversation_id, 80);
      const rawPath = asString(row.media_path, 2000);
      const ownedPath = ownedChatMediaObjectPath(
        rawPath,
        conversationId,
        userId,
        validConversationIds,
      );
      if (!ownedPath) {
        return {
          media: unavailablePrivateChatMediaReference(
            "ownership_validation_failed",
          ),
          delivered: false,
        };
      }
      if (supplement) {
        let mediaRef = supplementMediaRefsByPath.get(ownedPath);
        if (!mediaRef) {
          mediaRef = newSupplementMediaRef();
          supplementMediaRefsByPath.set(ownedPath, mediaRef);
          supplementMediaRefs.push({
            media_ref: mediaRef,
            object_path: ownedPath,
          });
        }
        return {
          delivered: true,
          media: {
            kind: "private_chat_attachment",
            media_ref: mediaRef,
            delivery: "signed_at_download",
          },
        };
      }
      return await signedChatMediaReference(
        admin,
        ownedPath,
        requestRow.expires_at,
      );
    }));
    await authorizationCheckpoint?.();

    signedResults.forEach((result, resultIndex) => {
      const target = chunk[resultIndex];
      chatMessageExports[target.index].media = result.media;
      if (!result.delivered) chatMediaDeliveryFailures += 1;
    });
  }
  if (chatMediaDeliveryFailures > 0) partial = true;
  categories.chat_messages_authored = chatMessageExports;
  const chatMessageManifest = categoryManifest.find(
    (entry) => entry.key === "chat_messages_authored",
  );
  if (chatMessageManifest) {
    chatMessageManifest.note = chatMediaDeliveryFailures > 0
      ? `${chatMediaDeliveryFailures} anexo(s) exigem complemento assistido; nenhuma credencial indisponivel foi ocultada.`
      : supplement
      ? "Somente mensagens de autoria do titular; anexos privados usam referencias opacas e recebem URL curta apenas no download autenticado."
      : "Somente mensagens de autoria do titular; anexos privados usam URL assinada por no maximo 10 minutos.";
  }
  categories.chat_read_state = readStates.rows.map((row) => ({
    conversation_ref: localRef("conversation", row.conversation_id),
    last_read_at: row.last_read_at,
  }));
  categoryManifest.push({
    key: "chat_read_state",
    status: readStates.unavailable ? "unavailable" : "included",
    included_count: readStates.rows.length,
    truncated: readStates.truncated,
    omitted_fields: [
      "conversation_id",
      "last_read_msg_id",
      "other_participants",
    ],
  });

  await loadCategory(
    "chat_reactions_created",
    "chat_reactions",
    "id,message_id,emoji,created_at",
    (query) => query.eq("user_id", userId),
    (row) => ({
      reaction_ref: localRef("reaction", row.id),
      message_ref: localRef("message", row.message_id),
      emoji: row.emoji,
      created_at: row.created_at,
    }),
    { omittedFields: ["user_id", "message_author"] },
  );

  await loadCategory(
    "notifications",
    "notifications",
    "id,type,read,created_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    {
      omittedFields: ["title", "body", "data"],
      note:
        "Conteudo que pode identificar terceiros e excluido; eventos e leitura permanecem.",
    },
  );
  await loadCategory(
    "notification_preferences",
    "notification_preferences",
    "preferences,created_at,updated_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    { omittedFields: [] },
  );
  await loadCategory(
    "notification_channel_targets",
    "notification_channel_targets",
    "channel,destination,consent_granted,consent_at,metadata,created_at,updated_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    {
      omittedFields: [
        "provider_credentials",
        "delivery_attempts",
        "provider_responses",
      ],
    },
  );
  const deliveryOutbox = await loadCategory(
    "notification_delivery_outbox",
    "notification_delivery_outbox",
    [
      "id",
      "event_type",
      "channel",
      "status",
      "destination",
      "attempts_count",
      "last_attempt_at",
      "next_attempt_at",
      "sent_at",
      "created_at",
      "updated_at",
    ].join(","),
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    {
      omittedFields: [
        "notification_id",
        "destination_source",
        "payload",
        "locked_at",
        "locked_by",
        "error_code",
        "error_message",
      ],
    },
  );
  const outboxIds = deliveryOutbox.map((row) => asString(row.id, 80)).filter(
    Boolean,
  );
  const deliveryAttempts: JsonRecord[] = [];
  let attemptsUnavailable = false;
  let attemptsTruncated = false;
  for (let index = 0; index < outboxIds.length; index += 100) {
    const result = await fetchRows(
      admin,
      "notification_delivery_attempts",
      "id,outbox_id,channel,status,provider,response_code,attempted_at",
      (query) => query.in("outbox_id", outboxIds.slice(index, index + 100)),
      "attempted_at",
      exportBudget,
      undefined,
      authorizationCheckpoint,
    );
    deliveryAttempts.push(...result.rows);
    attemptsUnavailable ||= result.unavailable;
    attemptsTruncated ||= result.truncated;
    if (
      deliveryAttempts.length >= maximumCategoryRows || exportBudget.exhausted
    ) {
      attemptsTruncated = true;
      break;
    }
  }
  categories.notification_delivery_attempts = deliveryAttempts
    .slice(0, maximumCategoryRows)
    .map((row) => sanitizeValue(row));
  partial ||= attemptsUnavailable || attemptsTruncated;
  categoryManifest.push({
    key: "notification_delivery_attempts",
    status: attemptsUnavailable ? "unavailable" : "included",
    included_count:
      (categories.notification_delivery_attempts as unknown[]).length,
    truncated: attemptsTruncated,
    omitted_fields: ["response_body", "error_message"],
  });
  await loadCategory(
    "search_preferences",
    "search_preferences",
    "preferences,created_at,updated_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
  );
  await loadCategory(
    "home_category_affinity",
    "home_category_affinity",
    "module_key,category_key,score,interactions_count,created_at,updated_at",
    (query) => query.eq("user_id", userId).eq("owner_kind", "user"),
    (row) => sanitizeValue(row),
    { omittedFields: ["owner_key", "session_id"] },
  );
  await loadCategory(
    "privacy_consents",
    "privacy_consent_events",
    "id,consent_version,preferences_enabled,analytics_enabled,source,created_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    { omittedFields: ["session_hash"] },
  );
  await loadCategory(
    "privacy_analytics",
    "privacy_analytics_events",
    "id,event_name,page_path,entity_type,module_key,metadata,created_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    { omittedFields: ["session_hash", "entity_id", "third_party_identifiers"] },
  );
  await loadCategory(
    "post_views",
    "post_view_events",
    "id,created_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    { omittedFields: ["session_id", "post_id", "post_author"] },
  );
  await loadCategory(
    "search_queries",
    "search_queries",
    "id,term,created_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    {
      omittedFields: ["session_id"],
      note:
        "Consultas anonimizadas sem user_id nao podem ser reidentificadas para exportacao.",
    },
  );
  await loadCategory(
    "legal_acceptances",
    "user_legal_acceptances",
    "id,terms_version,privacy_version,accepted_at,source,metadata,created_at,updated_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
  );
  await loadCategory(
    "audit_activity",
    "audit_log",
    "action,entity_type,created_at",
    (query) => query.eq("actor_id", userId),
    (row) => sanitizeValue(row),
    {
      omittedFields: ["actor_id", "entity_id", "payload"],
      note:
        "Somente a atividade atribuida ao proprio titular, sem alvos nem payload interno.",
    },
  );
  await loadCategory(
    "admin_chart_preferences",
    "kc_admin_chart_prefs",
    "prefs,updated_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    {
      orderColumn: "updated_at",
      omittedFields: ["user_id"],
      note:
        "Categoria vazia para contas que nao usam recursos administrativos.",
    },
  );
  await loadCategory(
    "help_requests",
    "help_requests",
    [
      "id",
      "type",
      "topic",
      "subtopic",
      "subject",
      "message",
      "priority",
      "status",
      "page_path",
      "contact_email",
      "allow_contact",
      "created_at",
      "updated_at",
    ].join(","),
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    {
      omittedFields: [
        "metadata",
        "admin_status",
        "admin_note",
        "admin_decision",
      ],
    },
  );
  await loadCategory(
    "external_access_requests",
    "help_requests",
    [
      "id",
      "subject",
      "message",
      "status",
      "contact_email",
      "allow_contact",
      "admin_status",
      "admin_decided_at",
      "created_at",
      "updated_at",
    ].join(","),
    (query) => query.eq("user_id", userId).eq("type", "external_access"),
    (row) => sanitizeValue(row),
    {
      omittedFields: [
        "metadata",
        "admin_note",
        "admin_decided_by",
        "delivery_claim",
      ],
      note:
        "Inclui o estado/decisao do proprio pedido de acesso externo, sem notas ou dados administrativos.",
    },
  );
  const subjectRequestRows = await loadCategory(
    "data_subject_requests",
    "data_subject_requests",
    REQUEST_SELECT,
    (query) => query.eq("user_id", userId),
    (row) => {
      const publicRow = requestPublicShape(
        row as unknown as DataSubjectRequest,
      );
      const { id, help_request_id, ...safeRequest } = publicRow;
      return {
        ...safeRequest,
        request_ref: localRef("data-subject-request", id),
        help_request_ref: localRef("help-request", help_request_id),
      };
    },
    { omittedFields: ["subject_hash", "idempotency_key"] },
  );
  const subjectRequestIds = subjectRequestRows
    .map((row) => asString(row.id, 80))
    .filter(Boolean);
  const subjectRequestEvents: JsonRecord[] = [];
  let subjectEventsUnavailable = false;
  let subjectEventsTruncated = false;
  for (let index = 0; index < subjectRequestIds.length; index += 100) {
    const result = await fetchRows(
      admin,
      "data_subject_request_events",
      "id,request_id,status,event_type,public_message,created_at",
      (query) =>
        query.in(
          "request_id",
          subjectRequestIds.slice(index, index + 100),
        ),
      "created_at",
      exportBudget,
      undefined,
      authorizationCheckpoint,
    );
    subjectRequestEvents.push(...result.rows);
    subjectEventsUnavailable ||= result.unavailable;
    subjectEventsTruncated ||= result.truncated;
    if (
      subjectRequestEvents.length >= maximumCategoryRows ||
      exportBudget.exhausted
    ) {
      subjectEventsTruncated = true;
      break;
    }
  }
  categories.data_subject_request_events = subjectRequestEvents
    .slice(0, maximumCategoryRows)
    .map((row) => ({
      event_ref: localRef("data-subject-request-event", row.id),
      request_ref: localRef("data-subject-request", row.request_id),
      status: row.status,
      event_type: row.event_type,
      public_message: sanitizeValue(row.public_message),
      created_at: row.created_at,
    }));
  partial ||= subjectEventsUnavailable || subjectEventsTruncated;
  categoryManifest.push({
    key: "data_subject_request_events",
    status: subjectEventsUnavailable ? "unavailable" : "included",
    included_count:
      (categories.data_subject_request_events as unknown[]).length,
    truncated: subjectEventsTruncated,
    omitted_fields: ["actor_user_id", "request_id"],
    note: "Linha do tempo publica do protocolo, sem identificadores de atores.",
  });
  await loadCategory(
    "account_erasure_workflows",
    "account_erasure_requests",
    [
      "id",
      "help_request_id",
      "data_subject_request_id",
      "status",
      "requested_at",
      "confirmation_requested_at",
      "confirmation_channel",
      "confirmation_received_at",
      "confirmed_at",
      "reversible_applied_at",
      "erased_at",
      "counts",
      "receipt",
      "operation_version",
      "retention_until",
      "created_at",
      "updated_at",
    ].join(","),
    (query) => query.eq("user_id", userId),
    (row) => {
      const {
        id,
        help_request_id,
        data_subject_request_id,
        receipt,
        ...safeWorkflow
      } = row;
      return {
        ...(sanitizeValue(safeWorkflow) as JsonRecord),
        erasure_workflow_ref: localRef("account-erasure-workflow", id),
        help_request_ref: localRef("help-request", help_request_id),
        request_ref: localRef("data-subject-request", data_subject_request_id),
        receipt: redactedErasureReceipt(receipt),
      };
    },
    {
      omittedFields: [
        "email_hash",
        "target_email_domain",
        "processed_by",
        "confirmation_evidence_hash",
        "confirmation_recorded_by",
        "operation_claim_token",
        "operation_claimed_by",
        "operation_claimed_at",
        "operation_claim_expires_at",
        "metadata",
      ],
      note:
        "Comprovante redigido; hashes, claims e notas operacionais nao integram a copia.",
    },
  );

  const normalizedEmail = asString(user.email, 320).toLowerCase();
  if (normalizedEmail) {
    await loadCategory(
      "account_invite",
      "kc_invited_emails",
      "email,invited_at,used_at,expires_at",
      (query) => query.eq("email", normalizedEmail),
      (row) => sanitizeValue(row),
      {
        orderColumn: "invited_at",
        omittedFields: ["invited_by", "note"],
      },
    );
  } else {
    categories.account_invite = [];
    categoryManifest.push({
      key: "account_invite",
      status: "included",
      included_count: 0,
      truncated: false,
      omitted_fields: ["invited_by", "note"],
    });
  }

  await loadCategory(
    "post_limits",
    "post_limits",
    "id,module,max_active,created_at,updated_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    { omittedFields: ["created_by", "global_limits"] },
  );
  await loadCategory(
    "post_flood_limits",
    "post_flood_limits",
    "id,module,max_posts,window_minutes,created_at,updated_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    { omittedFields: ["created_by", "global_limits"] },
  );
  await loadCategory(
    "post_flood_resets",
    "post_flood_resets",
    "id,module,reset_at,expires_at,created_at",
    (query) => query.eq("user_id", userId),
    (row) => sanitizeValue(row),
    { omittedFields: ["created_by", "reason"] },
  );

  const administrativeChecks = [
    {
      key: "ad_campaigns_created_or_updated",
      table: "ad_campaigns",
      filter: (query: any) =>
        query.or(`created_by.eq.${userId},updated_by.eq.${userId}`),
    },
    {
      key: "ad_campaign_audit_actions",
      table: "ad_campaign_audit",
      filter: (query: any) => query.eq("changed_by", userId),
    },
    {
      key: "hero_banners_created_or_updated",
      table: "hero_banners",
      filter: (query: any) =>
        query.or(`created_by.eq.${userId},updated_by.eq.${userId}`),
    },
    {
      key: "hero_banner_audit_actions",
      table: "hero_banner_audit",
      filter: (query: any) => query.eq("changed_by", userId),
    },
    {
      key: "ad_network_settings_updates",
      table: "ad_network_settings",
      filter: (query: any) => query.eq("updated_by", userId),
    },
    {
      key: "cadu_review_actions",
      table: "cadu_institutional_source_reviews",
      filter: (query: any) =>
        query.or(`requested_by.eq.${userId},resolved_by.eq.${userId}`),
    },
    {
      key: "unit_metadata_updates",
      table: "kc_unit_meta",
      filter: (query: any) => query.eq("updated_by", userId),
    },
    {
      key: "trusted_publisher_relationships",
      table: "kc_trusted_publishers",
      filter: (query: any) =>
        query.or(`user_id.eq.${userId},created_by.eq.${userId}`),
    },
    {
      key: "post_limits_created",
      table: "post_limits",
      filter: (query: any) => query.eq("created_by", userId),
    },
    {
      key: "post_flood_limits_created",
      table: "post_flood_limits",
      filter: (query: any) => query.eq("created_by", userId),
    },
    {
      key: "post_flood_resets_created",
      table: "post_flood_resets",
      filter: (query: any) => query.eq("created_by", userId),
    },
  ];
  const administrativeCounts: Array<{
    relationship: string;
    match_count: number | null;
  }> = [];
  for (const check of administrativeChecks) {
    await authorizationCheckpoint?.();
    administrativeCounts.push({
      relationship: check.key,
      match_count: await countMatchingRows(admin, check.table, check.filter),
    });
    await authorizationCheckpoint?.();
  }
  const administrativeRelationships = administrativeCounts
    .filter((entry) => entry.match_count === null || entry.match_count > 0)
    .map((entry) => ({
      relationship: entry.relationship,
      match_count: entry.match_count,
      resolution: "manual_supplement_required",
    }));
  categories.administrative_relationships = administrativeRelationships;
  if (administrativeRelationships.length > 0) partial = true;
  categoryManifest.push({
    key: "administrative_relationships",
    status: administrativeRelationships.some((entry) =>
        entry.match_count === null
      )
      ? "unavailable"
      : "included",
    included_count: administrativeRelationships.length,
    truncated: false,
    omitted_fields: [
      "third_party_targets",
      "campaign_payloads",
      "audit_snapshots",
      "internal_notes",
    ],
    note: administrativeRelationships.length > 0
      ? "Vinculos detectados por contagem segura; o ticket permanece aberto para complemento manual sem expor terceiros."
      : "Nenhum vinculo administrativo excepcional foi detectado.",
  });

  const generatedAt = new Date().toISOString();
  const mediaManifestItems: JsonRecord[] = [];
  const addMediaManifestItem = (
    category: string,
    ownerRef: unknown,
    media: unknown,
  ) => {
    if (!isPlainObject(media)) return;
    mediaManifestItems.push({
      category,
      owner_ref: asString(ownerRef, 120) || null,
      media,
    });
  };
  for (
    const profile of Array.isArray(categories.profile) ? categories.profile : []
  ) {
    if (isPlainObject(profile)) {
      addMediaManifestItem(
        "profile_avatar",
        profile.profile_ref,
        profile.avatar,
      );
    }
  }
  for (const post of Array.isArray(categories.posts) ? categories.posts : []) {
    if (isPlainObject(post)) {
      addMediaManifestItem("post_cover", post.post_ref, post.cover_media);
    }
  }
  for (
    const postMedia of Array.isArray(categories.post_media)
      ? categories.post_media
      : []
  ) {
    if (isPlainObject(postMedia)) {
      addMediaManifestItem("post_media", postMedia.post_ref, postMedia.media);
    }
  }
  for (
    const chatMessage of Array.isArray(categories.chat_messages_authored)
      ? categories.chat_messages_authored
      : []
  ) {
    if (isPlainObject(chatMessage)) {
      addMediaManifestItem(
        "chat_message_media",
        chatMessage.message_ref,
        chatMessage.media,
      );
    }
  }

  const thirdPartyBoundaries: JsonRecord[] = [
    {
      category: "third_party_data",
      reason:
        "Identidades, mensagens, textos, previews e outros dados pertencentes a terceiros.",
    },
    {
      category: "shared_relationships",
      reason:
        "Identificadores de conversas, autores, alvos, avaliadores e pessoas bloqueadas sao removidos ou substituidos por referencias locais.",
    },
    {
      category: "anonymous_unlinkable_activity",
      reason:
        "Eventos anonimizados ou vinculados apenas a hash de sessao nao sao reidentificados.",
    },
  ];
  const retentionDisclosures: JsonRecord[] = [
    {
      category: "generated_export",
      retention: supplement
        ? "O complemento JSON e armazenado temporariamente em bucket privado ate a expiracao e a limpeza de retencao; apenas metadados operacionais minimos permanecem no protocolo."
        : "O pacote JSON direto e gerado sob demanda e nao e persistido pelo servico de exportacao.",
    },
    {
      category: "request_protocol",
      retention_until: requestRow.retention_until,
      retention:
        "O registro minimo do protocolo segue prazo proprio, separado da janela de download.",
    },
    {
      category: "legal_operational_records",
      retention:
        "Registros sujeitos a obrigacao legal, seguranca, prevencao a fraude ou defesa de direitos podem seguir retencao especifica e revisao assistida.",
    },
  ];
  const intentionallyOmitted: JsonRecord[] = [
    ...thirdPartyBoundaries,
    {
      category: "security_secrets",
      reason:
        "Senhas, tokens de sessao/autenticacao, cookies, chaves, envelopes E2E e credenciais de provedores. Capacidades temporarias de anexos nunca sao persistidas no suplemento.",
    },
    {
      category: "internal_administration",
      reason:
        "Notas, payloads, identificadores de alvos e decisoes administrativas internas.",
    },
    {
      category: "administrative_relationships_manual_review",
      reason:
        "Vinculos excepcionais em banners, campanhas, trusted publishers, CADU e kc_unit_meta exigem revisao manual para separar autoria do titular de dados institucionais ou de terceiros.",
    },
    {
      category: "notification_transport",
      reason:
        "Respostas de provedores, credenciais e runtime interno de entrega.",
    },
  ];
  const signedChatMediaCount =
    mediaManifestItems.filter((item) =>
      item.category === "chat_message_media" &&
      isPlainObject(item.media) &&
      item.media.delivery === "short_lived_signed_url"
    ).length;
  const unavailableChatMediaCount =
    mediaManifestItems.filter((item) =>
      item.category === "chat_message_media" &&
      isPlainObject(item.media) &&
      item.media.delivery === "manual_supplement_required"
    ).length;
  const safeChatMediaRefCount = supplementMediaRefs.length;
  const scopeCompleteness = partial
    ? "partial_manual_supplement_required"
    : "complete_within_automated_scope";
  const core: JsonRecord = {
    schema: "kino-campus-data-export",
    schema_version: 1,
    purpose: requestRow.request_kind,
    protocol: requestRow.protocol,
    generated_at: generatedAt,
    download_expires_at: requestRow.expires_at,
    subject: {
      account_ref: localRef("account", user.id),
      authenticated_email: user.email || null,
    },
    data: categories,
    media_manifest: {
      delivery: supplement
        ? "opaque_private_refs_rehydrated_only_at_authenticated_download"
        : "public_references_and_short_lived_signed_urls_for_private_chat_media",
      binary_files_embedded: false,
      signed_urls_embedded: supplement ? false : signedChatMediaCount > 0,
      signed_chat_media_count: signedChatMediaCount,
      safe_chat_media_ref_count: safeChatMediaRefCount,
      unavailable_chat_media_count: unavailableChatMediaCount,
      items: mediaManifestItems,
    },
    retention_disclosures: retentionDisclosures,
    external_processor_review: {
      outcomes: processorOutcomes,
      blocking_processors: blockingProcessors.map((entry) => entry.processor),
      review_completed: processorOutcomesComplete,
      evidence_embedded_as_sha256_only: processorOutcomes.some((entry) =>
        Boolean(entry.evidence_sha256)
      ),
    },
    processor_outcomes: processorOutcomes,
    third_party_boundaries: thirdPartyBoundaries,
    manifest: {
      completeness: scopeCompleteness,
      scope_completeness: scopeCompleteness,
      local_reference_contract: {
        format: "<entity>-NNNN",
        stable_only_within_this_export: true,
        raw_source_identifiers_embedded_in_references: false,
      },
      category_results: categoryManifest,
      media_delivery: supplement
        ? "Private chat attachments are represented by opaque refs; signed URLs are minted only after authenticated download reservation and integrity validation."
        : "Public references omit query strings; private chat attachments owned by the subject receive signed URLs valid for at most 10 minutes.",
      signed_urls_embedded: supplement ? false : signedChatMediaCount > 0,
      media_ref_count: safeChatMediaRefCount,
      manual_supplement_required: partial,
      intentionally_omitted: intentionallyOmitted,
      retention_notes: retentionDisclosures,
      limits: {
        delivery_mode: supplement ? "assisted_supplement" : "direct",
        maximum_rows_per_category: maximumCategoryRows,
        maximum_chat_messages_with_media_delivery: maximumChatMediaRows,
        maximum_source_rows: maximumSourceRows,
        maximum_source_bytes: maximumSourceBytes,
        consumed_source_rows: exportBudget.sourceRows,
        consumed_source_bytes: exportBudget.sourceBytes,
        source_budget_exhausted: exportBudget.exhausted,
        partial_is_explicit: true,
      },
    },
  };
  await authorizationCheckpoint?.();
  return {
    payload: await withRecomputedExportIntegrity(core),
    partial,
    supplementMediaRefs,
  };
}

function mapDatabaseError(
  error: unknown,
): { status: number; code: string; message: string } {
  const message = isPlainObject(error) ? asString(error.message, 200) : "";
  if (message.includes("DSR_RATE_LIMIT")) {
    return {
      status: 429,
      code: message.includes("24H") ? "RATE_LIMIT_24H" : "RATE_LIMIT_WINDOW",
      message: "Aguarde antes de criar outra solicitacao do mesmo tipo.",
    };
  }
  if (message.includes("PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING")) {
    return {
      status: 409,
      code: "ACCOUNT_ERASURE_IN_PROGRESS",
      message:
        "A exclusao da conta ja entrou na etapa irreversivel; nao e possivel abrir outra solicitacao.",
    };
  }
  if (message.includes("DSR_NOT_FOUND_OR_NOT_CANCELLABLE")) {
    return {
      status: 409,
      code: "NOT_CANCELLABLE",
      message: "A solicitacao nao existe ou ja passou da etapa cancelavel.",
    };
  }
  if (message.includes("DSR_INVALID")) {
    return {
      status: 400,
      code: "INVALID_REQUEST",
      message: "Solicitacao invalida.",
    };
  }
  return {
    status: 500,
    code: "REQUEST_FAILED",
    message: "Nao foi possivel processar a solicitacao.",
  };
}

export async function handleDataSubjectRequest(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(request)) {
      return failure(
        request,
        403,
        "ORIGIN_NOT_ALLOWED",
        "Origem nao permitida.",
      );
    }
    return new Response(null, {
      status: 204,
      headers: securityHeaders(request),
    });
  }
  if (request.method !== "POST") {
    return failure(request, 405, "METHOD_NOT_ALLOWED", "Use POST.");
  }
  if (!isAllowedOrigin(request)) {
    return failure(request, 403, "ORIGIN_NOT_ALLOWED", "Origem nao permitida.");
  }

  const supabaseUrl = env("SUPABASE_URL");
  const publicKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publicKey || !serviceKey) {
    console.error("[kc-data-subject-request] missing server configuration");
    return failure(
      request,
      500,
      "SERVER_CONFIGURATION",
      "Servico indisponivel.",
    );
  }

  const token = extractBearer(request);
  if (!token) {
    return failure(
      request,
      401,
      "AUTH_REQUIRED",
      "Entre na sua conta para continuar.",
    );
  }

  let body: JsonRecord;
  try {
    const rawBody = await readBoundedRequestText(request, 16_384);
    const parsed = JSON.parse(rawBody);
    if (!isPlainObject(parsed)) throw new Error("not-object");
    body = parsed;
  } catch (error) {
    if (
      error instanceof BoundedRequestBodyError &&
      error.code === "BODY_TOO_LARGE"
    ) {
      return failure(
        request,
        413,
        "BODY_TOO_LARGE",
        "Corpo da solicitacao muito grande.",
      );
    }
    return failure(request, 400, "INVALID_JSON", "Corpo JSON invalido.");
  }

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(
    token,
  );
  const user = authData?.user || null;
  if (authError || !user || user.is_anonymous) {
    return failure(
      request,
      401,
      "AUTH_INVALID",
      "Sessao invalida ou expirada.",
    );
  }
  const expectedUserId = asString(body.expected_user_id, 64).toLowerCase();
  if (expectedUserId && expectedUserId !== user.id.toLowerCase()) {
    return failure(
      request,
      409,
      "ACCOUNT_CHANGED",
      "A conta ativa mudou durante a operacao. Revise o pedido antes de tentar novamente.",
    );
  }

  if (!(await isCurrentSessionActive(userClient))) {
    return failure(
      request,
      401,
      "SESSION_NOT_ACTIVE",
      "Entre novamente na sua conta para realizar esta operacao.",
    );
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const action = asString(body.action || "create", 40).toLowerCase();

  try {
    if (action === "create") {
      const requestKind = normalizeRequestKind(body.request_kind);
      const idempotencyKey = asString(body.idempotency_key, 128);
      if (!requestKind) {
        return failure(
          request,
          400,
          "INVALID_REQUEST_KIND",
          "Tipo de solicitacao invalido.",
        );
      }
      if (!IDEMPOTENCY_RE.test(idempotencyKey)) {
        return failure(
          request,
          400,
          "INVALID_IDEMPOTENCY_KEY",
          "Chave de idempotencia invalida.",
        );
      }
      if (
        body.requested_format && asString(body.requested_format, 20) !== "json"
      ) {
        return failure(
          request,
          400,
          "UNSUPPORTED_FORMAT",
          "Somente JSON e suportado.",
        );
      }

      const { data, error } = await userClient.rpc(
        "kc_create_data_subject_request_v2",
        {
          p_request_kind: requestKind,
          p_idempotency_key: idempotencyKey,
          p_requested_format: "json",
          p_request_source: normalizeSource(body.request_source),
        },
      );
      if (error) {
        const mapped = mapDatabaseError(error);
        return failure(request, mapped.status, mapped.code, mapped.message);
      }
      const structured = isPlainObject(data) ? data : {};
      const created = normalizeRpcRow(structured.request);
      if (!created) {
        throw new Error("CREATE_RETURNED_INVALID_ROW");
      }
      const prepared = await prepareExportRequest(admin, created);
      return json(request, 201, {
        ok: true,
        request: requestPublicShape(prepared),
        reused_existing: structured.reused_existing === true,
        reuse_reason: asString(structured.reuse_reason, 80) || null,
      });
    }

    await expireOwnRequests(admin, user.id);

    if (action === "list") {
      const requestedLimit = Number(body.limit);
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
        : 50;
      const { data, error } = await userClient
        .from("data_subject_requests")
        .select(REQUEST_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit + 1);
      if (error) throw new Error(`LIST_FAILED:${asString(error.code, 40)}`);
      const rows = Array.isArray(data) ? data : [];
      const hasMore = rows.length > limit;
      const items = rows
        .slice(0, limit)
        .map((row) => requestPublicShape(row as unknown as DataSubjectRequest));
      return json(request, 200, {
        ok: true,
        items,
        total: items.length,
        has_more: hasMore,
      });
    }

    const protocol = normalizeProtocol(body.protocol);
    if (!PROTOCOL_RE.test(protocol)) {
      return failure(request, 400, "INVALID_PROTOCOL", "Protocolo invalido.");
    }

    if (action === "get") {
      const row = await readOwnRequest(userClient, protocol);
      if (!row) {
        return failure(
          request,
          404,
          "NOT_FOUND",
          "Solicitacao nao encontrada.",
        );
      }
      const { data: eventData, error: eventError } = await userClient
        .from("data_subject_request_events")
        .select("status,event_type,public_message,created_at")
        .eq("request_id", row.id)
        .order("created_at", { ascending: true });
      if (eventError) {
        throw new Error(`EVENT_LIST_FAILED:${asString(eventError.code, 40)}`);
      }
      const supplement = EXPORT_KINDS.has(row.request_kind)
        ? await readSupplementArtifact(admin, row.id, user.id)
        : null;
      return json(request, 200, {
        ok: true,
        request: requestPublicShape(row),
        events: Array.isArray(eventData) ? eventData : [],
        supplement,
      });
    }

    if (action === "cancel") {
      const { data, error } = await userClient.rpc(
        "kc_cancel_data_subject_request",
        {
          p_protocol: protocol,
        },
      );
      if (error) {
        const mapped = mapDatabaseError(error);
        return failure(request, mapped.status, mapped.code, mapped.message);
      }
      const cancelled = normalizeRpcRow(data);
      if (!cancelled) throw new Error("CANCEL_RETURNED_INVALID_ROW");
      return json(request, 200, {
        ok: true,
        request: requestPublicShape(cancelled),
      });
    }

    if (action === "download_supplement") {
      const row = await readOwnRequest(userClient, protocol);
      if (!row || !EXPORT_KINDS.has(row.request_kind)) {
        return failure(
          request,
          404,
          "NOT_FOUND",
          "Suplemento nao encontrado.",
        );
      }
      const artifact = await readSupplementArtifact(admin, row.id, user.id);
      const requestedArtifactRef = asString(body.artifact_ref, 80)
        .toUpperCase();
      if (
        !artifact ||
        !["ready", "delivered"].includes(asString(artifact.status, 40)) ||
        !/^KEA-[A-F0-9]{32}$/.test(requestedArtifactRef) ||
        artifact.artifact_ref !== requestedArtifactRef
      ) {
        return failure(
          request,
          409,
          "SUPPLEMENT_NOT_READY",
          "O complemento integral ainda nao esta pronto ou ja expirou.",
        );
      }
      const sessionId = jwtSessionId(token);
      if (!sessionId || !(await isCurrentSessionActive(userClient))) {
        return failure(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "Entre novamente na sua conta para baixar o complemento.",
        );
      }

      const { data: reservationData, error: reservationError } = await admin
        .rpc(
          "kc_reserve_data_export_artifact_download",
          {
            p_artifact_ref: requestedArtifactRef,
            p_expected_version: Number(artifact.version),
            p_user_id: user.id,
            p_session_id: sessionId,
            p_ttl_seconds: 120,
          },
        );
      const reservation = isPlainObject(reservationData)
        ? reservationData
        : null;
      if (reservationError || !reservation) {
        const detail = asString(reservationError?.message, 160);
        return failure(
          request,
          detail.includes("SESSION_NOT_ACTIVE") ? 401 : 409,
          detail.includes("SESSION_NOT_ACTIVE")
            ? "SESSION_NOT_ACTIVE"
            : "SUPPLEMENT_RESERVATION_CONFLICT",
          detail.includes("SESSION_NOT_ACTIVE")
            ? "A sessao foi encerrada antes do download."
            : "O complemento mudou ou esta sendo baixado. Atualize o protocolo.",
        );
      }

      const bucketId = asString(reservation.bucket_id, 80);
      const objectPath = asString(reservation.object_path, 200);
      if (
        bucketId !== "kino-data-exports" ||
        !/^objects\/[a-f0-9]{64}[.]json$/.test(objectPath)
      ) {
        throw new Error("EXPORT_ARTIFACT_STORAGE_REFERENCE_INVALID");
      }
      const expectedByteSize = Number(reservation.byte_size);
      if (
        !Number.isSafeInteger(expectedByteSize) ||
        expectedByteSize < 1 ||
        expectedByteSize > MAX_SUPPLEMENT_ARTIFACT_BYTES
      ) {
        throw new Error("EXPORT_ARTIFACT_SIZE_INVALID");
      }
      const { data: objectData, error: objectError } = await admin.storage
        .from(bucketId)
        .download(objectPath);
      if (objectError || !objectData) {
        throw new Error(
          `EXPORT_ARTIFACT_DOWNLOAD_FAILED:${
            asString(objectError?.message, 80)
          }`,
        );
      }
      if (
        !Number.isSafeInteger(objectData.size) ||
        objectData.size !== expectedByteSize ||
        objectData.size > MAX_SUPPLEMENT_ARTIFACT_BYTES
      ) {
        throw new Error("EXPORT_ARTIFACT_SIZE_MISMATCH");
      }
      const objectBytes = new Uint8Array(await objectData.arrayBuffer());
      const observedSha256 = await sha256BytesHex(objectBytes);
      const expectedSha256 = asString(reservation.sha256, 80).toLowerCase();
      if (
        observedSha256 !== expectedSha256 ||
        objectBytes.byteLength !== expectedByteSize
      ) {
        throw new Error("EXPORT_ARTIFACT_INTEGRITY_MISMATCH");
      }

      // Valida o documento integral antes de consumir o token e concluir o
      // protocolo. JSON corrompido nunca pode produzir um falso "entregue".
      let storedExportPayload: JsonRecord;
      try {
        const parsed = JSON.parse(new TextDecoder().decode(objectBytes));
        if (!isPlainObject(parsed)) throw new Error("not-an-object");
        storedExportPayload = parsed;
      } catch {
        throw new Error("EXPORT_ARTIFACT_JSON_INVALID");
      }
      if (!(await exportIntegrityIsValid(storedExportPayload))) {
        throw new Error("EXPORT_ARTIFACT_PAYLOAD_INTEGRITY_MISMATCH");
      }

      const downloadToken = asString(reservation.download_token, 80);
      let exportPayload: JsonRecord;
      try {
        const { data: mediaMappings, error: mediaMappingsError } = await admin
          .rpc("kc_read_data_export_media_refs_for_download", {
            p_artifact_ref: requestedArtifactRef,
            p_expected_version: Number(reservation.version),
            p_user_id: user.id,
            p_session_id: sessionId,
            p_download_token: downloadToken,
          });
        if (mediaMappingsError || !Array.isArray(mediaMappings)) {
          throw new Error(
            `EXPORT_MEDIA_MAPPING_READ_FAILED:${
              asString(mediaMappingsError?.message, 80)
            }`,
          );
        }
        exportPayload = await rehydrateSupplementMediaForDownload(
          admin,
          storedExportPayload,
          mediaMappings,
          user.id,
        );
      } catch (mediaError) {
        const mediaCode = mediaError instanceof Error
          ? mediaError.message
          : "EXPORT_MEDIA_DELIVERY_FAILED";
        return failure(
          request,
          409,
          mediaCode.includes("LIMIT_EXCEEDED")
            ? "SUPPLEMENT_MEDIA_LIMIT_EXCEEDED"
            : "SUPPLEMENT_MEDIA_DELIVERY_FAILED",
          mediaCode.includes("LIMIT_EXCEEDED")
            ? "O complemento excede o limite seguro de midias e precisa ser reconstruido pela Central de Ajuda."
            : "Nao foi possivel preparar as midias privadas nesta tentativa. Tente novamente apos atualizar o protocolo.",
        );
      }
      if (!(await isCurrentSessionActive(userClient))) {
        return failure(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "A sessao foi encerrada durante o download. Entre novamente para continuar.",
        );
      }

      const { data: consumedData, error: consumedError } = await admin.rpc(
        "kc_consume_data_export_artifact_download",
        {
          p_artifact_ref: requestedArtifactRef,
          p_expected_version: Number(reservation.version),
          p_user_id: user.id,
          p_session_id: sessionId,
          p_download_token: downloadToken,
          p_observed_sha256: observedSha256,
          p_observed_byte_size: objectBytes.byteLength,
        },
      );
      if (consumedError || !isPlainObject(consumedData)) {
        const detail = asString(consumedError?.message, 160);
        return failure(
          request,
          detail.includes("SESSION_NOT_ACTIVE") ? 401 : 409,
          detail.includes("SESSION_NOT_ACTIVE")
            ? "SESSION_NOT_ACTIVE"
            : "SUPPLEMENT_DELIVERY_CONFLICT",
          detail.includes("SESSION_NOT_ACTIVE")
            ? "A sessao foi encerrada antes da entrega."
            : "Nao foi possivel comprovar a entrega. Consulte o protocolo.",
        );
      }
      const filename =
        `kino-campus-dados-completos-${protocol.toLowerCase()}.json`;
      return json(
        request,
        200,
        {
          ok: true,
          filename,
          content_type: "application/json",
          request: requestPublicShape({
            ...row,
            status: "completed",
            completed_at: new Date().toISOString(),
          }),
          supplement: consumedData,
          export: exportPayload,
        },
        {
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-KC-Download-Filename": filename,
        },
      );
    }

    if (action === "download") {
      const row = await readOwnRequest(userClient, protocol);
      if (!row) {
        return failure(
          request,
          404,
          "NOT_FOUND",
          "Solicitacao nao encontrada.",
        );
      }
      if (!EXPORT_KINDS.has(row.request_kind)) {
        return failure(
          request,
          409,
          "NOT_AN_EXPORT_REQUEST",
          "Este protocolo nao corresponde a uma exportacao.",
        );
      }
      if (!["ready", "completed", "partial_failure"].includes(row.status)) {
        return failure(
          request,
          409,
          "EXPORT_NOT_READY",
          row.status === "expired"
            ? "A janela de download expirou; crie uma nova solicitacao."
            : "A exportacao ainda nao esta pronta.",
        );
      }
      if (!row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
        await expireOwnRequests(admin, user.id);
        return failure(
          request,
          410,
          "EXPORT_EXPIRED",
          "A janela de download expirou; crie uma nova solicitacao.",
        );
      }
      const activeSessionId = jwtSessionId(token);
      if (!activeSessionId) {
        return failure(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "Entre novamente na sua conta para realizar esta operacao.",
        );
      }
      if (!(await reserveDownloadAttempt(admin, row, user.id))) {
        return failure(
          request,
          429,
          "DOWNLOAD_RATE_LIMIT",
          "Limite de downloads desta janela atingido. Aguarde uma nova solicitacao.",
        );
      }

      const built = await buildDataExport(admin, user, row);
      if (!(await isCurrentSessionActive(userClient))) {
        return failure(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "A sessao foi encerrada durante a preparacao da copia. Entre novamente para continuar.",
        );
      }
      const serialized = JSON.stringify(built.payload);
      const bytes = new TextEncoder().encode(serialized).byteLength;
      if (bytes > MAX_EXPORT_BYTES) {
        let partialRequest = row;
        if (row.status !== "completed") {
          if (!(await isCurrentSessionActive(userClient))) {
            return failure(
              request,
              401,
              "SESSION_NOT_ACTIVE",
              "A sessao foi encerrada durante a preparacao da copia. Entre novamente para continuar.",
            );
          }
          try {
            partialRequest = await transitionRequestForActiveSession(
              admin,
              row,
              "partial_failure",
              "processing_error",
              "O volume excedeu o limite da entrega direta. O suporte precisa preparar a copia completa.",
              user.id,
              activeSessionId,
            );
          } catch (transitionError) {
            if (
              transitionError instanceof Error &&
              transitionError.message === "DSR_SESSION_NOT_ACTIVE"
            ) {
              return failure(
                request,
                401,
                "SESSION_NOT_ACTIVE",
                "A sessao foi encerrada durante a preparacao da copia. Entre novamente para continuar.",
              );
            }
            if (
              transitionError instanceof Error &&
              transitionError.message.includes("DSR_TRANSITION_FAILED")
            ) {
              return failure(
                request,
                409,
                "REQUEST_STATE_CHANGED",
                "A solicitacao mudou durante o processamento. Consulte o protocolo novamente.",
              );
            }
            throw transitionError;
          }
        }
        const supplement = row.status === "completed"
          ? null
          : await enqueueSupplementArtifact(admin, partialRequest, user.id);
        return json(request, 413, {
          ok: false,
          error: {
            code: "EXPORT_TOO_LARGE",
            message:
              "O volume exige preparacao assistida. A Central de Ajuda continuara o atendimento pelo mesmo protocolo.",
          },
          request: requestPublicShape(partialRequest),
          supplement,
        });
      }

      const targetStatus: RequestStatus = row.status === "completed"
        ? "completed"
        : built.partial
        ? "partial_failure"
        : "completed";
      let completedData: DataSubjectRequest = row;
      let supplement: JsonRecord | null = null;
      if (row.status !== "completed") {
        if (!(await isCurrentSessionActive(userClient))) {
          return failure(
            request,
            401,
            "SESSION_NOT_ACTIVE",
            "A sessao foi encerrada durante a preparacao da copia. Entre novamente para continuar.",
          );
        }
        try {
          completedData = await transitionRequestForActiveSession(
            admin,
            row,
            targetStatus,
            "downloaded",
            built.partial
              ? "Copia entregue com limitacoes explicitadas no manifesto."
              : "Copia dos dados entregue ao titular.",
            user.id,
            activeSessionId,
          );
        } catch (transitionError) {
          if (
            transitionError instanceof Error &&
            transitionError.message === "DSR_SESSION_NOT_ACTIVE"
          ) {
            return failure(
              request,
              401,
              "SESSION_NOT_ACTIVE",
              "A sessao foi encerrada durante a preparacao da copia. Entre novamente para continuar.",
            );
          }
          if (
            transitionError instanceof Error &&
            transitionError.message.includes("DSR_TRANSITION_FAILED")
          ) {
            return failure(
              request,
              409,
              "REQUEST_STATE_CHANGED",
              "A solicitacao mudou durante o processamento. Consulte o protocolo novamente.",
            );
          }
          throw transitionError;
        }
        if (built.partial) {
          supplement = await enqueueSupplementArtifact(
            admin,
            completedData,
            user.id,
          );
        }
      }
      const filename = `kino-campus-dados-${protocol.toLowerCase()}.json`;
      // No replay de um protocolo concluido e no caminho parcial (que ainda
      // permanece recuperavel), revalida antes da resposta. Para uma entrega
      // integral nova, a RPC acabou de validar e bloquear auth.sessions
      // atomicamente. Nao retorne 401 depois de gravar "completed", pois isso
      // registraria uma entrega que o handler deliberadamente reteve.
      if (
        (row.status === "completed" || targetStatus === "partial_failure") &&
        !(await isCurrentSessionActive(userClient))
      ) {
        return failure(
          request,
          401,
          "SESSION_NOT_ACTIVE",
          "A sessao foi encerrada antes da entrega. Entre novamente para continuar.",
        );
      }
      return json(
        request,
        200,
        {
          ok: true,
          filename,
          content_type: "application/json",
          request: requestPublicShape(completedData),
          export: built.payload,
          supplement,
        },
        {
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-KC-Download-Filename": filename,
        },
      );
    }

    return failure(request, 400, "INVALID_ACTION", "Acao invalida.");
  } catch (error) {
    console.error("[kc-data-subject-request] unhandled operation error", {
      action,
      code: error instanceof Error
        ? error.message.split(":")[0].slice(0, 80)
        : "UNKNOWN",
    });
    return failure(
      request,
      500,
      "INTERNAL_ERROR",
      "Nao foi possivel concluir a operacao.",
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleDataSubjectRequest);
}
