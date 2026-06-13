# V76 JS-I - Inventario Residual da Fachada `KCAPI`

**Versao:** v76.11.0
**Data:** 2026-06-13
**Escopo:** inventario documental + script assistivo; inclui status JS-I.1 da extracao de external access; sem alterar HTML, CSS, SQL, secrets, provider ou deploy

---

## 1. Decisao

Esta entrega mantem a etapa JS-I do plano V76: medir o que ainda reside na fachada
`assets/js/api/kc-api.client.js` depois das extracoes de diagnostics, session/freshness, filters,
authors, posts-normalize e normalizadores de ratings.

O objetivo inicial foi criar um inventario reproduzivel que separasse wrappers, bootstrap, builders
de dependencia e candidatos pequenos para as proximas PRs. Em v76.11.0, o primeiro candidato
runtime JS-I.1 foi executado: os wrappers `listExternalAccessRequests` e
`decideExternalAccessRequest` continuam publicos em `window.KCAPI`, mas agora delegam para
`window._KCAPI.help` com fallback de driver preservado.

No-Go mantido:

- nenhum metodo de `window.KCAPI` foi removido, renomeado ou reordenado;
- nenhum HTML teve ordem de `<script>` alterada;
- nenhum adapter local/Supabase foi alterado;
- nenhuma regra CSS, migration ou configuracao de provider foi tocada;
- nenhum fallback foi removido.
- nenhum fluxo admin foi alterado fora da camada de delegacao KCAPI.

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

Fonte: `npm run audit:kcapi-residual` em 2026-06-13.

| Metrica | Valor |
|---|---:|
| Arquivo medido | `assets/js/api/kc-api.client.js` |
| Linhas | 1.509 |
| Bytes | 58.399 |
| Membros publicos `window.KCAPI` | 107 |
| Declaracoes `function` | 145 |
| Wrappers exportados/globais | 98 |
| Namespaces `_KCAPI.*` inicializados | 17 |
| Inicio do bloco publico | L1368 |
| Fim do bloco publico | L1502 |

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
| `public-delegation-wrappers` | 80 | 656 | 80 | 80 | 18 | 62 |
| `bootstrap-driver-core` | 12 | 131 | 6 | 0 | 1 | 2 |
| `module-accessors` | 16 | 90 | 0 | 16 | 0 | 11 |
| `dependency-builders` | 8 | 45 | 0 | 0 | 0 | 0 |
| `rating-normalizer-wrappers` | 4 | 42 | 4 | 4 | 0 | 1 |
| `notification-fallback-builders` | 2 | 40 | 0 | 2 | 0 | 0 |
| `internal-helpers` | 8 | 24 | 0 | 8 | 0 | 0 |
| `post-mutation-bridge` | 3 | 23 | 0 | 0 | 0 | 0 |
| `author-public-wrappers` | 5 | 15 | 1 | 5 | 0 | 0 |
| `diagnostics-global-wrappers` | 4 | 12 | 4 | 4 | 0 | 0 |
| `public-normalizer-filter-wrappers` | 2 | 9 | 2 | 2 | 0 | 0 |
| `public-facade-helpers` | 1 | 1 | 1 | 0 | 0 | 0 |

Leitura:

- o maior volume residual e wrapper publico de delegacao, nao logica de dominio nova;
- 80 wrappers ja delegam para submodulos e devem ser reduzidos apenas quando houver padrao seguro
  para preservar fallback e assinatura publica;
- `bootstrap-driver-core` continua sendo alto risco porque concentra env, driver e base de dados;
- JS-I.1 removeu o bucket direto `admin-external-access-direct-driver`; o proximo melhor candidato
  runtime pequeno e `notification-fallback-builders`.

---

## 5. Candidatos priorizados

| Prioridade | Candidato | Linhas | Target | Risco |
|---|---|---:|---|---|
| Concluido | JS-I.1 external access admin para `kc-api.help.js` | 14 | `assets/js/api/kc-api.help.js` | Concluido em v76.11.0 com contrato dedicado de driver e fallback |
| P1 | Mover builders de fallback de notificacao para `kc-api.notifications.js` | 40 | `assets/js/api/kc-api.notifications.js` | Medio: preservar defaults privados e mensagens de indisponibilidade |
| P2 | Reavaliar ponte `emitPostMutation` apos wrappers de posts-write | 23 | `assets/js/api/kc-api.posts-write.js` | Medio/alto: eventos publicos de freshness e UI podem depender da ordem atual |
| P3 | Manter bootstrap/env/driver no facade por enquanto | 114 | sem extracao imediata | Alto: qualquer mudanca afeta todas as paginas e drivers |

Detalhe dos candidatos:

| Candidato | Funcoes | Linhas no facade |
|---|---|---|
| external access admin | `listExternalAccessRequests`, `decideExternalAccessRequest` | **Concluido em v76.11.0**; wrappers continuam em L1183-L1197, agora delegando para `window._KCAPI.help` |
| notification fallbacks | `buildFallbackNotificationPreferences`, `buildFallbackNotificationChannelTargets` | L1209-L1249 |
| post mutation bridge | `isPostMutationOk`, `getPostMutationData`, `emitPostMutation` | L533-L557 |
| bootstrap/env/driver | `readEnv`, `setConfig`, `withTimeout`, `fetchJSON`, `apiURL`, `getDatabaseRaw`, `getDatabaseNormalized`, `registerAdapter`, `getActiveDriver` | L22-L400 |

---

## 6. Proxima etapa recomendada

A proxima PR runtime mais objetiva passa a ser **JS-I.2 notification fallbacks**:

- mover somente `buildFallbackNotificationPreferences` e
  `buildFallbackNotificationChannelTargets`;
- preservar os membros publicos `KCAPI.getNotificationPreferences` e
  `KCAPI.getNotificationChannelTargets`;
- manter defaults privados derivados de `KCAccountProfileUtils`;
- adicionar teste de contrato/fallback para driver sem suporte;
- nao tocar UI admin, CSS, HTML, providers ou dispatch de notificacao.

Se a prioridade for reduzir risco transversal antes de mover mais codigo, a alternativa e congelar
esta medicao como baseline e avancar para CSS-C apenas com dossie visual especifico.

Continuam bloqueados para PR ampla:

- split de todos os wrappers publicos de uma vez;
- extracao de `bootstrap-driver-core`;
- remocao de fallbacks legados;
- mistura entre decomposicao JS e micro-split CSS.

---

## 7. Validacao esperada

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

Para JS-I.1 runtime, a validacao dedicada adiciona:

```bash
npm test -- --runInBand tests/contract/kc-api-facade-contract.test.js
npm test -- --runInBand tests/contract/kc-api-external-access-contract.test.js
npm test -- --runInBand tests/integration/kc-api-help-module.test.js
```

O teste `tests/contract/kc-api-external-access-contract.test.js` cobre driver com suporte e fallback
sem suporte para `listExternalAccessRequests` e `decideExternalAccessRequest`.
