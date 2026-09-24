import assert from "node:assert/strict";

// 2026-09-22 (issue #584 / FRAG-05): o publish gravava status:'published' com
// image_url:null ANTES de inserir as imagens; falha de capa virava só
// media.error no corpo HTTP (nada persistido no row/audit) e o rerun respondia
// DUPLICATE sem permitir reparo. Estes casos travam o contrato corrigido:
//   (a) falha de capa não deixa post published sem motivo registrado;
//   (b) media_error:<code> persiste (row via media_state e audit_log);
//   (c) rerun com mídia pendente/falhada repara a mídia (idempotente);
//   (d) o caso feliz continua publicando com imagens (mídia antes do status).
const UPLOADED_URL =
  "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/uploaded.png";
const SOURCE_ID = "src-media-repair-1";
const SOURCE_URL = "https://www.ufg.br/n/edital-livro-calculo";
const CANDIDATE = "https://files.cercomp.ufg.br/capa.png";

function item(image?: string) {
  return {
    module: "compra-venda",
    category: "livros",
    type: "vendo",
    actionKey: "vendo",
    title: "Livro de calculo a venda",
    description:
      "Livro de calculo em bom estado, com todas as paginas preservadas e sem anotacoes importantes. Consulte os detalhes, requisitos de retirada, local e documentos na fonte oficial: https://ufg.br/comunidade/livros-usados e confira condicoes de pagamento antes de fechar o negocio.",
    sourceId: SOURCE_ID,
    sourceUrl: SOURCE_URL,
    ...(image ? { image } : {}),
    allowExternalImageFallback: true,
  } as Record<string, unknown>;
}

function legacyRow(overrides: Record<string, unknown> = {}) {
  // Linha no estado FRAG-05: publicada sem capa e sem marcador de mídia.
  return {
    id: "post-1",
    status: "published",
    image_url: null,
    metadata: {
      source_id: SOURCE_ID,
      source_url: SOURCE_URL,
      content_hash: "hash-legado",
    },
    updated_at: "2026-09-22T12:00:00.000000+00:00",
    ...overrides,
  } as Record<string, unknown>;
}

function harness(existing: Record<string, unknown> | null = null) {
  const inserts: Record<string, unknown>[] = [];
  const updates: { patch: Record<string, unknown>; filters: string[] }[] = [];
  const audits: Record<string, any>[] = [];
  const rpcs: { name: string; args: Record<string, any> }[] = [];
  const events: string[] = [];
  const admin = {
    from(table: string) {
      if (table === "audit_log") {
        return {
          insert: (row: Record<string, unknown>) => {
            audits.push(row as Record<string, any>);
            return Promise.resolve({ error: null });
          },
        };
      }
      assert.equal(table, "posts");
      return {
        select: () => {
          const chain: Record<string, any> = {};
          chain.eq = () => chain;
          chain.neq = () => chain;
          chain.in = () => chain;
          chain.order = () => chain;
          chain.limit = () => chain;
          chain.maybeSingle = () =>
            Promise.resolve({
              data: existing ? structuredClone(existing) : null,
              error: null,
            });
          return chain;
        },
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          events.push("insert");
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { ...row }, error: null }),
            }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          const filters: string[] = [];
          const chain: Record<string, any> = {};
          chain.eq = (field: string) => {
            filters.push(field);
            return chain;
          };
          chain.then = (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown,
          ) => {
            updates.push({ patch, filters });
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          };
          return chain;
        },
      };
    },
    storage: {
      from: () => ({
        upload: () => {
          events.push("upload");
          return Promise.resolve({ error: null });
        },
        getPublicUrl: () => ({ data: { publicUrl: UPLOADED_URL } }),
      }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args: args as Record<string, any> });
      events.push("rpc");
      return Promise.resolve({ data: { ok: true }, error: null });
    },
  };
  return { admin, inserts, updates, audits, rpcs, events };
}

function stubNetwork(mode: "ok" | "dns-private" | "throw-fetch") {
  Deno.resolveDns = (() =>
    Promise.resolve([mode === "dns-private" ? "10.0.0.1" : "200.137.208.10"])) as unknown as
    typeof Deno.resolveDns;
  globalThis.fetch = (mode === "throw-fetch"
    ? (() => {
      throw new Error("sem rede neste cenario");
    })
    : (() =>
      Promise.resolve(
        new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
          headers: { "content-type": "image/png" },
        }),
      ))) as typeof fetch;
}

Deno.test("FRAG-05 (a): falha de capa nunca deixa post published sem motivo registrado", async () => {
  const { handlePublish } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  try {
    // Item COM candidato de imagem e falha permanente de rede: fail-closed —
    // nenhum row 'published' sem capa é criado e o motivo fica registrado.
    stubNetwork("dns-private");
    const failing = harness();
    const response = await handlePublish(failing.admin as never, "cadu-user", {
      item: item(CANDIDATE),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.code, "MEDIA_FAILED");
    assert.equal(body.reason, "media_error:remote_dns_not_public");
    assert.equal(failing.inserts.length, 0, "nada persistido como published");
    assert.equal(failing.rpcs.length, 0);
    assert.equal(body.media.uploads[0].fallback, false);
    const failed = failing.audits.find((row) => row.action === "cadu_post_media_failed");
    assert.ok(failed, "a falha persiste como reason code no audit_log");
    assert.equal(failed.payload.reason, "media_error:remote_dns_not_public");

    // Item SEM candidatos: o contrato da Edge declara modo sem-imagem — publica,
    // mas com o motivo registrado explicitamente no row (nunca "sem motivo").
    stubNetwork("throw-fetch");
    const noImage = harness();
    const published = await handlePublish(noImage.admin as never, "cadu-user", {
      item: item(),
    });
    const publishedBody = await published.json();
    assert.equal(publishedBody.code, "PUBLISHED");
    assert.equal(noImage.inserts.length, 1);
    assert.equal(noImage.inserts[0].image_url, null);
    const state = (noImage.inserts[0].metadata as Record<string, any>).media_state;
    assert.deepEqual(state, { status: "no_image", reason: "missing_image_candidates", image_count: 0 });
    assert.equal(publishedBody.media.reason, "missing_image_candidates");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});

Deno.test("FRAG-05 (b): a falha de midia persiste como media_error:<code> no row e no audit", async () => {
  const { handlePublish } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  try {
    stubNetwork("dns-private");
    // Rerun cujo reparo também falha: o reason code assenta no PRÓPRIO row
    // (media_state, com CAS em updated_at) e no audit_log — não só no HTTP.
    const db = harness(legacyRow());
    const response = await handlePublish(db.admin as never, "cadu-user", {
      item: item(CANDIDATE),
    });
    const body = await response.json();
    assert.equal(body.code, "DUPLICATE");
    assert.equal(body.media_repaired, false);
    assert.equal(body.reason, "media_error:remote_dns_not_public");
    assert.equal(db.inserts.length, 0, "nenhum post novo em DUPLICATE");
    assert.equal(db.rpcs.length, 0, "sem imagem válida nada é aplicado");
    assert.equal(db.updates.length, 1, "marcador durável no row");
    const { patch, filters } = db.updates[0];
    const metadata = patch.metadata as Record<string, any>;
    assert.deepEqual(metadata.media_state, {
      status: "error",
      reason: "media_error:remote_dns_not_public",
      image_count: 0,
    });
    assert.ok(filters.includes("updated_at"), "CAS em updated_at");
    assert.equal(filters[0], "id");
    assert.equal(metadata.source_id, SOURCE_ID, "INV-05: identidade preservada");
    assert.equal(metadata.source_url, SOURCE_URL);
    const failed = db.audits.find((row) => row.action === "cadu_post_media_repair_failed");
    assert.ok(failed, "audit do reparo falhado");
    assert.equal(failed.payload.reason, "media_error:remote_dns_not_public");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});

Deno.test("FRAG-05 (c): rerun com midia pendente repara a midia de forma idempotente", async () => {
  const { handlePublish } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  try {
    stubNetwork("ok");
    // Linha legada FRAG-05 (publicada sem capa): o rerun COMPLETA a mídia via
    // UPSERT transacional em vez de só responder DUPLICATE.
    const db = harness(legacyRow());
    const response = await handlePublish(db.admin as never, "cadu-user", {
      item: item(CANDIDATE),
    });
    const body = await response.json();
    assert.equal(body.code, "DUPLICATE", "contrato de dedup preservado");
    assert.equal(body.post_id, "post-1");
    assert.equal(body.media_repaired, true);
    assert.equal(db.inserts.length, 0, "nada de post novo (dedup intocado)");
    assert.equal(db.updates.length, 0, "nada de escrita fora do UPSERT transacional");
    assert.deepEqual(db.events, ["upload", "rpc"], "mídia completada sem INSERT");
    const call = db.rpcs.find((r) => r.name === "kc_cadu_replace_post_media");
    assert.ok(call, "kc_cadu_replace_post_media = UPSERT idempotente");
    assert.equal(call.args.p_post_id, "post-1");
    assert.deepEqual(call.args.p_image_urls, [UPLOADED_URL]);
    const metadata = call.args.p_metadata as Record<string, any>;
    assert.deepEqual(metadata.media_state, { status: "ready", reason: "", image_count: 1 });
    assert.equal(metadata.source_id, SOURCE_ID, "INV-05: identidade preservada");
    assert.equal(metadata.source_url, SOURCE_URL);
    assert.equal(metadata.content_hash, "hash-legado");
    assert.deepEqual(metadata.gallery_image_urls, [UPLOADED_URL]);
    const repaired = db.audits.find((row) => row.action === "cadu_post_media_repaired");
    assert.ok(repaired, "reparo registrado no audit_log");

    // Idempotente: post já saudável (capa + marcador ready) não é tocado de novo.
    const healthy = harness(legacyRow({
      image_url: UPLOADED_URL,
      metadata: {
        source_id: SOURCE_ID,
        source_url: SOURCE_URL,
        content_hash: "hash-legado",
        media_state: { status: "ready", reason: "", image_count: 1 },
      },
    }));
    const again = await handlePublish(healthy.admin as never, "cadu-user", {
      item: item(CANDIDATE),
    });
    const againBody = await again.json();
    assert.equal(againBody.code, "DUPLICATE");
    assert.equal(againBody.media_repaired, false);
    assert.deepEqual(healthy.events, [], "nenhuma I/O de mídia em post saudável");
    assert.equal(healthy.rpcs.length, 0);
    assert.equal(healthy.updates.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});

Deno.test("FRAG-05 (d): o caso feliz continua publicando com imagens — midia antes do status", async () => {
  const { handlePublish } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  try {
    stubNetwork("ok");
    const db = harness();
    const response = await handlePublish(db.admin as never, "cadu-user", {
      item: item(CANDIDATE),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.code, "PUBLISHED");
    assert.equal(body.status, "published");
    assert.equal(body.image_url, UPLOADED_URL);
    assert.equal(body.media.reason, "");
    assert.equal(db.inserts.length, 1);
    assert.deepEqual(db.events, ["upload", "insert", "rpc"], "mídia sobe ANTES do status final");
    const row = db.inserts[0];
    assert.equal(row.status, "published");
    assert.equal(row.image_url, UPLOADED_URL, "capa já no INSERT atômico");
    const metadata = row.metadata as Record<string, any>;
    assert.deepEqual(metadata.gallery_image_urls, [UPLOADED_URL]);
    assert.equal(metadata.cover_url, UPLOADED_URL);
    assert.deepEqual(metadata.media_state, { status: "ready", reason: "", image_count: 1 });
    const call = db.rpcs.find((r) => r.name === "kc_cadu_replace_post_media");
    assert.ok(call);
    assert.equal(call.args.p_post_id, row.id, "post_media transacional no row recém-criado");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});
