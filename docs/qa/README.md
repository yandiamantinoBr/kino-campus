# QA Map

Este diretorio contem os artefatos operacionais ativos de QA. Historico V8/V11/V15 fica em
`docs/archive/qa-legacy/`.

## Artefatos canonicos atuais

- `e2e-checklist.md`: checklist operacional principal V20.
- `v19-authenticated-qa-plan.md`: plano-fonte da trilha autenticada criada na V19.
- `rls-smoke.sql`: roteiro de validacao RLS.
- `xss-payloads.md`: payloads de apoio para validacao de sanitizacao.
- `reports/`: reports ativos e templates de evidencia.

## Historico preservado

- Checklists, mapas, bugs, reports e evidencias V8/V11/V15 foram movidos via `git mv` para `docs/archive/qa-legacy/` em V20.
- Esses arquivos nao devem voltar para `docs/qa/` sem revalidacao contra o checklist V20.

## Ordem de leitura recomendada

1. Use `e2e-checklist.md` como roteiro da proxima execucao real autenticada.
2. Consulte `v19-authenticated-qa-plan.md` para contexto e pre-requisitos.
3. Rode `rls-smoke.sql` apenas em ambiente autorizado.
4. Registre evidencias em `reports/` usando `_TEMPLATE-authenticated-run.md`.
5. Use `../archive/qa-legacy/_INDEX.md` apenas para rastreabilidade historica.
