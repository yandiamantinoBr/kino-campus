'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('closed posts - contratos de dados e feed efetivo', () => {
  let migration;
  let grantsMigration;
  let closeAuditFixMigration;
  let rpcStorageHardeningMigration;
  let unaccentSchemaMigration;
  let internalHardeningMigration;
  let rpcWrapperMigration;
  let isAdminAnonGrantMigration;

  beforeAll(() => {
    migration = read('supabase/migrations/v9.3.4.0_closed_posts_effective_feed.sql');
    grantsMigration = read('supabase/migrations/v9.3.4.1_closed_posts_rpc_grants.sql');
    closeAuditFixMigration = read('supabase/migrations/v9.3.4.2_fix_close_post_audit_payload.sql');
    rpcStorageHardeningMigration = read('supabase/migrations/v9.3.4.3_security_advisor_rpc_storage_hardening.sql');
    unaccentSchemaMigration = read('supabase/migrations/v9.3.4.4_unaccent_extension_schema.sql');
    internalHardeningMigration = read('supabase/migrations/v9.3.4.5_internal_rpc_and_notification_rls_hardening.sql');
    rpcWrapperMigration = read('supabase/migrations/v9.3.4.6_security_definer_rpc_wrappers.sql');
    isAdminAnonGrantMigration = read('supabase/migrations/v9.3.4.7_grant_anon_is_admin_helper_wrapper.sql');
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
    expect(grantsMigration).toContain('revoke execute on function public.kc_close_post(uuid, text) from public, anon');
    expect(grantsMigration).toContain('revoke execute on function public.kc_admin_set_post_status(uuid, text, boolean) from public, anon');
  });

  test('kc_get_feed_cursor inclui closed e ordena recentes por effective_at', () => {
    expect(migration).toContain("p.status in ('published', 'closed')");
    expect(migration).toContain('public.kc_can_read_post(p.author_id, p.status, p.visibility)');
    expect(migration).toContain('coalesce(p.bumped_at, p.created_at) as effective_at');
    expect(migration).toContain("case when v_sort = 'recentes' then effective_at end desc nulls last");
    expect(migration).toContain("'effective_at', kept.effective_at");
    expect(migration).toContain("'bumped_at', cursor_row.bumped_at");
    expect(grantsMigration).toContain('alter function public.kc_can_read_post(uuid, text, text) security invoker');
    expect(grantsMigration).toContain('grant execute on function public.kc_can_read_post(uuid, text, text) to anon, authenticated, service_role');
  });

  test('RPC de denuncia de encerramento nao e executavel por anon', () => {
    expect(grantsMigration).toContain('revoke execute on function public.kc_report_post(uuid, text, text) from public, anon');
    expect(grantsMigration).toContain('grant execute on function public.kc_report_post(uuid, text, text) to authenticated, service_role');
  });

  test('kc_close_post registra auditoria usando payload, nao metadata inexistente', () => {
    expect(closeAuditFixMigration).toContain('create or replace function public.kc_close_post');
    expect(closeAuditFixMigration).toContain('perform public.audit_log_insert');
    expect(closeAuditFixMigration).toContain("'post_closed'");
    expect(closeAuditFixMigration).not.toContain('actor_id, metadata');
    expect(closeAuditFixMigration).not.toContain('entity_id, actor_id, metadata');
  });

  test('hardening remove listagem ampla do bucket e limita RPCs expostas', () => {
    expect(rpcStorageHardeningMigration).toContain('drop policy if exists storage_kino_media_public_read on storage.objects');
    expect(rpcStorageHardeningMigration).toContain('and p.prosecdef');
    expect(rpcStorageHardeningMigration).toContain('revoke execute on function');
    expect(rpcStorageHardeningMigration).toContain('kc_admin_set_post_status');
    expect(rpcStorageHardeningMigration).toContain('kc_home_category_post_counts');
  });

  test('unaccent fica fora de public com wrapper estavel para buscas', () => {
    expect(unaccentSchemaMigration).toContain('create schema if not exists extensions');
    expect(unaccentSchemaMigration).toContain('alter extension unaccent set schema extensions');
    expect(unaccentSchemaMigration).toContain('create or replace function public.kc_unaccent');
    expect(unaccentSchemaMigration).toContain('extensions.unaccent');
  });

  test('tabelas internas de notificacao recebem policies e rotinas internas perdem execute publico', () => {
    expect(internalHardeningMigration).toContain('notification_delivery_outbox_service_role_all');
    expect(internalHardeningMigration).toContain('notification_dispatch_runtime_service_role_all');
    expect(internalHardeningMigration).toContain('revoke execute on function');
    expect(internalHardeningMigration).toContain('kc_claim_notification_delivery_batch');
    expect(internalHardeningMigration).toContain('kc_record_notification_delivery_attempt');
  });

  test('RPCs publicas usam wrappers invoker e implementacao privada', () => {
    expect(rpcWrapperMigration).toContain('create schema if not exists kc_private');
    expect(rpcWrapperMigration).toContain("alter function public.%I(%s) set schema kc_private");
    expect(rpcWrapperMigration).toContain('security invoker');
    expect(rpcWrapperMigration).toContain('p.prosecdef');
    expect(rpcWrapperMigration).toContain('kc_private.%I(%s)');
  });

  test('feed anonimo mantem execute no helper kc_is_admin usado por kc_can_read_post', () => {
    expect(isAdminAnonGrantMigration).toContain('grant execute on function public.kc_is_admin(uuid) to anon');
    expect(isAdminAnonGrantMigration).toContain('grant execute on function kc_private.kc_is_admin(uuid) to anon');
    expect(isAdminAnonGrantMigration).toContain("notify pgrst, 'reload schema'");
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
