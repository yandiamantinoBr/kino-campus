# Plano de Split CSS — KinoCampus

**Versão:** v14.4.0  
**Data:** 2026-04-26  
**Status:** Planejado para V15+ (fora do escopo V14)

---

## Situação atual

| Arquivo | Linhas | Tamanho | Escopo |
|---|---|---|---|
| `assets/css/styles.css` | 10.582L | ~240KB | Toda a aplicação (monolítico) |
| `assets/css/product.css` | 1.752L | ~48KB | Página de produto (`_product.html`) |
| `assets/css/kc-public-shell.css` | 943L | ~26KB | Shell público (header, nav) |
| `assets/css/admin-shell.css` | 1.011L | ~28KB | Shell admin (painel) |
| `assets/css/kc-theme-boot.css` | ~30L | ~1KB | Inicialização de tema (sem flash) |

**Total:** ~14.500 linhas · ~343KB de CSS

---

## Análise de `styles.css` (10.582L)

### Seções identificadas

| Seção | Linhas aprox. | Arquivo-alvo |
|---|---|---|
| `:root` — Design tokens (cores, espaçamentos, fontes) | 1–70 | `00-tokens.css` |
| Base (body, html, reset, skip-link, visually-hidden) | 71–230 | `01-base.css` |
| Header (barra de pesquisa, search modal, identity) | 91–566 | `03-components.css` |
| Theme Toggle | 567–596 | `00-tokens.css` |
| Main Content, Hero Banner Carousel | 597–920 | `02-layout.css` |
| Ranking (banner, filtros, sidebar widget, badges) | 921–1210 | `03-components.css` |
| Feed Tabs, view-switcher, tab wrappers | 1210–1640 | `03-components.css` |
| Cards (kc-card, badge pill, WhatsApp share) | 1641–2100 | `03-components.css` |
| Sidebar (desktop, mobile nav, pull-to-refresh) | 2100–2480 | `02-layout.css` |
| Sidebar widgets (ODS, Cashback, Impacto) | 2321–2620 | `03-components.css` |
| Mobile V5 (menu drawer, FAB, overrides) | 2619–3820 | `02-layout.css` |
| Compra e Venda (sidebar, filtros) | 3638–4070 | `04-pages.css` |
| Desktop Layout, responsive grid | 2233–3640 | `02-layout.css` |
| Feed pager, realtime banner | 6782–6875 | `03-components.css` |
| Profile dropdown, notifications bell | 6875–7360 | `03-components.css` |
| Caronas/Eventos mobile rail | 8231–8450 | `04-pages.css` |
| Eventos calendar widget | 8305–9428 | `04-pages.css` |
| Housing/Moradia seções modais | 8452–9428 | `04-pages.css` |
| Admin styles inline | 9429–9549 | `admin-shell.css` (já separado) |
| Auth (login, signup, account-setup) | 9550–10400 | `04-pages.css` |
| Oportunidades (temperatura, sidebar sections, FAB) | 10519–10582 | `04-pages.css` |
| Patches v556 (overflow, anti-jitter, dark mode compat) | 5737–6200 | `01-base.css` (overrides) |
| Variáveis dark mode (`:root[data-theme="dark"]`) | 6186–6213 | `00-tokens.css` |
| Vote box, comentários, ações do post | 6498–6648 | `03-components.css` |

---

## Estrutura-alvo (future-split/)

```
assets/css/
  styles.css                  ← monolito atual (preservado durante V14)
  future-split/
    00-tokens.css             ← Design tokens: variáveis CSS (:root), dark-mode vars, tema
    01-base.css               ← Reset, body, html, skip-link, visually-hidden, overflow patches
    02-layout.css             ← Grid, header shell, sidebar, main-content, desktop/mobile layout
    03-components.css         ← Cards, tabs, ranking, feed, sidebar widgets, popovers, notificações
    04-pages.css              ← CSS page-specific: produto, caronas, eventos, moradia, auth, oportunidades
```

---

## Mapa de dependências

```
00-tokens.css       (sem dependências)
  ↓
01-base.css         (depende de: 00-tokens)
  ↓
02-layout.css       (depende de: 00-tokens, 01-base)
  ↓
03-components.css   (depende de: 00-tokens, 01-base, 02-layout)
  ↓
04-pages.css        (depende de: 00-tokens, 01-base, 02-layout, 03-components)
```

---

## Estimativa de tamanho por arquivo-alvo

| Arquivo | Linhas est. | % do total |
|---|---|---|
| `00-tokens.css` | ~400L | ~4% |
| `01-base.css` | ~600L | ~6% |
| `02-layout.css` | ~2.500L | ~24% |
| `03-components.css` | ~4.500L | ~43% |
| `04-pages.css` | ~2.600L | ~25% |

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Cascade quebrada por nova ordem de `<link>` | Manter ordem: 00→01→02→03→04; garantir com `validate-script-chains.js` analysis |
| Especificidade alterada por split | Preservar seletores idênticos; não renomear classes |
| `@media` duplicados entre arquivos | Aceitar duplicação (minificação resolve em build) |
| Dark mode vars espalhadas em múltiplos blocos `:root` | Consolidar em `00-tokens.css` — maior benefício do split |
| Compatibilidade com `product.css` (importa vars de styles.css) | Garantir que `00-tokens.css` seja carregado antes de `product.css` |
| Vercel não minifica CSS por padrão | Split não altera build; Vercel serve estáticos diretamente |

---

## Fase de execução (fora do escopo V14)

Este split será executado em **V15+** com a seguinte estratégia:

1. **V15.1.0** — Extrair `00-tokens.css` e atualizar `<link>` nos 22 HTMLs
2. **V15.2.0** — Extrair `01-base.css`
3. **V15.3.0** — Extrair `02-layout.css`
4. **V15.4.0** — Extrair `03-components.css`
5. **V15.5.0** — Extrair `04-pages.css` e deprecar `styles.css`

**Prerequisito:** Lighthouse CI com thresholds definidos para detectar regressão de performance.

---

## Referências

- `assets/css/styles.css` — 10.582L monolito atual
- `assets/css/kc-public-shell.css` — já separado (943L)
- `assets/css/admin-shell.css` — já separado (1.011L)
- `assets/css/product.css` — já separado (1.752L)
- `assets/css/kc-theme-boot.css` — já separado (evita flash de tema)
- `.lighthouserc.js` — thresholds de performance a defender durante o split
