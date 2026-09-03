// Assinatura de identidade de imagem (2026-09-03).
//
// URLs "diferentes" podem apontar para a MESMA imagem:
//   - CDN do Instagram: hostname/tokens mudam a cada fetch
//     (scontent.*.fbcdn.net vs scontent.cdninstagram.com; oh/oe/stp);
//   - CMS UFG (weby): par thumb/original em /l/ e /o/ do mesmo diretorio.
//
// Mesma assinatura da pipeline (openclaw-cadu scripts/lib/image-signature.js):
//   1. hosts cdninstagram.com / fbcdn.net colapsam para "ig-cdn" + chave
//      estavel do asset (tupla numerica do filename);
//   2. demais hosts mantem hostname e normalizam segmento de variante
//      (l/i -> o), descartando query e prefixo hexa de versao.

const IG_CDN_HOST_RE = /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/;
const IG_ASSET_KEY_RE = /(\d{6,}(?:_\d{6,}){1,})/;
const VERSIONED_FILE_RE = /^[a-f0-9]{8,}_/;

export function imageUrlSignature(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch (_) {
    return raw.toLowerCase().slice(0, 300);
  }
  const host = url.hostname.toLowerCase();
  if (IG_CDN_HOST_RE.test(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const file = (segments[segments.length - 1] || "").toLowerCase();
    const asset = IG_ASSET_KEY_RE.exec(file);
    if (asset) return "ig-cdn/" + asset[1];
    return "ig-cdn/" + file.replace(VERSIONED_FILE_RE, "").slice(0, 160);
  }
  let decoded = url.pathname;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch (_) {
    // pathname bruto
  }
  const segments = decoded
    .toLowerCase()
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment === "l" || segment === "i" ? "o" : segment));
  if (segments.length === 0) return host + "/";
  const last = segments.length - 1;
  segments[last] = segments[last].replace(VERSIONED_FILE_RE, "").slice(0, 160) || segments[last];
  return host + "/" + segments.join("/").slice(-240);
}

/**
 * Dedup preservando a primeira ocorrencia (URL exata como chave primaria,
 * assinatura para variantes da mesma imagem).
 */
export function dedupeImageUrls(values: unknown[], limit = 0): string[] {
  const seenExact = new Set<string>();
  const seenSignature = new Set<string>();
  const result: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const url = String(value ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const signature = imageUrlSignature(url);
    if (!signature || seenExact.has(url) || seenSignature.has(signature)) continue;
    seenExact.add(url);
    seenSignature.add(signature);
    result.push(url);
    if (limit > 0 && result.length >= limit) break;
  }
  return result;
}
