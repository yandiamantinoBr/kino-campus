import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  BoundedRequestBodyError,
  readBoundedRequestText,
} from "./bounded-request-body.ts";

function streamedRequest(
  chunks: Uint8Array[],
  headers: HeadersInit = {},
): Request {
  let index = 0;
  return new Request("https://example.test/privacy", {
    method: "POST",
    headers,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[index]);
        index += 1;
      },
    }),
  });
}

Deno.test("bounded body accepts chunked UTF-8 content within the limit", async () => {
  const encoder = new TextEncoder();
  const request = streamedRequest([
    encoder.encode('{"action":'),
    encoder.encode('"create"}'),
  ]);

  assertEquals(
    await readBoundedRequestText(request, 64),
    '{"action":"create"}',
  );
});

Deno.test("bounded body rejects a chunked body that crosses the limit", async () => {
  const encoder = new TextEncoder();
  const request = streamedRequest([
    encoder.encode("12345678"),
    encoder.encode("9"),
  ]);

  const error = await assertRejects(
    () => readBoundedRequestText(request, 8),
    BoundedRequestBodyError,
  );
  assertEquals(error.code, "BODY_TOO_LARGE");
});

Deno.test("bounded body rejects an oversized declared length before reading", async () => {
  const request = new Request("https://example.test/privacy", {
    method: "POST",
    headers: { "content-length": "65" },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    }),
  });

  const error = await assertRejects(
    () => readBoundedRequestText(request, 64),
    BoundedRequestBodyError,
  );
  assertEquals(error.code, "BODY_TOO_LARGE");
});

Deno.test("bounded body counts actual bytes despite a false small header", async () => {
  const encoder = new TextEncoder();
  const request = streamedRequest(
    [encoder.encode("12345"), encoder.encode("67890")],
    { "content-length": "1" },
  );

  const error = await assertRejects(
    () => readBoundedRequestText(request, 8),
    BoundedRequestBodyError,
  );
  assertEquals(error.code, "BODY_TOO_LARGE");
});

Deno.test("bounded body rejects malformed UTF-8", async () => {
  const request = streamedRequest([new Uint8Array([0xc3, 0x28])]);

  const error = await assertRejects(
    () => readBoundedRequestText(request, 8),
    BoundedRequestBodyError,
  );
  assertEquals(error.code, "INVALID_BODY");
});
