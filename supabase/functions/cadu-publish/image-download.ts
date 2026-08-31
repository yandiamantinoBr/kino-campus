import {
  fetchPublicResource,
  readBoundedBody,
  type RemoteResourceDependencies,
  RemoteResourceError,
} from "./remote-resource.ts";

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export async function downloadRemoteImage(
  url: string,
  options: { timeoutMs: number; maxBytes: number; userAgent: string },
  deps: RemoteResourceDependencies = {},
): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: Response | undefined;
  try {
    response = await fetchPublicResource(url, {
      accept: "image/*,*/*;q=0.5",
      userAgent: options.userAgent,
      signal: controller.signal,
    }, deps);
    if (!response.ok) throw new Error(`image_download_http_${response.status}`);
    const ct = (response.headers.get("content-type") || "").split(";")[0].trim()
      .toLowerCase();
    let ext = IMAGE_EXT[ct] || "";
    if (!ext) {
      const match = url.toLowerCase().match(/\.(jpe?g|png|gif|webp)(?:$|[?#])/);
      if (match) ext = match[1] === "jpeg" ? "jpg" : match[1];
    }
    if (!ext) throw new Error("unsupported_image_type");
    const bytes = await readBoundedBody(response, options.maxBytes, {
      signal: controller.signal,
    });
    if (!bytes.byteLength) throw new Error("empty_image");
    const contentType = ct.startsWith("image/")
      ? ct
      : `image/${ext === "jpg" ? "jpeg" : ext}`;
    return { bytes, contentType, ext };
  } catch (error) {
    // Preserve safety failures so the caller cannot persist a blocked URL as
    // the external fallback. Other transport/storage fallback stays unchanged.
    if (error instanceof RemoteResourceError) throw error;
    if (controller.signal.aborted) {
      throw new RemoteResourceError("image_download_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (response?.body && !response.body.locked) {
      void response.body.cancel().catch(() => {});
    }
  }
}
