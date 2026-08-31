import {
  extractCoverFromHtml,
  officialCoverCandidates,
  officialPageCandidates,
  OFFICIAL_COVER_PAGE_MAX_BYTES,
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

Deno.test("official pages reject private targets without displacing safe linked platforms", () => {
  assertEquals(officialPageCandidates({
    sourceUrl: "https://127.0.0.1/a",
    url: "https://[::1]/a",
    enrichmentSources: ["https://23conpeex.plateia.ufg.br/", "https://www.sympla.com.br/evento"],
  }), ["https://23conpeex.plateia.ufg.br/", "https://www.sympla.com.br/evento"]);
  assertEquals(officialPageCandidates({ sourceUrl: "https://ufg.br/n/AbC", url: "https://ufg.br/n/abc" }), [
    "https://ufg.br/n/AbC", "https://ufg.br/n/abc",
  ]);
  assertEquals(extractCoverFromHtml('<meta property="og:image" content="https://169.254.169.254/capa.png">'), "");
});

Deno.test("official cover lookup reads linked Even3/Sympla/Plateia using the safe shared transport", async () => {
  for (const url of ["https://www.even3.com.br/evento/", "https://www.sympla.com.br/evento/", "https://23conpeex.plateia.ufg.br/"]) {
    const visited: string[] = [];
    const covers = await officialCoverCandidates({ sourceUrl: "https://ufg.br/e/1", enrichmentSources: [url] }, 2, {
      resolveDns: () => Promise.resolve(["200.137.208.10"]),
      fetch: (input, options) => {
        visited.push(String(input));
        assertEquals(options?.redirect, "manual");
        return Promise.resolve(new Response(visited.length === 1 ? '<html>sem capa</html>' :
          '<meta property="og:image" content="https://files.cercomp.ufg.br/weby/up/7/o/capa.png">',
        { headers: { "content-type": "text/html" } }));
      },
    });
    assertEquals(visited, ["https://ufg.br/e/1", url]);
    assertEquals(covers, ["https://files.cercomp.ufg.br/weby/up/7/o/capa.png"]);
  }
});

Deno.test("official cover budget cannot read an OG tag beyond 512KB in one chunk", async () => {
  const covers = await officialCoverCandidates({ sourceUrl: "https://ufg.br/e/1" }, 2, {
    resolveDns: () => Promise.resolve(["200.137.208.10"]),
    fetch: () => Promise.resolve(new Response("x".repeat(OFFICIAL_COVER_PAGE_MAX_BYTES) +
      '<meta property="og:image" content="https://files.cercomp.ufg.br/late.png">',
    { headers: { "content-type": "text/html" } })),
  });
  assertEquals(covers, []);
});

Deno.test("unsafe redirect from official page stays best-effort without following the destination", async () => {
  let calls = 0;
  const covers = await officialCoverCandidates({ sourceUrl: "https://ufg.br/e/1" }, 2, {
    resolveDns: () => Promise.resolve(["200.137.208.10"]),
    fetch: () => { calls++; return Promise.resolve(new Response(null, { status: 302, headers: { location: "https://127.0.0.1/a" } })); },
  });
  assertEquals(covers, []);
  assertEquals(calls, 1);
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
  assertEquals(officialPageCandidates({ ...item, enrichmentSources: ["https://www.even3.com.br/evento", "https://www.sympla.com.br/evento"] }, 99).length, 2);
});
