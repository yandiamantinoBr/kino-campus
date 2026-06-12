# V76 - KCAPI Filters Extraction

**Data:** 2026-06-12  
**Escopo:** extracao de filtros avancados/date presets de `kc-api.client.js`  
**Branch:** `codex/refactor-kcapi-filters-v76-3`

## Resumo

O recorte JS-D moveu a logica de `KCAPI.filterPosts` para `assets/js/api/kc-api.filters.js`,
preservando a superficie publica `window.KCAPI` e mantendo `filterPosts` como metodo publico da
fachada.

O novo modulo concentra:

- filtros basicos por modulo, categoria, subcategoria, query e tags;
- `requestParams` avancados de marketplace, caronas, moradia, oportunidades e achados/perdidos;
- filtros genericos de faixa de preco;
- date presets com timezone `America/Sao_Paulo`;
- delegacao opcional para `window.KCFeedFilters` quando disponivel.

## Antes / Depois

| Item | Antes JS-D | Depois JS-D | Delta |
|---|---:|---:|---:|
| `assets/js/api/kc-api.client.js` | 2.433 linhas / 105.409 bytes | 1.769 linhas / 75.366 bytes | -664 linhas / -30.043 bytes |
| `assets/js/api/kc-api.filters.js` | inexistente | 708 linhas / 31.275 bytes | +1 modulo |
| Arquivos JS em `assets/js/api/` | 19 | 20 | +1 |
| Arquivos JS em `assets/js/` | 151 | 152 | +1 |
| Superficie publica `window.KCAPI` | 107 membros | 107 membros | sem alteracao |

## Contratos preservados

- `window.KCAPI.filterPosts(posts, params)` continua existindo e delega para `window._KCAPI.filters`.
- `window.KCAPI` segue com 107 membros publicos no snapshot de contrato.
- O client nao mantem mais helpers locais de filtros como `normalizeFilterText`,
  `matchesAdvancedRequestParams` ou `FEED_DATE_TIMEZONE`.
- Os 27 carregadores reais que usam `kc-api.client.js` carregam `kc-api.filters.js` entre
  `kc-api.session.js` e `kc-api.client.js`.
- Testes runtime que carregam `kc-api.client.js` tambem carregam `kc-api.filters.js` antes da fachada.

## Arquivos principais

- `assets/js/api/kc-api.filters.js`
- `assets/js/api/kc-api.client.js`
- 27 HTMLs com `kc-api.client.js`
- `tests/integration/kc-api-filters-module.test.js`
- `tests/contract/kc-api-facade-contract.test.js`
- `tests/integration/kc-api-client.test.js`
- `docs/architecture/script-loading-reference.md`
- `docs/planning/v76-hotspot-decomposition-plan.md`

## Validacoes

```bash
node --check assets/js/api/kc-api.filters.js
node --check assets/js/api/kc-api.client.js
npm test -- --runInBand tests/integration/kc-api-filters-module.test.js tests/contract/kc-api-facade-contract.test.js tests/integration/kc-api-client.test.js
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm test -- --runInBand
npm run check:all
npx playwright test --list
```

Resultados:

- Validacao focada: 3 suites Jest / 90 testes passaram.
- Jest completo: 171 suites / 3545 testes passaram.
- `npm run check:all` passou, incluindo versionamento, estrutura, scripts, rotas, higiene e Jest.
- Playwright listou 59 testes em 9 arquivos.
- `kc-api.client.js` ficou abaixo do novo limite de 1.800 linhas.

## Proximo recorte recomendado

O proximo recorte JS deve evitar misturar CSS ou drivers. As opcoes mais seguras agora sao:

- mocks/normalizacao de autores, com snapshot dos fixtures locais;
- preparacao de snapshot dedicado para `normalizePost` antes de qualquer extracao.

`normalizePost` continua sendo o ponto de maior risco porque normaliza o contrato transversal de posts
consumido por feed, produto, perfil, salvos e adapters.
