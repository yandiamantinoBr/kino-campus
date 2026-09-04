# auth-mailer — reenvio de confirmação de e-mail via SMTP próprio

## Por que existe
O SMTP built-in do Supabase (MailChannels) produz **bounces 5.1.1** para
@ufg.br/@discente.ufg.br e cai em spam no Hotmail/Outlook — 71 bounces
registrados na caixa contato@kinocampus.com.br, deixando dezenas de usuários
travados sem confirmar o e-mail.

Este script lista os usuários NÃO confirmados via Admin API, gera um link
fresco de confirmação (`admin generate_link`, tipo signup, redirect para
/auth-callback.html) e envia o e-mail **diretamente via SMTP do Hostinger**
(de dominio proprio, com DKIM/SPF corretos), com o header de marca real da
KinoCampus.

## Requisitos
- Envio SMTP habilitado para a conta contato@kinocampus.com.br no hPanel
  (Hostinger). Status atual: **554 5.7.1 Outbound sending is disabled** —
  habilitar em hPanel > Emails > conta > (verificacao/limite de envio).
- Alternativa definitiva: configurar SMTP customizado no Supabase Dashboard
  (Project Settings > Auth > SMTP) com o Hostinger — ai o proprio Supabase
  envia confirmacoes/invites com entregabilidade correta.

## Uso
```bash
KINOCAMPUS_SUPABASE_URL=... KINOCAMPUS_SUPABASE_SECRET_KEY=... \
  python3 scripts/maintenance/auth-mailer.py
```
Estado (dedup de envios) em $AUTH_MAILER_DB (default ./state.db).
