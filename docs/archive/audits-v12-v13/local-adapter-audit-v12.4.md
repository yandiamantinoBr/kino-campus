# Auditoria `assets/js/adapters/local.adapter.js` - v12.4.0

**Data:** 22 de abril de 2026  
**Iteracao:** `v12.4.0` (doc-only)  
**Linha-base:** `kinocampus-V11.0-foundations` pos-`v12.3.4`  
**Objetivo desta auditoria:** mapear o estado real de `local.adapter.js` antes dos splits da trilha `_KCLA.*`, identificando footprint, contrato publico via registry, grupos naturais de extracao, consumers atuais e a sequencia recomendada para `v12.4.1`-`v12.4.8`.

---

## 1. Footprint real

| Metrica | Valor |
|---|---|
| Arquivo auditado | `assets/js/adapters/local.adapter.js` |
| Linhas totais | **1862L** |
| Tamanho no disco | **75 712 bytes (~73,9 KB)** |
| Funcoes top-level | **100** |
| Funcoes `async` | **47** |
| Export global direto | **0** |
| Ponto publico de integracao | **1** (`window.KCAPI.registerAdapter('local', driverLocal)`) |
| Superficie registrada no driver | **57 chaves** (`name` + **56** metodos callable) |
| HTMLs que carregam o asset | **22** (17 paginas raiz + 5 paginas admin) |
| Suites diretas | **1** (`tests/local-adapter.test.js`, 26 testes) |
| Suites indiretas relevantes | **5** (`kc-api-client`, `kc-api-notification-preferences-contract`, `kc-api-notifications-contract`, `anti-spam`, `post-analytics`) |
| Cobertura de suites mapeadas | **114 testes** (`26` diretos + `88` indiretos) |
| Boundary `_KCLA.*` existente | **nenhum** |

### 1.1. Contrato publico atual

O adapter local **nao expoe facade propria** como `window.LocalAdapter`. O contrato publico atual e indireto:

- o asset roda dentro de IIFE
- monta `driverLocal = Object.freeze({...})`
- registra esse objeto em `window.KCAPI` via `registerAdapter('local', driverLocal)`
- todo consumo funcional passa pelo facade `KCAPI` e pelo selector de driver

Isso reduz o numero de callsites diretos, mas endurece a exigencia principal do split: **cada metodo registrado em `driverLocal` precisa continuar existindo com o mesmo nome, assinatura e fallback seguro**, inclusive os stubs/no-op usados so para paridade de contrato com Supabase.

---

## 2. Estrutura interna atual

O arquivo nao esta organizado por comentarios de dominio; os boundaries naturais aparecem pela combinacao de storage keys, helpers dedicados e metodos exportados no driver. Hoje existem **7 grupos funcionais reais** mais um miolo de glue/registry.

| Grupo natural | Faixas principais | Papel |
|---|---|---|
| Bootstrap + fallback + glue | `L1-L45`, `L705-L810`, `L1792-L1862` | acesso a `KCAPI`, fallback de DB estatico, cursor helpers, registry `driverLocal` |
| Notifications + private targets + invites | `L46-L203`, `L1340-L1399` | preferencias, destinos privados, unread/clear/subscribe e stubs de convite |
| Ratings | `L204-L309`, `L652-L704`, `L971-L1079` | rating state, summary, interactions e gate de avaliacao |
| Posts read/feed/related + ranking | `L310-L443`, `L715-L970`, `L1229-L1249`, `L1608-L1791` | feed local, busca, cursor, related posts, posts por autor e top contributors |
| Posts write + drafts | `L588-L651`, `L1081-L1162` | prepare/identity/persistencia local, create/update/delete |
| Profile | `L444-L511`, `L1165-L1226` | perfil local, update, avatar upload |
| Saved + highlights | `L512-L587`, `L1261-L1339` | saved state, count, list e highlights |
| Help/admin | `L1404-L1605` | help requests, listagem admin, filtros e update |

### 2.1. Leitura estrutural importante

- **Notifications** ja e um dominio duplo: preferencias/targets locais no topo do arquivo e API async perto do final.
- **Ratings** nao se resume aos metodos `getUserRating*`; ele depende de caches locais, normalizadores e do gate `canRateLocalTarget(...)`.
- **Posts** estao subestimados no roadmap antigo. O dominio inclui feed cursor, related, leitura por autor, persistencia de drafts e o ranking local.
- **Help/admin** e um bloco funcional proprio, com storage, migracao legacy e pagina/filtro admin. Ele nao cabe semanticamente em notifications ou profile.
- **Ranking** compartilha colecao, metadata de post e heuristicas de autor com `posts-read`, entao e melhor boundary junto desse dominio, nao com metrics/admin.

---

## 3. Consumers e cobertura atual

### 3.1. Runtime

- `22` HTMLs carregam `assets/js/adapters/local.adapter.js` diretamente
- o adapter entra no runtime antes de `kc-api.client.js` delegar para o driver ativo
- nao existe namespace `_KCLA.*` hoje; todo o bloco continua monolitico dentro de `driverLocal`

### 3.2. Testes

O arquivo ja esta relativamente exposto em teste, mas de forma heterogenea:

- `tests/local-adapter.test.js` trava registro do driver, shape congelado, subset obrigatorio de metodos e algumas trilhas modernas (perfil, saved, notifications, help)
- `tests/kc-api-client.test.js` cobre dispatch/fallback do facade para o driver local
- `tests/kc-api-notification-preferences-contract.test.js` e `tests/kc-api-notifications-contract.test.js` travam contrato de notificacoes
- `tests/anti-spam.test.js` e `tests/post-analytics.test.js` exercitam partes do contrato por via indireta

O gap principal nao e ausencia total de testes, e sim **ausencia de suites por dominio do adapter local**, o que torna arriscado mover grupos grandes sem antes congelar boundaries menores.

---

## 4. Sequencia recomendada para `v12.4.x`

O roadmap original (`v12.4.1`-`v12.4.6`) estava subdimensionado: ele nao reservava espaco explicito para `help/admin`, nem para `ranking`, e tratava `posts` como um unico bloco pequeno demais. A sequencia abaixo recalibra a trilha para **7 splits funcionais + gate**.

| Iteracao | Dominio recomendado | Entrega alvo | Motivo |
|---|---|---|---|
| `v12.4.1` | notifications + private channel targets + invites | `local.notifications.adapter.js` -> `window._KCLA.notifications` | bloco coeso de storage keys + APIs async + stubs de convite |
| `v12.4.2` | ratings | `local.ratings.adapter.js` -> `window._KCLA.ratings` | cache/localStorage e gate de avaliacao formam boundary proprio |
| `v12.4.3` | saved + highlights | `local.saved.adapter.js` -> `window._KCLA.saved` | ja espelha o recorte feito em `KCAPI`/`KCSA` |
| `v12.4.4` | posts read/feed/related + ranking | `local.posts-read.adapter.js` -> `window._KCLA.postsRead` | feed cursor, related e top contributors compartilham a mesma colecao e metadata |
| `v12.4.5` | posts write + drafts | `local.posts-write.adapter.js` -> `window._KCLA.postsWrite` | persistencia e mutacao local ficam isoladas do feed/read |
| `v12.4.6` | profile | `local.profile.adapter.js` -> `window._KCLA.profile` | perfil, patch e avatar upload cabem em modulo pequeno e estavel |
| `v12.4.7` | help/admin | `local.help.adapter.js` -> `window._KCLA.help` | help requests/admin list/update formam dominio proprio e estavam ausentes do plano antigo |
| `v12.4.8` | gate formal `<500L` | docs + hygiene `_KCLA.*` | fecha a trilha com `local.adapter.js` residual abaixo do alvo |

### 4.1. Estimativa de residual

Mantendo no core apenas:

- glue de bootstrap/fallback
- cursor/base64 helpers realmente compartilhados
- builders de deps/getters de submodulo
- registry final `driverLocal`

o residual de `local.adapter.js` deve cair para a faixa de **350L-480L**, o que recoloca o hotspot no mesmo piso estrutural atingido por `supabase.adapter.js` (`420L` pos-`v11.30.9`).

---

## 5. Riscos principais

| Risco | Impacto | Mitigacao recomendada |
|---|---|---|
| Drift entre driver local e `supabase.adapter.js` | Alto | criar suite de paridade por dominio antes dos splits maiores |
| Stubs/no-op mudarem shape de retorno | Alto | preservar fallbacks exatamente no boundary publico do driver |
| Migracao de payload legacy de help request se perder no split | Medio | manter `migrateLegacyHelpPayload` e `normalizeHelpPayload` no mesmo submodulo `help` |
| Ranking ser isolado longe demais do feed local | Medio | manter ranking junto de `postsRead`, nao em modulo admin separado |
| `localStorage` ficar fragmentado entre modulos | Medio | centralizar storage helpers por dominio e evitar writer duplicado |

---

## 6. Conclusao

`assets/js/adapters/local.adapter.js` ja nao e um adapter "pequeno de fallback". Hoje ele e um **segundo backend completo de desenvolvimento**, com:

- feed/read/write
- ratings
- perfil
- saved/highlights
- notifications + targets privados
- help requests admin
- ranking local

Por isso, a trilha `_KCLA.*` precisa espelhar a granularidade ja adotada em `_KCAPI.*` e `_KCSA.*`. A recomendacao desta auditoria e expandir o plano de `v12.4.1`-`v12.4.6` para `v12.4.1`-`v12.4.8`, sem tocar em runtime nesta fase.
