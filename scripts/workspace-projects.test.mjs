import test from 'node:test';
import assert from 'node:assert/strict';
import {searchSpecification, selectCorpus, selectCleanedCorpus, evidenceDataset, buildProjectGraph, nativeNetwork, assertSnapshotCorpus, rebindSnapshotCorpus} from './workspace-projects-core.mjs';
import {deduplicateWorks} from './work-deduplication.mjs';
import {graphRows} from '../neo4j-store.mjs';

const works = [
 {id:'https://openalex.org/W1',display_name:'One',referenced_works:['https://openalex.org/W10','https://openalex.org/W20','https://openalex.org/W20']},
 {id:'https://openalex.org/W2',display_name:'Two',referenced_works:['https://openalex.org/W10','https://openalex.org/W20']},
 {id:'https://openalex.org/W3',display_name:'Three',referenced_works:['https://openalex.org/W10','https://openalex.org/W30']}
];
test('saved maps cannot silently adopt a newly selected search evidence identity',()=>{
 assert.equal(assertSnapshotCorpus({evidenceCorpusId:'actual',graph:{externalCorpus:true}},'actual'),'actual');
 assert.throws(()=>assertSnapshotCorpus({evidenceCorpusId:'actual',graph:{externalCorpus:true}},'selected-other'),/different evidence/);
 assert.throws(()=>assertSnapshotCorpus({graph:{externalCorpus:true}},'selected-other'),/lacks an evidence identity/);
});
test('copy/reopen/export/resave binds copied corpus identity while retaining original lineage',()=>{
 const snapshot={evidenceCorpusId:'original',graph:{externalCorpus:true,sourceCorpusId:'original',scientificManifest:{evidence:{id:'original'}}},reference:{graph:{sourceCorpusId:'original'}}};
 const rebound=rebindSnapshotCorpus(structuredClone(snapshot),'copy'),packet=evidenceDataset(works,'copy');
 assert.equal(rebound.graph.sourceCorpusId,packet.sourceCorpusId);assert.equal(rebound.reference.graph.sourceCorpusId,'copy');assert.equal(rebound.graph.scientificManifest,undefined);assert.deepEqual(rebound.graph.sourceCorpusLineage,['original']);
 assert.equal(assertSnapshotCorpus(rebound,'copy'),'copy');assert.equal(assertSnapshotCorpus(rebindSnapshotCorpus(rebound,'copy'),'copy'),'copy');assert.equal(snapshot.graph.sourceCorpusId,'original');
});

test('registered search cleanup applies after eligibility filtering and preserves original retrievals',()=>{
 const known={id:'source-a',display_name:'Leadership development in organisations',doi:'10.123/source',type:'article',language:'en',is_retracted:false,primary_location:{source:{type:'journal',is_core:true}},authorships:[{author:{display_name:'Author'},institutions:[{}]}],institutions_distinct_count:1,publication_year:2000,referenced_works:['reference-a','reference-b'],referenced_works_count:2};
 const sources=[known,{...known,id:'source-b',publication_year:2001},{...known,id:'excluded',doi:'10.123/excluded',is_retracted:true}],original=structuredClone(sources);
 const prepared=deduplicateWorks(sources),cleanup={audit:prepared.audit,summary:{originalSources:3,cleanedSources:2}};
 const selected=selectCleanedCorpus(sources,'conservative',cleanup);
 assert.deepEqual(selected.counts,{included:2,excluded:1,unknown:0});assert.equal(selected.works.length,1);assert.equal(selected.cleanup.selectedSourcesBefore,2);assert.equal(selected.cleanup.selectedSourcesAfter,1);assert.deepEqual(selected.works[0].years,[2000,2001]);assert.deepEqual(sources,original);
 assert.equal(selectCleanedCorpus(sources,'conservative',null).works.length,2);
});
test('search captures the literal query, phrase semantics, bounds and year filters',()=>{
 const specification=searchSpecification({query:' adaptive leadership ',phrase:true,limit:2500,from:2000,through:2024});
 assert.equal(specification.query,'adaptive leadership');assert.equal(specification.terms,'"adaptive leadership"');assert.equal(specification.limit,2500);assert(specification.filter.includes('from_publication_date:2000-01-01'));assert(specification.filter.includes('to_publication_date:2024-12-31'));
 for(const input of [{query:''},{query:'test',limit:-1},{query:'test',limit:20001},{query:'test',from:2026,through:2020}])assert.throws(()=>searchSpecification(input));
});
test('new project minimums match the adaptive leadership study',()=>{
 const sources=Array.from({length:10},(_,index)=>({id:'source-'+index,referenced_works:['reference-a',...(index<5?['reference-b']:[])]}));
 const graph=buildProjectGraph(sources,[]);
 assert.equal(graph.threshold,10);assert.equal(graph.minimumSupport,5);assert.equal(graph.nodes.length,1);assert.equal(graph.nodes[0].id,'reference-a');
});
test('citation support counts distinct sources and retains exact provenance after mapping',()=>{
 const graph=buildProjectGraph(works,[{id:'https://openalex.org/W10',display_name:'Foundation A'},{id:'https://openalex.org/W20',display_name:'Foundation B'}],{threshold:2,support:2});
 assert.equal(graph.nodes.length,2);assert.equal(graph.links.length,1);assert.equal(graph.links[0].count,2);assert.equal(graph.links[0].strength,2/6);assert.deepEqual(graph.links[0].articles,works.slice(0,2).map(work=>work.id));assert.equal(graph.nodes.find(node=>node.id.endsWith('W10')).citations,3);assert.equal(graph.order,2);assert.equal(graph.stats.clusters,1);assert(graph.nodes.every(node=>node.cluster===1));
 const record={id:'test',network:nativeNetwork(graph)};const rows=graphRows('analyses',record);assert.equal(rows.networkEdges.length,1);assert.equal(rows.networkType,'CO_CITED_WITH');
});
test('source evidence round-trips references and fingerprints corpus incidence',()=>{
 const first=evidenceDataset(works,'corpus');assert.equal(first.articles[0].references.length,2);assert.equal(first.articles[0].title,'One');assert.equal(first.incidenceHash,evidenceDataset(works,'other').incidenceHash);assert.notEqual(first.incidenceHash,evidenceDataset(works.slice(1),'corpus').incidenceHash);
});
test('metadata filtering separates uncertain records and never claims topical validation',()=>{
 const known={...works[0],type:'article',language:'en',is_retracted:false,primary_location:{source:{type:'journal',is_core:true}},authorships:[{author:{display_name:'Author'},institutions:[{}]}],institutions_distinct_count:1,referenced_works_count:2};
 const selection=selectCorpus([known,{...known,id:'unknown',language:null},{...known,id:'excluded',is_retracted:true}]);assert.deepEqual(selection.counts,{included:1,excluded:1,unknown:1});assert.equal(selection.works.length,1);assert.equal(selection.humanValidated,false);
 assert.throws(()=>selectCorpus([], 'unknown'));
});
