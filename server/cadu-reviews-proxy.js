// Admin-only same-origin proxy for the generic Cadu review center.
//
// Reads require a validated KinoCampus admin session. Resolutions also carry
// the existing short-lived HMAC assertion, so the cadu-api can attribute the
// decision to the authenticated administrator without exposing either
// server-side secret to the browser. Editorial approval never publishes.

import { requireCaduAdmin } from './cadu-auth.mjs';
import {
  buildCaduReviewSignatureHeaders,
  readLimitedSourceReviewResponse,
} from './cadu-source-reviews-proxy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ORIGINS = new Set(['pipeline', 'feed', 'sites', 'openclaw']);
const RESOLVED_STATES = new Set([
  'approved', 'rejected', 'changes_requested', 'deferred', 'acknowledged',
]);
const ITEM_STATES = new Set(['pending', ...RESOLVED_STATES]);
const QUERY_STATES = new Set([...ITEM_STATES, 'resolved']);
const DECISIONS = new Set(RESOLVED_STATES);
const KINDS = new Set(['pipeline_quality', 'pipeline_incident', 'feed_item']);
const REPASS_KINDS = new Set(['pipeline_quality', 'feed_item']);
const REPASS_HINTS = new Set(['publish_ready', 'review', 'reject', 'unknown']);
const REVIEW_CONTRACTS = new Map([
  [1, 'cadu-review-center-v1'],
  [2, 'cadu-review-center-v2'],
]);
const REVIEW_IDENTITY_VERSION = 'cadu-review-identity-v2';
const LEGACY_REVIEW_IDENTITY_VERSION = 'legacy-v1';
const IDENTITY_SCOPES = new Set([
  'record', 'aggregate_subject', 'content_unresolved', 'operational_run',
]);
const CARRY_POLICIES_BY_SCOPE = new Map([
  ['record', new Set(['stable_record'])],
  ['aggregate_subject', new Set(['subject_bound', 'no_automatic_carry'])],
  ['content_unresolved', new Set(['no_automatic_carry'])],
  ['operational_run', new Set(['version_bound'])],
]);
const REVIEW_LINK_POLICY = 'independent_version_bound';
const MAX_REVIEW_PROVENANCE = 20;
const LIST_QUERY_KEYS = new Set(['origin', 'state', 'search', 'limit', 'offset']);
const AUDIT_QUERY_KEYS = new Set(['origin', 'decision', 'limit', 'offset']);
const UNSAFE_TEXT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MAX_UPSTREAM_BODY = 4_000_000;
const MAX_UPSTREAM_ERROR_BODY = 64 * 1024;
const MAX_ITEM_SUMMARY = 12_000;
const MAX_ITEM_ARTIFACT = 240;
const MAX_AUDIT_TITLE = 300;
const MAX_RESOLUTION_NOTE = 1_000;
const SAFE_UPSTREAM_STATUSES = new Set([
  400, 401, 403, 404, 409, 412, 422, 429, 500, 502, 503, 504,
]);
const SAFE_UPSTREAM_ERRORS = new Map([
  ['404:review item not found', {
    code: 'CADU_REVIEW_NOT_FOUND',
    detail: 'O item de revisão não está mais disponível.',
  }],
  ['409:review item version changed', {
    code: 'CADU_REVIEW_VERSION_CHANGED',
    detail: 'A evidência mudou; atualize a fila antes de decidir.',
  }],
  ['409:review item was already resolved differently', {
    code: 'CADU_REVIEW_DECISION_CONFLICT',
    detail: 'Esta versão já foi resolvida com outra decisão.',
  }],
  ['422:decision is not allowed for this item', {
    code: 'CADU_REVIEW_DECISION_INVALID',
    detail: 'A decisão não é permitida para este tipo de item.',
  }],
  ['422:invalid resolution note', {
    code: 'CADU_REVIEW_NOTE_INVALID',
    detail: 'A observação da decisão é inválida.',
  }],
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function singleQueryValue(value) {
  if (Array.isArray(value) || (value !== undefined && typeof value !== 'string')) return null;
  return value;
}

function canonicalInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null;
}

function normalizedSearch(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || UNSAFE_TEXT_CONTROL.test(value)) return undefined;
  const search = value.normalize('NFKC').trim();
  if (Array.from(search).length > 100) return undefined;
  return search || null;
}

export function parseCentralReviewListQuery(query = {}) {
  if (!isPlainObject(query) || Object.keys(query).some((key) => !LIST_QUERY_KEYS.has(key))) {
    return null;
  }
  const origin = singleQueryValue(query.origin);
  const state = singleQueryValue(query.state);
  const search = normalizedSearch(singleQueryValue(query.search));
  const rawLimit = singleQueryValue(query.limit);
  const rawOffset = singleQueryValue(query.offset);
  if ([origin, state, rawLimit, rawOffset].includes(null) || search === undefined) return null;
  if (origin !== undefined && !ORIGINS.has(origin)) return null;
  if (state !== undefined && !QUERY_STATES.has(state)) return null;
  const limit = canonicalInteger(rawLimit, 25, 100);
  const offset = canonicalInteger(rawOffset, 0, 100_000);
  if (limit === null || limit < 1 || offset === null) return null;
  return {
    origin: origin ?? null,
    state: state ?? null,
    search,
    limit,
    offset,
  };
}

export function parseCentralReviewAuditQuery(query = {}) {
  if (!isPlainObject(query) || Object.keys(query).some((key) => !AUDIT_QUERY_KEYS.has(key))) {
    return null;
  }
  const origin = singleQueryValue(query.origin);
  const decision = singleQueryValue(query.decision);
  const rawLimit = singleQueryValue(query.limit);
  const rawOffset = singleQueryValue(query.offset);
  if ([origin, decision, rawLimit, rawOffset].includes(null)) return null;
  if (origin !== undefined && !ORIGINS.has(origin)) return null;
  if (decision !== undefined && !DECISIONS.has(decision)) return null;
  const limit = canonicalInteger(rawLimit, 50, 200);
  const offset = canonicalInteger(rawOffset, 0, 100_000);
  if (limit === null || limit < 1 || offset === null) return null;
  return {
    origin: origin ?? null,
    decision: decision ?? null,
    limit,
    offset,
  };
}

export function serializeCentralReviewResolution(body, pathReviewId) {
  if (!isPlainObject(body)) return null;
  const allowed = new Set([
    'review_id', 'expected_item_version', 'decision', 'resolution_note',
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  if (!UUID.test(pathReviewId || '')
      || body.review_id !== pathReviewId
      || !SHA256.test(body.expected_item_version || '')
      || !DECISIONS.has(body.decision)) {
    return null;
  }
  let note = null;
  if (body.resolution_note !== undefined && body.resolution_note !== null) {
    if (typeof body.resolution_note !== 'string') return null;
    note = body.resolution_note.normalize('NFKC').trim() || null;
    if (note !== null
        && (Array.from(note).length > MAX_RESOLUTION_NOTE || UNSAFE_TEXT_CONTROL.test(note))) {
      return null;
    }
  }
  if (['rejected', 'changes_requested'].includes(body.decision) && note === null) {
    return null;
  }
  return {
    reviewId: pathReviewId,
    payload: {
      expected_item_version: body.expected_item_version,
      decision: body.decision,
      resolution_note: note,
    },
  };
}

export function serializeCentralReviewRepass(body) {
  if (!isPlainObject(body)) return null;
  const allowed = new Set(['intent', 'run_id']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  if (body.intent !== undefined && body.intent !== 'repass') return null;
  let runId = null;
  if (body.run_id !== undefined && body.run_id !== null) {
    if (typeof body.run_id !== 'string' || !UUID.test(body.run_id)) return null;
    runId = body.run_id;
  }
  return { intent: 'repass', run_id: runId };
}

function caduApiBase(apiUrl) {
  const parsed = new URL(String(apiUrl || '').trim());
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
      || parsed.search || parsed.hash) {
    throw new TypeError('invalid Cadu API base URL');
  }
  return parsed.toString().replace(/\/+$/u, '');
}

export function buildCentralReviewTargetUrl(apiUrl, route) {
  const base = caduApiBase(apiUrl);
  if (route?.kind === 'list') {
    const target = new URL(`${base}/api/reviews`);
    for (const key of ['origin', 'state', 'search']) {
      if (route.query[key] !== null) target.searchParams.set(key, route.query[key]);
    }
    target.searchParams.set('limit', String(route.query.limit));
    target.searchParams.set('offset', String(route.query.offset));
    return target.toString();
  }
  if (route?.kind === 'audit') {
    const target = new URL(`${base}/api/reviews/audit`);
    for (const key of ['origin', 'decision']) {
      if (route.query[key] !== null) target.searchParams.set(key, route.query[key]);
    }
    target.searchParams.set('limit', String(route.query.limit));
    target.searchParams.set('offset', String(route.query.offset));
    return target.toString();
  }
  if (route?.kind === 'resolve' && UUID.test(route.reviewId || '')) {
    return `${base}/api/reviews/${encodeURIComponent(route.reviewId)}/resolve`;
  }
  if (route?.kind === 'repass') {
    return `${base}/api/reviews/repass`;
  }
  throw new TypeError('invalid Cadu review route');
}

function validHttpsUrl(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function reviewSchemaVersion(body) {
  if (!isPlainObject(body) || !Number.isSafeInteger(body.schema_version)) return null;
  const expectedContract = REVIEW_CONTRACTS.get(body.schema_version);
  return typeof expectedContract === 'string' && expectedContract === body.contract_version
    ? body.schema_version
    : null;
}

function hasUniqueValues(values) {
  return new Set(values).size === values.length;
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validReviewLinks(value, item) {
  const allowed = new Set([
    'evidence_count', 'item_ids', 'origins', 'kinds', 'decision_policy',
  ]);
  return isPlainObject(value)
    && hasOnlyKeys(value, allowed)
    && Number.isSafeInteger(value.evidence_count)
    && value.evidence_count >= 2
    && Array.isArray(value.item_ids)
    && value.item_ids.length >= 1
    && value.item_ids.length <= MAX_REVIEW_PROVENANCE
    && value.item_ids.length <= value.evidence_count
    && value.item_ids.every((entry) => UUID.test(entry || ''))
    && hasUniqueValues(value.item_ids)
    && Array.isArray(value.origins)
    && value.origins.length >= 1
    && value.origins.length <= ORIGINS.size
    && value.origins.every((entry) => ORIGINS.has(entry))
    && hasUniqueValues(value.origins)
    && value.origins.includes(item.origin)
    && Array.isArray(value.kinds)
    && value.kinds.length >= 1
    && value.kinds.length <= KINDS.size
    && value.kinds.every((entry) => KINDS.has(entry))
    && hasUniqueValues(value.kinds)
    && value.kinds.includes(item.kind)
    && value.decision_policy === REVIEW_LINK_POLICY;
}

function validReviewCluster(value, item) {
  const allowed = new Set([
    'occurrence_count', 'version_count', 'item_versions', 'first_seen_at',
    'last_seen_at', 'run_ids', 'artifacts', 'provenance_truncated',
  ]);
  if (!isPlainObject(value)
      || !hasOnlyKeys(value, allowed)
      || !Number.isSafeInteger(value.occurrence_count)
      || value.occurrence_count < 1
      || value.occurrence_count !== item.occurrence_count
      || !Number.isSafeInteger(value.version_count)
      || value.version_count < 1
      || value.version_count > value.occurrence_count
      || !Array.isArray(value.item_versions)
      || value.item_versions.length < 1
      || value.item_versions.length > MAX_REVIEW_PROVENANCE
      || value.item_versions.length > value.version_count
      || !value.item_versions.every((entry) => SHA256.test(entry || ''))
      || !hasUniqueValues(value.item_versions)
      || !value.item_versions.includes(item.item_version)
      || !Number.isSafeInteger(value.first_seen_at) || value.first_seen_at <= 0
      || !Number.isSafeInteger(value.last_seen_at)
      || value.last_seen_at < value.first_seen_at
      || value.first_seen_at !== item.first_seen_at
      || value.last_seen_at !== item.last_seen_at
      || item.created_at < value.first_seen_at
      || item.created_at > value.last_seen_at
      || !Array.isArray(value.run_ids)
      || value.run_ids.length > MAX_REVIEW_PROVENANCE
      || !value.run_ids.every((entry) => UUID.test(entry || ''))
      || !hasUniqueValues(value.run_ids)
      || !Array.isArray(value.artifacts)
      || value.artifacts.length > MAX_REVIEW_PROVENANCE
      || !value.artifacts.every((entry) => (
        typeof entry === 'string'
        && entry.length >= 1
        && entry.length <= MAX_ITEM_ARTIFACT
        && !UNSAFE_TEXT_CONTROL.test(entry)
      ))
      || !hasUniqueValues(value.artifacts)
      || typeof value.provenance_truncated !== 'boolean') {
    return false;
  }
  if (!value.provenance_truncated
      && value.version_count !== value.item_versions.length) return false;
  if (item.run_id !== null && !value.run_ids.includes(item.run_id)) return false;
  if (item.artifact !== null && !value.artifacts.includes(item.artifact)) return false;
  return true;
}

function validV2ReviewItem(item) {
  const metadata = item.metadata;
  const scope = metadata.identity_scope;
  const carryPolicy = metadata.carry_policy;
  const policies = CARRY_POLICIES_BY_SCOPE.get(scope);
  if (item.review_identity_version !== REVIEW_IDENTITY_VERSION
      || !SHA256.test(item.review_key || '')
      || !Number.isSafeInteger(item.occurrence_count)
      || item.occurrence_count < 1
      || !Number.isSafeInteger(item.first_seen_at) || item.first_seen_at <= 0
      || !Number.isSafeInteger(item.last_seen_at)
      || item.last_seen_at < item.first_seen_at
      || !IDENTITY_SCOPES.has(scope)
      || !policies || !policies.has(carryPolicy)
      || Object.prototype.hasOwnProperty.call(metadata, 'source_identity')
      || !validReviewCluster(metadata.review_cluster, item)) {
    return false;
  }
  if (item.kind === 'pipeline_incident') {
    if (scope !== 'operational_run' || carryPolicy !== 'version_bound') return false;
  } else if (scope === 'operational_run') {
    return false;
  }
  if (item.origin === 'feed' && !SHA256.test(metadata.source_revision || '')) return false;
  if (Object.prototype.hasOwnProperty.call(metadata, 'source_revision')
      && !SHA256.test(metadata.source_revision || '')) return false;
  if (Object.prototype.hasOwnProperty.call(metadata, 'review_links')
      && !validReviewLinks(metadata.review_links, item)) return false;
  return true;
}

function validReviewItem(item, schemaVersion) {
  if (!isPlainObject(item)
      || !UUID.test(item.id || '')
      || !SHA256.test(item.item_version || '')
      || !ORIGINS.has(item.origin)
      || !KINDS.has(item.kind)
      || typeof item.title !== 'string' || !item.title || item.title.length > 300
      || !ITEM_STATES.has(item.state)
      || !Number.isSafeInteger(item.created_at) || item.created_at < 0
      || !validHttpsUrl(item.source_url)
      || !validHttpsUrl(item.action_url)
      || !validHttpsUrl(item.image_url)
      || !Array.isArray(item.issues)
      || !item.issues.every((value) => typeof value === 'string' && value.length <= 100)
      || !Array.isArray(item.allowed_decisions)
      || !item.allowed_decisions.every((value) => DECISIONS.has(value))
      || !isPlainObject(item.metadata)) {
    return false;
  }
  if (item.summary !== null
      && (typeof item.summary !== 'string'
        || item.summary.length > MAX_ITEM_SUMMARY
        || UNSAFE_TEXT_CONTROL.test(item.summary))) return false;
  if (item.run_id !== null && !UUID.test(item.run_id || '')) return false;
  if (item.artifact !== null
      && (typeof item.artifact !== 'string'
        || item.artifact.length > MAX_ITEM_ARTIFACT
        || UNSAFE_TEXT_CONTROL.test(item.artifact))) return false;
  if (item.state === 'pending') {
    if (item.resolution !== null) return false;
  } else {
    if (!isPlainObject(item.resolution)
      || item.resolution.decision !== item.state
      || !UUID.test(item.resolution.resolved_by || '')
      || !Number.isSafeInteger(item.resolution.resolved_at)) {
      return false;
    }
  }
  if (!validRepass(item.repass, item, schemaVersion)) return false;
  return schemaVersion === 1 || (schemaVersion === 2 && validV2ReviewItem(item));
}

function validRepass(value, item, schemaVersion) {
  if (value === null || value === undefined) return true;
  if (!isPlainObject(value)
      || !UUID.test(value.run_id || '')
      || !SHA256.test(value.item_version || '')
      || value.item_version !== item.item_version
      || !ORIGINS.has(value.origin)
      || value.origin !== item.origin
      || !REPASS_KINDS.has(value.kind)
      || value.kind !== item.kind
      || !Number.isSafeInteger(value.created_at) || value.created_at <= 0
      || typeof value.score !== 'number' || !Number.isFinite(value.score)
      || value.score < 0 || value.score > 1
      || (value.previous_score !== null
        && (typeof value.previous_score !== 'number'
          || !Number.isFinite(value.previous_score)
          || value.previous_score < 0
          || value.previous_score > 1))
      || (value.delta !== null
        && (typeof value.delta !== 'number' || !Number.isFinite(value.delta)))
      || !REPASS_HINTS.has(value.decision_hint)
      || !Array.isArray(value.reasons)
      || !value.reasons.every((reason) => (
        typeof reason === 'string' && reason.length <= 180
      ))
      || !isPlainObject(value.evidence)) {
    return false;
  }
  if ((value.previous_score === null) !== (value.delta === null)) return false;
  if (value.previous_score !== null
      && Math.abs(value.delta - (value.score - value.previous_score)) > 0.000001) {
    return false;
  }
  if (schemaVersion === 2) {
    const expectedPrevious = item.metadata.score;
    if (expectedPrevious === null || expectedPrevious === undefined) {
      if (value.previous_score !== null) return false;
    } else if (typeof expectedPrevious !== 'number'
        || !Number.isFinite(expectedPrevious)
        || expectedPrevious < 0 || expectedPrevious > 1
        || value.previous_score === null
        || Math.abs(value.previous_score - expectedPrevious) > 0.000001) {
      return false;
    }
  }
  return true;
}

function validProvider(provider) {
  return isPlainObject(provider)
    && ORIGINS.has(provider.id)
    && typeof provider.label === 'string'
    && typeof provider.description === 'string'
    && ['central', 'institutional'].includes(provider.queue)
    && Number.isSafeInteger(provider.pending) && provider.pending >= 0
    && Number.isSafeInteger(provider.resolved) && provider.resolved >= 0;
}

function validV2Diagnostics(diagnostics) {
  const projection = diagnostics.projection;
  const allowed = new Set([
    'raw_items', 'unique_items', 'collapsed_occurrences',
    'linked_evidence_groups', 'linked_evidence_items', 'identity_version',
    'legacy_resolution_policy',
  ]);
  return isPlainObject(projection)
    && hasOnlyKeys(projection, allowed)
    && Number.isSafeInteger(projection.raw_items) && projection.raw_items >= 0
    && Number.isSafeInteger(projection.unique_items) && projection.unique_items >= 0
    && projection.unique_items <= projection.raw_items
    && Number.isSafeInteger(projection.collapsed_occurrences)
    && projection.collapsed_occurrences === projection.raw_items - projection.unique_items
    && Number.isSafeInteger(projection.linked_evidence_groups)
    && projection.linked_evidence_groups >= 0
    && Number.isSafeInteger(projection.linked_evidence_items)
    && projection.linked_evidence_items >= projection.linked_evidence_groups * 2
    && (projection.linked_evidence_groups > 0 || projection.linked_evidence_items === 0)
    && projection.identity_version === REVIEW_IDENTITY_VERSION
    && projection.legacy_resolution_policy === 'audit_only_no_automatic_carry';
}

function validateListResponse(body, query) {
  const schemaVersion = reviewSchemaVersion(body);
  if (schemaVersion === null
      || !Array.isArray(body.items)
      || body.items.length > query.limit
      || !body.items.every((item) => validReviewItem(item, schemaVersion))
      || !Number.isSafeInteger(body.total) || body.total < 0
      || (body.items.length > 0 && body.total < query.offset + body.items.length)
      || body.limit !== query.limit || body.offset !== query.offset
      || typeof body.has_more !== 'boolean'
      || body.has_more !== (query.offset + body.items.length < body.total)
      || !Array.isArray(body.providers) || !body.providers.every(validProvider)
      || !isPlainObject(body.diagnostics)
      || (schemaVersion === 2 && !validV2Diagnostics(body.diagnostics))
      || !Number.isSafeInteger(body.generated_at)) {
    return null;
  }
  if (query.origin !== null
      && !body.items.every((item) => item.origin === query.origin)) return null;
  if (query.state === 'resolved'
      && !body.items.every((item) => RESOLVED_STATES.has(item.state))) return null;
  if (query.state !== null && query.state !== 'resolved'
      && !body.items.every((item) => item.state === query.state)) return null;
  return body;
}

function validAuditItem(item, schemaVersion) {
  const commonValid = isPlainObject(item)
    && UUID.test(item.id || '')
    && UUID.test(item.item_id || '')
    && SHA256.test(item.item_version || '')
    && ORIGINS.has(item.origin)
    && typeof item.kind === 'string'
    && DECISIONS.has(item.decision)
    && UUID.test(item.resolved_by || '')
    && Number.isSafeInteger(item.resolved_at)
    && (item.resolution_note === null
      || (typeof item.resolution_note === 'string'
        && item.resolution_note.length <= MAX_RESOLUTION_NOTE
        && !UNSAFE_TEXT_CONTROL.test(item.resolution_note)))
    && (item.title === null
      || (typeof item.title === 'string'
        && item.title.length <= MAX_AUDIT_TITLE
        && !UNSAFE_TEXT_CONTROL.test(item.title)))
    && (item.run_id === null || UUID.test(item.run_id || ''))
    && validHttpsUrl(item.source_url);
  if (!commonValid) return false;
  if (schemaVersion === 1) return true;
  if (schemaVersion !== 2) return false;
  if (item.review_identity_version === REVIEW_IDENTITY_VERSION) {
    return SHA256.test(item.review_key || '');
  }
  return item.review_identity_version === LEGACY_REVIEW_IDENTITY_VERSION
    && item.review_key === null;
}

function validateAuditResponse(body, query) {
  const schemaVersion = reviewSchemaVersion(body);
  if (schemaVersion === null
      || !Array.isArray(body.items)
      || body.items.length > query.limit
      || !body.items.every((item) => validAuditItem(item, schemaVersion))
      || !Number.isSafeInteger(body.total) || body.total < 0
      || (body.items.length > 0 && body.total < query.offset + body.items.length)
      || body.limit !== query.limit || body.offset !== query.offset
      || typeof body.has_more !== 'boolean'
      || body.has_more !== (query.offset + body.items.length < body.total)
      || !Number.isSafeInteger(body.generated_at)) {
    return null;
  }
  if (query.origin !== null
      && !body.items.every((item) => item.origin === query.origin)) return null;
  if (query.decision !== null
      && !body.items.every((item) => item.decision === query.decision)) return null;
  return body;
}

function validateResolutionResponse(body, resolution, adminId) {
  return isPlainObject(body)
    && body.ok === true
    && body.published === false
    && body.decision_effect === 'editorial_record_only'
    && UUID.test(body.id || '')
    && body.item_id === resolution.reviewId
    && body.item_version === resolution.payload.expected_item_version
    && body.decision === resolution.payload.decision
    && body.resolution_note === resolution.payload.resolution_note
    && UUID.test(body.resolved_by || '')
    && Number.isSafeInteger(body.resolved_at)
    && typeof body.replayed === 'boolean'
    && (body.replayed || body.resolved_by === adminId)
    ? body
    : null;
}

function validateRepassResponse(body, adminId) {
  const structurallyValid = isPlainObject(body)
    && UUID.test(body.run_id || '')
    && Number.isSafeInteger(body.evaluated) && body.evaluated >= 0
    && Number.isSafeInteger(body.entries) && body.entries >= 0
    && Number.isSafeInteger(body.errors) && body.errors >= 0
    && Number.isSafeInteger(body.with_previous_score) && body.with_previous_score >= 0
    && Number.isSafeInteger(body.increased) && body.increased >= 0
    && Number.isSafeInteger(body.decreased) && body.decreased >= 0
    && Number.isSafeInteger(body.stable) && body.stable >= 0
    && Number.isSafeInteger(body.publish_ready) && body.publish_ready >= 0
    && Number.isSafeInteger(body.review) && body.review >= 0
    && Number.isSafeInteger(body.rejected) && body.rejected >= 0
    && Number.isSafeInteger(body.started_at) && body.started_at > 0
    && Number.isSafeInteger(body.finished_at) && body.finished_at > 0
    && ['manual', 'pipeline_post_run'].includes(body.trigger)
    && UUID.test(body.requested_by || '')
    && body.requested_by === adminId;
  if (!structurallyValid
      || body.evaluated !== body.entries + body.errors
      || body.with_previous_score > body.entries
      || body.increased + body.decreased + body.stable !== body.with_previous_score
      || body.publish_ready + body.review + body.rejected > body.entries
      || body.finished_at < body.started_at) return null;
  return body;
}

function configureResponse(res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendError(res, status, error, detail = null) {
  const payload = { error };
  if (detail) Object.assign(payload, detail);
  return res.status(status).json(payload);
}

function sanitizedAuthResponse(res) {
  let statusCode = 502;
  return {
    status(value) {
      statusCode = Number.isInteger(value) && value >= 400 && value <= 599 ? value : 502;
      return this;
    },
    json(payload) {
      const error = payload && typeof payload.error === 'string'
        && /^[a-z0-9_]{1,64}$/u.test(payload.error)
        ? payload.error
        : 'admin_auth_failed';
      return res.status(statusCode).json({ error });
    },
  };
}

function safeStatus(value) {
  return SAFE_UPSTREAM_STATUSES.has(value) ? value : 502;
}

function allowlistedUpstreamDetail(status, body) {
  const detail = isPlainObject(body) ? body.detail : null;
  return typeof detail === 'string'
    ? SAFE_UPSTREAM_ERRORS.get(`${status}:${detail}`) || null
    : null;
}

function reviewRoute(method, path, query, body) {
  if (method === 'GET' && path === 'reviews') {
    const parsed = parseCentralReviewListQuery(query);
    return parsed ? { kind: 'list', query: parsed } : null;
  }
  if (method === 'GET' && path === 'reviews/audit') {
    const parsed = parseCentralReviewAuditQuery(query);
    return parsed ? { kind: 'audit', query: parsed } : null;
  }
  if (method === 'POST' && path === 'reviews/repass') {
    const payload = serializeCentralReviewRepass(body);
    return payload ? { kind: 'repass', payload } : null;
  }
  const match = method === 'POST'
    ? /^reviews\/([0-9a-f-]{36})\/resolve$/u.exec(path)
    : null;
  if (!match || !UUID.test(match[1])) return null;
  const resolution = serializeCentralReviewResolution(body, match[1]);
  return resolution
    ? { kind: 'resolve', reviewId: match[1], resolution }
    : null;
}

export async function handleCaduReviews(req, res, options = {}) {
  configureResponse(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendError(res, 405, 'method_not_allowed');
  }

  let admin;
  try {
    admin = await requireCaduAdmin(req, sanitizedAuthResponse(res));
  } catch {
    return sendError(res, 502, 'admin_auth_unreachable');
  }
  if (!admin) return undefined;
  if (!UUID.test(admin.id || '')) return sendError(res, 502, 'invalid_admin_identity');

  const route = reviewRoute(
    req.method,
    String(options.path || ''),
    options.query || {},
    req.body,
  );
  if (!route) {
    return sendError(
      res,
      req.method === 'POST' ? 422 : 400,
      req.method === 'POST' ? 'invalid_cadu_review_resolution' : 'invalid_cadu_review_filters',
    );
  }

  const apiUrl = typeof process.env.CADU_API_URL === 'string'
    ? process.env.CADU_API_URL.trim()
    : '';
  const token = typeof process.env.CADU_API_TOKEN === 'string'
    ? process.env.CADU_API_TOKEN.trim()
    : '';
  if (!apiUrl || !token) return sendError(res, 503, 'cadu_api_not_configured');

  let targetUrl;
  try {
    targetUrl = buildCentralReviewTargetUrl(apiUrl, route);
  } catch {
    return sendError(res, 503, 'cadu_api_not_configured');
  }

  const upstreamBody = route.kind === 'resolve'
    ? JSON.stringify(route.resolution.payload)
    : route.kind === 'repass'
      ? JSON.stringify(route.payload)
      : undefined;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': 'KinoCampus-Admin/2.0',
  };
  if (route.kind === 'resolve' || route.kind === 'repass') {
    headers['Content-Type'] = 'application/json';
    try {
      Object.assign(headers, buildCaduReviewSignatureHeaders({
        signingSecret: process.env.CADU_REVIEW_SIGNING_SECRET,
        apiToken: token,
        adminId: admin.id,
        method: 'POST',
        targetUrl,
        body: upstreamBody,
      }));
    } catch {
      return sendError(res, 503, 'cadu_review_signing_not_configured');
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: upstreamBody,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(route.kind === 'repass' ? 420000 : 12000),
    });
    const text = await readLimitedSourceReviewResponse(
      upstream,
      upstream.ok ? MAX_UPSTREAM_BODY : MAX_UPSTREAM_ERROR_BODY,
    );
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!upstream.ok) {
      const status = safeStatus(upstream.status);
      return sendError(
        res,
        status,
        'cadu_api_error',
        allowlistedUpstreamDetail(status, body),
      );
    }
    const validated = route.kind === 'list'
      ? validateListResponse(body, route.query)
      : route.kind === 'audit'
        ? validateAuditResponse(body, route.query)
        : route.kind === 'resolve'
          ? validateResolutionResponse(body, route.resolution, admin.id)
          : validateRepassResponse(body, admin.id);
    if (!validated) return sendError(res, 502, 'invalid_cadu_api_response');
    return res.status(200).json(validated);
  } catch {
    return sendError(res, 502, 'cadu_api_unreachable');
  }
}

export default handleCaduReviews;
