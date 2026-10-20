import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {inheritEvidenceContext,immutableEvidenceContext} from './evidence-provenance.mjs';
import {createScientificManifest} from './scientific-manifest.mjs';
import {applyCommunityResult} from './community-methods.mjs';
import {materializeSetting} from './method-settings.mjs';
import {couplingCanvasGraph} from './shared-canvas.mjs';
import {prepareCanvasSnapshot} from './saved-canvas.mjs';
import {buildSemanticGraph} from './semantic-network.mjs';
import {buildCollaborationGraph} from './collaboration-networks.mjs';
import {buildTemporalSeries} from './temporal-series.mjs';

const pin=()=>({evidenceId:'known-pin',retrievedAt:'2026-10-19T01:02:03Z',retrieval:{query:'unchanged query',paginationAudit:{terminalCursorNull:true,rawRows:6203}},completeness:'Recorded terminal cursor; metadata completeness unknown.',versions:{algorithm:'parent-citation-solver',semantic:'parent-embedding'},textVersions:{evidence:'pinned-retained-text',embedding:'parent-derived-model'}});
const parent=()=>({sourceCorpusId:'corpus',externalCorpus:true,evidenceProvenance:pin(),scientificManifest:{fingerprints:{analysis:'parent-analysis'}},scienceAudit:{null:{status:'completed'}}});
const target=()=>({canvasKind:'coupling',method:'coupling',nodes:[{id:'source',title:'Retained source',references:['ref'],cluster:1}],links:[],clustering:{algorithm:'leiden'},scopeSourceIds:['source']});

test('fresh derivatives inherit only independently cloned immutable evidence pins and retain their subset and solver definition',async()=>{
 const original=parent(),before=structuredClone(original),graph=inheritEvidenceContext(target(),original,'corpus');assert.equal(graph.sourceCorpusId,'corpus');assert(graph.externalCorpus);assert.deepEqual(graph.scopeSourceIds,['source']);assert.equal(graph.scienceAudit,undefined);assert.equal(graph.scientificManifest,undefined);assert.equal(graph.evidenceProvenance.versions,undefined);assert.deepEqual(graph.evidenceProvenance.textVersions,{evidence:'pinned-retained-text'});
 const manifest=await createScientificManifest(graph,[{id:'source',title:'Retained source',references:['ref']}]);assert.equal(manifest.evidence.id,'known-pin');assert.deepEqual(manifest.evidence.retrieval,pin().retrieval);assert.equal(manifest.evidence.retrievedAt,pin().retrievedAt);graph.evidenceProvenance.retrieval.paginationAudit.rawRows=1;assert.deepEqual(original,before);
});

test('scope and conflicting pins fail closed, unknown historic baseline stays unknown, manifest fallback does not copy solver/audits',()=>{
 for(const [graph,source,id]of[[target(),parent(),'other'],[{...target(),sourceCorpusId:'other'},parent(),'corpus'],[target(),{...parent(),sourceCorpusId:undefined},'corpus'],[{...target(),sourceCorpusId:'corpus',evidenceProvenance:{...pin(),evidenceId:'wrong'}},parent(),'corpus'],[{...target(),sourceCorpusId:'corpus',evidenceProvenance:{...pin(),retrieval:{query:'different'}}},parent(),'corpus']])assert.throws(()=>inheritEvidenceContext(graph,source,id));
 const historical={sourceCorpusId:'corpus',scientificManifest:{evidence:{id:'known-pin',retrievedAt:null,retrieval:null,completeness:'Unknown'},versions:{algorithm:'old'},dependencies:{textVersions:{evidence:'old-text',model:'old-model'}}}};
 assert.throws(()=>inheritEvidenceContext({...target(),sourceCorpusId:'corpus',evidenceProvenance:{...pin(),textVersions:{evidence:'different-retained-text'}}},parent(),'corpus'),/different retained evidence-text revision/);
 const graph=inheritEvidenceContext(target(),historical,'corpus');assert.deepEqual(graph.evidenceProvenance,{evidenceId:'known-pin',retrievedAt:null,retrieval:null,completeness:'Unknown',textVersions:{evidence:'old-text'}});assert.equal(inheritEvidenceContext(target(),{},'baseline').evidenceProvenance,undefined);assert.equal(immutableEvidenceContext({}),null);
});

test('actual coupling installer and history worker callback transfer the same verified pin before drawing, without parent audit reuse',async()=>{
 const evidence=readFileSync('scripts/evidence-explorer.mjs','utf8'),history=readFileSync('scripts/historiography-browser.mjs','utf8'),pinParent=parent(),result={graph:target(),roles:{}};let draws=0;
 const install=evidence.match(/ const install = async result => \{[\s\S]*?\r?\n \};/)[0];let installed=0;const context={window:{ATLAS_STARTUP_NAVIGATION:{installed:()=>installed++}},generation:1,networkModel:'pairwise',algorithm:'leiden',evidenceParent:pinParent,sourceCorpusId:'corpus',inheritEvidenceContext,dataset:{deduplication:{},sourceCorpusId:'corpus'},settingsAudit:null,settings:{},dialog:{querySelector:()=>({})},coupling:null,couplingRoles:null,couplingStability:null,shell:()=>draws++,analysisErrorMessage:problem=>problem.message};vm.createContext(context);vm.runInContext(install+';this.install=install;',context);await context.install(result);assert.equal(context.coupling.evidenceProvenance.evidenceId,'known-pin');assert.equal(draws,1);assert.equal(installed,1);assert.equal(context.coupling.scienceAudit,undefined);
 const callback=history.match(/worker\.onmessage = event => \{[\s\S]*?\r?\n \};/)[0],historyContext={generation:1,dataset:context.dataset,inheritEvidenceContext,worker:{terminate(){}},active:true,ticket:1,cancel:{},graph:null,original:{currentCorpus:()=>({graph:pinParent})},parentSnapshot:null,event:null,selected:null,selectedEdge:null,hovered:null,view:{},install:()=>draws++,historyFailure:problem=>{throw problem;},window:{dispatchEvent(){}},CustomEvent};vm.createContext(historyContext);vm.runInContext(callback,historyContext);historyContext.worker.onmessage({data:{result:{...target(),method:'direct_citation',canvasKind:'historiography'}}});assert.equal(historyContext.graph.evidenceProvenance.evidenceId,'known-pin');assert.deepEqual(historyContext.graph.evidenceProvenance.retrieval,pin().retrieval);assert.equal(draws,2);
});

test('verified coupling evidence survives real canvas/settings/method transformations and saved snapshot reopening without copied analysis fingerprints',async()=>{
 const sources=[{id:'source',title:'Adaptive leadership',references:['ref'],year:2020}],graph=inheritEvidenceContext(target(),parent(),'corpus'),canvas=couplingCanvasGraph(graph),changed=applyCommunityResult(canvas,{algorithm:'infomap',memberships:{source:1},markovTime:1}),configured=materializeSetting(changed,{algorithm:'leiden',settings:{resolution:.03},partition:{memberships:{source:1}}});
 const snapshot={graph:configured,controls:{},state:{},texts:{},reference:{graph:{...graph,method:'cocitation'},controls:{},state:{},texts:{}}},restored=prepareCanvasSnapshot(JSON.parse(JSON.stringify(snapshot)),{corpusId:'corpus',completedBrowse:true});
 for(const current of[graph,canvas,changed,configured,restored.graph,restored.reference.graph]){const manifest=await createScientificManifest(current,sources);assert.equal(manifest.evidence.id,'known-pin');assert.equal(manifest.evidence.retrievedAt,pin().retrievedAt);assert.deepEqual(manifest.evidence.retrieval,pin().retrieval);assert.equal(current.scienceAudit,undefined);assert.notEqual(manifest.fingerprints.analysis,'parent-analysis');}assert.equal(configured.resolution,.03);assert.equal(configured.clustering.algorithm,'leiden');assert.equal(configured.evidenceProvenance.versions,undefined);
});

test('semantic, collaboration and publication-window derivatives retain verified source pins while owning independent constructions',async()=>{
 const sources=[{id:'source',title:'Adaptive leadership learning',references:['ref'],year:2020,authorships:[{author:{id:'https://openalex.org/A1',display_name:'Author one'}},{author:{id:'https://openalex.org/A2',display_name:'Author two'}}]}],graph=inheritEvidenceContext({...target(),minimumShared:1,minimumCosine:0,resolution:.02,networkModel:'pairwise',order:2},parent(),'corpus'),context={sourceCorpusId:'corpus',externalCorpus:true,evidenceProvenance:graph.evidenceProvenance};
 const semantic=await buildSemanticGraph(sources,{kind:'terms',minimumSupport:1},null,context),collaboration=await buildCollaborationGraph(sources,{kind:'author',minimumPublications:1},context),series=await buildTemporalSeries(graph,sources,{from:2020,to:2020,width:1,step:1});for(const current of[semantic,collaboration,series.windows[0].graph]){assert.equal(current.evidenceProvenance.evidenceId,'known-pin');assert.equal(current.evidenceProvenance.retrievedAt,pin().retrievedAt);assert.equal(current.scientificManifest,undefined);}assert.equal(semantic.semantic.kind,'terms');assert.equal(collaboration.collaboration.kind,'author');
});
