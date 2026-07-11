'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalizeUrl, slugify } = require('./utils');

const DEFAULT_SOURCE_PATH = path.resolve(__dirname, '../config/sources.json');

function loadSources(sourcePath = DEFAULT_SOURCE_PATH) {
  const content = fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');
  const raw = JSON.parse(content);
  if (!raw || !Array.isArray(raw.sources)) {
    throw new TypeError(`Invalid Cadu source registry: expected sources[] in ${sourcePath}`);
  }

  return raw.sources.map((source) => {
    const baseUrl = canonicalizeUrl(source.baseUrl);
    return {
      id: source.id || slugify(source.name || baseUrl),
      name: source.name || source.id,
      baseUrl,
      tier: Number(source.tier || 3),
      quick: Boolean(source.quick),
      enabled: source.enabled !== false && Boolean(baseUrl),
      type: source.type || 'weby',
      defaultModule: source.defaultModule || 'eventos',
      defaultCategory: source.defaultCategory || 'academicos',
      allowPatterns: source.allowPatterns || [],
      blockPatterns: source.blockPatterns || [],
    };
  });
}

function selectSources(sources, mode, selectedIds = []) {
  const selected = new Set(selectedIds.filter(Boolean));
  return sources.filter((source) => {
    if (!source.enabled) return false;
    if (selected.size) return selected.has(source.id);
    if (mode === 'quick') return source.quick;
    return true;
  });
}

module.exports = {
  DEFAULT_SOURCE_PATH,
  loadSources,
  selectSources,
};
