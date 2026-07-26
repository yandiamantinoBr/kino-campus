#!/usr/bin/env node
'use strict';

function isTrue(value) {
  return value === true || value === 'true';
}

function metadataOf(post) {
  return post?.metadata && typeof post.metadata === 'object'
    ? post.metadata
    : {};
}

function reactivationBlockReason(post) {
  const metadata = metadataOf(post);
  const moderationReason = String(post?.moderation_reason || '').trim();

  if (isTrue(metadata.cadu_reactivation_blocked)) return 'explicit_metadata_block';
  if (isTrue(metadata.hidden_by_dedup)) return 'hidden_by_dedup';
  if (isTrue(metadata.hidden_by_audit)) return 'hidden_by_audit';
  if (moderationReason) return 'moderation_reason_present';
  if (post?.status === 'hidden' && !isTrue(metadata.cadu_reactivation_allowed)) {
    return 'hidden_requires_explicit_approval';
  }
  if (
    post?.status === 'closed'
    && ['admin', 'moderator', 'manual'].some(value => (
      String(metadata.closed_by || '').toLowerCase().includes(value)
    ))
  ) {
    return 'manually_closed';
  }
  return '';
}

function decidePostReactivation(post, {
  incomingExpiry = '',
  reactivateIfHidden = false,
  reactivateIfClosed = true,
} = {}) {
  const blockReason = reactivationBlockReason(post);
  if (blockReason) {
    return { allowed: false, targetStatus: '', reason: blockReason };
  }

  if (post?.status === 'hidden') {
    return reactivateIfHidden
      ? { allowed: true, targetStatus: 'published', reason: 'explicit_hidden_reactivation' }
      : { allowed: false, targetStatus: '', reason: 'hidden_reactivation_disabled' };
  }

  if (post?.status === 'closed') {
    if (!reactivateIfClosed) {
      return { allowed: false, targetStatus: '', reason: 'closed_reactivation_disabled' };
    }
    const expiryMs = Date.parse(String(incomingExpiry || ''));
    if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
      return { allowed: false, targetStatus: '', reason: 'no_future_semantic_expiry' };
    }
    return { allowed: true, targetStatus: 'published', reason: 'future_release_after_auto_close' };
  }

  return { allowed: false, targetStatus: '', reason: 'status_not_reactivatable' };
}

module.exports = {
  decidePostReactivation,
  reactivationBlockReason,
};
