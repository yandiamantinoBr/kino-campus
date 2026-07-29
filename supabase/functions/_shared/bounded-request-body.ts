export type BoundedRequestBodyErrorCode =
  | "BODY_TOO_LARGE"
  | "INVALID_BODY";

export class BoundedRequestBodyError extends Error {
  readonly code: BoundedRequestBodyErrorCode;

  constructor(code: BoundedRequestBodyErrorCode) {
    super(code);
    this.name = "BoundedRequestBodyError";
    this.code = code;
  }
}

function declaredBodyLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (value === null || value.trim() === "") return null;
  if (!/^[0-9]+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Reads a request body without ever retaining more than maxBytes.
 *
 * Content-Length is used only as an early rejection. The stream is always
 * counted as it is consumed, so chunked requests and false undersized headers
 * cannot bypass the limit.
 */
export async function readBoundedRequestText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError("maxBytes must be a non-negative safe integer");
  }

  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new BoundedRequestBodyError("BODY_TOO_LARGE");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new BoundedRequestBodyError("INVALID_BODY");
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("BODY_TOO_LARGE");
        } catch {
          // Cancellation is best effort; the body will not be read again.
        }
        throw new BoundedRequestBodyError("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) throw error;
    throw new BoundedRequestBodyError("INVALID_BODY");
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled or failed stream may already have released its lock.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new BoundedRequestBodyError("INVALID_BODY");
  }
}
