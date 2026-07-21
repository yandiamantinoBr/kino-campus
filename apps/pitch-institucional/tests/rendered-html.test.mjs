import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function collectJavaScriptSources(rootPath) {
  const sources = [];
  const pending = [rootPath];

  while (pending.length) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) {
        sources.push(await readFile(entryPath, "utf8"));
      }
    }
  }

  return sources;
}

test("preserves development preview metadata in the rendered app", async () => {
  const workerFileUrl = new URL("../dist/server/index.js", import.meta.url);
  const workerSource = await readFile(workerFileUrl, "utf8");

  // Workers that bind D1 import the runtime-only `cloudflare:workers` module.
  // Node cannot execute that URL scheme, so validate the compiled RSC/SSR
  // payload statically in that case. The artifact script separately proves the
  // Worker default export and fetch(request, env, ctx) contract.
  if (workerSource.includes('from "cloudflare:workers"')) {
    const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
    const sources = await collectJavaScriptSources(distRoot);
    const carriesPreviewMetadata = sources.some((source) => {
      const markerIndex = source.indexOf("codex-preview");
      if (markerIndex < 0) return false;
      const neighborhood = source.slice(
        Math.max(0, markerIndex - 1200),
        markerIndex + 1200,
      );
      return neighborhood.includes("development");
    });

    assert.equal(
      carriesPreviewMetadata,
      true,
      "compiled Worker assets must retain codex-preview=development metadata",
    );
    return;
  }

  workerFileUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerFileUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});
