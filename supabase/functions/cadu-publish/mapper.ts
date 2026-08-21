// KinoCampus — Edge Function cadu-publish: mapeamento item -> linha de posts.
//
// Produz uma linha de `public.posts` (sem author_id/status, adicionados pelo
// index) cujo `metadata` espelha o contrato humano de
// kc-create-post.submit.js, com as melhorias pedidas:
//   - eventos: data_evento E data_fim_evento (multi-dia), hora_evento, gratuito.
//   - oportunidades: modalidade detectada (Remoto/Hibrido/Presencial), regime,
//     remuneracao, area, contato.
//   - todos os modulos: chaves de metadata corretas para render identico.

import {
  CaduItem,
  caduUserTagsForItem,
  actionFingerprintMetadataForItem,
  categoryLabel,
  MAX_CADU_USER_TAGS,
  ModuleKey,
  normalizeCategoryForModule,
  normalizeOpportunityType,
  normalizeSecondaryForModule,
  resolveRegime,
  resolveWorkMode,
  secondaryInputForItem,
  secondaryLabelForModule,
  secondaryValuesForModule,
  sourceRevisionForItem,
} from "./schema.ts";
import {
  adaptTitleForPlatform,
  clamp,
  clampMarkdown,
  extractEmails,
  formatDatePt,
  hostOf,
  isoDateFromAny,
  lightHash,
  normalizeText,
  normalizeWhitespace,
  parseBrazilianDate,
  parseBRLNumber,
  parseDateRange,
  slugify,
  stripHtml,
  stripInstitutionalPrefix,
  stripTrailingEllipsis,
  timeFromAny,
  uniq,
  canPersistExternalImageUrl,
  isSvgUrl,
  validRemoteImageUrl,
} from "./util.ts";

export interface MappedPost {
  row: {
    title: string;
    description: string;
    price: number | null;
    location: string;
    module: string;
    category: string;
    image_url: string | null;
    visibility: string;
    expires_at?: string;
    metadata: Record<string, unknown>;
  };
  images: string[];
  dedup: { sourceId: string; sourceUrl: string; contentHash: string };
  warnings: string[];
}

const ICON_DOCUMENT = "\u{1F4C4}";
const ICON_LINK = "\u{1F517}";
export const MAX_IMAGE_COUNT = 6;

function detectArea(text: string): string {
  const n = normalizeText(text);
  if (/direito|juridic/.test(n)) return "Direito";
  if (/saude|farmacia|medicina|enfermagem|biologia|nutricao|odontolog/.test(n)) return "Saude";
  if (/computacao|software|tecnologia|sistema|informatica|dados|\bti\b/.test(n)) return "Tecnologia";
  if (/comunicacao|jornalismo|publicidade|marketing|design/.test(n)) return "Comunicacao";
  if (/engenharia|arquitetura/.test(n)) return "Engenharia";
  if (/letras|linguas|idioma|traducao/.test(n)) return "Linguas";
  if (/arte|musica|danca|teatro|cultura/.test(n)) return "Artes";
  if (/administracao|gestao|contabil|economia|financ/.test(n)) return "Gestao";
  if (/pesquisa|pibic|pivic|fapeg|iniciacao cientifica|mobilidade/.test(n)) return "Pesquisa";
  return "Academica";
}

function detectLocation(text: string, sourceName: string): string {
  const match = String(text || "").match(/\b(?:local|onde|campus|cidade)\s*:\s*([^\n.;]{4,90})/i);
  return normalizeWhitespace(match ? match[1] : (sourceName || "UFG"));
}

interface DeadlineCandidate {
  iso: string;
  priority: number;
}

function validIsoDateStrict(value: unknown): string {
  const iso = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10) === iso ? iso : "";
}

function isoDateCandidate(value: unknown, fallbackYear?: number): string {
  return validIsoDateStrict(isoDateFromAny(value) || parseBrazilianDate(value, fallbackYear));
}

function yearFromOpportunityItem(item: CaduItem): number {
  const itemRecord = item as Record<string, unknown>;
  const semanticDates = item.dates && typeof item.dates === "object"
    ? Object.values(item.dates).map((value) => String(value || "")).join(" ")
    : "";
  const raw = [
    semanticDates,
    itemRecord.applicationOpensAt,
    itemRecord.applicationDeadline,
    itemRecord.eventStartsAt,
    itemRecord.eventEndsAt,
    itemRecord.resultPublishedAt,
    item.dateEnd,
    item.dateStart,
    itemRecord.updatedAt,
    itemRecord.updated_at,
    item.sourceUrl,
  ].map((value) => String(value || "")).join(" ");
  const match = raw.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getUTCFullYear();
}

function normalizeSemanticDates(item: CaduItem): Record<string, string> {
  const fallbackYear = yearFromOpportunityItem(item);
  const itemRecord = item as Record<string, unknown>;
  const dates = item.dates && typeof item.dates === "object"
    ? item.dates as Record<string, unknown>
    : {};
  const aliases: Record<string, unknown[]> = {
    applicationOpensAt: [
      dates.applicationOpensAt,
      dates.application_opens_at,
      itemRecord.applicationOpensAt,
      itemRecord.application_opens_at,
    ],
    applicationDeadline: [
      dates.applicationDeadline,
      dates.application_deadline,
      itemRecord.applicationDeadline,
      itemRecord.application_deadline,
    ],
    eventStartsAt: [
      dates.eventStartsAt,
      dates.event_starts_at,
      itemRecord.eventStartsAt,
      itemRecord.event_starts_at,
    ],
    eventEndsAt: [
      dates.eventEndsAt,
      dates.event_ends_at,
      itemRecord.eventEndsAt,
      itemRecord.event_ends_at,
    ],
    resultPublishedAt: [
      dates.resultPublishedAt,
      dates.result_published_at,
      itemRecord.resultPublishedAt,
      itemRecord.result_published_at,
    ],
  };
  const normalized: Record<string, string> = {};
  for (const [role, candidates] of Object.entries(aliases)) {
    for (const candidate of candidates) {
      const iso = isoDateCandidate(candidate, fallbackYear);
      if (!iso) continue;
      normalized[role] = iso;
      break;
    }
  }
  return normalized;
}

function hasExplicitSemanticEventRole(item: CaduItem): boolean {
  const itemRecord = item as Record<string, unknown>;
  const dates = item.dates && typeof item.dates === "object" && !Array.isArray(item.dates)
    ? item.dates as Record<string, unknown>
    : {};
  const aliases: Array<[Record<string, unknown>, string]> = [
    [dates, "eventStartsAt"],
    [dates, "event_starts_at"],
    [dates, "eventEndsAt"],
    [dates, "event_ends_at"],
    [itemRecord, "eventStartsAt"],
    [itemRecord, "event_starts_at"],
    [itemRecord, "eventEndsAt"],
    [itemRecord, "event_ends_at"],
  ];
  return aliases.some(([source, key]) => Object.prototype.hasOwnProperty.call(source, key));
}

function localDateContext(text: string, index: number, length: number): string {
  const minStart = Math.max(0, index - 120);
  const maxEnd = Math.min(text.length, index + length + 120);
  const before = text.slice(0, index);
  const after = text.slice(index + length);
  const previousBreak = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf(";"),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf("|"),
  );
  const nextBreakValues = [".", ";", "!", "?", "|"]
    .map((token) => after.indexOf(token))
    .filter((value) => value >= 0);
  const nextBreak = nextBreakValues.length ? Math.min(...nextBreakValues) : -1;
  const start = Math.max(minStart, previousBreak >= 0 ? previousBreak + 1 : minStart);
  const end = Math.min(maxEnd, nextBreak >= 0 ? index + length + nextBreak : maxEnd);
  return text.slice(start, end);
}

function deadlinePriority(context: string): number {
  if (/\b(inscric\w*|submiss\w*|candidat\w*|prazo(?:\s+final)?|encerra\w*|termina\w*|envio\w*|propost\w*|formulario|solicit\w*)\b/i.test(context)) {
    return 3;
  }
  if (/\b(recurso\w*|matricula\w*|homolog\w*|resultado\w*|entrevista\w*|prova\w*|cronograma|periodo)\b/i.test(context)) {
    return 2;
  }
  return /\bate\b/i.test(context) ? 1 : 0;
}

function addDeadlineCandidate(candidates: DeadlineCandidate[], text: string, match: RegExpExecArray, iso: string): void {
  const cleanIso = validIsoDateStrict(iso);
  if (!cleanIso) return;
  const priority = deadlinePriority(localDateContext(text, match.index || 0, match[0].length));
  if (priority <= 0) return;
  candidates.push({ iso: cleanIso, priority });
}

function extractDeadlineFromText(value: unknown, fallbackYear: number): string {
  const text = normalizeText(stripHtml(value || ""));
  const candidates: DeadlineCandidate[] = [];
  let match: RegExpExecArray | null;

  const numericRange = /\b([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\s*(?:a|ate|-)\s*([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/g;
  while ((match = numericRange.exec(text))) {
    const year = Number(String(match[6] || match[3] || fallbackYear).replace(/^(\d{2})$/, "20$1"));
    addDeadlineCandidate(candidates, text, match, parseBrazilianDate(`${match[4]}/${match[5]}/${year}`, fallbackYear));
  }

  const compactRange = /\b([0-3]?\d)\s*(?:a|ate|-)\s*([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/g;
  while ((match = compactRange.exec(text))) {
    const year = Number(String(match[4] || fallbackYear).replace(/^(\d{2})$/, "20$1"));
    addDeadlineCandidate(candidates, text, match, parseBrazilianDate(`${match[2]}/${match[3]}/${year}`, fallbackYear));
  }

  const namedRange = /\b([0-3]?\d)\s*(?:a|ate|-)\s*([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+((?:20)?\d{2}))?\b/g;
  while ((match = namedRange.exec(text))) {
    const year = Number(String(match[4] || fallbackYear).replace(/^(\d{2})$/, "20$1"));
    addDeadlineCandidate(candidates, text, match, parseBrazilianDate(`${match[2]} de ${match[3]} de ${year}`, fallbackYear));
  }

  const numeric = /\b([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/g;
  while ((match = numeric.exec(text))) {
    const year = Number(String(match[3] || fallbackYear).replace(/^(\d{2})$/, "20$1"));
    addDeadlineCandidate(candidates, text, match, parseBrazilianDate(`${match[1]}/${match[2]}/${year}`, fallbackYear));
  }

  const named = /\b([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+((?:20)?\d{2}))?\b/g;
  while ((match = named.exec(text))) {
    const year = Number(String(match[3] || fallbackYear).replace(/^(\d{2})$/, "20$1"));
    addDeadlineCandidate(candidates, text, match, parseBrazilianDate(`${match[1]} de ${match[2]} de ${year}`, fallbackYear));
  }

  if (!candidates.length) return "";
  const maxPriority = Math.max(...candidates.map((candidate) => candidate.priority));
  return candidates
    .filter((candidate) => candidate.priority === maxPriority)
    .map((candidate) => candidate.iso)
    .sort()
    .pop() || "";
}

function resolveOpportunityDeadline(item: CaduItem, fullText: string): string {
  const fallbackYear = yearFromOpportunityItem(item);
  const dates = item.dates && typeof item.dates === "object" ? item.dates as Record<string, unknown> : {};
  const explicitCandidates = [
    dates.applicationDeadline,
    dates.application_deadline,
    (item as Record<string, unknown>).applicationDeadline,
    (item as Record<string, unknown>).application_deadline,
    (item as Record<string, unknown>).deadlineDate,
    (item as Record<string, unknown>).deadline_date,
    (item as Record<string, unknown>).deadline,
    (item as Record<string, unknown>).deadlineAt,
    (item as Record<string, unknown>).deadline_at,
    dates.deadlineDate,
    dates.deadline_date,
    dates.deadline,
    dates.endDate,
    dates.end,
  ];
  for (const candidate of explicitCandidates) {
    const iso = isoDateCandidate(candidate, fallbackYear);
    if (iso) return iso;
  }
  return extractDeadlineFromText(fullText, fallbackYear);
}

/** End of the relevant day in Goias (UTC-03), where UFG operates. */
function expiryAtEndOfDay(isoDate: unknown, now = new Date()): string {
  const iso = validIsoDateStrict(isoDate);
  if (!iso) return "";
  const expiry = new Date(`${iso}T23:59:59.999-03:00`);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) return "";
  return expiry.toISOString();
}

function markdownUrlLink(url: unknown): string {
  const clean = validRemoteImageUrl(url);
  return clean ? `[${clean}](${clean})` : "";
}

function normalizeMarkdownInput(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean)
    .join("\n");
}

function stripCmsCreditLines(value: unknown): string {
  return normalizeMarkdownInput(value)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => {
      if (!line) return false;
      if (/^(texto|fotos?|foto|imagens?|imagem|reportagem|edicao|edição)\s*:\s*[^:]{2,120}$/i.test(line)) return false;
      if (/^por\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ' .-]{2,80}\*?$/u.test(line)) return false;
      if (/^fonte\s+oficial\s*:\s*https?:\/\//i.test(line)) return false;
      if (/^\*\*?\s*🔗?\s*fonte\s+oficial\s*:/i.test(line)) return false;
      if (/^https?:\/\/\S+$/i.test(line)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasCmsCreditLine(value: unknown): boolean {
  return normalizeMarkdownInput(value)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .some((line) =>
      /^(texto|fotos?|foto|imagens?|imagem|reportagem|edicao|edição)\s*:\s*[^:]{2,120}$/i.test(line) ||
      /^por\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ' .-]{2,80}\*?$/u.test(line)
    );
}

function isUsefulFormattedDescription(value: unknown): boolean {
  const text = stripCmsCreditLines(value);
  if (text.length < 140) return false;
  if (hasCmsCreditLine(value)) return false;
  const normalized = normalizeText(text);
  if (/universidade gratuita|mais de\s+\d+\s+mil alunos|ensino pesquisa e extensao/.test(normalized)) return false;
  return /\*\*|\[[^\]]+\]\(https?:\/\/|prazo|inscric|edital|evento|bolsa|curso|palestra|sele[cç][aã]o|submiss/i.test(text);
}

function buildSourceLabel(sourceName: string): string {
  const name = normalizeWhitespace(sourceName || "UFG");
  if (!name || /^ufg$/i.test(name)) return "Fonte oficial: UFG";
  if (/ufg/i.test(name)) return `Fonte oficial: ${name}`;
  return `Fonte oficial: ${name}`;
}

function normalizeDocumentLinks(item: CaduItem): Array<{ url: string; label: string }> {
  const byUrl = new Map<string, { url: string; label: string }>();
  (Array.isArray(item.extractedLinks) ? item.extractedLinks : []).forEach((link) => {
    const url = typeof link === "string" ? link : (link && link.url) || "";
    if (!url || byUrl.has(url)) return;
    const label = typeof link === "object" ? (link.label || "") : "";
    if (/\.pdf(?:$|[?#])/i.test(url) || /edital|chamada|fapeg|pibic|pivic|mobilidade|documento/i.test(label || url)) {
      byUrl.set(url, { url, label: normalizeWhitespace(label) });
    }
  });
  (Array.isArray(item.pdfLinks) ? item.pdfLinks : []).forEach((url, index) => {
    if (!url || byUrl.has(url)) return;
    byUrl.set(url, { url, label: `documento ${index + 1}` });
  });
  return Array.from(byUrl.values());
}

/**
 * Filter and rank document links by relevance to the post. Returns at most
 * `max` documents, prioritizing those with custom labels or specific filenames
 * over generic "documento N" labels and ultra-generic filenames like
 * "edital.pdf" / "anexo.pdf".
 *
 * Yan reported the issue: a post listing 5 PDFs that were NOT actually related
 * (one was about ponto eletronico, another about cargos nivel D, etc.) still
 * appeared in the description as "Documento 1, 2, 3, 4, 5" — this hallucinated
 * attachment list damaged credibility.
 *
 * Fix: only keep at most 3 documents, drop generic ones first when there are
 * many, prefer custom labels (extracted from page) over auto-numbered.
 */
const GENERIC_PDF_FILENAMES = /^(edital|anexo|anexos|formulario|documento|doc|file|upload|download)\w*\.pdf$/i;

function filterRelevantDocuments(
  links: Array<{ url: string; label: string }>,
  item: CaduItem,
  module: string,
  max = 3,
): Array<{ url: string; label: string }> {
  if (!Array.isArray(links) || !links.length) return [];
  const moduleKey = module as ModuleKey;
  // Score each link; keep only those with score >= 0 (relevance threshold)
  const scored = links.map((link, index) => ({
    link,
    score: scoreActionLink(item, moduleKey, link, index),
    isGenericLabel: /^documento \d+$/i.test(link.label || ""),
    isGenericFilename: GENERIC_PDF_FILENAMES.test(decodeURIComponent(
      (() => { try { return new URL(link.url).pathname.split("/").pop() || ""; } catch (_) { return ""; } })()
    )),
  }));
  // Custom labels always keep (they came from page, not auto-numbered)
  const custom = scored.filter((s) => !s.isGenericLabel);
  const generic = scored.filter((s) => s.isGenericLabel);
  // For generic-label docs: only keep those that score OK AND have specific filename
  const genericKept = generic.filter((s) => s.score >= 20 && !s.isGenericFilename);
  const ranked = [...custom, ...genericKept]
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, max).map((s) => s.link);
}

function normalizeEnrichmentSources(item: CaduItem): Array<{ url: string; label: string; type: string }> {
  const out = new Map<string, { url: string; label: string; type: string }>();
  const sourceUrl = validRemoteImageUrl(item.sourceUrl);
  if (sourceUrl) {
    out.set(sourceUrl, {
      url: sourceUrl,
      label: normalizeWhitespace(item.sourceName) || "Fonte oficial",
      type: "official",
    });
  }
  (Array.isArray(item.enrichmentSources) ? item.enrichmentSources : []).forEach((source) => {
    const url = typeof source === "string" ? validRemoteImageUrl(source) : validRemoteImageUrl(source?.url);
    if (!url || out.has(url)) return;
    out.set(url, {
      url,
      label: typeof source === "object" ? clamp(source.label || "", 90) : "",
      type: typeof source === "object" ? slugify(source.type || "supplemental", 40) : "supplemental",
    });
  });
  return Array.from(out.values()).slice(0, 12);
}

function buildDescription(item: CaduItem): string {
  const formatted = stripCmsCreditLines(item.formattedDescription || item.formatted_description || "");
  const lead = normalizeWhitespace(
    stripCmsCreditLines(stripHtml(item.description || item.summary || item.text || "")),
  );
  const chunks: string[] = [];

  const sourceUrl = validRemoteImageUrl(item.sourceUrl);
  const sourceLabel = buildSourceLabel(String(item.sourceName || ""));
  const alreadyHasSource = sourceUrl && (formatted.includes(sourceUrl) || lead.includes(sourceUrl));

  const module = (item.module as string) || "";
  const documentLinks = filterRelevantDocuments(normalizeDocumentLinks(item), item, module, 3);
  if (formatted && isUsefulFormattedDescription(formatted)) {
    chunks.push(clampMarkdown(formatted, 1700));
  } else if (lead) {
    chunks.push(clamp(lead, 1400));
  }

  if (documentLinks.length) {
    chunks.push(
      [
        `**${ICON_DOCUMENT} Editais e documentos:**`,
        ...documentLinks.map((l) => `- ${l.label ? `**${l.label}:** ` : ""}${markdownUrlLink(l.url)}`),
      ].join("\n"),
    );
  }

  if (sourceUrl && !alreadyHasSource) {
    chunks.push(`**${ICON_LINK} ${sourceLabel}:** ${markdownUrlLink(sourceUrl)}`);
  }

  return clampMarkdown(chunks.filter(Boolean).join("\n\n"), 2000);
}

interface TagPair {
  key: string;
  label: string;
}

function appendTagPair(target: Map<string, string>, key: unknown, label: unknown): void {
  const normalizedLabel = normalizeWhitespace(label);
  const normalizedKey = slugify(key || normalizedLabel);
  if (!normalizedKey || target.has(normalizedKey)) return;
  target.set(normalizedKey, normalizedLabel || normalizedKey);
}

function isModuleTaxonomyTag(module: ModuleKey, value: unknown): boolean {
  return !!(
    normalizeCategoryForModule(module, value) ||
    normalizeSecondaryForModule(module, value)
  );
}

function appendIndependentTagPair(
  target: Map<string, string>,
  module: ModuleKey,
  key: unknown,
  label: unknown,
): void {
  const keyText = normalizeWhitespace(key);
  const labelText = normalizeWhitespace(label);
  if (!keyText && !labelText) return;

  const keyIsTaxonomy = !!keyText && isModuleTaxonomyTag(module, keyText);
  const labelIsTaxonomy = !!labelText && isModuleTaxonomyTag(module, labelText);
  if (keyIsTaxonomy && labelIsTaxonomy) return;
  if (keyIsTaxonomy) {
    if (labelText) appendTagPair(target, labelText, labelText);
    return;
  }
  if (labelIsTaxonomy) {
    if (keyText) appendTagPair(target, keyText, keyText);
    return;
  }
  appendTagPair(target, keyText || labelText, labelText || keyText);
}

function buildTags(
  item: CaduItem,
  module: ModuleKey,
  required: TagPair[],
): { tags: string[]; tagKeys: string[] } {
  const pairs = new Map<string, string>();
  required.forEach(({ key, label }) => appendTagPair(pairs, key, label));
  appendTagPair(pairs, "ufg", "UFG");
  appendIndependentTagPair(pairs, module, item.sourceName, item.sourceName);
  const entries = Array.from(pairs.entries()).slice(0, 10);
  return {
    tagKeys: entries.map(([key]) => key),
    tags: entries.map(([, label]) => label),
  };
}

function appendCaduUserTagCandidate(
  target: Map<string, string>,
  automatic: Set<string>,
  module: ModuleKey,
  key: unknown,
  label: unknown,
): void {
  const keyText = slugify(key, 60);
  const labelText = normalizeWhitespace(label);
  if (!keyText && !labelText) return;

  const keyIsTaxonomy = !!keyText && isModuleTaxonomyTag(module, keyText);
  const labelIsTaxonomy = !!labelText && isModuleTaxonomyTag(module, labelText);
  if (keyIsTaxonomy && labelIsTaxonomy) return;

  // A few old Cadu payloads carried a taxonomy label beside an independent
  // key (or the inverse). Preserve the independent half as the visible label
  // and derive its key again, exactly as the database trigger does.
  const canonicalLabel = keyIsTaxonomy
    ? labelText
    : (labelIsTaxonomy ? keyText : (labelText || keyText));
  const canonicalKey = slugify(canonicalLabel, 60);
  if (!canonicalKey || automatic.has(canonicalKey) || isModuleTaxonomyTag(module, canonicalKey)) return;
  appendTagPair(target, canonicalKey, canonicalLabel);
}

function buildUserTags(
  source: CaduItem | Record<string, unknown>,
  module: ModuleKey,
  automaticTagKeys: unknown,
): { tags: string[]; tagKeys: string[] } {
  const automatic = new Set(
    (Array.isArray(automaticTagKeys) ? automaticTagKeys : [])
      .map((value) => slugify(value, 60))
      .filter(Boolean),
  );
  const record = source as Record<string, unknown>;
  const input = caduUserTagsForItem(record);
  const labels = input.explicit ? input.tags : (Array.isArray(record.tags) ? record.tags : []);
  const keys = input.explicit ? input.tagKeys : (Array.isArray(record.tagKeys) ? record.tagKeys : []);
  const pairs = new Map<string, string>();

  for (let index = 0; index < Math.max(labels.length, keys.length); index += 1) {
    appendCaduUserTagCandidate(pairs, automatic, module, keys[index], labels[index]);
  }

  if (pairs.size > MAX_CADU_USER_TAGS) {
    throw new TypeError(`userTags aceita no máximo ${MAX_CADU_USER_TAGS} tags adicionais para publicadores confiáveis.`);
  }

  const entries = Array.from(pairs.entries());
  return {
    tagKeys: entries.map(([key]) => key),
    tags: entries.map(([, label]) => label),
  };
}

function appendMetadataTagPairs(
  tags: unknown,
  tagKeys: unknown,
  additions: TagPair[],
): { tags: string[]; tagKeys: string[] } {
  const pairs = new Map<string, string>();
  const labels = Array.isArray(tags) ? tags : [];
  const keys = Array.isArray(tagKeys) ? tagKeys : [];
  for (let index = 0; index < Math.max(labels.length, keys.length); index += 1) {
    appendTagPair(pairs, keys[index] || labels[index], labels[index] || keys[index]);
  }
  additions.forEach(({ key, label }) => appendTagPair(pairs, key, label));
  const entries = Array.from(pairs.entries()).slice(0, 10);
  return {
    tagKeys: entries.map(([key]) => key),
    tags: entries.map(([, label]) => label),
  };
}

function inferActionLabel(item: CaduItem, module: string, documentLinks: Array<{ url: string }>): string {
  const explicit = normalizeWhitespace(item.actionLabel);
  if (explicit) return clamp(explicit, 42);
  const text = normalizeText(`${item.title || ""}\n${item.summary || ""}\n${item.text || ""}\n${item.description || ""}\n${item.formattedDescription || ""}`);
  if (documentLinks.length > 1) return "Acessar editais";
  if (documentLinks.length === 1 && /\.pdf(?:$|[?#])/i.test(documentLinks[0].url)) return "Acessar edital";
  if (/\binscric|submiss|formulario|candidat/.test(text)) return "Realizar inscricao";
  if (module === "eventos") return "Acessar evento";
  if (module === "oportunidades") return "Acessar oportunidade";
  return "Acessar link";
}

function scoreActionLink(item: CaduItem, module: string, link: { url: string; label?: string }, index: number): number {
  const url = validRemoteImageUrl(link.url);
  if (!url) return -1000;
  const label = normalizeText(link.label || "");
  const haystack = normalizeText(`${label} ${url}`);
  let score = 0;
  if (!/\.pdf(?:$|[?#])/i.test(url)) score += 20;
  if (/\b(edital|editais|chamada|fapeg|confap|sparkx|pibic|pivic|mobilidade|processo|selecao)\b/.test(haystack)) score += 35;
  if (/\b(inscric|submiss|formulario|forms\.gle|eventos?|evento|even3|plateia|candidat)\w*/.test(haystack)) score += 30;
  if (module === "eventos" && /\b(evento|inscric|formulario|forms\.gle|even3|plateia)\w*/.test(haystack)) score += 20;
  if (module === "oportunidades" && /\b(edital|chamada|bolsa|vaga|selecao|processo|fapeg|confap)\w*/.test(haystack)) score += 20;
  if (/\b(clique aqui|saiba mais|acesse aqui)\b/.test(label)) score -= 8;
  if (item.sourceUrl && url === item.sourceUrl) score -= 5;
  return score - (index * 0.01);
}

function pickActionLink(item: CaduItem, module: string, documentLinks: Array<{ url: string; label?: string }>): string {
  const explicit = validRemoteImageUrl(item.link);
  if (explicit) return explicit;
  const ranked = documentLinks
    .map((link, index) => ({ url: validRemoteImageUrl(link.url), score: scoreActionLink(item, module, link, index) }))
    .filter((link) => link.url)
    .sort((a, b) => b.score - a.score);
  if (ranked[0] && ranked[0].score >= 0) return ranked[0].url;
  return validRemoteImageUrl(item.sourceUrl);
}

function buildImageList(item: CaduItem): string[] {
  const raw = item.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {};
  const candidates = [
    item.image,
    item.imageUrl,
    item.image_url,
    item.cover,
    raw.image,
    raw.image_url,
    raw.cover,
    ...(Array.isArray(item.images) ? item.images : []),
  ];
  return uniq(candidates.map(validRemoteImageUrl))
    .filter((url) => url && !isSvgUrl(url))
    .slice(0, MAX_IMAGE_COUNT);
}

// Heuristic cover scorer — ranqueia candidatos a imagem de capa por relevância
// ao título/categoria, penalizando logos/ícones/imagens genéricas. Zero risco
// (sem chamada de API externa). VLM permanece desabilitado; esta heurística
// determinística resolve a maioria dos casos sem ativar visão.
const COVER_PENALTY_PATTERNS = /(?:logo|banner|favicon|icon|placeholder|default|spinner|loading|avatar|sprite|btn_|button|nav_|header_|footer_|sidebar|background|bg\.|wallpaper|stamp|seal|assinatura)/i;
const COVER_TINY_DIM = /[_\-/](\d{1,2})x(\d{1,2})(?![0-9])(?:\.|$|_)/;  // e.g. 16x16, 32x32
const COVER_GOOD_EXT = /\.(jpe?g|png|webp)(?:$|[?#])/i;

function scoreCoverCandidate(url: string, title: string, category: string, sourceHost: string): number {
  let score = 0;
  const lower = url.toLowerCase();

  // Penalidade forte: logos, ícones, placeholders
  if (COVER_PENALTY_PATTERNS.test(url)) score -= 50;

  // Penalidade: imagens minúsculas (provavelmente ícones)
  const dimMatch = lower.match(COVER_TINY_DIM);
  if (dimMatch) score -= 40;

  // Bônus: extensão de imagem fotográfica
  if (COVER_GOOD_EXT.test(lower)) score += 10;

  // Bônus: URL/filename contém palavra-chave relevante do título
  const titleWords = normalizeText(title)
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 6);
  const haystack = normalizeText(url);
  titleWords.forEach((word) => {
    if (haystack.indexOf(word) >= 0) score += 8;
  });

  // Bônus: URL/filename contém categoria
  if (category && haystack.indexOf(normalizeText(category)) >= 0) score += 5;

  // Penalidade leve: mesma origem do source (pode ser template logo)
  if (sourceHost && lower.indexOf(sourceHost.toLowerCase()) >= 0) score -= 2;

  // Penalidade: paths genéricos de upload sem contexto (img/photo/image + número)
  if (/\/(?:img|photo|image|foto|imagem)[-_/]?\d+[/.]/i.test(lower)) score -= 3;

  return score;
}

// Escolhe a melhor capa entre os candidatos usando scoring heurístico.
function pickCoverImage(candidates: string[], title: string, category: string, sourceHost: string): string {
  const persistable = candidates.filter(canPersistExternalImageUrl);
  if (persistable.length === 0) return "";
  if (persistable.length === 1) return persistable[0];
  const ranked = persistable
    .map((url) => ({ url, score: scoreCoverCandidate(url, title, category, sourceHost) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0].url;
}

export function mapItemToPost(item: CaduItem, options: { runId?: string } = {}): MappedPost {
  const warnings: string[] = [];
  const module = item.module as ModuleKey;
  const categoryKey = normalizeCategoryForModule(module, item.category);
  if (!categoryKey) {
    throw new TypeError(
      `category invalida ou ausente para module "${String(item.module || "")}".`,
    );
  }
  const categoryText = categoryLabel(categoryKey);
  const secondaryInput = secondaryInputForItem(item);
  const secondaryKey = normalizeSecondaryForModule(module, secondaryInput);
  if (secondaryValuesForModule(module).length && !secondaryKey) {
    throw new TypeError(
      `grupo secundario invalido ou ausente para module "${String(item.module || "")}".`,
    );
  }
  const secondaryText = secondaryLabelForModule(module, secondaryKey);
  const fullText = `${item.title || ""}\n${item.summary || ""}\n${item.text || ""}\n${item.description || ""}`;

  // Título: prefere formattedTitle da IA (já otimizado), clamp só em fallback
  const rawTitle = stripInstitutionalPrefix(
    stripTrailingEllipsis(item.formattedTitle || item.formatted_title || item.title || ""),
    item.sourceName
  );
  // Se veio da IA (formattedTitle), confia no tamanho (até 120 chars).
  // Se é título cru da fonte, clamp em 100 para evitar truncamento agressivo.
  const hasFormattedTitle = !!(item.formattedTitle || item.formatted_title);
  const title = hasFormattedTitle ? clamp(rawTitle, 120) : clamp(rawTitle, 100);
  const description = buildDescription(item);
  const sourceUrl = String(item.sourceUrl || "").trim().slice(0, 2_048);
  const sourceId = normalizeWhitespace(item.sourceId).slice(0, 500);
  const sourceTitle = normalizeWhitespace(item.sourceTitle ?? item.source_title).slice(0, 1_000);
  const sourceRegistryId = normalizeWhitespace(item.sourceRegistryId || item.source_registry_id).slice(0, 200);
  const sourceRevision = sourceRevisionForItem(item);
  const actionFingerprintMetadata = actionFingerprintMetadataForItem(item);
  const actionFingerprints = actionFingerprintMetadata.fingerprints;
  const extractedLinks = Array.isArray(item.extractedLinks) ? item.extractedLinks.slice(0, 12) : [];
  const relevantLinks = item.relevantLinks && typeof item.relevantLinks === "object" && !Array.isArray(item.relevantLinks)
    ? Object.fromEntries(
      Object.entries(item.relevantLinks).slice(0, 12).map(([group, links]) => [
        group,
        Array.isArray(links) ? links.slice(0, 20) : links,
      ]),
    )
    : {};
  const actionEvidence = Array.isArray(item.actionEvidence) ? item.actionEvidence.slice(0, 20) : [];
  const images = buildImageList(item);
  const sourceHost = hostOf(sourceUrl);
  // Cover: escolhe o melhor candidato por scoring heurístico (não apenas o primeiro)
  const safeExternalImage = pickCoverImage(images, title, categoryKey, sourceHost);
  const safeGalleryImages = images.filter(canPersistExternalImageUrl);
  const documentLinks = filterRelevantDocuments(normalizeDocumentLinks(item), item, module, 3);
  const enrichmentSources = normalizeEnrichmentSources(item);
  const actionLink = pickActionLink(item, module, documentLinks);
  const inferredActionLabel = inferActionLabel(item, module, documentLinks);
  const inferredActionKey = slugify(item.actionKey || inferredActionLabel);
  const actionLabel = module === "compra-venda" ? secondaryText : inferredActionLabel;
  const actionKey = module === "compra-venda" ? secondaryKey : inferredActionKey;

  const emails = extractEmails(`${fullText}\n${item.contato || ""}`);
  const contato = normalizeWhitespace(item.contato) || emails[0] || "Ver link oficial da UFG";

  const supportsLinkCta = module === "eventos" || module === "oportunidades";
  const linkAsCta = supportsLinkCta && (item.linkAsCta !== undefined ? !!item.linkAsCta : !!actionLink);
  const visibility = item.visibility === "community" ? "community" : "public";

  // Metadata comum a todos os modulos (fonte, capa, identidade, tags).
  const commonMeta: Record<string, unknown> = {
    source_url: sourceUrl,
    source_host: hostOf(sourceUrl),
    source_unit: normalizeWhitespace(item.sourceName),
    source_id: sourceId,
    source_title: sourceTitle,
    source_registry_id: sourceRegistryId,
    ...(sourceRevision ? { source_revision: sourceRevision } : {}),
    action_fingerprints: actionFingerprints,
    ...(actionFingerprintMetadata.contract
      ? {
        action_fingerprint_contract: actionFingerprintMetadata.contract,
        action_fingerprint_v2: actionFingerprintMetadata.v2Fingerprints,
      }
      : {}),
    content_hash: lightHash(`${item.title || ""}\n${item.text || item.description || ""}`),
    original_title: normalizeWhitespace(item.title),
    image_url: safeExternalImage,
    cover_url: safeExternalImage,
    gallery_image_urls: safeGalleryImages,
    edital_pdf_urls: Array.isArray(item.pdfLinks) ? item.pdfLinks.slice(0, 10) : [],
    extracted_links: extractedLinks,
    relevant_links: relevantLinks,
    action_evidence: actionEvidence,
    official_document_urls: documentLinks.map((l) => l.url),
    enrichment_sources: enrichmentSources,
    enrichment_checked_at: item.enrichmentCheckedAt || "",
    cadu_run_id: options.runId || "",
    cadu_published: true,
    contato,
    link: actionLink,
    link_as_cta: linkAsCta,
    actionLabel,
    actionKey,
    visibility,
  };
  const semanticDates = normalizeSemanticDates(item);
  if (Object.keys(semanticDates).length > 0) {
    commonMeta.dates = semanticDates;
  }

  const initialArea = module === "oportunidades"
    ? (normalizeWhitespace(item.area) || detectArea(fullText))
    : "";
  const { tags, tagKeys } = buildTags(item, module, [
    { key: categoryKey, label: categoryText },
    ...(secondaryKey ? [{ key: secondaryKey, label: secondaryText }] : []),
    ...(initialArea ? [{ key: slugify(initialArea), label: initialArea }] : []),
  ]);
  commonMeta.tags = tags;
  commonMeta.tagKeys = tagKeys;
  commonMeta.categoria = categoryText;
  commonMeta.categoriaLabel = categoryText;
  commonMeta.categoriaKey = categoryKey;
  commonMeta.categoryKey = categoryKey;
  commonMeta.categoryLabel = categoryText;

  let price: number | null = parseBRLNumber(item.price as unknown);
  let location = normalizeWhitespace(item.location) || detectLocation(fullText, String(item.sourceName || ""));
  const metadata: Record<string, unknown> = { ...commonMeta };

  if (module === "eventos") {
    const gratuito = item.gratuito !== undefined ? !!item.gratuito : true;
    if (gratuito) price = 0;

    // A presença de qualquer papel semântico torna o contrato autoritativo.
    // Nunca complete a outra ponta com um intervalo textual secundário: ele
    // pode ser prazo, resultado ou uma atividade diferente. O fallback legado
    // só é permitido quando nenhum papel semântico foi fornecido.
    const hasSemanticEventRole = hasExplicitSemanticEventRole(item);
    let dataEvento = semanticDates.eventStartsAt || "";
    let dataFim = semanticDates.eventEndsAt || "";
    if (!hasSemanticEventRole) {
      dataEvento = isoDateFromAny(item.dateStart) || parseBrazilianDate(item.dateStart);
      dataFim = isoDateFromAny(item.dateEnd) || parseBrazilianDate(item.dateEnd);
      const range = parseDateRange(fullText);
      if (!dataEvento && range.start) dataEvento = range.start;
      if (!dataFim && range.end) dataFim = range.end;
      if (!dataEvento) dataEvento = parseBrazilianDate(fullText);
    }
    if (dataFim && dataEvento && dataFim < dataEvento) dataFim = ""; // termino nunca antes do inicio
    const horaEvento = timeFromAny(item.time) || timeFromAny(fullText);

    Object.assign(metadata, {
      subcategory: "",
      subcategoryLabel: "",
      subcategoria: "",
      subcategoriaKey: "",
      data_evento: dataEvento,
      data_fim_evento: dataFim,
      hora_evento: horaEvento,
      gratuito,
      deadline_date: dataEvento ? formatDatePt(dataEvento) : "",
    });
    if (!location) location = "UFG";
  } else if (module === "oportunidades") {
    const type = normalizeOpportunityType(item.type);
    const area = normalizeWhitespace(item.area) || detectArea(fullText);
    const areaKey = slugify(area);
    const wm = resolveWorkMode(item.workMode, fullText);
    const usesRegime = type === "emprego";
    const regime = usesRegime ? resolveRegime(item.regime, fullText) : { key: "", label: "" };

    const remuneracaoText = normalizeWhitespace(item.remuneracao);
    const remunValue = parseBRLNumber(item.remuneracao as unknown);
    if (remunValue != null) price = remunValue;
    const gratuito = item.gratuito !== undefined ? !!item.gratuito : true;
    if (gratuito && price == null) price = 0;
    const deadlineDate = resolveOpportunityDeadline(item, fullText);

    Object.assign(metadata, {
      subcategory: areaKey,
      subcategoryLabel: area,
      subcategoria: area,
      subcategoriaKey: areaKey,
      area,
      areaLabel: area,
      areaKey,
      workMode: wm.key,
      workModeLabel: wm.label,
      modalidadeTrabalho: wm.label,
      employmentType: regime.key,
      employmentTypeLabel: regime.label,
      regimeContratacao: regime.label,
      remuneracao: remuneracaoText,
      opportunityType: type,
      gratuito,
      deadline_date: deadlineDate,
    });
    if (wm.label) {
      const extra = appendMetadataTagPairs(tags, tagKeys, [
        { key: wm.key, label: wm.label },
        { key: regime.key, label: regime.label },
      ]);
      metadata.tags = extra.tags;
      metadata.tagKeys = extra.tagKeys;
    }
  } else {
    // Modulos prontos por schema (moradia, compra-venda, caronas, achados-perdidos):
    // preenche as chaves de metadata conhecidas a partir do que o curador enviar.
    const isCompraVenda = module === "compra-venda";
    const isAchados = module === "achados-perdidos";
    const isMoradia = module === "moradia";
    Object.assign(metadata, {
      subcategory: isCompraVenda ? categoryKey : (isAchados ? secondaryKey : ""),
      subcategoryLabel: isCompraVenda ? categoryText : (isAchados ? secondaryText : ""),
      subcategoria: (isCompraVenda || isAchados) ? secondaryText : "",
      subcategoriaKey: (isCompraVenda || isAchados) ? secondaryKey : "",
      detalhes: normalizeWhitespace(item.detalhes),
      condicao: normalizeWhitespace(item.condicao),
      entrega: normalizeWhitespace(item.entrega),
      recompensa: normalizeWhitespace(item.recompensa),
      regiao: normalizeWhitespace(item.regiao),
      regiaoLabel: normalizeWhitespace(item.regiao),
      regionKey: slugify(item.regiao),
      regionLabel: normalizeWhitespace(item.regiao),
      housingTypeKey: isMoradia ? categoryKey : "",
      housingTypeLabel: isMoradia ? categoryText : "",
      origem: normalizeWhitespace(item.origem),
      destino: normalizeWhitespace(item.destino),
      horario: normalizeWhitespace(item.horario),
      contribuicao: normalizeWhitespace(item.contribuicao),
      vagas: item.vagas != null ? String(item.vagas) : "",
      marcadores: Array.isArray(item.features) ? item.features : [],
    });
    if (isCompraVenda) {
      metadata.subcategoryKey = categoryKey;
      metadata.actionKey = secondaryKey;
      metadata.actionLabel = secondaryText;
    }
    if (module === "moradia" && !location) location = normalizeWhitespace(item.regiao);
  }

  const userTags = buildUserTags(item, module, metadata.tagKeys);
  metadata.userTags = userTags.tags;
  metadata.userTagKeys = userTags.tagKeys;

  const row: MappedPost["row"] = {
    title,
    description,
    price,
    location,
    module,
    category: categoryKey,
    image_url: safeExternalImage || null,
    visibility,
    metadata,
  };

  // The database's 30-day trigger remains the fallback. When the source gives
  // a reliable event end or application deadline, keep the post visible until
  // that real-world boundary and close it at the end of the local day.
  const relevanceDate = module === "eventos"
    ? String(metadata.data_fim_evento || metadata.data_evento || "")
    : (module === "oportunidades" ? String(metadata.deadline_date || "") : "");
  const expiresAt = expiryAtEndOfDay(relevanceDate);
  if (expiresAt) row.expires_at = expiresAt;

  return {
    row,
    images,
    dedup: { sourceId, sourceUrl, contentHash: String(metadata.content_hash || "") },
    warnings,
  };
}

// Merge profundo de metadata (porta mergeMetadata de publisher.js):
// nunca substitui o objeto inteiro; preserva chaves existentes.
export function deepMergeMetadata(
  base: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = deepMergeMetadata(
        (result[key] as Record<string, unknown>) || {},
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

const USER_TAG_PATCH_FIELDS = ["userTags", "userTagKeys", "user_tags", "user_tag_keys"] as const;
const LEGACY_TAG_PATCH_FIELDS = ["tags", "tagKeys"] as const;

function hasOwn(value: Record<string, unknown> | null | undefined, key: string): boolean {
  return !!value && Object.prototype.hasOwnProperty.call(value, key);
}

function hasUserTagsPatch(patch: Record<string, unknown> | null | undefined): boolean {
  return USER_TAG_PATCH_FIELDS.some((key) => hasOwn(patch, key));
}

function hasLegacyTagsPatch(patch: Record<string, unknown> | null | undefined): boolean {
  return LEGACY_TAG_PATCH_FIELDS.some((key) => hasOwn(patch, key));
}

interface UserTagsEditResolution {
  metadataPatch: Record<string, unknown> | null | undefined;
  userTagsSource: Record<string, unknown> | null;
  rewriteAutomaticTags: boolean;
}

// tags/tagKeys remain automatic, server-computed facets. A legacy edit may
// still send them as free Tags only while the stored post has no canonical
// userTags pair. This protects current clients and preserves old Cadu payloads.
function normalizeUserTagsMetadataPatch(
  currentMetadata: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): UserTagsEditResolution {
  const current = currentMetadata || {};
  const currentHasUserTags = hasUserTagsPatch(current);
  if (!patch) {
    return currentHasUserTags
      ? { metadataPatch: patch, userTagsSource: null, rewriteAutomaticTags: false }
      : { metadataPatch: patch, userTagsSource: current, rewriteAutomaticTags: true };
  }

  const explicitUserTags = hasUserTagsPatch(patch);
  const legacyTags = hasLegacyTagsPatch(patch);
  const result = { ...patch };
  if (explicitUserTags) {
    const normalized = caduUserTagsForItem(patch);
    delete result.user_tags;
    delete result.user_tag_keys;
    delete result.tags;
    delete result.tagKeys;
    result.userTags = normalized.tags;
    result.userTagKeys = normalized.tagKeys;
    return { metadataPatch: result, userTagsSource: result, rewriteAutomaticTags: true };
  }

  if (legacyTags) {
    delete result.tags;
    delete result.tagKeys;
    if (!currentHasUserTags) {
      return { metadataPatch: result, userTagsSource: patch, rewriteAutomaticTags: true };
    }
  }

  return currentHasUserTags
    ? { metadataPatch: result, userTagsSource: null, rewriteAutomaticTags: false }
    : { metadataPatch: result, userTagsSource: current, rewriteAutomaticTags: true };
}

function metadataSecondaryKey(
  module: ModuleKey,
  metadata: Record<string, unknown>,
  patch: Record<string, unknown> | null | undefined,
): string {
  if (!secondaryValuesForModule(module).length) return "";
  const aliases = module === "compra-venda"
    ? ["subcategoriaKey", "subcategoria", "actionKey", "actionLabel"]
    : ["subcategoriaKey", "subcategoria", "subcategoryKey", "subcategory"];

  const patchedKeys = new Set<string>();
  for (const alias of aliases) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, alias)) continue;
    const raw = patch?.[alias];
    const key = normalizeSecondaryForModule(module, raw);
    if (typeof raw !== "string" || !raw.trim() || !key) {
      throw new TypeError(`grupo secundario invalido para module "${module}" em metadata.${alias}.`);
    }
    patchedKeys.add(key);
  }
  if (patchedKeys.size > 1) {
    throw new TypeError(`grupo secundario conflitante para module "${module}" no patch de metadata.`);
  }
  if (patchedKeys.size === 1) {
    return patchedKeys.values().next().value as string;
  }

  for (const alias of aliases) {
    const key = normalizeSecondaryForModule(module, metadata[alias]);
    if (key) return key;
  }
  throw new TypeError(`grupo secundario invalido ou ausente para module "${module}".`);
}

function appendEditAutomaticTagPairs(
  pairs: Map<string, string>,
  module: ModuleKey,
  nextCategory: TagPair,
  metadata: Record<string, unknown>,
  secondary: TagPair | null,
): void {
  appendTagPair(pairs, nextCategory.key, nextCategory.label);
  if (secondary) appendTagPair(pairs, secondary.key, secondary.label);
  if (module === "oportunidades") {
    const areaLabel = normalizeWhitespace(
      metadata.areaLabel || metadata.area || metadata.subcategoryLabel || metadata.subcategoria,
    );
    const areaKey = slugify(metadata.areaKey || metadata.subcategory || metadata.subcategoriaKey || areaLabel);
    appendTagPair(pairs, areaKey, areaLabel || areaKey);
  }
  appendTagPair(pairs, "ufg", "UFG");
  appendIndependentTagPair(pairs, module, metadata.source_unit, metadata.source_unit);
  if (module === "oportunidades") {
    const workModeKey = slugify(metadata.workMode || metadata.workModeLabel || metadata.modalidadeTrabalho);
    const workModeLabel = normalizeWhitespace(
      metadata.workModeLabel || metadata.modalidadeTrabalho || metadata.workMode || workModeKey,
    );
    appendTagPair(pairs, workModeKey, workModeLabel);
    const regimeKey = slugify(metadata.employmentType || metadata.employmentTypeLabel || metadata.regimeContratacao);
    const regimeLabel = normalizeWhitespace(
      metadata.employmentTypeLabel || metadata.regimeContratacao || metadata.employmentType || regimeKey,
    );
    appendTagPair(pairs, regimeKey, regimeLabel);
  }
}

function editTagPairs(
  module: ModuleKey,
  _previousCategory: string,
  nextCategory: TagPair,
  metadata: Record<string, unknown>,
  secondary: TagPair | null,
  preserveExistingIndependentTags = true,
): { tags: string[]; tagKeys: string[] } {
  const pairs = new Map<string, string>();
  appendEditAutomaticTagPairs(pairs, module, nextCategory, metadata, secondary);

  if (preserveExistingIndependentTags) {
    const labels = Array.isArray(metadata.tags) ? metadata.tags : [];
    const keys = Array.isArray(metadata.tagKeys) ? metadata.tagKeys : [];
    for (let index = 0; index < Math.max(labels.length, keys.length); index += 1) {
      appendIndependentTagPair(pairs, module, keys[index], labels[index]);
    }
  }
  const entries = Array.from(pairs.entries()).slice(0, 10);
  return {
    tagKeys: entries.map(([key]) => key),
    tags: entries.map(([, label]) => label),
  };
}

export interface TaxonomyEditPatch {
  categoryKey: string;
  categoryLabel: string;
  metadata: Record<string, unknown>;
}

function validateCompraVendaPrimaryMetadataAliases(
  categoryKey: string,
  metadataPatch: Record<string, unknown> | null | undefined,
): void {
  if (!metadataPatch) return;
  const aliases = [
    "categoryKey",
    "categoryLabel",
    "categoriaKey",
    "categoriaLabel",
    "categoria",
    "subcategoryKey",
    "subcategoryLabel",
    "subcategory",
  ] as const;
  for (const alias of aliases) {
    if (!Object.prototype.hasOwnProperty.call(metadataPatch, alias)) continue;
    const raw = metadataPatch[alias];
    const normalized = normalizeCategoryForModule("compra-venda", raw);
    if (typeof raw !== "string" || !raw.trim() || !normalized) {
      throw new TypeError(`category alias invalido em metadata.${alias}.`);
    }
    if (normalized !== categoryKey) {
      throw new TypeError(
        `category conflitante em metadata.${alias}: esperado "${categoryKey}", recebido "${normalized}".`,
      );
    }
  }
}

// Unico ponto de reconciliacao usado pelo handler de edit. A categoria muda
// seus aliases derivados; area (oportunidades), acao (compra-venda) e tipo do
// item (achados-perdidos) permanecem independentes.
export function buildTaxonomyEditPatch(
  moduleValue: unknown,
  previousCategoryValue: unknown,
  requestedCategoryValue: unknown,
  currentMetadata: Record<string, unknown> | null | undefined,
  metadataPatch?: Record<string, unknown> | null,
): TaxonomyEditPatch {
  const module = moduleValue as ModuleKey;
  const categoryKey = normalizeCategoryForModule(module, requestedCategoryValue);
  if (!categoryKey) {
    throw new TypeError(`category invalida ou ausente para module "${String(moduleValue || "")}".`);
  }
  const categoryText = categoryLabel(categoryKey);
  const previousCategory = normalizeCategoryForModule(module, previousCategoryValue);
  if (module === "compra-venda") {
    validateCompraVendaPrimaryMetadataAliases(categoryKey, metadataPatch);
  }
  const userTagsResolution = normalizeUserTagsMetadataPatch(currentMetadata, metadataPatch);
  const normalizedMetadataPatch = userTagsResolution.metadataPatch;
  const metadata = deepMergeMetadata(currentMetadata, normalizedMetadataPatch);
  const secondaryKey = metadataSecondaryKey(module, metadata, normalizedMetadataPatch);
  const secondaryText = secondaryLabelForModule(module, secondaryKey);

  Object.assign(metadata, {
    categoria: categoryText,
    categoriaLabel: categoryText,
    categoriaKey: categoryKey,
    categoryKey,
    categoryLabel: categoryText,
  });

  if (module === "eventos" || module === "caronas") {
    Object.assign(metadata, {
      subcategory: "",
      subcategoryLabel: "",
      subcategoria: "",
      subcategoriaKey: "",
    });
  } else if (module === "moradia") {
    Object.assign(metadata, {
      subcategory: "",
      subcategoryLabel: "",
      subcategoria: "",
      subcategoriaKey: "",
      housingTypeKey: categoryKey,
      housingTypeLabel: categoryText,
    });
  } else if (module === "compra-venda") {
    Object.assign(metadata, {
      subcategory: categoryKey,
      subcategoryKey: categoryKey,
      subcategoryLabel: categoryText,
      subcategoria: secondaryText,
      subcategoriaKey: secondaryKey,
      actionKey: secondaryKey,
      actionLabel: secondaryText,
    });
  } else if (module === "achados-perdidos") {
    Object.assign(metadata, {
      subcategory: secondaryKey,
      subcategoryLabel: secondaryText,
      subcategoria: secondaryText,
      subcategoriaKey: secondaryKey,
    });
  }

  if (module !== "moradia") {
    delete metadata.housingTypeKey;
    delete metadata.housingTypeLabel;
  }

  const automaticTagPairs = editTagPairs(
    module,
    previousCategory,
    { key: categoryKey, label: categoryText },
    metadata,
    secondaryKey ? { key: secondaryKey, label: secondaryText } : null,
    false,
  );
  if (userTagsResolution.userTagsSource) {
    const userTags = buildUserTags(
      userTagsResolution.userTagsSource,
      module,
      automaticTagPairs.tagKeys,
    );
    metadata.userTags = userTags.tags;
    metadata.userTagKeys = userTags.tagKeys;
  }

  const tagPairs = userTagsResolution.rewriteAutomaticTags
    ? automaticTagPairs
    : editTagPairs(
      module,
      previousCategory,
      { key: categoryKey, label: categoryText },
      metadata,
      secondaryKey ? { key: secondaryKey, label: secondaryText } : null,
    );
  metadata.tags = tagPairs.tags;
  metadata.tagKeys = tagPairs.tagKeys;
  return { categoryKey, categoryLabel: categoryText, metadata };
}
