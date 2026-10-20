import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {checkSessionResult} from './research-sessions.mjs';

test('actual bounded snapshot worker archives retain every duplicate physical row through continuation',{timeout:30000},async()=>{
 const here=path.dirname(fileURLToPath(import.meta.url)),engine=path.resolve(here,'../../../bibliometric-network-researcher');
 const {stdout}=await promisify(execFile)(path.join(engine,'.venv','Scripts','python.exe'),[path.join(here,'research-snapshot-probe.py')],{env:{...process.env,PYTHONIOENCODING:'utf-8'},maxBuffer:8*1024*1024,timeout:25000,windowsHide:true});
 const cases=JSON.parse(stdout);assert.ok(cases.length>=5);for(const item of cases)checkSessionResult(item.result,item.binding);
 const frozen=cases.at(-1).result.result;assert.deepEqual(JSON.parse(frozen.records_json).map(row=>row.referenced_works),[['W9'],['W8'],[]]);assert.equal(frozen.catalog_scope.unavailable.length,1);assert.equal(frozen.selection_manifest.scientific_completeness,'not_assessed');
});
