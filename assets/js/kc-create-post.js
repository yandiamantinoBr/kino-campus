/* KinoCampus — kc-create-post.js
   Modal de criação/edição de publicações.
   Extraído de kc-core.js (F1).
*/



function isProductionRuntime() {
  return !!(KC_ENV && KC_ENV.isProduction === true);
}

// Helper local
function _esc(str) { return KCUtils.escapeHtml(str); }

/**
 * Aplica formatação markdown no textarea de descrição.
 * Reutiliza a mesma lógica do toolbar de comentários.
 */
function _kcFormatDescriptionField(textarea, format) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  const hasSelection = !!selectedText;

  const wrapSelection = function (before, after, fallbackText) {
    const baseText = hasSelection ? selectedText : (fallbackText || 'texto');
    const formatted = `${before}${baseText}${after}`;
    textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
    textarea.focus();
    const cursorEnd = start + formatted.length;
    textarea.selectionStart = cursorEnd;
    textarea.selectionEnd = cursorEnd;
  };

  const insertBlock = function (blockText) {
    const prefix = (start > 0 && textarea.value[start - 1] !== '\n') ? '\n' : '';
    const suffix = (end < textarea.value.length && textarea.value[end] !== '\n') ? '\n' : '';
    const formatted = `${prefix}${blockText}${suffix}`;
    textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
    textarea.focus();
    const cursorEnd = start + formatted.length;
    textarea.selectionStart = cursorEnd;
    textarea.selectionEnd = cursorEnd;
  };

  switch (format) {
    case 'bold':         wrapSelection('**', '**', 'negrito'); break;
    case 'italic':       wrapSelection('*', '*', 'itálico'); break;
    case 'underline':    wrapSelection('__', '__', 'sublinhado'); break;
    case 'strikethrough': wrapSelection('~~', '~~', 'tachado'); break;
    case 'inlinecode':   wrapSelection('`', '`', 'código'); break;
    case 'quote':        insertBlock(`> ${hasSelection ? selectedText : 'citação'}`); break;
    case 'bullet':       insertBlock(`- ${hasSelection ? selectedText : 'item da lista'}`); break;
    case 'link': {
      const label = hasSelection ? selectedText : 'texto do link';
      const formatted = `[${label}](https://)`;
      textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
      const cursorStart = start + formatted.length - 1;
      textarea.focus();
      textarea.selectionStart = cursorStart;
      textarea.selectionEnd = cursorStart;
      break;
    }
    default: return;
  }

  _kcUpdateDescPreview(textarea);
  // Trigger input event so value is captured
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Atualiza a pré-visualização da descrição com markdown renderizado.
 */
function _kcUpdateDescPreview(textarea) {
  const preview = document.getElementById('kcDescPreview');
  if (!preview) return;
  const value = String(textarea.value || '').trim();
  if (!value) {
    preview.style.display = 'none';
    preview.innerHTML = '';
    return;
  }
  const renderMd = (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function')
    ? window.KCUtils.renderMarkdownInline
    : _esc;
  preview.style.display = 'block';
  preview.innerHTML = renderMd(value);
}

// -----------------------------
// Create Post Modal (Design React + Form dinâmico por módulo)
// -----------------------------

window._KCCreatePost = window._KCCreatePost || {};
window._KCCreatePost.schema = window._KCCreatePost.schema || {};

const KC_CREATE_MODAL_ID = window._KCCreatePost.schema.modalId || 'kcCreatePostModalOverlay';
const KC_POST_VISIBILITY_OPTIONS = window._KCCreatePost.schema.visibilityOptions || Object.freeze([
  Object.freeze({
    value: 'community',
    label: 'Apenas para comunidade',
    hint: 'Visível só para pessoas com conta no KinoCampus.'
  }),
  Object.freeze({
    value: 'public',
    label: 'Público',
    hint: 'Pode aparecer também para visitantes sem conta.'
  })
]);
const KC_CREATE_SCHEMA = window._KCCreatePost.schema.modules || Object.freeze({});

let kcCreateSchemaWarningShown = false;

function kcHasCreateSchemaLoaded() {
  return !!(KC_CREATE_SCHEMA && Object.keys(KC_CREATE_SCHEMA).length);
}

function kcNotifyCreateSchemaUnavailable() {
  if (!kcCreateSchemaWarningShown) {
    console.error('[KinoCampus] kc-create-post schema unavailable.');
    kcCreateSchemaWarningShown = true;
  }
  if (typeof showToast === 'function') {
    showToast('Não foi possível carregar o formulário agora. Recarregue a página.', 'error', 2600);
  }
  return false;
}

const kcCreateState = {
  open: false,
  moduleKey: null,
  selections: {}, // groupId -> key
  values: {},
  submitting: false,

  // Imagens (máx 5: 1 capa + 4)
  images: [], // [{ id, dataUrl, name, size, isExisting? }]
  coverImageId: null,

  // Modo edição
  editMode: false,
  editPostId: null,
  editCallback: null,
};

// Expõe referência ao estado para sub-módulos (v11.31.3)
window._KCCreatePost._state = kcCreateState;

let kcLastFocus = null;

function kcNormalizePostVisibilityValue(value, fallback) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'public') return 'public';
  if (raw === 'community') return 'community';
  return String(fallback || 'community').trim().toLowerCase() === 'public' ? 'public' : 'community';
}

function kcParseBRLNumber(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  // aceita "1.234,56" ou "1234.56"
  const cleaned = s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function kcNormalizeMoneyInput(input) {
  const n = kcParseBRLNumber(input);
  if (n == null) return null;
  return n.toFixed(2).replace('.', ',');
}

function kcGetSchema(moduleKey) {
  return KC_CREATE_SCHEMA[String(moduleKey || '')] || null;
}

function kcEnsureCreateModal() {
  if (document.getElementById(KC_CREATE_MODAL_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = KC_CREATE_MODAL_ID;
  overlay.className = 'kc-modal-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="kc-create-modal" role="dialog" aria-modal="true" aria-labelledby="kcCreateModalTitle">
      <div class="kc-create-modal__header">
        <h2 id="kcCreateModalTitle"><i class="fas fa-plus-circle"></i> Nova Publicação</h2>
        <button type="button" class="kc-create-modal__close" aria-label="Fechar"><i class="fas fa-times"></i></button>
      </div>
      <div class="kc-create-modal__body">
        <div class="kc-create-step">
          <label class="kc-create-label">O que você vai publicar?</label>
          <div class="kc-create-grid" id="kcCreateModuleGrid"></div>
        </div>

        <form id="kcCreatePostForm" class="kc-create-form" novalidate>
          <div id="kcCreateDynamic"></div>
          <button type="submit" class="kc-create-submit" disabled>Publicar Agora</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Click fora fecha — com confirmação se houver dados preenchidos
  function kcMaybeCloseCreatePostModal() {
    const hasTitulo = String(kcCreateState.values && kcCreateState.values.titulo || '').trim().length > 0;
    const hasDescricao = String(kcCreateState.values && kcCreateState.values.descricao || '').trim().length > 0;
    const hasImages = !!(kcCreateState.images && kcCreateState.images.length > 0);
    if (kcCreateState.moduleKey && (hasTitulo || hasDescricao || hasImages)) {
      if (!window.confirm('Descartar publicação? As informações preenchidas serão perdidas.')) return;
    }
    kcCloseCreatePostModal();
  }

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) kcMaybeCloseCreatePostModal();
  });

  const closeBtn = overlay.querySelector('.kc-create-modal__close');
  if (closeBtn) closeBtn.addEventListener('click', kcMaybeCloseCreatePostModal);

  // Delegation: módulo / tags
  overlay.addEventListener('click', (e) => {
    const moduleBtn = e.target.closest('[data-kc-module]');
    if (moduleBtn) {
      kcCaptureCreateValues();
      kcCreateState.moduleKey = moduleBtn.getAttribute('data-kc-module');
      kcCreateState.selections = {};
      kcCreateState.values = {};
      kcCreateState.images = [];
      kcCreateState.coverImageId = null;
      kcRenderCreateModal();
      return;
    }

    const chip = e.target.closest('[data-kc-chip]');
    if (chip) {
      kcCaptureCreateValues();
      const groupId = chip.getAttribute('data-kc-group');
      const key = chip.getAttribute('data-kc-chip');
      kcCreateState.selections[groupId] = key;
      // auto-sugestão: Sustentabilidade -> marca "sustentável" por padrão
      if (groupId === 'topico' && key === 'sustentabilidade') kcCreateState.values.sustentavel = true;
      kcRenderCreateModal();
      return;
    }

    const areaSuggestion = e.target.closest('[data-kc-area-suggestion]');
    if (areaSuggestion) {
      const value = areaSuggestion.getAttribute('data-kc-area-suggestion') || '';
      kcCreateState.values.areaAtuacao = value;
      const areaInput = overlay.querySelector('input[name="areaAtuacao"]');
      if (areaInput) areaInput.value = value;
      return;
    }

    const housingRegionSuggestion = e.target.closest('[data-kc-housing-region-suggestion]');
    if (housingRegionSuggestion) {
      const value = housingRegionSuggestion.getAttribute('data-kc-housing-region-suggestion') || '';
      const fieldContainer = housingRegionSuggestion.closest('.kc-field--housing-region');
      const regionInput = fieldContainer
        ? fieldContainer.querySelector('[data-kc-housing-region-input]')
        : overlay.querySelector('input[name="regiao"]');
      if (regionInput) {
        regionInput.value = value;
        const fieldName = regionInput.getAttribute('name') || 'regiao';
        kcCreateState.values[fieldName] = value;
        kcSyncHousingRegionInput(regionInput);
      }
      return;
    }

    const showMorePills = e.target.closest('[data-kc-show-more-pills]');
    if (showMorePills) {
      const field = showMorePills.closest('.kc-field--housing-region');
      if (field) {
        const extra = field.querySelector('.kc-field-pill-row--extra');
        const lessBtn = field.querySelector('[data-kc-show-more-pills][style*="display:none"], [data-kc-show-more-pills]:not([style*="display:none"]) ~ [data-kc-show-more-pills]');
        const allShowMore = field.querySelectorAll('[data-kc-show-more-pills]');
        if (extra && extra.style.display === 'none') {
          extra.style.display = '';
          if (allShowMore[0]) { allShowMore[0].innerHTML = 'Ver menos <i class="fas fa-chevron-up"></i>'; }
        } else if (extra) {
          extra.style.display = 'none';
          if (allShowMore[0]) { allShowMore[0].innerHTML = 'Ver mais <i class="fas fa-chevron-down"></i>'; }
        }
      }
      return;
    }

    const lostFoundLocationSuggestion = e.target.closest('[data-kc-lostfound-location-suggestion]');
    if (lostFoundLocationSuggestion) {
      const value = lostFoundLocationSuggestion.getAttribute('data-kc-lostfound-location-suggestion') || '';
      kcCreateState.values.localizacao = value;
      const locationInput = overlay.querySelector('input[name="localizacao"]');
      if (locationInput) {
        locationInput.value = value;
        kcSyncLostFoundLocationInput(locationInput);
      }
      return;
    }

    const housingFeatureSuggestion = e.target.closest('[data-kc-housing-feature-suggestion]');
    if (housingFeatureSuggestion) {
      const field = kcGetHousingFeatureFieldContext(housingFeatureSuggestion);
      const hidden = field ? field.querySelector('[data-kc-housing-features-value]') : null;
      const current = kcParseStringArrayValue(hidden ? hidden.value : '');
      const nextValue = housingFeatureSuggestion.getAttribute('data-kc-housing-feature-suggestion') || '';
      const resolvedEntry = kcResolveHousingFeatureEntries(current).find((entry) => entry.label === nextValue);
      const nextList = resolvedEntry
        ? kcResolveHousingFeatureEntries(current).filter((entry) => entry.key !== resolvedEntry.key).map((entry) => entry.label)
        : current.concat(nextValue);
      kcSyncHousingFeatureField(field, nextList);
      return;
    }

    const removeHousingFeature = e.target.closest('[data-kc-housing-feature-remove]');
    if (removeHousingFeature) {
      const field = kcGetHousingFeatureFieldContext(removeHousingFeature);
      const hidden = field ? field.querySelector('[data-kc-housing-features-value]') : null;
      const current = kcResolveHousingFeatureEntries(hidden ? hidden.value : '');
      const removeKey = removeHousingFeature.getAttribute('data-kc-housing-feature-remove') || '';
      kcSyncHousingFeatureField(field, current.filter((entry) => entry.key !== removeKey).map((entry) => entry.label));
      return;
    }

    const addHousingFeature = e.target.closest('[data-kc-housing-feature-add]');
    if (addHousingFeature) {
      const field = kcGetHousingFeatureFieldContext(addHousingFeature);
      const input = field ? field.querySelector('[data-kc-housing-features-input="true"]') : null;
      kcAppendHousingFeatureFromInput(input);
      return;
    }

    const imgActionBtn = e.target.closest('[data-kc-img-action]');
    if (imgActionBtn) {
      const action = imgActionBtn.getAttribute('data-kc-img-action');
      const id = imgActionBtn.getAttribute('data-kc-img-id');
      if (action === 'remove') kcRemoveCreateImageById(id);
      if (action === 'cover') kcSetCreateCoverImageById(id);
      return;
    }

    const openImagesBtn = e.target.closest('[data-kc-open-images]');
    if (openImagesBtn) {
      const input = overlay.querySelector('#kcImagesInput');
      if (input && !input.disabled) input.click();
      return;
    }
  });

  // Form: input binding
  const form = overlay.querySelector('#kcCreatePostForm');
  if (form) {
    form.addEventListener('input', () => kcCaptureCreateValues());
    form.addEventListener('change', (e) => {
      kcCaptureCreateValues();
      const target = e && e.target;
      if (target && target.name === 'visibility') kcRenderCreateModal();
    });
    form.addEventListener('keydown', (e) => {
      const target = e.target;
      if (!target || !target.matches || !target.matches('[data-kc-housing-features-input="true"]')) return;
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        kcAppendHousingFeatureFromInput(target);
        kcCaptureCreateValues();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      kcHandleCreateSubmit();
    });
  }

  // Description formatting toolbar delegation
  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kc-desc-format]');
    if (!btn) return;
    e.preventDefault();
    const format = btn.getAttribute('data-kc-desc-format');
    const textarea = overlay.querySelector('#kcField_descricao');
    if (!textarea || !format) return;
    _kcFormatDescriptionField(textarea, format);
  });

  // Description preview on input
  overlay.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'kcField_descricao') {
      _kcUpdateDescPreview(e.target);
    }
  });

  // Imagens: input/drag&drop
  overlay.addEventListener('change', async (e) => {
    const target = e.target;
    if (!target) return;
    if (target.matches && target.matches('[data-kc-opportunity-area-input]')) {
      const resolved = kcResolveOpportunityAreaValue(target.value);
      if (resolved && resolved.label) {
        target.value = resolved.label;
        kcCreateState.values[target.name] = resolved.label;
      }
      return;
    }
    if (target.matches && target.matches('[data-kc-housing-region-input]')) {
      kcSyncHousingRegionInput(target);
      return;
    }
    if (target.matches && target.matches('[data-kc-lostfound-location-input]')) {
      kcSyncLostFoundLocationInput(target);
      return;
    }
    if (target.id !== 'kcImagesInput') return;
    const files = target.files;
    if (files && files.length) await kcAddImagesFromFiles(files);
    // permite selecionar o mesmo arquivo novamente
    try { target.value = ''; } catch { }
  });

  overlay.addEventListener('dragover', (e) => {
    const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
    if (!dz) return;
    e.preventDefault();
    dz.classList.add('is-dragover');
  });

  overlay.addEventListener('dragleave', (e) => {
    const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
    if (!dz) return;
    dz.classList.remove('is-dragover');
  });

  overlay.addEventListener('drop', async (e) => {
    const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
    if (!dz) return;
    e.preventDefault();
    dz.classList.remove('is-dragover');
    const files = e.dataTransfer ? e.dataTransfer.files : null;
    if (files && files.length) await kcAddImagesFromFiles(files);
  });

  // ESC fecha

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && kcCreateState.open) kcCloseCreatePostModal();
  });
}

function kcCaptureCreateValues() {
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;
  const form = overlay.querySelector('#kcCreatePostForm');
  if (!form) return;
  const fd = new FormData(form);
  const values = { ...kcCreateState.values };
  for (const [k, v] of fd.entries()) values[k] = v;
  form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    const name = cb.getAttribute('name');
    if (!name) return;
    values[name] = cb.checked;
  });
  form.querySelectorAll('[data-kc-housing-features-value]').forEach((input) => {
    const name = input.getAttribute('name');
    if (!name) return;
    values[name] = kcParseStringArrayValue(input.value);
  });
  kcCreateState.values = values;
}

function kcGetActiveCreateFieldNames(moduleKey, selections, values) {
  const names = new Set(['titulo', 'descricao', 'visibility', 'sustentavel']);
  const fields = kcBuildFieldsForModule(moduleKey, selections || {}, values || {});
  fields.forEach((field) => {
    if (!field || !field.name) return;
    names.add(String(field.name));
  });
  return names;
}

function kcReadActiveCreateValue(activeFieldNames, values, name, fallback) {
  if (!name || !(activeFieldNames instanceof Set) || !activeFieldNames.has(name)) {
    return fallback;
  }
  if (!values || !Object.prototype.hasOwnProperty.call(values, name)) {
    return fallback;
  }
  const nextValue = values[name];
  return nextValue == null ? fallback : nextValue;
}

function kcReadActiveCreateStringValue(activeFieldNames, values, name, fallback) {
  const resolved = kcReadActiveCreateValue(activeFieldNames, values, name, fallback == null ? '' : fallback);
  return String(resolved == null ? '' : resolved).trim();
}

function kcReadActiveCreateArrayValue(activeFieldNames, values, name) {
  const resolved = kcReadActiveCreateValue(activeFieldNames, values, name, []);
  if (Array.isArray(resolved)) return resolved;
  if (typeof resolved === 'string') return kcParseStringArrayValue(resolved);
  return [];
}

function kcReadActiveCreateBooleanValue(activeFieldNames, values, name, fallback) {
  const resolved = kcReadActiveCreateValue(activeFieldNames, values, name, fallback === true);
  if (typeof resolved === 'string') {
    const normalized = resolved.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on';
  }
  return !!resolved;
}

function kcTagLabel(schema, groupId, key) {
  const group = (schema && Array.isArray(schema.tagGroups)) ? schema.tagGroups.find(g => g.id === groupId) : null;
  const opt = group && Array.isArray(group.options) ? group.options.find(o => o.key === key) : null;
  return opt ? opt.label : '';
}

// ─── Resolvers de domínio: extraído para kc-create-post.resolvers.js (v11.31.4) ──
// Stubs de delegação — lógica real em window._KCCreatePost.resolvers

function _kcResolversModule() {
  return window._KCCreatePost && window._KCCreatePost.resolvers;
}

function kcNormalizeOpportunityTypeKey(value) {
  var r = _kcResolversModule();
  return (r && typeof r.normalizeOpportunityTypeKey === 'function') ? r.normalizeOpportunityTypeKey(value) : '';
}

function kcGetOpportunityTypeOptionKey(value) {
  var r = _kcResolversModule();
  return (r && typeof r.getOpportunityTypeOptionKey === 'function') ? r.getOpportunityTypeOptionKey(value) : '';
}

function kcResolveOpportunityAreaValue(value, fallbackSource) {
  var r = _kcResolversModule();
  return (r && typeof r.resolveOpportunityAreaValue === 'function')
    ? r.resolveOpportunityAreaValue(value, fallbackSource)
    : { key: '', label: String(value || ''), icon: 'fas fa-briefcase', isKnown: false };
}

function kcGetOpportunityAreaOptions() {
  var r = _kcResolversModule();
  return (r && typeof r.getOpportunityAreaOptions === 'function') ? r.getOpportunityAreaOptions() : [];
}

function kcResolveOpportunityWorkMode(value) {
  var r = _kcResolversModule();
  return (r && typeof r.resolveOpportunityWorkMode === 'function') ? r.resolveOpportunityWorkMode(value) : { key: '', label: '' };
}

function kcResolveOpportunityRegime(value) {
  var r = _kcResolversModule();
  return (r && typeof r.resolveOpportunityRegime === 'function') ? r.resolveOpportunityRegime(value) : { key: '', label: '' };
}

function kcNormalizeHousingTypeKey(value) {
  var r = _kcResolversModule();
  return (r && typeof r.normalizeHousingTypeKey === 'function') ? r.normalizeHousingTypeKey(value) : '';
}

function kcGetHousingTypeOptionKey(value) {
  var r = _kcResolversModule();
  return (r && typeof r.getHousingTypeOptionKey === 'function') ? r.getHousingTypeOptionKey(value) : '';
}

function kcParseStringArrayValue(value) {
  var r = _kcResolversModule();
  return (r && typeof r.parseStringArray === 'function') ? r.parseStringArray(value) : [];
}

function kcSerializeHousingFeatureValues(values) {
  var r = _kcResolversModule();
  return (r && typeof r.serializeHousingFeatureValues === 'function') ? r.serializeHousingFeatureValues(values) : '[]';
}

function kcResolveHousingRegionValue(value, fallbackSource) {
  var r = _kcResolversModule();
  return (r && typeof r.resolveHousingRegionValue === 'function')
    ? r.resolveHousingRegionValue(value, fallbackSource)
    : { key: '', label: String(value || ''), icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isKnown: false };
}

function kcGetHousingRegionOptions() {
  var r = _kcResolversModule();
  return (r && typeof r.getHousingRegionOptions === 'function') ? r.getHousingRegionOptions() : [];
}

function kcResolveHousingFeatureValues(values, fallbackSource) {
  var r = _kcResolversModule();
  return (r && typeof r.resolveHousingFeatureValues === 'function') ? r.resolveHousingFeatureValues(values, fallbackSource) : [];
}

function kcGetHousingFeatureOptions() {
  var r = _kcResolversModule();
  return (r && typeof r.getHousingFeatureOptions === 'function') ? r.getHousingFeatureOptions() : [];
}

function kcGetHousingFeatureFieldContext(element) {
  var r = _kcResolversModule();
  return (r && typeof r.getHousingFeatureFieldContext === 'function') ? r.getHousingFeatureFieldContext(element) : null;
}

function kcResolveHousingFeatureEntries(values) {
  var r = _kcResolversModule();
  return (r && typeof r.resolveHousingFeatureEntries === 'function') ? r.resolveHousingFeatureEntries(values) : [];
}

function kcSyncHousingFeatureField(fieldRoot, values) {
  var r = _kcResolversModule();
  return (r && typeof r.syncHousingFeatureField === 'function') ? r.syncHousingFeatureField(fieldRoot, values) : [];
}

function kcAppendHousingFeatureFromInput(input) {
  var r = _kcResolversModule();
  if (r && typeof r.appendHousingFeatureFromInput === 'function') r.appendHousingFeatureFromInput(input);
}

function kcResolveCaronasLocationValue(value) {
  var r = _kcResolversModule();
  return (r && typeof r.resolveCaronasLocationValue === 'function')
    ? r.resolveCaronasLocationValue(value)
    : { key: '', label: String(value || ''), icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isCampus: false, isKnown: false, source: 'fallback' };
}

function kcGetCaronasCampusOptions() {
  var r = _kcResolversModule();
  return (r && typeof r.getCaronasCampusOptions === 'function') ? r.getCaronasCampusOptions() : [];
}

function kcGetCaronasFeatureOptions() {
  var r = _kcResolversModule();
  return (r && typeof r.getCaronasFeatureOptions === 'function') ? r.getCaronasFeatureOptions() : [];
}

function kcSyncHousingRegionInput(input) {
  var r = _kcResolversModule();
  return (r && typeof r.syncHousingRegionInput === 'function') ? r.syncHousingRegionInput(input) : null;
}

function kcResolveLostFoundLocationValue(value, fallbackSource) {
  var r = _kcResolversModule();
  return (r && typeof r.resolveLostFoundLocationValue === 'function')
    ? r.resolveLostFoundLocationValue(value, fallbackSource)
    : { key: '', label: String(value || ''), icon: 'fas fa-map-marker-alt', emoji: '\uD83D\uDCCD', isKnown: false };
}

function kcGetLostFoundLocationOptions() {
  var r = _kcResolversModule();
  return (r && typeof r.getLostFoundLocationOptions === 'function') ? r.getLostFoundLocationOptions() : [];
}

function kcSyncLostFoundLocationInput(input) {
  var r = _kcResolversModule();
  return (r && typeof r.syncLostFoundLocationInput === 'function') ? r.syncLostFoundLocationInput(input) : null;
}

// ─── Mídia / imagens: extraído para kc-create-post.media.js (v11.31.3) ──────
// Stubs de delegação — lógica real em window._KCCreatePost.media

function _kcMediaModule() {
  return window._KCCreatePost && window._KCCreatePost.media;
}

async function kcAddImagesFromFiles(fileList) {
  var m = _kcMediaModule();
  if (m && typeof m.addFromFiles === 'function') return m.addFromFiles(fileList);
}

function kcRemoveCreateImageById(id) {
  var m = _kcMediaModule();
  if (m && typeof m.removeById === 'function') m.removeById(id);
}

function kcSetCreateCoverImageById(id) {
  var m = _kcMediaModule();
  if (m && typeof m.setCoverById === 'function') m.setCoverById(id);
}

function kcGetOrderedCreateImages() {
  var m = _kcMediaModule();
  return (m && typeof m.getOrdered === 'function') ? m.getOrdered() : [];
}

function kcCreateImagesSectionHtml() {
  var m = _kcMediaModule();
  return (m && typeof m.sectionHtml === 'function') ? m.sectionHtml() : '';
}

function kcCreateSustainSectionHtml() {
  const checked = (kcCreateState.values.sustentavel === true || kcCreateState.values.sustentavel === 'true') ? 'checked' : '';
  return `
    <label class="kc-check" for="kcField_sustentavel">
      <input id="kcField_sustentavel" name="sustentavel" type="checkbox" ${checked} />
      <span>Esta publicação contribui para a sustentabilidade</span>
    </label>
  `;
}

function kcCreateVisibilitySectionHtml() {
  const selected = kcNormalizePostVisibilityValue(
    kcCreateState.values.visibility,
    kcCreateState.editMode ? 'public' : 'community'
  );
  const optionsHtml = KC_POST_VISIBILITY_OPTIONS.map((option) => {
    const active = selected === option.value;
    return `
      <label class="kc-create-visibility-option${active ? ' is-active' : ''}">
        <input type="radio" name="visibility" value="${_esc(option.value)}" ${active ? 'checked' : ''} />
        <span class="kc-create-visibility-option__label">${_esc(option.label)}</span>
        <small>${_esc(option.hint)}</small>
      </label>
    `;
  }).join('');

  return `
    <div class="kc-create-group kc-create-group--visibility">
      <div class="kc-create-group__head kc-create-group__head--row">
        <span>Visibilidade</span>
        <small>Defina quem pode abrir este anúncio.</small>
      </div>
      <div class="kc-create-visibility-toggle">${optionsHtml}</div>
    </div>
  `;
}

function kcBuildFieldsForModule(moduleKey, selections, values) {
  const fields = [];
  const moneyFieldMeta = {
    type: 'text',
    inputmode: 'decimal',
    pattern: '^\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})?$|^\\d+(?:[\\.,]\\d{1,2})?$'
  };

  // comuns
  fields.push({ type: 'text', name: 'titulo', label: 'Título', placeholder: 'Ex: Livro de Cálculo Vol. 1', required: true, maxLength: 80 });
  fields.push({ type: 'textarea', name: 'descricao', label: 'Descrição', placeholder: 'Descreva com detalhes…', required: true, rows: 4, maxLength: 2000 });

  if (moduleKey === 'compra-venda') {
    const acao = selections.acao;
    fields.push({ type: 'text', name: 'localizacao', label: 'Localização', placeholder: 'Ex: Campus Samambaia', required: false });

    if (acao === 'vendo') {
      fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Preço (R$)', placeholder: '0,00', required: true });
      fields.push({ type: 'select', name: 'condicao', label: 'Condição', required: true, options: ['Novo', 'Semi-novo', 'Usado'] });
    } else {
      fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Orçamento (opcional)', placeholder: '0,00', required: false });
    }
  }

  if (moduleKey === 'caronas') {
    fields.push({
      type: 'housing-region', name: 'origem', label: 'Origem',
      placeholder: 'Ex: Câmpus Samambaia', required: true,
      options: kcGetCaronasCampusOptions(),
      hint: 'Escolha uma sugestão ou digite outro local.',
    });
    fields.push({
      type: 'housing-region', name: 'destino', label: 'Destino',
      placeholder: 'Ex: Centro', required: true,
      options: kcGetCaronasCampusOptions(),
      hint: 'Escolha uma sugestão ou digite outro local.',
    });
    fields.push({
      type: 'time', name: 'horario', label: 'Horário de saída',
      required: false,
      hint: 'Matutino (05h–12h) · Vespertino (12h–18h) · Noturno (18h–05h)',
    });
    fields.push({ ...moneyFieldMeta, name: 'contribuicao', label: 'Contribuição (opcional)', placeholder: 'Ex: 5,00', required: false });
    if (selections.tipo === 'ofereco') {
      fields.push({ type: 'number', name: 'vagas', label: 'Vagas', placeholder: '2', required: false, min: 1, max: 8 });
    }
    fields.push({
      type: 'housing-features', name: 'marcadoresCarona',
      label: 'Características da carona', placeholder: 'Ex: Ar condicionado',
      required: false, options: kcGetCaronasFeatureOptions(),
      hint: 'Escolha sugestões ou adicione outras características da carona.',
    });
    fields.push({
      type: 'notice', icon: 'fas fa-clock',
      text: 'Publicações de caronas ficam visíveis por <strong>7 dias</strong> e depois são desabilitadas automaticamente. Você pode renovar depois.',
    });
  }

  if (moduleKey === 'moradia') {
    const t = selections.tipo;
    if (t === 'procurando') {
      fields.push({
        type: 'housing-region',
        name: 'regiao',
        label: 'Região desejada',
        placeholder: 'Ex: Setor Universitário',
        required: true,
        options: kcGetHousingRegionOptions(),
      });
      fields.push({
        type: 'housing-features',
        name: 'marcadoresMoradia',
        label: 'Características do ambiente',
        placeholder: 'Ex: Aceita pets',
        required: false,
        options: kcGetHousingFeatureOptions(),
      });
      fields.push({ ...moneyFieldMeta, name: 'orcamento', label: 'Orçamento máximo (opcional)', placeholder: 'Ex: 800,00', required: false });
    } else {
      fields.push({
        type: 'housing-region',
        name: 'regiao',
        label: 'Região',
        placeholder: 'Ex: Vila Itatiaia',
        required: true,
        options: kcGetHousingRegionOptions(),
      });
      fields.push({
        type: 'housing-features',
        name: 'marcadoresMoradia',
        label: 'Características do ambiente',
        placeholder: 'Ex: Mobiliado',
        required: false,
        options: kcGetHousingFeatureOptions(),
      });
      fields.push({ type: 'text', name: 'localizacao', label: 'Ponto de referência (opcional)', placeholder: 'Ex: 5 min do portão principal', required: false });
      fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Valor mensal (R$)', placeholder: '0,00', required: true });
      fields.push({ type: 'text', name: 'detalhes', label: 'Detalhes (opcional)', placeholder: 'Ex: contas inclusas, mobília, vagas…', required: false });
    }
  }

  if (moduleKey === 'eventos') {
    fields.push({ type: 'text', name: 'localizacao', label: 'Local', placeholder: 'Ex: Centro de Eventos', required: true });
    fields.push({ type: 'date', name: 'data', label: 'Data (opcional)', required: false });
    fields.push({ type: 'time', name: 'hora', label: 'Horário (opcional)', required: false });
    fields.push({ type: 'url', name: 'link', label: 'Link/Inscrição (opcional)', placeholder: 'https://…', required: false });
    fields.push({ type: 'checkbox', name: 'link_as_cta', label: 'Usar link como botão principal do anúncio', required: false });
    fields.push({ type: 'checkbox', name: 'gratuito', label: 'Evento gratuito', required: false });
    if (!values.gratuito) {
      fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Valor (opcional)', placeholder: '0,00', required: false });
    }
  }

  if (moduleKey === 'achados-perdidos') {
    fields.push({
      type: 'achados-location',
      name: 'localizacao',
      label: 'Local (onde foi perdido/encontrado)',
      placeholder: 'Ex: Biblioteca Central',
      required: true,
      options: kcGetLostFoundLocationOptions(),
    });
    if (selections.status === 'perdidos') {
      fields.push({ ...moneyFieldMeta, name: 'recompensa', label: 'Recompensa (opcional)', placeholder: 'Ex: 20,00', required: false });
    } else {
      fields.push({ type: 'text', name: 'entrega', label: 'Onde retirar/entregar', placeholder: 'Ex: Portaria do Bloco B', required: true });
    }
  }

  if (moduleKey === 'oportunidades') {
    fields.push({
      type: 'opportunity-area',
      name: 'areaAtuacao',
      label: 'Área',
      placeholder: 'Ex: Educação',
      required: true,
      options: kcGetOpportunityAreaOptions(),
    });
    fields.push({
      type: 'select',
      name: 'modalidadeTrabalho',
      label: 'Modalidade',
      required: true,
      options: ['Remoto', 'Híbrido', 'Presencial']
    });
    if (kcNormalizeOpportunityTypeKey(selections.tipo) === 'emprego') {
      fields.push({
        type: 'select',
        name: 'regimeContratacao',
        label: 'Regime/Vínculo',
        required: true,
        options: ['CLT', 'PJ', 'Temporário', 'Jovem Aprendiz']
      });
    }
    fields.push({ type: 'text', name: 'localizacao', label: 'Cidade/Campus (opcional)', placeholder: 'Ex: Goiânia / Campus Samambaia', required: false });
    fields.push({ ...moneyFieldMeta, name: 'remuneracao', label: 'Remuneração (opcional)', placeholder: 'Ex: 1200,00', required: false });
    fields.push({ type: 'text', name: 'contato', label: 'Contato', placeholder: 'Ex: email@ufg.br', required: true });
    fields.push({ type: 'url', name: 'link', label: 'Link/Inscrição (opcional)', placeholder: 'https://…', required: false });
    fields.push({ type: 'checkbox', name: 'link_as_cta', label: 'Usar link como botão principal do anúncio', required: false });
  }

  return fields;
}

function kcRenderCreateModal() {
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;
  if (!kcHasCreateSchemaLoaded()) return;

  const grid = overlay.querySelector('#kcCreateModuleGrid');
  const dynamic = overlay.querySelector('#kcCreateDynamic');
  const submitBtn = overlay.querySelector('.kc-create-submit');

  // Modo edição: ajusta título e botão, oculta seleção de módulo
  const titleEl = overlay.querySelector('#kcCreateModalTitle');
  const stepEl = overlay.querySelector('.kc-create-step');
  if (kcCreateState.editMode) {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-pen-to-square"></i> Alterar Publicação';
    if (stepEl) stepEl.style.display = 'none';
  } else {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus-circle"></i> Nova Publicação';
    if (stepEl) stepEl.style.display = '';
  }

  // módulo grid (oculto no modo edição)
  if (grid) {
    if (kcCreateState.editMode) {
      grid.innerHTML = '';
    } else {
      grid.innerHTML = '';
      Object.keys(KC_CREATE_SCHEMA).forEach((key) => {
        const schema = KC_CREATE_SCHEMA[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kc-create-cat-btn' + (kcCreateState.moduleKey === key ? ' active' : '');
        btn.setAttribute('data-kc-module', key);
        btn.innerHTML = `
          <i class="${schema.icon}"></i>
          <span>${_esc(schema.label.replace(' na UFG', ''))}</span>
        `;
        grid.appendChild(btn);
      });
    }
  }

  const schema = kcGetSchema(kcCreateState.moduleKey);

  // Conteúdo dinâmico
  if (!schema) {
    if (dynamic) {
      dynamic.innerHTML = '<div class="kc-create-hint">Escolha um módulo acima para liberar o formulário.</div>';
    }
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  // Tag groups + fields
  const parts = [];

  // Tags/subtópicos
  if (schema.tagGroups && schema.tagGroups.length) {
    schema.tagGroups.forEach((g) => {
      const selectedKey = kcCreateState.selections[g.id] || '';
      parts.push(`<div class="kc-create-group"><div class="kc-create-group__head"><span>${_esc(g.label)}${g.required ? ' *' : ''}</span></div><div class="kc-chip-row">`);
      g.options.forEach((opt) => {
        const active = selectedKey === opt.key ? ' active' : '';
        parts.push(`<button type="button" class="kc-chip${active}" data-kc-group="${_esc(g.id)}" data-kc-chip="${_esc(opt.key)}">${_esc(opt.label)}</button>`);
      });
      parts.push('</div></div>');
    });
  }

  // Fields
  const fields = kcBuildFieldsForModule(kcCreateState.moduleKey, kcCreateState.selections, kcCreateState.values);
  parts.push('<div class="kc-create-fields">');
  fields.forEach((f) => {
    const val = kcCreateState.values[f.name];
    const required = f.required ? 'required' : '';
    const label = _esc(f.label);
    const id = 'kcField_' + f.name;
    if (f.type === 'textarea') {
      const maxlength = (f.maxLength != null) ? `maxlength="${_esc(f.maxLength)}"` : '';
      const isDesc = f.name === 'descricao';
      const toolbar = isDesc ? `
          <div class="kc-editor-toolbar kc-desc-toolbar">
            <button type="button" data-kc-desc-format="bold" title="Negrito"><i class="fas fa-bold"></i></button>
            <button type="button" data-kc-desc-format="italic" title="Itálico"><i class="fas fa-italic"></i></button>
            <button type="button" data-kc-desc-format="underline" title="Sublinhado"><i class="fas fa-underline"></i></button>
            <button type="button" data-kc-desc-format="strikethrough" title="Tachado"><i class="fas fa-strikethrough"></i></button>
            <button type="button" data-kc-desc-format="inlinecode" title="Código"><i class="fas fa-code"></i></button>
            <button type="button" data-kc-desc-format="quote" title="Citação"><i class="fas fa-quote-right"></i></button>
            <button type="button" data-kc-desc-format="bullet" title="Lista"><i class="fas fa-list-ul"></i></button>
            <button type="button" data-kc-desc-format="link" title="Link"><i class="fas fa-link"></i></button>
          </div>
          <div class="kc-desc-preview" id="kcDescPreview" style="display:none;"></div>` : '';
      parts.push(`
        <div class="kc-field${isDesc ? ' kc-field--with-toolbar' : ''}">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>${toolbar}
          <textarea id="${id}" name="${_esc(f.name)}" rows="${f.rows || 4}" placeholder="${_esc(f.placeholder || '')}" ${required} ${maxlength}>${_esc(val || '')}</textarea>
          ${isDesc ? '<small class="kc-field-hint">Use **negrito**, *itálico*, ~~tachado~~, `código`, > citação, - lista</small>' : ''}
        </div>
      `);
    } else if (f.type === 'opportunity-area') {
      const suggestions = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <button type="button" class="kc-field-pill" data-kc-area-suggestion="${_esc(opt.label)}">
          <i class="${_esc(opt.icon || 'fas fa-briefcase')}"></i>
          <span>${_esc(opt.label)}</span>
        </button>
      `).join('');
      const listItems = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <option value="${_esc(opt.label)}"></option>
      `).join('');
      parts.push(`
        <div class="kc-field kc-field--opportunity-area">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${_esc(f.name)}" type="text" placeholder="${_esc(f.placeholder || '')}" value="${_esc(val || '')}" list="kcOpportunityAreaOptions" data-kc-opportunity-area-input="true" ${required} />
          <datalist id="kcOpportunityAreaOptions">${listItems}</datalist>
          <div class="kc-field-pill-row">${suggestions}</div>
          <small class="kc-field-hint">Escolha uma sugestão ou digite outra área.</small>
        </div>
      `);
    } else if (f.type === 'housing-region') {
      const listId = id + 'Options';
      const allOpts = Array.isArray(f.options) ? f.options : [];
      const PILL_LIMIT = 10;
      const visibleOpts = allOpts.slice(0, PILL_LIMIT);
      const hiddenOpts = allOpts.slice(PILL_LIMIT);
      const makePill = (opt) => `<button type="button" class="kc-field-pill" data-kc-housing-region-suggestion="${_esc(opt.label)}"><i class="${_esc(opt.icon || 'fas fa-map-pin')}"></i><span>${_esc(opt.label)}</span></button>`;
      const visiblePills = visibleOpts.map(makePill).join('');
      const hiddenPills = hiddenOpts.length ? `<div class="kc-field-pill-row kc-field-pill-row--extra" style="display:none">${hiddenOpts.map(makePill).join('')}</div><button type="button" class="kc-field-show-more" data-kc-show-more-pills="true" style="display:none">Ver menos <i class="fas fa-chevron-up"></i></button>` : '';
      const showMoreBtn = hiddenOpts.length ? `<button type="button" class="kc-field-show-more" data-kc-show-more-pills="true">Ver mais <i class="fas fa-chevron-down"></i></button>` : '';
      const listItems = allOpts.map((opt) => `<option value="${_esc(opt.label)}"></option>`).join('');
      parts.push(`
        <div class="kc-field kc-field--housing-region">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${_esc(f.name)}" type="text" placeholder="${_esc(f.placeholder || '')}" value="${_esc(val || '')}" list="${listId}" data-kc-housing-region-input="true" ${required} />
          <datalist id="${listId}">${listItems}</datalist>
          <div class="kc-field-pill-row">${visiblePills}</div>
          ${showMoreBtn}${hiddenPills}
          <small class="kc-field-hint">${f.hint ? _esc(f.hint) : 'Escolha uma sugestão ou digite outra região.'}</small>
        </div>
      `);
    } else if (f.type === 'achados-location') {
      const listId = id + 'Options';
      const suggestions = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <button type="button" class="kc-field-pill" data-kc-lostfound-location-suggestion="${_esc(opt.label)}">
          <i class="${_esc(opt.icon || 'fas fa-map-marker-alt')}"></i>
          <span>${_esc(opt.label)}</span>
        </button>
      `).join('');
      const listItems = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <option value="${_esc(opt.label)}"></option>
      `).join('');
      parts.push(`
        <div class="kc-field kc-field--lostfound-location">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${_esc(f.name)}" type="text" placeholder="${_esc(f.placeholder || '')}" value="${_esc(val || '')}" list="${listId}" data-kc-lostfound-location-input="true" ${required} />
          <datalist id="${listId}">${listItems}</datalist>
          <div class="kc-field-pill-row">${suggestions}</div>
          <small class="kc-field-hint">Escolha um local comum ou digite outro ponto de referência.</small>
        </div>
      `);
    } else if (f.type === 'housing-features') {
      const listId = id + 'Options';
      const selectedEntries = kcResolveHousingFeatureEntries(val);
      const selectedLabels = selectedEntries.map((entry) => entry.label);
      const selectedHtml = selectedEntries.length
        ? selectedEntries.map((entry) => `
          <button class="kc-field-chip" type="button" data-kc-housing-feature-remove="${_esc(entry.key)}" aria-label="Remover ${_esc(entry.label)}">
            ${entry.emoji ? `<span class="kc-field-chip__emoji">${_esc(entry.emoji)}</span>` : ''}
            <span>${_esc(entry.label)}</span>
            <i class="fas fa-times"></i>
          </button>
        `).join('')
        : '<span class="kc-field-chip__empty">Nenhuma característica selecionada.</span>';
      const selectedKeys = new Set(selectedEntries.map((entry) => entry.key));
        const suggestions = (Array.isArray(f.options) ? f.options : []).map((opt) => `
          <button type="button" class="kc-field-pill${selectedKeys.has(String(opt.key || '').trim()) ? ' is-active' : ''}" data-kc-housing-feature-suggestion="${_esc(opt.label)}" data-kc-housing-feature-key="${_esc(opt.key || '')}" aria-pressed="${selectedKeys.has(String(opt.key || '').trim()) ? 'true' : 'false'}">
            ${opt.emoji ? `<span class="kc-field-pill__emoji">${_esc(opt.emoji)}</span>` : ''}
            <span>${_esc(opt.label)}</span>
          </button>
        `).join('');
      const listItems = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <option value="${_esc(opt.label)}"></option>
      `).join('');
      parts.push(`
        <div class="kc-field kc-field--housing-features" data-kc-housing-features-field="true">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input type="hidden" name="${_esc(f.name)}" value="${_esc(kcSerializeHousingFeatureValues(selectedLabels))}" data-kc-housing-features-value="true" />
          <div class="kc-field-chip-row" data-kc-housing-features-selected="true">${selectedHtml}</div>
          <div class="kc-field-inline">
            <input id="${id}" type="text" placeholder="${_esc(f.placeholder || '')}" list="${listId}" data-kc-housing-features-input="true" />
            <button class="kc-field-inline__action" type="button" data-kc-housing-feature-add="true">Adicionar</button>
          </div>
          <datalist id="${listId}">${listItems}</datalist>
          <div class="kc-field-pill-row">${suggestions}</div>
          <small class="kc-field-hint">${f.hint ? _esc(f.hint) : 'Escolha sugestões ou adicione outros marcadores para o ambiente.'}</small>
        </div>
      `);
    } else if (f.type === 'select') {
      const opts = (f.options || []).map(o => {
        const isSel = String(val || '') === String(o);
        return `<option value="${_esc(o)}" ${isSel ? 'selected' : ''}>${_esc(o)}</option>`;
      }).join('');
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <select id="${id}" name="${_esc(f.name)}" ${required}>
            <option value="" ${!val ? 'selected' : ''} disabled>Selecione...</option>
            ${opts}
          </select>
        </div>
      `);
    } else if (f.type === 'checkbox') {
      const checked = val === true || val === 'true' ? 'checked' : '';
      parts.push(`
        <label class="kc-check" for="${id}">
          <input id="${id}" name="${_esc(f.name)}" type="checkbox" ${checked} />
          <span>${label}</span>
        </label>
      `);
    } else if (f.type === 'notice') {
      const icon = f.icon ? `<i class="${_esc(f.icon)}"></i> ` : '';
      parts.push(`<div class="kc-field-notice">${icon}${f.text || ''}</div>`);
    } else {
      const type = _esc(f.type);
      const placeholder = _esc(f.placeholder || '');
      const valueAttr = (val != null && f.type !== 'file') ? `value="${_esc(val)}"` : '';
      const min = (f.min != null) ? `min="${_esc(f.min)}"` : '';
      const max = (f.max != null) ? `max="${_esc(f.max)}"` : '';
      const maxlength = (f.maxLength != null) ? `maxlength="${_esc(f.maxLength)}"` : '';
      const step = (f.step != null) ? `step="${_esc(f.step)}"` : '';
      const inputmode = f.inputmode ? `inputmode="${_esc(f.inputmode)}"` : '';
      const pattern = f.pattern ? `pattern="${_esc(f.pattern)}"` : '';
      const hintHtml = f.hint ? `<small class="kc-field-hint">${_esc(f.hint)}</small>` : '';
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${_esc(f.name)}" type="${type}" placeholder="${placeholder}" ${valueAttr} ${required} ${min} ${max} ${maxlength} ${step} ${inputmode} ${pattern} />
          ${hintHtml}
        </div>
      `);
    }
  });
  parts.push('</div>');

  parts.push(kcCreateVisibilitySectionHtml());

  // Imagens (capa + até 4)
  parts.push(kcCreateImagesSectionHtml());
  // Sustentabilidade
  parts.push(kcCreateSustainSectionHtml());

  const renderedFieldsHtml = parts.join('')
    .replace(/Marcadores do ambiente/g, 'Características do ambiente')
    .replace(/Nenhum marcador selecionado\./g, 'Nenhuma característica selecionada.')
    .replace(/outros marcadores para o ambiente/g, 'outras características do ambiente');
  if (dynamic) dynamic.innerHTML = renderedFieldsHtml;

  // Texto do botão de submit (edição vs criação)
  if (submitBtn) {
    submitBtn.textContent = kcCreateState.editMode ? 'Salvar Alterações' : 'Publicar Agora';
    // P0-A fix: botão sempre habilitado; kcHandleCreateSubmit valida e exibe toast
    submitBtn.disabled = false;
  }
}

function kcOpenCreatePostModal(prefModuleKey) {
  // Abre modal de login se usuário não autenticado (evita preencher o form em vão)
  if (isSupabaseRuntime && typeof isSupabaseRuntime === 'function' && isSupabaseRuntime()) {
    const currentUser = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!currentUser) {
      if (typeof window.kcOpenAuthModal === 'function') {
        window.kcOpenAuthModal({ tab: 'login' });
      } else {
        showToast('Faça login para publicar.', 'info');
      }
      return false;
    }
  }

  if (!kcHasCreateSchemaLoaded()) return kcNotifyCreateSchemaUnavailable();

  try {
    kcEnsureCreateModal();
  } catch (err) {
    console.error('[KinoCampus] Falha ao preparar modal de criação.', err);
    showToast('Não foi possível abrir o formulário agora.', 'error', 2600);
    return false;
  }
  kcLastFocus = document.activeElement;

  if (prefModuleKey && KC_CREATE_SCHEMA[prefModuleKey]) kcCreateState.moduleKey = prefModuleKey;

  kcCreateState.open = true;
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;

  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('kc-modal-open');
  if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
    window.KCOverlayLock.lock('create-post-modal');
  }

  try {
    kcRenderCreateModal();
  } catch (err) {
    console.error('[KinoCampus] Erro ao renderizar modal de criação.', err);
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('kc-modal-open');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
      window.KCOverlayLock.unlock('create-post-modal');
    }
    showToast('Não foi possível abrir o formulário agora.', 'error', 2800);
    return false;
  }

  // foco no fechar
  const closeBtn = overlay.querySelector('.kc-create-modal__close');
  if (closeBtn) closeBtn.focus();
  return true;
}

function kcCloseCreatePostModal() {
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;
  kcCreateState.open = false;
  // Reset edit state
  kcCreateState.editMode = false;
  kcCreateState.editPostId = null;
  kcCreateState.editCallback = null;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('kc-modal-open');
  if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
    window.KCOverlayLock.unlock('create-post-modal');
  }

  if (kcLastFocus && typeof kcLastFocus.focus === 'function') {
    try { kcLastFocus.focus(); } catch { }
  }
}

/**
 * kcOpenEditPostModal — abre o kc-create-modal preenchido com os dados do post.
 * @param {object} post     Dados normalizados do post (KCPostModel)
 * @param {function} callback  Chamado com os dados atualizados após salvar
 */
function kcOpenEditPostModal(post, callback) {
  if (!post) return;
  if (!kcHasCreateSchemaLoaded()) return kcNotifyCreateSchemaUnavailable();
  kcEnsureCreateModal();
  kcLastFocus = document.activeElement;

  const moduleKey = post.modulo || post.module || '';
  const schema = KC_CREATE_SCHEMA[moduleKey];
  if (!schema) {
    showToast('Não foi possível abrir a edição dessa publicação.', 'error', 2600);
    return false;
  }
  const md = (post.metadata && typeof post.metadata === 'object') ? post.metadata : {};

  // ── State ──
  kcCreateState.moduleKey = moduleKey;
  kcCreateState.editMode = true;
  kcCreateState.editPostId = String(post.uuid || post.id || post.legacyId || '');
  kcCreateState.editCallback = typeof callback === 'function' ? callback : null;
  kcCreateState.open = true;

  // ── Seleções (tags) ──
  kcCreateState.selections = {};
  if (schema) {
    (schema.tagGroups || []).forEach((g) => {
      // Tenta encontrar o valor correspondente nos dados do post
      let key = '';
      if (g.id === schema.categoryGroupId) {
        key = post.categoriaKey || post.categoria || md.categoriaKey || md.categoria || '';
        if (moduleKey === 'oportunidades') key = kcGetOpportunityTypeOptionKey(key);
        if (moduleKey === 'moradia') key = kcGetHousingTypeOptionKey(key);
      } else if (g.id === 'acao') {
        key = post.subcategoriaKey || md.actionKey || md.subcategoriaKey || '';
      } else {
        key = kcCreateState.selections[g.id] || post[g.id] || md[g.id] || md.subcategoriaKey || '';
      }
      // Valida que a key existe nas opções do grupo
      if (key && g.options && g.options.some((o) => o.key === key)) {
        kcCreateState.selections[g.id] = key;
      }
    });
  }

  // ── Valores dos campos ──
  kcCreateState.values = {
    titulo: post.titulo || post.title || '',
    descricao: post.descricao || post.description || '',
    preco: post.preco != null ? String(post.preco) : '',
    localizacao: md.lostFoundLocationLabel || post.lostFoundLocationLabel || post.location || post.localizacao || md.localizacao || '',
    condicao: post.condicao || md.condicao || '',
    sustentavel: !!(post.sustentavel || post.sustainable || md.sustentavel),
    // Campos de módulos específicos (extraídos de metadata)
    origem: md.origem || '',
    destino: md.destino || '',
    horario: md.horario || '',
    vagas: md.vagas || '',
    data: md.data_evento || md.data || '',
    hora: md.hora_evento || md.hora || '',
    link: md.link || '',
    link_as_cta: !!(md.link_as_cta),
    gratuito: md.gratuito || false,
    contato: md.contato || '',
    remuneracao: md.remuneracao || '',
    areaAtuacao: md.areaLabel || md.area || post.subcategoriaLabel || post.subcategoria || '',
    modalidadeTrabalho: md.workModeLabel || md.modalidadeTrabalho || (md.workMode ? kcResolveOpportunityWorkMode(md.workMode).label : '') || '',
    regimeContratacao: md.employmentTypeLabel || md.regimeContratacao || (md.employmentType ? kcResolveOpportunityRegime(md.employmentType).label : '') || '',
    regiao: md.regionLabel || md.regiaoLabel || md.region || md.regiao || post.regionLabel || post.regiao || '',
    marcadoresMoradia: kcParseStringArrayValue(md.housingFeatureLabels || md.marcadoresMoradia || md.features || post.housingFeatureLabels || post.marcadoresMoradia || post.features || []),
    detalhes: md.detalhes || '',
    recompensa: md.recompensa || '',
    contribuicao: md.contribuicao || '',
    orcamento: md.orcamento || '',
    visibility: kcNormalizePostVisibilityValue(post.visibility || md.visibility || '', 'public'),
  };

  // ── Imagens existentes ──
  const existingImgs = Array.isArray(post.imagens) ? post.imagens
    : (Array.isArray(post.images) ? post.images : []);
  kcCreateState.images = existingImgs
    .filter(Boolean)
    .map((url, idx) => ({
      id: 'existing_' + idx,
      dataUrl: String(url),
      name: 'imagem_' + (idx + 1) + '.jpg',
      size: 0,
      isExisting: true,
    }));
  kcCreateState.coverImageId = kcCreateState.images.length > 0 ? kcCreateState.images[0].id : null;

  // ── Abre o overlay ──
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('kc-modal-open');
  if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
    window.KCOverlayLock.lock('create-post-modal');
  }

  kcRenderCreateModal();

  // Foco no botão fechar
  const closeBtn = overlay.querySelector('.kc-create-modal__close');
  if (closeBtn) closeBtn.focus();
}


async function kcHandleCreateSubmit() {
  if (kcCreateState.submitting === true) return;

  kcCaptureCreateValues();
  const form = document.getElementById('kcCreatePostForm');
  const submitBtn = form ? form.querySelector('.kc-create-submit') : null;
  const originalSubmitText = submitBtn ? submitBtn.textContent : '';

  kcCreateState.submitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = kcCreateState.editMode ? 'Salvando...' : 'Publicando...';
  }

  try {
    const schema = kcGetSchema(kcCreateState.moduleKey);
    if (!schema) {
      showToast('Selecione um módulo para publicar.', 'warn', 2200);
      return;
    }

    // valida tags obrigatórias
    const missing = (schema.tagGroups || []).filter(g => g.required && !kcCreateState.selections[g.id]);
    if (missing.length) {
      showToast('Selecione: ' + missing.map(m => m.label).join(', '), 'warn', 2600);
      return;
    }

    if (form) {
      const titleInput = form.querySelector('input[name="titulo"]');
      const descInput = form.querySelector('textarea[name="descricao"]');

      if (titleInput && typeof titleInput.setCustomValidity === 'function') {
        titleInput.setCustomValidity(String(titleInput.value || '').trim() ? '' : 'Informe um título válido.');
      }
      if (descInput && typeof descInput.setCustomValidity === 'function') {
        const normalizedDesc = String(descInput.value || '').trim();
        if (!normalizedDesc) {
          descInput.setCustomValidity('Informe uma descrição válida.');
        } else if (normalizedDesc.length > 2000) {
          descInput.setCustomValidity('A descrição deve ter no máximo 2000 caracteres.');
        } else {
          descInput.setCustomValidity('');
        }
      }

      const moneyFields = ['preco', 'orcamento', 'recompensa', 'contribuicao', 'remuneracao'];
      moneyFields.forEach((name) => {
        const input = form.querySelector(`input[name="${name}"]`);
        if (!input || typeof input.setCustomValidity !== 'function') return;

        const raw = String(kcCreateState.values[name] || '').trim();
        if (!raw) {
          input.setCustomValidity('');
          return;
        }

        const normalized = kcNormalizeMoneyInput(raw);
        if (normalized == null) {
          input.setCustomValidity('Informe um valor numérico válido (ex.: 10,00).');
          return;
        }

        input.setCustomValidity('');
        input.value = normalized;
        kcCreateState.values[name] = normalized;
      });

      if (!form.checkValidity()) {
        form.reportValidity();
        showToast('Revise os campos destacados e tente novamente.', 'warn', 2600);
        return;
      }
    }

    const title = String(kcCreateState.values.titulo || '').trim();
    const desc = String(kcCreateState.values.descricao || '').trim();
    if (!title || !desc) {
      // Fallback defensivo para payload em caso de DOM inconsistente.
      showToast('Revise os campos destacados e tente novamente.', 'warn', 2600);
      return;
    }
    const activeFieldNames = kcGetActiveCreateFieldNames(
      kcCreateState.moduleKey,
      kcCreateState.selections,
      kcCreateState.values
    );
    const activeLocation = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'localizacao', '');
    const activeAreaAtuacao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'areaAtuacao', '');
    const activeRegiao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'regiao', '');
    const activeMoradiaFeatures = kcReadActiveCreateArrayValue(activeFieldNames, kcCreateState.values, 'marcadoresMoradia');
    const activeCaronasFeatures = kcReadActiveCreateArrayValue(activeFieldNames, kcCreateState.values, 'marcadoresCarona');
    const activeOrigem = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'origem', '');
    const activeDestino = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'destino', '');
    const activeHorario = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'horario', '');
    const activeContribuicao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'contribuicao', '');
    const activeVagas = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'vagas', '');
    const activePrecoInput = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'preco', '');
    const activeOrcamento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'orcamento', '');
    const activeRecompensa = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'recompensa', '');
    const activeRemuneracao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'remuneracao', '');
    const activeContato = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'contato', '');
    const activeDetalhes = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'detalhes', '');
    const activeEntrega = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'entrega', '');
    const activeCondicao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'condicao', '');
    const activeDataEvento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'data', '');
    const activeHoraEvento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'hora', '');
    const activeLink = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'link', '');
    const activeModalidadeTrabalho = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'modalidadeTrabalho', '');
    const activeRegimeContratacao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'regimeContratacao', '');
    const activeVisibility = kcReadActiveCreateValue(activeFieldNames, kcCreateState.values, 'visibility', kcCreateState.editMode ? 'public' : 'community');
    const activeLinkAsCta = kcReadActiveCreateBooleanValue(activeFieldNames, kcCreateState.values, 'link_as_cta', false);
    const activeGratuito = kcReadActiveCreateBooleanValue(activeFieldNames, kcCreateState.values, 'gratuito', false);
    const activeSustentavel = kcReadActiveCreateBooleanValue(activeFieldNames, kcCreateState.values, 'sustentavel', false);

    const categoryGroupId = schema.categoryGroupId;
    const rawCatKey = categoryGroupId ? kcCreateState.selections[categoryGroupId] : '';
    const isOpportunity = kcCreateState.moduleKey === 'oportunidades';
    const isMoradia = kcCreateState.moduleKey === 'moradia';
    const isAchados = kcCreateState.moduleKey === 'achados-perdidos';
    const isCaronas = kcCreateState.moduleKey === 'caronas';
    const catKey = isOpportunity
      ? kcNormalizeOpportunityTypeKey(rawCatKey)
      : (isMoradia ? kcNormalizeHousingTypeKey(rawCatKey) : rawCatKey);
    const catLabel = rawCatKey ? kcTagLabel(schema, categoryGroupId, rawCatKey) : '';

    // subcategoria: tenta usar 2º grupo (quando existir)
    const otherGroups = (schema.tagGroups || []).filter(g => g.id !== categoryGroupId);
    const subKey = otherGroups.length ? kcCreateState.selections[otherGroups[0].id] : '';
    const subLabel = subKey ? kcTagLabel(schema, otherGroups[0].id, subKey) : '';

    // V8.1.2.4.5: Compra e Venda usa tabs por *categoria* (eletronicos, livros...),
    // mas o 2º grupo do formulário é 'ação' (vendo/compro...).
    // - Persistimos a ação em subcategoria/subcategoriaKey (UI)
    // - Persistimos o filtro de sub-módulo em metadata.subcategory (key da categoria)
    const isCompraVenda = kcCreateState.moduleKey === 'compra-venda';
    const actionKey = isCompraVenda ? (subKey || '') : '';
    const actionLabel = isCompraVenda ? (subLabel || '') : '';
    let filterSubKey = isCompraVenda ? (catKey || '') : (subKey || '');
    let filterSubLabel = isCompraVenda ? (catLabel || '') : (subLabel || '');
    let finalSubKey = isCompraVenda ? (actionKey || '') : (subKey || '');
    let finalSubLabel = isCompraVenda ? (actionLabel || '') : (subLabel || '');

    const opportunityArea = isOpportunity
      ? kcResolveOpportunityAreaValue(
        activeAreaAtuacao || subLabel || subKey || '',
        `${title} ${desc} ${activeLocation}`
      )
      : { key: '', label: '', icon: '' };
    if (isOpportunity) {
      finalSubKey = opportunityArea.key || '';
      finalSubLabel = opportunityArea.label || '';
      filterSubKey = opportunityArea.key || '';
      filterSubLabel = opportunityArea.label || '';
      if (opportunityArea.label) kcCreateState.values.areaAtuacao = opportunityArea.label;
      if (opportunityArea.key && opportunityArea.label) {
        const history = Array.isArray(window.__KC_OPPORTUNITY_AREA_HISTORY)
          ? window.__KC_OPPORTUNITY_AREA_HISTORY.slice()
          : [];
        history.unshift({
          key: opportunityArea.key,
          label: opportunityArea.label,
          icon: opportunityArea.icon || 'fas fa-briefcase',
        });
        window.__KC_OPPORTUNITY_AREA_HISTORY = history;
      }
    }

    const housingRegion = isMoradia
      ? kcResolveHousingRegionValue(
        activeRegiao || activeLocation || '',
        `${title} ${desc} ${activeLocation}`
      )
      : { key: '', label: '', icon: '', zoneKey: '', zoneLabel: '' };
    const housingFeatures = isMoradia
      ? kcResolveHousingFeatureValues(activeMoradiaFeatures)
      : [];
    const lostFoundLocation = isAchados
      ? kcResolveLostFoundLocationValue(
        activeLocation || '',
        `${title} ${desc} ${activeLocation}`
      )
      : { key: '', label: '', icon: '', emoji: '' };
    if (isMoradia) {
      if (housingRegion.label) kcCreateState.values.regiao = housingRegion.label;
      if (housingRegion.key && housingRegion.label) {
        const history = Array.isArray(window.__KC_HOUSING_REGION_HISTORY)
          ? window.__KC_HOUSING_REGION_HISTORY.slice()
          : [];
        history.unshift({
          key: housingRegion.key,
          label: housingRegion.label,
          icon: housingRegion.icon || 'fas fa-map-pin',
          zoneKey: housingRegion.zoneKey || '',
          zoneLabel: housingRegion.zoneLabel || '',
        });
        window.__KC_HOUSING_REGION_HISTORY = history;
      }
      if (housingFeatures.length) {
        const history = Array.isArray(window.__KC_HOUSING_FEATURE_HISTORY)
          ? window.__KC_HOUSING_FEATURE_HISTORY.slice()
          : [];
        housingFeatures.forEach((feature) => {
          history.unshift({
            key: feature.key,
            label: feature.label,
            emoji: feature.emoji || '',
          });
        });
        window.__KC_HOUSING_FEATURE_HISTORY = history;
        kcCreateState.values.marcadoresMoradia = housingFeatures.map((feature) => feature.label);
      }
    }
    if (isAchados) {
      if (lostFoundLocation.label) kcCreateState.values.localizacao = lostFoundLocation.label;
      if (lostFoundLocation.key && lostFoundLocation.label) {
        const history = Array.isArray(window.__KC_LOST_FOUND_LOCATION_HISTORY)
          ? window.__KC_LOST_FOUND_LOCATION_HISTORY.slice()
          : [];
        history.unshift({
          key: lostFoundLocation.key,
          label: lostFoundLocation.label,
          icon: lostFoundLocation.icon || 'fas fa-map-marker-alt',
          emoji: lostFoundLocation.emoji || '📍',
        });
        window.__KC_LOST_FOUND_LOCATION_HISTORY = history;
      }
    }

    // Caronas: origem, destino, features
    const caronasOrigem = isCaronas ? activeOrigem : '';
    const caronasDestino = isCaronas ? activeDestino : '';
    const caronasHorario = isCaronas ? activeHorario : '';
    const caronasContribuicao = isCaronas ? activeContribuicao : '';
    const caronasVagas = isCaronas ? activeVagas : '';
    const caronasFeatures = isCaronas
      ? kcResolveHousingFeatureValues(activeCaronasFeatures)
      : [];

    const tagMap = new Map();
    Object.entries(kcCreateState.selections).forEach(([gid, key]) => {
      if (!key) return;
      const normalizedKey = (isOpportunity && gid === categoryGroupId)
        ? kcNormalizeOpportunityTypeKey(key)
        : ((isMoradia && gid === categoryGroupId) ? kcNormalizeHousingTypeKey(key) : key);
      const labelForTag = kcTagLabel(schema, gid, key);
      if (normalizedKey && !tagMap.has(normalizedKey)) tagMap.set(normalizedKey, labelForTag || normalizedKey);
    });

    // preço (quando existe)
    let preco = null;
    let precoTexto = null;
    if (kcCreateState.moduleKey === 'eventos' && activeGratuito) {
      preco = 0;
    } else {
      const n = kcParseBRLNumber(activePrecoInput);
      if (n != null) preco = n;
    }

    if (kcCreateState.moduleKey === 'achados-perdidos' && kcCreateState.selections.status === 'perdidos') {
      const r = activeRecompensa;
      if (r) precoTexto = 'Recompensa: R$ ' + r;
    }

    if (isMoradia && kcNormalizeHousingTypeKey(rawCatKey) === 'procurando') {
      const budgetValue = kcParseBRLNumber(activeOrcamento);
      if (budgetValue != null) preco = budgetValue;
      const budgetText = activeOrcamento;
      if (budgetText) precoTexto = 'Até R$ ' + budgetText + '/mês';
    }

    const opportunityTypeKey = isOpportunity ? kcNormalizeOpportunityTypeKey(rawCatKey) : '';
    const opportunityUsesRegime = opportunityTypeKey === 'emprego';
    const opportunityWorkMode = isOpportunity
      ? kcResolveOpportunityWorkMode(activeModalidadeTrabalho || '')
      : { key: '', label: '' };
    const opportunityRegime = (isOpportunity && opportunityUsesRegime)
      ? kcResolveOpportunityRegime(activeRegimeContratacao || '')
      : { key: '', label: '' };

    if (isOpportunity) {
      const remunValue = kcParseBRLNumber(activeRemuneracao);
      if (remunValue != null) preco = remunValue;

      const remunText = activeRemuneracao;
      if (remunText) {
        const suffix = opportunityTypeKey === 'freelancer' ? '/projeto' : '/mês';
        precoTexto = 'R$ ' + remunText + suffix;
      }

      if (opportunityArea.key && !tagMap.has(opportunityArea.key)) {
        tagMap.set(opportunityArea.key, opportunityArea.label || opportunityArea.key);
      }
      if (opportunityWorkMode.key) {
        if (!tagMap.has(opportunityWorkMode.key)) tagMap.set(opportunityWorkMode.key, opportunityWorkMode.label || opportunityWorkMode.key);
        if (opportunityWorkMode.key === 'hibrido') {
          if (!tagMap.has('remoto')) tagMap.set('remoto', 'Remoto');
          if (!tagMap.has('presencial')) tagMap.set('presencial', 'Presencial');
        }
      }
      if (opportunityRegime.key && !tagMap.has(opportunityRegime.key)) {
        tagMap.set(opportunityRegime.key, opportunityRegime.label || opportunityRegime.key);
      }
    }

    if (isMoradia) {
      if (housingRegion.key && !tagMap.has(housingRegion.key)) {
        tagMap.set(housingRegion.key, housingRegion.label || housingRegion.key);
      }
      if (housingRegion.zoneKey && !tagMap.has(housingRegion.zoneKey)) {
        tagMap.set(housingRegion.zoneKey, housingRegion.zoneLabel || housingRegion.zoneKey);
      }
      housingFeatures.forEach((feature) => {
        if (!feature || !feature.key) return;
        if (!tagMap.has(feature.key)) tagMap.set(feature.key, feature.label || feature.key);
      });
    }
    if (isAchados && lostFoundLocation.key) {
      if (!tagMap.has(lostFoundLocation.key)) tagMap.set(lostFoundLocation.key, lostFoundLocation.label || lostFoundLocation.key);
    }
    if (isCaronas) {
      if (caronasOrigem && !tagMap.has(caronasOrigem.toLowerCase().replace(/\s+/g, '-'))) {
        tagMap.set(caronasOrigem.toLowerCase().replace(/\s+/g, '-'), caronasOrigem);
      }
      if (caronasDestino && !tagMap.has(caronasDestino.toLowerCase().replace(/\s+/g, '-'))) {
        tagMap.set(caronasDestino.toLowerCase().replace(/\s+/g, '-'), caronasDestino);
      }
      caronasFeatures.forEach((feature) => {
        if (feature && feature.key && !tagMap.has(feature.key)) tagMap.set(feature.key, feature.label || feature.key);
      });
    }

    const tagKeys = Array.from(tagMap.keys()).filter(Boolean);
    const tagLabels = Array.from(tagMap.values()).filter(Boolean);

    const imagens = kcGetOrderedCreateImages();

    // Payload do formulário (contrato legado) - o driver decide como persistir.
    // IMPORTANTE: categoria/subcategoria devem ser persistidos como *keys* para
    // permitir filtros por sub-módulo (ex: Eletrônicos) sem depender de acentos.
    const payload = {
      modulo: kcCreateState.moduleKey,
      moduloLabel: schema.label,

      // categoria/subcategoria (compat: mantém label e key)
      categoria: catKey || (catLabel || ''),
      categoriaLabel: catLabel || '',
      categoriaKey: catKey || '',

      // subcategoria (UI): em compra-venda, isso representa a *ação* (vendo/compro)
      subcategoria: finalSubKey || (finalSubLabel || ''),
      subcategoriaLabel: finalSubLabel || '',
      subcategoriaKey: finalSubKey || '',

      // tags (UI)
      tags: tagLabels,
      tagKeys,

      // conteúdo
      titulo: title,
      descricao: desc,
      preco,
      precoTexto,
      condicao: activeCondicao,
      localizacao: isAchados ? (lostFoundLocation.label || activeLocation) : activeLocation,
      lostFoundLocationKey: isAchados ? (lostFoundLocation.key || '') : '',
      lostFoundLocationLabel: isAchados ? (lostFoundLocation.label || '') : '',
      lostFoundLocationIcon: isAchados ? (lostFoundLocation.icon || '') : '',
      regiao: isMoradia ? (housingRegion.label || '') : '',
      regionLabel: isMoradia ? (housingRegion.label || '') : '',
      regionKey: isMoradia ? (housingRegion.key || '') : '',
      area: isOpportunity ? (opportunityArea.label || '') : '',
      areaKey: isOpportunity ? (opportunityArea.key || '') : '',
      modalidadeTrabalho: isOpportunity ? (opportunityWorkMode.label || '') : '',
      regimeContratacao: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
      housingFeatureLabels: isMoradia ? housingFeatures.map((feature) => feature.label) : [],
      housingFeatureKeys: isMoradia ? housingFeatures.map((feature) => feature.key) : [],
      origem: isCaronas ? caronasOrigem : '',
      destino: isCaronas ? caronasDestino : '',
      horario: isCaronas ? caronasHorario : '',
      contribuicao: isCaronas ? caronasContribuicao : '',
      vagas: isCaronas ? caronasVagas : '',
      caronasFeatureLabels: isCaronas ? caronasFeatures.map((f) => f.label) : [],
      caronasFeatureKeys: isCaronas ? caronasFeatures.map((f) => f.key) : [],
      contato: activeContato,
      remuneracao: activeRemuneracao,
      visibility: kcNormalizePostVisibilityValue(activeVisibility, kcCreateState.editMode ? 'public' : 'community'),

      // flags
      verificado: false,
      emoji: schema.emoji,
      imagens,
      sustentavel: activeSustentavel,

      // metadata (modo local e Supabase): usado para filtros JSONB
      metadata: {
        // subcategory (filtro): chave esperada pelos controllers (.eq('metadata->>subcategory', ...))
        subcategory: filterSubKey || '',
        subcategoryLabel: filterSubLabel || '',

        // categoria principal (UI + filtros)
        categoria: catLabel || '',
        categoriaKey: catKey || '',

        // ação/subcategoria (UI)
        subcategoria: finalSubLabel || '',
        subcategoriaKey: finalSubKey || '',

        // compra-venda: guardar ação explicitamente (útil para futuras buscas e edição)
        actionKey: actionKey || '',
        actionLabel: actionLabel || '',
        regionKey: isMoradia ? (housingRegion.key || '') : '',
        regionLabel: isMoradia ? (housingRegion.label || '') : '',
        regionZoneKey: isMoradia ? (housingRegion.zoneKey || '') : '',
        regionZoneLabel: isMoradia ? (housingRegion.zoneLabel || '') : '',
        regiao: isMoradia ? (housingRegion.label || '') : '',
        regiaoLabel: isMoradia ? (housingRegion.label || '') : '',
        housingTypeKey: isMoradia ? (catKey || '') : '',
        housingTypeLabel: isMoradia ? (catLabel || '') : '',
        housingFeatureKeys: isMoradia ? housingFeatures.map((feature) => feature.key) : [],
        housingFeatureLabels: isMoradia ? housingFeatures.map((feature) => feature.label) : [],
        marcadoresMoradia: isMoradia ? housingFeatures.map((feature) => feature.label) : [],
        lostFoundLocationKey: isAchados ? (lostFoundLocation.key || '') : '',
        lostFoundLocationLabel: isAchados ? (lostFoundLocation.label || '') : '',
        lostFoundLocationIcon: isAchados ? (lostFoundLocation.icon || '') : '',
        lostFoundLocationEmoji: isAchados ? (lostFoundLocation.emoji || '') : '',
        detalhes: activeDetalhes,
        orcamento: activeOrcamento,
        area: isOpportunity ? (opportunityArea.label || '') : '',
        areaLabel: isOpportunity ? (opportunityArea.label || '') : '',
        areaKey: isOpportunity ? (opportunityArea.key || '') : '',
        workMode: isOpportunity ? (opportunityWorkMode.key || '') : '',
        workModeLabel: isOpportunity ? (opportunityWorkMode.label || '') : '',
        employmentType: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.key || '') : '',
        employmentTypeLabel: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
        regimeContratacao: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
        contato: activeContato,
        remuneracao: activeRemuneracao,
        modalidadeTrabalho: activeModalidadeTrabalho,
        recompensa: activeRecompensa,
        entrega: activeEntrega,
        // eventos: data, hora, link e gratuito
        data_evento: (kcCreateState.moduleKey === 'eventos') ? activeDataEvento : '',
        hora_evento: (kcCreateState.moduleKey === 'eventos') ? activeHoraEvento : '',
        link: (kcCreateState.moduleKey === 'eventos' || kcCreateState.moduleKey === 'oportunidades') ? activeLink : '',
        link_as_cta: activeLinkAsCta,
        gratuito: (kcCreateState.moduleKey === 'eventos') ? activeGratuito : false,
        // caronas
        origem: isCaronas ? caronasOrigem : '',
        destino: isCaronas ? caronasDestino : '',
        horario: isCaronas ? caronasHorario : '',
        contribuicao: isCaronas ? caronasContribuicao : '',
        vagas: isCaronas ? caronasVagas : '',
        caronasFeatureKeys: isCaronas ? caronasFeatures.map((f) => f.key) : [],
        caronasFeatureLabels: isCaronas ? caronasFeatures.map((f) => f.label) : [],
        marcadoresCarona: isCaronas ? caronasFeatures.map((f) => f.label) : [],
        visibility: kcNormalizePostVisibilityValue(activeVisibility, kcCreateState.editMode ? 'public' : 'community'),
      },
    };

    // ── MODO EDIÇÃO ──────────────────────────────────────────────────────────
    if (kcCreateState.editMode && kcCreateState.editPostId) {
      if (submitBtn) submitBtn.textContent = 'Salvando...';
      showToast('Salvando alterações...', 'info', 1600);

      let editRes = null;
      try {
        if (KCAPI && typeof KCAPI.updatePost === 'function') {
          editRes = await KCAPI.updatePost(kcCreateState.editPostId, payload);
        } else {
          editRes = { ok: false, error: { message: 'Edição não suportada neste ambiente.' } };
        }
      } catch (err) {
        editRes = { ok: false, error: { message: (err && err.message) ? String(err.message) : 'Erro inesperado ao salvar.' } };
      }

      if (editRes && editRes.ok) {
        showToast('Publicação atualizada com sucesso!', 'success', 2200);
        const editCb = kcCreateState.editCallback;
        const editedData = editRes.data;
        kcCloseCreatePostModal(); // também zera editMode / editCallback
        if (typeof editCb === 'function') editCb(editedData);
        return;
      }

      const editErrMsg = (editRes && editRes.error && editRes.error.message)
        ? String(editRes.error.message)
        : 'Não foi possível atualizar a publicação.';
      showToast(editErrMsg, 'error', 2800);
      return;
    }
    // ── FIM MODO EDIÇÃO ───────────────────────────────────────────────────────

    const hasApiCreatePost = !!((window.KCActions && typeof window.KCActions.createPost === 'function') || (KCAPI && typeof KCAPI.createPost === 'function'));
    const useSupabase = !!(KCAPI && KCAPI.activeDriver === 'supabase' && hasApiCreatePost);
    const blockLocalCriticalPersistence = isProductionRuntime() && !useSupabase;
    let post = null;
    let createError = null;

    const apiCreateFn = (window.KCActions && typeof window.KCActions.createPost === 'function') ? window.KCActions.createPost : (KCAPI ? KCAPI.createPost : null);

    if (useSupabase) {
      // Exige autenticação no driver Supabase (RLS)
      let user = null;
      try {
        if (typeof KCAPI.getCurrentUser === 'function') user = await KCAPI.getCurrentUser();
      } catch (_) { }

      if (!user) {
        showToast('Faça login para publicar.', 'warn', 2600);
        // V8.1.3.2.1: não abre o modal automaticamente; direciona o usuário ao botão de Login/Cadastro.
        try {
          const btn = document.querySelector('a.btn-login') || document.querySelector('a[href="#login"]');
          if (btn) {
            btn.classList.add('kc-attention');
            try { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
            try { btn.focus(); } catch (_) { }
            setTimeout(() => btn.classList.remove('kc-attention'), 900);
          }
        } catch (_) { }
        return;
      }

      // ── Verificação de publicação duplicada ──────────────────────────────
      try {
        if (KCAPI && typeof KCAPI.checkDuplicatePost === 'function') {
          const dupCheck = await KCAPI.checkDuplicatePost(
            user.id,
            payload.modulo || null,
            payload.titulo || ''
          );
          if (dupCheck && dupCheck.candidates && dupCheck.candidates.length > 0) {
            const top = dupCheck.candidates[0];
            const topTitle = top.title || top.titulo || 'Sem título';
            const statusLabel = top.status === 'hidden' ? 'desabilitado' : (top.status === 'expired' ? 'expirado' : 'ativo');
            const confirmed = window.confirm(
              'Atenção: você já tem um anúncio muito parecido com este!\n\n' +
              '"' + topTitle + '" (' + statusLabel + ')\n\n' +
              'Publicar de novo pode levar à desativação do anúncio pela moderação.\n' +
              'Deseja continuar mesmo assim?'
            );
            if (!confirmed) return;
          }
        }
      } catch (_) { /* verificação de duplicata não bloqueia o envio */ }

      showToast('Publicando...', 'info', 1600);
      try {
        post = await apiCreateFn(payload);
        // Verificação explícita de _kcError antes de qualquer outra coisa
        if (post && post._kcError) {
          const limitMsg = post.message || 'Não foi possível publicar. Limite de publicações ativas atingido.';
          showToast(limitMsg, 'error', 5000);
          return;
        }
        // v9.3.2: post criado mas em análise pela moderação automática
        if (post && post._kcPending) {
          showToast(post._kcPendingReason || 'Publicação enviada para análise da moderação.', 'warn', 6000);
          // continua normalmente — post existe, autor pode ver, redirecionamento ocorre abaixo
        }
        if (post && post.ok === false && post.error) {
          createError = post.error;
          post = null;
        }
      } catch (err) {
        console.error('[KinoCampus] Exceção ao criar publicação (supabase):', {
          payload,
          error: err,
        });
        createError = {
          code: 'CREATE_POST_EXCEPTION',
          message: (err && err.message) ? String(err.message) : 'Erro inesperado ao publicar.',
        };
        post = null;
      }

      if (!post) {
        console.error('[KinoCampus] Falha ao criar publicação (supabase) sem retorno de post.', {
          payload,
          createError,
        });
        try {
          if (KCAPI && typeof KCAPI.getLastCreatePostError === 'function') {
            const createErr = KCAPI.getLastCreatePostError();
            console.error('[KinoCampus] createPost retornou null. Diagnóstico:', createErr);
          }
        } catch (_) { }
        const feedbackMessage = (createError && createError.message)
          ? String(createError.message)
          : 'Não foi possível publicar agora. Tente novamente.';
        showToast(feedbackMessage, 'error', 2800);
        return;
      }
    } else {
      if (blockLocalCriticalPersistence) {
        showToast('Publicação bloqueada: em produção, o driver Supabase é obrigatório.', 'error', 3200);
        return;
      }

      // Modo local/offline-first (default): só confirma sucesso após persistência efetiva.
      try {
        if (hasApiCreatePost) {
          post = await apiCreateFn(payload);
        } else {
          post = kcCreateUserPost(payload);
        }
        if (post && post._kcError) {
          const limitMsg = post.message || 'Não foi possível publicar. Limite de publicações ativas atingido.';
          showToast(limitMsg, 'error', 5000);
          return;
        }
        if (post && post.ok === false && post.error) {
          createError = post.error;
          post = null;
        }
      } catch (err) {
        console.error('[KinoCampus] Exceção no modo local ao criar publicação:', {
          payload,
          error: err,
        });
        createError = {
          code: 'LOCAL_CREATE_POST_EXCEPTION',
          message: (err && err.message) ? String(err.message) : 'Erro inesperado ao salvar publicação.',
        };
        post = null;
      }

      if (!post) {
        console.error('[KinoCampus] Falha ao criar publicação no modo local sem retorno de post.', {
          payload,
          createError,
        });
        const feedbackMessage = (createError && createError.message)
          ? String(createError.message)
          : 'Não foi possível salvar sua publicação no dispositivo.';
        showToast(feedbackMessage, 'error', 3200);
        return;
      }
    }

    showToast('Publicado com sucesso!', 'success', 2200);

    // Audit log: registra criação do post (fire-and-forget)
    try {
      const kcClient = KCSupabase && typeof KCSupabase.getClient === 'function'
        ? KCSupabase.getClient() : null;
      const postId = (post && (post.uuid || post.id || post.legacyId)) ? String(post.uuid || post.id || post.legacyId) : '';
      let actorId = null;
      try {
        if (KCAPI && typeof KCAPI.getCurrentUser === 'function') {
          const u = await KCAPI.getCurrentUser();
          if (u) actorId = u.id;
        }
      } catch (_) { }
      if (kcClient && actorId) {
        kcClient.from('audit_log').insert({
          action: 'post_created',
          entity_type: 'posts',
          entity_id: postId,
          actor_id: actorId,
        }).then(() => { }).catch(() => { });
      }
      // Incrementar uso de localizações de caronas (conhecidas) ou upsert de locais custom
      if (isCaronas && kcClient) {
        var resolvedOrigem = kcResolveCaronasLocationValue(caronasOrigem);
        var resolvedDestino = kcResolveCaronasLocationValue(caronasDestino);
        if (resolvedOrigem) {
          if (resolvedOrigem.isKnown && resolvedOrigem.key) {
            kcClient.rpc('kc_increment_location_usage', { p_key: resolvedOrigem.key }).then(function(){}).catch(function(){});
          } else if (caronasOrigem) {
            var customKey = 'custom-' + caronasOrigem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            kcClient.rpc('kc_upsert_custom_location', { p_key: customKey, p_label: caronasOrigem }).then(function(){}).catch(function(){});
          }
        }
        if (resolvedDestino) {
          if (resolvedDestino.isKnown && resolvedDestino.key) {
            kcClient.rpc('kc_increment_location_usage', { p_key: resolvedDestino.key }).then(function(){}).catch(function(){});
          } else if (caronasDestino) {
            var customKey2 = 'custom-' + caronasDestino.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            kcClient.rpc('kc_upsert_custom_location', { p_key: customKey2, p_label: caronasDestino }).then(function(){}).catch(function(){});
          }
        }
      }
    } catch (_) { }

    kcCloseCreatePostModal();

    // Redireciona para o módulo + hash do subtópico
    const base = schema.redirect || kcModulePage(kcCreateState.moduleKey);
    let targetUrl = base;
    if (kcCreateState.moduleKey === 'compra-venda' && catKey) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'filter=' + encodeURIComponent(catKey);
    } else if (catKey) {
      targetUrl += '#' + encodeURIComponent(catKey);
    }
    window.location.href = targetUrl;
  } catch (err) {
    console.error('[KinoCampus] Erro inesperado no submit de criação:', err);
    showToast('Não foi possível publicar agora. Tente novamente.', 'error', 2800);
  } finally {
    kcCreateState.submitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalSubmitText || (kcCreateState.editMode ? 'Salvar Alterações' : 'Publicar Agora');
    }
  }
}
function kcInitCreatePostTriggers() {
  // Intercepta links e botões existentes
  document.body.addEventListener('click', (e) => {
    const trigger = e.target.closest('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn');
    if (!trigger) return;

    const href = String(trigger.getAttribute('href') || '').trim();
    const isCreateLink = href.toLowerCase().includes('create-post.html');

    // tenta inferir módulo atual pela página
    const mod = kcGetModuloFilterForPage();
    const opened = kcOpenCreatePostModal(mod || null);

    // Só bloqueia navegação se o modal abriu corretamente.
    if (opened) {
      e.preventDefault();
    } else if (isCreateLink) {
      // fallback explícito
      window.location.href = href;
    }
  });

  // Autopen: se a pessoa abrir create-post.html direto
  const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (page === 'create-post.html') {
    kcOpenCreatePostModal(kcGetModuloFilterForPage());
  }
}


document.addEventListener('DOMContentLoaded', function () {
  kcInitCreatePostTriggers();
});

/**
 * Abre o modal de criação com módulo e seleções (tipo/categoria/subtópico) pré-definidos.
 * Usado pelo botão "Criar parecido" na página de produto.
 * @param {string} moduleKey - Chave do módulo (ex: 'eventos', 'moradia')
 * @param {Object} selections - Mapa groupId → chipKey (ex: { topico: 'culturais' })
 */
function kcOpenCreatePostModalPrefilled(moduleKey, selections) {
  if (moduleKey && KC_CREATE_SCHEMA[moduleKey]) {
    kcCreateState.moduleKey = moduleKey;
    kcCreateState.selections = (selections && typeof selections === 'object') ? Object.assign({}, selections) : {};
    kcCreateState.values = {};
    kcCreateState.images = [];
    kcCreateState.coverImageId = null;
    kcCreateState.editMode = false;
    kcCreateState.editPostId = null;
  }
  return kcOpenCreatePostModal(moduleKey);
}

window.kcOpenCreatePostModal = kcOpenCreatePostModal;
window.kcCloseCreatePostModal = kcCloseCreatePostModal;
window.kcOpenEditPostModal = kcOpenEditPostModal;
window.kcOpenCreatePostModalPrefilled = kcOpenCreatePostModalPrefilled;
