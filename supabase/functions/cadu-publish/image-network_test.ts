import assert from "node:assert/strict";

Deno.test("publication does not pre-persist a mapped image before DNS/redirect validation", async () => {
  const { handlePublish } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  try {
    for (const mode of ["dns", "redirect", "public"]) {
      const inserts: Array<Record<string, unknown>> = [];
      let fetches = 0;
      let uploads = 0;
      let replacements = 0;
      const uploadedUrl =
        "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/uploaded.png";
      const admin = {
        from(table: string) {
          if (table === "audit_log") {
            return { insert: () => Promise.resolve({ error: null }) };
          }
          return {
            insert(row: Record<string, unknown>) {
              inserts.push(row);
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { ...row, id: "post-1" },
                      error: null,
                    }),
                }),
              };
            },
          };
        },
        storage: {
          from: () => ({
            upload: () => {
              uploads++;
              return Promise.resolve({ error: null });
            },
            getPublicUrl: () => ({ data: { publicUrl: uploadedUrl } }),
          }),
        },
        rpc: () => {
          replacements++;
          return Promise.resolve({ data: { ok: true }, error: null });
        },
      };
      Deno.resolveDns = (() =>
        Promise.resolve([
          mode === "dns" ? "10.0.0.1" : "200.137.208.10",
        ])) as unknown as typeof Deno.resolveDns;
      globalThis.fetch = (() => {
        fetches++;
        return Promise.resolve(
          mode === "public"
            ? new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
              headers: { "content-type": "image/png" },
            })
            : new Response(null, {
              status: 302,
              headers: { location: "https://127.0.0.1/capa.png" },
            }),
        );
      }) as typeof fetch;
      const response = await handlePublish(admin as never, "cadu-user", {
        item: {
          module: "compra-venda",
          category: "livros",
          type: "vendo",
          actionKey: "vendo",
          title: "Livro de calculo a venda",
          description:
            "Livro de calculo em bom estado, com todas as paginas preservadas e sem anotacoes importantes. Consulte os detalhes, requisitos de retirada, local e documentos na fonte oficial: https://ufg.br/comunidade/livro-calculo. Entre em contato para comprar.",
          image: "https://files.cercomp.ufg.br/capa.png",
          allowExternalImageFallback: true,
        },
      });
      const body = await response.json();
      assert.equal(body.code, "PUBLISHED");
      assert.equal(body.image_url, mode === "public" ? uploadedUrl : "");
      assert.equal(inserts.length, 1);
      assert.equal(inserts[0].image_url, null);
      assert.deepEqual(
        (inserts[0].metadata as Record<string, unknown>).gallery_image_urls,
        [],
      );
      assert.equal(
        (inserts[0].metadata as Record<string, unknown>).cover_url,
        "",
      );
      assert.equal(body.media.uploads[0].fallback, false);
      assert.equal(fetches, mode === "dns" ? 0 : 1);
      assert.equal(uploads, mode === "public" ? 1 : 0);
      assert.equal(replacements, mode === "public" ? 1 : 0);
    }
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});

Deno.test("canonical edit never falls back to blocked remote image destinations or replaces existing media", async () => {
  const { handleEdit, handleRequest } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  const source = "https://files.cercomp.ufg.br/weby/up/7/o/capa.png";
  const previousCover =
    "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/previous.png";
  try {
    for (
      const mode of [
        "private-literal",
        "private-dns",
        "private-redirect",
        "public-cover",
        "storage-failure",
      ] as const
    ) {
      let fetches = 0;
      let uploads = 0;
      const replaced: Array<Record<string, unknown>> = [];
      const current = {
        id: "post-1",
        author_id: "cadu-user",
        module: "compra-venda",
        category: "eletronicos",
        status: "published",
        image_url: previousCover,
        metadata: { preserved: true },
      };
      const admin = {
        from(table: string) {
          if (table === "audit_log") {
            return { insert: () => Promise.resolve({ error: null }) };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: current, error: null }),
              }),
            }),
          };
        },
        storage: {
          from: () => ({
            upload: () => {
              uploads++;
              return Promise.resolve({
                error: mode === "storage-failure"
                  ? new Error("storage unavailable")
                  : null,
              });
            },
            getPublicUrl: () => ({
              data: {
                publicUrl: previousCover.replace("previous", "uploaded"),
              },
            }),
          }),
        },
        rpc: (_name: string, args: Record<string, unknown>) => {
          replaced.push(args);
          return Promise.resolve({ data: { ok: true }, error: null });
        },
      };
      Deno.resolveDns = (() =>
        Promise.resolve([
          mode === "private-dns" ? "10.0.0.1" : "200.137.208.10",
        ])) as unknown as typeof Deno.resolveDns;
      globalThis.fetch = (() => {
        fetches++;
        return Promise.resolve(
          mode === "private-redirect"
            ? new Response(null, {
              status: 302,
              headers: { location: "https://[::1]/capa.png" },
            })
            : new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
              headers: { "content-type": "image/png" },
            }),
        );
      }) as typeof fetch;
      const response = await handleEdit(admin as never, "cadu-user", {
        postId: "post-1",
        image: mode === "private-literal"
          ? "https://127.0.0.1/capa.png"
          : source,
        allowExternalImageFallback: true,
      });
      const body = await response.json();
      assert.equal(response.status, 200, mode);
      if (mode === "public-cover" || mode === "storage-failure") {
        assert.equal(fetches, 1, mode);
        assert.equal(uploads, 1, mode);
        assert.equal(replaced.length, 1, mode);
        assert.equal(
          (replaced[0].p_metadata as Record<string, unknown>).preserved,
          true,
        );
        assert.equal(
          body.media.uploads[0].fallback,
          mode === "storage-failure",
        );
        assert.equal(
          body.media.uploads[0].url,
          mode === "storage-failure"
            ? source
            : previousCover.replace("previous", "uploaded"),
        );
      } else {
        assert.equal(fetches, mode === "private-redirect" ? 1 : 0, mode);
        assert.equal(uploads, 0, mode);
        assert.equal(replaced.length, 0, mode);
        assert.equal(body.image_url, previousCover, mode);
        assert.equal(body.image_count, 0, mode);
        assert.ok(
          body.media.uploads.every((image: Record<string, unknown>) =>
            image.fallback === false
          ),
          mode,
        );
      }
    }
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      throw new Error("unauthenticated must never fetch");
    }) as typeof fetch;
    const unauthorized = await handleRequest(
      new Request("https://kino.invalid/functions/v1/cadu-publish", {
        method: "POST",
      }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});

Deno.test("publication dry-run does not resolve DNS or fetch official cover candidates", async () => {
  const { handlePublish } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  let calls = 0;
  try {
    globalThis.fetch = (() => {
      calls++;
      throw new Error("must not fetch");
    }) as typeof fetch;
    Deno.resolveDns = (() => {
      calls++;
      throw new Error("must not resolve");
    }) as typeof Deno.resolveDns;
    const response = await handlePublish({} as never, "cadu-user", {
      item: {
        module: "compra-venda",
        category: "livros",
        type: "vendo",
        actionKey: "vendo",
        title: "Livro de calculo a venda",
        description:
          "Livro de calculo em bom estado, com todas as paginas preservadas e sem anotacoes importantes. Consulte os detalhes, requisitos de retirada, local e documentos na fonte oficial: https://ufg.br/comunidade/livro-calculo. Entre em contato para comprar.",
        enrichmentSources: ["https://www.even3.com.br/evento/"],
      },
      options: { dryRun: true },
    });
    assert.equal((await response.json()).code, "DRY_RUN");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});
