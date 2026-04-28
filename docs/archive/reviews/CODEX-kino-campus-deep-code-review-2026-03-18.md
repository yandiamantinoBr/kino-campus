# 1. Sumário Executivo
- Baseline auditado: branch `kinocampus-V8.2-SANEAMENTO-QA`, commit `44f9ce8739a8d9795da7009c17cf79834384adce`, revisão executada em `2026-03-18`. A branch alvo não foi informada separadamente; a análise usou o estado atual do workspace.
- Stack real: frontend estático multipágina em HTML/CSS/JS vanilla, deploy no Vercel via [vercel.json#L2](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json#L2), backend principal em Supabase (Auth, Postgres, Storage, Realtime, RPCs e Edge Function) com camada de compatibilidade/local fallback via [kc-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js), [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js) e `data/database.json`.
- Diagnóstico geral: a casca pública do app sobe localmente e páginas como `index`, `create-post` e `product` renderizam sem erro fatal imediato; o estado de produção, porém, não pode ser tratado como “pronto” porque há drift entre cliente e políticas SQL, risco de lixo órfão em Storage, prova de QA incompleta e inconsistência entre CSP e handlers inline.
- Principais riscos reais:
  - `P0`: o cliente ainda lê `profiles.email` depois de a migration revogar esse `select`, criando risco direto de regressão em perfil/auth em banco atualizado.
  - `P0`: criação e exclusão de posts não limpam blobs do Supabase Storage, deixando mídia órfã e retenção indevida.
  - `P0`: a esteira de QA/release permanece incompleta; há checklist com conflito de merge e relatórios oficiais ainda marcados como `PENDENTE/BLOQUEADO`.
  - `P1`: CSP do Vercel já removeu `unsafe-inline` de `script-src`, mas a UI de banners admin ainda injeta `onclick` inline.
- Leitura executiva do cenário atual: a arquitetura-base é viável e há sinais claros de hardening bem direcionado no banco e no deploy, mas o sistema ainda está em fase de saneamento/hardening pré-liberação. O review anterior de três semanas atrás já está parcialmente superado; o código atual deve prevalecer como fonte de verdade.

# 2. Projeto: Identidade, Objetivo e Estado Atual
- `FATO`: o projeto é uma plataforma universitária web voltada à comunidade da UFG, com módulos explícitos para feed geral, compra e venda, caronas, moradia, eventos, oportunidades, achados e perdidos, perfis e administração; isso aparece nos entrypoints como [index.html](C:/Users/yan1n/Documents/GitHub/kino-campus/index.html), [compra-venda-feed.html](C:/Users/yan1n/Documents/GitHub/kino-campus/compra-venda-feed.html), [caronas-feed.html](C:/Users/yan1n/Documents/GitHub/kino-campus/caronas-feed.html), [moradia.html](C:/Users/yan1n/Documents/GitHub/kino-campus/moradia.html), [eventos.html](C:/Users/yan1n/Documents/GitHub/kino-campus/eventos.html), [oportunidades.html](C:/Users/yan1n/Documents/GitHub/kino-campus/oportunidades.html), [achados-perdidos.html](C:/Users/yan1n/Documents/GitHub/kino-campus/achados-perdidos.html) e [profile.html](C:/Users/yan1n/Documents/GitHub/kino-campus/profile.html).
- `HIPÓTESE FORTE`: o problema que o produto tenta resolver é conexão comunitária e utilidade prática dentro do campus, combinando descoberta, transação leve, reputação e moderação.
- `HIPÓTESE FORTE`: o estágio atual é de RC/hardening pré-produção, não de produto estabilizado. O próprio repositório mostra ciclos recentes de cleanroom, QA, hardening, admin RPC, busca analítica, banners, perfil/avatar e saved posts.
- `FATO`: o estado técnico atual é híbrido. Há suporte a modo local e a modo Supabase; em produção, o código tenta falhar de forma fechada se o driver não for Supabase em [kc-env.js#L118](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js#L118).
- `FATO`: as restrições aparentes são zero feature creep, preservação de compatibilidade legada onde já existe fallback, deploy estático simples no Vercel, dependência forte de policies/RLS do Supabase e operação ainda muito apoiada em QA manual/documentado.
# 3. Arquitetura Real do Sistema
- Mapa de pastas principal: [admin](C:/Users/yan1n/Documents/GitHub/kino-campus/admin), [assets](C:/Users/yan1n/Documents/GitHub/kino-campus/assets), [data](C:/Users/yan1n/Documents/GitHub/kino-campus/data), [docs](C:/Users/yan1n/Documents/GitHub/kino-campus/docs), [scripts](C:/Users/yan1n/Documents/GitHub/kino-campus/scripts), [supabase](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase) e [vercel.json](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json).
- Entrypoints e rotas: a app é multipágina, com home, páginas temáticas, detalhe, criação, perfil, callback de auth e rotas admin. O Vercel reescreve `/` para [index.html](C:/Users/yan1n/Documents/GitHub/kino-campus/index.html) e `/auth/callback` para [auth-callback.html](C:/Users/yan1n/Documents/GitHub/kino-campus/auth-callback.html) em [vercel.json#L4](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json#L4).
- Módulos principais:
  - Config/runtime: [kc-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js), [scripts/inject-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/scripts/inject-env.js), [.env.example](C:/Users/yan1n/Documents/GitHub/kino-campus/.env.example).
  - Auth/Supabase: [kc-supabase.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-supabase.client.js), [kc-auth.ui.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-auth.ui.js), [kc-auth-callback.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-auth-callback.js).
  - Dados e regras de app: [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js), [kc-profiles.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-profiles.client.js), [kc-search.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-search.js), [kc-banners.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-banners.js), [kc-core.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-core.js), [kc-utils.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-utils.js).
  - Controllers de página: [controllers](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers).
  - Banco, policies e funções: [supabase/migrations](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations), [supabase/manual](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/manual), [supabase/functions](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/functions).
  - QA e evidências: [docs/qa](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa).
- Dependências reais: não há `package.json` ativo na raiz do app; o único `package.json` encontrado está em [docs/legacy/backend-placeholder/package.json](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/legacy/backend-placeholder/package.json). O runtime depende do navegador, dos scripts estáticos e do projeto Supabase.
- Build/deploy/runtime:
  - `buildCommand`: [vercel.json#L2](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json#L2) executa `node scripts/inject-env.js`.
  - `outputDirectory`: [vercel.json#L3](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json#L3) aponta para `.`.
  - Injeção de env: [inject-env.js#L34](C:/Users/yan1n/Documents/GitHub/kino-campus/scripts/inject-env.js#L34) bloqueia execução local por padrão; [inject-env.js#L77](C:/Users/yan1n/Documents/GitHub/kino-campus/scripts/inject-env.js#L77) exige URL e chave pública; [inject-env.js#L146](C:/Users/yan1n/Documents/GitHub/kino-campus/scripts/inject-env.js#L146) substitui placeholders em [kc-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js).
- Diagrama textual dos módulos:
```text
HTML pages
  -> page controllers
  -> KCAPI / KCProfiles / KCSearch / KCBanners / KCCore / KCUtils
  -> KCSupabase
  -> Supabase Auth / Postgres / RPC / Storage / Realtime / Edge Functions

Vercel
  -> node scripts/inject-env.js
  -> static output "."
  -> CSP / rewrites / runtime headers
```
- Integrações externas confirmadas: Supabase Auth, tabelas/Postgres, Storage (`kino-media`), Realtime, RPCs admin, Edge Function de notificação em [notify-admin-reports-threshold/index.ts](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/functions/notify-admin-reports-threshold/index.ts) e hosting/heades no Vercel.
# 4. Fluxos Críticos
- **Auth / sessão**: objetivo é cadastro, login, callback e sincronização de perfil; caminho real passa por [kc-auth.ui.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-auth.ui.js), [kc-supabase.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-supabase.client.js), [auth-callback.html](C:/Users/yan1n/Documents/GitHub/kino-campus/auth-callback.html) e [kc-auth-callback.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-auth-callback.js); depende de env injetada, projeto Supabase e domínio institucional; ponto frágil principal é a hidratação/sync de `profiles` ainda depender de `email`; risco de regressão alto em login, profile page e guards após migrações de privacidade.
- **Carregamento de feed**: objetivo é listar posts, paginar, deduplicar e receber eventos realtime; caminho passa por controllers temáticos e [kc-feed.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/kc-feed.controller.js) chamando [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js) e render helpers em [kc-core.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-core.js)/[kc-utils.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-utils.js); depende de `posts`, `profiles`, `post_media`, comentários e votos; fragilidade principal é a complexidade compatível em selects e o tamanho dos módulos; risco de regressão médio-alto em paginação, hidratação e realtime.
- **Detalhe do item / comentários / votos / denúncia**: objetivo é abrir um post, comentar, votar e denunciar; caminho passa por [product.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/product.controller.js) e operações de [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js); depende de auth opcional, `comments`, `votes`, `reports` e perfis de autor; pontos frágeis são fallback excessivo, dependência de author profiles e duplicação de wiring realtime em `kc-core.js`; risco de regressão alto em persistência visual e comportamento pós-refresh.
- **Criação / edição / exclusão com mídia**: objetivo é publicar posts com ou sem imagem e depois removê-los; caminho passa por [create-post.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/create-post.controller.js) e [kc-api.client.js#L1691](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L1691) em diante; depende de auth, `posts`, `post_media`, bucket `kino-media` e policies de upload; ponto frágil real é a ausência de cleanup de Storage em rollback e delete; risco de regressão crítico para integridade e retenção de mídia.
- **Busca / filtros / analytics**: objetivo é descoberta de conteúdo e leitura de tendências; caminho passa por [kc-search.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-search.js), [search-results.html](C:/Users/yan1n/Documents/GitHub/kino-campus/search-results.html) e [admin-dashboard.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-dashboard.controller.js); depende de `search_queries` e RPCs analíticas; fragilidade é validação insuficiente em ambiente real e fallback de compatibilidade; risco de regressão médio.
- **Perfil / reputação / saved posts / avatar**: objetivo é mostrar sessão, dados do usuário, bio, avatar e itens salvos; caminho passa por [profile.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/profile.controller.js), [kc-profiles.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-profiles.client.js) e [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js); depende de `profiles`, `saved_posts`, Storage e migrations `v8.3.4.1`; pontos frágeis são `email` ainda selecionado e avatar depender de passo manual de policy; risco de regressão alto em perfil autenticado.
- **Denúncias / moderação / banners admin**: objetivo é receber denúncias, moderá-las e operar banners; caminho passa por [product.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/product.controller.js), [admin-reports.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-reports.controller.js), [admin-moderation.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-moderation.controller.js) e [admin-banners.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-banners.controller.js); depende de RPCs admin, `profiles.is_admin`, audit logs e CSP do Vercel; pontos frágeis são validação ao vivo pendente e `onclick` inline em banners; risco de regressão alto no painel admin.
- **Deploy / configuração runtime**: objetivo é servir app estática com env correta e headers restritivos; caminho passa por [vercel.json](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json), [scripts/inject-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/scripts/inject-env.js) e [kc-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js); depende do projeto Vercel e variáveis públicas do Supabase; pontos frágeis são mutação in-place de arquivo de runtime, falta de `.vercel/project.json` e ausência de validação live do preview/prod; risco de regressão alto em build, callback e CSP.

# 5. Inventário de Achados (Findings)
| ID | Severidade | Categoria | Título do problema | Evidência | Confiança | Impacto | Direção de correção | Como validar | Arquivos afetados |
|---|---|---|---|---|---|---|---|---|---|
| F-001 | P0 | Segurança / Privacidade / Contrato de dados | Frontend ainda seleciona `profiles.email` após hardening SQL revogar essa leitura | Estática: [v8.1.6.2#L16](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations/v8.1.6.2_reports_privacy_hardening.sql#L16) manda o frontend evitar `profiles.email`; [v8.1.6.2#L110](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations/v8.1.6.2_reports_privacy_hardening.sql#L110) faz `revoke select (email)`; o cliente ainda usa `.select(...email...)` em [kc-api#L2190](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L2190), [kc-api#L2256](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L2256), [kc-profiles#L174](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-profiles.client.js#L174), [kc-profiles#L239](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-profiles.client.js#L239) e [profile.controller#L852](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/profile.controller.js#L852) | FATO | Pode quebrar sync de perfil, tela de perfil e hidratação de autor em banco atualizado; também contradiz a intenção explícita de privacidade | Alinhar queries públicas/compat para não depender de `email`; derivar handle com campos permitidos ou com `auth.user.email` somente no contexto autenticado | Smoke autenticado real: signup, callback, login, perfil, comentários e leitura de autores sem erro `42501`/`permission denied` | [v8.1.6.2_reports_privacy_hardening.sql](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations/v8.1.6.2_reports_privacy_hardening.sql), [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js), [kc-profiles.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-profiles.client.js), [profile.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/profile.controller.js) |
| F-002 | P0 | Integridade de dados / Storage | Criação e exclusão de posts não removem blobs órfãos do Supabase Storage | Estática: upload usa path controlado em [kc-api#L993](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L993) e [kc-api#L1753](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L1753); rollback só apaga `posts` em [kc-api#L1718](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L1718); delete do post também só apaga linha em [kc-api#L1940](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L1940) | FATO | Retenção indevida de mídia, custo acumulado, inconsistência entre banco e bucket e risco de exposição residual de arquivos | Introduzir cleanup compensatório de Storage no fluxo de erro e no delete; definir origem confiável dos paths para remoção | Teste real: criar post com imagem, forçar falha entre upload e insert de `post_media`, depois deletar post e conferir bucket vazio para aquele `postId` | [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js) |
| F-003 | P0 | Release / QA / Governança | Prova de release continua incompleta e a checklist oficial está quebrada | Docs oficiais ainda em `PENDENTE/BLOQUEADO`: [report-v8.2.0.7-run1#L33](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.0.7-run1.md#L33) a [#L53](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.0.7-run1.md#L53), [bugs-v8.2#L13](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/bugs-v8.2.md#L13), [report-rls-smoke-2026-02-22#L23](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-rls-smoke-2026-02-22.md#L23); checklist com conflito de merge em [e2e-checklist#L12](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/e2e-checklist.md#L12) e [#L18](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/e2e-checklist.md#L18); URLs Vercel ainda placeholder em [e2e-checklist#L9](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/e2e-checklist.md#L9) | FATO | O projeto não tem evidência operacional suficiente para GO/NO-GO seguro; o material de QA pode induzir execução inconsistente | Fechar conflito, preencher ambiente alvo real e concluir rodada E2E + RLS + admin com evidências; tratar docs de QA como release artifact obrigatório | Executar e anexar evidências dos casos E2E 1–9, RLS 1–3 e smokes admin em preview/prod | [docs/qa/e2e-checklist.md](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/e2e-checklist.md), [docs/qa/report-v8.2.0.7-run1.md](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.0.7-run1.md), [docs/qa/bugs-v8.2.md](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/bugs-v8.2.md), [docs/qa/report-rls-smoke-2026-02-22.md](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-rls-smoke-2026-02-22.md) |
| F-004 | P1 | Segurança de frontend / Deploy | CSP do Vercel conflita com `onclick` inline no admin de banners | CSP sem `unsafe-inline` em [vercel.json#L13](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json#L13) e [vercel.json#L14](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json#L14); componente ainda renderiza `onclick="event.stopPropagation()"` em [admin-banners.controller#L175](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-banners.controller.js#L175) | FATO | Em ambiente Vercel com esses headers, a interação da área de ações pode falhar ou ficar inconsistente no painel admin | Remover handlers inline e bindar eventos por JS externo; revalidar a tela sob headers reais | Smoke no preview/prod: criar/editar/reordenar/excluir banner e monitorar console/network sob CSP real | [vercel.json](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json), [admin-banners.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-banners.controller.js) |
| F-005 | P2 | Versionamento / Rastreabilidade | Drift de versão entre README, CHANGELOG, módulos JS e migrations | README ainda fixa `8.2.2.0` em [README#L21](C:/Users/yan1n/Documents/GitHub/kino-campus/README.md#L21); `CHANGELOG` topo está em [CHANGELOG#L3](C:/Users/yan1n/Documents/GitHub/kino-campus/CHANGELOG.md#L3) `8.2.5.0`; módulos divergem: [kc-env#L29](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js#L29) `8.2.6.0`, [kc-api#L16](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L16) `8.2.2.0`, [kc-supabase#L19](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-supabase.client.js#L19) `8.2.2.0`, [kc-auth.ui#L16](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-auth.ui.js#L16) `8.3.1.0` | FATO | Reduz rastreabilidade, dificulta rollback e contamina QA/release docs com versão errada | Definir versão única por release, critério de bump e pontos obrigatórios de atualização | Validar que README, CHANGELOG top, módulos versionados e rodada QA carregam a mesma versão de release | [README.md](C:/Users/yan1n/Documents/GitHub/kino-campus/README.md), [CHANGELOG.md](C:/Users/yan1n/Documents/GitHub/kino-campus/CHANGELOG.md), [kc-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js), [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js), [kc-supabase.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-supabase.client.js), [kc-auth.ui.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-auth.ui.js) |
| F-006 | P2 | Arquitetura / Manutenibilidade | Arquivos centrais estão grandes demais e já mostram duplicação operacional | Tamanho observado: `kc-api.client.js` 3342 linhas, `kc-core.js` 4222, `product.controller.js` 2002, `profile.controller.js` 961; `kc-core.js` mantém estado de canal em [kc-core#L231](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-core.js#L231) com guard em [kc-core#L253](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-core.js#L253), sinal de wiring sensível já duplicado no arquivo | FATO | Alto custo de mudança, baixa testabilidade e maior chance de regressão lateral em fixes pequenos | Fatiar por bounded context após estabilizar P0/P1; deduplicar bootstrap/listeners e reduzir responsabilidade cruzada | Medir regressão por fluxo depois de extrair módulos menores; comparar comportamento do feed, votes, detail e profile | [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js), [kc-core.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-core.js), [product.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/product.controller.js), [profile.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/profile.controller.js) |
| F-007 | P2 | Operação / Storage / Migrations | Upload de avatar depende de passo manual fora da migration principal | A migration avisa que vai pular policies de avatar em [v8.3.4.1#L75](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations/v8.3.4.1_saved_posts_multi_profile_bio_avatar.sql#L75); a correção real está em [manual avatar policies#L5](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql#L5) em diante | FATO | Se o passo manual não foi executado no projeto real, avatar upload/update/delete quebra apesar de o código parecer pronto | Transformar o passo manual em etapa operacional obrigatória e verificável, ou consolidá-lo na esteira de deploy do banco | Testar avatar upload/update/delete em projeto real e auditar presença das 3 policies no `storage.objects` | [v8.3.4.1_saved_posts_multi_profile_bio_avatar.sql](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations/v8.3.4.1_saved_posts_multi_profile_bio_avatar.sql), [v8.3.4.1_profile_avatar_storage_policies.sql](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql) |
| F-008 | P2 | Testabilidade / QA | Não existe suíte automatizada ativa na raiz do app | O único `package.json` encontrado está em [backend-placeholder/package.json](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/legacy/backend-placeholder/package.json); a raiz do projeto auditado não contém harness ativo de testes automatizados | FATO | A detecção de regressão depende quase toda de checagem manual e revisão estática | Introduzir harness mínima de smoke/regressão compatível com stack atual antes de expandir escopo | Validar pipeline capaz de rodar smoke público, smoke autenticado e checagem de build/CSP | [docs/legacy/backend-placeholder/package.json](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/legacy/backend-placeholder/package.json), [docs/qa](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa) |
| F-009 | P3 | Consistência visual / UX | Theme boot não está aplicado de forma consistente entre páginas | Páginas com `kc-theme-boot.js` sem o CSS correspondente: [create-post.html#L7](C:/Users/yan1n/Documents/GitHub/kino-campus/create-post.html#L7), [search-results.html#L8](C:/Users/yan1n/Documents/GitHub/kino-campus/search-results.html#L8), [auth-callback.html#L7](C:/Users/yan1n/Documents/GitHub/kino-campus/auth-callback.html#L7); páginas de referência incluem ambos em [index.html#L7](C:/Users/yan1n/Documents/GitHub/kino-campus/index.html#L7) e [profile.html#L6](C:/Users/yan1n/Documents/GitHub/kino-campus/profile.html#L6) | FATO | Risco de FOUC e inconsistência de tema, especialmente em callback e resultados de busca | Padronizar o boot de tema nas páginas que já usam o JS correspondente | Abrir essas páginas em cold load desktop/mobile e comparar first paint com páginas já alinhadas | [create-post.html](C:/Users/yan1n/Documents/GitHub/kino-campus/create-post.html), [search-results.html](C:/Users/yan1n/Documents/GitHub/kino-campus/search-results.html), [auth-callback.html](C:/Users/yan1n/Documents/GitHub/kino-campus/auth-callback.html), [index.html](C:/Users/yan1n/Documents/GitHub/kino-campus/index.html), [profile.html](C:/Users/yan1n/Documents/GitHub/kino-campus/profile.html) |

# 6. Padrões a Manter
| Padrão | Por que deve ser mantido | Risco de quebrá-lo | Evidência |
|---|---|---|---|
| Fail-closed de produção exigindo Supabase | Evita fallback silencioso para modo local em ambiente produtivo | Produção servir dados errados ou fluxo local mascarar falhas reais | [kc-env#L118](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js#L118) |
| Centralização de auth/sessão em `kc-supabase.client.js` com evento `kc:authchange` | Dá um ponto único para sessão, sign-out e atualização de UI | Duplicar estado de auth entre páginas e criar bugs de sessão difícil de rastrear | [kc-supabase.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-supabase.client.js) |
| Uso de RPCs e checks de persistência no admin | Reduz confiança em lógica client-side e confirma efeito real da moderação | Reintroduzir client-side trust e falsos positivos de sucesso em ações sensíveis | [v8.2.9.1_admin_moderation_and_reports_rpc.sql](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations/v8.2.9.1_admin_moderation_and_reports_rpc.sql), [admin-reports.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-reports.controller.js) |
| Path controlado de upload `post-media/{userId}/{postId}/...` | Melhora organização do bucket e potencial de limpeza por escopo | Voltar a paths fracos dificulta cleanup e hardening de policies | [kc-api#L993](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js#L993) |
| Paginação com dedup e buffer realtime no feed | Ajuda a manter UX estável sob atualização em tempo real | Duplicação de cards, flashing de lista e inconsistência de ordem | [kc-feed.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/kc-feed.controller.js) |
| Hardening de Edge Function com HMAC e cooldown | Protege gatilhos de notificação e reduz spam operacional | Alertas indevidos ou endpoint acionável sem autenticação adequada | [notify-admin-reports-threshold/index.ts](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/functions/notify-admin-reports-threshold/index.ts) |
| Wrapper diagnóstica do create-post | Facilita investigação sem reescrever fluxo | Perder telemetria local importante em um fluxo já sensível | [create-post.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/create-post.controller.js) |

# 7. Padrões a Alterar
| Anti-pattern | Por que é problema | Impacto | Direção recomendada | Esforço estimado | Risco de mexer |
|---|---|---|---|---|---|
| God files em `kc-api.client.js`, `kc-core.js` e controllers grandes | Misturam responsabilidades, compat legado e wiring de UI | Aumenta regressão lateral e dificulta revisão/teste | Fatiar por domínio depois de fechar P0/P1, com contrato explícito por módulo | Alto | Médio |
| Contrato cliente/banco divergente | Código pede campos que a policy/migration proíbe | Quebra runtime em ambiente correto e enfraquece privacidade | Tratar migrations/policies como contrato dominante e alinhar seleções do cliente | Médio | Baixo |
| Passos manuais de banco fora da esteira principal | Estado do ambiente real pode divergir do repositório sem sinal claro | Funcionalidade “parece pronta”, mas falha em produção | Transformar passo manual em checklist bloqueante ou automação de deploy | Médio | Baixo |
| Mistura de CSP estrita com handlers inline | Política e implementação puxam para direções opostas | Quebra em preview/prod sem falhar localmente | Padronizar binding externo por JS e revisar páginas admin sob headers reais | Baixo | Baixo |
| Docs/versionamento como “fonte” concorrente do código | README/CHANGELOG passam a contradizer o runtime | Ruído em QA, release e suporte | Definir versão única e ritual de bump/documentação por release | Baixo | Baixo |

# 8. Segurança, Dados e Governança Técnica
- `Auth`: `FATO` a sessão está centralizada em [kc-supabase.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-supabase.client.js) e o callback está separado em [kc-auth-callback.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-auth-callback.js); `HIPÓTESE FORTE` a validação ponta a ponta do callback ainda depende do projeto Supabase real e de uma conta institucional.
- `Sessão`: `FATO` o shell público sobe localmente e a tela admin de banners bloqueia corretamente o modo local com mensagem de dependência de Supabase; isso é bom como contenção, mas não substitui prova de sessão real.
- `RLS / policies`: `FATO` houve hardening relevante em reports/admin e em `profiles.is_admin`, inclusive com RPCs e guard trigger em [v8.2.10.4](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations/v8.2.10.4_profiles_is_admin_guard.sql) e hotfix em [v8.2.10.5](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations/v8.2.10.5_profiles_is_admin_guard_hotfix.sql); `FATO` também existe o drift de `profiles.email`, que hoje é o maior risco de contrato cliente/banco.
- `Storage`: `FATO` o bucket `kino-media` e paths controlados são uma boa base, mas faltam cleanup transacional/compensatório de mídia de posts e há dependência manual para avatar policies.
- `Segredos`: `NÃO VERIFICADO` de forma operacional no Vercel; nos arquivos auditados só aparecem placeholders e chaves públicas esperadas em [kc-env.js#L48](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js#L48), [.env.example#L29](C:/Users/yan1n/Documents/GitHub/kino-campus/.env.example#L29) e [inject-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/scripts/inject-env.js).
- `CSP / CORS`: `FATO` a CSP está mais segura que no review antigo, com `script-src` sem `unsafe-inline` em [vercel.json#L14](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json#L14); `HIPÓTESE FORTE` o admin de banners sofre sob essa política por ainda depender de inline handler; `NÃO VERIFICADO` o comportamento CORS real porque o projeto Vercel/Supabase não estava acessível.
- `Surface de ataque`: fluxos mais sensíveis hoje são auth callback, upload de mídia, denúncia/moderação admin, profile/avatar e busca analítica. O uso de RPCs admin e HMAC na Edge Function é um bom limitador, mas as partes de Storage e contrato de perfil ainda são superfícies frágeis.
- `Privacidade e integridade de dados`: o hardening de privacidade aponta na direção correta, mas o cliente não foi totalmente adaptado; a integridade hoje sofre mais por blobs órfãos e por passos manuais de banco do que por falta total de política.
- `Moderação / admin`: a base SQL parece mais madura que o frontend; o gargalo atual é validação operacional real e aderência da UI aos headers/policies já definidos.
# 9. QA, Testes e Observabilidade
- O que existe: kit de QA manual relativamente rico em [docs/qa](C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa), matriz de páginas, relatórios de rodada, diagnóstico de create-post e checagens de persistência em telas admin.
- O que falta: suíte automatizada ativa, pipeline de release, URLs reais de preview/preprod preenchidas, smoke autenticado real, RLS smoke executado no banco alvo, validação de CSP sob headers reais e coleta centralizada de logs.
- Gaps críticos: o próprio repositório registra que E2E 1–9 e RLS 1–3 seguem `BLOQUEADO/PENDENTE`; portanto a cobertura atual dos fluxos críticos é insuficiente para cravar estabilidade operacional.
- Smoke tests recomendados: signup institucional, callback, login/logout, criação de post com e sem imagem, detalhe do post, comentário, voto, denúncia, moderação admin, banners admin sob CSP, edição de perfil, upload de avatar e saved posts.
- Testes de regressão recomendados: ausência de `select email` em queries públicas, cleanup de Storage em rollback/delete, avatar policies presentes no ambiente real, busca + analytics admin, realtime/votos sem duplicação visual e compatibilidade de versão/documentação após cada release.
- Observabilidade insuficiente: não há evidência de logging central, tracing, monitoramento de frontend ou runtime logs do Vercel no material disponível; a Edge Function tem estrutura própria, mas o restante do sistema depende demais de console e QA manual.
- Execução prática desta revisão: houve smoke local de `index.html`, `create-post.html` e `product.html?id=1` sem erro fatal imediato; isso confirma boot básico do shell, não a saúde do backend real.

# 10. Prioridades Recomendadas
- `P0 imediato`: alinhar cliente ao hardening de `profiles.email` (F-001), fechar cleanup de Storage para posts com mídia (F-002) e completar/normalizar a prova de release com checklist sem conflito e rodada real concluída (F-003).
- `P1 curto prazo`: remover handlers inline do admin de banners e revalidar a tela sob CSP real do Vercel (F-004).
- `P2 médio prazo`: unificar versionamento e rastreabilidade de release (F-005), reduzir acoplamento/god files e duplicação operacional (F-006), tratar avatar policies como requisito operacional verificável (F-007) e criar harness mínima de testes automatizados (F-008).
- `P3 backlog / pós-saneamento`: padronizar theme boot entre páginas e revisar inconsistências visuais menores (F-009).

# 11. Lacunas de Verificação
- Projeto Supabase real indisponível: faltou acesso ao projeto, credenciais operacionais e/ou SQL Editor; isso impediu validar RLS, callback real, avatar policies aplicadas e runtime das queries; confirma-se com acesso ao dashboard/CLI e execução dos smokes SQL e autenticados.
- Projeto Vercel real indisponível: não havia `.vercel/project.json` nem acesso operacional ao projeto; isso impediu confirmar preview URL, headers ativos em produção, runtime logs e build real; confirma-se com acesso ao projeto Vercel ou export das configs/logs.
- Contas reais de usuário/admin indisponíveis: isso impediu validar moderação, login institucional, banners admin, reputação e fluxos protegidos; confirma-se com credenciais de teste controladas.
- Logs de execução e telemetria ausentes: não foi possível correlacionar erros de ambiente, requests e comportamento do frontend fora do smoke local; confirma-se com runtime logs do Vercel, logs do Supabase e eventualmente instrumentação adicional.
- Review anterior desatualizado: ele foi útil só como contexto histórico. Já não representa o estado atual em pontos como `.env.example` existente, remoção de `unsafe-inline` de `script-src` e rollback parcial do create-post.

# 12. Context Pack para Próximos Prompt-Mestres
- **Identidade do projeto**: Kino Campus é uma plataforma web universitária multipágina para comunidade UFG, com foco em descoberta, troca, utilidade prática e moderação.
- **Stack**: HTML/CSS/JS vanilla, deploy estático no Vercel, Supabase para Auth/Postgres/Storage/Realtime/RPCs/Edge Functions.
- **Objetivo**: manter um hub comunitário com feed geral e temático, detalhe de item, criação de post, perfil, denúncia, administração e analytics de busca.
- **Estado atual**: shell público sobe localmente; backend real continua parcialmente não verificado; release safety está limitada por P0 de contrato de perfil, Storage e QA.
- **Invariantes arquiteturais**: produção não pode cair em fallback local; SQL/policies mandam mais que docs; admin sensível deve continuar por RPC/policy server-side; paths de Storage devem continuar escopados por usuário/post.
- **Restrições absolutas**: zero feature creep, proteger backward compatibility apenas quando já existente, não rebaixar CSP/RLS para “fazer funcionar”, não reintroduzir client-side trust em moderação/admin.
- **Arquivos críticos**: [kc-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js), [kc-supabase.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-supabase.client.js), [kc-api.client.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js), [kc-core.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-core.js), [create-post.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/create-post.controller.js), [product.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/product.controller.js), [profile.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/profile.controller.js), [admin-reports.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-reports.controller.js), [admin-banners.controller.js](C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-banners.controller.js), [vercel.json](C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json), [inject-env.js](C:/Users/yan1n/Documents/GitHub/kino-campus/scripts/inject-env.js), [supabase/migrations](C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations).
- **Fluxos críticos**: auth/callback, feed/paginação/realtime, detalhe/comentário/voto/denúncia, create/delete com mídia, perfil/avatar/saved posts, admin reports/moderation/banners, deploy/runtime/config.
- **Comandos úteis**: `python -m http.server 5500`, `node scripts/inject-env.js`, `git rev-parse HEAD`, `Select-String -Path <arquivos> -Pattern <termos>`, smoke browser local nas páginas HTML.
- **Env vars por nome**: `KC_SUPABASE_URL`, `KC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLIC_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `KC_ALLOW_LOCAL_INJECT`.
- **Riscos conhecidos**: queries públicas ainda pedindo `profiles.email`, Storage órfão de mídia, checklist QA quebrada/incompleta, CSP vs inline handler, avatar policy manual, drift de versionamento.
- **Definition of Done base**: código alinhado com policies reais; sem regressão de auth/feed/detail/create/profile/admin; sem console/network error crítico; QA real anexada; versão única coerente em docs e runtime; nenhuma mídia órfã no fluxo tocado.
- **Checklist anti-regressão**: validar login/callback, perfil sem `email` público, create/delete com limpeza de Storage, comment/vote/report persistentes, admin reports/banners sob CSP, avatar upload/delete com policies reais, build do Vercel com env injetada e docs QA atualizadas.
- **Formato de microtarefas**: “Objetivo”, “Escopo explícito”, “Arquivos-alvo”, “Invariantes a preservar”, “Risco principal”, “Validação mínima”, “Evidência esperada”, “Sem feature creep”.
- **Formato de changelog/versionamento**: uma versão de release por rodada; bump sincronizado em README, topo do CHANGELOG e módulos versionados; mencionar migrations aplicadas; registrar QA run associada; não deixar versões cruzadas em comentários, UI e docs.
# 13. Apêndice Estruturado (OBRIGATÓRIO)
```yaml
project:
  name: "Kino Campus"
  objective: "Plataforma universitária da comunidade UFG para feed, utilidade prática, economia circular, reputação e moderação."
  stage: "RC / hardening pré-produção (hipótese forte)"
  stack:
    - "HTML estático"
    - "CSS"
    - "JavaScript vanilla modular"
    - "Vercel"
    - "Supabase Auth"
    - "Supabase Postgres"
    - "Supabase Storage"
    - "Supabase Realtime"
    - "Supabase RPC / Edge Functions"
  deploy: "Vercel via buildCommand `node scripts/inject-env.js` e outputDirectory `.`"
  database: "Supabase Postgres com migrations em C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations"
  auth: "Supabase Auth com callback em /auth/callback"
  storage: "Supabase Storage, bucket `kino-media`"

current_state:
  working:
    - "Shell público sobe localmente"
    - "index.html, create-post.html e product.html renderizam no smoke local"
    - "Guard de produção exige driver Supabase"
    - "Base SQL de admin/moderação/hardening existe"
  broken_or_unverified:
    - "Queries públicas ainda selecionam profiles.email após revoke"
    - "Cleanup de Storage para posts não está completo"
    - "QA oficial e RLS smoke seguem pendentes/bloqueados"
    - "Painel admin de banners tem inline handler incompatível com CSP"
    - "Avatar policies podem depender de passo manual não executado"
    - "Preview/prod Vercel e projeto Supabase não foram validados diretamente"
  top_risks:
    - "Drift cliente x policies SQL"
    - "Mídia órfã no Storage"
    - "Ausência de prova operacional de release"
    - "Drift de versionamento/documentação"

architecture:
  critical_files:
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-env.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-supabase.client.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-api.client.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/kc-core.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/create-post.controller.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/product.controller.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/profile.controller.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-reports.controller.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-banners.controller.js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/vercel.json"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/scripts/inject-env.js"
  critical_dirs:
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/admin"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/migrations"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/manual"
    - "C:/Users/yan1n/Documents/GitHub/kino-campus/supabase/functions"
  critical_flows:
    - "auth/session/callback"
    - "feed/pagination/realtime"
    - "post detail/comment/vote/report"
    - "create/delete post with media"
    - "profile/avatar/saved posts"
    - "admin reports/moderation/banners"
    - "deploy/runtime/env injection"
  invariants:
    - "Production must not silently use local fallback"
    - "Policies/RLS are source of truth over docs"
    - "Sensitive admin actions stay server-enforced"
    - "Storage paths stay scoped by user/post"
    - "No feature creep during fixes"

quality:
  test_gaps:
    - "No active automated test suite in app root"
    - "Official E2E and RLS reports remain pending/blocked"
    - "No live preview/prod smoke evidence attached"
  observability_gaps:
    - "No centralized frontend/runtime logs in available material"
    - "No Vercel runtime log access"
    - "No production/preview request tracing"
  security_gaps:
    - "Client still requests revoked profile email column"
    - "Storage cleanup missing for post media"
    - "Inline handler remains under strict CSP"
    - "Avatar policy application can drift by manual step"
  maintainability_gaps:
    - "Very large multi-responsibility JS files"
    - "Version/documentation drift"
    - "Compatibility branches piling up without clear retirement boundary"

execution_constraints:
  no_feature_creep: true
  protect_backward_compat: true
  protect_secrets: true
  protect_rls: true
  review_before_change: true

prompt_building_blocks:
  anti_regression_rules:
    - "Never reintroduce public dependence on profiles.email"
    - "Never weaken CSP/RLS to bypass UI bugs"
    - "Always validate Storage cleanup when touching media flows"
    - "Preserve production fail-closed behavior for Supabase driver"
    - "Update QA evidence and version metadata together"
  definition_of_done:
    - "Target flow works in local and preview/prod as applicable"
    - "No critical console/network/runtime errors"
    - "Policies and client queries are aligned"
    - "QA evidence attached"
    - "Version strings and changelog synchronized"
  validation_checklist:
    - "Auth signup/callback/login/logout"
    - "Create post with and without image"
    - "Detail/comment/vote/report"
    - "Profile update and avatar upload/delete"
    - "Admin reports and banners under real CSP"
    - "RLS negative smoke"
    - "No orphan files in Storage"
  microtask_template:
    - "Objective"
    - "Explicit scope"
    - "Files in play"
    - "Invariants to preserve"
    - "Primary risk"
    - "Validation plan"
    - "Expected evidence"
    - "No feature creep note"
  versioning_rules:
    - "One release, one canonical version"
    - "README, CHANGELOG top and versioned JS modules must agree"
    - "Mention related migration IDs"
    - "Tie each release to a QA run/evidence bundle"
```
