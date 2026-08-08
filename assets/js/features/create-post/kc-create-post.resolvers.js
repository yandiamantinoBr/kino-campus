/**
 * @file kc-create-post.resolvers.js
 * @description Sub-módulo de resolvers e normalizadores de domínio do formulário de criação de publicações (v11.31.4).
 * Extraído de kc-create-post.js. Registra window._KCCreatePost.resolvers.
 *
 * Dependências em runtime:
 *   - window._KCCreatePost        — namespace criado por kc-create-post.js
 *   - window._KCCreatePost._state — referência ao estado mútuo (kcCreateState)
 *   - window.KCUtils              — canonicalCategory, resolveOpportunityArea, resolveHousingRegion, etc.
 *   - window.KC_CONSTANTS         — CARONAS_LOCATION_DEFINITIONS
 *   - window.kcUserPosts          — histórico de publicações do usuário
 *   - window.__KC_OPPORTUNITY_AREA_HISTORY, __KC_HOUSING_REGION_HISTORY, etc.
 *
 * Carregado após kc-create-post.js em todos os HTMLs que usam o modal de criação.
 * Execução: IIFE imediata → window._KCCreatePost.resolvers disponível antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCCreatePost = window._KCCreatePost || {};

  // ── Utilitário local ──────────────────────────────────────────────────────
  function _esc(str) {
    return (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function')
      ? window.KCUtils.escapeHtml(str)
      : String(str || '');
  }

  // ── Acesso defensivo ao estado compartilhado ──────────────────────────────
  function _getState() {
    return window._KCCreatePost && window._KCCreatePost._state;
  }

  // ── Oportunidades: tipo ───────────────────────────────────────────────────
  function kcNormalizeOpportunityTypeKey(value) {
    const canonical = KCUtils && typeof KCUtils.canonicalCategory === 'function'
      ? KCUtils.canonicalCategory(value)
      : String(value || '').trim().toLowerCase();
    const rawNormalized = KCUtils && typeof KCUtils.normalizeText === 'function'
      ? KCUtils.normalizeText(value)
      : String(value || '').trim().toLowerCase();
    const haystack = `${rawNormalized} ${canonical}`;

    if (!canonical) return '';
    if (haystack.includes('edital') || haystack.includes('editai') || haystack.includes('chamada')) return 'edital';
    if (haystack.includes('concurso') || haystack.includes('processo seletivo') || haystack.includes('selecao')) return 'concurso';
    if (haystack.includes('bolsa') || haystack.includes('auxilio') || haystack.includes('auxílio') || haystack.includes('fomento')) return 'bolsa';
    if (haystack.includes('curso') || haystack.includes('capacit') || haystack.includes('qualific') || haystack.includes('formacao')) return 'curso-capacitacao';
    if (haystack.includes('estagio')) return 'estagio';
    if (haystack.includes('emprego')) return 'emprego';
    if (haystack.includes('freelancer')) return 'freelancer';
    if (haystack.includes('monitor')) return 'monitoria';
    if (haystack.includes('pesquis') || haystack.includes('pibic') || haystack.includes('pivic')) return 'pesquisa';
    if (haystack.includes('volunt')) return 'voluntariado';
    return canonical;
  }

  function kcGetOpportunityTypeOptionKey(value) {
    const normalized = kcNormalizeOpportunityTypeKey(value);
    if (normalized === 'edital') return 'editais';
    if (normalized === 'concurso') return 'concursos';
    if (normalized === 'bolsa') return 'bolsas';
    if (normalized === 'curso-capacitacao') return 'cursos-capacitacoes';
    if (normalized === 'estagio') return 'estagios';
    if (normalized === 'emprego') return 'empregos';
    return normalized;
  }

  // ── Oportunidades: área ───────────────────────────────────────────────────
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

  // ── Oportunidades: modalidade e regime ────────────────────────────────────
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

  // ── Moradia: tipo ─────────────────────────────────────────────────────────
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

  // ── Utilitário de array de strings ────────────────────────────────────────
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

  // ── Moradia: região ───────────────────────────────────────────────────────
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
      { key: 'sao-judas-tadeu', label: 'S\u00e3o Judas Tadeu', icon: 'fas fa-map-pin' },
      { key: 'setor-universitario', label: 'Setor Universit\u00e1rio', icon: 'fas fa-map-pin' },
      { key: 'setor-leste-universitario', label: 'Setor Leste Universit\u00e1rio', icon: 'fas fa-map-pin' },
      { key: 'centro', label: 'Centro', icon: 'fas fa-map-pin' },
    ];
  }

  // ── Moradia: marcadores (features) ────────────────────────────────────────
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
      { key: 'aceita-pets', label: 'Aceita pets', emoji: '\uD83D\uDC3E' },
      { key: 'lgbtqiapn', label: 'LGBTQIAPN+', emoji: '\uD83C\uDF08' },
      { key: 'apenas-mulheres', label: 'Apenas mulheres', emoji: '\uD83D\uDC69' },
      { key: 'mobiliado', label: 'Mobiliado', emoji: '\uD83D\uDECB\uFE0F' },
      { key: 'contas-inclusas', label: 'Contas inclusas', emoji: '\uD83D\uDCA1' },
      { key: 'proximo-ao-campus', label: 'Pr\u00f3ximo ao campus' },
    ];
  }

  function kcGetHousingFeatureFieldContext(element) {
    return element && element.closest ? element.closest('[data-kc-housing-features-field="true"]') : null;
  }

  function kcResolveHousingFeatureEntries(values, featureKind) {
    const entries = featureKind === 'caronas'
      ? kcResolveCaronasFeatureValues(values)
      : kcResolveHousingFeatureValues(values);
    return entries.map((entry) => ({
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
    const featureKind = hidden && hidden.name === 'marcadoresCarona' ? 'caronas' : 'moradia';
    const entries = kcResolveHousingFeatureEntries(values, featureKind);
    const labels = entries.map((entry) => entry.label);
    const keys = new Set(entries.map((entry) => entry.key));

    if (hidden) {
      hidden.value = kcSerializeHousingFeatureValues(labels);
      if (hidden.name) {
        var state = _getState();
        if (state) state.values[hidden.name] = labels.slice();
      }
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

  // ── Moradia/Caronas: sync de input de região ──────────────────────────────
  function kcResolveCaronasLocationValue(value) {
    if (KCUtils && typeof KCUtils.resolveCaronasLocation === 'function') {
      return KCUtils.resolveCaronasLocation(value || '');
    }
    return { key: '', label: value || '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isCampus: false, isKnown: false, source: 'fallback' };
  }

  function kcGetCaronasCampusOptions() {
    var defs = (typeof KC_CONSTANTS !== 'undefined' && Array.isArray(KC_CONSTANTS.CARONAS_LOCATION_DEFINITIONS))
      ? KC_CONSTANTS.CARONAS_LOCATION_DEFINITIONS : [];
    return defs.map(function (d) { return { key: d.key, label: d.label, icon: d.icon || 'fas fa-map-pin' }; });
  }

  function kcGetCaronasFeatureOptions() {
    return [
      { key: 'ar-condicionado', label: 'Ar condicionado', emoji: '\uD83D\uDE97' },
      { key: 'aceita-pets', label: 'Aceita pets', emoji: '\uD83D\uDC3E' },
      { key: 'som-musica', label: 'Som/M\u00fasica', emoji: '\uD83C\uDFB5' },
      { key: 'sem-fumar', label: 'Sem fumar', emoji: '\uD83D\uDEAD' },
      { key: 'somente-mulheres', label: 'Somente mulheres', emoji: '\uD83D\uDC69' },
      { key: 'quatro-mais-lugares', label: '4+ lugares', emoji: '\uD83D\uDCBA' },
      { key: 'ida-e-volta', label: 'Ida e volta', emoji: '\uD83D\uDD04' },
      { key: 'pontualidade', label: 'Pontualidade', emoji: '\u23F0' },
      { key: 'preco-fixo', label: 'Pre\u00e7o fixo', emoji: '\uD83C\uDFF7\uFE0F' },
    ];
  }

  function kcResolveCaronasFeatureValues(values) {
    const options = kcGetCaronasFeatureOptions();
    const aliases = {
      '4-mais-lugares': 'quatro-mais-lugares',
      'quatro-ou-mais-lugares': 'quatro-mais-lugares',
      'nao-fumantes': 'sem-fumar',
      'nao-fumar': 'sem-fumar',
      'apenas-mulheres': 'somente-mulheres',
    };
    const normalizeKey = function (value) {
      const normalized = KCUtils && typeof KCUtils.normalizeText === 'function'
        ? KCUtils.normalizeText(value)
        : String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const key = String(normalized || '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return aliases[key] || key;
    };
    const byKey = new Map();
    options.forEach(function (entry) {
      byKey.set(normalizeKey(entry.key), entry);
      byKey.set(normalizeKey(entry.label), entry);
    });

    const seen = new Set();
    return kcParseStringArrayValue(values).map(function (value) {
      const key = normalizeKey(value);
      if (!key || seen.has(key)) return null;
      seen.add(key);
      const known = byKey.get(key);
      if (known) return { key: known.key, label: known.label, emoji: known.emoji || '', isKnown: true };
      return { key, label: String(value || '').trim(), emoji: '\uD83C\uDFF7\uFE0F', isKnown: false };
    }).filter(function (entry) { return entry && entry.key && entry.label; });
  }

  function kcSyncHousingRegionInput(input) {
    if (!input) return null;
    var fieldName = input.getAttribute('name') || '';
    var isCaronasField = (fieldName === 'origem' || fieldName === 'destino');
    var resolved;
    if (isCaronasField) {
      resolved = kcResolveCaronasLocationValue(input.value || '');
    } else {
      resolved = kcResolveHousingRegionValue(input.value || '');
    }
    if (resolved && resolved.label) {
      input.value = resolved.label;
      var state = _getState();
      if (state) state.values[fieldName || input.name] = resolved.label;
    }
    return resolved;
  }

  // ── Achados e Perdidos: local ─────────────────────────────────────────────
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
    return { key, label: raw, icon: 'fas fa-map-marker-alt', emoji: '\uD83D\uDCCD', isKnown: false };
  }

  function kcGetLostFoundLocationOptions() {
    if (KCUtils && typeof KCUtils.getLostFoundLocationDefinitions === 'function') {
      return KCUtils.getLostFoundLocationDefinitions();
    }

    return [
      { key: 'biblioteca-central', label: 'Biblioteca Central', icon: 'fas fa-book', emoji: '\uD83D\uDCDA' },
      { key: 'restaurante-universitario', label: 'Restaurante Universit\u00e1rio', icon: 'fas fa-utensils', emoji: '\uD83C\uDF7D\uFE0F' },
      { key: 'estacionamento', label: 'Estacionamento', icon: 'fas fa-parking', emoji: '\uD83C\uDD7F\uFE0F' },
      { key: 'salas-de-aula', label: 'Salas de Aula', icon: 'fas fa-door-open', emoji: '\uD83D\uDEAA' },
      { key: 'blocos-e-laboratorios', label: 'Blocos e Laborat\u00f3rios', icon: 'fas fa-flask', emoji: '\uD83E\uDDEA' },
      { key: 'centro-de-aulas', label: 'Centro de Aulas', icon: 'fas fa-school', emoji: '\uD83C\uDFEB' },
      { key: 'praca-universitaria', label: 'Pra\u00e7a Universit\u00e1ria', icon: 'fas fa-landmark', emoji: '\uD83C\uDFDB\uFE0F' },
      { key: 'campus-samambaia', label: 'Campus Samambaia', icon: 'fas fa-tree', emoji: '\uD83C\uDF33' },
      { key: 'campus-colemar', label: 'Campus Colemar', icon: 'fas fa-graduation-cap', emoji: '\uD83C\uDF93' },
    ];
  }

  function kcSyncLostFoundLocationInput(input) {
    if (!input) return null;
    const resolved = kcResolveLostFoundLocationValue(input.value || '');
    if (resolved && resolved.label) {
      input.value = resolved.label;
      var state = _getState();
      if (state) state.values[input.name] = resolved.label;
    }
    return resolved;
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCCreatePost.resolvers = {
    normalizeOpportunityTypeKey: kcNormalizeOpportunityTypeKey,
    getOpportunityTypeOptionKey: kcGetOpportunityTypeOptionKey,
    resolveOpportunityAreaValue: kcResolveOpportunityAreaValue,
    getOpportunityAreaOptions: kcGetOpportunityAreaOptions,
    resolveOpportunityWorkMode: kcResolveOpportunityWorkMode,
    resolveOpportunityRegime: kcResolveOpportunityRegime,
    normalizeHousingTypeKey: kcNormalizeHousingTypeKey,
    getHousingTypeOptionKey: kcGetHousingTypeOptionKey,
    parseStringArray: kcParseStringArrayValue,
    serializeHousingFeatureValues: kcSerializeHousingFeatureValues,
    resolveHousingRegionValue: kcResolveHousingRegionValue,
    getHousingRegionOptions: kcGetHousingRegionOptions,
    resolveHousingFeatureValues: kcResolveHousingFeatureValues,
    getHousingFeatureOptions: kcGetHousingFeatureOptions,
    getHousingFeatureFieldContext: kcGetHousingFeatureFieldContext,
    resolveHousingFeatureEntries: kcResolveHousingFeatureEntries,
    syncHousingFeatureField: kcSyncHousingFeatureField,
    appendHousingFeatureFromInput: kcAppendHousingFeatureFromInput,
    resolveCaronasLocationValue: kcResolveCaronasLocationValue,
    getCaronasCampusOptions: kcGetCaronasCampusOptions,
    getCaronasFeatureOptions: kcGetCaronasFeatureOptions,
    resolveCaronasFeatureValues: kcResolveCaronasFeatureValues,
    syncHousingRegionInput: kcSyncHousingRegionInput,
    resolveLostFoundLocationValue: kcResolveLostFoundLocationValue,
    getLostFoundLocationOptions: kcGetLostFoundLocationOptions,
    syncLostFoundLocationInput: kcSyncLostFoundLocationInput,
  };

})();
