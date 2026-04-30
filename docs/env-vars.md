# KinoCampus - Variáveis de Ambiente

## Resumo

O KinoCampus usa três camadas de configuração:

1. variáveis da Vercel no build
2. configuração runtime exposta em `window.KC_ENV`
3. variáveis internas do projeto Supabase e das Edge Functions

## Vercel

### Obrigatórias para o build

| Variável | Uso |
|----------|-----|
| `SUPABASE_URL` | substitui `__KC_SUPABASE_URL__` em `assets/js/boot/kc-env.js` |
| `SUPABASE_ANON_KEY` | substitui `__KC_SUPABASE_ANON_KEY__` em `assets/js/boot/kc-env.js` |
| `KC_APP_ENV` | alimenta `__KC_APP_ENV__` e normaliza `production` ou `development` |
| `KC_DRIVER` | alimenta `__KC_DRIVER__`; em produção deve resultar em `supabase` |

Aliases aceitos pelo `scripts/inject-env.js`:

- URL: `SUPABASE_URL`, `KC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL`
- key: `SUPABASE_ANON_KEY`, `KC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLIC_KEY`

### Build invariants

- `vercel.json` deve manter `buildCommand = "node scripts/inject-env.js"`
- produção deve compilar com `driver = "supabase"`
- placeholders `__KC_*__` não podem permanecer no artefato publicado

## `KC_ENV` em runtime

O objeto é exposto por `assets/js/boot/kc-env.js`:

```javascript
window.KC_ENV = {
  version: '8.6.0',
  APP_VERSION: '8.6.0',
  environment: 'production',
  APP_ENV: 'production',
  driver: 'supabase',
  DATA_DRIVER: 'supabase',
  debug: true,
  SUPABASE_URL: 'https://...supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
  supabase: {
    url: 'https://...supabase.co',
    anonKey: 'eyJ...',
    storageBucket: 'kino-media',
  },
  AUTH_ALLOWED_DOMAINS: ['ufg.br', 'discente.ufg.br', 'egresso.ufg.br'],
  auth: {
    allowedEmailDomains: ['ufg.br', 'discente.ufg.br', 'egresso.ufg.br'],
  },
  isProduction: true,
}
```

### Observação importante de baseline

- A baseline documental atual do repositorio esta em `v37.0.0`.
- O runtime JavaScript canonico do frontend permanece em `8.6.0` por decisao de compatibilidade; isso e diferente de `appVersion`.
- Arquivos como `kc-env.js`, `kc-api.client.js`, `kc-supabase.client.js`, `kc-auth.ui.js`, `kc-profiles.client.js` e `scripts/hygiene-check.js` continuam validando `8.6.0`.
- Essa diferenca nao e drift pendente: e a separacao formal entre versao documental/app (`37.0.0`) e runtime frontend (`8.6.0`).

## Supabase

### Variáveis internas do projeto

Configuradas no dashboard do Supabase quando exigidas pelas Edge Functions e automações:

| Variável | Uso |
|----------|-----|
| `KC_NOTIFY_HMAC_SECRET` | assinatura HMAC da Edge Function de reports |
| `ADMIN_REPORTS_WEBHOOK_URL` | webhook de alertas administrativos |
| `KC_APP_BASE_URL` | URL base usada em links gerados por funções |
| `KC_NOTIFICATION_DISPATCH_SECRET` | autenticacao customizada da Edge Function de dispatch externo |
| `KC_NOTIFICATION_EMAIL_PROVIDER` | provider do canal de e-mail (`resend`) |
| `KC_NOTIFICATION_EMAIL_API_KEY` | credencial do provider de e-mail |
| `KC_NOTIFICATION_EMAIL_FROM` | remetente transacional do canal de e-mail |
| `KC_NOTIFICATION_EMAIL_REPLY_TO` | reply-to opcional do canal de e-mail |
| `KC_NOTIFICATION_WHATSAPP_PROVIDER` | provider do canal privado de WhatsApp (`twilio`) |
| `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID` | credencial principal da conta Twilio |
| `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN` | token secreto da conta Twilio |
| `KC_NOTIFICATION_WHATSAPP_FROM` | numero/remetente do canal WhatsApp em formato E.164 |
| `KC_NOTIFICATION_WHATSAPP_CONTENT_SID` | template/content sid usado na API de mensagens |
| `KC_NOTIFICATION_WHATSAPP_STATUS_CALLBACK` | callback opcional de status do provider |
| `KC_NOTIFICATION_WHATSAPP_TEMPLATE_NAME` | nome humano opcional do template usado no dispatcher |
| `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_WINDOW_MINUTES` | janela de rate limit do canal WhatsApp |
| `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_MAX_PER_WINDOW` | maximo de envios por usuario na janela do canal WhatsApp |
| `KC_NOTIFICATION_DISPATCH_BATCH_LIMIT` | limite padrao de rows por execucao do dispatcher |

### Edge Functions relevantes

- `notify-admin-reports-threshold`
- `kc-invite-user`
- `kc-dispatch-notification-outbox`

Para publicar:

```bash
supabase functions deploy notify-admin-reports-threshold
supabase functions deploy kc-invite-user
supabase functions deploy kc-dispatch-notification-outbox
```

### Runtime de banco fora do git

Usado pelo scheduler da `v11.22.0` para acionar a Edge Function automaticamente:

| Superfície | Campo | Uso |
|----------|-----|-----|
| `public.notification_dispatch_runtime` | `function_url` | URL publica da Edge Function `kc-dispatch-notification-outbox` |
| `public.notification_dispatch_runtime` | `dispatch_secret` | segredo privado usado pelo scheduler; gerado no insert da row `primary` |
| `public.notification_dispatch_runtime` | `batch_limit` | batch padrao opcional usado pelo helper `kc_trigger_notification_dispatch(...)` |
| `app.settings` | `kc_notification_dispatch_function_url` | fallback/override operacional opcional |
| `app.settings` | `kc_notification_dispatch_secret` | fallback/override operacional opcional |
| `app.settings` | `kc_notification_dispatch_batch_limit` | fallback/override operacional opcional |

Observacoes:

- o scheduler versionado usa `pg_cron` + `net.http_post`
- `notification_dispatch_runtime` e a fonte preferencial da `v11.22.0`
- sem URL funcional e secret valido, o helper retorna `NULL` e o fluxo externo permanece fail-closed
- a Edge Function aceita o segredo de `notification_dispatch_runtime.dispatch_secret` e continua compativel com `KC_NOTIFICATION_DISPATCH_SECRET`

## Banco e storage

### Storage esperado

- bucket: `kino-media`
- caminhos principais:
  - `post-media/{uid}/{postId}/...`
  - `profile-avatars/{userId}/{timestamp}-avatar.{ext}`

### Migrations

- o diretorio `supabase/migrations/` contem `83` arquivos na baseline atual
- as migrations da v10 admin já estão aplicadas no banco principal atual
- em ambientes novos ou paralelos, a aplicação continua sendo uma vez por banco

## Desenvolvimento local

### Offline / local adapter

Sem build, o app pode rodar com:

- `driver = "local"`
- dados vindos de `data/database.json`
- simulação de sessão em storage local

### Com Supabase local

```bash
supabase start
node scripts/inject-env.js
```

Depois, apontar `SUPABASE_URL` e a chave local para o projeto local.

## Hygiene check

`node scripts/hygiene-check.js` valida:

- versão canônica embutida do frontend
- ausência de placeholders `__KC_*__`
- presença de `kc-theme-boot.css` quando `kc-theme-boot.js` for carregado
- ausência de inline handlers proibidos
- invariantes de deploy e contrato de `profiles`

Hoje, o checker continua orientado pela versão canônica `8.6.0`, o que é coerente com os arquivos versionados de frontend. A versão documental/app atual é `19.0.0` e fica registrada em `VERSION.json`.
