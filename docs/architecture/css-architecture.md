# Arquitetura CSS - KinoCampus

**Versao:** v76.8.0
**Atualizado em:** 2026-06-12

> Baseline dos CSS de producao, mapa de carga por rota, ownership de `styles.css`
> e status dos stubs `assets/css/future-split/`.

---

## 1. Visao geral

O CSS do KinoCampus continua em Vanilla CSS, sem preprocessador, CSS-in-JS ou framework de UI.
Todos os estilos de producao sao carregados por `<link rel="stylesheet">` diretamente nos HTMLs.

```text
assets/css/
|-- styles.css              12.282 linhas / 287.760 bytes
|-- product.css              1.784 linhas / 45.373 bytes
|-- admin-shell.css          1.277 linhas / 34.043 bytes
|-- kc-public-shell.css        943 linhas / 20.456 bytes
|-- kc-chat.css                710 linhas / 16.367 bytes
|-- product-lightbox.css       299 linhas / 8.064 bytes
|-- kc-theme-boot.css          213 linhas / 5.955 bytes
`-- future-split/             5 stubs documentais, nao carregados
```

**Total CSS de producao:** 17.508 linhas / 418.018 bytes.

O monolito `styles.css` segue sendo o principal hotspot visual: 12.282 linhas, 287.760 bytes,
1.774 regras parseadas e 1.995 seletores parseados por `npm run audit:css`.

---

## 2. Arquivos de producao

| Arquivo | Escopo atual | Carga |
|---|---|---|
| `styles.css` | tokens, base, layout global, componentes, feed, cards, ranking, modulos publicos e patches responsivos | 27 HTMLs descobertos |
| `kc-theme-boot.css` | CSS critico anti-FOUC/CLS durante aplicacao inicial de tema | 27 HTMLs descobertos |
| `admin-shell.css` | shell e componentes das 6 paginas admin | 6 HTMLs admin |
| `kc-public-shell.css` | profile, settings, account setup, legal/privacidade/transparencia, ajuda e mensagens | 9 paginas, 10 links |
| `product.css` | detalhe de publicacao/produto | `_product.html` |
| `product-lightbox.css` | lightbox de midia do produto | `_product.html` |
| `kc-chat.css` | UI dedicada de conversa | `mensagens.html` |

`mensagens.html` existe na raiz e carrega CSS de producao, mas ainda nao faz parte do manifest
canonico de 26 paginas validado por `scripts/admin-pages.manifest.js`.

---

## 3. Mapa de links CSS

Fonte: `npm run audit:css`, que varre os HTMLs da raiz e de `admin/`.

| CSS | Versao nos links | Paginas |
|---|---|---:|
| `styles.css` | `8.6.4 x27` | 27 |
| `kc-theme-boot.css` | `8.6.1 x27` | 27 |
| `admin-shell.css` | `8.6.1 x6` | 6 |
| `kc-public-shell.css` | `8.6.1 x10` | 9 |
| `product.css` | `8.6.1 x1` | 1 |
| `product-lightbox.css` | `8.6.1 x1` | 1 |
| `kc-chat.css` | `8.6.2 x1` | 1 |

Observacao operacional: `account-setup.html` contem dois links para `kc-public-shell.css?v=8.6.1`.
Esta arquitetura apenas registra o estado; nao houve alteracao de HTML nesta etapa.

---

## 4. Ownership de `styles.css`

O inventario canonico da etapa CSS-A esta em
[`docs/planning/v76-css-ownership-inventory.md`](../planning/v76-css-ownership-inventory.md).

Resumo do parse:

| Bucket | Regras | Seletores | Decisao atual |
|---|---:|---:|---|
| Tokens e tema | 15 | 11 | permanece global |
| Base, reset e a11y | 29 | 29 | permanece global |
| Layout e navegacao globais | 336 | 229 | permanece global |
| Feed, cards e ranking | 282 | 189 | permanece global |
| Componentes compartilhados | 260 | 242 | global; candidato a `future-split` apos prova |
| Admin overlap | 24 | 20 | candidato a `admin-shell.css` apos baseline |
| Produto overlap | 7 | 4 | candidato a `product.css`/`product-lightbox.css` apos baseline |
| Public shell/profile/legal overlap | 137 | 134 | candidato a `kc-public-shell.css` apos baseline |
| Chat overlap | 7 | 7 | candidato condicional a `kc-chat.css` |
| Create-post/modal/uploader | 8 | 10 | permanece global ate existir rota CSS ou split aprovado |
| Modulos publicos de pagina | 146 | 141 | bloqueado para split futuro |
| Revisao manual | 523 | 389 | revisao manual obrigatoria antes de mover |

Qualquer PR de extracao CSS deve partir desse inventario, mas tambem precisa revisar o seletor real
e a rota afetada. A classificacao e heuristica, nao uma autorizacao automatica de movimento.

---

## 5. `future-split/`

`assets/css/future-split/` contem 5 stubs documentais criados para orientar um split futuro:

| Stub | Ownership pretendido |
|---|---|
| `00-tokens.css` | `:root`, `[data-theme]`, variaveis e overrides de tema |
| `01-base.css` | reset, tipografia, `html`, `body`, links, a11y base |
| `02-layout.css` | grids, header, nav, sidebars, containers e responsivo estrutural |
| `03-components.css` | cards, botoes, inputs, modais, popovers, badges, toasts, skeletons |
| `04-pages.css` | regras por pagina, feeds e modulos publicos |

Status: nenhum stub e carregado em producao. Nao adicionar links para esses arquivos sem PR
dedicado com prova de ordem, comparacao visual e rollback.

---

## 6. Regras para mudar CSS

Antes de qualquer mudanca real de CSS:

1. identificar bucket de ownership em `docs/planning/v76-css-ownership-inventory.md`;
2. definir filescope CSS-only ou justificar por que HTML/JS tambem precisa mudar;
3. aplicar Gate V27 para baseline visual/a11y nas rotas afetadas;
4. aplicar politica V32 para decidir Playwright E2E obrigatorio;
5. aplicar politica V33 quando a mudanca impactar Lighthouse/LHCI;
6. registrar rollback simples, sem dashboard, secret ou migration;
7. rodar `npm run check:all` antes de PR pronto.

Nao fazer:

- mover seletores com base apenas no prefixo;
- alterar `styles.css` e `future-split/` no mesmo PR;
- ativar `future-split/` enquanto remove regras do monolito;
- criar novo arquivo CSS de rota sem atualizar arquitetura, validators e matriz de carga;
- tratar `kc-public-shell.css` como CSS de uma unica pagina: ele serve varias superficies.

---

## 7. Comandos uteis

```bash
npm run audit:css
npm run audit:css -- --json
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm run check:all
```

`npm run audit:css` e informativo. Ele nao substitui baseline visual, mas reduz deriva entre
documentacao e estado real do filesystem.
