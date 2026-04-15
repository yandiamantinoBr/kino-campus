/**
 * @file supabase-notifications-adapter.test.js
 * @description Static contract tests for supabase.notifications.adapter.js (v11.30.1)
 * Verifica estrutura IIFE, namespace _KCSA.notifications, helpers de normalização
 * e todos os métodos da API de notificações.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../assets/js/adapters/supabase.notifications.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.notifications.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)() ', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.notifications no final do IIFE', () => {
    expect(source).toContain('window._KCSA.notifications = {');
  });
});

describe('supabase.notifications.adapter.js — helpers getClient / getCurrentUser', () => {
  test('define função getClient() interna via window._KCSA.getClient', () => {
    expect(source).toContain('function getClient()');
    expect(source).toContain('window._KCSA.getClient');
  });

  test('define função getCurrentUser() interna via window._KCSA.getCurrentUser', () => {
    expect(source).toContain('function getCurrentUser()');
    expect(source).toContain('window._KCSA.getCurrentUser');
  });

  test('não acessa getSupabaseClient ou supabaseGetCurrentUser diretamente', () => {
    expect(source).not.toContain('getSupabaseClient()');
    expect(source).not.toContain('supabaseGetCurrentUser()');
  });
});

describe('supabase.notifications.adapter.js — helpers de normalização', () => {
  test('define buildDefaultNotificationPreferences()', () => {
    expect(source).toContain('function buildDefaultNotificationPreferences()');
  });

  test('define normalizeNotificationPreferences()', () => {
    expect(source).toContain('function normalizeNotificationPreferences(');
  });

  test('define buildDefaultNotificationChannelTargets()', () => {
    expect(source).toContain('function buildDefaultNotificationChannelTargets()');
  });

  test('define normalizeNotificationChannelTargets()', () => {
    expect(source).toContain('function normalizeNotificationChannelTargets(');
  });

  test('formatChannelTarget formata +55 com DDD', () => {
    expect(source).toContain('function formatChannelTarget(');
    expect(source).toContain('+55');
  });
});

describe('supabase.notifications.adapter.js — métodos de preferências exportados', () => {
  test('exporta getNotificationPreferences', () => {
    expect(source).toContain('getNotificationPreferences,');
    expect(source).toContain("from('notification_preferences')");
  });

  test('exporta updateNotificationPreferences', () => {
    expect(source).toContain('updateNotificationPreferences,');
    expect(source).toContain("'user_id'");
    expect(source).toContain('upsert(');
  });

  test('exporta getNotificationChannelTargets', () => {
    expect(source).toContain('getNotificationChannelTargets,');
    expect(source).toContain("from('notification_channel_targets')");
  });

  test('exporta updateNotificationChannelTargets', () => {
    expect(source).toContain('updateNotificationChannelTargets,');
    expect(source).toContain("'whatsapp'");
  });
});

describe('supabase.notifications.adapter.js — métodos de listagem/operação exportados', () => {
  test('exporta getNotifications com RPC kc_get_notifications', () => {
    expect(source).toContain('getNotifications,');
    expect(source).toContain("'kc_get_notifications'");
  });

  test('exporta markNotificationsRead com RPC kc_mark_notifications_read', () => {
    expect(source).toContain('markNotificationsRead,');
    expect(source).toContain("'kc_mark_notifications_read'");
  });

  test('exporta markAllNotificationsRead com RPC kc_mark_all_notifications_read', () => {
    expect(source).toContain('markAllNotificationsRead,');
    expect(source).toContain("'kc_mark_all_notifications_read'");
  });

  test('exporta clearNotifications (delete da tabela notifications)', () => {
    expect(source).toContain('clearNotifications,');
    expect(source).toContain("from('notifications')");
    expect(source).toContain('.delete()');
  });

  test('exporta getUnreadNotificationCount com RPC kc_unread_notification_count', () => {
    expect(source).toContain('getUnreadNotificationCount,');
    expect(source).toContain("'kc_unread_notification_count'");
  });
});

describe('supabase.notifications.adapter.js — métodos realtime exportados', () => {
  test('exporta subscribeNotifications com channel postgres_changes', () => {
    expect(source).toContain('subscribeNotifications,');
    expect(source).toContain("'postgres_changes'");
    expect(source).toContain("table: 'notifications'");
  });

  test('exporta unsubscribeNotifications via removeChannel', () => {
    expect(source).toContain('unsubscribeNotifications,');
    expect(source).toContain('removeChannel(');
  });
});

describe('supabase.notifications.adapter.js — updateNotificationChannelTargets é self-contained', () => {
  test('updateNotificationChannelTargets chama getNotificationChannelTargets internamente (sem prefixo supabase)', () => {
    // Garante que a referência interna é a função local, não a versão prefixada do adapter principal
    expect(source).toContain('targets: await getNotificationChannelTargets()');
    expect(source).not.toContain('supabaseGetNotificationChannelTargets');
  });
});
