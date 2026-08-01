param(
  [string]$ProjectRef = "wacyrkwhkvzwkqpolrbg",
  [string[]]$FunctionNames = @(
    "cadu-publish",
    "kc-account-erasure",
    "kc-analytics-subject-id",
    "kc-create-privacy-help-guest",
    "kc-data-subject-request",
    "kc-data-export-admin",
    "kc-data-export-retention",
    "kc-external-access-decide",
    "kc-ga4-reports",
    "kc-help-request-notify",
    "kc-invite-user",
    "kc-search-console-reports"
  ),
  [switch]$DeployFunctions
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$SupabaseCliPackage = "supabase@2.105.0"

$RequiredMigrations = @(
  "20260728183022",
  "20260728184500",
  "20260728185000",
  "20260728210000",
  "20260728220000",
  "20260728230000",
  "20260728231500",
  "20260728233000",
  "20260728234000",
  "20260728235000",
  "20260729000000",
  "20260729001000",
  "20260729003000",
  "20260729004000",
  "20260729005000",
  "20260729006000",
  "20260729007000",
  "20260729008000",
  "20260729009000",
  "20260729011000",
  "20260729012000",
  "20260729172316",
  "20260729190653",
  "20260729203000",
  "20260731193000"
)
$RequiredSecretsByFunction = @{
  "kc-account-erasure" = @(
    "KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64",
    "KC_SMTP_USER",
    "KC_SMTP_PASS"
  )
  "kc-analytics-subject-id" = @(
    "KC_ANALYTICS_ID_SECRET"
  )
  "kc-create-privacy-help-guest" = @(
    "KC_PRIVACY_HELP_ALLOWED_ORIGINS",
    "KC_TURNSTILE_ENVIRONMENT",
    "KC_TURNSTILE_EXPECTED_HOSTNAMES",
    "KC_TURNSTILE_SECRET_KEY"
  )
  "kc-data-export-retention" = @(
    "KC_DATA_EXPORT_RETENTION_SECRET"
  )
  "kc-external-access-decide" = @(
    "KC_SMTP_USER",
    "KC_SMTP_PASS"
  )
  "kc-ga4-reports" = @(
    "KC_GA4_SA_KEY",
    "KC_GA4_PROPERTY_ID"
  )
  "kc-help-request-notify" = @(
    "KC_SMTP_USER",
    "KC_SMTP_PASS"
  )
  "kc-search-console-reports" = @(
    "KC_SEARCH_CONSOLE_SA_KEY",
    "KC_SEARCH_CONSOLE_SITE_URL"
  )
}
$RequiredSecrets = @(
  $FunctionNames |
    Where-Object { $RequiredSecretsByFunction.ContainsKey($_) } |
    ForEach-Object { $RequiredSecretsByFunction[$_] } |
    Sort-Object -Unique
)

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command {
  param([string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Comando '$Name' nao encontrado."
  }
  return $command.Source
}

function Resolve-Deno {
  $command = Get-Command deno -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidate = Join-Path `
    $env:LOCALAPPDATA `
    "Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\deno.exe"
  if (Test-Path -LiteralPath $candidate) { return $candidate }

  throw "Deno nao encontrado."
}

function Get-SupabaseAccessToken {
  if ($env:SUPABASE_ACCESS_TOKEN) {
    return $env:SUPABASE_ACCESS_TOKEN.Trim()
  }

  if ($env:OS -eq "Windows_NT") {
    $source = @"
using System;
using System.Runtime.InteropServices;
public class KinoSupabaseCredentialReaderV2 {
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
  public static extern bool CredRead(
    string target,
    uint type,
    int reservedFlag,
    out IntPtr credentialPtr
  );
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern void CredFree(IntPtr buffer);
  public static string ReadToken() {
    IntPtr credentialPointer;
    if (!CredRead(
      "Supabase CLI:supabase",
      1,
      0,
      out credentialPointer
    )) return null;
    try {
      var credential = (CREDENTIAL)Marshal.PtrToStructure(
        credentialPointer,
        typeof(CREDENTIAL)
      );
      if (credential.CredentialBlobSize == 0) return "";
      byte[] bytes = new byte[credential.CredentialBlobSize];
      Marshal.Copy(
        credential.CredentialBlob,
        bytes,
        0,
        (int)credential.CredentialBlobSize
      );
      return System.Text.Encoding.UTF8.GetString(bytes).TrimEnd('\0');
    } finally {
      CredFree(credentialPointer);
    }
  }
}
"@
    if (-not ("KinoSupabaseCredentialReaderV2" -as [type])) {
      Add-Type -TypeDefinition $source | Out-Null
    }
    $credentialToken = [KinoSupabaseCredentialReaderV2]::ReadToken()
    if ($credentialToken) { return $credentialToken.Trim() }
  }

  throw (
    "Token Supabase nao encontrado. Rode 'npx supabase login' ou defina " +
    "SUPABASE_ACCESS_TOKEN somente no processo."
  )
}

function Invoke-SupabaseManagementApi {
  param(
    [ValidateSet("Get", "Post")]
    [string]$Method,
    [string]$Path,
    [object]$Body = $null
  )

  $headers = @{
    Authorization = "Bearer $(Get-SupabaseAccessToken)"
    "Content-Type" = "application/json"
  }
  $parameters = @{
    Method = $Method
    Uri = "https://api.supabase.com$Path"
    Headers = $headers
  }
  if ($null -ne $Body) {
    $parameters.Body = $Body | ConvertTo-Json -Compress -Depth 20
  }
  return Invoke-RestMethod @parameters
}

function Invoke-ReadOnlyDatabaseQuery {
  param([string]$Query)

  $queryPath = Join-Path `
    ([System.IO.Path]::GetTempPath()) `
    ("kc-privacy-preflight-{0}.sql" -f [guid]::NewGuid().ToString("N"))
  $readOnlyQuery = @"
begin transaction read only;
$Query
commit;
"@

  try {
    [System.IO.File]::WriteAllText(
      $queryPath,
      $readOnlyQuery,
      [System.Text.UTF8Encoding]::new($false)
    )
    $queryOutput = & npx --yes $SupabaseCliPackage db query `
      --linked `
      --file $queryPath `
      --output json
    if ($LASTEXITCODE -ne 0) {
      throw "Consulta de preflight em transacao read-only falhou."
    }
    $serializedOutput = $queryOutput -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($serializedOutput)) {
      throw "Consulta de preflight em transacao read-only nao retornou JSON."
    }
    return $serializedOutput | ConvertFrom-Json
  } finally {
    [System.IO.File]::Delete($queryPath)
  }
}

function Get-FirstResultRow {
  param([object]$Response)
  if ($Response -is [System.Array]) {
    return @($Response)[0]
  }
  foreach ($propertyName in @("result", "data", "rows")) {
    if ($Response.PSObject.Properties.Name -contains $propertyName) {
      return @($Response.$propertyName)[0]
    }
  }
  return $Response
}

function Get-MigrationVersionSet {
  param([object]$History)

  $rows = @()
  if ($History -is [System.Array]) {
    $rows = @($History)
  } elseif ($null -ne $History) {
    foreach ($propertyName in @("result", "data", "migrations", "rows")) {
      if ($History.PSObject.Properties.Name -contains $propertyName) {
        $rows = @($History.$propertyName)
        break
      }
    }
    if (
      $rows.Count -eq 0 -and
      $History.PSObject.Properties.Name -contains "version"
    ) {
      $rows = @($History)
    }
  }

  return @(
    $rows |
      ForEach-Object {
        if (
          $null -ne $_ -and
          $_.PSObject.Properties.Name -contains "version"
        ) {
          $version = [string]$_.version
          if ($version -cmatch "^[0-9]{14}$") {
            $version
          }
        }
      } |
      Sort-Object -Unique
  )
}

$repositoryRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$previousLocation = Get-Location

try {
  Set-Location -LiteralPath $repositoryRoot
  if ($ProjectRef -cnotmatch "^[a-z0-9]{20}$") {
    throw "ProjectRef Supabase invalido."
  }
  Require-Command "npx" | Out-Null
  $deno = Resolve-Deno

  Write-Step "Validando arquivos e migration chain local"
  foreach ($version in $RequiredMigrations) {
    $matches = @(
      Get-ChildItem -LiteralPath "supabase/migrations" -File |
        Where-Object { $_.Name.StartsWith($version + "_") }
    )
    if ($matches.Count -ne 1) {
      throw "Esperada exatamente uma migration ativa para $version."
    }
  }
  foreach ($functionName in $FunctionNames) {
    if ($functionName -notmatch "^[a-z0-9_-]+$") {
      throw "Nome de Edge Function invalido: $functionName"
    }
    $entrypoint = "supabase/functions/$functionName/index.ts"
    if (-not (Test-Path -LiteralPath $entrypoint)) {
      throw "Edge Function local ausente: $entrypoint"
    }
    $denoConfig = "supabase/functions/$functionName/deno.json"
    if (Test-Path -LiteralPath $denoConfig) {
      & $deno check `
        --no-lock `
        --node-modules-dir=none `
        --config $denoConfig `
        $entrypoint
    } else {
      & $deno check --no-lock --node-modules-dir=none $entrypoint
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Deno check falhou para $functionName."
    }
  }

  $linkedProjectFile = Join-Path $repositoryRoot.Path "supabase/.temp/project-ref"
  if (-not (Test-Path -LiteralPath $linkedProjectFile)) {
    throw (
      "Projeto Supabase nao vinculado. Execute 'npx $SupabaseCliPackage " +
      "link --project-ref $ProjectRef'."
    )
  }
  $linkedProjectRef = (
    Get-Content -LiteralPath $linkedProjectFile -Raw -Encoding UTF8
  ).Trim()
  if ($linkedProjectRef -ne $ProjectRef) {
    throw (
      "Projeto vinculado ($linkedProjectRef) difere do projeto solicitado " +
      "($ProjectRef). Nenhuma verificacao remota foi executada."
    )
  }

  Write-Step "Validando autenticacao e projeto remoto"
  $project = Invoke-SupabaseManagementApi `
    -Method "Get" `
    -Path "/v1/projects/$ProjectRef"
  Write-Host ("Projeto: {0}; status: {1}" -f $project.name, $project.status)

  $postgrestConfig = Invoke-SupabaseManagementApi `
    -Method "Get" `
    -Path "/v1/projects/$ProjectRef/postgrest"
  $postgrestSchemas = @(
    @(
      [string]$postgrestConfig.db_schema,
      [string]$postgrestConfig.db_extra_search_path
    ) |
      ForEach-Object { $_ -split "," } |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ } |
      Sort-Object -Unique
  )
  $sensitiveExposedSchemas = @(
    @("net", "vault") |
      Where-Object { $_ -in $postgrestSchemas }
  )
  if ($sensitiveExposedSchemas.Count -gt 0) {
    throw (
      "Schemas sensiveis expostos pelo PostgREST: " +
      ($sensitiveExposedSchemas -join ", ")
    )
  }

  # O repositorio preserva migrations historicas anteriores ao ledger remoto.
  # Este deploy de Edge valida somente a cadeia LGPD explicita e o schema real;
  # reconciliar o historico completo exige uma operacao separada e auditada.
  Write-Step "Comparando migrations LGPD sem aplicar mudancas"
  $history = Invoke-SupabaseManagementApi `
    -Method "Get" `
    -Path "/v1/projects/$ProjectRef/database/migrations"
  $remoteMigrationVersions = @(Get-MigrationVersionSet -History $history)
  $missingMigrations = @(
    $RequiredMigrations |
      Where-Object { $remoteMigrationVersions -cnotcontains $_ }
  )
  if ($missingMigrations.Count -gt 0) {
    throw (
      "Migrations ainda nao registradas no remoto: " +
      ($missingMigrations -join ", ") +
      ". Aplique a cadeia com 'npx supabase db push' e repita a validacao."
    )
  }

  $schemaContractPath = Join-Path $repositoryRoot.Path "scripts/verify-privacy-schema.sql"
  if (-not (Test-Path -LiteralPath $schemaContractPath)) {
    throw "Contrato de preflight ausente: scripts/verify-privacy-schema.sql"
  }
  $schemaQuery = Get-Content -LiteralPath $schemaContractPath -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($schemaQuery)) {
    throw "Contrato de preflight de privacidade esta vazio."
  }
  $projectRefPlaceholder = "__KC_EXPECTED_PROJECT_REF__"
  if (
    (
      [regex]::Matches(
        $schemaQuery,
        [regex]::Escape($projectRefPlaceholder)
      )
    ).Count -ne 1
  ) {
    throw "Contrato de preflight nao possui placeholder unico de project-ref."
  }
  $schemaQuery = $schemaQuery.Replace($projectRefPlaceholder, $ProjectRef)
  $schemaResponse = Invoke-ReadOnlyDatabaseQuery -Query $schemaQuery
  $schemaRow = Get-FirstResultRow -Response $schemaResponse
  $missingCapabilities = @(
    $schemaRow.PSObject.Properties |
      Where-Object { $_.Value -ne $true } |
      ForEach-Object { $_.Name }
  )

  Write-Step "Validando nomes de secrets (valores nunca sao lidos)"
  $secretOutput = & npx --yes $SupabaseCliPackage secrets list `
    --project-ref $ProjectRef `
    --output json
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel listar os nomes dos secrets remotos."
  }
  $secretRows = @(($secretOutput -join [Environment]::NewLine) | ConvertFrom-Json)
  $secretNames = @(
    $secretRows |
      ForEach-Object { $_.name } |
      Where-Object { $_ }
  )
  $missingSecrets = @(
    $RequiredSecrets |
      Where-Object { $_ -notin $secretNames }
  )

  if ($missingCapabilities.Count -gt 0) {
    throw (
      "Schema/capabilities remotos incompletos: " +
      ($missingCapabilities -join ", ")
    )
  }
  if ($missingSecrets.Count -gt 0) {
    throw (
      "Secrets obrigatorios ausentes: " +
      ($missingSecrets -join ", ")
    )
  }

  Write-Host "Validacao LGPD remota concluida sem alteracoes." -ForegroundColor Green

  if (-not $DeployFunctions) {
    Write-Host (
      "Nenhuma funcao foi publicada. Use -DeployFunctions somente depois " +
      "desta validacao ficar verde."
    )
    exit 0
  }

  Write-Step "Publicando somente as Edge Functions explicitamente selecionadas"
  foreach ($functionName in $FunctionNames) {
    & npx --yes $SupabaseCliPackage functions deploy `
      $functionName `
      --project-ref $ProjectRef `
      --use-api
    if ($LASTEXITCODE -ne 0) {
      throw "Deploy falhou para $functionName."
    }
  }

  Write-Step "Verificando estado das Edge Functions"
  & npx --yes $SupabaseCliPackage functions list --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel verificar as Edge Functions publicadas."
  }
  Write-Host "Deploy LGPD concluido." -ForegroundColor Green
}
finally {
  Set-Location -LiteralPath $previousLocation
}
