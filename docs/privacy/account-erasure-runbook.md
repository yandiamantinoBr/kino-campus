# LGPD Account Erasure Runbook

This runbook documents how KinoCampus handles requests to remove an account and personal registration data under LGPD, including Article 18, VI.

## Default Policy

- Use a two-step flow: reversible restriction first, irreversible erasure only after confirmation from the account e-mail.
- Posts created by the requester are hidden and anonymized instead of remaining public.
- Keep only the minimum internal audit record needed to prove handling: request id, e-mail hash, dates, admin id and aggregate counts.
- Do not store raw cookies, tokens, raw IP, raw user-agent or service keys in receipts or audit payloads.

## Manual Procedure

1. Locate the user in Supabase Auth by e-mail and copy the user id.
2. Before deleting Auth, check linked data in `profiles`, `posts`, `post_media`, `comments`, `post_votes`, `saved_posts`, `help_requests`, chat, notifications, analytics and Storage.
3. Apply the reversible step:
   - set the profile as non-public;
   - disable contact CTA;
   - hide posts owned by the user;
   - mark the help request as `in_progress`;
   - ask the requester to confirm irreversible erasure by e-mail.
4. After explicit confirmation, run irreversible erasure:
   - anonymize posts and remove media;
   - remove profile avatar and other user-owned storage objects;
   - remove or cascade linked personal interaction rows;
   - delete the Supabase Auth user from a server-side context using `service_role`;
   - close the help request without keeping the raw e-mail in exported receipts.
5. Send a completion e-mail and keep the internal receipt.

Deleting the Auth user directly from the Supabase Dashboard is not enough. It can cascade `profiles`, but leaves operational records, hidden content decisions, storage cleanup and request closure to be handled manually.

## Confirmation E-mail Template

Subject: Confirmacao de solicitacao de remocao de conta - KinoCampus

Ola, {nome}.

Recebemos sua solicitacao de remocao da conta associada ao e-mail `{email_da_conta}`, com fundamento nos direitos previstos na LGPD.

Por seguranca, antes de executar a eliminacao irreversivel dos dados cadastrais, precisamos confirmar que a solicitacao partiu do titular da conta. Enquanto isso, iniciaremos o tratamento interno do pedido e poderemos restringir a visibilidade de dados vinculados a conta quando aplicavel.

Para confirmar a exclusao definitiva, responda este e-mail com a frase:

`CONFIRMO A EXCLUSAO DA MINHA CONTA KINOCAMPUS`

Apos a confirmacao, a conta sera removida e os dados cadastrais serao eliminados ou anonimizados conforme a Politica de Privacidade do KinoCampus e as hipoteses legais de retencao minima para seguranca, auditoria e exercicio regular de direitos.

Caso tenha duvidas ou queira algum esclarecimento adicional, responda este e-mail ou entre em contato por `contato@kinocampus.com.br`.

Agradecemos por ter usado o KinoCampus. Caso queira voltar futuramente, sera possivel criar uma nova conta na plataforma.

Atenciosamente,
KinoCampus

## Automation Map

- `account_erasure_requests`: stores the internal workflow state without raw e-mail.
- `kc-account-erasure` Edge Function:
  - `diagnose`: matches the account and returns linked-data counts.
  - `apply_reversible`: hides posts, restricts profile visibility, updates help request and returns/sends the confirmation e-mail.
  - `generate_receipt`: returns the internal receipt for admin export.
  - `erase_confirmed`: requires the exact typed phrase `EXCLUIR {email}` and then runs irreversible erasure.
- `/admin/help-requests.html`: shows an LGPD panel only for requests that mention account removal, data deletion or LGPD.

## Rollback

Rollback is available only before `erase_confirmed`.

- Restore profile public visibility and contact CTA if appropriate.
- Re-publish posts that were hidden by the reversible step.
- Mark `account_erasure_requests.status = 'cancelled'`.
- Add an audit log entry explaining the cancellation.

After Auth deletion, storage cleanup and profile cascade, rollback is not guaranteed.
