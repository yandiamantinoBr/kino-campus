# Cookies, Armazenamento E Analytics Do KinoCampus

Atualizado em: 2026-07-14

## Decisão

O KinoCampus não usa diretamente `document.cookie`, `Set-Cookie` ou `cookieStore` no código estático da plataforma. Quando a interface fala em “cookies”, ela inclui também armazenamento local do navegador, que é o que a aplicação usa para preferências e funções próprias. O Google Analytics 4 pode administrar identificadores próprios somente depois do consentimento de analytics.

Métricas administrativas devem ser agregadas por padrão. A plataforma não deve coletar valor de cookie, token Supabase, e-mail, IP bruto, user-agent bruto, texto de mensagem, termo bruto de busca ou URL com query sensível em eventos opcionais. A coleta do GA4 fica desativada em páginas administrativas, `localhost` e ambientes de preview.

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
| `kc_signup_conversion_v1` | `sessionStorage` | Evita repetir na mesma sessão a conversão de uma confirmação de cadastro recente; guarda somente o horário de confirmação, sem e-mail ou ID. | Analytics | Sessão do navegador | Não exibido diretamente |
| Google Analytics 4 | Serviço externo carregado somente em páginas públicas de produção | Mede pageviews, sessões, aquisição e eventos de uso agregáveis. URLs e referenciadores são sanitizados antes do envio. | Analytics | Eventos: 14 meses na propriedade | Relatórios GA4 e dashboard autenticado |
| User-ID pseudônimo do GA4 | Serviço externo, sem persistência do identificador bruto no código de analytics | Relaciona sessões consentidas de uma conta autenticada por HMAC-SHA-256 calculado no servidor com segredo exclusivo. O valor é pseudônimo, não anonimização. | Analytics | Conforme retenção da propriedade; removido da configuração quando não há sessão ou consentimento | Relatórios autorizados do GA4 |
| Google Search Console | Serviço externo consultado somente no servidor | Traz impressões, cliques, CTR, posição, páginas, consultas de busca, sitemaps e inspeção de indexação. Consultas podem conter texto informado à Busca Google. | Interesse legítimo de medir descoberta pública e SEO; acesso administrativo | Cache efêmero de até 5 minutos; resposta `no-store`; retenção/exportação sob controles do Google e do administrador | Dashboard GA4/Search Console e CSV sob ação explícita |
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

O payload é sanitizado no cliente e validado novamente no Supabase. Chaves sensíveis como `cookie`, `token`, `password`, `authorization`, `email`, `ip` e `user_agent` são descartadas. Valores com e-mail, telefone, URL, protocolo arbitrário, credencial, token opaco longo ou caracteres de controle também são eliminados; destinos (`href`) não são persistidos nesse log agregado.

### Busca interna

Com consentimento de analytics, um termo normal da busca interna pode ser mantido por até seis meses em `search_queries`, exclusivamente para administradores identificarem lacunas de conteúdo. Cliente e banco rejeitam padrões de e-mail, telefone, URL, token, credencial e caracteres de controle antes da ingestão. O banco fixa `id` e `created_at`, mantém `user_id` sempre nulo e persiste apenas o hash SHA-256 da sessão efêmera; o identificador do navegador nunca é armazenado cru.

O evento `search` de `KCPrivacyAnalytics` e o GA4 recebem somente origem controlada e faixa de tamanho. O termo não é duplicado nesses canais. Inserts diretos em `search_queries` e `privacy_analytics_events` ficam revogados; as gravações passam por RPCs `SECURITY DEFINER`, `search_path` vazio, allowlist e limites de lote.

O rate limit por hash de `session_id` é uma defesa básica contra rajadas e corridas, não uma barreira forte contra abuso distribuído: um cliente hostil pode rotacionar o identificador local. Proteção forte adicional deve ficar no gateway/WAF, sem transformar IP bruto em identificador persistente de analytics.

### Google Analytics 4

O GA4 é carregado somente quando `KCConsent.hasConsent('analytics') === true`, em páginas públicas dos domínios de produção. A tag não coleta em `/admin`, `localhost` ou previews.

Pageviews são enviados manualmente para evitar duplicidade. A URL e o referenciador são reduzidos a origem e caminho seguros, sem fragmento, credencial ou query arbitrária/sensível. Apenas um identificador validado de publicação pública pode permanecer; UTM de origem/meio e campanhas internas prefixadas por `kc-` passam por listas controladas e são enviados como campos de campanha, enquanto `utm_term`, `utm_content` e identificadores de publicidade são descartados. Páginas que podem exibir conteúdo pessoal ou criado pelo usuário usam título genérico na medição.

Eventos de produto podem registrar categorias agregáveis, como módulo, canal, tipo de contato, faixa de tamanho da busca, estado da publicação ou tipo de mensagem. Não são enviados termo bruto de busca, conteúdo de mensagem, e-mail, telefone, token ou identificador de conversa/participante.

Quando a pessoa está autenticada e consentiu com analytics, o GA4 pode receber um User-ID pseudônimo derivado no servidor por HMAC-SHA-256 com segredo exclusivo. O identificador original e o segredo não são enviados ao Google por essa integração. O valor pseudônimo é retirado quando a sessão termina, a conta autenticada muda ou o consentimento é revogado. Por continuar sendo dado pseudônimo, ele permanece sujeito aos controles da LGPD. A troca do segredo produz novos pseudônimos e interrompe deliberadamente a continuidade histórica entre a rotação e o período anterior.

Google Signals e sinais de personalização de anúncios ficam desativados na configuração da tag. A coleta de analytics continua condicionada ao consentimento, e a categoria Publicidade não habilita associação de User-ID com sinais publicitários.

## Admin

## Transparencia Publica

O rodape publico aponta para `transparencia.html`, `privacidade.html`, `termos.html`, preferencias de cookies e `ajuda.html#solicitacoes-suporte`. Nenhum link publico deve levar diretamente para `admin/help-requests.html`; essa rota continua reservada ao painel administrativo.

### Dashboard

O Dashboard mostra um card compacto “Privacidade e métricas” com:

- eventos opcionais dos últimos 30 dias;
- sessões agregadas;
- aceites de analytics;
- cliques em banners.

O painel GA4/Search Console é restrito a administradores. A integração usa duas credenciais técnicas separadas e de leitura mínima. Consultas do Search Console são processadas no servidor, mantidas apenas em cache efêmero e podem ser incluídas em CSV somente quando um administrador aciona a exportação.

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

Migrations: `supabase/migrations/20260710011442_reconcile_privacy_runtime.sql` e `supabase/migrations/20260714121506_harden_search_analytics_ingestion.sql`.

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
- Inserts públicos passam por RPC `security invoker`; somente a implementação interna no
  schema não exposto `kc_private` usa `security definer`.
- Funções usam `SET search_path = ''`.
- `session_id` nunca é armazenado cru; o banco salva `encode(digest(session_id, 'sha256'), 'hex')`.

Segredos operacionais das integrações, sempre fora do repositório:

- `KC_GA4_SA_KEY`: conta técnica exclusiva de leitura do GA4;
- `KC_SEARCH_CONSOLE_SA_KEY`: conta técnica exclusiva e separada para leitura do Search Console;
- `KC_SEARCH_CONSOLE_SITE_URL`: propriedade fixa autorizada;
- `KC_ANALYTICS_ID_SECRET`: segredo aleatório de no mínimo 32 bytes usado somente pelo HMAC de User-ID;
- `KC_ANALYTICS_ID_ALLOWED_ORIGINS`: allowlist opcional de origens HTTPS.

Rotacionar credenciais técnicas conforme o processo de segurança. Rotacionar `KC_ANALYTICS_ID_SECRET` somente de forma deliberada: a rotação é segura, mas cria uma nova série de User-IDs pseudônimos e impede união histórica com os valores anteriores.

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
- O GA4 não deve carregar nem enviar eventos em `/admin`, `localhost` ou ambientes de preview.
- Pageviews do GA4 devem excluir query arbitrária/sensível e fragmento da URL e do referenciador; somente ID validado de publicação pública pode permanecer.
- User-ID do GA4 deve existir somente com sessão autenticada e consentimento, sempre como HMAC pseudônimo calculado no servidor, nunca como identificador bruto.
- Google Signals e personalização de anúncios devem permanecer desativados na tag.
- Relatórios do Search Console devem exigir administrador, usar credencial separada de leitura, resposta `no-store` e exportação explícita.
