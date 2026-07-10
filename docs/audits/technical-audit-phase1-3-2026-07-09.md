# Auditoria técnica KinoCampus — Fases 1 a 3

**Data:** 2026-07-09  
**Branch de trabalho:** `codex/audit-phase2-phase3-2026-07-09`  
**Base observada após pull/rebase:** `kinocampus-V75.0-foundations` em `6755ec1a`  
**Escopo desta iteração:** aprofundar Fase 1, executar Fase 2 e iniciar Fase 3 com correções pequenas, seguras e testadas.

**Continuação:** as evidências das Fases 4 a 6, incluindo performance, segurança e operação GitHub-Vercel-Supabase, estão registradas em `docs/audits/technical-audit-phase4-6-2026-07-09.md`.

## Resumo executivo

O repositório é uma aplicação web estática/serverless em JavaScript vanilla, hospedada na Vercel, com Supabase como backend principal e Edge Functions para fluxos administrativos/privados. A base também contém um subsistema Cadu/OpenClaw via proxies Vercel (`api/cadu/*`) e um serviço Node `services/cadu-ufg-publisher`.

Achado prático mais relevante desta rodada: o manifesto canônico de páginas estava incompleto. `404.html`, `mensagens.html` e `admin/cadu.html` existiam, tinham cadeia de boot válida e eram usadas pela plataforma, mas não eram cobertas pelos validadores estruturais centrais. Isso escondia problemas reais de i18n e fazia parte da documentação ficar falsa. Corrigi o manifesto e os testes associados.

O PR de hardening GA4 (`#638`) já foi mergeado na base antes desta consolidação. Portanto, o risco de CORS amplo/limite excessivo/cache-key frágil na Edge Function `kc-ga4-reports` está resolvido no código atual, embora ainda exista a recomendação operacional de manter `KC_GA4_ALLOWED_ORIGINS` configurado no ambiente.

Não executei alterações destrutivas, migrations, deploy manual, alteração de secrets nem comandos no banco de produção.

## Histórico do pedido e estado atual

| Pedido/linha de trabalho | Estado observado | Evidência |
|---|---|---|
| Auditoria faseada ampla | Em andamento; Fases 1-3 consolidadas neste documento | Este arquivo |
| GA4 admin dashboard | Concluído antes desta rodada | `admin/ga4-dashboard.html`, controller e testes na base |
| Hardening GA4 Edge Function | Concluído/mergeado | PR `#638`, `supabase/functions/kc-ga4-reports/index.ts` |
| Admin Cadu/OpenClaw/pipeline | Funcionalidade extensa já existe, mas há riscos/documentação operacional pendentes | `admin/cadu.html`, `assets/js/controllers/admin/admin-cadu.controller.js`, `api/cadu/*`, docs Cadu |
| Manifesto de páginas/testes | Corrigido nesta rodada | `scripts/admin-pages.manifest.js`, `tests/*` |
| Documentos externos Minimax | Não encontrados neste ambiente | `C:\Users\yan1n.minimax-agent\projects\kino-campus-audit\` não retornou arquivos |

## Fase 1 — Mapa técnico observado

### Stack principal

**Fato observado:** `package.json` define projeto CommonJS, frontend sem framework, Jest, Playwright, Lighthouse CI e Vercel. Dependências runtime diretas são `@vercel/analytics`, `@vercel/og` e `@vercel/speed-insights`; o restante é dev/test.

**Inferência:** a plataforma preserva arquitetura estática/offline-first com módulos globais em `window.*`, evitando bundler e build complexo. Isso reduz risco de build, mas aumenta acoplamento por ordem de scripts.

### Estrutura de pastas

| Pasta/arquivo | Responsabilidade observada |
|---|---|
| `*.html` raiz | Rotas públicas e autenticadas estáticas |
| `admin/*.html` | Páginas administrativas estáticas |
| `assets/js/boot` | Ambiente, feature flags, service worker, telemetria |
| `assets/js/api` | Fachada KCAPI e cliente Supabase |
| `assets/js/adapters` | Drivers local e Supabase |
| `assets/js/controllers/public` | Controllers por página pública |
| `assets/js/controllers/admin` | Controllers administrativos |
| `assets/css` | CSS global e CSS por superfície |
| `api` | Functions Vercel Node/serverless |
| `server` | Helpers server-side compartilhados, hoje `cadu-auth.mjs` |
| `supabase/functions` | Edge Functions Deno |
| `supabase/migrations` | Baseline v76 + migrations incrementais |
| `.github/workflows` | Validação, Lighthouse, email, deploy Edge Functions |
| `services/cadu-ufg-publisher` | Pipeline Node para curadoria/publicação Cadu |
| `docs` | Arquitetura, runbooks, auditorias, QA e Cadu/OpenClaw |

### Rotas e páginas

**Fato observado depois da correção:** o manifesto canônico cobre 32 HTMLs: 24 públicos e 8 admin.

Páginas públicas no manifest: `index.html`, `404.html`, `_product.html`, `account-setup.html`, `achados-perdidos.html`, `ajuda.html`, `auth-callback.html`, `caronas-feed.html`, `compra-venda-feed.html`, `create-post.html`, `editorial.html`, `eventos.html`, `mensagens.html`, `moradia.html`, `my-posts.html`, `ods.html`, `oportunidades.html`, `profile.html`, `privacidade.html`, `search-results.html`, `settings.html`, `sobre.html`, `transparencia.html`, `termos.html`.

Páginas admin no manifest: `admin/index.html`, `admin/moderation.html`, `admin/reports.html`, `admin/banners.html`, `admin/cadu.html`, `admin/help-requests.html`, `admin/privacy-analytics.html`, `admin/ga4-dashboard.html`.

**Ponto de atenção:** `vercel.json` tem rewrite explícito para `/mensagens`, mas não há rewrite explícito para todas as rotas admin extensionless. A validação local confirma arquivos, não confirma comportamento HTTP de clean URLs em produção.

### APIs e serverless

**Vercel Functions observadas:**

- `api/feed.js`, `api/sitemap.js`, `api/og-image.js`, `api/og-product.js`
- `api/cadu/health.js`, `sites.js`, `feed.js`, `feed-diagnostics.js`, `publish.js`, `pipeline.js`, `pipeline-router.js`, `openclaw-router.js`

**Cadu proxy:** `server/cadu-auth.mjs` valida JWT Supabase, chama `kc_is_admin` e faz fallback para `profiles.is_admin`. Os proxies usam `CADU_API_TOKEN` apenas server-side.

**Risco observado:** Cadu aceita `kc_admin_token` em query por necessidade de EventSource/window.open e depois remove antes de encaminhar à VPS. Isso não é endpoint aberto, mas token em query aumenta risco de vazamento em histórico/logs.

### Supabase

**Edge Functions observadas:** `cadu-publish`, `kc-account-erasure`, `kc-dispatch-notification-outbox`, `kc-external-access-decide`, `kc-ga4-reports`, `kc-help-request-notify`, `kc-invite-user`, `notify-admin-reports-threshold`.

**Migrations observadas:** baseline `00000000000001_baseline_v76.sql` e migrations incrementais de chat, auditoria e hardening até `20260707000000_security_linter_fixes.sql`.

**Contagem estática relevante:**

- Baseline v76: 40 `enable row level security`, 106 `create policy`, 88 `SECURITY DEFINER`, 19 usos de `auth.role()`.
- Migrations recentes ainda adicionam funções `SECURITY DEFINER`, mas com grants explícitos em alguns casos.

**Interpretação:** não há P0 confirmado apenas por contagem. Há P1 de auditoria manual porque `SECURITY DEFINER` + Supabase + schema exposto é zona crítica e `auth.role()` está deprecado nas recomendações atuais.

### Vercel e deploy

`vercel.json` define `buildCommand: node scripts/inject-env.js`, rewrites de feed/sitemap/OG/Cadu e headers de segurança. HTML tem `Cache-Control: no-cache`; assets versionados têm cache longo.

`.github/workflows/edge-deploy.yml` faz deploy automático de Edge Functions quando há push em `kinocampus-V75.0-foundations` com mudanças em `supabase/functions/**`.

**Risco operacional:** merges em Edge Functions podem alterar produção automaticamente. Isso é útil, mas exige PRs pequenos e validação antes do merge.

### Fluxos críticos mapeados

| Fluxo | Implementação observada |
|---|---|
| Auth frontend | `assets/js/api/kc-supabase.client.js`, KCAPI, Supabase Auth |
| Criação/edição de posts | `create-post.html`, adapters `posts-write`, RPCs/migrations |
| Feed/listagem/busca | `kc-feed.controller.js`, `kc-search.js`, Supabase/local adapters |
| Mensagens | `mensagens.html`, `chat-inbox.controller.js`, migrations de chat |
| Admin moderação/denúncias/banners/ajuda | `admin/*.html`, controllers admin, RPCs |
| Admin Cadu/OpenClaw | `admin/cadu.html`, `admin-cadu.controller.js`, `api/cadu/*`, VPS/OpenClaw |
| Analytics GA4 | `admin/ga4-dashboard.html`, `kc-ga4-reports` Edge Function |
| Notificações | `kc-notifications.js`, notification outbox Edge Function |

### Testes e gates

`npm run check:all` executa version map, estrutura, scripts, rotas, hygiene, search registry e Jest. Playwright é separado em scripts próprios. Nesta rodada, `check:all` passou com 201 suítes e 3896 testes.

## Fase 2 — Divergências documentação x estado real

| Item/documento | O que afirmava | Estado real observado | Classificação | Impacto | Prioridade | Recomendação/status |
|---|---|---|---|---|---|---|
| Diretório externo `kino-campus-audit` | Relatórios adicionais estariam em `C:\Users\yan1n.minimax-agent\projects\kino-campus-audit\` | Caminho não retornou arquivos nesta máquina | Ponto exige validação manual | Pode haver histórico fora do alcance desta auditoria | P2 | Validar se o diretório existe em outro usuário/máquina |
| Manifesto de páginas | Cobertura canônica omitindo `404`, `mensagens`, `admin/cadu` | Arquivos existem e passam boot/a11y básica | Código divergente da documentação/teste | Regressões podiam escapar dos gates | P1 | Corrigido nesta rodada |
| `docs/architecture/css-architecture.md` | Dizia que `mensagens.html` ainda não fazia parte do manifest | Agora faz parte, junto com `404` e `admin/cadu` | Documento desatualizado | Orientava futuras IAs incorretamente | P2 | Corrigido nesta rodada |
| Testes KCAPI | Alguns testes assumiam que todo HTML canônico carrega todos os módulos KCAPI | `admin/cadu.html` não usa KCAPI; `404.html` usa subconjunto | Código/teste divergente | Falha ao ampliar manifest; contrato impreciso | P1 | Corrigido com filtros explícitos |
| i18n declarativo | Páginas tinham chaves `data-i18n-*` inexistentes no dicionário | Chaves ausentes em `mensagens` e `admin/cadu` | Risco técnico confirmado | Tradução/runtime retornava a própria chave | P1 | Corrigido nesta rodada |
| GA4 audit | Seção dizia hardening pendente de merge | PR `#638` está mergeado; checks verdes | Documento desatualizado | IA futura poderia repetir trabalho ou não confiar no estado | P2 | Corrigido nesta rodada |
| Cadu handoff | Diz que `/api/cadu/*` exige admin JWT exceto health | Código confirma `requireCaduAdmin` nos proxies principais; `health` é público | Documento consistente | Baixo | P3 | Manter |
| Cadu handoff | Token por query em artifacts/log/export é risco conhecido | Código confirma `kc_admin_token` via query no proxy | Risco provável | Logs/histórico podem reter token | P1 | Planejar migração para Bearer quando UX permitir |
| Cadu handoff | `pipeline.js` pode estar órfão/duplicado frente a `pipeline-router.js` | Ambos existem; `vercel.json` reescreve subpaths para router | Risco técnico provável | Manutenção duplicada e confusão operacional | P2 | Auditar tráfego/imports antes de remover |
| Admin nav | Manifest agora cobre Cadu e GA4 | Várias páginas admin têm link Cadu mas não GA4 no nav principal | Código divergente | Navegação admin inconsistente | P2 | Corrigir em rodada UI dedicada |

## Fase 3 — Qualidade de código e dívida técnica

### P0

Nenhum P0 confirmado nesta rodada sem acesso destrutivo ao banco/produção. Não há evidência local de secret ativo exposto em frontend ou endpoint Cadu aberto sem auth.

### P1

| Achado | Arquivos | Evidência | Impacto | Risco de mexer | Sugestão | Status |
|---|---|---|---|---|---|---|
| Manifesto canônico incompleto | `scripts/admin-pages.manifest.js`, testes | `404`, `mensagens`, `admin/cadu` ausentes antes da correção | Gaps de validação e i18n escondido | Baixo | Incluir páginas reais e ajustar contratos | Corrigido |
| Chaves i18n faltantes | `assets/js/core/kc-i18n.js`, `mensagens.html`, `admin/cadu.html` | `meta-title.chat`, `placeholder.cadu-openclaw-input`, etc. ausentes | UX/a11y degradados | Baixo | Adicionar chaves mínimas | Corrigido |
| `SECURITY DEFINER` e `auth.role()` em baseline | `supabase/migrations/00000000000001_baseline_v76.sql` | 88 ocorrências de `SECURITY DEFINER`, 19 de `auth.role()` | Potencial bypass/RLS frágil se função pública estiver mal grantada | Alto | Rodar advisors e revisar função por função antes de migration | Documentar/agendar |
| Token admin via query em Cadu | `server/cadu-auth.mjs`, `api/cadu/*` | `kc_admin_token` aceito para SSE/download | Possível vazamento em logs/histórico | Médio | Preferir Bearer e short-lived handoff token específico para SSE/download | Documentar/agendar |
| Edge Function deploy automático | `.github/workflows/edge-deploy.yml` | Push na base com `supabase/functions/**` dispara deploy | Mudança de produção via merge | Médio | Manter PRs pequenos; considerar environment approval para funções críticas | Documentar/agendar |

### P2

| Achado | Arquivos | Evidência | Impacto | Sugestão |
|---|---|---|---|---|
| Controllers muito grandes | `admin-cadu.controller.js` ~130 KB, `chat-inbox.controller.js` ~92 KB | Top 20 arquivos JS por tamanho | Manutenção lenta, alto risco de regressão | Extrair submódulos por aba/feature com testes antes |
| Admin nav inconsistente | `admin/*.html` | GA4 ausente na nav principal de várias páginas | Descoberta/navegação ruim | Padronizar nav via fragment/helper ou teste |
| `pipeline.js` e `pipeline-router.js` coexistem | `api/cadu/*` | Dois proxies de pipeline | Ambiguidade operacional | Confirmar tráfego e remover/deprecar um |
| Docs volumosos e por vezes contraditórios | `docs/CADU-ADMIN-STATE.md`, `docs/CODEX-CADU-HANDOFF.md`, `docs/architecture/*` | Muitas seções históricas e estados vivos misturados | IA futura pode usar pista antiga como verdade | Criar índice “estado atual primeiro” por domínio |
| Sem tipagem estática | Projeto JS vanilla | Sem TypeScript/typecheck | Contratos quebram por string/order | Expandir testes contratuais antes de refatorar |

### P3

| Achado | Evidência | Sugestão |
|---|---|---|
| Comentários antigos “22 HTMLs”, “6 páginas admin” | Vários testes/docs ainda usam linguagem histórica | Trocar por “HTMLs canônicos” gradualmente |
| Warnings verbosos esperados em Jest | `console.error`/`console.warn` em testes que exercitam erro | Avaliar mocks de console por suite para reduzir ruído |
| `docs/architecture/css-architecture.md` tem contagens antigas de CSS | Seção de inventário ainda fala em 30 HTMLs descobertos | Rodar `npm run audit:css` e atualizar em rodada própria |

## Correções aplicadas nesta rodada

1. Incluí `404.html`, `mensagens.html` e `admin/cadu.html` em `scripts/admin-pages.manifest.js`.
2. Atualizei testes admin para usarem o manifest compartilhado.
3. Ajustei testes KCAPI para distinguir páginas que não carregam a cadeia KCAPI completa.
4. Adicionei chaves i18n faltantes usadas por `mensagens.html` e `admin/cadu.html`.
5. Atualizei `docs/architecture/css-architecture.md` e `docs/analytics/GA4-AUDIT-2026-07-08.md` para refletirem o estado real.

## Validação executada

- `node scripts/validate-repository-structure.js`
- `node scripts/validate-script-chains.js`
- `node scripts/validate-public-routes.js`
- `npm run check:all` — 201 suítes, 3896 testes, tudo passou
- `npx playwright test tests/e2e/admin-pages.spec.js --workers=1` — 8 testes admin passaram, incluindo Admin Cadu

## Próximos passos seguros

1. Fase 3 continuação: revisar `SECURITY DEFINER`/grants/RLS por função com advisors Supabase antes de qualquer migration.
2. Padronizar a navegação admin para incluir Cadu e GA4 de forma consistente em todas as páginas.
3. Auditar e decidir destino de `api/cadu/pipeline.js` versus `api/cadu/pipeline-router.js`.
4. Rodar inventário CSS atualizado e corrigir contagens antigas em `docs/architecture/css-architecture.md`.
5. Transformar o risco de `kc_admin_token` em query em plano técnico: token efêmero específico para SSE/download ou alternativa compatível com EventSource.

