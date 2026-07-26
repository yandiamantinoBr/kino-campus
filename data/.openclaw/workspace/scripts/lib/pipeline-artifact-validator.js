#!/usr/bin/env node
'use strict';

/**
 * Read-only validator for the persisted artifacts consumed by pipeline-kino.
 *
 * This module deliberately delegates contract hashes and item reconciliation to
 * pipeline-kino.js.  In particular, contract content hashes are therefore
 * computed with JavaScript's JSON.stringify number formatting, exactly as they
 * are when the artifacts are produced.  The surrounding file reader adds the
 * safety properties that a long-lived Python API cannot reproduce reliably:
 * bounded reads, final-component no-follow, regular-file checks and a stable
 * before/after inode snapshot.
 *
 * CLI contract (all paths must be absolute and are never discovered):
 *
 *   --operation=curator
 *     --curator=PATH --run-id=UUID --mode=MODE --date-brt=YYYY-MM-DD
 *     --started-at-ms=EPOCH_MS
 *
 *   --operation=truly-new
 *     (all curator arguments) --truly-new=PATH
 *
 *   --operation=formatted
 *     (all truly-new arguments) --formatted=PATH
 *
 * stdout is exactly one compact JSON receipt. Exit 0 means valid, exit 1 means
 * an artifact/lineage failure and exit 2 means an invalid invocation.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');

const pipeline = require('../pipeline-kino.js');
const { URL_IDENTITY_VERSION } = require('./canonical-url.js');

const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_RECEIPT_ISSUES = 64;
const MAX_RECEIPT_ISSUE_LENGTH = 240;
const CURATOR_VERSION = '4.4';
const CURATOR_MODES = new Set(['daily', 'full', 'quick']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OPERATIONS = new Set(['curator', 'truly-new', 'formatted']);
const ALLOWED_OPTIONS = new Set([
  'operation',
  'curator',
  'truly-new',
  'formatted',
  'run-id',
  'mode',
  'date-brt',
  'started-at-ms',
]);

class ArtifactValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ArtifactValidationError';
    this.code = code;
  }
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), 'utf8'));
}

function issue(code) {
  throw new ArtifactValidationError(code);
}

function snapshotValue(snapshot, key) {
  const value = snapshot[key];
  return typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
}

function sameIdentity(left, right) {
  return snapshotValue(left, 'dev') === snapshotValue(right, 'dev')
    && snapshotValue(left, 'ino') === snapshotValue(right, 'ino');
}

function sameSnapshot(left, right) {
  return sameIdentity(left, right)
    && snapshotValue(left, 'size') === snapshotValue(right, 'size')
    && snapshotValue(left, 'mtimeNs') === snapshotValue(right, 'mtimeNs')
    && snapshotValue(left, 'ctimeNs') === snapshotValue(right, 'ctimeNs');
}

function safeLstat(filePath) {
  try {
    return fs.lstatSync(filePath, { bigint: true });
  } catch (_) {
    issue('open_failed');
  }
}

/**
 * Read one explicitly named file from a stable descriptor.
 *
 * O_NOFOLLOW is used wherever Node exposes it. Windows does not expose that
 * flag, so the pre-open lstat is compared to the opened descriptor before any
 * bytes are read; a symlink or replacement race cannot pass that comparison.
 */
function readBoundedStableFile(filePath, maxBytes = MAX_ARTIFACT_BYTES) {
  if (typeof filePath !== 'string' || !filePath || !path.isAbsolute(filePath)) {
    issue('path_not_absolute');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ARTIFACT_BYTES) {
    issue('invalid_size_limit');
  }

  const namedBefore = safeLstat(filePath);
  if (namedBefore.isSymbolicLink()) issue('symlink_rejected');
  if (!namedBefore.isFile()) issue('not_regular_file');
  if (namedBefore.size === 0n) issue('empty');
  if (namedBefore.size > BigInt(maxBytes)) issue('too_large');

  let descriptor;
  try {
    const noFollow = Number.isInteger(fs.constants.O_NOFOLLOW) ? fs.constants.O_NOFOLLOW : 0;
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
  } catch (_) {
    issue('open_failed');
  }

  try {
    const openedBefore = fs.fstatSync(descriptor, { bigint: true });
    if (!openedBefore.isFile()) issue('not_regular_file');
    if (!sameSnapshot(namedBefore, openedBefore)) issue('changed_before_read');
    if (openedBefore.size > BigInt(maxBytes)) issue('too_large');

    const size = Number(openedBefore.size);
    const bytes = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      const count = fs.readSync(descriptor, bytes, offset, size - offset, offset);
      if (count === 0) issue('short_read');
      offset += count;
    }

    const extra = Buffer.allocUnsafe(1);
    if (fs.readSync(descriptor, extra, 0, 1, size) !== 0) issue('grew_during_read');

    const openedAfter = fs.fstatSync(descriptor, { bigint: true });
    const namedAfter = safeLstat(filePath);
    if (!openedAfter.isFile() || !namedAfter.isFile() || namedAfter.isSymbolicLink()) {
      issue('changed_during_read');
    }
    if (!sameSnapshot(openedBefore, openedAfter)
        || !sameSnapshot(openedAfter, namedAfter)) {
      issue('changed_during_read');
    }

    return {
      bytes,
      size,
      bytesSha256: sha256Bytes(bytes),
      mtimeMs: Number(openedAfter.mtimeNs / 1000000n),
    };
  } finally {
    try {
      fs.closeSync(descriptor);
    } catch (_) {}
  }
}

/**
 * Minimal strict JSON parser. It rejects duplicate object keys and numbers that
 * JSON.parse would turn into Infinity (for example 1e400), while preserving the
 * same JavaScript values/property order used by JSON.stringify contract hashes.
 */
function parseStrictJson(bytes) {
  let source;
  try {
    // Retain an input BOM so it is rejected as non-JSON instead of silently
    // accepting bytes the producer would not have hashed as JSON text.
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (_) {
    issue('invalid_utf8');
  }

  let cursor = 0;
  const length = source.length;
  const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

  function whitespace() {
    while (cursor < length && /[\u0020\u0009\u000a\u000d]/.test(source[cursor])) cursor += 1;
  }

  function stringValue() {
    const start = cursor;
    if (source[cursor] !== '"') issue('json_invalid');
    cursor += 1;
    let escaped = false;
    while (cursor < length) {
      const code = source.charCodeAt(cursor);
      const character = source[cursor];
      if (!escaped && code < 0x20) issue('json_invalid');
      if (!escaped && character === '"') {
        cursor += 1;
        try {
          return JSON.parse(source.slice(start, cursor));
        } catch (_) {
          issue('json_invalid');
        }
      }
      if (!escaped && character === '\\') {
        escaped = true;
      } else {
        escaped = false;
      }
      cursor += 1;
    }
    issue('json_invalid');
  }

  function numberValue() {
    numberPattern.lastIndex = cursor;
    const match = numberPattern.exec(source);
    if (!match) issue('json_invalid');
    cursor += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) issue('json_non_finite_number');
    return value;
  }

  function literal(text, value) {
    if (source.slice(cursor, cursor + text.length) !== text) issue('json_invalid');
    cursor += text.length;
    return value;
  }

  function arrayValue() {
    const result = [];
    cursor += 1;
    whitespace();
    if (source[cursor] === ']') {
      cursor += 1;
      return result;
    }
    while (cursor < length) {
      result.push(value());
      whitespace();
      if (source[cursor] === ']') {
        cursor += 1;
        return result;
      }
      if (source[cursor] !== ',') issue('json_invalid');
      cursor += 1;
      whitespace();
    }
    issue('json_invalid');
  }

  function objectValue() {
    const result = Object.create(null);
    const keys = new Set();
    cursor += 1;
    whitespace();
    if (source[cursor] === '}') {
      cursor += 1;
      return result;
    }
    while (cursor < length) {
      if (source[cursor] !== '"') issue('json_invalid');
      const key = stringValue();
      if (keys.has(key)) issue('json_duplicate_key');
      keys.add(key);
      whitespace();
      if (source[cursor] !== ':') issue('json_invalid');
      cursor += 1;
      const parsed = value();
      Object.defineProperty(result, key, {
        value: parsed,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      whitespace();
      if (source[cursor] === '}') {
        cursor += 1;
        return result;
      }
      if (source[cursor] !== ',') issue('json_invalid');
      cursor += 1;
      whitespace();
    }
    issue('json_invalid');
  }

  function value() {
    whitespace();
    const character = source[cursor];
    if (character === '{') return objectValue();
    if (character === '[') return arrayValue();
    if (character === '"') return stringValue();
    if (character === 't') return literal('true', true);
    if (character === 'f') return literal('false', false);
    if (character === 'n') return literal('null', null);
    if (character === '-' || (character >= '0' && character <= '9')) return numberValue();
    issue('json_invalid');
  }

  const parsed = value();
  whitespace();
  if (cursor !== length) issue('json_invalid');
  return parsed;
}

function contractFor(role, artifact) {
  return role === 'formatted' ? artifact?.pipelineContract : artifact?.artifactContract;
}

function loadArtifact(role, filePath, files, issues) {
  let read;
  try {
    read = readBoundedStableFile(filePath);
  } catch (error) {
    issues.push(`${role}_${error instanceof ArtifactValidationError ? error.code : 'read_failed'}`);
    return null;
  }

  const fingerprint = {
    name: path.basename(filePath),
    size: read.size,
    bytesSha256: read.bytesSha256,
    contractSha256: null,
  };
  files[role] = fingerprint;

  let artifact;
  try {
    artifact = parseStrictJson(read.bytes);
  } catch (error) {
    issues.push(`${role}_${error instanceof ArtifactValidationError ? error.code : 'json_invalid'}`);
    return null;
  }
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    issues.push(`${role}_json_not_object`);
    return null;
  }

  const contract = contractFor(role, artifact);
  if (contract && typeof contract === 'object' && !Array.isArray(contract)) {
    fingerprint.contractSha256 = sha256Json(contract);
  }
  return { artifact, read };
}

function pushValidation(issues, prefix, result) {
  if (!result || result.ok) return;
  for (const code of (Array.isArray(result.issues) ? result.issues : ['validation_failed'])) {
    issues.push(`${prefix}_${String(code)}`);
  }
}

function validateDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function expectedFilename(role, expected) {
  if (role === 'curator') return `curadoria-v4.4-${expected.mode}-${expected.dateBrt}.json`;
  if (role === 'trulyNew') return `_truly_new_${expected.dateBrt}.json`;
  return `_formatted_${expected.dateBrt}.json`;
}

function validateFilename(issues, role, filePath, expected) {
  const actual = path.basename(filePath);
  const accepted = role === 'curator'
    ? new Set([
      expectedFilename(role, expected),
      `curadoria-v4.4-${expected.mode}-${expected.dateBrt}--${expected.runId}.json`,
    ])
    : new Set([expectedFilename(role, expected)]);
  if (!accepted.has(actual)) {
    issues.push(`${role}_filename_mismatch`);
  }
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function parsedTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemIdentityState(items, label) {
  const identities = [];
  const issues = [];
  const seen = new Set();
  if (!Array.isArray(items)) return { identities, issues: [`${label}_not_array`] };
  items.forEach((item, index) => {
    const identity = pipeline.itemIdentity(item);
    if (!identity) {
      issues.push(`${label}_missing_identity:${index}`);
      return;
    }
    if (seen.has(identity)) issues.push(`${label}_duplicate_identity:${identity}`);
    seen.add(identity);
    identities.push(identity);
  });
  return { identities, issues };
}

function validateCuratorArtifact(curator, expected, issues) {
  pushValidation(issues, 'curator', pipeline.validateRunArtifact(curator, {
    kind: 'curator-report',
    runId: expected.runId,
    version: CURATOR_VERSION,
    mode: expected.mode,
    dateBrt: expected.dateBrt,
    startedAtMs: expected.startedAtMs,
    requireNonEmpty: true,
  }));

  const contract = curator?.artifactContract;
  if (!hasExactKeys(contract, [
    'schemaVersion', 'kind', 'version', 'mode', 'runId', 'dateBrt',
    'generatedAt', 'contentSha256',
  ])) {
    issues.push('curator_contract_keys_mismatch');
  }
  if (curator?.version !== CURATOR_VERSION) issues.push('curator_payload_version_mismatch');
  if (curator?.mode !== expected.mode) issues.push('curator_payload_mode_mismatch');
  if (curator?.timestamp !== contract?.generatedAt) issues.push('curator_payload_timestamp_mismatch');
  const identities = itemIdentityState(curator?.publishable, 'curator_publishable');
  issues.push(...identities.issues);
  return identities;
}

function validateTrulyNewLineage(curator, trulyNew, expected, curatorPath, issues) {
  pushValidation(issues, 'truly_new', pipeline.validateTrulyNewArtifact(trulyNew, {
    nowMs: expected.nowMs,
    dateBrt: expected.dateBrt,
  }));

  const curatorContract = curator?.artifactContract;
  const contract = trulyNew?.artifactContract;
  if (!hasExactKeys(contract, [
    'schemaVersion', 'kind', 'version', 'mode', 'runId', 'dateBrt',
    'generatedAt', 'sourceArtifact', 'sourceContentSha256', 'contentSha256',
  ])) {
    issues.push('truly_new_contract_keys_mismatch');
  }
  if (contract?.runId !== expected.runId) issues.push('truly_new_run_id_mismatch');
  if (contract?.mode !== expected.mode) issues.push('truly_new_mode_mismatch');
  if (contract?.sourceArtifact !== path.basename(curatorPath)) {
    issues.push('truly_new_source_artifact_mismatch');
  }
  if (contract?.sourceContentSha256 !== curatorContract?.contentSha256) {
    issues.push('truly_new_source_hash_mismatch');
  }
  if (trulyNew?.version !== CURATOR_VERSION) issues.push('truly_new_payload_version_mismatch');
  if (trulyNew?.mode !== expected.mode) issues.push('truly_new_payload_mode_mismatch');
  const curatorGeneratedAt = parsedTimestamp(curatorContract?.generatedAt);
  const trulyGeneratedAt = parsedTimestamp(contract?.generatedAt);
  if (curatorGeneratedAt !== null
      && trulyGeneratedAt !== null
      && trulyGeneratedAt + 1_000 < curatorGeneratedAt) {
    issues.push('truly_new_predates_curator');
  }

  const source = itemIdentityState(curator?.publishable, 'curator_publishable');
  const derived = itemIdentityState(trulyNew?.publishable, 'truly_new_publishable');
  issues.push(...source.issues, ...derived.issues);
  const sourceSet = new Set(source.identities);
  for (const identity of derived.identities) {
    if (!sourceSet.has(identity)) issues.push(`truly_new_identity_not_in_curator:${identity}`);
  }
  return derived;
}

function normalizeIssues(values) {
  const all = [...new Set(values.map(value => String(value).slice(0, MAX_RECEIPT_ISSUE_LENGTH)))].sort();
  return {
    issues: all.slice(0, MAX_RECEIPT_ISSUES),
    issueCount: all.length,
    issuesTruncated: all.length > MAX_RECEIPT_ISSUES,
  };
}

function validateArtifacts(options) {
  const issues = [];
  const files = {};
  const expected = {
    runId: options.runId,
    mode: options.mode,
    dateBrt: options.dateBrt,
    startedAtMs: options.startedAtMs,
    // Freshness is evaluated at the validator's action time. The CLI does not
    // accept a caller-controlled clock that could make a stale artifact valid.
    nowMs: Date.now(),
  };
  if (expected.dateBrt !== pipeline.isoDateInTimeZone(new Date(expected.nowMs))) {
    issues.push('binding_date_not_today');
  }

  validateFilename(issues, 'curator', options.curator, expected);
  const curatorLoaded = loadArtifact('curator', options.curator, files, issues);
  let curatorIdentities = { identities: [], issues: [] };
  if (curatorLoaded) {
    curatorIdentities = validateCuratorArtifact(curatorLoaded.artifact, expected, issues);
  }

  let trulyLoaded = null;
  if (options.operation === 'truly-new' || options.operation === 'formatted') {
    validateFilename(issues, 'trulyNew', options.trulyNew, expected);
    trulyLoaded = loadArtifact('trulyNew', options.trulyNew, files, issues);
    if (curatorLoaded && trulyLoaded) {
      validateTrulyNewLineage(
        curatorLoaded.artifact,
        trulyLoaded.artifact,
        expected,
        options.curator,
        issues,
      );
    }
  }

  if (options.operation === 'formatted') {
    validateFilename(issues, 'formatted', options.formatted, expected);
    const formattedLoaded = loadArtifact('formatted', options.formatted, files, issues);
    if (trulyLoaded && formattedLoaded) {
      const trulyContract = trulyLoaded.artifact?.artifactContract;
      const formattedContract = formattedLoaded.artifact?.pipelineContract;
      if (!hasExactKeys(formattedContract, [
        'schemaVersion', 'sourceArtifact', 'sourceContentSha256', 'sourceRunId',
        'generatedAt', 'expectedIdentities', 'formattedIdentities',
        'skippedAlreadyPublishedIdentities', 'failedFormattingIdentities',
        'contentSha256',
      ])) {
        issues.push('formatted_contract_keys_mismatch');
      }
      pushValidation(issues, 'formatted', pipeline.validateFormattedArtifact(
        formattedLoaded.artifact,
        trulyLoaded.artifact?.publishable,
        {
          sourceArtifact: path.basename(options.trulyNew),
          sourceContentSha256: trulyContract?.contentSha256,
          sourceRunId: expected.runId,
          sourceMtimeMs: trulyLoaded.read.mtimeMs,
          nowMs: expected.nowMs,
        },
      ));
      const trulyGeneratedAt = parsedTimestamp(trulyContract?.generatedAt);
      const formattedGeneratedAt = parsedTimestamp(formattedContract?.generatedAt);
      if (trulyGeneratedAt !== null
          && formattedGeneratedAt !== null
          && formattedGeneratedAt + 1_000 < trulyGeneratedAt) {
        issues.push('formatted_predates_truly_new');
      }
    }
  }

  const normalized = normalizeIssues(issues);
  return {
    schemaVersion: 1,
    operation: options.operation,
    ok: normalized.issueCount === 0,
    issues: normalized.issues,
    issueCount: normalized.issueCount,
    issuesTruncated: normalized.issuesTruncated,
    binding: {
      runId: expected.runId,
      mode: expected.mode,
      dateBrt: expected.dateBrt,
      urlIdentityVersion: URL_IDENTITY_VERSION,
      curatorPublishableIdentities: curatorIdentities.identities.length,
    },
    files,
  };
}

function parseIntegerOption(name, raw, { optional = false } = {}) {
  if (raw === undefined && optional) return undefined;
  if (!/^(?:0|[1-9]\d{0,15})$/.test(String(raw || ''))) {
    issue(`invalid_${name.replaceAll('-', '_')}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) issue(`invalid_${name.replaceAll('-', '_')}`);
  return value;
}

function parseCliArgs(argv) {
  const raw = {};
  for (const argument of argv) {
    if (typeof argument !== 'string' || !argument.startsWith('--') || !argument.includes('=')) {
      issue('invalid_argument_shape');
    }
    const separator = argument.indexOf('=');
    const name = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!ALLOWED_OPTIONS.has(name)) issue('unknown_option');
    if (Object.prototype.hasOwnProperty.call(raw, name)) issue('duplicate_option');
    if (!value) issue('empty_option');
    raw[name] = value;
  }

  if (!OPERATIONS.has(raw.operation)) issue('invalid_operation');
  if (!UUID_PATTERN.test(String(raw['run-id'] || ''))) issue('invalid_run_id');
  if (!CURATOR_MODES.has(raw.mode)) issue('invalid_mode');
  if (!validateDate(String(raw['date-brt'] || ''))) issue('invalid_date_brt');

  const required = ['operation', 'curator', 'run-id', 'mode', 'date-brt', 'started-at-ms'];
  if (raw.operation === 'truly-new' || raw.operation === 'formatted') required.push('truly-new');
  if (raw.operation === 'formatted') required.push('formatted');
  for (const name of required) {
    if (!raw[name]) issue(`missing_${name.replaceAll('-', '_')}`);
  }

  const allowedForOperation = new Set(required);
  for (const name of Object.keys(raw)) {
    if (!allowedForOperation.has(name)) issue('option_not_allowed_for_operation');
  }

  const pathOptions = ['curator'];
  if (raw['truly-new']) pathOptions.push('truly-new');
  if (raw.formatted) pathOptions.push('formatted');
  for (const name of pathOptions) {
    if (!path.isAbsolute(raw[name])) issue(`invalid_${name.replaceAll('-', '_')}_path`);
  }
  const resolved = pathOptions.map(name => path.resolve(raw[name]));
  if (new Set(resolved).size !== resolved.length) issue('artifact_paths_not_distinct');

  const startedAtMs = parseIntegerOption('started-at-ms', raw['started-at-ms']);
  const nowMs = Date.now();
  if (startedAtMs > nowMs + 5 * 60 * 1000
      || nowMs - startedAtMs > 30 * 60 * 60 * 1000) {
    issue('invalid_started_at_ms');
  }

  return {
    operation: raw.operation,
    curator: path.resolve(raw.curator),
    trulyNew: raw['truly-new'] ? path.resolve(raw['truly-new']) : undefined,
    formatted: raw.formatted ? path.resolve(raw.formatted) : undefined,
    runId: raw['run-id'].toLowerCase(),
    mode: raw.mode,
    dateBrt: raw['date-brt'],
    startedAtMs,
  };
}

function usageReceipt(error) {
  return {
    schemaVersion: 1,
    operation: null,
    ok: false,
    issues: [error instanceof ArtifactValidationError ? error.code : 'invalid_invocation'],
    issueCount: 1,
    issuesTruncated: false,
    binding: null,
    files: {},
  };
}

function runCli(argv = process.argv.slice(2)) {
  let receipt;
  let exitCode;
  try {
    const options = parseCliArgs(argv);
    receipt = validateArtifacts(options);
    exitCode = receipt.ok ? 0 : 1;
  } catch (error) {
    receipt = usageReceipt(error);
    exitCode = 2;
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return exitCode;
}

module.exports = {
  MAX_ARTIFACT_BYTES,
  parseCliArgs,
  parseStrictJson,
  readBoundedStableFile,
  runCli,
  sha256Json,
  validateArtifacts,
};

if (require.main === module) {
  process.exitCode = runCli();
}
