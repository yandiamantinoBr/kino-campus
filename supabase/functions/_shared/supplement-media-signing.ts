export const MAX_SUPPLEMENT_MEDIA_REFERENCES = 100;
export const SUPPLEMENT_MEDIA_SIGNED_URL_SECONDS = 10 * 60;

export type SupplementMediaSigningTarget = {
  mediaRef: string;
  bucketId: string;
  objectPath: string;
};

export type SupplementMediaBatchSigner = (
  bucketId: string,
  objectPaths: string[],
  expiresInSeconds: number,
) => Promise<Array<{ objectPath: string; signedUrl: string }>>;

/**
 * Signs at most one bounded batch per storage bucket. Validation and the
 * global limit run before the first external call, so oversized artifacts
 * fail closed without consuming Edge execution time or minting capabilities.
 */
export async function signSupplementMediaTargets(
  targets: SupplementMediaSigningTarget[],
  signer: SupplementMediaBatchSigner,
): Promise<Map<string, string>> {
  if (targets.length > MAX_SUPPLEMENT_MEDIA_REFERENCES) {
    throw new Error("EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED");
  }

  const seenRefs = new Set<string>();
  const seenPaths = new Set<string>();
  const grouped = new Map<string, SupplementMediaSigningTarget[]>();
  for (const target of targets) {
    if (
      !/^KEM-[A-F0-9]{32}$/.test(target.mediaRef) ||
      !target.bucketId ||
      !target.objectPath ||
      seenRefs.has(target.mediaRef) ||
      seenPaths.has(`${target.bucketId}\n${target.objectPath}`)
    ) {
      throw new Error("EXPORT_MEDIA_SIGNING_TARGET_INVALID");
    }
    seenRefs.add(target.mediaRef);
    seenPaths.add(`${target.bucketId}\n${target.objectPath}`);
    const bucketTargets = grouped.get(target.bucketId) || [];
    bucketTargets.push(target);
    grouped.set(target.bucketId, bucketTargets);
  }

  const batches = await Promise.all(
    [...grouped.entries()].map(async ([bucketId, bucketTargets]) => {
      const objectPaths = bucketTargets.map((target) => target.objectPath);
      const signed = await signer(
        bucketId,
        objectPaths,
        SUPPLEMENT_MEDIA_SIGNED_URL_SECONDS,
      );
      if (!Array.isArray(signed) || signed.length !== bucketTargets.length) {
        throw new Error("EXPORT_MEDIA_SIGNING_FAILED");
      }
      const signedByPath = new Map<string, string>();
      for (const item of signed) {
        if (
          !item ||
          !objectPaths.includes(item.objectPath) ||
          !item.signedUrl ||
          signedByPath.has(item.objectPath)
        ) {
          throw new Error("EXPORT_MEDIA_SIGNING_FAILED");
        }
        signedByPath.set(item.objectPath, item.signedUrl);
      }
      if (signedByPath.size !== objectPaths.length) {
        throw new Error("EXPORT_MEDIA_SIGNING_FAILED");
      }
      return bucketTargets.map((target) => ({
        mediaRef: target.mediaRef,
        signedUrl: signedByPath.get(target.objectPath) || "",
      }));
    }),
  );

  const result = new Map<string, string>();
  for (const batch of batches) {
    for (const item of batch) {
      if (!item.signedUrl || result.has(item.mediaRef)) {
        throw new Error("EXPORT_MEDIA_SIGNING_FAILED");
      }
      result.set(item.mediaRef, item.signedUrl);
    }
  }
  if (result.size !== targets.length) {
    throw new Error("EXPORT_MEDIA_SIGNING_FAILED");
  }
  return result;
}
