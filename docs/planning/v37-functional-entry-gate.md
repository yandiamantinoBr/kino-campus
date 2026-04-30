# V37 - Gate de Entrada para Implementacao Funcional

**Versao:** v37.0.0
**Atualizado em:** 2026-04-29
**Escopo:** template/checklist documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Definir o pacote minimo de informacao antes de abrir qualquer versao funcional futura. Este gate
impede que implementacoes sejam iniciadas apenas por suposicao: cada patch funcional precisa declarar
evidencia, filescope, rollback, gates obrigatorios e criterio de Go/No-Go.

---

## 2. Checklist de Entrada

| Item | Obrigatorio | Evidencia esperada |
|---|---|---|
| Trilha escolhida | Sim | QA real, Supabase, provider, CSS/layout ou bug funcional |
| Artefatos-fonte | Sim | Links para runbooks/checklists V25-V36 usados |
| Problema comprovado | Sim | Report, log redigido, screenshot ou decisao Bloqueado |
| Severidade | Sim | P0/P1/P2 com impacto para usuario ou operacao |
| Filescope previsto | Sim | Arquivos/modulos que podem ser tocados |
| Arquivos proibidos | Sim | Arquivos fora do escopo que nao devem mudar |
| Gates obrigatorios | Sim | `check:all`, Jest, E2E/LHCI/visual/SQL quando aplicavel |
| Rollback | Sim | Como reverter sem perda de dados/secrets |
| Owner de ambiente | Quando aplicavel | Responsavel por Supabase/Vercel/provider/credenciais |

---

## 3. Template

```md
# Gate de Entrada Funcional - <versao/tema>

## Trilha
- Tipo:
- Prioridade:
- Artefatos-fonte:

## Evidencia
- Report/log/screenshot:
- Ambiente:
- Estado: Passou/Falhou/Bloqueado:

## Escopo
- Arquivos permitidos:
- Arquivos proibidos:
- Dados/secrets envolvidos:

## Gates
- check:all:
- npm test:
- Playwright:
- LHCI:
- Visual/a11y:
- SQL/ops:

## Rollback
- Passos:
- Validacao pos-rollback:

## Go/No-Go
- Decisao:
- Motivo:
- Pendencias:
```

---

## 4. Regras por Trilha

| Trilha | Gate adicional minimo |
|---|---|
| Auth/callback/perfil/admin | Matriz V31 + Playwright pela politica V32 |
| Supabase/RLS/RPC/unaccent | Ambiente isolado + plano de rollback SQL |
| Providers email/WhatsApp | Checklist V30 + opt-in/sandbox + fail-closed |
| CSS/layout | Gate V27 + E2E V32 + LHCI V33 + readiness V35 |
| A11y/i18n/copy | Plano V34 + evidencia por rota/componente |
| Bug funcional isolado | Reproducao minima + teste direcionado + `check:all` |

---

## 5. Bloqueios

- Nao iniciar patch funcional sem filescope.
- Nao combinar trilhas independentes na mesma versao.
- Nao tocar secrets ou dashboard sem owner e rollback.
- Nao alterar CSS sem baseline visual.
- Nao reduzir testes ou suites para liberar implementacao.
- Nao usar este gate como substituto de evidencia real.

---

## 6. Complemento V38

Quando a mudanca futura tocar runtime, CSS, HTML, SQL, provider, config ou dados persistidos, o
rollback declarado neste gate deve ser detalhado em `docs/qa/reports/_TEMPLATE-rollback-evidence.md`
seguindo `docs/planning/v38-rollback-evidence-gate.md`.

Quando houver mais de um pacote funcional viavel, usar `docs/planning/v39-functional-candidate-matrix.md`
e `docs/qa/reports/_TEMPLATE-functional-candidate.md` antes de abrir a branch funcional.
