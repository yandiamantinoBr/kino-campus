-- Keep resolver FK maintenance and future admin audit lookups indexed without
-- granting direct table access. The review table remains RPC-only.

begin;

create index if not exists cadu_institutional_reviews_resolved_by_idx
  on public.cadu_institutional_source_reviews (resolved_by)
  where resolved_by is not null;

comment on index public.cadu_institutional_reviews_resolved_by_idx is
  'Covers the review resolver foreign key and administrative audit lookups.';

commit;
