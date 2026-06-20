# Estrutura do Repositório - KinoCampus

**Versão:** v76.37.0
**Data:** 2026-06-20
**Atualizado em:** v76.37.0 - semântica temporal/status e benchmark shadow

---

## 1. Visao Geral

KinoCampus e uma plataforma HTML5 + CSS3 + Vanilla JS, sem framework, sem bundler e sem transpilador.
O runtime e servido como arquivos estaticos via Vercel, com scripts carregados por `<script defer>`
em ordem deterministica nos 26 HTMLs canonicos validados pelos scripts.

**Stack imutavel:**

| Camada | Estado canonico |
|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JS (IIFE + `window.*`) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| Hosting | Vercel (`vercel.json`) |
| Runtime JS | `frontendRuntimeVersion=8.6.1` |
| appVersion | `75.1.0` |
| Branch principal | `kinocampus-V75.0-foundations` |
| Testes | Jest 186 suites / 3750 testes + Playwright 10 specs E2E |
| Gates locais | `npm run check:all` com 5 validadores |

V75.1 e a fase operacional atual de performance/observabilidade. Este arquivo mantem o baseline estrutural reancorado em V23 e reflete a
janela operacional atual: archive consolidado, planning ativo com ledger pos-V23, QA ativo separado do
historico, worktree Claude arquivada, runbook QA real V25, templates de evidencia V26, gate visual/a11y V27,
auditoria unaccent/FTS V28, checklist Supabase Advisor V29, checklist de sandbox para providers V30, matriz
de triagem autenticada V31, politica E2E V32, politica LHCI V33, reconciliacao a11y/i18n V34, readiness CSS V35,
roadmap de readiness V36, gate de entrada funcional V37, gate de evidencia de rollback V38, matriz de candidatos
funcionais V39, dossie AUTH-CB-01 V40, dossie PROFILE-AV-01 V41, dossie ADMIN-MOD-01 V42, dossie NOTIF-SB-01 V43,
dossie SEARCH-FTS-01 V44, dossie CSS-SM-01 V45, dossie PUBLIC-A11Y-01 V46, consolidacao de readiness funcional V47,
pacote de evidencias externas sem secrets V48, freeze de escopo funcional V49, intake de implementacao funcional V50,
registro de No-Go funcional V51, rastreabilidade de gates funcionais V52, manifesto de patch funcional V53,
patch PUBLIC-A11Y no link de comentarios dos cards V54, patch PUBLIC-A11Y no badge de avaliacao V55,
patch PUBLIC-A11Y de icones decorativos V56, patch PUBLIC-A11Y no alt do avatar de autor V57,
patch PUBLIC-A11Y nos controles do modal de busca mobile V58, patch PUBLIC-A11Y no input do modal
de busca mobile V59, patch PUBLIC-A11Y nos botoes dinamicos de comentarios V60, patch PUBLIC-A11Y
de botoes dinamicos publicos/admin V61, patch PUBLIC-A11Y de icones decorativos admin V62,
patch PUBLIC-A11Y dos icones do carregar mais em pedidos admin V63, patch PUBLIC-A11Y dos icones
de feedback/loading em convites admin V64, patch PUBLIC-A11Y dos icones decorativos em pedidos
de ajuda admin V65, patch PUBLIC-A11Y dos icones decorativos em banners admin V66, patch PUBLIC-A11Y
dos icones residuais em moderacao admin V67, patch PUBLIC-A11Y dos icones de spinner do shard audit
do dashboard admin V68, patch PUBLIC-A11Y dos icones decorativos do indicador de pull-to-refresh V69,
patch PUBLIC-A11Y do icone decorativo da aba `Todas` dos filtros publicos V70,
patch PUBLIC-A11Y dos 11 icones decorativos do ranking e modulos em admin-dashboard.charts.js V71,
patch PUBLIC-A11Y dos 14 icones decorativos de titulos de secao e feedback em admin-dashboard.controller.js V72,
patch PUBLIC-A11Y dos 9 icones decorativos de acoes e estados em kc-comments.js V73,
patch PUBLIC-A11Y dos 18 icones decorativos de acoes e estados em admin-reports.controller.js V74,
patch PUBLIC-A11Y dos 18 icones decorativos de avatares, acoes e estados em kc-ranking.js V75,
performance phase 1 com runtime 8.6.1 em V75.1, decomposicao V76 de diagnostics/session/filters/authors/posts-normalize e normalizadores de rating em V76.7, inventario CSS-A de ownership de `styles.css` em V76.8, baseline CSS-B visual/cascade em V76.9, inventario residual JS-I da fachada `KCAPI` em V76.10, extracao JS-I.1 de external access admin em V76.11 e extracao JS-I.2 de notification fallbacks em V76.12.

---

## 2. Arvore Canonica

```text
kino-campus/
|-- assets/
|   |-- js/
|   |   |-- boot/                  9 arquivos
|   |   |-- core/                  12 arquivos
|   |   |-- api/                   22 arquivos
|   |   |-- utils/                 8 arquivos
|   |   |-- features/              18 arquivos + create-post/
|   |   |   `-- create-post/       7 arquivos
|   |   |-- shared/                10 arquivos
|   |   |-- legacy-shims/          1 arquivo
|   |   |-- components/            3 arquivos
|   |   |-- adapters/
|   |   |   |-- local/             9 arquivos
|   |   |   `-- supabase/          12 arquivos
|   |   `-- controllers/
|   |       |-- public/            33 arquivos
|   |       `-- admin/             15 arquivos
|   |-- css/
|   |   |-- styles.css
|   |   |-- kc-theme-boot.css
|   |   |-- kc-public-shell.css
|   |   |-- admin-shell.css
|   |   |-- kc-chat.css
|   |   |-- kc-chat-shortcut.css
|   |   |-- kc-error-page.css
|   |   |-- kc-sidebar-context.css
|   |   |-- product.css
|   |   |-- product-lightbox.css
|   |   `-- future-split/          5 stubs nao carregados em producao
|   `-- images/
|-- docs/
|   |-- index.md
|   |-- architecture.md
|   |-- api-contract.md
|   |-- db-schema.md
|   |-- env-vars.md
|   |-- architecture/              8 docs canonicos
|   |-- archive/                   historico consolidado
|   |-- ops/                       runbooks operacionais
|   |-- planning/                  backlog e roteiros V18+
|   `-- qa/                        QA ativo
|-- tests/
|   |-- unit/                     26 suites
|   |-- integration/              129 suites
|   |-- contract/                 12 suites
|   |-- structure/                14 suites
|   |-- a11y/                     5 suites
|   |-- fixtures/
|   `-- e2e/                      10 specs
|-- scripts/
|   |-- validate-version-map.js
|   |-- validate-repository-structure.js
|   |-- validate-script-chains.js
|   |-- validate-public-routes.js
|   |-- hygiene-check.js
|   |-- audit-css-ownership.js
|   |-- capture-css-visual-baseline.js
|   |-- audit-kcapi-facade-residual.js
|   |-- benchmark-search-shadow.js
|   `-- inject-env.js
|-- admin/                         6 HTMLs admin
|-- *.html                         21 HTMLs na raiz
|-- supabase/                      132 migrations SQL locais
|-- sw.js
|-- vercel.json
|-- package.json
|-- VERSION.json
|-- CHANGELOG.md
|-- README.md
|-- RELATORIO-KINOCAMPUS-V71.md
|-- RELATORIO-KINOCAMPUS-V72.md
|-- RELATORIO-KINOCAMPUS-V73.md
|-- RELATORIO-KINOCAMPUS-V74.md
`-- RELATORIO-KINOCAMPUS-V75.md
```

---

## 3. Grupos JavaScript

O gate V15 permanece ativo: nenhum arquivo `.js` pode existir diretamente em `assets/js/`.
Todo modulo deve permanecer em um dos grupos canonicos abaixo.

| Grupo | Arquivos | Responsabilidade |
|---|---:|---|
| `assets/js/boot/` | 9 | Cadeia de inicializacao compartilhada por todos os HTMLs, SEO, Google Tag e Speed Insights |
| `assets/js/core/` | 12 | Runtime central: i18n, auth UI, consentimento, perfil, tema, notificacoes, widgets e shell publico |
| `assets/js/api/` | 22 | Cliente Supabase, submodulos KCAPI, diagnostics, chat e facade `window.KCAPI` |
| `assets/js/utils/` | 8 | Helpers de string, formatacao, DOM, identidade, taxonomia, localizacao e apresentacao |
| `assets/js/features/` | 18 | Comentarios, busca, filtros, banners, ranking, ads, analytics, calendario, lazy loading, pull-to-refresh, contexto de módulos e página 404 |
| `assets/js/features/create-post/` | 7 | Orquestracao, schema, campos, render, midia, resolvers e submit de criacao |
| `assets/js/shared/` | 10 | Dados e contratos compartilhados, incluindo registry, parser e pipeline shadow de busca ainda não carregados |
| `assets/js/legacy-shims/` | 1 | Shim transitorio de migracao de posts do usuario |
| `assets/js/components/` | 3 | Componentes reutilizaveis: carousel, toast e voting |
| `assets/js/adapters/local/` | 9 | Persistencia localStorage por dominio |
| `assets/js/adapters/supabase/` | 12 | Persistencia Supabase por dominio |
| `assets/js/controllers/public/` | 33 | Controllers das paginas publicas e auxiliares de produto/perfil |
| `assets/js/controllers/admin/` | 15 | Controllers das paginas admin e shards auxiliares |

### Cadeia de boot obrigatoria

```text
boot/kc-constants.js
-> boot/kc-env.js
-> boot/kc-feature-flags.js
-> boot/kc-sw-register.js
-> boot/kc-telemetry.js
-> boot/kc-theme-boot.js
```

Essa ordem e validada por `npm run check:scripts`.

### Ordem tipica de pagina de feed

```text
[boot]
-> utils/kc-utils.*.js
-> utils/kc-utils.js
-> api/kc-supabase.*.js
-> api/kc-api.*.js
-> api/kc-api.client.js
-> adapters/local/*.js
-> adapters/supabase/*.js
-> core/*.js
-> features/*.js
-> components/*.js
-> controllers/public/<pagina>.controller.js
```

---

## 4. CSS

| Caminho | Estado | Regra |
|---|---|---|
| `assets/css/styles.css` | Producao | Monolito principal; nao dividir sem plano V19+ dedicado |
| `assets/css/kc-theme-boot.css` | Producao | Tema inicial carregado cedo |
| `assets/css/kc-public-shell.css` | Producao | Shell publico |
| `assets/css/admin-shell.css` | Producao | Shell admin |
| `assets/css/kc-chat.css` | Producao | UI de conversa/chat |
| `assets/css/kc-chat-shortcut.css` | Producao | Atalho global de mensagens injetado por notificacoes |
| `assets/css/kc-sidebar-context.css` | Producao | Títulos, acionador mobile e diálogo contextual dos seis módulos |
| `assets/css/kc-error-page.css` | Producao | Layout isolado e responsivo da página 404 |
| `assets/css/product.css` | Producao | Pagina de produto |
| `assets/css/product-lightbox.css` | Producao | Lightbox de midia da pagina de produto |
| `assets/css/future-split/` | Stubs | Preparacao para split futuro; nao carregar em producao sem gate visual |

O split CSS segue controlado por gates. V27 define o gate visual/a11y mínimo antes de qualquer alteração CSS; V35 define readiness e rollback antes de qualquer CSS; V45 detalha o candidato P2 de ajuste CSS pequeno; V76.8 adiciona `scripts/audit-css-ownership.js` e `docs/planning/v76-css-ownership-inventory.md` para classificar `styles.css`; V76.9 adiciona `scripts/capture-css-visual-baseline.js`, `npm run audit:css-baseline` e `docs/planning/v76-css-visual-baseline.md` para capturar baseline anônimo sem alterar cascade, HTML ou `future-split/`. V76.10 adiciona `scripts/audit-kcapi-facade-residual.js`, `npm run audit:kcapi-residual` e `docs/planning/v76-kcapi-residual-inventory.md` para classificar os buckets residuais da fachada `KCAPI`; V76.11 move external access admin para `kc-api.help.js`; V76.12 move os builders canônicos de notification fallbacks para `kc-api.notifications.js`; V76.13 move a ponte `emitPostMutation` para `kc-api.posts-write.js`; V76.14/V76.15 encerram `Admin overlap`; V76.17 encerra `Chat overlap` com `kc-chat-shortcut.css`; V76.26 move `.kc-legal-*` e V76.27 move `.kc-profile-rank-badges*` para `kc-public-shell.css`; V76.28 amplia o baseline a 21 rotas / 42 capturas e cobre as 12 páginas consumidoras do shell. V76.29 classifica `bootstrap-driver-core` em cinco domínios e 15 gates, confirmando No-Go para extração runtime. V76.30 cobre os quatro gates de `transport-config`; V76.31 cobre os quatro de `adapter-registry`. Ambos permanecem na fachada e sete gates do núcleo continuam pendentes.

---

## 5. Documentacao

### 5.1 Docs ativos

| Area | Conteudo |
|---|---|
| `docs/index.md` | Indice operacional da documentacao ativa |
| `docs/architecture.md` | Visao tecnica consolidada |
| `docs/api-contract.md` | Contratos publicos de API/facades |
| `docs/db-schema.md` | Baseline documental do banco |
| `docs/env-vars.md` | Variaveis de ambiente e runtime |
| `docs/architecture/` | Guias canonicos de arquitetura, scripts, dados, testes, CSS e IA |
| `docs/ops/` | Runbooks operacionais, invariantes Vercel/Supabase, auditoria unaccent/FTS, evidencias Advisor, sandbox de providers e pacote V48 de evidencias externas |
| `docs/planning/` | Inventarios V18, plano V19, ledger V24, readiness V26, readiness CSS V35, roadmap V36, gate funcional V37, rollback V38, matriz V39, dossies V40-V46, consolidacao V47, freeze V49, intake V50, No-Go V51, rastreabilidade V52 e manifesto V53 |
| `docs/qa/` | Artefatos ativos de QA manual, RLS, XSS, reports V26, templates de gate funcional V37, rollback V38, candidato V39, auth callback V40, profile/avatar V41, admin/moderacao V42, notification provider V43, search/FTS V44, CSS small change V45, public a11y V46, selecao funcional V47, redacao de evidencia externa V48, freeze funcional V49, intake funcional V50, No-Go funcional V51, rastreabilidade funcional V52, manifesto funcional V53 e reports PUBLIC-A11Y V59-V75, gate visual/a11y V27, matriz autenticada V31, politica E2E V32, politica LHCI V33 e plano a11y/i18n V34 |

### 5.2 Archive

`docs/archive/` e o unico local canonico para documentos historicos. Ele contem:

| Subdiretorio | Conteudo |
|---|---|
| `relatorios/` | Relatorios de encerramento V9, V11, V13-V65 |
| `audits-v11/` | Auditorias e handoffs da trilha V11 |
| `audits-v12-v13/` | Auditorias de refactor V12-V13 |
| `audits-accessibility/` | Auditorias a11y/i18n V12 |
| `audits-v15/` | Planos/logs da reorganizacao JS V15 |
| `audits-misc/` | Planos gerais e placeholders historicos |
| `legacy-v6-v8/` | Documentos historicos V6-V8, SQL legacy e backend placeholder |
| `reviews/` | Code reviews externos do periodo V8 |
| `qa-legacy/` | QA historico V8/V11/V15 |
| `claude-worktree-v9/` | Artefatos V9 preservados da worktree rastreada |
| `patches/` | Patches historicos |

Nao recriar arvores historicas antigas fora de `docs/archive/`.

### 5.3 Relatorios raiz

A politica V22 limita a raiz a no maximo 5 relatorios recentes. Em V75, a janela operacional e:

- `RELATORIO-KINOCAMPUS-V71.md`
- `RELATORIO-KINOCAMPUS-V72.md`
- `RELATORIO-KINOCAMPUS-V73.md`
- `RELATORIO-KINOCAMPUS-V74.md`
- `RELATORIO-KINOCAMPUS-V75.md`

Relatorios anteriores devem ser movidos com `git mv` para `docs/archive/relatorios/`.

---

## 6. Testes e Gates

| Comando | Responsabilidade esperada |
|---|---|
| `npm run check:version` | Valida `VERSION.json`, branch canonica e runtime JS `8.6.1` |
| `npm run check:structure` | Valida 169 itens estruturais + raiz `assets/js/` limpa |
| `npm run check:scripts` | Valida cadeias de scripts nos 28 HTMLs canonicos |
| `npm run check:routes` | Valida 22 rotas publicas + 6 admin |
| `npm run check:hygiene` | Valida higiene estatica de runtime, branch e changelog |
| `npm run check:all` | Executa os 5 gates acima |
| `npm test` | Mantém 186/186 suites e 3750/3750 testes Jest |
| `npm run benchmark:search-shadow` | Mede 12 cenários sintéticos dos seis módulos, sem dados reais |
| `npx playwright test --list` | Lista 10 specs / 68 testes Playwright sem exigir ambiente local ativo |
| `npm run test:e2e` | Executa Playwright; depende de ambiente local/provider |
| `npm run lhci` | Evidencia Lighthouse; depende de ambiente local/provider |

---

## 7. Regras de Manutencao

| Regra | Motivo |
|---|---|
| Manter `frontendRuntimeVersion=8.6.1` ate release funcional coordenado | Evita drift entre app documental e runtime JS |
| Usar `git mv` ao mover arquivos rastreados | Preserva historico Git |
| Nao editar JS funcional, CSS de producao, HTMLs ou migrations em versoes documentais | Preserva estabilidade da plataforma |
| Atualizar validadores quando a estrutura canonica mudar | Mantem `check:all` como fonte operacional |
| Atualizar `docs/index.md`, `README.md`, `CHANGELOG.md`, `VERSION.json` e relatorio da versao | Mantem navegabilidade e status coerentes |
| Manter historico em `docs/archive/` | Reduz ruido em busca e revisao de docs ativos |
| Manter `docs/qa/` apenas para QA ativo | Evita confundir evidencia historica com checklist operacional |

---

## 8. Delta V17 a V76

| Versao | Entrega estrutural |
|---|---|
| V17 | Archive documental consolidado e diretorios historicos movidos para `docs/archive/` |
| V18 | Inventario de pendencias e roadmap V19 em `docs/planning/` |
| V19 | Drift documental ativo corrigido e runbooks operacionais criados |
| V20 | QA ativo separado de QA historico |
| V21 | Worktree Claude rastreada arquivada e `.claude/worktrees/*` ignorado |
| V22 | Politica de relatorios raiz com janela maxima de 5 versoes recentes |
| V23 | Este arquivo reancorado para a estrutura real pos-V22 |
| V24 | Ledger pos-V23 criado e V19 arquivado conforme politica de raiz |
| V25 | Runbook de QA real criado e V20 arquivado conforme politica de raiz |
| V26 | Templates de evidencia QA real normalizados e V21 arquivado conforme politica de raiz |
| V27 | Gate visual/a11y pre-CSS definido e V22 arquivado conforme politica de raiz |
| V28 | Auditoria unaccent/FTS pre-migration criada e V23 arquivado conforme politica de raiz |
| V29 | Checklist de evidencias Supabase Advisor criado e V24 arquivado conforme politica de raiz |
| V30 | Checklist de sandbox para providers de notificacao criado e V25 arquivado conforme politica de raiz |
| V31 | Matriz de triagem de fluxos autenticados criada e V26 arquivado conforme politica de raiz |
| V32 | Politica de gate Playwright E2E criada e V27 arquivado conforme politica de raiz |
| V33 | Politica de baseline LHCI criada e V28 arquivado conforme politica de raiz |
| V34 | Plano de reconciliacao a11y/i18n criado e V29 arquivado conforme politica de raiz |
| V35 | Ledger de readiness CSS criado e V30 arquivado conforme politica de raiz |
| V36 | Roadmap consolidado de readiness criado e V31 arquivado conforme politica de raiz |
| V37 | Gate de entrada funcional criado e V32 arquivado conforme politica de raiz |
| V38 | Gate de evidencia de rollback criado e V33 arquivado conforme politica de raiz |
| V39 | Matriz de candidatos funcionais criada e V34 arquivado conforme politica de raiz |
| V40 | Dossie pre-implementacao AUTH-CB-01 criado e V35 arquivado conforme politica de raiz |
| V41 | Dossie pre-implementacao PROFILE-AV-01 criado e V36 arquivado conforme politica de raiz |
| V42 | Dossie pre-implementacao ADMIN-MOD-01 criado e V37 arquivado conforme politica de raiz |
| V43 | Dossie pre-implementacao NOTIF-SB-01 criado e V38 arquivado conforme politica de raiz |
| V44 | Dossie pre-implementacao SEARCH-FTS-01 criado e V39 arquivado conforme politica de raiz |
| V45 | Dossie pre-implementacao CSS-SM-01 criado e V40 arquivado conforme politica de raiz |
| V46 | Dossie pre-implementacao PUBLIC-A11Y-01 criado e V41 arquivado conforme politica de raiz |
| V47 | Consolidacao de readiness funcional criada e V42 arquivado conforme politica de raiz |
| V48 | Pacote de evidencias externas sem secrets criado e V43 arquivado conforme politica de raiz |
| V49 | Freeze de escopo funcional criado e V44 arquivado conforme politica de raiz |
| V50 | Intake de implementacao funcional criado e V45 arquivado conforme politica de raiz |
| V51 | Registro de No-Go funcional criado e V46 arquivado conforme politica de raiz |
| V52 | Matriz de rastreabilidade de gates criada e V47 arquivado conforme politica de raiz |
| V53 | Manifesto de patch funcional criado e V48 arquivado conforme politica de raiz |
| V54 | Patch PUBLIC-A11Y de comentarios do card criado e V49 arquivado conforme politica de raiz |
| V55 | Patch PUBLIC-A11Y do badge de avaliacao do card criado e V50 arquivado conforme politica de raiz |
| V56 | Patch PUBLIC-A11Y de icones decorativos do card criado e V51 arquivado conforme politica de raiz |
| V57 | Patch PUBLIC-A11Y do alt do avatar de autor criado e V52 arquivado conforme politica de raiz |
| V58 | Patch PUBLIC-A11Y dos controles do modal de busca mobile criado e V53 arquivado conforme politica de raiz |
| V59 | Patch PUBLIC-A11Y do input do modal de busca mobile criado e V54 arquivado conforme politica de raiz |
| V60 | Patch PUBLIC-A11Y dos botoes dinamicos de comentarios criado e V55 arquivado conforme politica de raiz |
| V61 | Patch PUBLIC-A11Y de botoes dinamicos publicos/admin criado e V56 arquivado conforme politica de raiz |
| V62 | Patch PUBLIC-A11Y de icones decorativos admin criado e V57 arquivado conforme politica de raiz |
| V63 | Patch PUBLIC-A11Y dos icones do carregar mais em pedidos admin criado e V58 arquivado conforme politica de raiz |
| V64 | Patch PUBLIC-A11Y dos icones de feedback/loading em convites admin criado e V59 arquivado conforme politica de raiz |
| V65 | Patch PUBLIC-A11Y dos icones decorativos em pedidos de ajuda admin criado e V60 arquivado conforme politica de raiz |
| V66 | Patch PUBLIC-A11Y dos icones decorativos em banners admin criado e V61 arquivado conforme politica de raiz |
| V67 | Patch PUBLIC-A11Y dos icones residuais em moderacao admin criado e V62 arquivado conforme politica de raiz |
| V68 | Patch PUBLIC-A11Y dos icones de spinner do shard audit do dashboard admin criado e V63 arquivado conforme politica de raiz |
| V69 | Patch PUBLIC-A11Y dos icones decorativos do indicador de pull-to-refresh criado e V64 arquivado conforme politica de raiz |
| V70 | Patch PUBLIC-A11Y do icone decorativo da aba `Todas` dos filtros publicos criado e V65 arquivado conforme politica de raiz |
| V71 | Patch PUBLIC-A11Y dos 11 icones decorativos do ranking e modulos em admin-dashboard.charts.js criado e V66 arquivado conforme politica de raiz |
| V72 | Patch PUBLIC-A11Y dos 14 icones decorativos de titulos de secao e feedback em admin-dashboard.controller.js criado e V67 arquivado conforme politica de raiz |
| V73 | Patch PUBLIC-A11Y dos 9 icones decorativos de acoes e estados em kc-comments.js criado e V68 arquivado conforme politica de raiz |
| V74 | Patch PUBLIC-A11Y dos 18 icones decorativos de acoes e estados em admin-reports.controller.js criado e V69 arquivado conforme politica de raiz |
| V75 | Patch PUBLIC-A11Y dos 18 icones decorativos de avatares, acoes e estados em kc-ranking.js criado e V70 arquivado conforme politica de raiz |
| V76 | Decomposicao segura de `kc-api.client.js` com submodulos diagnostics/session/filters/authors/posts-normalize/ratings/external access, inventario CSS-A, baseline CSS-B e inventario residual JS-I da fachada `KCAPI` |
