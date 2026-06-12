# Report V75 - Supabase Auth Password Protection

**Data:** 2026-06-11 America/Sao_Paulo
**Escopo:** verificacao operacional de `auth_leaked_password_protection`
**Ambiente:** Supabase remoto `Kino Campus` (`project_ref` redigido)
**Mudanca remota executada:** nao

---

## 1. Objetivo

Confirmar o estado atual da protecao contra senhas vazadas no Supabase Auth sem alterar dashboard,
SQL, secrets ou configuracao de producao.

---

## 2. Evidencia Coletada

Consulta restrita via Supabase Management API:

```powershell
$config = Invoke-RestMethod -Method Get `
  -Uri "https://api.supabase.com/v1/projects/<project-ref-redigido>/config/auth" `
  -Headers @{ Authorization = "Bearer <token-redigido>" }

$config.PSObject.Properties |
  Where-Object { $_.Name -match 'leak|pwn|hibp' } |
  ForEach-Object {
    [pscustomobject]@{
      Name = $_.Name
      Type = if ($null -eq $_.Value) { 'null' } else { $_.Value.GetType().Name }
      BooleanValue = if ($_.Value -is [bool]) { $_.Value } else { $null }
    }
  }
```

Resultado redigido:

| Campo | Tipo | Valor |
|---|---|---|
| `password_hibp_enabled` | Boolean | `false` |

Referencias oficiais consultadas:

- Supabase Docs, Password security: leaked password protection usa a API HaveIBeenPwned Pwned Passwords e esta disponivel no plano Pro ou superior.
- Supabase Changelog: sem breaking change recente especifica para leaked password protection; a mudanca relevante recente sobre Data API/default grants nao altera este item de Auth.

---

## 3. Diagnostico

O warning de auditoria continua valido: a protecao contra senhas vazadas esta desabilitada no projeto remoto.

Este item nao deve ser corrigido por migration ou patch frontend. A acao correta e operacional:

1. confirmar plano/permissao no Supabase Dashboard;
2. ativar a opcao de leaked password protection no Auth Dashboard, se aprovado;
3. registrar evidencia antes/depois;
4. validar signup/password update com usuario de teste;
5. manter rollback documentado para retornar `password_hibp_enabled=false` se houver regressao operacional.

---

## 4. Decisao

| Decisao | Motivo |
|---|---|
| Go condicionado | Estado remoto confirmado como `false`; habilitacao depende de aprovacao explicita para alterar Auth em producao |

---

## 5. Fora de Escopo

- Nao foi executado `PATCH` na Management API.
- Nao houve alteracao no Supabase Dashboard.
- Nao houve SQL, migration, deploy ou rotacao de secrets.
- Nenhum token, valor sensivel, hash de secret ou `project_ref` bruto foi registrado.
