'use strict';

let driver;
let store;
let actualHelpModule;
let originalKCHelpUtils;

beforeAll(() => {
  global.window = global.window || global;

  store = {};
  const localStorageMock = {
    getItem: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((key) => delete store[key]); },
  };

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });

  originalKCHelpUtils = window.KCHelpUtils;

  window.KCAPI = {
    registerAdapter: jest.fn(),
    config: { fallbackDatabaseURLs: [], baseURL: '' },
    fetchJSON: jest.fn().mockResolvedValue({ anuncios: [] }),
    filterPosts: jest.fn((posts) => posts),
    normalizePost: jest.fn((post) => (post && typeof post === 'object' ? { ...post } : post)),
    MOCK_USERS_LIST: [],
    MOCK_USERS_BY_ID: {},
    apiURL: jest.fn((path) => '/api/v1/' + path),
    VERSION: '12.4.7',
    ENV: { driver: 'local', environment: 'development' },
    DEFAULTS: { fallbackDatabaseURLs: [] },
    rankRelatedPosts: jest.fn((currentPost, candidates) => (Array.isArray(candidates) ? candidates.slice() : [])),
  };

  delete require.cache[require.resolve('../../assets/js/adapters/local/local.notifications.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.ratings.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.saved.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.posts-read.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.posts-write.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.profile.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.help.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.adapter.js')];

  require('../../assets/js/adapters/local/local.notifications.adapter.js');
  require('../../assets/js/adapters/local/local.ratings.adapter.js');
  require('../../assets/js/adapters/local/local.saved.adapter.js');
  require('../../assets/js/adapters/local/local.posts-read.adapter.js');
  require('../../assets/js/adapters/local/local.posts-write.adapter.js');
  require('../../assets/js/adapters/local/local.profile.adapter.js');
  require('../../assets/js/adapters/local/local.help.adapter.js');
  require('../../assets/js/adapters/local/local.adapter.js');

  actualHelpModule = window._KCLA.help;
  driver = window.KCAPI.registerAdapter.mock.calls[0][1];
});

afterAll(() => {
  if (typeof originalKCHelpUtils === 'undefined') {
    delete window.KCHelpUtils;
  } else {
    window.KCHelpUtils = originalKCHelpUtils;
  }
});

beforeEach(() => {
  global.localStorage.clear();
  window._KCLA.help = actualHelpModule;
  delete window.KCHelpUtils;
});

const help = () => window._KCLA.help;

function buildDeps(overrides = {}) {
  const base = {
    getNowIso: () => '2026-04-23T18:00:00.000Z',
    buildRequestId: () => 'help_fixed_01',
  };
  return { ...base, ...overrides };
}

function seedHelpRequests(list) {
  global.localStorage.setItem('kc_help_requests', JSON.stringify(Array.isArray(list) ? list : []));
}

describe('local.help.adapter.js - contrato estatico', () => {
  test('registra window._KCLA.help como objeto frozen', () => {
    expect(window._KCLA).toBeDefined();
    expect(help()).toBeDefined();
    expect(Object.isFrozen(help())).toBe(true);
  });

  test('expoe somente o contrato publico de ajuda e direitos do titular', () => {
    expect(Object.keys(help()).sort()).toEqual([
      'cancelDataSubjectRequest',
      'createDataSubjectRequest',
      'createHelpRequest',
      'downloadDataSubjectExport',
      'downloadDataSubjectSupplement',
      'getDataSubjectRequest',
      'listAdminHelpRequests',
      'listDataSubjectRequests',
      'processAccountErasure',
      'processDataExportSupplement',
      'updateAdminHelpRequest',
    ]);
  });

  test('helpers internos nao ficam expostos', () => {
    expect(help().migrateLegacyHelpPayload).toBeUndefined();
    expect(help().normalizeHelpPayload).toBeUndefined();
    expect(help().attachLocalAdminHelpListMeta).toBeUndefined();
  });
});

describe('local.help.adapter.js - createHelpRequest', () => {
  test.each([
    ['account_data_copy', 'data_access_copy'],
    ['account_data_portability', 'data_portability'],
    ['account_deletion', 'account_erasure'],
  ])('recusa %s sem backend e não persiste PII local', async (subtopic, requestKind) => {
    const result = await help().createHelpRequest({
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic,
      subject: 'Direito do titular',
      message: 'Solicitação que não pode virar protocolo local fictício.',
      contact_email: 'titular@example.com',
      metadata: {
        request_kind: requestKind,
        account_email: 'titular@example.com',
      },
    }, buildDeps());

    expect(result).toMatchObject({
      ok: false,
      data: null,
      error: {
        code: 'BACKEND_REQUIRED',
      },
    });
    expect(result.error.message).toContain('Nenhum dado');
    expect(global.localStorage.getItem('kc_help_requests')).toBeNull();
  });

  test('rejeita payload sem campos obrigatorios', async () => {
    const result = await help().createHelpRequest({
      type: 'question',
      topic: 'modules_filters',
      subject: '',
      message: '',
      contact_email: '',
    }, buildDeps());

    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('e-mail');
  });

  test('persiste payload normalizado e migra tipos/temas legados sem KCHelpUtils', async () => {
    const result = await help().createHelpRequest({
      user_id: 'USER_SELF',
      type: 'complaint',
      topic: 'posts',
      subject: '  Ajuda no feed  ',
      message: '  O feed travou no celular.  ',
      priority: 'urgent',
      page_path: ' /ajuda.html ',
      contact_email: '  USER@EXAMPLE.COM ',
      allow_contact: true,
      metadata: { route: '/ajuda.html' },
    }, buildDeps());

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 'help_fixed_01',
        user_id: 'USER_SELF',
        type: 'platform_issue',
        topic: 'create_edit_post',
        subject: 'Ajuda no feed',
        message: 'O feed travou no celular.',
        priority: 'urgent',
        status: 'new',
        page_path: '/ajuda.html',
        contact_email: 'user@example.com',
        allow_contact: true,
        metadata: { route: '/ajuda.html' },
        created_at: '2026-04-23T18:00:00.000Z',
        updated_at: '2026-04-23T18:00:00.000Z',
      }),
    });

    const stored = JSON.parse(global.localStorage.getItem('kc_help_requests') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(expect.objectContaining({
      id: 'help_fixed_01',
      type: 'platform_issue',
      topic: 'create_edit_post',
      contact_email: 'user@example.com',
    }));
  });

  test('delega a normalizacao para KCHelpUtils quando disponivel', async () => {
    window.KCHelpUtils = {
      normalizeHelpRequestInput: jest.fn((input) => ({
        user_id: input.user_id || 'USER_UTILS',
        type: input.type,
        topic: input.topic,
        subtopic: 'module_flow',
        subject: 'Normalizado',
        message: 'Mensagem normalizada',
        priority: 'high',
        status: 'triaged',
        page_path: '/ajuda.html',
        contact_email: 'normalizado@example.com',
        allow_contact: false,
        metadata: { normalized: true },
      })),
    };

    const result = await help().createHelpRequest({
      type: 'praise',
      topic: 'posts',
      subject: 'Ignorado',
      message: 'Ignorado',
      contact_email: 'IGNORADO@EXAMPLE.COM',
    }, buildDeps());

    expect(result.ok).toBe(true);
    expect(window.KCHelpUtils.normalizeHelpRequestInput).toHaveBeenCalledWith(expect.objectContaining({
      type: 'suggestion_praise',
      topic: 'specific_module',
    }), {});
    expect(result.data).toEqual(expect.objectContaining({
      type: 'suggestion_praise',
      topic: 'specific_module',
      subject: 'Normalizado',
      contact_email: 'normalizado@example.com',
      allow_contact: false,
    }));
  });

  test('simula notificacao de acesso externo no fallback local', async () => {
    const result = await help().createHelpRequest({
      type: 'external_access',
      topic: 'non_institutional_email',
      subtopic: 'has_context',
      subject: 'Solicitação de acesso externo',
      message: 'Quero acessar como pesquisador convidado.',
      contact_email: 'visitante@example.com',
      metadata: {
        request_kind: 'external_access',
        requester_name: 'Visitante',
      },
    }, buildDeps());

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      type: 'external_access',
      topic: 'non_institutional_email',
      metadata: expect.objectContaining({
        request_kind: 'external_access',
        requester_name: 'Visitante',
        email_notification: {
          status: 'simulated_local',
          provider: 'local',
          to: 'contato@kinocampus.com.br',
          sent_at: '2026-04-23T18:00:00.000Z',
        },
      }),
    }));
  });

  test('retorna erro quando a persistencia falha', async () => {
    const originalSetItem = global.localStorage.setItem;
    global.localStorage.setItem = () => { throw new Error('disk full'); };

    try {
      const result = await help().createHelpRequest({
        type: 'question',
        topic: 'modules_filters',
        subject: 'Falha',
        message: 'Falha ao salvar',
        contact_email: 'falha@example.com',
      }, buildDeps());

      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('salvar');
    } finally {
      global.localStorage.setItem = originalSetItem;
    }
  });
});

describe('local.help.adapter.js - listAdminHelpRequests', () => {
  beforeEach(() => {
    seedHelpRequests([
      {
        id: 'help_01',
        type: 'question',
        topic: 'modules_filters',
        subtopic: 'filter_use',
        subject: 'Primeiro pedido',
        message: 'Feed sem filtros',
        priority: 'normal',
        status: 'new',
        page_path: '/eventos.html',
        contact_email: 'um@example.com',
        metadata: {},
        created_at: '2026-04-22T10:00:00.000Z',
        updated_at: '2026-04-22T10:00:00.000Z',
      },
      {
        id: 'help_02',
        type: 'platform_issue',
        topic: 'bugs_crashes',
        subtopic: 'mobile_bug',
        subject: 'Segundo pedido',
        message: 'Erro no app',
        priority: 'urgent',
        status: 'in_progress',
        page_path: '/profile.html',
        contact_email: 'dois@example.com',
        metadata: {},
        created_at: '2026-04-23T09:00:00.000Z',
        updated_at: '2026-04-23T09:00:00.000Z',
      },
      {
        id: 'help_03',
        type: 'report',
        topic: 'security',
        subtopic: 'account_takeover',
        subject: 'Terceiro pedido',
        message: 'Conta suspeita',
        priority: 'high',
        status: 'resolved',
        page_path: '/settings.html',
        contact_email: 'tres@example.com',
        metadata: {},
        created_at: '2026-04-21T08:00:00.000Z',
        updated_at: '2026-04-21T08:00:00.000Z',
      },
    ]);
  });

  test('retorna lista vazia com metadados quando nao ha registros', async () => {
    global.localStorage.clear();

    const result = await help().listAdminHelpRequests({ limit: 10, offset: 5 }, buildDeps());

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
    expect(result.hasMore).toBe(false);
  });

  test('ordena por created_at desc e anexa metadados de paginacao', async () => {
    const result = await help().listAdminHelpRequests({ limit: 2, offset: 0 }, buildDeps());

    expect(result.map((row) => row.id)).toEqual(['help_02', 'help_01']);
    expect(result.totalCount).toBe(3);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);
    expect(result.hasMore).toBe(true);
  });

  test('filtra por status, type e priority', async () => {
    const result = await help().listAdminHelpRequests({
      status: 'in_progress',
      type: 'platform_issue',
      priority: 'urgent',
      limit: 10,
      offset: 0,
    }, buildDeps());

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'help_02',
      status: 'in_progress',
      type: 'platform_issue',
      priority: 'urgent',
    }));
  });

  test('filtra por query em mensagem e e-mail', async () => {
    const byMessage = await help().listAdminHelpRequests({ query: 'suspeita' }, buildDeps());
    const byEmail = await help().listAdminHelpRequests({ query: 'dois@example.com' }, buildDeps());

    expect(byMessage).toHaveLength(1);
    expect(byMessage[0].id).toBe('help_03');
    expect(byEmail).toHaveLength(1);
    expect(byEmail[0].id).toBe('help_02');
  });

  test('respeita offset e limit no recorte final', async () => {
    const result = await help().listAdminHelpRequests({ limit: 1, offset: 1 }, buildDeps());

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('help_01');
    expect(result.totalCount).toBe(3);
    expect(result.hasMore).toBe(true);
  });

  test('ignora storage corrompido e devolve envelope vazio', async () => {
    global.localStorage.setItem('kc_help_requests', '{invalid');

    const result = await help().listAdminHelpRequests({ limit: 25, offset: 0 }, buildDeps());

    expect(result).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  test('requestId faz lookup UUID exato ignorando filtros e paginação', async () => {
    const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const exactRow = {
      id: requestId,
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_data_copy',
      subject: 'Linha exata',
      message: 'Linha que não corresponde aos filtros conflitantes.',
      priority: 'normal',
      status: 'resolved',
      page_path: '/settings.html',
      contact_email: 'titular@example.com',
      metadata: {},
      created_at: '2026-04-24T09:00:00.000Z',
      updated_at: '2026-04-24T09:00:00.000Z',
    };
    seedHelpRequests([
      exactRow,
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        type: 'report',
        subject: 'Outra linha',
        message: 'Outra mensagem',
        priority: 'urgent',
        status: 'archived',
        created_at: '2026-04-25T09:00:00.000Z',
      },
    ]);

    const result = await help().listAdminHelpRequests({
      requestId: `  ${requestId.toUpperCase()}  `,
      status: 'archived',
      type: 'report',
      priority: 'urgent',
      query: 'não corresponde',
      limit: 1,
      offset: 999,
    }, buildDeps());

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      id: requestId,
      subject: exactRow.subject,
      message: exactRow.message,
      status: exactRow.status,
      priority: exactRow.priority,
      contact_email: exactRow.contact_email,
    }));
    expect(result).toMatchObject({
      ok: true,
      totalCount: 1,
      limit: 1,
      offset: 0,
      hasMore: false,
    });
  });

  test('requestId inválido falha antes de ler a listagem local geral', async () => {
    const getItem = jest.spyOn(global.localStorage, 'getItem');
    try {
      const result = await help().listAdminHelpRequests({
        requestId: 'not-a-valid-uuid',
        status: 'resolved',
        limit: 100,
        offset: 100,
      }, buildDeps());

      expect(result).toHaveLength(0);
      expect(result).toMatchObject({
        ok: false,
        totalCount: 0,
        limit: 1,
        offset: 0,
        hasMore: false,
        error: {
          message: expect.stringMatching(/inválido|invalido/i),
        },
      });
      expect(getItem).not.toHaveBeenCalled();
    } finally {
      getItem.mockRestore();
    }
  });
});

describe('local.help.adapter.js - updateAdminHelpRequest', () => {
  beforeEach(() => {
    seedHelpRequests([
      {
        id: 'help_01',
        type: 'question',
        topic: 'modules_filters',
        subject: 'Pedido',
        message: 'Mensagem',
        priority: 'normal',
        status: 'new',
        page_path: '/ajuda.html',
        contact_email: 'help@example.com',
        metadata: { route: '/ajuda.html' },
        created_at: '2026-04-22T10:00:00.000Z',
        updated_at: '2026-04-22T10:00:00.000Z',
      },
    ]);
  });

  test('rejeita id invalido', async () => {
    const result = await help().updateAdminHelpRequest('', { status: 'resolved' }, buildDeps());
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('Pedido');
  });

  test('rejeita pedido inexistente', async () => {
    const result = await help().updateAdminHelpRequest('help_missing', { status: 'resolved' }, buildDeps());
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('encontrado');
  });

  test('atualiza patch e updated_at no storage', async () => {
    const result = await help().updateAdminHelpRequest('help_01', {
      status: 'triaged',
      priority: 'high',
      metadata: { route: '/admin/help-requests.html' },
    }, buildDeps({ getNowIso: () => '2026-04-23T19:30:00.000Z' }));

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 'help_01',
        status: 'triaged',
        priority: 'high',
        updated_at: '2026-04-23T19:30:00.000Z',
        metadata: { route: '/admin/help-requests.html' },
      }),
    });

    const stored = JSON.parse(global.localStorage.getItem('kc_help_requests') || '[]');
    expect(stored[0]).toEqual(expect.objectContaining({
      id: 'help_01',
      status: 'triaged',
      priority: 'high',
      updated_at: '2026-04-23T19:30:00.000Z',
    }));
  });

  test('retorna erro quando a persistencia do update falha', async () => {
    const originalSetItem = global.localStorage.setItem;
    global.localStorage.setItem = () => { throw new Error('disk full'); };

    try {
      const result = await help().updateAdminHelpRequest('help_01', { status: 'resolved' }, buildDeps());
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('atualizar');
    } finally {
      global.localStorage.setItem = originalSetItem;
    }
  });

  test('simula fluxo LGPD de ocultacao reversivel no driver local', async () => {
    const result = await help().processAccountErasure({
      action: 'apply_reversible',
      help_request_id: 'help_01',
      target_email: 'help@example.com',
    }, buildDeps({ getNowIso: () => '2026-04-23T20:00:00.000Z' }));

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      action: 'apply_reversible',
      request: expect.objectContaining({
        status: 'pending_confirmation',
        email_hash: expect.stringContaining('local-help-example-com'),
      }),
      diagnostics: expect.objectContaining({
        warnings: ['local_driver_simulation'],
      }),
    }));

    const stored = JSON.parse(global.localStorage.getItem('kc_help_requests') || '[]');
    expect(stored[0]).toEqual(expect.objectContaining({
      status: 'in_progress',
      metadata: expect.objectContaining({
        lgpd_erasure: expect.objectContaining({
          stage: 'pending_confirmation',
        }),
      }),
    }));
  });
});

describe('local.help.adapter.js - integracao com driver local', () => {
  test('driver delega createHelpRequest para o submodulo', async () => {
    const stub = {
      ...actualHelpModule,
      createHelpRequest: jest.fn().mockResolvedValue({ ok: true, data: { id: 'help_driver' } }),
    };
    window._KCLA.help = stub;

    await expect(driver.createHelpRequest({ subject: 'Driver' })).resolves.toEqual({
      ok: true,
      data: { id: 'help_driver' },
    });
    expect(stub.createHelpRequest).toHaveBeenCalledWith({ subject: 'Driver' }, expect.any(Object));
  });

  test('driver delega listAdminHelpRequests para o submodulo', async () => {
    const stub = {
      ...actualHelpModule,
      listAdminHelpRequests: jest.fn().mockResolvedValue(Object.assign([{ id: 'help_driver' }], {
        totalCount: 1,
        limit: 25,
        offset: 0,
        hasMore: false,
      })),
    };
    window._KCLA.help = stub;

    const result = await driver.listAdminHelpRequests({ status: 'new' });
    expect(result).toHaveLength(1);
    expect(result.totalCount).toBe(1);
    expect(stub.listAdminHelpRequests).toHaveBeenCalledWith({ status: 'new' }, expect.any(Object));
  });

  test('driver delega updateAdminHelpRequest para o submodulo', async () => {
    const stub = {
      ...actualHelpModule,
      updateAdminHelpRequest: jest.fn().mockResolvedValue({ ok: true, data: { id: 'help_driver', status: 'resolved' } }),
    };
    window._KCLA.help = stub;

    await expect(driver.updateAdminHelpRequest('help_driver', { status: 'resolved' })).resolves.toEqual({
      ok: true,
      data: { id: 'help_driver', status: 'resolved' },
    });
    expect(stub.updateAdminHelpRequest).toHaveBeenCalledWith('help_driver', { status: 'resolved' }, expect.any(Object));
  });

  test('driver delega processAccountErasure para o submodulo', async () => {
    const stub = {
      ...actualHelpModule,
      processAccountErasure: jest.fn().mockResolvedValue({ ok: true, action: 'diagnose' }),
    };
    window._KCLA.help = stub;

    await expect(driver.processAccountErasure({ action: 'diagnose' })).resolves.toEqual({
      ok: true,
      action: 'diagnose',
    });
    expect(stub.processAccountErasure).toHaveBeenCalledWith({ action: 'diagnose' }, expect.any(Object));
  });
});
