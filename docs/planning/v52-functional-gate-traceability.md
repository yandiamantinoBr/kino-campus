# V52 - Matriz de Rastreabilidade dos Gates Funcionais

**Versao:** v52.0.0
**Data:** 2026-04-30
**Tipo:** documental/planning-only
**Escopo:** consolidar a rastreabilidade entre gates, evidencias, templates e decisao Go/No-Go antes de qualquer implementacao funcional.

---

## 1. Objetivo

Este documento cria uma matriz unica para confirmar se os gates V37-V51 estao cobertos antes de abrir
uma branch funcional futura.

A V52 nao aprova implementacao, nao executa QA real e nao altera runtime. Ela reduz o risco de uma
mudanca funcional nascer sem evidencias minimas, rollback ou criterio de decisao.

---

## 2. Matriz Obrigatoria

| Gate | Documento fonte | Evidencia esperada | Resultado aceitavel |
|---|---|---|---|
| Entrada funcional | `docs/planning/v37-functional-entry-gate.md` | filescope, risco, owner e gates locais definidos | completo ou No-Go |
| Rollback | `docs/planning/v38-rollback-evidence-gate.md` | reversao por arquivo/ambiente e criterio de parada | completo ou No-Go |
| Candidato | `docs/planning/v39-functional-candidate-matrix.md` | candidato priorizado e comparado | candidato unico ou No-Go |
| Dossie especifico | V40-V46 conforme candidato | pre-condicoes e teste especifico | completo ou No-Go |
| Evidencia externa | `docs/ops/v48-external-evidence-request-pack.md` | resumo redigido sem secrets | anexado ou dispensado com justificativa |
| Freeze | `docs/planning/v49-functional-scope-freeze.md` | escopo congelado antes do primeiro commit funcional | completo ou No-Go |
| Intake | `docs/planning/v50-functional-implementation-intake.md` | checklist final para abrir branch | completo ou No-Go |
| No-Go | `docs/planning/v51-functional-no-go-register.md` | bloqueios classificados e condicao de desbloqueio | resolvido ou mantido |

---

## 3. Regra de Decisao

Uma implementacao funcional futura so pode avancar quando:

1. todos os gates aplicaveis tiverem evidencia preenchida;
2. qualquer item ausente estiver formalmente registrado como No-Go;
3. todo No-Go bloqueante estiver resolvido ou explicitamente aceito como nao bloqueante;
4. o filescope funcional estiver congelado;
5. os comandos locais minimos estiverem definidos antes do patch.

Se uma dessas condicoes falhar, a decisao padrao e No-Go.

---

## 4. Ordem Recomendada de Uso

1. Escolher candidato em V39.
2. Preencher o dossie especifico V40-V46.
3. Confirmar gate de entrada V37.
4. Confirmar rollback V38.
5. Anexar evidencia externa V48 quando aplicavel.
6. Congelar escopo V49.
7. Finalizar intake V50.
8. Registrar No-Go V51 se houver qualquer lacuna.
9. Preencher o template de rastreabilidade V52 antes da branch funcional.

---

## 5. Checks de Integridade

Antes de converter rastreabilidade em Go:

- nenhum secret, token, cookie ou dado pessoal pode estar em docs/QA;
- nenhum arquivo JS/CSS/HTML/SQL pode ter sido alterado durante a fase documental;
- `npm run check:all` e `npm test` precisam estar verdes na branch documental;
- se a implementacao exigir ambiente real, a evidencia deve apontar owner e data de validacao;
- se a implementacao exigir CSS/visual, o gate V27 precisa ser citado.

---

## 6. Fora de Escopo

- Selecionar ou implementar candidato funcional.
- Editar runtime, CSS, HTML, SQL, migrations, providers, secrets ou CI.
- Rodar provider real ou alterar dashboard externo.
- Substituir os templates especificos ja existentes.
