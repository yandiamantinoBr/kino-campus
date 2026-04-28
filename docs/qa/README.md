# QA Reports Map

Este diretorio preserva o historico operacional de QA do projeto sem reescrever evidencias antigas.

## Artefatos canonicos atuais

- `e2e-checklist.md`: checklist operacional principal.
- `v19-authenticated-qa-plan.md`: plano atual para QA autenticado real da trilha V19.
- `rls-smoke.sql`: roteiro de validacao RLS.
- `xss-payloads.md`: payloads de apoio para validacao de sanitizacao.
- `reports/`: evidencias e reports manuais preservados.

## Historico preservado

- `bugs-v8.2.md`, `how-to-run-v8.2.0.7.md`, `navigation-map-v8.2.md`, `pages-matrix-v8.2.md`, `v8.1.11.1-admin-reports-threshold.md` e reports v11 continuam mantidos por rastreabilidade historica.
- Esses arquivos nao devem ser apagados nem renomeados sem consolidacao documental explicita ou movimentacao planejada para `docs/archive/`.

## Ordem de leitura recomendada

1. Leia `v19-authenticated-qa-plan.md` para a proxima execucao real autenticada.
2. Consulte `e2e-checklist.md` e `rls-smoke.sql` para reproducao operacional.
3. Consulte `reports/README.md` para localizar evidencias antigas.
4. Use os documentos v8/v11 apenas como referencia historica.
