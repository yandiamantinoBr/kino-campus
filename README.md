# Kino Campus - v10.0.0

> Plataforma de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG).

Conecta alunos, professores e egressos em 6 módulos temáticos: Compra e Venda, Caronas, Moradia, Eventos, Oportunidades e Achados e Perdidos. O acesso é restrito a e-mails institucionais (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).

**Produção:** [kinocampus.com.br](https://www.kinocampus.com.br)  
**Branch principal:** `kinocampus-V11.0-foundations`  
**Status atual:** v11 executada ate `v11.27.2`, com a rodada principal encerrada no release gate `v11.23.0` (regressao verde, hygiene canonico `8.6.0`, smoke remoto e residuals documentados), trilha i18n concluida em `v11.24.x`, baseline de testes elevado para 59/59 suites e 708/708 testes em `v11.26.x`–`v11.27.2` e trilha iOS/Safari com 3 de 3 issues altos corrigidos (v11.27.1: webkit/font-size CSS; v11.27.2: scroll lock JS eventos).

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML5 + CSS3 + Vanilla JS (IIFE, sem framework/bundler) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| Hosting | Vercel |
| Domínio | `kinocampus.com.br` |
| Build | `node scripts/inject-env.js` |
| Testes | Jest: 51 suites de regressão e contrato |

---

## Entregas Recentes

| Fase | Entrega | PRs |
|------|---------|-----|
| v11.27.2 | fix JS iOS/Safari A3: scroll lock incompleto em `eventos.controller.js` — `openCalModal` e `closeCalModal` migrados de `classList.add/remove('kc-scroll-locked')` no documentElement para `KCOverlayLock.lock/unlock('eventos-cal-modal')`; 2 testes novos — baseline sobe para 59/59 suites e 708/708 testes | `#305` |
| v11.27.1 | 3 fixes CSS iOS/Safari: A1 `-webkit-backdrop-filter: blur(10px)` adicionado em `.kc-hero-pill` (`styles.css:656`); A2 `font-size: 12px` → `1rem` em `.kc-search-bar input` @media 420px (elimina zoom automatico iOS); B4 `-webkit-backdrop-filter: none` adicionado em reset account-setup (`kc-public-shell.css:126`) | `#303` |
| v11.27.0 | auditoria iOS/Safari: 6 issues identificados (3 alta: A1 backdrop-filter sem webkit em .kc-hero-pill, A2 font-size:12px no search input mobile @420px, A3 scroll lock incompleto em eventos.controller; 2 media: B4 backdrop-filter:none sem webkit, B5 100vh sem dvh em modais admin; 1 baixa: C6 min-height:100vh) + plano de correcao v11.27.1–v11.27.3 em `docs/ios-safari-audit-v11.27.md` | `#302` |
| v11.26.2 | suites de testes estaticas para 5 module controllers: `index.controller.js` (14 testes: getCurrentUser, getMySavedPostsCount ×3, modals, KCOverlayLock), `achados-perdidos.controller.js` (19 testes: cache key, date presets today/last7d/last30d, dataset attrs, getSessionStore, normalizePost), `caronas-feed.controller.js` (18 testes: date presets today/last3d/last7d, KCSupabase caronas_locations, feature options), `moradia.controller.js` (23 testes: cache key, 6 features, 2 regioes, date presets, getSessionStore), `eventos.controller.js` (23 testes: date presets today/next7d/thisMonth/past, 6 categorias, KCSupabase posts, calendario) — baseline sobe para 59/59 suites e 706/706 testes | `#300` |
| v11.26.1 | suites de testes estaticas para `create-post.controller.js` (20 testes: wrapper KCActions, WRAP_FLAG, 4 stages de erro, idempotencia, fallback) e `kc-feed.controller.js` (24 testes: KCControllers API, constantes POSTS_LIMIT=12/UUID_RE/FEED_CACHE_MAX_AGE_MS, contratos KCAPI, KCSessionStore, banner realtime, anti-duplicacao seenIds) — baseline sobe para 54/54 suites e 609/609 testes | `#298` |
| v11.26.0 | planejamento de cobertura de testes: auditoria dos 7 controllers sem cobertura direta; padroes transversais mapeados (KCAPI contracts, KCFeedFilters, session cache, modal/overlay, dataset attrs); estrategia detalhada para v11.26.1 (create-post + kc-feed) e v11.26.2 (5 modulos) — `docs/test-coverage-plan-v11.26.md` criado | `#296` |
| v11.25.2 | correcao de drift documental: nota de estado `v11.25.x` adicionada em `api-contract.md`; contagem de migrations corrigida (82→83) e nota de estado adicionada em `db-schema.md`; convencao de `search_path` atualizada para indicar continuidade v11 em `rpc-catalog.md` | `#294` |
| v11.25.1 | consolidacao do CHANGELOG: entradas `v11.24.0`–`v11.25.0` adicionadas; entrada formal `[11.0.0] - 2026-04-12` criada com resumo consolidado de todas as 25 iteracoes da trilha v11; `[Unreleased]` zerado | `#292` |
| v11.25.0 | planejamento formal do backlog v11.25–v11.30: roadmap de 16 iteracoes cobrindo drift documental, cobertura de testes, hardening iOS/Safari, paridade entre equivalentes, extensao SWR e refactor de hotspots monoliticos — `docs/roadmap-v11.25-v11.30.md` criado | `#290` |
| v11.24.3 | templates HTML dinamicos de `kc-auth.ui.js` migrados para `KCi18n.t()` via helper `_t(key, fallback)`: 30 chaves `auth.modal-*` e 5 chaves `auth.dropdown-*` adicionadas ao dicionario; painel forgot (5 strings), painel resend (6 strings), painel user (6 strings) e `buildDropdownContent()` (7 strings) migrados; regressao mantida em 52/52 suites e 565/565 testes | `#288` |
| v11.24.2 | componentes core integrados ao `KCi18n.t()`: dicionario expandido com 11 chaves `notif.*` e 26 chaves `auth.*`; 10 strings substituidas em `kc-notifications.js`; 28 `setStatus()` + 1 `showToast()` + 2 `userMeta` substituidos em `kc-auth.ui.js`; tag `<script defer src="assets/js/kc-i18n.js">` adicionada nos 22 HTMLs; `kc-notifications-dropdown.test.js` atualizado; regressao mantida em 52/52 suites e 565/565 testes | `#286` |
| v11.24.1 | infraestrutura base de i18n: modulo `kc-i18n.js` (IIFE, `window.KCi18n`) com dicionario pt-BR de 120+ entradas em 10 categorias (`common`, `nav`, `form`, `error`, `feedback`, `time`, `empty`, `a11y`, `module`, `uxw`), helpers `KCi18n.t(key, params)` com interpolacao `{chave}` e `KCi18n.n(value, opts)` via `Intl.NumberFormat`; suite `tests/kc-i18n.test.js` com 35 testes; regressao mantida em 52/52 suites e 565/565 testes | `#284` |
| v11.24.0 | planejamento estruturado de i18n, acessibilidade e UX Writing: inventario textual de ~250-300 strings em 22 HTMLs e 61 JS, mapeamento de 65+ instancias `white-space: nowrap`, analise de fragilidade de testes (12 arquivos com strings literais) e estrategia incremental em 3 subfases (v11.24.1 infra, v11.24.2 componentes core, v11.24.3 paginas+SEO) | `#282` |
| v11.23.0 | release gate final da rodada principal da v11: endurecimento do teste de analytics frente ao cache/SWR atual, artefato formal `docs/qa/report-v11.23.0-run1.md`, hygiene `8.6.0`, smoke remoto em producao e residuals do Supabase consolidados sem abrir refactor novo | `#280` |
| v11.22.0 | scheduler versionado do dispatcher externo: migration `v11.22.0.0_notification_dispatch_scheduler.sql`, tabela privada `notification_dispatch_runs`, helper `kc_trigger_notification_dispatch(...)`, job `pg_cron` `kc-dispatch-notification-outbox` e Edge Function endurecida com `execution_id`/`source` e persistencia de runs | `#278` |
| v11.21.1 | canal privado de WhatsApp implementado sobre a trilha de outbox: tabela `notification_channel_targets`, preferencia/consentimento separados do perfil publico, novos metodos `KCAPI.getNotificationChannelTargets()`/`updateNotificationChannelTargets()` e dispatcher `kc-dispatch-notification-outbox` ampliado para Twilio com rate limit por usuario | `#277` |
| v11.21.0 | canal de e-mail implementado sobre a outbox: helpers SQL `kc_claim_notification_delivery_batch(...)`/`kc_record_notification_delivery_attempt(...)`, template HTML/texto, envio por `Resend` na Edge Function `kc-dispatch-notification-outbox` e observabilidade de preview/dispatch mantendo `public.notifications` como trilha canonica | `#275` |
| v11.20.2 | fundação assincrona de entrega externa com `notification_delivery_outbox`, `notification_delivery_attempts`, helper canônico `kc_emit_notification_event(...)`, correção do trigger de voto para o contrato real `post_votes(voter_id, direction='hot'|'cold')` e Edge Function `kc-dispatch-notification-outbox` publicada em dry-run | `#273` |
| v11.20.1 | preferências de notificações persistidas por evento e canal, com camada privada separada em `notification_preferences`, UI de configuração em `settings`, novos métodos `KCAPI.getNotificationPreferences()`/`updateNotificationPreferences()` e triggers in-app passando a respeitar o canal `in_app` sem ainda ativar entrega externa | `#271` |
| v11.20.0 | hardening do sino e do dropdown de notificações: geometria mais estável do `kcNotifBell`, ação explícita de `Limpar` no `kcNotifDropdown`, contrato `KCAPI.clearNotifications()` e realtime endurecido para `INSERT`/`UPDATE`/`DELETE`, sem alterar a fonte canônica in-app em `public.notifications` | `#269` |
| v11.19.0 | auditoria operacional do Supabase com migration versionada para eliminar warnings ativos de RLS/performance em `notifications`, `post_view_events` e `kc_invited_emails`, cobrindo `initplan`, policies permissivas redundantes e índices de FK faltantes, além de sincronizar `docs/db-schema.md`, `docs/rpc-catalog.md` e invariantes operacionais | `#265` |
| v11.18.0 | aprofundamento da rodada de contratos entre `KCAPI` e adapters: `getProfileHighlightsCount(...)` passou a aceitar `params` e a encaminhá-los com paridade entre `kc-api.client.js`, `local.adapter.js` e `supabase.adapter.js`, preservando a semântica highlight-only e adicionando regressões diretas de dispatch/paridade | `#263` |
| v11.17.0 | primeira fatia de controller do admin pós-v10: `admin-banners.controller.js` passou a validar acesso via `KCAPI.getCurrentUser()` + `profiles.is_admin`, aguardando hidratação de auth e removendo o fallback que carregava a tela sem sessão/autorização validadas | `#261` |
| v11.16.0 | primeira fatia do admin pós-v10: preload do shell administrativo foi centralizado em `admin-shell.js`, com `kc-loading` e `kc-theme-preload` padronizados nas 5 telas admin e regressão estática de marcação | `#259` |
| v11.15.2 | terceira fatia de `account-setup`: hidratação de redes sociais e visibilidade passou a ser normalizada pelos helpers shared, com reset determinístico de todos os toggles e preservação do default de WhatsApp só quando não existe configuração salva | `#257` |
| v11.15.1 | segunda fatia de `account-setup`: a prévia de contato do onboarding passa a reutilizar `buildContactAction`, reage ao toggle de contato público e fica coerente com o CTA real exibido nos anúncios | `#255` |
| v11.15.0 | primeira fatia de `settings`/conta: preview de contato passa a gerar o link de anúncio de demonstração pela rota canônica `_product.html`, reaproveitando `KCUtils.buildProductDetailHref(...)` e travando a regressão em teste estático e shared | `#253` |
| v11.14.0 | normalização da rota canônica do detalhe nas superfícies de perfil e `my-posts`, com helper compartilhado em `KCUtils` e remoção do drift `product.html?id=` nessas páginas | `#251` |
| v11.13.1 | hardening dos popovers de ação da página de produto, com fallback compartilhado para copiar link, tracking também no compartilhamento por cópia e centralização do fechamento por `Escape` entre compartilhar, salvar e calendário | `#249` |
| v11.13.0 | hardening do dropdown de notificações para manter `Marcar todas como lidas` e o clique dos itens funcionais mesmo após rerenders por realtime/mark-read | `#247` |
| v11.12.0 | endurecimento do fluxo de criação para ignorar no payload final campos condicionais que deixaram de estar ativos, preservando o rascunho no modal e alinhando `docs/module-schemas.md` ao estado real da categoria `Ingressos` | `#245` |
| v11.11.1 | reformulação do roadmap da v11 em uma sequência contínua de fases `v11.12.0` a `v11.21.0`, preparando a continuidade controlada da rodada | `#244` |
| v11.11.0 | limpeza estrutural de `kc-comments.js`, removendo helpers sombreados de comentário/resposta/renderização e adicionando regressões para reply local, exclusão em cascata local e prevenção de duplicidade de declarations | `#242` |
| v11.10.0 | extensão do snapshot+SWR para a página de produto, com hidratação de sessão para analytics do autor e comentários Supabase, invalidação segura após mutações e refresh silencioso sem spinner integral | `#240` |
| v11.9.0 | hidratação persistente e revalidação silenciosa para `Top Contribuidores` e `kc-vote-score`, reaproveitando `KCSessionStore` para evitar spinner/reprocessamento desnecessário em reload e troca de período | `#238` |
| v11.8.0 | remoção do bloco redundante de normalização em `localCreatePost`, centralizando a persistência local em `prepareLocalPostForPersistence` e adicionando regressão direta para criação local em `compra-venda` | `#237` |
| v11.7.0 | paridade endurecida entre `local.adapter.js`, `kc-api.client.js` e o contrato moderno do driver local, cobrindo perfil, posts do usuário, salvos, highlights, notificações e convites sem alterar Supabase ou banco | `#236` |
| v11.6.0 | hardening de iOS Safari: `pull-to-refresh` deixa de sequestrar gestos horizontais no topo, superfícies horizontais preservam `pinch-zoom` e o auth/modal deixa de induzir auto-zoom/travamento por `touch-action` e `font-size` inadequados | `#235` |
| v11.5.0 | restauração transversal do `Top Contribuidores` nos 6 módulos, removendo o bootstrap inline bloqueado pela CSP e normalizando o carregamento externo de `kc-ranking.js` | `#233` |
| v11.4.0 | correção transversal da sidebar desktop, restauração do preset canônico `Todas as datas` em `eventos` e inclusão funcional da categoria `Ingressos` em compra e venda | `#232` |
| v11.3.0 | paridade do `Limpar filtros` no empty state dos 6 feeds públicos e clear explícito de data no módulo `eventos` | `#231` |
| v11.2.1 | reativação do Vercel MCP no Codex, homologação de time/projeto/deployments/logs e fechamento da validação pós-merge da `v11.2.0` | `#230` |
| v11.2.0 | consistência de shell público: estados ativos da navegação, menu móvel coerente em páginas secundárias e busca mobile adicionada na `create-post.html` | `#229` |
| v11.1.0 | baseline documental da v11: sincronização de README, changelog e docs técnicas com o estado real da base | `#228` |
| docs | Sincronização do `README.md` com o estado real da v10 e nota operacional das migrations SQL da v10 | `#223` |
| v10.0 | Admin Panel Overhaul: navegação unificada, hardening dos controllers admin, busca e paginação server-side no admin, responsividade consolidada e ajustes de UX | `#215` a `#222` |
| v9.4.4 | Hotfix de comentários com `KCLazyLoader.load()` nos pontos críticos | `#213` |
| v9.4.3 | Hotfix de comentários e empty state do perfil | `#212` |
| v9.4.2 | Acessibilidade A11y em 17 HTMLs | `#211` |
| v9.4.1 | Otimização de imagens e ajustes de LCP | `#210` |
| v9.4.0 | Lazy loading de módulos grandes via `KCLazyLoader` | `#209` |
| v9.3.2 | Moderação automática anti-spam | `#208` |
| v9.3.1 | Analytics de post para autores | `#207` |
| v9.1.x | Notificações in-app, convites externos e avaliações de usuários | `#198` a `#206` |
| v9.0.x | Documentação técnica, segurança e expansão de testes | `#194` a `#197` |

---

## Planejamento v11

O planejamento detalhado da próxima fase está em [RELATORIO-KINOCAMPUS-V11.md](./RELATORIO-KINOCAMPUS-V11.md).

Regras desta fase:

- nenhuma implementação da v11 deve começar sem autorização explícita
- toda iteração da v11 deve atualizar este `README.md` e o `RELATORIO-KINOCAMPUS-V11.md`
- cada iteração aprovada deve seguir a esteira completa: branch própria, commit, push, PR, merge, delete branch, pull, validação no Supabase/Vercel e testes de regressão

### Progresso atual

- iteracao ativa consolidada: `v11.24.2`
- objetivo da iteracao: conectar o modulo `kc-i18n.js` (v11.24.1) aos componentes core de maior visibilidade (`kc-notifications.js`, `kc-auth.ui.js`) e registrar o script em todos os 22 HTMLs
- natureza da iteracao: feature com modificacao de arquivos existentes + expansao do dicionario; fallbacks literais garantem graceful degradation
- regressao: `52/52` suites, `565/565` testes, hygiene `8.6.0`
- deploy de producao validado desta fase: `dpl_34fun91hnhtBivEMPVzMtNA2oL5v` (`www.kinocampus.com.br`) — promovido de `dpl_GtZuqNmtokkq34wsfs6kiHCjWjJL`
- achados desta rodada:
  - padrao `window.KCi18n ? window.KCi18n.t('key') : 'fallback'` garante resiliencia se o modulo nao estiver disponivel
  - `notif.*` (11 chaves) e `auth.*` (26 chaves) estendem o dicionario para 12 categorias
  - templates HTML (`innerHTML`) em `kc-auth.ui.js` linhas 403–407 permanecem hardcoded — excluidos intencionalmente do escopo de v11.24.2
  - `kc-notifications-dropdown.test.js` atualizado com `beforeAll` que carrega `kc-i18n.js`, garantindo isolamento de teste correto
- proxima iteracao sugerida: `v11.24.3`, para templates HTML de auth, strings de nivel de pagina e metadata SEO
- trilha futura: v11.24.3 (paginas complexas + templates HTML + SEO + metadata)

---

## Mapa de Versão Canônica do Frontend

versão-alvo única atual: **`8.6.0`**

Este mapa existe para manter coerência com o `scripts/hygiene-check.js`, que ainda valida a versão canônica embutida do frontend. Isso não substitui a linha funcional/documental `v10` nem a execução da `v11`; apenas registra o estado real dos arquivos versionados.

| Arquivo | Referência atual |
|---------|------------------|
| `assets/js/kc-env.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-api.client.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-supabase.client.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-auth.ui.js` | auth UI v8.6.0 |
| `assets/js/kc-profiles.client.js` | `const VERSION = '8.6.0';` |
| `scripts/hygiene-check.js` | `canonicalVersion = '8.6.0'` |

O drift entre a linha funcional `v10` e a linha canônica embutida `8.6.0` foi oficialmente incorporado ao backlog da v11 para tratamento coordenado, nunca parcial.

---

## Admin v10

O painel admin foi reorganizado e endurecido em 8 PRs sequenciais:

| PR | Branch | Resultado |
|----|--------|-----------|
| `#215` | `fix/admin-v10-shell-nav` | navegação admin unificada, `active-link` robusto, `resize debounce`, `aria-label` nos toggles |
| `#216` | `fix/admin-v10-dashboard` | debounce/cancelamento do filtro de período, correções em audit log, export, ranking e modal |
| `#217` | `fix/admin-v10-moderation` | busca server-side no admin, debounce de busca, lock de ações e confirmação destrutiva |
| `#218` | `fix/admin-v10-reports` | paginação progressiva, contador, confirmação de exclusão e escaping consistente |
| `#219` | `fix/admin-v10-banners` | drag and drop sem listeners duplicados, preview com debounce e modal endurecida |
| `#220` | `fix/admin-v10-help-requests` | paginação server-side total-aware, guard de bind único, validação de enums e fallback seguro |
| `#221` | `fix/admin-v10-invite` | clipboard centralizado, cleanup de polling e null checks defensivos |
| `#222` | `fix/admin-v10-mobile-css` | breakpoints unificados, CSS compartilhado, `data-label` real e responsividade consolidada |

### Migrations novas da v10

Estas migrations já estão no repositório e **já foram aplicadas no banco principal atual**. Para ambientes novos, staging paralelo ou bancos recriados, aplique manualmente em ordem:

| Arquivo | Função criada | Status |
|---------|---------------|--------|
| `supabase/migrations/v10.0.0.0_admin_search_posts_full.sql` | `public.kc_admin_search_posts_full(...)` | aplicada no banco principal atual |
| `supabase/migrations/v10.0.1.0_admin_help_requests_pagination.sql` | `public.kc_admin_list_help_requests_paged(...)` | aplicada no banco principal atual |

### Importante

- No banco principal atual, essas migrations já estão ativas.
- A aplicação continua sendo feita **uma vez por banco/ambiente**.
- Se o seu banco de produção e o de staging forem diferentes, aplique em ambos.
- Depois de aplicar o SQL, **não é necessário redeploy do frontend** apenas por isso; um reload da página basta.

---

## Regra de release

Sempre que houver release de frontend:

1. Definir uma versão-alvo única para todos os módulos de frontend.
2. Atualizar em lote as constantes `VERSION` dos arquivos mapeados.
3. Validar referências visuais de versão na UI.
4. Registrar a mudança em `README.md` e `CHANGELOG.md`.

---

## Fonte única de verdade do banco

A fonte oficial de verdade para banco é a esteira SQL do Supabase:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Não existe caminho operacional por `sql/` na raiz.

Para artefatos legados e critérios de remoção, consulte `docs/legacy/README.md`.

### Regra explícita para mudanças críticas

Qualquer mudança crítica de banco, incluindo auth, `verified`, policies, triggers, RLS, storage policies e grants/revokes, deve existir somente em:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Se surgir SQL fora do fluxo oficial:

1. Mover para `docs/legacy/sql/`.
2. Documentar em `docs/legacy/README.md`.
3. Não usar operacionalmente em deploy ou setup.
4. Não recriar diretório `sql/` na raiz.

---

## Como rodar localmente

### Opção A - VS Code Live Server

1. Abra a pasta `kino-campus/` no VS Code.
2. Clique em `Go Live`.
3. Acesse `index.html`.

### Opção B - Python

```bash
python -m http.server 5500
```

Acesse `http://localhost:5500/index.html`.

---

## Ativação Supabase

### 1) Migrations

Aplique todas as migrations em `supabase/migrations/` em ordem alfabética. Atualmente o diretório contém **83 arquivos**, incluindo as 2 migrations da v10, a migration operacional `v9.3.3.0_supabase_operational_rls_fk.sql`, a trilha `v11.20.1.0_notification_preferences.sql`, a fundação `v11.20.2.0_notification_delivery_outbox.sql`, a promoção do canal de e-mail `v11.21.0.0_notification_email_channel.sql`, a camada privada do canal WhatsApp `v11.21.1.0_notification_whatsapp_channel.sql` e o scheduler `v11.22.0.0_notification_dispatch_scheduler.sql`.

No banco principal atual, as 2 migrations da v10 já foram aplicadas. Use a lista abaixo para ambientes novos, bancos recriados ou staging separado.

Se estiver atualizando um ambiente que já estava em v9, garanta pelo menos a aplicação destas novas migrations:

1. `v10.0.0.0_admin_search_posts_full.sql`
2. `v10.0.1.0_admin_help_requests_pagination.sql`
3. `v11.20.1.0_notification_preferences.sql`
4. `v11.20.2.0_notification_delivery_outbox.sql`
5. `v11.21.0.0_notification_email_channel.sql`
6. `v11.21.1.0_notification_whatsapp_channel.sql`
7. `v11.22.0.0_notification_dispatch_scheduler.sql`

Você pode aplicar pelo SQL Editor do Supabase ou pela CLI.

### 2) Schema bootstrap

Para um projeto novo, aplique antes:

1. `supabase/schema-bootstrap-v8.1.2.3.sql`
2. `supabase/schema-update-v8.1.3.2.sql`
3. Depois as migrations em ordem

### 3) Storage

Bucket esperado: `kino-media`.

- `post-media/{uid}/{postId}/{timestamp}-image-{n}.{ext}`
- `avatars/{uid}.{ext}`

### 4) KC_ENV

Edite `assets/js/kc-env.js`:

```javascript
environment: "production",
driver: "supabase",
supabase: {
  url: "https://SEU_PROJECT_ID.supabase.co",
  anonKey: "SUA_ANON_KEY",
  storageBucket: "kino-media"
}
```

Em produção, `driver = "supabase"` é obrigatório. `local` é apenas para desenvolvimento.

### 5) Edge Functions

**notify-admin-reports-threshold**

```bash
supabase functions deploy notify-admin-reports-threshold
```

**kc-invite-user**

```bash
supabase functions deploy kc-invite-user
```

**kc-dispatch-notification-outbox**

```bash
supabase functions deploy kc-dispatch-notification-outbox
```

Segredos obrigatórios desta função:

- `KC_NOTIFICATION_DISPATCH_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Segredos adicionais para o canal de e-mail (`v11.21.0`):

- `KC_NOTIFICATION_EMAIL_PROVIDER` (`resend`)
- `KC_NOTIFICATION_EMAIL_API_KEY`
- `KC_NOTIFICATION_EMAIL_FROM`
- opcionalmente `KC_NOTIFICATION_EMAIL_REPLY_TO`
- opcionalmente `KC_APP_BASE_URL`
- opcionalmente `KC_NOTIFICATION_DISPATCH_BATCH_LIMIT`

Segredos adicionais para o canal de WhatsApp (`v11.21.1`):

- `KC_NOTIFICATION_WHATSAPP_PROVIDER`
- `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID`
- `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN`
- `KC_NOTIFICATION_WHATSAPP_FROM`
- `KC_NOTIFICATION_WHATSAPP_CONTENT_SID`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_STATUS_CALLBACK`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_TEMPLATE_NAME`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_WINDOW_MINUTES`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_MAX_PER_WINDOW`

Observações:

- a `v11.21.0` publica essa função com envio real por e-mail via `Resend`, mas o projeto Supabase principal ainda precisa receber os segredos `KC_NOTIFICATION_EMAIL_*` para sair do gating operacional
- a `v11.21.1` implementa o canal privado de WhatsApp sem reutilizar o contato publico do perfil; o envio real depende dos segredos `KC_NOTIFICATION_WHATSAPP_*`
- a invocação exige o header `x-kc-dispatch-secret`
- a `v11.22.0` adiciona um scheduler no banco para consumir a outbox automaticamente; a função continua segura porque o disparo depende da camada privada `notification_dispatch_runtime` e os providers continuam gated por canal

### 6) Settings de banco fora do git

- `public.notification_dispatch_runtime.slot = 'primary'`
- `public.notification_dispatch_runtime.function_url`
- `public.notification_dispatch_runtime.dispatch_secret`
- opcionalmente `public.notification_dispatch_runtime.batch_limit`
- `app.settings.kc_notify_function_url`
- `app.settings.kc_notify_function_auth_token`
- `app.settings.kc_notify_hmac_secret`
- opcionalmente `app.settings.kc_notification_dispatch_function_url` como fallback
- opcionalmente `app.settings.kc_notification_dispatch_secret` como fallback
- opcionalmente `app.settings.kc_notification_dispatch_batch_limit` como fallback

---

## Testes

```bash
npm test
npm test -- --runInBand
node scripts/hygiene-check.js
```

---

## QA

- `docs/qa/e2e-checklist.md`
- `docs/qa/rls-smoke.sql`
- `docs/qa/xss-payloads.md`
- `docs/qa/v8.1.11.1-admin-reports-threshold.md`
- `docs/ops/vercel-supabase-invariants.md`

---

## Documentação técnica

| Arquivo | Conteúdo |
|---------|----------|
| `docs/architecture.md` | mapa de dependências JS e padrão IIFE |
| `docs/api-contract.md` | contrato da `KCAPI` |
| `docs/db-schema.md` | tabelas, RLS, triggers e storage |
| `docs/rpc-catalog.md` | catálogo de RPCs |
| `docs/module-schemas.md` | schemas dos 6 módulos |
| `docs/env-vars.md` | variáveis de ambiente |
| `docs/design-system.md` | design system e breakpoints |
| `RELATORIO-KINOCAMPUS-V9.md` | relatório técnico consolidado da v9 |
| `CHANGELOG.md` | histórico de releases e fixes |
