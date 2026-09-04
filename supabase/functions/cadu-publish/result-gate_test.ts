import { hasResultAnnouncementTitleSignal } from "./index.ts";

function assertEquals(actual: unknown, expected: unknown, message = ""): void {
  const same = Object.is(actual, expected);
  if (!same) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)} ${message}`);
  }
}

Deno.test("titulos de resultado/homologacao sao bloqueados como updates", () => {
  const resultados = [
    "ENQ 2026-2: lista de habilitados e prazo final para revisão de nota",
    "Resultado final do Processo Seletivo 2026",
    "Resultado Preliminar — Edital 12/2026",
    "Homologação do resultado final do concurso",
    "Divulgação do resultado da monitoria",
    "Retificação de resultado: Edital PROEF",
    "UFG publica lista de aprovados no vestibular",
  ];
  for (const title of resultados) {
    assertEquals(hasResultAnnouncementTitleSignal(title), true, title);
  }

  // Oportunidades e eventos legítimos continuam passando pelo sinal.
  const legitimos = [
    "VII ENGOPE – Encontro Goiano de Probabilidade e Estatística recebe inscrições",
    "Edital Unificado de Bolsas 2026/2 abre inscrições",
    "Semana de Inovação 2026 da Enap abre inscrições",
    "Curso de Matemática Básica em Perspectiva do IME/UFG",
  ];
  for (const title of legitimos) {
    assertEquals(hasResultAnnouncementTitleSignal(title), false, title);
  }
});
