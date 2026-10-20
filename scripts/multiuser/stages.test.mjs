import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {executeStage,solve} from './stages.mjs';
import {HYPERGRAPH_INCIDENCE} from '../hypergraph-network.mjs';
import {FileArtifacts} from './artifacts.mjs';
import {fixture} from './fixtures.mjs';

test('empty incidence results retain readable method metadata',async()=>{
 const graph={nodes:[],links:[],hyperedges:[],networkModel:'hypergraph'},context={signal:new AbortController().signal};
 const leiden=await solve(graph,{algorithm:'leiden',resolution:'auto'},context),infomap=await solve(graph,{algorithm:'infomap'},context);
 assert.equal(leiden.limitations,HYPERGRAPH_INCIDENCE);assert.equal(infomap.limitations,HYPERGRAPH_INCIDENCE);
});

test('retrieval checkpoints resume after failure without publishing partial evidence',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'bibliomap-retrieval-')),files=new FileArtifacts(folder);await files.init(path.resolve('public'));let checkpoint,requests=0;
 const context={files,signal:new AbortController().signal,progress:()=>{},rateLimit:async()=>{},saveCheckpoint:async value=>{checkpoint=structuredClone(value);},fetch:async target=>{
  requests++;const url=new URL(target);assert.equal(url.searchParams.get('search'),'"leadership development"');
  if(requests===1)return Response.json({results:[{id:'source-1'},{id:'source-2'}],meta:{count:3,next_cursor:'next-page'}});
  if(requests===2)throw Error('Simulated upstream interruption');assert.equal(url.searchParams.get('cursor'),'next-page');
  return Response.json({results:[{id:'source-3'}],meta:{count:3,next_cursor:null}});
 }};
 try{await assert.rejects(executeStage('retrieval',{specification:{terms:'"leadership development"',limit:3,filter:'type:article',corpus:'core'}},{},context),/interruption/);assert.equal(checkpoint.pages.length,1);assert.equal(checkpoint.cursor,'next-page');
  const result=await executeStage('retrieval',{specification:{terms:'"leadership development"',limit:3,filter:'type:article',corpus:'core'}},{},{...context,checkpoint});assert.equal(result.works.length,3);assert.equal(result.exhausted,true);assert.equal(result.complete,true);assert(result.retrievedAt);assert.equal(requests,3);
 }finally{assert(path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(folder,{recursive:true,force:true});}
});
test('paper metadata reuse respects frozen observations and access-specific cache',async()=>{
 const calls=[],context={signal:new AbortController().signal,metadataGet:async(ids,epoch)=>{calls.push(epoch);return [{id:'https://openalex.org/W1',display_name:'Cached title'},{id:'https://openalex.org/W2',missing:true}];},metadataPut:async()=>{},progress:()=>{},rateLimit:async()=>{},fetch:async()=>{throw Error('No upstream request expected');}};
 const result=await executeStage('reference-metadata',{ids:['https://openalex.org/W1','https://openalex.org/W2'],known:[{id:'https://openalex.org/W1',display_name:'Frozen title'}]},{epoch:'snapshot-1'},context);assert.equal(result.length,1);assert.equal(result[0].display_name,'Frozen title');assert.equal(calls.length,1);assert.match(calls[0],/^[a-f0-9]{64}$/);
});
test('server adapters keep coupling cosine weights, exact bundles and history semantics',async()=>{
 const snapshot=fixture(),context={signal:new AbortController().signal,progress:()=>{}};
 const prepared=await executeStage('preparation',snapshot,{preset:'conservative'},context);assert.equal(prepared.works.length,10);
 const coupling=await executeStage('network',{works:prepared.works},{method:'coupling',minimumShared:2,minimumCosine:.05},context);assert.equal(coupling.method,'coupling');assert(coupling.links.every(edge=>edge.strength>0&&edge.strength<=1));
 const clustered=await executeStage('clustering',{graph:coupling,articleIds:prepared.works.map(work=>work.id)},{algorithm:'leiden',networkModel:'pairwise',resolution:'auto',trials:2,seed:42},context);assert(clustered.stats.clusters>0);
 const graph=await executeStage('network',{works:prepared.works},{method:'cocitation',threshold:2,support:2},context),bundles=await executeStage('bundles',{graph},{support:2},context);assert.equal(bundles.complete,true);assert.equal(bundles.maximumOrder,3);
});
