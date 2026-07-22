import assert from "node:assert/strict";
import {
  INSTITUTIONAL_REVIEW_POLICY_CODE,
  institutionalReviewIdempotencyKey,
  institutionalReviewRpcArguments,
  parseInstitutionalReview,
} from "./review.ts";

const SOURCE_REVISION = "b".repeat(64);
const REGISTRY_SHA256 = "a".repeat(64);

function validEnvelope(): Record<string, unknown> {
  return {
    action: "review",
    intent: "review",
    source_id: "web.ufg.portal",
    source_url: "https://ufg.br/",
    content_url: "https://ufg.br/",
    instagram_handle: "ufg_oficial",
    content_kind: "institutional_site",
    idempotency_key: institutionalReviewIdempotencyKey(
      "web.ufg.portal",
      SOURCE_REVISION,
    ),
    source_revision: SOURCE_REVISION,
    registry_sha256: REGISTRY_SHA256,
    name: "UFG — Universidade Federal de Goiás",
    note: "Fonte oficial confirmada",
    tier: 1,
    category: "university",
    source: "cadu-admin-map-ufg",
  };
}

Deno.test("institutional review parses the exact revision-bound envelope", () => {
  const parsed = parseInstitutionalReview(validEnvelope());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.sourceId, "web.ufg.portal");
  assert.equal(parsed.value.sourceUrl, "https://ufg.br/");
  assert.equal(parsed.value.contentUrl, "https://ufg.br/");
  assert.equal(parsed.value.instagramHandle, "ufg_oficial");
  assert.equal(INSTITUTIONAL_REVIEW_POLICY_CODE, "INSTITUTIONAL_SOURCE_REVIEW");
});

Deno.test("institutional review preserves safe multiline notes and rejects other controls", () => {
  const multiline = "Linha 1\n\tLinha 2\rLinha 3";
  const parsed = parseInstitutionalReview({
    ...validEnvelope(),
    note: multiline,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.note, multiline);

  for (const unsafe of ["nul\u0000", "vertical\u000btab", "delete\u007f"]) {
    const rejected = parseInstitutionalReview({ ...validEnvelope(), note: unsafe });
    assert.equal(rejected.ok, false, unsafe);
    if (!rejected.ok) assert.match(rejected.errors.join(" "), /note deve ter/);
  }
});

Deno.test("institutional review fails closed on stale identity or noncanonical Instagram", () => {
  const stale = parseInstitutionalReview({
    ...validEnvelope(),
    source_revision: "c".repeat(64),
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.match(stale.errors.join(" "), /idempotency_key/);

  const instagramUrl = parseInstitutionalReview({
    ...validEnvelope(),
    instagram_handle: "https://www.instagram.com/ufg_oficial/",
  });
  assert.equal(instagramUrl.ok, false);
  if (!instagramUrl.ok) {
    assert.match(instagramUrl.errors.join(" "), /instagram_handle/);
  }

  const mismatchedContent = parseInstitutionalReview({
    ...validEnvelope(),
    content_url: "https://outra.ufg.br/",
  });
  assert.equal(mismatchedContent.ok, false);
  if (!mismatchedContent.ok) {
    assert.match(
      mismatchedContent.errors.join(" "),
      /content_url deve coincidir/,
    );
  }

  const extraField = parseInstitutionalReview({
    ...validEnvelope(),
    module: "oportunidades",
  });
  assert.equal(extraField.ok, false);
  if (!extraField.ok) {
    assert.match(extraField.errors.join(" "), /campos desconhecidos: module/);
  }

  const missingField = { ...validEnvelope() };
  delete missingField.note;
  const missing = parseInstitutionalReview(missingField);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(
      missing.errors.join(" "),
      /campos obrigatorios ausentes: note/,
    );
  }

  for (
    const [label, patch, pattern] of [
      ["string tier", { tier: "1" }, /tier deve ser o numero inteiro/],
      ["multiline name", { name: "UFG\nCampus" }, /name deve ser canonico/],
      [
        "long category",
        { category: "x".repeat(81) },
        /category deve ser canonica/,
      ],
      [
        "blank instagram",
        { instagram_handle: "" },
        /instagram_handle deve ser canonico/,
      ],
      [
        "noncanonical URL",
        { source_url: "https://ufg.br" },
        /source_url deve estar em forma canonica/,
      ],
    ] as const
  ) {
    const result = parseInstitutionalReview({ ...validEnvelope(), ...patch });
    assert.equal(result.ok, false, label);
    if (!result.ok) assert.match(result.errors.join(" "), pattern, label);
  }
});

Deno.test("institutional review maps only to the dedicated queue RPC", () => {
  const parsed = parseInstitutionalReview(validEnvelope());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const args = institutionalReviewRpcArguments(
    parsed.value,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.deepEqual(Object.keys(args).sort(), [
    "p_category",
    "p_content_kind",
    "p_content_url",
    "p_idempotency_key",
    "p_instagram_handle",
    "p_intent",
    "p_name",
    "p_note",
    "p_origin",
    "p_registry_sha256",
    "p_requested_by",
    "p_source_id",
    "p_source_revision",
    "p_source_url",
    "p_tier",
  ]);
  assert.equal(args.p_source_id, "web.ufg.portal");
  assert.equal(args.p_requested_by, "11111111-1111-4111-8111-111111111111");
  assert.equal("module" in args, false);
  assert.equal("status" in args, false);
});
