import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {run} from '@mapequation/infomap/node';
import {analysisNetwork, connectionModel, hypergraphProjection} from './hypergraph-network.mjs';
import {partition, densityGrid} from './auto-cpm.mjs';
import {infomapArgs, infomapInput, infomapResult, buildHyperedges} from './community-methods.mjs';
import {prepareReliability} from './network-reliability.mjs';
import {settingsGrid, runSettingsSearch, materializeSetting} from './method-settings.mjs';

const groups = [{members: ['a','b','c'], weight: 6}, {members: ['d','e','f'], weight: 6}];
const graph = {networkModel:'hypergraph', order:3, maximumOrder:3, minimumSupport:1, resolution:.02, clustering:{algorithm:'leiden'}, nodes:['a','b','c','d','e','f','isolated'].map(id=>({id,cluster:id==='isolated'?0:id<'d'?1:2,articles:id==='isolated'?[]:['s1','s2','s3']})), links:[{source:'a',target:'b',strength:999,count:3,articles:['s1','s2','s3']},{source:'d',target:'e',strength:999,count:3,articles:['s1','s2','s3']}], hyperedges:groups};

test('hypergraph walk divides each group weight among its other members',()=>{
 const edges=hypergraphProjection([{members:['a','b','c'],weight:6},{members:['a','b'],weight:2}]);
 assert.equal(edges.find(edge=>edge.source==='a'&&edge.target==='b').strength,5);
 assert.equal(edges.find(edge=>edge.source==='a'&&edge.target==='c').strength,3);
 assert.equal(hypergraphProjection([{members:['b','a','a'],weight:2}]).length,1);
 assert.throws(()=>hypergraphProjection([{members:['a','b'],weight:NaN}]),/Invalid/);
 assert.throws(()=>hypergraphProjection(groups,1),/no truncated/);
});
test('model is separate from algorithm and ordinary pairwise/higher-order networks are untouched',()=>{
 assert.equal(connectionModel({order:2,clustering:{algorithm:'infomap'}}),'pairwise');
 assert.equal(connectionModel({order:'all',clustering:{algorithm:'leiden'}}),'higher-order');
 assert.equal(connectionModel({clustering:{algorithm:'hypergraph'}}),'hypergraph');
 const ordinary={...graph,networkModel:'higher-order'};
 assert.equal(analysisNetwork(ordinary),ordinary);
 assert.equal(analysisNetwork({...graph,clustering:{algorithm:'hypergraph'}}).links,graph.links);
 assert.throws(()=>analysisNetwork({...graph,hyperedges:null}),/reconstructed/);
});
test('Leiden uses group-derived weights without changing displayed pair evidence',()=>{
 const before=structuredClone(graph),result=partition(graph,.02);
 assert.equal(result.clusters,2);
 assert.equal(result.memberships.a,result.memberships.c);
 assert.notEqual(result.memberships.a,result.memberships.d);
 assert.equal(result.memberships.isolated,undefined);
 assert.equal(analysisNetwork(graph).links.length,6);
 assert.deepEqual(graph,before);
 assert.equal(settingsGrid(graph)[0].resolution>0,true);
 assert.equal(densityGrid(graph).meanEdgeWeight,3);
});
test('Infomap uses the same explicit hypergraph walk and reports its model',async()=>{
 const {ids,network}=infomapInput({...graph,clustering:{algorithm:'infomap'}});
 assert.equal(ids.length,6);assert(!network.includes('999'));
 const result=infomapResult(await run(network,{args:infomapArgs({trials:2})}),ids,{networkModel:'hypergraph',trials:2});
 assert.equal(result.algorithm,'infomap');assert.equal(result.networkModel,'hypergraph');
 assert.equal(result.memberships.a,result.memberships.c);assert.notEqual(result.memberships.a,result.memberships.d);
 assert.match(result.limitations,/not direct hypergraph modularity/i);
});
for(const algorithm of ['leiden','infomap'])test(algorithm+' projection reliability resamples whole groups, not the old pair weights',async()=>{
 const bundles=[{members:['a','b','c'],articles:['s1','s2','s3']},{members:['d','e','f'],articles:['s1','s2','s3']}];
 const configured={...graph,bundles,clustering:{algorithm}};
 configured.hyperedges=buildHyperedges(configured,bundles);
 const before=structuredClone(configured),session=prepareReliability(configured,['s1','s2','s3'],10);
 for(let position=0;position<10;position++){
  const sample=session.sample(position);
  assert.equal(sample.graph.networkModel,'hypergraph');assert(sample.graph.hyperedges);
  if(algorithm==='infomap'){
   const {ids,network}=infomapInput(sample.graph);
   session.record(infomapResult(await run(network,{args:infomapArgs({trials:2})}),ids,{networkModel:'hypergraph'}));
  }else session.record(session.partition(sample));
 }
 const report=session.finish();assert.equal(report.algorithm,algorithm);assert.equal(report.networkModel,'hypergraph');assert.equal(report.samples,10);
 assert.deepEqual(configured,before);
});
test('settings search and applying candidates retain the hypergraph network model',async()=>{
 const bundles=[{members:['a','b','c'],articles:['s1','s2','s3']},{members:['d','e','f'],articles:['s1','s2','s3']}];
 const configured={...graph,bundles,hyperedges:null};configured.hyperedges=buildHyperedges(configured,bundles);
 const report=await runSettingsSearch(configured,['s1','s2','s3'],()=>{throw Error('Leiden must not run Infomap');},()=>{},{settings:[{resolution:.02,label:'CPM .02'}],screenOnly:true});
 const applied=materializeSetting(configured,report.candidates[0]);
 assert.equal(applied.networkModel,'hypergraph');assert.equal(applied.clustering.algorithm,'leiden');
 assert.match(applied.clustering.label,/hypergraph/);assert.match(applied.clustering.limitations,/not direct hypergraph/);assert.equal(report.candidates[0].screening.networkModel,'hypergraph');
});
test('published community worker routes Leiden and Infomap to incidence, retaining direct modularity',()=>{
 const bundles=[{members:['a','b','c'],articles:['s1','s2','s3']},{members:['d','e','f'],articles:['s1','s2','s3']}];
 for(const algorithm of ['leiden','infomap','hypergraph',undefined]){
  const messages=[],sandbox={self:{postMessage:message=>messages.push(message)}};
  vm.runInNewContext(fs.readFileSync('public/conservative-atlas/community-worker.js','utf8'),sandbox);
  sandbox.self.onmessage({data:{graph,bundles,options:{networkModel:'hypergraph',algorithm}}});
  const output=messages.at(-1);assert(!output.error,output.error);
  if(['leiden','infomap'].includes(algorithm)){assert.equal(output.incidence.networkModel,'hypergraph');assert.equal(output.incidence.hyperedges.length,2);assert.equal(output.incidence.clustering.modelVersion,'incidence-v1');}
  else{assert.equal(output.result.algorithm,'hypergraph');assert.equal(output.hyperedges.length,2);assert(!output.incidence);}
 }
});
test('coupling projection reliability keeps the reference-bootstrap model and weights',()=>{
 const configured={method:'coupling',networkModel:'hypergraph',minimumShared:1,minimumCosine:0,resolution:.02,clustering:{algorithm:'leiden'},nodes:[{id:'a',cluster:1,references:['r1','r2']},{id:'b',cluster:1,references:['r1','r2']}],links:[{source:'a',target:'b',references:['r1','r2'],count:2,strength:1}]};
 const session=prepareReliability(configured,[],10);
 for(let position=0;position<10;position++){
  const sample=session.sample(position);assert.equal(sample.graph.networkModel,'hypergraph');
  assert.equal(sample.graph.hyperedges.reduce((sum,edge)=>sum+edge.weight,0),2);
  session.record(session.partition(sample));
 }
 assert.equal(session.finish().clusters[1].meanJaccard,1);
});
