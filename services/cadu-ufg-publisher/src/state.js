'use strict';

const fs = require('fs');
const path = require('path');
const { safeJsonParse } = require('./utils');

class StateStore {
  constructor(filePath) {
    this.filePath = filePath || path.resolve(__dirname, '../data/state.json');
    this.data = { seen: {}, runs: [] };
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      this.data = safeJsonParse(fs.readFileSync(this.filePath, 'utf8'), this.data) || this.data;
    }
    return this;
  }

  has(key) {
    return Boolean(this.data.seen[key]);
  }

  mark(key, value) {
    this.data.seen[key] = {
      ...(this.data.seen[key] || {}),
      ...value,
      updatedAt: new Date().toISOString(),
    };
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
