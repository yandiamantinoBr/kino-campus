/**
 * Legacy D1 entry kept for optional Cloudflare/Sites tooling.
 * The live session API uses `session-store.ts` (Supabase) so Vercel builds
 * never import `cloudflare:workers`.
 */

export { sessions, responses } from "./schema";

export function getDb(): never {
  throw new Error(
    "getDb()/D1 is not used on the Vercel host. Use session-store helpers instead.",
  );
}
