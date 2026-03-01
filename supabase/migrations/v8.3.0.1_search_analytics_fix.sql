-- v8.3.0.1 — Search Analytics (fix idempotente)
-- Corrige: ERROR 42710: policy "search_queries_insert_authenticated" already exists
-- Esta migration é completamente idempotente e pode ser executada mesmo se v8.3.0.0 foi
-- parcialmente aplicada. Usa DROP POLICY IF EXISTS antes de recriar as políticas.

-- ─── Tabela search_queries (idempotente) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.search_queries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  term        text        NOT NULL CHECK (char_length(term) BETWEEN 1 AND 200),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices (idempotentes por IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_search_queries_term
  ON public.search_queries (lower(term));

CREATE INDEX IF NOT EXISTS idx_search_queries_created_at
  ON public.search_queries (created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

-- Remove políticas existentes (evita erro de duplicata)
DROP POLICY IF EXISTS "search_queries_insert_authenticated" ON public.search_queries;
DROP POLICY IF EXISTS "search_queries_insert_anon"          ON public.search_queries;
DROP POLICY IF EXISTS "search_queries_select_admin"         ON public.search_queries;

-- Qualquer pessoa autenticada pode inserir
CREATE POLICY "search_queries_insert_authenticated"
  ON public.search_queries
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Usuários anon também podem inserir
CREATE POLICY "search_queries_insert_anon"
  ON public.search_queries
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Apenas admins podem ler
CREATE POLICY "search_queries_select_admin"
  ON public.search_queries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- ─── Função RPC para tendências de busca (admin) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.kc_admin_search_trends(p_limit integer DEFAULT 10)
RETURNS TABLE (term text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(sq.term) AS term,
    count(*)::bigint AS count
  FROM public.search_queries sq
  WHERE sq.created_at >= now() - interval '30 days'
  GROUP BY lower(sq.term)
  ORDER BY count DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_search_trends(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_search_trends(integer) TO authenticated;

-- ─── Comentários ──────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.search_queries IS 'Rastreamento de termos de busca para analytics no dashboard admin.';
COMMENT ON COLUMN public.search_queries.term       IS 'Termo buscado pelo usuário (máx 200 chars).';
COMMENT ON COLUMN public.search_queries.user_id    IS 'Usuário autenticado que realizou a busca (nulo se anônimo).';
COMMENT ON COLUMN public.search_queries.session_id IS 'ID de sessão anônima para agrupar buscas sem login.';
