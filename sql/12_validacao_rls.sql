-- ============================================================
-- KINO CAMPUS — Queries de Validação pós-migração
-- Execute no SQL Editor após aplicar todos os SQLs anteriores.
-- Cada query deve retornar o resultado esperado indicado no comentário.
-- ============================================================

-- ✅ TESTE 1: Quantas tabelas foram criadas?
-- Esperado: 6 ou mais (profiles, posts, post_media, reports, comments, post_votes)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ✅ TESTE 2: Quantos posts foram inseridos pelo seed?
-- Esperado: 44
SELECT count(*) AS total_seed_posts
FROM public.posts
WHERE legacy_id ~ '^\d+$';

-- ✅ TESTE 3: Distribuição por módulo
-- Esperado: todos os módulos presentes
SELECT module, count(*) AS total
FROM public.posts
GROUP BY module
ORDER BY total DESC;

-- ✅ TESTE 4: RLS ativo em todas as tabelas?
-- Esperado: rowsecurity = true em todas
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ✅ TESTE 5: Políticas RLS existentes
-- Esperado: lista com pelo menos 15+ policies
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ✅ TESTE 6: Coluna status existe em posts?
-- Esperado: retorna a linha com column_name = 'status'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'posts'
  AND column_name IN ('status', 'votos', 'legacy_id')
ORDER BY column_name;

-- ✅ TESTE 7: Coluna is_admin existe em profiles?
-- Esperado: retorna a linha com column_name = 'is_admin'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'is_admin';

-- ✅ TESTE 8: Triggers configurados?
-- Esperado: pelo menos 4 triggers (updated_at, email_verify, votes, rate_limit)
SELECT trigger_name, event_object_table, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ✅ TESTE 9: Funções criadas?
-- Esperado: check_report_rate_limit, increment_comment_likes, sync_post_votes_count, etc.
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- ✅ TESTE 10: Bucket de storage existe?
-- Esperado: retorna 'kino-media' como public
SELECT id, name, public
FROM storage.buckets
WHERE id = 'kino-media';

-- ============================================================
-- TESTE DE SEGURANÇA: verificar que email não é acessível
-- Execute este como usuário anon (sem JWT):
-- curl 'https://SEU_PROJETO.supabase.co/rest/v1/profiles?select=email' \
--   -H 'apikey: SUA_ANON_KEY' \
--   -H 'Authorization: Bearer SUA_ANON_KEY'
-- Esperado: retorna lista sem campo email (campo não visível)
-- ============================================================

-- ============================================================
-- ATIVAR SEU USUÁRIO COMO ADMIN
-- Substitua o e-mail pelo seu e-mail real.
-- Execute APÓS fazer login pelo menos uma vez no site.
-- ============================================================
-- UPDATE public.profiles
-- SET is_admin = true
-- WHERE email = 'SEU_EMAIL@ufg.br';
