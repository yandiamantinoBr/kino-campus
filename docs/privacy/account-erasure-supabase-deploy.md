# Deploy Supabase do fluxo LGPD

Este checklist aplica a migration `account_erasure_requests` e publica a Edge Function `kc-account-erasure` no projeto Supabase `wacyrkwhkvzwkqpolrbg`.

## Pré-requisitos

- Node e `npx` disponíveis.
- Deno instalado. No Windows:

```powershell
winget install DenoLand.Deno --accept-source-agreements --accept-package-agreements
```

- Token de acesso do Supabase. Gere em **Supabase Dashboard > Account > Access Tokens**.
- Defina o token só na sessão atual:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "seu_token"
```

Não salve esse token no repositório.

## Deploy validado

Rode primeiro em modo simulação:

```powershell
.\scripts\deploy-supabase-lgpd.ps1 -DryRun
```

Se o dry-run listar apenas a migration esperada, aplique:

```powershell
.\scripts\deploy-supabase-lgpd.ps1
```

O script faz:

1. valida `deno --version`;
2. valida `npx supabase --version`;
3. roda `deno check` na Edge Function;
4. lista migrations remotas;
5. aplica migrations pendentes;
6. verifica `public.account_erasure_requests`;
7. publica `kc-account-erasure` com `--use-api`;
8. lista Edge Functions para confirmar o deploy.

## Verificação no admin

1. Abra `/admin/help-requests.html` autenticado como administrador.
2. Localize o pedido LGPD.
3. Clique em `Preparar diagnóstico`.
4. Confira contagens de perfil, publicações, mídias, comentários e pedidos de ajuda.
5. Clique em `Ocultar conta e pedir confirmação`.
6. Envie o e-mail de confirmação gerado.
7. Só depois da resposta explícita do titular, digite `EXCLUIR {email}` e execute a exclusão confirmada.

## Template do e-mail

O HTML de referência fica em:

```text
supabase/templates/kino-account-erasure-confirmation-email.html
```

A Edge Function usa a mesma estrutura visual inline para o envio real.
