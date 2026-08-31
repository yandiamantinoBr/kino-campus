import assert from "node:assert/strict";
import { defaultAcademicBoardCover, mapItemToPost } from "./mapper.ts";
import type { CaduItem } from "./schema.ts";

const board = (title: string): CaduItem => ({ module: "eventos", category: "academicos", title });

Deno.test("academic board default requires an actual defense or qualification board", () => {
  for (const title of [
    "Defesa de Dissertação de Mestrado — Fabriny Aparecida",
    "Convite público para defesa da Dissertação de Mestrado da discente",
    "Defesa de tese: aplicações da matemática",
    "Defesas de dissertações de mestrado",
    "Exame de Qualificação — PPGCOM",
    "Banca de qualificação de doutorado",
    "Qualificação de Mestrado — Ana",
    "Defesa de Memorial Acadêmico — FANUT",
    "Defesa de TCC — Engenharia",
  ]) {
    assert.ok(defaultAcademicBoardCover(board(title), false), title);
  }
});

Deno.test("generic defense and vocational qualification never receive an academic board cover", () => {
  for (const title of [
    "Seminário em defesa dos direitos humanos",
    "Curso de qualificação profissional",
    "Oficina de Defesa Civil",
    "Qualificação de fornecedores e compras públicas",
    "Curso: preparação para defesa de dissertação",
    "Palestra sobre exame de qualificação",
    "Orientações para a defesa de tese",
    "Qualificação profissional para estudantes de mestrado",
    "Oficina de defesa pessoal",
    "Qualificação", "Defesa", "PROSA: Programa de Seminários Acadêmicos",
  ]) {
    assert.equal(defaultAcademicBoardCover(board(title), false), "", title);
  }
});

Deno.test("board fallback respects own linked images, module and separate title boundaries", () => {
  assert.equal(defaultAcademicBoardCover(board("Defesa de tese"), true), "");
  assert.equal(defaultAcademicBoardCover({ ...board("Defesa de tese"), module: "oportunidades" }, false), "");
  assert.equal(defaultAcademicBoardCover({ ...board("Defesa de"), formattedTitle: "Tese sobre arte" }, false), "");
  assert.ok(defaultAcademicBoardCover({ ...board("Convite PPG"), formattedTitle: "Exame de qualificação" }, false));
  const officialImage = "https://files.cercomp.ufg.br/weby/up/1/o/defesa-cartaz.png";
  const mapped = mapItemToPost({ ...board("Defesa de tese"), image: officialImage });
  assert.equal(mapped.row.image_url, officialImage);
});
