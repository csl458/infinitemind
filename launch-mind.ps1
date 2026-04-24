$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = 'http://127.0.0.1:4173/'

function Test-MindServer {
  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null
    return $true
  }
  catch {
    return $false
  }
}

if (-not (Test-MindServer)) {
  $command = "Set-Location '$projectRoot'; npm run dev -- --host 127.0.0.1 --port 4173"

  Start-Process powershell -WindowStyle Minimized -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    $command
  )

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Seconds 1

    if (Test-MindServer) {
      break
    }
  }
}

Start-Process $url