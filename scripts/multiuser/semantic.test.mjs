import test from 'node:test';
import assert from 'node:assert/strict';
import {executeStage} from './stages.mjs';
import {fixture} from './fixtures.mjs';
import {graphRows} from '../../neo4j-store.mjs';
import {nativeNetwork} from '../workspace-projects-core.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const context={signal:new AbortController().signal,progress:()=>{}};
test('trusted stages build distinct term and classifier-topic graphs with native projection semantics',async()=>{
 const source=fixture(),parent={evidenceProvenance:{evidenceId:'known',retrievedAt:source.retrievedAt}},input={works:source.works,graph:parent,sourceCorpusId:'immutable-evidence'};
 for(const kind of ['terms','topics']){
  const graph=await executeStage('semantic-network',input,{kind,minimumSupport:2},context);assert.equal(graph.entityKind,kind==='terms'?'term':'topic');assert.equal(graph.evidenceProvenance.evidenceId,'known');assert.equal(graph.semantic.coverage.records,10);
  const native=nativeNetwork(graph),projection=graphRows('analyses',{id:'result',network:native});assert.equal(projection.networkType,kind==='terms'?'TERM_CO_OCCURS_WITH':'TOPIC_CO_OCCURS_WITH');assert.equal(projection.observations.length,0);
  assert(projection.networkNodes.every(node=>node.work_id===null&&node.entity_kind===graph.entityKind));
  const sensitivity=await executeStage('semantic-sensitivity',{...input,graph},graph.semantic,context);assert(sensitivity.variants.length>=2);
  for(const audit of ['incidence-null','construction-comparison','role-sensitivity'])await assert.rejects(executeStage(audit,{graph},{samples:10},context),/currently support/);
  await assert.rejects(executeStage('description',{graph},{},context),/Feature|feature/);
 }
 await assert.rejects(executeStage('semantic-network',input,{kind:'embeddings'},context),/pinned.*MiniLM/);
});
test('trusted semantic adapter accepts actual cached source vectors with supplemental text and exact cache identity',async()=>{
 const evidence=JSON.parse(readFileSync('public/conservative-atlas/source-evidence.json')),bytes=readFileSync('public/conservative-atlas/source-cluster-themes.json'),cache=JSON.parse(bytes),works=evidence.articles.slice(0,5),checksum=createHash('sha256').update(bytes).digest('hex');
 const graph=await executeStage('semantic-network',{works,cache,cacheChecksum:checksum,graph:{evidenceProvenance:{evidenceId:'test-pinned-source-evidence'}},sourceCorpusId:cache.sourceCorpusId},{kind:'embeddings',useCachedAbstracts:true},context);
 assert.equal(graph.semantic.model.revision,cache.revision);assert.equal(graph.semantic.cacheChecksum,checksum);assert.equal(graph.semantic.embeddingFingerprint.length,64);assert.equal(graph.nodes.length,5);assert(Object.values(graph.themeDescriptions).every(theme=>theme.heading));
 const comparison=await executeStage('semantic-comparison',{graph,otherGraph:{...graph,canvasKind:'coupling'}},{},context);assert.equal(comparison.commonIds.length,5);assert.equal(comparison.firstOnly,0);
});
