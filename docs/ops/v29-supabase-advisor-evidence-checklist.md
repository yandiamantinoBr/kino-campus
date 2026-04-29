# V29 - Checklist de Evidencias Supabase Advisor

**Versao:** v29.0.0
**Atualizado em:** 2026-04-28
**Escopo:** evidencia operacional; sem alterar dashboard, SQL ou secrets

---

## 1. Objetivo

Padronizar a coleta de evidencia para pendencias operacionais do Supabase antes de qualquer mudanca:
`auth_leaked_password_protection`, avatar storage policies e scheduler de notificacoes. Este documento
nao autoriza alteracao; ele define o que precisa ser comprovado, redigido e anexado.

---

## 2. Regras de Evidencia

| Regra | Motivo |
|---|---|
| Redigir project ID, e-mails reais, tokens e URLs assinadas | Evita vazamento operacional |
| Registrar estado antes/depois apenas quando houver aprovacao de mudanca | Evita confundir observacao com execucao |
| Separar print de dashboard de SQL/log | Facilita revisao e rollback |
| Marcar item como Bloqueado se faltar acesso | Nao falsear sucesso operacional |
| Anexar caminho do report em `docs/qa/reports/` | Mantem rastreabilidade sem misturar secrets |

---

## 3. Auth Dashboard

| Item | Evidencia minima | Status |
|---|---|---|
| Projeto correto selecionado | Nome/ambiente redigido | Pendente |
| Auth/Security acessivel | Print redigido da tela ou descricao auditavel | Pendente |
| `auth_leaked_password_protection` | Estado atual: ativo/inativo/indisponivel | Pendente |
| Plano do projeto permite ativacao | Confirmacao visual ou bloqueio documentado | Pendente |
| Rollback conhecido | Caminho para retornar estado anterior | Pendente |

Mudanca de estado so deve ocorrer com aprovacao explicita do owner do projeto.

---

## 4. Avatar Storage

Fonte atual: `supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql`.

| Item | Evidencia minima | Status |
|---|---|---|
| Bucket `kino-media` existe | Print/query redigida | Pendente |
| Prefixo `profile-avatars/{userId}/...` usado pelo app | Evidencia de upload/update/delete controlado | Pendente |
| Policy de insert | Nome da policy e condicoes redigidas | Pendente |
| Policy de update | Nome da policy e condicoes redigidas | Pendente |
| Policy de delete | Nome da policy e condicoes redigidas | Pendente |
| Acesso cruzado bloqueado | Usuario B nao altera/deleta avatar do usuario A | Pendente |

Nao converter o script manual em migration sem uma rodada real de avatar e rollback aprovado.

---

## 5. Scheduler de Notificacoes

Superficies atuais: `public.notification_dispatch_runtime` e `app.settings.kc_notification_dispatch_*`.

| Item | Evidencia minima | Status |
|---|---|---|
| Row `slot='primary'` | Query redigida sem segredo | Pendente |
| `function_url` configurada | Dominio/rota redigidos; sem token | Pendente |
| `dispatch_secret` presente | Apenas booleano/presenca, nunca valor | Pendente |
| `batch_limit` coerente | Valor ou default documentado | Pendente |
| Dry-run/manual dispatch | Log redigido de `notification_dispatch_runs` | Pendente |
| Fail-closed sem provider | `provider_not_configured` nao quebra fluxo | Pendente |

---

## 6. Saida Esperada

Criar um report em `docs/qa/reports/report-v29-supabase-advisor-run1.md` com:

- ambiente alvo;
- responsavel;
- itens Passou/Falhou/Bloqueado;
- evidencias redigidas;
- decisao Go/No-Go por item;
- rollback quando houver mudanca aprovada.

---

## 7. Bloqueios

- Nao registrar secrets, service role keys, JWTs, signed URLs ou magic links.
- Nao aplicar SQL em producao durante coleta de evidencia.
- Nao ativar provider externo como efeito colateral.
- Nao tratar ausencia de acesso como sucesso.
- Nao substituir o runbook V19; este checklist complementa a coleta de evidencia.
