// Shared LGPD processor inventory.
//
// Keep this module free of user identifiers and provider credentials. It only
// reports whether an integration is configured and which operational treatment
// is required. Export and erasure workflows can map the same canonical statuses
// to their own persisted state machines.

export type ProcessorStatus =
  | "handled_by_workflow"
  | "manual_policy_follow_up"
  | "not_configured"
  | "not_account_linked";

export type DataProcessor = {
  processor: string;
  treatment: string;
  status: ProcessorStatus;
};

export type DataExportProcessorOutcome =
  | {
    processor: string;
    treatment: string;
    outcome:
      | "included_in_core_export"
      | "not_configured"
      | "not_account_linked";
    evidence_sha256: null;
    resolved_at: string | null;
  }
  | {
    processor: string;
    treatment: string;
    outcome: "sanitized_disclosure";
    evidence_sha256: string;
    resolved_at: string;
    content_in_export: false;
    delivery_mode: "out_of_band";
    delivery_channel:
      | "support_mailbox"
      | "secure_file_transfer"
      | "provider_portal"
      | "in_person";
    delivered_at: string;
    disclosure:
      "Dados deste operador foram entregues separadamente; nenhum conteudo do operador esta incluido neste arquivo JSON.";
  }
  | {
    processor: string;
    treatment: string;
    outcome: "no_account_data";
    evidence_sha256: string;
    resolved_at: string;
    content_in_export: false;
    disclosure:
      "O operador confirmou que nao localizou dados vinculados a esta conta; nenhum conteudo do operador esta incluido neste arquivo JSON.";
  }
  | {
    processor: string;
    treatment: string;
    outcome: "manual_follow_up";
    evidence_sha256: null;
    resolved_at: null;
  };

type ArtifactProcessorTask = {
  processor?: unknown;
  treatment?: unknown;
  status?: unknown;
  outcome?: unknown;
  evidence_sha256?: unknown;
  evidence_hash?: unknown;
  resolved_at?: unknown;
  content_in_export?: unknown;
  delivery_mode?: unknown;
  delivery_channel?: unknown;
  delivered_at?: unknown;
};

const PROCESSOR_RE = /^[a-z0-9][a-z0-9_]{2,79}$/;
const TREATMENT_RE = /^[a-z0-9][a-z0-9_]{2,119}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const DELIVERY_CHANNELS = new Set([
  "support_mailbox",
  "secure_file_transfer",
  "provider_portal",
  "in_person",
]);
const OUT_OF_BAND_DISCLOSURE =
  "Dados deste operador foram entregues separadamente; nenhum conteudo do operador esta incluido neste arquivo JSON." as const;
const NO_ACCOUNT_DATA_DISCLOSURE =
  "O operador confirmou que nao localizou dados vinculados a esta conta; nenhum conteudo do operador esta incluido neste arquivo JSON." as const;

function envPresent(name: string): boolean {
  try {
    return Boolean((Deno.env.get(name) || "").trim());
  } catch {
    return false;
  }
}

function envValue(name: string): string {
  try {
    return (Deno.env.get(name) || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export function buildDataProcessorMatrix(): DataProcessor[] {
  const notificationEmailProvider = envValue(
    "KC_NOTIFICATION_EMAIL_PROVIDER",
  );
  const notificationWhatsappProvider = envValue(
    "KC_NOTIFICATION_WHATSAPP_PROVIDER",
  );

  return [
    {
      processor: "supabase_db_auth_storage",
      treatment: "automated_core_subject_workflow",
      status: "handled_by_workflow",
    },
    {
      processor: "supabase_backups_logs",
      treatment: "retention_restore_and_subject_data_review",
      status: "manual_policy_follow_up",
    },
    {
      processor: "vercel_access_runtime_logs",
      treatment: "retention_and_account_identifier_review",
      status: "manual_policy_follow_up",
    },
    {
      processor: "hostinger_smtp_mailbox",
      treatment: "mailbox_and_delivery_log_subject_review",
      status: "manual_policy_follow_up",
    },
    {
      processor: "cadu_openclaw_hostinger_vps",
      treatment: "upstream_account_identifier_and_audit_review",
      status: "manual_policy_follow_up",
    },
    {
      processor: "resend",
      treatment: "delivery_log_subject_review_when_configured",
      status: notificationEmailProvider === "resend" ||
          envPresent("KC_NOTIFICATION_EMAIL_API_KEY")
        ? "manual_policy_follow_up"
        : "not_configured",
    },
    {
      processor: "twilio",
      treatment: "message_log_subject_review_when_configured",
      status: notificationWhatsappProvider === "twilio" ||
          envPresent("KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID")
        ? "manual_policy_follow_up"
        : "not_configured",
    },
    {
      processor: "ga4_pseudonymous_user_id",
      treatment: "consented_pseudonymous_identifier_review",
      status: envPresent("KC_GA4_PROPERTY_ID")
        ? "manual_policy_follow_up"
        : "not_configured",
    },
    {
      processor: "adsense",
      treatment: "no_kinocampus_account_identifier_integration",
      status: "not_account_linked",
    },
    {
      processor: "search_console",
      treatment: "public_search_metrics_not_linked_to_account",
      status: "not_account_linked",
    },
  ];
}

export function toDataExportProcessorTasks(
  matrix = buildDataProcessorMatrix(),
): Array<{ processor: string; treatment: string; status: string }> {
  return matrix.map((entry) => ({
    processor: entry.processor,
    treatment: entry.treatment,
    status: entry.status === "handled_by_workflow"
      ? "automated"
      : entry.status === "manual_policy_follow_up"
      ? "manual_follow_up"
      : entry.status,
  }));
}

export function toDefaultDataExportProcessorOutcomes(
  matrix = buildDataProcessorMatrix(),
): DataExportProcessorOutcome[] {
  return matrix.map((entry): DataExportProcessorOutcome => {
    if (entry.status === "handled_by_workflow") {
      return {
        processor: entry.processor,
        treatment: entry.treatment,
        outcome: "included_in_core_export",
        evidence_sha256: null,
        resolved_at: null,
      };
    }
    if (entry.status === "manual_policy_follow_up") {
      return {
        processor: entry.processor,
        treatment: entry.treatment,
        outcome: "manual_follow_up",
        evidence_sha256: null,
        resolved_at: null,
      };
    }
    return {
      processor: entry.processor,
      treatment: entry.treatment,
      outcome: entry.status,
      evidence_sha256: null,
      resolved_at: null,
    };
  });
}

/**
 * Converts the private task projection returned by the artifact claim into the
 * only processor disclosures allowed inside an export. Raw evidence references
 * and reviewer identifiers are deliberately not accepted.
 */
export function normalizeDataExportProcessorOutcomes(
  value: unknown,
): DataExportProcessorOutcome[] {
  if (!Array.isArray(value) || value.length > 32) return [];
  const outcomes: DataExportProcessorOutcome[] = [];
  const seen = new Set<string>();

  for (const raw of value as ArtifactProcessorTask[]) {
    if (!raw || typeof raw !== "object") return [];
    const processor = typeof raw.processor === "string"
      ? raw.processor.trim().toLowerCase()
      : "";
    const treatment = typeof raw.treatment === "string"
      ? raw.treatment.trim().toLowerCase()
      : "";
    const rawStatus = raw.status ?? raw.outcome;
    const status = typeof rawStatus === "string"
      ? rawStatus.trim().toLowerCase()
      : "";
    const evidence = typeof (raw.evidence_sha256 ?? raw.evidence_hash) ===
        "string"
      ? String(raw.evidence_sha256 ?? raw.evidence_hash).trim().toLowerCase()
      : "";
    const resolvedAt = typeof raw.resolved_at === "string" &&
        Number.isFinite(Date.parse(raw.resolved_at))
      ? new Date(raw.resolved_at).toISOString()
      : null;

    if (
      !PROCESSOR_RE.test(processor) ||
      !TREATMENT_RE.test(treatment) ||
      seen.has(processor)
    ) return [];
    seen.add(processor);

    if (status === "automated" || status === "included_in_core_export") {
      outcomes.push({
        processor,
        treatment,
        outcome: "included_in_core_export",
        evidence_sha256: null,
        resolved_at: null,
      });
      continue;
    }
    if (status === "manual_follow_up") {
      outcomes.push({
        processor,
        treatment,
        outcome: "manual_follow_up",
        evidence_sha256: null,
        resolved_at: null,
      });
      continue;
    }
    if (status === "not_configured" || status === "not_account_linked") {
      outcomes.push({
        processor,
        treatment,
        outcome: status,
        evidence_sha256: null,
        resolved_at: null,
      });
      continue;
    }
    if (status === "sanitized_disclosure") {
      const deliveryChannel = typeof raw.delivery_channel === "string"
        ? raw.delivery_channel.trim().toLowerCase()
        : "";
      const deliveredAt = typeof raw.delivered_at === "string" &&
          Number.isFinite(Date.parse(raw.delivered_at))
        ? new Date(raw.delivered_at).toISOString()
        : null;
      if (
        !SHA256_RE.test(evidence) ||
        !resolvedAt ||
        raw.content_in_export !== false ||
        raw.delivery_mode !== "out_of_band" ||
        !DELIVERY_CHANNELS.has(deliveryChannel) ||
        !deliveredAt
      ) return [];
      outcomes.push({
        processor,
        treatment,
        outcome: status,
        evidence_sha256: evidence,
        resolved_at: resolvedAt,
        content_in_export: false,
        delivery_mode: "out_of_band",
        delivery_channel: deliveryChannel as
          | "support_mailbox"
          | "secure_file_transfer"
          | "provider_portal"
          | "in_person",
        delivered_at: deliveredAt,
        disclosure: OUT_OF_BAND_DISCLOSURE,
      });
      continue;
    }
    if (
      status === "no_account_data" &&
      SHA256_RE.test(evidence) &&
      resolvedAt &&
      raw.content_in_export === false
    ) {
      outcomes.push({
        processor,
        treatment,
        outcome: status,
        evidence_sha256: evidence,
        resolved_at: resolvedAt,
        content_in_export: false,
        disclosure: NO_ACCOUNT_DATA_DISCLOSURE,
      });
      continue;
    }
    return [];
  }

  return outcomes.sort((left, right) =>
    left.processor.localeCompare(right.processor)
  );
}

export function processorOutcomesAreDeliverable(
  outcomes: DataExportProcessorOutcome[],
): boolean {
  return outcomes.length > 0 &&
    outcomes.every((entry) => entry.outcome !== "manual_follow_up");
}

export function hasBlockingDataProcessor(
  matrix = buildDataProcessorMatrix(),
): boolean {
  return matrix.some((entry) => entry.status === "manual_policy_follow_up");
}
