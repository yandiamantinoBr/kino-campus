param(
  [string]$ProjectRef = "wacyrkwhkvzwkqpolrbg",
  [string]$FunctionName = "kc-account-erasure",
  [string]$MigrationFile = "supabase/migrations/20260525143000_lgpd_account_erasure_requests.sql",
  [string]$MigrationName = "20260525143000_lgpd_account_erasure_requests",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command {
  param([string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Comando '$Name' nao encontrado. Instale ou rode via npx conforme indicado."
  }
  return $command.Source
}

function Resolve-Deno {
  $command = Get-Command deno -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $wingetPath = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\deno.exe"
  if (Test-Path $wingetPath) { return $wingetPath }

  throw "Deno nao encontrado. Instale com: winget install DenoLand.Deno --accept-source-agreements --accept-package-agreements"
}

function Get-SupabaseAccessToken {
  if ($env:SUPABASE_ACCESS_TOKEN) { return $env:SUPABASE_ACCESS_TOKEN.Trim() }

  if ($IsWindows -or $env:OS -eq "Windows_NT") {
    $source = @"
using System;
using System.Runtime.InteropServices;
public class KinoSupabaseCredentialReader {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string target, uint type, int reservedFlag, out IntPtr credentialPtr);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern void CredFree(IntPtr buffer);
  public static string ReadToken() {
    IntPtr credPtr;
    if (!CredRead("Supabase CLI:supabase", 1, 0, out credPtr)) return null;
    try {
      var cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
      if (cred.CredentialBlobSize == 0) return "";
      byte[] bytes = new byte[cred.CredentialBlobSize];
      Marshal.Copy(cred.CredentialBlob, bytes, 0, (int)cred.CredentialBlobSize);
      return System.Text.Encoding.UTF8.GetString(bytes).TrimEnd('\0');
    } finally {
      CredFree(credPtr);
    }
  }
}
"@
    if (-not ("KinoSupabaseCredentialReader" -as [type])) {
      Add-Type -TypeDefinition $source | Out-Null
    }
    $token = [KinoSupabaseCredentialReader]::ReadToken()
    if ($token) { return $token.Trim() }
  }

  throw "Token Supabase nao encontrado. Rode: npx supabase login --token <token> ou defina SUPABASE_ACCESS_TOKEN."
}

function Invoke-SupabaseManagementApi {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [hashtable]$ExtraHeaders = @{}
  )

  $token = Get-SupabaseAccessToken
  $headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
  }
  foreach ($key in $ExtraHeaders.Keys) {
    $headers[$key] = $ExtraHeaders[$key]
  }

  $params = @{
    Method = $Method
    Uri = "https://api.supabase.com$Path"
    Headers = $headers
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Compress -Depth 20)
  }

  return Invoke-RestMethod @params
}

function Invoke-SupabaseDatabaseQuery {
  param(
    [string]$Query,
    [bool]$ReadOnly = $true
  )
  return Invoke-SupabaseManagementApi `
    -Method "Post" `
    -Path "/v1/projects/$ProjectRef/database/query" `
    -Body ([pscustomobject]@{ query = $Query; read_only = $ReadOnly })
}

function Get-AccountErasureTableStatus {
  $query = @"
select
  to_regclass('public.account_erasure_requests') as account_erasure_requests,
  exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'account_erasure_requests' and policyname = 'account_erasure_requests_select_admin') as select_policy_exists,
  exists(select 1 from pg_tables where schemaname = 'public' and tablename = 'account_erasure_requests') as table_exists;
"@
  return Invoke-SupabaseDatabaseQuery -Query $query -ReadOnly $true
}

function Test-MigrationHistoryContainsLocalVersion {
  $history = Invoke-SupabaseManagementApi -Method "Get" -Path "/v1/projects/$ProjectRef/database/migrations"
  return (($history | ConvertTo-Json -Depth 20) -match "20260525143000")
}

Require-Command "npx" | Out-Null
$deno = Resolve-Deno

Write-Step "Validando Deno"
& $deno --version

Write-Step "Validando Supabase CLI via npx"
npx supabase --version

Write-Step "Validando autenticacao Supabase"
$authOutput = & npx supabase --dns-resolver https projects list --output json 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Supabase CLI nao autenticado. Rode: npx supabase login --token <token>"
}

Write-Step "Validando token da Management API"
$project = Invoke-SupabaseManagementApi -Method "Get" -Path "/v1/projects/$ProjectRef"
Write-Host ("Projeto Supabase: {0} ({1})" -f $project.name, $project.status)

Write-Step "Validando TypeScript da Edge Function"
$env:DENO_DIR = Join-Path $env:TEMP "kino-deno-cache"
& $deno check --no-lock --node-modules-dir=auto "supabase/functions/$FunctionName/index.ts"

Write-Step "Verificando migration LGPD remota"
$status = Get-AccountErasureTableStatus
$row = @($status)[0]
$tableExists = [bool]$row.table_exists
$historyContainsVersion = Test-MigrationHistoryContainsLocalVersion

Write-Host ("Tabela account_erasure_requests: {0}" -f $(if ($tableExists) { "existe" } else { "ausente" }))
Write-Host ("Historico remoto contem 20260525143000: {0}" -f $historyContainsVersion)

if (-not (Test-Path $MigrationFile)) {
  throw "Migration local nao encontrada: $MigrationFile"
}

if (-not $tableExists -or -not $historyContainsVersion) {
  if ($DryRun) {
    Write-Step "Dry-run das migrations"
    Write-Host "A migration LGPD seria aplicada pela Management API."
  } else {
    Write-Step "Aplicando migration LGPD pela Management API"
    $sql = [string](Get-Content $MigrationFile -Raw)
    Invoke-SupabaseManagementApi `
      -Method "Post" `
      -Path "/v1/projects/$ProjectRef/database/migrations" `
      -ExtraHeaders @{ "Idempotency-Key" = "kino-lgpd-account-erasure-20260525143000" } `
      -Body ([pscustomobject]@{ query = $sql; name = $MigrationName }) | Out-Null
  }
}

Write-Step "Verificando tabela LGPD"
Get-AccountErasureTableStatus | ConvertTo-Json -Depth 8

if ($DryRun) {
  Write-Step "Dry-run encerrado: deploy da Edge Function nao executado"
  exit 0
}

Write-Step "Fazendo deploy da Edge Function $FunctionName"
npx supabase --dns-resolver https functions deploy $FunctionName --project-ref $ProjectRef --use-api

Write-Step "Verificando Edge Functions no projeto"
npx supabase --dns-resolver https functions list --project-ref $ProjectRef

Write-Host ""
Write-Host "LGPD Supabase deploy concluido." -ForegroundColor Green
