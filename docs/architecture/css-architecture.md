# Arquitetura CSS - KinoCampus

**Versão:** v76.27.0
**Atualizado em:** 2026-06-19

> Baseline dos CSS de producao, mapa de carga por rota, ownership de `styles.css`,
> baseline visual CSS-B/C, micro-splits CSS-C até C.5, contexto responsivo da
> home/módulos e status dos stubs `assets/css/future-split/`.

---

## 1. Visao geral

O CSS do KinoCampus continua em Vanilla CSS, sem preprocessador, CSS-in-JS ou framework de UI.
Todos os estilos de producao sao carregados por `<link rel="stylesheet">` diretamente nos HTMLs.

```text
assets/css/
|-- styles.css              11.982 linhas / 279.971 bytes
|-- product.css              1.784 linhas / 45.373 bytes
|-- admin-shell.css          1.471 linhas / 38.653 bytes
|-- kc-public-shell.css      1.078 linhas / 22.959 bytes
|-- kc-chat.css                710 linhas / 16.367 bytes
|-- kc-error-page.css          374 linhas / 8.351 bytes
|-- product-lightbox.css       299 linhas / 8.064 bytes
|-- kc-sidebar-context.css     354 linhas / 9.125 bytes
|-- kc-theme-boot.css          213 linhas / 5.955 bytes
|-- kc-chat-shortcut.css        60 linhas / 1.387 bytes
`-- future-split/             5 stubs documentais, nao carregados
```

**Total CSS de producao:** 18.325 linhas / 436.205 bytes.

O monólito `styles.css` segue sendo o principal hotspot visual: 11.982 linhas, 279.971 bytes,
1.728 regras parseadas e 1.945 seletores parseados por `npm run audit:css`.

---

## 2. Arquivos de producao

| Arquivo | Escopo atual | Carga |
|---|---|---|
| `styles.css` | tokens, base, layout global, componentes, feed, cards, ranking, módulos públicos e patches responsivos remanescentes | 30 HTMLs descobertos |
| `kc-theme-boot.css` | CSS critico anti-FOUC/CLS durante aplicacao inicial de tema | 30 HTMLs descobertos |
| `kc-chat-shortcut.css` | atalho global de mensagens injetado por `kc-notifications.js` | 30 HTMLs descobertos |
| `admin-shell.css` | shell e componentes das 6 paginas admin | 6 HTMLs admin |
| `kc-public-shell.css` | profile, settings, account setup, legal/privacidade/transparencia, ajuda, mensagens e 404 | 12 paginas, 13 links |
| `kc-sidebar-context.css` | títulos de módulo, contexto compacto da home e diálogo contextual | home + 6 feeds de módulo |
| `kc-error-page.css` | composição visual isolada da página de erro | `404.html` |
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
| `styles.css` | `8.6.4 x30` | 30 |
| `kc-theme-boot.css` | `8.6.1 x30` | 30 |
| `kc-chat-shortcut.css` | `8.6.1 x30` | 30 |
| `admin-shell.css` | `8.6.1 x6` | 6 |
| `kc-public-shell.css` | `8.6.1 x13` | 12 |
| `kc-sidebar-context.css` | `8.6.1 x7` | 7 |
| `kc-error-page.css` | `8.6.1 x1` | 1 |
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
| Layout e navegacao globais | 341 | 237 | permanece global |
| Feed, cards e ranking | 282 | 190 | permanece global |
| Componentes compartilhados | 261 | 243 | global; candidato a `future-split` após prova |
| Admin overlap | 0 | 0 | encerrado em CSS-C.2 |
| Produto overlap | 7 | 4 | bloqueado para split simples; `.kc-save-popover*` também atende `my-posts.html` |
| Public shell/profile/legal overlap | 116 | 115 | legal encerrado em CSS-C.4 e ranking de perfil em CSS-C.5; shell remanescente exige novo recorte |
| Chat overlap | 0 | 0 | encerrado em CSS-C.3; atalho global em `kc-chat-shortcut.css` |
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

## 6. Baseline CSS-B/C

O baseline visual/cascade canonico da etapa CSS-B esta em
[`docs/planning/v76-css-visual-baseline.md`](../planning/v76-css-visual-baseline.md).

Comando:

```bash
npm run audit:css-baseline
```

A rodada de 2026-06-12 capturou 24 screenshots em `output/playwright/css-baseline/`:
12 rotas em desktop `1366x900` e mobile `390x844`, com 0 respostas falhas, 0 overflow horizontal,
0 erros de console/pagina e 0 carregamentos de `future-split/`.

Em 2026-06-15, CSS-C usou o mesmo mecanismo para o micro-split `.kc-admin-nav*`, com rodadas
antes/depois/repetida em `output/playwright/css-baseline/v76-css-c-admin-nav-*`. As três rodadas
tiveram 24 capturas, 0 respostas falhas, 0 overflow horizontal e 0 carregamentos de `future-split/`.
Os hashes foram tratados como apoio, não como prova única, porque recursos externos oscilaram com
`ERR_CONNECTION_RESET` entre capturas.

Ainda em 2026-06-15, CSS-C.2 usou o mesmo mecanismo para remover o restante do bucket admin de
`styles.css`. As rodadas `v76-css-c2-admin-overlap-before-*`, `after-*` e `repeat-*` tiveram 24
capturas, 0 respostas falhas, 0 overflow horizontal e 0 carregamentos de `future-split/`; os hashes
ficaram estáveis, com 0 diferenças entre antes/depois e depois/repetição.

CSS-C.3 usou o mesmo mecanismo para remover o bucket `Chat overlap` de `styles.css` e criar
`kc-chat-shortcut.css`. As rodadas `v76-css-c3-chat-shortcut-before-*`, `after-*` e `repeat-*`
tiveram 24 capturas, 0 respostas falhas, 0 overflow horizontal, 0 carregamentos de `future-split/`
e 0 diferenças de hash entre antes/depois e depois/repetição.

CSS-C.4 ampliou o baseline para 17 rotas e moveu `.kc-legal-*` para
`kc-public-shell.css`. As três rodadas `v76-css-c4-legal-*` tiveram 34 capturas,
0 respostas falhas, 0 overflow, 0 erros de console/página e 0 carregamentos de
`future-split/`; as 10 capturas legais mantiveram hash idêntico antes/depois.

CSS-C.5 corrigiu a rota do perfil no baseline para `/profile.html?id=USER_01`,
adicionou fixture determinística e métricas de flexbox, e moveu
`.kc-profile-rank-badges*` para `kc-public-shell.css`. As três rodadas tiveram
34 capturas, sem falha HTTP, overflow ou `future-split/`; posição, tamanho,
direção, gap, alinhamento e shrink do badge permaneceram equivalentes.

Limitacao: o baseline admin atual e anonimo/sem sessao. Ele cobre o shell estatico e o gate admin,
mas nao substitui baseline autenticado antes de mover seletores visiveis apenas no dashboard real.

---

## 7. Regras para mudar CSS

Antes de qualquer mudanca real de CSS:

1. identificar bucket de ownership em `docs/planning/v76-css-ownership-inventory.md`;
2. definir filescope CSS-only ou justificar por que HTML/JS tambem precisa mudar;
3. aplicar Gate V27 e `npm run audit:css-baseline` para baseline visual/a11y nas rotas afetadas;
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

## 8. Comandos uteis

```bash
npm run audit:css
npm run audit:css -- --json
npm run audit:css-baseline
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm run check:all
```

`npm run audit:css` e informativo e classifica ownership. `npm run audit:css-baseline` gera
evidencia visual local em `output/`, sem commitar screenshots.
