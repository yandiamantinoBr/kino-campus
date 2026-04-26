/*
  KinoCampus - Utils / Location Domain (v12.2.5)

  Sub-módulo do kc-utils.js — domínio de localização e habitação
  (moradia, caronas, achados-perdidos: definições, resolvers,
  emoji maps, history maps e helpers de fuzzy matching).
  Expõe window._KCU.location com 32 funções.

  Carregamento: deve ser incluído APÓS kc-utils.string.js e
  ANTES de kc-utils.js em todos os HTMLs.
  Dependências: window._KCU.string (normalizeText, titleCase, beautifyKey,
                slugifyText, levenshteinDistance, canonicalCategory).
                window.KC_CONSTANTS (HOUSING_REGION_DEFINITIONS,
                HOUSING_FEATURE_DEFINITIONS, LOST_FOUND_LOCATION_DEFINITIONS,
                CARONAS_LOCATION_DEFINITIONS) — acessado lazily via _const().
  Contrato: window._KCU.location é Object.freeze() — imutável em runtime.
*/
(function () {
  'use strict';

  // ── Helpers internos ──────────────────────────────────────────────────────

  function _str() {
    return (window._KCU && window._KCU.string) ? window._KCU.string : null;
  }

  function _const() {
    return window.KC_CONSTANTS || {};
  }

  function _normalizeText(v) {
    const s = _str();
    return s ? s.normalizeText(v) : String(v || '').toLowerCase().trim();
  }

  function _titleCase(v) {
    const s = _str();
    return s ? s.titleCase(v) : String(v || '');
  }

  function _beautifyKey(v) {
    const s = _str();
    return s ? s.beautifyKey(v) : String(v || '');
  }

  function _slugifyText(v) {
    const s = _str();
    if (s) return s.slugifyText(v);
    return String(v || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function _levenshteinDistance(a, b) {
    const s = _str();
    return s ? s.levenshteinDistance(a, b) : 0;
  }

  function _canonicalCategory(v) {
    const s = _str();
    return s ? s.canonicalCategory(v) : String(v || '');
  }

  // ── Utilitário local (duplicado de taxonomy para evitar dependência cruzada) ──

  function firstNonEmptyValue(values) {
    if (!Array.isArray(values)) return '';
    for (let i = 0; i < values.length; i += 1) {
      const value = String(values[i] || '').trim();
      if (value) return value;
    }
    return '';
  }

  // ── Emoji maps ────────────────────────────────────────────────────────────

  function getHousingFeatureEmoji(key) {
    const wanted = _slugifyText(key);
    const map = {
      'aceita-pets': '🐾',
      lgbtqiapn: '🌈',
      'apenas-mulheres': '👩',
      'apenas-homens': '👨',
      mobiliado: '🛋️',
      'contas-inclusas': '💡',
      'internet-inclusa': '📶',
      'banheiro-privativo': '🚿',
      'vaga-de-garagem': '🚗',
      'ambiente-familiar': '🏡',
      'nao-fumantes': '🚭',
      'proximo-ao-campus': '📍',
    };
    return map[wanted] || '🏷️';
  }

  function getLostFoundLocationEmoji(key) {
    const wanted = _slugifyText(key);
    const map = {
      'biblioteca-central': '📚',
      'restaurante-universitario': '🍽️',
      estacionamento: '🅿️',
      'salas-de-aula': '🚪',
      'blocos-e-laboratorios': '🧪',
      'centro-de-aulas': '🏫',
      'praca-universitaria': '🏛️',
      'campus-samambaia': '🌳',
      'campus-colemar': '🎓',
    };
    return map[wanted] || '📍';
  }

  // ── Label utilities ───────────────────────────────────────────────────────

  function toStringArray(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (value == null || value === false) return [];
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return [];
      if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('"') && raw.endsWith('"'))) {
        try {
          const parsed = JSON.parse(raw);
          return toStringArray(parsed);
        } catch (_) { }
      }
      return raw.split(/[|,]\s*/).map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'object') {
      if (Array.isArray(value.values)) return toStringArray(value.values);
      if (Array.isArray(value.items)) return toStringArray(value.items);
    }
    return [String(value).trim()].filter(Boolean);
  }

  function scoreHousingLabel(value) {
    const label = String(value || '').trim();
    if (!label) return 0;
    let score = Math.min(label.length, 32) / 32;
    if (/[A-ZÀ-Ý]/.test(label)) score += 1.4;
    if (label.normalize('NFD') !== label) score += 1.9;
    if (label.includes(' ')) score += 0.45;
    if (/[+]/.test(label)) score += 0.25;
    return score;
  }

  function pickPreferredHousingLabel(current, candidate) {
    const currentLabel = String(current || '').trim();
    const candidateLabel = String(candidate || '').trim();
    if (!currentLabel) return candidateLabel;
    if (!candidateLabel) return currentLabel;
    return scoreHousingLabel(candidateLabel) > scoreHousingLabel(currentLabel)
      ? candidateLabel
      : currentLabel;
  }

  function formatHousingLabel(value) {
    const raw = String(value || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    if (/[A-ZÀ-Ý]/.test(raw) || raw.normalize('NFD') !== raw || raw.includes('+')) return raw;
    return _titleCase(raw);
  }

  // ── Alias maps & fuzzy matching ───────────────────────────────────────────

  function buildDefinitionAliasMap(definitions) {
    const aliasMap = new Map();
    (Array.isArray(definitions) ? definitions : []).forEach((entry) => {
      [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
        .map((value) => _normalizeText(value))
        .filter(Boolean)
        .forEach((alias) => {
          if (!aliasMap.has(alias)) aliasMap.set(alias, entry);
        });
    });
    return aliasMap;
  }

  function getHousingFuzzyThreshold(source, target) {
    const maxLength = Math.max(String(source || '').length, String(target || '').length);
    if (maxLength <= 6) return 1;
    if (maxLength <= 12) return 2;
    return 3;
  }

  function getHousingSimilarityScore(source, target) {
    const left = String(source || '');
    const right = String(target || '');
    const maxLength = Math.max(left.length, right.length);
    if (!maxLength) return 0;
    const distance = _levenshteinDistance(left, right);
    return 1 - (distance / maxLength);
  }

  function isCloseHousingAlias(candidate, alias) {
    const normalizedCandidate = _normalizeText(candidate);
    const normalizedAlias = _normalizeText(alias);
    if (!normalizedCandidate || !normalizedAlias) return false;
    if (normalizedCandidate === normalizedAlias) return true;
    if (normalizedCandidate.length < 5 || normalizedAlias.length < 5) return false;

    const threshold = getHousingFuzzyThreshold(normalizedCandidate, normalizedAlias);
    if (Math.abs(normalizedCandidate.length - normalizedAlias.length) > threshold) return false;

    const distance = _levenshteinDistance(normalizedCandidate, normalizedAlias);
    if (distance > threshold) return false;

    const similarity = getHousingSimilarityScore(normalizedCandidate, normalizedAlias);
    const minSimilarity = Math.max(normalizedCandidate.length, normalizedAlias.length) >= 10 ? 0.72 : 0.79;
    return similarity >= minSimilarity;
  }

  function findBestFuzzyHousingEntry(candidate, collection) {
    const normalized = _normalizeText(candidate);
    if (!normalized || normalized.length < 5) return null;

    let best = null;
    (Array.isArray(collection) ? collection : []).forEach((entry) => {
      const aliases = Array.isArray(entry.aliases) && entry.aliases.length
        ? entry.aliases
        : [entry.label, entry.key];

      aliases.forEach((aliasValue) => {
        const alias = _normalizeText(aliasValue);
        if (!alias || !isCloseHousingAlias(normalized, alias)) return;
        const distance = _levenshteinDistance(normalized, alias);
        const similarity = getHousingSimilarityScore(normalized, alias);
        if (!best || distance < best.distance || (distance === best.distance && similarity > best.similarity)) {
          best = { entry, distance, similarity };
        }
      });
    });

    return best ? best.entry : null;
  }

  // ── Housing text parts ────────────────────────────────────────────────────

  function buildHousingTextParts(source, fallbackTags) {
    if (Array.isArray(source)) {
      return {
        explicitRegions: [],
        explicitFeatures: source.filter(Boolean),
        text: [],
        tags: Array.isArray(fallbackTags) ? fallbackTags.filter(Boolean) : [],
      };
    }

    if (source && typeof source === 'object' && !Array.isArray(source)) {
      const meta = (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)) ? source.metadata : {};
      const tagValues = [];
      if (Array.isArray(source.tags)) tagValues.push(...source.tags);
      if (Array.isArray(source.tagKeys)) tagValues.push(...source.tagKeys);
      if (Array.isArray(meta.tags)) tagValues.push(...meta.tags);
      if (Array.isArray(meta.tagKeys)) tagValues.push(...meta.tagKeys);

      return {
        explicitRegions: [
          source.regionLabel, source.region, source.regionKey,
          meta.regionLabel, meta.regiao, meta.regiaoLabel, meta.region, meta.regionKey,
          source.localizacao, source.location, meta.localizacao, meta.location,
        ].filter(Boolean),
        explicitFeatures: [
          ...toStringArray(source.housingFeatureLabels),
          ...toStringArray(source.housingFeatureKeys),
          ...toStringArray(source.marcadoresMoradia),
          ...toStringArray(source.features),
          ...toStringArray(meta.housingFeatureLabels),
          ...toStringArray(meta.housingFeatureKeys),
          ...toStringArray(meta.marcadoresMoradia),
          ...toStringArray(meta.features),
        ].filter(Boolean),
        text: [
          source.titulo, source.title,
          source.descricao, source.description,
          source.localizacao, source.location,
          meta.localizacao, meta.location,
          meta.detalhes,
        ].filter(Boolean),
        tags: tagValues.filter(Boolean),
      };
    }

    return {
      explicitRegions: source ? [source] : [],
      explicitFeatures: [],
      text: [],
      tags: Array.isArray(fallbackTags) ? fallbackTags.filter(Boolean) : [],
    };
  }

  // ── Moradia / Housing Region ──────────────────────────────────────────────

  function getHousingRegionDefinitions() {
    return (_const().HOUSING_REGION_DEFINITIONS || []).slice();
  }

  function getHousingRegionInfoByKey(key) {
    const DEFS = _const().HOUSING_REGION_DEFINITIONS || [];
    const wanted = _slugifyText(key);
    if (!wanted) return null;
    return DEFS.find((entry) => entry.key === wanted) || null;
  }

  function extractHousingRegionHistoryEntries(history) {
    const list = Array.isArray(history) ? history : [];
    const entries = [];

    list.forEach((item) => {
      if (!item) return;
      if (typeof item === 'string') {
        const label = formatHousingLabel(item);
        const key = _slugifyText(item);
        if (label || key) entries.push({ key, label, icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '' });
        return;
      }
      if (typeof item !== 'object' || Array.isArray(item)) return;

      const meta = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)) ? item.metadata : {};
      const label = formatHousingLabel(firstNonEmptyValue([
        item.regionLabel, item.region, item.regiao, item.label,
        meta.regionLabel, meta.region, meta.regiao, meta.regiaoLabel,
      ]));
      const key = _slugifyText(firstNonEmptyValue([
        item.regionKey, meta.regionKey, item.key, label,
      ]));
      const zoneKey = _slugifyText(firstNonEmptyValue([
        item.regionZoneKey, meta.regionZoneKey, item.zoneKey,
      ]));
      const zoneLabel = formatHousingLabel(firstNonEmptyValue([
        item.regionZoneLabel, meta.regionZoneLabel, item.zoneLabel,
      ]));
      if (label || key) entries.push({
        key,
        label,
        icon: firstNonEmptyValue([item.icon, meta.regionIcon]) || 'fas fa-map-pin',
        zoneKey,
        zoneLabel,
      });
    });

    return entries;
  }

  function buildHousingRegionHistoryMaps(history, officialAliasMap) {
    const catalog = new Map();
    const aliasMap = new Map();
    extractHousingRegionHistoryEntries(history).forEach((entry) => {
      const normalizedLabel = _normalizeText(entry.label);
      const normalizedKey = _normalizeText(entry.key);
      if (!normalizedLabel && !normalizedKey) return;
      if ((normalizedLabel && officialAliasMap.has(normalizedLabel)) || (normalizedKey && officialAliasMap.has(normalizedKey))) return;

      const finalKey = _slugifyText(entry.key || entry.label);
      if (!finalKey) return;

      const existing = catalog.get(finalKey);
      const finalLabel = pickPreferredHousingLabel(existing && existing.label, entry.label || finalKey);
      const item = {
        key: finalKey,
        label: finalLabel || formatHousingLabel(finalKey),
        icon: entry.icon || (existing && existing.icon) || 'fas fa-map-pin',
        zoneKey: entry.zoneKey || (existing && existing.zoneKey) || '',
        zoneLabel: entry.zoneLabel || (existing && existing.zoneLabel) || '',
        isKnown: false,
      };
      catalog.set(finalKey, item);
      [normalizedLabel, normalizedKey].filter(Boolean).forEach((alias) => {
        if (!aliasMap.has(alias)) aliasMap.set(alias, item);
      });
    });

    return { catalog, aliasMap };
  }

  function resolveHousingRegion(source, options) {
    options = options || {};
    const DEFS = _const().HOUSING_REGION_DEFINITIONS || [];
    const built = buildHousingTextParts(source, options.tags);
    const explicitCandidates = built.explicitRegions.map((value) => String(value || '').trim()).filter(Boolean);
    const combinedText = [
      ...explicitCandidates,
      ...built.tags,
      ...built.text,
      ...(Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : []),
    ].map((value) => _normalizeText(value)).filter(Boolean).join(' ');

    const officialAliasMap = buildDefinitionAliasMap(DEFS);
    const historySource = Array.isArray(options.history)
      ? options.history
      : ((typeof window !== 'undefined' && Array.isArray(window.__KC_HOUSING_REGION_HISTORY)) ? window.__KC_HOUSING_REGION_HISTORY : []);
    const historyMaps = buildHousingRegionHistoryMaps(historySource, officialAliasMap);
    const historyEntries = Array.from(historyMaps.catalog.values()).map((entry) => ({
      ...entry,
      aliases: [entry.label, entry.key],
    }));

    for (const candidate of explicitCandidates) {
      const normalized = _normalizeText(candidate);
      if (!normalized) continue;
      if (officialAliasMap.has(normalized)) {
        const match = officialAliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon || 'fas fa-map-pin', zoneKey: match.zoneKey || match.key, zoneLabel: match.zoneLabel || match.label, isKnown: true, source: 'official-exact' };
      }
      if (historyMaps.aliasMap.has(normalized)) {
        const match = historyMaps.aliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon || 'fas fa-map-pin', zoneKey: match.zoneKey || '', zoneLabel: match.zoneLabel || '', isKnown: false, source: 'history-exact' };
      }
    }

    for (const candidate of explicitCandidates) {
      const normalized = _normalizeText(candidate);
      if (!normalized || normalized.length < 5) continue;
      for (const [alias, entry] of officialAliasMap.entries()) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          return { key: entry.key, label: entry.label, icon: entry.icon || 'fas fa-map-pin', zoneKey: entry.zoneKey || entry.key, zoneLabel: entry.zoneLabel || entry.label, isKnown: true, source: 'official-partial' };
        }
      }
    }

    if (combinedText) {
      const ranked = DEFS
        .map((entry) => {
          const score = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
            .map((value) => _normalizeText(value))
            .filter(Boolean)
            .reduce((acc, alias) => combinedText.includes(alias) ? acc + (alias.includes(' ') ? 3 : 2) : acc, 0);
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score);
      if (ranked.length) {
        const match = ranked[0].entry;
        return { key: match.key, label: match.label, icon: match.icon || 'fas fa-map-pin', zoneKey: match.zoneKey || match.key, zoneLabel: match.zoneLabel || match.label, isKnown: true, source: 'context' };
      }
    }

    for (const candidate of explicitCandidates) {
      const officialFuzzy = findBestFuzzyHousingEntry(candidate, DEFS);
      if (officialFuzzy) {
        return { key: officialFuzzy.key, label: officialFuzzy.label, icon: officialFuzzy.icon || 'fas fa-map-pin', zoneKey: officialFuzzy.zoneKey || officialFuzzy.key, zoneLabel: officialFuzzy.zoneLabel || officialFuzzy.label, isKnown: true, source: 'official-fuzzy' };
      }
      const historyFuzzy = findBestFuzzyHousingEntry(candidate, historyEntries);
      if (historyFuzzy) {
        return { key: historyFuzzy.key, label: historyFuzzy.label, icon: historyFuzzy.icon || 'fas fa-map-pin', zoneKey: historyFuzzy.zoneKey || '', zoneLabel: historyFuzzy.zoneLabel || '', isKnown: false, source: 'history-fuzzy' };
      }
    }

    const fallbackRaw = explicitCandidates[0] || '';
    const fallbackKey = _slugifyText(fallbackRaw);
    if (fallbackKey) {
      return { key: fallbackKey, label: formatHousingLabel(fallbackRaw) || _beautifyKey(fallbackKey) || fallbackRaw, icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isKnown: false, source: 'custom' };
    }

    return { key: '', label: '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isKnown: false, source: 'empty' };
  }

  // ── Caronas ───────────────────────────────────────────────────────────────

  /* Multi-stage matching for caronas origin/destination locations.
     Stages: 1) exact alias  2) abbreviation  3) partial substring
             4) context scoring  5) fuzzy  6) custom fallback
     Returns { key, label, icon, zoneKey, zoneLabel, isCampus, isKnown, source } */
  function resolveCaronasLocation(rawInput) {
    const DEFS = _const().CARONAS_LOCATION_DEFINITIONS || [];
    const input = _normalizeText(String(rawInput || ''));
    const emptyResult = { key: '', label: '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isCampus: false, isKnown: false, source: 'empty' };
    if (!input) return emptyResult;

    function makeResult(entry, src) {
      return { key: entry.key, label: entry.label, icon: entry.icon || 'fas fa-map-pin', zoneKey: entry.zoneKey || '', zoneLabel: entry.zoneLabel || '', isCampus: !!entry.isCampus, isKnown: true, source: src };
    }

    // 1) Exact alias match
    const aliasMap = buildDefinitionAliasMap(DEFS);
    if (aliasMap.has(input)) return makeResult(aliasMap.get(input), 'alias-exact');

    // 2) Abbreviation match
    const inputUpper = String(rawInput || '').trim().toUpperCase();
    for (let ai = 0; ai < DEFS.length; ai++) {
      const abbrevs = Array.isArray(DEFS[ai].abbreviations) ? DEFS[ai].abbreviations : [];
      for (let aj = 0; aj < abbrevs.length; aj++) {
        if (String(abbrevs[aj]).toUpperCase() === inputUpper) return makeResult(DEFS[ai], 'abbreviation');
      }
    }

    // 3) Partial substring match (≥4 chars)
    if (input.length >= 4) {
      for (let pi = 0; pi < DEFS.length; pi++) {
        const pEntry = DEFS[pi];
        const pAliases = [_normalizeText(pEntry.label), _normalizeText(pEntry.key)]
          .concat((Array.isArray(pEntry.aliases) ? pEntry.aliases : []).map((a) => _normalizeText(a)))
          .filter(Boolean);
        for (let pj = 0; pj < pAliases.length; pj++) {
          if (pAliases[pj].includes(input) || input.includes(pAliases[pj])) return makeResult(pEntry, 'partial');
        }
      }
    }

    // 4) Context scoring
    const ranked = [];
    for (let ci = 0; ci < DEFS.length; ci++) {
      const cEntry = DEFS[ci];
      const cAll = [_normalizeText(cEntry.label), _normalizeText(cEntry.key)]
        .concat((Array.isArray(cEntry.aliases) ? cEntry.aliases : []).map((a) => _normalizeText(a)))
        .filter(Boolean);
      let score = 0;
      for (let cj = 0; cj < cAll.length; cj++) {
        if (input.includes(cAll[cj])) score += (cAll[cj].indexOf(' ') >= 0 ? 3 : 2);
      }
      if (score > 0) ranked.push({ entry: cEntry, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    if (ranked.length) return makeResult(ranked[0].entry, 'context');

    // 5) Fuzzy match
    const bestFuzzy = findBestFuzzyHousingEntry(String(rawInput || '').trim(), DEFS);
    if (bestFuzzy) return makeResult(bestFuzzy, 'fuzzy');

    // 6) Custom fallback
    const fallbackKey = _slugifyText(String(rawInput || '').trim());
    if (fallbackKey) {
      return { key: fallbackKey, label: formatHousingLabel(String(rawInput || '').trim()) || _beautifyKey(fallbackKey) || String(rawInput || '').trim(), icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isCampus: false, isKnown: false, source: 'custom' };
    }

    return emptyResult;
  }

  // ── Housing Features ──────────────────────────────────────────────────────

  function getHousingFeatureDefinitions() {
    const DEFS = _const().HOUSING_FEATURE_DEFINITIONS || [];
    return DEFS.map((entry) => ({
      ...entry,
      emoji: entry.emoji || getHousingFeatureEmoji(entry.key),
    }));
  }

  function getHousingFeatureInfoByKey(key) {
    const DEFS = _const().HOUSING_FEATURE_DEFINITIONS || [];
    const wanted = _slugifyText(key);
    if (!wanted) return null;
    const entry = DEFS.find((item) => item.key === wanted);
    return entry ? { ...entry, emoji: entry.emoji || getHousingFeatureEmoji(entry.key) } : null;
  }

  function extractHousingFeatureHistoryEntries(history) {
    const list = Array.isArray(history) ? history : [];
    const entries = [];

    list.forEach((item) => {
      if (!item) return;
      if (typeof item === 'string') {
        const label = formatHousingLabel(item);
        const key = _slugifyText(item);
        if (label || key) entries.push({ key, label, emoji: '🏷️' });
        return;
      }
      if (typeof item !== 'object' || Array.isArray(item)) return;

      const meta = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)) ? item.metadata : {};
      const labels = [
        ...toStringArray(item.housingFeatureLabels),
        ...toStringArray(item.marcadoresMoradia),
        ...toStringArray(item.features),
        ...toStringArray(meta.housingFeatureLabels),
        ...toStringArray(meta.marcadoresMoradia),
        ...toStringArray(meta.features),
      ];
      const keys = [
        ...toStringArray(item.housingFeatureKeys),
        ...toStringArray(meta.housingFeatureKeys),
      ];
      labels.forEach((label, index) => {
        const normalizedLabel = formatHousingLabel(label);
        const key = _slugifyText(keys[index] || normalizedLabel);
        if (normalizedLabel || key) entries.push({
          key,
          label: normalizedLabel || _beautifyKey(key),
          emoji: item.emoji || meta.featureEmoji || '🏷️',
        });
      });
    });

    return entries;
  }

  function buildHousingFeatureHistoryMaps(history, officialAliasMap) {
    const catalog = new Map();
    const aliasMap = new Map();
    extractHousingFeatureHistoryEntries(history).forEach((entry) => {
      const normalizedLabel = _normalizeText(entry.label);
      const normalizedKey = _normalizeText(entry.key);
      if (!normalizedLabel && !normalizedKey) return;
      if ((normalizedLabel && officialAliasMap.has(normalizedLabel)) || (normalizedKey && officialAliasMap.has(normalizedKey))) return;

      const finalKey = _slugifyText(entry.key || entry.label);
      if (!finalKey) return;

      const existing = catalog.get(finalKey);
      const item = {
        key: finalKey,
        label: pickPreferredHousingLabel(existing && existing.label, entry.label || finalKey) || formatHousingLabel(finalKey),
        emoji: entry.emoji || (existing && existing.emoji) || '🏷️',
        isKnown: false,
      };
      catalog.set(finalKey, item);
      [normalizedLabel, normalizedKey].filter(Boolean).forEach((alias) => {
        if (!aliasMap.has(alias)) aliasMap.set(alias, item);
      });
    });

    return { catalog, aliasMap };
  }

  function resolveSingleHousingFeature(value, options) {
    options = options || {};
    const DEFS = _const().HOUSING_FEATURE_DEFINITIONS || [];
    const raw = String(value || '').trim();
    const normalized = _normalizeText(raw);
    if (!normalized) return null;

    const officialAliasMap = options.officialAliasMap || buildDefinitionAliasMap(DEFS);
    if (officialAliasMap.has(normalized)) {
      const official = officialAliasMap.get(normalized);
      return { key: official.key, label: official.label, emoji: official.emoji || getHousingFeatureEmoji(official.key), isKnown: true };
    }
    if (options.historyMaps && options.historyMaps.aliasMap.has(normalized)) {
      const historyEntry = options.historyMaps.aliasMap.get(normalized);
      return { key: historyEntry.key, label: historyEntry.label, emoji: historyEntry.emoji || '🏷️', isKnown: false };
    }

    for (const [alias, entry] of officialAliasMap.entries()) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return { key: entry.key, label: entry.label, emoji: entry.emoji || getHousingFeatureEmoji(entry.key), isKnown: true };
      }
    }

    const historyEntries = options.historyEntries || [];
    const officialFuzzy = findBestFuzzyHousingEntry(raw, DEFS);
    if (officialFuzzy) return { key: officialFuzzy.key, label: officialFuzzy.label, emoji: officialFuzzy.emoji || getHousingFeatureEmoji(officialFuzzy.key), isKnown: true };

    const historyFuzzy = findBestFuzzyHousingEntry(raw, historyEntries);
    if (historyFuzzy) return { key: historyFuzzy.key, label: historyFuzzy.label, emoji: historyFuzzy.emoji || '🏷️', isKnown: false };

    const fallbackKey = _slugifyText(raw);
    if (!fallbackKey) return null;
    return { key: fallbackKey, label: formatHousingLabel(raw) || _beautifyKey(fallbackKey) || raw, emoji: '🏷️', isKnown: false };
  }

  function resolveHousingFeatures(source, options) {
    options = options || {};
    const DEFS = _const().HOUSING_FEATURE_DEFINITIONS || [];
    const built = buildHousingTextParts(source, options.tags);
    const officialAliasMap = buildDefinitionAliasMap(DEFS);
    const historySource = Array.isArray(options.history)
      ? options.history
      : ((typeof window !== 'undefined' && Array.isArray(window.__KC_HOUSING_FEATURE_HISTORY)) ? window.__KC_HOUSING_FEATURE_HISTORY : []);
    const historyMaps = buildHousingFeatureHistoryMaps(historySource, officialAliasMap);
    const historyEntries = Array.from(historyMaps.catalog.values()).map((entry) => ({
      ...entry,
      aliases: [entry.label, entry.key],
    }));

    const resolved = [];
    const seen = new Set();
    const addFeature = (feature) => {
      if (!feature || !feature.key || seen.has(feature.key)) return;
      seen.add(feature.key);
      resolved.push(feature);
    };

    built.explicitFeatures.forEach((candidate) => {
      addFeature(resolveSingleHousingFeature(candidate, { officialAliasMap, historyMaps, historyEntries }));
    });

    const combinedText = [
      ...built.tags,
      ...built.text,
      ...(Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : []),
    ].map((value) => _normalizeText(value)).filter(Boolean).join(' ');

    if (combinedText) {
      DEFS.forEach((entry) => {
        const aliases = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])].map((value) => _normalizeText(value)).filter(Boolean);
        if (aliases.some((alias) => combinedText.includes(alias))) {
          addFeature({ key: entry.key, label: entry.label, emoji: entry.emoji || getHousingFeatureEmoji(entry.key), isKnown: true });
        }
      });
    }

    return resolved;
  }

  // ── Housing Type ──────────────────────────────────────────────────────────

  function resolveHousingTypeKey(source) {
    const normalized = _normalizeText(source);
    if (!normalized) return '';
    if (normalized === 'moradia' || normalized === 'moradia estudantil') return '';
    if (normalized.includes('procur')) return 'procurando';
    if (normalized.includes('apart') || normalized.includes('kitnet') || normalized.includes('studio')) return 'apartamento';
    if (normalized.includes('casa') || normalized.includes('sobrado')) return 'casa';
    if (normalized.includes('republic')) return 'republica';
    if (normalized.includes('quart') || normalized.includes('suite') || normalized.includes('suíte')) return 'quarto';
    return _canonicalCategory(normalized);
  }

  function resolveHousingTypeFromCandidates(values) {
    const list = Array.isArray(values) ? values : [values];
    const generic = new Set(['moradia', 'moradia estudantil']);

    for (const value of list) {
      const key = resolveHousingTypeKey(value);
      if (key && !generic.has(key)) return key;
    }

    const combined = list.map((value) => String(value || '').trim()).filter(Boolean).join(' ');
    const combinedKey = resolveHousingTypeKey(combined);
    return generic.has(combinedKey) ? '' : combinedKey;
  }

  // ── Achados e Perdidos / Lost & Found ─────────────────────────────────────

  function getLostFoundLocationDefinitions() {
    const DEFS = _const().LOST_FOUND_LOCATION_DEFINITIONS || [];
    return DEFS.map((entry) => ({
      ...entry,
      emoji: entry.emoji || getLostFoundLocationEmoji(entry.key),
    }));
  }

  function getLostFoundLocationInfoByKey(key) {
    const DEFS = _const().LOST_FOUND_LOCATION_DEFINITIONS || [];
    const wanted = _slugifyText(key);
    if (!wanted) return null;
    const entry = DEFS.find((item) => item.key === wanted);
    return entry ? { ...entry, emoji: entry.emoji || getLostFoundLocationEmoji(entry.key) } : null;
  }

  function buildLostFoundTextParts(source, fallbackTags) {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      const meta = (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)) ? source.metadata : {};
      const tagValues = [];
      if (Array.isArray(source.tags)) tagValues.push(...source.tags);
      if (Array.isArray(source.tagKeys)) tagValues.push(...source.tagKeys);
      if (Array.isArray(meta.tags)) tagValues.push(...meta.tags);
      if (Array.isArray(meta.tagKeys)) tagValues.push(...meta.tagKeys);

      return {
        explicit: [
          source.lostFoundLocationLabel, source.lostFoundLocationKey, source.localizacao, source.location,
          meta.lostFoundLocationLabel, meta.lostFoundLocationKey, meta.localizacao, meta.location,
        ].filter(Boolean),
        text: [
          source.titulo, source.title,
          source.descricao, source.description,
          source.localizacao, source.location,
          meta.localizacao, meta.location,
          meta.entrega,
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

  function extractLostFoundLocationHistoryEntries(history) {
    const list = Array.isArray(history) ? history : [];
    const entries = [];

    list.forEach((item) => {
      if (!item) return;
      if (typeof item === 'string') {
        const label = formatHousingLabel(item);
        const key = _slugifyText(item);
        if (label || key) entries.push({ key, label, icon: 'fas fa-map-marker-alt', emoji: '📍' });
        return;
      }
      if (typeof item !== 'object' || Array.isArray(item)) return;

      const meta = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)) ? item.metadata : {};
      const label = formatHousingLabel(firstNonEmptyValue([
        item.lostFoundLocationLabel, item.localizacao, item.location, item.label,
        meta.lostFoundLocationLabel, meta.localizacao, meta.location,
      ]));
      const key = _slugifyText(firstNonEmptyValue([
        item.lostFoundLocationKey, meta.lostFoundLocationKey, item.key, label,
      ]));
      const icon = firstNonEmptyValue([item.lostFoundLocationIcon, meta.lostFoundLocationIcon, item.icon]) || 'fas fa-map-marker-alt';
      const emoji = firstNonEmptyValue([item.lostFoundLocationEmoji, meta.lostFoundLocationEmoji, item.emoji]) || '📍';
      if (label || key) entries.push({ key, label, icon, emoji });
    });

    return entries;
  }

  function buildLostFoundHistoryMaps(history, officialAliasMap) {
    const catalog = new Map();
    const aliasMap = new Map();
    extractLostFoundLocationHistoryEntries(history).forEach((entry) => {
      const normalizedLabel = _normalizeText(entry.label);
      const normalizedKey = _normalizeText(entry.key);
      if (!normalizedLabel && !normalizedKey) return;
      if ((normalizedLabel && officialAliasMap.has(normalizedLabel)) || (normalizedKey && officialAliasMap.has(normalizedKey))) return;

      const finalKey = _slugifyText(entry.key || entry.label);
      if (!finalKey) return;

      const existing = catalog.get(finalKey);
      const item = {
        key: finalKey,
        label: pickPreferredHousingLabel(existing && existing.label, entry.label || finalKey) || formatHousingLabel(finalKey),
        icon: entry.icon || (existing && existing.icon) || 'fas fa-map-marker-alt',
        emoji: entry.emoji || (existing && existing.emoji) || '📍',
        isKnown: false,
      };
      catalog.set(finalKey, item);
      [normalizedLabel, normalizedKey].filter(Boolean).forEach((alias) => {
        if (!aliasMap.has(alias)) aliasMap.set(alias, item);
      });
    });

    return { catalog, aliasMap };
  }

  function resolveLostFoundLocation(source, options) {
    options = options || {};
    const DEFS = _const().LOST_FOUND_LOCATION_DEFINITIONS || [];
    const built = buildLostFoundTextParts(source, options.tags);
    const explicitCandidates = built.explicit.map((value) => String(value || '').trim()).filter(Boolean);
    const combinedText = [
      ...explicitCandidates,
      ...built.tags,
      ...built.text,
      ...(Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : []),
    ].map((value) => _normalizeText(value)).filter(Boolean).join(' ');

    const officialAliasMap = buildDefinitionAliasMap(DEFS);
    const historySource = Array.isArray(options.history)
      ? options.history
      : ((typeof window !== 'undefined' && Array.isArray(window.__KC_LOST_FOUND_LOCATION_HISTORY)) ? window.__KC_LOST_FOUND_LOCATION_HISTORY : []);
    const historyMaps = buildLostFoundHistoryMaps(historySource, officialAliasMap);
    const historyEntries = Array.from(historyMaps.catalog.values()).map((entry) => ({
      ...entry,
      aliases: [entry.label, entry.key],
    }));

    for (const candidate of explicitCandidates) {
      const normalized = _normalizeText(candidate);
      if (!normalized) continue;
      if (officialAliasMap.has(normalized)) {
        const match = officialAliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon || 'fas fa-map-marker-alt', emoji: match.emoji || getLostFoundLocationEmoji(match.key), isKnown: true, source: 'official-exact' };
      }
      if (historyMaps.aliasMap.has(normalized)) {
        const match = historyMaps.aliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon || 'fas fa-map-marker-alt', emoji: match.emoji || '📍', isKnown: false, source: 'history-exact' };
      }
    }

    for (const candidate of explicitCandidates) {
      const normalized = _normalizeText(candidate);
      if (!normalized || normalized.length < 3) continue;
      for (const [alias, entry] of officialAliasMap.entries()) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          return { key: entry.key, label: entry.label, icon: entry.icon || 'fas fa-map-marker-alt', emoji: entry.emoji || getLostFoundLocationEmoji(entry.key), isKnown: true, source: 'official-partial' };
        }
      }
    }

    if (combinedText) {
      const ranked = DEFS
        .map((entry) => {
          const score = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
            .map((value) => _normalizeText(value))
            .filter(Boolean)
            .reduce((acc, alias) => combinedText.includes(alias) ? acc + (alias.length >= 8 ? 3 : 2) : acc, 0);
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score);
      if (ranked.length) {
        const match = ranked[0].entry;
        return { key: match.key, label: match.label, icon: match.icon || 'fas fa-map-marker-alt', emoji: match.emoji || getLostFoundLocationEmoji(match.key), isKnown: true, source: 'context' };
      }
    }

    for (const candidate of explicitCandidates) {
      const officialFuzzy = findBestFuzzyHousingEntry(candidate, DEFS);
      if (officialFuzzy) {
        return { key: officialFuzzy.key, label: officialFuzzy.label, icon: officialFuzzy.icon || 'fas fa-map-marker-alt', emoji: officialFuzzy.emoji || getLostFoundLocationEmoji(officialFuzzy.key), isKnown: true, source: 'official-fuzzy' };
      }
      const historyFuzzy = findBestFuzzyHousingEntry(candidate, historyEntries);
      if (historyFuzzy) {
        return { key: historyFuzzy.key, label: historyFuzzy.label, icon: historyFuzzy.icon || 'fas fa-map-marker-alt', emoji: historyFuzzy.emoji || '📍', isKnown: false, source: 'history-fuzzy' };
      }
    }

    const fallbackRaw = explicitCandidates[0] || '';
    const fallbackKey = _slugifyText(fallbackRaw);
    if (fallbackKey) {
      return { key: fallbackKey, label: formatHousingLabel(fallbackRaw) || _beautifyKey(fallbackKey) || fallbackRaw, icon: 'fas fa-map-marker-alt', emoji: '📍', isKnown: false, source: 'custom' };
    }

    return { key: '', label: '', icon: 'fas fa-map-marker-alt', emoji: '📍', isKnown: false, source: 'empty' };
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCU = window._KCU || {};
  window._KCU.location = Object.freeze({
    getHousingFeatureEmoji,
    getLostFoundLocationEmoji,
    toStringArray,
    scoreHousingLabel,
    pickPreferredHousingLabel,
    formatHousingLabel,
    buildDefinitionAliasMap,
    getHousingFuzzyThreshold,
    getHousingSimilarityScore,
    isCloseHousingAlias,
    findBestFuzzyHousingEntry,
    buildHousingTextParts,
    getHousingRegionDefinitions,
    getHousingRegionInfoByKey,
    extractHousingRegionHistoryEntries,
    buildHousingRegionHistoryMaps,
    resolveHousingRegion,
    resolveCaronasLocation,
    getHousingFeatureDefinitions,
    getHousingFeatureInfoByKey,
    extractHousingFeatureHistoryEntries,
    buildHousingFeatureHistoryMaps,
    resolveSingleHousingFeature,
    resolveHousingFeatures,
    resolveHousingTypeKey,
    resolveHousingTypeFromCandidates,
    getLostFoundLocationDefinitions,
    getLostFoundLocationInfoByKey,
    buildLostFoundTextParts,
    extractLostFoundLocationHistoryEntries,
    buildLostFoundHistoryMaps,
    resolveLostFoundLocation,
  });
})();
