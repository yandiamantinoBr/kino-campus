# Configuração de E-mail Outbound (SMTP) — v9.3.5.4

Documento descrevendo como o envio de e-mails está configurado no KinoCampus,
para referência ao operar/restaurar o setup.

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
- Fallback de aprovação: se SMTP falhar (ex.: app password revogada),
  chama `auth.admin.generateLink` que devolve a URL de convite sem enviar
  e-mail. A UI admin mostra essa URL com botão "Copiar" para envio manual.
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

1. **Migrar `kc-help-request-notify` para usar Hostinger SMTP direto** via
   `denomailer` — elimina a dependência opcional de Resend.
2. **Customizar template "Confirm signup"** (envio durante cadastro) em
   PT-BR com a mesma identidade do "Invite User".
3. **Customizar template "Reset Password"** idem.
4. **Adicionar SPF/DKIM/DMARC** verificados no DNS do `kinocampus.com.br`
   para melhor deliverability (Hostinger já configura SPF básico; conferir
   em `Hostinger → Emails → Custom DKIM`).
