import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/conservative-atlas/research-library.js','utf8');
const project='12345678-1234-1234-1234-123456789abc',finding='abcdef12-1234-1234-1234-123456789abc';
const file={label:'Read report',url:'ai-research/study/report.html',sha256:'a'.repeat(64)};
const study=(extra={})=>({id:'study-one',title:'Study <script>never executable</script>',summary:'Bounded retained source appraisal.',scope:'Selected evidence, not a representative population.',project_id:project,reports:[file],downloads:[{...file,label:'Review receipt',url:'ai-research/study/review.json'}],maps:[],review:{status:'Qualified with limits',scope:'Literal and agent checks; human expert appraisal remains outstanding.'},...extra});
const manifest=studies=>({schema_version:'bibliomap.standalone-library.v1',studies});
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.dataset={};this.attrs={};this.textContent='';}
 append(...values){this.children.push(...values);}
 replaceChildren(...values){this.children=values;}
 setAttribute(name,value){this.attrs[name]=value;}
 addEventListener(name,callback){this.listeners[name]=callback;}
 set innerHTML(value){throw Error('HTML insertion is forbidden');}
}
const flatten=root=>[root,...root.children.flatMap(flatten)];
function fixture(value){
 const panel=new Element('div'),toggle=new Element('button');toggle.id='tool-ai-studies';const calls=[];let response=value,fail=null;
 const document={createElement:tag=>new Element(tag),getElementById:id=>[toggle,...flatten(panel)].find(n=>n.id===id)||null};
 const window={location:{href:'http://127.0.0.1:8080/conservative-atlas/projects/'+project+'/maps/'+finding},atlasWorkspaceShell:{addTool:(id,label)=>{assert.equal(id,'ai-studies');assert.equal(label,'AI studies');return panel;}},fetch:async(url,options)=>{calls.push({url,options});if(fail)throw Error(fail);return new Response(typeof response==='string'?response:JSON.stringify(response),{status:200});}};
 vm.runInNewContext(source,{window,document,URL,TextDecoder,Uint8Array});
 return{panel,toggle,calls,window,all:()=>flatten(panel),load:()=>window.ATLAS_AI_STUDIES.refresh(),set:value=>response=value,fail:value=>fail=value,status:()=>flatten(panel).find(n=>n.attrs.role==='status').textContent};
}
test('library is lazy, read-only, complete and safe for source-only plus actual map cards',async()=>{
 const f=fixture(manifest([study(),study({id:'with-map',title:'Actual retained map',maps:[{label:'Open retained map',url:'projects/'+project+'/maps/'+finding,node_count:951,edge_count:10891,scope:'Exact retained source-work cosine graph.'}]}),study({id:'third',project_id:null,title:'Source-only follow-up'})]));
 assert.equal(f.calls.length,0);await f.load();assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'GET');assert.equal(f.calls[0].url,'http://127.0.0.1:8080/conservative-atlas/ai-research/library.json');
 assert.equal(f.all().filter(n=>n.tagName==='ARTICLE').length,3);assert.equal(f.all().filter(n=>n.className==='ai-studies-source-only').length,2);
 assert(f.all().some(n=>n.textContent==='Study <script>never executable</script>'));assert(f.all().some(n=>n.textContent.includes('951 nodes · 10,891 edges')));
 assert(f.all().some(n=>n.href==='http://127.0.0.1:8080/conservative-atlas/projects/'+project+'/maps/'+finding));
 assert(f.all().filter(n=>n.tagName==='A').every(n=>n.href.startsWith('http://127.0.0.1:8080/conservative-atlas/')));assert.match(f.status(),/3 retained studies/);
});
test('external, executable, traversal and wrong-kind links fail before any card renders',async()=>{
 for(const url of ['javascript:alert(1)','https://external.invalid/ai-research/report.html','//external.invalid/report','ai-research/../../workspace-api/projects','ai-research/%2e%2e/secret','ai-research/a%2fb','ai-research/a%252fb','ai-research\\escape','data:text/html,hello','http://user:password@127.0.0.1:8080/conservative-atlas/ai-research/report','projects/'+project]){
  const f=fixture(manifest([study({reports:[{...file,url}]})]));await f.load();assert.equal(f.all().filter(n=>n.tagName==='ARTICLE').length,0,url);assert.match(f.status(),/retry|Refresh/);
 }
 const f=fixture(manifest([study({maps:[{label:'Not a project view',url:'ai-research/map.json',node_count:1,edge_count:0,scope:'Raw graph'}]})]));await f.load();assert.equal(f.all().filter(n=>n.tagName==='ARTICLE').length,0);
});
test('manifest shape, exact file identity and truthful map counts are required',async()=>{
 for(const value of [manifest([study(),study()]),manifest([study({reports:[{label:'Missing checksum',url:file.url}]})]),manifest([study({maps:[{label:'Bad counts',url:'projects/'+project+'/map',node_count:-1,edge_count:0,scope:'No fabricated counts'}]})]),{schema_version:'unknown',studies:[]},manifest(Array(51).fill(study()))]){const f=fixture(value);await f.load();assert.equal(f.all().filter(n=>n.tagName==='ARTICLE').length,0);assert.match(f.status(),/Refresh/);}
});
test('failure is visible and retryable, prior successful cards stay intact, manifest bytes are bounded',async()=>{
 const f=fixture(manifest([study()]));await f.load();f.fail('Static server unavailable');await f.load();assert.match(f.status(),/previous library remains visible/);assert.match(f.status(),/Static server unavailable/);assert.equal(f.all().filter(n=>n.tagName==='ARTICLE').length,1);assert.equal(f.all().find(n=>n.tagName==='BUTTON').disabled,false);
 f.fail(null);f.set('x'.repeat(262145));await f.load();assert.match(f.status(),/256 KiB/);f.set(manifest([]));await f.load();assert.match(f.status(),/0 retained studies/);assert(f.all().some(n=>n.textContent.includes('No standalone studies')));
});
test('main page loads the isolated library after the shared shell and uses responsive local styles',()=>{
 const html=readFileSync('public/conservative-atlas/index.html','utf8');assert(html.indexOf('workspace-shell.js')<html.indexOf('research-library.js'));assert.equal((html.match(/src="research-library\.js/g)||[]).length,1);assert(html.includes('research-library.css'));
 const css=readFileSync('public/conservative-atlas/research-library.css','utf8');assert(css.includes('overflow-wrap:anywhere'));assert(css.includes('@media(max-width:480px)'));
 assert(!source.includes('innerHTML'));assert(!source.includes('POST'));assert(!source.includes('computations'));assert(!source.includes('BIBLIOMAP.stage'));
});


test('standalone modularity imports keep their objective/memberships, guard native rebuilding and release ordinary controls',async()=>{
 const roots=[],events={},documentEvents={},calls={rebuild:0,drill:0,model:0,fetch:0,refresh:0,fit:0};
 const nodes=['clusteringMethod','clusteringScore','clusteringSearch','networkModel','cpmSlider','cpmValue','cpmHint','analysisNote','methodTitle'].map(id=>{const e=new Element(id==='clusteringScore'?'select':'input');e.id=id;e.disabled=false;e.title='Native setting';e.textContent=id+' native';return e;});
 const rebuild=new Element('button');rebuild.textContent='Rebuild network';rebuild.disabled=false;nodes.push(rebuild);
 const alreadyDisabled=new Element('input');alreadyDisabled.id='threshold';alreadyDisabled.disabled=true;nodes.push(alreadyDisabled);
 const legacyContext=new Element('p');legacyContext.id='shellContext';legacyContext._nativeText='Leiden · CPM preparing · 1/2 sources shown';let nativeWrites=0;nodes.push(legacyContext);const nativePrototype={};Object.defineProperty(nativePrototype,'textContent',{get(){return this._nativeText;},set(value){this._nativeText=value;nativeWrites++;}});
 const host=new Element('div');host.after=e=>roots.push(e);roots.push(...nodes,host);
 const panel=new Element('div'),toggle=new Element('button');toggle.id='tool-ai-studies';roots.push(panel,toggle);
 Element.prototype.querySelector=function(selector){const match=selector.match(/option\[value="([^"]+)"\]/);return match?flatten(this).find(e=>e.tagName==='OPTION'&&e.value===match[1])||null:null;};
 Element.prototype.closest=function(selector){if(selector==='input,select,button')return ['INPUT','SELECT','BUTTON'].includes(this.tagName)?this:null;return null;};
 Element.prototype.remove=function(){for(const root of roots){const i=root.children.indexOf(this);if(i>=0)root.children.splice(i,1);}};
 const document={createElement:tag=>new Element(tag),getElementById:id=>roots.flatMap(flatten).find(n=>n.id===id)||null,querySelector:selector=>selector==='.map-intro'?host:null,querySelectorAll:()=>roots.flatMap(flatten).filter(e=>['INPUT','SELECT','BUTTON'].includes(e.tagName)),addEventListener:(name,fn)=>documentEvents[name]=fn};
 let graph={method:'coupling',canvasKind:'coupling',_backend:'independent-bnr-standalone',importedStandalone:{study_id:'real-study',map_key:'scenario-1',objective:'modularity',report_url:'ai-research/study/report.html'},clustering:{algorithm:'leiden',objective:'modularity',seed:11,iterations:10},nodes:[{id:'W1',cluster:1},{id:'W2',cluster:0}],links:[]};
 const frozen=JSON.stringify(graph);
 const window={Node:{prototype:nativePrototype},location:{href:'http://127.0.0.1:8080/conservative-atlas/'},atlasWorkspaceShell:{addTool:()=>panel,refresh:()=>calls.refresh++},atlasSharedCanvas:{graph:()=>graph,summary:()=>({algorithm:'leiden',automatic:true}),redraw:()=>calls.fit++,refreshAnalysisControls(){}},ATLAS_CLUSTERING_CONCEPTS:{scoreForAlgorithm:()=>({value:'cpm'}),describe:()=>({scoreTitle:'CPM'}),heading:()=> 'Native CPM clusters'},ATLAS_PROJECTS:{rebuild:async()=>++calls.rebuild,drill:async()=>++calls.drill,setNetworkModel:async()=>++calls.model,isBusy:()=>false},addEventListener:(name,fn)=>events[name]=fn,fetch:async()=>{calls.fetch++;throw Error('Should never fetch while opening import');}};
 vm.runInNewContext(source,{window,document,URL,TextDecoder,Uint8Array,setTimeout});
 const notice=document.getElementById('importedStandaloneNotice');assert(notice&&!notice.hidden);assert.equal(calls.fit,1);assert.equal(document.getElementById('methodTitle').textContent,'Source-article coupling');window.ATLAS_AI_STUDIES.refreshImportedView();events['atlas:map-opened']();assert.equal(calls.fit,1,'observer refresh and repeated event must not reset user camera');assert(flatten(notice).some(e=>e.textContent==='Imported Leiden modularity · seed 11 · 10 iterations'));
 assert.equal(window.atlasSharedCanvas.summary().methodDisplayLabel,'Imported Leiden modularity');assert.equal(window.atlasSharedCanvas.summary().algorithm,'leiden');assert.equal(legacyContext.textContent,'Imported Leiden modularity · 1/2 sources shown');legacyContext.textContent='Leiden · CPM 0.04 · Auto · 1/2 sources shown';const writes=nativeWrites;legacyContext.textContent='Leiden · CPM 0.04 · Auto · 1/2 sources shown';assert.equal(nativeWrites,writes,'same legacy text cannot cause a refresh feedback loop');assert.equal(legacyContext.textContent,'Imported Leiden modularity · 1/2 sources shown');assert.equal(window.ATLAS_CLUSTERING_CONCEPTS.scoreForAlgorithm('leiden').value,'standalone-import');assert.equal(window.ATLAS_CLUSTERING_CONCEPTS.describe(graph).scoreTitle,'Imported Leiden modularity');assert.equal(window.ATLAS_CLUSTERING_CONCEPTS.describe({clustering:{algorithm:'leiden'}}).scoreTitle,'Imported Leiden modularity');assert.equal(window.ATLAS_CLUSTERING_CONCEPTS.heading(graph),'Imported Leiden modularity clusters');
 assert.equal(rebuild.disabled,true);assert.equal(document.getElementById('clusteringMethod').disabled,true);assert.equal(window.ATLAS_PROJECTS.isBusy(),true);
 await window.ATLAS_PROJECTS.rebuild();await window.ATLAS_PROJECTS.drill(1);await window.ATLAS_PROJECTS.setNetworkModel('higher-order');assert.deepEqual([calls.rebuild,calls.drill,calls.model,calls.fetch],[0,0,0,0]);
 let prevented=0,stopped=0;documentEvents.change({target:document.getElementById('clusteringMethod'),preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(JSON.stringify(graph),frozen);
 graph={clustering:{algorithm:'leiden'},nodes:[],links:[]};events['atlas:map-opened']();
 assert.equal(notice.hidden,true);assert.equal(document.getElementById('methodTitle').textContent,'methodTitle native');assert.equal(calls.fit,1,'ordinary map is not fitted by the import adapter');assert.equal(Object.getOwnPropertyDescriptor(legacyContext,'textContent'),undefined);assert.equal(rebuild.disabled,false);assert.equal(document.getElementById('clusteringMethod').disabled,false);assert.equal(alreadyDisabled.disabled,true);assert.equal(window.ATLAS_PROJECTS.isBusy(),false);assert.equal(window.ATLAS_CLUSTERING_CONCEPTS.scoreForAlgorithm('leiden').value,'cpm');assert.equal(window.ATLAS_CLUSTERING_CONCEPTS.describe(graph).scoreTitle,'CPM');assert.equal(window.atlasSharedCanvas.summary().methodDisplayLabel,undefined);await window.ATLAS_PROJECTS.rebuild();assert.equal(calls.rebuild,1);assert.equal(calls.fetch,0);
});


test('actual native theme readers skip unavailable enrichment for frozen imports without mapping cached themes',async()=>{
 const app=readFileSync('public/conservative-atlas/app.js','utf8');
 const panelBody=app.match(/function themePanel\(parent,cluster\)\{[\s\S]*?\n\}/)[0];vm.runInNewContext(panelBody+';themePanel();',{graph:{_backend:'independent-bnr-standalone',importedStandalone:{objective:'modularity'}}});
 for(const name of ['requestThemes','requestCouplingThemes']){
  const body=app.match(new RegExp('function '+name+'\\(\\)\\{[\\s\\S]*?\\n\\}'))[0];let fetched=0,rendered=0;const imported={_backend:'independent-bnr-standalone',importedStandalone:{objective:'modularity'},nodes:[],links:[]},original=JSON.stringify(imported);
  const context={graph:imported,themeError:'',clusterListGraph:{},renderClusterList:()=>rendered++,fetch:()=>{fetched++;throw Error('No fetch permitted');},window:{},Promise};vm.runInNewContext(body+';this.read='+name+';',context);await context.read();assert.equal(fetched,0);assert.equal(rendered,1);assert.match(context.themeError,/Frozen standalone result/);assert.equal(JSON.stringify(imported),original);
 }
});
