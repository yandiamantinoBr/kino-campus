# Erasure coverage matrix (issue #753)

This matrix maps every "behavioral" or "linkable" data source in the KinoCampus platform to its actual treatment under `kc-account-erasure`. The intent is to make explicit which tables are deleted, set null, kept under a redacted projection, or kept as-is — so the privacy engineering team can spot gaps before a production erasure.

## Legend

- **deleted** — `kc-account-erasure` removes the row entirely (the titular's identity is gone, no tombstone).
- **set null** — the row remains but the `*_user_id` / `*_actor_id` / `*_changed_by` column is `NULL`.
- **redacted** — the row remains, but the FK + identifying string fields are replaced with an opaque token (e.g. `blocked_subject_hash`, pseudonymized audit IDs).
- **preserved** — the row remains untouched because it is co-authored (e.g. messages from third parties) or required for legal/operational retention. No PII identifying the titular.
- **cascade** — Postgres `ON DELETE CASCADE` removes the row when the profile/auth row is gone. The migration author assumes this is correct; coverage is implicit.

## Per-table matrix

| Table | Treatment | Source of truth | Notes |
| --- | --- | --- | --- |
| `post_view_events` | **deleted** (by `*_user_id` / `*_session_id`) | `account-erasure-runbook.md` §9 | Listed under "Dados comportamentais/linkáveis são eliminados antes do Auth delete". |
| `search_queries` | **deleted** (by `user_id`) | `account-erasure-runbook.md` §9 | Same list. |
| `home_category_affinity` | **deleted** (by `user_id`) | `account-erasure-runbook.md` §9 | Same list. |
| `search_preferences` | **deleted** (by `user_id`) | `account-erasure-runbook.md` §9 | Same list. |
| `privacy_analytics_events` | **deleted** (by `user_id`) | `account-erasure-runbook.md` §9 | Same list. |
| `privacy_consent_events` | **deleted** (by `user_id`) | `account-erasure-runbook.md` §9 | Same list. |
| `user_legal_acceptances` | **deleted** (cascade from profile) | `account-erasure-runbook.md` §9 "verificado após o cascade do perfil" | `user_legal_acceptances.user_id` is the only FK; cascade should fire. |
| `comment_likes` | **deleted** (by `user_id`); `set null` on `comment_id` if CASCADE is configured on the parent `comments` tombstone | `account-erasure-runbook.md` §9 "comentários preservam thread/curtidas, mas perdem autoria" | Likes BY the titular are removed. Likes on the titular's comments remain attributed to the post. |
| `chat_reactions` | **deleted** (by `user_id`); co-authored reactions on the titular's messages remain with `null user_id` | `account-erasure-runbook.md` §9 "reações e leitura do titular são removidas" | Reactions BY the titular are removed. Reactions on the titular's messages stay (other users' reactions). |
| `chat_messages` (own) | **redacted** (body + media → tombstone) | `account-erasure-runbook.md` §9 "mensagens próprias preservam cronologia com conteúdo, mídia e envelope nulos" | Chat-preserving: structure preserved, PII nulled. |
| `chat_messages` (peer) | **preserved** (untouched) | `account-erasure-runbook.md` §9 "mensagens de terceiros permanecem" | The co-author's expression is protected. |
| `notifications_outbox` | **redacted** (encrypted) | `account-erasure-runbook.md` §9 "notificações, canais, outbox e tentativas" + `kc_private.account_erasure_completion_outbox` | Outbox rows are encrypted with an AAD bound to the workflow + DSR. |
| `search_console_searches` (audit) | **redacted** (audit identifier redaction) | `kc_redact_account_audit_identifiers(uuid)` | UUIDs in `audit_log.payload` / `ad_campaign_audit.snapshot` / `hero_banner_audit.snapshot` are replaced when they exactly equal the titular. |
| `user_blocks` (created by the titular) | **redacted** (FK → `set null`, `blocked_subject_hash` preserves identity) | `20260728183022_data_subject_requests_and_export.sql` lines 1802-1824 | `blocker_id` remains (the row is from the titular's POV); `blocked_id` becomes `null`; `blocked_subject_hash` keeps the block list intact. |
| `user_blocks` (created against the titular) | **redacted** (FK → `set null`, `blocked_subject_hash` preserves identity) | Same migration | `blocked_id` becomes `null`; `blocker_id` remains; `blocked_subject_hash` keeps the security record. |
| `content_ratings` (created by the titular) | **deleted** (by `user_id`) | `account-erasure-runbook.md` §9 "buscas, afinidade, preferências, analytics, consentimentos e aceites" + ratings row check | Ratings BY the titular are removed. |
| `content_ratings` (received by the titular) | **redacted** (FK `target_user_id` → `set null`) | `20260728183022_data_subject_requests_and_export.sql` line 1797 | Ratings FOR the titular are kept as anonymized statistics. |
| `antifraud_events` | **redacted** (audit identifier redaction) | `kc_redact_account_audit_identifiers(uuid)` | Audit-trail events: actor UUID redacted, structure preserved. |
| `user_invites` (created by the titular) | **set null** (FK `invited_by` → `set null`) + raw email redacted | `account-erasure-runbook.md` §9 + `20260728183022` | `raw_email` is purged; `invited_by` becomes `null` to orphan the row. |
| `kc_unit_meta` (Cadu) | **preserved** (UUID redacted in references, but the table itself is operational metadata, not PII) | `account-erasure-runbook.md` §9 "CADU e `kc_unit_meta` permanecem sem o UUID apagado" | Cadu operational rows do not store the titular UUID directly. |
| `comments` (created by the titular) | **redacted** (body tombstone, author `set null`) | `account-erasure-runbook.md` §9 "comentários preservam thread/curtidas, mas perdem autoria" | Chat-preserving: thread continues, attribution goes away. |
| `comments` (received by the titular, on titular's posts) | **preserved** (peer authorship, no PII to redact) | `account-erasure-runbook.md` §9 | Other people's comments on the titular's posts remain intact. |
| `posts` | **redacted** (tombstone, location + media nulled) | `account-erasure-runbook.md` §9 "posts viram tombstones sem texto, localização ou mídia pessoal" | Post body is nulled, location is nulled, media is unlinked. |
| `votes` | **set null** (FK `user_id` → `set null`) | `account-erasure-runbook.md` §9 "votos, salvos, denúncias e visualizações" | Votes BY the titular are kept as anonymized count. |
| `saved_posts` | **deleted** (by `user_id`) | `account-erasure-runbook.md` §9 | Saved items are personal. |
| `reports` (created by the titular) | **redacted** (author + details nulled) | `account-erasure-runbook.md` §9 "denúncias preservam motivo/alvo/status, mas limpam `details` e autoria" | Reason/target/status stay so the moderation record is intact. |
| `reports` (against the titular) | **preserved** | Same | Moderation record against the titular remains. |

## Tables NOT covered above (and why)

- `auth.users`, `auth.identities` — handled directly by `auth.admin.deleteUser(id)` (PG cascade + storage cleanup).
- `storage.objects` — handled by `kc_redact_storage_objects(uuid)` (post + avatar + chat media buckets).
- `chat_conversations` — chat-preserving: structure preserved, all `user_id` columns become `null` (`account-erasure-runbook.md` §16).
- `chat_participants` — same: rows kept with `null user_id` so the co-author's record is intact.

## Open followups (will be tracked in `PR-747-followups.md`)

- [ ] **Test:** add a Jest + DB integration that runs `kc-account-erasure` against a seeded user and asserts that EVERY table in this matrix has the expected row count after the call.
- [ ] **Test:** add a check that `kc_redact_account_audit_identifiers(uuid)` is idempotent and never re-randomizes a pseudonym already applied.
- [ ] **Doc:** when a new table is added to the schema, the `ERASURE_COVERAGE_MATRIX` must be updated in the same PR. Add a CI lint that greps for new tables and fails if no matrix entry exists.
