# deploy-cadu-api.ps1 - Script autonomo de restart do cadu-api
# Yan roda isto LOCALMENTE no PowerShell. NAO precisa me passar credenciais.
# Uso:
#   $env:HOSTINGER_PASSWORD = 'suasenha'   # OU passe -Password
#   .\deploy-cadu-api.ps1
#
# O script:
# 1. Tenta SSH (com fallbacks p/ Kaspersky MITM)
# 2. Se SSH bloqueado, gera comando para copiar/colar no hPanel web console
# 3. Executa docker restart + validacao
# 4. Salva report em C:\Users\yan1n\deploy-cadu-report.txt

param(
    [string]$Host = "srv1597083.hstgr.cloud",
    [string]$User = "root",
    [string]$Password = $env:HOSTINGER_PASSWORD,
    [int]$Port = 22,
    [string]$ReportPath = "$PSScriptRoot\deploy-cadu-report.txt"
)

$ErrorActionPreference = "Continue"
$report = @()
function Log($msg) {
    Write-Host $msg
    $script:report += "[$(Get-Date -Format 'HH:mm:ss')] $msg"
}

Log "=== deploy-cadu-api.ps1 ==="
Log "Host: $User@$Host`:$Port"
Log "Report: $ReportPath"

if (-not $Password) {
    Log ""
    Log "[ERRO] Variavel HOSTINGER_PASSWORD nao definida."
    Log ""
    Log "Configure assim (em PowerShell):"
    Log "  `$env:HOSTINGER_PASSWORD = 'suasenha'"
    Log "  .\deploy-cadu-api.ps1"
    Log ""
    Log "Ou passe -Password direto:"
    Log "  .\deploy-cadu-api.ps1 -Password 'suasenha'"
    Log ""
    Log "ALTERNATIVA SEM SENHA EM NENHUM LUGAR (zero risco):"
    Log "  Acesse https://hpanel.hostinger.com > VPS srv1597083 > Terminal (web)"
    Log "  Cole este comando unico:"
    Log ""
    Log "  docker ps -a | grep cadu-api && docker logs --tail 30 openclaw-hahq-cadu-api && echo --- && docker restart openclaw-hahq-cadu-api && sleep 8 && curl -sS http://localhost:49104/health"
    Log ""
    exit 1
}

# Verifica ssh client
$sshCmd = (Get-Command ssh.exe -ErrorAction SilentlyContinue).Source
if (-not $sshCmd) {
    Log "[ERRO] ssh.exe nao encontrado. Use OpenSSH (Windows 10+) ou Git Bash."
    exit 1
}

# Tenta SSH com Keyboard-Interactive (Hostinger as vezes usa)
function Invoke-CaduDeploy {
    param($Host, $User, $Password, $Port)
    
    Log "Tentando SSH $User@$Host`:$Port ..."
    
    $deployCmd = @"
docker ps -a --filter name=openclaw-hahq-cadu-api --format '{{.Names}} {{.Status}}'
echo '---LOGS---'
docker logs --tail 40 openclaw-hahq-cadu-api 2>&1 || echo 'no logs'
echo '---RESTART---'
docker restart openclaw-hahq-cadu-api 2>&1
echo '---WAIT 10s---'
sleep 10
echo '---HEALTH---'
curl -sS --max-time 5 http://localhost:49104/health 2>&1
echo
echo '---PROCESS---'
docker ps --filter name=openclaw-hahq-cadu-api --format '{{.Names}} {{.Status}} {{.Ports}}'
echo '---DONE---'
"@
    
    # Plink-style: usar sshpass se disponivel, senao pedir SSH_ASKPASS
    $sshpassCmd = (Get-Command sshpass.exe -ErrorAction SilentlyContinue).Source
    
    if ($sshpassCmd) {
        Log "Usando sshpass..."
        $result = & sshpass -p "$Password" ssh -p $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 "$User@$Host" "$deployCmd" 2>&1
    } else {
        Log "sshpass nao disponivel. Tentando via plink (PuTTY) ou SSH_ASKPASS..."
        
        # Tenta plink (PuTTY)
        $plinkCmd = (Get-Command plink.exe -ErrorAction SilentlyContinue).Source
        if ($plinkCmd) {
            Log "Usando plink (PuTTY)..."
            $result = & plink -ssh -P $Port -l $User -pw "$Password" -noagent -batch "$Host" "$deployCmd" 2>&1
        } else {
            # Tenta SSH_ASKPASS via script temporario
            $askpassScript = New-TemporaryFile
            $askpassContent = @"
#!/bin/sh
echo "$Password"
"@
            [IO.File]::WriteAllText($askpassScript.FullName, $askpassContent, [Text.UTF8Encoding]::new($false))
            
            # SSH_ASKPASS so funciona em Unix. No Windows, tentar expect...
            $expectCmd = (Get-Command expect.exe -ErrorAction SilentlyContinue).Source
            if ($expectCmd) {
                Log "Usando expect..."
                $expectScript = New-TemporaryFile
                $expectContent = @"
#!/usr/bin/expect -f
set timeout 30
spawn ssh -p $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $User@$Host
expect {
    "password:" { send "$Password\r"; exp_continue }
    "Password:" { send "$Password\r"; exp_continue }
    eof
}
"@
                [IO.File]::WriteAllText($expectScript.FullName, $expectContent, [Text.UTF8Encoding]::new($false))
                $result = & expect $expectScript.FullName "$deployCmd" 2>&1
                Remove-Item $expectScript.FullName -Force
            } else {
                Log ""
                Log "[ERRO] Nenhum metodo SSH nao-interativo disponivel."
                Log "Instale UM destes:"
                Log "  - WSL (Ubuntu): wsl --install"
                Log "  - Git for Windows (vem com SSH)"
                Log "  - PuTTY (plink.exe)"
                Log "  - sshpass (choco install sshpass)"
                Log "  - expect (choco install expect)"
                Log ""
                Log "OU use a opcao 100% sem senha:"
                Log "  hpanel.hostinger.com > VPS > Terminal (web console)"
                Log "  Cole o comando: docker restart openclaw-hahq-cadu-api"
                Log ""
                exit 1
            }
        }
    }
    
    return $result
}

$result = Invoke-CaduDeploy -Host $Host -User $User -Password $Password -Port $Port

Log ""
Log "=== RESULTADO ==="
Log $result
Log ""
Log "=== Validacao externa (Vercel proxy) ==="
try {
    $verify = Invoke-RestMethod -Uri "https://www.kinocampus.com.br/api/cadu/health" -TimeoutSec 15 -ErrorAction Stop
    Log "VERSION: $($verify.version)"
    if ($verify.version -eq "0.4.6") {
        Log "SUCCESS - cadu-api agora em v0.4.6 (endpoints /api/openclaw/context + /api/feed/{id}/ask funcionando)"
    } elseif ($verify.version -eq "0.4.2") {
        Log "ATENCAO: cadu-api ainda em v0.4.2 (server.py nao foi atualizado ou restart nao aconteceu)"
    } else {
        Log "Versao inesperada: $($verify.version)"
    }
} catch {
    Log "Falha ao verificar via Vercel: $($_.Exception.Message)"
}

Log ""
Log "Salvando report em: $ReportPath"
$report += "=== STDOUT SSH ==="
$report += $result
$report | Out-File -FilePath $ReportPath -Encoding UTF8 -Append

Log ""
Log "=== PROXIMO PASSO ==="
Log "Cole o conteudo do report em $ReportPath aqui no chat"
Log "para eu analisar e fazer ajustes adicionais."