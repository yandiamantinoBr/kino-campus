/**
 * V76.41 — static contract for the isolated SQL/RPC dossier.
 * This suite deliberately does not connect to Supabase and does not authorize a migration.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTRACT_PATH = path.join(ROOT, 'tests/fixtures/search-structured-rpc-contract.v1.json');
const SNAPSHOT_PATH = path.join(ROOT, 'assets/js/shared/kc-search-registry.generated.js');
const DOSSIER_PATH = path.join(ROOT, 'docs/planning/v76-search-sql-rpc-isolated-dossier.md');
const EVIDENCE_PATH = path.join(ROOT, 'docs/qa/reports/_TEMPLATE-search-structured-rpc-evidence.md');
const MIGRATIONS_PATH = path.join(ROOT, 'supabase/migrations');
const CURRENT_RPC_PATH = path.join(MIGRATIONS_PATH, '20260601172451_search_fuzzy_query_terms_threshold.sql');
const INITIAL_RPC_PATH = path.join(MIGRATIONS_PATH, 'v9.2.0.0_search_posts_fts.sql');

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const snapshot = require(SNAPSHOT_PATH).registry;
const dossier = fs.readFileSync(DOSSIER_PATH, 'utf8');
const evidence = fs.readFileSync(EVIDENCE_PATH, 'utf8');

describe('V76.41 — contrato SQL/RPC somente de desenho', () => {
  test('não autoriza produção, migration ou ativação', () => {
    expect(contract.status).toBe('design-only');
    expect(contract.productionAuthorized).toBe(false);
    expect(dossier).toContain('**Decisão atual:** **Go documental / No-Go para migration**');
    expect(dossier).toContain('não é uma migration');
  });

  test('usa nome versionado sem sobrecarregar o RPC legado', () => {
    expect(contract.rpc.candidateName).toBe('public.kc_search_posts_structured_v1');
    expect(contract.rpc.legacyName).toBe('public.kc_search_posts_fts');
    expect(contract.rpc.candidateName).not.toBe(contract.rpc.legacyName);
    const migrationSources = fs.readdirSync(MIGRATIONS_PATH)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => fs.readFileSync(path.join(MIGRATIONS_PATH, name), 'utf8'))
      .join('\n');
    expect(migrationSources).not.toContain('kc_search_posts_structured_v1');
  });

  test('deriva exatamente grupos e campos filtráveis do snapshot canônico', () => {
    expect(Object.keys(contract.modules).sort()).toEqual(snapshot.moduleKeys);
    snapshot.moduleKeys.forEach((moduleKey) => {
      const module = snapshot.modules[moduleKey];
      expect(contract.modules[moduleKey].groups).toEqual(
        module.tagGroups.filter((group) => group.filterable).map((group) => group.id)
      );
      expect(contract.modules[moduleKey].fields).toEqual(
        module.fields.filter((field) => field.policy.filterable).map((field) => field.name)
      );
      module.fields.filter((field) => field.policy.filterable).forEach((field) => {
        const typedOperators = field.policy.operators.filter((operator) => operator !== 'text');
        expect(typedOperators.length).toBeGreaterThan(0);
        typedOperators.forEach((operator) => expect(contract.operators).toHaveProperty(operator));
      });
    });
  });

  test('exclui campos restritos e atributos sensíveis', () => {
    const allowed = JSON.stringify(contract.modules).toLowerCase();
    contract.forbiddenFields.forEach((field) => expect(allowed).not.toContain(field.toLowerCase()));
    expect(contract.forbiddenFields).toEqual(expect.arrayContaining(['contato', 'link', 'token', 'password']));
  });

  test('fixa invoker, search_path vazio, whitelist e limites de abuso', () => {
    expect(contract.rpc.security).toBe('invoker');
    expect(contract.rpc.searchPath).toBe('');
    expect(contract.rpc.dynamicSqlAllowed).toBe(false);
    expect(contract.rpc.publicExecuteAllowed).toBe(false);
    expect(contract.rpc.roles).toEqual(['anon', 'authenticated']);
    Object.values(contract.rpc.limits).forEach((limit) => expect(limit).toBeGreaterThan(0));
    expect(dossier).toContain('REVOKE ALL ON FUNCTION');
    expect(dossier).toContain("SET search_path = ''");
  });

  test('cobre a matriz mínima de RLS para anon, usuário, autor e admin', () => {
    expect(contract.rlsMatrix).toHaveLength(8);
    expect(new Set(contract.rlsMatrix.map((row) => row.actor))).toEqual(
      new Set(['anon', 'authenticated', 'admin'])
    );
    expect(contract.rlsMatrix).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor: 'anon', visibility: 'community', allowed: false }),
      expect.objectContaining({ actor: 'authenticated', owner: true, status: 'hidden', allowed: true }),
      expect.objectContaining({ actor: 'admin', status: 'hidden', allowed: true })
    ]));
  });

  test('mantém todos os gates de banco explicitamente pendentes', () => {
    expect(Object.values(contract.databaseGates).every((value) => value === false)).toBe(true);
    expect(dossier).toContain('Docker Desktop engine indisponível');
    expect(evidence).toContain('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)');
    expect(evidence).toContain('Rollback R3 executado');
  });

  test('registra os riscos observáveis do RPC atual sem inventar estado remoto', () => {
    const currentRpc = fs.readFileSync(CURRENT_RPC_PATH, 'utf8');
    const initialRpc = fs.readFileSync(INITIAL_RPC_PATH, 'utf8');
    const currentSearchDefinition = currentRpc.split('$function$;')[0];
    expect(currentRpc).toContain('create or replace function public.kc_search_posts_fts');
    expect(currentSearchDefinition.toLowerCase()).not.toContain('security definer');
    expect(initialRpc).toContain('GRANT EXECUTE ON FUNCTION public.kc_search_posts_fts');
    expect(initialRpc).not.toContain('REVOKE ALL ON FUNCTION public.kc_search_posts_fts');
    expect(dossier).toContain('estado remoto deve ser consultado no banco isolado');
  });
});
