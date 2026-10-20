import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSemanticGraph, featureIncidence, embeddingEvidence, preparedSemanticEvidence, commonSourceComparison, semanticSensitivity, citationCrosswalk,semanticSensitivityReport,semanticText} from './semantic-network.mjs';
import {createScientificManifest, scientificInputs, methodSupport} from './scientific-manifest.mjs';
import {prepareReliability} from './network-reliability.mjs';
import {nativeNetwork} from './workspace-projects-core.mjs';

const works = [{id: 'W1', title: 'Adaptive leadership practice', abstract: 'Leadership practice develops shared learning.'}, {id: 'W2', title: 'Adaptive leadership learning', abstract: 'Shared learning develops leadership practice.'}, {id: 'W3', title: 'Clinical practice', abstract: 'Clinical practice develops learning.'}];
const vector = Buffer.from(Array.from({length: 384}, (_, position) => position === 0 ? 100 : 1)).toString('base64');
const cache = {sourceCorpusId: 'corpus', model: 'sentence-transformers/all-MiniLM-L6-v2', revision: '1'.repeat(40), dimensions: 384, encoding: 'signed-int8-base64-unit-vector', textScope: 'Titles and available abstracts', documents: Object.fromEntries(works.map(work => [work.id, {...work, embedding: vector}]))};
test('literal phrase nodes preserve distinct support and normalized literal spans', async () => {
 const result = featureIncidence(works, {minimumSupport: 2});
 const phrase = result.features.find(feature => feature.label === 'leadership practice'); assert.equal(phrase.support.length, 2);
 assert.equal(phrase.evidence.W1.excerpt, 'leadership practice');
 const graph = await buildSemanticGraph(works, {minimumSupport: 2}); assert.equal(graph.entityKind, 'term'); assert.ok(graph.nodes.every(node => node.id.startsWith('term:'))); assert.ok(graph.links.every(edge => edge.count === edge.articles.length && edge.rawSupport === edge.strength));
});
test('topic classifier confidence weights stay separate from distinct source support', async () => {
 const input = works.slice(0, 2).map(work => ({...work, topics: [{id: 'T1', display_name: 'Leadership', score: .8}, {id: 'T2', display_name: 'Learning', score: .5}]}));
 const graph = await buildSemanticGraph(input, {kind: 'topics', minimumSupport: 1}); assert.equal(graph.entityKind, 'topic'); assert.equal(graph.links[0].rawSupport, 2); assert.equal(graph.links[0].strength, .8); assert.match(graph.semantic.evidencePolicy, /Machine-assigned/);
 const literal=await buildSemanticGraph(input,{kind:'terms',minimumSupport:1});assert.equal(literal.semantic.coverage.withTopics,2);
 await assert.rejects(buildSemanticGraph(works, {kind: 'topics'}), /No retained/);
});
test('real quantized vectors require matching title and abstract plus pinned model', async () => {
 const graph = await buildSemanticGraph(works, {kind: 'embeddings'}, cache, {sourceCorpusId: 'corpus'}); assert.equal(graph.links.length, 3); assert.equal(graph.entityKind, 'source'); assert.equal(graph.links[0].rawSupport, null);
 assert.throws(() => embeddingEvidence(works, {...cache, revision: ''}), /pinned/);
 assert.throws(() => embeddingEvidence([{...works[0], abstract: 'Changed'}], cache), /stale/);
 assert.throws(() => embeddingEvidence(works, cache, {}, 'other'), /different evidence/);
 assert.throws(() => embeddingEvidence(works, cache, {textScope: 'titles'}), /not interchangeable/);
});
test('supplemental cached abstracts are explicit separately pinned evidence', async () => {
 const slim = works.map(({abstract, ...work}) => work); await assert.rejects(buildSemanticGraph(slim, {kind: 'embeddings'}, cache, {sourceCorpusId: 'corpus'}), /stale/);
 const prepared = await preparedSemanticEvidence(slim, cache, 'corpus', true); assert.equal(prepared.supplementalText.suppliedAbstracts, 3); assert.equal(prepared.supplementalText.checksum.length, 64); assert.match(prepared.supplementalText.verification, /not verified against/);
 const graph = await buildSemanticGraph(prepared.works, {kind: 'embeddings'}, cache, {sourceCorpusId: 'corpus'}); assert.equal(graph.links.length, 3);
 await assert.rejects(preparedSemanticEvidence([{...works[0], abstract: 'Wrong'}], cache, 'corpus', true), /differs/);
});
test('cross-view comparison uses exact source intersection and rejects unlike node universes', async () => {
 const graph = await buildSemanticGraph(works, {kind: 'embeddings'}, cache), coupling = {...graph, canvasKind: 'coupling', nodes: graph.nodes.slice(0, 2)};
 const result = commonSourceComparison(graph, coupling); assert.deepEqual(result.commonIds, ['W1', 'W2']); assert.equal(result.firstOnly, 1); assert.equal(result.adjustedRandIndex, 1);
 assert.throws(() => commonSourceComparison(graph, {entityKind: 'topic', nodes: []}), /not interchangeable/);
 const sensitivity = await semanticSensitivity(works, graph, cache, {}); assert.equal(sensitivity.variants.length, 2); assert.match(sensitivity.modelSensitivity, /no alternative model/);
});
test('semantic manifests retain exact definitions/model pins and never invent raw support', async () => {
 const graph = await buildSemanticGraph(works, {kind: 'embeddings'}, cache), first = await createScientificManifest(graph, works);
 assert.equal(scientificInputs(graph, works).network.links[0].rawSupport, null); assert.equal(nativeNetwork(graph).edges[0].raw_weight, null);
 assert.equal(methodSupport(graph).evidenceResampling, false); assert.equal(methodSupport(graph).marginNull, false);
 assert.throws(() => prepareReliability(graph, works.map(work => work.id)), /not defined/);
 for (const [key, value] of [['model', {...graph.semantic.model, revision: '2'.repeat(40)}], ['textScope', 'titles'], ['vocabularyLimit', 121], ['minimumScore', .5]]) {const changed = structuredClone(graph); changed.semantic[key] = value; assert.notEqual(first.fingerprints.analysis, (await createScientificManifest(changed, works)).fingerprints.analysis);}
 const display = structuredClone(graph); display.nodes[0].x = 999; display.camera = {zoom: 3}; assert.equal(first.fingerprints.analysis, (await createScientificManifest(display, works)).fingerprints.analysis);
});
test('text budget fails explicitly before phrase materialization', () => {assert.throws(() => featureIncidence([{id: 'huge', title: 'word '.repeat(30000)}]), /budget/);});
test('citation crosswalk retains the parent reference universe and distinct supporting source IDs',()=>{
 const graph={entityKind:'term',nodes:[{id:'term:leadership',cluster:1,articles:['W1','W2']},{id:'term:practice',cluster:2,articles:['W3']}],semantic:{referenceScope:{nodes:[{id:'R1',label:'Foundation one',cluster:4},{id:'R2',label:'Foundation two',cluster:4}]}}};
 const result=citationCrosswalk(graph,[{id:'W1',references:['R1','R1','R2','outside']},{id:'W2',references:['R1']},{id:'W3',references:['R2']}],1);
 assert.equal(result.selectedSources,2);assert.equal(result.references[0].id,'R1');assert.deepEqual(result.references[0].sourceIds,['W1','W2']);assert.deepEqual(result.clusters[0].sourceIds,['W1','W2']);assert.equal(result.references.length,2);
 assert.equal(citationCrosswalk({...graph,semantic:{}},[]).status,'unavailable');
});
test('sensitivity fails closed when model, vectors or supplemental text no longer match the parent pin',async()=>{
 const graph=await buildSemanticGraph(works,{kind:'embeddings'},cache);
 await assert.rejects(semanticSensitivity(works,graph,{...cache,revision:'2'.repeat(40)},{}),/model.*changed/);
 const changed=structuredClone(cache);changed.documents.W1.abstract='Changed';await assert.rejects(semanticSensitivity(works,graph,changed,{}),/stale/);
 graph.semantic.supplementalText={checksum:'original'};await assert.rejects(semanticSensitivity(works,graph,cache,{supplementalText:{checksum:'different'}}),/supplemental/);
});
test('failed sensitivity variants are not reported as successful assessment',()=>{
 const failed=semanticSensitivityReport([{status:'unavailable',reason:'limit'},{status:'unavailable',reason:'missing'}]);assert.equal(failed.status,'unavailable');assert.equal(failed.completed,0);assert.equal(failed.attempted,2);
 const partial=semanticSensitivityReport([{nodes:3},{status:'unavailable',reason:'threshold'}]);assert.equal(partial.status,'partial');assert.equal(partial.completed,1);assert.equal(partial.unavailable,1);
});
test('identifier placeholders are missing titles, not literal term evidence',()=>{
 assert.equal(semanticText({id:'https://openalex.org/W123',title:'https://openalex.org/W123'}).title,'');assert.equal(semanticText({id:'W123',title:'W123',abstract:'Actual abstract words'}).abstract,'Actual abstract words');
 assert.throws(()=>featureIncidence([{id:'https://openalex.org/W123',title:'https://openalex.org/W123'}],{minimumSupport:1}),/No literal terms/);
});
test('published short reference IDs map through explicit OpenAlex keys/aliases without double-counting source support',()=>{
 const graph={entityKind:'source',nodes:[{id:'source',cluster:1}],semantic:{referenceScope:{nodes:[{id:'W123',key:'https://openalex.org/W123',aliases:['https://openalex.org/W456'],label:'Canonical foundation',cluster:2}]}}};
 const result=citationCrosswalk(graph,[{id:'source',references:['https://openalex.org/W123','https://openalex.org/W456','W123']}],1);assert.equal(result.references.length,1);assert.deepEqual(result.references[0].sourceIds,['source']);assert.equal(result.references[0].id,'W123');
});
