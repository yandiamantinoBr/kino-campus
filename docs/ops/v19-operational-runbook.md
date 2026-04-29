# V19 - Runbook Operacional

**Versao:** v19.0.0
**Atualizado em:** 2026-04-28
**Escopo:** Supabase, Vercel, notificacoes externas e gates que exigem ambiente real

---

## 1. Regras

- Nao registrar secrets reais em git.
- Nao executar SQL em producao sem teste em ambiente isolado.
- Nao mudar `vercel.json` sem aprovacao explicita.
- Todo passo operacional precisa de evidencia: print, log, report ou saida redigida.
- Todo go-live externo precisa de rollback para estado fail-closed.

## 2. Supabase Advisor

### `auth_leaked_password_protection`

Tipo: configuracao Supabase Dashboard.

Checklist:

1. Abrir Supabase Dashboard do projeto.
2. Ir em Auth / Security.
3. Confirmar estado de leaked password protection.
4. Ativar apenas se o plano/projeto permitir.
5. Registrar evidencia em `docs/qa/reports/report-v19-auth-run1.md` ou equivalente.

Rollback: retornar a configuracao anterior no dashboard e registrar motivo.

### `extension_in_public` para `unaccent`

Tipo: risco SQL/FTS.

Nao executar diretamente em producao. A busca usa `unaccent` em migrations v9.2.x e helpers `kc_unaccent`.
Ver tambem `docs/ops/v28-unaccent-fts-dependency-audit.md` antes de planejar qualquer migration.

Spike obrigatorio:

1. Criar banco isolado com migrations completas.
2. Medir funcoes que referenciam `public.unaccent` e `kc_unaccent`.
3. Testar mover a extensao para schema dedicado.
4. Reexecutar busca, feed e RPCs dependentes.
5. Criar migration idempotente somente depois de prova completa.

Rollback: restaurar extensao/aliases para o estado anterior e reindexar se necessario.

## 3. Avatar Storage

Fonte: `supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql`.

Checklist:

1. Confirmar bucket `kino-media`.
2. Confirmar policies em `storage.objects` para prefixo `profile-avatars`.
3. Executar upload, update e delete de avatar com usuario autenticado.
4. Verificar que outro usuario nao consegue alterar/deletar avatar alheio.
5. Registrar evidencia no report QA.

Decisao futura: converter o passo manual em runbook bloqueante ou migration segura validada pelo owner.

## 4. Notificacoes Externas

### Email

Pre-requisitos:

- `KC_NOTIFICATION_EMAIL_PROVIDER`
- `KC_NOTIFICATION_EMAIL_API_KEY`
- `KC_NOTIFICATION_EMAIL_FROM`
- opcional: `KC_NOTIFICATION_EMAIL_REPLY_TO`, `KC_APP_BASE_URL`, `KC_NOTIFICATION_DISPATCH_BATCH_LIMIT`

Go-live:

1. Configurar provider em sandbox ou dominio transacional validado.
2. Rodar dispatch em `dry_run`.
3. Rodar dispatch manual com batch pequeno.
4. Validar `notification_delivery_attempts` e `notification_dispatch_runs`.
5. Confirmar opt-out/preferencias.

Rollback: remover provider/secrets ou voltar provider para estado ausente; o dispatcher deve retornar `provider_not_configured`.

### WhatsApp

Pre-requisitos:

- `KC_NOTIFICATION_WHATSAPP_PROVIDER`
- `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID`
- `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN`
- `KC_NOTIFICATION_WHATSAPP_FROM`
- `KC_NOTIFICATION_WHATSAPP_CONTENT_SID`

Go-live:

1. Validar template/content sid.
2. Usar destino de teste com opt-in explicito em `notification_channel_targets`.
3. Rodar batch pequeno.
4. Validar rate limit por usuario.
5. Confirmar que numero publico do perfil nao e usado como fallback automatico.

Rollback: remover secrets do canal ou desabilitar preferencias/targets.

## 5. Scheduler de Dispatch

Superficies:

- `public.notification_dispatch_runtime`
- `app.settings.kc_notification_dispatch_function_url`
- `app.settings.kc_notification_dispatch_secret`
- `app.settings.kc_notification_dispatch_batch_limit`

Checklist:

1. Confirmar row `slot='primary'`.
2. Confirmar `function_url` da Edge Function.
3. Confirmar segredo sem expor valor.
4. Rodar helper em modo manual/dry-run.
5. Validar logs em `notification_dispatch_runs`.

## 6. Lighthouse e Preview Vercel

- Bloqueio de `https://vercel.live/_next-live/feedback/feedback.js` em preview protegido nao e regressao automatica.
- Regressao real exige impacto em app, erro de script proprio ou falha de rota.
- LHCI deve rodar preferencialmente em Linux/CI; no Windows, EPERM de cleanup pode ser ruido local.
