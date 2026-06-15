# Report V76 - Deploy controlado de notify-admin-reports-threshold

**Data:** 2026-06-15  
**Escopo:** Supabase Edge Function `notify-admin-reports-threshold` no projeto `Kino Campus` (`wacyrkwhkvzwkqpolrbg`)  
**Modo:** deploy operacional sem ativação de webhook

## Decisão

A melhor decisão custo-benefício foi publicar a Edge Function remota mantendo `verify_jwt=true`, mas não ativar o fluxo de alerta real. O estado anterior deixava a migration e o trigger documentados, porém sem a função disponível no remoto. O deploy reduz essa lacuna operacional sem introduzir envios externos para destino indefinido.

Não foram configurados webhook, secrets customizados, settings de banco, migrations, HTML, CSS ou JS de runtime.

## Ação executada

```bash
supabase functions deploy notify-admin-reports-threshold --project-ref wacyrkwhkvzwkqpolrbg --use-api --dns-resolver https
```

Resultado informado pelo CLI: `Deployed Functions on project wacyrkwhkvzwkqpolrbg: notify-admin-reports-threshold`.

## Evidência remota

Checagem por `supabase functions list --project-ref wacyrkwhkvzwkqpolrbg --output json --dns-resolver https`:

| Campo | Valor |
|---|---|
| `name` / `slug` | `notify-admin-reports-threshold` |
| `status` | `ACTIVE` |
| `version` | `1` |
| `verify_jwt` | `true` |
| `id` | `7da234a5-8043-4289-be0e-72c35cfa287e` |
| `ezbr_sha256` | `374ec4256c0daf825ce1976fdf6afc58ee818ab20ddb743cde149dc5655a4476` |

## No-Go de ativação

Checagem de presença dos secrets remotos, sem registrar valores:

| Secret | Estado |
|---|---|
| `KC_NOTIFY_HMAC_SECRET` | ausente |
| `ADMIN_REPORTS_WEBHOOK_URL` | ausente |
| `KC_APP_BASE_URL` | ausente |
| `REPORTS_THRESHOLD` | ausente |
| `REPORTS_NOTIFY_COOLDOWN_HOURS` | ausente |

Esses itens tornam a ativação real um No-Go. A function depende dos secrets customizados para validar assinatura HMAC, montar links e enviar payload ao webhook administrativo. Sem destino controlado e segredo forte, a alternativa segura é manter o trigger em fail-closed e registrar explicitamente que o deploy não é go-live.

## Estado operacional

- Function remota disponível: sim.
- JWT no gateway Supabase: obrigatório (`verify_jwt=true`).
- Webhook administrativo configurado: não.
- HMAC customizado configurado: não.
- Settings `app.settings.kc_notify_*` alterados nesta etapa: não.
- Envio real de alerta por reports threshold: não ativado.

## Próxima ativação segura

1. Definir o destino real do webhook administrativo.
2. Gerar `KC_NOTIFY_HMAC_SECRET` forte e armazenar somente no Supabase.
3. Configurar `KC_APP_BASE_URL` e `ADMIN_REPORTS_WEBHOOK_URL` nos secrets remotos.
4. Configurar os settings `app.settings.kc_notify_function_url`, `app.settings.kc_notify_function_auth_token` e `app.settings.kc_notify_hmac_secret` no banco.
5. Fazer dry-run com um `post_id` controlado e validar `audit_log` antes de considerar o alerta ativo.

## Validação local

Este report é documental/operacional. Validações executadas após a atualização dos documentos:

- `git diff --check`: aprovado; o Git informou apenas avisos esperados de normalização LF/CRLF no Windows.
- `npm run check:all`: aprovado.
  - `check:version`, `check:structure`, `check:scripts`, `check:routes` e `check:hygiene`: OK.
  - Jest: 175 suites aprovadas, 3577 testes aprovados, 3 snapshots aprovados.
