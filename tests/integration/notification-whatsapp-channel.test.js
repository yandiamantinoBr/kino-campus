const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('notification whatsapp channel', () => {
  test('migration cria destino privado separado e libera o resolvedor apenas com consentimento', () => {
    const sql = read('supabase/migrations/v11.21.1.0_notification_whatsapp_channel.sql');

    expect(sql).toContain('create table if not exists public.notification_channel_targets');
    expect(sql).toContain("check (channel = any (array['whatsapp'::text]))");
    expect(sql).toContain('create or replace function public.kc_touch_notification_channel_target_consent()');
    expect(sql).toContain('create or replace function public.kc_count_recent_notification_deliveries(');
    expect(sql).toContain("'consent_not_granted'");
    expect(sql).toContain("'private.notification_channel_targets.whatsapp'");
    expect(sql).not.toContain("'private.whatsapp'");
  });

  test('edge function expande o dispatcher para provider WhatsApp com Twilio e rate-limit', () => {
    const source = read('supabase/functions/kc-dispatch-notification-outbox/index.ts');

    expect(source).toContain('type WhatsAppProviderConfig');
    expect(source).toContain('KC_NOTIFICATION_WHATSAPP_PROVIDER');
    expect(source).toContain('KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID');
    expect(source).toContain('KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN');
    expect(source).toContain('KC_NOTIFICATION_WHATSAPP_FROM');
    expect(source).toContain('KC_NOTIFICATION_WHATSAPP_CONTENT_SID');
    expect(source).toContain('KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_WINDOW_MINUTES');
    expect(source).toContain('KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_MAX_PER_WINDOW');
    expect(source).toContain('https://api.twilio.com/2010-04-01/Accounts');
    expect(source).toContain('ContentSid');
    expect(source).toContain('ContentVariables');
    expect(source).toContain('processDispatchChannel(');
    expect(source).toContain('whatsapp_previews');
  });
});
