// KinoCampus — Edge Function: cadu-publish (v1)
//
// Endpoint canonico e versionado para o Cadu (OpenClaw) publicar/editar/listar
// no Kino Campus. Substitui o INSERT direto dos scripts soltos do servidor.
//
// Por que existe:
//   - Centraliza no repositorio (versionado, testavel) a montagem de campos por
//     modulo, a publicacao privilegiada e o upload de imagem.
//   - So contas na allowlist public.kc_trusted_publishers podem usar (Cadu).
//   - A combinacao com a migration 20260530120000 (isencao do anti-spam para
//     bots confiaveis) garante que posts oficiais com varios links NAO caiam em
//     'pending'.
//
// Acoes (POST /functions/v1/cadu-publish):
//   { action: "capabilities" }              -> contrato read-only do endpoint
//   { action: "publish", item, options? }   -> cria post + capa
//   { action: "review", ...reviewEnvelope } -> cria sugestao duravel pending
//   { action: "edit", postId, fields?, metadata?, userTags?, tags?, image?, images? } -> edita
//   { action: "edit", postId, reclassification: { expected, item } } -> reclassifica com CAS
//   { action: "list", filters? }            -> lista posts do Cadu (filtra)
//   { action: "check", sourceUrl?, sourceId? } -> dedup (ja postado?)
//
// Headers: Authorization: Bearer <access_token da conta do Cadu>
// NOTA: verify_jwt permanece habilitado no gateway. A funcao revalida o JWT e
// a allowlist internamente como defesa em profundidade; nao implantar com
// --no-verify-jwt.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isCurrentSessionActive } from "../_shared/active-session.ts";
import {
  categoriesForModule,
  CaduItem,
  normalizeCategoryForModule,
  validateItem,
} from "./schema.ts";
import {
  buildTaxonomyEditPatch,
  deepMergeMetadata,
  mapItemToPost,
  MAX_IMAGE_COUNT,
} from "./mapper.ts";
import { boundReviewPublicationDirective } from "./directive.ts";
import { officialCoverCandidates } from "./official-cover.ts";
import { downloadRemoteImage } from "./image-download.ts";
import { RemoteResourceError } from "./remote-resource.ts";
import {
  INSTITUTIONAL_REVIEW_POLICY_CODE,
  institutionalReviewRpcArguments,
  parseInstitutionalReview,
  type InstitutionalReviewInput,
} from "./review.ts";
import {
  buildCoverRenderUrl,
  canPersistExternalImageUrl,
  COVER_RENDER_WIDTH,
  hostOf,
  isoDateFromAny,
  isDurableSourceIdentityUrl,
  isSvgUrl,
  isTemporaryOrSocialImageUrl,
  lightHash,
  normalizeText,
  normalizeWhitespace,
  parseBrazilianDate,
  parseDateRange,
  readImageDimensions,
  resolveAutoPublishScoreMin,
  stripHtml,
  validRemoteImageUrl,
} from "./util.ts";

function optionalEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return undefined;
    throw error;
  }
}

const SUPABASE_URL = optionalEnv("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = optionalEnv("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = optionalEnv("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (optionalEnv("KC_APP_BASE_URL") || "https://www.kinocampus.com.br").replace(/\/$/, "");

const STORAGE_BUCKET = "kino-media";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const IMAGE_DOWNLOAD_TIMEOUT_MS = Math.max(
  1_000,
  Math.min(Number(optionalEnv("CADU_IMAGE_DOWNLOAD_TIMEOUT_MS")) || 8_000, 30_000),
);
const IMAGE_UPLOAD_CONCURRENCY = Math.max(
  1,
  Math.min(Math.trunc(Number(optionalEnv("CADU_IMAGE_UPLOAD_CONCURRENCY")) || 2), 4),
);
const USER_AGENT = "KinoCampus-Cadu/1.0 (+https://www.kinocampus.com.br)";
const AUTO_PUBLISH_SCORE_MIN = resolveAutoPublishScoreMin(optionalEnv("AUTO_PUBLISH_SCORE_MIN"));
const INSTITUTIONAL_REVIEW_ENABLED =
  optionalEnv("CADU_INSTITUTIONAL_REVIEW_ENABLED") === "1";
const CAPABILITY_VERSION = "cadu-publish-capabilities-v1";
const RECLASSIFICATION_CONTRACT = "cadu-edit-reclassification-v1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

const MODULE_PAGE: Record<string, string> = {
  eventos: "eventos.html",
  oportunidades: "oportunidades.html",
  moradia: "moradia.html",
  "compra-venda": "compra-venda-feed.html",
  caronas: "caronas-feed.html",
  "achados-perdidos": "achados-perdidos.html",
};

function postUrl(module: string): string {
  const page = MODULE_PAGE[module] || "index.html";
  return `${SITE_URL}/${page}`;
}

interface PublishQuality {
  ok: boolean;
  warnings: string[];
  blockingWarnings: string[];
  autoPublishScoreMin: number;
  recommendation: string;
}

const MONTHS_PT: Record<string, string> = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

function serverTodayIso(): string {
  const forced = optionalEnv("CADU_NOW_ISO") || "";
  const date = forced ? new Date(forced) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function validIsoDate(value: unknown): string {
  const raw = String(value || "").trim();
  const iso = isoDateFromAny(raw) || parseBrazilianDate(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10) === iso ? iso : "";
}

function datePartsToIso(day: string, month: string, year: string, fallbackYear: string): string {
  const y = String(year || fallbackYear);
  const yy = y.length === 2 ? `20${y}` : y;
  const iso = `${yy.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return validIsoDate(iso);
}

function extractTextDates(value: unknown, today: string): string[] {
  const text = normalizeText(stripHtml(value || ""));
  const fallbackYear = today.slice(0, 4);
  const out: string[] = [];
  let match: RegExpExecArray | null;

  const add = (iso: string) => {
    if (iso && !out.includes(iso)) out.push(iso);
  };

  const namedRange = /\b([0-3]?\d)\s*(?:a|ate|-)\s*([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+((?:20)?\d{2}))?\b/g;
  while ((match = namedRange.exec(text))) {
    add(datePartsToIso(match[2], MONTHS_PT[match[3]] || "", match[4] || "", fallbackYear));
  }

  const named = /\b([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+((?:20)?\d{2}))?\b/g;
  while ((match = named.exec(text))) {
    add(datePartsToIso(match[1], MONTHS_PT[match[2]] || "", match[3] || "", fallbackYear));
  }

  const numericRange = /\b([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\s*(?:a|ate|-)\s*([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/g;
  while ((match = numericRange.exec(text))) {
    add(datePartsToIso(match[4], match[5], match[6] || match[3] || "", fallbackYear));
  }

  const numeric = /\b([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/g;
  while ((match = numeric.exec(text))) {
    add(datePartsToIso(match[1], match[2], match[3] || "", fallbackYear));
  }

  return out.sort();
}

function dateValuesFromUnknown(value: unknown): string[] {
  const out: string[] = [];
  const add = (candidate: unknown) => {
    const iso = validIsoDate(candidate);
    if (iso && !out.includes(iso)) out.push(iso);
  };
  const walk = (candidate: unknown) => {
    if (!candidate) return;
    if (typeof candidate === "string" || typeof candidate === "number") {
      add(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(walk);
      return;
    }
    if (typeof candidate === "object") {
      Object.entries(candidate as Record<string, unknown>).forEach(([key, val]) => {
        if (/date|data|latest|future|past|deadline|event/i.test(key)) walk(val);
      });
    }
  };
  walk(value);
  return out.sort();
}

function hasCmsCreditLine(value: unknown): boolean {
  return String(value || "")
    .normalize("NFKC")
    .split(/\r?\n+/)
    .map((line) => normalizeWhitespace(stripHtml(line)))
    .filter(Boolean)
    .some((line) =>
      /^(texto|fotos?|foto|imagens?|imagem|reportagem|edicao|edição)\s*:\s*[^:]{2,120}$/i.test(line) ||
      /^por\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ' .-]{2,80}\*?$/u.test(line)
    );
}

function hasStrongActionSignal(value: unknown): boolean {
  return /\b(edital|chamada|processo seletivo|inscric\w*|submiss\w*|formulario|candidat\w*|prazo|bolsa|vagas?|monitoria|estagio|professor substituto|concurso publico|curso|oficina|palestra|seminario|congresso|matricula|resultado|recurso)\b/.test(normalizeText(value));
}

function hasConcretePublishActionSignal(value: unknown): boolean {
  return /\b(edital|chamada|processo seletivo|inscric\w*|submiss\w*|formulario|candidat\w*|prazo|bolsa|vagas?|monitoria|estagio|professor substituto|concurso publico|matricula|recurso)\b/.test(normalizeText(value));
}

function hasInstitutionalOnlySignal(value: unknown): boolean {
  return /\b(marca presenca|marcou presenca|participa de encontro|recebe alunos|se engaja|reune autoridades|e finalista|fica em 3|homenageia|conquista|estao na china|recebe expoente|expoente nacional|reconhece os destaques|prospecta acordos|visita institucional|reuniao institucional|trajetoria academica|trajetoria profissional|perfil do servidor|perfil da servidora|servidor em destaque|historia de vida|conheca o servidor)\b/.test(normalizeText(value));
}

function hasActionableMarkdownDescription(value: unknown): boolean {
  const text = normalizeWhitespace(stripHtml(value || ""));
  const normalized = normalizeText(text);
  if (text.length < 160) return false;
  if (!/\[[^\]]{3,}\]\(https?:\/\/[^)]+\)/i.test(String(value || "")) && !/https?:\/\/\S+/i.test(text)) return false;
  return /\b(prazo|data|inscric\w*|edital|evento|local|publico|requisit|bolsa|curso|oficina|palestra|selecao|submiss|fonte oficial|documentos?)\b/.test(normalized);
}

function imageCandidatesFromItem(item: CaduItem): string[] {
  const raw = item.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {};
  return Array.from(new Set([
    item.image,
    item.imageUrl,
    item.image_url,
    item.cover,
    raw.image,
    raw.image_url,
    raw.cover,
    ...(Array.isArray(item.images) ? item.images : []),
  ].map(validRemoteImageUrl).filter(Boolean)));
}

function isInstagramUrl(value: unknown): boolean {
  const host = hostOf(value).toLowerCase();
  return /(^|\.)instagram\.com$/.test(host) || /(^|\.)cdninstagram\.com$/.test(host);
}

function hasOfficialNonInstagramSource(item: CaduItem): boolean {
  const sources = [
    item.sourceUrl,
    ...(Array.isArray(item.enrichmentSources)
      ? item.enrichmentSources.map((source) => typeof source === "string" ? source : source?.url)
      : []),
  ].filter(Boolean);
  return sources.some((source) => {
    const host = hostOf(source).toLowerCase();
    if (!host || /(^|\.)instagram\.com$/.test(host) || /(^|\.)cdninstagram\.com$/.test(host)) return false;
    return /(^|\.)ufg\.br$/.test(host) || /gov\.br$/.test(host) || /even3\.com\.br$/.test(host) || /forms\.gle$/.test(host);
  });
}

function evaluateCaduPublishQuality(item: CaduItem, mapped: ReturnType<typeof mapItemToPost>): PublishQuality {
  const warnings: string[] = [];
  const blockingWarnings: string[] = [];
  const today = serverTodayIso();
  const row = mapped.row;
  const metadata = row.metadata || {};
  const description = String(row.description || "");
  const fullText = [
    item.title,
    item.summary,
    item.text,
    item.description,
    item.formattedDescription,
    row.description,
  ].filter(Boolean).join("\n");
  const allDates = Array.from(new Set([
    ...extractTextDates(fullText, today),
    ...dateValuesFromUnknown(item.dates),
    validIsoDate(item.dateStart),
    validIsoDate(item.dateEnd),
    validIsoDate(metadata.data_evento),
    validIsoDate(metadata.data_fim_evento),
    validIsoDate(metadata.deadline_date),
    parseDateRange(fullText).end,
  ].filter(Boolean))).sort();
  const futureDates = allDates.filter((date) => date >= today);
  const latestDate = allDates[allDates.length - 1] || "";
  const hasDeadlineContext = /\b(prazo|ate|inscric\w*|submiss\w*|encerra\w*|termina\w*|periodo|candidat\w*|matricula|recurso)\b/.test(normalizeText(fullText));
  const explicitExpired = !!(
    item.dates && typeof item.dates === "object" &&
    ((item.dates as Record<string, unknown>).isExpired === true || (item.dates as Record<string, unknown>).expired === true)
  );
  const semanticDates = metadata.dates && typeof metadata.dates === "object"
    ? metadata.dates as Record<string, unknown>
    : {};
  const applicationDeadline = validIsoDate(
    semanticDates.applicationDeadline || semanticDates.application_deadline,
  );
  const applicationDeadlineExpired = row.module === "oportunidades" &&
    !!applicationDeadline &&
    applicationDeadline < today;

  const block = (warning: string) => {
    if (!blockingWarnings.includes(warning)) blockingWarnings.push(warning);
  };
  const warn = (warning: string) => {
    if (!warnings.includes(warning)) warnings.push(warning);
  };

  if (explicitExpired) block("source_marks_expired");
  if (applicationDeadlineExpired) block("application_deadline_past");
  if (row.module === "eventos") {
    const end = validIsoDate(metadata.data_fim_evento) || validIsoDate(item.dateEnd);
    const start = validIsoDate(metadata.data_evento) || validIsoDate(item.dateStart);
    if (end && end < today) block("event_past");
    else if (start && start < today && !end && !futureDates.length) block("event_past");
    else if (!start && latestDate && latestDate < today && !futureDates.length) block("event_past");
  } else if (
    !applicationDeadlineExpired &&
    hasDeadlineContext &&
    latestDate &&
    latestDate < today &&
    !futureDates.length
  ) {
    // F2 B8 (2026-07-06): mudou de block pra warn. Heurística original bloqueava
    // itens válidos como "Transporte XVII SEREX" (vagas remanescentes, texto:
    // "vagas limitadas e preenchimento imediato") e "AUIP bolsas" (sem data
    // futura explícita, texto: "Prazo não divulgado"). Agora o Curador pode
    // sinalizar a qualidade (warning) sem bloquear — o user revisa no painel
    // se quiser. Eventos com data fim passada (event_past) continuam bloqueando.
    warn("deadline_past");
  }

  if (
    (hasInstitutionalOnlySignal(item.title) && !hasConcretePublishActionSignal(fullText)) ||
    (hasInstitutionalOnlySignal(fullText) && !hasStrongActionSignal(fullText))
  ) block("institutional_or_biographical_release");
  if (hasCmsCreditLine(description)) block("cms_credits_in_description");
  if (!hasActionableMarkdownDescription(description)) block("weak_description");

  // A diretiva de publicação da Central de Revisões (contrato
  // cadu-review-publication-directives-v1) é a autoridade editorial para o
  // registro exato: o publisher openclaw-cadu só a anexa após revalidar o
  // vínculo dentro da prova de aprovação assinada. Um vínculo válido isenta
  // APENAS o gate de score do curador — os demais bloqueios permanecem.
  const boundDirective = boundReviewPublicationDirective(item as unknown as Record<string, unknown>);
  const numericScore = Number(item.score);
  if (
    Number.isFinite(numericScore) && numericScore < AUTO_PUBLISH_SCORE_MIN &&
    !boundDirective
  ) {
    block("score_below_auto_publish_threshold");
  }

  const rawImages = imageCandidatesFromItem(item);
  if (rawImages.length && rawImages.every((url) => isSvgUrl(url) || isTemporaryOrSocialImageUrl(url)) && !mapped.images.some(canPersistExternalImageUrl)) {
    block("only_temporary_or_svg_images");
  }
  if (isInstagramUrl(item.sourceUrl) && !hasOfficialNonInstagramSource(item)) block("instagram_without_official_source");
  if (!mapped.images.length) warn("missing_image_candidates");
  if (!Array.isArray(item.enrichmentSources) || !item.enrichmentSources.length) warn("missing_enrichment_sources");

  warnings.push(...blockingWarnings.filter((warning) => !warnings.includes(warning)));
  return {
    ok: blockingWarnings.length === 0,
    warnings,
    blockingWarnings,
    autoPublishScoreMin: AUTO_PUBLISH_SCORE_MIN,
    recommendation: blockingWarnings.length
      ? "Corrija o item, consulte fonte oficial complementar e rode dry-run antes de reenviar para publicacao."
      : "Item apto para tentativa de publicacao pelo endpoint do Cadu.",
  };
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  return downloadRemoteImage(url, {
    timeoutMs: IMAGE_DOWNLOAD_TIMEOUT_MS, maxBytes: MAX_IMAGE_BYTES, userAgent: USER_AGENT,
  });
}

// Sobe a capa para kino-media e devolve a URL publica do Storage (ou "" se falhar)
// junto da URL de render proporcional (para metadata.cover_render → og:image sem
// corte e na faixa de KB para crawlers).
interface UploadedCover {
  publicUrl: string;
  coverRenderUrl: string;
}
async function uploadCover(
  admin: SupabaseClient,
  userId: string,
  postId: string,
  sourceUrl: string,
  index = 0,
): Promise<UploadedCover> {
  const clean = validRemoteImageUrl(sourceUrl);
  if (!clean) return { publicUrl: "", coverRenderUrl: "" };
  const { bytes, contentType, ext } = await downloadImage(clean);
  const path = `post-media/${userId}/${postId}/cadu-${index + 1}-${lightHash(clean)}.${ext}`;
  const { error } = await admin.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl || "";
  const dims = readImageDimensions(bytes);
  const coverRenderUrl = dims
    ? buildCoverRenderUrl(publicUrl, COVER_RENDER_WIDTH, Math.round(dims.height * COVER_RENDER_WIDTH / Math.max(1, dims.width)))
    : "";
  return { publicUrl, coverRenderUrl };
}

interface PreparedImage {
  source: string;
  url: string;
  uploaded: boolean;
  fallback: boolean;
  error?: string;
}

async function prepareFinalImages(
  admin: SupabaseClient,
  userId: string,
  postId: string,
  candidates: string[],
  allowExternalFallback: boolean,
): Promise<{ images: string[]; uploads: PreparedImage[]; coverRender: string }> {
  const cleanCandidates = Array.from(new Set(candidates.map(validRemoteImageUrl).filter(Boolean))).slice(0, MAX_IMAGE_COUNT);
  const results = new Array<PreparedImage>(cleanCandidates.length);
  let nextIndex = 0;
  let coverRender = "";

  async function worker(): Promise<void> {
    while (nextIndex < cleanCandidates.length) {
      const index = nextIndex;
      nextIndex += 1;
      const candidate = cleanCandidates[index];
      try {
        const uploadedCover = await uploadCover(admin, userId, postId, candidate, index);
        const storageUrl = uploadedCover.publicUrl;
        if (!storageUrl) throw new Error("storage_url_empty");
        // URLs armazenadas mantêm a identidade exata do objeto (contrato de
        // dedup/provenância/auditoria do pipeline). A versão de crawler para
        // og:image (render proporcional sem corte) vai em metadata.cover_render.
        if (!coverRender && uploadedCover.coverRenderUrl) coverRender = uploadedCover.coverRenderUrl;
        results[index] = { source: candidate, url: storageUrl, uploaded: true, fallback: false };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        results[index] = allowExternalFallback && !(e instanceof RemoteResourceError) && canPersistExternalImageUrl(candidate)
          ? { source: candidate, url: candidate, uploaded: false, fallback: true, error }
          : { source: candidate, url: "", uploaded: false, fallback: false, error };
      }
    }
  }

  const workerCount = Math.min(IMAGE_UPLOAD_CONCURRENCY, cleanCandidates.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const uploads = results.filter(Boolean);
  const images = uploads.map((entry) => entry.url).filter(Boolean);

  return {
    images: Array.from(new Set(images)).slice(0, MAX_IMAGE_COUNT),
    uploads,
    coverRender,
  };
}

// Aplica galeria ao post atomically: posts.image_url + metadata + post_media.
async function applyImages(
  admin: SupabaseClient,
  postId: string,
  imageUrls: string[],
  currentMetadata: Record<string, unknown>,
  coverRender?: string,
): Promise<Record<string, unknown>> {
  const cleanUrls = Array.from(new Set(imageUrls.map(validRemoteImageUrl).filter(Boolean))).slice(0, MAX_IMAGE_COUNT);
  if (!cleanUrls.length) return currentMetadata || {};

  const coverUrl = cleanUrls[0];
  const metadata = deepMergeMetadata(currentMetadata, {
    image_url: coverUrl,
    cover_url: coverUrl,
    gallery_image_urls: cleanUrls,
    ...(coverRender ? { cover_render: coverRender } : {}),
  });
  const { data, error } = await admin.rpc("kc_cadu_replace_post_media", {
    p_post_id: postId,
    p_image_urls: cleanUrls,
    p_metadata: metadata,
  });
  if (error) throw error;
  if (!data || data.ok !== true) throw new Error("CADU_MEDIA_REPLACEMENT_FAILED");
  return metadata;
}

// Compatibilidade interna para checks antigos: capa unica = galeria com uma imagem.
async function applyCover(
  admin: SupabaseClient,
  postId: string,
  coverUrl: string,
  currentMetadata: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return applyImages(admin, postId, [coverUrl], currentMetadata);
}

async function isTrustedPublisher(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("kc_trusted_publishers").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

async function findExisting(
  admin: SupabaseClient,
  userId: string,
  sourceId: string,
  sourceUrl: string,
): Promise<{ id: string; status: string } | null> {
  if (sourceId) {
    const { data, error } = await admin
      .from("posts")
      .select("id,status")
      .eq("author_id", userId)
      .eq("metadata->>source_id", sourceId)
      .neq("status", "deleted")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as { id: string; status: string };
  }
  if (sourceUrl && isDurableSourceIdentityUrl(sourceUrl)) {
    const { data, error } = await admin
      .from("posts")
      .select("id,status")
      .eq("author_id", userId)
      .eq("metadata->>source_url", sourceUrl)
      .neq("status", "deleted")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as { id: string; status: string };
  }
  return null;
}

async function findActiveSourceIdDuplicate(
  admin: SupabaseClient,
  userId: string,
  sourceId: string,
): Promise<{ id: string; status: string } | null> {
  if (!sourceId) return null;
  const { data, error } = await admin
    .from("posts")
    .select("id,status")
    .eq("author_id", userId)
    .eq("metadata->>source_id", sourceId)
    .in("status", ["published", "closed", "pending"])
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? data as { id: string; status: string } : null;
}

function duplicateResponse(existing: { id: string; status: string }) {
  return json(200, {
    ok: false,
    code: "DUPLICATE",
    message: "Ja existe um post deste mesmo conteudo (mesma fonte).",
    post_id: existing.id,
    status: existing.status,
  });
}

function audit(admin: SupabaseClient, action: string, entityId: string, actorId: string, payload: Record<string, unknown>) {
  // fire-and-forget; o builder do supabase-js e PromiseLike (sem .catch)
  admin.from("audit_log").insert({
    action,
    entity_type: "posts",
    entity_id: entityId,
    actor_id: actorId,
    payload,
  }).then(() => {}, () => {});
}

// ── publish ───────────────────────────────────────────────────────────────────
export async function handlePublish(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const item = (body.item || {}) as CaduItem;
  const options = (body.options || {}) as { dryRun?: boolean; runId?: string };

  const validation = validateItem(item);
  if (!validation.ok) {
    return json(422, { ok: false, code: "VALIDATION_FAILED", message: validation.errors.join(" "), validation });
  }

  // Fix 2026-08-31: item sem NENHUMA imagem candidata tenta og:image nas
  // fontes oficiais vinculadas (página da notícia, Even3/Sympla/Plateia)
  // antes do mapeamento — os candidatos entram no fluxo normal de re-host.
  // Best-effort e bounded; dry-run não sonda (latência zero).
  const hasImageCandidates = Boolean(
    item.image || item.imageUrl || item.image_url || item.cover ||
      (Array.isArray(item.images) && item.images.length),
  );
  if (!hasImageCandidates && options.dryRun !== true) {
    try {
      const covers = await officialCoverCandidates(item);
      if (covers.length) {
        item.images = [...(Array.isArray(item.images) ? item.images : []), ...covers];
        if (!item.image) item.image = covers[0];
      }
    } catch {
      // best-effort: segue sem capa, como hoje
    }
  }

  let mapped: ReturnType<typeof mapItemToPost>;
  try {
    mapped = mapItemToPost(item, { runId: options.runId });
  } catch (error) {
    return json(422, {
      ok: false,
      code: "VALIDATION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Dedup: nao republica o mesmo source_id/source_url.
  const existing = await findExisting(admin, userId, mapped.dedup.sourceId, mapped.dedup.sourceUrl);
  if (existing) {
    return duplicateResponse(existing);
  }

  const quality = evaluateCaduPublishQuality(item, mapped);
  if (!quality.ok) {
    return json(200, {
      ok: false,
      code: "QUALITY_BLOCKED",
      message: "O item nao passou na barreira de qualidade editorial do Cadu.",
      quality,
      row: options.dryRun ? mapped.row : undefined,
      warnings: [...validation.warnings, ...mapped.warnings, ...quality.warnings],
    });
  }

  if (options.dryRun) {
    return json(200, {
      ok: true,
      code: "DRY_RUN",
      row: mapped.row,
      quality,
      warnings: [...validation.warnings, ...mapped.warnings, ...quality.warnings],
    });
  }

  // Mapping is pure and cannot validate DNS/redirects. Do not persist its
  // candidate cover before prepareFinalImages crosses the network boundary;
  // otherwise a blocked download would leave that unchecked external URL live.
  const insertRow = {
    ...mapped.row,
    author_id: userId,
    status: "published",
    image_url: null,
    metadata: {
      ...mapped.row.metadata,
      image_url: "",
      cover_url: "",
      gallery_image_urls: [],
    },
  };
  const { data: post, error } = await admin.from("posts").insert(insertRow).select("*").single();
  if (error || !post) {
    // The partial unique index closes the SELECT/INSERT race. A concurrent
    // winner is returned as the same idempotent DUPLICATE contract used above.
    if (error?.code === "23505" && mapped.dedup.sourceId) {
      try {
        const racedDuplicate = await findActiveSourceIdDuplicate(
          admin,
          userId,
          mapped.dedup.sourceId,
        );
        if (racedDuplicate) return duplicateResponse(racedDuplicate);
      } catch (_) {
        // Preserve the original insert error if the deterministic refetch fails.
      }
    }
    return json(500, { ok: false, code: "INSERT_FAILED", message: error?.message || "Falha ao inserir o post." });
  }

  // Imagens: sobe para o Storage; em caso de falha por imagem, mantem URL externa
  // apenas quando ela for estavel. A primeira imagem final e sempre a capa.
  const media: {
    uploaded: boolean;
    uploaded_count: number;
    cover_url: string;
    images: string[];
    uploads: PreparedImage[];
    error?: string;
  } = {
    uploaded: false,
    uploaded_count: 0,
    cover_url: String(post.image_url || ""),
    images: [],
    uploads: [],
  };
  const candidates = mapped.images || [];
  if (candidates.length) {
    try {
      const prepared = await prepareFinalImages(
        admin,
        userId,
        post.id,
        candidates,
        item.allowExternalImageFallback !== false,
      );
      media.uploads = prepared.uploads;
      media.images = prepared.images;
      media.uploaded_count = prepared.uploads.filter((img) => img.uploaded).length;
      media.uploaded = media.uploaded_count > 0;
      if (prepared.images.length) {
        post.metadata = await applyImages(admin, post.id, prepared.images, post.metadata || {}, prepared.coverRender);
        post.image_url = prepared.images[0];
        media.cover_url = prepared.images[0];
      } else {
        media.error = prepared.uploads.find((img) => img.error)?.error || "image_prepare_failed";
      }
    } catch (e) {
      media.error = e instanceof Error ? e.message : String(e);
    }
  }

  audit(admin, "cadu_post_published", post.id, userId, {
    module: post.module,
    status: post.status,
    source_url: mapped.dedup.sourceUrl,
    source_id: mapped.dedup.sourceId,
    image_uploaded: media.uploaded,
    image_count: media.images.length,
  });

  const pending = post.status === "pending";
  return json(200, {
    ok: true,
    code: pending ? "PENDING" : "PUBLISHED",
    post_id: post.id,
    status: post.status,
    pending,
    pending_reason: post.moderation_reason || "",
    url: postUrl(String(post.module)),
    image_url: post.image_url || "",
    media,
    quality,
    warnings: [...validation.warnings, ...mapped.warnings, ...quality.warnings],
  });
}

interface InstitutionalReviewRow {
  id: string;
  requested_by: string;
  source_id: string;
  source_url: string;
  content_url: string;
  instagram_handle: string | null;
  content_kind: string;
  intent: string;
  idempotency_key: string;
  source_revision: string;
  registry_sha256: string;
  name: string;
  note: string | null;
  tier: number | null;
  category: string;
  origin: string;
  state: string;
  created_at: string;
  replayed: boolean;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function institutionalReviewRowMatches(
  row: unknown,
  review: InstitutionalReviewInput,
  requestedBy: string,
): row is InstitutionalReviewRow {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const value = row as Record<string, unknown>;
  return validUuid(value.id) &&
    value.requested_by === requestedBy &&
    value.source_id === review.sourceId &&
    value.source_url === review.sourceUrl &&
    value.content_url === review.contentUrl &&
    value.instagram_handle === review.instagramHandle &&
    value.content_kind === review.contentKind &&
    value.intent === review.intent &&
    value.idempotency_key === review.idempotencyKey &&
    value.source_revision === review.sourceRevision &&
    value.registry_sha256 === review.registrySha256 &&
    value.name === review.name &&
    value.note === review.note &&
    value.tier === review.tier &&
    value.category === review.category &&
    value.origin === review.origin &&
    value.state === "pending" &&
    typeof value.created_at === "string" &&
    Number.isFinite(Date.parse(value.created_at)) &&
    typeof value.replayed === "boolean";
}

function pendingInstitutionalReviewResponse(
  review: InstitutionalReviewInput,
  persisted: InstitutionalReviewRow,
) {
  return json(200, {
    ok: true,
    code: "PENDING",
    policy_code: INSTITUTIONAL_REVIEW_POLICY_CODE,
    review_id: persisted.id,
    // Compatibility alias for the cadu-api/front contract. The UUID belongs
    // to the dedicated review queue and is never a public.posts row.
    post_id: persisted.id,
    status: "pending",
    pending: true,
    published: false,
    published_via: "edge-function",
    pending_reason: "institutional_source_review",
    intent: review.intent,
    content_kind: review.contentKind,
    source_id: review.sourceId,
    source_url: review.sourceUrl,
    content_url: review.contentUrl,
    instagram_handle: review.instagramHandle,
    source_revision: review.sourceRevision,
    registry_sha256: review.registrySha256,
    idempotency_key: review.idempotencyKey,
    replayed: persisted.replayed,
  });
}

// ── review ───────────────────────────────────────────────────────────────────
// Review is stored through one transactional RPC in a dedicated typed queue.
// It never touches posts, post_media, publication deduplication or post flood.
async function handleReview(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const parsed = parseInstitutionalReview(body);
  if (!parsed.ok) {
    return json(422, {
      ok: false,
      code: "REVIEW_VALIDATION_FAILED",
      policy_code: INSTITUTIONAL_REVIEW_POLICY_CODE,
      message: parsed.errors.join(" "),
      errors: parsed.errors,
    });
  }
  const review = parsed.value;
  const { data, error } = await admin.rpc(
    "kc_create_institutional_source_review",
    institutionalReviewRpcArguments(review, userId),
  );
  if (error) {
    const reason = String(error.message || "");
    const conflict = /idempotency|already_pending|terminal/.test(reason);
    const limited = reason.includes("rate_limit");
    const forbidden = error.code === "42501" || reason.includes("not_trusted");
    return json(
      forbidden ? 403 : limited ? 429 : conflict ? 409 : 500,
      {
        ok: false,
        code: forbidden
          ? "REVIEW_NOT_AUTHORIZED"
          : limited
          ? "REVIEW_RATE_LIMITED"
          : conflict
          ? "REVIEW_CONFLICT"
          : "REVIEW_PERSISTENCE_FAILED",
        policy_code: INSTITUTIONAL_REVIEW_POLICY_CODE,
        message: forbidden
          ? "Conta nao autorizada para a fila de revisao."
          : limited
          ? "Limite horario da fila de revisao atingido."
          : conflict
          ? "A fonte ou chave ja possui uma revisao incompatível."
          : "A fila editorial nao confirmou a revisao.",
      },
    );
  }

  const rows = Array.isArray(data) ? data : [];
  if (
    rows.length !== 1 ||
    !institutionalReviewRowMatches(rows[0], review, userId)
  ) {
    return json(502, {
      ok: false,
      code: "REVIEW_RECEIPT_INVALID",
      policy_code: INSTITUTIONAL_REVIEW_POLICY_CODE,
      message: "A fila editorial retornou uma confirmacao inconsistente.",
    });
  }
  return pendingInstitutionalReviewResponse(review, rows[0]);
}

// ── edit ────────────────────────────────────────────────────────────────────
const EDITABLE_FIELDS = ["title", "description", "price", "location", "category", "visibility", "status"] as const;

const RECLASSIFICATION_MODULES = new Set(["eventos", "oportunidades"]);
const RECLASSIFICATION_MEDIA_METADATA_FIELDS = [
  "image_url",
  "cover_url",
  "gallery_image_urls",
  "cover_render",
] as const;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sameInstant(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function reclassificationError(message: string, code = "RECLASSIFICATION_INVALID") {
  return json(422, { ok: false, code, message });
}

async function handleCanonicalReclassification(
  admin: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  if (!hasExactKeys(body, ["action", "postId", "reclassification"])) {
    return reclassificationError(
      "A reclassificacao canonica nao pode ser combinada com fields, metadata, Tags ou imagens.",
    );
  }
  const reclassification = recordValue(body.reclassification);
  if (!reclassification || !hasExactKeys(reclassification, ["expected", "item"])) {
    return reclassificationError("Informe reclassification.expected e reclassification.item, sem campos extras.");
  }
  const expected = recordValue(reclassification.expected);
  const itemRecord = recordValue(reclassification.item);
  if (!expected || !itemRecord || !hasExactKeys(expected, [
    "module", "category", "status", "updatedAt", "expiresAt", "sourceId", "sourceUrl",
  ])) {
    return reclassificationError("O snapshot expected da reclassificacao esta incompleto ou possui campos extras.");
  }

  const currentMetadata = recordValue(current.metadata) || {};
  const expectedSnapshotMatches =
    expected.module === current.module &&
    expected.category === current.category &&
    expected.status === current.status &&
    expected.updatedAt === current.updated_at &&
    expected.expiresAt === (current.expires_at ?? null) &&
    expected.sourceId === currentMetadata.source_id &&
    expected.sourceUrl === currentMetadata.source_url;
  if (!expectedSnapshotMatches) {
    return json(409, {
      ok: false,
      code: "EDIT_CONFLICT",
      message: "O post mudou desde o snapshot editorial; reabra e revise antes de reclassificar.",
    });
  }

  const targetModule = String(itemRecord.module || "");
  const currentModule = String(current.module || "");
  if (!RECLASSIFICATION_MODULES.has(currentModule) || !RECLASSIFICATION_MODULES.has(targetModule) ||
    currentModule === targetModule) {
    return reclassificationError("A reclassificacao permite apenas a troca explicita entre eventos e oportunidades.");
  }

  const item = itemRecord as CaduItem;
  const validation = validateItem(item);
  if (!validation.ok) {
    return reclassificationError(validation.errors.join(" "), "VALIDATION_FAILED");
  }

  let mapped: ReturnType<typeof mapItemToPost>;
  try {
    mapped = mapItemToPost(item, { runId: String(currentMetadata.cadu_run_id || "") });
  } catch (error) {
    return reclassificationError(
      error instanceof Error ? error.message : String(error),
      "VALIDATION_FAILED",
    );
  }
  if (mapped.dedup.sourceId !== expected.sourceId || mapped.dedup.sourceUrl !== expected.sourceUrl) {
    return reclassificationError("A reclassificacao nao pode alterar source_id nem source_url.");
  }

  const quality = evaluateCaduPublishQuality(item, mapped);
  if (!quality.ok) {
    return json(422, {
      ok: false,
      code: "QUALITY_BLOCKED",
      message: "O item reclassificado nao passou na barreira de qualidade editorial do Cadu.",
      quality,
      warnings: [...validation.warnings, ...mapped.warnings, ...quality.warnings],
    });
  }

  const expiresAt = mapped.row.expires_at;
  if (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
    return reclassificationError("A reclassificacao exige expires_at futuro derivado das datas semanticas do item.");
  }

  const metadata = { ...mapped.row.metadata };
  for (const key of RECLASSIFICATION_MEDIA_METADATA_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(currentMetadata, key)) metadata[key] = currentMetadata[key];
  }
  const update = {
    title: mapped.row.title,
    description: mapped.row.description,
    price: mapped.row.price,
    location: mapped.row.location,
    module: mapped.row.module,
    category: mapped.row.category,
    visibility: mapped.row.visibility,
    metadata,
    expires_at: expiresAt,
  };

  let mutation = admin
    .from("posts")
    .update(update)
    .eq("id", String(current.id))
    .eq("author_id", userId)
    .eq("module", String(expected.module))
    .eq("category", String(expected.category))
    .eq("status", String(expected.status))
    .eq("updated_at", String(expected.updatedAt))
    .eq("metadata->>source_id", String(expected.sourceId))
    .eq("metadata->>source_url", String(expected.sourceUrl));
  mutation = expected.expiresAt === null
    ? mutation.is("expires_at", null)
    : mutation.eq("expires_at", String(expected.expiresAt));
  const { data: fresh, error: updateError } = await mutation
    .select("id,status,module,category,image_url,expires_at,updated_at,metadata")
    .maybeSingle();
  if (updateError) {
    return json(500, { ok: false, code: "UPDATE_FAILED", message: updateError.message });
  }
  if (!fresh) {
    return json(409, {
      ok: false,
      code: "EDIT_CONFLICT",
      message: "O post mudou durante a reclassificacao; nenhuma alteracao foi aplicada.",
    });
  }

  const freshMetadata = recordValue(fresh.metadata) || {};
  if (fresh.module !== mapped.row.module || fresh.category !== mapped.row.category ||
    !sameInstant(fresh.expires_at, expiresAt) || freshMetadata.source_id !== expected.sourceId ||
    freshMetadata.source_url !== expected.sourceUrl) {
    return json(502, {
      ok: false,
      code: "RECLASSIFICATION_RECEIPT_INVALID",
      message: "O banco nao confirmou a reclassificacao canonica completa.",
    });
  }

  audit(admin, "cadu_post_reclassified", String(current.id), userId, {
    contract: RECLASSIFICATION_CONTRACT,
    from_module: current.module,
    from_category: current.category,
    to_module: fresh.module,
    to_category: fresh.category,
    previous_expires_at: current.expires_at ?? null,
    expires_at: fresh.expires_at,
    source_id: expected.sourceId,
  });
  return json(200, {
    ok: true,
    code: "RECLASSIFIED",
    contract: RECLASSIFICATION_CONTRACT,
    post_id: fresh.id,
    status: fresh.status,
    module: fresh.module,
    category: fresh.category,
    expires_at: fresh.expires_at,
    updated_at: fresh.updated_at,
    image_url: fresh.image_url || current.image_url || "",
    source_id: freshMetadata.source_id,
    source_url: freshMetadata.source_url,
    url: postUrl(String(fresh.module)),
    quality,
    warnings: [...validation.warnings, ...mapped.warnings, ...quality.warnings],
  });
}

export async function handleEdit(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const postId = String(body.postId || "");
  if (!postId) return json(400, { ok: false, code: "MISSING_POST_ID", message: "Informe postId." });

  const { data: current, error: getErr } = await admin
    .from("posts")
    .select("id,author_id,module,category,status,metadata,image_url,expires_at,updated_at")
    .eq("id", postId)
    .maybeSingle();
  if (getErr || !current) return json(404, { ok: false, code: "POST_NOT_FOUND", message: "Post nao encontrado." });
  if (current.author_id !== userId) {
    return json(403, { ok: false, code: "NOT_OWNER", message: "O Cadu so pode editar os proprios posts." });
  }

  if (body.reclassification !== undefined) {
    return await handleCanonicalReclassification(
      admin,
      userId,
      body,
      current as Record<string, unknown>,
    );
  }

  const update: Record<string, unknown> = {};
  const fields = recordValue(body.fields) || {};
  if (body.fields !== undefined && !recordValue(body.fields)) {
    return json(422, { ok: false, code: "VALIDATION_FAILED", message: "fields deve ser um objeto." });
  }
  const unknownFields = Object.keys(fields).filter((field) =>
    !(EDITABLE_FIELDS as readonly string[]).includes(field)
  );
  if (unknownFields.length) {
    return json(422, {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `fields nao editaveis: ${unknownFields.sort().join(", ")}.`,
    });
  }
  for (const f of EDITABLE_FIELDS) {
    if (f === "category") continue;
    if (fields[f] !== undefined) update[f] = fields[f];
  }

  const requestedCategory = fields.category !== undefined ? fields.category : current.category;
  const categoryKey = normalizeCategoryForModule(current.module, requestedCategory);
  if (!categoryKey) {
    return json(422, {
      ok: false,
      code: "VALIDATION_FAILED",
      message:
        `category invalida ou ausente para module "${String(current.module || "")}". ` +
        `Use uma de: ${categoriesForModule(current.module).join(", ")}.`,
    });
  }
  if (fields.category !== undefined || current.category !== categoryKey) {
    update.category = categoryKey;
  }

  const rawMetadataPatch = !!body.metadata && typeof body.metadata === "object" &&
    !Array.isArray(body.metadata)
    ? body.metadata as Record<string, unknown>
    : null;
  const topLevelTagsPatch = Object.fromEntries(
    ["userTags", "userTagKeys", "user_tags", "user_tag_keys", "tags", "tagKeys"]
      .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
      .map((key) => [key, body[key]]),
  );
  const hasTopLevelTagsPatch = Object.keys(topLevelTagsPatch).length > 0;
  const hasMetadataPatch = !!rawMetadataPatch || hasTopLevelTagsPatch;
  const metadataPatch = hasMetadataPatch
    ? { ...(rawMetadataPatch || {}), ...topLevelTagsPatch }
    : null;
  if (hasMetadataPatch || update.category !== undefined) {
    try {
      const taxonomy = buildTaxonomyEditPatch(
        current.module,
        current.category,
        categoryKey,
        current.metadata || {},
        metadataPatch,
      );
      update.metadata = taxonomy.metadata;
    } catch (error) {
      return json(422, {
        ok: false,
        code: "VALIDATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // Publicar pendente: limpa o motivo de moderacao.
  if (update.status === "published") update.moderation_reason = null;

  if (Object.keys(update).length) {
    const { error: updErr } = await admin.from("posts").update(update).eq("id", postId);
    if (updErr) return json(500, { ok: false, code: "UPDATE_FAILED", message: updErr.message });
  }

  // Troca de imagens (opcional). A primeira imagem final vira capa; as demais
  // entram em post_media como galeria ordenada.
  const newImages = Array.from(new Set([
    validRemoteImageUrl(body.image),
    ...(Array.isArray(body.images) ? body.images.map(validRemoteImageUrl) : []),
  ].filter(Boolean))).slice(0, MAX_IMAGE_COUNT);
  let coverUrl = String(current.image_url || "");
  let uploaded = false;
  let imageCount = 0;
  let imageError = "";
  let imageUploads: PreparedImage[] = [];
  if (newImages.length) {
    const baseMeta = (update.metadata as Record<string, unknown>) || current.metadata || {};
    try {
      const prepared = await prepareFinalImages(
        admin,
        userId,
        postId,
        newImages,
        body.allowExternalImageFallback !== false,
      );
      imageUploads = prepared.uploads;
      uploaded = prepared.uploads.some((img) => img.uploaded);
      imageCount = prepared.images.length;
      if (prepared.images.length) {
        await applyImages(admin, postId, prepared.images, baseMeta, prepared.coverRender);
        coverUrl = prepared.images[0];
      } else {
        imageError = prepared.uploads.find((img) => img.error)?.error || "image_prepare_failed";
      }
    } catch (e) {
      imageError = e instanceof Error ? e.message : String(e);
    }
  }

  const { data: fresh } = await admin.from("posts").select("id,status,module,image_url").eq("id", postId).maybeSingle();
  audit(admin, "cadu_post_edited", postId, userId, { fields: Object.keys(update), image_changed: !!newImages.length, image_count: imageCount });
  return json(200, {
    ok: true,
    code: "UPDATED",
    post_id: postId,
    status: fresh?.status || current.status,
    image_url: coverUrl,
    image_uploaded: uploaded,
    image_count: imageCount,
    media: { uploaded, cover_url: coverUrl, images_count: imageCount, uploads: imageUploads },
    image_error: imageError,
    url: postUrl(String(fresh?.module || current.module)),
  });
}

// ── list ──────────────────────────────────────────────────────────────────────
async function handleList(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const filters = (body.filters || {}) as Record<string, unknown>;
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

  let query = admin
    .from("posts")
    .select("id,title,module,status,created_at,image_url,metadata")
    .eq("author_id", userId);

  if (filters.module) query = query.eq("module", String(filters.module));
  if (filters.status) query = query.eq("status", String(filters.status));
  if (filters.since) query = query.gte("created_at", String(filters.since));
  if (filters.sourceId) query = query.eq("metadata->>source_id", String(filters.sourceId));
  if (filters.sourceUrl) query = query.eq("metadata->>source_url", String(filters.sourceUrl));

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return json(500, { ok: false, code: "LIST_FAILED", message: error.message });

  const posts = (data || []).map((p: Record<string, unknown>) => {
    const meta = (p.metadata || {}) as Record<string, unknown>;
    return {
      id: p.id,
      title: p.title,
      module: p.module,
      status: p.status,
      created_at: p.created_at,
      image_url: p.image_url,
      source_url: meta.source_url || "",
      source_id: meta.source_id || "",
    };
  });
  return json(200, { ok: true, code: "OK", count: posts.length, posts });
}

// ── check (dedup) ─────────────────────────────────────────────────────────────
async function handleCheck(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const sourceId = String(body.sourceId || "");
  const sourceUrl = String(body.sourceUrl || "");
  if (!sourceId && !sourceUrl) {
    return json(400, { ok: false, code: "MISSING_SOURCE", message: "Informe sourceId ou sourceUrl." });
  }
  const existing = await findExisting(admin, userId, sourceId, sourceUrl);
  return json(200, {
    ok: true,
    code: "OK",
    exists: !!existing,
    post_id: existing?.id || "",
    status: existing?.status || "",
  });
}

// ── HTTP entrypoint ─────────────────────────────────────────────────────────────
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST." });

  // 1) Autenticacao
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(401, { ok: false, code: "AUTH_REQUIRED", message: "Token de autenticacao ausente." });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json(401, { ok: false, code: "AUTH_INVALID", message: "Sessao invalida. Refaca o login do Cadu." });
  }
  if (!(await isCurrentSessionActive(userClient))) {
    return json(401, {
      ok: false,
      code: "SESSION_NOT_ACTIVE",
      message: "Sessao encerrada. Refaca o login do Cadu.",
    });
  }

  // 2) Cliente privilegiado + allowlist
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  if (!(await isTrustedPublisher(admin, user.id))) {
    return json(403, { ok: false, code: "NOT_TRUSTED", message: "Conta nao autorizada a publicar pelo endpoint do Cadu." });
  }

  // 3) Body + roteamento de acao
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "BAD_BODY", message: "Body invalido. Envie JSON." });
  }
  const action = String(body.action || "publish");

  try {
    switch (action) {
      case "capabilities":
        if (Object.keys(body).length !== 1 || body.action !== "capabilities") {
          return json(400, {
            ok: false,
            code: "BAD_CAPABILITY_PROBE",
            message: "O probe de capacidades aceita apenas a acao capabilities.",
          });
        }
        return json(200, {
          ok: true,
          code: "OK",
          capabilityVersion: CAPABILITY_VERSION,
          canonicalReclassification: RECLASSIFICATION_CONTRACT,
          institutionalReviewEnabled: INSTITUTIONAL_REVIEW_ENABLED,
          reviewPolicyCode: INSTITUTIONAL_REVIEW_POLICY_CODE,
          createReviewRpc: "kc_create_institutional_source_review",
        });
      case "publish":
        return await handlePublish(admin, user.id, body);
      case "review":
        if (!INSTITUTIONAL_REVIEW_ENABLED) {
          return json(503, {
            ok: false,
            code: "REVIEW_DISABLED",
            policy_code: INSTITUTIONAL_REVIEW_POLICY_CODE,
            message: "A fila institucional ainda nao foi habilitada neste ambiente.",
          });
        }
        return await handleReview(admin, user.id, body);
      case "edit":
        return await handleEdit(admin, user.id, body);
      case "list":
        return await handleList(admin, user.id, body);
      case "check":
        return await handleCheck(admin, user.id, body);
      default:
        return json(400, { ok: false, code: "UNKNOWN_ACTION", message: `Acao desconhecida: ${action}.` });
    }
  } catch (e) {
    console.error("[cadu-publish] erro:", e);
    const stack = e instanceof Error ? e.stack || "" : "";
    return json(500, { ok: false, code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : String(e), stack: stack.slice(0, 800) });
  }
}

if (import.meta.main) Deno.serve(handleRequest);
