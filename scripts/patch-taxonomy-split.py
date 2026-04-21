# -*- coding: utf-8 -*-
"""
v12.2.4 — substitui os 22 corpos de função do domínio taxonomy
em kc-utils.js por thin delegation wrappers para _KCU.taxonomy.
"""

import sys

path = r'C:\Users\yan1n\Documents\GitHub\kino-campus\assets\js\kc-utils.js'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

replacements = []

# 1. KC_CONSTANTS destructuring
replacements.append((
    """  const {
    MODULE_LABEL_MAP,
    MODULE_ICON_MAP,
    CATEGORY_LABELS,
    SUBCATEGORY_LABELS,
    OPPORTUNITY_AREA_DEFINITIONS,
    HOUSING_REGION_DEFINITIONS,
    HOUSING_FEATURE_DEFINITIONS,
    LOST_FOUND_LOCATION_DEFINITIONS
  } = (window.KC_CONSTANTS || {});""",
    """  // Constantes de taxonomia movidas para kc-utils.taxonomy.js (v12.2.4)
  const {
    HOUSING_REGION_DEFINITIONS,
    HOUSING_FEATURE_DEFINITIONS,
    LOST_FOUND_LOCATION_DEFINITIONS
  } = (window.KC_CONSTANTS || {});"""
))

# 2. getModuleLabel
replacements.append((
    """  function getModuleLabel(moduleKey) {
    const key = normalizeText(moduleKey);
    return MODULE_LABEL_MAP[key] || beautifyKey(key) || String(moduleKey || '');
  }""",
    """  // Delegacao -> window._KCU.taxonomy.getModuleLabel (kc-utils.taxonomy.js)
  function getModuleLabel(moduleKey) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getModuleLabel(moduleKey) : String(moduleKey || '');
  }"""
))

# 3. getModuleIconClass
replacements.append((
    """  function getModuleIconClass(moduleKey) {
    const key = normalizeText(moduleKey);
    return MODULE_ICON_MAP[key] || 'fas fa-layer-group';
  }""",
    """  // Delegacao -> window._KCU.taxonomy.getModuleIconClass (kc-utils.taxonomy.js)
  function getModuleIconClass(moduleKey) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getModuleIconClass(moduleKey) : 'fas fa-layer-group';
  }"""
))

# 4. getCategoryLabel
replacements.append((
    """  function getCategoryLabel(moduleKey, catKey) {
    const m = normalizeText(moduleKey);
    const c = normalizeText(catKey);
    const map = CATEGORY_LABELS[m];
    if (map && map[c]) return map[c];
    return beautifyKey(c) || String(catKey || '');
  }""",
    """  // Delegacao -> window._KCU.taxonomy.getCategoryLabel (kc-utils.taxonomy.js)
  function getCategoryLabel(moduleKey, catKey) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getCategoryLabel(moduleKey, catKey) : String(catKey || '');
  }"""
))

# 5. getSubcategoryLabel
replacements.append((
    """  function getSubcategoryLabel(moduleKey, subKey) {
    const m = normalizeText(moduleKey);
    const s = normalizeText(subKey);
    const map = SUBCATEGORY_LABELS[m];
    if (map && map[s]) return map[s];
    return beautifyKey(s) || String(subKey || '');
  }""",
    """  // Delegacao -> window._KCU.taxonomy.getSubcategoryLabel (kc-utils.taxonomy.js)
  function getSubcategoryLabel(moduleKey, subKey) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getSubcategoryLabel(moduleKey, subKey) : String(subKey || '');
  }"""
))

# 6. getOpportunityAreaDefinitions
replacements.append((
    """  function getOpportunityAreaDefinitions() {
    return OPPORTUNITY_AREA_DEFINITIONS.map((entry) => ({
      ...entry,
      emoji: entry.emoji || getOpportunityAreaEmoji(entry.key),
    }));
  }""",
    """  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaDefinitions (kc-utils.taxonomy.js)
  function getOpportunityAreaDefinitions() {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaDefinitions() : [];
  }"""
))

# 7. buildOpportunityTextParts
replacements.append((
    """  function buildOpportunityTextParts(source, fallbackTags) {
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
  }""",
    """  // Delegacao -> window._KCU.taxonomy.buildOpportunityTextParts (kc-utils.taxonomy.js)
  function buildOpportunityTextParts(source, fallbackTags) {
    return (window._KCU && window._KCU.taxonomy)
      ? window._KCU.taxonomy.buildOpportunityTextParts(source, fallbackTags)
      : { explicit: source ? [source] : [], text: [], tags: [] };
  }"""
))

# 8. getOpportunityAreaInfoByKey
replacements.append((
    """  function getOpportunityAreaInfoByKey(key) {
    const wanted = slugifyText(key);
    if (!wanted) return null;
    const entry = OPPORTUNITY_AREA_DEFINITIONS.find((item) => item.key === wanted);
    return entry ? { ...entry, emoji: entry.emoji || getOpportunityAreaEmoji(entry.key) } : null;
  }""",
    """  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaInfoByKey (kc-utils.taxonomy.js)
  function getOpportunityAreaInfoByKey(key) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaInfoByKey(key) : null;
  }"""
))

# 9. firstNonEmptyValue
replacements.append((
    """  function firstNonEmptyValue(values) {
    if (!Array.isArray(values)) return '';
    for (let i = 0; i < values.length; i += 1) {
      const value = String(values[i] || '').trim();
      if (value) return value;
    }
    return '';
  }""",
    """  // Delegacao -> window._KCU.taxonomy.firstNonEmptyValue (kc-utils.taxonomy.js)
  function firstNonEmptyValue(values) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.firstNonEmptyValue(values) : '';
  }"""
))

# 10. formatOpportunityAreaLabel
replacements.append((
    r"""  function formatOpportunityAreaLabel(value) {
    const raw = String(value || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    if (raw !== normalizeText(raw)) return raw;
    return titleCase(raw);
  }""",
    """  // Delegacao -> window._KCU.taxonomy.formatOpportunityAreaLabel (kc-utils.taxonomy.js)
  function formatOpportunityAreaLabel(value) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.formatOpportunityAreaLabel(value) : String(value || '');
  }"""
))

# 11. scoreOpportunityAreaLabel
replacements.append((
    """  function scoreOpportunityAreaLabel(value) {
    const label = String(value || '').trim();
    if (!label) return 0;
    let score = Math.min(label.length, 32) / 32;
    if (/[A-Z\u00C0-\u00DD]/.test(label)) score += 1.5;
    if (label.normalize('NFD') !== label) score += 2;
    if (label.includes(' ')) score += 0.5;
    return score;
  }""",
    """  // Delegacao -> window._KCU.taxonomy.scoreOpportunityAreaLabel (kc-utils.taxonomy.js)
  function scoreOpportunityAreaLabel(value) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.scoreOpportunityAreaLabel(value) : 0;
  }"""
))

# 12. pickPreferredOpportunityAreaLabel
replacements.append((
    """  function pickPreferredOpportunityAreaLabel(current, candidate) {
    const currentLabel = String(current || '').trim();
    const candidateLabel = String(candidate || '').trim();
    if (!currentLabel) return candidateLabel;
    if (!candidateLabel) return currentLabel;
    return scoreOpportunityAreaLabel(candidateLabel) > scoreOpportunityAreaLabel(currentLabel)
      ? candidateLabel
      : currentLabel;
  }""",
    """  // Delegacao -> window._KCU.taxonomy.pickPreferredOpportunityAreaLabel (kc-utils.taxonomy.js)
  function pickPreferredOpportunityAreaLabel(current, candidate) {
    return (window._KCU && window._KCU.taxonomy)
      ? window._KCU.taxonomy.pickPreferredOpportunityAreaLabel(current, candidate)
      : String(current || candidate || '');
  }"""
))

# 13. buildOfficialOpportunityAreaMaps
replacements.append((
    """  function buildOfficialOpportunityAreaMaps() {
    const aliasMap = new Map();
    OPPORTUNITY_AREA_DEFINITIONS.forEach((entry) => {
      const values = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])];
      values.forEach((value) => {
        const normalized = normalizeText(value);
        if (normalized && !aliasMap.has(normalized)) aliasMap.set(normalized, entry);
      });
    });
    return aliasMap;
  }""",
    """  // Delegacao -> window._KCU.taxonomy.buildOfficialOpportunityAreaMaps (kc-utils.taxonomy.js)
  function buildOfficialOpportunityAreaMaps() {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.buildOfficialOpportunityAreaMaps() : new Map();
  }"""
))

# 14. getOpportunityAreaFuzzyThreshold
replacements.append((
    """  function getOpportunityAreaFuzzyThreshold(source, target) {
    const maxLength = Math.max(String(source || '').length, String(target || '').length);
    if (maxLength <= 6) return 1;
    if (maxLength <= 12) return 2;
    return 3;
  }""",
    """  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaFuzzyThreshold (kc-utils.taxonomy.js)
  function getOpportunityAreaFuzzyThreshold(source, target) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaFuzzyThreshold(source, target) : 3;
  }"""
))

# 15. getOpportunityAreaSimilarityScore
replacements.append((
    """  function getOpportunityAreaSimilarityScore(source, target) {
    const left = String(source || '');
    const right = String(target || '');
    const maxLength = Math.max(left.length, right.length);
    if (!maxLength) return 0;
    const distance = levenshteinDistance(left, right);
    return 1 - (distance / maxLength);
  }""",
    """  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaSimilarityScore (kc-utils.taxonomy.js)
  function getOpportunityAreaSimilarityScore(source, target) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaSimilarityScore(source, target) : 0;
  }"""
))

# 16. isCloseOpportunityAreaAlias
replacements.append((
    """  function isCloseOpportunityAreaAlias(candidate, alias) {
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
  }""",
    """  // Delegacao -> window._KCU.taxonomy.isCloseOpportunityAreaAlias (kc-utils.taxonomy.js)
  function isCloseOpportunityAreaAlias(candidate, alias) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.isCloseOpportunityAreaAlias(candidate, alias) : false;
  }"""
))

# 17. findBestOfficialOpportunityArea
replacements.append((
    """  function findBestOfficialOpportunityArea(candidate, officialAliasMap) {
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
  }""",
    """  // Delegacao -> window._KCU.taxonomy.findBestOfficialOpportunityArea (kc-utils.taxonomy.js)
  function findBestOfficialOpportunityArea(candidate, officialAliasMap) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.findBestOfficialOpportunityArea(candidate, officialAliasMap) : null;
  }"""
))

# 18. extractOpportunityAreaHistoryEntries
replacements.append((
    """  function extractOpportunityAreaHistoryEntries(history) {
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
  }""",
    """  // Delegacao -> window._KCU.taxonomy.extractOpportunityAreaHistoryEntries (kc-utils.taxonomy.js)
  function extractOpportunityAreaHistoryEntries(history) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.extractOpportunityAreaHistoryEntries(history) : [];
  }"""
))

# 19. buildHistoryOpportunityAreaMaps
replacements.append((
    """  function buildHistoryOpportunityAreaMaps(history, officialAliasMap) {
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
  }""",
    """  // Delegacao -> window._KCU.taxonomy.buildHistoryOpportunityAreaMaps (kc-utils.taxonomy.js)
  function buildHistoryOpportunityAreaMaps(history, officialAliasMap) {
    return (window._KCU && window._KCU.taxonomy)
      ? window._KCU.taxonomy.buildHistoryOpportunityAreaMaps(history, officialAliasMap)
      : { catalog: new Map(), aliasMap: new Map() };
  }"""
))

# 20. findBestOfficialContextArea
replacements.append((
    """  function findBestOfficialContextArea(combinedText) {
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
  }""",
    """  // Delegacao -> window._KCU.taxonomy.findBestOfficialContextArea (kc-utils.taxonomy.js)
  function findBestOfficialContextArea(combinedText) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.findBestOfficialContextArea(combinedText) : null;
  }"""
))

# 21. findBestFuzzyOpportunityArea
replacements.append((
    """  function findBestFuzzyOpportunityArea(candidate, collection) {
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
  }""",
    """  // Delegacao -> window._KCU.taxonomy.findBestFuzzyOpportunityArea (kc-utils.taxonomy.js)
  function findBestFuzzyOpportunityArea(candidate, collection) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.findBestFuzzyOpportunityArea(candidate, collection) : null;
  }"""
))

# 22. resolveOpportunityArea (very long)
replacements.append((
    """  function resolveOpportunityArea(source, options = {}) {
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
  }""",
    """  // Delegacao -> window._KCU.taxonomy.resolveOpportunityArea (kc-utils.taxonomy.js)
  function resolveOpportunityArea(source, options) {
    return (window._KCU && window._KCU.taxonomy)
      ? window._KCU.taxonomy.resolveOpportunityArea(source, options)
      : { key: '', label: '', icon: 'fas fa-briefcase', isKnown: false, source: 'empty' };
  }"""
))

# 23. getOpportunityAreaEmoji  (must use raw string due to regex chars)
emoji_old = (
    "  function getOpportunityAreaEmoji(key) {\n"
    "    const wanted = slugifyText(key);\n"
    "    const map = {\n"
    "      tecnologia: '\U0001f4bb',\n"
    "      marketing: '\U0001f4e3',\n"
    "      design: '\U0001f3a8',\n"
    "      educacao: '\U0001f393',\n"
    "      musica: '\U0001f3b5',\n"
    "      administrativo: '\U0001f4cb',\n"
    "      engenharia: '\U0001f4d0',\n"
    "      saude: '\U0001f49a',\n"
    "      pesquisa: '\U0001f52c',\n"
    "    };\n"
    "    return map[wanted] || '\U0001f3f7\ufe0f';\n"
    "  }"
)
emoji_new = (
    "  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaEmoji (kc-utils.taxonomy.js)\n"
    "  function getOpportunityAreaEmoji(key) {\n"
    "    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaEmoji(key) : '\U0001f3f7\ufe0f';\n"
    "  }"
)
replacements.append((emoji_old, emoji_new))

# Apply all replacements
not_found = []
for old, new in replacements:
    if old in src:
        src = src.replace(old, new)
    else:
        not_found.append(old[:60].strip())

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

taxonomy_count = src.count('window._KCU.taxonomy')
lines = src.count('\n') + 1
print(f'Delegations to _KCU.taxonomy: {taxonomy_count}')
print(f'kc-utils.js now has {lines} lines')
print(f'Not found ({len(not_found)}):')
for nf in not_found:
    print(f'  - {nf}')
