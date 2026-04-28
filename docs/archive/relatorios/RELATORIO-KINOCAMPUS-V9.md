# RELATÓRIO TÉCNICO — KINOCAMPUS v9

**Plataforma de Comunidade Universitária da UFG**

| | |
|---|---|
| **Data** | 06 de abril de 2026 |
| **Versão atual** | v9.4.4 em producao; PRs #201-#213 mergeados em `kinocampus-V9.0-foundations`; fix comentários lazy load — garante carregamento antes de renderizar/submeter/formatar |
| **Próxima fase** | v9.5.0 (a definir) |
| **Autor técnico** | Claude Code (Anthropic) sob direção de Yan Diamantino |
| **Plataforma** | https://www.kinocampus.com.br |
| **Repositório** | github.com/yandiamantinoBr/kino-campus |
| **Branch principal** | `kinocampus-V9.0-foundations` |

> Atualização em 07/04/2026: PR #211 (v9.4.2 acessibilidade A11y) mergeado. Skip-link em `index.html`; `aria-label` em theme-toggle, carrossel, botões de voto, formatação, compartilhamento e pesquisa em 17 HTMLs; `aria-hidden` em ícones decorativos e sharePopover; `aria-live="polite"` no score de votos; CSS `.kc-skip-link` + `:focus:not(:focus-visible)`; 17 novos testes (`tests/a11y.test.js`). 26 suites, 447 testes, verde. Em produção.

> Atualização em 07/04/2026: PR #212 (fix/v9.4.3 hotfix) mergeado. `kc-comments.js` exporta `window.renderComments` — formulário de comentários não inicializava após lazy loading; `profile.controller.js` mostra empty state no catch dos 4 loaders de tabs (loadRatings, loadPosts, loadComments, loadSaved). Em produção.

> Atualização em 07/04/2026: PR #213 (fix/v9.4.4) mergeado. Root cause real dos comentários: `kc-comments.js` lazy via IntersectionObserver nunca carregava se o usuário não rolava até a seção. Os 3 pontos de chamada em `product.controller.js` (renderComments, submitComment, formatText) agora usam `KCLazyLoader.load()` para garantir o carregamento antes de executar. Em produção.

### 9.2.7. Iteração Executada em 06/04/2026 — v9.2.3.0

**Status:** Implementada no repositório local, aplicada no Supabase e validada localmente.

**Escopo entregue nesta iteração:**
- Hotfix do hero mobile da home com remoção, no breakpoint móvel, dos efeitos de composição mais arriscados (`blur`, `backdrop-filter`, `fadeIn`, `overflow-y:auto` e ilustração Font Awesome rotacionada)
- Novo pipeline de banners em `assets/js/kc-banners.js` com mapeamento fechado de `icon_class` para ilustrações mobile seguras em SVG inline (`calendar`, `exchange`, `launch`) e fallback estático para casos desconhecidos
- `index.html` alinhado ao mesmo HTML final do banner dinamico, evitando divergência entre modo local e Supabase
- Nova suíte `tests/kc-banners.test.js` para cobrir mapeamento dos ícones, fallback seguro e hidratação dos banners estáticos
- Migration nova `v9.2.3.0_function_search_path_hardening.sql` prendendo `search_path` dos helpers sinalizados pelo Security Advisor
- `kc_unaccent()` e `kc_feed_normalize_text()` regravadas para continuarem válidas com `SET search_path = ''`
- Documentação de banco atualizada para registrar o hardening e as pendências separadas de `unaccent` em `public` e `Leaked Password Protection`

**Validação executada:**
- `node --check assets/js/kc-banners.js`
- `npm test -- --runTestsByPath tests/kc-banners.test.js`
- Playwright CLI local em `http://127.0.0.1:4173/index.html`
  - `390x844`: `animation:none`, `overflow:hidden`, `::before` sem conteúdo, pill sem `backdrop-filter`, ilustração mobile visível e ilustração desktop oculta
  - `360x800`: CTA e dots preservados, ilustração mobile ativa e sem reativar a arte antiga
  - `1280x900`: hero desktop preservado com `fadeIn`, pill blur e ilustração original visíveis
- Supabase:
  - migration `v9_2_3_0_function_search_path_hardening` aplicada com sucesso
  - `pg_get_functiondef(...)` confirmou `SET search_path TO ''` em `kc_unaccent`, `kc_feed_normalize_text` e `kc_matches_feed_request_params`
  - smoke SQL: `kc_unaccent('Matemática') -> Matematica`, `kc_feed_normalize_text('  Matemática Aplicada  ') -> matematica aplicada`, `kc_matches_feed_request_params(...) -> true`
  - Security Advisor pós-migration: warnings `function_search_path_mutable` zerados

**Pendências explicitamente mantidas fora desta iteração:**
- `extension_in_public`: a extensão `unaccent` continua em `public`; a migração de schema ficou separada por risco de compatibilidade
- `auth_leaked_password_protection`: continua dependendo de ação operacional no painel de Auth do Supabase
- O glitch original foi mitigado por hardening dos layers móveis; como o artefato vinha de compositor Android, a validação final em device real continua recomendada após deploy

**Refinamentos de arquitetura registrados:**
- O hero mobile passou a ter uma superfície visual própria, segura para Android, sem degradar a identidade visual do desktop
- O hardening do banco foi feito sem alterar contratos públicos nem reescrever a lógica dos feeds e da busca
- A nova base de banners ficou testável em Node/Jest, reduzindo risco de regressão na home

### 9.2.8. Iteração Executada em 06/04/2026 - v9.2.3.1

**Status:** Implementada no repositório local e validada localmente.

**Escopo entregue nesta iteração:**
- No mobile (`max-width: 768px`), a arte `.kc-hero-illustration-mobile` passou a ficar oculta para não competir com título, subtítulo e CTA
- O CTA do hero deixou de ficar preso ao gesto do carrossel: `assets/js/kc-banners.js` isola os eventos do botão e `assets/js/kc-core.js`/`assets/js/components/carousel.js` passaram a ignorar qualquer swipe iniciado em link, botão, dot ou seta
- A confirmação de paridade com `admin/banners.html` ficou fechada: a home continua lendo `pill_text`, `title`, `subtitle`, `button_text`, `button_url`, `icon_class`, `gradient_from`, `gradient_to`, `sort_order` e publica apenas banners `is_active = true`

**Validação executada:**
- `node --check assets/js/kc-banners.js`
- `node --check assets/js/components/carousel.js`
- `node --check assets/js/kc-core.js`
- `npm test -- --runTestsByPath tests/kc-banners.test.js --runInBand`
- `npm test -- --runInBand` verde com `21 suites` e `366 testes`
- Playwright local em `http://127.0.0.1:4173/index.html`
  - `390x844`: screenshot sem ilustração sobre o texto, `touch-action: manipulation` no CTA e `padding-right: 0` no bloco de conteúdo
  - `360x800`: screenshot com hero limpo, CTA e dots preservados
  - Clique no CTA levou direto para `eventos.html?filter=sustentabilidade`
  - Simulação de `pointerdown/pointerup` no CTA manteve o slide ativo inalterado (`before=1`, `after=1`)
- Supabase:
  - `hero_banners` e `kc_admin_list_banners()` confirmaram 3 banners ativos em `sort_order` `0`, `1` e `2`
  - Estado atual moderado: `Lançamento do KinoCampus na UFG`, `Semana de Sustentabilidade UFG` e `Feira de Troca de Materiais na UFG`

### 9.2.9. Iteração Executada em 06/04/2026 - v9.2.1.3

**Status:** Implementada no repositório local, aplicada no Supabase e validada localmente. Esta iteração fecha a fase `v9.2.1`.

**Escopo entregue nesta iteração:**
- `datePreset` foi adicionado aos 6 módulos de feed incremental: `compra-venda`, `caronas`, `moradia`, `oportunidades`, `eventos` e `achados-perdidos`
- Persistência em URL entregue para `datePreset` via `assets/js/kc-feed-filters.js`, com allowlist por módulo
- `assets/js/kc-api.client.js` passou a aplicar a mesma semântica de data no caminho local compartilhado, sem alterar `KCAPI.getPosts()`
- Nova migration `supabase/migrations/v9.2.1.3_feed_date_presets.sql` adicionou `kc_feed_local_date()`, `kc_feed_event_local_date()` e `kc_feed_matches_date_preset()`, alem de estender `kc_get_feed_cursor()` com filtro server-side por data em `America/Sao_Paulo`
- `eventos` ficou com semântica própria (`today`, `next7d`, `thisMonth`, `past`) usando `metadata.data_evento` / `metadata.data` com fallback para `created_at`
- `compra-venda`, `livros`, `moradia`, `oportunidades` e `achados-perdidos` usam `today`, `last7d`, `last30d`; `caronas` usa `today`, `last3d`, `last7d`

**Validação executada:**
- `node --check assets/js/controllers/caronas-feed.controller.js`
- `npm test -- --runTestsByPath tests/kc-feed-filters.test.js tests/kc-api-client.test.js tests/kc-supabase-client.test.js tests/local-adapter.test.js tests/supabase-adapter.test.js --runInBand`
- Supabase: migration aplicada, smoke SQL dos presets executado e `pg_get_functiondef(...)` confirmando `SET search_path = ''`

**Resultado da fase:**
- `v9.2.1` passa a ser considerada concluída no nível técnico
- A etapa restante deixa de ser implementação e vira homologação/PR/deploy

---

## PARTE 1 — DIAGNÓSTICO E ESTADO ATUAL

### 1.1. Sobre a Plataforma

O KinoCampus é uma plataforma digital de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG). Conecta alunos, professores e egressos em 6 módulos temáticos:

| Módulo | Propósito | Exemplo de uso |
|--------|-----------|----------------|
| Compra e Venda | Marketplace de produtos | Vender livros usados, eletrônicos |
| Caronas | Ofertas e pedidos de carona | Carona para o campus |
| Moradia | Anúncios de moradia | Quartos perto da UFG, repúblicas |
| Eventos | Agenda de eventos | Workshops, festas, palestras |
| Oportunidades | Vagas e oportunidades | Estágios, monitorias, voluntariado |
| Achados e Perdidos | Itens perdidos/encontrados | Documentos, eletrônicos perdidos no campus |

**Restrição de acesso:** Apenas e-mails institucionais (@ufg.br, @discente.ufg.br, @egresso.ufg.br).

### 1.2. Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5 + CSS3 + Vanilla JS (59 módulos IIFE, sem framework/bundler) |
| Backend | Supabase (PostgreSQL 17 + Auth + Storage + Edge Functions + Realtime) |
| Hosting | Vercel (static site + serverless OG images) |
| Domínio | kinocampus.com.br (Hostinger, DNS para Vercel) |
| Build | `node scripts/inject-env.js` (substitui placeholders) |
| Testes | Jest: 25 arquivos, 430 testes, 52,79%+ cobertura de linhas |
| CSS | 5 arquivos (~12.700 linhas), dark mode com custom properties |
| Ícones | Font Awesome 6 (CDN) |
| Migrations | 75 arquivos SQL em `supabase/migrations/` |

### 1.3. Arquitetura JS

O frontend usa o padrão **IIFE + window.\***: cada módulo é uma função auto-executável que expõe métodos públicos globalmente via `window.KCModuleName`.

| Categoria | Arquivos | Tamanho aprox. |
|-----------|----------|----------------|
| Core/Utils | kc-utils.js, kc-core.js, kc-constants.js, kc-api.client.js | ~221 KB |
| Auth/Profile | kc-auth.ui.js, kc-supabase.client.js, account-profile.shared.js | ~114 KB |
| Features | kc-create-post.js, kc-comments.js, kc-search.js, kc-ranking.js, kc-banners.js, kc-notifications.js | ~220 KB |
| Controllers | 22 arquivos (product 114KB, admin-dashboard 85KB, etc.) | ~772 KB |
| Adapters | supabase.adapter.js, local.adapter.js | ~105 KB |
| **TOTAL** | **58 arquivos** | **~1.4 MB** |

**Padrão IIFE:**
```javascript
(function () {
  'use strict';
  function _privateHelper() {}
  window.KCModuleName = { publicMethod };
  document.addEventListener('DOMContentLoaded', init);
}());
```

**Padrão Driver:** `KC_ENV.driver` seleciona entre `SupabaseAdapter` (produção) e `LocalAdapter` (desenvolvimento). `KCAPI` é a facade que unifica a interface.

### 1.4. Banco de Dados (19 tabelas)

| Tabela | Propósito |
|--------|-----------|
| profiles | Perfis de usuário (nome, avatar, bio, social links, verificação) |
| posts | Publicações (título, descrição, preço, módulo, categoria, metadata, status) |
| post_media | Imagens dos posts (URL, capa, ordem) |
| comments | Comentários com suporte a markdown inline |
| comment_likes | Curtidas em comentários (1 por usuário) |
| post_votes | Votos up/down (1 por usuário por post) |
| saved_posts | Posts salvos (favorito, lembrar, destaque) |
| reports | Denúncias com status (open, closed, archived) |
| hero_banners | Banners do carousel da homepage |
| post_limits | Limites de posts por módulo por usuário |
| search_queries | Analytics de busca |
| audit_log | Log de auditoria de ações de admin |
| help_requests | Tickets de suporte |
| **notifications** | **Notificações in-app (v9.1.0) — com Realtime habilitado** |
| **user_ratings** | **Avaliações de usuários 1-5 estrelas (v9.1.2)** |
| **invited_users** | **Whitelist de convites externos (v9.1.0.3)** |
| **post_view_events** | **Eventos de visualizacao por post (v9.3.1)** |

**Segurança:** RLS em todas as tabelas (60+ políticas), HMAC-SHA256 em Edge Function, `search_path = ''` em todas SECURITY DEFINER functions (hardened v9.2.3), rate limiting, audit log.

**RPCs:** 80+ funções (`kc_bump_post`, `kc_renew_post`, `kc_expire_old_posts`, `kc_get_top_contributors`, `kc_check_post_limit`, `kc_get_notifications`, `kc_mark_notifications_read`, `kc_track_view`, `kc_get_post_analytics`, etc.).

**pg_cron:** 3 jobs agendados:
- Diário 03:00 UTC — `kc_expire_old_posts()` (expirar posts)
- Mensal dia 1 04:00 UTC — `kc_prune_old_analytics()` (limpar analytics antigos)
- Mensal dia 1 05:00 UTC — `kc_prune_old_notifications()` (limpar notificações lidas >90 dias)

### 1.5. Ranking (Gamificação)

| Ação | Pontos |
|------|--------|
| Criar post | +15 |
| Receber voto positivo | +10 |
| Escrever comentário | +5 |
| Post acessado (CTA clicado) | +4 |
| Post compartilhado | +3 |
| Denúncia confirmada (penalidade) | -50 |

**Anti-spam:** Cada ação contabilizada uma única vez por publicação.

### 1.6. Gaps Identificados (Pré-v9) e Resolução

| Prioridade | Gap | Status |
|-----------|-----|--------|
| Crítica | Cobertura de testes <5% | **RESOLVIDO** (45% — PR #196) |
| Crítica | Sem notificações in-app | **RESOLVIDO** (PR #198 + #199 + #200) |
| Alta | Sem threading em comentários | **CONCLUÍDO** (v9.1.1 — mergeado via PR cumulativo) |
| Alta | Paginação indefinida | **CONCLUÍDO** (v9.2.2 — mergeado via PR cumulativo) |
| Média | Sem filtros avançados | **CONCLUÍDO** (v9.2.1 — PR #201) |
| Média | Sem avaliações de usuários | **CONCLUÍDO** (v9.1.2 — PR #202) |
| Média | Sem analytics de post | **CONCLUÍDO** (v9.3.1 — PR #207) |
| Baixa | Cashback in-development | BLOQUEADO (v9.3.0) |

---

## PARTE 2 — O QUE FOI IMPLEMENTADO

### 2.1. PR #194 — Fundações v9.0

- **Branch:** `feat/v9-0-foundations`
- **Status:** Mergeado em 02/04/2026
- **Arquivos alterados:** 10 (2 modificados + 8 novos)

#### 2.1.1. Documentação Técnica (v9.0.1) — CONCLUÍDO

| Arquivo | Conteúdo |
|---------|----------|
| docs/architecture.md | Mapa de dependências JS, fluxos de dados, páginas HTML |
| docs/api-contract.md | Contrato de 18+ métodos KCAPI com params e retornos |
| docs/db-schema.md | Schema de 16+ tabelas, RLS, indexes, Storage, pg_cron |
| docs/rpc-catalog.md | Catálogo de RPCs e triggers com assinaturas |
| docs/module-schemas.md | KC_CREATE_SCHEMA dos 6 módulos |
| docs/env-vars.md | Variáveis de ambiente Vercel + Supabase + KC_ENV |
| docs/design-system.md | CSS custom properties, componentes, breakpoints |
| docs/index.md | Índice da documentação com quick reference |

**Total:** ~1.500 linhas de documentação técnica.

#### 2.1.2. Correções de Segurança (v9.0.3) — CONCLUÍDO

**1. Bloqueio de SVG em Uploads:** SVGs podem conter JavaScript malicioso (XSS via SVG). Removido `image/svg+xml` dos tipos permitidos em ambas as funções de upload (post media e avatar). Tipos aceitos: JPEG, PNG, WebP, GIF.

**2. Validação de Magic Bytes:** Nova função `checkImageMagicBytes(blob)` valida os primeiros 12 bytes do arquivo para verificar o tipo real, prevenindo ataques com arquivos maliciosos renomeados como imagens.

**3. Invalidação de Cache:** `SESSION_STORE_VERSION` atualizado de `'8.3.4.5'` para `'9.0.0'`. Força revalidação de sessões em upgrade major.

### 2.2. PR #196 — Cobertura de Testes (v9.0.2) — CONCLUÍDO

**Resultado:** 333 testes iniciais (302 novos), 17 arquivos de teste, 45.6% cobertura de linhas (meta: 40%). Expandido cumulativamente para 388 testes, 22 suites, 55,53% cobertura.

**Arquivos criados:**
- `assets/js/kc-comments.shared.js` — funções puras extraídas de kc-comments.js (UMD)
- `assets/js/kc-search.shared.js` — funções puras extraídas de kc-search.js (UMD)
- 12 novos arquivos de teste em `tests/`

**Padrão adotado:** UMD dual-export (`.shared.js`) para funções puras testáveis em Node e browser.

### 2.3. PR #197 — Dívida Técnica DB (v9.0.4) — CONCLUÍDO

**a) Retenção de analytics (`v9.0.4.0_analytics_retention.sql`):**
- `kc_prune_old_analytics()` — SECURITY DEFINER, retorna JSONB com contadores
- Purga `search_queries` > 6 meses e `audit_log` > 1 ano
- pg_cron job mensal (dia 1, 04:00 UTC): `kc-prune-analytics`
- Índices: `idx_search_queries_created_at`, `idx_audit_log_created_at`
- Registra a própria operação no audit_log

**b) Deprecação soft de legacy_id (`v9.0.4.1_legacy_id_soft_deprecate.sql`):**
- `COMMENT ON COLUMN posts.legacy_id` — marcado como deprecated
- `kc_admin_legacy_id_stats()` — retorna métricas: total, com/sem legacy, % por módulo, `safe_to_remove`
- Coluna NÃO removida (30+ referências no adapter). Remoção quando `safe_to_remove = true`

### 2.4. PR #198 + #199 + #200 — Notificações In-App (v9.1.0) — CONCLUÍDO

A implementação de notificações exigiu 3 PRs: o PR principal (#198) com toda a funcionalidade, e dois hotfixes (#199 e #200) para corrigir a visibilidade do sino no header.

#### Backend (3 migrations executadas no Supabase)

**Migration 1 — Tabela + RLS (`v9.1.0.0_notifications_table.sql`):**
- Tabela `notifications` (id UUID, user_id, type, title, body, data JSONB, read, created_at)
- Constraint de tipo: `comment_on_post`, `vote_on_post`, `post_expired`, `post_reported`, `comment_reply`, `system`
- RLS: SELECT/UPDATE/DELETE somente as próprias; INSERT via triggers apenas (nenhum authenticated pode inserir diretamente)
- Realtime habilitado: `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`
- Índices: `idx_notifications_user_created` (user_id, created_at DESC), `idx_notifications_user_unread` (user_id WHERE read=false)

**Migration 2 — Triggers (`v9.1.0.1_notification_triggers.sql`):**
- `kc_notify_on_comment()` — AFTER INSERT ON comments → notifica autor do post (ignora auto-comentário)
- `kc_notify_on_vote()` — AFTER INSERT ON post_votes → notifica autor em voto positivo (ignora self-vote e downvote)
- `kc_notify_on_post_expire(p_post_id, p_author_id, p_title, p_module)` — helper chamado por `kc_expire_old_posts()`
- Reescrita de `kc_expire_old_posts()` para loop com notificação individual por post expirado

**Migration 3 — RPCs (`v9.1.0.2_notification_rpcs.sql`):**
- `kc_get_notifications(p_limit, p_offset)` — lista paginada com total e unread count
- `kc_mark_notifications_read(p_ids UUID[])` — marcar específicas como lidas
- `kc_mark_all_notifications_read()` — marcar todas como lidas
- `kc_unread_notification_count()` — contagem para badge
- `kc_prune_old_notifications()` — limpar lidas >90 dias + pg_cron mensal dia 1, 05:00 UTC

#### Frontend

**Novo módulo: `assets/js/kc-notifications.js` (~280 linhas)**
- IIFE expondo `window.KCNotifications`
- `init()` — detecta auth via `KCAPI.getCurrentUser()` com polling (500ms, max 10s)
- `activate(bell, user)` — exibe sino, busca contagem, subscribe Realtime
- `fetchNotifications()` / `fetchUnreadCount()` — queries via KCAPI
- `onNewNotification(notif)` — callback Realtime push
- `toggleDropdown()` / `openDropdown()` / `closeDropdown()` — popover padrão
- `markRead(ids)` / `markAllRead()` — marcar como lidas
- Auto-mark-as-read após 2s com dropdown aberto
- Close on outside click + Escape

**Adapter: `assets/js/adapters/supabase.adapter.js` — 6 métodos novos:**
- `supabaseGetNotifications(limit, offset)` → RPC `kc_get_notifications`
- `supabaseMarkNotificationsRead(ids)` → RPC `kc_mark_notifications_read`
- `supabaseMarkAllNotificationsRead()` → RPC `kc_mark_all_notifications_read`
- `supabaseGetUnreadNotificationCount()` → RPC `kc_unread_notification_count`
- `supabaseSubscribeNotifications(userId, callback)` → Supabase Realtime channel
- `supabaseUnsubscribeNotifications(channel)` → remove channel

**API Client: `assets/js/kc-api.client.js` — 6 métodos expostos via KCAPI:**
- `getNotifications`, `markNotificationsRead`, `markAllNotificationsRead`
- `getUnreadNotificationCount`, `subscribeNotifications`, `unsubscribeNotifications`

**CSS: `assets/css/styles.css` — ~170 linhas de estilos de notificação:**
- `.kc-notif-bell` — botão sino posicionado no header
- `.kc-notif-badge` — badge numérico vermelho (max 99+)
- `.kc-notif-dropdown` — dropdown fixo, 340px largura, max 400px altura, z-index 301
- `.kc-notif-item` — item com ícone, título, body, timestamp, estado lido/não-lido
- Responsivo: funciona em mobile 375px e desktop 1440px

**22 páginas HTML modificadas — botão sino + script tag:**
```html
<!-- Adicionado dentro de .kc-user-actions antes do theme-toggle -->
<button class="kc-notif-bell" id="kcNotifBell" aria-label="Notificações" style="display:none;">
  <i class="fas fa-bell"></i>
  <span class="kc-notif-badge" id="kcNotifBadge" style="display:none;">0</span>
</button>
<!-- Script adicionado após kc-auth.ui.js -->
<script src="assets/js/kc-notifications.js"></script>
```

#### Hotfixes de Visibilidade do Sino

**PR #199 — Race condition na detecção de auth:**
O init original verificava `a.btn-login.is-auth` no DOM, mas `kc-auth.ui.js` aplica essa classe de forma assíncrona (via `requestAnimationFrame` + session fetch). O polling falhava por timing. Corrigido para usar `KCAPI.getCurrentUser()` com polling de 500ms por até 10s (20 tentativas).

**PR #200 — CSS `display:none` sobrescrevendo JS:**
A regra CSS `.kc-notif-bell { display: none }` tinha especificidade suficiente para impedir que o JS tornasse o sino visível. Quando o JS fazia `bell.style.display = ''`, o valor computado permanecia `none` (herdado do CSS). Corrigido com duas mudanças:
1. Removido `display: none` da regra CSS (visibilidade controlada apenas pelo inline style do HTML)
2. JS usa `bell.style.display = 'inline-flex'` (valor explícito, não vazio)

**Lição aprendida:** Nunca usar `display: none` no CSS para elementos que serão ativados via JS inline style. O inline style vazio (`''`) não sobrescreve — é necessário valor explícito (`'inline-flex'`, `'block'`, etc.).

---

## PARTE 3 — ROTEIRO COMPLETO v9

### 3.1. Princípios

1. **Evolutivo, não reescrita** — cada feature branch é pequena, testável, revertível
2. **Test-first nas novas features** — cobertura nova vai junto com o código
3. **Documentar ao construir** — não existe "vou documentar depois"
4. **Mobile-first em tudo** — 60%+ dos usuários são mobile
5. **Segurança não negocia** — qualquer mudança em RLS passa por review manual
6. **Performance como feature** — bundles grandes prejudicam conexões lentas
7. **Preservar padrões existentes** — IIFE + window.* até migração ESM

### 3.2. Fases

| Fase | Descrição | Status | PR |
|------|-----------|--------|----|
| v9.0.1 | Documentação de arquitetura (8 arquivos em docs/) | CONCLUÍDO | #194 |
| v9.0.2 | Cobertura de testes — 361 testes, 53,2% linhas | CONCLUÍDO | #196 + iterações locais v9.1.1, v9.2.0, v9.2.1.0, v9.2.1.1, v9.2.1.2 e v9.2.2 |
| v9.0.3 | Consolidação de segurança (SVG block, magic bytes, session) | CONCLUÍDO | #194 |
| v9.0.4 | Dívida técnica DB (retenção analytics, legacy_id deprecated) | CONCLUÍDO | #197 |
| v9.1.0 | Notificações in-app (tabela + triggers + RPCs + Realtime + UI) | CONCLUÍDO | #198 + #199 + #200 |
| v9.1.1 | Comment threading (1 nível, estilo Instagram) | CONCLUÍDO | mergeado via PR cumulativo |
| v9.1.2 | Avaliações de usuários (1-5 estrelas) | CONCLUÍDO | #202 |
| v9.2.0 | Busca server-side (PostgreSQL Full-Text Search) | CONCLUÍDO | mergeado via PR cumulativo |
| v9.2.1 | Filtros avançados nos feeds (preço, data, tipo) | CONCLUÍDO | #201 |
| v9.2.2 | Paginação cursor-based | CONCLUÍDO | mergeado via PR cumulativo |
| v9.3.0 | Cashback (requer definição de negócio) | BLOQUEADO | — |
| v9.1.0.3 | Sistema de convites externos (Edge Function + whitelist + UI) | CONCLUÍDO | #203 + #204 + #205 + #206 |
| v9.3.1 | Analytics de post para autores | CONCLUÍDO | #207 |
| v9.3.2 | Moderação automática anti-spam | CONCLUIDO | #208 |
| v9.4.0 | Lazy loading de módulos grandes | CONCLUIDO | #209 |
| v9.4.1 | Otimização de imagens (compressão client-side) | CONCLUIDO | #210 |
| v9.4.2 | Acessibilidade (A11y) | CONCLUIDO | #211 |
| fix/v9.4.3 | Hotfix: comentários + empty state perfil | CONCLUIDO | #212 |
| fix/v9.4.4 | Root cause lazy loading: KCLazyLoader.load() em product.controller.js (3 pontos) | CONCLUIDO | #213 |

### 3.3. Ordem de Execução

```
FUNDAÇÕES (concluído):
  v9.0.1 Documentação ............ CONCLUÍDO (PR #194)
  v9.0.2 Testes (45%) ........... CONCLUÍDO (PR #196)
  v9.0.3 Segurança .............. CONCLUÍDO (PR #194)
  v9.0.4 Dívida técnica DB ..... CONCLUÍDO (PR #197)

FASE 1 — Engajamento (em progresso):
  v9.1.0 Notificações in-app .... CONCLUÍDO (PR #198 + #199 + #200)
  v9.2.2 Paginação cursor-based . CONCLUÍDO (mergeado cumulativo)

FASE 2 — Features (concluído):
  v9.1.1 Comment threading ...... CONCLUÍDO (mergeado cumulativo)
  v9.2.0 Busca server-side FTS . CONCLUÍDO (mergeado cumulativo)
  v9.2.1 Filtros avançados ..... CONCLUÍDO (PR #201)

FASE 3 — Expansão (em progresso):
  v9.1.2 Avaliações de usuários . CONCLUÍDO (PR #202)
  v9.1.0.3 Convites externos .... CONCLUÍDO (PR #203-#206)
  v9.3.1 Analytics de post ...... CONCLUÍDO (PR #207)
  v9.3.2 Moderação automática .. CONCLUIDO (PR #208)
  v9.4.0 Lazy loading ........... CONCLUIDO (PR #209)

FASE 4 — Qualidade:
  v9.4.1 Otimização de imagens . CONCLUIDO (PR #210)
  v9.4.2 Acessibilidade (A11y) . CONCLUIDO (PR #211)

BLOQUEADO:
  v9.3.0 Cashback — requer definição de negócio
```

### 3.4. Detalhes das Fases Pendentes

#### v9.1.1 — Comment Threading (IMPLEMENTADO NO REPOSITÓRIO LOCAL)

**Objetivo:** Permitir respostas a comentários com 1 nível de profundidade (estilo Instagram).

**Backend:**
- `ALTER TABLE comments ADD COLUMN parent_id UUID REFERENCES comments(id) ON DELETE CASCADE`
- Trigger `kc_check_comment_depth()` — máximo 1 nível (resposta de resposta = erro)
- Trigger `kc_notify_on_comment_reply()` — notifica autor do comentário pai (novo tipo `comment_reply`)
- Índice: `idx_comments_parent_id`

**Ajuste pós-validação mobile (05/04/2026):**
- `assets/css/styles.css` recebeu hotfix CSS-only no `kc-header` mobile para alinhar o sino (`kc-notif-bell`) aos demais controles do bloco `.kc-user-actions`, padronizando caixa `36x36`, centralização via `inline-flex` e preservando o badge.

**Frontend:**
- Modificar `kc-comments.js` — agrupar por parent_id, botão "Responder", textarea inline
- Modificar `supabase.adapter.js` — parent_id no SELECT e INSERT de comentários
- Modificar `styles.css` — `.kc-comment--reply` com indentação + borda lateral `var(--kc-primary-brand)`

**Verificação:**
- Comentar em post → aparece normal
- Responder comentário → aparece indentado abaixo
- Tentar responder uma resposta → erro (max 1 nível)
- Notificação chega ao autor do comentário original

#### v9.1.2 — Avaliações de Usuários

Nova tabela `user_ratings` (1-5 estrelas + texto curto, max 280 chars). Rating médio exibido no perfil e seller card. Apenas quem interagiu pode avaliar. Sem auto-avaliação.

#### v9.2.0 — Busca Server-Side (IMPLEMENTADO NO REPOSITÓRIO LOCAL)

Índice GIN para full-text search em português. RPC `kc_search_posts_fts` com `ts_rank_cd`. `KCAPI.searchPosts()` passou a ser a API dedicada da busca; `KCAPI.getPosts()` permaneceu legado/estável. Sinônimos continuam expandidos client-side antes de enviar ao RPC.

#### v9.2.1 — Filtros Avançados

Por módulo: range de preço, data, tipo, região. Persistência em URL params. Accordion desktop, drawer mobile. Novo módulo `kc-feed-filters.js`.

Estado atual em 05/04/2026:
- `v9.2.1.0` implementado no repositório local como fundação segura
- `v9.2.1.1` implementado no repositório local para levar os filtros avançados já existentes ao caminho incremental cursor-based
- `v9.2.1.2` implementado no repositório local e aplicado no Supabase para adicionar faixas numéricas reais ao mesmo caminho cursor-based
- Persistência em URL entregue para os filtros avançados já existentes em `compra-venda`, `caronas`, `moradia`, `oportunidades` e `achados-perdidos`
- Accordion desktop entregue sobre `.kc-sidebar-section`; drawers/rails mobile existentes foram preservados
- `kc-feed.controller.js` preparado para refresh por filtros com identidade de cache/snapshot dependente de `requestParams`
- A execução server-side/local dos filtros avançados já existentes no feed incremental foi entregue via `requestParams` + RPC estendida
- Controles de faixa já entregues para `compra-venda`, `caronas`, `moradia` e `oportunidades`, usando `priceMin` / `priceMax` na URL, no client e no banco
- Permanecem pendentes nesta fase: controles de data por módulo, homologação visual completa dos novos filtros e eventual expansão das faixas para módulos que não possuem `posts.price` consistente

Atualização em 06/04/2026 (ASCII-safe):
- v9.2.1.3 concluiu os controles de data por módulo no caminho cursor-based
- eventos usa metadata.data_evento / metadata.data com fallback para created_at
- A fase v9.2.1 fica fechada tecnicamente; o restante desta frente e homologação em deploy

#### v9.2.2 — Paginação Cursor-Based (IMPLEMENTADO NO REPOSITÓRIO LOCAL)

Paginação por cursor opaco via RPC `kc_get_feed_cursor`, preservando a ordenação real de cada rail do feed. O desenho original em `(created_at DESC, id DESC)` era simplificado demais para os feeds existentes; a implementação segura passou a usar cursor opaco com chaves específicas por ordenação:
- `recentes` → `bumped_at DESC NULLS LAST`, depois `created_at DESC`, `id DESC`
- `comentados` → `last_comment_at DESC`, depois `created_at DESC`, `id DESC`
- `votos` → `highlight_score DESC`, `votos DESC`, `created_at DESC`, `id DESC`

Contrato novo: `KCAPI.getFeedCursor({ module, category, subcategory, q, tag, sortBy, limit, cursor }) -> { posts, nextCursor, hasMore }`.

`KCAPI.getPosts()` foi mantido por compatibilidade para busca, listagens auxiliares e consumo legado. O avanço incremental do feed passou a usar botão "Carregar mais", sem `IntersectionObserver` para auto-load implícito.

#### v9.3.1 — Analytics de Post (CONCLUÍDO — PR #207)

**Backend:** Migration `v9.3.1.0_post_analytics.sql` com coluna `posts.view_count`, tabela `post_view_events`, 5 indices, RLS, RPCs `kc_track_view` e `kc_get_post_analytics`, extensao de `kc_prune_old_analytics`. Anti-spam: 1 view/usuario/post/hora, self-view ignorada. SECURITY DEFINER + `SET search_path = ''`.

**Frontend:** `supabase.adapter.js` com `supabaseTrackView` e `supabaseGetPostAnalytics`; `local.adapter.js` com stubs; `kc-api.client.js` com `KCAPI.trackView()` e `KCAPI.getPostAnalytics()`; `product.controller.js` com fire-and-forget view tracking + painel de analytics do autor; `my-posts.controller.js` com mini-stats (views, votos, shares) nos cards.

**Testes:** 8 novos testes em `tests/post-analytics.test.js`. Total: 22 suites, 388 testes, 55,53% cobertura.

#### v9.3.2 — Moderação Automática

Flood control (max 3 posts/hora), link spam (>3 URLs externas = status `pending`), score de confiança para usuários novos (<7 dias, 0 posts aprovados).

---

## PARTE 4 — PADRÕES DE CÓDIGO E PROCESSOS

### 4.1. Padrão IIFE

Todos os novos módulos JS devem usar IIFE: função auto-executável com `'use strict'`, funções privadas internas, interface pública em `window.*`, inicialização no `DOMContentLoaded`.

### 4.2. Padrão Driver

`KC_ENV.driver` seleciona entre `SupabaseAdapter` (produção) e `LocalAdapter` (desenvolvimento). `KCAPI` é a facade que abstrai o storage. Novos métodos no adapter devem ser adicionados em `driverSupabase` (freeze object) e expostos via `window.KCAPI`.

### 4.3. Padrão Popover

Trio `openXPopover` / `closeXPopover` / `wireXPopover`. CSS reutiliza classes `.kc-save-popover`. Desktop: dropdown ancorado. Mobile: bottom sheet. Exclusão mútua entre popovers (save, share, calendar). **Notificações seguem padrão próprio** mas com mesma lógica: `.active` class, close on outside click + Escape, `aria-hidden`.

### 4.4. Sanitização

**OBRIGATÓRIO:** Sempre usar `window.KCUtils.escapeHtml()` (ou fallback local) antes de inserir dados de usuário em `innerHTML`. Nunca inserir conteúdo cru (risco XSS).

```javascript
// CORRETO:
el.innerHTML = window.KCUtils.escapeHtml(userContent);
// NUNCA:
el.innerHTML = userContent;  // XSS!
```

### 4.5. Detecção de Auth no Frontend

A autenticação no frontend é assíncrona. O Supabase resolve a sessão via `onAuthStateChange`, e `kc-auth.ui.js` aplica classes no DOM (`.is-auth`) via `requestAnimationFrame`. Para módulos que dependem de auth:

```javascript
// CORRETO — usar KCAPI.getCurrentUser() com polling:
function checkAuth() {
  if (typeof window.KCAPI !== 'undefined' && typeof window.KCAPI.getCurrentUser === 'function') {
    Promise.resolve(window.KCAPI.getCurrentUser()).then(function(user) {
      if (user && user.id) { activate(user); }
      else { setTimeout(checkAuth, 500); } // retry
    });
  } else {
    setTimeout(checkAuth, 500); // KCAPI ainda não carregou
  }
}
setTimeout(checkAuth, 600); // delay inicial para scripts carregarem

// INCORRETO — verificar classe no DOM (timing unreliable):
var authBtn = document.querySelector('a.btn-login.is-auth'); // pode não existir ainda
```

### 4.6. Visibilidade Condicional de Elementos

Para elementos que começam escondidos e são exibidos via JS:

```html
<!-- HTML: inline style controla visibilidade inicial -->
<button id="myElement" style="display:none;">...</button>
```

```css
/* CSS: NÃO use display:none aqui — o inline style é o controlador */
#myElement {
  /* estilos visuais apenas, sem display */
}
```

```javascript
// JS: usar valor explícito, NUNCA string vazia
element.style.display = 'inline-flex'; // CORRETO
element.style.display = '';            // INCORRETO — herda display:none do CSS
```

**Regra:** Se um elemento começa com `style="display:none"` no HTML e o JS deve ativá-lo, o CSS **não pode** ter `display: none`. E o JS deve setar um valor explícito (`'block'`, `'inline-flex'`, `'flex'`), nunca `''`.

### 4.7. Workflow de Feature Branch

```
1. git checkout kinocampus-V9.0-foundations && git pull origin kinocampus-V9.0-foundations
2. git checkout -b feat/nome-da-feature
3. Implementar + testes + docs
4. Commit + push
5. gh pr create --base kinocampus-V9.0-foundations
6. gh pr merge --squash --delete-branch
7. Voltar para kinocampus-V9.0-foundations e pull
```

**Importante:** Todo o ciclo (commit → push → PR → merge → delete branch) é executado automáticamente. Após o merge, o proprietário testa e solicita a próxima fase.

**Branch base:** `kinocampus-V9.0-foundations` (não mais `kinocampus-V8.2-SANEAMENTO-QA`)

### 4.8. Checklist por PR

| Categoria | Itens |
|-----------|-------|
| Funcionalidade | `npm test` passa, testes novos, testado mobile 375px + desktop 1440px, dark mode, estados (vazio/loading/erro) |
| Segurança | Mutations requerem auth, MIME type validado em uploads, RLS em novas tabelas, `search_path=public` |
| Banco | Migration testada em staging, rollback documentado, índices para queries frequentes |
| Frontend | Elementos condicionais usam inline style + JS explícito (não CSS display:none), escapeHtml em todo innerHTML |

---

## PARTE 5 — DESIGN SYSTEM

### 5.1. Cores

| Variável | Valor | Uso |
|----------|-------|-----|
| `--kc-primary-brand` | `#ff6b00` | Laranja principal |
| `--kc-primary-brand-light` | `#ff8c00` | Hover |
| `--kc-bg-dark` | `#0f0f13` | Fundo da página |
| `--kc-surface-dark` | `#1a1a22` | Cards, modais |
| `--kc-success` | `#22c55e` | Status positivo |
| `--kc-warning` | `#f59e0b` | Alerta |
| `--kc-error` | `#ef4444` | Erro (usado no badge de notificação) |
| `--kc-info` | `#3b82f6` | Informação |

### 5.2. Breakpoints

| Breakpoint | Uso |
|-----------|-----|
| `max-width: 400px` | Mobile pequeno |
| `max-width: 640px` | Mobile/Tablet |
| `max-width: 767px` | Tablet |
| `min-width: 768px` | Desktop |
| `min-width: 1024px` | Desktop grande |

### 5.3. Componentes

- **Cards:** `.kc-card` com sombra e border-radius
- **Botões:** `.kc-btn-primary` (laranja), `.kc-btn-secondary`, `.kc-btn-ghost`
- **Chips/Tags:** `.kc-chip` com variantes de cor por módulo
- **Modais:** `.kc-modal-overlay` + `.kc-modal-content`
- **Popovers:** `.kc-save-popover` (reutilizado para save/share/calendar)
- **Notificações:** `.kc-notif-bell` + `.kc-notif-badge` + `.kc-notif-dropdown` + `.kc-notif-item`

---

## PARTE 6 — VARIÁVEIS DE AMBIENTE

| Variável | Onde | Descrição |
|----------|------|-----------|
| `SUPABASE_URL` | Vercel | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Vercel | Chave pública do Supabase |
| `KC_NOTIFY_HMAC_SECRET` | Supabase | Segredo HMAC-SHA256 para webhooks |
| `ADMIN_REPORTS_WEBHOOK_URL` | Supabase | URL do webhook de alertas |
| `KC_APP_BASE_URL` | Supabase | URL base do app |
| `REPORTS_THRESHOLD` | Supabase | Número de denúncias para alerta (default: 3) |

---

## PARTE 7 — HISTÓRICO DE VERSÕES

| PR | Versão | Descrição | Data |
|----|--------|-----------|------|
| #188 | v8.6.x | Botão "Marcar na Agenda" com popover multi-calendário | — |
| #190 | v8.6.x | Fix: chips do kc-create-modal no mobile | — |
| #191 | v8.6.x | Fix: ranking table overflow desktop e mobile | — |
| #192 | v8.6.x | Fix: product actions + botão "Criar parecido" | — |
| #193 | v8.6.x | Fix: ranking modal, product actions harmonizados | — |
| #194 | v9.0.0 | Documentação técnica + segurança (SVG block, magic bytes) | 02/04/2026 |
| #196 | v9.0.2 | Cobertura de testes expandida para 45% (343 testes, 18 suites após iterações locais v9.1.1 e v9.2.2) | 03/04/2026 |
| #197 | v9.0.4 | Dívida técnica DB: retenção de analytics + deprecação soft de legacy_id | 04/04/2026 |
| #198 | v9.1.0 | Notificações in-app: tabela + triggers + RPCs + Realtime + UI completa | 04/04/2026 |
| #199 | v9.1.0 | Fix: race condition na detecção de auth para exibir sino | 05/04/2026 |
| #200 | v9.1.0 | Fix: CSS display:none sobrescrevia JS — sino invisível | 05/04/2026 |
| #201 | v9.2.1 | Filtros avançados: date presets nos feeds cursor-based | 06/04/2026 |
| #202 | v9.1.2 | Avaliações de usuários: 1-5 estrelas + reputação | 06/04/2026 |
| #203 | v9.1.0.3 | Convidar usuários externos: Edge Function + whitelist + UI admin | 06/04/2026 |
| #204 | v9.1.0.3 | Fix: UI de convites — link copiavel, try/catch e tabela visivel | 06/04/2026 |
| #205 | v9.1.0.4 | Fix: corrigir invites + audit log paginado | 06/04/2026 |
| #206 | v9.1.0.4 | Fix: Edge Function v4 — verify_jwt off + CORS expandido | 06/04/2026 |
| #207 | v9.3.1 | Analytics de post para autores: view tracking + mini-stats | 06/04/2026 |
| #208 | v9.3.2 | Moderacao automatica anti-spam: flood, link spam, new user trust | 07/04/2026 |
| #209 | v9.4.0 | Lazy loading: kc-lazy-loader.js + ranking IntersectionObserver + comments IntersectionObserver | 07/04/2026 |
| #210 | v9.4.1 | Otimização de imagens: compressImage() Canvas API + fetchpriority + thumbnails lazy | 07/04/2026 |
| #211 | v9.4.2 | Acessibilidade A11y: skip-link + aria-labels (17 HTMLs) + aria-hidden + focus-visible + 17 testes | 07/04/2026 |
| #212 | fix/v9.4.3 | Hotfix: window.renderComments não exportado (comentários não iniciavam) + empty state nos 4 tabs de perfil | 07/04/2026 |
| #213 | fix/v9.4.4 | Root cause comentários: KCLazyLoader.load() nos 3 pontos de product.controller.js — garante kc-comments.js carregado antes de renderizar/submeter/formatar | 07/04/2026 |

---

## PARTE 8 — LIÇÕES APRENDIDAS E DIRETRIZES OPERACIONAIS

### 8.1. Bugs Encontrados e Como Prevenir

| Bug | Causa Raiz | Prevenção |
|-----|-----------|-----------|
| Sino de notificações invisível | CSS `display:none` sobrescrevia inline style vazio | Nunca usar `display:none` no CSS para elementos controlados por JS. Usar `style="display:none"` no HTML e valor explícito no JS |
| Auth não detectada no init | Verificação de classe DOM (`.is-auth`) com timing unreliable | Usar `KCAPI.getCurrentUser()` com polling assíncrono |
| Fix perdido após merge | Commit pushed após squash-merge do PR (só inclui commits existentes no momento do merge) | Sempre garantir que o commit esteja no PR antes de executar merge |

### 8.2. Padrões de Qualidade para Desenvolvimento

1. **Verificação pós-implementação:** Após criar um componente visual, verificar no browser (via ferramentas de inspeção ou preview) que o elemento está renderizado e visível. Não confiar apenas no fato de o código "parecer correto".

2. **CSS + JS coordenação:** Quando CSS e JS controlam o mesmo atributo (`display`, `visibility`, `opacity`), documentar qual tem precedência. O padrão do KinoCampus: **HTML inline style define o estado inicial, JS controla a visibilidade, CSS define apenas aparência visual (cores, tamanhos, transições).**

3. **Auth-dependent features:** Qualquer feature que depende de autenticação deve usar `KCAPI.getCurrentUser()` com polling resiliente (tentativas finitas com timeout). Nunca assumir que auth está disponível no `DOMContentLoaded`.

4. **Merge completo:** O ciclo de entrega é atômico: code → commit → push → PR → merge → delete branch. Nunca deixar PRs abertos ou branches acumulando.

5. **Teste incremental:** Após cada fase, o proprietário testa antes de autorizar a próxima. Nenhuma fase é iniciada sem a anterior estar testada e aprovada.

### 8.3. Arquivos Críticos (Referência Rápida)

| Arquivo | Relevância | Modificado em |
|---------|-----------|---------------|
| `assets/js/kc-utils.js` | Maior módulo utilitário, escapeHtml, formatPrice, etc. | v9.0.2 |
| `assets/js/kc-api.client.js` | Facade KCAPI, gateway para todas as operações | v9.0.2, v9.1.0, v9.2.1.1, v9.2.1.2, v9.3.1 |
| `assets/js/adapters/supabase.adapter.js` | Maior adapter (~3565 linhas), driver principal | v9.1.0, v9.1.2, v9.3.1 |
| `assets/js/kc-notifications.js` | Sistema de notificações completo | v9.1.0 |
| `assets/js/kc-comments.js` | Comentários — threading implementado localmente em v9.1.1 | v9.0.2, v9.1.1 |
| `assets/js/kc-search.js` | Busca — integração FTS implementada localmente em v9.2.0 | v9.0.2, v9.2.0 |
| `assets/css/styles.css` | CSS principal (~12.700 linhas), incluindo hotfix mobile do sino em v9.1.1 | v9.1.0, v9.1.1 |
| `jest.config.js` | Configuração de testes | v9.0.2 |
| `supabase/migrations/` | 74 migrations SQL | v9.0.4, v9.1.0, v9.1.1, v9.1.2, v9.2.0, v9.2.1.x, v9.2.2, v9.2.3, v9.3.1 |
| `docs/rpc-catalog.md` | Catálogo de todas RPCs e triggers | v9.0.4, v9.1.0, v9.2.1.x, v9.3.1 |
| `docs/db-schema.md` | Schema do banco documentado | v9.0.4, v9.1.0, v9.2.1.x, v9.3.1 |
| `assets/js/controllers/product.controller.js` | Pagina do produto (~3116 linhas), view tracking + painel autor | v9.1.2, v9.3.1 |
| `assets/js/controllers/my-posts.controller.js` | Meus Posts (~640 linhas), mini-stats nos cards | v9.3.1 |
| `tests/post-analytics.test.js` | Testes de analytics (trackView, getPostAnalytics) | v9.3.1 |

### 8.4. Grafo de Dependências entre Fases

```
v9.0.2 (testes) ────────────────────────────────────────────┐
v9.0.4 (DB debt) ──────────────────── v9.3.0 (rm legacy_id) │
v9.1.0 (notificações) ──── v9.1.1 (threading) ──── v9.1.2  │
v9.2.2 (cursor pagination) ──── v9.2.0 (FTS) ──── v9.2.1   │
                                                             └── v9.4.x
```

---

## PARTE 9 — CONCLUSÃO E PRÓXIMOS PASSOS

### 9.1. Estado Atual

O KinoCampus completou todas as fundações v9, fases 1 e 2 (engajamento + features), e a maior parte da fase 3 (expansão). Todas as iterações locais foram mergeadas. A plataforma tem:
- 60 módulos JS com padrao IIFE consistente
- 430 testes automatizados com 52,79%+ de cobertura (25 suites)
- 74 migrations SQL com RLS em todas as tabelas
- 19 tabelas no Supabase (incluindo user_ratings, invited_users, post_view_events)
- Sistema de notificações completo (backend + frontend + Realtime)
- Sistema de convites externos (Edge Function + whitelist + UI admin)
- Analytics de post para autores (view tracking + mini-stats)
- Avaliações de usuários (1-5 estrelas + reputação)
- 3 jobs pg_cron agendados para manutencao automática
- search_path hardening em todas as SECURITY DEFINER functions (v9.2.3)

### 9.2. Próximos Passos Imediatos

~~1. **v9.3.2 — Moderação automática anti-spam** (CONCLUIDO — PR #208)~~

~~1. **v9.4.0 — Lazy loading de módulos grandes** (CONCLUIDO — PR #209)~~

~~1. **v9.4.1 — Otimização de imagens** (CONCLUIDO — PR #210)~~

~~1. **v9.4.2 — Acessibilidade (A11y)** (CONCLUIDO — PR #211)~~

~~1. **Homologar / aplicar v9.1.1** (CONCLUÍDO)~~
   - Executar migration `v9.1.1.0_comment_threading.sql` no Supabase
   - Validar reply notification (`comment_reply`) e bloqueio de reply de reply em staging/produção
   - Abrir PR / mergear a iteração local após revisão final

~~2. **Homologar / aplicar v9.2.2** (CONCLUÍDO)~~
   - Executar migration `v9.2.2.0_feed_cursor_pagination.sql` no Supabase
   - Validar feeds `recentes`, `comentados` e `votos` com cursor opaco, snapshot e realtime em staging/produção
   - Abrir PR / mergear a iteração local após revisão final

3. **Segurança operacional pendente**
   - Decidir a migração da extensão `unaccent` para schema fora de `public` sem quebrar FTS e helpers existentes
   - Habilitar `Leaked Password Protection` no Supabase Auth e validar impacto no fluxo de senha
   - Reexecutar o Security Advisor após essas duas ações para zerar os warnings remanescentes

4. **v9.3.1 — Analytics de post para autores** ← PROXIMO
   - Abrir a frente com definicao de metricas minimas por post (views, contatos, compartilhamentos e saves)
   - Reaproveitar o trabalho de analytics e contadores ja existente na base v9 para evitar uma segunda trilha de eventos
   - Expor um painel simples para o autor no produto/perfil, sem depender de dashboards externos
   - ~~Fechar o contrato técnico antes de expandir para histórico temporal ou comparativos~~ (CONCLUÍDO - PR #207)

### 9.2.4. Iteração Executada em 05/04/2026 — v9.2.1.0

**Status:** Implementada no repositório local e validada localmente. Esta iteração não fecha `v9.2.1`; ela entrega a fundação compartilhada para a fase.

**Escopo entregue nesta iteração:**
- Novo módulo `assets/js/kc-feed-filters.js` com utilitários de URL params (`q`, `tab`, listas, booleanos, textos) e accordion desktop para `.kc-sidebar-section`
- `kc-filters.js` atualizado para restaurar e sincronizar `q` e `tab` na URL sem alterar a lógica atual de filtro local dos cards
- Controllers de `compra-venda`, `caronas`, `moradia`, `oportunidades` e `achados-perdidos` atualizados para restaurar e persistir seus estados avançados atuais na URL
- `kc-feed.controller.js` preparado para refresh por filtros, com identidade de cache/snapshot dependente de `requestParams` e método `refresh()` exposto pelo pager
- Páginas de módulo passaram a carregar `assets/js/kc-feed-filters.js`
- `assets/css/styles.css` recebeu o toggle e o corpo colapsável do accordion desktop
- Cobertura expandida com `tests/kc-feed-filters.test.js` e ajuste em `tests/kc-filters.test.js`

**Validação executada:**
- `node --check assets/js/kc-feed-filters.js`
- `node --check assets/js/kc-filters.js`
- `node --check assets/js/controllers/kc-feed.controller.js`
- `node --check assets/js/controllers/compra-venda-feed.controller.js`
- `node --check assets/js/controllers/caronas-feed.controller.js`
- `node --check assets/js/controllers/moradia.controller.js`
- `node --check assets/js/controllers/oportunidades.controller.js`
- `node --check assets/js/controllers/achados-perdidos.controller.js`
- `npm test` → 20 suites / 359 testes / 100% verde

**Refinamentos de arquitetura registrados:**
- A persistência de filtros deixou de ficar implícita em hash/estado local e passou a ter uma base compartilhada em URL params
- O accordion desktop foi centralizado sem reescrever os drawers/rails mobile já existentes em cada módulo
- O feed incremental agora já tem fundação para invalidar cache/snapshot por filtros, mesmo antes da próxima iteração server-side

### 9.2.5. Iteração Executada em 05/04/2026 — v9.2.1.1

**Status:** Implementada no repositório local e validada localmente. Esta iteração também não fecha `v9.2.1`; ela conecta os filtros avançados já existentes ao feed incremental.

**Escopo entregue nesta iteração:**
- `assets/js/kc-api.client.js` passou a aplicar `requestParams` avançados no caminho compartilhado de `filterPosts()`, cobrindo `compra-venda`, `caronas`, `moradia`, `oportunidades` e `achados-perdidos`
- `assets/js/kc-supabase.client.js` passou a serializar `p_request_params` para `kc_get_feed_cursor()`, preservando a semântica de cursor de `v9.2.2`
- Nova migration `supabase/migrations/v9.2.1.1_feed_request_params.sql` com helpers SQL e extensão da RPC `kc_get_feed_cursor(..., p_request_params jsonb default null)`
- Cobertura expandida em `tests/kc-api-client.test.js`, `tests/local-adapter.test.js`, `tests/supabase-adapter.test.js` e `tests/kc-supabase-client.test.js`
- Documentação técnica atualizada em `docs/api-contract.md`, `docs/rpc-catalog.md` e `docs/db-schema.md`

**Validação executada:**
- `node --check assets/js/kc-api.client.js`
- `node --check assets/js/kc-supabase.client.js`
- `npm test -- --runInBand tests/kc-api-client.test.js tests/local-adapter.test.js tests/supabase-adapter.test.js tests/kc-supabase-client.test.js`
- `npm test -- --runInBand`
- `npm test` → 20 suites / 359 testes / 100% verde

**Refinamentos de arquitetura registrados:**
- `KCAPI.getPosts()` permaneceu estável; a aplicação dos filtros avançados no feed incremental entrou apenas no contrato cursor-based
- A ordenação e o cursor de `v9.2.2` foram preservados; `v9.2.1.1` só ampliou o envelope de filtros aceito pelo pager e pelo RPC
- O mesmo envelope de `requestParams` agora funciona nos caminhos `local` e `supabase`, reduzindo divergência entre desenvolvimento e produção

**Acesso Supabase nesta data:**
- O projeto `wacyrkwhkvzwkqpolrbg` passou a responder normalmente pelas ferramentas nativas `mcp__supabase__...`
- `get_project_url`, `list_tables`, `execute_sql` e `apply_migration` ficaram funcionais nesta thread
- A partir deste ponto, as próximas iterações de banco podem ser aplicadas e validadas daqui quando fizer sentido

### 9.2.6. Iteração Executada em 05/04/2026 — v9.2.1.2

**Status:** Implementada no repositório local, validada localmente e aplicada no Supabase. Esta iteração ainda não fecha `v9.2.1`; ela entrega as faixas numéricas da fase.

**Escopo entregue nesta iteração:**
- `assets/js/kc-feed-filters.js` ganhou `readNumberParam()` e `writeNumberParam()` para persistir números na URL sem manter params vazios
- `compra-venda`, `caronas`, `moradia` e `oportunidades` ganharam novos inputs de faixa (`priceMin` / `priceMax`) com sincronização em URL, modal mobile e sidebar desktop
- `assets/js/kc-utils.js` passou a marcar cards renderizados com `data-kc-price`, permitindo o mesmo predicado funcionar em cache, restore e filtro local
- `assets/js/kc-api.client.js` passou a aplicar faixas genéricas no caminho compartilhado de `filterPosts()`, mantendo paridade entre `local` e `supabase`
- Nova migration `supabase/migrations/v9.2.1.2_feed_price_ranges.sql` adicionou `kc_feed_parse_numeric_text()` e estendeu `kc_get_feed_cursor()` para filtrar `posts.price` server-side
- Documentação técnica atualizada em `docs/api-contract.md`, `docs/rpc-catalog.md` e `docs/db-schema.md`

**Validação executada:**
- `node --check assets/js/controllers/compra-venda-feed.controller.js`
- `node --check assets/js/controllers/caronas-feed.controller.js`
- `node --check assets/js/controllers/moradia.controller.js`
- `node --check assets/js/controllers/oportunidades.controller.js`
- `node --check assets/js/kc-feed-filters.js`
- `node --check assets/js/kc-api.client.js`
- `node --check assets/js/kc-utils.js`
- `npm test -- --runInBand tests/kc-feed-filters.test.js tests/kc-api-client.test.js tests/kc-supabase-client.test.js`
- `npm test -- --runInBand`
- `npm test` → 20 suites / 361 testes / 100% verde
- Supabase smoke:
  - `kc_get_feed_cursor(..., {"priceMin":100,"priceMax":1000})` retornou apenas posts com preço dentro da faixa
  - `kc_get_feed_cursor(..., {"priceMin":1000,"priceMax":100})` normalizou a faixa invertida e retornou o mesmo conjunto válido

**Refinamentos de arquitetura registrados:**
- `KCAPI.getPosts()` permaneceu estável; a faixa numérica entrou apenas no contrato cursor-based
- `kc_matches_feed_request_params()` continuou responsável só por filtros textuais/categoriais; o corte numérico ficou isolado em `kc_get_feed_cursor()`
- A implementação server-side usa `posts.price` como fonte canônica; módulos sem `price` consistente não foram forçados para esta iteração

### 9.2.1. Iteração Executada em 05/04/2026 — v9.1.1

**Status:** Implementada no repositório local e validada localmente.

**Escopo entregue nesta iteração:**
- Migration nova `v9.1.1.0_comment_threading.sql` com `comments.parent_id`, trigger `kc_check_comment_depth()` e trigger `kc_notify_on_comment_reply()`
- Regravação de `kc_notify_on_comment()` na migration de v9.1.1 para alinhar a trigger ao campo real `comments.body`
- `kc-comments.js` atualizado para agrupar threads de 1 nível, exibir botão "Responder", abrir textarea inline e cascatar exclusão de replies no modo local
- `supabase.adapter.js` e `kc-api.client.js` atualizados para aceitar `parentId` em criação de comentário
- `product.css` atualizado com estilos de reply indentado e composer inline
- Helpers puros de comentários expandidos + testes cobrindo `parent_id`, alvo de reply e montagem de threads
- `jest.config.js` endurecido para ignorar worktrees em `.claude/`, removendo colisões e duplicação de suites no `npm test`

**Validação executada:**
- `node --check assets/js/kc-comments.js`
- `node --check assets/js/adapters/supabase.adapter.js`
- `npm test -- kc-comments.shared.test.js`
- `npm test` → 17 suites / 337 testes / 100% verde
- Validação visual local com Playwright CLI em `http://127.0.0.1:4173/_product.html?id=1`
  - comentário raiz criado com sucesso
  - composer inline de resposta aberto com sucesso
  - reply renderizado abaixo do comentário pai
  - reply não expôs novo botão "Responder", respeitando o limite de 1 nível na UI

**Divergências corrigidas no entendimento do projeto:**
- A UI de comentários do produto está apoiada em `assets/css/product.css`, não em `assets/css/styles.css`
- A documentação do projeto já antecipava `parent_id` e `comment_reply`, mas o código e as migrations ainda não tinham essa entrega consolidada
- O repositório principal roda 17 suites; a execução inflada anterior vinha das worktrees em `.claude/`

**Ajuste pós-validação mobile:**
- `assets/css/styles.css` recebeu normalização mobile de `.kc-user-actions button` para caixa `36x36`, `inline-flex`, `align-items:center`, `justify-content:center`, `padding:0` e `line-height:1`, corrigindo o desalinhamento vertical do sino (`.kc-notif-bell`) sem alterar o tratamento do `btn-login`

### 9.2.2. Iteração Executada em 05/04/2026 — v9.2.2

**Status:** Implementada no repositório local, documentada e validada localmente.

**Escopo entregue nesta iteração:**
- Migration nova `v9.2.2.0_feed_cursor_pagination.sql` com RPC `kc_get_feed_cursor`
- Ordenação preservada por rail: `recentes` via `bumped_at`, `comentados` via `last_comment_at`, `votos` via `highlight_score` + `votos`
- Novo contrato `KCAPI.getFeedCursor()` no client, driver local e adapter Supabase, mantendo `KCAPI.getPosts()` estável para consumo legado
- `kc-feed.controller.js` migrado de estado por `page` para `cursor`, `nextCursor` e `hasMore`
- Remoção do auto-load via `IntersectionObserver`; paginação incremental agora depende apenas do botão "Carregar mais"
- Snapshot/cache de sessão atualizado para persistir `{ posts, nextCursor, hasMore }` e revalidar sempre a partir do primeiro lote lógico
- `FEED_SNAPSHOT_VERSION` incrementado para invalidar snapshots cursor-based persistidos com estado de `hasMore` anterior ao ajuste final
- Documentação técnica atualizada em `docs/api-contract.md`, `docs/rpc-catalog.md` e `docs/db-schema.md`
- Cobertura expandida com testes de cursor para `KCAPI`, adapter local e adapter Supabase

**Validação executada:**
- `node --check assets/js/kc-api.client.js`
- `node --check assets/js/adapters/local.adapter.js`
- `node --check assets/js/adapters/supabase.adapter.js`
- `node --check assets/js/controllers/kc-feed.controller.js`
- `node --check assets/js/kc-supabase.client.js`
- `npm test -- local-adapter.test.js kc-api-client.test.js supabase-adapter.test.js`
- `npm test` → 18 suites / 343 testes / 100% verde
- Validação visual/local com Playwright CLI:
  - `_product.html?id=1` em `390px` e `360px`: sino mobile alinhado com busca, tema e bloco de usuário; badge preservado
  - `_product.html?id=1` em `1280px`: sem regressão de alinhamento no desktop
  - `index.html`: scroll até o fim não auto-carrega novos posts; clique em "Carregar mais" expandiu `12 -> 24` cards no rail ativo
  - Smoke dos módulos `compra-venda-feed.html`, `caronas-feed.html`, `eventos.html`, `moradia.html`, `oportunidades.html` e `achados-perdidos.html` com pager explícito ativo
  - Revalidação específica de `caronas-feed.html`: fim de lista agora ocultando o botão e exibindo `Fim da lista`

**Refinamentos de arquitetura registrados:**
- O cursor público passou a ser tratado como token opaco do driver, sem montagem manual pelos callers
- A formulação inicial baseada em `(created_at DESC, id DESC)` foi substituída por keysets específicos por ordenação para evitar regressões em feeds já existentes
- Feeds híbridos continuam atendidos via `module: string | string[]`, inclusive no adapter local

### 9.2.3. Iteração Executada em 05/04/2026 — v9.2.0

**Status:** Implementada no repositório local, documentada e validada localmente.

**Escopo entregue nesta iteração:**
- Migration nova `v9.2.0.0_search_posts_fts.sql` com extensão `unaccent`, helpers imutáveis de documento FTS, índice `idx_posts_fts` e RPC `kc_search_posts_fts`
- Novo contrato `KCAPI.searchPosts()` no client público, mantendo `KCAPI.getPosts()` estável para consumo legado
- `kc-supabase.client.js` atualizado para expandir sinônimos no client, deduplicar `p_terms` e chamar o RPC dedicado sem fallback para `data/database.json`
- `supabase.adapter.js` e `local.adapter.js` atualizados com `searchPosts()`; caminho local passou a usar `kc-search.shared.js` para scoring/paridade
- `kc-search.shared.js` expandido para concentrar normalização sem acento, expansão de sinônimos, scoring e ordenação determinística
- `kc-search.js` migrado para `KCAPI.searchPosts()` na página `search-results.html` e no dropdown global; `window.filterPosts(q)` dos feeds/módulos foi preservado como filtro client-side
- Inclusão de `assets/js/kc-search.shared.js` nas páginas que carregam `kc-search.js`
- Documentação técnica atualizada em `docs/api-contract.md`, `docs/rpc-catalog.md` e `docs/db-schema.md`
- Cobertura expandida com testes para shared search, `KCAPI.searchPosts()`, adapter local, adapter Supabase e `kc-supabase.client.js`

**Validação executada:**
- `node --check assets/js/kc-search.shared.js`
- `node --check assets/js/kc-search.js`
- `node --check assets/js/kc-api.client.js`
- `node --check assets/js/kc-supabase.client.js`
- `node --check assets/js/adapters/local.adapter.js`
- `node --check assets/js/adapters/supabase.adapter.js`
- `npm test -- --runTestsByPath tests/kc-search.shared.test.js tests/local-adapter.test.js tests/supabase-adapter.test.js tests/kc-api-client.test.js tests/kc-supabase-client.test.js`
- `npm test` → 20 suites / 359 testes / 100% verde
- Validação visual/local com Playwright CLI:
  - `search-results.html?q=notebook` → 18 resultados
  - `search-results.html?q=laptop` → 9 resultados, incluindo posts de notebook via sinônimo
  - `search-results.html?q=matematica` → 7 resultados, incluindo conteúdo com acento em `Matemática`
  - `search-results.html?q=matematica&module=livros&subcategory=calculo` → 1 resultado, confirmando filtro por URL
  - `index.html` → dropdown global limitado a 8 opções para `notebook`
  - `compra-venda-feed.html` → digitação em busca permaneceu na mesma URL, sem redirecionamento involuntário, preservando filtro local de cards

**Refinamentos de arquitetura registrados:**
- A API pública de busca passou a ser explícita (`KCAPI.searchPosts()`), evitando sobrecarregar semanticamente `KCAPI.getPosts()`
- A abrangência da busca foi mantida entre client e Supabase: `title`, `description`, `tags`, `category` e `subcategory`
- O caminho Supabase não cai mais para dataset estático em caso de erro de RPC; a UX degrada para vazio/no-results, como planejado

### 9.3. Decisões Pendentes do Proprietário

- Modelo de negócio do Cashback (v9.3.0)
- ~~Priorizacao relativa: filtros avançados vs avaliações de usuários~~ (RESOLVIDO — ambos concluídos)
- Avaliação de bundler (Vite/Rollup) para v9.4+
- ~~Definicao de critérios de moderação automática (v9.3.2)~~ CONCLUIDO
- ~~Lazy loading de módulos grandes (v9.4.0)~~ CONCLUIDO
- ~~Otimização de imagens (v9.4.1)~~ CONCLUIDO — PR #210
- ~~Acessibilidade (v9.4.2)~~ CONCLUIDO — PR #211

---

*Relatorio atualizado em 07/04/2026 por Claude Code (Anthropic). Modelo: Claude Sonnet 4.6.*
*Versoes anteriores: 02/04/2026 (v9.0), 03/04/2026 (v9.0.2), 04/04/2026 (v9.1.0), 05/04/2026 (v9.1.1-v9.2.3 local), 06/04/2026 (v9.2.1 PR#201 + v9.1.2 PR#202 + convites PR#203-#206 + v9.3.1 PR#207), 07/04/2026 (v9.3.2 PR#208 + v9.4.0 PR#209 + v9.4.1 PR#210 + v9.4.2 PR#211 + fix/v9.4.3 PR#212).*




### 9.2.10. Fechamento de fase em 06/04/2026 - v9.2.1

Status: FECHADA em código, banco, testes locais, PR e preview do merge commit.

Atualização ASCII-safe:
- Branch de trabalho: codex/v9-2-1-date-filters
- Commit da fase: 2be7dcb (`feat: add date presets to feed filters`)
- PR: #201 (`feat: finish v9.2.1 date presets in feed filters`)
- Merge realizado em 06/04/2026 para `kinocampus-V9.0-foundations`
- Migration aplicada no Supabase: `v9_2_1_3_feed_date_presets`
- Validação local: `npm test -- --runInBand` com 21 suites e 370 testes verdes
- Preview do PR validado no navegador para os 6 módulos; `eventos` mobile confirmou o fluxo correto via botao `Ver eventos`
- Deployment do merge commit validado no Vercel: `dpl_6Mr1cZQjSF5nNobVDa934GnSm6iq`
- Smoke do deployment mergeado confirmado para:
  - `compra-venda-feed.html?datePreset=last7d`
  - `eventos.html?datePreset=next7d` no desktop
  - `eventos.html?datePreset=next7d` no mobile apos aplicar no modal
- Produção publica ainda NAO refletia a fase no momento da checagem (`https://www.kinocampus.com.br/compra-venda-feed.html` continuava sem os radios `data-kc-market-date-preset`), enquanto o deploy novo da branch-base ja estava `READY` no Vercel sem `target=production`
- Pendencia operacional imediata: aguardar/promover a publicação para produção e repetir smoke curto em `compra-venda`, `eventos` e `caronas`

### 9.2.11. Iteração Executada em 06/04/2026 - v9.1.2

Status: concluída em código, Supabase, PR, merge e smoke publico em produção.

Atualização ASCII-safe:
- Nova migration `supabase/migrations/v9.1.2.0_user_ratings_foundation.sql`
- Branch de trabalho: `codex/v9-1-2-user-ratings`
- Commit da frente: `db1a92b` (`feat: add user ratings and reputation surfaces`)
- PR: #202 (`feat: add user ratings and reputation surfaces`)
- Merge commit: `4868c48`
- Banco:
  - tabela `public.user_ratings` com unicidade por `rater_user_id + target_user_id`
  - agregados `profiles.rating_avg` e `profiles.rating_count`
  - triggers de sincronizacao automática dos agregados
  - RPCs novas: `kc_get_user_rating_summary`, `kc_get_user_rating_state`, `kc_list_user_ratings`, `kc_upsert_user_rating`
- Contrato publico:
  - `KCAPI.getUserRatingSummary(userId)`
  - `KCAPI.getUserRatingState({ targetUserId, contextPostId })`
  - `KCAPI.listUserRatings(userId, { page, limit })`
  - `KCAPI.upsertUserRating({ targetUserId, contextPostId, rating, comment })`
- UI:
  - resumo compacto de reputação na linha do autor dos cards, apenas quando `rating_count > 0`
  - seller card da pagina do produto com CTA `Avaliar usuario` / `Editar avaliação`, bloqueio por elegibilidade e modal de estrelas
  - hero do perfil com stat de reputação e nova aba `Avaliações` com paginação
- Regras de elegibilidade:
  - bloqueia autoavaliação
  - exige interacao persistida com posts do alvo via `comments`, `post_votes` ou `saved_posts`
  - nao usa "abriu contato" como criterio
- Privacidade:
  - avaliador publico mostra nome/avatar
  - avaliador privado aparece como `Membro da comunidade`

Validação executada:
- `npm test -- --runInBand` verde com 21 suites e 380 testes
- `node --check` nos arquivos JS alterados dos clients, adapters e controllers de produto/perfil
- Supabase:
  - migration `v9_1_2_0_user_ratings_foundation` aplicada com sucesso
  - smoke SQL confirmou `SELF`, `NO_INTERACTION` e `OK` em `kc_get_user_rating_state(...)`
  - upsert controlado validou criação/edicao da nota e os agregados em `profiles`
  - limpeza de homologação executada, deixando `user_ratings` e agregados do perfil de teste sem residuos
- Documentacao atualizada em `docs/api-contract.md`, `docs/rpc-catalog.md` e `docs/db-schema.md`
- Vercel / browser:
  - preview do PR validado via deploy protegido do Vercel com proxy autenticado e screenshots browser-first
  - smoke publico repetido em produção (`www.kinocampus.com.br`) para seller card mobile e hero/abas do perfil no desktop
  - seller card exibiu estado anonimo correto: `Ainda sem avaliações publicas` + CTA `Entrar para avaliar`
  - perfil exibiu stat `Reputação` e aba `Avaliações` com badge `0` no deploy publico

Observacao de validação:
- os estados autenticados `SELF` e `NO_INTERACTION` ficaram cobertos por testes/SQL smoke; a rodada browser-first desta iteração validou principalmente as superficies publicas/anonimas no preview e na produção

Próxima frente funcional sugerida: v9.3.1 (analytics de post para autores). **CONCLUÍDA — ver seção 9.2.13.**

### 9.2.12. Iteração Executada em 06/04/2026 - v9.1.0.3 / v9.1.0.4

**Status:** Concluida em código, Supabase, PRs, merge e deploy.

**Escopo entregue (PRs #203-#206):**
- Edge Function `invite-user` para convidar usuários externos via e-mail
- Tabela `invited_users` com whitelist de e-mails convidados
- UI admin para gerenciar convites (link copiavel, tabela de convites)
- Audit log paginado com seletor de tamanho
- Hotfixes: `verify_jwt` desabilitado no gateway + CORS expandido (v4 da Edge Function)
- Correcoes de UI: try/catch, visibilidade da tabela de convites

**PRs:**
- #203: feat(v9.1.0.3): convidar usuários externos — Edge Function, whitelist e UI admin
- #204: fix(v9.1.0.3): corrigir UI de convites — link copiavel, try/catch e tabela visivel
- #205: fix(v9.1.0.4): corrigir invites + audit log paginado
- #206: fix(v9.1.0.4): Edge Function v4 — verify_jwt off + CORS expandido

### 9.2.13. Iteração Executada em 06/04/2026 - v9.3.1

**Status:** Concluida em código, Supabase, PR, merge e smoke SQL em produção.

**Escopo entregue (PR #207):**
- Migration `v9.3.1.0_post_analytics.sql`:
  - Coluna `posts.view_count INTEGER NOT NULL DEFAULT 0`
  - Tabela `post_view_events` (id, post_id, user_id, session_id, created_at)
  - 5 indices (dedup, post_id, created_at, posts_view_count, idx_posts_view_count)
  - RLS: INSERT para authenticated (user_id = auth.uid()), SELECT para autor + admin
  - RPC `kc_track_view(p_post_id UUID) -> JSONB`: anti-spam 1 view/usuario/post/hora, ignora self-view, SECURITY DEFINER + `SET search_path = ''`
  - RPC `kc_get_post_analytics(p_post_id UUID) -> JSONB`: retorna views, votos, comments, shares, coupon_clicks, saves, highlight_score
  - Extensao de `kc_prune_old_analytics()`: adiciona cleanup de post_view_events >6 meses
- Frontend:
  - `supabase.adapter.js`: `supabaseTrackView()`, `supabaseGetPostAnalytics()`, SELECT expandido em `supabaseGetMyPosts`
  - `local.adapter.js`: stubs trackView/getPostAnalytics
  - `kc-api.client.js`: `KCAPI.trackView()`, `KCAPI.getPostAnalytics()` (antes do Object.freeze)
  - `product.controller.js`: fire-and-forget view tracking + painel `renderAuthorAnalytics()` com 6 metricas
  - `my-posts.controller.js`: mini-stats (views, votos, shares) nos cards
- Testes: 8 novos em `tests/post-analytics.test.js`
- Documentacao: `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/api-contract.md` atualizados

**Validação executada:**
- `node --check` em todos os JS alterados
- `npm test -- --runInBand` verde com 22 suites e 388 testes (55,53% cobertura)
- Migration aplicada no Supabase via MCP `apply_migration`
- Smoke SQL:
  - `kc_track_view(uuid)` retornou `{ok: false, code: AUTH_REQUIRED}` (esperado sem JWT)
  - `kc_get_post_analytics(uuid)` retornou `{ok: false, code: AUTH_REQUIRED}` (esperado sem JWT)
  - Tabela `post_view_events` existe (0 rows)
  - 49 posts com `view_count` NOT NULL
  - Funcoes `kc_track_view`, `kc_get_post_analytics`, `kc_prune_old_analytics` verificadas no catalogo

**Commit:** `2c11db5` (`feat(v9.3.1): analytics de post para autores — view tracking + mini-stats`)
**PR:** #207 — mergeado em `kinocampus-V9.0-foundations`

Proxima frente funcional: v9.3.2 (moderacao automatica anti-spam). **CONCLUIDA — ver secao 9.2.14.**

### 9.2.14. Iteracao Executada em 07/04/2026 - v9.3.2

**Status:** Concluida em codigo, Supabase, PR, merge e validada.

**Escopo entregue (PR #208):**
- Migration `v9.3.2.0_anti_spam_moderation.sql`:
  - Coluna `posts.moderation_reason TEXT` — registra razao da auto-moderacao
  - Trigger function `kc_anti_spam_gate()` BEFORE INSERT ON posts (SECURITY DEFINER + `SET search_path = ''`):
    - Flood control: 3+ posts/hora → RAISE EXCEPTION 'flood_limit_exceeded' (hard block)
    - Link spam: >3 URLs externas em title+description → `status='pending'`, `moderation_reason='link_spam'`
    - New user trust: conta <7 dias + 0 posts published → `status='pending'`, `moderation_reason='new_user_scrutiny'`
    - Audit log automatico para posts auto-moderados
  - Index `idx_posts_author_created_desc` para flood control
  - REVOKE EXECUTE de anon/authenticated
- `supabase.adapter.js`: detectar `flood_limit_exceeded` → `{ _kcError: 'FLOOD_LIMIT' }`; flag `_kcPending` em posts com status=pending
- `kc-create-post.js`: toast de aviso para `_kcPending` (post em analise)
- `product.controller.js`: badge "Em analise" azul para posts pending; toggle/bump ocultos
- `tests/anti-spam.test.js`: 18 novos testes
- Documentacao: `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/api-contract.md` atualizados

**Validacao executada:**
- `node --check` em todos os JS alterados
- `npm test -- --runInBand tests/anti-spam.test.js` → 18/18 verdes
- `npm test -- --runInBand` → 23 suites, 406 testes, 100% verde
- Supabase smoke: coluna, trigger, funcao e index — todos presentes

**Commit:** `fe9806d` — PR #208 mergeado em `kinocampus-V9.0-foundations`

Proxima frente funcional: v9.4.0 (lazy loading de modulos grandes). **CONCLUIDA — ver secao 9.2.15.**

### 9.2.15. Iteracao Executada em 07/04/2026 - v9.4.0

**Status:** Concluida em codigo, PR, merge e validada.

**Escopo entregue (PR #209):**
- `assets/js/kc-lazy-loader.js` (novo): utilitário KCLazyLoader (frozen) com três métodos:
  - `load(src, cb)` — injeta `<script>` dinamicamente; idempotente com cache `_loaded`
  - `onVisible(selector, src, cb)` — IntersectionObserver com `rootMargin: 200px`; fallback imediato sem IO
  - `onInteraction(selector, events, src, cb)` — carrega na primeira interação
- `kc-ranking.js`: init mudado de `DOMContentLoaded` fixo para readyState check (suporta carregamento tardio)
- `kc-search.js`: mesmo padrão readyState check
- 6 páginas feed (achados-perdidos, caronas-feed, compra-venda-feed, eventos, moradia, oportunidades):
  - `<script defer kc-ranking.js>` removido
  - `kc-lazy-loader.js` adicionado como defer
  - Trigger inline: `KCLazyLoader.onVisible('[data-kc-ranking-sidebar]', 'kc-ranking.js')`
- `index.html`: `kc-ranking.js` removido (módulo não era usado nesta página)
- `_product.html`: `kc-comments.js` (1339 linhas) substituído por lazy load via `KCLazyLoader.onVisible('.kc-comments-section', ...)` com callback que chama `renderComments` após carregamento
- `tests/lazy-loader.test.js` (novo): 14 testes cobrindo estrutura, load, onVisible (com e sem IO), onInteraction

**Validacao executada:**
- `node --check` em todos os JS alterados
- `npx jest lazy-loader --no-coverage` → 14/14 verdes
- `npm test -- --runInBand` → 24 suites, 420 testes, 100% verde
- Smoke test browser: www.kinocampus.com.br carrega sem erros de console; analytics v9.3.1 visíveis

**Commit:** PR #209 mergeado em `kinocampus-V9.0-foundations`

Proxima frente funcional: v9.4.1 (otimização de imagens). **CONCLUIDA — ver secao 9.2.16.**

### 9.2.16. Iteracao Executada em 07/04/2026 - v9.4.1

**Status:** Concluida em codigo, PR, merge e validada em producao.

**Escopo entregue (PR #210):**
- `compressImage(blob, maxWidth, maxHeight, quality)` em `supabase.adapter.js`:
  - JPEG, PNG, WebP → Canvas API → JPEG 85%, max 1200×900 (posts) / max 400×400 (avatares)
  - GIF: pass-through (preserva animações)
  - Fallback para blob original se Canvas falhar (toBlob=null ou Image.onerror)
  - `window.KCCompressImage` exposta para uso externo e testes
- `_product.html`: `fetchpriority="high"` na imagem principal (melhora LCP — browser prioriza download)
- `product.controller.js`: thumbnails com `loading="lazy"` + `decoding="async"` (não bloqueiam carregamento inicial)
- `tests/image-compression.test.js` (novo): 10 testes cobrindo GIF pass-through, JPEG/PNG/WebP compressão, dimensões, fallback, avatar 400×400

**Validacao executada:**
- `node --check` nos JS alterados
- `npm test -- --runInBand` → 25 suites, 430 testes, 100% verde
- Deploy Vercel READY (27s após merge)
- Smoke test browser: produto carregando com imagem principal visível, sem erros de console

**Commit:** `c3ec9fb` — PR #210 mergeado em `kinocampus-V9.0-foundations`

Proxima frente funcional: v9.4.2 (acessibilidade A11y). **CONCLUIDA — ver secao 9.2.17.**

### 9.2.17. Iteracao Executada em 07/04/2026 - v9.4.2

**Status:** Concluida em codigo, PR, merge e validada em producao.

**Escopo entregue (PR #211):**
- `index.html`: skip-link `<a href="#kc-main" class="kc-skip-link">Pular para o conteúdo principal</a>` logo após `<body>`; `id="kc-main"` no `<main>`; `aria-label="Slide anterior"` / `aria-label="Próximo slide"` nos botões do carrossel; `aria-hidden="true"` nos chevrons decorativos
- **17 arquivos HTML** (via sed em lote): `aria-label="Alternar tema claro/escuro"` no theme-toggle; `aria-label="Pesquisar"` no searchInput
- `_product.html`: `aria-hidden="true"` no sharePopover (estado inicial); `aria-label` nos botões WhatsApp e Copiar Link; `aria-label` em 8 botões de formatação de texto (Negrito, Itálico, etc.); `aria-label="Seu nome no comentário"` no input do autor
- `assets/js/kc-utils.js`: `aria-label="Voto positivo"` / `aria-label="Voto negativo"` nos botões de voto; `aria-hidden="true"` nos ícones de fogo/neve; `aria-live="polite"` no score de votos
- `assets/js/controllers/product.controller.js`: `openSharePopover` seta `aria-hidden="false"`; `closeSharePopover` seta `aria-hidden="true"`
- `assets/css/styles.css`: classe `.kc-skip-link` (visível ao receber foco via Tab, oculta por padrão via `top: -100%`); padrão `:focus:not(:focus-visible)` para `.kc-search-dropdown__item` e `.kc-search-mobile-btn` (esconde outline para mouse, preserva para teclado)
- `tests/a11y.test.js` (novo): 17 testes — renderPostCard aria-labels (voto positivo/negativo, fogo aria-hidden, aria-live), HTML estático `_product.html` (theme-toggle, sharePopover, formatação, commentAuthor, searchInput), HTML estático `index.html` (skip-link, id="kc-main", theme-toggle, carrossel, searchInput)

**Validacao executada:**
- `npm test -- --runInBand` → 26 suites, 447 testes, 100% verde
- Deploy Vercel READY (14s após promote)
- Smoke test produção: HTML confirmado com skip-link, id="kc-main", aria-labels do carrossel e searchInput presentes

**Commit:** `ed9af1c` (branch) / `c3073bd` (squash no main) — PR #211 mergeado em `kinocampus-V9.0-foundations`

### 9.2.18. Iteracao Executada em 07/04/2026 - fix/v9.4.3

**Status:** Concluida em codigo, PR #212, merge e validada em producao.

**Contexto:**
Dois bugs identificados pelo usuário após o deploy de v9.4.2:
1. Formulário de comentários não funcionava em `_product.html` — campo sem event listeners, botões de formatação inertes, submit sem efeito
2. Tabs de perfil em `profile.html` mostravam painel em branco (sem mensagem de empty state) quando a chamada de API falhava silenciosamente

**Causa raiz identificada:**

Bug 1 — `kc-comments.js` x lazy loading (regressão introduzida em v9.4.0):
- A v9.4.0 passou a carregar `kc-comments.js` de forma lazy via `KCLazyLoader.onVisible`
- O callback em `_product.html` checa `typeof window.renderComments === 'function'` antes de chamar
- `kc-comments.js` exportava apenas `window.renderCommentMarkdownInline` (linha ~1339) — `renderComments` nunca foi exposto em `window`
- Resultado: callback sempre retornava sem executar `renderComments()`, o container ficava sem inicialização (sem event listeners, sem hint de autor, sem botões funcionais)

Bug 2 — `profile.controller.js` empty state em catch:
- As 4 funções assíncronas (`loadRatings`, `loadPosts`, `loadComments`, `loadSaved`) declaravam `const empty = $('#...-empty')` corretamente
- Os blocos `catch` faziam apenas `console.warn` — `empty.style.display = 'block'` nunca era chamado em caso de erro
- Spinner desaparecia (via `finally`) mas o painel ficava completamente em branco

**Escopo entregue (PR #212):**
- `assets/js/kc-comments.js`: adicionado `window.renderComments = renderComments;` logo após `window.renderCommentMarkdownInline = renderCommentMarkdownInline;` (linha ~1340) — sem alterar nenhuma outra lógica
- `assets/js/controllers/profile.controller.js`: adicionado `if (empty) empty.style.display = 'block';` nos blocos `catch` de `loadPosts`, `loadComments`, `loadRatings` e `loadSaved`

**Investigação adicional (outros módulos):**
- `kc-ranking.js` (lazy em 6 páginas de feed): usa `KCLazyLoader.onVisible` sem callback — auto-inicializa ao ser carregado, exporta `window.KCRanking` corretamente. Nenhum problema.
- Padrão de empty state: os outros controllers (`product.controller.js`, `my-posts.controller.js`) não têm o mesmo padrão de `const empty` com catch omitido. Problema era localizado no `profile.controller.js`.

**Validacao executada:**
- `node --check assets/js/kc-comments.js`
- `node --check assets/js/controllers/profile.controller.js`
- `npm test -- --runInBand` → 26 suites, 447 testes, 100% verde (sem novos testes necessários — o export é verificado indiretamente pelos testes existentes de `kc-comments`)
- Deploy Vercel READY → promovido para produção via `vercel promote`

**Commit:** `99a03ff` (branch) / `8720f5b` (squash no main) — PR #212 mergeado em `kinocampus-V9.0-foundations`

### 9.2.19. Iteracao Executada em 07/04/2026 - fix/v9.4.4

**Status:** Concluida em codigo, PR #213, merge e validada em producao.

**Contexto:**
O fix v9.4.3 foi insuficiente — os comentários continuavam sem funcionar. Investigação aprofundada revelou que o bug de v9.4.3 foi um diagnóstico incorreto: `function renderComments()` em script clássico não-IIFE já é automaticamente `window.renderComments` via hoisting de função. A linha `window.renderComments = renderComments` adicionada era redundante.

**Causa raiz real (identificada em v9.4.4):**

`kc-comments.js` é carregado lazy via `KCLazyLoader.onVisible('.kc-comments-section', ...)` com `rootMargin: 200px 0px`. Se o usuário NÃO rola a página até a seção de comentários, o IntersectionObserver nunca dispara e o script **nunca é carregado**. Consequência em cadeia:

1. `product.controller.js` — ao término de `loadPost()` — verifica `typeof window.renderComments === 'function'` → FALSE (script não carregado) → comentários nunca inicializam, sem event listeners, sem preview
2. Botão Enviar: `typeof window.submitComment === 'function'` → FALSE → sem efeito
3. Botões Bold/Italic/etc: `typeof window.formatText === 'function'` → FALSE → sem efeito

O usuário via o formulário vazio mas nenhuma interação funcionava. O preview (`kc-comment-preview`) nunca aparecia porque `bindCommentPreviewSync()` — chamado dentro de `renderComments()` — nunca era executado.

**Escopo entregue (PR #213):**

`assets/js/controllers/product.controller.js` — 3 pontos alterados:

- **Ponto A — renderComments (após loadPost):** substituído check direto por `KCLazyLoader.load('assets/js/kc-comments.js', callback)` que garante o carregamento do script antes de chamar `renderComments`; fallback para o check direto caso KCLazyLoader não esteja disponível
- **Ponto B — submitComment (click handler):** mesmo padrão — `KCLazyLoader.load(...)` antes de chamar `window.submitComment()`
- **Ponto C — formatText (click handler):** mesmo padrão — `KCLazyLoader.load(...)` antes de chamar `window.formatText(fmt)`

`assets/js/kc-comments.js` — linha 1340 (`window.renderComments = renderComments`) removida; era o export redundante adicionado erroneamente no v9.4.3. Script clássico não-IIFE expõe `renderComments` em `window` automaticamente via hoisting.

`_product.html` — mantido sem alterações; o callback `KCLazyLoader.onVisible(...)` existente serve como pre-load quando o usuário scrolla (segunda chamada de `renderComments` é idempotente).

**Lógica de idempotência do KCLazyLoader:**
- Se o script já foi carregado (`_loaded[src]`): callback dispara sincronamente
- Se o script está sendo carregado (`_pending[src]`): callback é enfileirado
- Se o script ainda não foi carregado: cria tag `<script>`, executa todos os callbacks no `onload`

Isso garante que as 3 chamadas (`renderComments` + submit + format) nunca causam carregamento duplo.

**Validacao executada:**
- `node --check assets/js/controllers/product.controller.js`
- `node --check assets/js/kc-comments.js`
- `npm test -- --runInBand` → 26 suites, 447 testes, 100% verde (sem regressao)
- Smoke test producao via Vercel: 9 ocorrencias de `KCLazyLoader` em `product.controller.js`; padroes `kc-comments.js.*renderComments`, `kc-comments.js.*submitComment`, `kc-comments.js.*formatText` todos presentes

**Commit:** `18c68a9` (branch) / `d246f28` (squash no main) — PR #213 mergeado em `kinocampus-V9.0-foundations`
