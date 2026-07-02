'use strict';

const Policy = require('../../assets/js/shared/kc-feed-ranking-policy.shared.js');

const NOW = '2026-07-02T12:00:00.000Z';

function basePost(overrides = {}) {
  return Object.assign({
    id: 'post-1',
    module: 'eventos',
    status: 'published',
    title: 'Workshop de tecnologia para a comunidade universitaria',
    description: 'Atividade aberta para estudantes, docentes e tecnicos da UFG com programacao confirmada e inscricoes gratuitas.',
    category: 'tecnologia',
    tags: ['hackathon', 'ufg'],
    source_url: 'https://inf.ufg.br/evento',
    votos: 4,
    comment_count: 2,
    share_count: 1
  }, overrides);
}

function eventPost(overrides = {}) {
  return basePost(Object.assign({
    module: 'eventos',
    metadata: { data_evento: '2026-07-03' }
  }, overrides));
}

describe('politica de ranking do feed', () => {
  test('evento futuro e evento continuo entram como ativos; evento passado sai do feed ativo', () => {
    const future = Policy.resolveActiveWindow(eventPost(), { now: NOW });
    expect(future.active).toBe(true);
    expect(future.state).toBe('active');
    expect(future.eventStart).toMatch(/^2026-07-03/);

    const ongoing = Policy.resolveActiveWindow(eventPost({
      metadata: { data_evento: '2026-07-01', event_end: '2026-07-05' }
    }), { now: NOW });
    expect(ongoing.active).toBe(true);
    expect(ongoing.state).toBe('active');

    const past = Policy.resolveActiveWindow(eventPost({
      metadata: { data_evento: '2026-07-01' }
    }), { now: NOW });
    expect(past.active).toBe(false);
    expect(past.state).toBe('expired');
    expect(Policy.scoreGlobal(eventPost({ metadata: { data_evento: '2026-07-01' } }), { now: NOW }).score).toBe(0);
  });

  test('oportunidade respeita prazo aberto e prazo expirado', () => {
    const open = basePost({
      module: 'oportunidades',
      category: 'estagios',
      metadata: { deadline_at: '2026-07-10' }
    });
    const expired = basePost({
      module: 'oportunidades',
      category: 'estagios',
      metadata: { deadline_at: '2026-07-01' }
    });
    expect(Policy.resolveActiveWindow(open, { now: NOW }).active).toBe(true);
    expect(Policy.resolveActiveWindow(expired, { now: NOW }).active).toBe(false);
    expect(Policy.scoreGlobal(expired, { now: NOW }).score).toBe(0);
  });

  test('publicacao encerrada nao volta ao destaque por engajamento alto', () => {
    const closed = eventPost({
      status: 'closed',
      votos: 999,
      comment_count: 999,
      share_count: 999,
      save_count: 999
    });
    const result = Policy.scoreGlobal(closed, { now: NOW });
    expect(result.score).toBe(0);
    expect(result.finalScore).toBe(0);
    expect(result.eligibility.state).toBe('closed');
  });

  test('evento comunitario relevante supera evento comum, mas nao ressuscita expirado', () => {
    const ordinary = eventPost({ id: 'ordinary', votos: 1, comment_count: 0 });
    const conpeex = eventPost({
      id: 'conpeex',
      title: 'CONPEEX UFG - congresso de pesquisa ensino e extensao',
      votos: 1,
      comment_count: 0,
      metadata: { data_evento: '2026-07-03', major_event: true }
    });
    expect(Policy.scoreGlobal(conpeex, { now: NOW }).score)
      .toBeGreaterThan(Policy.scoreGlobal(ordinary, { now: NOW }).score);

    const expiredMajor = Policy.scoreGlobal(eventPost({
      title: 'CONPEEX UFG - congresso de pesquisa ensino e extensao',
      metadata: { data_evento: '2026-07-01', major_event: true }
    }), { now: NOW });
    expect(expiredMajor.score).toBe(0);
  });

  test('engajamento e saturado, nao linear', () => {
    const moderate = Policy.scoreGlobal(eventPost({ votos: 5, comment_count: 5, share_count: 2 }), { now: NOW });
    const viral = Policy.scoreGlobal(eventPost({ votos: 5000, comment_count: 5000, share_count: 5000 }), { now: NOW });
    expect(viral.components.engagement).toBeLessThanOrEqual(1);
    expect(viral.components.engagement - moderate.components.engagement).toBeLessThan(0.6);
    expect(viral.score - moderate.score).toBeLessThan(0.25);
  });

  test('evento sem data confiavel vai para revisao e recebe score zero no feed ativo', () => {
    const missing = eventPost({ metadata: { deadline_at: '2026-07-10' } });
    const eligibility = Policy.resolveActiveWindow(missing, { now: NOW });
    expect(eligibility.active).toBe(false);
    expect(eligibility.state).toBe('needs-review');
    expect(eligibility.deadlineAt).toMatch(/^2026-07-10/);
    expect(eligibility.reasons.map((reason) => reason.type)).toContain('missing-event-date');
    expect(Policy.scoreGlobal(missing, { now: NOW }).score).toBe(0);
  });

  test('personalizacao so atua com opt-in e fica limitada a 10%', () => {
    const post = eventPost();
    const global = Policy.scoreGlobal(post, { now: NOW });
    const standard = Policy.blendPersonalScore(global, post, {
      now: NOW,
      preferences: { mode: 'standard', consent: { granted: false } }
    });
    expect(standard.finalScore).toBe(global.finalScore);
    expect(standard.personalization.boost).toBe(0);

    const personalized = Policy.blendPersonalScore(global, post, {
      now: NOW,
      preferences: {
        mode: 'personalized',
        modules: ['eventos'],
        categories: { eventos: ['tecnologia'] },
        tags: ['hackathon'],
        localAffinityConsent: true,
        consent: { purpose: 'feed-personalization-v1', granted: true }
      },
      affinity: {
        features: {
          'module:eventos': { count: 20, updatedAt: NOW },
          'tag:hackathon': { count: 20, updatedAt: NOW }
        }
      }
    });
    expect(personalized.finalScore).toBeLessThanOrEqual(Math.round(global.score * 1.1 * 10000) / 10000);
    expect(personalized.personalization.boost).toBeLessThanOrEqual(Policy.MAX_TOTAL_BOOST);
    expect(personalized.personalization.explicitBoost).toBeLessThanOrEqual(Policy.MAX_EXPLICIT_BOOST);
    expect(personalized.personalization.affinityBoost).toBeLessThanOrEqual(Policy.MAX_AFFINITY_BOOST);
  });

  test('ranking sombra deduplica candidatos por id ou url sem alterar contrato do feed atual', () => {
    const posts = [
      eventPost({ id: 'a', source_url: 'https://ufg.br/evento-a?utm=1', metadata: { data_evento: '2026-07-03' } }),
      eventPost({ id: 'a', source_url: 'https://ufg.br/evento-a?utm=2', metadata: { data_evento: '2026-07-03' } }),
      eventPost({ id: 'b', source_url: 'https://ufg.br/evento-b', metadata: { data_evento: '2026-07-04' } })
    ];
    const ranked = Policy.rankForShadow(posts, { now: NOW, diversify: false });
    expect(ranked.map((entry) => entry.id).sort()).toEqual(['a', 'b']);
    expect(ranked.every((entry) => typeof entry.finalScore === 'number')).toBe(true);
  });
});
