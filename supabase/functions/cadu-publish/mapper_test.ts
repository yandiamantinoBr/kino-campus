import assert from "node:assert/strict";
import { mapItemToPost } from "./mapper.ts";

Deno.test("Cadu mapper preserves raw source title, registry lineage and action fingerprints", () => {
  const mapped = mapItemToPost({
    module: "oportunidades",
    title: "Edital 42/2026 abre inscricoes",
    description: "Inscricoes abertas para estudantes da UFG.",
    sourceUrl: "https://ufg.br/n/edital-42-2026",
    sourceId: "  ufg:edital:42-2026  ",
    sourceTitle: "Edital nº 42/2026 — texto original da fonte",
    sourceRegistryId: "ppg-example-operational",
    actionFingerprints: ["apply:abc123", " apply:abc123 ", "deadline:def456"],
    extractedLinks: [
      { url: "https://ufg.br/edital-42.pdf", label: "Edital" },
    ],
    relevantLinks: {
      formularios: [{ url: "https://forms.ufg.br/42", label: "Inscricao" }],
    },
    actionEvidence: [{
      type: "form",
      value: "https://forms.ufg.br/42",
      source: "relevant_links",
      confidence: "high",
    }],
    link: "https://ufg.br/n/edital-42-2026",
    linkAsCta: true,
  });

  assert.equal(
    mapped.row.metadata.source_registry_id,
    "ppg-example-operational",
  );
  assert.deepEqual(mapped.row.metadata.action_fingerprints, [
    "apply:abc123",
    "deadline:def456",
  ]);
  assert.equal(mapped.row.metadata.source_id, "ufg:edital:42-2026");
  assert.equal(
    mapped.row.metadata.source_title,
    "Edital nº 42/2026 — texto original da fonte",
  );
  assert.deepEqual(mapped.row.metadata.extracted_links, [{
    url: "https://ufg.br/edital-42.pdf",
    label: "Edital",
  }]);
  assert.deepEqual(mapped.row.metadata.relevant_links, {
    formularios: [{ url: "https://forms.ufg.br/42", label: "Inscricao" }],
  });
  assert.deepEqual(mapped.row.metadata.action_evidence, [{
    type: "form",
    value: "https://forms.ufg.br/42",
    source: "relevant_links",
    confidence: "high",
  }]);
});

Deno.test("Cadu mapper aligns expiry with an event end or opportunity deadline", () => {
  const event = mapItemToPost({
    module: "eventos",
    title: "SimpÃ³sio UFG 2026",
    description: "Evento acadÃªmico com programaÃ§Ã£o completa e participaÃ§Ã£o aberta Ã  comunidade.",
    dateStart: "2099-09-18",
    dateEnd: "2099-09-19",
    sourceUrl: "https://ufg.br/n/202700",
    sourceId: "ufg:article:202700",
  });
  assert.equal(event.row.expires_at, "2099-09-20T02:59:59.999Z");

  const opportunity = mapItemToPost({
    module: "oportunidades",
    title: "SeleÃ§Ã£o de bolsistas",
    description: "InscriÃ§Ãµes abertas para seleÃ§Ã£o de bolsistas atÃ© 27/08/2099.",
    deadlineDate: "2099-08-27",
    sourceUrl: "https://ufg.br/n/202701",
    sourceId: "ufg:article:202701",
  });
  assert.equal(opportunity.row.expires_at, "2099-08-28T02:59:59.999Z");
});

Deno.test("Cadu mapper prioritizes typed semantic date roles over noisy text and legacy fields", () => {
  const opportunity = mapItemToPost({
    module: "oportunidades",
    title: "Curso de comunicacao intercultural",
    description: "Inscricoes abertas. Aulas de 10 a 13 de agosto de 2099.",
    deadlineDate: "2099-08-13",
    dates: {
      applicationOpensAt: "2099-07-01",
      applicationDeadline: "2099-07-24",
      eventStartsAt: "2099-08-10",
      eventEndsAt: "2099-08-13",
    },
    sourceUrl: "https://casle.letras.ufg.br/n/202205",
    sourceId: "casle:article:202205",
  });
  assert.equal(opportunity.row.metadata.deadline_date, "2099-07-24");
  assert.equal(opportunity.row.expires_at, "2099-07-25T02:59:59.999Z");
  assert.deepEqual(opportunity.row.metadata.dates, {
    applicationOpensAt: "2099-07-01",
    applicationDeadline: "2099-07-24",
    eventStartsAt: "2099-08-10",
    eventEndsAt: "2099-08-13",
  });

  const event = mapItemToPost({
    module: "eventos",
    title: "Programacao de ferias no Planetario",
    description: "Inscricoes ate 10/07/2099. Sessoes durante as ferias.",
    dateStart: "2099-07-10",
    dateEnd: "2099-07-10",
    dates: {
      eventStartsAt: "2099-07-13",
      eventEndsAt: "2099-07-31",
    },
    sourceUrl: "https://planetario.ufg.br/e/39107",
    sourceId: "planetario:event:39107",
  });
  assert.equal(event.row.metadata.data_evento, "2099-07-13");
  assert.equal(event.row.metadata.data_fim_evento, "2099-07-31");
  assert.equal(event.row.expires_at, "2099-08-01T02:59:59.999Z");
});

Deno.test("Cadu mapper normalizes snake-case and top-level semantic date aliases", () => {
  const opportunity = mapItemToPost({
    module: "oportunidades",
    title: "Edital de mobilidade",
    description: "Confira os requisitos e envie sua candidatura.",
    applicationDeadline: "2099-09-18",
    dates: {
      application_opens_at: "2099-09-01",
      result_published_at: "2099-09-30",
    },
    sourceUrl: "https://sri.ufg.br/n/edital-mobilidade",
    sourceId: "sri:edital:mobilidade",
  });

  assert.equal(opportunity.row.metadata.deadline_date, "2099-09-18");
  assert.deepEqual(opportunity.row.metadata.dates, {
    applicationOpensAt: "2099-09-01",
    applicationDeadline: "2099-09-18",
    resultPublishedAt: "2099-09-30",
  });
});
