import assert from "node:assert/strict";
import { mapItemToPost } from "./mapper.ts";
import { type CaduItem, validateItem } from "./schema.ts";

function item(module: "eventos" | "oportunidades", extra: Partial<CaduItem> = {}): CaduItem {
  return {
    module,
    category: module === "eventos" ? "academicos" : "concursos",
    title: "Processo ou atividade oficial da UFG",
    description: "Informações oficiais de participação. Consulte os requisitos na fonte.",
    sourceUrl: "https://ufg.br/n/203903",
    ...extra,
  };
}

for (const module of ["eventos", "oportunidades"] as const) {
  Deno.test(`cost evidence: ${module} does not invent free access when unspecified`, () => {
    const row = mapItemToPost(item(module)).row;
    assert.equal(row.price, null);
    assert.equal(Object.hasOwn(row.metadata, "gratuito"), false);
  });

  Deno.test(`cost evidence: ${module} preserves an explicitly free activity`, () => {
    const row = mapItemToPost(item(module, { gratuito: true })).row;
    assert.equal(row.price, 0);
    assert.equal(row.metadata.gratuito, true);
  });

  Deno.test(`cost evidence: ${module} preserves explicit paid access and amount`, () => {
    const row = mapItemToPost(item(module, { gratuito: false, price: 100 })).row;
    assert.equal(row.price, 100);
    assert.equal(row.metadata.gratuito, false);
  });

  Deno.test(`cost evidence: ${module} keeps paid access with an unknown amount unknown`, () => {
    const row = mapItemToPost(item(module, { gratuito: false })).row;
    assert.equal(row.price, null);
    assert.equal(row.metadata.gratuito, false);
  });

  Deno.test(`cost evidence: ${module} does not infer cost from salary, fee prose or a negation`, () => {
    for (const description of [
      "Remuneração de R$ 5.521,88. Taxa de inscrição de R$ 100,00.",
      "O evento não é gratuito; consulte os valores oficiais.",
      "Solicitações de isenção serão analisadas; a taxa pode ser paga depois.",
    ]) {
      const row = mapItemToPost(item(module, { description })).row;
      assert.equal(row.price, null);
      assert.equal(Object.hasOwn(row.metadata, "gratuito"), false);
    }
  });

  Deno.test(`cost evidence: ${module} rejects truthy non-boolean flags`, () => {
    for (const gratuito of [null, "false", "true", "", 0, 1, [], {}]) {
      const bad = item(module, { gratuito } as unknown as Partial<CaduItem>);
      assert.equal(validateItem(bad).ok, false);
      assert.throws(() => mapItemToPost(bad), TypeError);
    }
  });
}

Deno.test("cost evidence: remuneration remains separate from participation cost", () => {
  const row = mapItemToPost(item("oportunidades", { remuneracao: "R$ 5.521,88" })).row;
  assert.equal(row.price, 5521.88);
  assert.equal(row.metadata.remuneracao, "R$ 5.521,88");
  assert.equal(Object.hasOwn(row.metadata, "gratuito"), false);
});

Deno.test("cost evidence: salary and explicitly free application can coexist", () => {
  const row = mapItemToPost(item("oportunidades", {
    remuneracao: "R$ 5.521,88", gratuito: true,
  })).row;
  assert.equal(row.price, 5521.88);
  assert.equal(row.metadata.gratuito, true);
});
