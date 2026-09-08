import assert from "node:assert/strict";
// Import under synthetic configuration only; never read host credentials.
const originalEnv = Deno.env.get;
Deno.env.get = (key: string) => ({
  SUPABASE_URL: "https://diagnostic.invalid",
  SUPABASE_ANON_KEY: "synthetic-anon",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
}[key]);
const { handleRequest } = await import("./index.ts");
Deno.env.get = originalEnv;
const actor = "2345582d-8bf7-4393-aa0d-f9953d0e02ca";
const postId = "00000000-0000-4000-8000-00000000e701";
const body = {
  action: "diagnose-media",
  postId,
  mediaDiagnostic: {
    contract: "cadu-media-verification-diagnostic-v1",
    selection: {},
  },
};

async function request(mode: string, value = body) {
  const previous = globalThis.fetch;
  const previousDns = Deno.resolveDns;
  const calls: string[] = [];
  Deno.resolveDns =
    (() => Promise.resolve(["8.8.8.8"])) as unknown as typeof Deno.resolveDns;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "files.cercomp.ufg.br") {
      calls.push("IMAGE_GET");
      assert.equal(init?.method, "GET");
      return new Response(png.slice(), {
        headers: { "content-type": "image/png" },
      });
    }
    assert.equal(url.origin, "https://diagnostic.invalid");
    calls.push(url.pathname);
    const reply = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (url.pathname === "/auth/v1/user") {
      if (mode === "invalid") return reply({ message: "invalid" }, 401);
      return reply({ id: actor, aud: "authenticated", role: "authenticated" });
    }
    if (url.pathname === "/rest/v1/rpc/kc_is_current_session_active") {
      assert.equal(init?.method, "POST"); // Existing READ-ONLY session check.
      return reply(mode !== "revoked");
    }
    if (url.pathname === "/rest/v1/kc_trusted_publishers") {
      return reply(mode === "untrusted" ? null : { user_id: actor });
    }
    if (url.pathname === "/rest/v1/posts") {
      assert.equal(init?.method, "GET");
      return reply({
        ...((value.mediaDiagnostic.selection as any).expected || {}),
        id: postId,
        author_id: mode === "owner" ? postId : actor,
      });
    }
    if (url.pathname === "/rest/v1/post_media") {
      return reply((value.mediaDiagnostic.selection as any).expectedRows);
    }
    throw new Error("Unexpected endpoint or mutation in diagnostic");
  }) as typeof fetch;
  try {
    const result = await handleRequest(
      new Request("https://kino.invalid/functions/v1/cadu-publish", {
        method: "POST",
        headers: mode === "missing"
          ? {}
          : { Authorization: "Bearer synthetic-user-token" },
        body: JSON.stringify(value),
      }),
    );
    return { status: result.status, data: await result.json(), calls };
  } finally {
    globalThis.fetch = previous;
    Deno.resolveDns = previousDns;
  }
}

Deno.test("explicit diagnostic route reaches read-only validation after existing auth", async () => {
  const r = await request("valid");
  assert.equal(r.status, 422);
  assert.equal(r.data.code, "MEDIA_DIAGNOSTIC_INVALID");
  assert.equal(r.data.read_only, true);
  assert.equal(r.data.mutation_dispatched, false);
  assert.equal(r.calls.filter((p) => p.includes("/rpc/")).length, 1);
  assert(r.calls.includes("/rest/v1/posts"));
});
for (
  const [mode, code, status] of [
    ["missing", "AUTH_REQUIRED", 401],
    ["invalid", "AUTH_INVALID", 401],
    ["revoked", "SESSION_NOT_ACTIVE", 401],
    ["untrusted", "NOT_TRUSTED", 403],
    ["owner", "MEDIA_DIAGNOSTIC_FORBIDDEN", 403],
  ] as const
) {
  Deno.test(`diagnostic HTTP denies ${mode} before image verification`, async () => {
    const r = await request(mode);
    assert.equal(r.status, status);
    assert.equal(r.data.code, code);
    assert(!r.calls.includes("/rest/v1/post_media"));
    assert(
      r.calls.every((p) =>
        !p.includes("/rpc/") || p.endsWith("/kc_is_current_session_active")
      ),
    );
  });
}

const { handleMediaDiagnostic, mediaDiagnosticFailure } = await import(
  "./media-diagnostic.ts"
);
const { integritySnapshot, integrityHash } = await import("./integrity.ts");
const { RemoteResourceError } = await import("./remote-resource.ts");
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
function fixture() {
  const media = [0xe710, 0xe711].map((n, i) => ({
    id: id(n),
    post_id: postId,
    url: `https://files.cercomp.ufg.br/weby/up/1/o/synthetic-${n}.png`,
    is_cover: i === 0,
    sort_order: i,
    created_at: "2026-09-08T12:00:00.123456Z",
  }));
  const post = integritySnapshot({
    id: postId,
    author_id: actor,
    created_at: "2026-09-08T12:00:00.123456Z",
    updated_at: "2026-09-08T12:01:00.654321Z",
    title: "Synthetic media diagnostic",
    description: "Preserve the original text.",
    price: null,
    location: "UFG",
    module: "oportunidades",
    category: "monitoria",
    status: "published",
    visibility: "public",
    image_url: media[0].url,
    expires_at: "2026-10-09T02:59:59.999Z",
    metadata: {
      source_id: "web.ufg.fixture:1",
      source_url: "https://ufg.br/n/1",
      image_url: media[0].url,
      gallery_image_urls: media.map((m) => m.url),
      gallery_count: 2,
    },
  });
  return {
    post,
    media,
    request: {
      action: "diagnose-media",
      postId,
      mediaDiagnostic: {
        contract: "cadu-media-verification-diagnostic-v1",
        selection: {
          contract: "cadu-edit-media-selection-v1",
          operation: "deduplicate",
          operationId: id(0xe720),
          expected: structuredClone(post),
          expectedRows: structuredClone(media),
          reason:
            "Verify full identical bytes without requesting any mutation.",
          pairs: [{ removeId: media[1].id, keepId: media[0].id, sha256: hash }],
        },
      },
    },
  };
}
type Fixture = ReturnType<typeof fixture>;
async function run(
  options: { mutate?: (f: Fixture) => void; mode?: string; actor?: string } =
    {},
) {
  const f = fixture();
  options.mutate?.(f);
  const original = structuredClone(f);
  let reads = 0, mediaReads = 0, gets = 0, dns = 0, active = 0, maxActive = 0;
  const readers = {
    readPost: async () => {
      reads++;
      if (options.mode === "read_error") throw Error("secret database detail");
      const post = structuredClone(f.post);
      if (reads === 2 && options.mode === "post_race") {
        post.updated_at = "2026-09-08T12:01:00.654322Z";
      }
      return post;
    },
    readMedia: async () => {
      mediaReads++;
      const m = structuredClone(f.media);
      if (mediaReads === 2 && options.mode === "media_race") {
        m[0].created_at = "2026-09-08T12:00:00.123457Z";
      }
      return m;
    },
  };
  const deps = {
    resolveDns: async (_h: string, type: "A" | "AAAA") => {
      dns++;
      if (options.mode === "dns_unavailable") {
        throw Error("secret resolver detail");
      }
      if (options.mode === "dns_absent") throw new Deno.errors.NotFound();
      if (options.mode === "aaaa_absent" && type === "AAAA") {
        throw new Deno.errors.NotFound();
      }
      return [options.mode === "dns_private" ? "127.0.0.1" : "8.8.8.8"];
    },
    fetch: async (_url: string, init: RequestInit) => {
      gets++;
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        assert.equal(init.method, "GET");
        assert.equal(init.redirect, "manual");
        assert.equal(init.credentials, "omit");
        assert(!new Headers(init.headers).has("authorization"));
        await Promise.resolve();
        if (options.mode === "transport") {
          throw new TypeError(
            "https://private.example/secret?token=DO_NOT_LEAK",
          );
        }
        if (options.mode === "redirect") {
          return new Response(null, {
            status: 302,
            headers: { location: "https://private.example/secret" },
          });
        }
        if (options.mode === "http_403") {
          return new Response(null, { status: 403 });
        }
        if (options.mode === "declared_large") {
          return new Response(new Uint8Array(1), {
            headers: {
              "content-type": "image/png",
              "content-length": String(4 * 1024 * 1024 + 1),
            },
          });
        }
        if (options.mode === "body_large") {
          return new Response(new Uint8Array(4 * 1024 * 1024 + 1), {
            headers: { "content-type": "image/png" },
          });
        }
        if (options.mode === "bad_raster") {
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png" },
          });
        }
        if (options.mode === "empty") {
          return new Response(new Uint8Array(), {
            headers: { "content-type": "image/png" },
          });
        }
        return new Response(png.slice(), {
          headers: { "content-type": "image/png" },
        });
      } finally {
        active--;
      }
    },
  };
  const r = await handleMediaDiagnostic(
    options.actor || actor,
    f.request,
    readers,
    (s, b) => new Response(JSON.stringify(b), { status: s }),
    deps,
  );
  const data = await r.json();
  assert.deepEqual(f, original);
  assert.equal(data.read_only, true);
  assert.equal(data.mutation_dispatched, false);
  assert(!JSON.stringify(data).includes("DO_NOT_LEAK"));
  assert(!JSON.stringify(data).includes("https://"));
  return { status: r.status, data, reads, mediaReads, gets, dns, maxActive, f };
}
Deno.test("diagnostic HTTP success uses only session read RPC and SELECTs, never media RPC or uploads", async () => {
  const r = await request("valid", fixture().request);
  assert.equal(r.status, 200);
  assert.equal(r.data.code, "MEDIA_DIAGNOSTIC_VERIFIED");
  assert.equal(r.data.read_only, true);
  assert.equal(r.data.mutation_dispatched, false);
  assert.equal(r.calls.filter((p) => p.includes("/rpc/")).length, 1);
  assert.equal(r.calls.filter((p) => p === "IMAGE_GET").length, 2);
});
for (const action of ["edit", "publish", "review"]) {
  Deno.test(`diagnostic envelope cannot fall through to ${action}`, async () => {
    const r = await request("valid", { ...body, action });
    assert.equal(r.status, 422);
    assert.equal(r.data.code, "MEDIA_DIAGNOSTIC_INVALID");
    assert(!r.calls.includes("/rest/v1/posts"));
  });
}
Deno.test("verified receipt binds the exact selection and snapshot without mutation authority", async () => {
  const r = await run();
  assert.equal(r.status, 200);
  assert.equal(r.data.code, "MEDIA_DIAGNOSTIC_VERIFIED");
  assert.equal(r.gets, 2);
  assert.equal(r.reads, 2);
  assert.equal(r.mediaReads, 2);
  assert(r.maxActive <= 2);
  assert.deepEqual(r.data.verified_pairs, [{
    ...r.f.request.mediaDiagnostic.selection.pairs[0],
    bytes: png.length,
  }]);
  assert.equal(
    r.data.selection_hash,
    await integrityHash(r.f.request.mediaDiagnostic.selection),
  );
});
for (
  const [mode, code, status] of [
    ["dns_unavailable", "remote_dns_unavailable", 422],
    ["dns_private", "remote_dns_not_public", 422],
    ["dns_absent", "remote_dns_not_public", 422],
    ["transport", "remote_transport_failed", 422],
    ["redirect", "image_redirect_blocked", 422],
    ["http_403", "image_download_http_error", 422],
    ["declared_large", "remote_body_too_large", 422],
    ["body_large", "remote_body_too_large", 422],
    ["bad_raster", "image_raster_unverified", 422],
    ["empty", "empty_image", 422],
    ["post_race", "snapshot_changed", 409],
    ["media_race", "snapshot_changed", 409],
    ["read_error", "snapshot_unavailable", 503],
  ] as const
) {
  Deno.test(`diagnostic ${mode} has a closed reason and no mutation client`, async () => {
    const r = await run({ mode });
    assert.equal(r.status, status);
    assert.equal(r.data.diagnostic_code, code);
    assert(r.gets <= 2);
    if (mode.startsWith("dns")) assert.equal(r.gets, 0);
  });
}
Deno.test("authoritative AAAA absence preserves the existing public A contract", async () => {
  assert.equal((await run({ mode: "aaaa_absent" })).status, 200);
});
for (
  const [name, mutate] of [
    [
      "mixed fields",
      (f: Fixture) =>
        Object.assign(f.request, { fields: { status: "published" } }),
    ],
    ["mixed mutation", (f: Fixture) =>
      Object.assign(f.request, {
        mediaCorrection: f.request.mediaDiagnostic.selection,
      })],
    ["wrong contract", (f: Fixture) => {
      f.request.mediaDiagnostic.contract = "unknown";
    }],
    [
      "arbitrary patch",
      (f: Fixture) =>
        Object.assign(f.request.mediaDiagnostic.selection, {
          patch: { status: "published" },
        }),
    ],
    ["four pairs", (f: Fixture) => {
      f.request.mediaDiagnostic.selection.pairs = Array(4).fill(
        f.request.mediaDiagnostic.selection.pairs[0],
      );
    }],
    ["stale post", (f: Fixture) => {
      f.post.title = "Materially changed";
    }],
    ["stale media", (f: Fixture) => {
      f.media[1].url += "?changed";
    }],
    ["wrong hash", (f: Fixture) => {
      f.request.mediaDiagnostic.selection.pairs[0].sha256 = "0".repeat(64);
    }],
    ["oversize reason", (f: Fixture) => {
      f.request.mediaDiagnostic.selection.reason = "X".repeat(1001);
    }],
    ["remove cover", (f: Fixture) => {
      const p = f.request.mediaDiagnostic.selection.pairs[0];
      [p.removeId, p.keepId] = [p.keepId, p.removeId];
    }],
  ] as const
) {
  Deno.test(`diagnostic rejects ${name}`, async () => {
    const r = await run({ mutate });
    assert(r.status === 409 || r.status === 422);
    if (name !== "wrong hash") assert.equal(r.gets, 0);
  });
}
Deno.test("canonical actor is required before any post or image reads", async () => {
  const r = await run({ actor: id(0xe799) });
  assert.equal(r.status, 403);
  assert.equal(r.reads, 0);
  assert.equal(r.gets, 0);
});
Deno.test("unknown error messages never become diagnostic data", () => {
  for (
    const e of [
      new Error("remote_dns_unavailable"),
      new RemoteResourceError("arbitrary_private_text"),
      new Error("https://secret.invalid/?token=foo"),
    ]
  ) assert.equal(mediaDiagnosticFailure(e), "media_verification_failed");
});
Deno.test("three exact pairs use at most six objects and two concurrent downloads", async () => {
  const r = await run({
    mutate: (f) => {
      f.media = Array.from(
        { length: 6 },
        (_, i) => ({
          ...f.media[0],
          id: id(0xe710 + i),
          url: `https://files.cercomp.ufg.br/weby/up/1/o/synthetic-${i}.png`,
          is_cover: i === 0,
          sort_order: i,
        }),
      );
      f.post.image_url = f.media[0].url;
      Object.assign(f.post.metadata as object, {
        image_url: f.media[0].url,
        gallery_image_urls: f.media.map((m) => m.url),
        gallery_count: 6,
      });
      const s = f.request.mediaDiagnostic.selection;
      s.expected = structuredClone(f.post);
      s.expectedRows = structuredClone(f.media);
      s.pairs = [0, 2, 4].map((i) => ({
        keepId: f.media[i].id,
        removeId: f.media[i + 1].id,
        sha256: hash,
      }));
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.gets, 6);
  assert.equal(r.maxActive, 2);
});
Deno.test("real verifier retains its eight-second per-image abort bound", async () => {
  const f = fixture(), oldTimer = globalThis.setTimeout, delays: number[] = [];
  let requests = 0;
  globalThis.setTimeout = ((
    callback: Parameters<typeof setTimeout>[0],
    delay?: number,
  ) => {
    delays.push(delay || 0);
    return oldTimer(callback, 1);
  }) as typeof setTimeout;
  try {
    const r = await handleMediaDiagnostic(
      actor,
      f.request,
      { readPost: async () => f.post, readMedia: async () => f.media },
      (s, b) => new Response(JSON.stringify(b), { status: s }),
      {
        resolveDns: async () => ["8.8.8.8"],
        fetch: async (_url, init) => {
          requests++;
          return await new Promise<Response>((_resolve, reject) =>
            init.signal!.addEventListener(
              "abort",
              () => reject(new Error("private timeout detail")),
              { once: true },
            )
          );
        },
      },
    );
    const value = await r.json();
    assert.equal(r.status, 422);
    assert.equal(value.diagnostic_code, "remote_resource_aborted");
    assert.deepEqual(delays, [8000, 8000]);
    assert.equal(requests, 2);
    assert.equal(value.mutation_dispatched, false);
  } finally {
    globalThis.setTimeout = oldTimer;
  }
});
