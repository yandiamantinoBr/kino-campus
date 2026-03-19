# Release Final Report — Kino Campus V8.2.2.0 (Cleanroom)

## 1) Resumo executivo
- Objetivo da release: fechar o Deep Code Review de 2026-03-18 com saneamento de privacidade no perfil, hardening de banners/admin, cleanup de Storage para posts com mídia e rodada real de QA operacional.
- Resultado final: NO-GO na rodada atual.
- Data de fechamento: 2026-03-19
- Ambiente final (produção): Produção web
- URL final: `https://www.kinocampus.com.br`
- Commit final: deploy em produção sem hash exposto no front; branch local de remediação e continuidade `codex/deep-review-it3-qa-release-hardening`

## 2) O que foi corrigido nesta release
- Iteração 1 (`e94a892`): runtime deixou de depender publicamente de `profiles.email`, handles públicos passaram a derivar de nome, admin reports deixou de exibir e-mail do denunciante, admin banners perdeu `onclick` inline, checklist de QA foi saneada.
- Iteração 2 (`4844118`): cleanup de mídia de post no Storage, rollback/create-post fail-safe, delete-post fail-closed para blobs gerenciados.
- Iteração 3 (branch `codex/deep-review-it3-qa-release-hardening`): rodada real de QA público em produção, artefatos operacionais em `docs/qa/` e fallback local adicionado para a query de comentários/atividades do perfil público em `assets/js/controllers/profile.controller.js`.

## 3) Evidências de QA
### Runs executados
| Run | Data | Ambiente | Resultado | Link do relatório |
|---|---|---|---|---|
| Run 1 | N/D | Preparação documental | NÃO EXECUTADO | `docs/qa/report-v8.2.2-run1.md` |
| Run 2 | 2026-03-19 | Produção | NO-GO | `docs/qa/report-v8.2.2.0-run2.md` |

### Checklist E2E (consolidado)
- Etapa 1 Cadastro: BLOQUEADO
- Etapa 2 Confirmação de e-mail: BLOQUEADO
- Etapa 3 Login: BLOQUEADO
- Etapa 4 Criar post com mídia: BLOQUEADO
- Etapa 5 Abrir detalhe do post: PASSOU
- Etapa 6 Comentar: BLOQUEADO para fluxo autenticado; guard sem sessão observado
- Etapa 7 Votar: BLOQUEADO
- Etapa 8 Denunciar: BLOQUEADO para envio autenticado; modal de auth observado
- Etapa 9 Admin/moderação: BLOQUEADO
- Observações:
  - Home pública e detalhe público carregaram em produção.
  - Perfil público apresentou erro `400` na query de atividades/comentários.
  - A checklist oficial foi atualizada com execução real em `docs/qa/e2e-checklist.md`.

### RLS Smoke (consolidado)
- Test 1: PASSOU (`reports` anon retornou `401` via REST, sem exposição de dados)
- Test 2: BLOQUEADO (sem sessão autenticada/SQL Editor real)
- Test 3: BLOQUEADO (sem sessão autenticada/SQL Editor real)

## 4) Bugs: status final
| ID | Severidade | Status | Observações |
|---|---|---|---|
| QA-8207-001 | Bloqueador | Aberto | Fluxos autenticados/admin da checklist não puderam ser executados sem credenciais de teste reais no contexto do agente. |
| QA-8207-002 | Bloqueador | Aberto | RLS Tests 2 e 3 e gate operacional de avatar não puderam ser validados sem acesso autenticado ao ambiente real. |
| QA-8220-001 | Médio | Em andamento | Perfil público dispara `400` na query de atividades/comentários; fallback local já foi adicionado no repositório e aguarda deploy/reteste. |

## 5) Known issues (aceitos para V8.3+)
- Nenhum issue foi explicitamente aceito para V8.3+ nesta rodada; os itens remanescentes ainda bloqueiam aprovação operacional.

## 6) Decisão de release
- ( ) APROVADO (GO)
- (X) REPROVADO (NO-GO)

Assinatura (responsável pelo QA): Codex
Data: 2026-03-19
