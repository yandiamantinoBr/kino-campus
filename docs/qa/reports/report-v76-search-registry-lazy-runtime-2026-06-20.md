# V76.38 — Snapshot verificável e lazy runtime da busca

**Data:** 2026-06-20

**Decisão de runtime:** flag canônica desligada; zero alteração de resultado

## Snapshot

`scripts/generate-search-registry-snapshot.js` executa o schema e o builder reais,
combina suas estruturas com as políticas de `KCSearchFieldRegistry` e gera
`assets/js/shared/kc-search-registry.generated.js`.

O artefato minificado possui 25.597 bytes, é UMD, profundamente congelado e não contém data de
geração. Seu hash SHA-256 cobre os três arquivos-fonte; por isso a saída é
determinística entre Windows/Linux e qualquer alteração relevante exige regeneração
explícita. Finais de linha são normalizados antes de execução e hash.

`npm run check:search-registry` compara bytes gerados e versionados. O comando foi
incluído em `check:all`, tornando drift uma falha de CI.

## Lazy runtime

`kc-search.js` reconhece `search.structuredRuntime`, cujo default é `false`. Somente
com a flag ligada e ao entrar na página de resultados ou acionar o dropdown ele
carrega, em ordem:

1. snapshot gerado;
2. projetor de campos;
3. parser de consulta;
4. pipeline shadow.

Os assets são locais, recebem versão do runtime e são carregados uma única vez. Erro,
timeout ou global ausente resolvem para `null` e preservam a busca legada. O runtime
montado não chama `runShadow` neste gate.

## Rede e privacidade

- flag desligada: nenhum elemento `<script>` é criado;
- nenhum HTML referencia o snapshot ou os três contratos offline;
- nenhuma consulta, post, perfil, sessão ou analytics entra no loader;
- contato/link continuam proibidos pelas políticas reproduzidas no snapshot;
- não houve migration, RPC, Supabase ou mudança de consentimento.

## Evidência automatizada

- snapshot/paridade: 6/6 contratos;
- lazy loader: 5/5 contratos;
- suites focadas adicionais: 11/11 testes;
- baseline validado: 188 suites / 3.761 testes / 3 snapshots;
- Playwright validado: 10 specs / 68 testes listados.

## Próximo gate

PR-G deve usar o runtime carregado apenas sob flag, com fallback legado e E2E das duas
superfícies. A configuração canônica permanecerá desligada até comparação controlada.
Personalização, coleta comportamental e SQL pessoal continuam em No-Go.
