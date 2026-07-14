const SUBJECT_PREFIX = "kino-ga4-user-id:v1:";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isValidAnalyticsIdSecret(secret: string): boolean {
  const length = new TextEncoder().encode(secret).byteLength;
  return length >= 32 && length <= 1024;
}

export function isValidSupabaseUserId(userId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(userId);
}

export async function createAnalyticsSubjectId(
  secret: string,
  userId: string,
): Promise<string> {
  if (!isValidAnalyticsIdSecret(secret) || !isValidSupabaseUserId(userId)) {
    throw new Error("invalid_subject_input");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(SUBJECT_PREFIX + userId.toLowerCase()),
  );

  return "kc_" + bytesToHex(new Uint8Array(signature)).slice(0, 32);
}
