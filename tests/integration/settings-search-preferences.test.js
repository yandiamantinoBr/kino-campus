'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('settings search personalization controls', () => {
  test('expõe modo padrão, escolhas explícitas, consentimento separado e direitos', () => {
    const html = read('settings.html');
    expect(html).toContain('id="settingsSearchPreferences"');
    expect(html).toContain('id="settingsSearchPersonalized"');
    expect(html).toContain('id="settingsSearchAffinity"');
    expect(html).toContain('id="settingsSaveSearchPreferences"');
    expect(html).toContain('id="settingsExportSearchPreferences"');
    expect(html).toContain('Baixar preferências (JSON)');
    expect(html).toContain('id="settingsClearSearchPreferences"');
    expect(html).toContain('id="settingsSearchPreferencesSyncHint"');
    expect(html).toContain('sincronizam');
    expect(html).toContain('não é uma cópia completa da sua conta');
    expect(html.indexOf('settingsSearchPreferences')).toBeLessThan(html.indexOf('settingsGuest'));
  });

  test('registry canônico permanece lazy e controller não coleta query nem campos de identidade', () => {
    const html = read('settings.html');
    const controller = read('assets/js/controllers/public/search-preferences.controller.js');
    expect(html).not.toContain('<script defer src="assets/js/shared/kc-search-registry.generated.js');
    expect(controller).toContain("REGISTRY_SRC = 'assets/js/shared/kc-search-registry.generated.js");
    expect(controller).toContain('window.KCSearchPreferences.preferenceCatalog(registry)');
    expect(controller).not.toMatch(/searchInput|account_id/);
    expect(controller).toContain('getSearchPreferences');
    expect(controller).toContain('updateSearchPreferences');
    expect(controller).toContain('window.KCSearchPreferences.exportData');
    expect(controller).toContain('kinocampus-preferencias-busca-');
  });

  test('desativar personalização também desativa afinidade e save emite mudança', () => {
    const controller = read('assets/js/controllers/public/search-preferences.controller.js');
    expect(controller).toContain('if (affinity && !personalized) affinity.checked = false;');
    expect(controller).toContain("new CustomEvent('kc:search-preferences-change'");
    expect(controller).toContain('window.KCSearchPreferences.clear(currentStorageOptions())');
    expect(controller).toContain("scope: 'account'");
    expect(controller).toContain('userId: accountUserId');
    expect(controller).toContain('hydrateFromAccount');
    expect(controller).toContain('accountLoadGeneration');
    expect(controller).toContain('isActiveAccountLoad(generation, ownerUserId)');
    expect(controller).toContain("document.addEventListener('kc:authchange'");
  });

  test('assuntos e temas renderizam divisões por módulo com emoji alinhado ao create-modal', () => {
    const controller = read('assets/js/controllers/public/search-preferences.controller.js');
    const schema = read('assets/js/features/create-post/kc-create-post.schema.js');
    expect(controller).toContain('kc-search-preference-module-block');
    expect(controller).toContain('moduleEmoji');
    expect(controller).toContain('option.emoji');
    expect(schema).toContain("emoji: '🎓'");
    expect(schema).toContain("emoji: '🚗'");
  });

  test('expõe controles autenticados e rotas alternativas de privacidade sem PII', () => {
    const html = read('settings.html');
    const controller = read('assets/js/controllers/public/settings.controller.js');
    const css = read('assets/css/kc-public-shell.css');
    const browserExportKeys = controller.slice(
      controller.indexOf('const BROWSER_EXPORT_LOCAL_KEYS'),
      controller.indexOf('const BROWSER_CLEAR_LOCAL_KEYS')
    );

    expect(html).toContain('id="settingsPrivacyData"');
    expect(html).toContain('id="settingsDownloadAccountData"');
    expect(html).toContain('Baixar meus dados (JSON)');
    expect(html).toContain('id="settingsPrivacyDataStatus"');
    expect(html).toContain('id="settingsDataSubjectRequests"');
    expect(html).toContain('id="settingsRefreshDataRequests"');
    expect(html).toContain('id="settingsClearBrowserPrivacyData"');
    expect(html).toContain('Limpar dados deste navegador');
    expect(html).toContain('id="settingsPrivacyHelpFallback"');
    expect(html).toContain('ajuda.html?request=data_access_copy#helpRequestForm');
    expect(html).toContain('id="settingsRequestAccountErasure"');
    expect(html).toContain('id="settingsErasureHelpFallback"');
    expect(html).toContain('ajuda.html?request=account_erasure#helpRequestForm');
    expect(html).toContain('id="settingsRequestDataPortability"');
    expect(html).toContain('id="settingsPortabilityHelpFallback"');
    expect(html).toContain('ajuda.html?request=data_portability#helpRequestForm');
    expect(html).not.toMatch(/ajuda\.html\?[^"]*(?:email|user_id|account_id)=/i);
    expect(html.indexOf('settingsPrivacyData')).toBeGreaterThan(html.indexOf('settingsLogout'));
    expect(controller).toContain("request_kind: kind");
    expect(controller).toContain("requestAndDownloadExport('data_portability'");
    expect(controller).toContain("buttonSelector: '#settingsRequestDataPortability'");
    expect(controller).toContain("request_source: 'settings'");
    expect(controller).toContain("PRIVACY_ACTION_STORAGE_PREFIX = 'kc_privacy_action_keys_v1:'");
    expect(controller).toContain("PRIVACY_ACTION_LEGACY_STORAGE_KEY = 'kc_privacy_action_keys_v1'");
    expect(controller).toContain('getPrivacyActionStorageKey(userId)');
    expect(controller).toContain('readPersistedPrivacyActionKeys()');
    expect(controller).toContain('persistPrivacyActionKeys()');
    expect(controller).not.toContain('authoritativelyComplete');
    expect(controller).toContain("result.data.reuse_reason === 'idempotency_key'");
    expect(controller).toContain('for (let attempt = 0; attempt < 2; attempt += 1)');
    expect(controller).toContain('state.privacyActionKeyUserId !== userId');
    expect(controller).toContain("String(parsed.user_id || '') !== userId");
    expect(controller).toContain('state.privacyActionKeys = Object.create(null)');
    expect(controller).toContain(
      'window.KCAPI.downloadDataSubjectExport(protocol, {\n        expected_user_id: userId,',
    );
    expect(controller).toContain(
      'window.KCAPI.downloadDataSubjectSupplement(protocol, artifactRef, {\n        expected_user_id: userId,',
    );
    expect(controller).toContain("completeness === 'complete_within_automated_scope'");
    expect(controller).toContain('O complemento manual continua necessário');
    expect(controller).toContain("setActionButtonState(button, complete ? 'success' : 'warn'");
    expect(controller).toContain(
      'window.KCAPI.cancelDataSubjectRequest(protocol, {\n        expected_user_id: userId,',
    );
    expect(controller).toContain("clearPrivacyActionKey(kind)");
    expect(controller).toContain("kind === 'account_erasure'");
    expect(controller).toContain("['received', 'processing', 'ready', 'failed', 'partial_failure'].includes(status)");
    expect(controller).toContain('PRIVACY_ERASURE_BLOCKING_STATUSES');
    expect(controller).toContain('function hasActiveAccountErasure(requests)');
    expect(controller).toContain('Download bloqueado enquanto o pedido de exclusão estiver ativo');
    expect(controller).toContain('Não é possível abrir ou baixar uma cópia durante uma exclusão ativa');
    expect(controller).toContain('isSupplementDownloadAvailable(request, exportBlockedByErasure)');
    expect(controller).toContain('PRIVACY_SUPPLEMENT_DETAIL_STATUSES');
    expect(controller).toMatch(
      /PRIVACY_SUPPLEMENT_DETAIL_STATUSES\s*=\s*new Set\(\[[\s\S]*?'ready'[\s\S]*?'partial_failure'[\s\S]*?'completed'/,
    );
    expect(controller).toContain(
      'window.KCAPI.getDataSubjectRequest(request.protocol, {\n            expected_user_id: userId,',
    );
    expect(controller).toContain('privacyProtocolLeases: new Map()');
    expect(controller).toContain('function beginPrivacyProtocolOperation(protocol, action, button)');
    expect(controller).toContain('function endPrivacyProtocolOperation(lease)');
    expect(controller).toContain('lease.ownerMap.get(lease.protocol) !== lease');
    expect(controller).toContain("beginPrivacyProtocolOperation(protocol, 'download_export', button)");
    expect(controller).toContain("beginPrivacyProtocolOperation(protocol, 'download_supplement', button)");
    expect(controller).toContain("beginPrivacyProtocolOperation(protocol, 'cancel', button)");
    expect(controller).toContain('data-privacy-request-action');
    expect(controller).toContain('function capturePrivacyRequestFocus(container)');
    expect(controller).toContain('function restorePrivacyRequestFocus(container, intent)');
    expect(controller).toContain('privacyRequestFocusDisplacement: null');
    expect(controller).toContain('function hasPrivacyWorkInFlight()');
    expect(controller).toContain('function syncBrowserPrivacyClearAvailability()');
    expect(controller).toContain('privacyBusyLease: null');
    expect(controller).toContain('function beginPrivacyOperation()');
    expect(controller).toContain('function endPrivacyOperation(lease)');
    expect(controller).toContain('preparado e download iniciado');
    expect(controller).not.toContain('baixada. Guarde o arquivo');
    expect(controller).not.toContain('entregue. Guarde o arquivo');
    expect(controller).toContain('URL.revokeObjectURL(href)');
    expect(controller).toContain('combined.browser_local_data = collectBrowserDataExport()');
    expect(controller).toContain('server_integrity');
    expect(controller).toContain('all_top_level_fields_except_integrity_serialized_as_utf8_json');
    expect(controller).toContain('BROWSER_EXPORT_MAX_BYTES = 1024 * 1024');
    expect(controller).toContain('const BROWSER_CLEAR_LOCAL_KEYS');
    expect(controller).toContain('const BROWSER_CLEAR_SESSION_KEYS');
    expect(browserExportKeys).not.toContain('kc_home_category_merged_v1');
    expect(browserExportKeys).not.toContain('kc_home_category_queue_v1');
    expect(browserExportKeys).not.toContain('kc_home_category_session_v1');
    expect(browserExportKeys).not.toContain('kc_search_preferences_v1');
    expect(browserExportKeys).not.toContain('kc_search_affinity_v1');
    expect(browserExportKeys).not.toContain('kc_home_category_affinity_v1');
    expect(browserExportKeys).not.toContain('kc_nav_module_affinity_v1');
    expect(controller).toContain('getSearchPreferenceStorageKeys(userId)');
    expect(controller).toContain('kc:chat:draft:${userId}:');
    expect(controller).toContain('Tokens, credenciais');
    expect(controller).toContain('removeAllowedBrowserStorage');
    expect(controller).not.toMatch(/localStorage\.clear\(\)|sessionStorage\.clear\(\)/);
    expect(controller).not.toMatch(/target_email|account_email|user_id:\s*state\.user/);
    expect(controller).toContain('accountLoadGeneration');
    expect(controller).toContain('isActiveAccountLoad(generation, userId)');
    expect(controller).toContain("document.addEventListener('kc:authchange'");
    expect(controller).toContain('profileBelongsToUser');
    expect(controller).toContain('renderDataSubjectRequestsLoading');
    expect(controller).toContain('dataSubjectRequestsLoadSequence: 0');
    expect(controller).toContain('const loadSequence = ++state.dataSubjectRequestsLoadSequence');
    expect(controller).toContain('state.dataSubjectRequestsLoadSequence === loadSequence');
    expect(css).toContain('.kc-settings-btn.is-warn');
  });

  test('isola refresh e ações sensíveis por conta e impede limpeza durante protocolo ativo', () => {
    const controller = read('assets/js/controllers/public/settings.controller.js');
    const clearStart = controller.indexOf('function clearBrowserPrivacyData()');
    const clearEnd = controller.indexOf('function renderDataSubjectRequests(items)');
    const clearController = controller.slice(clearStart, clearEnd);
    const refreshStart = controller.indexOf('async function refreshSettingsPage(options)');
    const refreshEnd = controller.indexOf('function initPullToRefresh()');
    const refreshController = controller.slice(refreshStart, refreshEnd);

    expect(clearController.indexOf('hasPrivacyWorkInFlight()')).toBeGreaterThan(-1);
    expect(clearController.indexOf('hasPrivacyWorkInFlight()')).toBeLessThan(
      clearController.indexOf('window.confirm('),
    );
    expect(clearController).toContain('Nenhuma chave da operação em andamento foi removida');
    expect(controller).toContain('accountEmailActionsInFlight: Object.create(null)');
    expect(controller).toContain('async function runAccountEmailAction(config)');
    expect(controller).toContain('locks[actionKey] === true');
    expect(controller).toContain("actionKey: 'resend_confirmation'");
    expect(controller).toContain("actionKey: 'password_reset'");
    expect(controller).toContain('if (!isActiveAccountLoad(generation, userId)) return false;');
    expect(controller).toContain('state.accountEmailActionsInFlight === locks');

    expect(refreshController).toContain('const accountLoadPromise = loadProfile(');
    expect(refreshController).toContain('generation = state.accountLoadGeneration');
    expect(refreshController).toContain('if (!isActiveAccountLoad(generation, guardedUserId)) return;');
    expect(refreshController.indexOf('if (!isActiveAccountLoad(generation, guardedUserId)) return;'))
      .toBeLessThan(refreshController.indexOf("console.error('[Settings] refresh failed:'"));
    expect(refreshController).toContain("if (content) content.style.display = 'grid'");
    expect(refreshController).toContain('renderDataSubjectRequestsUnavailable()');
    expect(refreshController).toContain('Os controles disponíveis permanecem visíveis');
  });
});
