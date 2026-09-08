type Row = Record<string, unknown>;
const obj = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const terminal = new Set(["closed", "expired", "past", "ended", "cancelled", "canceled", "encerrado", "encerrada", "cancelado", "cancelada", "finalizado", "finalizada", "deleted", "hidden", "archived"]);
const status = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
function parts(row: Row): Row[] { const m = obj(row.metadata); return [row, m, obj(m.dates), obj(m.validity)]; }
function values(row: Row, keys: string[]): unknown[] { return parts(row).flatMap(p => keys.map(k => p[k])).filter(v => v !== undefined && v !== null); }
function today(now: number): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  return ["year", "month", "day"].map(k => p.find(v => v.type === k)!.value).join("-");
}
function dateMs(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const civil = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/);
  if (!civil) return NaN;
  const [year, month, day] = civil.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return NaN;
  const candidate = value.length === 10 ? `${value}T23:59:59.999-03:00`
    : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value.replace(" ", "T")}-03:00` : value;
  return Date.parse(candidate);
}
function past(value: unknown, now: number): boolean { return Number.isFinite(dateMs(value)) && dateMs(value) <= now; }
// Match the aliases consumed by kc-post-lifecycle.shared.js; conflicting evidence
// stays closed here even when the public renderer selects only its first alias.
const applicationDates = ["applicationDeadline", "application_deadline", "applicationDeadlineAt", "application_deadline_at", "deadlineAt", "deadline_at", "deadlineDate", "deadline_date", "deadline", "dataLimite", "data_limite", "inscricoesAte", "inscricoes_ate", "prazoInscricao", "prazo_inscricao", "submissionDeadline", "submission_deadline", "prazo"];
const eventEndDates = ["eventEndsAt", "event_ends_at", "eventEnd", "event_end", "endsAt", "ends_at", "endAt", "end_at", "dataFimEvento", "data_fim_evento", "dataFim", "data_fim", "dateEnd", "date_end", "dateEndAt", "date_end_at"];
const eventStartDates = ["eventStartsAt", "event_starts_at", "eventStart", "event_start", "startsAt", "starts_at", "startAt", "start_at", "dataInicioEvento", "data_inicio_evento", "dataEvento", "data_evento", "eventDate", "event_date", "event_date_detected", "dateStart", "date_start", "date", "data"];
const closedFlags = ["expired", "isExpired", "is_expired", "isClosed", "is_closed"];
function flaggedClosed(row: Row): boolean { return [row, obj(row.metadata)].some(p => closedFlags.some(k => p[k] === true)); }
function axisClosed(row: Row, axis: "application" | "event", now: number): boolean {
  if (values(row, [`${axis}Status`, `${axis}_status`]).some(v => terminal.has(status(v)))) return true;
  const dates = values(row, axis === "application" ? applicationDates : eventEndDates);
  const effectiveDates = dates.length || axis === "application" ? dates : values(row, eventStartDates);
  return effectiveDates.some(v => past(v, now));
}
function expiry(row: Row): number { return dateMs(row.expires_at); }
function genericClosed(row: Row, now: number): boolean {
  const axisDates = values(row, row.module === "eventos" ? [...eventEndDates, ...eventStartDates] : applicationDates);
  if (axisDates.some(v => Number.isFinite(dateMs(v)))) return false;
  const active = values(row, ["activeUntil", "active_until"]).find(v => Number.isFinite(dateMs(v)));
  if (active !== undefined) return past(active, now);
  if (Number.isFinite(expiry(row))) return expiry(row) <= now;
  return values(row, ["expiresAt", "expires_at", "validUntil", "valid_until", "validThrough", "data_encerramento", "expirationDate", "expiration_date"]).some(v => past(v, now));
}
function future(value: unknown, now: number): boolean {
  if (typeof value !== "string" || !Number.isFinite(dateMs(value))) return false;
  return value.length === 10 ? value > today(now) : dateMs(value) > now;
}
const isFalse = (value: unknown) => value === false || value === "false";
const isTrue = (value: unknown) => value === true || value === "true";

// This route repairs facts. Reopening publication or an application requires
// its own authorization, even when the string status stays "published".
export function integrityReactivationReason(current: Row, next: Row, now = Date.now()): string | null {
  if (flaggedClosed(current) && !flaggedClosed(next)) return "closed_flag";
  if (genericClosed(current, now) && !genericClosed(next, now)) return "generic_expiry";
  if (Number.isFinite(expiry(current)) && expiry(current) <= now && (!Number.isFinite(expiry(next)) || expiry(next) > now)) return "expired_post";
  if (current.status === "closed" && (!Number.isFinite(expiry(next)) || expiry(next) > now)) return "closed_post";
  for (const axis of (current.module === "eventos" ? ["application", "event"] : ["application"]) as ("application" | "event")[]) {
    if (axisClosed(current, axis, now) && !axisClosed(next, axis, now)) return `${axis}_closed`;
  }
  const beforeApply = values(current, ["canApply", "can_apply"]);
  const afterApply = values(next, ["canApply", "can_apply"]);
  const futureOpening = values(next, ["applicationOpensAt", "application_opens_at"]).some(v => future(v, now));
  const openClaim = values(next, ["applicationStatus", "application_status"]).some(v => ["open", "active", "accepting"].includes(status(v)));
  if (beforeApply.some(isFalse) && (afterApply.some(isTrue) || openClaim ||
    (!afterApply.some(isFalse) && !axisClosed(next, "application", now) && !futureOpening))) return "application_permission";
  if (axisClosed(current, "application", now)) {
    const cta = values(next, ["actionKey", "action_key", "actionLabel", "action_label"]).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/\b(?:inscrev|inscri|candidat|matricul|submet|submiss|registr)/.test(cta)) return "closed_application_cta";
  }
  for (const key of ["temporalStatus", "lifecycleStatus", "lifecycle_status"]) {
    if (values(current, [key]).some(v => terminal.has(status(v))) && !values(next, [key]).some(v => terminal.has(status(v)))) return "terminal_lifecycle";
  }
  return null;
}

export function isActiveIntegrityScoreRepair(current: Row, next: Row, score: unknown, now = Date.now()): boolean {
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1 ||
    current.status !== "published" || current.visibility !== "public" || flaggedClosed(current) || genericClosed(current, now) || !Number.isFinite(expiry(current)) || expiry(current) <= now ||
    integrityReactivationReason(current, next, now)) return false;
  const axis = current.module === "eventos" ? "event" : "application";
  if (axisClosed(current, axis, now)) return false;
  const dates = values(current, axis === "application" ? applicationDates : eventEndDates);
  const knownDates = dates.length || axis === "application" ? dates : values(current, eventStartDates);
  return knownDates.some(v => Number.isFinite(dateMs(v)) && !past(v, now));
}
