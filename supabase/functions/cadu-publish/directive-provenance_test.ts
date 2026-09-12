import assert from "node:assert/strict";
import { boundReviewPublicationDirective, sourceComparisonKey } from "./directive.ts";
import { mapItemToPost } from "./mapper.ts";
import { validateItem, type CaduItem } from "./schema.ts";
import { handlePublish } from "./index.ts";

const PROVENANCE = ["needs_review", "curator_review_required", "instagram_community_relevance_review"];

function item(gates: string[] = []): CaduItem & Record<string, unknown> {
  const sourceId = "web.ufg.fixture:https://ufg.br/n/999999";
  const sourceUrl = "https://ufg.br/n/999999";
  const reviewId = "83107147-80c5-5352-b334-9ecb094e1121";
  return {
    title: "Curso com inscrições abertas para a comunidade UFG", module: "oportunidades", category: "cursos-capacitacoes",
    description: "A comunidade universitária pode participar do curso com atividades de formação acadêmica. Consulte os requisitos, a programação e os documentos exigidos na página institucional.\n\nInscrições até 23/09/2099 pelo formulário oficial da universidade.",
    link: "https://ufg.br/formulario/curso", linkAsCta: true, score: 0.75,
    sourceId, sourceUrl, sourceRevision: "a".repeat(64), reviewId, itemVersion: "b".repeat(64),
    reviewGateReasons: gates, gateReason: gates[0] || null, reviewGateReasonsAvailable: true,
    dates: { applicationDeadline: "2099-09-23", applicationStatus: "open", canApply: true, applicationPurpose: "registration" },
    reviewPublicationDirective: {
      review_id: reviewId, item_version: "b".repeat(64), resolution_id: "21786163-d070-47ca-86e4-ced17a0e911f",
      resolved_at: 1789224000, automatic: true, approval_scope: "gate_free_automatic",
      source_comparison_key: sourceComparisonKey(sourceId), source_revision: "a".repeat(64),
      source_url: sourceUrl, module: "oportunidades", review_gate_reasons: gates,
    },
  };
}

Deno.test("automatic routing provenance remains attached to the exact mapped publication", () => {
  for (const gates of [[], ...PROVENANCE.map(gate => [gate]), PROVENANCE]) {
    const source = item(gates);
    assert.equal(validateItem(source).ok, true);
    assert(boundReviewPublicationDirective(source), JSON.stringify(gates));
    const mapped = mapItemToPost(source);
    assert.deepEqual((mapped.row.metadata.review_publication_directive as Record<string, unknown>).review_gate_reasons, gates);
  }
});

Deno.test("substantive and unknown automatic gates cannot acquire editorial authority", () => {
  for (const gate of ["expired", "source_page_unverified", "instagram_without_official_source", "opportunity_without_active_window", "future_new_gate"]) {
    const source = item([gate]);
    assert.equal(boundReviewPublicationDirective(source), null, gate);
    assert.equal(mapItemToPost(source).row.metadata.review_publication_directive, undefined);
  }
});

Deno.test("provenance does not weaken exact source revision, review version, gate or scope checks", () => {
  const changes: Array<(source: Record<string, any>) => void> = [
    source => source.sourceRevision = "c".repeat(64),
    source => source.sourceId += "-other",
    source => source.itemVersion = "d".repeat(64),
    source => source.reviewId = "11786163-d070-47ca-86e4-ced17a0e911f",
    source => source.reviewGateReasons = [],
    source => source.reviewGateReasonsAvailable = false,
    source => source.reviewPublicationDirective.approval_scope = "editorial_override",
    source => source.reviewPublicationDirective.automatic = false,
    source => source.reviewPublicationDirective.resolution_id = "invalid",
    source => source.reviewPublicationDirective.policy_revision = "invented-unaccepted-field",
  ];
  for (const change of changes) {
    const source = item(["needs_review"]);
    change(source);
    assert.equal(boundReviewPublicationDirective(source), null);
  }
});

function readOnlyAdmin() {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "neq", "contains", "order", "limit", "or", "in"]) query[method] = () => query;
  query.maybeSingle = () => Promise.resolve({ data: null, error: null });
  query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve);
  query.insert = query.update = () => { throw Error("unexpected production-style write in dry-run"); };
  return { from: (table: string) => { assert.equal(table, "posts"); return query; } } as any;
}

Deno.test("real dry-run publishes no data and retains provenance while expired applications remain blocked", async () => {
  const source = item(["curator_review_required"]);
  const valid = await handlePublish(readOnlyAdmin(), "test-publisher", { item: source, options: { dryRun: true } });
  const accepted = await valid.json();
  assert.equal(accepted.code, "DRY_RUN", JSON.stringify(accepted));
  assert(accepted.row.metadata.review_publication_directive);
  source.dates = { ...source.dates, applicationDeadline: "2000-09-23" };
  const expired = await handlePublish(readOnlyAdmin(), "test-publisher", { item: source, options: { dryRun: true } });
  const blocked = await expired.json();
  assert.equal(blocked.code, "QUALITY_BLOCKED", JSON.stringify(blocked));
  assert(blocked.quality.blockingWarnings.includes("application_deadline_past"));
});
