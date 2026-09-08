# Configuração de E-mail Outbound (SMTP) — v9.3.5.4

Documento descrevendo como o envio de e-mails está configurado no KinoCampus,
para referência ao operar/restaurar o setup.

> ⚠️ **DKIM ausente no DNS do `kinocampus.com.br`** — Yahoo/Outlook rejeitam ou marcam como spam.
> Veja `EMAIL-DELIVERABILITY-2026-07-07.md` para investigação completa, plano
> de fix passo-a-passo (Hostinger DKIM manual ou migração para Resend), e
> automação de validação em CI.

## Provedor SMTP atual

**Hostinger** (mesma conta que hospeda o site/domínio kinocampus.com.br).

| Item | Valor |
|---|---|
| Host | `smtp.hostinger.com` |
| Porta | `465` (SSL) |
| Username | `contato@kinocampus.com.br` |
| Senha | App password gerada no painel Hostinger (rotação independente da senha do webmail) |
| Sender email | `contato@kinocampus.com.br` |
| Sender name | `Kino Campus` |
| Reply-to | `contato@kinocampus.com.br` |

> **App password** (vs senha "real" do webmail): geradas em
> `Hostinger > Emails > Mailboxes > menu (...) > App passwords`. Cada app
> password pode ser revogada individualmente sem afetar o login do webmail
> nem outras integrações.

> ⚠️ **2026-07-07 18:50 BRT — incident resolvido**: Yan rotacionou a senha do
> `contato@kinocampus.com.br` no painel Hostinger mas esqueceu de atualizar
> o Supabase Auth SMTP config. Resultado: TODOS os emails enviados pelo
> Supabase Auth (signup confirm, magic link, recovery, invite) estavam
> falhando silenciosamente com **535 authentication failed**. Sintomas:
> bounces "Undelivered Mail Returned to Sender" no hotmail, emails indo
> pro spam. **Fix**: atualizado Supabase Auth SMTP config (Management API
> PATCH) + atualizado `KC_SMTP_PASS` secret das Edge Functions. **Lição**:
> ao trocar senha no Hostinger, **sempre** atualizar AMBOS: Supabase Auth
> SMTP config E o `KC_SMTP_PASS` secret. Em caso de dúvida, validar
> fazendo `auth/v1/recover` com email próprio.

> ⚠️ **2026-09-08 20:01 UTC — incidente recorrente (mesma causa) resolvido pelo agente DSH**:
> `inviteUserByEmail` voltou a falhar (`INVITE_EMAIL_PROVIDER_FAILED`) porque o SMTP do
> Auth guardava uma app password antiga/diferente, enquanto o secret `KC_SMTP_PASS`
> (denomailer) estava correto — o convite da Keila (keilafidelis@gmail.com) caiu no
> fallback manual. Evidência: signup de teste retornava `500 Error sending confirmation
> email` e o AUTH PLAIN com a senha do `KC_SMTP_PASS` (via Edge temporária) retornava
> `235`. **Fix aplicado**: PATCH via Management API com a seção SMTP **completa**
> (smtp_host/port/user/pass = KC_SMTP_* + `rate_limit_email_sent`=1000) e convite
> reenviado (`sent`=true). **Lição nova**: o PATCH em
> `/v1/projects/{ref}/config/auth` se comporta como REPLACE da seção SMTP — envie
> SEMPRE host+port+user+pass juntos; enviar só `smtp_pass` zera os demais campos e
> derruba o rate limit para o default (2/h). Além disso, o link de convite de
> `generateLink` vale **60 minutos** (`mailer_otp_exp`=3600), não 7 dias (isso é a
> whitelist `kc_invited_emails`).

## Onde o SMTP está consumido

### 1. Supabase Auth (built-in)
**Project Settings → Authentication → Email → SMTP Settings**
- `Enable custom SMTP`: **ON**
- Usa as credenciais Hostinger acima.
- Envia automaticamente os e-mails de auth padrão: Confirm signup, Reset
  Password, Invite User, Magic Link, Change Email.

**Templates customizados** estão em
**Authentication → Email → Templates**. O template "Invite User" foi
personalizado em PT-BR com identidade KinoCampus (laranja, "Comunidade UFG",
botão "Criar minha conta"). Variável principal: `{{ .ConfirmationURL }}`.

### 2. Edge Functions

#### `kc-external-access-decide`
- Aprovação: chama `auth.admin.inviteUserByEmail` → usa o SMTP do Auth →
  envia o template "Invite User" customizado.
- Fallback de aprovação (v9.3.5.7): se o SMTP do Auth falhar, gera o link
  via `auth.admin.generateLink` e tenta entregar o convite **diretamente**
  pelo SMTP Hostinger (denomailer, provider `hostinger_smtp_invite_link`).
  Só se esse segundo envio também falhar a UI admin mostra a URL com botão
  "Copiar" para envio manual (link expira em 60 minutos).
- Rejeição: tenta enviar via Resend (se configurado). Sem provider, marca
  `metadata.rejection_email.status = pending_provider_setup` e registra no
  admin para reenvio futuro.

#### `kc-help-request-notify`
- Notifica `contato@kinocampus.com.br` sobre nova solicitação de acesso
  externo + envia ACK ("Recebemos sua solicitação") ao solicitante.
- **Atualmente depende de Resend (env vars `KC_NOTIFICATION_EMAIL_*`)**.
  Sem essas envs, marca metadata como `missing_resend_configuration` e
  segue sem falhar. Próximo passo: portar para usar o SMTP Hostinger via
  biblioteca `denomailer` (igual ao Auth) e remover dependência de Resend.

## Como rotacionar credenciais

### Cenário A — Comprometeu a app password (revogar)
1. Hostinger → Emails → Mailboxes → `contato@kinocampus.com.br` (...) →
   **App passwords** → ícone de lixeira na linha "Supabase SMTP".
2. **Generate** uma nova app password (anote a string `xxxx-xxxx-xxxx-xxxx`).
3. Supabase Dashboard → Project Settings → Authentication → Email →
   **SMTP Settings** → campo Password → cole a nova → **Save changes**.

### Cenário B — Trocou a senha do webmail
Não afeta a app password. App passwords são independentes.

## Diagnosticando falhas

### "Email rate limit exceeded"
- Supabase Auth tem rate limit (default 3 emails/hour por user). Aumentar
  em **Authentication → Rate Limits**.

### "535 5.7.8 authentication failed"
- App password no Supabase está errada/revogada. Siga "Cenário A" acima.

### Logs
- **Auth logs**: Dashboard → Logs → Auth Logs (filtrar por `path:/invite`)
- **Edge Function logs**: Dashboard → Edge Functions → função → Logs
- **Help request metadata**: tabela `public.help_requests` →
  `metadata->'invite_email'` ou `metadata->'email_notification'`.

## Próximos passos (opcionais)

1. **Adicionar SPF/DKIM/DMARC** verificados no DNS do `kinocampus.com.br`
   para melhor deliverability (Hostinger já configura SPF básico; conferir
   em `Hostinger → Emails → Custom DKIM`).
2. **Customizar mais templates de auth** (Magic Link, Change email address)
   com o mesmo padrão visual aplicado em Invite/Confirm/Reset.

## Histórico (v9.3.5.5)

- ✅ `kc-help-request-notify` migrada para usar Hostinger SMTP direto
  via `denomailer`. Envia 2 e-mails: notificação ao admin + ACK ao
  solicitante. Não depende de Resend.
- ✅ `kc-external-access-decide` (parte recusada) migrada para Hostinger
  SMTP direto. Recusa envia e-mail real com identidade KinoCampus.
- ✅ Secrets configurados: KC_SMTP_HOST, KC_SMTP_PORT, KC_SMTP_USER,
  KC_SMTP_PASS, KC_SMTP_FROM_NAME, KC_SMTP_FROM_EMAIL,
  KC_ADMIN_NOTIFICATION_EMAIL.
- ✅ Templates Confirm signup e Reset password atualizados com identidade
  visual KinoCampus (cabeçalho laranja + "Comunidade UFG" + botão laranja).
