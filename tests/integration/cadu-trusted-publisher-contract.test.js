'use strict';

/**
 * Contrato do pipeline de publicacao do Cadu (v75.1):
 * - Migration: allowlist kc_trusted_publishers + isencao dos soft gates do
 *   anti-spam para bots confiaveis, mantendo flood control para todos.
 * - Edge Function cadu-publish: auth + allowlist + acoes + melhorias do mapper.
 * - Cliente de referencia nao expoe service_role.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} incomplete`);
}

describe('Cadu trusted publisher — migration', () => {
  let sql;
  beforeAll(() => {
    sql = r('supabase/migrations/_archive-v75/20260530120000_cadu_trusted_publisher_pipeline.sql');
  });

  test('cria allowlist e helper interno', () => {
    expect(sql).toContain('create table if not exists public.kc_trusted_publishers');
    expect(sql).toContain('create or replace function kc_private.kc_is_trusted_publisher(p_user_id uuid)');
    expect(sql).toContain('alter table public.kc_trusted_publishers enable row level security');
  });

  test('recria o gate isentando os soft gates para bots confiaveis', () => {
    expect(sql).toContain('create or replace function public.kc_anti_spam_gate()');
    expect(sql).toContain('v_trusted := kc_private.kc_is_trusted_publisher(new.author_id);');
    expect(sql).toMatch(/if v_trusted then\s+return new;/);
  });

  test('mantem o flood control e os soft gates para os demais usuarios', () => {
    expect(sql).toContain('kc_private.kc_compute_post_flood_check(new.author_id, new.module)');
    expect(sql).toContain('flood_limit_exceeded');
    expect(sql).toContain("'link_spam'");
    expect(sql).toContain("'new_user_scrutiny'");
  });

  test('faz seed idempotente da conta do Cadu', () => {
    expect(sql).toContain('2345582d-8bf7-4393-aa0d-f9953d0e02ca');
    expect(sql).toContain('on conflict (user_id) do nothing');
  });

  test('apenas admin gerencia a allowlist (RLS)', () => {
    expect(sql).toContain('public.kc_is_admin((select auth.uid()))');
  });
});

describe('Cadu publish — Edge Function', () => {
  let index;
  let mapper;
  let schema;
  let review;
  beforeAll(() => {
    index = r('supabase/functions/cadu-publish/index.ts');
    mapper = r('supabase/functions/cadu-publish/mapper.ts');
    schema = r('supabase/functions/cadu-publish/schema.ts');
    review = r('supabase/functions/cadu-publish/review.ts');
  });

  test('valida JWT e exige conta confiavel (allowlist)', () => {
    expect(index).toContain('userClient.auth.getUser()');
    expect(index).toContain('isTrustedPublisher');
    expect(index).toContain('kc_trusted_publishers');
    expect(index).toContain("code: \"NOT_TRUSTED\"");
  });

  test('usa service role apenas no servidor (secret) e seta status published', () => {
    expect(index).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(index).toContain('status: "published"');
  });

  test('expoe as acoes publish/review/edit/list/check', () => {
    expect(index).toContain('case "publish"');
    expect(index).toContain('case "review"');
    expect(index).toContain('case "edit"');
    expect(index).toContain('case "list"');
    expect(index).toContain('case "check"');
  });

  test('bloqueia publicacao de baixa qualidade antes do insert', () => {
    expect(index).toContain('evaluateCaduPublishQuality');
    expect(index).toContain('code: "QUALITY_BLOCKED"');
    expect(index).toContain('blockingWarnings');
    expect(index).toContain('event_past');
    expect(index).toContain('application_deadline_past');
    expect(index).toContain('applicationDeadlineExpired');
    expect(index).toContain('deadline_past');
    expect(index).toContain('institutional_or_biographical_release');
    expect(index).toContain('cms_credits_in_description');
    expect(index).toContain('weak_description');
    expect(index).toContain('only_temporary_or_svg_images');
    expect(index).toContain('instagram_without_official_source');
    expect(index).toContain('hasConcretePublishActionSignal');
    expect(index).toContain('hasInstitutionalOnlySignal(item.title)');
    expect(index.indexOf('const quality = evaluateCaduPublishQuality')).toBeLessThan(index.indexOf('if (options.dryRun)'));
    expect(index.indexOf('const quality = evaluateCaduPublishQuality')).toBeLessThan(index.indexOf('admin.from("posts").insert'));
  });

  test('mantem o limiar configuravel fail-closed e o codigo de bloqueio estavel', () => {
    const util = r('supabase/functions/cadu-publish/util.ts');
    expect(util).toContain('export const DEFAULT_AUTO_PUBLISH_SCORE_MIN = 0.7');
    expect(util).toContain('export function resolveAutoPublishScoreMin');
    expect(util).toContain('parsed >= 0 && parsed <= 1');
    expect(index).toContain('resolveAutoPublishScoreMin(Deno.env.get("AUTO_PUBLISH_SCORE_MIN"))');
    expect(index).toContain('block("score_below_auto_publish_threshold")');
    expect(index).toContain('autoPublishScoreMin: AUTO_PUBLISH_SCORE_MIN');
    expect(index).not.toContain('block(`score_below_${');
  });

  test('publica com dedup e upload de imagem com fallback', () => {
    expect(index).toContain('findExisting');
    expect(index).toContain('code: "DUPLICATE"');
    expect(index).toContain('uploadCover');
    expect(index).toContain('prepareFinalImages');
    expect(index).toContain('applyImages');
    expect(index).toContain('post-media/');
    expect(index).toContain('gallery_image_urls');
    expect(index).toContain('sort_order: index');
  });

  test('mapper preenche data_fim_evento, modalidade e merge profundo', () => {
    expect(mapper).toContain('data_fim_evento');
    expect(mapper).toContain('modalidadeTrabalho');
    expect(mapper).toContain('resolveWorkMode');
    expect(mapper).toContain('deepMergeMetadata');
  });

  test('mapper normaliza deadline_date para oportunidades', () => {
    expect(mapper).toContain('resolveOpportunityDeadline');
    expect(mapper).toContain('extractDeadlineFromText');
    expect(mapper).toContain('deadline_date: deadlineDate');
    expect(mapper).toContain('deadlinePriority');
  });

  test('mapper preserva descricao formatada e metadata de CTA do formatador', () => {
    expect(schema).toContain('formattedDescription?: string');
    expect(schema).toContain('score?: number | string');
    expect(schema).toContain('dates?: Record<string, unknown>');
    expect(schema).toContain('enrichmentCheckedAt?: string');
    expect(mapper).toContain('isUsefulFormattedDescription');
    expect(mapper).toContain('stripCmsCreditLines');
    expect(mapper).toContain('item.formattedDescription');
    expect(mapper).toContain('actionLabel');
    expect(mapper).toContain('actionKey');
    expect(mapper).toContain('inferActionLabel');
  });

  test('mapper importa o normalizador usado pelos titulos formatados', () => {
    const util = r('supabase/functions/cadu-publish/util.ts');
    const utilImport = mapper.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/util\.ts"/);
    expect(util).toContain('export function stripTrailingEllipsis');
    expect(utilImport).not.toBeNull();
    expect(utilImport[1]).toMatch(/\bstripTrailingEllipsis\b/);
    expect(mapper).toContain('stripTrailingEllipsis(item.formattedTitle || item.formatted_title || item.title || "")');
  });

  test('nao persiste CDN temporaria ou SVG como imagem final quando upload falha', () => {
    const util = r('supabase/functions/cadu-publish/util.ts');
    expect(util).toContain('canPersistExternalImageUrl');
    expect(util).toContain('cdninstagram');
    expect(util).toContain('isSvgUrl');
    expect(index).toContain('canPersistExternalImageUrl(candidate)');
    expect(mapper).toContain('MAX_IMAGE_COUNT');
    expect(mapper).toContain('item.imageUrl');
    expect(mapper).toContain('gallery_image_urls');
  });

  test('limita a galeria canonica do endpoint a seis imagens', () => {
    expect(mapper).toContain('export const MAX_IMAGE_COUNT = 6');
    expect(index).toMatch(/import\s*\{[^}]*MAX_IMAGE_COUNT[^}]*\}\s*from "\.\/mapper\.ts"/s);
    expect(index).toContain('.slice(0, MAX_IMAGE_COUNT)');
    expect(mapper).toContain('.slice(0, MAX_IMAGE_COUNT)');
  });

  test('schema cobre os 6 modulos', () => {
    ['eventos', 'oportunidades', 'moradia', 'compra-venda', 'caronas', 'achados-perdidos'].forEach((m) => {
      expect(schema).toContain(`"${m}"`);
    });
  });

  test('taxonomia do Edge publisher e fail-closed e mantem aliases por modulo', () => {
    expect(schema).toContain('export const CATEGORY_DEFINITIONS');
    expect(schema).toContain('export const SECONDARY_DEFINITIONS');
    expect(schema).toContain('normalizeCategoryForModule');
    expect(schema).toContain('normalizeSecondaryForModule');
    expect(schema).toContain("'category' obrigatoria");
    expect(schema).toContain('category invalida para module');
    expect(schema).toContain('grupo secundario obrigatorio');
    expect(schema).toContain('grupo secundario conflitante para module');
    expect(schema).toContain('Object.prototype.hasOwnProperty.call(item, alias)');
    expect(schema).not.toContain('DEFAULT_CATEGORY');
    expect(mapper).not.toContain('DEFAULT_CATEGORY');
    expect(mapper).toContain('category invalida ou ausente para module');
    expect(mapper).toContain('grupo secundario invalido ou ausente para module');
    expect(mapper).toContain('isModuleTaxonomyTag');
    expect(mapper).toContain('buildTaxonomyEditPatch');
    expect(mapper).toContain('validateCompraVendaPrimaryMetadataAliases');
    expect(mapper).toContain('subcategoryKey: categoryKey');
    expect(index).toContain('export async function handlePublish');

    const edit = index.slice(index.indexOf('function handleEdit'), index.indexOf('// Troca de imagens'));
    expect(edit).toContain('normalizeCategoryForModule(current.module, requestedCategory)');
    expect(edit).toContain('categoriesForModule(current.module)');
    expect(edit).toContain('buildTaxonomyEditPatch(');
    expect(edit).toContain('update.metadata = taxonomy.metadata');
    expect(mapper).toContain('categoriaKey: categoryKey');
    expect(mapper).toContain('categoriaLabel: categoryText');
    expect(mapper).toContain('categoryLabel: categoryText');
    expect(mapper).toContain('actionKey: secondaryKey');
    expect(mapper).toContain('housingTypeKey: categoryKey');
  });

  test('review usa exclusivamente a fila transacional dedicada e nunca toca publicações', () => {
    const start = index.indexOf('async function handleReview');
    const end = index.indexOf('// ── edit', start);
    const handler = index.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(handler).toContain('parseInstitutionalReview(body)');
    expect(handler).toContain('admin.rpc(');
    expect(handler).toContain('"kc_create_institutional_source_review"');
    expect(handler).toContain('institutionalReviewRpcArguments(review, userId)');
    expect(handler).toContain('institutionalReviewRowMatches(rows[0], review, userId)');
    expect(handler).toContain('pendingInstitutionalReviewResponse(review, rows[0])');
    expect(handler).not.toContain('.from("posts")');
    expect(handler).not.toContain('mapItemToPost(');
    expect(handler).not.toContain('findExisting(');
    expect(handler).not.toContain('status: "published"');
    expect(handler).not.toContain('applyImages(');
    expect(handler).not.toContain('audit(');
    expect(index).toContain('review_id: persisted.id');
    expect(index).toContain('published: false');
  });

  test('review exige identidade canônica vinculada às revisões e chave idempotente determinística', () => {
    expect(review).toContain('INSTITUTIONAL_REVIEW_POLICY_CODE = "INSTITUTIONAL_SOURCE_REVIEW"');
    expect(review).toContain('body.source_id');
    expect(review).toContain('body.source_url');
    expect(review).toContain('body.content_url');
    expect(review).toContain('body.instagram_handle');
    expect(review).toContain('body.source_revision');
    expect(review).toContain('body.registry_sha256');
    expect(review).toMatch(/institutionalReviewIdempotencyKey\(\s*sourceId,\s*sourceRevision,/);
    expect(review).toContain('institutionalReviewRpcArguments');
    expect(review).toContain('p_source_id: review.sourceId');
    expect(review).not.toContain('module: "oportunidades"');
    expect(review).not.toContain('formattedDescription');
  });

  test('fila institucional permanece desabilitada por padrão até migração e rollout explícito', () => {
    expect(index).toContain('Deno.env.get("CADU_INSTITUTIONAL_REVIEW_ENABLED") === "1"');
    expect(index).toContain('if (!INSTITUTIONAL_REVIEW_ENABLED)');
    expect(index).toContain('code: "REVIEW_DISABLED"');
    expect(index).toContain('return await handleReview(admin, user.id, body)');
  });

  test('expõe capability read-only autenticada para provar o rollout da fila', () => {
    expect(index).toContain('case "capabilities"');
    expect(index).toContain('cadu-publish-capabilities-v1');
    expect(index).toContain('institutionalReviewEnabled: INSTITUTIONAL_REVIEW_ENABLED');
    expect(index).toContain('reviewPolicyCode: INSTITUTIONAL_REVIEW_POLICY_CODE');
    expect(index).toContain('createReviewRpc: "kc_create_institutional_source_review"');
    expect(index.indexOf('isTrustedPublisher(admin, user.id)'))
      .toBeLessThan(index.indexOf('case "capabilities"'));
  });
});

describe('Cadu institutional review — durable database and admin proxy', () => {
  const migration = r('supabase/migrations/20260714204500_cadu_institutional_review_pending.sql');
  const proxy = r('api/cadu/publish.js');

  test('database isola a revisão em fila tipada e serializa retry, fonte e limite', () => {
    expect(migration).toContain('create table if not exists public.cadu_institutional_source_reviews');
    expect(migration).not.toContain('alter table public.posts');
    expect(migration).not.toContain('insert into public.posts');
    expect(migration).toContain('cadu_institutional_reviews_idempotency_uq');
    expect(migration).toContain('cadu_institutional_reviews_source_revision_uq');
    expect(migration).toContain('cadu_institutional_reviews_one_pending_source_uq');
    expect(migration).toContain("where state = 'pending'");
    expect(migration).toContain('kc_guard_cadu_institutional_review');
    expect(migration).toContain('cadu_review_envelope_is_immutable');
    expect(migration).toContain('cadu_review_terminal_state_is_immutable');
    expect(migration).toContain('kc_create_institutional_source_review');
    expect(migration).toContain('kc_resolve_institutional_source_review');
    expect(migration).toContain("'cadu-review-key:' || p_idempotency_key");
    expect(migration).toContain("'cadu-review-source:' || p_source_id");
    expect(migration).toContain("'cadu-review-rate:' || p_requested_by::text");
    expect(migration).toContain('if v_rate_count >= 60 then');
    expect(migration).toContain('v_existing.requested_by is distinct from p_requested_by');
    expect(migration).toContain("'cadu_institutional_source_review_requested'");
    expect(migration).toContain("'cadu_institutional_source_review_' || p_decision");
    expect(migration).toContain('alter table public.cadu_institutional_source_reviews enable row level security');
    expect(migration).toContain('grant execute on function public.kc_create_institutional_source_review');
    expect(migration).toContain('grant execute on function public.kc_resolve_institutional_source_review');
    // Follow-up migration satisfies advisor rls_enabled_no_policy with admin SELECT only.
    const rlsPolicyMigration = r('supabase/migrations/20260720160000_cadu_institutional_reviews_rls_policy.sql');
    expect(rlsPolicyMigration).toContain('cadu_institutional_source_reviews_admin_select');
    expect(rlsPolicyMigration).toContain('kc_is_admin((select auth.uid()))');
    expect(rlsPolicyMigration).toContain('grant select on table public.cadu_institutional_source_reviews');
  });

  test('proxy forwards the exact review envelope while retaining legacy publish', () => {
    [
      'action', 'intent', 'source_id', 'source_url', 'content_url',
      'instagram_handle', 'content_kind', 'idempotency_key',
      'source_revision', 'registry_sha256', 'name', 'note', 'tier',
      'category', 'source',
    ].forEach((field) => expect(proxy).toContain(`${field}:`));
    expect(proxy).toContain("action === 'review'");
    expect(proxy).toContain("source: REVIEW_POLICY.origin");
    expect(proxy).toContain('body: JSON.stringify(upstreamBody)');
    expect(proxy).toContain("body.source || 'cadu-admin'");
    expect(proxy).toContain('instagram: body.instagram || null');
  });

  test('proxy normalizes a valid review and rejects mismatched content/revision identity', () => {
    const build = Function(
      '"use strict";\n' +
      "const REVIEW_POLICY = Object.freeze({ intent:'review', contentKind:'institutional_site', origin:'cadu-admin-map-ufg' });\n" +
      'const UNSAFE_REVIEW_NOTE_CONTROL = /[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/u;\n' +
      functionSource(proxy, 'canonicalReviewNote') + '\n' +
      functionSource(proxy, 'canonicalHttpsUrl') + '\n' +
      functionSource(proxy, 'institutionalReviewPayload') + '\n' +
      'return institutionalReviewPayload;',
    )();
    const revision = 'b'.repeat(64);
    const input = {
      action: 'review', intent: 'review', content_kind: 'institutional_site',
      source_id: 'web.ufg.portal', source_url: 'https://ufg.br/', content_url: 'https://ufg.br/',
      instagram_handle: 'ufg_oficial', source_revision: revision, registry_sha256: 'a'.repeat(64),
      idempotency_key: `map-ufg-review:web.ufg.portal:${revision}`,
      name: 'UFG — Universidade Federal de Goiás', note: null, tier: 1,
      category: 'university', source: 'cadu-admin-map-ufg',
    };
    expect(build(input)).toEqual({ payload: input });
    expect(build({ ...input, content_url: 'https://outra.ufg.br/' })).toEqual({
      error: 'content_url deve coincidir com source_url nesta política',
    });
    expect(build({ ...input, source_revision: 'c'.repeat(64) }).error).toMatch(/idempotency_key/);
    const multiline = 'Linha 1\n\tLinha 2\rLinha 3';
    expect(build({ ...input, note: multiline }).payload.note).toBe(multiline);
    expect(build({ ...input, note: 'inválida\u0000' }).error).toMatch(/note inválida/);
  });

  test('follow-up migration aligns multiline note controls without weakening other fields', () => {
    const multilineMigration = r(
      'supabase/migrations/20260722183000_allow_cadu_review_multiline_notes.sql',
    );
    expect(multilineMigration).toContain(
      'drop constraint if exists cadu_institutional_source_reviews_contract_check',
    );
    expect(multilineMigration).toContain(
      "note !~ E'[\\\\x01-\\\\x08\\\\x0B\\\\x0C\\\\x0E-\\\\x1F\\\\x7F]'",
    );
    expect(multilineMigration).toContain(
      'cadu_institutional_source_reviews_resolution_note_control_check',
    );
    expect(multilineMigration).toContain("name !~ '[[:cntrl:]]'");
    expect(multilineMigration).toContain("category !~ '[[:cntrl:]]'");
  });

  test('readiness probe proves the queue, constraints, RLS and service-only RPC boundary', () => {
    const readinessMigration = r(
      'supabase/migrations/20260722190000_cadu_review_contract_probe.sql',
    );
    expect(readinessMigration).toContain(
      'create or replace function public.kc_cadu_review_contract()',
    );
    expect(readinessMigration).toContain("'cadu-institutional-review-v1'");
    [
      'reviewTable', 'reviewConstraints', 'reviewIndexes', 'reviewRlsPolicy',
      'reviewTableAcl', 'reviewGuardTrigger', 'reviewCreateRpc',
      'reviewResolveRpc', 'reviewDependencies',
    ].forEach((check) => expect(readinessMigration).toContain(`'${check}'`));
    expect(readinessMigration).toContain('function_row.proargnames[1:15]');
    expect(readinessMigration).toContain('function_row.proargnames[1:6]');
    expect(readinessMigration).toContain("'p_expected_meta_revisions'");
    expect(readinessMigration).toContain('pg_catalog.md5(function_row.prosrc)');
    expect(readinessMigration).toContain('pg_catalog.pg_get_function_result(function_row.oid)');
    expect(readinessMigration).toMatch(
      /from pg_catalog[.]pg_trigger as trigger_row[\s\S]*not trigger_row[.]tgisinternal[\s\S]*\) = 1/,
    );
    expect(readinessMigration).toContain("pg_catalog.to_regprocedure('kc_private.kc_is_admin(uuid)')");
    expect(readinessMigration).toContain("function_row.prosecdef");
    expect(readinessMigration).toContain(
      'revoke all on function public.kc_cadu_review_contract()',
    );
    expect(readinessMigration).toContain(
      'grant execute on function public.kc_cadu_review_contract()',
    );
    expect(readinessMigration).not.toMatch(/insert\s+into|update\s+public[.]|delete\s+from/i);
  });

  test('privacy follow-up keeps the review probe fail-closed on the expanded contract', () => {
    const erasureMigration = r(
      'supabase/migrations/20260728183022_data_subject_requests_and_export.sql',
    );
    const authorizationMigration = r(
      'supabase/migrations/20260728234000_internal_rpc_authorization_hardening.sql',
    );
    const reconciliationMigration = r(
      'supabase/migrations/20260801100000_reconcile_cadu_review_probe_with_privacy_guards.sql',
    );

    expect(erasureMigration).toContain('alter column requested_by drop not null');
    expect(erasureMigration).toContain(
      'foreign key (requested_by) references public.profiles(id) on delete set null',
    );
    expect(erasureMigration).toContain('kc_active_session_write_guard');
    expect(erasureMigration).toContain('kc_active_session_restrictive');
    expect(authorizationMigration).toContain(
      'create or replace function public.kc_is_admin(p_user_id uuid)',
    );
    expect(authorizationMigration).toMatch(
      /function public[.]kc_is_admin[\s\S]*security definer/,
    );

    expect(reconciliationMigration).toContain(
      'create or replace function public.kc_cadu_review_contract()',
    );
    expect(reconciliationMigration).toContain(
      "('requested_by'::name, 'pg_catalog.uuid'::regtype, false, null::text)",
    );
    expect(reconciliationMigration).toContain("policy_row.polname = 'kc_active_session_restrictive'");
    expect(reconciliationMigration).toContain("trigger_row.tgname = 'kc_active_session_write_guard'");
    expect(reconciliationMigration).toContain("'public.kc_is_operator(uuid)'");
    expect(reconciliationMigration).toContain("'public.kc_is_current_session_active()'");
    expect(reconciliationMigration).toContain('select pg_catalog.count(*) = 2');
    expect(reconciliationMigration).not.toContain("'kc_private.kc_is_admin(uuid)'");
    expect(reconciliationMigration).not.toMatch(
      /insert\s+into|update\s+public[.]|delete\s+from/i,
    );
  });

  test('resolution uses a source-scoped metadata CAS and removes the unsafe v1 overload', () => {
    const expandMigration = r(
      'supabase/migrations/20260722184500_cadu_review_resolution_cas_v2.sql',
    );
    const cleanupMigration = r(
      'supabase/migrations/20260722185500_remove_legacy_cadu_review_resolution_rpc.sql',
    );
    expect(expandMigration).toContain('p_expected_meta_revisions jsonb');
    expect(expandMigration).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(expandMigration).toContain("'kino-campus:cadu-source:v1:' || v_source_id");
    expect(expandMigration).toContain('from public.kc_unit_meta as meta');
    expect(expandMigration).toContain("raise sqlstate 'PT412'");
    expect(expandMigration).toContain(
      "p_decision is null or p_decision not in ('approved', 'rejected', 'superseded')",
    );
    expect(expandMigration).toContain(
      'v_review.source_revision is distinct from p_expected_source_revision',
    );
    expect(cleanupMigration).toContain(
      'drop function public.kc_resolve_institutional_source_review',
    );
    expect(cleanupMigration).toContain('uuid, text, text, text, uuid');
    expect(cleanupMigration).toContain(
      "'public.kc_resolve_institutional_source_review(uuid,text,text,text,uuid,jsonb)'",
    );
    expect(cleanupMigration).toContain("function_row.proname = 'kc_resolve_institutional_source_review'");
  });
});

describe('Cadu publish — cliente de referencia', () => {
  let client;
  beforeAll(() => {
    client = r('services/cadu-ufg-publisher/scripts/publish_via_endpoint.example.js');
  });

  test('chama o endpoint cadu-publish autenticando a conta do Cadu', () => {
    expect(client).toContain('/functions/v1/cadu-publish');
    expect(client).toContain('signInWithPassword');
    expect(client).toContain('SUPABASE_ANON_KEY');
    expect(client).toContain('async function caduPublishIfNew');
    expect(client).toContain("code === 'QUALITY_BLOCKED'");
    expect(client).toContain("sourceId: item.sourceId, sourceUrl: item.sourceUrl");
  });

  test('NAO referencia a service_role no cliente', () => {
    expect(client).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(client).not.toMatch(/service_role['"]\s*\)/);
  });

  test('todo publish literal do demo informa uma categoria obrigatoria valida', () => {
    const payloads = Array.from(
      client.matchAll(/const\s+(\w+)\s*=\s*await\s+caduPublish\(\{([\s\S]*?)\n\s*\}\);/g),
      match => ({ name: match[1], body: match[2] }),
    );
    expect(payloads.map(payload => payload.name)).toEqual(['evento', 'vaga']);
    for (const payload of payloads) {
      expect(payload.body).toMatch(/\bmodule:\s*'[^']+'/);
      expect(payload.body).toMatch(/\bcategory:\s*'[^']+'/);
    }
    expect(payloads[0].body).toMatch(/\bmodule:\s*'eventos'/);
    expect(payloads[0].body).toMatch(/\bcategory:\s*'academicos'/);
    expect(payloads[1].body).toMatch(/\bmodule:\s*'oportunidades'/);
    expect(payloads[1].body).toMatch(/\bcategory:\s*'empregos'/);
    expect(payloads[1].body).toMatch(/\btype:\s*'emprego'/);
  });
});

describe('posts.author_id default = auth.uid()', () => {
  test('migration define o default auth.uid() para author_id', () => {
    const sql = r('supabase/migrations/_archive-v75/20260530130000_posts_author_id_default_authuid.sql');
    expect(sql).toMatch(/alter table public\.posts\s+alter column author_id set default auth\.uid\(\)/i);
  });
});
