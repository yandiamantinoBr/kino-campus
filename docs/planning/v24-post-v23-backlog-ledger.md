# V24 - Ledger Pos-V23 de Pendencias

**Versao:** v24.0.0
**Atualizado em:** 2026-04-28
**Escopo:** consolidacao documental, sem alteracao funcional

---

## 1. Objetivo

Registrar o estado real do backlog mapeado em V18 depois das execucoes V19-V23. Este ledger evita
que itens ja tratados continuem parecendo pendencias ativas e separa o que ainda depende de ambiente
real, provider externo, credenciais, dashboard Supabase ou gate visual.

---

## 2. Itens Resolvidos por Versao

| Item | Status pos-V23 | Evidencia |
|---|---|---|
| DOC-001 `docs/env-vars.md` | Resolvido em V19; reancorado para V24 nesta versao | `docs/env-vars.md` |
| DOC-002 `docs/db-schema.md` | Resolvido em V19; baseline documental reancorado para V24 nesta versao | `docs/db-schema.md` |
| DOC-003 READMEs `assets/js/` | Resolvido em V19 | READMEs indicam estado consolidado pos-V14/V15 |
| DOC-004 separacao `docs/qa/` | Resolvido em V20 | `docs/qa/README.md`, `docs/archive/qa-legacy/_INDEX.md` |
| DOC-005 relatorios historicos na raiz | Resolvido em V22 e mantido em V24 | `docs/archive/relatorios/_INDEX.md` |
| DOC-007 `package.json` | Resolvido em V19; descricao reancorada para V24 nesta versao | `package.json` |
| DOC-008 `repository-structure.md` | Resolvido em V23 | `docs/architecture/repository-structure.md` |
| REP-001 `.claude/worktrees` rastreada | Resolvido em V21 | `docs/archive/claude-worktree-v9/` |
| REP-002 crescimento de relatorios raiz | Resolvido em V22 e mantido em V24 | janela raiz V20-V24 |
| REP-003 ruido de busca por historico ativo | Resolvido em V20/V21 | `docs/archive/qa-legacy/`, `docs/archive/claude-worktree-v9/` |

---

## 3. Pendencias Ainda Ativas

Estas pendencias nao devem ser "corrigidas" por edicao documental. Elas exigem ambiente, credenciais,
provider externo, dashboard ou decisao de gate.

| ID | Prioridade | Motivo de permanencia | Proximo passo seguro |
|---|---|---|---|
| PROD-001 | P0 | Signup callback real exige conta nova e caixa de e-mail real | Matriz V31 prioriza AUTH-001/002/003 e report V26 define evidencia redigida em `docs/qa/reports/` |
| PROD-002 | P0 | Fluxos admin/autenticados exigem usuario comum, admin e massa real | Matriz V31 separa perfil, posts, social, admin, RLS, busca e notificacoes com Go/No-Go por fluxo |
| PROD-003 / SEC-003 | P1 | Avatar Storage policies dependem de estado real do bucket/policies | Checklist V29 define evidencias; validar no Supabase antes de transformar script manual em migration |
| PROD-004 | P1 | Email/WhatsApp dependem de provider e secrets reais | Checklist V30 define sandbox por canal, Go/No-Go, evidencias redigidas e fail-closed como default |
| PROD-005 / SEC-002 | P0/P1 | `unaccent` fora de `public` pode quebrar FTS/RPCs | Auditoria estatica criada em V28; proximo passo e spike SQL em projeto isolado antes de qualquer migration |
| SEC-001 | P0 | Leaked Password Protection e configuracao de Dashboard | Checklist V29 define evidencia; confirmar no dashboard antes de mudar estado |
| SEC-004 | P1 | Scheduler externo depende de `app.settings` e runtime config | Checklist V29 complementa `docs/ops/v19-operational-runbook.md` em ambiente controlado |
| QA-001 | P0 | Playwright E2E ainda nao e gate obrigatorio em todo PR | Politica V32 define obrigatorio/recomendado/dispensavel por tipo de mudanca e excecoes aceitas |
| QA-002 | P0 | Falta visual regression automatizado para CSS/layout | Gate minimo definido em V27; baseline visual ainda precisa ser executado antes de CSS |
| QA-003 | P1 | LHCI depende de ambiente compativel/CI Linux | Politica V33 separa score real, ambiente Windows/EPERM, preview protegido e pendencia CI/Linux |
| QA-004 | P1 | Plano i18n/a11y antigo precisa reconciliacao com gates atuais | Plano V34 define fontes, rotas, dimensoes e criterios antes de abrir backlog de texto/UX |
| CSS-001 | P1 | Split CSS continua bloqueado por ausencia de baseline visual executado | Ledger V35 define gates V27/V32/V33/V34, rollback e escopos permitidos antes de CSS |

---

## 4. Ordem Recomendada para V25+

| Ordem | Trilha | Condicao de entrada | Saida esperada |
|---:|---|---|---|
| 1 | QA autenticado real | Credenciais, ambiente e matriz V31 definidos | Report `report-v26-auth-runN.md` com signup, callback, perfil, admin e Go/No-Go por fluxo |
| 2 | Supabase advisor/runbook | Acesso ao dashboard e ambiente isolado | Evidencia de `auth_leaked_password_protection`, avatar policies e `unaccent` |
| 3 | Providers externos | Checklist V30 aprovado e sandbox de email/WhatsApp disponivel | Dispatch real controlado com rollback documentado |
| 4 | Visual/a11y regression | Gate V27 aprovado e ambiente definido | Baseline visual das 22 rotas antes de CSS |
| 5 | CSS/UX | Baseline visual aprovado | Split ou ajustes UX pequenos, reversiveis e testados |

---

## 5. Bloqueios Deliberados

- Nao aplicar SQL em producao sem ambiente isolado e rollback.
- Nao ativar provider real como default sem sandbox e logs.
- Nao mexer em CSS de producao sem baseline visual.
- Nao alterar `frontendRuntimeVersion=8.6.0` em versoes documentais.
- Nao tratar docs historicos em `docs/archive/` como backlog ativo.
