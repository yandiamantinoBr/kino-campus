import assert from "node:assert/strict";
import { handleEdit } from "./index.ts";
const OWNER = "2345582d-8bf7-4393-aa0d-f9953d0e02ca";
const POST = "00000000-0000-4000-8000-00000000c701";
const PRIMARY = "https://fanut.ufg.br/n/200351";
const OFFICIAL = "https://ufg.br/e/39235-gimon-2026-global-insights-in-microbiome-obesity-nutrition-conference";
const EXCERPT = "As inscrições já estão abertas na plataforma Even3, com valores promocionais de acordo com o lote vigente e categorias diferenciadas para estudantes de graduação, pós-graduação e profissionais.";
function fixture(): Record<string, any> {
  return { id: POST, author_id: OWNER, created_at: "2026-06-03T12:08:55.688477Z", updated_at: "2026-09-06T08:23:42.922822Z",
    title: "GIMON 2026", description: "Inscrições abertas na plataforma Even3, com valores por lote e categorias especiais.",
    price: 0, location: "Castro's Park Hotel, Goiânia", module: "eventos", category: "palestras", status: "published",
    visibility: "public", image_url: "https://example.test/cover.png", expires_at: "2099-09-28T02:59:59.999Z",
    metadata: { source_id: "", source_url: PRIMARY, source_registry_id: "web.ufg.portal", gratuito: true,
      link: OFFICIAL, dates: { eventStartsAt: "2099-09-25", eventEndsAt: "2099-09-27", canApply: false },
      merged_sources: [{ source_url: OFFICIAL, source_registry_id: "web.ufg.portal" }],
      manual_data_corrections: [{ reason: "historical date correction; preserve" }], custom: { keep: true } } };
}
function request(post = fixture()): Record<string, any> {
  return { action: "edit", postId: POST, legacyFreeRetraction: {
    contract: "cadu-legacy-free-retraction-v1", operationId: "00000000-0000-4000-8000-00000000c710",
    expected: structuredClone(post), expectedMedia: [],
    evidence: { primaryUrl: PRIMARY, primaryAccess: "unavailable_not_fetched", corroboratingUrl: OFFICIAL,
      corroboratingSha256: "a".repeat(64), capturedAt: new Date().toISOString(),
      officialExcerpt: EXCERPT, postExcerpt: "com valores por lote e categorias especiais",
      relationship: "existing_alias_and_internal_contradiction", primaryIdentityPreserved: true },
  } };
}
function fake(post = fixture(), rpcResult?: any) {
  const calls: any[] = []; const state = structuredClone(post);
  return { calls, state, admin: {
    from(table: string) {
      if (table === "audit_log") return { insert: async () => ({ error: null }) };
      assert.equal(table, "posts");
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(state), error: null }) }) }),
        update: (patch: any) => ({ eq: async () => { calls.push(patch); Object.assign(state, patch); return { error: null }; } }) };
    }, rpc: async (name: string, args: any) => {
      calls.push({ name, args }); assert.equal(name, "kc_cadu_retract_legacy_free_claim");
      assert.deepEqual(Object.keys(args).sort(), ["p_post_id", "p_actor_id", "p_request"].sort());
      assert.equal(args.p_actor_id, OWNER); assert.equal(args.p_post_id, POST);
      if (rpcResult === "throw") throw Error("timeout after write");
      if (rpcResult !== undefined) return typeof rpcResult === "function" ? rpcResult(state, args) : rpcResult;
      const entry = { contract: args.p_request.contract, operation: "retract_legacy_free_claim", operation_id: args.p_request.operationId,
        at: new Date().toISOString(), evidence: structuredClone(args.p_request.evidence),
        before: { post: structuredClone(state), post_media: structuredClone(args.p_request.expectedMedia) },
        after: { price: null, gratuito: false }, before_hash: "b".repeat(64), after_hash: "c".repeat(64) };
      state.price = null; state.metadata.gratuito = false;
      state.metadata.cadu_legacy_free_retraction_history = [...(state.metadata.cadu_legacy_free_retraction_history || []), entry];
      state.updated_at = new Date().toISOString();
      return { data: { ok: true, code: "LEGACY_FREE_RETRACTED", post: structuredClone(state), post_media: args.p_request.expectedMedia }, error: null };
    },
  } };
}
Deno.test("legacy retraction cannot fall through to ordinary edit or combine free fields", async () => {
  const body = request(); body.fields = { price: null };
  const h = fake(); const response = await handleEdit(h.admin as never, OWNER, body);
  assert.equal(response.status, 422); assert.equal(h.calls.length, 0);
});

Deno.test("source-bound retraction preserves all facts, blank identity, dates, previous histories and six media fields", async () => {
  const post = fixture(), body = request(post); const h = fake(post);
  body.legacyFreeRetraction.expectedMedia = [{ id: "00000000-0000-4000-8000-00000000c720", post_id: POST,
    url: post.image_url, is_cover: true, sort_order: 0, created_at: "2026-06-03T12:08:55.123456Z" }];
  const r = await handleEdit(h.admin as never, OWNER, body); const receipt = await r.json();
  assert.equal(r.status, 200, JSON.stringify(receipt)); assert.equal(receipt.code, "LEGACY_FREE_RETRACTED");
  assert.equal(receipt.source_id, ""); assert.equal(receipt.source_url, PRIMARY); assert.equal(h.calls.length, 1);
  const result = structuredClone(h.state); delete result.metadata.cadu_legacy_free_retraction_history;
  assert.deepEqual(result, { ...post, price: null, metadata: { ...post.metadata, gratuito: false }, updated_at: result.updated_at });
  const replay = request(h.state); const replayResponse = await handleEdit(h.admin as never, OWNER, replay);
  assert.equal(replayResponse.status, 409); assert.equal(h.calls.length, 1, "fresh snapshot does not reuse the operation ID");
});

for (const [name, change] of Object.entries<Record<string, any>>({
  string_price: { price: "0" }, null_price: { price: null }, false_price: { price: false }, paid_price: { price: 5 },
  closed: { status: "closed" }, hidden: { visibility: "private" }, other_module: { module: "oportunidades" },
  other_title: { title: "Unrelated congress" }, expired: { expires_at: "2020-01-01T00:00:00Z" },
})) Deno.test(`reject ${name} without dispatch`, async () => {
  const post = { ...fixture(), ...change }; const h = fake(post);
  assert.equal((await handleEdit(h.admin as never, OWNER, request(post))).status, 422); assert.equal(h.calls.length, 0);
});
for (const [name, change] of Object.entries<Record<string, any>>({
  no_id: { source_id: undefined }, null_id: { source_id: null }, nonempty_id: { source_id: "new-id" },
  other_source: { source_url: "https://fanut.ufg.br/n/9999" }, string_true: { gratuito: "true" }, no_free: { gratuito: false },
  alias_absent: { merged_sources: [] }, manual_lock: { manual_edits_lock: true }, manual_description: { manual_description: "true" },
  hidden_merge: { merged_into_post_id: "another" }, invalid_history: { cadu_legacy_free_retraction_history: null },
  invalid_history_entry: { cadu_legacy_free_retraction_history: ["malformed"] },
})) Deno.test(`reject metadata ${name}`, async () => {
  const post = fixture(); Object.assign(post.metadata, change); const h = fake(post);
  assert.equal((await handleEdit(h.admin as never, OWNER, request(post))).status, 422); assert.equal(h.calls.length, 0);
});
for (const [name, change] of Object.entries<Record<string, any>>({
  false_primary_fetch: { primaryAccess: "fetched" }, primary_changed: { primaryUrl: "https://ufg.br/n/200351" },
  official_changed: { corroboratingUrl: OFFICIAL + "?x=1" }, no_alias_relationship: { relationship: "same_event_fuzzy" },
  missing_hash: { corroboratingSha256: "" }, source_rebind: { primaryIdentityPreserved: false },
  array_hash: { corroboratingSha256: ["a".repeat(64)] },
  contradicted_excerpt: { officialExcerpt: "As inscrições não têm cobrança por lote." },
  post_excerpt_invented: { postExcerpt: "valores por lote, R$ 999 não informado" },
  stale: { capturedAt: "2020-01-01T00:00:00.000Z" }, future: { capturedAt: "2099-01-01T00:00:00.000Z" },
  extra: { patch: { price: 3 } },
})) Deno.test(`reject evidence ${name}`, async () => {
  const body = request(); Object.assign(body.legacyFreeRetraction.evidence, change); const h = fake();
  assert.equal((await handleEdit(h.admin as never, OWNER, body)).status, 422); assert.equal(h.calls.length, 0);
});
Deno.test("complete exact snapshot rejects missing fields, stale metadata, microseconds and extra request options", async () => {
  for (const change of [
    (b: any) => { delete b.legacyFreeRetraction.expected.image_url; },
    (b: any) => { b.legacyFreeRetraction.expected.updated_at = "2026-09-06T08:23:42.922823Z"; },
    (b: any) => { b.legacyFreeRetraction.expected.metadata.custom.keep = false; },
    (b: any) => { b.images = []; }, (b: any) => { b.integrityCorrection = {}; },
    (b: any) => { b.legacyFreeRetraction.operationId = [b.legacyFreeRetraction.operationId]; },
    (b: any) => { b.legacyFreeRetraction.expectedMedia = [{ id: POST }]; },
  ]) { const body = request(); change(body); const h = fake(); const r = await handleEdit(h.admin as never, OWNER, body);
    assert([409, 422].includes(r.status)); assert.equal(h.calls.length, 0); }
});
for (const [name, result, status] of [
  ["explicit CAS conflict", { data: { ok: false, code: "EDIT_CONFLICT" }, error: null }, 409],
  ["expired during lock", { data: { ok: false, code: "LEGACY_FREE_RETRACTION_EXPIRED" }, error: null }, 422],
  ["timeout throw", "throw", 502], ["timeout error", { data: null, error: { code: "timeout" } }, 502],
  ["missing receipt", { data: null, error: null }, 502], ["unknown code", { data: { ok: true }, error: null }, 502],
  ["false conflict success", { data: { ok: true, code: "EDIT_CONFLICT" }, error: null }, 502],
] as const) Deno.test(`${name} never retries or falls back`, async () => {
  const h = fake(fixture(), result); const r = await handleEdit(h.admin as never, OWNER, request());
  assert.equal(r.status, status); assert.equal(h.calls.length, 1);
});
Deno.test("wrong owner cannot dispatch this operation", async () => {
  const h = fake(); assert.equal((await handleEdit(h.admin as never, "not-owner", request())).status, 403); assert.equal(h.calls.length, 0);
});
