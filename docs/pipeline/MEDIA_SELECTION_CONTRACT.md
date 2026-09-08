# Canonical removal of duplicate media associations

`cadu-edit-media-selection-v1` is an explicit operation on an existing Cadu post. It removes only associations whose complete downloaded bytes have the same SHA-256 as a retained association. It does not publish, reclassify, change price/text/dates, infer source identity, choose a different cover, or change retained ordering.

The action is served by the existing authenticated `cadu-publish` Edge Function. JWT validation, active-session validation and trusted-publisher allowlisting run before routing. This operation additionally requires the canonical Cadu UUID and ownership. The RPC is `SECURITY INVOKER`, service-role-only, with a second canonical-actor/allowlist/ownership check.

## Request

The top-level object has exactly `action: "edit"`, `postId`, and `mediaCorrection`. A deduplication object has exactly:

- `contract: "cadu-edit-media-selection-v1"`;
- `operation: "deduplicate"` and a fresh UUID `operationId`;
- `expected`: all 15 canonical post fields, including complete metadata and timestamps with microseconds;
- `expectedRows`: every current association, each with `id`, `post_id`, `url`, `is_cover`, `sort_order`, `created_at`;
- `pairs`: one to three `{removeId, keepId, sha256}` objects, with full lowercase 64-digit digests;
- a specific `reason` of 12–1,000 characters.

`item`, `score`, arbitrary patches, new URLs/IDs and combined edit actions are rejected. Every retained row keeps its complete identity, original cover flag and original numeric order, including ties and gaps. A removed ID cannot also be a retained proof ID. The cover cannot be removed.

The column `image_url`, existing cover aliases and render target must agree with the existing cover. Conflicting legacy values are refused for a separate repair. Only existing gallery arrays are filtered by the exact removed URLs; an existing accurate `gallery_count` is adjusted. All other metadata, including user tags, source binding, revision, editorial history, cover aliases and render URL, stays unchanged. Missing gallery keys are not invented.

## Full-byte verification

Before dispatch, the Edge downloads the two existing URLs for each pair, computes SHA-256 from the complete body and requires both hashes to match the reviewed digest and byte length. It permits only existing HTTPS objects on the official `files.cercomp.ufg.br` host or this project's public Cadu Storage prefix. It refuses redirects, credentials, nonstandard ports, fragments, missing/unsupported raster content, partial/oversized bodies and changed digests.

Limits are three pairs, six unique downloads, two concurrent downloads, 4 MiB per object and an 8-second timeout per download. The operation-local cache avoids downloading a retained object twice. Both downloads settle before a failed pair exits. No model call, Storage upload, object overwrite or Storage deletion occurs.

The reused Edge remote-resource helper validates public DNS but the native runtime fetch is not DNS-pinned. Hostnames are restricted to the two trusted origins above; this contract does not introduce a general untrusted-URL fetch. A proof observes external bytes at that time; it cannot guarantee that an external URL will never change later. PNG/JPEG dimensions are checked by the existing raster helper; other formats fail closed in this initial scope.

## Database and receipt

Deploy the new `cadu_post_media_selection_cas` migration before exposing the Edge action. The new RPC accepts `p_post_id`, `p_actor_id`, `p_request`, and `p_verified_pairs`; **it has no free `p_update` argument**. SHA evidence is verified by the Edge; clients cannot call this service-role-only RPC directly.

The transaction locks the parent before its media, checks the exact 15-field snapshot and complete 6-field association set, and derives the permitted changes from the locked current row. Existing publisher, append and editorial-integrity RPC contracts are unchanged. No validity axis is rewritten; an expired post cannot gain a new deadline through this operation.

`metadata.cadu_media_selection_history` is append-only, capped at 12 entries and bounded in size. Each entry contains complete before/after content and media, verified pairs, request hash, content hashes, reason and audit ID. Hashes use PostgreSQL's canonical JSONB text and SHA-256. A durable audit row also binds the complete entry hash, preventing forged metadata history from authorizing rollback.

After post/media mutations **and audit insertion**, the function rereads the full post, all media and the audit row. Any trigger drift outside the permitted metadata delta, any changed retained row, or a missing/changed audit receipt raises an exception and rolls back the transaction. It does not trust `UPDATE RETURNING` as final state. The Edge checks the returned post, complete history prefix, proof and media against its deterministic plan.

A repeated identical `operationId` and request returns the last durable receipt without a new write, only while its exact resulting content/media and audit binding remain intact. Changed input or later drift is a conflict. A transport exception, missing/malformed receipt or post-dispatch error returns an uncertain result; reread the post, gallery and history before deciding whether to retry. Do not generate a new operation ID to escape an uncertain result.

Rollback has `operation: "rollback"`, a fresh `operationId`, `expected`, `expectedRows`, `reason`, and `rollbackOf` instead of `pairs`. It restores only the last audited deduplication, after exact content/media verification, and appends its own receipt. Original IDs, URLs, cover flags, order and creation timestamps are restored; Storage objects are retained throughout.

If time passes beyond the unchanged `expires_at`, rollback may restore the associations while leaving that same past expiry, status, visibility and all temporal metadata intact. It does not reactivate the post. If a lifecycle process has changed any stored content since the audited operation, exact-state verification rejects rollback and requires separate reconciliation. No existing no-reactivation rule is relaxed.

## Local validation

```text
deno test --allow-env --allow-read --no-lock --cached-only --node-modules-dir=auto supabase/functions/cadu-publish
node scripts/test-cadu-post-media-selection.js --local
```

The PostgreSQL runner is fixed to the disposable `cadu_integrity_cas_20260908` database in the local `supabase_db_kino-campus` Docker container and the local Docker socket. It refuses invocation without `--local`. Its synthetic proof objects test the trusted SQL boundary, not real source-image evidence. The successful, replay and rollback receipts are passed back through the actual Edge verifier. Tests cover stale state, identity/cover/score/patch rejection, history forgery, concurrent workers, lock waits and trigger/audit atomicity.

Production snapshots, public-image downloads and operation drafts belong to unversioned evidence directories. A deployment alone does not execute a repair or prove public visual correctness.
