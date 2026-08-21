'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LEGACY_BACKFILL = path.join(ROOT, 'supabase/migrations/20260821042522_backfill_legacy_post_user_tags.sql');
const USER_TAGS = path.join(ROOT, 'assets/js/shared/kc-post-user-tags.shared.js');
const CREATE_CORE = path.join(ROOT, 'assets/js/features/create-post/kc-create-post.js');
const CREATE_SUBMIT = path.join(ROOT, 'assets/js/features/create-post/kc-create-post.submit.js');
const PRODUCT_EDIT = path.join(ROOT, 'assets/js/controllers/public/product.edit.js');
const NORMALIZE = path.join(ROOT, 'assets/js/api/kc-api.posts-normalize.js');

const migration = fs.readFileSync(LEGACY_BACKFILL, 'utf8');
const helper = fs.readFileSync(USER_TAGS, 'utf8');
const createCore = fs.readFileSync(CREATE_CORE, 'utf8');
const createSubmit = fs.readFileSync(CREATE_SUBMIT, 'utf8');
const productEdit = fs.readFileSync(PRODUCT_EDIT, 'utf8');
const normalize = fs.readFileSync(NORMALIZE, 'utf8');

describe('contrato de compatibilidade das Tags legadas', () => {
  test('promove tags legadas sem removê-las nem alterar registros já canônicos', () => {
    expect(migration).toContain("not (coalesce(p.metadata, '{}'::jsonb) ? 'userTags')");
    expect(migration).toContain("'{userTags}'");
    expect(migration).toContain("'{userTagKeys}'");
    expect(migration).toContain("coalesce(p.metadata, '{}'::jsonb)->'tags'");
    expect(migration).not.toMatch(/delete\s+.*(?:tags|tagkeys)/i);
    expect(migration).not.toMatch(/#-\s*'\{(?:tags|tagKeys)\}'/i);
  });

  test('protege o lote contra efeitos colaterais e reativa todos os gatilhos no mesmo contrato', () => {
    expect(migration).toContain("set local lock_timeout = '5s';");
    expect(migration).toContain("set local statement_timeout = '30s';");
    expect(migration).toContain('alter table public.posts disable trigger user;');
    expect(migration).toContain('alter table public.posts enable trigger user;');
    expect(migration.indexOf('disable trigger user')).toBeLessThan(migration.indexOf('update public.posts p'));
    expect(migration.indexOf('update public.posts p')).toBeLessThan(migration.indexOf('enable trigger user'));
  });

  test('mantém histórico acima do limite em edições não relacionadas, mas exige limite em mutação ativa', () => {
    expect(migration).toContain("v_user_tags_changed boolean := tg_op = 'INSERT';");
    expect(migration).toContain("v_user_tags_changed := v_meta->'userTags' is distinct from v_old_meta->'userTags';");
    expect(migration).toContain('if cardinality(v_tags) > v_limit and v_user_tags_changed then');
    expect(helper).toContain('allowExistingOverflow');
    expect(helper).toContain('sameTags');
    expect(createCore).toContain('initialUserTags');
    expect(createSubmit).toContain('allowExistingOverflow: kcCreateState.editMode === true');
    expect(productEdit).toContain('allowExistingOverflow: true');
  });

  test('faz fallback de edição para a lista legada, mas mantém uma limpeza canônica explícita', () => {
    expect(helper).toContain("var legacyCandidates = [");
    expect(helper).toContain("legacy.source = 'legacy';");
    expect(helper).toContain("canonical.source = 'canonical';");
    expect(helper).toContain("[metadata, 'tags']");
  });

  test('normaliza as leituras Supabase e deduplica peso de busca após a cópia', () => {
    expect(normalize).toContain('Array.isArray(meta.tags) ? meta.tags : []');
    expect(migration).toContain('select distinct on (canonical_key) value, position');
    expect(migration).toContain('public.kc_posts_search_tags_text(p_metadata)');
    expect(migration).toContain('reindex index public.idx_posts_fts;');
    expect(migration).toContain('reindex index public.idx_posts_feed_cursor_search_trgm;');
  });
});
