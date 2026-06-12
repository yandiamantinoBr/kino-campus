# V76 - KCAPI Posts Normalize Extraction

**Data:** 2026-06-12
**Escopo:** extracao de `window.KCAPI.normalizePost` para sub-modulo dedicado
**Branch:** `codex/extract-normalize-post-v76-6`

## Resumo

O recorte JS-G moveu a normalizacao de posts de `assets/js/api/kc-api.client.js` para
`assets/js/api/kc-api.posts-normalize.js`, preservando a superficie publica:

- `window.KCAPI.normalizePost(raw)` continua existindo na fachada;
- `window._KCAPI.postsNormalize.normalizePost(raw, deps)` concentra a logica extraida;
- `resolveAuthorId()` e `KC_CONSTANTS.DEFAULT_AVATAR_SVG` entram por dependencia explicita;
- os snapshots de JS-F continuam cobrindo aliases snake/camel, datas efetivas, autor legado,
  midia/metadata, avatar default e regra de `compra-venda`.

## Antes / Depois

| Item | Antes JS-G | Depois JS-G | Delta |
|---|---:|---:|---:|
| `assets/js/api/kc-api.client.js` | 1.698 linhas / 67.863 bytes | 1.529 linhas / 60.149 bytes | -169 linhas / -7.714 bytes |
| `assets/js/api/kc-api.posts-normalize.js` | inexistente | 200 linhas / 8.209 bytes | +1 modulo |
| Arquivos JS em `assets/js/` | 153 | 154 | +1 |
| Arquivos JS em `assets/js/api/` | 21 | 22 | +1 |
| `tests/integration/` | 123 suites | 124 suites | +1 |
| Jest | 173 suites / 3559 testes | 174 suites / 3567 testes | +1 suite / +8 testes |

## Arquivos principais

- `assets/js/api/kc-api.posts-normalize.js`
- `assets/js/api/kc-api.client.js`
- 27 HTMLs reais que carregam `kc-api.client.js`
- `tests/integration/kc-api-posts-normalize-module.test.js`
- `tests/integration/kc-api-normalize-post-snapshot.test.js`
- `tests/contract/kc-api-facade-contract.test.js`
- `docs/architecture/script-loading-reference.md`
- `docs/planning/v76-hotspot-decomposition-plan.md`

## Validacoes

```bash
node --check assets/js/api/kc-api.posts-normalize.js
node --check assets/js/api/kc-api.client.js
npm test -- --runInBand tests/integration/kc-api-posts-normalize-module.test.js tests/integration/kc-api-normalize-post-snapshot.test.js tests/contract/kc-api-facade-contract.test.js tests/integration/kc-api-client.test.js
npm run check:structure
npm run check:scripts
npm run check:hygiene
git diff --check
npm test -- --runInBand
npm run check:all
npx playwright test --list
```

Resultados:

- Sintaxe OK em `kc-api.posts-normalize.js` e `kc-api.client.js`.
- Suite focada de normalizacao/fachada: 4 suites / 94 testes / 3 snapshots passaram.
- `closed-posts-contract.test.js`: 1 suite / 20 testes passou mirando os campos efetivos no novo modulo.
- Jest completo sequencial: 174 suites / 3567 testes / 3 snapshots passaram.
- `npm run check:structure`: 167 itens verificados + raiz `assets/js/` limpa.
- `npm run check:scripts`: cadeia de boot validada em 26 HTMLs.
- `npm run check:hygiene`: runtime `8.6.1` aprovado.
- `git diff --check`: sem erros.
- `npm run check:all`: version, structure, scripts, routes, hygiene e Jest passaram.
- `npx playwright test --list`: 59 testes em 9 arquivos.

## Rollback

Rollback simples por PR: remover `kc-api.posts-normalize.js`, retirar os `<script defer>` adicionados,
reverter a delegacao em `kc-api.client.js` para o corpo local anterior e remover a suite dedicada
`kc-api-posts-normalize-module.test.js`. Nenhuma migration, secret, provider ou configuracao remota foi
alterada.

## Proximo recorte recomendado

Inventariar helpers residuais de rating/normalizacao ainda residentes em `kc-api.client.js` e escolher
um recorte puro, com snapshot antes da extracao e sem misturar CSS.
