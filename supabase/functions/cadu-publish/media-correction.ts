// Remove only byte-identical associations. No editorial mapper or new-publication score.
import {
  INTEGRITY_FIELDS,
  integritySnapshot,
  record,
  sameValue,
} from "./integrity.ts";
import { mediaRows } from "./integrity-media.ts";
import { downloadRemoteImage } from "./image-download.ts";
import { readImageDimensions } from "./util.ts";
import type { RemoteResourceDependencies } from "./remote-resource.ts";

export const MEDIA_CORRECTION_CONTRACT = "cadu-edit-media-selection-v1";
export const MEDIA_HISTORY = "cadu_media_selection_history";
export const CADU_MEDIA_ACTOR = "2345582d-8bf7-4393-aa0d-f9953d0e02ca";
export const MEDIA_COLUMNS = "id,post_id,url,is_cover,sort_order,created_at";
const ARRAY_KEYS = [
  "gallery_image_urls",
  "galleryImageUrls",
  "image_urls",
  "imageUrls",
];
const COVER_KEYS = ["image_url", "cover_url", "imageUrl", "coverUrl"];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const uuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);
const sha = (value: unknown): value is string =>
  typeof value === "string" && SHA.test(value);
export type Row = Record<string, unknown>;
export class MediaCorrectionError extends Error {
  constructor(
    message: string,
    public code = "MEDIA_CORRECTION_INVALID",
    public status = 422,
  ) {
    super(message);
  }
}
function need(value: unknown, message: string): asserts value {
  if (!value) throw new MediaCorrectionError(message);
}
function keys(value: Row, expected: string[]): boolean {
  return Object.keys(value).sort().join() === expected.sort().join();
}
export function normalizedMedia(value: unknown, postId: unknown): Row[] {
  return mediaRows(value, postId).map((r) => ({
    ...r,
    created_at: integritySnapshot({ created_at: r.created_at }).created_at,
  }));
}
export function mediaContent(post: Row): Row {
  const out = integritySnapshot(post);
  delete out.updated_at;
  out.metadata = { ...(record(post.metadata) || {}) };
  delete (out.metadata as Row)[MEDIA_HISTORY];
  return out;
}
export function assertMediaOwner(current: Row, actor: string): void {
  need(
    actor === CADU_MEDIA_ACTOR && current.author_id === actor,
    "Somente o Cadu canonico pode corrigir a propria galeria.",
  );
  const m = record(current.metadata);
  need(
    m && typeof m.source_id === "string" && m.source_id.trim() &&
      typeof m.source_url === "string" && /^https:\/\//.test(m.source_url),
    "Identidade canonica ausente.",
  );
  need(
    ["published", "closed"].includes(String(current.status)) &&
      ["eventos", "oportunidades"].includes(String(current.module)) &&
      !m.merged_into_post_id && !m.dedup_hidden_keep_id,
    "Nao modifica tombstone ou moderacao.",
  );
  need(
    !["manual_edits_lock", "manual_description"].some((k) =>
      m[k] === true || m[k] === "true"
    ),
    "Edicao manual protegida exige reconciliacao separada.",
  );
}
export function parseMediaCorrection(
  body: Row,
  current: Row,
  actor: string,
): Row {
  assertMediaOwner(current, actor);
  need(
    keys(body, ["action", "postId", "mediaCorrection"]) &&
      body.action === "edit" && body.postId === current.id,
    "Selecao de midia nao combina com outra edicao.",
  );
  const input = record(body.mediaCorrection);
  need(
    input &&
      (input.operation === "deduplicate" || input.operation === "rollback"),
    "Operacao de midia invalida.",
  );
  need(
    keys(input, [
      "contract",
      "operation",
      "operationId",
      "expected",
      "expectedRows",
      "reason",
      input.operation === "deduplicate" ? "pairs" : "rollbackOf",
    ]) &&
      input.contract === MEDIA_CORRECTION_CONTRACT &&
      uuid(input.operationId),
    "Contrato de midia incompleto.",
  );
  const expected = record(input.expected);
  need(
    expected && keys(expected, [...INTEGRITY_FIELDS]) &&
      expected.id === current.id,
    "Snapshot de quinze campos obrigatorio.",
  );
  need(
    typeof input.reason === "string" && input.reason.trim().length >= 12 &&
      input.reason.length <= 1000 && !/[\x00-\x1f\x7f]/.test(input.reason),
    "Justificativa objetiva obrigatoria.",
  );
  const rows = normalizedMedia(input.expectedRows, current.id);
  need(
    rows.length >= (input.operation === "deduplicate" ? 2 : 1) &&
      rows.length <= 24,
    "Snapshot completo de midia obrigatorio.",
  );
  if (input.operation === "deduplicate") {
    need(
      Array.isArray(input.pairs) && input.pairs.length >= 1 &&
        input.pairs.length <= 3,
      "Informe de um a tres pares exatos.",
    );
    const removed = new Set<string>();
    for (const value of input.pairs) {
      const p = record(value);
      need(
        p && keys(p, ["removeId", "keepId", "sha256"]) &&
          uuid(p.removeId) && uuid(p.keepId) &&
          p.removeId !== p.keepId && sha(p.sha256) &&
          !removed.has(p.removeId),
        "Par de duplicatas invalido.",
      );
      removed.add(p.removeId);
    }
    need(
      input.pairs.every((value) => !removed.has(String((value as Row).keepId))),
      "Nao admite encadeamento de remocoes.",
    );
  } else {need(
      uuid(input.rollbackOf) &&
        input.rollbackOf !== input.operationId,
      "Operacao de rollback invalida.",
    );}
  need(JSON.stringify(input).length <= 512000, "Snapshot excede limite.");
  return input;
}
export function deduplicatePlan(
  current: Row,
  input: Row,
): { metadata: Row; before: Row[]; after: Row[] } {
  need(
    sameValue(
      integritySnapshot(input.expected as Row),
      integritySnapshot(current),
    ),
    "O post mudou desde a revisao.",
  );
  const before = normalizedMedia(input.expectedRows, current.id);
  const cover = before.filter((r) => r.is_cover === true);
  need(
    cover.length === 1 && current.image_url === cover[0].url,
    "Capa persistida incompativel com a galeria.",
  );
  const m = record(current.metadata)!;
  for (const k of COVER_KEYS) {
    if (k in m) {
      need(
        m[k] === cover[0].url,
        "Alias de capa incompativel; tratar separadamente.",
      );
    }
  }
  if ("cover_render" in m) {
    const render = String(m.cover_render), base = new URL(String(cover[0].url));
    const target = new URL(render);
    if (
      target.origin === base.origin &&
      target.pathname.startsWith("/storage/v1/render/image/public/")
    ) {
      target.pathname = target.pathname.replace(
        "/storage/v1/render/image/public/",
        "/storage/v1/object/public/",
      );
      target.search = "";
    }
    need(
      target.toString() === base.toString(),
      "Render de capa incompativel; tratar separadamente.",
    );
  }
  const removed = new Set<string>();
  for (const raw of input.pairs as Row[]) {
    const a = before.find((r) => r.id === raw.removeId),
      b = before.find((r) => r.id === raw.keepId);
    need(
      a && b && !a.is_cover,
      "O par precisa conter duas associacoes existentes e preservar a capa.",
    );
    removed.add(String(a.url));
  }
  const after = before.filter((r) => !removed.has(String(r.url)));
  need(
    after.length === before.length - (input.pairs as Row[]).length &&
      after.length >= 1,
    "Remocao incoerente.",
  );
  const metadata = structuredClone(m);
  for (const k of ARRAY_KEYS) {
    if (k in metadata) {
      const value = metadata[k];
      need(
        Array.isArray(value) &&
          value.every((u) =>
            typeof u === "string" && before.some((r) => r.url === u)
          ),
        "Alias de galeria fora do snapshot.",
      );
      metadata[k] = value.filter((u) => !removed.has(String(u)));
    }
  }
  if ("gallery_count" in metadata) {
    need(
      metadata.gallery_count === before.length,
      "Contagem de galeria incoerente.",
    );
    metadata.gallery_count = after.length;
  }
  return { metadata, before, after };
}
export async function verifyMediaPairs(
  input: Row,
  postId: unknown,
  deps: RemoteResourceDependencies = {},
): Promise<Row[]> {
  const rows = normalizedMedia(input.expectedRows, postId),
    cache = new Map<string, Promise<Row>>();
  const download = (id: string): Promise<Row> => {
    if (!cache.has(id)) {
      cache.set(
        id,
        (async () => {
          const row = rows.find((r) => r.id === id);
          need(row, "ID fora do snapshot.");
          const url = new URL(String(row.url));
          need(
            url.protocol === "https:" && !url.username && !url.password &&
              !url.port && !url.hash &&
              (url.hostname === "files.cercomp.ufg.br" ||
                (url.hostname === "wacyrkwhkvzwkqpolrbg.supabase.co" &&
                  url.pathname.startsWith(
                    `/storage/v1/object/public/kino-media/post-media/${CADU_MEDIA_ACTOR}/`,
                  ))),
            "Origem de imagem fora do contrato de reparo.",
          );
          const exactFetch: RemoteResourceDependencies = {
            ...deps,
            fetch: async (requested, init) => {
              need(
                requested === url.toString(),
                "Redirect nao integra prova exata de midia.",
              );
              const response = await (deps.fetch || fetch)(requested, init);
              if (response.status >= 300 && response.status < 400) {
                await response.body?.cancel();
                throw new MediaCorrectionError(
                  "Redirect nao integra prova exata de midia.",
                );
              }
              return response;
            },
          };
          const result = await downloadRemoteImage(String(row.url), {
            timeoutMs: 8000,
            maxBytes: 4 * 1024 * 1024,
            userAgent: "KinoCampus-Cadu-media-integrity/1",
          }, exactFetch);
          need(
            readImageDimensions(result.bytes) !== null,
            "Conteudo nao comprova uma imagem raster.",
          );
          const hash = await crypto.subtle.digest(
            "SHA-256",
            result.bytes as BufferSource,
          );
          return {
            id,
            url: row.url,
            sha256: Array.from(
              new Uint8Array(hash),
              (v) => v.toString(16).padStart(2, "0"),
            ).join(""),
            bytes: result.bytes.length,
          };
        })(),
      );
    }
    return cache.get(id)!;
  };
  const proof = [];
  // At most two simultaneous downloads, six unique objects, 24MiB, 24s network budget.
  for (const pair of input.pairs as Row[]) {
    const settled = await Promise.allSettled([
      download(String(pair.removeId)),
      download(String(pair.keepId)),
    ]);
    const failed = settled.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const [removed, kept] = settled.map((r) =>
      (r as PromiseFulfilledResult<Row>).value
    );
    need(
      removed.sha256 === pair.sha256 && kept.sha256 === pair.sha256 &&
        removed.bytes === kept.bytes,
      "SHA completo divergiu da duplicata revisada.",
    );
    proof.push({
      removeId: pair.removeId,
      keepId: pair.keepId,
      sha256: pair.sha256,
      bytes: removed.bytes,
    });
  }
  return proof;
}
export function mediaReceiptValid(
  receipt: Row,
  current: Row,
  input: Row,
  proofs: Row[] = [],
): boolean {
  try {
    const post = record(receipt.post),
      entry = record(receipt.entry),
      metadata = record(post?.metadata);
    if (
      !post || !entry || !metadata || receipt.ok !== true ||
      entry.contract !== MEDIA_CORRECTION_CONTRACT ||
      !uuid(entry.operation_id) ||
      entry.operation_id !== input.operationId ||
      entry.operation !== input.operation ||
      (entry.operation !== "deduplicate" && entry.operation !== "rollback") ||
      !sha(entry.before_hash) || !sha(entry.after_hash) ||
      !uuid(entry.audit_id) || !sha(entry.request_hash) ||
      entry.reason !== input.reason ||
      (entry.operation === "rollback" &&
        (!uuid(entry.rollback_of) || entry.rollback_of !== input.rollbackOf))
    ) return false;
    const prior = record(current.metadata)?.[MEDIA_HISTORY] || [];
    const expectedHistory = receipt.replayed === true
      ? prior
      : [...prior as Row[], entry];
    if (
      !record(entry.before) || !record(entry.after) ||
      !sameValue(metadata[MEDIA_HISTORY], expectedHistory) ||
      !sameValue(mediaContent(post), mediaContent(entry.after as Row))
    ) return false;
    if (
      !sameValue(
        normalizedMedia(receipt.post_media, current.id),
        normalizedMedia(entry.media_after, current.id),
      )
    ) return false;
    if (receipt.replayed === true) {
      return sameValue(
        mediaContent(current),
        mediaContent(entry.after as Row),
      ) && sameValue((prior as Row[]).at(-1), entry);
    }
    if (
      !sameValue(entry.verified_pairs, proofs) ||
      !sameValue(mediaContent(current), mediaContent(entry.before as Row)) ||
      !sameValue(
        normalizedMedia(input.expectedRows, current.id),
        normalizedMedia(entry.media_before, current.id),
      )
    ) return false;
    if (input.operation === "deduplicate") {
      const plan = deduplicatePlan(current, input);
      if (
        !sameValue(
          mediaContent({ ...current, metadata: plan.metadata }),
          mediaContent(entry.after as Row),
        ) ||
        !sameValue(plan.after, normalizedMedia(receipt.post_media, current.id))
      ) return false;
    } else {
      const last = (prior as Row[]).at(-1);
      if (
        !last || last.operation_id !== input.rollbackOf ||
        !sameValue(entry.after, last.before) ||
        !sameValue(
          normalizedMedia(entry.media_after, current.id),
          normalizedMedia(last.media_before, current.id),
        )
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}
