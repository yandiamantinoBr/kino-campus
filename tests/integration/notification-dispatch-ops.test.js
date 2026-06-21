const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('notification dispatch operational invariants', () => {
  test('migration versiona scheduler e log privado dos runs de dispatch', () => {
    const sql = read('supabase/migrations/_archive-v75/v11.22.0.0_notification_dispatch_scheduler.sql');

    expect(sql).toContain('create table if not exists public.notification_dispatch_runtime');
    expect(sql).toContain('create table if not exists public.notification_dispatch_runs');
    expect(sql).toContain('create or replace function public.kc_trigger_notification_dispatch(');
    expect(sql).toContain("current_setting('app.settings.kc_notification_dispatch_function_url', true)");
    expect(sql).toContain("current_setting('app.settings.kc_notification_dispatch_secret', true)");
    expect(sql).toContain("current_setting('app.settings.kc_notification_dispatch_batch_limit', true)");
    expect(sql).toContain("insert into public.notification_dispatch_runtime (slot)");
    expect(sql).toContain("perform cron.schedule(");
    expect(sql).toContain("'kc-dispatch-notification-outbox'");
    expect(sql).toContain("select public.kc_trigger_notification_dispatch();");
    expect(sql).toContain("select net.http_post(");
  });

  test('edge function persiste execution_id/source em notification_dispatch_runs', () => {
    const source = read('supabase/functions/kc-dispatch-notification-outbox/index.ts');

    expect(source).toContain('async function getDispatchRuntimeConfig');
    expect(source).toContain('async function persistDispatchRun');
    expect(source).toContain('.from("notification_dispatch_runtime")');
    expect(source).toContain('.from("notification_dispatch_runs")');
    expect(source).toContain('execution_id: executionId');
    expect(source).toContain('source: requestSource');
    expect(source).toContain('mode: "dry_run"');
    expect(source).toContain('mode: "dispatch"');
  });
});
