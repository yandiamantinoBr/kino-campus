-- =========================================================
-- Kino Campus — RLS Smoke Test Kit (V8.1.8.4)
-- Arquivo: docs/qa/rls-smoke.sql
-- =========================================================
-- Onde rodar:
--   - Supabase Dashboard > SQL Editor
--
-- Contexto de role (importante):
--   - SQL Editor normalmente roda com privilégios altos (owner/service role),
--     então pode NÃO refletir 100% o comportamento de anon/authenticated.
--   - Por isso, cada teste abaixo inclui alternativa confiável usando:
--       (a) client no navegador (sessão real), ou
--       (b) REST com anon key (somente chave pública anon).
--
-- Regra de ouro para interpretar:
--   - PASSA quando ataque é bloqueado por erro de permissão/RLS,
--     OU retorna vazio quando a policy esconde dados.
-- =========================================================

-- [SETUP] como localizar um post_id real
-- O que este bloco faz:
--   Busca 1 post real para usar em testes posteriores, sem inventar dado.
-- Resultado esperado:
--   Retorna 1 linha com id (ou vazio, caso não exista post).
-- Como interpretar:
--   - Se vazio: crie pelo menos 1 post no app e rode de novo.
select id, title, author_id, created_at
from public.posts
order by created_at desc
limit 1;


-- [TEST 1] reports anon select
-- O que este teste tenta fazer (ataque simulado):
--   Simular leitura indevida de denúncias por usuário anônimo.
-- Resultado esperado (PASS):
--   - Erro de permissão/RLS, OU
--   - retorno vazio (nenhuma linha), dependendo da policy aplicada.
-- Como interpretar o erro:
--   - “permission denied” / “RLS violation” = política bloqueou (PASSOU).
--   - Se retornar dados de denúncias para não-admin = FALHOU (risco alto).

-- Tentativa direta no SQL Editor (pode não reproduzir anon por limitação de contexto):
select id, post_id, reporter_id, reason, status, created_at
from public.reports
limit 20;

-- Alternativa confiável A (REST com anon key pública):
-- 1) No terminal local (não coloque service_role):
--    curl -s \
--      -H "apikey: <SUPABASE_ANON_KEY>" \
--      -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
--      "https://<PROJECT_REF>.supabase.co/rest/v1/reports?select=id,post_id,reason,status&limit=20"
-- 2) PASSA se vier [] (vazio) ou erro de permissão.

-- Alternativa confiável B (navegador sem login):
--   Abra app em aba anônima, sem sessão, e tente fluxo que consultaria reports.
--   PASSA se não houver exposição de lista de denúncias.


-- [TEST 2] posts.author_id update
-- O que este teste tenta fazer (ataque simulado):
--   Trocar o dono de um post alterando author_id manualmente.
-- Resultado esperado (PASS):
--   - UPDATE bloqueado por permissão/RLS/REVOKE de coluna.
-- Como interpretar o erro:
--   - Erro citando column-level privilege, RLS, ou permission denied = PASSOU.
--   - Se UPDATE efetivar e mudar author_id = FALHOU (risco crítico).

-- Passo 1: pegue um alvo real (copie o id retornado).
with target as (
  select id, author_id
  from public.posts
  order by created_at desc
  limit 1
)
select * from target;

-- Passo 2: ataque simulado (NÃO deve funcionar em contexto de usuário comum).
-- Substitua <POST_ID_REAL> por um UUID real do passo anterior.
-- Substitua <OUTRO_UUID> por um UUID diferente (qualquer UUID válido).
update public.posts
set author_id = '<OUTRO_UUID>'::uuid
where id = '<POST_ID_REAL>'::uuid;

-- Verificação (apenas leitura):
select id, author_id
from public.posts
where id = '<POST_ID_REAL>'::uuid;

-- Alternativa confiável (sessão real authenticated no navegador):
--   Com usuário comum logado, tente ação equivalente via client/devtools (sem endpoint admin).
--   PASSA se receber erro e author_id permanecer igual.


-- [TEST 3] profiles insert mismatched id
-- O que este teste tenta fazer (ataque simulado):
--   Inserir profile com id diferente de auth.uid() (forjar identidade).
-- Resultado esperado (PASS):
--   - INSERT bloqueado por policy de profiles.
-- Como interpretar o erro:
--   - “new row violates row-level security policy” ou “permission denied” = PASSOU.
--   - Se inserir profile com id falso = FALHOU (risco crítico).

-- Ataque simulado (NÃO deve funcionar como usuário comum):
-- Troque UUID_EXTERNO por um UUID que NÃO seja o uid da sessão autenticada.
insert into public.profiles (id, full_name, email)
values ('UUID_EXTERNO'::uuid, 'Ataque Smoke', 'ataque-smoke@exemplo.com');

-- Verificação opcional de leitura (se policies permitirem):
select id, full_name, email
from public.profiles
where id = 'UUID_EXTERNO'::uuid;

-- Alternativa confiável (client autenticado no navegador):
--   Logue com usuário A e tente inserir profile com id do usuário B via supabase-js.
--   PASSA se for bloqueado por RLS.


-- [NOTES] diferenças entre “erro” e “retornar vazio”
-- - “Erro” geralmente indica bloqueio explícito por permissão/policy.
-- - “Retornar vazio” pode indicar policy de SELECT que esconde linhas.
-- - Para segurança de leitura de reports, ambos podem ser aceitáveis,
--   desde que dados sensíveis não sejam expostos.
-- - Classificação prática:
--    PASSA: erro de permissão OU retorno vazio.
--    FALHA: dados sensíveis retornados para perfil não autorizado.


-- [EVIDENCE] como copiar prints e logs de erro do SQL Editor
-- 1) Tire print da query executada + resultado.
-- 2) Se houver erro, tire print da mensagem completa.
-- 3) Salve data/hora aproximada e ambiente (prod/preview).
-- 4) Registre no relatório QA: teste, resultado (PASSA/FALHA), evidência.
