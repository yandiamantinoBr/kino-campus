// Offline companion for the real PostgreSQL fixture runner. Reads only stdin.
import { mediaReceiptValid } from "../supabase/functions/cadu-publish/media-correction.ts";
const { receipt, current, input, proofs } = await new Response(
  Deno.stdin.readable,
).json();
if (!mediaReceiptValid(receipt, current, input, proofs)) {
  throw Error("Actual PostgreSQL receipt failed the Edge verifier");
}
console.log("receipt_verified");
