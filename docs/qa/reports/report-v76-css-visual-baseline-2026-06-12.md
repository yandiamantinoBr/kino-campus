# Report V76 - CSS-B Visual Baseline

**Data:** 2026-06-12
**Escopo:** baseline visual/cascade antes de qualquer split de `assets/css/styles.css`
**Status:** PASSOU

---

## 1. Objetivo

Criar evidencia reproduzivel para o gate CSS-B definido apos o inventario CSS-A. Esta rodada nao
altera CSS, HTML, cascade, runtime, versoes de assets ou `assets/css/future-split/`.

---

## 2. Arquivos alterados no repositorio

- `scripts/capture-css-visual-baseline.js`
- `package.json`
- `docs/planning/v76-css-visual-baseline.md`
- `docs/qa/reports/report-v76-css-visual-baseline-2026-06-12.md`
- indices e docs de arquitetura relacionados

Artefatos gerados localmente e ignorados pelo Git:

- `output/playwright/css-baseline/v76-css-b-2026-06-12/manifest.json`
- `output/playwright/css-baseline/v76-css-b-2026-06-12/*.png`

---

## 3. Comandos executados

```bash
node --check scripts/capture-css-visual-baseline.js
npm run audit:css-baseline
```

Resultado do baseline:

```text
[css-baseline] screenshots: 24
[css-baseline] manifest: output/playwright/css-baseline/v76-css-b-2026-06-12/manifest.json
[css-baseline] failedResponses: 0
[css-baseline] overflowX: 0
[css-baseline] futureSplitCaptures: 0
```

---

## 4. Cobertura

| Viewport | Rotas capturadas |
|---|---:|
| `desktop-1366x900` | 12 |
| `mobile-390x844` | 12 |
| **Total** | **24** |

Rotas:

- `/`
- `/_product.html`
- `/my-posts.html`
- `/mensagens.html`
- `/profile.html`
- `/settings.html`
- `/admin/index.html`
- `/admin/moderation.html`
- `/admin/reports.html`
- `/admin/banners.html`
- `/admin/help-requests.html`
- `/admin/privacy-analytics.html`

---

## 5. Resultado medido

| Checagem | Resultado |
|---|---:|
| Respostas HTTP 200 | 24/24 |
| Capturas com erro de console/pagina | 0 |
| Capturas com overflow horizontal | 0 |
| Capturas carregando `assets/css/styles.css` | 24/24 |
| Capturas carregando `assets/css/future-split/` | 0 |
| Menor screenshot | 93.797 bytes |
| Maior screenshot | 557.116 bytes |

Tambem houve inspecao visual manual de amostras:

- `home-desktop-1366x900.png`
- `admin-index-mobile-390x844.png`

As imagens estavam legiveis e nao estavam em branco.

---

## 6. Limitacoes

- A rodada e anonima/local. O banner de privacidade aparece como estado default de primeira visita.
- As paginas admin foram capturadas sem sessao; portanto o baseline cobre o shell estatico/guard
  admin, nao a UI autenticada completa do dashboard.
- Os PNGs nao sao commitados por politica de evidencia; o report registra paths, comando e resumo
  do manifesto.

---

## 7. Decisao

CSS-B inicial esta aprovado para servir como baseline anonimo antes de micro-mudancas CSS visiveis
nas rotas cobertas.

Ainda nao esta aprovado:

- mover seletores admin que so aparecem no dashboard autenticado;
- ativar `future-split/`;
- fazer split amplo de `styles.css`;
- misturar mudanca CSS com decomposicao JS de `kc-api.client.js`.

Atualizacao v76.10.0: o inventario residual JS-I da fachada `KCAPI` foi entregue em
`docs/qa/reports/report-v76-kcapi-residual-inventory-2026-06-12.md`.

Proxima entrega recomendada: CSS-C micro-split com before/after apenas para seletores cobertos por
este baseline, rodada CSS-B autenticada se o candidato for admin, ou JS-I.1 external access admin
sem tocar CSS.
