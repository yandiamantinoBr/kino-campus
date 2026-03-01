-- ============================================================
-- v8.3.2.0 — Tabela hero_banners + auditoria + RLS + RPCs
-- Gerencia os banners dinâmicos do carrossel da página inicial.
-- ============================================================

-- ─── Tipos auxiliares ────────────────────────────────────────

-- Nada a criar; usamos tipos nativos do Postgres.

-- ─── Tabela principal ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hero_banners (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Conteúdo visível
  pill_text       text          NOT NULL DEFAULT 'Destaque',
  title           text          NOT NULL,
  subtitle        text          NOT NULL DEFAULT '',
  button_text     text          NOT NULL DEFAULT 'Ver mais',
  button_url      text          NOT NULL DEFAULT '#',

  -- Ícone (classe Font Awesome, ex.: "fas fa-calendar-alt")
  icon_class      text          NOT NULL DEFAULT 'fas fa-star',

  -- Gradiente do fundo (duas cores CSS: ex. "#4F46E5", "#7C3AED")
  gradient_from   text          NOT NULL DEFAULT '#4F46E5',
  gradient_to     text          NOT NULL DEFAULT '#7C3AED',

  -- Controle
  sort_order      integer       NOT NULL DEFAULT 0,
  is_active       boolean       NOT NULL DEFAULT true,

  -- Auditoria
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  created_by      uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by      uuid          REFERENCES profiles(id) ON DELETE SET NULL
);

-- ─── Tabela de auditoria ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS hero_banner_audit (
  id          bigserial     PRIMARY KEY,
  banner_id   uuid          REFERENCES hero_banners(id) ON DELETE CASCADE,
  action      text          NOT NULL CHECK (action IN ('create','update','delete')),
  changed_by  uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at  timestamptz   NOT NULL DEFAULT now(),
  snapshot    jsonb         -- estado do banner antes/depois da ação
);

-- ─── Trigger: atualiza updated_at automaticamente ────────────

CREATE OR REPLACE FUNCTION _trg_hero_banners_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hero_banners_updated_at ON hero_banners;
CREATE TRIGGER trg_hero_banners_updated_at
  BEFORE UPDATE ON hero_banners
  FOR EACH ROW EXECUTE FUNCTION _trg_hero_banners_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE hero_banners       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_banner_audit  ENABLE ROW LEVEL SECURITY;

-- Banners ativos: qualquer visitante pode ler
DROP POLICY IF EXISTS "banners_read_active" ON hero_banners;
CREATE POLICY "banners_read_active"
  ON hero_banners FOR SELECT
  USING (is_active = true);

-- Admins podem ler todos (ativos e desativados)
DROP POLICY IF EXISTS "banners_read_admin" ON hero_banners;
CREATE POLICY "banners_read_admin"
  ON hero_banners FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Apenas admins podem escrever
DROP POLICY IF EXISTS "banners_insert_admin" ON hero_banners;
CREATE POLICY "banners_insert_admin"
  ON hero_banners FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "banners_update_admin" ON hero_banners;
CREATE POLICY "banners_update_admin"
  ON hero_banners FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "banners_delete_admin" ON hero_banners;
CREATE POLICY "banners_delete_admin"
  ON hero_banners FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Auditoria: admins leem
DROP POLICY IF EXISTS "banner_audit_read_admin" ON hero_banner_audit;
CREATE POLICY "banner_audit_read_admin"
  ON hero_banner_audit FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Auditoria: insert via função SECURITY DEFINER (nenhum usuário direto)
DROP POLICY IF EXISTS "banner_audit_insert_fn" ON hero_banner_audit;
CREATE POLICY "banner_audit_insert_fn"
  ON hero_banner_audit FOR INSERT
  WITH CHECK (true); -- controlado pela função RPC abaixo

-- ─── RPCs de administração ───────────────────────────────────

-- Retorna todos os banners (ativos + inativos) ordenados por sort_order
DROP FUNCTION IF EXISTS kc_admin_list_banners();
CREATE OR REPLACE FUNCTION kc_admin_list_banners()
RETURNS SETOF hero_banners
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM hero_banners ORDER BY sort_order, created_at;
$$;
REVOKE ALL ON FUNCTION kc_admin_list_banners() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kc_admin_list_banners() TO authenticated;

-- Retorna histórico de auditoria de um banner com nome do editor
DROP FUNCTION IF EXISTS kc_admin_banner_audit(uuid);
CREATE OR REPLACE FUNCTION kc_admin_banner_audit(p_banner_id uuid)
RETURNS TABLE (
  id         bigint,
  action     text,
  changed_at timestamptz,
  editor_name text,
  snapshot   jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.action,
    a.changed_at,
    COALESCE(p.full_name, 'Desconhecido') AS editor_name,
    a.snapshot
  FROM hero_banner_audit a
  LEFT JOIN profiles p ON p.id = a.changed_by
  WHERE a.banner_id = p_banner_id
  ORDER BY a.changed_at DESC;
$$;
REVOKE ALL ON FUNCTION kc_admin_banner_audit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kc_admin_banner_audit(uuid) TO authenticated;

-- Upsert de banner com registro automático de auditoria
DROP FUNCTION IF EXISTS kc_admin_save_banner(jsonb);
CREATE OR REPLACE FUNCTION kc_admin_save_banner(p_data jsonb)
RETURNS hero_banners
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin    uuid;
  v_is_admin boolean;
  v_id       uuid;
  v_result   hero_banners;
  v_old      hero_banners;
  v_action   text;
BEGIN
  -- Verificar permissão
  v_admin := auth.uid();
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem salvar banners.';
  END IF;

  v_id := (p_data->>'id')::uuid;

  IF v_id IS NOT NULL THEN
    -- UPDATE
    SELECT * INTO v_old FROM hero_banners WHERE id = v_id;
    UPDATE hero_banners SET
      pill_text     = COALESCE(p_data->>'pill_text',   pill_text),
      title         = COALESCE(p_data->>'title',        title),
      subtitle      = COALESCE(p_data->>'subtitle',     subtitle),
      button_text   = COALESCE(p_data->>'button_text',  button_text),
      button_url    = COALESCE(p_data->>'button_url',   button_url),
      icon_class    = COALESCE(p_data->>'icon_class',   icon_class),
      gradient_from = COALESCE(p_data->>'gradient_from',gradient_from),
      gradient_to   = COALESCE(p_data->>'gradient_to',  gradient_to),
      sort_order    = COALESCE((p_data->>'sort_order')::integer, sort_order),
      is_active     = COALESCE((p_data->>'is_active')::boolean,  is_active),
      updated_by    = v_admin
    WHERE id = v_id
    RETURNING * INTO v_result;
    v_action := 'update';
  ELSE
    -- INSERT
    INSERT INTO hero_banners (
      pill_text, title, subtitle, button_text, button_url,
      icon_class, gradient_from, gradient_to, sort_order, is_active,
      created_by, updated_by
    ) VALUES (
      COALESCE(p_data->>'pill_text', 'Destaque'),
      p_data->>'title',
      COALESCE(p_data->>'subtitle', ''),
      COALESCE(p_data->>'button_text', 'Ver mais'),
      COALESCE(p_data->>'button_url', '#'),
      COALESCE(p_data->>'icon_class', 'fas fa-star'),
      COALESCE(p_data->>'gradient_from', '#4F46E5'),
      COALESCE(p_data->>'gradient_to', '#7C3AED'),
      COALESCE((p_data->>'sort_order')::integer, 0),
      COALESCE((p_data->>'is_active')::boolean, true),
      v_admin, v_admin
    )
    RETURNING * INTO v_result;
    v_action := 'create';
  END IF;

  -- Registrar auditoria
  INSERT INTO hero_banner_audit (banner_id, action, changed_by, snapshot)
  VALUES (
    v_result.id,
    v_action,
    v_admin,
    to_jsonb(v_result)
  );

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION kc_admin_save_banner(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kc_admin_save_banner(jsonb) TO authenticated;

-- Exclusão de banner com auditoria
DROP FUNCTION IF EXISTS kc_admin_delete_banner(uuid);
CREATE OR REPLACE FUNCTION kc_admin_delete_banner(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin    uuid;
  v_is_admin boolean;
  v_old      hero_banners;
BEGIN
  v_admin := auth.uid();
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT * INTO v_old FROM hero_banners WHERE id = p_id;

  -- Registrar auditoria antes de deletar
  INSERT INTO hero_banner_audit (banner_id, action, changed_by, snapshot)
  VALUES (p_id, 'delete', v_admin, to_jsonb(v_old));

  DELETE FROM hero_banners WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION kc_admin_delete_banner(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kc_admin_delete_banner(uuid) TO authenticated;

-- Reordenação em massa (recebe array de {id, sort_order})
DROP FUNCTION IF EXISTS kc_admin_reorder_banners(jsonb);
CREATE OR REPLACE FUNCTION kc_admin_reorder_banners(p_items jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin    uuid;
  v_is_admin boolean;
  v_item     jsonb;
BEGIN
  v_admin := auth.uid();
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE hero_banners
    SET sort_order = (v_item->>'sort_order')::integer,
        updated_by = v_admin
    WHERE id = (v_item->>'id')::uuid;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION kc_admin_reorder_banners(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kc_admin_reorder_banners(jsonb) TO authenticated;

-- ─── Dados iniciais (os 3 banners hardcoded da index.html) ───

INSERT INTO hero_banners (pill_text, title, subtitle, button_text, button_url, icon_class, gradient_from, gradient_to, sort_order, is_active)
VALUES
  ('Destaque',  'Semana de Sustentabilidade UFG',         'Troque materiais, ganhe cashback em dobro e suba no ranking de impacto!',                    'Ver Programação', 'eventos.html?filter=sustentabilidade', 'fas fa-calendar-alt', '#22c55e', '#16a34a', 0, true),
  ('Destaque',  'Feira de Troca de Materiais',            'Traga seus materiais acadêmicos usados e troque por outros que você precisa.',                 'Participar',      'eventos.html',                         'fas fa-exchange-alt', '#4F46E5', '#7C3AED', 1, true),
  ('Novidade',  'Lançamento do KinoCampus na UFG',        'A plataforma colaborativa e sustentável desenvolvida para a comunidade UFG.',                  'Saiba Mais',      'product.html?id=1',                    'fas fa-campground',   '#0ea5e9', '#0284c7', 2, true)
ON CONFLICT DO NOTHING;
