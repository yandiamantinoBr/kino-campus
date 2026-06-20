# Report V76.34 — projeção estruturada da busca local

**Data:** 2026-06-20  
**Escopo:** PR-B; projeção e integração local sob flag  
**Runtime frontend:** `8.6.1` inalterado  
**Flag:** `search.schemaFields=false` por padrão

## Resultado

O registro V76.33 agora projeta campos permitidos em `kcSearchProjection`, com
`searchText`, `fields` e `filters`. O driver local pode anexar essa projeção antes
de chamar `KCSearchShared.searchCollection`, mas somente se a flag estiver ativa e
o registry estiver disponível.

No estado publicado desta versão, a flag está desligada e o asset do registry não
é carregado por nenhum HTML. Portanto, resultados, latência de rede e DOM continuam
iguais. A integração existe para avaliação isolada e futura ativação controlada.

## Contrato

- `projectPost` lê somente os `payloadPaths` permitidos pelas policies.
- Campos indexáveis formam `searchText`; campos filtráveis formam `filters`.
- Título e descrição ficam fora do `searchText` projetado porque já são pontuados pelo ranking legado.
- `contato`, `link` e `link_as_cta` não entram na projeção.
- Gratuidade gera termos `gratuito`/`gratis`; o valor falso gera `pago`.
- `projectCollection` clona posts e congela a projeção, sem mutar a coleção fonte.
- `KCSearchShared` dá à projeção peso inferior a título, tags e correspondência lexical principal.
- Flag desligada não chama o projetor.
- Flag ligada sem registry usa silenciosamente a busca anterior.

## Isolamento

| Superfície | Estado V76.34 |
|---|---|
| driver local | integração condicionada à flag |
| Supabase/RPC | inalterado |
| HTML | não carrega o novo asset |
| dropdown/resultados | comportamento atual |
| parser/facetas | ainda não implementados |
| perfil/personalização | No-Go |
| analytics/consentimento | inalterados |

O inventário encontrou 16 páginas com `kc-search.shared.js`, mas apenas 12 com o
builder de criação. A ativação global do registry fica bloqueada até existir um
plano de carregamento que não duplique taxonomia nem acrescente custo desnecessário.

## Testes adicionados

- quatro contratos de projeção, privacidade, imutabilidade e flag padrão;
- dois testes do ranking com/sem projeção;
- três testes do driver para flag off, flag on e fallback sem registry.

## Validação

| Verificação | Resultado |
|---|---|
| `node --check` nos cinco JS tocados | aprovado |
| Jest focado | 3 suites / 95 testes aprovados |
| `git diff --check` | aprovado |
| `npm run check:all` | aprovado; 183 suites / 3.691 testes / 3 snapshots |
| `npx playwright test --list` | aprovado; 10 specs / 68 testes |

## Próximo gate

PR-C deve implementar parser determinístico offline e medir precisão contra as 18
consultas do corpus. Não deve carregar assets em HTML, alterar Supabase ou ativar a
flag. A ativação real só pode ocorrer depois de orçamento de carregamento e E2E.

## Rollback

Remover a flag, os helpers de projeção, a integração condicional no adapter e os
testes/documentação. Como a flag está off e não há HTML consumidor, não existe
dado, cache, migration ou estado remoto a restaurar.
