# V76.37 — Semântica temporal/status e benchmark shadow

**Data:** 2026-06-20

**Escopo:** pipeline offline e corpus totalmente sintético

**Decisão de runtime:** No-Go; nenhum novo asset é carregado por HTML

## Resultado

`KCSearchShadowPipeline` 1.1 passou a aplicar as intenções canônicas já coletadas
pelos grupos de criação: compra/venda, procura/oferta de carona, perdido/encontrado,
tipo de oportunidade e tópico de evento. O modo `results` preserva encerrados por
padrão, como a página de resultados; o modo `dropdown` os oculta, como o dropdown.
Ambos excluem estados não públicos.

Em moradia, “procuro quarto” é tratado como necessidade de quem pesquisa e mantém o
tipo `quartos` como filtro; não é confundido com um anúncio da categoria
`procurando`. Essa exceção evita uma interseção impossível entre dois valores do
mesmo grupo de criação.

Datas inicial/final de eventos agora resolvem dia da semana, dia do mês e intervalos.
Horas de evento/carona resolvem hora exata e período noturno. A referência de data é
injetável para testes determinísticos e não aparece na saída de diagnóstico.

## Lacunas tratadas sem inferência

- caronas não coletam data; `amanhã`/`sexta` ficam em `deferredFilters`;
- o sistema não coleta status canônico de inscrição; `inscrições abertas` permanece
  diferido;
- data de publicação não é usada como substituta da data da carona ou do evento;
- filtros diferidos não eliminam silenciosamente resultados válidos.

## Benchmark sintético

Comando: `npm run benchmark:search-shadow`.

O fixture `tests/fixtures/search-shadow-benchmark.v1.json` contém 12 casos, dois por
módulo. Não contém consultas reais, identidade, contato, link ou perfil.

| Métrica | Resultado local |
|---|---:|
| Casos aprovados | 12/12 |
| Recall | 100% |
| Precisão | 100% |
| Falsos positivos | 0 |
| Estabilidade entre execuções | 100% |
| pior p95 observado em duas rodadas | 20,593 ms |
| Teto de regressão automatizado | 500 ms |

Latência é evidência local sobre corpus pequeno, não SLA de produção. O valor deve
ser acompanhado por tendência; o gate funcional principal é precisão/recall sem
vazamento ou inferência de campos ausentes.

## Evidência automatizada

- `kc-search-shadow-pipeline.test.js`: 13/13 testes;
- `kc-search-shadow-benchmark.test.js`: 5/5 testes;
- conjunto focado: 18/18 testes;
- baseline validado: 186 suites / 3.750 testes / 3 snapshots;
- Playwright validado: 10 specs / 68 testes listados.

## Próximo gate

PR-F deve gerar um snapshot imutável e verificável do registry e definir lazy loading
sob flag desligada. Isso remove a dependência do builder de criação sem alterar ainda
`/search-results.html` ou `kcSearchDropdown`. Personalização, analytics adicional,
SQL pessoal e coleta comportamental continuam bloqueados.
