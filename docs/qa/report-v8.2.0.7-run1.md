# Report QA — v8.2.0.7 (run1)

## Metadados obrigatórios

| Campo | Valor |
|---|---|
| Ambiente | **Preview/Prod** (execução solicitada), porém **não disponibilizado para validação** |
| URL base | **N/D** (nenhuma URL Preview/Prod informada) |
| Data/hora (timezone local) | **2026-02-22 02:56:34 UTC+0000** |
| Conta usuário comum | **N/D** (credencial não fornecida) |
| Conta admin | **N/D** (credencial não fornecida) |
| Status do webhook | **N/D** (não foi possível confirmar ativo/inativo sem acesso ao ambiente) |
| Caminho de armazenamento das evidências | `docs/qa/evidence/v8.2.0.7-run1/` |

## Execução E2E

Status consolidado: **BLOQUEADA** por ausência de URL base publicada (Preview/Prod) e ausência de contas de teste (usuário comum + admin).

| Caso E2E | Resultado | Evidência (arquivo) | Caminho completo | Observações |
|---|---|---|---|---|
| E2E-01 — Login | BLOQUEADO | `E2E-01-login.png` | `docs/qa/evidence/v8.2.0.7-run1/E2E-01-login.png` | Sem URL e sem credenciais válidas. |
| E2E-02 — Criar post | BLOQUEADO | `E2E-02-create-post.png` | `docs/qa/evidence/v8.2.0.7-run1/E2E-02-create-post.png` | Dependente de login funcional. |
| E2E-03 — Comentar | BLOQUEADO | `E2E-03-comment.png` | `docs/qa/evidence/v8.2.0.7-run1/E2E-03-comment.png` | Dependente de post criado e sessão autenticada. |
| E2E-04 — Denunciar post | BLOQUEADO | `E2E-04-report.png` | `docs/qa/evidence/v8.2.0.7-run1/E2E-04-report.png` | Dependente de post acessível e usuário autenticado. |
| ADM-01 — Painel de reports/moderação | BLOQUEADO | `ADM-01-reports-panel.png` | `docs/qa/evidence/v8.2.0.7-run1/ADM-01-reports-panel.png` | Sem conta admin e sem ambiente acessível. |

## Execução RLS Smoke

Referência de roteiro: `docs/qa/rls-smoke.sql`.

| Teste RLS | Resultado | Evidência (arquivo) | Caminho completo | Referência de print |
|---|---|---|---|---|
| RLS-01 — reports anon select | BLOQUEADO | `RLS-01-test1.png` | `docs/qa/evidence/v8.2.0.7-run1/RLS-01-test1.png` | Print planejado para captura de execução do teste 1 |
| RLS-02 — posts.author_id update | BLOQUEADO | `RLS-02-test2.png` | `docs/qa/evidence/v8.2.0.7-run1/RLS-02-test2.png` | Print planejado para captura de execução do teste 2 |
| RLS-03 — profiles insert mismatched id | BLOQUEADO | `RLS-03-test3.png` | `docs/qa/evidence/v8.2.0.7-run1/RLS-03-test3.png` | Print planejado para captura de execução do teste 3 |

## Execução de limiar/webhook

**N/A (justificado).**

Não foi possível executar cenários de limiar e webhook, porque o ambiente alvo (Preview/Prod), URL base e credenciais não foram fornecidos nesta rodada. Sem acesso ao fluxo funcional (criação/denúncia/moderação), não há como observar disparo de webhook nem validar status ativo/inativo com evidência executada.

## Lista de bugs

### Bloqueadores

1. **BLOQ-01 — Impossibilidade de execução QA ponta a ponta**  
   Sem URL de ambiente (Preview/Prod) e sem credenciais (usuário/admin), a rodada não consegue validar regressão funcional nem segurança (RLS).

### Não bloqueadores

- Nenhum bug funcional adicional identificado nesta rodada, pois não houve execução efetiva dos cenários.

## Conclusão

## Apto para 8.2.2.0? **NÃO**

**Justificativa:** a rodada v8.2.0.7-run1 ficou bloqueada em pré-condições essenciais (ambiente, contas e validação de webhook). Sem execução E2E, sem smoke RLS efetivo e sem evidências reais de comportamento em runtime, não há base de qualidade para declarar aptidão da versão 8.2.2.0.
