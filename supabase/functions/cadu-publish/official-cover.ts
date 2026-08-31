// KinoCampus — Edge Function cadu-publish: capa oficial via og:image.
//
// Fix 2026-08-31: muitas publicações legítimas chegam SEM nenhuma imagem
// candidata (bancas, editais em PDF, páginas Weby sem destaque). As fontes
// oficiais vinculadas ao item — a própria notícia e páginas de evento em
// Even3/Sympla/Plateia — quase sempre expõem og:image/twitter:image. Este
// módulo sonda essas páginas (bounded) e devolve candidatos a capa que
// entram no fluxo normal de re-host do endpoint. Best-effort: qualquer
// falha devolve lista vazia e o post é criado sem capa, como hoje.

import { CaduItem } from "./schema.ts";
import { canPersistExternalImageUrl, hostOf, isSvgUrl, isTemporaryOrSocialImageUrl, validRemoteImageUrl } from "./util.ts";

function optionalEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return undefined;
    throw error;
  }
}

export const OFFICIAL_COVER_PAGE_TIMEOUT_MS = Math.max(
  1_000,
  Math.min(Number(optionalEnv("CADU_COVER_PAGE_TIMEOUT_MS")) || 6_000, 15_000),
);
export const OFFICIAL_COVER_PAGE_MAX_BYTES = 512 * 1024;
export const OFFICIAL_COVER_MAX_PAGES = 2;

const OG_IMAGE_RE =
  /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?|itemprop=image)["'][^>]*>/gi;
const CONTENT_RE = /content=["']([^"']+)["']/i;

function isInstagramHost(value: unknown): boolean {
  const host = hostOf(value).toLowerCase();
  return /(^|\.)instagram\.com$/.test(host) || /(^|\.)cdninstagram\.com$/.test(host);
}

async function readBoundedText(resp: Response, maxBytes: number): Promise<string> {
  const reader = resp.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  try {
    await reader.cancel();
  } catch {
    // body already consumed/closed
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/** Extrai og:image/twitter:image de um HTML (primeira URL válida). */
export function extractCoverFromHtml(html: string): string {
  for (const metaTag of html.match(OG_IMAGE_RE) || []) {
    const content = CONTENT_RE.exec(metaTag)?.[1];
    if (!content) continue;
    let decoded = content
      .replace(/&amp;/g, "&")
      .replace(/&#0?38;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .trim();
    if (!decoded) continue;
    if (decoded.startsWith("//")) decoded = "https:" + decoded;
    if (!/^https?:\/\//i.test(decoded)) continue;
    if (isSvgUrl(decoded) || isTemporaryOrSocialImageUrl(decoded)) continue;
    const valid = validRemoteImageUrl(decoded);
    if (valid && canPersistExternalImageUrl(valid)) return valid;
  }
  return "";
}

/** Páginas oficiais do item candidatas à sondagem (sem Instagram/sem repetição). */
export function officialPageCandidates(item: CaduItem, maxPages: number = OFFICIAL_COVER_MAX_PAGES): string[] {
  const urls = [
    item.sourceUrl,
    item.url,
    ...(Array.isArray(item.enrichmentSources) ? item.enrichmentSources : []).map((source) =>
      typeof source === "string" ? source : source?.url
    ),
  ];
  const seen = new Set<string>();
  const pages: string[] = [];
  for (const raw of urls) {
    if (pages.length >= maxPages) break;
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (!/^https:\/\//i.test(url)) continue;
    if (isInstagramHost(url)) continue;
    const host = hostOf(url).toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local")) continue;
    const key = url.toLowerCase().replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    pages.push(url);
  }
  return pages;
}

async function fetchPageCover(pageUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFFICIAL_COVER_PAGE_TIMEOUT_MS);
  try {
    const resp = await fetch(pageUrl, {
      headers: { "user-agent": "KinoCampus-Cadu/1.0 (+https://www.kinocampus.com.br)", accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!resp.ok) return "";
    const contentType = String(resp.headers.get("content-type") || "");
    if (contentType && !contentType.includes("text/html")) return "";
    const html = await readBoundedText(resp, OFFICIAL_COVER_PAGE_MAX_BYTES);
    return extractCoverFromHtml(html);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Candidatos a capa a partir das fontes oficiais do item. Best-effort e
 * bounded: no máximo maxPages páginas, timeout por página, deduplicado.
 */
export async function officialCoverCandidates(
  item: CaduItem,
  maxPages: number = OFFICIAL_COVER_MAX_PAGES,
): Promise<string[]> {
  const covers: string[] = [];
  for (const page of officialPageCandidates(item, maxPages)) {
    const cover = await fetchPageCover(page);
    if (cover && !covers.includes(cover)) covers.push(cover);
  }
  return covers;
}
