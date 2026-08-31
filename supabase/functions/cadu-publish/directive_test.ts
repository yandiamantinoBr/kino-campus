import {
  boundReviewPublicationDirective,
  normalizeReviewPublicationDirective,
  sha256Hex,
  sourceComparisonKey,
} from "./directive.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const same = Object.is(actual, expected) ||
    JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// Vetores de referência gerados com Node crypto.createHash("sha256").
Deno.test("sha256Hex matches FIPS 180-4 reference vectors", () => {
  assertEquals(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assertEquals(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assertEquals(
    sha256Hex(
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    ),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
  // > 64 bytes: exercita múltiplos blocos com padding.
  assertEquals(
    sha256Hex("cadu-published-source-id-v1\0web.ufg.exemplo:https://exemplo.ufg.br/n/203411"),
    "5a6184ad3c64f82b22dd142978a2ab6920fedda587ba1ce9ecf83b8450ddc160",
  );
});

const SOURCE_ID = "web.ufg.exemplo:https://exemplo.ufg.br/n/203411";
const SOURCE_URL = "https://exemplo.ufg.br/n/203411";
const ITEM_VERSION = sha256Hex("item-version:1");
const REVISION = sha256Hex("source-revision-1");
const RESOLVED_AT = Date.parse("2026-08-30T09:24:29Z") / 1000;

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    module: "eventos",
    url: SOURCE_URL,
    sourceUrl: SOURCE_URL,
    sourceId: SOURCE_ID,
    sourceRevision: REVISION,
    reviewId: "5515ad9d-0747-50c5-bfda-2fb06be09055",
    itemVersion: ITEM_VERSION,
    reviewGateReasons: ["feed_item_low_score"],
    gateReason: "feed_item_low_score",
    reviewGateReasonsAvailable: true,
    ...overrides,
  };
}

function buildDirective(item: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    review_id: "5515ad9d-0747-50c5-bfda-2fb06be09055",
    item_version: ITEM_VERSION,
    resolution_id: "848f3f1e-b4cb-5572-a63e-b6bc3857f34b",
    resolved_at: RESOLVED_AT,
    automatic: false,
    approval_scope: "editorial_override",
    source_comparison_key: sourceComparisonKey(String(item.sourceId)),
    source_revision: REVISION,
    source_url: SOURCE_URL,
    module: "eventos",
    review_gate_reasons: ["feed_item_low_score"],
    ...overrides,
  };
}

Deno.test("sourceComparisonKey matches the Node content-addressed identity", () => {
  assertEquals(
    sourceComparisonKey(SOURCE_ID),
    "5a6184ad3c64f82b22dd142978a2ab6920fedda587ba1ce9ecf83b8450ddc160",
  );
});

Deno.test("normalizer rejects malformed directives", () => {
  assertEquals(normalizeReviewPublicationDirective(null), null);
  assertEquals(normalizeReviewPublicationDirective("nope"), null);
  assertEquals(normalizeReviewPublicationDirective({}), null);
  const directive = buildDirective(buildItem());
  assertEquals(normalizeReviewPublicationDirective(directive)?.review_id,
    "5515ad9d-0747-50c5-bfda-2fb06be09055");
  const extraKey = { ...directive, extra: 1 };
  assertEquals(normalizeReviewPublicationDirective(extraKey), null);
  const badScope = { ...directive, automatic: false, approval_scope: "gate_free_automatic" };
  assertEquals(normalizeReviewPublicationDirective(badScope), null);
  const automaticOk = {
    ...directive,
    automatic: true,
    approval_scope: "gate_free_automatic",
    review_gate_reasons: [],
  };
  assert(normalizeReviewPublicationDirective(automaticOk) !== null, "automatic directive should normalize");
  const httpSource = { ...directive, source_url: "http://exemplo.ufg.br/n/203411" };
  assertEquals(normalizeReviewPublicationDirective(httpSource), null);
});

Deno.test("bound directive accepts the exact reviewed record", () => {
  const item = buildItem();
  item.reviewPublicationDirective = buildDirective(item);
  const bound = boundReviewPublicationDirective(item);
  assert(bound !== null, "directive should bind");
  assertEquals(bound?.module, "eventos");
});

Deno.test("bound directive rejects a different source record", () => {
  const item = buildItem();
  item.reviewPublicationDirective = buildDirective(item, {
    source_comparison_key: sourceComparisonKey("web.ufg.outro:https://outro.ufg.br/n/1"),
  });
  assertEquals(boundReviewPublicationDirective(item), null);
});

Deno.test("bound directive rejects source revision drift", () => {
  const item = buildItem({ sourceRevision: sha256Hex("drifted") });
  item.reviewPublicationDirective = buildDirective(buildItem());
  assertEquals(boundReviewPublicationDirective(item), null);
});

Deno.test("bound directive rejects gate provenance mismatch", () => {
  const item = buildItem({ reviewGateReasons: ["other_gate"] });
  item.reviewPublicationDirective = buildDirective(buildItem());
  assertEquals(boundReviewPublicationDirective(item), null);

  const noProvenance = buildItem({
    reviewGateReasonsAvailable: false,
    gateReason: "feed_item_low_score",
  });
  noProvenance.reviewPublicationDirective = buildDirective(buildItem());
  assertEquals(boundReviewPublicationDirective(noProvenance), null);
});

Deno.test("bound directive rejects version or review id mismatch", () => {
  const item = buildItem({ itemVersion: sha256Hex("other-content") });
  item.reviewPublicationDirective = buildDirective(buildItem());
  assertEquals(boundReviewPublicationDirective(item), null);

  const otherReview = buildItem({ reviewId: "0bd5c984-ac7c-5963-bbf8-14ecd1ca89cc" });
  otherReview.reviewPublicationDirective = buildDirective(buildItem());
  assertEquals(boundReviewPublicationDirective(otherReview), null);
});

Deno.test("bound directive rejects missing or malformed directives", () => {
  const item = buildItem();
  assertEquals(boundReviewPublicationDirective(item), null);
  const broken = buildItem();
  broken.reviewPublicationDirective = { review_id: "nope" };
  assertEquals(boundReviewPublicationDirective(broken), null);
});
