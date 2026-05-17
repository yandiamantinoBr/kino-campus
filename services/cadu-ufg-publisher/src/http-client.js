'use strict';

const DEFAULT_TIMEOUT_MS = 20000;

class HttpClient {
  constructor(options = {}) {
    this.userAgent = options.userAgent || 'CaduKinoCampusBot/1.0 (+contato@kinocampus.com.br)';
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    this.minDelayMs = Number(options.minDelayMs || 900);
    this.lastRequestByHost = new Map();
  }

  async waitForHost(url) {
    const host = new URL(url).host;
    const last = this.lastRequestByHost.get(host) || 0;
    const elapsed = Date.now() - last;
    if (elapsed < this.minDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minDelayMs - elapsed));
    }
    this.lastRequestByHost.set(host, Date.now());
  }

  async fetch(url, options = {}) {
    await this.waitForHost(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'user-agent': this.userAgent,
          accept: options.accept || '*/*',
          ...(options.headers || {}),
        },
        body: options.body,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async text(url, options = {}) {
    const response = await this.fetch(url, { ...options, accept: options.accept || 'text/html,application/xml,text/xml,*/*' });
    const text = await response.text();
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status} for ${url}`);
      err.status = response.status;
      err.body = text.slice(0, 400);
      throw err;
    }
    return { text, response };
  }

  async json(url, options = {}) {
    const response = await this.fetch(url, { ...options, accept: 'application/json,*/*' });
    const text = await response.text();
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status} for ${url}`);
      err.status = response.status;
      err.body = text.slice(0, 400);
      throw err;
    }
    return { data: JSON.parse(text), response };
  }
}

module.exports = {
  HttpClient,
};
