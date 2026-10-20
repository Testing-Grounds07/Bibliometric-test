$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root '.trials/cluster-model'
$binary = Get-ChildItem -LiteralPath (Join-Path $runtime 'bin') -Filter llama-server.exe -Recurse | Select-Object -First 1
if (!$binary -or !(Test-Path -LiteralPath (Join-Path $runtime 'model.gguf'))) { throw 'Run scripts/setup-cluster-model.ps1 first.' }
if (!(Get-NetTCPConnection -LocalPort 8092 -State Listen -ErrorAction SilentlyContinue)) {
    $arguments = @('-m', ('"' + (Join-Path $runtime 'model.gguf') + '"'), '--host', '127.0.0.1', '--port', '8092', '--alias', 'bibliomap-cluster-slm', '-c', '16384', '-ngl', '99', '-t', '6', '--parallel', '1', '--no-webui')
    if ($env:BIBLIOMAP_SERVICE_TOKEN) { $arguments += @('--api-key', $env:BIBLIOMAP_SERVICE_TOKEN) }
    $process = Start-Process -FilePath $binary.FullName -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'model.out.log') -RedirectStandardError (Join-Path $runtime 'model.err.log')
    $process.Id | Set-Content -LiteralPath (Join-Path $runtime 'model.pid')
}
if (!(Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue)) {
    $process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + (Join-Path $PSScriptRoot 'cluster-description-service.mjs') + '"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'service.out.log') -RedirectStandardError (Join-Path $runtime 'service.err.log')
    $process.Id | Set-Content -LiteralPath (Join-Path $runtime 'service.pid')
}
Write-Output 'Cluster model and evidence service started on localhost ports 8092/8093.'
foreach ($port in @(8092, 8093)) {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) {
        $filename = if ($port -eq 8092) { 'model.pid' } else { 'service.pid' }
        $connection.OwningProcess | Set-Content -LiteralPath (Join-Path $runtime $filename)
    }
}
