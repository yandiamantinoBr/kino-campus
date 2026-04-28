# V19 - Plano de QA Autenticado

**Versao:** v19.0.0
**Atualizado em:** 2026-04-28
**Objetivo:** validar fluxos reais que nao podem ser comprovados apenas por Jest/checks estaticos

---

## 1. Pre-requisitos

- URL alvo: producao ou preview aprovado.
- Conta UFG/discente/egresso nova para signup real.
- Caixa de e-mail acessivel para confirmar link.
- Conta comum autenticada.
- Conta admin temporaria ou ambiente com admin seed.
- Acesso operacional ao Supabase Dashboard ou SQL Editor para consultas de evidencia.

## 2. Fluxos P0

| ID | Fluxo | Resultado esperado |
|---|---|---|
| AUTH-001 | Signup com e-mail institucional novo | Usuario criado e e-mail enviado |
| AUTH-002 | Confirmacao pelo link real | `auth-callback.html` conclui sem erro e redireciona corretamente |
| AUTH-003 | Login apos confirmacao | Sessao ativa e perfil sincronizado |
| PROFILE-001 | Completar onboarding | Perfil deixa estado incompleto |
| PROFILE-002 | Upload/update/delete avatar | Storage usa `profile-avatars/{userId}/...` e policies bloqueiam acesso indevido |
| POST-001 | Criar post sem imagem | Post publicado/pending conforme regras |
| POST-002 | Criar post com imagem | Midia em `post-media/{userId}/{postId}/...` |
| SOCIAL-001 | Comentar, responder, votar, favoritar | Eventos persistidos e UI coerente |
| ADMIN-001 | Denunciar e moderar post | Admin ve report e acao persiste |
| RLS-001 | Rodar `rls-smoke.sql` com dados reais | Ataques bloqueados por RLS/permissao |

## 3. Fluxos P1

| ID | Fluxo | Resultado esperado |
|---|---|---|
| NOTIF-001 | Preferencias in-app | Defaults e alteracoes persistem |
| NOTIF-002 | Outbox email dry-run | Itens claim/attempt sem envio real indevido |
| NOTIF-003 | Outbox WhatsApp dry-run | Canal bloqueia sem target/consent/provider |
| SEARCH-001 | Busca com acento/sem acento | Resultados equivalentes preservados |
| LHCI-001 | Lighthouse CI | Scores acima dos thresholds ou justificativa documentada |

## 4. Evidencia

Criar report em `docs/qa/reports/report-v19-auth-run1.md` com:

- URL alvo e data.
- Ambiente usado.
- Tabela de resultados por ID.
- Prints ou caminhos de evidencias.
- Logs redigidos sem secrets.
- Pendencias remanescentes.

## 5. Criterio de Go/No-Go

Go:

- AUTH-001 a AUTH-003 passam.
- PROFILE-001 a PROFILE-002 passam.
- POST-001 a POST-002 passam.
- ADMIN-001 e RLS-001 passam ou ficam bloqueados por ausencia justificada de acesso operacional.

No-Go:

- Callback real falha.
- RLS permite acesso indevido.
- Avatar permite alteracao/delecao alheia.
- Provider externo envia mensagem para destino nao consentido.
