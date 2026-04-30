# Report V61 - PUBLIC-A11Y-01 Dynamic Button Types

**Candidato:** `PUBLIC-A11Y-01`
**Versao:** `v61.0.0`
**Data:** `2026-04-30`
**Ambiente:** local
**Rota/componente:** `renderPostCard`, admin invites e admin moderation

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Plano V34 revisado | Sim |
| Rota/componente unico definido | Sim - lote semantico pequeno em botoes dinamicos |
| Dimensao afetada classificada | Sim |
| Impacto para usuario descrito | Sim |
| Rollback V38 preparado | Sim - R1 por arquivo |
| Manifesto V53 aplicavel | Sim |
| Patches V54-V60 preservados | Sim |

---

## 2. Classificacao

| Campo | Valor |
|---|---|
| Dimensao | semantica / controles dinamicos |
| Severidade | P2 |
| Usuario afetado | publico autenticado, visitantes e administradores |
| Ferramenta/evidencia | Jest a11y + gates locais |
| Gate visual necessario | Nao |

---

## 3. Manifesto de Patch

| Arquivo | Tipo de mudanca | Motivo | Risco | Teste/smoke | Rollback |
|---|---|---|---|---|---|
| `assets/js/utils/kc-utils.presentation.js` | funcional pontual | botoes de voto no card dependiam do tipo padrao do HTML | baixo; altera somente atributo HTML gerado | `tests/a11y/a11y.test.js` | remover `type="button"` dos dois botoes |
| `assets/js/controllers/admin/admin-invite.controller.js` | funcional pontual | botao de revogar convite era gerado sem tipo explicito | baixo; atributo sem alteracao visual | `tests/a11y/a11y.test.js` | remover `type="button"` adicionado |
| `assets/js/controllers/admin/admin-moderation.controller.js` | funcional pontual | botoes dinamicos de moderacao/remocao de limite eram gerados sem tipo explicito | baixo; atributo sem alteracao visual | `tests/a11y/a11y.test.js` | remover `type="button"` adicionados |
| `tests/a11y/a11y.test.js` | cobertura a11y/source guard | proteger regressao de botoes publicos e templates admin | baixo; suite existente | suite a11y direcionada | remover dois casos novos |

Nao escopo: CSS, HTML estatico, SQL, migrations, providers, secrets, auth, profile/avatar, notificacoes, busca, storage e RLS.

---

## 4. Fluxo Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| Card publico inspecionado | Passou | botoes `vote-hot` e `vote-cold` declaram `type="button"` |
| Template admin de convites inspecionado | Passou | botao `.kc-admin-invite-revoke` declara `type="button"` |
| Templates admin de moderacao inspecionados | Passou | botoes `data-action` e `data-limit-delete` declaram `type="button"` |
| Contraste/layout validado | Dispensado | sem CSS/HTML visual |

---

## 5. Gates

| Gate | Estado |
|---|---|
| `npm test -- tests/a11y/a11y.test.js` | executado; 1/1 suite, 37/37 testes |
| `npm run check:all` | executado; 5/5 validators verdes, 135/135 suites, 3062/3062 testes |
| `npm test` | executado; 135/135 suites, 3062/3062 testes |
| Playwright a11y | dispensado; sem fluxo visual novo e DOM/source coberto por Jest |
| Baseline visual V27/V45 | dispensado; sem alteracao visual/CSS |
| Rollback V38 | R1 por arquivo |

---

## 6. Decisao

| Decisao | Motivo |
|---|---|
| Go | Patch tem filescope pequeno, rollback simples, teste direcionado e nao depende de ambiente externo |

---

## 7. Redacao

Sem dados pessoais, screenshots, secrets, tokens, cookies ou URLs externas.
