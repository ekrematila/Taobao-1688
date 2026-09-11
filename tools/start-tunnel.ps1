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
#
#    A real quick-tunnel hostname always has 3+ hyphen-separated words (e.g.
#    "raises-electric-anderson-smoke.trycloudflare.com") -- requiring that
#    stops a failed request's own error text ("...api.trycloudflare.com...")
#    from being mistaken for a real address, which is what happened here
#    ("Method Not Allowed" opened in the browser instead of the app).
$outFile = Join-Path $logsDir "TaobaoTunnel.out.log"
$urlPattern = "(https://[a-z0-9]+(?:-[a-z0-9]+){2,}\.trycloudflare\.com)"
$failurePattern = "failed to request quick Tunnel|context deadline exceeded"

function Start-OneAttempt {
    if (Test-Path $logFile) { Remove-Item $logFile -Force }
    if (Test-Path $outFile) { Remove-Item $outFile -Force }
    $proc = Start-Process -FilePath $cloudflaredPath `
        -ArgumentList "tunnel", "--url", "http://localhost:5173" `
        -RedirectStandardOutput $outFile `
        -RedirectStandardError $logFile `
        -WindowStyle Hidden -PassThru

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        $content = ""
        foreach ($f in @($logFile, $outFile)) {
            if (Test-Path $f) { $content += (Get-Content $f -Raw -ErrorAction SilentlyContinue) }
        }
        if ($content -match $urlPattern) { return @{ ok = $true; url = $matches[1] } }
        if ($content -match $failurePattern) {
            try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
            return @{ ok = $false; retry = $true }
        }
        if ($proc.HasExited) { return @{ ok = $false; retry = $true } }
    }
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    return @{ ok = $false; retry = $false }
}

$url = $null
for ($attempt = 1; $attempt -le 3; $attempt++) {
    if ($attempt -eq 1) { Write-Host "Tunel baslatiliyor (Cloudflare quick tunnel)..." }
    else { Write-Host "Tekrar deneniyor ($attempt/3)..." }
    $result = Start-OneAttempt
    if ($result.ok) { $url = $result.url; break }
    if (-not $result.retry) { break }
    # A quick failure right after another one is more likely Cloudflare's own
    # anonymous-tunnel rate limit than a one-off network blip -- hammering it
    # again immediately only makes that worse, so back off for real.
    Start-Sleep -Seconds 20
}

Write-Host ""
$urlFile = Join-Path $toolsDir "tunnel-url.txt"
if ($url) {
    Set-Content -Path $urlFile -Value $url
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
    # Never leave a stale/wrong address behind for the app's own tunnel badge to show.
    if (Test-Path $urlFile) { Remove-Item $urlFile -Force }
    Write-Host "Tunel su an kurulamadi (Cloudflare'in kendi sunucusuna ulasilamadi/zaman asimi)."
    Write-Host "Bu genelde gecicidir -- birkac dakika sonra bu scripti tekrar calistirmayi deneyin."
    Write-Host "Log dosyasina bakin: $logFile"
}
