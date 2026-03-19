# Bugs QA - V8.2

Registro central de bugs da trilha V8.2 (processo e produto).

## Legenda
- Severidade: **BLOQUEADOR / ALTO / MEDIO / BAIXO**
- Status: **ABERTO / EM ANDAMENTO / RESOLVIDO**

## Tabela de bugs

| ID | Severidade | Status | Descricao objetiva | Evidencia | Link commit/PR |
|---|---|---|---|---|---|
| QA-8207-001 | BLOQUEADOR | RESOLVIDO | A Run 4 executou com sucesso os fluxos autenticados e admin com contas reais/controladas em preview, revalidou o candidate final e ainda aplicou smoke em producao apos o promote | [report-v8.2.2.0-run4.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run4.md) | `codex/deep-review-it5-auth-qa-and-promote` |
| QA-8207-002 | BLOQUEADOR | RESOLVIDO | A Run 4 aprovou os RLS Tests 2 e 3 com JWT real e concluiu o gate funcional de avatar com upload/delete e cleanup verificado em `storage.objects` | [report-v8.2.2.0-run4.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run4.md) | `codex/deep-review-it5-auth-qa-and-promote` |
| QA-8207-003 | BLOQUEADOR | RESOLVIDO | Artefatos obrigatorios de QA/release foram consolidados para a rodada V8.2.2.0 | [e2e-checklist.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/e2e-checklist.md), [report-v8.2.2.0-run2.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run2.md) e [report-v8.2-final.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2-final.md) | ESTE BRANCH |
| QA-8220-001 | MEDIO | RESOLVIDO | Perfil publico deixou de disparar `400` na trilha de atividades/comentarios apos a troca do join reativo por carga em duas etapas (`comments` + batch `posts`) compativel com o schema real; o fix foi validado em preview e passou no smoke pos-promote em producao | [report-v8.2.2.0-run4.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run4.md) e [profile-public-local-supabase-it4-fixed.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run3/profile-public-local-supabase-it4-fixed.png) | `codex/deep-review-it5-auth-qa-and-promote` |
| QA-8220-002 | MEDIO | RESOLVIDO | `admin/reports` exibia falso negativo de persistencia quando leituras diretas em `reports`/`posts` eram bloqueadas por permissao; a verificacao passou a usar fallback RPC e foi revalidada em preview novo antes do promote | [report-v8.2.2.0-run4.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run4.md) e [run4-admin-reports-persistence-warning.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run4/run4-admin-reports-persistence-warning.png) | `codex/deep-review-it5-auth-qa-and-promote` |

## Observacoes
- Este arquivo nao substitui o report de execucao; ele consolida o status dos bugs.
- Atualize o campo `Link commit/PR` apos integracao/promocao final da entrega.
