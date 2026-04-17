# Handoff Claude Code — KinoCampus após `v11.31.0`

Este arquivo substitui o handoff anterior focado em `v11.30.18` e serve como prompt operacional de continuidade após o fechamento da auditoria do hotspot `kc-create-post.js`.

---

## Status fechado da `v11.31.0`

- branch principal: `kinocampus-V11.0-foundations`
- commit atual da base: `04f172a4c1357d75c3addb7f865ac5bcc8597007`
- PR da iteração: `#357`
- merge squash: `04f172a`
- preview da branch validado: `dpl_CSDenwYRfNM25NwbMkJEsBFRDawC`
- deployment pós-merge da base validado: `dpl_GUvbS9a7gzex1scW7NAY1WzuyNPc`
- produção promovida e validada: `dpl_HcozbnnnhC3gkHhpjoenx8uJGdVf`
- smoke público: [www.kinocampus.com.br](https://www.kinocampus.com.br/?ts=1776428200) → HTTP `200`

O que a `v11.31.0` entregou:

- auditoria formal do hotspot `assets/js/kc-create-post.js`
- medição e mapa arquitetural do arquivo
- estratégia segura da trilha `v11.31.x`
- atualização do `README.md` e do `RELATORIO-KINOCAMPUS-V11.md`

O que a `v11.31.0` não fez:

- nenhuma mudança em runtime publicado
- nenhuma migration SQL
- nenhuma mudança em Supabase, Edge Functions ou Vercel Functions
- nenhum split ainda em `kc-create-post.js`

Primeira ação recomendada para a próxima IA:

- começar pela `v11.31.1`
- não abrir split ainda
- primeiro blindar `kc-create-post.js` com uma suíte de contrato ampliada

---

## Prompt sugerido para Claude Code

Atue como um engenheiro de software sênior responsável por continuar a evolução do projeto **KinoCampus** com segurança máxima, preservando contratos públicos, layout, comportamento consolidado e o fluxo operacional já adotado pela equipe.

### 1. Contexto do projeto

- **Nome:** KinoCampus
- **Contexto:** plataforma universitária da UFG para economia circular, comunidade e compartilhamento de recursos
- **Stack:** HTML5 + CSS3 + Vanilla JS
- **Bundler/framework:** inexistente
- **Padrão dominante do runtime:** IIFEs + globals em `window.*`
- **Backend:** Supabase
- **Hosting:** Vercel
- **Branch principal:** `kinocampus-V11.0-foundations`
- **Produção:** [www.kinocampus.com.br](https://www.kinocampus.com.br)

### 2. Regras arquiteturais obrigatórias

1. Não quebrar nenhuma funcionalidade consolidada.
2. Não alterar contratos públicos sem evidência forte e sem atualizar todos os equivalentes.
3. Não introduzir `require` ou `import` nos assets JS carregados por `<script defer>`.
4. Sempre escapar dados dinâmicos antes de `innerHTML` com `window.KCUtils.escapeHtml(...)` ou helper que delegue para ela.
5. Preferir mudanças pequenas, monotemáticas e reversíveis.
6. Atualizar sempre:
   - `README.md`
   - `RELATORIO-KINOCAMPUS-V11.md`
7. Validar preview no Vercel antes do merge.
8. Validar produção após `promote`.
9. Se tocar banco, Edge Functions ou segredos operacionais, documentar exatamente o que foi aplicado e validado.
10. Ignorar `.claude/worktrees/*` ao medir footprint ou contar carregadores do repo.

### 3. Baseline atual obrigatória

- **Jest:** `80/80` suites
- **Testes:** `1303/1303`
- **Hygiene:** `8.6.0`
- **Base atual:** `04f172a4c1357d75c3addb7f865ac5bcc8597007`
- **Última PR encerrada:** `#357`
- **Último deployment de produção validado:** `dpl_HcozbnnnhC3gkHhpjoenx8uJGdVf`

Comandos que precisam continuar verdes:

```bash
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

### 4. Estado consolidado da linha v11

- `v11.23.0`: release gate principal encerrado
- `v11.24.x`: trilha i18n/a11y/UX Writing iniciada
- `v11.27.x`: trilha iOS/Safari encerrada
- `v11.28.x`: paridade de controllers encerrada
- `v11.29.x`: SWR residual encerrada
- `v11.30.x`: split do hotspot `product.controller.js` encerrado e estabilizado
- `v11.31.0`: auditoria formal do próximo hotspot encerrada em `kc-create-post.js`

### 5. Hotspots já tratados

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
- contrato final travado em:
  - `tests/product.controller-split-contract.test.js`

### 6. Hotspot atual auditado

#### Arquivo

- `assets/js/kc-create-post.js`

#### Métricas atuais

- `2610` linhas
- `~114 KB`
- `55` funções top-level
- não é IIFE
- não declara `'use strict'`
- expõe 4 globals públicos:
  - `window.kcOpenCreatePostModal`
  - `window.kcCloseCreatePostModal`
  - `window.kcOpenEditPostModal`
  - `window.kcOpenCreatePostModalPrefilled`

#### Carregamento atual

O arquivo é carregado por `12` HTMLs principais:

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

#### Responsabilidades concentradas

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

#### Dependências críticas mapeadas

Diretas:

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

Side channels globais:

- `window.__KC_OPPORTUNITY_AREA_HISTORY`
- `window.__KC_HOUSING_REGION_HISTORY`
- `window.__KC_HOUSING_FEATURE_HISTORY`
- `window.__KC_LOST_FOUND_LOCATION_HISTORY`

#### Mapa aproximado de seções internas

- `1–90`: preâmbulo/helpers (`isProductionRuntime`, `_esc`, markdown toolbar/preview)
- `95–260`: constantes e schema
- `262–307`: singleton state
- `308–581`: bootstrap do modal e listeners
- `582–644`: capture e gating de campos ativos
- `645–1019`: resolvers/normalizers de domínio
- `1020–1235`: pipeline de imagem e mídia
- `1236–1399`: builder dinâmico de campos
- `1400–1661`: render do modal
- `1662–1846`: open/close/edit flows
- `1847–2553`: submit/persist/edit pipeline
- `2554–2610`: bootstrap global + exports

### 7. Decisão técnica já tomada na auditoria

**Não comece convertendo `kc-create-post.js` inteiro para IIFE.**

Razões:

- o arquivo é carregado em `12` HTMLs
- ele instala listeners globais
- governa criação e edição
- seus 4 globals públicos já são consumidos em vários pontos
- a cobertura atual ainda não protege o suficiente um split imediato

### 8. Invariantes da trilha `v11.31.x`

1. Não remover nem renomear os 4 globals públicos no início da trilha.
2. Não converter o arquivo inteiro para IIFE na primeira fatia.
3. Não mexer em todos os carregadores HTML sem necessidade estrita.
4. Toda extração nova deve vir depois de teste estático/contratual correspondente.
5. Todo submódulo novo deve ser delegado com guard defensivo.
6. Não misturar melhoria cosmética com split estrutural.
7. Não abrir refactor grande sem medir risco e provar rollback simples.

### 9. Estratégia recomendada para `v11.31.x`

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
- presença dos histories globais
- bootstrap/export final do arquivo

Critério de aceite:

- baseline sobe para `81/81` suites ou mais
- nenhum arquivo de runtime alterado fora de eventual alinhamento mínimo de docs
- `kc-create-post.js` continua sem alteração estrutural relevante
- `README.md` e `RELATORIO-KINOCAMPUS-V11.md` atualizados com o racional do gate

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

### 10. Namespace interno recomendado

Ao começar o split, introduza primeiro um namespace interno, sem quebrar a API pública:

```javascript
window._KCCreatePost = window._KCCreatePost || {};
```

Mas mantenha intactos, no início da trilha:

- `window.kcOpenCreatePostModal`
- `window.kcCloseCreatePostModal`
- `window.kcOpenEditPostModal`
- `window.kcOpenCreatePostModalPrefilled`

### 11. Arquivos que devem ser lidos antes de continuar

Leia primeiro:

- `README.md`
- `RELATORIO-KINOCAMPUS-V11.md`
- `docs/kc-create-post-audit-v11.31.md`
- `docs/handoff-claude-code-v11.31.0.md`
- `assets/js/kc-create-post.js`
- `assets/js/controllers/create-post.controller.js`
- `tests/kc-create-post-active-fields.test.js`
- `tests/create-post.controller.test.js`
- `docs/module-schemas.md`
- `create-post.html`

### 12. Workflow operacional esperado

```bash
git checkout kinocampus-V11.0-foundations
git pull
git checkout -b codex/v11-31-1-kc-create-post-contracts
```

Implementar apenas a `v11.31.1`, depois rodar:

```bash
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

Depois:

```bash
git add ...
git commit -m "test: harden kc-create-post contracts for v11.31.1"
git push -u origin codex/v11-31-1-kc-create-post-contracts
gh pr create --base kinocampus-V11.0-foundations
gh pr checks <PR> --watch
gh pr merge <PR> --squash --delete-branch
git checkout kinocampus-V11.0-foundations
git pull
```

Vercel:

```bash
vercel ls kino-campus --scope yannakamurabrs-projects
vercel inspect <deployment-or-url> --scope yannakamurabrs-projects
vercel promote <deployment-id> --scope yannakamurabrs-projects --yes
curl.exe --ssl-no-revoke -L "https://www.kinocampus.com.br/?ts=<timestamp>"
```

### 13. Observações operacionais de ambiente

- neste workspace Windows, `curl.exe --ssl-no-revoke -L` tem sido o smoke mais confiável
- `vercel inspect` e `vercel ls` têm sido suficientes mesmo quando o Vercel MCP oscila
- use `docs/kc-create-post-audit-v11.31.md` como source of truth do hotspot antes de confiar em memória ou em contagens antigas
- se surgir tentação de refatorar tudo de uma vez, não faça: a trilha `v11.31.x` foi desenhada justamente para evitar regressão em um arquivo com footprint muito amplo

### 14. Resultado esperado da próxima IA

- continuar a v11 com coerência
- abrir `v11.31.1` como fatia de teste/contrato, não como split
- manter o repo verde em Jest e hygiene
- atualizar `README.md` e `RELATORIO-KINOCAMPUS-V11.md`
- validar preview e produção no Vercel
- deixar a base pronta para `v11.31.2` somente depois do contrato estar blindado
