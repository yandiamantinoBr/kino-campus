const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('notification email channel', () => {
  test('migration adiciona helpers de claim e registro atomico de attempt', () => {
    const sql = read('supabase/migrations/v11.21.0.0_notification_email_channel.sql');

    expect(sql).toContain('create or replace function public.kc_claim_notification_delivery_batch(');
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("status = 'processing'");
    expect(sql).toContain('create or replace function public.kc_record_notification_delivery_attempt(');
    expect(sql).toContain('insert into public.notification_delivery_attempts');
    expect(sql).toContain('grant execute on function public.kc_claim_notification_delivery_batch(text, integer, text) to service_role;');
    expect(sql).toContain('grant execute on function public.kc_record_notification_delivery_attempt(uuid, text, text, text, jsonb, text, text, timestamptz) to service_role;');
  });

  test('edge function gera envelope de email e usa resend com modo dry-run seguro por default', () => {
    const source = read('supabase/functions/kc-dispatch-notification-outbox/index.ts');

    expect(source).toContain('function buildEmailEnvelope');
    expect(source).toContain('function buildNotificationUrl');
    expect(source).toContain('const RESEND_ENDPOINT = "https://api.resend.com/emails"');
    expect(source).toContain('mode: "dry_run"');
    expect(source).toContain('mode: "dispatch"');
    expect(source).toContain('email_previews');
    expect(source).toContain('KC_NOTIFICATION_EMAIL_REPLY_TO');
  });
});
