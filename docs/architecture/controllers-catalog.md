# Catálogo de Controllers — KinoCampus

**Versão:** v75.1.0
**Data:** 2026-06-11
**Criado em:** v16.5.0; reancorado em v75.1.0

> **Estado atual:** `assets/js/controllers/` contém 48 controllers: 33 públicos e 15 admin.
> O corpo deste catálogo preserva descrições criadas ao longo da v16 e deve ser ampliado quando
> novos controllers receberem documentação detalhada.

> **Como ler este catálogo (para IA):**  
> Controllers são as folhas do grafo de dependências — nunca são importados por outros módulos.  
> Cada HTML tem 1 controller principal + 0–N auxiliares. O controller é sempre o último script  
> carregado na página. Módulos auxiliares (*.load.js, *.render.js, etc.) são carregados antes  
> e expõem funções que o controller principal orquestra.  
> Arquivo complementar: `docs/architecture/script-loading-reference.md` (ordem exata por HTML).

---

## Índice

- [Controllers Públicos](#controllers-públicos) — 33 arquivos em `controllers/public/`
  - [kc-feed.controller.js — Helper Compartilhado](#kc-feedcontrollerjs--helper-compartilhado)
  - [index.controller.js — Home](#indexcontrollerjs--home)
  - [Feeds Temáticos (6 módulos)](#feeds-temáticos-6-módulos)
  - [product.*.js — Produto (12 arquivos)](#productjs--produto-12-arquivos)
  - [profile.*.js — Perfil (5 arquivos)](#profilejs--perfil-5-arquivos)
  - [create-post.controller.js](#create-postcontrollerjs)
  - [my-posts.controller.js](#my-postscontrollerjs)
  - [settings.controller.js](#settingscontrollerjs)
  - [account-setup.controller.js](#account-setupcontrollerjs)
  - [help.controller.js](#helpcontrollerjs)
  - [ods.controller.js](#odscontrollerjs)
  - [oportunidades.normalize.js — Normalizador](#oportunidadesnormalizejs--normalizador)
- [Controllers Admin](#controllers-admin) — 15 arquivos em `controllers/admin/`
  - [admin-dashboard.*.js — Dashboard (6 arquivos)](#admin-dashboardjs--dashboard-6-arquivos)
  - [admin-banners.controller.js](#admin-bannerscontrollerjs)
  - [admin-help-requests.controller.js](#admin-help-requestscontrollerjs)
  - [admin-invite.controller.js](#admin-invitecontrollerjs)
  - [admin-moderation.controller.js](#admin-moderationcontrollerjs)
  - [admin-reports.controller.js](#admin-reportscontrollerjs)

---

## Controllers Públicos

> `assets/js/controllers/public/` — 33 arquivos servindo páginas públicas e auxiliares de produto/perfil.

---

### `kc-feed.controller.js` — Helper Compartilhado

| Campo | Valor |
|-------|-------|
| Namespace | `window.KCControllers` |
| Página | *(carregado em todas as páginas de feed)* |
| Tipo | Helper compartilhado |

**Responsabilidade:** Utilitário central de paginação de feed com UX "Carregar mais". Gerencia
estados idle/loading/done/error, append incremental de cards sem flicker, e controle do botão
de paginação. É usado por todos os controllers de feed temático para evitar duplicação.

**KCAPI calls principais:**
- `KCAPI.getFeedCursor(params)` — paginação incremental com cursor

**Consumido por:** achados-perdidos, caronas-feed, compra-venda-feed, eventos, moradia, oportunidades controllers

**Testes:** `tests/integration/index.controller.test.js`

---

### `index.controller.js` — Home

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — executa IIFE)* |
| Página | `index.html` |
| Auxiliares | *(nenhum)* |

**Responsabilidade:** Controller da home page: inicializa o feed principal, banners do carousel,
grade de categorias, filtros de módulo, ranking de contribuidores e o widget de pull-to-refresh.
Orquestra a experiência inicial do usuário logado.

**KCAPI calls principais:**
- `KCAPI.getFeedCursor(params)` — feed inicial
- `KCAPI.getTopContributors(period, module, limit)` — ranking

**Dependências de carregamento:** cadeia de boot → utils → api → adapters → core → features
(kc-banners, kc-home-categories, kc-ranking, kc-feed-filters, kc-pull-to-refresh) →
components → `index.controller.js`

**Testes:** `tests/integration/index.controller.test.js`

---

### Feeds Temáticos (6 módulos)

Cada um dos 6 módulos temáticos tem um controller de feed com estrutura idêntica.
Todos usam `kc-feed.controller.js` como helper de paginação.

---

#### `compra-venda-feed.controller.js`

| Campo | Valor |
|-------|-------|
| Página | `compra-venda-feed.html` |
| Auxiliares | *(nenhum direto)* |

**Responsabilidade:** Feed do módulo Compra e Venda. Inicializa paginação, filtros por
categoria de produto (eletrônicos, roupas, livros, etc.), ordenação e busca local.

**KCAPI calls:** `KCAPI.getFeedCursor({ module: 'compra-venda', ... })`

**Testes:** `tests/integration/compra-venda-ingressos.test.js`

---

#### `caronas-feed.controller.js`

| Campo | Valor |
|-------|-------|
| Página | `caronas-feed.html` |
| Auxiliares | *(nenhum direto)* |

**Responsabilidade:** Feed do módulo Caronas. Filtros por rota (origem/destino), dia da semana,
horário e número de vagas.

**KCAPI calls:** `KCAPI.getFeedCursor({ module: 'caronas', ... })`

**Testes:** Coberto por testes de feed genérico

---

#### `moradia.controller.js`

| Campo | Valor |
|-------|-------|
| Página | `moradia.html` |
| Auxiliares | *(nenhum direto)* |

**Responsabilidade:** Feed do módulo Moradia. Filtros por tipo (república, kitnet, apart.),
bairro e faixa de preço.

**KCAPI calls:** `KCAPI.getFeedCursor({ module: 'moradia', ... })`

**Testes:** Coberto por testes de feed genérico

---

#### `eventos.controller.js`

| Campo | Valor |
|-------|-------|
| Página | `eventos.html` |
| Auxiliares | *(nenhum direto)* |

**Responsabilidade:** Feed do módulo Eventos. Filtros por data, tipo de evento (cultural,
acadêmico, esportivo) e presencialidade.

**KCAPI calls:** `KCAPI.getFeedCursor({ module: 'eventos', ... })`

**Testes:** Coberto por testes de feed genérico

---

#### `oportunidades.controller.js`

| Campo | Valor |
|-------|-------|
| Página | `oportunidades.html` |
| Auxiliares | `oportunidades.normalize.js` |

**Responsabilidade:** Feed do módulo Oportunidades (estágios, empregos, bolsas). Usa
`oportunidades.normalize.js` para normalizar dados específicos deste módulo (tipo, carga
horária, remuneração).

**KCAPI calls:** `KCAPI.getFeedCursor({ module: 'oportunidades', ... })`

**Testes:** `tests/structure/oportunidades-split.test.js`

---

#### `achados-perdidos.controller.js`

| Campo | Valor |
|-------|-------|
| Página | `achados-perdidos.html` |
| Auxiliares | *(nenhum direto)* |

**Responsabilidade:** Feed do módulo Achados e Perdidos. Filtros por status (achado/perdido),
local onde foi encontrado/perdido e data do ocorrido.

**KCAPI calls:** `KCAPI.getFeedCursor({ module: 'achados-perdidos', ... })`

**Testes:** Coberto por testes de feed genérico

---

### `product.*.js` — Produto (12 arquivos)

A página `_product.html` tem a arquitetura de controller mais complexa do projeto:
1 controller principal + 8 módulos auxiliares. Todos carregados em sequência.

---

#### `product.load.js` *(auxiliar — carregado 1°)*

**Responsabilidade:** Carregamento de dados do post: lê `postId` da URL, chama KCAPI, e armazena
o post em estado compartilhado para os demais auxiliares consumirem.

**KCAPI calls:** `KCAPI.getPostById(postId)`, `KCAPI.getUserRating(postId)`

---

#### `product.render.js` *(auxiliar — carregado 2°)*

**Responsabilidade:** Renderização do HTML do post: título, descrição, metadados, galeria de
imagens, campos específicos do módulo. Usa `KCUtils.escapeHtml()` em todo conteúdo de usuário.

---

#### `product.popovers.js` *(auxiliar — carregado 3°)*

**Responsabilidade:** Inicializa popovers de informações complementares: tooltip de autor,
popover de módulo, tooltips de campos específicos.

**Testes:** `tests/structure/product-popover-hardening.test.js`

---

#### `product.ratings.js` *(auxiliar)*

**Responsabilidade:** Sistema de ratings na página de produto: exibe média de avaliações,
renderiza as estrelas, e gerencia o voto do usuário atual.

**KCAPI calls:** `KCAPI.getPostRating(postId)`, `KCAPI.submitRating(postId, value)`

**Testes:** `tests/integration/product.ratings.test.js`

---

#### `product.save.js` *(auxiliar)*

**Responsabilidade:** Botão de salvar/desalvar post: estado visual (salvo/não salvo) e chamada
à API. Sincroniza estado com o `KCSessionStore`.

**KCAPI calls:** `KCAPI.savePost(postId)`, `KCAPI.unsavePost(postId)`

**Testes:** `tests/integration/product.save.test.js`

---

#### `product.related.js` *(auxiliar)*

**Responsabilidade:** Renderiza a seção de posts relacionados: busca posts similares e renderiza
cards na sidebar.

**KCAPI calls:** `KCAPI.getRelated(postId, module)`

**Testes:** `tests/integration/product.related.test.js`

---

#### `product.edit.js` *(auxiliar)*

**Responsabilidade:** Modo de edição inline do post (apenas para o autor): ativa campos
editáveis, valida alterações e submete via KCAPI.

**KCAPI calls:** `KCAPI.updatePost(postId, data)`

**Testes:** `tests/integration/product.edit.test.js`

---

#### `product.report.js` *(auxiliar)*

**Responsabilidade:** Fluxo de denúncia de post: abre modal de report, coleta motivo e
submete via KCAPI.

**KCAPI calls:** `KCAPI.reportPost(postId, reason)`

**Testes:** `tests/integration/product.report.test.js`

---

#### `product.analytics.js` *(auxiliar)*

**Responsabilidade:** Registra analytics de visualização: envia evento de `post_view` com
metadados (módulo, fonte da visita, tempo de permanência).

**Testes:** `tests/integration/product.analytics.test.js`

---

#### `product.calendar.js` *(auxiliar)*

**Responsabilidade:** Integração de calendário para posts de tipo evento: exibe botão "Adicionar
ao calendário" e gera o link `.ics`.

**Testes:** `tests/integration/product.calendar.test.js`

---

#### `product.controller.js` *(orchestrador — carregado por último)*

| Campo | Valor |
|-------|-------|
| Namespace | `window._KCProduct` |
| Página | `_product.html` |

**Responsabilidade:** Orchestrador da página de produto: coordena todos os 8 auxiliares acima,
inicializa o sistema de comentários (`KCComments`), os botões de voto (`voting.js`), e gerencia
o ciclo de vida da página (enter/leave).

**Dependências de carregamento:** cadeia de boot → utils → api → adapters → core → features
(kc-comments) → components (carousel, toast, voting) → product.load → product.render →
product.popovers → product.ratings → product.save → product.related → product.edit →
product.report → product.analytics → product.calendar → `product.controller.js`

**Testes:** `tests/structure/product-controller-split.test.js`,
`tests/contract/product.controller-split-contract.test.js`

---

### `profile.*.js` — Perfil (5 arquivos)

A página `profile.html` tem 1 controller principal + 4 módulos auxiliares.

---

#### `profile.presentation.js` *(auxiliar)*

**Responsabilidade:** Renderização do header do perfil: avatar, nome, bio, badges de verificação,
contadores de posts e seguidores.

**Testes:** `tests/integration/profile.presentation.test.js`

---

#### `profile.collections.js` *(auxiliar)*

**Responsabilidade:** Seção de coleções do perfil: listas de posts salvos organizadas por
coleção, com criação e gerenciamento de coleções.

**Testes:** `tests/integration/profile.collections.test.js`

---

#### `profile.ratings.js` *(auxiliar)*

**Responsabilidade:** Histórico de avaliações dadas e recebidas pelo usuário no perfil.

**Testes:** `tests/integration/profile.ratings.test.js`

---

#### `profile.flow.js` *(auxiliar)*

**Responsabilidade:** Fluxo de ações do perfil: seguir/deixar de seguir, bloquear usuário,
compartilhar perfil. Gerencia estados visuais dos botões de ação.

**Testes:** `tests/integration/profile.flow.test.js`

---

#### `profile.controller.js` *(orchestrador)*

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `profile.html` |

**Responsabilidade:** Orchestrador da página de perfil: inicializa os 4 auxiliares, carrega
dados do usuário alvo (via `userId` na URL), e gerencia tabs de navegação (posts/coleções/sobre).

**KCAPI calls principais:** `KCAPI.getProfile(userId)`, `KCAPI.getUserPosts(userId)`,
`KCAPI.getSavedPosts(userId)`

**Testes:** `tests/integration/profile.flow.test.js`, `tests/integration/profile.presentation.test.js`

---

### `create-post.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `create-post.html` |

**Responsabilidade:** Controller de criação de publicação: inicializa o formulário completo
via `KCCreatePost.init()`, gerencia seleção de módulo, e delega toda a lógica para os
submódulos `features/create-post/*.js`.

**KCAPI calls principais:** Delegados para `KCCreatePostSubmit` (via `KCAPI.createPost`)

**Dependências de carregamento:** cadeia de boot → utils → api → adapters → core → features
(create-post/*.js) → components → `create-post.controller.js`

**Testes:** `tests/integration/create-post.controller.test.js`

---

### `my-posts.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `my-posts.html` |

**Responsabilidade:** Gerencia "minhas publicações": exibe lista paginada de posts do usuário
logado, com opções de editar, deletar e ver status. Usa `kcUserPosts` para o estado.

**KCAPI calls principais:** `KCAPI.getUserPosts(userId)`, `KCAPI.deletePost(postId)`

**Testes:** `tests/integration/profile-my-posts-detail-links.test.js`

---

### `settings.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `settings.html` |

**Responsabilidade:** Configurações do usuário: preferências de notificação, links de contato
social, tema (claro/escuro), privacidade e gestão de conta (deletar conta).

**KCAPI calls principais:** `KCAPI.updateProfile(data)`,
`KCAPI.updateNotificationPreferences(prefs)`

**Testes:** `tests/integration/settings-contact-preview-links.test.js`,
`tests/integration/settings-notification-preferences.test.js`

---

### `account-setup.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `account-setup.html` |

**Responsabilidade:** Setup inicial de conta após primeiro login: coleta nome, avatar, bio,
curso e interesses. Valida o e-mail `@ufg.br` / `@discente.ufg.br` / `@egresso.ufg.br`.
Redireciona para `index.html` após setup completo.

**KCAPI calls principais:** `KCAPI.setupAccount(data)`, `KCAPI.uploadAvatar(file)`

**Testes:** `tests/integration/account-setup-contact-preview.test.js`,
`tests/integration/account-setup-social-hydration.test.js`

---

### `help.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `ajuda.html` |

**Responsabilidade:** Central de ajuda: exibe FAQs por categoria, formulário de abertura de
ticket, histórico de tickets do usuário e status de tickets abertos.

**KCAPI calls principais:** `KCAPI.createHelpRequest(data)`,
`KCAPI.getUserHelpRequests(userId)`

**Testes:** Coberto por `tests/integration/kc-api-help-module.test.js`

---

### `ods.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `ods.html` |

**Responsabilidade:** Página dos ODS (Objetivos de Desenvolvimento Sustentável): exibe os
17 ODS da ONU com posts relacionados do KinoCampus para cada objetivo.

**KCAPI calls principais:** `KCAPI.getFeedCursor({ tags: ['ods-X'], ... })`

**Testes:** Coberto por `tests/integration/ods.shared.test.js`

---

### `search-results` *(controller inline no HTML)*

**Observação:** `search-results.html` não tem um controller separado — a lógica é gerenciada
diretamente pelos módulos `features/kc-search.js` e `shared/search-analytics.shared.js`.

---

### `oportunidades.normalize.js` — Normalizador

| Campo | Valor |
|-------|-------|
| Namespace | `window._KCOpNormalize` |
| Página | `oportunidades.html` |
| Tipo | Normalizador (auxiliar de controller) |

**Responsabilidade:** Normaliza dados específicos do módulo Oportunidades antes de renderizar:
padroniza tipos de oportunidade, formata carga horária, detecta se é remunerada ou não. Isolado
em arquivo separado para manter o controller principal limpo.

**Testes:** `tests/structure/oportunidades-split.test.js`

---

## Controllers Admin

> `assets/js/controllers/admin/` — 15 arquivos servindo 6 páginas HTML admin.

---

### `admin-dashboard.*.js` — Dashboard (6 arquivos)

A página `admin/index.html` tem 1 controller principal + 4 auxiliares com dados do dashboard.

---

#### `admin-dashboard.shared.js` *(auxiliar)*

**Responsabilidade:** Dados e estado compartilhados entre os componentes do dashboard admin:
métricas agregadas, cache de dados de moderação, e helpers de formatação de relatórios.

**Testes:** `tests/integration/admin-dashboard.shared.test.js`

---

#### `admin-dashboard.metrics.js` *(auxiliar)*

**Responsabilidade:** Métricas do dashboard: total de posts, usuários ativos, posts reportados,
taxa de resolução de ajudas. Busca dados via KCAPI e atualiza periodicamente.

**KCAPI calls:** `KCAPI.getDashboardMetrics()`

**Testes:** `tests/integration/admin-dashboard.metrics.test.js`

---

#### `admin-dashboard.charts.js` *(auxiliar)*

**Responsabilidade:** Gráficos do dashboard: posts por módulo, tendências de uso, distribuição
de cursos. Renderiza charts simples com CSS/SVG (sem biblioteca externa).

**Testes:** `tests/integration/admin-dashboard.charts.test.js`

---

#### `admin-dashboard.audit.js` *(auxiliar)*

**Responsabilidade:** Log de auditoria: ações recentes de moderação, histórico de bans,
alterações de configuração. Garante rastreabilidade das ações admin.

**Testes:** `tests/integration/admin-dashboard.audit.test.js`

---

#### `admin-dashboard.controller.js` *(orchestrador)*

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `admin/index.html` |

**Responsabilidade:** Orchestrador do dashboard admin: inicializa os 4 auxiliares, gerencia
tabs de navegação (visão geral/moderação/auditoria), e controla refresh automático de dados.

**Dependências de carregamento:** cadeia de boot → utils → api → adapters → admin-shell →
core → admin-dashboard.shared → .metrics → .charts → .audit → `admin-dashboard.controller.js`

---

### `admin-banners.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `admin/banners.html` |

**Responsabilidade:** Gerenciamento de banners promocionais: listar banners ativos e agendados,
criar novo banner (imagem + link + módulo + vigência), ativar/desativar e reordenar.

**KCAPI calls principais:** `KCAPI.listAdminBanners()`, `KCAPI.createBanner(data)`,
`KCAPI.updateBanner(id, data)`, `KCAPI.deleteBanner(id)`

**Testes:** `tests/contract/admin-banners-access-contract.test.js`

---

### `admin-help-requests.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `admin/help-requests.html` |

**Responsabilidade:** Gestão de tickets de ajuda: listar tickets por status (novo/em andamento/
resolvido), responder tickets, alterar status e filtrar por categoria.

**KCAPI calls principais:** `KCAPI.listAdminHelpRequests(params)`,
`KCAPI.updateHelpStatus(id, status)`, `KCAPI.replyHelpRequest(id, text)`

**Testes:** Coberto por `tests/integration/kc-api-help-module.test.js`

---

### `admin-invite.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | Página admin de convites *(não listada nas 5 principais — uso interno)* |

**Responsabilidade:** Gestão de convites de acesso: gerar links de convite para usuários
externos à UFG, com prazo de validade e controle de uso.

**KCAPI calls principais:** `KCAPI.createInvite(data)`, `KCAPI.listInvites()`

---

### `admin-moderation.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `admin/moderation.html` |

**Responsabilidade:** Fila de moderação: listar posts reportados por usuários, exibir detalhes
do report, aprovar/remover post, banir usuário temporária ou permanentemente.

**KCAPI calls principais:** `KCAPI.listReportedPosts(params)`,
`KCAPI.moderatePost(postId, action)`, `KCAPI.banUser(userId, reason, duration)`

---

### `admin-reports.controller.js`

| Campo | Valor |
|-------|-------|
| Namespace | *(sem namespace — IIFE)* |
| Página | `admin/reports.html` |

**Responsabilidade:** Relatórios de uso da plataforma: exportar dados de analytics, posts por
período, usuários ativos, métricas de engajamento. Gera CSV ou exibe tabelas.

**KCAPI calls principais:** `KCAPI.getAnalyticsReport(params)`,
`KCAPI.exportData(type, filters)`

**Testes:** Coberto por `tests/integration/admin-dashboard.audit.test.js`

---

## Mapa Controller × Página × Arquivos

| Página HTML | Controller principal | Auxiliares |
|-------------|---------------------|------------|
| `index.html` | `index.controller.js` | — |
| `compra-venda-feed.html` | `compra-venda-feed.controller.js` | `kc-feed.controller.js` |
| `caronas-feed.html` | `caronas-feed.controller.js` | `kc-feed.controller.js` |
| `moradia.html` | `moradia.controller.js` | `kc-feed.controller.js` |
| `eventos.html` | `eventos.controller.js` | `kc-feed.controller.js` |
| `oportunidades.html` | `oportunidades.controller.js` | `kc-feed.controller.js`, `oportunidades.normalize.js` |
| `achados-perdidos.html` | `achados-perdidos.controller.js` | `kc-feed.controller.js` |
| `_product.html` | `product.controller.js` | `product.load.js`, `product.render.js`, `product.popovers.js`, `product.ratings.js`, `product.save.js`, `product.related.js`, `product.edit.js`, `product.report.js`, `product.analytics.js`, `product.calendar.js` |
| `profile.html` | `profile.controller.js` | `profile.presentation.js`, `profile.collections.js`, `profile.ratings.js`, `profile.flow.js` |
| `create-post.html` | `create-post.controller.js` | *(features/create-post/*.js)* |
| `my-posts.html` | `my-posts.controller.js` | — |
| `settings.html` | `settings.controller.js` | — |
| `account-setup.html` | `account-setup.controller.js` | — |
| `ajuda.html` | `help.controller.js` | — |
| `ods.html` | `ods.controller.js` | — |
| `search-results.html` | *(inline — kc-search.js)* | `kc-search.js`, `search-analytics.shared.js` |
| `auth-callback.html` | *(inline — kc-auth-callback.js)* | — |
| `admin/index.html` | `admin-dashboard.controller.js` | `admin-dashboard.shared.js`, `.metrics.js`, `.charts.js`, `.audit.js` |
| `admin/banners.html` | `admin-banners.controller.js` | — |
| `admin/help-requests.html` | `admin-help-requests.controller.js` | — |
| `admin/moderation.html` | `admin-moderation.controller.js` | — |
| `admin/reports.html` | `admin-reports.controller.js` | — |
