// KinoCampus — Edge Function cadu-publish: utilitarios puros (Deno/TS).
//
// Helpers sem dependencias externas, compartilhados por schema.ts e mapper.ts.
// Espelham (em TS) os utilitarios de services/cadu-ufg-publisher/src/utils.js
// para manter a mesma normalizacao de texto/slug/data que ja era usada.

import { publicRemoteUrl } from "./remote-resource.ts";

export const DEFAULT_AUTO_PUBLISH_SCORE_MIN = 0.7;

export function resolveAutoPublishScoreMin(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return DEFAULT_AUTO_PUBLISH_SCORE_MIN;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_AUTO_PUBLISH_SCORE_MIN;
}

export function normalizeWhitespace(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function stripHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

// Texto normalizado para comparacoes/heuristicas (sem acento, minusculo).
// NFD decompoe acentos; \p{Diacritic} remove as marcas (ASCII-safe no fonte).
export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: unknown, maxLength = 80): string {
  const base = String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, maxLength).replace(/-+$/g, "");
}

export function clamp(value: unknown, maxLength: number): string {
  const text = normalizeWhitespace(value);
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, Math.max(0, maxLength - 1));
  const boundary = sliced.lastIndexOf(" ");
  return `${(boundary > 40 ? sliced.slice(0, boundary) : sliced).trim()}...`;
}

/**
 * Remove trailing ellipsis (literal or Unicode) from a string.
 * Handles: "...", "…", " .. ", "... " — anywhere in the last 8 chars.
 * Useful before clamping titles that already got truncated upstream.
 */
export function stripTrailingEllipsis(value: unknown): string {
  const text = String(value ?? "");
  if (!text) return "";
  // Match trailing: dots, ellipsis char, ellipsis word, optional whitespace
  return text.replace(/[\s.]*(?:\.\.\.|…|\.\s\.\s\.)+\s*$/g, "").trim();
}

/**
 * Adapt a title to platform-friendly form. Strips trailing ellipsis (already
 * truncated upstream), collapses multiple spaces, removes redundant leading
 * source label (e.g. "UFG:") if the body already attributes the post.
 */
export function adaptTitleForPlatform(value: unknown): string {
  const text = stripTrailingEllipsis(value);
  if (!text) return "";
  // collapse runs of whitespace
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Strip a redundant institutional prefix from the title when the same prefix
 * is already attributed via sourceName. Common UFG pattern: "UFG, abre
 * inscricoes para X" — when sourceName is "UFG" (or any of the pro-reitorias
 * that always prefix their titles), the platform already attributes the post
 * via metadata.source_unit, so the redundant prefix makes the title look
 * truncated or boilerplate.
 *
 * Examples:
 *   ("UFG, abre inscricoes para X", "UFG")        -> "abre inscricoes para X"
 *   ("SECOM: edital PROEX 2026",  "SECOM")        -> "edital PROEX 2026"
 *   ("UFG sedia X",               "UFG")          -> "UFG sedia X" (NOT stripped — UFG is part of subject)
 *   ("Proex abre edital X",       "PROEX")        -> "abre edital X"
 *
 * Only strips when prefix is at column 0 and followed by ONE of: ":", "," or "- ".
 */
export function stripInstitutionalPrefix(title: unknown, sourceName: unknown): string {
  const text = adaptTitleForPlatform(title);
  const src = String(sourceName ?? "").trim();
  if (!text || !src) return text;
  // Build candidate prefixes: sourceName as-is, plus uppercase/lowercase variants
  const candidates = [src, src.toUpperCase(), src.toLowerCase()].filter((v, i, a) => a.indexOf(v) === i);
  for (const prefix of candidates) {
    if (!prefix) continue;
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Strip if prefix is followed by ANY of these separators:
    //   ":" "," " - " (space-hyphen-space), " — " (space-em-dash-space),
    //   " – " (space-en-dash-space), " | " (space-pipe-space — common in news),
    //   " —" / " –" (em/en-dash at end of prefix without trailing space — common Weby pattern).
    // NOT just " " — preserves "UFG sedia X".
    const re = new RegExp(
      `^${escaped}\\s*(?::|,|\\s-\\s|\\s[\\u2014\\u2013]\\s?|\\s\\|\\s|[\\u2014\\u2013])`,
      "i",
    );
    const m = text.match(re);
    if (m) {
      return text.slice(m[0].length).trim();
    }
  }
  return text;
}

export function clampMarkdown(value: unknown, maxLength: number): string {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, Math.max(0, maxLength - 1));
  const boundary = Math.max(
    sliced.lastIndexOf("\n\n"),
    sliced.lastIndexOf("\n"),
    sliced.lastIndexOf(" "),
  );
  return `${(boundary > 80 ? sliced.slice(0, boundary) : sliced).trim()}...`;
}

export function uniq<T>(list: T[]): T[] {
  return Array.from(
    new Set((list || []).filter((v) => v !== undefined && v !== null && v !== "")),
  );
}

export function validRemoteImageUrl(value: unknown): string {
  return publicRemoteUrl(value);
}

/**
 * Returns true only when a URL identifies the content itself, rather than a
 * reusable action destination (application form, shared document, home page).
 *
 * `source_id` remains the primary idempotency key. This narrower URL fallback
 * prevents two unrelated calls that reuse the same Google Form from being
 * collapsed into one Kino Campus post.
 */
export function isDurableSourceIdentityUrl(value: unknown): boolean {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!/^https?:$/.test(url.protocol)) return false;

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/{2,}/g, "/");

    if (
      host === "forms.gle" ||
      host === "forms.office.com" ||
      host === "docs.google.com" ||
      host === "drive.google.com" ||
      host === "bit.ly" ||
      host === "tinyurl.com"
    ) return false;

    if (host === "instagram.com") {
      return /^\/(?:p|reel|tv)\/[A-Za-z0-9_-]{5,}\/?$/i.test(path);
    }

    const isUfgHost = host === "ufg.br" || host.endsWith(".ufg.br");
    if (!isUfgHost) return false;

    if (/^\/(?:n|e)\/[^/?#]+(?:\/|$)/i.test(path)) return true;
    if (/\/article\/view\/[^/?#]+(?:\/|$)/i.test(path)) return true;
    if (/\/(?:evento|eventos)\/[^/?#]+(?:\/|$)/i.test(path)) return true;

    return ["id", "event", "evento"].some((key) =>
      String(url.searchParams.get(key) || "").trim().length > 0
    );
  } catch (_) {
    return false;
  }
}

export function isSvgUrl(value: unknown): boolean {
  try {
    const url = new URL(String(value ?? "").trim());
    return /\.svg$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

export function isTemporaryOrSocialImageUrl(value: unknown): boolean {
  try {
    const url = new URL(String(value ?? "").trim());
    const host = url.hostname.toLowerCase();
    return /(^|\.)cdninstagram\.com$/.test(host) ||
      /(^|\.)fbcdn\.net$/.test(host) ||
      /(^|\.)instagram\.com$/.test(host) ||
      /(^|\.)cdn-telegram\.org$/.test(host) ||
      /(^|\.)telegram\.org$/.test(host);
  } catch (_) {
    return false;
  }
}

export function canPersistExternalImageUrl(value: unknown): boolean {
  const clean = validRemoteImageUrl(value);
  if (!clean) return false;
  if (isSvgUrl(clean)) return false;
  return !isTemporaryOrSocialImageUrl(clean);
}

/**
 * Padrão de capa/OG (2026-08-31): URLs de objetos do kino-media são servidas
 * pelo endpoint de transformação do Storage (render) com width/quality
 * calibrados para previews de crawler (faixa verificada 200–500 KB em
 * capas reais) — sem alterar o objeto original, que permanece íntegro no
 * bucket para qualquer outro uso. Idempotente e não-kino URLs voltam intactas.
 */
export const COVER_RENDER_PARAMS = "width=1920&quality=85";

export function toOptimizedCoverUrl(url: unknown): string {
  const value = String(url || "").trim();
  const marker = "/storage/v1/object/public/";
  const idx = value.indexOf(marker);
  if (idx < 0) return value;
  const rest = value.slice(idx + marker.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return value;
  const bucket = rest.slice(0, slash);
  const objectPath = rest.slice(slash + 1).split("?")[0];
  const origin = value.slice(0, idx);
  return `${origin}/storage/v1/render/image/public/${bucket}/${objectPath}?${COVER_RENDER_PARAMS}`;
}

export function hostOf(value: unknown): string {
  try {
    return new URL(String(value ?? "")).host;
  } catch (_) {
    return "";
  }
}

// Hash leve e estavel (FNV-1a 32 bits, hex) — usado so para identidade/dedup,
// nao para seguranca. Evita async de crypto.subtle no caminho de mapeamento.
export function lightHash(value: unknown): string {
  const str = String(value ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

// Aceita "1.234,56" / "1234,56" / "1234.56" / "R$ 100" -> numero | null
export function parseBRLNumber(value: unknown): number | null {
  const raw = String(value ?? "").replace(/r\$\s*/i, "").trim();
  if (!raw) return null;
  let normalized = raw.replace(/[^\d.,]/g, "");
  if (!normalized) return null;
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if ((normalized.match(/\./g) || []).length > 1) {
    normalized = normalized.replace(/\./g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function extractEmails(value: unknown): string[] {
  const matches = String(value ?? "").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  return uniq(matches.map((m) => m.toLowerCase()));
}

// yyyy-mm-dd valido?
export function isIsoDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim());
}

export function formatDatePt(isoDate: unknown): string {
  const match = String(isoDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

export function isoDateFromAny(value: unknown): string {
  const match = String(value ?? "").match(/(20\d{2}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function timeFromAny(value: unknown): string {
  const raw = String(value ?? "");
  const match = raw.match(/(?:T|\s)([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/) ||
    raw.match(/\b([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  return match ? `${match[1]}:${match[2]}` : "";
}

const MONTHS_PT: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

// Extrai a primeira data "dd/mm/aaaa" ou "dd de mes [de aaaa]" como ISO yyyy-mm-dd.
export function parseBrazilianDate(value: unknown, fallbackYear?: number): string {
  const text = normalizeText(value);
  const year = fallbackYear || new Date().getUTCFullYear();

  const numeric = text.match(/\b([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/);
  if (numeric) {
    const d = numeric[1].padStart(2, "0");
    const m = numeric[2].padStart(2, "0");
    let y = numeric[3] || String(year);
    if (y.length === 2) y = `20${y}`;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  const named = text.match(/\b([0-3]?\d)\s+de\s+([a-z]+)(?:\s+de\s+((?:20)?\d{2}))?/);
  if (named) {
    const d = named[1].padStart(2, "0");
    const mm = MONTHS_PT[named[2]];
    let y = named[3] || String(year);
    if (y.length === 2) y = `20${y}`;
    if (mm) return `${y}-${mm}-${d}`;
  }
  return "";
}

// Detecta intervalo "dd a dd de mes" / "de dd/mm a dd/mm" -> { start, end } ISO.
export function parseDateRange(value: unknown, fallbackYear?: number): { start: string; end: string } {
  const text = normalizeText(value);
  const year = fallbackYear || new Date().getUTCFullYear();

  // "10 a 14 de junho [de 2026]" (mesmo mes)
  const sameMonth = text.match(/\b([0-3]?\d)\s*(?:a|ate|-)\s*([0-3]?\d)\s+de\s+([a-z]+)(?:\s+de\s+((?:20)?\d{2}))?/);
  if (sameMonth) {
    const mm = MONTHS_PT[sameMonth[3]];
    let y = sameMonth[4] || String(year);
    if (y.length === 2) y = `20${y}`;
    if (mm) {
      return {
        start: `${y}-${mm}-${sameMonth[1].padStart(2, "0")}`,
        end: `${y}-${mm}-${sameMonth[2].padStart(2, "0")}`,
      };
    }
  }

  // "de 10/06 a 14/06[/2026]" (datas numericas)
  const numericRange = text.match(
    /([0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?)\s*(?:a|ate|-)\s*([0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?)/,
  );
  if (numericRange) {
    const start = parseBrazilianDate(numericRange[1], year);
    const end = parseBrazilianDate(numericRange[2], year);
    if (start && end) return { start, end };
  }
  return { start: "", end: "" };
}
