import {
  extractCoverFromHtml,
  officialPageCandidates,
} from "./official-cover.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const same = Object.is(actual, expected) ||
    JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test("extractCoverFromHtml reads og:image with entities and secure variants", () => {
  const html = `<!doctype html><html><head>
    <meta property="og:title" content="Defesa de Tese">
    <meta property="og:image" content="https://exemplo.ufg.br/img/capa.jpg?w=1200&amp;h=630">
    <meta property="og:image:secure_url" content="https://cdn.even3.com.br/capa2.jpg">
  </head></html>`;
  assertEquals(extractCoverFromHtml(html), "https://exemplo.ufg.br/img/capa.jpg?w=1200&h=630");
});

Deno.test("extractCoverFromHtml accepts protocol-relative and twitter:image", () => {
  const html = `<meta name="twitter:image" content="//cdn.sympla.io.br/evento.png">`;
  assertEquals(extractCoverFromHtml(html), "https://cdn.sympla.io.br/evento.png");
});

Deno.test("extractCoverFromHtml rejects svg, social CDN and non-http", () => {
  assertEquals(extractCoverFromHtml(`<meta property="og:image" content="https://x.ufg.br/logo.svg">`), "");
  assertEquals(extractCoverFromHtml(`<meta property="og:image" content="https://scontent.cdninstagram.com/f.jpg">`), "");
  assertEquals(extractCoverFromHtml(`<meta property="og:image" content="javascript:alert(1)">`), "");
  assertEquals(extractCoverFromHtml("<html></html>"), "");
});

Deno.test("officialPageCandidates skips instagram, dedupes and bounds", () => {
  const item = {
    sourceUrl: "https://exemplo.ufg.br/n/1",
    url: "https://exemplo.ufg.br/n/1/",
    enrichmentSources: [
      { url: "https://www.instagram.com/p/ABC/" },
      { url: "https://even3.com.br/evento-x" },
      "not-a-url",
    ],
  };
  assertEquals(officialPageCandidates(item), [
    "https://exemplo.ufg.br/n/1",
    "https://even3.com.br/evento-x",
  ]);
  assertEquals(officialPageCandidates(item, 1), ["https://exemplo.ufg.br/n/1"]);
});
