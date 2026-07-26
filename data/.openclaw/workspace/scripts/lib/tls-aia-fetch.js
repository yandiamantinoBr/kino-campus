#!/usr/bin/env node
'use strict';

/**
 * TLS AIA recovery for hosts that omit intermediate certificates (curl exit 60 /
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE). Content is always fetched with full
 * certificate verification — rejectUnauthorized is only used to read the peer
 * leaf so we can follow the CA Issuers URI from the AIA extension.
 *
 * CLI: node tls-aia-fetch.js <https-url>
 * stdout: JSON { ok, body, httpStatus, effectiveUrl, diagnostic }
 */

const http = require('http');
const https = require('https');
const tls = require('tls');
const { X509Certificate } = require('crypto');

const DEFAULT_UA = 'Mozilla/5.0 (compatible; CADU-Curator/4.4; +https://kinocampus.com.br)';
const intermediateCache = new Map();

function safeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function fail(kind, url, extra = {}) {
  return {
    ok: false,
    body: '',
    httpStatus: 0,
    effectiveUrl: '',
    diagnostic: {
      url: safeUrl(url),
      effectiveUrl: '',
      kind,
      retryable: false,
      httpStatus: null,
      curlExitCode: null,
      ...extra,
    },
  };
}

function parseCaIssuerUris(infoAccess) {
  return [...String(infoAccess || '').matchAll(/CA\s*Issuers\s*-\s*URI:(\S+)/gi)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

function bufferToPem(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
  if (text.includes('BEGIN CERTIFICATE')) return text.trim() + '\n';
  const b64 = Buffer.from(buf).toString('base64').match(/.{1,64}/g);
  if (!b64 || b64.length === 0) throw new Error('empty_certificate_body');
  return `-----BEGIN CERTIFICATE-----\n${b64.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function requestBufferOnce(url, {
  timeoutMs = 10000,
  ca = undefined,
  rejectUnauthorized = true,
  headers = {},
  maxRedirects = 3,
} = {}, redirectsLeft = maxRedirects) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error);
      return;
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const options = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
        ...headers,
      },
      timeout: timeoutMs,
    };
    if (parsed.protocol === 'https:') {
      options.servername = parsed.hostname;
      options.rejectUnauthorized = rejectUnauthorized;
      if (ca) options.ca = ca;
    }

    const req = lib.request(options, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        requestBufferOnce(next, {
          timeoutMs,
          ca,
          rejectUnauthorized,
          headers,
          maxRedirects,
        }, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status,
          body: Buffer.concat(chunks),
          effectiveUrl: url,
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('request_timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function requestBuffer(url, options = {}) {
  const attempts = Number.isInteger(options.attempts) ? options.attempts : 3;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await requestBufferOnce(url, options);
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || error);
      const retryable = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|request_timeout|socket hang up/i.test(msg);
      if (!retryable || attempt === attempts) break;
      await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    }
  }
  throw lastError;
}

function readPeerCertificate(hostname, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      // Read-only peer inspection for AIA. Content fetch always verifies.
      rejectUnauthorized: false,
    }, () => {
      try {
        const peer = sock.getPeerCertificate(true);
        if (!peer || !peer.raw) {
          sock.destroy();
          reject(new Error('no_peer_certificate'));
          return;
        }
        const x509 = new X509Certificate(peer.raw);
        const info = {
          pem: x509.toString(),
          infoAccess: x509.infoAccess || '',
          subject: x509.subject,
          issuer: x509.issuer,
        };
        sock.end();
        resolve(info);
      } catch (error) {
        sock.destroy();
        reject(error);
      }
    });
    sock.setTimeout(timeoutMs, () => {
      sock.destroy(new Error('peer_certificate_timeout'));
    });
    sock.on('error', reject);
  });
}

async function resolveIntermediatePems(infoAccess, timeoutMs = 10000) {
  const uris = parseCaIssuerUris(infoAccess);
  const pems = [];
  for (const uri of uris) {
    if (intermediateCache.has(uri)) {
      pems.push(intermediateCache.get(uri));
      continue;
    }
    // AIA CA Issuers are commonly served over plain HTTP; the cert is signed.
    const response = await requestBuffer(uri, {
      timeoutMs,
      rejectUnauthorized: true,
    });
    if (response.status < 200 || response.status >= 300 || !response.body.length) {
      throw new Error(`aia_download_failed:${response.status}`);
    }
    const pem = bufferToPem(response.body);
    // Validate PEM before caching.
    // eslint-disable-next-line no-new
    new X509Certificate(pem);
    intermediateCache.set(uri, pem);
    pems.push(pem);
  }
  return pems;
}

async function fetchUrlWithAiaRecovery(url, { timeoutMs = 15000 } = {}) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch (_) {
    return fail('invalid_url', url);
  }
  if (parsed.protocol !== 'https:') {
    return fail('aia_https_only', url);
  }

  let peer;
  try {
    peer = await readPeerCertificate(parsed.hostname, Math.min(timeoutMs, 8000));
  } catch (error) {
    return fail('tls_aia_peer_read_failed', url, {
      message: String(error?.message || error).slice(0, 160),
    });
  }

  let intermediates;
  try {
    intermediates = await resolveIntermediatePems(peer.infoAccess, Math.min(timeoutMs, 10000));
  } catch (error) {
    return fail('tls_aia_intermediate_failed', url, {
      message: String(error?.message || error).slice(0, 160),
    });
  }
  if (!intermediates.length) {
    return fail('tls_aia_no_issuer_uri', url);
  }

  const ca = [...tls.rootCertificates, ...intermediates];
  try {
    const response = await requestBuffer(url, {
      timeoutMs,
      ca,
      rejectUnauthorized: true,
      headers: {
        Accept: 'application/json,text/html,*/*;q=0.8',
      },
    });
    const body = response.body.toString('utf8');
    if (response.status >= 200 && response.status < 400 && body.trim()) {
      return {
        ok: true,
        body,
        httpStatus: response.status,
        effectiveUrl: response.effectiveUrl || url,
        diagnostic: {
          url: safeUrl(url),
          effectiveUrl: safeUrl(response.effectiveUrl || url),
          kind: 'tls_aia_recovered',
          retryable: false,
          httpStatus: response.status,
          curlExitCode: null,
          intermediateCount: intermediates.length,
        },
      };
    }
    return {
      ok: false,
      body: '',
      httpStatus: response.status,
      effectiveUrl: response.effectiveUrl || url,
      diagnostic: {
        url: safeUrl(url),
        effectiveUrl: safeUrl(response.effectiveUrl || url),
        kind: response.status >= 400 ? `http_${response.status}` : 'empty_body',
        retryable: response.status >= 500 || response.status === 0,
        httpStatus: response.status || null,
        curlExitCode: null,
        intermediateCount: intermediates.length,
      },
    };
  } catch (error) {
    return fail('tls_aia_fetch_failed', url, {
      message: String(error?.message || error).slice(0, 160),
    });
  }
}

function clearIntermediateCacheForTests() {
  intermediateCache.clear();
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    process.stdout.write(JSON.stringify(fail('missing_url', '')));
    process.exit(2);
  }
  fetchUrlWithAiaRecovery(target)
    .then((result) => {
      process.stdout.write(JSON.stringify(result));
      process.exit(result.ok ? 0 : 2);
    })
    .catch((error) => {
      process.stdout.write(JSON.stringify(fail('tls_aia_unhandled', target, {
        message: String(error?.message || error).slice(0, 160),
      })));
      process.exit(3);
    });
}

module.exports = {
  DEFAULT_UA,
  bufferToPem,
  clearIntermediateCacheForTests,
  fetchUrlWithAiaRecovery,
  parseCaIssuerUris,
  readPeerCertificate,
  resolveIntermediatePems,
  safeUrl,
};
