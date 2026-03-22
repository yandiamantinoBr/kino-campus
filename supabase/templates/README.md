Use [kino-auth-email-template.html](/Users/yan1n/Documents/GitHub/kino-campus/supabase/templates/kino-auth-email-template.html) como base para o template de confirmacao de e-mail no Supabase Auth. O CTA principal deve usar `{{ .ConfirmationURL }}`.

Checklist:
- Configure `Site URL` e `Redirect URLs` incluindo `auth-callback.html`.
- Cole o HTML no template de confirmacao do painel Supabase Auth.
- Se houver SMTP institucional, configure o remetente do KinoCampus antes de publicar.
