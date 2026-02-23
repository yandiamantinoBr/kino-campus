# E2E Checklist (Kino Campus) — V8.2.2.0

## Visão geral
Este guia é um passo a passo para validar o fluxo completo do Kino Campus do início ao fim (E2E = “teste de ponta a ponta”).
Objetivo: qualquer pessoa, mesmo sem experiência técnica, conseguir marcar se **passou** ou **não passou**, com prova (print/log).

## Ambientes (preencher com URL REAL do Vercel)
- URL de produção (Vercel): `__VERCEL_PROD_URL__`
- URL de preview/homologação (Vercel): `__VERCEL_PREVIEW_URL__`

> Regra (sem suposições):
> - Descobrir a(s) URL(s) no próprio repositório (ex.: README, docs, vercel.json),
>   ou então deixar como placeholder explicitamente, mas **NÃO inventar**.

### Termos rápidos (em linguagem simples)
- **Feed**: lista principal de posts.
- **Post**: publicação feita por um usuário.
- **Status**: estado atual de algo (ex.: denúncia aberta ou fechada).
- **Admin**: conta com permissões extras para moderação.

---

## Pré-requisitos
Antes de começar, confirme:

1. **Ambiente**
   - URL de produção: `__VERCEL_PROD_URL__` (preencher)
   - URL de preview/homologação: `__VERCEL_PREVIEW_URL__` (preencher)
2. **Contas de teste**
   - 1 conta comum (usuário normal)
   - 1 conta admin (se já existir no ambiente)
3. **E-mails permitidos**
   - Usar domínios institucionais aceitos pelo projeto (ex.: `@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).
4. **Navegador recomendado**
   - Chrome ou Edge (atualizado)
5. **Evidência**
   - Tenha uma pasta para salvar prints e logs com data/hora.

---

## Checklist numerado (1 a 9)

> Dica: execute na ordem. Em cada etapa, marque **PASSOU** ou **FALHOU**.

## 1) Cadastro
**Ação**
1. Abra o site.
2. Vá para cadastro/criar conta.
3. Preencha nome, e-mail institucional e senha.
4. Envie o formulário.

✅ **O que eu espero ver**
- Mensagem clara de sucesso no cadastro (ou aviso para confirmar e-mail).
- Não deve aparecer erro inesperado na tela.

❌ **Se falhar, o que significa**
- E-mail fora dos domínios permitidos.
- Regra de autenticação bloqueando cadastro.
- Problema temporário de conexão com Supabase.

🧾 **Evidência para salvar**
- Print da tela final do cadastro.
- Print do console (se houver erro).
- URL atual e horário aproximado.

---

## 2) Confirmação de e-mail (callback)
**Ação**
1. Abra o e-mail da conta criada.
2. Clique no link de confirmação.
3. Aguarde redirecionamento para o app.

✅ **O que eu espero ver**
- Página abre sem erro crítico.
- Sessão autenticada ou indicação de confirmação concluída.

❌ **Se falhar, o que significa**
- Link expirado ou já usado.
- URL de callback incorreta no Supabase/Auth.
- Ambiente bloqueando redirecionamento.

🧾 **Evidência para salvar**
- Print da página após clicar no link.
- URL completa do callback.
- Print do console em caso de erro.

---

## 3) Login
**Ação**
1. Volte ao app.
2. Faça login com a conta recém-confirmada.

✅ **O que eu espero ver**
- Entrar no app sem mensagens de erro.
- Nome/estado de usuário logado visível.

❌ **Se falhar, o que significa**
- Senha incorreta.
- Conta não confirmada corretamente.
- Falha de sessão/autenticação.

🧾 **Evidência para salvar**
- Print da tela após login.
- Print do console se aparecer erro.
- URL e horário.

---

## 4) Criar post (com e sem imagem)
**Ação**
1. Crie um post somente com texto.
2. Crie outro post com texto + imagem.

✅ **O que eu espero ver**
- Ambos aparecem no feed.
- O post com imagem exibe miniatura/imagem carregada.

❌ **Se falhar, o que significa**
- Erro de permissão de escrita (RLS/Auth).
- Falha no upload da imagem (Storage/policy).
- Erro de validação do formulário.

🧾 **Evidência para salvar**
- Print do feed mostrando os 2 posts.
- Print do console (erro de upload/gravação, se houver).
- URL da página do feed.

---

## 5) Abrir detalhe do post
**Ação**
1. Clique no post criado.
2. Abra a página de detalhe.

✅ **O que eu espero ver**
- Conteúdo do post correto na página de detalhe.
- Se houver imagem, ela aparece no detalhe.

❌ **Se falhar, o que significa**
- ID do post não localizado.
- Falha na leitura de dados (consulta/banco).
- Problema de rota/navegação.

🧾 **Evidência para salvar**
- Print da página de detalhe.
- URL da página de detalhe.
- Print do console com erro (se existir).

---

## 6) Comentar
**Ação**
1. Na página de detalhe, escreva um comentário.
2. Envie.

✅ **O que eu espero ver**
- Comentário aparece na lista após envio.
- Mensagem de erro não deve aparecer.

❌ **Se falhar, o que significa**
- Usuário sem sessão válida.
- Regra de gravação bloqueando comentário.
- Problema na atualização da tela.

🧾 **Evidência para salvar**
- Print do comentário publicado.
- Print do console em caso de falha.
- Horário e URL.

---

## 7) Votar (hot/cold)
**Ação**
1. No post (feed ou detalhe), clique em voto “hot”.
2. Em seguida, teste “cold” (quando aplicável).

✅ **O que eu espero ver**
- Contador/estado de voto atualizado.
- Interface responde sem travar.

❌ **Se falhar, o que significa**
- Regra de voto bloqueando atualização.
- Falha de sincronização entre UI e banco.
- Erro de sessão/autorização.

🧾 **Evidência para salvar**
- Print antes e depois do voto.
- Print do console se ocorrer erro.
- URL da página.

---

## 8) Denunciar post
**Ação**
1. Abra um post.
2. Clique em denunciar.
3. Preencha motivo e envie.

✅ **O que eu espero ver**
- Confirmação de denúncia enviada.
- Não expor dados privados de outras denúncias.

❌ **Se falhar, o que significa**
- Bloqueio por falta de login.
- Política RLS de `reports` bloqueando insert.
- Duplicidade de denúncia para o mesmo post.

🧾 **Evidência para salvar**
- Print da confirmação (ou erro amigável).
- Print do console (erro de permissão, se houver).
- URL e horário.

---

## 9) Acessar Admin e fechar denúncia / moderar
**Ação**
1. Saia da conta comum.
2. Entre com conta admin.
3. Acesse área de administração.
4. Localize denúncia aberta e execute ação (fechar/moderar).

✅ **O que eu espero ver**
- Admin acessa área restrita normalmente.
- Status da denúncia muda (ex.: aberta → fechada).
- Alteração persiste após atualizar página.

❌ **Se falhar, o que significa**
- Conta sem privilégio admin.
- Regra de moderação bloqueada.
- Erro de atualização/consulta na área admin.

🧾 **Evidência para salvar**
- Print da tela admin antes e depois da ação.
- Print do console com erro (se houver).
- URL da página admin e horário.

---

## Tabela de registro final
Preencha ao final da rodada de testes:

| Data | Ambiente | Passou/Não passou | Observações | Links/prints | Commit testado |
|---|---|---|---|---|---|
| AAAA-MM-DD | Produção/Preview | Passou ou Não passou | Resumo curto do que aconteceu | URLs de pasta, prints e logs | V8.2.2.0 |

---

## Apêndice

### Como abrir o Console do navegador (Chrome/Edge)
- **Windows/Linux**: `Ctrl + Shift + I` e depois aba **Console**.
- **macOS**: `Cmd + Option + I` e depois aba **Console**.
- Também pode clicar com botão direito na página → **Inspecionar** → **Console**.

### Como coletar evidência mínima
Para cada falha, guardar no mínimo:
1. Print da tela com o erro/comportamento.
2. Print do Console com mensagem de erro.
3. URL completa da página.
4. Horário aproximado (ex.: 14:32).

### Como limpar cache/localStorage (se necessário)
1. Abra o app e o Console.
2. Vá em **Application** (ou **Aplicativo**) no DevTools.
3. Em **Local Storage**, limpe chaves do domínio do app.
4. Recarregue a página com `Ctrl + F5` (Windows/Linux) ou `Cmd + Shift + R` (macOS).

### Como repetir um teste com segurança
- Use dados de teste com data/hora no título (ex.: “Post teste 2026-02-21 14:40”).
- Se possível, crie um post novo para cada rodada.
- Não usar conta pessoal real; usar contas de teste.
- Ao repetir denúncia, escolha outro post para evitar bloqueio por duplicidade.
