# QA Map

Este diretorio contem os artefatos operacionais ativos de QA. Historico V8/V11/V15 fica em
`docs/archive/qa-legacy/`.

## Artefatos canonicos atuais

- `e2e-checklist.md`: checklist operacional principal V26.
- `v19-authenticated-qa-plan.md`: plano-fonte da trilha autenticada criada na V19.
- `v25-real-environment-qa-runbook.md`: roteiro atual para execucao real com credenciais e evidencias redigidas.
- `v27-visual-a11y-regression-gate.md`: gate minimo antes de CSS, split visual ou refactor de layout.
- `v31-authenticated-flow-triage-matrix.md`: matriz P0/P1 para triagem de signup, callback, perfil, admin, interacoes, RLS, busca e notificacoes.
- `v32-e2e-gate-policy.md`: politica de quando Playwright E2E e obrigatorio, recomendado ou dispensavel.
- `v33-lhci-baseline-policy.md`: politica de evidencia Lighthouse/LHCI e classificacao de falhas de ambiente.
- `v34-a11y-i18n-reconciliation-plan.md`: plano para reconciliar auditorias historicas de a11y/i18n com gaps atuais.
- `rls-smoke.sql`: roteiro de validacao RLS.
- `xss-payloads.md`: payloads de apoio para validacao de sanitizacao.
- `reports/`: reports ativos, template V26 de evidencia autenticada real, template V37 de gate de entrada funcional, template V38 de rollback, template V39 de candidato funcional, template V40 auth callback, template V41 profile/avatar, template V42 admin/moderacao, template V43 notification provider, template V44 search/FTS, template V45 CSS small change, template V46 public a11y, template V47 de selecao de readiness funcional, template V48 de redacao de evidencia externa, template V49 de freeze de escopo funcional, template V50 de intake funcional, template V51 de No-Go funcional, template V52 de rastreabilidade de gates, template V53 de manifesto de patch funcional e reports V56-V63 PUBLIC-A11Y.

## Historico preservado

- Checklists, mapas, bugs, reports e evidencias V8/V11/V15 foram movidos via `git mv` para `docs/archive/qa-legacy/` em V20.
- Esses arquivos nao devem voltar para `docs/qa/` sem revalidacao contra o checklist V20.

## Ordem de leitura recomendada

1. Use `v25-real-environment-qa-runbook.md` como roteiro principal da proxima execucao real autenticada.
2. Use `v31-authenticated-flow-triage-matrix.md` para priorizar e classificar Go/No-Go por fluxo.
3. Use `v32-e2e-gate-policy.md` para decidir se Playwright E2E e obrigatorio, recomendado ou dispensavel.
4. Use `v33-lhci-baseline-policy.md` para classificar evidencia Lighthouse/LHCI.
5. Use `v34-a11y-i18n-reconciliation-plan.md` antes de abrir backlog de copy, foco, ARIA, contraste ou i18n.
6. Use `e2e-checklist.md` como checklist operacional complementar.
7. Consulte `v19-authenticated-qa-plan.md` para contexto e pre-requisitos.
8. Antes de qualquer CSS, use `v27-visual-a11y-regression-gate.md`.
9. Rode `rls-smoke.sql` apenas em ambiente autorizado.
10. Antes de qualquer implementacao funcional, preencha `reports/_TEMPLATE-functional-entry-gate.md`.
11. Antes de tocar runtime, CSS, HTML, SQL, provider ou config, preencha `reports/_TEMPLATE-rollback-evidence.md`.
12. Antes de selecionar a primeira implementacao funcional, use `reports/_TEMPLATE-implementation-readiness-selection.md`.
13. Para qualquer evidencia externa, redija primeiro com `reports/_TEMPLATE-external-evidence-redaction.md`.
14. Antes do primeiro commit funcional, congele escopo com `reports/_TEMPLATE-functional-scope-freeze.md`.
15. Antes de abrir branch funcional, finalize `reports/_TEMPLATE-functional-implementation-intake.md`.
16. Se qualquer gate, evidencia, rollback ou owner estiver faltando, registre No-Go com `reports/_TEMPLATE-functional-no-go-register.md`.
17. Antes de abrir branch funcional, consolide a decisao com `reports/_TEMPLATE-functional-gate-traceability.md`.
18. Depois do Go de rastreabilidade e antes do primeiro edit, preencha `reports/_TEMPLATE-functional-patch-manifest.md`.
19. Quando houver mais de um pacote viavel, use `reports/_TEMPLATE-functional-candidate.md` para registrar a escolha.
20. Para o candidato `AUTH-CB-01`, use `reports/_TEMPLATE-auth-callback-evidence.md`.
21. Para o candidato `PROFILE-AV-01`, use `reports/_TEMPLATE-profile-avatar-evidence.md`.
22. Para o candidato `ADMIN-MOD-01`, use `reports/_TEMPLATE-admin-moderation-evidence.md`.
23. Para o candidato `NOTIF-SB-01`, use `reports/_TEMPLATE-notification-provider-evidence.md`.
24. Para o candidato `SEARCH-FTS-01`, use `reports/_TEMPLATE-search-fts-evidence.md`.
25. Para o candidato `CSS-SM-01`, use `reports/_TEMPLATE-css-small-change-evidence.md`.
26. Para o candidato `PUBLIC-A11Y-01`, use `reports/_TEMPLATE-public-a11y-evidence.md`.
27. Para a evidencia V54 de post card comments, consulte `reports/report-v54-public-a11y-post-card-comments.md`.
28. Para a evidencia V55 de post card rating, consulte `reports/report-v55-public-a11y-post-card-rating.md`.
29. Para a evidencia V56 de post card decorative icons, consulte `reports/report-v56-public-a11y-post-card-decorative-icons.md`.
30. Para a evidencia V57 de post card author avatar alt, consulte `reports/report-v57-public-a11y-post-card-author-avatar-alt.md`.
31. Para a evidencia V58 de mobile search modal controls, consulte `reports/report-v58-public-a11y-mobile-search-modal-controls.md`.
32. Para a evidencia V59 de mobile search modal input, consulte `reports/report-v59-public-a11y-mobile-search-modal-input.md`.
33. Para a evidencia V60 de comment action buttons, consulte `reports/report-v60-public-a11y-comment-action-buttons.md`.
34. Para a evidencia V61 de dynamic button types, consulte `reports/report-v61-public-a11y-dynamic-button-types.md`.
35. Para a evidencia V62 de admin decorative icons, consulte `reports/report-v62-public-a11y-admin-decorative-icons.md`.
36. Para a evidencia V63 de admin help load more icons, consulte `reports/report-v63-public-a11y-admin-help-load-more-icons.md`.
37. Registre evidencias em `reports/` usando `_TEMPLATE-authenticated-run.md` e o padrao `report-v26-auth-runN.md`.
38. Use `../archive/qa-legacy/_INDEX.md` apenas para rastreabilidade historica.
