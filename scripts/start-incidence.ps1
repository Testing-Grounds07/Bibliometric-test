param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root '.trials/hypergraph-engine'
$binary = Join-Path $runtime 'Scripts/python.exe'
if (!(Test-Path -LiteralPath $binary)) {
    & $Python -m venv $runtime
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ is required for the incidence engine.' }
}
& $binary -c "from importlib.metadata import version; assert version('igraph') == '0.11.9' and version('leidenalg') == '0.10.2'" 2>$null
if ($LASTEXITCODE -ne 0) {
    & $binary -m pip install --disable-pip-version-check 'igraph==0.11.9' 'leidenalg==0.10.2'
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the pinned bipartite Leiden engine.' }
}
if (!(Get-NetTCPConnection -LocalPort 8095 -State Listen -ErrorAction SilentlyContinue)) {
    $process = Start-Process -FilePath $binary -ArgumentList ('"' + (Join-Path $PSScriptRoot 'incidence-service.py') + '"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'service.out.log') -RedirectStandardError (Join-Path $runtime 'service.err.log')
    $process.Id | Set-Content -LiteralPath (Join-Path $runtime 'service.pid')
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8095/health' -TimeoutSec 2; if ($health.modelVersion -eq 'incidence-v1') { break } } catch {}
    Start-Sleep -Milliseconds 250
}
if ($health.modelVersion -ne 'incidence-v1') { throw 'The incidence engine did not become ready. Check service.err.log.' }
Write-Output 'Bipartite Leiden service started on localhost port 8095.'
