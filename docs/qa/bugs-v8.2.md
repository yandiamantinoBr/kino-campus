# Bugs QA - V8.2

Registro central de bugs da trilha V8.2 (processo e produto).

## Legenda
- Severidade: **BLOQUEADOR / ALTO / MEDIO / BAIXO**
- Status: **ABERTO / EM ANDAMENTO / RESOLVIDO**

## Tabela de bugs

| ID | Severidade | Status | Descricao objetiva | Evidencia | Link commit/PR |
|---|---|---|---|---|---|
| QA-8207-001 | BLOQUEADOR | ABERTO | Execucao completa dos fluxos autenticados/admin continua pendente apos a Run 3; nao havia credenciais confirmadas no contexto do agente e o probe controlado de signup retornou `429 over_email_send_rate_limit` | [report-v8.2.2.0-run3.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run3.md) | `codex/deep-review-it4-auth-qa-release-closure` |
| QA-8207-002 | BLOQUEADOR | ABERTO | RLS Smoke Tests 2 e 3 e o gate funcional de avatar continuam pendentes por falta de sessao autenticada confirmada; a policy manual de avatar ja foi confirmada aplicada no projeto real | [report-v8.2.2.0-run3.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run3.md) | `codex/deep-review-it4-auth-qa-release-closure` |
| QA-8207-003 | BLOQUEADOR | RESOLVIDO | Artefatos obrigatorios de QA/release foram consolidados para a rodada V8.2.2.0 | [e2e-checklist.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/e2e-checklist.md), [report-v8.2.2.0-run2.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run2.md) e [report-v8.2-final.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2-final.md) | ESTE BRANCH |
| QA-8220-001 | MEDIO | RESOLVIDO | Perfil publico deixou de disparar `400` na trilha de atividades/comentarios apos a troca do join reativo por carga em duas etapas (`comments` + batch `posts`) compativel com o schema real; o fix foi validado contra o Supabase real e publicado em preview | [report-v8.2.2.0-run3.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run3.md) e [profile-public-local-supabase-it4-fixed.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run3/profile-public-local-supabase-it4-fixed.png) | `codex/deep-review-it4-auth-qa-release-closure` |

## Observacoes
- Este arquivo nao substitui o report de execucao; ele consolida o status dos bugs.
- Atualize o campo `Link commit/PR` apos integracao/promocao final da entrega.
