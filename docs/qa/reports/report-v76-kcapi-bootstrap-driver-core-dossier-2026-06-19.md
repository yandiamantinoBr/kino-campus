# Report V76.29 — JS-I.4 do `bootstrap-driver-core`

**Data:** 2026-06-19
**Escopo:** auditoria e documentação; sem alteração de runtime, adapters, HTML, CSS, SQL, secrets ou deploy
**Runtime frontend:** `8.6.1` inalterado

## Resultado

O único candidato JS residual do plano V76 foi decomposto analiticamente, não
em arquivos de runtime. O auditor agora produz `bootstrapCore` no JSON e uma
seção Markdown própria com decisão, domínios, funções, linhas, exports, sinais
de risco e gates.

Decisão: `no-go-runtime-extraction`.

## Métricas

| Métrica | Resultado |
|---|---:|
| Funções do bucket | 12 |
| Linhas | 131 |
| Funções públicas | 6 |
| Domínios | 5 |
| Gates obrigatórios | 15 |
| Funções sem domínio | 0 |

| Domínio | Risco | Funções | Linhas |
|---|---|---:|---:|
| environment policy | crítico | 3 | 69 |
| transport/config | alto | 4 | 26 |
| error contract | médio | 1 | 3 |
| static database fallback | alto | 2 | 25 |
| adapter registry | crítico | 2 | 8 |

## Sinais automatizados

O inventário detecta, sem executar o runtime:

- leitura/normalização de ambiente;
- leitura e mutação de `cfg`;
- uso de `fetch` e timers;
- dependência de `database.json`;
- normalização de posts/autores;
- mutação do registry de adapters;
- seleção local/Supabase;
- política fail-closed de produção.

## Contrato estrutural

Cinco testes novos garantem que:

- a decisão permanece No-Go para 12 funções / 131 linhas;
- os cinco domínios e seus membros não derivam silenciosamente;
- todas as funções estão mapeadas;
- sinais críticos continuam observáveis;
- os 15 gates e `transport-config` como primeira reavaliação permanecem explícitos.

## Validação técnica

| Verificação | Resultado |
|---|---|
| `node --check scripts/audit-kcapi-facade-residual.js` | aprovado |
| `npm run audit:kcapi-residual` | aprovado; seção Markdown emitida |
| `npm run audit:kcapi-residual -- --json` | aprovado; `bootstrapCore` emitido |
| Jest focado | 1 suite / 93 testes aprovados |
| `npm run check:all` | 180 suites / 3.630 testes / 3 snapshots aprovados |
| CI do PR | pendente na criação deste relatório |

## Próxima etapa

Não extrair o bucket. Se a frente JS continuar, criar primeiro testes
comportamentais de `transport-config` para `setConfig`, timeout, erro HTTP e URL
relativa. CSS-B admin autenticado continua dependente de sessão controlada.

## Rollback

Reverter somente o dossiê emitido pelo auditor, testes e documentação. Nenhum
asset de produção ou contrato público foi alterado.
