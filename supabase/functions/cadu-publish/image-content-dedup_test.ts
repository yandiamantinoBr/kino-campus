import assert from "node:assert/strict";

// 2026-09-10: dedup por conteúdo — URLs de origem distintas com bytes idênticos
// (cópia do coletor + CDN original) geravam duas linhas em post_media e duas
// ocorrências na galeria (regressão observada no post d08588d2). O primeiro
// upload vence; bytes idênticos ficam fora da galeria e não sobem de novo.
Deno.test("identical image bytes across distinct source URLs produce a single gallery occurrence and one upload", async () => {
  const { handlePublish } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  try {
    let uploads = 0;
    let replacements = 0;
    const mediaCalls: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
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
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === "kc_cadu_replace_post_media") {
          mediaCalls.push(args);
        }
        return Promise.resolve({ data: { ok: true }, error: null });
      },
    };
    Deno.resolveDns = (() =>
      Promise.resolve(["200.137.208.10"])) as unknown as typeof Deno.resolveDns;
    // Mesmos bytes para qualquer origem (as duas URLs são distintas).
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]), {
          headers: { "content-type": "image/png" },
        }),
      )) as typeof fetch;
    const response = await handlePublish(admin as never, "cadu-user", {
      item: {
        module: "compra-venda",
        category: "livros",
        type: "vendo",
        actionKey: "vendo",
        title: "Livro de calculo a venda",
        description:
          "Livro de calculo em bom estado, com todas as paginas preservadas e sem anotacoes importantes. Consulte os detalhes, requisitos de retirada, local e documentos na fonte oficial: https://ufg.br/comunidade/livros-usados e confira condicoes de pagamento antes de fechar o negocio.",
        image: "https://files.cercomp.ufg.br/capa.png",
        images: [
          "https://files.cercomp.ufg.br/capa.png",
          "https://files.cercomp.ufg.br/m/capa.png",
        ],
        allowExternalImageFallback: true,
      },
    });
    const body = await response.json();
    assert.equal(body.code, "PUBLISHED");
    assert.equal(uploads, 1);
    assert.deepEqual(
      (mediaCalls[0]?.p_image_urls as unknown as string[]) || [],
      [uploadedUrl],
    );
    const uploadsList = body.media.uploads as Array<Record<string, unknown>>;
    assert.equal(uploadsList.length, 2);
    assert.equal(uploadsList[0].url, uploadedUrl);
    assert.equal(uploadsList[0].duplicateOfContent, undefined);
    assert.equal(uploadsList[1].url, "");
    assert.equal(uploadsList[1].duplicateOfContent, true);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});
