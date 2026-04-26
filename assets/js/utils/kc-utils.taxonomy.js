/*
  KinoCampus - Utils / Taxonomy Domain (v12.2.4)

  Sub-módulo do kc-utils.js — domínio de taxonomia e classificação
  (rótulos de módulo/categoria/subcategoria, definições de área de
  oportunidade, resolução fuzzy e histórico de áreas).
  Expõe window._KCU.taxonomy com 22 funções.

  Carregamento: deve ser incluído APÓS kc-utils.string.js e
  ANTES de kc-utils.js em todos os HTMLs.
  Dependências: window._KCU.string (normalizeText, titleCase, beautifyKey,
                slugifyText, levenshteinDistance).
                window.KC_CONSTANTS (MODULE_LABEL_MAP, MODULE_ICON_MAP,
                CATEGORY_LABELS, SUBCATEGORY_LABELS, OPPORTUNITY_AREA_DEFINITIONS)
                — acessado lazily via _const().
  Contrato: window._KCU.taxonomy é Object.freeze() — imutável em runtime.
*/
(function () {
  'use strict';

  // ── Helpers internos ──────────────────────────────────────────────────────────

  function _str() {
    return (window._KCU && window._KCU.string) ? window._KCU.string : null;
  }

  function _const() {
    return window.KC_CONSTANTS || {};
  }

  function _normalizeText(v) {
    var s = _str();
    return s ? s.normalizeText(v) : String(v || '').toLowerCase().trim();
  }

  function _titleCase(v) {
    var s = _str();
    return s ? s.titleCase(v) : String(v || '');
  }

  function _beautifyKey(v) {
    var s = _str();
    return s ? s.beautifyKey(v) : String(v || '');
  }

  function _slugifyText(v) {
    var s = _str();
    if (s) return s.slugifyText(v);
    return String(v || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function _levenshteinDistance(a, b) {
    var s = _str();
    return s ? s.levenshteinDistance(a, b) : 0;
  }

  // ── Rótulos de módulo / categoria / subcategoria ──────────────────────────────

  function getModuleLabel(moduleKey) {
    var MAP = (_const().MODULE_LABEL_MAP) || {};
    var key = _normalizeText(moduleKey);
    return MAP[key] || _beautifyKey(key) || String(moduleKey || '');
  }

  function getModuleIconClass(moduleKey) {
    var MAP = (_const().MODULE_ICON_MAP) || {};
    var key = _normalizeText(moduleKey);
    return MAP[key] || 'fas fa-layer-group';
  }

  function getCategoryLabel(moduleKey, catKey) {
    var LABELS = (_const().CATEGORY_LABELS) || {};
    var m = _normalizeText(moduleKey);
    var c = _normalizeText(catKey);
    var map = LABELS[m];
    if (map && map[c]) return map[c];
    return _beautifyKey(c) || String(catKey || '');
  }

  function getSubcategoryLabel(moduleKey, subKey) {
    var LABELS = (_const().SUBCATEGORY_LABELS) || {};
    var m = _normalizeText(moduleKey);
    var s = _normalizeText(subKey);
    var map = LABELS[m];
    if (map && map[s]) return map[s];
    return _beautifyKey(s) || String(subKey || '');
  }

  // ── Área de oportunidade — utilitários puros ──────────────────────────────────

  function getOpportunityAreaEmoji(key) {
    var wanted = _slugifyText(key);
    var map = {
      tecnologia: '💻',
      marketing: '📣',
      design: '🎨',
      educacao: '🎓',
      musica: '🎵',
      administrativo: '📋',
      engenharia: '📐',
      saude: '💚',
      pesquisa: '🔬',
    };
    return map[wanted] || '🏷️';
  }

  function firstNonEmptyValue(values) {
    if (!Array.isArray(values)) return '';
    for (var i = 0; i < values.length; i += 1) {
      var value = String(values[i] || '').trim();
      if (value) return value;
    }
    return '';
  }

  function formatOpportunityAreaLabel(value) {
    var raw = String(value || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    if (raw !== _normalizeText(raw)) return raw;
    return _titleCase(raw);
  }

  function scoreOpportunityAreaLabel(value) {
    var label = String(value || '').trim();
    if (!label) return 0;
    var score = Math.min(label.length, 32) / 32;
    if (/[A-ZÀ-Ý]/.test(label)) score += 1.5;
    if (label.normalize('NFD') !== label) score += 2;
    if (label.includes(' ')) score += 0.5;
    return score;
  }

  function pickPreferredOpportunityAreaLabel(current, candidate) {
    var currentLabel = String(current || '').trim();
    var candidateLabel = String(candidate || '').trim();
    if (!currentLabel) return candidateLabel;
    if (!candidateLabel) return currentLabel;
    return scoreOpportunityAreaLabel(candidateLabel) > scoreOpportunityAreaLabel(currentLabel)
      ? candidateLabel
      : currentLabel;
  }

  function getOpportunityAreaFuzzyThreshold(source, target) {
    var maxLength = Math.max(String(source || '').length, String(target || '').length);
    if (maxLength <= 6) return 1;
    if (maxLength <= 12) return 2;
    return 3;
  }

  function getOpportunityAreaSimilarityScore(source, target) {
    var left = String(source || '');
    var right = String(target || '');
    var maxLength = Math.max(left.length, right.length);
    if (!maxLength) return 0;
    var distance = _levenshteinDistance(left, right);
    return 1 - (distance / maxLength);
  }

  function isCloseOpportunityAreaAlias(candidate, alias) {
    var normalizedCandidate = _normalizeText(candidate);
    var normalizedAlias = _normalizeText(alias);
    if (!normalizedCandidate || !normalizedAlias) return false;
    if (normalizedCandidate === normalizedAlias) return true;
    if (normalizedCandidate.length < 5 || normalizedAlias.length < 5) return false;

    var threshold = getOpportunityAreaFuzzyThreshold(normalizedCandidate, normalizedAlias);
    if (Math.abs(normalizedCandidate.length - normalizedAlias.length) > threshold) return false;

    var distance = _levenshteinDistance(normalizedCandidate, normalizedAlias);
    if (distance > threshold) return false;

    var similarity = getOpportunityAreaSimilarityScore(normalizedCandidate, normalizedAlias);
    var minSimilarity = Math.max(normalizedCandidate.length, normalizedAlias.length) >= 10 ? 0.72 : 0.78;
    return similarity >= minSimilarity;
  }

  // ── Área de oportunidade — definições e mapas ─────────────────────────────────

  function getOpportunityAreaDefinitions() {
    var DEFS = (_const().OPPORTUNITY_AREA_DEFINITIONS) || [];
    return DEFS.map(function (entry) {
      return Object.assign({}, entry, {
        emoji: entry.emoji || getOpportunityAreaEmoji(entry.key),
      });
    });
  }

  function getOpportunityAreaInfoByKey(key) {
    var DEFS = (_const().OPPORTUNITY_AREA_DEFINITIONS) || [];
    var wanted = _slugifyText(key);
    if (!wanted) return null;
    var entry = DEFS.find(function (item) { return item.key === wanted; });
    return entry
      ? Object.assign({}, entry, { emoji: entry.emoji || getOpportunityAreaEmoji(entry.key) })
      : null;
  }

  function buildOfficialOpportunityAreaMaps() {
    var DEFS = (_const().OPPORTUNITY_AREA_DEFINITIONS) || [];
    var aliasMap = new Map();
    DEFS.forEach(function (entry) {
      var values = [entry.label, entry.key].concat(
        Array.isArray(entry.aliases) ? entry.aliases : []
      );
      values.forEach(function (value) {
        var normalized = _normalizeText(value);
        if (normalized && !aliasMap.has(normalized)) aliasMap.set(normalized, entry);
      });
    });
    return aliasMap;
  }

  function buildOpportunityTextParts(source, fallbackTags) {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      var meta = (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata))
        ? source.metadata
        : {};
      var tagValues = [];
      if (Array.isArray(source.tags)) tagValues.push.apply(tagValues, source.tags);
      if (Array.isArray(source.tagKeys)) tagValues.push.apply(tagValues, source.tagKeys);
      if (Array.isArray(meta.tags)) tagValues.push.apply(tagValues, meta.tags);
      if (Array.isArray(meta.tagKeys)) tagValues.push.apply(tagValues, meta.tagKeys);

      return {
        explicit: [
          source.areaLabel, source.area, source.areaKey,
          meta.areaLabel, meta.area, meta.areaKey,
          source.subcategoriaLabel, source.subcategoria, source.subcategoriaKey,
          source.subcategoryLabel, source.subcategory, source.subcategoryKey,
          meta.subcategoria, meta.subcategoriaKey,
          meta.subcategoryLabel, meta.subcategory, meta.subcategoryKey,
        ].filter(Boolean),
        text: [
          source.titulo, source.title,
          source.descricao, source.description,
          source.localizacao, source.location,
          meta.localizacao, meta.location,
        ].filter(Boolean),
        tags: tagValues.filter(Boolean),
      };
    }

    return {
      explicit: source ? [source] : [],
      text: [],
      tags: Array.isArray(fallbackTags) ? fallbackTags.filter(Boolean) : [],
    };
  }

  // ── Área de oportunidade — resolvers ─────────────────────────────────────────

  function findBestFuzzyOpportunityArea(candidate, collection) {
    var normalized = _normalizeText(candidate);
    if (!normalized || normalized.length < 5) return null;

    var best = null;
    collection.forEach(function (entry) {
      var aliases = Array.isArray(entry.aliases) && entry.aliases.length
        ? entry.aliases
        : [entry.label, entry.key];

      aliases.forEach(function (aliasValue) {
        var alias = _normalizeText(aliasValue);
        if (!alias) return;
        var distance = _levenshteinDistance(normalized, alias);
        if (!isCloseOpportunityAreaAlias(normalized, alias)) return;
        var similarity = getOpportunityAreaSimilarityScore(normalized, alias);

        if (!best || distance < best.distance || (distance === best.distance && similarity > best.similarity)) {
          best = { entry: entry, distance: distance, similarity: similarity };
        }
      });
    });

    return best ? best.entry : null;
  }

  function findBestOfficialOpportunityArea(candidate, officialAliasMap) {
    var normalized = _normalizeText(candidate);
    if (!normalized) return null;

    if (officialAliasMap && officialAliasMap.has(normalized)) {
      return officialAliasMap.get(normalized);
    }

    if (normalized.length >= 5 && officialAliasMap) {
      for (var _i = 0, _entries = officialAliasMap.entries(), _step; !(_step = _entries.next()).done;) {
        var pair = _step.value;
        var alias = pair[0];
        var entry = pair[1];
        if (normalized.includes(alias) || alias.includes(normalized)) return entry;
      }
    }

    var DEFS = (_const().OPPORTUNITY_AREA_DEFINITIONS) || [];
    return findBestFuzzyOpportunityArea(candidate, DEFS);
  }

  function extractOpportunityAreaHistoryEntries(history) {
    var list = Array.isArray(history) ? history : [];
    var entries = [];

    list.forEach(function (item) {
      if (!item) return;

      if (typeof item === 'string') {
        var label = formatOpportunityAreaLabel(item);
        var key = _slugifyText(item);
        if (label || key) entries.push({ label: label, key: key, icon: 'fas fa-briefcase' });
        return;
      }

      if (typeof item !== 'object' || Array.isArray(item)) return;

      var meta = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata))
        ? item.metadata
        : {};
      var label2 = formatOpportunityAreaLabel(firstNonEmptyValue([
        item.label,
        item.areaLabel, item.area,
        meta.areaLabel, meta.area,
        item.subcategoriaLabel, item.subcategoria,
        item.subcategoryLabel, item.subcategory,
        meta.subcategoryLabel, meta.subcategory,
      ]));
      var key2 = _slugifyText(firstNonEmptyValue([
        item.key,
        item.areaKey,
        meta.areaKey,
        item.subcategoriaKey,
        item.subcategoryKey,
        meta.subcategoryKey,
        label2,
      ]));
      var icon = firstNonEmptyValue([
        item.icon,
        item.areaIcon,
        meta.areaIcon,
      ]) || 'fas fa-briefcase';

      if (label2 || key2) entries.push({ label: label2, key: key2, icon: icon });
    });

    return entries;
  }

  function buildHistoryOpportunityAreaMaps(history, officialAliasMap) {
    var catalog = new Map();
    var aliasMap = new Map();
    var entries = extractOpportunityAreaHistoryEntries(history);

    entries.forEach(function (entry) {
      var normalizedLabel = _normalizeText(entry.label);
      var normalizedKey = _normalizeText(entry.key);
      if (!normalizedLabel && !normalizedKey) return;
      if ((normalizedLabel && officialAliasMap.has(normalizedLabel)) || (normalizedKey && officialAliasMap.has(normalizedKey))) return;
      if (findBestOfficialOpportunityArea(entry.label, officialAliasMap) || findBestOfficialOpportunityArea(entry.key, officialAliasMap)) return;

      var finalKey = _slugifyText(entry.key || entry.label);
      if (!finalKey) return;

      var existing = catalog.get(finalKey);
      var finalLabel = pickPreferredOpportunityAreaLabel(existing && existing.label, entry.label || finalKey);
      var item = {
        key: finalKey,
        label: finalLabel || formatOpportunityAreaLabel(finalKey),
        icon: entry.icon || (existing && existing.icon) || 'fas fa-briefcase',
        isKnown: false,
      };

      catalog.set(finalKey, item);
      [normalizedLabel, normalizedKey].filter(Boolean).forEach(function (a) {
        if (!aliasMap.has(a)) aliasMap.set(a, item);
      });
    });

    return { catalog: catalog, aliasMap: aliasMap };
  }

  function findBestOfficialContextArea(combinedText) {
    var DEFS = (_const().OPPORTUNITY_AREA_DEFINITIONS) || [];
    if (!combinedText) return null;

    var ranked = DEFS
      .map(function (entry) {
        var score = [entry.label, entry.key].concat(Array.isArray(entry.aliases) ? entry.aliases : [])
          .map(function (value) { return _normalizeText(value); })
          .filter(Boolean)
          .reduce(function (acc, alias) {
            if (!combinedText.includes(alias)) return acc;
            return acc + (alias.includes(' ') ? 3 : 2);
          }, 0);
        return { entry: entry, score: score };
      })
      .filter(function (item) { return item.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    return ranked.length ? ranked[0].entry : null;
  }

  function resolveOpportunityArea(source, options) {
    options = options || {};
    var built = buildOpportunityTextParts(source, options.tags);
    var textParts = Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : [];
    var explicitCandidates = built.explicit.map(function (value) { return String(value || '').trim(); }).filter(Boolean);
    var combinedText = explicitCandidates
      .concat(built.tags)
      .concat(built.text)
      .concat(textParts)
      .map(function (value) { return _normalizeText(value); })
      .filter(Boolean)
      .join(' ');

    var officialAliasMap = buildOfficialOpportunityAreaMaps();
    var historySource = Array.isArray(options.history)
      ? options.history
      : ((typeof window !== 'undefined' && Array.isArray(window.__KC_OPPORTUNITY_AREA_HISTORY))
        ? window.__KC_OPPORTUNITY_AREA_HISTORY
        : []);
    var historyMaps = buildHistoryOpportunityAreaMaps(historySource, officialAliasMap);
    var historyEntries = Array.from(historyMaps.catalog.values()).map(function (entry) {
      return Object.assign({}, entry, { aliases: [entry.label, entry.key] });
    });

    var i, candidate, normalized, match;

    for (i = 0; i < explicitCandidates.length; i++) {
      candidate = explicitCandidates[i];
      normalized = _normalizeText(candidate);
      if (!normalized) continue;

      if (officialAliasMap.has(normalized)) {
        match = officialAliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon, isKnown: true, source: 'official-exact' };
      }

      if (historyMaps.aliasMap.has(normalized)) {
        match = historyMaps.aliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon, isKnown: false, source: 'history-exact' };
      }
    }

    for (i = 0; i < explicitCandidates.length; i++) {
      candidate = explicitCandidates[i];
      normalized = _normalizeText(candidate);
      if (!normalized || normalized.length < 5) continue;

      for (var _j = 0, _mapEntries = officialAliasMap.entries(), _s; !(_s = _mapEntries.next()).done;) {
        var pair = _s.value;
        var alias = pair[0];
        var entry = pair[1];
        if (normalized.includes(alias) || alias.includes(normalized)) {
          return { key: entry.key, label: entry.label, icon: entry.icon, isKnown: true, source: 'official-partial' };
        }
      }
    }

    var contextMatch = findBestOfficialContextArea(combinedText);
    if (contextMatch) {
      return { key: contextMatch.key, label: contextMatch.label, icon: contextMatch.icon, isKnown: true, source: 'context' };
    }

    var DEFS = (_const().OPPORTUNITY_AREA_DEFINITIONS) || [];
    for (i = 0; i < explicitCandidates.length; i++) {
      candidate = explicitCandidates[i];

      var officialFuzzy = findBestFuzzyOpportunityArea(candidate, DEFS);
      if (officialFuzzy) {
        return { key: officialFuzzy.key, label: officialFuzzy.label, icon: officialFuzzy.icon, isKnown: true, source: 'official-fuzzy' };
      }

      var historyFuzzy = findBestFuzzyOpportunityArea(candidate, historyEntries);
      if (historyFuzzy) {
        return { key: historyFuzzy.key, label: historyFuzzy.label, icon: historyFuzzy.icon, isKnown: false, source: 'history-fuzzy' };
      }
    }

    var fallbackRaw = explicitCandidates[0] || '';
    var fallbackKey = _slugifyText(fallbackRaw);
    if (fallbackKey) {
      return {
        key: fallbackKey,
        label: formatOpportunityAreaLabel(fallbackRaw) || _beautifyKey(fallbackKey) || fallbackRaw,
        icon: 'fas fa-briefcase',
        isKnown: false,
        source: 'custom',
      };
    }

    return { key: '', label: '', icon: 'fas fa-briefcase', isKnown: false, source: 'empty' };
  }

  // ── Namespace ─────────────────────────────────────────────────────────────────
  window._KCU = window._KCU || {};
  window._KCU.taxonomy = Object.freeze({
    getModuleLabel,
    getModuleIconClass,
    getCategoryLabel,
    getSubcategoryLabel,
    getOpportunityAreaEmoji,
    getOpportunityAreaDefinitions,
    getOpportunityAreaInfoByKey,
    buildOfficialOpportunityAreaMaps,
    buildOpportunityTextParts,
    firstNonEmptyValue,
    formatOpportunityAreaLabel,
    scoreOpportunityAreaLabel,
    pickPreferredOpportunityAreaLabel,
    getOpportunityAreaFuzzyThreshold,
    getOpportunityAreaSimilarityScore,
    isCloseOpportunityAreaAlias,
    findBestFuzzyOpportunityArea,
    findBestOfficialOpportunityArea,
    extractOpportunityAreaHistoryEntries,
    buildHistoryOpportunityAreaMaps,
    findBestOfficialContextArea,
    resolveOpportunityArea,
  });
})();
