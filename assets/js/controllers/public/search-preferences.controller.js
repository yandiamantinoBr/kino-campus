(function () {
  'use strict';

  var REGISTRY_SRC = 'assets/js/shared/kc-search-registry.generated.js?v=8.6.1';
  var moduleIcons = {
    'achados-perdidos': 'fa-magnifying-glass',
    caronas: 'fa-car',
    'compra-venda': 'fa-bag-shopping',
    eventos: 'fa-calendar',
    moradia: 'fa-house',
    oportunidades: 'fa-briefcase'
  };
  var currentRegistry = null;
  var accountSession = false;
  var lastSyncedState = null;

  function $(selector) { return document.querySelector(selector); }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  function setStatus(message, tone) {
    var element = $('#settingsSearchPreferencesStatus');
    if (!element) return;
    element.textContent = message || '';
    element.dataset.tone = tone || 'info';
    element.classList.toggle('is-visible', !!message);
  }

  function setSyncHint(state) {
    var hint = $('#settingsSearchPreferencesSyncHint');
    if (!hint) return;
    if (!accountSession) {
      hint.innerHTML = '<i class="fas fa-laptop" aria-hidden="true"></i> '
        + '<span>Visitante: as escolhas ficam só neste navegador. Entre na conta para usá-las em qualquer dispositivo.</span>';
      return;
    }
    var scope = state && state.sync && state.sync.scope === 'account' ? 'account' : 'local';
    var when = state && state.updatedAt
      ? new Date(state.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : null;
    if (scope === 'account') {
      hint.innerHTML = '<i class="fas fa-cloud" aria-hidden="true"></i> '
        + '<span>Sincronizado com a sua conta'
        + (when ? ' · atualizado em ' + escapeHtml(when) : '')
        + '. A busca e a descoberta usam estes módulos e assuntos para priorizar resultados relevantes.</span>';
    } else {
      hint.innerHTML = '<i class="fas fa-cloud-arrow-up" aria-hidden="true"></i> '
        + '<span>Há preferências locais ainda não enviadas. Toque em <strong>Salvar preferências</strong> para sincronizar com a conta.</span>';
    }
  }

  function loadRegistry() {
    if (window.KCSearchFieldRegistrySnapshot) return Promise.resolve(window.KCSearchFieldRegistrySnapshot);
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-kc-search-preferences-registry]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.KCSearchFieldRegistrySnapshot); }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = REGISTRY_SRC;
      script.defer = true;
      script.dataset.kcSearchPreferencesRegistry = '1';
      script.addEventListener('load', function () {
        if (!window.KCSearchFieldRegistrySnapshot) {
          reject(new Error('KC_SEARCH_PREFERENCES_REGISTRY_MISSING'));
          return;
        }
        resolve(window.KCSearchFieldRegistrySnapshot);
      }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });
  }

  function emojiSpan(emoji, className) {
    var value = String(emoji || '').trim();
    if (!value) return '';
    return '<span class="' + className + '" aria-hidden="true">' + value + '</span>';
  }

  function moduleVisual(moduleKey, moduleEntry) {
    var emoji = moduleEntry && moduleEntry.emoji ? String(moduleEntry.emoji) : '';
    if (emoji) return emojiSpan(emoji, 'kc-search-preference-choice__emoji');
    var iconClass = (moduleEntry && moduleEntry.icon)
      ? String(moduleEntry.icon)
      : ('fas ' + (moduleIcons[moduleKey] || 'fa-layer-group'));
    return '<span class="kc-search-preference-choice__icon" aria-hidden="true"><i class="' + escapeHtml(iconClass) + '"></i></span>';
  }

  function optionVisual(option) {
    if (option && option.emoji) return emojiSpan(option.emoji, 'kc-search-preference-option__emoji');
    if (option && option.icon) {
      return '<span class="kc-search-preference-option__icon" aria-hidden="true"><i class="' + escapeHtml(option.icon) + '"></i></span>';
    }
    return '<span class="kc-search-preference-option__emoji kc-search-preference-option__emoji--empty" aria-hidden="true">•</span>';
  }

  function renderModules(registry, state) {
    var target = $('#settingsSearchModules');
    if (!target) return;
    var source = registry.registry;
    target.innerHTML = source.moduleKeys.map(function (moduleKey) {
      var moduleEntry = source.modules[moduleKey];
      var checked = state.modules.indexOf(moduleKey) !== -1;
      return [
        '<label class="kc-search-preference-choice' + (checked ? ' is-checked' : '') + '">',
        '  <input type="checkbox" data-search-preference-module="' + escapeHtml(moduleKey) + '"' + (checked ? ' checked' : '') + ' />',
        '  ' + moduleVisual(moduleKey, moduleEntry),
        '  <span class="kc-search-preference-choice__text">' + escapeHtml(moduleEntry.label) + '</span>',
        '</label>'
      ].join('');
    }).join('');
  }

  function renderFeatures(registry, state) {
    var target = $('#settingsSearchTopics');
    if (!target) return;
    var catalog = window.KCSearchPreferences.preferenceCatalog(registry);
    var byModule = {};
    Object.keys(catalog).forEach(function (featureKey) {
      var entry = catalog[featureKey];
      if (!byModule[entry.module]) byModule[entry.module] = [];
      byModule[entry.module].push(entry);
    });

    var moduleOrder = (registry.registry && registry.registry.moduleKeys) || Object.keys(byModule);
    target.innerHTML = moduleOrder.map(function (moduleKey) {
      var groups = byModule[moduleKey];
      if (!groups || !groups.length) return '';
      var moduleEntry = registry.registry.modules[moduleKey] || {};
      var moduleLabel = groups[0].moduleLabel || moduleEntry.label || moduleKey;
      var moduleEmoji = groups[0].moduleEmoji || moduleEntry.emoji || '';
      var heading = moduleEmoji
        ? emojiSpan(moduleEmoji, 'kc-search-preference-module-block__emoji')
        : moduleVisual(moduleKey, moduleEntry);
      return [
        '<section class="kc-search-preference-module-block" data-search-preference-module-block="' + escapeHtml(moduleKey) + '">',
        '  <header class="kc-search-preference-module-block__head">',
        '    ' + heading,
        '    <div>',
        '      <h4>' + escapeHtml(moduleLabel) + '</h4>',
        '      <p>Mesmas categorias do formulário de publicação</p>',
        '    </div>',
        '  </header>',
        '  <div class="kc-search-preference-module-block__groups">',
        groups.map(function (entry, groupIndex) {
          var selected = state.features[entry.key] || [];
          var titleId = ('kc-search-pref-' + moduleKey + '-' + entry.key + '-' + groupIndex)
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-');
          return [
            '<section class="kc-search-preference-group" role="group" aria-labelledby="' + escapeHtml(titleId) + '">',
            '  <h5 class="kc-search-preference-group__title" id="' + escapeHtml(titleId) + '">' + escapeHtml(entry.label) + '</h5>',
            '  <div class="kc-search-preference-options">',
            entry.options.map(function (option) {
              var checked = selected.indexOf(option.key) !== -1;
              return [
                '<label class="kc-search-preference-option' + (checked ? ' is-checked' : '') + '" title="' + escapeHtml(option.label) + '">',
                '  <input type="checkbox" data-search-preference-feature="' + escapeHtml(entry.key) + '" value="' + escapeHtml(option.key) + '"' + (checked ? ' checked' : '') + ' />',
                '  ' + optionVisual(option),
                '  <span class="kc-search-preference-option__label">' + escapeHtml(option.label) + '</span>',
                '</label>'
              ].join('');
            }).join(''),
            '  </div>',
            '</section>'
          ].join('');
        }).join(''),
        '  </div>',
        '</section>'
      ].join('');
    }).join('');
  }

  function syncAvailability() {
    var personalized = $('#settingsSearchPersonalized') && $('#settingsSearchPersonalized').checked;
    var controls = document.querySelectorAll('[data-search-preference-module], [data-search-preference-feature], #settingsSearchAffinity');
    controls.forEach(function (control) { control.disabled = !personalized; });
    var label = $('#settingsSearchModeLabel');
    if (label) label.textContent = personalized ? 'Personalização ativa' : 'Ordem padrão';
    var panel = $('#settingsSearchPreferenceControls');
    if (panel) panel.classList.toggle('is-disabled', !personalized);
    var affinity = $('#settingsSearchAffinity');
    if (affinity && !personalized) affinity.checked = false;
  }

  function collectState() {
    var personalized = $('#settingsSearchPersonalized') && $('#settingsSearchPersonalized').checked;
    var modules = Array.from(document.querySelectorAll('[data-search-preference-module]:checked'))
      .map(function (control) { return control.dataset.searchPreferenceModule; });
    var features = {};
    document.querySelectorAll('[data-search-preference-feature]:checked').forEach(function (control) {
      var key = control.dataset.searchPreferenceFeature;
      if (!features[key]) features[key] = [];
      features[key].push(control.value);
    });
    return {
      mode: personalized ? window.KCSearchPreferences.MODES.PERSONALIZED : window.KCSearchPreferences.MODES.STANDARD,
      modules: personalized ? modules : [],
      features: personalized ? features : {},
      localAffinityConsent: personalized && $('#settingsSearchAffinity') && $('#settingsSearchAffinity').checked
    };
  }

  function populate(state) {
    var toggle = $('#settingsSearchPersonalized');
    var affinity = $('#settingsSearchAffinity');
    if (toggle) toggle.checked = window.KCSearchPreferences.isPersonalized(state);
    if (affinity) affinity.checked = state.localAffinityConsent === true;
    renderModules(currentRegistry, state);
    renderFeatures(currentRegistry, state);
    syncAvailability();
    setSyncHint(state);
    lastSyncedState = state;
  }

  function emitChange(state) {
    window.dispatchEvent(new CustomEvent('kc:search-preferences-change', { detail: state }));
  }

  function hasAccountApi() {
    return !!(window.KCAPI
      && typeof window.KCAPI.getSearchPreferences === 'function'
      && typeof window.KCAPI.updateSearchPreferences === 'function'
      && typeof window.KCAPI.getCurrentUser === 'function');
  }

  async function resolveAccountSession() {
    if (!hasAccountApi()) return false;
    try {
      var sessionUser = await window.KCAPI.getCurrentUser();
      return !!(sessionUser && sessionUser.id);
    } catch (_) {
      return false;
    }
  }

  async function hydrateFromAccount() {
    var local = window.KCSearchPreferences.load({ registry: currentRegistry });
    accountSession = await resolveAccountSession();
    if (!accountSession) {
      populate(local);
      setStatus('', 'info');
      return local;
    }

    setStatus('Carregando preferências da conta…', 'info');
    try {
      var remote = await window.KCAPI.getSearchPreferences();
      var merge = window.KCSearchPreferences.mergeLocalAndRemote(local, remote, currentRegistry);
      var state = merge.state;

      if (merge.shouldWriteLocal) {
        state = window.KCSearchPreferences.save(state, {
          registry: currentRegistry,
          scope: 'account',
          now: function () { return state.updatedAt || new Date().toISOString(); }
        });
      }

      if (merge.shouldPushRemote) {
        var push = await window.KCAPI.updateSearchPreferences(
          window.KCSearchPreferences.toRemotePayload(state, currentRegistry)
        );
        if (push && push.ok && push.data && push.data.preferences) {
          state = window.KCSearchPreferences.save(push.data.preferences, {
            registry: currentRegistry,
            scope: 'account',
            now: function () {
              return (push.data.preferences.updatedAt) || new Date().toISOString();
            }
          });
        }
      } else if (!state.sync || state.sync.scope !== 'account') {
        state = window.KCSearchPreferences.normalizeState(Object.assign({}, state, {
          sync: { scope: 'account', remoteUpdatedAt: remote && remote.updatedAt, lastSyncedAt: remote && remote.updatedAt }
        }), currentRegistry);
        window.KCSearchPreferences.save(state, {
          registry: currentRegistry,
          scope: 'account',
          now: function () { return state.updatedAt || new Date().toISOString(); }
        });
      }

      populate(state);
      emitChange(state);
      setStatus(
        window.KCSearchPreferences.isPersonalized(state)
          ? 'Preferências da conta aplicadas à busca e à descoberta.'
          : 'Conta sincronizada. Ative a personalização para priorizar módulos e assuntos.',
        'success'
      );
      return state;
    } catch (error) {
      console.error('[SearchPreferences] hydrate failed:', error);
      populate(local);
      setStatus('Não foi possível sincronizar agora. Usando o cache deste navegador.', 'error');
      return local;
    }
  }

  async function save() {
    var draft = collectState();
    try {
      var state = window.KCSearchPreferences.save(draft, {
        registry: currentRegistry,
        scope: accountSession ? 'account' : 'local'
      });

      if (accountSession) {
        setStatus('Salvando na conta…', 'info');
        var remoteResult = await window.KCAPI.updateSearchPreferences(
          window.KCSearchPreferences.toRemotePayload(state, currentRegistry)
        );
        if (!remoteResult || !remoteResult.ok) {
          // Local save already succeeded — keep it and surface the remote error.
          populate(state);
          emitChange(state);
          setStatus(
            (remoteResult && remoteResult.error && remoteResult.error.message)
              || 'Preferências salvas neste navegador, mas a sincronização com a conta falhou. Tente de novo.',
            'error'
          );
          return;
        }
        state = window.KCSearchPreferences.save(
          remoteResult.data && remoteResult.data.preferences
            ? remoteResult.data.preferences
            : state,
          {
            registry: currentRegistry,
            scope: 'account',
            now: function () {
              return (remoteResult.data
                && remoteResult.data.preferences
                && remoteResult.data.preferences.updatedAt)
                || new Date().toISOString();
            }
          }
        );
      }

      populate(state);
      emitChange(state);
      if (accountSession) {
        setStatus(
          state.mode === 'personalized'
            ? 'Preferências salvas na conta. A busca já prioriza seus módulos e assuntos em qualquer dispositivo.'
            : 'Personalização desligada e sincronizada na conta. A busca volta à ordem padrão.',
          'success'
        );
      } else {
        setStatus(
          state.mode === 'personalized'
            ? 'Preferências salvas neste navegador. Entre na conta para usá-las em outros dispositivos.'
            : 'Ordem padrão ativada neste navegador.',
          'success'
        );
      }
    } catch (error) {
      console.error('[SearchPreferences] save failed:', error);
      setStatus('Não foi possível salvar as preferências: ' + ((error && error.message) || 'erro desconhecido'), 'error');
    }
  }

  async function clear() {
    var confirmMsg = accountSession
      ? 'Remover preferências de busca da conta e deste navegador? A busca volta à ordem padrão em todos os dispositivos.'
      : 'Remover preferências e afinidade de busca deste navegador?';
    if (!window.confirm(confirmMsg)) return;

    var state = window.KCSearchPreferences.clear();
    if (accountSession) {
      try {
        var remoteResult = await window.KCAPI.updateSearchPreferences(
          window.KCSearchPreferences.toRemotePayload(state, currentRegistry)
        );
        if (remoteResult && remoteResult.ok) {
          state = window.KCSearchPreferences.save(
            (remoteResult.data && remoteResult.data.preferences) || state,
            { registry: currentRegistry, scope: 'account' }
          );
        }
      } catch (error) {
        console.error('[SearchPreferences] remote clear failed:', error);
      }
    }
    populate(state);
    emitChange(state);
    setStatus(
      accountSession
        ? 'Preferências removidas da conta e deste navegador.'
        : 'Preferências e afinidade removidas deste navegador.',
      'success'
    );
  }

  function bindEvents() {
    $('#settingsSearchPersonalized').addEventListener('change', syncAvailability);
    $('#settingsSaveSearchPreferences').addEventListener('click', function () { save(); });
    var clearBtn = $('#settingsClearSearchPreferences');
    if (clearBtn) clearBtn.addEventListener('click', function () { clear(); });
  }

  async function init() {
    if (!window.KCSearchPreferences || !$('#settingsSearchPreferences')) return;
    try {
      currentRegistry = await loadRegistry();
      bindEvents();
      await hydrateFromAccount();
    } catch (error) {
      console.error('[SearchPreferences] initialization failed:', error);
      setStatus('As preferências de busca estão temporariamente indisponíveis.', 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
