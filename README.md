# Kino Campus - v75.1.0

> Plataforma de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG).

Conecta alunos, professores e egressos em 6 módulos temáticos: Compra e Venda, Caronas, Moradia, Eventos, Oportunidades e Achados e Perdidos. O acesso é restrito a e-mails institucionais (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).

**Produção:** [kinocampus.com.br](https://www.kinocampus.com.br)  
**Branch principal:** `main`

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
| Testes | Jest (unitário/integração/contrato), Playwright E2E, pgTAP e verificações Deno/SQL |

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

## Funcionalidades

### Conteúdo e busca

| Feature | Como funciona | Onde |
|---|---|---|
| Criação de posts | Até 5 imagens com compressão client-side (`KCCompressImage`), upload via `supabase.posts-write.adapter.js`, gated por anti-spam (`kc_anti_spam_gate` trigger) | `create-post.html` + `assets/js/features/create-post/` |
| Busca FTS | `unaccent` + `portuguese` + `pg_trgm` (fuzzy); índice GIN; expansão de sinônimos no client | `search-results.html` + `assets/js/features/kc-search.js` (32 KB) |
| Feed paginado | Cursor via `kc_get_feed_cursor()` RPC; cache 3 min em sessionStorage; anti-duplicação por `Set` de IDs | `assets/js/controllers/public/kc-feed.controller.js` (1063 linhas) |
| Categorização | 6 módulos + subcategorias com taxonomia estática em `kc-constants.js` (33 KB) | `assets/js/boot/kc-constants.js` |

### Engajamento

| Feature | Como funciona |
|---|---|
| Comentários | Threading 1 nível (trigger `kc_check_comment_depth`); rate-limit; soft-delete |
| Votos | `hot`/`cold` (1 voto por usuário por post); aggregation em `profiles.rating_avg`/`rating_count` |
| Ranking de contribuidores | Top Contribuidores widget (períodos Hoje/Semana/Mês + filtro por módulo); `kc-ranking.js` (24 KB) |
| Avaliações de usuários | 1-5 estrelas com agregados; `v9.1.2.0_user_ratings_foundation.sql` |
| Posts salvos | Três estados: `favorite`, `later`, `highlight`; `v8.3.4.0_saved_posts.sql` |
| Reports de posts | Rate-limit 5/h via trigger; admin decide em `/admin/reports.html` |

### Comunicação e suporte

| Feature | Como funciona |
|---|---|
| Notificações in-app | Realtime publication em `notifications` table; `kc-notifications.js` (29 KB); sino com `display:none` quando deslogado |
| Chat 1-a-1 (DM) | Schema completo (`v9.3.5.10_chat_schema.sql` + 5 migrations de hardening); `chat-inbox.controller.js` (50 KB); rota `/mensagens` |
| Help requests | Formulário em `/ajuda.html`; pedidos LGPD visitantes usam Turnstile server-side, chave idempotente por sessão e recuperação sem reenviar PII; fila admin em `/admin/help-requests.html`; notificação via `kc-help-request-notify` para os fluxos que a exigem |
| Banners admin | Carousel no header; CRUD em `/admin/banners.html`; `v8.3.2.0_hero_banners.sql` |

### LGPD e privacidade

| Feature | Como funciona |
|---|---|
| Acesso, cópia e portabilidade | Solicitação direta autenticada em `/settings.html`, protocolo aleatório `KC-DSR-*` e histórico; exportação JSON `no-store`, com fluxo assistido no bucket privado `kino-data-exports` quando uma fonte excede os limites automáticos |
| Exclusão de conta (Art. 18 VI) | Confirmação verificada, preferência de cópia, restrições reversíveis, claim idempotente, limpeza de Storage/banco/Auth, checagem pós-operação e comprovante; `kc-account-erasure` + runbooks em `docs/privacy/` |
| Central de Ajuda | Formulário alternativo para quem perdeu acesso; visitante passa pelo gateway Turnstile, evita duplicidade mesmo após perda de resposta/reload, recebe referência de atendimento e só vincula o protocolo depois da verificação de identidade |
| Retenção de DSR e artefatos | Registro mínimo do protocolo tem revisão de retenção separada da janela de download; objetos assistidos são expurgados primeiro no Storage e só depois têm metadados minimizados |
| Administração vinculada à sessão | Claims de exclusão e novos claims de exportação assistida registram a sessão administrativa ativa; demissão, logout ou revogação impedem continuação privilegiada com a lease anterior |
| Consentimento de acesso externo | `v9.3.5.0_lgpd_consent_external_access.sql` + `kc-external-access-decide` Edge Function |
| Privacy analytics | Métricas em `/admin/privacy-analytics.html`; `v9.3.5.16_privacy_analytics.sql` |
| Anti-spam e rate-limit | Trigger `kc_anti_spam_gate`; `kc_check_post_flood_limit` RPC; controles admin-configuráveis |

Limites versionados da exportação:

| Caminho | Limites principais |
|---|---|
| Download direto | 2.500 linhas por categoria, 25.000 linhas/3 MiB de fontes, JSON final de 8 MiB, até 100 referências de mídia de chat e janela de 15 minutos |
| Suplemento assistido | 10.000 linhas por categoria, 100.000 linhas/12 MiB de fontes, artefato final de 16 MiB, lease inicial de 15 minutos, renovação para upload por 30 minutos e disponibilidade por até 7 dias |
| Retenção automática | lote máximo de 100 objetos, até 3 tentativas de remoção por execução e assinatura máquina-a-máquina válida por 120 segundos |

O contrato canônico está em
[`docs/privacy/data-subject-rights-map.md`](docs/privacy/data-subject-rights-map.md);
os procedimentos operacionais ficam em
[`docs/privacy/account-erasure-runbook.md`](docs/privacy/account-erasure-runbook.md),
o contrato de identidade/pós-core em
[`docs/privacy/account-erasure-identity-link-and-projection.md`](docs/privacy/account-erasure-identity-link-and-projection.md)
e o fluxo assistido de exportação em
[`docs/privacy/data-export-supplement-runbook.md`](docs/privacy/data-export-supplement-runbook.md).

### Automação (Cadu Bot)

Serviço externo em `services/cadu-ufg-publisher/` (14 módulos Node):

- **Publicação automática** de oportunidades acadêmicas UFG via cron externo
- **Edge Function `cadu-publish`** — gateway e handler validam o JWT da conta dedicada; o handler também exige allowlist de publisher confiável
- **Quality gates**: anti-SVG, anti-CDN temporária, anti-resumo-genérico, anti-link-morto, anti-prazo-vencido, score thresholds públicos
- **Anti-flood** com isenção para bot confiável (PR #529)
- **Cobertura**: 100+ produtos no `/sitemap.xml` publicados pelo Cadu

### Outbox de notificações

Padrão de produção sério com 4 status e retry desacoplado:

- `notification_delivery_outbox` (status: `queued`/`processing`/`sent`/`failed`/`blocked`/`cancelled`/`skipped`)
- `kc_claim_notification_delivery_batch` (claim atômico) + `kc_record_notification_delivery_attempt` (histórico)
- Scheduler pg_cron a cada 5 min consome via `pg_net.http_post` chamando `kc-dispatch-notification-outbox`
- **Fail-closed** se o runtime privado/fallback do dispatcher ou os secrets `KC_NOTIFICATION_DISPATCH_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` estiverem ausentes
- Canais: e-mail (Resend) + WhatsApp (Twilio), ambos gated por secrets

### Helpers runtime

- ~15-20 RPCs distintas em uso (`kc_get_feed_cursor`, `kc_search_posts_fts`, `kc_admin_list_help_requests_paged`, `kc_get_user_rating_summary`, etc.)
- Boot chain canônica: `kc-constants.js → kc-env.js → kc-feature-flags.js → kc-sw-register.js → kc-telemetry.js` (validado por `check:scripts`)
- Service Worker com kill-switch (`kc-env.js:55` define `flags['sw.enabled'] = false`; só ativa se flag for ligada)
- `kc-env.js` falha fechado em prod — se driver != supabase, seta `__invalid_production_driver__` (bloqueia fallback silencioso)

---

## Integrações e analytics

| Integração | Função | Implementação |
|---|---|---|
| **Google AdSense** | Monetização via anúncios em feeds (frequency cap explícito) | `ads.txt` + `supabase/migrations/20260605010000_feed_ads.sql` + `adsense_admin_monetization_runtime.sql` |
| **Google Tag Manager** | Telemetria consent-aware (LGPD) | `assets/js/boot/kc-google-tag.js` + `assets/js/boot/kc-consent.js` (consent banner) |
| **Vercel Speed Insights** | Core Web Vitals | `@vercel/speed-insights@2.0.0`; CSP permite `va.vercel-scripts.com` e `vitals.vercel-insights.com`. PR #549 merged em 2026-06-11 |
| **Vercel Analytics** | Page views e engagement | `<script defer src="/_vercel/insights/script.js">` em todos os HTMLs; rota first-party validada em produção |
| **Google Search Console** | Indexação e SEO monitoring | Verification meta em `index.html`; documentado em `docs/seo/` |
| **Service Worker** | Cache offline com kill-switch | `sw.js`; `kc-env.js:55` define `flags['sw.enabled'] = false` por default |

CSP em produção (`vercel.json:50-77`): `default-src 'self'` + whitelist específica para Supabase, jsdelivr, googletagmanager, googlesyndication, cdnjs, google-analytics, va.vercel-scripts.com (Speed Insights) e vitals.vercel-insights.com. HSTS 2 anos com preload, X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy desabilitando camera/mic/geo/interest-cohort.

---

## Feeds e discovery

| Endpoint | Função |
|---|---|
| `/sitemap.xml` | Gerado dinamicamente por `/api/sitemap`; páginas estáticas + 100+ produtos |
| `/feed.xml` | RSS 2.0 público das publicações aprovadas (`status='published'` + `visibility='public'`) |
| `/robots.txt` | Permite indexação de páginas públicas, bloqueia `/admin/` e endpoints `/api/*` |
| `/llms.txt` | Mapa estruturado da plataforma para agentes IA externos |
| `/ads.txt` | Autorização de vendedores de anúncios (Google AdSense) |

Páginas institucionais indexáveis (incluídas no sitemap, `llms.txt` e footer global):
- `/sobre.html` — Sobre a comunidade UFG
- `/editorial.html` — Política editorial e curadoria (PR #581, 2026-06-16)
- `/transparencia.html` — Hub de transparência (2026-06-02)
- `/privacidade.html` — Política de privacidade (LGPD)
- `/termos.html` — Termos de uso
- `/ods.html` — Alinhamento com ODS (ONU)

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

**Arquitetura atual:** as 132 migrations legacy foram consolidadas em **1 baseline**,
seguida pelas migrations operacionais incrementais em `supabase/migrations/`. Os
arquivos originais continuam preservados em `supabase/migrations/_archive-v75/`
somente para referência histórica.

| Arquivo | Tamanho | Função |
|---|---|---|
| `00000000000001_baseline_v76.sql` | ~410 KB | Schema `public` consolidado (PostgreSQL 17.6, `pg_dump --schema-only`). Validação local via `supabase db reset` |
| `20*.sql` | conjunto incremental | Migrations operacionais aplicadas estritamente em ordem cronológica; inclui os controles de privacidade, exportação e exclusão |
| `_archive-v75/*.sql` | 132 arquivos | Cadeia legacy v8.x a v11.22 preservada para auditoria. **Não aplicar** |

Para um projeto novo:

1. `supabase schema-bootstrap-v8.1.2.3.sql` + `supabase schema-update-v8.1.3.2.sql` (bootstrap pré-migrations, fora do diretório `migrations/`)
2. Aplique a baseline consolidada: `00000000000001_baseline_v76.sql`
3. Aplique todas as migrations operacionais ativas em ordem cronológica; não
   selecione apenas arquivos recentes e nunca aplique `_archive-v75/`.

Origem: PR #611 (`8fd3c19 feat(db): consolidate 132 legacy migrations into single baseline`). Documentação adicional em `docs/qa/reports/report-v76-migration-baseline-2026-06-21.md`.

> Para ambientes que já estavam na cadeia legacy, pode-se continuar aplicando via CLI em ordem alfabética; a baseline é o destino final consolidado para novos bancos.

### 2) Storage

| Bucket | Visibilidade | Uso |
|---|---|---|
| `kino-media` | público | posts e avatares (`post-media/...`, `profile-avatars/...`) |
| `kino-chat-media` | privado | anexos do chat; leitura limitada aos participantes por política e sessão ativa |
| `kino-data-exports` | privado | artefatos JSON temporários de exportação assistida; acesso somente por funções validadas |

O cutover de anexos legados de chat deve usar
`scripts/migrate-chat-media-to-private.ps1`: primeiro copiar e verificar o SHA-256,
depois publicar o frontend que lê o bucket privado e só então remover a cópia
legada. Não torne os dois buckets privados públicos para simplificar a migração.

### 3) KC_ENV

Edite/injete `assets/js/boot/kc-env.js`:

```javascript
environment: "production",
driver: "supabase",
supabase: {
  url: "https://SEU_PROJECT_ID.supabase.co",
  anonKey: "SUA_ANON_KEY",
  storageBucket: "kino-media",
  chatStorageBucket: "kino-chat-media"
}
```

Em produção, `driver = "supabase"` é obrigatório. `local` é apenas para desenvolvimento.

### 4) Edge Functions

O repositório mantém o conjunto abaixo. Estado e versão remotos são dados de
deploy, não contrato de código; consulte a Management API/CLI antes de diagnosticar
produção.

| Função | JWT no gateway | Responsabilidade |
|---|---|---|
| `cadu-publish` | `true` (default) | Publicação automática via Cadu Bot; o handler revalida usuário e allowlist |
| `cadu-auth-proxy` | fail-closed | endpoint legado aposentado; não autentica nem mantém credenciais |
| `kc-account-erasure` | `true` (default) | Exclusão em etapas, com confirmação, locks, limpeza, pós-condições e comprovante |
| `kc-analytics-subject-id` | `true` (TOML) | Deriva identificador analítico pseudônimo somente para sessão ativa e consentida |
| `kc-create-privacy-help-guest` | `false` (TOML) | Gateway público dos três pedidos LGPD visitantes; exige Turnstile válido e chama somente o wrapper SQL de `service_role` |
| `kc-data-subject-request` | `true` (TOML) | Cria, lista, consulta, cancela e entrega solicitações/exportações do próprio titular |
| `kc-data-export-admin` | `true` (TOML) | Monta e valida o suplemento integral assistido, com claims/CAS vinculados à sessão administrativa |
| `kc-data-export-retention` | `false` (TOML) | Worker máquina-a-máquina para expurgo Storage-first; exige assinatura HMAC curta derivada de segredo dedicado |
| `kc-dispatch-notification-outbox` | `false` (TOML) | Dispatch por secret próprio; e-mail Resend + WhatsApp Twilio, gated por secrets |
| `kc-external-access-decide` | `true` (default) | Decisão administrativa de acesso externo e comunicação por e-mail |
| `kc-ga4-reports` | `true` (default) | Proxy admin server-side para a GA4 Data API |
| `kc-help-request-notify` | `true` (TOML) | Reivindica e envia notificação de atendimento sem expor payloads sensíveis |
| `kc-invite-user` | `false` (TOML) | Convite externo; valida JWT e privilégio admin dentro do handler |
| `kc-search-console-reports` | `true` (TOML) | Proxy administrativo para relatórios do Search Console |
| `notify-admin-reports-threshold` | `true` (default) | Alerta HMAC de reports; fail-closed sem webhook e secrets operacionais |

O workflow `Deploy Edge Functions` executa um único preflight antes de qualquer
publicação: confere o projeto exato, toda a cadeia de migrations exigida, o schema
canônico em `scripts/verify-privacy-schema.sql` e os nomes de secrets requeridos
sem ler seus valores. Com o preflight aprovado, republica o conjunto completo de
funções para impedir deriva entre handlers compartilhados. O CLI lê os modos de
autenticação versionados em `supabase/config.toml`.

O fluxo manual de privacidade é deliberadamente não mutante por padrão:

```powershell
.\scripts\deploy-supabase-lgpd.ps1
# somente após revisar o preflight:
.\scripts\deploy-supabase-lgpd.ps1 -DeployFunctions
```

Nunca use `--no-verify-jwt` fora das funções explicitamente configuradas com
`verify_jwt = false`; mesmo nessas funções, o handler exige o segredo ou privilégio
próprio.

#### Ordem de rollout LGPD

O repositório descreve o contrato pretendido; ele não comprova quais migrations,
funções, secrets, jobs ou versões estão ativos no projeto remoto. Confirme o
`project-ref`, o histórico remoto e o schema antes de cada etapa.

1. **Banco/expand:** aplique as migrations aditivas e de hardening em ordem,
   até `20260729203000_help_privacy_guest_gateway_expand.sql`.
   Valide schema, grants, guards, recovery/quiescência e claims preexistentes. A
   `06000` adiciona as assinaturas vinculadas à sessão. Os cinco wrappers
   actor-only necessários à Edge anterior permanecem temporariamente executáveis
   apenas quando existe exatamente uma sessão administrativa ativa; zero ou
   múltiplas sessões falham fechado. Os workers privados continuam fechados.
2. **Edge:** configure origens/hostnames exatos, ambiente e secret Turnstile,
   rate-limit/WAF distribuído e alertas; publique
   `kc-create-privacy-help-guest` junto das versões compatíveis de
   `kc-data-export-admin`,
   `kc-data-subject-request`, `kc-account-erasure` e
   `kc-data-export-retention`. Execute canários com sessão administrativa ativa,
   revogada e substituída, além de retomada/expiração de lease, antes de ampliar
   tráfego.
3. **Frontend:** configure uma site key Turnstile real no build de produção e
   publique os clientes que preservam idempotência por conta,
   recuperam uma resposta perdida sem persistir o conteúdo pessoal do formulário,
   apresentam protocolo/referência corretamente e usam as ações Edge atuais.
4. **Cópia e verificação:** migre/verifique anexos privados, execute pgTAP,
   contract tests, preflights, advisors e smokes somente com contas
   descartáveis; confirme também buckets, jobs, Vault, telemetria de assinatura
   e a reconciliação de claims preexistentes: lease viva + uma sessão ativa é
   vinculada, enquanto os demais claims sem sessão viram falha retryable
   `EXPORT_SESSION_BINDING_MIGRATION_RETRY`.
5. **Contract diferido:** após canário e janela de cache, mova e renomeie o
   template pendente com um timestamp novo posterior ao histórico remoto.
   Somente essa migration posterior pode revogar as
   assinaturas públicas antigas e remover os guardas transitórios, após a Edge
   nova estar estável e a telemetria demonstrar ausência de consumidores
   antigos. A retirada do `UPDATE` legado de arquivamento de conversa também
   permanece diferida; não antecipe nenhum desses contratos no rollout expand.

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

- `cadu-publish` recebe JWT de usuário da conta dedicada; o gateway valida o token e o handler repete a validação antes de consultar `kc_trusted_publishers`
- a `v11.21.0` publica essa função com envio real por e-mail via `Resend`, mas o projeto Supabase principal ainda precisa receber os segredos `KC_NOTIFICATION_EMAIL_*` para sair do gating operacional
- a `v11.21.1` implementa o canal privado de WhatsApp sem reutilizar o contato publico do perfil; o envio real depende dos segredos `KC_NOTIFICATION_WHATSAPP_*`
- a invocação exige o header `x-kc-dispatch-secret`
- a `v11.22.0` adiciona um scheduler no banco para consumir a outbox automaticamente

### 5) Cron jobs (pg_cron)

Jobs versionados/esperados via `pg_cron`. A presença no repositório não comprova
que estejam ativos no projeto remoto; confirme `cron.job` e as tabelas privadas
de `schedule_state`:

| Job | Schedule | Função SQL | Origem |
|---|---|---|---|
| `kc-expire-old-posts` | `0 3 * * *` (03:00 diário) | `public.kc_expire_old_posts()` | Encerramento automático de posts fora de prazo |
| `kc-prune-analytics` | `0 4 1 * *` (04:00 dia 1) | `public.kc_prune_old_analytics()` | Limpeza de `search_queries` (>6m), `audit_log` (>1a), `post_view_events` (>6m) |
| `kc-prune-notifications` | `0 5 1 * *` (05:00 dia 1) | `public.kc_prune_old_notifications()` | Remove notificações lidas com > 90 dias |
| `kc-dispatch-notification-outbox` | `*/5 * * * *` (a cada 5 min) | `public.kc_trigger_notification_dispatch()` | Consome a outbox via `pg_net.http_post`. **Fail-closed** sem `notification_dispatch_runtime` ou fallback `app.settings.kc_notification_dispatch_*` |
| `kc-refresh-highlight-scores` | `15 */6 * * *` | `public.kc_refresh_highlight_scores()` | Recalcula scores denormalizados do feed |
| `kc-dsr-retention-purge-daily` | `17 3 * * *` | `kc_private.kc_purge_expired_data_subject_requests(500)` | Minimiza protocolos vencidos; falhas/atendimentos parciais viram alerta |
| `kc-help-notification-claim-purge-daily` | `41 3 * * *` | `kc_private.kc_purge_help_request_notification_claims(500)` | Expurga claims de notificação vencidos |
| `kc-erasure-completion-outbox-purge-hourly` | `11 * * * *` | `kc_private.kc_purge_expired_account_erasure_completion_outbox(500)` | Expurga destinatários cifrados vencidos |
| `kc-data-export-retention-purge` | `*/15 * * * *` | `kc_private.kc_trigger_data_export_retention(50, 'pg_cron')` | Aciona o worker Storage-first por HMAC curto |
| `kc-data-export-retention-monitor` | `7 * * * *` | `kc_private.kc_monitor_data_export_retention()` | Detecta execução travada, backlog e ausência de sucesso recente |

### 6) Settings de banco fora do git

- `public.notification_dispatch_runtime.slot = 'primary'`
- `public.notification_dispatch_runtime.function_url`
- `public.notification_dispatch_runtime.dispatch_secret`
- opcionalmente `public.notification_dispatch_runtime.batch_limit`
- fallback `app.settings.kc_notification_dispatch_function_url`
- fallback `app.settings.kc_notification_dispatch_secret`
- fallback `app.settings.kc_notification_dispatch_batch_limit`
- para `notify-admin-reports-threshold`:
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
npm test                   # Jest unitário, integração e contratos
npx playwright test        # E2E em navegador real (chromium)
supabase test db --local supabase/tests # pgTAP/RLS/RPC após db reset local
npm run benchmark:search-shadow # 12 cenários sintéticos, sem consultas reais
npm run check:search-registry   # confirma paridade do snapshot gerado
npm test -- --runInBand    # sequencial (mais lento, mais estável em CI)
```

Artefatos de QA: `docs/qa/` — checklist E2E, smoke RLS, payloads XSS e invariantes Vercel/Supabase. Índice de reports V54-V76+ em `docs/qa/reports/README.md`.

## CI/CD (GitHub Actions)

Dois workflows rodam em todo PR contra `main`:

| Workflow | Arquivo | Função |
|---|---|---|
| Essential Validation | `.github/workflows/essential-validation.yml` | Roda `npm run check:all` (6 gates) + `npm test` (Jest) + `npx playwright test --list`. Adicionado no PR #551 (2026-06-11) |
| Lighthouse CI | `.github/workflows/lighthouse-ci.yml` | Roda `lhci autorun` em 4 URLs. Gates: a11y ≥ 0.90, SEO ≥ 0.90 (error); Performance ≥ 0.70, Best Practices ≥ 0.80 (warn) |

Ambos os workflows têm que passar para o merge ser possível.
