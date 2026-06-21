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

  function renderModules(registry, state) {
    var target = $('#settingsSearchModules');
    if (!target) return;
    var source = registry.registry;
    target.innerHTML = source.moduleKeys.map(function (moduleKey) {
      var moduleEntry = source.modules[moduleKey];
      var checked = state.modules.indexOf(moduleKey) !== -1;
      return [
        '<label class="kc-search-preference-choice">',
        '  <input type="checkbox" data-search-preference-module="' + escapeHtml(moduleKey) + '"' + (checked ? ' checked' : '') + ' />',
        '  <span class="kc-search-preference-choice__icon" aria-hidden="true"><i class="fas ' + escapeHtml(moduleIcons[moduleKey] || 'fa-layer-group') + '"></i></span>',
        '  <span>' + escapeHtml(moduleEntry.label) + '</span>',
        '</label>'
      ].join('');
    }).join('');
  }

  function renderFeatures(registry, state) {
    var target = $('#settingsSearchTopics');
    if (!target) return;
    var catalog = window.KCSearchPreferences.preferenceCatalog(registry);
    target.innerHTML = Object.keys(catalog).map(function (featureKey) {
      var entry = catalog[featureKey];
      var selected = state.features[featureKey] || [];
      var moduleLabel = registry.registry.modules[entry.module].label;
      return [
        '<fieldset class="kc-search-preference-group">',
        '  <legend>' + escapeHtml(moduleLabel) + ' · ' + escapeHtml(entry.label) + '</legend>',
        '  <div class="kc-search-preference-options">',
        entry.options.map(function (option) {
          var checked = selected.indexOf(option.key) !== -1;
          return '<label><input type="checkbox" data-search-preference-feature="' + escapeHtml(featureKey) + '" value="' + escapeHtml(option.key) + '"' + (checked ? ' checked' : '') + ' /><span>' + escapeHtml(option.label) + '</span></label>';
        }).join(''),
        '  </div>',
        '</fieldset>'
      ].join('');
    }).join('');
  }

  function syncAvailability() {
    var personalized = $('#settingsSearchPersonalized') && $('#settingsSearchPersonalized').checked;
    var controls = document.querySelectorAll('[data-search-preference-module], [data-search-preference-feature], #settingsSearchAffinity');
    controls.forEach(function (control) { control.disabled = !personalized; });
    var label = $('#settingsSearchModeLabel');
    if (label) label.textContent = personalized ? 'Personalizada' : 'Não personalizada';
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
  }

  function save() {
    try {
      var state = window.KCSearchPreferences.save(collectState(), { registry: currentRegistry });
      populate(state);
      window.dispatchEvent(new CustomEvent('kc:search-preferences-change', { detail: state }));
      setStatus(state.mode === 'personalized'
        ? 'Preferências salvas somente neste navegador.'
        : 'Modo não personalizado ativado. Preferências e afinidade local foram removidas.', 'success');
    } catch (error) {
      console.error('[SearchPreferences] save failed:', error);
      setStatus('Não foi possível salvar neste navegador.', 'error');
    }
  }

  function downloadExport() {
    try {
      var payload = window.KCSearchPreferences.exportData({ registry: currentRegistry });
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      var objectUrl = link.href;
      link.download = 'kinocampus-preferencias-busca.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setStatus('Cópia local exportada em JSON.', 'success');
    } catch (error) {
      console.error('[SearchPreferences] export failed:', error);
      setStatus('Não foi possível exportar os dados locais.', 'error');
    }
  }

  function clear() {
    if (!window.confirm('Remover preferências e afinidade de busca deste navegador?')) return;
    var state = window.KCSearchPreferences.clear();
    populate(state);
    window.dispatchEvent(new CustomEvent('kc:search-preferences-change', { detail: state }));
    setStatus('Preferências e afinidade local removidas deste navegador.', 'success');
  }

  function bindEvents() {
    $('#settingsSearchPersonalized').addEventListener('change', syncAvailability);
    $('#settingsSaveSearchPreferences').addEventListener('click', save);
    $('#settingsExportSearchPreferences').addEventListener('click', downloadExport);
    $('#settingsClearSearchPreferences').addEventListener('click', clear);
  }

  async function init() {
    if (!window.KCSearchPreferences || !$('#settingsSearchPreferences')) return;
    try {
      currentRegistry = await loadRegistry();
      populate(window.KCSearchPreferences.load({ registry: currentRegistry }));
      bindEvents();
    } catch (error) {
      console.error('[SearchPreferences] initialization failed:', error);
      setStatus('As preferências de busca estão temporariamente indisponíveis.', 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
