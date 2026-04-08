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
| `SUPABASE_URL` | substitui `__KC_SUPABASE_URL__` em `assets/js/kc-env.js` |
| `SUPABASE_ANON_KEY` | substitui `__KC_SUPABASE_ANON_KEY__` em `assets/js/kc-env.js` |
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

O objeto é exposto por `assets/js/kc-env.js`:

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

- A release funcional atual do produto está na linha `v10`, e a fase corrente de trabalho está na `v11`.
- Mesmo assim, o bloco canônico embarcado em `kc-env.js`, `kc-api.client.js`, `kc-supabase.client.js`, `kc-auth.ui.js`, `kc-profiles.client.js` e `scripts/hygiene-check.js` ainda permanece em `8.6.0`.
- Esse drift não deve ser mascarado na documentação; ele passou a ser item explícito da v11.

## Supabase

### Variáveis internas do projeto

Configuradas no dashboard do Supabase quando exigidas pelas Edge Functions e automações:

| Variável | Uso |
|----------|-----|
| `KC_NOTIFY_HMAC_SECRET` | assinatura HMAC da Edge Function de reports |
| `ADMIN_REPORTS_WEBHOOK_URL` | webhook de alertas administrativos |
| `KC_APP_BASE_URL` | URL base usada em links gerados por funções |

### Edge Functions relevantes

- `notify-admin-reports-threshold`
- `kc-invite-user`

Para publicar:

```bash
supabase functions deploy notify-admin-reports-threshold
supabase functions deploy kc-invite-user
```

## Banco e storage

### Storage esperado

- bucket: `kino-media`
- caminhos principais:
  - `post-media/{uid}/{postId}/...`
  - `avatars/{uid}.{ext}`

### Migrations

- o diretório `supabase/migrations/` contém `77` arquivos na baseline atual
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

Hoje, o checker continua orientado pela versão canônica `8.6.0`, o que é coerente com os arquivos versionados de frontend, mas não com a linha funcional/documental `v10`. Essa tensão foi formalmente registrada para tratamento controlado na v11.
