# Bugs QA — V8.2

Registro central de bugs da trilha V8.2 (processo e produto).

## Legenda
- Severidade: **BLOQUEADOR / ALTO / MÉDIO / BAIXO**
- Status: **ABERTO / EM ANDAMENTO / RESOLVIDO**

## Tabela de bugs

| ID | Severidade | Status | Descrição objetiva | Evidência | Link commit/PR |
|---|---|---|---|---|---|
| QA-8207-001 | BLOQUEADOR | ABERTO | Execução completa dos fluxos autenticados/admin (cadastro, callback, login, create com mídia, voto, denúncia efetiva e moderação) não ocorreu na Run 2 por ausência de credenciais de teste reais no contexto do agente | `docs/qa/report-v8.2.2.0-run2.md` (seção 4) | PENDENTE |
| QA-8207-002 | BLOQUEADOR | ABERTO | RLS Smoke Tests 2 e 3 e gate operacional de avatar não foram validados na Run 2 por falta de sessão autenticada/SQL Editor real e por ausência de confirmação operacional da policy manual de avatar | `docs/qa/report-v8.2.2.0-run2.md` (seções 4.1 e 5) | PENDENTE |
| QA-8207-003 | BLOQUEADOR | RESOLVIDO | Artefatos obrigatórios de QA/release foram consolidados para a rodada V8.2.2.0 | `docs/qa/e2e-checklist.md`, `docs/qa/report-v8.2.2.0-run2.md` e `docs/qa/report-v8.2-final.md` | ESTE BRANCH |
| QA-8220-001 | MÉDIO | EM ANDAMENTO | Perfil público dispara `400` na query de atividades/comentários com join `posts!comments_post_id_fkey`; fallback local foi adicionado no repositório e aguarda deploy/reteste | `docs/qa/report-v8.2.2.0-run2.md` (seções 4.1 e 7) e `output/playwright/evidence/v8.2.2.0-run2/E2E-profile-public.png` | `codex/deep-review-it3-qa-release-hardening` |

## Observações
- Este arquivo não substitui o report de execução; ele consolida status dos bugs.
- Atualize o campo “Link commit/PR” após integração/deploy da entrega.
