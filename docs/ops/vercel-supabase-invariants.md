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
- Em previews protegidos, o script de feedback `https://vercel.live/_next-live/feedback/feedback.js` pode aparecer bloqueado pela CSP atual; isso não deve ser tratado como regressão funcional automática sem evidência de impacto real no app.

## 2. scripts/inject-env.js

- O script injeta placeholders em `assets/js/kc-env.js` antes do deploy.
- Variáveis canônicas aceitas:
  - `KC_SUPABASE_URL`
  - `KC_SUPABASE_ANON_KEY`
  - `KC_DRIVER`
  - `KC_APP_ENV`
- Variáveis alternativas compatíveis continuam aceitas (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_*`, `VITE_*`, `REACT_APP_*`).
- O script deve continuar recusando configuração incompleta e execução local não autorizada sem `KC_ALLOW_LOCAL_INJECT=1`.

## 3. assets/js/kc-env.js

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
