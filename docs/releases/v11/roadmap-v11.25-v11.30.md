# Roadmap v11.25 – v11.30 — KinoCampus

## Contexto

Documento gerado em 12 de abril de 2026 após a conclusão da trilha i18n `v11.24.x` (v11.24.0–v11.24.3).
Estado da base neste momento: **52/52 suites, 565/565 testes**, hygiene `8.6.0`, produção `dpl_4yqDchKPSAktdbqKbWPPyLPFFkB2`.

Este roadmap cobre os **7 itens de backlog abertos** identificados na Seção 12 do RELATORIO-KINOCAMPUS-V11.md, organizados da iniciativa de **menor risco para maior risco**, garantindo que cada fase entregue uma rede de segurança maior para as fases seguintes.

---

## Princípio de ordenação por risco

| Risco | Tipo de mudança | Impacto em caso de erro |
|-------|----------------|------------------------|
| Mínimo | docs-only | Nenhum funcional |
| Baixo | apenas novos testes | Não altera código de produção |
| Médio | CSS/JS de hardening isolado | Superfície visível limitada |
| Médio-alto | paridade entre equivalentes | Toca múltiplos módulos |
| Alto | extensão de padrão SWR | Altera fluxo de dados |
| Muito alto | refactor de arquivos monolíticos | Risco de regressão ampla |

---

## v11.25.x — Documentação e Contratos

**Tema:** Eliminar drift documental acumulado desde v9/v10. Zero risco funcional.

### v11.25.0 — Planejamento (este documento) ✅

| Campo | Valor |
|---|---|
| Branch | `codex/v11-25-0-backlog-planning` |
| Tipo | docs-only |
| Entrega | `docs/roadmap-v11.25-v11.30.md` + seção no RELATORIO |

### v11.25.1 — CHANGELOG: consolidação v11

| Campo | Valor |
|---|---|
| Branch | `codex/v11-25-1-changelog-consolidation` |
| Tipo | docs-only |
| Problema | `[Unreleased]` acumula todas as 26 iterações v11 (v11.1.0–v11.23.0). v11.24.0–v11.24.3 ainda ausentes do CHANGELOG |
| Ação | (1) Adicionar entradas `v11.24.0`–`v11.24.3` na seção `[Unreleased]`; (2) Fechar `[Unreleased]` criando entrada `[11.0.0] - 2026-04-12` com resumo consolidado de todas as iterações v11; (3) `[Unreleased]` fica vazio, pronto para próximas mudanças |
| Critério QA | `npx jest --runInBand` verde; hygiene verde |

### v11.25.2 — Docs drift: api-contract, db-schema, rpc-catalog

| Campo | Valor |
|---|---|
| Branch | `codex/v11-25-2-docs-drift` |
| Tipo | docs-only |
| Problema | `docs/api-contract.md` e `docs/db-schema.md` têm anotações v9 como estado ativo; `docs/rpc-catalog.md` (739 linhas) usa versões v9.2.x como referência atual das RPCs |
| Ação | (1) Atualizar anotações de versão em api-contract.md para refletir estado v11; (2) Corrigir anotações de colunas/triggers em db-schema.md; (3) Atualizar cabeçalhos de versão das RPCs em rpc-catalog.md (substituir `v9.x.x` por nota de versão v11 onde aplicável) |
| Critério QA | `npx jest --runInBand` verde; hygiene verde |

---

## v11.26.x — Cobertura de Regressão

**Tema:** Adicionar suites de teste para controllers críticos sem cobertura direta. Zero alteração em código de produção.

**Estado atual:** 14 controllers sem testes diretos. Prioritários:
- `create-post.controller.js` — fluxo central de criação de conteúdo
- `kc-feed.controller.js` — feed principal usado em home e módulos
- `index.controller.js` — bootstrap da home
- `achados-perdidos.controller.js`, `caronas-feed.controller.js`, `moradia.controller.js`, `eventos.controller.js` — módulos públicos sem cobertura

### v11.26.0 — Planejamento de cobertura

| Campo | Valor |
|---|---|
| Branch | `codex/v11-26-0-test-coverage-planning` |
| Tipo | docs-only |
| Ação | Auditar cada controller sem teste; mapear quais padrões são testáveis estaticamente (presença de contratos KCAPI, imports, inicializações); registrar estratégia por controller |

### v11.26.1 — Testes: create-post e kc-feed controllers

| Campo | Valor |
|---|---|
| Branch | `codex/v11-26-1-tests-create-post-feed` |
| Tipo | testes (sem alteração de produção) |
| Ação | Suites estáticas para `create-post.controller.js` (contratos de campos, inicialização) e `kc-feed.controller.js` (presença de contratos KCAPI, tabs de feed, paginação) |

### v11.26.2 — Testes: index, achados-perdidos, caronas, moradia, eventos

| Campo | Valor |
|---|---|
| Branch | `codex/v11-26-2-tests-module-controllers` |
| Tipo | testes (sem alteração de produção) |
| Ação | Suites estáticas para 5 controllers de módulos públicos; foco em inicialização, contratos de API usados e padrões de UI esperados |

---

## v11.27.x — Hardening iOS/Safari

**Tema:** Consolidar e expandir o hardening de iOS/Safari iniciado em v11.6.0. Mudanças CSS/JS isoladas e defensivas.

**Estado atual:** v11.6.0 cobriu pull-to-refresh, gestos horizontais e font-size de inputs. Superfícies não cobertas: modais, dropdowns, teclado virtual no auth, scroll em drawers mobile.

### v11.27.0 — Auditoria e planejamento

| Campo | Valor |
|---|---|
| Branch | `codex/v11-27-0-ios-safari-audit` |
| Tipo | docs-only |
| Ação | Auditar CSS/JS de modais, drawers, dropdown de perfil e auth modal para identificar problemas conhecidos de iOS/Safari (overscroll, position:fixed, viewport units, `-webkit-` prefixes ausentes) |

### v11.27.1 — Fixes CSS/JS iOS/Safari

| Campo | Valor |
|---|---|
| Branch | `codex/v11-27-1-ios-safari-fixes` |
| Tipo | feature (CSS/JS defensivo) |
| Ação | Aplicar fixes identificados na auditoria; foco em mudanças aditivas (adicionar propriedades CSS) e não-destrutivas |

---

## v11.28.x — Paridade entre equivalentes

**Tema:** Normalizar padrões divergentes entre os 6 módulos de feed e entre os 5 controllers admin.

**Estado atual:**
- 6 módulos (compra-venda, caronas, moradia, eventos, oportunidades, achados-perdidos) têm controllers separados; padrões de inicialização, guards de auth, error handling e loading states podem divergir
- 5 controllers admin (banners, dashboard, help-requests, invite, moderation, reports) seguem estruturas potencialmente divergentes

### v11.28.0 — Auditoria de paridade

| Campo | Valor |
|---|---|
| Branch | `codex/v11-28-0-parity-audit` |
| Tipo | docs-only |
| Ação | Mapear divergências concretas entre os 6 módulos e os 5 controllers admin; identificar quais são bugs vs. diferenças intencionais |

### v11.28.1 — Normalização dos 6 módulos

| Campo | Valor |
|---|---|
| Branch | `codex/v11-28-1-module-parity` |
| Tipo | feature (múltiplos controllers) |
| Ação | Normalizar padrões identificados na auditoria; apenas mudanças comprovadamente seguras pela cobertura de v11.26.x |

### v11.28.2 — Normalização dos controllers admin

| Campo | Valor |
|---|---|
| Branch | `codex/v11-28-2-admin-parity` |
| Tipo | feature (controllers admin) |
| Ação | Normalizar bootstrap, guards e error handling nos controllers admin; expandir testes admin se necessário |

---

## v11.29.x — Persistência incremental SWR

**Tema:** Estender o padrão `KCSessionStore` + revalidação silenciosa para módulos que ainda usam fetch síncrono direto.

**Estado atual:** O padrão foi introduzido em v11.9.0 (ranking/votos) e estendido em v11.10.0 (analytics/comentários de produto). Módulos de feed público (achados-perdidos, caronas, moradia, eventos, oportunidades) ainda não usam snapshot SWR para dados de sessão.

### v11.29.0 — Auditoria SWR

| Campo | Valor |
|---|---|
| Branch | `codex/v11-29-0-swr-audit` |
| Tipo | docs-only |
| Ação | Mapear todos os pontos de fetch de sessão/dados nos módulos restantes; identificar quais são elegíveis para SWR sem acoplar controllers |

### v11.29.1 — Extensão SWR para módulos restantes

| Campo | Valor |
|---|---|
| Branch | `codex/v11-29-1-swr-extension` |
| Tipo | feature |
| Ação | Aplicar snapshot SWR nos módulos identificados; regressão obrigatória após cada módulo migrado |

---

## v11.30.x — Hotspots monolíticos

**Tema:** Refatoração segura e incremental dos 2 arquivos maiores da base. Fase de maior risco — executada por último.

**Estado atual:**
- `assets/js/adapters/supabase.adapter.js` — ~162 KB, ~1800+ linhas
- `assets/js/controllers/product.controller.js` — ~139 KB, sem split interno

**Abordagem:** extração conservadora por camadas de responsabilidade, sem alterar contratos públicos. Cada split acompanhado de testes de regressão explícitos.

### v11.30.0 — Auditoria e estratégia de split

| Campo | Valor |
|---|---|
| Branch | `codex/v11-30-0-monolith-audit` |
| Tipo | docs-only |
| Ação | Mapear grupos de responsabilidade em cada arquivo; identificar quais extrações são seguras sem quebrar imports ou contratos; definir estratégia de carregamento para submódulos |

### v11.30.1 — supabase.adapter.js — fase 1

| Campo | Valor |
|---|---|
| Branch | `codex/v11-30-1-supabase-adapter-split` |
| Tipo | refactor (alto risco) |
| Ação | Extrair helpers utilitários e funções privadas para submódulo(s); manter fachada pública intacta; suite de regressão obrigatória antes e depois |

### v11.30.2 — product.controller.js — fase 1

| Campo | Valor |
|---|---|
| Branch | `codex/v11-30-2-product-controller-split` |
| Tipo | refactor (alto risco) |
| Ação | Extrair lógica de popovers e analytics para helpers; manter comportamento público intacto |

---

## Tabela resumo de versões

| Versão | Tema | Tipo | Risco |
|--------|------|------|-------|
| v11.25.0 | Planejamento (este doc) | docs | mínimo |
| v11.25.1 | CHANGELOG consolidação | docs | mínimo |
| v11.25.2 | Docs drift (api-contract, db-schema, rpc-catalog) | docs | mínimo |
| v11.26.0 | Planejamento de cobertura de testes | docs | mínimo |
| v11.26.1 | Testes create-post + kc-feed controllers | testes | baixo |
| v11.26.2 | Testes 5 módulos controllers | testes | baixo |
| v11.27.0 | Auditoria iOS/Safari | docs | mínimo |
| v11.27.1 | Fixes CSS/JS iOS/Safari | feature | baixo |
| v11.28.0 | Auditoria paridade equivalentes | docs | mínimo |
| v11.28.1 | Normalização 6 módulos | feature | médio |
| v11.28.2 | Normalização 5 controllers admin | feature | médio |
| v11.29.0 | Auditoria SWR | docs | mínimo |
| v11.29.1 | Extensão SWR módulos restantes | feature | alto |
| v11.30.0 | Auditoria hotspots monolíticos | docs | mínimo |
| v11.30.1 | supabase.adapter.js — split fase 1 | refactor | muito alto |
| v11.30.2 | product.controller.js — split fase 1 | refactor | muito alto |

---

## Regras de governança (herdadas da v11)

1. Cada iteração exige branch dedicada, PR, merge squash, exclusão da branch e pull na base
2. `npx jest --runInBand` verde antes de cada commit funcional
3. `node scripts/hygiene-check.js` verde antes de cada commit funcional
4. Validação Vercel (preview READY → promote to production → smoke `200`)
5. RELATORIO-KINOCAMPUS-V11.md e README.md atualizados a cada iteração
6. Aprovação explícita obrigatória antes de iniciar cada fase de risco médio ou superior
