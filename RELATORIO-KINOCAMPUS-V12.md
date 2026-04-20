# RELATÓRIO KINOCAMPUS v12

**Plano Diretor de Consolidação e Qualidade Sistêmica**

| Campo | Valor |
|---|---|
| Data de abertura | 20 de abril de 2026 |
| Linha-base | `kinocampus-V11.0-foundations` |
| Estado desta fase | execução iniciada; iteração `v12.0.0` em execução — abertura docs-only do ciclo v12 (RELATORIO-V12, README, CHANGELOG); nenhum arquivo JS, HTML ou teste alterado; baseline preservada em `99/99` suites e `1874/1874` testes pós-`v11.33.7` |
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
| `assets/js/kc-utils.js` | `2445L` | `~95KB` | `v12.1.0`–`v12.2.5` | 🥇 1º |
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
| **v12.0.0** | **Abertura docs-only do ciclo v12**: este RELATORIO, README atualizado, CHANGELOG com entrada `[12.0.0-planning]` | 1 doc novo, 2 docs editados; zero mudança JS/HTML/teste; baseline `99/1874` preservada | 🟡 em execução |
| v12.1.0 | Auditoria formal `kc-utils.js` (doc-only): mapa por domínio, callsites, risco de regressão | `docs/kc-utils-audit-v12.1.md` | 📋 planejado |
| v12.2.0 | Split `kc-utils.js` domínio **string/text** | `kc-utils.string.js` → `window._KCU.string`, ~250L movidas, ~12 testes | 📋 planejado |
| v12.2.1 | Split `kc-utils.js` domínio **date/time** | `kc-utils.date.js` → `window._KCU.date`, ~150L, ~10 testes | 📋 planejado |
| v12.2.2 | Split `kc-utils.js` domínio **dom/a11y** | `kc-utils.dom.js` → `window._KCU.dom`, ~200L, ~12 testes | 📋 planejado |
| v12.2.3 | Split `kc-utils.js` domínio **opportunity/taxonomy** | `kc-utils.taxonomy.js` → `window._KCU.taxonomy`, ~400L, ~15 testes | 📋 planejado |
| v12.2.4 | Split `kc-utils.js` domínio **profile/email/handle** | `kc-utils.identity.js` → `window._KCU.identity`, ~200L, ~12 testes | 📋 planejado |
| v12.2.5 | Gate `kc-utils.js` <900L: README + RELATORIO atualizados, hygiene com regras para `_KCU.*` | gate formal | 📋 planejado |
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

### 8.0. v12.0.0 — abertura docs-only do ciclo v12 — 🟡 em execução

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

**Próxima iteração:** `v12.1.0` — auditoria doc-only de `kc-utils.js`.

---

*Este relatório é vivo. Cada iteração da v12 adiciona uma subseção em §8 e atualiza o cabeçalho "Estado desta fase".*
