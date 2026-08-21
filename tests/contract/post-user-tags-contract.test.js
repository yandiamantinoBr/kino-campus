'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20260820220000_post_user_tags_contract.sql');
const FIELDS = path.join(ROOT, 'assets/js/features/create-post/kc-create-post.fields.js');
const SUBMIT = path.join(ROOT, 'assets/js/features/create-post/kc-create-post.submit.js');
const CORE = path.join(ROOT, 'assets/js/features/create-post/kc-create-post.js');
const RENDER = path.join(ROOT, 'assets/js/features/create-post/kc-create-post.render.js');
const PRODUCT_EDIT = path.join(ROOT, 'assets/js/controllers/public/product.edit.js');
const PAGES = [
  '_product.html', 'achados-perdidos.html', 'caronas-feed.html', 'compra-venda-feed.html',
  'create-post.html', 'eventos.html', 'index.html', 'moradia.html', 'my-posts.html',
  'ods.html', 'oportunidades.html', 'search-results.html',
];

const migration = fs.readFileSync(MIGRATION, 'utf8');
const fields = fs.readFileSync(FIELDS, 'utf8');
const submit = fs.readFileSync(SUBMIT, 'utf8');
const core = fs.readFileSync(CORE, 'utf8');
const render = fs.readFileSync(RENDER, 'utf8');
const productEdit = fs.readFileSync(PRODUCT_EDIT, 'utf8');

describe('contrato de tags adicionais de post', () => {
  test('mantém tags automáticas separadas e limita apenas a dupla userTags/userTagKeys', () => {
    expect(migration).toContain("v_limit integer := 6");
    expect(migration).toContain("v_limit := case when v_privileged then 12 else 6 end;");
    expect(migration).toContain("'{userTags}'");
    expect(migration).toContain("'{userTagKeys}'");
    expect(migration).not.toMatch(/delete\s+metadata\.tags/i);
  });

  test('protege o banco contra formatos inválidos, chaves forjadas e perda em atualização parcial', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain('post_user_tags_must_be_array');
    expect(migration).toContain('post_user_tag_limit_exceeded');
    expect(migration).toContain("not (v_meta ? 'userTags') and v_old_meta ? 'userTags'");
    expect(migration).toContain('Ignore a caller-supplied key list');
    expect(migration).toContain('trg_posts_user_tags_contract');
  });

  test('inclui as tags na FTS, busca remota e filtro de feed e reindexa expressões imutáveis', () => {
    expect(migration).toContain("->'userTags'");
    expect(migration).toContain("->'userTagKeys'");
    expect(migration).toContain('reindex index public.idx_posts_fts;');
    expect(migration).toContain('reindex index public.idx_posts_feed_cursor_search_trgm;');
    expect(migration).toContain("coalesce(p.metadata->'userTagKeys', '[]'::jsonb)");
    expect(migration).toContain('kc_get_feed_cursor_tag_clause_not_found');
  });

  test('campo é comum a todos os módulos e a UI captura, renderiza e valida o contrato', () => {
    expect(fields).toContain("type: 'user-tags'");
    expect(fields).toContain('maxItems: isAdmin ? 12 : 6');
    expect(render).toContain('data-kc-user-tags-field');
    expect(render).toContain('data-kc-user-tag-add');
    expect(core).toContain('data-kc-user-tags-value');
    expect(core).toContain('KCPostUserTags.read(post).tags');
    expect(submit).toContain('userTagsApi.validate');
    expect(submit).toContain('userTags: userTagsResult.tags');
    expect(submit).toContain('userTagKeys: userTagsResult.tagKeys');
  });

  test('fallback de produto altera apenas a dupla livre e nunca apaga tags automáticas', () => {
    expect(productEdit).toContain('metadata.userTags = userTagsResult.tags;');
    expect(productEdit).toContain('metadata.userTagKeys = userTagsResult.tagKeys;');
    expect(productEdit).not.toContain('delete metadata.tags;');
  });

  test('todas e somente as páginas que carregam o modal carregam o contrato antes do core', () => {
    const discovered = fs.readdirSync(ROOT)
      .filter((name) => name.endsWith('.html'))
      .filter((name) => fs.readFileSync(path.join(ROOT, name), 'utf8').includes('kc-create-post.schema.js'))
      .sort();
    expect(discovered).toEqual(PAGES.slice().sort());
    PAGES.forEach((page) => {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      expect(html).toContain('kc-post-user-tags.shared.js');
      expect(html.indexOf('kc-post-user-tags.shared.js')).toBeLessThan(html.indexOf('kc-create-post.js'));
    });
  });
});
