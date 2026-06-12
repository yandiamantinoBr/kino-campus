# Report V75 - Notification Provider Status

**Data:** 2026-06-11 America/Sao_Paulo  
**Escopo:** verificacao de estado real dos providers externos de notificacao  
**Ambiente:** Supabase remoto `Kino Campus` (`wacyrkwhkvzwkqpolrbg`)  
**Canal:** email e WhatsApp  

---

## 1. Objetivo

Confirmar se Resend e Twilio estao operacionalmente ativos no projeto remoto ou se continuam gated por configuracao ausente. Esta rodada nao executou envio real, nao criou secrets, nao alterou banco e nao fez deploy de Edge Functions.

---

## 2. Evidencia Coletada

| Superficie | Resultado |
|---|---|
| Projeto Supabase | `Kino Campus` em estado `ACTIVE_HEALTHY` |
| Edge Function `kc-dispatch-notification-outbox` | Remota, `ACTIVE`, versao 6 |
| Edge Function `notify-admin-reports-threshold` | Presente no repo local; ausente na lista remota de Edge Functions |
| Codigo remoto do dispatcher | Contem `RESEND_ENDPOINT`, `TWILIO_MESSAGES_ENDPOINT`, `dry_run` default e `provider_not_configured` |
| Secret `KC_NOTIFICATION_DISPATCH_SECRET` | Presente no projeto remoto, sem valor exposto |
| Secrets `KC_NOTIFICATION_EMAIL_*` | Ausentes no projeto remoto |
| Secrets `KC_NOTIFICATION_WHATSAPP_*` | Ausentes no projeto remoto |

Comandos/ferramentas usados:

- `supabase projects list --output json`
- `supabase functions list --project-ref wacyrkwhkvzwkqpolrbg --output json --dns-resolver native`
- `supabase secrets list --project-ref wacyrkwhkvzwkqpolrbg --output json --dns-resolver native`
- Supabase MCP `_list_edge_functions`
- Supabase MCP `_get_edge_function` para `kc-dispatch-notification-outbox`

Nenhum valor de secret foi registrado neste report.

---

## 3. Diagnostico

O dispatcher externo de notificacoes esta implementado e publicado, mas os providers de envio real continuam desativados por configuracao ausente:

- Email: o codigo remoto suporta Resend, mas faltam `KC_NOTIFICATION_EMAIL_PROVIDER`, `KC_NOTIFICATION_EMAIL_API_KEY` e `KC_NOTIFICATION_EMAIL_FROM`.
- WhatsApp: o codigo remoto suporta Twilio, mas faltam `KC_NOTIFICATION_WHATSAPP_PROVIDER`, `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID`, `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN`, `KC_NOTIFICATION_WHATSAPP_FROM` e `KC_NOTIFICATION_WHATSAPP_CONTENT_SID`.
- O comportamento esperado em `dryRun=false` sem provider pronto e pular o canal com `provider_not_configured`, sem quebrar notificacoes in-app.
- O dry-run real da funcao nao foi invocado nesta rodada porque isso exigiria o segredo de dispatch em header; a verificacao ficou restrita a metadados, codigo remoto e presenca booleana de secrets.

---

## 4. Gates

| Gate | Estado |
|---|---|
| Checklist V30 | Parcialmente preenchido por verificacao sem envio |
| Provider sandbox identificado | Bloqueado |
| Secrets de email presentes | Nao |
| Secrets de WhatsApp presentes | Nao |
| Destino de teste controlado | Nao selecionado |
| Opt-in WhatsApp | Nao validado |
| Dispatch manual batch 1 | Nao executado |
| `notification_delivery_attempts` | Nao consultado nesta rodada |
| `notification_dispatch_runs` | Nao consultado nesta rodada |

---

## 5. Decisao

| Decisao | Motivo |
|---|---|
| No-Go tecnico para ativacao de provider | Providers reais nao estao configurados no Supabase remoto; ativacao exige sandbox, destino controlado, opt-in e rollback documentado |

---

## 6. Proxima Acao Recomendada

Antes de qualquer envio real:

1. Confirmar se o objetivo e ativar email, WhatsApp ou ambos.
2. Selecionar ambiente sandbox/preview e destino controlado.
3. Configurar secrets de provider no Supabase sem expor valores.
4. Executar dry-run com header `x-kc-dispatch-secret` em ambiente controlado.
5. Executar dispatch manual com `limit=1` apenas apos validar opt-in e rollback.

