# Changelog

---

## [Unreleased]

### Fixed
- `v11.19.0`: adicionada a migration `v9.3.3.0_supabase_operational_rls_fk.sql` para otimizar as policies de `notifications`, `post_view_events` e `kc_invited_emails` com `initplan` (`(select auth.uid())`) e eliminar overlap de policies SELECT permissivas nas trilhas de analytics e convites.
- `v11.19.0`: adicionados os índices `idx_kc_invited_emails_invited_by` e `idx_post_view_events_user_id`, cobrindo os foreign keys ainda sinalizados pelo Advisor do Supabase.
- `v11.18.0`: `KCAPI.getProfileHighlightsCount(...)` passou a aceitar `params` e a encaminhá-los corretamente para o driver ativo, eliminando o drift de assinatura em relação a `getProfileHighlights(...)` e `getMySavedPostsCount(...)`.
- `v11.18.0`: `local.adapter.js` e `supabase.adapter.js` passaram a aceitar a mesma assinatura de `getProfileHighlightsCount(profileId, params = {})`, preservando a semântica highlight-only e a paridade de fallback entre os drivers.
- `v11.17.0`: `admin-banners.controller.js` passou a validar acesso administrativo via `KCAPI.getCurrentUser()` + consulta a `profiles.is_admin`, alinhando a tela de banners ao mesmo contrato moderno já usado nas outras superfícies admin.
- `v11.17.0`: a tela admin de banners deixou de carregar a listagem após timeout sem sessão validada, substituindo o fallback implícito por uma espera controlada de hidratação de auth e por mensagens explícitas de erro/acesso negado.
- `v11.16.0`: o preload do shell administrativo passou a ser liberado por `admin-shell.js`, removendo a duplicação de scripts inline que faziam `document.documentElement.classList.remove('kc-loading')` em cada uma das 5 páginas admin.
- `v11.16.0`: as 5 telas administrativas passaram a compartilhar o mesmo bootstrap HTML com `kc-loading kc-theme-preload`, enquanto `admin-shell.css` assumiu a regra de congelar transições durante o preload em vez de depender de blocos inline divergentes.
- `v11.15.2`: `account-setup.controller.js` passou a normalizar `social_links` e `social_visibility` durante `populateForm()`, reaproveitando os helpers shared e evitando que toggles de visibilidade antigos vazem entre hidratações parciais do onboarding.
- `v11.15.2`: a coleta e hidratação das redes sociais do onboarding agora dependem de listas canônicas de chaves derivadas de `SOCIAL_ORDER`, com reset determinístico de todos os checkboxes e preservação do default de WhatsApp apenas quando o perfil ainda não possui configuração salva de visibilidade.
- `v11.15.1`: `account-setup.controller.js` passou a gerar a prévia de contato do onboarding via `buildContactAction`, alinhando o bloco de conta ao comportamento real do CTA público dos anúncios.
- `v11.15.1`: a prévia do onboarding agora reage corretamente ao toggle `Permitir contato público nos anúncios`, exibindo a alternativa segura de `Ver perfil` quando o contato público está desligado.
- `v11.15.0`: `settings.controller.js` passou a gerar o `postUrl` da prévia de contato a partir de `KCUtils.buildProductDetailHref('demo')`, alinhando o bloco de conta/perfil ao caminho canônico `_product.html?id=...` e removendo o drift residual com `product.html?id=demo`.
- `v11.15.0`: adicionada regressão estática em `tests/settings-contact-preview-links.test.js` para impedir que o preview de contato em `settings` volte a fabricar URLs humanas legadas fora do helper canônico.
- `v11.14.0`: `profile.controller.js` e `my-posts.controller.js` passaram a usar a rota canônica `_product.html?id=...` nas navegações humanas para detalhe de publicação, removendo o drift residual com `product.html?id=...` nessas superfícies.
- `v11.14.0`: `KCUtils` passou a expor `buildProductDetailHref(...)`, permitindo que perfil e listagens do usuário compartilhem a mesma construção de URL para o detalhe da publicação.
- `v11.13.1`: `product.controller.js` passou a reutilizar um helper compartilhado de cópia com fallback para `document.execCommand('copy')`, deixando o compartilhamento por cópia funcional mesmo em navegadores com restrição à Clipboard API.
- `v11.13.1`: os popovers de `Compartilhar`, `Salvar` e `Marcar na Agenda` na página de produto passaram a depender de um único listener global de `Escape`, reduzindo wiring duplicado e drift interno entre as três ações.
- `v11.13.1`: o fluxo de `Copiar link` passou a registrar tracking de compartilhamento também quando a cópia é concluída com sucesso, alinhando a ação de link ao caminho já existente do WhatsApp.
- `v11.13.0`: `kc-notifications.js` passou a manter o dropdown operacional após rerenders internos, movendo as ações de `Marcar todas como lidas` e clique dos itens para delegação no root estável do componente.
- `v11.13.0`: o dropdown agora reaplica o agendamento de leitura visível após rerenders e limpa timers pendentes no fechamento, evitando que a UI perca ações quando novas notificações chegam em realtime.
- `v11.12.0`: `kc-create-post.js` passou a derivar um conjunto canônico de campos ativos antes de montar o payload final, impedindo que valores condicionais antigos como `condicao`, `orcamento`, `recompensa`, `entrega`, `vagas`, `regimeContratacao` e `preco` vazem entre combinações diferentes do formulário.
- `v11.12.0`: adicionadas regressões em `tests/kc-create-post-active-fields.test.js` para compra e venda, caronas e eventos, travando o comportamento de campos ativos sem apagar o rascunho preservado no modal.
- `v11.11.0`: removidas as implementações sombreadas de `addComment`, `normalizeCommentForRender`, `_renderCommentList`, `deleteComment` e `submitComment` em `kc-comments.js`, reduzindo drift interno sem alterar contratos públicos de comentários, replies ou renderização.
- `v11.11.0`: adicionadas regressões para reply local com `parentId`, exclusão local em cascata e prevenção de reintrodução de declarations duplicadas em `tests/kc-comments-shadow-cleanup.test.js`.
- `v11.10.0`: `KCAPI` passou a expor snapshot de sessão, refresh silencioso e invalidação explícita para analytics de produto e comentários Supabase, reduzindo spinner e fetch redundante na página de detalhe sem mexer em contratos públicos.
- `v11.10.0`: `product.controller.js` reaproveita analytics do autor a partir de cache de sessão e só rerenderiza o painel quando os números realmente mudam.
- `v11.10.0`: `kc-comments.js` passou a hidratar a lista de comentários do produto a partir de snapshot local antes do refresh em segundo plano, com invalidação após criação, like, edição e exclusão.
- `v11.9.0`: `Top Contribuidores` passou a reutilizar snapshot de sessão com revalidação silenciosa e deduplicação de request em `kc-ranking.js`, evitando spinner e rerender integral desnecessários na home e nas sidebars dos módulos ao recarregar a página ou alternar o período.
- `v11.9.0`: `voting.js` passou a persistir score e direção de voto por sessão, reaplicando `kc-vote-score` e estado ativo imediatamente após reload e deixando o refresh visível condicionado à expiração ou ausência do snapshot local.
- `v11.8.0`: removido o bloco redundante de normalização dentro de `localCreatePost`, deixando `prepareLocalPostForPersistence(...)` como fonte única de preparação do payload local, com teste direto de regressão para criação de post em `compra-venda`.
- `v11.7.0`: endurecida a paridade entre `local.adapter.js` e `kc-api.client.js`, adicionando suporte local para perfil, mutações de post, posts do usuário, salvos, highlights, notificações e convites, com testes de contrato para evitar regressões entre `KCAPI`, `LocalAdapter` e `SupabaseAdapter`.
- `v11.6.0`: endurecido o mobile em iOS Safari ao impedir que `kc-pull-to-refresh.js` sequestre gestos horizontais do hero, `kc-ranking-users`, `kc-feed-tabs` e `kc-*-mobile-rail`, além de liberar `pinch-zoom` no auth modal e no `kc-create-modal` e fixar `font-size: 16px` nos inputs do auth card para evitar auto-zoom.
- `v11.5.0`: restaurado o `Top Contribuidores` dos 6 módulos públicos ao substituir o bootstrap inline de `kc-ranking.js` por carregamento externo deferido, compatível com a `Content-Security-Policy` de produção em `vercel.json`.

### Docs
- `v11.19.0`: `docs/db-schema.md`, `docs/rpc-catalog.md` e `docs/ops/vercel-supabase-invariants.md` passaram a refletir a trilha real de convites externos, os novos índices de cobertura e os residuals operacionais do Supabase que seguem fora do escopo da migration.
- `v11.19.0`: atualizado o `README.md` e o relatório v11 para registrar a auditoria operacional do Supabase como fase concluída da rodada e abrir explicitamente a continuidade em `v11.20.0`.
- `v11.19.0`: fechamento documental consolidado com preview `dpl_YyTeTEZ3gnxYYCc2a2TL3FXVV4Ff`, deploy de produção `dpl_J8VA2ur4bwJn4uffHV8eNuVouh3G` e validação publicada em `www.kinocampus.com.br`.
- `v11.18.0`: atualizado o `README.md` e o relatório v11 para registrar o fechamento da rodada contratual pequena entre `KCAPI` e adapters e abrir explicitamente a continuidade em `v11.19.0`.
- `v11.18.0`: fechamento documental consolidado com a PR funcional `#263`, preview `dpl_3GNRcm9EzwCwgcWRFkZrN8j4kSpv` e deploy automático pós-merge `dpl_3LstWGN6dbR65McLd9hoEZiDQUdk`, todos homologados via Vercel MCP.
- `v11.17.0`: atualizado o `README.md` e o relatório v11 para registrar a primeira fatia de controller do admin pós-v10 e abrir explicitamente a continuidade em `v11.18.0`.
- `v11.17.0`: fechamento documental consolidado com a PR funcional `#261`, preview `dpl_EHA4UFZkbLASBPiQTFc45mfWJUnx`, deploy de produção `dpl_EAzPU5vMhD6wmyYyWPBYxgjRj44R` e validação publicada em `www.kinocampus.com.br`.
- `v11.16.0`: atualizado o `README.md` e o relatório v11 para registrar o início da consolidação do admin pós-v10 e abrir explicitamente a continuidade em `v11.17.0`.
- `v11.16.0`: fechamento documental consolidado com a PR `#259`, preview `dpl_Cxd3cRgJHpqfRNXC9wR1zdZ8rSch`, deploy de produção `dpl_JQL419g5PzKoNrr5uDi386YVwQzK` e validação publicada em `www.kinocampus.com.br`.
- `v11.15.2`: atualizado o `README.md` e o relatório v11 para registrar a terceira fatia de `account-setup`, fechar a macrofase atual de conta/onboarding/settings e abrir explicitamente a continuidade em `v11.16.0`.
- `v11.15.2`: fechamento documental consolidado com a PR `#257`, preview `dpl_CPiGz5Y1hnGzSg58ean6GRimAj3d`, deploy de produção `dpl_9UDrj8vb3NkJzqDPPFZmeqAgUasq` e validação publicada em `www.kinocampus.com.br`.
- `v11.15.1`: atualizado o `README.md` e o relatório v11 para registrar esta segunda fatia de `account-setup`/onboarding e abrir explicitamente a continuidade em `v11.15.2`.
- `v11.15.1`: fechamento documental consolidado com a PR `#255`, preview `dpl_5cAB1wgjGki748PKLeYFqEAgp83J`, deploy de produção `dpl_4YBqUWRySXoXdeFVU5pjQk34qbfY` e validação publicada em `www.kinocampus.com.br`.
- `v11.15.0`: atualizado o `README.md` e o relatório v11 para registrar esta primeira fatia de `settings`/conta e abrir explicitamente a continuidade em `v11.15.1`.
- `v11.15.0`: fechamento documental consolidado com a PR `#253`, preview `dpl_7iH9AyEcMsviriav3hwCQUfuv1g6`, deploy de produção `dpl_4iiQjG2zjNUhYyo6Z3n9M6D3yhGp` e validação publicada em `www.kinocampus.com.br`.
- `v11.14.0`: atualizado o `README.md` e o relatório v11 para registrar a rodada inicial de perfil/`my-posts`, deixando `v11.15.0` como próxima iteração sugerida da sequência.
- `v11.13.1`: atualizado o `README.md` e o relatório v11 para registrar o hardening dos popovers da página de produto como continuidade da macrofase `v11.13.x`, deixando `v11.14.0` explícita como próxima iteração sugerida.
- `v11.13.0`: atualizado o `README.md` e o relatório v11 para registrar esta fatia como início da macrofase de produto/interações sociais e abrir explicitamente a continuidade em `v11.13.1`.
- `v11.12.0`: atualizado `docs/module-schemas.md` para refletir a categoria `Ingressos` em `compra-venda` e sincronizado o `README.md` com o novo estado da fase ativa da v11.
- `v11.11.1`: reformulado o roadmap da v11 no relatório para uma sequência contínua e executável de fases `v11.12.0` a `v11.21.0`, deixando explícita a próxima iteração sugerida e o fechamento esperado da rodada.
- `v11.1.0`: baseline documental da v11 iniciada com sincronização entre `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md` e as docs técnicas estruturais (`docs/index.md`, `docs/architecture.md`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/api-contract.md`, `docs/design-system.md`, `docs/env-vars.md`).
- Registrado explicitamente o drift entre a linha funcional/documental `v10/v11` e a versão canônica embutida `8.6.0` que ainda governa parte do frontend e o `scripts/hygiene-check.js`.

---

## [10.0.0] - 2026-04-08 - Admin Panel Overhaul (PRs #215-#222)

### Changed
- Shell administrativo unificado com navegação consistente, active-link mais robusto e responsividade consolidada em `assets/css/admin-shell.css`.
- Controllers admin endurecidos com guardas de estado, paginação mais segura, UX defensiva e redução de listeners duplicados.
- Fluxos administrativos de ajuda e moderação migrados para caminhos server-side mais consistentes, preservando a fachada pública da `KCAPI`.

### Added
- Migration `v10.0.0.0_admin_search_posts_full.sql` com a RPC `public.kc_admin_search_posts_full(...)`.
- Migration `v10.0.1.0_admin_help_requests_pagination.sql` com a RPC `public.kc_admin_list_help_requests_paged(...)`.

### Fixed
- Dashboard admin com debounce/cancelamento mais previsíveis, correções em audit log, export, ranking e modal.
- Reports admin com paginação progressiva, confirmação explícita para exclusão e fechamento consistente de modal.
- Help requests admin paginadas sobre `public.help_requests`, com bind único, validação de enums e fallback seguro.
- Invite admin com feedback de clipboard centralizado e cleanup de polling.

---

## [9.4.4] - 2026-04-07 — fix/v9.4.4 (PR #213)

### Fixed
- `product.controller.js`: os 3 pontos de chamada de `kc-comments.js` (`renderComments`, `submitComment`, `formatText`) agora usam `KCLazyLoader.load('assets/js/kc-comments.js', callback)` em vez de checar `typeof window.xxx === 'function'` diretamente. Garante que o script seja carregado antes de executar, independente de o usuário ter scrollado até a seção de comentários ou não.
- `kc-comments.js`: removida a linha `window.renderComments = renderComments` adicionada erroneamente no v9.4.3 (redundante — scripts clássicos não-IIFE expõem funções em `window` automaticamente via hoisting).

### Root Cause
`kc-comments.js` é carregado via `IntersectionObserver` (v9.4.0). Se o usuário não rolar até `.kc-comments-section`, o script nunca é carregado e os 3 checks `typeof window.xxx === 'function'` sempre retornam `false` — comentários não aparecem, preview não funciona, submit e formatação não respondem.

---

## [9.4.3] - 2026-04-07 — fix/v9.4.3 (PR #212)

### Fixed
- `kc-comments.js`: adicionado `window.renderComments = renderComments` para garantir que o símbolo esteja acessível após lazy loading via `KCLazyLoader.onVisible` (correção parcial — root cause resolvido em v9.4.4).
- `profile.controller.js`: adicionado `if (empty) empty.style.display = 'block'` nos blocos `catch` de `loadPosts`, `loadComments`, `loadRatings` e `loadSaved` — painel de tabs não ficava mais em branco quando a chamada de API falhava.

---

## [9.4.2] - 2026-04-07 — Acessibilidade A11y (PR #211)

### Added
- `index.html`: skip-link `<a href="#kc-main">Pular para o conteúdo principal</a>` + `id="kc-main"` no `<main>`; `aria-label` nos botões do carrossel; `aria-hidden` nos chevrons decorativos.
- 17 arquivos HTML: `aria-label="Alternar tema claro/escuro"` no theme-toggle; `aria-label="Pesquisar"` no searchInput.
- `_product.html`: `aria-hidden` no sharePopover (estado inicial); `aria-label` em 8 botões de formatação e no input de autor; `aria-label` nos botões de compartilhamento.
- `kc-utils.js`: `aria-label` nos botões de voto; `aria-hidden` nos ícones decorativos; `aria-live="polite"` no score de votos.
- `product.controller.js`: `openSharePopover` / `closeSharePopover` gerenciam `aria-hidden`.
- `styles.css`: `.kc-skip-link` (visível no foco via Tab); `:focus:not(:focus-visible)` para dropdown e botão mobile.
- `tests/a11y.test.js`: 17 novos testes de acessibilidade.

---

## [9.4.1] - 2026-04-07 — Otimização de Imagens (PR #210)

### Added
- `supabase.adapter.js`: `compressImage(blob, maxWidth, maxHeight, quality)` via Canvas API — JPEG/PNG/WebP comprimidos para 85%, max 1200×900 (posts) / 400×400 (avatares); GIF: pass-through; fallback para blob original se Canvas falhar. `window.KCCompressImage` exposta para testes.
- `_product.html`: `fetchpriority="high"` na imagem principal (melhora LCP).
- `product.controller.js`: thumbnails com `loading="lazy"` + `decoding="async"`.
- `tests/image-compression.test.js`: 10 novos testes.

---

## [9.4.0] - 2026-04-07 — Lazy Loading JS (PR #209)

### Added
- `assets/js/kc-lazy-loader.js` (novo): `KCLazyLoader` com `load(src, cb)`, `onVisible(selector, src, cb)` (IntersectionObserver, `rootMargin: 200px`) e `onInteraction(selector, events, src, cb)`. Idempotente com cache interno.
- `kc-ranking.js` + `kc-search.js`: init migrado para `readyState` check (suporta carregamento tardio).
- 6 páginas de feed: `kc-ranking.js` substituído por `KCLazyLoader.onVisible('[data-kc-ranking-sidebar]', ...)`.
- `_product.html`: `kc-comments.js` substituído por `KCLazyLoader.onVisible('.kc-comments-section', ...)`.
- `tests/lazy-loader.test.js`: 14 novos testes.

---

## [9.3.2] - 2026-04-07 — Moderação Automática Anti-Spam (PR #208)

### Added
- Migration `v9.3.2.0_anti_spam_moderation.sql`: `kc_check_and_create_post_moderated()` com flood control (3 posts em 10 min → status `pending`), detecção de link spam (≥3 URLs no body → pending), new user trust (conta <24h + primeiro post → pending). Trigger `posts_auto_moderate_on_insert`. Audit log automático. Index `idx_posts_author_created_desc`.
- `supabase.adapter.js`: detecção de `flood_limit_exceeded` → `{ _kcError: 'FLOOD_LIMIT' }`; flag `_kcPending`.
- `kc-create-post.js`: toast de aviso para posts em análise.
- `product.controller.js`: badge "Em análise" azul para posts `pending`; toggle/bump ocultos.
- `tests/anti-spam.test.js`: 18 novos testes.

---

## [9.3.1] - 2026-04-06 — Analytics de Post para Autores (PR #207)

### Added
- Migration `v9.3.1.0_post_analytics.sql`: tabela `post_view_events`, `kc_track_view()`, `kc_get_post_analytics()`, pg_cron `kc_prune_old_analytics()` mensal.
- `product.controller.js`: rastreia visualizações via `kc_track_view` (throttle 30 min por post/usuário); mini-stats de views para autores no modal de ações.
- `kc-api.client.js`: `KCAPI.trackView()` + `KCAPI.getPostAnalytics()`.

---

## [9.1.0.3] - 2026-04-06 — Convites Externos (PRs #203–#206)

### Added
- Edge Function `kc-invite-user`: envia convite por e-mail via Supabase Auth `admin.inviteUserByEmail()`. Verificação HMAC, rate limiting, audit log.
- Tabela `invited_users`: whitelist de e-mails convidados com status de aceite.
- `admin/`: UI de gerenciamento de convites (lista, link copiável, revogar).
- Fixes: CORS expandido, `verify_jwt: false`, audit log paginado.

---

## [9.1.2] - 2026-04-06 — Avaliações de Usuários (PR #202)

### Added
- Tabela `user_ratings`: avaliações 1–5 estrelas entre usuários com campos `category` e `comment`.
- RPCs: `kc_rate_user()`, `kc_get_user_rating()`, `kc_get_user_rating_summary()`.
- UI em `profile.html`: exibição de nota média + histórico de avaliações recebidas.

---

## [9.2.1] - 2026-04-06 — Filtros Avançados nos Feeds (PR #201)

### Added
- `datePreset` nos 6 módulos de feed incremental: `today`, `last7d`, `last30d` (feeds de marketplace); `today`, `next7d`, `thisMonth`, `past` (eventos); `today`, `last3d`, `last7d` (caronas).
- Persistência em URL via `kc-feed-filters.js` (allowlist por módulo).
- Migration `v9.2.1.3_feed_date_presets.sql`: `kc_feed_local_date()`, `kc_feed_event_local_date()`, `kc_feed_matches_date_preset()`, extensão de `kc_get_feed_cursor()` com filtro server-side por data em `America/Sao_Paulo`.

---

## [9.1.0] - 2026-04-04 — Notificações In-App (PRs #198–#200)

### Added
- Tabela `notifications` com Realtime habilitado; triggers automáticos para voto positivo, novo comentário, reply e avaliação recebida.
- RPCs: `kc_get_notifications()`, `kc_mark_notifications_read()`, `kc_mark_all_notifications_read()`.
- UI: sino no header com badge de contagem; dropdown de notificações com link direto ao post; polling + Realtime para atualização em tempo real.
- Fixes: race condition na detecção de auth (#199); CSS `display:none` sobrescrevia JS (#200).

---

## [9.0.4] - 2026-04-04 — Dívida Técnica DB (PR #197)

### Added
- Migration `v9.0.4.0_analytics_retention.sql`: `kc_prune_old_analytics()` — purga `search_queries` > 6 meses e `audit_log` > 1 ano; pg_cron job mensal.
- Migration `v9.0.4.1_legacy_id_soft_deprecate.sql`: `COMMENT ON COLUMN posts.legacy_id` deprecated; `kc_admin_legacy_id_stats()` com métricas de segurança para remoção futura.

---

## [9.0.2] - 2026-04-03 — Cobertura de Testes (PR #196)

### Added
- 12 arquivos de teste novos em `tests/`; `kc-comments.shared.js` e `kc-search.shared.js` (UMD dual-export para funções puras testáveis em Node).
- Cobertura expandida de <5% para 45%+ de linhas (meta: 40%). Total: 333 testes iniciais, crescendo cumulativamente para 447 testes em 26 suites.

---

## [9.0.0] - 2026-04-02 — Fundações v9 (PR #194)

### Added
- 8 arquivos de documentação técnica em `docs/`: `architecture.md`, `api-contract.md`, `db-schema.md`, `rpc-catalog.md`, `module-schemas.md`, `env-vars.md`, `design-system.md`, `index.md`.

### Security
- Bloqueio de SVG em uploads (XSS via SVG inline): removido `image/svg+xml` dos tipos aceitos.
- Validação de magic bytes: `checkImageMagicBytes(blob)` valida os primeiros 12 bytes do arquivo.
- `SESSION_STORE_VERSION` atualizado para `'9.0.0'` (invalida caches de sessão de versões anteriores).

---

## [8.6.0] - 2026-03-30

### Objetivo
- Saneamento de segurança, unificação de versão e hardening de infraestrutura baseado no Relatório Completo de Diagnóstico v8.5.4.

### Security
- `admin-dashboard.controller.js`: corrigido `escHtmlAdmin()` — agora delega para `window.KCUtils.escapeHtml()` com escape completo de 5 caracteres (incluindo aspas simples).
- `vercel.json`: adicionado header `Strict-Transport-Security` (HSTS, max-age 2 anos, preload).
- `vercel.json`: adicionado header `Permissions-Policy` (bloqueia camera, microphone, geolocation, interest-cohort).

### Changed
- Bump coordenado da versão canônica para `8.6.0` em `kc-env.js`, `kc-api.client.js`, `kc-supabase.client.js`, `kc-auth.ui.js`, `kc-profiles.client.js` e `hygiene-check.js`.
- Cache busters atualizados de `?v=8.4.2` para `?v=8.6.0` em todos os 21 HTMLs.

### Infrastructure
- Habilitado `pg_cron` no Supabase com job `kc-expire-old-posts` (diário às 03:00 UTC).
- Verificado configuração SMTP e Leaked Password Protection no Supabase Auth.

---

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
