# Starts a Cloudflare "quick tunnel" for Taobao Product Studio and prints the
# public URL. No Cloudflare account, domain, or firewall/port-forwarding needed
# -- cloudflared makes an OUTBOUND connection only, so nothing has to be opened
# on this machine. The URL is random and changes every time this script runs.
#
# Double-click start-tunnel.bat (one folder up) instead of running this
# directly, unless you know you want to run it from an existing terminal.

$ErrorActionPreference = "Stop"

$toolsDir = $PSScriptRoot
$appDir = Split-Path -Parent $toolsDir
$logsDir = Join-Path $toolsDir "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$cloudflaredPath = Join-Path $toolsDir "cloudflared.exe"
$logFile = Join-Path $logsDir "TaobaoTunnel.log"

# 1) get cloudflared if we don't already have it
if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "cloudflared indiriliyor (ilk calistirmada bir kez)..."
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflaredPath
    Write-Host "Indirildi: $cloudflaredPath"
}

# 2) make sure the app is actually running before we expose it
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

# 3) read the actual password so we can print it directly (like the EtsyApp
#    tunnel does: "Open: <url>  Password: <pass>") -- the URL is hard to guess
#    but is NOT secret, so this is the real access-control boundary
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

# 4) start the tunnel in the background and watch its log for the URL.
#    NOTE: cloudflared's own `--logfile` flag does NOT reliably capture the
#    "quick Tunnel has been created" line on Windows -- use PowerShell's own
#    stdout/stderr redirection instead, which does.
$outFile = Join-Path $logsDir "TaobaoTunnel.out.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }
if (Test-Path $outFile) { Remove-Item $outFile -Force }
Write-Host "Tunel baslatiliyor (Cloudflare quick tunnel)..."
Start-Process -FilePath $cloudflaredPath `
    -ArgumentList "tunnel", "--url", "http://localhost:5173" `
    -RedirectStandardOutput $outFile `
    -RedirectStandardError $logFile `
    -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $content = ""
    foreach ($f in @($logFile, $outFile)) {
        if (Test-Path $f) { $content += (Get-Content $f -Raw -ErrorAction SilentlyContinue) }
    }
    if ($content) {
        if ($content -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
            $url = $matches[1]
            break
        }
    }
}

Write-Host ""
if ($url) {
    Set-Content -Path (Join-Path $toolsDir "tunnel-url.txt") -Value $url
    Write-Host "============================================================"
    Write-Host " Open     : $url"
    if ($hasPassword) {
        Write-Host " Password : $appPassword"
    } else {
        Write-Host " Password : (YOK -- yukaridaki uyariyi okuyun)"
    }
    Write-Host "============================================================"
    Write-Host ""
    Write-Host "Not: bu adres tunel her yeniden baslatildiginda degisir (sabit degil)."
    Write-Host "Tuneli kapatmak icin bu pencereyi kapatin (cloudflared arka planda calisiyor olsa da,"
    Write-Host "islemi durdurmak icin: Get-Process cloudflared | Stop-Process)"
} else {
    Write-Host "Adres bulunamadi. Log dosyasina bakin: $logFile"
}
