-- V8.2.3.0 — Fix: garantir coluna posts.votos e trigger de sincronização
-- P0-B: votos não persistiam após refresh porque votos column ou trigger estavam ausentes

-- 1) Garantir coluna votos na tabela posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS votos integer NOT NULL DEFAULT 0;

-- 2) Recriar a função de trigger (idempotente)
CREATE OR REPLACE FUNCTION public.sync_post_votes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_id uuid;
BEGIN
  v_post_id := COALESCE(NEW.post_id, OLD.post_id);
  IF v_post_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.posts
  SET votos = (
    SELECT COALESCE(
      SUM(CASE WHEN direction = 'hot' THEN 1 WHEN direction = 'cold' THEN -1 ELSE 0 END),
      0
    )
    FROM public.post_votes
    WHERE post_id = v_post_id
  )
  WHERE id = v_post_id;

  RETURN NULL;
END;
$$;

-- 3) Recriar trigger (drop primeiro para garantir configuração correta)
DROP TRIGGER IF EXISTS trg_sync_post_votes_count ON public.post_votes;

CREATE TRIGGER trg_sync_post_votes_count
  AFTER INSERT OR DELETE OR UPDATE OF direction ON public.post_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_post_votes_count();

-- 4) Resincronizar contagem para todos os posts existentes
UPDATE public.posts p
SET votos = COALESCE((
  SELECT SUM(CASE WHEN direction = 'hot' THEN 1 WHEN direction = 'cold' THEN -1 ELSE 0 END)
  FROM public.post_votes
  WHERE post_id = p.id
), 0);
