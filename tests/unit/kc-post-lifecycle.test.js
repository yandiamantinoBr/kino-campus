'use strict';

const lifecycle = require('../../assets/js/shared/kc-post-lifecycle.shared.js');

const NOW = '2026-08-10T12:00:00-03:00';

describe('KCPostLifecycle', () => {
  test('fecha status explícitos e preserva publicação ativa', () => {
    expect(lifecycle.isClosedOrEnded({ module: 'eventos', status: 'closed' }, { now: NOW })).toBe(true);
    expect(lifecycle.isClosedOrEnded({ module: 'eventos', status: 'encerrado' }, { now: NOW })).toBe(true);
    expect(lifecycle.isClosedOrEnded({ module: 'eventos', status: 'published' }, { now: NOW })).toBe(false);
  });

  test('evento de vários dias permanece ativo até o fim em São Paulo', () => {
    const event = {
      module: 'eventos',
      status: 'published',
      metadata: { data_evento: '2026-08-08', data_fim_evento: '2026-08-12' },
    };
    expect(lifecycle.resolve(event, { now: NOW })).toMatchObject({
      closed: false,
      endSource: 'event-end',
      endAt: '2026-08-13T02:59:59.999Z',
    });
    expect(lifecycle.isClosedOrEnded(event, { now: '2026-08-13T00:00:00-03:00' })).toBe(true);
  });

  test('evento sem fim encerra ao final do dia de início, não pelo expires_at antigo', () => {
    const event = {
      module: 'eventos',
      status: 'published',
      expires_at: '2026-08-01',
      metadata: { dates: { eventStartsAt: '2026-08-20T19:00:00-03:00' } },
    };
    const result = lifecycle.resolve(event, { now: NOW });
    expect(result.closed).toBe(false);
    expect(result.endSource).toBe('event-start');
    expect(result.endAt).toBe('2026-08-21T02:59:59.999Z');
  });

  test('preserva o alias legado event_date_detected da busca', () => {
    expect(lifecycle.resolve({
      module: 'eventos',
      status: 'published',
      metadata: { event_date_detected: '2026-08-01' },
    }, { now: NOW })).toMatchObject({ closed: true, endSource: 'event-start' });
    expect(lifecycle.isClosedOrEnded({
      module: 'eventos',
      status: 'published',
      metadata: { dates: { event_date_detected: '2026-08-20' } },
    }, { now: NOW })).toBe(false);
  });

  test('oportunidade prioriza deadline futuro a expires_at antigo', () => {
    const opportunity = {
      module: 'oportunidades',
      status: 'published',
      expires_at: '2026-08-01',
      metadata: { dates: { applicationDeadline: '2026-08-20' } },
    };
    expect(lifecycle.resolve(opportunity, { now: NOW })).toMatchObject({
      closed: false,
      endSource: 'deadline',
    });
    expect(lifecycle.isClosedOrEnded(opportunity, { now: '2026-08-21T00:00:00-03:00' })).toBe(true);
  });

  test('carona usa saída antes da expiração genérica', () => {
    const ride = {
      module: 'caronas',
      status: 'published',
      expires_at: '2026-08-01',
      metadata: { departure_at: '2026-08-11T08:00:00-03:00' },
    };
    expect(lifecycle.resolve(ride, { now: NOW })).toMatchObject({ closed: false, endSource: 'departure' });
    expect(lifecycle.isClosedOrEnded(ride, { now: '2026-08-12T00:00:00-03:00' })).toBe(true);
  });

  test('aceita metadata, meta, _meta, datas BR e ignora datas inválidas', () => {
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', meta: { expires_at: '09/08/2026' } }, { now: NOW })).toBe(true);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', _meta: { expires_at: '11/08/2026' } }, { now: NOW })).toBe(false);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', metadata: { expires_at: 'não-é-data' } }, { now: NOW })).toBe(false);
  });

  test('applicationStatus fechado não oculta evento futuro, mas fecha oportunidade', () => {
    const dates = { applicationStatus: 'closed', eventStartsAt: '2026-08-20' };
    expect(lifecycle.isClosedOrEnded({ module: 'eventos', metadata: { dates } }, { now: NOW })).toBe(false);
    expect(lifecycle.isClosedOrEnded({ module: 'oportunidades', metadata: { dates } }, { now: NOW })).toBe(true);
  });

  test('eventStatus e flags de expiração explícitas são respeitados sem cruzar módulos', () => {
    expect(lifecycle.isClosedOrEnded({ module: 'eventos', metadata: { eventStatus: 'ended' } }, { now: NOW })).toBe(true);
    expect(lifecycle.isClosedOrEnded({ module: 'oportunidades', metadata: { eventStatus: 'ended' } }, { now: NOW })).toBe(false);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', metadata: { isExpired: true } }, { now: NOW })).toBe(true);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', metadata: { isExpired: 'true' } }, { now: NOW })).toBe(false);
  });

  test('activeUntil tem precedência sobre expires_at e aliases de expiração do metadata', () => {
    const post = {
      module: 'moradia',
      expires_at: '2000-08-01',
      metadata: { activeUntil: '2099-08-20', expiresAt: '2000-07-01' },
    };
    expect(lifecycle.resolve(post, { now: NOW })).toMatchObject({ closed: false, endSource: 'expiry' });
  });

  test('rejeita datas civis impossiveis em vez de normaliza-las para outro mes', () => {
    expect(lifecycle.parseDateMs('31/02/2026', 'end')).toBeNull();
    expect(lifecycle.parseDateMs('2026-02-31', 'end')).toBeNull();
    expect(lifecycle.parseDateMs('2026-02-31T10:00:00', 'end')).toBeNull();
    expect(lifecycle.parseDateMs('2026-02-31T12:00:00Z', 'end')).toBeNull();
  });

  test('interpreta epoch de dez digitos como segundos, igual ao contrato SQL', () => {
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', metadata: { expires_at: 1790000000 } }, { now: NOW })).toBe(false);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', metadata: { expires_at: '1790000000' } }, { now: NOW })).toBe(false);
  });

  test('rejeita epochs numericos fora dos formatos canônicos de 10 ou 13 digitos', () => {
    expect(lifecycle.parseDateMs(123456789, 'end')).toBeNull();
    expect(lifecycle.parseDateMs(12345678901, 'end')).toBeNull();
    expect(lifecycle.parseDateMs(123456789012, 'end')).toBeNull();
    expect(lifecycle.parseDateMs(-1000000000, 'end')).toBeNull();
    expect(lifecycle.parseDateMs(-1234567890123, 'end')).toBeNull();
  });

  test('combina containers metadata sem perder aliases de ciclo de vida', () => {
    const post = {
      module: 'moradia',
      metadata: { origem: 'principal' },
      _meta: { expires_at: '2000-01-01' },
    };
    expect(lifecycle.isClosedOrEnded(post, { now: NOW })).toBe(true);
  });

  test('combina aliases aninhados em dates com a mesma precedencia dos containers', () => {
    const post = {
      module: 'moradia',
      metadata: { dates: { origem: 'principal' } },
      _meta: { dates: { expiresAt: '2000-01-01' } },
    };
    expect(lifecycle.isClosedOrEnded(post, { now: NOW })).toBe(true);
  });

  test('respeita isClosed somente quando booleano verdadeiro', () => {
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', metadata: { isClosed: true } }, { now: NOW })).toBe(true);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', metadata: { isClosed: 'true' } }, { now: NOW })).toBe(false);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', metadata: { expired: false, isClosed: true } }, { now: NOW })).toBe(true);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', isClosed: false, metadata: { isClosed: true } }, { now: NOW })).toBe(true);
    expect(lifecycle.isClosedOrEnded({ module: 'moradia', is_closed: false, metadata: { is_closed: true } }, { now: NOW })).toBe(true);
  });
});
