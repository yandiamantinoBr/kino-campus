# Release Final Report - Kino Campus V8.2.2.0 (Cleanroom)

## 1) Resumo executivo
- Objetivo da release: fechar o Deep Code Review de 2026-03-18 com saneamento de privacidade no perfil, hardening de banners/admin, cleanup de Storage para posts com midia e rodada real de QA operacional.
- Resultado final: GO.
- Data de fechamento: 2026-03-19
- Ambiente final: producao promovida apos preview-first + revalidacao.
- URL final: producao [www.kinocampus.com.br](https://www.kinocampus.com.br); preview candidato final [kino-campus-jxqai7y78-yannakamurabrs-projects.vercel.app](https://kino-campus-jxqai7y78-yannakamurabrs-projects.vercel.app)
- Deploy de producao aprovado: `dpl_7iVF3EuEhnRVjvvhMDFuUMnKckmD`
- Branch local de remediacao e continuidade: `codex/deep-review-it5-auth-qa-and-promote`

## 2) O que foi corrigido nesta release
- Iteracao 1 (`e94a892`): runtime deixou de depender publicamente de `profiles.email`, handles publicos passaram a derivar de nome, admin reports deixou de exibir e-mail do denunciante, admin banners perdeu `onclick` inline, checklist de QA foi saneada.
- Iteracao 2 (`4844118`): cleanup de midia de post no Storage, rollback/create-post fail-safe, delete-post fail-closed para blobs gerenciados.
- Iteracao 3 (branch `codex/deep-review-it3-qa-release-hardening`): rodada real de QA publico em producao, artefatos operacionais em `docs/qa/` e evidencia do bug `QA-8220-001`.
- Iteracao 4 (branch `codex/deep-review-it4-auth-qa-release-closure`): correcao definitiva de `QA-8220-001`, preview novo publicado, validacao funcional do perfil contra o Supabase real sem `400` e confirmacao das policies manuais de avatar no projeto real.
- Iteracao 5 (branch `codex/deep-review-it5-auth-qa-and-promote`): rodada autenticada completa com conta comum e conta admin reais/controladas, validacao de create/delete com 1/2/5 imagens, comentario, voto, denuncia, avatar upload/delete, RLS 2/3 com JWT real, correcao do falso negativo em `admin/reports`, revalidacao em preview novo e promote com smoke final em producao.

## 3) Evidencias de QA
### Runs executados
| Run | Data | Ambiente | Resultado | Link do relatorio |
|---|---|---|---|---|
| Run 1 | N/D | Preparacao documental | NAO EXECUTADO | [report-v8.2.2-run1.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2-run1.md) |
| Run 2 | 2026-03-19 | Producao | NO-GO | [report-v8.2.2.0-run2.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run2.md) |
| Run 3 | 2026-03-19 | Preview publicado + runtime local prod-backed | NO-GO | [report-v8.2.2.0-run3.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run3.md) |
| Run 4 | 2026-03-19 | Preview publicado + producao promovida | GO | [report-v8.2.2.0-run4.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run4.md) |

### Checklist E2E (consolidado)
- Etapa 1 Cadastro: NAO REEXECUTADO NA RUN FINAL (contas preconfirmadas usadas para o gate autenticado)
- Etapa 2 Confirmacao de e-mail: NAO REEXECUTADO NA RUN FINAL (contas preconfirmadas usadas para o gate autenticado)
- Etapa 3 Login: PASSOU
- Etapa 4 Criar post com midia: PASSOU
- Etapa 5 Abrir detalhe do post: PASSOU
- Etapa 6 Comentar: PASSOU
- Etapa 7 Votar: PASSOU
- Etapa 8 Denunciar: PASSOU
- Etapa 9 Admin/moderacao: PASSOU
- Observacoes:
  - A release final foi decidida com base na Run 4, que cobriu integralmente os gates do deep review com contas reais/controladas.
  - O signup ad-hoc continuou inadequado como estrategia principal por `over_email_send_rate_limit`, mas isso deixou de bloquear o QA apos o uso de contas preconfirmadas.
  - A checklist oficial foi atualizada com execucao real em [e2e-checklist.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/e2e-checklist.md).

### RLS Smoke (consolidado)
- Test 1: PASSOU (`reports` anon retornou `401` via REST, sem exposicao de dados)
- Test 2: PASSOU (`PATCH` autenticado em `posts.author_id` recebeu `403` e nao persistiu)
- Test 3: PASSOU (mutacao autenticada em `profiles.full_name` de terceiro nao persistiu)
- Observacao complementar:
  - As policies manuais de avatar em `storage.objects` foram confirmadas presentes no projeto real e o upload/delete funcional passou na Run 4.

## 4) Bugs: status final
| ID | Severidade | Status | Observacoes |
|---|---|---|---|
| QA-8207-001 | Bloqueador | Resolvido | Fluxos autenticados/admin passaram na Run 4 com contas reais/controladas, preview validado e smoke final em producao. |
| QA-8207-002 | Bloqueador | Resolvido | Avatar funcional e RLS 2/3 passaram na Run 4 com verificacao real em banco/Storage. |
| QA-8220-001 | Medio | Resolvido | Perfil publico deixou de disparar `400` na trilha de atividades/comentarios, foi revalidado em preview e permaneceu correto apos o promote. |
| QA-8220-002 | Medio | Resolvido | `admin/reports` deixou de exibir falso negativo de persistencia apos o fallback RPC nas funcoes de verificacao. |

## 5) Known issues (aceitos para V8.3+)
- Ruido de console por script externo de terceiros e `favicon.ico` `404` continua observavel em algumas paginas, mas nao bloqueou os gates da release nem motivou rollback nesta rodada.

## 6) Decisao de release
- (X) APROVADO (GO)
- ( ) REPROVADO (NO-GO)

Assinatura (responsavel pelo QA): Codex
Data: 2026-03-19
