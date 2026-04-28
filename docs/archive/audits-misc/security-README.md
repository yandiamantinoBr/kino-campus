# docs/audits/security/

Auditorias de segurança do KinoCampus.

## Status

**Vazio em V14.** Diretório criado como placeholder para auditorias de segurança futuras.

## Escopo planejado

- Auditoria de XSS e sanitização de inputs
- Revisão de Content Security Policy (CSP) em `vercel.json`
- Auditoria de Row Level Security (RLS) Supabase
- Revisão de autenticação e gestão de sessão
- Análise de dados expostos via `window.*` globals

## Referências existentes

- `docs/qa/xss-payloads.md` — payloads de teste XSS
- `docs/qa/rls-smoke.sql` — smoke de RLS Supabase
- `vercel.json` — CSP headers e rewrites
