// Shared outbound boundary for untrusted editorial pages and image URLs.
// DNS is checked again at every redirect. This is NOT a DNS-pinned transport:
// the runtime fetch still resolves the name itself (residual rebinding/TOCTOU).
import { isIP } from "node:net";

export class RemoteResourceError extends Error {}
/**
 * Falha permanente do recurso remoto (ex.: HTTP 404/410, conteúdo sem imagem,
 * corpo vazio). Subclasse de RemoteResourceError para que os chamadores que já
 * recusam fallback externo em RemoteResourceError também recusem aqui — não
 * devemos persistir uma URL que NUNCA vai resolver em imagem válida.
 */
export class PermanentResourceError extends RemoteResourceError {}
export const MAX_REMOTE_REDIRECTS = 3;

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 || (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1);
  const [first, second = "0"] = normalized.split(":").map((part) =>
    part || "0"
  );
  const a = parseInt(first, 16);
  const b = parseInt(second, 16);
  // Global unicast only; excludes mapped IPv4, NAT64, local/link-local,
  // multicast, protocol assignments, documentation and 6to4 tunnels.
  return a >= 0x2000 && a <= 0x3fff && a !== 0x2002 &&
    !(a === 0x2001 && (b <= 0x1ff || b === 0xdb8)) &&
    !(a === 0x3fff && b <= 0x0fff);
}

/** Pure syntax/literal check; DNS names still need assertPublicDns at fetch time. */
export function publicRemoteUrl(value: unknown, httpsOnly = false): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw || /[\u0000-\u0020\u007f\\]/.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) {
      return "";
    }
    if (url.username || url.password || url.port) return "";
    const host = url.hostname.toLowerCase();
    const address = host.replace(/^\[|\]$/g, "");
    if (isIP(address)) {
      if (!isPublicAddress(address)) return "";
    } else {
      if (host.length > 253 || !host.includes(".") || host.endsWith(".")) {
        return "";
      }
      if (
        !host.split(".").every((label) =>
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
        )
      ) return "";
      if (
        /(^|\.)(?:localhost|local|internal|invalid|test|example|onion|home|lan|corp|intranet|arpa)$/
          .test(host)
      ) return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export interface RemoteResourceDependencies {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  resolveDns?: (
    hostname: string,
    type: "A" | "AAAA",
    options: { signal?: AbortSignal },
  ) => Promise<string[]>;
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(new RemoteResourceError("remote_resource_aborted"));
    if (signal.aborted) {
      promise.catch(() => {});
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", abort)
    );
  });
}

async function assertPublicDns(
  url: URL,
  signal: AbortSignal | undefined,
  deps: RemoteResourceDependencies,
): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return; // already checked by publicRemoteUrl
  const resolve = deps.resolveDns ||
    ((hostname, type, options) => Deno.resolveDns(hostname, type, options));
  try {
    const records = await abortable(
      Promise.all((["A", "AAAA"] as const).map(async (type) => {
        try {
          return await resolve(host, type, { signal });
        } catch (error) {
          // A real authoritative absence of one family is normal. Timeouts,
          // permission failures and all other resolver errors remain fail-closed.
          if (error instanceof Deno.errors.NotFound) return [];
          throw error;
        }
      })),
      signal,
    );
    const addresses = records.flat();
    if (
      !addresses.length ||
      addresses.some((address) => !isPublicAddress(address))
    ) {
      throw new RemoteResourceError("remote_dns_not_public");
    }
  } catch (error) {
    if (error instanceof RemoteResourceError) throw error;
    throw new RemoteResourceError("remote_dns_unavailable");
  }
}

function cancelBody(response: Response): void {
  void response.body?.cancel().catch(() => {});
}

/** GET only, no cookies/auth, bounded manually validated redirects. */
export async function fetchPublicResource(
  value: string,
  options: {
    accept: string;
    userAgent: string;
    signal?: AbortSignal;
    httpsOnly?: boolean;
  },
  deps: RemoteResourceDependencies = {},
): Promise<Response> {
  let current = publicRemoteUrl(value, options.httpsOnly);
  if (!current) throw new RemoteResourceError("remote_url_not_public");
  const seen = new Set<string>();
  for (let hop = 0; hop <= MAX_REMOTE_REDIRECTS; hop++) {
    if (options.signal?.aborted) {
      throw new RemoteResourceError("remote_resource_aborted");
    }
    if (seen.has(current)) {
      throw new RemoteResourceError("remote_redirect_loop");
    }
    seen.add(current);
    const url = new URL(current);
    await assertPublicDns(url, options.signal, deps);
    const response = await abortable(
      (deps.fetch || fetch)(current, {
        method: "GET",
        headers: { accept: options.accept, "user-agent": options.userAgent },
        redirect: "manual",
        credentials: "omit",
        signal: options.signal,
      }),
      options.signal,
    );
    if (
      response.redirected ||
      (response.url &&
        publicRemoteUrl(response.url, options.httpsOnly) !== current)
    ) {
      cancelBody(response);
      throw new RemoteResourceError("remote_unvalidated_redirect");
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    cancelBody(response);
    if (hop === MAX_REMOTE_REDIRECTS) {
      throw new RemoteResourceError("remote_redirect_limit");
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new RemoteResourceError("remote_redirect_missing_location");
    }
    let next = "";
    try {
      next = publicRemoteUrl(
        new URL(location, current).toString(),
        options.httpsOnly || url.protocol === "https:",
      );
    } catch { /* rejected below */ }
    if (!next) throw new RemoteResourceError("remote_redirect_not_public");
    current = next;
  }
  throw new RemoteResourceError("remote_redirect_limit");
}

/** Enforce the byte cap before retaining a chunk; HTML may use a bounded prefix. */
export async function readBoundedBody(
  response: Response,
  maxBytes: number,
  options: { truncate?: boolean; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (!options.truncate && declared > maxBytes) {
    cancelBody(response);
    throw new RemoteResourceError("remote_body_too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (options.truncate && total === maxBytes) break;
      if (options.signal?.aborted) {
        throw new RemoteResourceError("remote_resource_aborted");
      }
      const { done, value } = await abortable(reader.read(), options.signal);
      if (done) break;
      const remaining = maxBytes - total;
      if (value.length > remaining && !options.truncate) {
        throw new RemoteResourceError("remote_body_too_large");
      }
      const chunk = value.length > remaining
        ? value.slice(0, remaining)
        : value;
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
