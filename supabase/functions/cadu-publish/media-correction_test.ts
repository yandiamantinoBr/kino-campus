import assert from "node:assert/strict";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { handleEdit } from "./index.ts";
import { handleMediaCorrection } from "./media-correction-handler.ts";
import { integritySnapshot } from "./integrity.ts";
import {
  CADU_MEDIA_ACTOR,
  deduplicatePlan,
  MEDIA_CORRECTION_CONTRACT,
  MEDIA_HISTORY,
  mediaContent,
  mediaReceiptValid,
  normalizedMedia,
  parseMediaCorrection,
  type Row,
} from "./media-correction.ts";

// Complete synthetic PNG; source URLs are mocked and no network permission is used.
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG2kAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
const hash = Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", png)),
  (b) => b.toString(16).padStart(2, "0"),
).join("");
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const postId = id(0xc701), removeId = id(0xc712), keepId = id(0xc713);
const response = (status: number, body: Row) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
function fixture() {
  const media = [0xc710, 0xc711, 0xc712, 0xc713].map((n, i) => ({
    id: id(n),
    post_id: postId,
    url: `https://files.cercomp.ufg.br/weby/up/1/o/synthetic-${n}.png`,
    is_cover: i === 0,
    sort_order: [0, 0, 0, 1][i],
    created_at: "2026-09-01T12:00:00.123456Z",
  }));
  const post = integritySnapshot({
    id: postId,
    author_id: CADU_MEDIA_ACTOR,
    created_at: "2026-09-01T12:00:00.123456Z",
    updated_at: "2026-09-01T12:01:00.654321Z",
    title: "Synthetic media fixture",
    description: "Original text must remain exactly as stored.",
    price: 150,
    location: "Goiânia",
    module: "oportunidades",
    category: "Mestrado",
    status: "published",
    visibility: "public",
    image_url: media[0].url,
    expires_at: "2026-09-18T19:00:00.000000Z",
    metadata: {
      source_id: "web.ufg.fixture:1",
      source_url: "https://ufg.br/n/1",
      source_registry_id: "web.ufg.fixture",
      source_revision: "c".repeat(64),
      image_url: media[0].url,
      cover_url: media[0].url,
      gallery_image_urls: media.map((r) => r.url),
      gallery_count: media.length,
      dates: {
        applicationDeadline: "2026-09-18T16:00:00-03:00",
        canApply: true,
      },
      userTags: ["unchanged"],
      custom: { nested: ["unchanged"] },
    },
  });
  const input: Row = {
    contract: MEDIA_CORRECTION_CONTRACT,
    operation: "deduplicate",
    operationId: id(0xc720),
    expected: structuredClone(post),
    expectedRows: structuredClone(media),
    reason: "Remove only the verified full byte duplicate.",
    pairs: [{ removeId, keepId, sha256: hash }],
  };
  return { post, media, input };
}
function receiptFor(post: Row, input: Row, proofs: Row[]): Row {
  const plan = deduplicatePlan(post, input),
    prior = (post.metadata as Row)[MEDIA_HISTORY] as Row[] || [];
  const entry = {
    contract: MEDIA_CORRECTION_CONTRACT,
    operation: input.operation,
    operation_id: input.operationId,
    reason: input.reason,
    audit_id: id(0xc730),
    request_hash: "d".repeat(64),
    before_hash: "a".repeat(64),
    after_hash: "b".repeat(64),
    before: mediaContent(post),
    after: mediaContent({ ...post, metadata: plan.metadata }),
    media_before: plan.before,
    media_after: plan.after,
    verified_pairs: proofs,
  };
  return {
    ok: true,
    replayed: false,
    entry,
    post: {
      ...post,
      updated_at: "2026-09-08T15:00:00.000000Z",
      metadata: { ...plan.metadata, [MEDIA_HISTORY]: [...prior, entry] },
    },
    post_media: plan.after,
  };
}
async function run(
  options: {
    mutate?: (f: ReturnType<typeof fixture>) => void;
    reply?: (r: Row) => Row | null;
    throwAfter?: boolean;
    errorAfter?: boolean;
    fetchMode?: string;
    actor?: string;
    throughIndex?: boolean;
  } = {},
) {
  const f = fixture();
  options.mutate?.(f);
  const initial = structuredClone(f),
    calls: { name: string; args: Row }[] = [],
    requests: string[] = [];
  let committed = false;
  const admin = {
    from(name: string) {
      if (name === "posts") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: f.post, error: null });
          },
        };
      }
      assert.equal(name, "post_media");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({ data: f.media, error: null }).then(resolve);
        },
      };
    },
    async rpc(name: string, args: Row) {
      calls.push({ name, args });
      const receipt = receiptFor(
        f.post,
        args.p_request as Row,
        args.p_verified_pairs as Row[],
      );
      committed = true;
      if (options.throwAfter) {
        throw Error(
          "synthetic connection ended after commit",
        );
      }
      if (options.errorAfter) {
        return {
          data: null,
          error: { message: "synthetic transport failure" },
        };
      }
      return {
        data: options.reply ? options.reply(receipt) : receipt,
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  const body = { action: "edit", postId, mediaCorrection: f.input };
  const result = options.throughIndex
    ? await handleEdit(admin, options.actor || CADU_MEDIA_ACTOR, body)
    : await handleMediaCorrection(
      admin,
      options.actor || CADU_MEDIA_ACTOR,
      body,
      f.post,
      response,
      {
        resolveDns: async () => ["8.8.8.8"],
        fetch: async (url, init) => {
          requests.push(url);
          assert.equal(init.credentials, "omit");
          assert.equal(init.redirect, "manual");
          if (options.fetchMode === "redirect") {
            return new Response(null, {
              status: 302,
              headers: { location: url },
            });
          }
          if (options.fetchMode === "html") {
            return new Response(
              "<html>not a raster</html>",
              { headers: { "content-type": "text/html" } },
            );
          }
          if (options.fetchMode === "large") {
            return new Response(png, {
              headers: {
                "content-type": "image/png",
                "content-length": String(4 * 1024 * 1024 + 1),
              },
            });
          }
          const bytes =
            options.fetchMode === "different" && url.includes(String(0xc712))
              ? new Uint8Array([...png, 1])
              : png;
          return new Response(bytes, {
            headers: { "content-type": "image/png" },
          });
        },
      },
    );
  assert.deepEqual(f, initial, "caller objects must remain immutable");
  return {
    status: result.status,
    body: await result.json(),
    calls,
    requests,
    committed,
    f,
  };
}
Deno.test("real handler verifies complete bytes and submits only the explicit request, preserves order/facts", async () => {
  const r = await run();
  assert.equal(r.status, 200);
  assert.equal(r.requests.length, 2);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].name, "kc_cadu_select_post_media");
  assert.deepEqual(Object.keys(r.calls[0].args).sort(), [
    "p_actor_id",
    "p_post_id",
    "p_request",
    "p_verified_pairs",
  ]);
  assert.deepEqual(r.body.post_media.map((m: Row) => m.sort_order), [0, 0, 1]);
  assert.equal("item" in (r.calls[0].args.p_request as Row), false);
  assert.equal("score" in (r.calls[0].args.p_request as Row), false);
});
const negatives: [string, (f: ReturnType<typeof fixture>) => void][] = [
  ["invented score", (f) => {
    f.input.score = 0.9;
  }],
  ["free post patch", (f) => {
    f.input.patch = { title: "changed" };
  }],
  ["missing snapshot field", (f) => {
    delete (f.input.expected as Row).price;
  }],
  ["stale metadata", (f) => {
    (f.post.metadata as Row).custom = { changed: true };
  }],
  ["microsecond stale timestamp", (f) => {
    f.post.updated_at = "2026-09-01T12:01:00.654322Z";
  }],
  ["media order race", (f) => {
    f.media[1].sort_order = 8;
  }],
  ["media created_at race", (f) => {
    f.media[1].created_at = "2026-09-01T12:00:00.123457Z";
  }],
  ["unobserved removal", (f) => {
    (f.input.pairs as Row[])[0].removeId = id(0xffff);
  }],
  ["remove cover", (f) => {
    (f.input.pairs as Row[])[0].removeId = f.media[0].id;
  }],
  ["same pair identity", (f) => {
    (f.input.pairs as Row[])[0].removeId = keepId;
  }],
  ["short SHA", (f) => {
    (f.input.pairs as Row[])[0].sha256 = hash.slice(0, 8);
  }],
  ["chain pair", (f) => {
    (f.input.pairs as Row[]).push({
      removeId: keepId,
      keepId: f.media[1].id,
      sha256: hash,
    });
  }],
  ["cover alias conflict", (f) => {
    (f.post.metadata as Row).cover_url = f.media[1].url;
    (f.input.expected as Row).metadata = structuredClone(f.post.metadata);
  }],
  ["cover render conflict", (f) => {
    (f.post.metadata as Row).cover_render = f.media[1].url;
    (f.input.expected as Row).metadata = structuredClone(f.post.metadata);
  }],
  ["hidden post", (f) => {
    f.post.status = "hidden";
    (f.input.expected as Row).status = "hidden";
  }],
  ["manual lock", (f) => {
    (f.post.metadata as Row).manual_edits_lock = true;
    (f.input.expected as Row).metadata = structuredClone(f.post.metadata);
  }],
  ["manual description string", (f) => {
    (f.post.metadata as Row).manual_description = "true";
    (f.input.expected as Row).metadata = structuredClone(f.post.metadata);
  }],
  ["missing source ID", (f) => {
    (f.post.metadata as Row).source_id = "";
    (f.input.expected as Row).metadata = structuredClone(f.post.metadata);
  }],
  ["unknown gallery alias", (f) => {
    (f.post.metadata as Row).gallery_image_urls = [
      "https://ufg.br/unknown.png",
    ];
    (f.input.expected as Row).metadata = structuredClone(f.post.metadata);
  }],
  ["foreign host", (f) => {
    f.media[2].url = "https://attacker.invalid/a.png";
    f.input.expectedRows = structuredClone(f.media);
    (f.post.metadata as Row).gallery_image_urls = f.media.map((m) => m.url);
    (f.input.expected as Row).metadata = structuredClone(f.post.metadata);
  }],
];
for (
  const field of ["operationId", "removeId", "keepId", "sha256", "rollbackOf"]
) {
  Deno.test(`payload rejects array coercion for ${field} before any preparation`, () => {
    const f = fixture();
    if (field === "rollbackOf") {
      f.input.operation = "rollback";
      delete f.input.pairs;
      f.input.rollbackOf = [id(0xc740)];
    } else if (field === "operationId") {
      f.input.operationId = [f.input.operationId];
    } else {
      const pair = (f.input.pairs as Row[])[0];
      pair[field] = [pair[field]];
    }
    assert.throws(() =>
      parseMediaCorrection(
        { action: "edit", postId, mediaCorrection: f.input },
        f.post,
        CADU_MEDIA_ACTOR,
      )
    );
  });
}
for (const field of ["before_hash", "after_hash", "audit_id", "request_hash"]) {
  Deno.test(`receipt rejects array coercion for ${field}`, () => {
    const f = fixture();
    const proof = [{ ...(f.input.pairs as Row[])[0], bytes: png.length }];
    const receipt = receiptFor(f.post, f.input, proof);
    assert.equal(mediaReceiptValid(receipt, f.post, f.input, proof), true);
    const entry = receipt.entry as Row;
    entry[field] = [entry[field]];
    assert.equal(mediaReceiptValid(receipt, f.post, f.input, proof), false);
  });
}
for (const [name, mutate] of negatives) {
  Deno.test(`zero RPC: ${name}`, async () => {
    const r = await run({ mutate });
    assert.ok([403, 409, 422].includes(r.status));
    assert.equal(r.calls.length, 0);
    assert.equal(r.committed, false);
  });
}
for (const fetchMode of ["redirect", "html", "large", "different"]) {
  Deno.test(`zero RPC on ${fetchMode} body`, async () => {
    const r = await run({ fetchMode });
    assert.equal(r.status, 422);
    assert.equal(r.calls.length, 0);
  });
}
Deno.test("noncanonical owner has no outgoing fetch or RPC", async () => {
  const r = await run({ actor: id(1) });
  assert.equal(r.status, 422);
  assert.equal(r.requests.length, 0);
  assert.equal(r.calls.length, 0);
});
for (
  const mode of [
    "null",
    "throw",
    "error",
    "post-drift",
    "media-drift",
    "history-lost",
    "proof-tampered",
  ]
) {
  Deno.test(`post-dispatch ${mode} remains uncertain`, async () => {
    const r = await run({
      throwAfter: mode === "throw",
      errorAfter: mode === "error",
      reply: (receipt) => {
        if (mode === "null") return null;
        if (mode === "post-drift") {
          (receipt.post as Row).title = "trigger changed title";
        }
        if (mode === "media-drift") {
          (receipt.post_media as Row[])[1].sort_order = 44;
        }
        if (mode === "history-lost") {
          ((receipt.post as Row).metadata as Row)[MEDIA_HISTORY] = [];
        }
        if (mode === "proof-tampered") {
          (receipt.entry as Row).verified_pairs = [];
        }
        return receipt;
      },
    });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, "MEDIA_MUTATION_UNCERTAIN");
    assert.equal(r.committed, true);
  });
}
Deno.test("mixed existing edit route rejects before any network/RPC", async () => {
  const f = fixture();
  let calls = 0;
  const admin = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: f.post, error: null }),
      };
    },
    rpc() {
      calls++;
    },
  } as unknown as SupabaseClient;
  const result = await handleEdit(admin, CADU_MEDIA_ACTOR, {
    action: "edit",
    postId,
    fields: { title: "forbidden" },
    mediaCorrection: f.input,
  });
  assert.equal(result.status, 422);
  assert.equal(calls, 0);
});
Deno.test("receipt history prefix is retained with arbitrary prior recorded data", async () => {
  const r = await run({
    mutate: (f) => {
      (f.post.metadata as Row)[MEDIA_HISTORY] = [{
        contract: "old-test-entry",
        operation_id: id(0xc001),
        detail: "preserve",
      }];
      (f.input.expected as Row).metadata = structuredClone(f.post.metadata);
    },
  });
  assert.equal(r.status, 200);
});
Deno.test("real handler confirms identical replay without downloading again", async () => {
  const f = fixture(),
    proof = [{ ...(f.input.pairs as Row[])[0], bytes: png.length }],
    first = receiptFor(f.post, f.input, proof);
  let calls = 0;
  const admin = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({ data: first.post_media, error: null }).then(
            resolve,
          );
        },
      };
    },
    rpc(_name: string, args: Row) {
      calls++;
      assert.deepEqual(args.p_verified_pairs, []);
      return Promise.resolve({
        data: { ...first, replayed: true },
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  const r = await handleMediaCorrection(
    admin,
    CADU_MEDIA_ACTOR,
    { action: "edit", postId, mediaCorrection: f.input },
    first.post as Row,
    response,
    {
      resolveDns: () => {
        throw Error("No replay network permitted");
      },
    },
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).code, "MEDIA_REPLAY_CONFIRMED");
  assert.equal(calls, 1);
});
Deno.test("real handler rolls back last exact operation without image fetch or factual remapping", async () => {
  const f = fixture(),
    first = receiptFor(f.post, f.input, [{
      ...(f.input.pairs as Row[])[0],
      bytes: png.length,
    }]);
  const current = first.post as Row, last = first.entry as Row;
  const input = {
    contract: MEDIA_CORRECTION_CONTRACT,
    operation: "rollback",
    operationId: id(0xc740),
    expected: current,
    expectedRows: first.post_media,
    rollbackOf: f.input.operationId,
    reason: "Restore the exact last gallery operation.",
  };
  const entry = {
    ...last,
    operation: "rollback",
    operation_id: input.operationId,
    reason: input.reason,
    rollback_of: input.rollbackOf,
    verified_pairs: [],
    before: mediaContent(current),
    after: last.before,
    media_before: first.post_media,
    media_after: last.media_before,
  };
  const result = {
    ok: true,
    replayed: false,
    entry,
    post: {
      ...current,
      metadata: { ...(f.post.metadata as Row), [MEDIA_HISTORY]: [last, entry] },
    },
    post_media: last.media_before,
  };
  const admin = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({ data: first.post_media, error: null }).then(
            resolve,
          );
        },
      };
    },
    rpc() {
      return Promise.resolve({ data: result, error: null });
    },
  } as unknown as SupabaseClient;
  const r = await handleMediaCorrection(
    admin,
    CADU_MEDIA_ACTOR,
    { action: "edit", postId, mediaCorrection: input },
    current,
    response,
    {
      resolveDns: () => {
        throw Error("No rollback network permitted");
      },
    },
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).code, "MEDIA_ROLLED_BACK");
});
