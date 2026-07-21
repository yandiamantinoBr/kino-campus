// Shared Google service-account JSON parsing for Edge Functions.
// Hardens against common secret-store mangling (lost newlines, quotes,
// double-encoded JSON, base64 wrappers) without logging secret material.

export interface ServiceAccountKey {
  type: "service_account";
  private_key: string;
  client_email: string;
  project_id?: string;
  token_uri?: string;
}

export type SaParseFailureReason =
  | "empty"
  | "too_large"
  | "json_parse_failed"
  | "wrong_type"
  | "missing_email"
  | "missing_private_key"
  | "missing_pem_markers"
  | "pem_normalize_failed";

export interface SaParseSuccess {
  ok: true;
  key: ServiceAccountKey;
  diagnostics: SaParseDiagnostics;
}

export interface SaParseFailure {
  ok: false;
  reason: SaParseFailureReason;
  diagnostics: SaParseDiagnostics;
}

export interface SaParseDiagnostics {
  raw_length: number;
  starts_with_brace: boolean;
  looks_base64: boolean;
  json_parse_ok: boolean;
  was_double_encoded: boolean;
  type_ok: boolean;
  email_ok: boolean;
  private_key_present: boolean;
  private_key_has_begin: boolean;
  private_key_has_end: boolean;
  private_key_has_real_newlines: boolean;
  private_key_had_escaped_newlines: boolean;
  private_key_was_collapsed: boolean;
}

function emptyDiagnostics(rawLength = 0): SaParseDiagnostics {
  return {
    raw_length: rawLength,
    starts_with_brace: false,
    looks_base64: false,
    json_parse_ok: false,
    was_double_encoded: false,
    type_ok: false,
    email_ok: false,
    private_key_present: false,
    private_key_has_begin: false,
    private_key_has_end: false,
    private_key_has_real_newlines: false,
    private_key_had_escaped_newlines: false,
    private_key_was_collapsed: false,
  };
}

export function stripSecretWrappers(raw: string): string {
  let text = String(raw ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trim();
  // One layer of quotes often survives dotenv/secret pipelines.
  if (
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2)
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function tryBase64Decode(text: string): string | null {
  if (!text || text.startsWith("{")) return null;
  const compact = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+=*$/.test(compact) || compact.length < 64) return null;
  try {
    const decoded = atob(compact);
    return decoded.trim().startsWith("{") ? decoded : null;
  } catch (_) {
    return null;
  }
}

export function normalizePrivateKeyPem(input: string): {
  pem: string;
  hadEscapedNewlines: boolean;
  wasCollapsed: boolean;
} {
  let key = String(input || "").trim();
  let hadEscapedNewlines = false;
  let wasCollapsed = false;

  if (key.includes("\\n") && !key.includes("\n")) {
    key = key.replace(/\\n/g, "\n");
    hadEscapedNewlines = true;
  }
  if (key.includes("\\r\\n")) {
    key = key.replace(/\\r\\n/g, "\n");
    hadEscapedNewlines = true;
  }
  if (key.includes("\\r")) {
    key = key.replace(/\\r/g, "");
    hadEscapedNewlines = true;
  }

  const begin = "-----BEGIN PRIVATE KEY-----";
  const end = "-----END PRIVATE KEY-----";
  if (key.includes(begin) && key.includes(end) && !key.includes("\n")) {
    // Secret stores sometimes collapse PEM into a single line.
    const body = key
      .replace(begin, "")
      .replace(end, "")
      .replace(/\s+/g, "");
    const lines = body.match(/.{1,64}/g) || [];
    key = `${begin}\n${lines.join("\n")}\n${end}\n`;
    wasCollapsed = true;
  }

  return { pem: key, hadEscapedNewlines, wasCollapsed };
}

export function parseServiceAccountSecret(rawInput: string): SaParseSuccess | SaParseFailure {
  const diagnostics = emptyDiagnostics(String(rawInput || "").length);
  let text = stripSecretWrappers(rawInput);
  if (!text) return { ok: false, reason: "empty", diagnostics };
  if (text.length > 128 * 1024) return { ok: false, reason: "too_large", diagnostics };

  diagnostics.starts_with_brace = text.startsWith("{");
  const decoded = tryBase64Decode(text);
  if (decoded) {
    text = decoded;
    diagnostics.looks_base64 = true;
    diagnostics.starts_with_brace = text.trim().startsWith("{");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
    diagnostics.json_parse_ok = true;
  } catch (_) {
    // Double-encoded: the secret is a JSON string of a JSON object.
    try {
      const once = JSON.parse(text);
      if (typeof once === "string") {
        parsed = JSON.parse(once);
        diagnostics.json_parse_ok = true;
        diagnostics.was_double_encoded = true;
      } else {
        return { ok: false, reason: "json_parse_failed", diagnostics };
      }
    } catch (_) {
      return { ok: false, reason: "json_parse_failed", diagnostics };
    }
  }

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
      diagnostics.was_double_encoded = true;
      diagnostics.json_parse_ok = true;
    } catch (_) {
      return { ok: false, reason: "json_parse_failed", diagnostics };
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "json_parse_failed", diagnostics };
  }

  const value = parsed as Record<string, unknown>;
  diagnostics.type_ok = value.type === "service_account";
  if (!diagnostics.type_ok) return { ok: false, reason: "wrong_type", diagnostics };

  const clientEmail = typeof value.client_email === "string" ? value.client_email.trim() : "";
  diagnostics.email_ok = /^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/i.test(clientEmail);
  if (!diagnostics.email_ok) return { ok: false, reason: "missing_email", diagnostics };

  if (typeof value.private_key !== "string" || !value.private_key.trim()) {
    return { ok: false, reason: "missing_private_key", diagnostics };
  }
  diagnostics.private_key_present = true;

  const normalized = normalizePrivateKeyPem(value.private_key);
  diagnostics.private_key_had_escaped_newlines = normalized.hadEscapedNewlines;
  diagnostics.private_key_was_collapsed = normalized.wasCollapsed;
  diagnostics.private_key_has_real_newlines = normalized.pem.includes("\n");
  diagnostics.private_key_has_begin = normalized.pem.includes("-----BEGIN PRIVATE KEY-----");
  diagnostics.private_key_has_end = normalized.pem.includes("-----END PRIVATE KEY-----");

  if (!diagnostics.private_key_has_begin || !diagnostics.private_key_has_end) {
    return { ok: false, reason: "missing_pem_markers", diagnostics };
  }
  if (!diagnostics.private_key_has_real_newlines) {
    return { ok: false, reason: "pem_normalize_failed", diagnostics };
  }

  return {
    ok: true,
    key: {
      type: "service_account",
      private_key: normalized.pem,
      client_email: clientEmail,
      project_id: typeof value.project_id === "string" ? value.project_id : undefined,
      token_uri: typeof value.token_uri === "string" ? value.token_uri : undefined,
    },
    diagnostics,
  };
}
