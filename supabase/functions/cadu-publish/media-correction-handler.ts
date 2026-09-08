import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { integritySnapshot, record, sameValue } from "./integrity.ts";
import type { RemoteResourceDependencies } from "./remote-resource.ts";
import {
  deduplicatePlan,
  MEDIA_COLUMNS,
  MEDIA_CORRECTION_CONTRACT,
  MEDIA_HISTORY,
  mediaContent,
  MediaCorrectionError,
  mediaReceiptValid,
  normalizedMedia,
  parseMediaCorrection,
  type Row,
  verifyMediaPairs,
} from "./media-correction.ts";

export async function handleMediaCorrection(
  admin: SupabaseClient,
  actor: string,
  body: Row,
  current: Row,
  respond: (status: number, value: Row) => Response,
  deps: RemoteResourceDependencies = {},
): Promise<Response> {
  let dispatched = false;
  try {
    const input = parseMediaCorrection(body, current, actor);
    const { data: actual, error } = await admin.from("post_media").select(
      MEDIA_COLUMNS,
    ).eq("post_id", current.id).order("sort_order").order("id");
    if (error || !Array.isArray(actual)) {
      throw new MediaCorrectionError(
        "Nao foi possivel confirmar a galeria atual.",
        "MEDIA_SNAPSHOT_UNAVAILABLE",
        503,
      );
    }
    const history = record(current.metadata)?.[MEDIA_HISTORY] || [];
    if (!Array.isArray(history)) {
      throw new MediaCorrectionError("Historico de midia invalido.");
    }
    const last = record(history.at(-1));
    const replay = last?.operation_id === input.operationId;
    let proofs: Row[] = [];
    if (!replay) {
      if (
        !sameValue(
          integritySnapshot(current),
          integritySnapshot(input.expected as Row),
        ) ||
        !sameValue(
          normalizedMedia(actual, current.id),
          normalizedMedia(input.expectedRows, current.id),
        )
      ) {
        return respond(409, {
          ok: false,
          code: "EDIT_CONFLICT",
          message: "Post ou galeria mudou; nenhuma alteracao aplicada.",
        });
      }
      if (input.operation === "deduplicate") {
        deduplicatePlan(current, input);
        proofs = await verifyMediaPairs(input, current.id, deps);
      } else if (
        !last || last.contract !== MEDIA_CORRECTION_CONTRACT ||
        last.operation !== "deduplicate" ||
        last.operation_id !== input.rollbackOf || !record(last.after) ||
        !sameValue(mediaContent(current), mediaContent(last.after as Row)) ||
        !sameValue(
          normalizedMedia(actual, current.id),
          normalizedMedia(last.media_after, current.id),
        )
      ) {
        return respond(409, {
          ok: false,
          code: "EDIT_CONFLICT",
          message: "Rollback exige ultima operacao e estado exato.",
        });
      }
    }
    dispatched = true;
    const { data: receipt, error: rpcError } = await admin.rpc(
      "kc_cadu_select_post_media",
      {
        p_post_id: current.id,
        p_actor_id: actor,
        p_request: input,
        p_verified_pairs: proofs,
      },
    );
    if (rpcError) {
      return respond(502, {
        ok: false,
        code: "MEDIA_MUTATION_UNCERTAIN",
        message: "Releia post, galeria e recibo antes de repetir.",
      });
    }
    if (
      receipt?.ok === false &&
      ["EDIT_CONFLICT", "MEDIA_REPLAY_CONFLICT"].includes(receipt.code)
    ) {
      return respond(409, {
        ok: false,
        code: receipt.code,
        message:
          "Banco confirmou conflito; nenhuma alteracao aplicada nesta tentativa.",
      });
    }
    if (
      !record(receipt) || !mediaReceiptValid(receipt, current, input, proofs)
    ) {
      return respond(502, {
        ok: false,
        code: "MEDIA_MUTATION_UNCERTAIN",
        message:
          "Recibo final incompleto ou divergente; releia antes de repetir.",
      });
    }
    return respond(200, {
      ok: true,
      code: receipt.replayed
        ? "MEDIA_REPLAY_CONFIRMED"
        : (input.operation === "rollback"
          ? "MEDIA_ROLLED_BACK"
          : "MEDIA_DEDUPLICATED"),
      contract: MEDIA_CORRECTION_CONTRACT,
      operation_id: input.operationId,
      post_id: current.id,
      updated_at: receipt.post.updated_at,
      audit_id: receipt.entry.audit_id,
      post_media: receipt.post_media,
      removed_media_ids: input.operation === "deduplicate"
        ? (input.pairs as Row[]).map((p) => p.removeId)
        : [],
      replayed: receipt.replayed === true,
    });
  } catch (error) {
    if (dispatched) {
      return respond(502, {
        ok: false,
        code: "MEDIA_MUTATION_UNCERTAIN",
        message: "Operacao sem confirmacao; releia o recibo antes de repetir.",
      });
    }
    if (error instanceof MediaCorrectionError) {
      return respond(error.status, {
        ok: false,
        code: error.code,
        message: error.message,
      });
    }
    return respond(422, {
      ok: false,
      code: "MEDIA_CORRECTION_INVALID",
      message:
        "Nao foi possivel verificar selecao e bytes integrais; nenhuma escrita solicitada.",
    });
  }
}
