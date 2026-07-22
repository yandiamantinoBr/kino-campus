begin;

-- Notes are authored in textareas and may intentionally contain TAB/LF/CR.
-- Keep every other C0 control and DEL forbidden, while preserving the
-- single-line contract for names and categories.
alter table public.cadu_institutional_source_reviews
  drop constraint if exists cadu_institutional_source_reviews_contract_check;

alter table public.cadu_institutional_source_reviews
  add constraint cadu_institutional_source_reviews_contract_check
  check (
    content_kind = 'institutional_site'
    and intent = 'review'
    and origin = 'cadu-admin-map-ufg'
    and source_revision ~ '^[a-f0-9]{64}$'
    and registry_sha256 ~ '^[a-f0-9]{64}$'
    and idempotency_key =
      'map-ufg-review:' || source_id || ':' || source_revision
    and length(name) between 2 and 200
    and name !~ '[[:cntrl:]]'
    and (
      note is null
      or (
        length(note) <= 500
        and note !~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
      )
    )
    and (tier is null or tier between 1 and 3)
    and length(category) between 1 and 80
    and category !~ '[[:cntrl:]]'
  );

alter table public.cadu_institutional_source_reviews
  drop constraint if exists cadu_institutional_source_reviews_resolution_note_control_check;

alter table public.cadu_institutional_source_reviews
  add constraint cadu_institutional_source_reviews_resolution_note_control_check
  check (
    resolution_note is null
    or (
      length(resolution_note) <= 1000
      and resolution_note !~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
    )
  );

commit;
