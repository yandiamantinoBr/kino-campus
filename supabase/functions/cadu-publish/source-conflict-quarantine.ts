// One-way withdrawal of the captured Unity source conflict. No editor, date
// choice, publication authority, media mutation or automatic inverse exists.
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { INTEGRITY_FIELDS, IntegrityError, integrityMediaReceiptMatches, integritySnapshot, record, sameValue } from "./integrity.ts";
import { mediaRows } from "./integrity-media.ts";

export const SOURCE_CONFLICT_CONTRACT = "cadu-source-conflict-quarantine-v1";
export const SOURCE_CONFLICT_HISTORY = "cadu_source_conflict_quarantine_history";
const PRIMARY = "https://emc.ufg.br/e/39516-fundamentos-do-unity3d-para-o-desenvolvimento-de-aplicacoes";
const SOURCE_ID = `web.ufg.emc:${PRIMARY}`;
const REVISION = "43f388efbf8989f3c9fa67c57c9908a224f2555f3d6caa50ec82e469cc72247a";
const RUN_ID = "f41b0d5d-b1da-4fad-a902-eb8c7d9877cc";
const TEXT_SHA256 = "709f8c4d1403e75b0fcc27afefefeec03a034d1e058b008574984e77b57868f3";
const TITLE = "Fundamentos do Unity3D para o Desenvolvimento de Aplicações";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Row = Record<string, unknown>;
function exact(value: unknown, keys: readonly string[]): value is Row {
  return !!record(value) && Object.keys(value as Row).sort().join() === [...keys].sort().join();
}
function invalid(message = "Pedido de recolhimento por conflito invalido."): never {
  throw new IntegrityError(message, "SOURCE_CONFLICT_QUARANTINE_INVALID");
}
export async function validateSourceConflictQuarantine(body: Row, current: Row): Promise<Row> {
  if (!exact(body, ["action", "postId", "sourceConflictQuarantine"]) || body.action !== "edit" || body.postId !== current.id) invalid();
  const input = body.sourceConflictQuarantine;
  if (!exact(input, ["contract", "operationId", "expected", "expectedMedia", "evidence"]) ||
    input.contract !== SOURCE_CONFLICT_CONTRACT || typeof input.operationId !== "string" || !UUID.test(input.operationId) ||
    !exact(input.expected, INTEGRITY_FIELDS) || JSON.stringify(input).length > 1048576) invalid();
  const meta = record(current.metadata);
  const history = meta?.[SOURCE_CONFLICT_HISTORY] === undefined ? [] : meta[SOURCE_CONFLICT_HISTORY];
  if (!Array.isArray(history) || history.length > 49 || history.some((entry) => !record(entry))) invalid();
  if (history.some((entry) => record(entry)?.operation_id === input.operationId)) {
    throw new IntegrityError("Operacao ja registrada; releia o recibo.", "EDIT_CONFLICT", 409);
  }
  if (!sameValue(integritySnapshot(input.expected), integritySnapshot(current))) {
    throw new IntegrityError("O snapshot mudou; releia antes de preparar outra operacao.", "EDIT_CONFLICT", 409);
  }
  if (!meta || meta.source_id !== SOURCE_ID || meta.source_url !== PRIMARY || meta.source_registry_id !== "web.ufg.emc" ||
    meta.source_revision !== REVISION || meta.cadu_run_id !== RUN_ID || meta.source_title !== TITLE ||
    current.status !== "published" || current.visibility !== "public" || current.module !== "eventos" ||
    meta.merged_into_post_id || meta.dedup_hidden_keep_id ||
    [meta.manual_edits_lock, meta.manual_description].some((value) => value === true || value === "true")) invalid();
  const evidence = input.evidence;
  if (!exact(evidence, ["sourceUrl", "sourceId", "sourceRevision", "sourceRunId", "primaryAccess", "sourceText", "sourceTextSha256", "reason"]) ||
    evidence.sourceUrl !== PRIMARY || evidence.sourceId !== SOURCE_ID || evidence.sourceRevision !== REVISION || evidence.sourceRunId !== RUN_ID ||
    evidence.primaryAccess !== "captured_in_all_no_refetch" || evidence.reason !== "source_event_schedule_conflict" ||
    evidence.sourceTextSha256 !== TEXT_SHA256 || typeof evidence.sourceText !== "string" || evidence.sourceText.length > 16000 ||
    !evidence.sourceText.includes("08 de Setembro 2026 às 10:30 a 08 de Outubro 2026 às 13:00") ||
    !evidence.sourceText.includes("Data: 15 de outubro a 03 de dezembro de 2026")) invalid("A captura e o conflito devem corresponder exatamente a fonte e revisao auditadas.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(evidence.sourceText));
  const digest = [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (digest !== TEXT_SHA256) invalid("Bytes da captura nao correspondem ao conflito auditado.");
  try { mediaRows(input.expectedMedia, current.id); } catch { invalid("Informe todas as seis colunas de cada midia existente."); }
  return input;
}
function response(status: number, body: Row): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
export async function handleSourceConflictQuarantine(admin: SupabaseClient, userId: string, body: Row, current: Row): Promise<Response> {
  let dispatched = false;
  try {
    const input = await validateSourceConflictQuarantine(body, current);
    dispatched = true;
    const { data, error } = await admin.rpc("kc_cadu_quarantine_source_conflict", { p_post_id: current.id, p_actor_id: userId, p_request: input });
    if (error) throw new Error("unconfirmed RPC");
    if (data?.ok === false && data.code === "EDIT_CONFLICT") return response(409, { ok: false, code: "EDIT_CONFLICT" });
    const fresh = record(data?.post); const metadata = record(fresh?.metadata); const oldMetadata = record(current.metadata)!;
    const history = metadata?.[SOURCE_CONFLICT_HISTORY]; const entry = Array.isArray(history) ? record(history.at(-1)) : null;
    if (data?.ok !== true || data.code !== "SOURCE_CONFLICT_QUARANTINED" || !fresh || !metadata || !entry || !exact(fresh, INTEGRITY_FIELDS) ||
      !exact(entry, ["contract", "operation", "operation_id", "at", "evidence", "before", "after", "before_hash", "after_hash"]) ||
      entry.contract !== SOURCE_CONFLICT_CONTRACT || entry.operation !== "quarantine_source_conflict" || entry.operation_id !== input.operationId ||
      typeof entry.at !== "string" || !Number.isFinite(Date.parse(entry.at)) || !sameValue(entry.evidence, input.evidence) ||
      !sameValue(entry.after, { status: "hidden" }) || !exact(entry.before, ["post", "post_media"]) || !exact(entry.before.post, INTEGRITY_FIELDS) ||
      !sameValue(integritySnapshot(entry.before.post), integritySnapshot(current)) ||
      !integrityMediaReceiptMatches(entry.before.post_media, input.expectedMedia as Row[], current.id) ||
      typeof entry.before_hash !== "string" || !/^[a-f0-9]{64}$/.test(entry.before_hash) ||
      typeof entry.after_hash !== "string" || !/^[a-f0-9]{64}$/.test(entry.after_hash) ||
      typeof fresh.updated_at !== "string" || !Number.isFinite(Date.parse(fresh.updated_at)) ||
      !sameValue(metadata, { ...oldMetadata, [SOURCE_CONFLICT_HISTORY]: [...(oldMetadata[SOURCE_CONFLICT_HISTORY] as unknown[] || []), entry] }) ||
      !sameValue(integritySnapshot(fresh), integritySnapshot({ ...current, status: "hidden", metadata, updated_at: fresh.updated_at })) ||
      !integrityMediaReceiptMatches(data.post_media, input.expectedMedia as Row[], current.id)) throw new Error("invalid RPC receipt");
    return response(200, { ok: true, code: "SOURCE_CONFLICT_QUARANTINED", contract: SOURCE_CONFLICT_CONTRACT,
      operation_id: input.operationId, post_id: fresh.id, status: fresh.status, updated_at: fresh.updated_at,
      source_id: metadata.source_id, source_url: metadata.source_url, before_hash: entry.before_hash, after_hash: entry.after_hash });
  } catch (error) {
    if (dispatched) return response(502, { ok: false, code: "SOURCE_CONFLICT_QUARANTINE_UNCERTAIN",
      message: "Resposta nao confirmada. Releia post, midias e recibo; nao reenvie automaticamente." });
    if (error instanceof IntegrityError) return response(error.status, { ok: false, code: error.code, message: error.message });
    return response(422, { ok: false, code: "SOURCE_CONFLICT_QUARANTINE_INVALID" });
  }
}
