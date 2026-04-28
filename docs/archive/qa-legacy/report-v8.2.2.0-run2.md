# QA Run Report — Kino Campus V8.2.2.0 — Run 2

## 1) Metadados
- Data (AAAA-MM-DD): 2026-03-19
- Hora aproximada: 01:00-01:20 BRT
- Ambiente: (X) Produção  ( ) Preview
- URL testada: `https://www.kinocampus.com.br`
- Commit/Branch testado: deploy em produção sem hash exposto no front; repositório local na branch `codex/deep-review-it3-qa-release-hardening` (baseada em `4844118` + correção local do perfil público)
- Navegador + versão: Playwright CLI em Chromium compatível; user agent observado `HeadlessChrome/146.0.0.0`
- Dispositivo: Desktop Windows
- Resolução/Viewport: aproximadamente `1280x720`
- Tester (nome): Codex

## 2) Resultado geral (Go/No-Go)
- Status do Run 2: ( ) GO  (X) NO-GO
- Bloqueadores abertos: ( ) 0  (X) 1+  → listar na seção 6
- Observações rápidas (5–10 linhas):
  - A URL pública real de produção foi confirmada como `https://www.kinocampus.com.br`.
  - Home pública e detalhe público de post carregaram com dados reais.
  - O perfil público carregou, mas disparou erro `400` na query de atividades/comentários com join em `comments_post_id_fkey`.
  - `create-post.html` abriu sem sessão, porém os fluxos autenticados de criação, comentário, voto, denúncia efetiva e moderação não puderam ser executados por ausência de credenciais de teste no contexto do agente.
  - O teste RLS REST anon para `reports` passou com `401`, sem exposição de dados.
  - Os testes RLS 2 e 3, o gate operacional de avatar e os cenários de Storage com mídia ficaram bloqueados por falta de sessão autenticada e acesso operacional ao SQL Editor real.

---

## 3) Smoke pós-Rescue Fix (obrigatório)
Marque PASSOU/FALHOU e cole evidências.

| Item | Passou | Falhou | Evidência (link/print) | Observações |
|---|:---:|:---:|---|---|
| Home abre sem erro vermelho no Console |  | X | `output/playwright/evidence/v8.2.2.0-run2/E2E-home-prod.png` | Houve ruído de console por script externo da Kaspersky bloqueado por CSP e `favicon.ico` 404. |
| Feed renderiza posts | X |  | `output/playwright/evidence/v8.2.2.0-run2/E2E-home-prod.png` | Feed público renderizou cards reais. |
| Network: assets críticos retornam 200 | X |  | `GET /rest/v1/posts => 200`; `GET /rest/v1/hero_banners => 200`; `POST /rpc/kc_get_my_votes => 200` | Evidência coletada na rodada Playwright. |
| Não existe `Unexpected token '<<'` | X |  | Console inspecionado na home, detalhe e perfil público | Nenhum artefato de merge apareceu no runtime observado. |

---

## 4) E2E Checklist (1 a 9)
> Use o `docs/qa/e2e-checklist.md` como roteiro e registre aqui.

| Etapa | Passou | Falhou | Evidência (link/print) | Observações |
|---|:---:|:---:|---|---|
| 1) Cadastro |  |  | N/A | BLOQUEADO: sem conta nova, sem caixa de e-mail institucional e sem credenciais de teste no contexto do agente. |
| 2) Confirmação de e-mail (callback) |  |  | N/A | BLOQUEADO: dependente da etapa 1 e de acesso ao e-mail real. |
| 3) Login |  |  | N/A | BLOQUEADO: não havia credenciais de teste reaproveitáveis no workspace nem via tooling autenticada. |
| 4) Criar post (com e sem imagem) |  |  | `output/playwright/evidence/v8.2.2.0-run2/E2E-create-post-unauth-page.png` | BLOQUEADO: a página/modal abriu em `create-post.html`, mas criação autenticada com 1, 2 e 5 imagens não foi exercitada. |
| 5) Abrir detalhe do post | X |  | `output/playwright/evidence/v8.2.2.0-run2/E2E-product-detail-public.png` | PASSOU no detalhe público `product.html?id=89a1eb50-ccb9-437d-926b-fa04e2d7a072`. |
| 6) Comentar |  |  | `output/playwright/evidence/v8.2.2.0-run2/E2E-product-comment-login-guard.png` | BLOQUEADO para fluxo autenticado; sem sessão, a UI respondeu `Faça login para comentar.` |
| 7) Votar (hot/cold) |  |  | N/A | BLOQUEADO: fluxo autenticado não exercitado. |
| 8) Denunciar post |  |  | `output/playwright/evidence/v8.2.2.0-run2/E2E-product-report-login-modal.png` | BLOQUEADO para envio autenticado; sem sessão, o clique abriu o modal `Conta KinoCampus`. |
| 9) Admin: fechar denúncia/moderar |  |  | `output/playwright/evidence/v8.2.2.0-run2/E2E-admin-dashboard-unauth-redirect.png` | BLOQUEADO: acesso sem sessão a `/admin/` redirecionou para `index.html`; moderação real não foi exercitada. |

### 4.1) Hardening / saneamento específico
| Item | Status | Evidência | Observações |
|---|---|---|---|
| Perfil próprio e público sem regressão de privacidade | FALHOU | `output/playwright/evidence/v8.2.2.0-run2/E2E-profile-public.png` | O perfil público abriu, mas houve `400` no endpoint `comments?...post:posts!comments_post_id_fkey(...)` durante o carregamento das atividades. |
| Admin reports sem exposição indevida | BLOQUEADO | N/A | Exige conta admin real. |
| Admin banners sob CSP real | BLOQUEADO | N/A | Exige conta admin real. |
| Create/delete com mídia sem órfão visível | BLOQUEADO | N/A | Exige conta autenticada e fixture segura. |
| Delete com mídia legada/external URL | BLOQUEADO | N/A | Não havia fixture segura acessível pelo agente. |
| Avatar upload/delete | BLOQUEADO | N/A | Exige conta autenticada e confirmação da aplicação da policy manual `supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql` no projeto real. |

---

## 5) RLS Smoke Tests (SQL)
> Rode `docs/qa/rls-smoke.sql` e registre.

| Teste | Passou | Falhou | Evidência (print/erro) | Observações |
|---|:---:|:---:|---|---|
| Test 1 — reports select anon (não expor dados) | X |  | `STATUS=401` via REST em `reports?select=id,post_id,reason,status&limit=20` | PASSOU: o endpoint não expôs dados para anon. |
| Test 2 — UPDATE posts.author_id (bloquear) |  |  | N/A | BLOQUEADO: sem sessão autenticada/SQL Editor real com alvo controlado. |
| Test 3 — UPDATE profile de outro usuário (bloquear) |  |  | N/A | BLOQUEADO: sem sessão autenticada/SQL Editor real com alvo controlado. |

---

## 6) Bugs encontrados (classificação)
> Para cada bug: passos, esperado vs atual, severidade, evidência.

| ID | Severidade | Onde | Passos de reprodução (curto) | Esperado | Atual | Evidência |
|---|---|---|---|---|---|---|
| B-01 | Bloqueador | Fluxos autenticados / admin / SQL Editor | Tentar executar cadastro, login, criação autenticada, moderação e RLS autenticado nesta rodada automatizada | Credenciais e acessos operacionais disponíveis para executar 100% da checklist | Fluxos críticos ficaram bloqueados por ausência de credenciais de teste e acesso autenticado no contexto do agente | Seções 4 e 5 deste report |
| B-02 | Médio | Perfil público (`profile.html?id=ac22dcf5-e873-4260-89e8-9e567a1ef496`) | Abrir perfil público e aguardar carregar atividades/comentários | Atividades carregam sem erro de console | Requisição `comments?...post:posts!comments_post_id_fkey(...)` retorna `400` | `output/playwright/evidence/v8.2.2.0-run2/E2E-profile-public.png` e trecho de console na seção 7 |
| B-03 | Bloqueador | Avatar gate / validação RLS autenticada | Tentar confirmar upload/delete de avatar e políticas manuais no ambiente real | Policy manual validada e fluxos autenticados executáveis | Sem conta autenticada e sem confirmação operacional da policy manual aplicada no projeto real | Seções 4.1 e 5 deste report |

---

## 7) Console / Network (copiar trechos)
### Console (erros vermelhos)
- Home: `Loading the script 'https://gc.kis.v2.scr.kaspersky-labs.com/.../main.js' violates the following Content Security Policy directive: "script-src-elem 'self' https://cdn.jsdelivr.net".`
- Home: `Failed to load resource: the server responded with a status of 404 () @ https://www.kinocampus.com.br/favicon.ico`
- Perfil público: `Failed to load resource: the server responded with a status of 400 () @ https://wacyrkwhkvzwkqpolrbg.supabase.co/rest/v1/comments?select=id%2Ccreated_at%2Cbody%2Cpost_id%2Cpost%3Aposts%21comments_post_id_fkey%28id%2Clegacy_id%2Ctitle%2Ctitulo%29&author_id=eq.ac22dcf5-e873-4260-89e8-9e567a1ef496&order=created_at.desc&limit=8`

### Network (requests relevantes)
- `GET /rest/v1/posts?... => 200`
- `GET /rest/v1/hero_banners?... => 200`
- `POST /rest/v1/rpc/kc_get_my_votes => 200`
- `GET /rest/v1/reports?select=id,post_id,reason,status&limit=20 => 401` (teste RLS anon manual via REST)

---

## 8) Conclusão do Run 2
- Próxima ação recomendada:
  - aplicar/deployar a correção local do fallback de comentários em `assets/js/controllers/profile.controller.js`;
  - rodar um Run 3 com credenciais reais de conta comum e conta admin;
  - validar no projeto real a aplicação da policy manual `supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql`;
  - executar os cenários pendentes de create/delete com mídia e os RLS Tests 2 e 3.
- Se NO-GO: quais bloqueadores precisam ser corrigidos antes do Run 3:
  - disponibilizar credenciais e acesso operacional para fluxos autenticados/admin;
  - validar/deployar a correção do perfil público;
  - confirmar a policy manual de avatar no ambiente real;
  - concluir QA dos fluxos de Storage da Iteração 2 em ambiente autenticado.
