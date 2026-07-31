#Requires -Version 5.1
<#
.SYNOPSIS
  Aplica Site Key + Secret Key do Cloudflare Turnstile no Vercel e no Supabase.

.DESCRIPTION
  Use DEPOIS de criar o widget em https://dash.cloudflare.com/?to=/:account/turnstile
  Você só precisa colar as duas chaves quando o script pedir.

  O que o script faz (sem você abrir painéis técnicos):
  1) Grava KC_TURNSTILE_SITE_KEY no Vercel (production + preview)
  2) Grava secrets no Supabase Edge (secret, environment, hostnames)
  3) Dispara redeploy de produção no Vercel

.EXAMPLE
  cd C:\Users\yan1n\Documents\GitHub\kino-campus
  powershell -ExecutionPolicy Bypass -File .\scripts\ops\apply-turnstile-keys.ps1
#>

$ErrorActionPreference = 'Stop'
$ProjectRef = 'wacyrkwhkvzwkqpolrbg'
$Hostnames = 'www.kinocampus.com.br,kinocampus.com.br'

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host ""
Write-Host "=== KinoCampus: aplicar Turnstile (2 chaves) ===" -ForegroundColor Cyan
Write-Host "1) Abra: https://dash.cloudflare.com/?to=/:account/turnstile"
Write-Host "2) Add Widget → domínios: kinocampus.com.br e www.kinocampus.com.br"
Write-Host "3) Copie Site Key e Secret Key"
Write-Host ""

$siteKey = Read-Host "Cole a SITE KEY (começa com 0x4AAAA...)"
$secretKey = Read-Secret "Cole a SECRET KEY (fica oculta)"

$siteKey = ($siteKey -replace '\s', '').Trim()
$secretKey = ($secretKey -replace '\s', '').Trim()

if ($siteKey -notmatch '^0x[A-Za-z0-9_-]{10,}$') {
  throw "Site Key parece inválida. Deve começar com 0x (chave real Cloudflare, não de teste)."
}
if ($siteKey -match '1x0000000000000000000000000000000AA|2x0000000000000000000000000000000AA') {
  throw "Chave de TESTE Cloudflare é proibida em produção."
}
if ($secretKey.Length -lt 20) {
  throw "Secret Key parece curta demais."
}

# --- Supabase PAT from Windows Credential Manager if needed ---
if (-not $env:SUPABASE_ACCESS_TOKEN) {
  $code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Cred {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes;
    public IntPtr TargetAlias; public IntPtr UserName;
  }
  public static string Read(string target) {
    IntPtr p; if (!CredRead(target, 1, 0, out p)) return null;
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      byte[] b = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, b, 0, c.CredentialBlobSize);
      return Encoding.UTF8.GetString(b).TrimEnd('\0');
    } finally { CredFree(p); }
  }
}
'@
  Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
  $env:SUPABASE_ACCESS_TOKEN = [Cred]::Read('Supabase CLI:supabase')
}
if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw "SUPABASE_ACCESS_TOKEN não encontrado. Abra o Supabase CLI logado ou defina a variável."
}

Write-Host "`n[1/3] Secrets no Supabase Edge..." -ForegroundColor Yellow
# Management API secrets bulk
$headers = @{
  Authorization = "Bearer $($env:SUPABASE_ACCESS_TOKEN)"
  'Content-Type' = 'application/json'
}
$secretBody = @(
  @{ name = 'KC_TURNSTILE_SECRET_KEY'; value = $secretKey },
  @{ name = 'KC_TURNSTILE_ENVIRONMENT'; value = 'production' },
  @{ name = 'KC_TURNSTILE_EXPECTED_HOSTNAMES'; value = $Hostnames }
) | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method POST -Uri "https://api.supabase.com/v1/projects/$ProjectRef/secrets" -Headers $headers -Body $secretBody | Out-Null
Write-Host "  OK secrets Edge" -ForegroundColor Green

Write-Host "[2/3] Site key no Vercel (production + preview)..." -ForegroundColor Yellow
# vercel env add is interactive; use API via vercel CLI pull/add with stdin when possible
$siteKey | npx vercel env add KC_TURNSTILE_SITE_KEY production --force 2>&1 | Out-Host
$siteKey | npx vercel env add KC_TURNSTILE_SITE_KEY preview --force 2>&1 | Out-Host
Write-Host "  OK env Vercel (confira se o CLI pediu confirmação)" -ForegroundColor Green

Write-Host "[3/3] Redeploy produção..." -ForegroundColor Yellow
npx vercel --prod --yes 2>&1 | Select-Object -Last 20

Write-Host "`nPronto. Teste:" -ForegroundColor Cyan
Write-Host "  1) https://www.kinocampus.com.br/ajuda.html?request=account_erasure (sem login) → widget CAPTCHA"
Write-Host "  2) Logado: https://www.kinocampus.com.br/settings.html#settingsPrivacyData"
Write-Host ""
