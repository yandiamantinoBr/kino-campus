/*
  content-freshness.test.js — Contratos da propagação cross-cliente de mudanças
  de publicações (v76.3).

  Estratégia: leitura estática dos fontes (sem DOM). O broadcast do Supabase
  Realtime exige 2 clientes ao vivo, então aqui cobrimos o contrato/anti-loop:
  - KCPostFreshness (kc-api.session.js) transporta via broadcast 'kc-posts-changes'
   - emitPostFreshness publica no Realtime apenas para origem local (anti-loop)
   - feed revalida em visibilitychange (troca de aba / retorno no mobile)
   - deletePost é soft-delete (status 'deleted' + metadata)
   - o mapa de cache/freshness existe e cobre os novos pontos
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SESSION = path.join(ROOT, 'assets', 'js', 'api', 'kc-api.session.js');
const FEED = path.join(ROOT, 'assets', 'js', 'controllers', 'public', 'kc-feed.controller.js');
const DELETE_ADAPTER = path.join(ROOT, 'assets', 'js', 'adapters', 'supabase', 'supabase.posts-write.adapter.js');
const DOC = path.join(ROOT, 'docs', 'architecture', 'content-cache-freshness-map.md');

function read(p) { return fs.readFileSync(p, 'utf8'); }

describe('Broadcast cross-cliente — kc-api.session.js (KCPostFreshness)', () => {
  let s;
  beforeAll(() => { s = read(SESSION); });

  test('define o tópico fixo kc-posts-changes', () => {
    expect(s).toContain("POST_FRESHNESS_RT_TOPIC = 'kc-posts-changes'");
  });

  test('cria canal de broadcast com self:false e evento post_change', () => {
    expect(s).toContain('function ensureRealtimeFreshnessChannel');
    expect(s).toContain('broadcast: { self: false }');
    expect(s).toContain("{ event: 'post_change' }");
  });

  test('receptor faz dispatch direto com source realtime-broadcast (anti-loop)', () => {
    expect(s).toContain("source: 'realtime-broadcast'");
    expect(s).toContain('dispatchPostFreshness(payload)');
  });

  test('define publishRealtimeFreshness usando KCSupabase.getClient', () => {
    expect(s).toContain('function publishRealtimeFreshness');
    expect(s).toContain('window.KCSupabase.getClient');
  });

  test('emitPostFreshness publica apenas mudanças de origem local (guard anti-loop)', () => {
    expect(s).toContain('publishRealtimeFreshness(payload)');
    expect(s).toContain('isLocalOrigin');
    expect(s).toContain("freshSource.indexOf('realtime') === -1");
    expect(s).toContain("freshSource !== 'broadcast'");
  });
});

describe('Revalidação por visibilidade — kc-feed.controller.js', () => {
  let s;
  beforeAll(() => { s = read(FEED); });

  test('define handler onVisibility', () => {
    expect(s).toContain('const onVisibility =');
    expect(s).toContain("document.visibilityState !== 'visible'");
  });

  test('registra e remove o listener de visibilitychange', () => {
    expect(s).toContain("document.addEventListener('visibilitychange', onVisibility)");
    expect(s).toContain("document.removeEventListener('visibilitychange', onVisibility)");
  });
});

describe('Soft delete — supabase.posts-write.adapter.js', () => {
  let s;
  beforeAll(() => { s = read(DELETE_ADAPTER); });

  test('deletePost faz soft delete (status deleted + metadata)', () => {
    const start = s.indexOf('async function deletePost');
    const end = s.indexOf('async function reportPost', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = s.slice(start, end);
    expect(body).toContain("status: 'deleted'");
    expect(body).toContain('softDeleted: true');
    expect(body).toContain('softDeletedMetadata');
  });
});

describe('Documentação — mapa de cache/freshness', () => {
  test('o mapa existe e cobre os novos pontos', () => {
    expect(fs.existsSync(DOC)).toBe(true);
    const doc = read(DOC);
    expect(doc).toContain('kc-posts-changes');
    expect(doc).toContain('visibilitychange');
    expect(doc).toContain('broadcast');
  });
});
