// Pure preparation for the canonical, reversible same-module repair boundary.
// Persistence must CAS the complete snapshot and its metadata in one UPDATE.
import { mediaRows, prepareMediaSelection } from "./integrity-media.ts";
export const INTEGRITY_CONTRACT = "cadu-edit-integrity-v1";
export const INTEGRITY_FIELDS = [
  "id", "author_id", "created_at", "title", "description", "price", "location", "module", "category",
  "status", "visibility", "image_url", "expires_at", "updated_at", "metadata",
] as const;
export const INTEGRITY_COLUMNS = "id,author_id,created_at,title,description,price,location,module,category,status,visibility,image_url,expires_at,updated_at,metadata";
const MUTABLE_FIELDS = ["title", "description", "price", "location", "category", "visibility", "expires_at"];
const MEDIA_KEYS = ["image_url", "cover_url", "gallery_image_urls", "gallery_count", "cover_render"];
const OPTIONAL_EDITORIAL_KEYS = [
  "source_revision", "review_publication_directive", "action_fingerprint_contract", "action_fingerprint_v2",
  "dates", "validity", "gratuito", "date_start", "date_end", "expires_at",
];
const HISTORY_KEY = "cadu_integrity_history";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RecordValue = Record<string, unknown>;

export class IntegrityError extends Error {
  constructor(message: string, public code = "INTEGRITY_INVALID", public status = 422) { super(message); }
}
export function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}
function exactKeys(value: RecordValue, keys: string[]): boolean {
  return Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value as RecordValue).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical((value as RecordValue)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function sameValue(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }
function timestamp(value: unknown): unknown {
  if (typeof value !== "string" || value.length > 40) return value;
  const match = value.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}(?::?\d{2})?)$/);
  if (!match || !Number.isFinite(Date.parse(value))) return value;
  // Preserve Postgres microseconds; Date alone would silently round CAS down
  // to milliseconds. Only the three timestamp columns are normalized.
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, `.${(match[1] || "").padEnd(6, "0")}Z`);
}
export function integritySnapshot(post: RecordValue): RecordValue {
  return Object.fromEntries(INTEGRITY_FIELDS.map((key) => [key,
    ["created_at", "updated_at", "expires_at"].includes(key) ? timestamp(post[key] ?? null) : post[key] ?? null]));
}
function contentSnapshot(post: RecordValue): RecordValue {
  const snapshot = integritySnapshot(post);
  delete snapshot.updated_at;
  snapshot.metadata = { ...(record(post.metadata) || {}) };
  delete (snapshot.metadata as RecordValue)[HISTORY_KEY];
  return snapshot;
}
export async function integrityHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value) || value.length > max) return "";
  return value.trim();
}
function httpsUrl(value: unknown): string {
  try {
    const raw = cleanText(value, 2048); const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash ? raw : "";
  } catch { return ""; }
}

export function validateIntegrityRequest(body: RecordValue, current: RecordValue): RecordValue {
  if (!exactKeys(body, ["action", "postId", "integrityCorrection"])) {
    throw new IntegrityError("A correcao de integridade nao pode ser combinada com outra edicao ou imagens.");
  }
  const input = record(body.integrityCorrection);
  if (!input || !["correct", "rollback"].includes(String(input.operation))) throw new IntegrityError("Operacao de integridade invalida.");
  const keys = ["operation", "operationId", "expected", "reason", "evidence"];
  keys.push(...(input.operation === "correct" ? ["item", "detachSources"] : ["rollbackOf"]));
  if (input.operation === "correct" && input.mediaSelection !== undefined) keys.push("mediaSelection");
  if (!exactKeys(input, keys) || !UUID.test(String(input.operationId || ""))) throw new IntegrityError("Contrato de integridade incompleto.");
  const expected = record(input.expected);
  if (!expected || !exactKeys(expected, [...INTEGRITY_FIELDS])) throw new IntegrityError("Informe o snapshot completo, incluindo metadata.");
  if (!sameValue(integritySnapshot(expected), integritySnapshot(current))) throw new IntegrityError("O post mudou desde a revisao.", "EDIT_CONFLICT", 409);
  const metadata = record(current.metadata);
  if (!metadata || !cleanText(metadata.source_id, 500) || !httpsUrl(metadata.source_url)) throw new IntegrityError("Identidade canonica ausente.");
  if (!cleanText(input.reason, 1000) || String(input.reason).trim().length < 12) throw new IntegrityError("Informe uma justificativa objetiva.");
  if (!Array.isArray(input.evidence) || !input.evidence.length || input.evidence.length > 12 ||
    input.evidence.some((value) => {
      const evidence = record(value);
      return !evidence || !exactKeys(evidence, ["url", "title", "dates", "venue"]) || !httpsUrl(evidence.url) ||
        !cleanText(evidence.title, 500) || !cleanText(evidence.dates, 300) || !cleanText(evidence.venue, 300);
    }) || !input.evidence.some((value) => (value as RecordValue).url === metadata.source_url)) {
    throw new IntegrityError("Informe evidencias de fonte, titulo, datas e local, incluindo a URL canonica exata.");
  }
  if (["deleted", "hidden", "pending"].includes(String(current.status)) ||
    metadata.merged_into_post_id || metadata.dedup_hidden_keep_id) {
    throw new IntegrityError("A correcao nao reativa nem altera tombstones ou posts moderados.");
  }
  if (!["eventos", "oportunidades"].includes(String(current.module))) throw new IntegrityError("Modulo sem contrato de integridade.");
  if (!Number.isFinite(Date.parse(String(current.updated_at || "")))) throw new IntegrityError("updated_at invalido.");
  if (canonical(input).length > 512_000) throw new IntegrityError("Snapshot de integridade excede o limite seguro.");
  const history = metadata[HISTORY_KEY];
  if (history !== undefined && (!Array.isArray(history) || history.some((entry) => !record(entry)))) {
    throw new IntegrityError("Historico de integridade invalido.");
  }
  if (Array.isArray(history) && (history.length >= 12 || history.some((entry) => entry.operation_id === input.operationId))) {
    throw new IntegrityError("Operacao repetida ou historico completo; nenhuma entrada pode ser descartada.");
  }
  return input;
}

function detachExactSources(metadata: RecordValue, detachments: unknown): RecordValue {
  if (!Array.isArray(detachments) || detachments.length > 24) throw new IntegrityError("detachSources deve ser uma lista limitada.");
  const next = { ...metadata }; const seen = new Set<string>();
  for (const raw of detachments) {
    const detachment = record(raw);
    if (!detachment || !exactKeys(detachment, ["field", "index", "entry"]) ||
      !["merged_sources", "dedup_merged_sources", "source_urls"].includes(String(detachment.field)) ||
      !Number.isSafeInteger(detachment.index) || Number(detachment.index) < 0) throw new IntegrityError("Desvinculacao deve identificar campo, indice e entrada exatos.");
    const key = `${detachment.field}:${detachment.index}`;
    const entries = metadata[String(detachment.field)];
    if (seen.has(key) || !Array.isArray(entries) || !sameValue(entries[Number(detachment.index)], detachment.entry)) {
      throw new IntegrityError("A fonte a desvincular nao corresponde ao snapshot.");
    }
    const entry = record(detachment.entry);
    if (detachment.entry === metadata.source_url || (entry && (
      entry.source_url === metadata.source_url || entry.sourceUrl === metadata.source_url || entry.url === metadata.source_url ||
      entry.source_id === metadata.source_id || entry.sourceId === metadata.source_id))) {
      throw new IntegrityError("A fonte primaria nao pode ser desvinculada.");
    }
    seen.add(key);
  }
  for (const field of ["merged_sources", "dedup_merged_sources", "source_urls"]) {
    if (Array.isArray(metadata[field])) next[field] = (metadata[field] as unknown[]).filter((_, index) => !seen.has(`${field}:${index}`));
  }
  return next;
}

export async function prepareIntegrityUpdate(
  current: RecordValue, input: RecordValue, mappedRow?: RecordValue,
): Promise<{ update: RecordValue; entry: RecordValue; expectedContent: RecordValue; media?: { before: RecordValue[]; after: RecordValue[] } }> {
  const currentMetadata = record(current.metadata)!;
  const history = (currentMetadata[HISTORY_KEY] || []) as RecordValue[];
  const before = contentSnapshot(current);
  let update: RecordValue;
  let media: { before: RecordValue[]; after: RecordValue[] } | undefined;
  if (input.operation === "rollback") {
    const last = history[history.length - 1];
    if (!UUID.test(String(input.rollbackOf)) || !last || last.operation_id !== input.rollbackOf ||
      last.contract !== INTEGRITY_CONTRACT || last.after_hash !== await integrityHash(before)) {
      throw new IntegrityError("Rollback exige a ultima operacao e seu estado exato, sem alteracoes posteriores.", "EDIT_CONFLICT", 409);
    }
    const previous = record(last.before);
    const previousMetadata = record(previous?.metadata);
    const previousMedia = record(last.media);
    if (previousMedia) media = { before: mediaRows(previousMedia.after, current.id), after: mediaRows(previousMedia.before, current.id) };
    if (!previous || !previousMetadata || last.before_hash !== await integrityHash(previous) ||
      ["id", "author_id", "created_at", "module", "status", ...(media ? [] : ["image_url"])].some((key) => !sameValue(previous[key], before[key])) ||
      previousMetadata.source_id !== currentMetadata.source_id || previousMetadata.source_url !== currentMetadata.source_url ||
      (!media && MEDIA_KEYS.some((key) => !sameValue(previousMetadata[key], currentMetadata[key])))) {
      throw new IntegrityError("Snapshot de rollback invalido ou identidade/midia alterada.");
    }
    update = Object.fromEntries(MUTABLE_FIELDS.map((key) => [key, previous[key]]));
    update.metadata = { ...previousMetadata };
    if (media) update.image_url = previous.image_url;
  } else {
    if (!mappedRow || mappedRow.module !== current.module) throw new IntegrityError("A correcao exige o mesmo modulo.");
    const mappedMetadata = record(mappedRow.metadata)!;
    if (mappedMetadata.source_id !== currentMetadata.source_id || mappedMetadata.source_url !== currentMetadata.source_url ||
      mappedRow.visibility !== current.visibility) throw new IntegrityError("A correcao preserva a identidade primaria e a visibilidade.");
    const namedEvents = new Set([
      mappedRow.title, mappedMetadata.source_title, currentMetadata.source_title, currentMetadata.original_title,
    ].join(" ").toLowerCase().match(/\b(?:conepec|conpeex)\b/g) || []);
    if (namedEvents.size > 1) throw new IntegrityError("O titulo corrigido contradiz a identidade lexical da fonte primaria.");
    const detached = detachExactSources(currentMetadata, input.detachSources);
    const metadata = { ...detached, ...mappedMetadata };
    for (const key of ["location", "localizacao"]) if (key in currentMetadata) metadata[key] = mappedRow.location;
    if ("sourceName" in currentMetadata) metadata.sourceName = mappedMetadata.source_unit;
    if ("category" in currentMetadata) metadata.category = mappedRow.category;
    for (const key of OPTIONAL_EDITORIAL_KEYS) if (!(key in mappedMetadata)) delete metadata[key];
    for (const key of MEDIA_KEYS) {
      if (key in currentMetadata) metadata[key] = currentMetadata[key];
      else delete metadata[key];
    }
    // The aliases are curated against the exact old snapshot, never inferred
    // from the corrected item's transport or inherited action fingerprints.
    for (const key of ["merged_sources", "dedup_merged_sources", "source_urls"]) {
      if (key in detached) metadata[key] = detached[key];
      else delete metadata[key];
    }
    // User tags and explicit manual locks are not editorial repair targets.
    for (const key of ["userTags", "userTagKeys", "user_tags", "user_tag_keys"]) {
      if (key in currentMetadata) metadata[key] = currentMetadata[key];
    }
    update = Object.fromEntries(MUTABLE_FIELDS.map((key) => [key, mappedRow[key] ?? null]));
    update.metadata = metadata;
    if (input.mediaSelection !== undefined) {
      media = prepareMediaSelection(input.mediaSelection, current.id);
      const cover = media.after[0].url;
      update.image_url = cover;
      metadata.image_url = cover; metadata.cover_url = cover;
      metadata.gallery_image_urls = media.after.map((row) => row.url);
      metadata.gallery_count = media.after.length;
      for (const key of ["galleryImageUrls", "image_urls", "imageUrls"]) {
        if (key in currentMetadata) metadata[key] = media.after.map((row) => row.url);
      }
      for (const key of ["coverUrl", "imageUrl"]) if (key in currentMetadata) metadata[key] = cover;
      delete metadata.cover_render;
    }
  }
  const after = contentSnapshot({ ...current, ...update });
  const entry: RecordValue = {
    contract: INTEGRITY_CONTRACT, operation_id: input.operationId, operation: input.operation,
    at: new Date().toISOString(), reason: String(input.reason).trim(), evidence: input.evidence,
    ...(input.operation === "rollback" ? { rollback_of: input.rollbackOf } : { detached_sources: input.detachSources }),
    before, before_hash: await integrityHash(before), after_hash: await integrityHash(after),
    ...(media ? { media } : {}),
  };
  (update.metadata as RecordValue)[HISTORY_KEY] = [...history, entry];
  if (canonical(update).length > 1_000_000) throw new IntegrityError("Historico excede o limite; nenhuma entrada sera removida.");
  return { update, entry, expectedContent: after, ...(media ? { media } : {}) };
}

export function integrityReceiptMatches(fresh: RecordValue, expected: RecordValue, operationId: unknown, expectedMetadata: unknown): boolean {
  const history = record(fresh.metadata)?.[HISTORY_KEY];
  const last = Array.isArray(history) ? history[history.length - 1] : null;
  return sameValue(contentSnapshot(fresh), expected) && record(last)?.operation_id === operationId &&
    sameValue(fresh.metadata, expectedMetadata);
}

export function integrityMediaReceiptMatches(actual: unknown, expected: unknown, postId: unknown): boolean {
  try {
    const normalized = (value: unknown) => mediaRows(value, postId).map((row) => ({ ...row, created_at: timestamp(row.created_at) }));
    return sameValue(normalized(actual), normalized(expected));
  } catch { return false; }
}
