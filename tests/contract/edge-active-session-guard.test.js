'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const CASES = [
  {
    file: 'supabase/functions/cadu-publish/index.ts',
    auth: 'userClient.auth.getUser()',
    privileged: 'const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY',
  },
  {
    file: 'supabase/functions/kc-ga4-reports/index.ts',
    auth: 'userClient.auth.getUser(',
    privileged: 'const admin = createClient(supabaseUrl, serviceKey',
  },
  {
    file: 'supabase/functions/kc-search-console-reports/index.ts',
    auth: 'userClient.auth.getUser(',
    privileged: 'const admin = createClient(supabaseUrl, serviceKey',
  },
  {
    file: 'supabase/functions/kc-analytics-subject-id/index.ts',
    auth: 'userClient.auth.getUser(bearer[1])',
    privileged: 'createAnalyticsSubjectId(analyticsSecret, userId)',
  },
  {
    file: 'supabase/functions/kc-invite-user/index.ts',
    auth: 'userClient.auth.getUser()',
    privileged: '.from("profiles")',
  },
  {
    file: 'supabase/functions/kc-external-access-decide/index.ts',
    auth: 'userClient.auth.getUser()',
    privileged: 'userClient.rpc(',
  },
];

describe('authenticated Edge Functions require a live Supabase session', () => {
  test.each(CASES)('$file guards after Auth and before privileged work', ({ file, auth, privileged }) => {
    const source = read(file);
    const authIndex = source.indexOf(auth);
    const guardIndex = source.indexOf('await isCurrentSessionActive(userClient)');
    const privilegedIndex = source.indexOf(privileged, guardIndex + 1);

    expect(source).toContain('from "../_shared/active-session.ts"');
    expect(source).toContain('"SESSION_NOT_ACTIVE"');
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeGreaterThan(authIndex);
    expect(privilegedIndex).toBeGreaterThan(guardIndex);
  });

  test('shared helper calls the user-scoped RPC and accepts only exact true', () => {
    const helper = read('supabase/functions/_shared/active-session.ts');

    expect(helper).toContain('client.rpc("kc_is_current_session_active")');
    expect(helper).toContain('error == null && data === true');
    expect(helper).toContain('catch (_)');
    expect(helper).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
