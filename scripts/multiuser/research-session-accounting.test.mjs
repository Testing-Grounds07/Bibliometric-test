import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {replaySessionState,checkSessionResult} from './research-sessions.mjs';

test('known rejected and unknown parent attempts independently replay once',()=>{
 const manifest={session_id:'research-fixture'},attempt={kind:'provider_attempt',task_id:'task-a'},failed={kind:'provider_failure',task_id:'task-a',provider_accounting:{status:'known',usage:{input_tokens:80,output_tokens:20,cached_input_tokens:40}}};
 const known=replaySessionState(manifest,[attempt,failed,failed]);assert.equal(known.tokens,100);assert.equal(known.steps,1);assert.equal(known.cached_input_tokens,40);
 const unknown=replaySessionState(manifest,[attempt]);assert.equal(unknown.state,'budget_accounting_required');assert.deepEqual(unknown.pending_parent_attempt_ids,['task-a']);
 const malformed=replaySessionState(manifest,[attempt,{...failed,provider_accounting:{status:'known',usage:{}}}]);assert.equal(malformed.state,'budget_accounting_required');
});

test('actual sealed Python advance archives bind successful, rejected, not-started and interrupted states',{timeout:30000},async()=>{
 const here=path.dirname(fileURLToPath(import.meta.url)),engine=path.resolve(here,'../../../bibliometric-network-researcher');
 const {stdout}=await promisify(execFile)(path.join(engine,'.venv','Scripts','python.exe'),[path.join(here,'research-session-probe.py')],{env:{...process.env,PYTHONIOENCODING:'utf-8'},maxBuffer:8*1024*1024,timeout:25000,windowsHide:true});
 const cases=JSON.parse(stdout);assert.equal(cases.length,5);
 for(const item of cases){checkSessionResult(item.result,item.binding);assert.equal(item.result.result.steps,1);assert.equal(item.result.result.tokens,['successful','successful_legacy_display','known_rejected'].includes(item.mode)?100:0);if(item.mode==='interrupted')assert.equal(item.result.result.state,'budget_accounting_required');}
});

test('explicit budget revision seals original limits and all spent usage without inference',{timeout:30000},async()=>{
 const here=path.dirname(fileURLToPath(import.meta.url)),engine=path.resolve(here,'../../../bibliometric-network-researcher');
 const {stdout}=await promisify(execFile)(path.join(engine,'.venv','Scripts','python.exe'),[path.join(here,'research-budget-probe.py')],{env:{...process.env,PYTHONIOENCODING:'utf-8'},maxBuffer:8*1024*1024,timeout:25000,windowsHide:true});
 const item=JSON.parse(stdout);checkSessionResult(item.result,item.binding);assert.equal(item.result.result.state,'ready');assert.equal(item.result.result.tokens,100);assert.equal(item.result.result.steps,1);assert.equal(item.result.result.max_tokens,200);assert.equal(item.result.result.max_steps,25);assert.equal(item.result.result.initial_budget.max_tokens,40);assert.equal(item.result.result.budget_history.length,1);
 const tampered=structuredClone(item.result);tampered.result.tokens=0;assert.throws(()=>checkSessionResult(tampered,item.binding),/Displayed|observation/);
});
