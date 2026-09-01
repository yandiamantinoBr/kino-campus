import {
  DEFAULT_AUTO_PUBLISH_SCORE_MIN,
  isDurableSourceIdentityUrl,
  readImageDimensions,
  resolveAutoPublishScoreMin,
  toProportionalRenderUrl,
} from "./util.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const same = Object.is(actual, expected) ||
    JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
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

Deno.test("readImageDimensions reads PNG IHDR and JPEG SOF headers", () => {
  const png = new Uint8Array(33);
  png[0] = 0x89; png[1] = 0x50; png[2] = 0x4e; png[3] = 0x47;
  const w = 1920, h = 772;
  png[16] = (w >>> 24) & 255; png[17] = (w >>> 16) & 255;
  png[18] = (w >>> 8) & 255; png[19] = w & 255;
  png[20] = (h >>> 24) & 255; png[21] = (h >>> 16) & 255;
  png[22] = (h >>> 8) & 255; png[23] = h & 255;
  assertEquals(readImageDimensions(png), { width: 1920, height: 772 });
  assertEquals(readImageDimensions(new Uint8Array([0xff, 0xd8])), null);
});

Deno.test("toProportionalRenderUrl builds exact proportional render URL", () => {
  const url = "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/post-media/u/p/cadu-1.jpg";
  assertEquals(
    toProportionalRenderUrl(url, { width: 1920 }, { width: 4688, height: 1885 }),
    url.replace("/object/public/", "/render/image/public/") + "?width=1920&height=772&resize=cover&quality=90",
  );
});

Deno.test("toProportionalRenderUrl passes through contracted and non-kino URLs", () => {
  const contracted = "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/capa.webp?width=1200&quality=80";
  assertEquals(toProportionalRenderUrl(contracted, { width: 1920 }, { width: 1920, height: 772 }), contracted);
  assertEquals(toProportionalRenderUrl("https://files.cercomp.ufg.br/x.png", { width: 1920 }, { width: 1920, height: 772 }),
    "https://files.cercomp.ufg.br/x.png");
  assertEquals(toProportionalRenderUrl("https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/x", { width: 1920 }, { width: 1920, height: 772 }),
    "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/x");
});