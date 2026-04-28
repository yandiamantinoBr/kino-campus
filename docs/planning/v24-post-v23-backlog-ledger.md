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
| PROD-001 | P0 | Signup callback real exige conta nova e caixa de e-mail real | Runbook criado em V25; execucao ainda deve registrar evidencia em `docs/qa/reports/` |
| PROD-002 | P0 | Fluxos admin/autenticados exigem usuario comum, admin e massa real | Runbook V25 define credenciais temporarias, evidencias e limpeza pos-teste |
| PROD-003 / SEC-003 | P1 | Avatar Storage policies dependem de estado real do bucket/policies | Validar no Supabase antes de transformar script manual em migration |
| PROD-004 | P1 | Email/WhatsApp dependem de provider e secrets reais | Rodar sandbox por canal, mantendo fail-closed como default |
| PROD-005 / SEC-002 | P0/P1 | `unaccent` fora de `public` pode quebrar FTS/RPCs | Fazer spike SQL em projeto isolado antes de qualquer migration |
| SEC-001 | P0 | Leaked Password Protection e configuracao de Dashboard | Confirmar no dashboard e anexar evidencia operacional |
| SEC-004 | P1 | Scheduler externo depende de `app.settings` e runtime config | Usar `docs/ops/v19-operational-runbook.md` em ambiente controlado |
| QA-001 | P0 | Playwright E2E ainda nao e gate obrigatorio em todo PR | Definir gate por tipo de mudanca e registrar excecoes |
| QA-002 | P0 | Falta visual regression automatizado para CSS/layout | Escolher processo antes de tocar `assets/css/future-split/` |
| QA-003 | P1 | LHCI depende de ambiente compativel/CI Linux | Registrar baseline em CI e separar EPERM Windows de score real |
| QA-004 | P1 | Plano i18n/a11y antigo precisa reconciliacao com gates atuais | Auditar entregas reais antes de novo backlog de texto/UX |
| CSS-001 | P1 | Split CSS continua bloqueado por ausencia de visual regression | Manter stubs sem carregamento ate snapshots aprovados |

---

## 4. Ordem Recomendada para V25+

| Ordem | Trilha | Condicao de entrada | Saida esperada |
|---:|---|---|---|
| 1 | QA autenticado real | Credenciais e ambiente definidos | Report em `docs/qa/reports/` com signup, callback, perfil e admin |
| 2 | Supabase advisor/runbook | Acesso ao dashboard e ambiente isolado | Evidencia de `auth_leaked_password_protection`, avatar policies e `unaccent` |
| 3 | Providers externos | Secrets/sandbox de email e WhatsApp | Dispatch real controlado com rollback documentado |
| 4 | Visual/a11y regression | Ferramenta/processo escolhido | Baseline visual das 22 rotas antes de CSS |
| 5 | CSS/UX | Baseline visual aprovado | Split ou ajustes UX pequenos, reversiveis e testados |

---

## 5. Bloqueios Deliberados

- Nao aplicar SQL em producao sem ambiente isolado e rollback.
- Nao ativar provider real como default sem sandbox e logs.
- Nao mexer em CSS de producao sem baseline visual.
- Nao alterar `frontendRuntimeVersion=8.6.0` em versoes documentais.
- Nao tratar docs historicos em `docs/archive/` como backlog ativo.
