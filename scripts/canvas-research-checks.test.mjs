import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {RESEARCH_CHECK_VERSION,runResearchCheck} from './research-check-methods.mjs';
import {researchGraphDigest} from './retained-research-checks.mjs';
import {prepareCanvasSnapshot} from './saved-canvas.mjs';
import {compactSnapshotTransport,hydrateSnapshotTransport,snapshotSourceDigests} from './snapshot-transport.mjs';
import {rebindSnapshotCorpus} from './workspace-projects-core.mjs';
const source=await readFile('scripts/canvas-research-checks.mjs','utf8');
test('actual comparison selection handler ignores an earlier response arriving after a newer selection',async()=>{
 const requests=[],state={comparison:{value:'A'},comparisonTicket:0,choiceTicket:1,boundGraph:{sourceCorpusId:'c'},comparisonGraph:null,base:'http://localhost/conservative-atlas/',URL,progress:{},readiness(){},fetch:url=>new Promise(resolve=>requests.push({url,resolve}))};vm.createContext(state);
 const handler=vm.runInContext('('+source.split('comparison.onchange=')[1].split('\n reference.oninput=')[0].replace(/;\s*$/,'')+')',state);
 const a=handler();state.comparison.value='B';const b=handler();requests[1].resolve({ok:true,json:async()=>({snapshot:{graph:{id:'B'}}})});await b;requests[0].resolve({ok:true,json:async()=>({snapshot:{graph:{id:'A'}}})});await a;assert.equal(state.comparisonGraph.id,'B');
});
test('actual source adapter rejects a corpus mismatch instead of feeding previous project records',async()=>{
 const state={window:{atlasSharedCanvas:{currentCorpus:()=>({corpusId:'other',evidence:{sourceCorpusId:'other',articles:[{id:'old'}]}})}}};vm.createContext(state);const adapter=vm.runInContext('('+source.match(/async function sources\(graph\)\{[\s\S]*?\n \}/)[0]+')',state);await assert.rejects(adapter({sourceCorpusId:'current'}),/does not match/);
});
test('actual worker handler refuses incompatible results and cancellation during final identity check',async()=>{
 const graph={},active={},digest='pinned',result={version:RESEARCH_CHECK_VERSION,kind:'seed',status:'completed',executed:true,variants:[],createdAt:new Date().toISOString(),inputFingerprint:'hash'};
 for(const cancel of[false,true]){let resolveDigest;const state={graph,active,worker:active,boundGraph:graph,digest,publishing:false,input:{kind:'seed'},RESEARCH_CHECK_VERSION,Number,Date,Array,progress:{},researchGraphDigest:()=>new Promise(resolve=>{resolveDigest=resolve;}),readiness(){},renderRuns(){},window:{atlasSharedCanvas:{graph:()=>graph},atlasWorkspaceShell:{refresh(){}}},stop(message){state.worker=null;state.progress.textContent=message;}};vm.createContext(state);const handler=vm.runInContext('('+source.split('active.onmessage=')[1].split('\n  active.onerror=')[0].replace(/;\s*$/,'')+')',state);
  if(!cancel){await handler({data:{result:{...result,kind:'compare'}}});assert.equal(graph.researchCheckRuns,undefined);assert.match(state.progress.textContent,/protocol/);}
  else{state.worker=active;const pending=handler({data:{result}});state.stop('Cancelled.');resolveDigest(digest);await pending;assert.equal(graph.researchCheckRuns,undefined);assert.equal(state.progress.textContent,'Cancelled.');}
 }
});
test('fresh results survive full snapshot compaction, hydration and same-corpus restoration',async()=>{
 const corpusId='c',records=[{id:'https://openalex.org/W1',title:'First',references:[]},{id:'https://openalex.org/W2',title:'Second',references:[]}],graph={sourceCorpusId:corpusId,canvasKind:'coupling',method:'coupling',networkModel:'pairwise',nodes:records.map((r,i)=>({...r,cluster:i+1})),links:[],clustering:{algorithm:'leiden',objective:'modularity'}},digest=await researchGraphDigest(graph),result=await runResearchCheck({kind:'seed',graph,records});graph.researchCheckRuns=[{graph_sha256:digest,result}];
 const snapshot={graph,evidenceCorpusId:corpusId,controls:{},state:{},texts:{}},context={corpusId,evidenceId:corpusId},index=await snapshotSourceDigests(records,context),transport=await compactSnapshotTransport(snapshot,records,index),hydrated=transport.snapshotTransport?await hydrateSnapshotTransport(transport.snapshot,transport.snapshotTransport,records,context):transport.snapshot;
 const restored=prepareCanvasSnapshot(rebindSnapshotCorpus(hydrated,corpusId),{corpusId,completedBrowse:true});assert.equal(await researchGraphDigest(restored.graph),digest);assert.deepEqual(restored.graph.researchCheckRuns,graph.researchCheckRuns);restored.graph.nodes[0].cluster=99;assert.notEqual(await researchGraphDigest(restored.graph),digest);
});
test('actual result publisher refuses a canvas switch inside the sync debounce window',async()=>{
 const graph={},active={},result={version:RESEARCH_CHECK_VERSION,kind:'seed',status:'completed',executed:true,variants:[],createdAt:new Date().toISOString(),inputFingerprint:'hash'};let resolveDigest,current=graph;
 const state={graph,active,worker:active,boundGraph:graph,digest:'same',publishing:false,input:{kind:'seed'},RESEARCH_CHECK_VERSION,Number,Date,Array,progress:{},researchGraphDigest:()=>new Promise(resolve=>{resolveDigest=resolve;}),readiness(){},renderRuns(){},window:{atlasSharedCanvas:{graph:()=>current},atlasWorkspaceShell:{refresh(){}}},stop(message){state.worker=null;state.progress.textContent=message;}};vm.createContext(state);const handler=vm.runInContext('('+source.split('active.onmessage=')[1].split('\n  active.onerror=')[0].replace(/;\s*$/,'')+')',state);
 const pending=handler({data:{result}});current={id:'new-canvas'};resolveDigest('same');await pending;assert.equal(graph.researchCheckRuns,undefined);assert.match(state.progress.textContent,/Map changed/);
});
