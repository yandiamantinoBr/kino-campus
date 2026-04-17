# QA Reports Map

Este diretorio preserva o historico operacional de QA do projeto sem reescrever evidencias antigas.

## Artefatos canonicos atuais

- `e2e-checklist.md`: checklist operacional principal.
- `operational-smoke-gate-v11.32.md`: gate operacional minimo para a trilha `v11.32.x`, combinando Jest, hygiene, smoke HTTP e browser smoke quando o ambiente permitir.
- `rls-smoke.sql`: roteiro de validacao RLS.
- `report-v8.2-final.md`: consolidado historico da release validada da linha 8.2.x.
- `bugs-v8.2.md`: tracker consolidado de bugs e gates da linha 8.2.x.
- `report-v11.23.0-run1.md`: release gate final da rodada principal da v11, com regressao completa, hygiene, smoke HTTP e residuals operacionais do Supabase.

## Historico preservado

- Os arquivos `report-v8.2.*`, `report-phase*` e documentos correlatos continuam mantidos por rastreabilidade historica.
- Esses arquivos nao devem ser apagados nem renomeados sem consolidacao documental explicita.

## Ordem de leitura recomendada

1. Leia `report-v11.23.0-run1.md` para o release gate atual da v11.
2. Consulte `operational-smoke-gate-v11.32.md` para o gate operacional atual da trilha ativa.
3. Consulte `e2e-checklist.md` e `rls-smoke.sql` para reproducao operacional.
4. Use `report-v8.2-final.md` e `bugs-v8.2.md` apenas como referencia historica da linha 8.2.x.
