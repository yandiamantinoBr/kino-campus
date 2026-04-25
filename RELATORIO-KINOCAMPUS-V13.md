# RELATÓRIO KINOCAMPUS — V13
## Governança Estrutural & Hotspots Secundários

**Status:** v13 em execução  
**Abertura:** 2026-04-25  
**Base:** `kinocampus-V11.0-foundations` (branch permanente)  
**Antecessor:** v12.13.0 (PR #436) — v12 ENCERRADA  
**Tema:** Governança Estrutural & Hotspots Secundários  
**Tracks:** Track G (Governança) + Track A (Camada A continuada)

---

## 1. Contexto & Motivação

### 1.1 Estado ao abrir V13

A trilha **v12 foi encerrada** com todos os critérios da Definition of Done atendidos:

| Métrica | Baseline V12 | Entrega V12 |
|---|---|---|
| Jest suites | 99 | 127 (+28) |
| Jest testes | 1874 | 2647 (+773) |
| Playwright E2E | 0 | 51 |
| Hygiene-check | 8.6.0 ✓ | 8.6.0 ✓ |
| Hotspots > 1100L reduzidos (Camada A v12) | 4 ficheiros | 4 ficheiros tratados |
| Service Worker | Não existia | sw.js + kc-sw-register.js (Camada C) |
| Error boundary / Telemetria | Não existia | kc-telemetry.js (Camada C) |
| WCAG 2.1 AA (a11y) | Parcial | Confirmado (Camada B) |
| Lighthouse CI | Não existia | .lighthouserc.js (Camada B) |
| Playwright infra | Não existia | playwright.config.js + 51 E2E (Camada B) |

### 1.2 O que V13 resolve

**Hotspots JS remanescentes > 1100L** (identificados como "fora do escopo v12"):

| Arquivo | Linhas | Problema |
|---|---|---|
| `assets/js/controllers/product.controller.js` | ~1494L | Maior controller vivo — init/load/UI/auth misturados |
| `assets/js/kc-supabase.client.js` | ~1364L | Auth + session + realtime monolítico |
| `assets/js/controllers/oportunidades.controller.js` | ~1246L | Feed controller sem split |
| `assets/js/kc-core.js` | ~1221L | PostModel + renderCard + coreUI misturados |

**Governança faltante** (identificada na auditoria pré-V13):

- `VERSION.json` não existe — versão espalhada em strings hard-coded em 5+ arquivos JS
- Scripts de validação estrutural **não existem**: `validate-repository-structure.js`, `validate-script-chains.js`, `validate-public-routes.js`, `validate-version-map.js`
- `docs/` estrutura plana — sem `audits/`, `releases/`, `architecture/` separados
- `package.json` sem scripts `check:*` (hygiene, structure, scripts, routes, version, all)

**Tema V13:** *"Governança Estrutural & Hotspots Secundários"*

---

## 2. Arquitetura V13

### 2.1 Tracks paralelos

**Track G — Governança** (executado primeiro — serve de infra para os splits):
- `VERSION.json` como fonte única de versão
- 4 scripts de validação estrutural
- `package.json` scripts `check:*`
- `docs/` reorganização com subdirs

**Track A — Camada A continuada** (splits dos 4 hotspots primários):
- Padrão: IIFE + `window._KC*.*` + módulos extraídos
- Meta: nenhum JS > 1100L (exceto `kc-api.client.js` como registry/facade)
- Cada split acompanhado de auditoria doc-only + testes

### 2.2 Namespaces V13 (novos)

| Namespace | Arquivo | Responsabilidade |
|---|---|---|
| `window._KCProduct.load` | `product.load.js` | Lógica de load, renderHero, applyRules |
| `window._KCProduct.ui` | `product.ui.js` | Handlers de UI, modais, toggles |
| `KCPostModel` | `kc-post-model.js` | Modelo de dados de post |
| `KCRenderCard` | `kc-render-card.js` | Renderização de cards |

### 2.3 Governança de scripts (novos em V13)

| Script | Localização | Função |
|---|---|---|
| `validate-repository-structure.js` | `scripts/` | Verifica existência de dirs e arquivos obrigatórios |
| `validate-script-chains.js` | `scripts/` | Valida ordem de carregamento nos 22 HTMLs |
| `validate-public-routes.js` | `scripts/` | Confirma que todas as rotas públicas existem |
| `validate-version-map.js` | `scripts/` | Valida VERSION.json e consistência de versão |

---

## 3. Iterações V13

### 3.1 Track G — Governança

| Iter | Escopo | Status | PR | Testes |
|---|---|---|---|---|
| v13.0.0 | Abertura docs-only | ✅ Concluído | #437 | 127/2647 |
| v13.1.0 | VERSION.json + validate-version-map.js | ✅ Concluído | #438 | 128/2669 |
| v13.2.0 | 3 scripts de validação estrutural | ✅ Concluído | #439 | 130/2735 |
| v13.2.1 | package.json check:* + hygiene integração | ✅ Concluído | #440 | 131/2748 |
| v13.3.0 | docs/ reorganização | ✅ Concluído | #441 | 131/2748 |

### 3.2 Track A — Hotspot splits

| Iter | Escopo | Status | PR | Testes |
|---|---|---|---|---|
| v13.4.0 | Auditoria product.controller.js (doc-only) | ✅ Concluído | #442 | 131/2748 |
| v13.4.1 | Split product.controller.js — render + load | ✅ Concluído | #443 | 131/2802 |
| v13.4.2 | Gate product.controller.js < 800L | ✅ Concluído | #444 | 131/2802 |
| v13.5.0 | Auditoria kc-supabase.client.js (doc-only) | ⏳ Pendente | — | — |
| v13.5.1 | Split kc-supabase.client.js — auth + session | ⏳ Pendente | — | — |
| v13.5.2 | Gate kc-supabase.client.js < 700L | ⏳ Pendente | — | — |
| v13.6.0 | Auditoria kc-core.js (doc-only) | ⏳ Pendente | — | — |
| v13.6.1 | Split kc-core.js — PostModel + RenderCard | ⏳ Pendente | — | — |
| v13.6.2 | Gate kc-core.js < 700L | ⏳ Pendente | — | — |
| v13.7.0 | Auditoria oportunidades.controller.js (doc-only) | ⏳ Pendente | — | — |
| v13.7.1 | Split oportunidades.controller.js | ⏳ Pendente | — | — |
| v13.7.2 | Gate oportunidades.controller.js < 700L | ⏳ Pendente | — | — |

### 3.3 Gate final

| Iter | Escopo | Status | PR | Testes |
|---|---|---|---|---|
| v13.8.0 | Release gate v13 completo | ⏳ Pendente | — | — |

---

## 4. Definition of Done — V13

### 4.1 Camada A — Hotspots secundários eliminados

- [ ] `product.controller.js` < 800L
- [ ] `kc-supabase.client.js` < 700L
- [ ] `kc-core.js` < 700L
- [ ] `oportunidades.controller.js` < 700L
- [ ] Nenhum JS em `assets/js/` > 1100L (exceto `kc-api.client.js`)
- [ ] Novos namespaces `_KCProduct.*`, `KCPostModel`, `KCRenderCard` documentados

### 4.2 Governança

- [ ] `VERSION.json` existe com campos obrigatórios
- [ ] `scripts/validate-repository-structure.js` existe e passa
- [ ] `scripts/validate-script-chains.js` existe e passa
- [ ] `scripts/validate-public-routes.js` existe e passa
- [ ] `scripts/validate-version-map.js` existe e passa
- [ ] `package.json` tem scripts: `check:hygiene`, `check:structure`, `check:scripts`, `check:routes`, `check:version`, `check:all`
- [ ] `docs/audits/refactors/` existe com 4 auditorias dos hotspots
- [ ] `docs/releases/v12/` existe com RELATORIO-V12 movido

### 4.3 Baseline

- [ ] `npm test` ≥ **140 suites / 2800 testes**
- [ ] `hygiene-check.js` verde (8.6.0+)
- [ ] `check:all` passa (todos os validators + Jest)
- [ ] `RELATORIO-KINOCAMPUS-V13.md` atualizado a cada iteração
- [ ] `CHANGELOG.md` com entrada formal `## [13.0.0] - 2026-04-25`
- [ ] Zero quebras de contrato público `window.*`

---

## 5. Log de iterações executadas

### 5.1 v13.0.0 — Abertura docs-only (2026-04-25)

**Branch:** `feature/v13.0.0-abertura-ciclo-docs`  
**Escopo:** Documentação de abertura do ciclo V13  
**Entrega:**
- `RELATORIO-KINOCAMPUS-V13.md` criado (este documento)
- `README.md` atualizado: status → "v13 em execução"
- `CHANGELOG.md` atualizado: entrada `[13.0.0-planning]`

**Baseline preservada:** 127 suites · 2647 testes  
**PR:** _(a preencher após merge)_

---

## 6. Hotspots — Estado inicial

### 6.1 product.controller.js

**Localização:** `assets/js/controllers/product.controller.js`  
**Linhas baseline:** ~1494L  
**Sub-módulos existentes:** product.analytics, product.calendar, product.edit, product.popovers, product.ratings, product.related, product.report, product.save (8 módulos)  
**Problema:** Controller residual ainda contém load/init/UI/auth inline

**Estratégia:**
1. Extrair `product.load.js` — loadProduct(), renderHero(), applyRules(), estado inicial
2. Extrair `product.ui.js` — handlers de UI (toggleCollapse, modais, botões inline)
3. Controller residual como orchestrator < 800L

### 6.2 kc-supabase.client.js

**Localização:** `assets/js/kc-supabase.client.js`  
**Linhas baseline:** ~1364L  
**Problema:** Auth UI + session management + realtime + storage helpers misturados

**Estratégia:**
1. Extrair `kc-supabase.auth.js` — signIn, signUp, signOut, resetPassword, changePassword
2. Extrair `kc-supabase.session.js` — getSession, refreshSession, onAuthStateChange, state mgmt
3. Residual: createClient, readEnv, export de contratos → < 700L

### 6.3 kc-core.js

**Localização:** `assets/js/kc-core.js`  
**Linhas baseline:** ~1221L  
**Problema:** PostModel + renderCard + coreUI misturados no mesmo arquivo

**Estratégia:**
1. Extrair `kc-post-model.js` — `window.KCPostModel` (estrutura e validação de posts)
2. Extrair `kc-render-card.js` — `window.KCRenderCard` (renderização de cards)
3. Residual: orquestração coreUI → < 700L

### 6.4 oportunidades.controller.js

**Localização:** `assets/js/controllers/oportunidades.controller.js`  
**Linhas baseline:** ~1246L  
**Problema:** Feed controller sem split — load + filter + render inline

**Estratégia:**
1. Extrair sub-módulos load + filter + render
2. Residual < 700L

---

## 7. VERSION.json — Formato alvo (v13.1.0)

```json
{
  "project": "Kino Campus",
  "appVersion": "13.0.0",
  "frontendRuntimeVersion": "8.6.0",
  "branch": "kinocampus-V11.0-foundations",
  "status": "v13 em execução",
  "updatedAt": "2026-04-25"
}
```

`frontendRuntimeVersion` (8.6.0) é a versão do runtime JS canônico — distinta da versão de produto (13.x).

---

## 8. Verificação por iteração

```bash
# Mínimo após CADA iteração:
npm test
node scripts/hygiene-check.js

# Após v13.2.1 (disponível):
npm run check:all

# Smoke manual após qualquer split:
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/
```

---

## 9. Gate V13 — Preenchido ao encerrar

> *A preencher em v13.8.0 (release gate)*

| Critério | Resultado |
|---|---|
| Jest suites | — |
| Jest testes | — |
| check:all | — |
| Hotspots residuais > 1100L | — |
| VERSION.json | — |
| Validators (4) | — |
| docs/audits/refactors/ | — |
| docs/releases/v12/ | — |
| CHANGELOG [13.0.0] | — |

---

*Documento atualizado a cada iteração do ciclo V13.*
