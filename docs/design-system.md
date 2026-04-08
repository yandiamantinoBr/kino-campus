# KinoCampus — Design System

## CSS Custom Properties

Definidas em `assets/css/styles.css` no seletor `html[data-theme="dark"]` (modo escuro padrão):

### Cores Primárias
```css
--kc-primary-brand: #ff6b00;
--kc-primary-brand-light: #ff8c00;
--kc-primary-brand-subtle: rgba(255, 107, 0, 0.12);
--kc-primary-brand-glow: rgba(255, 107, 0, 0.25);
```

### Superfícies (Dark Mode)
```css
--kc-bg-dark: #0f0f13;          /* fundo da página */
--kc-surface-dark: #1a1a22;     /* cards, modais */
--kc-surface-dark-2: #242430;   /* elementos elevados */
--kc-surface-dark-3: #2e2e3d;   /* hover states */
--kc-border-dark: rgba(255, 255, 255, 0.08);
--kc-border-dark-strong: rgba(255, 255, 255, 0.14);
```

### Texto (Dark Mode)
```css
--kc-text-dark-primary: rgba(255, 255, 255, 0.92);
--kc-text-dark-secondary: rgba(255, 255, 255, 0.60);
--kc-text-dark-tertiary: rgba(255, 255, 255, 0.38);
```

### Status
```css
--kc-success: #22c55e;
--kc-warning: #f59e0b;
--kc-error: #ef4444;
--kc-info: #3b82f6;
```

### Módulos (usadas em banners e OG images)
```css
/* Compra-Venda */  #a855f7 (roxo)
/* Caronas */       #3b82f6 (azul)
/* Moradia */       #10b981 (verde)
/* Eventos */       #ff6b00 (laranja — brand)
/* Oportunidades */ #f59e0b (âmbar)
/* Achados */       #ef4444 (vermelho)
```

---

## Componentes CSS

### Botões

```css
/* Primário — laranja sólido */
.kc-btn-primary { background: var(--kc-primary-brand); color: #fff; }

/* Secundário — borda */
.kc-btn-secondary { border: 1px solid var(--kc-border-dark-strong); }

/* Destrutivo */
.kc-btn-danger { background: var(--kc-error); color: #fff; }
```

### Cards

```css
.kc-card {
  background: var(--kc-surface-dark);
  border: 1px solid var(--kc-border-dark);
  border-radius: 12px;
}
.kc-card__header { padding: 16px; border-bottom: 1px solid var(--kc-border-dark); }
.kc-card__body   { padding: 16px; }
.kc-card__footer { padding: 12px 16px; border-top: 1px solid var(--kc-border-dark); }
```

### Popovers (padrão reutilizável)

```css
/* Wrapper relativo + botão trigger */
.kc-save-wrap { position: relative; }

/* Desktop: o JS calcula posição final para evitar clipping dentro de cards */
.kc-save-popover {
  position: fixed;
  background: var(--kc-surface-dark-2);
  border: 1px solid var(--kc-border-dark-strong);
  border-radius: 12px; min-width: 180px;
  display: none;
  z-index: 1200;
}
.kc-save-popover.active { display: block; }

/* Mobile — bottom sheet */
@media (max-width: 767px) {
  .kc-save-popover { position: fixed; bottom: 0; left: 0; right: 0; border-radius: 16px 16px 0 0; }
}
```

**Regras atuais:**
- no desktop, `Salvar`, `Compartilhar` e popovers equivalentes não devem depender de `overflow` do card pai
- a classe de abertura usada hoje é `.active`
- o posicionamento visual deve ser recalculado em `resize` e `scroll` quando o controller já fizer ancoragem programática
- qualquer novo popover equivalente deve ser validado em desktop e mobile para evitar clipping e sobreposição indevida

### Chips (kc-chip-row)

Usado apenas no `kc-create-modal` para seleção de categorias/tipos:

```css
.kc-chip-row {
  display: flex;
  flex-wrap: wrap;   /* wrap por padrão — chips quebram linha no mobile */
  gap: 8px;
}
.kc-chip {
  white-space: nowrap;      /* previne quebra de texto dentro do chip */
  padding: 8px 14px;
  border-radius: 20px;
  cursor: pointer;
}
.kc-chip.active {
  background: var(--kc-primary-brand);
  color: #fff;
}
```

**Atenção:** NÃO usar `flex-wrap: nowrap` em `.kc-chip-row` — causa chips cortados no mobile.

### Modal

```css
.kc-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.kc-modal-content {
  background: var(--kc-surface-dark);
  border-radius: 16px;
  max-width: 560px; width: 90%;
  max-height: 90vh; overflow-y: auto;
}
```

### Ranking Badge

```css
.kc-rank-badge {
  display: inline-flex; align-items: center; gap: 3px;
  background: var(--kc-primary-brand-subtle);
  color: var(--kc-primary-brand);
  border-radius: 20px; padding: 2px 8px;
  font-size: 0.78rem; font-weight: 700;
}
```

---

## Breakpoints

```css
/* Small mobile */ @media (max-width: 479px) { ... }
/* Mobile */       @media (max-width: 767px) { ... }
/* Tablet */       @media (min-width: 768px) and (max-width: 1023px) { ... }
/* Desktop */      @media (min-width: 1024px) { ... }
```

**Regra atual da v10/v11:**
- admin usa a convenção consolidada `desktop >= 1024`, `tablet 768-1023`, `mobile < 768`, `small mobile < 480`
- componentes novos devem funcionar em `375px` sem scroll horizontal
- quando houver tabela responsiva, preferir `data-label` real em vez de `nth-child`

---

## Navegação Mobile (Bottom Nav)

Presente em todas as páginas via HTML direto:

```html
<nav class="kc-mobile-nav">
  <a href="index.html">Home</a>
  <a href="eventos.html">Eventos</a>
  <button class="kc-mobile-nav__create">+</button>  <!-- abre create modal -->
  <a href="compra-venda-feed.html">Compra/Venda</a>
  <button class="kc-mobile-nav__menu">Menu</button>   <!-- abre drawer -->
</nav>
```

Visível apenas em `max-width: 767px`.

---

## Ícones

O projeto usa **Font Awesome 6** (CDN):
- Sólidos: `fas fa-*`
- Regular: `far fa-*`

**Ícones por módulo:**
```
compra-venda:     fas fa-shopping-bag
caronas:          fas fa-car
moradia:          fas fa-home
eventos:          fas fa-calendar-alt
oportunidades:    fas fa-briefcase
achados-perdidos: fas fa-search
geral:            fas fa-campground (brand icon)
```

---

## Tipografia

- **Font principal:** System UI stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- **Font OG Images:** DM Sans Bold (Google Fonts CDN)
- **Font Mono:** `'Cascadia Code', 'Fira Code', 'Consolas', monospace` (para `<code>` em comentários)

**Escala de tamanhos (aproximada):**
```
xs:  0.72rem  (labels pequenos, timestamps)
sm:  0.78rem  (badges, subtítulos)
md:  0.85rem  (texto secundário)
base: 0.9rem  (texto principal)
lg:  1rem     (títulos de card)
xl:  1.1rem   (títulos de seção)
2xl: 1.3rem   (títulos de página)
3xl: 1.6rem   (hero titles)
```

---

## Animações e Transições

```css
/* Transição padrão */
transition: all 0.2s ease;

/* Hover em cards */
transform: translateY(-2px);
box-shadow: 0 8px 24px rgba(0,0,0,0.3);

/* Fade in para popovers/dropdowns */
@keyframes kcFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: kcFadeIn 0.15s ease;

/* Slide up para bottom sheets */
@keyframes kcSlideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

---

## Tema (Dark/Light)

O seletor base é `html[data-theme="dark"]` / `html[data-theme="light"]`.

`kc-theme-boot.css` carrega primeiro para evitar FOUC — lê `localStorage['kc-theme']` e aplica antes do resto do CSS carregar.

Toggle controlado em `kc-auth.ui.js` ou no botão de tema no header.
