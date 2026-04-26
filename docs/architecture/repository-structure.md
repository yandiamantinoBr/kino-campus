# Estrutura do Repositório — KinoCampus

**Versão:** v14.1.0  
**Data:** 2026-04-26

---

## 1. Visão Geral

KinoCampus é uma plataforma Vanilla JS + HTML + CSS, sem bundler. Todo o código JS é servido como arquivos estáticos via Vercel. Os scripts são carregados via `<script defer src="...">` em ordem determinística nos HTMLs.

---

## 2. Estrutura atual (v14.0.0)

```
kino-campus/
  assets/
    js/
      controllers/          ← 41 controllers (público + admin misturados)
      adapters/             ← 19 adapters (local + supabase misturados)
      [raiz]                ← 66 arquivos (boot, api, utils, core, features)
    css/
      styles.css            ← CSS monolítico (~243KB)
      kc-theme-boot.css     ← tema inicial (carregado no head)
      kc-public-shell.css   ← shell público
    images/
  tests/
    e2e/                    ← specs Playwright
    [raiz]                  ← 134 arquivos .test.js misturados
  docs/
    audits/
      refactors/            ← 4 auditorias de hotspots
    releases/
      v12/                  ← RELATORIO-V12 + docs
  scripts/                  ← validators + hygiene-check + build tools
  [raiz]                    ← 17 HTMLs públicos + 5 admin/
  admin/                    ← 5 HTMLs admin
  sw.js                     ← Service Worker
  vercel.json               ← config deploy (não tocar)
  jest.config.js
  package.json
  VERSION.json
```

---

## 3. Estrutura-alvo (V14 + V15)

```
kino-campus/
  assets/
    js/
      boot/                 ← kc-constants, kc-env, kc-feature-flags, kc-sw-register, kc-telemetry
      core/                 ← kc-core, kc-core-widgets, kc-post-model, kc-user-posts, kc-auth.*
      api/                  ← kc-api.*, kc-supabase.*, kc-profiles.client
      utils/                ← kc-utils, kc-utils.* (8 módulos)   ← V14.7
      legacy-shims/         ← shims futuros (vazio inicialmente)
      adapters/
        local/              ← local.adapter, local.*.adapter      ← V14.8
        supabase/           ← supabase.*.adapter                  ← V14.8
      controllers/
        public/             ← controllers de páginas públicas     ← V14.9
        admin/              ← controllers admin                   ← V14.9
      [shared + features]   ← *.shared.js, kc-comments, kc-filters etc.
    css/
      styles.css
      kc-theme-boot.css
      kc-public-shell.css
      future-split/         ← stubs CSS (não carregados)          ← V14.4
  tests/
    unit/                   ← módulos puros                       ← V14.6
    integration/            ← controllers + adapters              ← V14.6
    contract/               ← kc-api-*, kc-supabase-*            ← V14.6
    structure/              ← validação estrutural                ← V14.6
    a11y/                   ← acessibilidade + i18n               ← V14.6
    fixtures/               ← dados mock                          ← V14.6
    e2e/                    ← Playwright (já existe)
  docs/
    audits/
      refactors/            ← auditorias de hotspots (V13)
      accessibility/        ← a11y-audit                          ← V14.5
      performance/          ← css-split-plan                      ← V14.4
      repository-reorg-plan.md                                    ← V14.0
    architecture/
      repository-structure.md (este arquivo)                      ← V14.1
    releases/
      v11/                                                         ← V14.5
      v12/                  (já existe — V13.3)
    qa/
      reports/                                                     ← V14.5
```

---

## 4. Convenções de nomenclatura

### 4.1 Arquivos JS

| Padrão | Significado |
|---|---|
| `kc-*.js` | Módulo core KinoCampus (boot, utils, auth, features) |
| `kc-utils.*.js` | Sub-módulo de utils (string, format, dom, etc.) |
| `kc-api.*.js` | Sub-módulo da API facade |
| `kc-supabase.*.js` | Sub-módulo Supabase |
| `*.controller.js` | Controller de página |
| `*.adapter.js` | Adapter de persistência |
| `*.shared.js` | Módulo compartilhado entre páginas |
| `*.normalize.js` | Módulo de normalização extraído de controller |

### 4.2 Namespaces globais

| Namespace | Módulo | Padrão |
|---|---|---|
| `window.KCAPI` | kc-api.client.js | Object.freeze facade |
| `window._KCAPI.*` | kc-api.*.js | IIFE + Object.freeze |
| `window.KCSupabase` | kc-supabase.client.js | Object.freeze facade |
| `window.KCUtils` | kc-utils.js | Object.freeze |
| `window._KCU.*` | kc-utils.*.js | IIFE + Object.freeze |
| `window.KCCore` | kc-core.js | Object |
| `window.KCPostModel` | kc-post-model.js | Object |
| `window.kcUserPosts` | kc-user-posts.js | IIFE |
| `window._KCProduct.*` | product.load.js, product.ui.js | IIFE |
| `window._KCOpNormalize` | oportunidades.normalize.js | Object.freeze |
| `window.KCControllers` | kc-feed.controller.js | Object |

---

## 5. Regras de carregamento de scripts

### 5.1 Ordem obrigatória (cadeia de boot)
Todos os 22 HTMLs devem carregar na sequência:
1. `kc-constants.js`
2. `kc-env.js`
3. `kc-feature-flags.js`
4. `kc-sw-register.js`
5. `kc-telemetry.js`

Validado por `scripts/validate-script-chains.js`.

### 5.2 Regra de dependência
Sub-módulos devem ser carregados ANTES do módulo principal:
- `kc-utils.*.js` → antes de `kc-utils.js`
- `kc-api.*.js` → após `kc-api.client.js` (são extensions do client)
- `kc-supabase.posts.js`, `kc-supabase.ratings.js` → após `kc-supabase.client.js`
- `kc-post-model.js`, `kc-user-posts.js`, `kc-core-widgets.js` → antes de `kc-core.js`
- `oportunidades.normalize.js` → antes de `oportunidades.controller.js`

### 5.3 Regra de rollback de caminhos
Após movimentação de arquivos:
1. Todos os `src="..."` nos 22 HTMLs devem ser atualizados atomicamente
2. `scripts/validate-script-chains.js` deve ser atualizado na mesma iteração
3. `npm test` + `npm run check:all` devem passar antes do commit

---

## 6. Delta V14 × atual

| Item | Estado atual | Estado alvo V14 |
|---|---|---|
| kc-utils.*.js | assets/js/ raiz | assets/js/utils/ |
| local.*.adapter.js | assets/js/adapters/ | assets/js/adapters/local/ |
| supabase.*.adapter.js | assets/js/adapters/ | assets/js/adapters/supabase/ |
| controllers públicos | assets/js/controllers/ | assets/js/controllers/public/ |
| controllers admin | assets/js/controllers/ | assets/js/controllers/admin/ |
| tests misturados | tests/ raiz | tests/{unit,integration,contract,structure,a11y}/ |
| docs a11y | docs/ raiz | docs/audits/accessibility/ |
| docs architecture | não existe | docs/architecture/ |
