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
  timeFromAny,
  uniq,
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

function markdownUrlLink(url: unknown): string {
  const clean = validRemoteImageUrl(url);
  return clean ? `[${clean}](${clean})` : "";
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

function buildDescription(item: CaduItem): string {
  const lead = normalizeWhitespace(
    stripHtml(item.description || item.summary || item.text || ""),
  );
  const chunks: string[] = [];
  if (lead) chunks.push(clamp(lead, 1400));

  const sourceUrl = validRemoteImageUrl(item.sourceUrl);
  const sourceLabel = buildSourceLabel(String(item.sourceName || ""));
  const alreadyHasSource = sourceUrl && lead.includes(sourceUrl);

  const documentLinks = normalizeDocumentLinks(item);
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

function pickActionLink(item: CaduItem, documentLinks: Array<{ url: string }>): string {
  const explicit = validRemoteImageUrl(item.link);
  if (explicit) return explicit;
  const firstDoc = documentLinks.find((l) => validRemoteImageUrl(l.url));
  if (firstDoc) return validRemoteImageUrl(firstDoc.url);
  return validRemoteImageUrl(item.sourceUrl);
}

function buildImageList(item: CaduItem): string[] {
  return uniq(
    [item.image, ...(Array.isArray(item.images) ? item.images : [])].map(validRemoteImageUrl),
  ).slice(0, 1);
}

export function mapItemToPost(item: CaduItem, options: { runId?: string } = {}): MappedPost {
  const warnings: string[] = [];
  const module = item.module as ModuleKey;
  const fullText = `${item.title || ""}\n${item.summary || ""}\n${item.text || ""}\n${item.description || ""}`;

  const title = clamp(item.title, 80);
  const description = buildDescription(item);
  const sourceUrl = String(item.sourceUrl || "");
  const sourceId = String(item.sourceId || "");
  const images = buildImageList(item);
  const documentLinks = normalizeDocumentLinks(item);
  const actionLink = pickActionLink(item, documentLinks);

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
    image_url: images[0] || "",
    cover_url: images[0] || "",
    edital_pdf_urls: Array.isArray(item.pdfLinks) ? item.pdfLinks.slice(0, 10) : [],
    official_document_urls: documentLinks.map((l) => l.url),
    cadu_run_id: options.runId || "",
    cadu_published: true,
    contato,
    link: actionLink,
    link_as_cta: linkAsCta,
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
    const gratuito = item.gratuito !== undefined ? !!item.gratuito : false;
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
    image_url: images[0] || null,
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
