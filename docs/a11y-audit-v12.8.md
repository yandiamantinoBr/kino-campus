# Auditoria de Acessibilidade Estrutural — Trilha B3 (a11y) — v12.8.0

**Data:** 25 de abril de 2026
**Escopo:** 22 HTMLs canonicos do KinoCampus — auditoria estrutural estatica (sem browser)
**Referencia normativa:** WCAG 2.1 nivel AA
**Metodologia:** analise por grep/regex sobre os 22 arquivos HTML + inspecao manual de padroes estruturais
**Status:** docs-only; as correcoes serao aplicadas em `v12.8.1`

---

## 1. Contexto

A trilha B2 (v12.7.0–v12.7.3) cobriu todas as superficies declarativas de atributos de elemento:

| Superficie | Status |
|---|---|
| `lang="pt-BR"` no `<html>` | ✅ todos 22 HTMLs |
| `<main>` landmark | ✅ todos 22 HTMLs |
| `<header>` landmark | ✅ todos 22 HTMLs |
| `<title>` e meta description | ✅ B2 fase 1 |
| `alt` em imagens semanticas | ✅ B2 fase 1 (5 marcacoes) |
| `aria-label` em 189 elementos interativos | ✅ B2 fase 2 |
| `placeholder` i18n em 59 inputs | ✅ B2 fase 2 |
| `title` (tooltip) em 55 elementos | ✅ B2 fase 3 |
| `role` (tablist/tabpanel/dialog/alert/switch) | ✅ aplicados corretamente |

A trilha B3 audita o que a B2 nao cobriu: **estrutura de headings, skip links, landmarks de navegacao sem rotulos e associacoes de formulario incompletas**.

---

## 2. Resumo executivo dos problemas encontrados

| ID | Categoria | Gravidade | Paginas afetadas | WCAG |
|---|---|---|---|---|
| **A1** | Hierarquia de headings — h1 ausente | 🔴 Alto | 10 (feeds + settings + create-post + my-posts) | 1.3.1, 2.4.6 |
| **A2** | Hierarquia de headings — h1 multiplo | 🟡 Medio | 1 (index.html) | 1.3.1 |
| **A3** | Skip link ausente + `<main>` sem id | 🔴 Alto | 21 (todos exceto index.html) | 2.4.1 |
| **A4** | `<nav>` publico sem `aria-label` | 🟡 Medio | 17 paginas publicas | 1.3.6 |
| **A5** | Selects admin sem label | 🔴 Alto | admin/moderation.html (3 selects) | 1.3.1, 4.1.2 |
| **A6** | Botao icon-only com `title` mas sem `aria-label` | 🟡 Medio | index.html, admin/index.html (2 botoes) | 4.1.2 |
| **A7** | `<label>` sem `for` associado a toggle | 🟡 Medio | admin/banners.html (1 label) | 1.3.1 |

**Total de paginas com ao menos um problema:** 21 de 22 (auth-callback.html e ods.html estao OK estruturalmente).

---

## 3. Detalhamento dos problemas

### A1 — Hierarquia de headings: h1 ausente (10 paginas)

**Impacto:** usuarios de screen reader nao conseguem identificar o topico principal da pagina; a hierarquia parte do h2 sem contexto. WCAG SC 1.3.1 (Info and Relationships) e 2.4.6 (Headings and Labels).

**Paginas afetadas e primeiro heading encontrado:**

| Pagina | Primeiro heading | Observacao |
|---|---|---|
| `achados-perdidos.html` | `<h2>` (linha 91) | titulo do modulo em h2 |
| `caronas-feed.html` | `<h2>` (linha 92) | titulo do modulo em h2 |
| `compra-venda-feed.html` | `<h2>` (linha 92) | titulo do modulo em h2 |
| `create-post.html` | `<h2>` (linha 61) | heading do formulario em h2 |
| `eventos.html` | `<h2>` (linha 99) | titulo do modulo em h2 |
| `moradia.html` | `<h2>` (linha 94) | titulo do modulo em h2 |
| `my-posts.html` | `<h2>` (linha 64) | heading de secao em h2 |
| `oportunidades.html` | `<h2>` (linha 99) | titulo do modulo em h2 |
| `settings.html` | `<h2>` (linha 45) | heading de secao em h2 |
| `account-setup.html` | verificado: tem `<h1>` | ✅ OK |

**Correcao planejada (v12.8.1):**
Adicionar `<h1 class="kc-sr-only">` visualmente oculto logo apos `<main>`, com o texto do nome do modulo (reutilizando chaves `nav.*` ja existentes no dicionario pt-BR). O h1 nao sera visualmente renderizado mas estara disponivel para leitores de tela. A classe `kc-sr-only` sera criada em `assets/css/styles.css`.

Exemplo para `achados-perdidos.html`:
```html
<main class="kc-main-content" id="kc-main">
  <h1 class="kc-sr-only">Achados e Perdidos</h1>
  <!-- conteudo existente -->
```

---

### A2 — Hierarquia de headings: h1 multiplo (index.html)

**Impacto:** `index.html` tem 3 elementos `<h1>` dentro do carousel hero (linhas 94, 119, 141) representando titulos de banners promocionais. Um unico h1 e esperado por pagina como "topico principal"; multiplos h1 confundem a estrutura do documento. WCAG SC 1.3.1.

**Contexto:**
```html
<!-- slide 1 -->
<h1>Semana de Sustentabilidade UFG</h1>
<!-- slide 2 -->
<h1>Feira de Troca de Materiais</h1>
<!-- slide 3 -->
<h1>Lancamento do KinoCampus na UFG</h1>
```

**Correcao planejada (v12.8.1):** Rebaixar os 3 `<h1>` do carousel para `<h2>` (sao titulos de banners, nao o topico principal da pagina). A pagina receberá um `<h1 class="kc-sr-only">` proprio.

---

### A3 — Skip link ausente + `<main>` sem id (21 paginas)

**Impacto:** usuarios de teclado e screen reader precisam navegar por todo o header (logo, links de nav, busca, notificacoes, toggle de tema) antes de chegar ao conteudo principal. WCAG SC 2.4.1 (Bypass Blocks).

**Estado atual:**
- `index.html`: ✅ tem `<a href="#kc-main" class="kc-skip-link">Pular para o conteudo principal</a>` e `<main id="kc-main">`. O CSS `.kc-skip-link` ja existe em `assets/css/styles.css` (visualmente oculto, aparece no focus).
- 21 outras paginas: `<main class="kc-main-content">` sem `id`, sem skip link.

**Correcao planejada (v12.8.1):** Para cada uma das 21 paginas:
1. Adicionar `id="kc-main"` ao elemento `<main>`
2. Adicionar `<a href="#kc-main" class="kc-skip-link">Pular para o conteudo principal</a>` como primeiro elemento dentro de `<body>` (antes do `<header>`)

O CSS ja esta pronto — nenhuma mudanca de estilo necessaria.

---

### A4 — `<nav>` publico sem `aria-label` (17 paginas)

**Impacto:** quando uma pagina tem multiplos elementos `<nav>`, screen readers precisam de `aria-label` para distingui-los. Sem ele, o anuncio e apenas "navegacao" sem contexto. WCAG SC 1.3.6 (Identify Purpose).

**Estado atual:**
- 17 paginas publicas: `<nav class="kc-nav-links">` e `<nav class="kc-mobile-nav">` sem `aria-label`
- 5 paginas admin: nav principal ja tem `aria-label="Navegacao admin" data-i18n-aria-label="aria-label.admin-nav"` ✅; `kc-mobile-nav` nas admin ainda sem label

**Exemplo atual (incorreto):**
```html
<nav class="kc-nav-links">
<nav class="kc-mobile-nav">
```

**Correcao planejada (v12.8.1):** Adicionar `aria-label` e `data-i18n-aria-label` a ambos os nav em todas as paginas. Chaves a criar no dicionario (`aria-label.*`):
- `aria-label.nav-main` → "Navegacao principal"
- `aria-label.nav-mobile` → "Menu mobile"

---

### A5 — Selects de admin/moderation sem label (3 selects)

**Impacto:** 3 selects em `admin/moderation.html` sem `aria-label` nem `<label for="...">` sao invisiveis para screen readers — o usuario nao sabe o proposito do campo. WCAG SC 1.3.1, 4.1.2 (Name, Role, Value).

**Selects afetados:**

| id | Linha | Label esperada |
|---|---|---|
| `moderation-status-filter` | 121 | "Filtrar por status de moderacao" |
| `limit-global-module` | 163 | "Filtrar por modulo (limite global)" |
| `limit-user-module` | 185 | "Filtrar por modulo (limite por usuario)" |

**Selects ja com aria-label (OK):**
- `audit-entity-type-filter` — `aria-label="Filtrar por entidade"` ✅
- `audit-action-filter` — `aria-label="Filtrar por acao"` ✅
- `audit-page-size` — `aria-label="Registros por pagina"` ✅

**Correcao planejada (v12.8.1):** Adicionar `aria-label` + `data-i18n-aria-label` diretamente nos 3 selects. Chaves a criar:
- `aria-label.filter-mod-status` → "Filtrar por status de moderacao"
- `aria-label.filter-mod-global-module` → "Modulo (limite global)"
- `aria-label.filter-mod-user-module` → "Modulo (limite por usuario)"

---

### A6 — Botoes icon-only com `title` mas sem `aria-label` (2 botoes)

**Impacto:** botoes que conteem apenas `<i class="fas fa-circle-info">` precisam de nome acessivel. O atributo `title` e anunciado por alguns screen readers mas nao e confiavel por WCAG 4.1.2 como nome computado primario.

**Botoes afetados:**

| Arquivo | Linha | Classe | title atual |
|---|---|---|---|
| `index.html` | 181 | `kc-ranking-info-btn` | "Como funciona o ranking?" |
| `admin/index.html` | 859 | `kc-ranking-info-btn` | "Como funciona o ranking?" |

**Correcao planejada (v12.8.1):** Adicionar `aria-label="Como funciona o ranking?"` + `data-i18n-aria-label="aria-label.how-ranking-works"` aos 2 botoes. O valor ja existe na chave `tooltip.how-ranking-works` — criar alias no namespace `aria-label.*`.

---

### A7 — `<label>` sem `for` associado a toggle (admin/banners.html)

**Impacto:** `<label>Status</label>` (linha 488) nao esta associado ao controle correspondente (`<div id="f-active-toggle" role="switch">`). Screen readers nao conseguem associar o rotulo ao controle. WCAG SC 1.3.1.

**Markup atual:**
```html
<label>Status</label>
<div class="kc-toggle-wrap">
  <div class="kc-toggle on" id="f-active-toggle" role="switch" aria-checked="true" tabindex="0"></div>
  <span id="f-active-label">Ativo</span>
</div>
```

**Correcao planejada (v12.8.1):** 
1. Adicionar `for="f-active-toggle"` ao label
2. O elemento `role="switch"` precisaria de `id` correspondente — ja tem `id="f-active-toggle"` ✅

---

## 4. Estado OK (sem correcao necessaria)

| Aspecto | Verificacao | Resultado |
|---|---|---|
| `lang="pt-BR"` | todos 22 HTMLs | ✅ |
| `<main>` presente | todos 22 HTMLs | ✅ |
| `<header>` presente | todos 22 HTMLs | ✅ |
| nav admin com aria-label | 5 paginas admin (nav principal) | ✅ |
| `role="tablist/tab/tabpanel"` | index.html, profile.html | ✅ correto |
| `role="dialog"` | index.html, admin/index.html | ✅ correto |
| `role="alert"` | profile.html, admin/index.html | ✅ correto |
| `role="switch"` | admin/banners.html | ✅ presente (label sem for — A7) |
| `tabindex` positivo | apenas admin/banners.html (tabindex=1) | ✅ aceitavel |
| focus-visible CSS | styles.css, product.css | ✅ skip-link + principais interativos |
| `alt=""` decorativo | imagens decorativas | ✅ correto |
| `alt` semantico | 5 imagens com data-i18n-alt | ✅ B2 |
| `aria-label` em interativos | 189 marcacoes | ✅ B2 |
| `<footer>` ausente | todos 22 HTMLs | ℹ️ ausencia intencional (app sem rodape) |

---

## 5. Plano de correcoes — v12.8.1

### Escopo tecnico

| Correcao | Arquivos tocados | Tipo |
|---|---|---|
| Classe `kc-sr-only` | `assets/css/styles.css` | CSS novo (+4L) |
| `<h1 class="kc-sr-only">` em 9 paginas | 9 HTMLs publicos | HTML |
| Rebaixar 3x `<h1>` → `<h2>` em carousel | `index.html` | HTML |
| `<h1 class="kc-sr-only">` em index.html | `index.html` | HTML |
| `id="kc-main"` + skip link em 21 paginas | 21 HTMLs | HTML |
| `aria-label` + `data-i18n-aria-label` nos 2 nav publicos | 17 HTMLs publicos | HTML |
| `aria-label` + `data-i18n-aria-label` no kc-mobile-nav admin | 5 HTMLs admin | HTML |
| 3 chaves novas `aria-label.*` (nav-main, nav-mobile) | `assets/js/kc-i18n.js` | JS (+2 chaves) |
| `aria-label` nos 3 selects de moderation | `admin/moderation.html` | HTML |
| 3 chaves novas `aria-label.*` (filter-mod-*) | `assets/js/kc-i18n.js` | JS (+3 chaves) |
| `aria-label` nos 2 botoes kc-ranking-info-btn | `index.html`, `admin/index.html` | HTML |
| 1 chave nova `aria-label.how-ranking-works` | `assets/js/kc-i18n.js` | JS (+1 chave) |
| `for="f-active-toggle"` no label Status | `admin/banners.html` | HTML |

### Chaves novas no dicionario kc-i18n.js (v12.8.1)

| Chave | Valor pt-BR |
|---|---|
| `aria-label.nav-main` | Navegacao principal |
| `aria-label.nav-mobile` | Menu mobile |
| `aria-label.filter-mod-status` | Filtrar por status de moderacao |
| `aria-label.filter-mod-global-module` | Modulo — limite global |
| `aria-label.filter-mod-user-module` | Modulo — limite por usuario |
| `aria-label.how-ranking-works` | Como funciona o ranking? |

Total: **6 chaves novas** → dicionario passa de `440` → `446` chaves.

### Suites de teste — v12.8.1

Criar `tests/a11y.test.js` cobrindo os 22 HTMLs com pelo menos 5 asserts por pagina:

1. `lang="pt-BR"` no `<html>` (ja coberto indiretamente, formalizar)
2. `<main id="kc-main">` presente (novo)
3. `<a href="#kc-main" class="kc-skip-link">` presente (novo)
4. `<h1>` exatamente um por pagina (novo)
5. todos os `<nav>` tem `aria-label` (novo)
6. todos os `<select>` tem `aria-label` ou `<label for="">` (novo)
7. nenhum `<button>` sem nome acessivel (aria-label, texto ou title — novo)

**Total estimado:** ~14 testes na suite (2 describe blocks: estrutura geral + formularios)

---

## 6. Gates propostos para v12.8.x (hygiene-check.js)

A adicionar em `runA11yStructureChecks()`:

| Gate | Piso | Finalidade |
|---|---|---|
| h1 por pagina | exatamente 1 em cada HTML | previne remocao do h1 e duplicacao |
| skip link por pagina | 1 em cada HTML | previne remocao do link de pular |
| `<main id="kc-main">` | 1 em cada HTML | garante alvo do skip link |
| nav com aria-label | todos nav tem atributo | previne nav sem rotulo |

---

## 7. Proximas etapas

1. **v12.8.1** — aplicar todas as 7 correcoes (A1–A7), criar `tests/a11y.test.js` e `runA11yStructureChecks()` no hygiene
2. **v12.9.x** — trilha B4 (Playwright E2E scaffold)
3. **Pos-B4** — locale switcher pt-BR/en-US com rede de seguranca visual
