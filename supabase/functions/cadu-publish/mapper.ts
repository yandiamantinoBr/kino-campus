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
  categoryLabel,
  DEFAULT_CATEGORY,
  ModuleKey,
  normalizeOpportunityType,
  resolveRegime,
  resolveWorkMode,
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
  const raw = [
    item.dateEnd,
    item.dateStart,
    (item as Record<string, unknown>).updatedAt,
    (item as Record<string, unknown>).updated_at,
    item.sourceUrl,
  ].map((value) => String(value || "")).join(" ");
  const match = raw.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getUTCFullYear();
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
  return Array.from(byUrl.values()).slice(0, 6);
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

  const documentLinks = normalizeDocumentLinks(item);
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

function buildTags(item: CaduItem, categoryText: string, area: string): { tags: string[]; tagKeys: string[] } {
  const base = uniq([
    ...(Array.isArray(item.tags) ? item.tags.map((t) => normalizeWhitespace(t)) : []),
    "UFG",
    normalizeWhitespace(item.sourceName),
    categoryText,
    area,
  ]).slice(0, 8);
  const tagKeys = uniq(base.map((t) => slugify(t)).filter(Boolean));
  return { tags: base, tagKeys };
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

export function mapItemToPost(item: CaduItem, options: { runId?: string } = {}): MappedPost {
  const warnings: string[] = [];
  const module = item.module as ModuleKey;
  const fullText = `${item.title || ""}\n${item.summary || ""}\n${item.text || ""}\n${item.description || ""}`;

  const title = clamp(stripInstitutionalPrefix(item.formattedTitle || item.formatted_title || item.title || "", item.sourceName), 80);
  const description = buildDescription(item);
  const sourceUrl = String(item.sourceUrl || "");
  const sourceId = String(item.sourceId || "");
  const images = buildImageList(item);
  const safeExternalImage = images.find(canPersistExternalImageUrl) || "";
  const safeGalleryImages = images.filter(canPersistExternalImageUrl);
  const documentLinks = normalizeDocumentLinks(item);
  const enrichmentSources = normalizeEnrichmentSources(item);
  const actionLink = pickActionLink(item, module, documentLinks);
  const actionLabel = inferActionLabel(item, module, documentLinks);
  const actionKey = slugify(item.actionKey || actionLabel);

  const categoryKey = slugify(item.category) || DEFAULT_CATEGORY[module] || "";
  const categoryText = categoryLabel(categoryKey);

  const emails = extractEmails(`${fullText}\n${item.contato || ""}`);
  const contato = normalizeWhitespace(item.contato) || emails[0] || "Ver link oficial da UFG";

  const linkAsCta = item.linkAsCta !== undefined ? !!item.linkAsCta : !!actionLink;
  const visibility = item.visibility === "community" ? "community" : "public";

  // Metadata comum a todos os modulos (fonte, capa, identidade, tags).
  const commonMeta: Record<string, unknown> = {
    source_url: sourceUrl,
    source_host: hostOf(sourceUrl),
    source_unit: normalizeWhitespace(item.sourceName),
    source_id: sourceId,
    content_hash: lightHash(`${item.title || ""}\n${item.text || item.description || ""}`),
    original_title: normalizeWhitespace(item.title),
    image_url: safeExternalImage,
    cover_url: safeExternalImage,
    gallery_image_urls: safeGalleryImages,
    edital_pdf_urls: Array.isArray(item.pdfLinks) ? item.pdfLinks.slice(0, 10) : [],
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

  const { tags, tagKeys } = buildTags(
    item,
    categoryText,
    module === "oportunidades" ? (normalizeWhitespace(item.area) || detectArea(fullText)) : "",
  );
  commonMeta.tags = tags;
  commonMeta.tagKeys = tagKeys;
  commonMeta.categoria = categoryText;
  commonMeta.categoriaKey = categoryKey;
  commonMeta.categoryKey = categoryKey;
  commonMeta.categoryLabel = categoryText;

  let price: number | null = parseBRLNumber(item.price as unknown);
  let location = normalizeWhitespace(item.location) || detectLocation(fullText, String(item.sourceName || ""));
  const metadata: Record<string, unknown> = { ...commonMeta };

  if (module === "eventos") {
    const gratuito = item.gratuito !== undefined ? !!item.gratuito : true;
    if (gratuito) price = 0;

    // Datas: explicitas tem prioridade; senao tenta intervalo e data unica do texto.
    let dataEvento = isoDateFromAny(item.dateStart) || parseBrazilianDate(item.dateStart);
    let dataFim = isoDateFromAny(item.dateEnd) || parseBrazilianDate(item.dateEnd);
    if (!dataEvento || !dataFim) {
      const range = parseDateRange(fullText);
      if (!dataEvento && range.start) dataEvento = range.start;
      if (!dataFim && range.end) dataFim = range.end;
    }
    if (!dataEvento) dataEvento = parseBrazilianDate(fullText);
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
      const extra = uniq([...(tags as string[]), wm.label, regime.label]).slice(0, 10);
      metadata.tags = extra;
      metadata.tagKeys = uniq(extra.map((t) => slugify(t)).filter(Boolean));
    }
  } else {
    // Modulos prontos por schema (moradia, compra-venda, caronas, achados-perdidos):
    // preenche as chaves de metadata conhecidas a partir do que o curador enviar.
    const type = normalizeText(item.type);
    Object.assign(metadata, {
      subcategory: slugify(item.category) || "",
      subcategoryLabel: categoryText,
      subcategoria: categoryText,
      subcategoriaKey: categoryKey,
      detalhes: normalizeWhitespace(item.detalhes),
      condicao: normalizeWhitespace(item.condicao),
      entrega: normalizeWhitespace(item.entrega),
      recompensa: normalizeWhitespace(item.recompensa),
      regiao: normalizeWhitespace(item.regiao),
      regiaoLabel: normalizeWhitespace(item.regiao),
      regionKey: slugify(item.regiao),
      regionLabel: normalizeWhitespace(item.regiao),
      housingTypeKey: module === "moradia" ? categoryKey : "",
      housingTypeLabel: module === "moradia" ? categoryText : "",
      origem: normalizeWhitespace(item.origem),
      destino: normalizeWhitespace(item.destino),
      horario: normalizeWhitespace(item.horario),
      contribuicao: normalizeWhitespace(item.contribuicao),
      vagas: item.vagas != null ? String(item.vagas) : "",
      marcadores: Array.isArray(item.features) ? item.features : [],
    });
    if (module === "moradia" && !location) location = normalizeWhitespace(item.regiao);
    void type;
  }

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
