import assert from "node:assert/strict";
import { mapItemToPost } from "./mapper.ts";
import { validateItem, type CaduItem } from "./schema.ts";
import { MAX_CADU_DESCRIPTION_LENGTH } from "./description.ts";
import fixtures from "./fixtures/d7-description-cases.json" with { type: "json" };

const now = new Date("2026-08-31T16:00:00Z");
const bodyOf = (text: string) => text.normalize("NFKC").split(/\n+/)
  .map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
const base: CaduItem = {
  module: "eventos", category: "academicos", title: "Seminário de pesquisa",
  description: "Evento acadêmico com apresentação pública de projetos.",
  sourceUrl: "https://ufg.br/n/203943",
};

for (const fixture of fixtures.cases) {
  Deno.test(`complete d7 formatter body survives mapping: ${fixture.sourceUrl}`, () => {
    const mapped = mapItemToPost(fixture.item as CaduItem, { now });
    assert.ok(mapped.row.description.startsWith(bodyOf(fixture.item.formattedDescription)));
    assert.ok(mapped.row.description.length <= 5000);
    for (const pdf of fixture.item.pdfLinks || []) {
      if (fixture.item.formattedDescription.includes(pdf)) {
        assert.equal(mapped.row.description.split(pdf).length - 1, 1, "already linked PDF must not be appended again");
      }
    }
    // Keep canonical evidence, CTA, dates and category unchanged by body repair.
    assert.equal(mapped.row.metadata.source_revision, fixture.sourceRevision);
    assert.equal(mapped.row.category, fixture.item.category);
    assert.equal(mapped.row.metadata.actionLabel, fixture.item.actionLabel);
    for (const key of ["eventStartsAt", "eventEndsAt", "applicationOpensAt", "applicationDeadline"]) {
      const value = (fixture.item.dates as Record<string, unknown>)[key];
      if (value) assert.equal((mapped.row.metadata.dates as Record<string, unknown>)[key], value);
    }
  });
}

Deno.test("d7 support list never publishes a broken PDF-extracted form or a news taxonomy as a document", () => {
  const ppgll = fixtures.cases.find((item) => item.sourceUrl.includes("pos.letras"))!;
  const inf = fixtures.cases.find((item) => item.sourceUrl.includes("inf.ufg"))!;
  const ppgllMapped = mapItemToPost(ppgll.item as CaduItem, { now });
  const infMapped = mapItemToPost(inf.item as CaduItem, { now });
  assert.ok(!ppgllMapped.row.description.includes("Sc0Flu5PQWKJ0-]"));
  assert.ok(!(ppgllMapped.row.metadata.official_document_urls as string[]).includes("https://docs.google.com/forms/d/e/1FAIpQLSc0Flu5PQWKJ0-"));
  assert.ok(!infMapped.row.description.includes("news?tags=EDITAL"));
  // Raw observations remain for audit; filtering a supplement is not action authorization.
  assert.deepEqual(ppgllMapped.row.metadata.extracted_links, ppgll.item.extractedLinks);
  assert.equal(ppgllMapped.row.metadata.link, ppgll.item.link);
});

Deno.test("administrative 5000-character limit fails closed before mapping without truncating approved facts", () => {
  assert.equal(MAX_CADU_DESCRIPTION_LENGTH, 5000);
  const exact = `**Evento:** ${"x".repeat(4988)}`;
  assert.equal(exact.length, 5000);
  const valid = { ...base, description: exact, formattedDescription: exact };
  assert.equal(validateItem(valid).ok, true);
  assert.equal(mapItemToPost(valid, { now }).row.description, exact);
  for (const field of ["formattedDescription", "formatted_description", "description", "summary", "text"]) {
    const item = { ...base, description: undefined, [field]: exact + "x" };
    const validation = validateItem(item);
    assert.equal(validation.ok, false, field);
    assert.ok(validation.errors.some((error) => /5000/.test(error)), field);
    assert.throws(() => mapItemToPost(item, { now }), /5000/);
  }
});

Deno.test("publish rejects oversized selected bodies and fallbacks before any lookup, media or write", async () => {
  const { handlePublish } = await import("./index.ts");
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  let sideEffects = 0;
  const blocked = () => { sideEffects++; throw new Error("Unexpected I/O before description validation"); };
  const admin = new Proxy({}, { get: blocked });
  try {
    globalThis.fetch = blocked as typeof fetch;
    Deno.resolveDns = blocked as typeof Deno.resolveDns;
    for (const formattedDescription of [undefined, "invalid short formatter", `**Evento:** ${"x".repeat(5001)}`]) {
      const item = { ...base, description: `**Evento:** ${"x".repeat(5001)}`, formattedDescription };
      assert.equal(validateItem(item).ok, false);
      const response = await handlePublish(admin as never, "cadu-user", { item });
      assert.equal(response.status, 422);
      const body = await response.json();
      assert.equal(body.code, "VALIDATION_FAILED");
      assert.match(body.message, /5000/);
    }
    assert.equal(sideEffects, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.resolveDns = originalDns;
  }
});

Deno.test("long raw evidence does not reject a valid shorter formatter body", () => {
  const formattedDescription = `**Evento:** ${"texto completo ".repeat(180).trim()}`;
  const item = { ...base, description: "evidência bruta ".repeat(600), formattedDescription };
  assert.equal(validateItem(item).ok, true);
  assert.ok(mapItemToPost(item, { now }).row.description.startsWith(formattedDescription));
});

Deno.test("supplement budget omits whole optional links, never the body or a partial Markdown URL", () => {
  const body = `**Evento:** ${"x".repeat(4888)}`;
  const pdf = `https://ufg.br/${"edital-completo-".repeat(10)}.pdf`;
  const mapped = mapItemToPost({ ...base, formattedDescription: body,
    extractedLinks: [{ url: pdf, label: "Edital completo" }] }, { now });
  assert.ok(mapped.row.description.startsWith(body));
  assert.ok(!mapped.row.description.includes(pdf));
  assert.ok(!mapped.row.description.includes("Editais e documentos:"));
  assert.ok(!mapped.row.description.endsWith("..."));
  assert.ok(mapped.row.description.length <= 5000);
  assert.ok(mapped.warnings.includes("description_supplement_omitted_budget"));
  assert.ok((mapped.row.metadata.official_document_urls as string[]).includes(pdf));
});

Deno.test("supplements are complete, deduplicated by URL and escape Markdown labels", () => {
  const pdf = "https://ufg.br/normas.pdf";
  const mapped = mapItemToPost({ ...base, extractedLinks: [
    { url: pdf, label: "Regras [2026] *oficiais*" }, { url: pdf, label: "Duplicado" },
  ], pdfLinks: [pdf] }, { now });
  assert.ok(mapped.row.description.includes("**Regras \\[2026\\] \\*oficiais\\*:**"));
  assert.equal(mapped.row.description.split(`](${pdf})`).length - 1, 1);
  assert.equal(mapped.row.description.split(`](${base.sourceUrl})`).length - 1, 1);
});

Deno.test("URL-labelled Markdown is already linked, while a distinct document query is preserved", () => {
  const pdf = "https://ufg.br/normas.pdf";
  const revised = `${pdf}?revision=2`;
  const body = `**Evento acadêmico:** ${"informações oficiais ".repeat(8)} [${pdf}](${pdf})`;
  const mapped = mapItemToPost({ ...base, formattedDescription: body,
    extractedLinks: [{ url: pdf, label: "Normas" }, { url: revised, label: "Edital retificado" }],
  }, { now });
  assert.equal(mapped.row.description.split(`](${pdf})`).length - 1, 1);
  assert.equal(mapped.row.description.split(`](${revised})`).length - 1, 1);
});

Deno.test("known news tag indexes are not documents, without dropping query-addressed individual pages", () => {
  const individual = "https://ufg.br/news?id=203943";
  const mapped = mapItemToPost({ ...base, extractedLinks: [
    { url: "https://ufg.br/news?tags=EDITAL", label: "Edital" },
    { url: individual, label: "Edital específico" },
  ] }, { now });
  assert.ok(!mapped.row.description.includes("tags=EDITAL"));
  assert.ok(mapped.row.description.includes(`](${individual})`));
});
