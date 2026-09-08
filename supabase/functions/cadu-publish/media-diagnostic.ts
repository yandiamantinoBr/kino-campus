// Explicit read-only diagnostic. This module receives readers, never a client
// capable of RPC, storage, audit or writes. Verification is not apply authority.
import {
  integrityHash,
  integritySnapshot,
  record,
  sameValue,
} from "./integrity.ts";
import {
  CADU_MEDIA_ACTOR,
  deduplicatePlan,
  MediaCorrectionError,
  normalizedMedia,
  parseMediaCorrection,
  type Row,
  verifyMediaPairs,
} from "./media-correction.ts";
import {
  type RemoteResourceDependencies,
  RemoteResourceError,
} from "./remote-resource.ts";

export const MEDIA_DIAGNOSTIC_CONTRACT =
  "cadu-media-verification-diagnostic-v1";
export interface MediaDiagnosticReaders {
  readPost(id: string): Promise<Row | null>;
  readMedia(id: string): Promise<Row[]>;
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NETWORK_CODES = new Set([
  "remote_url_not_public",
  "remote_resource_aborted",
  "remote_dns_not_public",
  "remote_dns_unavailable",
  "remote_unvalidated_redirect",
  "remote_redirect_loop",
  "remote_redirect_limit",
  "remote_redirect_missing_location",
  "remote_redirect_not_public",
  "remote_body_too_large",
  "image_download_timeout",
  "unsupported_image_type",
  "empty_image",
]);
class DiagnosticTransportError extends Error {}
export function mediaDiagnosticFailure(error: unknown): string {
  if (error instanceof DiagnosticTransportError) {
    return "remote_transport_failed";
  }
  if (
    error instanceof RemoteResourceError && NETWORK_CODES.has(error.message)
  ) return error.message;
  if (
    error instanceof Error &&
    /^image_download_http_[45][0-9]{2}$/.test(error.message)
  ) {
    return "image_download_http_error";
  }
  if (error instanceof MediaCorrectionError) {
    switch (error.message) {
      case "Redirect nao integra prova exata de midia.":
        return "image_redirect_blocked";
      case "SHA completo divergiu da duplicata revisada.":
        return "image_sha256_mismatch";
      case "Conteudo nao comprova uma imagem raster.":
        return "image_raster_unverified";
      case "Origem de imagem fora do contrato de reparo.":
        return "image_origin_not_allowed";
    }
  }
  return "media_verification_failed";
}
function exact(value: Row, keys: string[]): boolean {
  return sameValue(Object.keys(value).sort(), [...keys].sort());
}

export async function handleMediaDiagnostic(
  actor: string,
  body: unknown,
  readers: MediaDiagnosticReaders,
  respond: (status: number, value: Row) => Response,
  deps: RemoteResourceDependencies = {},
): Promise<Response> {
  let stage = "request";
  const result = (status: number, code: string, detail: Row = {}) =>
    respond(status, {
      ok: status === 200,
      code,
      contract: MEDIA_DIAGNOSTIC_CONTRACT,
      read_only: true,
      mutation_dispatched: false,
      stage,
      ...detail,
    });
  try {
    if (actor !== CADU_MEDIA_ACTOR) {
      return result(403, "MEDIA_DIAGNOSTIC_FORBIDDEN");
    }
    const request = record(body), diagnostic = record(request?.mediaDiagnostic);
    if (
      !request || request.action !== "diagnose-media" ||
      !exact(request, ["action", "postId", "mediaDiagnostic"]) ||
      typeof request.postId !== "string" || !UUID.test(request.postId) ||
      !diagnostic || !exact(diagnostic, ["contract", "selection"]) ||
      diagnostic.contract !== MEDIA_DIAGNOSTIC_CONTRACT ||
      !record(diagnostic.selection) || JSON.stringify(request).length > 513000
    ) {
      return result(422, "MEDIA_DIAGNOSTIC_INVALID", {
        diagnostic_code: "diagnostic_request_invalid",
      });
    }
    stage = "snapshot";
    const current = await readers.readPost(request.postId);
    if (!current) return result(404, "MEDIA_DIAGNOSTIC_NOT_FOUND");
    if (current.author_id !== actor) {
      return result(403, "MEDIA_DIAGNOSTIC_FORBIDDEN");
    }
    stage = "selection";
    const input = parseMediaCorrection(
      {
        action: "edit",
        postId: request.postId,
        mediaCorrection: diagnostic.selection,
      },
      current,
      actor,
    );
    if (input.operation !== "deduplicate") {
      return result(422, "MEDIA_DIAGNOSTIC_INVALID", {
        diagnostic_code: "diagnostic_request_invalid",
      });
    }
    stage = "snapshot";
    const media = normalizedMedia(
      await readers.readMedia(request.postId),
      request.postId,
    );
    const snapshot = integritySnapshot(current);
    if (
      !sameValue(snapshot, integritySnapshot(input.expected as Row)) ||
      !sameValue(media, normalizedMedia(input.expectedRows, request.postId))
    ) {
      return result(409, "MEDIA_DIAGNOSTIC_CONFLICT", {
        diagnostic_code: "snapshot_changed",
      });
    }
    stage = "plan";
    deduplicatePlan(current, input);
    stage = "verification";
    // Same URL/DNS/body/timeout/concurrency boundary; only classify raw fetch
    // rejection without returning its arbitrary message, URL or headers.
    const proofs = await verifyMediaPairs(input, request.postId, {
      ...deps,
      fetch: async (url, init) => {
        try {
          return await (deps.fetch || fetch)(url, init);
        } catch {
          throw new DiagnosticTransportError();
        }
      },
    });
    stage = "snapshot_recheck";
    const finalPost = await readers.readPost(request.postId);
    const finalMedia = normalizedMedia(
      await readers.readMedia(request.postId),
      request.postId,
    );
    if (
      !finalPost || !sameValue(snapshot, integritySnapshot(finalPost)) ||
      !sameValue(media, finalMedia)
    ) {
      return result(409, "MEDIA_DIAGNOSTIC_CONFLICT", {
        diagnostic_code: "snapshot_changed",
      });
    }
    return result(200, "MEDIA_DIAGNOSTIC_VERIFIED", {
      post_id: request.postId,
      selection_operation_id: input.operationId,
      selection_hash: await integrityHash(input),
      snapshot_hash: await integrityHash({ post: snapshot, post_media: media }),
      verified_pairs: proofs,
    });
  } catch (error) {
    if (stage === "snapshot" || stage === "snapshot_recheck") {
      return result(503, "MEDIA_DIAGNOSTIC_UNAVAILABLE", {
        diagnostic_code: "snapshot_unavailable",
      });
    }
    return result(422, "MEDIA_DIAGNOSTIC_INVALID", {
      diagnostic_code: stage === "verification"
        ? mediaDiagnosticFailure(error)
        : "media_selection_invalid",
    });
  }
}
