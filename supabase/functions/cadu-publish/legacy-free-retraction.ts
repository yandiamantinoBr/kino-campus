// A deliberately source-bound withdrawal of a contradictory legacy free claim.
// This is not an editor, a source-identity repair, or permission to publish.
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { INTEGRITY_FIELDS, IntegrityError, integrityMediaReceiptMatches, integritySnapshot, record, sameValue } from "./integrity.ts";
import { mediaRows } from "./integrity-media.ts";

export const LEGACY_FREE_CONTRACT = "cadu-legacy-free-retraction-v1";
export const LEGACY_FREE_HISTORY = "cadu_legacy_free_retraction_history";
const PRIMARY = "https://fanut.ufg.br/n/200351";
const OFFICIAL = "https://ufg.br/e/39235-gimon-2026-global-insights-in-microbiome-obesity-nutrition-conference";
const OFFICIAL_EXCERPT = "As inscrições já estão abertas na plataforma Even3, com valores promocionais de acordo com o lote vigente e categorias diferenciadas para estudantes de graduação, pós-graduação e profissionais.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Row = Record<string, unknown>;
function exact(value: unknown, keys: readonly string[]): value is Row {
  return !!record(value) && Object.keys(value as Row).sort().join() === [...keys].sort().join();
}
function invalid(message = "Pedido de retracao legado invalido."): never {
  throw new IntegrityError(message, "LEGACY_FREE_RETRACTION_INVALID");
}
export function validateLegacyFreeRetraction(body: Row, current: Row, now = Date.now()): Row {
  if (!exact(body, ["action", "postId", "legacyFreeRetraction"]) || body.action !== "edit" || body.postId !== current.id) invalid();
  const input = body.legacyFreeRetraction;
  if (!exact(input, ["contract", "operationId", "expected", "expectedMedia", "evidence"]) ||
    input.contract !== LEGACY_FREE_CONTRACT || typeof input.operationId !== "string" || !UUID.test(input.operationId) ||
    !exact(input.expected, INTEGRITY_FIELDS) || JSON.stringify(input).length > 1048576) invalid();
  const meta = record(current.metadata); const evidence = input.evidence;
  const history = meta?.[LEGACY_FREE_HISTORY] === undefined ? [] : meta[LEGACY_FREE_HISTORY];
  if (!Array.isArray(history) || history.length > 49 || history.some((entry) => !record(entry))) invalid();
  if (history.some((entry) => record(entry)?.operation_id === input.operationId)) {
    throw new IntegrityError("Operacao ja registrada; releia o recibo.", "EDIT_CONFLICT", 409);
  }
  if (!sameValue(integritySnapshot(input.expected), integritySnapshot(current))) {
    throw new IntegrityError("O snapshot mudou; releia antes de preparar outra operacao.", "EDIT_CONFLICT", 409);
  }
  if (!meta || current.price !== 0 || meta.gratuito !== true || meta.source_id !== "" || meta.source_url !== PRIMARY ||
    current.status !== "published" || current.visibility !== "public" || current.module !== "eventos" ||
    !/\bGIMON\s+2026\b/i.test(String(current.title)) ||
    meta.merged_into_post_id || meta.dedup_hidden_keep_id ||
    [meta.manual_edits_lock, meta.manual_description].some((value) => value === true || value === "true")) invalid();
  if (typeof current.expires_at !== "string" || !Number.isFinite(Date.parse(current.expires_at)) || Date.parse(current.expires_at) <= now) {
    throw new IntegrityError("O post expirou; esta retracao nao altera validade.", "LEGACY_FREE_RETRACTION_EXPIRED");
  }
  if (!exact(evidence, ["primaryUrl", "primaryAccess", "corroboratingUrl", "corroboratingSha256", "capturedAt",
    "officialExcerpt", "postExcerpt", "relationship", "primaryIdentityPreserved"]) ||
    evidence.primaryUrl !== PRIMARY || evidence.primaryAccess !== "unavailable_not_fetched" ||
    evidence.corroboratingUrl !== OFFICIAL || evidence.relationship !== "existing_alias_and_internal_contradiction" ||
    evidence.primaryIdentityPreserved !== true || typeof evidence.corroboratingSha256 !== "string" || !/^[a-f0-9]{64}$/.test(evidence.corroboratingSha256) ||
    evidence.officialExcerpt !== OFFICIAL_EXCERPT || typeof evidence.postExcerpt !== "string" ||
    evidence.postExcerpt.length < 20 || evidence.postExcerpt.length > 500 ||
    !evidence.postExcerpt.includes("valores por lote") || !String(current.description).includes(evidence.postExcerpt) ||
    typeof evidence.capturedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(evidence.capturedAt) ||
    !Number.isFinite(Date.parse(evidence.capturedAt)) || now - Date.parse(evidence.capturedAt) > 86400000 || Date.parse(evidence.capturedAt) > now + 60000 ||
    !Array.isArray(meta.merged_sources) || !meta.merged_sources.some((alias) => record(alias)?.source_url === OFFICIAL)) invalid("A corroboração oficial deve corresponder ao alias herdado e à contradição já presente, sem afirmar leitura da fonte primária.");
  try { mediaRows(input.expectedMedia, current.id); } catch { invalid("Informe todas as seis colunas de cada midia existente."); }
  return input;
}
function response(status: number, body: Row): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
export async function handleLegacyFreeRetraction(admin: SupabaseClient, userId: string, body: Row, current: Row): Promise<Response> {
  let dispatched = false;
  try {
    const input = validateLegacyFreeRetraction(body, current);
    dispatched = true;
    const { data, error } = await admin.rpc("kc_cadu_retract_legacy_free_claim", {
      p_post_id: current.id, p_actor_id: userId, p_request: input,
    });
    if (error) throw new Error("unconfirmed RPC");
    if (data?.ok === false && data.code === "EDIT_CONFLICT") return response(409, { ok: false, code: "EDIT_CONFLICT" });
    if (data?.ok === false && data.code === "LEGACY_FREE_RETRACTION_EXPIRED") return response(422, { ok: false, code: data.code });
    const fresh = record(data?.post); const metadata = record(fresh?.metadata);
    const oldMetadata = record(current.metadata)!;
    const history = metadata?.[LEGACY_FREE_HISTORY]; const entry = Array.isArray(history) ? record(history.at(-1)) : null;
    if (data?.ok !== true || data.code !== "LEGACY_FREE_RETRACTED" || !fresh || !entry ||
      !exact(fresh, INTEGRITY_FIELDS) || !exact(entry, ["contract", "operation", "operation_id", "at", "evidence", "before", "after", "before_hash", "after_hash"]) ||
      entry.contract !== LEGACY_FREE_CONTRACT || entry.operation !== "retract_legacy_free_claim" || entry.operation_id !== input.operationId ||
      typeof entry.at !== "string" || !Number.isFinite(Date.parse(entry.at)) ||
      !sameValue(entry.evidence, input.evidence) || !sameValue(entry.after, { price: null, gratuito: false }) ||
      !exact(entry.before, ["post", "post_media"]) || !exact(entry.before.post, INTEGRITY_FIELDS) ||
      typeof fresh.updated_at !== "string" || !Number.isFinite(Date.parse(fresh.updated_at)) ||
      !sameValue(integritySnapshot(entry.before.post), integritySnapshot(current)) ||
      !integrityMediaReceiptMatches(record(entry.before)!.post_media, input.expectedMedia as Row[], current.id) ||
      !/^[a-f0-9]{64}$/.test(String(entry.before_hash)) || !/^[a-f0-9]{64}$/.test(String(entry.after_hash)) ||
      !sameValue(metadata, { ...oldMetadata, gratuito: false, [LEGACY_FREE_HISTORY]: [...(oldMetadata[LEGACY_FREE_HISTORY] as unknown[] || []), entry] }) ||
      !sameValue(integritySnapshot(fresh), integritySnapshot({ ...current, price: null, metadata, updated_at: fresh.updated_at })) ||
      !integrityMediaReceiptMatches(data.post_media, input.expectedMedia as Row[], current.id)) throw new Error("invalid RPC receipt");
    return response(200, { ok: true, code: "LEGACY_FREE_RETRACTED", contract: LEGACY_FREE_CONTRACT,
      operation_id: input.operationId, post_id: fresh.id, updated_at: fresh.updated_at,
      source_id: metadata?.source_id, source_url: metadata?.source_url, before_hash: entry.before_hash, after_hash: entry.after_hash });
  } catch (error) {
    if (dispatched) return response(502, { ok: false, code: "LEGACY_FREE_RETRACTION_UNCERTAIN",
      message: "Resposta nao confirmada. Releia post, midias e recibo; nao reenvie automaticamente." });
    if (error instanceof IntegrityError) return response(error.status, { ok: false, code: error.code, message: error.message });
    return response(422, { ok: false, code: "LEGACY_FREE_RETRACTION_INVALID" });
  }
}
