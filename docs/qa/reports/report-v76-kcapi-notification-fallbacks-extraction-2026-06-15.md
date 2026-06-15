# Report V76 - KCAPI Notification Fallbacks Extraction

**Data:** 2026-06-15
**Escopo:** JS-I.2 do plano `docs/planning/v76-hotspot-decomposition-plan.md`
**Tipo:** refactor runtime controlado + contratos estaticos/runtime
**Status:** PASSOU
**Runtime alterado:** sim, apenas delegacao interna da fachada `KCAPI`

---

## 1. Objetivo

Executar o candidato JS-I.2 apontado pelo inventario residual: remover da fachada
`assets/js/api/kc-api.client.js` os builders privados de fallback de notificacao.

O contrato publico permanece:

- `KCAPI.getNotificationPreferences()`
- `KCAPI.getNotificationChannelTargets()`
- `KCAPI.updateNotificationPreferences(preferences)`
- `KCAPI.updateNotificationChannelTargets(targets)`

Os defaults canonicos de preferencias e destinos privados ficam concentrados em
`window._KCAPI.notifications`, que ja e carregado antes de `kc-api.client.js` nos HTMLs reais.

---

## 2. Arquivos alterados no repositorio

- `assets/js/api/kc-api.client.js`
- `scripts/audit-kcapi-facade-residual.js`
- `tests/contract/kc-api-facade-contract.test.js`
- `tests/integration/kc-api-notifications-module.test.js`
- documentos de arquitetura, planejamento, indice e QA relacionados

Nenhum HTML, CSS, adapter local/Supabase, migration, secret, provider ou deploy foi alterado.

---

## 3. Decisao tecnica

Antes:

- o facade declarava `buildFallbackNotificationPreferences`;
- o facade declarava `buildFallbackNotificationChannelTargets`;
- o inventario classificava essas duas funcoes como bucket `notification-fallback-builders`.

Depois:

- os builders privados nao existem mais em `kc-api.client.js`;
- os wrappers publicos chamam `window._KCAPI.notifications.getNotificationPreferences` e
  `window._KCAPI.notifications.getNotificationChannelTargets`;
- se o metodo principal do submodulo nao existir, o facade chama os builders exportados pelo
  proprio submodulo;
- se o submodulo inteiro estiver ausente, resta apenas o fallback extremo via
  `KCAccountProfileUtils`;
- `window.KCAPI` permanece com 107 membros publicos.

Rollback simples: reverter este PR devolve as duas funcoes privadas para a fachada sem tocar dados,
HTML, CSS, adapters ou providers.

---

## 4. Inventario residual apos JS-I.2

Fonte: `npm run audit:kcapi-residual` em 2026-06-15.

| Metrica | Valor |
|---|---:|
| `assets/js/api/kc-api.client.js` | 1.479 linhas / 57.288 bytes |
| Membros publicos `window.KCAPI` | 107 |
| Declaracoes `function` | 143 |
| Wrappers exportados/globais | 98 |
| Namespaces `_KCAPI.*` inicializados | 17 |
| Buckets residuais | 11 |

Buckets principais atualizados:

| Bucket | Funcoes | Linhas | Exportadas | Delegam | Driver | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| `public-delegation-wrappers` | 80 | 668 | 80 | 80 | 18 | 62 |
| `bootstrap-driver-core` | 12 | 131 | 6 | 0 | 1 | 2 |
| `post-mutation-bridge` | 3 | 23 | 0 | 0 | 0 | 0 |

O bucket `notification-fallback-builders` nao aparece mais. A proxima prioridade medida pelo
script e `post-mutation-bridge` (3 funcoes / 23 linhas), com risco medio/alto por envolver eventos
de freshness e UI de posts.

---

## 5. Cobertura reforcada

Testes existentes reforcados:

- `tests/contract/kc-api-facade-contract.test.js` agora exige que os builders privados nao voltem
  como declaracoes do facade e que os wrappers publicos deleguem para `window._KCAPI.notifications`.
- `tests/integration/kc-api-notifications-module.test.js` agora fixa `direct_message` no fallback
  canonico do submodulo.

Cobertura runtime preservada:

- `tests/contract/kc-api-notification-preferences-contract.test.js` cobre driver com suporte e
  fallback sem suporte para preferencias/destinos privados.

---

## 6. Validacao local

Validacao executada nesta etapa:

```text
node --check assets/js/api/kc-api.client.js
node --check assets/js/api/kc-api.notifications.js
node --check scripts/audit-kcapi-facade-residual.js
npm test -- --runInBand tests/contract/kc-api-notification-preferences-contract.test.js
npm test -- --runInBand tests/integration/kc-api-notifications-module.test.js tests/contract/kc-api-facade-contract.test.js
npm run audit:kcapi-residual
npm run audit:kcapi-residual -- --json
```

Resultados da rodada completa:

| Gate | Resultado |
|---|---|
| `node --check` nos JS tocados | passou |
| suite `kc-api-notification-preferences-contract.test.js` | passou; 6 testes |
| suites notifications/facade relacionadas | passou; 35 testes |
| `npm run audit:kcapi-residual` | passou; 11 buckets residuais |
| `npm run audit:kcapi-residual -- --json` | passou |
| `git diff --check` | passou |
| `npm run check:structure` | passou |
| `npm run check:scripts` | passou |
| `npm run check:hygiene` | passou |
| `npm run check:all` | passou; 175 suites / 3574 testes Jest |
| `npx playwright test --list` | passou; 59 testes em 9 arquivos |

---

## 7. Proxima etapa

Seguir com uma frente unica:

1. investigar `post-mutation-bridge` com foco em eventos de freshness; ou
2. congelar a trilha JS e retomar CSS-C somente com dossie visual especifico; ou
3. executar CSS-B autenticado para dashboard/admin real antes de qualquer split visual.
