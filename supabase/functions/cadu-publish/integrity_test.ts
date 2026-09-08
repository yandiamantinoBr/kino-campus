import assert from "node:assert/strict";
import { handleEdit } from "./index.ts";
import { INTEGRITY_FIELDS, integrityMediaReceiptMatches, integritySnapshot, sameValue } from "./integrity.ts";
import { integrityReactivationReason, isActiveIntegrityScoreRepair } from "./integrity-lifecycle.ts";

const POST_ID = "6fe40430-94f7-480d-a3da-777e38d0b8f0";
const OWNER = "cadu-user";
const OPERATION_ID = "5b845d46-ff80-4bbc-a6ca-a96940896fbf";
const ROLLBACK_ID = "1b3d02ac-f3de-4023-8629-89807185c2e8";
const SOURCE_URL = "https://ufg.br/n/203312";
const SOURCE_ID = `web.ufg.portal:${SOURCE_URL}`;
const COVER = "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/congress.jpg";
function currentPost() {
  return {
    id: POST_ID, author_id: OWNER, created_at: "2026-08-14T15:16:05.638783+00:00",
    updated_at: "2026-09-07T06:02:29.978654+00:00", status: "published", visibility: "public",
    module: "eventos", category: "academicos", title: "XIV CONEPEC 2026", price: null,
    description: "Descricao longa do CONPEEX, com identidade incorreta no titulo.", location: "Campus Goiás",
    image_url: COVER, expires_at: "2099-10-17T02:59:59.999Z",
    metadata: { source_id: SOURCE_ID, source_url: SOURCE_URL, source_title: "Avaliadores para o CONPEEX",
      original_title: "Avaliadores para o CONPEEX", source_registry_id: "web.ufg.portal", location: "Campus Goiás",
      dates: { eventStartsAt: "2099-10-14", eventEndsAt: "2099-10-16" }, date_start: "2099-10-14",
      image_url: COVER, cover_url: COVER, gallery_image_urls: [COVER], gallery_count: 1,
      userTags: ["Minha tag"], userTagKeys: ["minha-tag"], custom_untouched: "keep",
      action_fingerprints: ["a".repeat(64)], action_fingerprint_v2: ["a".repeat(64)], action_fingerprint_contract: "v2",
      review_publication_directive: { review_id: "conepec-review" },
      merged_sources: [
        { source_id: SOURCE_ID, source_url: SOURCE_URL },
        { source_id: "web.ufg.goias:203582", source_url: "https://goias.ufg.br/n/203582", source_title: "CONEPEC" },
        { source_id: "ig.campusgoias:DboGvkeiSdn", source_url: "https://www.instagram.com/p/DboGvkeiSdn/" },
      ],
    },
  };
}
function correctedItem() {
  return { module: "eventos", category: "academicos", visibility: "public", score: 0.85,
    title: "23º CONPEEX: Congresso de Ensino, Pesquisa e Extensão", sourceTitle: "Avaliadores para o CONPEEX",
    formattedTitle: "23º CONPEEX: de 9 a 13 de novembro", sourceUrl: SOURCE_URL, sourceId: SOURCE_ID,
    sourceRegistryId: "web.ufg.portal", sourceName: "UFG", location: "Campus Samambaia, Goiânia",
    description: "O 23º CONPEEX acontece de 9 a 13 de novembro de 2099, no Campus Samambaia em Goiânia. O prazo de cadastro de avaliadores já foi encerrado.",
    formattedDescription: `O 23º CONPEEX acontece de 9 a 13 de novembro de 2099, no Campus Samambaia em Goiânia. O cadastro de avaliadores já foi encerrado. Consulte a programação oficial: ${SOURCE_URL}`,
    text: "CONPEEX 9 a 13 de novembro de 2099. Campus Samambaia, Goiânia.",
    dates: { eventStartsAt: "2099-11-09", eventEndsAt: "2099-11-13" },
    link: SOURCE_URL, linkAsCta: true, actionLabel: "Saiba mais", actionKey: "saiba-mais",
  };
}
const evidence = () => [{ url: SOURCE_URL, title: "Avaliadores para o CONPEEX", dates: "9 a 13 de novembro de 2099", venue: "Campus Samambaia, Goiânia" }];
function request(post = currentPost()) {
  return { action: "edit", postId: POST_ID, integrityCorrection: { operation: "correct", operationId: OPERATION_ID,
    expected: integritySnapshot(post), reason: "Separar os dois congressos distintos com evidencia oficial.", evidence: evidence(),
    item: correctedItem(), detachSources: [1, 2].map((index) => ({ field: "merged_sources", index, entry: post.metadata.merged_sources[index] })),
  } };
}
function fakeAdmin(post = currentPost(), options: { race?: boolean; lifecycleBlock?: string; receiptDrift?: boolean; postgresExpiry?: boolean; lostReceipt?: string; rows?: Record<string, unknown>[] } = {}) {
  let state: Record<string, unknown> = structuredClone(post); const writes: Record<string, unknown>[] = [];
  let rows = structuredClone(options.rows || []);
  const filters: [string, unknown][] = []; let mediaOperations = 0;
  return { writes, filters, state: () => state, rows: () => rows, mediaOperations: () => mediaOperations,
    admin: { from(table: string) {
      if (table === "audit_log") return { insert: () => Promise.resolve({ error: null }) };
      assert.equal(table, "posts", "no post_media write or read");
      return { select() { return { eq() { return { maybeSingle: async () => ({ data: structuredClone(state), error: null }) }; } }; } };
    }, async rpc(name: string, args: Record<string, any>) {
      assert.equal(name, "kc_cadu_correct_post_integrity", "no media RPC");
      assert.equal(args.p_post_id, POST_ID); assert.equal(args.p_actor_id, OWNER);
      assert(sameValue(integritySnapshot(state), integritySnapshot(args.p_expected)), "complete snapshot in RPC body");
      if (options.lifecycleBlock) return { data: { ok: false, code: options.lifecycleBlock }, error: null };
      filters.push(...Object.entries(args.p_expected)); writes.push(args.p_update);
      if (options.race) return { data: { ok: false, code: "EDIT_CONFLICT" }, error: null };
      if (args.p_media && !integrityMediaReceiptMatches(rows, args.p_media.before, POST_ID)) {
        return { data: { ok: false, code: "EDIT_CONFLICT" }, error: null };
      }
      if (args.p_media) rows = structuredClone(args.p_media.after);
      state = { ...state, ...structuredClone(args.p_update), updated_at: "2026-09-08T04:00:00.000Z" };
      if (options.postgresExpiry) state.expires_at = String(state.expires_at).replace("Z", "+00:00");
      const fresh = structuredClone(state); if (options.receiptDrift) fresh.title = "different receipt";
      if (options.lostReceipt === "null") return { data: null, error: null };
      if (options.lostReceipt === "throw") throw new Error("timeout after commit");
      if (options.lostReceipt === "error") return { data: null, error: { message: "connection lost" } };
      if (options.lostReceipt === "history") {
        const metadata = fresh.metadata as Record<string, any>;
        metadata.cadu_integrity_history[0].reason = "different history";
      }
      return { data: { ok: true, code: "INTEGRITY_APPLIED", post: fresh, post_media: rows }, error: null }; }, storage: { from() { mediaOperations++; throw new Error("No Storage operation allowed"); } } },
  };
}

Deno.test("active factual repair preserves low observed score and its restricted warning in durable history", async () => {
  const initial = currentPost(); const body = request(initial); body.integrityCorrection.item.score = 0.69;
  const harness = fakeAdmin(initial); const response = await handleEdit(harness.admin as never, OWNER, body);
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.quality_context.observed_score, 0.69);
  assert.equal(result.quality_context.warning, "existing_active_post_repair_below_auto_publish_threshold");
  const entry = (harness.state().metadata as any).cadu_integrity_history[0];
  assert.equal(entry.observed_score, 0.69); assert.equal(entry.quality_context.warning, result.quality_context.warning);
  assert.equal(entry.source_id, SOURCE_ID); assert.match(entry.source_item_sha256, /^[a-f0-9]{64}$/);
  assert.equal(harness.state().status, "published"); assert.equal(harness.state().visibility, "public");
});

Deno.test("post-lock lifecycle rejection receipts confirm zero-write while lost replies remain uncertain", async () => {
  for (const code of ["INTEGRITY_REACTIVATION_BLOCKED", "INTEGRITY_ACTIVE_REPAIR_EXPIRED"]) {
    const initial = currentPost(); const harness = fakeAdmin(initial, { lifecycleBlock: code });
    const response = await handleEdit(harness.admin as never, OWNER, request(initial));
    assert.equal(response.status, 422); assert.equal((await response.json()).code, code);
    assert.equal(harness.writes.length, 0); assert.deepEqual(harness.state(), initial);
  }
});

Deno.test("repair rejects reactivation even above publication score and never dispatches RPC", async () => {
  for (const change of [
    { expires_at: "2020-01-01T00:00:00Z" },
    { metadata: { ...currentPost().metadata, dates: { eventEndsAt: "2020-01-01" } } },
    { metadata: { ...currentPost().metadata, dates: { eventStatus: "cancelled" } } },
    { metadata: { ...currentPost().metadata, dates: { applicationStatus: "closed" } } },
  ]) {
    const post = { ...currentPost(), ...change } as ReturnType<typeof currentPost>;
    const harness = fakeAdmin(post); const response = await handleEdit(harness.admin as never, OWNER, request(post));
    assert.equal(response.status, 422, JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).code, "INTEGRITY_REACTIVATION_BLOCKED"); assert.equal(harness.writes.length, 0);
  }
});

Deno.test("score repair does not accept absent/coerced scores, unknown expiry or another quality failure", async () => {
  for (const score of [undefined, null, "0.69", NaN, Infinity, -1, 2]) {
    const harness = fakeAdmin(); const body = request(); (body.integrityCorrection.item as any).score = score;
    const response = await handleEdit(harness.admin as never, OWNER, body); assert.equal(response.status, 422); assert.equal(harness.writes.length, 0);
  }
  for (const expiry of [null, "invalid", "2020-01-01T00:00:00Z"]) {
    const post = { ...currentPost(), expires_at: expiry } as ReturnType<typeof currentPost>;
    const body = request(post); body.integrityCorrection.item.score = 0.69;
    const harness = fakeAdmin(post); assert.equal((await handleEdit(harness.admin as never, OWNER, body)).status, 422); assert.equal(harness.writes.length, 0);
  }
  const body = request(); body.integrityCorrection.item.score = 0.69; (body.integrityCorrection.item.dates as any).isExpired = true;
  const harness = fakeAdmin(); assert.equal((await handleEdit(harness.admin as never, OWNER, body)).status, 422); assert.equal(harness.writes.length, 0);
});

Deno.test("closed applications remain closed while a future event is corrected; reopening or erasing closure is denied", () => {
  const now = Date.parse("2026-09-08T03:00:00Z");
  const current = { ...currentPost(), expires_at: "2026-10-17T03:00:00Z", metadata: { dates: {
    applicationStatus: "closed", applicationDeadline: "2026-08-14", canApply: false,
    eventStatus: "unknown", eventStartsAt: "2026-10-14", eventEndsAt: "2026-10-16",
  } } };
  const next = { ...current, expires_at: "2026-11-14T03:00:00Z", metadata: { dates: {
    ...current.metadata.dates, applicationDeadline: "2026-08-28", eventStatus: "upcoming", eventStartsAt: "2026-11-09", eventEndsAt: "2026-11-13",
  } } };
  assert.equal(integrityReactivationReason(current, next, now), null); assert.equal(isActiveIntegrityScoreRepair(current, next, 0.69, now), true);
  for (const dates of [{ ...next.metadata.dates, canApply: true }, { eventStartsAt: "2026-11-09", eventEndsAt: "2026-11-13" }]) {
    assert.notEqual(integrityReactivationReason(current, { ...next, metadata: { dates } }, now), null);
  }
  const opportunity = { ...current, module: "oportunidades", metadata: { dates: { applicationStatus: "scheduled", applicationDeadline: "2026-10-26", canApply: false, eventEndsAt: "2020-01-01" } } };
  assert.equal(isActiveIntegrityScoreRepair(opportunity, opportunity, 0.69, now), true, "an old exam date does not expire an upcoming application");
});

Deno.test("integrity correction atomically restores original CONPEEX and detaches exact CONEPEC aliases", async () => {
  const initial = currentPost(); const harness = fakeAdmin(initial, { postgresExpiry: true });
  const response = await handleEdit(harness.admin as never, OWNER, request(initial));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).code, "INTEGRITY_CORRECTED");
  assert.equal(harness.writes.length, 1);
  assert.deepEqual(harness.filters.map(([key]) => key).sort(), [...INTEGRITY_FIELDS].sort());
  const state = harness.state() as ReturnType<typeof currentPost>;
  assert.equal(state.id, POST_ID); assert.equal(state.image_url, COVER); assert.equal(state.module, "eventos");
  assert.equal(state.title, correctedItem().formattedTitle); assert.equal(state.location, "Campus Samambaia, Goiânia");
  assert.equal(state.metadata.location, state.location); assert.equal(state.metadata.source_id, SOURCE_ID);
  assert.equal(state.metadata.source_url, SOURCE_URL); assert.deepEqual(state.metadata.gallery_image_urls, [COVER]);
  assert.deepEqual(state.metadata.merged_sources, [initial.metadata.merged_sources[0]]);
  assert.deepEqual(state.metadata.userTags, initial.metadata.userTags); assert.equal(state.metadata.custom_untouched, "keep");
  assert.equal(state.metadata.review_publication_directive, undefined);
  assert.equal(state.metadata.action_fingerprint_v2, undefined);
  assert.equal(state.metadata.date_start, undefined); assert.equal(harness.mediaOperations(), 0);
  const history = (state.metadata as Record<string, unknown>).cadu_integrity_history as Record<string, unknown>[];
  assert.equal(history.length, 1); assert.equal(history[0].operation_id, OPERATION_ID);
  assert.deepEqual((history[0].before as Record<string, unknown>).metadata, initial.metadata);
});

Deno.test("integrity correction can roll back the exact last state without losing audit history or media", async () => {
  const initial = currentPost(); const first = fakeAdmin(initial);
  assert.equal((await handleEdit(first.admin as never, OWNER, request(initial))).status, 200);
  const corrected = first.state(); const harness = fakeAdmin(corrected as ReturnType<typeof currentPost>);
  const response = await handleEdit(harness.admin as never, OWNER, { action: "edit", postId: POST_ID,
    integrityCorrection: { operation: "rollback", operationId: ROLLBACK_ID, rollbackOf: OPERATION_ID,
      expected: integritySnapshot(corrected), reason: "Reverter a correcao conforme snapshot anterior completo.", evidence: evidence() } });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const state = harness.state(); const metadata = state.metadata as Record<string, unknown>;
  const history = metadata.cadu_integrity_history as Record<string, unknown>[];
  assert.equal(history.length, 2); assert.equal(history[1].rollback_of, OPERATION_ID);
  const restoredMetadata = { ...metadata }; delete restoredMetadata.cadu_integrity_history;
  assert.deepEqual(restoredMetadata, initial.metadata); assert.equal(state.title, initial.title);
  assert.equal(state.id, initial.id); assert.equal(state.image_url, COVER); assert.equal(harness.mediaOperations(), 0);
});

Deno.test("integrity correction rejects stale complete metadata, source drift, foreign aliases and combined edits", async () => {
  const cases: Array<(body: Record<string, any>) => void> = [
    (body) => body.integrityCorrection.expected.metadata.location = "concurrent",
    (body) => body.integrityCorrection.item.sourceUrl = "https://goias.ufg.br/n/203582",
    (body) => body.integrityCorrection.item.sourceId = "different-id",
    (body) => body.integrityCorrection.item.module = "oportunidades",
    (body) => body.integrityCorrection.detachSources[0].entry.source_url = "https://other.ufg.br/n/1",
    (body) => body.integrityCorrection.detachSources = [{ field: "merged_sources", index: 0, entry: currentPost().metadata.merged_sources[0] }],
    (body) => body.integrityCorrection.item.formattedTitle = "XIV CONEPEC 2026",
    (body) => body.integrityCorrection.evidence[0].venue = "",
    (body) => body.image = COVER,
  ];
  for (const mutate of cases) {
    const harness = fakeAdmin(); const body = structuredClone(request()); mutate(body);
    const response = await handleEdit(harness.admin as never, OWNER, body);
    assert.ok([409, 422].includes(response.status), JSON.stringify(await response.json()));
    assert.equal(harness.writes.length, 0); assert.equal(harness.mediaOperations(), 0);
  }
});

Deno.test("integrity CAS race cannot report success; receipt mismatch is explicitly uncertain", async () => {
  for (const options of [{ race: true }, { receiptDrift: true }]) {
    const harness = fakeAdmin(currentPost(), options);
    const response = await handleEdit(harness.admin as never, OWNER, request());
    assert.equal(response.status, options.race ? 409 : 502);
    assert.equal((await response.json()).code, options.race ? "EDIT_CONFLICT" : "INTEGRITY_RECEIPT_INVALID");
    assert.equal(harness.mediaOperations(), 0);
  }
});

Deno.test("integrity rollback fails closed after subsequent content or metadata changes", async () => {
  const harness = fakeAdmin(); assert.equal((await handleEdit(harness.admin as never, OWNER, request())).status, 200);
  const corrected = structuredClone(harness.state()); corrected.description = "another later editorial change";
  const next = fakeAdmin(corrected as ReturnType<typeof currentPost>);
  const response = await handleEdit(next.admin as never, OWNER, { action: "edit", postId: POST_ID,
    integrityCorrection: { operation: "rollback", operationId: ROLLBACK_ID, rollbackOf: OPERATION_ID,
      expected: integritySnapshot(corrected), reason: "Rollback rejeitado por alteracao posterior.", evidence: evidence() } });
  assert.equal(response.status, 409); assert.equal(next.writes.length, 0);
});

Deno.test("integrity keeps moderation, ownership and explicit manual locks closed", async () => {
  for (const patch of [{ author_id: "other" }, { status: "hidden" }, { status: "deleted" },
    { metadata: { ...currentPost().metadata, manual_edits_lock: true } }]) {
    const post = { ...currentPost(), ...patch }; const harness = fakeAdmin(post);
    const response = await handleEdit(harness.admin as never, OWNER, request(post));
    assert.ok([403, 422].includes(response.status)); assert.equal(harness.writes.length, 0);
  }
});

Deno.test("lost post-commit receipts never claim no mutation and require readback before replay", async () => {
  for (const lostReceipt of ["null", "throw", "error", "history"]) {
    const harness = fakeAdmin(currentPost(), { lostReceipt });
    const response = await handleEdit(harness.admin as never, OWNER, request());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, lostReceipt === "history" ? "INTEGRITY_RECEIPT_INVALID" : "INTEGRITY_MUTATION_UNCERTAIN");
    assert.equal(harness.state().title, correctedItem().formattedTitle, "commit happened before response loss");
    const replay = await handleEdit(harness.admin as never, OWNER, request());
    assert.equal(replay.status, 409); assert.equal(harness.writes.length, 1, "replay cannot mutate twice");
  }
});

Deno.test("snapshot timestamp normalization preserves microseconds and touches only three columns", () => {
  const post = currentPost();
  const sql = { ...post, updated_at: "2026-09-07 06:02:29.978654+00", created_at: "2026-08-14 15:16:05.638783+00" };
  assert.deepEqual(integritySnapshot(sql), integritySnapshot(post));
  assert.notDeepEqual(integritySnapshot({ ...sql, updated_at: "2026-09-07 06:02:29.978655+00" }), integritySnapshot(post));
  assert.equal((integritySnapshot(sql).metadata as Record<string, unknown>).date_start, "2099-10-14");
});

function initialMedia() {
  return [
    "28a4a461-ba49-455e-ab7d-710492305806", "f2069a0f-3085-4456-bfd6-00ecaf9dc2a5",
    "e1335396-8674-4389-a2cd-312e4073fbcf", "3497850c-d7cc-4c09-9fc1-7ed5ba4d70be",
  ].map((id, index) => ({ id, post_id: POST_ID, url: index ? `${COVER}?media=${index}` : COVER,
    created_at: "2026-09-07 04:13:47.868921+00", sort_order: index, is_cover: index === 0 }));
}
Deno.test("optional exact media selection and rollback preserve IDs/URLs/timestamps without Storage", async () => {
  const initial = currentPost(); const rows = initialMedia();
  Object.assign(initial.metadata, { galleryImageUrls: [COVER], coverUrl: COVER });
  const harness = fakeAdmin(initial, { rows }); const body = request(initial) as Record<string, any>;
  body.integrityCorrection.mediaSelection = { expectedRows: rows, keepIds: [rows[2].id, rows[3].id], coverId: rows[2].id };
  const response = await handleEdit(harness.admin as never, OWNER, body);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(harness.state().image_url, rows[2].url); assert.equal(harness.rows().length, 2);
  assert.deepEqual(harness.rows().map((row) => [row.id, row.url, row.created_at]), rows.slice(2).map((row) => [row.id, row.url, row.created_at]));
  const metadata = harness.state().metadata as Record<string, unknown>;
  assert.deepEqual(metadata.galleryImageUrls, rows.slice(2).map((row) => row.url)); assert.equal(metadata.coverUrl, rows[2].url);
  const corrected = harness.state(); const rollback = fakeAdmin(corrected as ReturnType<typeof currentPost>, { rows: harness.rows() });
  const rolled = await handleEdit(rollback.admin as never, OWNER, { action: "edit", postId: POST_ID,
    integrityCorrection: { operation: "rollback", operationId: ROLLBACK_ID, rollbackOf: OPERATION_ID,
      expected: integritySnapshot(corrected), reason: "Reverter texto e vinculos mantendo os arquivos originais.", evidence: evidence() } });
  assert.equal(rolled.status, 200, JSON.stringify(await rolled.clone().json()));
  assert.deepEqual(rollback.rows(), rows); assert.equal(rollback.state().image_url, initial.image_url);
  assert.equal(rollback.mediaOperations() + harness.mediaOperations(), 0);
});
Deno.test("media-only drift fails whole repair and invented media IDs cannot be selected", async () => {
  const rows = initialMedia(); const body = request() as Record<string, any>;
  body.integrityCorrection.mediaSelection = { expectedRows: rows, keepIds: [rows[2].id], coverId: rows[2].id };
  const changed = rows.map((row, index) => index === 1 ? { ...row, sort_order: 9 } : row);
  const harness = fakeAdmin(currentPost(), { rows: changed });
  assert.equal((await handleEdit(harness.admin as never, OWNER, body)).status, 409);
  assert.equal(harness.state().title, currentPost().title); assert.deepEqual(harness.rows(), changed);
  body.integrityCorrection.mediaSelection.keepIds = [ROLLBACK_ID]; body.integrityCorrection.mediaSelection.coverId = ROLLBACK_ID;
  const rejected = fakeAdmin(currentPost(), { rows });
  assert.equal((await handleEdit(rejected.admin as never, OWNER, body)).status, 422); assert.equal(rejected.writes.length, 0);
});
