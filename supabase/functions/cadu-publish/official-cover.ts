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
import { fetchPublicResource, publicRemoteUrl, readBoundedBody, type RemoteResourceDependencies } from "./remote-resource.ts";

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
  const pageLimit = Math.min(OFFICIAL_COVER_MAX_PAGES, Math.max(0, Math.trunc(Number(maxPages) || 0)));
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
    if (pages.length >= pageLimit) break;
    if (typeof raw !== "string") continue;
    const url = publicRemoteUrl(raw, true);
    if (!url) continue;
    if (isInstagramHost(url)) continue;
    const key = url.replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    pages.push(url);
  }
  return pages;
}

async function fetchPageCover(pageUrl: string, deps: RemoteResourceDependencies): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFFICIAL_COVER_PAGE_TIMEOUT_MS);
  let resp: Response | undefined;
  try {
    resp = await fetchPublicResource(pageUrl, {
      userAgent: "KinoCampus-Cadu/1.0 (+https://www.kinocampus.com.br)", accept: "text/html",
      signal: controller.signal,
      httpsOnly: true,
    }, deps);
    if (!resp.ok) return "";
    const contentType = String(resp.headers.get("content-type") || "");
    if (contentType && !contentType.includes("text/html")) return "";
    const bytes = await readBoundedBody(resp, OFFICIAL_COVER_PAGE_MAX_BYTES, { truncate: true, signal: controller.signal });
    const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return extractCoverFromHtml(html);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
    if (resp?.body && !resp.body.locked) void resp.body.cancel().catch(() => {});
  }
}

/**
 * Candidatos a capa a partir das fontes oficiais do item. Best-effort e
 * bounded: no máximo maxPages páginas, timeout por página, deduplicado.
 */
export async function officialCoverCandidates(
  item: CaduItem,
  maxPages: number = OFFICIAL_COVER_MAX_PAGES,
  deps: RemoteResourceDependencies = {},
): Promise<string[]> {
  const covers: string[] = [];
  for (const page of officialPageCandidates(item, maxPages)) {
    const cover = await fetchPageCover(page, deps);
    if (cover && !covers.includes(cover)) covers.push(cover);
  }
  return covers;
}
