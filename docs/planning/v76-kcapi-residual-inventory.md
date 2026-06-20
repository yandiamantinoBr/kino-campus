# V76 JS-I - Inventário Residual da Fachada `KCAPI`

**Versão:** v76.31.0
**Data:** 2026-06-19
**Escopo:** inventário documental + script assistivo; inclui JS-I.1 a JS-I.4 e contratos comportamentais JS-I.5/JS-I.6; sem alterar runtime, HTML, CSS, SQL, secrets, provider ou deploy

---

## 1. Decisão

Esta entrega mantém a etapa JS-I do plano V76: medir o que ainda reside na fachada
`assets/js/api/kc-api.client.js` depois das extrações de diagnostics, session/freshness, filters,
authors, posts-normalize e normalizadores de ratings.

O objetivo inicial foi criar um inventário reproduzível que separasse wrappers, bootstrap, builders
de dependência e candidatos pequenos para as próximas PRs. Em v76.11.0, o primeiro candidato
runtime JS-I.1 foi executado: os wrappers `listExternalAccessRequests` e
`decideExternalAccessRequest` continuam públicos em `window.KCAPI`, mas agora delegam para
`window._KCAPI.help` com fallback de driver preservado.

Em v76.12.0, JS-I.2 removeu da fachada os builders privados
`buildFallbackNotificationPreferences` e `buildFallbackNotificationChannelTargets`. Os defaults
canônicos de preferências e destinos privados agora ficam concentrados em
`window._KCAPI.notifications`; os membros públicos `KCAPI.getNotificationPreferences` e
`KCAPI.getNotificationChannelTargets` continuam expostos e preservam a delegação/fallback por
dependência injetada.

Em v76.13.0, JS-I.3 removeu da fachada a ponte privada `emitPostMutation` e seus helpers
`isPostMutationOk` e `getPostMutationData`. A lógica de freshness das mutações de posts agora vive
em `window._KCAPI.postsWrite`, com `postFreshness: window.KCPostFreshness` injetado pela fachada e
ordem de emissão preservada após o retorno do driver ativo.

Em v76.29.0, JS-I.4 tornou o bucket `bootstrap-driver-core` auditável por domínio, função, sinal de
risco e gate. O resultado é um No-Go explícito para extração runtime: as 12 funções / 131 linhas
formam cinco domínios acoplados e exigem 15 gates antes de qualquer movimentação.

Em v76.30.0, JS-I.5 adicionou oito contratos comportamentais para os quatro gates de
`transport-config`. O auditor agora mede 4 gates cobertos / 11 pendentes; nenhuma função runtime
foi movida ou alterada.

Em v76.31.0, JS-I.6 adicionou cinco contratos comportamentais para os quatro gates de
`adapter-registry`. O auditor passa a medir 8 gates cobertos / 7 pendentes, ainda sem alterar
runtime.

No-Go mantido:

- nenhum método de `window.KCAPI` foi removido, renomeado ou reordenado;
- nenhum HTML teve ordem de `<script>` alterada;
- nenhum adapter local/Supabase foi alterado;
- nenhuma regra CSS, migration ou configuração de provider foi tocada;
- nenhum fallback público foi removido; os fallbacks canônicos de notificação apenas mudaram de dono;
- nenhum evento público de freshness foi removido; a ponte de mutação apenas mudou de dono;
- nenhum fluxo admin foi alterado fora da camada de delegação KCAPI.

---

## 2. Comando canonico

```bash
npm run audit:kcapi-residual
```

O comando executa `scripts/audit-kcapi-facade-residual.js` e imprime Markdown por padrao.
Para integracao com automacao ou comparacao futura:

```bash
npm run audit:kcapi-residual -- --json
```

O script mede:

- tamanho atual da fachada;
- membros publicos do bloco `window.KCAPI = Object.freeze({ ... })`;
- funcoes declaradas no arquivo;
- wrappers exportados/globais;
- namespaces `_KCAPI.*` inicializados;
- inventario dos arquivos de submodulo esperados em `assets/js/api/`;
- buckets de responsabilidade residual;
- candidatos pequenos para PRs futuras.

---

## 3. Baseline medido

Fonte: `npm run audit:kcapi-residual` em 2026-06-15.

| Metrica | Valor |
|---|---:|
| Arquivo medido | `assets/js/api/kc-api.client.js` |
| Linhas | 1.459 |
| Bytes | 56.513 |
| Membros públicos `window.KCAPI` | 107 |
| Declarações `function` | 141 |
| Wrappers exportados/globais | 98 |
| Namespaces `_KCAPI.*` inicializados | 17 |
| Início do bloco público | L1318 |
| Fim do bloco público | L1452 |

Os 17 namespaces atuais sao:

| Namespace | Arquivo | Estado |
|---|---|---|
| `diagnostics` | `assets/js/api/kc-api.diagnostics.js` | existe |
| `related` | `assets/js/api/kc-api.related.js` | existe |
| `filters` | `assets/js/api/kc-api.filters.js` | existe |
| `authors` | `assets/js/api/kc-api.authors.js` | existe |
| `postsNormalize` | `assets/js/api/kc-api.posts-normalize.js` | existe |
| `session` | `assets/js/api/kc-api.session.js` | existe |
| `postsFeed` | `assets/js/api/kc-api.posts-feed.js` | existe |
| `ratings` | `assets/js/api/kc-api.ratings.js` | existe |
| `postsWrite` | `assets/js/api/kc-api.posts-write.js` | existe |
| `postsRead` | `assets/js/api/kc-api.posts-read.js` | existe |
| `auth` | `assets/js/api/kc-api.auth.js` | existe |
| `profiles` | `assets/js/api/kc-api.profiles.js` | existe |
| `commentsVotes` | `assets/js/api/kc-api.comments-votes.js` | existe |
| `saved` | `assets/js/api/kc-api.saved.js` | existe |
| `help` | `assets/js/api/kc-api.help.js` | existe |
| `notifications` | `assets/js/api/kc-api.notifications.js` | existe |
| `chat` | `assets/js/api/kc-api.chat.js` | existe |

---

## 4. Buckets residuais

| Bucket | Funcoes | Linhas | Exportadas | Delegam | Driver | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| `public-delegation-wrappers` | 80 | 668 | 80 | 80 | 18 | 62 |
| `bootstrap-driver-core` | 12 | 131 | 6 | 0 | 1 | 2 |
| `module-accessors` | 16 | 90 | 0 | 16 | 0 | 11 |
| `dependency-builders` | 8 | 45 | 0 | 0 | 0 | 0 |
| `rating-normalizer-wrappers` | 4 | 42 | 4 | 4 | 0 | 1 |
| `internal-helpers` | 9 | 29 | 0 | 9 | 0 | 0 |
| `author-public-wrappers` | 5 | 15 | 1 | 5 | 0 | 0 |
| `diagnostics-global-wrappers` | 4 | 12 | 4 | 4 | 0 | 0 |
| `public-normalizer-filter-wrappers` | 2 | 9 | 2 | 2 | 0 | 0 |
| `public-facade-helpers` | 1 | 1 | 1 | 0 | 0 | 0 |

Leitura:

- o maior volume residual é wrapper público de delegação, não lógica de domínio nova;
- 80 wrappers já delegam para submódulos e devem ser reduzidos apenas quando houver padrão seguro
  para preservar fallback e assinatura pública;
- `bootstrap-driver-core` continua sendo alto risco porque concentra env, driver e base de dados;
- JS-I.1 removeu o bucket direto `admin-external-access-direct-driver`;
- JS-I.2 removeu o bucket `notification-fallback-builders` da fachada;
- JS-I.3 removeu o bucket `post-mutation-bridge` da fachada;
- JS-I.4 divide o bucket em cinco domínios, sem deixar função sem mapeamento, e registra 15 gates;
- não há novo candidato JS pequeno equivalente; `bootstrap-driver-core` segue como P3 de alto risco e No-Go runtime.

---

## 5. Candidatos priorizados

| Prioridade | Candidato | Linhas | Target | Risco |
|---|---|---:|---|---|
| Concluído | JS-I.1 external access admin para `kc-api.help.js` | 14 | `assets/js/api/kc-api.help.js` | Concluído em v76.11.0 com contrato dedicado de driver e fallback |
| Concluído | JS-I.2 notification fallbacks em `kc-api.notifications.js` | 40 | `assets/js/api/kc-api.notifications.js` | Concluído em v76.12.0; defaults canônicos preservados no submódulo |
| Concluído | JS-I.3 post mutation bridge em `kc-api.posts-write.js` | 23 | `assets/js/api/kc-api.posts-write.js` | Concluído em v76.13.0; eventos de freshness preservados no submódulo |
| P3 | Manter bootstrap/env/driver no facade por enquanto | 131 | sem extração imediata | Alto: qualquer mudança afeta todas as páginas e drivers; No-Go confirmado em JS-I.4 |

Detalhe dos candidatos:

| Candidato | Funcoes | Linhas no facade |
|---|---|---|
| external access admin | `listExternalAccessRequests`, `decideExternalAccessRequest` | **Concluído em v76.11.0**; wrappers continuam em L1183-L1197, agora delegando para `window._KCAPI.help` |
| notification fallbacks | `buildFallbackNotificationPreferences`, `buildFallbackNotificationChannelTargets` | **Concluído em v76.12.0**; builders removidos da fachada e preservados em `window._KCAPI.notifications` |
| post mutation bridge | `isPostMutationOk`, `getPostMutationData`, `emitPostMutation` | **Concluído em v76.13.0**; helpers removidos da fachada e preservados em `window._KCAPI.postsWrite` |
| bootstrap/env/driver | `readEnv`, `bootstrapConfig`, `setConfig`, `withTimeout`, `fetchJSON`, `apiURL`, `kcApiError`, `enforceSupabaseOnProduction`, `getDatabaseRaw`, `getDatabaseNormalized`, `registerAdapter`, `getActiveDriver` | L22-L400 |

---

## 6. Dossiê JS-I.4 do bootstrap/driver core

| Domínio | Funções | Linhas | Exportadas | Decisão |
|---|---:|---:|---:|---|
| `environment-policy` | 3 | 69 | 0 | manter na fachada |
| `transport-config` | 4 | 26 | 3 | manter na fachada |
| `error-contract` | 1 | 3 | 0 | manter na fachada |
| `static-database-fallback` | 2 | 25 | 2 | manter na fachada |
| `adapter-registry` | 2 | 8 | 1 | manter na fachada |

O script valida que nenhuma das 12 funções ficou sem domínio e expõe sinais de risco para leitura
de ambiente/configuração mutável, rede, timers, base estática, normalização, registro de adapters,
seleção de driver e política de produção. Os 15 gates cobrem paridade de ambiente, configuração,
timeout/HTTP/URL, erro público, fallback estático, normalização, registro e precedência do driver.

JS-I.5 cobre integralmente os quatro gates de `transport-config`: contrato público de `setConfig`,
timeout, mapeamento de erro HTTP e resolução relativa de `baseURL`. Os outros 11 gates permanecem
obrigatórios e o domínio continua na fachada.

JS-I.6 cobre integralmente os quatro gates de `adapter-registry`: ordem/sobrescrita de registro,
fallback local, seleção Supabase e falha explícita sem adapter. Sete gates permanecem obrigatórios.

O contrato completo e as evidências ficam em:

- `docs/planning/v76-kcapi-bootstrap-driver-core-dossier.md`;
- `docs/qa/reports/report-v76-kcapi-bootstrap-driver-core-dossier-2026-06-19.md`.

---

## 7. Próxima etapa recomendada

Após JS-I.6, não há autorização para extrair código desse núcleo. A próxima PR mais prudente deve
escolher uma frente única:

- executar CSS-B autenticado para dashboard/admin real antes de qualquer split visual;
- cobrir `public-error-shape-contract` ou avançar nos seis gates de ambiente/fallback estático,
  sem editar runtime.

Se a prioridade for reduzir risco transversal antes de mover mais código, a alternativa é congelar
esta medição como baseline e avançar para CSS-C apenas com dossiê visual específico.

Continuam bloqueados para PR ampla:

- split de todos os wrappers publicos de uma vez;
- extracao de `bootstrap-driver-core`;
- remocao de fallbacks legados;
- mistura entre decomposicao JS e micro-split CSS.

---

## 8. Validacao esperada

Para esta entrega documental/script:

```bash
node --check scripts/audit-kcapi-facade-residual.js
npm run audit:kcapi-residual
npm run audit:kcapi-residual -- --json
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm run check:all
```

Para JS-I.2 runtime, a validacao dedicada adiciona:

```bash
npm test -- --runInBand tests/contract/kc-api-notification-preferences-contract.test.js
npm test -- --runInBand tests/integration/kc-api-notifications-module.test.js tests/contract/kc-api-facade-contract.test.js
```

O teste `tests/contract/kc-api-notification-preferences-contract.test.js` cobre driver com suporte
e fallback sem suporte para preferencias/destinos privados de notificacao. Os testes estaticos
garantem que os builders canonicos permanecem no submodulo `kc-api.notifications.js` e nao voltam
como declaracoes privadas da fachada.
