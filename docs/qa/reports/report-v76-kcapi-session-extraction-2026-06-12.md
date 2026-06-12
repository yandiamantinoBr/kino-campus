# Report V76 - KCAPI Session/Freshness Extraction

**Data:** 2026-06-12
**Escopo:** JS-C do plano `docs/planning/v76-hotspot-decomposition-plan.md`
**Branch:** `codex/refactor-kcapi-session-freshness-v76-2`

## Resumo

Esta etapa extraiu o bloco de session cache, SWR helpers e freshness de posts de
`assets/js/api/kc-api.client.js` para `assets/js/api/kc-api.session.js`, preservando:

- `window.KCSessionStore`;
- `window.KCPostFreshness`;
- helpers internos usados pela fachada via `window._KCAPI.session`;
- storage keys `kc:9.0.0:*`;
- evento `kc:post-freshness`;
- canais `kc_post_freshness_event`, `kc-post-freshness-v1` e `kc-posts-changes`;
- superficie publica `window.KCAPI` com 107 membros.

## Medicao

| Item | Antes JS-C | Depois JS-C | Delta |
|---|---:|---:|---:|
| `assets/js/api/kc-api.client.js` | 2.809 linhas / 119.106 bytes | 2.433 linhas / 105.409 bytes | -376 linhas / -13.697 bytes |
| `assets/js/api/kc-api.session.js` | inexistente | 454 linhas / 15.031 bytes | +1 modulo |
| Arquivos JS em `assets/js/api/` | 18 | 19 | +1 |
| Arquivos JS em `assets/js/` | 150 | 151 | +1 |
| Suites/testes Jest | 169 / 3524 | 170 / 3535 | +1 suite / +11 testes |

## Contratos preservados

| Contrato | Evidencia |
|---|---|
| `KCAPI` continua fachada publica congelada | `tests/contract/kc-api-facade-contract.test.js` mantem snapshot de 107 membros |
| `KCSessionStore` continua global | `tests/integration/kc-api-session-module.test.js` valida `version`, `key`, `get`, `set`, `remove`, `clearPrefix`, `clearScopes`, `getStore` |
| Storage keys seguem estaveis | teste valida `kc:9.0.0:feeds:snapshot` |
| Helpers SWR continuam disponiveis para submodulos | fachada delega `getCachedSessionPayload`, `persistSessionPayload`, `removeSessionCache`, `clearSessionCachePrefix`, `withPendingSessionRequest` |
| `KCPostFreshness` continua global | teste valida `emit`, `subscribe`, `clearContentCaches`, `normalize` |
| Deduplicacao por `eventId` preservada | teste chama `dispatchPostFreshness` duas vezes e espera um unico subscriber |
| Realtime broadcast preservado | teste valida topico `kc-posts-changes`, `self:false`, evento `post_change` e payload sem campos privados |
| Ordem de carregamento real preservada | 27 HTMLs reais incluem `kc-api.session.js` entre diagnostics e `kc-api.client.js` |

## Arquivos principais alterados

- `assets/js/api/kc-api.session.js`
- `assets/js/api/kc-api.client.js`
- 27 HTMLs que carregam `kc-api.client.js`
- `tests/integration/kc-api-session-module.test.js`
- `tests/contract/kc-api-facade-contract.test.js`
- `docs/architecture/script-loading-reference.md`
- documentos ativos de arquitetura, estrategia de testes, estrutura e reports

## Validacao local executada

```bash
node --check assets/js/api/kc-api.session.js
node --check assets/js/api/kc-api.client.js
npm test -- --runInBand tests/integration/kc-api-session-module.test.js tests/contract/kc-api-facade-contract.test.js tests/integration/content-freshness.test.js tests/integration/kc-api-session-swr.test.js tests/integration/kc-api-client.test.js
npm test -- --runInBand
npm run check:all
npx playwright test --list
```

Resultado medido:

- sintaxe JS valida;
- suites focadas: 5 suites / 104 testes passed;
- Jest completo: 170 suites / 3535 testes passed.
- `check:all`: version, structure, scripts, routes, hygiene e Jest passed;
- Playwright list: 9 specs / 59 testes listados.

## Proximo recorte recomendado

O recorte seguinte foi executado em JS-D com `kc-api.filters.js`. Nao iniciar por `normalizePost`
sem snapshot dedicado. A proxima entrega deve escolher mocks/normalizacao de autores ou preparar
contrato estatico para a propria normalizacao antes da extracao.
