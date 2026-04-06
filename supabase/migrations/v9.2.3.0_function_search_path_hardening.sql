-- ============================================================
-- KinoCampus - V9.2.3.0
-- Security hardening for helper functions flagged by the advisor
--
-- Scope:
--   - Pin search_path on feed/search helper functions
--   - Keep unaccent extension placement unchanged for now
--   - Leave leaked password protection as an Auth dashboard step
-- ============================================================

begin;

create or replace function public.kc_unaccent(input_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.unaccent(coalesce(input_text, ''))
$$;

create or replace function public.kc_feed_normalize_text(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select trim(lower(public.kc_unaccent(coalesce(p_value, ''))));
$$;

alter function public.kc_posts_search_subcategory(jsonb) set search_path = '';
alter function public.kc_posts_search_tags_text(jsonb) set search_path = '';
alter function public.kc_feed_slug_key(text) set search_path = '';
alter function public.kc_feed_jsonb_bool(jsonb) set search_path = '';
alter function public.kc_feed_jsonb_text_list(jsonb) set search_path = '';
alter function public.kc_feed_jsonb_slug_list(jsonb) set search_path = '';
alter function public.kc_feed_array_contains_all(text[], text[]) set search_path = '';
alter function public.kc_feed_classify_period(text) set search_path = '';
alter function public.kc_feed_caronas_campus_match(text, text) set search_path = '';
alter function public.kc_feed_market_condition_key(text) set search_path = '';
alter function public.kc_feed_market_category_key(text) set search_path = '';
alter function public.kc_feed_lost_found_status_key(text) set search_path = '';
alter function public.kc_feed_lost_found_type_key(text) set search_path = '';
alter function public.kc_feed_parse_numeric_text(text) set search_path = '';
alter function public.kc_feed_opportunity_type_key(text, text) set search_path = '';
alter function public.kc_feed_opportunity_work_mode_key(text, text) set search_path = '';
alter function public.kc_feed_opportunity_employment_key(text, text) set search_path = '';
alter function public.kc_feed_opportunity_area_key(text, text, text) set search_path = '';
alter function public.kc_matches_feed_request_params(text, text, text, text, text, jsonb, boolean, jsonb) set search_path = '';

commit;
