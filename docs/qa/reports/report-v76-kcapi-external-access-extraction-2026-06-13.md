# Report V76 - KCAPI External Access Extraction

**Data:** 2026-06-13
**Escopo:** JS-I.1 do plano `docs/planning/v76-hotspot-decomposition-plan.md`
**Tipo:** refactor runtime controlado + teste de contrato
**Status:** PASSOU
**Runtime alterado:** sim, apenas delegacao interna da fachada `KCAPI`

---

## 1. Objetivo

Executar o menor candidato runtime apontado pelo inventario JS-I: remover chamadas diretas ao driver
ativo nos wrappers admin de external access dentro de `assets/js/api/kc-api.client.js`.

O contrato publico permanece:

- `KCAPI.listExternalAccessRequests(filters)`
- `KCAPI.decideExternalAccessRequest(payload)`

Ambos continuam expostos em `window.KCAPI`, mas agora delegam para `window._KCAPI.help`, que resolve
o driver por dependencia injetada e preserva fallback quando o driver ativo nao implementa o metodo.

---

## 2. Arquivos alterados no repositorio

- `assets/js/api/kc-api.client.js`
- `assets/js/api/kc-api.help.js`
- `scripts/audit-kcapi-facade-residual.js`
- `tests/contract/kc-api-external-access-contract.test.js`
- `tests/contract/kc-api-facade-contract.test.js`
- `tests/integration/kc-api-help-module.test.js`
- documentos de arquitetura, planejamento, indice e QA relacionados

Nenhum HTML, CSS, adapter local/Supabase, migration, secret, provider ou deploy foi alterado.

---

## 3. Decisao tecnica

Antes:

- `KCAPI.listExternalAccessRequests` chamava `getActiveDriver()` diretamente no facade.
- `KCAPI.decideExternalAccessRequest` chamava `getActiveDriver()` diretamente no facade.
- O inventario classificava esses dois wrappers como bucket `admin-external-access-direct-driver`.

Depois:

- o facade chama `getHelpModule()`;
- o facade injeta `{ getActiveDriver }` no submodulo;
- `window._KCAPI.help` executa a chamada real no driver ativo;
- os fallbacks `{ ok: false, error: { message: 'Funcionalidade indisponível neste driver.' } }`
  continuam preservados, incluindo `items: []` e `total: 0` na listagem;
- `window.KCAPI` permanece com 107 membros publicos.

Rollback simples: reverter este PR devolve os dois wrappers para chamada direta ao driver e remove
o teste dedicado sem tocar dados, adapters, HTML ou CSS.

---

## 4. Inventario residual apos JS-I.1

Fonte: `npm run audit:kcapi-residual` em 2026-06-13.

| Metrica | Valor |
|---|---:|
| `assets/js/api/kc-api.client.js` | 1.509 linhas / 58.399 bytes |
| Membros publicos `window.KCAPI` | 107 |
| Declaracoes `function` | 145 |
| Wrappers exportados/globais | 98 |
| Namespaces `_KCAPI.*` inicializados | 17 |
| Buckets residuais | 12 |

Bucket principal atualizado:

| Bucket | Funcoes | Linhas | Exportadas | Delegam | Driver | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| `public-delegation-wrappers` | 80 | 656 | 80 | 80 | 18 | 62 |
| `notification-fallback-builders` | 2 | 40 | 0 | 2 | 0 | 0 |
| `post-mutation-bridge` | 3 | 23 | 0 | 0 | 0 | 0 |
| `bootstrap-driver-core` | 12 | 131 | 6 | 0 | 1 | 2 |

O bucket `admin-external-access-direct-driver` nao aparece mais. A proxima prioridade medida pelo
script e JS-I.2 `notification-fallback-builders` (2 funcoes / 40 linhas).

---

## 5. Cobertura adicionada

Nova suite:

- `tests/contract/kc-api-external-access-contract.test.js`

Ela cobre:

- delegacao de `KCAPI.listExternalAccessRequests` para o driver ativo via `window._KCAPI.help`;
- delegacao de `KCAPI.decideExternalAccessRequest` para o driver ativo via `window._KCAPI.help`;
- fallback da listagem quando o driver nao tem suporte;
- fallback da decisao quando o driver nao tem suporte.

Testes existentes reforcados:

- `tests/integration/kc-api-help-module.test.js` agora exige exports, fallbacks e delegacao de external access no submodulo help.
- `tests/contract/kc-api-facade-contract.test.js` agora exige que a fachada delegue os dois wrappers para `helpModule` com `{ getActiveDriver }`.

---

## 6. Validacao local

Validacao executada nesta etapa:

```text
node --check assets/js/api/kc-api.help.js
node --check assets/js/api/kc-api.client.js
node --check scripts/audit-kcapi-facade-residual.js
npm test -- --runInBand tests/contract/kc-api-external-access-contract.test.js
npm test -- --runInBand tests/integration/kc-api-help-module.test.js tests/contract/kc-api-facade-contract.test.js
npm run audit:kcapi-residual
npm run audit:kcapi-residual -- --json
git diff --check
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm run check:all
npx playwright test --list
```

Resultados da rodada completa:

| Gate | Resultado |
|---|---|
| `node --check` nos JS tocados | passou |
| suite dedicada `kc-api-external-access-contract.test.js` | passou; 4 testes |
| suites help/facade relacionadas | passou; 37 testes |
| `npm run audit:kcapi-residual` | passou; 12 buckets residuais |
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

1. JS-I.2 mover `buildFallbackNotificationPreferences` e
   `buildFallbackNotificationChannelTargets` para `kc-api.notifications.js`; ou
2. investigar `post-mutation-bridge` com foco em eventos de freshness; ou
3. retomar CSS-C somente com dossie visual especifico e sem misturar com decomposicao JS.
