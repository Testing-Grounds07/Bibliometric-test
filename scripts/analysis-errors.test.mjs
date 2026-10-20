import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {analysisError, analysisErrorMessage} from './analysis-errors.mjs';
import {retainCouplingBaseline, reuseCouplingBaseline} from './coupling-install.mjs';
import {inheritEvidenceContext} from './evidence-provenance.mjs';

test('worker failures retain real diagnostics and never expose missing messages as undefined', () => {
 for (const problem of [undefined, null, {}, {message: undefined}, {message: 'undefined'}, 'undefined', new Error('undefined')]) {
  assert.match(analysisErrorMessage(problem), /worker stopped without an error message/);
  assert.match(analysisError(problem).message, /Reload and retry/);
 }
 for (const problem of ['Network stopped', new Error('Network stopped'), {error: new Error('Network stopped')}, {reason:'Network stopped'}]) {
  assert.equal(analysisErrorMessage(problem), 'Network stopped');
  assert.equal(analysisError(problem).message, 'Network stopped');
 }
 const original = new Error('Keep diagnostic');
 assert.equal(analysisError(original), original);
});

test('completed coupling evidence can change methods without cloning or recounting pair evidence', () => {
 const graph = {nodes:[{id:'a',cluster:1},{id:'b',cluster:1}],links:[{source:'a',target:'b',count:3,strength:.5}],clustering:{algorithm:'Leiden CPM'},resolution:.02};
 const settings = {minimumShared:3,minimumCosine:.05,resolution:null};
 const baseline = retainCouplingBaseline(graph, settings);
 graph.nodes[0].cluster = 99;
 const reused = reuseCouplingBaseline(baseline, settings);
 assert.equal(reused.nodes[0].cluster,1);
 assert.equal(reused.links,graph.links);
 reused.nodes[0].cluster = 50;
 assert.equal(reuseCouplingBaseline(baseline,settings).nodes[0].cluster,1);
 for (const changed of [{minimumShared:4},{minimumCosine:.1},{resolution:.02}]) assert.equal(reuseCouplingBaseline(baseline,{...settings,...changed}),null);
 for (const changed of [{clustering:{algorithm:'infomap'}},{networkModel:'hypergraph'},{temporalSelection:{index:0}}]) assert.equal(retainCouplingBaseline({...graph,...changed},settings),null);
});

test('published citation, coupling and history workers serialize string and missing exceptions truthfully', () => {
 for (const filename of ['community-worker.js','evidence-worker.js','historiography-worker.js']) {
  const messages = [], sandbox = {self:{postMessage:message=>messages.push(message)},console};
  vm.runInNewContext(fs.readFileSync('public/conservative-atlas/'+filename,'utf8'),sandbox);
  for (const problem of ['Plain worker failure',undefined]) {
   sandbox.self.onmessage({get data(){throw problem;}});
   assert.equal(typeof messages.at(-1).error,'string');
   assert.match(messages.at(-1).error,problem ? /Plain worker failure/ : /worker stopped without an error message/);
  }
 }
});

test('published community engine rejects message-less native worker errors instead of unresolved jobs', async () => {
 const workers=[],sandbox={window:{},Worker:class{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}},AbortController,console};
 vm.runInNewContext(fs.readFileSync('public/conservative-atlas/community-methods.js','utf8'),sandbox);
 const engine=sandbox.window.ATLAS_COMMUNITIES;
 const graph={nodes:[],links:[]};
 for (const start of [()=>engine.start(graph,'hypergraph',[]),()=>engine.start(graph,'leiden',[],()=>{},{networkModel:'hypergraph'}),()=>engine.startReliability(graph,[],10),()=>engine.startSettings(graph,[])]) {
  const job=start(),worker=workers.at(-1),rejected=assert.rejects(job.promise,/worker stopped without an error message/);
  worker.onerror({type:'error'});
  await rejected;
  assert(worker.terminated);
 }
 const job=engine.start(graph,'hypergraph',[]),rejected=assert.rejects(job.promise,/worker stopped without an error message/);
 workers.at(-1).onmessage({data:{error:undefined}});
 await rejected;
});

test('actual coupling browser method switches reuse the original baseline and retain the previous map on failure', async () => {
 const source=fs.readFileSync('scripts/evidence-explorer.mjs','utf8');
 const body=source.slice(source.indexOf('function buildCoupling('),source.indexOf('function settingsComparison('));
 let algorithm='leiden',networkModel='pairwise',workerRuns=0,retained,installed,fail=false;
 const progress={textContent:''},settings={minimumShared:3,minimumCosine:.05,resolution:null};
 const graph={nodes:[{id:'a',cluster:1},{id:'b',cluster:1}],links:[{source:'a',target:'b',strength:.5,count:3}],clustering:{algorithm:'Leiden CPM'},resolution:.02};
 const sandbox={window:{ATLAS_COMMUNITIES:{start(next,selected){if(fail)return {promise:Promise.reject(undefined)};next.nodes[0].cluster=7;next.clustering={algorithm:selected};return {promise:Promise.resolve(next)};}}},context:{graph:{sourceCorpusId:'test-corpus',evidenceProvenance:{evidenceId:'test-pin'}}},inheritEvidenceContext,document:{getElementById:id=>({value:id==='clusteringMethod'?algorithm:id==='networkModel'?networkModel:'mixed'})},dialog:{querySelector:()=>progress},cancelCanvasReliability(){},draft:{},generation:0,communityJob:null,dataset:{sourceCorpusId:'test-corpus'},settingsAudit:null,coupling:null,couplingBaseline:null,couplingRoles:null,couplingStability:null,retainCouplingBaseline,reuseCouplingBaseline,analysisErrorMessage,connectionRoles:()=>({}),scopeArticles:()=>[],runWorker(request,accept){workerRuns++;accept({graph:structuredClone(graph),roles:{}});},stopWorker(){sandbox.generation++;},loadCommunities:()=>Promise.resolve(),shell(){installed=sandbox.coupling;}};
 vm.runInNewContext(body,sandbox);
 sandbox.buildCoupling(settings);
 assert.equal(workerRuns,1);
 retained=installed;
 algorithm='hypergraph';networkModel='hypergraph';
 await sandbox.buildCoupling(settings,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(workerRuns,1);
 assert.equal(installed.clustering.algorithm,'hypergraph');
 assert.equal(installed.evidenceProvenance.evidenceId,'test-pin');
 assert.equal(retained.nodes[0].cluster,1);
 assert.equal(sandbox.couplingBaseline.graph.nodes[0].cluster,1);
 retained=installed;fail=true;
 algorithm='infomap';
 await sandbox.buildCoupling(settings,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(installed,retained);
 assert.match(progress.textContent,/previous map retained: The analysis worker stopped/);
 assert.doesNotMatch(progress.textContent,/undefined/);
});

test('semantic, collaboration and temporal native failures cannot terminate a newer worker', async () => {
 for (const name of ['semantic-browser','collaboration-browser','temporal-browser']) {
  const source=fs.readFileSync('scripts/'+name+'.mjs','utf8').split(/\r?\n/).find(line=>/function (task|local)\(/.test(line));
  const workers=[],sandbox={window:{},worker:null,generation:1,ticket:1,status:{textContent:'Current result'},analysisErrorMessage,Worker:class{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}}};
  vm.runInNewContext(source,sandbox);
  const start=generation=>name==='temporal-browser'?sandbox.local('temporal-series',{},[],{},generation):sandbox.task({},generation);
  const first=start(1),old=workers[0],rejected=assert.rejects(first,/worker stopped without an error message/);
  sandbox.generation=sandbox.ticket=2;
  const second=start(2),current=workers[1];
  old.onerror({type:'error'});
  await rejected;
  assert.equal(sandbox.worker,current);
  assert.equal(current.terminated,undefined);
  current.onmessage({data:{result:{complete:true}}});
  assert.equal((await second).complete,true);
  const third=start(2),missing=assert.rejects(third,/worker stopped without an error message/);
  workers[2].onmessage({data:{error:undefined}});
  await missing;
 }
});

function functionSource(filename,name) {
 const source=fs.readFileSync(filename,'utf8'),start=source.indexOf('function '+name+'('),opening=source.indexOf(') {',start)+2;
 let depth=1,position=opening+1;
 for(;depth&&position<source.length;position++){if(source[position]==='{')depth++;else if(source[position]==='}')depth--;}
 return source.slice(start,position);
}

test('scientific audit stale events cannot alter successor status, handle or result', async () => {
 const workers=[],sandbox={window:{},analysisErrorMessage,Worker:class{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}}};
 vm.runInNewContext(functionSource('scripts/canvas-science.mjs','workerTask'),sandbox);
 const record={graph:{},sources:[],status:{textContent:'Current job'}};
 const first=sandbox.workerTask(record,'roles'),old=workers[0],rejected=assert.rejects(first,/worker stopped without an error message/);
 const second=sandbox.workerTask(record,'roles'),current=workers[1];
 old.onmessage({data:{progress:'Stale job'}});
 old.onmessage({data:{result:{stale:true}}});
 assert.equal(record.status.textContent,'Current job');
 old.onerror({});await rejected;
 assert.equal(record.worker,current);
 current.onmessage({data:{result:{current:true}}});
 assert.equal((await second).current,true);
 assert.equal(record.worker,null);
});

test('extension error envelopes reject even if their message is missing', async () => {
 const workers=[],sandbox={window:{ATLAS_DATA:{articles:{}}},analysisErrorMessage,Worker:class{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}}};
 vm.runInNewContext(functionSource('scripts/canvas-extensions.mjs','workerTask'),sandbox);
 const job=sandbox.workerTask('partition',{},{}),rejected=assert.rejects(job.promise,/worker stopped without an error message/);
 workers[0].onmessage({data:{error:undefined}});await rejected;
});

test('history native errors expose a retryable canvas failure instead of hidden loading or cancellation', () => {
 const line=fs.readFileSync('scripts/historiography-browser.mjs','utf8').split(/\r?\n/).find(line=>line.includes('worker.onerror ='));
 const nodes={analysisNote:{},status:{}},sandbox={worker:{},generation:1,ticket:1,active:true,graph:null,report:{textContent:''},empty:{replaceChildren(...children){this.children=children;}},analysisErrorMessage,byId:id=>nodes[id],make:(tag,textContent)=>({tag,textContent}),action:(textContent,onclick)=>({textContent,onclick}),build(){},deactivate(){},window:{atlasWorkspaceShell:{refresh(){}}},stop(){sandbox.generation++;sandbox.report.textContent='Cancelled';}};
 vm.runInNewContext(functionSource('scripts/historiography-browser.mjs','historyFailure'),sandbox);
 vm.runInNewContext(line,sandbox);sandbox.worker.onerror({});
 assert.match(sandbox.report.textContent,/Analysis failed: The analysis worker stopped/);
 assert.doesNotMatch(sandbox.report.textContent,/Cancelled/);
 assert.equal(nodes.analysisNote.textContent,sandbox.report.textContent);
 assert.equal(nodes.status.textContent,sandbox.report.textContent);
 assert.equal(sandbox.empty.hidden,false);
 assert(sandbox.empty.children.some(child=>child.textContent==='Retry history'));
 const retained={nodes:[{id:'previous'}]};sandbox.graph=retained;sandbox.empty.hidden=true;
 sandbox.historyFailure('Service unavailable');
 assert.equal(sandbox.graph,retained);assert.equal(sandbox.empty.hidden,true);
 assert.match(sandbox.report.textContent,/Previous completed history retained/);
});

test('history catches synchronous protected-stage and worker construction failures as well as rejected jobs', async () => {
 const failures=[],sandbox={dataset:{articles:[]},active:true,graph:null,generation:0,worker:null,cancel:{hidden:true},report:{},empty:{replaceChildren(){}},make:()=>({}),byId:()=>({}),settingsValue:()=>({}),stop(){sandbox.generation++;},historyFailure:problem=>failures.push(analysisErrorMessage(problem)),original:{currentCorpus:()=>({graph:{}})},window:{BIBLIOMAP:{active:true,stage(){throw 'Authorization changed';}}}};
 vm.runInNewContext('async '+functionSource('scripts/historiography-browser.mjs','build'),sandbox);
 await sandbox.build();assert.equal(failures.at(-1),'Authorization changed');assert.equal(sandbox.worker,null);
 sandbox.window.BIBLIOMAP.stage=()=>({promise:Promise.reject(undefined),cancel(){}});
 await sandbox.build();assert.match(failures.at(-1),/worker stopped without an error message/);assert.equal(sandbox.worker,null);
 sandbox.window.BIBLIOMAP.active=false;sandbox.Worker=class{constructor(){throw Error('Worker could not start');}};
 await sandbox.build();assert.equal(failures.at(-1),'Worker could not start');assert.equal(sandbox.graph,null);
});

test('canvas heading distinguishes failed analyses from computations still running', () => {
 const source=fs.readFileSync('public/conservative-atlas/workspace-shell.js','utf8').split(/\r?\n/).find(line=>line.includes('const next = visibleStatus'));
 for(const [visibleStatus,expected] of [['Analysis failed: No history result was installed.','Analysis did not finish'],['Community analysis failed: Worker stopped.','Analysis did not finish'],['Analyzing direct citations…','Updating this map…'],['','Leiden · 6 works']]){
  const sandbox={visibleStatus,setting:'Leiden',counts:'6 works',info:{}};
  vm.runInNewContext(source+'\nglobalThis.result=next;',sandbox);assert.equal(sandbox.result,expected);
 }
});

test('early project and canvas error handlers remain usable before evidence scripts initialize', () => {
 for(const name of ['app','workspace-projects','multiuser-workspace']){
  const line=fs.readFileSync('public/conservative-atlas/'+name+'.js','utf8').split(/\r?\n/).find(line=>line.startsWith('const errorMessage ='));
  const sandbox={window:{},problem:new Error('Network unavailable')};
  vm.runInNewContext(line+'\nresult=errorMessage(problem);',sandbox);
  assert.equal(sandbox.result,'Network unavailable');
  sandbox.problem=undefined;vm.runInNewContext('result=errorMessage(problem);',sandbox);assert.match(sandbox.result,/request failed/);
 }
});

test('drill error envelopes reject missing messages without installing a result', async () => {
 const line=fs.readFileSync('public/conservative-atlas/app.js','utf8').split(/\r?\n/).find(line=>line.includes('drillCache.set(key,new Promise'));
 const expression=line.slice(line.indexOf('new Promise('),line.lastIndexOf(')'));
 const workers=[],sandbox={errorMessage:analysisErrorMessage,pair:{},level:{members:[]},expandedSource:{bundles:[]},base:{order:2,threshold:10},cap:3,data:{articles:{}},expanded:false,referenceMinimum:5,minimumSupport:5,Worker:class{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}}};
 vm.runInNewContext('job='+expression+';',sandbox);
 const rejected=assert.rejects(sandbox.job,/worker stopped without an error message/);
 workers[0].onmessage({data:{error:undefined}});await rejected;
 assert(workers[0].terminated);
});

test('trial errors with missing messages remain failed rather than being installed or mislabeled as display errors', () => {
 let installations=0;
 const workers=[],sandbox={window:{ATLAS_EVIDENCE:{cancelCanvasReliability(){}}},analysisErrorMessage,settings:()=>({}),graphForForm:()=>({}),data:{articles:{},bundlesByScope:{10:[]}},scope:{value:10},orders:{value:2},ticket:0,worker:null,busy(){},status:{textContent:''},shell:{show(){}},install(){installations++;},Worker:class{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}}};
 vm.runInNewContext(functionSource('scripts/trial-canvas.mjs','run'),sandbox);
 sandbox.run();workers[0].onmessage({data:{error:undefined}});
 assert.equal(installations,0);
 assert.match(sandbox.status.textContent,/Trial failed: The analysis worker stopped/);
 assert.doesNotMatch(sandbox.status.textContent,/could not be displayed|undefined/);
});
