# KinoCampus — Variáveis de Ambiente

## Vercel (Build Time + Runtime)

### Obrigatórias

| Variável | Exemplo | Onde usada |
|----------|---------|-----------|
| `SUPABASE_URL` | `https://xxx.supabase.co` | `inject-env.js` → substitui `__KC_SUPABASE_URL__` em `kc-env.js` |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` | `inject-env.js` → substitui `__KC_SUPABASE_ANON_KEY__` |

**Aliases aceitos para URL:** `SUPABASE_URL`, `KC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL`

**Aliases aceitos para Key:** `SUPABASE_ANON_KEY`, `KC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLIC_KEY`

### Para OG Image (`api/og-image.js`)

Nenhuma variável adicional — usa apenas as URLs públicas do Google Fonts e configurações em código.

### Para Edge Function (`supabase/functions/notify-admin-reports-threshold`)

| Variável | Descrição |
|----------|-----------|
| `KC_NOTIFY_HMAC_SECRET` | Segredo para verificação HMAC-SHA256 das requisições |
| `ADMIN_REPORTS_WEBHOOK_URL` | URL do webhook (Discord, Slack, etc.) para alertas |
| `KC_APP_BASE_URL` | URL base do app (ex: `https://kinocampus.com.br`) |
| `REPORTS_THRESHOLD` | Número de reports para disparar alerta (default: 3) |
| `REPORTS_NOTIFY_COOLDOWN_HOURS` | Horas entre notificações do mesmo post (default: 24) |

---

## KC_ENV (Runtime — injetado pelo build)

Disponível como `window.KC_ENV` após `kc-env.js` carregar:

```javascript
window.KC_ENV = {
  driver: 'supabase',         // 'supabase' em produção, 'local' em dev
  supabase: {
    url: 'https://xxx.supabase.co',
    anonKey: 'eyJ...',
    storageBucket: 'kino-media',
    maxImageBytes: 5242880,   // 5MB
  },
  debug: false,               // true ativa logs verbose
  version: '9.0.0',
  isProduction: true,
  allowedDomains: ['ufg.br', 'discente.ufg.br'],  // domínios de e-mail permitidos
}
```

**Em desenvolvimento local** (sem build): `driver = 'local'`, sem Supabase.

---

## Supabase — Variáveis internas ao projeto

Configuradas via Supabase Dashboard → Settings → Environment Variables:

| Variável | Usado em |
|----------|---------|
| `KC_NOTIFY_HMAC_SECRET` | Edge Function: verificação de assinatura |
| `ADMIN_REPORTS_WEBHOOK_URL` | Edge Function: URL do webhook |
| `KC_APP_BASE_URL` | Edge Function: link para produto nos alertas |

---

## Desenvolvimento Local

Para rodar localmente sem Supabase:

1. O `driver` em `kc-env.js` permanece `'local'` (não substituído pelo inject-env.js)
2. Posts são lidos de `data/database.json`
3. Sessão de usuário é simulada via localStorage

Para testar com Supabase local:
1. Instalar Supabase CLI
2. `supabase start`
3. Criar `.env.local` com `SUPABASE_URL=http://localhost:54321` e a chave local
4. Rodar `node scripts/inject-env.js` manualmente

---

## Hygiene Check

`node scripts/hygiene-check.js` verifica:
1. Versão canônica consistente em todos os arquivos (`canonicalVersion = '9.0.0'`)
2. Placeholders `__KC_*__` não presentes em produção
3. Sem console.log de debug em produção
4. Cache busters nos `<script>` e `<link>` tags nos HTMLs
5. Variáveis obrigatórias presentes no Vercel

**Para atualizar a versão canônica:** editar `scripts/hygiene-check.js` linha ~9: `canonicalVersion = '9.x.x'`
