'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('closed posts - contratos de dados e feed efetivo', () => {
  let migration;

  beforeAll(() => {
    migration = read('supabase/migrations/v9.3.4.0_closed_posts_effective_feed.sql');
  });

  test('posts aceita closed como status historico publico', () => {
    expect(migration).toContain('posts_status_check');
    expect(migration).toContain("status in ('published', 'pending', 'hidden', 'deleted', 'expired', 'closed')");
    expect(migration).toContain("coalesce(p_status, 'published') in ('published', 'closed')");
  });

  test('denuncias aceitam motivo post_closed sem remover motivos de comentarios', () => {
    expect(migration).toContain('reports_reason_check');
    expect(migration).toContain("'post_closed'");
    expect(migration).toContain("'harassment'");
    expect(migration).toContain("'privacy'");
  });

  test('owner e admin possuem RPCs de encerramento', () => {
    expect(migration).toContain('create or replace function public.kc_close_post');
    expect(migration).toContain('grant execute on function public.kc_close_post(uuid, text) to authenticated, service_role');
    expect(migration).toContain('create or replace function public.kc_admin_set_post_status');
    expect(migration).toContain("v_status not in ('published', 'pending', 'hidden', 'deleted', 'expired', 'closed')");
    expect(migration).toContain('p_close_reports');
  });

  test('kc_get_feed_cursor inclui closed e ordena recentes por effective_at', () => {
    expect(migration).toContain("p.status in ('published', 'closed')");
    expect(migration).toContain('public.kc_can_read_post(p.author_id, p.status, p.visibility)');
    expect(migration).toContain('coalesce(p.bumped_at, p.created_at) as effective_at');
    expect(migration).toContain("case when v_sort = 'recentes' then effective_at end desc nulls last");
    expect(migration).toContain("'effective_at', kept.effective_at");
    expect(migration).toContain("'bumped_at', cursor_row.bumped_at");
  });
});

describe('closed posts - contratos publicos JS', () => {
  test('API e adapters expõem closePost e normalizam tempo efetivo', () => {
    const client = read('assets/js/api/kc-api.client.js');
    const write = read('assets/js/api/kc-api.posts-write.js');
    const supabase = read('assets/js/adapters/supabase/supabase.posts-write.adapter.js');

    expect(client).toContain('async function closePost(postId, payload = {})');
    expect(client).toContain('bumpedAt');
    expect(client).toContain('effectiveAt');
    expect(client).toContain('isClosed');
    expect(write).toContain('async function closePost(postId, payload, deps)');
    expect(supabase).toContain("'kc_close_post'");
    expect(supabase).toContain("'post_closed'");
  });

  test('detalhe do produto separa Encerrar do dono e Relatar encerrado do visitante', () => {
    const edit = read('assets/js/controllers/public/product.edit.js');
    const report = read('assets/js/controllers/public/product.report.js');
    const controller = read('assets/js/controllers/public/product.controller.js');
    const render = read('assets/js/controllers/public/product.render.js');

    expect(edit).toContain('closePostButton');
    expect(edit).toContain('window.KCAPI.closePost');
    expect(edit).toContain('clearPostSessionCaches');
    expect(report).toContain('closedReportButton');
    expect(report).toContain("reason: 'post_closed'");
    expect(report).toContain('Relatar encerrado');
    expect(controller).toContain("type: 'closed'");
    expect(controller).toContain('kc-product-cta--closed');
    expect(render).toContain('kc-product-status-note--closed');
    expect(render).toContain('Encerrado');
  });

  test('cards e feed usam closed como historico e effective_at para recentes', () => {
    const presentation = read('assets/js/utils/kc-utils.presentation.js');
    const feed = read('assets/js/controllers/public/kc-feed.controller.js');
    const supabasePosts = read('assets/js/api/kc-supabase.posts.js');

    expect(presentation).toContain('kc-card--closed');
    expect(presentation).toContain("data-status=\"${_escapeHtml(isClosed ? 'closed'");
    expect(presentation).toContain('Ver historico');
    expect(presentation).toContain('disabled aria-disabled="true"');
    expect(feed).toContain('FEED_SNAPSHOT_VERSION = 4');
    expect(feed).toContain('raw.effective_at');
    expect(supabasePosts).toContain('a.bumped_at || a.created_at');
  });
});

describe('closed posts - contratos admin, shell e notificacoes', () => {
  test('admin oferece filtro/acao para encerramento', () => {
    const moderation = read('assets/js/controllers/admin/admin-moderation.controller.js');
    const reports = read('assets/js/controllers/admin/admin-reports.controller.js');
    const reportsHtml = read('admin/reports.html');

    expect(moderation).toContain("'closed', 'deleted'");
    expect(moderation).toContain("actionButton('Encerrar', 'closed'");
    expect(reports).toContain("post_closed: 'Encerramento'");
    expect(reports).toContain("data-action=\"closePost\"");
    expect(reports).toContain("setPostStatus(postId, 'closed', true)");
    expect(reportsHtml).toContain('<option value="post_closed">Encerramento</option>');
  });

  test('shell reaproveita avatar do snapshot e limpa mismatch/logout', () => {
    const authUi = read('assets/js/core/kc-auth.ui.js');
    const shell = read('assets/js/core/kc-public-shell.js');

    expect(authUi).toContain('function handleAuthChange(event)');
    expect(authUi).toContain("store.remove('shell', SHELL_SNAPSHOT_KEY)");
    expect(authUi).not.toContain("if (opts.fromSnapshot) return ''");
    expect(shell).toContain('function getSnapshotAvatar(snapshot)');
    expect(shell).toContain('profile.avatar_url');
  });

  test('notificacoes hidratam cache por usuario e abrem dropdown sem esperar fetch', () => {
    const notifications = read('assets/js/core/kc-notifications.js');

    expect(notifications).toContain('function readNotificationSnapshot(userId)');
    expect(notifications).toContain('function writeNotificationSnapshot()');
    expect(notifications).toContain("document.addEventListener('kc:authchange'");
    expect(notifications).toContain('openDropdown();\n    fetchNotifications();');
    expect(notifications).not.toContain('setTimeout(checkAuth, 600)');
  });
});
