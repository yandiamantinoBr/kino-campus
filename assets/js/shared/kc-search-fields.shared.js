/*
  KinoCampus - kc-search-fields.shared.js
  Search-field contract derived from the create-post schema and field builder.

  V76.33 contract only: this asset is not loaded by any HTML page yet.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCSearchFieldRegistry = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var COMMON_FIELDS = ['titulo', 'descricao'];

  var MODULE_SCENARIOS = {
    'compra-venda': [
      { key: 'vendo', selections: { categoria: 'eletronicos', acao: 'vendo' }, values: {} },
      { key: 'compro', selections: { categoria: 'livros', acao: 'compro' }, values: {} }
    ],
    caronas: [
      { key: 'ofereco', selections: { tipo: 'ofereco' }, values: {} },
      { key: 'procuro', selections: { tipo: 'procuro' }, values: {} }
    ],
    moradia: [
      { key: 'oferta', selections: { tipo: 'quartos' }, values: {} },
      { key: 'procurando', selections: { tipo: 'procurando' }, values: {} }
    ],
    eventos: [
      { key: 'pago', selections: { topico: 'academicos' }, values: { gratuito: false } },
      { key: 'gratuito', selections: { topico: 'culturais' }, values: { gratuito: true } }
    ],
    'achados-perdidos': [
      { key: 'perdidos', selections: { status: 'perdidos', tipo: 'documentos' }, values: {} },
      { key: 'encontrados', selections: { status: 'encontrados', tipo: 'eletronicos' }, values: {} }
    ],
    oportunidades: [
      { key: 'emprego', selections: { tipo: 'empregos' }, values: {} },
      { key: 'estagio', selections: { tipo: 'estagios' }, values: {} }
    ]
  };

  var FIELD_POLICIES = {
    titulo: policy('public-content', ['text'], ['title', 'titulo'], true, false),
    descricao: policy('public-content', ['text'], ['description', 'descricao'], true, false),
    localizacao: policy('public-content', ['text', 'location'], [
      'location', 'localizacao', 'metadata.lostFoundLocationKey', 'metadata.lostFoundLocationLabel'
    ], true, true, 'canonical-location'),
    preco: policy('public-content', ['number-range'], ['price', 'preco', 'metadata.precoTexto'], false, true),
    condicao: policy('public-content', ['enum'], ['metadata.condicao', 'condicao'], true, true),
    origem: policy('public-content', ['text', 'location'], ['metadata.origem', 'origem'], true, true, 'canonical-location'),
    destino: policy('public-content', ['text', 'location'], ['metadata.destino', 'destino'], true, true, 'canonical-location'),
    horario: policy('public-content', ['time'], ['metadata.horario', 'horario'], false, true),
    contribuicao: policy('public-content', ['number-range'], ['metadata.contribuicao', 'contribuicao'], false, true),
    vagas: policy('public-content', ['number-range'], ['metadata.vagas', 'vagas'], false, true),
    marcadoresCarona: policy('public-content', ['set'], [
      'metadata.caronasFeatureKeys', 'metadata.caronasFeatureLabels', 'metadata.marcadoresCarona',
      'caronasFeatureKeys', 'caronasFeatureLabels'
    ], true, true, 'canonical-ride-feature'),
    regiao: policy('public-content', ['text', 'location'], [
      'metadata.regionKey', 'metadata.regionLabel', 'metadata.regionZoneKey', 'metadata.regionZoneLabel',
      'metadata.regiao', 'regionKey', 'regionLabel', 'regiao'
    ], true, true, 'canonical-housing-region'),
    marcadoresMoradia: policy('public-content', ['set'], [
      'metadata.housingFeatureKeys', 'metadata.housingFeatureLabels', 'metadata.marcadoresMoradia',
      'housingFeatureKeys', 'housingFeatureLabels'
    ], true, true, 'canonical-housing-feature'),
    orcamento: policy('public-content', ['number-range'], ['metadata.orcamento', 'orcamento'], false, true),
    detalhes: policy('public-content', ['text'], ['metadata.detalhes', 'detalhes'], true, false),
    data: policy('public-content', ['date-range'], ['metadata.data_evento', 'data'], false, true),
    data_fim: policy('public-content', ['date-range'], ['metadata.data_fim_evento', 'data_fim'], false, true),
    hora: policy('public-content', ['time'], ['metadata.hora_evento', 'hora'], false, true),
    link: policy('restricted-link', [], ['metadata.link', 'link'], false, false),
    link_as_cta: policy('operational', [], ['metadata.link_as_cta', 'link_as_cta'], false, false),
    gratuito: policy('public-content', ['boolean'], ['metadata.gratuito', 'gratuito'], true, true),
    recompensa: policy('public-content', ['number-range'], ['metadata.recompensa', 'recompensa'], false, true),
    entrega: policy('public-content', ['text', 'location'], ['metadata.entrega', 'entrega'], true, true),
    areaAtuacao: policy('public-content', ['text', 'enum'], [
      'metadata.areaKey', 'metadata.areaLabel', 'metadata.area', 'areaKey', 'area'
    ], true, true, 'canonical-opportunity-area'),
    modalidadeTrabalho: policy('public-content', ['enum'], [
      'metadata.workMode', 'metadata.workModeLabel', 'metadata.modalidadeTrabalho', 'modalidadeTrabalho'
    ], true, true, 'canonical-work-mode'),
    regimeContratacao: policy('public-content', ['enum'], [
      'metadata.employmentType', 'metadata.employmentTypeLabel', 'metadata.regimeContratacao', 'regimeContratacao'
    ], true, true),
    remuneracao: policy('public-content', ['number-range'], ['metadata.remuneracao', 'remuneracao'], false, true),
    contato: policy('restricted-contact', [], ['metadata.contato', 'contato'], false, false)
  };

  var PREFERENCE_TAG_GROUPS = {
    'compra-venda': ['categoria'],
    moradia: ['tipo'],
    eventos: ['topico'],
    oportunidades: ['tipo']
  };

  function policy(privacyClass, operators, payloadPaths, indexable, filterable, preferenceFeature) {
    return {
      privacyClass: privacyClass,
      operators: operators,
      payloadPaths: payloadPaths,
      indexable: indexable === true,
      filterable: filterable === true,
      aggregatable: filterable === true && operators.indexOf('text') === -1,
      preferenceEligible: false,
      preferenceFeature: preferenceFeature || null,
      requiresCanonicalValue: !!preferenceFeature
    };
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    var out = {};
    Object.keys(value).forEach(function (key) { out[key] = clone(value[key]); });
    return out;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function unique(values) {
    var out = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      if (out.indexOf(value) === -1) out.push(value);
    });
    return out;
  }

  function assertDependencies(schema, fieldsApi) {
    if (!schema || !schema.modules || typeof schema.modules !== 'object') {
      throw new Error('KC_SEARCH_FIELDS_SCHEMA_REQUIRED');
    }
    if (!fieldsApi || typeof fieldsApi.buildFieldsForModule !== 'function') {
      throw new Error('KC_SEARCH_FIELDS_BUILDER_REQUIRED');
    }
  }

  function buildTagGroup(moduleKey, group, categoryGroupId) {
    var allowedPreferenceGroups = PREFERENCE_TAG_GROUPS[moduleKey] || [];
    var isCategoryGroup = group.id === categoryGroupId;
    var payloadPaths = isCategoryGroup
      ? ['category', 'categoriaKey', 'metadata.categoryKey', 'metadata.subcategory', 'metadata.subcategoryKey']
      : ['tagKeys', 'metadata.tagKeys'];
    if (moduleKey === 'compra-venda' && group.id === 'acao') {
      payloadPaths = payloadPaths.concat(['metadata.actionKey', 'metadata.actionLabel']);
    }
    return {
      id: String(group.id || ''),
      label: String(group.label || ''),
      required: group.required === true,
      multi: group.multi === true,
      source: isCategoryGroup ? 'category' : 'tag',
      payloadPaths: payloadPaths,
      indexable: true,
      filterable: true,
      preferenceEligible: allowedPreferenceGroups.indexOf(group.id) !== -1,
      options: (group.options || []).map(function (option) {
        return { key: String(option.key || ''), label: String(option.label || '') };
      })
    };
  }

  function buildModuleFields(moduleKey, fieldsApi) {
    var scenarios = MODULE_SCENARIOS[moduleKey];
    if (!scenarios) throw new Error('KC_SEARCH_FIELDS_SCENARIOS_MISSING:' + moduleKey);
    var byName = {};

    scenarios.forEach(function (scenario) {
      var built = fieldsApi.buildFieldsForModule(
        moduleKey,
        clone(scenario.selections),
        clone(scenario.values)
      );
      if (!Array.isArray(built)) throw new Error('KC_SEARCH_FIELDS_INVALID_RESULT:' + moduleKey);

      built.forEach(function (field) {
        if (!field || !field.name) return;
        var name = String(field.name);
        var fieldPolicy = FIELD_POLICIES[name];
        if (!fieldPolicy) throw new Error('KC_SEARCH_FIELDS_POLICY_MISSING:' + moduleKey + ':' + name);
        if (!byName[name]) {
          byName[name] = {
            name: name,
            labels: [],
            uiTypes: [],
            activeIn: [],
            requiredIn: [],
            policy: clone(fieldPolicy)
          };
        }
        byName[name].labels = unique(byName[name].labels.concat([String(field.label || name)]));
        byName[name].uiTypes = unique(byName[name].uiTypes.concat([String(field.type || 'text')]));
        byName[name].activeIn = unique(byName[name].activeIn.concat([scenario.key]));
        if (field.required === true) byName[name].requiredIn = unique(byName[name].requiredIn.concat([scenario.key]));
      });
    });

    return Object.keys(byName).sort().map(function (name) { return byName[name]; });
  }

  function buildRegistry(schema, fieldsApi) {
    assertDependencies(schema, fieldsApi);
    var moduleKeys = Object.keys(schema.modules).sort();
    var modules = {};
    var fieldUsage = {};

    moduleKeys.forEach(function (moduleKey) {
      var moduleSchema = schema.modules[moduleKey] || {};
      var fields = buildModuleFields(moduleKey, fieldsApi);
      fields.forEach(function (field) {
        fieldUsage[field.name] = unique((fieldUsage[field.name] || []).concat([moduleKey]));
      });
      modules[moduleKey] = {
        key: moduleKey,
        label: String(moduleSchema.label || moduleKey),
        categoryGroupId: String(moduleSchema.categoryGroupId || ''),
        scenarios: clone(MODULE_SCENARIOS[moduleKey]),
        tagGroups: (moduleSchema.tagGroups || []).map(function (group) {
          return buildTagGroup(moduleKey, group, moduleSchema.categoryGroupId);
        }),
        fields: fields
      };
    });

    var registry = {
      version: VERSION,
      generatedFrom: ['window._KCCreatePost.schema', 'window._KCCreatePost.fields.buildFieldsForModule'],
      moduleKeys: moduleKeys,
      modules: modules,
      fieldUsage: fieldUsage,
      prohibitedPreferenceFields: ['contato', 'link'],
      commonFields: COMMON_FIELDS.slice()
    };
    validateRegistry(registry);
    return deepFreeze(registry);
  }

  function validateRegistry(registry) {
    if (!registry || registry.moduleKeys.length !== 6) throw new Error('KC_SEARCH_FIELDS_MODULE_COUNT');
    registry.moduleKeys.forEach(function (moduleKey) {
      var moduleEntry = registry.modules[moduleKey];
      if (!moduleEntry || !moduleEntry.tagGroups.length || !moduleEntry.fields.length) {
        throw new Error('KC_SEARCH_FIELDS_MODULE_EMPTY:' + moduleKey);
      }
      COMMON_FIELDS.forEach(function (name) {
        if (!moduleEntry.fields.some(function (field) { return field.name === name; })) {
          throw new Error('KC_SEARCH_FIELDS_COMMON_MISSING:' + moduleKey + ':' + name);
        }
      });
    });

    registry.prohibitedPreferenceFields.forEach(function (name) {
      registry.moduleKeys.forEach(function (moduleKey) {
        var entry = registry.modules[moduleKey].fields.find(function (field) { return field.name === name; });
        if (!entry) return;
        if (entry.policy.indexable || entry.policy.filterable || entry.policy.preferenceEligible || entry.policy.preferenceFeature) {
          throw new Error('KC_SEARCH_FIELDS_PROHIBITED_POLICY:' + moduleKey + ':' + name);
        }
      });
    });
    return true;
  }

  function findField(registry, moduleKey, fieldName) {
    var moduleEntry = registry && registry.modules && registry.modules[moduleKey];
    if (!moduleEntry) return null;
    return moduleEntry.fields.find(function (field) { return field.name === fieldName; }) || null;
  }

  return deepFreeze({
    VERSION: VERSION,
    MODULE_SCENARIOS: MODULE_SCENARIOS,
    FIELD_POLICIES: FIELD_POLICIES,
    buildRegistry: buildRegistry,
    validateRegistry: validateRegistry,
    findField: findField
  });
}));
