import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('actual protected client installs collaboration as a new authorized graph, never an old-analysis attachment',async()=>{
 const parent={_projectId:'project',_resultId:'citation-result',_analysisKey:'citation-key'},actor={_projectId:'project',_resultId:'actor-result',_analysisKey:'actor-key',collaboration:{kind:'author'},nodes:[{id:'A1'}]},events=[],requests=[];let current=parent,kind;
 const fetch=async(input,options={})=>{const url=new URL(input,'http://127.0.0.1:18086'),path=url.pathname;requests.push({path,options});let value;
  if(path==='/auth/session')value={csrf:'synthetic-token'};
  else if(path.endsWith('/computations')){kind=JSON.parse(options.body).stage;value={id:'synthetic-job'};}
  else if(path.endsWith('/jobs/synthetic-job'))value={status:'succeeded',resultId:kind==='collaboration-network'?'actor-result':'checked-result'};
  else if(path.endsWith('/results/actor-result'))value={id:'actor-result',graph:actor,value:{collaboration:{kind:'author'},nodes:[{id:'A1'}]}};
  else if(path.endsWith('/results/checked-result'))value={id:'checked-result',graph:{...actor,collaborationSensitivity:{completed:3}},value:{completed:3}};
  else throw Error('Unexpected client route '+path);
  return {ok:true,json:async()=>value};};
 const window={fetch,atlasSharedCanvas:{graph:()=>current},addEventListener(){},dispatchEvent:event=>events.push(event)},sandbox={window,location:{href:'http://127.0.0.1:18086/conservative-atlas/index.html',origin:'http://127.0.0.1:18086'},URL,AbortController,setTimeout,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}};vm.runInNewContext(readFileSync('public/conservative-atlas/multiuser-client.js','utf8'),sandbox);
 const installed=await window.BIBLIOMAP.stage(parent,'collaboration-network',{}).promise;assert.equal(installed,actor);assert.equal(installed._resultId,'actor-result');assert.equal(parent._attachments,undefined);assert.equal(events.filter(event=>event.type==='bibliomap:derived').length,0);
 current=actor;const checked=await window.BIBLIOMAP.stage(actor,'collaboration-sensitivity',{}).promise;assert.equal(checked.completed,3);assert.deepEqual(Array.from(actor._attachments),['checked-result']);assert.equal(actor.collaborationSensitivity.completed,3);const ego={...actor,collaboration:{...actor.collaboration,ego:{seedId:'A1',hops:1}}};assert.equal(ego._resultId,'actor-result');assert.deepEqual(Array.from(ego._attachments),['checked-result']);assert.equal(parent._attachments,undefined);assert.equal(requests.filter(request=>request.path.endsWith('/computations')).length,2);
});
