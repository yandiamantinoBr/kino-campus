# V50 - Intake da Primeira Implementacao Funcional

**Versao:** v50.0.0
**Data:** 2026-04-30
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Consolidar a ordem de entrada para a primeira branch funcional futura. A V50 nao seleciona nem
implementa um candidato; ela define quais documentos precisam existir, em qual ordem, e qual
decisao bloqueia a abertura de branch quando faltarem evidencias.

---

## 2. Ordem de Intake

| Etapa | Artefato | Decisao esperada |
|---|---|---|
| 1 | `docs/qa/reports/_TEMPLATE-functional-entry-gate.md` | branch funcional permitida ou bloqueada |
| 2 | `docs/qa/reports/_TEMPLATE-rollback-evidence.md` | rollback R1/R2/R3 testavel |
| 3 | `docs/qa/reports/_TEMPLATE-implementation-readiness-selection.md` | candidato unico selecionado |
| 4 | `docs/qa/reports/_TEMPLATE-external-evidence-redaction.md` | evidencia externa redigida quando aplicavel |
| 5 | template especifico do candidato V40-V46 | evidencia especifica suficiente |
| 6 | `docs/qa/reports/_TEMPLATE-functional-scope-freeze.md` | filescope congelado |
| 7 | `docs/qa/reports/_TEMPLATE-functional-implementation-intake.md` | Go final para abrir branch |

---

## 3. Pacotes que Podem Avancar

| Estado | Regra |
|---|---|
| Go | todos os artefatos obrigatorios preenchidos, gates definidos e rollback testavel |
| Go condicionado | falta apenas evidencia que sera coletada antes do primeiro patch |
| Bloqueado | falta ambiente, sandbox, policy, usuario admin, baseline visual ou rollback |
| No-Go | patch mistura candidatos, secrets, superficies de alto risco ou rollback impossivel |

---

## 4. Arquivos Proibidos no Intake

Enquanto o intake nao estiver preenchido, nao alterar:

- `assets/js/**`;
- `assets/css/**`;
- `*.html` e `admin/*.html`;
- `supabase/migrations/**`;
- `supabase/functions/**`;
- `vercel.json`;
- secrets, `.env*` ou configuracoes privadas.

Alteracoes permitidas antes do Go: apenas docs, QA reports, validators de versao/branch e indices.

---

## 5. Saida Esperada

O intake termina com uma das quatro decisoes:

- **Go:** abrir branch funcional pequena.
- **Go condicionado:** coletar evidencia restante antes do primeiro patch.
- **Bloqueado:** manter planejamento/QA.
- **No-Go:** dividir pacote ou redefinir candidato.

Sem decisao Go ou Go condicionado, o repositorio deve permanecer em modo documental/QA.
