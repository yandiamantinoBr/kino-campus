-- v8.3.0.0 — Search Analytics
-- Tabela para rastrear termos de busca dos usuários (anônimos e autenticados).
-- Usada pelo dashboard administrativo para exibir tendências de busca.

-- ─── Tabela search_queries ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.search_queries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  term        text        NOT NULL CHECK (char_length(term) BETWEEN 1 AND 200),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  text,       -- ID anônimo de sessão (sessionStorage)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índice para agrupar por termo (relatórios de tendências)
CREATE INDEX IF NOT EXISTS idx_search_queries_term
  ON public.search_queries (lower(term));

-- Índice para filtros temporais (ex.: últimos 30 dias)
CREATE INDEX IF NOT EXISTS idx_search_queries_created_at
  ON public.search_queries (created_at DESC);

-- ─── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa autenticada pode inserir (rastreamento de busca)
CREATE POLICY "search_queries_insert_authenticated"
  ON public.search_queries
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Usuários anon também podem inserir (buscas sem login)
CREATE POLICY "search_queries_insert_anon"
  ON public.search_queries
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Apenas admins podem ler (via is_admin no perfil)
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

-- ─── Função RPC para tendências de busca (admin) ────────────────────────────
-- Agrupa buscas por term, retorna top N mais frequentes.
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

-- Apenas admins podem chamar a função
REVOKE ALL ON FUNCTION public.kc_admin_search_trends(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_search_trends(integer) TO authenticated;

-- ─── Comentários ─────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.search_queries IS 'Rastreamento de termos de busca para analytics no dashboard admin.';
COMMENT ON COLUMN public.search_queries.term       IS 'Termo buscado pelo usuário (máx 200 chars).';
COMMENT ON COLUMN public.search_queries.user_id    IS 'Usuário autenticado que realizou a busca (nulo se anônimo).';
COMMENT ON COLUMN public.search_queries.session_id IS 'ID de sessão anônima para agrupar buscas sem login.';
