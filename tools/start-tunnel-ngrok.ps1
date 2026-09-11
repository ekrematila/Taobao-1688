# Starts an ngrok tunnel for Taobao Product Studio. Used here specifically
# because Cloudflare's anonymous quick-tunnel endpoint (api.trycloudflare.com)
# is currently blocked/unreachable from this network, and ngrok has NO forced
# time limit (unlike the Pinggy fallback, which expires after 60 minutes).
#
# One-time setup this script does NOT do for you: an ngrok account + authtoken.
# Sign up free at https://dashboard.ngrok.com/signup, copy your authtoken from
# https://dashboard.ngrok.com/get-started/your-authtoken, then either run
#   tools\ngrok.exe config add-authtoken <token> --config tools\ngrok.yml
# or paste it into tools\ngrok.yml yourself (see the template this script
# writes below). This tunnel is used ONLY for Taobao Product Studio — the free
# ngrok plan only allows one "anonymous" endpoint to be online per account, so
# Etsy Command Center stays on its own Pinggy/Cloudflare tunnel.
#
# Double-click start-tunnel-ngrok.bat (one folder up) instead of running this
# directly, unless you know you want to run it from an existing terminal.

$ErrorActionPreference = "Stop"

$toolsDir = $PSScriptRoot
$appDir = Split-Path -Parent $toolsDir
$logsDir = Join-Path $toolsDir "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$ngrokPath = Join-Path $toolsDir "ngrok.exe"
$ngrokConfig = Join-Path $toolsDir "ngrok.yml"
$logFile = Join-Path $logsDir "NgrokTunnel.log"

# 1) get ngrok if we don't already have it
if (-not (Test-Path $ngrokPath)) {
    Write-Host "ngrok indiriliyor (ilk calistirmada bir kez)..."
    $zipPath = Join-Path $toolsDir "ngrok.zip"
    Invoke-WebRequest -Uri "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip" -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force
    Remove-Item $zipPath -Force
    Write-Host "Indirildi: $ngrokPath"
}

# 2) make sure an authtoken is configured (own local config file, not the
#    global one, so this doesn't collide with a different account/project)
if (-not (Test-Path $ngrokConfig)) {
    Set-Content -Path $ngrokConfig -Value @"
version: "3"
agent:
    authtoken: ""
endpoints:
  - name: taobao
    upstream:
      url: 5173
"@
}
$configContent = Get-Content $ngrokConfig -Raw
if ($configContent -match 'authtoken:\s*""' -or $configContent -notmatch 'authtoken:\s*\S+') {
    Write-Host ""
    Write-Host "UYARI: ngrok icin authtoken tanimli degil."
    Write-Host "1) https://dashboard.ngrok.com/signup adresinden ucretsiz hesap acin"
    Write-Host "2) https://dashboard.ngrok.com/get-started/your-authtoken adresinden token'i kopyalayin"
    Write-Host "3) tools\ngrok.yml dosyasindaki authtoken: `"`"`" kismina yapistirin"
    Write-Host "Sonra bu scripti tekrar calistirin."
    exit 1
}

# 3) make sure the app is actually running before we expose it
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

# 4) read the actual password so we can print it directly
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

# 5) any earlier ngrok.exe (this tool or another project's) has to go first --
#    the free plan only allows one "anonymous" endpoint online per account,
#    and a leftover process from a previous run holds that slot.
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 6) start the tunnel and read the URL from ngrok's own local API (127.0.0.1:4040)
#    -- far more reliable than scraping log text.
$errFile = Join-Path $logsDir "NgrokTunnel.err.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }
if (Test-Path $errFile) { Remove-Item $errFile -Force }
Write-Host "Tunel baslatiliyor (ngrok)..."
Start-Process -FilePath $ngrokPath `
    -ArgumentList "http", "5173", "--config", "`"$ngrokConfig`"" `
    -RedirectStandardOutput $logFile -RedirectStandardError $errFile -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
        if ($resp.tunnels -and $resp.tunnels.Count -gt 0) { $url = $resp.tunnels[0].public_url; break }
    } catch {}
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
    Write-Host "Not: bu adres suresiz calisir (60 dakikada bir yenilenmesi gerekmez) ve"
    Write-Host "genellikle her baslatildiginda AYNI kalir. Sadece Taobao Product Studio"
    Write-Host "icin kullanin -- Etsy Command Center kendi ayri tunelinde kalmali."
    Write-Host "Tuneli kapatmak icin: Get-Process ngrok | Stop-Process"
} else {
    Write-Host "Adres bulunamadi. Log dosyasina bakin: $logFile"
}
