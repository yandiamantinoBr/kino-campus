import {
  parseConfiguredSite,
  SEARCH_ANALYTICS_DEFAULT_ROW_LIMIT,
  SEARCH_ANALYTICS_MAX_ROW_LIMIT,
  validateInspectionUrl,
  validateRequest,
} from "./validation.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(
  actual: T,
  expected: T,
  message = "values differ",
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("searchAnalytics applies safe defaults", () => {
  const result = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
  });
  assert(result.ok);
  assertEquals(result.value, {
    action: "searchAnalytics",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    dimensions: [],
    rowLimit: SEARCH_ANALYTICS_DEFAULT_ROW_LIMIT,
    type: "web",
  });
});

Deno.test("searchAnalytics accepts only bounded dimensions and rowLimit", () => {
  const accepted = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-05-01",
    endDate: "2026-07-14",
    dimensions: ["date", "query", "device"],
    rowLimit: SEARCH_ANALYTICS_MAX_ROW_LIMIT,
    type: "image",
  });
  assert(accepted.ok);

  const tooManyDimensions = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-05-01",
    endDate: "2026-05-02",
    dimensions: ["date", "query", "device", "country"],
  });
  assert(!tooManyDimensions.ok);

  const tooManyRows = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-05-01",
    endDate: "2026-05-02",
    rowLimit: SEARCH_ANALYTICS_MAX_ROW_LIMIT + 1,
  });
  assert(!tooManyRows.ok);
});

Deno.test("searchAnalytics rejects duplicate or unsupported dimensions", () => {
  const duplicate = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-05-01",
    endDate: "2026-05-02",
    dimensions: ["query", "query"],
  });
  assert(!duplicate.ok);

  const unsupported = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-05-01",
    endDate: "2026-05-02",
    dimensions: ["hour"],
  });
  assert(!unsupported.ok);
});

Deno.test("searchAnalytics validates real ordered dates and the 500-day window", () => {
  const nonexistentDate = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-02-30",
    endDate: "2026-03-01",
  });
  assert(!nonexistentDate.ok);

  const reversed = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-06-02",
    endDate: "2026-06-01",
  });
  assert(!reversed.ok);

  const tooLong = validateRequest({
    action: "searchAnalytics",
    startDate: "2024-01-01",
    endDate: "2025-06-01",
  });
  assert(!tooLong.ok);
});

Deno.test("all actions reject unknown fields", () => {
  const analytics = validateRequest({
    action: "searchAnalytics",
    startDate: "2026-06-01",
    endDate: "2026-06-02",
    siteUrl: "https://attacker.example/",
  });
  const sitemaps = validateRequest({ action: "sitemaps", delete: true });
  const inspect = validateRequest({
    action: "inspectUrl",
    inspectionUrl: "https://www.kinocampus.com.br/",
    languageCode: "arbitrary",
  });
  assert(!analytics.ok);
  assert(!sitemaps.ok);
  assert(!inspect.ok);
});

Deno.test("configured properties are normalized without weakening HTTPS", () => {
  const prefix = parseConfiguredSite("https://www.kinocampus.com.br");
  assert(prefix.ok);
  assertEquals(prefix.value.siteUrl, "https://www.kinocampus.com.br/");

  const domain = parseConfiguredSite("sc-domain:KinoCampus.com.br");
  assert(domain.ok);
  assertEquals(domain.value.siteUrl, "sc-domain:kinocampus.com.br");

  assert(!parseConfiguredSite("http://www.kinocampus.com.br/").ok);
  assert(!parseConfiguredSite("https://user:pass@www.kinocampus.com.br/").ok);
});

Deno.test("URL-prefix inspection stays inside the configured prefix", () => {
  const site = parseConfiguredSite("https://www.kinocampus.com.br/admin/");
  assert(site.ok);

  const accepted = validateInspectionUrl(
    "https://www.kinocampus.com.br/admin/reports.html?view=seo",
    site.value,
  );
  assert(accepted.ok);

  assert(
    !validateInspectionUrl(
      "https://www.kinocampus.com.br/administrator/reports.html",
      site.value,
    ).ok,
  );
  assert(
    !validateInspectionUrl(
      "https://kinocampus.com.br/admin/reports.html",
      site.value,
    ).ok,
  );
});

Deno.test("domain inspection allows real subdomains and blocks suffix attacks", () => {
  const site = parseConfiguredSite("sc-domain:kinocampus.com.br");
  assert(site.ok);

  assert(
    validateInspectionUrl(
      "https://www.kinocampus.com.br/product.html?id=123",
      site.value,
    ).ok,
  );
  assert(
    validateInspectionUrl(
      "https://preview.kinocampus.com.br/",
      site.value,
    ).ok,
  );
  assert(
    !validateInspectionUrl(
      "https://kinocampus.com.br.evil.example/",
      site.value,
    ).ok,
  );
  assert(
    !validateInspectionUrl(
      "http://www.kinocampus.com.br/",
      site.value,
    ).ok,
  );
  assert(
    !validateInspectionUrl(
      "https://www.kinocampus.com.br/#secret",
      site.value,
    ).ok,
  );
});
