'use strict';

/**
 * Revisão profunda /admin/ (rodada 3) — performance do banco.
 * A migration corrige o advisor auth_rls_initplan (RLS reavaliando auth.<fn>()
 * por linha) nas tabelas das páginas admin, envolvendo as chamadas de auth em
 * (select ...), e remove um índice 100% duplicado em posts.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260531180000_admin_pages_rls_perf.sql'),
  'utf8'
);

describe('Rodada 3 — RLS por linha + índice duplicado', () => {
  test('usa ALTER POLICY (sem janela sem policy) nas 8 políticas-alvo', () => {
    [
      'alter policy post_flood_limits_select on public.post_flood_limits',
      'alter policy post_flood_limits_insert_admin on public.post_flood_limits',
      'alter policy post_flood_limits_update_admin on public.post_flood_limits',
      'alter policy post_flood_limits_delete_admin on public.post_flood_limits',
      'alter policy help_requests_insert_authenticated on public.help_requests',
      'alter policy user_legal_acceptances_select_own_or_admin on public.user_legal_acceptances',
      'alter policy user_legal_acceptances_insert_own on public.user_legal_acceptances',
      'alter policy user_legal_acceptances_update_own_or_admin on public.user_legal_acceptances'
    ].forEach((stmt) => expect(sql).toContain(stmt));
  });

  test('envolve auth em (select ...) — padrão InitPlan', () => {
    expect(sql).toContain('(select auth.uid())');
    expect(sql).toContain('kc_is_admin((select auth.uid()))');
    // no corpo executável (ignorando comentários), todo auth.uid() está em (select ...)
    const body = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    const bare = (body.match(/auth\.uid\(\)/g) || []).length;
    const wrapped = (body.match(/\(select auth\.uid\(\)\)/g) || []).length;
    expect(bare).toBe(wrapped);
  });

  test('preserva a semântica (checagens de user_id / is_admin mantidas)', () => {
    expect(sql).toContain('p.is_admin is true');
    expect(sql).toContain('(user_id is null)');
    expect(sql).toContain('from profiles p');
  });

  test('remove o índice duplicado em posts (mantém o canônico)', () => {
    expect(sql).toContain('drop index if exists public.idx_posts_author_created_desc');
    expect(sql).not.toContain('drop index if exists public.posts_author_id_created_at_idx');
  });

  test('não mexe nas políticas já corrigidas do help_requests', () => {
    expect(sql).not.toContain('alter policy help_requests_select_own');
    expect(sql).not.toContain('alter policy help_requests_update_admin');
  });
});
