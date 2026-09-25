// deno-lint-ignore no-import-prefix
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  INTEGRITY_COLUMNS,
  INTEGRITY_FIELDS,
  integrityMediaReceiptMatches,
  integritySnapshot,
  record,
  sameValue,
} from "./integrity.ts";
import { mediaRows } from "./integrity-media.ts";
import { MEDIA_COLUMNS } from "./media-correction.ts";

export const MODERATION_CONTRACT = "cadu-moderation-cas-v1";
export const MODERATION_COLUMNS = `${INTEGRITY_COLUMNS},moderation_reason`;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;
type Respond = (status: number, body: Row) => Response;

function exactKeys(value: Row, keys: string[]): boolean {
  return Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

export function moderationSnapshot(post: Row): Row {
  return {
    ...integritySnapshot(post),
    moderation_reason: post.moderation_reason ?? null,
  };
}

function httpsUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.hash;
  } catch {
    return false;
  }
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= max &&
    [...value].every((char) =>
      char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127
    );
}

export function validateModerationRequest(
  body: Row,
  current: Row,
): {
  operation: "hide" | "rollback";
  operationId: string;
  rollbackOf?: string;
  expected: Row;
  reason: string;
  evidence: Row[];
} {
  if (
    !exactKeys(body, ["action", "postId", "moderation"]) ||
    body.action !== "moderate" ||
    !UUID.test(String(body.postId || ""))
  ) throw new Error("Contrato de moderação inválido.");
  const input = record(body.moderation);
  if (
    !input || (input.operation !== "hide" && input.operation !== "rollback")
  ) {
    throw new Error("Operação de moderação inválida.");
  }
  const expectedKeys = [
    "operation",
    "operationId",
    "expected",
    "reason",
    "evidence",
    ...(input.operation === "rollback" ? ["rollbackOf"] : []),
  ];
  if (
    !exactKeys(input, expectedKeys) ||
    !UUID.test(String(input.operationId || "")) ||
    (input.operation === "rollback" &&
      (!UUID.test(String(input.rollbackOf || "")) ||
        input.operationId === input.rollbackOf))
  ) throw new Error("Contrato de moderação incompleto.");
  const expected = record(input.expected);
  if (
    !expected ||
    !exactKeys(expected, [...INTEGRITY_FIELDS, "moderation_reason"])
  ) {
    throw new Error(
      "Informe o snapshot completo de 16 campos, incluindo moderação e metadados.",
    );
  }
  if (!sameValue(moderationSnapshot(expected), moderationSnapshot(current))) {
    const conflict = new Error("O post mudou desde a revisão.");
    conflict.name = "MODERATION_CONFLICT";
    throw conflict;
  }
  const metadata = record(current.metadata);
  if (
    !metadata || !boundedText(metadata.source_id, 500) ||
    !httpsUrl(metadata.source_url) ||
    !["eventos", "oportunidades"].includes(String(current.module)) ||
    metadata.manual_edits_lock === true ||
    metadata.manual_edits_lock === "true" ||
    metadata.manual_description === true ||
    metadata.manual_description === "true" ||
    metadata.merged_into_post_id || metadata.dedup_hidden_keep_id
  ) {
    throw new Error("Post sem identidade canônica ou com proteção editorial.");
  }
  const history = metadata.cadu_moderation_history;
  if (
    history !== undefined && (!Array.isArray(history) || history.length >= 64 ||
      history.some((entry) => !record(entry)))
  ) {
    throw new Error("Histórico de moderação inválido ou esgotado.");
  }
  if (
    Array.isArray(history) &&
    history.some((entry) => entry.operation_id === input.operationId)
  ) {
    throw new Error("Operação já registrada; releia o recibo.");
  }
  if (!boundedText(input.reason, 1000) || input.reason.trim().length < 24) {
    throw new Error(
      "Informe motivo editorial objetivo de 24 a 1000 caracteres.",
    );
  }
  if (
    !Array.isArray(input.evidence) || input.evidence.length < 1 ||
    input.evidence.length > 5 ||
    input.evidence.some((entry) => {
      const item = record(entry);
      return !item || !exactKeys(item, ["url", "title", "dates", "venue"]) ||
        !httpsUrl(item.url) ||
        !boundedText(item.title, 500) || !boundedText(item.dates, 300) ||
        !boundedText(item.venue, 300);
    }) ||
    !input.evidence.some((entry) =>
      record(entry)?.url === metadata.source_url
    ) ||
    JSON.stringify(input.evidence).length > 8192
  ) {
    throw new Error(
      "Evidência com URL primária, título, datas e local é obrigatória.",
    );
  }
  if (
    input.operation === "hide" &&
    (current.status !== "published" || current.visibility !== "public" ||
      current.moderation_reason || metadata.cadu_moderation_lock)
  ) {
    throw new Error(
      "Somente publicação ativa sem moderação anterior pode ser ocultada.",
    );
  }
  if (
    input.operation === "rollback" &&
    (current.status !== "hidden" || current.visibility !== "public" ||
      metadata.cadu_moderation_lock !== input.rollbackOf ||
      current.moderation_reason !== `audit-cadu-editorial:${input.rollbackOf}`)
  ) {
    throw new Error("Rollback exige o último bloqueio editorial exato.");
  }
  return {
    operation: input.operation,
    operationId: String(input.operationId),
    ...(input.operation === "rollback"
      ? { rollbackOf: String(input.rollbackOf) }
      : {}),
    expected,
    reason: input.reason.trim(),
    evidence: input.evidence as Row[],
  };
}

export async function handleModeration(
  admin: SupabaseClient,
  userId: string,
  body: Row,
  json: Respond,
): Promise<Response> {
  if (!UUID.test(String(body.postId || ""))) {
    return json(400, {
      ok: false,
      code: "MODERATION_INVALID",
      message: "postId inválido.",
    });
  }
  const { data: current, error: readError } = await admin.from("posts")
    .select(MODERATION_COLUMNS).eq("id", body.postId).maybeSingle();
  if (readError) {
    return json(503, { ok: false, code: "MODERATION_READ_FAILED" });
  }
  if (!current || current.author_id !== userId) {
    return json(404, { ok: false, code: "POST_NOT_FOUND" });
  }
  let input: ReturnType<typeof validateModerationRequest>;
  try {
    input = validateModerationRequest(body, current);
  } catch (error) {
    const conflict = error instanceof Error &&
      error.name === "MODERATION_CONFLICT";
    return json(conflict ? 409 : 422, {
      ok: false,
      code: conflict ? "MODERATION_CONFLICT" : "MODERATION_INVALID",
      message: error instanceof Error ? error.message : "Pedido inválido.",
    });
  }
  const { data: mediaData, error: mediaError } = await admin.from("post_media")
    .select(MEDIA_COLUMNS).eq("post_id", body.postId).order("id");
  let expectedMedia: Row[];
  try {
    expectedMedia = mediaRows(mediaData, body.postId).sort((a, b) =>
      String(a.id).localeCompare(String(b.id))
    );
  } catch {
    return json(503, { ok: false, code: "MODERATION_MEDIA_READ_FAILED" });
  }
  if (mediaError) {
    return json(503, { ok: false, code: "MODERATION_MEDIA_READ_FAILED" });
  }
  let receipt: Row | null = null;
  try {
    const response = await admin.rpc("kc_cadu_moderate_post_cas", {
      p_post_id: body.postId,
      p_actor_id: userId,
      p_expected: input.expected,
      p_expected_media: expectedMedia,
      p_operation: input.operation,
      p_operation_id: input.operationId,
      p_reason: input.reason,
      p_evidence: input.evidence,
      p_rollback_of: input.rollbackOf || null,
    });
    if (response.error || !record(response.data)) {
      throw new Error("receipt_missing");
    }
    receipt = response.data;
  } catch {
    return json(502, {
      ok: false,
      code: "MODERATION_MUTATION_UNCERTAIN",
      message:
        "Sem recibo confirmado. Releia o post e a auditoria antes de repetir.",
    });
  }
  if (!receipt) {
    return json(502, { ok: false, code: "MODERATION_MUTATION_UNCERTAIN" });
  }
  if (receipt.code === "MODERATION_CONFLICT") {
    return json(409, { ok: false, code: "MODERATION_CONFLICT" });
  }
  if (
    receipt.code === "MODERATION_STATE_BLOCKED" ||
    receipt.code === "MODERATION_ROLLBACK_BLOCKED"
  ) {
    return json(422, { ok: false, code: String(receipt.code) });
  }
  const fresh = record(receipt.post);
  const beforeMetadata = record(current.metadata)!;
  const beforeGuard = moderationSnapshot(current);
  delete beforeGuard.status;
  delete beforeGuard.moderation_reason;
  delete beforeGuard.updated_at;
  beforeGuard.metadata = { ...beforeMetadata };
  delete (beforeGuard.metadata as Row).cadu_moderation_history;
  delete (beforeGuard.metadata as Row).cadu_moderation_lock;
  const afterMetadata = record(fresh?.metadata);
  const beforeHistory = Array.isArray(beforeMetadata.cadu_moderation_history)
    ? beforeMetadata.cadu_moderation_history
    : [];
  const history = afterMetadata?.cadu_moderation_history;
  const last = Array.isArray(history) ? record(history.at(-1)) : null;
  const expectedMetadata: Row = {
    ...beforeMetadata,
    cadu_moderation_history: [...beforeHistory, last],
    ...(input.operation === "hide"
      ? { cadu_moderation_lock: input.operationId }
      : {}),
  };
  if (input.operation === "rollback") {
    delete expectedMetadata.cadu_moderation_lock;
  }
  const changedFields = [
    "id",
    "author_id",
    "created_at",
    "title",
    "description",
    "price",
    "location",
    "module",
    "category",
    "visibility",
    "image_url",
    "expires_at",
  ];
  if (
    receipt.ok !== true || receipt.code !== "MODERATION_APPLIED" ||
    receipt.operation_id !== input.operationId ||
    receipt.operation !== input.operation ||
    !fresh || !exactKeys(fresh, [...INTEGRITY_FIELDS, "moderation_reason"]) ||
    !last || !afterMetadata || !sameValue(afterMetadata, expectedMetadata) ||
    !integrityMediaReceiptMatches(
      receipt.post_media,
      expectedMedia,
      body.postId,
    ) ||
    last.operation !== input.operation ||
    last.operation_id !== input.operationId ||
    last.actor_id !== userId || last.reason !== input.reason ||
    last.source_url !== beforeMetadata.source_url ||
    !sameValue(last.evidence, input.evidence) ||
    (input.operation === "rollback" && last.rollback_of !== input.rollbackOf) ||
    !Number.isFinite(Date.parse(String(last.at || ""))) ||
    !Number.isFinite(Date.parse(String(fresh.updated_at || ""))) ||
    changedFields.some((key) =>
      !sameValue(
        moderationSnapshot(fresh)[key],
        moderationSnapshot(current)[key],
      )
    ) ||
    (input.operation === "hide" && (fresh.status !== "hidden" ||
      fresh.moderation_reason !== `audit-cadu-editorial:${input.operationId}` ||
      record(fresh.metadata)?.cadu_moderation_lock !== input.operationId ||
      !record(last.guard) || !Array.isArray(last.media) ||
      !integrityMediaReceiptMatches(last.media, expectedMedia, body.postId) ||
      !sameValue(
        integritySnapshot(last.guard as Row),
        integritySnapshot(beforeGuard),
      ) ||
      !sameValue(
        integritySnapshot({ updated_at: last.after_updated_at }).updated_at,
        integritySnapshot(fresh).updated_at,
      ))) ||
    (input.operation === "rollback" && (fresh.status !== "published" ||
      fresh.moderation_reason !== null ||
      record(fresh.metadata)?.cadu_moderation_lock !== undefined))
  ) {
    return json(502, {
      ok: false,
      code: "MODERATION_RECEIPT_INVALID",
      message:
        "Recibo divergente. Releia o post e a auditoria antes de repetir.",
    });
  }
  return json(200, {
    ok: true,
    code: input.operation === "hide"
      ? "MODERATION_HIDDEN"
      : "MODERATION_ROLLED_BACK",
    contract: MODERATION_CONTRACT,
    post_id: fresh.id,
    status: fresh.status,
    operation_id: input.operationId,
    updated_at: fresh.updated_at,
  });
}
