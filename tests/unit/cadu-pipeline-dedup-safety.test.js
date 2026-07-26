'use strict';

const fs = require('fs');
const path = require('path');
const {
  decideDuplicatePair,
  latestRelevantLifecycleDate,
} = require('../../data/.openclaw/workspace/scripts/lib/post-identity.js');
const {
  decidePostReactivation,
  reactivationBlockReason,
} = require('../../data/.openclaw/workspace/scripts/lib/post-reactivation.js');

function post(title, metadata = {}, extra = {}) {
  return { title, metadata, ...extra };
}

describe('Cadu deterministic post identity', () => {
  test.each([
    [
      'PPGNUT site and Instagram',
      post('PPGNUT abre inscrições para aluno especial 2026/2', {
        deadline_date: '2026-08-10',
      }),
      post('Aluno Especial no PPGNUT: inscrições abertas para 2026/2', {
        deadline_date: '2026-08-10',
      }),
    ],
    [
      'CERISE across modules and sources',
      post('CERISE SUMMIT 2026: integração tecnológica e institucional na EMC', {
        deadline_date: '18/09/2026',
      }),
      post('CERISE Summit 2026: Tecnologia e Inovação na EMC UFG', {
        deadline_date: '2026-09-18',
      }),
    ],
    [
      'PPGMTSP official and aggregator',
      post('PPGMTSP abre inscrições para mestrado e doutorado até 16 de agosto', {
        deadline_date: '2026-08-16',
      }),
      post('PPGMTSP abre vagas para mestrado e doutorado', {
        deadline_date: '2026-08-16',
      }),
    ],
  ])('auto-hides the known duplicate pair: %s', (_label, left, right) => {
    const decision = decideDuplicatePair(left, right);
    expect(decision.autoHide).toBe(true);
    expect(decision.conflicts).toEqual([]);
  });

  test('a date shared across different semantic roles is review-only', () => {
    const decision = decideDuplicatePair(
      post('XXX Semana de Filosofia da FAFIL/UFG — debates sobre poder, violência e crítica ao progresso', {
        deadline_date: '11/08/2026',
      }),
      post('XXX Semana de Filosofia debate poder, violência e crítica ao progresso', {
        date_start: '2026-08-11',
      }),
    );
    expect(decision.autoHide).toBe(false);
    expect(decision.signals.dates.exactAny).toEqual(['2026-08-11']);
    expect(decision.signals.dates.corroborated).toBe(false);
  });

  test('title-only similarity remains review-only without independent evidence', () => {
    const decision = decideDuplicatePair(
      post('Instituto Confúcio UFG: matrículas abertas em agosto — Mandarim, Tai Chi e Medicina Chinesa'),
      post('Instituto Confúcio da UFG abre matrículas para cursos de mandarim e medicina chinesa em agosto'),
    );
    expect(decision.autoHide).toBe(false);
    expect(decision.review).toBe(true);
  });

  test('same institutional image is only supporting evidence for different English courses', () => {
    const decision = decideDuplicatePair(
      post('Inglês: Compreensão oral – estratégias (A2) com inscrições até 30/07', {
        deadline_date: '2026-07-30',
      }),
      post('Curso de Inglês: Compreensão Oral – Palestras e Aulas (A2)', {
        deadline_date: '2026-07-31',
      }),
      { sameImage: true },
    );
    expect(decision.autoHide).toBe(false);
    expect(decision.review).toBe(true);
    expect(decision.reasons).toContain('same_image_supporting_only');
  });

  test('same UFG image does not merge unrelated events', () => {
    const decision = decideDuplicatePair(
      post('20º Seminário Nacional da SBHC começa amanhã na UFG', {
        deadline_date: '27/07/2026',
      }),
      post('II Enlic-CO, VIII Eleb e II Encontro de Pesquisa do Prolicen', {
        deadline_date: '16/09/2026',
      }),
      { sameImage: true },
    );
    expect(decision.autoHide).toBe(false);
  });

  test('different graduate programs are a hard conflict despite title and date similarity', () => {
    const decision = decideDuplicatePair(
      post('Aluno especial no PPGS 2026/2', { deadline_date: '2026-08-10' }),
      post('Aluno especial no PPGAC 2026/2', { deadline_date: '2026-08-10' }),
    );
    expect(decision.autoHide).toBe(false);
    expect(decision.conflicts).toContain('different_programs');
  });

  test('different process numbers are a hard conflict', () => {
    const decision = decideDuplicatePair(
      post('Edital 01/2026: seleção de bolsistas CERISE', { deadline_date: '2026-08-10' }),
      post('Edital 02/2026: seleção de bolsistas CERISE', { deadline_date: '2026-08-10' }),
    );
    expect(decision.autoHide).toBe(false);
    expect(decision.conflicts).toContain('different_process_numbers');
  });

  test.each([
    [
      'years',
      post('Curso de francês A2 2026/2'),
      post('Curso de francês A2 2027/2'),
      'different_years',
    ],
    [
      'language levels',
      post('Curso de francês A1 2026/2'),
      post('Curso de francês A2 2026/2'),
      'different_language_levels',
    ],
    [
      'academic terms',
      post('Monitoria FANUT 2026/1'),
      post('Monitoria FANUT 2026/2'),
      'different_academic_terms',
    ],
    [
      'degrees',
      post('Processo seletivo de doutorado em Sociologia 2027'),
      post('Processo seletivo de mestrado em Sociologia 2027'),
      'different_degrees',
    ],
    [
      'employment types',
      post('Concurso para professor efetivo de Química'),
      post('Concurso para professor substituto de Química'),
      'different_employment_types',
    ],
    [
      'lifecycle stages',
      post('Resultado do edital 12/2026 para monitoria'),
      post('Edital 12/2026 abre inscrições para monitoria'),
      'different_lifecycle',
    ],
  ])('different %s are hard conflicts', (_label, left, right, conflict) => {
    const decision = decideDuplicatePair(left, right, { sameImage: true });
    expect(decision.autoHide).toBe(false);
    expect(decision.conflicts).toContain(conflict);
  });

  test('same PPG and date do not merge an aggregate announcement into a specific discipline', () => {
    const decision = decideDuplicatePair(
      post('PPGCPRI abre vagas para aluno especial', {
        deadline_date: '2026-07-31',
      }),
      post('PPGCPRI abre seleção para alunos especiais 2026/2 — disciplina sobre Raça e Antirracismos', {
        deadline_date: '2026-07-31',
      }),
    );
    expect(decision.autoHide).toBe(false);
  });

  test('same event acronym and date do not merge complementary programming posts', () => {
    const decision = decideDuplicatePair(
      post('20º SNHCT: confira a programação de abertura e atividades culturais do dia 27', {
        deadline_date: '2026-07-31',
      }),
      post('Programação completa do 20º SNHCT disponível', {
        deadline_date: '2026-07-31',
      }),
    );
    expect(decision.autoHide).toBe(false);
    expect(decision.review).toBe(false);
  });

  test('same Weby host and slug is deterministic identity', () => {
    const decision = decideDuplicatePair(
      post('CERISE Summit 2026'),
      post('Evento de extensão CERISE Summit 2026'),
      { sameWebyEvent: true },
    );
    expect(decision.autoHide).toBe(true);
    expect(decision.reasons).toContain('same_weby_event');
  });

  test('auto-close uses the date role appropriate to each module', () => {
    expect(latestRelevantLifecycleDate({
      module: 'eventos',
      metadata: {
        dates: {
          eventStartsAt: '2026-08-10',
          eventEndsAt: '2026-08-12',
          applicationDeadline: '2026-07-20',
        },
      },
    })).toBe('2026-08-12');
    expect(latestRelevantLifecycleDate({
      module: 'oportunidades',
      metadata: {
        dates: {
          eventStartsAt: '2026-09-10',
          applicationDeadline: '2026-08-02',
        },
      },
    })).toBe('2026-08-02');
  });

  test('legacy lifecycle fallback ignores malformed untyped dates', () => {
    expect(latestRelevantLifecycleDate({
      module: 'eventos',
      metadata: { dates: { dates: ['2026-07-01', '2026-07-03'] } },
    })).toBe('2026-07-03');
    expect(latestRelevantLifecycleDate({
      module: 'eventos',
      metadata: { dates: { dates: '2026-07-03' } },
    })).toBe('');
  });
});

describe('Cadu publisher reactivation policy', () => {
  test('hidden posts fail closed without explicit approval', () => {
    const current = post('Hidden', {}, { status: 'hidden' });
    expect(reactivationBlockReason(current)).toBe('hidden_requires_explicit_approval');
    expect(decidePostReactivation(current, {
      reactivateIfHidden: true,
      incomingExpiry: '2099-01-01T23:59:59Z',
    }).allowed).toBe(false);
  });

  test('explicit approval is required to reactivate hidden content', () => {
    const current = post('Hidden', {
      cadu_reactivation_allowed: true,
    }, { status: 'hidden' });
    expect(decidePostReactivation(current, {
      reactivateIfHidden: true,
      incomingExpiry: '2099-01-01T23:59:59Z',
    })).toMatchObject({
      allowed: true,
      targetStatus: 'published',
      reason: 'explicit_hidden_reactivation',
    });
  });

  test('dedup and moderation blocks override approval', () => {
    const dedup = post('Dedup', {
      hidden_by_dedup: true,
      cadu_reactivation_allowed: true,
    }, { status: 'hidden' });
    const moderated = post('Moderated', {}, {
      status: 'hidden',
      moderation_reason: 'audit: wrong image',
    });
    expect(reactivationBlockReason(dedup)).toBe('hidden_by_dedup');
    expect(reactivationBlockReason(moderated)).toBe('moderation_reason_present');
  });

  test('auto-closed content can return only with a future semantic expiry', () => {
    const current = post('Closed', {
      closed_by: 'cadu-auto-close',
    }, { status: 'closed' });
    expect(decidePostReactivation(current, {
      incomingExpiry: '2099-01-01T23:59:59Z',
    })).toMatchObject({
      allowed: true,
      targetStatus: 'published',
    });
    expect(decidePostReactivation(current, {
      incomingExpiry: '2020-01-01T23:59:59Z',
    }).allowed).toBe(false);
  });

  test('manual closure cannot be reopened by the pipeline', () => {
    const current = post('Closed', {
      closed_by: 'admin-manual',
    }, { status: 'closed' });
    expect(decidePostReactivation(current, {
      incomingExpiry: '2099-01-01T23:59:59Z',
    })).toMatchObject({
      allowed: false,
      reason: 'manually_closed',
    });
  });
});

describe('Cadu runtime wiring', () => {
  const root = path.resolve(__dirname, '../..');
  const dedup = fs.readFileSync(
    path.join(root, 'data/.openclaw/workspace/scripts/dedup-kino.js'),
    'utf8',
  );
  const publisher = fs.readFileSync(
    path.join(root, 'data/.openclaw/workspace/scripts/publish_auto_v5.js'),
    'utf8',
  );

  test('dedup uses deterministic identity and never treats image alone as proof', () => {
    expect(dedup).toContain("require('./lib/post-identity.js')");
    expect(dedup).toContain('decideDuplicatePair(d.a, d.b, { sameImage: true })');
    expect(dedup).toContain('imagem isolada não prova identidade');
  });

  test('publisher uses the fail-closed reactivation policy', () => {
    expect(publisher).toContain("require('./lib/post-reactivation.js')");
    expect(publisher).toContain("require('./lib/post-identity.js')");
    expect(publisher).toContain('publisherPairDecision(item, post).autoHide');
    expect(publisher).toContain('buildDedupHiddenMetadata(other, winner.id)');
    expect(publisher).toContain('decidePostReactivation(existing');
    expect(publisher).not.toContain('{ reactivateIfHidden: true }');
  });

  test('semantic AI cannot override deterministic conflicts or canonical age', () => {
    expect(dedup).toMatch(/policy\.conflicts\.length\s*>\s*0/);
    expect(dedup).toMatch(/method:\s*['"]stage3_llm_conflict['"]/);
    expect(dedup).toMatch(/const older = postA\.created_at <= postB\.created_at/);
    expect(dedup).toMatch(/keep_id:\s*older\.id/);
  });

  test('dedup hides retain the canonical post and method in metadata', () => {
    expect(dedup).toMatch(/merged_into_post_id:\s*audit\.keepId/);
    expect(dedup).toMatch(/dedup_method:\s*audit\.method/);
    expect(dedup).toMatch(/keepId:\s*a\.keep_id/);
  });
});
