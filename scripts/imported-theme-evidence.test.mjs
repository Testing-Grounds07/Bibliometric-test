import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {strictSourceText,importedTextInput,bindImportedThemes,validateImportedCache,importedThemeBinding} from './imported-theme-evidence.mjs';
import {descriptionsAllowed,automaticDescriptionsAllowed} from './description-policy.mjs';
import {descriptionRequest} from './cluster-description-core.mjs';
import {createStartupNavigation} from './startup-navigation.mjs';
const corpusId='12345678-1234-1234-1234-123456789abc';
async function fixture(){
 const articles=[{id:'W1',title:'Leadership practice',abstract_inverted_index:'{"Leadership":[0],"practice":[1]}'},{id:'W2',title:'Shared leadership',abstract_inverted_index:{Shared:[0],leadership:[1]}},{id:'W3',title:'Isolated source',abstract_inverted_index:{Gapped:[2]}}],input=await importedTextInput(corpusId,articles),graph={_backend:'independent-bnr-standalone',importedStandalone:{objective:'modularity'},sourceCorpusId:corpusId,canvasKind:'coupling',linkedBrowse:true,nodes:[{id:'W1',cluster:1,engineCommunity:9},{id:'W2',cluster:1,engineCommunity:9},{id:'W3',cluster:0,engineCommunity:5}],links:[{source:'W1',target:'W2',weight:.5}],clustering:{algorithm:'leiden',objective:'modularity',seed:11,iterations:10}},data={sourceCorpusId:corpusId,model:'pinned-minilm',revision:'a'.repeat(40),dimensions:384,importedSourceText:input.importedSourceText,documents:Object.fromEntries(input.documents.map(document=>[document.id,{...document,embedding:Buffer.alloc(384,1).toString('base64'),phrases:[{text:document.title.toLowerCase(),semantic:.8,count:1,evidence:[{field:'title',start:0,end:Array.from(document.title).length}]}]}]))},packet={corpusId,evidence:{sourceCorpusId:corpusId,articles}};
 return{articles,input,graph,data,packet};
}

test('strict source text parses retained JSON strings but never repairs gapped, duplicate or malformed abstracts',()=>{
 assert.equal(strictSourceText({title:'T',abstract_inverted_index:'{"μ":[0],"😀":[1]}'}).abstract,'μ 😀');
 for(const value of ['{bad',[],{a:[1]},{a:[0],b:[0]},{a:[true]},{a:[-1]},{a:[.5]}]){const result=strictSourceText({title:'Retained title',abstract_inverted_index:value});assert.equal(result.title,'Retained title');assert.equal(result.abstract,'');assert.match(result.abstractStatus,/omitted/);}
 assert.equal(strictSourceText({id:'W1',title:'W1'}).title,'');
});

test('verified current keyword overlay binds every source text without changing analytical evidence or membership',async()=>{
 const f=await fixture(),before=JSON.stringify(f.graph);assert.equal(f.input.importedSourceText.coverage.omittedInvalidAbstracts,1);assert.equal(f.input.documents[2].abstract,'');
 await bindImportedThemes(f.graph,f.data,f.packet);assert(importedThemeBinding(f.graph));assert.equal(descriptionsAllowed(f.graph),true);assert.equal(descriptionsAllowed(f.graph,{active:true,canCompute:true}),false,'no unauthenticated fallback for private evidence');
 const request=descriptionRequest(f.graph,'1',corpusId);assert.deepEqual(request.nodes,[{id:'W1',cluster:'1'},{id:'W2',cluster:'1'}]);assert.equal(request.importedTextBinding.textSha256,f.input.importedSourceText.textSha256);assert.equal(JSON.stringify(f.graph),before);assert.equal(descriptionsAllowed({...f.graph}),false,'copied/persisted approval flags cannot authorize a different graph object');
});

test('wrong corpus, text, model, foreign IDs, unsupported representations and forged keyword spans reject',async()=>{
 for(const mutate of[f=>f.data.sourceCorpusId='other',f=>f.data.documents.W1.abstract='Invented abstract',f=>delete f.data.importedSourceText,f=>f.data.revision='floating-main',f=>f.data.documents.W1.phrases[0].evidence[0].end=999,f=>f.data.documents.W1.phrases[0].text='invented phrase',f=>f.data.documents.W1.phrases[0].text=' ',f=>f.data.documents.W1.phrases[0].evidence=[],f=>f.graph.nodes.push({id:'FOREIGN',cluster:1}),f=>f.graph.semantic={kind:'terms'},f=>{f.graph.semantic={};f.graph.entityKind='term';}]){const f=await fixture();mutate(f);await assert.rejects(bindImportedThemes(f.graph,f.data,f.packet));assert.equal(importedThemeBinding(f.graph),null);}
});

test('model service verifies cache/text bindings, and source-cache or complete positive membership changes invalidate browser keys',async()=>{
 const f=await fixture();await bindImportedThemes(f.graph,f.data,f.packet);const first=descriptionRequest(f.graph,'1',corpusId),service=readFileSync('scripts/cluster-description-service.mjs','utf8'),canonical=service.slice(service.indexOf('async function canonicalRequest('),service.indexOf('\nasync function generate(')),context={validateImportedCache};vm.runInNewContext(canonical,context);const dataset={data:f.data,registry:f.input,ids:new Set(f.input.sourceIds)};
 const accepted=await context.canonicalRequest(first,dataset);assert.equal(accepted.importedTextBinding.cacheProjectionSha256,first.importedTextBinding.cacheProjectionSha256);await assert.rejects(context.canonicalRequest({...first,importedTextBinding:{...first.importedTextBinding,textSha256:'b'.repeat(64)}},dataset));const absent={...first};delete absent.importedTextBinding;await assert.rejects(context.canonicalRequest(absent,dataset));
 f.data.revision='b'.repeat(40);await assert.rejects(context.canonicalRequest(first,dataset));await bindImportedThemes(f.graph,f.data,f.packet);const next=descriptionRequest(f.graph,'1',corpusId);assert.notEqual(JSON.stringify(first),JSON.stringify(next));f.graph.nodes[1].cluster=2;assert.notEqual(JSON.stringify(next),JSON.stringify(descriptionRequest(f.graph,'1',corpusId)));
});

test('verified imported saved maps use the ordinary automatic queue without a naming click, and cancel on map changes',async()=>{
 const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};let calls=0,cancelled=0;const node=()=>({children:[],append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},setAttribute(){},isConnected:true});
 try{globalThis.window={ATLAS_DATA:{summary:{corpus_id:corpusId}}};globalThis.document={getElementById:()=>null,createElement:node};globalThis.fetch=(url,options)=>{calls++;assert.equal(JSON.parse(options.body).importedTextBinding.corpusId,corpusId);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{cancelled++;reject(Error('cancelled'));},{once:true}));};await import('./canvas-descriptions.mjs?imported=bound');const f=await fixture();await bindImportedThemes(f.graph,f.data,f.packet);f.graph.themeDescriptions={1:{heading:'Keywords'}};const api=window.ATLAS_DESCRIPTIONS;api.prepare(f.graph,()=>{});api.mount(node(),f.graph,'1',()=>{});assert.equal(calls,1,'bound current graph starts ordinary automatic queue');api.sync({...f.graph});await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1);assert.equal(calls,1);
 }finally{globalThis.window=previous.window;globalThis.document=previous.document;globalThis.fetch=previous.fetch;}
});


test('actual imported loader reapplies keywords on same-object restoration and an older read cannot remove a newer in-flight read',async()=>{
 const f=await fixture(),app=readFileSync('public/conservative-atlas/app.js','utf8'),loader=app.slice(app.indexOf('function requestImportedThemes(){'),app.indexOf('function requestCouplingThemes(){')),loads=new WeakMap();let fetches=0;
 const context={graph:f.graph,externalPacket:f.packet,importedThemeLoads:loads,sourceThemeMap:()=>true,window:{ATLAS_EVIDENCE:{bindImportedThemes,importedThemeBinding,clearImportedThemes:()=>{}},ATLAS_THEMES:{describe:()=>({1:{heading:'Bound source keywords'}})}},sourceThemeData:null,sourceThemeLoading:null,themeError:'',clusterListGraph:null,state:{selected:null,selectedEdge:null},render(){},renderClusterList(){},overview(){},fetch:async()=>{fetches++;return new Response(JSON.stringify(f.data),{status:200});}};
 vm.runInNewContext(loader,context);await context.requestImportedThemes();assert(context.sourceThemeData);assert.equal(loads.has(f.graph),false);context.sourceThemeData=null;context.graph={};context.graph=f.graph;await context.requestImportedThemes();assert(context.sourceThemeData,'same graph object receives source cache again');assert.equal(fetches,2);
 const reads=[];context.fetch=()=>new Promise(resolve=>reads.push(()=>resolve(new Response(JSON.stringify(f.data),{status:200}))));context.sourceThemeData=null;const old=context.requestImportedThemes();context.graph={};reads[0]();await old;assert.equal(context.sourceThemeData,null);assert.equal(loads.has(f.graph),false);context.graph=f.graph;
 const first=context.requestImportedThemes();loads.delete(f.graph);const newer=context.requestImportedThemes();assert.equal(reads.length,3);reads[1]();await first;assert.equal(loads.get(f.graph),newer,'old finally must preserve newer pending ownership');reads[2]();await newer;assert(context.sourceThemeData);assert.equal(loads.has(f.graph),false);
});


test('keyword-before-ready and ready-before-keyword orders start only the exact imported target automatically',async()=>{
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch},tick=()=>new Promise(resolve=>setImmediate(resolve)),node=()=>({children:[],append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},setAttribute(){},isConnected:true});
 try{for(const order of['keywords-first','ready-first','direct-saved-button','ready-then-pending']){const f=await fixture(),listeners=[],calls=[];let displayed=f.graph;
  globalThis.window={ATLAS_DATA:{summary:{corpus_id:corpusId}},atlasSharedCanvas:{graph:()=>displayed},addEventListener:(name,fn)=>{if(name==='atlas:navigation-state')listeners.push(fn);}};const policy=createStartupNavigation('/conservative-atlas/projects/'+corpusId,()=>listeners.forEach(fn=>fn()));window.ATLAS_STARTUP_NAVIGATION=policy;globalThis.document={getElementById:()=>null,createElement:node};globalThis.fetch=(url,options)=>{calls.push(JSON.parse(options.body));return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));};await import('./canvas-descriptions.mjs?automatic-order='+order);const api=window.ATLAS_DESCRIPTIONS;f.graph.themeDescriptions={1:{heading:'Bound source keywords'}};
  if(order==='keywords-first'){await bindImportedThemes(f.graph,f.data,f.packet);api.prepare(f.graph,()=>{});assert.equal(calls.length,0);const token=policy.begin();policy.completed(token);await tick();assert.equal(calls.length,1);}
  if(order==='ready-first'){const token=policy.begin();policy.completed(token);await tick();api.prepare(f.graph,()=>{});assert.equal(calls.length,0,'unverified cache cannot name');await bindImportedThemes(f.graph,f.data,f.packet);api.prepare(f.graph,()=>{});assert.equal(calls.length,1);}
  if(order==='direct-saved-button'){await bindImportedThemes(f.graph,f.data,f.packet);api.prepare(f.graph,()=>{});assert.equal(calls.length,0);policy.saved();const next={...f.graph,nodes:[...f.graph.nodes]};displayed=next;api.sync(next);await tick();assert.equal(calls.length,0,'synchronous ready for old map must not dispatch before new install');await bindImportedThemes(next,f.data,f.packet);api.prepare(next,()=>{});assert.equal(calls.length,1);}
  if(order==='ready-then-pending'){await bindImportedThemes(f.graph,f.data,f.packet);api.prepare(f.graph,()=>{});policy.saved();const token=policy.begin();await tick();assert.equal(calls.length,0,'new pending navigation invalidates deferred ready retry');policy.completed(token);await tick();assert.equal(calls.length,1);}
  policy.saved();policy.saved();await tick();assert.equal(calls.length,1,'repeated readiness must preserve an existing in-flight cluster request');
  assert.equal(calls[0].corpusId,corpusId);assert.deepEqual(calls[0].nodes,[{id:'W1',cluster:'1'},{id:'W2',cluster:'1'}]);assert(calls[0].importedTextBinding.cacheProjectionSha256);api.sync({});await tick();}
 }finally{globalThis.window=saved.window;globalThis.document=saved.document;globalThis.fetch=saved.fetch;}
});

test('pending, failed, stale-map, temporal, private and feature contexts never gain imported automatic naming permission',async()=>{
 const saved=globalThis.window;
 try{const f=await fixture();await bindImportedThemes(f.graph,f.data,f.packet);let current=f.graph;const policy=createStartupNavigation('/conservative-atlas/projects/'+corpusId);globalThis.window={ATLAS_STARTUP_NAVIGATION:policy,atlasSharedCanvas:{graph:()=>current}};assert.equal(automaticDescriptionsAllowed(f.graph),false);const token=policy.begin();policy.failed(token);assert.equal(automaticDescriptionsAllowed(f.graph),false);policy.saved();assert.equal(automaticDescriptionsAllowed(f.graph),true);current={};assert.equal(automaticDescriptionsAllowed(f.graph),false);current=f.graph;assert.equal(automaticDescriptionsAllowed(f.graph,{active:true,canCompute:true}),false);for(const extra of[{temporalSelection:{index:0}},{temporalSeries:{windows:[]}},{semantic:{},entityKind:'term'}]){Object.assign(f.graph,extra);assert.equal(automaticDescriptionsAllowed(f.graph),false);for(const key of Object.keys(extra))delete f.graph[key];}
 }finally{globalThis.window=saved;}
});
