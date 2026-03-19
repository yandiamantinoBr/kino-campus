# QA Reports Map

Este diretorio preserva o historico operacional de QA da linha `8.2.x` sem reescrever evidencias antigas.

## Canonicos atuais

- `e2e-checklist.md`: checklist operacional principal.
- `rls-smoke.sql`: roteiro de validacao RLS.
- `report-v8.2-final.md`: consolidado final da release validada.
- `bugs-v8.2.md`: tracker consolidado de bugs e gates.

## Sequencia de runs da release 8.2.2.0

- `report-v8.2.2.0-run1.md`: primeira rodada formal da release cleanroom.
- `report-v8.2.2.0-run2.md`: rodada publica real em producao.
- `report-v8.2.2.0-run3.md`: rodada de reteste e fechamento do bug do perfil publico.
- `report-v8.2.2.0-run4.md`: rodada autenticada final que sustentou o GO.

## Historico preservado

- Arquivos com naming parecido, como `report-v8.2.2-run1.md` e `report-v8.2.2.0-run1.md`, sao mantidos por rastreabilidade historica.
- Nesta fase de higiene, eles nao devem ser apagados nem renomeados sem uma consolidacao documental explicita.

## Leitura recomendada

1. Comece em `report-v8.2-final.md`.
2. Consulte `bugs-v8.2.md` para estado dos gates.
3. Use `report-v8.2.2.0-run1.md` a `report-v8.2.2.0-run4.md` para a trilha cronologica de execucao.
4. Use `e2e-checklist.md` e `rls-smoke.sql` como scripts operacionais de reproducao.
