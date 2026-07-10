import {
  DEFAULT_AUTO_PUBLISH_SCORE_MIN,
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
