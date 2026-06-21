# V76.44 — afinidade local opt-in e reranking limitado

**Data:** 2026-06-20

**Branch:** `codex/v76-search-local-affinity`

**Escopo:** PR-K do plano de busca/personalização

## Resultado

As duas superfícies (`/search-results.html` e `kcSearchDropdown`) passam a aplicar
preferências explícitas e, quando autorizada separadamente, afinidade local. A busca
continua selecionando candidatos e aplicando filtros antes de qualquer ajuste pessoal.

## Ranking e explicação

- preferência explícita: teto de 5%;
- afinidade local: teto de 2%;
- teto combinado multiplicativo: 7%;
- resultados com diferença de relevância superior ao teto não são ultrapassados;
- ordenações por data ou engajamento não recebem reranking pessoal;
- nenhum candidato é criado, removido ou liberado pela personalização;
- resultados priorizados mostram motivos compreensíveis;
- a página mostra link direto para revisar ou desligar a finalidade.

## Dados locais

`kc_search_affinity_v1` guarda somente contadores agregados por:

- módulo canônico, como `module:eventos`;
- opção canônica de grupo elegível, como
  `feature:eventos:topico:academicos`.

Não há log de eventos, query, título, post ID, identidade, conta, contato, texto livre,
hover ou impressão. Apenas `dropdown-click` e `results-click` deliberados são aceitos.
Automação identificada por `navigator.webdriver` não incrementa afinidade.

Controles de retenção:

- TTL de 90 dias renovado por interação válida;
- meia-vida de score de 30 dias;
- saturação por contagem;
- máximo de 20 incrementos por feature;
- máximo de 24 features locais;
- poda de expirados/corrompidos em leitura e escrita;
- opt-out/exclusão remove o store integralmente.

## Transparência

- declaração pública atualizada para a versão 2026-06-20;
- inventário administrativo registra preferências e afinidade como finalidade
  `Personalização`, separada de `Analytics`;
- exportação e exclusão permanecem na seção de configurações entregue no PR-J.

## Validação focada

- Jest focado: 4 suites, 23 testes aprovados;
- Jest completo: 195 suites, 3.804 testes e 3 snapshots aprovados;
- Playwright focado: 13/13 (página, dropdown, persistência pós-clique,
  opt-out, mobile e regressão estruturada);
- Playwright completo em Chromium/1 worker: 83/83;
- benchmark estruturado: 12/12, recall/precision/stability = 1;
- validators, higiene, rotas, script chains e snapshot canônico aprovados;
- captura real desktop/mobile sem erro de página ou overflow horizontal.

## Rollback

1. desligar `search.personalization` em `KC_ENV.flags`;
2. remover a integração assíncrona de `kc-search.js`;
3. remover banner/motivos visuais;
4. remover `kc-search-affinity.shared.js`;
5. limpar `kc_search_affinity_v1` sem restaurar dados já excluídos.

O fallback é sempre a ordem comum. Não há migration, RPC, sincronização com conta,
telemetria comportamental remota, experimento ou modelo aprendido neste PR.
