-- ============================================================
-- Kino Campus — V8.2.6.0
-- Fix: carregamento de publicações em todos os módulos
--
-- Problema:
--   A query getPosts() inclui comments(count) via PostgREST.
--   Se a tabela comments ou a relação post_votes não existirem
--   no banco, o feed fica completamente vazio em todos os módulos.
--
-- Este script é IDEMPOTENTE — pode ser executado mais de uma vez.
--
-- Ordem de execução:
--   1) Extensões
--   2) Coluna posts.votos (se ausente)
--   3) Tabela post_votes + trigger (compat v8.1.7.3)
--   4) Tabela comments (compat v8.1.7.2)
--   5) Grants de leitura para anon
--   6) Seed condicional — 44 posts iniciais (apenas se posts = 0)
--   7) Verificação final
-- ============================================================

begin;

-- ============================================================
-- 1) Extensões
-- ============================================================
create extension if not exists pgcrypto;

-- ============================================================
-- 2) posts.votos — adicionado em v8.1.7.3 (idempotente)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'votos'
  ) then
    alter table public.posts add column votos integer not null default 0;
  end if;
end $$;

-- ============================================================
-- 3) posts.status — adicionado em v8.1.7.0 (idempotente)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'status'
  ) then
    alter table public.posts
      add column status text not null default 'published';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_status_check'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_status_check
      check (status in ('published', 'pending', 'hidden', 'deleted'));
  end if;
end $$;

create index if not exists posts_status_idx on public.posts (status);

-- RLS: apenas posts published são visíveis publicamente
drop policy if exists posts_select_public on public.posts;
drop policy if exists posts_select_published on public.posts;
create policy posts_select_published
  on public.posts for select
  using (
    status = 'published'
    or (auth.uid() is not null and auth.uid() = author_id)
  );

-- ============================================================
-- 4) post_votes — v8.1.7.3 (idempotente)
-- ============================================================
create table if not exists public.post_votes (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  post_id     uuid        not null references public.posts(id) on delete cascade,
  voter_id    uuid        not null references public.profiles(id) on delete cascade,
  direction   text        not null,
  unique (post_id, voter_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'post_votes_direction_check' and conrelid = 'public.post_votes'::regclass
  ) then
    alter table public.post_votes
      add constraint post_votes_direction_check
      check (direction in ('hot', 'cold'));
  end if;
end $$;

create index if not exists post_votes_post_id_idx  on public.post_votes (post_id);
create index if not exists post_votes_voter_id_idx on public.post_votes (voter_id);

alter table public.post_votes enable row level security;

drop policy if exists post_votes_select_own  on public.post_votes;
drop policy if exists post_votes_insert_auth on public.post_votes;
drop policy if exists post_votes_delete_own  on public.post_votes;

create policy post_votes_select_own
  on public.post_votes for select
  to authenticated
  using (auth.uid() = voter_id);

create policy post_votes_insert_auth
  on public.post_votes for insert
  to authenticated
  with check (auth.uid() = voter_id);

create policy post_votes_delete_own
  on public.post_votes for delete
  to authenticated
  using (auth.uid() = voter_id);

grant select, insert, delete on table public.post_votes to authenticated;
grant all on table public.post_votes to service_role;
revoke all on table public.post_votes from anon;

-- Trigger que sincroniza posts.votos
create or replace function public.sync_post_votes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_score integer;
begin
  select coalesce(
    (select count(*) filter (where direction = 'hot') -
            count(*) filter (where direction = 'cold')
     from public.post_votes
     where post_id = coalesce(new.post_id, old.post_id)),
    0
  ) into new_score;

  update public.posts
     set votos = new_score
   where id = coalesce(new.post_id, old.post_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_post_votes on public.post_votes;
create trigger trg_sync_post_votes
  after insert or delete on public.post_votes
  for each row execute function public.sync_post_votes_count();

-- ============================================================
-- 5) comments — v8.1.7.2 (idempotente)
--    ESTA TABELA É CRÍTICA: sem ela, getPosts() falha via PostgREST
-- ============================================================
create table if not exists public.comments (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  post_id     uuid        not null references public.posts(id) on delete cascade,
  author_id   uuid        not null references public.profiles(id) on delete cascade,
  author_name text        not null default 'Anônimo',
  body        text        not null,
  likes       integer     not null default 0
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_body_nonempty' and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_body_nonempty check (char_length(trim(body)) > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_body_maxlen' and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_body_maxlen check (char_length(body) <= 2000);
  end if;
end $$;

create index if not exists comments_post_id_idx   on public.comments (post_id);
create index if not exists comments_author_id_idx on public.comments (author_id);
create index if not exists comments_created_at_idx on public.comments (created_at desc);

alter table public.comments enable row level security;

drop policy if exists comments_select_public on public.comments;
drop policy if exists comments_insert_auth   on public.comments;
drop policy if exists comments_update_own    on public.comments;
drop policy if exists comments_delete_own    on public.comments;

create policy comments_select_public
  on public.comments for select
  using (true);

create policy comments_insert_auth
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy comments_update_own
  on public.comments for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy comments_delete_own
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id);

grant select on table public.comments to anon;
grant select on table public.comments to authenticated;
grant insert, update, delete on table public.comments to authenticated;
grant all on table public.comments to service_role;

-- RPC para incrementar likes de comentários
create or replace function public.increment_comment_likes(comment_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_likes integer;
begin
  update public.comments
     set likes = likes + 1
   where id = comment_uuid
  returning likes into new_likes;
  return coalesce(new_likes, 0);
end;
$$;

grant execute on function public.increment_comment_likes(uuid) to authenticated;

-- ============================================================
-- 6) Grants adicionais para anon
-- ============================================================
grant select on public.profiles, public.posts, public.post_media to anon;

-- ============================================================
-- 7) Seed condicional — 44 posts iniciais
--    Executado APENAS se a tabela posts estiver vazia
-- ============================================================
do $$
declare
  post_count integer;
begin
  select count(*) into post_count from public.posts;

  if post_count = 0 then
    raise notice 'Tabela posts vazia — inserindo seed de 44 posts...';

    insert into public.posts (legacy_id, author_id, title, description, price, module, category, status, votos, metadata) values
    ('1', NULL, 'Notebook Dell Inspiron 15 - i5 8GB 256GB SSD', 'Notebook em ótimo estado, pouco uso. Intel Core i5 10ª geração, 8GB RAM, SSD 256GB. Tela 15.6" Full HD. Bateria com boa duração. Acompanha carregador original. Sem arranhões ou defeitos.', 1800, 'compra-venda', 'eletronicos', 'published', 156, '{"emoji":"💻","subcategoria":"notebook","condicao":"seminovo","verificado":true,"precoOriginal":null,"precoTexto":null,"autorNome":"Rafael Almeida","autorAvatar":"https://i.pravatar.cc/150?img=12","rating":4.7,"comentarios":23,"timestamp":"Há 2 horas","tags":["notebook","dell","inspiron","i5","ssd","laptop","computador"]}'),
    ('2', NULL, 'Kit Livros Cálculo I, II e III - James Stewart', 'Vendo kit completo de livros de Cálculo do James Stewart (7ª edição). Volumes I, II e III em bom estado de conservação. Algumas anotações a lápis. Perfeito para estudantes de Engenharia e Matemática.', 280, 'compra-venda', 'livros', 'published', 92, '{"emoji":"📚","subcategoria":"engenharia","condicao":"seminovo","verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Fernanda Lima","autorAvatar":"https://i.pravatar.cc/150?img=35","rating":5.0,"comentarios":15,"timestamp":"Há 1 dia","tags":["livro","cálculo","stewart","engenharia","matemática","exatas"]}'),
    ('3', NULL, 'Cama Box Solteiro + Colchão Ortobom - Semi-novo', 'Cama box solteiro com colchão Ortobom em excelente estado. Apenas 6 meses de uso. Motivo da venda: mudança de cidade. Retirada no local (Setor Universitário). Não entrego.', 450, 'compra-venda', 'moveis', 'published', 78, '{"emoji":"🛋️","subcategoria":"quarto","condicao":"seminovo","verificado":false,"precoOriginal":600,"precoTexto":null,"autorNome":"Ricardo Souza","autorAvatar":"https://i.pravatar.cc/150?img=28","rating":4.7,"comentarios":11,"timestamp":"Há 3 horas","tags":["cama","box","colchão","ortobom","quarto","móvel","solteiro"],"promocao":true}'),
    ('4', NULL, 'iPhone 12 64GB - Preto (Seminovo)', 'iPhone 12 em ótimo estado. Bateria com 89% de saúde. Sem arranhões na tela (sempre usou película). Acompanha caixa original, carregador e fone. Nota fiscal disponível. Aceito cartão com acréscimo.', 2200, 'compra-venda', 'eletronicos', 'published', 134, '{"emoji":"📱","subcategoria":"smartphone","condicao":"seminovo","verificado":true,"precoOriginal":null,"precoTexto":null,"autorNome":"Camila Rodrigues","autorAvatar":"https://i.pravatar.cc/150?img=42","rating":4.8,"comentarios":28,"timestamp":"Há 5 horas","tags":["iphone","apple","smartphone","celular","iphone 12"]}'),
    ('5', NULL, 'Lote Roupas Femininas - 15 Peças (P e M)', 'Vendo lote com 15 peças de roupas femininas (blusas, vestidos e saias). Tamanhos P e M. Todas em bom estado, pouco uso. Marcas variadas. Ótimo para brechó ou uso pessoal. Venda apenas do lote completo.', 120, 'compra-venda', 'vestuario', 'published', 45, '{"emoji":"👕","subcategoria":"roupas","condicao":"seminovo","verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Beatriz Santos","autorAvatar":"https://i.pravatar.cc/150?img=48","rating":4.6,"comentarios":8,"timestamp":"Há 2 dias","tags":["roupa","feminino","blusa","vestido","saia","lote","brechó"]}'),
    ('6', NULL, 'Fone Bluetooth JBL Tune 510BT - Novo na Caixa', 'Fone de ouvido Bluetooth JBL Tune 510BT novo, lacrado na caixa. Ganhei de presente mas já tenho um. Cor preta. Bateria de até 40h. Som de qualidade JBL. Aceito PIX ou dinheiro.', 180, 'compra-venda', 'eletronicos', 'published', 112, '{"emoji":"🎧","subcategoria":"audio","condicao":"novo","verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Thiago Alves","autorAvatar":"https://i.pravatar.cc/150?img=52","rating":4.9,"comentarios":19,"timestamp":"Há 6 horas","tags":["fone","jbl","bluetooth","headphone","áudio","música"]}'),
    ('7', NULL, 'Tratado de Fisiologia Médica - Guyton 13ª Edição', 'Livro Guyton de Fisiologia Médica, 13ª edição. Em bom estado, algumas anotações a lápis e marca-textos. Capa dura. Essencial para estudantes de Medicina e áreas da saúde. Retirada no Campus Samambaia.', 320, 'compra-venda', 'livros', 'published', 67, '{"emoji":"📖","subcategoria":"medicina","condicao":"seminovo","verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Gabriela Mendes","autorAvatar":"https://i.pravatar.cc/150?img=60","rating":5.0,"comentarios":13,"timestamp":"Há 1 semana","tags":["livro","medicina","guyton","fisiologia","saúde"]}'),
    ('8', NULL, 'Bicicleta Mountain Bike Caloi 21 Marchas', 'Bicicleta Caloi Mountain Bike em bom estado. 21 marchas, aro 26, freios a disco. Revisada recentemente. Ótima para deslocamento no campus. Motivo da venda: comprei carro. Aceito propostas razoáveis.', 650, 'compra-venda', 'outros', 'published', 89, '{"emoji":"🚲","subcategoria":"bicicleta","condicao":"seminovo","verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Felipe Costa","autorAvatar":"https://i.pravatar.cc/150?img=65","rating":4.7,"comentarios":16,"timestamp":"Há 4 dias","tags":["bicicleta","bike","caloi","mountain bike","transporte"]}'),
    ('9', NULL, 'Livro Cálculo Vol.1 - James Stewart (8ª Edição)', 'Livro de Cálculo Volume 1 do James Stewart, 8ª edição. Em ótimo estado, sem anotações. Ideal para estudantes de Engenharia, Matemática e Física.', 120, 'livros', 'exatas', 'published', 42, '{"emoji":"📘","subcategoria":"calculo","condicao":"seminovo","verificado":true,"precoOriginal":150,"precoTexto":null,"autorNome":"Maria Souza","autorAvatar":"https://i.pravatar.cc/150?img=25","rating":4.7,"comentarios":8,"timestamp":"Há 3 horas","tags":["livro","cálculo","stewart","exatas","engenharia","matemática"]}'),
    ('10', NULL, 'Notebook Dell Inspiron i5 - 8ª geração, 8GB RAM', 'Vendo notebook Dell Inspiron 15 3000 em excelente estado. Intel Core i5 8ª geração, 8GB RAM, SSD 256GB. Tela Full HD. Bateria com boa duração.', 2500, 'compra-venda', 'eletronicos', 'published', 78, '{"emoji":"💻","subcategoria":"notebook","condicao":"seminovo","verificado":true,"precoOriginal":2650,"precoTexto":null,"autorNome":"João Pedro","autorAvatar":"https://i.pravatar.cc/150?img=33","rating":4.8,"comentarios":11,"timestamp":"Há 1 dia","tags":["notebook","dell","inspiron","i5","laptop","computador"]}'),
    ('11', NULL, 'Carona Goiânia → Campus Samambaia', 'Ofereço carona de Goiânia (Setor Bueno) para o Campus Samambaia da UFG. Saída às 7h30. Tenho 3 vagas disponíveis. Contribuição de R$ 5,00 por pessoa.', 5, 'caronas', 'ida', 'published', 156, '{"emoji":"🚗","subcategoria":"goiania-campus","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":null,"autorNome":"Carlos Silva","autorAvatar":"https://i.pravatar.cc/150?img=15","rating":4.9,"comentarios":23,"timestamp":"Há 1 hora","tags":["carona","goiânia","campus","samambaia","ufg","ida"]}'),
    ('12', NULL, 'Carona Campus Samambaia → Goiânia', 'Ofereço carona do Campus Samambaia para Goiânia (Setor Marista). Saída às 18h. Tenho 2 vagas. Contribuição de R$ 5,00.', 5, 'caronas', 'volta', 'published', 89, '{"emoji":"🚗","subcategoria":"campus-goiania","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Ana Paula","autorAvatar":"https://i.pravatar.cc/150?img=20","rating":4.7,"comentarios":12,"timestamp":"Há 2 horas","tags":["carona","goiânia","campus","samambaia","volta","marista"]}'),
    ('13', NULL, 'Estágio em Desenvolvimento Web - TechCorp', 'Vaga de estágio para estudantes de Ciência da Computação, Engenharia de Software ou áreas afins. Requisitos: conhecimento em HTML, CSS, JavaScript. Bolsa de R$ 1.200,00 + VT.', 1200, 'oportunidades', 'estagio', 'published', 234, '{"emoji":"💼","subcategoria":"tecnologia","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":null,"autorNome":"TechCorp RH","autorAvatar":"https://i.pravatar.cc/150?img=50","rating":4.8,"comentarios":45,"timestamp":"Há 3 dias","tags":["estágio","desenvolvimento","web","tecnologia","programação","ti"]}'),
    ('14', NULL, 'Analista de Marketing Digital - Startup XYZ', 'Vaga para Analista de Marketing Digital. Experiência com redes sociais, Google Ads e SEO. Salário: R$ 3.500,00 + benefícios. Trabalho híbrido.', 3500, 'oportunidades', 'emprego', 'published', 156, '{"emoji":"📈","subcategoria":"marketing","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":null,"autorNome":"Startup XYZ","autorAvatar":"https://i.pravatar.cc/150?img=55","rating":4.6,"comentarios":28,"timestamp":"Há 1 semana","tags":["emprego","marketing","digital","redes sociais","seo","ads"]}'),
    ('15', NULL, 'Carteira perdida - Campus Samambaia', 'Perdi minha carteira preta no dia 10/12 próximo ao RU do Campus Samambaia. Contém RG, CPF e cartão do banco. Recompensa para quem encontrar.', NULL, 'achados-perdidos', 'perdido', 'published', 45, '{"emoji":"👛","subcategoria":"documentos","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Lucas Mendes","autorAvatar":"https://i.pravatar.cc/150?img=22","rating":null,"comentarios":12,"timestamp":"Há 2 dias","tags":["perdido","carteira","documentos","rg","cpf","campus","samambaia"]}'),
    ('16', NULL, 'Fone de ouvido encontrado - Biblioteca Central', 'Encontrei um fone de ouvido JBL preto na Biblioteca Central, próximo às mesas de estudo. Está comigo, entre em contato para retirar.', NULL, 'achados-perdidos', 'achado', 'published', 23, '{"emoji":"🎧","subcategoria":"eletronicos","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Mariana Costa","autorAvatar":"https://i.pravatar.cc/150?img=30","rating":null,"comentarios":5,"timestamp":"Há 1 dia","tags":["achado","fone","jbl","biblioteca","encontrado"]}'),
    ('17', NULL, 'Semana de Tecnologia UFG 2024', 'Confira a programação completa da Semana de Tecnologia da UFG. Palestras, workshops e minicursos sobre IA, desenvolvimento web, cybersecurity e muito mais.', 0, 'eventos', 'academico', 'published', 567, '{"emoji":"🎓","subcategoria":"palestra","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":null,"autorNome":"UFG Eventos","autorAvatar":"https://i.pravatar.cc/150?img=45","rating":4.9,"comentarios":89,"timestamp":"Há 1 semana","tags":["evento","tecnologia","ufg","palestra","workshop","ia"]}'),
    ('18', NULL, 'Vaga em República - Setor Universitário', 'Vaga em república mista no Setor Universitário. Quarto individual, banheiro compartilhado. Aluguel R$ 600,00 + despesas (~R$ 150,00). Próximo ao Campus.', 600, 'moradia', 'quarto', 'published', 34, '{"emoji":"🏠","subcategoria":"republica","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Pedro Henrique","autorAvatar":"https://i.pravatar.cc/150?img=40","rating":4.5,"comentarios":8,"timestamp":"Há 3 dias","tags":["moradia","república","quarto","aluguel","setor universitário"]}'),
    ('19', NULL, 'Carona Campus Samambaia → Setor Universitário (Segunda a Sexta)', 'Ofereço carona regular de segunda a sexta-feira. Rota Campus Samambaia (saída às 7h) para Setor Universitário (chegada às 7h30). Retorno às 18h30. Carro confortável com ar-condicionado. 2 vagas disponíveis.', 5, 'caronas', 'ofereco carona', 'published', 87, '{"emoji":"🚗","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"R$ 5,00/trecho Ida e volta","autorNome":"Carlos Henrique","autorAvatar":"https://i.pravatar.cc/150?img=13","rating":4.8,"comentarios":5,"timestamp":"Há 1 dia","tags":["carona","campus","samambaia","setor","universitario","segunda","sexta"]}'),
    ('20', NULL, 'Procuro Carona Setor Bueno → Campus Samambaia (Manhã)', 'Estudante de Medicina procura carona regular do Setor Bueno para o Campus Samambaia. Horário de entrada às 8h. Posso ajudar com combustível.', NULL, 'caronas', 'procuro carona', 'published', 54, '{"emoji":"🚗","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"Valor a combinar","autorNome":"Mariana Costa","autorAvatar":"https://i.pravatar.cc/150?img=25","rating":4.9,"comentarios":12,"timestamp":"Há 3 horas","tags":["procuro","carona","setor","bueno","campus","samambaia","manha"]}'),
    ('21', NULL, 'Carona Jardim Goiás → Campus II (Terça e Quinta)', 'Ofereço carona às terças e quintas-feiras. Saída do Jardim Goiás às 7h30 com chegada ao Campus II às 8h. Tenho 3 vagas disponíveis.', 8, 'caronas', 'ofereco carona', 'published', 42, '{"emoji":"🚗","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"R$ 8,00/trecho","autorNome":"Rafael Santos","autorAvatar":"https://i.pravatar.cc/150?img=40","rating":4.7,"comentarios":7,"timestamp":"Há 2 dias","tags":["carona","jardim","goias","campus","terca","quinta"]}'),
    ('22', NULL, 'Carona Setor Sul → Campus Samambaia (Noturno)', 'Ofereço carona para o período noturno. Saída do Setor Sul às 18h com chegada ao Campus Samambaia às 18h30. Retorno às 22h30. Carro elétrico. 2 vagas.', 6, 'caronas', 'ofereco carona', 'published', 68, '{"emoji":"🚗","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"R$ 6,00/trecho","autorNome":"Juliana Oliveira","autorAvatar":"https://i.pravatar.cc/150?img=45","rating":5.0,"comentarios":9,"timestamp":"Há 5 horas","tags":["carona","setor","sul","campus","samambaia","noturno"]}'),
    ('23', NULL, 'Procuro Carona Fixa Setor Leste → Campus I', 'Estudante de Arquitetura procura carona fixa de segunda a sexta. Horário flexível entre 7h e 8h. Posso ajudar com combustível.', 4, 'caronas', 'procuro carona', 'published', 31, '{"emoji":"🚗","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"R$ 4,00/trecho","autorNome":"Pedro Almeida","autorAvatar":"https://i.pravatar.cc/150?img=50","rating":4.6,"comentarios":4,"timestamp":"Há 1 semana","tags":["procuro","carona","fixa","setor","leste","universitario","campus"]}'),
    ('24', NULL, 'Carona Centro → Campus Colemar Natal (Flexível)', 'Ofereço carona do Centro para o Campus Colemar Natal. Horário flexível entre 7h30 e 8h30. Tenho 1 vaga. Valor a combinar.', NULL, 'caronas', 'ofereco carona', 'published', 25, '{"emoji":"🚗","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"Negociável","autorNome":"Amanda Silva","autorAvatar":"https://i.pravatar.cc/150?img=55","rating":4.8,"comentarios":6,"timestamp":"Há 3 dias","tags":["carona","centro","campus","colemar","natal","flexivel"]}'),
    ('25', NULL, 'Carteira Marrom com Documentos e Cartões', 'Perdi minha carteira marrom de couro próximo à Biblioteca Central do Campus Samambaia. Contém RG, CNH, cartões bancários e carteirinha da UFG. Recompensa!', NULL, 'achados-perdidos', 'perdido', 'published', 45, '{"emoji":"💳","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Fernando Santos","autorAvatar":"https://i.pravatar.cc/150?img=35","rating":null,"comentarios":8,"timestamp":"Há 2 horas","tags":["carteira","marrom","documentos","cartoes"]}'),
    ('26', NULL, 'Celular Samsung Galaxy Encontrado no RU', 'Encontrei um celular Samsung Galaxy no Restaurante Universitário do Campus II. Está com a tela bloqueada. Deixei na recepção da administração do RU.', NULL, 'achados-perdidos', 'encontrado', 'published', 67, '{"emoji":"📱","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":null,"autorNome":"Beatriz Lima","autorAvatar":"https://i.pravatar.cc/150?img=36","rating":null,"comentarios":12,"timestamp":"Há 1 dia","tags":["celular","samsung","galaxy","encontrado"]}'),
    ('27', NULL, 'Molho de Chaves com Chaveiro da UFG', 'Perdi um molho de chaves (3 chaves) com chaveiro verde da UFG no estacionamento do Campus Samambaia, próximo ao bloco de Engenharia.', NULL, 'achados-perdidos', 'perdido', 'published', 32, '{"emoji":"🔑","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Roberto Oliveira","autorAvatar":"https://i.pravatar.cc/150?img=37","rating":null,"comentarios":5,"timestamp":"Há 3 dias","tags":["molho","chaves","chaveiro","ufg"]}'),
    ('28', NULL, 'Livro de Física Encontrado na Biblioteca', 'Encontrei um livro "Fundamentos de Física - Halliday" na mesa de estudos da Biblioteca Central. Tem anotações e nome na primeira página. Entreguei na recepção.', NULL, 'achados-perdidos', 'encontrado', 'published', 28, '{"emoji":"🔎","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":null,"autorNome":"Amanda Rodrigues","autorAvatar":"https://i.pravatar.cc/150?img=38","rating":null,"comentarios":3,"timestamp":"Há 1 semana","tags":["livro","fisica","encontrado","biblioteca"]}'),
    ('29', NULL, 'Workshop: Práticas Sustentáveis no Campus', 'Workshop prático sobre implementação de práticas sustentáveis no dia a dia universitário. Local: Auditório da Faculdade de Ciências Ambientais. Horário: 14h às 17h.', NULL, 'eventos', 'eventos', 'published', 56, '{"emoji":"👋","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"Gratuito com inscrição prévia","autorNome":"CA Ciências Ambientais","autorAvatar":"https://i.pravatar.cc/150?img=14","rating":4.9,"comentarios":7,"timestamp":"Amanhã","tags":["workshop","praticas","sustentaveis","campus","universitario"]}'),
    ('30', NULL, 'Palestra: Inteligência Artificial e o Futuro do Trabalho', 'Palestra com Prof. Dr. João Santos sobre as transformações no mercado de trabalho com a ascensão da IA. Auditório Central, 19h.', NULL, 'eventos', 'eventos', 'published', 89, '{"emoji":"🎤","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"Gratuito","autorNome":"Instituto de Informática","autorAvatar":"https://i.pravatar.cc/150?img=15","rating":4.8,"comentarios":15,"timestamp":"Próxima semana","tags":["palestra","inteligencia","artificial","futuro","trabalho"]}'),
    ('31', NULL, 'Festival Cultural UFG 2025 - Música, Arte e Diversidade', 'Três dias de apresentações musicais, exposições de arte, teatro e gastronomia. Praça Universitária, das 14h às 22h.', NULL, 'eventos', 'eventos', 'published', 142, '{"emoji":"📅","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"Gratuito aberto ao público","autorNome":"Pró-Reitoria de Extensão","autorAvatar":"https://i.pravatar.cc/150?img=16","rating":5.0,"comentarios":28,"timestamp":"Em 2 semanas","tags":["festival","cultural","ufg","2025","musica","arte","diversidade"]}'),
    ('32', NULL, 'Torneio Interuniversitário de Futsal - Fase Classificatória', 'Venha torcer pela equipe da UFG no torneio interuniversitário. Ginásio Poliesportivo, a partir das 9h.', NULL, 'eventos', 'eventos', 'published', 67, '{"emoji":"📅","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"Gratuito entrada livre","autorNome":"Atlética UFG","autorAvatar":"https://i.pravatar.cc/150?img=17","rating":4.6,"comentarios":12,"timestamp":"Sábado","tags":["torneio","interuniversitario","futsal","fase","classificatoria"]}'),
    ('33', NULL, 'Feira de Troca de Materiais Acadêmicos', 'Traga seus livros, apostilas e materiais acadêmicos usados e troque por outros que você precisa. Praça da Biblioteca Central, das 10h às 16h.', NULL, 'eventos', 'eventos', 'published', 95, '{"emoji":"🎉","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"Gratuito traga seus materiais","autorNome":"DCE UFG","autorAvatar":"https://i.pravatar.cc/150?img=18","rating":4.7,"comentarios":21,"timestamp":"Sexta-feira","tags":["feira","troca","materiais","academicos"]}'),
    ('34', NULL, 'Vaga em República Feminina - Setor Universitário (5 min da UFG)', 'República feminina com 6 moradoras. Quarto compartilhado (2 pessoas), casa com sala, cozinha, 2 banheiros, área de serviço. Internet fibra, mobiliado.', 450, 'moradia', 'moradia', 'published', 78, '{"emoji":"🏡","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"R$ 450,00/mês + contas divididas","autorNome":"Mariana Costa","autorAvatar":"https://i.pravatar.cc/150?img=25","rating":4.9,"comentarios":18,"timestamp":"Há 1 dia","tags":["vaga","republica","feminina","setor","universitario","ufg"]}'),
    ('35', NULL, 'Quarto Individual com Banheiro - Campus Samambaia', 'Quarto individual com banheiro privativo em casa familiar. Mobiliado (cama, guarda-roupa, mesa de estudos). Acesso à cozinha e área de serviço.', 650, 'moradia', 'moradia', 'published', 52, '{"emoji":"🛋️","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"R$ 650,00/mês contas inclusas","autorNome":"Maria Silva","autorAvatar":"https://i.pravatar.cc/150?img=26","rating":5.0,"comentarios":9,"timestamp":"Há 3 horas","tags":["quarto","individual","banheiro","campus","samambaia"]}'),
    ('36', NULL, 'Apartamento 2 Quartos para Compartilhar - Setor Leste', 'Apartamento com 2 quartos, sala, cozinha, banheiro. Mobiliado, com geladeira, fogão, máquina de lavar. Condomínio com portaria 24h.', 550, 'moradia', 'moradia', 'published', 64, '{"emoji":"🏘️","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"R$ 550,00/mês por pessoa (2 vagas)","autorNome":"Pedro Henrique","autorAvatar":"https://i.pravatar.cc/150?img=27","rating":4.7,"comentarios":14,"timestamp":"Há 2 dias","tags":["apartamento","quartos","compartilhar","setor","leste"]}'),
    ('37', NULL, 'Procuro Quarto ou Vaga em República - Até R$ 500/mês', 'Estudante de Medicina procura quarto ou vaga em república próxima ao Campus Samambaia. Prefiro ambiente tranquilo para estudos. Não fumante.', 500, 'moradia', 'moradia', 'published', 31, '{"emoji":"🏠","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"Orçamento: R$ 500,00/mês","autorNome":"Júlia Martins","autorAvatar":"https://i.pravatar.cc/150?img=28","rating":4.8,"comentarios":6,"timestamp":"Há 5 horas","tags":["procuro","quarto","vaga","republica","500","mes"]}'),
    ('38', NULL, 'Estágio em Desenvolvimento Web - React e Node.js', 'Startup de tecnologia busca estagiário para desenvolvimento web. Conhecimentos em React, Node.js e Git. Modalidade híbrida (2x presencial). Ambiente jovem e dinâmico.', 1200, 'oportunidades', 'estagio', 'published', 124, '{"emoji":"💻","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"R$ 1.200,00/mês + benefícios","autorNome":"TechStart Soluções","autorAvatar":"https://i.pravatar.cc/150?img=30","rating":4.8,"comentarios":32,"timestamp":"Há 1 dia","tags":["estagio","desenvolvimento","web","react","node"]}'),
    ('39', NULL, 'Analista de Marketing Digital Júnior - CLT', 'Agência de marketing digital contrata analista júnior. Experiência com Google Ads, Facebook Ads e Analytics. Formação em Marketing, Publicidade ou áreas afins.', 2800, 'oportunidades', 'emprego', 'published', 98, '{"emoji":"💼","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"R$ 2.800,00/mês + VT, VR, plano de saúde","autorNome":"Digital Marketing Agency","autorAvatar":"https://i.pravatar.cc/150?img=31","rating":4.6,"comentarios":24,"timestamp":"Há 3 horas","tags":["analista","marketing","digital","junior","clt"]}'),
    ('40', NULL, 'Designer para Criação de Identidade Visual - Projeto Pontual', 'Preciso de designer para criar identidade visual completa (logo, paleta de cores, tipografia) para startup. Prazo: 15 dias. Portfólio necessário.', 800, 'oportunidades', 'freelancer', 'published', 67, '{"emoji":"💼","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":null,"autorNome":"Lucas Ferreira","autorAvatar":"https://i.pravatar.cc/150?img=32","rating":4.9,"comentarios":15,"timestamp":"Há 2 dias","tags":["designer","criacao","identidade","visual","projeto","pontual"]}'),
    ('41', NULL, 'Vaga de Monitor Voluntário - Cálculo I e II', 'Instituto de Matemática busca monitores voluntários para auxiliar alunos em Cálculo I e II. Horário flexível, 4h semanais. Certificado ao final do semestre.', NULL, 'oportunidades', 'monitoria', 'published', 45, '{"emoji":"💼","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"Voluntário certificado de 40h","autorNome":"Instituto de Matemática - UFG","autorAvatar":"https://i.pravatar.cc/150?img=33","rating":5.0,"comentarios":8,"timestamp":"Há 1 semana","tags":["vaga","monitor","voluntario","calculo"]}'),
    ('42', NULL, 'Voluntários para Aulas de Reforço - Comunidade Carente', 'ONG busca voluntários para dar aulas de reforço escolar (português e matemática) para crianças de comunidade carente. Experiência com ensino é um diferencial.', NULL, 'oportunidades', 'voluntariado', 'published', 82, '{"emoji":"🌐","subcategoria":"","condicao":null,"verificado":false,"precoOriginal":null,"precoTexto":"Voluntário sábados, 14h às 17h","autorNome":"ONG Educação para Todos","autorAvatar":"https://i.pravatar.cc/150?img=34","rating":4.9,"comentarios":19,"timestamp":"Há 3 dias","tags":["voluntarios","aulas","reforco","comunidade","carente"]}'),
    ('43', NULL, 'Livro Cálculo Vol.1 - James Stewart (8ª Edição) - Excelente estado', 'Livro em excelente estado, sem anotações. Perfeito para estudantes de Engenharia, Matemática e Física. Aceito PIX.', 120, 'livros', 'livros', 'published', 42, '{"emoji":"📚","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"R$ 120,00 ou R$ 110/PIX","autorNome":"Maria Souza","autorAvatar":"https://i.pravatar.cc/150?img=16","rating":4.7,"comentarios":8,"timestamp":"Há 2 horas","tags":["livro","calculo","james","stewart","edicao","excelente","estado"]}'),
    ('44', NULL, 'Notebook Dell Inspiron i5 - 8ª geração, 8GB RAM, SSD 256GB', 'Vendo notebook Dell Inspiron 15 3000 em excelente estado, comprado há 1 ano e pouco usado. Ideal para estudos.', 2500, 'compra-venda', 'eletronicos', 'published', 28, '{"emoji":"🛍️","subcategoria":"","condicao":null,"verificado":true,"precoOriginal":null,"precoTexto":"R$ 2.500,00 ou R$ 2.350/PIX","autorNome":"Rafael Almeida","autorAvatar":"https://i.pravatar.cc/150?img=12","rating":4.7,"comentarios":7,"timestamp":"Há 1 hora","tags":["notebook","dell","inspiron","8gb","ram","ssd","256gb"]}')
    on conflict (legacy_id) do nothing;

    raise notice 'Seed concluído.';
  else
    raise notice 'Tabela posts já tem % registro(s) — seed ignorado.', post_count;
  end if;
end $$;

commit;

-- ============================================================
-- Verificação final
-- ============================================================
select
  (select count(*) from public.posts where status = 'published')  as posts_publicados,
  (select count(*) from information_schema.tables
   where table_schema = 'public' and table_name = 'comments')     as tabela_comments_existe,
  (select count(*) from information_schema.tables
   where table_schema = 'public' and table_name = 'post_votes')   as tabela_post_votes_existe,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'posts'
     and column_name = 'votos')                                   as coluna_votos_existe;
-- Esperado: posts_publicados >= 44, demais colunas = 1
