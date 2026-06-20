# Report V76.31 — contrato comportamental de `adapter-registry`

**Data:** 2026-06-19
**Escopo:** testes e auditoria; sem alteração de runtime, adapters, HTML, CSS, SQL, secrets ou deploy
**Runtime frontend:** `8.6.1` inalterado

## Resultado

Os quatro gates de `adapter-registry` agora possuem evidência comportamental
dedicada em `tests/contract/kc-api-adapter-registry-contract.test.js`.

O domínio continua na fachada e o `bootstrap-driver-core` permanece com decisão
`no-go-runtime-extraction`. O avanço é de cobertura, não de movimentação de código.

## Cobertura adicionada

| Gate | Evidência |
|---|---|
| `adapter-registration-order` | registro mais recente substitui o adapter da mesma chave |
| `local-driver-fallback` | ambiente Supabase usa local quando o remoto não está registrado |
| `supabase-driver-selection` | ambiente Supabase seleciona o remoto quando disponível |
| `missing-adapter-fail-fast` | getter expõe `pending` e primeiro acesso falha explicitamente |

A suíte também confirma que o ambiente local preserva precedência local mesmo
quando ambos os adapters estão registrados em ordem diferente.

## Estado dos gates

| Métrica | Resultado |
|---|---:|
| Gates totais | 15 |
| Gates cobertos | 8 |
| Gates pendentes | 7 |
| Gates pendentes em `adapter-registry` | 0 |
| Funções runtime alteradas | 0 |

Os domínios `transport-config` e `adapter-registry` estão com seus gates
comportamentais completos, mas permanecem `keep-in-facade`.

## Validação técnica

| Verificação | Resultado |
|---|---|
| `node --check scripts/audit-kcapi-facade-residual.js` | aprovado |
| Jest focado | 2 suites / 98 testes aprovados |
| Contrato novo | 1 suite / 5 testes aprovados |
| `npm run audit:kcapi-residual -- --json` | aprovado; 8 cobertos / 7 pendentes |
| `npm run check:all` | 182 suites / 3.643 testes / 3 snapshots aprovados |
| CI do PR | pendente na criação deste relatório |

## Próxima etapa

Cobrir `public-error-shape-contract`, o menor gate restante, ou avançar nos
contratos de ambiente e fallback estático. Nenhuma dessas opções autoriza a
extração do núcleo enquanto houver gates pendentes.

## Rollback

Reverter a suíte, o mapa de evidências e a documentação. Nenhum asset de
produção precisa de rollback.
