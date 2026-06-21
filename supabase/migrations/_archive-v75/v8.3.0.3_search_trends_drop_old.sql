-- v8.3.0.3 — Search Trends: remove sobrecarga antiga para resolver ambiguidade
-- Problema: v8.3.0.1 criou kc_admin_search_trends(integer) e v8.3.0.2 criou
-- kc_admin_search_trends(integer, timestamptz) como sobrecarga SEPARADA.
-- PostgreSQL lança ERROR 42725 "function name is not unique" quando o cliente
-- chama sem especificar tipos de argumentos.
-- Solução: dropar a assinatura antiga (integer) e manter apenas (integer, timestamptz).

-- 1. Remove a sobrecarga antiga (um parâmetro) — não afeta a nova (dois parâmetros)
DROP FUNCTION IF EXISTS public.kc_admin_search_trends(integer);

-- 2. Recria/confirma a sobrecarga nova com assinatura unificada.
--    p_since DEFAULT NULL mantém retrocompatibilidade (comporta como 30 dias quando omitido).
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

-- Permissões
REVOKE ALL ON FUNCTION public.kc_admin_search_trends(integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_search_trends(integer, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.kc_admin_search_trends IS
  'Top N termos mais buscados no período definido por p_since (padrão: últimos 30 dias). '
  'Requer perfil is_admin=true via SECURITY DEFINER. '
  'v8.3.0.3: remove sobrecarga antiga (integer) que causava ambiguidade 42725.';
