param(
  [string]$ProjectRef = "wacyrkwhkvzwkqpolrbg",
  [string]$AppBaseUrl = "https://www.kinocampus.com.br",
  [switch]$ConfigureOutboxEncryption,
  [switch]$ConfigureRetentionSchedule
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$SupabaseCliPackage = "supabase@2.105.0"

function Invoke-Supabase {
  param([string[]]$Arguments)

  $previousErrorAction = $ErrorActionPreference
  try {
    # The CLI writes connection progress to stderr even when it succeeds.
    $ErrorActionPreference = "Continue"
    $output = & npx --yes $SupabaseCliPackage @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
  if ($exitCode -ne 0) {
    throw "Supabase CLI failed. No secret value was printed."
  }
  return @($output)
}

function Write-PrivateTempFile {
  param(
    [string]$Prefix,
    [string]$Extension,
    [string]$Contents
  )

  $path = Join-Path (
    [IO.Path]::GetTempPath()
  ) ("{0}-{1}.{2}" -f $Prefix, [guid]::NewGuid().ToString("N"), $Extension)
  [IO.File]::WriteAllText($path, $Contents, [Text.UTF8Encoding]::new($false))
  return $path
}

function New-RandomBase64 {
  param([ValidateRange(32, 4096)][int]$ByteCount)

  $bytes = [byte[]]::new($ByteCount)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
  } finally {
    $generator.Dispose()
    [Array]::Clear($bytes, 0, $bytes.Length)
  }
}

function Get-ConfiguredEdgeSecretNames {
  $output = Invoke-Supabase @(
    "secrets", "list",
    "--project-ref", $ProjectRef,
    "--output", "json"
  )
  $json = $output -join [Environment]::NewLine
  $parsed = $json | ConvertFrom-Json
  return @($parsed) |
    ForEach-Object { [string]$_.name } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { $_.Trim() }
}

function Get-SupabaseAccessToken {
  if ($env:SUPABASE_ACCESS_TOKEN) {
    return $env:SUPABASE_ACCESS_TOKEN.Trim()
  }

  if ($env:OS -eq "Windows_NT") {
    $source = @"
using System;
using System.Runtime.InteropServices;
public class KinoPrivacyRuntimeCredentialReader {
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
    if (!CredRead("Supabase CLI:supabase", 1, 0, out credentialPointer)) {
      return null;
    }
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
    if (-not ("KinoPrivacyRuntimeCredentialReader" -as [type])) {
      Add-Type -TypeDefinition $source | Out-Null
    }
    $credentialToken = [KinoPrivacyRuntimeCredentialReader]::ReadToken()
    if ($credentialToken) {
      return $credentialToken.Trim()
    }
  }

  throw "Supabase access token not found. Run 'npx supabase login'."
}

function Invoke-ManagementDatabaseQuery {
  param([string]$Sql)

  $headers = @{
    Authorization = "Bearer $(Get-SupabaseAccessToken)"
    "Content-Type" = "application/json"
  }
  $body = @{ query = $Sql } | ConvertTo-Json -Compress
  [void](Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" `
    -Headers $headers `
    -Body $body)
}

function Set-EdgeSecretsFromText {
  param([string]$Contents)

  $path = Write-PrivateTempFile "kc-privacy-runtime" "env" $Contents
  try {
    [void](Invoke-Supabase @(
      "secrets", "set",
      "--project-ref", $ProjectRef,
      "--env-file", $path
    ))
  } finally {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Force
    }
  }
}

if (-not $ConfigureOutboxEncryption -and -not $ConfigureRetentionSchedule) {
  throw "Select at least one configuration switch."
}
if ($ProjectRef -notmatch "^[a-z]{20}$") {
  throw "ProjectRef must contain exactly 20 lowercase letters."
}
if ($AppBaseUrl -notmatch "^https://") {
  throw "AppBaseUrl must use HTTPS."
}

$configuredNames = [Collections.Generic.HashSet[string]]::new(
  [StringComparer]::OrdinalIgnoreCase
)
foreach ($configuredName in @(Get-ConfiguredEdgeSecretNames)) {
  [void]$configuredNames.Add($configuredName)
}
Write-Host ("Detected {0} configured Edge secret names." -f $configuredNames.Count)

if ($ConfigureOutboxEncryption) {
  $outboxKeyName = "KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64"
  $outboxCompanionNames = @(
    "KC_ERASURE_OUTBOX_KEY_VERSION",
    "KC_ERASURE_OUTBOX_TTL_SECONDS",
    "KC_APP_BASE_URL"
  )
  $missingOutboxCompanions = @(
    $outboxCompanionNames |
      Where-Object { -not $configuredNames.Contains($_) }
  )
  if ($configuredNames.Contains($outboxKeyName) -and $missingOutboxCompanions.Count -gt 0) {
    throw "outbox_edge_configuration_is_partial"
  }
  if ($configuredNames.Contains($outboxKeyName)) {
    Write-Host "Outbox encryption already configured; key rotation skipped."
  } else {
    $outboxKey = New-RandomBase64 32
    try {
      Set-EdgeSecretsFromText (@(
        "$outboxKeyName=$outboxKey",
        "KC_ERASURE_OUTBOX_KEY_VERSION=v1",
        "KC_ERASURE_OUTBOX_TTL_SECONDS=21600",
        "KC_APP_BASE_URL=$AppBaseUrl"
      ) -join "`n")
      Write-Host "Outbox encryption initialized without exposing the key."
    } finally {
      $outboxKey = $null
    }
  }
}

if ($ConfigureRetentionSchedule) {
  $retentionName = "KC_DATA_EXPORT_RETENTION_SECRET"
  $retentionSecretExists = $configuredNames.Contains($retentionName)
  $endpoint = "https://$ProjectRef.supabase.co/functions/v1/kc-data-export-retention"

  $vaultStateSql = @"
do `$block`$
declare
  v_count integer;
begin
  select count(*)::integer
    into v_count
    from vault.decrypted_secrets secret_row
   where secret_row.name in (
     'kc_data_export_retention_function_url',
     'kc_data_export_retention_project_ref',
     'kc_data_export_retention_secret'
   );

  if v_count not in (0, 3) then
    raise exception 'retention_vault_configuration_is_partial';
  end if;

  if v_count = 3 and not $($retentionSecretExists.ToString().ToLowerInvariant()) then
    raise exception 'retention_edge_secret_missing_for_existing_vault';
  end if;

  if v_count = 0 and $($retentionSecretExists.ToString().ToLowerInvariant()) then
    raise exception 'retention_vault_missing_for_existing_edge_secret';
  end if;
end
`$block`$;
"@
  Invoke-ManagementDatabaseQuery $vaultStateSql

  if ($retentionSecretExists) {
    Write-Host "Retention secret already configured; rotation skipped."
  } else {
    $retentionSecret = New-RandomBase64 48
    try {
      Set-EdgeSecretsFromText "KC_DATA_EXPORT_RETENTION_SECRET=$retentionSecret"

      $escapedSecret = $retentionSecret.Replace("'", "''")
      $vaultSql = @"
begin;
select vault.create_secret(
  '$endpoint',
  'kc_data_export_retention_function_url',
  'Endpoint do worker de retencao LGPD'
);
select vault.create_secret(
  '$ProjectRef',
  'kc_data_export_retention_project_ref',
  'Project-ref do worker de retencao LGPD'
);
select vault.create_secret(
  '$escapedSecret',
  'kc_data_export_retention_secret',
  'Autenticacao exclusiva do cron de retencao LGPD'
);
select kc_private.kc_configure_data_export_retention_schedule();
commit;
"@
      Invoke-ManagementDatabaseQuery $vaultSql
      Write-Host "Retention Vault and schedule initialized without exposing the secret."
    } finally {
      $retentionSecret = $null
      $escapedSecret = $null
    }
  }

  Invoke-ManagementDatabaseQuery "select kc_private.kc_configure_data_export_retention_schedule();"
  Write-Host "Retention schedule reconciled."
}
