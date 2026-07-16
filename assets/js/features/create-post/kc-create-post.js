/* KinoCampus — kc-create-post.js
   Modal de criação/edição de publicações.
   Extraído de kc-core.js (F1).
*/



function isProductionRuntime() {
  return !!(KC_ENV && KC_ENV.isProduction === true);
}


// ─── Render/modal: extraído para kc-create-post.render.js (v11.31.7) ──────
// Stubs de delegação — lógica real em window._KCCreatePost.render

function _kcRenderModule() {
  return window._KCCreatePost && window._KCCreatePost.render;
}

function _kcFormatDescriptionField(textarea, format) {
  var r = _kcRenderModule();
  if (r && typeof r.formatDescriptionField === 'function') r.formatDescriptionField(textarea, format);
}

function _kcUpdateDescPreview(textarea) {
  var r = _kcRenderModule();
  if (r && typeof r.updateDescPreview === 'function') r.updateDescPreview(textarea);
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

function kcGetModuloFilterForPage() {
  const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (page.includes('caronas')) return 'caronas';
  if (page.includes('achados-perdidos')) return 'achados-perdidos';
  if (page.includes('eventos')) return 'eventos';
  if (page.includes('moradia')) return 'moradia';
  if (page.includes('oportunidades')) return 'oportunidades';
  if (page.includes('compra-venda')) return 'compra-venda';
  return null;
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
  var r = _kcRenderModule();
  if (r && typeof r.ensureCreateModal === 'function') r.ensureCreateModal();
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
  var r = _kcRenderModule();
  return (r && typeof r.createSustainSectionHtml === 'function') ? r.createSustainSectionHtml() : '';
}

function kcCreateVisibilitySectionHtml() {
  var r = _kcRenderModule();
  return (r && typeof r.createVisibilitySectionHtml === 'function') ? r.createVisibilitySectionHtml() : '';
}


// ─── Geração de campos: extraído para kc-create-post.fields.js (v11.31.5) ──
function _kcFieldsModule() {
  return window._KCCreatePost && window._KCCreatePost.fields;
}

function kcBuildFieldsForModule(moduleKey, selections, values, opts) {
  var f = _kcFieldsModule();
  return (f && typeof f.buildFieldsForModule === 'function') ? f.buildFieldsForModule(moduleKey, selections, values, opts) : [];
}

function kcRenderCreateModal() {
  var r = _kcRenderModule();
  if (r && typeof r.renderCreateModal === 'function') r.renderCreateModal();
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

function kcResolveEditLocationValue(post, metadata, moduleKey) {
  const source = post && typeof post === 'object' ? post : {};
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  if (moduleKey === 'achados-perdidos') {
    return meta.lostFoundLocationLabel || source.lostFoundLocationLabel || source.location || source.localizacao || meta.localizacao || meta.location || '';
  }
  return source.location || source.localizacao || meta.localizacao || meta.location || meta.local || '';
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
    localizacao: kcResolveEditLocationValue(post, md, moduleKey),
    condicao: post.condicao || md.condicao || '',
    sustentavel: !!(post.sustentavel || post.sustainable || md.sustentavel),
    // Campos de módulos específicos (extraídos de metadata)
    origem: md.origem || '',
    destino: md.destino || '',
    horario: md.horario || '',
    vagas: md.vagas || '',
    data: md.data_evento || md.data || '',
    data_fim: md.data_fim_evento || md.data_fim || '',
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


// ─── Submit/edição: extraído para kc-create-post.submit.js (v11.31.6) ──
function _kcSubmitModule() {
  return window._KCCreatePost && window._KCCreatePost.submit;
}
async function kcHandleCreateSubmit() {
  var s = _kcSubmitModule();
  return (s && typeof s.handleCreateSubmit === 'function') ? s.handleCreateSubmit() : undefined;
}
function kcInitCreatePostTriggers() {
  // Intercepta links e botoes existentes
  document.body.addEventListener('click', (e) => {
    const trigger = e.target.closest('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn');
    if (!trigger) return;

    // Com JS ativo, create-post.html funciona apenas como fallback de acesso direto.
    // Os botoes devem abrir o modal ou o login, sem navegar para a pagina fallback.
    e.preventDefault();

    // tenta inferir módulo atual pela página
    const mod = kcGetModuloFilterForPage();
    kcOpenCreatePostModal(mod || null);
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
