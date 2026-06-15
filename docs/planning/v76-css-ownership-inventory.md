# V76 CSS-A - Inventario de Ownership de `styles.css`

**Versão:** v76.17.0
**Data:** 2026-06-15
**Escopo:** inventário documental + status pós-CSS-C.3; o inventário original não alterou CSS, e as atualizações v76.14.0/v76.15.0/v76.17.0 registram os micro-splits já evidenciados

---

## 1. Decisao

Esta entrega executa o passo CSS-1 do plano V76: classificar o ownership de seletores de
`assets/css/styles.css` antes de qualquer split. O resultado nao autoriza mover regras ainda.

No-Go mantido:

- nenhum seletor foi movido;
- nenhum `<link rel="stylesheet">` foi alterado;
- `assets/css/future-split/` continua como stub documental nao carregado;
- nenhum baseline visual foi produzido nesta etapa, porque nao houve mudanca visual.

---

## 2. Baseline medido

Fonte: `npm run audit:css` (`scripts/audit-css-ownership.js`).

| Arquivo CSS de producao | Linhas | Bytes |
|---|---:|---:|
| `assets/css/styles.css` | 12.028 | 280.599 |
| `assets/css/product.css` | 1.784 | 45.373 |
| `assets/css/admin-shell.css` | 1.471 | 38.653 |
| `assets/css/kc-public-shell.css` | 943 | 20.456 |
| `assets/css/kc-chat.css` | 710 | 16.367 |
| `assets/css/product-lightbox.css` | 299 | 8.064 |
| `assets/css/kc-theme-boot.css` | 213 | 5.955 |
| `assets/css/kc-chat-shortcut.css` | 60 | 1.327 |
| **Total CSS de producao** | **17.508** | **416.794** |

`styles.css` foi parseado em 1.734 regras de estilo e 1.954 seletores.

---

## 3. Mapa de carregamento real

O script varre os 21 HTMLs na raiz e os 6 HTMLs em `admin/`. `mensagens.html` existe fora do
manifest canonico de 26 paginas, mas tambem carrega CSS de producao.

| CSS | Versao nos links | Paginas |
|---|---|---:|
| `styles.css` | `8.6.4 x27` | 27 |
| `kc-theme-boot.css` | `8.6.1 x27` | 27 |
| `admin-shell.css` | `8.6.1 x6` | 6 |
| `kc-public-shell.css` | `8.6.1 x10` | 9 |
| `product.css` | `8.6.1 x1` | 1 |
| `product-lightbox.css` | `8.6.1 x1` | 1 |
| `kc-chat.css` | `8.6.2 x1` | 1 |

Observacao: `kc-public-shell.css` aparece 10 vezes em 9 paginas porque `account-setup.html`
contem dois links para o mesmo arquivo. Esta entrega apenas registra o fato.

---

## 4. Ownership por bucket

Classificacao heuristica do script; qualquer movimento real ainda exige revisao manual do diff,
baseline V27 e evidencia por rota.

| Bucket | Regras | Seletores | Linhas cobertas | Ranges principais | Target |
|---|---:|---:|---:|---|---|
| Tokens e tema | 15 | 11 | 86 | L3-L29, L1059-L1061, L4840-L4844, L5388-L5394 | Permanece global |
| Admin overlap | 0 | 0 | 0 | - | Encerrado em CSS-C.2 |
| Produto overlap | 7 | 4 | 35 | L1554-L1573, L1701-L1708, L1714-L1722 | Candidato a `product.css`/`product-lightbox.css` |
| Public shell/profile/legal overlap | 136 | 133 | 842 | L495-L501, L518-L528, L534-L539, L1188-L1202 | Candidato a `kc-public-shell.css` |
| Chat overlap | 0 | 0 | 0 | - | Encerrado em CSS-C.3; atalho global em `kc-chat-shortcut.css` |
| Create-post/modal/uploader | 8 | 10 | 61 | L2844-L2869, L4722-L4742, L4889-L4898, L4937-L4944 | Permanece global por ora |
| Modulos publicos de pagina | 146 | 141 | 815 | L1433-L1485, L1496-L1510, L1514-L1550, L2783-L2816 | Bloqueado para split futuro |
| Feed, cards e ranking | 282 | 189 | 1.496 | L223-L320, L603-L613, L745-L787, L809-L1058 | Permanece global |
| Layout e navegacao globais | 328 | 224 | 1.807 | L92-L220, L324-L349, L463-L492, L503-L516 | Permanece global |
| Base, reset e a11y | 29 | 29 | 134 | L31-L35, L39-L89, L1350-L1352, L1364-L1367 | Permanece global |
| Componentes compartilhados | 261 | 243 | 1.586 | L352-L459, L721-L742, L1203-L1205, L1209-L1211 | Global; candidato a `future-split` após prova |
| Revisão manual | 522 | 388 | 2.919 | L573-L600, L615-L719, L789-L806, L1206-L1208 | Revisão manual obrigatória |

O bucket "Revisao manual" e esperado em um monolito antigo: inclui blocos sem prefixo suficiente,
secoes historicas com comentarios amplos, hero, rails e patches responsivos que nao devem ser
movidos por heuristica.

---

## 5. Saida 1 - seletores que devem permanecer globais

Permanecem em `styles.css` ate haver prova de cascade equivalente:

- tokens `:root`, `[data-theme]` e overrides de tema;
- base/reset/a11y (`*`, `html`, `body`, links, `kc-sr-only`, `kc-skip-link`, focus, print);
- layout compartilhado (`header`, `kc-header`, busca global, mobile menu, sidebars, main content);
- componentes compartilhados usados por varias rotas (modais genericos, toasts, badges, popovers,
  skeletons, estados vazios, botoes e formularios compartilhados);
- feed/card/ranking/search quando o mesmo padrao aparece em home, feeds de modulo, busca,
  my-posts e produto relacionado.

Esses blocos podem virar `future-split/00-04` no futuro, mas nao devem sair do monolito sem
comparacao visual por ordem de carga.

---

## 6. Saida 2 - candidatos para CSS ja carregado por rota

Estes grupos sao candidatos, nao mudancas aprovadas:

| Arquivo ja carregado | Candidato em `styles.css` | Risco |
|---|---:|---|
| `admin-shell.css` | 0 regras / 0 seletores / 0 linhas | bucket encerrado em CSS-C.2; novos moves admin exigem nova análise de seletor |
| `product.css` ou `product-lightbox.css` | 7 regras / 4 seletores / 35 linhas | bloqueado para split simples: `.kc-save-popover*` também atende `my-posts.html`, que não carrega `product.css` |
| `kc-public-shell.css` | 136 regras / 133 seletores / 842 linhas | profile/settings/legal compartilham header e auth UI; alto risco de cascade |
| `kc-chat.css` | 0 regras / 0 seletores / 0 linhas | UI dedicada da conversa; não recebeu o atalho global |
| `kc-chat-shortcut.css` | 0 regras / 0 seletores / 0 linhas | bucket encerrado; arquivo novo carregado nas 27 páginas que já carregavam `kc-notifications.js` |

O recorte admin foi encerrado em duas etapas CSS-only: CSS-C moveu `.kc-admin-nav*`, e CSS-C.2
moveu os seletores administrativos remanescentes. O próximo recorte não deve reaproveitar a
heurística de produto sem alterar o carregamento de `my-posts.html`.

---

## 7. Saida 3 - candidatos a `future-split/` bloqueados

`future-split/` continua bloqueado. Os buckets que mais se alinham aos stubs atuais sao:

| Stub futuro | Bucket de origem | Condicao antes de mover |
|---|---|---|
| `00-tokens.css` | Tokens e tema | prova de ordem antes de qualquer CSS dependente de variaveis |
| `01-base.css` | Base, reset e a11y | screenshots e smoke de foco/skip-link em rotas publicas/admin |
| `02-layout.css` | Layout e navegacao globais | prova de header, sidebars e mobile menu em desktop/mobile |
| `03-components.css` | Componentes compartilhados | inventario de uso por rota e diff visual de modais/popovers/toasts |
| `04-pages.css` | Feed/cards/ranking + modulos publicos | separar rotas antes; nao misturar feed global com pagina especifica |

Nao carregar `future-split/` em producao ate que um PR dedicado prove equivalencia e rollback.

---

## 8. Proxima etapa recomendada

Atualizacao v76.9.0: a trilha **CSS-B baseline visual** foi executada em
`docs/planning/v76-css-visual-baseline.md` e registrada em
`docs/qa/reports/report-v76-css-visual-baseline-2026-06-12.md`.

Atualizacao v76.10.0: a trilha **JS-I inventario residual da fachada KCAPI** foi executada em
`docs/planning/v76-kcapi-residual-inventory.md` e registrada em
`docs/qa/reports/report-v76-kcapi-residual-inventory-2026-06-12.md`.

Atualização v76.14.0: a trilha **CSS-C micro-split admin nav** moveu o bloco `.kc-admin-nav*`
de `assets/css/styles.css` para `assets/css/admin-shell.css`, sem alterar HTML, JS, ordem de links
ou `future-split/`. A nova rodada de `npm run audit:css` mede `styles.css` com 12.161 linhas,
284.046 bytes, 1.753 regras e 1.974 seletores; `admin-shell.css` passa a 1.399 linhas /
36.459 bytes; o bucket `Admin overlap` cai para 12 regras / 12 seletores / 63 linhas.
A evidência está em `docs/qa/reports/report-v76-css-admin-nav-micro-split-2026-06-15.md`.

Atualização v76.15.0: a trilha **CSS-C.2 micro-split admin overlap** moveu `.kc-admin-tab*`,
`.kc-admin-tab-refresh*`, `.kc-admin-invite-feedback.is-*` e o ajuste mobile de `.kc-admin-wrapper`
para `assets/css/admin-shell.css`. A nova rodada de `npm run audit:css` mede `styles.css` com
12.089 linhas, 281.919 bytes, 1.741 regras e 1.962 seletores; `admin-shell.css` passa a
1.471 linhas / 38.565 bytes; o bucket `Admin overlap` cai para 0 regras / 0 seletores / 0 linhas.
A evidência está em `docs/qa/reports/report-v76-css-admin-overlap-micro-split-2026-06-15.md`.

Atualização v76.17.0: a trilha **CSS-C.3 micro-split chat shortcut** confirmou que o candidato
`Chat overlap` era o atalho global criado por `assets/js/core/kc-notifications.js`, não CSS local de
`mensagens.html`. Por isso, o bloco saiu de `assets/css/styles.css` para o novo
`assets/css/kc-chat-shortcut.css`, carregado nas 27 páginas que já carregavam `kc-notifications.js`.
A nova rodada de `npm run audit:css` mede `styles.css` com 12.028 linhas, 280.599 bytes, 1.734 regras
e 1.954 seletores; `kc-chat-shortcut.css` tem 60 linhas / 1.327 bytes; o bucket `Chat overlap` cai para
0 regras / 0 seletores / 0 linhas. A evidência está em
`docs/qa/reports/report-v76-css-chat-shortcut-micro-split-2026-06-15.md`.

Escolher uma trilha unica para a proxima entrega:

1. **CSS-B admin autenticado:** capturar dashboard admin real antes de mover seletores que só
   aparecem no estado autenticado.
2. **Public shell micro-split:** só mover um subgrupo de `Public shell/profile/legal overlap` após
   confirmar que todas as rotas afetadas carregam `kc-public-shell.css`.
3. **JS documental:** investigar `bootstrap-driver-core` sem extração imediata, porque o candidato
   JS residual é P3 e tem custo/risco maior que micro-splits CSS pequenos.

Nao iniciar extracao ampla de seletores diretamente a partir deste inventario.
