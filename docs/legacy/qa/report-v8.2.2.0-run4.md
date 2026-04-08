# QA Run Report - Kino Campus V8.2.2.0 - Run 4

## 1) Metadados
- Data (AAAA-MM-DD): 2026-03-19
- Hora aproximada: 05:00-08:50 BRT
- Ambiente principal da rodada: Preview publicado + promote para producao com smoke final
- Preview inicial da rodada: [kino-campus-nq1v16jrm-yannakamurabrs-projects.vercel.app](https://kino-campus-nq1v16jrm-yannakamurabrs-projects.vercel.app)
- Preview corrigido apos patch admin: [kino-campus-jxqai7y78-yannakamurabrs-projects.vercel.app](https://kino-campus-jxqai7y78-yannakamurabrs-projects.vercel.app)
- Deploy preview validado: `dpl_8nxvHWqrXzfDiKksh9cGgLzxPLXn`
- Deploy de producao promovido: `dpl_7iVF3EuEhnRVjvvhMDFuUMnKckmD`
- URL final de producao: [www.kinocampus.com.br](https://www.kinocampus.com.br)
- Projeto Vercel: `prj_PTFmR4f3A1aAHV5mgXa24svL8umB`
- Projeto Supabase: `wacyrkwhkvzwkqpolrbg`
- Branch local testada: `codex/deep-review-it5-auth-qa-and-promote`
- Base funcional herdada: `841a627`
- Navegador + versao: Playwright MCP em Chromium compativel; user agent observado `HeadlessChrome/146.0.0.0`
- Dispositivo: Desktop Windows
- Viewport aproximado: `1280x720`
- Tester (nome): Codex

## 2) Resultado geral
- Status do Run 4: (X) GO  ( ) NO-GO
- Resumo curto:
  - A rodada autenticada completa foi executada com conta comum e conta admin reais/controladas no ambiente real.
  - Preview-first confirmou login, create post com 1/2/5 imagens, comentario, voto, denuncia, avatar upload/delete, admin reports, admin banners, moderacao e cleanup real no Supabase Storage.
  - A rodada encontrou um falso negativo de persistencia em `admin/reports`, corrigiu o controller em [admin-reports.controller.js](/C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-reports.controller.js) e revalidou a correcao em um preview novo antes do promote.
  - RLS Tests 2 e 3 foram exercitados com JWT real de sessao autenticada e nao persistiram mutacoes indevidas.
  - A producao foi promovida e recebeu smoke final bem-sucedido com perfil publico corrigido, login, create/delete controlado e fluxo admin essencial.

---

## 3) Evidencias centrais
| Item | Status | Evidencia | Observacoes |
|---|---|---|---|
| Login conta comum no preview | PASSOU | [run4-login-common.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run4/run4-login-common.png) | Sessao autenticada com conta comum controlada. |
| Create post com 1/2/5 imagens, comentario e voto | PASSOU | [run4-feed-vote-and-posts.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run4/run4-feed-vote-and-posts.png) | Posts de QA criados, comentados e votados com cleanup posterior validado em banco/Storage. |
| Avatar upload funcional | PASSOU | [run4-profile-avatar-uploaded.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run4/run4-profile-avatar-uploaded.png) | Upload salvo no app e confirmado em `profiles.avatar_url` + `storage.objects`; cleanup posterior zerou o estado. |
| Admin reports encontrou falso negativo de persistencia | FALHOU E FOI CORRIGIDO | [run4-admin-reports-persistence-warning.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run4/run4-admin-reports-persistence-warning.png) | O fechamento persistiu no banco, mas a UI mostrou aviso incorreto; o controller foi corrigido nesta mesma rodada. |
| Admin banners no preview | PASSOU | [run4-admin-banners-reactivated.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run4/run4-admin-banners-reactivated.png) | Toggle inativo/ativo voltou a persistir sem regressao de CSP. |
| Admin banners em producao apos promote | PASSOU | [run4-production-admin-banners.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run4/run4-production-admin-banners.png) | Smoke admin essencial executado na producao promovida. |
| Cleanup consolidado dos posts de QA | PASSOU | Consulta MCP no Supabase | `remaining_posts = 0`, `remaining_post_media = 0`, `remaining_storage_objects = 0`. |
| Cleanup consolidado do avatar de QA | PASSOU | Consulta MCP no Supabase | `avatar_url = null`, `avatar_storage_objects = 0`. |
| RLS Test 2 (`posts.author_id`) | PASSOU | Resposta HTTP `403` + verificacao MCP | A mutacao violou policy de `posts` e nao persistiu. |
| RLS Test 3 (`profiles.full_name` de terceiro) | PASSOU | Resposta vazia + verificacao MCP | O update nao persistiu no perfil alvo. |
| Promote para producao | PASSOU | Deploy `dpl_7iVF3EuEhnRVjvvhMDFuUMnKckmD` | Alias ativo em [www.kinocampus.com.br](https://www.kinocampus.com.br). |

---

## 4) Execucao detalhada
### Conta comum - preview inicial
- Login autenticado com sucesso.
- Posts de QA criados:
  - `28f57dce-d684-4820-a0ba-2d1e9bec1819` - `TESTE QA V8.2.2.0 RUN4 20260319-050958 - 1 imagem`
  - `8eb144fb-e09a-44fb-bde8-f1ca57dd8967` - `TESTE QA V8.2.2.0 RUN4 20260319-051225 - 2 imagens`
  - `d5c0d85a-e521-4be1-a529-b948fb34af86` - `TESTE QA V8.2.2.0 RUN4 20260319-051324 - 5 imagens`
- A contagem de `public.post_media` ficou coerente com 1/2/5 imagens e o Storage criou 8 objetos sob `post-media/966dd3d0-44fa-46e6-ad09-1f6e853b5226/...`.
- Comentario autenticado publicado no post de 5 imagens:
  - comentario `ca36315f-22c6-4d61-b6cc-f2e1c917255f`
- Denuncia autenticada enviada no mesmo post:
  - denuncia `a8bb4898-05a2-4d96-9718-f3b864a25a0e`
  - motivo `spam`
- Voto `hot` e depois `cold` exercitados; o estado final persistido em `public.post_votes` ficou `direction = 'cold'`.

### Avatar - preview inicial
- Upload autenticado concluido com persistencia em `public.profiles.avatar_url`.
- Objeto confirmado no bucket `kino-media` sob `profile-avatars/966dd3d0-44fa-46e6-ad09-1f6e853b5226/...`.
- Cleanup funcional concluido na mesma sessao autenticada.
- Verificacao final em banco/Storage:
  - `avatar_url = null`
  - `avatar_storage_objects = 0`

### Conta admin - preview inicial
- Login autenticado com sucesso.
- `admin/reports.html` abriu e listou a denuncia de QA.
- O fechamento da denuncia persistiu no banco (`status = closed`), mas a UI exibiu aviso incorreto de nao confirmacao.
- `admin/banners.html` abriu normalmente e aceitou toggle inativo/ativo sem regressao.

### Correcao aplicada na rodada
- Arquivo alterado: [admin-reports.controller.js](/C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/admin-reports.controller.js)
- Ajuste realizado:
  - `verifyReportsClosed(postId)` passou a usar fallback via RPC `kc_admin_list_reports` quando o `select` direto em `reports` e bloqueado por permissao/RLS.
  - `verifyPostStatus(postId, expectedStatus)` passou a usar fallback via RPC `kc_admin_list_posts_by_ids` quando o `select` direto em `posts` e bloqueado.
- Validacoes locais apos o patch:
  - `node --check assets/js/controllers/admin-reports.controller.js`
  - `git diff --check`

### Revalidacao em preview novo
- Preview novo publicado: [kino-campus-jxqai7y78-yannakamurabrs-projects.vercel.app](https://kino-campus-jxqai7y78-yannakamurabrs-projects.vercel.app)
- Cenario de verificacao:
  - post `f51bc920-7856-4649-b7e1-fd238676b645`
  - denuncia `9dd61204-1806-4c18-a55c-c10a324ab50c`
- Resultado:
  - admin fechou a denuncia
  - a UI passou a mostrar `Acao concluida com sucesso.`
  - o item saiu do filtro de abertos
  - cleanup posterior removeu o post, a denuncia e qualquer resquicio em `post_media`

### RLS com JWT real
- Test 2:
  - tentativa de `PATCH` em `posts.author_id`
  - resposta HTTP `403`
  - verificacao final: mutacao nao persistiu
- Test 3:
  - tentativa de `PATCH` em `profiles.full_name` de outro usuario
  - verificacao final: `full_name` do perfil alvo permaneceu inalterado

### Cleanup consolidado dos posts de QA
- Deletes autenticados realizados com `window.KCAPI.deletePost(...)`:
  - `28f57dce-d684-4820-a0ba-2d1e9bec1819`
  - `8eb144fb-e09a-44fb-bde8-f1ca57dd8967`
  - `d5c0d85a-e521-4be1-a529-b948fb34af86`
  - `f51bc920-7856-4649-b7e1-fd238676b645`
- Verificacao MCP consolidada no Supabase:
  - `remaining_posts = 0`
  - `remaining_post_media = 0`
  - `remaining_storage_objects = 0`
  - `remaining_reports = 0`

### Promote e smoke final em producao
- Promote executado com sucesso:
  - deploy de producao `dpl_7iVF3EuEhnRVjvvhMDFuUMnKckmD`
  - alias final [www.kinocampus.com.br](https://www.kinocampus.com.br)
- Perfil publico previamente afetado por `QA-8220-001` carregou normalmente apos a promocao.
- Smoke autenticado em producao:
  - login da conta comum
  - create de post controlado `a84a2492-9b40-41b6-800b-2bf08dbaadbd`
  - delete do mesmo post
  - verificacao MCP: sem residuos em `posts`, `post_media` ou `storage.objects`
- Smoke admin essencial em producao:
  - `admin/banners.html` carregou corretamente com conta admin real

---

## 5) Bugs / status operacional
| ID | Severidade | Status nesta rodada | Observacoes |
|---|---|---|---|
| QA-8207-001 | Bloqueador | RESOLVIDO | Fluxos autenticados/admin foram exercitados com contas reais/controladas no preview e em smoke de producao. |
| QA-8207-002 | Bloqueador | RESOLVIDO | Avatar funcional passou e RLS Tests 2 e 3 foram exercitados com JWT real sem persistencia indevida. |
| QA-8220-001 | Medio | RESOLVIDO E PROMOVIDO | O perfil publico corrigido foi validado em preview, confirmado no candidate final e exercitado apos o promote em producao. |
| QA-8220-002 | Medio | RESOLVIDO NA MESMA RODADA | O falso negativo de persistencia em `admin/reports` foi encontrado no preview inicial, corrigido no controller e revalidado em preview novo antes do promote. |

---

## 6) Conclusao do Run 4
- Decisao operacional: GO para producao.
- Os bloqueadores da trilha autenticada/admin foram zerados com prova operacional em browser real, banco real e verificacoes via MCP no Supabase/Vercel.
- Observacoes residuais nao bloqueadoras:
  - Algumas paginas continuam emitindo ruido de console por recurso externo de script e `favicon.ico` `404`.
  - Esse ruido nao alterou autenticacao, create/delete, avatar, admin banners, moderacao nem cleanup de Storage nesta rodada.
