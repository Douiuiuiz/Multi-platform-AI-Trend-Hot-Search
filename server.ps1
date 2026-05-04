# AI Trends Dashboard - Local Server
$dir = Join-Path $PSScriptRoot "static"
$port = 8080

Write-Host ""
Write-Host "  AI Trends Dashboard" -ForegroundColor Cyan
Write-Host "  --------------------" -ForegroundColor Gray
Write-Host ""

# --- Clean up from previous runs ---
try {
    $p = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p) {
        Write-Host "  Cleaning up previous session on port $port..." -ForegroundColor DarkGray
        Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
} catch { }

# --- Start server with port fallback ---
$ports = @(8080, 8081, 8082, 8083, 3000, 5000, 9000)
$listener = $null

foreach ($tryPort in $ports) {
    $listener = New-Object System.Net.HttpListener
    try {
        $listener.Prefixes.Add("http://localhost:$tryPort/")
        $listener.Start()
        $port = $tryPort
        break
    } catch {
        $listener.Close()
        $listener = $null
    }
}

if (-not $listener) {
    Write-Host "  ERROR: All ports are in use" -ForegroundColor Red
    Write-Host "  Please restart your computer or close other servers" -ForegroundColor Gray
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "  =======================================" -ForegroundColor Green
Write-Host "   Server: http://localhost:$port" -ForegroundColor Green
Write-Host "   Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host "  =======================================" -ForegroundColor Green
Write-Host ""

Start-Process "http://localhost:$port"

# --- MIME map ---
$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".svg"  = "image/svg+xml"
}

# --- Serve loop ---
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ($path -eq "") { $path = "index.html" }
    $file = Join-Path $dir $path
    $res = $ctx.Response

    if (Test-Path $file -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($path).ToLower()
        $ct = $mime[$ext]
        if (-not $ct) { $ct = "application/octet-stream" }
        $bytes = [IO.File]::ReadAllBytes((Resolve-Path $file))
        $res.ContentType = $ct
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
    }
    $res.Close()
}
