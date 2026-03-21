-- v8.3.0.2 — Search Trends: filtro de período dinâmico
-- Atualiza kc_admin_search_trends para aceitar p_since (período selecionado pelo admin).
-- Compatível com o dashboard administrativo — recebe a data de corte calculada no JS.

CREATE OR REPLACE FUNCTION public.kc_admin_search_trends(
  p_limit integer DEFAULT 10,
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (term text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(sq.term) AS term,
    count(*)::bigint AS count
  FROM public.search_queries sq
  WHERE sq.created_at >= COALESCE(p_since, now() - interval '30 days')
  GROUP BY lower(sq.term)
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- Mantém permissões existentes
REVOKE ALL ON FUNCTION public.kc_admin_search_trends(integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_search_trends(integer, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.kc_admin_search_trends IS
  'Retorna os top N termos mais buscados no período indicado por p_since. '
  'Se p_since for NULL, usa os últimos 30 dias. Requer perfil is_admin=true via SECURITY DEFINER.';
