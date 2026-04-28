# QA Map

Este diretorio contem os artefatos operacionais ativos de QA. Historico V8/V11/V15 fica em
`docs/archive/qa-legacy/`.

## Artefatos canonicos atuais

- `e2e-checklist.md`: checklist operacional principal V26.
- `v19-authenticated-qa-plan.md`: plano-fonte da trilha autenticada criada na V19.
- `v25-real-environment-qa-runbook.md`: roteiro atual para execucao real com credenciais e evidencias redigidas.
- `v27-visual-a11y-regression-gate.md`: gate minimo antes de CSS, split visual ou refactor de layout.
- `rls-smoke.sql`: roteiro de validacao RLS.
- `xss-payloads.md`: payloads de apoio para validacao de sanitizacao.
- `reports/`: reports ativos e template V26 de evidencia autenticada real.

## Historico preservado

- Checklists, mapas, bugs, reports e evidencias V8/V11/V15 foram movidos via `git mv` para `docs/archive/qa-legacy/` em V20.
- Esses arquivos nao devem voltar para `docs/qa/` sem revalidacao contra o checklist V20.

## Ordem de leitura recomendada

1. Use `v25-real-environment-qa-runbook.md` como roteiro principal da proxima execucao real autenticada.
2. Use `e2e-checklist.md` como checklist operacional complementar.
3. Consulte `v19-authenticated-qa-plan.md` para contexto e pre-requisitos.
4. Antes de qualquer CSS, use `v27-visual-a11y-regression-gate.md`.
5. Rode `rls-smoke.sql` apenas em ambiente autorizado.
6. Registre evidencias em `reports/` usando `_TEMPLATE-authenticated-run.md` e o padrao `report-v26-auth-runN.md`.
7. Use `../archive/qa-legacy/_INDEX.md` apenas para rastreabilidade historica.
