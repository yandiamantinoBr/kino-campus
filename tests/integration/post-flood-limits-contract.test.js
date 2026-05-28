'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20260521201102_admin_configurable_post_flood_limits.sql');
const FIX_MIGRATION = path.join(ROOT, 'supabase/migrations/20260528092946_fix_cadu_flood_limit_admin_controls.sql');
const ADMIN_HTML = path.join(ROOT, 'admin/moderation.html');
const ADMIN_CONTROLLER = path.join(ROOT, 'assets/js/controllers/admin/admin-moderation.controller.js');
const CADU_PUBLISHER = path.join(ROOT, 'services/cadu-ufg-publisher/src/publisher.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

describe('post flood limits admin contract', () => {
  let sql;
  let html;
  let controller;
  let publisher;

  beforeAll(() => {
    sql = read(MIGRATION);
    sql += '\n' + read(FIX_MIGRATION);
    html = read(ADMIN_HTML);
    controller = read(ADMIN_CONTROLLER);
    publisher = read(CADU_PUBLISHER);
  });

  test('migration creates configurable cadence table and RPCs', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.post_flood_limits');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.kc_check_post_flood_limit');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.kc_admin_set_post_flood_limit');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.kc_admin_get_post_flood_limits');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.kc_admin_delete_post_flood_limit');
    expect(sql).toContain('create table if not exists public.post_flood_resets');
    expect(sql).toContain('create or replace function public.kc_admin_reset_post_flood_limit');
  });

  test('anti-spam trigger uses configurable limit instead of hardcoded 3/hour', () => {
    expect(sql).toContain('v_flood_check := kc_private.kc_compute_post_flood_check(new.author_id, new.module);');
    expect(sql).toContain('flood_limit_exceeded');
    expect(sql).toContain('window_minutes');
    expect(sql).toContain('AUTH_REQUIRED');
  });

  test('admin moderation page exposes flood limit controls', () => {
    expect(html).toContain('id="flood-global-module"');
    expect(html).toContain('id="flood-user-module"');
    expect(html).toContain('id="flood-global-max"');
    expect(html).toContain('id="flood-user-window"');
    expect(html).toContain('id="flood-user-reset"');
    expect(html).toContain('id="post-flood-limits-body"');
    expect(html).toContain('post_flood_limits');
  });

  test('admin controller lists, saves and deletes flood limits through RPCs', () => {
    expect(controller).toContain("'kc_admin_get_post_flood_limits'");
    expect(controller).toContain("'kc_admin_set_post_flood_limit'");
    expect(controller).toContain("'kc_admin_delete_post_flood_limit'");
    expect(controller).toContain("'kc_admin_reset_post_flood_limit'");
    expect(controller).toContain('async function resetUserFloodLimit');
    expect(controller).toContain('data-flood-limit-delete="${escape(String(row.id))}"');
  });

  test('admin moderation export collects complete filtered data with safe caps', () => {
    expect(controller).toContain('const EXPORT_ROW_LIMIT = 2000');
    expect(controller).toContain('async function collectModerationExportData');
    expect(controller).toContain('async function fetchPostsForExport');
    expect(controller).toContain('async function fetchAuditRowsForExport');
    expect(controller).toContain("'kc_admin_search_posts_full'");
    expect(controller).toContain("'kc_admin_list_audit_logs'");
    expect(controller).toContain("title: 'Posts filtrados'");
    expect(controller).toContain("title: 'Avisos de exportação'");
  });

  test('Cadu publisher checks flood limits before insert', () => {
    expect(publisher).toContain('async checkPostFloodLimit');
    expect(publisher).toContain('/rest/v1/rpc/kc_check_post_flood_limit');
    expect(publisher).toContain("code: 'FLOOD_LIMIT'");
  });
});
