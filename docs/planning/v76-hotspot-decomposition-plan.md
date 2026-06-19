# V76 - Plano de Decomposição Segura dos Hotspots JS/CSS

**Versão:** v76.29.0
**Data:** 2026-06-19
**Escopo:** planejamento técnico + status das extrações JS V76, dossiê JS-I.4 do bootstrap/driver core, inventário CSS-A, baseline CSS-B.1 e micro-splits CSS-C até C.5; sem alterar SQL, secrets, provider ou deploy

---

## 1. Objetivo

Converter os achados A1/A2 das auditorias V1/V2/V3 em uma trilha executavel para reduzir os dois
hotspots ainda relevantes do frontend:

| Hotspot | Estado atual medido em 2026-06-15 | Risco principal |
|---|---:|---|
| `assets/js/api/kc-api.client.js` | 1.459 linhas / 56.513 bytes | regressão de contrato público `window.KCAPI`, paridade local/supabase e fluxos autenticados |
| `assets/css/styles.css` | 12.028 linhas / 280.599 bytes | regressão visual transversal em páginas públicas/admin e quebra de cascade |
| `assets/css/future-split/` | 5 stubs / 135 linhas totais | ativacao prematura sem prova de equivalencia visual |

Este plano nao autoriza split imediato. Ele define a ordem, os gates e os criterios de No-Go para
que a proxima implementacao seja pequena, auditavel e reversivel.

---

## 2. Decisao

1. **Nao dividir JS e CSS na mesma entrega.** Cada trilha tem superficie, gates e rollback diferentes.
2. **Manter a stack imutavel:** HTML/CSS/JS vanilla, IIFE, `window.*`, sem bundler, sem transpiler e sem framework.
3. **Preservar contrato primeiro; reduzir tamanho depois.** Nenhum metodo de `window.KCAPI` pode desaparecer,
   mudar assinatura ou mudar semantica de erro sem teste dedicado.
4. **CSS so avanca com baseline visual.** `future-split/` continua nao carregado ate haver prova de ordem,
   cascade e equivalencia por rota.
5. **Cada PR deve ter rollback simples.** Se o rollback exigir dashboard, segredo, migration destrutiva ou
   reconfiguracao manual nao documentada, o escopo esta errado.

---

## 3. Trilha JS - `kc-api.client.js`

### 3.1 Estado atual

O arquivo principal ja delega parte do dominio para submodulos `_KCAPI.*`:

| Grupo | Arquivo atual |
|---|---|
| feed/search | `assets/js/api/kc-api.posts-feed.js` |
| leitura de posts | `assets/js/api/kc-api.posts-read.js` |
| escrita de posts | `assets/js/api/kc-api.posts-write.js` |
| auth | `assets/js/api/kc-api.auth.js` |
| profiles | `assets/js/api/kc-api.profiles.js` |
| comments/votes | `assets/js/api/kc-api.comments-votes.js` |
| ratings | `assets/js/api/kc-api.ratings.js` |
| related | `assets/js/api/kc-api.related.js` |
| saved | `assets/js/api/kc-api.saved.js` |
| diagnostics create-post | `assets/js/api/kc-api.diagnostics.js` |
| filtros/date presets | `assets/js/api/kc-api.filters.js` |
| autores mock/indices | `assets/js/api/kc-api.authors.js` |
| normalizacao de posts | `assets/js/api/kc-api.posts-normalize.js` |
| help/admin help | `assets/js/api/kc-api.help.js` |
| notifications | `assets/js/api/kc-api.notifications.js` |
| chat | `assets/js/api/kc-api.chat.js` |

O risco residual nao e ausencia de modularizacao. O risco e o arquivo central ainda concentrar bootstrap,
normalizacao, caches, mocks, wrappers, fallback local/supabase, diagnosticos e exposicao final do contrato.

**Status v76.10.0:** JS-I concluido em
`docs/planning/v76-kcapi-residual-inventory.md`, com suporte de
`scripts/audit-kcapi-facade-residual.js` (`npm run audit:kcapi-residual`). O parse atual registra
107 membros publicos, 145 declaracoes `function`, 98 wrappers exportados/globais, 17 namespaces
`_KCAPI.*` inicializados e 13 buckets residuais. Nenhum runtime, HTML, CSS ou adapter foi alterado.

**Status v76.11.0:** JS-I.1 concluiu a extracao controlada dos wrappers admin de external access:
`KCAPI.listExternalAccessRequests` e `KCAPI.decideExternalAccessRequest` continuam publicos, mas
agora delegam para `window._KCAPI.help` com `getActiveDriver` injetado. O bucket direto
`admin-external-access-direct-driver` saiu do inventario; o parse atual registra 12 buckets
residuais e promove `notification-fallback-builders` para P1.

**Status v76.12.0:** JS-I.2 removeu os builders privados de fallback de notificação da fachada:
`buildFallbackNotificationPreferences` e `buildFallbackNotificationChannelTargets` permanecem
concentrados em `window._KCAPI.notifications`, enquanto os wrappers públicos de preferências e
destinos privados continuam em `window.KCAPI`. O parse atual registra 107 membros públicos,
143 declarações `function`, 98 wrappers exportados/globais, 17 namespaces `_KCAPI.*` e 11 buckets
residuais; `post-mutation-bridge` passa a ser o menor candidato runtime.

**Status v76.13.0:** JS-I.3 removeu a ponte privada `emitPostMutation` da fachada. Os helpers
`isPostMutationOk`, `getPostMutationData` e `emitPostMutation` agora ficam em
`window._KCAPI.postsWrite`; `buildPostsWriteDeps()` injeta `postFreshness: window.KCPostFreshness`
e a ordem de emissão após o retorno do driver foi preservada. O parse atual registra 107 membros
públicos, 141 declarações `function`, 98 wrappers exportados/globais, 17 namespaces `_KCAPI.*` e
10 buckets residuais. O único candidato JS restante listado pelo script é `bootstrap-driver-core`,
mantido como P3 e sem extração imediata.

**Status v76.29.0:** JS-I.4 classifica as 12 funções / 131 linhas de `bootstrap-driver-core` em
cinco domínios (`environment-policy`, `transport-config`, `error-contract`,
`static-database-fallback` e `adapter-registry`), sem funções órfãs, e automatiza 15 gates. A
decisão é No-Go para extração runtime. `transport-config` é apenas o primeiro domínio a ser
reavaliado depois de testes dedicados de paridade; não é uma autorização de split.

### 3.2 Ordem permitida

| Ordem | Entrega | Regra |
|---:|---|---|
| JS-0 | Inventario do contrato publico `window.KCAPI` | Sem alterar runtime; registrar metodos, getters e aliases expostos |
| JS-1 | Inventario dos pontos internos ainda residentes no facade | Separar bootstrap/env, diagnostics, freshness/session, mocks, normalization, filters e wrappers |
| JS-2 | Extracao de helper puro com teste dedicado | Apenas codigo sem side effects e sem acesso direto a Supabase/localStorage |
| JS-3 | Extracao de modulo com dependencia injetada | Modulo recebe deps explicitas, como os `_KCAPI.*` atuais |
| JS-4 | Reducao de wrapper duplicado | O facade passa a delegar, mas mantem fallback e assinatura publica |
| JS-5 | Remocao de fallback legado | Permitida apenas com teste e evidencia de que o fallback nao e mais executado |

### 3.3 Primeiros candidatos seguros

| Candidato | Motivo | Bloqueio |
|---|---|---|
| `normalizeErrorForDiagnostics` + helpers de erro | baixa dependencia externa, teste unitario claro | **Concluido em v76.1.0**; preservar mensagens publicas usadas por UI/admin |
| `KCSessionStore` / `KCPostFreshness` | responsabilidade isolavel, ja exposta como `window.*` proprio | **Concluido em v76.2.0**; preservar eventos, storage keys e deduplicacao |
| filtros/date presets de feed | logica pura, coberta por `kc-api-client.test.js` | **Concluido em v76.3.0**; preservar paridade entre modulos e datas |
| mocks/normalizacao de autores | reduz peso do facade | **Concluido em v76.4.0**; preservar fixtures `MOCK_USERS`, aliases publicos e resolucao por autor/avatar legado |
| `normalizePost` | grande valor, mas contrato sensivel | **Concluido em v76.6.0**; preservar snapshots e delegacao publica `KCAPI.normalizePost` |
| normalizadores `normalizeUserRating*` | helpers puros ja acoplados ao modulo de ratings | **Concluido em v76.7.0**; preservar wrappers publicos `KCAPI.normalizeUserRating*` |

### 3.4 Gates obrigatorios para qualquer PR JS

- `node --check` em todos os arquivos JS tocados.
- `npm run check:structure`.
- `npm run check:scripts`.
- `npm run check:hygiene`.
- `npm test -- --runInBand tests/integration/kc-api-client.test.js`.
- `npm run check:all` antes de PR pronto.
- Para auth/profile/post/write/admin: aplicar politica V32 e rodar Playwright relevante ou registrar No-Go.
- Se `window.KCAPI` mudar: reportar diff de superficie publica antes/depois.

---

## 4. Trilha CSS - `styles.css`

### 4.1 Estado atual

`styles.css` e o CSS principal carregado em paginas publicas e em superficies admin que reutilizam base/tokens.
Os stubs `future-split/` existem, mas nao sao carregados em producao. A decisao correta continua sendo
nao ativa-los sem baseline visual e sem prova de cascade.

### 4.2 Ordem permitida

| Ordem | Entrega | Regra |
|---:|---|---|
| CSS-0 | Baseline visual/a11y | Obrigatorio antes de qualquer alteracao real de CSS |
| CSS-1 | Inventario de ownership de seletores | Classificar tokens, base, layout, componentes, pagina, admin e produto |
| CSS-2 | Ajuste CSS pequeno em arquivo ja carregado | Usar dossie V45 e template de evidencia CSS pequena |
| CSS-3 | Extracao para arquivo ja carregado por rota | Preferir `product.css`, `admin-shell.css` ou `kc-public-shell.css` quando o seletor for local |
| CSS-4 | Prova de carga de `future-split/` em ambiente controlado | Sem remover regras do monolito no mesmo passo |
| CSS-5 | Split global progressivo | Somente apos equivalencia visual e rollback testado |

### 4.3 Primeiro recorte recomendado

Antes de ativar `future-split/`, fazer um inventario de seletores de `styles.css` com tres saidas:

1. seletores globais que devem permanecer em `styles.css`;
2. seletores de pagina que podem migrar para arquivos ja carregados;
3. seletores candidatos a `future-split/`, bloqueados ate prova de cascade.

Esse inventario pode ser documental ou assistido por script, mas nao deve alterar CSS.

**Status v76.8.0:** CSS-A concluido em
`docs/planning/v76-css-ownership-inventory.md`, com suporte de
`scripts/audit-css-ownership.js` (`npm run audit:css`). O parse atual registra 1.774 regras e
1.995 seletores em `styles.css`, sem mover seletores, sem alterar HTML e sem carregar
`future-split/`.

**Status v76.9.0:** CSS-B concluido em
`docs/planning/v76-css-visual-baseline.md`, com suporte de
`scripts/capture-css-visual-baseline.js` (`npm run audit:css-baseline`). A rodada local gerou
24 screenshots em 12 rotas x 2 viewports, com 0 respostas falhas, 0 overflow horizontal, 0 erros de
console/pagina e 0 carregamentos de `future-split/`.

**Status v76.14.0:** CSS-C moveu `.kc-admin-nav*` de `assets/css/styles.css` para
`assets/css/admin-shell.css`, sem alterar HTML, JS, ordem de links ou `future-split/`. O parse atual
registra `styles.css` com 12.161 linhas, 284.046 bytes, 1.753 regras e 1.974 seletores; o bucket
`Admin overlap` cai para 12 regras / 12 seletores / 63 linhas. A evidência está em
`docs/qa/reports/report-v76-css-admin-nav-micro-split-2026-06-15.md`.

**Status v76.15.0:** CSS-C.2 moveu o restante do bucket `Admin overlap` para
`assets/css/admin-shell.css`, incluindo `.kc-admin-tab*`, `.kc-admin-tab-refresh*`,
`.kc-admin-invite-feedback.is-*` e o ajuste mobile de `.kc-admin-wrapper`. O parse atual registra
`styles.css` com 12.089 linhas, 281.919 bytes, 1.741 regras e 1.962 seletores; o bucket
`Admin overlap` cai para 0 regras / 0 seletores / 0 linhas. O candidato de produto foi bloqueado
para split simples porque `.kc-save-popover*` também atende `my-posts.html`, que não carrega
`product.css`. A evidência está em
`docs/qa/reports/report-v76-css-admin-overlap-micro-split-2026-06-15.md`.

**Status v76.17.0:** CSS-C.3 moveu o atalho global de mensagens de `assets/css/styles.css` para
`assets/css/kc-chat-shortcut.css`. A decisão preserva o comportamento global porque o novo CSS é
carregado nas 27 páginas que já carregavam `assets/js/core/kc-notifications.js`; `kc-chat.css`
permanece restrito à UI de `mensagens.html`. O parse atual registra `styles.css` com 12.028 linhas,
280.599 bytes, 1.734 regras e 1.954 seletores; o bucket `Chat overlap` cai para 0 regras /
0 seletores / 0 linhas. A evidência está em
`docs/qa/reports/report-v76-css-chat-shortcut-micro-split-2026-06-15.md`.

**Status v76.26.0:** CSS-C.4 moveu `.kc-legal-*` para `assets/css/kc-public-shell.css` após
fechar ownership nas cinco páginas legais. `styles.css` cai para 12.005 linhas / 280.551 bytes,
1.731 regras e 1.948 seletores; o bucket público cai para 119 regras / 117 seletores / 752 linhas.
O baseline canônico passa a 17 rotas / 34 capturas, com 0 diferenças de hash nas dez capturas
legais antes/depois. Evidência em
`docs/qa/reports/report-v76-css-legal-shell-micro-split-2026-06-18.md`.

**Status v76.27.0:** CSS-C.5 moveu `.kc-profile-rank-badges*` para
`assets/css/kc-public-shell.css` e corrigiu o baseline de perfil para uma rota
pública válida com fixture determinística. `styles.css` cai para 11.982 linhas /
279.971 bytes, 1.728 regras e 1.945 seletores; o bucket público cai para
116 regras / 115 seletores / 733 linhas. Evidência em
`docs/qa/reports/report-v76-css-profile-ranking-shell-micro-split-2026-06-19.md`.

**Status v76.28.0:** CSS-B.1 ampliou o baseline para 21 rotas / 42 capturas,
incluindo 404, ajuda, callback e onboarding. As 12 páginas consumidoras de
`kc-public-shell.css` agora têm cobertura desktop/mobile; o onboarding usa
fixture local sem credencial real e `finalUrl` detecta redirects. Nenhum CSS ou
runtime foi alterado. Evidência em
`docs/qa/reports/report-v76-css-public-shell-baseline-expansion-2026-06-19.md`.

### 4.4 Gates obrigatorios para qualquer PR CSS

- Gate V27 de visual/a11y com rotas afetadas.
- Politica V32 para decidir Playwright E2E obrigatorio.
- Politica V33 para Lighthouse/LHCI quando a mudanca impactar paginas publicas ou admin index.
- Ledger V35 e dossie V45 quando o escopo for ajuste CSS pequeno.
- Screenshots desktop/mobile antes/depois para cada rota afetada.
- `npm run check:all` antes de PR pronto.
- Nenhum link novo para `future-split/` sem prova de ordem e rollback.

---

## 5. No-Go Global

Bloquear a entrega se qualquer uma das condicoes abaixo ocorrer:

- PR mistura decomposicao de `kc-api.client.js` com split CSS.
- PR altera HTML, CSS e JS sem filescope minimo e sem rollback claro.
- PR remove ou renomeia metodo de `window.KCAPI` sem camada de compatibilidade.
- PR toca driver Supabase e driver local sem teste de paridade.
- PR toca fluxo autenticado sem evidencia aplicavel ou decisao No-Go explicita.
- PR ativa `assets/css/future-split/` diretamente em producao.
- PR reduz suites, ignora `check:all` ou enfraquece validators para passar.
- Evidencia contem token, magic link completo, service role key, URL assinada ou project ref sensivel.

---

## 6. Artefatos esperados por PR

Cada PR de decomposicao deve incluir:

- resumo do filescope;
- tabela antes/depois de linhas ou responsabilidade removida do hotspot;
- gates executados;
- criterio de rollback;
- impacto esperado em contrato publico;
- report em `docs/qa/reports/` quando houver runtime/CSS;
- atualizacao de `docs/architecture.md` ou `docs/architecture/css-architecture.md` se a estrutura mudar.

Para entregas documentais como este plano, `npm run check:structure`, `npm run check:hygiene` e
`npm run check:all` continuam suficientes.

---

## 7. Próxima entrega recomendada

Histórico das frentes preparatórias e opções de continuidade, mantendo a regra de nunca misturar
JS e CSS no mesmo PR:

| Opção | Entrega | Por que agora |
|---|---|---|
| JS-A | Report de superfície pública `window.KCAPI` e mapa dos blocos residuais no facade | prepara extração sem mudar runtime |
| JS-I | Inventário residual automatizado da fachada `KCAPI` | **Concluído em v76.10.0**; prioriza próximas extrações pequenas |
| JS-I.1 | Delegação de external access admin para `kc-api.help.js` | **Concluído em v76.11.0**; preserva contrato público e fallback de driver |
| JS-I.2 | Remoção dos builders privados de notification fallbacks do facade | **Concluído em v76.12.0**; defaults canônicos ficam em `kc-api.notifications.js` |
| JS-I.3 | Remoção da ponte `emitPostMutation` do facade | **Concluído em v76.13.0**; eventos de freshness ficam em `kc-api.posts-write.js` |
| JS-I.4 | Dossiê automatizado do `bootstrap-driver-core` | **Concluído em v76.29.0**; cinco domínios, 15 gates e No-Go para extração runtime |
| CSS-A | Inventário de ownership de seletores de `styles.css` | **Concluído em v76.8.0**; prepara split sem alterar cascade |
| CSS-B | Baseline visual/cascade anônimo antes de split de `styles.css` | **Concluído em v76.9.0**; cria evidência antes/depois para micro-splits futuros |
| CSS-C | Micro-split da navegação admin | **Concluído em v76.14.0**; `.kc-admin-nav*` agora fica em `admin-shell.css` |
| CSS-C.2 | Micro-split do overlap admin remanescente | **Concluído em v76.15.0**; `Admin overlap` zerado em `styles.css` |
| CSS-C.3 | Micro-split do atalho global de mensagens | **Concluído em v76.17.0**; `Chat overlap` zerado em `styles.css` e atalho preservado em `kc-chat-shortcut.css` |

**Status 2026-06-12:** JS-A foi entregue em
`docs/qa/reports/report-v76-kcapi-public-surface-2026-06-12.md`, com snapshot de 107 membros
publicos de `window.KCAPI` e reforco em `tests/contract/kc-api-facade-contract.test.js`.

**Status v76.1.0:** JS-B extraiu o bloco de diagnostico de create-post para
`assets/js/api/kc-api.diagnostics.js`, preservando os 107 membros de `window.KCAPI`, aliases
globais e ordem de carregamento nos HTMLs reais.

**Status v76.2.0:** JS-C extraiu `KCSessionStore`, `KCPostFreshness` e helpers SWR para
`assets/js/api/kc-api.session.js`, com contrato explicito de storage keys, eventos, deduplicacao,
Realtime broadcast e ordem de carregamento.

**Status v76.3.0:** JS-D extraiu filtros avancados/date presets de `KCAPI.filterPosts` para
`assets/js/api/kc-api.filters.js`, preservando os 107 membros de `window.KCAPI`, paridade dos
`requestParams` locais e ordem de carregamento nos 27 carregadores reais.

**Status v76.4.0:** JS-E extraiu `MOCK_USERS`, indices e resolucao de autor legado para
`assets/js/api/kc-api.authors.js`, preservando os 107 membros de `window.KCAPI`, getters publicos
`MOCK_USERS*`, `getAuthorById()` e ordem de carregamento nos 27 carregadores reais.

**Status v76.5.0:** JS-F adicionou snapshot dedicado de `KCAPI.normalizePost` em
`tests/integration/kc-api-normalize-post-snapshot.test.js`, cobrindo aliases snake/camel,
datas efetivas, autor legado via `kc-api.authors.js`, midia/metadata e a regra de
`compra-venda` que converte acao em subcategoria de produto.

**Status v76.6.0:** JS-G extraiu `normalizePost` e `pickFirstNonEmpty` para
`assets/js/api/kc-api.posts-normalize.js`, preservando `window.KCAPI.normalizePost` como
delegacao publica, os snapshots pre-extracao e a ordem de carregamento nos 27 carregadores reais.

**Status v76.7.0:** JS-H moveu os normalizadores `normalizeUserRatingSummary`,
`normalizeUserRatingEntry`, `normalizeUserRatingState` e `normalizeUserRatingList` para
`assets/js/api/kc-api.ratings.js`, preservando os wrappers publicos em `window.KCAPI`,
reduzindo `buildRatingsDeps()` a `getActiveDriver` e ampliando a suite
`kc-api-ratings-module.test.js` para cobrir normalizacao direta.

**Status v76.9.0:** CSS-A criou o inventario de ownership de `styles.css` em
`docs/planning/v76-css-ownership-inventory.md` e CSS-B criou baseline visual/cascade anonimo em
`docs/planning/v76-css-visual-baseline.md`, com 24 capturas em 12 rotas x 2 viewports e 0
carregamentos de `future-split/`. Nenhum seletor foi movido.

**Status v76.10.0:** JS-I criou o inventario residual automatizado da fachada `KCAPI` em
`docs/planning/v76-kcapi-residual-inventory.md` e registrou evidencia em
`docs/qa/reports/report-v76-kcapi-residual-inventory-2026-06-12.md`.

**Status v76.11.0:** JS-I.1 moveu a decisão de driver de external access admin para
`assets/js/api/kc-api.help.js`, preservou `window.KCAPI` com 107 membros públicos e adicionou
`tests/contract/kc-api-external-access-contract.test.js` para cobrir delegação e fallback.

**Status v76.12.0:** JS-I.2 removeu `buildFallbackNotificationPreferences` e
`buildFallbackNotificationChannelTargets` de `assets/js/api/kc-api.client.js`; os defaults e
builders canônicos permanecem no submódulo `assets/js/api/kc-api.notifications.js`, com contratos
de facade e submódulo reforçados.

**Status v76.13.0:** JS-I.3 removeu `emitPostMutation`, `isPostMutationOk` e
`getPostMutationData` da fachada `KCAPI`; os helpers agora ficam em
`assets/js/api/kc-api.posts-write.js`, com eventos de freshness preservados e contrato público
inalterado.

**Status v76.29.0:** JS-I.4 ampliou `audit:kcapi-residual` com o dossiê automatizado do
`bootstrap-driver-core`: 12 funções / 131 linhas, cinco domínios, 15 gates e zero funções sem
mapeamento. A decisão continua sendo manter o núcleo na fachada; a única continuidade JS permitida
é criar testes comportamentais de paridade, começando por `transport-config`.

**Status v76.14.0:** CSS-C moveu o bloco `.kc-admin-nav*` para `assets/css/admin-shell.css`,
reduzindo `styles.css` para 12.161 linhas / 284.046 bytes e mantendo 24 capturas de baseline com
0 respostas falhas, 0 overflow horizontal e 0 carregamentos de `future-split/`.

**Status v76.15.0:** CSS-C.2 moveu o bucket `Admin overlap` remanescente para
`assets/css/admin-shell.css`, reduzindo `styles.css` para 12.089 linhas / 281.919 bytes,
1.741 regras / 1.962 seletores e mantendo 24 capturas de baseline com 0 respostas falhas,
0 overflow horizontal e 0 carregamentos de `future-split/`.

**Status v76.17.0:** CSS-C.3 moveu `.kc-chat-shortcut*` e `.kc-chat-mobile-fab*` para
`assets/css/kc-chat-shortcut.css`, reduzindo `styles.css` para 12.028 linhas / 280.599 bytes,
1.734 regras / 1.954 seletores e mantendo 24 capturas de baseline com 0 respostas falhas,
0 overflow horizontal, 0 carregamentos de `future-split/` e 0 diferenças de hash.

Próxima entrega recomendada: escolher uma frente única, sem misturar no mesmo PR: CSS-B autenticado
para dashboard admin real ou testes dedicados de paridade de `transport-config`. O
`bootstrap-driver-core` permanece bloqueado para extração runtime até que os 15 gates estejam
cobertos.
