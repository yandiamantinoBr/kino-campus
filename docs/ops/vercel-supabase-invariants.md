# Vercel + Supabase Invariants

Este documento resume os invariantes operacionais que precisam permanecer alinhados entre frontend, deploy estático no Vercel e backend no Supabase.

## 1. Vercel

- O build do projeto deve continuar usando `node scripts/inject-env.js`, conforme [vercel.json](/C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json).
- A saída continua estática (`outputDirectory: "."`).
- O rewrite `/auth/callback -> /auth-callback.html` é obrigatório para o callback do Supabase Auth funcionar sem framework server-side.
- Previews podem ficar protegidos por Vercel Authentication mesmo quando o deploy é publicado com sucesso.
- Em ambiente Windows, a validação protegida via `vercel curl` pode exigir `-- --ssl-no-revoke` por causa do `curl`/Schannel.
- A CSP deve continuar permitindo:
  - `script-src` e `script-src-elem` com `self` e `https://cdn.jsdelivr.net`
  - `style-src` com `self`, `unsafe-inline` e `https://cdnjs.cloudflare.com`
  - `connect-src` com `self`, `https://*.supabase.co` e `wss://*.supabase.co`
  - `object-src 'none'`, `base-uri 'self'` e `form-action 'self'` para reduzir superfície de plugin, base URL e envio de formulários
- Em previews protegidos, o script de feedback `https://vercel.live/_next-live/feedback/feedback.js` pode aparecer bloqueado pela CSP atual; isso não deve ser tratado como regressão funcional automática sem evidência de impacto real no app.

### Cache dinamico de SEO

- `/sitemap.xml` reescreve para `api/sitemap.js`, que define cache de CDN com `s-maxage=900, stale-while-revalidate=3600`.
- `/product.html?id=...` reescreve para `api/og-product.js`; produto publicado resolvido define `s-maxage=300, stale-while-revalidate=600`.
- `/api/og-image` define cache de 1 dia para browser/CDN e `stale-while-revalidate` longo para a Vercel.
- Em Vercel, `s-maxage` e `stale-while-revalidate` podem ser consumidos pelo CDN e nao aparecer no `Cache-Control` entregue ao browser; valide cache dinamico com probes repetidos e `X-Vercel-Cache`, nao apenas com o header visivel.

## 2. scripts/inject-env.js

- O script injeta placeholders em `assets/js/boot/kc-env.js` antes do deploy.
- Variáveis canônicas aceitas:
  - `KC_SUPABASE_URL`
  - `KC_SUPABASE_ANON_KEY`
  - `KC_DRIVER`
  - `KC_APP_ENV`
- Variáveis alternativas compatíveis continuam aceitas (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_*`, `VITE_*`, `REACT_APP_*`).
- O script deve continuar recusando configuração incompleta e execução local não autorizada sem `KC_ALLOW_LOCAL_INJECT=1`.

## 3. assets/js/boot/kc-env.js

- Produção deve continuar fail-closed quando `driver != "supabase"`.
- Os placeholders canônicos para injeção devem permanecer presentes no arquivo rastreado:
  - `__KC_SUPABASE_URL__`
  - `__KC_SUPABASE_ANON_KEY__`
  - `__KC_DRIVER__`
  - `__KC_APP_ENV__`

## 4. Supabase

- O Supabase permanece backend dominante para:
  - Auth
  - Postgres
  - Storage
  - Realtime
  - RPCs
  - Edge Functions
- O contrato de perfil do frontend não deve tratar `profiles.email` como parte do perfil público sincronizado.

## 5. Avatar policy manual

- O passo manual continua documentado em `supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql`.
- Esse arquivo não substitui migration oficial; ele existe como requisito operacional explícito quando o ambiente real ainda não tiver as policies de avatar aplicadas.

## 6. Edge Function de reports

- A função `supabase/functions/notify-admin-reports-threshold/index.ts` depende de:
  - `KC_NOTIFY_HMAC_SECRET`
  - `ADMIN_REPORTS_WEBHOOK_URL`
  - `KC_APP_BASE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - opcionalmente `REPORTS_THRESHOLD`
  - opcionalmente `REPORTS_NOTIFY_COOLDOWN_HOURS`
- O contrato dessa função não deve ser alterado nesta fase; o foco aqui é apenas manter a rastreabilidade operacional.
## 7. Edge Function de dispatch externo de notificações

- A função `supabase/functions/kc-dispatch-notification-outbox/index.ts` depende de:
  - `KC_NOTIFICATION_DISPATCH_SECRET`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `KC_NOTIFICATION_EMAIL_PROVIDER`
  - `KC_NOTIFICATION_EMAIL_API_KEY`
  - `KC_NOTIFICATION_EMAIL_FROM`
  - opcionalmente `KC_NOTIFICATION_EMAIL_REPLY_TO`
  - opcionalmente `KC_APP_BASE_URL`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_PROVIDER`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_FROM`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_CONTENT_SID`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_STATUS_CALLBACK`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_TEMPLATE_NAME`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_WINDOW_MINUTES`
  - opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_MAX_PER_WINDOW`
  - opcionalmente `KC_NOTIFICATION_DISPATCH_BATCH_LIMIT`
- O contrato HTTP atual da função exige:
  - `POST`
  - header `x-kc-dispatch-secret`
- A `v11.21.0` promove essa função para o canal de e-mail:
  - `dryRun=true` continua como default seguro e devolve preview de envelopes
  - `dryRun=false` só envia quando o provider de e-mail estiver completamente configurado
  - o envio real usa `Resend` e registra o resultado em `notification_delivery_attempts`
  - a fila é consumida pelos helpers SQL `kc_claim_notification_delivery_batch(...)` e `kc_record_notification_delivery_attempt(...)`
- A `v11.21.1` promove a mesma funcao para o canal privado de WhatsApp:
  - o destino deixa de ser bloqueado quando existir row valida em `notification_channel_targets`
  - o envio real usa Twilio quando `dryRun=false` e `KC_NOTIFICATION_WHATSAPP_*` estiverem configurados
  - a funcao aplica rate limit por usuario com base em `kc_count_recent_notification_deliveries(...)`
  - o canal continua separado do WhatsApp publico do perfil/produto
- A trilha externa deve continuar obedecendo:
  - `public.notifications` e o sino/dropdown seguem sendo a fonte canônica in-app
  - WhatsApp público do perfil/produto não pode ser reutilizado automaticamente como destino privado de notificação
  - a resolucao de destino privado atual usa `auth.users.email` para `email` e `notification_channel_targets` para `whatsapp`
  - ausencia de `KC_NOTIFICATION_EMAIL_*` no projeto deve resultar em gating explicito (`email_provider_not_configured`), nunca em quebra do feed in-app nem dos triggers
  - ausencia de `KC_NOTIFICATION_WHATSAPP_*` no projeto deve resultar em gating explicito do canal `whatsapp`, nunca em quebra do feed in-app, do canal `email` nem dos triggers

- Qualquer validacao de provider real deve seguir `docs/ops/v30-notification-provider-sandbox-checklist.md`
  antes de ativar scheduler recorrente ou enviar mensagens fora de destino controlado.

- A `v11.22.0` fecha a primeira rodada operacional da trilha externa:
  - a migration `v11.22.0.0_notification_dispatch_scheduler.sql` cria `notification_dispatch_runs` para log privado de dry-run/dispatch
  - a mesma migration cria `notification_dispatch_runtime` como camada privada versionada de URL/segredo/batch do scheduler
  - o helper `kc_trigger_notification_dispatch(...)` usa `net.http_post(...)` para chamar a Edge Function sem expor segredos no repositório
  - o job `pg_cron` `kc-dispatch-notification-outbox` passa a consumir a outbox a cada 5 minutos
  - a Edge Function agora devolve e persiste `execution_id` e `source` para rastreabilidade operacional
- Invariante nova de segredo/URL:
  - `notification_dispatch_runtime.dispatch_secret` e a fonte preferencial do scheduler; `app.settings.kc_notification_dispatch_secret` fica como fallback
  - `notification_dispatch_runtime.function_url` deve apontar para a URL pública correta da função no projeto ativo
  - `app.settings.kc_notification_dispatch_secret` e `app.settings.kc_notification_dispatch_function_url` ficam como fallback/override operacional, nao como trilha preferencial

## 8. Residual Supabase advisor items

- A rodada `v11.19.0` resolve, por migration versionada, os warnings acionaveis por codigo em RLS/performance para `notifications`, `post_view_events` e `kc_invited_emails`, alem da cobertura de FK por indice nessas trilhas.
- Permanecem como residual operacional fora desta migration:
  - `extension_in_public` para `unaccent`
  - `auth_leaked_password_protection` desabilitado
- Esses dois pontos nao devem ser corrigidos por SQL improvisado no meio da rodada:
  - mover `unaccent` de schema exige planejamento para nao quebrar busca/FTS
  - leaked password protection depende de configuracao do Supabase Auth no projeto, nao de patch frontend
