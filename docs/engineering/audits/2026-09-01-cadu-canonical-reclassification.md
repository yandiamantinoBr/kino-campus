# Cadu canonical post reclassification

## Incident

The successful Pipeline Completa run `d364cad5-4f5d-4d68-ac71-32bbce9417ac`
published Instituto Verbena record `203704` as `eventos/academicos`. Its real
lifecycle is a Sebrae/GO trainee selection: applications end on 2026-09-09 and
the 2026-10-11 examination is only a later milestone.

The canonical `edit` action intentionally supported only changes within the
current module. Adding `module` or `expires_at` to its generic allowlist would
validate the category against the wrong module, retain stale event metadata and
allow an arbitrary expiry. Unknown fields were also silently ignored, so that
unsafe request shape could appear to succeed without changing the post.

## Contract

`cadu-edit-reclassification-v1` is an explicit mode of the trusted publisher's
`edit` action. It:

- accepts only a complete `CaduItem` and an exact current-state snapshot;
- permits only `eventos` to/from `oportunidades` and requires an actual change;
- reuses `validateItem`, `mapItemToPost` and the normal publisher quality gate;
- requires the mapped `source_id` and `source_url` to remain byte-identical;
- derives category, taxonomy, semantic metadata and `expires_at` together;
- requires a future semantic expiry, including the bounded verification expiry
  used by self-paced opportunities without a declared final deadline;
- replaces canonical editorial metadata instead of merging incompatible module
  fields, while preserving the existing cover/gallery metadata and post image;
- never calls the media replacement RPC, so `post_media` and storage objects are
  unchanged;
- updates with compare-and-set filters for author, module, category, status,
  `updated_at`, expiry and source identity; a stale row returns `409`;
- returns the confirmed module, category, expiry, update time and source receipt.

Generic `fields.module` and `fields.expires_at` remain forbidden and now return
validation errors rather than a false `UPDATED` response.

## Expected Sebrae repair

The corrected item maps to `oportunidades/concursos`, keeps the examination in
`metadata.dates.eventStartsAt`, sets `deadline_date` to 2026-09-09 and derives
`expires_at` as `2026-09-10T02:59:59.999Z`. The post UUID, author, engagement,
cover and gallery remain unchanged.
