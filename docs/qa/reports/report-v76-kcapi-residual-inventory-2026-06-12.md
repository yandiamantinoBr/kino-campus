# Report V76 - KCAPI Residual Facade Inventory

**Data:** 2026-06-12
**Escopo:** JS-I do plano `docs/planning/v76-hotspot-decomposition-plan.md`
**Tipo:** inventario estatico + script assistivo
**Status:** PASSOU
**Runtime alterado:** nao

---

## 1. Objetivo

Criar evidencia reproduzivel do que ainda permanece em `assets/js/api/kc-api.client.js` depois das
extracoes V76 de diagnostics, session/freshness, filters, authors, posts-normalize e normalizadores
de ratings.

Esta etapa nao move codigo. Ela separa responsabilidades residuais em buckets para que a proxima PR
runtime seja pequena, testavel e reversivel.

---

## 2. Arquivos alterados no repositorio

- `scripts/audit-kcapi-facade-residual.js`
- `package.json`
- `docs/planning/v76-kcapi-residual-inventory.md`
- `docs/qa/reports/report-v76-kcapi-residual-inventory-2026-06-12.md`
- indices e docs de arquitetura relacionados

Nenhum arquivo em `assets/js/api/`, `assets/css/`, HTML, `supabase/` ou provider foi alterado.

---

## 3. Comandos executados

```bash
node --check scripts/audit-kcapi-facade-residual.js
npm run audit:kcapi-residual
npm run audit:kcapi-residual -- --json
```

Resultado principal:

| Metrica | Valor |
|---|---:|
| `assets/js/api/kc-api.client.js` | 1.509 linhas / 58.340 bytes |
| Membros publicos `window.KCAPI` | 107 |
| Declaracoes `function` | 145 |
| Wrappers exportados/globais | 98 |
| Namespaces `_KCAPI.*` inicializados | 17 |
| Arquivos de submodulo API conhecidos | 17 |

---

## 4. Buckets medidos

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

---

## 5. Achados

1. O residuo predominante e wrapper publico de delegacao: 78 funcoes / 642 linhas.
2. O facade ainda tem 98 funcoes exportadas/globais, mas 78 ja passam por `_KCAPI.*`.
3. O core de bootstrap/env/driver deve permanecer no facade por enquanto: 12 funcoes / 131 linhas,
   com risco transversal alto.
4. O menor candidato runtime e `admin-external-access-direct-driver`: 2 funcoes / 14 linhas.
5. O candidato com melhor reducao moderada e `notification-fallback-builders`: 2 funcoes / 40 linhas.
6. `chat` foi contabilizado como namespace por passthrough, mesmo usando padrao diferente dos demais
   inicializadores `_KCAPI.*`.

---

## 6. Decisao

JS-I esta aprovado como inventario residual e ferramenta de auditoria para orientar os proximos PRs.

Proxima entrega recomendada:

1. **JS-I.1 external access admin:** mover `listExternalAccessRequests` e
   `decideExternalAccessRequest` para submodulo com teste de driver fallback.
2. **JS-I.2 notification fallbacks:** mover os builders privados de notificacao para
   `kc-api.notifications.js`, preservando defaults de perfil.

Nao iniciar ainda:

- extracao ampla de wrappers publicos;
- alteracao do `bootstrap-driver-core`;
- remocao de fallbacks;
- qualquer mistura com CSS-C.

---

## 7. Validacao local

Validacao executada nesta etapa:

```text
node --check scripts/audit-kcapi-facade-residual.js
npm run audit:kcapi-residual
npm run audit:kcapi-residual -- --json
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm run check:all
npx playwright test --list
```

Resultados:

| Gate | Resultado |
|---|---|
| `git diff --check` | passou |
| `node --check scripts/audit-kcapi-facade-residual.js` | passou |
| `npm run audit:kcapi-residual` | passou |
| `npm run audit:kcapi-residual -- --json` | passou |
| `npm run check:structure` | passou; 167 itens verificados |
| `npm run check:scripts` | passou; cadeia validada em 26 HTMLs |
| `npm run check:hygiene` | passou; runtime `8.6.1` |
| `npm run check:all` | passou; 174 suites / 3570 testes Jest |
| `npx playwright test --list` | passou; 59 testes em 9 arquivos |
