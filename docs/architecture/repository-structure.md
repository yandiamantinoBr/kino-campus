# Estrutura do Repositorio - KinoCampus

**Versao:** v37.0.0
**Data:** 2026-04-29
**Atualizado em:** v37.0.0 - gate de entrada funcional e janela raiz V33-V37

---

## 1. Visao Geral

KinoCampus e uma plataforma HTML5 + CSS3 + Vanilla JS, sem framework, sem bundler e sem transpilador.
O runtime e servido como arquivos estaticos via Vercel, com scripts carregados por `<script defer>`
em ordem deterministica nos 22 HTMLs canonicos.

**Stack imutavel:**

| Camada | Estado canonico |
|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JS (IIFE + `window.*`) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| Hosting | Vercel (`vercel.json`) |
| Runtime JS | `frontendRuntimeVersion=8.6.0` |
| appVersion documental | `37.0.0` |
| Branch principal | `kinocampus-V37.0-foundations` |
| Testes | Jest 134 suites / 3046 testes + Playwright 8 suites E2E |
| Gates locais | `npm run check:all` com 5 validadores |

V37 e uma versao documental. Este arquivo mantem o baseline estrutural reancorado em V23 e reflete a
janela operacional atual: archive consolidado, planning ativo com ledger pos-V23, QA ativo separado do
historico, worktree Claude arquivada, runbook QA real V25, templates de evidencia V26, gate visual/a11y V27, auditoria unaccent/FTS V28, checklist Supabase Advisor V29, checklist de sandbox para providers V30, matriz de triagem autenticada V31, politica E2E V32, politica LHCI V33, reconciliacao a11y/i18n V34, readiness CSS V35, roadmap de readiness V36 e gate de entrada funcional V37.

---

## 2. Arvore Canonica

```text
kino-campus/
|-- assets/
|   |-- js/
|   |   |-- boot/                  6 arquivos
|   |   |-- core/                  11 arquivos
|   |   |-- api/                   16 arquivos
|   |   |-- utils/                 8 arquivos
|   |   |-- features/              10 arquivos + create-post/
|   |   |   `-- create-post/       7 arquivos
|   |   |-- shared/                7 arquivos
|   |   |-- legacy-shims/          1 arquivo
|   |   |-- components/            3 arquivos
|   |   |-- adapters/
|   |   |   |-- local/             8 arquivos
|   |   |   `-- supabase/          11 arquivos
|   |   `-- controllers/
|   |       |-- public/            31 arquivos
|   |       `-- admin/             10 arquivos
|   |-- css/
|   |   |-- styles.css
|   |   |-- kc-theme-boot.css
|   |   |-- kc-public-shell.css
|   |   |-- admin-shell.css
|   |   |-- product.css
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
|   |-- unit/
|   |-- integration/
|   |-- contract/
|   |-- structure/
|   |-- a11y/
|   |-- fixtures/
|   `-- e2e/
|-- scripts/
|   |-- validate-version-map.js
|   |-- validate-repository-structure.js
|   |-- validate-script-chains.js
|   |-- validate-public-routes.js
|   |-- hygiene-check.js
|   `-- inject-env.js
|-- admin/                         5 HTMLs admin
|-- *.html                         17 HTMLs publicos
|-- supabase/
|-- sw.js
|-- vercel.json
|-- package.json
|-- VERSION.json
|-- CHANGELOG.md
|-- README.md
|-- RELATORIO-KINOCAMPUS-V33.md
|-- RELATORIO-KINOCAMPUS-V34.md
|-- RELATORIO-KINOCAMPUS-V35.md
|-- RELATORIO-KINOCAMPUS-V36.md
`-- RELATORIO-KINOCAMPUS-V37.md
```

---

## 3. Grupos JavaScript

O gate V15 permanece ativo: nenhum arquivo `.js` pode existir diretamente em `assets/js/`.
Todo modulo deve permanecer em um dos grupos canonicos abaixo.

| Grupo | Arquivos | Responsabilidade |
|---|---:|---|
| `assets/js/boot/` | 6 | Cadeia de inicializacao compartilhada por todos os HTMLs |
| `assets/js/core/` | 11 | Runtime central: i18n, auth UI, perfil, tema, notificacoes, widgets e shell publico |
| `assets/js/api/` | 16 | Cliente Supabase, submodulos KCAPI e facade `window.KCAPI` |
| `assets/js/utils/` | 8 | Helpers de string, formatacao, DOM, identidade, taxonomia, localizacao e apresentacao |
| `assets/js/features/` | 10 | Comentarios, busca, filtros, banners, ranking, lazy loading e pull-to-refresh |
| `assets/js/features/create-post/` | 7 | Orquestracao, schema, campos, render, midia, resolvers e submit de criacao |
| `assets/js/shared/` | 7 | Dados compartilhados entre paginas e modulos |
| `assets/js/legacy-shims/` | 1 | Shim transitorio de migracao de posts do usuario |
| `assets/js/components/` | 3 | Componentes reutilizaveis: carousel, toast e voting |
| `assets/js/adapters/local/` | 8 | Persistencia localStorage por dominio |
| `assets/js/adapters/supabase/` | 11 | Persistencia Supabase por dominio |
| `assets/js/controllers/public/` | 31 | Controllers das 17 paginas publicas |
| `assets/js/controllers/admin/` | 10 | Controllers das 5 paginas admin |

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
| `assets/css/product.css` | Producao | Pagina de produto |
| `assets/css/future-split/` | Stubs | Preparacao para split futuro; nao carregar em producao sem gate visual |

O split CSS segue pendente de execucao funcional. V27 define o gate visual/a11y minimo antes de qualquer alteracao CSS; V28 mapeia risco SQL de busca sem alterar migrations; V29 define evidencias operacionais para Supabase Advisor sem tocar dashboard; V30 define sandbox de providers de notificacao sem configurar secrets; V31 organiza triagem autenticada sem executar QA real; V32 define quando Playwright E2E e evidencia obrigatoria; V33 separa falha LHCI de ambiente de regressao real; V34 reconcilia a11y/i18n antes de backlog funcional; V35 define readiness e rollback antes de qualquer CSS; V36 consolida a sequencia segura para implementacoes futuras; V37 exige gate de entrada com filescope, evidencia e rollback antes de qualquer patch funcional.

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
| `docs/ops/` | Runbooks operacionais, invariantes Vercel/Supabase, auditoria unaccent/FTS, evidencias Advisor e sandbox de providers |
| `docs/planning/` | Inventarios V18, plano V19, ledger V24, readiness V26, readiness CSS V35, roadmap V36 e gate funcional V37 |
| `docs/qa/` | Artefatos ativos de QA manual, RLS, XSS, reports V26, template de gate funcional V37, gate visual/a11y V27, matriz autenticada V31, politica E2E V32, politica LHCI V33 e plano a11y/i18n V34 |

### 5.2 Archive

`docs/archive/` e o unico local canonico para documentos historicos. Ele contem:

| Subdiretorio | Conteudo |
|---|---|
| `relatorios/` | Relatorios de encerramento V9, V11, V13-V32 |
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

A politica V22 limita a raiz a no maximo 5 relatorios recentes. Em V37, a janela operacional e:

- `RELATORIO-KINOCAMPUS-V33.md`
- `RELATORIO-KINOCAMPUS-V34.md`
- `RELATORIO-KINOCAMPUS-V35.md`
- `RELATORIO-KINOCAMPUS-V36.md`
- `RELATORIO-KINOCAMPUS-V37.md`

Relatorios anteriores devem ser movidos com `git mv` para `docs/archive/relatorios/`.

---

## 6. Testes e Gates

| Comando | Responsabilidade esperada |
|---|---|
| `npm run check:version` | Valida `VERSION.json`, branch canonica e runtime JS `8.6.0` |
| `npm run check:structure` | Valida 156 itens estruturais + raiz `assets/js/` limpa |
| `npm run check:scripts` | Valida cadeias de scripts nos 22 HTMLs |
| `npm run check:routes` | Valida 17 rotas publicas + 5 admin |
| `npm run check:hygiene` | Valida higiene estatica de runtime, branch e changelog |
| `npm run check:all` | Executa os 5 gates acima |
| `npm test` | Mantem 134/134 suites e 3046/3046 testes Jest |
| `npm run test:e2e` | Evidencia Playwright; depende de ambiente local/provider |
| `npm run lhci` | Evidencia Lighthouse; depende de ambiente local/provider |

---

## 7. Regras de Manutencao

| Regra | Motivo |
|---|---|
| Manter `frontendRuntimeVersion=8.6.0` ate release funcional coordenado | Evita drift entre app documental e runtime JS |
| Usar `git mv` ao mover arquivos rastreados | Preserva historico Git |
| Nao editar JS funcional, CSS de producao, HTMLs ou migrations em versoes documentais | Preserva estabilidade da plataforma |
| Atualizar validadores quando a estrutura canonica mudar | Mantem `check:all` como fonte operacional |
| Atualizar `docs/index.md`, `README.md`, `CHANGELOG.md`, `VERSION.json` e relatorio da versao | Mantem navegabilidade e status coerentes |
| Manter historico em `docs/archive/` | Reduz ruido em busca e revisao de docs ativos |
| Manter `docs/qa/` apenas para QA ativo | Evita confundir evidencia historica com checklist operacional |

---

## 8. Delta V17 a V37

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
