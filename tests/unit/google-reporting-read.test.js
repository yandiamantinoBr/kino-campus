'use strict';

const crypto = require('crypto');
const Reporting = require('../../scripts/google-reporting-read.js');

describe('google-reporting-read', () => {
  test('accepts a bounded, explicit reporting request', () => {
    expect(Reporting.parseArgs([
      '--json', '--start', '2026-07-20', '--end', '2026-08-19', '--limit', '500',
    ])).toEqual(expect.objectContaining({
      json: true,
      start: '2026-07-20',
      end: '2026-08-19',
      limit: 500,
    }));
    expect(Reporting.parseArgs(['--service', 'ga4']).service).toBe('ga4');
  });

  test('rejects incomplete or unsafe reporting arguments', () => {
    expect(() => Reporting.parseArgs(['--start', '2026-08-01'])).toThrow('--start e --end');
    expect(() => Reporting.parseArgs(['--limit', '10001'])).toThrow('--limit deve estar entre');
    expect(() => Reporting.parseArgs(['--search-console-site', 'http://kinocampus.com.br'])).toThrow('search-console-site');
    expect(() => Reporting.parseArgs(['--service', 'all-access'])).toThrow('--service');
  });

  test('creates a verifiable service-account assertion without exposing the key', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const assertion = Reporting.createAssertion({
      clientEmail: 'reporting@project.iam.gserviceaccount.com',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }, 'scope-a scope-b', 1_700_000_000);
    const [header, claims, signature] = assertion.split('.');
    const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toEqual(expect.objectContaining({
      iss: 'reporting@project.iam.gserviceaccount.com',
      scope: 'scope-a scope-b',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    }));
    expect(signature.length).toBeGreaterThan(100);
  });

  test('summarizes reports without emitting query or landing-page values', () => {
    const summary = Reporting.summarizeReport({
      fetchedAt: '2026-08-20T00:00:00.000Z',
      range: { startDate: '2026-07-20', endDate: '2026-08-16' },
      ga4: {
        overview: { rows: [{ metricValues: [{ value: '1' }, { value: '2' }, { value: '3' }, { value: '4' }] }] },
        events: { rows: [{ dimensionValues: [{ value: 'kc_search' }] }] },
        landingPages: { rows: [{ dimensionValues: [{ value: '/product.html?id=private' }] }] },
      },
      searchConsole: {
        pages: { rows: [{ keys: ['https://www.kinocampus.com.br/'] }] },
        queries: { rows: [{ keys: ['texto potencialmente sensível'] }] },
        daily: { rows: [{ keys: ['2026-08-16'] }] },
      },
      limits: { ga4: 'aggregate', searchConsole: 'top rows' },
      errors: {},
    });
    expect(summary).toEqual(expect.objectContaining({
      ga4: expect.objectContaining({ activeUsers: '1', landingPageRows: 1 }),
      searchConsole: expect.objectContaining({ pageRows: 1, queryRows: 1 }),
    }));
    expect(JSON.stringify(summary)).not.toContain('potencialmente sensível');
    expect(JSON.stringify(summary)).not.toContain('private');
  });

  test('reports GA4 and Search Console connectivity independently', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const calls = [];
    const mockFetch = async (url) => {
      calls.push(url);
      if (url === 'https://oauth2.googleapis.com/token') {
        return { ok: true, status: 200, json: async () => ({ access_token: 'redacted-test-token' }) };
      }
      if (url.endsWith('/sites')) {
        return { ok: true, status: 200, json: async () => ({ siteEntry: [] }) };
      }
      return { ok: true, status: 200, json: async () => ({ rows: [] }) };
    };
    const result = await Reporting.checkConnection({
      account: {
        clientEmail: 'reporting@project.iam.gserviceaccount.com',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      },
      options: Reporting.parseArgs(['--check']),
    }, mockFetch);
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      ga4: { ok: true },
      searchConsole: expect.objectContaining({ ok: false, error: 'A credencial Google não tem acesso à propriedade configurada do Search Console' }),
    }));
    expect(JSON.stringify(result)).not.toContain('redacted-test-token');
    expect(calls).toHaveLength(4);
  });
});
