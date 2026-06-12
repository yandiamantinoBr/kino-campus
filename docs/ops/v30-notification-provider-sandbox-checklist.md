# V30 - Checklist de Sandbox para Providers de Notificacao

**Versao:** v30.0.0
**Atualizado em:** 2026-04-28
**Escopo:** provider sandbox/go-live controlado; sem alterar secrets, SQL, runtime ou comportamento visual

---

## 1. Objetivo

Definir a ordem segura para validar providers reais de email e WhatsApp antes de qualquer ativacao
operacional. Este checklist complementa o runbook V19 e o checklist V29: ele nao autoriza configurar
secrets, disparar mensagens para usuarios reais ou mudar o dispatcher; apenas define evidencias,
pre-requisitos e criterios de Go/No-Go.

---

## 2. Regras de Seguranca

| Regra | Motivo |
|---|---|
| Usar ambiente sandbox ou preview isolado | Evita envio acidental para base real |
| Redigir API keys, tokens, account IDs sensiveis e URLs assinadas | Evita vazamento operacional |
| Validar opt-in antes de qualquer WhatsApp real | Evita contato sem consentimento |
| Comecar com batch 1 e destino controlado | Limita blast radius |
| Manter fail-closed como estado padrao | Ausencia de provider nao pode quebrar o app |
| Registrar rollback antes do primeiro envio real | Mudanca operacional precisa ser reversivel |

---

## 3. Inventario por Canal

Nota de verificacao V75 (2026-06-11): a rodada sem envio em
`docs/qa/reports/report-v75-notification-provider-status-2026-06-11.md` confirmou que
`kc-dispatch-notification-outbox` esta ativa no Supabase remoto, mas os secrets de provider
`KC_NOTIFICATION_EMAIL_*` e `KC_NOTIFICATION_WHATSAPP_*` ainda nao existem no projeto.
Portanto, Resend e Twilio permanecem em No-Go tecnico para ativacao ate existir sandbox,
destino controlado, opt-in aplicavel e rollback documentado.

### Email

| Item | Evidencia minima | Status |
|---|---|---|
| Provider escolhido | Nome e ambiente redigidos | Pendente |
| Dominio/remetente validado | Print ou log redigido | Pendente |
| `KC_NOTIFICATION_EMAIL_PROVIDER` | Presenca booleana, nunca segredo | Pendente |
| `KC_NOTIFICATION_EMAIL_API_KEY` | Presenca booleana, nunca valor | Pendente |
| `KC_NOTIFICATION_EMAIL_FROM` | Remetente redigido quando necessario | Pendente |
| Bounce/retry observado | Log redigido ou bloqueio | Pendente |

### WhatsApp

| Item | Evidencia minima | Status |
|---|---|---|
| Provider escolhido | Nome e ambiente redigidos | Pendente |
| Template/content aprovado | ID redigido; status aprovado/bloqueado | Pendente |
| Numero de origem habilitado | Numero redigido | Pendente |
| Destino de teste com opt-in | Usuario/telefone redigidos | Pendente |
| `KC_NOTIFICATION_WHATSAPP_*` | Presenca booleana por secret; nunca valor | Pendente |
| Rate limit por usuario | Evidencia de limite ou bloqueio | Pendente |

---

## 4. Sequencia de Validacao

1. Confirmar que o ambiente alvo nao e producao aberta.
2. Confirmar provider configurado sem expor secrets.
3. Criar ou selecionar usuario de teste com preferencias explicitas.
4. Executar dry-run quando disponivel.
5. Executar dispatch manual com batch 1.
6. Validar `notification_delivery_attempts`.
7. Validar `notification_dispatch_runs`.
8. Confirmar que ausencia de provider retorna `provider_not_configured`.
9. Registrar Go/No-Go por canal.

---

## 5. Criterios de Go/No-Go

| Decisao | Criterio |
|---|---|
| Go sandbox | Mensagem enviada para destino controlado, logs coerentes e rollback documentado |
| No-Go tecnico | Secret ausente, provider recusando envio, callback/log incompleto ou erro sem classificacao |
| No-Go produto | Falta opt-in, template nao aprovado ou texto de mensagem nao validado |
| Bloqueado | Falta acesso ao provider, Supabase, Vercel ou ambiente de teste |

Go-live em producao exige nova aprovacao explicita, evidencia de sandbox e janela de rollback.

---

## 6. Saida Esperada

Criar um report em `docs/qa/reports/report-v30-notification-provider-sandbox-run1.md` com:

- ambiente alvo;
- canal testado;
- provider redigido;
- usuario/destino de teste redigido;
- resultado do dry-run;
- resultado do batch 1;
- logs redigidos de attempts/runs;
- decisao Go/No-Go;
- rollback validado.

---

## 7. Bloqueios

- Nao registrar service role key, API key, token WhatsApp, signed URL ou magic link.
- Nao disparar para usuarios reais sem opt-in documentado.
- Nao ativar scheduler recorrente antes de validar dispatch manual.
- Nao tratar ausencia de provider como regressao funcional se o fluxo falhar fechado.
- Nao modificar edge functions, migrations, HTML, CSS ou JS durante esta coleta.
