# KisaanMitra MVP - dev launcher (double-click start.bat, or run ./start.ps1).
# WHY this exists: :8080 is occupied on this box by EnterpriseDB httpd (non-node),
# so the backend auto-picks 8081 when 8080 is busy and the Vite proxy follows it
# via VITE_API_TARGET. No secrets are embedded here - mock mode needs no keys.
param(
  [Parameter(Position = 0)]
  [int]$Port = 0  # 0 = auto: use 8080 if free, else 8081. Explicit value (or $env:PORT) always wins.
)

$ErrorActionPreference = "Stop"

function Test-PortInUse {
  param([int]$CheckPort)
  # WHY two probes: Get-NetTCPConnection is the fast path on Win8+; TcpClient
  # connect is the fallback so a missing cmdlet can never silently pick a busy port.
  try {
    $conn = Get-NetTCPConnection -LocalPort $CheckPort -State Listen -ErrorAction Stop
    return ($null -ne $conn)
  } catch {
    try {
      $client = New-Object Net.Sockets.TcpClient
      try {
        $iar = $client.BeginConnect("127.0.0.1", $CheckPort, $null, $null)
        return $iar.AsyncWaitHandle.WaitOne(400)
      } finally { $client.Close() }
    } catch { return $false }
  }
}

function Fail {
  param([string]$Message)
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

# --- 0. Paths (script lives at repo root next to backend/ and frontend/) ---
$Root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path $MyInvocation.MyCommand.Path -Parent }
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
if (-not (Test-Path (Join-Path $BackendDir "package.json"))) { Fail "backend/package.json not found under $BackendDir" }
if (-not (Test-Path (Join-Path $FrontendDir "package.json"))) { Fail "frontend/package.json not found under $FrontendDir" }

# --- 1. Node check ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js not found on PATH. Install Node 20+ from https://nodejs.org/ then re-run."
}
Write-Host "node $(node --version) | npm $(npm --version)"

# --- 2. Resolve backend port ---
$BackendPort = $Port
if ($BackendPort -eq 0 -and $env:PORT) { $BackendPort = [int]$env:PORT }
if ($BackendPort -eq 0) {
  if (Test-PortInUse -CheckPort 8080) {
    $BackendPort = 8081
    Write-Host ":8080 is busy (known: EnterpriseDB httpd) -> using PORT=8081" -ForegroundColor Yellow
  } else {
    $BackendPort = 8080
    Write-Host ":8080 is free -> using PORT=8080" -ForegroundColor Green
  }
} else {
  Write-Host "Using requested PORT=$BackendPort"
}
if (Test-PortInUse -CheckPort $BackendPort) {
  Fail "PORT $BackendPort is already in use. Stop it first (stop.bat) or pass another port: start.bat 8082"
}

# --- 3. Install deps if node_modules is missing ---
foreach ($dir in @($BackendDir, $FrontendDir)) {
  if (-not (Test-Path (Join-Path $dir "node_modules"))) {
    Write-Host "Installing dependencies in $dir ..."
    Push-Location $dir
    try { npm install } finally { Pop-Location }
  } else {
    Write-Host "deps OK: $dir"
  }
}

# Real-first: backend/.env owns MOCK_MODE (MOCK_MODE=false + key = live). Server.js already
# mocks when no key (!GEMINI_KEY), so never force true here — only pass through explicit operator override.
# Fresh clone with empty keys still mocks offline via !GEMINI_KEY.

# --- 4. Launch backend + frontend in separate windows ---
$ApiTarget = "http://localhost:$BackendPort"
$MockPrefix = ""
if ($env:MOCK_MODE) { $MockPrefix = "`$env:MOCK_MODE='$($env:MOCK_MODE)'; " }
$BackendCmd = "`$env:PORT='$BackendPort'; " + $MockPrefix + "npm run dev"
$FrontendCmd = "`$env:VITE_API_TARGET='$ApiTarget'; `$env:BACKEND_PORT='$BackendPort'; npm run dev"
Start-Process powershell -WorkingDirectory $BackendDir -ArgumentList @("-NoExit", "-Command", $BackendCmd)
Start-Process powershell -WorkingDirectory $FrontendDir -ArgumentList @("-NoExit", "-Command", $FrontendCmd)

$FrontendUrl = "http://localhost:5173"
$HealthUrl = "$ApiTarget/api/health"
Write-Host ""
Write-Host "KisaanMitra starting..." -ForegroundColor Cyan
Write-Host "  Backend : $ApiTarget  (health: $HealthUrl)"
Write-Host "  Frontend: $FrontendUrl (proxy /api -> $ApiTarget)"

# --- 5. Open browser + health check (best-effort, never blocks launch) ---
Start-Sleep -Seconds 4
Start-Process $FrontendUrl
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
  try {
    $h = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 3
    if ($h.ok) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if ($healthy) {
  Write-Host "Backend healthy: $(($h | ConvertTo-Json -Compress))" -ForegroundColor Green
} else {
  Write-Host "Backend not answering $HealthUrl yet - check the backend window (npm run dev output)." -ForegroundColor Yellow
}
Write-Host "Done. Run stop.bat to shut both servers down."
