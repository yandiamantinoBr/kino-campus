// Source-bound availability, not an inferred application deadline.
import type { CaduItem } from "./schema.ts";

const CONTRACT = "cadu-self-paced-course-v1";
const MODE = "self_paced_no_deadline";
const ROOT = "https://iptsp.ufg.br/n/203499";
const PORTAL = "https://cursosqualificacao.campusvirtual.fiocruz.br/hotsite/leptospirosetdtp/";
const HOUR = 3_600_000;
const HASH = /^[a-f0-9]{64}$/;
const EVIDENCE_DIGEST = "5e6c4dc953a90ff02f664d89a59bb75655a827d08f3663bc02fe2ab3f19ee223";
const DATE_FIELDS = [
  "applicationOpensAt", "applicationDeadline", "eventStartsAt", "eventEndsAt", "resultPublishedAt",
  "application_opens_at", "application_deadline", "event_starts_at", "event_ends_at", "result_published_at",
  "deadlineDate", "deadline_date", "deadlineAt", "deadline_at", "deadline", "dateStart", "dateEnd", "startDate", "endDate", "start", "end",
  "date_start", "date_end", "data_evento", "data_fim_evento",
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function fail(): never { throw new TypeError("self_paced_course_validity_invalid"); }
function instant(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return fail();
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) return fail();
  return ms;
}
function exactSource(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === "https://iptsp.ufg.br" && !url.username && !url.password && !url.port
      && !url.search && !url.hash && /^\/n\/203499(?:-iptsp-indica-fiocruz-oferece-curso-online-gratuito-sobre-leptospirose)?\/?$/.test(url.pathname);
  } catch { return false; }
}

export interface SelfPacedValidity {
  contract: string;
  mode: "no_final_deadline_informed";
  sourceRegistryId: string;
  sourceUrl: string;
  courseKey: string;
  courseUrl: string;
  checkedAt: string;
  nextCheckAt: string;
  verificationExpiresAt: string;
  evidenceDigest: string;
  sources: Array<{ url: string; sha256: string }>;
}

export function selfPacedValidityForItem(item: CaduItem, now = new Date()): SelfPacedValidity | null {
  const dates = record(item.dates) || {};
  const raw = dates.verifiedSelfPacedCourse;
  if (dates.applicationWindowMode !== MODE && raw == null) return null;
  const proof = record(raw);
  if (dates.applicationWindowMode !== MODE || !proof || item.module !== "oportunidades"
    || item.category !== "cursos-capacitacoes" || item.sourceRegistryId !== "web.ufg.iptsp"
    || !exactSource(item.sourceUrl) || proof.contract !== CONTRACT
    || proof.sourceRegistryId !== item.sourceRegistryId || !exactSource(proof.sourceUrl)
    || proof.courseKey !== "leptospirosetdtp:1365" || proof.courseUrl !== PORTAL + "login"
    || proof.presentationUrl !== PORTAL + "8952" || item.link !== proof.courseUrl
    || proof.availability !== "available" || proof.deadlineStatus !== "not_informed"
    || proof.evidenceDigest !== EVIDENCE_DIGEST) return fail();
  const proofKeys = ["contract", "sourceRegistryId", "sourceUrl", "courseUrl", "presentationUrl", "courseKey",
    "checkedAt", "nextCheckAt", "verificationExpiresAt", "availability", "deadlineStatus", "capacity", "evidenceDigest", "sources"];
  if (Object.keys(proof).sort().join("|") !== proofKeys.sort().join("|") || proof.sourceUrl !== ROOT
    || dates.applicationStatus !== "open" || dates.canApply !== true
    || dates.applicationPurpose !== "registration" || dates.applicationMethod !== "authenticated_portal"
    || item.expired === true || item.isExpired === true || dates.expired === true || dates.isExpired === true) return fail();
  for (const container of [item, dates]) {
    for (const [key, expected] of [["applicationStatus", "open"], ["canApply", true],
      ["applicationPurpose", "registration"], ["applicationMethod", "authenticated_portal"],
      ["application_status", "open"], ["can_apply", true], ["application_purpose", "registration"],
      ["application_method", "authenticated_portal"]]) {
      if (container[key as string] !== undefined && container[key as string] !== null && container[key as string] !== expected) return fail();
    }
    if (container.hasDeadline === true || container.has_deadline === true
      || (Array.isArray(container.futureDates) && container.futureDates.length)
      || (Array.isArray(container.future_dates) && container.future_dates.length)) return fail();
  }
  if (DATE_FIELDS.some(key => [item[key], dates[key]].some(value => value !== undefined && value !== null && value !== ""))) return fail();
  const capacity = record(proof.capacity);
  if (!capacity || Object.keys(capacity).sort().join("|") !== "enrolled|total"
    || capacity.total !== 30000 || !Number.isInteger(capacity.enrolled)
    || Number(capacity.enrolled) < 0 || Number(capacity.enrolled) >= 30000) return fail();
  const checked = instant(proof.checkedAt), next = instant(proof.nextCheckAt), expiry = instant(proof.verificationExpiresAt);
  const reference = now.getTime();
  if (!Number.isFinite(reference) || checked > reference + 300_000 || expiry <= reference
    || next - checked !== 24 * HOUR || expiry - checked !== 72 * HOUR) return fail();
  if (!Array.isArray(proof.sources) || proof.sources.length !== 3) return fail();
  const expected = new Set([ROOT, PORTAL + "login", PORTAL + "8952"]);
  const sources: Array<{ url: string; sha256: string }> = [];
  for (const rawReceipt of proof.sources) {
    const receipt = record(rawReceipt);
    if (!receipt || Object.keys(receipt).sort().join("|") !== "sha256|url"
      || typeof receipt.url !== "string" || !expected.delete(receipt.url)
      || typeof receipt.sha256 !== "string" || !HASH.test(receipt.sha256)) return fail();
    sources.push({ url: receipt.url, sha256: receipt.sha256 });
  }
  if (expected.size) return fail();
  return {
    contract: CONTRACT, mode: "no_final_deadline_informed", sourceRegistryId: "web.ufg.iptsp",
    sourceUrl: ROOT, courseKey: "leptospirosetdtp:1365", courseUrl: PORTAL + "login",
    checkedAt: String(proof.checkedAt), nextCheckAt: String(proof.nextCheckAt),
    verificationExpiresAt: String(proof.verificationExpiresAt), evidenceDigest: proof.evidenceDigest, sources,
  };
}
