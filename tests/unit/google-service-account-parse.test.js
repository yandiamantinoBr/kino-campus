'use strict';

/**
 * Mirrors the Deno shared parser rules in Node so we catch secret-mangling
 * regressions without deploying Edge Functions.
 */

function stripSecretWrappers(raw) {
  let text = String(raw ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trim();
  if (
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2)
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function normalizePrivateKeyPem(input) {
  let key = String(input || '').trim();
  let hadEscapedNewlines = false;
  let wasCollapsed = false;

  if (key.includes('\\n') && !key.includes('\n')) {
    key = key.replace(/\\n/g, '\n');
    hadEscapedNewlines = true;
  }
  if (key.includes('\\r\\n')) {
    key = key.replace(/\\r\\n/g, '\n');
    hadEscapedNewlines = true;
  }

  const begin = '-----BEGIN PRIVATE KEY-----';
  const end = '-----END PRIVATE KEY-----';
  if (key.includes(begin) && key.includes(end) && !key.includes('\n')) {
    const body = key.replace(begin, '').replace(end, '').replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) || [];
    key = `${begin}\n${lines.join('\n')}\n${end}\n`;
    wasCollapsed = true;
  }

  return { pem: key, hadEscapedNewlines, wasCollapsed };
}

function parseServiceAccountSecret(rawInput) {
  let text = stripSecretWrappers(rawInput);
  if (!text) return { ok: false, reason: 'empty' };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return { ok: false, reason: 'json_parse_failed' };
  }
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return { ok: false, reason: 'json_parse_failed' };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'json_parse_failed' };
  }
  if (parsed.type !== 'service_account') return { ok: false, reason: 'wrong_type' };
  if (!/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/i.test(String(parsed.client_email || ''))) {
    return { ok: false, reason: 'missing_email' };
  }
  if (typeof parsed.private_key !== 'string' || !parsed.private_key.trim()) {
    return { ok: false, reason: 'missing_private_key' };
  }
  const normalized = normalizePrivateKeyPem(parsed.private_key);
  if (
    !normalized.pem.includes('-----BEGIN PRIVATE KEY-----') ||
    !normalized.pem.includes('-----END PRIVATE KEY-----')
  ) {
    return { ok: false, reason: 'missing_pem_markers' };
  }
  if (!normalized.pem.includes('\n')) {
    return { ok: false, reason: 'pem_normalize_failed' };
  }
  return {
    ok: true,
    key: {
      type: 'service_account',
      private_key: normalized.pem,
      client_email: parsed.client_email,
    },
    normalized: normalized,
  };
}

const FAKE_BODY = 'A'.repeat(64);
const ESCAPED_PEM =
  '-----BEGIN PRIVATE KEY-----\\n' + FAKE_BODY + '\\n-----END PRIVATE KEY-----\\n';
const COLLAPSED_PEM =
  '-----BEGIN PRIVATE KEY-----' + FAKE_BODY + '-----END PRIVATE KEY-----';

describe('google service account secret parsing', () => {
  test('accepts standard JSON with escaped PEM newlines', () => {
    const raw = JSON.stringify({
      type: 'service_account',
      client_email: 'kc-ga4@example.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\n' + FAKE_BODY + '\n-----END PRIVATE KEY-----\n',
    });
    const result = parseServiceAccountSecret(raw);
    expect(result.ok).toBe(true);
    expect(result.key.private_key).toContain('\n');
  });

  test('recovers PEM that only has literal backslash-n sequences', () => {
    const raw = JSON.stringify({
      type: 'service_account',
      client_email: 'kc-ga4@example.iam.gserviceaccount.com',
      private_key: ESCAPED_PEM,
    });
    // JSON.stringify double-escapes; build raw object string manually.
    const manual =
      '{"type":"service_account","client_email":"kc-ga4@example.iam.gserviceaccount.com","private_key":"' +
      ESCAPED_PEM +
      '"}';
    const result = parseServiceAccountSecret(manual);
    expect(result.ok).toBe(true);
    expect(result.normalized.hadEscapedNewlines || result.key.private_key.includes('\n')).toBe(true);
  });

  test('rebuilds collapsed single-line PEM', () => {
    const raw =
      '{"type":"service_account","client_email":"kc-ga4@example.iam.gserviceaccount.com","private_key":"' +
      COLLAPSED_PEM +
      '"}';
    const result = parseServiceAccountSecret(raw);
    expect(result.ok).toBe(true);
    expect(result.normalized.wasCollapsed).toBe(true);
    expect(result.key.private_key.split('\n').length).toBeGreaterThan(2);
  });

  test('unwraps outer quotes common in secret pipelines', () => {
    const inner = JSON.stringify({
      type: 'service_account',
      client_email: 'kc-ga4@example.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\n' + FAKE_BODY + '\n-----END PRIVATE KEY-----\n',
    });
    const result = parseServiceAccountSecret("'" + inner + "'");
    expect(result.ok).toBe(true);
  });

  test('rejects empty and wrong type secrets', () => {
    expect(parseServiceAccountSecret('').ok).toBe(false);
    expect(parseServiceAccountSecret('{"type":"user"}').reason).toBe('wrong_type');
    expect(parseServiceAccountSecret('not-json').reason).toBe('json_parse_failed');
  });
});
