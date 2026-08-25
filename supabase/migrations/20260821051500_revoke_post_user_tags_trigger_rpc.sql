-- kc_normalize_post_user_tags is an internal trigger helper. It must not be
-- callable through PostgREST/RPC by public client roles; table writes still
-- invoke it through trg_posts_user_tags_contract.

begin;

revoke execute on function public.kc_normalize_post_user_tags() from public;
revoke execute on function public.kc_normalize_post_user_tags() from anon;
revoke execute on function public.kc_normalize_post_user_tags() from authenticated;

comment on function public.kc_normalize_post_user_tags() is
  'Internal trigger helper for post user tags. It normalizes metadata.userTags/userTagKeys, preserves omitted values on partial edits and enforces 6 regular or 12 privileged additional tags; direct RPC execution is intentionally revoked.';

commit;
