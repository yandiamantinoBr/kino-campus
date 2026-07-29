'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const MIGRATION = read(
  'supabase/migrations/20260728235000_reconcile_missing_private_rpc_workers.sql'
);
const PGTAP = read(
  'supabase/tests/missing_private_rpc_workers_test.sql'
);

function section(start, end) {
  const startAt = MIGRATION.indexOf(start);
  const endAt = end ? MIGRATION.indexOf(end, startAt + start.length) : -1;
  if (startAt < 0) return '';
  return MIGRATION.slice(startAt, endAt < 0 ? undefined : endAt);
}

describe('missing private RPC worker reconciliation', () => {
  test('recreates all thirteen workers lost from the consolidated baseline', () => {
    [
      'kc_get_feed_ad_config',
      'kc_get_personalized_tabs',
      'kc_chat_block_user',
      'kc_chat_delete_message',
      'kc_chat_edit_message',
      'kc_chat_is_blocked',
      'kc_chat_list_conversations',
      'kc_chat_mark_read',
      'kc_chat_report_message',
      'kc_chat_start_conversation',
      'kc_chat_unblock_user',
      'kc_chat_unread_total',
      'kc_reactivate_post',
    ].forEach((functionName) => {
      expect(MIGRATION).toContain(
        `create or replace function kc_private.${functionName}`
      );
      expect(PGTAP).toContain(`kc_private.${functionName}`);
    });
  });

  test('keeps advertisement configuration public but excludes private fields and pages', () => {
    const adWorker = section(
      'create or replace function kc_private.kc_get_feed_ad_config',
      '-- ============================================================================\n-- Personalized tabs'
    );

    expect(adWorker).toContain("'enabled', false");
    expect(adWorker).toContain('mensagens[.]html');
    expect(adWorker).toContain('settings[.]html');
    expect(adWorker).toContain('privacidade[.]html');
    expect(adWorker).toContain("'adsense_client_id'");
    expect(adWorker).toContain("'adsense_slots'");
    expect(adWorker).not.toContain("'notes'");
    expect(adWorker).not.toContain("'updated_by'");
  });

  test('uses stored affinity only for an authenticated consented owner', () => {
    const tabsWorker = section(
      'create or replace function kc_private.kc_get_personalized_tabs',
      '-- ============================================================================\n-- Chat workers'
    );

    expect(tabsWorker).toContain(
      'v_use_affinity := kc_private.kc_home_user_has_analytics_consent'
    );
    expect(tabsWorker).toContain("affinity_row.owner_kind = 'user'");
    expect(tabsWorker).toContain(
      'affinity_row.user_id = v_user_id'
    );
    expect(tabsWorker).not.toContain("owner_kind = 'session'");
    expect(tabsWorker).not.toContain('session_id =');
  });

  test('applies role-aware post visibility to personalized-tab fallback', () => {
    const tabsWorker = section(
      'create or replace function kc_private.kc_get_personalized_tabs',
      '-- ============================================================================\n-- Chat workers'
    );

    expect(tabsWorker).toContain(
      "post_row.visibility in ('public', 'community')"
    );
    expect(tabsWorker).toContain(
      "post_row.visibility = 'public'"
    );
    expect(PGTAP).toContain(
      'anon fallback excludes community-only posts'
    );
    expect(PGTAP).toContain(
      'anon cannot activate stored affinity by presenting a session id'
    );
  });

  test('checks bidirectional blocks before returning or creating a conversation', () => {
    const startWorker = section(
      'create or replace function kc_private.kc_chat_start_conversation',
      'create or replace function kc_private.kc_chat_list_conversations'
    );

    const blockCheckAt = startWorker.indexOf(
      'from public.user_blocks as block_row'
    );
    const pairLockAt = startWorker.indexOf('pg_advisory_xact_lock');
    const existingConversationAt = startWorker.indexOf(
      'from public.chat_conversations as conversation_row'
    );

    expect(pairLockAt).toBeGreaterThan(0);
    expect(blockCheckAt).toBeGreaterThan(pairLockAt);
    expect(blockCheckAt).toBeGreaterThan(0);
    expect(existingConversationAt).toBeGreaterThan(blockCheckAt);
    expect(startWorker).toContain("raise exception 'blocked'");
    expect(
      section(
        'create or replace function kc_private.kc_chat_block_user',
        'create or replace function kc_private.kc_chat_unblock_user'
      )
    ).toContain('pg_advisory_xact_lock');
  });

  test('keeps the denormalized inbox preview synchronized without residual deleted plaintext', () => {
    const refreshWorker = section(
      'create or replace function kc_private.kc_chat_refresh_conversation_preview',
      '-- ============================================================================\n-- Chat workers'
    );

    expect(refreshWorker).toContain('message_row.deleted_at is null');
    expect(refreshWorker).toContain(
      'order by message_row.created_at desc, message_row.id desc'
    );
    expect(refreshWorker).toContain('last_message_preview = null');
    expect(MIGRATION).toContain(
      'create trigger chat_msg_after_insert_denormalize'
    );
    expect(MIGRATION).toContain(
      'create trigger chat_msg_after_update_refresh_preview'
    );
    expect(PGTAP).toContain(
      'message insertion denormalizes the inbox preview'
    );
    expect(PGTAP).toContain(
      'deleting the latest message removes residual plaintext from the inbox'
    );
  });

  test('binds read markers to a participant and the selected conversation', () => {
    const markReadWorker = section(
      'create or replace function kc_private.kc_chat_mark_read',
      'create or replace function public.kc_chat_mark_messages_read'
    );
    const readTrigger = section(
      'create or replace function public.kc_chat_mark_messages_read',
      'create or replace function kc_private.kc_chat_unread_total'
    );

    expect(markReadWorker).toContain("raise exception 'not_a_participant'");
    expect(markReadWorker).toContain(
      'message_row.conversation_id = p_conversation_id'
    );
    expect(markReadWorker).toContain(
      "raise exception 'read_marker_wrong_conversation'"
    );
    expect(markReadWorker).toContain(
      'excluded.last_read_at >= chat_read_state.last_read_at'
    );
    expect(readTrigger).toContain(
      'message_row.created_at <= new.last_read_at'
    );
    expect(readTrigger).toContain(
      'message_row.sender_id is distinct from new.user_id'
    );
  });

  test('enforces sender ownership for edits/deletes and participant ownership for reports', () => {
    const deleteWorker = section(
      'create or replace function kc_private.kc_chat_delete_message',
      'create or replace function kc_private.kc_chat_edit_message'
    );
    const editWorker = section(
      'create or replace function kc_private.kc_chat_edit_message',
      'create or replace function kc_private.kc_chat_report_message'
    );
    const reportWorker = section(
      'create or replace function kc_private.kc_chat_report_message',
      '-- ============================================================================\n-- Closed-post'
    );

    expect(deleteWorker).toContain(
      'v_message.sender_id is distinct from v_user_id'
    );
    expect(editWorker).toContain(
      'v_message.sender_id is distinct from v_user_id'
    );
    expect(reportWorker).toContain(
      'conversation_row.participant_low = v_user_id'
    );
    expect(reportWorker).toContain(
      "'chat_message'"
    );
    expect(reportWorker).toContain(
      "raise exception 'cannot_report_own_message'"
    );
  });

  test('reactivates only an owned/admin closed post under a serialized limit check', () => {
    const reactivateWorker = section(
      'create or replace function kc_private.kc_reactivate_post',
      'create or replace function public.kc_reactivate_post'
    );

    expect(reactivateWorker).toContain(
      'v_post.author_id is distinct from v_user_id'
    );
    expect(reactivateWorker).toContain("'code', 'AUTHOR_DELETED'");
    expect(reactivateWorker).toContain("v_post.status <> 'closed'");
    expect(reactivateWorker).toContain('pg_advisory_xact_lock');
    expect(reactivateWorker).toContain(
      'public.kc_check_post_limit'
    );
    expect(reactivateWorker).toContain(
      "perform kc_private.kc_insert_audit_log"
    );
  });

  test('removes anonymous execution from chat and authenticated post actions', () => {
    [
      'public.kc_chat_block_user(uuid, text)',
      'public.kc_chat_delete_message(uuid)',
      'public.kc_chat_edit_message(uuid, text)',
      'public.kc_chat_list_conversations',
      'public.kc_chat_mark_read(uuid, uuid)',
      'public.kc_chat_send_message(uuid, text, text, text)',
      'public.kc_chat_start_conversation(uuid)',
      'public.kc_chat_unread_total()',
      'public.kc_bump_post(uuid)',
      'public.kc_check_post_flood_limit(uuid, text)',
      'public.kc_close_post(uuid, text)',
      'public.kc_get_post_flood_limit(uuid, text)',
      'public.kc_reactivate_post(uuid)',
      'public.kc_record_post_audit_event(uuid, text, jsonb)',
      'public.kc_renew_post(uuid)',
      'public.kc_toggle_post_status(uuid)',
    ].forEach((signature) => {
      const at = MIGRATION.indexOf(`revoke all on function ${signature}`);
      expect(at).toBeGreaterThan(-1);
      expect(
        MIGRATION.slice(at, at + 220)
      ).toContain('from public, anon, authenticated, service_role');
    });
  });

  test('ships runtime pgTAP coverage for grants and critical ownership paths', () => {
    expect(PGTAP).toContain('select extensions.plan(122)');
    expect(PGTAP).toContain('read_marker_wrong_conversation');
    expect(PGTAP).toContain('a non-owner cannot reactivate a closed post');
    expect(PGTAP).toContain(
      'an erased-owner post cannot be reactivated by privileged automation'
    );
    expect(PGTAP).toContain(
      'the remaining participant can list a preserved closed conversation'
    );
    expect(PGTAP).toContain('select * from extensions.finish()');
  });
});
