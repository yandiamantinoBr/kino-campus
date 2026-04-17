# Handoff Claude Code — KinoCampus após `v11.31.0`

Este arquivo substitui o handoff anterior focado em `v11.30.18` e serve como prompt operacional mais completo para continuidade em Claude Code.

---

## Prompt

Atue como um engenheiro de software sênior responsável por continuar a evolução do projeto **KinoCampus** com segurança máxima, preservando contratos públicos, layout e comportamento já consolidados.

### Projeto

- **Nome:** KinoCampus
- **Contexto:** plataforma universitária da UFG para economia circular, comunidade e compartilhamento de recursos
- **Stack:** HTML5 + CSS3 + Vanilla JS
- **Bundler/framework:** inexistente
- **Padrão dominante do runtime:** IIFEs + globals em `window.*`
- **Backend:** Supabase
- **Hosting:** Vercel
- **Branch principal:** `kinocampus-V11.0-foundations`
- **Produção:** [www.kinocampus.com.br](https://www.kinocampus.com.br)

### Regras arquiteturais obrigatórias

1. Não quebrar nenhuma funcionalidade consolidada.
2. Não alterar contratos públicos sem evidência forte e sem atualizar todos os equivalentes.
3. Não introduzir `require`/`import` nos assets JS carregados por `<script defer>`.
4. Sempre escapar dados dinâmicos antes de `innerHTML` com `window.KCUtils.escapeHtml(...)` ou helper que delegue para ela.
5. Preferir mudanças pequenas, monotemáticas e reversíveis.
6. Atualizar sempre:
   - `README.md`
   - `RELATORIO-KINOCAMPUS-V11.md`
7. Validar preview no Vercel antes do merge.
8. Validar produção após `promote`.
9. Se tocar banco ou Edge Functions, documentar exatamente o que foi aplicado e validado.

### Estado consolidado da linha v11

- `v11.23.0`: release gate principal encerrado
- `v11.24.x`: trilha i18n/a11y/UX Writing iniciada
- `v11.27.x`: trilha iOS/Safari encerrada
- `v11.28.x`: paridade de controllers encerrada
- `v11.29.x`: SWR residual encerrada
- `v11.30.x`: trilha dos hotspots monolíticos encerrada
- `v11.31.0`: nova auditoria formal do próximo hotspot iniciada em `kc-create-post.js`

### Baseline obrigatória atual

- **Jest:** `80/80` suites
- **Testes:** `1303/1303`
- **Hygiene:** `8.6.0`

Comandos que precisam continuar verdes:

```bash
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

### Hotspots já tratados

#### `supabase.adapter.js`

- split concluído
- `4041L -> 420L`
- namespace interno: `window._KCSA`

#### `product.controller.js`

- split concluído e estabilizado
- `3368L -> 1298L`
- submódulos ativos:
  - `product.report.js`
  - `product.related.js`
  - `product.calendar.js`
  - `product.save.js`
  - `product.ratings.js`
  - `product.edit.js`
  - `product.analytics.js`
  - `product.popovers.js`
- contrato final do split travado em:
  - `tests/product.controller-split-contract.test.js`

### Hotspot atual auditado

#### `assets/js/kc-create-post.js`

Métricas atuais:

- `2610` linhas
- `~114 KB`
- `55` funções top-level
- **não** é IIFE
- **não** declara `'use strict'`
- expõe 4 globals públicos:
  - `window.kcOpenCreatePostModal`
  - `window.kcCloseCreatePostModal`
  - `window.kcOpenEditPostModal`
  - `window.kcOpenCreatePostModalPrefilled`

Carregado na base principal por `12` HTMLs:

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

Responsabilidades concentradas no arquivo:

- schema dos 6 módulos
- render do modal
- toolbar markdown da descrição
- imagens, capa, drag/drop e compressão
- create
- edit
- duplicate check
- audit log
- redirect por módulo
- bootstrap global

### Arquivos que devem ser lidos antes de continuar

Leia primeiro:

- `README.md`
- `RELATORIO-KINOCAMPUS-V11.md`
- `docs/kc-create-post-audit-v11.31.md`
- `docs/handoff-claude-code-v11.30.18.md`
- `assets/js/kc-create-post.js`
- `assets/js/controllers/create-post.controller.js`
- `tests/kc-create-post-active-fields.test.js`
- `tests/create-post.controller.test.js`
- `docs/module-schemas.md`
- `create-post.html`

### Decisão técnica da auditoria

**Não comece convertendo `kc-create-post.js` inteiro para IIFE.**

Isso seria arquiteturalmente atraente, mas é arriscado demais como primeiro passo porque:

- o arquivo é carregado em 12 HTMLs
- ele instala listeners globais
- ele governa tanto criação quanto edição
- os exports públicos já são consumidos em vários pontos

### Estratégia recomendada para `v11.31.x`

#### `v11.31.1`

Criar uma suíte de contrato mais ampla para `kc-create-post.js` antes de qualquer split.

Cobrir minimamente:

- globals exportados
- schema base
- bootstrap `DOMContentLoaded`
- `kcEnsureCreateModal`
- `kcRenderCreateModal`
- `kcHandleCreateSubmit`
- `kcOpenEditPostModal`
- integrações críticas com `KCAPI`, `KCActions`, `KCSupabase`, `KCOverlayLock`

#### `v11.31.2`

Extrair schema e constantes estáticas para algo como:

- `assets/js/kc-create-post.schema.js`

#### `v11.31.3`

Extrair pipeline de imagens para algo como:

- `assets/js/kc-create-post.media.js`

#### `v11.31.4`

Extrair resolvers de domínio para algo como:

- `assets/js/kc-create-post.domain.js`

#### `v11.31.5`

Extrair shell/render do modal para algo como:

- `assets/js/kc-create-post.modal.js`

#### `v11.31.6`

Extrair submit e edit por último para algo como:

- `assets/js/kc-create-post.submit.js`

#### `v11.31.7`

Fechar o residual do core e estabilizar o orquestrador.

### Namespace interno recomendado

Ao começar o split, introduza primeiro um namespace interno, sem quebrar a API pública:

```javascript
window._KCCreatePost = window._KCCreatePost || {};
```

Mas mantenha intactos, no início da trilha, os globals já usados hoje:

- `window.kcOpenCreatePostModal`
- `window.kcCloseCreatePostModal`
- `window.kcOpenEditPostModal`
- `window.kcOpenCreatePostModalPrefilled`

### Dependências globais relevantes do hotspot

O arquivo depende diretamente de:

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

Também usa side channels globais:

- `window.__KC_OPPORTUNITY_AREA_HISTORY`
- `window.__KC_HOUSING_REGION_HISTORY`
- `window.__KC_HOUSING_FEATURE_HISTORY`
- `window.__KC_LOST_FOUND_LOCATION_HISTORY`

### Riscos prioritários

1. Arquivo fora do padrão arquitetural dominante da base.
2. Mistura de create + edit + mídia + render + bootstrap no mesmo state machine.
3. Alto impacto transversal por estar presente em 12 HTMLs.
4. Cobertura atual insuficiente para split direto.
5. Mudança de ordem de scripts pode quebrar o modal em múltiplas páginas.

### Observações operacionais importantes

- O workspace contém `.claude/worktrees/*`; ignore essas cópias em buscas e mudanças reais do repo principal.
- Deploy previews do Vercel podem estar protegidos; use:
  - `vercel inspect <deployment>`
  - `gh pr checks <PR> --watch`
  - e smoke público após `promote`
- Em ambiente Windows/PowerShell, `curl.exe --ssl-no-revoke -L` tem sido a forma mais estável de smoke HTTP público.
- Neste repositório, a sequência Git/Vercel esperada continua sendo:

```bash
git checkout kinocampus-V11.0-foundations
git pull
git checkout -b codex/<iteracao>

# implementar

npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check

git add <arquivos>
git commit -m "<tipo>: <resumo>"
git push -u origin codex/<iteracao>
gh pr create --base kinocampus-V11.0-foundations
gh pr checks <PR> --watch
gh pr merge <PR> --squash --delete-branch
git checkout kinocampus-V11.0-foundations
git pull
```

Depois:

```bash
vercel ls kino-campus --scope yannakamurabrs-projects
vercel inspect <deployment-ou-url> --scope yannakamurabrs-projects
vercel promote <deployment-id> --scope yannakamurabrs-projects --yes
curl.exe --ssl-no-revoke -L "https://www.kinocampus.com.br/<rota>?ts=<timestamp>"
```

### Resultado esperado de você

1. Continue pela `v11.31.1`.
2. Não abra split estrutural antes de ampliar a suíte de contrato do hotspot.
3. Preserve rigor, continuidade e o padrão incremental da linha v11.
4. Atualize `README.md` e `RELATORIO-KINOCAMPUS-V11.md` em toda fase.
5. Se descobrir risco estrutural maior que o esperado, replaneje em uma fase ainda menor.

Fim do handoff.
