# Changelog

## [8.2.2.0] - 2026-02-23

### Objetivo
- Fechar o saneamento cleanroom com remoção de bloqueadores, estabilidade mobile e trilha QA final.

### Changed
- **Lote 1:** CSP destravada para Supabase Realtime (`connect-src` com `wss://*.supabase.co`) e botões do detalhe migrados para delegação por `data-action`.
- **Lote 2:** instrumentação detalhada de diagnóstico no fluxo de criação de post e ajustes mobile para modal de criação e banner principal.
- **Lote 3:** script de QA `rls-smoke.sql` consolidado com `gen_random_uuid()` no Test 3 para evitar colisão `23505`, menu mobile padronizado com os 6 módulos e relatório final de QA publicado.

### QA
- Relatório final: `docs/qa/report-v8.2-final.md`.

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
