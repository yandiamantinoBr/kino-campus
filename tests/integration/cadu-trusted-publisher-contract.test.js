'use strict';

/**
 * Contrato do pipeline de publicacao do Cadu (v75.1):
 * - Migration: allowlist kc_trusted_publishers + isencao dos soft gates do
 *   anti-spam para bots confiaveis, mantendo flood control para todos.
 * - Edge Function cadu-publish: auth + allowlist + acoes + melhorias do mapper.
 * - Cliente de referencia nao expoe service_role.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('Cadu trusted publisher — migration', () => {
  let sql;
  beforeAll(() => {
    sql = r('supabase/migrations/20260530120000_cadu_trusted_publisher_pipeline.sql');
  });

  test('cria allowlist e helper interno', () => {
    expect(sql).toContain('create table if not exists public.kc_trusted_publishers');
    expect(sql).toContain('create or replace function kc_private.kc_is_trusted_publisher(p_user_id uuid)');
    expect(sql).toContain('alter table public.kc_trusted_publishers enable row level security');
  });

  test('recria o gate isentando os soft gates para bots confiaveis', () => {
    expect(sql).toContain('create or replace function public.kc_anti_spam_gate()');
    expect(sql).toContain('v_trusted := kc_private.kc_is_trusted_publisher(new.author_id);');
    expect(sql).toMatch(/if v_trusted then\s+return new;/);
  });

  test('mantem o flood control e os soft gates para os demais usuarios', () => {
    expect(sql).toContain('kc_private.kc_compute_post_flood_check(new.author_id, new.module)');
    expect(sql).toContain('flood_limit_exceeded');
    expect(sql).toContain("'link_spam'");
    expect(sql).toContain("'new_user_scrutiny'");
  });

  test('faz seed idempotente da conta do Cadu', () => {
    expect(sql).toContain('2345582d-8bf7-4393-aa0d-f9953d0e02ca');
    expect(sql).toContain('on conflict (user_id) do nothing');
  });

  test('apenas admin gerencia a allowlist (RLS)', () => {
    expect(sql).toContain('public.kc_is_admin((select auth.uid()))');
  });
});

describe('Cadu publish — Edge Function', () => {
  let index;
  let mapper;
  let schema;
  beforeAll(() => {
    index = r('supabase/functions/cadu-publish/index.ts');
    mapper = r('supabase/functions/cadu-publish/mapper.ts');
    schema = r('supabase/functions/cadu-publish/schema.ts');
  });

  test('valida JWT e exige conta confiavel (allowlist)', () => {
    expect(index).toContain('userClient.auth.getUser()');
    expect(index).toContain('isTrustedPublisher');
    expect(index).toContain('kc_trusted_publishers');
    expect(index).toContain("code: \"NOT_TRUSTED\"");
  });

  test('usa service role apenas no servidor (secret) e seta status published', () => {
    expect(index).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(index).toContain('status: "published"');
  });

  test('expoe as acoes publish/edit/list/check', () => {
    expect(index).toContain('case "publish"');
    expect(index).toContain('case "edit"');
    expect(index).toContain('case "list"');
    expect(index).toContain('case "check"');
  });

  test('publica com dedup e upload de imagem com fallback', () => {
    expect(index).toContain('findExisting');
    expect(index).toContain('code: "DUPLICATE"');
    expect(index).toContain('uploadCover');
    expect(index).toContain('post-media/');
  });

  test('mapper preenche data_fim_evento, modalidade e merge profundo', () => {
    expect(mapper).toContain('data_fim_evento');
    expect(mapper).toContain('modalidadeTrabalho');
    expect(mapper).toContain('resolveWorkMode');
    expect(mapper).toContain('deepMergeMetadata');
  });

  test('schema cobre os 6 modulos', () => {
    ['eventos', 'oportunidades', 'moradia', 'compra-venda', 'caronas', 'achados-perdidos'].forEach((m) => {
      expect(schema).toContain(`"${m}"`);
    });
  });
});

describe('Cadu publish — cliente de referencia', () => {
  let client;
  beforeAll(() => {
    client = r('services/cadu-ufg-publisher/scripts/publish_via_endpoint.example.js');
  });

  test('chama o endpoint cadu-publish autenticando a conta do Cadu', () => {
    expect(client).toContain('/functions/v1/cadu-publish');
    expect(client).toContain('signInWithPassword');
    expect(client).toContain('SUPABASE_ANON_KEY');
  });

  test('NAO referencia a service_role no cliente', () => {
    expect(client).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(client).not.toMatch(/service_role['"]\s*\)/);
  });
});
