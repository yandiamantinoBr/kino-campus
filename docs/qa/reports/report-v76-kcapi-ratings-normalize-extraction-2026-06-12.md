# V76 - KCAPI Ratings Normalize Extraction

**Data:** 2026-06-12
**Escopo:** extracao dos normalizadores `normalizeUserRating*` para o submodulo de ratings
**Branch:** `codex/extract-rating-normalize-v76-7`

## Resumo

O recorte JS-H moveu a normalizacao de payloads de ratings de `assets/js/api/kc-api.client.js`
para `assets/js/api/kc-api.ratings.js`, preservando a superficie publica:

- `window.KCAPI.normalizeUserRatingSummary(raw, fallbackUserId)` continua existindo na fachada;
- `window.KCAPI.normalizeUserRatingEntry(raw)` continua existindo na fachada;
- `window.KCAPI.normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId)` continua existindo na fachada;
- `window.KCAPI.normalizeUserRatingList(raw, fallbackPage, fallbackLimit)` continua existindo na fachada;
- `window._KCAPI.ratings.normalizeUserRating*` concentra a logica extraida;
- `buildRatingsDeps()` ficou restrito a `getActiveDriver`, porque a normalizacao passou a ser responsabilidade local do submodulo.

## Antes / Depois

| Item | Antes JS-H | Depois JS-H | Delta |
|---|---:|---:|---:|
| `assets/js/api/kc-api.client.js` | 1.529 linhas / 58.646 bytes | 1.508 linhas / 58.290 bytes | -21 linhas / -356 bytes |
| `assets/js/api/kc-api.ratings.js` | 113 linhas / 4.880 bytes | 160 linhas / 7.261 bytes | +47 linhas / +2.381 bytes |
| Arquivos JS em `assets/js/` | 154 | 154 | 0 |
| Arquivos JS em `assets/js/api/` | 22 | 22 | 0 |
| `tests/integration/` | 124 suites | 124 suites | 0 |
| Jest | 174 suites / 3567 testes | 174 suites / 3570 testes | +3 testes |

## Arquivos principais

- `assets/js/api/kc-api.ratings.js`
- `assets/js/api/kc-api.client.js`
- `tests/integration/kc-api-ratings-module.test.js`
- `tests/contract/kc-api-facade-contract.test.js`
- `tests/integration/kc-api-client.test.js`
- `docs/planning/v76-hotspot-decomposition-plan.md`
- `docs/architecture.md`
- `docs/architecture/module-catalog.md`

## Validacoes

```bash
node --check assets/js/api/kc-api.ratings.js
node --check assets/js/api/kc-api.client.js
npm test -- --runInBand tests/integration/kc-api-ratings-module.test.js tests/contract/kc-api-facade-contract.test.js tests/integration/kc-api-client.test.js
git diff --check
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm test -- --runInBand
npm run check:all
npx playwright test --list
```

Resultados:

- Sintaxe OK em `kc-api.ratings.js` e `kc-api.client.js`.
- Suite focada de ratings/fachada: 3 suites / 104 testes passaram.
- `git diff --check`: sem erros.
- `npm run check:structure`: 167 itens verificados + raiz `assets/js/` limpa.
- `npm run check:scripts`: cadeia de boot validada em 26 HTMLs.
- `npm run check:hygiene`: runtime `8.6.1` aprovado.
- Jest completo sequencial: 174 suites / 3570 testes / 3 snapshots passaram.
- `npm run check:all`: version, structure, scripts, routes, hygiene e Jest passaram.
- `npx playwright test --list`: 59 testes em 9 arquivos.

## Rollback

Rollback simples por PR: devolver os corpos dos quatro normalizadores para `kc-api.client.js`,
remover os exports `normalizeUserRating*` de `kc-api.ratings.js`, restaurar a injecao dos
normalizadores em `buildRatingsDeps()` e reverter a suite `kc-api-ratings-module.test.js` para a
semantica anterior. Nenhuma migration, secret, provider, HTML ou configuracao remota foi alterada.

## Proximo recorte recomendado

Escolher uma trilha unica: inventario CSS de ownership de `styles.css` ou inventario residual
menor da fachada `KCAPI` focado em wrappers/bootstrap. Nao misturar JS e CSS no mesmo PR.
