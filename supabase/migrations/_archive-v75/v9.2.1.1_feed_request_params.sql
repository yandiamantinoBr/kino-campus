-- ============================================================
-- KinoCampus v9.2.1.1 — Filtros avançados no feed incremental
-- ============================================================
--
-- Objetivo:
--   - Estender kc_get_feed_cursor com p_request_params JSONB
--   - Aplicar filtros avançados por módulo no lado do banco
--   - Preservar a ordenação cursor-based introduzida em v9.2.2
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.kc_feed_normalize_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT trim(lower(unaccent(COALESCE(p_value, ''))));
$$;

CREATE OR REPLACE FUNCTION public.kc_feed_slug_key(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(public.kc_feed_normalize_text(p_value), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.kc_feed_jsonb_bool(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN FALSE
    WHEN jsonb_typeof(p_value) = 'boolean' THEN p_value::TEXT = 'true'
    ELSE public.kc_feed_normalize_text(p_value #>> '{}') IN ('1', 'true', 'yes', 'sim')
  END;
$$;

CREATE OR REPLACE FUNCTION public.kc_feed_jsonb_text_list(p_value JSONB)
RETURNS TEXT[]
LANGUAGE sql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_jsonb_slug_list(p_value JSONB)
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(item) FILTER (WHERE item <> ''), ARRAY[]::TEXT[])
  FROM (
    SELECT public.kc_feed_slug_key(value) AS item
    FROM unnest(public.kc_feed_jsonb_text_list(p_value)) AS value
  ) AS items;
$$;

CREATE OR REPLACE FUNCTION public.kc_feed_array_contains_all(p_haystack TEXT[], p_needles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN COALESCE(array_length(COALESCE(p_needles, ARRAY[]::TEXT[]), 1), 0) = 0 THEN TRUE
    ELSE COALESCE(p_haystack, ARRAY[]::TEXT[]) @> COALESCE(p_needles, ARRAY[]::TEXT[])
  END;
$$;

CREATE OR REPLACE FUNCTION public.kc_feed_classify_period(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_caronas_campus_match(p_campus TEXT, p_haystack TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_market_category_key(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_market_condition_key(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_lost_found_status_key(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_lost_found_type_key(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_opportunity_type_key(p_value TEXT, p_haystack TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_opportunity_work_mode_key(p_explicit TEXT, p_haystack TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_opportunity_employment_key(p_explicit TEXT, p_haystack TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_feed_opportunity_area_key(p_explicit TEXT, p_haystack TEXT, p_subcategory TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION public.kc_matches_feed_request_params(
  p_module TEXT,
  p_category TEXT,
  p_post_subcategory TEXT,
  p_title TEXT,
  p_description TEXT,
  p_metadata JSONB,
  p_verified BOOLEAN,
  p_request_params JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
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

DROP FUNCTION IF EXISTS public.kc_get_feed_cursor(TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.kc_get_feed_cursor(TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.kc_get_feed_cursor(
  p_module         TEXT DEFAULT NULL,
  p_modules        TEXT[] DEFAULT NULL,
  p_category       TEXT DEFAULT NULL,
  p_subcategory    TEXT DEFAULT NULL,
  p_tag            TEXT DEFAULT NULL,
  p_q              TEXT DEFAULT NULL,
  p_sort_by        TEXT DEFAULT 'recentes',
  p_limit          INT DEFAULT 12,
  p_cursor         TEXT DEFAULT NULL,
  p_request_params JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
STABLE
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 12), 50));
  v_sort TEXT := CASE
    WHEN lower(coalesce(p_sort_by, 'recentes')) = 'votos' THEN 'votos'
    WHEN lower(coalesce(p_sort_by, 'recentes')) = 'comentados' THEN 'comentados'
    ELSE 'recentes'
  END;
  v_module_list TEXT[] := ARRAY[]::TEXT[];
  v_cursor_json JSONB := NULL;
  v_cursor_created TIMESTAMPTZ := NULL;
  v_cursor_id UUID := NULL;
  v_cursor_highlight DOUBLE PRECISION := 0;
  v_cursor_votos INTEGER := 0;
  v_cursor_last_comment TIMESTAMPTZ := NULL;
  v_cursor_bumped TIMESTAMPTZ := NULL;
  v_posts JSONB := '[]'::JSONB;
  v_has_more BOOLEAN := FALSE;
  v_next_cursor TEXT := NULL;
BEGIN
  v_module_list := ARRAY(
    SELECT DISTINCT lower(trim(value))
    FROM unnest(
      CASE
        WHEN p_modules IS NOT NULL AND array_length(p_modules, 1) > 0 THEN p_modules
        WHEN p_module IS NOT NULL AND btrim(p_module) <> '' THEN ARRAY[p_module]
        ELSE ARRAY[]::TEXT[]
      END
    ) AS value
    WHERE value IS NOT NULL AND btrim(value) <> ''
  );

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::JSONB;
      IF coalesce(v_cursor_json->>'sort', '') <> v_sort THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CURSOR');
      END IF;
      v_cursor_created := NULLIF(v_cursor_json->>'created_at', '')::TIMESTAMPTZ;
      v_cursor_id := NULLIF(v_cursor_json->>'id', '')::UUID;

      IF v_sort = 'votos' THEN
        v_cursor_highlight := COALESCE((v_cursor_json->>'highlight_score')::DOUBLE PRECISION, 0);
        v_cursor_votos := COALESCE((v_cursor_json->>'votos')::INTEGER, 0);
      ELSIF v_sort = 'comentados' THEN
        v_cursor_last_comment := NULLIF(v_cursor_json->>'last_comment_at', '')::TIMESTAMPTZ;
      ELSE
        v_cursor_bumped := NULLIF(v_cursor_json->>'bumped_at', '')::TIMESTAMPTZ;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CURSOR');
    END;
  END IF;

  IF v_sort = 'votos' THEN
    WITH filtered AS (
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
        COALESCE(p.highlight_score, 0)::DOUBLE PRECISION AS sort_highlight,
        p.bumped_at,
        p.last_comment_at,
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
      FROM public.posts p
      LEFT JOIN public.profiles pr
        ON pr.id = p.author_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
            ORDER BY m.is_cover DESC, m.id ASC
          ),
          '[]'::jsonb
        ) AS items
        FROM public.post_media m
        WHERE m.post_id = p.id
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::INT AS comment_count
        FROM public.comments c
        WHERE c.post_id = p.id
      ) cc ON TRUE
      WHERE p.legacy_id IS NULL
        AND (COALESCE(array_length(v_module_list, 1), 0) = 0 OR lower(COALESCE(p.module, '')) = ANY(v_module_list))
        AND (p_category IS NULL OR lower(COALESCE(p.category, '')) = lower(p_category))
        AND (
          p_subcategory IS NULL
          OR lower(COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          )) = lower(p_subcategory)
        )
        AND (
          p_tag IS NULL
          OR COALESCE(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
        )
        AND (
          COALESCE(NULLIF(btrim(p_q), ''), NULL) IS NULL
          OR p.title ILIKE '%' || btrim(p_q) || '%'
          OR p.description ILIKE '%' || btrim(p_q) || '%'
        )
        AND public.kc_matches_feed_request_params(
          p.module,
          p.category,
          COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          ),
          p.title,
          p.description,
          COALESCE(p.metadata, '{}'::jsonb),
          COALESCE(pr.verified, false),
          p_request_params
        )
        AND (
          v_cursor_json IS NULL
          OR ROW(COALESCE(p.highlight_score, 0)::DOUBLE PRECISION, COALESCE(p.votos, 0), p.created_at, p.id)
             < ROW(v_cursor_highlight, v_cursor_votos, v_cursor_created, v_cursor_id)
        )
      ORDER BY COALESCE(p.highlight_score, 0) DESC, COALESCE(p.votos, 0) DESC, p.created_at DESC, p.id DESC
      LIMIT v_limit + 1
    ),
    kept AS (
      SELECT * FROM filtered
      ORDER BY sort_highlight DESC, votos DESC, created_at DESC, id DESC
      LIMIT v_limit
    ),
    extra AS (
      SELECT count(*) > v_limit AS has_more FROM filtered
    ),
    cursor_row AS (
      SELECT * FROM kept
      ORDER BY sort_highlight DESC, votos DESC, created_at DESC, id DESC
      OFFSET GREATEST(v_limit - 1, 0)
      LIMIT 1
    )
    SELECT
      COALESCE(
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
            'highlight_score', kept.sort_highlight,
            'bumped_at', kept.bumped_at,
            'last_comment_at', kept.last_comment_at,
            'profiles', kept.profile_payload,
            'post_media', kept.media_payload,
            'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
          )
          ORDER BY kept.sort_highlight DESC, kept.votos DESC, kept.created_at DESC, kept.id DESC
        ),
        '[]'::jsonb
      ),
      COALESCE((SELECT has_more FROM extra), FALSE),
      CASE
        WHEN COALESCE((SELECT has_more FROM extra), FALSE) THEN (
          SELECT encode(
            convert_to(
              jsonb_build_object(
                'sort', 'votos',
                'highlight_score', cursor_row.sort_highlight,
                'votos', cursor_row.votos,
                'created_at', cursor_row.created_at,
                'id', cursor_row.id
              )::TEXT,
              'utf8'
            ),
            'base64'
          )
          FROM cursor_row
        )
        ELSE NULL
      END
    INTO v_posts, v_has_more, v_next_cursor
    FROM kept;
  ELSIF v_sort = 'comentados' THEN
    WITH filtered AS (
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
        p.highlight_score,
        p.bumped_at,
        p.last_comment_at,
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
      FROM public.posts p
      LEFT JOIN public.profiles pr
        ON pr.id = p.author_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
            ORDER BY m.is_cover DESC, m.id ASC
          ),
          '[]'::jsonb
        ) AS items
        FROM public.post_media m
        WHERE m.post_id = p.id
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::INT AS comment_count
        FROM public.comments c
        WHERE c.post_id = p.id
      ) cc ON TRUE
      WHERE p.legacy_id IS NULL
        AND p.last_comment_at IS NOT NULL
        AND (COALESCE(array_length(v_module_list, 1), 0) = 0 OR lower(COALESCE(p.module, '')) = ANY(v_module_list))
        AND (p_category IS NULL OR lower(COALESCE(p.category, '')) = lower(p_category))
        AND (
          p_subcategory IS NULL
          OR lower(COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          )) = lower(p_subcategory)
        )
        AND (
          p_tag IS NULL
          OR COALESCE(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
        )
        AND (
          COALESCE(NULLIF(btrim(p_q), ''), NULL) IS NULL
          OR p.title ILIKE '%' || btrim(p_q) || '%'
          OR p.description ILIKE '%' || btrim(p_q) || '%'
        )
        AND public.kc_matches_feed_request_params(
          p.module,
          p.category,
          COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          ),
          p.title,
          p.description,
          COALESCE(p.metadata, '{}'::jsonb),
          COALESCE(pr.verified, false),
          p_request_params
        )
        AND (
          v_cursor_json IS NULL
          OR ROW(p.last_comment_at, p.created_at, p.id)
             < ROW(v_cursor_last_comment, v_cursor_created, v_cursor_id)
        )
      ORDER BY p.last_comment_at DESC, p.created_at DESC, p.id DESC
      LIMIT v_limit + 1
    ),
    kept AS (
      SELECT * FROM filtered
      ORDER BY last_comment_at DESC, created_at DESC, id DESC
      LIMIT v_limit
    ),
    extra AS (
      SELECT count(*) > v_limit AS has_more FROM filtered
    ),
    cursor_row AS (
      SELECT * FROM kept
      ORDER BY last_comment_at DESC, created_at DESC, id DESC
      OFFSET GREATEST(v_limit - 1, 0)
      LIMIT 1
    )
    SELECT
      COALESCE(
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
            'last_comment_at', kept.last_comment_at,
            'profiles', kept.profile_payload,
            'post_media', kept.media_payload,
            'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
          )
          ORDER BY kept.last_comment_at DESC, kept.created_at DESC, kept.id DESC
        ),
        '[]'::jsonb
      ),
      COALESCE((SELECT has_more FROM extra), FALSE),
      CASE
        WHEN COALESCE((SELECT has_more FROM extra), FALSE) THEN (
          SELECT encode(
            convert_to(
              jsonb_build_object(
                'sort', 'comentados',
                'last_comment_at', cursor_row.last_comment_at,
                'created_at', cursor_row.created_at,
                'id', cursor_row.id
              )::TEXT,
              'utf8'
            ),
            'base64'
          )
          FROM cursor_row
        )
        ELSE NULL
      END
    INTO v_posts, v_has_more, v_next_cursor
    FROM kept;
  ELSE
    WITH filtered AS (
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
        p.highlight_score,
        COALESCE(p.bumped_at, '1970-01-01 00:00:00+00'::timestamptz) AS sort_bumped,
        p.bumped_at,
        p.last_comment_at,
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
      FROM public.posts p
      LEFT JOIN public.profiles pr
        ON pr.id = p.author_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
            ORDER BY m.is_cover DESC, m.id ASC
          ),
          '[]'::jsonb
        ) AS items
        FROM public.post_media m
        WHERE m.post_id = p.id
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::INT AS comment_count
        FROM public.comments c
        WHERE c.post_id = p.id
      ) cc ON TRUE
      WHERE p.legacy_id IS NULL
        AND (COALESCE(array_length(v_module_list, 1), 0) = 0 OR lower(COALESCE(p.module, '')) = ANY(v_module_list))
        AND (p_category IS NULL OR lower(COALESCE(p.category, '')) = lower(p_category))
        AND (
          p_subcategory IS NULL
          OR lower(COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          )) = lower(p_subcategory)
        )
        AND (
          p_tag IS NULL
          OR COALESCE(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
        )
        AND (
          COALESCE(NULLIF(btrim(p_q), ''), NULL) IS NULL
          OR p.title ILIKE '%' || btrim(p_q) || '%'
          OR p.description ILIKE '%' || btrim(p_q) || '%'
        )
        AND public.kc_matches_feed_request_params(
          p.module,
          p.category,
          COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          ),
          p.title,
          p.description,
          COALESCE(p.metadata, '{}'::jsonb),
          COALESCE(pr.verified, false),
          p_request_params
        )
        AND (
          v_cursor_json IS NULL
          OR ROW(COALESCE(p.bumped_at, '1970-01-01 00:00:00+00'::timestamptz), p.created_at, p.id)
             < ROW(COALESCE(v_cursor_bumped, '1970-01-01 00:00:00+00'::timestamptz), v_cursor_created, v_cursor_id)
        )
      ORDER BY p.bumped_at DESC NULLS LAST, p.created_at DESC, p.id DESC
      LIMIT v_limit + 1
    ),
    kept AS (
      SELECT * FROM filtered
      ORDER BY sort_bumped DESC, created_at DESC, id DESC
      LIMIT v_limit
    ),
    extra AS (
      SELECT count(*) > v_limit AS has_more FROM filtered
    ),
    cursor_row AS (
      SELECT * FROM kept
      ORDER BY sort_bumped DESC, created_at DESC, id DESC
      OFFSET GREATEST(v_limit - 1, 0)
      LIMIT 1
    )
    SELECT
      COALESCE(
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
            'last_comment_at', kept.last_comment_at,
            'profiles', kept.profile_payload,
            'post_media', kept.media_payload,
            'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
          )
          ORDER BY kept.sort_bumped DESC, kept.created_at DESC, kept.id DESC
        ),
        '[]'::jsonb
      ),
      COALESCE((SELECT has_more FROM extra), FALSE),
      CASE
        WHEN COALESCE((SELECT has_more FROM extra), FALSE) THEN (
          SELECT encode(
            convert_to(
              jsonb_build_object(
                'sort', 'recentes',
                'bumped_at', cursor_row.bumped_at,
                'created_at', cursor_row.created_at,
                'id', cursor_row.id
              )::TEXT,
              'utf8'
            ),
            'base64'
          )
          FROM cursor_row
        )
        ELSE NULL
      END
    INTO v_posts, v_has_more, v_next_cursor
    FROM kept;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'next_cursor', v_next_cursor,
    'has_more', COALESCE(v_has_more, FALSE)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_get_feed_cursor(TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.kc_get_feed_cursor(TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB) TO authenticated;
