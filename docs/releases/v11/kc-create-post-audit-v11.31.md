# Auditoria do Hotspot `kc-create-post.js` — v11.31.0

**Data:** 17 de abril de 2026  
**Escopo:** `assets/js/kc-create-post.js`  
**Objetivo:** mapear estrutura, acoplamentos, riscos e estratégia segura para a próxima rodada de decomposição incremental após o fechamento da trilha `v11.30.x`.

---

## 1. Métricas

| Campo | Valor |
|---|---|
| Arquivo | `assets/js/kc-create-post.js` |
| Linhas | `2610` |
| Tamanho | `114470` bytes (~114 KB) |
| Funções top-level | `55` |
| Padrão estrutural | **não** é IIFE; executa em escopo global |
| `'use strict'` | ausente |
| Exports públicos | `window.kcOpenCreatePostModal`, `window.kcCloseCreatePostModal`, `window.kcOpenEditPostModal`, `window.kcOpenCreatePostModalPrefilled` |
| HTMLs da base principal que carregam o arquivo | `12` |

### HTMLs impactados na base principal

- `_product.html`
- `achados-perdidos.html`
- `caronas-feed.html`
- `compra-venda-feed.html`
- `create-post.html`
- `eventos.html`
- `index.html`
- `moradia.html`
- `my-posts.html`
- `ods.html`
- `oportunidades.html`
- `search-results.html`

**Observação operacional:** buscas recursivas no workspace também encontram cópias em `.claude/worktrees/`; essas worktrees devem ser ignoradas nas auditorias e mudanças reais do repositório principal.

---

## 2. Relação com arquivos adjacentes

### `assets/js/controllers/create-post.controller.js`

Esse arquivo **não** é o hotspot a ser splitado agora. Ele atua como wrapper diagnóstico do `KCAPI.createPost(...)`:

- instala `window.KCActions.createPost`
- preserva o `KCAPI.createPost` original
- amplia logging de falhas do driver Supabase

Ele já possui cobertura dedicada em:

- `tests/create-post.controller.test.js`

### Cobertura atual do hotspot principal

`kc-create-post.js` ainda tem cobertura limitada:

- `tests/kc-create-post-active-fields.test.js`
  - cobre gating de campos ativos
  - cobre apenas uma parte da montagem do payload

**Conclusão:** antes de qualquer extração estrutural, falta uma suíte estática de contrato mais ampla para o arquivo principal.

---

## 3. Mapa de seções internas

| Seção | Linhas aprox. | Responsabilidade |
|---|---|---|
| Preâmbulo e helpers inline | `1–90` | `isProductionRuntime`, `_esc`, toolbar markdown e preview da descrição |
| Constantes e schema por módulo | `95–260` | `KC_CREATE_MODAL_ID`, `KC_POST_VISIBILITY_OPTIONS`, `KC_CREATE_SCHEMA` dos 6 módulos |
| Estado singleton | `262–307` | `kcCreateState`, `kcLastFocus`, normalizadores simples |
| Bootstrap do modal e listeners | `308–581` | `kcEnsureCreateModal`, criação do overlay, listeners de click/change/drag/drop/ESC |
| Captura de valores e gating de campos | `582–644` | `kcCaptureCreateValues`, `kcGetActiveCreateFieldNames`, readers de valor ativo |
| Resolvers e normalizadores de domínio | `645–1019` | oportunidade, moradia, caronas, achados/perdidos, sugestões e históricos |
| Pipeline de imagens | `1020–1235` | `KC_CREATE_MAX_IMAGES`, leitura/compressão, ordem da capa, HTML da seção de imagens |
| Geração dinâmica dos campos | `1236–1399` | `kcBuildFieldsForModule(...)` |
| Render do modal | `1400–1661` | `kcRenderCreateModal(...)`, chips, campos, preview, visibilidade e submit |
| Fluxo de abertura/fechamento | `1662–1846` | `kcOpenCreatePostModal`, `kcCloseCreatePostModal`, `kcOpenEditPostModal` |
| Submit e persistência | `1847–2553` | validação, montagem de payload, create/edit, duplicate check, audit log, redirects |
| Bootstrap global e exports | `2554–2610` | `kcInitCreatePostTriggers`, autopen em `create-post.html`, globals públicos |

---

## 4. Acoplamentos críticos

### 4.1. Dependências globais diretas

O arquivo depende diretamente de vários símbolos globais:

- `KCUtils`
- `KCAPI`
- `KCActions`
- `KCSupabase`
- `KCOverlayLock`
- `showToast`
- `kcUserPosts`
- `kcModulePage`
- `kcGetModuloFilterForPage`
- `isSupabaseRuntime`
- `window.confirm`

### 4.2. Side channels globais

O arquivo também lê/escreve estado auxiliar fora do próprio `kcCreateState`:

- `window.__KC_OPPORTUNITY_AREA_HISTORY`
- `window.__KC_HOUSING_REGION_HISTORY`
- `window.__KC_HOUSING_FEATURE_HISTORY`
- `window.__KC_LOST_FOUND_LOCATION_HISTORY`

Esses side channels aumentam o risco de drift entre:

- criação nova
- edição
- sugestões automáticas
- histórico local do usuário

### 4.3. Estado compartilhado interno

Grande parte das funções depende implicitamente de:

- `kcCreateState.moduleKey`
- `kcCreateState.selections`
- `kcCreateState.values`
- `kcCreateState.images`
- `kcCreateState.coverImageId`
- `kcCreateState.editMode`
- `kcCreateState.editPostId`
- `kcCreateState.editCallback`

Isso faz com que **render**, **submit**, **edição** e **mídia** sejam fortemente acoplados.

---

## 5. Riscos técnicos do hotspot

### R1. Arquivo fora do padrão arquitetural dominante

A base atual privilegia:

- IIFEs
- namespaces controlados em `window._...`
- submódulos pequenos

`kc-create-post.js` foge disso:

- não é IIFE
- não usa `'use strict'`
- instala listeners globais diretamente
- expõe funções públicas diretamente em `window`

**Risco:** qualquer split precipitado pode introduzir problema de ordem de carregamento nos 12 HTMLs afetados.

### R2. Mistura de responsabilidades demais em um único arquivo

O arquivo acumula, ao mesmo tempo:

- schema estático por módulo
- resolução de domínio
- UI do modal
- preview markdown
- drag/drop e compressão de imagem
- create
- edit
- duplicate check
- audit log
- redirect por módulo
- bootstrap global

**Risco:** alterações locais têm alta chance de regressão transversal.

### R3. Relação create/edit no mesmo state machine

O mesmo `kcCreateState` governa:

- criação nova
- edição
- imagens existentes
- callback pós-edição

**Risco:** extrair apenas metade do fluxo sem um contrato explícito tende a quebrar o modo de edição ou o reset do modal.

### R4. Render baseado em `innerHTML` volumoso

O render do modal usa strings HTML extensas.

Pontos positivos:

- valores variáveis críticos passam por `_esc(...)`

Pontos de atenção:

- notices de schema são inseridas como HTML intencional
- qualquer extração futura precisa preservar essa distinção entre conteúdo seguro estático e valor dinâmico escapado

### R5. Impacto transversal de carregamento

O arquivo é carregado em `12` HTMLs principais.

**Risco:** mudar a ordem dos scripts ou o bootstrap do modal sem contrato pode quebrar:

- botões `Criar publicação`
- autopen de `create-post.html`
- fluxo `Criar parecido` vindo do detalhe do produto
- edição de posts

---

## 6. Decisão de arquitetura para a próxima rodada

### Decisão principal

**Não converter o arquivo inteiro para IIFE de uma vez.**

Essa mudança seria arquiteturalmente desejável, mas é arriscada demais como primeiro passo porque:

- toca 12 HTMLs
- exige redefinir bootstrap global
- pode quebrar exports públicos usados hoje

### Estratégia segura recomendada

Introduzir primeiro um namespace interno incremental:

```javascript
window._KCCreatePost = window._KCCreatePost || {};
```

e manter **intactos** os exports públicos já consumidos hoje:

- `window.kcOpenCreatePostModal`
- `window.kcCloseCreatePostModal`
- `window.kcOpenEditPostModal`
- `window.kcOpenCreatePostModalPrefilled`

Em outras palavras:

- o namespace interno entra para permitir split gradual
- a API pública atual não muda no início da trilha

---

## 7. Estratégia de decomposição recomendada (`v11.31.x`)

### `v11.31.0` — auditoria

Entregue nesta fase.

### `v11.31.1` — contrato e safety net antes do split

**Tipo:** testes + hardening mínimo  
**Objetivo:** criar uma suíte estática mais ampla para `kc-create-post.js`

Cobertura mínima sugerida:

- globals exportados
- presença do schema base
- bootstrap `DOMContentLoaded`
- `kcEnsureCreateModal`
- `kcRenderCreateModal`
- `kcHandleCreateSubmit`
- `kcOpenEditPostModal`
- integrações críticas com `KCAPI`, `KCActions`, `KCOverlayLock`, `KCSupabase`

**Motivo:** hoje a cobertura real do hotspot é insuficiente para abrir extração com segurança.

### `v11.31.2` — extração do schema e metadados estáticos

**Tipo:** refactor baixo risco  
**Destino sugerido:** `assets/js/kc-create-post.schema.js`

Extrair:

- `KC_POST_VISIBILITY_OPTIONS`
- `KC_CREATE_SCHEMA`
- helpers estáticos de label/options que não dependem do DOM

**Motivo:** é a parte mais estável e com menor acoplamento à UI runtime.

### `v11.31.3` — extração do pipeline de imagens

**Tipo:** refactor médio  
**Destino sugerido:** `assets/js/kc-create-post.media.js`

Extrair:

- `KC_CREATE_MAX_IMAGES`
- leitura/compressão de imagem
- ordenação da capa
- seção HTML de imagens

**Motivo:** é um grupo relativamente isolável, embora ainda dependa de `kcCreateState`.

### `v11.31.4` — extração dos resolvers de domínio

**Tipo:** refactor médio  
**Destino sugerido:** `assets/js/kc-create-post.domain.js`

Extrair:

- resolvers de oportunidade
- resolvers de moradia
- resolvers de caronas
- resolvers de achados/perdidos
- históricos auxiliares

**Motivo:** reduzir o peso da camada de submit e render.

### `v11.31.5` — extração do render modal

**Tipo:** refactor alto  
**Destino sugerido:** `assets/js/kc-create-post.modal.js`

Extrair:

- `kcEnsureCreateModal`
- `kcBuildFieldsForModule`
- `kcRenderCreateModal`

**Pré-requisito:** contratos estáticos fortes já existentes.

### `v11.31.6` — extração do submit/edit

**Tipo:** refactor alto  
**Destino sugerido:** `assets/js/kc-create-post.submit.js`

Extrair:

- `kcOpenEditPostModal`
- `kcHandleCreateSubmit`
- helpers de payload e persistência

**Motivo:** é a parte mais acoplada e deve ficar por último.

### `v11.31.7` — core residual e bootstrap final

**Tipo:** hardening final  
**Objetivo:** deixar `kc-create-post.js` como orquestrador fino

Mantendo:

- exports públicos intactos
- bootstrap estável
- ordem de scripts controlada nos 12 HTMLs

---

## 8. Invariantes para a trilha `v11.31.x`

1. Os 4 globals públicos devem continuar disponíveis com os mesmos nomes.
2. O botão e os gatilhos de criação devem continuar funcionando em todos os 12 HTMLs.
3. `create-post.controller.js` deve permanecer separado; não misturar o wrapper diagnóstico com o split principal.
4. `kcOpenEditPostModal(...)` não pode regredir.
5. O submit Supabase/local precisa preservar:
   - duplicate check
   - gating de login
   - audit log
   - redirects por módulo
6. Toda interpolação dinâmica em HTML precisa continuar escapada com `_esc(...)` ou equivalente.
7. O split não deve começar pelo submit/edit.

---

## 9. Recomendação final

O próximo passo correto é:

**`v11.31.1` — criar a suíte de contrato ampliada para `kc-create-post.js` antes de qualquer extração.**

Justificativa:

- o hotspot é grande demais para abrir split sem safety net melhor
- ele foge do padrão arquitetural atual
- impacta 12 HTMLs
- o fluxo create/edit é sensível e central para a plataforma

Em termos práticos:

- primeiro blindar
- depois extrair o schema
- depois extrair mídia/domínio
- deixar modal e submit por último

---

## 10. Artefato de continuidade

Para continuidade fora do Codex, usar como base:

- `docs/handoff-claude-code-v11.31.0.md`

Esse handoff já inclui:

- estado consolidado da base
- baseline de testes
- workflow obrigatório
- particularidades de Vercel/Supabase
- riscos específicos de `kc-create-post.js`
- sequência recomendada de `v11.31.1+`
