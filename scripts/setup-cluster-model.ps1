$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root '.trials/cluster-model'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
function Download-Verified($url, $path, $hash) {
    if (!(Test-Path -LiteralPath $path)) {
        & curl.exe -L --fail --retry 3 -o "$path.partial" $url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
        if ((Get-FileHash -LiteralPath "$path.partial" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Download checksum mismatch' }
        Move-Item -LiteralPath "$path.partial" -Destination $path
    }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Existing file checksum mismatch' }
}
Download-Verified 'https://github.com/ggml-org/llama.cpp/releases/download/b11701/llama-b11701-bin-win-vulkan-x64.zip' (Join-Path $runtime 'llama.zip') '571794ccf8d44351253a644cfc406bcf094cf01e902aad7f6f65e8a0859eb0af'
Expand-Archive -LiteralPath (Join-Path $runtime 'llama.zip') -DestinationPath (Join-Path $runtime 'bin') -Force
Download-Verified 'https://huggingface.co/lmstudio-community/Qwen3-4B-Instruct-2507-GGUF/resolve/4edb920b6f14e3b9284d4502a6485103d72cde05/Qwen3-4B-Instruct-2507-Q4_K_M.gguf' (Join-Path $runtime 'model.gguf') '8cdb57cbb880d313736a9bc4e3d3d2485f145b5e19cf33783746e753e82641fc'
Write-Output 'Pinned llama.cpp runtime and Qwen3 4B quantization verified.'
