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
