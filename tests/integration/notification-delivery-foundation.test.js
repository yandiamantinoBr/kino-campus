const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('notification delivery foundation', () => {
  test('migration cria outbox, attempts e helper canonico de emissao', () => {
    const sql = read('supabase/migrations/v11.20.2.0_notification_delivery_outbox.sql');

    expect(sql).toContain('create table if not exists public.notification_delivery_outbox');
    expect(sql).toContain('create table if not exists public.notification_delivery_attempts');
    expect(sql).toContain('create or replace function public.kc_resolve_notification_delivery_destination(');
    expect(sql).toContain('create or replace function public.kc_enqueue_notification_delivery(');
    expect(sql).toContain('create or replace function public.kc_emit_notification_event(');
    expect(sql).toContain("notification_id uuid null references public.notifications(id) on delete set null");
    expect(sql).toContain("if new.direction <> 'hot' then");
    expect(sql).toContain('new.voter_id');
  });

  test('edge function expoe o dispatcher protegido por segredo e pronto para provider externo', () => {
    const source = read('supabase/functions/kc-dispatch-notification-outbox/index.ts');

    expect(source).toContain('KC_NOTIFICATION_DISPATCH_SECRET');
    expect(source).toContain('KC_NOTIFICATION_EMAIL_PROVIDER');
    expect(source).toContain('KC_NOTIFICATION_EMAIL_API_KEY');
    expect(source).toContain('KC_NOTIFICATION_EMAIL_FROM');
    expect(source).toContain('KC_NOTIFICATION_WHATSAPP_PROVIDER');
    expect(source).toContain('KC_NOTIFICATION_DISPATCH_BATCH_LIMIT');
    expect(source).toContain('x-kc-dispatch-secret');
    expect(source).toContain('https://api.resend.com/emails');
    expect(source).toContain('kc_claim_notification_delivery_batch');
    expect(source).toContain('kc_record_notification_delivery_attempt');
  });
});
