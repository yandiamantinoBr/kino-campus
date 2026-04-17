/**
 * @file kc-api-notifications-module.test.js
 * @description Static contract tests for assets/js/kc-api.notifications.js (v11.32.2)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../assets/js/kc-api.notifications.js');
const HTML_FILES = [
  'account-setup.html',
  'achados-perdidos.html',
  'ajuda.html',
  'auth-callback.html',
  'caronas-feed.html',
  'compra-venda-feed.html',
  'create-post.html',
  'eventos.html',
  'index.html',
  'moradia.html',
  'my-posts.html',
  'ods.html',
  'oportunidades.html',
  'profile.html',
  'search-results.html',
  'settings.html',
  '_product.html',
  'admin/banners.html',
  'admin/help-requests.html',
  'admin/index.html',
  'admin/moderation.html',
  'admin/reports.html',
];

let source;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
});

describe('kc-api.notifications.js - source shape', () => {
  test('mantem IIFE, strict mode e namespace interno _KCAPI', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.notifications = {');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('nao cria nova fachada publica nem usa require/import', () => {
    expect(source).not.toContain('window.KCAPI =');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });
});

describe('kc-api.notifications.js - exported notification domain', () => {
  test('exporta apenas o grupo de notifications/preferencias/targets', () => {
    [
      'buildFallbackNotificationPreferences,',
      'buildFallbackNotificationChannelTargets,',
      'getNotificationPreferences,',
      'updateNotificationPreferences,',
      'getNotificationChannelTargets,',
      'updateNotificationChannelTargets,',
      'getNotifications,',
      'markNotificationsRead,',
      'markAllNotificationsRead,',
      'clearNotifications,',
      'getUnreadNotificationCount,',
      'subscribeNotifications,',
      'unsubscribeNotifications,',
    ].forEach((token) => expect(source).toContain(token));
  });

  test('mantem fallbacks canonicos de preferencias e destinos privados', () => {
    expect(source).toContain('function getAccountProfileUtils(deps) {');
    expect(source).toContain('buildDefaultNotificationPreferences');
    expect(source).toContain('buildDefaultNotificationChannelTargets');
    expect(source).toContain('comment_on_post: { in_app: true, email: false, whatsapp: false }');
    expect(source).toContain("metadata: { country_code: '55' }");
  });

  test('mantem guards de indisponibilidade e delegacao por driver ativo', () => {
    expect(source).toContain('function getActiveDriverOrNull(deps) {');
    expect(source).toContain("return { ok: false, error: { message: 'Preferencias de notificacao indisponiveis neste driver.' } };");
    expect(source).toContain("return { ok: false, error: { message: 'Destinos privados de notificacao indisponiveis neste driver.' } };");
    expect(source).toContain("return { ok: false, error: 'UNAVAILABLE' };");
    expect(source).toContain('return driver.getNotifications(limit, offset);');
    expect(source).toContain('return driver.markNotificationsRead(ids);');
    expect(source).toContain('return driver.markAllNotificationsRead();');
    expect(source).toContain('return driver.clearNotifications();');
    expect(source).toContain('return driver.getUnreadNotificationCount();');
    expect(source).toContain('return driver.subscribeNotifications(userId, callback);');
    expect(source).toContain('driver.unsubscribeNotifications(channel);');
  });
});

describe('kc-api.notifications.js - html loading order', () => {
  test('os 22 carregadores reais incluem kc-api.notifications.js antes de kc-api.client.js', () => {
    HTML_FILES.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
      const notificationsIdx = html.indexOf('kc-api.notifications.js');
      const clientIdx = html.indexOf('kc-api.client.js');

      expect(notificationsIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeGreaterThan(-1);
      expect(notificationsIdx).toBeLessThan(clientIdx);
    });
  });
});
