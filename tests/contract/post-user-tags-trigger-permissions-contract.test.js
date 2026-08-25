'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20260821051500_revoke_post_user_tags_trigger_rpc.sql');
const source = fs.readFileSync(MIGRATION, 'utf8');

describe('contrato de privilégios do trigger de Tags', () => {
  test('mantém o normalizador como helper interno, sem execução RPC pública', () => {
    const signature = 'function public.kc_normalize_post_user_tags()';

    expect(source).toContain(`revoke execute on ${signature} from public;`);
    expect(source).toContain(`revoke execute on ${signature} from anon;`);
    expect(source).toContain(`revoke execute on ${signature} from authenticated;`);
    expect(source).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.kc_normalize_post_user_tags/i);
  });
});
