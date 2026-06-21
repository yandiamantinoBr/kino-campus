-- 00000000000001_baseline_v76.sql
-- KinoCampus — baseline consolidada do schema public (V76.47)
--
-- Esta migration substitui a cadeia legacy de 132 arquivos (100 vX.Y.Z + 24
-- timestamped) que não subia do zero: nomes não-timestamp eram ignorados pela
-- CLI e a primeira migration timestamped dependia de tabelas (post_media/posts/
-- profiles) criadas apenas pelo schema-bootstrap-v8.1.2.3.sql (fora de migrations/).
--
-- Origem: estado final da aplicação ordenada de bootstrap v8.1.2.3 + 132
-- migrations em ordem cronológica sobre Supabase local (PostgreSQL 17.6),
-- capturado via pg_dump --schema-only --no-owner --no-privileges.
-- As 132 migrations originais foram preservadas em supabase/migrations/_archive-v75/.
--
-- Escopo: schema public (tabelas, funções, índices, RLS, policies). Schemas
-- auth/storage/extensions são providos pela stack Supabase local/produção.
--
-- IMPORTANTE: nenhuma escrita em projeto Supabase remoto. Esta baseline é
-- validada apenas via 'supabase db reset' local e PostgreSQL 17 descartável.

-- Extensões necessárias (pgcrypto: gen_random_uuid; unaccent/pg_trgm: busca FTS).
-- Instaladas no schema extensions para alinhar com a stack Supabase e com as
-- referências extensions.gin_trgm_ops / extensions.unaccent das migrations v9.3.4.4+.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Permite criar funções que referenciam tabelas antes destas existirem
-- (o dump do pg_dump ordena objetos por nome, não por dependência).
SET check_function_bodies = false;

-- Schema privado kc_private: migrations v9.3.4.6/v9.3.5.x referenciam-no em
-- wrappers INVOKER (a implementação DEFINER nunca foi movida para cá porque o
-- refactor dinâmico de v9.3.4.6 falhou em funções que retornam trigger). O schema
-- é criado vazio para que a baseline suba; as referências kc_private.* são
-- wrappers admin/raras que não afetam a busca pública nem o frontend atual.
CREATE SCHEMA IF NOT EXISTS kc_private;
REVOKE ALL ON SCHEMA kc_private FROM PUBLIC;
GRANT USAGE ON SCHEMA kc_private TO anon, authenticated, service_role;

CREATE TABLE public.chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_low uuid NOT NULL,
    participant_high uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_at timestamp with time zone,
    last_message_preview text,
    last_message_sender uuid,
    last_message_type text,
    archived_by_low boolean DEFAULT false NOT NULL,
    archived_by_high boolean DEFAULT false NOT NULL,
    CONSTRAINT chat_conv_ordered CHECK ((participant_low < participant_high)),
    CONSTRAINT chat_conversations_last_message_type_check CHECK ((last_message_type = ANY (ARRAY['text'::text, 'image'::text])))
);


--
-- Name: TABLE chat_conversations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_conversations IS 'v9.3.5.10: conversa 1-a-1 entre 2 participantes (par ordenado low<high). Denormaliza last_message_* para inbox rápida.';


--
-- Name: COLUMN chat_conversations.last_message_preview; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_conversations.last_message_preview IS 'Plaintext até 120 chars para inbox rápida. Trade-off documentado em /privacidade.';


--
-- Name: _trg_ad_campaigns_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_ad_campaigns_audit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_action TEXT;
  v_payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_payload := to_jsonb(NEW);
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (NEW.id, v_action, auth.uid(), v_payload);
    BEGIN
      PERFORM public.audit_log_insert('ad_campaign_created', 'ad_campaigns', NEW.id, v_payload, auth.uid());
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := CASE
      WHEN NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN 'archive'
      ELSE 'update'
    END;
    v_payload := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (NEW.id, v_action, auth.uid(), v_payload);
    BEGIN
      PERFORM public.audit_log_insert(
        CASE
          WHEN NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN 'ad_campaign_activated'
          WHEN NEW.status = 'paused' AND OLD.status IS DISTINCT FROM 'paused' THEN 'ad_campaign_paused'
          WHEN NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN 'ad_campaign_archived'
          ELSE 'ad_campaign_updated'
        END,
        'ad_campaigns',
        NEW.id,
        v_payload,
        auth.uid()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_payload := to_jsonb(OLD);
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (OLD.id, 'delete', auth.uid(), v_payload);
    BEGIN
      PERFORM public.audit_log_insert('ad_campaign_archived', 'ad_campaigns', OLD.id, v_payload, auth.uid());
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: _trg_ad_campaigns_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_ad_campaigns_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _trg_ad_network_settings_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_ad_network_settings_audit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  BEGIN
    PERFORM public.audit_log_insert(
      'ad_network_settings_updated',
      'ad_network_settings',
      '00000000-0000-0000-0000-000000000000'::uuid,
      jsonb_build_object(
        'provider', NEW.provider,
        'status', NEW.status,
        'auto_ads_enabled', NEW.auto_ads_enabled,
        'placement_modes', NEW.placement_modes,
        'has_adsense_client_id', NEW.adsense_client_id <> '',
        'slot_keys', (
          SELECT coalesce(jsonb_agg(key ORDER BY key), '[]'::jsonb)
          FROM jsonb_object_keys(NEW.adsense_slots) AS key
        )
      ),
      auth.uid()
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: _trg_ad_network_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_ad_network_settings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: _trg_hero_banners_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_hero_banners_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: audit_log_insert(text, text, uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_log_insert(p_action text, p_entity_type text, p_entity_id uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_actor_id uuid DEFAULT auth.uid()) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;


--
-- Name: check_report_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_report_rate_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  recent_count integer;
begin
  -- Conta denúncias do mesmo reporter na última hora
  select count(*)
    into recent_count
    from public.reports
   where reporter_id = new.reporter_id
     and created_at > now() - interval '1 hour';

  if recent_count >= 5 then
    raise exception 'rate_limit_exceeded'
      using hint = 'Você atingiu o limite de 5 denúncias por hora. Tente novamente mais tarde.',
            errcode = 'P0001';
  end if;

  return new;
end;
$$;


--
-- Name: increment_comment_likes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_comment_likes(comment_uuid uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  current_user_id uuid;
  affected_rows integer := 0;
  total_likes integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_REQUIRED',
      'message', 'Faça login para curtir.'
    );
  end if;

  if not exists (select 1 from public.comments where id = comment_uuid) then
    return jsonb_build_object(
      'ok', false,
      'code', 'COMMENT_NOT_FOUND',
      'message', 'Comentário não encontrado.'
    );
  end if;

  insert into public.comment_likes(comment_id, user_id)
  values (comment_uuid, current_user_id)
  on conflict (comment_id, user_id) do nothing;

  get diagnostics affected_rows = row_count;

  select count(*)::integer
    into total_likes
    from public.comment_likes
   where comment_id = comment_uuid;

  update public.comments
     set likes = total_likes
   where id = comment_uuid;

  if affected_rows > 0 then
    return jsonb_build_object(
      'ok', true,
      'liked', true,
      'likes', total_likes
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'liked', false,
    'already_liked', true,
    'likes', total_likes,
    'message', 'Você já curtiu este comentário.'
  );
end;
$$;


--
-- Name: kc_admin_ad_campaign_audit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_ad_campaign_audit(p_campaign_id uuid) RETURNS TABLE(id bigint, campaign_id uuid, action text, changed_at timestamp with time zone, editor_name text, snapshot jsonb)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT
    a.id,
    a.campaign_id,
    a.action,
    a.changed_at,
    COALESCE(p.display_name, p.full_name, 'Administrador') AS editor_name,
    a.snapshot
  FROM public.ad_campaign_audit a
  LEFT JOIN public.profiles p ON p.id = a.changed_by
  WHERE public.kc_is_admin((SELECT auth.uid()))
    AND (p_campaign_id IS NULL OR a.campaign_id = p_campaign_id)
  ORDER BY a.changed_at DESC
  LIMIT 800;
$$;


--
-- Name: kc_admin_add_invite(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_add_invite(p_email text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_is_admin boolean;
begin
  select is_admin into v_is_admin
  from public.profiles
  where id = auth.uid();

  if not coalesce(v_is_admin, false) then
    raise exception 'UNAUTHORIZED: apenas administradores podem convidar usuários';
  end if;

  insert into public.kc_invited_emails (email, invited_by, note)
  values (lower(trim(p_email)), auth.uid(), p_note)
  on conflict (email) do update
    set invited_by = excluded.invited_by,
        note       = coalesce(excluded.note, kc_invited_emails.note),
        invited_at = now(),
        expires_at = now() + interval '7 days',
        used_at    = null;

  return jsonb_build_object('ok', true, 'email', lower(trim(p_email)));
end;
$$;


--
-- Name: kc_admin_ads_overview(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_ads_overview(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_since TIMESTAMPTZ := coalesce(p_since, now() - interval '30 days');
  v_settings public.ad_network_settings;
  v_impressions BIGINT := 0;
  v_clicks BIGINT := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_settings FROM public.ad_network_settings WHERE id = 'default';

  SELECT
    count(*) FILTER (WHERE event_name = 'ad_impression'),
    count(*) FILTER (WHERE event_name = 'ad_click')
  INTO v_impressions, v_clicks
  FROM public.privacy_analytics_events
  WHERE created_at >= v_since
    AND entity_type = 'ad_campaign'
    AND event_name IN ('ad_impression', 'ad_click');

  RETURN jsonb_build_object(
    'ok', true,
    'since', v_since,
    'settings', CASE WHEN v_settings.id IS NULL THEN NULL ELSE to_jsonb(v_settings) END,
    'campaigns', jsonb_build_object(
      'total', (SELECT count(*) FROM public.ad_campaigns),
      'active', (SELECT count(*) FROM public.ad_campaigns WHERE status = 'active'),
      'paused', (SELECT count(*) FROM public.ad_campaigns WHERE status = 'paused'),
      'draft', (SELECT count(*) FROM public.ad_campaigns WHERE status = 'draft'),
      'expired_active', (
        SELECT count(*) FROM public.ad_campaigns
        WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < now()
      ),
      'active_without_impressions', (
        SELECT count(*)
        FROM public.ad_campaigns c
        WHERE c.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM public.privacy_analytics_events e
            WHERE e.entity_type = 'ad_campaign'
              AND e.entity_id = c.id::text
              AND e.event_name = 'ad_impression'
              AND e.created_at >= v_since
          )
      )
    ),
    'metrics', jsonb_build_object(
      'impressions', coalesce(v_impressions, 0),
      'clicks', coalesce(v_clicks, 0),
      'ctr', CASE WHEN coalesce(v_impressions, 0) = 0 THEN 0
                  ELSE round((coalesce(v_clicks, 0)::numeric / nullif(v_impressions, 0)::numeric) * 100, 2)
             END
    ),
    'expired_active', (
      SELECT count(*) FROM public.ad_campaigns
      WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < now()
    ),
    'active_without_impressions', (
      SELECT count(*)
      FROM public.ad_campaigns c
      WHERE c.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.privacy_analytics_events e
          WHERE e.entity_type = 'ad_campaign'
            AND e.entity_id = c.id::text
            AND e.event_name = 'ad_impression'
            AND e.created_at >= v_since
        )
    )
  );
END;
$$;


--
-- Name: kc_admin_archive_ad_campaign(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_archive_ad_campaign(p_campaign_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.kc_is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ad_campaigns
  SET status = 'archived'
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object('ok', FOUND);
END;
$$;


--
-- Name: kc_admin_banner_audit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_banner_audit(p_banner_id uuid) RETURNS TABLE(id bigint, action text, changed_at timestamp with time zone, editor_name text, snapshot jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: kc_admin_close_reports(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_close_reports(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid;
  v_closed integer := 0;
begin
  v_uid := auth.uid();

  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faça login para moderar denúncias.');
  end if;

  if not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem fechar denúncias.');
  end if;

  update public.reports
     set status = 'closed'
   where post_id = p_post_id
     and status = 'open';

  get diagnostics v_closed = row_count;

  return jsonb_build_object(
    'ok', true,
    'closed_reports', v_closed,
    'post_id', p_post_id
  );
end;
$$;


--
-- Name: kc_admin_dashboard_daily_metrics(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_dashboard_daily_metrics(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(day date, posts_count bigint, comments_count bigint, searches_count bigint, votes_count bigint, admin_actions_count bigint, saves_count bigint, reports_count bigint, signups_count bigint, post_views_count bigint, comment_likes_count bigint, sessions_count bigint)
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_admin_dashboard_daily_metrics($1)
$_$;


--
-- Name: FUNCTION kc_admin_dashboard_daily_metrics(p_since timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_admin_dashboard_daily_metrics(p_since timestamp with time zone) IS 'Buckets diários do Dashboard Admin (11 séries): posts, comentários, buscas, votos, ações admin, salvamentos, denúncias, cadastros, visualizações, curtidas em comentários e sessões ativas. Wrapper INVOKER (search_path='''') -> kc_private (SECURITY DEFINER).';


--
-- Name: kc_admin_dashboard_overview(timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_dashboard_overview(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone, p_prev_since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz := coalesce(p_since, now() - interval '30 days');
  v_until timestamptz := coalesce(p_until, now());
  v_prev_since timestamptz := coalesce(p_prev_since, v_since - (coalesce(p_until, now()) - coalesce(p_since, now() - interval '30 days')));
  v_active_since timestamptz := now() - interval '15 minutes';
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Acesso restrito a administradores.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'since', v_since,
    'until', v_until,
    'prev_since', v_prev_since,
    'reports', jsonb_build_object(
      'open',  (select count(*) from public.reports r where r.status = 'open' and r.created_at >= v_since),
      'total', (select count(*) from public.reports r where r.created_at >= v_since)
    ),
    'posts', jsonb_build_object(
      'total',        (select count(*) from public.posts),
      'visible',      (select count(*) from public.posts where status in ('published', 'closed')),
      'created',      (select count(*) from public.posts where created_at >= v_since),
      'edited',       (select count(*) from public.posts where updated_at >= v_since and created_at < v_since),
      'hidden',       (select count(*) from public.posts where status = 'hidden' and updated_at >= v_since),
      'deleted',      (select count(*) from public.posts where status = 'deleted' and updated_at >= v_since),
      'prev_created', (select count(*) from public.posts where created_at >= v_prev_since and created_at < v_since)
    ),
    'engagement', jsonb_build_object(
      'comments',      (select count(*) from public.comments where created_at >= v_since),
      'votes',         (select count(*) from public.post_votes where created_at >= v_since),
      'saves',         (select count(*) from public.saved_posts where created_at >= v_since),
      'prev_comments', (select count(*) from public.comments where created_at >= v_prev_since and created_at < v_since),
      'prev_votes',    (select count(*) from public.post_votes where created_at >= v_prev_since and created_at < v_since),
      'prev_saves',    (select count(*) from public.saved_posts where created_at >= v_prev_since and created_at < v_since)
    ),
    'users', jsonb_build_object(
      'total',    (select count(*) from public.profiles),
      'new',      (select count(*) from public.profiles where created_at >= v_since),
      'prev_new', (select count(*) from public.profiles where created_at >= v_prev_since and created_at < v_since)
    ),
    'privacy', jsonb_build_object(
      'searches',   (select count(*) from public.search_queries where created_at >= v_since),
      'post_views', (select count(*) from public.post_view_events where created_at >= v_since),
      'events',     (select count(*) from public.search_queries where created_at >= v_since)
                  + (select count(*) from public.post_view_events where created_at >= v_since),
      'sessions',   (select count(distinct s) from (
                       select session_id as s from public.search_queries where created_at >= v_since and session_id is not null
                       union
                       select session_id as s from public.post_view_events where created_at >= v_since and session_id is not null
                     ) sess)
    ),
    'active_15m', (select count(distinct s) from (
                     select session_id as s from public.search_queries where created_at >= v_active_since and session_id is not null
                     union
                     select session_id as s from public.post_view_events where created_at >= v_active_since and session_id is not null
                   ) act)
  );
end;
$$;


--
-- Name: kc_admin_decide_external_access(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_decide_external_access(p_id uuid, p_decision text, p_note text DEFAULT NULL::text) RETURNS TABLE(out_id uuid, out_admin_status text, out_admin_decided_at timestamp with time zone, out_contact_email text, out_requester_name text, out_metadata jsonb)
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_admin_decide_external_access($1, $2, $3);
$_$;


--
-- Name: FUNCTION kc_admin_decide_external_access(p_id uuid, p_decision text, p_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_admin_decide_external_access(p_id uuid, p_decision text, p_note text) IS 'v9.3.5.9: SECURITY INVOKER wrapper. Logica em kc_private (admin-only).';


--
-- Name: kc_admin_delete_banner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_delete_banner(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: kc_admin_delete_post_flood_limit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_delete_post_flood_limit(p_limit_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_deleted record;
begin
  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  delete from public.post_flood_limits
   where id = p_limit_id
   returning * into v_deleted;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Limite de ritmo nao encontrado.');
  end if;

  perform kc_private.kc_insert_audit_log(
    'post_flood_limit_deleted',
    'post_flood_limits',
    v_deleted.id,
    jsonb_build_object(
      'user_id', v_deleted.user_id,
      'module', v_deleted.module,
      'max_posts', v_deleted.max_posts,
      'window_minutes', v_deleted.window_minutes
    ),
    v_admin_id
  );

  return jsonb_build_object('ok', true, 'code', 'OK', 'message', 'Limite de ritmo removido.');
end;
$$;


--
-- Name: kc_admin_delete_post_limit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_delete_post_limit(p_limit_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_rows_deleted INT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  DELETE FROM public.post_limits WHERE id = p_limit_id;
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

  IF v_rows_deleted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Limite não encontrado.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'message', 'Limite removido.');
END;
$$;


--
-- Name: kc_admin_get_ad_network_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_get_ad_network_settings() RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_settings public.ad_network_settings;
BEGIN
  IF v_uid IS NULL OR NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_settings
  FROM public.ad_network_settings
  WHERE id = 'default';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'settings', null);
  END IF;

  RETURN jsonb_build_object('ok', true, 'settings', to_jsonb(v_settings));
END;
$$;


--
-- Name: kc_admin_get_chart_prefs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_get_chart_prefs() RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_prefs jsonb;
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select prefs into v_prefs from public.kc_admin_chart_prefs where user_id = v_uid;
  return jsonb_build_object('ok', true, 'prefs', coalesce(v_prefs, '{}'::jsonb));
end;
$$;


--
-- Name: kc_admin_get_invites(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_get_invites() RETURNS TABLE(email text, invited_by uuid, note text, invited_at timestamp with time zone, used_at timestamp with time zone, expires_at timestamp with time zone, is_expired boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  select
    i.email,
    i.invited_by,
    i.note,
    i.invited_at,
    i.used_at,
    i.expires_at,
    (i.expires_at <= now()) as is_expired
  from public.kc_invited_emails i
  order by i.invited_at desc;
end;
$$;


--
-- Name: kc_admin_get_post_flood_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_get_post_flood_limits() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_limits jsonb;
begin
  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'id', pfl.id,
             'user_id', pfl.user_id,
             'module', pfl.module,
             'max_posts', pfl.max_posts,
             'window_minutes', pfl.window_minutes,
             'created_at', pfl.created_at,
             'updated_at', pfl.updated_at,
             'user_name', coalesce(p.display_name, p.full_name, '-')
           )
           order by pfl.user_id nulls first, pfl.module nulls first, pfl.window_minutes
         )
    into v_limits
    from public.post_flood_limits pfl
    left join public.profiles p on p.id = pfl.user_id;

  return jsonb_build_object('ok', true, 'limits', coalesce(v_limits, '[]'::jsonb));
end;
$$;


--
-- Name: kc_admin_get_post_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_get_post_limits() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_limits   JSONB;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',         pl.id,
      'user_id',    pl.user_id,
      'module',     pl.module,
      'max_active', pl.max_active,
      'created_at', pl.created_at,
      'updated_at', pl.updated_at,
      'user_name',  COALESCE(p.display_name, p.full_name, '—')
    )
    ORDER BY pl.user_id NULLS FIRST, pl.module NULLS FIRST
  )
  INTO v_limits
  FROM public.post_limits pl
  LEFT JOIN public.profiles p ON p.id = pl.user_id;

  RETURN jsonb_build_object(
    'ok',     true,
    'limits', COALESCE(v_limits, '[]'::JSONB)
  );
END;
$$;


--
-- Name: kc_admin_get_user_active_posts_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_get_user_active_posts_count(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_id  UUID;
  v_is_admin  BOOLEAN;
  v_count     BIGINT;
  v_limit     INT;
  v_user_name TEXT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(display_name, full_name, 'Usuário') INTO v_user_name
  FROM public.profiles WHERE id = p_user_id;

  v_count := kc_count_active_posts(p_user_id, NULL);
  v_limit := kc_get_post_limit(p_user_id, NULL);

  RETURN jsonb_build_object(
    'ok',        true,
    'user_id',   p_user_id,
    'user_name', COALESCE(v_user_name, '—'),
    'count',     v_count,
    'limit',     v_limit,
    'remaining', GREATEST(0, v_limit - v_count),
    'at_limit',  v_count >= v_limit
  );
END;
$$;


--
-- Name: kc_admin_legacy_id_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_legacy_id_stats() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total_posts     BIGINT;
  v_with_legacy     BIGINT;
  v_without_legacy  BIGINT;
  v_oldest_legacy   TIMESTAMPTZ;
  v_newest_legacy   TIMESTAMPTZ;
  v_by_module       JSONB;
BEGIN
  -- Somente admin pode consultar
  IF NOT public.kc_is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ADMIN_ONLY');
  END IF;

  -- Contagens gerais
  SELECT count(*) INTO v_total_posts FROM public.posts;
  SELECT count(*) INTO v_with_legacy FROM public.posts WHERE legacy_id IS NOT NULL;
  v_without_legacy := v_total_posts - v_with_legacy;

  -- Range de datas dos posts com legacy_id
  SELECT min(created_at), max(created_at)
  INTO v_oldest_legacy, v_newest_legacy
  FROM public.posts
  WHERE legacy_id IS NOT NULL;

  -- Distribuição por módulo
  SELECT COALESCE(jsonb_object_agg(module, cnt), '{}'::JSONB)
  INTO v_by_module
  FROM (
    SELECT module, count(*) AS cnt
    FROM public.posts
    WHERE legacy_id IS NOT NULL
    GROUP BY module
    ORDER BY cnt DESC
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'total_posts', v_total_posts,
    'with_legacy_id', v_with_legacy,
    'without_legacy_id', v_without_legacy,
    'pct_legacy', CASE
      WHEN v_total_posts > 0
      THEN round((v_with_legacy::NUMERIC / v_total_posts) * 100, 1)
      ELSE 0
    END,
    'oldest_legacy_post', v_oldest_legacy,
    'newest_legacy_post', v_newest_legacy,
    'by_module', v_by_module,
    'safe_to_remove', (v_with_legacy = 0)
  );
END;
$$;


--
-- Name: ad_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    advertiser_name text DEFAULT ''::text NOT NULL,
    sponsor_label text DEFAULT ''::text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    cta_label text DEFAULT 'Saiba mais'::text NOT NULL,
    target_url text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    campaign_type text DEFAULT 'direct'::text NOT NULL,
    placements text[] DEFAULT ARRAY['feed_inline'::text] NOT NULL,
    module_keys text[] DEFAULT ARRAY[]::text[] NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    frequency_cap_per_session integer DEFAULT 4 NOT NULL,
    billing_model text DEFAULT 'sponsorship'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT ad_campaigns_campaign_type_check CHECK ((campaign_type = ANY (ARRAY['direct'::text, 'adsense_fallback'::text]))),
    CONSTRAINT ad_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])))
);


--
-- Name: TABLE ad_campaigns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ad_campaigns IS 'Campanhas de anuncios contextuais exibidos em feeds do KinoCampus.';


--
-- Name: kc_admin_list_ad_campaigns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_list_ad_campaigns() RETURNS SETOF public.ad_campaigns
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT *
  FROM public.ad_campaigns
  WHERE public.kc_is_admin((SELECT auth.uid()))
  ORDER BY
    CASE status
      WHEN 'active' THEN 0
      WHEN 'paused' THEN 1
      WHEN 'draft' THEN 2
      ELSE 3
    END,
    priority DESC,
    updated_at DESC;
$$;


--
-- Name: kc_admin_list_audit_logs(text, text, text, integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_list_audit_logs(p_entity_type text DEFAULT 'all'::text, p_action text DEFAULT 'all'::text, p_actor_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(id uuid, created_at timestamp with time zone, action text, entity_type text, entity_id text, actor_id uuid, payload jsonb)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_entity text := lower(coalesce(p_entity_type, 'all'));
  v_action text := lower(coalesce(p_action, 'all'));
  v_actor_query text := lower(nullif(trim(coalesce(p_actor_query, '')), ''));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_role <> 'service_role' and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select a.id,
         a.created_at,
         a.action,
         a.entity_type,
         a.entity_id::text,
         a.actor_id,
         a.payload
    from public.audit_log a
    left join public.profiles pr on pr.id = a.actor_id
   where (v_entity = 'all' or lower(a.entity_type) = v_entity)
     and (v_action = 'all' or lower(a.action) = v_action)
     and (
       v_actor_query is null
       or cast(a.actor_id as text) ilike '%' || v_actor_query || '%'
       or lower(coalesce(pr.display_name, '')) like '%' || v_actor_query || '%'
       or lower(coalesce(pr.full_name, '')) like '%' || v_actor_query || '%'
     )
     and (p_since is null or a.created_at >= p_since)
   order by a.created_at desc
   offset v_offset
   limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;


--
-- Name: FUNCTION kc_admin_list_audit_logs(p_entity_type text, p_action text, p_actor_query text, p_limit integer, p_offset integer, p_since timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_admin_list_audit_logs(p_entity_type text, p_action text, p_actor_query text, p_limit integer, p_offset integer, p_since timestamp with time zone) IS 'Lista audit logs administrativos com filtros, paginação real via offset e corte temporal opcional.';


--
-- Name: hero_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hero_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pill_text text DEFAULT 'Destaque'::text NOT NULL,
    title text NOT NULL,
    subtitle text DEFAULT ''::text NOT NULL,
    button_text text DEFAULT 'Ver mais'::text NOT NULL,
    button_url text DEFAULT '#'::text NOT NULL,
    icon_class text DEFAULT 'fas fa-star'::text NOT NULL,
    gradient_from text DEFAULT '#4F46E5'::text NOT NULL,
    gradient_to text DEFAULT '#7C3AED'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: kc_admin_list_banners(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_list_banners() RETURNS SETOF public.hero_banners
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM hero_banners ORDER BY sort_order, created_at;
$$;


--
-- Name: kc_admin_list_external_access(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_list_external_access(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(out_id uuid, out_created_at timestamp with time zone, out_admin_status text, out_admin_decided_at timestamp with time zone, out_admin_note text, out_subject text, out_message text, out_contact_email text, out_requester_name text, out_affiliation_context text, out_metadata jsonb, out_total_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_admin_list_external_access($1, $2, $3);
$_$;


--
-- Name: FUNCTION kc_admin_list_external_access(p_status text, p_limit integer, p_offset integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_admin_list_external_access(p_status text, p_limit integer, p_offset integer) IS 'v9.3.5.9: SECURITY INVOKER wrapper. Logica em kc_private (admin-only).';


--
-- Name: kc_admin_list_help_requests_paged(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_list_help_requests_paged(p_status text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, user_id uuid, type text, topic text, subtopic text, subject text, message text, priority text, status text, page_path text, contact_email text, allow_contact boolean, metadata jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, author_name text, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_type text := nullif(trim(coalesce(p_type, '')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    hr.id,
    hr.user_id,
    hr.type,
    hr.topic,
    hr.subtopic,
    hr.subject,
    hr.message,
    hr.priority,
    hr.status,
    hr.page_path,
    hr.contact_email,
    hr.allow_contact,
    hr.metadata,
    hr.created_at,
    hr.updated_at,
    coalesce(pr.display_name, pr.full_name, pr.email, 'Usuario') as author_name,
    count(*) over() as total_count
  from public.help_requests as hr
  left join public.profiles as pr
    on pr.id = hr.user_id
  where
    (v_status is null or hr.status = v_status)
    and (v_type is null or hr.type = v_type)
  order by hr.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;


--
-- Name: kc_admin_list_posts_by_ids(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_list_posts_by_ids(p_ids uuid[]) RETURNS TABLE(id uuid, title text, status text, author_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  return query
  select p.id,
         coalesce(p.title, p.titulo, 'Post sem título') as title,
         coalesce(p.status, 'indisponível') as status,
         p.author_id
  from public.posts p
  where p.id = any (p_ids);
end;
$$;


--
-- Name: kc_admin_list_reports(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_list_reports(p_status text DEFAULT 'open'::text, p_reason text DEFAULT 'all'::text, p_limit integer DEFAULT 200) RETURNS TABLE(id uuid, created_at timestamp with time zone, reason text, details text, status text, post_id uuid, reporter_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(coalesce(p_status, 'open'));
  v_reason text := lower(coalesce(p_reason, 'all'));
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    r.id,
    r.created_at,
    r.reason,
    r.details,
    r.status,
    r.post_id,
    r.reporter_id
  from public.reports r
  where (v_status = 'all' or lower(r.status) = v_status)
    and (v_reason = 'all' or lower(r.reason) = v_reason)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;


--
-- Name: kc_admin_privacy_analytics(timestamp with time zone, text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_privacy_analytics(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_event_name text DEFAULT 'all'::text, p_page_path text DEFAULT 'all'::text, p_module_key text DEFAULT 'all'::text, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_since TIMESTAMPTZ := coalesce(p_since, now() - INTERVAL '30 days');
  v_event_name TEXT := nullif(lower(trim(coalesce(p_event_name, 'all'))), 'all');
  v_page_path TEXT := nullif(trim(coalesce(p_page_path, 'all')), 'all');
  v_module_key TEXT := nullif(trim(coalesce(p_module_key, 'all')), 'all');
  v_limit INTEGER := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_offset INTEGER := greatest(coalesce(p_offset, 0), 0);
  v_result JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT *
    FROM public.privacy_analytics_events e
    WHERE e.created_at >= v_since
      AND (v_event_name IS NULL OR e.event_name = v_event_name)
      AND (v_page_path IS NULL OR e.page_path = v_page_path)
      AND (v_module_key IS NULL OR e.module_key = v_module_key)
  ),
  consent_filtered AS MATERIALIZED (
    SELECT *
    FROM public.privacy_consent_events c
    WHERE c.created_at >= v_since
  )
  SELECT jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'since', v_since,
    'totals', jsonb_build_object(
      'events', (SELECT count(*) FROM filtered),
      'sessions', (SELECT count(DISTINCT session_hash) FROM filtered),
      'searches', (SELECT count(*) FROM public.search_queries sq WHERE sq.created_at >= v_since),
      'banner_impressions', (SELECT count(*) FROM filtered WHERE event_name = 'banner_impression'),
      'banner_clicks', (SELECT count(*) FROM filtered WHERE event_name = 'banner_click'),
      'help_submits', (SELECT count(*) FROM filtered WHERE event_name = 'help_submit'),
      'report_submits', (SELECT count(*) FROM filtered WHERE event_name = 'report_submit')
    ),
    'consent', jsonb_build_object(
      'updates', (SELECT count(*) FROM consent_filtered),
      'analytics_accepted', (SELECT count(*) FROM consent_filtered WHERE analytics_enabled IS TRUE),
      'analytics_rejected', (SELECT count(*) FROM consent_filtered WHERE analytics_enabled IS FALSE),
      'preferences_accepted', (SELECT count(*) FROM consent_filtered WHERE preferences_enabled IS TRUE)
    ),
    'by_event', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.events DESC, row_data.event_name)
      FROM (
        SELECT event_name, count(*)::BIGINT AS events, count(DISTINCT session_hash)::BIGINT AS sessions
        FROM filtered
        GROUP BY event_name
      ) row_data
    ), '[]'::jsonb),
    'by_page', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.events DESC, row_data.page_path)
      FROM (
        SELECT page_path, count(*)::BIGINT AS events, count(DISTINCT session_hash)::BIGINT AS sessions
        FROM filtered
        GROUP BY page_path
        ORDER BY events DESC
        LIMIT 30
      ) row_data
    ), '[]'::jsonb),
    'daily', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.day)
      FROM (
        SELECT date_trunc('day', created_at)::DATE AS day,
               count(*)::BIGINT AS events,
               count(DISTINCT session_hash)::BIGINT AS sessions
        FROM filtered
        GROUP BY 1
        ORDER BY 1
      ) row_data
    ), '[]'::jsonb),
    'banners', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.ctr DESC, row_data.clicks DESC, row_data.impressions DESC)
      FROM (
        SELECT coalesce(nullif(entity_id, ''), metadata->>'entity_label', 'banner') AS entity_id,
               max(coalesce(metadata->>'entity_label', entity_id, 'Banner')) AS label,
               count(*) FILTER (WHERE event_name = 'banner_impression')::BIGINT AS impressions,
               count(*) FILTER (WHERE event_name = 'banner_click')::BIGINT AS clicks,
               CASE
                 WHEN count(*) FILTER (WHERE event_name = 'banner_impression') = 0 THEN 0
                 ELSE round(((count(*) FILTER (WHERE event_name = 'banner_click'))::NUMERIC / NULLIF((count(*) FILTER (WHERE event_name = 'banner_impression'))::NUMERIC, 0)) * 100, 2)
               END AS ctr
        FROM filtered
        WHERE entity_type = 'banner'
        GROUP BY coalesce(nullif(entity_id, ''), metadata->>'entity_label', 'banner')
      ) row_data
    ), '[]'::jsonb),
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC)
      FROM (
        SELECT created_at,
               event_name,
               page_path,
               entity_type,
               entity_id,
               module_key,
               metadata
        FROM filtered
        ORDER BY created_at DESC
        LIMIT v_limit OFFSET v_offset
      ) row_data
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: kc_admin_reorder_banners(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_reorder_banners(p_items jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: kc_admin_reset_post_flood_limit(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_reset_post_flood_limit(p_user_id uuid, p_module text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_module text := nullif(btrim(p_module), '');
  v_reset_id uuid;
  v_check jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_USER', 'message', 'Selecione um usuario para resetar o limite.');
  end if;

  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem resetar limites.');
  end if;

  insert into public.post_flood_resets (user_id, module, reset_at, expires_at, created_by, reason)
  values (
    p_user_id,
    v_module,
    now(),
    now() + interval '24 hours',
    v_admin_id,
    nullif(left(trim(coalesce(p_reason, 'admin_reset')), 160), '')
  )
  returning id into v_reset_id;

  perform kc_private.kc_insert_audit_log(
    'post_flood_limit_reset',
    'post_flood_limits',
    v_reset_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'module', v_module,
      'reason', nullif(left(trim(coalesce(p_reason, 'admin_reset')), 160), '')
    ),
    v_admin_id
  );

  v_check := kc_private.kc_compute_post_flood_check(p_user_id, v_module);

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'Limite de ritmo resetado. O usuario pode publicar novamente.',
    'id', v_reset_id,
    'user_id', p_user_id,
    'module', v_module,
    'check', v_check
  );
end;
$$;


--
-- Name: kc_admin_revoke_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_revoke_invite(p_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles where id = v_admin_id and is_admin = true
  ) then
    raise exception 'UNAUTHORIZED';
  end if;

  delete from public.kc_invited_emails
  where lower(trim(email)) = lower(trim(p_email));

  -- Registrar revogação no audit_log
  insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
  values (
    'invite_revoked',
    'invites',
    lower(trim(p_email)),
    v_admin_id,
    jsonb_build_object('email', lower(trim(p_email)))
  );

  return jsonb_build_object('ok', true, 'email', lower(trim(p_email)));
end;
$$;


--
-- Name: FUNCTION kc_admin_revoke_invite(p_email text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_admin_revoke_invite(p_email text) IS 'Revoga convite de usuário externo e registra invite_revoked no audit_log.';


--
-- Name: kc_admin_save_ad_campaign(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_save_ad_campaign(p_data jsonb) RETURNS public.ad_campaigns
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_id UUID := NULLIF(p_data->>'id', '')::UUID;
  v_row public.ad_campaigns;
  v_placements TEXT[] := COALESCE(
    ARRAY(SELECT lower(trim(value)) FROM jsonb_array_elements_text(COALESCE(p_data->'placements', '[]'::jsonb)) WHERE trim(value) <> ''),
    ARRAY[]::TEXT[]
  );
  v_modules TEXT[] := COALESCE(
    ARRAY(SELECT lower(trim(value)) FROM jsonb_array_elements_text(COALESCE(p_data->'module_keys', '[]'::jsonb)) WHERE trim(value) <> ''),
    ARRAY[]::TEXT[]
  );
  v_tags TEXT[] := COALESCE(
    ARRAY(SELECT lower(trim(value)) FROM jsonb_array_elements_text(COALESCE(p_data->'tags', '[]'::jsonb)) WHERE trim(value) <> ''),
    ARRAY[]::TEXT[]
  );
BEGIN
  IF NOT public.kc_is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  IF cardinality(v_placements) = 0 THEN
    v_placements := ARRAY['feed_inline']::TEXT[];
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ad_campaigns (
      name, advertiser_name, sponsor_label, title, description, image_url,
      cta_label, target_url, status, campaign_type, placements, module_keys,
      tags, priority, starts_at, ends_at, frequency_cap_per_session,
      billing_model, notes
    )
    VALUES (
      left(trim(COALESCE(p_data->>'name', 'Campanha sem nome')), 140),
      left(trim(COALESCE(p_data->>'advertiser_name', '')), 140),
      left(trim(COALESCE(p_data->>'sponsor_label', 'Patrocinado')), 80),
      left(trim(COALESCE(p_data->>'title', '')), 160),
      left(trim(COALESCE(p_data->>'description', '')), 320),
      left(trim(COALESCE(p_data->>'image_url', '')), 600),
      left(trim(COALESCE(p_data->>'cta_label', 'Saiba mais')), 60),
      left(trim(COALESCE(p_data->>'target_url', '')), 600),
      CASE WHEN p_data->>'status' IN ('draft','active','paused','archived') THEN p_data->>'status' ELSE 'draft' END,
      CASE WHEN p_data->>'campaign_type' IN ('direct','adsense_fallback') THEN p_data->>'campaign_type' ELSE 'direct' END,
      v_placements,
      v_modules,
      v_tags,
      COALESCE((p_data->>'priority')::INTEGER, 0),
      NULLIF(p_data->>'starts_at', '')::TIMESTAMPTZ,
      NULLIF(p_data->>'ends_at', '')::TIMESTAMPTZ,
      GREATEST(0, COALESCE((p_data->>'frequency_cap_per_session')::INTEGER, 4)),
      left(trim(COALESCE(p_data->>'billing_model', 'sponsorship')), 80),
      left(trim(COALESCE(p_data->>'notes', '')), 1000)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.ad_campaigns
    SET
      name = left(trim(COALESCE(p_data->>'name', name)), 140),
      advertiser_name = left(trim(COALESCE(p_data->>'advertiser_name', advertiser_name)), 140),
      sponsor_label = left(trim(COALESCE(p_data->>'sponsor_label', sponsor_label)), 80),
      title = left(trim(COALESCE(p_data->>'title', title)), 160),
      description = left(trim(COALESCE(p_data->>'description', description)), 320),
      image_url = left(trim(COALESCE(p_data->>'image_url', image_url)), 600),
      cta_label = left(trim(COALESCE(p_data->>'cta_label', cta_label)), 60),
      target_url = left(trim(COALESCE(p_data->>'target_url', target_url)), 600),
      status = CASE WHEN p_data->>'status' IN ('draft','active','paused','archived') THEN p_data->>'status' ELSE status END,
      campaign_type = CASE WHEN p_data->>'campaign_type' IN ('direct','adsense_fallback') THEN p_data->>'campaign_type' ELSE campaign_type END,
      placements = v_placements,
      module_keys = v_modules,
      tags = v_tags,
      priority = COALESCE((p_data->>'priority')::INTEGER, priority),
      starts_at = NULLIF(p_data->>'starts_at', '')::TIMESTAMPTZ,
      ends_at = NULLIF(p_data->>'ends_at', '')::TIMESTAMPTZ,
      frequency_cap_per_session = GREATEST(0, COALESCE((p_data->>'frequency_cap_per_session')::INTEGER, frequency_cap_per_session)),
      billing_model = left(trim(COALESCE(p_data->>'billing_model', billing_model)), 80),
      notes = left(trim(COALESCE(p_data->>'notes', notes)), 1000)
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;


--
-- Name: kc_admin_save_ad_network_settings(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_save_ad_network_settings(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_uid UUID := auth.uid();
  v_client TEXT := left(trim(coalesce(p_data->>'adsense_client_id', 'ca-pub-2776499020194231')), 80);
  v_auto_ads BOOLEAN := CASE WHEN lower(coalesce(p_data->>'auto_ads_enabled', 'false')) IN ('true', 't', '1', 'yes', 'on') THEN true ELSE false END;
  v_row public.ad_network_settings;
BEGIN
  IF v_uid IS NULL OR NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF v_client <> '' AND v_client !~ '^ca-pub-[0-9]{10,30}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ADSENSE_CLIENT_ID');
  END IF;

  INSERT INTO public.ad_network_settings (
    id, provider, status, adsense_client_id, auto_ads_enabled,
    placement_modes, adsense_slots, notes
  )
  VALUES (
    'default',
    CASE WHEN p_data->>'provider' IN ('direct','adsense','hybrid') THEN p_data->>'provider' ELSE 'direct' END,
    CASE WHEN p_data->>'status' IN ('disabled','testing','active') THEN p_data->>'status' ELSE 'disabled' END,
    v_client,
    v_auto_ads,
    coalesce(p_data->'placement_modes', jsonb_build_object(
      'feed_inline', 'direct_only',
      'feed_aside_top', 'direct_only',
      'feed_aside_sticky', 'direct_only'
    )),
    coalesce(p_data->'adsense_slots', '{}'::jsonb),
    left(trim(coalesce(p_data->>'notes', '')), 1000)
  )
  ON CONFLICT (id) DO UPDATE SET
    provider = EXCLUDED.provider,
    status = EXCLUDED.status,
    adsense_client_id = EXCLUDED.adsense_client_id,
    auto_ads_enabled = EXCLUDED.auto_ads_enabled,
    placement_modes = EXCLUDED.placement_modes,
    adsense_slots = EXCLUDED.adsense_slots,
    notes = EXCLUDED.notes
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'settings', to_jsonb(v_row));
END;
$_$;


--
-- Name: kc_admin_save_banner(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_save_banner(p_data jsonb) RETURNS public.hero_banners
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: kc_admin_save_chart_prefs(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_save_chart_prefs(p_prefs jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID');
  end if;
  insert into public.kc_admin_chart_prefs (user_id, prefs, updated_at)
    values (v_uid, p_prefs, now())
    on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: kc_admin_search_posts_full(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_search_posts_full(p_query text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, legacy_id text, title text, content text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, author_id uuid, author_name text, module text, category text, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    p.id,
    p.legacy_id,
    coalesce(p.title, 'Post sem titulo') as title,
    coalesce(p.content, '') as content,
    coalesce(p.status, 'pending') as status,
    p.created_at,
    coalesce(p.updated_at, p.created_at) as updated_at,
    p.author_id,
    coalesce(pr.display_name, pr.full_name, pr.email, 'Usuario') as author_name,
    coalesce(p.module, '') as module,
    coalesce(p.category, '') as category,
    count(*) over() as total_count
  from public.posts as p
  left join public.profiles as pr
    on pr.id = p.author_id
  where
    (v_status is null or p.status = v_status)
    and (
      v_query is null
      or coalesce(p.title, '') ilike '%' || v_query || '%'
      or coalesce(p.content, '') ilike '%' || v_query || '%'
      or coalesce(p.legacy_id, '') ilike '%' || v_query || '%'
      or p.id::text ilike '%' || v_query || '%'
      or coalesce(pr.display_name, '') ilike '%' || v_query || '%'
      or coalesce(pr.full_name, '') ilike '%' || v_query || '%'
    )
  order by p.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;


--
-- Name: kc_admin_search_trends(integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_search_trends(p_limit integer DEFAULT 10, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(term text, count bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: FUNCTION kc_admin_search_trends(p_limit integer, p_since timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_admin_search_trends(p_limit integer, p_since timestamp with time zone) IS 'Top N termos mais buscados no período definido por p_since (padrão: últimos 30 dias). Requer perfil is_admin=true via SECURITY DEFINER. v8.3.0.3: remove sobrecarga antiga (integer) que causava ambiguidade 42725.';


--
-- Name: kc_admin_search_trends_classified(integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_search_trends_classified(p_limit integer DEFAULT 10, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(term text, count bigint, module text, module_confidence numeric)
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_admin_search_trends_classified($1, $2)
$_$;


--
-- Name: FUNCTION kc_admin_search_trends_classified(p_limit integer, p_since timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_admin_search_trends_classified(p_limit integer, p_since timestamp with time zone) IS 'Top termos de busca + módulo dominante entre os posts que casam com o termo (classificação por conteúdo). Wrapper INVOKER (search_path='''') -> kc_private (SECURITY DEFINER).';


--
-- Name: kc_admin_set_post_flood_limit(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_set_post_flood_limit(p_user_id uuid DEFAULT NULL::uuid, p_module text DEFAULT NULL::text, p_max_posts integer DEFAULT 3, p_window_minutes integer DEFAULT 60) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_module text := nullif(btrim(p_module), '');
  v_rows_updated int;
  v_limit_id uuid;
begin
  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem configurar limites.');
  end if;

  if p_max_posts < 0 or p_max_posts > 1000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_VALUE', 'message', 'Limite deve estar entre 0 e 1000.');
  end if;

  if p_window_minutes < 1 or p_window_minutes > 10080 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_WINDOW', 'message', 'Janela deve estar entre 1 minuto e 7 dias.');
  end if;

  update public.post_flood_limits
     set max_posts = p_max_posts,
         window_minutes = p_window_minutes,
         updated_at = now(),
         created_by = v_admin_id
   where ((p_user_id is null and user_id is null) or user_id = p_user_id)
     and ((v_module is null and module is null) or module = v_module)
   returning id into v_limit_id;

  get diagnostics v_rows_updated = row_count;

  if v_rows_updated = 0 then
    insert into public.post_flood_limits (user_id, module, max_posts, window_minutes, created_by)
    values (p_user_id, v_module, p_max_posts, p_window_minutes, v_admin_id)
    returning id into v_limit_id;
  end if;

  perform kc_private.kc_insert_audit_log(
    'post_flood_limit_changed',
    'post_flood_limits',
    v_limit_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'module', v_module,
      'max_posts', p_max_posts,
      'window_minutes', p_window_minutes
    ),
    v_admin_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'Limite de ritmo configurado com sucesso.',
    'id', v_limit_id,
    'user_id', p_user_id,
    'module', v_module,
    'max_posts', p_max_posts,
    'window_minutes', p_window_minutes
  );
end;
$$;


--
-- Name: kc_admin_set_post_limit(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_set_post_limit(p_user_id uuid DEFAULT NULL::uuid, p_module text DEFAULT NULL::text, p_max_active integer DEFAULT 5) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_id  UUID;
  v_is_admin  BOOLEAN;
  v_rows_updated INT;
BEGIN
  -- Admin check
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticação necessária.');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem configurar limites.');
  END IF;

  IF p_max_active < 0 OR p_max_active > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_VALUE', 'message', 'Limite deve estar entre 0 e 1000.');
  END IF;

  -- Upsert manual (evita problema de UNIQUE com NULLs no PostgreSQL)
  UPDATE public.post_limits
  SET max_active = p_max_active,
      updated_at = now(),
      created_by = v_admin_id
  WHERE (p_user_id IS NULL     AND user_id IS NULL     OR user_id = p_user_id)
    AND (p_module  IS NULL     AND module  IS NULL     OR module  = p_module);

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    INSERT INTO public.post_limits (user_id, module, max_active, created_by)
    VALUES (p_user_id, p_module, p_max_active, v_admin_id);
  END IF;

  -- Audit log
  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'post_limit_changed',
      'post_limits',
      COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
      v_admin_id,
      jsonb_build_object(
        'user_id',    p_user_id,
        'module',     p_module,
        'max_active', p_max_active
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'ok',        true,
    'code',      'OK',
    'message',   'Limite configurado com sucesso.',
    'user_id',   p_user_id,
    'module',    p_module,
    'max_active', p_max_active
  );
END;
$$;


--
-- Name: kc_admin_set_post_status(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_admin_set_post_status(p_post_id uuid, p_status text, p_close_reports boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid;
  v_role text := coalesce(auth.role(), '');
  v_status text;
  v_post record;
  v_updated integer := 0;
  v_closed integer := 0;
  v_now timestamptz := now();
begin
  v_uid := auth.uid();
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para moderar.');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem moderar posts.');
  end if;

  v_status := lower(trim(coalesce(p_status, '')));
  if v_status not in ('published', 'pending', 'hidden', 'deleted', 'expired', 'closed') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Status de moderacao invalido: ' || coalesce(v_status, '(vazio)'));
  end if;

  select id, author_id, status, module
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado: ' || coalesce(p_post_id::text, '(null)'));
  end if;

  update public.posts
     set status = v_status,
         moderation_reason = case when v_status = 'published' then null else moderation_reason end,
         updated_at = v_now,
         metadata = case
           when v_status = 'closed' then
             jsonb_set(
               jsonb_set(
                 jsonb_set(coalesce(metadata, '{}'::jsonb), '{closed_at}', to_jsonb(v_now::text), true),
                 '{closed_by}', to_jsonb(coalesce(v_uid::text, 'service_role')), true
               ),
               '{closed_reason}', to_jsonb('admin_closed'::text), true
             )
           else metadata
         end
   where id = p_post_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'code', 'UPDATE_NOT_APPLIED', 'message', 'O UPDATE nao afetou nenhuma linha.', 'post_id', p_post_id, 'status', v_status);
  end if;

  if p_close_reports then
    update public.reports
       set status = 'closed'
     where post_id = p_post_id
       and status = 'open';
    get diagnostics v_closed = row_count;
  end if;

  perform kc_private.kc_insert_audit_log(
    'post_admin_status_changed',
    'posts',
    p_post_id,
    jsonb_build_object(
      'old_status', v_post.status,
      'new_status', v_status,
      'post_author_id', v_post.author_id,
      'post_module', v_post.module,
      'closed_reports', v_closed
    ),
    v_uid
  );

  return jsonb_build_object('ok', true, 'code', 'OK', 'updated_posts', v_updated, 'closed_reports', v_closed, 'post_id', p_post_id, 'status', v_status);
end;
$$;


--
-- Name: kc_anti_spam_gate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_anti_spam_gate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_flood_check jsonb;
  v_url_count integer := 0;
  v_approved_count integer := 0;
  v_profile_created_at timestamptz;
  v_flood_limit int := 3;
  v_flood_count int := 0;
  v_flood_window int := 60;
  v_trusted boolean := false;
begin
  -- ── Verificacao 1: Flood control (vale para TODOS, inclusive bots) ──────────
  v_flood_check := kc_private.kc_compute_post_flood_check(new.author_id, new.module);
  v_flood_limit := coalesce((v_flood_check->>'limit')::int, 3);
  v_flood_count := coalesce((v_flood_check->>'count')::int, 0);
  v_flood_window := coalesce((v_flood_check->>'window_minutes')::int, 60);

  if not coalesce((v_flood_check->>'ok')::boolean, true) then
    raise exception 'flood_limit_exceeded'
      using hint = format(
              'Limite de %s publicacoes a cada %s minutos atingido. Aguarde antes de publicar novamente.',
              v_flood_limit,
              v_flood_window
            ),
            detail = v_flood_check::text,
            errcode = 'P0001';
  end if;

  -- ── Isencao: bots confiaveis (allowlist) pulam os soft gates abaixo ─────────
  v_trusted := kc_private.kc_is_trusted_publisher(new.author_id);
  if v_trusted then
    return new;
  end if;

  -- ── Verificacao 2: Link spam (>3 URLs externas) -> soft gate ────────────────
  select count(m[1])
    into v_url_count
    from regexp_matches(
      coalesce(new.description, '') || ' ' || coalesce(new.title, ''),
      'https?://[^\s)>\]"'']+',
      'gi'
    ) as m;

  if v_url_count > 3 then
    new.status := 'pending';
    new.moderation_reason := 'link_spam';
  end if;

  -- ── Verificacao 3: New user trust score -> soft gate ────────────────────────
  select p.created_at
    into v_profile_created_at
    from public.profiles p
   where p.id = new.author_id;

  if v_profile_created_at is not null and v_profile_created_at > now() - interval '7 days' then
    select count(*)
      into v_approved_count
      from public.posts p
     where p.author_id = new.author_id
       and p.status = 'published';

    if v_approved_count = 0 then
      new.status := 'pending';
      new.moderation_reason := coalesce(new.moderation_reason, 'new_user_scrutiny');
    end if;
  end if;

  -- ── Registro em audit_log para posts auto-moderados ─────────────────────────
  if new.status = 'pending' then
    begin
      insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
      values (
        'post_auto_moderated',
        'posts',
        new.id,
        new.author_id,
        jsonb_build_object(
          'reason', new.moderation_reason,
          'original_status', 'published',
          'new_status', 'pending',
          'module', new.module,
          'flood_limit', v_flood_limit,
          'flood_count', v_flood_count,
          'flood_window_minutes', v_flood_window
        )
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;


--
-- Name: kc_build_notification_delivery_payload(text, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_build_notification_delivery_payload(p_event_type text, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb, p_notification_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'event_type', lower(coalesce(nullif(trim(p_event_type), ''), 'system')),
      'title', coalesce(p_title, ''),
      'body', coalesce(p_body, ''),
      'data', case
        when jsonb_typeof(coalesce(p_data, '{}'::jsonb)) = 'object' then coalesce(p_data, '{}'::jsonb)
        else '{}'::jsonb
      end,
      'notification_id', case
        when p_notification_id is null then null
        else to_jsonb(p_notification_id::text)
      end
    )
  );
$$;


--
-- Name: kc_bump_post(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_bump_post(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_cooldown_days int := 7;
  v_next_bump_at timestamptz;
  v_bumped_at timestamptz := now();
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  select id, author_id, status, bumped_at
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_user_id);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_user_id;

  if v_post.author_id is distinct from v_user_id and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o autor ou administradores podem impulsionar esta publicacao.');
  end if;

  if v_post.status <> 'published' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Apenas publicacoes ativas podem ser impulsionadas.');
  end if;

  if not v_is_admin_override and v_post.bumped_at is not null and v_post.bumped_at > now() - (v_cooldown_days || ' days')::interval then
    v_next_bump_at := v_post.bumped_at + (v_cooldown_days || ' days')::interval;
    return jsonb_build_object(
      'ok', false,
      'code', 'COOLDOWN_ACTIVE',
      'message', 'Publicacao impulsionada recentemente.',
      'next_bump_at', v_next_bump_at,
      'cooldown_days', v_cooldown_days
    );
  end if;

  update public.posts
     set bumped_at = v_bumped_at,
         updated_at = v_bumped_at
   where id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_bumped',
    'posts',
    p_post_id,
    jsonb_build_object(
      'bumped_at', v_bumped_at,
      'source', case when v_is_admin_override then 'admin_bump' else 'user_bump' end,
      'post_author_id', v_post.author_id
    ),
    v_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'bumped_at', v_bumped_at,
    'next_bump_at', v_bumped_at + (v_cooldown_days || ' days')::interval,
    'message', 'Publicacao impulsionada com sucesso.'
  );
end;
$$;


--
-- Name: kc_can_read_post(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_can_read_post(p_author_id uuid, p_status text, p_visibility text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select case
    when coalesce(auth.role(), 'anon') = 'authenticated' then
      (
        (coalesce(p_status, 'published') in ('published', 'closed') and coalesce(p_visibility, 'public') in ('public', 'community'))
        or (select auth.uid()) = p_author_id
        or public.kc_is_admin((select auth.uid()))
      )
    else
      (
        coalesce(p_status, 'published') in ('published', 'closed')
        and coalesce(p_visibility, 'public') = 'public'
      )
  end;
$$;


--
-- Name: kc_chat_block_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_block_user(p_other_user_id uuid, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select kc_private.kc_chat_block_user($1, $2);
$_$;


--
-- Name: kc_chat_delete_message(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_delete_message(p_message_id uuid) RETURNS TABLE(out_media_path text)
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_chat_delete_message($1);
$_$;


--
-- Name: kc_chat_edit_message(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_edit_message(p_message_id uuid, p_new_content text) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select kc_private.kc_chat_edit_message($1, $2);
$_$;


--
-- Name: kc_chat_is_blocked(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_is_blocked(p_other_user_id uuid) RETURNS TABLE(out_i_blocked boolean, out_they_blocked boolean)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_chat_is_blocked($1);
$_$;


--
-- Name: kc_chat_list_conversations(integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_list_conversations(p_limit integer DEFAULT 30, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(out_conversation_id uuid, out_other_user_id uuid, out_other_display_name text, out_other_avatar_url text, out_last_message_at timestamp with time zone, out_last_message_preview text, out_last_message_sender uuid, out_last_message_type text, out_unread_count bigint, out_archived boolean)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_chat_list_conversations($1, $2);
$_$;


--
-- Name: kc_chat_list_messages(uuid, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_list_messages(p_conversation_id uuid, p_limit integer DEFAULT 50, p_before_ts timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(out_message_id uuid, out_sender_id uuid, out_message_type text, out_content text, out_media_path text, out_created_at timestamp with time zone, out_edited_at timestamp with time zone, out_deleted_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_chat_list_messages($1, $2, $3);
$_$;


--
-- Name: kc_chat_mark_read(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_mark_read(p_conversation_id uuid, p_until_message_id uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select kc_private.kc_chat_mark_read($1, $2);
$_$;


--
-- Name: kc_chat_report_message(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_report_message(p_message_id uuid, p_reason text, p_details text DEFAULT NULL::text) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select kc_private.kc_chat_report_message($1, $2, $3);
$_$;


--
-- Name: kc_chat_send_message(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_send_message(p_conversation_id uuid, p_content text, p_message_type text, p_media_path text) RETURNS TABLE(out_message_id uuid, out_created_at timestamp with time zone)
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_chat_send_message($1, $2, $3, $4);
$_$;


--
-- Name: FUNCTION kc_chat_send_message(p_conversation_id uuid, p_content text, p_message_type text, p_media_path text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_chat_send_message(p_conversation_id uuid, p_content text, p_message_type text, p_media_path text) IS 'v9.3.5.15: envia mensagem com bloqueio bidirecional, rate-limit e media_path restrito ao remetente.';


--
-- Name: kc_chat_start_conversation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_start_conversation(p_other_user_id uuid) RETURNS TABLE(out_conversation_id uuid, out_is_new boolean)
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_chat_start_conversation($1);
$_$;


--
-- Name: FUNCTION kc_chat_start_conversation(p_other_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_chat_start_conversation(p_other_user_id uuid) IS 'v9.3.5.14: wrapper de chat executavel apenas por authenticated.';


--
-- Name: kc_chat_unblock_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_unblock_user(p_other_user_id uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select kc_private.kc_chat_unblock_user($1);
$_$;


--
-- Name: kc_chat_unread_total(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_chat_unread_total() RETURNS TABLE(out_total bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select * from kc_private.kc_chat_unread_total();
$$;


--
-- Name: kc_check_comment_depth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_check_comment_depth() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_parent record;
  v_has_children boolean := false;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception using
      errcode = 'check_violation',
      message = 'Comentario nao pode responder a si mesmo.';
  end if;

  select id, post_id, parent_id
    into v_parent
  from public.comments
  where id = new.parent_id;

  if v_parent is null then
    raise exception using
      errcode = 'foreign_key_violation',
      message = 'Comentario pai nao encontrado.';
  end if;

  if v_parent.post_id <> new.post_id then
    raise exception using
      errcode = 'check_violation',
      message = 'Resposta deve pertencer ao mesmo post.';
  end if;

  if v_parent.parent_id is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'Apenas 1 nivel de resposta e permitido.';
  end if;

  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    select exists(
      select 1
      from public.comments child
      where child.parent_id = new.id
    ) into v_has_children;

    if v_has_children then
      raise exception using
        errcode = 'check_violation',
        message = 'Comentario que ja possui respostas nao pode virar resposta.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: kc_check_duplicate_post(uuid, text, text, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_check_duplicate_post(p_user_id uuid, p_module text, p_title text, p_threshold double precision DEFAULT 0.45) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id UUID;
  v_candidates JSONB;
BEGIN
  -- Apenas o próprio usuário pode verificar seus próprios posts
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR v_caller_id != p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', true, 'candidates', '[]'::JSONB);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',         id,
      'title',      title,
      'status',     status,
      'module',     module,
      'created_at', created_at,
      'similarity', ROUND((similarity(title, p_title))::NUMERIC, 2)
    )
    ORDER BY similarity(title, p_title) DESC
  ), '[]'::JSONB)
  INTO v_candidates
  FROM public.posts
  WHERE author_id = p_user_id
    AND module    = p_module
    AND status IN ('published', 'hidden', 'expired')
    AND similarity(title, p_title) >= p_threshold;

  RETURN jsonb_build_object(
    'ok',         true,
    'candidates', v_candidates
  );
END;
$$;


--
-- Name: kc_check_post_flood_limit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_check_post_flood_limit(p_user_id uuid, p_module text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_target_user uuid := coalesce(p_user_id, v_uid);
begin
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_target_user is distinct from v_uid
     and v_role <> 'service_role'
     and not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  return kc_private.kc_compute_post_flood_check(v_target_user, p_module);
end;
$$;


--
-- Name: kc_check_post_limit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_check_post_limit(p_user_id uuid, p_module text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_limit BIGINT;
  v_count BIGINT;
BEGIN
  v_limit := kc_get_post_limit(p_user_id, p_module);
  v_count := kc_count_active_posts(p_user_id, p_module);

  RETURN jsonb_build_object(
    'ok',        v_count < v_limit,
    'limit',     v_limit,
    'count',     v_count,
    'remaining', GREATEST(0, v_limit - v_count)
  );
END;
$$;


--
-- Name: notification_delivery_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    channel text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    destination text,
    destination_source text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempts_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    sent_at timestamp with time zone,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_delivery_outbox_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text]))),
    CONSTRAINT notification_delivery_outbox_event_type_check CHECK ((event_type = ANY (ARRAY['comment_on_post'::text, 'comment_reply'::text, 'vote_on_post'::text, 'post_expired'::text, 'post_reported'::text, 'system'::text]))),
    CONSTRAINT notification_delivery_outbox_payload_object_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT notification_delivery_outbox_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'blocked'::text, 'cancelled'::text, 'skipped'::text])))
);


--
-- Name: TABLE notification_delivery_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_delivery_outbox IS 'Fila privada de entrega externa de notificacoes (email/whatsapp), desacoplada dos triggers principais.';


--
-- Name: COLUMN notification_delivery_outbox.notification_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_delivery_outbox.notification_id IS 'Referencia opcional para a notificacao in-app correspondente. Pode ser nula quando o usuario desligou in_app e manteve apenas canais externos.';


--
-- Name: COLUMN notification_delivery_outbox.destination_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_delivery_outbox.destination_source IS 'Origem resolvida do destino privado. Ex.: auth.users.email. Nao deve reaproveitar contato publico do perfil.';


--
-- Name: kc_claim_notification_delivery_batch(text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_claim_notification_delivery_batch(p_channel text, p_limit integer DEFAULT 25, p_worker text DEFAULT NULL::text) RETURNS SETOF public.notification_delivery_outbox
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_worker text := coalesce(nullif(trim(p_worker), ''), 'notification-dispatcher');
begin
  if v_channel not in ('email', 'whatsapp') then
    return;
  end if;

  return query
  with candidates as (
    select o.id
      from public.notification_delivery_outbox as o
     where o.channel = v_channel
       and (
         (o.status = 'queued' and coalesce(o.next_attempt_at, now()) <= now())
         or
         (o.status = 'failed' and coalesce(o.next_attempt_at, now()) <= now())
         or
         (o.status = 'processing' and o.locked_at is not null and o.locked_at <= now() - interval '15 minutes')
       )
     order by o.created_at asc
     limit v_limit
     for update skip locked
  ),
  claimed as (
    update public.notification_delivery_outbox as o
       set status = 'processing',
           locked_at = now(),
           locked_by = v_worker
      from candidates
     where o.id = candidates.id
     returning o.*
  )
  select *
    from claimed
   order by created_at asc;
end;
$$;


--
-- Name: FUNCTION kc_claim_notification_delivery_batch(p_channel text, p_limit integer, p_worker text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_claim_notification_delivery_batch(p_channel text, p_limit integer, p_worker text) IS 'Claim atomico de um lote do outbox de notificacoes externas, com lock e recuperacao de locks stale.';


--
-- Name: kc_close_post(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_close_post(p_post_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_reason text;
  v_closed_at timestamptz := now();
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para encerrar a publicacao.');
  end if;

  select id, author_id, status
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_uid);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_uid;
  v_reason := nullif(left(trim(coalesce(p_reason, case when v_is_admin_override then 'admin_closed' else 'owner_closed' end)), 80), '');

  if v_post.author_id is distinct from v_uid and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o dono ou administradores podem encerrar esta publicacao.');
  end if;

  if v_post.status = 'closed' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CLOSED', 'status', 'closed', 'new_status', 'closed', 'message', 'Publicacao ja encerrada.');
  end if;

  if v_post.status not in ('published', 'hidden', 'expired') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Esta publicacao nao pode ser encerrada neste status.');
  end if;

  update public.posts
     set status = 'closed',
         updated_at = v_closed_at,
         metadata = jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(metadata, '{}'::jsonb), '{closed_at}', to_jsonb(v_closed_at::text), true),
             '{closed_by}', to_jsonb(coalesce(v_uid::text, 'service_role')), true
           ),
           '{closed_reason}', to_jsonb(coalesce(v_reason, case when v_is_admin_override then 'admin_closed' else 'owner_closed' end)),
           true
         )
   where id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_closed',
    'posts',
    p_post_id,
    jsonb_build_object(
      'source', case when v_is_admin_override then 'admin' else 'owner' end,
      'reason', coalesce(v_reason, case when v_is_admin_override then 'admin_closed' else 'owner_closed' end),
      'post_author_id', v_post.author_id
    ),
    v_uid
  );

  return jsonb_build_object('ok', true, 'status', 'closed', 'new_status', 'closed', 'closed_at', v_closed_at, 'message', 'Publicacao encerrada.');
end;
$$;


--
-- Name: kc_compute_highlight_score(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_compute_highlight_score(p_post_id uuid) RETURNS double precision
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_votos          int     := 0;
  v_coupon_clicks  int     := 0;
  v_share_count    int     := 0;
  v_created_at     timestamptz;
  v_status         text;
  v_saves_hl       bigint  := 0;
  v_saves_fav      bigint  := 0;
  v_comments       bigint  := 0;
  v_last_comment   timestamptz;
  v_comment_bonus  int     := 0;
  v_age_weeks      double precision;
  v_score          double precision;
begin
  select
    coalesce(votos, 0),
    coalesce(coupon_clicks, 0),
    coalesce(share_count, 0),
    created_at,
    status
  into v_votos, v_coupon_clicks, v_share_count, v_created_at, v_status
  from public.posts
  where id = p_post_id;

  if not found then
    return 0;
  end if;

  if v_status <> 'published' or v_created_at is null then
    return 0;
  end if;

  select count(*) into v_saves_hl
  from public.saved_posts
  where post_id = p_post_id and kind = 'highlight';

  select count(*) into v_saves_fav
  from public.saved_posts
  where post_id = p_post_id and kind = 'favorite';

  begin
    select count(*), max(created_at)
      into v_comments, v_last_comment
      from public.comments
     where post_id = p_post_id;
  exception when others then
    v_comments := 0;
    v_last_comment := null;
  end;

  if v_last_comment is not null then
    if v_last_comment > now() - interval '24 hours' then
      v_comment_bonus := 5;
    elsif v_last_comment > now() - interval '7 days' then
      v_comment_bonus := 3;
    end if;
  end if;

  v_age_weeks := extract(epoch from (now() - v_created_at)) / 604800.0;
  if v_age_weeks < 0 then
    v_age_weeks := 0;
  end if;

  v_score := (
    (v_votos * 10)
    + (v_saves_hl * 8)
    + (v_saves_fav * 5)
    + (v_comments * 3)
    + v_comment_bonus
    + (v_coupon_clicks * 4)
    + (v_share_count * 2)
  )::double precision / (1.0 + v_age_weeks);

  return greatest(v_score, 0);
end;
$$;


--
-- Name: kc_count_active_posts(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_count_active_posts(p_user_id uuid, p_module text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COUNT(*)
  FROM public.posts
  WHERE author_id = p_user_id
    AND status    = 'published'
    AND (p_module IS NULL OR module = p_module);
$$;


--
-- Name: kc_count_recent_notification_deliveries(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_count_recent_notification_deliveries(p_user_id uuid, p_channel text, p_since timestamp with time zone DEFAULT (now() - '01:00:00'::interval)) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select count(*)::integer
    from public.notification_delivery_outbox as o
   where o.user_id = p_user_id
     and lower(coalesce(o.channel, '')) = lower(coalesce(p_channel, ''))
     and o.status = 'sent'
     and o.sent_at is not null
     and o.sent_at >= coalesce(p_since, now() - interval '60 minutes');
$$;


--
-- Name: FUNCTION kc_count_recent_notification_deliveries(p_user_id uuid, p_channel text, p_since timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_count_recent_notification_deliveries(p_user_id uuid, p_channel text, p_since timestamp with time zone) IS 'Conta entregas recentes por usuario/canal para rate-limit operacional do dispatcher.';


--
-- Name: kc_count_recent_posts(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_count_recent_posts(p_user_id uuid, p_module text DEFAULT NULL::text, p_window_minutes integer DEFAULT 60) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COUNT(*)
  FROM public.posts p
  WHERE p.author_id = p_user_id
    AND p.created_at > now() - make_interval(mins => GREATEST(1, COALESCE(p_window_minutes, 60)))
    AND (NULLIF(BTRIM(p_module), '') IS NULL OR p.module = NULLIF(BTRIM(p_module), ''));
$$;


--
-- Name: kc_create_help_request(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_create_help_request(p_payload jsonb) RETURNS TABLE(out_id uuid, out_created_at timestamp with time zone)
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_create_help_request($1);
$_$;


--
-- Name: FUNCTION kc_create_help_request(p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--



--
-- Name: kc_default_notification_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_default_notification_preferences() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'comment_on_post', jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'comment_reply',   jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'vote_on_post',    jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'post_expired',    jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'post_reported',   jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'system',          jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false)
  );
$$;


--
-- Name: kc_emit_notification_event(uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_emit_notification_event(p_user_id uuid, p_event_type text, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_event_type text := lower(coalesce(nullif(trim(p_event_type), ''), 'system'));
  v_data jsonb := case
    when jsonb_typeof(coalesce(p_data, '{}'::jsonb)) = 'object' then coalesce(p_data, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_title text := coalesce(p_title, '');
  v_body text := coalesce(p_body, '');
  v_notification_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if public.kc_notification_channel_enabled(p_user_id, v_event_type, 'in_app') then
    insert into public.notifications (user_id, type, title, body, data)
    values (p_user_id, v_event_type, v_title, v_body, v_data)
    returning id into v_notification_id;
  end if;

  if public.kc_notification_channel_enabled(p_user_id, v_event_type, 'email') then
    perform public.kc_enqueue_notification_delivery(
      p_user_id,
      v_event_type,
      'email',
      v_title,
      v_body,
      v_data,
      v_notification_id
    );
  end if;

  if public.kc_notification_channel_enabled(p_user_id, v_event_type, 'whatsapp') then
    perform public.kc_enqueue_notification_delivery(
      p_user_id,
      v_event_type,
      'whatsapp',
      v_title,
      v_body,
      v_data,
      v_notification_id
    );
  end if;

  return v_notification_id;
end;
$$;


--
-- Name: kc_enqueue_notification_delivery(uuid, text, text, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_enqueue_notification_delivery(p_user_id uuid, p_event_type text, p_channel text, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb, p_notification_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), ''));
  v_resolution jsonb;
  v_available boolean := false;
  v_destination text;
  v_destination_source text;
  v_reason text;
  v_status text := 'queued';
  v_outbox_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if v_channel not in ('email', 'whatsapp') then
    return null;
  end if;

  v_resolution := public.kc_resolve_notification_delivery_destination(p_user_id, v_channel);
  v_available := coalesce((v_resolution ->> 'available')::boolean, false);
  v_destination := nullif(trim(coalesce(v_resolution ->> 'destination', '')), '');
  v_destination_source := nullif(trim(coalesce(v_resolution ->> 'destination_source', '')), '');
  v_reason := nullif(trim(coalesce(v_resolution ->> 'reason', '')), '');
  v_status := case when v_available then 'queued' else 'blocked' end;

  insert into public.notification_delivery_outbox (
    notification_id,
    user_id,
    event_type,
    channel,
    status,
    destination,
    destination_source,
    payload,
    error_code,
    error_message
  )
  values (
    p_notification_id,
    p_user_id,
    lower(coalesce(nullif(trim(p_event_type), ''), 'system')),
    v_channel,
    v_status,
    v_destination,
    v_destination_source,
    public.kc_build_notification_delivery_payload(
      p_event_type,
      p_title,
      p_body,
      p_data,
      p_notification_id
    ),
    case when v_status = 'blocked' then coalesce(v_reason, 'destination_unavailable') else null end,
    case
      when v_status <> 'blocked' then null
      when v_reason = 'private_destination_not_configured' then 'Destino privado ainda nao configurado para este canal.'
      when v_reason = 'missing_user' then 'Usuario de destino ausente para a entrega externa.'
      when v_reason = 'unsupported_channel' then 'Canal externo ainda nao suportado.'
      else 'Destino privado indisponivel para a entrega externa.'
    end
  )
  on conflict (notification_id, channel) do update
    set user_id = excluded.user_id,
        event_type = excluded.event_type,
        status = excluded.status,
        destination = excluded.destination,
        destination_source = excluded.destination_source,
        payload = excluded.payload,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        next_attempt_at = excluded.next_attempt_at,
        locked_at = null,
        locked_by = null
  returning id into v_outbox_id;

  return v_outbox_id;
end;
$$;


--
-- Name: kc_expire_old_posts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_expire_old_posts() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_count bigint := 0;
  v_expired record;
  v_reason text;
begin
  for v_expired in
    select p.id, p.author_id, p.title, p.module, p.status, p.expires_at
      from public.posts p
     where p.expires_at is not null
       and p.expires_at <= now()
       and (
         p.status = 'published'
         or (
           p.status = 'pending'
           and coalesce(p.visibility, 'public') in ('public', 'community')
           and exists (
             select 1
               from public.audit_log al
              where al.entity_type = 'posts'
                and al.entity_id = p.id
                and al.action = 'post_auto_moderated'
                and al.payload->>'original_status' = 'published'
                and al.payload->>'reason' = 'new_user_scrutiny'
           )
         )
       )
     for update of p skip locked
  loop
    v_reason := case
      when v_expired.status = 'pending' then 'auto_expired_pending'
      else 'auto_expired'
    end;

    update public.posts
       set status = 'closed',
           highlight_score = 0,
           updated_at = now(),
           metadata = (coalesce(metadata, '{}'::jsonb) - 'closed_by')
             || jsonb_build_object(
               'closed_at', now()::text,
               'closed_reason', v_reason,
               'closed_from_status', v_expired.status,
               'closed_source', 'system_expiration',
               'expires_at', v_expired.expires_at::text
             )
     where id = v_expired.id;

    if found then
      v_count := v_count + 1;

      begin
        perform public.kc_notify_on_post_expire(
          v_expired.id,
          v_expired.author_id,
          v_expired.title,
          v_expired.module
        );
      exception when others then
        null;
      end;

      begin
        perform public.audit_log_insert(
          'post_closed',
          'posts',
          v_expired.id,
          jsonb_build_object(
            'source', 'system_expiration',
            'reason', v_reason,
            'old_status', v_expired.status,
            'new_status', 'closed',
            'expires_at', v_expired.expires_at
          ),
          null
        );
      exception
        when undefined_function then null;
        when undefined_table then null;
        when insufficient_privilege then null;
      end;
    end if;
  end loop;

  if v_count > 0 then
    begin
      insert into public.audit_log (action, entity_type, entity_id, payload)
      values (
        'posts_auto_closed',
        'system',
        gen_random_uuid(),
        jsonb_build_object('count', v_count, 'ran_at', now()::text)
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'closed_count', v_count,
    'expired_count', v_count
  );
end;
$$;


--
-- Name: kc_feed_array_contains_all(text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_array_contains_all(p_haystack text[], p_needles text[]) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN COALESCE(array_length(COALESCE(p_needles, ARRAY[]::TEXT[]), 1), 0) = 0 THEN TRUE
    ELSE COALESCE(p_haystack, ARRAY[]::TEXT[]) @> COALESCE(p_needles, ARRAY[]::TEXT[])
  END;
$$;


--
-- Name: kc_feed_caronas_campus_match(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_caronas_campus_match(p_campus text, p_haystack text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_campus TEXT := public.kc_feed_slug_key(p_campus);
  v_haystack TEXT := public.kc_feed_normalize_text(p_haystack);
BEGIN
  IF v_campus = '' OR v_haystack = '' THEN
    RETURN FALSE;
  END IF;

  IF v_campus = 'campus-ii' THEN
    RETURN position('campus ii' IN v_haystack) > 0 OR position('samambaia' IN v_haystack) > 0;
  END IF;

  IF v_campus = 'campus-samambaia' THEN
    RETURN position('campus samambaia' IN v_haystack) > 0
      OR position('campus ii' IN v_haystack) > 0
      OR position('samambaia' IN v_haystack) > 0;
  END IF;

  IF v_campus = 'campus-colemar' THEN
    RETURN position('campus colemar' IN v_haystack) > 0
      OR position('colemar' IN v_haystack) > 0
      OR position('praca universitaria' IN v_haystack) > 0;
  END IF;

  RETURN position(replace(v_campus, '-', ' ') IN v_haystack) > 0
    OR position(v_campus IN v_haystack) > 0;
END;
$$;


--
-- Name: kc_feed_classify_period(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_classify_period(p_value text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_match TEXT[];
  v_hour INT;
BEGIN
  v_match := regexp_match(COALESCE(p_value, ''), '(\d{1,2})[h:.]?(\d{2})?');
  IF v_match IS NULL OR array_length(v_match, 1) = 0 THEN
    RETURN '';
  END IF;

  BEGIN
    v_hour := NULLIF(v_match[1], '')::INT;
  EXCEPTION WHEN OTHERS THEN
    RETURN '';
  END;

  IF v_hour >= 5 AND v_hour < 12 THEN RETURN 'matutino'; END IF;
  IF v_hour >= 12 AND v_hour < 18 THEN RETURN 'vespertino'; END IF;
  RETURN 'noturno';
END;
$$;


--
-- Name: kc_feed_event_local_date(jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_event_local_date(p_metadata jsonb, p_created_at timestamp with time zone) RETURNS date
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_meta JSONB := COALESCE(p_metadata, '{}'::JSONB);
  v_raw TEXT := btrim(COALESCE(
    v_meta->>'data_evento',
    v_meta->>'dataEvento',
    v_meta->>'data',
    ''
  ));
BEGIN
  IF v_raw ~ '^\d{4}-\d{2}-\d{2}' THEN
    BEGIN
      RETURN substring(v_raw FROM 1 FOR 10)::DATE;
    EXCEPTION WHEN OTHERS THEN
      RETURN public.kc_feed_local_date(p_created_at);
    END;
  END IF;

  RETURN public.kc_feed_local_date(p_created_at);
END;
$$;


--
-- Name: kc_feed_jsonb_bool(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_jsonb_bool(p_value jsonb) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN FALSE
    WHEN jsonb_typeof(p_value) = 'boolean' THEN p_value::TEXT = 'true'
    ELSE public.kc_feed_normalize_text(p_value #>> '{}') IN ('1', 'true', 'yes', 'sim')
  END;
$$;


--
-- Name: kc_feed_jsonb_slug_list(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_jsonb_slug_list(p_value jsonb) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(array_agg(item) FILTER (WHERE item <> ''), ARRAY[]::TEXT[])
  FROM (
    SELECT public.kc_feed_slug_key(value) AS item
    FROM unnest(public.kc_feed_jsonb_text_list(p_value)) AS value
  ) AS items;
$$;


--
-- Name: kc_feed_jsonb_text_list(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_jsonb_text_list(p_value jsonb) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  WITH normalized_input AS (
    SELECT CASE
      WHEN p_value IS NULL THEN '[]'::JSONB
      WHEN jsonb_typeof(p_value) = 'array' THEN p_value
      ELSE jsonb_build_array(p_value #>> '{}')
    END AS payload
  )
  SELECT COALESCE(array_agg(item) FILTER (WHERE item <> ''), ARRAY[]::TEXT[])
  FROM normalized_input
  CROSS JOIN LATERAL (
    SELECT public.kc_feed_normalize_text(value) AS item
    FROM jsonb_array_elements_text(payload) AS value
  ) AS items;
$$;


--
-- Name: kc_feed_local_date(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_local_date(p_value timestamp with time zone) RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    ELSE (p_value AT TIME ZONE 'America/Sao_Paulo')::DATE
  END;
$$;


--
-- Name: kc_feed_lost_found_status_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_lost_found_status_key(p_value text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_key TEXT := public.kc_feed_normalize_text(p_value);
BEGIN
  IF v_key = '' THEN RETURN ''; END IF;
  IF position('perd' IN v_key) > 0 THEN RETURN 'perdido'; END IF;
  IF position('encontr' IN v_key) > 0 OR position('achad' IN v_key) > 0 THEN RETURN 'encontrado'; END IF;
  RETURN v_key;
END;
$$;


--
-- Name: kc_feed_lost_found_type_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_lost_found_type_key(p_value text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_key TEXT := public.kc_feed_normalize_text(p_value);
BEGIN
  IF v_key = '' THEN RETURN ''; END IF;
  IF position('document' IN v_key) > 0 THEN RETURN 'documento'; END IF;
  IF position('eletron' IN v_key) > 0 THEN RETURN 'eletronico'; END IF;
  IF position('outro' IN v_key) > 0 THEN RETURN 'outro'; END IF;
  RETURN v_key;
END;
$$;


--
-- Name: kc_feed_market_category_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_market_category_key(p_value text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_key TEXT := public.kc_feed_slug_key(p_value);
BEGIN
  IF v_key = '' THEN RETURN ''; END IF;
  IF v_key LIKE '%eletron%' THEN RETURN 'eletronicos'; END IF;
  IF v_key LIKE '%livr%' THEN RETURN 'livros'; END IF;
  IF v_key LIKE '%mov%' OR v_key LIKE '%mobil%' THEN RETURN 'moveis'; END IF;
  IF v_key LIKE '%vest%' OR v_key LIKE '%roup%' THEN RETURN 'vestuario'; END IF;
  IF v_key LIKE '%outro%' THEN RETURN 'outros'; END IF;
  IF right(v_key, 1) <> 's' AND v_key || 's' IN ('eletronicos', 'livros', 'moveis', 'outros') THEN
    RETURN v_key || 's';
  END IF;
  RETURN v_key;
END;
$$;


--
-- Name: kc_feed_market_condition_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_market_condition_key(p_value text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_key TEXT := public.kc_feed_normalize_text(p_value);
BEGIN
  IF v_key = '' THEN RETURN ''; END IF;
  IF position('semi' IN v_key) > 0 THEN RETURN 'seminovo'; END IF;
  IF position('novo' IN v_key) > 0 THEN RETURN 'novo'; END IF;
  IF position('usado' IN v_key) > 0 THEN RETURN 'usado'; END IF;
  RETURN replace(v_key, ' ', '');
END;
$$;


--
-- Name: kc_feed_matches_date_preset(text, timestamp with time zone, jsonb, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_matches_date_preset(p_module text, p_created_at timestamp with time zone, p_metadata jsonb, p_preset text, p_now timestamp with time zone DEFAULT now()) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_module TEXT := public.kc_feed_normalize_text(p_module);
  v_preset TEXT := public.kc_feed_normalize_text(p_preset);
  v_today DATE := public.kc_feed_local_date(COALESCE(p_now, now()));
  v_candidate DATE := CASE
    WHEN public.kc_feed_normalize_text(p_module) = 'eventos' THEN public.kc_feed_event_local_date(p_metadata, p_created_at)
    ELSE public.kc_feed_local_date(p_created_at)
  END;
BEGIN
  IF v_preset = '' THEN
    RETURN TRUE;
  END IF;

  IF v_module IN ('compra-venda', 'livros', 'moradia', 'oportunidades', 'achados-perdidos')
     AND v_preset NOT IN ('today', 'last7d', 'last30d') THEN
    RETURN TRUE;
  END IF;

  IF v_module = 'caronas'
     AND v_preset NOT IN ('today', 'last3d', 'last7d') THEN
    RETURN TRUE;
  END IF;

  IF v_module = 'eventos'
     AND v_preset NOT IN ('today', 'next7d', 'thisMonth', 'past') THEN
    RETURN TRUE;
  END IF;

  IF v_candidate IS NULL OR v_today IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_preset = 'today' THEN
    RETURN v_candidate = v_today;
  END IF;

  IF v_preset = 'last3d' THEN
    RETURN v_candidate BETWEEN (v_today - 2) AND v_today;
  END IF;

  IF v_preset = 'last7d' THEN
    RETURN v_candidate BETWEEN (v_today - 6) AND v_today;
  END IF;

  IF v_preset = 'last30d' THEN
    RETURN v_candidate BETWEEN (v_today - 29) AND v_today;
  END IF;

  IF v_preset = 'next7d' THEN
    RETURN v_candidate BETWEEN v_today AND (v_today + 6);
  END IF;

  IF v_preset = 'thisMonth' THEN
    RETURN date_trunc('month', v_candidate::timestamp) = date_trunc('month', v_today::timestamp);
  END IF;

  IF v_preset = 'past' THEN
    RETURN v_candidate < v_today;
  END IF;

  RETURN TRUE;
END;
$$;


--
-- Name: kc_feed_normalize_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_normalize_text(p_value text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select trim(lower(public.kc_unaccent(coalesce(p_value, ''))));
$$;


--
-- Name: kc_feed_opportunity_area_key(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_opportunity_area_key(p_explicit text, p_haystack text, p_subcategory text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_explicit TEXT := public.kc_feed_slug_key(p_explicit);
  v_haystack TEXT := public.kc_feed_normalize_text(p_haystack);
  v_subcategory TEXT := public.kc_feed_slug_key(p_subcategory);
BEGIN
  IF v_explicit <> '' THEN RETURN v_explicit; END IF;
  IF v_subcategory <> '' THEN RETURN v_subcategory; END IF;

  IF position('tecnolog' IN v_haystack) > 0 OR position('desenvolv' IN v_haystack) > 0 OR position('program' IN v_haystack) > 0 THEN RETURN 'tecnologia'; END IF;
  IF position('marketing' IN v_haystack) > 0 OR position('midia social' IN v_haystack) > 0 THEN RETURN 'marketing'; END IF;
  IF position('design' IN v_haystack) > 0 OR position('ux' IN v_haystack) > 0 OR position('ui' IN v_haystack) > 0 THEN RETURN 'design'; END IF;
  IF position('educa' IN v_haystack) > 0 OR position('ensino' IN v_haystack) > 0 OR position('professor' IN v_haystack) > 0 THEN RETURN 'educacao'; END IF;
  IF position('music' IN v_haystack) > 0 THEN RETURN 'musica'; END IF;
  IF position('administra' IN v_haystack) > 0 OR position('financeir' IN v_haystack) > 0 THEN RETURN 'administrativo'; END IF;
  IF position('engenhar' IN v_haystack) > 0 THEN RETURN 'engenharia'; END IF;
  IF position('saude' IN v_haystack) > 0 OR position('enferm' IN v_haystack) > 0 THEN RETURN 'saude'; END IF;
  IF position('pesquisa' IN v_haystack) > 0 OR position('cientif' IN v_haystack) > 0 THEN RETURN 'pesquisa'; END IF;

  RETURN '';
END;
$$;


--
-- Name: kc_feed_opportunity_employment_key(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_opportunity_employment_key(p_explicit text, p_haystack text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_explicit TEXT := public.kc_feed_normalize_text(p_explicit);
  v_haystack TEXT := public.kc_feed_normalize_text(p_haystack);
BEGIN
  IF position('jovem aprendiz' IN v_explicit) > 0 OR position('aprendiz' IN v_explicit) > 0 THEN RETURN 'jovem-aprendiz'; END IF;
  IF position('temporario' IN v_explicit) > 0 THEN RETURN 'temporario'; END IF;
  IF position('clt' IN v_explicit) > 0 THEN RETURN 'clt'; END IF;
  IF position('pj' IN v_explicit) > 0 OR position('pessoa juridica' IN v_explicit) > 0 THEN RETURN 'pj'; END IF;

  IF position('jovem aprendiz' IN v_haystack) > 0 OR position('aprendiz' IN v_haystack) > 0 THEN RETURN 'jovem-aprendiz'; END IF;
  IF position('temporario' IN v_haystack) > 0 THEN RETURN 'temporario'; END IF;
  IF position('clt' IN v_haystack) > 0 THEN RETURN 'clt'; END IF;
  IF position('pj' IN v_haystack) > 0 OR position('pessoa juridica' IN v_haystack) > 0 THEN RETURN 'pj'; END IF;

  RETURN '';
END;
$$;


--
-- Name: kc_feed_opportunity_type_key(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_opportunity_type_key(p_value text, p_haystack text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_key TEXT := public.kc_feed_slug_key(p_value);
  v_haystack TEXT := public.kc_feed_normalize_text(p_haystack);
BEGIN
  IF position('estag' IN v_key) > 0 THEN RETURN 'estagio'; END IF;
  IF position('empreg' IN v_key) > 0 THEN RETURN 'emprego'; END IF;
  IF position('freela' IN v_key) > 0 OR position('freelancer' IN v_key) > 0 THEN RETURN 'freelancer'; END IF;
  IF position('monitor' IN v_key) > 0 THEN RETURN 'monitoria'; END IF;
  IF position('volunt' IN v_key) > 0 THEN RETURN 'voluntariado'; END IF;

  IF position('freelancer' IN v_haystack) > 0 OR position('freela' IN v_haystack) > 0 THEN RETURN 'freelancer'; END IF;
  IF position('monitoria' IN v_haystack) > 0 OR position('monitor ' IN v_haystack) > 0 THEN RETURN 'monitoria'; END IF;
  IF position('volunt' IN v_haystack) > 0 THEN RETURN 'voluntariado'; END IF;
  IF position('estagio' IN v_haystack) > 0 OR position('trainee' IN v_haystack) > 0 THEN RETURN 'estagio'; END IF;
  IF position('emprego' IN v_haystack) > 0 OR position('clt' IN v_haystack) > 0 OR position('vaga' IN v_haystack) > 0 THEN RETURN 'emprego'; END IF;

  RETURN v_key;
END;
$$;


--
-- Name: kc_feed_opportunity_work_mode_key(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_opportunity_work_mode_key(p_explicit text, p_haystack text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_explicit TEXT := public.kc_feed_normalize_text(p_explicit);
  v_haystack TEXT := public.kc_feed_normalize_text(p_haystack);
BEGIN
  IF position('hibrid' IN v_explicit) > 0 OR position('hybrid' IN v_explicit) > 0 THEN RETURN 'hibrido'; END IF;
  IF position('remot' IN v_explicit) > 0 OR position('home office' IN v_explicit) > 0 OR position('home-office' IN v_explicit) > 0 THEN RETURN 'remoto'; END IF;
  IF position('presencial' IN v_explicit) > 0 OR position('onsite' IN v_explicit) > 0 OR position('on site' IN v_explicit) > 0 OR position('on-site' IN v_explicit) > 0 THEN RETURN 'presencial'; END IF;

  IF position('hibrid' IN v_haystack) > 0 OR position('hybrid' IN v_haystack) > 0 THEN RETURN 'hibrido'; END IF;
  IF position('remot' IN v_haystack) > 0 OR position('home office' IN v_haystack) > 0 OR position('home-office' IN v_haystack) > 0 THEN RETURN 'remoto'; END IF;
  IF position('presencial' IN v_haystack) > 0 OR position('onsite' IN v_haystack) > 0 OR position('on site' IN v_haystack) > 0 OR position('on-site' IN v_haystack) > 0 THEN RETURN 'presencial'; END IF;

  RETURN '';
END;
$$;


--
-- Name: kc_feed_parse_numeric_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_parse_numeric_text(p_value text) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_clean TEXT := regexp_replace(COALESCE(p_value, ''), '[^0-9,.\-]', '', 'g');
BEGIN
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;

  IF position(',' IN v_clean) > 0 AND position('.' IN v_clean) > 0 THEN
    IF strpos(v_clean, ',') > strpos(v_clean, '.') THEN
      v_clean := replace(v_clean, '.', '');
      v_clean := replace(v_clean, ',', '.');
    ELSE
      v_clean := replace(v_clean, ',', '');
    END IF;
  ELSIF position(',' IN v_clean) > 0 THEN
    v_clean := replace(v_clean, ',', '.');
  END IF;

  BEGIN
    RETURN NULLIF(v_clean, '')::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;


--
-- Name: kc_feed_slug_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_feed_slug_key(p_value text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(public.kc_feed_normalize_text(p_value), '[^a-z0-9]+', '-', 'g'));
$$;


--
-- Name: kc_get_feed_ad_config(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_feed_ad_config(p_page_path text DEFAULT '/'::text, p_module_key text DEFAULT ''::text, p_placement text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
  SELECT kc_private.kc_get_feed_ad_config($1, $2, $3)
$_$;


--
-- Name: kc_get_feed_ads(text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_feed_ads(p_page_path text DEFAULT '/'::text, p_module_key text DEFAULT ''::text, p_search_query text DEFAULT ''::text, p_placement text DEFAULT NULL::text, p_limit integer DEFAULT 6) RETURNS TABLE(id uuid, name text, advertiser_name text, sponsor_label text, title text, description text, image_url text, cta_label text, target_url text, campaign_type text, placements text[], module_keys text[], tags text[], priority integer, frequency_cap_per_session integer, starts_at timestamp with time zone, ends_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  WITH params AS (
    SELECT
      lower(trim(coalesce(p_module_key, ''))) AS module_key,
      lower(trim(coalesce(p_placement, ''))) AS placement_key,
      lower(trim(coalesce(p_search_query, ''))) AS q,
      greatest(1, least(coalesce(p_limit, 6), 12)) AS row_limit
  )
  SELECT
    c.id,
    c.name,
    c.advertiser_name,
    c.sponsor_label,
    c.title,
    c.description,
    c.image_url,
    c.cta_label,
    c.target_url,
    c.campaign_type,
    c.placements,
    c.module_keys,
    c.tags,
    c.priority,
    c.frequency_cap_per_session,
    c.starts_at,
    c.ends_at
  FROM public.ad_campaigns c
  CROSS JOIN params p
  WHERE c.status = 'active'
    AND (c.starts_at IS NULL OR c.starts_at <= now())
    AND (c.ends_at IS NULL OR c.ends_at >= now())
    AND (
      p.placement_key = ''
      OR p.placement_key = ANY (SELECT lower(x) FROM unnest(c.placements) AS x)
    )
    AND (
      cardinality(c.module_keys) = 0
      OR p.module_key = ''
      OR p.module_key = ANY (SELECT lower(x) FROM unnest(c.module_keys) AS x)
    )
  ORDER BY
    CASE
      WHEN p.q <> '' AND EXISTS (
        SELECT 1
        FROM unnest(c.tags || c.module_keys) AS term
        WHERE lower(term) LIKE '%' || p.q || '%' OR p.q LIKE '%' || lower(term) || '%'
      ) THEN 1
      ELSE 0
    END DESC,
    c.priority DESC,
    c.updated_at DESC
  LIMIT (SELECT row_limit FROM params);
$$;


--
-- Name: FUNCTION kc_get_feed_ads(p_page_path text, p_module_key text, p_search_query text, p_placement text, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_get_feed_ads(p_page_path text, p_module_key text, p_search_query text, p_placement text, p_limit integer) IS 'Retorna campanhas ativas e contextuais para placements de feed, incluindo frequency_cap_per_session, sem dados pessoais.';


--
-- Name: kc_get_feed_cursor(text, text[], text, text, text, text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_feed_cursor(p_module text DEFAULT NULL::text, p_modules text[] DEFAULT NULL::text[], p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_tag text DEFAULT NULL::text, p_q text DEFAULT NULL::text, p_sort_by text DEFAULT 'recentes'::text, p_limit integer DEFAULT 12, p_cursor text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select public.kc_get_feed_cursor(
    p_module,
    p_modules,
    p_category,
    p_subcategory,
    p_tag,
    p_q,
    p_sort_by,
    p_limit,
    p_cursor,
    null::jsonb
  );
$$;


--
-- Name: kc_get_feed_cursor(text, text[], text, text, text, text, text, integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_feed_cursor(p_module text DEFAULT NULL::text, p_modules text[] DEFAULT NULL::text[], p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_tag text DEFAULT NULL::text, p_q text DEFAULT NULL::text, p_sort_by text DEFAULT 'recentes'::text, p_limit integer DEFAULT 12, p_cursor text DEFAULT NULL::text, p_request_params jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 12), 50));
  v_sort text := case
    when lower(coalesce(p_sort_by, 'recentes')) = 'votos' then 'votos'
    when lower(coalesce(p_sort_by, 'recentes')) = 'comentados' then 'comentados'
    else 'recentes'
  end;
  v_module_list text[] := array[]::text[];
  v_cursor_json jsonb := null;
  v_cursor_created timestamptz := null;
  v_cursor_id uuid := null;
  v_cursor_highlight double precision := 0;
  v_cursor_votos integer := 0;
  v_cursor_last_comment timestamptz := null;
  v_cursor_effective timestamptz := null;
  v_cursor_status_priority integer := 1;
  v_posts jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := null;
  v_date_preset text := null;
  v_price_min numeric := null;
  v_price_max numeric := null;
begin
  if p_modules is not null and array_length(p_modules, 1) > 0 then
    select array_agg(lower(trim(value))) into v_module_list
      from unnest(p_modules) as value
     where nullif(trim(value), '') is not null;
  elsif nullif(trim(coalesce(p_module, '')), '') is not null then
    v_module_list := array[lower(trim(p_module))];
  end if;

  if p_request_params is not null then
    v_date_preset := nullif(trim(coalesce(p_request_params->>'datePreset', p_request_params->>'date_preset', '')), '');
    begin
      v_price_min := nullif(trim(coalesce(p_request_params->>'priceMin', p_request_params->>'price_min', '')), '')::numeric;
    exception when others then
      v_price_min := null;
    end;
    begin
      v_price_max := nullif(trim(coalesce(p_request_params->>'priceMax', p_request_params->>'price_max', '')), '')::numeric;
    exception when others then
      v_price_max := null;
    end;
  end if;

  if nullif(trim(coalesce(p_cursor, '')), '') is not null then
    begin
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      v_cursor_created := nullif(v_cursor_json->>'created_at', '')::timestamptz;
      v_cursor_id := nullif(v_cursor_json->>'id', '')::uuid;
      v_cursor_highlight := coalesce(nullif(v_cursor_json->>'highlight_score', '')::double precision, 0);
      v_cursor_votos := coalesce(nullif(v_cursor_json->>'votos', '')::integer, 0);
      v_cursor_last_comment := nullif(v_cursor_json->>'last_comment_at', '')::timestamptz;
      v_cursor_effective := coalesce(
        nullif(v_cursor_json->>'effective_at', '')::timestamptz,
        nullif(v_cursor_json->>'bumped_at', '')::timestamptz,
        v_cursor_created
      );
      v_cursor_status_priority := coalesce(nullif(v_cursor_json->>'status_priority', '')::integer, 1);
    exception when others then
      v_cursor_json := null;
    end;
  end if;

  with filtered as (
    select
      p.id,
      p.legacy_id,
      p.author_id,
      p.title,
      p.description,
      p.price,
      p.location,
      p.module,
      p.category,
      p.status,
      p.visibility,
      case when p.status = 'closed' then 0 else 1 end as status_priority,
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0) as highlight_score,
      p.bumped_at,
      coalesce(p.bumped_at, p.created_at) as effective_at,
      p.last_comment_at,
      case
        when pr.id is null then null
        else jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'verified', coalesce(pr.verified, false)
        )
      end as profile_payload,
      coalesce(pm.items, '[]'::jsonb) as media_payload,
      coalesce(cc.comment_count, 0) as comment_count
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
          order by m.is_cover desc, m.id asc
        ),
        '[]'::jsonb
      ) as items
      from public.post_media m
      where m.post_id = p.id
    ) pm on true
    left join lateral (
      select count(*)::int as comment_count
      from public.comments c
      where c.post_id = p.id
    ) cc on true
    where p.legacy_id is null
      and p.status in ('published', 'closed')
      and public.kc_can_read_post(p.author_id, p.status, p.visibility)
      and (coalesce(array_length(v_module_list, 1), 0) = 0 or lower(coalesce(p.module, '')) = any(v_module_list))
      and (p_category is null or lower(coalesce(p.category, '')) = lower(p_category))
      and (
        p_subcategory is null
        or lower(coalesce(
          p.metadata->>'subcategory',
          p.metadata->>'subcategoria',
          p.metadata->>'subcategoryKey',
          p.metadata->>'subcategoriaKey',
          ''
        )) = lower(p_subcategory)
      )
      and (
        p_tag is null
        or coalesce(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
      )
      and (
        coalesce(nullif(btrim(p_q), ''), null) is null
        or p.title ilike '%' || btrim(p_q) || '%'
        or p.description ilike '%' || btrim(p_q) || '%'
      )
      and public.kc_matches_feed_request_params(
        p.module,
        p.category,
        coalesce(
          p.metadata->>'subcategory',
          p.metadata->>'subcategoria',
          p.metadata->>'subcategoryKey',
          p.metadata->>'subcategoriaKey',
          ''
        ),
        p.title,
        p.description,
        coalesce(p.metadata, '{}'::jsonb),
        coalesce(pr.verified, false),
        p_request_params
      )
      and public.kc_feed_matches_date_preset(
        p.module,
        p.created_at,
        coalesce(p.metadata, '{}'::jsonb),
        v_date_preset
      )
      and (v_price_min is null or (p.price is not null and p.price >= v_price_min))
      and (v_price_max is null or (p.price is not null and p.price <= v_price_max))
      and (
        v_cursor_json is null
        or (
          v_sort = 'votos'
          and row(case when p.status = 'closed' then 0 else 1 end, coalesce(p.highlight_score, 0), coalesce(p.votos, 0), p.created_at, p.id)
              < row(v_cursor_status_priority, v_cursor_highlight, v_cursor_votos, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'comentados'
          and p.last_comment_at is not null
          and row(p.last_comment_at, p.created_at, p.id)
              < row(v_cursor_last_comment, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'recentes'
          and row(coalesce(p.bumped_at, p.created_at), p.created_at, p.id)
              < row(v_cursor_effective, v_cursor_created, v_cursor_id)
        )
      )
      and (v_sort <> 'comentados' or p.last_comment_at is not null)
  ),
  limited as (
    select *
    from filtered
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit + 1
  ),
  kept as (
    select *
    from limited
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit
  ),
  cursor_row as (
    select *
    from kept
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    offset greatest(v_limit - 1, 0)
    limit 1
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', kept.id,
          'legacy_id', kept.legacy_id,
          'author_id', kept.author_id,
          'title', kept.title,
          'description', kept.description,
          'price', kept.price,
          'location', kept.location,
          'module', kept.module,
          'category', kept.category,
          'status', kept.status,
          'visibility', kept.visibility,
          'metadata', kept.metadata,
          'created_at', kept.created_at,
          'votos', kept.votos,
          'highlight_score', kept.highlight_score,
          'bumped_at', kept.bumped_at,
          'effective_at', kept.effective_at,
          'last_comment_at', kept.last_comment_at,
          'profiles', kept.profile_payload,
          'post_media', kept.media_payload,
          'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
        )
        order by
          case when v_sort = 'votos' then kept.status_priority end desc nulls last,
          case when v_sort = 'votos' then kept.highlight_score end desc nulls last,
          case when v_sort = 'votos' then kept.votos end desc nulls last,
          case when v_sort = 'comentados' then kept.last_comment_at end desc nulls last,
          case when v_sort = 'recentes' then kept.effective_at end desc nulls last,
          kept.created_at desc,
          kept.id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from limited),
    case
      when (select count(*) > v_limit from limited) then (
        select encode(
          convert_to(
            jsonb_build_object(
              'sort', v_sort,
              'status_priority', cursor_row.status_priority,
              'highlight_score', cursor_row.highlight_score,
              'votos', cursor_row.votos,
              'last_comment_at', cursor_row.last_comment_at,
              'effective_at', cursor_row.effective_at,
              'bumped_at', cursor_row.bumped_at,
              'created_at', cursor_row.created_at,
              'id', cursor_row.id
            )::text,
            'utf8'
          ),
          'base64'
        )
        from cursor_row
      )
      else null
    end
    into v_posts, v_has_more, v_next_cursor
  from kept;

  return jsonb_build_object(
    'ok', true,
    'posts', coalesce(v_posts, '[]'::jsonb),
    'hasMore', coalesce(v_has_more, false),
    'has_more', coalesce(v_has_more, false),
    'nextCursor', v_next_cursor,
    'next_cursor', v_next_cursor
  );
end;
$$;


--
-- Name: kc_get_my_saved_posts(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_my_saved_posts(p_kind text DEFAULT NULL::text, p_page integer DEFAULT 1, p_limit integer DEFAULT 12) RETURNS TABLE(post_uuid uuid, legacy_id text, title text, created_at timestamp with time zone, status text, module text, category text, saved_at timestamp with time zone, save_kinds text[])
    LANGUAGE sql STABLE
    AS $$
  with normalized as (
    select nullif(lower(trim(coalesce(p_kind, ''))), '') as kind_filter,
           greatest(coalesce(p_page, 1), 1) as page_number,
           least(greatest(coalesce(p_limit, 12), 1), 50) as page_size
  ),
  grouped as (
    select
      sp.post_id,
      max(coalesce(sp.updated_at, sp.created_at)) as saved_at,
      array_agg(distinct sp.kind order by sp.kind) as save_kinds
    from public.saved_posts sp
    cross join normalized n
    where sp.user_id = auth.uid()
      and (n.kind_filter is null or sp.kind = n.kind_filter)
    group by sp.post_id
  )
  select
    p.id as post_uuid,
    coalesce(p.legacy_id::text, p.id::text) as legacy_id,
    p.title,
    p.created_at,
    p.status,
    p.module,
    p.category,
    g.saved_at,
    g.save_kinds
  from grouped g
  join public.posts p on p.id = g.post_id
  cross join normalized n
  order by g.saved_at desc, p.created_at desc
  limit (select page_size from normalized)
  offset ((select page_number from normalized) - 1) * (select page_size from normalized);
$$;


--
-- Name: kc_get_my_saved_posts_count(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_my_saved_posts_count(p_kind text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE sql STABLE
    AS $$
  with normalized as (
    select nullif(lower(trim(coalesce(p_kind, ''))), '') as kind_filter
  )
  select count(*)
  from (
    select sp.post_id
    from public.saved_posts sp
    cross join normalized n
    where sp.user_id = auth.uid()
      and (n.kind_filter is null or sp.kind = n.kind_filter)
    group by sp.post_id
  ) grouped;
$$;


--
-- Name: kc_get_my_votes(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_my_votes(p_post_ids uuid[]) RETURNS TABLE(post_id uuid, direction text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pv.post_id, pv.direction
  FROM   post_votes pv
  WHERE  pv.voter_id = auth.uid()
    AND  pv.post_id  = ANY(p_post_ids);
$$;


--
-- Name: FUNCTION kc_get_my_votes(p_post_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_get_my_votes(p_post_ids uuid[]) IS 'Retorna os votos do usuário autenticado para um array de post_ids. Usado pelo front-end para marcar os botões hot/cold como ativos.';


--
-- Name: kc_get_notifications(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_notifications(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_rows    JSONB;
  v_total   BIGINT;
  v_unread  BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  END IF;

  -- Buscar notificações
  SELECT COALESCE(jsonb_agg(row_to_json(n)::JSONB ORDER BY n.created_at DESC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT id, type, title, body, data, read, created_at
    FROM public.notifications
    WHERE user_id = v_user_id
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) n;

  -- Contagem total
  SELECT count(*)
  INTO v_total
  FROM public.notifications
  WHERE user_id = v_user_id;

  -- Contagem de não-lidas
  SELECT count(*)
  INTO v_unread
  FROM public.notifications
  WHERE user_id = v_user_id AND read = false;

  RETURN jsonb_build_object(
    'ok', true,
    'notifications', v_rows,
    'total', v_total,
    'unread', v_unread
  );
END;
$$;


--
-- Name: kc_get_personalized_tabs(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_personalized_tabs(p_session_id text DEFAULT NULL::text, p_limit integer DEFAULT 8) RETURNS TABLE(out_tab_key text, out_module_key text, out_category_key text, out_score numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
  select * from kc_private.kc_get_personalized_tabs($1, $2);
$_$;


--
-- Name: FUNCTION kc_get_personalized_tabs(p_session_id text, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--



--
-- Name: kc_get_post_analytics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_post_analytics(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id    UUID;
  v_post       RECORD;
  v_comments   BIGINT := 0;
  v_saves      BIGINT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  -- Buscar post
  SELECT id, author_id, votos, coupon_clicks, share_count, view_count,
         highlight_score, created_at, status
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  -- Apenas autor ou admin
  IF v_post.author_id <> v_user_id
     AND NOT public.kc_is_admin(v_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  -- Contar comentarios
  SELECT COUNT(*) INTO v_comments
  FROM public.comments
  WHERE post_id = p_post_id;

  -- Contar saves (todos os tipos)
  SELECT COUNT(*) INTO v_saves
  FROM public.saved_posts
  WHERE post_id = p_post_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'post_id',       v_post.id,
    'status',        v_post.status,
    'views',         COALESCE(v_post.view_count, 0),
    'votos',         COALESCE(v_post.votos, 0),
    'comments',      v_comments,
    'shares',        COALESCE(v_post.share_count, 0),
    'coupon_clicks', COALESCE(v_post.coupon_clicks, 0),
    'saves',         v_saves,
    'highlight_score', COALESCE(v_post.highlight_score, 0),
    'created_at',    v_post.created_at
  );
END;
$$;


--
-- Name: kc_get_post_flood_limit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_post_flood_limit(p_user_id uuid, p_module text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_target_user uuid := coalesce(p_user_id, v_uid);
begin
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_target_user is distinct from v_uid
     and v_role <> 'service_role'
     and not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  return kc_private.kc_resolve_post_flood_limit(v_target_user, p_module);
end;
$$;


--
-- Name: kc_get_post_limit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_post_limit(p_user_id uuid, p_module text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_limit INT;
BEGIN
  -- Prioridade 1: user + module
  IF p_module IS NOT NULL THEN
    SELECT max_active INTO v_limit
    FROM public.post_limits
    WHERE user_id = p_user_id AND module = p_module
    LIMIT 1;
    IF FOUND THEN RETURN v_limit; END IF;
  END IF;

  -- Prioridade 2: user + all modules
  SELECT max_active INTO v_limit
  FROM public.post_limits
  WHERE user_id = p_user_id AND module IS NULL
  LIMIT 1;
  IF FOUND THEN RETURN v_limit; END IF;

  -- Prioridade 3: global + module
  IF p_module IS NOT NULL THEN
    SELECT max_active INTO v_limit
    FROM public.post_limits
    WHERE user_id IS NULL AND module = p_module
    LIMIT 1;
    IF FOUND THEN RETURN v_limit; END IF;
  END IF;

  -- Prioridade 4: global default
  SELECT max_active INTO v_limit
  FROM public.post_limits
  WHERE user_id IS NULL AND module IS NULL
  LIMIT 1;
  IF FOUND THEN RETURN v_limit; END IF;

  -- Prioridade 5: hardcoded
  RETURN 5;
END;
$$;


--
-- Name: kc_get_profile_access_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_profile_access_state(p_profile_id uuid) RETURNS TABLE("exists" boolean, profile_public boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    true as "exists",
    coalesce(p.profile_public, false) as profile_public
  from public.profiles p
  where p.id = p_profile_id

  union all

  select
    false as "exists",
    false as profile_public
  where not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
  );
$$;


--
-- Name: kc_get_profile_highlights(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_profile_highlights(p_profile_id uuid, p_page integer DEFAULT 1, p_limit integer DEFAULT 12) RETURNS TABLE(post_uuid uuid, legacy_id text, title text, created_at timestamp with time zone, status text, module text, category text, saved_at timestamp with time zone, save_kinds text[])
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with normalized as (
    select greatest(coalesce(p_page, 1), 1) as page_number,
           least(greatest(coalesce(p_limit, 12), 1), 50) as page_size
  ),
  grouped as (
    select
      sp.post_id,
      max(coalesce(sp.updated_at, sp.created_at)) as saved_at
    from public.saved_posts sp
    where sp.user_id = p_profile_id
      and sp.kind = 'highlight'
    group by sp.post_id
  )
  select
    p.id as post_uuid,
    coalesce(p.legacy_id::text, p.id::text) as legacy_id,
    p.title,
    p.created_at,
    p.status,
    p.module,
    p.category,
    g.saved_at,
    array['highlight']::text[] as save_kinds
  from grouped g
  join public.posts p on p.id = g.post_id
  join public.profiles pr on pr.id = p_profile_id
  cross join normalized n
  where p.status = 'published'
    and (
      (
        coalesce(auth.role(), 'anon') = 'authenticated'
        and coalesce(p.visibility, 'public') in ('public', 'community')
      )
      or (
        coalesce(auth.role(), 'anon') <> 'authenticated'
        and pr.profile_public = true
        and coalesce(p.visibility, 'public') = 'public'
      )
    )
  order by g.saved_at desc, p.created_at desc
  limit (select page_size from normalized)
  offset ((select page_number from normalized) - 1) * (select page_size from normalized);
$$;


--
-- Name: kc_get_profile_highlights_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_profile_highlights_count(p_profile_id uuid) RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select count(*)
  from (
    select sp.post_id
    from public.saved_posts sp
    join public.posts p on p.id = sp.post_id
    join public.profiles pr on pr.id = p_profile_id
    where sp.user_id = p_profile_id
      and sp.kind = 'highlight'
      and p.status = 'published'
      and (
        (
          coalesce(auth.role(), 'anon') = 'authenticated'
          and coalesce(p.visibility, 'public') in ('public', 'community')
        )
        or (
          coalesce(auth.role(), 'anon') <> 'authenticated'
          and pr.profile_public = true
          and coalesce(p.visibility, 'public') = 'public'
        )
      )
    group by sp.post_id
  ) grouped;
$$;


--
-- Name: kc_get_top_contributors(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_top_contributors(p_period text DEFAULT 'month'::text, p_module text DEFAULT NULL::text, p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_since  timestamptz;
  v_result jsonb;
begin
  -- Calcular início do período
  v_since := case p_period
    when 'day'   then now() - interval '1 day'
    when 'week'  then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    else now() - interval '30 days'
  end;

  with user_posts as (
    select
      author_id,
      count(*)                          as posts_count,
      coalesce(sum(votos), 0)           as total_votes,
      coalesce(sum(coupon_clicks), 0)   as total_coupon_clicks,
      coalesce(sum(share_count), 0)     as total_shares
    from public.posts
    where created_at >= v_since
      and status not in ('deleted')
      and (p_module is null or module = p_module)
    group by author_id
  ),
  user_comments as (
    select author_id, count(*) as comments_count
    from public.comments
    where created_at >= v_since
    group by author_id
  ),
  user_penalties as (
    -- Penalidade: posts deletados que possuem denúncias fechadas
    select p.author_id, count(distinct p.id) as penalty_count
    from public.posts p
    inner join public.reports r on r.post_id = p.id and r.status = 'closed'
    where p.status = 'deleted'
      and p.created_at >= v_since
      and (p_module is null or p.module = p_module)
    group by p.author_id
  ),
  scores as (
    select
      coalesce(up.author_id, uc.author_id) as user_id,
      coalesce(up.posts_count, 0)          as posts_count,
      coalesce(up.total_votes, 0)          as votes_received,
      coalesce(uc.comments_count, 0)       as comments_count,
      coalesce(up.total_coupon_clicks, 0)  as coupon_clicks,
      coalesce(up.total_shares, 0)         as share_count,
      coalesce(pen.penalty_count, 0)       as penalties,
      greatest(0,
        coalesce(up.posts_count, 0)         * 15 +
        coalesce(up.total_votes, 0)         * 10 +
        coalesce(uc.comments_count, 0)      *  5 +
        coalesce(up.total_coupon_clicks, 0) *  4 +
        coalesce(up.total_shares, 0)        *  3
        - coalesce(pen.penalty_count, 0)    * 50
      ) as score
    from user_posts up
    full outer join user_comments uc on up.author_id = uc.author_id
    left join user_penalties pen on coalesce(up.author_id, uc.author_id) = pen.author_id
  ),
  ranked as (
    select
      s.*,
      pr.display_name,
      pr.avatar_url,
      row_number() over (order by s.score desc, s.posts_count desc) as rank
    from scores s
    inner join public.profiles pr on pr.id = s.user_id
    where s.score > 0
    order by s.score desc, s.posts_count desc
    limit p_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id',        r.user_id,
      'display_name',   r.display_name,
      'avatar_url',     r.avatar_url,
      'rank',           r.rank,
      'score',          r.score,
      'posts_count',    r.posts_count,
      'votes_received', r.votes_received,
      'comments_count', r.comments_count,
      'coupon_clicks',  r.coupon_clicks,
      'share_count',    r.share_count,
      'penalties',      r.penalties
    ) order by r.rank
  ), '[]'::jsonb) into v_result
  from ranked r;

  return v_result;
end;
$$;


--
-- Name: kc_get_user_rating_state(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_user_rating_state(p_target_user_id uuid, p_context_post_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_reason text := 'OK';
  v_can_rate boolean := false;
  v_target_exists boolean := false;
  v_context_valid boolean := true;
  v_has_interaction boolean := false;
  v_my_rating jsonb := null;
begin
  select exists(
    select 1
    from public.profiles as p
    where p.id = p_target_user_id
  ) into v_target_exists;

  if v_target_exists and v_actor_id is not null then
    select jsonb_build_object(
      'id', ur.id,
      'targetUserId', ur.target_user_id,
      'raterUserId', ur.rater_user_id,
      'contextPostId', ur.context_post_id,
      'rating', ur.rating,
      'comment', ur.comment,
      'createdAt', ur.created_at,
      'updatedAt', ur.updated_at
    )
      into v_my_rating
      from public.user_ratings as ur
     where ur.target_user_id = p_target_user_id
       and ur.rater_user_id = v_actor_id
     limit 1;
  end if;

  if not v_target_exists then
    v_reason := 'TARGET_NOT_FOUND';
  elsif v_actor_id is null then
    v_reason := 'AUTH_REQUIRED';
  elsif v_actor_id = p_target_user_id then
    v_reason := 'SELF';
  else
    if p_context_post_id is not null then
      select exists(
        select 1
        from public.posts as p
        where p.id = p_context_post_id
          and p.author_id = p_target_user_id
      ) into v_context_valid;
    end if;

    if not v_context_valid then
      v_reason := 'INVALID_CONTEXT';
    elsif v_my_rating is not null then
      v_can_rate := true;
      v_reason := 'OK';
    else
      select exists(
        select 1
        from public.posts as p
        where p.author_id = p_target_user_id
          and (
            p_context_post_id is null
            or p.id = p_context_post_id
          )
          and (
            exists(
              select 1
              from public.comments as c
              where c.post_id = p.id
                and c.author_id = v_actor_id
            )
            or exists(
              select 1
              from public.post_votes as pv
              where pv.post_id = p.id
                and pv.voter_id = v_actor_id
            )
            or exists(
              select 1
              from public.saved_posts as sp
              where sp.post_id = p.id
                and sp.user_id = v_actor_id
            )
          )
      ) into v_has_interaction;

      if v_has_interaction then
        v_can_rate := true;
        v_reason := 'OK';
      else
        v_reason := 'NO_INTERACTION';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'targetUserId', p_target_user_id,
    'contextPostId', p_context_post_id,
    'canRate', v_can_rate,
    'reason', v_reason,
    'myRating', v_my_rating
  );
end;
$$;


--
-- Name: kc_get_user_rating_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_get_user_rating_summary(p_target_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (
      select jsonb_build_object(
        'userId', p.id,
        'average', case
          when coalesce(p.rating_count, 0) > 0 then round(coalesce(p.rating_avg, 0)::numeric, 2)
          else null
        end,
        'count', coalesce(p.rating_count, 0)
      )
      from public.profiles as p
      where p.id = p_target_user_id
    ),
    jsonb_build_object(
      'userId', p_target_user_id,
      'average', null,
      'count', 0
    )
  );
$$;


--
-- Name: kc_handle_new_profile_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_handle_new_profile_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_display_name text;
  v_avatar_url text;
begin
  v_display_name := public.kc_profile_initial_display_name(new.email, v_metadata);
  v_avatar_url := public.kc_profile_initial_avatar_url(new.id, new.email, v_metadata);

  insert into public.profiles (
    id,
    email,
    full_name,
    display_name,
    avatar_url,
    social_links,
    social_visibility
  )
  values (
    new.id,
    new.email,
    v_display_name,
    v_display_name,
    v_avatar_url,
    '{}'::jsonb,
    '{}'::jsonb
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name),
        display_name = coalesce(nullif(trim(public.profiles.display_name), ''), excluded.display_name),
        avatar_url = coalesce(nullif(trim(public.profiles.avatar_url), ''), excluded.avatar_url);

  return new;
end;
$$;


--
-- Name: kc_handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


--
-- Name: kc_home_category_post_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_home_category_post_counts() RETURNS TABLE(module_key text, category_key text, count bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with matched as (
    select
      public.kc_home_match_category(
        p.module,
        p.category,
        coalesce(
          p.metadata ->> 'subcategoria',
          p.metadata ->> 'subcategory',
          p.metadata ->> 'subcategoriaKey',
          p.metadata ->> 'subcategoryKey'
        ),
        p.title,
        p.description
      ) as category_id
    from public.posts p
    where p.status = 'published'
  )
  select
    split_part(category_id, ':', 1) as module_key,
    split_part(category_id, ':', 2) as category_key,
    count(*)::bigint as count
  from matched
  where category_id is not null
  group by 1, 2
  order by 1, 2;
$$;


--
-- Name: FUNCTION kc_home_category_post_counts(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_home_category_post_counts() IS 'Retorna contagens agregadas de publicações ativas por categoria da home.';


--
-- Name: kc_home_match_category(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_home_match_category(p_module_key text, p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_module text := public.kc_home_normalize_key(p_module_key);
  v_blob text := public.kc_home_normalize_key(
    concat_ws(
      ' ',
      coalesce(p_category, ''),
      coalesce(p_subcategory, ''),
      coalesce(p_title, ''),
      coalesce(p_description, '')
    )
  );
begin
  if v_module = 'compra-venda' then
    if v_blob like '%livro%' or v_blob like '%apostila%' or v_blob like '%material%' then
      return 'compra-venda:livros';
    elsif v_blob like '%eletron%' or v_blob like '%celular%' or v_blob like '%notebook%' or v_blob like '%tablet%' then
      return 'compra-venda:eletronicos';
    elsif v_blob like '%movel%' or v_blob like '%cadeira%' or v_blob like '%mesa%' or v_blob like '%armario%' then
      return 'compra-venda:moveis';
    elsif v_blob like '%vestuario%' or v_blob like '%roupa%' or v_blob like '%camisa%' or v_blob like '%casaco%' then
      return 'compra-venda:vestuario';
    else
      return 'compra-venda:outros';
    end if;
  elsif v_module = 'eventos' then
    if v_blob like '%sustentab%' or v_blob like '%ambiental%' or v_blob like '%eco%' then
      return 'eventos:sustentabilidade';
    elsif v_blob like '%academ%' or v_blob like '%palestra%' or v_blob like '%seminar%' or v_blob like '%congress%' then
      return 'eventos:academico';
    elsif v_blob like '%cultural%' or v_blob like '%show%' or v_blob like '%arte%' or v_blob like '%musica%' then
      return 'eventos:cultural';
    elsif v_blob like '%esport%' or v_blob like '%corrida%' or v_blob like '%torneio%' or v_blob like '%jogo%' then
      return 'eventos:esportivo';
    elsif v_blob like '%workshop%' or v_blob like '%oficina%' or v_blob like '%curso%' then
      return 'eventos:workshop';
    end if;
  elsif v_module = 'moradia' then
    if v_blob like '%republic%' then
      return 'moradia:republica';
    elsif v_blob like '%quarto%' then
      return 'moradia:quarto';
    elsif v_blob like '%apartament%' or v_blob like '%apto%' then
      return 'moradia:apartamento';
    elsif v_blob like '%casa%' then
      return 'moradia:casa';
    elsif v_blob like '%procur%' or v_blob like '%procuro%' then
      return 'moradia:procurando';
    end if;
  elsif v_module = 'oportunidades' then
    if v_blob like '%estagio%' then
      return 'oportunidades:estagio';
    elsif v_blob like '%emprego%' or v_blob like '%vaga%' or v_blob like '%clt%' then
      return 'oportunidades:emprego';
    elsif v_blob like '%freela%' or v_blob like '%freelancer%' then
      return 'oportunidades:freelancer';
    elsif v_blob like '%monitoria%' or v_blob like '%aula%' or v_blob like '%reforco%' then
      return 'oportunidades:monitoria';
    elsif v_blob like '%volunt%' or v_blob like '%ong%' or v_blob like '%extensao%' then
      return 'oportunidades:voluntariado';
    end if;
  elsif v_module = 'caronas' then
    if v_blob like '%ofere%' then
      return 'caronas:ofereco';
    elsif v_blob like '%procuro%' then
      return 'caronas:procuro';
    elsif v_blob like '%campus%' or v_blob like '%samambaia%' or v_blob like '%colemar%' then
      return 'caronas:campus';
    elsif v_blob like '%centro%' then
      return 'caronas:centro';
    end if;
  elsif v_module = 'achados-perdidos' then
    if v_blob like '%perdid%' or v_blob like '%sumi%' then
      return 'achados-perdidos:perdido';
    elsif v_blob like '%encontrad%' or v_blob like '%achad%' then
      return 'achados-perdidos:encontrado';
    elsif v_blob like '%documento%' or v_blob like '%rg%' or v_blob like '%cpf%' or v_blob like '%cartao%' then
      return 'achados-perdidos:documentos';
    elsif v_blob like '%eletron%' or v_blob like '%celular%' or v_blob like '%notebook%' then
      return 'achados-perdidos:eletronicos';
    else
      return 'achados-perdidos:outros';
    end if;
  end if;

  return null;
end;
$$;


--
-- Name: kc_home_normalize_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_home_normalize_key(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select trim(both '-' from
    regexp_replace(
      translate(
        lower(coalesce(p_value, '')),
        'áàãâäéèêëíìîïóòõôöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
$$;


--
-- Name: kc_increment_location_usage(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_increment_location_usage(p_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.caronas_locations
  set usage_count = usage_count + 1, updated_at = now()
  where key = p_key;
end;
$$;


--
-- Name: kc_is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_is_admin(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
      from public.profiles p
     where p.id = p_user_id
       and p.is_admin = true
  );
$$;


--
-- Name: kc_is_institutional_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_is_institutional_email(p_email text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  select case
    when p_email is null                                then false
    when lower(trim(p_email)) like '%@ufg.br'          then true
    when lower(trim(p_email)) like '%@discente.ufg.br' then true
    when lower(trim(p_email)) like '%@egresso.ufg.br'  then true
    else false
  end;
$$;


--
-- Name: kc_is_invited_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_is_invited_email(p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.kc_invited_emails
    where lower(trim(email))   = lower(trim(p_email))
      and expires_at            > now()
  );
$$;


--
-- Name: kc_list_home_category_affinity(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_list_home_category_affinity(p_session_id text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(module_key text, category_key text, score numeric, interactions_count bigint, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with combined as (
    select
      hca.module_key,
      hca.category_key,
      hca.score,
      hca.interactions_count,
      hca.updated_at
    from public.home_category_affinity hca
    where (auth.uid() is not null and hca.owner_kind = 'user' and hca.user_id = auth.uid())
       or (nullif(trim(coalesce(p_session_id, '')), '') is not null and hca.owner_kind = 'session' and hca.session_id = nullif(trim(coalesce(p_session_id, '')), ''))
  )
  select
    module_key,
    category_key,
    sum(score)::numeric as score,
    sum(interactions_count)::bigint as interactions_count,
    max(updated_at) as updated_at
  from combined
  group by module_key, category_key
  order by score desc, interactions_count desc, category_key asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;


--
-- Name: FUNCTION kc_list_home_category_affinity(p_session_id text, p_limit integer, p_offset integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_list_home_category_affinity(p_session_id text, p_limit integer, p_offset integer) IS 'Lista categorias personalizadas para a home, combinando usuário autenticado e sessão local.';


--
-- Name: kc_list_user_ratings(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_list_user_ratings(p_target_user_id uuid, p_page integer DEFAULT 1, p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 10)));
  v_offset integer := (v_page - 1) * v_limit;
  v_target_public boolean := false;
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  select coalesce(p.profile_public, false)
    into v_target_public
    from public.profiles as p
   where p.id = p_target_user_id;

  if not found then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'page', v_page,
      'limit', v_limit,
      'total', 0,
      'hasMore', false
    );
  end if;

  if not v_target_public and v_actor_id is distinct from p_target_user_id then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'page', v_page,
      'limit', v_limit,
      'total', 0,
      'hasMore', false
    );
  end if;

  select count(*)::int
    into v_total
    from public.user_ratings as ur
   where ur.target_user_id = p_target_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ur.id,
        'targetUserId', ur.target_user_id,
        'raterUserId', case when coalesce(rp.profile_public, false) then ur.rater_user_id else null end,
        'contextPostId', ur.context_post_id,
        'rating', ur.rating,
        'comment', ur.comment,
        'createdAt', ur.created_at,
        'updatedAt', ur.updated_at,
        'reviewer', jsonb_build_object(
          'id', case when coalesce(rp.profile_public, false) then rp.id else null end,
          'displayName', case
            when coalesce(rp.profile_public, false)
              then coalesce(nullif(btrim(rp.display_name), ''), nullif(btrim(rp.full_name), ''), 'Membro da comunidade')
            else 'Membro da comunidade'
          end,
          'avatarUrl', case when coalesce(rp.profile_public, false) then nullif(btrim(rp.avatar_url), '') else null end,
          'public', coalesce(rp.profile_public, false)
        )
      )
      order by ur.created_at desc, ur.id desc
    ),
    '[]'::jsonb
  )
    into v_items
    from (
      select *
        from public.user_ratings
       where target_user_id = p_target_user_id
       order by created_at desc, id desc
       offset v_offset
       limit v_limit
    ) as ur
    left join public.profiles as rp
      on rp.id = ur.rater_user_id;

  return jsonb_build_object(
    'items', v_items,
    'page', v_page,
    'limit', v_limit,
    'total', v_total,
    'hasMore', (v_offset + jsonb_array_length(v_items)) < v_total
  );
end;
$$;


--
-- Name: kc_mark_all_notifications_read(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_mark_all_notifications_read() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  END IF;

  UPDATE public.notifications
  SET read = true
  WHERE user_id = v_user_id AND read = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;


--
-- Name: kc_mark_invite_used(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_mark_invite_used() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_email text;
begin
  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = auth.uid();

  update public.kc_invited_emails
  set used_at = now()
  where lower(trim(email)) = v_email
    and used_at is null;
end;
$$;


--
-- Name: kc_mark_notifications_read(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_mark_notifications_read(p_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  END IF;

  UPDATE public.notifications
  SET read = true
  WHERE id = ANY(p_ids)
    AND user_id = v_user_id
    AND read = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;


--
-- Name: kc_matches_feed_request_params(text, text, text, text, text, jsonb, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_matches_feed_request_params(p_module text, p_category text, p_post_subcategory text, p_title text, p_description text, p_metadata jsonb, p_verified boolean, p_request_params jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_params JSONB := COALESCE(p_request_params, '{}'::JSONB);
  v_module TEXT := public.kc_feed_normalize_text(p_module);
  v_category TEXT := public.kc_feed_normalize_text(p_category);
  v_subcategory TEXT := public.kc_feed_normalize_text(p_post_subcategory);
  v_meta JSONB := COALESCE(p_metadata, '{}'::JSONB);
  v_haystack TEXT := public.kc_feed_normalize_text(concat_ws(
    ' ',
    p_title,
    p_description,
    p_category,
    p_post_subcategory,
    v_meta->>'origem',
    v_meta->>'destino',
    v_meta->>'horario',
    v_meta->>'condicao',
    v_meta->>'area',
    v_meta->>'areaKey',
    v_meta->>'areaLabel',
    v_meta->>'workMode',
    v_meta->>'workModeLabel',
    v_meta->>'modalidadeTrabalho',
    v_meta->>'employmentType',
    v_meta->>'employmentTypeLabel',
    v_meta->>'regimeContratacao',
    v_meta->>'regionKey',
    v_meta->>'regionLabel',
    v_meta->>'regionZoneKey',
    v_meta->>'regionZoneLabel',
    v_meta->>'lostFoundLocationKey',
    v_meta->>'lostFoundLocationLabel',
    array_to_string(public.kc_feed_jsonb_text_list(v_meta->'tags'), ' '),
    array_to_string(public.kc_feed_jsonb_text_list(v_meta->'tagKeys'), ' '),
    array_to_string(public.kc_feed_jsonb_text_list(v_meta->'caronasFeatureLabels'), ' '),
    array_to_string(public.kc_feed_jsonb_text_list(v_meta->'marcadoresCarona'), ' '),
    array_to_string(public.kc_feed_jsonb_text_list(v_meta->'housingFeatureLabels'), ' '),
    array_to_string(public.kc_feed_jsonb_text_list(v_meta->'marcadoresMoradia'), ' ')
  ));
  v_market_cats TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'marketCats');
  v_market_conds TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'marketConds');
  v_market_verified BOOLEAN := public.kc_feed_jsonb_bool(v_params->'marketVerified');
  v_market_category_key TEXT := public.kc_feed_market_category_key(COALESCE(NULLIF(v_category, ''), v_meta->>'category', v_meta->>'categoria'));
  v_market_condition_key TEXT := public.kc_feed_market_condition_key(v_meta->>'condicao');

  v_ride_types TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'rideType');
  v_ride_campi TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'rideCampus');
  v_ride_periods TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'ridePeriod');
  v_ride_features TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'rideFeatures');
  v_ride_verified BOOLEAN := public.kc_feed_jsonb_bool(v_params->'rideVerified');
  v_ride_origin TEXT := COALESCE((public.kc_feed_jsonb_text_list(v_params->'rideOrigin'))[1], '');
  v_ride_destination TEXT := COALESCE((public.kc_feed_jsonb_text_list(v_params->'rideDestination'))[1], '');
  v_ride_period_key TEXT := public.kc_feed_classify_period(v_meta->>'horario');
  v_ride_origin_text TEXT := public.kc_feed_normalize_text(v_meta->>'origem');
  v_ride_destination_text TEXT := public.kc_feed_normalize_text(v_meta->>'destino');
  v_ride_feature_keys TEXT[] := public.kc_feed_jsonb_slug_list(v_meta->'caronasFeatureKeys')
    || public.kc_feed_jsonb_slug_list(v_meta->'caronasFeatureLabels')
    || public.kc_feed_jsonb_slug_list(v_meta->'marcadoresCarona');

  v_housing_features TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'housingFeatures');
  v_housing_region TEXT := COALESCE((public.kc_feed_jsonb_slug_list(v_params->'housingRegion'))[1], '');
  v_housing_feature_keys TEXT[] := public.kc_feed_jsonb_slug_list(v_meta->'housingFeatureKeys')
    || public.kc_feed_jsonb_slug_list(v_meta->'housingFeatureLabels')
    || public.kc_feed_jsonb_slug_list(v_meta->'marcadoresMoradia')
    || public.kc_feed_jsonb_slug_list(v_meta->'features');
  v_housing_region_key TEXT := public.kc_feed_slug_key(COALESCE(NULLIF(v_meta->>'regionKey', ''), NULLIF(v_meta->>'regionLabel', ''), NULLIF(v_meta->>'regiao', ''), v_meta->>'region'));
  v_housing_zone_key TEXT := public.kc_feed_slug_key(COALESCE(NULLIF(v_meta->>'regionZoneKey', ''), v_meta->>'regionZoneLabel'));

  v_opp_types TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'oppType');
  v_opp_modes TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'oppMode');
  v_opp_area TEXT := COALESCE((public.kc_feed_jsonb_slug_list(v_params->'oppArea'))[1], '');
  v_opp_type_key TEXT := public.kc_feed_opportunity_type_key(COALESCE(NULLIF(v_category, ''), v_meta->>'categoryKey', v_meta->>'category'), v_haystack);
  v_opp_regime_key TEXT := public.kc_feed_opportunity_employment_key(concat_ws(' ', v_meta->>'employmentType', v_meta->>'employmentTypeLabel', v_meta->>'regimeContratacao'), v_haystack);
  v_opp_work_mode_key TEXT := public.kc_feed_opportunity_work_mode_key(concat_ws(' ', v_meta->>'workMode', v_meta->>'workModeLabel', v_meta->>'modalidadeTrabalho'), v_haystack);
  v_opp_area_key TEXT := public.kc_feed_opportunity_area_key(COALESCE(NULLIF(v_meta->>'areaKey', ''), NULLIF(v_meta->>'area', ''), v_meta->>'areaLabel'), v_haystack, v_subcategory);

  v_lf_statuses TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'lfStatus');
  v_lf_types TEXT[] := public.kc_feed_jsonb_slug_list(v_params->'lfType');
  v_lf_location TEXT := COALESCE((public.kc_feed_jsonb_slug_list(v_params->'lfLocation'))[1], '');
  v_lf_status_key TEXT := public.kc_feed_lost_found_status_key(COALESCE(NULLIF(v_category, ''), v_meta->>'categoriaKey', v_meta->>'categoria'));
  v_lf_type_key TEXT := public.kc_feed_lost_found_type_key(COALESCE(NULLIF(v_subcategory, ''), v_meta->>'subcategory', v_meta->>'subcategoria'));
  v_lf_location_key TEXT := public.kc_feed_slug_key(COALESCE(NULLIF(v_meta->>'lostFoundLocationKey', ''), v_meta->>'lostFoundLocationLabel'));
BEGIN
  IF v_params = '{}'::JSONB THEN
    RETURN TRUE;
  END IF;

  IF COALESCE(array_length(v_market_cats, 1), 0) > 0
     OR COALESCE(array_length(v_market_conds, 1), 0) > 0
     OR v_market_verified THEN
    IF v_module NOT IN ('compra-venda', 'livros') THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(array_length(v_market_cats, 1), 0) > 0 AND NOT (v_market_category_key = ANY(v_market_cats)) THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(array_length(v_market_conds, 1), 0) > 0 AND NOT (v_market_condition_key = ANY(v_market_conds)) THEN
      RETURN FALSE;
    END IF;
    IF v_market_verified AND NOT COALESCE(p_verified, FALSE) THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF COALESCE(array_length(v_ride_types, 1), 0) > 0
     OR COALESCE(array_length(v_ride_campi, 1), 0) > 0
     OR COALESCE(array_length(v_ride_periods, 1), 0) > 0
     OR COALESCE(array_length(v_ride_features, 1), 0) > 0
     OR v_ride_verified
     OR v_ride_origin <> ''
     OR v_ride_destination <> '' THEN
    IF v_module <> 'caronas' THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(array_length(v_ride_types, 1), 0) > 0 AND COALESCE(array_length(v_ride_types, 1), 0) < 2 THEN
      IF 'ofereco' = ANY(v_ride_types) AND position('ofereco' IN v_haystack) = 0 THEN
        RETURN FALSE;
      END IF;
      IF 'procuro' = ANY(v_ride_types) AND position('procuro' IN v_haystack) = 0 THEN
        RETURN FALSE;
      END IF;
    END IF;
    IF COALESCE(array_length(v_ride_campi, 1), 0) > 0 AND NOT EXISTS (
      SELECT 1
      FROM unnest(v_ride_campi) AS requested(value)
      WHERE public.kc_feed_caronas_campus_match(requested.value, v_haystack)
    ) THEN
      RETURN FALSE;
    END IF;
    IF v_ride_verified AND NOT COALESCE(p_verified, FALSE) THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(array_length(v_ride_periods, 1), 0) > 0 AND (v_ride_period_key = '' OR NOT (v_ride_period_key = ANY(v_ride_periods))) THEN
      RETURN FALSE;
    END IF;
    IF NOT public.kc_feed_array_contains_all(v_ride_feature_keys, v_ride_features) THEN
      RETURN FALSE;
    END IF;
    IF v_ride_origin <> '' AND position(v_ride_origin IN v_ride_origin_text) = 0 AND position(v_ride_origin IN v_haystack) = 0 THEN
      RETURN FALSE;
    END IF;
    IF v_ride_destination <> '' AND position(v_ride_destination IN v_ride_destination_text) = 0 AND position(v_ride_destination IN v_haystack) = 0 THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF COALESCE(array_length(v_housing_features, 1), 0) > 0 OR v_housing_region <> '' THEN
    IF v_module <> 'moradia' THEN
      RETURN FALSE;
    END IF;
    IF NOT public.kc_feed_array_contains_all(v_housing_feature_keys, v_housing_features) THEN
      RETURN FALSE;
    END IF;
    IF v_housing_region <> '' AND v_housing_region <> v_housing_region_key AND v_housing_region <> v_housing_zone_key THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF COALESCE(array_length(v_opp_types, 1), 0) > 0
     OR COALESCE(array_length(v_opp_modes, 1), 0) > 0
     OR v_opp_area <> '' THEN
    IF v_module <> 'oportunidades' THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(array_length(v_opp_types, 1), 0) > 0 AND NOT EXISTS (
      SELECT 1
      FROM unnest(v_opp_types) AS requested(value)
      WHERE (
        requested.value = 'emprego-clt'
        AND v_opp_type_key = 'emprego'
        AND v_opp_regime_key = 'clt'
      ) OR requested.value = v_opp_type_key
    ) THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(array_length(v_opp_modes, 1), 0) > 0 AND NOT EXISTS (
      SELECT 1
      FROM unnest(v_opp_modes) AS requested(value)
      WHERE (
        requested.value = 'hibrido'
        AND v_opp_work_mode_key = 'hibrido'
      ) OR (
        requested.value = 'remoto'
        AND v_opp_work_mode_key IN ('remoto', 'hibrido')
      ) OR (
        requested.value = 'presencial'
        AND v_opp_work_mode_key IN ('presencial', 'hibrido')
      )
    ) THEN
      RETURN FALSE;
    END IF;
    IF v_opp_area <> '' AND v_opp_area_key <> v_opp_area THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF COALESCE(array_length(v_lf_statuses, 1), 0) > 0
     OR COALESCE(array_length(v_lf_types, 1), 0) > 0
     OR v_lf_location <> '' THEN
    IF v_module <> 'achados-perdidos' THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(array_length(v_lf_statuses, 1), 0) > 0 AND NOT (v_lf_status_key = ANY(v_lf_statuses)) THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(array_length(v_lf_types, 1), 0) > 0 AND NOT (v_lf_type_key = ANY(v_lf_types)) THEN
      RETURN FALSE;
    END IF;
    IF v_lf_location <> '' AND v_lf_location_key <> v_lf_location THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;


--
-- Name: kc_merge_home_category_affinity(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_merge_home_category_affinity(p_session_id text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(trim(coalesce(p_session_id, '')), '');
  v_merged integer := 0;
begin
  if v_user_id is null or v_session_id is null then
    return 0;
  end if;

  insert into public.home_category_affinity (
    owner_kind,
    owner_key,
    user_id,
    session_id,
    module_key,
    category_key,
    score,
    interactions_count
  )
  select
    'user',
    v_user_id::text,
    v_user_id,
    null,
    hca.module_key,
    hca.category_key,
    hca.score,
    hca.interactions_count
  from public.home_category_affinity hca
  where hca.owner_kind = 'session'
    and hca.session_id = v_session_id
  on conflict (owner_kind, owner_key, module_key, category_key)
  do update set
    score = public.home_category_affinity.score + excluded.score,
    interactions_count = public.home_category_affinity.interactions_count + excluded.interactions_count,
    updated_at = now();

  get diagnostics v_merged = row_count;

  delete from public.home_category_affinity
  where owner_kind = 'session'
    and session_id = v_session_id;

  return coalesce(v_merged, 0);
end;
$$;


--
-- Name: FUNCTION kc_merge_home_category_affinity(p_session_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_merge_home_category_affinity(p_session_id text) IS 'Mescla afinidade anônima da sessão atual com a conta autenticada.';


--
-- Name: kc_notification_channel_enabled(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_notification_channel_enabled(p_user_id uuid, p_event text, p_channel text DEFAULT 'in_app'::text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), 'in_app'));
  v_event text := lower(coalesce(nullif(trim(p_event), ''), ''));
  v_preferences jsonb;
  v_event_preferences jsonb;
  v_value jsonb;
begin
  if v_event = '' then
    return false;
  end if;

  if v_channel not in ('in_app', 'email', 'whatsapp') then
    return false;
  end if;

  select preferences
    into v_preferences
  from public.notification_preferences
  where user_id = p_user_id;

  if v_preferences is null or jsonb_typeof(v_preferences) <> 'object' then
    return case when v_channel = 'in_app' then true else false end;
  end if;

  v_event_preferences := v_preferences -> v_event;
  if v_event_preferences is null or jsonb_typeof(v_event_preferences) <> 'object' then
    return case when v_channel = 'in_app' then true else false end;
  end if;

  v_value := v_event_preferences -> v_channel;
  if jsonb_typeof(v_value) = 'boolean' then
    return (v_value = 'true'::jsonb);
  end if;

  return case when v_channel = 'in_app' then true else false end;
end;
$$;


--
-- Name: kc_notify_on_comment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_notify_on_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_post record;
  v_actor_name text;
begin
  select id, author_id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  if v_post is null or v_post.author_id = new.author_id then
    return new;
  end if;

  select coalesce(display_name, full_name)
    into v_actor_name
  from public.profiles
  where id = new.author_id;

  perform public.kc_emit_notification_event(
    v_post.author_id,
    'comment_on_post',
    coalesce(v_actor_name, 'Alguem') || ' comentou no seu post',
    left(coalesce(new.body, ''), 120),
    jsonb_build_object(
      'post_id', v_post.id::text,
      'post_title', left(coalesce(v_post.title, ''), 80),
      'comment_id', new.id::text,
      'actor_id', new.author_id::text,
      'actor_name', coalesce(v_actor_name, ''),
      'module', v_post.module
    )
  );

  return new;
exception when others then
  return new;
end;
$$;


--
-- Name: kc_notify_on_comment_reply(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_notify_on_comment_reply() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_parent record;
  v_post record;
  v_actor_name text;
begin
  if new.parent_id is null then
    return new;
  end if;

  select id, author_id, post_id
    into v_parent
  from public.comments
  where id = new.parent_id;

  if v_parent is null or v_parent.author_id = new.author_id then
    return new;
  end if;

  select id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  select coalesce(display_name, full_name)
    into v_actor_name
  from public.profiles
  where id = new.author_id;

  perform public.kc_emit_notification_event(
    v_parent.author_id,
    'comment_reply',
    coalesce(v_actor_name, 'Alguem') || ' respondeu seu comentario',
    left(coalesce(new.body, ''), 120),
    jsonb_build_object(
      'post_id', new.post_id::text,
      'post_title', left(coalesce(v_post.title, ''), 80),
      'comment_id', new.id::text,
      'parent_comment_id', new.parent_id::text,
      'actor_id', new.author_id::text,
      'actor_name', coalesce(v_actor_name, ''),
      'module', coalesce(v_post.module, '')
    )
  );

  return new;
exception when others then
  return new;
end;
$$;


--
-- Name: kc_notify_on_post_expire(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_notify_on_post_expire(p_post_id uuid, p_author_id uuid, p_title text, p_module text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.kc_emit_notification_event(
    p_author_id,
    'post_expired',
    'Seu post expirou',
    left(coalesce(p_title, ''), 120),
    jsonb_build_object(
      'post_id', p_post_id::text,
      'post_title', left(coalesce(p_title, ''), 80),
      'module', p_module
    )
  );
exception when others then
  null;
end;
$$;


--
-- Name: kc_notify_on_vote(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_notify_on_vote() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_post record;
  v_voter record;
  v_title text;
begin
  if new.direction <> 'hot' then
    return new;
  end if;

  select id, author_id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  if v_post is null or v_post.author_id = new.voter_id then
    return new;
  end if;

  select display_name
    into v_voter
  from public.profiles
  where id = new.voter_id;

  v_title := coalesce(v_voter.display_name, 'Alguem') || ' votou no seu post';

  perform public.kc_emit_notification_event(
    v_post.author_id,
    'vote_on_post',
    v_title,
    left(v_post.title, 120),
    jsonb_build_object(
      'post_id', v_post.id::text,
      'post_title', left(v_post.title, 80),
      'actor_id', new.voter_id::text,
      'actor_name', coalesce(v_voter.display_name, ''),
      'module', v_post.module
    )
  );

  return new;
exception when others then
  return new;
end;
$$;


--
-- Name: kc_posts_search_document(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_posts_search_document(p_title text, p_description text, p_category text, p_metadata jsonb) RETURNS tsvector
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public'
    AS $$
  SELECT
    setweight(to_tsvector('portuguese', public.kc_unaccent(COALESCE(p_title, ''))), 'A')
    || setweight(to_tsvector('portuguese', public.kc_unaccent(public.kc_posts_search_tags_text(p_metadata))), 'B')
    || setweight(to_tsvector('portuguese', public.kc_unaccent(COALESCE(p_description, ''))), 'C')
    || setweight(to_tsvector('portuguese', public.kc_unaccent(COALESCE(p_category, ''))), 'D')
    || setweight(to_tsvector('portuguese', public.kc_unaccent(public.kc_posts_search_subcategory(p_metadata))), 'D')
$$;


--
-- Name: kc_posts_search_subcategory(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_posts_search_subcategory(p_metadata jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    COALESCE(p_metadata, '{}'::jsonb)->>'subcategoria',
    COALESCE(p_metadata, '{}'::jsonb)->>'subcategory',
    COALESCE(p_metadata, '{}'::jsonb)->>'subcategoriaKey',
    COALESCE(p_metadata, '{}'::jsonb)->>'subcategoryKey',
    ''
  )
$$;


--
-- Name: kc_posts_search_tags_text(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_posts_search_tags_text(p_metadata jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT trim(BOTH ' ' FROM concat_ws(
    ' ',
    COALESCE((
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(COALESCE(COALESCE(p_metadata, '{}'::jsonb)->'tags', '[]'::jsonb)) AS value
    ), ''),
    COALESCE((
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(COALESCE(COALESCE(p_metadata, '{}'::jsonb)->'tagKeys', '[]'::jsonb)) AS value
    ), '')
  ))
$$;


--
-- Name: kc_profile_initial_avatar_url(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_profile_initial_avatar_url(p_user_id uuid, p_email text, p_metadata jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(
    nullif(trim(coalesce(
      p_metadata ->> 'avatar_url',
      p_metadata ->> 'picture'
    )), ''),
    'https://api.dicebear.com/7.x/avataaars/svg?seed='
      || replace(
           coalesce(
             nullif(lower(trim(p_email)), ''),
             lower(p_user_id::text),
             'kinocampus'
           ),
           ' ',
           ''
         )
  );
$$;


--
-- Name: kc_profile_initial_display_name(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_profile_initial_display_name(p_email text, p_metadata jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(
    nullif(trim(coalesce(
      p_metadata ->> 'display_name',
      p_metadata ->> 'full_name',
      p_metadata ->> 'name',
      p_metadata ->> 'preferred_username'
    )), ''),
    nullif(trim(split_part(coalesce(p_email, ''), '@', 1)), ''),
    'Usuario'
  );
$$;


--
-- Name: kc_profiles_enforce_email_verified(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_profiles_enforce_email_verified() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
declare
  auth_email text;
  final_email text;
begin
  -- Sempre preferir e-mail canônico vindo do Auth.
  -- Isso impede que o client envie NEW.email fake (ex.: "x@ufg.br").
  select u.email into auth_email
  from auth.users u
  where u.id = new.id;

  final_email := coalesce(auth_email, new.email);

  -- Normaliza o campo email do profile (opcional, mas ajuda no debug e na consistência)
  if final_email is not null then
    new.email := final_email;
  end if;

  -- Força a regra de verificação
  new.verified := public.kc_is_institutional_email(final_email);

  return new;
end;
$$;


--
-- Name: kc_profiles_guard_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_profiles_guard_is_admin() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth'
    AS $$
begin
  -- Preserva is_admin em updates iniciados por clientes comuns (JWT authenticated/anon)
  -- e permite alteração apenas por contexto administrativo real.
  if tg_op = 'UPDATE' then
    if not (
      current_user in ('postgres', 'supabase_admin')
      or auth.role() = 'service_role'
    ) then
      new.is_admin := old.is_admin;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: kc_prune_old_analytics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_prune_old_analytics() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_search_deleted BIGINT := 0;
  v_audit_deleted BIGINT := 0;
  v_views_deleted BIGINT := 0;
  v_privacy_deleted BIGINT := 0;
  v_consent_deleted BIGINT := 0;
BEGIN
  DELETE FROM public.search_queries
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_search_deleted = ROW_COUNT;

  DELETE FROM public.audit_log
  WHERE created_at < now() - INTERVAL '1 year';
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

  DELETE FROM public.post_view_events
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_views_deleted = ROW_COUNT;

  DELETE FROM public.privacy_analytics_events
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_privacy_deleted = ROW_COUNT;

  DELETE FROM public.privacy_consent_events
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_consent_deleted = ROW_COUNT;

  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'analytics_pruned',
      'system',
      gen_random_uuid(),
      NULL,
      jsonb_build_object(
        'search_queries_deleted', v_search_deleted,
        'audit_log_deleted', v_audit_deleted,
        'post_view_events_deleted', v_views_deleted,
        'privacy_analytics_events_deleted', v_privacy_deleted,
        'privacy_consent_events_deleted', v_consent_deleted,
        'pruned_at', now()::TEXT
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'search_queries_deleted', v_search_deleted,
    'audit_log_deleted', v_audit_deleted,
    'post_view_events_deleted', v_views_deleted,
    'privacy_analytics_events_deleted', v_privacy_deleted,
    'privacy_consent_events_deleted', v_consent_deleted
  );
END;
$$;


--
-- Name: kc_prune_old_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_prune_old_notifications() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < now() - INTERVAL '90 days'
    AND read = true;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$$;


--
-- Name: kc_reactivate_post(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_reactivate_post(p_post_id uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $_$
  select kc_private.kc_reactivate_post($1)
$_$;


--
-- Name: kc_record_notification_delivery_attempt(uuid, text, text, text, jsonb, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_record_notification_delivery_attempt(p_outbox_id uuid, p_status text, p_provider text DEFAULT NULL::text, p_response_code text DEFAULT NULL::text, p_response_body jsonb DEFAULT '{}'::jsonb, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_next_attempt_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS public.notification_delivery_outbox
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_status text := lower(coalesce(nullif(trim(p_status), ''), ''));
  v_provider text := nullif(trim(coalesce(p_provider, '')), '');
  v_response_code text := nullif(trim(coalesce(p_response_code, '')), '');
  v_error_code text := nullif(trim(coalesce(p_error_code, '')), '');
  v_error_message text := nullif(trim(coalesce(p_error_message, '')), '');
  v_response_body jsonb := case
    when jsonb_typeof(coalesce(p_response_body, '{}'::jsonb)) = 'object' then coalesce(p_response_body, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_row public.notification_delivery_outbox;
begin
  if p_outbox_id is null then
    return null;
  end if;

  if v_status not in ('sent', 'failed', 'blocked', 'cancelled', 'skipped') then
    raise exception 'unsupported_delivery_status:%', coalesce(v_status, 'null');
  end if;

  update public.notification_delivery_outbox
     set status = v_status,
         attempts_count = attempts_count + 1,
         last_attempt_at = now(),
         next_attempt_at = case
           when v_status = 'failed' then coalesce(p_next_attempt_at, now())
           when p_next_attempt_at is not null then p_next_attempt_at
           else next_attempt_at
         end,
         locked_at = null,
         locked_by = null,
         sent_at = case
           when v_status = 'sent' then now()
           else sent_at
         end,
         error_code = case
           when v_status = 'sent' then null
           else v_error_code
         end,
         error_message = case
           when v_status = 'sent' then null
           else v_error_message
         end
   where id = p_outbox_id
   returning * into v_row;

  if v_row.id is null then
    return null;
  end if;

  insert into public.notification_delivery_attempts (
    outbox_id,
    channel,
    status,
    provider,
    response_code,
    response_body,
    error_message
  )
  values (
    v_row.id,
    v_row.channel,
    v_status,
    v_provider,
    v_response_code,
    v_response_body,
    v_error_message
  );

  return v_row;
end;
$$;


--
-- Name: FUNCTION kc_record_notification_delivery_attempt(p_outbox_id uuid, p_status text, p_provider text, p_response_code text, p_response_body jsonb, p_error_code text, p_error_message text, p_next_attempt_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_record_notification_delivery_attempt(p_outbox_id uuid, p_status text, p_provider text, p_response_code text, p_response_body jsonb, p_error_code text, p_error_message text, p_next_attempt_at timestamp with time zone) IS 'Registra tentativa de entrega externa e atualiza a row do outbox de forma consistente.';


--
-- Name: kc_record_post_audit_event(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_record_post_audit_event(p_post_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_allowed boolean := false;
  v_is_admin boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para registrar auditoria.');
  end if;

  if v_action not in ('post_edited', 'post_renewed', 'post_bumped', 'post_admin_action') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ACTION', 'message', 'Acao de auditoria invalida.');
  end if;

  select id, author_id, status, module, title
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_uid);
  v_allowed := v_is_admin or v_post.author_id is not distinct from v_uid;
  if not v_allowed then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Sem permissao para registrar este evento.');
  end if;

  perform kc_private.kc_insert_audit_log(
    v_action,
    'posts',
    p_post_id,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'source', case when v_is_admin and v_post.author_id is distinct from v_uid then 'admin_product_page' else 'owner_product_page' end,
      'post_status', v_post.status,
      'post_module', v_post.module,
      'post_author_id', v_post.author_id
    ),
    v_uid
  );

  return jsonb_build_object('ok', true, 'code', 'OK');
end;
$$;


--
-- Name: kc_record_privacy_consent(text, text, boolean, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_record_privacy_consent(p_session_id text, p_consent_version text, p_preferences boolean, p_analytics boolean, p_source text DEFAULT 'user'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id TEXT := trim(coalesce(p_session_id, ''));
BEGIN
  IF length(v_session_id) < 12 OR length(v_session_id) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  END IF;

  INSERT INTO public.privacy_consent_events (
    session_hash,
    user_id,
    consent_version,
    preferences_enabled,
    analytics_enabled,
    source
  )
  VALUES (
    encode(digest(v_session_id, 'sha256'), 'hex'),
    auth.uid(),
    left(trim(coalesce(p_consent_version, 'unknown')), 32),
    coalesce(p_preferences, false),
    coalesce(p_analytics, false),
    left(trim(coalesce(p_source, 'user')), 48)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: kc_refresh_highlight_scores(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_refresh_highlight_scores() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_updated int := 0;
begin
  with scored as (
    select p.id, public.kc_compute_highlight_score(p.id) as new_score
      from public.posts p
     where p.status = 'published'
       and p.created_at > now() - interval '60 days'
  ),
  updated_published as (
    update public.posts p
       set highlight_score = scored.new_score,
           updated_at = now()
      from scored
     where p.id = scored.id
       and p.highlight_score is distinct from scored.new_score
     returning 1
  ),
  updated_closed as (
    update public.posts p
       set highlight_score = 0,
           updated_at = now()
     where p.status = 'closed'
       and coalesce(p.highlight_score, 0) <> 0
     returning 1
  )
  select count(*)::int
    into v_updated
    from (
      select 1 from updated_published
      union all
      select 1 from updated_closed
    ) changed;

  return jsonb_build_object(
    'ok', true,
    'updated_count', v_updated,
    'ran_at', now()
  );
end;
$$;


--
-- Name: kc_related_posts(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_related_posts(p_post_id uuid, p_limit integer DEFAULT 8) RETURNS TABLE(candidate_id uuid, relevance_score integer, reason text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with current_post as (
    select
      p.id,
      p.author_id,
      p.module,
      p.category,
      coalesce(nullif(p.metadata ->> 'subcategoryKey', ''), nullif(p.metadata ->> 'subcategoriaKey', ''), nullif(p.metadata ->> 'subcategory', ''), nullif(p.metadata ->> 'subcategoria', '')) as subcategory,
      array(
        select distinct lower(trim(value))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.metadata -> 'tagKeys') = 'array' then p.metadata -> 'tagKeys'
            when jsonb_typeof(p.metadata -> 'tags') = 'array' then p.metadata -> 'tags'
            else '[]'::jsonb
          end
        ) as value
        where trim(value) <> ''
      ) as tags,
      array(
        select distinct lower(token)
        from regexp_split_to_table(
          regexp_replace(
            lower(coalesce(p.title, '') || ' ' || coalesce(p.description, '')),
            '[^[:alnum:][:space:]]+',
            ' ',
            'g'
          ),
          '\s+'
        ) as token
        where length(token) >= 3
      ) as terms
    from public.posts p
    where p.id = p_post_id
      and p.status = 'published'
    limit 1
  ),
  candidates as (
    select
      p.id,
      p.author_id,
      p.module,
      p.category,
      coalesce(nullif(p.metadata ->> 'subcategoryKey', ''), nullif(p.metadata ->> 'subcategoriaKey', ''), nullif(p.metadata ->> 'subcategory', ''), nullif(p.metadata ->> 'subcategoria', '')) as subcategory,
      coalesce(p.votos, 0) as votos,
      p.created_at,
      array(
        select distinct lower(trim(value))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.metadata -> 'tagKeys') = 'array' then p.metadata -> 'tagKeys'
            when jsonb_typeof(p.metadata -> 'tags') = 'array' then p.metadata -> 'tags'
            else '[]'::jsonb
          end
        ) as value
        where trim(value) <> ''
      ) as tags,
      array(
        select distinct lower(token)
        from regexp_split_to_table(
          regexp_replace(
            lower(coalesce(p.title, '') || ' ' || coalesce(p.description, '')),
            '[^[:alnum:][:space:]]+',
            ' ',
            'g'
          ),
          '\s+'
        ) as token
        where length(token) >= 3
      ) as terms
    from public.posts p
    where p.status = 'published'
      and p.id <> p_post_id
  ),
  scored as (
    select
      c.id as candidate_id,
      (
        case
          when c.author_id = cp.author_id and c.module = cp.module then 160
          when c.author_id = cp.author_id then 120
          else 0
        end
        + case when c.module = cp.module then 60 else 0 end
        + case when c.category = cp.category then 40 else 0 end
        + case when coalesce(c.subcategory, '') <> '' and c.subcategory = cp.subcategory then 30 else 0 end
        + least(
            (
              select count(*)
              from unnest(coalesce(c.tags, array[]::text[])) as candidate_tag
              join unnest(coalesce(cp.tags, array[]::text[])) as current_tag
                on candidate_tag = current_tag
            ) * 6,
            48
          )
        + least(
            (
              select count(*)
              from unnest(coalesce(c.terms, array[]::text[])) as candidate_term
              join unnest(coalesce(cp.terms, array[]::text[])) as current_term
                on candidate_term = current_term
            ) * 4,
            24
          )
        + least(greatest(c.votos, 0) / 2, 12)
        + case
            when c.created_at >= now() - interval '2 days' then 8
            when c.created_at >= now() - interval '7 days' then 5
            when c.created_at >= now() - interval '21 days' then 2
            else 0
          end
      )::integer as relevance_score,
      case
        when c.author_id = cp.author_id and c.module = cp.module then 'Mesmo autor e módulo'
        when c.author_id = cp.author_id then 'Mesmo autor'
        when c.module = cp.module then 'Mesmo módulo'
        when c.category = cp.category then 'Mesma categoria'
        when coalesce(c.subcategory, '') <> '' and c.subcategory = cp.subcategory then 'Mesma subcategoria'
        else 'Relacionado'
      end as reason,
      c.created_at
    from candidates c
    cross join current_post cp
  )
  select
    candidate_id,
    relevance_score,
    reason
  from scored
  where relevance_score > 0
  order by relevance_score desc, created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 12));
$$;


--
-- Name: kc_renew_post(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_renew_post(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_check jsonb;
  v_expires_at timestamptz;
  v_days int;
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  select id, author_id, status, module
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_user_id);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_user_id;

  if v_post.author_id is distinct from v_user_id and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o autor ou administradores podem renovar esta publicacao.');
  end if;

  if v_post.status not in ('expired', 'hidden') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Apenas publicacoes expiradas ou desabilitadas podem ser renovadas (status atual: ' || v_post.status || ').');
  end if;

  if not v_is_admin_override then
    v_check := public.kc_check_post_limit(v_post.author_id, v_post.module);
    if not (v_check->>'ok')::boolean then
      return jsonb_build_object(
        'ok', false,
        'code', 'LIMIT_REACHED',
        'message', 'Limite de publicacoes ativas atingido.',
        'limit', (v_check->>'limit')::int,
        'count', (v_check->>'count')::int,
        'module', v_post.module
      );
    end if;
  end if;

  v_days := case when v_post.module = 'caronas' then 7 else 30 end;
  v_expires_at := now() + (v_days || ' days')::interval;

  update public.posts
     set status = 'published',
         expires_at = v_expires_at,
         updated_at = now()
   where id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_renewed',
    'posts',
    p_post_id,
    jsonb_build_object(
      'old_status', v_post.status,
      'new_status', 'published',
      'expires_at', v_expires_at,
      'source', case when v_is_admin_override then 'admin_renew' else 'user_renew' end,
      'post_author_id', v_post.author_id
    ),
    v_user_id
  );

  return jsonb_build_object('ok', true, 'code', 'OK', 'new_status', 'published', 'expires_at', v_expires_at, 'message', 'Publicacao renovada com sucesso.');
end;
$$;


--
-- Name: kc_report_post(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_report_post(p_post_id uuid, p_reason text, p_details text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid;
  v_reason text;
  v_details text;
  v_report_id uuid;
begin
  v_uid := auth.uid();
  v_reason := lower(trim(coalesce(p_reason, '')));
  v_details := nullif(left(trim(coalesce(p_details, '')), 1000), '');

  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para denunciar.');
  end if;

  if v_reason not in ('spam', 'scam', 'inappropriate', 'hate', 'illegal', 'duplicate', 'other', 'post_closed') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'Selecione um motivo valido.');
  end if;

  if not exists (
    select 1
    from public.posts
    where id = p_post_id
      and status in ('published', 'closed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado para denuncia.');
  end if;

  begin
    insert into public.reports (post_id, reporter_id, reason, details, status)
    values (p_post_id, v_uid, v_reason, v_details, 'open')
    returning id into v_report_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'ALREADY_REPORTED', 'message', 'Voce ja denunciou este post.');
  end;

  return jsonb_build_object('ok', true, 'id', v_report_id, 'post_id', p_post_id);
end;
$$;


--
-- Name: kc_resolve_notification_delivery_destination(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_resolve_notification_delivery_destination(p_user_id uuid, p_channel text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), ''));
  v_email text;
  v_whatsapp_destination text;
  v_whatsapp_consent boolean;
begin
  if p_user_id is null or v_channel = '' then
    return jsonb_build_object(
      'available', false,
      'reason', 'invalid_input',
      'destination_source', 'none'
    );
  end if;

  if v_channel = 'email' then
    select nullif(trim(coalesce(u.email, '')), '')
      into v_email
    from auth.users as u
    where u.id = p_user_id;

    if v_email is null then
      return jsonb_build_object(
        'available', false,
        'reason', 'missing_email',
        'destination_source', 'auth.users.email'
      );
    end if;

    return jsonb_build_object(
      'available', true,
      'destination', lower(v_email),
      'destination_source', 'auth.users.email'
    );
  end if;

  if v_channel = 'whatsapp' then
    select t.destination, t.consent_granted
      into v_whatsapp_destination, v_whatsapp_consent
    from public.notification_channel_targets as t
    where t.user_id = p_user_id
      and t.channel = 'whatsapp';

    if nullif(trim(coalesce(v_whatsapp_destination, '')), '') is null then
      return jsonb_build_object(
        'available', false,
        'reason', 'private_destination_not_configured',
        'destination_source', 'private.notification_channel_targets.whatsapp'
      );
    end if;

    if coalesce(v_whatsapp_consent, false) is not true then
      return jsonb_build_object(
        'available', false,
        'reason', 'consent_not_granted',
        'destination_source', 'private.notification_channel_targets.whatsapp'
      );
    end if;

    if v_whatsapp_destination !~ '^\+[1-9][0-9]{7,14}$' then
      return jsonb_build_object(
        'available', false,
        'reason', 'invalid_destination',
        'destination_source', 'private.notification_channel_targets.whatsapp'
      );
    end if;

    return jsonb_build_object(
      'available', true,
      'destination', v_whatsapp_destination,
      'destination_source', 'private.notification_channel_targets.whatsapp'
    );
  end if;

  return jsonb_build_object(
    'available', false,
    'reason', 'unsupported_channel',
    'destination_source', 'none'
  );
end;
$_$;


--
-- Name: kc_search_posts_fts(text, text[], text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_search_posts_fts(p_q text DEFAULT NULL::text, p_terms text[] DEFAULT NULL::text[], p_module text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_limit integer DEFAULT 50) RETURNS SETOF jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 50), 50));
  v_terms TEXT[] := ARRAY(
    SELECT DISTINCT lower(btrim(public.kc_unaccent(term)))
    FROM unnest(COALESCE(p_terms, ARRAY[]::TEXT[])) AS term
    WHERE term IS NOT NULL AND btrim(term) <> ''
  );
  v_fuzzy_terms TEXT[] := ARRAY(
    SELECT DISTINCT lower(btrim(public.kc_unaccent(term)))
    FROM regexp_split_to_table(COALESCE(p_q, ''), '\s+') AS term
    WHERE term IS NOT NULL AND btrim(term) <> ''
  );
  v_query_text TEXT := NULL;
  v_query tsquery := NULL;
BEGIN
  IF COALESCE(btrim(p_q), '') = '' THEN
    RETURN;
  END IF;

  IF COALESCE(array_length(v_terms, 1), 0) = 0 THEN
    v_terms := ARRAY[lower(btrim(public.kc_unaccent(p_q)))];
  END IF;

  IF COALESCE(array_length(v_fuzzy_terms, 1), 0) = 0 THEN
    v_fuzzy_terms := ARRAY[lower(btrim(public.kc_unaccent(p_q)))];
  END IF;

  SELECT string_agg('(' || prepared.query_text || ')', ' | ')
  INTO v_query_text
  FROM (
    SELECT NULLIF(plainto_tsquery('portuguese', term)::TEXT, '') AS query_text
    FROM unnest(v_terms) AS term
  ) AS prepared
  WHERE prepared.query_text IS NOT NULL;

  IF COALESCE(v_query_text, '') = '' THEN
    RETURN;
  END IF;

  v_query := v_query_text::tsquery;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      p.id,
      p.legacy_id,
      p.author_id,
      p.title,
      p.description,
      p.price,
      p.location,
      p.module,
      p.category,
      p.status,
      p.visibility,
      COALESCE(p.metadata, '{}'::jsonb) AS metadata,
      p.created_at,
      COALESCE(p.votos, 0) AS votos,
      COALESCE(p.highlight_score, 0)::DOUBLE PRECISION AS highlight_score,
      p.bumped_at,
      p.last_comment_at,
      public.kc_posts_search_document(p.title, p.description, p.category, COALESCE(p.metadata, '{}'::jsonb)) AS search_document,
      lower(public.kc_unaccent(concat_ws(
        ' ',
        p.title,
        p.module,
        p.category,
        public.kc_posts_search_subcategory(COALESCE(p.metadata, '{}'::jsonb)),
        public.kc_posts_search_tags_text(COALESCE(p.metadata, '{}'::jsonb))
      ))) AS fuzzy_text,
      CASE
        WHEN pr.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'verified', COALESCE(pr.verified, false)
        )
      END AS profile_payload,
      COALESCE(pm.items, '[]'::jsonb) AS media_payload,
      COALESCE(cc.comment_count, 0) AS comment_count
    FROM public.posts AS p
    LEFT JOIN public.profiles AS pr
      ON pr.id = p.author_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'url', m.url,
            'is_cover', m.is_cover
          )
          ORDER BY m.is_cover DESC, m.id ASC
        ),
        '[]'::jsonb
      ) AS items
      FROM public.post_media AS m
      WHERE m.post_id = p.id
    ) AS pm ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::INT AS comment_count
      FROM public.comments AS c
      WHERE c.post_id = p.id
    ) AS cc ON TRUE
    WHERE p.legacy_id IS NULL
      AND (p_module IS NULL OR lower(COALESCE(p.module, '')) = lower(p_module))
      AND (
        p_category IS NULL
        OR lower(public.kc_unaccent(COALESCE(p.category, ''))) = lower(public.kc_unaccent(p_category))
      )
      AND (
        p_subcategory IS NULL
        OR lower(public.kc_unaccent(public.kc_posts_search_subcategory(COALESCE(p.metadata, '{}'::jsonb))))
          = lower(public.kc_unaccent(p_subcategory))
      )
  ),
  matched AS (
    SELECT
      ranked.*,
      ts_rank_cd(ranked.search_document, v_query) AS search_rank,
      (
        SELECT COALESCE(max(extensions.word_similarity(t, ranked.fuzzy_text)), 0)
        FROM unnest(v_fuzzy_terms) AS t
        WHERE length(t) >= 4
      ) AS fuzzy_sim,
      (ranked.search_document @@ v_query) AS is_fts
    FROM ranked
    WHERE ranked.search_document @@ v_query
       OR EXISTS (
         SELECT 1 FROM unnest(v_fuzzy_terms) AS t
         WHERE length(t) >= 4
           AND extensions.word_similarity(t, ranked.fuzzy_text) >= 0.68
       )
  )
  SELECT jsonb_build_object(
    'id', matched.id,
    'legacy_id', matched.legacy_id,
    'author_id', matched.author_id,
    'title', matched.title,
    'description', matched.description,
    'price', matched.price,
    'location', matched.location,
    'module', matched.module,
    'category', matched.category,
    'status', matched.status,
    'visibility', matched.visibility,
    'metadata', matched.metadata,
    'created_at', matched.created_at,
    'votos', matched.votos,
    'highlight_score', matched.highlight_score,
    'bumped_at', matched.bumped_at,
    'last_comment_at', matched.last_comment_at,
    'profiles', matched.profile_payload,
    'post_media', matched.media_payload,
    'comments', jsonb_build_array(jsonb_build_object('count', matched.comment_count))
  )
  FROM matched
  ORDER BY matched.is_fts DESC, matched.search_rank DESC, matched.fuzzy_sim DESC, matched.created_at DESC, matched.id DESC
  LIMIT v_limit;
END;
$$;


--
-- Name: kc_set_post_expires_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_set_post_expires_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.expires_at is null then
    new.expires_at := now() + case
      when new.module = 'caronas' then interval '7 days'
      else interval '30 days'
    end;
  end if;
  return new;
end;
$$;


--
-- Name: kc_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: kc_sync_profile_rating_aggregates(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_sync_profile_rating_aggregates(p_target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.profiles as p
     set rating_avg = agg.avg_rating,
         rating_count = agg.rating_count
    from (
      select
        p_target_user_id as target_user_id,
        case
          when count(*) = 0 then null
          else round(avg(ur.rating)::numeric, 2)
        end as avg_rating,
        count(*)::int as rating_count
      from public.user_ratings as ur
      where ur.target_user_id = p_target_user_id
    ) as agg
   where p.id = agg.target_user_id;
end;
$$;


--
-- Name: kc_toggle_post_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_toggle_post_status(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_new_status text;
  v_check jsonb;
  v_expires_at timestamptz;
  v_days int;
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria para alterar o status da publicacao.');
  end if;

  select id, author_id, status, module, expires_at
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_user_id);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_user_id;

  if v_post.author_id is distinct from v_user_id and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o autor ou administradores podem alterar o status desta publicacao.');
  end if;

  if v_post.status = 'expired' then
    return jsonb_build_object('ok', false, 'code', 'USE_RENEW', 'message', 'Esta publicacao esta expirada. Use Renovar publicacao para reativa-la.');
  end if;

  if v_post.status not in ('published', 'hidden') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Esta publicacao esta em um estado que nao permite ativacao/desativacao (status: ' || v_post.status || ').');
  end if;

  if v_post.status = 'published' then
    v_new_status := 'hidden';
  else
    if not v_is_admin_override then
      v_check := public.kc_check_post_limit(v_post.author_id, v_post.module);
      if not (v_check->>'ok')::boolean then
        return jsonb_build_object(
          'ok', false,
          'code', 'LIMIT_REACHED',
          'message', 'Limite de publicacoes ativas atingido.',
          'limit', (v_check->>'limit')::int,
          'count', (v_check->>'count')::int,
          'module', v_post.module
        );
      end if;
    end if;
    v_new_status := 'published';
    v_days := case when v_post.module = 'caronas' then 7 else 30 end;
    v_expires_at := now() + (v_days || ' days')::interval;
  end if;

  update public.posts
     set status = v_new_status,
         expires_at = case when v_new_status = 'published' then v_expires_at else v_post.expires_at end,
         updated_at = now()
   where id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_status_changed',
    'posts',
    p_post_id,
    jsonb_build_object(
      'old_status', v_post.status,
      'new_status', v_new_status,
      'source', case when v_is_admin_override then 'admin_toggle' else 'user_toggle' end,
      'post_author_id', v_post.author_id
    ),
    v_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'new_status', v_new_status,
    'expires_at', case when v_new_status = 'published' then v_expires_at else null end,
    'message', case when v_new_status = 'hidden' then 'Publicacao desabilitada.' else 'Publicacao reativada.' end
  );
end;
$$;


--
-- Name: kc_touch_notification_channel_target_consent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_touch_notification_channel_target_consent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.consent_granted is true then
    if tg_op = 'INSERT'
       or old.consent_granted is distinct from true
       or old.destination is distinct from new.destination then
      new.consent_at := now();
    end if;
  else
    new.consent_at := null;
  end if;

  return new;
end;
$$;


--
-- Name: kc_track_coupon_click(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_track_coupon_click(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_clicks INT;
BEGIN
  UPDATE public.posts
  SET coupon_clicks = COALESCE(coupon_clicks, 0) + 1,
      highlight_score = public.kc_compute_highlight_score(id),
      updated_at = now()
  WHERE id = p_post_id
    AND status = 'published'
  RETURNING coupon_clicks INTO v_new_clicks;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('ok', true, 'coupon_clicks', v_new_clicks);
END;
$$;


--
-- Name: kc_track_home_category_affinity(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_track_home_category_affinity(p_session_id text DEFAULT NULL::text, p_events jsonb DEFAULT '[]'::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_owner_kind text;
  v_owner_key text;
  v_processed integer := 0;
  v_event jsonb;
  v_module_key text;
  v_category_key text;
  v_delta numeric(12,2);
  v_session_id text := nullif(trim(coalesce(p_session_id, '')), '');
begin
  if jsonb_typeof(p_events) is distinct from 'array' then
    return 0;
  end if;

  if v_user_id is not null then
    v_owner_kind := 'user';
    v_owner_key := v_user_id::text;
  elsif v_session_id is not null then
    v_owner_kind := 'session';
    v_owner_key := v_session_id;
  else
    return 0;
  end if;

  for v_event in
    select value from jsonb_array_elements(p_events)
  loop
    v_module_key := public.kc_home_normalize_key(v_event ->> 'module_key');
    v_category_key := public.kc_home_normalize_key(v_event ->> 'category_key');
    v_delta := greatest(0.5, least(50, coalesce((v_event ->> 'delta')::numeric, 0)));

    if v_module_key = '' or v_category_key = '' then
      continue;
    end if;

    insert into public.home_category_affinity (
      owner_kind,
      owner_key,
      user_id,
      session_id,
      module_key,
      category_key,
      score,
      interactions_count
    ) values (
      v_owner_kind,
      v_owner_key,
      v_user_id,
      case when v_owner_kind = 'session' then v_session_id else null end,
      v_module_key,
      v_category_key,
      v_delta,
      1
    )
    on conflict (owner_kind, owner_key, module_key, category_key)
    do update set
      score = public.home_category_affinity.score + excluded.score,
      interactions_count = public.home_category_affinity.interactions_count + 1,
      updated_at = now();

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;


--
-- Name: FUNCTION kc_track_home_category_affinity(p_session_id text, p_events jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_track_home_category_affinity(p_session_id text, p_events jsonb) IS 'Registra eventos ponderados de afinidade para categorias da home.';


--
-- Name: kc_track_privacy_event(text, text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_track_privacy_event(p_event_name text, p_session_id text, p_page_path text DEFAULT NULL::text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_module_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_event_name TEXT := lower(trim(coalesce(p_event_name, '')));
  v_session_id TEXT := trim(coalesce(p_session_id, ''));
  v_page_path TEXT := left(coalesce(nullif(trim(p_page_path), ''), '/'), 180);
  v_metadata JSONB := coalesce(p_metadata, '{}'::jsonb);
BEGIN
  IF v_event_name NOT IN (
    'search',
    'category_click',
    'post_open',
    'banner_impression',
    'banner_click',
    'ad_impression',
    'ad_click',
    'help_open',
    'help_submit',
    'report_submit'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_EVENT');
  END IF;

  IF length(v_session_id) < 12 OR length(v_session_id) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  END IF;

  IF jsonb_typeof(v_metadata) IS DISTINCT FROM 'object' OR length(v_metadata::text) > 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_METADATA');
  END IF;

  v_metadata := v_metadata
    - ARRAY['cookie', 'cookies', 'token', 'access_token', 'refresh_token', 'password', 'authorization', 'secret', 'email', 'ip', 'user_agent', 'ua', 'jwt'];

  INSERT INTO public.privacy_analytics_events (
    event_name,
    session_hash,
    user_id,
    page_path,
    entity_type,
    entity_id,
    module_key,
    metadata
  )
  VALUES (
    v_event_name,
    encode(extensions.digest(v_session_id, 'sha256'), 'hex'),
    auth.uid(),
    CASE WHEN v_page_path LIKE '/%' THEN v_page_path ELSE '/' || v_page_path END,
    nullif(left(trim(coalesce(p_entity_type, '')), 64), ''),
    nullif(left(trim(coalesce(p_entity_id, '')), 128), ''),
    nullif(left(trim(coalesce(p_module_key, '')), 64), ''),
    jsonb_strip_nulls(v_metadata)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: kc_track_share(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_track_share(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_shares INT;
BEGIN
  UPDATE public.posts
  SET share_count = COALESCE(share_count, 0) + 1,
      highlight_score = public.kc_compute_highlight_score(id),
      updated_at = now()
  WHERE id = p_post_id
    AND status = 'published'
  RETURNING share_count INTO v_new_shares;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('ok', true, 'share_count', v_new_shares);
END;
$$;


--
-- Name: kc_track_view(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_track_view(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id     UUID;
  v_post_exists BOOLEAN;
  v_is_author   BOOLEAN;
  v_recent      BOOLEAN;
  v_new_count   INTEGER;
BEGIN
  -- Requer autenticacao
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  -- Post deve existir e estar publicado
  SELECT EXISTS(
    SELECT 1 FROM public.posts WHERE id = p_post_id AND status = 'published'
  ) INTO v_post_exists;

  IF NOT v_post_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  -- Ignorar self-view (autor vendo proprio post)
  SELECT EXISTS(
    SELECT 1 FROM public.posts WHERE id = p_post_id AND author_id = v_user_id
  ) INTO v_is_author;

  IF v_is_author THEN
    RETURN jsonb_build_object('ok', true, 'code', 'SELF_VIEW', 'counted', false);
  END IF;

  -- Anti-spam: checar se ja visualizou na ultima hora
  SELECT EXISTS(
    SELECT 1 FROM public.post_view_events
    WHERE post_id = p_post_id
      AND user_id = v_user_id
      AND created_at > now() - INTERVAL '1 hour'
  ) INTO v_recent;

  IF v_recent THEN
    RETURN jsonb_build_object('ok', true, 'code', 'COOLDOWN', 'counted', false);
  END IF;

  -- Inserir evento de view
  INSERT INTO public.post_view_events (post_id, user_id)
  VALUES (p_post_id, v_user_id);

  -- Incrementar contador denormalizado
  UPDATE public.posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_post_id
  RETURNING view_count INTO v_new_count;

  RETURN jsonb_build_object('ok', true, 'counted', true, 'view_count', v_new_count);
END;
$$;


--
-- Name: kc_trigger_notification_dispatch(text, integer, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_trigger_notification_dispatch(p_channel text DEFAULT NULL::text, p_limit integer DEFAULT NULL::integer, p_dry_run boolean DEFAULT false, p_source text DEFAULT 'pg_cron'::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_runtime_url text;
  v_runtime_secret text;
  v_runtime_limit integer;
  v_function_url text := nullif(current_setting('app.settings.kc_notification_dispatch_function_url', true), '');
  v_dispatch_secret text := nullif(current_setting('app.settings.kc_notification_dispatch_secret', true), '');
  v_setting_limit_raw text := nullif(current_setting('app.settings.kc_notification_dispatch_batch_limit', true), '');
  v_setting_limit integer := 25;
  v_limit integer := 25;
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), ''));
  v_source text := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'pg_cron');
  v_body jsonb;
  v_request_id bigint;
begin
  select
    nullif(trim(coalesce(r.function_url, '')), ''),
    nullif(trim(coalesce(r.dispatch_secret, '')), ''),
    r.batch_limit
    into v_runtime_url, v_runtime_secret, v_runtime_limit
  from public.notification_dispatch_runtime as r
  where r.slot = 'primary';

  v_function_url := coalesce(v_runtime_url, v_function_url);
  v_dispatch_secret := coalesce(v_runtime_secret, v_dispatch_secret);

  if v_setting_limit_raw ~ '^[0-9]{1,3}$' then
    v_setting_limit := greatest(1, least(v_setting_limit_raw::integer, 100));
  end if;

  if v_runtime_limit is not null then
    v_setting_limit := greatest(1, least(v_runtime_limit, 100));
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, v_setting_limit, 25), 100));

  if v_function_url is null or v_dispatch_secret is null then
    return null;
  end if;

  if v_channel not in ('', 'email', 'whatsapp') then
    return null;
  end if;

  v_body := jsonb_build_object(
    'dryRun', coalesce(p_dry_run, false),
    'limit', v_limit,
    'source', v_source
  );

  if v_channel <> '' then
    v_body := v_body || jsonb_build_object('channel', v_channel);
  end if;

  select net.http_post(
    url := v_function_url,
    body := v_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-kc-dispatch-secret', v_dispatch_secret
    ),
    timeout_milliseconds := 5000
  )
    into v_request_id;

  return v_request_id;
end;
$_$;


--
-- Name: FUNCTION kc_trigger_notification_dispatch(p_channel text, p_limit integer, p_dry_run boolean, p_source text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kc_trigger_notification_dispatch(p_channel text, p_limit integer, p_dry_run boolean, p_source text) IS 'Triggers the kc-dispatch-notification-outbox Edge Function through pg_net using database-level runtime settings.';


--
-- Name: kc_trigger_update_highlight_score(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_trigger_update_highlight_score() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_post_id UUID;
BEGIN
  v_post_id := COALESCE(NEW.post_id, OLD.post_id);
  IF v_post_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.posts
  SET highlight_score = public.kc_compute_highlight_score(v_post_id)
  WHERE id = v_post_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: kc_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_unaccent(input_text text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select extensions.unaccent(coalesce(input_text, ''))
$$;


--
-- Name: kc_unread_notification_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_unread_notification_count() RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN 0; END IF;

  RETURN (
    SELECT count(*)
    FROM public.notifications
    WHERE user_id = v_user_id AND read = false
  );
END;
$$;


--
-- Name: kc_update_post_last_comment_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_update_post_last_comment_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: kc_upsert_custom_location(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_upsert_custom_location(p_key text, p_label text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.caronas_locations (key, label, icon, zone_key, zone_label, aliases, usage_count)
  values (p_key, p_label, 'fas fa-map-pin', 'custom', 'Locais Personalizados', array[lower(p_label)], 1)
  on conflict (key) do update
    set usage_count = caronas_locations.usage_count + 1,
        updated_at  = now();
end;
$$;


--
-- Name: kc_upsert_user_rating(uuid, uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_upsert_user_rating(p_target_user_id uuid, p_context_post_id uuid DEFAULT NULL::uuid, p_rating integer DEFAULT NULL::integer, p_comment text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_state jsonb;
  v_can_rate boolean := false;
  v_reason text := 'UNKNOWN';
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_row public.user_ratings%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Faça login para avaliar este usuário.'
      using errcode = 'P0001';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'A nota deve estar entre 1 e 5 estrelas.'
      using errcode = 'P0001';
  end if;

  if char_length(coalesce(v_comment, '')) > 280 then
    raise exception 'O comentário da avaliação aceita no máximo 280 caracteres.'
      using errcode = 'P0001';
  end if;

  v_state := public.kc_get_user_rating_state(p_target_user_id, p_context_post_id);
  v_can_rate := coalesce((v_state ->> 'canRate')::boolean, false);
  v_reason := coalesce(v_state ->> 'reason', 'UNKNOWN');

  if not v_can_rate then
    if v_reason = 'SELF' then
      raise exception 'Você não pode avaliar o próprio perfil.'
        using errcode = 'P0001';
    elsif v_reason = 'NO_INTERACTION' then
      raise exception 'Interaja com um post deste usuário antes de avaliá-lo.'
        using errcode = 'P0001';
    elsif v_reason = 'INVALID_CONTEXT' then
      raise exception 'A avaliação precisa estar vinculada a uma publicação válida deste usuário.'
        using errcode = 'P0001';
    elsif v_reason = 'TARGET_NOT_FOUND' then
      raise exception 'Usuário alvo não encontrado para avaliação.'
        using errcode = 'P0001';
    else
      raise exception 'Não foi possível registrar esta avaliação agora.'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.user_ratings (
    target_user_id,
    rater_user_id,
    context_post_id,
    rating,
    comment
  )
  values (
    p_target_user_id,
    v_actor_id,
    p_context_post_id,
    p_rating,
    v_comment
  )
  on conflict (rater_user_id, target_user_id)
  do update
    set context_post_id = coalesce(excluded.context_post_id, public.user_ratings.context_post_id),
        rating = excluded.rating,
        comment = excluded.comment,
        updated_at = now()
  returning *
    into v_row;

  return jsonb_build_object(
    'ok', true,
    'rating', jsonb_build_object(
      'id', v_row.id,
      'targetUserId', v_row.target_user_id,
      'raterUserId', v_row.rater_user_id,
      'contextPostId', v_row.context_post_id,
      'rating', v_row.rating,
      'comment', v_row.comment,
      'createdAt', v_row.created_at,
      'updatedAt', v_row.updated_at
    ),
    'summary', public.kc_get_user_rating_summary(p_target_user_id)
  );
end;
$$;


--
-- Name: kc_user_ratings_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_user_ratings_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: kc_user_ratings_sync_target(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kc_user_ratings_sync_target() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.kc_sync_profile_rating_aggregates(old.target_user_id);
    return old;
  end if;

  perform public.kc_sync_profile_rating_aggregates(new.target_user_id);

  if tg_op = 'UPDATE'
     and old.target_user_id is distinct from new.target_user_id then
    perform public.kc_sync_profile_rating_aggregates(old.target_user_id);
  end if;

  return new;
end;
$$;


--
-- Name: notify_admin_if_reports_threshold(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_admin_if_reports_threshold(p_post_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_open_count integer;
  v_function_url text;
  v_function_auth_token text;
  v_hmac_secret text;
  v_timestamp text;
  v_body jsonb;
  v_signature text;
begin
  if p_post_id is null then
    return;
  end if;

  select count(*)
    into v_open_count
    from public.reports
   where post_id = p_post_id
     and status = 'open';

  if v_open_count < 3 then
    return;
  end if;

  -- Runtime settings (devem ser configuradas fora do git):
  -- app.settings.kc_notify_function_url
  -- app.settings.kc_notify_function_auth_token
  -- app.settings.kc_notify_hmac_secret
  v_function_url := nullif(current_setting('app.settings.kc_notify_function_url', true), '');
  v_function_auth_token := nullif(current_setting('app.settings.kc_notify_function_auth_token', true), '');
  v_hmac_secret := nullif(current_setting('app.settings.kc_notify_hmac_secret', true), '');

  -- Fail-closed: sem configuração válida, não dispara requisição externa.
  if v_function_url is null or v_function_auth_token is null or v_hmac_secret is null then
    return;
  end if;

  v_body := jsonb_build_object('post_id', p_post_id);
  v_timestamp := floor(extract(epoch from now()))::bigint::text;
  v_signature := encode(hmac(v_timestamp || '.' || p_post_id::text, v_hmac_secret, 'sha256'), 'hex');

  perform net.http_post(
    url := v_function_url,
    body := v_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_function_auth_token,
      'x-kc-source', 'reports-trigger',
      'x-kc-post-id', p_post_id::text,
      'x-kc-timestamp', v_timestamp,
      'x-kc-signature', v_signature
    )
  );
end;
$$;


--
-- Name: sync_post_votes_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_post_votes_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_post_id uuid;
begin
  v_post_id := coalesce(new.post_id, old.post_id);
  if v_post_id is null then
    return null;
  end if;

  update public.posts
  set votos = (
    select coalesce(
      sum(case when direction = 'hot' then 1 when direction = 'cold' then -1 else 0 end),
      0
    )
    from public.post_votes
    where post_id = v_post_id
  )
  where id = v_post_id;

  return null;
end;
$$;


--
-- Name: trg_audit_posts_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_audit_posts_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_payload jsonb;
begin
  -- Se ja foi soft-delete antes, nao duplicar post_deleted no delete fisico.
  if old.status = 'deleted' then
    return old;
  end if;

  v_payload := jsonb_build_object(
    'deleted', true,
    'old_status', old.status
  );

  if old.legacy_id is not null then
    v_payload := v_payload || jsonb_build_object('legacy_id', old.legacy_id);
  end if;

  perform public.audit_log_insert(
    'post_deleted',
    'posts',
    old.id,
    v_payload,
    auth.uid()
  );

  return old;
end;
$$;


--
-- Name: trg_audit_posts_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_audit_posts_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_payload jsonb;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  v_payload := jsonb_build_object(
    'before', jsonb_build_object('status', old.status),
    'after', jsonb_build_object('status', new.status)
  );

  if new.legacy_id is not null then
    v_payload := v_payload || jsonb_build_object('legacy_id', new.legacy_id);
  end if;

  -- Soft-delete gera somente post_deleted (evita duplicidade com post_status_changed).
  if old.status is distinct from 'deleted' and new.status = 'deleted' then
    perform public.audit_log_insert(
      'post_deleted',
      'posts',
      new.id,
      v_payload,
      auth.uid()
    );
  else
    perform public.audit_log_insert(
      'post_status_changed',
      'posts',
      new.id,
      v_payload,
      auth.uid()
    );
  end if;

  return new;
end;
$$;


--
-- Name: trg_audit_reports_status_closed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_audit_reports_status_closed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_payload jsonb;
begin
  if old.status is distinct from new.status
     and old.status is distinct from 'closed'
     and new.status = 'closed' then

    v_payload := jsonb_build_object(
      'before', jsonb_build_object('status', old.status),
      'after', jsonb_build_object('status', new.status),
      'reason', new.reason,
      'post_id', new.post_id
    );

    perform public.audit_log_insert(
      'report_closed',
      'reports',
      new.id,
      v_payload,
      auth.uid()
    );
  end if;

  return new;
end;
$$;


--
-- Name: trg_notify_admin_reports_threshold(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_notify_admin_reports_threshold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'open' then
    perform public.notify_admin_if_reports_threshold(new.post_id);
  end if;
  return new;
end;
$$;


--
-- Name: account_erasure_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_erasure_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    help_request_id uuid,
    user_id uuid,
    email_hash text NOT NULL,
    target_email_domain text,
    status text DEFAULT 'diagnosed'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmation_requested_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    reversible_applied_at timestamp with time zone,
    erased_at timestamp with time zone,
    processed_by uuid,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    receipt jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_erasure_counts_object_check CHECK ((jsonb_typeof(counts) = 'object'::text)),
    CONSTRAINT account_erasure_metadata_object_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT account_erasure_receipt_object_check CHECK ((jsonb_typeof(receipt) = 'object'::text)),
    CONSTRAINT account_erasure_requests_email_hash_check CHECK ((email_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT account_erasure_requests_status_check CHECK ((status = ANY (ARRAY['diagnosed'::text, 'pending_confirmation'::text, 'reversible_applied'::text, 'erased'::text, 'cancelled'::text, 'failed'::text]))),
    CONSTRAINT account_erasure_requests_target_email_domain_check CHECK (((target_email_domain IS NULL) OR (char_length(target_email_domain) <= 120)))
);


--
-- Name: TABLE account_erasure_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.account_erasure_requests IS 'Admin-only LGPD account-erasure workflow. Stores hashed e-mail, request status, counts and receipt, but not raw requester e-mail.';


--
-- Name: ad_campaign_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_campaign_audit (
    id bigint NOT NULL,
    campaign_id uuid,
    action text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ad_campaign_audit_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'archive'::text, 'delete'::text])))
);


--
-- Name: ad_campaign_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ad_campaign_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ad_campaign_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ad_campaign_audit_id_seq OWNED BY public.ad_campaign_audit.id;


--
-- Name: ad_network_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_network_settings (
    id text DEFAULT 'default'::text NOT NULL,
    provider text DEFAULT 'direct'::text NOT NULL,
    status text DEFAULT 'disabled'::text NOT NULL,
    adsense_client_id text DEFAULT 'ca-pub-2776499020194231'::text NOT NULL,
    auto_ads_enabled boolean DEFAULT false NOT NULL,
    placement_modes jsonb DEFAULT jsonb_build_object('feed_inline', 'direct_only', 'feed_aside_top', 'direct_only', 'feed_aside_sticky', 'direct_only') NOT NULL,
    adsense_slots jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT ad_network_settings_id_check CHECK ((id = 'default'::text)),
    CONSTRAINT ad_network_settings_provider_check CHECK ((provider = ANY (ARRAY['direct'::text, 'adsense'::text, 'hybrid'::text]))),
    CONSTRAINT ad_network_settings_status_check CHECK ((status = ANY (ARRAY['disabled'::text, 'testing'::text, 'active'::text])))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    message_type text NOT NULL,
    content text,
    media_path text,
    e2e_envelope jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT chat_messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text]))),
    CONSTRAINT chat_msg_text_or_image CHECK ((((message_type = 'text'::text) AND (content IS NOT NULL) AND (media_path IS NULL)) OR ((message_type = 'image'::text) AND (media_path IS NOT NULL)) OR (deleted_at IS NOT NULL)))
);


--
-- Name: TABLE chat_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_messages IS 'v9.3.5.10: mensagens de texto/imagem. content em TEXT (at-rest via Supabase disk encryption); e2e_envelope JSONB reservado p/ E2E client-side futuro.';


--
-- Name: COLUMN chat_messages.e2e_envelope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.e2e_envelope IS 'Reservado para upgrade futuro a E2E client-side (WebCrypto). Null no v1.';


--
-- Name: chat_read_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_read_state (
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_msg_id uuid,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE chat_read_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_read_state IS 'v9.3.5.10: marcador de leitura por (conversa, user) — evita updates massivos em chat_messages.';


--
-- Name: comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    post_id uuid NOT NULL,
    author_id uuid NOT NULL,
    author_name text DEFAULT 'Anônimo'::text NOT NULL,
    body text NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    parent_id uuid,
    CONSTRAINT comments_body_maxlen CHECK ((char_length(body) <= 2000)),
    CONSTRAINT comments_body_nonempty CHECK ((char_length(TRIM(BOTH FROM body)) > 0)),
    CONSTRAINT comments_likes_nonneg CHECK ((likes >= 0))
);


--
-- Name: COLUMN comments.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.comments.parent_id IS 'Threading de comentarios: resposta para comentario raiz (maximo de 1 nivel).';


--
-- Name: help_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    topic text NOT NULL,
    subtopic text,
    subject text NOT NULL,
    message text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    page_path text,
    contact_email text NOT NULL,
    allow_contact boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    admin_status text DEFAULT 'pending'::text NOT NULL,
    admin_decided_at timestamp with time zone,
    admin_decided_by uuid,
    admin_note text,
    CONSTRAINT help_requests_admin_status_check CHECK ((admin_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'na'::text]))),
    CONSTRAINT help_requests_contact_email_length_check CHECK ((char_length(contact_email) <= 255)),
    CONSTRAINT help_requests_message_length_check CHECK (((char_length(message) >= 10) AND (char_length(message) <= 4000))),
    CONSTRAINT help_requests_metadata_object_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT help_requests_page_path_length_check CHECK (((page_path IS NULL) OR (char_length(page_path) <= 255))),
    CONSTRAINT help_requests_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT help_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'triaged'::text, 'in_progress'::text, 'resolved'::text, 'archived'::text]))),
    CONSTRAINT help_requests_subject_length_check CHECK (((char_length(subject) >= 3) AND (char_length(subject) <= 140))),
    CONSTRAINT help_requests_topic_check CHECK ((topic = ANY (ARRAY['platform_use'::text, 'posts'::text, 'profile'::text, 'contact'::text, 'payment_benefit'::text, 'security'::text, 'other'::text, 'publishing_navigation'::text, 'modules_filters'::text, 'profile_contact'::text, 'bugs_crashes'::text, 'slow_performance'::text, 'search_filters'::text, 'create_edit_post'::text, 'login_signup'::text, 'email_confirmation'::text, 'password'::text, 'onboarding_settings'::text, 'non_institutional_email'::text, 'partnership_access'::text, 'post'::text, 'profile_user'::text, 'inappropriate_contact'::text, 'general_experience'::text, 'specific_module'::text, 'community'::text]))),
    CONSTRAINT help_requests_type_check CHECK ((type = ANY (ARRAY['question'::text, 'complaint'::text, 'praise'::text, 'platform_issue'::text, 'account_access'::text, 'external_access'::text, 'report'::text, 'suggestion_praise'::text])))
);


--
-- Name: COLUMN help_requests.admin_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.help_requests.admin_status IS 'v9.3.5.4: pending|approved|rejected|na (na = não se aplica)';


--
-- Name: hero_banner_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hero_banner_audit (
    id bigint NOT NULL,
    banner_id uuid,
    action text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    snapshot jsonb,
    CONSTRAINT hero_banner_audit_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text])))
);


--
-- Name: hero_banner_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hero_banner_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hero_banner_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hero_banner_audit_id_seq OWNED BY public.hero_banner_audit.id;


--
-- Name: home_category_affinity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.home_category_affinity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_kind text NOT NULL,
    owner_key text NOT NULL,
    user_id uuid,
    session_id text,
    module_key text NOT NULL,
    category_key text NOT NULL,
    score numeric(12,2) DEFAULT 0 NOT NULL,
    interactions_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT home_category_affinity_owner_check CHECK ((((owner_kind = 'user'::text) AND (user_id IS NOT NULL) AND (owner_key = (user_id)::text)) OR ((owner_kind = 'session'::text) AND (session_id IS NOT NULL) AND (owner_key = session_id)))),
    CONSTRAINT home_category_affinity_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['user'::text, 'session'::text])))
);


--
-- Name: TABLE home_category_affinity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.home_category_affinity IS 'Afinidade personalizada de categorias da home por usuário autenticado ou sessão anônima.';


--
-- Name: kc_admin_chart_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kc_admin_chart_prefs (
    user_id uuid NOT NULL,
    prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE kc_admin_chart_prefs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kc_admin_chart_prefs IS 'Preferências por administrador do gráfico do Dashboard (séries visíveis, cores e ordem). RLS owner-only + gate de admin.';


--
-- Name: kc_invited_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kc_invited_emails (
    email text NOT NULL,
    invited_by uuid,
    note text,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL
);


--
-- Name: TABLE kc_invited_emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kc_invited_emails IS 'Convites para usuários com e-mail não-institucional enviados por admins.';


--
-- Name: COLUMN kc_invited_emails.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kc_invited_emails.email IS 'E-mail do convidado (chave primária, normalizado em minúsculas).';


--
-- Name: COLUMN kc_invited_emails.invited_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kc_invited_emails.invited_by IS 'ID do admin que enviou o convite.';


--
-- Name: COLUMN kc_invited_emails.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kc_invited_emails.note IS 'Motivo ou observação sobre o convite (uso interno).';


--
-- Name: COLUMN kc_invited_emails.used_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kc_invited_emails.used_at IS 'Preenchido quando o usuário conclui o onboarding.';


--
-- Name: COLUMN kc_invited_emails.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kc_invited_emails.expires_at IS 'Data de expiração do convite (padrão: 7 dias).';


--
-- Name: kc_trusted_publishers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kc_trusted_publishers (
    user_id uuid NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: TABLE kc_trusted_publishers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kc_trusted_publishers IS 'Allowlist de contas de publicacao automatica confiaveis (ex.: Cadu). Isenta apenas os soft gates do anti-spam (link_spam, new_user_scrutiny). O flood control (ritmo) continua valendo.';


--
-- Name: notification_channel_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_channel_targets (
    user_id uuid NOT NULL,
    channel text NOT NULL,
    destination text NOT NULL,
    consent_granted boolean DEFAULT false NOT NULL,
    consent_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_channel_targets_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text]))),
    CONSTRAINT notification_channel_targets_destination_e164_check CHECK ((destination ~ '^\+[1-9][0-9]{7,14}$'::text)),
    CONSTRAINT notification_channel_targets_metadata_object_check CHECK ((jsonb_typeof(metadata) = 'object'::text))
);


--
-- Name: TABLE notification_channel_targets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_channel_targets IS 'Destinos privados de notificacao por canal. Nao deve reaproveitar contatos publicos do perfil.';


--
-- Name: COLUMN notification_channel_targets.destination; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_channel_targets.destination IS 'Destino privado normalizado em E.164. Para WhatsApp, deve ser um numero valido com prefixo +.';


--
-- Name: COLUMN notification_channel_targets.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_channel_targets.metadata IS 'Metadados operacionais do destino privado. Ex.: country_code usado no formulario.';


--
-- Name: notification_delivery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    outbox_id uuid NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    provider text,
    response_code text,
    response_body jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_delivery_attempts_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text]))),
    CONSTRAINT notification_delivery_attempts_response_body_object_check CHECK ((jsonb_typeof(response_body) = 'object'::text)),
    CONSTRAINT notification_delivery_attempts_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'sent'::text, 'failed'::text, 'blocked'::text, 'cancelled'::text, 'skipped'::text])))
);


--
-- Name: TABLE notification_delivery_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_delivery_attempts IS 'Historico imutavel das tentativas de entrega externa para cada item do outbox.';


--
-- Name: notification_dispatch_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_dispatch_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    execution_id text,
    source text DEFAULT 'manual'::text NOT NULL,
    mode text NOT NULL,
    channel_filter text,
    status text DEFAULT 'completed'::text NOT NULL,
    batch_limit integer DEFAULT 25 NOT NULL,
    provider_ready jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider_issues jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_dispatch_runs_channel_filter_check CHECK (((channel_filter IS NULL) OR (channel_filter = ANY (ARRAY['email'::text, 'whatsapp'::text])))),
    CONSTRAINT notification_dispatch_runs_mode_check CHECK ((mode = ANY (ARRAY['dry_run'::text, 'dispatch'::text]))),
    CONSTRAINT notification_dispatch_runs_provider_issues_object_check CHECK ((jsonb_typeof(provider_issues) = 'object'::text)),
    CONSTRAINT notification_dispatch_runs_provider_ready_object_check CHECK ((jsonb_typeof(provider_ready) = 'object'::text)),
    CONSTRAINT notification_dispatch_runs_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'error'::text]))),
    CONSTRAINT notification_dispatch_runs_summary_object_check CHECK ((jsonb_typeof(summary) = 'object'::text))
);


--
-- Name: TABLE notification_dispatch_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_dispatch_runs IS 'Private operational log for dry-run/dispatch executions of the external notification dispatcher.';


--
-- Name: notification_dispatch_runtime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_dispatch_runtime (
    slot text DEFAULT 'primary'::text NOT NULL,
    function_url text,
    dispatch_secret text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    batch_limit integer DEFAULT 25 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_dispatch_runtime_batch_limit_check CHECK (((batch_limit >= 1) AND (batch_limit <= 100))),
    CONSTRAINT notification_dispatch_runtime_slot_check CHECK ((slot = 'primary'::text))
);


--
-- Name: TABLE notification_dispatch_runtime; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_dispatch_runtime IS 'Private runtime settings for the notification dispatcher scheduler. Versioned in schema, populated out of git.';


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    preferences jsonb DEFAULT public.kc_default_notification_preferences() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_preferences_preferences_object_check CHECK ((jsonb_typeof(preferences) = 'object'::text))
);


--
-- Name: TABLE notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_preferences IS 'Preferencias privadas de notificacao por evento/canal do usuario.';


--
-- Name: COLUMN notification_preferences.preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preferences.preferences IS 'JSONB com eventos conhecidos e canais in_app/email/whatsapp.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['comment_on_post'::text, 'vote_on_post'::text, 'post_expired'::text, 'post_reported'::text, 'comment_reply'::text, 'system'::text, 'direct_message'::text])))
);


--
-- Name: CONSTRAINT notifications_type_check ON notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS 'v9.3.5.11: inclui direct_message além dos tipos originais.';


--
-- Name: post_flood_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_flood_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    user_id uuid,
    module text,
    max_posts integer DEFAULT 3 NOT NULL,
    window_minutes integer DEFAULT 60 NOT NULL,
    CONSTRAINT post_flood_limits_max_posts_check CHECK (((max_posts >= 0) AND (max_posts <= 1000))),
    CONSTRAINT post_flood_limits_window_minutes_check CHECK (((window_minutes >= 1) AND (window_minutes <= 10080)))
);


--
-- Name: TABLE post_flood_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.post_flood_limits IS 'Limite de ritmo de criacao de posts por usuario/modulo. user_id=NULL significa global; module=NULL significa todos os modulos.';


--
-- Name: COLUMN post_flood_limits.max_posts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.post_flood_limits.max_posts IS 'Maximo de posts criados dentro da janela movel configurada.';


--
-- Name: COLUMN post_flood_limits.window_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.post_flood_limits.window_minutes IS 'Tamanho da janela movel, em minutos, usada pelo anti-spam de criacao.';


--
-- Name: post_flood_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_flood_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reset_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid,
    user_id uuid NOT NULL,
    module text,
    reason text
);


--
-- Name: TABLE post_flood_resets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.post_flood_resets IS 'Admin reset markers for post cadence limits. A reset ignores older posts inside the current moving window for the selected user/module.';


--
-- Name: COLUMN post_flood_resets.module; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.post_flood_resets.module IS 'NULL applies to all modules for the user. Specific modules override only that module.';


--
-- Name: post_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    user_id uuid,
    module text,
    max_active integer DEFAULT 5 NOT NULL,
    CONSTRAINT post_limits_max_active_check CHECK (((max_active >= 0) AND (max_active <= 1000)))
);


--
-- Name: TABLE post_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.post_limits IS 'Limite de publicações ativas por usuário/módulo. user_id=NULL significa global. module=NULL significa todos os módulos.';


--
-- Name: COLUMN post_limits.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.post_limits.user_id IS 'NULL = aplica a todos os usuários (global).';


--
-- Name: COLUMN post_limits.module; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.post_limits.module IS 'NULL = aplica a todos os módulos.';


--
-- Name: COLUMN post_limits.max_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.post_limits.max_active IS 'Máximo de publicações com status=published permitidas.';


--
-- Name: post_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    url text NOT NULL,
    is_cover boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: post_view_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_view_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid,
    session_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    post_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    direction text NOT NULL,
    CONSTRAINT post_votes_direction_check CHECK ((direction = ANY (ARRAY['hot'::text, 'cold'::text])))
);

ALTER TABLE ONLY public.post_votes REPLICA IDENTITY FULL;


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    author_id uuid DEFAULT auth.uid(),
    title text NOT NULL,
    description text,
    price numeric,
    location text,
    module text,
    category text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    votos integer DEFAULT 0 NOT NULL,
    visibility text DEFAULT 'community'::text NOT NULL,
    expires_at timestamp with time zone,
    bumped_at timestamp with time zone,
    highlight_score double precision DEFAULT 0 NOT NULL,
    coupon_clicks integer DEFAULT 0 NOT NULL,
    share_count integer DEFAULT 0 NOT NULL,
    last_comment_at timestamp with time zone,
    view_count integer DEFAULT 0 NOT NULL,
    moderation_reason text,
    image_url text,
    CONSTRAINT posts_status_check CHECK ((status = ANY (ARRAY['published'::text, 'pending'::text, 'hidden'::text, 'deleted'::text, 'expired'::text, 'closed'::text]))),
    CONSTRAINT posts_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'community'::text])))
);

ALTER TABLE ONLY public.posts REPLICA IDENTITY FULL;


--
-- Name: COLUMN posts.legacy_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.legacy_id IS '[DEPRECATED v9.0.4] ID legado da importação v6/v7. Não atribuído a novos posts desde v9.0. Verificar uso via kc_admin_legacy_id_stats() antes de remover.';


--
-- Name: COLUMN posts.moderation_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.moderation_reason IS 'Razão da auto-moderação: flood_control, link_spam, new_user_scrutiny. NULL = sem moderação automática.';


--
-- Name: COLUMN posts.image_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.image_url IS 'Canonical cover image URL for feed/detail fallback. Mirrors post_media cover when available.';


--
-- Name: privacy_analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.privacy_analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_name text NOT NULL,
    session_hash text NOT NULL,
    user_id uuid,
    page_path text DEFAULT '/'::text NOT NULL,
    entity_type text,
    entity_id text,
    module_key text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT privacy_analytics_events_event_name_check CHECK ((event_name = ANY (ARRAY['search'::text, 'category_click'::text, 'post_open'::text, 'banner_impression'::text, 'banner_click'::text, 'ad_impression'::text, 'ad_click'::text, 'help_open'::text, 'help_submit'::text, 'report_submit'::text])))
);


--
-- Name: TABLE privacy_analytics_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.privacy_analytics_events IS 'Eventos opcionais e agregáveis do KinoCampus; session_id é armazenado apenas como hash.';


--
-- Name: privacy_consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.privacy_consent_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_hash text NOT NULL,
    user_id uuid,
    consent_version text NOT NULL,
    preferences_enabled boolean DEFAULT false NOT NULL,
    analytics_enabled boolean DEFAULT false NOT NULL,
    source text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE privacy_consent_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.privacy_consent_events IS 'Histórico agregado de consentimento, sem valores de cookies ou tokens.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    display_name text,
    bio text,
    avatar_path text,
    onboarding_completed_at timestamp with time zone,
    affiliation text,
    gender_identity text,
    gender_identity_custom text,
    race_color text,
    contact_primary_method text,
    contact_cta_enabled boolean DEFAULT true NOT NULL,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    social_visibility jsonb DEFAULT '{}'::jsonb NOT NULL,
    profile_public boolean DEFAULT false NOT NULL,
    rating_avg numeric(3,2),
    rating_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT profiles_affiliation_check CHECK (((affiliation IS NULL) OR (affiliation = ANY (ARRAY['undergrad_student'::text, 'graduate_student'::text, 'professor'::text, 'staff'::text, 'alumni'::text, 'exchange_student'::text, 'visiting_researcher'::text, 'other_ufg'::text, 'prefer_not_to_say'::text])))),
    CONSTRAINT profiles_bio_length_check CHECK (((bio IS NULL) OR (char_length(bio) <= 200))),
    CONSTRAINT profiles_contact_primary_method_check CHECK (((contact_primary_method IS NULL) OR (contact_primary_method = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'linkedin'::text, 'facebook'::text, 'email_public'::text])))),
    CONSTRAINT profiles_gender_identity_check CHECK (((gender_identity IS NULL) OR (gender_identity = ANY (ARRAY['woman_cis'::text, 'man_cis'::text, 'woman_trans'::text, 'man_trans'::text, 'non_binary'::text, 'travesti'::text, 'agender'::text, 'self_described'::text, 'prefer_not_to_say'::text])))),
    CONSTRAINT profiles_gender_identity_custom_length_check CHECK (((gender_identity_custom IS NULL) OR (char_length(gender_identity_custom) <= 80))),
    CONSTRAINT profiles_race_color_check CHECK (((race_color IS NULL) OR (race_color = ANY (ARRAY['branca'::text, 'preta'::text, 'parda'::text, 'amarela'::text, 'indigena'::text, 'prefer_not_to_say'::text])))),
    CONSTRAINT profiles_social_links_object_check CHECK ((jsonb_typeof(social_links) = 'object'::text)),
    CONSTRAINT profiles_social_visibility_object_check CHECK ((jsonb_typeof(social_visibility) = 'object'::text))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    post_id uuid,
    reporter_id uuid NOT NULL,
    reason text NOT NULL,
    details text,
    status text DEFAULT 'open'::text NOT NULL,
    entity_type text DEFAULT 'post'::text NOT NULL,
    entity_id text,
    CONSTRAINT reports_entity_not_null CHECK (((post_id IS NOT NULL) OR (entity_id IS NOT NULL))),
    CONSTRAINT reports_reason_check CHECK ((reason = ANY (ARRAY['spam'::text, 'scam'::text, 'inappropriate'::text, 'hate'::text, 'illegal'::text, 'duplicate'::text, 'other'::text, 'harassment'::text, 'offensive'::text, 'misleading'::text, 'privacy'::text, 'post_closed'::text]))),
    CONSTRAINT reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: saved_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    post_id uuid NOT NULL,
    kind text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saved_posts_kind_check CHECK ((kind = ANY (ARRAY['favorite'::text, 'later'::text, 'highlight'::text])))
);


--
-- Name: search_queries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_queries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    term text NOT NULL,
    user_id uuid,
    session_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT search_queries_term_check CHECK (((char_length(term) >= 1) AND (char_length(term) <= 200)))
);


--
-- Name: TABLE search_queries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.search_queries IS 'Rastreamento de termos de busca para analytics no dashboard admin.';


--
-- Name: COLUMN search_queries.term; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.search_queries.term IS 'Termo buscado pelo usuário (máx 200 chars).';


--
-- Name: COLUMN search_queries.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.search_queries.user_id IS 'Usuário autenticado que realizou a busca (nulo se anônimo).';


--
-- Name: COLUMN search_queries.session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.search_queries.session_id IS 'ID de sessão anônima para agrupar buscas sem login.';


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT no_self_block CHECK ((blocker_id <> blocked_id))
);


--
-- Name: TABLE user_blocks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_blocks IS 'v9.3.5.12: bloqueio direcional, mas chat checa bidirecional (qualquer lado bloqueia → nenhum envia)';


--
-- Name: user_legal_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_legal_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    terms_version text NOT NULL,
    privacy_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'kc-auth-card'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_legal_acceptances_metadata_object_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT user_legal_acceptances_source_check CHECK (((char_length(source) >= 2) AND (char_length(source) <= 80))),
    CONSTRAINT user_legal_acceptances_versions_check CHECK ((((char_length(terms_version) >= 4) AND (char_length(terms_version) <= 40)) AND ((char_length(privacy_version) >= 4) AND (char_length(privacy_version) <= 40))))
);


--
-- Name: user_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid NOT NULL,
    rater_user_id uuid NOT NULL,
    context_post_id uuid,
    rating smallint NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_ratings_comment_len CHECK ((char_length(COALESCE(comment, ''::text)) <= 280)),
    CONSTRAINT user_ratings_no_self CHECK ((target_user_id <> rater_user_id)),
    CONSTRAINT user_ratings_rating_range CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: ad_campaign_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_campaign_audit ALTER COLUMN id SET DEFAULT nextval('public.ad_campaign_audit_id_seq'::regclass);


--
-- Name: hero_banner_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero_banner_audit ALTER COLUMN id SET DEFAULT nextval('public.hero_banner_audit_id_seq'::regclass);


--
-- Name: account_erasure_requests account_erasure_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_erasure_requests
    ADD CONSTRAINT account_erasure_requests_pkey PRIMARY KEY (id);


--
-- Name: ad_campaign_audit ad_campaign_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_campaign_audit
    ADD CONSTRAINT ad_campaign_audit_pkey PRIMARY KEY (id);


--
-- Name: ad_campaigns ad_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_campaigns
    ADD CONSTRAINT ad_campaigns_pkey PRIMARY KEY (id);


--
-- Name: ad_network_settings ad_network_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_network_settings
    ADD CONSTRAINT ad_network_settings_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conv_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conv_unique UNIQUE (participant_low, participant_high);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_read_state chat_read_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_read_state
    ADD CONSTRAINT chat_read_state_pkey PRIMARY KEY (conversation_id, user_id);


--
-- Name: comment_likes comment_likes_comment_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_user_unique UNIQUE (comment_id, user_id);


--
-- Name: comment_likes comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: help_requests help_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_requests
    ADD CONSTRAINT help_requests_pkey PRIMARY KEY (id);


--
-- Name: hero_banner_audit hero_banner_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero_banner_audit
    ADD CONSTRAINT hero_banner_audit_pkey PRIMARY KEY (id);


--
-- Name: hero_banners hero_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero_banners
    ADD CONSTRAINT hero_banners_pkey PRIMARY KEY (id);


--
-- Name: home_category_affinity home_category_affinity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_category_affinity
    ADD CONSTRAINT home_category_affinity_pkey PRIMARY KEY (id);


--
-- Name: home_category_affinity home_category_affinity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_category_affinity
    ADD CONSTRAINT home_category_affinity_unique UNIQUE (owner_kind, owner_key, module_key, category_key);


--
-- Name: kc_admin_chart_prefs kc_admin_chart_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kc_admin_chart_prefs
    ADD CONSTRAINT kc_admin_chart_prefs_pkey PRIMARY KEY (user_id);


--
-- Name: kc_invited_emails kc_invited_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kc_invited_emails
    ADD CONSTRAINT kc_invited_emails_pkey PRIMARY KEY (email);


--
-- Name: kc_trusted_publishers kc_trusted_publishers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kc_trusted_publishers
    ADD CONSTRAINT kc_trusted_publishers_pkey PRIMARY KEY (user_id);


--
-- Name: notification_channel_targets notification_channel_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channel_targets
    ADD CONSTRAINT notification_channel_targets_pkey PRIMARY KEY (user_id, channel);


--
-- Name: notification_delivery_attempts notification_delivery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_attempts
    ADD CONSTRAINT notification_delivery_attempts_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery_outbox notification_delivery_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_outbox
    ADD CONSTRAINT notification_delivery_outbox_pkey PRIMARY KEY (id);


--
-- Name: notification_dispatch_runs notification_dispatch_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_dispatch_runs
    ADD CONSTRAINT notification_dispatch_runs_pkey PRIMARY KEY (id);


--
-- Name: notification_dispatch_runtime notification_dispatch_runtime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_dispatch_runtime
    ADD CONSTRAINT notification_dispatch_runtime_pkey PRIMARY KEY (slot);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: post_flood_limits post_flood_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_flood_limits
    ADD CONSTRAINT post_flood_limits_pkey PRIMARY KEY (id);


--
-- Name: post_flood_resets post_flood_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_flood_resets
    ADD CONSTRAINT post_flood_resets_pkey PRIMARY KEY (id);


--
-- Name: post_limits post_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_limits
    ADD CONSTRAINT post_limits_pkey PRIMARY KEY (id);


--
-- Name: post_media post_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_pkey PRIMARY KEY (id);


--
-- Name: post_view_events post_view_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_view_events
    ADD CONSTRAINT post_view_events_pkey PRIMARY KEY (id);


--
-- Name: post_votes post_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_pkey PRIMARY KEY (id);


--
-- Name: post_votes post_votes_post_id_voter_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_post_id_voter_id_key UNIQUE (post_id, voter_id);


--
-- Name: posts posts_legacy_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_legacy_id_unique UNIQUE (legacy_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: privacy_analytics_events privacy_analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_analytics_events
    ADD CONSTRAINT privacy_analytics_events_pkey PRIMARY KEY (id);


--
-- Name: privacy_consent_events privacy_consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_consent_events
    ADD CONSTRAINT privacy_consent_events_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: saved_posts saved_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts
    ADD CONSTRAINT saved_posts_pkey PRIMARY KEY (id);


--
-- Name: saved_posts saved_posts_user_post_kind_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts
    ADD CONSTRAINT saved_posts_user_post_kind_unique UNIQUE (user_id, post_id, kind);


--
-- Name: search_queries search_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_queries
    ADD CONSTRAINT search_queries_pkey PRIMARY KEY (id);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id);


--
-- Name: user_legal_acceptances user_legal_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_legal_acceptances
    ADD CONSTRAINT user_legal_acceptances_pkey PRIMARY KEY (id);


--
-- Name: user_legal_acceptances user_legal_acceptances_unique_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_legal_acceptances
    ADD CONSTRAINT user_legal_acceptances_unique_version UNIQUE (user_id, terms_version, privacy_version);


--
-- Name: user_ratings user_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_pkey PRIMARY KEY (id);


--
-- Name: user_ratings user_ratings_unique_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_unique_pair UNIQUE (rater_user_id, target_user_id);


--
-- Name: account_erasure_requests_email_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_erasure_requests_email_hash_idx ON public.account_erasure_requests USING btree (email_hash, created_at DESC);


--
-- Name: account_erasure_requests_help_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_erasure_requests_help_request_idx ON public.account_erasure_requests USING btree (help_request_id);


--
-- Name: account_erasure_requests_processed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_erasure_requests_processed_by_idx ON public.account_erasure_requests USING btree (processed_by);


--
-- Name: account_erasure_requests_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_erasure_requests_user_status_idx ON public.account_erasure_requests USING btree (user_id, status, created_at DESC);


--
-- Name: audit_log_actor_created_at_desc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_actor_created_at_desc_idx ON public.audit_log USING btree (actor_id, created_at DESC);


--
-- Name: audit_log_created_at_desc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_created_at_desc_idx ON public.audit_log USING btree (created_at DESC);


--
-- Name: audit_log_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: chat_conversations_last_message_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_conversations_last_message_sender_idx ON public.chat_conversations USING btree (last_message_sender);


--
-- Name: chat_read_state_last_read_msg_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_read_state_last_read_msg_id_idx ON public.chat_read_state USING btree (last_read_msg_id);


--
-- Name: chat_read_state_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_read_state_user_id_idx ON public.chat_read_state USING btree (user_id);


--
-- Name: comment_likes_comment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_likes_comment_id_idx ON public.comment_likes USING btree (comment_id);


--
-- Name: comment_likes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_likes_user_id_idx ON public.comment_likes USING btree (user_id);


--
-- Name: comments_author_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_author_id_idx ON public.comments USING btree (author_id);


--
-- Name: comments_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_created_at_idx ON public.comments USING btree (created_at DESC);


--
-- Name: comments_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_post_id_idx ON public.comments USING btree (post_id);


--
-- Name: help_requests_admin_decided_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX help_requests_admin_decided_by_idx ON public.help_requests USING btree (admin_decided_by);


--
-- Name: help_requests_admin_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX help_requests_admin_status_idx ON public.help_requests USING btree (admin_status, created_at DESC) WHERE ((type = 'external_access'::text) OR ((metadata ->> 'request_kind'::text) = 'external_access'::text));


--
-- Name: help_requests_priority_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX help_requests_priority_created_idx ON public.help_requests USING btree (priority, created_at DESC);


--
-- Name: help_requests_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX help_requests_status_created_idx ON public.help_requests USING btree (status, created_at DESC);


--
-- Name: help_requests_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX help_requests_type_created_idx ON public.help_requests USING btree (type, created_at DESC);


--
-- Name: help_requests_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX help_requests_user_created_idx ON public.help_requests USING btree (user_id, created_at DESC);


--
-- Name: home_category_affinity_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX home_category_affinity_session_idx ON public.home_category_affinity USING btree (session_id, score DESC, updated_at DESC);


--
-- Name: home_category_affinity_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX home_category_affinity_user_idx ON public.home_category_affinity USING btree (user_id, score DESC, updated_at DESC);


--
-- Name: idx_ad_campaign_audit_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_campaign_audit_campaign ON public.ad_campaign_audit USING btree (campaign_id, changed_at DESC);


--
-- Name: idx_ad_campaign_audit_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_campaign_audit_changed_by ON public.ad_campaign_audit USING btree (changed_by);


--
-- Name: idx_ad_campaigns_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_campaigns_created_by ON public.ad_campaigns USING btree (created_by);


--
-- Name: idx_ad_campaigns_modules; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_campaigns_modules ON public.ad_campaigns USING gin (module_keys);


--
-- Name: idx_ad_campaigns_placements; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_campaigns_placements ON public.ad_campaigns USING gin (placements);


--
-- Name: idx_ad_campaigns_status_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_campaigns_status_dates ON public.ad_campaigns USING btree (status, starts_at, ends_at, priority DESC);


--
-- Name: idx_ad_campaigns_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_campaigns_updated_by ON public.ad_campaigns USING btree (updated_by);


--
-- Name: idx_ad_network_settings_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_network_settings_updated_by ON public.ad_network_settings USING btree (updated_by);


--
-- Name: idx_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at);


--
-- Name: idx_chat_conv_high_lastmsg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conv_high_lastmsg ON public.chat_conversations USING btree (participant_high, last_message_at DESC NULLS LAST);


--
-- Name: idx_chat_conv_low_lastmsg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conv_low_lastmsg ON public.chat_conversations USING btree (participant_low, last_message_at DESC NULLS LAST);


--
-- Name: idx_chat_msg_conv_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_msg_conv_created ON public.chat_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_chat_msg_sender_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_msg_sender_created ON public.chat_messages USING btree (sender_id, created_at DESC);


--
-- Name: idx_comments_author_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_author_created ON public.comments USING btree (author_id, created_at);


--
-- Name: idx_comments_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_parent_id ON public.comments USING btree (parent_id);


--
-- Name: idx_hero_banner_audit_banner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hero_banner_audit_banner_id ON public.hero_banner_audit USING btree (banner_id);


--
-- Name: idx_hero_banner_audit_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hero_banner_audit_changed_by ON public.hero_banner_audit USING btree (changed_by);


--
-- Name: idx_hero_banners_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hero_banners_created_by ON public.hero_banners USING btree (created_by);


--
-- Name: idx_hero_banners_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hero_banners_updated_by ON public.hero_banners USING btree (updated_by);


--
-- Name: idx_kc_invited_emails_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kc_invited_emails_invited_by ON public.kc_invited_emails USING btree (invited_by);


--
-- Name: idx_notification_delivery_attempts_channel_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_channel_status ON public.notification_delivery_attempts USING btree (channel, status, attempted_at DESC);


--
-- Name: idx_notification_delivery_attempts_outbox_attempted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_outbox_attempted ON public.notification_delivery_attempts USING btree (outbox_id, attempted_at DESC);


--
-- Name: idx_notification_delivery_outbox_channel_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_outbox_channel_status ON public.notification_delivery_outbox USING btree (channel, status, next_attempt_at);


--
-- Name: idx_notification_delivery_outbox_status_next_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_outbox_status_next_attempt ON public.notification_delivery_outbox USING btree (status, next_attempt_at, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'failed'::text, 'processing'::text]));


--
-- Name: idx_notification_delivery_outbox_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_outbox_user_created ON public.notification_delivery_outbox USING btree (user_id, created_at DESC);


--
-- Name: idx_notification_dispatch_runs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_dispatch_runs_created ON public.notification_dispatch_runs USING btree (created_at DESC);


--
-- Name: idx_notification_dispatch_runs_source_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_dispatch_runs_source_created ON public.notification_dispatch_runs USING btree (source, created_at DESC);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (read = false);


--
-- Name: idx_post_flood_resets_user_module_reset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_flood_resets_user_module_reset ON public.post_flood_resets USING btree (user_id, module, reset_at DESC);


--
-- Name: idx_post_limits_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_limits_created_by ON public.post_limits USING btree (created_by);


--
-- Name: idx_post_view_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_view_events_created_at ON public.post_view_events USING btree (created_at);


--
-- Name: idx_post_view_events_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_view_events_dedup ON public.post_view_events USING btree (post_id, user_id, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: idx_post_view_events_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_view_events_post_id ON public.post_view_events USING btree (post_id);


--
-- Name: idx_post_view_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_view_events_user_id ON public.post_view_events USING btree (user_id);


--
-- Name: idx_posts_author_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_author_created ON public.posts USING btree (author_id, created_at) WHERE (status <> 'deleted'::text);


--
-- Name: idx_posts_author_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_author_created_desc ON public.posts USING btree (author_id, created_at DESC);


--
-- Name: idx_posts_author_created_module_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_author_created_module_desc ON public.posts USING btree (author_id, created_at DESC, module);


--
-- Name: idx_posts_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_fts ON public.posts USING gin (public.kc_posts_search_document(title, description, category, metadata)) WHERE (legacy_id IS NULL);


--
-- Name: idx_posts_view_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_view_count ON public.posts USING btree (view_count DESC) WHERE (status = 'published'::text);


--
-- Name: idx_privacy_analytics_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_analytics_events_created_at ON public.privacy_analytics_events USING btree (created_at DESC);


--
-- Name: idx_privacy_analytics_events_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_analytics_events_entity ON public.privacy_analytics_events USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: idx_privacy_analytics_events_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_analytics_events_event_created ON public.privacy_analytics_events USING btree (event_name, created_at DESC);


--
-- Name: idx_privacy_analytics_events_page_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_analytics_events_page_created ON public.privacy_analytics_events USING btree (page_path, created_at DESC);


--
-- Name: idx_privacy_analytics_events_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_analytics_events_session ON public.privacy_analytics_events USING btree (session_hash, created_at DESC);


--
-- Name: idx_privacy_analytics_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_analytics_events_user_id ON public.privacy_analytics_events USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_privacy_consent_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_consent_events_created_at ON public.privacy_consent_events USING btree (created_at DESC);


--
-- Name: idx_privacy_consent_events_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_consent_events_session ON public.privacy_consent_events USING btree (session_hash, created_at DESC);


--
-- Name: idx_search_queries_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_queries_created_at ON public.search_queries USING btree (created_at DESC);


--
-- Name: idx_search_queries_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_queries_term ON public.search_queries USING btree (lower(term));


--
-- Name: idx_search_queries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_queries_user_id ON public.search_queries USING btree (user_id);


--
-- Name: idx_user_blocks_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id);


--
-- Name: kc_trusted_publishers_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kc_trusted_publishers_created_by_idx ON public.kc_trusted_publishers USING btree (created_by);


--
-- Name: notification_delivery_outbox_notification_channel_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_delivery_outbox_notification_channel_uidx ON public.notification_delivery_outbox USING btree (notification_id, channel);


--
-- Name: post_flood_limits_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_flood_limits_created_by_idx ON public.post_flood_limits USING btree (created_by);


--
-- Name: post_flood_limits_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_flood_limits_module_idx ON public.post_flood_limits USING btree (module);


--
-- Name: post_flood_limits_unique_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX post_flood_limits_unique_scope_idx ON public.post_flood_limits USING btree (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(module, '__all__'::text));


--
-- Name: post_flood_limits_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_flood_limits_user_id_idx ON public.post_flood_limits USING btree (user_id);


--
-- Name: post_flood_resets_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_flood_resets_created_by_idx ON public.post_flood_resets USING btree (created_by);


--
-- Name: post_limits_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_limits_module_idx ON public.post_limits USING btree (module);


--
-- Name: post_limits_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_limits_user_id_idx ON public.post_limits USING btree (user_id);


--
-- Name: post_media_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_media_post_id_idx ON public.post_media USING btree (post_id);


--
-- Name: post_media_post_id_sort_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_media_post_id_sort_order_idx ON public.post_media USING btree (post_id, sort_order);


--
-- Name: post_votes_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_votes_post_id_idx ON public.post_votes USING btree (post_id);


--
-- Name: post_votes_voter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_votes_voter_id_idx ON public.post_votes USING btree (voter_id);


--
-- Name: posts_author_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_author_id_created_at_idx ON public.posts USING btree (author_id, created_at DESC);


--
-- Name: posts_author_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_author_id_idx ON public.posts USING btree (author_id);


--
-- Name: posts_bumped_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_bumped_at_idx ON public.posts USING btree (bumped_at DESC NULLS LAST) WHERE (status = 'published'::text);


--
-- Name: posts_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_category_idx ON public.posts USING btree (category);


--
-- Name: posts_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_created_at_idx ON public.posts USING btree (created_at DESC);


--
-- Name: posts_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_expires_at_idx ON public.posts USING btree (expires_at) WHERE (status = 'published'::text);


--
-- Name: posts_highlight_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_highlight_score_idx ON public.posts USING btree (highlight_score DESC) WHERE (status = 'published'::text);


--
-- Name: posts_last_comment_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_last_comment_at_idx ON public.posts USING btree (last_comment_at DESC NULLS LAST);


--
-- Name: posts_metadata_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_metadata_gin_idx ON public.posts USING gin (metadata);


--
-- Name: posts_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_module_idx ON public.posts USING btree (module);


--
-- Name: posts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_status_idx ON public.posts USING btree (status);


--
-- Name: posts_status_module_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_status_module_category_idx ON public.posts USING btree (status, module, category);


--
-- Name: posts_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_title_trgm_idx ON public.posts USING gin (title extensions.gin_trgm_ops) WHERE (status = ANY (ARRAY['published'::text, 'hidden'::text, 'expired'::text]));


--
-- Name: posts_visibility_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_visibility_status_idx ON public.posts USING btree (visibility, status, created_at DESC);


--
-- Name: profiles_profile_public_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_profile_public_idx ON public.profiles USING btree (profile_public);


--
-- Name: reports_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_created_at_idx ON public.reports USING btree (created_at DESC);


--
-- Name: reports_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_entity_id_idx ON public.reports USING btree (entity_id);


--
-- Name: reports_entity_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_entity_type_idx ON public.reports USING btree (entity_type);


--
-- Name: reports_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_post_id_idx ON public.reports USING btree (post_id);


--
-- Name: reports_reporter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_reporter_id_idx ON public.reports USING btree (reporter_id);


--
-- Name: reports_unique_open_comment_reporter; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reports_unique_open_comment_reporter ON public.reports USING btree (entity_id, reporter_id) WHERE ((status = 'open'::text) AND (entity_type = 'comment'::text) AND (entity_id IS NOT NULL));


--
-- Name: reports_unique_open_post_reporter; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reports_unique_open_post_reporter ON public.reports USING btree (post_id, reporter_id) WHERE ((status = 'open'::text) AND (post_id IS NOT NULL));


--
-- Name: saved_posts_kind_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_posts_kind_updated_idx ON public.saved_posts USING btree (kind, updated_at DESC);


--
-- Name: saved_posts_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_posts_post_id_idx ON public.saved_posts USING btree (post_id);


--
-- Name: saved_posts_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_posts_user_id_idx ON public.saved_posts USING btree (user_id);


--
-- Name: saved_posts_user_kind_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_posts_user_kind_updated_idx ON public.saved_posts USING btree (user_id, kind, updated_at DESC);


--
-- Name: saved_posts_user_post_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_posts_user_post_kind_idx ON public.saved_posts USING btree (user_id, post_id, kind);


--
-- Name: user_legal_acceptances_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_legal_acceptances_user_created_idx ON public.user_legal_acceptances USING btree (user_id, created_at DESC);


--
-- Name: user_ratings_context_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_ratings_context_post_idx ON public.user_ratings USING btree (context_post_id);


--
-- Name: user_ratings_rater_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_ratings_rater_idx ON public.user_ratings USING btree (rater_user_id);


--
-- Name: user_ratings_target_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_ratings_target_created_idx ON public.user_ratings USING btree (target_user_id, created_at DESC, id DESC);


--
-- Name: chat_messages chat_msg_after_insert_denormalize; Type: TRIGGER; Schema: public; Owner: -
--



--
-- Name: chat_messages chat_msg_after_insert_notify; Type: TRIGGER; Schema: public; Owner: -
--



--
-- Name: chat_messages chat_msg_after_update_refresh_preview; Type: TRIGGER; Schema: public; Owner: -
--



--
-- Name: posts kc_posts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_posts_set_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: profiles kc_profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: comments kc_trg_post_last_comment_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_trg_post_last_comment_at AFTER INSERT OR DELETE OR UPDATE OF created_at ON public.comments FOR EACH ROW EXECUTE FUNCTION public.kc_update_post_last_comment_at();


--
-- Name: comments kc_trigger_check_comment_depth; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_trigger_check_comment_depth BEFORE INSERT OR UPDATE OF parent_id, post_id ON public.comments FOR EACH ROW EXECUTE FUNCTION public.kc_check_comment_depth();


--
-- Name: comments kc_trigger_notify_on_comment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_trigger_notify_on_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.kc_notify_on_comment();


--
-- Name: comments kc_trigger_notify_on_comment_reply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_trigger_notify_on_comment_reply AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.kc_notify_on_comment_reply();


--
-- Name: post_votes kc_trigger_notify_on_vote; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_trigger_notify_on_vote AFTER INSERT ON public.post_votes FOR EACH ROW EXECUTE FUNCTION public.kc_notify_on_vote();


--
-- Name: user_ratings kc_trigger_user_ratings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_trigger_user_ratings_set_updated_at BEFORE UPDATE ON public.user_ratings FOR EACH ROW EXECUTE FUNCTION public.kc_user_ratings_set_updated_at();


--
-- Name: user_ratings kc_trigger_user_ratings_sync_target; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kc_trigger_user_ratings_sync_target AFTER INSERT OR DELETE OR UPDATE ON public.user_ratings FOR EACH ROW EXECUTE FUNCTION public.kc_user_ratings_sync_target();


--
-- Name: account_erasure_requests trg_account_erasure_requests_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_account_erasure_requests_set_updated_at BEFORE UPDATE ON public.account_erasure_requests FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: ad_campaigns trg_ad_campaigns_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ad_campaigns_audit AFTER INSERT OR DELETE OR UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public._trg_ad_campaigns_audit();


--
-- Name: ad_campaigns trg_ad_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ad_campaigns_updated_at BEFORE INSERT OR UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public._trg_ad_campaigns_updated_at();


--
-- Name: ad_network_settings trg_ad_network_settings_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ad_network_settings_audit AFTER UPDATE ON public.ad_network_settings FOR EACH ROW EXECUTE FUNCTION public._trg_ad_network_settings_audit();


--
-- Name: ad_network_settings trg_ad_network_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ad_network_settings_updated_at BEFORE INSERT OR UPDATE ON public.ad_network_settings FOR EACH ROW EXECUTE FUNCTION public._trg_ad_network_settings_updated_at();


--
-- Name: posts trg_anti_spam_gate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_anti_spam_gate BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.kc_anti_spam_gate();


--
-- Name: posts trg_audit_posts_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_posts_delete AFTER DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.trg_audit_posts_delete();


--
-- Name: posts trg_audit_posts_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_posts_status AFTER UPDATE OF status ON public.posts FOR EACH ROW EXECUTE FUNCTION public.trg_audit_posts_status();


--
-- Name: reports trg_audit_reports_status_closed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_reports_status_closed AFTER UPDATE OF status ON public.reports FOR EACH ROW EXECUTE FUNCTION public.trg_audit_reports_status_closed();


--
-- Name: comments trg_comments_highlight_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_comments_highlight_score AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.kc_trigger_update_highlight_score();


--
-- Name: help_requests trg_help_requests_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_help_requests_set_updated_at BEFORE UPDATE ON public.help_requests FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: hero_banners trg_hero_banners_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hero_banners_updated_at BEFORE UPDATE ON public.hero_banners FOR EACH ROW EXECUTE FUNCTION public._trg_hero_banners_updated_at();


--
-- Name: home_category_affinity trg_home_category_affinity_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_home_category_affinity_updated_at BEFORE UPDATE ON public.home_category_affinity FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: profiles trg_kc_profiles_enforce_email_verified; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kc_profiles_enforce_email_verified BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.kc_profiles_enforce_email_verified();


--
-- Name: profiles trg_kc_profiles_guard_is_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kc_profiles_guard_is_admin BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.kc_profiles_guard_is_admin();


--
-- Name: notification_channel_targets trg_notification_channel_targets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_channel_targets_set_updated_at BEFORE UPDATE ON public.notification_channel_targets FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: notification_channel_targets trg_notification_channel_targets_touch_consent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_channel_targets_touch_consent BEFORE INSERT OR UPDATE ON public.notification_channel_targets FOR EACH ROW EXECUTE FUNCTION public.kc_touch_notification_channel_target_consent();


--
-- Name: notification_delivery_outbox trg_notification_delivery_outbox_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_delivery_outbox_set_updated_at BEFORE UPDATE ON public.notification_delivery_outbox FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: notification_dispatch_runtime trg_notification_dispatch_runtime_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_dispatch_runtime_set_updated_at BEFORE UPDATE ON public.notification_dispatch_runtime FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: notification_preferences trg_notification_preferences_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_preferences_set_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: reports trg_notify_admin_reports_threshold; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_admin_reports_threshold AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admin_reports_threshold();


--
-- Name: post_votes trg_post_votes_highlight_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_votes_highlight_score AFTER INSERT OR DELETE OR UPDATE ON public.post_votes FOR EACH ROW EXECUTE FUNCTION public.kc_trigger_update_highlight_score();


--
-- Name: reports trg_report_rate_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_report_rate_limit BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.check_report_rate_limit();


--
-- Name: saved_posts trg_saved_posts_highlight_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_saved_posts_highlight_score AFTER INSERT OR DELETE ON public.saved_posts FOR EACH ROW EXECUTE FUNCTION public.kc_trigger_update_highlight_score();


--
-- Name: saved_posts trg_saved_posts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_saved_posts_set_updated_at BEFORE UPDATE ON public.saved_posts FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: post_votes trg_sync_post_votes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_post_votes AFTER INSERT OR DELETE ON public.post_votes FOR EACH ROW EXECUTE FUNCTION public.sync_post_votes_count();


--
-- Name: post_votes trg_sync_post_votes_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_post_votes_count AFTER INSERT OR DELETE OR UPDATE OF direction ON public.post_votes FOR EACH ROW EXECUTE FUNCTION public.sync_post_votes_count();


--
-- Name: user_legal_acceptances trg_user_legal_acceptances_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_legal_acceptances_set_updated_at BEFORE UPDATE ON public.user_legal_acceptances FOR EACH ROW EXECUTE FUNCTION public.kc_set_updated_at();


--
-- Name: account_erasure_requests account_erasure_requests_help_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_erasure_requests
    ADD CONSTRAINT account_erasure_requests_help_request_id_fkey FOREIGN KEY (help_request_id) REFERENCES public.help_requests(id) ON DELETE SET NULL;


--
-- Name: account_erasure_requests account_erasure_requests_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_erasure_requests
    ADD CONSTRAINT account_erasure_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: account_erasure_requests account_erasure_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_erasure_requests
    ADD CONSTRAINT account_erasure_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ad_campaign_audit ad_campaign_audit_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_campaign_audit
    ADD CONSTRAINT ad_campaign_audit_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.ad_campaigns(id) ON DELETE CASCADE;


--
-- Name: ad_campaign_audit ad_campaign_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_campaign_audit
    ADD CONSTRAINT ad_campaign_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ad_campaigns ad_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_campaigns
    ADD CONSTRAINT ad_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ad_campaigns ad_campaigns_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_campaigns
    ADD CONSTRAINT ad_campaigns_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ad_network_settings ad_network_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_network_settings
    ADD CONSTRAINT ad_network_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_last_message_sender_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_last_message_sender_fkey FOREIGN KEY (last_message_sender) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_participant_high_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_participant_high_fkey FOREIGN KEY (participant_high) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_participant_low_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_participant_low_fkey FOREIGN KEY (participant_low) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_read_state chat_read_state_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_read_state
    ADD CONSTRAINT chat_read_state_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_read_state chat_read_state_last_read_msg_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_read_state
    ADD CONSTRAINT chat_read_state_last_read_msg_id_fkey FOREIGN KEY (last_read_msg_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: chat_read_state chat_read_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_read_state
    ADD CONSTRAINT chat_read_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: help_requests help_requests_admin_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_requests
    ADD CONSTRAINT help_requests_admin_decided_by_fkey FOREIGN KEY (admin_decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: help_requests help_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_requests
    ADD CONSTRAINT help_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hero_banner_audit hero_banner_audit_banner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero_banner_audit
    ADD CONSTRAINT hero_banner_audit_banner_id_fkey FOREIGN KEY (banner_id) REFERENCES public.hero_banners(id) ON DELETE CASCADE;


--
-- Name: hero_banner_audit hero_banner_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero_banner_audit
    ADD CONSTRAINT hero_banner_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hero_banners hero_banners_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero_banners
    ADD CONSTRAINT hero_banners_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hero_banners hero_banners_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero_banners
    ADD CONSTRAINT hero_banners_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: home_category_affinity home_category_affinity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_category_affinity
    ADD CONSTRAINT home_category_affinity_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: kc_admin_chart_prefs kc_admin_chart_prefs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kc_admin_chart_prefs
    ADD CONSTRAINT kc_admin_chart_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kc_invited_emails kc_invited_emails_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kc_invited_emails
    ADD CONSTRAINT kc_invited_emails_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: kc_trusted_publishers kc_trusted_publishers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kc_trusted_publishers
    ADD CONSTRAINT kc_trusted_publishers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: kc_trusted_publishers kc_trusted_publishers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kc_trusted_publishers
    ADD CONSTRAINT kc_trusted_publishers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_channel_targets notification_channel_targets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channel_targets
    ADD CONSTRAINT notification_channel_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_delivery_attempts notification_delivery_attempts_outbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_attempts
    ADD CONSTRAINT notification_delivery_attempts_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES public.notification_delivery_outbox(id) ON DELETE CASCADE;


--
-- Name: notification_delivery_outbox notification_delivery_outbox_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_outbox
    ADD CONSTRAINT notification_delivery_outbox_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE SET NULL;


--
-- Name: notification_delivery_outbox notification_delivery_outbox_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_outbox
    ADD CONSTRAINT notification_delivery_outbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_flood_limits post_flood_limits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_flood_limits
    ADD CONSTRAINT post_flood_limits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: post_flood_limits post_flood_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_flood_limits
    ADD CONSTRAINT post_flood_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_flood_resets post_flood_resets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_flood_resets
    ADD CONSTRAINT post_flood_resets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: post_flood_resets post_flood_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_flood_resets
    ADD CONSTRAINT post_flood_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_limits post_limits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_limits
    ADD CONSTRAINT post_limits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: post_limits post_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_limits
    ADD CONSTRAINT post_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_media post_media_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_view_events post_view_events_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_view_events
    ADD CONSTRAINT post_view_events_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_view_events post_view_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_view_events
    ADD CONSTRAINT post_view_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: post_votes post_votes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_votes post_votes_voter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_voter_id_fkey FOREIGN KEY (voter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: posts posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: privacy_analytics_events privacy_analytics_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_analytics_events
    ADD CONSTRAINT privacy_analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: privacy_consent_events privacy_consent_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_consent_events
    ADD CONSTRAINT privacy_consent_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: saved_posts saved_posts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts
    ADD CONSTRAINT saved_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: saved_posts saved_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts
    ADD CONSTRAINT saved_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: search_queries search_queries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_queries
    ADD CONSTRAINT search_queries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_blocks user_blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_legal_acceptances user_legal_acceptances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_legal_acceptances
    ADD CONSTRAINT user_legal_acceptances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_ratings user_ratings_context_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_context_post_id_fkey FOREIGN KEY (context_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;


--
-- Name: user_ratings user_ratings_rater_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_rater_user_id_fkey FOREIGN KEY (rater_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_ratings user_ratings_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: account_erasure_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_erasure_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: account_erasure_requests account_erasure_requests_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_erasure_requests_insert_admin ON public.account_erasure_requests FOR INSERT TO authenticated WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: account_erasure_requests account_erasure_requests_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_erasure_requests_select_admin ON public.account_erasure_requests FOR SELECT TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: account_erasure_requests account_erasure_requests_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_erasure_requests_update_admin ON public.account_erasure_requests FOR UPDATE TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: ad_campaign_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_campaign_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_campaign_audit ad_campaign_audit_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_campaign_audit_admin_insert ON public.ad_campaign_audit FOR INSERT TO authenticated WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: ad_campaign_audit ad_campaign_audit_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_campaign_audit_admin_read ON public.ad_campaign_audit FOR SELECT TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: ad_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_campaigns ad_campaigns_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_campaigns_admin_delete ON public.ad_campaigns FOR DELETE TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: ad_campaigns ad_campaigns_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_campaigns_admin_insert ON public.ad_campaigns FOR INSERT TO authenticated WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: ad_campaigns ad_campaigns_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_campaigns_admin_update ON public.ad_campaigns FOR UPDATE TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: ad_campaigns ad_campaigns_read_active_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_campaigns_read_active_anon ON public.ad_campaigns FOR SELECT TO anon USING (((status = 'active'::text) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))));


--
-- Name: ad_campaigns ad_campaigns_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_campaigns_read_authenticated ON public.ad_campaigns FOR SELECT TO authenticated USING ((((status = 'active'::text) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))) OR public.kc_is_admin(( SELECT auth.uid() AS uid))));


--
-- Name: ad_network_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_network_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_network_settings ad_network_settings_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_network_settings_admin_all ON public.ad_network_settings TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_insert_trigger_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_insert_trigger_only ON public.audit_log FOR INSERT TO authenticated WITH CHECK (((pg_trigger_depth() > 0) AND ((actor_id = ( SELECT auth.uid() AS uid)) OR (actor_id IS NULL))));


--
-- Name: audit_log audit_log_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_select_admin ON public.audit_log FOR SELECT TO authenticated USING ((( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = true));


--
-- Name: hero_banner_audit banner_audit_insert_fn; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banner_audit_insert_fn ON public.hero_banner_audit FOR INSERT WITH CHECK (true);


--
-- Name: hero_banner_audit banner_audit_read_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banner_audit_read_admin ON public.hero_banner_audit FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));


--
-- Name: hero_banners banners_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_delete_admin ON public.hero_banners FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));


--
-- Name: hero_banners banners_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_insert_admin ON public.hero_banners FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));


--
-- Name: hero_banners banners_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_read ON public.hero_banners FOR SELECT USING (((is_active = true) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));


--
-- Name: hero_banners banners_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banners_update_admin ON public.hero_banners FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));


--
-- Name: chat_conversations chat_conv_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_conv_select_own ON public.chat_conversations FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = participant_low) OR (( SELECT auth.uid() AS uid) = participant_high)));


--
-- Name: chat_conversations chat_conv_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_conv_update_own ON public.chat_conversations FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = participant_low) OR (( SELECT auth.uid() AS uid) = participant_high))) WITH CHECK (((( SELECT auth.uid() AS uid) = participant_low) OR (( SELECT auth.uid() AS uid) = participant_high)));


--
-- Name: chat_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_msg_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_msg_select_participant ON public.chat_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.chat_conversations c
  WHERE ((c.id = chat_messages.conversation_id) AND ((( SELECT auth.uid() AS uid) = c.participant_low) OR (( SELECT auth.uid() AS uid) = c.participant_high))))));


--
-- Name: chat_read_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_read_state ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_read_state chat_read_state_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_read_state_own ON public.chat_read_state TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: comment_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: comment_likes comment_likes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comment_likes_delete_own ON public.comment_likes FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: comment_likes comment_likes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comment_likes_insert_own ON public.comment_likes FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: comment_likes comment_likes_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comment_likes_select_public ON public.comment_likes FOR SELECT USING (true);


--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: comments comments_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_delete_authenticated ON public.comments FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = author_id) OR (( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = true)));


--
-- Name: comments comments_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_insert_auth ON public.comments FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = author_id));


--
-- Name: comments comments_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_select_authenticated ON public.comments FOR SELECT TO authenticated USING (((author_id = ( SELECT auth.uid() AS uid)) OR public.kc_is_admin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = comments.post_id) AND public.kc_can_read_post(p.author_id, p.status, p.visibility))))));


--
-- Name: comments comments_select_public_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_select_public_anon ON public.comments FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = comments.post_id) AND public.kc_can_read_post(p.author_id, p.status, p.visibility)))));


--
-- Name: comments comments_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_update_own ON public.comments FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = author_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = author_id));


--
-- Name: home_category_affinity hca_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hca_select_own ON public.home_category_affinity FOR SELECT TO authenticated USING (((owner_kind = 'user'::text) AND (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: home_category_affinity hca_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hca_service_role_all ON public.home_category_affinity TO service_role USING (true) WITH CHECK (true);


--
-- Name: help_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: help_requests help_requests_insert_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY help_requests_insert_anon ON public.help_requests FOR INSERT TO anon WITH CHECK (((user_id IS NULL) AND (COALESCE(admin_status, 'pending'::text) = 'pending'::text) AND (COALESCE(status, 'new'::text) = 'new'::text) AND (COALESCE(priority, 'normal'::text) = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))));


--
-- Name: POLICY help_requests_insert_anon ON help_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY help_requests_insert_anon ON public.help_requests IS 'v9.3.5.8: anon insere apenas com admin_status=pending, status=new, user_id null';


--
-- Name: help_requests help_requests_insert_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY help_requests_insert_public ON public.help_requests FOR INSERT TO authenticated, anon WITH CHECK (((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: help_requests help_requests_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY help_requests_select_own ON public.help_requests FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR public.kc_is_admin(( SELECT auth.uid() AS uid))));


--
-- Name: help_requests help_requests_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY help_requests_update_admin ON public.help_requests FOR UPDATE TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: hero_banner_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hero_banner_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: hero_banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hero_banners ENABLE ROW LEVEL SECURITY;

--
-- Name: home_category_affinity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.home_category_affinity ENABLE ROW LEVEL SECURITY;

--
-- Name: kc_admin_chart_prefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kc_admin_chart_prefs ENABLE ROW LEVEL SECURITY;

--
-- Name: kc_admin_chart_prefs kc_admin_chart_prefs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kc_admin_chart_prefs_insert ON public.kc_admin_chart_prefs FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.kc_is_admin(( SELECT auth.uid() AS uid))));


--
-- Name: kc_admin_chart_prefs kc_admin_chart_prefs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kc_admin_chart_prefs_select ON public.kc_admin_chart_prefs FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND public.kc_is_admin(( SELECT auth.uid() AS uid))));


--
-- Name: kc_admin_chart_prefs kc_admin_chart_prefs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kc_admin_chart_prefs_update ON public.kc_admin_chart_prefs FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND public.kc_is_admin(( SELECT auth.uid() AS uid)))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.kc_is_admin(( SELECT auth.uid() AS uid))));


--
-- Name: kc_invited_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kc_invited_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: kc_invited_emails kc_invited_emails_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kc_invited_emails_delete_admin ON public.kc_invited_emails FOR DELETE TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: kc_invited_emails kc_invited_emails_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kc_invited_emails_insert_admin ON public.kc_invited_emails FOR INSERT TO authenticated WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: kc_invited_emails kc_invited_emails_select_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kc_invited_emails_select_visible ON public.kc_invited_emails FOR SELECT TO authenticated USING ((public.kc_is_admin(( SELECT auth.uid() AS uid)) OR (lower(TRIM(BOTH FROM email)) = ( SELECT lower(TRIM(BOTH FROM u.email)) AS lower
   FROM auth.users u
  WHERE (u.id = ( SELECT auth.uid() AS uid))))));


--
-- Name: kc_invited_emails kc_invited_emails_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kc_invited_emails_update_admin ON public.kc_invited_emails FOR UPDATE TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: kc_trusted_publishers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kc_trusted_publishers ENABLE ROW LEVEL SECURITY;

--
-- Name: kc_trusted_publishers kc_trusted_publishers_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kc_trusted_publishers_admin_write ON public.kc_trusted_publishers TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid))) WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: notification_channel_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_channel_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_channel_targets notification_channel_targets_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_channel_targets_delete_own ON public.notification_channel_targets FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notification_channel_targets notification_channel_targets_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_channel_targets_insert_own ON public.notification_channel_targets FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notification_channel_targets notification_channel_targets_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_channel_targets_select_own ON public.notification_channel_targets FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notification_channel_targets notification_channel_targets_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_channel_targets_update_own ON public.notification_channel_targets FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notification_delivery_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_delivery_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_dispatch_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_dispatch_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_dispatch_runtime; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_dispatch_runtime ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences notification_preferences_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_delete_own ON public.notification_preferences FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notification_preferences notification_preferences_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_insert_own ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notification_preferences notification_preferences_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_select_own ON public.notification_preferences FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notification_preferences notification_preferences_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_update_own ON public.notification_preferences FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: post_flood_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_flood_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: post_flood_limits post_flood_limits_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_flood_limits_delete_admin ON public.post_flood_limits FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin IS TRUE)))));


--
-- Name: post_flood_limits post_flood_limits_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_flood_limits_insert_admin ON public.post_flood_limits FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin IS TRUE)))));


--
-- Name: post_flood_limits post_flood_limits_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_flood_limits_select ON public.post_flood_limits FOR SELECT TO authenticated USING (((user_id IS NULL) OR (user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin IS TRUE))))));


--
-- Name: post_flood_limits post_flood_limits_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_flood_limits_update_admin ON public.post_flood_limits FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin IS TRUE)))));


--
-- Name: post_flood_resets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_flood_resets ENABLE ROW LEVEL SECURITY;

--
-- Name: post_flood_resets post_flood_resets_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_flood_resets_admin_delete ON public.post_flood_resets FOR DELETE TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: post_flood_resets post_flood_resets_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_flood_resets_admin_insert ON public.post_flood_resets FOR INSERT TO authenticated WITH CHECK (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: post_flood_resets post_flood_resets_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_flood_resets_admin_select ON public.post_flood_resets FOR SELECT TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: post_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: post_limits post_limits_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_limits_delete_admin ON public.post_limits FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));


--
-- Name: post_limits post_limits_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_limits_insert_admin ON public.post_limits FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));


--
-- Name: post_limits post_limits_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_limits_select ON public.post_limits FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (user_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));


--
-- Name: post_limits post_limits_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_limits_update_admin ON public.post_limits FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));


--
-- Name: post_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

--
-- Name: post_media post_media_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_media_delete ON public.post_media FOR DELETE TO authenticated USING ((public.kc_is_admin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_media.post_id) AND (p.author_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: post_media post_media_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_media_insert ON public.post_media FOR INSERT TO authenticated WITH CHECK ((public.kc_is_admin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_media.post_id) AND (p.author_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: post_media post_media_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_media_select_public ON public.post_media FOR SELECT TO authenticated, anon USING (true);


--
-- Name: post_media post_media_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_media_update ON public.post_media FOR UPDATE TO authenticated USING ((public.kc_is_admin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_media.post_id) AND (p.author_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((public.kc_is_admin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_media.post_id) AND (p.author_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: post_view_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_view_events ENABLE ROW LEVEL SECURITY;

--
-- Name: post_view_events post_view_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_view_events_insert ON public.post_view_events FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: post_view_events post_view_events_select_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_view_events_select_visible ON public.post_view_events FOR SELECT TO authenticated USING ((public.kc_is_admin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_view_events.post_id) AND (p.author_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: post_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: post_votes post_votes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_votes_delete_own ON public.post_votes FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = voter_id));


--
-- Name: post_votes post_votes_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_votes_insert_auth ON public.post_votes FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = voter_id));


--
-- Name: post_votes post_votes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_votes_select_own ON public.post_votes FOR SELECT TO authenticated USING ((auth.uid() = voter_id));


--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: posts posts_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY posts_delete_authenticated ON public.posts FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (((( SELECT auth.uid() AS uid) = author_id) AND (status = ANY (ARRAY['published'::text, 'pending'::text]))) OR (( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = true))));


--
-- Name: posts posts_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY posts_insert_own ON public.posts FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = author_id));


--
-- Name: posts posts_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY posts_select_authenticated ON public.posts FOR SELECT TO authenticated USING (public.kc_can_read_post(author_id, status, visibility));


--
-- Name: posts posts_select_public_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY posts_select_public_anon ON public.posts FOR SELECT TO anon USING (public.kc_can_read_post(author_id, status, visibility));


--
-- Name: posts posts_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY posts_update_authenticated ON public.posts FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = author_id) OR (( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = true))) WITH CHECK (((( SELECT auth.uid() AS uid) = author_id) OR (( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = true)));


--
-- Name: privacy_analytics_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.privacy_analytics_events ENABLE ROW LEVEL SECURITY;

--
-- Name: privacy_analytics_events privacy_analytics_events_insert_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY privacy_analytics_events_insert_public ON public.privacy_analytics_events FOR INSERT TO authenticated, anon WITH CHECK (((session_hash ~ '^[a-f0-9]{64}$'::text) AND (page_path ~~ '/%'::text) AND (length(page_path) <= 180) AND ((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))) AND (jsonb_typeof(metadata) = 'object'::text) AND (NOT (metadata ?| ARRAY['cookie'::text, 'cookies'::text, 'token'::text, 'access_token'::text, 'refresh_token'::text, 'password'::text, 'authorization'::text, 'secret'::text, 'email'::text, 'ip'::text, 'user_agent'::text, 'ua'::text, 'jwt'::text]))));


--
-- Name: privacy_analytics_events privacy_analytics_events_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY privacy_analytics_events_select_admin ON public.privacy_analytics_events FOR SELECT TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: privacy_consent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.privacy_consent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: privacy_consent_events privacy_consent_events_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY privacy_consent_events_select_admin ON public.privacy_consent_events FOR SELECT TO authenticated USING (public.kc_is_admin(( SELECT auth.uid() AS uid)));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: profiles profiles_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: profiles profiles_select_public_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_public_anon ON public.profiles FOR SELECT TO anon USING ((profile_public = true));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: reports reports_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reports_insert_authenticated ON public.reports FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = reporter_id));


--
-- Name: reports reports_select_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reports_select_admins ON public.reports FOR SELECT USING ((( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = true));


--
-- Name: reports reports_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reports_update_admin ON public.reports FOR UPDATE TO authenticated USING ((( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = true)) WITH CHECK ((( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = true));


--
-- Name: saved_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_posts saved_posts_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_posts_delete_own ON public.saved_posts FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: saved_posts saved_posts_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_posts_insert_own ON public.saved_posts FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: saved_posts saved_posts_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_posts_select_authenticated ON public.saved_posts FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ((kind = 'highlight'::text) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = saved_posts.post_id) AND public.kc_can_read_post(p.author_id, p.status, p.visibility)))))));


--
-- Name: saved_posts saved_posts_select_public_highlights_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_posts_select_public_highlights_anon ON public.saved_posts FOR SELECT TO anon USING (((kind = 'highlight'::text) AND (EXISTS ( SELECT 1
   FROM (public.posts p
     JOIN public.profiles pr ON ((pr.id = saved_posts.user_id)))
  WHERE ((p.id = saved_posts.post_id) AND (p.status = 'published'::text) AND (COALESCE(p.visibility, 'public'::text) = 'public'::text) AND (pr.profile_public = true))))));


--
-- Name: saved_posts saved_posts_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_posts_update_own ON public.saved_posts FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: search_queries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

--
-- Name: search_queries search_queries_insert_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_queries_insert_anon ON public.search_queries FOR INSERT TO anon WITH CHECK (true);


--
-- Name: search_queries search_queries_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_queries_insert_authenticated ON public.search_queries FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: search_queries search_queries_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_queries_select_admin ON public.search_queries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))));


--
-- Name: user_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_blocks user_blocks_modify_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_blocks_modify_own ON public.user_blocks TO authenticated USING ((blocker_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((blocker_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_legal_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_legal_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: user_legal_acceptances user_legal_acceptances_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_legal_acceptances_insert_own ON public.user_legal_acceptances FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_legal_acceptances user_legal_acceptances_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_legal_acceptances_select_own_or_admin ON public.user_legal_acceptances FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.kc_is_admin(auth.uid())));


--
-- Name: user_legal_acceptances user_legal_acceptances_update_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_legal_acceptances_update_own_or_admin ON public.user_legal_acceptances FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR public.kc_is_admin(auth.uid()))) WITH CHECK (((user_id = auth.uid()) OR public.kc_is_admin(auth.uid())));


--
-- Name: user_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ratings user_ratings_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ratings_insert_own ON public.user_ratings FOR INSERT TO authenticated WITH CHECK (((rater_user_id = ( SELECT auth.uid() AS uid)) AND (rater_user_id <> target_user_id)));


--
-- Name: user_ratings user_ratings_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ratings_select_own ON public.user_ratings FOR SELECT TO authenticated USING (((rater_user_id = ( SELECT auth.uid() AS uid)) OR (target_user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: user_ratings user_ratings_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ratings_update_own ON public.user_ratings FOR UPDATE TO authenticated USING ((rater_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((rater_user_id = ( SELECT auth.uid() AS uid)) AND (rater_user_id <> target_user_id)));
