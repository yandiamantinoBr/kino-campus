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
| `KC_BUILD_REVISION` | revisão estável usada para alinhar `?v=` dos assets, Service Worker e precache; em CI/deploy é obrigatória quando nenhuma revisão do provedor estiver disponível |
| `KC_TURNSTILE_SITE_KEY` | site key pública do widget dos pedidos LGPD visitantes; recomendada em produção (sem ela o build sobe degraded e o guest form fica fail-closed); nunca pode ser uma chave oficial de teste em produção |

Aliases aceitos pelo `scripts/inject-env.js`:

- URL: `SUPABASE_URL`, `KC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `VITE_SUPABASE_URL`, `REACT_APP_SUPABASE_URL`
- chave pública: `SUPABASE_ANON_KEY`, `KC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLIC_KEY`,
  `NEXT_PUBLIC_SUPABASE_PUBLIC_KEY`, `VITE_SUPABASE_ANON_KEY`,
  `REACT_APP_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLIC_KEY`,
  `REACT_APP_SUPABASE_PUBLIC_KEY`
- site key pública do Turnstile: `KC_TURNSTILE_SITE_KEY`,
  `TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
  `VITE_TURNSTILE_SITE_KEY`
- revisão de build: `KC_BUILD_REVISION`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`,
  `VERCEL_DEPLOYMENT_ID`, `BUILD_ID`, nessa ordem

### Build invariants

- `vercel.json` deve manter `buildCommand = "node scripts/inject-env.js"`
- produção deve compilar com `driver = "supabase"`
- produção recomenda `KC_TURNSTILE_SITE_KEY` real; ausência emite warning e
  sobe degraded (guest LGPD fail-closed em runtime). Chaves oficiais de teste
  em produção ainda encerram o build
- placeholders `__KC_*__` não podem permanecer no artefato publicado
- uma única revisão normalizada deve aparecer nos HTMLs, no precache e no
  namespace do Service Worker; não reutilize uma revisão para artefatos diferentes

## `KC_ENV` em runtime

O objeto é exposto por `assets/js/boot/kc-env.js`:

```javascript
window.KC_ENV = {
  version: '8.6.1',
  APP_VERSION: '8.6.1',
  environment: 'production',
  APP_ENV: 'production',
  driver: 'supabase',
  DATA_DRIVER: 'supabase',
  debug: true,
  SUPABASE_URL: 'https://...supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
  TURNSTILE_SITE_KEY: '0x4AAAA...',
  supabase: {
    url: 'https://...supabase.co',
    anonKey: 'eyJ...',
    storageBucket: 'kino-media',
    chatStorageBucket: 'kino-chat-media',
  },
  privacyHelp: {
    turnstileSiteKey: '0x4AAAA...',
  },
  AUTH_ALLOWED_DOMAINS: ['ufg.br', 'discente.ufg.br', 'egresso.ufg.br'],
  auth: {
    allowedEmailDomains: ['ufg.br', 'discente.ufg.br', 'egresso.ufg.br'],
  },
  isProduction: true,
}
```

### Observação importante de baseline

- A baseline atual do repositorio esta em `v75.1.0`.
- O runtime JavaScript canonico do frontend esta em `8.6.1`; isso e diferente de `appVersion`.
- Arquivos como `kc-env.js`, `kc-api.client.js`, `kc-supabase.client.js`, `kc-auth.ui.js`, `kc-profiles.client.js` e `scripts/hygiene-check.js` validam `8.6.1`.
- Essa diferenca nao e drift pendente: e a separacao formal entre versao app (`75.1.0`) e runtime frontend (`8.6.1`).

## Supabase

### Variáveis internas do projeto

Configuradas no dashboard do Supabase quando exigidas pelas Edge Functions e automações:

#### Base das Edge Functions LGPD

| Variável | Uso |
|----------|-----|
| `SUPABASE_URL` | URL do próprio projeto Supabase |
| `SUPABASE_ANON_KEY` | chave pública usada para validar o JWT do chamador; `kc-data-subject-request` também aceita `SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_PUBLISHABLE_KEY` | alternativa publishable somente onde o handler a declara; não substitui automaticamente `SUPABASE_ANON_KEY` em `kc-account-erasure` ou `kc-data-export-admin` |
| `SUPABASE_SERVICE_ROLE_KEY` | cliente privilegiado exclusivamente server-side; nunca expor ao frontend, log, pacote de exportação ou documentação pública |
| `KC_ALLOWED_ORIGINS` | allowlist explícita de origens, separada por vírgula |
| `KC_APP_BASE_URL` | URL base HTTPS usada nos links de confirmação e retorno |
| `KC_STORAGE_BUCKET` | bucket público de posts/avatares; padrão `kino-media` |
| `KC_CHAT_STORAGE_BUCKET` | bucket privado de chat; padrão `kino-chat-media` |
| `KC_TURNSTILE_SECRET_KEY` | segredo do Siteverify usado somente pela Edge de criação visitante; nunca expor no `KC_ENV`, Vercel público, logs ou respostas |
| `KC_TURNSTILE_EXPECTED_HOSTNAMES` | allowlist explícita de hostnames aceitos do Siteverify, separada por vírgula; não inclui esquema, porta ou curingas |
| `KC_PRIVACY_HELP_ALLOWED_ORIGINS` | origens exatas autorizadas a chamar o gateway visitante, separadas por vírgula; produção aceita somente HTTPS e nunca curinga/loopback |
| `KC_TURNSTILE_ENVIRONMENT` | `production` ou `test`; produção rejeita secrets oficiais de teste, e teste rejeita credenciais reais |

`KC_TURNSTILE_SITE_KEY` é deliberadamente pública e pertence ao build do
frontend. Ela deve corresponder ao mesmo widget/ambiente do segredo server-side,
mas não concede acesso ao Siteverify. Produção, preview e desenvolvimento devem
usar widgets separados; as chaves oficiais de teste são permitidas apenas em
testes locais/CI. Se a site key ou a configuração server-side estiver ausente, o
envio visitante dos três direitos LGPD falha fechado; pedidos autenticados e
ajuda genérica continuam em suas rotas próprias.

As rotas autenticadas derivam o usuário e o `session_id` do JWT. O identificador
da sessão não é variável de ambiente: desde `20260729006000`, as operações
administrativas de exportação persistem e revalidam a sessão exata que obteve o
claim. Revogar ou trocar essa sessão invalida a continuação, mesmo que outra
sessão do mesmo administrador permaneça ativa.

#### Exclusão, confirmação e comunicação

| Variável | Uso e restrições |
|----------|------------------|
| `KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64` | chave aleatória Base64/Base64URL que deve decodificar para exatamente 32 bytes; não rotacionar sem tratar workflows cifrados pendentes |
| `KC_ERASURE_OUTBOX_KEY_VERSION` | identificador da chave, padrão `v1`, até 64 caracteres seguros |
| `KC_ERASURE_OUTBOX_TTL_SECONDS` | retenção da outbox cifrada; intervalo `900`–`86400`, padrão `21600` (6 horas) |
| `KC_SMTP_USER` | usuário SMTP; obrigatório para enviar confirmação/conclusão |
| `KC_SMTP_PASS` | senha SMTP; obrigatória para enviar confirmação/conclusão |
| `KC_SMTP_HOST` | host SMTP; padrão versionado `smtp.hostinger.com` |
| `KC_SMTP_PORT` | porta SMTP; padrão versionado `465` |
| `KC_SMTP_FROM_NAME` | nome do remetente; padrão `KinoCampus` |
| `KC_SMTP_FROM_EMAIL` | endereço do remetente; padrão `contato@kinocampus.com.br` |
| `KC_ADMIN_NOTIFICATION_EMAIL` | reply-to administrativo; fallback para o endereço do remetente |
| `KC_AUTH_USER_SCAN_MAX_PAGES` | teto defensivo da busca administrativa em Auth; padrão `50`, máximo efetivo `100` |

#### Retenção física de exportações

| Variável | Uso e restrições |
|----------|------------------|
| `KC_DATA_EXPORT_RETENTION_SECRET` | segredo exclusivo do worker máquina-a-máquina; mínimo 32 caracteres e cópia correspondente cifrada no Vault |

#### Outras integrações

| Variável | Uso |
|----------|-----|
| `KC_NOTIFY_HMAC_SECRET` | assinatura HMAC da Edge Function de reports |
| `ADMIN_REPORTS_WEBHOOK_URL` | webhook de alertas administrativos |
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
| `AUTO_PUBLISH_SCORE_MIN` | limiar da barreira editorial do `cadu-publish`, entre `0` e `1`; padrao e fallback seguro `0.70` |
| `KC_GA4_SA_KEY` | JSON da conta técnica exclusiva de runtime do GA4, com acesso somente leitura; nunca expor ao frontend |
| `KC_GA4_PROPERTY_ID` | ID numérico fixo da propriedade GA4 consultada |
| `KC_GA4_ALLOWED_ORIGINS` | allowlist opcional de origens HTTPS, separadas por vírgula |
| `KC_GA4_CACHE_TTL_SEC` | TTL do cache efêmero do proxy GA4; padrão 300 segundos |
| `KC_GA4_MAX_LIMIT` | limite operacional de linhas, sujeito ao hard cap da função |
| `KC_SEARCH_CONSOLE_SA_KEY` | JSON de conta técnica exclusiva e separada para leitura do Search Console |
| `KC_SEARCH_CONSOLE_SITE_URL` | propriedade fixa autorizada, por exemplo uma propriedade de domínio |
| `KC_SEARCH_CONSOLE_ALLOWED_ORIGINS` | allowlist opcional de origens HTTPS do painel |
| `KC_SEARCH_CONSOLE_CACHE_TTL_SEC` | TTL do cache efêmero do Search Console; padrão 300 segundos |
| `KC_ANALYTICS_ID_SECRET` | segredo aleatório de no mínimo 32 bytes usado somente no HMAC-SHA-256 do User-ID pseudônimo |
| `KC_ANALYTICS_ID_ALLOWED_ORIGINS` | allowlist opcional de origens HTTPS da função de User-ID |

### Edge Functions relevantes

Inventario versionado no repo. O estado remoto deve ser confirmado antes de qualquer deploy.

- `notify-admin-reports-threshold`
- `kc-invite-user`
- `kc-dispatch-notification-outbox`
- `kc-data-subject-request`
- `kc-data-export-admin`
- `kc-account-erasure`
- `kc-create-privacy-help-guest`
- `kc-data-export-retention`
- `kc-ga4-reports`
- `kc-search-console-reports`
- `kc-analytics-subject-id`

As três integrações de medição exigem JWT no gateway e repetem a validação de autenticação no handler. GA4 e Search Console usam contas técnicas diferentes e com o menor privilégio de leitura compatível. `KC_ANALYTICS_ID_SECRET` nunca deve ser reutilizado como outra credencial; sua rotação cria novos pseudônimos e interrompe intencionalmente a continuidade histórica de User-ID.

### Atualização segura das credenciais Google

Credenciais JSON não devem ser interpoladas diretamente em um comando PowerShell de
`supabase secrets set`: a passagem por uma string de linha de comando pode remover as
aspas do JSON e produzir `invalid_sa_key` mesmo quando o arquivo original é válido.

Use o utilitário versionado, que valida a estrutura das duas contas técnicas, assina o
JWT, consulta as APIs oficiais, grava um arquivo temporário com permissão restrita,
publica via `--env-file`, confere os digests remotos e remove o arquivo temporário:

```powershell
npm run analytics:secrets:set -- `
  --project-ref <project-ref> `
  --ga-key <caminho-do-json-ga4> `
  --ga-property <property-id> `
  --search-console-key <caminho-do-json-search-console> `
  --search-console-site <site-url>
```

O comando não imprime chaves privadas nem endereços das contas técnicas. A execução
deve terminar com respostas `200` das duas APIs e confirmação de digests; qualquer
divergência interrompe o processo com erro.

Registro histórico V76 (2026-06-15): houve verificação de uma publicação
`deploy-only` de `notify-admin-reports-threshold`. Esse registro não comprova o
estado remoto atual, a presença de secrets ou os settings de banco. Antes de
ativar envio real, consulte o projeto-alvo e confirme a versão, `verify_jwt`,
webhook controlado, HMAC forte e `app.settings.kc_notify_*`.

Para publicar ou republicar:

```bash
supabase functions deploy notify-admin-reports-threshold
supabase functions deploy kc-invite-user
supabase functions deploy kc-dispatch-notification-outbox
supabase functions deploy kc-data-subject-request
supabase functions deploy kc-data-export-admin
supabase functions deploy kc-account-erasure
supabase functions deploy kc-create-privacy-help-guest --no-verify-jwt
supabase functions deploy kc-data-export-retention --no-verify-jwt
supabase functions deploy kc-ga4-reports
supabase functions deploy kc-search-console-reports
supabase functions deploy kc-analytics-subject-id
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

### Retenção automática de exportações LGPD

`kc-data-export-retention` usa `verify_jwt=false` apenas porque o cron não possui
sessão de usuário. O handler usa `KC_DATA_EXPORT_RETENTION_SECRET` somente como
chave para validar a assinatura HMAC; o valor reutilizável não trafega no header.
A requisição leva timestamp, nonce e assinatura de curta duração, comparada em
tempo constante antes de inicializar o client service-role.

O banco mantém os valores cifrados no Supabase Vault, nunca em tabela pública:

| Nome no Vault | Uso |
|---|---|
| `kc_data_export_retention_function_url` | endpoint canônico e exato da Edge Function |
| `kc_data_export_retention_project_ref` | `project-ref` de 20 caracteres que deve corresponder exatamente ao host do endpoint e ao projeto do rollout |
| `kc_data_export_retention_secret` | mesmo valor de `KC_DATA_EXPORT_RETENTION_SECRET` |

O valor de `kc_data_export_retention_secret` nunca é enviado ao `pg_net`. A
função de banco deriva uma assinatura HMAC-SHA-256 de curta duração sobre
método, path fixo, corpo, timestamp e nonce; somente essa assinatura transitória
entra em `net.http_request_queue`. O nonce é deduplicado no log privado de
execuções. `net` e `vault` não podem estar nos schemas expostos/search path do
PostgREST, e `anon`/`authenticated` não podem acessar
`vault.decrypted_secrets`. O preflight de deploy verifica essas condições sem
alterar ACLs gerenciadas do Supabase.

Configuração, rotação, smoke e rollback estão documentados em
`docs/privacy/data-export-supplement-runbook.md`.

Para inicialização idempotente da chave da outbox e do schedule de retenção,
use `scripts/configure-supabase-privacy-runtime.ps1`. O script nunca imprime os
valores, recusa configuração parcial e não rotaciona uma chave já existente.

O Turnstile visitante pode ser provisionado por
`scripts/ops/apply-turnstile-keys.ps1`. O utilitário configura a site key apenas
em Vercel Production e grava na Edge secret, environment, hostnames e
`KC_PRIVACY_HELP_ALLOWED_ORIGINS`. Preview exige widget/hostname próprio; não
reutilize a chave limitada aos hostnames de produção. Para bundles efêmeros,
use `-DeleteCredentialBundle` para remover o arquivo imediatamente após a
leitura.

### Schedules de privacidade versionados

As migrations declaram os jobs esperados abaixo. A presença e a próxima execução
devem ser confirmadas em `cron.job`/`cron.job_run_details` no projeto de destino;
o repositório não prova que o scheduler remoto está ativo.

| Job | Schedule esperado |
|-----|-------------------|
| `kc-dsr-retention-purge-daily` | `17 3 * * *` |
| `kc-help-notification-claim-purge-daily` | `41 3 * * *` |
| `kc-erasure-completion-outbox-purge-hourly` | `11 * * * *` |
| `kc-data-export-retention-purge` | `*/15 * * * *` |
| `kc-data-export-retention-monitor` | `7 * * * *` |

## Banco e storage

### Storage esperado

| Bucket | Visibilidade/contrato | Caminhos principais |
|--------|-----------------------|---------------------|
| `kino-media` | público para posts e avatares | `post-media/{uid}/{postId}/...`; `profile-avatars/{userId}/{timestamp}-avatar.{ext}` |
| `kino-chat-media` | privado, até 15 MiB por objeto; leitura mediada por participação e URL assinada | `chat-media/...` |
| `kino-data-exports` | privado, somente JSON, até 16 MiB; sem policy direta de leitura pelo titular | `objects/{64-hex}.json` |

Durante o cutover de chat, inventarie o prefixo legado `chat-media/...` também em
`kino-media`. A documentação versionada não comprova que o bucket remoto, seus
limites, tipos MIME ou policies estão configurados corretamente.

### Migrations

- a fonte de verdade versionada é a ordem dos arquivos em `supabase/migrations/`;
  não mantenha uma contagem manual, pois ela fica obsoleta a cada migration;
- a cadeia LGPD ativa inclui a sequência até
  `20260729190653_help_submission_idempotency.sql` e o gateway guest EXPAND
  `20260729203000_help_privacy_guest_gateway_expand.sql`;
- o CONTRACT guest continua fora de `supabase/migrations/`, como template em
  `supabase/contracts/pending/`, e só pode entrar na cadeia com timestamp novo
  depois do canário e da janela de cache;
- a `06000` é expand-only: assinaturas session-bound novas coexistem
  temporariamente com cinco wrappers públicos actor-only necessários à Edge
  anterior. Eles exigem exatamente uma sessão administrativa ativa; zero ou
  múltiplas sessões falham fechado. Workers privados continuam fechados e a
  revogação fica para contract posterior baseado em telemetria;
- a presença de um arquivo no repositório não significa que ele foi aplicado no
  banco remoto. Compare o histórico local e remoto antes de qualquer rollout;
- em ambiente novo ou paralelo, aplique cada migration uma única vez e valide os
  contratos/capabilities antes de liberar as Edge Functions.

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

Hoje, o checker continua orientado pela versão canônica `8.6.1`, o que é coerente com os arquivos versionados de frontend. A versão app atual é `75.1.0` e fica registrada em `VERSION.json`.
