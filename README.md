# Kino Campus - v75.1.0

> Plataforma de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG).

Conecta alunos, professores e egressos em 6 módulos temáticos: Compra e Venda, Caronas, Moradia, Eventos, Oportunidades e Achados e Perdidos. O acesso é restrito a e-mails institucionais (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).

**Produção:** [kinocampus.com.br](https://www.kinocampus.com.br)  
**Branch principal:** `kinocampus-V75.0-foundations`

**Status atual:** v75.1 performance phase 1 em producao, com runtime frontend 8.6.1.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML5 + CSS3 + Vanilla JS (IIFE, `window.*` + `Object.freeze`, sem framework/bundler) |
| Arquitetura | Driver Pattern: KCAPI fachada única, com adapters `local` (dev) e `supabase` (prod) |
| Backend | Supabase (PostgreSQL 17, Auth, Storage, Edge Functions Deno/TS, Realtime) |
| Hosting | Vercel (estático + 4 serverless functions) |
| Domínio | `kinocampus.com.br` |
| Build | `node scripts/inject-env.js` (substitui 4 placeholders `__KC_*__` + cache-busting `?v=<commit-hash>`) |
| Tamanho JS | `assets/js/` ~1.5 MB; fachada `kc-api.client.js` ~55 KB (com submódulos `_KCAPI.*` extraídos) |
| Tamanho CSS | `assets/css/` ~422 KB total; `styles.css` monolito ~274 KB (reduzido de 287 KB via micro-splits) |
| Testes | Jest: 195 suites · 3806 testes; Playwright: 13 specs E2E (chromium) |

## Documentação Técnica

> **Para IAs e desenvolvedores novos:** leia o [Guia de Desenvolvimento para IA](docs/architecture/ai-development-guide.md) antes de qualquer modificação. Ele é auto-contido e cobre workflow, padrões de código, validators, testes e convenções do projeto.

| Documento | Conteúdo |
|-----------|----------|
| [docs/index.md](docs/index.md) | Índice completo de todos os documentos técnicos |
| [docs/architecture/ai-development-guide.md](docs/architecture/ai-development-guide.md) | **Guia de comportamento para IA** — workflow, padrões JS, validators, testes, o que nunca fazer |
| [docs/architecture/module-catalog.md](docs/architecture/module-catalog.md) | Catalogo de modulos JS com namespace, paginas, dependencias e testes |
| [docs/architecture/controllers-catalog.md](docs/architecture/controllers-catalog.md) | 48 controllers com responsabilidade e chamadas KCAPI |
| [docs/architecture/data-flow-guide.md](docs/architecture/data-flow-guide.md) | Fluxo de dados ponta a ponta: controller → KCAPI → adapter → Supabase |
| [docs/architecture/css-architecture.md](docs/architecture/css-architecture.md) | CSS de producao, ownership de `styles.css` e status de `future-split/` |
| [docs/api-contract.md](docs/api-contract.md) | Contrato público da KCAPI |
| [docs/db-schema.md](docs/db-schema.md) | Tabelas, políticas RLS, índices e Storage do Supabase |

---

## Histórico de Versões

O histórico detalhado de todas as releases está no [CHANGELOG.md](CHANGELOG.md).

| Versão | Relatório | Tema |
|--------|-----------|------|
| V75.1 | [CHANGELOG.md](CHANGELOG.md) | Performance phase 1, runtime 8.6.1 e Speed Insights |
| V75 | [RELATORIO-KINOCAMPUS-V75.md](RELATORIO-KINOCAMPUS-V75.md) | PUBLIC-A11Y kc-ranking decorative icons |
| V74 | [RELATORIO-KINOCAMPUS-V74.md](RELATORIO-KINOCAMPUS-V74.md) | PUBLIC-A11Y admin-reports decorative icons |
| V73 | [RELATORIO-KINOCAMPUS-V73.md](RELATORIO-KINOCAMPUS-V73.md) | PUBLIC-A11Y kc-comments decorative icons |
| V72 | [RELATORIO-KINOCAMPUS-V72.md](RELATORIO-KINOCAMPUS-V72.md) | PUBLIC-A11Y admin dashboard controller decorative icons |
| V71 | [RELATORIO-KINOCAMPUS-V71.md](RELATORIO-KINOCAMPUS-V71.md) | PUBLIC-A11Y admin dashboard charts decorative icons |
| V15-V70 | [docs/archive/relatorios/_INDEX.md](docs/archive/relatorios/_INDEX.md) | Historico arquivado recente |
| V9–V14 | [docs/archive/relatorios/_INDEX.md](docs/archive/relatorios/_INDEX.md) | Histórico arquivado |

---

## Estrutura de páginas e API

### Páginas públicas (22 HTMLs + 1 template)

| Rota | Arquivo | Função |
|---|---|---|
| `/` | `index.html` | Home — categorias, top contribuidores, busca |
| `/eventos.html` | `eventos.html` | Módulo Eventos |
| `/oportunidades.html` | `oportunidades.html` | Módulo Oportunidades |
| `/moradia.html` | `moradia.html` | Módulo Moradia |
| `/compra-venda-feed.html` | `compra-venda-feed.html` | Módulo Compra e Venda |
| `/caronas-feed.html` | `caronas-feed.html` | Módulo Caronas |
| `/achados-perdidos.html` | `achados-perdidos.html` | Módulo Achados e Perdidos |
| `/ajuda.html` | `ajuda.html` | Central de ajuda (FAQ + help requests) |
| `/mensagens.html` | `mensagens.html` | Chat 1-a-1 (DM) — requer auth |
| `/profile.html` | `profile.html` | Perfil público (5 tabs) |
| `/my-posts.html` | `my-posts.html` | "Meus Posts" do usuário autenticado |
| `/create-post.html` | `create-post.html` | Criação de publicação |
| `/account-setup.html` | `account-setup.html` | Onboarding em 2 passos |
| `/auth-callback.html` | `auth-callback.html` | Callback pós-confirmação de e-mail |
| `/search-results.html` | `search-results.html` | Resultados de busca (FTS) |
| `/settings.html` | `settings.html` | Configurações do usuário |
| `/sobre.html` | `sobre.html` | Sobre a comunidade UFG |
| `/editorial.html` | `editorial.html` | Política editorial e curadoria |
| `/transparencia.html` | `transparencia.html` | Hub de transparência |
| `/privacidade.html` | `privacidade.html` | Política de privacidade (LGPD) |
| `/termos.html` | `termos.html` | Termos de uso |
| `/ods.html` | `ods.html` | Alinhamento com ODS (ONU) |
| `/404.html` | `404.html` | Página de erro 404 |
| `/product.html?id={uuid}` | `_product.html` (template) | Detalhe do produto (SSR via `/api/og-product`) |

### Páginas admin (6 HTMLs)

| Rota | Arquivo | Função |
|---|---|---|
| `/admin/` | `admin/index.html` | Dashboard principal (12+ métricas) |
| `/admin/moderation.html` | `admin/moderation.html` | Moderação de conteúdo |
| `/admin/banners.html` | `admin/banners.html` | Hero banners (carousel) |
| `/admin/reports.html` | `admin/reports.html` | Denúncias |
| `/admin/help-requests.html` | `admin/help-requests.html` | Tickets de suporte |
| `/admin/privacy-analytics.html` | `admin/privacy-analytics.html` | Métricas de privacidade (LGPD) |

### Serverless functions (Vercel, em `api/`)

| Endpoint | Função |
|---|---|
| `/api/sitemap` | Gera sitemap dinâmico com páginas estáticas + 100+ produtos |
| `/api/og-image?type={module}` | Gera imagem OG 1200×630 com `@vercel/og` |
| `/api/og-product?id={uuid}` | Renderiza página de produto com OG dinâmico (substitui `_product.html` em SSR) |
| `/api/feed.xml` | RSS 2.0 público das publicações aprovadas (PR #580, 2026-06-16) |

---

## Como rodar localmente

### Opção A - VS Code Live Server

1. Abra a pasta `kino-campus/` no VS Code.
2. Clique em `Go Live`.
3. Acesse `index.html`.

### Opção B - Python

```bash
python -m http.server 5500
```

Acesse `http://localhost:5500/index.html`.

---

## Ativação Supabase

### 1) Migrations

**Arquitetura atual (V76.47, 2026-06-21):** as 132 migrations legacy foram consolidadas em **1 baseline** + migrations operacionais incrementais. Os arquivos originais foram preservados em `supabase/migrations/_archive-v75/` para referência histórica.

| Arquivo | Tamanho | Função |
|---|---|---|
| `00000000000001_baseline_v76.sql` | ~410 KB | Schema `public` consolidado (PostgreSQL 17.6, `pg_dump --schema-only`). Validação local via `supabase db reset` |
| `20260622132300_audit_fixes_2026_06_22.sql` | ~10 KB | Migration operacional de auditoria (categorias/acentos/eventos passados). Aplicada em prod em 2026-06-22 |
| `_archive-v75/*.sql` | 132 arquivos | Cadeia legacy v8.x a v11.22 preservada para auditoria. **Não aplicar** |

Para um projeto novo:

1. `supabase schema-bootstrap-v8.1.2.3.sql` + `supabase schema-update-v8.1.3.2.sql` (bootstrap pré-migrations, fora do diretório `migrations/`)
2. Aplique a baseline consolidada: `00000000000001_baseline_v76.sql`
3. Aplique as migrations operacionais em ordem cronológica (atualmente apenas a `20260622132300_audit_fixes_2026_06_22.sql`)

Origem: PR #611 (`8fd3c19 feat(db): consolidate 132 legacy migrations into single baseline`). Documentação adicional em `docs/qa/reports/report-v76-migration-baseline-2026-06-21.md`.

> Para ambientes que já estavam na cadeia legacy, pode-se continuar aplicando via CLI em ordem alfabética; a baseline é o destino final consolidado para novos bancos.

### 2) Storage

Bucket esperado: `kino-media`.

- `post-media/{uid}/{postId}/{timestamp}-image-{n}.{ext}`
- `profile-avatars/{userId}/{timestamp}-avatar.{ext}`

### 3) KC_ENV

Edite/injete `assets/js/boot/kc-env.js`:

```javascript
environment: "production",
driver: "supabase",
supabase: {
  url: "https://SEU_PROJECT_ID.supabase.co",
  anonKey: "SUA_ANON_KEY",
  storageBucket: "kino-media"
}
```

Em produção, `driver = "supabase"` é obrigatório. `local` é apenas para desenvolvimento.

### 4) Edge Functions

Verificação remota (2026-06-22): o projeto Supabase `Kino Campus` (`wacyrkwhkvzwkqpolrbg`, West US/Oregon) tem **7 Edge Functions deployadas** (todas `ACTIVE`):

| Função | Versão | Função |
|---|---|---|
| `cadu-publish` | 7 | Publicação automática via Cadu Bot (Node CLI externo). JWT interno, `verify_jwt=false` |
| `kc-account-erasure` | 6 | LGPD Art. 18 VI — exclusão de conta em 2 passos com confirmação por e-mail |
| `kc-dispatch-notification-outbox` | 6 | Despacho de notificações via outbox (canal e-mail Resend + WhatsApp Twilio, gated por secrets) |
| `kc-external-access-decide` | 6 | Decisão de acesso externo (LGPD) — usado por admin para aprovar/negar pedidos |
| `kc-help-request-notify` | 5 | Notificação de help requests criados por usuários (canal admin) |
| `kc-invite-user` | 6 | Convite de novos usuários (gated por domínio UFG) |
| `notify-admin-reports-threshold` | 1 | Alerta por threshold de reports admin. Deploy em 2026-06-15 (PR #578); **fail-closed até configurar `KC_NOTIFY_HMAC_SECRET`, `ADMIN_REPORTS_WEBHOOK_URL` e `KC_APP_BASE_URL`** |

Deploy (uma por vez, ou todas):

```bash
supabase functions deploy cadu-publish
supabase functions deploy kc-account-erasure
supabase functions deploy kc-dispatch-notification-outbox
supabase functions deploy kc-external-access-decide
supabase functions deploy kc-help-request-notify
supabase functions deploy kc-invite-user
supabase functions deploy notify-admin-reports-threshold
```

Segredos obrigatórios de `kc-dispatch-notification-outbox`:

- `KC_NOTIFICATION_DISPATCH_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Segredos adicionais para o canal de e-mail (`v11.21.0`):

- `KC_NOTIFICATION_EMAIL_PROVIDER` (`resend`)
- `KC_NOTIFICATION_EMAIL_API_KEY`
- `KC_NOTIFICATION_EMAIL_FROM`
- opcionalmente `KC_NOTIFICATION_EMAIL_REPLY_TO`
- opcionalmente `KC_APP_BASE_URL`
- opcionalmente `KC_NOTIFICATION_DISPATCH_BATCH_LIMIT`

Segredos adicionais para o canal de WhatsApp (`v11.21.1`):

- `KC_NOTIFICATION_WHATSAPP_PROVIDER`
- `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID`
- `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN`
- `KC_NOTIFICATION_WHATSAPP_FROM`
- `KC_NOTIFICATION_WHATSAPP_CONTENT_SID`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_STATUS_CALLBACK`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_TEMPLATE_NAME`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_WINDOW_MINUTES`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_MAX_PER_WINDOW`

Observações:

- `cadu-publish` valida JWT internamente com conta dedicada (`verify_jwt=false` em `index.ts:21`)
- a `v11.21.0` publica essa função com envio real por e-mail via `Resend`, mas o projeto Supabase principal ainda precisa receber os segredos `KC_NOTIFICATION_EMAIL_*` para sair do gating operacional
- a `v11.21.1` implementa o canal privado de WhatsApp sem reutilizar o contato publico do perfil; o envio real depende dos segredos `KC_NOTIFICATION_WHATSAPP_*`
- a invocação exige o header `x-kc-dispatch-secret`
- a `v11.22.0` adiciona um scheduler no banco para consumir a outbox automaticamente

### 5) Cron jobs (pg_cron)

Quatro jobs agendados via `pg_cron` no banco principal (configurados em `docs/db-schema.md:629-640`):

| Job | Schedule | Função SQL | Origem |
|---|---|---|---|
| `kc-expire-old-posts` | `0 3 * * *` (03:00 diário) | `public.kc_expire_old_posts()` | Encerramento automático de posts fora de prazo |
| `kc-prune-analytics` | `0 4 1 * *` (04:00 dia 1) | `public.kc_prune_old_analytics()` | Limpeza de `search_queries` (>6m), `audit_log` (>1a), `post_view_events` (>6m) |
| `kc-prune-notifications` | `0 5 1 * *` (05:00 dia 1) | `public.kc_prune_old_notifications()` | Remove notificações lidas com > 90 dias |
| `kc-dispatch-notification-outbox` | `*/5 * * * *` (a cada 5 min) | `public.kc_trigger_notification_dispatch()` | Consome a outbox via `pg_net.http_post` chamando Edge Function. **Fail-closed** se `app.settings.kc_notify_*` ausentes |

### 6) Settings de banco fora do git

- `public.notification_dispatch_runtime.slot = 'primary'`
- `public.notification_dispatch_runtime.function_url`
- `public.notification_dispatch_runtime.dispatch_secret`
- opcionalmente `public.notification_dispatch_runtime.batch_limit`
- `app.settings.kc_notify_function_url`
- `app.settings.kc_notify_function_auth_token`
- `app.settings.kc_notify_hmac_secret`

---

## Regra de release

Sempre que houver release de frontend:

1. Definir uma versão-alvo única para todos os módulos de frontend.
2. Atualizar em lote as constantes `VERSION` dos arquivos mapeados.
3. Validar referências visuais de versão na UI.
4. Registrar a mudança em `README.md` e `CHANGELOG.md`.

> Para o fluxo completo de iteração (branch → PR → merge), ver [docs/architecture/ai-development-guide.md](docs/architecture/ai-development-guide.md).

---

## Fonte única de verdade do banco

A fonte oficial de verdade para banco é a esteira SQL do Supabase:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Não existe caminho operacional por `sql/` na raiz.

### Regra explícita para mudanças críticas

Qualquer mudança crítica de banco, incluindo auth, `verified`, policies, triggers, RLS, storage policies e grants/revokes, deve existir somente em:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Se surgir SQL fora do fluxo oficial:

1. Mover para `docs/archive/`.
2. Não usar operacionalmente em deploy ou setup.
3. Não recriar diretório `sql/` na raiz.

---

## Testes e QA

```bash
npm run check:all          # 6 gates: version, structure, scripts, routes, hygiene, search registry
npm test                   # Jest: 195 suites · 3806 testes
npx playwright test        # 13 specs E2E (chromium) — gate de regressão real
npm run benchmark:search-shadow # 12 cenários sintéticos, sem consultas reais
npm run check:search-registry   # confirma paridade do snapshot gerado
npm test -- --runInBand    # sequencial (mais lento, mais estável em CI)
```

Artefatos de QA: `docs/qa/` — checklist E2E, smoke RLS, payloads XSS e invariantes Vercel/Supabase. Índice de reports V54-V76+ em `docs/qa/reports/README.md`.

## CI/CD (GitHub Actions)

Dois workflows rodam em todo PR contra `kinocampus-V75.0-foundations`:

| Workflow | Arquivo | Função |
|---|---|---|
| Essential Validation | `.github/workflows/essential-validation.yml` | Roda `npm run check:all` (6 gates) + `npm test` (Jest) + `npx playwright test --list`. Adicionado no PR #551 (2026-06-11) |
| Lighthouse CI | `.github/workflows/lighthouse-ci.yml` | Roda `lhci autorun` em 4 URLs. Gates: a11y ≥ 0.90, SEO ≥ 0.90 (error); Performance ≥ 0.70, Best Practices ≥ 0.80 (warn) |

Ambos os workflows têm que passar para o merge ser possível.
