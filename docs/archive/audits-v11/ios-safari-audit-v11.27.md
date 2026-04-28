# Auditoria iOS/Safari — v11.27.0

> **Data:** 12 de abril de 2026  
> **Escopo:** CSS (`styles.css`, `kc-public-shell.css`, `admin-shell.css`) + JS (controllers, kc-auth.ui.js, kc-core.js)  
> **Método:** análise estática de código-fonte sem dispositivo físico; padrões validados contra documentação do WebKit/MDN e histório de bugs iOS Safari conhecidos.

---

## 1. Resumo executivo

Foram identificadas **6 issues** com impacto real em iOS/Safari: 3 de alta severidade (bugs funcionais ou regressões visuais garantidas) e 3 de média/baixa severidade (impacto limitado ou dependente da versão do Safari).

| # | Arquivo | Linha(s) | Severidade | Categoria | Descrição curta |
|---|---------|-----------|-----------|-----------|-----------------|
| A1 | `styles.css` | `656` | 🔴 ALTA | prefixo CSS | `.kc-hero-pill` sem `-webkit-backdrop-filter` |
| A2 | `styles.css` | `3519` | 🔴 ALTA | zoom iOS | `.kc-search-bar input` com `font-size: 12px` no mobile |
| A3 | `eventos.controller.js` | `670, 680` | 🔴 ALTA | scroll lock | scroll lock incompleto ao abrir modal do calendário |
| B4 | `kc-public-shell.css` | `126` | 🟡 MÉDIA | prefixo CSS | `backdrop-filter: none` sem webkit prefix |
| B5 | `admin-shell.css` | `231, 334` | 🟡 MÉDIA | viewport height | `max-height: 100vh` nos modais admin sem fallback `dvh` |
| C6 | `kc-public-shell.css` | `2` | 🟢 BAIXA | viewport height | `min-height: 100vh` no body raiz sem fallback `dvh` |

Issues **fora de escopo desta iteração** (baixo risco em Safari moderno 2026):
- `gap` em flex (290 ocorrências) — suportado Safari ≥ 14.1
- `position: sticky` (16 ocorrências) — suportado Safari ≥ 13
- `aspect-ratio` (3 ocorrências) — suportado Safari ≥ 15; fallback de `padding-bottom` pode ser adicionado futuramente

---

## 2. Issues detalhados

### A1 — `backdrop-filter` sem prefixo webkit no `.kc-hero-pill`

**Arquivo:** `assets/css/styles.css`  
**Linha:** `656`

**Código atual:**
```css
.kc-hero-pill {
    /* ... */
    backdrop-filter: blur(10px);   /* ← sem -webkit-backdrop-filter */
    margin-bottom: 14px;
}
```

**Impacto:** Em iOS/Safari < 15.4, `backdrop-filter` sem o prefixo `-webkit-` é ignorado. A pílula "Destaque"/"Novidade" no carrossel hero fica sem o blur de fundo — visualmente quebrada (fundo transparente sem efeito). A partir de Safari 15.4 (iOS 15.4, março 2022) o prefixo não é mais necessário, mas como o projeto suporta iOS 14+, o prefixo deve estar presente.

**Comparação com outros locais:** Todas as outras ocorrências de `backdrop-filter` no arquivo têm o par `-webkit-backdrop-filter` (linhas 343-344, 743-744, 4091-4092, 4157-4158, 6268-6269, 9820-9821). A linha 656 é a única com o prefixo ausente.

**Fix:** adicionar `-webkit-backdrop-filter: blur(10px)` imediatamente antes ou depois de `backdrop-filter: blur(10px)` na linha 656.

---

### A2 — `font-size: 12px` no input de busca (mobile)

**Arquivo:** `assets/css/styles.css`  
**Linha:** `3519`  
**Breakpoint:** `@media (max-width: 420px)` (smartphones pequenos)

**Código atual:**
```css
@media (max-width: 420px) {
    .kc-search-bar input {
        padding: 6px 8px;
        font-size: 12px;   /* ← abaixo do limite iOS */
    }
}
```

**Impacto:** iOS Safari aplica zoom automático em qualquer `<input>`, `<textarea>` ou `<select>` com `font-size < 16px` no momento do foco. O resultado é que ao tocar no campo de busca, a página inteira faz zoom — comportamento não intencional e que confunde o usuário. O elemento pai (`.kc-search-bar`) tem `overflow: hidden`, o que pode fazer o zoom ficar parcialmente preso.

O `.kc-field input` (formulários de post, create-post, etc.) já tem `font-size: 1rem` com o comentário `/* ≥16px: previne zoom automático no iOS Safari */`. O `.kc-auth-field input` também tem `font-size: 1rem`. O search bar é o único input que ainda usa tamanho < 16px.

**Fix:** mudar `font-size: 12px` para `font-size: 1rem` (16px) no breakpoint 420px. Para manter a aparência compacta no mobile, compensar visualmente com padding reduzido (já está em `6px 8px`).

---

### A3 — Scroll lock incompleto no modal do calendário (`eventos.controller.js`)

**Arquivo:** `assets/js/controllers/eventos.controller.js`  
**Linhas:** `670` (open), `680` (close)

**Código atual:**
```js
function openCalModal() {
    /* ... */
    document.documentElement.classList.add('kc-scroll-locked');   // ← só html, não body
    /* ... */
}

function closeCalModal() {
    /* ... */
    document.documentElement.classList.remove('kc-scroll-locked'); // ← não restaura scrollY
}
```

**CSS correspondente:**
```css
html.kc-scroll-locked,
html.kc-scroll-locked body {
    overscroll-behavior: none;           /* ← aplicado — OK */
}

body.kc-scroll-locked {
    position: fixed;                     /* ← NÃO aplicado: class está em html, não em body */
    left: 0; right: 0; width: 100%;
    overflow-y: scroll;
}
```

**Impacto:**
1. `body { position: fixed }` não é aplicado porque `kc-scroll-locked` está em `<html>`, não em `<body>` — a página continua rolável atrás do modal no iOS.
2. Não há salvamento/restauração de `scrollY` — ao fechar o modal, a página rola para o topo (comportamento padrão de `position: fixed` sem `body.style.top`).
3. `overscroll-behavior: none` é aplicado corretamente via `html.kc-scroll-locked`, mas é insuficiente para impedir scroll em iOS.

**Comparação:** `kc-auth.ui.js` (que define `window.KCOverlayLock`) implementa corretamente: salva `scrollY`, seta `body.style.top = -scrollY + 'px'`, adiciona a classe em `document.documentElement` **e** `document.body`, restaura ao fechar.

**Fix:** substituir as duas chamadas diretas de classList por `window.KCOverlayLock.lock('eventos-cal-modal')` e `window.KCOverlayLock.unlock('eventos-cal-modal')` — garantindo que o guard de dependência `if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function')` também seja aplicado.

---

### B4 — `backdrop-filter: none` sem prefixo webkit no reset de account-setup

**Arquivo:** `assets/css/kc-public-shell.css`  
**Linha:** `126`

**Código atual:**
```css
body.kc-account-setup-page .kc-account-panel,
body.kc-account-setup-page .kc-account-preview {
    backdrop-filter: none;  /* ← sem -webkit-backdrop-filter: none */
}
```

**Impacto:** Em Safari < 15.4, o reset `backdrop-filter: none` não é reconhecido sem o prefixo webkit — o efeito de blur herdado de `.kc-account-panel` (se existir) não seria cancelado. Impacto menor pois é um reset de estado; o painel funcionaria corretamente na maioria dos casos. Mas viola a convenção de paridade de prefixo.

**Fix:** adicionar `-webkit-backdrop-filter: none` na mesma regra.

---

### B5 — `max-height: 100vh` nos modais admin sem `dvh`

**Arquivo:** `assets/css/admin-shell.css`  
**Linhas:** `231`, `334`

**Código atual:**
```css
.kc-admin-modal-content {
    max-height: calc(100vh - var(--kc-admin-modal-viewport-gap) - env(safe-area-inset-bottom, 0px));
}
/* e similar para chart modal */
```

**Impacto:** Em iOS Safari, a barra de endereço oculta/reaparece dinamicamente. `100vh` mede a altura com a barra visível — ao ocultar a barra, o modal pode ficar com `max-height` menor que o viewport real, deixando espaço em branco abaixo. `100dvh` (dynamic viewport height) mede a altura atual real. O painel admin é usado em modo desktop/tablet principalmente, então o impacto é menor, mas em iPads com Safari o problema pode ocorrer.

**Fix:** adicionar linha com `100dvh` como override moderno logo após cada linha com `100vh`:
```css
max-height: calc(100vh - ...);
max-height: calc(100dvh - ...);  /* dvh: iOS Safari barra dinâmica */
```

---

### C6 — `min-height: 100vh` no body raiz

**Arquivo:** `assets/css/kc-public-shell.css`  
**Linha:** `2`

**Código atual:**
```css
body.kc-shell-page {
    min-height: 100vh;
    /* ... */
}
```

**Impacto:** `min-height: 100vh` com `100vh` fixo pode causar pequeno overflow na direção vertical em iOS quando a barra de endereços está visível (o viewport real é menor que `100vh`). O impacto é mínimo porque é `min-height` (o conteúdo expande o body de qualquer forma), mas pode criar um espaço extra ao fundo em páginas com pouco conteúdo.

**Fix (opcional):** adicionar fallback:
```css
body.kc-shell-page {
    min-height: 100vh;
    min-height: 100dvh;  /* dvh: iOS Safari barra dinâmica */
}
```

---

## 3. Plano de correções

| Iteração | Issues | Arquivos | Tipo |
|----------|--------|----------|------|
| v11.27.1 | A1, A2, B4 | `styles.css`, `kc-public-shell.css` | CSS fix (prefixo + font-size) |
| v11.27.2 | A3 | `eventos.controller.js` | JS fix (scroll lock via KCOverlayLock) |
| v11.27.3 | B5, C6 | `admin-shell.css`, `kc-public-shell.css` | CSS fix (100dvh fallbacks) |

Todas as iterações: testes de regressão devem passar (59/59 suites, 706/706 testes), hygiene `8.6.0`.

---

## 4. Issues descartados / sem ação

| Padrão | Ocorrências | Motivo do descarte |
|--------|-------------|-------------------|
| `gap` em flex | 290 | Suportado Safari ≥ 14.1 (iOS 14.5+, abril 2021) — base de usuários irrelevante em 2026 |
| `position: sticky` sem `-webkit-` | 16 | Suportado Safari ≥ 13 (2019) — prefixo obsoleto |
| `aspect-ratio` | 3 | Suportado Safari ≥ 15 (2021) — fallback `padding-bottom` pode ser adicionado em v11.28+ se necessário |
| `IntersectionObserver` | 2 | Suportado Safari ≥ 12.1; `kc-lazy-loader.js` já tem guard `if (!('IntersectionObserver' in window))` |
| `requestAnimationFrame` | 10+ | Vários IIFEs já têm fallback `window.requestAnimationFrame || function(cb){setTimeout(cb,16)}` |
