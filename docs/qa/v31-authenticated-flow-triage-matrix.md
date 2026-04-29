# V31 - Matriz de Triagem de Fluxos Autenticados

**Versao:** v31.0.0
**Atualizado em:** 2026-04-28
**Escopo:** triagem documental de QA real; sem executar testes, criar usuarios ou alterar runtime

---

## 1. Objetivo

Consolidar os fluxos autenticados que ainda dependem de ambiente real, credenciais temporarias,
caixa de e-mail, permissao admin ou evidencia Supabase. Este documento nao substitui o runbook V25
nem o template V26; ele transforma esses roteiros em uma matriz de prioridade, dependencia e decisao
para orientar a proxima rodada manual.

---

## 2. Regras

| Regra | Motivo |
|---|---|
| Nao registrar e-mail real completo, magic link, token ou header sensivel | Evita vazamento em reports |
| Separar falha de ambiente de falha funcional | Evita criar bug falso quando falta provider/acesso |
| Registrar Go/No-Go por fluxo, nao apenas por rodada | Facilita liberar partes estaveis |
| Revalidar dados apos reload | Garante persistencia, nao apenas estado visual local |
| Confirmar limpeza/rollback por item criado | Evita lixo operacional em producao/preview |

---

## 3. Matriz P0

| ID | Fluxo | Dependencia real | Evidencia minima | Decisao |
|---|---|---|---|---|
| AUTH-001 | Signup institucional | Caixa de e-mail autorizada | Print redigido de envio/recebimento | Go/No-Go |
| AUTH-002 | Callback real | Magic link real redigido | `auth-callback.html` cria sessao sem erro critico | Go/No-Go |
| AUTH-003 | Login/logout | Usuario confirmado | Header, sessao e reload coerentes | Go/No-Go |
| PROFILE-001 | Perfil basico | Usuario autenticado | `profiles` atualizado e UI refletida | Go/No-Go |
| POST-001 | Criacao de post | Modulo seguro para teste | Feed e minhas publicacoes exibem post | Go/No-Go |
| ADMIN-001 | Moderacao | Usuario admin temporario | Report tratado e persistido | Go/No-Go |
| RLS-001 | Isolamento | Dois usuarios ou evidencia SQL redigida | Acesso cruzado bloqueado | Go/No-Go |

---

## 4. Matriz P1

| ID | Fluxo | Dependencia real | Evidencia minima | Decisao |
|---|---|---|---|---|
| PROFILE-002 | Avatar | Bucket/policies reais | Upload/troca/remocao ou bloqueio explicado | Go/No-Go |
| SOCIAL-001 | Favoritos | Post de teste | Estado persiste apos reload | Go/No-Go |
| SOCIAL-002 | Comentarios | Post de teste | Comentario cria, lista e respeita sanitizacao | Go/No-Go |
| SOCIAL-003 | Avaliacoes/votos | Post compativel | Contagem/estado persistem sem duplicacao | Go/No-Go |
| SEARCH-001 | Busca/feed | Post indexavel | Busca encontra item e feed pagina corretamente | Go/No-Go |
| NOTIF-001 | In-app | Evento notificavel | Sino/dropdown registra evento ou bloqueio documentado | Go/No-Go |
| NOTIF-002 | Email fail-closed | Provider ausente/configurado | Ausencia retorna gating explicito | Go/No-Go |
| NOTIF-003 | WhatsApp fail-closed | Provider ausente/configurado | Ausencia retorna gating explicito | Go/No-Go |

---

## 5. Ordem Recomendada de Execucao

1. AUTH-001/002/003.
2. PROFILE-001.
3. POST-001.
4. SOCIAL-001/002/003.
5. SEARCH-001.
6. ADMIN-001.
7. RLS-001.
8. PROFILE-002.
9. NOTIF-001/002/003.

Essa ordem reduz ambiguidade: primeiro prova sessao e persistencia, depois interacoes, admin,
isolamento e dependencias operacionais.

---

## 6. Saida Esperada

Criar ou atualizar um report em `docs/qa/reports/` usando `_TEMPLATE-authenticated-run.md`.
O report deve registrar:

- URL alvo e ambiente;
- contas usadas de forma redigida;
- matriz P0/P1 com Passou/Falhou/Bloqueado;
- evidencia redigida por fluxo;
- itens criados e limpeza executada;
- decisao Go/No-Go por fluxo e da rodada.

---

## 7. Bloqueios

- Nao converter bloqueio de acesso em sucesso.
- Nao executar teste com usuario admin permanente sem aprovacao.
- Nao deixar post/report/permissao temporaria sem limpeza documentada.
- Nao abrir backlog funcional sem reproduzir fluxo e classificar severidade.
- Nao alterar JS, CSS, HTML, migrations ou edge functions como parte desta triagem documental.
