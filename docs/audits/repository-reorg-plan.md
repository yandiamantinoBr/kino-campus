# Plano de Reorganização de Repositório — V14

**Data:** 2026-04-26  
**Versão:** v14.0.0 (doc-only)  
**Contexto:** Reorganização progressiva após V13 (hotspots eliminados, governança estabelecida)

---

## 1. Estado atual do repositório

### 1.1 Estrutura de assets/js/

```
assets/js/                     (66 arquivos na raiz)
  controllers/                 (41 arquivos — público + admin misturados)
  adapters/                    (19 arquivos — local + supabase misturados)
```

**Total:** 126 arquivos JS de runtime

### 1.2 Mapa de tamanhos (Top 15)

| Arquivo | Linhas |
|---|---|
| kc-api.client.js | 2410L |
| admin-reports.controller.js | 1096L |
| admin-moderation.controller.js | 1093L |
| moradia.controller.js | 1077L |
| kc-comments.js | 1068L |
| admin-dashboard.audit.js | 1044L |
| supabase.posts-read.adapter.js | 966L |
| account-profile.shared.js | 962L |
| kc-utils.location.js | 953L |
| kc-i18n.js | 803L |
| oportunidades.normalize.js | 636L |
| kc-supabase.posts.js | 554L |
| kc-profiles.client.js | 535L |
| kc-core-widgets.js | 245L |
| kc-user-posts.js | 234L |

### 1.3 Inventário de tests/ (134 arquivos)

```
tests/
  e2e/                   (8 specs Playwright)
  *.test.js              (134 arquivos na raiz — misturados)
```

### 1.4 Inventário de docs/

```
docs/
  audits/
    refactors/           (4 auditorias V13 + README)
  releases/
    v12/                 (RELATORIO-V12 + docs relacionados)
  a11y-audit-v12.8.md   (a mover)
  i18n-b2-coverage-v12.7.md (a mover)
  feature-flags-plan-v12.6.md (em audits/refactors — a mover)
```

---

## 2. Estrutura-alvo V14

### 2.1 assets/js/ — estrutura-alvo

```
assets/js/
  boot/                  ← kc-constants, kc-env, kc-feature-flags, kc-sw-register, kc-telemetry (V15)
  core/                  ← kc-core, kc-core-widgets, kc-post-model, kc-user-posts, kc-auth.ui, kc-auth-callback (V15)
  api/                   ← kc-api.*, kc-supabase.*, kc-profiles.client (V15)
  utils/                 ← kc-utils, kc-utils.* (V14.7)
  legacy-shims/          ← arquivos de shim futuros (V14.2, vazio inicialmente)
  adapters/
    local/               ← local.adapter, local.*.adapter (V14.8)
    supabase/            ← supabase.*.adapter (V14.8)
  controllers/
    public/              ← controllers de páginas públicas (V14.9)
    admin/               ← controllers admin (V14.9)
  [raiz]                 ← shared.js, features (mover em V15+)
```

### 2.2 tests/ — estrutura-alvo

```
tests/
  unit/                  ← módulos puros (kc-utils.*.test, kc-core.test, kc-i18n.test)
  integration/           ← controllers + adapters
  contract/              ← kc-api-*.test, kc-supabase-*.test
  structure/             ← validate-*.test, *-split.test, sw.test
  a11y/                  ← a11y.test, i18n-*.test
  fixtures/              ← dados mock reutilizáveis
  e2e/                   ← Playwright (já existe)
```

### 2.3 docs/ — estrutura-alvo

```
docs/
  audits/
    refactors/           ← auditorias de hotspots (já existe)
    accessibility/       ← a11y-audit-v12.8.md (a criar)
    security/            ← (futuros)
    performance/         ← css-split-plan.md (V14.4)
    repository-reorg-plan.md (este arquivo)
  architecture/
    repository-structure.md (V14.1)
  releases/
    v11/                 ← docs V11 (a criar)
    v12/                 ← já existe
  qa/
    reports/             ← relatórios de QA
  legacy/                ← docs antigos
```

---

## 3. Plano de migração — Fase a fase

### Fase 1: Documentação (v14.0.0–v14.1.0) — ZERO risco
- Criar RELATORIO-V14, repository-reorg-plan.md, architecture docs
- Sem tocar em nenhum arquivo de runtime

### Fase 2: Subdirs vazios (v14.2.0–v14.3.0) — ZERO risco
- Criar diretórios com README apenas
- Sem mover nenhum arquivo JS
- `validate-repository-structure.js` atualizado para verificar novos dirs

### Fase 3: CSS + Docs + Tests (v14.4.0–v14.6.0) — BAIXO risco
- CSS future-split: apenas stubs comentados, não carregados
- Docs: mover documentos (sem impacto em runtime)
- Tests: mover arquivos .test.js, atualizar jest.config.js
  - Rollback: `git checkout .` + `git checkout -- jest.config.js`

### Fase 4: Movimentação JS (v14.7.0–v14.9.0) — MÉDIO risco
- Script Node.js atômico por grupo
- Atualiza src= em todos os HTMLs
- Valida: `npm test` + `check:all` antes de commit
- Rollback: `git checkout .`

---

## 4. Mapa de scripts por página (22 HTMLs)

### Cadeia de boot (todos os 22 HTMLs)
```
kc-constants.js → kc-env.js → kc-feature-flags.js → kc-sw-register.js → kc-telemetry.js
```

### Cadeia Supabase (todas as páginas com auth)
```
[Supabase CDN] → kc-supabase.client.js → kc-supabase.posts.js → kc-supabase.ratings.js
```

### Cadeia utils (todas as páginas)
```
kc-utils.string.js → kc-utils.format.js → kc-utils.dom.js → kc-utils.identity.js →
kc-utils.taxonomy.js → kc-utils.location.js → kc-utils.presentation.js → kc-utils.js
```

### Após v14.7.0 (utils movidos)
```
assets/js/utils/kc-utils.string.js → ... → assets/js/utils/kc-utils.js
```

---

## 5. Dependências críticas entre módulos

### kc-utils.js depende de (deve carregar após)
- kc-utils.string.js, kc-utils.format.js, kc-utils.dom.js
- kc-utils.identity.js, kc-utils.taxonomy.js, kc-utils.location.js, kc-utils.presentation.js

### kc-api.client.js depende de
- kc-supabase.client.js (já carregado antes)
- kc-utils.js

### Controllers dependem de
- kc-core.js, kc-utils.js, kc-api.client.js (já carregados)
- kc-core-widgets.js, kc-post-model.js, kc-user-posts.js (antes de kc-core.js)

---

## 6. Rotas públicas — mapa completo (22 rotas)

### Páginas públicas (17)
| Rota | HTML |
|---|---|
| / | index.html |
| /oportunidades.html | oportunidades.html |
| /eventos.html | eventos.html |
| /moradia.html | moradia.html |
| /caronas-feed.html | caronas-feed.html |
| /compra-venda-feed.html | compra-venda-feed.html |
| /achados-perdidos.html | achados-perdidos.html |
| /ods.html | ods.html |
| /search-results.html | search-results.html |
| /_product.html | _product.html |
| /create-post.html | create-post.html |
| /profile.html | profile.html |
| /settings.html | settings.html |
| /my-posts.html | my-posts.html |
| /auth-callback.html | auth-callback.html |
| /help.html | help.html |
| /login.html | login.html |

### Páginas admin (5)
| Rota | HTML |
|---|---|
| /admin/ | admin/index.html |
| /admin/moderation.html | admin/moderation.html |
| /admin/banners.html | admin/banners.html |
| /admin/reports.html | admin/reports.html |
| /admin/settings.html | admin/settings.html |

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| HTML com src= quebrado após mover utils | Alta | Script Node.js atômico + `check:scripts` antes de commitar |
| Jest não encontra tests/ após reorganização | Média | Atualizar jest.config.js testMatch; rodar suíte antes do PR |
| hygiene-check.js falha por caminhos antigos | Média | Atualizar kcuScriptChain + swChain em hygiene-check.js na mesma iteração |
| validate-script-chains.js desatualizado | Média | Atualizar junto com cada movimentação |
| CSS future-split acidentalmente carregado | Baixa | Arquivos stub sem `<link>` nos HTMLs |
