import assert from "node:assert/strict";
import { handleEdit } from "./index.ts";
import type { CaduItem } from "./schema.ts";

const POST_ID = "ff2f9554-b4ed-425b-b65f-3352df24620a";
const USER_ID = "cadu-user";
const SOURCE_ID = "web.legacy.verbena:203704";
const SOURCE_URL = "https://institutoverbena.ufg.br/n/203704";
const UPDATED_AT = "2026-09-01T09:20:00.000Z";
const EVENT_EXPIRY = "2099-10-12T02:59:59.999Z";
const OPPORTUNITY_EXPIRY = "2099-09-10T02:59:59.999Z";
const COVER = "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/post-media/cadu/sebrae.png";

function currentPost(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    author_id: USER_ID,
    title: "Trainee Sebrae/Go 2026: inscrições até 09/09",
    description: "Descrição anterior.",
    price: 5521.88,
    location: "Goiás",
    module: "eventos",
    category: "academicos",
    status: "published",
    visibility: "public",
    image_url: COVER,
    expires_at: EVENT_EXPIRY,
    updated_at: UPDATED_AT,
    metadata: {
      source_id: SOURCE_ID,
      source_url: SOURCE_URL,
      source_unit: "Instituto Verbena",
      cadu_run_id: "d364cad5-4f5d-4d68-ac71-32bbce9417ac",
      image_url: COVER,
      cover_url: COVER,
      gallery_image_urls: [COVER],
      cover_render: `${COVER}?render=1200`,
      categoriaKey: "academicos",
      tagKeys: ["academicos", "ufg", "instituto-verbena"],
      data_evento: "2099-10-11",
      data_fim_evento: "",
      hora_evento: "",
      dates: {
        applicationOpensAt: "2099-08-26",
        applicationDeadline: "2099-09-09",
        eventStartsAt: "2099-10-11",
      },
    },
    ...overrides,
  };
}

function correctedItem(overrides: Partial<CaduItem> = {}): CaduItem {
  return {
    module: "oportunidades",
    category: "concursos",
    title: "Sebrae/Go Nº 01/2026 - Trainee",
    formattedTitle: "Trainee Sebrae/Go 2026: inscrições até 09/09",
    description: "Processo seletivo para seis vagas de trainee no Sebrae/GO.",
    formattedDescription: [
      "**Oportunidade:** seis vagas de trainee no Sebrae/GO, com remuneração de até R$ 5.521,88.",
      "",
      "**Inscrições:** de 26/08/2099 a 09/09/2099. A prova está prevista para 11/10/2099.",
      "",
      `[Consulte as instruções oficiais](${SOURCE_URL})`,
    ].join("\n"),
    text: "Inscrição 26/08/2099 a 09/09/2099. Data da prova 11/10/2099.",
    sourceId: SOURCE_ID,
    sourceUrl: SOURCE_URL,
    sourceName: "Instituto Verbena",
    sourceRegistryId: "web.legacy.verbena",
    score: 0.77,
    dates: {
      applicationOpensAt: "2099-08-26",
      applicationDeadline: "2099-09-09",
      eventStartsAt: "2099-10-11",
    },
    applicationOpensAt: "2099-08-26",
    applicationDeadline: "2099-09-09",
    eventStartsAt: "2099-10-11",
    link: SOURCE_URL,
    linkAsCta: true,
    actionLabel: "Saiba mais",
    actionKey: "saiba-mais",
    location: "Goiás",
    remuneracao: "Até R$ 5.521,88",
    ...overrides,
  };
}

function request(item: CaduItem = correctedItem(), expected: Record<string, unknown> = {}) {
  return {
    action: "edit",
    postId: POST_ID,
    reclassification: {
      expected: {
        module: "eventos",
        category: "academicos",
        status: "published",
        updatedAt: UPDATED_AT,
        expiresAt: EVENT_EXPIRY,
        sourceId: SOURCE_ID,
        sourceUrl: SOURCE_URL,
        ...expected,
      },
      item,
    },
  };
}

function fakeAdmin(initial: Record<string, unknown>, options: { conflict?: boolean } = {}) {
  let state = structuredClone(initial);
  const updates: Array<Record<string, unknown>> = [];
  const mutationFilters: Array<[string, unknown]> = [];
  let rpcCalls = 0;

  const admin = {
    from(table: string) {
      if (table === "audit_log") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      assert.equal(table, "posts");
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              assert.equal(column, "id");
              assert.equal(value, POST_ID);
              return { maybeSingle: async () => ({ data: structuredClone(state), error: null }) };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          updates.push(structuredClone(payload));
          const mutation = {
            eq(column: string, value: unknown) {
              mutationFilters.push([column, value]);
              return mutation;
            },
            is(column: string, value: unknown) {
              mutationFilters.push([column, value]);
              return mutation;
            },
            select() {
              return mutation;
            },
            async maybeSingle() {
              if (options.conflict) return { data: null, error: null };
              state = {
                ...state,
                ...structuredClone(payload),
                expires_at: "2099-09-10T02:59:59.999+00:00",
                updated_at: "2026-09-01T11:00:00.000Z",
              };
              return { data: structuredClone(state), error: null };
            },
          };
          return mutation;
        },
      };
    },
    rpc() {
      rpcCalls += 1;
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { admin, updates, mutationFilters, rpcCalls: () => rpcCalls, state: () => state };
}

Deno.test("canonical edit reclassifies Sebrae selection without extending it to the exam", async () => {
  const harness = fakeAdmin(currentPost());
  const response = await handleEdit(harness.admin as never, USER_ID, request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.code, "RECLASSIFIED");
  assert.equal(body.contract, "cadu-edit-reclassification-v1");
  assert.equal(body.module, "oportunidades");
  assert.equal(body.category, "concursos");
  assert.equal(body.expires_at, "2099-09-10T02:59:59.999+00:00");

  assert.equal(harness.updates.length, 1);
  const update = harness.updates[0];
  assert.equal(update.module, "oportunidades");
  assert.equal(update.category, "concursos");
  assert.equal(update.expires_at, OPPORTUNITY_EXPIRY);
  assert.equal(update.image_url, undefined, "posts.image_url is preserved, not rewritten");
  const metadata = update.metadata as Record<string, unknown>;
  assert.equal(metadata.deadline_date, "2099-09-09");
  assert.equal(metadata.data_evento, undefined);
  assert.equal(metadata.hora_evento, undefined);
  assert.equal(metadata.image_url, COVER);
  assert.equal(metadata.cover_url, COVER);
  assert.deepEqual(metadata.gallery_image_urls, [COVER]);
  assert.equal(metadata.cover_render, `${COVER}?render=1200`);
  assert((metadata.tagKeys as string[]).includes("concursos"));
  assert(!(metadata.tagKeys as string[]).includes("academicos"));
  assert.equal((metadata.dates as Record<string, unknown>).eventStartsAt, "2099-10-11",
    "the exam remains a semantic milestone, not the expiry boundary");
  assert.equal(harness.rpcCalls(), 0, "post_media replacement is never invoked");
  assert(harness.mutationFilters.some(([field, value]) => field === "updated_at" && value === UPDATED_AT));
  assert(harness.mutationFilters.some(([field, value]) => field === "expires_at" && value === EVENT_EXPIRY));
});

Deno.test("canonical reclassification rejects stale CAS and exact source drift before mutation", async () => {
  for (const badExpected of [
    { updatedAt: "2026-09-01T09:21:00.000Z" },
    { sourceId: "different-source" },
    { sourceUrl: "https://institutoverbena.ufg.br/n/other" },
  ]) {
    const harness = fakeAdmin(currentPost());
    const response = await handleEdit(harness.admin as never, USER_ID, request(correctedItem(), badExpected));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "EDIT_CONFLICT");
    assert.equal(harness.updates.length, 0);
  }
});

Deno.test("canonical reclassification CAS returns conflict when the row changes during update", async () => {
  const harness = fakeAdmin(currentPost(), { conflict: true });
  const response = await handleEdit(harness.admin as never, USER_ID, request());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "EDIT_CONFLICT");
  assert.equal(harness.updates.length, 1);
  assert.equal(harness.state().module, "eventos");
});

Deno.test("canonical reclassification blocks expired lifecycle and non-owner before update", async () => {
  const expired = correctedItem({
    text: "Inscrições de 01/08/2000 a 09/08/2000. Data da prova 11/10/2099.",
    dates: {
      applicationOpensAt: "2000-08-01",
      applicationDeadline: "2000-08-09",
      eventStartsAt: "2099-10-11",
    },
    applicationOpensAt: "2000-08-01",
    applicationDeadline: "2000-08-09",
  });
  const expiredHarness = fakeAdmin(currentPost());
  const expiredResponse = await handleEdit(expiredHarness.admin as never, USER_ID, request(expired));
  assert.equal(expiredResponse.status, 422);
  assert.equal((await expiredResponse.json()).code, "QUALITY_BLOCKED");
  assert.equal(expiredHarness.updates.length, 0);

  const ownerHarness = fakeAdmin(currentPost({ author_id: "another-user" }));
  const ownerResponse = await handleEdit(ownerHarness.admin as never, USER_ID, request());
  assert.equal(ownerResponse.status, 403);
  assert.equal(ownerHarness.updates.length, 0);
});

Deno.test("generic edit rejects module and expiry fields instead of returning a false UPDATED", async () => {
  for (const fields of [
    { module: "oportunidades" },
    { expires_at: OPPORTUNITY_EXPIRY },
  ]) {
    const harness = fakeAdmin(currentPost());
    const response = await handleEdit(harness.admin as never, USER_ID, {
      action: "edit",
      postId: POST_ID,
      fields,
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, "VALIDATION_FAILED");
    assert.equal(harness.updates.length, 0);
  }
});
