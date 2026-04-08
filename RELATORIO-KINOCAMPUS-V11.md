# RELATÓRIO KINOCAMPUS v11

**Plano Diretor de Auditoria, Consistência, Hardening e Evolução Segura**

| Campo | Valor |
|---|---|
| Data de abertura | 08 de abril de 2026 |
| Linha-base | `kinocampus-V10.0-foundations` |
| Estado desta fase | execução iniciada; iteração `v11.1.0` concluída com baseline documental e sem mudanças funcionais |
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

1. Sincronizar a base `kinocampus-V10.0-foundations`.
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
  local concluída; faltará complementar a checagem do deploy publicado após merge da PR desta iteração.
- PR / commit / deploy:
  branch dedicada aberta para a iteração; PR, merge e metadados finais serão registrados no fechamento.
- riscos residuais:
  ainda existe dependência de cache de assets compartilhados em alguns navegadores, então a validação pós-merge deve conferir explicitamente a versão publicada do shell público.

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
