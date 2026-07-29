import { isCurrentSessionActive } from "./active-session.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("active session helper accepts only an exact true without error", async () => {
  const active = await isCurrentSessionActive({
    rpc: () => Promise.resolve({ data: true, error: null }),
  });
  assertEquals(active, true);
});

Deno.test("active session helper rejects false and unexpected response shapes", async () => {
  const inactive = await isCurrentSessionActive({
    rpc: () => Promise.resolve({ data: false, error: null }),
  });
  const unexpected = await isCurrentSessionActive({
    rpc: () => Promise.resolve({ data: { active: true }, error: null }),
  });
  assertEquals(inactive, false);
  assertEquals(unexpected, false);
});

Deno.test("active session helper fails closed on RPC errors", async () => {
  const failed = await isCurrentSessionActive({
    rpc: () => Promise.resolve({ data: true, error: { code: "42501" } }),
  });
  assertEquals(failed, false);
});

Deno.test("active session helper fails closed when the client throws", async () => {
  const failed = await isCurrentSessionActive({
    rpc: () => Promise.reject(new Error("network unavailable")),
  });
  assertEquals(failed, false);
});
