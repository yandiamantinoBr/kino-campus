# V76 - KCAPI Authors Extraction

**Data:** 2026-06-12  
**Escopo:** extracao de `MOCK_USERS`, indices e resolucao de autor legado de `kc-api.client.js`  
**Branch:** `codex/refactor-kcapi-authors-v76-4`

## Resumo

O recorte JS-E moveu a logica de usuarios mock e lookup de autores para
`assets/js/api/kc-api.authors.js`, preservando a superficie publica `window.KCAPI` e mantendo:

- `window.KCAPI.MOCK_USERS`
- `window.KCAPI.MOCK_USERS_BY_ID`
- `window.KCAPI.MOCK_USERS_LIST`
- `window.KCAPI.getAuthorById(id)`

O novo modulo concentra:

- 42 usuarios mock canonicos + `USER_SELF`;
- indice por ID usado pelos adapters locais;
- indice legado por `displayName::avatarUrl` e fallback por nome;
- `normalizeUserProfile()`;
- `resolveAuthorId()` usado por `normalizePost()`.

## Antes / Depois

| Item | Antes JS-E | Depois JS-E | Delta |
|---|---:|---:|---:|
| `assets/js/api/kc-api.client.js` | 1.769 linhas / 75.366 bytes | 1.698 linhas / 67.863 bytes | -71 linhas / -7.503 bytes |
| `assets/js/api/kc-api.authors.js` | inexistente | 116 linhas / 6.824 bytes | +1 modulo |
| Arquivos JS em `assets/js/api/` | 20 | 21 | +1 |
| Arquivos JS em `assets/js/` | 152 | 153 | +1 |
| Superficie publica `window.KCAPI` | 107 membros | 107 membros | sem alteracao |

## Contratos preservados

- `window.KCAPI` segue com 107 membros publicos no snapshot de contrato.
- `MOCK_USERS*` continuam acessiveis em `window.KCAPI` como getters publicos.
- `getAuthorById()` continua retornando perfil congelado com aliases `name/avatar` e
  `displayName/avatarUrl`.
- `normalizePost()` continua resolvendo `authorId` a partir de `autor`/`autorAvatar` legados.
- Os 27 carregadores reais que usam `kc-api.client.js` carregam `kc-api.authors.js` entre
  `kc-api.filters.js` e `kc-api.client.js`.

## Arquivos principais

- `assets/js/api/kc-api.authors.js`
- `assets/js/api/kc-api.client.js`
- 27 HTMLs com `kc-api.client.js`
- `tests/integration/kc-api-authors-module.test.js`
- `tests/contract/kc-api-facade-contract.test.js`
- `tests/integration/kc-api-client.test.js`
- `docs/architecture/script-loading-reference.md`
- `docs/planning/v76-hotspot-decomposition-plan.md`

## Validacoes

```bash
node --check assets/js/api/kc-api.authors.js
node --check assets/js/api/kc-api.client.js
npm test -- --runInBand tests/integration/kc-api-authors-module.test.js tests/contract/kc-api-facade-contract.test.js tests/integration/kc-api-client.test.js
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm test -- --runInBand
npm run check:all
npx playwright test --list
```

Resultados:

- Validacao focada: 3 suites Jest / 91 testes passaram.
- Jest completo: 172 suites / 3555 testes passaram.
- `npm run check:all` passou, incluindo versionamento, estrutura, scripts, rotas, higiene e Jest.
- Playwright listou 59 testes em 9 arquivos.
- `kc-api.client.js` ficou abaixo do novo limite de 1.710 linhas.

## Status posterior

O snapshot dedicado de `normalizePost` foi preparado no recorte JS-F
(`report-v76-kcapi-normalize-post-snapshot-2026-06-12.md`). A proxima entrega JS pode extrair
`normalizePost` para sub-modulo proprio, mantendo a delegacao publica em `window.KCAPI.normalizePost`.
