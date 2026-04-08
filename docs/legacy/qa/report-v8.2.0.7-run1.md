# Report QA — v8.2.0.7 (run1)

> **STATUS GERAL DESTA RODADA: PENDENTE DE EXECUÇÃO REAL**
>
> Este documento é um template executável. Não marque **PASSOU** sem evidência real (print/log/URL/data-hora).

## 1) Metadados da execução

| Campo | Valor |
|---|---|
| Status da rodada | **PENDENTE** |
| Ambiente alvo (Preview ou Prod) | PREENCHER |
| URL base validada | PREENCHER |
| Data/hora início (timezone local) | PREENCHER |
| Data/hora fim (timezone local) | PREENCHER |
| Responsável pela execução | PREENCHER |
| Conta usuário comum | PREENCHER |
| Conta admin | PREENCHER |
| Projeto Supabase (`project_ref`) | PREENCHER |
| Webhook de alerta configurado? | PREENCHER (SIM/NÃO/N/A) |
| Pasta de evidências | `docs/qa/evidence/v8.2.0.7-run1/` |

---

## 2) Execução E2E (1–9)

Referência: `docs/qa/e2e-checklist.md`

> Resultado permitido por caso: **PASSOU / FALHOU / BLOQUEADO**.

| ID | Cenário | Resultado | Evidência (arquivo/link) | URL usada | Observações |
|---|---|---|---|---|---|
| E2E-01 | Cadastro | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |
| E2E-02 | Confirmação de e-mail (callback) | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |
| E2E-03 | Login | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |
| E2E-04 | Criar post (sem imagem e com imagem) | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |
| E2E-05 | Abrir detalhe do post | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |
| E2E-06 | Comentar | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |
| E2E-07 | Votar (hot/cold) | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |
| E2E-08 | Denunciar post | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |
| E2E-09 | Admin: acessar painel e fechar denúncia/moderar | BLOQUEADO | PENDENTE | PENDENTE | PENDENTE |

---

## 3) Execução RLS Smoke (1–3)

Referência: `docs/qa/rls-smoke.sql`

| ID | Teste | Resultado esperado | Resultado atual | Evidência (print/log/link) | Observações |
|---|---|---|---|---|---|
| RLS-01 | `reports` anon select | Erro de permissão **ou** retorno vazio | BLOQUEADO | PENDENTE | PENDENTE |
| RLS-02 | `posts.author_id` update indevido | UPDATE bloqueado | BLOQUEADO | PENDENTE | PENDENTE |
| RLS-03 | `profiles` insert com id divergente | INSERT bloqueado | BLOQUEADO | PENDENTE | PENDENTE |

---

## 4) Webhook/Alerta (limiar de denúncias)

| Item | Resultado |
|---|---|
| Executado? | **N/A (PENDENTE)** |
| Justificativa | Execução real ainda não realizada nesta rodada. |
| Evidência | PENDENTE |
| Endpoint/integração validado | PENDENTE |

---

## 5) Bugs encontrados nesta rodada

Classificação obrigatória: **BLOQUEADOR / ALTO / MÉDIO / BAIXO**.

| ID | Severidade | Status | Resumo | Evidência | Link commit/PR |
|---|---|---|---|---|---|
| QA-8207-001 | BLOQUEADOR | ABERTO | Execução E2E 1–9 não realizada | `docs/qa/report-v8.2.0.7-run1.md` (seção E2E) | PENDENTE |
| QA-8207-002 | BLOQUEADOR | ABERTO | RLS Smoke 1–3 não executado | `docs/qa/report-v8.2.0.7-run1.md` (seção RLS) | PENDENTE |
| QA-8207-003 | BLOQUEADOR | RESOLVIDO | Ausência do report obrigatório da rodada | Este arquivo criado/padronizado nesta V8.2.1.0 | PENDENTE |

---

## 6) Conclusão

### Apto para seguir para próxima etapa?
**NÃO (no estado atual deste arquivo/template).**

### Justificativa
A rodada está marcada como **PENDENTE** até que alguém execute os testes reais (E2E + RLS + webhook quando aplicável), anexe evidências e atualize os resultados caso a caso.
