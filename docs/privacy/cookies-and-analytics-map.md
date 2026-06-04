# Cookies, Armazenamento E Analytics Do KinoCampus

Atualizado em: 2026-05-22

## Decisão

O KinoCampus não usa `document.cookie`, `Set-Cookie` ou `cookieStore` no código estático da plataforma. Quando a interface fala em “cookies”, ela inclui também armazenamento local do navegador, que é o que a aplicação realmente usa hoje.

Métricas administrativas devem ser agregadas por padrão. A plataforma não deve coletar valor de cookie, token Supabase, e-mail, IP bruto, user-agent bruto ou URL com query sensível em eventos opcionais.

## Inventário

| Nome | Onde fica | Finalidade | Consentimento | Retenção | Onde aparece no admin |
| --- | --- | --- | --- | --- | --- |
| `kc_consent_v1` | `localStorage` | Guarda aceite/rejeição de preferências e analytics. | Necessário | Até o usuário alterar ou limpar o navegador | Privacidade e Analytics |
| Sessão Supabase Auth | Storage interno do `supabase-js` | Mantém login, refresh e sessão autenticada. | Necessário | Enquanto a sessão existir | Não exporta tokens |
| `kc_search_session_id` | `sessionStorage` | Agrupa buscas de uma sessão sem identificar pessoa. | Analytics | Sessão do navegador | Dashboard e Privacidade |
| `kc_search_pending_queue` | `sessionStorage` | Fila local de buscas antes do envio ao Supabase. | Analytics | Sessão do navegador | Dashboard e Privacidade |
| `kc_search_recent_terms` | `sessionStorage` | Dedupe local de buscas repetidas. | Analytics | Sessão do navegador | Não exibido diretamente |
| `kc_home_category_affinity_v1` | `localStorage` | Preferências locais de módulos/categorias da home. | Analytics | Local, com TTL operacional | Privacidade e Analytics |
| `kc_home_category_queue_v1` | `localStorage` | Fila local de eventos de afinidade. | Analytics | Até sincronizar | Privacidade e Analytics |
| `kc_home_category_session_v1` | `localStorage` | Sessão pseudônima para afinidade de categorias. | Analytics | Até limpeza local | Privacidade e Analytics |
| `kc_nav_module_affinity_v1` | `localStorage` | Preferência local de módulos clicados no menu principal. | Analytics | Local, com TTL operacional indireto | Telemetria consentida do `kc-nav-links` |
| `kc:navLinksOrder:v1` | `sessionStorage` | Cache legado da antiga ordem calculada do menu principal. O código atual não usa essa chave para reordenar o DOM. | Operacional legado | Até expirar/limpeza local | Não usado visualmente |
| `kc_privacy_analytics_session_v1` | `localStorage` | Sessão pseudônima para eventos opcionais; no banco só vira hash SHA-256. | Necessário para consentimento; analytics para eventos opcionais | Até limpeza local | Privacidade e Analytics |
| `kc_privacy_consent_recorded_v1` | `localStorage` | Evita reenviar o mesmo estado de consentimento toda visita. | Necessário | Até mudança de consentimento | Não exibido diretamente |
| `search_queries` | Supabase | Busca agregada usada no Dashboard. | Analytics | 6 meses | Dashboard e Privacidade |
| `home_category_affinity` | Supabase | Afinidade agregada de categorias. | Analytics | Política operacional atual | Personalização e Privacidade |
| `post_view_events` | Supabase | Views operacionais de posts autenticados. | Operacional | 6 meses | Analytics de post |
| `privacy_analytics_events` | Supabase | Eventos opcionais agregáveis. | Analytics | 6 meses | Privacidade e Analytics |
| `privacy_consent_events` | Supabase | Histórico agregado de consentimento. | Necessário | 6 meses | Privacidade e Analytics |
| `audit_log` | Supabase | Auditoria administrativa e operacional. | Necessário | Política atual de 1 ano | Dashboard/Moderação |

## Eventos Opcionais

`KCPrivacyAnalytics` registra somente quando `KCConsent.hasConsent('analytics') === true`:

- `search`
- `category_click`
- `post_open`
- `banner_impression`
- `banner_click`
- `help_open`
- `help_submit`
- `report_submit`

O payload é sanitizado no cliente e validado novamente no Supabase. Chaves sensíveis como `cookie`, `token`, `password`, `authorization`, `email`, `ip` e `user_agent` são descartadas.

## Admin

## Transparencia Publica

O rodape publico aponta para `transparencia.html`, `privacidade.html`, `termos.html`, preferencias de cookies e `ajuda.html#solicitacoes-suporte`. Nenhum link publico deve levar diretamente para `admin/help-requests.html`; essa rota continua reservada ao painel administrativo.

### Dashboard

O Dashboard mostra um card compacto “Privacidade e métricas” com:

- eventos opcionais dos últimos 30 dias;
- sessões agregadas;
- aceites de analytics;
- cliques em banners.

Se a migration ainda não foi aplicada, o card mostra alerta e aponta para a página dedicada.

### Página Dedicada

`admin/privacy-analytics.html` contém:

- inventário de cookies e armazenamento;
- métricas de consentimento;
- eventos por tipo;
- eventos por página;
- banners com impressões, cliques e CTR;
- eventos recentes sem session hash exposto, com filtro local e paginação;
- filtros por período, evento, página e módulo;
- exportação XLSX e PDF.


Se `kc_admin_privacy_analytics` retornar `PGRST202` porque a migration ainda não chegou ao Supabase ou o schema cache ainda não recarregou, a página não deve quebrar. O controller tenta, nesta ordem:

1. RPC `kc_admin_privacy_analytics`;
2. leitura direta das tabelas `privacy_analytics_events` e `privacy_consent_events`, se já existirem;
3. modo de compatibilidade com `search_queries`, `post_view_events` e `hero_banners`.

O modo de compatibilidade mostra buscas, views de posts e banners cadastrados, mas CTR real de banners e consentimento agregado dependem da migration completa.

### Moderação, Denúncias, Banners E Ajuda

Essas áreas podem usar os agregados para entender picos de uso:

- Moderação/Denúncias: volume agregado de `report_submit` por página/módulo.
- Banners: `banner_impression`, `banner_click` e CTR.
- Pedidos de ajuda: `help_open` e `help_submit`.

## Banco E Segurança

Migration: `supabase/migrations/v9.3.5.16_privacy_analytics.sql`

Objetos criados:

- `privacy_analytics_events`
- `privacy_consent_events`
- `kc_track_privacy_event(...)`
- `kc_record_privacy_consent(...)`
- `kc_admin_privacy_analytics(...)`
- atualização de `kc_prune_old_analytics()`

Regras:

- RLS habilitado nas tabelas.
- `SELECT` direto somente para administradores.
- Inserts públicos passam por RPC `security definer`.
- Funções usam `SET search_path = ''`.
- `session_id` nunca é armazenado cru; o banco salva `encode(digest(session_id, 'sha256'), 'hex')`.

## Rollback

1. Remover o script dinâmico em `assets/js/api/kc-supabase.client.js`.
2. Remover chamadas opcionais para `KCPrivacyAnalytics` nos controllers.
3. Ocultar `admin/privacy-analytics.html` e o link no nav admin.
4. Reverter a migration ou manter as tabelas sem uso.
5. Limpar localmente, se necessário: `kc_privacy_analytics_session_v1` e `kc_privacy_consent_recorded_v1`.

## Verificações

- `rg "document\\.cookie|Set-Cookie|cookieStore"` deve continuar sem ocorrências no código da plataforma.
- `kc-search.js` e `kc-home-categories.js` devem retornar `false` quando `KCConsent` não estiver disponível.
- Eventos opcionais devem falhar silenciosamente se a RPC ainda não existir.
- `kc-nav-links-personalized.js` deve manter a ordem fixa do HTML sem reordenar o DOM; com consentimento de analytics, registra apenas cliques agregáveis no menu.
