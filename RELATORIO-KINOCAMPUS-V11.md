# RELATÓRIO KINOCAMPUS v11

**Plano Diretor de Auditoria, Consistência, Hardening e Evolução Segura**

| Campo | Valor |
|---|---|
| Data de abertura | 08 de abril de 2026 |
| Linha-base | `kinocampus-V11.0-foundations` |
| Estado desta fase | execução iniciada; iterações `v11.1.0`, `v11.2.0`, `v11.2.1`, `v11.3.0`, `v11.4.0`, `v11.5.0`, `v11.6.0` e `v11.7.0` já registradas, com baseline documental, consistência do shell público, desbloqueio operacional do Vercel MCP no Codex, normalização dos feeds equivalentes, correção transversal do bootstrap de ranking dos módulos, hardening específico para gestos/zoom do iOS Safari e paridade endurecida do driver local frente ao contrato moderno da `KCAPI` |
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
- arquivos de teste em `tests`: `26`
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

A execução proposta da v11 será sequencial e conservadora.

| Fase | Objetivo | Tipo |
|---|---|---|
| v11.0 | baseline documental, inventário e backlog auditável | documentação |
| v11.1 | correção de drift entre docs, README, changelog, arquitetura e contratos | baixo risco |
| v11.2 | consistência de shells públicos, navegação, tema e busca | baixo a médio risco |
| v11.3 | normalização dos 6 módulos equivalentes de feed e filtros | médio risco |
| v11.4 | hardening de produto, criação, comentários e interações | médio risco |
| v11.5 | perfil, onboarding, settings e meus posts | médio risco |
| v11.6 | admin pós-v10: consolidação e redução de fallback | médio risco |
| v11.7 | adapters e fachada KCAPI: paridade, simplificação e contratos | médio a alto risco |
| v11.8 | Supabase/RPC/RLS/Edge Functions: revisão operacional e correções | alto risco controlado |
| v11.9 | testes, QA, changelog, fechamento e validação final da release | release gate |

### 8.1. Regra de fatiamento

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
  o preview Vercel validado no ciclo da PR `#236`, incluindo o deployment `dpl_8EXrmXSf9CFbPDBNBe97oN95XpQn`, respondeu `200 OK` para `index.html` e `profile.html`, confirmando publicação do bundle sem quebra geral. A rota `my-posts.html` permaneceu protegida por autenticação do preview na leitura remota, então essa checagem ficou limitada ao contrato estático/testado e aos caminhos públicos acessíveis pelo Vercel MCP.
- PR / commit / deploy:
  PR `#236`, com commit funcional `e762bd9` e commits documentais de fechamento na branch `codex/v11-7-0-local-adapter-parity`, além de preview validado no deployment `dpl_8EXrmXSf9CFbPDBNBe97oN95XpQn`, todos confirmados em `08 de abril de 2026`.
- riscos residuais:
  o endurecimento ficou contido ao driver local, mas `localCreatePost` ainda preserva um bloco redundante de normalização legado que não quebra os testes atuais. Como a rota de preview autenticada de `my-posts.html` não ficou acessível pelo fetch remoto, a confirmação final após merge deve incluir checagem publicada mínima de bundle e rota autenticada quando possível.

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
