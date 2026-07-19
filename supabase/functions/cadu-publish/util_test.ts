import {
  DEFAULT_AUTO_PUBLISH_SCORE_MIN,
  isDurableSourceIdentityUrl,
  resolveAutoPublishScoreMin,
} from "./util.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("resolveAutoPublishScoreMin preserves valid unit-interval values", () => {
  for (const [input, expected] of [
    ["0", 0],
    ["0.6", 0.6],
    [" 0.65 ", 0.65],
    ["1", 1],
  ] as const) {
    assertEquals(resolveAutoPublishScoreMin(input), expected);
  }
});

Deno.test("resolveAutoPublishScoreMin fails closed to the documented default", () => {
  for (const input of [undefined, null, "", " ", "invalid", "NaN", "Infinity", -0.01, 1.01]) {
    assertEquals(resolveAutoPublishScoreMin(input), DEFAULT_AUTO_PUBLISH_SCORE_MIN);
  }
});

Deno.test("source URL identity accepts content pages and rejects reusable actions", () => {
  for (const url of [
    "https://ufg.br/n/202692",
    "https://pos.ufg.br/n/ppgecm-abre-selecao-2026",
    "https://revistas.ufg.br/index.php/foo/article/view/12345",
    "https://www.instagram.com/p/ABC_def12/",
  ]) assertEquals(isDurableSourceIdentityUrl(url), true);

  for (const url of [
    "https://forms.gle/reused-form",
    "https://docs.google.com/forms/d/e/reused/viewform",
    "https://ufg.br/",
    "https://example.org/not-an-institutional-item",
  ]) assertEquals(isDurableSourceIdentityUrl(url), false);
});
