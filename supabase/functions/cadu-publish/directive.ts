// KinoCampus — Edge Function cadu-publish: review publication directives.
//
// Espelho estrutural do contrato `cadu-review-publication-directives-v1`
// (openclaw-cadu: data/.openclaw/workspace/scripts/lib/review-publication-directive.js).
//
// A Central de Revisões (cadu-api) é a autoridade editorial de um item. O
// publisher openclaw-cadu só anexa a diretiva ao item depois de revalidar o
// vínculo com o registro exato DENTRO da prova de aprovação assinada (Ed25519,
// content-addressed). Aqui validamos novamente a forma e o vínculo com o item
// recebido para autorizar a isenção do gate de score do curador. Fail-closed:
// qualquer dúvida, a diretiva não se aplica — é autoridade para revisitar UM
// registro exato, nunca um bypass transferível.

export const REVIEW_PUBLICATION_DIRECTIVES_CONTRACT =
  "cadu-review-publication-directives-v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const REASON_RE = /^[a-z][a-z0-9_]{1,79}$/;
const REASON_LIMIT = 20;
const SOURCE_ID_KEY_PREFIX = "cadu-published-source-id-v1\0";
const DIRECTIVE_MODULES = new Set(["eventos", "oportunidades"]);
const EXPECTED_KEYS = [
  "approval_scope",
  "automatic",
  "item_version",
  "module",
  "resolution_id",
  "resolved_at",
  "review_gate_reasons",
  "review_id",
  "source_comparison_key",
  "source_revision",
  "source_url",
] as const;

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 puro (FIPS 180-4, com padding) — síncrono e sem dependências. */
export function sha256Hex(input: string): string {
  const message = new TextEncoder().encode(input);
  const bitLength = message.length * 8;
  const paddedLength = (((message.length + 8) >> 6) + 1) << 6;
  const words = new Uint32Array(paddedLength >> 2);
  for (let i = 0; i < message.length; i++) {
    words[i >> 2] |= message[i] << (24 - (i % 4) * 8);
  }
  words[message.length >> 2] |= 0x80 << (24 - (message.length % 4) * 8);
  words[words.length - 1] = bitLength >>> 0;
  words[words.length - 2] = Math.floor(bitLength / 0x100000000);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

  for (let offset = 0; offset < words.length; offset += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[offset + i];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

export function sourceComparisonKey(sourceId: string): string {
  return sha256Hex(SOURCE_ID_KEY_PREFIX + sourceId);
}

function safeDirectiveSourceUrl(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || value.length > 2048) {
    return "";
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password ||
    (parsed.port && parsed.port !== "443") || !hostname ||
    hostname.endsWith(".") || hostname === "localhost" ||
    hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
    hostname.endsWith(".internal") || hostname.endsWith(".invalid") ||
    hostname.endsWith(".test") || hostname.endsWith(".example") ||
    !hostname.includes(".") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")
  ) {
    return "";
  }
  const blockedMarkers = [
    "token", "secret", "password", "passwd", "credential", "signature",
    "apikey", "jwt",
  ];
  const blockedParts = new Set(["auth", "authorization", "key", "api_key", "sig"]);
  for (const key of parsed.searchParams.keys()) {
    const normalized = key.toLowerCase().replace(/-/g, "_");
    if (
      blockedMarkers.some((marker) => normalized.includes(marker)) ||
      normalized.split(/[^a-z0-9]+/).some((part) => blockedParts.has(part))
    ) {
      return "";
    }
  }
  return value;
}

/** Canonicalização leve e determinística (mesma URL ⇒ mesma identidade). */
function directiveSourceIdentity(value: string): string {
  const safe = safeDirectiveSourceUrl(value);
  if (!safe) return "";
  try {
    const parsed = new URL(safe);
    const path = parsed.pathname.replace(/\/+$/, "") + parsed.search;
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}`;
  } catch {
    return "";
  }
}

function normalizeReasons(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > REASON_LIMIT) return null;
  const normalized: string[] = [];
  for (const reason of value) {
    if (
      typeof reason !== "string" || reason !== reason.trim() ||
      !REASON_RE.test(reason) || normalized.includes(reason)
    ) {
      return null;
    }
    normalized.push(reason);
  }
  return normalized;
}

/**
 * Espelho de normalizeReviewGateProvenance (review-gate-reasons.js): a
 * proveniência só está disponível quando razões, razão primária e a flag
 * explícita de disponibilidade existem e são mutuamente consistentes.
 */
function itemGateProvenance(item: Record<string, unknown>): {
  available: boolean;
  reasons: string[];
} {
  const hasReasons = Object.prototype.hasOwnProperty.call(item, "reviewGateReasons");
  const hasPrimary = Object.prototype.hasOwnProperty.call(item, "gateReason");
  const hasAvailability = Object.prototype.hasOwnProperty.call(
    item,
    "reviewGateReasonsAvailable",
  );
  const rawReasons = hasReasons ? item.reviewGateReasons : undefined;
  const reasons = hasReasons ? normalizeReasons(rawReasons) : null;
  const rawPrimary = hasPrimary ? item.gateReason : undefined;
  const primary = rawPrimary === null
    ? null
    : (typeof rawPrimary === "string" && rawPrimary === rawPrimary.trim() &&
      REASON_RE.test(rawPrimary) ? rawPrimary : undefined);
  const expectedPrimary = Array.isArray(rawReasons) && rawReasons.length > 0
    ? (reasons ?? [])[0] ?? null
    : null;
  const available = Boolean(
    hasReasons && hasPrimary && reasons !== null && primary !== undefined &&
    primary === expectedPrimary &&
    (!hasAvailability || item.reviewGateReasonsAvailable === true),
  );
  return { available, reasons: available ? (reasons ?? []) : [] };
}

function normalizeDirectiveModule(value: unknown): string {
  if (typeof value !== "string") return "";
  const key = value.trim().toLowerCase();
  if (["evento", "eventos", "event", "events"].includes(key)) return "eventos";
  if (["oportunidade", "oportunidades", "opportunity", "opportunities"].includes(key)) {
    return "oportunidades";
  }
  return "";
}

export interface NormalizedDirective {
  approval_scope: string;
  automatic: boolean;
  item_version: string;
  module: string;
  resolution_id: string;
  resolved_at: number;
  review_gate_reasons: string[];
  review_id: string;
  source_comparison_key: string;
  source_revision: string;
  source_url: string;
}

export function normalizeReviewPublicationDirective(
  value: unknown,
): NormalizedDirective | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== EXPECTED_KEYS.length ||
    keys.some((key, index) => key !== EXPECTED_KEYS[index])
  ) {
    return null;
  }
  const reviewId = String(record.review_id ?? "").trim().toLowerCase();
  const itemVersion = String(record.item_version ?? "").trim().toLowerCase();
  const resolutionId = String(record.resolution_id ?? "").trim().toLowerCase();
  const sourceComparison = String(record.source_comparison_key ?? "").trim().toLowerCase();
  const sourceRevision = String(record.source_revision ?? "").trim().toLowerCase();
  const moduleKey = String(record.module ?? "").trim().toLowerCase();
  const resolvedAt = record.resolved_at;
  const automatic = record.automatic;
  const approvalScope = String(record.approval_scope ?? "");
  const reasons = normalizeReasons(record.review_gate_reasons);
  const sourceUrl = safeDirectiveSourceUrl(record.source_url);
  if (
    !UUID_RE.test(reviewId) || !UUID_RE.test(resolutionId) ||
    !SHA256_RE.test(itemVersion) || !SHA256_RE.test(sourceComparison) ||
    !SHA256_RE.test(sourceRevision) || !DIRECTIVE_MODULES.has(moduleKey) ||
    typeof resolvedAt !== "number" || !Number.isSafeInteger(resolvedAt) ||
    resolvedAt <= 0 || typeof automatic !== "boolean" ||
    reasons === null || !sourceUrl ||
    (automatic && (approvalScope !== "gate_free_automatic" || reasons.length !== 0)) ||
    (!automatic && approvalScope !== "editorial_override")
  ) {
    return null;
  }
  return {
    review_id: reviewId,
    item_version: itemVersion,
    resolution_id: resolutionId,
    resolved_at: resolvedAt,
    automatic,
    approval_scope: approvalScope,
    source_comparison_key: sourceComparison,
    source_revision: sourceRevision,
    source_url: sourceUrl,
    module: moduleKey,
    review_gate_reasons: [...reasons],
  };
}

/**
 * Diretiva ligada ao item exato: forma válida + identidade de fonte, revisão
 * de evidência, proveniência de gates e módulo conferindo com o item.
 */
export function boundReviewPublicationDirective(
  item: Record<string, unknown>,
): NormalizedDirective | null {
  if (!item || typeof item !== "object") return null;
  const carriesDirective = item.reviewPublicationDirective !== undefined &&
    item.reviewPublicationDirective !== null;
  const directive = normalizeReviewPublicationDirective(
    item.reviewPublicationDirective,
  );
  if (!directive) return null;

  const sourceId = [item.sourceId, item.source_id]
    .find((candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim() !== ""
    ) ?? "";
  const sourceRevision = String(item.sourceRevision ?? item.source_revision ?? "")
    .trim().toLowerCase();
  const itemSourceIdentity = directiveSourceIdentity(
    String(item.sourceUrl || item.url || item.source_url || item.link || ""),
  );
  const directiveSourceIdentityValue = directiveSourceIdentity(directive.source_url);
  const moduleKey = normalizeDirectiveModule(item.module);
  const gate = itemGateProvenance(item);
  const itemVersion = String(item.itemVersion ?? item.item_version ?? "")
    .trim().toLowerCase();
  const reviewId = String(item.reviewId ?? item.review_id ?? "")
    .trim().toLowerCase();

  if (
    sourceComparisonKey(sourceId.trim()) !== directive.source_comparison_key ||
    sourceRevision !== directive.source_revision ||
    !itemSourceIdentity || itemSourceIdentity !== directiveSourceIdentityValue ||
    moduleKey !== directive.module ||
    gate.available !== true ||
    gate.reasons.length !== directive.review_gate_reasons.length ||
    gate.reasons.some((reason, index) => reason !== directive.review_gate_reasons[index]) ||
    (carriesDirective && itemVersion !== directive.item_version) ||
    (carriesDirective && reviewId !== directive.review_id)
  ) {
    return null;
  }
  return directive;
}
