import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {agreement} from './auto-cpm.mjs';

const context={window:{}};
for(const file of ['data.js','settings-data.js','atlas-settings.js'])vm.runInNewContext(fs.readFileSync(new URL('../public/conservative-atlas/'+file,import.meta.url),'utf8'),context);
const {ATLAS_DATA:data,ATLAS_SETTINGS:settings,resolveAtlasGraph:resolve}=context.window;
test('overview selections use the fixed grid and recommended ranges span twofold',()=>{
 assert.equal(settings.version,3);
 for(const config of Object.values(settings.configs)){
  const chosen=config.candidates.find(candidate=>candidate.resolution===config.autoResolution);
  assert.equal(chosen.selectionEligible,true);assert(chosen.fragmentation);
  const range=config.recommendation.range;if(!range)continue;
  assert(range[1]/range[0]>=2-1e-6);
  const band=config.candidates.filter(candidate=>candidate.selectionEligible&&candidate.resolution>=range[0]&&candidate.resolution<=range[1]);assert(band.length>=3);
  assert(band.includes(chosen));
  for(const candidate of band){assert(candidate.bootstrapARI>=.7);assert(candidate.bootstrapCoverage>=.8);assert(candidate.fragmentation.introducedTinyNodeFraction<=.2);assert(candidate.fragmentation.introducedTinyClusterFraction<=.5);for(const other of band)assert(agreement(candidate.memberships,other.memberships)>=.9);}
 }
});
test('manual CPM snaps to the nearest tested value and reports the requested value',()=>{
 const config=Object.values(settings.configs)[0],requested=.023456789;
 const expected=[...config.candidates].sort((left,right)=>Math.abs(Math.log(left.resolution/requested))-Math.abs(Math.log(right.resolution/requested))||left.resolution-right.resolution)[0];
 const graph=resolve(config.base,String(requested),config.maximumOrder);
 assert.equal(graph.resolution,expected.resolution);
 assert.equal(graph.autoCPM.requestedResolution,requested);
 assert.equal(graph.autoCPM.enabled,false);
 assert.throws(()=>resolve(config.base,'invalid',config.maximumOrder),/Invalid CPM/);
});
test('every setting resolves consistent memberships for Auto and all CPM slider settings',()=>{
 const expected=new Set();for(const graph of Object.values(data.graphs).filter(graph=>graph.resolution===.02)){if(graph.order==='all'){for(let cap=2;cap<=graph.maximumOrder;cap++)expected.add(`s${graph.threshold}_cap${cap}`);}else expected.add(`s${graph.threshold}_n${graph.order}`);}
 assert.deepEqual(Object.keys(settings.configs).sort(),[...expected].sort());
 for(const config of Object.values(settings.configs))for(const mode of ['auto',...config.candidates.map(candidate=>String(candidate.resolution))]){
  const graph=resolve(config.base,mode,config.maximumOrder),groups=new Set(graph.nodes.map(node=>node.cluster).filter(Boolean)),connected=new Set(graph.links.flatMap(edge=>[edge.source,edge.target]));
  assert.equal(groups.size,graph.stats.clusters);assert.equal(graph.resolution,mode==='auto'?config.autoResolution:Number(mode));
  for(const node of graph.nodes)assert.equal(node.cluster>0,connected.has(node.id));
  assert.equal(graph.autoCPM.bootstrapSamples,50);assert(Number.isFinite(graph.autoCPM.score));assert(graph.autoCPM.recommendation);
 }
});
test('combined caps recompute actual scores and preserve raw evidence',()=>{
 for(const config of Object.values(settings.configs).filter(config=>config.order==='all')){
  const graph=resolve(config.base,'auto',config.maximumOrder),base=data.graphs[config.base];
  for(const [position,edge] of graph.links.entries()){
   const original=base.links[position],expected=Object.values(original.maximumOrderByArticle).reduce((sum,order)=>sum+1+Math.log2(Math.min(order,config.maximumOrder)-1),0);
   assert(Math.abs(edge.combinedScore-expected)<1e-9);assert.equal(edge.count,original.count);
   assert(edge.orderProfile.every(row=>row.order<=config.maximumOrder));assert(edge.maximumSupportedOrder<=config.maximumOrder);
   if(config.maximumOrder===2){assert.equal(edge.combinedScore,edge.count);assert.equal(edge.higherOrderBonus,0);}
  }
 }
});
test('manual single-order membership remains identical to original analyses',()=>{
 for(const config of Object.values(settings.configs).filter(config=>config.order!=='all'))for(const resolution of [.02,.1]){
  const graph=resolve(config.base,String(resolution),null),original=Object.values(data.graphs).find(candidate=>candidate.threshold===config.threshold&&candidate.order===config.order&&candidate.resolution===resolution);
  assert.deepEqual(JSON.parse(JSON.stringify(graph.nodes.map(node=>[node.id,node.cluster]))),JSON.parse(JSON.stringify(original.nodes.map(node=>[node.id,node.cluster]))));
 }
});
