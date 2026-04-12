# RELATÓRIO KINOCAMPUS v11

**Plano Diretor de Auditoria, Consistência, Hardening e Evolução Segura**

| Campo | Valor |
|---|---|
| Data de abertura | 08 de abril de 2026 |
| Linha-base | `kinocampus-V11.0-foundations` |
| Estado desta fase | execução iniciada; iterações `v11.1.0`, `v11.2.0`, `v11.2.1`, `v11.3.0`, `v11.4.0`, `v11.5.0`, `v11.6.0`, `v11.7.0`, `v11.8.0`, `v11.9.0`, `v11.10.0`, `v11.11.0`, `v11.11.1`, `v11.12.0`, `v11.13.0`, `v11.13.1`, `v11.14.0`, `v11.15.0`, `v11.15.1`, `v11.15.2`, `v11.16.0`, `v11.17.0`, `v11.18.0`, `v11.19.0`, `v11.19.1`, `v11.20.0`, `v11.20.1`, `v11.20.2`, `v11.21.0`, `v11.21.1`, `v11.22.0` e `v11.23.0` ja registradas, com baseline documental, consistencia do shell publico, desbloqueio operacional do Vercel MCP no Codex, normalizacao dos feeds equivalentes, correcao transversal do bootstrap de ranking dos modulos, hardening especifico para gestos/zoom do iOS Safari, paridade endurecida do driver local frente ao contrato moderno da `KCAPI`, fechamento da duplicacao residual em `localCreatePost`, introducao de hidratacao persistente com revalidacao silenciosa em ranking e votos, extensao controlada do mesmo padrao para analytics/comentarios da pagina de produto, limpeza estrutural de `kc-comments.js`, reformulacao do roadmap remanescente da v11 em uma sequencia executavel continua, avanco da macrofase de conta/onboarding/settings ate a hidratacao social deterministica de `account-setup`, a primeira rodada operacional dedicada ao Supabase Advisor com correcao versionada de RLS/performance, o planejamento formal da futura trilha de notificacoes multicanal, a primeira rodada funcional do shell in-app de notificacoes com limpeza explicita do dropdown, a persistencia segura de preferencias por evento/canal em camada privada separada, a fundacao assincrona de entrega externa com outbox/attempts, a promocao do canal de e-mail com dispatcher real, o canal privado de WhatsApp com destino dedicado, consentimento explicito, normalizacao E.164, rate limit operacional, o scheduler versionado do dispatcher com runtime privado, `pg_cron` e observabilidade de runs e agora o release gate final da rodada principal da v11 |
| Versão-alvo | v11 |
| Escopo macro | auditoria técnica e correções seguras em frontend, backend Supabase, documentação, QA, deploy e governança |
| Documento vivo | sim; deve ser atualizado a cada iteração da v11 |

---

## 1. Resumo executivo

A v11 não nasce como um pacote de features isoladas. Ela nasce como uma esteira de **auditoria sistemática e endurecimento controlado** da plataforma inteira, com foco em:

- inconsistências entre arquivos equivalentes
- bugs latentes e regressões silenciosas
- padrões desatualizados ou divergentes
- pontos de alto acoplamento e alto risco
- otimizações seguras sem quebra de contrato
- lacunas entre documentação, código, banco e comportamento real em produção

O princípio central da v11 é:

> **melhorar a plataforma sem quebrar contratos públicos, sem introduzir drift entre arquivos equivalentes e sem alterar um ponto compartilhado sem validar toda a malha relacionada.**

Isso significa que a v11 será executada em fatias pequenas, rastreáveis e reversíveis, sempre com:

- branch dedicada
- commit, push, PR, merge, delete branch e pull
- validação local
- validação Supabase quando houver SQL
- validação Vercel/browser após deploy
- atualização obrigatória deste relatório e do `README.md`

---

## 2. Fontes obrigatórias de verdade para a v11

Este planejamento foi construído com base nas seguintes fontes:

- `README.md`
- `CHANGELOG.md`
- `RELATORIO-KINOCAMPUS-V9.md`
- `C:\Users\yan1n\Downloads\Plano KinoCampus v10 - Admin Panel Overhaul.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/db-schema.md`
- `docs/rpc-catalog.md`
- `docs/module-schemas.md`
- `docs/design-system.md`
- `docs/env-vars.md`
- `docs/ops/vercel-supabase-invariants.md`
- `docs/qa/*`
- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`
- `supabase/functions/*`

Regras de precedência:

1. O comportamento real do código e do banco prevalece sobre documentação desatualizada.
2. Para banco, a fonte oficial continua sendo `supabase/schema-*.sql` e `supabase/migrations/*.sql`.
3. Para contratos de frontend, `KCAPI`, adapters, controllers compartilhados e HTMLs equivalentes devem ser tratados como superfícies públicas sensíveis.
4. Qualquer divergência encontrada entre docs e código deve virar item explícito de backlog da v11.

---

## 3. Inventário atual do repositório

### 3.1. Estrutura principal

- páginas HTML públicas na raiz: `17`
- páginas HTML administrativas: `5`
- arquivos JS em `assets/js`: `61`
- controllers em `assets/js/controllers`: `23`
- adapters em `assets/js/adapters`: `2`
- componentes em `assets/js/components`: `3`
- arquivos CSS em `assets/css`: `5`
- arquivos de teste em `tests`: `49`
- migrations em `supabase/migrations`: `81`

### 3.2. Hotspots técnicos por tamanho e risco

Arquivos que concentram muito comportamento e merecem prioridade alta na v11:

| Área | Arquivo | Tamanho aprox. | Risco |
|---|---|---:|---|
| adapter dominante | `assets/js/adapters/supabase.adapter.js` | 147 KB | alto acoplamento com banco e contratos de API |
| detalhe de publicação | `assets/js/controllers/product.controller.js` | 139 KB | UI crítica, comentários, ações, analytics, related posts |
| criação de publicação | `assets/js/kc-create-post.js` | 108 KB | formulário central, schemas dinâmicos, upload e validação |
| utilitários globais | `assets/js/kc-utils.js` | 96 KB | alto impacto transversal |
| admin principal | `assets/js/controllers/admin-dashboard.controller.js` | 91 KB | KPIs, audit log, export, ranking |
| fachada de API | `assets/js/kc-api.client.js` | 91 KB | compatibilidade entre local e Supabase |
| design system global | `assets/css/styles.css` | 235 KB | alto risco de regressão visual transversal |

### 3.3. Sinais iniciais já detectados

Sem executar nenhuma iteração funcional ainda, o material atual já mostra pontos que a v11 precisa atacar:

- documentação-base ainda ancorada em versões v9 em vários arquivos técnicos
- `CHANGELOG.md` ainda não consolida formalmente a linha v10
- `docs/index.md` aponta para um plano externo legado em `.claude`, o que hoje não é uma referência operacional confiável para a v11
- `docs/db-schema.md` e outros documentos estruturais carregam contagens e estados antigos de migrations/tabelas
- há grande concentração de lógica em poucos arquivos grandes, o que sugere necessidade de modularização cuidadosa, não brusca
- a cobertura de testes existe, mas está concentrada em utilities/adapters; páginas e controllers grandes continuam mais dependentes de smoke e verificação manual

Esses itens não são ainda “implementação v11”; são **insumos de priorização**.

---

## 4. Objetivos da v11

### 4.1. Objetivo principal

Criar uma nova linha de qualidade da plataforma por meio de uma auditoria técnica integral, seguida de correções controladas e consolidação de padrões, sem quebra de funcionalidades existentes.

### 4.2. Objetivos específicos

- mapear e reduzir drift entre arquivos equivalentes
- harmonizar padrões de UI, JS e contratos de dados
- identificar e corrigir bugs silenciosos e edge cases
- reduzir risco em arquivos superconcentrados
- reforçar paridade entre `LocalAdapter` e `SupabaseAdapter`
- alinhar documentação técnica com o estado real da plataforma
- aumentar a confiabilidade de deploy, banco e QA
- registrar cada passo de forma rastreável

### 4.3. O que a v11 não deve fazer

- não deve introduzir refactors massivos sem fatiamento
- não deve mudar contratos públicos sem camada de compatibilidade
- não deve “limpar” arquivos equivalentes parcialmente
- não deve misturar várias correções não relacionadas na mesma PR
- não deve alterar banco ou infra sem validação operacional correspondente

---

## 5. Contrato operacional não negociável da v11

Em toda iteração aprovada da v11, deve ser seguido este fluxo:

1. Sincronizar a base `kinocampus-V11.0-foundations`.
2. Abrir branch própria para a iteração.
3. Atualizar este `RELATORIO-KINOCAMPUS-V11.md` e o `README.md` no início e no fechamento da iteração.
4. Implementar apenas a fatia aprovada.
5. Validar impacto em todos os arquivos equivalentes e relacionados.
6. Rodar checagens locais e testes direcionados.
7. Quando houver mudança SQL:
   - criar migration oficial em `supabase/migrations/`
   - aplicar no Supabase
   - validar RPC/tabela/policy
8. Fazer push, abrir PR, revisar, mergear, deletar branch e puxar a base.
9. Validar deploy no Vercel e comportamento em navegador.
10. Registrar evidência e status no relatório v11.

### 5.1. Regras de mudança segura

- nenhum rename de helper/variável compartilhada sem busca repo-wide
- nenhum ajuste em um módulo “irmão” sem checar os outros módulos equivalentes
- nenhum ajuste em adapter sem validar fachada `KCAPI`
- nenhum ajuste em HTML sem revisar CSS e JS que dependem de IDs, classes e `data-*`
- nenhuma mudança em RPC/RLS sem rever callers no frontend e docs técnicas relacionadas
- nenhuma otimização “cosmética” deve eliminar fallback existente sem prova de equivalência

### 5.2. Equivalência obrigatória

Quando um padrão compartilhado for tocado, a revisão deve cobrir pelo menos:

| Grupo equivalente | Arquivos mínimos a revisar |
|---|---|
| feeds públicos | `compra-venda-feed`, `caronas`, `moradia`, `eventos`, `oportunidades`, `achados-perdidos` |
| admin | `admin/*.html` + controllers admin + `admin-shell.js` + `admin-shell.css` |
| adapters | `supabase.adapter.js` + `local.adapter.js` + `kc-api.client.js` |
| superfícies de perfil | `profile.html`, `settings.html`, `account-setup.html`, `my-posts.html` |
| produto/publicação | `_product.html`, `product.controller.js`, `kc-comments.js`, `kc-create-post.js`, `styles.css`, `product.css` |
| documentação técnica | `README.md`, `CHANGELOG.md`, `RELATORIO-KINOCAMPUS-V11.md`, docs afetadas |

---

## 6. Modelo de auditoria v11

A v11 será executada em duas macrocamadas:

### 6.1. Camada A — auditoria e diagnóstico

Leitura técnica, comparação de equivalentes, identificação de drift, bugs e débitos.

### 6.2. Camada B — correção segura

Aplicação das correções aprovadas em fatias pequenas, sempre acompanhadas de validação e atualização documental.

---

## 7. Eixos de auditoria da v11

## 7.1. Documentação, contratos e governança

**Objetivo:** alinhar documentação com o estado real da plataforma.

**Arquivos foco:**

- `README.md`
- `CHANGELOG.md`
- `RELATORIO-KINOCAMPUS-V9.md`
- `RELATORIO-KINOCAMPUS-V11.md`
- `docs/*.md`
- `docs/ops/*`
- `docs/qa/*`

**O que procurar:**

- contagens desatualizadas
- versões antigas não refletidas no estado atual
- contratos documentais divergentes do código
- links/pastas legadas ainda tratadas como canônicas
- ausência de referência aos fluxos atuais de v10

**Saída esperada:**

- baseline documental coerente
- índice claro de documentos canônicos
- backlog explícito de drifts documentais

## 7.2. Shell público, navegação e páginas base

**Objetivo:** garantir consistência estrutural entre páginas públicas.

**Arquivos foco:**

- `index.html`
- `ajuda.html`
- `search-results.html`
- `ods.html`
- páginas de módulo
- `_product.html`
- `assets/css/styles.css`
- `assets/css/kc-public-shell.css`
- scripts de shell/header/nav/search/theme

**O que procurar:**

- diferenças indevidas entre headers, toggles, busca e navegação
- IDs/classes inconsistentes entre páginas equivalentes
- padrões de acessibilidade aplicados em umas páginas e ausentes em outras
- drift de breakpoints, spacing, safe area e mobile nav

## 7.3. Design system e CSS

**Objetivo:** reduzir CSS redundante, drift visual e riscos de regressão.

**Arquivos foco:**

- `assets/css/styles.css`
- `assets/css/product.css`
- `assets/css/admin-shell.css`
- `assets/css/kc-public-shell.css`
- `assets/css/kc-theme-boot.css`

**O que procurar:**

- regras duplicadas ou conflitantes
- media queries quebradas ou divergentes
- hardcodes de cor/spacing/offset que deveriam virar tokens/variables
- componentes com semântica visual parecida implementados de forma diferente
- riscos de clipping, overflow, stacking context e comportamento mobile

## 7.4. Core JS, facade e adapters

**Objetivo:** endurecer o núcleo sem quebrar contratos.

**Arquivos foco:**

- `assets/js/kc-env.js`
- `assets/js/kc-constants.js`
- `assets/js/kc-utils.js`
- `assets/js/kc-core.js`
- `assets/js/kc-api.client.js`
- `assets/js/adapters/supabase.adapter.js`
- `assets/js/adapters/local.adapter.js`

**O que procurar:**

- duplicação entre `KCAPI` e adapters
- drift de contrato entre local e Supabase
- funções grandes demais com múltiplas responsabilidades
- normalizações inconsistentes de dados
- fallbacks silenciosos pouco observáveis
- caches/event listeners sem cleanup claro

## 7.5. Feeds modulares e controllers equivalentes

**Objetivo:** revisar os 6 módulos públicos como família, não isoladamente.

**Arquivos foco:**

- `assets/js/controllers/compra-venda-feed.controller.js`
- `assets/js/controllers/caronas-feed.controller.js`
- `assets/js/controllers/moradia.controller.js`
- `assets/js/controllers/eventos.controller.js`
- `assets/js/controllers/oportunidades.controller.js`
- `assets/js/controllers/achados-perdidos.controller.js`
- `assets/js/controllers/kc-feed.controller.js`

**O que procurar:**

- divergências de comportamento entre filtros equivalentes
- bugs já corrigidos em um módulo e ainda presentes em outro
- inicialização duplicada
- inconsistências em ranking lateral, busca, paginação, estados vazios e marcadores
- dependência excessiva de seleção DOM “por acaso”

## 7.6. Produto, criação, comentários e interação social

**Objetivo:** consolidar a superfície mais crítica de engajamento.

**Arquivos foco:**

- `_product.html`
- `assets/js/controllers/product.controller.js`
- `assets/js/kc-create-post.js`
- `assets/js/kc-comments.js`
- `assets/js/kc-banners.js`
- `assets/js/kc-ranking.js`
- `assets/js/kc-search.js`
- `assets/js/kc-notifications.js`

**O que procurar:**

- excesso de lógica inline em controllers grandes
- popovers, modais, overlays e closes inconsistentes
- problemas de lazy loading
- dependência de ordem de script
- edge cases de auth/guest/owner/admin
- fluxos de salvar, compartilhar, denunciar, comentar, avaliar e criar parecido

## 7.7. Perfil, conta e superfícies do usuário

**Objetivo:** revisar toda a camada de identidade e preferências.

**Arquivos foco:**

- `profile.html`
- `settings.html`
- `account-setup.html`
- `my-posts.html`
- `assets/js/controllers/profile.controller.js`
- `assets/js/controllers/account-setup.controller.js`
- `assets/js/controllers/my-posts.controller.js`
- `assets/js/account-profile.shared.js`
- `assets/js/help.shared.js`

**O que procurar:**

- estados vazios e falhas silenciosas
- inconsistência entre perfil público, perfil privado e onboarding
- problemas de compatibilidade entre IDs UUID e IDs legados
- drift entre bio/avatar/privacy e contrato do banco

## 7.8. Admin pós-v10

**Objetivo:** validar a estabilidade do admin depois do overhaul v10.

**Arquivos foco:**

- `admin/*.html`
- `assets/js/admin-shell.js`
- `assets/css/admin-shell.css`
- controllers admin

**O que procurar:**

- regressões pós-v10
- padrões que ainda ficaram assimétricos
- duplicações entre telas admin
- inconsistências de paginação, busca, modal, filtros, export e feedback
- pontos que ainda dependem demais de fallback em vez de contrato fechado

## 7.9. Banco, RPCs, RLS, Edge Functions e templates

**Objetivo:** revisar integridade operacional da camada Supabase.

**Arquivos foco:**

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`
- `supabase/functions/*`
- `supabase/manual/*`
- `supabase/templates/*`
- `docs/db-schema.md`
- `docs/rpc-catalog.md`

**O que procurar:**

- funções/rpcs sem documentação alinhada
- search_path, grants e policies inconsistentes
- migrations com sobreposição funcional
- gaps entre banco principal e instrução operacional
- drift entre schema real, adapters e docs

## 7.10. Testes, QA e release hygiene

**Objetivo:** tornar a v11 verificável, não apenas implementada.

**Arquivos foco:**

- `tests/*.test.js`
- `jest.config.js`
- `scripts/hygiene-check.js`
- `docs/qa/*`
- `vercel.json`

**O que procurar:**

- áreas críticas sem cobertura
- testes muito acoplados a internals e pouco úteis para regressão real
- ausência de smoke para controllers grandes
- checks de release incompletos
- incoerência entre QA documentado e QA realmente executável

---

## 8. Estratégia de execução da v11 em fatias

A execução da v11 passa a seguir uma trilha contínua e cumulativa: cada iteração fecha uma fatia pequena e já deixa a próxima explicitamente definida. O que já foi entregue permanece como base consolidada; o que ainda falta foi reorganizado abaixo em novas fases sequenciais dentro da própria linha `v11.x`.

### 8.1. Estado consolidado das macrofases já iniciadas

| Macrobloco | Cobertura atual | Situação |
|---|---|---|
| documentação, inventário e governança | `v11.1.0`, `v11.11.1` | consolidado |
| shell público, busca e navegação | `v11.2.0`, `v11.2.1` | consolidado |
| feeds equivalentes e filtros | `v11.3.0`, `v11.4.0`, `v11.5.0`, `v11.6.0` | amplamente coberto |
| produto, comentários, ranking, votos, persistência incremental e notificações in-app | `v11.9.0`, `v11.10.0`, `v11.11.0`, `v11.13.0`, `v11.13.1`, `v11.20.0`, `v11.20.1`, `v11.20.2`, `v11.21.0`, `v11.21.1` | coberto nas superfícies atuais; e-mail e WhatsApp ja existem na trilha externa com destino privado separado, restando agora observabilidade, storage e invariantes finais |
| perfil e listagens do usuário | `v11.14.0` | iniciado com normalização de rotas humanas de detalhe entre perfil e `my-posts` |
| conta, onboarding e settings | `v11.15.0`, `v11.15.1`, `v11.15.2` | coberto até o fechamento seguro do preview e da hidratação social do onboarding; próximos avanços só se surgir bug concreto ou novo objetivo de produto |
| admin pós-v10 | `v11.16.0`, `v11.17.0` | coberto no shell e na primeira redução de fallback implícito, com `banners` alinhado ao contrato moderno de acesso admin |
| adapters e fachada `KCAPI` | `v11.7.0`, `v11.8.0`, `v11.18.0` | coberto no endurecimento de paridade local/moderno e no ajuste contratual de counts; a trilha seguinte passou para a camada operacional de Supabase em `v11.19.0` |

### 8.2. Sequência remanescente obrigatória da v11

Atualização de status em `11 de abril de 2026`: a fase `v11.12.0` foi executada no eixo de criação de publicação e fechada na PR `#245`. A macrofase `v11.13.x` foi fechada em duas fatias complementares: `v11.13.0`, focada no dropdown de notificações, e `v11.13.1`, focada no residual remanescente de popovers/interações da página de produto, concluída na PR `#249`. A fase `v11.14.0` foi concluída na PR `#251`, alinhando `profile` e `my-posts` à rota canônica `_product.html` para navegação humana de detalhe. A fase `v11.15.0` foi concluída na PR `#253`, alinhando o preview de contato em `settings` ao mesmo helper canônico de detalhe. A fase `v11.15.1` foi concluída na PR `#255`, alinhando a prévia de contato de `account-setup` ao `buildContactAction` e ao toggle de contato público. A fase `v11.15.2` foi concluída na PR `#257`, tornando determinística a hidratação de redes sociais e visibilidade no onboarding. A fase `v11.16.0` foi concluída na PR `#259`, unificando o preload do shell administrativo entre as 5 telas admin. A fase `v11.17.0` foi concluída na PR `#261`, alinhando `admin-banners.controller.js` ao contrato moderno de acesso admin e removendo o fallback que carregava a tela sem sessão validada. A fase `v11.18.0` foi concluída na PR `#263`, alinhando a assinatura de `getProfileHighlightsCount(...)` entre `KCAPI`, `local.adapter.js` e `supabase.adapter.js` sem alterar a semântica highlight-only. A fase `v11.19.0` foi concluída na PR `#265`, com migration versionada para eliminar warnings ativos do Advisor em `notifications`, `post_view_events` e `kc_invited_emails`, além de sincronização de `docs/db-schema.md`, `docs/rpc-catalog.md` e invariantes operacionais. A rodada documental `v11.19.1` consolidou o diagnóstico do sino/notificações e desdobrou a trilha futura de notificações em novas fases `v11.20.x` e `v11.21.x`. A fase `v11.20.0` foi concluída na PR `#269`, endurecendo o shell do sino, adicionando `Limpar` ao dropdown, explicitando `KCAPI.clearNotifications()` e ampliando o contrato de realtime para tratar `INSERT`, `UPDATE` e `DELETE` sem regressão de badge. A fase `v11.20.1` foi concluída na PR `#271`, introduzindo a camada privada `notification_preferences`, a UI de configuração em `settings`, a persistência por evento/canal em `KCAPI`/adapters e o respeito ao canal `in_app` nos triggers atuais. A fase `v11.20.2` entregou a fundação assíncrona de entrega externa com outbox, attempts, helper canônico `kc_emit_notification_event(...)`, Edge Function `kc-dispatch-notification-outbox` validada em dry-run e correção do trigger de voto para o contrato real de `post_votes`. A fase `v11.21.0` promoveu o canal de e-mail com template dedicado, claim/attempt atômicos no banco, dispatcher real via `Resend` e gating explícito por segredos operacionais, preservando a trilha canônica in-app. A fase `v11.21.1` foi consolidada nesta rodada com o canal privado de WhatsApp em `notification_channel_targets`, consentimento explícito, normalização E.164, rate limit por usuário e dispatcher via Twilio sem reaproveitar o WhatsApp público do perfil. A fase `v11.22.0` foi concluída na PR `#278`, fechando a primeira camada operacional da trilha multicanal com `notification_dispatch_runtime`, `notification_dispatch_runs`, o helper `kc_trigger_notification_dispatch(...)`, o job `pg_cron` `kc-dispatch-notification-outbox`, a Edge Function `kc-dispatch-notification-outbox` republicada como versão `5` e a validação ponta a ponta do fluxo SQL -> HTTP -> log privado de runs. A fase `v11.23.0` foi concluída na PR `#280`, fechando o release gate final da rodada principal da v11 com regressão completa, hygiene `8.6.0`, smoke remoto em produção e residuals operacionais consolidados sem abrir refactor novo. A próxima sequência estratégica abre em `v11.24.0` para planejamento-only de i18n, acessibilidade e UX Writing.

| Iteração-alvo | Objetivo principal | Superfícies foco | Saída esperada |
|---|---|---|---|
| `v11.15.0` | iniciar o fechamento de conta, onboarding e settings | `settings.html`, `account-setup.html`, shareds de conta/perfil | preview de contato e rota canônica inicial alinhados ao contrato atual |
| `v11.15.1` | continuar a rodada de conta, onboarding e settings | `settings.html`, `account-setup.html`, shareds de conta/perfil | preview do onboarding alinhado ao CTA real e ao toggle de contato público |
| `v11.15.2` | aprofundar a rodada de conta, onboarding e settings | `settings.html`, `account-setup.html`, shareds de conta/perfil | onboarding e preferências alinhados ao contrato atual |
| `v11.16.0` | iniciar a consolidação do admin pós-v10 | `admin/*.html`, `admin-shell.js`, `admin-shell.css`, listas, modais e busca | simetria de shell e UX admin endurecida |
| `v11.17.0` | fechar a primeira rodada do admin pós-v10 e reduzir fallback excessivo | controllers admin, fluxos de paginação, export, feedback e contratos internos | admin mais previsível e menos dependente de fallback implícito |
| `v11.18.0` | aprofundar a rodada de contratos entre `KCAPI` e adapters | `kc-api.client.js`, `supabase.adapter.js`, `local.adapter.js`, consumers críticos | concluído na PR `#263`, com paridade de assinatura para `getProfileHighlightsCount(...)` e regressões focadas |
| `v11.19.0` | revisar Supabase operacional | migrations, RPCs, `search_path`, grants, RLS, docs de banco | concluído nesta rodada com migration de performance/RLS e alinhamento documental do banco |
| `v11.20.0` | endurecer o shell in-app de notificações | `kc-notifications.js`, header markup/CSS, `KCAPI`, adapters e contrato de dropdown | concluído na PR `#269`, com `kcNotifBell` visualmente endurecido, ação explícita de `Limpar`, `KCAPI.clearNotifications()` e realtime expandido para `INSERT`/`UPDATE`/`DELETE` |
| `v11.20.1` | persistir preferências de notificação por evento e canal | `settings.html`, `KCAPI`, adapters, migration de preferências | concluído na PR `#271`, com camada privada `notification_preferences`, UI em `settings` e triggers atuais respeitando `in_app` |
| `v11.20.2` | criar a fundação assíncrona de entrega externa | `supabase/functions/*`, migrations de fila/log, envs, invariantes operacionais | concluído nesta rodada com `notification_delivery_outbox`, `notification_delivery_attempts`, `kc_emit_notification_event(...)`, correção do trigger de voto e dispatcher `kc-dispatch-notification-outbox` validado em dry-run |
| `v11.21.0` | implementar o canal e-mail | Edge Function de envio, template, logs de entrega, fallback e docs operacionais | concluído nesta rodada com helpers SQL de claim/attempt, dispatcher real via `Resend`, preview seguro em `dry_run` e gating operacional quando os segredos `KC_NOTIFICATION_EMAIL_*` ainda não existirem no projeto |
| `v11.21.1` | implementar o canal WhatsApp | provider, opt-in, normalização E.164, rate-limit, logs e consentimento | concluído nesta rodada com destino privado em `notification_channel_targets`, novos métodos de `KCAPI`, consentimento explícito em `settings` e dispatcher multicanal via Twilio |
| `v11.22.0` | revisar storage, Edge Functions e invariantes de deploy já com a trilha de notificações multicanal | storage, segredos, templates, retries, observabilidade, docs ops | concluído nesta rodada com scheduler versionado, runtime privado do dispatcher, log privado de runs e validação ponta a ponta helper SQL -> HTTP -> `notification_dispatch_runs` |
| `v11.23.0` | executar o release gate final da v11 | testes, QA, changelog final, documentacao, drift de versao canonica `8.6.0` | concluido na PR `#280`, com `51/51` suites, hygiene verde, preview `dpl_DucDMJtPmLg7TS78UnVQVX4LHWiU` e producao `dpl_HPMAUgYe6kcoHBDh9vjp54mYg4VA` |
| `v11.24.0` | iniciar a trilha futura de i18n, acessibilidade e UX Writing sem escrever código | relatório v11, inventário textual, superfícies críticas de UI, SEO, testes e contratos | entrega obrigatória somente de planejamento, em relatório estruturado com `ETAPA 1`, `ETAPA 2` e `ETAPA 3`, aguardando aprovação explícita |
| `v11.24.1` | implantar a infraestrutura base aprovada | chaves de tradução, helpers shared, dicionário base pt-BR, guardrails de teste e lint | fundação i18n/a11y pronta nas superfícies core sem regressão visual ou contratual |
| `v11.24.2` | aplicar a trilha em componentes core e fluxos comuns | botões, modais, formulários, toasts, navegação, aria-labels e mensagens de erro | componentes centrais semanticamente corretos, internacionalizáveis e com copy padronizada |
| `v11.24.3` | expandir para páginas complexas, metadata e SEO dinâmico | home, feeds, produto, perfil, settings, metadata e testes e2e | rollout controlado com QA de layout, testes resilientes a texto e mitigação explícita de SEO/hydration |

### 8.3. Regra de progressão entre fases

- a próxima iteração só começa quando a anterior tiver PR mergeada, branch removida, base puxada e deploy validado
- cada iteração acima deve atualizar este relatório com o status da fase e redefinir explicitamente a próxima
- se uma fase descobrir um escopo maior do que o previsto, ela deve ser repartida em `v11.x+0.1` documental ou em uma nova iteração imediatamente subsequente, nunca absorvida silenciosamente
- a rodada principal da v11 foi encerrada em `v11.23.0`; novas frentes estrategicas dentro da linha `v11.x` passam a abrir iteracoes formais a partir de `v11.24.0` e devem redefinir explicitamente o novo marco deste documento

### 8.4. Regra de fatiamento

Cada fase acima ainda pode se desdobrar em várias PRs pequenas. Nenhuma PR deve misturar:

- mudança pública + mudança admin + mudança banco, se não forem inseparáveis
- correção de bug com refactor estrutural amplo
- atualização documental solta sem vínculo com o estado real da iteração

### 8.5. Trilha futura de notificações multicanal

**Diagnóstico atual**

- o sino (`kc-notif-bell`) não aparenta estar sendo cortado por `overflow` do header: o shell público já usa `overflow: visible` em `body.kc-shell-page .kc-header` e `body.kc-shell-page .kc-header-container`
- a sensação de sino "comido" vem principalmente da geometria apertada do shell responsivo: botão `36x36`, `padding: 0`, `line-height: 1` e badge (`top: -2px`, `right: -4px`) sobrepondo demais a área útil do ícone
- o dropdown atual já suporta listar, marcar individualmente como lida, `Marcar todas como lidas` e `Limpar`, com o shell endurecido em `v11.20.0`
- a camada pública da API hoje expõe `getNotifications`, `markNotificationsRead`, `markAllNotificationsRead`, `clearNotifications`, `getNotificationPreferences`, `updateNotificationPreferences`, `getUnreadNotificationCount`, `subscribeNotifications` e `unsubscribeNotifications`
- a partir de `v11.20.1`, existe modelo persistido de preferência por evento/canal em `public.notification_preferences`, com defaults backfill-safe e enforcement atual apenas do canal `in_app`
- a partir de `v11.20.2`, existe trilha assíncrona base para entrega externa, com `notification_delivery_outbox`, `notification_delivery_attempts`, helper `kc_emit_notification_event(...)` e dispatcher HTTP separado
- a partir de `v11.21.0`, o canal `email` já possui envio real na Edge Function `kc-dispatch-notification-outbox`, com preview em `dry_run`, claim atômico da fila, histórico de attempts e gating explícito quando os segredos do provider ainda não estiverem configurados no projeto
- a partir de `v11.21.1`, o canal `whatsapp` já possui destino privado dedicado em `notification_channel_targets`, consentimento explícito, normalização E.164, previews em `dry_run` e dispatcher real via Twilio quando os segredos do provider existirem
- o WhatsApp disponível no produto/perfil hoje continua sendo uma superfície de contato público/social; ele **não deve** ser reaproveitado automaticamente como endpoint privado de notificações

**Arquitetura-alvo segura**

- manter `public.notifications` como feed canônico in-app e fonte única do dropdown/sino
- introduzir uma camada separada de preferências de notificação, com opt-in explícito por evento e canal, em vez de acoplar isso a `profiles.social_links` ou `contact_primary_method`
- introduzir uma fila/outbox de entrega externa e um log de entregas, para que e-mail/WhatsApp sejam assíncronos, observáveis e não executem provider call dentro dos triggers principais de comentário/voto/post
- preservar o contrato atual de realtime e badge: a expansão multicanal não deve alterar o comportamento do sino, apenas complementar os destinos de entrega

**Diretriz funcional para a UI**

- no `kcNotifDropdown`, a ação futura deve separar claramente:
  - `Marcar todas como lidas`
  - `Limpar lidas`
  - eventual exclusão total com confirmação, fora do caminho rápido do dropdown
- a `v11.20.0` entregou o endurecimento base do dropdown:
  - geometria mais estável para o sino e badge
  - `Limpar` com confirmação explícita
  - envelope de realtime compatível com `INSERT`, `UPDATE` e `DELETE`
  - sem ainda introduzir preferências por canal ou entregas externas
- a `v11.20.1` entregou a persistência segura de preferências:
  - tabela privada `notification_preferences`
  - `KCAPI` e adapters com leitura/escrita das preferências por evento/canal
  - UI de configuração em `settings`
  - triggers in-app atuais respeitando `in_app` sem alterar a trilha canônica `public.notifications`
- a `v11.20.2` entregou a fundação assíncrona:
- `notification_delivery_outbox` para fila privada de canais externos
- `notification_delivery_attempts` para histórico imutável de tentativas
- `kc_emit_notification_event(...)` como helper canônico para separar notificação in-app de outbox externo
- Edge Function `kc-dispatch-notification-outbox` publicada em dry-run com `x-kc-dispatch-secret`
- resolução atual de destino privado por `auth.users.email` para e-mail e bloqueio explícito de WhatsApp até existir configuração privada dedicada
- a `v11.21.0` promoveu essa trilha para o canal `email`:
- `kc_claim_notification_delivery_batch(...)` para claim atômico com recuperação de locks stale
- `kc_record_notification_delivery_attempt(...)` para fechar attempts/outbox de forma consistente
- envio real por `Resend` quando `dryRun=false`
- preview seguro de envelope em `dry_run`
- gating operacional `email_provider_not_configured` quando `KC_NOTIFICATION_EMAIL_PROVIDER`, `KC_NOTIFICATION_EMAIL_API_KEY` ou `KC_NOTIFICATION_EMAIL_FROM` ainda não existirem no projeto
- a `v11.21.1` promoveu a mesma trilha para o canal `whatsapp`:
- `notification_channel_targets` como camada privada de destino/consentimento separada do perfil público
- `KCAPI.getNotificationChannelTargets()` e `KCAPI.updateNotificationChannelTargets()` para leitura/escrita do destino privado
- resolução do destino por `kc_resolve_notification_delivery_destination(...)` usando apenas a tabela privada
- envio real por Twilio quando `dryRun=false` e `KC_NOTIFICATION_WHATSAPP_*` estiverem configurados
- rate limit por usuário com `kc_count_recent_notification_deliveries(...)`
- as preferências futuras do usuário devem permitir decidir:
  - quais tipos de notificação receber
  - em quais canais receber (`in-app`, `email`, `whatsapp`)
  - quais canais ficam desligados por padrão para evitar spam e regressão de privacidade

**Diretriz de compatibilidade**

- defaults da migração futura devem preservar o comportamento atual: tudo continua chegando in-app
- canais externos entram inicialmente opt-in
- preferências devem ser criadas de forma lazy/backfill-safe, sem exigir que usuários antigos revisitem onboarding para manter notificações in-app funcionando

### 8.6. Trilha futura obrigatória de i18n, acessibilidade e UX Writing

**Papel exigido para essa trilha**

- atuar como Engenheiro de Software Sênior, Especialista em Acessibilidade (`W3C/WCAG`) e UX Writer

**Contexto do projeto**

- o `Kino Campus` continua sendo tratado como plataforma universitária orientada a produto, arquitetura limpa, QA rigoroso e evolução incremental
- a nova frente deve habilitar internacionalização (`i18n`), acessibilidade (`a11y`) e revisão de UX Writing sem quebrar nenhum layout, fluxo, contrato de API, teste crítico ou comportamento consolidado

**Regra de início obrigatória**

- antes de qualquer linha de código final dessa trilha, a iteração `v11.24.0` deve entregar apenas um relatório estruturado neste repositório
- nenhum arquivo funcional pode ser alterado para essa frente antes da aprovação explícita desse plano
- esse relatório inicial deve usar tópicos e tabelas comparativas quando fizer sentido e deve aguardar aprovação antes de abrir a infraestrutura

**ETAPA 1: Identificação e Relação Arquitetural**

- mapear conceitualmente como `i18n`, semântica de acessibilidade e UX Writing se cruzam na base atual
- explicitar como uma string traduzida afeta `aria-label`, `title`, mensagens de erro, placeholders, toasts, metadata e SEO
- listar os tipos de componentes mais impactados:
  - botões
  - modais
  - formulários
  - toasts de erro e sucesso
  - navegação
  - dropdowns
  - filtros
  - tabelas/listagens
  - cards de produto
  - notificações

**ETAPA 2: Análise de Risco e Pontos Fráteis**

- abordar obrigatoriamente:
  - risco de quebra de layout por expansão de texto entre idiomas
  - risco de quebra de testes que hoje dependem de textos fixos
  - risco de hydration mismatch se existir SSR ou rendering híbrido nas superfícies futuras
  - impacto no SEO dinâmico e em metadata textual
- incluir trade-offs claros entre abordagem incremental e migração ampla
- registrar quais superfícies exigem rollout por feature flag, por página ou por grupo de componentes

**ETAPA 3: Estratégia de Implementação Incremental (Roadmap)**

- dividir a execução em fases pequenas e iterativas, por exemplo:
  - infraestrutura
  - componentes core
  - páginas complexas
- definir em cada fase:
  - ferramentas recomendadas para a stack real do projeto
  - critérios objetivos de aceite de QA
  - critérios de não regressão visual, semântica e contratual
- sugerir a criação de um dicionário base de UX Writing do `Kino Campus`, priorizando `pt-BR`, consistência de voz e redução de jargão
- manter a linguagem voltada ao público universitário brasileiro: clara, engajadora, acessível e sem atrito desnecessário

**Diretriz técnica dessa trilha**

- toda substituição de texto hardcoded por chave de tradução deve revisar também:
  - `aria-label`
  - `aria-describedby`
  - `aria-live`
  - mensagens de validação
  - placeholders
  - metadata textual
- nenhum teste novo deve depender de cópia literal quando existir seletor estável, `role`, `aria-*` ou `data-*`
- qualquer mudança com risco de expansão textual deve passar por QA em mobile e desktop
- a implementação futura deve privilegiar rollout incremental, nunca big-bang
- se a solução escolhida introduzir risco relevante para layout, SEO ou hidratação, a fase deve ser interrompida e replanejada antes de continuar

---

## 9. Critérios de aprovação por iteração

Uma iteração da v11 só pode ser considerada concluída quando:

- o escopo aprovado foi executado integralmente
- os equivalentes relacionados foram revisados
- o `RELATORIO-KINOCAMPUS-V11.md` foi atualizado
- o `README.md` foi atualizado
- os testes/checks previstos para a iteração foram executados
- o deploy foi validado em navegador
- a branch foi mergeada e removida
- a base local foi sincronizada novamente

---

## 10. Template obrigatório de registro por iteração

Toda iteração da v11 deverá preencher neste arquivo, no mínimo:

### Iteração `v11.x.x`

- objetivo
- arquivos alterados
- equivalentes revisados
- contratos preservados
- migrations criadas/aplicadas
- testes executados
- validação em navegador
- PR / commit / deploy
- riscos residuais

---

## 11. Registro das iterações executadas

### Iteração `v11.1.0`

- objetivo:
  alinhar a documentação-base ao estado real do repositório antes de iniciar correções funcionais da v11.
- arquivos alterados:
  `README.md`, `CHANGELOG.md`, `RELATORIO-KINOCAMPUS-V11.md`, `docs/index.md`, `docs/architecture.md`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/api-contract.md`, `docs/design-system.md`, `docs/env-vars.md`.
- equivalentes revisados:
  documentação executiva, changelog, catálogo técnico, contratos públicos da `KCAPI`, schema/RPCs do banco e convenções visuais compartilhadas.
- contratos preservados:
  nenhum contrato funcional de frontend, banco, Supabase, Vercel ou rotas públicas foi alterado nesta iteração; o trabalho foi exclusivamente documental.
- migrations criadas/aplicadas:
  nenhuma. Foi apenas registrado que as migrations `v10.0.0.0_admin_search_posts_full.sql` e `v10.0.1.0_admin_help_requests_pagination.sql` já estão aplicadas no banco principal atual.
- testes executados:
  `node scripts/hygiene-check.js` e `git diff --check`.
- validação em navegador:
  não aplicável nesta iteração, porque não houve mudança funcional publicada nem necessidade de novo deploy.
- PR / commit / deploy:
  PR `#228`, commit `c2b564a` na branch `codex/v11-1-0-doc-baseline`. Não houve deploy funcional nem ação de Supabase nesta iteração.
- riscos residuais:
  o drift de versão canônica `8.6.0` no frontend continua existente e agora está explicitamente rastreado; a próxima fase precisa tratá-lo de forma coordenada, nunca parcial.

---

### Iteração `v11.2.0`

- objetivo:
  alinhar o shell público em páginas equivalentes, garantindo estados ativos coerentes na navegação, comportamento previsível do menu móvel e busca mobile disponível também na `create-post.html`.
- arquivos alterados:
  `assets/js/kc-core.js`, `assets/js/kc-public-shell.js`, `create-post.html`, `achados-perdidos.html`, `caronas-feed.html`, `moradia.html`, `oportunidades.html`, `my-posts.html`, `search-results.html`, `_product.html`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`.
- equivalentes revisados:
  módulos públicos com navegação móvel estática, páginas secundárias com menu móvel, shell injetado em `ajuda.html` e o entrypoint de criação de publicação.
- contratos preservados:
  nenhum contrato de dados, Supabase, RPC, `KCAPI` pública ou rota foi alterado; a mudança ficou restrita a shell/navegação/busca no frontend.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-core.js`, `node --check assets/js/kc-public-shell.js`, `git diff --check` e smoke local com Playwright em `create-post.html`, `moradia.html` e `ajuda.html` nos cenários desktop/mobile.
- validação em navegador:
  local concluída na própria iteração; a checagem do deploy publicado foi concluída em `08 de abril de 2026` na iteração operacional `v11.2.1`, após a reativação do Vercel MCP no Codex.
- PR / commit / deploy:
  PR `#229`, commit `71f893b` na branch `codex/v11-2-0-public-shell-consistency`. O merge resultou no commit base `8cf0d61`, validado depois no deployment de produção `dpl_By9t4cmxbp9HrxFkhLm4W84Wsw1t`.
- riscos residuais:
  ainda existe dependência de cache de assets compartilhados em alguns navegadores, então a validação pós-merge deve conferir explicitamente a versão publicada do shell público.

---

### Iteração `v11.2.1`

- objetivo:
  reativar a autenticação OAuth do Vercel MCP no Codex e homologar o acesso real às superfícies operacionais necessárias para as próximas iterações da v11.
- arquivos alterados:
  `README.md`, `RELATORIO-KINOCAMPUS-V11.md`.
- equivalentes revisados:
  configuração MCP global do Codex, vínculo local do projeto em `.vercel/project.json`, escopo do time `team_yST6VYLYCQ2yHakmU0DsLsz3` e o projeto `kino-campus` no Vercel.
- contratos preservados:
  nenhum contrato funcional de frontend, banco, RPC, `KCAPI`, rotas públicas, Supabase ou CSS foi alterado; a iteração foi exclusivamente operacional e documental.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `codex mcp list`, `codex mcp get vercel`, `codex mcp login vercel`, `vercel whoami`, `vercel teams ls` e chamadas do Vercel MCP para `list_teams`, `get_project`, `list_deployments`, `get_deployment`, `get_deployment_build_logs`, `get_runtime_logs`, `web_fetch_vercel_url`, `list_toolbar_threads` e `search_vercel_documentation`.
- validação em navegador:
  a validação remota do deploy foi concluída via `web_fetch_vercel_url` em preview e produção, confirmando o HTML publicado de `create-post.html` e `moradia.html` já com os ajustes da `v11.2.0`. O Playwright MCP local falhou nesta máquina com `EPERM` ao tentar criar `C:\Windows\System32\.playwright-mcp`, então a checagem visual interativa permaneceu substituída pela validação remota do Vercel nesta iteração.
- PR / commit / deploy:
  PR `#230`, commit `f5cd94f` na branch `codex/v11-2-1-vercel-mcp-auth`. A iteração não gerou deploy novo; ela confirmou operacionalmente, em `08 de abril de 2026`, o deployment de produção `dpl_By9t4cmxbp9HrxFkhLm4W84Wsw1t` do commit `8cf0d61` e o preview `dpl_47yerenHoDdQyeoJAGUEXyihqMhR`.
- riscos residuais:
  o Vercel MCP passou a responder normalmente, mas o Playwright MCP local ainda precisa de correção de diretório/permissão neste ambiente para retomar a checagem visual interativa sem fallback.

---

### Iteração `v11.3.0`

- objetivo:
  padronizar a ação de `Limpar filtros` no empty state dos 6 feeds públicos equivalentes e corrigir a paridade do módulo `eventos`, que não expunha o clear equivalente fora da seleção manual de `Todas as datas`.
- arquivos alterados:
  `compra-venda-feed.html`, `caronas-feed.html`, `moradia.html`, `eventos.html`, `oportunidades.html`, `achados-perdidos.html`, `assets/js/controllers/compra-venda-feed.controller.js`, `assets/js/controllers/caronas-feed.controller.js`, `assets/js/controllers/moradia.controller.js`, `assets/js/controllers/eventos.controller.js`, `assets/js/controllers/oportunidades.controller.js`, `assets/js/controllers/achados-perdidos.controller.js`, `tests/feed-empty-clear-markup.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`.
- equivalentes revisados:
  os 6 feeds públicos modulares, seus blocos `#noResults`, os botões laterais de limpeza de filtros e os controllers responsáveis pelo binding do clear aplicado.
- contratos preservados:
  nenhuma rota, RPC, adapter, contrato de `KCAPI`, banco, Supabase ou payload de feed foi alterado; a mudança ficou restrita à UX e ao binding dos filtros já existentes.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/controllers/compra-venda-feed.controller.js`, `node --check assets/js/controllers/caronas-feed.controller.js`, `node --check assets/js/controllers/moradia.controller.js`, `node --check assets/js/controllers/eventos.controller.js`, `node --check assets/js/controllers/oportunidades.controller.js`, `node --check assets/js/controllers/achados-perdidos.controller.js`, `npx jest tests/feed-empty-clear-markup.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o Playwright MCP local continua falhando com `EPERM`, então a validação publicada desta iteração foi feita via Vercel MCP no preview `dpl_Ds1PfZ3D3sdaGeDa5wGa2NyUKf79`, confirmando o HTML publicado de `compra-venda-feed.html`, `caronas-feed.html`, `moradia.html`, `eventos.html` e `achados-perdidos.html` já com os novos marcadores de clear explícito. O caso de `oportunidades.html` permaneceu protegido por autenticação do preview nessa leitura remota, mas o seletor e o binding equivalentes ficaram cobertos pelo teste estático dedicado e pelo mesmo padrão de implementação aplicado aos demais feeds.
- PR / commit / deploy:
  PR `#231`, commit `bbac60f` na branch `codex/v11-3-0-feed-empty-clear-parity` e preview validado no deployment `dpl_Ds1PfZ3D3sdaGeDa5wGa2NyUKf79`, todos confirmados em `08 de abril de 2026`.
- riscos residuais:
  sem risco estrutural novo em banco, adapter ou contratos. O único ponto operacional remanescente antes do encerramento é a validação pós-merge do deployment resultante na base.

---

### Iteração `v11.4.0`

- objetivo:
  corrigir a regressão transversal do colapso visual dos `kc-sidebar-section__toggle` no desktop, restaurar o preset canônico `Todas as datas` no módulo `eventos` e adicionar a categoria `Ingressos` como categoria funcional de primeira classe em `compra-venda`.
- arquivos alterados:
  `assets/js/kc-feed-filters.js`, `assets/css/styles.css`, `assets/js/controllers/compra-venda-feed.controller.js`, `assets/js/kc-create-post.js`, `compra-venda-feed.html`, `tests/kc-feed-filters.test.js`, `tests/compra-venda-ingressos.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`.
- equivalentes revisados:
  helper compartilhado de presets de data, sidebar desktop compartilhada dos módulos públicos, feed `compra-venda`, modal de criação compartilhado e os sidebars equivalentes de `eventos`, `moradia`, `caronas` e `oportunidades` em validação local de browser.
- contratos preservados:
  nenhuma rota, migration, RPC, `KCAPI`, adapter, schema de banco ou contrato público de payload foi alterado; a mudança ficou restrita à camada de frontend compartilhado e à taxonomia já usada pelo módulo `compra-venda`.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-feed-filters.js`, `node --check assets/js/controllers/compra-venda-feed.controller.js`, `node --check assets/js/kc-create-post.js`, `npx jest tests/kc-feed-filters.test.js tests/compra-venda-ingressos.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  em ambiente local com navegador real, o body da seção `Data` de `eventos` passou de `display:grid` para `display:none` após o clique no toggle, confirmando o colapso visual; o DOM renderizado de `eventos` voltou a marcar apenas `Todas as datas` por padrão; e o ranking continuou sendo injetado normalmente em `eventos`, `moradia`, `caronas`, `oportunidades` e `compra-venda`. A categoria `Ingressos` foi validada no markup do feed e no schema do modal de criação. No preview do Vercel, os assets compartilhados publicados foram confirmados no deployment `dpl_J4RFMZqsg3Fu3V1pAhZfeugXrzn3`; as páginas HTML desse preview permaneceram protegidas por autenticação da Vercel no momento da checagem remota.
- PR / commit / deploy:
  PR `#232`, commit `82192e5` na branch `codex/v11-4-0-sidebar-ranking-ingressos` e preview validado no deployment `dpl_J4RFMZqsg3Fu3V1pAhZfeugXrzn3` em `08 de abril de 2026`. Merge, delete branch e pull ainda pendentes no momento deste registro.
- riscos residuais:
  a correção do accordion depende de CSS compartilhado em `styles.css`, então a checagem pós-merge precisa confirmar a publicação dos assets novos no deploy final para evitar leitura de cache antigo no navegador do usuário.

---

### Iteração `v11.5.0`

- objetivo:
  restaurar a renderização do `Top Contribuidores` nos 6 módulos públicos, investigar a regressão em profundidade e eliminar a dependência de bootstrap inline bloqueado pela CSP em produção.
- arquivos alterados:
  `achados-perdidos.html`, `caronas-feed.html`, `compra-venda-feed.html`, `eventos.html`, `moradia.html`, `oportunidades.html`, `tests/kc-ranking-markup.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  os 6 módulos com sidebar de ranking, `assets/js/kc-ranking.js`, `assets/js/kc-api.client.js`, `assets/js/adapters/supabase.adapter.js`, `assets/js/adapters/local.adapter.js`, `assets/js/kc-lazy-loader.js`, a política CSP em `vercel.json` e o carregamento direto já existente em `profile.html` e `admin/index.html`.
- contratos preservados:
  nenhuma rota pública, RPC, adapter, contrato de `KCAPI`, schema de banco, payload de ranking ou semântica dos filtros foi alterado; a mudança ficou restrita ao bootstrap do script de ranking nos módulos equivalentes.
- migrations criadas/aplicadas:
  nenhuma. A função `public.kc_get_top_contributors('month', 'achados-perdidos', 10)` foi validada diretamente no Supabase e retornou dados, descartando regressão de banco nesta iteração.
- testes executados:
  `npx jest tests/kc-ranking-markup.test.js --runInBand`, `git diff --check`, validação headless local com Edge em `http://127.0.0.1:4173/achados-perdidos.html`, `http://127.0.0.1:4173/moradia.html` e `http://127.0.0.1:4173/compra-venda-feed.html`, além de consultas SQL no Supabase para `public.kc_get_top_contributors(...)`.
- validação em navegador:
  a investigação em produção mostrou os containers `.kc-ranking-sidebar-users` vazios mesmo com a RPC saudável; a comparação com o DOM local e a leitura do `vercel.json` confirmaram a causa raiz: o bootstrap inline `KCLazyLoader.load('assets/js/kc-ranking.js')` era bloqueado por `Content-Security-Policy` em produção. Após substituir o bootstrap inline pelo carregamento externo deferido de `assets/js/kc-ranking.js`, o DOM renderizado local voltou a conter `kc-ranking-sidebar-item` em `achados-perdidos`, `moradia` e `compra-venda`, cobrindo o padrão compartilhado usado pelos 6 módulos.
- PR / commit / deploy:
  PR `#233`, commit `07b3c5b` na branch `codex/v11-5-0-module-ranking-csp-bootstrap`, merge commit `8277bed` na base `kinocampus-V11.0-foundations`, preview Vercel `dpl_9j8hbAVf9ng3r21DMYdFCtCaTHjP` e deploy manual de produção `dpl_5onWMyzTZdttKSDhRyrQx1Pkeay4`, já aliasado para `https://www.kinocampus.com.br`. Branch remota removida e base local sincronizada ao final da iteração.
- riscos residuais:
  o fix remove a causa específica da regressão sob CSP sem mexer em `kc-ranking.js`; o principal risco remanescente é cache de asset antigo no navegador, que precisa ser descartado na validação pós-deploy.

---

### Iteração `v11.6.0`

- objetivo:
  corrigir a disputa de gestos em iOS Safari na home e nos módulos públicos equivalentes, impedindo que o `pull-to-refresh` sequestre swipes horizontais do hero/ranking/tabs/rails e removendo o auto-zoom/travamento de pinch nos fluxos de autenticação e `kc-create-modal`.
- arquivos alterados:
  `assets/js/kc-pull-to-refresh.js`, `assets/js/kc-core.js`, `assets/css/styles.css`, `tests/ios-gesture-hardening.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  `index.html`, `compra-venda-feed.html`, `caronas-feed.html`, `moradia.html`, `eventos.html`, `oportunidades.html`, `achados-perdidos.html`, o auth modal compartilhado, o `kc-create-modal` compartilhado, o `kc-ranking-users`, o `kc-feed-tabs`, todos os `kc-*-mobile-rail`, o helper global de drag horizontal em `kc-core.js` e o interceptador global de `pull-to-refresh`.
- contratos preservados:
  nenhuma rota pública, payload, RPC, adapter, contrato de `KCAPI`, migration, schema de banco ou comportamento Android específico foi alterado; a iteração ficou restrita ao hardening de gestos, CSS compartilhado e prevenção de auto-zoom no Safari/iOS.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-core.js`, `node --check assets/js/kc-pull-to-refresh.js`, `npx jest tests/ios-gesture-hardening.test.js tests/kc-ranking-markup.test.js tests/kc-feed-filters.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  em smoke local com Playwright CLI a `index.html` foi aberta em `390x844`, o auth modal passou a expor `touch-action: pinch-zoom` na casca, `touch-action: pan-y pinch-zoom` no corpo e `font-size: 16px` nos inputs. Na própria home, `kc-hero-carousel` passou a reportar `pan-y pinch-zoom`, enquanto `kc-ranking-users` passou a resolver para `manipulation` no browser. Em `compra-venda-feed.html`, o `kc-marketplace-mobile-rail` e o `kc-feed-tabs` também passaram a resolver `touch-action` compatível com scroll horizontal e pinch, e a abertura do modal de seção confirmou `kc-create-modal__body` com `pan-y pinch-zoom`. O gesto `TouchEvent` sintético do hero não pôde ser reproduzido integralmente no Chromium local porque `Touch`/`TouchEvent` não estavam disponíveis nesse contexto de CLI, então a checagem final dessa nuance permanece dependente da validação publicada em device iOS real.
- PR / commit / deploy:
  PR `#235`, commit `1817a30` na branch `codex/v11-6-0-ios-gesture-zoom-hardening` e preview Vercel `dpl_7W9YewxxyNVojvhpnnfB6G3DmvCw`, aliasado em `https://kino-campus-git-codex-v11-6-0-io-116512-yannakamurabrs-projects.vercel.app`. Durante esta iteração o Vercel MCP voltou a responder `Auth required`, então a confirmação do preview foi fechada pela CLI `vercel inspect` e pela homologação local de browser antes do merge.
- riscos residuais:
  como Safari/iOS tem diferenças de edge-swipe e pinch que não ficam totalmente cobertas pelo Chromium local, a conclusão desta iteração exige validação publicada em navegador real iOS antes de considerar o hardening encerrado.

---

### Iteração `v11.7.0`

- objetivo:
  endurecer a paridade entre `assets/js/adapters/local.adapter.js`, `assets/js/kc-api.client.js` e o contrato moderno do driver ativo, cobrindo superfícies locais equivalentes às já consolidadas no caminho Supabase sem alterar banco, RPC ou produção autenticada.
- arquivos alterados:
  `assets/js/adapters/local.adapter.js`, `assets/js/kc-api.client.js`, `tests/local-adapter.test.js`, `tests/kc-api-client.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  `LocalAdapter`, `SupabaseAdapter`, fachada `KCAPI`, persistência local de perfil, posts do usuário, salvos, highlights, notificações, convites e os contratos esperados pelos consumers modernos do frontend.
- contratos preservados:
  nenhuma rota pública, schema, migration, RPC, payload Supabase, assinatura pública da `KCAPI` ou comportamento produtivo do driver remoto foi alterado; a iteração ficou restrita ao endurecimento do fallback local e à cobertura de contrato entre drivers.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/adapters/local.adapter.js`, `node --check assets/js/kc-api.client.js`, `npx jest tests/local-adapter.test.js tests/kc-api-client.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview Vercel da PR `#236` foi validado via MCP ao longo do ciclo da branch, confirmando publicação do bundle sem quebra geral. A proteção do preview variou entre rotas durante a leitura remota, então essa checagem ficou registrada como homologação de publicação/bundle e não como smoke autenticado completo de interface.
- PR / commit / deploy:
  PR `#236`, com commit funcional `e762bd9` e commits documentais de fechamento na branch `codex/v11-7-0-local-adapter-parity`, além de preview Vercel validado no ciclo da PR, todos confirmados em `08 de abril de 2026`.
- riscos residuais:
  o endurecimento ficou contido ao driver local e o residual específico de `localCreatePost` foi fechado na iteração `v11.8.0`. Como a rota de preview autenticada de `my-posts.html` não ficou acessível pelo fetch remoto naquela iteração, a confirmação final após merge permaneceu condicionada à checagem publicada mínima de bundle e rota autenticada quando possível.

### Iteração `v11.8.0`

- objetivo:
  remover a duplicação residual de normalização dentro de `assets/js/adapters/local.adapter.js`, deixando `prepareLocalPostForPersistence(...)` como ponto canônico de preparação do payload local e cobrindo a criação local com uma regressão direta.
- arquivos alterados:
  `assets/js/adapters/local.adapter.js`, `tests/local-adapter.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  `localCreatePost`, `prepareLocalPostForPersistence`, persistência em `kc_user_posts`, semântica de `compra-venda` para categoria/subcategoria e a superfície consumida por fluxos locais como `my-posts` e criação de publicação.
- contratos preservados:
  nenhuma rota pública, schema, migration, RPC, payload Supabase, assinatura pública da `KCAPI` ou comportamento do driver remoto foi alterado; a iteração ficou restrita ao fallback local e à cobertura de regressão desse caminho.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/adapters/local.adapter.js`, `npx jest tests/local-adapter.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview Vercel da PR `#237` foi validado via MCP no deployment `dpl_EPsu5gQgmcDwNNxCV4WNzDMBtbEL`. `my-posts.html` respondeu `200` no preview e o asset publicado `assets/js/adapters/local.adapter.js` refletiu a simplificação de `localCreatePost`, sem o bloco redundante anteriormente duplicado. Os build logs do deployment confirmaram build concluído sem erro.
- PR / commit / deploy:
  PR `#237`, com commit funcional `25beea5` na branch `codex/v11-8-0-local-createpost-hardening`, preview Vercel `dpl_EPsu5gQgmcDwNNxCV4WNzDMBtbEL` validado em `09 de abril de 2026`.
- riscos residuais:
  o comportamento endurecido segue restrito ao driver local, então a principal garantia continua sendo a regressão direta recém-adicionada. A confirmação pós-merge ainda deve verificar a publicação final da base, mesmo sem mudança funcional no caminho Supabase de produção.

---

### Iteração `v11.9.0`

- objetivo:
  reduzir trabalho redundante percebido na home e nos módulos públicos ao reaproveitar snapshots de sessão para `Top Contribuidores` e `kc-vote-score`, revalidando em segundo plano apenas quando os dados locais estiverem ausentes ou vencidos.
- arquivos alterados:
  `assets/js/kc-ranking.js`, `assets/js/controllers/index.controller.js`, `assets/js/components/voting.js`, `index.html`, `tests/kc-ranking-session.test.js`, `tests/voting-session-hydration.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  ranking lateral dos 6 módulos, ranking geral da home, modal informativo do ranking, hidratação de votos em `index.controller.js`, feeds públicos via `kc-feed.controller.js`, integração com `KCSessionStore` em `kc-api.client.js` e o polling/realtime já existente de `voting.js`.
- contratos preservados:
  nenhuma rota pública, schema, migration, RPC, payload Supabase, assinatura pública da `KCAPI` ou comportamento do driver remoto/local foi alterado; a iteração ficou restrita à hidratação client-side, reutilização de cache de sessão e redução de rerender/fetch redundante.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-ranking.js`, `node --check assets/js/controllers/index.controller.js`, `node --check assets/js/components/voting.js`, `npx jest tests/kc-ranking.test.js tests/kc-ranking-session.test.js --runInBand`, `npx jest tests/voting.test.js tests/voting-session-hydration.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR `#238` foi validado via Vercel MCP no deployment `dpl_9ieVb3x48cSSdeHADyiFGYkzKk5x`. `index.html` publicado já passou a carregar `assets/js/kc-ranking.js` na home, e a leitura remota dos assets protegidos `assets/js/kc-ranking.js` e `assets/js/components/voting.js` por URL de compartilhamento confirmou a presença do snapshot de sessão, da deduplicação de request para ranking e da hidratação persistente de score/direção de voto antes da revalidação silenciosa.
- PR / commit / deploy:
  PR `#238`, commits `3e3dc20` e `8a61431` na branch `codex/v11-9-0-ranking-vote-session-hydration`, merge squash `d5fc681` na base `kinocampus-V11.0-foundations`, preview Vercel `dpl_9ieVb3x48cSSdeHADyiFGYkzKk5x` e deploy manual de produção via `vercel deploy --prod --yes`, publicado em `https://kino-campus-q4htlzvlh-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- validação pós-merge:
  após o merge, o domínio publicado retornou `200` para `index.html`, `assets/js/kc-ranking.js` e `assets/js/components/voting.js`, confirmando a presença do script compartilhado na home e dos bundles finais com snapshot de sessão, deduplicação de request e hidratação persistente de score/direção.
- riscos residuais:
  o snapshot de sessão reduz spinner e trabalho repetido, mas esta iteração ainda não expande o mesmo padrão para outras superfícies contadoras da plataforma. Qualquer extensão futura para comentários, analytics ou painéis laterais deve ser fatiada separadamente para evitar misturar caching de naturezas diferentes.

---

### Iteração `v11.10.0`

- objetivo:
  estender o padrão de snapshot de sessão e revalidação silenciosa para superfícies leves da página de produto, cobrindo o painel de analytics do autor e a lista de comentários Supabase sem alterar schema, RPC ou comportamento de escrita já consolidado.
- arquivos alterados:
  `assets/js/kc-api.client.js`, `assets/js/controllers/product.controller.js`, `assets/js/kc-comments.js`, `tests/kc-api-session-swr.test.js`, `tests/kc-comments-session.test.js`.
- equivalentes revisados:
  fachada `KCAPI`, painel `kcAuthorAnalytics` em `_product.html`, renderização de comentários em `kc-comments.js`, mutações de comentário (`addComment`, `likeComment`, edição e exclusão), `trackView`, `trackShare`, `trackCouponClick`, votos e salvos que impactam o snapshot analítico do produto.
- contratos preservados:
  nenhuma rota pública, migration, RPC, payload Supabase, assinatura pública de leitura/escrita da `KCAPI` ou contrato de `comments`/`kc_get_post_analytics` foi alterado; a iteração ficou restrita ao reaproveitamento client-side de dados já lidos, deduplicação de request e invalidação segura após mutações.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-api.client.js`, `node --check assets/js/controllers/product.controller.js`, `node --check assets/js/kc-comments.js`, `npx jest tests/kc-api-client.test.js tests/kc-api-session-swr.test.js tests/kc-comments-session.test.js tests/voting.test.js tests/voting-session-hydration.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview Vercel da PR `#240` ficou `READY` no deployment `dpl_FT1si5ByRtyzoQrNU1yEGqjHqYTJ`, com alias de branch `https://kino-campus-git-codex-v11-10-0-p-c2bd35-yannakamurabrs-projects.vercel.app`. A homologação remota do preview foi fechada por `vercel inspect`, pelos build logs e pelos checks da própria PR, confirmando build sem erro. Após o merge, a produção foi publicada em `https://kino-campus-70d1s6o4x-yannakamurabrs-projects.vercel.app` e aliasada para [www.kinocampus.com.br](https://www.kinocampus.com.br); no domínio público, `_product.html?id=1`, `assets/js/kc-api.client.js` e `assets/js/kc-comments.js` já retornaram os marcadores esperados da iteração.
- PR / commit / deploy:
  PR `#240`, commits `4caf867`, `81bcd4e` e `18c50ba` na branch `codex/v11-10-0-product-session-swr`, merge squash `7f4c1ac` na base `kinocampus-V11.0-foundations`, preview Vercel `dpl_FT1si5ByRtyzoQrNU1yEGqjHqYTJ` e deploy manual de produção `https://kino-campus-70d1s6o4x-yannakamurabrs-projects.vercel.app`, todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a fatia ficou contida à leitura client-side e à invalidação imediata pós-mutações. O principal residual agora é de expansão futura: comentários e analytics do produto já usam snapshot+SWR, mas qualquer extensão para outras superfícies contadoras ainda precisa continuar fatiada para não misturar TTLs e contratos de invalidação diferentes.

---

### Iteração `v11.11.0`

- objetivo:
  remover implementações sombreadas e duplicadas em `assets/js/kc-comments.js`, preservando apenas os fluxos efetivos de reply, renderização em threads, exclusão em cascata local e submit moderno com `parentId`.
- arquivos alterados:
  `assets/js/kc-comments.js`, `tests/kc-comments-shadow-cleanup.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  helpers de comentário em `_product.html`, o fluxo de replies inline, a exclusão local em cascata, a hidratação já consolidada em `tests/kc-comments-session.test.js` e a seção crítica de engajamento mapeada no eixo `7.6` deste relatório.
- contratos preservados:
  nenhuma rota pública, migration, RPC, payload Supabase, assinatura pública de `KCAPI`, contrato de comentários ou markup crítico de `_product.html` foi alterado; a iteração ficou restrita à remoção de sombra interna e à cobertura de regressão do frontend compartilhado.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-comments.js`, `npx jest tests/kc-comments-shadow-cleanup.test.js tests/kc-comments-session.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview Vercel da PR `#242` ficou `READY` no deployment `dpl_3bX1CErmfF41cmcDu6Y3siBDxAvH`, com alias de branch `https://kino-campus-git-codex-v11-11-0-c-92ab8d-yannakamurabrs-projects.vercel.app`. A proteção de autenticação do preview continuou impedindo fetch direto do bundle publicado, então a homologação pré-merge foi fechada por `vercel inspect`, build concluído e regressões locais. Após o merge, a produção foi publicada em `https://kino-campus-f8c7ym3id-yannakamurabrs-projects.vercel.app` e aliasada para [www.kinocampus.com.br](https://www.kinocampus.com.br); no domínio público, `assets/js/kc-comments.js` passou a retornar exatamente uma declaração de `addComment`, `normalizeCommentForRender`, `_renderCommentList`, `deleteComment` e `submitComment`, e `_product.html?id=1` continuou carregando `.kc-comments-section`, `commentsContainer` e o lazy-load de `assets/js/kc-comments.js`.
- PR / commit / deploy:
  PR funcional `#242`, commit `4179890` na branch `codex/v11-11-0-comments-shadow-cleanup`, merge squash `dc57f87` na base `kinocampus-V11.0-foundations`, preview Vercel `dpl_3bX1CErmfF41cmcDu6Y3siBDxAvH` e deploy manual de produção `dpl_EFKajf1xG3HCH5APKzkp6pLYJFX2`, todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  o cleanup eliminou a sombra estrutural sem mexer no fluxo lazy da página de produto; o principal residual continua sendo o tamanho e a codificação legada de `kc-comments.js`, que ainda justificam novas fatias pequenas de endurecimento em vez de refactor amplo.

---

### Iteração `v11.11.1`

- objetivo:
  reformular o item `8. Estratégia de execução da v11 em fatias` para transformar as macrofases restantes da v11 em uma sequência contínua, executável e rastreável de novas fases `v11.x`.
- arquivos alterados:
  `RELATORIO-KINOCAMPUS-V11.md`, `README.md`, `CHANGELOG.md`.
- equivalentes revisados:
  o mapa estratégico da v11, o estado consolidado das iterações já executadas, a seção de progresso do `README.md` e a continuidade entre produto, perfil, admin, adapters, Supabase e release gate final.
- contratos preservados:
  nenhuma rota pública, migration, RPC, adapter, contrato de `KCAPI`, comportamento de deploy ou fluxo funcional foi alterado; esta iteração foi exclusivamente documental e de governança.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `git diff --check`.
- validação em navegador:
  não aplicável, porque não houve mudança funcional publicada nesta iteração.
- PR / commit / deploy:
  PR `#244`, commit `b0dd62c` na branch `codex/v11-11-1-roadmap-replan`, com fechamento documental e sem necessidade de deploy funcional novo.
- riscos residuais:
  o roadmap reformulado reduz ambiguidade, mas não substitui a disciplina de revalidar escopo real a cada fase. O principal risco segue sendo misturar frentes demais numa mesma PR se a sequência abaixo não for respeitada.

---

### Iteração `v11.12.0`

- objetivo:
  endurecer o fluxo de criação em `assets/js/kc-create-post.js` para impedir que campos condicionais inativos continuem vazando no payload final quando o usuário altera a configuração do formulário, preservando ao mesmo tempo o rascunho do modal.
- arquivos alterados:
  `assets/js/kc-create-post.js`, `tests/kc-create-post-active-fields.test.js`, `docs/module-schemas.md`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  combinações condicionais de `compra-venda`, `caronas`, `moradia`, `eventos`, `achados-perdidos` e `oportunidades`, além da documentação do schema real de criação e a categoria `Ingressos` já ativa no módulo `compra-venda`.
- contratos preservados:
  nenhuma rota pública, migration, RPC, adapter, contrato de `KCAPI`, persistência Supabase/local ou estrutura de payload pública foi ampliada; a iteração ficou restrita ao endurecimento da seleção de campos ativos antes do submit.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-create-post.js`, `npx jest tests/kc-create-post-active-fields.test.js tests/compra-venda-ingressos.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  a homologação do preview foi fechada via PR `#245` com checks `Vercel` e `Vercel Preview Comments` aprovados, além do `vercel inspect` confirmando o preview `dpl_DQPXZSXnr32LP4uGfjpq8Ua5b813` em estado `Ready`. Como o Vercel MCP voltou a exigir autenticação nesta máquina e o `vercel curl` encontrou a limitação local de `schannel` no Windows, a validação remota do bundle foi concluída pela combinação de checks da PR, inspeção do deployment e leitura do deploy público após publicação.
- PR / commit / deploy:
  PR `#245`, commit funcional `9bf6d9a` na branch `codex/v11-12-0-create-post-hardening`, merge squash `d5ae225` na base `kinocampus-V11.0-foundations`, preview `dpl_DQPXZSXnr32LP4uGfjpq8Ua5b813` e deploy manual de produção `dpl_9chTNjui8ZaVkFsb6gGTogVXZPDg`, publicado em `https://kino-campus-l3admzizz-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a blindagem foi feita no payload final, não no estado interno do modal. Isso preserva o rascunho ao alternar seleções, mas ainda deixa `kc-create-post.js` como hotspot monolítico que deve continuar sendo tratado em fatias pequenas.

---

### Iteração `v11.13.0`

- objetivo:
  endurecer o dropdown de notificações para que o componente continue funcional após rerenders internos por realtime, marcação de leitura e atualização do contador.
- arquivos alterados:
  `assets/js/kc-notifications.js`, `tests/kc-notifications-dropdown.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  dropdown do sino de notificações no shell público, atualização do badge, chegada realtime, marcação individual, marcação em lote e o trecho do roteiro `8.2` referente à macrofase de produto/interações sociais.
- contratos preservados:
  nenhuma rota pública, migration, RPC, adapter, contrato de `KCAPI`, payload de notificação ou integração Supabase foi alterado; a iteração ficou restrita ao comportamento do componente frontend compartilhado.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-notifications.js`, `npx jest tests/kc-notifications-dropdown.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview ficou `Ready` no deployment `dpl_BgKEASBh3FW4R8WvoFed8BnNRaGT`, com alias de branch `https://kino-campus-git-codex-v11-13-0-p-b5ed93-yannakamurabrs-projects.vercel.app`, confirmado por `vercel inspect`. Como o transporte do Vercel MCP continuou inconsistente nesta sessão do app, a homologação remota do preview foi fechada pela combinação de `vercel inspect`, build concluído e regressão local dedicada. Após o merge, a produção publicada em [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a servir `assets/js/kc-notifications.js` com `renderDropdown`, `_markVisibleTimer` e a delegação por `closest('#kcNotifMarkAll')`, confirmando o bundle final da iteração.
- PR / commit / deploy:
  PR `#247`, commit funcional `ca61584` na branch `codex/v11-13-0-product-social-hardening`, merge squash `3e14361` na base `kinocampus-V11.0-foundations`, preview `dpl_BgKEASBh3FW4R8WvoFed8BnNRaGT` e deploy manual de produção `dpl_ErxTok7qpY11wiUG2T5i6CsrDX42`, publicado em `https://kino-campus-kfiulmc01-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a macrofase de produto/interações sociais não foi exaurida nesta fatia. O residual de banners, popovers e endurecimento adicional em `_product.html`/`product.controller.js` segue aberto e foi movido explicitamente para `v11.13.1`.

---

### Iteração `v11.13.1`

- objetivo:
  fechar o residual imediato de popovers e compartilhamento na página de produto sem abrir refactor amplo em `_product.html`/`product.controller.js`.
- arquivos alterados:
  `assets/js/kc-utils.js`, `assets/js/controllers/product.controller.js`, `tests/kc-utils-expanded.test.js`, `tests/product-popover-hardening.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  compartilhamento por cópia no produto, tracking de share em interações sociais, popovers principais da área de ação (`Compartilhar`, `Salvar`, `Marcar na Agenda`) e o bloco `8.2` do roteiro contínuo da v11.
- contratos preservados:
  nenhuma rota pública, adapter, migration, RPC, contrato de `KCAPI` ou estrutura HTML dos popovers foi alterada; a fatia ficou restrita ao wiring interno do produto e à adição de um helper compartilhado compatível em `KCUtils`.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/controllers/product.controller.js`, `node --check assets/js/kc-utils.js`, `npx jest tests/kc-utils-expanded.test.js tests/product-popover-hardening.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_FNt2DW32NiVcTpyDED3bodfqp97D`, com alias `https://kino-campus-git-codex-v11-13-1-p-9521df-yannakamurabrs-projects.vercel.app`, confirmado por `vercel inspect`. O fetch direto do preview continuou protegido por Vercel Authentication nesta sessão, então a homologação remota dessa etapa ficou ancorada em `vercel inspect` e na validação local dos arquivos alterados. Após o merge, a produção publicada em [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a servir `assets/js/controllers/product.controller.js` com `copyCurrentPostLink`/`bindProductGlobalKeydown` e `assets/js/kc-utils.js` com `async function copyTextToClipboard` + fallback `execCommand('copy')`, confirmados por `curl.exe --ssl-no-revoke`.
- PR / commit / deploy:
  PR `#249`, commits `ce43e66` e `2079ebb` na branch `codex/v11-13-1-product-popover-hardening`, merge squash `8a95e2e` na base `kinocampus-V11.0-foundations`, preview `dpl_FNt2DW32NiVcTpyDED3bodfqp97D` e deploy manual de produção `dpl_35oJC5Uyd5zHR49ZcRcGPa9EXBu8`, publicado em `https://kino-campus-bgvpivdd9-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  esta fatia fecha o residual pequeno e seguro dos popovers de ação do produto, mas a macrofase social ainda pode pedir revisão futura de banners ou outras superfícies apenas se um bug concreto justificar nova subfatia antes de `v11.14.0`.

---

### Iteração `v11.14.0`

- objetivo:
  iniciar a rodada de perfil e `my-posts` eliminando o drift de rota de detalhe nessas superfícies, para que a navegação humana use o caminho canônico `_product.html`.
- arquivos alterados:
  `assets/js/kc-utils.js`, `assets/js/controllers/profile.controller.js`, `assets/js/controllers/my-posts.controller.js`, `tests/kc-utils-expanded.test.js`, `tests/profile-my-posts-detail-links.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  cards de posts do perfil, comentários/atividades com link para publicação, destaques/salvos do perfil, ações de visualização em `my-posts` e os trechos do roteiro `8.2` referentes à sequência `v11.14.0` → `v11.15.0`.
- contratos preservados:
  nenhuma migration, RPC, adapter, payload de perfil ou estrutura HTML de `profile.html` / `my-posts.html` foi alterada; a iteração ficou restrita à navegação de detalhe e à adição de um helper compartilhado compatível em `KCUtils`.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-utils.js`, `node --check assets/js/controllers/profile.controller.js`, `node --check assets/js/controllers/my-posts.controller.js`, `npx jest tests/kc-utils-expanded.test.js tests/profile-my-posts-detail-links.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_AvvbfCZvKjWH2w2pdXhwq7ZY7nei`, com alias `https://kino-campus-git-codex-v11-14-0-p-547a36-yannakamurabrs-projects.vercel.app`, confirmado por `vercel inspect`. O fetch direto do preview continuou protegido por Vercel Authentication nesta sessão, então a homologação remota dessa etapa ficou ancorada em `vercel inspect`, no check `Vercel` da PR `#251` e nas regressões locais dos arquivos alterados. Após o merge, a produção publicada em [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a servir `assets/js/controllers/profile.controller.js` e `assets/js/controllers/my-posts.controller.js` com `buildPostDetailHref(...)` apontando para `_product.html`, além de `assets/js/kc-utils.js` com `buildProductDetailHref(...)`, todos confirmados por `curl.exe --ssl-no-revoke`.
- PR / commit / deploy:
  PR `#251`, commits `736fd12` e `abf8f49` na branch `codex/v11-14-0-profile-detail-links`, merge squash `e574038` na base `kinocampus-V11.0-foundations`, preview `dpl_AvvbfCZvKjWH2w2pdXhwq7ZY7nei` e deploy manual de produção `dpl_8faNj9pCcmtXzk4eq6jS2Q5NyAHJ`, publicado em `https://kino-campus-iw6nrjedp-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a fatia fecha o drift imediato de detalhe em perfil e `my-posts`, mas ainda existe legado de `product.html` em outras superfícies fora do escopo desta rodada que só deve ser tratado em iteração própria ou quando um bug concreto justificar expansão controlada.

---

### Iteração `v11.15.0`

- objetivo:
  iniciar a rodada de conta, onboarding e `settings` removendo o drift residual do preview de contato, para que o link de demonstração use o mesmo caminho canônico `_product.html` já adotado nas demais superfícies humanas.
- arquivos alterados:
  `assets/js/controllers/settings.controller.js`, `tests/account-profile.shared.test.js`, `tests/settings-contact-preview-links.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  preview de contato em `settings`, contrato shared de `buildContactAction`, consistência da rota canônica do detalhe de publicação e o trecho do roteiro `8.2` referente à sequência `v11.15.0` → `v11.15.1`.
- contratos preservados:
  nenhuma migration, RPC, adapter, payload de onboarding, estrutura HTML de `settings.html` ou contrato público de `KCAPI` foi alterado; a iteração ficou restrita ao wiring interno do preview, ao reaproveitamento do helper canônico de `KCUtils` e às regressões/documentação de suporte.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/controllers/settings.controller.js`, `npx jest tests/account-profile.shared.test.js tests/settings-contact-preview-links.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_7iH9AyEcMsviriav3hwCQUfuv1g6`, com alias `https://kino-campus-git-codex-v11-15-0-s-b41fb5-yannakamurabrs-projects.vercel.app`, confirmado por `gh pr checks` e `vercel inspect`. O fetch direto do preview continuou protegido por Vercel Authentication nesta sessão e o `vercel curl` local esbarrou na limitação de revogação TLS do Windows, então a homologação remota dessa etapa ficou ancorada em `vercel inspect`, no check `Vercel` da PR `#253` e nas regressões locais dos arquivos alterados. Após o merge, a produção publicada em [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a servir `assets/js/controllers/settings.controller.js` com `buildPreviewPostUrl()` e `postUrl: buildPreviewPostUrl()`, além de responder `200` em `settings.html`, tudo confirmado por `curl.exe --ssl-no-revoke`.
- PR / commit / deploy:
  PR `#253`, commit funcional `9eb4ebc` na branch `codex/v11-15-0-settings-contact-preview-canonical`, merge squash `eb552e2` na base `kinocampus-V11.0-foundations`, preview `dpl_7iH9AyEcMsviriav3hwCQUfuv1g6` e deploy manual de produção `dpl_4iiQjG2zjNUhYyo6Z3n9M6D3yhGp`, publicado em `https://kino-campus-b2hq00xay-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a macrofase de conta/onboarding/settings não foi esgotada nesta fatia. O próximo passo continua sendo `v11.15.1`, para ampliar a revisão de `settings.html`, `account-setup.html` e shareds de conta/perfil sem abrir refactor amplo em uma única rodada.

---

### Iteração `v11.15.1`

- objetivo:
  continuar a rodada de conta/onboarding alinhando a prévia de contato de `account-setup` ao mesmo `buildContactAction` usado pelo CTA real dos anúncios, para que o toggle de contato público deixe de divergir do comportamento efetivo.
- arquivos alterados:
  `assets/js/controllers/account-setup.controller.js`, `tests/account-profile.shared.test.js`, `tests/account-setup-contact-preview.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  prévia de contato do onboarding, toggle `Permitir contato público nos anúncios`, contrato shared de `buildContactAction` e o trecho do roteiro `8.2` referente à sequência `v11.15.1` → `v11.15.2`.
- contratos preservados:
  nenhuma migration, RPC, adapter, payload de onboarding salvo, estrutura HTML de `account-setup.html` ou contrato público de `KCAPI` foi alterado; a iteração ficou restrita ao wiring interno da prévia de contato, ao reaproveitamento do helper shared existente e às regressões/documentação de suporte.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/controllers/account-setup.controller.js`, `npx jest tests/account-profile.shared.test.js tests/account-setup-contact-preview.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_5cAB1wgjGki748PKLeYFqEAgp83J`, com alias `https://kino-campus-git-codex-v11-15-1-a-b5fc47-yannakamurabrs-projects.vercel.app`, confirmado por `gh pr checks` e `vercel inspect`. O fetch direto do preview continuou protegido por Vercel Authentication nesta sessão, então a homologação remota dessa etapa ficou ancorada em `vercel inspect`, no check `Vercel` da PR `#255` e nas regressões locais dos arquivos alterados. Após o merge, a produção publicada em [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a servir `assets/js/controllers/account-setup.controller.js` com `buildPreviewPostUrl()`, `shared.buildContactAction(...)` e o listener de `#accountSetupCtaEnabled`, além de responder `200` em `account-setup.html`, tudo confirmado por `curl.exe --ssl-no-revoke`.
- PR / commit / deploy:
  PR `#255`, commit funcional `2a85925` na branch `codex/v11-15-1-account-setup-contact-preview`, merge squash `31d7f44` na base `kinocampus-V11.0-foundations`, preview `dpl_5cAB1wgjGki748PKLeYFqEAgp83J` e deploy manual de produção `dpl_4YBqUWRySXoXdeFVU5pjQk34qbfY`, publicado em `https://kino-campus-82misd6at-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a macrofase de conta/onboarding/settings continua aberta. O próximo passo após esta fatia permanece sendo `v11.15.2`, para continuar a revisão de `settings.html`, `account-setup.html` e shareds de conta/perfil sem abrir refactor amplo em uma única rodada.

---

### Iteração `v11.15.2`

- objetivo:
  aprofundar a rodada de conta/onboarding tornando determinística a hidratação de `social_links` e `social_visibility` em `account-setup`, para que perfis sem configuração completa não herdem estado antigo de checkboxes ou campos sociais.
- arquivos alterados:
  `assets/js/controllers/account-setup.controller.js`, `tests/account-setup-social-hydration.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  `account-setup.html` nos blocos `data-social-input`/`data-social-visible`, helpers `normalizeSocialLinks`, `normalizeSocialVisibility` e `SOCIAL_ORDER` em `assets/js/account-profile.shared.js`, além da coerência com a prévia de contato endurecida na `v11.15.1`.
- contratos preservados:
  nenhuma migration, RPC, adapter, payload persistido, estrutura HTML de `account-setup.html` ou contrato público de `KCAPI` foi alterado; a iteração ficou restrita ao wiring interno de hidratação/coleta do onboarding, ao reaproveitamento dos helpers shared existentes e às regressões/documentação de suporte.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/controllers/account-setup.controller.js`, `npx jest tests/account-profile.shared.test.js tests/account-setup-contact-preview.test.js tests/account-setup-social-hydration.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_CPiGz5Y1hnGzSg58ean6GRimAj3d`, com alias `https://kino-campus-git-codex-v11-15-2-a-6c9ec7-yannakamurabrs-projects.vercel.app`, confirmado por `gh pr checks` e `vercel inspect`. O fetch direto do preview continuou protegido por Vercel Authentication nesta sessão, então a homologação remota dessa etapa ficou ancorada no check `Vercel` da PR `#257` e no `vercel inspect`. Após o merge, a produção publicada em [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a servir `assets/js/controllers/account-setup.controller.js` com `SOCIAL_VISIBILITY_KEYS`, `shared.normalizeSocialVisibility(...)` e `hasSavedSocialVisibility(...)`, além de responder `200` em `account-setup.html`, tudo confirmado por `curl.exe --ssl-no-revoke`.
- PR / commit / deploy:
  PR `#257`, commit funcional `d6ffd51` na branch `codex/v11-15-2-account-setup-social-hydration`, merge squash `97f28a1` na base `kinocampus-V11.0-foundations`, preview `dpl_CPiGz5Y1hnGzSg58ean6GRimAj3d` e deploy manual de produção `dpl_9UDrj8vb3NkJzqDPPFZmeqAgUasq`, publicado em `https://kino-campus-nfniub6f8-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a macrofase de conta/onboarding/settings ficou suficientemente coberta para a rodada atual. O próximo passo da sequência remanescente passa a ser `v11.16.0`, iniciando a consolidação do admin pós-v10.

---

### Iteração `v11.16.0`

- objetivo:
  iniciar a consolidação do admin pós-v10 removendo drift do preload/boot visual entre as 5 telas administrativas, para que `kc-loading` e `kc-theme-preload` deixem de depender de scripts e estilos inline replicados.
- arquivos alterados:
  `admin/index.html`, `admin/moderation.html`, `admin/reports.html`, `admin/banners.html`, `admin/help-requests.html`, `assets/js/admin-shell.js`, `assets/css/admin-shell.css`, `tests/admin-shell-preload-markup.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  as 5 telas em `admin/*.html`, o shell compartilhado em `assets/js/admin-shell.js`, o CSS compartilhado em `assets/css/admin-shell.css` e a consistência do bootstrap `kc-loading`/`kc-theme-preload` entre dashboard, moderação, denúncias, banners e pedidos de ajuda.
- contratos preservados:
  nenhuma migration, RPC, adapter, controller de regra de negócio, contrato de `KCAPI`, estrutura dos painéis admin ou fluxo operacional de auth foi alterado; a iteração ficou restrita ao boot/preload do shell administrativo e à regressão estática de suporte.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/admin-shell.js`, `npx jest tests/admin-shell-preload-markup.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_Cxd3cRgJHpqfRNXC9wR1zdZ8rSch`, com alias `https://kino-campus-git-codex-v11-16-0-a-211d4a-yannakamurabrs-projects.vercel.app`, confirmado por `gh pr checks` e `vercel inspect`. Após o merge, a produção publicada em [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a servir `assets/js/admin-shell.js` com `releaseBootState()` e `admin/index.html` com `<html lang="pt-BR" class="kc-loading kc-theme-preload">`, tudo confirmado por `curl.exe --ssl-no-revoke` e `vercel inspect`.
- PR / commit / deploy:
  PR `#259`, commit funcional `cf3e104` na branch `codex/v11-16-0-admin-shell-preload`, merge squash `dfc57be` na base `kinocampus-V11.0-foundations`, preview `dpl_Cxd3cRgJHpqfRNXC9wR1zdZ8rSch` e deploy manual de produção `dpl_JQL419g5PzKoNrr5uDi386YVwQzK`, publicado em `https://kino-campus-fu8o1fioz-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a macrofase de admin pós-v10 foi iniciada, mas ainda faltam subfatias de controllers, paginação, feedback e redução de fallback implícito. O próximo passo da sequência remanescente passa a ser `v11.17.0`.

---

### Iteração `v11.17.0`

- objetivo:
  continuar a consolidação do admin pós-v10 pelo primeiro controller ainda desalinhado, para que `admin-banners.controller.js` valide auth/admin com o mesmo contrato moderno já adotado nas outras telas administrativas e deixe de carregar a tela sem sessão/autorização validadas.
- arquivos alterados:
  `assets/js/controllers/admin-banners.controller.js`, `tests/admin-banners-access-contract.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  o contrato de acesso admin já usado em `admin-moderation.controller.js`, `admin-reports.controller.js`, `admin-help-requests.controller.js` e `admin-dashboard.controller.js`, além do bootstrap visual previamente unificado na `v11.16.0`.
- contratos preservados:
  nenhuma migration, RPC, adapter, contrato público de `KCAPI`, estrutura HTML da página de banners, CRUD de banner, drag-and-drop, histórico de auditoria ou contrato Supabase de `kc_admin_list_banners` foi alterado; a iteração ficou restrita ao gate de acesso, à espera controlada de hidratação de auth e à regressão estática de suporte.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/controllers/admin-banners.controller.js`, `npx jest tests/admin-banners-access-contract.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_EHA4UFZkbLASBPiQTFc45mfWJUnx`, com alias `https://kino-campus-git-codex-v11-17-0-a-3260b7-yannakamurabrs-projects.vercel.app`, confirmado por `gh pr checks` e `list_deployments` do Vercel MCP. O `admin/banners.html` do preview ficou disponível com o shell publicado, enquanto o fetch direto do asset JS permaneceu protegido por Vercel Authentication nessa URL de preview. Após o merge, a produção publicada em [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a servir `assets/js/controllers/admin-banners.controller.js` com `checkAdminAccess()`, `window.KCAPI.getCurrentUser`, consulta a `profiles.is_admin` e sem os legados `window.__kcCurrentProfile` / `if (!banners.length) loadBanners();`, tudo confirmado por `curl.exe --ssl-no-revoke` e `list_deployments` do Vercel MCP.
- PR / commit / deploy:
  PR `#261`, commit funcional `e07ec68` na branch `codex/v11-17-0-admin-banners-access-contract`, merge squash `6b471ac` na base `kinocampus-V11.0-foundations`, preview `dpl_EHA4UFZkbLASBPiQTFc45mfWJUnx` e deploy manual de produção `dpl_EAzPU5vMhD6wmyYyWPBYxgjRj44R`, publicado em `https://kino-campus-g2v4rizc9-yannakamurabrs-projects.vercel.app` e aliasado para [www.kinocampus.com.br](https://www.kinocampus.com.br), todos confirmados em `09 de abril de 2026`.
- riscos residuais:
  a primeira redução de fallback implícito do admin foi concluída, mas a rodada v11 ainda precisa avançar para `v11.18.0`, aprofundando contratos entre `KCAPI`, adapters e consumers críticos antes da revisão operacional de Supabase.

---

### Iteração `v11.18.0`

- objetivo:
  aprofundar a rodada de contratos entre `KCAPI` e adapters em um recorte pequeno e seguro, alinhando a assinatura de `getProfileHighlightsCount(...)` à superfície já usada por `getProfileHighlights(...)` e `getMySavedPostsCount(...)`.
- arquivos alterados:
  `assets/js/kc-api.client.js`, `assets/js/adapters/local.adapter.js`, `assets/js/adapters/supabase.adapter.js`, `tests/kc-api-client.test.js`, `tests/local-adapter.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  o contrato vizinho de salvos/destaques em `kc-api.client.js`, a implementação local em `listLocalSavedPostSummaries(...)`, o fallback de destaques no `supabase.adapter.js` e os consumers críticos que já trabalham com `params` nos counts/listagens equivalentes.
- contratos preservados:
  nenhuma migration, RPC, schema, payload público de destaques, semântica de highlight ou fluxo visual foi alterado; a iteração ficou restrita ao endurecimento de assinatura e encaminhamento de `params`, mantendo `getProfileHighlightsCount(...)` como superfície highlight-only.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `node --check assets/js/kc-api.client.js`, `node --check assets/js/adapters/local.adapter.js`, `node --check assets/js/adapters/supabase.adapter.js`, `npx jest tests/kc-api-client.test.js tests/local-adapter.test.js --runInBand` e `git diff --check`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_3GNRcm9EzwCwgcWRFkZrN8j4kSpv`, com validação do asset publicado via `web_fetch_vercel_url` no Vercel MCP para `assets/js/kc-api.client.js` e `assets/js/adapters/local.adapter.js`, confirmando a assinatura `getProfileHighlightsCount(profileId, params = {})`. Após o merge, a base gerou o deployment `dpl_3LstWGN6dbR65McLd9hoEZiDQUdk`, também validado no Vercel MCP, com os mesmos assets publicados na branch principal.
- PR / commit / deploy:
  PR `#263`, commit funcional `a6ff493` na branch `codex/v11-18-0-highlights-count-contract`, merge squash `16f1c0d` na base `kinocampus-V11.0-foundations`, preview `dpl_3GNRcm9EzwCwgcWRFkZrN8j4kSpv` e deploy automático pós-merge `dpl_3LstWGN6dbR65McLd9hoEZiDQUdk`, todos confirmados em `10 de abril de 2026`.
- riscos residuais:
  a rodada de contratos entre fachada e adapters ficou mais consistente nessa superfície específica, mas a próxima fase precisa sair da assinatura JS e auditar a trilha operacional do Supabase em si, incluindo RPC catalog, grants, `search_path`, RLS e documentação técnica do banco em `v11.19.0`.

---

### Iteração `v11.19.0`

- objetivo:
  revisar a trilha operacional do Supabase em um recorte pequeno e seguro, eliminando warnings ativos do Advisor ligados a `auth_rls_initplan`, `multiple_permissive_policies` e `unindexed_foreign_keys` nas superfícies `notifications`, `post_view_events` e `kc_invited_emails`, enquanto a documentação técnica do banco é alinhada ao estado real do projeto.
- arquivos alterados:
  `supabase/migrations/v9.3.3.0_supabase_operational_rls_fk.sql`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/ops/vercel-supabase-invariants.md`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  policies reais em `pg_policies` para `public.notifications`, `public.post_view_events` e `public.kc_invited_emails`, índices existentes em `pg_indexes`, a migration-base `v9.1.0.0_notifications_table.sql`, a trilha de analytics em `v9.3.1.0_post_analytics.sql`, a trilha de convites em `v9.1.0.3_invited_users.sql` / `v9.1.0.4_invite_audit_log.sql`, o adapter Supabase para convites (`kc_admin_get_invites`, `kc_admin_revoke_invite`) e os advisors de segurança/performance do projeto.
- contratos preservados:
  nenhuma rota pública, assinatura de `KCAPI`, payload de notificações, analytics de post, fluxo de convite via Edge Function ou contrato visual do frontend foi alterado; a iteração ficou restrita a performance/operacional do banco, nomes de policies e documentação técnica correspondente.
- migrations criadas/aplicadas:
  `supabase/migrations/v9.3.3.0_supabase_operational_rls_fk.sql`, aplicada no projeto Supabase principal desta base durante a iteração `v11.19.0`.
- testes executados:
  `git diff --check`, reconsulta dos advisors `security` e `performance`, inspeção SQL de `pg_policies` e `pg_indexes` antes/depois da migration e validação documental direcionada.
- validação em navegador:
  não houve mudança de frontend dependente desta migration; a validação publicada desta iteração concentra-se na consistência documental entregue pelo deploy estático e no estado real do banco no Supabase.
- PR / commit / deploy:
  PR `#265`, commit funcional `c55391b` na branch `codex/v11-19-0-supabase-rls-fk-audit`, preview final `dpl_YyTeTEZ3gnxYYCc2a2TL3FXVV4Ff` (`kino-campus-3jji0iglw-yannakamurabrs-projects.vercel.app`) homologado em `10 de abril de 2026` e deploy de produção `dpl_J8VA2ur4bwJn4uffHV8eNuVouh3G` (`kino-campus-9uf5f5ixc-yannakamurabrs-projects.vercel.app`, alias `www.kinocampus.com.br`) validado após o merge do commit squash `fd01000`.
- riscos residuais:
  permanecem fora do escopo desta migration `extension_in_public` para `unaccent` e `auth_leaked_password_protection` desabilitado, ambos registrados como residual operacional no projeto. No roadmap reformulado desta mesma rodada, a próxima fase `v11.20.0` passa a focar o hardening in-app das notificações; a revisão de Edge Functions, storage e invariantes de deploy foi movida para `v11.22.0`.

---

### Iteração `v11.19.1`

- objetivo:
  auditar a trilha atual de notificações e transformar o próximo bloco da v11 em um roadmap seguro para notificações multicanal, incluindo limpeza no dropdown, preferências por evento/canal e futuras entregas por e-mail e WhatsApp, sem implementar esses canais ainda.
- arquivos alterados:
  `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  `assets/js/kc-notifications.js`, `assets/js/kc-api.client.js`, `assets/js/adapters/supabase.adapter.js`, `assets/js/adapters/local.adapter.js`, `assets/css/styles.css`, `assets/css/kc-public-shell.css`, `index.html`, `settings.html`, `account-setup.html`, `_product.html`, migrations `v9.1.0.0_notifications_table.sql` / `v9.1.0.1_notification_triggers.sql`, docs de banco e o deploy público vigente.
- achado principal:
  o sino não aparenta estar sendo clipado por `overflow` do header; o problema é majoritariamente visual. O shell responsivo fixa a ação em `36x36`, zera o `padding`, força `line-height: 1` e deixa o badge muito agressivo no canto superior, o que dá a sensação de ícone "comido". O backlog correto é de hardening visual/geométrico, não de correção de `z-index` ou recorte por container.
- contratos preservados:
  nenhuma migration nova, RPC nova, Edge Function nova, mudança de adapter, alteração de `KCAPI` ou alteração funcional do dropdown foi aplicada nesta rodada; a iteração ficou restrita a diagnóstico técnico e replanejamento versionado da v11.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  inspeção dirigida de código/CSS/SQL da trilha de notificações, `node --check assets/js/kc-notifications.js` e `git diff --check`.
- validação em navegador:
  não houve mudança funcional de frontend nesta rodada. A checagem visual foi inferida a partir do screenshot recebido, da geometria real dos estilos publicados e da confirmação de que o shell público usa `overflow: visible` na área relevante do header, descartando clipping estrutural como hipótese principal.
- PR / commit / deploy:
  PR `#267`, commits documentais `50f7905` e `1d93bec` na branch `codex/v11-19-1-notification-roadmap`, merge squash `4499301` na base `kinocampus-V11.0-foundations`, preview `dpl_EDqHDZZhsKasQwXuVmjUXVip5czB` (`kino-campus-8m69zbsur-yannakamurabrs-projects.vercel.app`) homologado e deploy manual de produção `dpl_DaSid6uAaMKpnLqGMnc88hhCZkeZ` (`kino-campus-qj9350kgf-yannakamurabrs-projects.vercel.app`, alias `www.kinocampus.com.br`), todos confirmados em `10 de abril de 2026`.
- riscos residuais:
  ainda não existe camada de preferências por evento/canal, nem trilha assíncrona de entrega externa. A expansão futura precisa separar notificação pública/in-app de endpoints privados de entrega, evitando reaproveitar automaticamente o WhatsApp de contato do perfil.

---

### Iteração `v11.20.1`

- objetivo:
  persistir preferências de notificação por evento e por canal em uma camada privada e separada, adicionando uma UI segura em `settings` e fazendo os triggers in-app atuais respeitarem o canal `in_app` sem ainda ativar entrega externa por e-mail/WhatsApp.
- arquivos alterados:
  `settings.html`, `assets/css/kc-public-shell.css`, `assets/js/account-profile.shared.js`, `assets/js/controllers/settings.controller.js`, `assets/js/kc-api.client.js`, `assets/js/adapters/local.adapter.js`, `assets/js/adapters/supabase.adapter.js`, `supabase/migrations/v11.20.1.0_notification_preferences.sql`, `tests/account-profile.shared.test.js`, `tests/local-adapter.test.js`, `tests/kc-api-notification-preferences-contract.test.js`, `tests/settings-notification-preferences.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`, `docs/api-contract.md`, `docs/db-schema.md`.
- equivalentes revisados:
  a trilha de notificações entre shell público, `settings`, helpers shared de conta/perfil, fachada `KCAPI`, `LocalAdapter`, `SupabaseAdapter`, migrations de notificação existentes (`v9.1.0.0_notifications_table.sql`, `v9.1.0.1_notification_triggers.sql`, `v9.1.1.0_comment_threading.sql`) e a separação explícita entre contato público do perfil e destino privado de entrega.
- contratos preservados:
  `public.notifications` continua como feed canônico do sino/dropdown; `email` e `whatsapp` ainda não disparam entrega externa; usuários sem row em `notification_preferences` continuam recebendo tudo in-app por default; nenhum contato público do perfil foi reaproveitado automaticamente como endpoint privado de notificação.
- migrations criadas/aplicadas:
  `supabase/migrations/v11.20.1.0_notification_preferences.sql`, aplicada no projeto Supabase principal durante esta iteração. A migration criou `public.notification_preferences`, `public.kc_default_notification_preferences()`, `public.kc_notification_channel_enabled(...)`, políticas RLS owner-only e o endurecimento dos triggers atuais para respeitar o canal `in_app`.
- testes executados:
  `node --check assets/js/account-profile.shared.js`, `node --check assets/js/kc-api.client.js`, `node --check assets/js/adapters/local.adapter.js`, `node --check assets/js/adapters/supabase.adapter.js`, `node --check assets/js/controllers/settings.controller.js`, `npx jest tests/account-profile.shared.test.js tests/local-adapter.test.js tests/kc-api-notification-preferences-contract.test.js tests/settings-notification-preferences.test.js tests/kc-api-notifications-contract.test.js --runInBand` e `git diff --check`.
- validação operacional:
  a migration foi aplicada com sucesso no Supabase. A inspeção SQL confirmou a existência da tabela `public.notification_preferences`, o sample canônico de `kc_default_notification_preferences()` e as 4 policies owner-only (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). Os advisors de segurança permaneceram apenas com os residuals já conhecidos do projeto: `extension_in_public` para `unaccent` e `auth_leaked_password_protection`.
- validação em navegador:
  o preview da PR ficou `Ready` no deployment `dpl_HrWK6p9ugp8LZ9PSfKgLbJ4m8Q7U`, com alias `https://kino-campus-git-codex-v11-20-1-n-957980-yannakamurabrs-projects.vercel.app`, confirmado por `gh pr checks` e `vercel inspect`. O fetch direto do preview permaneceu protegido por Vercel Authentication nesta sessão, então a homologação remota desta etapa ficou ancorada no status `Vercel` da PR `#271`, no `vercel inspect` e na checagem local da `settings.html`/`settings.controller.js`.
- PR / commit / deploy:
  PR funcional `#271`, commits `0fcef67` e `cac929c` na branch `codex/v11-20-1-notification-preferences`, merge squash `10a5818` na base `kinocampus-V11.0-foundations`, preview `dpl_HrWK6p9ugp8LZ9PSfKgLbJ4m8Q7U` (`kino-campus-git-codex-v11-20-1-n-957980-yannakamurabrs-projects.vercel.app`) e deploy manual de produção `dpl_BGPST16nsxuGXP4gbgWzAPDbmTSz` (`kino-campus-cp6vmvcpt-yannakamurabrs-projects.vercel.app`, alias [www.kinocampus.com.br](https://www.kinocampus.com.br)), todos confirmados em `10 de abril de 2026`.
- riscos residuais:
  a persistência por evento/canal foi entregue, mas a fundação assíncrona de entrega externa ainda não existe. A próxima fase obrigatória continua sendo `v11.20.2`, responsável por fila/outbox, logs de entrega, segredos e invariantes operacionais antes de qualquer canal externo real.

---

### Iteração `v11.20.2`

- objetivo:
  criar a fundação assíncrona de entrega externa de notificações, sem acoplar provider aos triggers principais do app e sem quebrar a trilha canônica in-app do sino/dropdown.
- arquivos alterados:
  `supabase/migrations/v11.20.2.0_notification_delivery_outbox.sql`, `supabase/functions/kc-dispatch-notification-outbox/index.ts`, `tests/notification-delivery-foundation.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/ops/vercel-supabase-invariants.md`.
- equivalentes revisados:
  trilha atual de notificações entre triggers SQL (`v9.1.0.1_notification_triggers.sql`, `v11.20.1.0_notification_preferences.sql`), tabelas `notifications` e `notification_preferences`, helpers de voto em `supabase.adapter.js`, documentação técnica do banco, invariantes operacionais de Edge Functions e o contrato real de `post_votes`.
- contratos preservados:
  `public.notifications` segue como feed canônico do sino/dropdown; nenhum provider externo foi acoplado aos triggers; `whatsapp` permanece bloqueado enquanto não houver destino privado próprio; o contato público do perfil/produto não é reutilizado automaticamente como endpoint privado de notificação.
- migrations criadas/aplicadas:
  `supabase/migrations/v11.20.2.0_notification_delivery_outbox.sql`, aplicada no projeto Supabase principal durante esta iteração. A migration criou `public.notification_delivery_outbox`, `public.notification_delivery_attempts`, `public.kc_resolve_notification_delivery_destination(...)`, `public.kc_build_notification_delivery_payload(...)`, `public.kc_enqueue_notification_delivery(...)` e `public.kc_emit_notification_event(...)`, além de realinhar `kc_notify_on_vote()` para `new.voter_id` e `direction = 'hot'`.
- edge functions publicadas:
  `kc-dispatch-notification-outbox`, publicada no projeto Supabase principal com autenticação customizada por `x-kc-dispatch-secret` e comportamento intencional de dry-run/inspection nesta fase.
- testes executados:
  `npx jest tests/notification-delivery-foundation.test.js --runInBand`, `node scripts/hygiene-check.js` e `git diff --check`.
- validação operacional:
  a migration foi aplicada com sucesso no Supabase. A inspeção SQL confirmou a existência das tabelas `public.notification_delivery_outbox` e `public.notification_delivery_attempts`, dos índices de fila e attempts, das helpers novas e da correção real do trigger `kc_notify_on_vote()` para `new.voter_id` e voto positivo `hot`. O secret `KC_NOTIFICATION_DISPATCH_SECRET` foi criado via Management API do Supabase e a Edge Function respondeu com sucesso em dry-run, retornando `ok=true`, `mode='dry_run'` e a observação de que o dispatch por provider permanece desabilitado na `v11.20.2`.
- validação em navegador:
  não houve mudança de frontend dependente desta fase. O preview da PR ficou `READY` no deployment `dpl_9oPGNvCSE1L6ug9fVXJofXpmRqJF`, com alias `https://kino-campus-git-codex-v11-20-2-n-76101d-yannakamurabrs-projects.vercel.app`, confirmado pelo check `Vercel`, por `get_deployment` no Vercel MCP e por fetch remoto do preview. Após o merge, [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a responder `200` com a revisão publicada do deployment `dpl_4nc73MAaDN2frzDQo6auLjrsm3h3`.
- PR / commit / deploy:
  PR `#273`, commit funcional `c17cc50` na branch `codex/v11-20-2-notification-outbox-foundation`, merge squash `b99d9ea` na base `kinocampus-V11.0-foundations`, preview `dpl_9oPGNvCSE1L6ug9fVXJofXpmRqJF` (`kino-campus-luntrdyn4-yannakamurabrs-projects.vercel.app`, alias `kino-campus-git-codex-v11-20-2-n-76101d-yannakamurabrs-projects.vercel.app`) e deploy publicado após o merge `dpl_4nc73MAaDN2frzDQo6auLjrsm3h3` (`kino-campus-3mmclh1vu-yannakamurabrs-projects.vercel.app`, domínio [www.kinocampus.com.br](https://www.kinocampus.com.br)), todos confirmados em `11 de abril de 2026`.
- riscos residuais:
  a fundação assíncrona foi entregue, mas ainda não existe canal real de e-mail ou WhatsApp. A próxima fase obrigatória passa a ser `v11.21.0`, para implementar o envio por e-mail sobre essa base sem alterar o contrato do sino/dropdown.

---

### Iteração `v11.21.0`

- objetivo:
  implementar o canal real de e-mail sobre a fundação de outbox já entregue, sem alterar o contrato do sino/dropdown e sem acoplar provider externo aos triggers principais do app.
- arquivos alterados:
  `supabase/migrations/v11.21.0.0_notification_email_channel.sql`, `supabase/functions/kc-dispatch-notification-outbox/index.ts`, `tests/notification-delivery-foundation.test.js`, `tests/notification-email-channel.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/ops/vercel-supabase-invariants.md`.
- equivalentes revisados:
  a trilha atual de notificações entre `v11.20.1.0_notification_preferences.sql`, `v11.20.2.0_notification_delivery_outbox.sql`, as tabelas `notification_delivery_outbox` / `notification_delivery_attempts`, a Edge Function `kc-dispatch-notification-outbox`, a separação entre notificação in-app e entrega externa e a documentação operacional de segredos/invariantes.
- contratos preservados:
  `public.notifications` segue como feed canônico do sino/dropdown; a emissão de eventos continua centralizada em `kc_emit_notification_event(...)`; nenhum trigger passou a chamar provider externo diretamente; o WhatsApp público do perfil/produto continua proibido como destino privado de notificação.
- migrations criadas/aplicadas:
  `supabase/migrations/v11.21.0.0_notification_email_channel.sql`, aplicada no projeto Supabase principal durante esta iteração. A migration criou `public.kc_claim_notification_delivery_batch(...)` e `public.kc_record_notification_delivery_attempt(...)` para claim atômico da fila externa e registro consistente de tentativas.
- edge functions publicadas:
  `kc-dispatch-notification-outbox`, republicada como versão `3` no projeto Supabase principal. A função agora gera preview de envelopes em `dry_run`, envia por `Resend` quando `dryRun=false` e os segredos do provider estiverem configurados, e registra o resultado em `notification_delivery_attempts`.
- testes executados:
  `npx jest tests/notification-delivery-foundation.test.js tests/notification-email-channel.test.js --runInBand`, `node scripts/hygiene-check.js` e `git diff --check`.
- validação operacional:
  a migration foi aplicada com sucesso no Supabase e a inspeção SQL confirmou a existência das helpers `kc_claim_notification_delivery_batch` e `kc_record_notification_delivery_attempt`. A função `kc-dispatch-notification-outbox` foi publicada como versão `3` e o código remoto confirmado pelo próprio Supabase passou a conter `RESEND_ENDPOINT`, o envelope HTML/texto e o uso das helpers novas. A consulta de segredos do projeto confirmou que hoje só existe `KC_NOTIFICATION_DISPATCH_SECRET`; portanto, o canal de e-mail está implementado, mas continua operacionalmente gated até a criação de `KC_NOTIFICATION_EMAIL_PROVIDER`, `KC_NOTIFICATION_EMAIL_API_KEY` e `KC_NOTIFICATION_EMAIL_FROM`.
- validação em navegador:
  não houve mudança de frontend dependente desta fase; a homologação ficou concentrada em banco, Edge Function e deploy estático do repositório. O preview da PR ficou `READY` no deployment `dpl_8sNm4iyBp1i63ekFfmT3CJ2Pmigm`, com URL `https://kino-campus-a5eve1ig5-yannakamurabrs-projects.vercel.app` e alias `https://kino-campus-git-codex-v11-21-0-n-27e3b6-yannakamurabrs-projects.vercel.app`, confirmado pelo check `Vercel`, por `get_deployment` no Vercel MCP e por fetch remoto autenticado do preview. Após o merge, [www.kinocampus.com.br](https://www.kinocampus.com.br) passou a responder `200` com a revisão publicada do deployment `dpl_ES6C1Z3PbMd9HzWDZ5DaS3hLy3KU`.
- PR / commit / deploy:
  PR `#275`, commit funcional `32f2190` na branch `codex/v11-21-0-notification-email-channel`, merge squash `c56a4b8` na base `kinocampus-V11.0-foundations`, preview `dpl_8sNm4iyBp1i63ekFfmT3CJ2Pmigm` (`kino-campus-a5eve1ig5-yannakamurabrs-projects.vercel.app`, alias `kino-campus-git-codex-v11-21-0-n-27e3b6-yannakamurabrs-projects.vercel.app`) e deploy publicado após o merge `dpl_ES6C1Z3PbMd9HzWDZ5DaS3hLy3KU` (`kino-campus-iu5hszo3a-yannakamurabrs-projects.vercel.app`), todos confirmados em `11 de abril de 2026`.
- riscos residuais:
  o canal de e-mail já existe no código, mas ainda não pode enviar no projeto principal enquanto os segredos do provider não forem configurados no Supabase. A próxima fase obrigatória passa a ser `v11.21.1`, dedicada ao canal WhatsApp sem reaproveitar o WhatsApp público do perfil.

---

### Iteração `v11.22.0`

- objetivo:
  fechar a primeira camada operacional da trilha multicanal, automatizando o consumo da outbox externa com scheduler versionado, runtime privado e observabilidade explícita de runs, sem alterar o contrato canônico de `public.notifications` nem quebrar os canais `email` e `whatsapp` já implantados.
- arquivos alterados:
  `supabase/migrations/v11.22.0.0_notification_dispatch_scheduler.sql`, `supabase/functions/kc-dispatch-notification-outbox/index.ts`, `tests/notification-dispatch-ops.test.js`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/env-vars.md`, `docs/ops/vercel-supabase-invariants.md`.
- equivalentes revisados:
  a trilha externa de notificações entre `notification_delivery_outbox`, `notification_delivery_attempts`, `notification_channel_targets`, `notification_preferences`, os helpers SQL de emissão/claim/attempt, a Edge Function `kc-dispatch-notification-outbox`, as invariantes operacionais do Supabase e a documentação pública do projeto.
- contratos preservados:
  `public.notifications` segue como feed canônico in-app; os triggers principais continuam sem chamar providers diretamente; o agendamento automático continua fail-closed quando faltar `function_url` ou secret válido; `app.settings.kc_notification_dispatch_*` ficou apenas como fallback operacional, sem substituir a camada privada nova.
- migrations criadas/aplicadas:
  `supabase/migrations/v11.22.0.0_notification_dispatch_scheduler.sql`, aplicada no projeto Supabase principal durante esta iteração. A migration criou `public.notification_dispatch_runtime`, `public.notification_dispatch_runs`, o helper `public.kc_trigger_notification_dispatch(...)` e o job `pg_cron` `kc-dispatch-notification-outbox`.
- edge functions publicadas:
  `kc-dispatch-notification-outbox`, republicada como versão `5` no projeto Supabase principal. A função agora aceita secret vindo do runtime privado, persiste `execution_id`/`source`, registra `dry_run` e `dispatch` em `notification_dispatch_runs` e mantém o gating explícito por provider.
- testes executados:
  `npx jest tests/notification-delivery-foundation.test.js tests/notification-email-channel.test.js tests/notification-whatsapp-channel.test.js tests/notification-dispatch-ops.test.js --runInBand`, `node scripts/hygiene-check.js` e `git diff --check`.
- validação operacional:
  a migration foi aplicada com sucesso no Supabase; `pg_cron`, `pg_net` e `pgcrypto` já estavam instalados; o job `kc-dispatch-notification-outbox` foi confirmado ativo com agenda `*/5 * * * *`; a linha `primary` de `notification_dispatch_runtime` foi configurada com a URL real da Edge Function e `batch_limit = 25`; o helper `kc_trigger_notification_dispatch(...)` foi validado por SQL em `dry_run` com persistência posterior em `notification_dispatch_runs`; a chamada HTTP direta à Edge Function também confirmou o novo contrato de resposta com `execution_id`, `source` e status operacional dos providers.
- validação em navegador:
  o preview da PR ficou `READY` no deployment `dpl_DueeQMVYa9FVFeRvgYCH1D6Kg98c`, com URL `https://kino-campus-7mx2mioxk-yannakamurabrs-projects.vercel.app`. Após o merge, o deployment da base `dpl_9LeptJtb79CGH9tdcYFMHVijg9MT` ficou `READY`, e a produção foi promovida manualmente no deployment `dpl_HMTvL1ET8uLgW8NNwitLN5of3HyW`, já aliasado em [www.kinocampus.com.br](https://www.kinocampus.com.br). A verificação remota confirmou `200` no domínio e o bundle publicado de `assets/js/kc-env.js`.
- PR / commit / deploy:
  PR `#278`, commit funcional `0b245c3` na branch `codex/v11-22-0-notification-dispatch-scheduler`, merge squash `4699d44` na base `kinocampus-V11.0-foundations`, preview `dpl_DueeQMVYa9FVFeRvgYCH1D6Kg98c`, deployment pós-merge `dpl_9LeptJtb79CGH9tdcYFMHVijg9MT` e promoção de produção `dpl_HMTvL1ET8uLgW8NNwitLN5of3HyW`, todos confirmados em `11 de abril de 2026`.
- riscos residuais:
  a automação operacional agora está fechada, mas os providers externos continuam dependentes dos segredos específicos de canal já mapeados nas fases anteriores. A próxima fase obrigatória passa a ser `v11.23.0`, dedicada ao release gate final da v11; a trilha futura de i18n, acessibilidade e UX Writing fica reservada para começar somente após isso, em `v11.24.0`, com planejamento-only.

---

### Iteração `v11.23.0`

- objetivo:
  executar o release gate final da rodada principal da v11, validando a base inteira sem abrir refactor novo e fechando o backlog de QA, metadata e residuals operacionais conhecidos.
- arquivos alterados:
  `tests/post-analytics.test.js`, `package.json`, `docs/qa/README.md`, `docs/qa/report-v11.23.0-run1.md`, `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md`.
- equivalentes revisados:
  a regressao contratual de analytics entre `KCAPI` e o driver ativo, o mapa documental de QA, o estado canonico de versao `8.6.0`, os checks do Vercel, o dominio publico e os residuals do Supabase Advisor.
- contratos preservados:
  nenhum contrato publico de frontend, banco, trigger, RPC, adapter ou Edge Function foi alterado nesta fase; o runtime canonico `8.6.0` permaneceu intacto para nao introduzir um version bump parcial no fechamento da rodada.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `npx jest --runInBand`, `node scripts/hygiene-check.js` e `git diff --check`.
- validacao operacional:
  a regressao completa passou em `51/51` suites e `530/530` testes. O Supabase Advisor permaneceu apenas com os residuals aceitos desta fase: `extension_in_public` para `unaccent`, `auth_leaked_password_protection`, `rls_enabled_no_policy` nas tabelas privadas `notification_delivery_attempts`, `notification_delivery_outbox`, `notification_dispatch_runs` e `notification_dispatch_runtime`, alem do residual de performance `duplicate_index` em `public.posts` e dos `unused_index` ainda sem remocao segura dedicada.
- validacao em navegador:
  o preview da PR ficou `READY` no deployment `dpl_DucDMJtPmLg7TS78UnVQVX4LHWiU`, alias `kino-campus-git-codex-v11-23-0-r-29a5cf-yannakamurabrs-projects.vercel.app`, mas continuou protegido por Vercel Authentication. O deployment pos-merge da base ficou `READY` em `dpl_EF3gzc3MLEbGkLpS2CRdopuHo2cb`. A producao foi promovida manualmente no deployment `dpl_HPMAUgYe6kcoHBDh9vjp54mYg4VA`, aliasado em [www.kinocampus.com.br](https://www.kinocampus.com.br), e o smoke HTTP final confirmou `200` no dominio, `MARKET_OK`, `HOUSING_OK` e `HELP_OK`. O Playwright MCP local continuou bloqueado por `EPERM`, entao a homologacao desta fase ficou ancorada em checks do Vercel, fetch protegido e smoke HTTP remoto.
- PR / commit / deploy:
  PR funcional `#280`, commit funcional `441af25` na branch `codex/v11-23-0-release-gate`, merge squash `6bc3897` na base `kinocampus-V11.0-foundations`, preview `dpl_DucDMJtPmLg7TS78UnVQVX4LHWiU`, deployment pos-merge `dpl_EF3gzc3MLEbGkLpS2CRdopuHo2cb` e promocao de producao `dpl_HPMAUgYe6kcoHBDh9vjp54mYg4VA`, todos confirmados em `11 de abril de 2026`.
- riscos residuais:
  a rodada principal da v11 esta formalmente encerrada, mas a linha `v11.x` segue aberta para novas frentes estrategicas. A proxima fase obrigatoria passa a ser `v11.24.0`, em modo planejamento-only, para i18n, acessibilidade e UX Writing antes de qualquer alteracao funcional dessa trilha.

---

### Iteração `v11.24.0`

- objetivo:
  entregar o planejamento estruturado de i18n, acessibilidade e UX Writing como documento de referencia antes de qualquer codigo funcional dessa trilha, mapeando o inventario textual da base, os riscos de expansao de layout, a fragilidade de testes com strings literais e a estrategia incremental em 3 subfases (v11.24.1 a v11.24.3).
- arquivos alterados:
  `docs/i18n-a11y-uxwriting-plan.md` (novo), `README.md`, `RELATORIO-KINOCAMPUS-V11.md`.
- equivalentes revisados:
  inventario textual dos 22 HTMLs e 61 arquivos JS, 30+ valores unicos de `aria-label`, 33 placeholders, 22 titles, 18 meta descriptions, 60+ labels de categoria em `kc-constants.js`, 65+ instancias de `white-space: nowrap` em CSS, 12 arquivos de teste com strings literais pt-BR e 40 arquivos com seletores estaveis.
- contratos preservados:
  nenhum arquivo funcional (*.js, *.css, *.html) foi alterado nesta fase. O runtime canonico `8.6.0` permanece intacto. O inventario e uma fotografia do estado atual, sem modificar comportamento.
- migrations criadas/aplicadas:
  nenhuma.
- testes executados:
  `npx jest --runInBand`, `node scripts/hygiene-check.js` e `git diff --check`.
- validacao operacional:
  a regressao completa permaneceu em `51/51` suites e `530/530` testes, confirmando que a iteracao docs-only nao introduziu efeito colateral.
- validacao em navegador:
  o preview da PR ficou `READY` no deployment `dpl_BCk9B1HNLmocHHkNXNA7WjtcJxKb`, protegido por Vercel Authentication. O deployment pos-merge da base ficou `READY` em `dpl_CX1K3MSi53DhosaVDydQ2Zebm1mu`. A producao em [www.kinocampus.com.br](https://www.kinocampus.com.br) respondeu `200` com versao canonica `8.6.0` intacta, confirmando que a iteracao docs-only nao afetou o runtime publicado.
- PR / commit / deploy:
  PR `#282`, commit funcional `dde6f8c` na branch `codex/v11-24-0-i18n-a11y-planning`, merge squash `060fd40` na base `kinocampus-V11.0-foundations`, preview `dpl_BCk9B1HNLmocHHkNXNA7WjtcJxKb`, deployment pos-merge `dpl_CX1K3MSi53DhosaVDydQ2Zebm1mu`, producao herdada de `dpl_DFbqy2QResvANv1Pd7KsS1o3CVLe` (v11.23.0), todos confirmados em `11 de abril de 2026`.
- riscos residuais:
  o inventario textual e uma fotografia pontual; strings podem ser adicionadas ou removidas em iteracoes futuras entre v11.24.0 e v11.24.1. A estrategia incremental mitiga esse drift ao externalizar por camada. O roadmap de 3 subfases (v11.24.1-v11.24.3) depende de aprovacao explicita antes de cada inicio.

### Iteração `v11.24.1`

| Campo | Valor |
|---|---|
| Data | 12 de abril de 2026 |
| Branch | `codex/v11-24-1-i18n-infra` |
| Tipo | feature (arquivos funcionais) |
| Escopo | infraestrutura base de i18n — módulo `kc-i18n.js` e suite de testes |

- objetivo:
  criar a fundação técnica da trilha i18n/a11y/UX Writing, aprovada na v11.24.0. Nenhum HTML, CSS ou módulo JS existente foi modificado. Apenas dois arquivos novos foram adicionados ao repositório, de forma estritamente aditiva.
- arquivos criados:
  - `assets/js/kc-i18n.js` — módulo IIFE que expõe `window.KCi18n` com dicionário pt-BR de 120+ entradas em dot-notation, helper `KCi18n.t(key, params)` com interpolação `{chave}` e fallback à chave crua, helper `KCi18n.n(value, opts)` usando `Intl.NumberFormat` para moeda BRL, percentual e compacto, e utilitário `KCi18n.keys()` para auditoria de cobertura.
  - `tests/kc-i18n.test.js` — 35 testes cobrindo existência do módulo, todas as categorias do dicionário (`common`, `nav`, `form`, `error`, `feedback`, `time`, `empty`, `a11y`, `module`, `uxw`), interpolação de parâmetros, formatação numérica e auditoria estrutural do dicionário.
- estrutura do dicionário:
  10 categorias, 120+ entradas. Cada chave segue o padrão `categoria.nome` (ex.: `common.save` → `Salvar`, `a11y.close-modal` → `Fechar modal`, `module.compra-venda` → `Compra e Venda`). As entradas `module.*` estão alinhadas com `KC_CONSTANTS.MODULE_LABEL_MAP`.
- resultado dos testes:
  `52/52` suites, `565/565` testes (35 novos), hygiene `8.6.0`, sem regressão.
- validacao operacional:
  iteracao estritamente aditiva — zero alteracoes em arquivos preexistentes. Regressao completa mantida em `52/52` suites e `565/565` testes.
- validacao em navegador:
  o preview da PR ficou `READY` no deployment `dpl_FYkK82zN59o4A9R3d4vkC5tn7FiS`, protegido por Vercel Authentication. O deployment pos-merge da base ficou `READY` em `dpl_J3vaJRe5JYas7rdxARxLpTuXFG6g`. A producao em [www.kinocampus.com.br](https://www.kinocampus.com.br) respondeu `200` com versao canonica `8.6.0` intacta, confirmando que a iteracao aditiva nao afetou nenhum runtime publicado.
- PR \ commit \ deploy:
  PR `#284`, commit funcional `b434b0c` na branch `codex/v11-24-1-i18n-infra`, merge squash `b11cd3a` na base `kinocampus-V11.0-foundations`, preview `dpl_FYkK82zN59o4A9R3d4vkC5tn7FiS`, deployment pos-merge `dpl_J3vaJRe5JYas7rdxARxLpTuXFG6g`, producao `dpl_EsAskg2fjzpsjJwcprHJRHxsB6Vq` (promote from `dpl_J3vaJRe5JYas7rdxARxLpTuXFG6g`), todos confirmados em `12 de abril de 2026`.
- riscos residuais:
  o dicionario cobre as strings de UI mais frequentes mas nao e exaustivo. Strings especificas de cada pagina serao migradas em v11.24.2 e v11.24.3. O modulo e carregado de forma independente e nao afeta modulos existentes enquanto nao houver integracao explicita.

### Iteração `v11.24.2`

| Campo | Valor |
|---|---|
| Data | 12 de abril de 2026 |
| Branch | `codex/v11-24-2-i18n-core-components` |
| Tipo | feature (arquivos funcionais) |
| Escopo | aplicação do `KCi18n.t()` nos componentes core: notificações, autenticação e carregamento do módulo i18n nos 22 HTMLs |

- objetivo:
  conectar o módulo `kc-i18n.js` (v11.24.1) às duas primeiras superfícies de maior visibilidade — `kc-notifications.js` e `kc-auth.ui.js` — e registrar o script em todos os 22 HTMLs, garantindo disponibilidade de `window.KCi18n` em todas as páginas.
- arquivos alterados:
  - `assets/js/kc-i18n.js` — dicionário expandido com 11 chaves `notif.*` (dropdown de notificações: `notif.now`, `notif.minutes-ago`, `notif.hours-ago`, `notif.days-ago`, `notif.item-single`, `notif.item-plural`, `notif.marking`, `notif.mark-all`, `notif.clearing`, `notif.empty`, `notif.confirm-clear`) e 26 chaves `auth.*` (fluxos de login, cadastro, redefinição de senha, reenvio, logout e estado do perfil).
  - `assets/js/kc-notifications.js` — 10 strings hardcoded substituídas por `window.KCi18n.t()` com fallback literal (graceful degradation): `timeAgo()` (4 strings de tempo), `getDropdownCountLabel()` (2 strings de contagem), `buildDropdownHTML()` (título, loading, empty, mark-all, marking, clear, clearing) e `clearAllNotifications()` (confirm dialog).
  - `assets/js/kc-auth.ui.js` — 28 chamadas `setStatus()` e 1 `showToast()` + 2 strings de `userMeta` substituídas por `window.KCi18n.t()` com fallback literal, cobrindo todos os fluxos: login, cadastro, redefinição de senha, reenvio de confirmação, logout e estado do perfil no dropdown.
  - `tests/kc-notifications-dropdown.test.js` — adicionado `beforeAll` que carrega `kc-i18n.js` antes da suite, garantindo disponibilidade de `window.KCi18n` durante avaliação do módulo.
  - 22 arquivos HTML — adicionada tag `<script defer src="assets/js/kc-i18n.js"></script>` (ou `../assets/js/kc-i18n.js` para admin) imediatamente após `kc-constants.js` em todos os HTMLs da raiz e admin.
- resultado dos testes:
  `52/52` suites, `565/565` testes, hygiene `8.6.0`, sem regressão.
- validacao operacional:
  todos os fallbacks literais garantem graceful degradation — se `window.KCi18n` for undefined (modo teste isolado, carregamento fora de ordem), as strings originais são usadas sem erro. O padrão `window.KCi18n ? window.KCi18n.t('key') : 'fallback'` foi aplicado consistentemente em todos os pontos de uso.
- PR \ commit \ deploy:
  aguardando merge e validação de deployment (registrado no close-out).
- riscos residuais:
  os templates HTML de `kc-auth.ui.js` (linhas 403–407, `innerHTML`) e todas as strings de nível de página (títulos de página, metadata, OG tags, copies de feed) permanecem hardcoded — serão migrados em v11.24.3.

---

## 12. Backlog inicial candidato da v11

Este backlog é inicial e poderá ser refinado nas próximas iterações aprovadas:

1. **Drift documental**
   - `CHANGELOG.md` sem consolidação formal da v10
   - docs estruturais ainda ancoradas em estados v9
   - referências legadas tratadas como ativas

2. **Hotspots monolíticos**
   - `supabase.adapter.js`
   - `product.controller.js`
   - `kc-create-post.js`
   - `styles.css`

3. **Paridade entre equivalentes**
   - padrões replicados nos 6 módulos
   - padrões replicados nas 5 telas admin
   - diferenças entre local e Supabase

4. **Cobertura de regressão**
   - controllers críticos ainda dependem fortemente de smoke manual
   - pouca cobertura direta sobre interações visuais e fluxos de página

5. **Contrato banco ↔ frontend ↔ docs**
   - revisar RPC catalog, schema docs, migrations recentes e callers do frontend

6. **Hardening e QA real-device iOS/Safari**
   - validar em iPhone real os gestos de swipe horizontal do hero, `kc-ranking-users`, `kc-feed-tabs` e `kc-*-mobile-rail`
   - validar pinch-out após auto-zoom induzido por foco em input
   - revisar qualquer superfície restante com `touch-action` agressivo em modais, overlays e drawers

7. **Persistência incremental e revalidação silenciosa**
   - avaliar extensão segura do padrão de snapshot+SWR para contadores de comentários, analytics leves e painéis laterais que hoje ainda fazem rerender completo
   - definir TTL e chaves canônicas por superfície antes de ampliar o uso de `KCSessionStore`
   - manter separação entre cache de leitura, estado otimista e invalidação por ação do usuário

8. **Trilha futura de i18n, acessibilidade e UX Writing**
   - preparar a fase `v11.24.0` como planejamento-only, com `ETAPA 1`, `ETAPA 2` e `ETAPA 3` antes de qualquer código
   - mapear textos hardcoded, atributos `aria-*`, metadata e superfícies críticas para expansão textual
   - definir dicionário base de voz e tom em `pt-BR` antes da codificação das chaves de tradução

---

## 13. Limite desta entrega

Este documento não substitui a execução controlada da v11 em fatias pequenas.

Ele apenas formaliza:

- o método
- o escopo
- a governança
- a ordem de ataque
- os critérios de segurança de mudança

A execução já foi iniciada pela iteração `v11.1.0`, restrita ao baseline documental.
