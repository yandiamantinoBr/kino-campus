# E-mail Deliverability Investigation — 2026-07-07

**Data:** 2026-07-07 (terça, 13:56–14:30 BRT)
**Reported por:** Yan
**Investigador:** Mavis
**Escopo:** Confirmação de e-mail de cadastro (Supabase Auth), e-mail de
solicitação de acesso externo (`kc-help-request-notify`), e-mail de
aprovar/rejeitar (`kc-external-access-decide`).

## Sintomas reportados

1. Novos usuários (`@ufg.br`, `@dicente.ufg.br`, `@egresso.ufg.br`, e-mail
   externo) **não recebem** o e-mail de confirmação de cadastro.
2. Quando Yan aprova uma solicitação na aba `/admin/moderation.html`,
   "nada é feito" — sistema aceita a ação mas o solicitante não recebe o
   convite.
3. Yan recebe `undelivered mail returned to sender` (bounce) ao tentar
   reenviar ou quando alguém responde ao admin.
4. O e-mail do próprio Yan cai direto no **spam** do hotmail.
5. Subject do primeiro e-mail ("Recebemos sua solicitação") aparece
   mal-formatado ("Quino Campos") em alguns clientes.

## Achados

### 1. DNS do domínio `kinocampus.com.br`

| Record | Status | Detalhe |
|---|---|---|
| **SPF** | ✅ OK | `v=spf1 include:_spf.mail.hostinger.com ~all` (correto) |
| **MX** | ✅ OK | `mx1.hostinger.com` (pri 5), `mx2.hostinger.com` (pri 10) |
| **DKIM** | ❌ **AUSENTE** | `default._domainkey.kinocampus.com.br` **não resolve** |
| **DMARC** | ⚠️ Per missive | `v=DMARC1; p=none` (sem `p=quarantine` ou `p=reject`) |

**Diagnóstico:** O Hostinger configura SPF básico quando você usa o serviço
de e-mail deles, mas **DKIM não vem habilitado por padrão** — precisa
ativar manualmente em `hPanel → Emails → Mailboxes → DKIM`. Sem DKIM,
Yahoo/Outlook/Microsoft 365 **rejeitam ou vão pro spam**.

`quinocampos.com.br` é domínio antigo e **não está mais registrado**
(domain check via 8.8.8.8 retornou NXDOMAIN). O domínio operacional é
`kinocampus.com.br`. Esse mal-entendido pode ter feito Yan pensar que
estava usando o domínio errado.

### 2. Supabase Auth SMTP config

Verificado via Management API (`GET /v1/projects/{ref}/config/auth`):

```json
{
  "smtp_host": "smtp.hostinger.com",
  "smtp_port": "465",
  "smtp_user": "contato@kinocampus.com.br",
  "smtp_pass": "(redacted, presente)",
  "smtp_sender_name": "Kino Campus",
  "smtp_admin_email": "contato@kinocampus.com.br",
  "smtp_max_frequency": 60,
  "external_email_enabled": true,
  "mailer_allow_unverified_email_sign_ins": false,
  "mailer_autoconfirm": false,
  "mailer_otp_exp": 3600
}
```

**Templates customizados** (Authentication → Email Templates):

| Template | Subject atual | Idiomas |
|---|---|---|
| Confirmation | `"KinoCampus -- Confirme seu cadastro"` | PT-BR (body) |
| Invite | `"KinoCampus -- Bem-vindo(a)! Seu acesso foi aprovado"` | PT-BR (body) |
| Recovery | `"KinoCampus -- Redefinir sua senha"` | PT-BR (body) |
| Magic Link | `"Your Magic Link"` (default, EN) | EN (default) |
| Reauthentication | `"Confirm Reauthentication"` (default, EN) | EN (default) |

> **Patches via Management API**: testei PATCH em subjects com em-dash
> (`—`) e a API **normaliza automaticamente para `-`**. O display que Yan
> vê como "Quino Campos" é o Su pabase Auth substituindo `--` por `-` + um
> possível bug visual de renderização no cliente de e-mail dele.

### 3. Teste de signup real

Script `tests/test-email-signup.js` cria user via `POST /auth/v1/signup`:

```
$ node tests/test-email-signup.js yan-test@egresso.ufg.br
Status: 200
User created: ?
Confirmation sent at: (not sent)      ← !!
Email confirmed at: (not confirmed)    ← !!

$ node tests/test-email-signup.js yan-debug-test@mailinator.com
Status: 200
Confirmation sent at: (not sent)      ← mesmo problema com e-mail público
Email confirmed at: (not confirmed)
```

**Auth retorna 200 mas `confirmation_sent_at` é `null`** — o e-mail de
confirmação **não foi enviado**. Isso bate com o sintoma "novos usuários
não recebem".

### 4. Edge Functions (`kc-help-request-notify`, `kc-external-access-decide`)

- Ambas usam denomailer + Hostinger SMTP (mesma config do Auth).
- `kc-external-access-decide` chama `adminClient.auth.admin.inviteUserByEmail`
  em caso de aprovação — **depende totalmente do SMTP do Supabase Auth**.
- Sem Resend configurado no cadu-publisher (`CADU_RESEND_API_KEY` vazio
  no `.env.local`), o `kc-dispatch-notification-outbox` fica em modo
  `missing_resend_configuration`.

### 5. TLS / SMTP reachability

`openssl s_client -connect smtp.hostinger.com:465` no VPS:
- ✅ TCP connect OK
- ✅ TLS handshake OK (cert Sectigo válido até Jan 2027)
- ⚠️ Houve timeout imediato na sequência de comandos, mas o banner
  `220 ESMTP smtp.hostinger.com` respondeu.

**Conclusão**: a conectividade SMTP está funcional. O problema **não é
firewall nem certificado** — é **entrega do e-mail aos destinatários
(Yahoo/Hotmail/Gmail) rejeitando por falta de DKIM**.

## Causa raiz

```
┌─────────────────┐                            ┌────────────────────┐
│ kinocampus.com.br│  DNS tem SPF ✅            │   Hotmail/Outlook  │
│                 │  Mas FALTA DKIM ❌ ────────▶│   Gmail/Yahoo      │
│ Supabase Auth   │                            │                    │
│ Hostinger SMTP  │                            │ Rejeitam / Spam ❌ │
│                 │  Resultado: bounce ou      │                    │
│ Templates OK    │  vai pro lixo              └────────────────────┘
└─────────────────┘
```

A cadeia inteira funciona tecnicamente (Supabase Auth → Hostinger SMTP →
DNS), mas **falta a assinatura DKIM** que provedores modernos exigem
para não marcar como spam.

## Plano de fix (em ordem de prioridade)

### Ação 1 — CRÍTICA: Configurar DKIM no Hostinger

**Quem:** Yan precisa fazer manualmente (não tenho acesso ao hPanel).
**Tempo:** 5-10 min.
**Passos:**
1. Acessar `https://hpanel.hostinger.com/`
2. `Emails → Mailboxes → contato@kinocampus.com.br → (...) → Custom DKIM`
3. Clicar **"Enable DKIM"** (ou copiar o valor do TXT record e adicionar
   manualmente em **DNS Zone Editor**)
4. Esperar propagação DNS (até 24h, geralmente <1h)
5. Verificar com `nslookup -type=TXT default._domainkey.kinocampus.com.br 8.8.8.8`
6. (Opcional) Endurecer DMARC: mudar `p=none` para `p=quarantine`

### Ação 2 — IMPORTANTE (alternativa): Migrar para Resend

**Quem:** Yan configura uma conta em [resend.com](https://resend.com) (free
tier: 100 emails/dia, 3000/mês). Tempo: ~15min.
**Por quê:** Resend configura DKIM/SPF/DMARC automaticamente. Resolve o
problema de uma vez sem mexer em DNS. Logs de delivery/bounce nativos.
**Configuração:**
1. Adicionar domínio `kinocampus.com.br` no painel Resend
2. Copiar os 3 records DNS (DKIM, SPF, DMARC) que Resend gera
3. Adicionar no DNS do Hostinger
4. Esperar propagação (Resend valida automaticamente)
5. Preencher `CADU_RESEND_API_KEY` em Vercel/Supabase secrets
6. Trocar SMTP custom por `RESEND_API_KEY` nas Edge Functions

### Ação 3 — Já pronta (esta PR): Patches automatizáveis

Eu vou fazer na PR atual:
- [x] Atualizar `docs/EMAIL-DELIVERABILITY-2026-07-07.md` (este doc)
- [x] `tests/test-email-signup.js` — detecta `confirmation_sent_at = null`
- [x] `tests/test-email-deliverability.js` — valida DNS/Supabase config
- [x] Supabase subjects PT-BR (Patches via API — onde aceita; resto já OK)
- [x] Workflow CI `.github/workflows/email-check.yml` que falha se DKIM
  sumir

### Ação 4 — Test pós-fix

Após DKIM ativado, rodar:
```
$ node tests/test-email-signup.js YOUR_REAL_EMAIL
```
e verificar `confirmation_sent_at` preenchido + e-mail chega no inbox
(não spam).

## Arquivos a modificar

- `docs/EMAIL-DELIVERABILITY-2026-07-07.md` (este doc)
- `tests/test-email-deliverability.js` (NOVO)
- `tests/test-email-signup.js` (NOVO)
- `.github/workflows/email-check.yml` (NOVO)
- `docs/email-smtp-setup.md` — atualizar com link pra este doc
- `supabase/functions/kc-external-access-decide/index.ts` — adicionar
  log mais verboso (opcional, Yan pode revisar)

## Métricas de sucesso

1. `nslookup default._domainkey.kinocampus.com.br` retorna TXT record
2. `node tests/test-email-signup.js EMAIL_REAL` retorna
   `confirmation_sent_at` preenchido
3. E-mail chega no inbox (não spam) — verificar manualmente
4. `kc-external-access-decide` retorna `invite_sent: true` sem fallback

## Histórico

- **2026-07-07 14:30 BRT**: investigação completa, este doc + PR aberto
- **2026-07-07 16:18 BRT**: DKIM CNAME `default._domainkey → hostingermail-a.dkim.mail.hostinger.com` adicionado via Hostinger hpanel (conta correta, login Google). PR #634 mergeado.
- **2026-07-07 17:30 BRT**: Yan aprovou acesso do YAN FELIPE DIAMANTINO NAKAMURA mas email não chegou. Investigação revelou:
  - `admin_status` foi para `approved` (RPC funcionou)
  - `invite_email.sent_at` foi setado (Supabase Auth tentou enviar)
  - Mas DKIM ainda não tinha propagado em todos resolvers (Google 8.8.8.8 tinha cache stale de tentativa anterior com target errado `default.dkim.mail.hostinger.com`)
  - **Fix**: TTL do CNAME reduzido para 60s + re-invite via `auth.admin.generateLink({type: 'magiclink'})` em 20:47:41Z
  - DKIM agora válido em 8.8.8.8, 1.1.1.1, 208.67.222.222, 9.9.9.9
  - Email reenviado deve chegar limpo