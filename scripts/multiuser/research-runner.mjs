import {spawn,execFile} from 'node:child_process';
import {readFile,readdir,realpath,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {canonical,digest,error} from './core.mjs';
export async function runnerConfiguration(filename){
 if(!filename)return null;
 const value=JSON.parse(await readFile(filename,'utf8'));
 if(Object.keys(value).some(k=>!['python','engineRoot','workspace','maxOutputBytes','researchConfig','researchAdvanceSeconds','profileEnvironment'].includes(k)))throw error('Unsupported research operator configuration.',503);
 for(const k of ['python','engineRoot'])value[k]=await realpath(value[k]);
 value.workspace=path.resolve(value.workspace);await mkdir(value.workspace,{recursive:true});
 value.maxOutputBytes=value.maxOutputBytes??16000000;if(!Number.isInteger(value.maxOutputBytes)||value.maxOutputBytes<10000||value.maxOutputBytes>32000000)throw error('Invalid research output quota.',503);
 if(value.researchConfig){value.researchConfig=await realpath(value.researchConfig);if(value.maxOutputBytes<30000000)throw error('Research sessions require an explicit maxOutputBytes>=30000000 for the bounded20MiB original-byte archive plus base64 envelope.',503);const settings=JSON.parse(await readFile(value.researchConfig,'utf8'));value.researchAdvanceSeconds=value.researchAdvanceSeconds??600;if(!Number.isInteger(value.researchAdvanceSeconds)||value.researchAdvanceSeconds<60||value.researchAdvanceSeconds>900)throw error('Research advance deadline must be60..900seconds.',503);const providerSeconds=settings.research_provider?.timeout_seconds??180;if(2*providerSeconds+30>value.researchAdvanceSeconds)throw error('Research advance deadline must cover a lead decision plus one specialist call and30seconds bookkeeping.',503);value.credentialEnvNames=Object.values(settings.source_providers||{}).map(v=>v.api_key_env).filter(Boolean);value.publicResearch={snapshots:Object.keys(settings.snapshots||{}),snapshot_limits:{max_files:2000,max_scan_bytes:4294967296,max_scan_rows:5000000,max_matches:10000,max_seconds:600,...settings.limits},source_providers:Object.fromEntries(Object.entries(settings.source_providers||{}).map(([id,p])=>[id,{kind:p.kind,enabled:p.enabled,credential_available:p.api_key_env?!!process.env[p.api_key_env]:null,limits:p.limits||{}}])),model:settings.research_provider?.model,max_session_tokens:settings.research_provider?.max_session_tokens??200000,max_session_steps:settings.research_provider?.max_session_steps??30};}
 if(value.publicResearch){const provider=path.join(value.workspace,'research-projects','0'.repeat(64),'workspace','tasks','task-'+'0'.repeat(36),'provider');value.publicResearch.execution_ready=process.platform!=='win32'||provider.length+10<248&&provider.length+29<259;value.publicResearch.execution_problem=value.publicResearch.execution_ready?null:'Windows native provider paths are too long. Configure an explicit short operator workspace and create a new session; retained history is still readable.';}
 value.profileEnvironment=value.profileEnvironment||{};if(Object.keys(value.profileEnvironment).some(k=>!['USERPROFILE','HOMEDRIVE','HOMEPATH','HOME','CODEX_HOME'].includes(k))||Object.values(value.profileEnvironment).some(v=>typeof v!=='string'||v.length>1000))throw error('Only explicit operator profile location variables may be passed to the isolated researcher.',503);
 value.identity=await runtimeIdentity(value);
 value.executionProfileHash=digest([value.workspace,value.identity.research_config_sha256,value.identity.profile_environment_sha256]);
 return value;
}
export async function runtimeIdentity(value){
 const sources=[];for(const name of (await readdir(path.join(value.engineRoot,'src','bnr'))).filter(n=>n.endsWith('.py')).sort())sources.push([name,digest(await readFile(path.join(value.engineRoot,'src','bnr',name)))]);
 for(const name of ['pyproject.toml','requirements-lock.txt']){sources.push([name,digest(await readFile(path.join(value.engineRoot,name)))]);}
 return {research_config_sha256:value.researchConfig?digest(await readFile(value.researchConfig)):null,profile_environment_sha256:digest(value.profileEnvironment||{}),engine_source_sha256:digest(sources),sources,python_sha256:digest(await readFile(value.python)),bridge_sources:await Promise.all(['research-contracts.mjs','research-runner.mjs','research.mjs','research-store.mjs','research-sessions.mjs','research-methods.mjs','research-method-contracts.mjs','research-attachments.mjs','research-snapshots.mjs','research-versions.mjs'].map(async name=>[name,digest(await readFile(new URL(name,import.meta.url)))]))};
}
export async function runEngine(config,request,signal,checkpoint=async()=>{},authorize=async()=>{}){
 if(!config)throw error('Independent research engine is not configured.',503);
 if(canonical(config.identity)!==canonical(await runtimeIdentity(config)))throw error('Configured engine or bridge bytes changed since startup. Restart and use a new request key.',409);
 await authorize();signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  env.PYTHONPATH=path.join(config.engineRoot,'src');env.PYTHONIOENCODING='utf-8';env.PYTHONUTF8='1';
  const isResearch=!['pipeline','capabilities'].includes(request.operation);if(isResearch){Object.assign(env,config.profileEnvironment);for(const key of config.credentialEnvNames||[])if(process.env[key])env[key]=process.env[key];}
  const child=spawn(config.python,['-m','bnr.bibliomap_worker','--workspace',config.workspace,...(isResearch&&config.researchConfig?['--research-config',config.researchConfig]:[])],{env,cwd:config.workspace,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  let total=0,text='',stderr='',failure,pending=Promise.resolve(),finalResult;
  const kill=()=>{if(child.pid){if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else try{process.kill(-child.pid,'SIGKILL');}catch{}}};
  const fail=problem=>{failure??=problem;kill();};
  const abort=()=>fail(error('Research computation cancelled.',409));signal?.addEventListener('abort',abort,{once:true});
  let checking=false;const timer=setInterval(async()=>{if(checking)return;checking=true;try{await authorize();}catch(problem){fail(problem);}finally{checking=false;}},500);
  const seconds=request.operation==='session_advance'?config.researchAdvanceSeconds??600:request.operation==='method'?300:130;
  const deadline=setTimeout(()=>fail(error('Research engine reached its '+seconds+' second operation deadline.',422)),seconds*1000);
  child.stdout.on('data',chunk=>{total+=chunk.length;if(total>config.maxOutputBytes){fail(error('Research engine output quota exceeded.',413));return;}text+=chunk.toString('utf8');let index;while((index=text.indexOf('\n'))>=0){const line=text.slice(0,index);text=text.slice(index+1);if(!line.trim())continue;try{const item=JSON.parse(line);if(item.checkpoint){pending=pending.then(async()=>{await authorize();await checkpoint(item.checkpoint);}).catch(fail);}else if(item.error)fail(error('Engine '+item.error.code+': '+item.error.message,422));else if(Object.hasOwn(item,'result')&&finalResult===undefined)finalResult=item.result;else fail(error('Malformed engine output envelope.',502));}catch{fail(error('Malformed engine JSON output.',502));}}});
  child.stderr.on('data',chunk=>{stderr+=chunk.toString('utf8');if(Buffer.byteLength(stderr)>65536)fail(error('Engine diagnostic quota exceeded.',413));});
  child.on('error',fail);
  child.stdin.on('error',problem=>fail(error('Engine input pipe failed.',502)));
  child.on('close',async code=>{clearInterval(timer);clearTimeout(deadline);signal?.removeEventListener('abort',abort);await pending;if(failure)return reject(failure);if(code!==0||text.trim()||finalResult===undefined)return reject(error('Engine did not produce one sealed result.',502));try{await authorize();resolve(finalResult);}catch(problem){reject(problem);}});
  child.stdin.end(JSON.stringify(request));
 });
}
