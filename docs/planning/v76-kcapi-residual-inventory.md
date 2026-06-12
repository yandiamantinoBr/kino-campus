# V76 JS-I - Inventario Residual da Fachada `KCAPI`

**Versao:** v76.10.0
**Data:** 2026-06-12
**Escopo:** inventario documental + script assistivo; sem alterar JS runtime, HTML, CSS, SQL, secrets, provider ou deploy

---

## 1. Decisao

Esta entrega executa a etapa JS-I do plano V76: medir o que ainda reside na fachada
`assets/js/api/kc-api.client.js` depois das extracoes de diagnostics, session/freshness, filters,
authors, posts-normalize e normalizadores de ratings.

O objetivo nao e extrair codigo nesta etapa. O objetivo e criar um inventario reproduzivel que
separe wrappers, bootstrap, builders de dependencia e candidatos pequenos para as proximas PRs.

No-Go mantido:

- nenhum metodo de `window.KCAPI` foi removido, renomeado ou reordenado;
- nenhum HTML teve ordem de `<script>` alterada;
- nenhum adapter local/Supabase foi alterado;
- nenhuma regra CSS, migration ou configuracao de provider foi tocada;
- nenhum fallback foi removido.

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

Fonte: `npm run audit:kcapi-residual` em 2026-06-12.

| Metrica | Valor |
|---|---:|
| Arquivo medido | `assets/js/api/kc-api.client.js` |
| Linhas | 1.509 |
| Bytes | 58.340 |
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
| `public-delegation-wrappers` | 78 | 642 | 78 | 78 | 18 | 60 |
| `bootstrap-driver-core` | 12 | 131 | 6 | 0 | 1 | 2 |
| `module-accessors` | 16 | 90 | 0 | 16 | 0 | 11 |
| `dependency-builders` | 8 | 45 | 0 | 0 | 0 | 0 |
| `rating-normalizer-wrappers` | 4 | 42 | 4 | 4 | 0 | 1 |
| `notification-fallback-builders` | 2 | 40 | 0 | 2 | 0 | 0 |
| `internal-helpers` | 8 | 24 | 0 | 8 | 0 | 0 |
| `post-mutation-bridge` | 3 | 23 | 0 | 0 | 0 | 0 |
| `author-public-wrappers` | 5 | 15 | 1 | 5 | 0 | 0 |
| `admin-external-access-direct-driver` | 2 | 14 | 2 | 0 | 2 | 2 |
| `diagnostics-global-wrappers` | 4 | 12 | 4 | 4 | 0 | 0 |
| `public-normalizer-filter-wrappers` | 2 | 9 | 2 | 2 | 0 | 0 |
| `public-facade-helpers` | 1 | 1 | 1 | 0 | 0 | 0 |

Leitura:

- o maior volume residual e wrapper publico de delegacao, nao logica de dominio nova;
- 78 wrappers ja delegam para submodulos e devem ser reduzidos apenas quando houver padrao seguro
  para preservar fallback e assinatura publica;
- `bootstrap-driver-core` continua sendo alto risco porque concentra env, driver e base de dados;
- os melhores candidatos para runtime pequeno sao os buckets com dominio claro e poucas linhas.

---

## 5. Candidatos priorizados

| Prioridade | Candidato | Linhas | Target | Risco |
|---|---|---:|---|---|
| P1 | Mover wrappers diretos de external access admin para submodulo | 14 | `assets/js/api/kc-api.help.js` ou novo `kc-api.admin-access.js` | Medio: fluxo admin/autenticado; exige contrato estatico e teste de driver fallback |
| P2 | Mover builders de fallback de notificacao para `kc-api.notifications.js` | 40 | `assets/js/api/kc-api.notifications.js` | Medio: preservar defaults privados e mensagens de indisponibilidade |
| P2 | Reavaliar ponte `emitPostMutation` apos wrappers de posts-write | 23 | `assets/js/api/kc-api.posts-write.js` | Medio/alto: eventos publicos de freshness e UI podem depender da ordem atual |
| P3 | Manter bootstrap/env/driver no facade por enquanto | 114 | sem extracao imediata | Alto: qualquer mudanca afeta todas as paginas e drivers |

Detalhe dos candidatos:

| Candidato | Funcoes | Linhas no facade |
|---|---|---|
| external access admin | `listExternalAccessRequests`, `decideExternalAccessRequest` | L1183-L1197 |
| notification fallbacks | `buildFallbackNotificationPreferences`, `buildFallbackNotificationChannelTargets` | L1209-L1249 |
| post mutation bridge | `isPostMutationOk`, `getPostMutationData`, `emitPostMutation` | L533-L557 |
| bootstrap/env/driver | `readEnv`, `setConfig`, `withTimeout`, `fetchJSON`, `apiURL`, `getDatabaseRaw`, `getDatabaseNormalized`, `registerAdapter`, `getActiveDriver` | L22-L400 |

---

## 6. Proxima etapa recomendada

A proxima PR runtime mais objetiva e **JS-I.1 external access admin**, desde que limitada a:

- mover somente `listExternalAccessRequests` e `decideExternalAccessRequest`;
- preservar os membros publicos `KCAPI.listExternalAccessRequests` e `KCAPI.decideExternalAccessRequest`;
- manter fallback `{ ok: false, error: 'DRIVER_NAO_SUPORTA_EXTERNAL_ACCESS' }`;
- adicionar teste de contrato para driver com e sem suporte;
- nao tocar UI admin, CSS, HTML ou providers.

Se a prioridade for reduzir mais linhas com risco ainda moderado, **JS-I.2 notification fallbacks**
e o segundo candidato: 40 linhas puras de dominio de notificacao, mas com cuidado para manter os
defaults de `KCAccountProfileUtils` e as respostas privadas atuais.

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

Para a futura JS-I.1 runtime, adicionar:

```bash
npm test -- --runInBand tests/contract/kc-api-facade-contract.test.js
npm test -- --runInBand tests/integration/kc-api-client.test.js
```

E criar ou ampliar teste dedicado para external access admin antes do merge.
