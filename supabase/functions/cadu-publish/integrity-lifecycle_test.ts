import assert from "node:assert/strict";
import {
  integrityReactivationReason,
  isActiveIntegrityScoreRepair,
} from "./integrity-lifecycle.ts";

type Metadata = Record<string, unknown>;
const NOW = Date.parse("2026-09-08T01:00:00Z"); // Still September 7 in Sao Paulo.

function opportunity(metadata: Metadata = {}) {
  return {
    module: "oportunidades",
    status: "published",
    visibility: "public",
    expires_at: "2100-01-01T00:00:00Z",
    metadata: { dates: { applicationDeadline: "2026-10-26" }, ...metadata },
  };
}

Deno.test("active repair respects strict public closure flags at metadata root", () => {
  const next = opportunity();
  for (const flag of ["expired", "isExpired", "is_expired", "isClosed", "is_closed"]) {
    const current = opportunity({ [flag]: true });
    assert.equal(isActiveIntegrityScoreRepair(current, next, 0.69, NOW), false, flag);
    assert.equal(integrityReactivationReason(current, next, NOW), "closed_flag", flag);
  }
  // The public closure contract checks booleans, not arbitrary truthy strings.
  assert.equal(isActiveIntegrityScoreRepair(opportunity({ isExpired: "false" }), next, 0.69, NOW), true);
});

Deno.test("active repair respects Portuguese terminal statuses", () => {
  const next = opportunity();
  for (const applicationStatus of ["encerrado", "encerrada", "cancelado", "cancelada", "finalizado", "finalizada"]) {
    const current = opportunity({ applicationStatus });
    assert.equal(isActiveIntegrityScoreRepair(current, next, 0.69, NOW), false, applicationStatus);
    assert.equal(integrityReactivationReason(current, next, NOW), "application_closed", applicationStatus);
  }
});

Deno.test("past public deadline aliases cannot borrow activity from a future canonical date", () => {
  const next = opportunity();
  for (const alias of ["applicationDeadlineAt", "application_deadline_at", "deadlineAt", "deadline_at", "deadlineDate"]) {
    const current = opportunity({ [alias]: "2020-01-01T17:00:00-03:00" });
    assert.equal(isActiveIntegrityScoreRepair(current, next, 0.69, NOW), false, alias);
    assert.equal(integrityReactivationReason(current, next, NOW), "application_closed", alias);
  }
});

Deno.test("past public event-end aliases remain terminal despite future normalized dates", () => {
  const next = {
    ...opportunity({ dates: { eventStartsAt: "2026-11-09", eventEndsAt: "2026-11-13" } }),
    module: "eventos",
  };
  for (const alias of ["eventEnd", "event_end", "endsAt", "ends_at", "endAt", "end_at", "dataFimEvento", "dataFim", "data_fim", "dateEnd"]) {
    const current = { ...next, metadata: { ...next.metadata, [alias]: "2020-01-01" } };
    assert.equal(isActiveIntegrityScoreRepair(current, next, 0.69, NOW), false, alias);
    assert.equal(integrityReactivationReason(current, next, NOW), "event_closed", alias);
  }
});

Deno.test("impossible civil dates and clock values do not establish active repair eligibility", () => {
  for (const deadline of [
    "2099-02-30", "2099-02-29", "2099-04-31", "2099-13-01", "2099-01-00",
    "2099-02-30T12:00:00Z", "2099-01-01T25:00:00Z", "2099-01-01T23:61:00Z",
  ]) {
    const current = opportunity({ dates: { applicationDeadline: deadline } });
    assert.equal(isActiveIntegrityScoreRepair(current, current, 0.69, NOW), false, deadline);
  }
  const leap = opportunity({ dates: { applicationDeadline: "2028-02-29" } });
  assert.equal(isActiveIntegrityScoreRepair(leap, leap, 0.69, NOW), true);
});

Deno.test("date-only deadlines remain valid through their civil day in Sao Paulo", () => {
  const current = opportunity({ dates: { applicationDeadline: "2026-09-07" } });
  assert.equal(isActiveIntegrityScoreRepair(current, current, 0.69, Date.parse("2026-09-08T02:59:59Z")), true);
  assert.equal(isActiveIntegrityScoreRepair(current, current, 0.69, Date.parse("2026-09-08T03:00:00Z")), false);
  const timed = opportunity({ dates: { applicationDeadline: "2026-09-08T00:30:00-03:00" } });
  assert.equal(isActiveIntegrityScoreRepair(timed, timed, 0.69, NOW), true);
});

Deno.test("CONPEEX-like future event permits factual repair while evaluator applications stay closed", () => {
  const current = {
    ...opportunity({ dates: {
      eventStartsAt: "2026-10-14", eventEndsAt: "2026-10-16", eventStatus: "unknown",
      applicationDeadline: "2026-08-14", applicationStatus: "closed", canApply: false,
    } }),
    module: "eventos",
  };
  const next = {
    ...current,
    metadata: { dates: {
      eventStartsAt: "2026-11-09", eventEndsAt: "2026-11-13", eventStatus: "upcoming",
      applicationDeadline: "2026-08-28", applicationStatus: "closed",
    } },
  };
  assert.equal(integrityReactivationReason(current, next, NOW), null);
  assert.equal(isActiveIntegrityScoreRepair(current, next, 0.69, NOW), true);
  assert.equal(isActiveIntegrityScoreRepair(
    { ...current, module: "oportunidades" }, { ...next, module: "oportunidades" }, 0.69, NOW,
  ), false);
  const reopened = { ...next, metadata: { dates: {
    ...next.metadata.dates, applicationDeadline: "2099-01-01", applicationStatus: "open", canApply: true,
  } } };
  assert.equal(integrityReactivationReason(current, reopened, NOW), "application_closed");
});

Deno.test("an opportunity's examination date is not its application closing axis", () => {
  const current = opportunity({ dates: {
    applicationOpensAt: "2026-09-25", applicationDeadline: "2026-10-26", canApply: false,
    eventStartsAt: "2020-01-01", eventEndsAt: "2020-01-01",
  } });
  const next = opportunity({ dates: {
    applicationOpensAt: "2026-09-25", applicationDeadline: "2026-10-26",
    eventStartsAt: "2026-12-13", eventEndsAt: "2026-12-13",
  } });
  assert.equal(integrityReactivationReason(current, next, NOW), null);
  assert.equal(isActiveIntegrityScoreRepair(current, next, 0.69, NOW), true);
});
