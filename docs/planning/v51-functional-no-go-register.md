# V51 - Registro de No-Go para Implementacao Funcional

**Versao:** v51.0.0
**Data:** 2026-04-30
**Tipo:** documental/planning-only
**Escopo:** registrar bloqueios que impedem abrir ou continuar uma branch funcional futura.

---

## 1. Objetivo

Este documento define um registro padrao de **No-Go** para impedir que uma implementacao funcional
avance quando os gates de V37-V50 ainda nao estao completos.

A V51 nao escolhe candidato funcional, nao altera runtime e nao corrige implementacao. Ela cria uma
forma objetiva de dizer "nao implementar ainda" com evidencias, responsaveis e condicoes de desbloqueio.

---

## 2. Quando Abrir um No-Go

Abra um registro de No-Go quando qualquer uma destas condicoes existir:

| Codigo | Bloqueio | Exemplo |
|---|---|---|
| `NO-GO-GATE` | Gate obrigatorio ausente | template V37, V38, V49 ou V50 incompleto |
| `NO-GO-EVIDENCE` | Evidencia insuficiente | falta de screenshot, log redigido, runbook ou resultado de QA |
| `NO-GO-ROLLBACK` | Rollback nao demonstrado | nao ha plano de reversao por arquivo/ambiente |
| `NO-GO-SCOPE` | Escopo instavel | filescope aberto demais ou candidato ainda indefinido |
| `NO-GO-ENV` | Ambiente real indisponivel | Supabase/Vercel/provider sem acesso validado |
| `NO-GO-SECURITY` | Risco de segredo ou dado sensivel | evidencia contem secret, email real ou token |
| `NO-GO-REGRESSION` | Risco de regressao nao coberto | sem teste minimo para area tocada |
| `NO-GO-OWNER` | Sem responsavel de validacao | nao ha pessoa/ambiente para confirmar o resultado |

---

## 3. Campos Obrigatorios

Todo No-Go precisa registrar:

| Campo | Obrigatorio | Criterio minimo |
|---|---|---|
| Candidato | Sim | `AUTH-CB-01`, `PROFILE-AV-01`, `ADMIN-MOD-01`, `NOTIF-SB-01`, `SEARCH-FTS-01`, `CSS-SM-01` ou `PUBLIC-A11Y-01` |
| Severidade | Sim | `P0`, `P1` ou `P2` |
| Bloqueio | Sim | um dos codigos da secao 2 |
| Evidencia | Sim | arquivo, comando, screenshot redigido ou nota manual |
| Risco se ignorado | Sim | regressao concreta, vazamento, quebra de fluxo ou retrabalho |
| Condicao de desbloqueio | Sim | criterio verificavel para transformar No-Go em Go |
| Owner de validacao | Sim | papel ou pessoa responsavel pela evidencia final |
| Prazo/revisao | Sim | data ou proxima versao de reavaliacao |

---

## 4. Fluxo Seguro

1. Preencher `docs/qa/reports/_TEMPLATE-functional-no-go-register.md`.
2. Referenciar o candidato e o gate bloqueado.
3. Anexar apenas evidencias redigidas; nunca registrar secrets, tokens, cookies ou dados pessoais.
4. Classificar o bloqueio por impacto.
5. Definir condicao objetiva de desbloqueio.
6. Reavaliar antes de abrir branch funcional.

---

## 5. Relacao com Gates Existentes

| Documento | Papel na decisao |
|---|---|
| `docs/planning/v37-functional-entry-gate.md` | confirma filescope e pre-condicoes de entrada |
| `docs/planning/v38-rollback-evidence-gate.md` | exige plano e evidencia de reversao |
| `docs/planning/v39-functional-candidate-matrix.md` | compara candidatos e prioridade |
| `docs/ops/v48-external-evidence-request-pack.md` | orienta coleta/redacao de evidencia externa |
| `docs/planning/v49-functional-scope-freeze.md` | congela escopo antes do primeiro commit funcional |
| `docs/planning/v50-functional-implementation-intake.md` | checklist final para abertura de branch funcional |

Se qualquer item acima estiver incompleto para o candidato escolhido, a decisao padrao e No-Go.

---

## 6. Saida Esperada para V19+

Antes de qualquer implementacao funcional futura, deve existir uma destas evidencias:

- Go aprovado: intake V50 preenchido, rollback validado, escopo congelado e template especifico pronto.
- No-Go registrado: bloqueio classificado, risco descrito e condicao de desbloqueio definida.

Sem uma dessas duas saidas, a branch funcional nao deve ser aberta.

---

## 7. Fora de Escopo

- Corrigir codigo funcional.
- Alterar HTML, CSS, SQL, migrations, providers, secrets, CI ou visual.
- Executar provider real.
- Rodar QA autenticado em ambiente de producao sem autorizacao.
- Substituir os dossies V40-V46.
