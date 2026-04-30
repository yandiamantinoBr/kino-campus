# V47 - Consolidacao de Readiness dos Candidatos Funcionais

**Versao:** v47.0.0
**Data:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Consolidar os dossies pre-implementacao criados entre V40 e V46 e definir o registro obrigatorio
para escolher a primeira implementacao funcional futura. A V47 nao escolhe nem executa um patch:
ela transforma a matriz V39 em uma fila auditavel, com criterios de desbloqueio e evidencia minima
antes de abrir qualquer branch funcional.

---

## 2. Estado Consolidado dos Candidatos

| Candidato | Dossie | Template QA | Bloqueio dominante | Proxima evidencia |
|---|---|---|---|---|
| `AUTH-CB-01` | `v40-auth-callback-preimplementation-dossier.md` | `_TEMPLATE-auth-callback-evidence.md` | ambiente real de signup/callback | execucao controlada com usuario institucional de teste |
| `PROFILE-AV-01` | `v41-profile-avatar-preimplementation-dossier.md` | `_TEMPLATE-profile-avatar-evidence.md` | policies reais de Storage/avatar | smoke RLS/storage com conta propria e negativa |
| `ADMIN-MOD-01` | `v42-admin-moderation-preimplementation-dossier.md` | `_TEMPLATE-admin-moderation-evidence.md` | usuario admin real e controle nao-admin | Playwright/admin smoke + evidencia manual |
| `NOTIF-SB-01` | `v43-notification-provider-preimplementation-dossier.md` | `_TEMPLATE-notification-provider-evidence.md` | sandbox de provider e secrets fora do repo | envio sandbox fail-closed com batch minimo |
| `SEARCH-FTS-01` | `v44-search-fts-preimplementation-dossier.md` | `_TEMPLATE-search-fts-evidence.md` | banco isolado e rollback R3 | comparativo SQL antes/depois em ambiente descartavel |
| `CSS-SM-01` | `v45-css-small-change-preimplementation-dossier.md` | `_TEMPLATE-css-small-change-evidence.md` | baseline visual antes/depois | screenshots desktop/mobile + Playwright/LHCI aplicavel |
| `PUBLIC-A11Y-01` | `v46-public-a11y-preimplementation-dossier.md` | `_TEMPLATE-public-a11y-evidence.md` | evidencia por rota/componente | matriz a11y/i18n por rota antes do patch |

---

## 3. Regra de Selecao para a Primeira Implementacao

Antes de qualquer branch funcional futura, preencher
`docs/qa/reports/_TEMPLATE-implementation-readiness-selection.md` com:

1. um unico candidato selecionado;
2. evidencia de desbloqueio ou decisao explicita de manter bloqueado;
3. filescope maximo por arquivo e por superficie;
4. rollback aplicavel conforme V38;
5. gates obrigatorios antes e depois do patch;
6. criterios de No-Go que encerram a tentativa sem mudanca funcional.

Se nenhum candidato P0/P1 tiver ambiente real ou sandbox seguro, a escolha deve cair para um pacote
P2 pequeno apenas se houver baseline visual/a11y local suficiente e rollback R1/R2 claro.

---

## 4. Ordem Segura de Preferencia

| Condicao observada | Preferencia |
|---|---|
| Ambiente real de auth disponivel, com conta institucional de teste e callback controlado | `AUTH-CB-01` |
| Storage/policies de avatar validadas fora do repo, com conta propria e negativa | `PROFILE-AV-01` |
| Conta admin e conta nao-admin disponiveis para controle positivo/negativo | `ADMIN-MOD-01` |
| Banco isolado descartavel disponivel, com snapshot/rollback e dados de busca suficientes | `SEARCH-FTS-01` |
| Sandbox de email/WhatsApp configurado fora do repo, com fail-closed demonstrado | `NOTIF-SB-01` |
| Sem ambiente externo, mas com baseline visual/a11y local reproduzivel | `PUBLIC-A11Y-01` ou `CSS-SM-01`, um componente/rota por vez |

Esta ordem nao e uma obrigacao de roadmap. Ela e um filtro: o candidato mais prioritario so pode
avancar se o bloqueio dominante estiver resolvido com evidencia anexavel ao template V47.

---

## 5. No-Go Global

Qualquer uma das condicoes abaixo bloqueia a primeira implementacao funcional:

- patch mistura dois candidatos da matriz;
- filescope inclui runtime, CSS, HTML, SQL, provider e config ao mesmo tempo;
- rollback depende de segredo, dashboard manual nao documentado ou estado impossivel de reproduzir;
- Playwright/LHCI e classificado como obrigatorio pela politica V32/V33, mas nao ha baseline;
- evidencia manual contem dados sensiveis sem redacao;
- o patch exige reduzir ou pular `npm run check:all` ou `npm test`.

---

## 6. Saida Operacional para a Proxima Versao

A proxima versao funcional deve abrir com estes artefatos preenchidos antes de qualquer codigo:

- `docs/qa/reports/_TEMPLATE-functional-entry-gate.md`;
- `docs/qa/reports/_TEMPLATE-rollback-evidence.md`;
- `docs/qa/reports/_TEMPLATE-implementation-readiness-selection.md`;
- template especifico do candidato selecionado entre V40 e V46.

Sem esses quatro registros, a decisao correta e manter a mudanca em planejamento.
