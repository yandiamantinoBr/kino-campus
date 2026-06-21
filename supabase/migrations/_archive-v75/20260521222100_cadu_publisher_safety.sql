-- KinoCampus 2026-05-21
-- Cadu publisher safety: storage upload policy + moderation cleanup on admin publish.
--
-- Notes:
-- - Storage upload stays limited to authenticated users under post-media/{auth.uid()}.
-- - The stricter legacy policy that verifies postId can coexist with this permissive
--   Cadu policy because storage.objects RLS policies are OR-ed when permissive.
-- - Admin status changes keep the existing audit trigger behavior and clear
--   moderation_reason only when a post is explicitly published.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('kino-media', 'kino-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_kino_media_cadu_post_media_insert ON storage.objects;
CREATE POLICY storage_kino_media_cadu_post_media_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kino-media'
    AND auth.role() = 'authenticated'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'webp')
    AND octet_length(name) < 512
    AND (storage.foldername(name))[1] = 'post-media'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );

CREATE OR REPLACE FUNCTION public.kc_admin_set_post_status(
  p_post_id uuid,
  p_status text,
  p_close_reports boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_status text;
  v_post_exists boolean;
  v_updated integer := 0;
  v_closed integer := 0;
  v_now timestamptz := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para moderar.');
  END IF;

  IF NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem moderar posts.');
  END IF;

  v_status := lower(trim(coalesce(p_status, '')));
  IF v_status NOT IN ('published', 'pending', 'hidden', 'deleted', 'expired', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Status de moderacao invalido: ' || coalesce(v_status, '(vazio)'));
  END IF;

  SET LOCAL row_security = off;

  SELECT EXISTS(SELECT 1 FROM public.posts WHERE id = p_post_id) INTO v_post_exists;
  IF NOT v_post_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado: ' || coalesce(p_post_id::text, '(null)'));
  END IF;

  UPDATE public.posts
     SET status = v_status,
         moderation_reason = CASE WHEN v_status = 'published' THEN NULL ELSE moderation_reason END,
         updated_at = v_now,
         metadata = CASE
           WHEN v_status = 'closed' THEN jsonb_set(
             jsonb_set(
               jsonb_set(coalesce(metadata, '{}'::jsonb), '{closed_at}', to_jsonb(v_now::text), true),
               '{closed_by}', to_jsonb(v_uid::text), true
             ),
             '{closed_reason}', to_jsonb('admin_closed'::text), true
           )
           ELSE metadata
         END
   WHERE id = p_post_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UPDATE_NOT_APPLIED', 'message', 'O UPDATE nao afetou nenhuma linha.', 'post_id', p_post_id, 'status', v_status);
  END IF;

  IF p_close_reports THEN
    UPDATE public.reports
       SET status = 'closed'
     WHERE post_id = p_post_id
       AND status = 'open';
    GET DIAGNOSTICS v_closed = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'updated_posts', v_updated, 'closed_reports', v_closed, 'post_id', p_post_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_set_post_status(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.kc_admin_set_post_status(uuid, text, boolean) TO authenticated, service_role;

-- Tighten grants from the configurable flood-limit migration. These functions
-- perform their own auth/admin checks, but anon should not be able to invoke
-- security-definer RPCs through PostgREST.
REVOKE EXECUTE ON FUNCTION public.kc_count_recent_posts(uuid, text, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.kc_get_post_flood_limit(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.kc_check_post_flood_limit(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.kc_admin_set_post_flood_limit(uuid, text, integer, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.kc_admin_get_post_flood_limits() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.kc_admin_delete_post_flood_limit(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.kc_check_post_flood_limit(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kc_admin_set_post_flood_limit(uuid, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kc_admin_get_post_flood_limits() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kc_admin_delete_post_flood_limit(uuid) TO authenticated, service_role;

COMMIT;
