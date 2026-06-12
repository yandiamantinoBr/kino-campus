# Reports de QA Ativo

Reports ativos e templates de evidencia. Reports historicos V8/V11/V15 foram movidos para
`docs/archive/qa-legacy/` em V20.

## Conteúdo

| Arquivo | Uso |
|---|---|
| `_TEMPLATE-authenticated-run.md` | Template V26 para rodada autenticada real com redacao de evidencias |
| `report-v75-notification-provider-status-2026-06-11.md` | Evidencia V75 do estado real dos providers Resend/Twilio no Supabase remoto |
| `report-v75-supabase-auth-password-protection-2026-06-11.md` | Evidencia V75 de `password_hibp_enabled=false` no Supabase Auth remoto |
| `report-v75-generated-output-cleanup-2026-06-11.md` | Evidencia V75 da remocao de artefatos gerados do indice Git |
| `report-v75-vercel-cache-control-2026-06-11.md` | Evidencia V75 de cache efetivo para sitemap e Open Graph na Vercel |

## Padrão de entrada

Novos relatórios seguem o padrão: `report-v26-auth-runN.md` ou `report-vX.Y.Z-runN.md`.

## Estado V26

- O runbook principal está em `../v25-real-environment-qa-runbook.md`.
- O checklist ativo está em `../e2e-checklist.md`.
- O plano-fonte de QA autenticado está em `../v19-authenticated-qa-plan.md`.
- Reports antigos continuam preservados em `../../archive/qa-legacy/`.
- Nenhum report deve conter token, senha, magic link completo, service role key, header sensível ou URL assinada.
