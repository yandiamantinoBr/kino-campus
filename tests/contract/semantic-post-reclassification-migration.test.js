'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_NAME = '20260808152900_semantic_post_reclassification.sql';
const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations', MIGRATION_NAME), 'utf8');
const proof = fs.readFileSync(path.join(ROOT, 'tests/sql/semantic-post-reclassification-proof.sql'), 'utf8');
const replayProof = fs.readFileSync(path.join(ROOT, 'tests/sql/semantic-post-reclassification-replay-proof.sql'), 'utf8');

describe('semantic post reclassification migration', () => {
  test('executa depois das migrations de taxonomia e busca', () => {
    expect(MIGRATION_NAME > '20260808152845_align_feed_cursor_remote_search_20260808.sql').toBe(true);
  });

  test('declara exatamente 49 UUIDs completos e únicos', () => {
    const mappingBlock = migration.slice(
      migration.indexOf('insert into pg_temp.kc_semantic_post_reclassification_20260808'),
      migration.indexOf('-- Audited touched-field fingerprints')
    );
    const ids = Array.from(mappingBlock.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'::uuid/g), match => match[1]);

    expect(ids).toHaveLength(49);
    expect(new Set(ids).size).toBe(49);
    expect(migration).not.toMatch(/'[0-9a-f]{8}'::uuid/);
  });

  test('mantém origem e alvo editoriais explícitos, sem classificador heurístico', () => {
    expect(migration).toContain("'2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid, 'eventos', 'academicos', 'published', 'oportunidades', 'concursos', 'published'");
    expect(migration).toContain("'84f595c9-e601-412b-bf10-263284bbe81d'::uuid, 'oportunidades', 'editais', 'published', 'eventos', 'congressos', 'published'");
    expect(migration).toContain("'f75602ca-76a2-4cea-b368-3e45cc995816'::uuid, 'oportunidades', 'editais', 'published', 'oportunidades', 'editais', 'closed'");
    expect(migration).toContain("'b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'workshops', 'hidden'");
    expect(migration).not.toMatch(/similarity|levenshtein|regexp_matches|websearch|ts_rank/i);
  });

  test('bloqueia terceiro estado antes de escrever e aceita alvo completo no rerun', () => {
    const validationIndex = migration.indexOf('for update;');
    const updateIndex = migration.indexOf('update public.posts p');

    expect(validationIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(validationIndex);
    expect(migration).toContain('v_is_current');
    expect(migration).toContain('v_is_target');
    expect(migration).toContain('v_current_fingerprint is not distinct from v_spec.current_touched_fingerprint');
    expect(migration).toContain('v_post.metadata is not distinct from v_expected_metadata');
    expect(migration).toContain('semantic post reclassification aborted: unexpected state');
    expect(migration).not.toContain('semantic post reclassification aborted: post %s is missing');
    expect(migration).toMatch(/if not found then\s+continue;\s+end if;/);
  });

  test('fixa 49 fingerprints auditados dos campos tocados e prova abort em drift', () => {
    const fingerprintIds = Array.from(
      migration.matchAll(/set current_touched_fingerprint = .*? where id = '([0-9a-f-]{36})'::uuid;/g),
      match => match[1]
    );

    expect(fingerprintIds).toHaveLength(49);
    expect(new Set(fingerprintIds).size).toBe(49);
    expect(migration).toContain('kc_semantic_touched_fingerprint_20260808');
    expect(migration).toContain('where current_touched_fingerprint is null');
    expect(proof).toContain("'{categoryKey}'");
    expect(proof).toContain("'\"drifted\"'::jsonb");
    expect(proof).toContain('perform pg_temp.kc_assert_semantic_post_states_20260808()');
    expect(proof).toContain('touched-field drift was accepted');
  });

  test('sincroniza identidade de metadata e todos os aliases temporais tocados', () => {
    expect(migration).toContain("jsonb_set(v_meta, '{category}', to_jsonb(p_target_category), true)");
    expect(migration).toContain("jsonb_set(v_meta, '{categoryKey}', to_jsonb(p_target_category), true)");
    expect(migration).toContain("jsonb_set(v_meta, '{module}', to_jsonb(p_target_module), true)");
    expect(migration).toContain("jsonb_set(v_meta, '{data_evento}', to_jsonb(v_start), true)");
    expect(migration).toContain("jsonb_set(v_meta, '{data_fim_evento}', to_jsonb(v_end), true)");
    expect(migration).toContain("jsonb_set(v_dates, '{eventStartsAt}', to_jsonb(v_start), true)");
    expect(migration).toContain("jsonb_set(v_dates, '{eventEndsAt}', to_jsonb(v_end), true)");
    expect(migration).toContain("jsonb_set(v_dates, '{applicationDeadline}', to_jsonb(v_deadline), true)");
  });

  test('codifica reparos e limpezas de datas sem inferência', () => {
    expect(migration).toContain("date '2026-09-16', date '2026-09-19', true, date '2026-09-03'");
    expect(migration).toContain("date '2026-10-21', date '2026-10-23', true, date '2026-09-30'");
    expect(migration).toContain("date '2026-08-25', date '2026-08-27', true, date '2026-06-01'");
    expect(migration).toContain("'event_date' - 'eventDate'");
    expect(migration).toContain("'submission_deadline' - 'submissionDeadline'");
  });

  test('remove e proíbe resíduos incompatíveis nos cinco movimentos de módulo', () => {
    expect(migration).toContain("p_target_module = 'oportunidades'");
    expect(migration).toContain("'hora_evento' - 'horaEvento' - 'hora'");
    expect(migration).toContain("'eventType' - 'event_type'");
    expect(migration).toContain("'eventLocation' - 'event_location'");
    expect(migration).toContain("p_target_module = 'eventos'");
    expect(migration).toContain("'areaKey' - 'areaLabel' - 'area'");
    expect(migration).toContain("'workMode' - 'workModeLabel' - 'work_mode' - 'modalidadeTrabalho'");
    expect(migration).toContain("'employmentType' - 'employmentTypeLabel' - 'employment_type' - 'regimeContratacao'");
    expect(migration).toContain("'remuneracao' - 'salary' - 'salario' - 'benefits' - 'beneficios'");
    expect(migration).toContain("'opportunityType' - 'opportunityTypeKey' - 'opportunity_type'");
    expect(proof).toContain('event-to-opportunity cleanup is incomplete');
    expect(proof).toContain('opportunity-to-event cleanup is incomplete');
  });

  test('inclui proof SQL transacional com dois reruns e exemplos críticos', () => {
    const includes = proof.match(/\\ir \.\.\/\.\.\/supabase\/migrations\/20260808152900_semantic_post_reclassification\.sql/g) || [];

    expect(proof).toMatch(/\bbegin;\s/i);
    expect(proof).toMatch(/\brollback;\s*$/i);
    expect(includes).toHaveLength(2);
    expect(proof).toContain('expected 49 complete target identities');
    expect(proof).toContain('event-to-opportunity cleanup is incomplete');
    expect(proof).toContain('fabricated electoral dates remain');
  });

  test('inclui proof isolado de replay vazio, subset, idempotência e drift', () => {
    const includes = replayProof.match(/\\ir \.\.\/\.\.\/supabase\/migrations\/20260808152900_semantic_post_reclassification\.sql/g) || [];

    expect(replayProof).toMatch(/\bbegin;\s/i);
    expect(replayProof).toMatch(/\brollback;\s*$/i);
    expect(includes).toHaveLength(3);
    expect(replayProof).toContain('empty replay unexpectedly created production posts');
    expect(replayProof).toContain('subset replay did not reach the complete target');
    expect(replayProof).toContain('subset replay changed the complete target');
    expect(replayProof).toContain('subset touched-field drift was accepted');
  });
});
