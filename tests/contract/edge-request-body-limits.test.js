'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const HELPER = read('supabase/functions/_shared/bounded-request-body.ts');
const CONFIG = read('supabase/config.toml');
const CASES = [
  {
    file: 'supabase/functions/kc-data-subject-request/index.ts',
    requestName: 'request',
    maximumBytes: '16_384',
  },
  {
    file: 'supabase/functions/kc-data-export-admin/index.ts',
    requestName: 'request',
    maximumBytes: '65_536',
  },
  {
    file: 'supabase/functions/kc-data-export-retention/index.ts',
    requestName: 'request',
    maximumBytes: '1024',
  },
  {
    file: 'supabase/functions/kc-account-erasure/index.ts',
    requestName: 'req',
    maximumBytes: '32_768',
  },
  {
    file: 'supabase/functions/kc-help-request-notify/index.ts',
    requestName: 'req',
    maximumBytes: 'MAX_REQUEST_BYTES',
  },
  {
    file: 'supabase/functions/kc-search-console-reports/index.ts',
    requestName: 'req',
    maximumBytes: 'MAX_REQUEST_BODY_BYTES',
  },
  {
    file: 'supabase/functions/kc-ga4-reports/index.ts',
    requestName: 'req',
    maximumBytes: 'MAX_REQUEST_BODY_BYTES',
  },
  {
    file: 'supabase/functions/notify-admin-reports-threshold/index.ts',
    requestName: 'req',
    maximumBytes: 'MAX_REQUEST_BODY_BYTES',
  },
  {
    file: 'supabase/functions/kc-external-access-decide/index.ts',
    requestName: 'req',
    maximumBytes: 'MAX_REQUEST_BODY_BYTES',
  },
  {
    file: 'supabase/functions/kc-invite-user/index.ts',
    requestName: 'req',
    maximumBytes: 'MAX_REQUEST_BODY_BYTES',
  },
];

describe('bounded request bodies on privacy Edge Functions', () => {
  test('keeps browser/admin privacy handlers behind gateway JWT verification', () => {
    for (const functionName of [
      'kc-account-erasure',
      'kc-data-subject-request',
      'kc-data-export-admin',
    ]) {
      expect(CONFIG).toMatch(
        new RegExp(`\\[functions\\.${functionName}\\]\\s*verify_jwt\\s*=\\s*true`),
      );
    }
    expect(CONFIG).toMatch(
      /\[functions\.kc-data-export-retention\]\s*verify_jwt\s*=\s*false/,
    );
  });

  test.each(CASES)(
    '$file counts the actual stream and returns 413 for oversized bodies',
    ({ file, requestName, maximumBytes }) => {
      const source = read(file);

      expect(source).toContain('from "../_shared/bounded-request-body.ts"');
      expect(source).toContain(
        `readBoundedRequestText(${requestName}, ${maximumBytes})`,
      );
      expect(source).toContain('error.code === "BODY_TOO_LARGE"');
      expect(source).toMatch(/\b413\b/);
      expect(source).not.toContain(`${requestName}.json()`);
      expect(source).not.toContain(`${requestName}.text()`);
    },
  );

  test('shared reader treats Content-Length only as an early check', () => {
    expect(HELPER).toContain('request.body.getReader()');
    expect(HELPER).toContain('totalBytes += value.byteLength');
    expect(HELPER).toContain('if (totalBytes > maxBytes)');
    expect(HELPER).toContain('await reader.cancel("BODY_TOO_LARGE")');
    expect(HELPER).toContain('new TextDecoder("utf-8", { fatal: true })');

    const declaredLengthCheck = HELPER.indexOf(
      'if (declaredLength !== null && declaredLength > maxBytes)',
    );
    const streamCount = HELPER.indexOf('totalBytes += value.byteLength');
    expect(declaredLengthCheck).toBeGreaterThan(0);
    expect(streamCount).toBeGreaterThan(declaredLengthCheck);
  });

  test('admin functions authenticate and authorize before allocating their bodies', () => {
    for (const file of [
      'supabase/functions/kc-data-export-admin/index.ts',
      'supabase/functions/kc-account-erasure/index.ts',
    ]) {
      const source = read(file);
      const bodyAt = source.lastIndexOf('await readBoundedRequestText');
      const authAt = source.lastIndexOf('.auth.getUser', bodyAt);
      const profileAt = source.lastIndexOf('.from("profiles")', bodyAt);

      expect(authAt).toBeGreaterThan(0);
      expect(profileAt).toBeGreaterThan(authAt);
      expect(bodyAt).toBeGreaterThan(profileAt);
    }
  });
});
