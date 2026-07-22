export const INSTITUTIONAL_REVIEW_POLICY_CODE = "INSTITUTIONAL_SOURCE_REVIEW";
export const INSTITUTIONAL_REVIEW_CONTENT_KIND = "institutional_site";
export const INSTITUTIONAL_REVIEW_INTENT = "review";
export const INSTITUTIONAL_REVIEW_ORIGIN = "cadu-admin-map-ufg";

const SOURCE_ID_PATTERN = /^web\.[a-z0-9][a-z0-9.-]{0,115}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const INSTAGRAM_HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const UNSAFE_MULTILINE_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const INSTITUTIONAL_REVIEW_FIELDS = new Set([
  "action",
  "intent",
  "source_id",
  "source_url",
  "content_url",
  "instagram_handle",
  "content_kind",
  "idempotency_key",
  "source_revision",
  "registry_sha256",
  "name",
  "note",
  "tier",
  "category",
  "source",
]);

export interface InstitutionalReviewInput {
  sourceId: string;
  sourceUrl: string;
  contentUrl: string;
  instagramHandle: string | null;
  contentKind: typeof INSTITUTIONAL_REVIEW_CONTENT_KIND;
  intent: typeof INSTITUTIONAL_REVIEW_INTENT;
  idempotencyKey: string;
  sourceRevision: string;
  registrySha256: string;
  name: string;
  note: string | null;
  tier: number | null;
  category: string;
  origin: typeof INSTITUTIONAL_REVIEW_ORIGIN;
}

export type InstitutionalReviewParseResult =
  | { ok: true; value: InstitutionalReviewInput }
  | { ok: false; errors: string[] };

function plainText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim();
}

function multilineText(value: unknown): string {
  return String(value ?? "").trim();
}

function canonicalHttpsUrl(value: unknown): string {
  const raw = plainText(value);
  if (!raw || CONTROL_CHARACTER_PATTERN.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== "https:" || !parsed.hostname || parsed.username ||
      parsed.password
    ) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function institutionalReviewIdempotencyKey(
  sourceId: string,
  sourceRevision: string,
): string {
  return `map-ufg-review:${sourceId}:${sourceRevision}`;
}

/**
 * Validates the internal Cadu API -> Edge Function review envelope.
 *
 * This is deliberately stricter than the legacy publish input. The caller must
 * already have revalidated the canonical source projection and must bind the
 * request to both the registry and source revisions. The Edge Function still
 * validates shape and identity so a stale/malformed caller fails closed.
 */
export function parseInstitutionalReview(
  body: Record<string, unknown>,
): InstitutionalReviewParseResult {
  const errors: string[] = [];
  const keys = Object.keys(body);
  const missing = [...INSTITUTIONAL_REVIEW_FIELDS].filter((key) =>
    !Object.prototype.hasOwnProperty.call(body, key)
  );
  const unknown = keys.filter((key) => !INSTITUTIONAL_REVIEW_FIELDS.has(key));
  if (missing.length) {
    errors.push(`campos obrigatorios ausentes: ${missing.sort().join(", ")}.`);
  }
  if (unknown.length) {
    errors.push(`campos desconhecidos: ${unknown.sort().join(", ")}.`);
  }
  const sourceId = plainText(body.source_id);
  const sourceUrl = canonicalHttpsUrl(body.source_url);
  const contentUrl = canonicalHttpsUrl(body.content_url);
  const sourceRevision = plainText(body.source_revision);
  const registrySha256 = plainText(body.registry_sha256);
  const name = plainText(body.name);
  const noteValue = body.note;
  const normalizedNote = multilineText(noteValue);
  const category = plainText(body.category).slice(0, 80);
  const origin = plainText(body.source);
  const rawInstagram = body.instagram_handle;
  const instagramHandle = rawInstagram == null || plainText(rawInstagram) === ""
    ? null
    : plainText(rawInstagram);
  let tier: number | null = null;
  if (body.tier !== null) {
    if (
      typeof body.tier !== "number" || !Number.isInteger(body.tier) ||
      body.tier < 1 || body.tier > 3
    ) {
      errors.push("tier deve ser o numero inteiro 1, 2, 3 ou null.");
    } else {
      tier = body.tier;
    }
  }
  const idempotencyKey = plainText(body.idempotency_key);

  if (body.action !== INSTITUTIONAL_REVIEW_INTENT) {
    errors.push("action deve ser 'review'.");
  }
  if (body.intent !== INSTITUTIONAL_REVIEW_INTENT) {
    errors.push("intent deve ser 'review'.");
  }
  if (body.content_kind !== INSTITUTIONAL_REVIEW_CONTENT_KIND) {
    errors.push("content_kind deve ser 'institutional_site'.");
  }
  if (origin !== INSTITUTIONAL_REVIEW_ORIGIN) {
    errors.push("source deve identificar o Mapa UFG do admin.");
  }
  if (body.source !== origin) {
    errors.push("source deve estar em forma canonica.");
  }
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    errors.push("source_id canonico invalido.");
  }
  if (body.source_id !== sourceId) {
    errors.push("source_id deve estar em forma canonica.");
  }
  if (!sourceUrl) errors.push("source_url deve ser uma URL HTTPS canonica.");
  if (sourceUrl.length > 500 || body.source_url !== sourceUrl) {
    errors.push(
      "source_url deve estar em forma canonica e ter ate 500 caracteres.",
    );
  }
  if (!contentUrl) {
    errors.push("content_url deve ser uma URL HTTPS valida e separada.");
  }
  if (contentUrl.length > 500 || body.content_url !== contentUrl) {
    errors.push(
      "content_url deve estar em forma canonica e ter ate 500 caracteres.",
    );
  }
  if (sourceUrl && contentUrl && sourceUrl !== contentUrl) {
    errors.push(
      "content_url deve coincidir com a fonte canonica nesta politica.",
    );
  }
  if (!SHA256_PATTERN.test(sourceRevision)) {
    errors.push("source_revision deve ser SHA-256 lowercase.");
  }
  if (body.source_revision !== sourceRevision) {
    errors.push("source_revision deve estar em forma canonica.");
  }
  if (!SHA256_PATTERN.test(registrySha256)) {
    errors.push("registry_sha256 deve ser SHA-256 lowercase.");
  }
  if (body.registry_sha256 !== registrySha256) {
    errors.push("registry_sha256 deve estar em forma canonica.");
  }
  if (
    body.name !== name ||
    name.length < 2 || name.length > 200 || CONTROL_CHARACTER_PATTERN.test(name)
  ) {
    errors.push(
      "name deve ser canonico e ter entre 2 e 200 caracteres sem controles.",
    );
  }
  if (
    (instagramHandle === null && rawInstagram !== null) ||
    (instagramHandle !== null &&
      (rawInstagram !== instagramHandle ||
        !INSTAGRAM_HANDLE_PATTERN.test(instagramHandle)))
  ) {
    errors.push("instagram_handle deve ser canonico, sem @ ou URL.");
  }
  if (
    noteValue !== null && noteValue !== undefined && (
      typeof noteValue !== "string" ||
      noteValue !== normalizedNote ||
      normalizedNote.length > 500 ||
      UNSAFE_MULTILINE_CONTROL_PATTERN.test(normalizedNote)
    )
  ) {
    errors.push("note deve ter ate 500 caracteres sem controles, ou null.");
  }
  if (
    body.category !== category || category.length < 1 || category.length > 80 ||
    CONTROL_CHARACTER_PATTERN.test(category)
  ) {
    errors.push(
      "category deve ser canonica e ter entre 1 e 80 caracteres sem controles.",
    );
  }

  const expectedIdempotencyKey = institutionalReviewIdempotencyKey(
    sourceId,
    sourceRevision,
  );
  if (idempotencyKey !== expectedIdempotencyKey) {
    errors.push("idempotency_key nao corresponde a source_id/source_revision.");
  }
  if (body.idempotency_key !== idempotencyKey) {
    errors.push("idempotency_key deve estar em forma canonica.");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      sourceId,
      sourceUrl,
      contentUrl,
      instagramHandle,
      contentKind: INSTITUTIONAL_REVIEW_CONTENT_KIND,
      intent: INSTITUTIONAL_REVIEW_INTENT,
      idempotencyKey,
      sourceRevision,
      registrySha256,
      name,
      note: noteValue == null || normalizedNote === ""
        ? null
        : normalizedNote,
      tier,
      category,
      origin: INSTITUTIONAL_REVIEW_ORIGIN,
    },
  };
}

/** Map the validated envelope to the dedicated transactional queue RPC. */
export function institutionalReviewRpcArguments(
  review: InstitutionalReviewInput,
  requestedBy: string,
): Record<string, unknown> {
  return {
    p_requested_by: requestedBy,
    p_source_id: review.sourceId,
    p_source_url: review.sourceUrl,
    p_content_url: review.contentUrl,
    p_instagram_handle: review.instagramHandle,
    p_content_kind: review.contentKind,
    p_intent: review.intent,
    p_idempotency_key: review.idempotencyKey,
    p_source_revision: review.sourceRevision,
    p_registry_sha256: review.registrySha256,
    p_name: review.name,
    p_note: review.note,
    p_tier: review.tier,
    p_category: review.category,
    p_origin: review.origin,
  };
}
