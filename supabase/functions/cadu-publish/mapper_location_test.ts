import assert from "node:assert/strict";
import { mapItemToPost } from "./mapper.ts";
import type { CaduItem } from "./schema.ts";

function mappedLocation(description: string, extra: Partial<CaduItem> = {}): string {
  return mapItemToPost({
    module: "eventos",
    category: "academicos",
    title: "Convite para defesa de dissertação",
    sourceName: "Programa de Pós-Graduação em Matemática em Rede Nacional",
    sourceUrl: "https://profmat.ime.ufg.br/n/203815",
    description,
    ...extra,
  }).row.location;
}

Deno.test("Cadu location preserves the published defense Google Meet address", () => {
  // Regression: this production description line became "** Remoto via Google Meet — meet".
  const description = [
    "Defesa de dissertação de Fabriny Aparecida Souza Mesquita.",
    "",
    "**Data:** 31/08/2026 às 16h00",
    "**Local:** Remoto via Google Meet — meet.google.com/hng-pnob-xrb",
    "",
    "A comunidade está convidada a acompanhar a defesa.",
  ].join("\n");
  assert.equal(mappedLocation(description), "Remoto via Google Meet — meet.google.com/hng-pnob-xrb");
});

for (const [description, expected] of [
  ["Local: Auditório Dr. José da Silva, UFG", "Auditório Dr. José da Silva, UFG"],
  ["Local: Av. Universitária, n. 1.533, Goiânia", "Av. Universitária, n. 1.533, Goiânia"],
  ["Local: Remoto via https://meet.google.com/hng-pnob-xrb", "Remoto via https://meet.google.com/hng-pnob-xrb"],
  ["Horário:16h00     Local: (remoto link Meet) meet.google.com/hng-pnob-xrb", "(remoto link Meet) meet.google.com/hng-pnob-xrb"],
  ["**Local**: Auditório Central", "Auditório Central"],
  ["- **Local:** **Auditório Central**", "Auditório Central"],
  ["__Onde:__ _Auditório Central_", "Auditório Central"],
  ["*Cidade:* Goiânia", "Goiânia"],
  ["Campus: Samambaia", "Samambaia"],
  ["Local: [Google Meet](https://meet.google.com/hng-pnob-xrb)", "Google Meet"],
  ["Local: [meet.google.com/hng-pnob-xrb](https://meet.google.com/hng-pnob-xrb)", "meet.google.com/hng-pnob-xrb"],
  ["Local: <https://meet.google.com/hng-pnob-xrb>", "https://meet.google.com/hng-pnob-xrb"],
  ["Local: https://example.org/sala_a_b", "https://example.org/sala_a_b"],
  ["Local: Auditório Central\r\nInscrições: formulário oficial", "Auditório Central"],
  ["Local: Auditório Central\n\nO evento será aberto à comunidade.", "Auditório Central"],
  ["Local: Auditório Central; Horário: 14h", "Auditório Central"],
  ["Local: Auditório Central **Data:** 01/09/2026", "Auditório Central"],
  ["Local:\nInscrições: formulário oficial", ""],
  ["**Local:**\n\nInformações em breve.", ""],
  ["Local: ** **\nMais informações na fonte.", ""],
  ["Local:\nOnde: Auditório Central", "Auditório Central"],
  ["Inscrições abertas. Consulte a fonte oficial.", ""],
  ["A atividade é organizada pela UFG.", ""],
] as const) {
  Deno.test(`Cadu inferred location: ${description.replaceAll("\n", " / ")}`, () => {
    assert.equal(mappedLocation(description), expected);
  });
}

Deno.test("Cadu location keeps the structured location authoritative", () => {
  assert.equal(mappedLocation("Local: Auditório antigo", { location: " Sala atual,  UFG " }), "Sala atual, UFG");
});

Deno.test("Cadu inferred location is bounded without keeping partial words or URLs", () => {
  const prefix = "Auditório Dr. José da Silva, Campus Samambaia, UFG";
  const url = `https://example.org/${"a".repeat(100)}`;
  const location = mappedLocation(`Local: ${prefix} ${url}\nInscrições: abertas`);
  assert.equal(location, prefix);
  assert.ok(location.length <= 90);
  assert.equal(mappedLocation(`Local: ${url}`), "");
  assert.equal(mappedLocation(`Local: ${"A".repeat(90)}`), "A".repeat(90));
});

Deno.test("Cadu does not infer opportunity location from the publisher name", () => {
  assert.equal(mappedLocation("Inscrições abertas.", { module: "oportunidades", category: "editais" }), "");
});
