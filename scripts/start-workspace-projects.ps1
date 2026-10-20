$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root '.trials/workspace-projects'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if (!(Get-NetTCPConnection -LocalPort 8094 -State Listen -ErrorAction SilentlyContinue)) {
    $arguments = @('--env-file=.env.local', 'scripts/workspace-projects-service.mjs')
    $runtimeConfiguration = Join-Path $runtime 'runtime.json'
    $metadataPath = $null
    $previousMetadata = [Environment]::GetEnvironmentVariable('BIBLIOMAP_PUBLIC_COLLABORATION_METADATA', 'Process')
    if (Test-Path -LiteralPath $runtimeConfiguration -PathType Leaf) {
        $configuration = Get-Content -LiteralPath $runtimeConfiguration -Raw | ConvertFrom-Json
        if ($configuration -isnot [pscustomobject] -or @($configuration.PSObject.Properties.Name | Where-Object { $_ -notin @('publicCollaborationMetadata', 'webRoots') }).Count -or $configuration.publicCollaborationMetadata -isnot [string] -or $configuration.webRoots -isnot [array]) {
            throw 'runtime.json accepts only a metadata path and an array of configured public web roots.'
        }
        $metadataPath = $configuration.publicCollaborationMetadata
        if (![System.IO.Path]::IsPathRooted($metadataPath) -or !(Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
            throw 'The configured public collaboration metadata file must exist at an absolute path.'
        }
        $metadataPath = (Resolve-Path -LiteralPath $metadataPath).ProviderPath
        $publicRoots = @((Join-Path $root 'public')) + @($configuration.webRoots)
        foreach ($publicRoot in $publicRoots) {
            if ($publicRoot -isnot [string] -or ![System.IO.Path]::IsPathRooted($publicRoot)) { throw 'Each configured web root must be an absolute path.' }
            $publicPath = [System.IO.Path]::GetFullPath($publicRoot).TrimEnd('\', '/')
            if ($metadataPath.Equals($publicPath, [StringComparison]::OrdinalIgnoreCase) -or $metadataPath.StartsWith($publicPath + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Supplemental metadata must stay outside all configured web roots.' }
        }
    }
    try {
        if ($metadataPath -and !$previousMetadata) { [Environment]::SetEnvironmentVariable('BIBLIOMAP_PUBLIC_COLLABORATION_METADATA', $metadataPath, 'Process') }
        $process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'service.out.log') -RedirectStandardError (Join-Path $runtime 'service.err.log')
    } finally {
        [Environment]::SetEnvironmentVariable('BIBLIOMAP_PUBLIC_COLLABORATION_METADATA', $previousMetadata, 'Process')
    }
    $process.Id | Set-Content -LiteralPath (Join-Path $runtime 'service.pid')
}
Write-Output 'Project service started on localhost:8094.'
