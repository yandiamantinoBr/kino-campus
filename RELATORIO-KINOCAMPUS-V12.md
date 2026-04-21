# RELATÓRIO KINOCAMPUS v12

**Plano Diretor de Consolidação e Qualidade Sistêmica**

| Campo | Valor |
|---|---|
| Data de abertura | 20 de abril de 2026 |
| Linha-base | `kinocampus-V11.0-foundations` |
| Estado desta fase | execução em andamento; `v12.0.0`–`v12.2.7` concluídas (abertura, auditoria, splits `string`, `format`, `dom`, `identity`, `taxonomy`, `location`, `presentation` e gate formal `<900L`); `kc-utils.js` consolidado em `440L` com hygiene `_KCU.*` ativa nos 22 HTMLs canônicos; próxima é `v12.3.0` — auditoria docs-only de `admin-dashboard.controller.js`; baseline preservada em `106/106` suites e `2212/2212` testes |
| Versão-alvo | v12 |
| Escopo macro | consolidação arquitetural dos hotspots remanescentes, elevação da maturidade sistêmica (feature flags, E2E, Lighthouse CI, a11y, i18n runtime) e resiliência operacional (Service Worker, telemetria cliente) — sem quebra de contratos públicos, sem regressão visual, sem quebra de testes |
| Documento vivo | sim; deve ser atualizado a cada iteração da v12 |

---

## 1. Resumo executivo

A v12 não é uma continuação ingênua da v11. Ela **herda** a linha-base, o rito operacional e os contratos públicos consolidados na v11, mas muda o **eixo narrativo** do trabalho:

- a v11 foi uma esteira de **auditoria + hardening + redução de hotspots**, fechando 11 sub-módulos `window._KCAPI.*`, 10 sub-adapters `window._KCSA.*` e reduzindo o facade `kc-api.client.js` de `~3500L` para `2410L`;
- a v12 é uma esteira de **consolidação do que foi fatiado + elevação de maturidade sistêmica**, operando em três camadas paralelas:

> **Camada A — Continuação tática v11**
> Aplicar o padrão IIFE + namespace já validado em `_KCAPI` e `_KCSA` aos hotspots remanescentes (`kc-utils.js`, `admin-dashboard.controller.js`, `local.adapter.js`, `profile.controller.js`), criando `window._KCU.*`, `window._KCAD.*`, `window._KCLA.*`.
>
> **Camada B — Qualidade sistêmica**
> Introduzir gaps estruturais que a v11 deliberadamente não cobriu: feature flags formais (`window.KCFF`), Playwright E2E, Lighthouse CI, auditoria a11y estrutural, i18n em runtime (extensão do trabalho docs-only da v11.24.x).
>
> **Camada C — Resiliência & observabilidade**
> Service Worker para resiliência offline (atrás de kill-switch) e telemetria cliente (`kc-telemetry.js`) para visibilidade operacional real em produção.

O princípio central da v12 é idêntico ao da v11, herdado sem reinterpretação:

> **melhorar a plataforma sem quebrar contratos públicos, sem introduzir drift entre arquivos equivalentes e sem alterar um ponto compartilhado sem validar toda a malha relacionada.**

A v12 é executada em fatias pequenas, rastreáveis e reversíveis, sempre com:

- branch dedicada a partir de `kinocampus-V11.0-foundations`
- commit, push, PR, merge, delete branch e pull
- validação local (`npm test`, `node scripts/hygiene-check.js`)
- validação Supabase quando houver SQL (pouco frequente nesta v12)
- validação Vercel/browser após deploy
- atualização obrigatória deste relatório, do `README.md` e do `CHANGELOG.md`

---

## 2. Fontes obrigatórias de verdade para a v12

Este planejamento foi construído com base nas seguintes fontes herdadas diretamente da v11:

- `README.md` (estado canônico do repositório)
- `CHANGELOG.md`
- `RELATORIO-KINOCAMPUS-V11.md` (sequência completa das iterações v11.1.0–v11.33.7)
- `docs/kc-api-client-audit-v11.32.md` e `docs/kc-api-client-audit-v11.33.md` (auditorias do facade)
- `docs/monolith-audit-v11.30.md` (auditoria dos dois grandes monolitos da época, incluindo `product.controller.js`)
- `docs/roadmap-v11.25-v11.30.md`
- `docs/i18n-a11y-uxwriting-plan.md` (plano ainda parcialmente executado — trilha B2 da v12 continua)
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/db-schema.md`
- `docs/rpc-catalog.md`
- `docs/module-schemas.md`
- `docs/design-system.md`
- `docs/env-vars.md`
- `docs/ops/vercel-supabase-invariants.md`
- `docs/qa/*`
- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`
- `supabase/functions/*`

Regras de precedência (inalteradas em relação à v11):

1. O comportamento real do código e do banco prevalece sobre documentação desatualizada.
2. Para banco, a fonte oficial continua sendo `supabase/schema-*.sql` e `supabase/migrations/*.sql`.
3. Para contratos de frontend, `KCAPI`, adapters, controllers compartilhados e HTMLs equivalentes continuam superfícies públicas sensíveis.
4. Qualquer divergência encontrada entre docs e código vira item explícito de backlog da v12.

Novas fontes de verdade criadas durante a v12 (adicionadas à medida que as iterações evoluem):

- `docs/kc-utils-audit-v12.1.md` (auditoria do próximo hotspot; a criar em `v12.1.0`)
- `docs/admin-dashboard-audit-v12.3.md`
- `docs/local-adapter-audit-v12.4.md`
- `docs/profile-controller-audit-v12.5.md`
- `docs/feature-flags-plan-v12.6.md`
- `docs/e2e-playwright-plan-v12.9.md`
- `docs/lighthouse-ci-plan-v12.10.md`
- `docs/service-worker-plan-v12.11.md`
- `docs/telemetry-plan-v12.12.md`

---

## 3. Inventário atual do repositório (baseline v12.0.0)

### 3.1. Estrutura principal (herdada da v11, validada na abertura)

- páginas HTML públicas na raiz: `17`
- páginas HTML administrativas: `5`
- arquivos JS em `assets/js`: `~74` (houve acréscimo via sub-módulos `_KCAPI.*` e `_KCSA.*` na v11)
- controllers em `assets/js/controllers`: `23`
- adapters em `assets/js/adapters`: `12` (1 facade + 1 shared + 10 sub-adapters)
- testes Jest: `99` suites, `1874` testes verdes
- hygiene-check: versão canônica `8.6.0` ✓

### 3.2. Namespaces públicos internos congelados pela v11

- **`window.KCAPI`** — facade principal, cliente da API (driver-agnóstica)
- **`window._KCAPI.*`** — sub-módulos do facade (11 operacionais):
  - `notifications`, `saved`, `help`, `postsRead`, `commentsVotes`, `ratings`, `postsFeed`, `postsWrite`, `profiles`, `related`, `auth`
- **`window.KCSA`** — facade do adapter Supabase
- **`window._KCSA.*`** — sub-adapters (10 operacionais):
  - `profiles`, `postsWrite`, `postsRead`, `saved`, `media`, `votes`, `comments`, `admin`, `analytics`, `notifications`
- **`window.KCProduct._KCProduct.*`** — sub-módulos do controller da página de produto (split v11.30.x):
  - `report`, `related`, `calendar`, `save`, `ratings`, `edit`, `analytics`, `popovers`
- **`window._KCCreatePost.*`** — sub-módulos do runtime de criação (split v11.31.x):
  - `schema`, `media`, `resolvers`, `fields`, `submit`, `render`
- **`window.KCUtils`** — utilitários gerais
- **`window.KCi18n`** — módulo de i18n (pt-BR, 120+ chaves)
- **`window.KCSessionStore`** — SWR / cache de sessão
- **`window.KCOverlayLock`** — lock de scroll em modais
- **`window.KCLazyLoader`** — lazy load de módulos grandes
- **`window.KCFeedFilters`** — filtros canônicos dos feeds

Estes namespaces são **contratos públicos internos** — qualquer mudança de shape/interface sem aviso explícito é regressão documentada. A v12 respeita todos.

### 3.3. Hotspots JS remanescentes (>1000 linhas, alvos de redução na Camada A)

| Arquivo | Linhas | Tamanho | Alvo iteração | Prioridade |
|---|---|---|---|---|
| `assets/js/kc-api.client.js` | `2410L` | `~100KB` | já reduzido ao piso natural (registry/wiring) | pausa |
| `assets/js/kc-utils.js` | `2445L` | `~95KB` | `v12.1.0`–`v12.2.6` | 🥇 1º |
| `assets/js/admin-dashboard.controller.js` | `2251L` | `~88KB` | `v12.3.0`–`v12.3.4` | 🥈 2º |
| `assets/js/local.adapter.js` | `1862L` | `~72KB` | `v12.4.0`–`v12.4.6` | 🥉 3º |
| `assets/js/profile.controller.js` | `1463L` | `~56KB` | `v12.5.0`–`v12.5.4` | 4º |
| `assets/js/kc-supabase.client.js` | `1364L` | `~53KB` | avaliação pós-`v12.5.4` | pausa |
| `assets/js/oportunidades.controller.js` | `1246L` | `~51KB` | avaliação pós-`v12.5.4` | pausa |
| `assets/js/kc-comments.js` | `1068L` | `~48KB` | avaliação pós-`v12.5.4` | pausa |
| `assets/js/kc-auth.ui.js` | `909L` | `~52KB` | sem split programado | pausa |

**Critério de parada de splits na v12:** quando o maior arquivo JS em `assets/js/` cair abaixo de **1000 linhas** (previsto após `v12.5.4`), os esforços migram integralmente para as camadas B e C. A v13 eventual retoma splits dos demais se justificável.

### 3.4. Gaps estruturais identificados (alvos das Camadas B e C)

- **Sem testes E2E** — só Jest estático + DOM; nenhum fluxo real coberto
- **Sem Lighthouse CI** em nenhum pipeline
- **Sem Service Worker** — zero resiliência offline, zero cache-first
- **Sem sistema formal de feature flags** — flags existem dispersos como `ENV.*` (~62 usos mapeados em auditoria preliminar)
- **~250-300 strings hardcoded pt-BR** (aria-label, role, mensagens inline) em HTMLs e controllers; plano detalhado existe em `docs/i18n-a11y-uxwriting-plan.md` desde a v11.24.0 mas só parcialmente executado (componentes core em v11.24.2 e templates auth em v11.24.3)
- **Sem Storybook / catálogo de componentes** — fora do escopo explícito da v12 (arquivado para v13+)

---

## 4. Premissas operacionais da v12

Herdadas integralmente da v11, sem reinterpretação:

- **Branch-per-iteração**: toda iteração da v12 tem sua própria branch derivada de `kinocampus-V11.0-foundations`, nomeada `feature/v12.X.Y-nome-curto`.
- **Esteira completa**: commit → push → PR → merge squash → delete branch remoto → delete branch local → pull.
- **Base de PR**: `kinocampus-V11.0-foundations` (não criar branch-foundation nova na v12; eventual renomeação é discussão de abertura da v13).
- **Gate Jest**: `npm test` deve sair verde antes de cada merge (nunca regredir a baseline).
- **Gate Hygiene**: `node scripts/hygiene-check.js` deve sair verde antes de cada merge.
- **Comunicação e documentação**: pt-BR em commits, PRs, RELATORIO e README.
- **Atualização obrigatória**: `RELATORIO-KINOCAMPUS-V12.md` (este arquivo) e `README.md` devem receber a iteração na mesma PR da entrega funcional — sem desacoplar doc e código.
- **CHANGELOG**: `## [Unreleased]` acumula alterações da v12 durante o ciclo; entrada formal `## [12.0.0] - YYYY-MM-DD` aparece só no release gate final (`v12.13.0`).
- **Contratos públicos**: não tocar em `window.KCAPI`, `window._KCAPI.*`, `window.KCSA`, `window._KCSA.*`, `window.KCUtils`, `window.KCi18n`, `window.KCSessionStore` sem teste de contrato estático atualizado na mesma PR.
- **Vercel/Supabase**: SQL novo (se houver) segue a esteira `supabase/migrations/*.sql`. Deploy Vercel é automático via PR merge.

---

## 5. Roadmap v12 — iterações planejadas

Status de cada iteração: `📋 planejado` · `🟡 em execução` · `✅ concluído` · `⏸ pausado` · `❌ descartado`.

### 5.1. Camada A — Continuação tática (splits de hotspots JS)

| Iteração | Escopo | Entrega esperada | Status |
|---|---|---|---|
| **v12.0.0** | **Abertura docs-only do ciclo v12**: este RELATORIO, README atualizado, CHANGELOG com entrada `[12.0.0-planning]` | 1 doc novo, 2 docs editados; zero mudança JS/HTML/teste; baseline `99/1874` preservada | ✅ concluído (#393) |
| **v12.1.0** | **Auditoria formal `kc-utils.js`** (doc-only): footprint real (2 445L / ~100 KB / ~95 funções / 42 públicas), mapa por 7 domínios, 30 consumers, 3 arquivos de teste existentes (1 106L), plano de decomposição expandido para 7 splits (`v12.2.0`–`v12.2.6`) + gate, matriz de risco por domínio | `docs/kc-utils-audit-v12.1.md` | ✅ concluído |
| **v12.2.0** | Split `kc-utils.js` domínio **string/text** | `kc-utils.string.js` → `window._KCU.string` (8 funções), −65L em `kc-utils.js` (2445→2380L), +1 suite 29 testes, 22 HTMLs atualizados, 10 arquivos de teste existentes atualizados | ✅ concluído |
| **v12.2.1** | Split `kc-utils.js` domínio **format** (date + money + url) | `kc-utils.format.js` → `window._KCU.format` (7 funções), −70L em `kc-utils.js` (2380→2310L), +1 suite 51 testes, 22 HTMLs atualizados, 12 arquivos de teste existentes atualizados | ✅ concluído |
| **v12.2.2** | Split `kc-utils.js` domínio **dom/async** (debounce + clipboard) | `kc-utils.dom.js` → `window._KCU.dom` (4 funções), −68L em `kc-utils.js` (2310→2242L), +1 suite 23 testes, 22 HTMLs atualizados, 12 arquivos de teste existentes atualizados | ✅ concluído |
| **v12.2.3** | Split `kc-utils.js` domínio **identity/email/handle** | `kc-utils.identity.js` → `window._KCU.identity` (5 funções), −11L em `kc-utils.js` (2242→2231L), +1 suite 29 testes, 22 HTMLs atualizados | ✅ concluído |
| **v12.2.4** | Split `kc-utils.js` domínio **taxonomy** (module labels + opportunity) | `kc-utils.taxonomy.js` → `window._KCU.taxonomy` (22 funções), −281L em `kc-utils.js` (2231→1950L), +1 suite 78 testes, 22 HTMLs atualizados, 12 arquivos de teste existentes atualizados | ✅ concluído |
| **v12.2.5** | Split `kc-utils.js` domínio **location** (housing + caronas + lost-found + inferências) | `kc-utils.location.js` → `window._KCU.location` (32 funções), −781L em `kc-utils.js` (1950→1168L), +1 suite 101 testes, 22 HTMLs + 12 arquivos de teste atualizados | ✅ concluído |
| **v12.2.6** | Split `kc-utils.js` domínio **presentation** (`applyPresentationRules` + `renderPostCard` + markers) | `kc-utils.presentation.js` → `window._KCU.presentation` (9 funções), −728L em `kc-utils.js` (1168→440L), +1 suite 27 testes, 22 HTMLs + 12 arquivos de teste atualizados | ✅ concluído |
| **v12.2.7** | Gate `kc-utils.js` <900L: README + RELATORIO + CHANGELOG atualizados, `scripts/hygiene-check.js` validando a cadeia `_KCU.*` nos 22 HTMLs canônicos | `kc-utils.js` formalizado em `440L` (<900L), hygiene falha por item faltando/duplicado/extra/fora de ordem, baseline `106/106` suites · `2212/2212` testes preservada | ✅ concluído |
| v12.3.0 | Auditoria `admin-dashboard.controller.js` (doc-only) | `docs/admin-dashboard-audit-v12.3.md` | 📋 planejado |
| v12.3.1 | Split admin-dashboard **metrics/loaders** | `admin-dashboard.metrics.js` → `window._KCAD.metrics`, ~600L, ~15 testes | 📋 planejado |
| v12.3.2 | Split admin-dashboard **audit log + export** | `admin-dashboard.audit.js` → `window._KCAD.audit`, ~400L, ~10 testes | 📋 planejado |
| v12.3.3 | Split admin-dashboard **charts/renderers** | `admin-dashboard.charts.js` → `window._KCAD.charts`, ~300L, ~8 testes | 📋 planejado |
| v12.3.4 | Gate admin-dashboard <900L | gate formal | 📋 planejado |
| v12.4.0 | Auditoria `local.adapter.js` (doc-only) | `docs/local-adapter-audit-v12.4.md` | 📋 planejado |
| v12.4.1 | Split local.adapter **notifications** | `local.notifications.adapter.js` → `window._KCLA.notifications`, ~200L, ~10 testes | 📋 planejado |
| v12.4.2 | Split local.adapter **ratings** | `local.ratings.adapter.js` → `window._KCLA.ratings`, ~150L, ~8 testes | 📋 planejado |
| v12.4.3 | Split local.adapter **saved/drafts** | `local.saved.adapter.js` → `window._KCLA.saved`, ~250L, ~10 testes | 📋 planejado |
| v12.4.4 | Split local.adapter **posts (read+write+feed)** | `local.posts.adapter.js` → `window._KCLA.posts`, ~500L, ~15 testes | 📋 planejado |
| v12.4.5 | Split local.adapter **profile** | `local.profile.adapter.js` → `window._KCLA.profile`, ~150L, ~8 testes | 📋 planejado |
| v12.4.6 | Gate local.adapter <500L (paridade c/ `supabase.adapter.js` de 420L pós-v11.30.9) | gate formal | 📋 planejado |
| v12.5.0 | Auditoria `profile.controller.js` (doc-only) | `docs/profile-controller-audit-v12.5.md` | 📋 planejado |
| v12.5.1 | Split profile **rendering/format** | `profile.render.js`, ~300L, ~10 testes | 📋 planejado |
| v12.5.2 | Split profile **ratings summary** | `profile.ratings.js`, ~200L, ~8 testes | 📋 planejado |
| v12.5.3 | Split profile **avatar/media** | `profile.avatar.js`, ~200L, ~8 testes | 📋 planejado |
| v12.5.4 | Gate profile <600L | gate formal | 📋 planejado |

### 5.2. Camada B — Qualidade sistêmica

| Iteração | Escopo | Entrega esperada | Status |
|---|---|---|---|
| **v12.6.0** | **Trilha B1 — Feature flags formal** (`window.KCFF`) | `kc-feature-flags.js` novo + consumidores migrados; consolida ~62 usos dispersos de `ENV.*`; +~20 testes | 📋 planejado |
| v12.7.0 | **Trilha B2 — i18n runtime fase 1**: extração `<title>`, `meta`, `alt` | +dicionário; ~60 strings migradas; +~15 testes | 📋 planejado |
| v12.7.1 | i18n runtime fase 2: `aria-label`, `placeholder` | ~90 strings migradas; +~15 testes | 📋 planejado |
| v12.7.2 | i18n runtime fase 3: botões e headings dinâmicos | ~50 strings migradas; +~10 testes | 📋 planejado |
| v12.7.3 | Gate i18n: locale switcher funcional pt-BR + en-US scaffolding | gate formal | 📋 planejado |
| v12.8.0 | **Trilha B3 — a11y audit estrutural** (doc-only) | `docs/a11y-audit-v12.8.md` + baseline a11y expandida | 📋 planejado |
| v12.8.1 | a11y correções: roles, `aria-live`, skip-links nos 22 HTMLs | +~20 testes a11y | 📋 planejado |
| v12.9.0 | **Trilha B4 — Playwright E2E** scaffolding | `playwright.config.js` + `tests/e2e/smoke.spec.js`; 1 suite smoke (login + feed + detalhe); CI verde | 📋 planejado |
| v12.9.1 | E2E expansão: criar post + comentar + votar | +3 suites | 📋 planejado |
| v12.9.2 | E2E expansão: admin dashboard + moderation | +2 suites | 📋 planejado |
| v12.10.0 | **Trilha B5 — Lighthouse CI** | `.lighthouserc.js` + workflow; baseline salva em 4 páginas | 📋 planejado |

### 5.3. Camada C — Resiliência & observabilidade

| Iteração | Escopo | Entrega esperada | Status |
|---|---|---|---|
| v12.11.0 | **Trilha C1 — Service Worker** (cache-first para shell estático, atrás de flag `KCFF.isEnabled('sw.enabled')`) | `sw.js` + `kc-sw-register.js`; +~15 testes; TTI medido | 📋 planejado |
| v12.12.0 | **Trilha C2 — Error boundary global + client metrics** | `kc-telemetry.js`; `window.onerror` + `unhandledrejection` → backend; +~10 testes | 📋 planejado |

### 5.4. Gate de encerramento

| Iteração | Escopo | Entrega esperada | Status |
|---|---|---|---|
| **v12.13.0** | **Release gate v12**: CHANGELOG `## [12.0.0]` consolidado, smoke geral, hygiene verde, relatório de fechamento anexado a `docs/qa/report-v12.13.0-run1.md` | gate formal, trilha v12 encerrada | 📋 planejado |

---

## 6. Risco e mitigação — visão macro

| Risco identificado | Camada | Mitigação adotada |
|---|---|---|
| Split `kc-utils.js` quebra consumidores via closures/imports implícitos | A | Facade `window.KCUtils` continua reexportando tudo durante coexistência; testes de contrato novos por split |
| Split `admin-dashboard.controller.js` introduz regressão em RPCs/charts | A | Snapshot DOM nos testes Jest; E2E smoke do admin (v12.9.2) antes do gate `v12.3.4` |
| Split `local.adapter.js` diverge de `supabase.adapter.js` | A | `tests/driver-contract-parity.test.js` (novo) rodando mesma suíte nos dois drivers |
| Feature flags criam inconsistência entre `ENV.*` antigo e `KCFF.*` novo | B | Coexistência de 3 iterações com alias retrocompatível; hygiene-check avisa mixed usage |
| i18n runtime introduz typos / regressão visual | B | `kc-i18n.js` com fallback pt-BR sempre; lint de chaves órfãs; Playwright (B4) **antes** de B2 |
| Playwright eleva tempo de CI + introduz flakiness | B | Gate "soft" nos primeiros ciclos; retry automático 2x; rodar só em PR, nunca em push direto |
| Lighthouse CI gera falsos negativos por network variance | B | Thresholds com `warn` nos primeiros ciclos, `error` só depois de baseline estabilizada |
| Service Worker serve versão stale (bug clássico) | C | Atrás de `KCFF.isEnabled('sw.enabled')`; `skipWaiting` + `clientsClaim`; página `/sw-reset.html` documentada; telemetria (C2) antes de C1 para medir versões stale |
| Telemetria cliente loga PII inadvertidamente | C | Allowlist explícita de campos; sanitização server-side antes de persistir |

---

## 7. Definition of Done — v12

A v12 encerra e abre espaço para v13 somente quando **todos** os itens abaixo estiverem verdes:

### 7.1. Redução estrutural (Camada A)

- [ ] `kc-utils.js` < 900L (baseline `2445L`)
- [ ] `admin-dashboard.controller.js` < 900L (baseline `2251L`)
- [ ] `local.adapter.js` < 500L (baseline `1862L`; meta ≈ `420L` paridade `supabase.adapter.js`)
- [ ] `profile.controller.js` < 600L (baseline `1463L`)
- [ ] Nenhum arquivo JS em `assets/js/` > 1100L
- [ ] Namespaces `window._KCU.*`, `window._KCAD.*`, `window._KCLA.*` operacionais e documentados neste relatório (seção 3.2)

### 7.2. Qualidade sistêmica (Camada B)

- [ ] `window.KCFF` operacional; zero uso direto de `ENV.*` em controllers (`kc-env.js` segue como fonte leitora interna de `KCFF`)
- [ ] i18n runtime ≥ 90% das ~250-300 strings inventariadas migradas para `kc-i18n.js`; switcher pt-BR/en-US funcional (en-US pode estar incompleto, mas o esqueleto deve existir)
- [ ] `tests/a11y.test.js` cobre os 22 HTMLs com mínimo de 5 asserts cada
- [ ] Playwright CI verde em ≥ 8 cenários E2E
- [ ] Lighthouse CI rodando em PR; budgets definidos para Performance ≥ 85 e a11y ≥ 95

### 7.3. Resiliência (Camada C)

- [ ] Service Worker ativo atrás de flag `sw.enabled`, com kill-switch documentado; ≥ 1 release canário
- [ ] `kc-telemetry.js` enviando erros cliente para backend; dashboard mínimo de consulta disponível

### 7.4. Baseline e governança

- [ ] `npm test` passa em **≥ 120 suites / ≥ 2150 testes** (baseline v12.0.0: `99/1874`; projeção de acréscimo líquido: ~20 suites + ~300 testes)
- [ ] `node scripts/hygiene-check.js` verde e **atualizado** com regras para `_KCU.*`, `_KCLA.*`, `_KCAD.*`, `KCFF.*`
- [ ] `RELATORIO-KINOCAMPUS-V12.md` atualizado em cada iteração; seção de fechamento preenchida
- [ ] `CHANGELOG.md` com entrada formal `## [12.0.0] - YYYY-MM-DD`
- [ ] `README.md` com "Status atual" apontando para v12 e tabela "Entregas Recentes" consolidada
- [ ] Zero quebras documentadas de contrato público (`window.KCAPI`, `window._KCAPI.*`, `window.KCSA`, `window._KCSA.*`, `window.KCUtils`, `window.KCi18n`, `window.KCFF`)

---

## 8. Seção de execução (preenchida iteração a iteração)

### 8.0. v12.0.0 — abertura docs-only do ciclo v12 — ✅ concluído (PR #393)

**Objetivo:** abrir formalmente o ciclo v12 como uma iteração docs-only, sem mudança funcional, sem mudança estética, sem testes novos.

**Escopo entregue:**

- `RELATORIO-KINOCAMPUS-V12.md` criado (este arquivo)
- `README.md` atualizado:
  - linha "Status atual" menciona `v12.0.0` e indica abertura do ciclo v12
  - tabela "Entregas Recentes" recebe primeira linha `v12.0.0`
  - seção "Progresso atual" atualizada para refletir o estado v12
  - nova seção "Planejamento v12" adicionada com as três camadas e link para este relatório
  - seção "Planejamento v11" preservada como histórico
- `CHANGELOG.md` recebe entrada `## [12.0.0-planning] - 2026-04-20` em `Docs`

**Escopo fora desta iteração (explícito):**

- Nenhum arquivo JS em `assets/js/` é tocado
- Nenhum teste Jest é criado, editado ou removido
- Nenhum HTML recebe `<script>` novo
- `scripts/hygiene-check.js` não muda (regras para `_KCU.*`/`KCFF.*` virão nos splits)
- Nenhuma dependência nova (`package.json` intocado)
- Supabase e Edge Functions: sem mudança

**Validação:**

- `npm test` → `99/99` suites, `1874/1874` testes verdes (baseline imutável)
- `node scripts/hygiene-check.js` → 8.6.0 ✓

**Reversibilidade:** 100% — puramente documental.

**Fechamento:** PR `#393` mergeada em `kinocampus-V11.0-foundations` em 20 de abril de 2026. `kinocampus-V11.0-foundations` avançou para `449021b`.

---

### 8.1. v12.1.0 — auditoria doc-only de `kc-utils.js` — ✅ concluído

**Objetivo:** mapear o estado atual de `assets/js/kc-utils.js` antes dos splits incrementais, produzindo inventário funcional, análise de consumers, plano de decomposição e matriz de risco — sem tocar em código, HTML ou testes.

**Escopo entregue:**

- `docs/kc-utils-audit-v12.1.md` criado (~450L de documento). Seções: 1. Footprint real; 2. Estrutura interna (7 domínios lógicos mapeados com linhas exatas e visibilidade pública/privada); 3. Consumers (30 arquivos JS, 136+ callsites, 17 HTMLs, 3 arquivos de teste totalizando 1 106L); 4. Plano de decomposição recomendando **7 splits** (`v12.2.0`–`v12.2.6`) + gate `v12.2.7` em vez dos 5 splits previstos originalmente, com dependências de carga entre sub-módulos explicitadas; 5. Matriz de risco por domínio; 6. Definition of Done da própria iteração; 7. Detalhamento da próxima iteração (`v12.2.0`).
- `RELATORIO-KINOCAMPUS-V12.md` (este arquivo) atualizado: `Estado desta fase` reflete conclusão de `v12.1.0`; §5.1 expandida de 5 para 7 splits refletindo o footprint real medido (`v12.2.0` string, `v12.2.1` format, `v12.2.2` dom, `v12.2.3` identity, `v12.2.4` taxonomy, `v12.2.5` location, `v12.2.6` presentation, `v12.2.7` gate); status de `v12.0.0` e `v12.1.0` marcado como concluído.
- `README.md` atualizado: nova linha `v12.1.0` em `Entregas Recentes`; seção `Progresso atual` aponta `v12.1.0` concluída e `v12.2.0` como próxima.
- `CHANGELOG.md` atualizado com entrada sob `## [Unreleased]` em `Docs`.

**Achados principais da auditoria:**

| Métrica | Valor medido |
|---|---|
| Linhas totais | 2 445L |
| Tamanho no disco | ~100 KB |
| Funções top-level | ~95 |
| Métodos públicos em `window.KCUtils` | 42 (`Object.freeze({...})`) |
| Dependências externas | apenas `window.KC_CONSTANTS` |
| HTMLs consumidores | 17 páginas públicas |
| Arquivos JS consumidores | 30 |
| Callsites totais `KCUtils.*` | 136+ |
| Testes Jest existentes | 3 arquivos (1 106L) |
| Maior domínio | **location** (~1 050L: housing + caronas + lost-found + inferências) |
| Maior risco | **presentation** (~600L: `applyPresentationRules` 313L + `renderPostCard` 279L) |

**Decisões tomadas:**

1. **7 splits em vez de 5** (ajuste sobre o roadmap original do §5.1):
   - `location` é grande demais para coexistir com `taxonomy` num único split (fuzzy matching + histórico + inferências = 1 050L);
   - `presentation` tem acoplamento crítico com todos os outros domínios e merece iteração dedicada com snapshots DOM;
   - `date/time` (1 função, `timeAgo`) foi fundida ao domínio `format` (date + money + url) — mais coeso.
2. **`levenshteinDistance`** (helper de fuzzy matching, privado) acompanha o domínio `string` por ser utilidade textual reutilizada por `taxonomy` e `location`.
3. **`formatCurrencyBRL` e `parseBRLNumber`** permanecem **privadas** durante o split (não promover a públicas sem análise de consumer).
4. **Ordem obrigatória no HTML** fica documentada: `constants → string → format → dom → identity → taxonomy → location → presentation → facade`.
5. **Gate `v12.2.7` mantém meta `<900L`** (folga de ~6x vs. estimativa de 80–150L residuais no facade).

**Escopo fora desta iteração (explícito):**

- Nenhum arquivo JS em `assets/js/` é tocado
- Nenhum teste Jest é criado, editado ou removido
- Nenhum HTML recebe `<script>` novo
- `scripts/hygiene-check.js` não muda

**Validação:**

- `npm test` → `99/99` suites, `1874/1874` testes verdes (baseline imutável)
- `node scripts/hygiene-check.js` → 8.6.0 ✓

**Reversibilidade:** 100% (puramente documental).

**Próxima iteração após §8.1:** `v12.2.0` — detalhes em §8.2 abaixo.

---

### 8.2. v12.2.0 — split `kc-utils.js` domínio string — `window._KCU.string` — ✅ concluído

**Objetivo:** extrair as 8 funções de manipulação de texto de `kc-utils.js` para um sub-módulo IIFE autossuficiente `assets/js/kc-utils.string.js`, inicializando o namespace `window._KCU.string`, sem quebrar nenhuma das 1874 testes existentes e sem alterar o contrato público `window.KCUtils`.

**Escopo entregue:**

- `assets/js/kc-utils.string.js` criado (133L): IIFE com as 8 funções do domínio string, exportadas via `window._KCU = window._KCU || {}; window._KCU.string = Object.freeze({...})`. Autossuficiente (sem dependências externas, nenhum `window.KC_CONSTANTS` necessário).
- `assets/js/kc-utils.js` reduzido de 2445L → 2380L (−65L): 8 corpos de função substituídos por thin wrappers `(window._KCU && window._KCU.string) ? window._KCU.string.fn(args) : fallback`, cada um com comentário explícito de delegação. Facade `window.KCUtils = Object.freeze({...})` preservado intacto — zero breaking changes para consumidores.
- 22 HTMLs atualizados: `<script defer src="kc-utils.string.js">` inserido imediatamente antes de `<script defer src="kc-utils.js">` em todos (17 páginas raiz + 5 admin).
- `tests/kc-utils-string.test.js` criado (9 `describe` / 29 testes): §1 contrato estático (objeto frozen, 8 chaves exatas, nenhuma função privada exposta); §2–9 comportamento por função (titleCase, beautifyKey, normalizeText, canonicalCategory, slugifyText, levenshteinDistance, escapeHtml, renderMarkdownInline).
- 10 arquivos de teste existentes atualizados para carregar `kc-utils.string.js` antes de `kc-utils.js`: `kc-utils.test.js`, `kc-utils-expanded.test.js`, `kc-utils-resolvers.test.js`, `kc-filters.test.js`, `a11y.test.js`, `anti-spam.test.js`, `kc-api-client.test.js`, `kc-api-notification-preferences-contract.test.js`, `kc-api-notifications-contract.test.js`, `kc-api-session-swr.test.js`, `local-adapter.test.js`, `post-analytics.test.js`.

**Funções extraídas:**

| Função | Visibilidade | Uso no restante de `kc-utils.js` |
|---|---|---|
| `titleCase` | pública (`KCUtils.titleCase`) | delegada a `_KCU.string.titleCase` |
| `beautifyKey` | pública (`KCUtils.beautifyKey`) | delegada a `_KCU.string.beautifyKey` |
| `normalizeText` | pública (`KCUtils.normalizeText`) | delegada — usada intensamente internamente |
| `canonicalCategory` | pública (`KCUtils.canonicalCategory`) | delegada a `_KCU.string.canonicalCategory` |
| `slugifyText` | pública (`KCUtils.slugifyText`) | delegada a `_KCU.string.slugifyText` |
| `levenshteinDistance` | privada (não em `KCUtils`) | delegada a `_KCU.string.levenshteinDistance` |
| `escapeHtml` | pública (`KCUtils.escapeHtml`) | delegada a `_KCU.string.escapeHtml` |
| `renderMarkdownInline` | pública (`KCUtils.renderMarkdownInline`) | delegada a `_KCU.string.renderMarkdownInline` |

**Validação:**

- `npm test` → **100/100 suites, 1903/1903 testes verdes** (+1 suite, +29 testes vs. baseline `v12.1.0`)
- `node scripts/hygiene-check.js` → 8.6.0 ✓
- Contrato `window.KCUtils` preservado (Object.freeze, mesmas 42 chaves)
- `_KCU.string` = Object.frozen, 8 funções, nenhuma função privada exposta

**Correções diagnosticadas durante a iteração:**

- `kc-filters.test.js` falhava porque `kcFilters.canonicalCategory` delega para `KCUtils.canonicalCategory`, que agora precisa de `_KCU.string` — corrigido adicionando o require no setup.
- 2 expectativas no novo teste ajustadas: `canonicalCategory('Habitações')` retorna `'habitacoe'` (remove final `s` → correto comportamento do algoritmo); `escapeHtml(null)` retorna `''` (`null ?? ''` = `''` antes de `String()`).

**Próxima iteração:** `v12.2.1` — split domínio **format** (`timeAgo`, `formatCurrencyBRL`, `parseBRLNumber`, `splitPriceText`, `buildProductDetailHref`, `copyTextToClipboard`, `clamp`) → `kc-utils.format.js` + `window._KCU.format`.

---

### 8.3. v12.2.1 — split `kc-utils.js` domínio format — `window._KCU.format` — ✅ concluído

**Objetivo:** extrair as 7 funções de formatação de dados de `kc-utils.js` para um sub-módulo IIFE `assets/js/kc-utils.format.js`, inicializando o namespace `window._KCU.format`, sem quebrar nenhuma das 1903 testes existentes e sem alterar o contrato público `window.KCUtils`.

**Escopo entregue:**

- `assets/js/kc-utils.format.js` criado (151L): IIFE com as 7 funções do domínio format, exportadas via `window._KCU.format = Object.freeze({...})`. Dependência lazy a `window._KCU.string` (para `getConditionLabel`, que chama `normalizeText` e `beautifyKey`) resolvida via accessor `_str()` em runtime.
- `assets/js/kc-utils.js` reduzido de 2380L → 2310L (−70L): 7 corpos de função substituídos por thin wrappers `(window._KCU && window._KCU.format) ? window._KCU.format.fn(args) : fallback` com comentário explícito de delegação. Facade `window.KCUtils = Object.freeze({...})` preservado intacto — zero breaking changes para consumidores.
- 22 HTMLs atualizados: `<script defer src="kc-utils.format.js">` inserido entre `kc-utils.string.js` e `kc-utils.js` em todos (17 páginas raiz + 5 admin). Ordem canônica preservada: `string → format → kc-utils.js`.
- `tests/kc-utils-format.test.js` criado (8 `describe` / 51 testes): §1 contrato estático (objeto frozen, 7 chaves exatas, helpers privados `_str`/`_normalizeText`/`_beautifyKey` não expostos); §2–8 comportamento por função (`timeAgo`, `formatCurrencyBRL`, `parseBRLNumber`, `clamp`, `buildProductDetailHref`, `getConditionLabel`, `splitPriceText`).
- 12 arquivos de teste existentes atualizados para carregar `kc-utils.format.js` após `kc-utils.string.js` e antes de `kc-utils.js`: `kc-utils.test.js`, `kc-utils-expanded.test.js`, `kc-utils-resolvers.test.js`, `kc-filters.test.js`, `a11y.test.js`, `anti-spam.test.js`, `kc-api-client.test.js`, `kc-api-notification-preferences-contract.test.js`, `kc-api-notifications-contract.test.js`, `kc-api-session-swr.test.js`, `local-adapter.test.js`, `post-analytics.test.js`.

**Funções extraídas:**

| Função | Visibilidade | Dependência de outro sub-módulo |
|---|---|---|
| `timeAgo` | pública (`KCUtils.timeAgo`) | nenhuma |
| `formatCurrencyBRL` | privada (não em `KCUtils`) | nenhuma |
| `parseBRLNumber` | privada (não em `KCUtils`) | nenhuma |
| `clamp` | pública (`KCUtils.clamp`) | nenhuma |
| `buildProductDetailHref` | pública (`KCUtils.buildProductDetailHref`) | nenhuma |
| `getConditionLabel` | pública (`KCUtils.getConditionLabel`) | `_KCU.string.normalizeText` + `_KCU.string.beautifyKey` (lazy via `_str()`) |
| `splitPriceText` | pública (`KCUtils.splitPriceText`) | nenhuma |

**Validação:**

- `npm test` → **101/101 suites, 1954/1954 testes verdes** (+1 suite, +51 testes vs. baseline `v12.2.0`)
- `node scripts/hygiene-check.js` → 8.6.0 ✓
- Contrato `window.KCUtils` preservado (Object.freeze, mesmas 42 chaves)
- `_KCU.format` = Object.frozen, 7 funções, helpers privados não expostos

**Próxima iteração:** `v12.2.2` — split domínio **dom/async** (`debounce`, `canSelectInputLike`, `fallbackCopyText`, `copyTextToClipboard`) → `kc-utils.dom.js` + `window._KCU.dom`.

---

### 8.4. v12.2.2 — split `kc-utils.js` domínio dom — `window._KCU.dom` — ✅ concluído

**Objetivo:** extrair as 4 funções de interação com o DOM de `kc-utils.js` para um sub-módulo IIFE autossuficiente `assets/js/kc-utils.dom.js`, inicializando o namespace `window._KCU.dom`, sem quebrar nenhuma das 1954 testes existentes e sem alterar o contrato público `window.KCUtils`.

**Escopo entregue:**

- `assets/js/kc-utils.dom.js` criado (~110L): IIFE com as 4 funções do domínio dom, exportadas via `window._KCU.dom = Object.freeze({...})`. Autossuficiente — nenhuma dependência de outros sub-módulos. Dependências internas (`fallbackCopyText` chama `canSelectInputLike`; `copyTextToClipboard` chama `fallbackCopyText`) resolvidas no escopo do IIFE.
- `assets/js/kc-utils.js` reduzido de 2310L → 2242L (−68L): 4 corpos de função substituídos por thin wrappers com comentário explícito de delegação. Facade `window.KCUtils = Object.freeze({...})` preservado intacto — zero breaking changes para consumidores.
- 22 HTMLs atualizados: `<script defer src="kc-utils.dom.js">` inserido entre `kc-utils.format.js` e `kc-utils.js`. Ordem canônica: `string → format → dom → kc-utils.js`.
- `tests/kc-utils-dom.test.js` criado (5 `describe` / 23 testes): §1 contrato estático (frozen, 4 chaves exatas); §2 `debounce` (agrupamento de chamadas, encaminhamento de args, delay); §3 `canSelectInputLike` (INPUT/TEXTAREA vs DIV, nodeType, case-insensitive); §4 `fallbackCopyText` (texto vazio, execCommand); §5 `copyTextToClipboard` (Clipboard API, fallback).
- 12 arquivos de teste existentes atualizados com `require('../assets/js/kc-utils.dom.js')` na ordem correta.

**Funções extraídas:**

| Função | Visibilidade | Dependência interna |
|---|---|---|
| `debounce` | pública (`KCUtils.debounce`) | nenhuma |
| `canSelectInputLike` | privada (não em `KCUtils`) | nenhuma |
| `fallbackCopyText` | privada (não em `KCUtils`) | `canSelectInputLike` (mesmo escopo) |
| `copyTextToClipboard` | pública async (`KCUtils.copyTextToClipboard`) | `fallbackCopyText` (mesmo escopo) |

**Validação:**

- `npm test` → **102/102 suites, 1977/1977 testes verdes** (+1 suite, +23 testes vs. baseline `v12.2.1`)
- `node scripts/hygiene-check.js` → 8.6.0 ✓
- Contrato `window.KCUtils` preservado (Object.freeze, mesmas 42 chaves)
- `_KCU.dom` = Object.frozen, 4 funções, variáveis internas não expostas

**Acumulado `kc-utils.js`:** 2445L → 2242L (−203L em 3 iterações; domínios restantes: identity, taxonomy, location, presentation).

**Próxima iteração:** `v12.2.3` — split domínio **identity/email/handle** (`normalizeEmail`, `getEmailDomain`, `normalizeAllowedDomains`, `isInstitutionalEmailAllowed`, `buildPublicHandle`) → `kc-utils.identity.js` + `window._KCU.identity`.

---

### 8.5. v12.2.3 — split `kc-utils.js` domínio identity — `window._KCU.identity` — ✅ concluído

**Objetivo:** extrair as 5 funções de identidade de usuário de `kc-utils.js` para `assets/js/kc-utils.identity.js`, sem quebrar nenhuma das 1977 testes existentes e sem alterar o contrato público `window.KCUtils`.

**Escopo entregue:**

- `assets/js/kc-utils.identity.js` criado (~85L): IIFE com as 5 funções do domínio identity, exportadas via `window._KCU.identity = Object.freeze({...})`. Dependência de `buildPublicHandle` em `slugifyText` (domínio string) resolvida via accessor lazy `_str()`.
- `assets/js/kc-utils.js` reduzido de 2242L → 2231L (−11L): 5 corpos substituídos por thin wrappers de delegação. Facade `window.KCUtils` preservado intacto.
- 22 HTMLs atualizados com `<script defer src="kc-utils.identity.js">` entre `kc-utils.dom.js` e `kc-utils.js`.
- `tests/kc-utils-identity.test.js` criado (6 `describe` / 29 testes): contrato estático + comportamento de cada função (normalização, extração de domínio, allowlist com deduplicação, gate institucional UFG, geração de handle com limite de 32 chars).
- 12 arquivos de teste existentes atualizados com require do sub-módulo.

**Funções extraídas:**

| Função | Visibilidade | Dep. interna |
|---|---|---|
| `normalizeEmail` | pública | nenhuma |
| `getEmailDomain` | pública | `normalizeEmail` (mesmo escopo) |
| `normalizeAllowedDomains` | pública | nenhuma |
| `isInstitutionalEmailAllowed` | pública | `normalizeAllowedDomains` + `getEmailDomain` (mesmo escopo) |
| `buildPublicHandle` | pública | `_slugifyText` → `_KCU.string.slugifyText` (lazy) |

**Validação:**

- `npm test` → **103/103 suites, 2006/2006 testes verdes**
- `node scripts/hygiene-check.js` → 8.6.0 ✓

**Acumulado `kc-utils.js`:** 2445L → 2231L (−214L em 4 iterações).

**Próxima iteração:** `v12.2.4` — split domínio **taxonomy** (~420L, ~22 funções de labels + resolvers de oportunidade).

---

### 8.6. v12.2.4 — split `kc-utils.js` domínio taxonomy — `window._KCU.taxonomy` — ✅ concluído

**Objetivo:** extrair as 22 funções do domínio taxonomy (rótulos de módulo/categoria/subcategoria e todo o pipeline de resolução de área de oportunidade) para `assets/js/kc-utils.taxonomy.js`, expondo `window._KCU.taxonomy`.

**Funções migradas (22):**
- Rótulos: `getModuleLabel`, `getModuleIconClass`, `getCategoryLabel`, `getSubcategoryLabel`
- Utilitários puros: `firstNonEmptyValue`, `formatOpportunityAreaLabel`, `scoreOpportunityAreaLabel`, `pickPreferredOpportunityAreaLabel`, `getOpportunityAreaFuzzyThreshold`, `getOpportunityAreaSimilarityScore`, `isCloseOpportunityAreaAlias`, `getOpportunityAreaEmoji`
- Definições: `getOpportunityAreaDefinitions`, `getOpportunityAreaInfoByKey`, `buildOfficialOpportunityAreaMaps`, `buildOpportunityTextParts`
- Resolvers: `extractOpportunityAreaHistoryEntries`, `buildHistoryOpportunityAreaMaps`, `findBestOfficialOpportunityArea`, `findBestFuzzyOpportunityArea`, `findBestOfficialContextArea`, `resolveOpportunityArea`

**Padrão aplicado:** acesso lazy a `_KCU.string` via `_str()` e a `KC_CONSTANTS` via `_const()` — evita captura prematura de referências no IIFE e permite mocking nos testes sem carregar o arquivo de constantes.

**Entregas mensuráveis:**
- `assets/js/kc-utils.taxonomy.js` criado (22 funções + `window._KCU.taxonomy = Object.freeze(...)`)
- `kc-utils.js`: 22 corpos substituídos por delegation wrappers; destructuring de KC_CONSTANTS reduzido de 8 para 3 constantes locais (`HOUSING_*`, `LOST_FOUND_*`); **2231L → 1950L (−281L)**
- `tests/kc-utils-taxonomy.test.js` criado — **1 suite, 78 testes**
- 22 HTMLs: `<script defer src="assets/js/kc-utils.taxonomy.js"></script>` adicionado antes de `kc-utils.js`
- 12 arquivos de teste existentes: `require('../assets/js/kc-utils.taxonomy.js')` adicionado na cadeia de carregamento
- `scripts/patch-taxonomy-split.py` criado (script de substituição em lote — reutilizável como modelo para splits futuros)

**Verificação:**
- `npm test` → **104/104 suites, 2084/2084 testes verdes** (+1 suite, +78 testes vs. baseline `v12.2.3`)
- `node scripts/hygiene-check.js` → 8.6.0 ✓
- `kc-utils.js` passou de **2231L → 1950L** (redução acumulada desde 2445L: **−495L**)

**Próxima iteração:** `v12.2.5` — split domínio **location** (~30 funções: `resolveHousingRegion`, `resolveCaronasLocation`, `resolveLostFoundLocation`, `resolveHousingFeatures`, `resolveHousingTypeKey`, housing/carona/lost-found definitions e inferências) → `kc-utils.location.js` + `window._KCU.location`.

---

### 8.7. v12.2.5 — split `kc-utils.js` domínio location — `window._KCU.location` — ✅ concluído

**Objetivo:** extrair as 32 funções do domínio location (moradia/região, moradia/features, caronas e achados-e-perdidos) para `assets/js/kc-utils.location.js`, expondo `window._KCU.location`. Remover o bloco `const { HOUSING_REGION_DEFINITIONS, HOUSING_FEATURE_DEFINITIONS, LOST_FOUND_LOCATION_DEFINITIONS } = (window.KC_CONSTANTS || {})` de `kc-utils.js`, que se tornava letra morta após a extração.

**Funções migradas (32):**

| Grupo | Funções |
|---|---|
| Definições housing | `getHousingRegionDefinitions`, `getHousingRegionInfoByKey`, `getHousingFeatureDefinitions`, `getHousingFeatureInfoByKey` |
| Helpers texto housing | `toStringArray`, `scoreHousingLabel`, `pickPreferredHousingLabel`, `formatHousingLabel`, `buildDefinitionAliasMap`, `buildHousingTextParts` |
| Fuzzy housing | `getHousingFuzzyThreshold`, `getHousingSimilarityScore`, `isCloseHousingAlias`, `findBestFuzzyHousingEntry` |
| Emojis | `getHousingFeatureEmoji`, `getLostFoundLocationEmoji` |
| Resolvers housing | `extractHousingRegionHistoryEntries`, `buildHousingRegionHistoryMaps`, `resolveHousingRegion`, `extractHousingFeatureHistoryEntries`, `buildHousingFeatureHistoryMaps`, `resolveSingleHousingFeature`, `resolveHousingFeatures`, `resolveHousingTypeKey`, `resolveHousingTypeFromCandidates` |
| Caronas | `resolveCaronasLocation` |
| Achados e perdidos | `getLostFoundLocationDefinitions`, `getLostFoundLocationInfoByKey`, `buildLostFoundTextParts`, `extractLostFoundLocationHistoryEntries`, `buildLostFoundHistoryMaps`, `resolveLostFoundLocation` |

**Padrão aplicado:** lazy accessors `_str()` → `_KCU.string` e `_const()` → `window.KC_CONSTANTS`; `firstNonEmptyValue` duplicado localmente (8 linhas) para eliminar dependência cruzada com `_KCU.taxonomy`. Script Python `scripts/patch-location-split.py` com brace-counting robusto (pula lista de parâmetros via contagem de parênteses antes de buscar a `{` do corpo) — soluciona o caso `options = {}` como valor default de parâmetro.

**Entregas mensuráveis:**
- `assets/js/kc-utils.location.js` criado (32 funções + `window._KCU.location = Object.freeze(...)`, ~953 linhas)
- `kc-utils.js`: 32 corpos substituídos por delegation wrappers + bloco `KC_CONSTANTS` removido; **1950L → 1168L (−782L)**; redução acumulada desde 2445L: **−1277L**
- `tests/kc-utils-location.test.js` criado — **1 suite, 101 testes** (33 describe blocks: 1 contrato estático + 32 por função)
- 22 HTMLs: `<script defer src="assets/js/kc-utils.location.js"></script>` adicionado antes de `kc-utils.js`
- 12 arquivos de teste existentes: `require('../assets/js/kc-utils.location.js')` adicionado na cadeia de carregamento
- `scripts/patch-location-split.py` criado (brace-counting robusto — modelo reutilizável para splits futuros)

**Verificação:**
- `npm test` → **105/105 suites, 2185/2185 testes verdes** (+1 suite, +101 testes vs. baseline `v12.2.4`)
- `node scripts/hygiene-check.js` → 8.6.0 ✓
- `kc-utils.js` passou de **1950L → 1168L** (redução acumulada desde 2445L: **−1277L**)
- Referências `window._KCU.location` em `kc-utils.js`: **96** (32 funções × 3 linhas no wrapper)

**Próxima iteração:** `v12.2.6` — split domínio **presentation** (`cssEscape`, `applyPresentationRules`, `getDisplayMarkerTags`, `renderMarkerTags`, `renderPostCard` e funções infer* relacionadas) → `kc-utils.presentation.js` + `window._KCU.presentation`.

---

### 8.8. v12.2.6 — split `kc-utils.js` domínio presentation — `window._KCU.presentation` — ✅ concluído

**Objetivo:** extrair as 9 funções do domínio presentation de `kc-utils.js` para `assets/js/kc-utils.presentation.js`, expondo `window._KCU.presentation`, preservando o facade público `window.KCUtils` e a ordem obrigatória de carregamento `string → format → dom → identity → taxonomy → location → presentation → kc-utils.js`.

**Funções migradas (9):**

| Grupo | Funções |
|---|---|
| Helpers presentation | `cssEscape`, `inferCaronasRoute`, `inferAchadosLocation`, `inferOportunidadesSubcategory`, `inferEventosCategory` |
| Regras visuais e markers | `applyPresentationRules`, `getDisplayMarkerTags`, `renderMarkerTags` |
| Renderização | `renderPostCard` |

**Padrão aplicado:** lazy accessors `_str()`, `_fmt()`, `_tax()` e `_loc()` resolvendo dependências cross-domain apenas no momento da chamada; funções `infer*` e `cssEscape` permanecem no mesmo escopo fechado do IIFE para consumo direto por `applyPresentationRules` e `renderPostCard`; `window._KCU.presentation = Object.freeze({...})` garante namespace imutável em runtime.

**Entregas mensuráveis:**
- `assets/js/kc-utils.presentation.js` criado (**858L**, 9 funções exportadas)
- `assets/js/kc-utils.js` reduzido de **1168L → 440L (−728L)**; redução acumulada desde `2445L`: **−2005L**
- 22 HTMLs atualizados com `<script defer src="assets/js/kc-utils.presentation.js"></script>` na ordem canônica
- 12 suites existentes atualizadas para carregar `kc-utils.presentation.js` antes de `kc-utils.js`
- `tests/kc-utils-presentation.test.js` criado — **1 suite, 27 testes** cobrindo contrato estático, inferências, rules, markers e renderização
- Gate estrutural `<900L` de `kc-utils.js` atingido antecipadamente já nesta iteração (formalização documental fica para `v12.2.7`)

**Verificação:**
- `npm test` → **106/106 suites, 2212/2212 testes verdes** (+1 suite, +27 testes vs. baseline `v12.2.5`)
- `node scripts/hygiene-check.js` → 8.6.0 ✓
- `kc-utils.js` passou de **1168L → 440L**; `kc-utils.presentation.js` ficou com **858L**
- Facade `window.KCUtils` preservado; wrappers de `applyPresentationRules`, `getDisplayMarkerTags` e `renderPostCard` seguem operacionais

**Próxima iteração:** `v12.2.7` — gate formal do marco `<900L` + atualização do `scripts/hygiene-check.js` para validar a cadeia `_KCU.*` nos HTMLs.

---

### 8.9. v12.2.7 — gate formal `kc-utils.js` <900L + hygiene `_KCU.*` — ✅ concluído

**Objetivo:** formalizar documentalmente o marco estrutural já atingido em `v12.2.6` (`assets/js/kc-utils.js` abaixo de `900L`) e endurecer o `scripts/hygiene-check.js` para validar a cadeia canônica dos sub-módulos `window._KCU.*` em todos os HTMLs públicos e admin cobertos por `htmlFiles`, sem criar novos assets de runtime e sem tocar no facade `window.KCUtils`.

**Escopo entregue:**

- `scripts/hygiene-check.js` atualizado com uma checagem dedicada da cadeia `_KCU.*`, executada junto das demais validações operacionais do script
- a nova regra extrai apenas `<script defer src="...kc-utils*.js"></script>` e exige, por arquivo, a ordem canônica `string → format → dom → identity → taxonomy → location → presentation → kc-utils.js`
- páginas raiz exigem prefixo `assets/js/`; páginas em `admin/` exigem `../assets/js/`
- a validação falha se houver item faltando, duplicado, extra ou fora de ordem, exibindo `expected` vs `found` com o `relPath` do HTML afetado
- `README.md`, `RELATORIO-KINOCAMPUS-V12.md` e `CHANGELOG.md` atualizados para registrar `v12.2.7` como concluída, formalizar o gate `<900L` com valor real `440L` e apontar `v12.3.0` como próxima iteração
- nenhum dos 22 HTMLs canônicos foi alterado nesta rodada; o estado já correto passou a servir como fixture do gate

**Entregas mensuráveis:**

- gate estrutural de `kc-utils.js` formalizado com valor real de **440L** (`2445L → 440L`, redução acumulada de **−2005L**)
- `scripts/hygiene-check.js` passa a validar a cadeia `_KCU.*` em **22 HTMLs** (17 páginas raiz + 5 páginas admin)
- zero mudança funcional em runtime: nenhum arquivo de `assets/js/` de produto, nenhum HTML e nenhuma suite Jest novos nesta iteração
- baseline preservada em **106/106 suites · 2212/2212 testes**

**Verificação:**

- `node scripts/hygiene-check.js` → **8.6.0 ✓**
- `npm test` → **106/106 suites · 2212/2212 testes verdes**
- `assets/js/kc-utils.js` permaneceu em **440L**, abaixo do gate `<900L`
- amostragem manual do diff confirma: nenhum HTML do conjunto canônico foi editado para “fazer o teste passar”

**Próxima iteração:** `v12.3.0` — auditoria docs-only de `admin-dashboard.controller.js`, mapeando footprint real, consumers e sequência recomendada de splits para `window._KCAD.*`.

---

*Este relatório é vivo. Cada iteração da v12 adiciona uma subseção em §8 e atualiza o cabeçalho "Estado desta fase".*
