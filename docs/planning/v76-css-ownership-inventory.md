# V76 CSS-A - Inventario de Ownership de `styles.css`

**Versao:** v76.8.0
**Data:** 2026-06-12
**Escopo:** inventario documental + script assistivo; sem alterar CSS, HTML, cascade, runtime ou `future-split/`

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
| `assets/css/styles.css` | 12.282 | 287.760 |
| `assets/css/product.css` | 1.784 | 45.373 |
| `assets/css/admin-shell.css` | 1.277 | 34.043 |
| `assets/css/kc-public-shell.css` | 943 | 20.456 |
| `assets/css/kc-chat.css` | 710 | 16.367 |
| `assets/css/product-lightbox.css` | 299 | 8.064 |
| `assets/css/kc-theme-boot.css` | 213 | 5.955 |
| **Total CSS de producao** | **17.508** | **418.018** |

`styles.css` foi parseado em 1.774 regras de estilo e 1.995 seletores.

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
| Tokens e tema | 15 | 11 | 86 | L3-L29, L1059-L1061, L4840-L4844, L5394-L5400 | Permanece global |
| Admin overlap | 24 | 20 | 123 | L5287-L5290, L10250-L10290, L10297-L10304, L10315-L10319 | Candidato a `admin-shell.css` |
| Produto overlap | 7 | 4 | 35 | L1554-L1573, L1701-L1708, L1714-L1722 | Candidato a `product.css`/`product-lightbox.css` |
| Public shell/profile/legal overlap | 137 | 134 | 845 | L495-L501, L518-L528, L534-L539, L1188-L1202 | Candidato a `kc-public-shell.css` |
| Chat overlap | 7 | 7 | 51 | L12224-L12281 | Candidato condicional a `kc-chat.css` |
| Create-post/modal/uploader | 8 | 10 | 61 | L2844-L2869, L4722-L4742, L4889-L4898, L4937-L4944 | Permanece global por ora |
| Modulos publicos de pagina | 146 | 141 | 815 | L1433-L1485, L1496-L1510, L1514-L1550, L2783-L2816 | Bloqueado para split futuro |
| Feed, cards e ranking | 282 | 189 | 1.496 | L223-L320, L603-L613, L745-L787, L809-L1058 | Permanece global |
| Layout e navegacao globais | 336 | 229 | 1.838 | L92-L220, L324-L349, L463-L492, L503-L516 | Permanece global |
| Base, reset e a11y | 29 | 29 | 134 | L31-L35, L39-L89, L1350-L1352, L1364-L1367 | Permanece global |
| Componentes compartilhados | 260 | 242 | 1.581 | L352-L459, L721-L742, L1203-L1205, L1209-L1211 | Global; candidato a `future-split` apos prova |
| Revisao manual | 523 | 389 | 2.924 | L573-L600, L615-L719, L789-L806, L1206-L1208 | Revisao manual obrigatoria |

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
| `admin-shell.css` | 24 regras / 20 seletores / 123 linhas | admin tambem depende de `styles.css`; mover nav/header exige screenshots das 6 paginas admin |
| `product.css` ou `product-lightbox.css` | 7 regras / 4 seletores / 35 linhas | blocos de save popover podem ser usados fora de `_product.html`; validar my-posts antes |
| `kc-public-shell.css` | 137 regras / 134 seletores / 845 linhas | profile/settings/legal compartilham header e auth UI; alto risco de cascade |
| `kc-chat.css` | 7 regras / 7 seletores / 51 linhas | atalhos de chat aparecem fora da rota `mensagens.html`; nao mover sem confirmar comportamento global |

O primeiro recorte mais seguro parece ser **inventario visual + micro-PR admin nav**, porque os
seletores `.kc-admin-nav*` tem prefixo claro e `admin-shell.css` ja e carregado pelas 6 paginas admin.
Mesmo assim, o PR seguinte deve ser CSS-only, com baseline desktop/mobile das 6 rotas admin.

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

Escolher uma trilha unica:

1. **CSS-B baseline visual:** capturar desktop/mobile para home, `_product.html`, `my-posts.html`,
   `mensagens.html`, `profile.html`, `settings.html` e as 6 paginas admin. Sem alterar CSS.
2. **JS residual menor:** inventario de wrappers/bootstrap restantes em `kc-api.client.js`, sem tocar CSS.

Se a escolha for CSS runtime, usar CSS-B primeiro. Nao iniciar extracao de seletores diretamente a
partir deste inventario.
