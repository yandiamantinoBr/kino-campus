const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

jest.useFakeTimers();
jest.setSystemTime(new Date('2026-07-11T12:00:00-03:00'));

const fixture = require('../fixtures/cadu-curator-relevance.v1.json');
const curator = require(path.join(
  __dirname,
  '..',
  '..',
  'data',
  '.openclaw',
  'workspace',
  'scripts',
  'cadu-curador-v4.4.js'
));
const { resolveActionLabel } = require(path.join(
  __dirname,
  '..',
  '..',
  'data',
  '.openclaw',
  'workspace',
  'scripts',
  'lib',
  'curator-action-policy.js'
));

afterAll(() => {
  jest.useRealTimers();
});

describe('OpenClaw curator relevance gate', () => {
  test('uses token boundaries for short lexemes', () => {
    expect(curator.has('petiscos e bebidas', 'pet')).toBe(false);
    expect(curator.has('programa PET Saúde', 'pet')).toBe(true);
    expect(curator.has('frutas selecionadas', 'ru')).toBe(false);
    expect(curator.has('benefício no RU', 'ru')).toBe(true);
  });

  test.each(fixture.cases)('$id', (item) => {
    const result = curator.classifyItem(
      item.title,
      item.text,
      item.html || '',
      item.sourceName,
      item.linkUrl,
      item.jsonItem
    );

    expect(result.decision).toBe(item.expected.decision);
    if (item.expected.module) expect(result.module).toBe(item.expected.module);
    if (item.expected.reason) {
      expect(result.reasons).toContain(item.expected.reason);
      expect(result.gateReason).toBe(item.expected.reason);
    }
    if (Object.hasOwn(item.expected, 'hasDeadline')) {
      expect(result.temporal.hasDeadline).toBe(item.expected.hasDeadline);
    }

    for (const field of [
      'applicationDeadline',
      'applicationOpensAt',
      'applicationStatus',
      'eventStartsAt',
      'eventEndsAt',
      'eventStatus',
      'canApply',
    ]) {
      if (Object.hasOwn(item.expected, field)) {
        expect(result.temporal[field]).toBe(item.expected[field]);
      }
    }

    if (item.expected.canApply === true) {
      expect(result.actionEvidence.length).toBeGreaterThan(0);
    }
  });

  test('keeps explainable date evidence with a role and excerpt', () => {
    const item = fixture.cases.find(({ id }) => id === 'iptsp-future-event-closed-registration');
    const result = curator.classifyItem(
      item.title,
      item.text,
      item.html || '',
      item.sourceName,
      item.linkUrl,
      item.jsonItem
    );

    expect(result.temporal.dateEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-05-18', role: 'applicationDeadline' }),
      expect.objectContaining({ date: '2026-07-20', role: 'eventStartsAt' }),
      expect.objectContaining({ date: '2026-07-31', role: 'eventEndsAt' }),
    ]));
    expect(result.temporal.dateEvidence.every(({ excerpt }) => Boolean(excerpt))).toBe(true);
  });

  test('keeps a relevant summary eligible for detail hydration before final gating', () => {
    const item = fixture.cases.find(({ id }) => id === 'copa-news-with-future-tournament-date');
    const result = curator.classifyItem(
      item.title,
      item.text,
      item.html || '',
      item.sourceName,
      item.linkUrl,
      item.jsonItem
    );

    expect(result.decision).toBe('discard');
    expect(result.shouldHydrate).toBe(true);
  });

  test('hydrates strong edital summaries independently from their initial score', () => {
    const result = curator.classifyItem(
      'Edital 12/2026',
      'Comunicado preliminar; consulte a notícia completa.',
      '',
      'unidade',
      'https://unidade.ufg.br/n/edital-12-2026',
      { created_at: '2026-07-10T10:00:00-03:00', sourceKind: 'news' }
    );

    expect(result.decision).toBe('discard');
    expect(result.shouldHydrate).toBe(true);
  });

  test('preserves Weby timestamps, source kind and structured dates for reclassification', () => {
    const [item] = curator.parseWebyJson({
      news: [{
        id: 42,
        title: 'Chamada atualizada',
        text: 'Conteúdo',
        created_at: '2024-02-01T09:00:00-03:00',
        updated_at: '2026-07-10T09:00:00-03:00',
        source_kind: 'opportunity',
        begin_at: '2026-08-10T09:00:00-03:00',
        end_at: '2026-08-11T18:00:00-03:00',
      }],
    }, 'unidade', 10);

    expect(item).toEqual(expect.objectContaining({
      createdAt: '2024-02-01T09:00:00-03:00',
      updatedAt: '2026-07-10T09:00:00-03:00',
      sourceKind: 'opportunity',
      eventStartsAt: '2026-08-10T09:00:00-03:00',
      eventEndsAt: '2026-08-11T18:00:00-03:00',
    }));
  });

  test('prefers structured calendar dates over noisy date ranges in page text', () => {
    const temporal = curator.analyzeTemporalRelevance(
      'Período do evento: 29 de outubro de 2025 a 31 de outubro de 2026. Data: 13 a 16 de outubro de 2026.',
      '',
      '2025-10-29T11:20:00-03:00',
      {
        eventStartsAt: '2026-10-13T09:00:00-03:00',
        eventEndsAt: '2026-10-16T18:00:00-03:00',
      }
    );

    expect(temporal.eventStartsAt).toBe('2026-10-13');
    expect(temporal.eventEndsAt).toBe('2026-10-16');
    expect(temporal.eventStatus).toBe('upcoming');
  });

  test('does not expose an open-registration CTA for a future event after its deadline', () => {
    expect(resolveActionLabel({
      module: 'eventos',
      actionLabel: 'Inscreva-se',
      dates: { applicationStatus: 'closed', eventStatus: 'upcoming', canApply: false },
    }, 'Inscreva-se pelo formulário')).toBe('Ver detalhes');

    expect(resolveActionLabel({
      module: 'oportunidades',
      dates: { applicationStatus: 'open', canApply: true },
    }, 'Inscreva-se pelo formulário')).toBe('Inscreva-se');

    expect(resolveActionLabel({
      module: 'eventos',
      actionLabel: 'Inscreva-se',
      dates: { applicationStatus: 'open', canApply: false },
    })).toBe('Ver detalhes');

    expect(resolveActionLabel({
      module: 'oportunidades',
      actionLabel: 'Candidate-se',
      dates: { applicationStatus: 'open', canApply: false },
    })).toBe('Saiba mais');
  });

  test('closes an elapsed deadline even when the original notice uses future tense', () => {
    const result = curator.classifyItem(
      'PPGCC publica edital de selecao para alunos especiais - 2026/2',
      'As inscricoes estarao abertas no periodo de 23 de junho de 2026 a 10 de julho de 2026, ate as 16h.',
      '',
      'ppgcc',
      'https://ppgcc.inf.ufg.br/n/201916',
      { created_at: '2026-06-17T07:59:35-03:00', sourceKind: 'news' }
    );

    expect(result.temporal.applicationDeadline).toBe('2026-07-10');
    expect(result.temporal.applicationStatus).toBe('closed');
    expect(result.temporal.canApply).toBe(false);
    expect(result.decision).toBe('discard');
  });

  test('does not reinterpret post-result enrollment as a new public window', () => {
    const result = curator.classifyItem(
      'Processo Seletivo Aluno Especial 2026.2',
      [
        'Inscricao exclusivamente on-line no periodo de 09 a 10/07/2026.',
        'Resultado Final 13/07/2026.',
        'A matricula para aluno especial ocorrera pelo e-mail do programa.',
        'Matricula: dias 06 a 08 de agosto de 2026.',
      ].join(' '),
      '',
      'ppgca',
      'https://ppgca.evz.ufg.br/n/202060',
      { created_at: '2026-06-22T09:31:52-03:00', sourceKind: 'news' }
    );

    expect(result.temporal.applicationDeadline).toBe('2026-07-10');
    expect(result.temporal.applicationStatus).toBe('closed');
    expect(result.temporal.dateEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-08-06', role: 'contextDate' }),
      expect.objectContaining({ date: '2026-08-08', role: 'contextDate' }),
    ]));
    expect(result.decision).toBe('discard');
  });

  test('recognizes the completion deadline of a multi-step registration', () => {
    const result = curator.classifyItem(
      'Inscricoes para a XXXI Maratona de Programacao seguem abertas',
      [
        'As inscricoes permanecem abertas.',
        'A inscricao e realizada em duas etapas: pagamento e cadastramento da equipe.',
        'Ambas as etapas devem ser concluidas ate o dia 10 de agosto de 2026 para que a inscricao seja efetivada.',
        'A etapa regional sera realizada no dia 29 de agosto de 2026.',
      ].join(' '),
      '',
      'inf',
      'https://inf.ufg.br/n/203015',
      { created_at: '2026-07-10T14:07:18-03:00', sourceKind: 'news' }
    );

    expect(result.temporal.applicationDeadline).toBe('2026-08-10');
    expect(result.temporal.applicationStatus).toBe('open');
    expect(result.temporal.eventStartsAt).toBe('2026-08-29');
  });

  test('routes a structured event to review when its media filename has another year', () => {
    const classification = curator.classifyItem(
      'Entrega de titulo emerito',
      'Data: 2026-10-21. Local: Auditorio da UFG.',
      '',
      'ufg',
      'https://ufg.br/events?event=38329',
      {
        created_at: '2025-10-14T19:12:51-03:00',
        sourceKind: 'event',
        eventStartsAt: '2026-10-21T14:00:00-03:00',
        eventEndsAt: '2026-10-21T16:00:00-03:00',
      }
    );
    const reviewed = curator.applySourcePublicationPolicy(classification, {
      sourceKind: 'event',
      images: ['https://files.cercomp.ufg.br/weby/up/1/o/convite_titulo_21-10-25_2.png'],
    }, { eventsAutoPublish: true });

    expect(reviewed.decision).toBe('review');
    expect(reviewed.reasons).toContain('structured_event_media_date_conflict');
    expect(reviewed.temporal.structuredEventMediaDateConflict).toEqual({
      eventDate: '2026-10-21',
      mediaDate: '2025-10-21',
      mediaUrl: 'https://files.cercomp.ufg.br/weby/up/1/o/convite_titulo_21-10-25_2.png',
    });
  });

  test('keeps structured artwork when hydration exposes a template icon', () => {
    const placeholder = 'https://files.cercomp.ufg.br/weby/up/1/i/IconeX.png?1746546951';
    const artwork = 'https://files.cercomp.ufg.br/weby/up/1/o/convite_titulo_21-10-25_2.png?1760479677';

    expect(curator.normalizeItemMedia(
      placeholder,
      [artwork],
      'https://ufg.br/events?event=38329'
    )).toEqual({ image: artwork, images: [artwork] });
  });

  test('produces a byte-reproducible offline report for a fixed artifact and reference date', () => {
    const item = fixture.cases.find(({ id }) => id === 'active-opportunity-with-form-and-deadline');
    const artifactText = JSON.stringify({
      version: 'fixture-v1',
      mode: 'daily',
      timestamp: '2026-07-11T03:20:44.417Z',
      publishable: [{
        title: item.title,
        text: item.text,
        site: item.sourceName,
        url: item.linkUrl,
        sourceKind: item.jsonItem.sourceKind,
        decision: 'publish',
        module: 'oportunidades',
        dates: { publishedAt: item.jsonItem.created_at },
      }],
    });
    const reportScript = path.join(__dirname, '..', '..', 'scripts', 'evaluate-cadu-curator-relevance.js');
    const args = [reportScript, '--now=2026-07-11T12:00:00-03:00'];
    const run = () => spawnSync(process.execPath, args, {
      cwd: path.join(__dirname, '..', '..'),
      input: artifactText,
      encoding: 'utf8',
    });

    const first = run();
    const second = run();
    expect(first.status).toBe(0);
    expect(first.stderr).toBe('');
    expect(second.status).toBe(0);
    expect(first.stdout).toBe(second.stdout);

    const report = JSON.parse(first.stdout);
    expect(report.generatedAt).toBe('2026-07-11T15:00:00.000Z');
    expect(report.referenceDate).toBe('2026-07-11T15:00:00.000Z');
    expect(report.sourceArtifact.sha256).toBe(
      crypto.createHash('sha256').update(artifactText).digest('hex')
    );
    expect(report.after.decisions.publish).toBe(1);
  });
});
