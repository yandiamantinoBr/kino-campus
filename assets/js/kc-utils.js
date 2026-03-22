/*
  KinoCampus - Shared Utils (V8.1.2.4.6)

  Principal função:
  - Centralizar utilitários repetidos (normalize/escape/currency/debounce)
  - Evitar divergência entre scripts (search, filters, etc.)
*/
(function () {
  'use strict';

  const {
    MODULE_LABEL_MAP,
    MODULE_ICON_MAP,
    CATEGORY_LABELS,
    SUBCATEGORY_LABELS,
    OPPORTUNITY_AREA_DEFINITIONS,
    HOUSING_REGION_DEFINITIONS,
    HOUSING_FEATURE_DEFINITIONS,
    LOST_FOUND_LOCATION_DEFINITIONS
  } = (window.KC_CONSTANTS || {});

  function titleCase(str) {
    return String(str || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function timeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Se for no futuro (possível descompasso de relógio) ou acabou de ser publicado.
    // Aceita até 5 minutos de desvio de relógio (positivo ou negativo).
    if (diffMs <= 0 || diffMs < 300000) return 'Agora mesmo';

    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `Há ${diffMin} min`;

    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return diffHoras === 1 ? 'Há 1 hora' : `Há ${diffHoras} horas`;

    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias < 30) return diffDias === 1 ? 'Há 1 dia' : `Há ${diffDias} dias`;

    const diffMeses = Math.floor(diffDias / 30);
    if (diffMeses < 12) return diffMeses === 1 ? 'Há 1 mês' : `Há ${diffMeses} meses`;

    const diffAnos = Math.floor(diffDias / 365);
    return diffAnos === 1 ? 'Há 1 ano' : `Há ${diffAnos} anos`;
  }

  function beautifyKey(key) {
    const s = String(key || '').trim();
    if (!s) return '';
    return titleCase(s.replace(/[_-]+/g, ' '));
  }

  function getModuleLabel(moduleKey) {
    const key = normalizeText(moduleKey);
    return MODULE_LABEL_MAP[key] || beautifyKey(key) || String(moduleKey || '');
  }

  function getModuleIconClass(moduleKey) {
    const key = normalizeText(moduleKey);
    return MODULE_ICON_MAP[key] || 'fas fa-layer-group';
  }

  function getCategoryLabel(moduleKey, catKey) {
    const m = normalizeText(moduleKey);
    const c = normalizeText(catKey);
    const map = CATEGORY_LABELS[m];
    if (map && map[c]) return map[c];
    return beautifyKey(c) || String(catKey || '');
  }

  function getSubcategoryLabel(moduleKey, subKey) {
    const m = normalizeText(moduleKey);
    const s = normalizeText(subKey);
    const map = SUBCATEGORY_LABELS[m];
    if (map && map[s]) return map[s];
    return beautifyKey(s) || String(subKey || '');
  }

  function normalizeText(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function getEmailDomain(email) {
    const em = normalizeEmail(email);
    const at = em.lastIndexOf('@');
    if (at < 0) return '';
    return em.slice(at + 1);
  }

  function normalizeAllowedDomains(allowedDomains) {
    if (!Array.isArray(allowedDomains)) return [];
    return Array.from(new Set(
      allowedDomains
        .map((d) => String(d || '').trim().toLowerCase())
        .filter(Boolean)
    ));
  }

  function isInstitutionalEmailAllowed(email, allowedDomains) {
    const list = normalizeAllowedDomains(allowedDomains);
    if (!list.length) return true; // sem restrição
    const domain = getEmailDomain(email);
    if (!domain) return false;
    // Regra única: aceita apenas domínio explícito na allowlist.
    return list.includes(domain);
  }

  function canonicalCategory(str) {
    let s = normalizeText(str);
    s = s.replace(/^#/, '');
    // plural básico (pt-BR)
    if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
    return s;
  }

  function slugifyText(str) {
    return normalizeText(str).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function buildPublicHandle(value, options) {
    const slug = slugifyText(value).slice(0, 32);
    if (!slug) return '';
    const prefix = options && options.prefix === false ? '' : '@';
    return prefix + slug;
  }

  function levenshteinDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (!left) return right.length;
    if (!right) return left.length;

    const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[left.length][right.length];
  }

  function getOpportunityAreaDefinitions() {
    return OPPORTUNITY_AREA_DEFINITIONS.map((entry) => ({
      ...entry,
      emoji: entry.emoji || getOpportunityAreaEmoji(entry.key),
    }));
  }

  function buildOpportunityTextParts(source, fallbackTags) {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      const meta = (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)) ? source.metadata : {};
      const tagValues = [];
      if (Array.isArray(source.tags)) tagValues.push(...source.tags);
      if (Array.isArray(source.tagKeys)) tagValues.push(...source.tagKeys);
      if (Array.isArray(meta.tags)) tagValues.push(...meta.tags);
      if (Array.isArray(meta.tagKeys)) tagValues.push(...meta.tagKeys);

      return {
        explicit: [
          source.areaLabel, source.area, source.areaKey,
          meta.areaLabel, meta.area, meta.areaKey,
          source.subcategoriaLabel, source.subcategoria, source.subcategoriaKey,
          source.subcategoryLabel, source.subcategory, source.subcategoryKey,
          meta.subcategoria, meta.subcategoriaKey,
          meta.subcategoryLabel, meta.subcategory, meta.subcategoryKey
        ].filter(Boolean),
        text: [
          source.titulo, source.title,
          source.descricao, source.description,
          source.localizacao, source.location,
          meta.localizacao, meta.location
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

  function getOpportunityAreaInfoByKey(key) {
    const wanted = slugifyText(key);
    if (!wanted) return null;
    const entry = OPPORTUNITY_AREA_DEFINITIONS.find((item) => item.key === wanted);
    return entry ? { ...entry, emoji: entry.emoji || getOpportunityAreaEmoji(entry.key) } : null;
  }

  function firstNonEmptyValue(values) {
    if (!Array.isArray(values)) return '';
    for (let i = 0; i < values.length; i += 1) {
      const value = String(values[i] || '').trim();
      if (value) return value;
    }
    return '';
  }

  function formatOpportunityAreaLabel(value) {
    const raw = String(value || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    if (raw !== normalizeText(raw)) return raw;
    return titleCase(raw);
  }

  function scoreOpportunityAreaLabel(value) {
    const label = String(value || '').trim();
    if (!label) return 0;
    let score = Math.min(label.length, 32) / 32;
    if (/[A-ZÀ-Ý]/.test(label)) score += 1.5;
    if (label.normalize('NFD') !== label) score += 2;
    if (label.includes(' ')) score += 0.5;
    return score;
  }

  function pickPreferredOpportunityAreaLabel(current, candidate) {
    const currentLabel = String(current || '').trim();
    const candidateLabel = String(candidate || '').trim();
    if (!currentLabel) return candidateLabel;
    if (!candidateLabel) return currentLabel;
    return scoreOpportunityAreaLabel(candidateLabel) > scoreOpportunityAreaLabel(currentLabel)
      ? candidateLabel
      : currentLabel;
  }

  function buildOfficialOpportunityAreaMaps() {
    const aliasMap = new Map();
    OPPORTUNITY_AREA_DEFINITIONS.forEach((entry) => {
      const values = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])];
      values.forEach((value) => {
        const normalized = normalizeText(value);
        if (normalized && !aliasMap.has(normalized)) aliasMap.set(normalized, entry);
      });
    });
    return aliasMap;
  }

  function getOpportunityAreaFuzzyThreshold(source, target) {
    const maxLength = Math.max(String(source || '').length, String(target || '').length);
    if (maxLength <= 6) return 1;
    if (maxLength <= 12) return 2;
    return 3;
  }

  function getOpportunityAreaSimilarityScore(source, target) {
    const left = String(source || '');
    const right = String(target || '');
    const maxLength = Math.max(left.length, right.length);
    if (!maxLength) return 0;
    const distance = levenshteinDistance(left, right);
    return 1 - (distance / maxLength);
  }

  function isCloseOpportunityAreaAlias(candidate, alias) {
    const normalizedCandidate = normalizeText(candidate);
    const normalizedAlias = normalizeText(alias);
    if (!normalizedCandidate || !normalizedAlias) return false;
    if (normalizedCandidate === normalizedAlias) return true;
    if (normalizedCandidate.length < 5 || normalizedAlias.length < 5) return false;

    const threshold = getOpportunityAreaFuzzyThreshold(normalizedCandidate, normalizedAlias);
    if (Math.abs(normalizedCandidate.length - normalizedAlias.length) > threshold) return false;

    const distance = levenshteinDistance(normalizedCandidate, normalizedAlias);
    if (distance > threshold) return false;

    const similarity = getOpportunityAreaSimilarityScore(normalizedCandidate, normalizedAlias);
    const minSimilarity = Math.max(normalizedCandidate.length, normalizedAlias.length) >= 10 ? 0.72 : 0.78;
    return similarity >= minSimilarity;
  }

  function findBestOfficialOpportunityArea(candidate, officialAliasMap) {
    const normalized = normalizeText(candidate);
    if (!normalized) return null;

    if (officialAliasMap && officialAliasMap.has(normalized)) {
      return officialAliasMap.get(normalized);
    }

    if (normalized.length >= 5 && officialAliasMap) {
      for (const [alias, entry] of officialAliasMap.entries()) {
        if (normalized.includes(alias) || alias.includes(normalized)) return entry;
      }
    }

    return findBestFuzzyOpportunityArea(candidate, OPPORTUNITY_AREA_DEFINITIONS);
  }

  function extractOpportunityAreaHistoryEntries(history) {
    const list = Array.isArray(history) ? history : [];
    const entries = [];

    list.forEach((item) => {
      if (!item) return;

      if (typeof item === 'string') {
        const label = formatOpportunityAreaLabel(item);
        const key = slugifyText(item);
        if (label || key) entries.push({ label, key, icon: 'fas fa-briefcase' });
        return;
      }

      if (typeof item !== 'object' || Array.isArray(item)) return;

      const meta = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata))
        ? item.metadata
        : {};
      const label = formatOpportunityAreaLabel(firstNonEmptyValue([
        item.label,
        item.areaLabel, item.area,
        meta.areaLabel, meta.area,
        item.subcategoriaLabel, item.subcategoria,
        item.subcategoryLabel, item.subcategory,
        meta.subcategoryLabel, meta.subcategory
      ]));
      const key = slugifyText(firstNonEmptyValue([
        item.key,
        item.areaKey,
        meta.areaKey,
        item.subcategoriaKey,
        item.subcategoryKey,
        meta.subcategoryKey,
        label
      ]));
      const icon = firstNonEmptyValue([
        item.icon,
        item.areaIcon,
        meta.areaIcon
      ]) || 'fas fa-briefcase';

      if (label || key) entries.push({ label, key, icon });
    });

    return entries;
  }

  function buildHistoryOpportunityAreaMaps(history, officialAliasMap) {
    const catalog = new Map();
    const aliasMap = new Map();
    const entries = extractOpportunityAreaHistoryEntries(history);

    entries.forEach((entry) => {
      const normalizedLabel = normalizeText(entry.label);
      const normalizedKey = normalizeText(entry.key);
      if (!normalizedLabel && !normalizedKey) return;
      if ((normalizedLabel && officialAliasMap.has(normalizedLabel)) || (normalizedKey && officialAliasMap.has(normalizedKey))) return;
      if (findBestOfficialOpportunityArea(entry.label, officialAliasMap) || findBestOfficialOpportunityArea(entry.key, officialAliasMap)) return;

      const finalKey = slugifyText(entry.key || entry.label);
      if (!finalKey) return;

      const existing = catalog.get(finalKey);
      const finalLabel = pickPreferredOpportunityAreaLabel(existing && existing.label, entry.label || finalKey);
      const item = {
        key: finalKey,
        label: finalLabel || formatOpportunityAreaLabel(finalKey),
        icon: entry.icon || (existing && existing.icon) || 'fas fa-briefcase',
        isKnown: false,
      };

      catalog.set(finalKey, item);
      [normalizedLabel, normalizedKey].filter(Boolean).forEach((alias) => {
        if (!aliasMap.has(alias)) aliasMap.set(alias, item);
      });
    });

    return { catalog, aliasMap };
  }

  function findBestOfficialContextArea(combinedText) {
    if (!combinedText) return null;

    const ranked = OPPORTUNITY_AREA_DEFINITIONS
      .map((entry) => {
        const score = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
          .map((value) => normalizeText(value))
          .filter(Boolean)
          .reduce((acc, alias) => {
            if (!combinedText.includes(alias)) return acc;
            return acc + (alias.includes(' ') ? 3 : 2);
          }, 0);
        return { entry, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked.length ? ranked[0].entry : null;
  }

  function findBestFuzzyOpportunityArea(candidate, collection) {
    const normalized = normalizeText(candidate);
    if (!normalized || normalized.length < 5) return null;

    let best = null;
    collection.forEach((entry) => {
      const aliases = Array.isArray(entry.aliases) && entry.aliases.length
        ? entry.aliases
        : [entry.label, entry.key];

      aliases.forEach((aliasValue) => {
        const alias = normalizeText(aliasValue);
        if (!alias) return;
        const distance = levenshteinDistance(normalized, alias);
        if (!isCloseOpportunityAreaAlias(normalized, alias)) return;
        const similarity = getOpportunityAreaSimilarityScore(normalized, alias);

        if (!best || distance < best.distance || (distance === best.distance && similarity > best.similarity)) {
          best = { entry, distance, similarity };
        }
      });
    });

    return best ? best.entry : null;
  }

  function resolveOpportunityArea(source, options = {}) {
    const built = buildOpportunityTextParts(source, options.tags);
    const textParts = Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : [];
    const explicitCandidates = built.explicit.map((value) => String(value || '').trim()).filter(Boolean);
    const combinedText = [
      ...explicitCandidates,
      ...built.tags,
      ...built.text,
      ...textParts
    ].map((value) => normalizeText(value)).filter(Boolean).join(' ');

    const officialAliasMap = buildOfficialOpportunityAreaMaps();
    const historySource = Array.isArray(options.history)
      ? options.history
      : ((typeof window !== 'undefined' && Array.isArray(window.__KC_OPPORTUNITY_AREA_HISTORY)) ? window.__KC_OPPORTUNITY_AREA_HISTORY : []);
    const historyMaps = buildHistoryOpportunityAreaMaps(historySource, officialAliasMap);
    const historyEntries = Array.from(historyMaps.catalog.values()).map((entry) => ({
      ...entry,
      aliases: [entry.label, entry.key],
    }));

    for (const candidate of explicitCandidates) {
      const normalized = normalizeText(candidate);
      if (!normalized) continue;

      if (officialAliasMap.has(normalized)) {
        const match = officialAliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon, isKnown: true, source: 'official-exact' };
      }

      if (historyMaps.aliasMap.has(normalized)) {
        const match = historyMaps.aliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon, isKnown: false, source: 'history-exact' };
      }
    }

    for (const candidate of explicitCandidates) {
      const normalized = normalizeText(candidate);
      if (!normalized || normalized.length < 5) continue;

      for (const [alias, entry] of officialAliasMap.entries()) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          return { key: entry.key, label: entry.label, icon: entry.icon, isKnown: true, source: 'official-partial' };
        }
      }
    }

    const contextMatch = findBestOfficialContextArea(combinedText);
    if (contextMatch) {
      return { key: contextMatch.key, label: contextMatch.label, icon: contextMatch.icon, isKnown: true, source: 'context' };
    }

    for (const candidate of explicitCandidates) {
      const officialFuzzy = findBestFuzzyOpportunityArea(candidate, OPPORTUNITY_AREA_DEFINITIONS);
      if (officialFuzzy) {
        return { key: officialFuzzy.key, label: officialFuzzy.label, icon: officialFuzzy.icon, isKnown: true, source: 'official-fuzzy' };
      }

      const historyFuzzy = findBestFuzzyOpportunityArea(candidate, historyEntries);
      if (historyFuzzy) {
        return { key: historyFuzzy.key, label: historyFuzzy.label, icon: historyFuzzy.icon, isKnown: false, source: 'history-fuzzy' };
      }
    }

    const fallbackRaw = explicitCandidates[0] || '';
    const fallbackKey = slugifyText(fallbackRaw);
    if (fallbackKey) {
      return {
        key: fallbackKey,
        label: formatOpportunityAreaLabel(fallbackRaw) || beautifyKey(fallbackKey) || fallbackRaw,
        icon: 'fas fa-briefcase',
        isKnown: false,
        source: 'custom',
      };
    }

    return { key: '', label: '', icon: 'fas fa-briefcase', isKnown: false, source: 'empty' };
  }

  function getHousingRegionDefinitions() {
    return HOUSING_REGION_DEFINITIONS.slice();
  }

  function getHousingFeatureDefinitions() {
    return HOUSING_FEATURE_DEFINITIONS.map((entry) => ({
      ...entry,
      emoji: entry.emoji || getHousingFeatureEmoji(entry.key),
    }));
  }

  function getOpportunityAreaEmoji(key) {
    const wanted = slugifyText(key);
    const map = {
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

  function getHousingFeatureEmoji(key) {
    const wanted = slugifyText(key);
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
    const wanted = slugifyText(key);
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
    return titleCase(raw);
  }

  function buildDefinitionAliasMap(definitions) {
    const aliasMap = new Map();
    (Array.isArray(definitions) ? definitions : []).forEach((entry) => {
      [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
        .map((value) => normalizeText(value))
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
    const distance = levenshteinDistance(left, right);
    return 1 - (distance / maxLength);
  }

  function isCloseHousingAlias(candidate, alias) {
    const normalizedCandidate = normalizeText(candidate);
    const normalizedAlias = normalizeText(alias);
    if (!normalizedCandidate || !normalizedAlias) return false;
    if (normalizedCandidate === normalizedAlias) return true;
    if (normalizedCandidate.length < 5 || normalizedAlias.length < 5) return false;

    const threshold = getHousingFuzzyThreshold(normalizedCandidate, normalizedAlias);
    if (Math.abs(normalizedCandidate.length - normalizedAlias.length) > threshold) return false;

    const distance = levenshteinDistance(normalizedCandidate, normalizedAlias);
    if (distance > threshold) return false;

    const similarity = getHousingSimilarityScore(normalizedCandidate, normalizedAlias);
    const minSimilarity = Math.max(normalizedCandidate.length, normalizedAlias.length) >= 10 ? 0.72 : 0.79;
    return similarity >= minSimilarity;
  }

  function findBestFuzzyHousingEntry(candidate, collection) {
    const normalized = normalizeText(candidate);
    if (!normalized || normalized.length < 5) return null;

    let best = null;
    (Array.isArray(collection) ? collection : []).forEach((entry) => {
      const aliases = Array.isArray(entry.aliases) && entry.aliases.length
        ? entry.aliases
        : [entry.label, entry.key];

      aliases.forEach((aliasValue) => {
        const alias = normalizeText(aliasValue);
        if (!alias || !isCloseHousingAlias(normalized, alias)) return;
        const distance = levenshteinDistance(normalized, alias);
        const similarity = getHousingSimilarityScore(normalized, alias);
        if (!best || distance < best.distance || (distance === best.distance && similarity > best.similarity)) {
          best = { entry, distance, similarity };
        }
      });
    });

    return best ? best.entry : null;
  }

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
          source.localizacao, source.location, meta.localizacao, meta.location
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
          meta.detalhes
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

  function getHousingRegionInfoByKey(key) {
    const wanted = slugifyText(key);
    if (!wanted) return null;
    return HOUSING_REGION_DEFINITIONS.find((entry) => entry.key === wanted) || null;
  }

  function getHousingFeatureInfoByKey(key) {
    const wanted = slugifyText(key);
    if (!wanted) return null;
    const entry = HOUSING_FEATURE_DEFINITIONS.find((item) => item.key === wanted);
    return entry ? { ...entry, emoji: entry.emoji || getHousingFeatureEmoji(entry.key) } : null;
  }

  function getLostFoundLocationDefinitions() {
    return LOST_FOUND_LOCATION_DEFINITIONS.map((entry) => ({
      ...entry,
      emoji: entry.emoji || getLostFoundLocationEmoji(entry.key),
    }));
  }

  function getLostFoundLocationInfoByKey(key) {
    const wanted = slugifyText(key);
    if (!wanted) return null;
    const entry = LOST_FOUND_LOCATION_DEFINITIONS.find((item) => item.key === wanted);
    return entry ? { ...entry, emoji: entry.emoji || getLostFoundLocationEmoji(entry.key) } : null;
  }

  function extractHousingRegionHistoryEntries(history) {
    const list = Array.isArray(history) ? history : [];
    const entries = [];

    list.forEach((item) => {
      if (!item) return;
      if (typeof item === 'string') {
        const label = formatHousingLabel(item);
        const key = slugifyText(item);
        if (label || key) entries.push({ key, label, icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '' });
        return;
      }
      if (typeof item !== 'object' || Array.isArray(item)) return;

      const meta = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)) ? item.metadata : {};
      const label = formatHousingLabel(firstNonEmptyValue([
        item.regionLabel, item.region, item.regiao, item.label,
        meta.regionLabel, meta.region, meta.regiao, meta.regiaoLabel,
      ]));
      const key = slugifyText(firstNonEmptyValue([
        item.regionKey, meta.regionKey, item.key, label
      ]));
      const zoneKey = slugifyText(firstNonEmptyValue([
        item.regionZoneKey, meta.regionZoneKey, item.zoneKey
      ]));
      const zoneLabel = formatHousingLabel(firstNonEmptyValue([
        item.regionZoneLabel, meta.regionZoneLabel, item.zoneLabel
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
      const normalizedLabel = normalizeText(entry.label);
      const normalizedKey = normalizeText(entry.key);
      if (!normalizedLabel && !normalizedKey) return;
      if ((normalizedLabel && officialAliasMap.has(normalizedLabel)) || (normalizedKey && officialAliasMap.has(normalizedKey))) return;

      const finalKey = slugifyText(entry.key || entry.label);
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

  function resolveHousingRegion(source, options = {}) {
    const built = buildHousingTextParts(source, options.tags);
    const explicitCandidates = built.explicitRegions.map((value) => String(value || '').trim()).filter(Boolean);
    const combinedText = [
      ...explicitCandidates,
      ...built.tags,
      ...built.text,
      ...(Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : [])
    ].map((value) => normalizeText(value)).filter(Boolean).join(' ');

    const officialAliasMap = buildDefinitionAliasMap(HOUSING_REGION_DEFINITIONS);
    const historySource = Array.isArray(options.history)
      ? options.history
      : ((typeof window !== 'undefined' && Array.isArray(window.__KC_HOUSING_REGION_HISTORY)) ? window.__KC_HOUSING_REGION_HISTORY : []);
    const historyMaps = buildHousingRegionHistoryMaps(historySource, officialAliasMap);
    const historyEntries = Array.from(historyMaps.catalog.values()).map((entry) => ({
      ...entry,
      aliases: [entry.label, entry.key],
    }));

    for (const candidate of explicitCandidates) {
      const normalized = normalizeText(candidate);
      if (!normalized) continue;
      if (officialAliasMap.has(normalized)) {
        const match = officialAliasMap.get(normalized);
        return {
          key: match.key,
          label: match.label,
          icon: match.icon || 'fas fa-map-pin',
          zoneKey: match.zoneKey || match.key,
          zoneLabel: match.zoneLabel || match.label,
          isKnown: true,
          source: 'official-exact',
        };
      }
      if (historyMaps.aliasMap.has(normalized)) {
        const match = historyMaps.aliasMap.get(normalized);
        return {
          key: match.key,
          label: match.label,
          icon: match.icon || 'fas fa-map-pin',
          zoneKey: match.zoneKey || '',
          zoneLabel: match.zoneLabel || '',
          isKnown: false,
          source: 'history-exact',
        };
      }
    }

    for (const candidate of explicitCandidates) {
      const normalized = normalizeText(candidate);
      if (!normalized || normalized.length < 5) continue;
      for (const [alias, entry] of officialAliasMap.entries()) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          return {
            key: entry.key,
            label: entry.label,
            icon: entry.icon || 'fas fa-map-pin',
            zoneKey: entry.zoneKey || entry.key,
            zoneLabel: entry.zoneLabel || entry.label,
            isKnown: true,
            source: 'official-partial',
          };
        }
      }
    }

    if (combinedText) {
      const ranked = HOUSING_REGION_DEFINITIONS
        .map((entry) => {
          const score = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
            .map((value) => normalizeText(value))
            .filter(Boolean)
            .reduce((acc, alias) => combinedText.includes(alias) ? acc + (alias.includes(' ') ? 3 : 2) : acc, 0);
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score);
      if (ranked.length) {
        const match = ranked[0].entry;
        return {
          key: match.key,
          label: match.label,
          icon: match.icon || 'fas fa-map-pin',
          zoneKey: match.zoneKey || match.key,
          zoneLabel: match.zoneLabel || match.label,
          isKnown: true,
          source: 'context',
        };
      }
    }

    for (const candidate of explicitCandidates) {
      const officialFuzzy = findBestFuzzyHousingEntry(candidate, HOUSING_REGION_DEFINITIONS);
      if (officialFuzzy) {
        return {
          key: officialFuzzy.key,
          label: officialFuzzy.label,
          icon: officialFuzzy.icon || 'fas fa-map-pin',
          zoneKey: officialFuzzy.zoneKey || officialFuzzy.key,
          zoneLabel: officialFuzzy.zoneLabel || officialFuzzy.label,
          isKnown: true,
          source: 'official-fuzzy',
        };
      }
      const historyFuzzy = findBestFuzzyHousingEntry(candidate, historyEntries);
      if (historyFuzzy) {
        return {
          key: historyFuzzy.key,
          label: historyFuzzy.label,
          icon: historyFuzzy.icon || 'fas fa-map-pin',
          zoneKey: historyFuzzy.zoneKey || '',
          zoneLabel: historyFuzzy.zoneLabel || '',
          isKnown: false,
          source: 'history-fuzzy',
        };
      }
    }

    const fallbackRaw = explicitCandidates[0] || '';
    const fallbackKey = slugifyText(fallbackRaw);
    if (fallbackKey) {
      return {
        key: fallbackKey,
        label: formatHousingLabel(fallbackRaw) || beautifyKey(fallbackKey) || fallbackRaw,
        icon: 'fas fa-map-pin',
        zoneKey: '',
        zoneLabel: '',
        isKnown: false,
        source: 'custom',
      };
    }

    return { key: '', label: '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isKnown: false, source: 'empty' };
  }

  function extractHousingFeatureHistoryEntries(history) {
    const list = Array.isArray(history) ? history : [];
    const entries = [];

    list.forEach((item) => {
      if (!item) return;
      if (typeof item === 'string') {
        const label = formatHousingLabel(item);
        const key = slugifyText(item);
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
        const key = slugifyText(keys[index] || normalizedLabel);
        if (normalizedLabel || key) entries.push({
          key,
          label: normalizedLabel || beautifyKey(key),
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
      const normalizedLabel = normalizeText(entry.label);
      const normalizedKey = normalizeText(entry.key);
      if (!normalizedLabel && !normalizedKey) return;
      if ((normalizedLabel && officialAliasMap.has(normalizedLabel)) || (normalizedKey && officialAliasMap.has(normalizedKey))) return;

      const finalKey = slugifyText(entry.key || entry.label);
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

  function resolveSingleHousingFeature(value, options = {}) {
    const raw = String(value || '').trim();
    const normalized = normalizeText(raw);
    if (!normalized) return null;

    const officialAliasMap = options.officialAliasMap || buildDefinitionAliasMap(HOUSING_FEATURE_DEFINITIONS);
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
    const officialFuzzy = findBestFuzzyHousingEntry(raw, HOUSING_FEATURE_DEFINITIONS);
    if (officialFuzzy) return { key: officialFuzzy.key, label: officialFuzzy.label, emoji: officialFuzzy.emoji || getHousingFeatureEmoji(officialFuzzy.key), isKnown: true };

    const historyFuzzy = findBestFuzzyHousingEntry(raw, historyEntries);
    if (historyFuzzy) {
      return {
        key: historyFuzzy.key,
        label: historyFuzzy.label,
        emoji: historyFuzzy.emoji || '🏷️',
        isKnown: false,
      };
    }

    const fallbackKey = slugifyText(raw);
    if (!fallbackKey) return null;
    return {
      key: fallbackKey,
      label: formatHousingLabel(raw) || beautifyKey(fallbackKey) || raw,
      emoji: '🏷️',
      isKnown: false,
    };
  }

  function resolveHousingFeatures(source, options = {}) {
    const built = buildHousingTextParts(source, options.tags);
    const officialAliasMap = buildDefinitionAliasMap(HOUSING_FEATURE_DEFINITIONS);
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
      ...(Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : [])
    ].map((value) => normalizeText(value)).filter(Boolean).join(' ');

    if (combinedText) {
      HOUSING_FEATURE_DEFINITIONS.forEach((entry) => {
        const aliases = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])].map((value) => normalizeText(value)).filter(Boolean);
        if (aliases.some((alias) => combinedText.includes(alias))) {
          addFeature({ key: entry.key, label: entry.label, emoji: entry.emoji || getHousingFeatureEmoji(entry.key), isKnown: true });
        }
      });
    }

    return resolved;
  }

  function resolveHousingTypeKey(source) {
    const normalized = normalizeText(source);
    if (!normalized) return '';
    if (normalized === 'moradia' || normalized === 'moradia estudantil') return '';
    if (normalized.includes('procur')) return 'procurando';
    if (normalized.includes('apart') || normalized.includes('kitnet') || normalized.includes('studio')) return 'apartamento';
    if (normalized.includes('casa') || normalized.includes('sobrado')) return 'casa';
    if (normalized.includes('republic')) return 'republica';
    if (normalized.includes('quart') || normalized.includes('suite') || normalized.includes('suíte')) return 'quarto';
    return canonicalCategory(normalized);
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
          meta.lostFoundLocationLabel, meta.lostFoundLocationKey, meta.localizacao, meta.location
        ].filter(Boolean),
        text: [
          source.titulo, source.title,
          source.descricao, source.description,
          source.localizacao, source.location,
          meta.localizacao, meta.location,
          meta.entrega
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
        const key = slugifyText(item);
        if (label || key) entries.push({ key, label, icon: 'fas fa-map-marker-alt', emoji: '📍' });
        return;
      }
      if (typeof item !== 'object' || Array.isArray(item)) return;

      const meta = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)) ? item.metadata : {};
      const label = formatHousingLabel(firstNonEmptyValue([
        item.lostFoundLocationLabel, item.localizacao, item.location, item.label,
        meta.lostFoundLocationLabel, meta.localizacao, meta.location
      ]));
      const key = slugifyText(firstNonEmptyValue([
        item.lostFoundLocationKey, meta.lostFoundLocationKey, item.key, label
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
      const normalizedLabel = normalizeText(entry.label);
      const normalizedKey = normalizeText(entry.key);
      if (!normalizedLabel && !normalizedKey) return;
      if ((normalizedLabel && officialAliasMap.has(normalizedLabel)) || (normalizedKey && officialAliasMap.has(normalizedKey))) return;

      const finalKey = slugifyText(entry.key || entry.label);
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

  function resolveLostFoundLocation(source, options = {}) {
    const built = buildLostFoundTextParts(source, options.tags);
    const explicitCandidates = built.explicit.map((value) => String(value || '').trim()).filter(Boolean);
    const combinedText = [
      ...explicitCandidates,
      ...built.tags,
      ...built.text,
      ...(Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : [])
    ].map((value) => normalizeText(value)).filter(Boolean).join(' ');

    const officialAliasMap = buildDefinitionAliasMap(LOST_FOUND_LOCATION_DEFINITIONS);
    const historySource = Array.isArray(options.history)
      ? options.history
      : ((typeof window !== 'undefined' && Array.isArray(window.__KC_LOST_FOUND_LOCATION_HISTORY)) ? window.__KC_LOST_FOUND_LOCATION_HISTORY : []);
    const historyMaps = buildLostFoundHistoryMaps(historySource, officialAliasMap);
    const historyEntries = Array.from(historyMaps.catalog.values()).map((entry) => ({
      ...entry,
      aliases: [entry.label, entry.key],
    }));

    for (const candidate of explicitCandidates) {
      const normalized = normalizeText(candidate);
      if (!normalized) continue;
      if (officialAliasMap.has(normalized)) {
        const match = officialAliasMap.get(normalized);
        return {
          key: match.key,
          label: match.label,
          icon: match.icon || 'fas fa-map-marker-alt',
          emoji: match.emoji || getLostFoundLocationEmoji(match.key),
          isKnown: true,
          source: 'official-exact',
        };
      }
      if (historyMaps.aliasMap.has(normalized)) {
        const match = historyMaps.aliasMap.get(normalized);
        return {
          key: match.key,
          label: match.label,
          icon: match.icon || 'fas fa-map-marker-alt',
          emoji: match.emoji || '📍',
          isKnown: false,
          source: 'history-exact',
        };
      }
    }

    for (const candidate of explicitCandidates) {
      const normalized = normalizeText(candidate);
      if (!normalized || normalized.length < 3) continue;
      for (const [alias, entry] of officialAliasMap.entries()) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          return {
            key: entry.key,
            label: entry.label,
            icon: entry.icon || 'fas fa-map-marker-alt',
            emoji: entry.emoji || getLostFoundLocationEmoji(entry.key),
            isKnown: true,
            source: 'official-partial',
          };
        }
      }
    }

    if (combinedText) {
      const ranked = LOST_FOUND_LOCATION_DEFINITIONS
        .map((entry) => {
          const score = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
            .map((value) => normalizeText(value))
            .filter(Boolean)
            .reduce((acc, alias) => combinedText.includes(alias) ? acc + (alias.length >= 8 ? 3 : 2) : acc, 0);
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score);
      if (ranked.length) {
        const match = ranked[0].entry;
        return {
          key: match.key,
          label: match.label,
          icon: match.icon || 'fas fa-map-marker-alt',
          emoji: match.emoji || getLostFoundLocationEmoji(match.key),
          isKnown: true,
          source: 'context',
        };
      }
    }

    for (const candidate of explicitCandidates) {
      const officialFuzzy = findBestFuzzyHousingEntry(candidate, LOST_FOUND_LOCATION_DEFINITIONS);
      if (officialFuzzy) {
        return {
          key: officialFuzzy.key,
          label: officialFuzzy.label,
          icon: officialFuzzy.icon || 'fas fa-map-marker-alt',
          emoji: officialFuzzy.emoji || getLostFoundLocationEmoji(officialFuzzy.key),
          isKnown: true,
          source: 'official-fuzzy',
        };
      }
      const historyFuzzy = findBestFuzzyHousingEntry(candidate, historyEntries);
      if (historyFuzzy) {
        return {
          key: historyFuzzy.key,
          label: historyFuzzy.label,
          icon: historyFuzzy.icon || 'fas fa-map-marker-alt',
          emoji: historyFuzzy.emoji || '📍',
          isKnown: false,
          source: 'history-fuzzy',
        };
      }
    }

    const fallbackRaw = explicitCandidates[0] || '';
    const fallbackKey = slugifyText(fallbackRaw);
    if (fallbackKey) {
      return {
        key: fallbackKey,
        label: formatHousingLabel(fallbackRaw) || beautifyKey(fallbackKey) || fallbackRaw,
        icon: 'fas fa-map-marker-alt',
        emoji: '📍',
        isKnown: false,
        source: 'custom',
      };
    }

    return { key: '', label: '', icon: 'fas fa-map-marker-alt', emoji: '📍', isKnown: false, source: 'empty' };
  }

  function resolveHousingTypeFromCandidates(values) {
    const list = Array.isArray(values) ? values : [values];
    const generic = new Set(['moradia', 'moradia estudantil']);

    for (const value of list) {
      const key = resolveHousingTypeKey(value);
      if (key && !generic.has(key)) return key;
    }

    const combined = list
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');
    const combinedKey = resolveHousingTypeKey(combined);
    return generic.has(combinedKey) ? '' : combinedKey;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cssEscape(str) {
    // fallback simples (suficiente para ids/classes gerados localmente)
    return String(str ?? '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function formatCurrencyBRL(value) {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(num)) return 'R$ 0,00';
    try {
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (_) {
      // fallback
      const fixed = (Math.round(num * 100) / 100).toFixed(2).replace('.', ',');
      return 'R$ ' + fixed;
    }
  }

  function parseBRLNumber(input) {
    const s = String(input ?? '')
      .replace(/\s/g, '')
      .replace(/R\$/i, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function debounce(fn, wait = 120) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function getConditionLabel(raw) {
    const r = normalizeText(raw);
    if (!r) return '';
    if (r.includes('semi')) return 'Semi-novo';
    if (r.includes('novo')) return 'Novo';
    return beautifyKey(r);
  }

  function splitPriceText(text) {
    const t = String(text || '').trim();
    if (!t) return { main: '', small: '' };

    // Quebra explícita por linha
    if (t.includes('\n')) {
      const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
      return { main: lines[0] || '', small: lines.slice(1).join(' ') };
    }

    // Conteúdo em parênteses como complemento
    const paren = t.match(/^(.*)\(([^)]+)\)\s*$/);
    if (paren) return { main: paren[1].trim(), small: paren[2].trim() };

    // Separadores comuns
    for (const sep of [' - ', ' • ', ' | ']) {
      if (t.includes(sep)) {
        const [a, ...rest] = t.split(sep);
        return { main: a.trim(), small: rest.join(sep).trim() };
      }
    }

    // Casos do protótipo: "R$ 5,00/trecho Ida e volta"
    const unitMatchers = ['/trecho', '/mês', '/mes', '/dia', '/hora', '/semana'];
    for (const unit of unitMatchers) {
      const idx = t.toLowerCase().indexOf(unit);
      if (idx >= 0) {
        const cut = idx + unit.length;
        const main = t.slice(0, cut).trim();
        const small = t.slice(cut).trim();
        if (small) return { main, small };
      }
    }

    return { main: t, small: '' };
  }

  function inferCaronasRoute(title) {
    const s = String(title || '').trim();
    if (!s) return { from: '', to: '' };
    const arrow = s.includes('→') ? '→' : (s.includes('->') ? '->' : (s.includes('➡') ? '➡' : ''));
    if (!arrow) return { from: '', to: '' };
    const parts = s.split(arrow).map(x => x.trim());
    if (parts.length < 2) return { from: '', to: '' };
    const left = parts[0].replace(/^carona\s*/i, '').trim();
    const right = parts[1].trim();
    return { from: beautifyKey(left), to: beautifyKey(right) };
  }

  function inferAchadosLocation(source, tags = []) {
    const resolved = resolveLostFoundLocation(source, { tags });
    return resolved && resolved.label ? resolved.label : '';
  }

  function inferOportunidadesSubcategory(source, tags = []) {
    const resolved = resolveOpportunityArea(source, { tags });
    return resolved && resolved.label ? resolved.label : '';
  }

  function inferEventosCategory(rawCat, tags = []) {
    const base = normalizeText(rawCat);
    const t = (Array.isArray(tags) ? tags : []).map(x => normalizeText(x));

    // Se já veio uma categoria "boa", respeitar
    if (base && base !== 'eventos') return base;

    const has = (needle) => t.some(x => x.includes(needle) || needle.includes(x));
    if (has('sustent') || has('feira')) return 'sustentabilidade';
    if (has('festival') || has('cultural') || has('musica') || has('arte')) return 'cultural';
    if (has('torneio') || has('futsal') || has('esport')) return 'esportivo';
    if (has('palestra') || has('workshop') || has('academ')) return 'academico';
    return base || 'eventos';
  }

  function applyPresentationRules(post, context = {}) {
    const p = { ...(post || {}) };

    const moduleKey = String(p.modulo || '').toLowerCase();
    const tags = Array.isArray(p.tags) ? p.tags : (Array.isArray(p.tagKeys) ? p.tagKeys : []);
    const normTags = (Array.isArray(tags) ? tags : []).map(t => normalizeText(t));
    const meta = (p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)) ? p.metadata : {};
    const housingTypeKey = moduleKey === 'moradia'
      ? resolveHousingTypeFromCandidates([
        meta.housingTypeKey,
        meta.housingTypeLabel,
        p.housingTypeKey,
        p.housingTypeLabel,
        p.categoriaKey,
        p.categoria,
        meta.categoriaKey,
        meta.categoria,
        p.titulo,
        p.title,
        p.descricao,
        p.description
      ])
      : '';
    const housingRegionInfo = moduleKey === 'moradia'
      ? resolveHousingRegion(p, { tags })
      : null;
    const housingFeatures = moduleKey === 'moradia'
      ? resolveHousingFeatures(p, { tags })
      : [];
    const lostFoundLocationInfo = moduleKey === 'achados-perdidos'
      ? resolveLostFoundLocation(p, { tags })
      : null;

    // Derivar chaves (mantém consistência para filtros)
    if (!p.categoriaKey) {
      const rawCat = String(p.categoria || meta.category || meta.categoryKey || '').trim();
      let key = canonicalCategory(rawCat);

      if (moduleKey === 'caronas') {
        if (key.includes('procuro')) key = 'procuro';
        else if (key.includes('ofereco') || key.includes('ofereço')) key = 'ofereco';
      }

      if (moduleKey === 'achados-perdidos') {
        if (key.includes('perd')) key = 'perdido';
        else if (key.includes('achad') || key.includes('encontr')) key = 'encontrado';
      }

      if (moduleKey === 'eventos') {
        key = inferEventosCategory(key, normTags);
      }

      if (moduleKey === 'moradia') {
        key = housingTypeKey || key;
      }

      p.categoriaKey = key || '';
    }

    if (!p.subcategoriaKey) {
      const rawSub = String(p.subcategoria || meta.subcategory || '').trim();
      p.subcategoriaKey = canonicalCategory(rawSub) || '';
    }

    // UI: comentários compactos (ícone + número)
    if (p._kcCompactComments == null) p._kcCompactComments = true;

    // Tempo Relativo (timeAgo)
    if (p.created_at || p.timestamp) {
      p._kcRelativeTime = timeAgo(p.created_at || p.timestamp);
    }


    // Labels (sem quebrar caso já existam)
    if (!p.categoriaLabel) p.categoriaLabel = getCategoryLabel(moduleKey, p.categoriaKey || p.categoria);
    if (moduleKey === 'moradia') {
      if ((!p.categoriaKey || normalizeText(p.categoriaKey) === 'moradia') && housingTypeKey) p.categoriaKey = housingTypeKey;
      if (!p.categoriaLabel) p.categoriaLabel = getCategoryLabel(moduleKey, housingTypeKey || p.categoria);

      const tagKeys = Array.isArray(p.tagKeys) ? p.tagKeys.slice() : [];
      const tagLabels = Array.isArray(p.tags) ? p.tags.slice() : [];
      const appendTag = (key, label) => {
        const normalizedKey = String(key || '').trim();
        const normalizedLabel = String(label || '').trim();
        if (normalizedKey && !tagKeys.includes(normalizedKey)) tagKeys.push(normalizedKey);
        if (normalizedLabel && !tagLabels.includes(normalizedLabel)) tagLabels.push(normalizedLabel);
      };

      if (housingRegionInfo && housingRegionInfo.key) {
        p.regionKey = p.regionKey || housingRegionInfo.key;
        p.regionLabel = p.regionLabel || housingRegionInfo.label;
        p.regionZoneKey = p.regionZoneKey || housingRegionInfo.zoneKey || '';
        p.regionZoneLabel = p.regionZoneLabel || housingRegionInfo.zoneLabel || '';
        appendTag(housingRegionInfo.key, housingRegionInfo.label);
        if (housingRegionInfo.zoneKey && housingRegionInfo.zoneKey !== housingRegionInfo.key) {
          appendTag(housingRegionInfo.zoneKey, housingRegionInfo.zoneLabel || housingRegionInfo.zoneKey);
        }
      }

      const featureKeys = [];
      const featureLabels = [];
      housingFeatures.forEach((feature) => {
        if (!feature || !feature.key || !feature.label) return;
        featureKeys.push(feature.key);
        featureLabels.push(feature.label);
        appendTag(feature.key, feature.label);
      });

      p.tagKeys = tagKeys;
      p.tags = tagLabels;
      p.housingFeatureKeys = featureKeys;
      p.housingFeatureLabels = featureLabels;
      p._kcHousingInfo = {
        typeKey: housingTypeKey || p.categoriaKey || '',
        region: housingRegionInfo && housingRegionInfo.key ? housingRegionInfo : null,
        features: housingFeatures.slice(),
      };
      if (!p.subcategoriaLabel && housingRegionInfo && housingRegionInfo.label) p.subcategoriaLabel = housingRegionInfo.label;
    } else if (moduleKey === 'achados-perdidos') {
      if (lostFoundLocationInfo && lostFoundLocationInfo.key) {
        const tagKeys = Array.isArray(p.tagKeys) ? p.tagKeys.slice() : [];
        const tagLabels = Array.isArray(p.tags) ? p.tags.slice() : [];
        if (!tagKeys.includes(lostFoundLocationInfo.key)) tagKeys.push(lostFoundLocationInfo.key);
        if (!tagLabels.includes(lostFoundLocationInfo.label)) tagLabels.push(lostFoundLocationInfo.label);
        p.tagKeys = tagKeys;
        p.tags = tagLabels;
        p.lostFoundLocationKey = p.lostFoundLocationKey || lostFoundLocationInfo.key;
        p.lostFoundLocationLabel = p.lostFoundLocationLabel || lostFoundLocationInfo.label;
        p.lostFoundLocationIcon = p.lostFoundLocationIcon || lostFoundLocationInfo.icon;
        p.lostFoundLocationEmoji = p.lostFoundLocationEmoji || lostFoundLocationInfo.emoji;
        p._kcLostFoundInfo = {
          location: lostFoundLocationInfo,
        };
        if (!p.subcategoriaLabel && lostFoundLocationInfo.label) p.subcategoriaLabel = lostFoundLocationInfo.label;
      }
      if (!p.subcategoriaLabel) p.subcategoriaLabel = getSubcategoryLabel(moduleKey, p.subcategoriaKey || p.subcategoria);
    } else if (moduleKey === 'oportunidades') {
      const areaInfo = resolveOpportunityArea(p, { tags });
      if (!p.subcategoriaKey && areaInfo.key) p.subcategoriaKey = areaInfo.key;
      if (!p.subcategoriaLabel) p.subcategoriaLabel = areaInfo.label || inferOportunidadesSubcategory(p, tags);
    } else if (!p.subcategoriaLabel) {
      p.subcategoriaLabel = getSubcategoryLabel(moduleKey, p.subcategoriaKey || p.subcategoria);
    }

    // Contexto (páginas de módulo podem omitir o nome do módulo)
    const pageModule = String(context.pageModule || '').toLowerCase();
    const isModulePage = !!pageModule;
    const showModuleLabelOnPage = (moduleKey === 'moradia' || moduleKey === 'eventos');
    const hideModuleLabel = isModulePage && pageModule === moduleKey && !showModuleLabelOnPage;
    p._kcShowModuleLabel = !hideModuleLabel;

    // Prefixo do autor
    if (p._kcAuthorPrefix == null || String(p._kcAuthorPrefix).trim() === '') {
      if (moduleKey === 'eventos') p._kcAuthorPrefix = 'Organizado por';
      else if (moduleKey === 'achados-perdidos') p._kcAuthorPrefix = 'Reportado por';
      else p._kcAuthorPrefix = 'Anunciado por';
    }

    // CTA
    // V8.1.3.1.4: Unificação de CTA no footer de TODOS os módulos
    // Motivo: textos longos (ex.: "Reservar Vaga", "Inscrever-se") quebravam o layout do kc-card__footer no mobile.
    // Regra: sempre "Ver Mais".
    p._kcCtaText = 'Ver Mais';

    // Verificação (V8.1.3.2)
    // - Agora é atributo do AUTOR (profiles.verified), mas mantemos compatibilidade com o legado.
    const isVerified = (p.authorVerified === true || p.verificado === true);
    p.verificado = isVerified; // garante consistência para data-verified / estilos

    if (isVerified) {
      if (!p._kcVerifiedTag) {
        p._kcVerifiedTag = (moduleKey === 'eventos') ? '@oficial' : '@verificado';
      }
    } else {
      p._kcVerifiedTag = p._kcVerifiedTag || '';
    }
    // Badge (status/promo/sustentável)
    // + Badges de topo (contexto + tempo) (V8.1.2.4.5)
    let _kcStatusLabel = '';

    if (!p._kcBadgeText) {
      // Achados/Perdidos: sempre mostrar status
      if (moduleKey === 'achados-perdidos') {
        const statusLost = String(p.categoriaKey || '').includes('perd');
        _kcStatusLabel = statusLost ? 'perdido' : 'encontrado';
        p._kcBadgeIconClass = statusLost ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
        p._kcBadgeText = statusLost ? 'Perdido' : 'Encontrado';
        p._kcBadgeStyle = statusLost ? 'background-color: var(--kc-red-alert);' : '';
        // Badge de contexto (product + cards): pill com ícone
        p._kcStatusBadgeHtml = `<span class="kc-badge"><i class="fas fa-tag"></i> ${_kcStatusLabel}</span>`;
      }

      // Promoção em compra-venda
      if (!p._kcBadgeText && moduleKey === 'compra-venda') {
        const po = typeof p.precoOriginal === 'number' ? p.precoOriginal : null;
        const pr = typeof p.preco === 'number' ? p.preco : null;
        if (Number.isFinite(po) && Number.isFinite(pr) && po > pr && pr > 0) {
          p._kcBadgeIconClass = 'fas fa-percent';
          p._kcBadgeText = 'Promoção';
          p._kcBadgeStyle = '';
        }
      }

      // Sustentável (eventos/caronas)
      if (!p._kcBadgeText) {
        const hasSust = normTags.some(t => t.includes('sustent')) || normalizeText(p.descricao || '').includes('sustent');
        if (hasSust && (moduleKey === 'eventos' || moduleKey === 'caronas')) {
          p._kcBadgeIconClass = 'fas fa-leaf';
          p._kcBadgeText = (moduleKey === 'eventos') ? 'Evento Sustentável' : 'Sustentável';
          p._kcBadgeStyle = '';
        }
      }

      // Badge explícito (metadata/local) — garante "kc-cashback-badge" quando o post trouxer esse atributo
      if (!p._kcBadgeText) {
        const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
        const explicitText = (
          p.cashbackBadgeText || p.cashbackBadge || p.cornerBadgeText ||
          meta.cashbackBadgeText || meta.cashbackBadge || meta.cornerBadgeText ||
          meta.badgeText || meta.badge
        );

        // Ex.: meta.co2_kg = 22 => "22kg CO₂ evitado"
        const co2 = (meta.co2_kg != null) ? Number(meta.co2_kg) : (meta.co2Kg != null ? Number(meta.co2Kg) : null);
        const co2Text = (co2 != null && Number.isFinite(co2) && co2 > 0) ? `${co2}kg CO₂ evitado` : '';

        const finalText = co2Text || (explicitText != null ? String(explicitText).trim() : '');
        if (finalText) {
          p._kcBadgeIconClass = (meta.badgeIconClass && String(meta.badgeIconClass).trim()) ? String(meta.badgeIconClass).trim() : 'fas fa-leaf';
          p._kcBadgeText = finalText;
          p._kcBadgeStyle = (meta.badgeStyle && String(meta.badgeStyle).trim()) ? String(meta.badgeStyle).trim() : '';
        }
      }
    }


    // Preço (ícone/estilo e split main/small)
    if (p._kcPriceIconClass == null || String(p._kcPriceIconClass).trim() === '') {
      if (moduleKey === 'compra-venda') p._kcPriceIconClass = 'fas fa-tag';
      else if (moduleKey === 'eventos') p._kcPriceIconClass = 'fas fa-gift';
      else if (moduleKey === 'caronas') {
        const looking = String(p.categoriaKey || '').includes('procuro');
        p._kcPriceIconClass = looking ? 'fas fa-handshake' : 'fas fa-money-bill-wave';
      } else p._kcPriceIconClass = 'fas fa-money-bill-wave';
    }

    if (p._kcPriceStyle == null || String(p._kcPriceStyle).trim() === '') {
      if (moduleKey === 'compra-venda') p._kcPriceStyle = 'color: var(--kc-hot-color);';
      else if (moduleKey === 'eventos') p._kcPriceStyle = 'color: var(--kc-green-check);';
      else if (moduleKey === 'oportunidades') p._kcPriceStyle = 'color: var(--kc-green-check);';
      else if (moduleKey === 'caronas') {
        const looking = String(p.categoriaKey || '').includes('procuro');
        p._kcPriceStyle = looking ? 'color: var(--kc-secondary-brand);' : 'color: var(--kc-green-check);';
      } else p._kcPriceStyle = '';
    }

    // Esconder preço em Achados/Perdidos
    if (moduleKey === 'achados-perdidos' && p._kcHidePrice == null) p._kcHidePrice = true;

    // Normalizar texto de preço
    if (!p._kcPriceTextMain) {
      let text = '';
      if (p.precoTexto) text = String(p.precoTexto);
      else if (p.preco != null && p.preco !== '') text = (typeof p.preco === 'number') ? formatCurrencyBRL(p.preco) : String(p.preco);
      const split = splitPriceText(text);
      p._kcPriceTextMain = split.main;
      p._kcPriceTextSmall = split.small;
    }

    // Category segments (texto puro; render adiciona marcador de verificação)
    if (!Array.isArray(p._kcCategorySegments)) {
      const segments = [];
      if (p._kcShowModuleLabel) segments.push(getModuleLabel(moduleKey));

      if (moduleKey === 'caronas') {
        const route = inferCaronasRoute(p.titulo);
        segments.push(getCategoryLabel(moduleKey, p.categoriaKey || p.categoria));
        if (route.from) segments.push(route.from);
        if (route.to) segments.push(route.to);
      } else if (moduleKey === 'compra-venda') {
        if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
        if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
        if (p.condicao) segments.push(getConditionLabel(p.condicao));
      } else if (moduleKey === 'moradia') {
        if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
        if (housingRegionInfo && housingRegionInfo.label) segments.push(String(housingRegionInfo.label));
      } else if (moduleKey === 'achados-perdidos') {
        const lost = String(p.categoriaKey || '').includes('perd');
        segments.push(lost ? 'Perdido' : 'Encontrado');
        if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
        const loc = inferAchadosLocation(p, tags);
        if (loc) segments.push(loc);
      } else if (moduleKey === 'oportunidades') {
        if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
        if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
      } else {
        if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
        if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
      }

      p._kcCategorySegments = segments.filter(Boolean);
    }

    // Categoria usada para tabs (data-category). Ex.: módulo "livros" aparece como aba "Livros" em compra-venda.
    if (!p._kcTabCategoryKey) {
      if (moduleKey === 'livros') p._kcTabCategoryKey = 'livros';
      else if (moduleKey === 'moradia') p._kcTabCategoryKey = housingTypeKey || p.categoriaKey || canonicalCategory(p.categoria) || '';
      else p._kcTabCategoryKey = p.categoriaKey || canonicalCategory(p.categoria) || '';
    }

    return p;
  }

  function getDisplayMarkerTags(post, options = {}) {
    const p = applyPresentationRules(post, options.context || {});
    const moduleKey = String(p.modulo || '').toLowerCase();
    const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : Infinity;
    const tags = [];

    if (moduleKey === 'moradia') {
      const housingInfo = (p._kcHousingInfo && typeof p._kcHousingInfo === 'object') ? p._kcHousingInfo : {};
      const features = Array.isArray(housingInfo.features) ? housingInfo.features : [];
      features.forEach((feature) => {
        if (!feature || !feature.key || !feature.label) return;
        tags.push({
          key: `moradia:${feature.key}`,
          label: feature.label,
          emoji: feature.emoji || getHousingFeatureEmoji(feature.key),
        });
      });
    }

    if (moduleKey === 'oportunidades') {
      const areaInfo = resolveOpportunityArea(p, { tags: Array.isArray(p.tags) ? p.tags : [] });
      if (areaInfo && areaInfo.key && areaInfo.label) {
        tags.push({
          key: `oportunidades:${areaInfo.key}`,
          label: areaInfo.label,
          emoji: areaInfo.emoji || getOpportunityAreaEmoji(areaInfo.key),
        });
      }
    }

    if (moduleKey === 'achados-perdidos') {
      const locationInfo = resolveLostFoundLocation(p, { tags: Array.isArray(p.tags) ? p.tags : [] });
      if (locationInfo && locationInfo.key && locationInfo.label) {
        tags.push({
          key: `achados:${locationInfo.key}`,
          label: locationInfo.label,
          emoji: locationInfo.emoji || getLostFoundLocationEmoji(locationInfo.key),
        });
      }
    }

    return tags.slice(0, limit);
  }

  function renderMarkerTags(tags, options = {}) {
    const items = Array.isArray(tags) ? tags.filter((tag) => tag && tag.label) : [];
    if (!items.length) return '';

    const containerClass = String(options.containerClass || 'kc-card__tag-row').trim();
    const itemClass = String(options.itemClass || 'kc-card__tag').trim();
    const emojiClass = itemClass.includes('kc-tag') ? 'kc-tag__emoji' : 'kc-card__tag-emoji';

    return `<div class="${escapeHtml(containerClass)}">` + items.map((tag) => {
      const emoji = String(tag.emoji || '🏷️').trim();
      const label = String(tag.label || '').trim();
      return `<span class="${escapeHtml(itemClass)}">${emoji ? `<span class="${escapeHtml(emojiClass)}">${escapeHtml(emoji)}</span>` : ''}<span>${escapeHtml(label)}</span></span>`;
    }).join('') + '</div>';
  }

  // Renderização padrão de um card (estrutura idêntica aos .kc-card do HTML)
  // - Recebe um post normalizado (authorId)
  // - Busca autor via KCAPI.getAuthorById(post.authorId)
  // - Retorna HTML (string) do <article class="kc-card">...</article>
  function renderPostCard(post, options) {
    // Compat: alguns usos antigos podem passar index do Array.map como 2º arg
    const ctx = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const p = applyPresentationRules(post, ctx);

    const id = p.id != null ? String(p.id) : '';
    const emoji = (p.emoji || '✨');

    const moduleKey = String(p.modulo || '').toLowerCase();

    const ts = (p.timestamp != null ? String(p.timestamp) : '');

    // Overrides de contexto (mantém assinatura KCUtils.renderPostCard(post) e prepara MVC)
    const authorPrefix = (p._kcAuthorPrefix != null && String(p._kcAuthorPrefix).trim() !== '')
      ? String(p._kcAuthorPrefix)
      : 'Anunciado por';

    let ctaText = (p._kcCtaText != null && String(p._kcCtaText).trim() !== '')
      ? String(p._kcCtaText)
      : 'Ver Mais';

    // V8.1.3.1.4: garante CTA curto e consistente (desktop + mobile)
    ctaText = 'Ver Mais';

    const compactComments = true; // V8.1.2.4.5: padrão obrigatório (ícone + número)

    // Badge (opcional)
    const badgeHtml = (p._kcBadgeText)
      ? `<span class="kc-cashback-badge"${p._kcBadgeStyle ? ` style="${escapeHtml(String(p._kcBadgeStyle))}"` : ''}>
          <i class="${escapeHtml(String(p._kcBadgeIconClass || 'fas fa-tag'))}"></i>
          ${escapeHtml(String(p._kcBadgeText))}
        </span>`
      : '';

    // Badges (pills) — alinhados ao padrão do product (módulo/condição/tempo)
    const badges = [];

    // Módulo
    if (p.modulo) {
      const modLabel = getModuleLabel(p.modulo);
      const modIcon = getModuleIconClass(p.modulo);
      badges.push(`<span class="kc-badge"><i class="${escapeHtml(modIcon)}"></i> ${escapeHtml(modLabel)}</span>`);
    }

    // Status (Achados/Perdidos)
    if (p._kcStatusBadgeHtml) badges.push(p._kcStatusBadgeHtml);

    // Condição (Compra e Venda)
    if (p.condicao) {
      badges.push(`<span class="kc-badge"><i class="fas fa-star"></i> ${escapeHtml(String(p.condicao))}</span>`);
    }

    // Tempo relativo (único lugar no card)
    const relTime = p._kcRelativeTime || p.timestamp;
    if (relTime) {
      badges.push(`<span class="kc-badge"><i class="fas fa-clock"></i> ${escapeHtml(String(relTime))}</span>`);
    }

    const topBadgesHtml = badges.length
      ? `<div class="kc-card__badges">${badges.join(' ')}</div>`
      : '';

    // Category line (com marcador de verificação quando aplicável)
    const segments = Array.isArray(p._kcCategorySegments) ? p._kcCategorySegments : [];
    let categoryLineHtml = segments.map(s => escapeHtml(String(s))).join(' • ');
    if (p._kcVerifiedTag) {
      categoryLineHtml = `${categoryLineHtml}${categoryLineHtml ? ' • ' : ''}<a href="#">${escapeHtml(String(p._kcVerifiedTag))}</a> <i class="fas fa-check-circle"></i>`;
    }

    // Imagem (quando existir), senão emoji (mantém Offline First)
    const images = Array.isArray(p.imagens) ? p.imagens : (Array.isArray(p.images) ? p.images : []);
    const imgSrc = images.length ? String(images[0]) : '';
    const imageWrapperHtml = imgSrc
      ? `<div class="kc-card__image-wrapper">
           <img alt="${escapeHtml(String(p.titulo || 'Imagem'))}" src="${escapeHtml(imgSrc)}" width="400" height="300" loading="lazy" decoding="async"/>
         </div>`
      : `<div class="kc-card__image-wrapper" style="font-size: 3em; display: flex; align-items: center; justify-content: center;">
           ${escapeHtml(String(emoji))}
         </div>`;

    // Preço (com suporte a <small>)
    let priceHtml = '';
    const priceIconClass = (p._kcPriceIconClass != null && String(p._kcPriceIconClass).trim() !== '')
      ? String(p._kcPriceIconClass)
      : 'fas fa-money-bill-wave';

    const priceStyle = (p._kcPriceStyle != null && String(p._kcPriceStyle).trim() !== '')
      ? String(p._kcPriceStyle)
      : '';

    const styleAttr = priceStyle ? ` style="${escapeHtml(priceStyle)}"` : '';
    const mainPriceText = String(p._kcPriceTextMain || '').trim();
    const smallPriceText = String(p._kcPriceTextSmall || '').trim();
    const shouldShowPrice = !p._kcHidePrice && (mainPriceText || smallPriceText);

    if (shouldShowPrice) {
      priceHtml = `
        <div class="kc-card__price"${styleAttr}>
          <i class="${escapeHtml(priceIconClass)}"></i>
          ${escapeHtml(mainPriceText)}
          ${smallPriceText ? `<small>${escapeHtml(smallPriceText)}</small>` : ''}
        </div>
      `.trim();
    }

    const housingInfo = (moduleKey === 'moradia' && p._kcHousingInfo && typeof p._kcHousingInfo === 'object')
      ? p._kcHousingInfo
      : null;
    const markerTagsHtml = renderMarkerTags(getDisplayMarkerTags(p, { limit: 3 }), {
      containerClass: 'kc-card__tag-row kc-card__tag-row--markers',
      itemClass: 'kc-card__tag',
    });

    // Descrição (preview)
    const rawDesc = String(p.descricao || '').trim();
    const preview = rawDesc.length > 140 ? (rawDesc.slice(0, 140).trim() + '...') : rawDesc;

    // Autor (via authorId)
    const authorId = p.authorId || null;
    const author = (window.KCAPI && typeof window.KCAPI.getAuthorById === 'function')
      ? window.KCAPI.getAuthorById(authorId)
      : null;

    // Compatibilidade: KCAPI pode expor {displayName, avatarUrl} (legado) OU {name, avatar} (novo)
    const authorName = (author && (author.name || author.displayName))
      ? (author.name || author.displayName)
      : (p._legacyAuthorName || p.autor || p.author || 'Autor');

    const authorAvatar = (author && (author.avatar || author.avatarUrl))
      ? (author.avatar || author.avatarUrl)
      : (p._legacyAuthorAvatar || p.autorAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=kc');

    const rating = (p.rating != null && p.rating !== '') ? Number(p.rating) : null;
    const ratingHtml = Number.isFinite(rating)
      ? `<i class="fas fa-star"></i> ${escapeHtml(rating.toFixed(1))}`
      : '';

    // Interações
    const votos = (p.votos != null && p.votos !== '') ? Number(p.votos) : 0;
    const comentarios = (p.comentarios != null && p.comentarios !== '') ? Number(p.comentarios) : 0;

    const commentsFullLabel = `${Number.isFinite(comentarios) ? comentarios : 0} comentários`;
    const commentsShown = String(Number.isFinite(comentarios) ? comentarios : 0);
    const commentsAria = ` aria-label="${escapeHtml(commentsFullLabel)}"`;

    // Atributos para filtros/compatibilidade
    const attrs = [];
    attrs.push(`class="kc-card${badgeHtml ? " kc-card--has-corner-badge" : ""}"`);
    if (id) attrs.push(`data-post-id="${escapeHtml(id)}"`);
    attrs.push(`data-verified="${escapeHtml(String(!!p.verificado))}"`);
    if (moduleKey) attrs.push(`data-module="${escapeHtml(String(moduleKey))}"`);

    // Marcação de post do usuário (evita duplicação de injeção pelo kc-core.js)
    if (p._kcUserPost === true) attrs.push('data-kc-user-post="true"');

    if (p.condicao) {
      const raw = String(p.condicao).toLowerCase();
      const norm = raw.includes('semi') ? 'seminovo' : (raw.includes('novo') ? 'novo' : raw.replace(/\s+/g, ''));
      attrs.push(`data-condition="${escapeHtml(norm)}"`);
    }

    // data-category: preferir chave (categoriaKey) para filtros; label fica no texto
    const dataCategory = (p._kcTabCategoryKey || p.categoriaKey || p.categoria || '');
    if (dataCategory) attrs.push(`data-category="${escapeHtml(String(dataCategory))}"`);

    // data-subcategory (novo): usado por filtros de compra-venda e afins
    const dataSub = (p.subcategoriaKey || p.subcategoria || '');
    if (dataSub) attrs.push(`data-subcategory="${escapeHtml(String(dataSub))}"`);

    // data-kc-tags: preferir tagKeys para filtros
    const tagKeysRaw = Array.isArray(p.tagKeys) ? p.tagKeys : (Array.isArray(p.tags) ? p.tags : []);
    const tagKeys = tagKeysRaw.map(String);
    // garantir que a categoria principal participe do filtro por tabs
    if (p.categoriaKey && !tagKeys.includes(String(p.categoriaKey))) tagKeys.push(String(p.categoriaKey));
    if (tagKeys.length) attrs.push(`data-kc-tags="${escapeHtml(tagKeys.join(' '))}"`);
    if (housingInfo && housingInfo.typeKey) attrs.push(`data-kc-housing-type="${escapeHtml(String(housingInfo.typeKey))}"`);
    if (housingInfo && housingInfo.region && housingInfo.region.key) attrs.push(`data-kc-housing-region="${escapeHtml(String(housingInfo.region.key))}"`);
    if (housingInfo && housingInfo.region && housingInfo.region.zoneKey) attrs.push(`data-kc-housing-zone="${escapeHtml(String(housingInfo.region.zoneKey))}"`);
    if (housingInfo && Array.isArray(housingInfo.features) && housingInfo.features.length) {
      attrs.push(`data-kc-housing-features="${escapeHtml(housingInfo.features.map((feature) => String(feature && feature.key || '')).filter(Boolean).join(' '))}"`);
    }

    const votePostId = String(id);
    const votePostUuid = (p && p.uuid) ? String(p.uuid) : '';
    const voteUuidAttr = votePostUuid ? ` data-post-uuid="${encodeURIComponent(votePostUuid)}"` : '';

    return `
      <article ${attrs.join(' ')}>
        <div class="kc-card__main">
          ${badgeHtml}
          ${imageWrapperHtml}
          <div class="kc-card__content">
            <div class="kc-card__header">
              <div class="kc-card__category-source">
                ${categoryLineHtml}
              </div>
            </div>
            <a class="kc-card__title" href="product.html?id=${encodeURIComponent(id)}">
              ${escapeHtml(String(p.titulo || ''))}
            </a>
            ${topBadgesHtml}
            ${priceHtml ? priceHtml : ''}
            ${markerTagsHtml}
            <div class="kc-card__description-preview">
              ${escapeHtml(preview)}
            </div>
            <div class="kc-card__author">
              <img alt="${escapeHtml(String(authorName).split(' ')[0] || 'Autor')}" src="${escapeHtml(authorAvatar)}"/>
              <span>${escapeHtml(authorPrefix)} <strong>${escapeHtml(String(authorName))}</strong></span>
              ${ratingHtml}
            </div>
          </div>
        </div>
        <div class="kc-card__footer">
          <div class="kc-card__interactions">
            <div class="kc-vote-box" data-kc-vote-box="true">
              <button class="hot" data-action="vote-hot" data-post-id="${encodeURIComponent(votePostId)}" data-post-legacy-id="${encodeURIComponent(String(id))}"${voteUuidAttr}>
                <i class="fas fa-fire"></i>
              </button>
              <span class="kc-vote-score" data-kc-vote-score="true" aria-live="polite">${escapeHtml(String(Number.isFinite(votos) ? votos : 0))}</span>
              <button class="cold" data-action="vote-cold" data-post-id="${encodeURIComponent(votePostId)}" data-post-legacy-id="${encodeURIComponent(String(id))}"${voteUuidAttr}>
                <i class="fas fa-snowflake"></i>
              </button>
            </div>
            <a class="kc-comment-link" href="product.html?id=${encodeURIComponent(id)}#comments"${commentsAria}>
              <i class="fas fa-comment"></i>
              <span>${escapeHtml(String(commentsShown))}</span>
            </a>
          </div>
          <div class="kc-card__actions">

            <button type="button" class="kc-share-whatsapp" data-share-url="product.html?id=${encodeURIComponent(id)}" data-share-title="${escapeHtml(String(p.titulo || ""))}" aria-label="Compartilhar no WhatsApp">
            <svg viewBox="0 0 448 512" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
            </svg>
          </button>

            <a class="kc-action-button kc-get-coupon-button" href="product.html?id=${encodeURIComponent(id)}">
            ${escapeHtml(ctaText)}
          </a>

          </div>
        </div>
      </article>
    `.trim();
  }

window.KCUtils = Object.freeze({
    escapeHtml,
    normalizeText,
    normalizeEmail,
    getEmailDomain,
    normalizeAllowedDomains,
    isInstitutionalEmailAllowed,
    canonicalCategory,
    slugifyText,
    buildPublicHandle,
    titleCase,
    beautifyKey,
    getModuleLabel,
    getModuleIconClass,
    getCategoryLabel,
    getSubcategoryLabel,
    getConditionLabel,
    getOpportunityAreaDefinitions,
    getOpportunityAreaInfoByKey,
    getHousingRegionDefinitions,
    getHousingRegionInfoByKey,
    getLostFoundLocationDefinitions,
    getLostFoundLocationInfoByKey,
    getHousingFeatureDefinitions,
    getHousingFeatureInfoByKey,
    getDisplayMarkerTags,
    resolveOpportunityArea,
    resolveHousingRegion,
    resolveLostFoundLocation,
    resolveHousingFeatures,
    resolveHousingTypeKey,
    clamp,
    debounce,
    splitPriceText,
    applyPresentationRules,
    renderPostCard,
    timeAgo,
  });

})();
