begin;

select set_config('request.jwt.claim.role', 'anon', true);

select *
from public.kc_create_help_request(
  '{
    "type": "external_access",
    "topic": "non_institutional_email",
    "subject": "Solicitação de acesso externo",
    "message": "Preciso acompanhar atividades institucionais como pesquisador convidado.",
    "contact_email": "teste@example.com",
    "metadata": {
      "request_kind": "external_access"
    }
  }'::jsonb
);

select
  type,
  topic,
  status,
  admin_status,
  priority
from public.help_requests
where contact_email = 'teste@example.com';

rollback;
