$ErrorActionPreference = 'Stop'
$serviceName = 'bibliomap-blockmodel'
$image = 'tiagopeixoto/graph-tool@sha256:6998e03f0f47004a580d03ddc3029628631be980b6300c17c1fe937b0286d9fc'
$existing = docker ps -a --filter "name=^/$serviceName$" --format '{{.Names}}'
if ($existing -eq $serviceName) {
    docker start $serviceName
} else {
    docker run -d --name $serviceName --restart unless-stopped --cpus 2 --memory 2g --pids-limit 128 --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,size=128m -p 127.0.0.1:8091:8091 --env BIBLIOMAP_SERVICE_TOKEN --mount "type=bind,source=$PSScriptRoot,target=/work,readonly" $image python /work/blockmodel-service.py
}
if ($LASTEXITCODE -ne 0) { throw 'Could not start the block-model service.' }
