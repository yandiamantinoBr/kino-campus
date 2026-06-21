-- ============================================================
-- KinoCampus v9.1.0.0 — Tabela de Notificações In-App
-- ============================================================
--
--  Novidades:
--    - Tabela notifications com tipos pré-definidos
--    - RLS: usuário vê apenas suas próprias notificações
--    - Realtime habilitado para push em tempo real
--    - Índices para queries frequentes
-- ============================================================

-- ── 1. Tabela notifications ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  data       JSONB NOT NULL DEFAULT '{}',
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tipos válidos
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'comment_on_post',
    'vote_on_post',
    'post_expired',
    'post_reported',
    'comment_reply',
    'system'
  ));

-- ── 2. Índices ───────────────────────────────────────────────

-- Feed principal: notificações do usuário ordenadas por data
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- Badge: contagem de não-lidas (partial index)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read = false;

-- ── 3. RLS ───────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas suas próprias notificações
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Usuário pode atualizar apenas suas próprias (marcar como lida)
CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Usuário pode deletar suas próprias notificações
CREATE POLICY notifications_delete_own
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT somente via triggers/service_role (sem policy para authenticated INSERT)
-- Triggers usam SECURITY DEFINER que bypassa RLS

-- ── 4. Trigger updated_at (não necessário — notificações são imutáveis exceto read)

-- ── 5. Realtime ──────────────────────────────────────────────
-- Habilitar Realtime para push de notificações em tempo real

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;
