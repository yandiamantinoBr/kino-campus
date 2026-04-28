# E2E Checklist - Kino Campus V20

**Objetivo:** validar fluxos reais de usuario sem depender de memoria de releases antigas.
**Uso:** copiar os resultados para `docs/qa/reports/report-v20-auth-run1.md` ou para um report equivalente.

---

## 1. Ambiente

| Campo | Valor |
|---|---|
| URL alvo | |
| Tipo de ambiente | producao / preview / local |
| Data/hora | |
| Responsavel | |
| Browser/dispositivo | |
| Conta comum | |
| Conta admin | |
| Acesso Supabase | sim / nao |

Regras:

- Nao inventar URL de preview.
- Nao registrar tokens, senhas, magic links completos ou secrets.
- Redigir qualquer log que contenha identificador sensivel.

## 2. Fluxos P0

| ID | Fluxo | Resultado esperado | Status | Evidencia |
|---|---|---|---|---|
| AUTH-001 | Signup com e-mail institucional novo | Usuario criado e e-mail enviado | | |
| AUTH-002 | Confirmacao pelo link real | `auth-callback.html` conclui sem erro e redireciona corretamente | | |
| AUTH-003 | Login apos confirmacao | Sessao ativa e perfil sincronizado | | |
| PROFILE-001 | Completar onboarding | Perfil deixa estado incompleto | | |
| PROFILE-002 | Upload/update/delete avatar | Storage usa `profile-avatars/{userId}/...` e policies bloqueiam acesso indevido | | |
| POST-001 | Criar post sem imagem | Post publicado ou pending conforme regra do ambiente | | |
| POST-002 | Criar post com imagem | Midia em `post-media/{userId}/{postId}/...` | | |
| SOCIAL-001 | Comentar, responder, votar e favoritar | Eventos persistidos e UI coerente | | |
| ADMIN-001 | Denunciar e moderar post | Admin ve report e acao persiste | | |
| RLS-001 | Rodar `rls-smoke.sql` com dados reais | Tentativas indevidas bloqueadas por RLS/permissao | | |

## 3. Fluxos P1

| ID | Fluxo | Resultado esperado | Status | Evidencia |
|---|---|---|---|---|
| NOTIF-001 | Preferencias in-app | Defaults e alteracoes persistem | | |
| NOTIF-002 | Outbox email dry-run | Claim/attempt sem envio indevido | | |
| NOTIF-003 | Outbox WhatsApp dry-run | Canal bloqueia sem target/consent/provider | | |
| SEARCH-001 | Busca com acento/sem acento | Resultados equivalentes preservados | | |
| LHCI-001 | Lighthouse CI | Scores acima dos thresholds ou justificativa documentada | | |

## 4. Go/No-Go

Go:

- AUTH-001 a AUTH-003 passam.
- PROFILE-001 a PROFILE-002 passam.
- POST-001 a POST-002 passam.
- ADMIN-001 e RLS-001 passam ou ficam bloqueados por ausencia justificada de acesso.

No-Go:

- Callback real falha.
- RLS permite acesso indevido.
- Avatar permite alteracao/delecao alheia.
- Provider externo envia mensagem para destino nao consentido.
