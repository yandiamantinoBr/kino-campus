/**
 * @file supabase-admin-adapter.test.js
 * @description Static contract tests for supabase.admin.adapter.js (v11.30.2)
 * Verifica estrutura IIFE, namespace _KCSA.admin, helpers internos
 * e todos os métodos da API de help requests.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../../assets/js/adapters/supabase/supabase.admin.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.admin.adapter.js - fluxo LGPD account erasure', () => {
  test('exporta processAccountErasure', () => {
    expect(source).toContain('processAccountErasure,');
  });

  test('invoca Edge Function kc-account-erasure', () => {
    expect(source).toContain("client.functions.invoke('kc-account-erasure'");
  });

  test('extrai mensagem estruturada de erro da Edge Function', () => {
    expect(source).toContain('error.context');
    expect(source).toContain('edgeBody.detail');
    expect(source).toContain('edgeBody.message');
    expect(source).toContain('edgeBody.error');
  });

  test('faz merge de metadata antes de atualizar help_requests', () => {
    expect(source).toContain(".select('metadata')");
    expect(source).toContain('updates.metadata = { ...currentMetadata, ...patch.metadata };');
  });
});

describe('supabase.admin.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.admin no final do IIFE', () => {
    expect(source).toContain('window._KCSA.admin = {');
  });
});

describe('supabase.admin.adapter.js — helpers getClient / getCurrentUser', () => {
  test('define getClient() via window._KCSA.getClient (lazy)', () => {
    expect(source).toContain('function getClient()');
    expect(source).toContain('window._KCSA.getClient');
    expect(source).not.toContain('getSupabaseClient()');
  });

  test('define getCurrentUser() via window._KCSA.getCurrentUser (lazy)', () => {
    expect(source).toContain('function getCurrentUser()');
    expect(source).toContain('window._KCSA.getCurrentUser');
    expect(source).not.toContain('supabaseGetCurrentUser()');
  });
});

describe('supabase.admin.adapter.js — helpers internos', () => {
  test('define normalizeHelpPayload (delega para KCHelpUtils se disponível)', () => {
    expect(source).toContain('function normalizeHelpPayload(');
    expect(source).toContain('KCHelpUtils');
    expect(source).toContain('normalizeHelpRequestInput');
  });

  test('define attachAdminHelpListMeta com totalCount/limit/offset/hasMore', () => {
    expect(source).toContain('function attachAdminHelpListMeta(');
    expect(source).toContain('totalCount');
    expect(source).toContain('hasMore');
    expect(source).toContain('Object.assign(list,');
    expect(source).toContain('ok: meta.ok !== false');
    expect(source).toContain("error: { message: 'Não foi possível consultar a fila de solicitações.' }");
  });

  test('define buildAdminHelpSearchQuery com campos de busca', () => {
    expect(source).toContain('function buildAdminHelpSearchQuery(');
    expect(source).toContain('subject.ilike');
    expect(source).toContain('contact_email.ilike');
  });
});

describe('supabase.admin.adapter.js — método createHelpRequest', () => {
  test('exporta createHelpRequest', () => {
    expect(source).toContain('createHelpRequest,');
  });

  test('insere na tabela help_requests', () => {
    expect(source).toContain("from('help_requests')");
    expect(source).toContain('.insert(');
  });

  test('valida subject, message e contact_email obrigatórios', () => {
    expect(source).toContain('normalized.subject');
    expect(source).toContain('normalized.message');
    expect(source).toContain('normalized.contact_email');
  });

  test('usa getCurrentUser() para preencher user_id', () => {
    expect(source).toContain('await getCurrentUser()');
    expect(source).toContain('user && user.id');
  });
});

describe('supabase.admin.adapter.js — método listAdminHelpRequests', () => {
  test('exporta listAdminHelpRequests', () => {
    expect(source).toContain('listAdminHelpRequests,');
  });

  test('tenta RPC kc_admin_list_help_requests_paged primeiro', () => {
    expect(source).toContain("'kc_admin_list_help_requests_paged'");
  });

  test('faz fallback para query direta na tabela help_requests', () => {
    expect(source).toContain("from('help_requests')");
    expect(source).toContain('.select(');
    expect(source).toContain(".order('created_at'");
  });

  test('retorna attachAdminHelpListMeta em todos os caminhos', () => {
    const count = (source.match(/attachAdminHelpListMeta\(/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('distingue falha de consulta de uma fila legitimamente vazia', () => {
    expect(source).toContain('ok: false');
    expect(source).toContain("error: { message: 'Não foi possível consultar a fila de solicitações.' }");
  });
});

describe('supabase.admin.adapter.js — método updateAdminHelpRequest', () => {
  test('exporta updateAdminHelpRequest', () => {
    expect(source).toContain('updateAdminHelpRequest,');
  });

  test('faz update na tabela help_requests por id', () => {
    expect(source).toContain('.update(updates)');
    expect(source).toContain('.eq(');
  });

  test('valida campos status e priority via hasOwnProperty', () => {
    expect(source).toContain('hasOwnProperty.call(patch');
    expect(source).toContain("'status'");
    expect(source).toContain("'priority'");
  });
});

describe('supabase.admin.adapter.js — vínculo da mutação à conta esperada', () => {
  const ACCOUNT_A = '11111111-aaaa-4111-8111-111111111111';
  const ACCOUNT_B = '22222222-bbbb-4222-8222-222222222222';

  beforeEach(() => {
    jest.resetModules();
    window._KCSA = {};
    window.KCHelpUtils = undefined;
  });

  test('não invoca a Edge Function quando a sessão mudou antes de criar o DSR', async () => {
    const invoke = jest.fn();
    window._KCSA.getClient = () => ({ functions: { invoke } });
    window._KCSA.getCurrentUser = async () => ({ id: ACCOUNT_B, email: 'b@example.invalid' });
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.createDataSubjectRequest({
      request_kind: 'data_access_copy',
      expected_user_id: ACCOUNT_A,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'ACCOUNT_CHANGED' } });
    expect(invoke).not.toHaveBeenCalled();
  });

  test('protege leitura, detalhe, downloads e cancelamento contra troca de conta', async () => {
    const invoke = jest.fn();
    window._KCSA.getClient = () => ({ functions: { invoke } });
    window._KCSA.getCurrentUser = async () => ({ id: ACCOUNT_B, email: 'b@example.invalid' });
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');
    const admin = window._KCSA.admin;
    const expected = { expected_user_id: ACCOUNT_A };
    const operations = [
      () => admin.listDataSubjectRequests(expected),
      () => admin.getDataSubjectRequest('KC-DSR-20260729-AAAAAAAAAAAAAAAA', expected),
      () => admin.downloadDataSubjectExport('KC-DSR-20260729-AAAAAAAAAAAAAAAA', expected),
      () => admin.downloadDataSubjectSupplement(
        'KC-DSR-20260729-AAAAAAAAAAAAAAAA',
        'KEA-AAAAAAAAAAAAAAAAAAAAAAAA',
        expected
      ),
      () => admin.cancelDataSubjectRequest('KC-DSR-20260729-AAAAAAAAAAAAAAAA', expected),
    ];

    for (const operation of operations) {
      await expect(operation()).resolves.toMatchObject({
        ok: false,
        error: { code: 'ACCOUNT_CHANGED' },
      });
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  test('não invoca a RPC de ajuda quando o rascunho pertence à conta anterior', async () => {
    const rpc = jest.fn();
    window._KCSA.getClient = () => ({ rpc });
    window._KCSA.getCurrentUser = async () => ({ id: ACCOUNT_B, email: 'b@example.invalid' });
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.createHelpRequest({
      user_id: ACCOUNT_A,
      subject: 'Pedido',
      message: 'Mensagem',
      contact_email: 'a@example.invalid',
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'ACCOUNT_CHANGED' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('não atribui a uma conta um formulário iniciado como visitante', async () => {
    const rpc = jest.fn();
    window._KCSA.getClient = () => ({ rpc });
    window._KCSA.getCurrentUser = async () => ({ id: ACCOUNT_B, email: 'b@example.invalid' });
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.createHelpRequest({
      expected_auth_state: 'anonymous',
      subject: 'Pedido visitante',
      message: 'Mensagem iniciada antes de entrar na conta.',
      contact_email: 'guest@example.invalid',
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'ACCOUNT_CHANGED' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('propaga estado e usuário esperados no envio autenticado exato', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ out_id: '33333333-cccc-4333-8333-333333333333' }],
      error: null,
    });
    window._KCSA.getClient = () => ({ rpc });
    window._KCSA.getCurrentUser = async () => ({ id: ACCOUNT_A, email: 'a@example.invalid' });
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.createHelpRequest({
      expected_auth_state: 'authenticated',
      expected_user_id: ACCOUNT_A,
      subject: 'Pedido autenticado',
      message: 'Mensagem autenticada com identidade estável.',
      contact_email: 'a@example.invalid',
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'kc_create_help_request_with_notification_claim_v2',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          expected_auth_state: 'authenticated',
          expected_user_id: ACCOUNT_A,
        }),
      })
    );
  });

  test('mantém envio visitante explicitamente anônimo', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ out_id: '44444444-dddd-4444-8444-444444444444' }],
      error: null,
    });
    window._KCSA.getClient = () => ({ rpc });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.createHelpRequest({
      expected_auth_state: 'anonymous',
      subject: 'Pedido visitante',
      message: 'Mensagem visitante sem conta ativa.',
      contact_email: 'guest@example.invalid',
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'kc_create_help_request_with_notification_claim_v2',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          expected_auth_state: 'anonymous',
          expected_user_id: null,
        }),
      })
    );
  });
});

describe('supabase.admin.adapter.js — idempotência e recovery do Help LGPD', () => {
  const ACCOUNT_ID = '11111111-aaaa-4111-8111-111111111111';
  const HELP_ID = '33333333-cccc-4333-8333-333333333333';
  const DSR_ID = '44444444-dddd-4444-8444-444444444444';
  const PROTOCOL = 'KC-DSR-20260729-AAAAAAAAAAAAAAAA';
  const KEY = 'a'.repeat(64);

  function privacyPayload(overrides = {}) {
    return {
      expected_auth_state: 'anonymous',
      expected_user_id: null,
      idempotency_key: KEY,
      turnstile_token: 'turnstile-test-token',
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_deletion',
      subject: 'Excluir minha conta',
      message: 'Solicito a exclusão da conta e dos meus dados.',
      contact_email: 'privacy@example.invalid',
      priority: 'normal',
      metadata: { request_kind: 'account_erasure' },
      ...overrides,
    };
  }

  function anonymousReceipt(overrides = {}) {
    return {
      out_id: HELP_ID,
      out_created_at: '2026-07-29T19:06:53.000Z',
      out_notification_claim: null,
      out_notification_claim_expires_at: null,
      out_data_subject_request: null,
      out_protocol: null,
      out_reused_existing: false,
      out_idempotency_replayed: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetModules();
    window._KCSA = {};
    window.KCHelpUtils = undefined;
  });

  test.each([
    ['account_data_copy', 'data_access_copy'],
    ['account_data_portability', 'data_portability'],
    ['account_deletion', 'account_erasure'],
  ])(
    'roteia %s visitante somente à Edge e nunca transporta a prova no payload LGPD',
    async (subtopic, requestKind) => {
    const rpc = jest.fn();
    const invoke = jest.fn().mockResolvedValue({
      data: { ok: true, data: anonymousReceipt() },
      error: null,
    });
    window._KCSA.getClient = () => ({ rpc, functions: { invoke } });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.createHelpRequest(
      privacyPayload({
        subtopic,
        metadata: { request_kind: requestKind },
      })
    );

    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      'kc-create-privacy-help-guest',
      {
        body: {
          turnstile_token: 'turnstile-test-token',
          payload: expect.objectContaining({
          idempotency_key: KEY,
          expected_auth_state: 'anonymous',
          }),
        },
      }
    );
    const edgeBody = invoke.mock.calls[0][1].body;
    expect(edgeBody.payload).not.toHaveProperty('turnstile_token');
    expect(edgeBody.payload.metadata).not.toHaveProperty('turnstile_token');
    expect(rpc).not.toHaveBeenCalled();
    expect(result.data).not.toHaveProperty('idempotency_key');
    expect(result.data).not.toHaveProperty('turnstile_token');
  });

  test('valida a coerência DSR/protocolo no envelope autenticado', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [anonymousReceipt({
        out_data_subject_request: {
          id: DSR_ID,
          protocol: PROTOCOL,
          status: 'ready',
        },
        out_protocol: PROTOCOL,
      })],
      error: null,
    });
    const invoke = jest.fn();
    window._KCSA.getClient = () => ({ rpc, functions: { invoke } });
    window._KCSA.getCurrentUser = async () => ({
      id: ACCOUNT_ID,
      email: 'owner@example.invalid',
    });
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    await expect(
      window._KCSA.admin.createHelpRequest(
        privacyPayload({
          expected_auth_state: 'authenticated',
          expected_user_id: ACCOUNT_ID,
          subtopic: 'account_data_copy',
          metadata: { request_kind: 'data_access_copy' },
        })
      )
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: HELP_ID,
        protocol: PROTOCOL,
        data_subject_request: { id: DSR_ID, protocol: PROTOCOL },
      },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  test.each([
    { data: null, label: 'data null' },
    {
      data: [{ out_id: HELP_ID }],
      label: 'envelope parcial',
    },
  ])('preserva a chave diante de $label sem erro explícito', async ({ data }) => {
    const rpc = jest.fn();
    const invoke = jest.fn().mockResolvedValue({
      data: { ok: true, data },
      error: null,
    });
    window._KCSA.getClient = () => ({ rpc, functions: { invoke } });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    await expect(
      window._KCSA.admin.createHelpRequest(privacyPayload())
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'HELP_IDEMPOTENCY_RESPONSE_AMBIGUOUS' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('propaga safe_to_replace apenas pelo detalhe autoritativo do servidor', async () => {
    const rpc = jest.fn();
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          context: {
            json: async () => ({
              error: {
                code: 'HELP_REQUEST_VALIDATION_FAILED',
                idempotency: { safe_to_replace: true },
              },
              ok: false,
            }),
          },
        },
      })
      .mockResolvedValueOnce({
        data: null,
        error: {
          context: {
            json: async () => ({
              error: {
                code: 'HELP_IDEMPOTENCY_PAYLOAD_CONFLICT',
              },
              ok: false,
            }),
          },
        },
      })
      .mockResolvedValueOnce({
        data: null,
        error: {
          context: {
            json: async () => ({
              error: {
                code: 'HELP_RATE_LIMIT_1H',
                idempotency: { safe_to_replace: true },
              },
              ok: false,
            }),
          },
        },
      });
    window._KCSA.getClient = () => ({ rpc, functions: { invoke } });
    window._KCSA.getCurrentUser = async () => null;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');
    const admin = window._KCSA.admin;

    await expect(
      admin.createHelpRequest(privacyPayload())
    ).resolves.toMatchObject({
      ok: false,
      error: { idempotency: { safe_to_replace: true } },
    });
    await expect(
      admin.createHelpRequest(privacyPayload())
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'HELP_IDEMPOTENCY_PAYLOAD_CONFLICT',
        idempotency: { safe_to_replace: false },
      },
    });
    await expect(
      admin.createHelpRequest(privacyPayload())
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'HELP_RATE_LIMIT_1H',
        message: expect.stringMatching(/limite temporário.*aguarde/iu),
        idempotency: { safe_to_replace: true },
      },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('ignora detail de rotação no gateway e mapeia TURNSTILE_INVALID sem código cru', async () => {
    const rpc = jest.fn();
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          context: {
            json: async () => ({
              ok: false,
              error: {
                code: 'HELP_REQUEST_VALIDATION_FAILED',
                detail: 'HELP_IDEMPOTENCY_SAFE_TO_REPLACE',
              },
            }),
          },
        },
      })
      .mockResolvedValueOnce({
        data: null,
        error: {
          context: {
            json: async () => ({
              ok: false,
              error: {
                code: 'TURNSTILE_INVALID',
                message: 'A verificação antiabuso não foi aceita.',
              },
            }),
          },
        },
      });
    window._KCSA.getClient = () => ({ rpc, functions: { invoke } });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');
    const admin = window._KCSA.admin;

    await expect(
      admin.createHelpRequest(privacyPayload())
    ).resolves.toMatchObject({
      ok: false,
      error: { idempotency: { safe_to_replace: false } },
    });
    const invalid = await admin.createHelpRequest(privacyPayload());
    expect(invalid).toMatchObject({
      ok: false,
      error: {
        code: 'TURNSTILE_INVALID',
        message: expect.stringMatching(/nova verificação.*tente novamente/iu),
      },
    });
    expect(invalid.error.message).not.toContain('TURNSTILE_INVALID');
    expect(rpc).not.toHaveBeenCalled();
  });

  test('mapeia backpressure visitante sem expor o código interno', async () => {
    const rpc = jest.fn();
    const invoke = jest.fn().mockResolvedValue({
      data: null,
      error: {
        context: {
          json: async () => ({
            ok: false,
            error: {
              code: 'GUEST_PRIVACY_BUSY',
              message: 'Guest privacy capacity exhausted.',
            },
          }),
        },
      },
    });
    window._KCSA.getClient = () => ({ rpc, functions: { invoke } });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.createHelpRequest(
      privacyPayload()
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'GUEST_PRIVACY_BUSY',
        message: expect.stringMatching(
          /aguarde.*tente novamente.*entre na sua conta/iu
        ),
        idempotency: { safe_to_replace: false },
      },
    });
    expect(result.error.message).not.toContain('GUEST_PRIVACY_BUSY');
    expect(rpc).not.toHaveBeenCalled();
  });

  test('mapeia canal visitante sem secrets Turnstile sem expor o código interno', async () => {
    const rpc = jest.fn();
    const invoke = jest.fn().mockResolvedValue({
      data: null,
      error: {
        context: {
          json: async () => ({
            ok: false,
            error: {
              code: 'GUEST_PRIVACY_CONFIG_UNAVAILABLE',
              message: 'O canal protegido de privacidade não está configurado.',
            },
          }),
        },
      },
    });
    window._KCSA.getClient = () => ({ rpc, functions: { invoke } });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.createHelpRequest(
      privacyPayload()
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'GUEST_PRIVACY_CONFIG_UNAVAILABLE',
        message: expect.stringMatching(
          /visitantes.*n[aã]o est[aá] configurado|Entre na sua conta/iu
        ),
        idempotency: { safe_to_replace: false },
      },
    });
    expect(result.error.message).not.toContain('GUEST_PRIVACY_CONFIG_UNAVAILABLE');
    expect(rpc).not.toHaveBeenCalled();
  });

  test('falha fechado sem prova efêmera e não toca Edge nem RPC', async () => {
    const rpc = jest.fn();
    const invoke = jest.fn();
    window._KCSA.getClient = () => ({ rpc, functions: { invoke } });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    await expect(
      window._KCSA.admin.createHelpRequest(
        privacyPayload({ turnstile_token: '' })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'HELP_TURNSTILE_TOKEN_REQUIRED',
        message: expect.stringMatching(/verificação.*entre/iu),
      },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test('recovery recovered, retired e ambiguous têm shapes fechados', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({
        data: [anonymousReceipt({
          out_idempotency_replayed: true,
          out_recovery_state: 'recovered',
        })],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [anonymousReceipt({
          out_id: null,
          out_created_at: null,
          out_recovery_state: 'retired',
        })],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [anonymousReceipt({
          out_id: null,
          out_created_at: null,
          out_recovery_state: 'ambiguous',
        })],
        error: null,
      });
    window._KCSA.getClient = () => ({ rpc });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');
    const admin = window._KCSA.admin;
    const recovery = {
      idempotency_key: KEY,
      request_kind: 'account_erasure',
      expected_auth_state: 'anonymous',
      source_auth_state: 'anonymous',
    };

    await expect(
      admin.recoverPrivacyHelpRequest(recovery)
    ).resolves.toMatchObject({
      ok: true,
      data: { id: HELP_ID, idempotency_replayed: true },
    });
    await expect(
      admin.recoverPrivacyHelpRequest(recovery)
    ).resolves.toMatchObject({
      ok: false,
      error: { idempotency: { safe_to_replace: true } },
    });
    await expect(
      admin.recoverPrivacyHelpRequest(recovery)
    ).resolves.toMatchObject({
      ok: false,
      error: { idempotency: { safe_to_replace: false } },
    });
  });

  test('permite recovery anonymous→real somente para o mesmo UUID', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [anonymousReceipt({
        out_idempotency_replayed: true,
        out_recovery_state: 'recovered',
      })],
      error: null,
    });
    window._KCSA.getClient = () => ({ rpc });
    window._KCSA.getCurrentUser = async () => ({
      id: ACCOUNT_ID,
      email: 'upgraded@example.invalid',
      is_anonymous: false,
    });
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    await expect(
      window._KCSA.admin.recoverPrivacyHelpRequest({
        idempotency_key: KEY,
        request_kind: 'account_erasure',
        expected_auth_state: 'authenticated',
        expected_user_id: ACCOUNT_ID,
        source_auth_state: 'anonymous',
      })
    ).resolves.toMatchObject({ ok: true, data: { id: HELP_ID } });
    expect(rpc).toHaveBeenCalledWith(
      'kc_recover_privacy_help_request_v1',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          source_auth_state: 'anonymous',
          expected_user_id: ACCOUNT_ID,
        }),
      })
    );
  });
});

describe('supabase.admin.adapter.js - lookup administrativo exato por requestId', () => {
  const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    jest.resetModules();
    window._KCSA = {};
    window.KCHelpUtils = undefined;
  });

  test('ignora filtros e paginação e consulta somente o UUID exato', async () => {
    const row = {
      id: REQUEST_ID,
      status: 'resolved',
      type: 'account_access',
      priority: 'normal',
      subject: 'Linha autoritativa',
    };
    const limit = jest.fn().mockResolvedValue({ data: [row], error: null });
    const eq = jest.fn(() => ({ limit }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    const rpc = jest.fn(() => {
      throw new Error('o lookup exato não pode cair no RPC paginado');
    });
    window._KCSA.getClient = () => ({ from, rpc });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.listAdminHelpRequests({
      requestId: `  ${REQUEST_ID.toUpperCase()}  `,
      status: 'archived',
      type: 'report',
      priority: 'urgent',
      query: 'não corresponde à linha',
      limit: 1,
      offset: 999,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(row);
    expect(result).toMatchObject({
      ok: true,
      totalCount: 1,
      limit: 1,
      offset: 0,
      hasMore: false,
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('help_requests');
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('id', REQUEST_ID);
    expect(limit).toHaveBeenCalledWith(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('rejeita requestId inválido sem RPC nem consulta da listagem geral', async () => {
    const from = jest.fn(() => {
      throw new Error('ID inválido não pode consultar help_requests');
    });
    const rpc = jest.fn(() => {
      throw new Error('ID inválido não pode chamar o RPC paginado');
    });
    window._KCSA.getClient = () => ({ from, rpc });
    window._KCSA.getCurrentUser = async () => null;
    require('../../assets/js/adapters/supabase/supabase.admin.adapter.js');

    const result = await window._KCSA.admin.listAdminHelpRequests({
      requestId: 'not-a-valid-uuid',
      status: 'resolved',
      limit: 100,
      offset: 100,
    });

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
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
