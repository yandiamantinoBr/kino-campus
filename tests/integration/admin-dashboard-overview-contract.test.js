'use strict';

/**
 * Contrato da RPC agregada do Dashboard Admin (revisão profunda — fase A).
 * - Migration cria uma fachada SECURITY INVOKER e worker privado SECURITY DEFINER
 *   retornando KPIs da janela atual e anterior + active_15m + bloco privacy.
 * - O controller usa a RPC com fallback defensivo aos loaders individuais.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('kc_admin_dashboard_overview — migration', () => {
  let sql;
  beforeAll(() => {
    sql = r('supabase/migrations/20260716120242_harden_admin_dashboard_analytics.sql');
  });

  test('cria fachada pública INVOKER e worker privado DEFINER com search_path vazio', () => {
    expect(sql).toContain('create or replace function public.kc_admin_dashboard_overview');
    expect(sql).toContain('create or replace function kc_private.kc_admin_dashboard_overview_impl');
    expect(sql).toContain('security invoker');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('kc_private.kc_admin_dashboard_overview_impl($1, $2, $3)');
  });

  test('faz gate de admin e retorna FORBIDDEN para não-admin', () => {
    expect(sql).toContain('public.kc_is_admin(v_uid)');
    expect(sql).toContain("'FORBIDDEN'");
  });

  test('agrega KPIs da janela atual e anterior (deltas) + active_15m + privacy', () => {
    ['reports', 'posts', 'engagement', 'users', 'searches', 'privacy', 'active_15m',
      'prev_created', 'prev_new', 'prev_votes', 'prev_saves', 'prev_comments'].forEach((k) => {
      expect(sql).toContain(k);
    });
  });

  test('só authenticated/service_role executam (anon revogado)', () => {
    expect(sql).toContain('revoke all on function public.kc_admin_dashboard_overview');
    expect(sql).toContain('grant execute on function public.kc_admin_dashboard_overview');
  });
});

describe('admin-dashboard.controller — usa a RPC com fallback', () => {
  let ctrl;
  beforeAll(() => {
    ctrl = r('assets/js/controllers/admin/admin-dashboard.controller.js');
  });

  test('chama kc_admin_dashboard_overview', () => {
    expect(ctrl).toContain("client.rpc('kc_admin_dashboard_overview'");
    expect(ctrl).toContain('p_prev_since');
  });

  test('mantém o fallback aos loaders individuais', () => {
    expect(ctrl).toContain('loadReportMetrics(client, since)');
    expect(ctrl).toContain('loadActiveSessions15m(client)');
  });

  test('deriva deltas e active a partir do overview', () => {
    expect(ctrl).toContain('overview.active_15m');
    expect(ctrl).toContain('finiteNonNegativeMetric(overview.active_15m)');
    expect(ctrl).toMatch(/overviewActive15m === null[\s\S]*loadActiveSessions15m\(client\)/);
    expect(ctrl).not.toContain('value: Number(overview.active_15m) || 0');
    expect(ctrl).toContain('ovUsers.prev_new');
    expect(ctrl).toContain('ovPosts.prev_created');
  });
});
