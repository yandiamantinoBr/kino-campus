# Changelog

## [8.2.6.2] - 2026-03-19

### Objetivo
- Patch técnico pós-release focado em contrato operacional Vercel/Supabase, higiene de release e guardrails de regressão.

### Changed
- Bump coordenado da versão canônica do frontend para `8.2.6.2` em `README.md`, `assets/js/kc-env.js`, `assets/js/kc-api.client.js`, `assets/js/kc-supabase.client.js`, `assets/js/kc-auth.ui.js` e `assets/js/kc-profiles.client.js`.
- `kc-profiles.client.js` e o fallback de sync em `kc-api.client.js` deixaram de persistir `email` no `upsert` de `profiles`.
- `auth-callback.html`, `create-post.html` e `search-results.html` passaram a carregar `assets/css/kc-theme-boot.css` junto de `assets/js/kc-theme-boot.js`.

### Added
- `docs/qa/README.md`: mapa curto dos artefatos históricos e canônicos de QA.
- `docs/ops/vercel-supabase-invariants.md`: resumo operacional dos invariantes entre Vercel, `inject-env.js`, `kc-env.js`, manual avatar policy e Edge Function.
- `scripts/hygiene-check.js`: checagem local mínima para drift de versão, theme boot, inline handlers, contrato de `profiles` e invariantes estáticos de deploy.

### Fixed
- Contrato de perfil alinhado para não tratar `profiles.email` como parte do perfil público sincronizado.
- Drift de release metadata no escopo ativo do frontend.

---

## [8.2.5.0] - 2026-02-25

### Objetivo
- Segurança CSP: remoção de `'unsafe-inline'` da diretiva `script-src` (BUG-003 do Deep Code Review V8.2.2.0).

### Changed
- `vercel.json`: removido `'unsafe-inline'` de `script-src`; mantido `'strict-dynamic'` e `https://cdn.jsdelivr.net`
- `auth-callback.html`: scripts inline substituídos por `kc-theme-boot.js` (theme boot) e novo `kc-auth-callback.js` (handler de confirmação)
- `create-post.html`, `search-results.html`, `moradia.html`, `eventos.html`, `oportunidades.html`: bloco inline de theme boot substituído por `<script src="assets/js/kc-theme-boot.js">`

### Added
- `assets/js/kc-auth-callback.js`: handler de confirmação de e-mail extraído de `auth-callback.html`; lógica idêntica, agora em arquivo externo para conformidade com CSP

### Fixed
- BUG-003 (P1): CSP com `'unsafe-inline'` — eliminado; browsers modernos usam `'strict-dynamic'`
- BUG-010 (P2): `auth-callback.html` criava script inline independente — agora externalizado

---

## [8.2.4.0] - 2026-02-25

### Objetivo
- Micro-sprint de confiabilidade e Rate Limiting do formulário de publicação (`v8.2.4.0 - Form Reliability & Rate Limiting`).
- Foco exclusivo no formulário de criação de post e suas consequências no front-end.

### Status das Entregas

**8.2.4.1 — Blindagem de múltiplos cliques (Anti-Spam) — VERIFICADO/JÁ IMPLEMENTADO**
- A proteção contra submissão concorrente (`kcCreateState.submitting` flag + `submitBtn.disabled = true` + texto "Publicando..." + bloco `finally {}` de reset) já estava operacional em `kc-core.js` (função `kcHandleCreateSubmit`) desde a V8.2.0.0.
- O modal é criado uma única vez via `kcEnsureCreateModal()`, sem memory leak de listeners.
- Nenhuma alteração necessária — comportamento P0 bloqueado conforme planejado.

**8.2.4.2 — Limites e tipagem no DOM — VERIFICADO/JÁ IMPLEMENTADO**
- `maxlength="80"` no campo Título: já renderizado via schema (`maxLength: 80` em `kcBuildFieldsForModule`).
- Campo Preço com `inputmode="decimal"` + `pattern` BRL: já implementado via `moneyFieldMeta` em `kc-core.js`.
- Validação em Português: `setCustomValidity()` com mensagens PT-BR já presentes no `kcHandleCreateSubmit`.
- `word-break: break-word` + `-webkit-line-clamp` nos cards do feed: já presentes em `.kc-card__title` e `.kc-card__description-preview`.
- Nenhuma alteração necessária — comportamento P1 sanado conforme planejado.

**8.2.4.3 — Refinamento de UI (Espaçamentos Modal) — APLICADO**
- `assets/css/styles.css` — `.kc-create-form`: gap atualizado de `14px` para `16px` (respiração uniforme entre grupos).
- `assets/css/styles.css` — `.kc-create-group`: adicionado `margin-bottom: 24px` (respiro visual abaixo de cada bloco de campos).
- `assets/css/styles.css` — `.kc-create-submit`: adicionado `margin-top: 16px` (descolamento do botão da dica/grupo acima).

### Arquivos Alterados
- `assets/css/styles.css` — 3 regras de espaçamento no modal de criação (`.kc-create-form`, `.kc-create-group`, `.kc-create-submit`)

### Branch
- `kinocampus-V8.2.4-CREATE-POST-FIX`

### Mini-changelog
- `fix(form):` Estado de loading (disabled + "Publicando...") no botão de criação já operacional — confirmado via auditoria V8.2.4.1.
- `sec(form):` Limites `maxlength`, `inputmode` e validação PT-BR já operacionais — confirmado via auditoria V8.2.4.2.
- `fix(ui):` Ajustados espaçamentos internos do modal (gap 16px, margin-bottom 24px nos grupos, margin-top 16px no submit) — entregue V8.2.4.3.

---

## [8.2.2.0.x] - 2026-02-23

### Fixed
- Fix regressão de feed vazio causada por conflito Git não resolvido em scripts críticos (`kc-api.client.js`/`kc-core.js`).

### Impacto funcional
- Arquivos afetados: `assets/js/kc-api.client.js` e `assets/js/kc-core.js`.
- Impacto observado antes do saneamento: Home e páginas de feed (`index.html`, `explore.html`, `community.html`) podiam abrir com feed vazio por quebra de execução JavaScript.
- Resultado após saneamento: inicialização do fluxo de feed restabelecida, com renderização normal de posts conforme disponibilidade de dados.

## [8.2.2.0.3] - 2026-02-23

### Added
- QA kit atualizado para a esteira Cleanroom V8.2.2.0:
  - `docs/qa/rls-smoke.sql` com placeholders padronizados (`__POST_ID__`, `__OTHER_PROFILE_ID__`) e blocos guiados para seleção de dados reais.
  - `docs/qa/e2e-checklist.md` revisado para versão `V8.2.2.0` com placeholders explícitos de URL Vercel (`__VERCEL_PROD_URL__`, `__VERCEL_PREVIEW_URL__`).
  - Templates operacionais de QA consolidados em `docs/qa/report-v8.2.2-run1.md` e `docs/qa/report-v8.2-final.md`.

## [8.2.2.0] - 2026-02-23

### Objetivo
- Release candidate cleanroom de fechamento dos LOTEs 1-3: remover bloqueadores de interação, estabilizar escrita/persistência no Supabase e concluir QA/documentação final.

### Changed
- Bump em lote para `8.2.2.0` nos módulos centrais: `assets/js/kc-env.js`, `assets/js/kc-api.client.js`, `assets/js/kc-supabase.client.js`, `assets/js/kc-auth.ui.js`.
- `KCAPI.votePost(postId, direction, options?)` atualizado para fluxo idempotente em Supabase (delete+insert com recuperação de conflito) e logs estruturados `[KCAPI][votes]`.
- `kc-core` com lock de voto por post (`in-flight`) para evitar corrida de cliques e rollback de UI em falha.
- `product.html`/`product.controller.js` mantidos em binding via `data-action` + listeners (`Compartilhar`, `Denunciar`, `Enviar comentário`, `Like comentário`) com logs temporários `[RC-8220][L1]`.
- Varredura de handlers inline (`onclick/onchange/onsubmit/oninput`) sem evidência de handler inline ativo em runtime (somente ocorrências em comentário/doc legados).
- `KCAPI.createPost` reestruturado por etapa (`AUTH_SESSION`, `VALIDATE_FORM`, `INSERT_POST`, `UPLOAD_STORAGE`, `INSERT_POST_MEDIA`, `FETCH_CREATED_POST`) com log padronizado `[KC][CREATE_POST]`.
- `kc-core` passou a exibir feedback de erro com `step` quando houver diagnóstico (`Falha no passo <STEP>...`).
- `admin-reports.controller.js` removeu confirmação otimista: sucesso apenas após verificação de persistência no Supabase (`verifyActionPersistence`).
- `admin/reports.html` alinhado ao comportamento real de persistência confirmada.
- `docs/qa/rls-smoke.sql` robustecido para evitar falso bug de colisão (`gen_random_uuid()` no Test 3).
- QA kit: rls-smoke + e2e checklist + report templates.
- Referência: Cobre validação pós-rescue fix anterior (regressão de feed vazio em script crítico).

### Known Issues
- Warnings de navegador vistos no vídeo (Tracking Prevention, autocomplete e aviso de `aria-hidden`) permanecem de baixo impacto funcional e não bloqueiam fluxos core.

## [8.2.0.0] - 2026-02-22

### Objetivo da V8.2
- Cutover de saneamento cleanroom + QA, sem adição de features, com foco em disciplina de versão e risco mínimo de regressão.

### Gates / Critérios de sucesso
- Versão única dos módulos centrais alinhada em `8.2.0.0` (`kc-env`, `kc-api.client`, `kc-supabase.client`, `kc-auth.ui`).
- `README.md` e `CHANGELOG.md` refletindo o estágio V8.2 e a microentrega `8.2.0.0`.
- Validação estática sem drift de versão nos módulos centrais e smoke de navegação/auth sem erros novos no console.

### Changed
- Bump em lote das constantes `VERSION` para `8.2.0.0` nos módulos centrais de front.
- Documentação de cutover V8.2 registrada no `README.md` e neste `CHANGELOG.md`.

## [8.1.12.0] - 2026-02-22

### Added
- Realtime opcional de feed via `KCSupabase.subscribeNewPosts({ filter, onPost })` e fachada `KCRealtime.subscribeNewPosts`.
- Banner de buffer no feed (“Novo post disponível”) com botão para inserir cards no topo sem reload.
- Cleanup explícito em `KCControllers.createFeedPager()` com `destroy()` e unsubscribe no `pagehide`.

### Changed
- Controller de feed com anti-duplicação reforçada (aliases de ID + buffer IDs) para paginação + realtime.
- Estilos para banner realtime e highlight temporário de novos cards (`.kc-card--new`), incluindo ajuste para mobile 360px.
- Bump da versão dos módulos de front para `8.1.12.0` (`kc-env`, `kc-api.client`, `kc-supabase.client`, `kc-auth.ui`).
- README atualizado com mapa de versão corrente e nota de realtime opcional no feed.

## [8.1.11.1] - 2026-02-21

### Added
- Migration `supabase/migrations/v8.1.11.1_admin_reports_threshold_notify.sql` com estratégia event-driven (trigger em `public.reports` -> HTTP assinado para Edge Function).
- Edge Function `supabase/functions/notify-admin-reports-threshold/index.ts` para:
  - validar `post_id` e assinatura HMAC,
  - contar reports abertos,
  - agregar motivos (`reason`),
  - enviar webhook admin com link do post,
  - aplicar anti-spam por janela usando `public.audit_log` (`reports_threshold_notified`).
- Guia operacional/QA em `docs/qa/v8.1.11.1-admin-reports-threshold.md`.

### Changed
- README atualizado com ordem de migrations até `v8.1.11.1` e com seção de configuração/deploy da nova Edge Function.

## [8.1.8.2] - 2026-02-21

### Changed
- Movido `backend/` para `docs/legacy/backend-placeholder/` como referência histórica/placeholder.
- Adicionado `docs/legacy/backend-placeholder/README.md` com status de legado e esclarecimento de que o runtime oficial é front estático + Supabase.
- Atualizadas notas de readiness para apontar o novo local legado e evitar entendimento de backend ativo no fluxo atual.
- Adicionada política de governança SQL no `README.md` com seção **Fonte Única de Verdade (Banco)**.
- Definida regra explícita de que mudanças críticas de banco (auth, `verified`, policies, triggers, RLS, storage policies, grants/revokes) só podem existir em `supabase/schema-*.sql` e `supabase/migrations/*.sql`.
- Formalizado procedimento obrigatório para SQL fora do fluxo oficial: mover para `docs/legacy/sql/` e registrar motivo de legado no `docs/legacy/sql/README.md`.
- Ajustado texto de nota histórica para reduzir ambiguidade, deixando explícito que se trata de **ajuste histórico já consolidado** na esteira oficial.

## [8.1.8.1] - 2026-02-21

### Changed
- Unificação da versão dos módulos de front para uma versão-alvo única `8.1.8.1`.
- Atualizadas as constantes `VERSION` em:
  - `assets/js/kc-env.js` → `8.1.8.1`
  - `assets/js/kc-api.client.js` → `8.1.8.1`
  - `assets/js/kc-supabase.client.js` → `8.1.8.1`
  - `assets/js/kc-auth.ui.js` → `8.1.8.1`
- Revisada a referência visual de versão no modal de autenticação (`Auth UI v8.1.8.1`).

### Release policy
- Para evitar drift entre módulos, todo release de front deve aplicar **bump em lote** das constantes `VERSION` dos arquivos mapeados no README e neste changelog.
