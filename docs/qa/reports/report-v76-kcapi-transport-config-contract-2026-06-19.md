# Report V76.30 — contrato comportamental de `transport-config`

**Data:** 2026-06-19
**Escopo:** testes e auditoria; sem alteração de runtime, adapters, HTML, CSS, SQL, secrets ou deploy
**Runtime frontend:** `8.6.1` inalterado

## Resultado

Os quatro gates do domínio `transport-config` deixaram de ser apenas requisitos
documentais e passaram a ter evidência comportamental executável em
`tests/contract/kc-api-transport-config-contract.test.js`.

O núcleo `bootstrap-driver-core` permanece na fachada. A decisão global continua
`no-go-runtime-extraction` porque 11 dos 15 gates ainda dependem de cobertura.

## Cobertura adicionada

| Gate | Evidência |
|---|---|
| `public-setConfig-contract` | campos válidos, tipos inválidos, payload ausente e campos desconhecidos |
| `timeout-rejection-contract` | prazo configurado e rejeição canônica `KCAPI_TIMEOUT` |
| `HTTP-error-mapping` | resposta não-ok convertida em `KCAPI_HTTP_<status>` |
| `relative-baseURL-resolution` | caminho relativo e composição normalizada com `baseURL` |

A suíte também cobre sucesso de `fetchJSON`, preservação das opções de `fetch` e
propagação da rejeição original de rede antes do timeout.

## Estado dos gates

| Métrica | Resultado |
|---|---:|
| Gates totais | 15 |
| Gates cobertos | 4 |
| Gates pendentes | 11 |
| Gates pendentes em `transport-config` | 0 |
| Funções runtime alteradas | 0 |

O auditor só marca um gate como coberto quando sua evidência declarada existe no
repositório. A saída JSON/Markdown expõe `gateCoverage`, `coveredGateCount`,
`remainingGateCount` e `remainingGates`.

## Validação técnica

| Verificação | Resultado |
|---|---|
| `node --check scripts/audit-kcapi-facade-residual.js` | aprovado |
| Jest focado | 2 suites / 101 testes aprovados |
| Contrato novo | 1 suite / 8 testes aprovados |
| `npm run audit:kcapi-residual -- --json` | aprovado; 4 cobertos / 11 pendentes |
| `npm run check:all` | 181 suites / 3.638 testes / 3 snapshots aprovados |
| CI do PR #593 | aprovado: validators/Jest/Playwright list, Lighthouse (4 páginas) e Vercel Preview |

## Próxima etapa

`transport-config` pode ser reavaliado documentalmente quanto a dependências,
ordem de carregamento e rollback. Isso não autoriza criar um novo arquivo runtime
nem mover `setConfig`, `withTimeout`, `fetchJSON` ou `apiURL` nesta etapa.

## Rollback

Reverter a suíte de contrato, o mapa de evidências do auditor e a documentação.
Nenhum asset de produção precisa de rollback.
