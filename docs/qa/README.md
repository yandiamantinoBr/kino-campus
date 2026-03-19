# QA Reports Map

Este diretório preserva o histórico operacional de QA da linha `8.2.x` sem reescrever evidências antigas.

## Artefatos canônicos atuais

- `e2e-checklist.md`: checklist operacional principal.
- `rls-smoke.sql`: roteiro de validação RLS.
- `report-v8.2-final.md`: consolidado final da release validada.
- `bugs-v8.2.md`: tracker consolidado de bugs e gates.
- `report-v8.2.6.2-preview-run1.md`: rodada leve de preview do patch técnico pós-release `8.2.6.2`.
- `report-v8.2.6.2-preview-run2.md`: tentativa da rodada autenticada do patch `8.2.6.2`, bloqueada por ausência de credenciais reais no contexto do agente.
- `report-v8.2.6.2-preview-run3.md`: rodada autenticada final do patch `8.2.6.2`; login, shell autenticado e perfil próprio passaram, mas um perfil público com `author_id` legado (`USER_18`) terminou em `Perfil nao encontrado`.

## Sequência de runs da release 8.2.2.0

- `report-v8.2.2.0-run1.md`: primeira rodada formal da release cleanroom.
- `report-v8.2.2.0-run2.md`: rodada pública real em produção.
- `report-v8.2.2.0-run3.md`: rodada de reteste e fechamento do bug do perfil público.
- `report-v8.2.2.0-run4.md`: rodada autenticada final que sustentou o GO.

## Histórico preservado

- Arquivos com naming parecido, como `report-v8.2.2-run1.md` e `report-v8.2.2.0-run1.md`, são mantidos por rastreabilidade histórica.
- Nesta fase, esses arquivos não devem ser apagados nem renomeados sem uma consolidação documental explícita.

## Ordem de leitura recomendada

1. Comece em `report-v8.2-final.md`.
2. Consulte `bugs-v8.2.md` para o estado dos gates.
3. Use `report-v8.2.2.0-run1.md` até `report-v8.2.2.0-run4.md` para a trilha cronológica de execução.
4. Use `e2e-checklist.md` e `rls-smoke.sql` como scripts operacionais de reprodução.
