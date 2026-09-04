import { hasOfficialNonInstagramSource } from "./index.ts";

function assertEquals(actual: unknown, expected: unknown, message = ""): void {
  const same = Object.is(actual, expected);
  if (!same) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)} ${message}`);
  }
}

Deno.test("official non-Instagram sources cover institucional hosts além de gov.br", () => {
  const base = {
    id: "t1",
    module: "eventos" as const,
    category: "academicos",
    title: "Evento de teste",
    description: "Descrição com https://exemplo.org/link e inscrições abertas para a comunidade acadêmica em geral.",
    sourceUrl: "https://www.instagram.com/ufg_oficial/p/AbCdEf12345/",
  };

  // hosts previamente aceitos continuam aceitos
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: [{ url: "https://ime.ufg.br/", type: "official" }],
  }), true, "ufg.br");
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: ["https://semanadeinovacao.enap.gov.br/"],
  }), true, "gov.br");
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: ["https://www.even3.com.br/conecta-inclusao-2026/"],
  }), true, "even3");
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: ["https://forms.gle/AbCdEf"],
  }), true, "forms.gle");

  // novos hosts institucionais (2026-09-04): Tribunais (jus.br), ANPAD, CFA
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: [{ url: "https://www.tcego.jus.br/conectainclusao", type: "official" }],
  }), true, "jus.br");
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: [{ url: "https://anpad.org.br/", type: "official" }],
  }), true, "anpad.org.br");
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: [{ url: "https://cfa.org.br/jornada2026/", type: "official" }],
  }), true, "cfa.org.br");

  // instagram isolado e hosts genéricos continuam rejeitados
  assertEquals(hasOfficialNonInstagramSource(base), false, "instagram only");
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: ["https://www.sympla.com.br/evento"],
  }), false, "sympla");
  assertEquals(hasOfficialNonInstagramSource({
    ...base,
    enrichmentSources: ["https://qualquersite.org.br/"],
  }), false, "org.br genérico");
});
