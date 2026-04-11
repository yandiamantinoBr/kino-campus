const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('settings notification preferences hardening', () => {
  test('settings expõe a seção de preferências e o save handler correspondente', () => {
    const html = read('settings.html');
    const controller = read('assets/js/controllers/settings.controller.js');

    expect(html).toContain('settingsNotificationPreferencesList');
    expect(html).toContain('settingsSaveNotifications');
    expect(controller).toContain('async function loadNotificationPreferences()');
    expect(controller).toContain('async function saveNotificationSettings()');
    expect(controller).toContain('data-notification-event');
    expect(controller).toContain('window.KCAPI.updateNotificationPreferences');
  });
});
