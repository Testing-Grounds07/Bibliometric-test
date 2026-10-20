$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root '.trials/multiuser'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$port = if ($env:BIBLIOMAP_PORT) { [int]$env:BIBLIOMAP_PORT } else { 8086 }
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port is already in use. No existing service was stopped." }
$process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('--env-file=.env.local', 'scripts/multiuser-server.mjs') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'service.out.log') -RedirectStandardError (Join-Path $runtime 'service.err.log')
$process.Id | Set-Content -LiteralPath (Join-Path $runtime 'service.pid')
Write-Output "Multiuser service started on localhost:$port. The existing tunnel and research services are unchanged."
