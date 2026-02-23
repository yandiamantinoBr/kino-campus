-- =========================================================
-- Kino Campus — RLS Smoke Test Kit (V8.2.2.0)
-- Arquivo: docs/qa/rls-smoke.sql
-- =========================================================
-- Onde rodar:
-- - Supabase Dashboard > SQL Editor
--
-- Contexto de role (importante):
-- - SQL Editor normalmente roda com privilégios altos (owner/service role),
--   então pode NÃO refletir 100% o comportamento de anon/authenticated.
-- - Por isso, quando houver alternativa via REST (anon key), prefira ela.
--
-- Regra de ouro para interpretar:
-- - PASSA quando ataque é bloqueado por erro de permissão/RLS,
--   OU retorna vazio quando a policy esconde dados.
-- =========================================================


-- =========================================================
-- [SETUP A] Como localizar um __POST_ID__ real (sem inventar dado)
-- Objetivo: pegar IDs reais para usar nos testes.
-- Esperado: até 5 linhas (ou vazio se não houver posts).
-- Se vier vazio: crie ao menos 1 post no app e rode de novo.
-- =========================================================
select
  id,
  title,
  author_id,
  created_at
from public.posts
order by created_at desc
limit 5;


-- =========================================================
-- [SETUP B] Como localizar um __OTHER_PROFILE_ID__ real (sem inventar dado)
-- Objetivo: pegar IDs reais de profiles para usar no Test 3.
-- Importante: escolha um ID de OUTRO usuário (não o seu).
-- Esperado: até 5 linhas (ou vazio se não houver profiles).
-- =========================================================
select
  id,
  full_name
from public.profiles
limit 5;


-- =========================================================
-- [TEST 1] reports — leitura por anon (ataque simulado)
-- O que tenta: ler denúncias (reports) sem permissão.
-- PASSA se: erro de permissão/RLS OU retorno vazio ([])
-- FALHA se: retornar dados sensíveis para não-admin/anon.
-- =========================================================

-- Tentativa direta no SQL Editor (pode não reproduzir "anon" por ser owner):
select
  id, post_id, reporter_id, reason, status, created_at
from public.reports
limit 20;

-- Alternativa confiável (REST com anon key pública):
-- curl -s \
--  -H "apikey: <SUPABASE_ANON_KEY>" \
--  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
--  "https://<PROJECT_REF>.supabase.co/rest/v1/reports?select=id,post_id,reason,status&limit=20"
--
-- PASSA se vier [] (vazio) ou erro de permissão.


-- =========================================================
-- [TEST 2] posts.author_id UPDATE (ataque simulado)
-- O que tenta: trocar o dono do post alterando author_id manualmente.
-- PASSA se: UPDATE bloqueado por RLS/permissão/REVOKE de coluna.
-- FALHA se: UPDATE efetivar e mudar author_id.
--
-- Usa placeholder: __POST_ID__
-- =========================================================

-- (2A) Confira um alvo real:
-- Copie um id real da lista do SETUP A e cole no placeholder do UPDATE abaixo.
with target as (
  select id, author_id
  from public.posts
  order by created_at desc
  limit 1
)
select * from target;

-- (2B) Ataque simulado (NÃO deve funcionar para usuário comum):
-- Substitua __POST_ID__ pelo id real do post.
update public.posts
set author_id = gen_random_uuid()
where id = '__POST_ID__'::uuid;

-- (2C) Verificação:
select id, author_id
from public.posts
where id = '__POST_ID__'::uuid;


-- =========================================================
-- [TEST 3] profiles — UPDATE em perfil de outro usuário (ataque simulado)
-- O que tenta: alterar full_name de um profile que NÃO é do usuário logado.
-- PASSA se: UPDATE bloqueado por RLS/permissão.
-- FALHA se: UPDATE efetivar em perfil de outro usuário.
--
-- Usa placeholder: __OTHER_PROFILE_ID__
-- =========================================================

-- (3A) Ataque simulado:
-- Substitua __OTHER_PROFILE_ID__ por um UUID real de OUTRO profile (SETUP B).
update public.profiles
set full_name = 'Ataque Smoke UPDATE (V8.2.2.0)'
where id = '__OTHER_PROFILE_ID__'::uuid;

-- (3B) Verificação (opcional):
select id, full_name
from public.profiles
where id = '__OTHER_PROFILE_ID__'::uuid;


-- =========================================================
-- [NOTES] diferenças entre “erro” e “retornar vazio”
-- - “Erro” geralmente indica bloqueio explícito por permissão/policy.
-- - “Vazio” pode indicar policy de SELECT que esconde linhas.
-- - PASSA: erro de permissão OU retorno vazio (quando aplicável).
-- - FALHA: dados sensíveis retornados para perfil não autorizado.
-- =========================================================
