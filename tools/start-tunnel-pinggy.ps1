# Fallback tunnel for when Cloudflare's anonymous "quick tunnel" endpoint
# (api.trycloudflare.com) is unreachable -- use start-tunnel.ps1 first; only
# use this one if that keeps failing with "Tunel su an kurulamadi".
#
# Uses Pinggy (https://pinggy.io), a free SSH-based tunnel that needs no
# account and no install (Windows 10/11 ship an SSH client already). The free
# tier prints its own warning: the link EXPIRES AFTER 60 MINUTES and has to be
# restarted -- Cloudflare's tunnel has no such limit, which is why it's still
# the first choice when it's working.
#
# Double-click start-tunnel-pinggy.bat (one folder up) instead of running this
# directly, unless you know you want to run it from an existing terminal.

$ErrorActionPreference = "Stop"

$toolsDir = $PSScriptRoot
$appDir = Split-Path -Parent $toolsDir
$logsDir = Join-Path $toolsDir "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$logFile = Join-Path $logsDir "PinggyTunnel.log"

# 1) make sure the app is actually running before we expose it
$devUp = $false
try {
    Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:5173" -TimeoutSec 2 | Out-Null
    $devUp = $true
} catch {}
if (-not $devUp) {
    Write-Host ""
    Write-Host "UYARI: http://localhost:5173 su an calismiyor gibi gorunuyor."
    Write-Host "Once 'Uygulamayi Baslat.bat' dosyasini calistirip uygulamanin actigindan emin olun,"
    Write-Host "sonra bu penceredeki islemi tekrar deneyin."
    Write-Host ""
}

# 2) read the actual password so we can print it directly
$envPath = Join-Path $appDir ".env"
$appPassword = ""
if (Test-Path $envPath) {
    $line = Select-String -Path $envPath -Pattern '^APP_PASSWORD=(.+)' -ErrorAction SilentlyContinue
    if ($line) { $appPassword = $line.Matches[0].Groups[1].Value.Trim() }
}
$hasPassword = [bool]$appPassword
if (-not $hasPassword) {
    Write-Host ""
    Write-Host "UYARI: .env icinde APP_PASSWORD bos. Bu adres internete acik olacak ve sifresiz olur."
    Write-Host "Onerilir: .env icine APP_PASSWORD=<kendi-sifren> yazip sunucuyu yeniden baslatin."
    Write-Host ""
}

# 3) start the SSH tunnel in the background and watch its output for the URL.
#    -R0:... asks Pinggy to pick a random free remote port; it prints two
#    equivalent public URLs, either works. -o StrictHostKeyChecking=no skips
#    the interactive "are you sure you want to continue connecting" prompt,
#    which would otherwise hang forever with no terminal attached.
if (Test-Path $logFile) { Remove-Item $logFile -Force }
Write-Host "Tunel baslatiliyor (Pinggy, 60 dakikada bir yenilenmesi gerekir)..."
$sshArgs = @(
    "-p", "443",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=NUL",
    "-o", "ServerAliveInterval=30",
    "-R0:localhost:5173",
    "a.pinggy.io"
)
Start-Process -FilePath "ssh" -ArgumentList $sshArgs -RedirectStandardOutput $logFile -RedirectStandardError $logFile -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match "(https://[a-z0-9-]+\.(?:free\.pinggy\.net|run\.pinggy-free\.link))") {
            $url = $matches[1]
            break
        }
    }
}

Write-Host ""
$urlFile = Join-Path $toolsDir "tunnel-url.txt"
if ($url) {
    Set-Content -Path $urlFile -Value $url -NoNewline
    Write-Host "============================================================"
    Write-Host " Open     : $url"
    if ($hasPassword) {
        Write-Host " Password : $appPassword"
    } else {
        Write-Host " Password : (YOK -- yukaridaki uyariyi okuyun)"
    }
    Write-Host "============================================================"
    Write-Host ""
    Write-Host "ONEMLI: bu tunel 60 dakika sonra kendiliginden kapanir -- suresi dolunca"
    Write-Host "bu scripti tekrar calistirin (Cloudflare'in tuneli calisir hale gelmisse"
    Write-Host "start-tunnel.ps1/.bat onun yerine tercih edilebilir, suresi hic dolmaz)."
    Write-Host "Tuneli erken kapatmak icin: Get-Process ssh | Stop-Process"
} else {
    Write-Host "Adres bulunamadi. Log dosyasina bakin: $logFile"
}
