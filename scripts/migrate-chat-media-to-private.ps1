[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [string]$ProjectRef = "wacyrkwhkvzwkqpolrbg",
  [string]$SourceBucket = "kino-media",
  [string]$DestinationBucket = "kino-chat-media",
  [string]$Prefix = "chat-media",
  [switch]$Apply,
  [switch]$RemoveLegacyAfterVerification
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$SupabaseCliPackage = "supabase@2.105.0"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-SafeIdentifier {
  param(
    [string]$Value,
    [string]$Label
  )

  if ($Value -notmatch "^[a-z0-9][a-z0-9_-]{0,62}$") {
    throw "$Label invalido."
  }
}

function Assert-SafePrefix {
  param([string]$Value)

  if ($Value -notmatch "^[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*$") {
    throw "Prefixo de Storage invalido."
  }
}

function Require-Command {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Comando '$Name' nao encontrado."
  }
}

function Get-SupabaseAccessToken {
  if ($env:SUPABASE_ACCESS_TOKEN) {
    return $env:SUPABASE_ACCESS_TOKEN.Trim()
  }

  if ($env:OS -eq "Windows_NT") {
    $source = @"
using System;
using System.Runtime.InteropServices;
public class KinoChatMediaCredentialReader {
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
    if (-not ("KinoChatMediaCredentialReader" -as [type])) {
      Add-Type -TypeDefinition $source | Out-Null
    }
    $token = [KinoChatMediaCredentialReader]::ReadToken()
    if ($token) {
      return $token.Trim()
    }
  }

  throw "Token Supabase nao encontrado. Rode 'npx supabase login' ou defina SUPABASE_ACCESS_TOKEN."
}

function Invoke-ReadOnlyQuery {
  param([string]$Query)

  $headers = @{
    Authorization = "Bearer $(Get-SupabaseAccessToken)"
    "Content-Type" = "application/json"
  }
  $body = @{
    query = $Query
  } | ConvertTo-Json -Compress

  $response = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query/read-only" `
    -Headers $headers `
    -Body $body

  if ($response -is [System.Array]) {
    return @($response)
  }
  foreach ($propertyName in @("result", "data", "rows")) {
    if ($response.PSObject.Properties.Name -contains $propertyName) {
      return @($response.$propertyName)
    }
  }
  return @($response)
}

function Get-BucketInventory {
  param([string]$BucketName)

  $query = @"
select
  b.id as bucket_id,
  b.public as bucket_public,
  o.name,
  nullif(o.metadata ->> 'size', '')::bigint as size_bytes,
  nullif(o.metadata ->> 'mimetype', '') as mime_type,
  nullif(o.metadata ->> 'cacheControl', '') as cache_control
from storage.buckets b
left join storage.objects o
  on o.bucket_id = b.id
 and (o.name = '$Prefix' or o.name like '$Prefix/%')
where b.id = '$BucketName'
order by o.name;
"@

  return @(Invoke-ReadOnlyQuery -Query $query)
}

function Invoke-StorageCopy {
  param(
    [string]$Source,
    [string]$Destination,
    [string]$MimeType = "",
    [string]$CacheControl = ""
  )

  $arguments = @(
    "--yes", $SupabaseCliPackage, "storage", "cp",
    "--experimental", "--linked",
    "--jobs", "1"
  )
  if ($MimeType) {
    $arguments += @("--content-type", $MimeType)
  }
  if ($CacheControl) {
    $arguments += @("--cache-control", $CacheControl)
  }
  $arguments += @($Source, $Destination)

  & npx @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao copiar objeto de Storage."
  }
}

function Invoke-StorageRemove {
  param([string]$StoragePath)

  & npx --yes $SupabaseCliPackage storage rm --experimental --linked $StoragePath
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao remover objeto legado de Storage."
  }
}

Assert-SafeIdentifier -Value $ProjectRef -Label "ProjectRef"
Assert-SafeIdentifier -Value $SourceBucket -Label "SourceBucket"
Assert-SafeIdentifier -Value $DestinationBucket -Label "DestinationBucket"
Assert-SafePrefix -Value $Prefix
Require-Command -Name "npx"

if ($RemoveLegacyAfterVerification -and -not $Apply) {
  throw "-RemoveLegacyAfterVerification exige -Apply."
}

Write-Step "Validando projeto vinculado e inventario sem expor caminhos"
$repositoryRoot = [System.IO.Path]::GetFullPath(
  [System.IO.Path]::Combine($PSScriptRoot, "..")
)
$linkedProjectFile = Join-Path $repositoryRoot "supabase/.temp/project-ref"
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
    "($ProjectRef). Nenhum objeto foi acessado."
  )
}

$sourceInventory = Get-BucketInventory -BucketName $SourceBucket
$destinationInventory = Get-BucketInventory -BucketName $DestinationBucket

if ($sourceInventory.Count -eq 0) {
  throw "Bucket de origem nao encontrado."
}
if ($destinationInventory.Count -eq 0) {
  throw "Bucket de destino nao encontrado. Aplique primeiro a migration de privacidade."
}
if (@($destinationInventory | Where-Object { $_.bucket_public -eq $true }).Count -gt 0) {
  throw "O bucket de destino precisa ser privado."
}

$sourceObjects = @($sourceInventory | Where-Object { $_.name })
$destinationObjects = @($destinationInventory | Where-Object { $_.name })
$sourceBytes = ($sourceObjects | Measure-Object -Property size_bytes -Sum).Sum
if ($null -eq $sourceBytes) {
  $sourceBytes = 0
}

Write-Host ("Objetos legados encontrados: {0}" -f $sourceObjects.Count)
Write-Host ("Bytes declarados: {0}" -f $sourceBytes)
Write-Host ("Objetos ja presentes no destino: {0}" -f $destinationObjects.Count)

if (-not $Apply) {
  Write-Step "Dry-run concluido"
  Write-Host "Nenhum objeto foi copiado ou removido. Use -Apply para executar a copia verificada."
  exit 0
}

if ($sourceObjects.Count -eq 0) {
  Write-Step "Nenhum objeto legado precisa ser migrado"
  exit 0
}

$tempRoot = [System.IO.Path]::GetFullPath(
  [System.IO.Path]::Combine(
    [System.IO.Path]::GetTempPath(),
    "kino-chat-media-cutover-$([guid]::NewGuid().ToString('N'))"
  )
)
$systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if (-not $tempRoot.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Diretorio temporario fora da raiz esperada."
}

New-Item -ItemType Directory -LiteralPath $tempRoot | Out-Null
$verifiedNames = [System.Collections.Generic.List[string]]::new()

try {
  Write-Step "Copiando e verificando objetos"
  $destinationNames = @{}
  foreach ($destinationObject in $destinationObjects) {
    $destinationNames[[string]$destinationObject.name] = $true
  }

  for ($index = 0; $index -lt $sourceObjects.Count; $index++) {
    $object = $sourceObjects[$index]
    $sourceFile = Join-Path $tempRoot ("source-{0:D4}.bin" -f $index)
    $destinationFile = Join-Path $tempRoot ("destination-{0:D4}.bin" -f $index)
    $sourceUri = "ss:///$SourceBucket/$($object.name)"
    $destinationUri = "ss:///$DestinationBucket/$($object.name)"

    Invoke-StorageCopy -Source $sourceUri -Destination $sourceFile
    if ($null -ne $object.size_bytes -and (Get-Item -LiteralPath $sourceFile).Length -ne [long]$object.size_bytes) {
      throw "Tamanho baixado difere do inventario remoto."
    }

    if ($destinationNames.ContainsKey([string]$object.name)) {
      Invoke-StorageCopy -Source $destinationUri -Destination $destinationFile
      $existingHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destinationFile).Hash
      $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile).Hash
      if ($existingHash -ne $sourceHash) {
        throw "Objeto existente no destino diverge da origem; nenhuma sobrescrita foi feita."
      }
    } else {
      Invoke-StorageCopy `
        -Source $sourceFile `
        -Destination $destinationUri `
        -MimeType ([string]$object.mime_type) `
        -CacheControl ([string]$object.cache_control)
      Invoke-StorageCopy -Source $destinationUri -Destination $destinationFile
      $uploadedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destinationFile).Hash
      $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile).Hash
      if ($uploadedHash -ne $sourceHash) {
        throw "Verificacao SHA-256 do destino falhou."
      }
    }

    $verifiedNames.Add([string]$object.name)
    Remove-Item -LiteralPath $sourceFile, $destinationFile -Force -ErrorAction SilentlyContinue
    Write-Progress `
      -Activity "Migracao privada de anexos de conversa" `
      -Status "$($index + 1) de $($sourceObjects.Count) verificados" `
      -PercentComplete ((($index + 1) / $sourceObjects.Count) * 100)
  }
  Write-Progress -Activity "Migracao privada de anexos de conversa" -Completed

  if ($verifiedNames.Count -ne $sourceObjects.Count) {
    throw "Nem todos os objetos foram verificados."
  }

  $verifiedDestination = Get-BucketInventory -BucketName $DestinationBucket
  $verifiedDestinationNames = @{}
  foreach ($destinationObject in @($verifiedDestination | Where-Object { $_.name })) {
    $verifiedDestinationNames[[string]$destinationObject.name] = $true
  }
  $missingDestination = @(
    $verifiedNames | Where-Object { -not $verifiedDestinationNames.ContainsKey($_) }
  )
  if ($missingDestination.Count -gt 0) {
    throw "O inventario final do destino esta incompleto."
  }

  Write-Step "Copia privada verificada"
  Write-Host ("Objetos verificados por SHA-256: {0}" -f $verifiedNames.Count)

  if ($RemoveLegacyAfterVerification) {
    $targetDescription = "$($verifiedNames.Count) objetos em $SourceBucket/$Prefix"
    if ($PSCmdlet.ShouldProcess($targetDescription, "Remover copias legadas publicas")) {
      Write-Step "Removendo copias legadas somente apos verificacao integral"
      foreach ($name in $verifiedNames) {
        Invoke-StorageRemove -StoragePath "ss:///$SourceBucket/$name"
      }

      $remainingSource = @(
        (Get-BucketInventory -BucketName $SourceBucket) |
          Where-Object { $_.name }
      )
      if ($remainingSource.Count -ne 0) {
        throw "Ainda existem objetos legados na origem."
      }
      Write-Host "Copias legadas removidas e ausencia confirmada."
    }
  } else {
    Write-Host "As copias legadas permanecem na origem. Remova-as apenas depois do deploy e do smoke test."
  }
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    if (
      $resolvedTempRoot.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
      $resolvedTempRoot -ne $systemTemp
    ) {
      Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
    }
  }
}
