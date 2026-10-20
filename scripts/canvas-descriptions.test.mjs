import test from 'node:test';
import assert from 'node:assert/strict';
import {descriptionsAllowed} from './description-policy.mjs';
import {descriptionRequest} from './cluster-description-core.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const graph=()=>({nodes:[{id:'a',cluster:1},{id:'b',cluster:1}],links:[],themeDescriptions:{1:{heading:'Cached heading'}},clustering:{algorithm:'leiden'},order:2});
const domNode=()=>({children:[],append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(){},isConnected:true});
test('repeated completed-window prepare/mount/retry produces zero public fetch or protected model stages and aborts prior work',async()=>{
 const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 try{for(const active of[false,true]){let calls=0,cancelled=0,rejectPending;const session={active,canCompute:true,stage(){calls++;return {promise:new Promise((resolve,reject)=>{rejectPending=reject;}),cancel(){cancelled++;rejectPending?.(Error('cancelled'));}};}};
  globalThis.window={BIBLIOMAP:session,ATLAS_DATA:{summary:{corpus_id:'fixture'}}};globalThis.document={getElementById:()=>null,createElement:()=>domNode()};globalThis.fetch=(url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{cancelled++;reject(Error('cancelled'));},{once:true}));};
  await import('./canvas-descriptions.mjs?test='+active);const api=window.ATLAS_DESCRIPTIONS,windowGraph={...graph(),temporalSelection:{index:0}};
  for(let index=0;index<5;index++){api.sync(windowGraph);api.prepare(windowGraph,()=>{});api.mount(domNode(),windowGraph,'1',()=>{});api.rerunAll();api.drawProgress();}await tick();assert.equal(calls,0,'selected windows must not request any model work');assert.throws(()=>descriptionRequest(windowGraph,'1','fixture'),/read-only/);
  api.prepare(graph(),()=>{});assert.equal(calls,1,'the full-map control must genuinely start a request');api.sync(windowGraph);await tick();assert.equal(cancelled,1,'switching into a window cancels prior scope');for(let index=0;index<3;index++){api.prepare(windowGraph,()=>{});api.rerunAll();api.mount(domNode(),windowGraph,'1',()=>{});}await tick();assert.equal(calls,1,'scrubbing/retrying does not create additional model jobs');
  const completedParent={...graph(),temporalSeries:{windows:[]}};for(let index=0;index<3;index++){api.sync(completedParent);api.prepare(completedParent,()=>{});api.mount(domNode(),completedParent,'1',()=>{});api.drawProgress();api.sync(windowGraph);api.prepare(windowGraph,()=>{});}await tick();assert.equal(calls,1,'window/full completed-parent roundtrips must remain display-only');api.sync(completedParent);api.prepare(completedParent,()=>{});api.resumeNaming();assert.equal(calls,2,'explicit full-parent Resume is a real opt-in request');api.sync(windowGraph);await tick();assert.equal(cancelled,2);
  for(const view of [{...graph(),linkedBrowse:true},{...graph(),collaboration:{kind:'author'},entityKind:'author'}]){for(let index=0;index<3;index++){api.sync(view);api.prepare(view,()=>{});api.mount(domNode(),view,'1',()=>{});api.rerunAll();api.drawProgress();}}await tick();assert.equal(calls,2,'actor ego/linked-source browsing must not start public or protected model work');
 }}finally{globalThis.window=previous.window;globalThis.document=previous.document;globalThis.fetch=previous.fetch;}
});
test('description policy fails closed for protected viewers and feature-node maps',()=>{
 assert.equal(descriptionsAllowed(graph(),{active:true,canCompute:false}),false);assert.equal(descriptionsAllowed(graph(),{active:true}),false);assert.equal(descriptionsAllowed({...graph(),semantic:{kind:'terms'},entityKind:'term'}),false);assert.equal(descriptionsAllowed(graph()),true);
});
test('protected viewer reads seeded matching saved AI evidence without jobs, never under a temporal cluster ID',async()=>{
 const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};let calls=0;
 try{globalThis.window={BIBLIOMAP:{active:true,canCompute:false,stage(){calls++;throw Error('No jobs permitted');}},ATLAS_DATA:{summary:{corpus_id:'fixture'}}};globalThis.document={getElementById:()=>null,createElement:()=>domNode()};globalThis.fetch=()=>{calls++;throw Error('No model fetch permitted');};await import('./canvas-descriptions.mjs?test=viewer');
  const saved=graph(),request=descriptionRequest(saved,'1','fixture');saved.generatedDescriptions={1:{requestKey:JSON.stringify(request),result:{heading:'Saved cached theme',status:'shared-theme',summary:{text:'Authorized saved explanation',evidence:[]},concepts:[],exceptions:[],packet:{coverage:{sampled:2,members:2,withAbstract:0},documents:[]},createdAt:'2026-10-18T00:00:00Z',model:'Pinned model',verification:'Grounded cached claims'}}};
  const api=window.ATLAS_DESCRIPTIONS,host=domNode(),text=node=>[node.textContent||'',...(node.children||[]).map(text)].join(' ');api.prepare(saved,()=>{});api.mount(host,saved,'1',()=>{});api.rerunAll();await tick();assert.match(text(host),/Authorized saved explanation/);assert.equal(saved.themeDescriptions[1].heading,'Saved cached theme');assert.equal(calls,0);
  const period={...saved,temporalSelection:{index:0}},periodHost=domNode();api.prepare(period,()=>{});api.mount(periodHost,period,'1',()=>{});api.rerunAll();await tick();assert.doesNotMatch(text(periodHost),/Authorized saved explanation/);assert.match(text(periodHost),/no AI description job/);assert.equal(calls,0);
 }finally{globalThis.window=previous.window;globalThis.document=previous.document;globalThis.fetch=previous.fetch;}
});


test('frozen standalone imports never dispatch descriptions, even explicit retries, and abort prior naming',async()=>{
 const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 try{for(const active of [false,true]){let calls=0,cancelled=0;
  const session={active,canCompute:true,stage(){calls++;let reject;const promise=new Promise((resolve,no)=>reject=no);return {promise,cancel(){cancelled++;reject(Error('cancelled'));}};}};
  globalThis.window={BIBLIOMAP:session,ATLAS_DATA:{summary:{corpus_id:'frozen-fixture'}}};globalThis.document={getElementById:()=>null,createElement:()=>domNode()};globalThis.fetch=(url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{cancelled++;reject(Error('cancelled'));},{once:true}));};
  await import('./canvas-descriptions.mjs?standalone='+active);const api=window.ATLAS_DESCRIPTIONS,imported={...graph(),_backend:'independent-bnr-standalone',importedStandalone:{objective:'modularity'},clustering:{algorithm:'leiden',objective:'modularity',seed:11,iterations:10}},before=JSON.stringify(imported);
  assert.equal(descriptionsAllowed(imported,session),false);for(let i=0;i<3;i++){api.sync(imported);api.prepare(imported,()=>{});api.mount(domNode(),imported,'1',()=>{});api.rerunAll();api.resumeNaming();}await tick();assert.equal(calls,0);assert.equal(JSON.stringify(imported),before);
  api.prepare(graph(),()=>{});assert.equal(calls,1,'ordinary full native map still starts its naming request');api.sync(imported);await tick();assert.equal(cancelled,1,'entering frozen import aborts prior naming');api.prepare(imported,()=>{});api.rerunAll();api.resumeNaming();await tick();assert.equal(calls,1);
 }}finally{globalThis.window=previous.window;globalThis.document=previous.document;globalThis.fetch=previous.fetch;}
});
