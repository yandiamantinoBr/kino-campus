# V49 - Freeze de Escopo para Primeira Implementacao Funcional

**Versao:** v49.0.0
**Data:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Definir o congelamento minimo de escopo antes da primeira implementacao funcional futura. A V49
nao escolhe um candidato nem altera codigo; ela impede que uma branch funcional comece sem limite
claro de superficie, arquivos, rollback e evidencia.

---

## 2. Pre-Requisitos

Antes de abrir qualquer branch funcional, devem existir:

1. gate de entrada funcional V37 preenchido;
2. rollback V38 preenchido;
3. selecao de readiness V47 preenchida;
4. evidencia externa redigida V48 quando o candidato depender de ambiente real;
5. template especifico do candidato V40-V46 preenchido;
6. scope freeze V49 preenchido.

Sem esses itens, a branch deve permanecer documental, QA ou operacional.

---

## 3. Freeze Obrigatorio

| Area | Limite |
|---|---|
| Candidato | exatamente um ID da matriz V39 |
| Superficies tecnicas | no maximo uma superficie de alto risco por branch |
| Arquivos | lista fechada antes do primeiro patch |
| Rollback | classe V38 com passo testavel |
| Gates | `check:all` e `npm test` sempre obrigatorios; Playwright/LHCI conforme V32/V33 |
| Evidencia | antes/depois ou decisao Bloqueado anexada em `docs/qa/reports/` |

---

## 4. Regras de Divisao

Dividir em mais de uma versao quando:

- o patch toca runtime e SQL;
- o patch toca CSS e HTML estrutural;
- o patch precisa de provider e auth;
- o patch altera permissao admin e RLS;
- o patch exige mais de um rollback independente;
- o patch muda fluxo publico e fluxo admin ao mesmo tempo.

---

## 5. Saida Esperada

Preencher `docs/qa/reports/_TEMPLATE-functional-scope-freeze.md` antes do primeiro commit funcional.
O arquivo deve declarar Go, Go condicionado, No-Go ou Bloqueado. Se o resultado nao for Go ou Go
condicionado, nenhum patch funcional deve ser iniciado.

---

## 6. Relacao com V47 e V48

V47 responde "qual candidato pode ser escolhido". V48 responde "qual evidencia externa foi redigida
com seguranca". V49 responde "qual escopo exato esta congelado para a branch". As tres respostas
precisam existir antes de qualquer mudanca funcional.
