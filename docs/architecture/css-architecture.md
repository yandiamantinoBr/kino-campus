# Arquitetura CSS — KinoCampus

**Versão:** v16.10.0 · **Atualizado em:** 2026-04-27

> Documenta os 5 arquivos CSS de produção, quais páginas cada um serve,
> os 5 stubs `future-split/` e as convenções de desenvolvimento.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Arquivos de produção — 5 arquivos](#2-arquivos-de-produção--5-arquivos)
3. [CSS por página](#3-css-por-página)
4. [Convenções CSS](#4-convenções-css)
5. [future-split/ — 5 stubs](#5-future-split--5-stubs)
6. [Regras para modificar CSS](#6-regras-para-modificar-css)

---

## 1. Visão geral

O CSS do KinoCampus é **Vanilla CSS — sem preprocessador, sem CSS-in-JS, sem framework de UI**. Todo estilo de produção está em 5 arquivos carregados via `<link rel="stylesheet">` nos HTMLs canônicos.

```
assets/css/
├── styles.css           ← 10.582 linhas — CSS principal (17 páginas públicas)
├── kc-theme-boot.css    ←    213 linhas — prevenção de flash de tema (22 páginas)
├── kc-public-shell.css  ←    943 linhas — shell de páginas com autenticação (5 páginas)
├── admin-shell.css      ←  1.011 linhas — shell das 5 páginas admin
├── product.css          ←  1.752 linhas — página de detalhe de produto (1 página)
└── future-split/                          — 5 stubs NÃO carregados em produção
    ├── 00-tokens.css    ←     23 linhas — placeholder: design tokens
    ├── 01-base.css      ←     25 linhas — placeholder: reset e tipografia
    ├── 02-layout.css    ←     28 linhas — placeholder: grid e layout
    ├── 03-components.css ←    30 linhas — placeholder: componentes
    └── 04-pages.css     ←     29 linhas — placeholder: overrides de página
```

**Total em produção:** ~14.501 linhas · 5 arquivos

---

## 2. Arquivos de produção — 5 arquivos

### `styles.css` — 10.582 linhas

**Escopo:** CSS principal da plataforma. Carregado em todas as 17 páginas públicas.

**Conteúdo:**
- **Design tokens** — variáveis CSS em `:root`:
  - Cores: `--kc-primary-brand: #FF6B00`, `--kc-secondary-brand: #41B5D3`, `--kc-tertiary-color: #70E291`
  - Fundo/superfície: `--kc-background-dark`, `--kc-surface-dark`, `--kc-surface-dark-hover`
  - Texto: `--kc-text-dark-primary`, `--kc-text-dark-secondary`
  - Status: `--kc-red-alert: #FF5252`, `--kc-yellow-badge: #FFD700`, `--kc-green-check: #70E291`
- **Tema claro** — override via `[data-theme="light"]` nos tokens de cor
- **Componentes de layout** — header, nav, footer, grid responsivo
- **Componentes de UI** — cards de post, botões, inputs, modais, popovers, badges, toasts
- **Módulos específicos** — feed, search, carousel, ranking, create-post modal
- **Utilitários** — `kc-sr-only`, `kc-skip-link`, animações, z-index layers
- **Responsivo** — `@media` queries para mobile (≤420px, ≤768px) e desktop (≥1024px)

```css
/* Exemplo de token em styles.css */
:root {
  --kc-primary-brand: #FF6B00;
  --kc-background-dark: #222222;
  --kc-surface-dark: #333333;
}

[data-theme="light"] {
  --kc-background-dark: #f5f5f5;
  --kc-surface-dark: #ffffff;
}
```

---

### `kc-theme-boot.css` — 213 linhas

**Escopo:** Prevenção de flash de tema e CLS (Cumulative Layout Shift). Carregado em **todos os 22 HTMLs** — é o primeiro arquivo CSS carregado.

**Conteúdo:**
- `.kc-theme-preload *` — desativa transições CSS durante aplicação inicial do tema
- `html.kc-loading .kc-user-actions` — oculta áreas do usuário enquanto JS inicializa
- `html.kc-loading .kc-hero-carousel` — oculta o carousel para evitar flash do banner estático
- `html.kc-loading .kc-feed-list` — reserva espaço do feed para evitar layout shift
- Transições suaves na revelação pós-carregamento

**Por que é carregado em todos os 22 HTMLs:** o mecanismo de prevenção de flash precisa estar ativo antes de qualquer renderização, inclusive em páginas admin.

---

### `kc-public-shell.css` — 943 linhas

**Escopo:** Shell de páginas que requerem autenticação ou têm estrutura específica de perfil/configurações. Carregado em 5 páginas públicas.

**Conteúdo:**
- Layout e componentes específicos do shell público autenticado
- Estrutura de página de perfil (avatar, bio, tabs de conteúdo)
- Estrutura de página de configurações (formulários de conta)
- Setup de conta (wizard de configuração inicial)
- Layout da página de ajuda

**Páginas:** `auth-callback.html`, `ajuda.html`, `account-setup.html`, `profile.html`, `settings.html`

---

### `admin-shell.css` — 1.011 linhas

**Escopo:** Shell exclusivo das 5 páginas administrativas. Carregado via prefixo `../` (path relativo de `admin/`).

**Conteúdo:**
- Layout do painel admin (sidebar, header admin, áreas de conteúdo)
- Componentes de moderação (tabelas de posts, filtros de status)
- Componentes de banners admin (editor de banner, preview)
- Componentes de relatórios e denúncias
- Componentes do dashboard (cards de métricas, gráficos SVG, audit log)

**Páginas:** `admin/index.html`, `admin/moderation.html`, `admin/banners.html`, `admin/reports.html`, `admin/help-requests.html`

---

### `product.css` — 1.752 linhas

**Escopo:** CSS exclusivo da página de detalhe de produto/publicação. Carregado apenas em `_product.html`.

**Conteúdo:**
- Layout de detalhe de produto (imagens, informações, sidebar)
- Galeria de imagens e lightbox
- Popovers de share, save, report
- Seção de comentários e editor rich-text
- Painel de analytics do autor
- Seção de posts relacionados
- Componente de avaliação (estrelas, modal de rating)
- Componente de calendário de eventos

---

## 3. CSS por página

### Páginas públicas (17 páginas)

| Página | styles.css | kc-theme-boot.css | kc-public-shell.css | product.css |
|--------|:----------:|:-----------------:|:-------------------:|:-----------:|
| `index.html` | ✅ | ✅ | — | — |
| `_product.html` | ✅ | ✅ | — | ✅ |
| `compra-venda-feed.html` | ✅ | ✅ | — | — |
| `caronas-feed.html` | ✅ | ✅ | — | — |
| `moradia.html` | ✅ | ✅ | — | — |
| `eventos.html` | ✅ | ✅ | — | — |
| `oportunidades.html` | ✅ | ✅ | — | — |
| `achados-perdidos.html` | ✅ | ✅ | — | — |
| `ods.html` | ✅ | ✅ | — | — |
| `busca.html` | ✅ | ✅ | — | — |
| `my-posts.html` | ✅ | ✅ | — | — |
| `create-post.html` | ✅ | ✅ | — | — |
| `login.html` | ✅ | ✅ | — | — |
| `profile.html` | ✅ | ✅ | ✅ | — |
| `settings.html` | ✅ | ✅ | ✅ | — |
| `account-setup.html` | ✅ | ✅ | ✅ | — |
| `ajuda.html` | ✅ | ✅ | ✅ | — |
| `auth-callback.html` | ✅ | ✅ | ✅ | — |

### Páginas admin (5 páginas)

| Página | admin-shell.css | kc-theme-boot.css |
|--------|:---------------:|:-----------------:|
| `admin/index.html` | ✅ | ✅ (via `../`) |
| `admin/moderation.html` | ✅ | ✅ (via `../`) |
| `admin/banners.html` | ✅ | ✅ (via `../`) |
| `admin/reports.html` | ✅ | ✅ (via `../`) |
| `admin/help-requests.html` | ✅ | ✅ (via `../`) |

> **Nota:** Páginas admin não carregam `styles.css` — usam `admin-shell.css` como único CSS de conteúdo.

### Tag de carregamento no HTML

```html
<!-- Páginas públicas (raiz) -->
<link rel="stylesheet" href="assets/css/kc-theme-boot.css?v=8.6.0" />
<link rel="stylesheet" href="assets/css/styles.css?v=8.6.0" />

<!-- Páginas com public shell -->
<link rel="stylesheet" href="assets/css/kc-theme-boot.css?v=8.6.0" />
<link rel="stylesheet" href="assets/css/styles.css?v=8.6.0" />
<link rel="stylesheet" href="assets/css/kc-public-shell.css?v=8.6.0" />

<!-- Página de produto -->
<link rel="stylesheet" href="assets/css/kc-theme-boot.css?v=8.6.0" />
<link rel="stylesheet" href="assets/css/styles.css?v=8.6.0" />
<link rel="stylesheet" href="assets/css/product.css?v=8.6.0" />

<!-- Páginas admin (path relativo com ../) -->
<link rel="stylesheet" href="../assets/css/kc-theme-boot.css?v=8.6.0" />
<link rel="stylesheet" href="../assets/css/admin-shell.css?v=8.6.0" />
```

---

## 4. Convenções CSS

### Nomenclatura de classes

| Prefixo | Uso | Exemplos |
|---------|-----|---------|
| `kc-` | Componentes e utilitários do projeto | `.kc-card`, `.kc-btn`, `.kc-feed-list` |
| `kc-sr-only` | Elementos visualmente ocultos mas acessíveis | `.kc-sr-only { position: absolute; ... }` |
| `kc-skip-link` | Link de acessibilidade "pular para conteúdo" | `.kc-skip-link:focus { ... }` |
| `kc-loading` | Classe temporária no `<html>` durante init | `html.kc-loading .kc-hero-carousel { ... }` |
| `kc-theme-preload` | Desativa transições durante aplicação de tema | `.kc-theme-preload * { transition: none !important; }` |

### Variáveis CSS (Design Tokens)

Todas as cores e valores reutilizáveis são declarados como variáveis CSS em `:root` de `styles.css`:

```css
/* ✅ CORRETO — usar variável */
.meu-componente {
  background-color: var(--kc-surface-dark);
  color: var(--kc-text-dark-primary);
  border: 1px solid var(--kc-border-dark);
}

/* ❌ PROIBIDO — valor hardcoded sem variável */
.meu-componente {
  background-color: #333333;
  color: #E9EAED;
}
```

### Temas (data-theme)

O tema claro/escuro é controlado pelo atributo `data-theme` no elemento `<html>`:

```css
/* Modo escuro (padrão) — sem atributo ou data-theme="dark" */
:root {
  --kc-background-dark: #222222;
}

/* Modo claro — data-theme="light" no <html> */
[data-theme="light"] {
  --kc-background-dark: #f5f5f5;
}
```

O atributo é alternado por `kc-theme.js` (`window.KCTheme`) via `localStorage`.

### Responsividade

```css
/* Mobile first — breakpoints usados no projeto */
@media (max-width: 420px) { /* smartphones menores */ }
@media (max-width: 768px) { /* tablets e smartphones */ }
@media (min-width: 1024px) { /* desktop */ }
```

### Acessibilidade obrigatória

```css
/* .kc-sr-only — visualmente oculto mas lido por screen readers */
.kc-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* .kc-skip-link — aparece ao receber foco via Tab */
.kc-skip-link {
  position: absolute;
  top: -40px;
  /* ... */
}
.kc-skip-link:focus {
  top: 0;
}
```

---

## 5. future-split/ — 5 stubs

### O que são

Os arquivos em `assets/css/future-split/` são **placeholders documentais** criados na V14, descrevendo uma futura refatoração do `styles.css` monolítico em 5 arquivos separados por responsabilidade.

**Status atual:** nenhum desses arquivos é carregado em produção. São stubs com ~23–30 linhas cada, contendo apenas comentários que descrevem o escopo planejado.

| Stub | Escopo planejado |
|------|-----------------|
| `00-tokens.css` | Design tokens globais: `:root { ... }`, `[data-theme]` overrides |
| `01-base.css` | Reset CSS, tipografia base, `html`, `body`, links |
| `02-layout.css` | Grid, containers, header, nav, footer, responsivo |
| `03-components.css` | Cards, botões, inputs, modais, popovers, badges, toasts |
| `04-pages.css` | Overrides específicos de página (feed, product, profile) |

### Por que existem

A motivação é separar o monolítico `styles.css` (10.582 linhas) em módulos menores para:
- Facilitar manutenção e localização de estilos
- Habilitar loading crítico seletivo (ex: carregar apenas tokens + base nas páginas simples)
- Alinhar a estrutura CSS com a estrutura JS modular

### Pré-requisitos para executar o split

O split de `styles.css` em `future-split/` **não foi executado** porque requer:
1. Auditoria completa de todos os seletores para identificar onde cada regra pertence
2. Teste visual em todas as 22 páginas (sem E2E visual automatizado atualmente)
3. Atualização dos `<link>` em todos os 22 HTMLs
4. Atualização do `check:routes` e `check:structure` para os novos arquivos
5. Aprovação explícita — é uma mudança de alto risco

**Até que os pré-requisitos sejam atendidos, os stubs devem ser preservados intactos.**

---

## 6. Regras para modificar CSS

### Onde adicionar novos estilos

| Tipo de estilo | Onde adicionar |
|---------------|---------------|
| Novo componente de UI geral | `styles.css` — seção de componentes correspondente |
| Novo componente exclusivo de admin | `admin-shell.css` |
| Novo componente exclusivo de produto | `product.css` |
| Novo componente do shell público autenticado | `kc-public-shell.css` |
| Nova variável CSS (token) | `styles.css` — seção `:root` |
| Override de tema claro | `styles.css` — seção `[data-theme="light"]` |

### O que nunca fazer com CSS

```
❌ Alterar arquivos em assets/css/future-split/
   → São stubs documentais, não devem receber implementação parcial

❌ Adicionar estilos inline via style="" nos HTMLs
   → Viola separação de responsabilidades; difícil manutenção

❌ Criar um 6º arquivo CSS de produção sem aprovação explícita
   → O padrão de carregamento (check:routes) precisaria ser atualizado

❌ Usar !important exceto em casos de override de terceiros documentados
   → Torna a cascata imprevisível

❌ Hardcodar valores de cor sem usar variável CSS
   → Quebra o suporte a temas
```

### Versionamento de CSS

Todos os arquivos CSS são servidos com cache-busting via query string:

```html
<link rel="stylesheet" href="assets/css/styles.css?v=8.6.0" />
```

O valor `8.6.0` corresponde ao `frontendRuntimeVersion` constante (nunca alterar). A invalidação de cache em produção é feita pelo Vercel automaticamente a cada deploy.
