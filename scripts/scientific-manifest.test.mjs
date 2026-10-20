import test from 'node:test';
import assert from 'node:assert/strict';
import {createScientificManifest, evidenceCoverage, methodSupport, pinnedEvidenceProvenance} from './scientific-manifest.mjs';
import {buildHistoriography} from './historiography.mjs';

const graph = () => ({nodes: [{id: 'a', articles: ['s2', 's1'], cluster: 1, x: 5}, {id: 'b', articles: ['s1'], cluster: 1}], links: [{source: 'a', target: 'b', count: 1, strength: .5}], clustering: {algorithm: 'leiden'}, resolution: .02});
const records = [{id: 's1', title: 'A real title', references: ['a', 'b'], year: 2020}, {id: 's2', references: ['a']}];

test('scientific fingerprints ignore layout, ordering and display but preserve evidence, weights and membership', async () => {
 const first = await createScientificManifest(graph(), records), changed = graph();
 changed.nodes.reverse(); changed.nodes[0].x = 50; changed.hiddenClusters = [1]; changed.links[0] = {...changed.links[0], source: 'b', target: 'a'};
 const second = await createScientificManifest(changed, [...records].reverse());
 assert.deepEqual(first.fingerprints, second.fingerprints);
 changed.nodes[0].cluster = 2;
 const partition = await createScientificManifest(changed, records);
 assert.equal(first.fingerprints.network, partition.fingerprints.network);
 assert.notEqual(first.fingerprints.analysis, partition.fingerprints.analysis);
 changed.links[0].strength = .25;
 assert.notEqual(first.fingerprints.network, (await createScientificManifest(changed, records)).fingerprints.network);
});

test('evidence and text changes identify different dependencies', async () => {
 const first = await createScientificManifest(graph(), records), next = structuredClone(records); next[0].title = 'Another title';
 const second = await createScientificManifest(graph(), next);
 assert.equal(first.fingerprints.evidence, second.fingerprints.evidence); assert.equal(first.fingerprints.network, second.fingerprints.network); assert.notEqual(first.fingerprints.text, second.fingerprints.text);
 next[0].references.push('c'); assert.notEqual(first.fingerprints.evidence, (await createScientificManifest(graph(), next)).fingerprints.evidence);
 const reference = graph(); reference.nodes[0].title = 'New reference title';
 const changedReference = await createScientificManifest(reference, records);
 assert.notEqual(first.fingerprints.text, changedReference.fingerprints.text); assert.equal(first.fingerprints.network, changedReference.fingerprints.network);
});

test('coverage distinguishes available metadata from unknown completeness and author diagnostics', () => {
 const coverage = evidenceCoverage([{id: 'a', title: 'Title', references: [], authors_count: 120, authorships: Array(100).fill({})}, {id: 'b', references: ['r']}]);
 assert.equal(coverage.withReferences, 1); assert.equal(coverage.potentiallyTruncatedAuthorships, 1); assert.equal(coverage.authorCountKnown, 1); assert.match(coverage.referenceCompleteness, /Unknown/);
});
test('both direct manifest export and shared-canvas export preserve restored pinned provenance',async()=>{
 const input=graph(),context={evidenceId:'pinned-evidence-checksum',retrievedAt:'2026-10-17T12:00:00Z',retrieval:{query:'Synthetic leadership evidence',fields:['id','referenced_works']},completeness:'Recorded cursor exhausted',versions:{algorithm:'implementation-hash'},textVersions:{model:'pinned-model-revision'}};
 input.scientificManifest=await createScientificManifest(input,records,context);
 const direct=await createScientificManifest(input,records,{}),canvas=await createScientificManifest(input,records,{evidenceId:input.scientificManifest.evidence.id,retrievedAt:input.scientificManifest.evidence.retrievedAt,retrieval:input.scientificManifest.evidence.retrieval,versions:input.scientificManifest.versions});
 for(const exported of [direct,canvas]){assert.deepEqual(exported.evidence,input.scientificManifest.evidence);assert.deepEqual(exported.versions,context.versions);assert.deepEqual(exported.dependencies.textVersions,context.textVersions);assert.deepEqual(exported.fingerprints,input.scientificManifest.fingerprints);}
});
test('authoritative pinned evidence repairs absent client context without inventing an import query',async()=>{
 const input=graph();input.scientificManifest={evidence:{id:null,retrievedAt:null,retrieval:null},versions:{}};
 input.evidenceProvenance=pinnedEvidenceProvenance({retrievedAt:'2026-10-17T12:00:00Z',exhausted:true,metadataPolicy:'fixture'},'pinned-hash',{implementation:'known'},{});
 const exported=await createScientificManifest(input,records);assert.equal(exported.evidence.id,'pinned-hash');assert.equal(exported.evidence.retrievedAt,'2026-10-17T12:00:00Z');assert.match(exported.evidence.completeness,/cursor exhausted/);assert.equal(exported.evidence.retrieval.acquisition,'Imported pinned evidence');assert.match(exported.evidence.retrieval.originalSearchSpecification,/Not recorded/);
});

test('registry fails closed for unknown methods and incompatible score/model combinations', () => {
 assert.equal(methodSupport({clustering: {algorithm: 'invented'}}).supported, false);
 assert.equal(methodSupport({}).supported, false);
 assert.equal(methodSupport({networkModel: 'hypergraph', clustering: {algorithm: 'sbm'}}).supported, false);
 assert.equal(methodSupport({directed: true, clustering: {algorithm: 'invented'}}).algorithm, 'direct_citation');
 assert.equal(methodSupport({clustering: {algorithm: 'trial'}, trial: {result: {family: 'invented'}}}).supported, false);
 assert.equal(methodSupport({networkModel:'hypergraph',clustering:{algorithm:'hypergraph',hypergraphSearch:'invented'}}).supported,false);
 assert.equal(methodSupport({networkModel:'higher-order',clustering:{algorithm:'leiden'}}).representation,'higher-order');
 assert.equal(methodSupport(buildHistoriography([{id:'a',references:[],year:2020}])).supported,true);
});


test('retained standalone Leiden modularity manifests preserve executed settings without claiming native CPM capabilities',async()=>{
 const imported={...graph(),_backend:'independent-bnr-standalone',networkModel:'pairwise',order:2,importedStandalone:{study_id:'frozen-study',map_key:'retained-map',objective:'modularity'},clustering:{algorithm:'leiden',objective:'modularity',seed:11,iterations:10}};
 imported.construction={method:'bibliographic_coupling',normalization:'cosine'};
 const original=JSON.stringify(imported),manifest=await createScientificManifest(imported,records);
 assert.match(manifest.construction.rawSupportMeaning,/Distinct shared references/);
 const semantic={...imported,method:'semantic',canvasKind:'semantic',construction:{method:'semantic_embeddings'},links:imported.links.map(edge=>({...edge,rawSupport:null,strength:.75}))};const textManifest=await createScientificManifest(semantic,records);assert.match(textManifest.construction.rawSupportMeaning,/rawSupport is null/);assert.match(textManifest.construction.rawSupportMeaning,/MiniLM cosine/);assert.match(textManifest.construction.rawSupportMeaning,/not citation/);
 for(const [key,value]of Object.entries({algorithm:'leiden',score:'Modularity',objective:'modularity',label:'Imported Leiden modularity',seed:11,iterations:10,execution:'retained-standalone-import',nativeRecomputation:false,evidenceResampling:false,marginNull:false}))assert.equal(manifest.method[key],value,key);
 assert.equal(manifest.settings.objective,'modularity');assert.equal(manifest.settings.seed,11);assert.equal(manifest.settings.iterations,10);assert.equal(JSON.stringify(imported),original);
 imported.scientificManifest={...manifest,method:{...manifest.method,score:'CPM'}};const repaired=await createScientificManifest(imported,records);assert.equal(repaired.method.score,'Modularity');assert.deepEqual(repaired.fingerprints,manifest.fingerprints);
 const native=await createScientificManifest(graph(),records);assert.equal(native.method.score,'CPM');assert.equal(native.method.evidenceResampling,true);assert.equal(native.method.execution,undefined);assert.match(native.construction.rawSupportMeaning,/^Distinct supporting records/);
 const absent=methodSupport({...imported,clustering:{algorithm:'leiden',objective:'modularity'}});assert.equal(absent.seed,null);assert.equal(absent.iterations,null);
 for(const extra of [{clustering:{algorithm:'leiden',objective:'CPM'}},{networkModel:'hypergraph'},{directed:true},{order:3},{importedStandalone:{objective:'CPM'}}]){const unsupported=methodSupport({...imported,...extra});assert.equal(unsupported.supported,false);assert.notEqual(unsupported.score,'CPM');}
});
