# V75 - Runbook de Rotacao e Mitigacao de Tokens Locais

**Data:** 2026-06-11  
**Escopo:** credenciais operacionais locais e tokens de CLI; sem registrar valores no repo  
**Superficies:** GitHub, Supabase, Vercel, Windows env vars, secrets de CI  

---

## 1. Objetivo

Fornecer um caminho seguro para tratar tokens operacionais encontrados por nome no ambiente local
ou em processos de automacao. Este runbook nao autoriza publicar, colar, commitar ou imprimir valores
de tokens; ele descreve rotacao fora do git e verificacoes por presenca booleana.

Tokens/variaveis a revisar quando aparecerem no ambiente local:

- `GH_TOKEN`
- `SUPABASE_ACCESS_TOKEN`
- `VERCEL_TOKEN`

Essas variaveis sao uteis para automacao, mas devem ser tratadas como credenciais de alto impacto
quando ficam persistidas em escopos amplos do Windows ou sao reutilizadas entre ferramentas.

---

## 2. Regras

| Regra | Motivo |
|---|---|
| Nunca imprimir o valor do token | Evita transformar auditoria em vazamento |
| Preferir login nativo das CLIs a env vars persistentes | Reduz exposicao acidental em shells e logs |
| Usar tokens com menor escopo e validade curta | Limita impacto se houver reuso indevido |
| Revogar antes de descartar evidencia | Garante que valores antigos deixem de funcionar |
| Atualizar CI/ambientes por nome, nao por valor em docs | Preserva rastreabilidade sem secret leakage |

---

## 3. Verificacao Local Sem Valores

PowerShell seguro para confirmar presenca por escopo sem exibir valores:

```powershell
$names = 'GH_TOKEN', 'SUPABASE_ACCESS_TOKEN', 'VERCEL_TOKEN'
$scopes = [EnvironmentVariableTarget]::Process, [EnvironmentVariableTarget]::User, [EnvironmentVariableTarget]::Machine
foreach ($name in $names) {
  foreach ($scope in $scopes) {
    [pscustomobject]@{
      Name = $name
      Scope = $scope
      Present = [bool][Environment]::GetEnvironmentVariable($name, $scope)
    }
  }
}
```

Se `Present=True` em `User` ou `Machine`, remover a variavel persistente depois de confirmar que a
CLI correspondente continua autenticada por fluxo nativo ou por secret manager adequado.

---

## 4. Rotacao por Superficie

### GitHub

1. Identificar se `GH_TOKEN` e PAT classico, fine-grained PAT, GitHub App token ou token temporario.
2. Revogar o token antigo no painel do GitHub.
3. Reautenticar a CLI com fluxo nativo:

```bash
gh auth login
gh auth status
```

4. Se CI precisar de token customizado, armazenar apenas em GitHub Actions secrets e registrar somente o nome do secret.

### Supabase

1. Revogar o personal access token antigo no painel do Supabase.
2. Reautenticar a CLI sem persistir `SUPABASE_ACCESS_TOKEN` em escopo global quando possivel:

```bash
supabase login --token <novo-token-redigido>
supabase projects list
```

3. Confirmar que comandos de leitura funcionam. Nao colar saidas que tragam hashes ou metadados de secrets sem redacao.

### Vercel

1. Revogar o token antigo no painel da Vercel.
2. Reautenticar pela CLI quando o uso for interativo:

```bash
vercel logout
vercel login
vercel whoami
```

3. Se automacao exigir `VERCEL_TOKEN`, usar secret manager/CI e evitar variavel persistente no Windows.

---

## 5. CI e Ambientes Remotos

Checagens permitidas por nome:

```bash
gh secret list
vercel env ls
supabase secrets list --project-ref <redigido> --output json
```

Nao colar valores, hashes longos, endpoints privados ou payloads completos nos reports. Quando a
ferramenta imprimir metadados sensiveis demais, registrar apenas "presente/ausente" por nome.

---

## 6. Criterios de Conclusao

| Criterio | Evidencia permitida |
|---|---|
| Token antigo revogado | Data, plataforma e tipo de token, sem valor |
| CLI reautenticada | `auth status`, `whoami` ou comando equivalente sem token |
| Env var persistente removida quando desnecessaria | Tabela booleana `Present=False` em `User`/`Machine` |
| CI atualizado quando aplicavel | Nome do secret atualizado e ambiente, sem valor |
| Repo sem secrets | Resultado agregado de varredura, sem reproduzir possiveis matches sensiveis |

---

## 7. Fora de Escopo

- Revogar tokens automaticamente a partir do Codex.
- Exibir valores para comparar se um token antigo ainda esta ativo.
- Trocar secrets de producao sem janela de validacao.
- Fazer deploy, migration ou alteracao de dashboard junto com rotacao de credenciais.

