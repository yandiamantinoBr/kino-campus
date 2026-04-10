# RELATÓRIO KINOCAMPUS v11

**Plano Diretor de Auditoria, Consistência, Hardening e Evolução Segura**

| Campo | Valor |
|---|---|
| Data de abertura | 08 de abril de 2026 |
| Linha-base | `kinocampus-V11.0-foundations` |
| Estado desta fase | execução iniciada; iterações `v11.1.0`, `v11.2.0`, `v11.2.1`, `v11.3.0`, `v11.4.0`, `v11.5.0`, `v11.6.0`, `v11.7.0`, `v11.8.0`, `v11.9.0`, `v11.10.0`, `v11.11.0` e `v11.11.1` já registradas, com baseline documental, consistência do shell público, desbloqueio operacional do Vercel MCP no Codex, normalização dos feeds equivalentes, correção transversal do bootstrap de ranking dos módulos, hardening específico para gestos/zoom do iOS Safari, paridade endurecida do driver local frente ao contrato moderno da `KCAPI`, fechamento da duplicação residual em `localCreatePost`, introdução de hidratação persistente com revalidação silenciosa em ranking e votos, extensão controlada do mesmo padrão para analytics/comentários da página de produto, limpeza estrutural de `kc-comments.js`, reformulação do roadmap remanescente da v11 em uma sequência executável contínua e avanço da macrofase de conta/onboarding/settings até a hidratação social determinística de `account-setup` |
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
- arquivos de teste em `tests`: `35`
- migrations em `supabase/migrations`: `77`

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
| produto, comentários, ranking, votos e persistência incremental | `v11.9.0`, `v11.10.0`, `v11.11.0`, `v11.13.0`, `v11.13.1` | parcialmente coberto; o residual imediato de notificações e popovers foi fechado, restando apenas novas subfatias se surgir bug concreto |
| perfil e listagens do usuário | `v11.14.0` | iniciado com normalização de rotas humanas de detalhe entre perfil e `my-posts` |
| conta, onboarding e settings | `v11.15.0`, `v11.15.1`, `v11.15.2` | coberto até o fechamento seguro do preview e da hidratação social do onboarding; próximos avanços só se surgir bug concreto ou novo objetivo de produto |
| admin pós-v10 | `v11.16.0`, `v11.17.0` | coberto no shell e na primeira redução de fallback implícito, com `banners` alinhado ao contrato moderno de acesso admin |
| adapters e fachada `KCAPI` | `v11.7.0`, `v11.8.0` | parcialmente coberto; ainda falta simplificação mais profunda com `supabase.adapter.js` |

### 8.2. Sequência remanescente obrigatória da v11

Atualização de status em `09 de abril de 2026`: a fase `v11.12.0` foi executada no eixo de criação de publicação e fechada na PR `#245`. A macrofase `v11.13.x` foi fechada em duas fatias complementares: `v11.13.0`, focada no dropdown de notificações, e `v11.13.1`, focada no residual remanescente de popovers/interações da página de produto, concluída na PR `#249`. A fase `v11.14.0` foi concluída na PR `#251`, alinhando `profile` e `my-posts` à rota canônica `_product.html` para navegação humana de detalhe. A fase `v11.15.0` foi concluída na PR `#253`, alinhando o preview de contato em `settings` ao mesmo helper canônico de detalhe. A fase `v11.15.1` foi concluída na PR `#255`, alinhando a prévia de contato de `account-setup` ao `buildContactAction` e ao toggle de contato público. A fase `v11.15.2` foi concluída na PR `#257`, tornando determinística a hidratação de redes sociais e visibilidade no onboarding. A fase `v11.16.0` foi concluída na PR `#259`, unificando o preload do shell administrativo entre as 5 telas admin. A fase `v11.17.0` foi concluída na PR `#261`, alinhando `admin-banners.controller.js` ao contrato moderno de acesso admin e removendo o fallback que carregava a tela sem sessão validada. A próxima sequência obrigatória passa a ser `v11.18.0`.

| Iteração-alvo | Objetivo principal | Superfícies foco | Saída esperada |
|---|---|---|---|
| `v11.15.0` | iniciar o fechamento de conta, onboarding e settings | `settings.html`, `account-setup.html`, shareds de conta/perfil | preview de contato e rota canônica inicial alinhados ao contrato atual |
| `v11.15.1` | continuar a rodada de conta, onboarding e settings | `settings.html`, `account-setup.html`, shareds de conta/perfil | preview do onboarding alinhado ao CTA real e ao toggle de contato público |
| `v11.15.2` | aprofundar a rodada de conta, onboarding e settings | `settings.html`, `account-setup.html`, shareds de conta/perfil | onboarding e preferências alinhados ao contrato atual |
| `v11.16.0` | iniciar a consolidação do admin pós-v10 | `admin/*.html`, `admin-shell.js`, `admin-shell.css`, listas, modais e busca | simetria de shell e UX admin endurecida |
| `v11.17.0` | fechar a primeira rodada do admin pós-v10 e reduzir fallback excessivo | controllers admin, fluxos de paginação, export, feedback e contratos internos | admin mais previsível e menos dependente de fallback implícito |
| `v11.18.0` | aprofundar a rodada de contratos entre `KCAPI` e adapters | `kc-api.client.js`, `supabase.adapter.js`, `local.adapter.js`, consumers críticos | paridade real entre contratos remoto/local e redução de drift |
| `v11.19.0` | revisar Supabase operacional | migrations, RPCs, `search_path`, grants, RLS, docs de banco | camada Supabase auditada e alinhada à base atual |
| `v11.20.0` | revisar Edge Functions, storage e invariantes de deploy | `supabase/functions/*`, templates, storage, envs, docs operacionais | trilha infra/app coerente entre código, deploy e banco |
| `v11.21.0` | executar o release gate final da v11 | testes, QA, changelog final, documentação, drift de versão canônica `8.6.0` | fechamento da rodada da v11 com checklist final completo |

### 8.3. Regra de progressão entre fases

- a próxima iteração só começa quando a anterior tiver PR mergeada, branch removida, base puxada e deploy validado
- cada iteração acima deve atualizar este relatório com o status da fase e redefinir explicitamente a próxima
- se uma fase descobrir um escopo maior do que o previsto, ela deve ser repartida em `v11.x+0.1` documental ou em uma nova iteração imediatamente subsequente, nunca absorvida silenciosamente
- a conclusão da v11 só ocorre após `v11.21.0` ou equivalente posterior que substitua formalmente essa fase final dentro deste relatório

### 8.4. Regra de fatiamento

Cada fase acima ainda pode se desdobrar em várias PRs pequenas. Nenhuma PR deve misturar:

- mudança pública + mudança admin + mudança banco, se não forem inseparáveis
- correção de bug com refactor estrutural amplo
- atualização documental solta sem vínculo com o estado real da iteração

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
