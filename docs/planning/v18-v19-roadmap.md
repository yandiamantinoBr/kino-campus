# V18 -> V19 Roadmap

**Versao:** v18.6.0  
**Atualizado em:** 2026-04-28  
**Objetivo:** transformar o inventario V18 em trilhas seguras para detalhamento e implementacao na V19

---

## 1. Principio de Execucao V19

A V19 deve executar somente intervencoes pequenas, verificaveis e reversiveis. Cada trilha precisa preservar:

- `frontendRuntimeVersion=8.6.0`
- 134 suites / 3046 testes como piso minimo
- `npm run check:all` 5/5 verde
- zero mudanca visual sem evidencia de QA
- zero SQL improvisado fora de `supabase/migrations/` ou runbook aprovado

## 2. Sequencia Recomendada

| Ordem | Trilha V19 | Prioridade | Resultado esperado |
|---:|---|---|---|
| 1 | V19.1 - Documentacao canonica e higiene ativa | P1 | Docs ativos deixam de apontar v10/v11/v14/v15 como estado atual |
| 2 | V19.2 - QA operacional autenticado | P0 | Signup callback, login, admin e RLS autenticado com evidencia real |
| 3 | V19.3 - Hardening Supabase/Vercel | P0 | Advisor residuals e configs fora do git tratados com runbook/ambiente isolado |
| 4 | V19.4 - Notificacoes externas go-live | P1 | Email/WhatsApp testados por canal com provider real/sandbox e rollback |
| 5 | V19.5 - Malha visual/a11y/Lighthouse | P1 | Base de visual regression e LHCI atual antes de mexer em CSS |
| 6 | V19.6 - CSS/UX backlog controlado | P1/P2 | Split CSS ou ajustes UX apenas depois dos gates visuais |

## 3. Trilhas Detalhadas

### V19.1 - Documentacao canonica e higiene ativa

Arquivos candidatos:

- `docs/env-vars.md`
- `docs/db-schema.md`
- `docs/qa/README.md`
- `docs/qa/reports/README.md`
- READMEs em `assets/js/**/README.md`
- `.claude/worktrees/serene-germain`

Entregas:

- Atualizar baselines documentais para V18/V19.
- Separar docs ativos de historicos em `docs/qa/`.
- Definir politica para relatorios raiz e artefatos `.claude`.
- Manter `docs/archive/` como destino de historico consolidado.

### V19.2 - QA operacional autenticado

Entregas:

- Criar plano de credenciais de teste com conta comum e conta admin.
- Executar signup novo com confirmacao real de e-mail.
- Validar `auth-callback.html` em producao/preview.
- Reexecutar fluxos autenticados: criar post, editar perfil/avatar, favoritar, comentar, avaliar, denunciar e moderar.
- Registrar evidencias em `docs/qa/reports/`.

### V19.3 - Hardening Supabase/Vercel

Entregas:

- Confirmar leaked password protection no Supabase Dashboard.
- Projetar tratamento de `unaccent` fora de `public` em banco isolado.
- Validar avatar policies no ambiente real.
- Criar runbook de `notification_dispatch_runtime` e `app.settings`.
- Distinguir ruido de preview Vercel de regressao funcional.

### V19.4 - Notificacoes externas

Entregas:

- Definir provider/sandbox de e-mail e WhatsApp.
- Configurar secrets por ambiente.
- Rodar dispatch manual controlado.
- Validar templates, rate limit, opt-in/opt-out e logs.
- Documentar rollback para `provider_not_configured`/fail-closed.

### V19.5 - Malha visual/a11y/Lighthouse

Entregas:

- Definir ferramenta ou processo de snapshot visual para 22 HTMLs.
- Rodar Playwright E2E como gate separado e documentado.
- Atualizar baseline Lighthouse pos-V18 em CI Linux.
- Reconciliar `docs/i18n-a11y-uxwriting-plan.md` com gates atuais.

### V19.6 - CSS/UX backlog controlado

Entregas:

- Executar selector audit antes de qualquer split.
- Planejar links CSS dos 22 HTMLs somente apos snapshots aprovados.
- Manter `assets/css/future-split/` como stub ate validacao completa.
- Priorizar ajustes UX observados em QA real, nao por suposicao.

## 4. Gates Obrigatorios por PR V19

| Gate | Comando/Evidencia |
|---|---|
| Validators + Jest | `npm run check:all` |
| Jest explicito | `npm test` |
| Branch/version | `npm run check:version` |
| Estrutura | `npm run check:structure` |
| E2E quando tocar fluxo de usuario | `npm run test:e2e` ou justificativa registrada |
| LHCI quando tocar CSS/layout/performance | `npm run lhci` em ambiente compativel ou evidencia CI |
| SQL/operacoes Supabase | runbook + ambiente isolado + rollback |

## 5. Nao Fazer na V19 sem Plano Especifico

- Nao mover `unaccent` diretamente em producao.
- Nao transformar provider real de notificacao em default sem sandbox.
- Nao executar split CSS sem visual regression.
- Nao remover `.claude/worktrees` sem decisao sobre preservacao historica.
- Nao arquivar `docs/qa/` inteiro: separar ativo de historico.
- Nao alterar `frontendRuntimeVersion`.
