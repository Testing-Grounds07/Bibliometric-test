import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('late client stages cannot install after analytical intent or project changes',async()=>{
 const source=await readFile(new URL('../../public/conservative-atlas/multiuser-client.js',import.meta.url),'utf8');
 for(const scenario of ['unchanged','settings','project']){
  let release,graph={_projectId:'first',_resultId:'base',_analysisKey:'base'},requests=0;const events=[];
  const window={atlasSharedCanvas:{graph:()=>graph},addEventListener:()=>{},dispatchEvent:event=>events.push(event),fetch:async(url,options)=>{
   if(url==='/auth/session')return Response.json({csrf:'csrf',user:{id:'user'}});
   if(url.endsWith('/computations')){requests++;assert.equal(options.headers['X-CSRF-Token'],'csrf');await new Promise(resolve=>{release=resolve;});return Response.json({id:'subscription'});}
   if(url.endsWith('/jobs/subscription'))return Response.json({status:'succeeded',resultId:'completed'});
   if(url.endsWith('/results/completed'))return Response.json({id:'completed',graph:{_projectId:'first',_resultId:'completed'}});
   throw Error('Unexpected request '+url);
  }};
  vm.runInNewContext(source,{window,location:{href:'https://app.test/',origin:'https://app.test'},URL,AbortController,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},setTimeout});
  await window.BIBLIOMAP.ready;const stage=window.BIBLIOMAP.stage(graph,'clustering');while(!release)await new Promise(resolve=>setImmediate(resolve));
  if(scenario==='settings')window.BIBLIOMAP.selectionVersion=1;if(scenario==='project')graph={_projectId:'second',_resultId:'other'};
  const settled=scenario==='unchanged'?stage.promise.then(value=>assert.equal(value._resultId,'completed')):assert.rejects(stage.promise,/Selection changed/);release();await settled;assert.equal(requests,1);assert(!events.some(event=>event.type==='bibliomap:derived'));
 }
});
