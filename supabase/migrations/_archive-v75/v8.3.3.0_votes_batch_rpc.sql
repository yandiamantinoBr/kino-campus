-- ============================================================
-- v8.3.3.0 — RPC batch: kc_get_my_votes
-- Retorna o voto do usuário autenticado para uma lista de posts.
-- Usado pelo front-end para inicializar o estado dos botões
-- hot/cold assim que os cards são renderizados.
-- ============================================================

-- Drop se já existir (idempotente)
DROP FUNCTION IF EXISTS kc_get_my_votes(uuid[]);

CREATE OR REPLACE FUNCTION kc_get_my_votes(p_post_ids uuid[])
RETURNS TABLE (post_id uuid, direction text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pv.post_id, pv.direction
  FROM   post_votes pv
  WHERE  pv.voter_id = auth.uid()
    AND  pv.post_id  = ANY(p_post_ids);
$$;

-- Apenas usuários autenticados podem chamar
REVOKE ALL ON FUNCTION kc_get_my_votes(uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kc_get_my_votes(uuid[]) TO authenticated;

COMMENT ON FUNCTION kc_get_my_votes IS
  'Retorna os votos do usuário autenticado para um array de post_ids. '
  'Usado pelo front-end para marcar os botões hot/cold como ativos.';
