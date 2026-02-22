# Report QA — v8.2.0.7 (run1)

- Checklist base: `docs/qa/e2e-checklist.md`
- Ambiente alvo solicitado: Vercel Preview/Prod com Supabase ativo.
- Execução: **BLOQUEADA** por ausência de URLs de Preview/Prod e credenciais de teste (usuário comum/admin + acesso ao e-mail para confirmação).

## Tabela E2E (passos 1 a 9)

| Passo | Status | URL acessada | Data/hora local | Evidência (path) | Observações |
|---|---|---|---|---|---|
| 1) Cadastro | BLOQUEADO | N/D (URL Preview/Prod não informada) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/` | Sem URL publicada e sem conta de teste para iniciar cadastro. |
| 2) Confirmação de e-mail (callback) | BLOQUEADO | N/D (link de confirmação indisponível) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/` | Dependente do passo 1 + acesso à caixa de e-mail de teste. |
| 3) Login | BLOQUEADO | N/D (URL Preview/Prod não informada) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/E2E-01-login.png` (não gerado) | Sem URL e sem credenciais validadas. |
| 4) Criar post (com e sem imagem) | BLOQUEADO | N/D (URL Preview/Prod não informada) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/E2E-02-create-post.png` (não gerado) | Dependente de login funcional em Supabase. |
| 5) Abrir detalhe do post | BLOQUEADO | N/D (post não criado) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/` | Dependente do passo 4. |
| 6) Comentar | BLOQUEADO | N/D (detalhe não disponível) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/E2E-03-comment.png` (não gerado) | Dependente dos passos 4 e 5. |
| 7) Votar (hot/cold) | BLOQUEADO | N/D (post/detalhe não disponível) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/` | Dependente dos passos 4 e 5. |
| 8) Denunciar post | BLOQUEADO | N/D (post não disponível) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/E2E-04-report.png` (não gerado) | Dependente de login e post acessível. |
| 9) Acessar Admin e fechar denúncia / moderar | BLOQUEADO | N/D (admin panel inacessível sem URL/credenciais) | 2026-02-22 02:38:13 UTC | `docs/qa/evidence/v8.2.0.7-run1/ADM-01-reports-panel.png` (não gerado) | Sem conta admin de teste e sem denúncia aberta criada no passo 8. |

## Evidências esperadas para esta rodada

> Arquivos solicitados (não gerados nesta execução bloqueada):

- `docs/qa/evidence/v8.2.0.7-run1/E2E-01-login.png`
- `docs/qa/evidence/v8.2.0.7-run1/E2E-02-create-post.png`
- `docs/qa/evidence/v8.2.0.7-run1/E2E-03-comment.png`
- `docs/qa/evidence/v8.2.0.7-run1/E2E-04-report.png`
- `docs/qa/evidence/v8.2.0.7-run1/ADM-01-reports-panel.png`
