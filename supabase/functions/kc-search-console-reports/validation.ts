// Search Console retains roughly 16 months of performance data. A 500-day
// hard cap covers that useful window while preventing unbounded requests.
export const SEARCH_ANALYTICS_MAX_DAYS = 500;
export const SEARCH_ANALYTICS_MAX_DIMENSIONS = 3;
export const SEARCH_ANALYTICS_DEFAULT_ROW_LIMIT = 1000;
export const SEARCH_ANALYTICS_MAX_ROW_LIMIT = 5000;
export const MAX_INSPECTION_URL_LENGTH = 2048;

export const SEARCH_ANALYTICS_DIMENSIONS = [
  "query",
  "page",
  "country",
  "device",
  "date",
  "searchAppearance",
] as const;

export const SEARCH_ANALYTICS_TYPES = [
  "web",
  "image",
  "video",
  "news",
  "discover",
  "googleNews",
] as const;

type SearchAnalyticsDimension = typeof SEARCH_ANALYTICS_DIMENSIONS[number];
type SearchAnalyticsType = typeof SEARCH_ANALYTICS_TYPES[number];

export interface SearchAnalyticsRequest {
  action: "searchAnalytics";
  startDate: string;
  endDate: string;
  dimensions: SearchAnalyticsDimension[];
  rowLimit: number;
  type: SearchAnalyticsType;
}

export interface SitemapsRequest {
  action: "sitemaps";
}

export interface InspectUrlRequest {
  action: "inspectUrl";
  inspectionUrl: string;
}

export type SearchConsoleRequest =
  | SearchAnalyticsRequest
  | SitemapsRequest
  | InspectUrlRequest;

export interface ConfiguredSite {
  kind: "domain" | "url-prefix";
  siteUrl: string;
  hostname: string;
  origin: string | null;
  pathPrefix: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIMENSION_SET = new Set<string>(SEARCH_ANALYTICS_DIMENSIONS);
const TYPE_SET = new Set<string>(SEARCH_ANALYTICS_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function parseIsoDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function validateSearchAnalytics(
  input: Record<string, unknown>,
): ValidationResult<SearchAnalyticsRequest> {
  if (
    !containsOnlyKeys(input, [
      "action",
      "startDate",
      "endDate",
      "dimensions",
      "rowLimit",
      "type",
    ])
  ) {
    return { ok: false, error: "request contains unsupported fields" };
  }

  const startTimestamp = parseIsoDate(input.startDate);
  const endTimestamp = parseIsoDate(input.endDate);
  if (startTimestamp === null || endTimestamp === null) {
    return { ok: false, error: "startDate and endDate must use YYYY-MM-DD" };
  }
  if (startTimestamp > endTimestamp) {
    return { ok: false, error: "startDate must be on or before endDate" };
  }
  const inclusiveDays = Math.floor((endTimestamp - startTimestamp) / DAY_MS) +
    1;
  if (inclusiveDays > SEARCH_ANALYTICS_MAX_DAYS) {
    return {
      ok: false,
      error: `date range must not exceed ${SEARCH_ANALYTICS_MAX_DAYS} days`,
    };
  }

  const rawDimensions = input.dimensions ?? [];
  if (!Array.isArray(rawDimensions)) {
    return { ok: false, error: "dimensions must be an array" };
  }
  if (rawDimensions.length > SEARCH_ANALYTICS_MAX_DIMENSIONS) {
    return {
      ok: false,
      error:
        `dimensions supports at most ${SEARCH_ANALYTICS_MAX_DIMENSIONS} values`,
    };
  }
  if (
    rawDimensions.some((dimension) =>
      typeof dimension !== "string" || !DIMENSION_SET.has(dimension)
    )
  ) {
    return { ok: false, error: "dimensions contains an unsupported value" };
  }
  const dimensions = rawDimensions as SearchAnalyticsDimension[];
  if (new Set(dimensions).size !== dimensions.length) {
    return { ok: false, error: "dimensions must not contain duplicates" };
  }

  const rowLimit = input.rowLimit ?? SEARCH_ANALYTICS_DEFAULT_ROW_LIMIT;
  if (
    typeof rowLimit !== "number" ||
    !Number.isInteger(rowLimit) ||
    rowLimit < 1 ||
    rowLimit > SEARCH_ANALYTICS_MAX_ROW_LIMIT
  ) {
    return {
      ok: false,
      error:
        `rowLimit must be an integer from 1 to ${SEARCH_ANALYTICS_MAX_ROW_LIMIT}`,
    };
  }

  const type = input.type ?? "web";
  if (typeof type !== "string" || !TYPE_SET.has(type)) {
    return { ok: false, error: "type contains an unsupported value" };
  }

  return {
    ok: true,
    value: {
      action: "searchAnalytics",
      startDate: input.startDate as string,
      endDate: input.endDate as string,
      dimensions,
      rowLimit,
      type: type as SearchAnalyticsType,
    },
  };
}

export function validateRequest(
  input: unknown,
): ValidationResult<SearchConsoleRequest> {
  if (!isRecord(input)) {
    return { ok: false, error: "body must be a JSON object" };
  }

  if (input.action === "searchAnalytics") {
    return validateSearchAnalytics(input);
  }

  if (input.action === "sitemaps") {
    if (!containsOnlyKeys(input, ["action"])) {
      return { ok: false, error: "request contains unsupported fields" };
    }
    return { ok: true, value: { action: "sitemaps" } };
  }

  if (input.action === "inspectUrl") {
    if (!containsOnlyKeys(input, ["action", "inspectionUrl"])) {
      return { ok: false, error: "request contains unsupported fields" };
    }
    if (
      typeof input.inspectionUrl !== "string" ||
      input.inspectionUrl.trim() === "" ||
      input.inspectionUrl.length > MAX_INSPECTION_URL_LENGTH
    ) {
      return { ok: false, error: "inspectionUrl must be a non-empty URL" };
    }
    return {
      ok: true,
      value: {
        action: "inspectUrl",
        inspectionUrl: input.inspectionUrl.trim(),
      },
    };
  }

  return {
    ok: false,
    error: "action must be searchAnalytics, sitemaps, or inspectUrl",
  };
}

function isValidHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253 || hostname.includes(":")) {
    return false;
  }
  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  return labels.every((label) =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  );
}

export function parseConfiguredSite(
  input: string,
): ValidationResult<ConfiguredSite> {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "site URL is empty" };

  if (raw.startsWith("sc-domain:")) {
    const domain = raw.slice("sc-domain:".length).toLowerCase();
    if (!isValidHostname(domain)) {
      return { ok: false, error: "domain property is invalid" };
    }
    return {
      ok: true,
      value: {
        kind: "domain",
        siteUrl: `sc-domain:${domain}`,
        hostname: domain,
        origin: null,
        pathPrefix: "/",
      },
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return { ok: false, error: "URL-prefix property is invalid" };
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    !isValidHostname(parsed.hostname)
  ) {
    return {
      ok: false,
      error: "URL-prefix property must be a secure HTTPS URL",
    };
  }

  const pathPrefix = parsed.pathname.endsWith("/")
    ? parsed.pathname
    : `${parsed.pathname}/`;
  const siteUrl = `${parsed.origin}${pathPrefix}`;

  return {
    ok: true,
    value: {
      kind: "url-prefix",
      siteUrl,
      hostname: parsed.hostname.toLowerCase(),
      origin: parsed.origin,
      pathPrefix,
    },
  };
}

export function validateInspectionUrl(
  input: string,
  site: ConfiguredSite,
): ValidationResult<string> {
  if (input.length > MAX_INSPECTION_URL_LENGTH) {
    return { ok: false, error: "inspectionUrl is too long" };
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch (_) {
    return { ok: false, error: "inspectionUrl must be a valid URL" };
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.hash !== "" ||
    !isValidHostname(parsed.hostname)
  ) {
    return {
      ok: false,
      error:
        "inspectionUrl must be an HTTPS URL without credentials or fragment",
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (site.kind === "domain") {
    const isConfiguredDomain = hostname === site.hostname ||
      hostname.endsWith(`.${site.hostname}`);
    if (!isConfiguredDomain) {
      return {
        ok: false,
        error: "inspectionUrl is outside the configured property",
      };
    }
  } else {
    if (
      parsed.origin !== site.origin ||
      !parsed.pathname.startsWith(site.pathPrefix)
    ) {
      return {
        ok: false,
        error: "inspectionUrl is outside the configured property",
      };
    }
  }

  return { ok: true, value: parsed.toString() };
}
