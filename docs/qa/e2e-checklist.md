# E2E Checklist (Kino Campus) - V8.2.2.0

## Visao geral
Este guia e um passo a passo para validar o fluxo completo do Kino Campus do inicio ao fim (E2E = teste de ponta a ponta).
Objetivo: qualquer pessoa, mesmo sem experiencia tecnica, conseguir marcar se passou ou nao passou, com prova (print/log).

## Ambientes
- URL de producao em uso na rodada real: [https://www.kinocampus.com.br](https://www.kinocampus.com.br)
- URL de preview/homologacao (Vercel): [https://kino-campus-nq1v16jrm-yannakamurabrs-projects.vercel.app](https://kino-campus-nq1v16jrm-yannakamurabrs-projects.vercel.app)

> Regra:
> - Nunca inventar URL.
> - A Iteracao 4 publicou o preview real acima.
> - Esse preview esta protegido por Vercel Authentication; browser sem bypass/share link cai na tela de login da Vercel.

## Termos rapidos
- Feed: lista principal de posts.
- Post: publicacao feita por um usuario.
- Status: estado atual de algo (ex.: denuncia aberta ou fechada).
- Admin: conta com permissoes extras para moderacao.

---

## Pre-requisitos
1. Ambiente
   - URL de producao: `https://www.kinocampus.com.br`
   - URL de preview/homologacao: `https://kino-campus-nq1v16jrm-yannakamurabrs-projects.vercel.app`
2. Contas de teste
   - 1 conta comum (usuario normal)
   - 1 conta admin (se ja existir no ambiente)
3. E-mails permitidos
   - Usar dominios institucionais aceitos pelo projeto (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).
4. Navegador recomendado
   - Chrome ou Edge atualizado
5. Evidencia
   - Ter uma pasta para salvar prints e logs com data/hora

---

## Checklist numerado (1 a 9)

## 1) Cadastro
Acao:
1. Abra o site.
2. Va para cadastro/criar conta.
3. Preencha nome, e-mail institucional e senha.
4. Envie o formulario.

O que esperar:
- Mensagem clara de sucesso no cadastro ou aviso para confirmar e-mail.
- Nao deve aparecer erro inesperado na tela.

Se falhar, o que significa:
- E-mail fora dos dominios permitidos.
- Regra de autenticacao bloqueando cadastro.
- Problema temporario de conexao com Supabase.

Evidencia:
- Print da tela final do cadastro.
- Print do console se houver erro.
- URL atual e horario aproximado.

## 2) Confirmacao de e-mail (callback)
Acao:
1. Abra o e-mail da conta criada.
2. Clique no link de confirmacao.
3. Aguarde redirecionamento para o app.

O que esperar:
- Pagina abre sem erro critico.
- Sessao autenticada ou indicacao de confirmacao concluida.

Se falhar, o que significa:
- Link expirado ou ja usado.
- URL de callback incorreta no Supabase/Auth.
- Ambiente bloqueando redirecionamento.

Evidencia:
- Print da pagina apos clicar no link.
- URL completa do callback.
- Print do console em caso de erro.

## 3) Login
Acao:
1. Volte ao app.
2. Faca login com a conta recem-confirmada.

O que esperar:
- Entrar no app sem mensagens de erro.
- Nome/estado de usuario logado visivel.

Se falhar, o que significa:
- Senha incorreta.
- Conta nao confirmada corretamente.
- Falha de sessao/autenticacao.

Evidencia:
- Print da tela apos login.
- Print do console se aparecer erro.
- URL e horario.

## 4) Criar post (com e sem imagem)
Acao:
1. Crie um post somente com texto.
2. Crie outro post com texto + imagem.

O que esperar:
- Ambos aparecem no feed.
- O post com imagem exibe miniatura/imagem carregada.

Se falhar, o que significa:
- Erro de permissao de escrita (RLS/Auth).
- Falha no upload da imagem (Storage/policy).
- Erro de validacao do formulario.

Evidencia:
- Print do feed mostrando os 2 posts.
- Print do console (erro de upload/gravacao, se houver).
- URL da pagina do feed.

## 5) Abrir detalhe do post
Acao:
1. Clique no post criado.
2. Abra a pagina de detalhe.

O que esperar:
- Conteudo do post correto na pagina de detalhe.
- Se houver imagem, ela aparece no detalhe.

Se falhar, o que significa:
- ID do post nao localizado.
- Falha na leitura de dados (consulta/banco).
- Problema de rota/navegacao.

Evidencia:
- Print da pagina de detalhe.
- URL da pagina de detalhe.
- Print do console com erro (se existir).

## 6) Comentar
Acao:
1. Na pagina de detalhe, escreva um comentario.
2. Envie.

O que esperar:
- Comentario aparece na lista apos envio.
- Mensagem de erro nao deve aparecer.

Se falhar, o que significa:
- Usuario sem sessao valida.
- Regra de gravacao bloqueando comentario.
- Problema na atualizacao da tela.

Evidencia:
- Print do comentario publicado.
- Print do console em caso de falha.
- Horario e URL.

## 7) Votar (hot/cold)
Acao:
1. No post (feed ou detalhe), clique em voto `hot`.
2. Em seguida, teste `cold` quando aplicavel.

O que esperar:
- Contador/estado de voto atualizado.
- Interface responde sem travar.

Se falhar, o que significa:
- Regra de voto bloqueando atualizacao.
- Falha de sincronizacao entre UI e banco.
- Erro de sessao/autorizacao.

Evidencia:
- Print antes e depois do voto.
- Print do console se ocorrer erro.
- URL da pagina.

## 8) Denunciar post
Acao:
1. Abra um post.
2. Clique em denunciar.
3. Preencha motivo e envie.

O que esperar:
- Confirmacao de denuncia enviada.
- Nao expor dados privados de outras denuncias.

Se falhar, o que significa:
- Bloqueio por falta de login.
- Policy RLS de `reports` bloqueando insert.
- Duplicidade de denuncia para o mesmo post.

Evidencia:
- Print da confirmacao ou erro amigavel.
- Print do console (erro de permissao, se houver).
- URL e horario.

## 9) Acessar Admin e fechar denuncia / moderar
Acao:
1. Saia da conta comum.
2. Entre com conta admin.
3. Acesse a area de administracao.
4. Localize denuncia aberta e execute a acao (fechar/moderar).

O que esperar:
- Admin acessa area restrita normalmente.
- Status da denuncia muda (ex.: aberta -> fechada).
- Alteracao persiste apos atualizar a pagina.

Se falhar, o que significa:
- Conta sem privilegio admin.
- Regra de moderacao bloqueada.
- Erro de atualizacao/consulta na area admin.

Evidencia:
- Print da tela admin antes e depois da acao.
- Print do console com erro, se houver.
- URL da pagina admin e horario.

---

## Execucao real - Run 2 (2026-03-19)
- Ambiente executado: Producao
- URL executada: `https://www.kinocampus.com.br`
- Janela aproximada: 01:00-01:20 BRT
- Branch local de continuidade: `codex/deep-review-it3-qa-release-hardening`
- Resultado da rodada: NAO PASSOU
- Observacao: a rodada publica real foi executada; fluxos autenticados, admin e SQL Editor autenticado ficaram bloqueados por ausencia de credenciais de teste no contexto do agente.

### Status por etapa (1 a 9)
| Etapa | Status | Evidencia | Observacoes |
|---|---|---|---|
| 1) Cadastro | BLOQUEADO | N/A | Sem conta nova, caixa de e-mail institucional e credenciais de teste no contexto do agente. |
| 2) Confirmacao de e-mail (callback) | BLOQUEADO | N/A | Dependente da etapa 1 e de acesso ao e-mail real. |
| 3) Login | BLOQUEADO | N/A | Sem credenciais de teste reaproveitaveis no workspace. |
| 4) Criar post (com e sem imagem) | BLOQUEADO | `output/playwright/evidence/v8.2.2.0-run2/E2E-create-post-unauth-page.png` | A pagina/modal abriu sem login em `create-post.html`, mas a publicacao autenticada com 1, 2 e 5 imagens nao foi exercitada. |
| 5) Abrir detalhe do post | PASSOU | `output/playwright/evidence/v8.2.2.0-run2/E2E-product-detail-public.png` | O detalhe publico abriu em `product.html?id=89a1eb50-ccb9-437d-926b-fa04e2d7a072`. |
| 6) Comentar | BLOQUEADO | `output/playwright/evidence/v8.2.2.0-run2/E2E-product-comment-login-guard.png` | O guard para usuario sem sessao respondeu com `Faca login para comentar.`, mas o envio autenticado nao foi exercitado. |
| 7) Votar (hot/cold) | BLOQUEADO | N/A | Fluxo autenticado nao exercitado. |
| 8) Denunciar post | BLOQUEADO | `output/playwright/evidence/v8.2.2.0-run2/E2E-product-report-login-modal.png` | O clique em denunciar abriu modal de auth (`Conta KinoCampus`), mas o envio autenticado nao foi exercitado. |
| 9) Admin: fechar denuncia/moderar | BLOQUEADO | `output/playwright/evidence/v8.2.2.0-run2/E2E-admin-dashboard-unauth-redirect.png` | O acesso sem sessao a `/admin/` redirecionou para `index.html`; moderacao autenticada nao foi exercitada. |

### Cenarios de saneamento / hardening
| Cenario | Status | Evidencia | Observacoes |
|---|---|---|---|
| Home publica | PASSOU COM RESSALVAS | `output/playwright/evidence/v8.2.2.0-run2/E2E-home-prod.png` | Home carregou e feed renderizou, com ruido de console por script externo bloqueado por CSP e favicon `404`. |
| Perfil publico sem regressao de privacidade | FALHOU | `output/playwright/evidence/v8.2.2.0-run2/E2E-profile-public.png` | A tela abriu, mas a consulta de atividades/comentarios disparou `400` no endpoint com join `comments_post_id_fkey(...)`. |
| Admin reports sem exposicao indevida | BLOQUEADO | N/A | Exige conta admin real. |
| Admin banners sob CSP real | BLOQUEADO | N/A | Exige conta admin real. |
| Create/delete com midia gerenciada | BLOQUEADO | N/A | Exige conta autenticada e fixture segura para create/delete com Storage. |
| Delete com midia legada/external URL | BLOQUEADO | N/A | Nao havia fixture segura no ambiente acessivel pelo agente. |
| Avatar upload/delete | BLOQUEADO | N/A | Exige conta autenticada e verificacao da policy manual `supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql` no ambiente real. |
| RLS Test 1 (`reports` anon) | PASSOU | `STATUS=401` | A consulta REST anon em `reports?select=id,post_id,reason,status&limit=20` retornou `401`, sem exposicao de dados. |
| RLS Test 2 (`posts.author_id` update) | BLOQUEADO | N/A | Exige sessao autenticada/SQL Editor real com alvo controlado. |
| RLS Test 3 (`profiles` update de terceiro) | BLOQUEADO | N/A | Exige sessao autenticada/SQL Editor real com alvo controlado. |

---

## Execucao de continuidade - Run 3 (2026-03-19)
- Preview publicado: `https://kino-campus-nq1v16jrm-yannakamurabrs-projects.vercel.app`
- Branch local de continuidade: `codex/deep-review-it4-auth-qa-release-closure`
- Resultado da rodada: NAO PASSOU
- Observacao: a rodada fechou o bug publico do perfil no codigo atual e no runtime prod-backed local, mas os fluxos autenticados/admin continuaram bloqueados por ausencia de credenciais confirmadas. Um probe controlado de signup no Supabase Auth retornou `429 over_email_send_rate_limit`.

### Status complementar da Run 3
| Cenario | Status | Evidencia | Observacoes |
|---|---|---|---|
| Preview Iteracao 4 publicado | PASSOU | [report-v8.2.2.0-run3.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run3.md) | Deployment `dpl_E6bNULjoGM5SsaUBkRY9LW2pAjAZ`, estado `READY`. |
| Perfil publico sem `400` na trilha de comentarios/atividades | PASSOU | [profile-public-local-supabase-it4-fixed.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.2.0-run3/profile-public-local-supabase-it4-fixed.png) | Browser real local com o codigo da branch atual e `KC_ENV` apontando para o Supabase real. |
| Policy manual de avatar aplicada | PASSOU | [report-v8.2.2.0-run3.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run3.md) | Policies de `profile_avatar` confirmadas em `pg_policies` de `storage.objects`. |
| Fluxos autenticados/admin | BLOQUEADO | [report-v8.2.2.0-run3.md](/C:/Users/yan1n/Documents/GitHub/kino-campus/docs/qa/report-v8.2.2.0-run3.md) | Sem credenciais confirmadas; signup de teste retornou `429 over_email_send_rate_limit`. |

---

## Tabela de registro final
| Data | Ambiente | Passou/Nao passou | Observacoes | Links/prints | Commit testado |
|---|---|---|---|---|---|
| 2026-03-19 | Producao | Nao passou | Rodada publica real executada; detalhe publico e home ok, perfil publico com erro `400` em atividades/comentarios, fluxos autenticados/admin/RLS 2-3 bloqueados por ausencia de credenciais/acesso autenticado no contexto do agente. | `output/playwright/evidence/v8.2.2.0-run2/` e `docs/qa/report-v8.2.2.0-run2.md` | `codex/deep-review-it3-qa-release-hardening` |
| 2026-03-19 | Preview publicado + runtime local prod-backed | Nao passou | Preview da Iteracao 4 publicado; perfil publico corrigido e validado sem `400` contra o Supabase real; fluxos autenticados/admin/RLS 2-3 continuaram bloqueados por falta de credenciais confirmadas. | `output/playwright/evidence/v8.2.2.0-run3/` e `docs/qa/report-v8.2.2.0-run3.md` | `codex/deep-review-it4-auth-qa-release-closure` |

---

## Apendice
### Como abrir o Console do navegador
- Windows/Linux: `Ctrl + Shift + I` e depois aba `Console`
- macOS: `Cmd + Option + I` e depois aba `Console`

### Como coletar evidencia minima
1. Print da tela com o erro/comportamento.
2. Print do Console com mensagem de erro.
3. URL completa da pagina.
4. Horario aproximado.

### Como limpar cache/localStorage
1. Abra o app e o Console.
2. Va em `Application`.
3. Em `Local Storage`, limpe as chaves do dominio do app.
4. Recarregue a pagina com `Ctrl + F5`.

### Como repetir um teste com seguranca
- Use dados de teste com data/hora no titulo.
- Se possivel, crie um post novo para cada rodada.
- Nao usar conta pessoal real; usar contas de teste.
- Ao repetir denuncia, escolha outro post para evitar bloqueio por duplicidade.
