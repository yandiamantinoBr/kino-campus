import {
  containsPersistedDeliveryCapability,
  exportIntegrityIsValid,
  partitionChatMediaCandidates,
  rehydrateSupplementMediaForDownload,
  unavailablePrivateChatMediaReference,
  withRecomputedExportIntegrity,
} from "./index.ts";
import {
  normalizeDataExportProcessorOutcomes,
  processorOutcomesAreDeliverable,
} from "../_shared/data-processors.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("101 text and 101 media messages remain in scope while only 100 media entries are signed", () => {
  const textMessages = Array.from({ length: 101 }, (_, index) => ({
    id: `text-${index}`,
    content: `message-${index}`,
    media_path: null,
  }));
  const mediaMessages = Array.from({ length: 101 }, (_, index) => ({
    id: `media-${index}`,
    content: null,
    media_path: `chat-media/conversation/owner/file-${index}.jpg`,
  }));

  const plan = partitionChatMediaCandidates(
    [...textMessages, ...mediaMessages],
    100,
  );

  assertEquals(plan.allMessageCount, 202);
  assertEquals(plan.signed.length, 100);
  assertEquals(plan.deferred.length, 1);
  assertEquals(plan.deferred[0].index, 201);
});

Deno.test("unavailable private chat media never exposes its storage path", () => {
  const deferred = unavailablePrivateChatMediaReference(
    "direct_signed_url_limit_reached",
  );
  const rejected = unavailablePrivateChatMediaReference(
    "ownership_validation_failed",
  );

  for (const reference of [deferred, rejected]) {
    assertEquals(reference.kind, "private_chat_attachment");
    assertEquals(reference.delivery, "manual_supplement_required");
    assertEquals(reference.object_path, undefined);
    assertEquals(reference.url, undefined);
    assertEquals(reference.download_url, undefined);
  }
});

Deno.test("supplement media refs are rehydrated only in the returned copy and integrity is recomputed", async () => {
  const ownerId = "00000000-0000-4000-8000-000000000761";
  const mediaRef = "KEM-0123456789ABCDEF0123456789ABCDEF";
  const stored = await withRecomputedExportIntegrity({
    schema: "kino-campus-data-export",
    data: {
      chat_messages_authored: [{
        message_ref: "message-0001",
        media: {
          kind: "private_chat_attachment",
          media_ref: mediaRef,
          delivery: "signed_at_download",
        },
      }],
    },
    media_manifest: {
      delivery: "opaque_private_refs_rehydrated_only_at_authenticated_download",
      signed_urls_embedded: false,
      safe_chat_media_ref_count: 1,
    },
    manifest: {
      completeness: "complete_within_automated_scope",
      media_delivery: "opaque_refs",
      media_ref_count: 1,
      signed_urls_embedded: false,
    },
  });
  const storageCalls: string[] = [];
  const admin = {
    storage: {
      from(bucketId: string) {
        return {
          async createSignedUrls(objectPaths: string[], expiresIn: number) {
            storageCalls.push(
              `${bucketId}:${objectPaths.join(",")}:${expiresIn}`,
            );
            return {
              data: objectPaths.map((objectPath) => ({
                path: objectPath,
                signedUrl:
                  `https://storage.example.test/object/sign/${bucketId}/${objectPath}?token=ephemeral`,
              })),
              error: null,
            };
          },
        };
      },
    },
  };
  const delivered = await rehydrateSupplementMediaForDownload(
    admin as never,
    stored,
    [{
      media_ref: mediaRef,
      bucket_id: "kino-chat-media",
      object_path:
        `chat-media/00000000-0000-4000-8000-000000000999/${ownerId}/attachment.jpg`,
    }],
    ownerId,
  );

  const storedMessage = (stored.data as {
    chat_messages_authored: Array<{ media: Record<string, unknown> }>;
  }).chat_messages_authored[0];
  const deliveredMessage = (delivered.data as {
    chat_messages_authored: Array<{ media: Record<string, unknown> }>;
  }).chat_messages_authored[0];
  assertEquals(storedMessage.media.download_url, undefined);
  assertEquals(
    deliveredMessage.media.delivery,
    "short_lived_signed_url",
  );
  assertEquals(storageCalls.length, 1);
  assertEquals(await exportIntegrityIsValid(delivered), true);
});

Deno.test("supplement download fails closed if a signed capability was persisted", async () => {
  const ownerId = "00000000-0000-4000-8000-000000000761";
  const stored = await withRecomputedExportIntegrity({
    data: {
      chat_messages_authored: [{
        media: {
          media_ref: "KEM-0123456789ABCDEF0123456789ABCDEF",
          delivery: "signed_at_download",
          download_url: "https://storage.example.test/leaked",
        },
      }],
    },
    media_manifest: {
      signed_urls_embedded: false,
      safe_chat_media_ref_count: 0,
    },
    manifest: {},
  });

  let failedClosed = false;
  try {
    await rehydrateSupplementMediaForDownload(
      {} as never,
      stored,
      [],
      ownerId,
    );
  } catch (error) {
    failedClosed = error instanceof Error &&
      error.message === "EXPORT_STORED_MEDIA_CAPABILITY_INVALID";
  }
  assertEquals(failedClosed, true);
});

Deno.test("persisted capability scan fails closed beyond its nesting bound", () => {
  let deeplyNested: Record<string, unknown> = {
    download_url: "https://storage.example.test/leaked",
  };
  for (let depth = 0; depth < 14; depth += 1) {
    deeplyNested = { nested: deeplyNested };
  }
  assertEquals(containsPersistedDeliveryCapability(deeplyNested), true);
});

Deno.test("processor completion requires a deliverable disclosure or evidenced no-account-data outcome", () => {
  const valid = normalizeDataExportProcessorOutcomes([
    {
      processor: "supabase_db_auth_storage",
      treatment: "automated_core_subject_workflow",
      status: "automated",
    },
    {
      processor: "manual_operator",
      treatment: "subject_data_review",
      status: "no_account_data",
      evidence_sha256: "a".repeat(64),
      resolved_at: "2026-07-28T12:00:00.000Z",
      content_in_export: false,
    },
  ]);
  const unjustified = normalizeDataExportProcessorOutcomes([
    {
      processor: "manual_operator",
      treatment: "subject_data_review",
      status: "no_account_data",
      evidence_sha256: null,
      resolved_at: "2026-07-28T12:00:00.000Z",
      content_in_export: false,
    },
  ]);

  assertEquals(valid.length, 2);
  assertEquals(processorOutcomesAreDeliverable(valid), true);
  assertEquals(unjustified.length, 0);
  assertEquals(processorOutcomesAreDeliverable(unjustified), false);
});
