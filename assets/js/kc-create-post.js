/* KinoCampus — kc-create-post.js
   Modal de criação/edição de publicações.
   Extraído de kc-core.js (F1).
*/



function isProductionRuntime() {
  return !!(KC_ENV && KC_ENV.isProduction === true);
}

// Helper local
function _esc(str) { return KCUtils.escapeHtml(str); }

// -----------------------------
// Create Post Modal (Design React + Form dinâmico por módulo)
// -----------------------------

const KC_CREATE_MODAL_ID = 'kcCreatePostModalOverlay';

// Definições por módulo (tags/subtópicos + campos)
const KC_CREATE_SCHEMA = {
  'compra-venda': {
    label: 'Compra e Venda',
    icon: 'fas fa-shopping-bag',
    emoji: '🛍️',
    categoryGroupId: 'categoria',
    redirect: 'compra-venda-feed.html',
    tagGroups: [
      {
        id: 'categoria',
        label: 'Categoria',
        required: true,
        multi: false,
        options: [
          { key: 'eletronicos', label: 'Eletrônicos' },
          { key: 'livros', label: 'Livros' },
          { key: 'moveis', label: 'Móveis' },
          { key: 'vestuario', label: 'Vestuário' },
          { key: 'outros', label: 'Outros' },
        ]
      },
      {
        id: 'acao',
        label: 'Você quer',
        required: true,
        multi: false,
        options: [
          { key: 'vendo', label: 'Vendo' },
          { key: 'compro', label: 'Compro' },
        ]
      }
    ]
  },
  'caronas': {
    label: 'Caronas',
    icon: 'fas fa-car',
    emoji: '🚗',
    categoryGroupId: 'tipo',
    redirect: 'caronas-feed.html',
    tagGroups: [
      {
        id: 'tipo',
        label: 'Tipo',
        required: true,
        multi: false,
        options: [
          { key: 'ofereco', label: 'Ofereço carona' },
          { key: 'procuro', label: 'Procuro carona' },
        ]
      },
      {
        id: 'regiao',
        label: 'Região',
        required: false,
        multi: false,
        options: [
          { key: 'campus', label: 'Campus' },
          { key: 'centro', label: 'Centro' },
          { key: 'bairros', label: 'Bairros' },
        ]
      }
    ]
  },
  'moradia': {
    label: 'Moradia',
    icon: 'fas fa-home',
    emoji: '🏡',
    categoryGroupId: 'tipo',
    redirect: 'moradia.html',
    tagGroups: [
      {
        id: 'tipo',
        label: 'Tipo',
        required: true,
        multi: false,
        options: [
          { key: 'republicas', label: 'Repúblicas' },
          { key: 'quartos', label: 'Quartos' },
          { key: 'apartamentos', label: 'Apartamentos' },
          { key: 'casas', label: 'Casas' },
          { key: 'procurando', label: 'Procurando' },
        ]
      }
    ]
  },
  'eventos': {
    label: 'Eventos na UFG',
    icon: 'fas fa-calendar',
    emoji: '📅',
    categoryGroupId: 'topico',
    redirect: 'eventos.html',
    tagGroups: [
      {
        id: 'topico',
        label: 'Subtópico',
        required: true,
        multi: false,
        options: [
          { key: 'sustentabilidade', label: 'Sustentabilidade' },
          { key: 'academicos', label: 'Acadêmicos' },
          { key: 'culturais', label: 'Culturais' },
          { key: 'esportivos', label: 'Esportivos' },
          { key: 'workshops', label: 'Workshops' },
        ]
      }
    ]
  },
  'achados-perdidos': {
    label: 'Achados e Perdidos',
    icon: 'fas fa-search',
    emoji: '🔎',
    categoryGroupId: 'status',
    redirect: 'achados-perdidos.html',
    tagGroups: [
      {
        id: 'status',
        label: 'Status',
        required: true,
        multi: false,
        options: [
          { key: 'perdidos', label: 'Perdidos' },
          { key: 'encontrados', label: 'Encontrados' },
        ]
      },
      {
        id: 'tipo',
        label: 'Tipo do item',
        required: true,
        multi: false,
        options: [
          { key: 'documentos', label: 'Documentos' },
          { key: 'eletronicos', label: 'Eletrônicos' },
          { key: 'outros', label: 'Outros' },
        ]
      }
    ]
  },
  'oportunidades': {
    label: 'Oportunidades',
    icon: 'fas fa-briefcase',
    emoji: '💼',
    categoryGroupId: 'tipo',
    redirect: 'oportunidades.html',
    tagGroups: [
      {
        id: 'tipo',
        label: 'Tipo',
        required: true,
        multi: false,
        options: [
          { key: 'estagios', label: 'Estágio' },
          { key: 'empregos', label: 'Emprego' },
          { key: 'freelancer', label: 'Freelancer' },
          { key: 'monitoria', label: 'Monitoria' },
          { key: 'voluntariado', label: 'Voluntariado' },
        ]
      }
    ]
  }
};

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

let kcLastFocus = null;

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

  // Click fora fecha
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) kcCloseCreatePostModal();
  });

  const closeBtn = overlay.querySelector('.kc-create-modal__close');
  if (closeBtn) closeBtn.addEventListener('click', kcCloseCreatePostModal);

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
      kcCreateState.values.regiao = value;
      const regionInput = overlay.querySelector('input[name="regiao"]');
      if (regionInput) {
        regionInput.value = value;
        kcSyncHousingRegionInput(regionInput);
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
    form.addEventListener('change', () => kcCaptureCreateValues());
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

function kcTagLabel(schema, groupId, key) {
  const group = (schema && Array.isArray(schema.tagGroups)) ? schema.tagGroups.find(g => g.id === groupId) : null;
  const opt = group && Array.isArray(group.options) ? group.options.find(o => o.key === key) : null;
  return opt ? opt.label : '';
}

function kcNormalizeOpportunityTypeKey(value) {
  const canonical = KCUtils && typeof KCUtils.canonicalCategory === 'function'
    ? KCUtils.canonicalCategory(value)
    : String(value || '').trim().toLowerCase();

  if (!canonical) return '';
  if (canonical.includes('estagio')) return 'estagio';
  if (canonical.includes('emprego')) return 'emprego';
  if (canonical.includes('freelancer')) return 'freelancer';
  if (canonical.includes('monitor')) return 'monitoria';
  if (canonical.includes('volunt')) return 'voluntariado';
  return canonical;
}

function kcGetOpportunityTypeOptionKey(value) {
  const normalized = kcNormalizeOpportunityTypeKey(value);
  if (normalized === 'estagio') return 'estagios';
  if (normalized === 'emprego') return 'empregos';
  return normalized;
}

function kcResolveOpportunityAreaValue(value, fallbackSource) {
  const history = [];
  if (Array.isArray(window.__KC_OPPORTUNITY_AREA_HISTORY)) history.push(...window.__KC_OPPORTUNITY_AREA_HISTORY);
  if (kcUserPosts && typeof kcUserPosts.list === 'function') {
    try {
      const userPosts = kcUserPosts.list();
      if (Array.isArray(userPosts)) {
        history.push(...userPosts.filter((post) => String(post && post.modulo || '').toLowerCase() === 'oportunidades'));
      }
    } catch (_) { }
  }

  if (KCUtils && typeof KCUtils.resolveOpportunityArea === 'function') {
    const options = { history };
    if (fallbackSource) options.textParts = [fallbackSource];
    return KCUtils.resolveOpportunityArea(value || fallbackSource || '', options);
  }

  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { key, label: raw, icon: 'fas fa-briefcase', isKnown: false };
}

function kcGetOpportunityAreaOptions() {
  if (KCUtils && typeof KCUtils.getOpportunityAreaDefinitions === 'function') {
    return KCUtils.getOpportunityAreaDefinitions();
  }

  return [
    { key: 'tecnologia', label: 'Tecnologia', icon: 'fas fa-laptop-code' },
    { key: 'marketing', label: 'Marketing', icon: 'fas fa-bullhorn' },
    { key: 'design', label: 'Design', icon: 'fas fa-palette' },
    { key: 'educacao', label: 'Educa\u00e7\u00e3o', icon: 'fas fa-graduation-cap' },
    { key: 'musica', label: 'M\u00fasica', icon: 'fas fa-music' },
  ];
}

function kcNormalizeHousingTypeKey(value) {
  const canonical = KCUtils && typeof KCUtils.resolveHousingTypeKey === 'function'
    ? KCUtils.resolveHousingTypeKey(value)
    : String(value || '').trim().toLowerCase();

  if (!canonical) return '';
  if (canonical.includes('republic')) return 'republica';
  if (canonical.includes('quart') || canonical.includes('suite')) return 'quarto';
  if (canonical.includes('apart') || canonical.includes('kitnet')) return 'apartamento';
  if (canonical.includes('casa')) return 'casa';
  if (canonical.includes('procur')) return 'procurando';
  return canonical;
}

function kcGetHousingTypeOptionKey(value) {
  const normalized = kcNormalizeHousingTypeKey(value);
  if (normalized === 'republica') return 'republicas';
  if (normalized === 'quarto') return 'quartos';
  if (normalized === 'apartamento') return 'apartamentos';
  if (normalized === 'casa') return 'casas';
  return normalized;
}

function kcParseStringArrayValue(value) {
  if (KCUtils && typeof KCUtils.toStringArray === 'function') {
    return KCUtils.toStringArray(value);
  }
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
  } catch (_) { }
  return raw.split(/[|,]\s*/).map((item) => String(item || '').trim()).filter(Boolean);
}

function kcSerializeHousingFeatureValues(values) {
  return JSON.stringify(kcParseStringArrayValue(values));
}

function kcResolveHousingRegionValue(value, fallbackSource) {
  const history = [];
  if (Array.isArray(window.__KC_HOUSING_REGION_HISTORY)) history.push(...window.__KC_HOUSING_REGION_HISTORY);
  if (kcUserPosts && typeof kcUserPosts.list === 'function') {
    try {
      const userPosts = kcUserPosts.list();
      if (Array.isArray(userPosts)) {
        history.push(...userPosts.filter((post) => String(post && post.modulo || '').toLowerCase() === 'moradia'));
      }
    } catch (_) { }
  }

  if (KCUtils && typeof KCUtils.resolveHousingRegion === 'function') {
    const options = { history };
    if (fallbackSource) options.textParts = [fallbackSource];
    return KCUtils.resolveHousingRegion(value || fallbackSource || '', options);
  }

  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { key, label: raw, icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isKnown: false };
}

function kcGetHousingRegionOptions() {
  if (KCUtils && typeof KCUtils.getHousingRegionDefinitions === 'function') {
    return KCUtils.getHousingRegionDefinitions();
  }

  return [
    { key: 'campus-samambaia', label: 'Campus Samambaia', icon: 'fas fa-university' },
    { key: 'vila-itatiaia', label: 'Vila Itatiaia', icon: 'fas fa-map-pin' },
    { key: 'sao-judas-tadeu', label: 'São Judas Tadeu', icon: 'fas fa-map-pin' },
    { key: 'setor-universitario', label: 'Setor Universitário', icon: 'fas fa-map-pin' },
    { key: 'setor-leste-universitario', label: 'Setor Leste Universitário', icon: 'fas fa-map-pin' },
    { key: 'centro', label: 'Centro', icon: 'fas fa-map-pin' },
  ];
}

function kcResolveHousingFeatureValues(values, fallbackSource) {
  const explicitValues = kcParseStringArrayValue(values);
  const history = [];
  if (Array.isArray(window.__KC_HOUSING_FEATURE_HISTORY)) history.push(...window.__KC_HOUSING_FEATURE_HISTORY);
  if (kcUserPosts && typeof kcUserPosts.list === 'function') {
    try {
      const userPosts = kcUserPosts.list();
      if (Array.isArray(userPosts)) {
        history.push(...userPosts.filter((post) => String(post && post.modulo || '').toLowerCase() === 'moradia'));
      }
    } catch (_) { }
  }

  if (KCUtils && typeof KCUtils.resolveHousingFeatures === 'function') {
    const source = explicitValues.length ? explicitValues : (fallbackSource || '');
    const options = { history };
    if (fallbackSource) options.textParts = [fallbackSource];
    return KCUtils.resolveHousingFeatures(source, options);
  }

  return explicitValues.map((value) => ({
    key: String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    label: String(value || '').trim(),
    emoji: '\u{1F3F7}\uFE0F',
    isKnown: false,
  })).filter((entry) => entry.key && entry.label);
}

function kcGetHousingFeatureOptions() {
  if (KCUtils && typeof KCUtils.getHousingFeatureDefinitions === 'function') {
    return KCUtils.getHousingFeatureDefinitions();
  }

  return [
    { key: 'aceita-pets', label: 'Aceita pets', emoji: '🐾' },
    { key: 'lgbtqiapn', label: 'LGBTQIAPN+', emoji: '🌈' },
    { key: 'apenas-mulheres', label: 'Apenas mulheres', emoji: '👩' },
    { key: 'mobiliado', label: 'Mobiliado', emoji: '🛋️' },
    { key: 'contas-inclusas', label: 'Contas inclusas', emoji: '💡' },
    { key: 'proximo-ao-campus', label: 'Próximo ao campus' },
  ];
}

function kcSyncHousingRegionInput(input) {
  if (!input) return null;
  const resolved = kcResolveHousingRegionValue(input.value || '');
  if (resolved && resolved.label) {
    input.value = resolved.label;
    kcCreateState.values[input.name] = resolved.label;
  }
  return resolved;
}

function kcGetHousingFeatureFieldContext(element) {
  return element && element.closest ? element.closest('[data-kc-housing-features-field="true"]') : null;
}

function kcResolveHousingFeatureEntries(values) {
  return kcResolveHousingFeatureValues(values).map((entry) => ({
    key: String(entry && entry.key || '').trim(),
    label: String(entry && entry.label || '').trim(),
    emoji: String(entry && entry.emoji || '').trim(),
    isKnown: !!(entry && entry.isKnown),
  })).filter((entry) => entry.key && entry.label);
}

function kcSyncHousingFeatureField(fieldRoot, values) {
  const root = fieldRoot || null;
  if (!root) return [];

  const hidden = root.querySelector('[data-kc-housing-features-value]');
  const list = root.querySelector('[data-kc-housing-features-selected]');
  const pills = Array.from(root.querySelectorAll('[data-kc-housing-feature-suggestion]'));
  const entries = kcResolveHousingFeatureEntries(values);
  const labels = entries.map((entry) => entry.label);
  const keys = new Set(entries.map((entry) => entry.key));

  if (hidden) {
    hidden.value = kcSerializeHousingFeatureValues(labels);
    if (hidden.name) kcCreateState.values[hidden.name] = labels.slice();
  }

  if (list) {
    list.innerHTML = entries.length
      ? entries.map((entry) => (
        '<button class="kc-field-chip" type="button" data-kc-housing-feature-remove="' + _esc(entry.key) + '" aria-label="Remover ' + _esc(entry.label) + '">' +
          (entry.emoji ? '<span class="kc-field-chip__emoji">' + _esc(entry.emoji) + '</span>' : '') +
          '<span>' + _esc(entry.label) + '</span>' +
          '<i class="fas fa-times"></i>' +
        '</button>'
      )).join('')
      : '<span class="kc-field-chip__empty">Nenhum marcador selecionado.</span>';
  }

  pills.forEach((pill) => {
    const key = String(pill.getAttribute('data-kc-housing-feature-key') || '').trim();
    const active = key && keys.has(key);
    pill.classList.toggle('is-active', active);
    pill.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  return entries;
}

function kcAppendHousingFeatureFromInput(input) {
  const field = kcGetHousingFeatureFieldContext(input);
  if (!field || !input) return;
  const current = kcParseStringArrayValue((field.querySelector('[data-kc-housing-features-value]') || {}).value);
  const nextValue = String(input.value || '').trim();
  if (!nextValue) return;
  kcSyncHousingFeatureField(field, current.concat(nextValue));
  input.value = '';
}

function kcResolveLostFoundLocationValue(value, fallbackSource) {
  const history = [];
  if (Array.isArray(window.__KC_LOST_FOUND_LOCATION_HISTORY)) history.push(...window.__KC_LOST_FOUND_LOCATION_HISTORY);
  if (kcUserPosts && typeof kcUserPosts.list === 'function') {
    try {
      const userPosts = kcUserPosts.list();
      if (Array.isArray(userPosts)) {
        history.push(...userPosts.filter((post) => String(post && post.modulo || '').toLowerCase() === 'achados-perdidos'));
      }
    } catch (_) { }
  }

  if (KCUtils && typeof KCUtils.resolveLostFoundLocation === 'function') {
    const options = { history };
    if (fallbackSource) options.textParts = [fallbackSource];
    return KCUtils.resolveLostFoundLocation(value || fallbackSource || '', options);
  }

  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { key, label: raw, icon: 'fas fa-map-marker-alt', emoji: '📍', isKnown: false };
}

function kcGetLostFoundLocationOptions() {
  if (KCUtils && typeof KCUtils.getLostFoundLocationDefinitions === 'function') {
    return KCUtils.getLostFoundLocationDefinitions();
  }

  return [
    { key: 'biblioteca-central', label: 'Biblioteca Central', icon: 'fas fa-book', emoji: '📚' },
    { key: 'restaurante-universitario', label: 'Restaurante Universitário', icon: 'fas fa-utensils', emoji: '🍽️' },
    { key: 'estacionamento', label: 'Estacionamento', icon: 'fas fa-parking', emoji: '🅿️' },
    { key: 'salas-de-aula', label: 'Salas de Aula', icon: 'fas fa-door-open', emoji: '🚪' },
    { key: 'blocos-e-laboratorios', label: 'Blocos e Laboratórios', icon: 'fas fa-flask', emoji: '🧪' },
    { key: 'centro-de-aulas', label: 'Centro de Aulas', icon: 'fas fa-school', emoji: '🏫' },
    { key: 'praca-universitaria', label: 'Praça Universitária', icon: 'fas fa-landmark', emoji: '🏛️' },
    { key: 'campus-samambaia', label: 'Campus Samambaia', icon: 'fas fa-tree', emoji: '🌳' },
    { key: 'campus-colemar', label: 'Campus Colemar', icon: 'fas fa-graduation-cap', emoji: '🎓' },
  ];
}

function kcSyncLostFoundLocationInput(input) {
  if (!input) return null;
  const resolved = kcResolveLostFoundLocationValue(input.value || '');
  if (resolved && resolved.label) {
    input.value = resolved.label;
    kcCreateState.values[input.name] = resolved.label;
  }
  return resolved;
}

function kcResolveOpportunityWorkMode(value) {
  const raw = String(value || '').trim();
  const normalized = (KCUtils && typeof KCUtils.normalizeText === 'function')
    ? KCUtils.normalizeText(raw)
    : raw.toLowerCase();

  if (!normalized) return { key: '', label: '' };
  if (normalized.includes('hibrid')) return { key: 'hibrido', label: 'H\u00edbrido' };
  if (normalized.includes('remot') || normalized.includes('home office')) return { key: 'remoto', label: 'Remoto' };
  if (normalized.includes('presencial') || normalized.includes('onsite') || normalized.includes('on-site')) {
    return { key: 'presencial', label: 'Presencial' };
  }
  return { key: '', label: raw };
}

function kcResolveOpportunityRegime(value) {
  const raw = String(value || '').trim();
  const normalized = (KCUtils && typeof KCUtils.normalizeText === 'function')
    ? KCUtils.normalizeText(raw)
    : raw.toLowerCase();

  if (!normalized) return { key: '', label: '' };
  if (normalized.includes('clt')) return { key: 'clt', label: 'CLT' };
  if (normalized.includes('pj')) return { key: 'pj', label: 'PJ' };
  if (normalized.includes('tempor')) return { key: 'temporario', label: 'Tempor\u00e1rio' };
  if (normalized.includes('aprendiz')) return { key: 'aprendiz', label: 'Jovem Aprendiz' };
  if (normalized.includes('bolsa')) return { key: 'bolsa', label: 'Bolsa' };
  return {
    key: normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    label: raw,
  };
}

const KC_CREATE_MAX_IMAGES = 5;

function kcReadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem'));
      reader.readAsDataURL(file);
    } catch (err) {
      reject(err);
    }
  });
}

async function kcReadAndCompressImage(file, opts = {}) {
  const maxSide = (typeof opts.maxSide === 'number') ? opts.maxSide : 1200;
  const quality = (typeof opts.quality === 'number') ? opts.quality : 0.82;

  const original = await kcReadFileAsDataUrl(file);
  if (!original) return '';

  // Mantém GIF como está (para não quebrar animação)
  if (String(file.type || '').toLowerCase() === 'image/gif') return original;

  try {
    const img = await new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = original;
    });

    if (!img) return original;

    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!w || !h) return original;

    const scale = Math.min(1, maxSide / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return original;

    ctx.drawImage(img, 0, 0, outW, outH);

    // Converte para JPEG para reduzir tamanho
    const out = canvas.toDataURL('image/jpeg', quality);
    return out || original;
  } catch {
    return original;
  }
}

async function kcAddImagesFromFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const remaining = KC_CREATE_MAX_IMAGES - kcCreateState.images.length;
  if (remaining <= 0) {
    showToast(`Máximo de ${KC_CREATE_MAX_IMAGES} imagens (1 capa + ${KC_CREATE_MAX_IMAGES - 1}).`, 'warn', 2600);
    return;
  }

  const candidates = files
    .filter(f => f && typeof f.type === 'string' && f.type.startsWith('image/'))
    .slice(0, remaining);

  if (!candidates.length) {
    showToast('Selecione arquivos de imagem (JPG/PNG/WebP).', 'warn', 2400);
    return;
  }

  for (const file of candidates) {
    // Proteção simples: evita localStorage enorme
    if (file.size > 8 * 1024 * 1024) {
      showToast('Imagem muito grande (máx ~8MB). Use uma menor.', 'warn', 2600);
      continue;
    }
    try {
      const dataUrl = await kcReadAndCompressImage(file);
      if (!dataUrl) continue;

      const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      kcCreateState.images.push({ id, dataUrl, name: file.name || '', size: file.size || 0 });

      if (!kcCreateState.coverImageId) kcCreateState.coverImageId = id;
    } catch {
      showToast('Não consegui carregar uma das imagens.', 'warn', 2400);
    }
  }

  kcRenderCreateModal();
}

function kcRemoveCreateImageById(id) {
  const before = kcCreateState.images.length;
  kcCreateState.images = kcCreateState.images.filter(img => String(img.id) !== String(id));
  if (kcCreateState.images.length !== before) {
    if (kcCreateState.coverImageId && String(kcCreateState.coverImageId) === String(id)) {
      kcCreateState.coverImageId = kcCreateState.images.length ? kcCreateState.images[0].id : null;
    }
    kcRenderCreateModal();
  }
}

function kcSetCreateCoverImageById(id) {
  if (!id) return;
  const exists = kcCreateState.images.some(img => String(img.id) === String(id));
  if (!exists) return;
  kcCreateState.coverImageId = id;
  kcRenderCreateModal();
}

function kcGetOrderedCreateImages() {
  const imgs = Array.isArray(kcCreateState.images) ? kcCreateState.images : [];
  if (!imgs.length) return [];

  const coverId = kcCreateState.coverImageId;
  const cover = coverId ? imgs.find(i => String(i.id) === String(coverId)) : null;

  if (!cover) return imgs.map(i => i.dataUrl).filter(Boolean);

  const others = imgs.filter(i => String(i.id) !== String(coverId)).map(i => i.dataUrl).filter(Boolean);
  return [cover.dataUrl, ...others].filter(Boolean);
}

function kcCreateImagesSectionHtml() {
  const count = kcCreateState.images.length;
  const remaining = KC_CREATE_MAX_IMAGES - count;
  const disabled = remaining <= 0;

  const thumbs = kcCreateState.images.map((img) => {
    const isCover = kcCreateState.coverImageId && String(kcCreateState.coverImageId) === String(img.id);
    return `
      <div class="kc-img-thumb${isCover ? ' is-cover' : ''}">
        <img src="${_esc(img.dataUrl)}" alt="Imagem da publicação" loading="lazy" />
        ${isCover ? `<div class="kc-img-badge"><i class="fas fa-star"></i> Capa</div>` : ''}
        <div class="kc-img-actions">
          <button type="button" class="kc-img-action" data-kc-img-action="cover" data-kc-img-id="${_esc(img.id)}" title="Definir como capa">
            <i class="fas fa-star"></i>
          </button>
          <button type="button" class="kc-img-action" data-kc-img-action="remove" data-kc-img-id="${_esc(img.id)}" title="Remover">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="kc-create-group kc-create-images">
      <div class="kc-create-group__head kc-create-group__head--row">
        <span>Imagens</span>
        <small>${count}/${KC_CREATE_MAX_IMAGES}</small>
      </div>

      <input id="kcImagesInput" type="file" accept="image/*" ${disabled ? 'disabled' : ''} multiple hidden />

      <button type="button" class="kc-img-dropzone" data-kc-open-images="true" ${disabled ? 'disabled' : ''}>
        <i class="fas fa-cloud-upload-alt"></i>
        <div>
          <div class="kc-img-dropzone__title">${disabled ? 'Limite de imagens atingido' : 'Clique para adicionar imagens'}</div>
          <div class="kc-img-dropzone__sub">Máximo ${KC_CREATE_MAX_IMAGES} imagens (1 capa + ${KC_CREATE_MAX_IMAGES - 1}).</div>
        </div>
      </button>

      ${count ? `<div class="kc-img-grid">${thumbs}</div>` : ''}
      <div class="kc-img-hint">Dica: clique na estrela para escolher a <strong>capa</strong>.</div>
    </div>
  `;
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
    fields.push({ type: 'text', name: 'origem', label: 'Origem', placeholder: 'Ex: Campus Samambaia', required: true });
    fields.push({ type: 'text', name: 'destino', label: 'Destino', placeholder: 'Ex: Centro', required: true });
    fields.push({ type: 'text', name: 'horario', label: 'Horário', placeholder: 'Ex: 18h30', required: false });
    fields.push({ ...moneyFieldMeta, name: 'contribuicao', label: 'Contribuição (opcional)', placeholder: 'Ex: 5,00', required: false });
    if (selections.tipo === 'ofereco') {
      fields.push({ type: 'number', name: 'vagas', label: 'Vagas', placeholder: '2', required: false, min: 1, max: 8 });
    }
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
  }

  return fields;
}

function kcRenderCreateModal() {
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;

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
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <textarea id="${id}" name="${_esc(f.name)}" rows="${f.rows || 4}" placeholder="${_esc(f.placeholder || '')}" ${required} ${maxlength}>${_esc(val || '')}</textarea>
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
      const suggestions = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <button type="button" class="kc-field-pill" data-kc-housing-region-suggestion="${_esc(opt.label)}">
          <i class="${_esc(opt.icon || 'fas fa-map-pin')}"></i>
          <span>${_esc(opt.label)}</span>
        </button>
      `).join('');
      const listItems = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <option value="${_esc(opt.label)}"></option>
      `).join('');
      parts.push(`
        <div class="kc-field kc-field--housing-region">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${_esc(f.name)}" type="text" placeholder="${_esc(f.placeholder || '')}" value="${_esc(val || '')}" list="${listId}" data-kc-housing-region-input="true" ${required} />
          <datalist id="${listId}">${listItems}</datalist>
          <div class="kc-field-pill-row">${suggestions}</div>
          <small class="kc-field-hint">Escolha uma sugestão ou digite outra região.</small>
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
          <small class="kc-field-hint">Escolha sugestões ou adicione outros marcadores para o ambiente.</small>
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
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${_esc(f.name)}" type="${type}" placeholder="${placeholder}" ${valueAttr} ${required} ${min} ${max} ${maxlength} ${step} ${inputmode} ${pattern} />
        </div>
      `);
    }
  });
  parts.push('</div>');

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
  kcEnsureCreateModal();
  kcLastFocus = document.activeElement;

  const moduleKey = post.modulo || post.module || '';
  const schema = KC_CREATE_SCHEMA[moduleKey];
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
    data: md.data || '',
    hora: md.hora || '',
    link: md.link || '',
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

    const categoryGroupId = schema.categoryGroupId;
    const rawCatKey = categoryGroupId ? kcCreateState.selections[categoryGroupId] : '';
    const isOpportunity = kcCreateState.moduleKey === 'oportunidades';
    const isMoradia = kcCreateState.moduleKey === 'moradia';
    const isAchados = kcCreateState.moduleKey === 'achados-perdidos';
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
        kcCreateState.values.areaAtuacao || subLabel || subKey || '',
        `${title} ${desc} ${kcCreateState.values.localizacao || ''}`
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
        kcCreateState.values.regiao || kcCreateState.values.localizacao || '',
        `${title} ${desc} ${kcCreateState.values.localizacao || ''}`
      )
      : { key: '', label: '', icon: '', zoneKey: '', zoneLabel: '' };
    const housingFeatures = isMoradia
      ? kcResolveHousingFeatureValues(kcCreateState.values.marcadoresMoradia || [])
      : [];
    const lostFoundLocation = isAchados
      ? kcResolveLostFoundLocationValue(
        kcCreateState.values.localizacao || '',
        `${title} ${desc} ${kcCreateState.values.localizacao || ''}`
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
    if (kcCreateState.moduleKey === 'eventos' && (kcCreateState.values.gratuito === true || kcCreateState.values.gratuito === 'true')) {
      preco = 0;
    } else {
      const n = kcParseBRLNumber(kcCreateState.values.preco);
      if (n != null) preco = n;
    }

    if (kcCreateState.moduleKey === 'achados-perdidos' && kcCreateState.selections.status === 'perdidos') {
      const r = String(kcCreateState.values.recompensa || '').trim();
      if (r) precoTexto = 'Recompensa: R$ ' + r;
    }

    if (isMoradia && kcNormalizeHousingTypeKey(rawCatKey) === 'procurando') {
      const budgetValue = kcParseBRLNumber(kcCreateState.values.orcamento);
      if (budgetValue != null) preco = budgetValue;
      const budgetText = String(kcCreateState.values.orcamento || '').trim();
      if (budgetText) precoTexto = 'Até R$ ' + budgetText + '/mês';
    }

    const opportunityTypeKey = isOpportunity ? kcNormalizeOpportunityTypeKey(rawCatKey) : '';
    const opportunityUsesRegime = opportunityTypeKey === 'emprego';
    const opportunityWorkMode = isOpportunity
      ? kcResolveOpportunityWorkMode(kcCreateState.values.modalidadeTrabalho || '')
      : { key: '', label: '' };
    const opportunityRegime = (isOpportunity && opportunityUsesRegime)
      ? kcResolveOpportunityRegime(kcCreateState.values.regimeContratacao || '')
      : { key: '', label: '' };

    if (isOpportunity) {
      const remunValue = kcParseBRLNumber(kcCreateState.values.remuneracao);
      if (remunValue != null) preco = remunValue;

      const remunText = String(kcCreateState.values.remuneracao || '').trim();
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
      condicao: kcCreateState.values.condicao ? String(kcCreateState.values.condicao) : '',
      localizacao: isAchados ? (lostFoundLocation.label || String(kcCreateState.values.localizacao || '')) : (kcCreateState.values.localizacao ? String(kcCreateState.values.localizacao) : ''),
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
      contato: kcCreateState.values.contato ? String(kcCreateState.values.contato) : '',
      remuneracao: kcCreateState.values.remuneracao ? String(kcCreateState.values.remuneracao) : '',

      // flags
      verificado: false,
      emoji: schema.emoji,
      imagens,
      sustentavel: !!kcCreateState.values.sustentavel,

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
        detalhes: kcCreateState.values.detalhes ? String(kcCreateState.values.detalhes) : '',
        orcamento: kcCreateState.values.orcamento ? String(kcCreateState.values.orcamento) : '',
        area: isOpportunity ? (opportunityArea.label || '') : '',
        areaLabel: isOpportunity ? (opportunityArea.label || '') : '',
        areaKey: isOpportunity ? (opportunityArea.key || '') : '',
        workMode: isOpportunity ? (opportunityWorkMode.key || '') : '',
        workModeLabel: isOpportunity ? (opportunityWorkMode.label || '') : '',
        employmentType: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.key || '') : '',
        employmentTypeLabel: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
        regimeContratacao: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
        contato: kcCreateState.values.contato ? String(kcCreateState.values.contato) : '',
        remuneracao: kcCreateState.values.remuneracao ? String(kcCreateState.values.remuneracao) : '',
        modalidadeTrabalho: kcCreateState.values.modalidadeTrabalho ? String(kcCreateState.values.modalidadeTrabalho) : '',
        recompensa: kcCreateState.values.recompensa ? String(kcCreateState.values.recompensa) : '',
        entrega: kcCreateState.values.entrega ? String(kcCreateState.values.entrega) : '',
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

      showToast('Publicando...', 'info', 1600);
      try {
        post = await apiCreateFn(payload);
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

window.kcOpenCreatePostModal = kcOpenCreatePostModal;
window.kcCloseCreatePostModal = kcCloseCreatePostModal;
window.kcOpenEditPostModal = kcOpenEditPostModal;
