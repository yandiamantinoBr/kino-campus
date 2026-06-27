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
//   { action: "publish", item, options? }   -> cria post + capa
//   { action: "edit", postId, fields?, metadata?, image?, images? } -> edita
//   { action: "list", filters? }            -> lista posts do Cadu (filtra)
//   { action: "check", sourceUrl?, sourceId? } -> dedup (ja postado?)
//
// Headers: Authorization: Bearer <access_token da conta do Cadu>
// NOTA: verify_jwt fica desabilitado no gateway; a funcao valida o JWT internamente.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CaduItem, validateItem } from "./schema.ts";
import { deepMergeMetadata, mapItemToPost, MAX_IMAGE_COUNT } from "./mapper.ts";
import {
  canPersistExternalImageUrl,
  hostOf,
  isoDateFromAny,
  isSvgUrl,
  isTemporaryOrSocialImageUrl,
  lightHash,
  normalizeText,
  normalizeWhitespace,
  parseBrazilianDate,
  parseDateRange,
  stripHtml,
  validRemoteImageUrl,
} from "./util.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (Deno.env.get("KC_APP_BASE_URL") || "https://www.kinocampus.com.br").replace(/\/$/, "");

const STORAGE_BUCKET = "kino-media";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const USER_AGENT = "KinoCampus-Cadu/1.0 (+https://www.kinocampus.com.br)";

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
  const forced = Deno.env.get("CADU_NOW_ISO") || "";
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

  const block = (warning: string) => {
    if (!blockingWarnings.includes(warning)) blockingWarnings.push(warning);
  };
  const warn = (warning: string) => {
    if (!warnings.includes(warning)) warnings.push(warning);
  };

  if (explicitExpired) block("source_marks_expired");
  if (row.module === "eventos") {
    const end = validIsoDate(metadata.data_fim_evento) || validIsoDate(item.dateEnd);
    const start = validIsoDate(metadata.data_evento) || validIsoDate(item.dateStart);
    if (end && end < today) block("event_past");
    else if (start && start < today && !end && !futureDates.length) block("event_past");
    else if (!start && latestDate && latestDate < today && !futureDates.length) block("event_past");
  } else if (hasDeadlineContext && latestDate && latestDate < today && !futureDates.length) {
    block("deadline_past");
  }

  if (
    (hasInstitutionalOnlySignal(item.title) && !hasConcretePublishActionSignal(fullText)) ||
    (hasInstitutionalOnlySignal(fullText) && !hasStrongActionSignal(fullText))
  ) block("institutional_or_biographical_release");
  if (hasCmsCreditLine(description)) block("cms_credits_in_description");
  if (!hasActionableMarkdownDescription(description)) block("weak_description");

  const numericScore = Number(item.score);
  if (Number.isFinite(numericScore) && numericScore < 0.7) block("score_below_auto_publish_threshold");

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
    recommendation: blockingWarnings.length
      ? "Corrija o item, consulte fonte oficial complementar e rode dry-run antes de reenviar para publicacao."
      : "Item apto para tentativa de publicacao pelo endpoint do Cadu.",
  };
}

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  const resp = await fetch(url, { headers: { accept: "image/*,*/*;q=0.5", "user-agent": USER_AGENT } });
  if (!resp.ok) throw new Error(`image_download_http_${resp.status}`);
  const ct = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  let ext = IMAGE_EXT[ct] || "";
  if (!ext) {
    const m = url.toLowerCase().match(/\.(jpe?g|png|gif|webp)(?:$|[?#])/);
    if (m) ext = m[1] === "jpeg" ? "jpg" : m[1];
  }
  if (!ext) throw new Error("unsupported_image_type");
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("empty_image");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("image_too_large");
  const contentType = ct.startsWith("image/") ? ct : `image/${ext === "jpg" ? "jpeg" : ext}`;
  return { bytes, contentType, ext };
}

// Sobe a capa para kino-media e devolve a URL publica do Storage (ou "" se falhar).
async function uploadCover(
  admin: SupabaseClient,
  userId: string,
  postId: string,
  sourceUrl: string,
  index = 0,
): Promise<string> {
  const clean = validRemoteImageUrl(sourceUrl);
  if (!clean) return "";
  const { bytes, contentType, ext } = await downloadImage(clean);
  const path = `post-media/${userId}/${postId}/cadu-${index + 1}-${lightHash(clean)}.${ext}`;
  const { error } = await admin.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
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
): Promise<{ images: string[]; uploads: PreparedImage[] }> {
  const cleanCandidates = Array.from(new Set(candidates.map(validRemoteImageUrl).filter(Boolean))).slice(0, MAX_IMAGE_COUNT);
  const images: string[] = [];
  const uploads: PreparedImage[] = [];

  for (let index = 0; index < cleanCandidates.length; index += 1) {
    const candidate = cleanCandidates[index];
    try {
      const storageUrl = await uploadCover(admin, userId, postId, candidate, index);
      if (storageUrl) {
        images.push(storageUrl);
        uploads.push({ source: candidate, url: storageUrl, uploaded: true, fallback: false });
        continue;
      }
      throw new Error("storage_url_empty");
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (allowExternalFallback && canPersistExternalImageUrl(candidate)) {
        images.push(candidate);
        uploads.push({ source: candidate, url: candidate, uploaded: false, fallback: true, error });
      } else {
        uploads.push({ source: candidate, url: "", uploaded: false, fallback: false, error });
      }
    }
  }

  return { images: Array.from(new Set(images)).slice(0, MAX_IMAGE_COUNT), uploads };
}

// Aplica galeria ao post: posts.image_url + metadata + post_media (best-effort).
async function applyImages(
  admin: SupabaseClient,
  postId: string,
  imageUrls: string[],
  currentMetadata: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cleanUrls = Array.from(new Set(imageUrls.map(validRemoteImageUrl).filter(Boolean))).slice(0, MAX_IMAGE_COUNT);
  if (!cleanUrls.length) return currentMetadata || {};

  const coverUrl = cleanUrls[0];
  const metadata = deepMergeMetadata(currentMetadata, {
    image_url: coverUrl,
    cover_url: coverUrl,
    gallery_image_urls: cleanUrls,
  });
  const { data: previousPost } = await admin
    .from("posts")
    .select("image_url,metadata")
    .eq("id", postId)
    .maybeSingle();
  const { data: previousMedia } = await admin
    .from("post_media")
    .select("post_id,url,is_cover,sort_order")
    .eq("post_id", postId);
  try {
    await admin.from("posts").update({ image_url: coverUrl, metadata }).eq("id", postId);
    await admin.from("post_media").delete().eq("post_id", postId);
    await admin.from("post_media").insert(
      cleanUrls.map((url, index) => ({ post_id: postId, url, is_cover: index === 0, sort_order: index })),
    );
  } catch (_) {
    if (previousPost) {
      await admin
        .from("posts")
        .update({ image_url: previousPost.image_url || null, metadata: previousPost.metadata || {} })
        .eq("id", postId)
        .then(() => {}, () => {});
    }
    if (Array.isArray(previousMedia) && previousMedia.length) {
      await admin.from("post_media").insert(previousMedia).then(() => {}, () => {});
    }
    return (previousPost?.metadata as Record<string, unknown>) || currentMetadata || {};
  }
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
    const { data } = await admin
      .from("posts")
      .select("id,status")
      .eq("author_id", userId)
      .eq("metadata->>source_id", sourceId)
      .neq("status", "deleted")
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string; status: string };
  }
  if (sourceUrl) {
    const { data } = await admin
      .from("posts")
      .select("id,status")
      .eq("author_id", userId)
      .eq("metadata->>source_url", sourceUrl)
      .neq("status", "deleted")
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string; status: string };
  }
  return null;
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
async function handlePublish(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const item = (body.item || {}) as CaduItem;
  const options = (body.options || {}) as { dryRun?: boolean; runId?: string };

  const validation = validateItem(item);
  if (!validation.ok) {
    return json(422, { ok: false, code: "VALIDATION_FAILED", message: validation.errors.join(" "), validation });
  }

  const mapped = mapItemToPost(item, { runId: options.runId });

  // Dedup: nao republica o mesmo source_id/source_url.
  const existing = await findExisting(admin, userId, mapped.dedup.sourceId, mapped.dedup.sourceUrl);
  if (existing) {
    return json(200, {
      ok: false,
      code: "DUPLICATE",
      message: "Ja existe um post deste mesmo conteudo (mesma fonte).",
      post_id: existing.id,
      status: existing.status,
    });
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

  const insertRow = { ...mapped.row, author_id: userId, status: "published" };
  const { data: post, error } = await admin.from("posts").insert(insertRow).select("*").single();
  if (error || !post) {
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
        post.metadata = await applyImages(admin, post.id, prepared.images, post.metadata || {});
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

// ── edit ────────────────────────────────────────────────────────────────────
const EDITABLE_FIELDS = ["title", "description", "price", "location", "category", "visibility", "status"] as const;

async function handleEdit(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const postId = String(body.postId || "");
  if (!postId) return json(400, { ok: false, code: "MISSING_POST_ID", message: "Informe postId." });

  const { data: current, error: getErr } = await admin
    .from("posts")
    .select("id,author_id,module,status,metadata,image_url")
    .eq("id", postId)
    .maybeSingle();
  if (getErr || !current) return json(404, { ok: false, code: "POST_NOT_FOUND", message: "Post nao encontrado." });
  if (current.author_id !== userId) {
    return json(403, { ok: false, code: "NOT_OWNER", message: "O Cadu so pode editar os proprios posts." });
  }

  const update: Record<string, unknown> = {};
  const fields = (body.fields || {}) as Record<string, unknown>;
  for (const f of EDITABLE_FIELDS) {
    if (fields[f] !== undefined) update[f] = fields[f];
  }

  if (body.metadata && typeof body.metadata === "object") {
    update.metadata = deepMergeMetadata(current.metadata || {}, body.metadata as Record<string, unknown>);
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
        await applyImages(admin, postId, prepared.images, baseMeta);
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
Deno.serve(async (req) => {
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
      case "publish":
        return await handlePublish(admin, user.id, body);
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
    return json(500, { ok: false, code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : String(e) });
  }
});
