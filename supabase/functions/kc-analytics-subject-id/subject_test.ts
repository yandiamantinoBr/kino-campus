import {
  createAnalyticsSubjectId,
  isValidAnalyticsIdSecret,
  isValidSupabaseUserId,
} from "./subject.ts";

const USER_ID = "4b39baaf-996b-49ca-a603-b122066946dd";
const SECRET_A = "0123456789abcdef0123456789abcdef";
const SECRET_B = "abcdef0123456789abcdef0123456789";

Deno.test("creates a stable opaque GA4 subject id", async () => {
  const first = await createAnalyticsSubjectId(SECRET_A, USER_ID);
  const second = await createAnalyticsSubjectId(
    SECRET_A,
    USER_ID.toUpperCase(),
  );

  if (!/^kc_[0-9a-f]{32}$/.test(first)) throw new Error("invalid format");
  if (first !== second) throw new Error("subject id must be stable");
  if (first.includes(USER_ID)) throw new Error("raw user id leaked");
});

Deno.test("separates subject ids across secrets", async () => {
  const first = await createAnalyticsSubjectId(SECRET_A, USER_ID);
  const second = await createAnalyticsSubjectId(SECRET_B, USER_ID);
  if (first === second) throw new Error("secret did not separate identities");
});

Deno.test("validates secret and Supabase user id inputs", () => {
  if (!isValidAnalyticsIdSecret(SECRET_A)) {
    throw new Error("valid secret rejected");
  }
  if (isValidAnalyticsIdSecret("too-short")) {
    throw new Error("short secret accepted");
  }
  if (!isValidSupabaseUserId(USER_ID)) throw new Error("valid UUID rejected");
  if (isValidSupabaseUserId("student@example.com")) {
    throw new Error("PII accepted");
  }
});
