import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runnerConfiguration,runEngine} from './research-runner.mjs';
import {checkSessionResult} from './research-sessions.mjs';
import {canonical,digest} from './core.mjs';

test('actual fixed Python session creation binds exact inputs, archive and transport without inference',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'bm-session-test-'));
 try{
  const engineRoot=fileURLToPath(new URL('../../../bibliometric-network-researcher/',import.meta.url)),python=path.join(engineRoot,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const operator=path.join(root,'operator.json');await writeFile(operator,JSON.stringify({schema_version:'bnr.connector.v1',workspace_root:path.join(root,'operator-workspace'),snapshots:{},research_provider:{kind:'codex_exec',executable:python,model:'test-stub',max_session_steps:20}}));
  const filename=path.join(root,'runner.json');await writeFile(filename,JSON.stringify({python,engineRoot,workspace:path.join(root,'workspace'),researchConfig:operator,maxOutputBytes:30000000}));
  const config=await runnerConfiguration(filename),rows=[{id:'W1',title:'μ test'},{id:'W2',referenced_works:[]}],records_json=canonical(rows),settings_json='{}';
  const request={operation:'session_create',execution_id:randomUUID(),scope:{project_id:randomUUID(),user_id:'a'.repeat(64)},arguments:{question:'What is measured and by whom?',context:'Bounded source-appraisal test.',max_tokens:40000,max_steps:12,require_literature_specialist:true,exchange:{schema_version:'bnr.bibliomap-exchange.v1',codec:'utf8-json-wire-v1',parent:{evidence_checksum:'f'.repeat(64),capped:true},records_json,records_sha256:digest(records_json),settings_json,settings_sha256:digest(settings_json)}}};
  const output=await runEngine(config,request),binding={request,transport_request_json:JSON.stringify(request)};
  assert.equal(checkSessionResult(output,binding).result.state,'ready');
  const again=await runEngine(config,request);assert.equal(again.result.session_id,output.result.session_id);
  assert.throws(()=>checkSessionResult({...output,result:{...output.result,state:'budget_exhausted'}},binding),/observation/);
  assert.throws(()=>checkSessionResult(output,{request:{...request,arguments:{...request.arguments,max_tokens:50000}},transport_request_json:JSON.stringify(request)}),/transport/);
  const status=await runEngine(config,{operation:'session_status',scope:request.scope,arguments:{session_id:output.result.session_id}});assert.equal(status.result.steps,0);
  const control=async(operation,reason)=>{const requestControl={operation,execution_id:randomUUID(),scope:request.scope,arguments:{session_id:output.result.session_id,reason}};const value=await runEngine(config,requestControl);checkSessionResult(value,{request:requestControl,transport_request_json:JSON.stringify(requestControl)});return value;};
  const paused=await control('session_pause','Pause after this bounded step.');assert.equal(paused.result.state,'paused');assert.equal(paused.result.tokens,0);
  const resumed=await control('session_resume','Resume deliberately without resetting costs.');assert.equal(resumed.result.state,'ready');assert.equal(resumed.result.tokens,0);assert.equal(resumed.result.steps,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
