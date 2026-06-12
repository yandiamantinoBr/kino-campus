# Report V76 - KCAPI Diagnostics Extraction

**Data:** 2026-06-12
**Escopo:** JS-B do plano `docs/planning/v76-hotspot-decomposition-plan.md`
**Tipo:** extracao runtime pequena + contrato estatico
**Runtime alterado:** sim, JS + ordem de carregamento HTML

---

## 1. Objetivo

Extrair o estado e os helpers de diagnostico de create-post de
`assets/js/api/kc-api.client.js` para um submodulo dedicado, preservando:

- os 107 membros publicos de `window.KCAPI`;
- os aliases globais `window.getLastCreatePostError`, `window.setLastCreatePostError`,
  `window.clearLastCreatePostError` e `window.summarizeCreatePayloadForDiagnostics`;
- as mensagens/codigos retornados pelos diagnosticos existentes;
- a ordem de carregamento antes de `kc-api.client.js` em todos os HTMLs que usam a fachada.

---

## 2. Antes/depois medido

| Item | Antes JS-A | Depois JS-B | Delta |
|---|---:|---:|---:|
| `assets/js/api/kc-api.client.js` | 2.846 linhas / 120.212 bytes | 2.809 linhas / 119.106 bytes | -37 linhas / -1.106 bytes |
| `assets/js/api/kc-api.diagnostics.js` | inexistente | 89 linhas / 2.517 bytes | +1 modulo |
| Arquivos em `assets/js/api/` | 17 | 18 | +1 |
| Membros publicos `window.KCAPI` | 107 | 107 | 0 |
| Limite contratual do facade | <= 2.900 linhas | <= 2.825 linhas | -75 linhas de folga |
| Suites/testes Jest documentados | 168 / 3515 | 169 / 3524 | +1 suite / +9 testes |

---

## 3. Implementacao

Novo modulo:

- `assets/js/api/kc-api.diagnostics.js`
- namespace: `window._KCAPI.diagnostics`
- exports congelados:
  - `normalizeErrorForDiagnostics`
  - `summarizeCreatePayloadForDiagnostics`
  - `setLastCreatePostError`
  - `clearLastCreatePostError`
  - `getLastCreatePostError`

Mudanca na fachada:

- `kc-api.client.js` manteve os mesmos nomes publicos;
- o estado `lastCreatePostError` e a normalizacao de erro deixaram de existir na fachada;
- os wrappers publicos delegam para `window._KCAPI.diagnostics`;
- se o modulo nao carregar, o erro e explicito: `KCAPI diagnostics module not loaded.`

Mudanca de carregamento:

- 27 HTMLs reais que carregam `kc-api.client.js` passaram a carregar `kc-api.diagnostics.js`
  imediatamente antes da fachada;
- `docs/architecture/script-loading-reference.md` foi regenerado para os 26 HTMLs canonicos do
  manifest.

---

## 4. Testes adicionados/reforcados

| Teste | Papel |
|---|---|
| `tests/integration/kc-api-diagnostics-module.test.js` | cobre shape do modulo, payloads, estado congelado/copia e ordem HTML real |
| `tests/contract/kc-api-facade-contract.test.js` | confirma que a fachada delega diagnostics, nao guarda estado local e permanece com 107 membros |
| `tests/integration/kc-api-client.test.js` | continua exercitando os metodos publicos pela fachada |

---

## 5. Decisao analitica

Esta extracao foi escolhida antes de `normalizePost` porque o bloco de diagnostics tinha baixo
acoplamento externo, estado pequeno e contrato publico facil de congelar. O ganho de linhas no
hotspot e moderado, mas a mudanca prova o caminho de decomposicao com risco controlado:

1. snapshot publico antes;
2. modulo IIFE em `window._KCAPI.*`;
3. script carregado antes da fachada;
4. facade com wrappers finos;
5. teste especifico de ordem e semantica;
6. limite de crescimento reduzido depois da extracao.

`normalizePost` continua bloqueado para uma etapa posterior porque e contrato transversal de cards,
produto, busca, analytics, saved posts, mocks e adapters.

---

## 6. Proximo passo recomendado

Nao iniciar pelo normalizador principal. O proximo corte seguro e preparar contrato explicito para
`KCSessionStore`/`KCPostFreshness`, incluindo:

- storage keys usadas;
- nomes de eventos emitidos;
- comportamento cross-tab;
- deduplicacao de pending requests;
- fallback quando `BroadcastChannel` ou `localStorage` falham.

**Status 2026-06-12:** o corte `KCSessionStore`/`KCPostFreshness` foi executado no JS-C e
registrado em `docs/qa/reports/report-v76-kcapi-session-extraction-2026-06-12.md`.

---

## 7. Validacao executada

```text
node --check assets/js/api/kc-api.diagnostics.js
node --check assets/js/api/kc-api.client.js
npm test -- --runInBand tests/integration/kc-api-diagnostics-module.test.js tests/contract/kc-api-facade-contract.test.js tests/integration/kc-api-client.test.js
npm run check:structure
npm run check:scripts
npm run check:hygiene
npx playwright test --list
npm test -- --runInBand
npm run check:all
```

Resultado: **passou**.

Resumo dos gates:

- sintaxe JS: `kc-api.diagnostics.js` e `kc-api.client.js` validos;
- foco KCAPI: 3 suites / 87 testes passed;
- estrutura: 163 itens verificados + raiz `assets/js/` limpa;
- scripts: cadeia de boot validada em 26 HTMLs canonicos;
- hygiene: passed para runtime `8.6.1`;
- Playwright list: 59 testes em 9 specs;
- Jest completo: 169 suites / 3524 testes passed;
- `check:all`: passed.
