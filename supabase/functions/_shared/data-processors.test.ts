import { normalizeDataExportProcessorOutcomes } from "./data-processors.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

const hash = "a".repeat(64);

Deno.test("out-of-band processor disclosure requires safe delivery metadata", () => {
  const outcomes = normalizeDataExportProcessorOutcomes([{
    processor: "hostinger_smtp_mailbox",
    treatment: "mailbox_and_delivery_log_subject_review",
    status: "sanitized_disclosure",
    evidence_sha256: hash,
    resolved_at: "2026-07-29T12:00:00.000Z",
    content_in_export: false,
    delivery_mode: "out_of_band",
    delivery_channel: "secure_file_transfer",
    delivered_at: "2026-07-29T11:30:00.000Z",
    // Raw/free-form text is deliberately ignored in favor of fixed wording.
    disclosure: "browser-controlled text",
  }]);
  assertEquals(outcomes, [{
    processor: "hostinger_smtp_mailbox",
    treatment: "mailbox_and_delivery_log_subject_review",
    outcome: "sanitized_disclosure",
    evidence_sha256: hash,
    resolved_at: "2026-07-29T12:00:00.000Z",
    content_in_export: false,
    delivery_mode: "out_of_band",
    delivery_channel: "secure_file_transfer",
    delivered_at: "2026-07-29T11:30:00.000Z",
    disclosure:
      "Dados deste operador foram entregues separadamente; nenhum conteudo do operador esta incluido neste arquivo JSON.",
  }]);
});

Deno.test("legacy supplied disclosure without attestation fails closed", () => {
  assertEquals(
    normalizeDataExportProcessorOutcomes([{
      processor: "hostinger_smtp_mailbox",
      treatment: "mailbox_and_delivery_log_subject_review",
      status: "sanitized_disclosure",
      evidence_sha256: hash,
      resolved_at: "2026-07-29T12:00:00.000Z",
    }]),
    [],
  );
});
