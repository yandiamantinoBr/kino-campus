param(
  [string]$ProjectRef = "wacyrkwhkvzwkqpolrbg",
  [string]$FunctionName = "kc-account-erasure",
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

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw "SUPABASE_ACCESS_TOKEN nao definido. Gere em Supabase Dashboard > Account > Access Tokens e execute: `$env:SUPABASE_ACCESS_TOKEN='seu_token'"
}

Require-Command "npx" | Out-Null
$deno = Resolve-Deno

Write-Step "Validando Deno"
& $deno --version

Write-Step "Validando Supabase CLI via npx"
npx supabase --version

Write-Step "Validando TypeScript da Edge Function"
$env:DENO_DIR = Join-Path $env:TEMP "kino-deno-cache"
& $deno check --no-lock --node-modules-dir=auto "supabase/functions/$FunctionName/index.ts"

Write-Step "Listando migrations remotas"
npx supabase migration list --linked

if ($DryRun) {
  Write-Step "Dry-run das migrations"
  npx supabase db push --linked --dry-run
} else {
  Write-Step "Aplicando migrations pendentes"
  npx supabase db push --linked
}

Write-Step "Verificando tabela LGPD"
npx supabase db query --linked "select to_regclass('public.account_erasure_requests') as account_erasure_requests;" -o json

if ($DryRun) {
  Write-Step "Dry-run encerrado: deploy da Edge Function nao executado"
  exit 0
}

Write-Step "Fazendo deploy da Edge Function $FunctionName"
npx supabase functions deploy $FunctionName --project-ref $ProjectRef --use-api

Write-Step "Verificando Edge Functions no projeto"
npx supabase functions list --project-ref $ProjectRef

Write-Host ""
Write-Host "LGPD Supabase deploy concluido." -ForegroundColor Green
