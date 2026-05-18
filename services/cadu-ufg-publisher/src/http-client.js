'use strict';

const DEFAULT_TIMEOUT_MS = 20000;

class HttpClient {
  constructor(options = {}) {
    this.userAgent = options.userAgent || 'CaduKinoCampusBot/1.0 (+contato@kinocampus.com.br)';
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    this.minDelayMs = Number(options.minDelayMs || 900);
    this.fetchProxyTemplate = String(options.fetchProxyTemplate || '').trim();
    this.hostAliases = options.hostAliases && typeof options.hostAliases === 'object' ? options.hostAliases : {};
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

  buildProxyUrl(url) {
    if (!this.fetchProxyTemplate) return '';
    const raw = String(url || '');
    return this.fetchProxyTemplate
      .replace(/\{rawUrl\}/g, raw)
      .replace(/\{url\}/g, encodeURIComponent(raw));
  }

  buildAliasUrl(url) {
    let original;
    try {
      original = new URL(url);
    } catch (_) {
      return '';
    }
    const alias = this.hostAliases[original.host] || this.hostAliases[original.hostname];
    if (!alias) return '';
    try {
      const aliasUrl = new URL(/^https?:\/\//i.test(alias) ? alias : `${original.protocol}//${alias}`);
      original.protocol = aliasUrl.protocol;
      original.host = aliasUrl.host;
      return original.toString();
    } catch (_) {
      return '';
    }
  }

  async fetchDirect(url, options = {}) {
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

  async fetch(url, options = {}) {
    try {
      return await this.fetchDirect(url, options);
    } catch (error) {
      const aliasUrl = this.buildAliasUrl(url);
      if (aliasUrl && aliasUrl !== url) {
        try {
          const response = await this.fetchDirect(aliasUrl, options);
          response.caduResolvedUrl = aliasUrl;
          return response;
        } catch (_) {
          // Proxy fallback below still gets a chance.
        }
      }

      const proxyUrl = this.buildProxyUrl(url);
      if (proxyUrl) {
        const response = await this.fetchDirect(proxyUrl, options);
        response.caduResolvedUrl = proxyUrl;
        return response;
      }

      throw error;
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
