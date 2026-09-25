import assert from "node:assert/strict";
import {
  handleModeration,
  MODERATION_CONTRACT,
  moderationSnapshot,
} from "./moderation.ts";

const POST_ID = "9916c8f9-8f71-4c06-9081-44dd6739b7cf";
const ACTOR = "d8282222-4848-4848-8484-484848484848";
const HIDE_ID = "a1a11111-1111-4111-8111-111111111111";
const ROLLBACK_ID = "b2b22222-2222-4222-8222-222222222222";
const SOURCE_URL = "https://www.instagram.com/p/Dc1Fa4hCUqQ/";
const MEDIA = [{
  id: "30000000-0000-4000-8000-000000000001",
  post_id: POST_ID,
  url: "https://example.test/enbra.jpg",
  is_cover: true,
  sort_order: 0,
  created_at: "2026-09-25T01:25:00.123456Z",
}];
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const json = (status: number, body: Row) => Response.json(body, { status });

function post(): Row {
  return {
    id: POST_ID,
    author_id: ACTOR,
    created_at: "2026-09-25T01:24:59.123456Z",
    updated_at: "2026-09-25T01:24:59.234567Z",
    title: "ENBRA XXX 2026",
    description: "Encontro em Cuiabá.",
    price: null,
    location: "Cuiabá/MT",
    module: "eventos",
    category: "culturais",
    status: "published",
    visibility: "public",
    image_url: "https://example.test/enbra.jpg",
    expires_at: "2026-10-26T02:59:59.999Z",
    moderation_reason: null,
    metadata: {
      source_id: "ig:cfaadm:Dc1Fa4hCUqQ",
      source_url: SOURCE_URL,
      source_registry_id: "ig.cfaadm",
      source_unit: "ig:@cfaadm",
      userTags: ["UFG"],
      cover_url: "https://example.test/enbra.jpg",
      gallery_image_urls: ["https://example.test/enbra.jpg"],
    },
  };
}

function request(current: Row, operation: "hide" | "rollback" = "hide"): Row {
  return {
    action: "moderate",
    postId: POST_ID,
    moderation: {
      operation,
      operationId: operation === "hide" ? HIDE_ID : ROLLBACK_ID,
      ...(operation === "rollback" ? { rollbackOf: HIDE_ID } : {}),
      expected: moderationSnapshot(current),
      reason:
        "Fonte CFA aponta Cuiabá, sem vínculo acadêmico ou local com a UFG.",
      evidence: [{
        url: SOURCE_URL,
        title: "ENBRA XXX 2026",
        dates: "Outubro de 2026",
        venue: "Cuiabá/MT",
      }],
    },
  };
}

function harness(
  initial = post(),
  mode:
    | "normal"
    | "conflict"
    | "blocked"
    | "lost"
    | "bad-receipt"
    | "bad-guard"
    | "bad-timestamp"
    | "bad-media" = "normal",
) {
  let state = structuredClone(initial);
  const media = structuredClone(MEDIA);
  const calls: Row[] = [];
  const admin = {
    from(table: string) {
      if (table === "post_media") {
        return {
          select(columns: string) {
            assert(columns.includes("created_at"));
            return {
              eq(_key: string, id: string) {
                assert.equal(id, POST_ID);
                return {
                  order: (_column: string) => ({
                    data: structuredClone(media),
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      assert.equal(table, "posts");
      return {
        select(columns: string) {
          assert(columns.includes("moderation_reason"));
          return {
            eq(_key: string, id: string) {
              assert.equal(id, POST_ID);
              return {
                maybeSingle: () => ({
                  data: structuredClone(state),
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
    rpc(name: string, args: Row) {
      assert.equal(name, "kc_cadu_moderate_post_cas");
      assert.equal(args.p_actor_id, ACTOR);
      assert.equal(args.p_post_id, POST_ID);
      assert.deepEqual(
        Object.keys(args.p_expected).sort(),
        Object.keys(moderationSnapshot(state)).sort(),
      );
      assert.deepEqual(args.p_expected, moderationSnapshot(state));
      assert.deepEqual(args.p_expected_media, media);
      calls.push(structuredClone(args));
      if (mode === "conflict") {
        return {
          data: { ok: false, code: "MODERATION_CONFLICT" },
          error: null,
        };
      }
      if (mode === "blocked") {
        return {
          data: { ok: false, code: "MODERATION_ROLLBACK_BLOCKED" },
          error: null,
        };
      }
      if (mode === "lost") throw new Error("lost after dispatch");
      const history = state.metadata.cadu_moderation_history || [];
      if (
        args.p_operation === "rollback" &&
        JSON.stringify(history.at(-1)?.media) !== JSON.stringify(media)
      ) {
        return {
          data: { ok: false, code: "MODERATION_ROLLBACK_BLOCKED" },
          error: null,
        };
      }
      const guard = moderationSnapshot(state);
      delete guard.status;
      delete guard.moderation_reason;
      delete guard.updated_at;
      guard.metadata = { ...state.metadata };
      delete (guard.metadata as Row).cadu_moderation_history;
      delete (guard.metadata as Row).cadu_moderation_lock;
      const entry = {
        operation: args.p_operation,
        operation_id: args.p_operation_id,
        rollback_of: args.p_rollback_of,
        at: "2026-09-25T12:49:00.123456Z",
        actor_id: ACTOR,
        reason: args.p_reason,
        evidence: args.p_evidence,
        source_url: SOURCE_URL,
        ...(args.p_operation === "hide"
          ? {
            guard,
            media: structuredClone(media),
            after_updated_at: "2026-09-25T12:49:00.123456Z",
          }
          : {}),
        before: {
          status: state.status,
          visibility: state.visibility,
          moderation_reason: state.moderation_reason,
          updated_at: state.updated_at,
        },
      };
      state = {
        ...state,
        status: args.p_operation === "hide" ? "hidden" : "published",
        moderation_reason: args.p_operation === "hide"
          ? `audit-cadu-editorial:${args.p_operation_id}`
          : null,
        updated_at: "2026-09-25T12:49:00.123456Z",
        metadata: {
          ...state.metadata,
          cadu_moderation_history: [...history, entry],
          ...(args.p_operation === "hide"
            ? { cadu_moderation_lock: args.p_operation_id }
            : {}),
        },
      };
      if (args.p_operation === "rollback") {
        delete state.metadata.cadu_moderation_lock;
      }
      const response = structuredClone(state);
      if (mode === "bad-receipt") response.location = "changed after CAS";
      if (mode === "bad-guard") {
        response.metadata.cadu_moderation_history.at(-1).guard.title =
          "altered";
      }
      if (mode === "bad-timestamp") {
        response.metadata.cadu_moderation_history.at(-1).after_updated_at =
          "2026-09-25T12:49:00.123457Z";
      }
      const mediaReceipt = structuredClone(media);
      if (mode === "bad-media") {
        mediaReceipt[0].url = "https://example.test/changed.jpg";
      }
      return {
        data: {
          ok: true,
          code: "MODERATION_APPLIED",
          operation: args.p_operation,
          operation_id: args.p_operation_id,
          post: response,
          post_media: mediaReceipt,
        },
        error: null,
      };
    },
  };
  return {
    admin,
    calls,
    state: () => structuredClone(state),
    changeMedia: (url: string) => {
      media[0].url = url;
    },
  };
}

Deno.test("Cadu hides a scoped false-attribution post with a complete CAS snapshot", async () => {
  const before = post();
  const h = harness(before);
  const response = await handleModeration(
    h.admin as never,
    ACTOR,
    request(before),
    json,
  );
  assert.equal(
    response.status,
    200,
    JSON.stringify(await response.clone().json()),
  );
  assert.equal((await response.json()).contract, MODERATION_CONTRACT);
  assert.equal(h.calls.length, 1);
  const after = h.state();
  assert.equal(after.status, "hidden");
  assert.equal(after.moderation_reason, `audit-cadu-editorial:${HIDE_ID}`);
  assert.equal(after.image_url, before.image_url);
  assert.deepEqual(
    after.metadata.gallery_image_urls,
    before.metadata.gallery_image_urls,
  );
  assert.equal(after.metadata.cadu_moderation_history[0].operation_id, HIDE_ID);
});

for (
  const [label, alter] of Object.entries<(body: Row) => void>({
    stale_microseconds: (body) => {
      body.moderation.expected.updated_at = "2026-09-25T01:24:59.234568Z";
    },
    stale_metadata: (body) => {
      body.moderation.expected.metadata.userTags = [];
    },
    missing_moderation_snapshot: (body) => {
      delete body.moderation.expected.moderation_reason;
    },
    wrong_source: (body) => {
      body.moderation.evidence[0].url = "https://www.instagram.com/p/other/";
    },
    mixed_edit: (body) => {
      body.fields = { status: "hidden" };
    },
    fake_status: (body) => {
      body.moderation.expected.status = "hidden";
    },
  })
) {
  Deno.test(`moderation rejects ${label} before RPC`, async () => {
    const h = harness();
    const body = request(post());
    alter(body);
    const response = await handleModeration(
      h.admin as never,
      ACTOR,
      body,
      json,
    );
    assert([409, 422].includes(response.status));
    assert.equal(h.calls.length, 0);
  });
}

for (
  const [label, alter] of Object.entries<(post: Row) => void>({
    manually_edited: (post) => {
      post.metadata.manual_edits_lock = true;
    },
    already_hidden: (post) => {
      post.status = "hidden";
    },
    pending: (post) => {
      post.status = "pending";
    },
    private: (post) => {
      post.visibility = "community";
    },
    moderated: (post) => {
      post.moderation_reason = "manual-review";
    },
    other_module: (post) => {
      post.module = "moradia";
    },
    tombstone: (post) => {
      post.metadata.merged_into_post_id = ACTOR;
    },
  })
) {
  Deno.test(`moderation preserves ${label}`, async () => {
    const current = post();
    alter(current);
    const h = harness(current);
    const response = await handleModeration(
      h.admin as never,
      ACTOR,
      request(current),
      json,
    );
    assert.equal(response.status, 422);
    assert.equal(h.calls.length, 0);
  });
}

Deno.test("moderation enforces owner before the RPC", async () => {
  const h = harness();
  const response = await handleModeration(
    h.admin as never,
    "00000000-0000-4000-8000-000000000001",
    request(post()),
    json,
  );
  assert.equal(response.status, 404);
  assert.equal(h.calls.length, 0);
});

for (
  const [mode, status, code] of [
    ["conflict", 409, "MODERATION_CONFLICT"],
    ["lost", 502, "MODERATION_MUTATION_UNCERTAIN"],
    ["bad-receipt", 502, "MODERATION_RECEIPT_INVALID"],
    ["bad-guard", 502, "MODERATION_RECEIPT_INVALID"],
    ["bad-timestamp", 502, "MODERATION_RECEIPT_INVALID"],
    ["bad-media", 502, "MODERATION_RECEIPT_INVALID"],
  ] as const
) {
  Deno.test(`moderation ${mode} is not reported as applied`, async () => {
    const h = harness(post(), mode);
    const response = await handleModeration(
      h.admin as never,
      ACTOR,
      request(post()),
      json,
    );
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  });
}

Deno.test("moderation rollback requires the exact prior operation and preserves history", async () => {
  const h = harness();
  const hide = await handleModeration(
    h.admin as never,
    ACTOR,
    request(post()),
    json,
  );
  assert.equal(hide.status, 200);
  const hidden = h.state();
  const rollback = await handleModeration(
    h.admin as never,
    ACTOR,
    request(hidden, "rollback"),
    json,
  );
  assert.equal(
    rollback.status,
    200,
    JSON.stringify(await rollback.clone().json()),
  );
  assert.equal(h.state().status, "published");
  assert.equal(h.state().moderation_reason, null);
  assert.equal(h.state().metadata.cadu_moderation_lock, undefined);
  assert.deepEqual(
    h.state().metadata.cadu_moderation_history.map((entry: Row) =>
      entry.operation
    ),
    ["hide", "rollback"],
  );
  const repeat = await handleModeration(
    h.admin as never,
    ACTOR,
    request(h.state(), "rollback"),
    json,
  );
  assert.equal(repeat.status, 422);
  assert.equal(h.calls.length, 2);
});

Deno.test("database rollback veto remains authoritative", async () => {
  const h = harness(post(), "blocked");
  const response = await handleModeration(
    h.admin as never,
    ACTOR,
    request(post()),
    json,
  );
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "MODERATION_ROLLBACK_BLOCKED");
});

Deno.test("fresh row snapshot cannot roll back after gallery change", async () => {
  const h = harness();
  assert.equal(
    (await handleModeration(h.admin as never, ACTOR, request(post()), json))
      .status,
    200,
  );
  h.changeMedia("https://example.test/changed.jpg");
  const rollback = await handleModeration(
    h.admin as never,
    ACTOR,
    request(h.state(), "rollback"),
    json,
  );
  assert.equal(rollback.status, 422);
  assert.equal((await rollback.json()).code, "MODERATION_ROLLBACK_BLOCKED");
  assert.equal(h.state().status, "hidden");
});
