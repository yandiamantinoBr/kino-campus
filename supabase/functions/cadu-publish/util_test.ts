import {
  DEFAULT_AUTO_PUBLISH_SCORE_MIN,
  isDurableSourceIdentityUrl,
  resolveAutoPublishScoreMin,
  toOptimizedCoverUrl,
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
Deno.test("toOptimizedCoverUrl converts kino-media objects to render URLs", () => {
  const input = "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/post-media/u/p/cadu-1.jpg";
  const output = toOptimizedCoverUrl(input);
  assertEquals(output, "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/render/image/public/kino-media/post-media/u/p/cadu-1.jpg?width=1920&quality=85");
});

Deno.test("toOptimizedCoverUrl leaves non-kino and render URLs untouched", () => {
  assertEquals(toOptimizedCoverUrl("https://files.cercomp.ufg.br/weby/up/1/o/banner.jpg"),
    "https://files.cercomp.ufg.br/weby/up/1/o/banner.jpg");
  const render = "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/render/image/public/kino-media/p/c.jpg?width=1920&quality=85";
  assertEquals(toOptimizedCoverUrl(render), render);
  assertEquals(toOptimizedCoverUrl(""), "");
});

Deno.test("toOptimizedCoverUrl converts kino-media objects to render URLs", () => {
  const input = "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/post-media/u/p/cadu-1.jpg";
  const output = toOptimizedCoverUrl(input);
  assertEquals(output, "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/render/image/public/kino-media/post-media/u/p/cadu-1.jpg?width=1920&quality=85");
});

Deno.test("toOptimizedCoverUrl leaves non-kino and render URLs untouched", () => {
  assertEquals(toOptimizedCoverUrl("https://files.cercomp.ufg.br/weby/up/1/o/banner.jpg"),
    "https://files.cercomp.ufg.br/weby/up/1/o/banner.jpg");
  const render = "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/render/image/public/kino-media/p/c.jpg?width=1920&quality=85";
  assertEquals(toOptimizedCoverUrl(render), render);
  assertEquals(toOptimizedCoverUrl(""), "");
});
