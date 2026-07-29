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
