/*
  KinoCampus - kc-search-query-parser.shared.js
  Deterministic pt-BR query parser for offline evaluation (V76.35).

  Contract only: this asset is not loaded by HTML pages.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCSearchQueryParser = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var MAX_QUERY_LENGTH = 240;
  var MODULE_TERMS = {
    moradia: ['moradia', 'quarto', 'republica', 'apartamento', 'casa', 'aluguel', 'mobiliado', 'pets'],
    caronas: ['carona', 'caronas', 'vagas', 'lugares'],
    oportunidades: ['estagio', 'emprego', 'vaga', 'bolsa', 'pesquisa', 'monitoria', 'freelancer', 'clt', 'trabalho'],
    eventos: ['evento', 'workshop', 'work shop', 'seminario', 'academico', 'conpeex', 'inscricoes'],
    'achados-perdidos': ['perdi', 'perdido', 'perdida', 'encontrei', 'encontrado', 'encontrada', 'achei', 'recompensa'],
    'compra-venda': ['vendo', 'compro', 'comprar', 'notebook', 'livro', 'apostila', 'ingresso', 'seminovo', 'usado']
  };
  var LOCATION_ALIASES = {
    'campus-samambaia': ['campus samambaia', 'campus ii', 'samambaia'],
    'campus-colemar': ['campus colemar', 'colemar natal e silva', 'colemar'],
    'cidade-de-goias': ['cidade de goias'],
    'aparecida-de-goiania': ['aparecida de goiania', 'aparecida'],
    goiania: ['goiania'],
    'biblioteca-central': ['biblioteca central', 'biblioteca', ' bc '],
    centro: ['centro']
  };
  var WEEKDAYS = {
    segunda: 'monday', terca: 'tuesday', quarta: 'wednesday', quinta: 'thursday',
    sexta: 'friday', sabado: 'saturday', domingo: 'sunday'
  };
  var NUMBER_WORDS = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8
  };

  function normalizeText(value) {
    return (' ' + String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[–—]/g, '-')
      .replace(/[^a-z0-9$.,:+\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() + ' ');
  }

  function hasTerm(text, term) {
    var normalized = String(term || '').trim();
    return !!normalized && text.indexOf(' ' + normalized + ' ') !== -1;
  }

  function hasAny(text, terms) {
    return (terms || []).some(function (term) {
      var normalized = String(term || '').trim();
      return normalized.indexOf(' ') >= 0
        ? text.indexOf(normalized) !== -1
        : hasTerm(text, normalized);
    });
  }

  function levenshtein(left, right) {
    var a = String(left || '');
    var b = String(right || '');
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var previous = [];
    for (var j = 0; j <= b.length; j += 1) previous[j] = j;
    for (var i = 1; i <= a.length; i += 1) {
      var current = [i];
      for (j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function moduleTermScore(text, term) {
    if (hasAny(text, [term])) return 2;
    if (String(term).indexOf(' ') >= 0 || String(term).length < 5) return 0;
    var tokens = text.trim().split(/\s+/);
    return tokens.some(function (token) {
      return token.length >= 5 && levenshtein(token, term) <= 2;
    }) ? 1 : 0;
  }

  function optionMatches(text, option) {
    var key = normalizeText(option && option.key).trim();
    var label = normalizeText(option && option.label).trim();
    var singularKey = key.replace(/s$/, '');
    var singularLabel = label.replace(/s$/, '');
    return [key, label, singularKey, singularLabel].filter(Boolean).some(function (value) {
      return value.indexOf(' ') >= 0 ? text.indexOf(value) !== -1 : hasTerm(text, value);
    });
  }

  function registryOptions(registry, moduleKey) {
    var moduleEntry = registry && registry.modules && registry.modules[moduleKey];
    if (!moduleEntry) return [];
    var out = [];
    (moduleEntry.tagGroups || []).forEach(function (group) {
      (group.options || []).forEach(function (option) {
        out.push({ groupId: group.id, key: option.key, label: option.label });
      });
    });
    return out;
  }

  function inferModule(text, registry) {
    var scores = {};
    Object.keys(MODULE_TERMS).forEach(function (moduleKey) {
      scores[moduleKey] = MODULE_TERMS[moduleKey].reduce(function (score, term) {
        return score + moduleTermScore(text, term);
      }, 0);
      registryOptions(registry, moduleKey).forEach(function (option) {
        if (optionMatches(text, option)) scores[moduleKey] += 1;
      });
    });
    var ordered = Object.keys(scores).sort(function (left, right) {
      if (scores[right] !== scores[left]) return scores[right] - scores[left];
      return left.localeCompare(right);
    });
    return ordered.length && scores[ordered[0]] > 0 ? ordered[0] : null;
  }

  function findOption(text, registry, moduleKey, groupId) {
    return registryOptions(registry, moduleKey).find(function (option) {
      return option.groupId === groupId && optionMatches(text, option);
    }) || null;
  }

  function parseNumber(value) {
    var raw = String(value || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, raw)) return NUMBER_WORDS[raw];
    var normalized = raw.replace(/\./g, '').replace(',', '.');
    var parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function extractAmount(text, anchors) {
    var anchorPattern = (anchors || []).join('|');
    var match = text.match(new RegExp('(?:' + anchorPattern + ')[^0-9]{0,14}(\\d+(?:[.,]\\d+)?)\\s*(mil)?'));
    if (!match) return null;
    var amount = parseNumber(match[1]);
    return amount == null ? null : amount * (match[2] ? 1000 : 1);
  }

  function extractExactPrice(text) {
    var match = text.match(/(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(mil\s*)?(?:reais|real)\b/);
    if (!match) return null;
    var amount = parseNumber(match[1]);
    return amount == null ? null : amount * (match[2] ? 1000 : 1);
  }

  function findLocations(text) {
    return Object.keys(LOCATION_ALIASES).filter(function (key) {
      return hasAny(text, LOCATION_ALIASES[key]);
    });
  }

  function inferIntent(text, moduleKey, registry, filters) {
    if (moduleKey === 'moradia') {
      var housing = findOption(text, registry, moduleKey, 'tipo');
      if (housing && housing.key !== 'procurando') filters.housingType = housing.key;
      return hasAny(text, ['procuro', 'procurando']) ? 'procurando' : 'oferta';
    }
    if (moduleKey === 'caronas') {
      if (hasAny(text, ['procuro', 'preciso'])) return 'procuro';
      if (hasAny(text, ['ofereco'])) return 'ofereco';
      return 'any';
    }
    if (moduleKey === 'oportunidades') {
      if (hasAny(text, ['estagio'])) return 'estagios';
      if (hasAny(text, ['emprego', 'vaga'])) return 'empregos';
      if (hasAny(text, ['pesquisa'])) return 'pesquisa';
      var opportunity = findOption(text, registry, moduleKey, 'tipo');
      return opportunity ? opportunity.key : 'any';
    }
    if (moduleKey === 'eventos') {
      if (hasAny(text, ['workshop', 'work shop'])) return 'workshops';
      if (hasAny(text, ['academico', 'seminario'])) return 'academicos';
      var eventType = findOption(text, registry, moduleKey, 'topico');
      return eventType ? eventType.key : 'any';
    }
    if (moduleKey === 'achados-perdidos') {
      return hasAny(text, ['achei', 'encontrei', 'encontrado', 'encontrada']) ? 'encontrados' : 'perdidos';
    }
    if (moduleKey === 'compra-venda') {
      return hasAny(text, ['compro', 'comprar', 'procuro', 'quero']) ? 'compro' : 'vendo';
    }
    return 'any';
  }

  function addCommonFilters(text, moduleKey, filters) {
    var priceMax = extractAmount(text, ['ate', 'maximo', 'max', 'orcamento']);
    if (priceMax != null) filters.priceMax = priceMax;

    Object.keys(WEEKDAYS).some(function (day) {
      if (!hasAny(text, [day])) return false;
      filters.weekday = WEEKDAYS[day];
      return true;
    });
    if (hasAny(text, ['amanha'])) filters.relativeDate = 'tomorrow';

    var time = text.match(/\b([01]?\d|2[0-3])(?:h|:00)\b/);
    if (time) filters.time = String(Number(time[1])).padStart(2, '0') + ':00';
    var dayOfMonth = text.match(/\bdia\s+([12]?\d|3[01])\b/);
    if (dayOfMonth) filters.dayOfMonth = Number(dayOfMonth[1]);
    if (hasAny(text, ['noite', 'noturno'])) filters.timePeriod = 'night';

    var locations = findLocations(text);
    if (moduleKey === 'caronas') {
      if (locations.indexOf('campus-samambaia') !== -1 && locations.indexOf('centro') !== -1) {
        filters.origin = 'campus-samambaia';
        filters.destination = 'centro';
      } else if (locations.length) {
        filters.destination = locations[locations.length - 1];
      }
    } else if (locations.length) {
      filters.locationAlias = locations[0];
    }
  }

  function addModuleFilters(text, moduleKey, filters, registry) {
    if (moduleKey === 'moradia') {
      if (hasAny(text, ['setor universitario'])) filters.region = 'setor-universitario';
      var housingFeatures = [];
      if (hasAny(text, ['aceita pets', 'pet', 'pets'])) housingFeatures.push('aceita-pets');
      if (hasAny(text, ['mobiliado', 'mobiliada'])) housingFeatures.push('mobiliado');
      if (housingFeatures.length) filters.features = housingFeatures;
    }
    if (moduleKey === 'caronas') {
      var seats = text.match(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito)\s+(?:vagas|lugares)\b/);
      if (seats) filters.seatsMin = parseNumber(seats[1]);
    }
    if (moduleKey === 'oportunidades') {
      if (hasAny(text, ['remoto', 'home office'])) filters.workMode = 'remoto';
      if (hasAny(text, ['hibrido', 'hibrida'])) filters.workMode = 'hibrido';
      if (hasAny(text, ['presencial'])) filters.workMode = 'presencial';
      if (hasAny(text, ['clt'])) filters.employmentType = 'clt';
      if (hasAny(text, ['computacao', 'tecnologia'])) filters.area = 'tecnologia';
      if (hasAny(text, ['pos graduacao', 'pos-graduacao'])) filters.areaText = 'pós-graduação';
    }
    if (moduleKey === 'eventos') {
      if (hasAny(text, ['gratuito', 'gratis'])) filters.free = true;
      if (hasAny(text, ['inscricoes abertas'])) filters.registrationStatus = 'open';
    }
    if (moduleKey === 'achados-perdidos') {
      if (hasAny(text, ['documento', 'documentos'])) filters.itemType = 'documentos';
      if (hasAny(text, ['fone', 'headphone', 'eletronico'])) filters.itemType = 'eletronicos';
      var reward = extractAmount(text, ['recompensa']);
      if (reward != null) filters.rewardMin = reward;
      var block = text.match(/\bbloco\s+([a-z0-9]+)\b/);
      if (block) filters.locationText = 'bloco ' + block[1];
    }
    if (moduleKey === 'compra-venda') {
      var category = findOption(text, registry, moduleKey, 'categoria');
      if (hasAny(text, ['notebook', 'note'])) filters.category = 'eletronicos';
      else if (hasAny(text, ['livro', 'apostila'])) filters.category = 'livros';
      else if (hasAny(text, ['ingresso'])) filters.category = 'ingressos';
      else if (category) filters.category = category.key;
      if (hasAny(text, ['usado'])) filters.condition = 'usado';
      else if (hasAny(text, ['seminovo', 'semi novo'])) filters.condition = 'semi-novo';
      else if (hasAny(text, ['novo'])) filters.condition = 'novo';
      if (filters.priceMax == null) {
        var exactPrice = extractExactPrice(text);
        if (exactPrice != null) filters.price = exactPrice;
      }
    }
  }

  function parse(query, options) {
    var raw = String(query || '').trim().slice(0, MAX_QUERY_LENGTH);
    var text = normalizeText(raw);
    var registry = options && options.registry;
    var filters = {};
    if (!raw) return { version: VERSION, query: '', normalizedQuery: '', module: null, intent: null, filters: {}, confidence: 0 };

    var moduleKey = inferModule(text, registry);
    var intent = moduleKey ? inferIntent(text, moduleKey, registry, filters) : null;
    addCommonFilters(text, moduleKey, filters);
    addModuleFilters(text, moduleKey, filters, registry);
    var signalCount = (moduleKey ? 1 : 0) + Object.keys(filters).length + (intent && intent !== 'any' ? 1 : 0);

    return {
      version: VERSION,
      query: raw,
      normalizedQuery: text.trim(),
      module: moduleKey,
      intent: intent,
      filters: filters,
      confidence: moduleKey ? Math.min(0.98, Number((0.45 + signalCount * 0.07).toFixed(2))) : 0.2
    };
  }

  return Object.freeze({
    VERSION: VERSION,
    MAX_QUERY_LENGTH: MAX_QUERY_LENGTH,
    MODULE_TERMS: MODULE_TERMS,
    LOCATION_ALIASES: LOCATION_ALIASES,
    normalizeText: normalizeText,
    levenshtein: levenshtein,
    parse: parse
  });
}));
