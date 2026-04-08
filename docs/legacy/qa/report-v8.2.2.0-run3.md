# QA Run Report - Kino Campus V8.2.2.0 - Run 3

## 1) Metadados
- Data (AAAA-MM-DD): 2026-03-19
- Hora aproximada: 02:00-02:20 BRT
- Ambiente principal da rodada: Preview publicado + runtime local prod-backed para validacao funcional
- Preview publicado: [kino-campus-nq1v16jrm-yannakamurabrs-projects.vercel.app](https://kino-campus-nq1v16jrm-yannakamurabrs-projects.vercel.app)
- Projeto Vercel: `prj_PTFmR4f3A1aAHV5mgXa24svL8umB`
- Projeto Supabase: `wacyrkwhkvzwkqpolrbg`
- Branch local testada: `codex/deep-review-it4-auth-qa-release-closure`
- Base da branch: `c2eb405`
- Navegador + versao: Playwright CLI em Chromium compativel; user agent observado `HeadlessChrome/146.0.0.0`
- Dispositivo: Desktop Windows
- Viewport aproximado: `1280x720`
- Tester (nome): Codex

## 2) Resultado geral
- Status do Run 3: ( ) GO  (X) NO-GO
- Resumo curto:
  - Um preview novo da Iteracao 4 foi publicado e ficou `READY`.
  - O asset publicado do preview foi conferido por fetch autenticado do Vercel e contem o loader definitivo de comentarios/atividades do perfil.
  - Em browser real local, com o codigo atual da branch e `KC_ENV` injetado para o Supabase real, o perfil publico abriu sem `400` na carga de comentarios/atividades.
  - O unico erro de console restante nessa validacao funcional foi `favicon.ico` `404` do servidor local.
  - As policies manuais de avatar foram confirmadas presentes no projeto real via `pg_policies` de `storage.objects`.
  - A rodada autenticada continuou bloqueada: o probe de signup de conta de teste no Supabase Auth respondeu `429 over_email_send_rate_limit`, confirmando dependencia de credenciais confirmadas/e-mail real para login funcional.

---

## 3) Evidencias centrais
| Item | Status | Evidencia | Observacoes |
|---|---|---|---|
| Preview Iteracao 4 publicado | PASSOU | `dpl_E6bNULjoGM5SsaUBkRY9LW2pAjAZ`; [preview](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run3.md#L1) | Deploy CLI concluido com `READY`. |
| Asset publicado contem o fix final do perfil | PASSOU | Fetch autenticado de `assets/js/controllers/profile.controller.js` no preview | O deploy publicado usa `loadProfileComments(...)` e `select('id, legacy_id, title')`. |
| Perfil publico abre sem `400` contra o banco real | PASSOU | [profile-public-local-supabase-it4-fixed.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run3/profile-public-local-supabase-it4-fixed.png) | Browser real local + Supabase real; network do perfil ficou `200` para `comments` e para o batch `posts?id=in.(...)`. |
| Policy manual de avatar aplicada no ambiente real | PASSOU | Consulta MCP em `pg_policies` de `storage.objects` | Policies `storage_kino_media_profile_avatar_insert`, `update` e `delete` presentes. |
| Signup controlado para destravar auth | BLOQUEADO | Resposta `429 over_email_send_rate_limit` no endpoint `/auth/v1/signup` | Sem credenciais confirmadas, a rodada autenticada nao pode prosseguir com honestidade. |

---

## 4) Console / Network relevantes
### Console
- Validacao funcional do perfil publico apos o fix:
  - `Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:4173/favicon.ico`
  - Nenhum `400` do Supabase para comentarios/atividades nessa rodada.

### Network
- `GET /rest/v1/profiles?... => 200`
- `GET /rest/v1/comments?select=id,created_at,body,post_id&author_id=eq.ac22dcf5-e873-4260-89e8-9e567a1ef496&order=created_at.desc&limit=8 => 200`
- `GET /rest/v1/posts?select=id,legacy_id,title&id=in.(47b1954c-1d03-4c81-8035-4f03552037e8,695ffbc6-5450-4316-8e43-91f2ddd937b1) => 200`
- `POST /auth/v1/signup => 429 over_email_send_rate_limit`

---

## 5) Escopo executado e escopo bloqueado
### Executado com sucesso
- Correcao definitiva de `QA-8220-001` implementada em [profile.controller.js](/C:/Users/yan1n/Documents/GitHub/kino-campus/assets/js/controllers/profile.controller.js).
- Revalidacao funcional do perfil publico em browser real contra o Supabase real.
- Publicacao de preview novo da Iteracao 4.
- Confirmacao operacional das policies manuais de avatar no projeto real.

### Bloqueado nesta rodada
- Cadastro, callback, login, create post com 1/2/5 imagens, comentario autenticado, voto, denuncia autenticada, delete com midia, admin reports, admin banners e moderacao.
- RLS Smoke Tests 2 e 3.
- Validacao funcional de avatar upload/delete.

Motivo comum do bloqueio:
- Nao havia credenciais confirmadas de conta comum/admin no contexto do agente.
- O probe controlado de signup para gerar conta de teste retornou `429 over_email_send_rate_limit`, indicando dependencia de caixa de e-mail/confirmacao real.

---

## 6) Bugs / status operacional
| ID | Severidade | Status nesta rodada | Observacoes |
|---|---|---|---|
| QA-8207-001 | Bloqueador | ABERTO | Fluxos autenticados/admin continuam pendentes por falta de credenciais confirmadas. |
| QA-8207-002 | Bloqueador | ABERTO | RLS 2 e 3 e avatar funcional continuam pendentes; a policy manual de avatar, por outro lado, foi confirmada aplicada. |
| QA-8220-001 | Medio | RESOLVIDO NO BRANCH | O `400` saiu da trilha do perfil publico na validacao contra o Supabase real e o fix ja esta publicado em preview. |

---

## 7) Conclusao do Run 3
- Decisao operacional: NO-GO para promote nesta rodada.
- O bug publico do perfil avancou de forma concreta e verificavel, mas o release continua sem aprovacao porque os gates autenticados/admin/RLS ainda nao foram exercitados com credenciais reais confirmadas.
- Proxima acao recomendada:
  - obter uma conta comum confirmada e uma conta admin confirmada;
  - rodar a checklist autenticada inteira contra o preview atual;
  - validar create/delete com midia e avatar upload/delete;
  - executar RLS Tests 2 e 3 com sessao JWT autenticada;
  - somente depois disso decidir promote para `www.kinocampus.com.br`.
