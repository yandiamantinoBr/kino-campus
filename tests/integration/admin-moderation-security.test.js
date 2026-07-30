'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

describe('moderação — autocomplete e ACL de profiles', () => {
  const migration = read('supabase/migrations/20260716163009_harden_moderation_profile_autocomplete.sql');
  const moderation = read('assets/js/controllers/admin/admin-moderation.controller.js');
  const cadu = read('assets/js/controllers/admin/admin-cadu.controller.js');
  const profileFlow = read('assets/js/controllers/public/profile.flow.js');

  test('remove privilégios amplos e regranta somente DML de perfil editável', () => {
    expect(migration).toContain('revoke all on table public.profiles from anon, authenticated;');
    expect(migration).toContain('grant insert (');
    expect(migration).toContain('grant update (');
    expect(migration).not.toMatch(/grant (?:insert|update) \([\s\S]*?\bemail\b[\s\S]*?\) on table public\.profiles/);
    expect(migration).not.toMatch(/grant (?:insert|update) \([\s\S]*?\bis_admin\b[\s\S]*?\) on table public\.profiles/);
    expect(migration).not.toMatch(/grant (?:insert|update) \([\s\S]*?\brating_avg\b[\s\S]*?\) on table public\.profiles/);
  });

  test('email permanece sem grant direto e autocomplete passa por RPC admin', () => {
    expect(migration).not.toMatch(/grant select \([\s\S]*?\bemail\b[\s\S]*?\) on table public\.profiles/);
    expect(migration).toContain('create or replace function public.kc_admin_search_profiles_for_limits');
    expect(migration).toMatch(
      /public\.kc_admin_search_profiles_for_limits[\s\S]*?security invoker[\s\S]*?kc_private\.kc_admin_search_profiles_for_limits/
    );
    expect(migration).toMatch(
      /kc_private\.kc_admin_search_profiles_for_limits[\s\S]*?security definer[\s\S]*?set search_path = ''/
    );
    expect(moderation).toContain("client.rpc('kc_admin_search_profiles_for_limits'");
    expect(moderation).not.toMatch(/from\(['"]profiles['"]\)[\s\S]{0,260}select\([^)]*\bemail\b/);
    expect(cadu).toContain(".select('is_admin, display_name, full_name')");
  });

  test('perfil não consulta legacy_id inexistente', () => {
    expect(profileFlow).toContain(
      ".select('created_at, bio, avatar_url, display_name, full_name, verified')"
    );
    expect(profileFlow).not.toMatch(/from\(['"]profiles['"]\)[\s\S]{0,220}\blegacy_id\b/);
  });

  test('whitelist não expõe nota administrativa ao convidado', () => {
    expect(migration).toContain('revoke all on table public.kc_invited_emails from anon, authenticated;');
    expect(migration).toMatch(
      /grant select \(\s*email,\s*invited_at,\s*used_at,\s*expires_at\s*\) on table public\.kc_invited_emails to authenticated;/
    );
    const invitedDmlGrants = migration.split(';').filter((statement) =>
      /grant\s+(?:insert|update|delete|truncate|references|trigger)[\s\S]*on table public\.kc_invited_emails to (?:anon|authenticated)/i.test(statement)
    );
    expect(invitedDmlGrants).toEqual([]);
    const visiblePolicy = migration.slice(
      migration.indexOf('drop policy if exists kc_invited_emails_select_visible'),
      migration.indexOf('-- ---------------------------------------------------------------------------', migration.indexOf('drop policy if exists kc_invited_emails_select_visible'))
    );
    expect(visiblePolicy).toContain("auth.jwt()->>'email'");
    expect(visiblePolicy).not.toContain('from auth.users');
  });
});

describe('moderação — decisão externa idempotente e nota interna', () => {
  const edge = read('supabase/functions/kc-external-access-decide/index.ts');
  const external = read('assets/js/controllers/admin/admin-external-access.controller.js');
  const migration = read('supabase/migrations/20260716163009_harden_moderation_profile_autocomplete.sql');

  test('decisão e claim de entrega são serializados na mesma transação', () => {
    expect(migration).toContain("if v_row.admin_status = 'pending' then");
    expect(migration).toContain('elsif v_row.admin_status <> v_decision then');
    expect(migration).toContain('kc_private.kc_admin_claim_external_access_delivery');
    expect(migration).toContain("'status', 'processing'");
    expect(migration).toContain("'claim_id', p_claim_id::text");
    expect(migration).toContain('for update;');
    expect(edge).toContain('"kc_admin_claim_external_access_delivery"');
    expect(edge).toContain('p_claim_id: deliveryClaimId');
    expect(edge).toContain('persistedClaimId !== deliveryClaimId');
  });

  test('nota administrativa fica fora de metadata, whitelist e e-mail', () => {
    expect(edge).not.toContain('admin_note: adminNote');
    expect(edge).not.toMatch(/\bnote:\s*adminNote\b/);
    expect(edge).not.toContain('Observação da equipe:');
    expect(edge).toContain('buildRejectionEmail({ requesterName, baseUrl })');
  });

  test('resultado terminal persistido é reaproveitado sem duplicar entrega', () => {
    expect(edge).toContain('["sent", "link_generated", "failed"].includes(previousStatus)');
    expect(edge).toContain('replayed: true');
    expect(edge).toContain('decision_persisted: true');
    expect(edge).toContain('delivery_status: "processing"');
    expect(edge).toMatch(/return json\(200, \{[\s\S]*?delivery_status: "failed"/);
  });

  test('erros de provedores ficam em códigos estáveis sem detalhes brutos', () => {
    expect(edge).toContain('safeErrorCode');
    expect(edge).not.toContain('detail: msg');
    expect(edge).not.toContain('error_message: msg');
    expect(edge).not.toContain('rejection send error:');
    expect(edge).not.toContain('previousDelivery.error_message');
    expect(edge).not.toContain('previousDelivery.smtp_error');
    expect(edge).toContain('error_code: errorCode');
  });

  test('painel não afirma persistência antes de verificar a conclusão CAS', () => {
    const approvalStart = external.indexOf("if (decision === 'approved') {");
    const persistenceCheck = external.indexOf("if (data.delivery_state_persisted === false)", approvalStart);
    const approvalBranch = external.slice(approvalStart, persistenceCheck);

    expect(approvalBranch).not.toContain('O estado foi preservado');
    expect(approvalBranch).not.toContain('return;');
    expect(external).toContain('revise o item que permanece em processamento antes de qualquer ação manual');
    expect(external).toContain('configurar SMTP administrativo');
    expect(external).not.toContain('configurar Resend');
  });

  test('finalização usa compare-and-swap do claim e não sobrescreve metadata diretamente', () => {
    expect(migration).toContain('kc_private.kc_complete_external_access_delivery');
    expect(migration).toContain("coalesce(v_current_delivery->>'claim_id', '') <> p_claim_id::text");
    expect(migration).toContain("lower(coalesce(v_current_delivery->>'status', '')) <> 'processing'");
    expect(edge).toContain('"kc_complete_external_access_delivery"');
    expect(edge).toContain('const deliveryStatePersisted = await completeDelivery');
    expect(edge).not.toMatch(/\.from\(["']help_requests["']\)\s*\.update/);
  });

  test('painel recupera link por ID e preserva o segredo fora do atributo HTML', () => {
    expect(external).toContain('data-ext-recover-invite-link="${escapeHtml(item.id)}"');
    expect(external).not.toMatch(/data-ext-recover-invite-link=["'`]?\$\{[^}]*invite_link/);
    expect(external).toContain('STATE.items.find');
    expect(external).toContain('inviteMeta.invite_link');
    expect(external).toContain('function renderProcessingBadge(delivery, label)');
    expect(external).toContain('reenvio automático é bloqueado para evitar duplicidade');
  });

  test('histórico pagina além dos primeiros 100 itens e o modal gerencia foco', () => {
    expect(external).toContain('const LIST_PAGE_SIZE = 200;');
    expect(external).toContain('offset: items.length');
    expect(external).toContain('STATE.returnFocus = document.activeElement');
    expect(external).toContain("if (ev.key !== 'Tab') return;");
    expect(external).toContain('returnFocus.focus()');
    expect(external).toContain('let modalTokenSeq = 0;');
    expect(external).toContain('if (STATE.modal.busy && !force)');
    expect(external).toContain('closeModal(false)');
    expect(external).toContain('STATE.modal.token === token');
  });

  test('atualização externa ignora respostas antigas e preserva categorias que falharam', () => {
    expect(external).toContain('let refreshRequestSeq = 0;');
    expect(external).toContain('const requestSeq = ++refreshRequestSeq;');
    expect(external).toContain('if (requestSeq !== refreshRequestSeq) return;');
    expect(external).toContain('const previousItems = Array.isArray(STATE.items) ? STATE.items.slice() : [];');
    expect(external).toContain('nextItems.push(...previousItems.filter');
    expect(external).toContain('Os dados anteriores dessas categorias foram preservados.');
  });

  test('falha de uma busca com filtro novo não mantém posts antigos acionáveis', () => {
    const moderation = read('assets/js/controllers/admin/admin-moderation.controller.js');
    expect(moderation).toContain('function resetPostsForRequest()');
    expect(moderation).toContain("setControlBusy($('#moderation-load-more'), false);");
    expect(moderation).toContain('state.posts = [];');
    expect(moderation).toMatch(
      /if \(reset\) \{\s*resetPostsForRequest\(\);\s*renderPostsRequestState\('Carregando publicações…', true\);/
    );
    expect(moderation).toContain("renderPostsRequestState('Não foi possível carregar as publicações deste filtro.', false)");
  });
});

describe('moderação — integridade transacional e workers privados reconciliados', () => {
  const migration = read('supabase/migrations/20260716184424_finalize_admin_moderation_integrity.sql');

  test('limites ativos têm uma única linha por escopo nulo e usam upsert atômico', () => {
    expect(migration).toContain('lock table public.post_limits in share row exclusive mode');
    expect(migration).toContain("set module = nullif(btrim(module), '')");
    expect(migration).toContain('create unique index post_limits_unique_scope_idx');
    expect(migration).toContain('on public.post_limits (user_id, module) nulls not distinct');
    expect(migration).toMatch(
      /kc_private\.kc_admin_set_post_limit[\s\S]*?on conflict \(user_id, module\)[\s\S]*?do update set/
    );
    expect(migration).toMatch(
      /kc_admin_set_post_flood_limit[\s\S]*?on conflict \([\s\S]*?coalesce\(user_id,[\s\S]*?coalesce\(module,[\s\S]*?do update set/
    );
  });

  test('RPCs públicas de limites são invoker e a lógica privilegiada fica em kc_private', () => {
    [
      'kc_admin_get_post_limits',
      'kc_admin_set_post_limit',
      'kc_admin_delete_post_limit',
    ].forEach((name) => {
      expect(migration).toMatch(
        new RegExp(`create or replace function public\\.${name}[\\s\\S]*?security invoker[\\s\\S]*?set search_path = ''`)
      );
      expect(migration).toMatch(
        new RegExp(`create or replace function kc_private\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`)
      );
    });
  });

  test('worker externo ausente da baseline é restaurado com paginação determinística', () => {
    expect(migration).toContain('create or replace function kc_private.kc_admin_list_external_access');
    expect(migration).toMatch(
      /kc_private\.kc_admin_list_external_access[\s\S]*?security definer[\s\S]*?set search_path = ''/
    );
    expect(migration).toContain('count(*) over()');
    expect(migration).toMatch(
      /order by[\s\S]*?admin_status = 'pending'[\s\S]*?created_at desc,[\s\S]*?id desc/
    );
    expect(migration).toContain('help_requests_external_access_status_created_id_idx');
  });

  test('export de posts usa corte temporal e desempate estável sem alterar a RPC interativa', () => {
    expect(migration).toContain(
      'drop function if exists public.kc_admin_search_posts_full(\n  text, text, integer, integer, timestamptz'
    );
    expect(migration).toContain(
      'kc_private.kc_admin_search_posts_full_snapshot(\n  p_query text,\n  p_status text,\n  p_limit integer,\n  p_offset integer,\n  p_until timestamptz'
    );
    expect(migration).toContain('create or replace function kc_private.kc_admin_search_posts_full_rows');
    expect(migration).toContain('least(coalesce(p_limit, 25), 2000)');
    expect(migration).toContain('greatest(1, least(coalesce($3, 25), 250))');
    expect(migration).toContain("left(coalesce(post_row.description, ''), 500)");
    expect(migration).toContain('out_rows jsonb');
    expect(migration).toContain('out_total_count bigint');
    expect(migration).toContain("to_jsonb(post_row) - 'total_count'");
    expect(migration).toContain('greatest(1, least(coalesce($3, 2000), 2000))');
    expect(migration).toContain('post_row.created_at <= coalesce(p_until, now())');
    expect(migration).toMatch(
      /order by[\s\S]*?post_row\.created_at desc,[\s\S]*?post_row\.id desc/
    );
    expect(migration).toContain(
      'public.kc_admin_search_posts_full_snapshot(\n  p_query text,\n  p_status text,\n  p_limit integer,\n  p_offset integer,\n  p_until timestamptz'
    );
    expect(migration).not.toContain(
      'public.kc_admin_search_posts_full(\n  p_query text,\n  p_status text,\n  p_limit integer,\n  p_offset integer,\n  p_until timestamptz'
    );
    expect(migration).toContain(
      'revoke all on function kc_private.kc_admin_search_posts_full_rows(text, text, integer, integer, timestamptz)'
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  test('criação pública de ajuda passa por worker sanitizador e não aceita INSERT direto', () => {
    expect(migration).toContain('create or replace function kc_private.kc_create_help_request');
    expect(migration).toMatch(
      /kc_private\.kc_create_help_request[\s\S]*?security definer[\s\S]*?set search_path = ''/
    );
    expect(migration).toMatch(
      /public\.kc_create_help_request[\s\S]*?security invoker[\s\S]*?kc_private\.kc_create_help_request/
    );
    expect(migration).toContain('revoke insert on table public.help_requests from anon, authenticated;');
    expect(migration).toContain('drop policy if exists help_requests_insert_public');
    expect(migration).toContain("admin_status = 'pending'");
    expect(migration).toContain("status = 'new'");
  });

  test('ACL das funções privadas e públicas é explícita por papel', () => {
    expect(migration).toContain(
      'revoke all on function kc_private.kc_admin_list_external_access(text, integer, integer)'
    );
    expect(migration).toContain(
      'grant execute on function public.kc_admin_list_external_access(text, integer, integer)'
    );
    expect(migration).toMatch(
      /grant execute on function public\.kc_admin_list_external_access\(text, integer, integer\)[\s\S]*?to authenticated, service_role/
    );
    expect(migration).toMatch(
      /grant execute on function public\.kc_create_help_request\(jsonb\)[\s\S]*?to anon, authenticated, service_role/
    );
  });
});
