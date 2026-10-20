import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {couplingCanvasGraph} from './shared-canvas.mjs';
import {createScientificManifest} from './scientific-manifest.mjs';
import {prepareCanvasSnapshot} from './saved-canvas.mjs';

const sources=[{id:'s1',title:'Adaptive leadership',references:['r1','r2']},{id:'s2',title:'Leadership learning',references:['r2']}];
const raw=()=>({method:'coupling',sourceCorpusId:'corpus',nodes:sources.map(work=>({...work,cluster:1})),links:[{source:'s1',target:'s2',count:1,strength:1/Math.sqrt(2),references:['r2']}],minimumShared:1,minimumCosine:.05,order:2,networkModel:'pairwise',resolution:.02,clustering:{algorithm:'leiden'},evidenceProvenance:{evidenceId:'pinned-evidence',retrievedAt:'2026-10-19T01:02:03Z',retrieval:{query:'Original unchanged query',pagination:{terminalCursorNull:true}}}});
async function download(current,builder,active=true){let blob;const source=readFileSync('scripts/evidence-explorer.mjs','utf8'),body=source.match(/async function exportEvidence\(\) \{[\s\S]*?\r?\n\}/)[0],context={window:{atlasSharedCanvas:{graph:()=>current,isCoupling:()=>active,studySummary:()=>({corpus_id:'corpus'}),displayState:()=>({hideUnlinked:true})}},dataset:{sourceCorpusId:'corpus',incidenceHash:'pinned-incidence',articles:sources},focusCluster:null,context:{graph:raw()},coupling:builder,couplingRoles:null,couplingStability:null,referenceStability:null,settingsAudit:null,rolesFor:()=>({}),RELIABILITY_RULES:{},createScientificManifest,Blob,URL:{createObjectURL:value=>{blob=value;return 'blob:local';},revokeObjectURL(){}},element:()=>({click(){}}),setTimeout:callback=>callback()};vm.createContext(context);vm.runInContext(body,context);await context.exportEvidence();return JSON.parse(await blob.text());}

test('active coupling export serializes the actual completed canvas and fingerprints that exact selected construction/settings',async()=>{
 for(const clustering of[{algorithm:'leiden',label:'Coupling · Leiden CPM',resolution:.02},{algorithm:'infomap',label:'Coupling · Infomap',markovTime:2},{algorithm:'hypergraph',label:'Coupling · Hypergraph',hypergraphObjective:'quadratic',hypergraphSearch:'leiden-seeded',hypergraphResolution:1}]){
  const builder=raw(),canvas=couplingCanvasGraph(builder);canvas.clustering=clustering;if(clustering.algorithm!=='leiden')canvas.networkModel='hypergraph';canvas.resolution=clustering.algorithm==='leiden'?.02:null;const before=structuredClone(canvas),output=await download(canvas,builder);assert.deepEqual(output.coupling,canvas);assert.deepEqual(canvas,before);assert.equal(output.scientificManifest.evidence.id,'pinned-evidence');assert.equal(output.coupling.clustering.algorithm,clustering.algorithm);assert.equal(output.coupling.networkModel,canvas.networkModel);assert.deepEqual(output.coupling.links,builder.links);
  const snapshot={graph:canvas,controls:{},texts:{},state:{}},restored=prepareCanvasSnapshot(JSON.parse(JSON.stringify(snapshot)),{corpusId:'corpus',completedBrowse:true}),independent=await createScientificManifest(restored.graph,sources);assert.deepEqual(output.scientificManifest.fingerprints,independent.fingerprints);assert.deepEqual(output.scientificManifest.settings,independent.settings);assert.notEqual(output.scientificManifest.fingerprints.analysis,(await createScientificManifest(builder,sources)).fingerprints.analysis);
 }
});

test('non-active linked coupling export retains its explicitly stored builder, rather than misidentifying the displayed reference map',async()=>{
 const builder=raw(),displayed={...raw(),method:'cocitation',canvasKind:'references',clustering:{algorithm:'infomap',label:'Other current view'}},output=await download(displayed,builder,false),expected=await createScientificManifest(builder,sources);assert.deepEqual(output.coupling,builder);assert.deepEqual(output.scientificManifest.fingerprints,expected.fingerprints);assert.deepEqual(output.display,{});
});
