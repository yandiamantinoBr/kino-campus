'use strict';

/**
 * Faxina de banco (baixo risco) — advisors de performance do Supabase:
 *  - índices de cobertura para FKs sem índice;
 *  - consolidação de políticas RLS permissivas múltiplas (mesma união de acesso).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260531190000_db_hygiene_fk_indexes_rls_merge.sql'),
  'utf8'
);

describe('Faxina DB — índices de FK', () => {
  test('cria índice de cobertura para as 8 FKs sem índice', () => {
    [
      'account_erasure_requests (processed_by)',
      'chat_conversations (last_message_sender)',
      'chat_read_state (last_read_msg_id)',
      'chat_read_state (user_id)',
      'help_requests (admin_decided_by)',
      'kc_trusted_publishers (created_by)',
      'post_flood_limits (created_by)',
      'post_flood_resets (created_by)'
    ].forEach((target) => {
      expect(sql).toContain('on public.' + target);
    });
    expect((sql.match(/create index if not exists/g) || []).length).toBe(8);
  });
});

describe('Faxina DB — consolidação de RLS', () => {
  test('remove políticas redundantes (já cobertas por FOR ALL idêntica)', () => {
    expect(sql).toContain('drop policy if exists kc_trusted_publishers_admin_select on public.kc_trusted_publishers');
    expect(sql).toContain('drop policy if exists user_blocks_select_own on public.user_blocks');
  });

  test('funde os pares admin/own do post_media em uma policy por ação (OR)', () => {
    ['post_media_delete', 'post_media_insert', 'post_media_update'].forEach((name) => {
      expect(sql).toContain('create policy ' + name + ' on public.post_media');
    });
    // preserva a união: admin OU dono do post
    expect(sql).toContain('kc_is_admin((select auth.uid()))');
    expect(sql).toContain('p.author_id = (select auth.uid())');
    // remove as 6 policies antigas (par por ação)
    ['delete', 'insert', 'update'].forEach((act) => {
      expect(sql).toContain('drop policy if exists post_media_' + act + '_admin on public.post_media');
      expect(sql).toContain('drop policy if exists post_media_' + act + '_own on public.post_media');
    });
  });

  test('não toca na leitura pública de post_media', () => {
    expect(sql).not.toContain('drop policy if exists post_media_select_public');
    expect(sql).not.toMatch(/create policy post_media_select_public/);
  });
});
