# V25 - Runbook de QA em Ambiente Real

**Versao:** v25.0.0
**Atualizado em:** 2026-04-28
**Escopo:** preparar execucao manual/autenticada; sem credenciais ou secrets neste arquivo

---

## 1. Objetivo

Definir uma execucao segura para validar os bloqueios P0/P1 do ledger V24 em ambiente real:
signup callback, login, perfil/avatar, criacao de post, interacoes sociais, moderacao admin, RLS,
notificacoes fail-closed e busca/feed. Este runbook nao substitui Playwright, mas organiza a evidencia
manual que depende de conta real, caixa de e-mail e permissoes admin.

---

## 2. Pre-requisitos

| Item | Requisito |
|---|---|
| URL alvo | Producao ou preview explicitamente informado no report |
| Conta comum | E-mail institucional novo ou descartavel autorizado para teste |
| Conta admin | Usuario com `is_admin=true` e acesso temporario aprovado |
| Caixa de e-mail | Acesso ao link real de confirmacao/signup callback |
| Massa de dados | Pelo menos 1 post por modulo ou permissao para criar/remover posts de teste |
| Supabase | Acesso somente-leitura ao dashboard/logs para evidencia redigida |
| Rollback | Capacidade de remover posts, reports e permissoes temporarias criadas no teste |

Nenhuma credencial, token, URL assinada ou segredo deve ser commitado.

---

## 3. Evidencia Obrigatoria

Registre tudo em `docs/qa/reports/` usando `_TEMPLATE-authenticated-run.md`.

| Tipo | Conteudo minimo |
|---|---|
| Screenshots | Signup, callback, perfil, post criado, admin/moderacao |
| Logs | Console filtrado, sem tokens ou chaves |
| Supabase | Queries/prints redigidos de profiles, posts, reports, storage e auth |
| Rede | Status dos endpoints relevantes, sem headers sensiveis |
| Decisao | Go/No-Go com motivo e pendencias |

---

## 4. Roteiro

| ID | Fluxo | Passos | Resultado esperado |
|---|---|---|---|
| AUTH-001 | Signup | Criar conta nova com e-mail institucional permitido | Usuario recebe e-mail de confirmacao |
| AUTH-002 | Callback | Abrir link real e validar `auth-callback.html` | Sessao criada sem erro visual/console critico |
| AUTH-003 | Login/logout | Sair e entrar novamente | Sessao persiste e header reflete usuario |
| PROFILE-001 | Perfil | Completar/editar dados de perfil | `profiles` atualizado sem expor dados privados |
| PROFILE-002 | Avatar | Upload, troca e remocao se permitido | Storage path consistente e UI atualizada |
| POST-001 | Criacao | Criar post em modulo seguro para teste | Post aparece no feed e em minhas publicacoes |
| POST-002 | Edicao/visibilidade | Validar estado do post criado | Sem duplicacao, sem erro de permissao indevido |
| SOCIAL-001 | Interacoes | Favoritar, comentar, votar/avaliar quando aplicavel | Estado persiste apos reload |
| ADMIN-001 | Moderacao | Reportar post e tratar no admin | Acao admin persiste e e auditavel |
| RLS-001 | Isolamento | Tentar acesso cruzado com usuario comum | Dados privados permanecem bloqueados |
| NOTIF-001 | In-app | Gerar evento notificavel | Notificacao in-app aparece ou falha de forma documentada |
| NOTIF-002 | E-mail | Validar fail-closed se provider ausente | `provider_not_configured` nao quebra fluxo |
| NOTIF-003 | WhatsApp | Validar fail-closed se provider ausente | `provider_not_configured` nao quebra fluxo |
| SEARCH-001 | Busca/feed | Buscar post criado e navegar feed | Resultado coerente sem erro de FTS |
| LHCI-001 | Lighthouse | Rodar quando ambiente permitir | Score/erro registrado sem bloquear se provider local falhar |

---

## 5. Criterios de Go/No-Go

| Decisao | Condicao |
|---|---|
| Go | AUTH-001/002/003, PROFILE-001, POST-001, ADMIN-001 e RLS-001 passam sem falha critica |
| Go com ressalva | Falhas P2 documentadas, sem vazamento de dados nem bloqueio de fluxo core |
| No-Go | Auth/callback quebrado, RLS inconsistente, admin nao persiste, erro de JS bloqueante ou exposicao de segredo |

---

## 6. Limpeza Pos-Teste

- Remover posts/reports de teste quando nao forem mais necessarios.
- Revogar permissao admin temporaria.
- Registrar IDs removidos apenas de forma redigida.
- Confirmar que nenhum token, header sensivel ou link de callback ficou em report commitado.
- Atualizar o ledger V24/V25 com o resultado real apenas depois da execucao.
