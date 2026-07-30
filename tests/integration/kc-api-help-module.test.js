/**
 * @file kc-api-help-module.test.js
 * @description Static contract tests for assets/js/api/kc-api.help.js (v11.32.4)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.help.js');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');
const HTML_FILES = Object.freeze(PAGE_MANIFEST.ALL_HTML_PAGES.filter((page) => page !== 'admin/cadu.html'));

let source;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
});

describe('kc-api.help.js - source shape', () => {
  test('mantem IIFE, strict mode e namespace interno _KCAPI', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.help = {');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('nao cria nova fachada publica nem usa require/import', () => {
    expect(source).not.toContain('window.KCAPI =');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });
});

describe('kc-api.help.js - exported help/invites domain', () => {
  test('exporta apenas o grupo de help-requests e invites', () => {
    [
      'createHelpRequest,',
      'recoverPrivacyHelpRequest,',
      'listAdminHelpRequests,',
      'updateAdminHelpRequest,',
      'processAccountErasure,',
      'listExternalAccessRequests,',
      'decideExternalAccessRequest,',
      'inviteExternalUser,',
      'getInvites,',
      'revokeInvite,',
    ].forEach((token) => expect(source).toContain(token));
  });

  test('mantem helper de driver ativo via deps', () => {
    expect(source).toContain('function getActiveDriverOrNull(deps) {');
    expect(source).toContain("if (!deps || typeof deps.getActiveDriver !== 'function') return null;");
  });

  test('mantem fallbacks canonicos de indisponibilidade por driver', () => {
    expect(source).toContain("code: 'BACKEND_REQUIRED'");
    expect(source).toContain('safe_to_replace: false');
    expect(source).toContain('response_confirmed: false');
    expect(source).toContain("return { ok: false, error: { message: 'Pedidos de ajuda indisponíveis neste driver.' } };");
    expect(source).toContain("return { ok: false, error: { message: 'Triagem de ajuda indisponível neste driver.' } };");
    expect(source).toContain("return { ok: false, error: 'DRIVER_NAO_SUPORTA' };");
    expect(source).toContain("return { ok: false, error: { message: 'Fluxo LGPD indisponivel neste driver.' } };");
    expect(source).toContain("return { ok: false, error: { message: 'Funcionalidade indisponível neste driver.' }, items: [], total: 0 };");
    expect(source).toContain("return { ok: false, error: { message: 'Funcionalidade indisponível neste driver.' } };");
    expect(source).toContain('items: [], total: 0');
    expect(source).toContain('return { data: [], error: null };');
    expect(source).toContain('rows: []');
    expect(source).toContain('if (!driver || typeof driver.listAdminHelpRequests');
  });

  test('mantem delegacao por driver ativo em cada metodo', () => {
    expect(source).toContain('return driver.createHelpRequest(payload);');
    expect(source).toContain('return driver.recoverPrivacyHelpRequest(payload);');
    expect(source).toContain('return driver.listAdminHelpRequests(filters);');
    expect(source).toContain('return driver.updateAdminHelpRequest(id, patch);');
    expect(source).toContain('return driver.processAccountErasure(payload);');
    expect(source).toContain('return driver.listDataSubjectRequests(options);');
    expect(source).toContain('return driver.getDataSubjectRequest(protocol, options);');
    expect(source).toContain('return driver.downloadDataSubjectExport(protocol, options);');
    expect(source).toContain('return driver.downloadDataSubjectSupplement(protocol, artifactRef, options);');
    expect(source).toContain('return driver.cancelDataSubjectRequest(protocol, options);');
    expect(source).toContain('return driver.listExternalAccessRequests(filters);');
    expect(source).toContain('return driver.decideExternalAccessRequest(payload);');
    expect(source).toContain('return driver.inviteExternalUser(email, note);');
    expect(source).toContain('return driver.getInvites();');
    expect(source).toContain('return driver.revokeInvite(email);');
  });
});

describe('kc-api.help.js - html loading order', () => {
  test('os carregadores reais incluem kc-api.help.js antes de kc-api.client.js', () => {
    HTML_FILES.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      const helpIdx = html.indexOf('kc-api.help.js');
      const clientIdx = html.indexOf('kc-api.client.js');

      expect(helpIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeGreaterThan(-1);
      expect(helpIdx).toBeLessThan(clientIdx);
    });
  });

  test('os carregadores reais mantem kc-api.saved.js antes de kc-api.help.js', () => {
    HTML_FILES.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      const savedIdx = html.indexOf('kc-api.saved.js');
      const helpIdx = html.indexOf('kc-api.help.js');

      expect(savedIdx).toBeGreaterThan(-1);
      expect(helpIdx).toBeGreaterThan(-1);
      expect(savedIdx).toBeLessThan(helpIdx);
    });
  });
});
