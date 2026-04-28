# V19 - Plano de Execucao Controlada

**Versao:** v19.0.0
**Atualizado em:** 2026-04-28
**Origem:** `docs/planning/v18-v19-roadmap.md`

---

## 1. Escopo V19

A V19 executa a primeira camada segura do backlog V18:

- corrigir drift documental ativo;
- alinhar metadados para `kinocampus-V19.0-foundations`;
- criar runbooks para pendencias que exigem ambiente real;
- preservar comportamento da plataforma.

Nao fazem parte da V19: SQL em producao, ativacao de provider externo, split CSS, alteracao visual ou mudanca de runtime.

## 2. Trilha Executada

| Trilha | Status | Resultado |
|---|---|---|
| V19.1 - Documentacao canonica e higiene ativa | Executada | Docs ativos reancorados para V19 |
| V19.2 - QA operacional autenticado | Planejada | `docs/qa/v19-authenticated-qa-plan.md` |
| V19.3 - Hardening Supabase/Vercel | Planejada | `docs/ops/v19-operational-runbook.md` |
| V19.4 - Notificacoes externas | Planejada | Runbook com go-live e rollback fail-closed |
| V19.5 - Malha visual/a11y/Lighthouse | Planejada | Gates definidos antes de CSS |
| V19.6 - CSS/UX backlog controlado | Bloqueada | Depende de visual regression |

## 3. Ordem de Proxima Execucao

1. Rodar QA autenticado real em ambiente controlado.
2. Confirmar Supabase Auth leaked password protection no dashboard.
3. Validar avatar policies no projeto real.
4. Fazer spike isolado para `unaccent` fora de `public`.
5. Preparar provider sandbox para notificacoes externas.
6. Escolher ferramenta/processo de visual regression antes de CSS.

## 4. Gates

| Gate | Obrigatorio quando |
|---|---|
| `npm run check:all` | Todo PR |
| `npm test` | Todo PR |
| `npm run test:e2e` | Alterar fluxo de usuario, auth, admin, create post ou perfil |
| `npm run lhci` | Alterar CSS/layout/performance |
| Evidencia operacional | Tocar Supabase, Vercel, secrets, Edge Functions ou Auth Dashboard |
| Rollback escrito | Qualquer mudanca em provider externo, SQL ou config fora do git |

## 5. Bloqueios Deliberados

- `unaccent` nao deve ser movido diretamente em producao.
- `auth_leaked_password_protection` e configuracao de dashboard, nao migration do repo.
- Canais externos de notificacao devem continuar fail-closed ate provider e secrets estarem validados.
- Split CSS segue bloqueado ate snapshot visual das 22 paginas.
