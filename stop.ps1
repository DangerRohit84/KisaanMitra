# KisaanMitra MVP - stop dev servers (double-click stop.bat, or run ./stop.ps1).
# WHY only node is killed: :8080 is owned by EnterpriseDB httpd on this box, so we
# match LISTENING sockets per port and stop ONLY node processes, never anything else.
$ErrorActionPreference = "Continue"
$Ports = @(8080, 8081, 5173)
$stopped = 0

function Get-ListenerPids {
  param([int]$ListenPort)
  # Fast path (Win8+). Fallback parses netstat so a missing cmdlet fails open, not silent.
  try {
    $conns = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction Stop
    return ($conns | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    $pids = @()
    foreach ($line in (netstat -ano -p TCP)) {
      if ($line -match "LISTENING\s+(\d+)\s*$") {
        $local = ($line -split "\s+") | Where-Object { $_ -match "^\S+:$ListenPort$" }
        if ($local) { $pids += [int]$Matches[1] }
      }
    }
    return ($pids | Select-Object -Unique)
  }
}

foreach ($p in $Ports) {
  $pids = Get-ListenerPids -ListenPort $p
  if (-not $pids) { Write-Host "port $p : free (nothing to stop)"; continue }
  foreach ($id in $pids) {
    try {
      $proc = Get-Process -Id $id -ErrorAction Stop
    } catch { Write-Host "port $p : pid $id already exited"; continue }
    if ($proc.ProcessName -like "node*") {
      Stop-Process -Id $id -Force
      Write-Host "port $p : stopped node (pid $id)" -ForegroundColor Green
      $stopped++
    } else {
      Write-Host "port $p : kept $($proc.ProcessName) (pid $id) - not node, left alone" -ForegroundColor Yellow
    }
  }
}
Write-Host "Done. Stopped $stopped node process(es)."
