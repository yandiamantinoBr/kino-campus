# Report V76.33 — contrato de campos e corpus dourado de busca

**Data:** 2026-06-19  
**Escopo:** Fase 0/PR-A; contrato compartilhado, fixture e testes  
**Runtime frontend:** `8.6.1` inalterado  
**Integração em HTML:** nenhuma

## Resultado

`KCSearchFieldRegistry` passou a derivar diretamente do schema e do builder de
criação os seis módulos, grupos, opções e campos condicionais. O registro não
duplica a taxonomia do formulário e falha explicitamente quando um campo gerado
não possui política de busca/privacidade.

O corpus dourado v1 contém 18 consultas sintéticas, três por módulo, com intenção,
filtros esperados, aliases, acentos e erros de digitação. Nenhuma consulta real,
identificador pessoal, contato ou URL foi incluída.

## Entregáveis

| Arquivo | Responsabilidade |
|---|---|
| `assets/js/shared/kc-search-fields.shared.js` | UMD `KCSearchFieldRegistry`, cenários, paths e políticas |
| `tests/fixtures/search-golden-queries.v1.json` | corpus sintético versionado |
| `tests/contract/kc-search-field-registry-contract.test.js` | 39 contratos de paridade, paths, condicionais e privacidade |

## Cobertura funcional do contrato

- Compra e venda: categoria/ação, preço, condição e localização.
- Caronas: tipo, rota, horário, contribuição, vagas e marcadores.
- Moradia: tipo, região, preço/orçamento, referência, detalhes e marcadores.
- Eventos: tópico, local, intervalo de datas, horário, gratuidade e preço.
- Achados e perdidos: status/tipo, local, recompensa e entrega.
- Oportunidades: tipo, área, modalidade, regime, localização e remuneração.

Campos comuns `titulo` e `descricao` são exigidos em todos os módulos. Os cenários
confirmam que `condicao`, `vagas`, `orcamento`, `preco` de evento,
`recompensa`/`entrega` e `regimeContratacao` só aparecem nas variantes corretas.

## Privacidade

- `contato` e `link` são explicitamente não indexáveis, não filtráveis e inelegíveis para preferência.
- Nenhum valor livre de formulário é preferência direta.
- Localização, área e marcadores só podem gerar afinidade depois de resolvidos para um valor canônico.
- Gênero, raça/cor, demais atributos protegidos, tokens e senhas não integram policies ou corpus.
- O asset não é carregado em HTML; não existe nova coleta, telemetria ou ranking.

## Validação

| Verificação | Resultado |
|---|---|
| `node --check assets/js/shared/kc-search-fields.shared.js` | aprovado |
| Jest focado | 1 suite / 39 testes aprovados |
| `git diff --check` | aprovado |
| `npm run check:structure` | aprovado; 169 itens + raiz JS limpa |
| `npm run check:hygiene` | aprovado; runtime `8.6.1` |
| `npm run check:all` | aprovado; 183 suites / 3.682 testes / 3 snapshots |
| `npx playwright test --list` | aprovado; 10 specs / 68 testes |

## Decisão e próximo gate

PR-A está concluído. O próximo candidato é PR-B: projeção estruturada apenas no
driver local, atrás de flag desligada por padrão, avaliada contra o corpus. SQL,
Supabase, personalização, perfil e coleta comportamental continuam em No-Go.

## Rollback

Remover o asset não carregado, a fixture, a suíte e as referências documentais.
Não há HTML, cache, migration, dado pessoal ou serviço de produção para restaurar.
