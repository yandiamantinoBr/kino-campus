'use strict';

/**
 * Read-only local access to KinoCampus Google reporting.
 *
 * The credential is deliberately referenced through the Windows/user
 * GOOGLE_APPLICATION_CREDENTIALS environment variable. It is never copied to
 * the repository, printed, sent to Supabase, or passed as a command argument.
 *
 * Examples:
 *   npm run analytics:connection:check
 *   npm run analytics:report -- --json --start 2026-07-20 --end 2026-08-19
 */

const crypto = require('crypto');
const fs = require('fs');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const SC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const DEFAULT_GA_PROPERTY_ID = '540208497';
const DEFAULT_SEARCH_CONSOLE_SITE_URL = 'sc-domain:kinocampus.com.br';
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 10000;

function parseArgs(argv) {
  const options = {
    check: false,
    json: false,
    gaProperty: DEFAULT_GA_PROPERTY_ID,
    searchConsoleSite: DEFAULT_SEARCH_CONSOLE_SITE_URL,
    service: 'all',
    limit: DEFAULT_LIMIT,
    start: null,
    end: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${arg}`);
    if (arg === '--ga-property') options.gaProperty = value;
    else if (arg === '--search-console-site') options.searchConsoleSite = value;
    else if (arg === '--service') options.service = value;
    else if (arg === '--limit') options.limit = Number(value);
    else if (arg === '--start') options.start = value;
    else if (arg === '--end') options.end = value;
    else throw new Error(`Argumento desconhecido: ${arg}`);
    index += 1;
  }

  if (!/^\d{6,20}$/.test(options.gaProperty)) {
    throw new Error('--ga-property deve ser numérico');
  }
  if (!['all', 'ga4', 'search-console'].includes(options.service)) {
    throw new Error('--service deve ser all, ga4 ou search-console');
  }
  if (!isSearchConsoleSite(options.searchConsoleSite)) {
    throw new Error('--search-console-site deve ser uma propriedade sc-domain ou URL HTTPS');
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_LIMIT) {
    throw new Error(`--limit deve estar entre 1 e ${MAX_LIMIT}`);
  }
  if ((options.start && !isIsoDate(options.start)) || (options.end && !isIsoDate(options.end))) {
    throw new Error('--start e --end devem usar YYYY-MM-DD');
  }
  if ((options.start && !options.end) || (!options.start && options.end)) {
    throw new Error('--start e --end devem ser informados juntos');
  }
  if (options.start && options.start > options.end) {
    throw new Error('--start não pode ser posterior a --end');
  }
  return options;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isSearchConsoleSite(value) {
  if (/^sc-domain:[a-z0-9.-]+$/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      !parsed.port && !parsed.search && !parsed.hash;
  } catch (_) {
    return false;
  }
}

function resolveCredentialPath(environment = process.env) {
  const configured = String(environment.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (!configured) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS não está configurada neste perfil do Windows');
  }
  const resolved = fs.realpathSync(configured);
  const stats = fs.statSync(resolved);
  if (!stats.isFile() || stats.size < 100 || stats.size > 128 * 1024) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS não aponta para uma credencial de service account válida');
  }
  return resolved;
}

function loadServiceAccount(credentialsPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  } catch (_) {
    throw new Error('A credencial Google configurada não contém JSON legível');
  }
  if (
    !parsed || parsed.type !== 'service_account' ||
    typeof parsed.private_key !== 'string' ||
    !parsed.private_key.includes('-----BEGIN PRIVATE KEY-----') ||
    !parsed.private_key.includes('-----END PRIVATE KEY-----') ||
    typeof parsed.client_email !== 'string' ||
    !/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/i.test(parsed.client_email)
  ) {
    throw new Error('A credencial Google configurada não é uma service account válida');
  }
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
}

function base64url(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return bytes.toString('base64url');
}

function createAssertion(account, scope, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.clientEmail,
    scope,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.privateKey);
  return `${unsigned}.${base64url(signature)}`;
}

async function getAccessToken(account, scope, fetchImpl = fetch) {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createAssertion(account, scope),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`A autenticação Google falhou (HTTP ${response.status})`);
  }
  return body.access_token;
}

async function postGoogleJson(url, token, body, label, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${label} falhou (HTTP ${response.status})`);
  }
  return result;
}

async function getGoogleJson(url, token, label, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${label} falhou (HTTP ${response.status})`);
  }
  return result;
}

function reportDateRange(options, now = new Date()) {
  if (options.start) return { startDate: options.start, endDate: options.end };
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  const start = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  const format = (date) => date.toISOString().slice(0, 10);
  return { startDate: format(start), endDate: format(end) };
}

function getRows(response) {
  return Array.isArray(response && response.rows) ? response.rows : [];
}

function ga4Url(propertyId, method) {
  return `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:${method}`;
}

function searchConsoleUrl(site) {
  return `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
}

async function ensureSearchConsolePropertyAccess(token, site, fetchImpl = fetch) {
  const sites = await getGoogleJson(
    'https://www.googleapis.com/webmasters/v3/sites',
    token,
    'Search Console sites',
    fetchImpl
  );
  const entries = Array.isArray(sites && sites.siteEntry) ? sites.siteEntry : [];
  if (!entries.some((entry) => entry && entry.siteUrl === site)) {
    throw new Error('A credencial Google não tem acesso à propriedade configurada do Search Console');
  }
}

async function checkConnection(config, fetchImpl = fetch) {
  const range = reportDateRange(config.options);
  const checkApi = async (scope, operation) => {
    try {
      const token = await getAccessToken(config.account, scope, fetchImpl);
      await operation(token);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: String(error && error.message ? error.message : error).slice(0, 180),
      };
    }
  };
  const pending = [];
  if (config.options.service !== 'search-console') pending.push(['ga4', checkApi(GA_SCOPE, (token) => postGoogleJson(
      ga4Url(config.options.gaProperty, 'runRealtimeReport'),
      token,
      { metrics: [{ name: 'activeUsers' }], limit: '1' },
      'GA4 Data API',
      fetchImpl
    ))]);
  if (config.options.service !== 'ga4') pending.push(['searchConsole', checkApi(SC_SCOPE, async (token) => {
    // Listar propriedades primeiro separa "API indisponível" de "a conta
    // técnica não recebeu acesso a esta propriedade", sem revelar a identidade.
    await ensureSearchConsolePropertyAccess(token, config.options.searchConsoleSite, fetchImpl);
    return postGoogleJson(
      searchConsoleUrl(config.options.searchConsoleSite),
      token,
      { startDate: range.startDate, endDate: range.endDate, rowLimit: 1 },
      'Search Console API',
      fetchImpl
    );
  })]);
  const resolved = Object.fromEntries(await Promise.all(pending.map(async ([name, task]) => [name, await task])));
  const ga4 = resolved.ga4 || { ok: true, skipped: true };
  const searchConsole = resolved.searchConsole || { ok: true, skipped: true };
  return {
    ok: ga4.ok && searchConsole.ok,
    checkedAt: new Date().toISOString(),
    range,
    ga4,
    searchConsole,
  };
}

async function getReport(config, fetchImpl = fetch) {
  const range = reportDateRange(config.options);
  const gaDateRanges = [{ startDate: range.startDate, endDate: range.endDate }];
  const gaBase = { dateRanges: gaDateRanges, limit: String(config.options.limit) };
  const scBase = {
    startDate: range.startDate,
    endDate: range.endDate,
    type: 'web',
    rowLimit: config.options.limit,
  };
  const ga4Report = async () => {
    const gaToken = await getAccessToken(config.account, GA_SCOPE, fetchImpl);
    const [overview, events, landingPages] = await Promise.all([
      postGoogleJson(
      ga4Url(config.options.gaProperty, 'runReport'), gaToken,
      { ...gaBase, metrics: ['activeUsers', 'sessions', 'screenPageViews', 'engagedSessions'].map((name) => ({ name })) },
      'GA4 overview', fetchImpl
      ),
      postGoogleJson(
      ga4Url(config.options.gaProperty, 'runReport'), gaToken,
      { ...gaBase, dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }], orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }] },
      'GA4 events', fetchImpl
      ),
      postGoogleJson(
      ga4Url(config.options.gaProperty, 'runReport'), gaToken,
      { ...gaBase, dimensions: [{ name: 'landingPagePlusQueryString' }], metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] },
      'GA4 landing pages', fetchImpl
      ),
    ]);
    return { overview, events, landingPages };
  };
  const searchConsoleReport = async () => {
    const searchConsoleToken = await getAccessToken(config.account, SC_SCOPE, fetchImpl);
    await ensureSearchConsolePropertyAccess(searchConsoleToken, config.options.searchConsoleSite, fetchImpl);
    const [pages, queries, daily] = await Promise.all([
      postGoogleJson(searchConsoleUrl(config.options.searchConsoleSite), searchConsoleToken, { ...scBase, dimensions: ['page'] }, 'Search Console pages', fetchImpl),
      postGoogleJson(searchConsoleUrl(config.options.searchConsoleSite), searchConsoleToken, { ...scBase, dimensions: ['query'] }, 'Search Console queries', fetchImpl),
      postGoogleJson(searchConsoleUrl(config.options.searchConsoleSite), searchConsoleToken, { ...scBase, dimensions: ['date'] }, 'Search Console daily trend', fetchImpl),
    ]);
    return { pages, queries, daily };
  };
  const jobs = [];
  if (config.options.service !== 'search-console') jobs.push(['ga4', ga4Report()]);
  if (config.options.service !== 'ga4') jobs.push(['searchConsole', searchConsoleReport()]);
  const settled = await Promise.all(jobs.map(async ([name, job]) => {
    try {
      return [name, { ok: true, value: await job }];
    } catch (error) {
      return [name, { ok: false, error: String(error && error.message ? error.message : error).slice(0, 180) }];
    }
  }));
  const results = Object.fromEntries(settled);
  const ga4 = results.ga4 || { ok: true, skipped: true };
  const searchConsole = results.searchConsole || { ok: true, skipped: true };
  return {
    ok: ga4.ok && searchConsole.ok,
    fetchedAt: new Date().toISOString(),
    range,
    ga4: ga4.value || null,
    searchConsole: searchConsole.value || null,
    errors: {
      ...(ga4.ok ? {} : { ga4: ga4.error }),
      ...(searchConsole.ok ? {} : { searchConsole: searchConsole.error }),
    },
    limits: {
      ga4: 'A Data API devolve relatórios agregados; eventos individuais exigem exportação GA4 para BigQuery.',
      searchConsole: 'A Search Analytics API retorna as principais linhas disponíveis e não expõe o relatório de cobertura/validações em lote.',
    },
  };
}

function summarizeReport(report) {
  const overview = getRows(report.ga4 && report.ga4.overview)[0] || {};
  const metricValues = Array.isArray(overview.metricValues) ? overview.metricValues.map((item) => item.value) : [];
  return {
    fetchedAt: report.fetchedAt,
    range: report.range,
    ga4: {
      activeUsers: metricValues[0] || '0',
      sessions: metricValues[1] || '0',
      screenPageViews: metricValues[2] || '0',
      engagedSessions: metricValues[3] || '0',
      eventRows: getRows(report.ga4 && report.ga4.events).length,
      landingPageRows: getRows(report.ga4 && report.ga4.landingPages).length,
    },
    searchConsole: {
      pageRows: getRows(report.searchConsole && report.searchConsole.pages).length,
      queryRows: getRows(report.searchConsole && report.searchConsole.queries).length,
      dailyRows: getRows(report.searchConsole && report.searchConsole.daily).length,
    },
    errors: report.errors,
    limits: report.limits,
  };
}

async function main(argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch) {
  const options = parseArgs(argv);
  const credentialPath = resolveCredentialPath(environment);
  const config = { options, account: loadServiceAccount(credentialPath) };
  if (options.check) return checkConnection(config, fetchImpl);
  return getReport(config, fetchImpl);
}

if (require.main === module) {
  main().then((result) => {
    const options = parseArgs(process.argv.slice(2));
    const output = options.check || options.json ? result : summarizeReport(result);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`Falha segura de relatórios Google: ${String(error && error.message ? error.message : error).slice(0, 400)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_GA_PROPERTY_ID,
  DEFAULT_SEARCH_CONSOLE_SITE_URL,
  MAX_LIMIT,
  createAssertion,
  checkConnection,
  ensureSearchConsolePropertyAccess,
  getGoogleJson,
  isIsoDate,
  isSearchConsoleSite,
  parseArgs,
  reportDateRange,
  resolveCredentialPath,
  summarizeReport,
};
