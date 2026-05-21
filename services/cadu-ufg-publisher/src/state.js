'use strict';

const fs = require('fs');
const path = require('path');
const { safeJsonParse } = require('./utils');

class StateStore {
  constructor(filePath) {
    this.filePath = filePath || path.resolve(__dirname, '../data/state.json');
    this.data = { seen: {}, aliases: {}, runs: [] };
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      this.data = safeJsonParse(fs.readFileSync(this.filePath, 'utf8'), this.data) || this.data;
    }
    this.data.seen = (this.data.seen && typeof this.data.seen === 'object') ? this.data.seen : {};
    this.data.aliases = (this.data.aliases && typeof this.data.aliases === 'object') ? this.data.aliases : {};
    this.data.runs = Array.isArray(this.data.runs) ? this.data.runs : [];
    return this;
  }

  resolveKey(key) {
    const text = String(key || '').trim();
    if (!text) return '';
    return this.data.aliases[text] || text;
  }

  has(key) {
    const resolved = this.resolveKey(key);
    const entry = this.data.seen[resolved];
    if (!entry) return false;
    return !(typeof entry.decision === 'string' && entry.decision.startsWith('dry-run'));
  }

  hasAny(keys) {
    return (Array.isArray(keys) ? keys : [keys]).some((key) => this.has(key));
  }

  mark(key, value, aliases = []) {
    const primary = String(key || '').trim();
    if (!primary) return;
    const allAliases = Array.from(new Set((Array.isArray(aliases) ? aliases : [aliases]).map((alias) => String(alias || '').trim()).filter(Boolean)));
    this.data.seen[primary] = {
      ...(this.data.seen[primary] || {}),
      ...value,
      aliases: allAliases,
      updatedAt: new Date().toISOString(),
    };
    allAliases.forEach((alias) => {
      if (alias && alias !== primary) this.data.aliases[alias] = primary;
    });
  }

  addRun(run) {
    this.data.runs.unshift(run);
    this.data.runs = this.data.runs.slice(0, 50);
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
  }
}

module.exports = {
  StateStore,
};
