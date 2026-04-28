# Auditoria `assets/js/controllers/profile.controller.js` - v12.5.0

**Data:** 23 de abril de 2026  
**Iteracao:** `v12.5.0` (doc-only)  
**Linha-base:** `kinocampus-V11.0-foundations` pos-`v12.4.8`  
**Objetivo desta auditoria:** mapear o estado real de `profile.controller.js` antes dos splits da trilha `_KCPR.*`, identificar footprint, contratos externos, boundaries ja compartilhados, grupos naturais de extracao e a sequencia recomendada para `v12.5.1`-`v12.5.5`.

---

## 1. Footprint real

| Metrica | Valor |
|---|---|
| Arquivo auditado | `assets/js/controllers/profile.controller.js` |
| Linhas totais | **1463L** |
| Tamanho no disco | **56 497 bytes (~55,2 KB)** |
| Funcoes top-level | **67** |
| Funcoes `async` | **14** |
| HTML consumidor direto | **1** (`profile.html`) |
| Export publico direto | **1** (`window.KCProfileRefresh = refreshProfilePage`) |
| Metodos `KCAPI` usados | **16** |
| Boundary compartilhado previo | **1** (`assets/js/account-profile.shared.js`, **962L**, **45** funcoes, **10** testes) |
| Exports do helper compartilhado consumidos pelo controller | **5** (`normalizeNextPath`, `formatProfileValue`, `getVisibleSocialLinks`, `buildDefaultAvatarDataUrl`, `isOnboardingComplete`) |
| Suites diretas do controller | **2** (`tests/profile-swr.test.js`, `tests/profile-my-posts-detail-links.test.js`) |
| Suites relacionadas | **2** (`tests/account-profile.shared.test.js`, `tests/kc-api-notification-preferences-contract.test.js`) |
| Cobertura de suites mapeadas | **25 testes** (`9` diretos + `16` relacionados) |
| Boundary `_KCPR.*` existente | **nenhum** |

### 1.1. Contrato publico atual

O controller de perfil nao expoe um facade congelado como `window.KCUtils` ou `window.KCAPI`. O contrato publico atual e mais estreito:

- o asset roda dentro de IIFE
- expoe apenas `window.KCProfileRefresh`
- registra `releaseAvatarPreview` no `beforeunload`
- inicializa via `DOMContentLoaded -> init`
- depende fortemente de `window.KCAccountProfileUtils`, `window.KCAPI`, `window.KCSupabase`, `window.KCSessionStore`, `window.KCPullToRefresh`, `window.KCRanking`, `window.KCUtils` e `window.renderCommentMarkdownInline`

Isso reduz a superficie publica direta, mas concentra muito acoplamento de runtime dentro de um unico arquivo. Como o consumer direto e apenas `profile.html`, a trilha `_KCPR.*` nao precisa propagar scripts para 22 paginas; o foco real fica em **preservar `profile.html`, `window.KCProfileRefresh` e o wiring de boot da pagina**.

### 1.2. Drift documental corrigido

O roadmap da v12 ja apontava corretamente o hotspot "profile controller", mas uma linha residual do relatorio ainda o referenciava como `assets/js/profile.controller.js`. O arquivo real auditado nesta iteracao vive em:

- `assets/js/controllers/profile.controller.js`

Essa correcao precisa permanecer daqui para frente para evitar drift entre auditoria, roadmap e implementacoes futuras.

---

## 2. Boundary compartilhado ja existente

O profile nao parte de um monolito puro. Ja existe um helper compartilhado anterior:

- `assets/js/account-profile.shared.js`
- **962L** e **36 222 bytes**
- **45** funcoes top-level
- **10** testes dedicados em `tests/account-profile.shared.test.js`
- carregado por **7** HTMLs: `_product.html`, `account-setup.html`, `ajuda.html`, `auth-callback.html`, `my-posts.html`, `profile.html`, `settings.html`

Hoje o controller consome deste helper:

- `normalizeNextPath`
- `formatProfileValue`
- `getVisibleSocialLinks`
- `buildDefaultAvatarDataUrl`
- `isOnboardingComplete`

Leitura estrutural importante:

- o helper compartilhado ja absorveu normalizacao de links, labels de opcoes, onboarding, avatares default e preferencias de contato/notificacao
- a trilha `_KCPR.*` **nao deve** duplicar esses utilitarios
- o primeiro split do controller deve partir do principio de que `account-profile.shared.js` continua sendo pre-req formal do perfil

---

## 3. Estrutura interna atual

O arquivo se organiza em **5 grupos naturais**.

| Grupo natural | Faixas principais | Papel |
|---|---|---|
| Base + cache + formatacao + identity helpers | `L1-L396` | estado, SWR/KCSessionStore, escape, handles, hrefs, badges, helpers de render e toggles basicos |
| Header + summary + owner/public rendering | `L397-L556` | `renderHeader`, pills/meta/social links, setup hints, summary de ratings e sincronizacao do formulario |
| Collections + tabs + loaders | `L557-L1121` | stats, badge count, posts, comments, ratings, saved, activities e troca de abas |
| Editor + avatar submit | `L1123-L1216` | pending state, submit do perfil, upload de avatar, bind de botoes de edicao |
| Lifecycle + access + refresh + boot | `L1217-L1463` | `loadProfile`, gate publico/restrito, binds, pull-to-refresh, refresh geral, ranking badges e `init` |

### 3.1. Funcoes-chave por bloco

| Funcao | Linha | Papel |
|---|---|---|
| `renderHeader()` | L397 | maior hub de render da pagina |
| `loadStats()` | L557 | consolida cards e resumo de ratings |
| `loadPosts()` | L662 | feed de posts do proprio perfil |
| `loadComments()` | L809 | comentarios do perfil com enrich de post |
| `loadRatings()` | L902 | pagina/summary de avaliacoes |
| `loadSaved()` | L985 | salvos ou destaques do perfil |
| `loadActivities()` | L1021 | timeline agregada de posts + comentarios |
| `handleProfileSubmit()` | L1131 | update do perfil + upload de avatar |
| `loadProfile()` | L1217 | gate principal de leitura com SWR |
| `refreshProfilePage()` | L1338 | refresh operacional da pagina |
| `init()` | L1384 | boot completo do controller |

### 3.2. Leitura estrutural importante

- `renderHeader()` sozinho concentra muita responsabilidade: avatar, name/handle, member since, bio, social links, setup hints, labels de tabs e summary de ratings.
- O bloco de collections nao e apenas "posts". Ele agrega **5 superficies**: posts, comments, ratings, saved e activities, todas com pagina/empty/load-more e dependencia em `buildPostDetailHref` / `fmtRelative`.
- `loadProfile()` mistura cache SWR, leitura de perfil proprio/publico, fallback de `syncProfile()`, enrich extra via Supabase e side effect de `renderHeader()`.
- O editor (`handleProfileSubmit`, `handleAvatarChange`, `bindProfileEditing`) e pequeno em linhas, mas toca diretamente `window.KCAPI.uploadProfileAvatar`, `window.KCAPI.updateMyProfile`, `state.avatarFile` e o fluxo de navegacao para `account-setup.html` / `settings.html`.
- O boot inclui tambem um fan-out nao coberto por suite direta: decoracao de ranking no avatar via `window.KCAPI.getTopContributors(...).then(...)`.

---

## 4. Consumers e cobertura atual

### 4.1. Runtime

- `profile.html` e o unico HTML que carrega `assets/js/controllers/profile.controller.js`
- a cadeia relevante atual em `profile.html` e:
  - `assets/js/account-profile.shared.js`
  - `assets/js/kc-comments.js`
  - `assets/js/kc-profiles.client.js`
  - `assets/js/kc-pull-to-refresh.js`
  - `assets/js/kc-public-shell.js`
  - `assets/js/kc-auth.ui.js`
  - `assets/js/kc-notifications.js`
  - `assets/js/kc-theme.js`
  - `assets/js/kc-ranking.js`
  - `assets/js/controllers/profile.controller.js`
- isso facilita a trilha `_KCPR.*`: a propagacao inicial de novos submodulos deve acontecer apenas em `profile.html`

### 4.2. Testes

Existe hoje uma cobertura parcial, mas ela ainda e indireta para o controller:

- `tests/profile-swr.test.js` trava o contrato de cache SWR do controller (**7 testes**)
- `tests/profile-my-posts-detail-links.test.js` trava o uso do helper canonico `_product.html?id=...` (**2 testes**)
- `tests/account-profile.shared.test.js` cobre o helper compartilhado usado pelo perfil (**10 testes**)
- `tests/kc-api-notification-preferences-contract.test.js` carrega `account-profile.shared.js` para travar defaults/canais privados de notificacao consumidos na superficie de perfil/configuracoes (**6 testes**)

Gap principal:

- nao existe suite direta em jsdom carregando o controller de perfil e travando `window.KCProfileRefresh`, `init()`, `switchTab()`, o fluxo de edicao ou o wiring completo da pagina
- os futuros splits precisam abrir cobertura por submodulo, senao `profile.html` vira o unico contrato real da trilha

---

## 5. Sequencia recomendada para `v12.5.x`

O roadmap antigo (`rendering/format`, `ratings summary`, `avatar/media`, gate) estava **subdimensionado**. Ele ignorava o maior bloco do arquivo hoje: collections/tabs/activities e todo o lifecycle de acesso/public view/refresh/init.

A sequencia abaixo recalibra a trilha para **4 splits funcionais + gate**.

| Iteracao | Dominio recomendado | Entrega alvo | Motivo |
|---|---|---|---|
| `v12.5.1` | presentation + header | `assets/js/controllers/profile.presentation.js` -> `window._KCPR.presentation` | maior bloco puro de render/formatacao e ponto de reuso de todas as tabs |
| `v12.5.2` | collections + tabs | `assets/js/controllers/profile.collections.js` -> `window._KCPR.collections` | posts, comments, saved e activities compartilham pagina, empty states, links canonicos e datas relativas |
| `v12.5.3` | ratings | `assets/js/controllers/profile.ratings.js` -> `window._KCPR.ratings` | summary/list/stars formam boundary proprio, pequeno e facil de congelar |
| `v12.5.4` | flow (editor + lifecycle) | `assets/js/controllers/profile.flow.js` -> `window._KCPR.flow` | junta mutacao, refresh, gates de acesso/restricao, boot e ranking badges sem criar modulo "avatar" pequeno demais |
| `v12.5.5` | gate formal `<600L` | docs + hygiene `_KCPR.*` em `profile.html` | fecha a trilha com controller residual abaixo do alvo e ordem canonica de scripts |

### 5.1. Estimativa de residual

Mantendo no core apenas:

- bootstrap minimo
- getters dos submodulos `_KCPR.*`
- builders de dependencias/estado realmente compartilhados
- export publico `window.KCProfileRefresh`
- wiring final de eventos quando indispensavel

o residual de `profile.controller.js` deve cair para a faixa de **420L-560L**, suficiente para formalizar o gate `<600L` na `v12.5.5`.

### 5.2. Naming recomendado

O namespace sugerido para a trilha e:

- `window._KCPR.presentation`
- `window._KCPR.collections`
- `window._KCPR.ratings`
- `window._KCPR.flow`

Esse prefixo evita colisao semantica com:

- `window.KCAccountProfileUtils` (helper cross-page ja existente)
- `window.KCProfiles` / `kc-profiles.client.js` (facade de dados de perfil)

---

## 6. Riscos principais

| Risco | Impacto | Mitigacao recomendada |
|---|---|---|
| `renderHeader()` ser quebrado em mais de um submodulo e perder consistencia de estado | Alto | extrair presentation/header em uma unica rodada |
| tabs e collections ficarem repartidas demais | Alto | manter posts/comments/saved/activities no mesmo boundary `collections` |
| `loadProfile()` perder paridade entre perfil proprio, perfil publico e perfil restrito | Alto | manter esse fluxo junto de `refreshProfilePage()` e `init()` no boundary `flow` |
| drift entre `_KCPR.*` e `account-profile.shared.js` | Medio | tratar `KCAccountProfileUtils` como dependencia formal, nao como codigo a reabsorver |
| ranking badge decoration permanecer sem cobertura | Medio | abrir testes do boundary `flow` ja na primeira rodada que tocar `init()` |

---

## 7. Conclusao

`assets/js/controllers/profile.controller.js` nao e apenas um "controller de cabecalho". Hoje ele concentra:

- cache SWR de perfil
- render owner/public do header
- posts, comments, ratings, saved e activities
- mutacao de perfil + avatar
- gates de acesso/restricao
- refresh operacional + pull-to-refresh
- decoracao de ranking no avatar

Por isso, a trilha do profile precisa subir para o mesmo nivel de granularidade arquitetural ja adotado em `_KCU.*`, `_KCAD.*` e `_KCLA.*`. A recomendacao desta auditoria e expandir o plano antigo de `v12.5.1`-`v12.5.4` para `v12.5.1`-`v12.5.5`, sem tocar em runtime nesta fase.
