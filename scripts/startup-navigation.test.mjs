import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createStartupNavigation,baselineLocation,startupNavigation,navigationReady,automaticNavigationAllowed} from './startup-navigation.mjs';
import {automaticSettingsPending} from './canvas-settings.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve)),projectId='12345678-1234-1234-1234-123456789abc',mapId='abcdef12-1234-1234-1234-123456789abc',savedPath='/conservative-atlas/projects/'+projectId+'/maps/'+mapId;
const graph=(prefix,clusters=1)=>({nodes:Array.from({length:clusters*2},(_,index)=>({id:prefix+index,cluster:Math.floor(index/2)+1})),links:[],themeDescriptions:Object.fromEntries(Array.from({length:clusters},(_,index)=>[index+1,{heading:'Cached keywords'}])),clustering:{algorithm:'leiden'},order:2});
const dom=()=>({children:[],append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(){},addEventListener(){},getAttribute:()=>null,isConnected:true});

test('startup intent is fail-closed for saved/project/live/unknown routes and ignores stale completion',()=>{
 for(const input of ['/conservative-atlas/','/conservative-atlas/index.html','/conservative-atlas/hypergraph-lab.html']){assert(baselineLocation(input));assert(createStartupNavigation(input).automatic());}
 for(const input of [savedPath,'/conservative-atlas/projects','/conservative-atlas/map','/conservative-atlas/projects/not-valid']){const policy=createStartupNavigation(input);assert.equal(policy.ready(),false);assert.equal(policy.automatic(),false);const first=policy.begin(),second=policy.begin();assert.equal(policy.completed(first),false);assert.equal(policy.installed(),false);policy.failed(second);assert.equal(policy.ready(),false);policy.baseline();assert(policy.automatic());const third=policy.begin();policy.completed(third);assert(policy.ready());assert.equal(policy.automatic(),false);policy.installed();assert(policy.automatic());}
});

test('actual early naming module and deferred router produce zero wrong-study jobs, then allow explicit ready-study naming',async()=>{
 const prior={window:globalThis.window,document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
 try{for(const protectedMode of [false,true]){
  const events=new EventTarget(),url=new URL(savedPath,'http://localhost'),elements=new Map(),baseline=graph('baseline-',27),saved=graph('saved-');let visible=baseline,calls=0,cancelled=0,resolveReady;
  const ready=new Promise(resolve=>resolveReady=resolve),control=id=>{if(!elements.has(id))elements.set(id,dom());return elements.get(id);};
  const window={location:url,CustomEvent,addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),history:{pushState(){},replaceState(){}},atlasWorkspaceShell:{show(){}},BIBLIOMAP:{active:protectedMode,canCompute:true,stage(){calls++;let rejectPending;return {promise:new Promise((resolve,reject)=>rejectPending=reject),cancel(){cancelled++;rejectPending(Error('cancelled'));}};}},ATLAS_DATA:{summary:{corpus_id:'baseline'}}};
  globalThis.window=window;globalThis.location=url;globalThis.document={getElementById:control,querySelector:()=>null,createElement:()=>dom()};globalThis.fetch=(target,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{cancelled++;reject(Error('cancelled'));},{once:true}));};
  window.atlasSharedCanvas={graph:()=>visible,captureProject:()=>({graph:visible,controls:{},hiddenClusters:[]})};startupNavigation();await import('./canvas-descriptions.mjs?startup-counted='+protectedMode);const naming=window.ATLAS_DESCRIPTIONS;
  naming.prepare(baseline,()=>{});naming.rerunAll();naming.mount(dom(),baseline,'1',()=>{});await tick();assert.equal(calls,0,'app baseline preparation before project readiness must not submit model work');
  window.ATLAS_PROJECTS={ready,activeProject:()=>({id:projectId}),openProject:async()=>({analyses:[{id:mapId}]}),openSnapshot:async()=>{visible=saved;window.ATLAS_DATA.summary.corpus_id='saved';window.ATLAS_STARTUP_NAVIGATION.saved();naming.sync(saved);naming.prepare(saved,()=>{});window.dispatchEvent(new CustomEvent('atlas:map-opened',{detail:{projectId,mapId}}));},restoreBaseline(){throw Error('Saved navigation must not substitute the baseline');}};
  await import('./workspace-routing.mjs?startup-counted='+protectedMode);assert.equal(calls,0);resolveReady();for(let index=0;index<4;index++)await tick();assert.equal(visible,saved);assert(navigationReady(saved));assert.equal(automaticNavigationAllowed(saved),false);assert.equal(calls,0,'saved view completion is readable but does not automatically name clusters');
  naming.prepare(baseline,()=>{});naming.rerunAll();await tick();assert.equal(calls,0,'late baseline cache completion cannot start jobs after saved restoration');naming.prepare(saved,()=>{});naming.resumeNaming();await tick();assert.equal(calls,1,'explicit supported naming after readiness is still available');
  const token=window.ATLAS_STARTUP_NAVIGATION.begin();await tick();assert.equal(cancelled,1,'new navigation stops prior naming');window.ATLAS_STARTUP_NAVIGATION.failed(token);naming.rerunAll();naming.resumeNaming();await tick();assert.equal(calls,1,'failed route remains paused');
  visible=baseline;window.ATLAS_STARTUP_NAVIGATION.baseline();naming.prepare(baseline,()=>{});await tick();assert(calls>1,'explicit baseline restores ordinary automatic naming');naming.sync({...saved,linkedBrowse:true});await tick();
 }}finally{Object.assign(globalThis,prior);}
});

test('actual route initialization and failures stay paused, including unknown links and delayed rejected project readiness',async()=>{
 const prior={window:globalThis.window,document:globalThis.document,location:globalThis.location};
 try{for(const [index,target]of[savedPath,'/conservative-atlas/projects/invalid',savedPath,'/conservative-atlas/index.html'].entries()){
  const events=new EventTarget(),url=new URL(target,'http://localhost');let restored=0,rejectReady;const ready=index<2?Promise.resolve():new Promise((resolve,reject)=>rejectReady=reject),window={location:url,CustomEvent,addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),atlasWorkspaceShell:{show(){}},ATLAS_PROJECTS:{ready,activeProject:()=>null,openProject:async()=>{throw Error('Project unavailable');},restoreBaseline(){restored++;}},atlasSharedCanvas:{captureProject:()=>({graph:graph('baseline'),controls:{},hiddenClusters:[]})}};
  Object.assign(globalThis,{window,location:url,document:{getElementById:()=>dom(),querySelector:()=>null,createElement:()=>dom()}});startupNavigation();await import('./workspace-routing.mjs?startup-failure='+index);rejectReady?.(Error('Project readiness failed'));for(let turn=0;turn<3;turn++)await tick();assert.equal(startupNavigation().state().phase,index===3?'baseline':'failed');assert.equal(automaticNavigationAllowed(),index===3);assert.equal(restored,0);
 }}finally{Object.assign(globalThis,prior);}
});

test('actual reliability/settings executors do not start a worker when navigation changes during engine loading',async()=>{
 const previous=globalThis.window;
 try{
  const visible=graph('active'),window={location:new URL('/conservative-atlas/index.html','http://localhost'),atlasSharedCanvas:{graph:()=>visible},ATLAS_EVIDENCE:{cancelCanvasReliability(){},recordCanvasReliability(){}},ATLAS_COMMUNITIES:{startReliability(){throw Error('A stale worker must not start');},startSettings(){throw Error('A stale worker must not start');}}};globalThis.window=window;const policy=startupNavigation();
  for(const [file,parameter]of[['canvas-reliability.mjs','samples'],['canvas-settings.mjs','kind']]){
   policy.baseline();let release,engineCalls=0;const source=readFileSync('scripts/'+file,'utf8'),body=source.match(new RegExp('async function run\\('+parameter+'\\) \\{[\\s\\S]*?\\n\\}'))[0],records=new WeakMap([[visible,{}]]),context={window,graph:visible,activeGraph:visible,records,job:null,generation:0,autoTimer:null,navigationReady,pending:()=>false,pendingMethod:()=>false,draw(){},clearTimeout(){},cancelCanvasSettings(){},method:()=> 'Leiden',loadCommunities:()=>{engineCalls++;return new Promise(resolve=>release=resolve);},analysisErrorMessage:error=>error.message};
   vm.runInNewContext(body,context);const result=context.run(parameter==='samples'?10:'auto');assert.equal(engineCalls,1);policy.begin();release();await result;assert.equal(records.get(visible).running,false);
  }
 }finally{globalThis.window=previous;}
});

test('actual automatic reliability/settings scheduling and queued callbacks recheck startup readiness and current graph',()=>{
 const previous=globalThis.window;
 try{
  const current=graph('visible'),window={location:new URL(savedPath,'http://localhost'),atlasSharedCanvas:{graph:()=>current}};globalThis.window=window;const policy=startupNavigation();
  const reliability=readFileSync('scripts/canvas-reliability.mjs','utf8'),body=reliability.match(/function scheduleQuickCheck\(\) \{([\s\S]*?)\n\}\n\nexport function showCanvasReliability/)[1],schedule=new Function('automaticNavigationAllowed','return function(activeGraph,records,window,settingsValidationState,algorithm,pendingMethod,setTimeout,clearTimeout,run,autoTimer){'+body+'}')(automaticNavigationAllowed);let timers=[],jobs=0;
  const execute=()=>schedule(current,new WeakMap([[current,{}]]),window,()=> 'idle',()=> 'leiden',()=>false,callback=>{timers.push(callback);return timers.length;},()=>{},()=>jobs++,null);
  execute();assert.equal(timers.length,0);policy.baseline();execute();assert.equal(timers.length,1);const token=policy.begin();timers[0]();assert.equal(jobs,0);policy.completed(token);execute();assert.equal(timers.length,1,'completed navigation remains automatic-only paused');
  const hyper={...current,networkModel:'hypergraph',clustering:{algorithm:'hypergraph'}};window.atlasSharedCanvas.graph=()=>hyper;
  const settings=readFileSync('scripts/canvas-settings.mjs','utf8').match(/export function syncCanvasSettings\(next, ids, sourceBundles\) \{[\s\S]*?\n\}\n\nexport function automaticSettingsPending/)[0].split('\n\nexport function automaticSettingsPending')[0].replace('export ',''),context={next:hyper,graph:null,panel:{},records:new WeakMap(),cancelCanvasSettings(){},draw(){},pending:()=>false,automaticSettingsPending,automaticNavigationAllowed,window,setTimeout:callback=>{timers.push(callback);},run:()=>jobs++};
  vm.runInNewContext(settings+';syncCanvasSettings(next,[],[]);',context);assert.equal(timers.length,1);policy.baseline();context.graph=null;vm.runInNewContext('syncCanvasSettings(next,[],[]);',context);assert.equal(timers.length,2);policy.begin();timers[1]();assert.equal(jobs,0);
 }finally{globalThis.window=previous;}
});


test('deferred automatic panel restoration preserves an early explicit tool after saved installation marks ready',()=>{
 const source=readFileSync('public/conservative-atlas/workspace-shell.js','utf8');
 const body=source.match(/showAutomatic\(id\)\{[^\n]+\},/)[0].slice(0,-1);
 for(const phase of ['pending','waiting','failed','completed','study']){
  const shown=[],context={startupToolChoice:'research',window:{ATLAS_STARTUP_NAVIGATION:{state:()=>({phase})}},show:id=>shown.push(id)};
  vm.runInNewContext('this.automatic={'+body+'}.showAutomatic;',context);
  context.automatic(null);assert.deepEqual(shown,['research']);assert.equal(context.startupToolChoice,null);
  context.automatic('projects');assert.deepEqual(shown,['research','projects'],'later automatic navigation is not permanently pinned');
 }
});
