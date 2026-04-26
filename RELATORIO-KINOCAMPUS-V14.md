# RELATÓRIO KINOCAMPUS — V14
## Reorganização de Repositório (Fase 1)

**Status:** v14 em execução  
**Abertura:** 2026-04-26  
**Base:** `kinocampus-V11.0-foundations` (branch permanente)  
**Antecessor:** v13.8.0 (PR #454) — v13 ENCERRADA  
**Tema:** Repository Structure Foundation — Diretórios, Docs & Tests  
**Tracks:** Único track (reorganização progressiva, sem mudança de stack)

---

## 1. Contexto & Motivação

### 1.1 Estado ao abrir V14

A trilha **v13 foi encerrada** com todos os critérios da Definition of Done atendidos:

| Métrica | Baseline V13 | Entrega V13 |
|---|---|---|
| Jest suites | 127 | 134 (+7) |
| Jest testes | 2647 | 3046 (+399) |
| check:all | Não existia | ✅ 5 validators |
| Hotspots > 1100L | 4 arquivos | 0 arquivos |
| VERSION.json | Não existia | ✅ appVersion=13.0.0 |
| docs/audits/refactors/ | Não existia | ✅ 4 auditorias |

### 1.2 O que V14 resolve

**Estrutura atual (plana):**
- `assets/js/` — 129 arquivos misturados na raiz + `controllers/` + `adapters/`
- `docs/` — estrutura parcialmente organizada (criada em v13.3.0)
- `tests/` — 134 arquivos na raiz de `tests/`, apenas `e2e/` subdir

**O que V14 faz:**
1. Criar subdirs JS com READMEs (sem mover arquivos de runtime)
2. Criar subdirs adapters com READMEs (sem mover arquivos de runtime)
3. Documentar plano de split CSS
4. Reorganizar `docs/` completamente
5. Reorganizar `tests/` em subdiretórios
6. Mover `kc-utils.*.js` para `assets/js/utils/` (atualiza HTMLs)
7. Mover adapters para `assets/js/adapters/local/` e `adapters/supabase/`
8. Mover controllers para `controllers/public/` e `controllers/admin/`
9. Lighthouse thresholds produção
10. Release gate

**O que V14 NÃO faz:**
- Não muda stack (sem React, Vite, TS, bundler)
- Não move HTMLs públicos (preserva rotas)
- Não altera `vercel.json` rewrites ou CSP
- Não quebra nenhum contrato público `window.*`

**Tema V14:** *"Repository Structure Foundation — Diretórios, Docs & Tests"*

---

## 2. Inventário atual

### 2.1 assets/js/ — raiz (66 arquivos)

| Grupo | Arquivos | Destino V14 |
|---|---|---|
| Boot/infra | kc-constants.js, kc-env.js, kc-feature-flags.js, kc-sw-register.js, kc-telemetry.js | `assets/js/boot/` (V15) |
| API facade | kc-api.client.js, kc-api.auth.js, kc-api.comments-votes.js, kc-api.help.js, kc-api.notifications.js, kc-api.posts-feed.js, kc-api.posts-read.js, kc-api.posts-write.js, kc-api.profiles.js, kc-api.ratings.js, kc-api.related.js, kc-api.saved.js | `assets/js/api/` (V15) |
| Supabase | kc-supabase.client.js, kc-supabase.posts.js, kc-supabase.ratings.js | `assets/js/api/` (V15) |
| Utils | kc-utils.js, kc-utils.string.js, kc-utils.format.js, kc-utils.dom.js, kc-utils.identity.js, kc-utils.taxonomy.js, kc-utils.location.js, kc-utils.presentation.js | `assets/js/utils/` (**V14.7**) |
| Core | kc-core.js, kc-core-widgets.js, kc-post-model.js, kc-user-posts.js | `assets/js/core/` (V15) |
| Shared | account-profile.shared.js, kc-comments.shared.js, kc-search.shared.js, home-categories.shared.js, help.shared.js, ods.shared.js, search-analytics.shared.js | Manter em raiz por ora |
| Auth | kc-auth.ui.js, kc-auth-callback.js | `assets/js/core/` (V15) |
| Features | kc-comments.js, kc-banners.js, kc-create-post.js, kc-create-post.*.js, kc-filters.js, kc-i18n.js, kc-lazy-loader.js, kc-pull-to-refresh.js, kc-ranking.js, kc-search.js, kc-search-modal.js, kc-profiles.client.js, kc-notifications.js, kc-overlay-lock.js, kc-session-store.js, kc-feed-filters.js, kc-form-validator.js | Manter em raiz por ora |
| Admin | admin-shell.js | Manter em raiz |

### 2.2 assets/js/controllers/ (41 arquivos)

| Grupo | Arquivos | Destino V14 |
|---|---|---|
| Páginas públicas | compra-venda.controller.js, eventos.controller.js, moradia.controller.js, oportunidades.controller.js, oportunidades.normalize.js, caronas.controller.js, achados-perdidos.controller.js, ods.controller.js, search-results.controller.js | `controllers/public/` (**V14.9**) |
| Produto | product.controller.js, product.*.js (8 sub-módulos), product.load.js, product.ui.js | `controllers/public/` (**V14.9**) |
| Admin | admin-*.controller.js, admin-*.audit.js | `controllers/admin/` (**V14.9**) |
| Feeds | kc-feed.controller.js | `controllers/public/` (**V14.9**) |
| Profile/Settings | profile.controller.js, settings.controller.js, my-posts.controller.js, help.controller.js | `controllers/public/` (**V14.9**) |

### 2.3 assets/js/adapters/ (19 arquivos)

| Grupo | Arquivos | Destino V14 |
|---|---|---|
| Local adapters | local.adapter.js, local.*.adapter.js (6 sub-adapters) | `adapters/local/` (**V14.8**) |
| Supabase adapters | supabase.posts-read.adapter.js, supabase.posts-write.adapter.js, supabase.*.adapter.js | `adapters/supabase/` (**V14.8**) |

### 2.4 tests/ (134 arquivos + e2e/)

| Grupo | Arquivos | Destino V14 |
|---|---|---|
| Contrato | kc-api-*.test.js, kc-supabase-*.test.js | `tests/contract/` (**V14.6**) |
| Unit | kc-utils.*.test.js, kc-core.test.js, kc-i18n.test.js | `tests/unit/` (**V14.6**) |
| Estrutural/Gate | validate-*.test.js, *-split.test.js, sw.test.js | `tests/structure/` (**V14.6**) |
| A11y | a11y.test.js, i18n-*.test.js | `tests/a11y/` (**V14.6**) |
| Integração | *.controller.test.js, *.adapter.test.js | `tests/integration/` (**V14.6**) |
| E2E | tests/e2e/* | Permanecem em `tests/e2e/` |

### 2.5 docs/ (estado atual após v13)

```
docs/
  audits/
    refactors/   — 4 auditorias de hotspots + README
    README.md (a criar em v14.5.0)
  releases/
    v12/         — RELATORIO-V12 + docs V12
    README.md (a criar em v14.5.0)
  a11y-audit-v12.8.md   — a mover para audits/accessibility/
  i18n-b2-coverage-v12.7.md — a mover para audits/
```

---

## 3. Sequência de iterações V14

| Iter | Escopo | Status | PR | Testes |
|---|---|---|---|---|
| v14.0.0 | Abertura docs-only + repository-reorg-plan.md | ⏳ Pendente | — | — |
| v14.1.0 | docs/architecture/repository-structure.md | ⏳ Pendente | — | — |
| v14.2.0 | Criar subdirs JS com READMEs (5 dirs, sem mover JS) | ⏳ Pendente | — | — |
| v14.3.0 | Criar subdirs adapters com READMEs | ⏳ Pendente | — | — |
| v14.4.0 | CSS future-split: docs + assets/css/future-split/ stubs | ⏳ Pendente | — | — |
| v14.5.0 | docs/ reorganização completa | ⏳ Pendente | — | — |
| v14.6.0 | tests/ reorganização — subdirs + jest.config.js | ⏳ Pendente | — | — |
| v14.7.0 | Mover kc-utils.*.js → assets/js/utils/ | ⏳ Pendente | — | — |
| v14.8.0 | Mover adapters → adapters/local/ e adapters/supabase/ | ⏳ Pendente | — | — |
| v14.9.0 | Mover controllers → controllers/public/ e controllers/admin/ | ⏳ Pendente | — | — |
| v14.10.0 | Lighthouse thresholds produção | ⏳ Pendente | — | — |
| v14.11.0 | Release gate v14 | ⏳ Pendente | — | — |

---

## 4. Definition of Done — V14

### Estrutura de diretórios
- [ ] `assets/js/boot/` existe (com README)
- [ ] `assets/js/core/` existe (com README)
- [ ] `assets/js/api/` existe (com README)
- [ ] `assets/js/utils/` existe e contém todos os `kc-utils.*.js` + `kc-utils.js`
- [ ] `assets/js/legacy-shims/` existe (com README)
- [ ] `assets/js/adapters/local/` existe e contém todos os `local.*.adapter.js`
- [ ] `assets/js/adapters/supabase/` existe e contém todos os `supabase.*.adapter.js`
- [ ] `assets/js/controllers/public/` existe com controllers de páginas públicas
- [ ] `assets/js/controllers/admin/` existe com controllers admin

### Documentação
- [ ] `docs/audits/repository-reorg-plan.md` existe (inventário completo)
- [ ] `docs/architecture/repository-structure.md` existe
- [ ] `docs/audits/css-split-plan.md` existe
- [ ] `assets/css/future-split/` existe com 5 stubs

### Tests
- [ ] `tests/unit/` existe com testes de módulos puros
- [ ] `tests/integration/` existe com testes de integração
- [ ] `tests/contract/` existe com testes de contrato
- [ ] `tests/structure/` existe com testes estruturais
- [ ] `tests/a11y/` existe com testes de acessibilidade
- [ ] `jest.config.js` atualizado com novos testMatch patterns

### Qualidade
- [ ] `npm test` preservado ≥ baseline V13 (134/3046)
- [ ] `check:all` verde (todos os validators)
- [ ] Nenhum HTML com `<script src>` apontando para arquivo inexistente
- [ ] `CHANGELOG.md` com entrada formal `## [14.0.0] - YYYY-MM-DD`
- [ ] Zero quebra de contrato público `window.*`

---

## 5. Estratégia de rollback

Para as iterações de movimentação de JS (v14.7.0–v14.9.0):

```bash
# Antes de cada movimentação:
git stash  # ou branch limpa

# Script de migração atualiza src="" nos HTMLs atomicamente
# Validar imediatamente:
npm test
npm run check:all

# Se qualquer teste falhar:
git checkout .  # Reverte tudo — sem commit
# Investigar → corrigir → re-executar
```

---

*Documento atualizado a cada iteração do ciclo V14.*
