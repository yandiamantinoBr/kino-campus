# V76 CSS-B - Baseline Visual Pre-Split de `styles.css`

**Versão:** v76.27.0
**Data:** 2026-06-19
**Escopo:** baseline visual/cascade automatizado e status pós-CSS-C.5; sem ativar `future-split/`

---

## 1. Decisao

Esta entrega executa o passo CSS-B do plano V76: criar uma forma reproduzivel de capturar baseline
visual antes de qualquer split real de `assets/css/styles.css`.

No-Go mantido:

- nenhum seletor foi movido;
- nenhum `<link rel="stylesheet">` foi alterado;
- `assets/css/future-split/` continua como stub documental nao carregado;
- nenhum screenshot gerado foi commitado; os artefatos ficam em `output/`, que ja e ignorado pelo Git.

---

## 2. Comando canonico

```bash
npm run audit:css-baseline
```

O comando executa `scripts/capture-css-visual-baseline.js`, sobe um servidor estatico local interno
em `http://localhost:4000` quando necessario, abre Chromium via Playwright, captura screenshots e
gera um manifesto JSON.

Saida local desta rodada:

```text
output/playwright/css-baseline/v76-css-b-2026-06-12/
|-- manifest.json
`-- 24 screenshots PNG
```

O manifesto registra, por rota e viewport:

- status HTTP;
- ordem de links CSS;
- contagem de links para `styles.css`;
- contagem de links para `assets/css/future-split/`;
- overflow horizontal;
- erros de console/pagina;
- hash SHA-256 e tamanho do screenshot.

---

## 3. Superficie capturada

| Grupo | Rotas |
|---|---|
| Publicas core | `/`, `/_product.html` |
| Usuario/chat | `/my-posts.html`, `/mensagens.html` |
| Public shell | `/profile.html?id=USER_01`, `/settings.html` |
| Public legal | `/sobre.html`, `/editorial.html`, `/transparencia.html`, `/privacidade.html`, `/termos.html` |
| Admin estatico/sem sessao | `/admin/index.html`, `/admin/moderation.html`, `/admin/reports.html`, `/admin/banners.html`, `/admin/help-requests.html`, `/admin/privacy-analytics.html` |

Viewports:

| Viewport | Uso |
|---|---|
| `desktop-1366x900` | desktop compacto com altura suficiente para full-page screenshot |
| `mobile-390x844` | mobile comum, alinhado ao gate V27 |

Observacao: as rotas admin foram capturadas no estado sem sessao. Isso prova o gate publico/admin
estatico e o carregamento CSS das paginas, mas nao substitui uma futura rodada autenticada do
dashboard admin real.

Desde a V76.26, a execução canônica cobre 17 rotas × 2 viewports, totalizando
34 screenshots. A seção seguinte preserva os números históricos da primeira rodada.

Desde a V76.27, o perfil usa uma identidade pública válida e uma fixture de QA
determinística para avatar/badge. O manifesto também registra posição, tamanho,
direção, gap, alinhamento e shrink de `.kc-profile-rank-badges`.

---

## 4. Resultado da rodada 2026-06-12

| Metrica | Resultado |
|---|---:|
| Capturas | 24 |
| Rotas | 12 |
| Viewports | 2 |
| Respostas HTTP falhas | 0 |
| Capturas com overflow horizontal | 0 |
| Capturas com erro de console/pagina | 0 |
| Capturas carregando `future-split/` | 0 |
| Menor PNG | 93.797 bytes |
| Maior PNG | 557.116 bytes |

Todas as capturas tinham exatamente 1 link para `assets/css/styles.css` e 0 links para
`assets/css/future-split/`.

---

## 5. Como usar antes de CSS-C

Para qualquer PR que mova seletores, altere ordem de CSS ou carregue novo arquivo CSS:

1. rodar `npm run audit:css-baseline` antes da mudanca;
2. aplicar um filescope CSS-only e pequeno;
3. rodar `npm run audit:css-baseline` depois da mudanca;
4. comparar screenshots e hashes do manifesto por rota/viewport;
5. registrar o diff visual em `docs/qa/reports/`;
6. manter rollback simples: reverter CSS e restaurar ordem de links.

No-Go para CSS-C:

- alterar CSS e JS no mesmo PR sem justificativa forte;
- mover seletores que dependem de estado autenticado sem baseline autenticado;
- ativar `future-split/` junto com remocao de regras do monolito;
- aceitar screenshot novo como correto sem revisao manual das rotas afetadas.

---

## 6. Proxima etapa recomendada

Atualização v76.14.0: o baseline foi usado em CSS-C para mover `.kc-admin-nav*` de
`styles.css` para `admin-shell.css`. Foram geradas três rodadas locais:

- `output/playwright/css-baseline/v76-css-c-admin-nav-before-2026-06-15/`
- `output/playwright/css-baseline/v76-css-c-admin-nav-after-2026-06-15/`
- `output/playwright/css-baseline/v76-css-c-admin-nav-after-repeat-2026-06-15/`

As três rodadas capturaram 24 screenshots, 0 respostas falhas, 0 overflow horizontal e 0
carregamentos de `future-split/`. Os hashes não foram tratados como prova pixel-perfect porque
recursos externos oscilaram com `ERR_CONNECTION_RESET` e a própria repetição pós-mudança gerou
hashes diferentes em rotas não tocadas. A evidência detalhada está em
`docs/qa/reports/report-v76-css-admin-nav-micro-split-2026-06-15.md`.

Atualização v76.15.0: o baseline foi usado em CSS-C.2 para mover os seletores administrativos
remanescentes de `styles.css` para `admin-shell.css`. Foram geradas três rodadas locais:

- `output/playwright/css-baseline/v76-css-c2-admin-overlap-before-2026-06-15/`
- `output/playwright/css-baseline/v76-css-c2-admin-overlap-after-2026-06-15/`
- `output/playwright/css-baseline/v76-css-c2-admin-overlap-repeat-2026-06-15/`

As três rodadas capturaram 24 screenshots, 0 respostas falhas, 0 overflow horizontal e 0
carregamentos de `future-split/`. Nesta etapa, os hashes ficaram estáveis: 0 diferenças entre
antes/depois e 0 diferenças entre depois/repetição. A evidência detalhada está em
`docs/qa/reports/report-v76-css-admin-overlap-micro-split-2026-06-15.md`.

Atualização v76.17.0: o baseline foi usado em CSS-C.3 para mover o atalho global de mensagens de
`styles.css` para `assets/css/kc-chat-shortcut.css`, carregado nas 27 páginas que já carregavam
`assets/js/core/kc-notifications.js`. Foram geradas três rodadas locais:

- `output/playwright/css-baseline/v76-css-c3-chat-shortcut-before-2026-06-15/`
- `output/playwright/css-baseline/v76-css-c3-chat-shortcut-after-2026-06-15/`
- `output/playwright/css-baseline/v76-css-c3-chat-shortcut-repeat-2026-06-15/`

As três rodadas capturaram 24 screenshots, 0 respostas falhas, 0 overflow horizontal e 0
carregamentos de `future-split/`. Os hashes ficaram estáveis: 0 diferenças entre antes/depois e
0 diferenças entre depois/repetição. A checagem no navegador interno confirmou que `index.html` e
`mensagens.html` carregam `kc-chat-shortcut.css`, mantêm `.kc-chat-shortcut` e `.kc-chat-mobile-fab`
no DOM e preservam `position: relative` no atalho. A evidência detalhada está em
`docs/qa/reports/report-v76-css-chat-shortcut-micro-split-2026-06-15.md`.

Atualização v76.26.0: CSS-C.4 adicionou as cinco páginas legais ao capturador e
moveu `.kc-legal-*` para `kc-public-shell.css`. As rodadas before/after/repeat
produziram 34 capturas cada, sem falha HTTP, overflow, erro de console/página ou
`future-split/`. As 10 capturas legais mantiveram hash idêntico antes/depois;
oscilações em perfil/admin foram externas ao recorte e reapareceram na repetição.
Evidência em `docs/qa/reports/report-v76-css-legal-shell-micro-split-2026-06-18.md`.

Atualização v76.27.0: CSS-C.5 corrigiu `/profile.html` sem identidade para
`/profile.html?id=USER_01`, adicionou avatar/badge determinísticos apenas no
capturador e esperas por fontes/imagens. As rodadas
`v76-css-c5-profile-rank-*-deterministic-*` tiveram 34 capturas sem falha HTTP,
overflow ou `future-split/`; as métricas do badge permaneceram equivalentes em
desktop/mobile. Evidência em
`docs/qa/reports/report-v76-css-profile-ranking-shell-micro-split-2026-06-19.md`.

Escolher uma trilha unica:

1. **CSS-B admin autenticado:** capturar dashboard admin real com credenciais controladas, caso o
   proximo candidato seja `admin-shell.css`.
2. **Public shell micro-split:** escolher outro subgrupo pequeno do overlap remanescente com mapa
   de carga e baseline específico; legal e ranking de perfil já foram encerrados.
3. **JS documental:** investigar o bucket residual `bootstrap-driver-core` sem extração imediata.

Nao iniciar extracao ampla de `styles.css` diretamente a partir deste baseline.
