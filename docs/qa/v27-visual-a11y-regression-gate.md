# V27 - Gate Visual e A11y Pre-CSS

**Versao:** v27.0.0
**Atualizado em:** 2026-04-28
**Escopo:** planejamento QA; sem snapshots commitados nesta versao

---

## 1. Objetivo

Definir o criterio minimo para liberar qualquer split CSS, ajuste visual amplo ou refactor de layout.
A V27 nao executa regressao visual nem altera CSS; ela fixa o que precisa existir antes de mudar a
camada visual da plataforma.

---

## 2. Superficies Obrigatorias

| Grupo | Rotas |
|---|---|
| Publicas core | `index.html`, `_product.html`, `auth-callback.html`, `profile.html`, `settings.html` |
| Feeds/modulos | `compra-venda-feed.html`, `caronas-feed.html`, `moradia.html`, `eventos.html`, `oportunidades.html`, `achados-perdidos.html` |
| Criacao e usuario | `create-post.html`, `my-posts.html`, `search-results.html`, `account-setup.html`, `ajuda.html`, `ods.html` |
| Admin | `admin/index.html`, `admin/banners.html`, `admin/help-requests.html`, `admin/moderation.html`, `admin/reports.html` |

---

## 3. Viewports Minimos

| Viewport | Uso |
|---|---|
| 390x844 | Mobile comum |
| 768x1024 | Tablet/retrato |
| 1366x768 | Desktop compacto |
| 1440x900 | Desktop padrao |

Se uma rota tiver comportamento especifico de admin, modal, drawer ou popover, capturar tambem o
estado aberto do componente.

---

## 4. Gate Antes de CSS

| Gate | Criterio |
|---|---|
| Console | Sem erro de JS proprio bloqueante |
| Layout | Sem sobreposicao incoerente, texto cortado em botoes/cards ou overflow horizontal inesperado |
| A11y | Foco visivel, labels/aria preservados, contraste sem regressao obvia |
| Lighthouse | Rodar quando ambiente permitir; falha local por EPERM Windows deve ser separada de score real |
| Evidencia | Report em `docs/qa/reports/` com screenshots ou paths de artefatos, sem secrets |

---

## 5. Bloqueios

- Nao mexer em `assets/css/styles.css` sem baseline visual aprovado.
- Nao carregar stubs de `assets/css/future-split/` em producao sem comparacao visual.
- Nao aceitar snapshot novo como correto sem revisar diferenca por rota.
- Nao bloquear release documental por Playwright/LHCI quando o erro depender de ambiente local, mas registrar a causa.

---

## 6. Proximo Passo Seguro

Criar uma rodada de baseline visual em ambiente controlado, anexando artefatos a um report
`docs/qa/reports/report-v27-visual-baseline-run1.md`. So depois disso um trabalho V28+ deve tocar CSS
de producao ou split de arquivos.
