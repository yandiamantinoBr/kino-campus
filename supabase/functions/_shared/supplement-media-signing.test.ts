import {
  MAX_SUPPLEMENT_MEDIA_REFERENCES,
  signSupplementMediaTargets,
  SUPPLEMENT_MEDIA_SIGNED_URL_SECONDS,
  type SupplementMediaSigningTarget,
} from "./supplement-media-signing.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function target(
  index: number,
  bucketId = "kino-chat-media",
): SupplementMediaSigningTarget {
  return {
    mediaRef: `KEM-${index.toString(16).toUpperCase().padStart(32, "0")}`,
    bucketId,
    objectPath:
      `chat-media/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/file-${index}.jpg`,
  };
}

Deno.test("10,000 media targets fail before any signer call", async () => {
  let signerCalls = 0;
  const targets = Array.from({ length: 10_000 }, (_, index) => target(index));
  let observed = "";
  try {
    await signSupplementMediaTargets(targets, async () => {
      signerCalls += 1;
      return [];
    });
  } catch (error) {
    observed = error instanceof Error ? error.message : String(error);
  }
  assertEquals(observed, "EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED");
  assertEquals(signerCalls, 0);
});

Deno.test("100 media targets use one concurrent batch per bucket", async () => {
  const calls: Array<{
    bucketId: string;
    count: number;
    expiresInSeconds: number;
  }> = [];
  const targets = Array.from({ length: MAX_SUPPLEMENT_MEDIA_REFERENCES }, (
    _,
    index,
  ) => target(index, index % 2 ? "kino-chat-media" : "kino-media"));

  const signed = await signSupplementMediaTargets(
    targets,
    async (bucketId, objectPaths, expiresInSeconds) => {
      calls.push({ bucketId, count: objectPaths.length, expiresInSeconds });
      return objectPaths.map((objectPath) => ({
        objectPath,
        signedUrl: `https://signed.invalid/${bucketId}/${
          encodeURIComponent(objectPath)
        }`,
      }));
    },
  );

  calls.sort((left, right) => left.bucketId.localeCompare(right.bucketId));
  assertEquals(calls, [
    {
      bucketId: "kino-chat-media",
      count: 50,
      expiresInSeconds: SUPPLEMENT_MEDIA_SIGNED_URL_SECONDS,
    },
    {
      bucketId: "kino-media",
      count: 50,
      expiresInSeconds: SUPPLEMENT_MEDIA_SIGNED_URL_SECONDS,
    },
  ]);
  assertEquals(signed.size, MAX_SUPPLEMENT_MEDIA_REFERENCES);
});

Deno.test("batch signer output must map every exact requested path once", async () => {
  let observed = "";
  try {
    await signSupplementMediaTargets(
      [target(1), target(2)],
      async (_bucketId, objectPaths) => [
        {
          objectPath: objectPaths[0],
          signedUrl: "https://signed.invalid/first",
        },
        {
          objectPath: `${objectPaths[1]}-wrong`,
          signedUrl: "https://signed.invalid/wrong",
        },
      ],
    );
  } catch (error) {
    observed = error instanceof Error ? error.message : String(error);
  }
  assertEquals(observed, "EXPORT_MEDIA_SIGNING_FAILED");
});
