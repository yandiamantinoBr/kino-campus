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
