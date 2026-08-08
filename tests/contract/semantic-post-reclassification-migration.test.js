'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_NAME = '20260808152900_semantic_post_reclassification.sql';
const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations', MIGRATION_NAME), 'utf8');
const proof = fs.readFileSync(path.join(ROOT, 'tests/sql/semantic-post-reclassification-proof.sql'), 'utf8');
const replayProof = fs.readFileSync(path.join(ROOT, 'tests/sql/semantic-post-reclassification-replay-proof.sql'), 'utf8');
const runner = fs.readFileSync(path.join(ROOT, 'scripts/test-semantic-post-reclassification.js'), 'utf8');

function parseSpecifications() {
  const rows = [];
  const pattern = /^\s*\('([0-9a-f-]{36})'::uuid,\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/gm;
  for (const match of migration.matchAll(pattern)) {
    rows.push({
      id: match[1],
      currentModule: match[2],
      currentCategory: match[3],
      currentStatus: match[4],
      targetModule: match[5],
      targetCategory: match[6],
      targetLabel: match[7],
      targetStatus: match[8],
    });
  }
  return rows;
}

describe('semantic post reclassification migration', () => {
  const specifications = parseSpecifications();

  test('executa depois das migrations de taxonomia e busca', () => {
    expect(MIGRATION_NAME > '20260808152845_align_feed_cursor_remote_search_20260808.sql').toBe(true);
  });

  test('declara 49 UUIDs completos, únicos e sources auditados para alvos independentes', () => {
    const fingerprintIds = Array.from(
      migration.matchAll(/set current_touched_fingerprint = .*? where id = '([0-9a-f-]{36})'::uuid;/g),
      match => match[1],
    );

    expect(specifications).toHaveLength(49);
    expect(new Set(specifications.map(row => row.id)).size).toBe(49);
    expect(fingerprintIds).toHaveLength(49);
    expect(new Set(fingerprintIds).size).toBe(49);
    expect(new Set(fingerprintIds)).toEqual(new Set(specifications.map(row => row.id)));
    expect(migration).not.toMatch(/'[0-9a-f]{8}'::uuid/);
    expect(migration).toContain('target_touched_fingerprint jsonb');
    expect(migration).toContain('kc_semantic_metadata_from_touched_fingerprint_20260808');
    expect(migration).toContain('spec.current_touched_fingerprint');
    expect(migration).toContain('alter column target_touched_fingerprint set not null');

    const targetGeneration = migration.slice(
      migration.indexOf('-- Freeze one target fingerprint per UUID'),
      migration.indexOf('alter table pg_temp.kc_semantic_post_reclassification_20260808'),
    );
    expect(targetGeneration).toContain('set target_touched_fingerprint');
    expect(targetGeneration).not.toMatch(/(?:from|join)\s+public\.posts/i);
    expect(targetGeneration).not.toContain('p.metadata');
  });

  test('codifica as contagens editoriais auditadas sem classificador heurístico', () => {
    expect(specifications.filter(row => row.currentModule !== row.targetModule)).toHaveLength(5);
    expect(specifications.filter(row => row.currentModule !== row.targetModule || row.currentCategory !== row.targetCategory)).toHaveLength(45);
    expect(specifications.filter(row => row.currentStatus !== row.targetStatus)).toHaveLength(4);
    expect(specifications.filter(row => row.targetStatus === 'published')).toHaveLength(45);
    expect(specifications.filter(row => row.targetStatus === 'hidden')).toHaveLength(3);
    expect(specifications.filter(row => row.targetStatus === 'closed')).toHaveLength(1);
    expect(migration).not.toMatch(/similarity|levenshtein|regexp_matches|websearch|ts_rank/i);
  });

  test('mantém cinco movimentos e quatro estados alvo explícitos', () => {
    expect(migration).toContain("'2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid, 'eventos', 'academicos', 'published', 'oportunidades', 'concursos', 'Concursos', 'published'");
    expect(migration).toContain("'84f595c9-e601-412b-bf10-263284bbe81d'::uuid, 'oportunidades', 'editais', 'published', 'eventos', 'congressos', 'Congressos', 'published'");
    expect(migration).toContain("'f75602ca-76a2-4cea-b368-3e45cc995816'::uuid, 'oportunidades', 'editais', 'published', 'oportunidades', 'editais', 'Editais', 'closed'");
    expect(migration).toContain("'b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'workshops', 'Workshops', 'hidden'");
  });

  test('faz no-op apenas no schema vazio e exige cardinalidade 49 no banco não vazio', () => {
    const validationIndex = migration.indexOf('for update;');
    const updateIndex = migration.indexOf('update public.posts p');

    expect(updateIndex).toBeGreaterThan(validationIndex);
    expect(migration).toContain('select count(*) into v_existing_posts from public.posts');
    expect(migration).toContain('if v_existing_posts = 0 then');
    expect(migration).toContain('expected all 49 audited posts; missing %s');
    expect(migration).toContain("errcode = 'KC002'");
    expect(migration).toContain('v_found_posts <> 49');
    expect(migration).not.toMatch(/if not found then\s+continue;/);
  });

  test('bloqueia terceiro estado com lógica null-safe antes da primeira escrita', () => {
    expect(migration).toContain('v_current_fingerprint is not distinct from v_spec.current_touched_fingerprint');
    expect(migration).toContain('v_current_fingerprint is not distinct from v_spec.target_touched_fingerprint');
    expect(migration).toContain('is distinct from spec.target_touched_fingerprint');
    expect(migration).toContain('if v_is_current is not true and v_is_target is not true then');
    expect(migration).toContain("errcode = 'KC001'");
    expect(migration).toContain('semantic post reclassification aborted: unexpected state');
    expect(migration).not.toContain('v_expected_metadata');
  });

  test('gateia os três triggers que materializam canonicalização, updated_at e audit', () => {
    for (const trigger of [
      'kc_posts_set_updated_at',
      'trg_audit_posts_status',
      'trg_posts_canonicalize_feed_fields',
    ]) {
      expect(migration).toContain(`'${trigger}'`);
    }
    expect(migration).toContain("v_enabled not in ('O', 'A')");
    expect(migration).toContain("errcode = 'KC003'");
    expect(migration.match(/perform pg_temp\.kc_assert_semantic_post_triggers_20260808\(\)/g)).toHaveLength(2);
  });

  test('sincroniza as seis superfícies de categoria e a identidade de módulo', () => {
    for (const field of ['category', 'categoryKey', 'categoriaKey']) {
      expect(migration).toContain(`jsonb_set(v_meta, '{${field}}', to_jsonb(p_target_category), true)`);
    }
    for (const field of ['categoryLabel', 'categoria', 'categoriaLabel']) {
      expect(migration).toContain(`jsonb_set(v_meta, '{${field}}', to_jsonb(p_target_category_label), true)`);
    }
    expect(migration).toContain("jsonb_set(v_meta, '{module}', to_jsonb(p_target_module), true)");
    expect(migration).toContain("'categoryLabel', 'categoria', 'categoriaLabel', 'tags', 'tagKeys'");
  });

  test('reescreve tags e tagKeys preservando ordem e duplicatas não relacionadas', () => {
    expect(migration).toContain('kc_semantic_rewrite_text_array_20260808');
    expect(migration).toContain('Preserve unrelated entries byte-for-byte and in their original order');
    expect(migration).toContain('tags and tagKeys must be JSON arrays when present');
    expect(migration).toContain('p_target_category_label');
    expect(migration).toContain('p_target_category');
    expect(migration).not.toContain('if not v_result @> jsonb_build_array(v_item) then');
  });

  test('limpa resíduos dos cinco movimentos sem apagar gratuito', () => {
    expect(migration).toContain("'eventLocation' - 'event_location'");
    expect(migration).toContain("'areaKey' - 'areaLabel' - 'area'");
    expect(migration).toContain("'subcategory' - 'subcategoryKey' - 'subcategoryLabel'");
    expect(migration).toContain("'subcategoria' - 'subcategoriaKey' - 'subcategoriaLabel'");
    expect(migration).not.toContain("- 'gratuito'");
    expect(replayProof).toContain('event-to-opportunity cleanup or gratuito preservation failed');
    expect(replayProof).toContain('opportunity-to-event cleanup is incomplete');
  });

  test('mantém reparos temporais explícitos e sem inferência', () => {
    expect(migration).toContain("date '2026-09-16', date '2026-09-19', true, date '2026-09-03'");
    expect(migration).toContain("date '2026-10-21', date '2026-10-23', true, date '2026-09-30'");
    expect(migration).toContain("date '2026-08-25', date '2026-08-27', true, date '2026-06-01'");
    expect(migration).toContain("jsonb_set(v_dates, '{eventStartsAt}', to_jsonb(v_start), true)");
    expect(migration).toContain("jsonb_set(v_dates, '{applicationDeadline}', to_jsonb(v_deadline), true)");
  });

  test('proof de produção projeta source/target/misto dinamicamente e rejeita mutantes exatos', () => {
    const includes = proof.match(/\\ir \.\.\/\.\.\/supabase\/migrations\/20260808152900_semantic_post_reclassification\.sql/g) || [];

    expect(includes).toHaveLength(2);
    expect(proof).toMatch(/\bbegin;\s/i);
    expect(proof).toMatch(/\brollback;\s*$/i);
    expect(proof).toContain('expected 49 complete target identities');
    expect(proof).toContain('kc_semantic_pre_states_20260808');
    expect(proof).toContain('was_source');
    expect(proof).toContain('was_target');
    expect(proof).toContain('dynamic status projection');
    expect(proof).toContain('dynamic audit projection');
    expect(proof).toContain('source/target updated_at projection is not exact');
    expect(proof).toContain('to_jsonb(p) is distinct from snapshot.row_json');
    expect(proof).toContain('replay produced audit side effects');
    for (const mutant of [
      'old-category-arrays',
      'old-module-arrays',
      'removed-alias',
      'module-sql-null',
      'label-json-null',
    ]) {
      expect(proof).toContain(`'${mutant}'`);
    }
    expect(proof).toContain("when sqlstate 'KC001'");
    expect(proof).toContain('if sqlerrm <> v_expected_message then');
    expect(proof).not.toContain("set_config('session_replication_role', 'replica', true)");
    expect(proof).not.toContain('requires SET privilege for session_replication_role');
    expect(proof).not.toContain('published -4, hidden +3, closed +1');
    expect(proof).not.toMatch(/alter\s+table\s+public\.posts\s+(?:disable|enable)\s+trigger/i);
  });

  test('proof local executável cobre vazio, cardinalidade, source, misto, target e fixed point', () => {
    const includes = replayProof.match(/\\ir \.\.\/\.\.\/supabase\/migrations\/20260808152900_semantic_post_reclassification\.sql/g) || [];

    expect(includes).toHaveLength(4);
    expect(replayProof).toMatch(/\bbegin;\s/i);
    expect(replayProof).toMatch(/\brollback;\s*$/i);
    for (const marker of ['EMPTY_REPLAY', 'PARTIAL_CARDINALITY', 'MISSING_ONE_CARDINALITY', 'FIRST_FULL_RUN', 'MIXED_SOURCE_TARGET_RUN', 'FIXED_POINT_REPLAY', 'TRIGGER_GUARD_MUTANTS', 'DRIFT_GUARDS']) {
      expect(replayProof).toContain(marker);
    }
    expect(replayProof).toContain('expected exactly 5 module moves');
    expect(replayProof).toContain('expected exactly 4 status changes');
    expect(replayProof).toContain('45 published / 3 hidden / 1 closed');
    expect(replayProof).toContain('expected exactly four audited status transitions');
    expect(replayProof).toContain('expected 49 exact independent target fingerprints');
    expect(replayProof).toContain('mixed run did not converge to 49 exact targets');
    expect(replayProof).toContain('mixed fixture must contain exactly one pending status transition');
    expect(replayProof).toContain("when sqlstate 'KC001'");
    expect(replayProof).toContain("when sqlstate 'KC002'");
    expect(replayProof).toContain("when sqlstate 'KC003'");
    for (const mutant of [
      'deadline-root-missing',
      'deadline-root-json-null',
      'deadline-dates-missing',
      'deadline-dates-json-null',
    ]) {
      expect(replayProof).toContain(`'${mutant}'`);
    }
    for (const trigger of [
      'kc_posts_set_updated_at',
      'trg_audit_posts_status',
      'trg_posts_canonicalize_feed_fields',
    ]) {
      expect(replayProof).toContain(`'${trigger}'`);
    }
    expect(replayProof).toContain("'alter table %I.%I disable trigger %I'");
    expect(replayProof).toContain('required enabled trigger %s on public.posts');
    expect(replayProof).toContain('if v_after is distinct from v_before then');
    expect(replayProof).toContain("v_enabled <> 'O'");
    expect(replayProof).toContain('to_jsonb(p) is distinct from snapshot.row_json');
    expect(replayProof).toContain('replay produced audit side effects');
    expect(replayProof).not.toMatch(/alter\s+table\s+public\.posts\s+(?:disable|enable)\s+trigger/i);
  });

  test('runner local expande includes, usa sessão privilegiada local e prova rollback exato', () => {
    expect(runner).toContain("'-U',\n    'supabase_admin'");
    expect(runner).toContain("entry.startsWith('POSTGRES_PASSWORD=')");
    expect(runner).toContain("'-e',\n    'PGPASSWORD'");
    expect(runner).toContain('Expected exactly 4 semantic migration includes');
    expect(runner).toContain('Semantic replay proof may not commit');
    expect(runner).toContain('may not mutate persistent trigger state');
    expect(runner).toContain('TRIGGER_GUARD_MUTANTS');
    expect(runner).toContain('deadline-dates-json-null');
    expect(runner).toContain("when sqlstate 'KC003'");
    expect(runner).toContain('assertRolledBack(before, readState(database))');
  });
});
