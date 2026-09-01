import assert from "node:assert/strict";
import {
  fetchPublicResource,
  isPublicAddress,
  MAX_REMOTE_REDIRECTS,
  PermanentResourceError,
  publicRemoteUrl,
  readBoundedBody,
  type RemoteResourceDependencies,
  RemoteResourceError,
} from "./remote-resource.ts";
import { downloadRemoteImage } from "./image-download.ts";
import { canPersistExternalImageUrl, validRemoteImageUrl } from "./util.ts";

const publicDns: NonNullable<RemoteResourceDependencies["resolveDns"]> = (
  _host,
  type,
) => Promise.resolve(type === "A" ? ["200.137.208.10"] : ["2606:4700::6810:1"]);
const requestOptions = { accept: "text/html", userAgent: "test" };
const imageOptions = { timeoutMs: 200, maxBytes: 32, userAgent: "test" };
const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

Deno.test("public URLs retain institutional, CERCOMP, event platform and social rehost CDNs", () => {
  for (
    const url of [
      "https://posgraduacao.if.ufg.br/e/39361-prosa",
      "https://23conpeex.plateia.ufg.br/",
      "https://www.even3.com.br/evento/",
      "https://www.sympla.com.br/evento/",
      "https://files.cercomp.ufg.br/weby/up/7/o/2.png?1786556262",
      "https://images.even3.com/capa.png",
      "https://static.even3.com/banner/capa.png",
      "https://images.sympla.com.br/capa.png",
      "https://scontent.cdninstagram.com/photo.jpg",
      "https://scontent.fbcdn.net/photo.jpg",
      "https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/capa.png",
      "http://files.cercomp.ufg.br/weby/up/7/o/legacy.png",
      "https://8.8.8.8/a",
      "https://[2606:4700::1111]/a",
    ]
  ) assert.equal(publicRemoteUrl(url), url, url);
  assert.equal(publicRemoteUrl("http://ufg.br/a", true), "");
  assert.equal(
    publicRemoteUrl("https://UFG.BR:443/n/AbC#cover"),
    "https://ufg.br/n/AbC",
  );
  assert.equal(
    canPersistExternalImageUrl("https://scontent.cdninstagram.com/photo.jpg"),
    false,
  );
});

Deno.test("private, local, reserved, credentialed and nonstandard-port URLs fail before DNS/fetch", () => {
  const credentials = ["https://", "user", ":", "pass", "@ufg.br/a"].join("");
  const urls = [
    "https://127.0.0.1/a",
    "https://2130706433/a",
    "https://0x7f000001/a",
    "https://0177.0.0.1/a",
    "https://127.1/a",
    "https://0.0.0.0/a",
    "https://10.0.0.1/a",
    "https://100.64.0.1/a",
    "https://169.254.169.254/a",
    "https://172.16.0.1/a",
    "https://192.168.1.2/a",
    "https://224.0.0.1/a",
    "https://192.0.2.1/a",
    "https://198.18.0.1/a",
    "https://198.51.100.1/a",
    "https://203.0.113.1/a",
    "https://[::1]/a",
    "https://[::]/a",
    "https://[::ffff:127.0.0.1]/a",
    "https://[::ffff:7f00:1]/a",
    "https://[fc00::1]/a",
    "https://[fe80::1]/a",
    "https://[ff02::1]/a",
    "https://[64:ff9b::a00:1]/a",
    "https://[2001:db8::1]/a",
    "https://[2002:7f00:1::]/a",
    "https://[3fff::1]/a",
    "https://localhost/a",
    "https://localhost./a",
    "https://foo.local/a",
    "https://foo.local:444/a",
    "https://foo.internal/a",
    "https://metadata.google.internal/a",
    "https://foo.test/a",
    "https://intranet/a",
    "https://ufg.br:8443/a",
    "http://ufg.br:443/a",
    "file:///capa.png",
    credentials,
    "https://ufg.br\\@127.0.0.1/a",
    "https://ufg.br/line\nbreak",
    "https://ufg.br/a\u0000b",
  ];
  for (const url of urls) {
    assert.equal(publicRemoteUrl(url), "", url);
    assert.equal(validRemoteImageUrl(url), "", url);
    assert.equal(canPersistExternalImageUrl(url), false, url);
  }
});

Deno.test("IPv6 global addresses are parsed without accidentally rejecting compressed global prefixes", () => {
  for (
    const value of [
      "200.137.208.10",
      "8.8.8.8",
      "2001:4860::8888",
      "2606:4700::1111",
      "2000::1",
      "3000::1",
    ]
  ) {
    assert.equal(isPublicAddress(value), true, value);
  }
  for (
    const value of [
      "not-an-ip",
      "2001::1",
      "2001:20::1",
      "2001:db8::1",
      "2002::1",
      "3fff::1",
      "4000::1",
    ]
  ) {
    assert.equal(isPublicAddress(value), false, value);
  }
});

Deno.test("literal public hosts need no resolver while unsafe hosts never reach the transport", async () => {
  let calls = 0;
  const deps = {
    resolveDns: () => {
      throw new Error("DNS must not run");
    },
    fetch: () => {
      calls++;
      return Promise.resolve(new Response("ok"));
    },
  };
  for (
    const url of [
      "https://127.0.0.1/a",
      "https://[::1]/a",
      "https://localhost./a",
    ]
  ) {
    await assert.rejects(
      () => fetchPublicResource(url, requestOptions, deps),
      RemoteResourceError,
    );
  }
  assert.equal(calls, 0);
  await (await fetchPublicResource("https://8.8.8.8/a", requestOptions, deps))
    .text();
  assert.equal(calls, 1);
});

Deno.test("all A and AAAA records must be public, even if the first record is public", async () => {
  for (
    const privateRecord of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "::1",
      "::ffff:10.1.2.3",
      "fd00::1",
    ]
  ) {
    let calls = 0;
    await assert.rejects(
      () =>
        fetchPublicResource("https://ufg.br/a", requestOptions, {
          resolveDns: (_host, type) =>
            Promise.resolve(type === "A" ? ["8.8.8.8"] : [privateRecord]),
          fetch: () => {
            calls++;
            return Promise.resolve(new Response("unexpected"));
          },
        }),
      /remote_dns_not_public/,
    );
    assert.equal(calls, 0, privateRecord);
  }
});

Deno.test("DNS empty, resolver failures and unsupported runtimes fail closed", async () => {
  for (
    const resolveDns of [
      () => Promise.resolve([]),
      () => Promise.reject(new Error("resolver timeout")),
      () => Promise.reject(new Deno.errors.NotCapable("denied")),
    ]
  ) {
    let calls = 0;
    await assert.rejects(
      () =>
        fetchPublicResource("https://ufg.br/a", requestOptions, {
          resolveDns,
          fetch: () => {
            calls++;
            return Promise.resolve(new Response("unexpected"));
          },
        }),
      RemoteResourceError,
    );
    assert.equal(calls, 0);
  }
});

Deno.test("authoritative absence of AAAA is accepted only with public A records", async () => {
  let calls = 0;
  const response = await fetchPublicResource(
    "https://ufg.br/a",
    requestOptions,
    {
      resolveDns: (_host, type) =>
        type === "A"
          ? Promise.resolve(["200.137.208.10"])
          : Promise.reject(new Deno.errors.NotFound("no records")),
      fetch: () => {
        calls++;
        return Promise.resolve(new Response("ok"));
      },
    },
  );
  assert.equal(await response.text(), "ok");
  assert.equal(calls, 1);
});

Deno.test("a public A record cannot hide an AAAA resolver error", async () => {
  await assert.rejects(
    () =>
      fetchPublicResource("https://ufg.br/a", requestOptions, {
        resolveDns: (_host, type) =>
          type === "A"
            ? Promise.resolve(["8.8.8.8"])
            : Promise.reject(new Error("timed out")),
        fetch: () => {
          throw new Error("transport must not run");
        },
      }),
    /remote_dns_unavailable/,
  );
});

Deno.test("public redirects are manual GETs with fresh DNS and without cookies or auth", async () => {
  const visited: string[] = [];
  const dns: string[] = [];
  const response = await fetchPublicResource(
    "https://ufg.br/evento",
    requestOptions,
    {
      resolveDns: (host, type, options) => {
        dns.push(host);
        return publicDns(host, type, options);
      },
      fetch: (input, init) => {
        visited.push(String(input));
        assert.equal(init?.redirect, "manual");
        assert.equal(init?.method, "GET");
        assert.equal(init?.credentials, "omit");
        assert.deepEqual(init?.headers, {
          accept: "text/html",
          "user-agent": "test",
        });
        return Promise.resolve(
          visited.length === 1
            ? new Response(null, {
              status: 302,
              headers: { location: "https://www.even3.com.br/evento" },
            })
            : new Response("cover"),
        );
      },
    },
  );
  assert.equal(await response.text(), "cover");
  assert.deepEqual(visited, [
    "https://ufg.br/evento",
    "https://www.even3.com.br/evento",
  ]);
  assert.deepEqual(dns, [
    "ufg.br",
    "ufg.br",
    "www.even3.com.br",
    "www.even3.com.br",
  ]);
});

Deno.test("private, credentialed, protocol-downgrade redirects stop before the second request", async () => {
  for (
    const location of [
      "https://127.0.0.1/a",
      "https://[::1]/a",
      "https://foo.internal/a",
      "http://ufg.br/a",
      "https://ufg.br:8443/a",
    ]
  ) {
    let calls = 0;
    await assert.rejects(
      () =>
        fetchPublicResource("https://ufg.br/a", requestOptions, {
          resolveDns: publicDns,
          fetch: () => {
            calls++;
            return Promise.resolve(
              new Response(null, { status: 302, headers: { location } }),
            );
          },
        }),
      RemoteResourceError,
    );
    assert.equal(calls, 1, location);
  }
});

Deno.test("redirect DNS is rechecked, including a same-host DNS change", async () => {
  let queries = 0;
  let calls = 0;
  await assert.rejects(
    () =>
      fetchPublicResource("https://ufg.br/a", requestOptions, {
        resolveDns: () =>
          Promise.resolve([++queries <= 2 ? "8.8.8.8" : "10.0.0.1"]),
        fetch: () => {
          calls++;
          return Promise.resolve(
            new Response(null, { status: 302, headers: { location: "/b" } }),
          );
        },
      }),
    /remote_dns_not_public/,
  );
  assert.equal(calls, 1);
});

Deno.test("redirect loops, missing location and excessive hops are bounded", async () => {
  for (const mode of ["loop", "missing", "many"]) {
    let calls = 0;
    await assert.rejects(
      () =>
        fetchPublicResource("https://ufg.br/a", requestOptions, {
          resolveDns: publicDns,
          fetch: () => {
            calls++;
            return Promise.resolve(
              new Response(null, {
                status: 302,
                headers: mode === "missing"
                  ? {}
                  : { location: mode === "loop" ? "/a" : `/hop${calls}` },
              }),
            );
          },
        }),
      RemoteResourceError,
    );
    assert.equal(calls, mode === "many" ? MAX_REMOTE_REDIRECTS + 1 : 1);
  }
});

Deno.test("unexpected auto-followed or mismatched final response URLs are rejected", async () => {
  for (
    const property of [{ redirected: true }, { url: "https://127.0.0.1/a" }]
  ) {
    const response = new Response("unexpected");
    Object.defineProperties(
      response,
      Object.fromEntries(
        Object.entries(property).map(([key, value]) => [key, { value }]),
      ),
    );
    await assert.rejects(
      () =>
        fetchPublicResource("https://ufg.br/a", requestOptions, {
          resolveDns: publicDns,
          fetch: () => Promise.resolve(response),
        }),
      /remote_unvalidated_redirect/,
    );
  }
});

Deno.test("abort deadline also bounds a stalled DNS resolver", async () => {
  const controller = new AbortController();
  const pending = fetchPublicResource("https://ufg.br/a", {
    ...requestOptions,
    signal: controller.signal,
  }, {
    resolveDns: () => new Promise(() => {}),
    fetch: () => {
      throw new Error("must not fetch");
    },
  });
  controller.abort();
  await assert.rejects(() => pending, /remote_resource_aborted/);
});

Deno.test("body budget truncates HTML within a single oversized chunk", async () => {
  const bytes = await readBoundedBody(new Response("a".repeat(100)), 8, {
    truncate: true,
  });
  assert.equal(bytes.byteLength, 8);
  assert.equal(new TextDecoder().decode(bytes), "aaaaaaaa");
});

Deno.test("image body budget rejects content-length, chunked overflow and oversized single chunk", async () => {
  for (
    const response of [
      new Response("x", { headers: { "content-length": "33" } }),
      new Response(new Uint8Array(33)),
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(20));
            controller.enqueue(new Uint8Array(20));
            controller.close();
          },
        }),
      ),
    ]
  ) {
    await assert.rejects(
      () => readBoundedBody(response, 32),
      /remote_body_too_large/,
    );
  }
  assert.equal(
    (await readBoundedBody(new Response(new Uint8Array(32)), 32)).byteLength,
    32,
  );
});

Deno.test("stalled response body aborts and cancels the reader", async () => {
  let cancelled = false;
  const controller = new AbortController();
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const pending = readBoundedBody(response, 32, { signal: controller.signal });
  controller.abort();
  await assert.rejects(() => pending, /remote_resource_aborted/);
  assert.equal(cancelled, true);
});

Deno.test("CERCOMP and platform CDN image downloads keep the rehost contract", async () => {
  for (
    const url of [
      "https://files.cercomp.ufg.br/weby/up/7/o/2.png",
      "https://images.even3.com/capa.png",
      "https://images.sympla.com.br/capa.png",
    ]
  ) {
    const result = await downloadRemoteImage(url, imageOptions, {
      resolveDns: publicDns,
      fetch: () =>
        Promise.resolve(
          new Response(pngHeader, { headers: { "content-type": "image/png" } }),
        ),
    });
    assert.equal(result.contentType, "image/png");
    assert.equal(result.ext, "png");
    assert.deepEqual(result.bytes, pngHeader);
  }
});

Deno.test("blocked image redirects and DNS errors preserve safety error for no external fallback", async () => {
  for (
    const deps of [
      {
        resolveDns: () => Promise.resolve(["10.0.0.1"]),
        fetch: () => {
          throw new Error("must not fetch");
        },
      },
      {
        resolveDns: publicDns,
        fetch: () =>
          Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: "http://169.254.169.254/capa.png" },
            }),
          ),
      },
    ]
  ) {
    await assert.rejects(() =>
      downloadRemoteImage(
        "https://files.cercomp.ufg.br/capa.png",
        imageOptions,
        deps,
      ), RemoteResourceError);
  }
});

Deno.test("permanent download failures (4xx, unsupported type, empty body) are typed so no external fallback persists", async () => {
  const settle = (pending: Promise<unknown>): Promise<unknown> =>
    pending.then(() => null, (error: unknown) => error);
  // 404: recurso sumiu — persistir a URL externa produziria imagem quebrada.
  const notFound = await settle(
    downloadRemoteImage("https://files.cercomp.ufg.br/sumiu.jpg", imageOptions, {
      resolveDns: publicDns,
      fetch: () => Promise.resolve(new Response("nope", { status: 404 })),
    }),
  );
  assert.ok(notFound instanceof PermanentResourceError, "404 deve ser permanente");
  assert.ok(notFound instanceof RemoteResourceError, "404 herda RemoteResourceError");
  assert.equal(notFound.message, "image_download_http_404");
  // 500 permanece transitório (Error simples): fallback externo continua válido.
  const serverError = await settle(
    downloadRemoteImage(
      "https://files.cercomp.ufg.br/instavel.jpg",
      imageOptions,
      {
        resolveDns: publicDns,
        fetch: () =>
          Promise.resolve(new Response("boom", { status: 500 })),
      },
    ),
  );
  assert.ok(!(serverError instanceof RemoteResourceError), "500 não é permanente");
  assert.equal((serverError as Error).message, "image_download_http_500");
  // Content-type não-imagem sem extensão reconhecível — nunca vira imagem.
  const unsupported = await settle(
    downloadRemoteImage("https://files.cercomp.ufg.br/pagina", imageOptions, {
      resolveDns: publicDns,
      fetch: () =>
        Promise.resolve(
          new Response("<html></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
    }),
  );
  assert.ok(unsupported instanceof PermanentResourceError);
  assert.equal(unsupported.message, "unsupported_image_type");
  // Corpo vazio com content-type de imagem — objeto inválido.
  const empty = await settle(
    downloadRemoteImage("https://files.cercomp.ufg.br/vazio.png", imageOptions, {
      resolveDns: publicDns,
      fetch: () =>
        Promise.resolve(
          new Response(new Uint8Array(0), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
        ),
    }),
  );
  assert.ok(empty instanceof PermanentResourceError);
  assert.equal(empty.message, "empty_image");
});
