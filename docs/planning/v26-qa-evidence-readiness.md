# V26 - Readiness de Evidencias QA Real

**Versao:** v26.0.0
**Atualizado em:** 2026-04-28
**Escopo:** documental/QA-only

---

## 1. Objetivo

Fechar a lacuna entre o runbook V25 e a execucao real: a V26 normaliza como evidencias devem ser
registradas para signup callback, perfil/avatar, admin/moderacao, RLS, notificacoes fail-closed,
busca/feed e Lighthouse sem expor credenciais, tokens ou dados sensiveis.

---

## 2. Artefatos Alinhados

| Artefato | Ajuste |
|---|---|
| `docs/qa/reports/_TEMPLATE-authenticated-run.md` | Template V26 com controle de seguranca, evidencias redigidas, limpeza e Go/No-Go |
| `docs/qa/reports/README.md` | Padrao de reports `report-v26-auth-runN.md` e regra explicita contra secrets |
| `docs/qa/e2e-checklist.md` | Checklist reancorado para V26 e conectado ao runbook V25 |
| `docs/qa/README.md` | Ordem de leitura aponta para runbook V25 + template V26 |

---

## 3. Criterios Para Executar QA Real

| Criterio | Estado esperado antes da execucao |
|---|---|
| URL alvo | Producao ou preview explicitamente aprovado |
| Conta comum | E-mail real de teste com caixa acessivel |
| Conta admin | Permissao temporaria aprovada e reversivel |
| Evidencia Supabase | Acesso somente-leitura ou prints redigidos aprovados |
| Provider externo | Sandbox ou fail-closed documentado; sem envio para destino nao consentido |
| Limpeza | Plano para remover dados temporarios e revogar permissao admin |

---

## 4. Bloqueios Mantidos

- Nao executar SQL ou mudar Dashboard Supabase nesta versao.
- Nao ativar provider real de email/WhatsApp.
- Nao alterar JS funcional, CSS de producao, HTMLs ou migrations.
- Nao transformar Playwright/LHCI em gate obrigatorio sem evidencia de estabilidade local/CI.

---

## 5. Proximo Passo Seguro

Rodar a primeira execucao real usando `docs/qa/v25-real-environment-qa-runbook.md` e registrar o
resultado em `docs/qa/reports/report-v26-auth-run1.md` a partir do template V26. Falhas P0 devem virar
issues ou plano de intervencao especifico antes de qualquer implementacao.
