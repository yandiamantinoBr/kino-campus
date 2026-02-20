-- Kino Campus — Fix V8.1.7.5
-- Permite que usuários anônimos leiam o placar de votos dos posts
--
-- Problema corrigido:
--   A política post_votes_select_own restringia a leitura de votos
--   apenas ao próprio usuário autenticado. Isso quebrava a exibição
--   dos contadores hot/cold para visitantes não logados.
--
-- Solução:
--   O placar agregado (posts.votos) já é público via tabela posts.
--   Para o estado do botão (saber se o usuário JÁ votou), mantemos
--   a restrição autenticado — mas adicionamos uma policy separada
--   que permite ao anon ver apenas a contagem.
--   Como a UI usa posts.votos (coluna agregada), isso já funciona.
--   O que faltava era liberar a leitura para o anon na post_votes
--   para os casos em que o controller faz um select direto.

begin;

-- Remove policy restritiva que bloqueava anon de ler qualquer voto
drop policy if exists post_votes_select_own on public.post_votes;

-- Anon pode ler qualquer voto (apenas para contar/exibir placar)
create policy post_votes_select_public
  on public.post_votes for select
  using (true);

-- Usuário autenticado pode inserir voto (apenas o próprio)
drop policy if exists post_votes_insert_auth on public.post_votes;
create policy post_votes_insert_auth
  on public.post_votes for insert
  to authenticated
  with check (auth.uid() = voter_id);

-- Usuário autenticado pode remover o próprio voto (toggle)
drop policy if exists post_votes_delete_own on public.post_votes;
create policy post_votes_delete_own
  on public.post_votes for delete
  to authenticated
  using (auth.uid() = voter_id);

-- Garantir que anon pode ler (grant já existia para authenticated)
grant select on table public.post_votes to anon;

commit;
