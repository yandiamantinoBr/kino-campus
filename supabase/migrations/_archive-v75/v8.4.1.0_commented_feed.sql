-- KinoCampus v8.4.1.0 — Feed "Comentados"
-- Adiciona last_comment_at em posts (denormalizado) para o feed ordenado por recência de comentários.
-- Um trigger em public.comments mantém o campo sincronizado automaticamente.

BEGIN;

-- 1) Coluna denormalizada na tabela posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS last_comment_at TIMESTAMPTZ;

-- 2) Índice para ORDER BY last_comment_at DESC
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'posts' AND indexname = 'posts_last_comment_at_idx'
  ) THEN
    CREATE INDEX posts_last_comment_at_idx ON public.posts (last_comment_at DESC NULLS LAST);
  END IF;
END $$;

-- 3) Backfill: posts que já têm comentários
UPDATE public.posts p
SET last_comment_at = (
  SELECT MAX(c.created_at)
  FROM public.comments c
  WHERE c.post_id = p.id
)
WHERE EXISTS (
  SELECT 1 FROM public.comments c WHERE c.post_id = p.id
);

-- 4) Função trigger para manter last_comment_at atualizado
CREATE OR REPLACE FUNCTION public.kc_update_post_last_comment_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Após remoção recalcula o máximo (pode ter voltado a NULL se era o único)
    UPDATE public.posts
    SET last_comment_at = (
      SELECT MAX(created_at) FROM public.comments WHERE post_id = OLD.post_id
    )
    WHERE id = OLD.post_id;
    RETURN OLD;
  ELSE
    -- INSERT ou UPDATE: atualiza se o novo comentário é mais recente
    UPDATE public.posts
    SET last_comment_at = GREATEST(COALESCE(last_comment_at, '1970-01-01'::timestamptz), NEW.created_at)
    WHERE id = NEW.post_id;
    RETURN NEW;
  END IF;
END;
$$;

-- 5) Trigger na tabela comments
DROP TRIGGER IF EXISTS kc_trg_post_last_comment_at ON public.comments;
CREATE TRIGGER kc_trg_post_last_comment_at
AFTER INSERT OR UPDATE OF created_at OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.kc_update_post_last_comment_at();

COMMIT;
