import { defaultAcademicBoardCover } from "./mapper.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test("academic board default cover only for defesa/qualificacao without images", () => {
  const base = { module: "eventos", title: "Qualificação de Tese - Maria" };
  assertEquals(defaultAcademicBoardCover(base, false).includes("kino-media"), true);
  assertEquals(defaultAcademicBoardCover({ ...base, title: "Defesa de Tese - João" }, false).includes("kino-media"), true);
  assertEquals(defaultAcademicBoardCover({ ...base, title: "Exame de qualificação de doutorado" }, false).includes("kino-media"), true);
  // com imagem própria vinculada: NUNCA aplica o padrão
  assertEquals(defaultAcademicBoardCover(base, true), "");
  // título sem defesa/qualificação: nunca aplica
  assertEquals(defaultAcademicBoardCover({ ...base, title: "Semana da Física" }, false), "");
  // outro módulo: nunca aplica
  assertEquals(defaultAcademicBoardCover({ ...base, module: "oportunidades" }, false), "");
});
