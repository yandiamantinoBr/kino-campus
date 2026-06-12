# V76 - Plano de Decomposicao Segura dos Hotspots JS/CSS

**Versao:** v76.1.0
**Data:** 2026-06-12
**Escopo:** planejamento tecnico + status da primeira extracao JS; sem alterar CSS, SQL, secrets, provider ou deploy

---

## 1. Objetivo

Converter os achados A1/A2 das auditorias V1/V2/V3 em uma trilha executavel para reduzir os dois
hotspots ainda relevantes do frontend:

| Hotspot | Estado atual medido em 2026-06-12 | Risco principal |
|---|---:|---|
| `assets/js/api/kc-api.client.js` | 2.809 linhas / 119.106 bytes | regressao de contrato publico `window.KCAPI`, paridade local/supabase e fluxos autenticados |
| `assets/css/styles.css` | 12.282 linhas / 287.760 bytes | regressao visual transversal em paginas publicas/admin e quebra de cascade |
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
| help/admin help | `assets/js/api/kc-api.help.js` |
| notifications | `assets/js/api/kc-api.notifications.js` |
| chat | `assets/js/api/kc-api.chat.js` |

O risco residual nao e ausencia de modularizacao. O risco e o arquivo central ainda concentrar bootstrap,
normalizacao, caches, mocks, wrappers, fallback local/supabase, diagnosticos e exposicao final do contrato.

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
| `KCSessionStore` / `KCPostFreshness` | responsabilidade isolavel, ja exposta como `window.*` proprio | preservar eventos e storage keys |
| filtros/date presets de feed | logica pura, coberta por `kc-api-client.test.js` | precisa manter paridade entre modulos e datas |
| mocks/normalizacao de autores | reduz peso do facade | alto risco de fixtures e fallback local; fazer depois dos anteriores |
| `normalizePost` | grande valor, mas contrato sensivel | so depois de snapshot de casos atuais em teste |

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

## 7. Proxima entrega recomendada

Escolher uma das duas, nunca ambas no mesmo PR:

| Opcao | Entrega | Por que agora |
|---|---|---|
| JS-A | Report de superficie publica `window.KCAPI` e mapa dos blocos residuais no facade | prepara extracao sem mudar runtime |
| CSS-A | Inventario de ownership de seletores de `styles.css` | prepara split sem alterar cascade |

**Status 2026-06-12:** JS-A foi entregue em
`docs/qa/reports/report-v76-kcapi-public-surface-2026-06-12.md`, com snapshot de 107 membros
publicos de `window.KCAPI` e reforco em `tests/contract/kc-api-facade-contract.test.js`.

**Status v76.1.0:** JS-B extraiu o bloco de diagnostico de create-post para
`assets/js/api/kc-api.diagnostics.js`, preservando os 107 membros de `window.KCAPI`, aliases
globais e ordem de carregamento nos HTMLs reais.

Proxima entrega recomendada apos JS-B: isolar `KCSessionStore`/`KCPostFreshness` somente depois de
um contrato explicito de storage keys, eventos e deduplicacao. Nao iniciar por `normalizePost`; o
report JS-A classifica esse bloco como alto risco por ser contrato transversal.
