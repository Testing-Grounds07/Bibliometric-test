import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('actual workspace launcher permits only persistent nonsecret outside-webroot metadata configuration',{skip:process.platform!=='win32'},()=>{
 const root=mkdtempSync(path.join(tmpdir(),'bibliomap-runtime-')),runtime=path.join(root,'.trials','workspace-projects'),publicRoot=path.join(root,'public'),hostRoot=path.join(root,'host','site');mkdirSync(runtime,{recursive:true});mkdirSync(publicRoot);mkdirSync(hostRoot,{recursive:true});const metadata=path.join(root,'metadata with spaces #1.json'),publicFile=path.join(publicRoot,'private.json'),hostFile=path.join(hostRoot,'private.json');for(const file of [metadata,publicFile,hostFile])writeFileSync(file,'{}');
 const launcher=readFileSync('scripts/start-workspace-projects.ps1','utf8').replace('$root = Split-Path $PSScriptRoot -Parent',"$root = '"+root.replaceAll("'","''")+"'"),configuration=path.join(runtime,'runtime.json');
 const invoke=(inherited='')=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`function Get-NetTCPConnection { return $null }; function Get-Command { return @{Source='node.exe'} }; function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError); Write-Host ($ArgumentList -join '|'); Write-Host ('METADATA:'+$env:BIBLIOMAP_PUBLIC_COLLABORATION_METADATA); return @{Id=123} }; ${launcher}; Write-Host ('RESTORED:'+$env:BIBLIOMAP_PUBLIC_COLLABORATION_METADATA)`],{encoding:'utf8',env:{...process.env,BIBLIOMAP_PUBLIC_COLLABORATION_METADATA:inherited}});
 try{let result=invoke();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/--env-file=\.env.local\|scripts\/workspace-projects-service.mjs/);assert.match(result.stdout,/METADATA:\r?\n/);
  const valid={publicCollaborationMetadata:metadata,webRoots:[hostRoot]};writeFileSync(configuration,JSON.stringify(valid));result=invoke();assert.equal(result.status,0,result.stderr);assert(result.stdout.includes('METADATA:'+metadata));assert.match(result.stdout,/RESTORED:\r?\n/);result=invoke('existing-process-value');assert.equal(result.status,0,result.stderr);assert(result.stdout.includes('METADATA:existing-process-value'));assert(result.stdout.includes('RESTORED:existing-process-value'));
  for(const config of [{...valid,publicCollaborationMetadata:'missing.json'},{...valid,publicCollaborationMetadata:publicFile},{...valid,publicCollaborationMetadata:hostFile},{...valid,publicCollaborationMetadata:{private:'no'}},{...valid,webRoots:'not-an-array'},{...valid,BIBLIOMAP_AUTH_DISABLED:true},{...valid,publicCollaborationMetadata:'"'+metadata}]){writeFileSync(configuration,JSON.stringify(config));result=invoke();assert.notEqual(result.status,0);assert(!result.stdout.includes('--env-file='));}
  writeFileSync(configuration,'{"publicCollaborationMetadata":"unterminated');result=invoke();assert.notEqual(result.status,0);assert(!result.stdout.includes('--env-file='));
 }finally{rmSync(root,{recursive:true,force:true});}
});
