# Handoff Claude Code — KinoCampus após `v11.31.2`

Este arquivo substitui o handoff anterior focado em `v11.31.0` e serve como prompt operacional de continuidade após a primeira extração estrutural segura do hotspot `kc-create-post.js`.

---

## Status fechado da `v11.31.2`

- branch principal: `kinocampus-V11.0-foundations`
- iteração funcional: `v11.31.2`
- PR funcional: `#361`
- merge squash funcional: `1c61409`
- preview da branch validado: `dpl_DjP2RrjNXaMLHARfYtcwLPbCFnLs`
- deployment pós-merge da base validado: `dpl_7Pim3BYD1wr1331nMxmNUhAo3Chf`
- produção promovida e validada: `dpl_94g4rQUquggV8S8swhTxtYapDypt`
- smoke público: [www.kinocampus.com.br](https://www.kinocampus.com.br/?ts=1776450353) → HTTP `200`

O que a `v11.31.2` entregou:

- extração do schema estático de `assets/js/kc-create-post.js` para `assets/js/kc-create-post.schema.js`
- namespace novo `window._KCCreatePost.schema`
- carregamento do schema asset antes do runtime principal em `12` HTMLs
- guard defensivo no core para indisponibilidade do schema
- suíte estática nova travando asset, módulos e ordem de carregamento

O que a `v11.31.2` não fez:

- não abriu split de mídia/imagens
- não tocou render pesado do modal
- não tocou submit/create/edit pipeline
- não converteu `kc-create-post.js` inteiro para IIFE
- não mudou Supabase, Vercel Functions, Edge Functions ou SQL

Próxima ação recomendada para a próxima IA:

- começar pela `v11.31.3`
- focar só no grupo de mídia/imagens
- não misturar essa fase com resolvers, modal, submit ou cleanup cosmético

---

## Prompt sugerido para Claude Code

Atue como um engenheiro de software sênior responsável por continuar a evolução do projeto **KinoCampus** com segurança máxima, preservando contratos públicos, layout, comportamento consolidado e o fluxo operacional já adotado.

### 1. Contexto do projeto

- **Nome:** KinoCampus
- **Contexto:** plataforma universitária da UFG para economia circular, comunidade e compartilhamento de recursos
- **Stack:** HTML5 + CSS3 + Vanilla JS sem bundler/framework
- **Padrão dominante:** globals em `window.*` e IIFEs nos arquivos mais recentes
- **Backend:** Supabase
- **Hosting:** Vercel
- **Branch principal:** `kinocampus-V11.0-foundations`
- **Produção:** [www.kinocampus.com.br](https://www.kinocampus.com.br)

### 2. Baseline obrigatória

- **Jest:** `82/82` suites
- **Testes:** `1335/1335`
- **Hygiene:** `8.6.0`
- **Última PR funcional encerrada:** `#361`
- **Último deployment de produção validado:** `dpl_94g4rQUquggV8S8swhTxtYapDypt`

Comandos que precisam continuar verdes:

```bash
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

### 3. Leia antes de agir

- `C:/Users/yan1n/Documents/GitHub/kino-campus/README.md`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/RELATORIO-KINOCAMPUS-V11.md`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/docs/kc-create-post-audit-v11.31.md`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/docs/module-schemas.md`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/docs/handoff-claude-code-v11.31.2.md`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-create-post.schema.js`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-create-post.js`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/tests/kc-create-post-contract.test.js`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/tests/kc-create-post-schema.test.js`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/tests/kc-create-post-active-fields.test.js`
- `C:/Users/yan1n/Documents/GitHub/kino-campus/tests/create-post.controller.test.js`

### 4. Estado consolidado do hotspot atual

#### `assets/js/kc-create-post.js`

- pós-`v11.31.2`: `2239L`
- ainda **não** é IIFE
- ainda **não** declara `'use strict'`
- continua carregado por `12` HTMLs principais
- mantém os 4 globals públicos intactos:
  - `window.kcOpenCreatePostModal`
  - `window.kcCloseCreatePostModal`
  - `window.kcOpenEditPostModal`
  - `window.kcOpenCreatePostModalPrefilled`

#### `assets/js/kc-create-post.schema.js`

- novo asset de `175L`
- registra `window._KCCreatePost.schema`
- concentra:
  - `modalId`
  - `visibilityOptions`
  - `modules`

#### Carregamento já migrado

Os `12` HTMLs abaixo já carregam `assets/js/kc-create-post.schema.js` **antes** de `assets/js/kc-create-post.js`:

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

### 5. O que a `v11.31.1` e `v11.31.2` já blindaram

- shape global atual do arquivo principal
- 4 exports públicos
- schema base dos `6` módulos
- categoria `Ingressos`
- modal bootstrap
- `kcEnsureCreateModal`
- `kcRenderCreateModal`
- `kcHandleCreateSubmit`
- side channels `window.__KC_*`
- wiring de `DOMContentLoaded`
- consumo do namespace `window._KCCreatePost.schema`
- ordem de carregamento dos `12` HTMLs

### 6. Próxima fase correta

Execute apenas a **`v11.31.3`**.

Objetivo:

- extrair o grupo de **mídia/imagens** de `kc-create-post.js`
- isolar compressão, leitura, capa, render de imagens e drag/drop
- manter create/edit, schema, resolvers e submit intactos

### 7. O que não fazer na `v11.31.3`

1. Não converter o arquivo inteiro para IIFE.
2. Não mexer nos 4 globals públicos.
3. Não abrir split de submit/edit.
4. Não abrir split de resolvers de domínio ainda.
5. Não misturar mudança cosmética, copy ou CSS transversal.
6. Não mexer em Supabase, Edge Functions ou SQL nessa fase.

### 8. Alvo técnico recomendado da `v11.31.3`

Mapeie e extraia apenas as responsabilidades de mídia/imagens para algo como:

- `C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-create-post.media.js`

O submódulo precisa cobrir o que hoje concentra:

- limites e constantes de imagem
- leitura/local preview
- compressão
- ordenação/capa
- remoção
- drag/drop
- HTML da seção de imagens

Preferência arquitetural:

- IIFE nova
- namespace `window._KCCreatePost.media`
- core atual apenas delegando com guard defensivo

### 9. Critério de aceite da `v11.31.3`

- baseline >= `83/83` suites
- nenhum carregador HTML removido indevidamente
- `kc-create-post.js` fica menor sem perder bootstrap global
- `kc-create-post.schema.js` permanece intocado, salvo ajuste estritamente necessário
- README e relatório atualizados
- preview validado no Vercel
- promote da base concluído
- smoke HTTP `200` em produção

### 10. Workflow obrigatório

```bash
git checkout kinocampus-V11.0-foundations
git pull
git checkout -b codex/v11-31-3-kc-create-post-media-split
```

Depois de implementar:

```bash
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

Depois:

```bash
git add ...
git commit -m "feat: split kc-create-post media helpers (v11.31.3)"
git push -u origin codex/v11-31-3-kc-create-post-media-split
gh pr create --base kinocampus-V11.0-foundations
gh pr checks <PR> --watch
gh pr merge <PR> --squash --delete-branch
git checkout kinocampus-V11.0-foundations
git pull
```

Vercel:

```bash
vercel ls kino-campus --scope yannakamurabrs-projects
vercel inspect <deployment/url> --scope yannakamurabrs-projects
vercel promote <deployment-id> --scope yannakamurabrs-projects --yes
curl.exe --ssl-no-revoke -L "https://www.kinocampus.com.br/?ts=<timestamp>"
```

### 11. Resultado esperado

- `v11.31.3` concluída
- mídia/imagens extraídas sem regressão
- base pronta para `v11.31.4` (resolvers de domínio)
