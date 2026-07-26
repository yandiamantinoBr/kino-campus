'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./atomic-json-file.js');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POST_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function checkpointPayload(checkpoint) {
  if (!isRecord(checkpoint)) return checkpoint;
  const payload = { ...checkpoint };
  delete payload.contentSha256;
  return payload;
}

function cloneSafeRecord(value) {
  const copy = Object.create(null);
  if (!isRecord(value)) return copy;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    copy[key] = entry;
  }
  return copy;
}

function seenEntryChanged(before, after) {
  return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
}

function partitionInstagramSeenState(baselineSeen, currentSeen) {
  const baseline = cloneSafeRecord(baselineSeen);
  const current = cloneSafeRecord(currentSeen);
  const immediateSeen = cloneSafeRecord(baseline);
  const pendingRelevantEntries = Object.create(null);

  for (const [key, entry] of Object.entries(current)) {
    if (!seenEntryChanged(baseline[key], entry)) continue;
    if (isRecord(entry) && entry.relevant === true) {
      pendingRelevantEntries[key] = entry;
      continue;
    }
    immediateSeen[key] = entry;
  }

  return { immediateSeen, pendingRelevantEntries };
}

function buildInstagramSeenCheckpoint({
  runId,
  relevanceVersion,
  entries,
  generatedAt = new Date().toISOString(),
  requiresDownstreamAck = true,
} = {}) {
  const checkpoint = {
    schemaVersion: 1,
    kind: 'instagram-seen-outbox',
    runId: String(runId || ''),
    relevanceVersion: String(relevanceVersion || ''),
    generatedAt,
    requiresDownstreamAck: requiresDownstreamAck === true,
    entries: cloneSafeRecord(entries),
  };
  checkpoint.entryCount = Object.keys(checkpoint.entries).length;
  checkpoint.contentSha256 = jsonHash(checkpointPayload(checkpoint));
  return checkpoint;
}

function validateInstagramSeenCheckpoint(checkpoint, {
  expectedRunId,
  expectedRelevanceVersion,
  nowMs = Date.now(),
  maxAgeMs = 6 * 60 * 60 * 1000,
  requireDownstreamAck = false,
} = {}) {
  const issues = [];
  if (!isRecord(checkpoint)) return { ok: false, issues: ['seen_checkpoint_not_object'] };
  if (checkpoint.schemaVersion !== 1) issues.push('seen_checkpoint_schema_unsupported');
  if (checkpoint.kind !== 'instagram-seen-outbox') issues.push('seen_checkpoint_kind_mismatch');
  if (!UUID_PATTERN.test(String(checkpoint.runId || ''))) issues.push('seen_checkpoint_run_id_invalid');
  if (expectedRunId !== undefined && checkpoint.runId !== expectedRunId) {
    issues.push('seen_checkpoint_run_id_mismatch');
  }
  if (!String(checkpoint.relevanceVersion || '').trim()) {
    issues.push('seen_checkpoint_relevance_version_missing');
  }
  if (expectedRelevanceVersion !== undefined
      && checkpoint.relevanceVersion !== expectedRelevanceVersion) {
    issues.push('seen_checkpoint_relevance_version_mismatch');
  }
  if (typeof checkpoint.requiresDownstreamAck !== 'boolean') {
    issues.push('seen_checkpoint_ack_mode_invalid');
  } else if (requireDownstreamAck && checkpoint.requiresDownstreamAck !== true) {
    issues.push('seen_checkpoint_downstream_ack_required');
  }

  const generatedAtMs = Date.parse(String(checkpoint.generatedAt || ''));
  if (!Number.isFinite(generatedAtMs)) issues.push('seen_checkpoint_timestamp_invalid');
  else {
    if (generatedAtMs > nowMs + 5 * 60 * 1000) issues.push('seen_checkpoint_from_future');
    if (nowMs - generatedAtMs > maxAgeMs) issues.push('seen_checkpoint_stale');
  }

  if (!isRecord(checkpoint.entries)) {
    issues.push('seen_checkpoint_entries_invalid');
  } else {
    for (const [key, entry] of Object.entries(checkpoint.entries)) {
      if (FORBIDDEN_KEYS.has(key) || !POST_KEY_PATTERN.test(key)) {
        issues.push(`seen_checkpoint_key_invalid:${key.slice(0, 40)}`);
        continue;
      }
      if (!isRecord(entry)) {
        issues.push(`seen_checkpoint_entry_invalid:${key}`);
        continue;
      }
      if (entry.relevant !== true) issues.push(`seen_checkpoint_entry_not_relevant:${key}`);
      if (entry.relevanceVersion !== checkpoint.relevanceVersion) {
        issues.push(`seen_checkpoint_entry_version_mismatch:${key}`);
      }
      if (!HANDLE_PATTERN.test(String(entry.handle || ''))) {
        issues.push(`seen_checkpoint_entry_handle_invalid:${key}`);
      }
      if (!Number.isSafeInteger(entry.firstSeen)
          || entry.firstSeen <= 0
          || entry.firstSeen > nowMs + 5 * 60 * 1000) {
        issues.push(`seen_checkpoint_entry_first_seen_invalid:${key}`);
      }
    }
  }
  if (!Number.isSafeInteger(checkpoint.entryCount) || checkpoint.entryCount < 0) {
    issues.push('seen_checkpoint_entry_count_invalid');
  } else if (isRecord(checkpoint.entries)
      && checkpoint.entryCount !== Object.keys(checkpoint.entries).length) {
    issues.push('seen_checkpoint_entry_count_mismatch');
  }
  if (!/^[a-f0-9]{64}$/.test(String(checkpoint.contentSha256 || ''))) {
    issues.push('seen_checkpoint_hash_invalid');
  } else if (jsonHash(checkpointPayload(checkpoint)) !== checkpoint.contentSha256) {
    issues.push('seen_checkpoint_hash_mismatch');
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

function mergeAcknowledgedInstagramSeen(checkpoint, acknowledgedKeys, existingSeen, {
  nowMs = Date.now(),
  retentionDays = 180,
} = {}) {
  const validation = validateInstagramSeenCheckpoint(checkpoint, { nowMs });
  if (!validation.ok) throw new Error(`instagram_seen_checkpoint_invalid:${validation.issues.join(',')}`);
  const acknowledged = new Set(
    Array.from(acknowledgedKeys || []).filter(key => typeof key === 'string'),
  );
  const merged = cloneSafeRecord(existingSeen);
  const committedKeys = [];
  for (const [key, entry] of Object.entries(checkpoint.entries)) {
    if (!acknowledged.has(key)) continue;
    merged[key] = entry;
    committedKeys.push(key);
  }

  const boundedRetentionDays = Number.isInteger(retentionDays) && retentionDays >= 30
    ? Math.min(retentionDays, 730)
    : 180;
  const cutoff = nowMs - boundedRetentionDays * 86400000;
  for (const [key, entry] of Object.entries(merged)) {
    if (!isRecord(entry) || !Number.isSafeInteger(entry.firstSeen) || entry.firstSeen < cutoff) {
      delete merged[key];
    }
  }
  return {
    merged,
    committedKeys,
    pendingKeys: Object.keys(checkpoint.entries).filter(key => !acknowledged.has(key)),
  };
}

function readSeenState(stateFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return cloneSafeRecord(parsed);
  } catch (error) {
    if (error.code === 'ENOENT') return Object.create(null);
    throw error;
  }
}

function commitAcknowledgedInstagramSeen(checkpoint, acknowledgedKeys, {
  stateFile,
  nowMs = Date.now(),
  retentionDays = 180,
} = {}) {
  const resolvedStateFile = path.resolve(String(stateFile || ''));
  if (!stateFile || path.basename(resolvedStateFile) !== 'seen-posts.json') {
    throw new Error('instagram_seen_state_path_invalid');
  }
  const result = mergeAcknowledgedInstagramSeen(
    checkpoint,
    acknowledgedKeys,
    readSeenState(resolvedStateFile),
    { nowMs, retentionDays },
  );
  if (result.committedKeys.length > 0) {
    writeJsonAtomic(resolvedStateFile, result.merged, { space: 2, newline: true });
  }
  return result;
}

module.exports = {
  buildInstagramSeenCheckpoint,
  checkpointPayload,
  commitAcknowledgedInstagramSeen,
  mergeAcknowledgedInstagramSeen,
  partitionInstagramSeenState,
  validateInstagramSeenCheckpoint,
};
