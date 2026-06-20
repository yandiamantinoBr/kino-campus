# Report V76.35 — parser determinístico offline de consultas

**Data:** 2026-06-20  
**Escopo:** PR-C; interpretação offline contra corpus sintético  
**Runtime frontend:** `8.6.1` inalterado  
**Integração HTML/API:** nenhuma

## Resultado

`KCSearchQueryParser` interpreta consultas em português do Brasil e produz objeto
auditável com módulo, intenção, filtros e confiança. Categorias/tipos são validados
contra o `KCSearchFieldRegistry`; regras manuais ficam limitadas a operadores
linguísticos, aliases institucionais, datas, horários, valores e erros controlados.

## Métricas do corpus v1

| Métrica | Resultado |
|---|---:|
| consultas principais | 18 |
| módulo correto nas principais | 18/18 |
| intenção correta nas principais | 18/18 |
| conjunto exato de filtros nas principais | 18/18 |
| variantes sintéticas | 22 |
| módulo correto nas variantes | 22/22 |
| intenção correta nas variantes | 22/22 |

Esses números medem apenas o corpus sintético versionado. Não representam precisão
em tráfego real e não autorizam ativação pública.

## Operadores cobertos

- módulos e categorias dos seis formulários;
- intenção de oferta/procura, perdido/encontrado e tipos de oportunidade/evento;
- preço máximo/exato, recompensa e vagas;
- gratuidade, condição, modalidade e regime;
- datas relativas, dia da semana, dia do mês, horário e período;
- origem/destino, câmpus, cidades, região e local conhecido;
- área e características canônicas presentes no corpus;
- acentos, aliases e distância de edição limitada.

## Segurança e limites

- entrada truncada em 240 caracteres antes das regras;
- consulta vazia retorna contrato neutro;
- consulta desconhecida não é forçada ao primeiro módulo;
- saída não contém usuário, sessão, contato, e-mail, atributo sensível ou token;
- não há aprendizado, perfil, histórico ou chamada de rede;
- asset permanece ausente de todos os HTMLs.

## Validação

| Verificação | Resultado |
|---|---|
| `node --check assets/js/shared/kc-search-query-parser.shared.js` | aprovado |
| Jest focado | 1 suite / 41 testes aprovados |
| `git diff --check` | aprovado |
| `npm run check:all` | aprovado; 184 suites / 3.732 testes / 3 snapshots |
| `npx playwright test --list` | aprovado; 10 specs / 68 testes |

## Próximo gate

PR-D pode combinar parser e projeção em pipeline shadow testável. Não deve carregar
assets nos HTMLs, ativar `search.schemaFields`, alterar resultados, Supabase ou UI.
Antes de ativação real, é obrigatório resolver o plano de carregamento das 16
páginas consumidoras da busca e executar E2E/latência.

## Rollback

Remover parser, suíte e referências documentais. Nenhum dado, migration, cache,
flag ou estado remoto precisa ser restaurado.
