import assert from "node:assert/strict";
import { buildTaxonomyEditPatch, mapItemToPost } from "./mapper.ts";
import {
  categoriesForModule,
  categoryLabel,
  normalizeCategoryForModule,
  normalizeSecondaryForModule,
  secondaryLabelForModule,
  secondaryValuesForModule,
  validateItem,
  type CaduItem,
  type ModuleKey,
} from "./schema.ts";

Deno.test("Cadu mapper preserves raw source title, registry lineage and action fingerprints", () => {
  const mapped = mapItemToPost({
    module: "oportunidades",
    category: "editais",
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
    category: "academicos",
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
    category: "bolsas",
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
    category: "cursos-capacitacoes",
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
    category: "cursos",
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

Deno.test("Cadu mapper never completes a partial semantic event role from unrelated text", () => {
  const startOnly = mapItemToPost({
    module: "eventos",
    category: "palestras",
    title: "Palestra com papel semantico parcial",
    description:
      "Inscricoes de 10 a 14 de junho de 2099. A palestra acontece em 20 de junho.",
    dates: {
      semanticDateContractVersion: 0,
      eventStartsAt: "2099-06-20",
      eventEndsAt: null,
    },
    sourceUrl: "https://eventos.ufg.br/e/palestra-semantica",
    sourceId: "eventos:palestra-semantica",
  });
  assert.equal(startOnly.row.metadata.data_evento, "2099-06-20");
  assert.equal(startOnly.row.metadata.data_fim_evento, "");
  assert.equal(startOnly.row.expires_at, "2099-06-21T02:59:59.999Z");

  const explicitClear = mapItemToPost({
    module: "eventos",
    category: "academicos",
    title: "Evento aguardando revisao temporal",
    description: "Agenda secundaria de 10 a 14 de junho de 2099.",
    dates: {
      eventStartsAt: null,
      eventEndsAt: null,
    },
    sourceUrl: "https://eventos.ufg.br/e/revisao-temporal",
    sourceId: "eventos:revisao-temporal",
  });
  assert.equal(explicitClear.row.metadata.data_evento, "");
  assert.equal(explicitClear.row.metadata.data_fim_evento, "");
  assert.equal(explicitClear.row.expires_at, undefined);
});

Deno.test("Cadu mapper normalizes snake-case and top-level semantic date aliases", () => {
  const opportunity = mapItemToPost({
    module: "oportunidades",
    category: "editais",
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

const EXPECTED_CATEGORIES: Record<ModuleKey, Array<[string, string]>> = {
  eventos: [
    ["academicos", "Acad\u00eamicos"],
    ["palestras", "Palestras"],
    ["congressos", "Congressos"],
    ["cursos", "Cursos"],
    ["culturais", "Culturais"],
    ["esportivos", "Esportivos"],
    ["workshops", "Workshops"],
    ["festas", "Festas"],
    ["sustentabilidade", "Sustentabilidade"],
  ],
  oportunidades: [
    ["editais", "Editais"],
    ["concursos", "Concursos"],
    ["bolsas", "Bolsas"],
    ["estagios", "Est\u00e1gio"],
    ["empregos", "Emprego"],
    ["monitoria", "Monitoria"],
    ["pesquisa", "Pesquisa"],
    ["cursos-capacitacoes", "Cursos e capacita\u00e7\u00f5es"],
    ["voluntariado", "Voluntariado"],
    ["freelancer", "Freelancer"],
  ],
  moradia: [
    ["republicas", "Rep\u00fablicas"],
    ["quartos", "Quartos"],
    ["apartamentos", "Apartamentos"],
    ["casas", "Casas"],
    ["procurando", "Procurando"],
  ],
  "compra-venda": [
    ["eletronicos", "Eletr\u00f4nicos"],
    ["livros", "Livros"],
    ["ingressos", "Ingressos"],
    ["moveis", "M\u00f3veis"],
    ["vestuario", "Vestu\u00e1rio"],
    ["outros", "Outros"],
  ],
  caronas: [
    ["ofereco", "Ofere\u00e7o carona"],
    ["procuro", "Procuro carona"],
  ],
  "achados-perdidos": [
    ["perdidos", "Perdidos"],
    ["encontrados", "Encontrados"],
  ],
};

function validItem(module: ModuleKey, category: string): CaduItem {
  const item: CaduItem = {
    module,
    category,
    title: `Publicacao de ${module}`,
    description: "Descricao valida e suficientemente explicita para publicacao.",
  };
  if (module === "moradia") item.regiao = "Setor Universitario";
  if (module === "caronas") {
    item.origem = "Campus Samambaia";
    item.destino = "Praca Universitaria";
  }
  if (module === "achados-perdidos") {
    item.location = "Biblioteca Central";
    if (normalizeCategoryForModule(module, category) === "encontrados") {
      item.entrega = "Retirada na Biblioteca Central";
    }
  }
  if (module === "compra-venda") item.type = "vendo";
  if (module === "achados-perdidos") item.type = "documentos";
  return item;
}

Deno.test("Cadu taxonomy matches every canonical create-post category and label", () => {
  for (const [module, definitions] of Object.entries(EXPECTED_CATEGORIES) as Array<
    [ModuleKey, Array<[string, string]>]
  >) {
    assert.deepEqual(
      categoriesForModule(module),
      definitions.map(([key]) => key),
      `${module}: allowlist divergente`,
    );
    for (const [key, label] of definitions) {
      const item = validItem(module, key);
      assert.equal(normalizeCategoryForModule(module, key), key);
      assert.equal(categoryLabel(key), label);
      assert.equal(validateItem(item).ok, true, `${module}/${key}`);
      const mapped = mapItemToPost(item);
      assert.equal(mapped.row.category, key);
      assert.equal(mapped.row.metadata.categoriaKey, key);
      assert.equal(mapped.row.metadata.categoryKey, key);
      assert.equal(mapped.row.metadata.categoria, label);
      assert.equal(mapped.row.metadata.categoriaLabel, label);
      assert.equal(mapped.row.metadata.categoryLabel, label);
    }
  }
  assert.equal(categoryLabel("categoria-nao-canonica"), "");
  assert.equal(categoryLabel(["academicos"]), "");
});

Deno.test("Cadu taxonomy accepts only explicit module-scoped aliases", () => {
  const aliases: Array<[ModuleKey, string, string]> = [
    ["eventos", "Acad\u00eamico", "academicos"],
    ["oportunidades", "curso-capacitacao", "cursos-capacitacoes"],
    ["moradia", "rep\u00fablica", "republicas"],
    ["compra-venda", "eletr\u00f4nico", "eletronicos"],
    ["caronas", "ofereco-carona", "ofereco"],
    ["achados-perdidos", "achados", "encontrados"],
  ];
  for (const [module, alias, canonical] of aliases) {
    assert.equal(normalizeCategoryForModule(module, alias), canonical);
    assert.equal(validateItem(validItem(module, alias)).ok, true);
  }

  assert.equal(normalizeCategoryForModule("eventos", "monitoria"), "");
  assert.equal(normalizeCategoryForModule("oportunidades", "academicos"), "");
  assert.equal(normalizeCategoryForModule("achados-perdidos", "outros"), "");
  assert.equal(normalizeCategoryForModule("eventos", ["academicos"]), "");
  assert.equal(normalizeCategoryForModule("eventos", { key: "academicos" }), "");
});

Deno.test("validateItem rejects missing, unknown and cross-module categories", () => {
  const missing = validItem("eventos", "academicos");
  delete missing.category;
  const missingResult = validateItem(missing);
  assert.equal(missingResult.ok, false);
  assert.match(missingResult.errors.join(" "), /category.*obrigatoria/i);

  const malformed = validItem("eventos", "academicos");
  malformed.category = ["academicos"] as unknown as string;
  assert.equal(validateItem(malformed).ok, false);

  for (const [module, category] of [
    ["eventos", "monitoria"],
    ["oportunidades", "academicos"],
    ["moradia", "eletronicos"],
    ["compra-venda", "republicas"],
    ["caronas", "perdidos"],
    ["achados-perdidos", "ofereco"],
  ] as Array<[ModuleKey, string]>) {
    const result = validateItem(validItem(module, category));
    assert.equal(result.ok, false, `${module}/${category}`);
    assert.match(result.errors.join(" "), /category invalida/i);
  }
});

Deno.test("Cadu mapper fails closed when category is absent or incompatible", () => {
  const missing = validItem("eventos", "academicos");
  delete missing.category;
  assert.throws(() => mapItemToPost(missing), /category invalida ou ausente/i);
  assert.throws(
    () => mapItemToPost(validItem("oportunidades", "academicos")),
    /category invalida ou ausente/i,
  );
});

Deno.test("Cadu publish payload canonicalizes aliases and keeps taxonomy metadata coherent", () => {
  const item = {
    ...validItem("oportunidades", "curso-capacitacao"),
    sourceUrl: "https://ufg.br/n/curso-capacitacao",
    sourceId: "ufg:curso-capacitacao",
  };
  assert.equal(validateItem(item).ok, true);

  const mapped = mapItemToPost(item);
  assert.equal(mapped.row.category, "cursos-capacitacoes");
  assert.equal(mapped.row.metadata.categoriaKey, "cursos-capacitacoes");
  assert.equal(mapped.row.metadata.categoryKey, "cursos-capacitacoes");
  assert.equal(mapped.row.metadata.categoria, "Cursos e capacita\u00e7\u00f5es");
  assert.equal(mapped.row.metadata.categoriaLabel, "Cursos e capacita\u00e7\u00f5es");
  assert.equal(mapped.row.metadata.categoryLabel, "Cursos e capacita\u00e7\u00f5es");
  assert.notEqual(mapped.row.category, "monitoria");
});

Deno.test("secondary groups are module-scoped, required and fail closed", () => {
  assert.equal(normalizeSecondaryForModule("compra-venda", "Vendo"), "vendo");
  assert.equal(normalizeSecondaryForModule("achados-perdidos", "documento"), "documentos");
  assert.equal(secondaryLabelForModule("achados-perdidos", "eletronico"), "Eletr\u00f4nicos");
  assert.equal(normalizeSecondaryForModule("compra-venda", "documentos"), "");
  assert.equal(normalizeSecondaryForModule("achados-perdidos", "vendo"), "");

  for (const module of ["compra-venda", "achados-perdidos"] as ModuleKey[]) {
    const missing = validItem(module, module === "compra-venda" ? "livros" : "perdidos");
    delete missing.type;
    assert.equal(validateItem(missing).ok, false, `${module}: ausencia deve falhar`);
    assert.match(validateItem(missing).errors.join(" "), /grupo secundario obrigatorio/i);
    assert.throws(() => mapItemToPost(missing), /grupo secundario invalido ou ausente/i);
  }

  const removedCompraAction = validItem("compra-venda", "livros");
  removedCompraAction.type = "troco";
  assert.equal(validateItem(removedCompraAction).ok, false);
  assert.throws(() => mapItemToPost(removedCompraAction), /grupo secundario invalido/i);

  const crossModuleType = validItem("achados-perdidos", "encontrados");
  crossModuleType.type = "vendo";
  assert.equal(validateItem(crossModuleType).ok, false);

  const invalidCompraAlias = validItem("compra-venda", "livros");
  invalidCompraAlias.subcategoriaKey = "livros";
  invalidCompraAlias.type = "compro";
  assert.equal(validateItem(invalidCompraAlias).ok, false);
  assert.match(validateItem(invalidCompraAlias).errors.join(" "), /item\.subcategoriaKey/i);
  assert.throws(() => mapItemToPost(invalidCompraAlias), /item\.subcategoriaKey/i);
});

Deno.test("publish secondary aliases are authoritative, equivalent or fail closed", () => {
  const cases = [
    {
      module: "compra-venda" as ModuleKey,
      category: "livros",
      expected: "compro",
      aliases: [
        ["acao", "compro"],
        ["action", "Compro"],
        ["subcategoriaKey", "compro"],
        ["subcategoria", "Compro"],
        ["type", "compro"],
        ["actionKey", "compro"],
      ],
    },
    {
      module: "achados-perdidos" as ModuleKey,
      category: "perdidos",
      expected: "eletronicos",
      aliases: [
        ["subcategoriaKey", "eletronicos"],
        ["subcategoryKey", "eletronicos"],
        ["subcategoria", "Eletr\u00f4nicos"],
        ["subcategory", "Eletr\u00f4nicos"],
        ["type", "eletronicos"],
      ],
    },
  ] as const;
  const secondaryAliases = [
    "acao",
    "action",
    "subcategoriaKey",
    "subcategoryKey",
    "subcategoria",
    "subcategory",
    "type",
    "actionKey",
  ];

  for (const sample of cases) {
    for (const [alias, value] of sample.aliases) {
      const item = validItem(sample.module, sample.category) as CaduItem & Record<string, unknown>;
      for (const key of secondaryAliases) delete item[key];
      item[alias] = value;
      assert.equal(validateItem(item).ok, true, `${sample.module}/${alias}`);
      assert.equal(
        mapItemToPost(item).row.metadata.subcategoriaKey,
        sample.expected,
        `${sample.module}/${alias}`,
      );
    }
  }

  const equivalent = validItem("compra-venda", "livros");
  equivalent.type = "compro";
  equivalent.actionKey = "Compro";
  assert.equal(validateItem(equivalent).ok, true);
  assert.equal(mapItemToPost(equivalent).row.metadata.subcategoriaKey, "compro");

  for (const item of [
    { ...validItem("compra-venda", "livros"), acao: "vendo", type: "compro" },
    { ...validItem("compra-venda", "livros"), acao: "troco", type: "compro" },
    {
      ...validItem("achados-perdidos", "perdidos"),
      subcategoriaKey: "documentos",
      type: "eletronicos",
    },
    {
      ...validItem("achados-perdidos", "perdidos"),
      subcategoriaKey: "roupas",
      type: "documentos",
    },
  ]) {
    const result = validateItem(item);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /grupo secundario (?:conflitante|invalido)/i);
    assert.throws(
      () => mapItemToPost(item),
      /grupo secundario (?:conflitante|invalido)/i,
    );
  }
});

Deno.test("publish matrix persists canonical category and independent secondary groups", () => {
  const cases: Array<{
    item: CaduItem;
    categoryKey: string;
    categoryLabel: string;
    subcategory: string;
    subcategoriaKey: string;
  }> = [
    {
      item: validItem("eventos", "palestras"),
      categoryKey: "palestras",
      categoryLabel: "Palestras",
      subcategory: "",
      subcategoriaKey: "",
    },
    {
      item: { ...validItem("oportunidades", "estagios"), area: "Tecnologia" },
      categoryKey: "estagios",
      categoryLabel: "Est\u00e1gio",
      subcategory: "tecnologia",
      subcategoriaKey: "tecnologia",
    },
    {
      item: validItem("moradia", "quartos"),
      categoryKey: "quartos",
      categoryLabel: "Quartos",
      subcategory: "",
      subcategoriaKey: "",
    },
    {
      item: { ...validItem("compra-venda", "livros"), type: "compro" },
      categoryKey: "livros",
      categoryLabel: "Livros",
      subcategory: "livros",
      subcategoriaKey: "compro",
    },
    {
      item: validItem("caronas", "ofereco"),
      categoryKey: "ofereco",
      categoryLabel: "Ofere\u00e7o carona",
      subcategory: "",
      subcategoriaKey: "",
    },
    {
      item: { ...validItem("achados-perdidos", "encontrados"), type: "eletronicos" },
      categoryKey: "encontrados",
      categoryLabel: "Encontrados",
      subcategory: "eletronicos",
      subcategoriaKey: "eletronicos",
    },
  ];

  for (const expected of cases) {
    const mapped = mapItemToPost(expected.item);
    const metadata = mapped.row.metadata;
    assert.equal(mapped.row.category, expected.categoryKey);
    assert.equal(metadata.categoryKey, expected.categoryKey);
    assert.equal(metadata.subcategory, expected.subcategory);
    assert.equal(metadata.subcategoriaKey, expected.subcategoriaKey);
    const tags = metadata.tags as string[];
    const tagKeys = metadata.tagKeys as string[];
    assert.equal(tags.length, tagKeys.length, `${expected.item.module}: pares tag/key`);
    const categoryIndex = tagKeys.indexOf(expected.categoryKey);
    assert.notEqual(categoryIndex, -1, `${expected.item.module}: chave canonica da categoria`);
    assert.equal(tags[categoryIndex], expected.categoryLabel);
  }

  const compra = mapItemToPost(cases[3].item).row.metadata;
  assert.equal(compra.subcategoryLabel, "Livros");
  assert.equal(compra.subcategoria, "Compro");
  assert.equal(compra.actionKey, "compro");
  assert.equal(compra.actionLabel, "Compro");
  assert.equal(compra.link_as_cta, false);
  assert.ok((compra.tagKeys as string[]).includes("compro"));

  const achados = mapItemToPost(cases[5].item).row.metadata;
  assert.equal(achados.subcategoryLabel, "Eletr\u00f4nicos");
  assert.equal(achados.subcategoria, "Eletr\u00f4nicos");
  assert.ok((achados.tagKeys as string[]).includes("eletronicos"));

  const moradia = mapItemToPost(cases[2].item).row.metadata;
  assert.equal(moradia.housingTypeKey, "quartos");
  assert.equal(moradia.housingTypeLabel, "Quartos");
});

Deno.test("publish and edit cover every required secondary combination", () => {
  for (const module of ["compra-venda", "achados-perdidos"] as ModuleKey[]) {
    const categories = [...categoriesForModule(module)];
    for (const category of categories) {
      for (const secondary of secondaryValuesForModule(module)) {
        const item = validItem(module, category);
        item.type = secondary;
        const mapped = mapItemToPost(item);
        const metadata = mapped.row.metadata;
        assert.equal(validateItem(item).ok, true, `${module}/${category}/${secondary}`);
        assert.equal(metadata.subcategoriaKey, secondary);
        assert.ok((metadata.tagKeys as string[]).includes(category));
        assert.ok((metadata.tagKeys as string[]).includes(secondary));

        const nextCategory = categories[(categories.indexOf(category) + 1) % categories.length];
        const edited = buildTaxonomyEditPatch(
          module,
          category,
          nextCategory,
          metadata,
        );
        assert.equal(edited.categoryKey, nextCategory);
        assert.equal(edited.metadata.subcategoriaKey, secondary);
        assert.ok((edited.metadata.tagKeys as string[]).includes(nextCategory));
        assert.ok((edited.metadata.tagKeys as string[]).includes(secondary));
        if (nextCategory !== category) {
          assert.ok(!(edited.metadata.tagKeys as string[]).includes(category));
        }
      }
    }
  }
});

Deno.test("secondary aliases in edit are authoritative and remove stale semantic tags", () => {
  const cases = [
    {
      module: "compra-venda" as ModuleKey,
      category: "livros",
      before: "vendo",
      after: "compro",
      aliases: [
        ["subcategoriaKey", "compro"],
        ["subcategoria", "Compro"],
        ["actionKey", "compro"],
        ["actionLabel", "Compro"],
      ],
    },
    {
      module: "achados-perdidos" as ModuleKey,
      category: "perdidos",
      before: "documentos",
      after: "eletronicos",
      aliases: [
        ["subcategoriaKey", "eletronicos"],
        ["subcategoria", "Eletr\u00f4nicos"],
        ["subcategoryKey", "eletronicos"],
        ["subcategory", "Eletr\u00f4nicos"],
      ],
    },
  ] as const;

  for (const sample of cases) {
    const item = validItem(sample.module, sample.category);
    item.type = sample.before;
    const current = mapItemToPost(item).row.metadata;
    for (const [alias, value] of sample.aliases) {
      const edited = buildTaxonomyEditPatch(
        sample.module,
        sample.category,
        sample.category,
        current,
        { [alias]: value },
      ).metadata;
      const tags = edited.tags as string[];
      const tagKeys = edited.tagKeys as string[];
      assert.equal(edited.subcategoriaKey, sample.after, `${sample.module}/${alias}`);
      assert.ok(tagKeys.includes(sample.after), `${sample.module}/${alias}: secundario novo`);
      assert.ok(!tagKeys.includes(sample.before), `${sample.module}/${alias}: secundario antigo`);
      assert.ok(tagKeys.includes("ufg"), `${sample.module}/${alias}: tag independente`);
      assert.equal(tags.length, tagKeys.length, `${sample.module}/${alias}: pares`);
      const secondaryIndex = tagKeys.indexOf(sample.after);
      assert.equal(
        tags[secondaryIndex],
        secondaryLabelForModule(sample.module, sample.after),
        `${sample.module}/${alias}: label canonico`,
      );
      if (sample.module === "compra-venda") {
        assert.equal(edited.actionKey, sample.after);
        assert.equal(edited.actionLabel, "Compro");
      } else {
        assert.equal(edited.subcategory, sample.after);
        assert.equal(edited.subcategoryLabel, "Eletr\u00f4nicos");
      }
    }
  }
});

Deno.test("secondary edit rejects conflicting aliases but accepts equivalent aliases", () => {
  const compra = mapItemToPost({ ...validItem("compra-venda", "livros"), type: "vendo" }).row.metadata;
  assert.throws(
    () =>
      buildTaxonomyEditPatch(
        "compra-venda",
        "livros",
        "livros",
        compra,
        { subcategoriaKey: "compro", actionKey: "vendo" },
      ),
    /grupo secundario conflitante/i,
  );

  const achados = mapItemToPost({
    ...validItem("achados-perdidos", "perdidos"),
    type: "documentos",
  }).row.metadata;
  assert.throws(
    () =>
      buildTaxonomyEditPatch(
        "achados-perdidos",
        "perdidos",
        "perdidos",
        achados,
        { subcategoriaKey: "eletronicos", subcategory: "Documentos" },
      ),
    /grupo secundario conflitante/i,
  );

  const equivalent = buildTaxonomyEditPatch(
    "compra-venda",
    "livros",
    "livros",
    compra,
    { subcategoriaKey: "compro", actionLabel: "Compro" },
  ).metadata;
  assert.equal(equivalent.subcategoriaKey, "compro");
  assert.deepEqual(equivalent.tagKeys, ["livros", "compro", "ufg"]);
});

Deno.test("canonical tag keys never regress to singular or label-derived slugs", () => {
  for (const [module, category, forbidden] of [
    ["oportunidades", "estagios", "estagio"],
    ["oportunidades", "empregos", "emprego"],
    ["oportunidades", "cursos-capacitacoes", "cursos-e-capacitacoes"],
    ["caronas", "ofereco", "ofereco-carona"],
    ["caronas", "procuro", "procuro-carona"],
  ] as Array<[ModuleKey, string, string]>) {
    const metadata = mapItemToPost(validItem(module, category)).row.metadata;
    assert.ok((metadata.tagKeys as string[]).includes(category), `${module}/${category}`);
    assert.ok(!(metadata.tagKeys as string[]).includes(forbidden), `${module}/${forbidden}`);
  }
});

Deno.test("publish scrubs stale module taxonomy tags and preserves independent pairs", () => {
  const cases: Array<{ item: CaduItem; expected: string[]; forbidden: string[] }> = [
    {
      item: {
        ...validItem("eventos", "palestras"),
        sourceName: "Faculdade de Letras",
        tags: ["Acad\u00eamicos", "Campus Samambaia"],
        tagKeys: ["academicos", "campus-samambaia"],
      },
      expected: ["palestras", "faculdade-de-letras", "campus-samambaia"],
      forbidden: ["academicos"],
    },
    {
      item: {
        ...validItem("oportunidades", "empregos"),
        area: "Tecnologia",
        tags: ["Est\u00e1gio", "Tecnologia"],
        tagKeys: ["estagios", "tecnologia"],
      },
      expected: ["empregos", "tecnologia"],
      forbidden: ["estagios"],
    },
    {
      item: {
        ...validItem("moradia", "casas"),
        tags: ["Quartos", "Setor Universit\u00e1rio"],
        tagKeys: ["quartos", "setor-universitario"],
      },
      expected: ["casas", "setor-universitario"],
      forbidden: ["quartos"],
    },
    {
      item: {
        ...validItem("compra-venda", "livros"),
        type: "vendo",
        tags: ["Eletr\u00f4nicos", "Compro", "Biblioteca Central"],
        tagKeys: ["eletronicos", "compro", "biblioteca-central"],
      },
      expected: ["livros", "vendo", "biblioteca-central"],
      forbidden: ["eletronicos", "compro"],
    },
    {
      item: {
        ...validItem("caronas", "procuro"),
        tags: ["Ofere\u00e7o carona", "Campus Colemar"],
        tagKeys: ["ofereco", "campus-colemar"],
      },
      expected: ["procuro", "campus-colemar"],
      forbidden: ["ofereco"],
    },
    {
      item: {
        ...validItem("achados-perdidos", "perdidos"),
        type: "documentos",
        tags: ["Encontrados", "Eletr\u00f4nicos", "Biblioteca Central"],
        tagKeys: ["encontrados", "eletronicos", "biblioteca-central"],
      },
      expected: ["perdidos", "documentos", "biblioteca-central"],
      forbidden: ["encontrados", "eletronicos"],
    },
  ];

  for (const sample of cases) {
    const mapped = mapItemToPost(sample.item);
    const tags = mapped.row.metadata.tags as string[];
    const tagKeys = mapped.row.metadata.tagKeys as string[];
    assert.equal(tags.length, tagKeys.length, `${sample.item.module}: pares`);
    for (const key of sample.expected) {
      assert.ok(tagKeys.includes(key), `${sample.item.module}: preserva ${key}`);
    }
    for (const key of sample.forbidden) {
      assert.ok(!tagKeys.includes(key), `${sample.item.module}: remove ${key}`);
    }
  }
});

Deno.test("publish scrubs taxonomic source names and reconstructs independent half-pairs", () => {
  for (const [tagKey, tagLabel] of [
    ["biblioteca-central", "Eletr\u00f4nicos"],
    ["eletronicos", "Biblioteca Central"],
  ]) {
    const mapped = mapItemToPost({
      ...validItem("compra-venda", "livros"),
      type: "vendo",
      sourceName: "Compro",
      tags: [tagLabel],
      tagKeys: [tagKey],
    });
    const tags = mapped.row.metadata.tags as string[];
    const tagKeys = mapped.row.metadata.tagKeys as string[];
    assert.equal(tags.length, tagKeys.length);
    assert.ok(tagKeys.includes("livros"));
    assert.ok(tagKeys.includes("vendo"));
    assert.ok(tagKeys.includes("biblioteca-central"));
    assert.equal(
      tags[tagKeys.indexOf("biblioteca-central")],
      tagKey === "biblioteca-central" ? "biblioteca-central" : "Biblioteca Central",
    );
    assert.ok(!tagKeys.includes("eletronicos"));
    assert.ok(!tagKeys.includes("compro"));
  }
});

Deno.test("required delivery follows achados category, not its secondary type", () => {
  const found = validItem("achados-perdidos", "encontrados");
  found.type = "documentos";
  delete found.entrega;
  const foundValidation = validateItem(found);
  assert.equal(foundValidation.ok, false);
  assert.match(foundValidation.errors.join(" "), /entrega.*obrigatoria/i);

  const lost = validItem("achados-perdidos", "perdidos");
  lost.type = "documentos";
  assert.doesNotMatch(validateItem(lost).errors.join(" "), /entrega/i);
});

Deno.test("edit matrix reconciles category aliases while preserving independent groups", () => {
  const cases = [
    {
      module: "eventos",
      previous: "academicos",
      next: "palestras",
      metadata: {
        subcategory: "academicos",
        subcategoryLabel: "Acad\u00eamicos",
        subcategoria: "Acad\u00eamicos",
        subcategoriaKey: "academicos",
        tags: ["Acad\u00eamicos", "UFG"],
        tagKeys: ["academicos", "ufg"],
      },
    },
    {
      module: "oportunidades",
      previous: "estagios",
      next: "empregos",
      metadata: {
        subcategory: "tecnologia",
        subcategoryLabel: "Tecnologia",
        subcategoria: "Tecnologia",
        subcategoriaKey: "tecnologia",
        area: "Tecnologia",
        areaKey: "tecnologia",
        tags: ["Est\u00e1gio", "Tecnologia"],
        tagKeys: ["estagios", "tecnologia"],
      },
    },
    {
      module: "moradia",
      previous: "quartos",
      next: "casas",
      metadata: {
        subcategory: "quartos",
        subcategoriaKey: "quartos",
        housingTypeKey: "quartos",
        housingTypeLabel: "Quartos",
        tags: ["Quartos", "Setor Universit\u00e1rio"],
        tagKeys: ["quartos", "setor-universitario"],
      },
    },
    {
      module: "compra-venda",
      previous: "eletronicos",
      next: "livros",
      metadata: {
        subcategory: "eletronicos",
        subcategoryLabel: "Eletr\u00f4nicos",
        subcategoria: "Vendo",
        subcategoriaKey: "vendo",
        actionKey: "vendo",
        actionLabel: "Vendo",
        tags: ["Eletr\u00f4nicos", "Vendo", "Outros", "UFG"],
        tagKeys: ["eletronicos", "vendo", "outros", "ufg"],
      },
    },
    {
      module: "caronas",
      previous: "ofereco",
      next: "procuro",
      metadata: {
        subcategory: "ofereco",
        subcategoriaKey: "ofereco",
        tags: ["Ofere\u00e7o carona", "Campus Samambaia"],
        tagKeys: ["ofereco", "campus-samambaia"],
      },
    },
    {
      module: "achados-perdidos",
      previous: "perdidos",
      next: "encontrados",
      metadata: {
        subcategory: "documentos",
        subcategoryLabel: "Documentos",
        subcategoria: "Documentos",
        subcategoriaKey: "documentos",
        tags: ["Perdidos", "Documentos", "Biblioteca Central"],
        tagKeys: ["perdidos", "documentos", "biblioteca-central"],
      },
    },
  ] as const;

  for (const sample of cases) {
    const patch = buildTaxonomyEditPatch(
      sample.module,
      sample.previous,
      sample.next,
      sample.metadata,
    );
    assert.equal(patch.categoryKey, sample.next);
    assert.equal(patch.metadata.categoryKey, sample.next);
    assert.ok((patch.metadata.tagKeys as string[]).includes(sample.next));
    assert.ok(!(patch.metadata.tagKeys as string[]).includes(sample.previous));
    assert.equal(
      (patch.metadata.tags as string[]).length,
      (patch.metadata.tagKeys as string[]).length,
    );
  }

  const opportunity = buildTaxonomyEditPatch(
    "oportunidades",
    "estagios",
    "empregos",
    cases[1].metadata,
  ).metadata;
  assert.equal(opportunity.subcategory, "tecnologia");
  assert.equal(opportunity.subcategoriaKey, "tecnologia");
  assert.ok((opportunity.tagKeys as string[]).includes("tecnologia"));

  const compra = buildTaxonomyEditPatch(
    "compra-venda",
    "eletronicos",
    "livros",
    cases[3].metadata,
  ).metadata;
  assert.equal(compra.subcategory, "livros");
  assert.equal(compra.subcategoriaKey, "vendo");
  assert.equal(compra.actionKey, "vendo");
  assert.ok((compra.tagKeys as string[]).includes("vendo"));
  assert.ok(!(compra.tagKeys as string[]).includes("outros"));

  const achados = buildTaxonomyEditPatch(
    "achados-perdidos",
    "perdidos",
    "encontrados",
    cases[5].metadata,
  ).metadata;
  assert.equal(achados.subcategory, "documentos");
  assert.equal(achados.subcategoriaKey, "documentos");

  const moradia = buildTaxonomyEditPatch(
    "moradia",
    "quartos",
    "casas",
    cases[2].metadata,
  ).metadata;
  assert.equal(moradia.subcategory, "");
  assert.equal(moradia.subcategoriaKey, "");
  assert.equal(moradia.housingTypeKey, "casas");
  assert.equal(moradia.housingTypeLabel, "Casas");
});

Deno.test("edit reconstructs independent half-pairs without reviving stale taxonomy", () => {
  for (const [tagKey, tagLabel] of [
    ["biblioteca-central", "Eletr\u00f4nicos"],
    ["eletronicos", "Biblioteca Central"],
  ]) {
    const metadata = buildTaxonomyEditPatch(
      "compra-venda",
      "eletronicos",
      "livros",
      {
        subcategoriaKey: "vendo",
        tags: [tagLabel, "Compro"],
        tagKeys: [tagKey, "compro"],
      },
    ).metadata;
    const tags = metadata.tags as string[];
    const tagKeys = metadata.tagKeys as string[];
    assert.equal(tags.length, tagKeys.length);
    assert.ok(tagKeys.includes("livros"));
    assert.ok(tagKeys.includes("vendo"));
    assert.ok(tagKeys.includes("biblioteca-central"));
    assert.equal(
      tags[tagKeys.indexOf("biblioteca-central")],
      tagKey === "biblioteca-central" ? "biblioteca-central" : "Biblioteca Central",
    );
    assert.ok(!tagKeys.includes("eletronicos"));
    assert.ok(!tagKeys.includes("compro"));
  }
});

Deno.test("edit reconciliation rejects missing or malformed independent secondary groups", () => {
  assert.throws(
    () => buildTaxonomyEditPatch("compra-venda", "livros", "outros", {}, null),
    /grupo secundario invalido ou ausente/i,
  );
  assert.throws(
    () =>
      buildTaxonomyEditPatch(
        "achados-perdidos",
        "perdidos",
        "encontrados",
        { subcategoriaKey: "documentos" },
        { subcategoriaKey: "vendo" },
      ),
    /metadata\.subcategoriaKey/i,
  );
});

Deno.test("compra-venda edit validates every explicit primary metadata alias", () => {
  const current = {
    subcategory: "eletronicos",
    subcategoryKey: "eletronicos",
    subcategoryLabel: "Eletr\u00f4nicos",
    subcategoriaKey: "vendo",
    actionKey: "vendo",
  };
  const equivalent = buildTaxonomyEditPatch(
    "compra-venda",
    "eletronicos",
    "livros",
    current,
    {
      categoryKey: "livro",
      categoryLabel: "Livros",
      categoriaKey: "livro",
      categoriaLabel: "Livros",
      categoria: "Livros",
      subcategoryKey: "livro",
      subcategoryLabel: "Livros",
      subcategory: "Livros",
    },
  ).metadata;
  assert.equal(equivalent.categoryKey, "livros");
  assert.equal(equivalent.subcategory, "livros");
  assert.equal(equivalent.subcategoryKey, "livros");
  assert.equal(equivalent.subcategoryLabel, "Livros");

  for (const alias of [
    "categoryKey",
    "categoryLabel",
    "categoriaKey",
    "categoriaLabel",
    "categoria",
    "subcategoryKey",
    "subcategoryLabel",
    "subcategory",
  ]) {
    assert.throws(
      () =>
        buildTaxonomyEditPatch(
          "compra-venda",
          "eletronicos",
          "livros",
          current,
          { [alias]: "eletronicos" },
        ),
      new RegExp(`category conflitante em metadata\\.${alias}`, "i"),
    );
    assert.throws(
      () =>
        buildTaxonomyEditPatch(
          "compra-venda",
          "eletronicos",
          "livros",
          current,
          { [alias]: "monitoria" },
        ),
      new RegExp(`category alias invalido em metadata\\.${alias}`, "i"),
    );
  }
});

Deno.test({
  name: "handleEdit canonicalizes equivalent primary aliases and rejects drift before UPDATE",
  fn: async () => {
    const { handleEdit } = await import("./index.ts");
    const updates: Array<Record<string, unknown>> = [];
    let selectCount = 0;
    const current = {
      id: "post-1",
      author_id: "cadu-user",
      module: "compra-venda",
      category: "eletronicos",
      status: "published",
      image_url: "",
      metadata: {
        subcategory: "eletronicos",
        subcategoryLabel: "Eletr\u00f4nicos",
        subcategoria: "Vendo",
        subcategoriaKey: "vendo",
        actionKey: "vendo",
        actionLabel: "Vendo",
        tags: ["Eletr\u00f4nicos", "Vendo", "UFG"],
        tagKeys: ["eletronicos", "vendo", "ufg"],
      },
    };
    const admin = {
      from(table: string) {
        if (table === "audit_log") {
          return { insert: () => Promise.resolve({ error: null }) };
        }
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => {
                    selectCount += 1;
                    return selectCount === 1
                      ? { data: current, error: null }
                      : { data: { ...current, ...updates.at(-1) }, error: null };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    };

    const response = await handleEdit(admin as never, "cadu-user", {
      postId: "post-1",
      fields: { category: "livro" },
      metadata: {
        categoryLabel: "Livros",
        subcategoryKey: "livro",
        subcategoryLabel: "Livros",
        actionKey: "compro",
      },
    });
    assert.equal(response.status, 200);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].category, "livros");
    const metadata = updates[0].metadata as Record<string, unknown>;
    assert.equal(metadata.subcategory, "livros");
    assert.equal(metadata.subcategoryKey, "livros");
    assert.equal(metadata.subcategoryLabel, "Livros");
    assert.equal(metadata.subcategoriaKey, "compro");
    assert.equal(metadata.actionKey, "compro");
    assert.ok((metadata.tagKeys as string[]).includes("livros"));
    assert.ok(!(metadata.tagKeys as string[]).includes("eletronicos"));
    assert.ok((metadata.tagKeys as string[]).includes("compro"));
    assert.ok(!(metadata.tagKeys as string[]).includes("vendo"));

    const conflict = await handleEdit(admin as never, "cadu-user", {
      postId: "post-1",
      metadata: { subcategoriaKey: "compro", actionKey: "vendo" },
    });
    assert.equal(conflict.status, 422);
    assert.equal(updates.length, 1);
    const conflictBody = await conflict.json() as Record<string, unknown>;
    assert.equal(conflictBody.code, "VALIDATION_FAILED");
    assert.match(String(conflictBody.message), /grupo secundario conflitante/i);

    const isolatedInvalid = await handleEdit(admin as never, "cadu-user", {
      postId: "post-1",
      metadata: { actionKey: "troco" },
    });
    assert.equal(isolatedInvalid.status, 422);
    assert.equal(updates.length, 1);
    const isolatedInvalidBody = await isolatedInvalid.json() as Record<string, unknown>;
    assert.equal(isolatedInvalidBody.code, "VALIDATION_FAILED");
    assert.match(
      String(isolatedInvalidBody.message),
      /grupo secundario invalido.*metadata\.actionKey/i,
    );

    for (const [subcategoryKey, expected] of [
      ["eletronicos", /category conflitante/i],
      ["monitoria", /category alias invalido/i],
    ] as const) {
      const rejected = await handleEdit(admin as never, "cadu-user", {
        postId: "post-1",
        fields: { category: "livros" },
        metadata: { subcategoryKey },
      });
      assert.equal(rejected.status, 422);
      assert.equal(updates.length, 1);
      const rejectedBody = await rejected.json() as Record<string, unknown>;
      assert.equal(rejectedBody.code, "VALIDATION_FAILED");
      assert.match(String(rejectedBody.message), expected);
    }
  },
});

Deno.test("handlePublish returns 422 for secondary alias drift and accepts equivalent aliases", async () => {
  const { handlePublish } = await import("./index.ts");
  const description =
    "Livro de calculo em bom estado, com todas as paginas preservadas e sem anotacoes importantes. " +
    "Consulte os detalhes, requisitos de retirada, local e documentos na fonte oficial: " +
    "https://ufg.br/comunidade/livro-calculo. Entre em contato para comprar.";
  const base = {
    module: "compra-venda",
    category: "livros",
    type: "vendo",
    title: "Livro de calculo a venda",
    description,
  };

  for (const item of [
    { ...base, actionKey: "compro" },
    { ...base, acao: "troco" },
  ]) {
    const response = await handlePublish({} as never, "cadu-user", {
      item,
      options: { dryRun: true },
    });
    assert.equal(response.status, 422);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.code, "VALIDATION_FAILED");
    assert.match(String(body.message), /grupo secundario (?:conflitante|invalido)/i);
  }

  const accepted = await handlePublish({} as never, "cadu-user", {
    item: { ...base, actionKey: "Vendo" },
    options: { dryRun: true },
  });
  assert.equal(accepted.status, 200);
  const acceptedBody = await accepted.json() as Record<string, unknown>;
  assert.equal(acceptedBody.code, "DRY_RUN");
  const row = acceptedBody.row as Record<string, unknown>;
  const metadata = row.metadata as Record<string, unknown>;
  assert.equal(metadata.subcategoriaKey, "vendo");
});
