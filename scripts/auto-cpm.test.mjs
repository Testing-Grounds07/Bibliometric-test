import test from 'node:test';
import assert from 'node:assert/strict';
import {densityGrid,analyzeCPM,recommendRange,fragmentation,scoreCandidates} from './auto-cpm.mjs';

test('density uses linked nodes and mean-scaled edge units, invariant to weight rescaling',()=>{
 const graph={nodes:[1,2,3,4],links:[{source:1,target:2,strength:2},{source:2,target:3,strength:6}]};
 const result=densityGrid(graph),scaled=densityGrid({...graph,links:graph.links.map(edge=>({...edge,strength:edge.strength*100}))});
 assert.equal(result.linkedNodes,3);assert.equal(result.density,2/3);assert.deepEqual(result.resolutions,scaled.resolutions);
 assert(result.resolutions.includes(.02)&&result.resolutions.includes(.1));assert(result.resolutions.at(-1)>result.density);
});
const memberships={a:1,b:1,c:2,d:2};
const candidate=(resolution,overrides={})=>({resolution,memberships,clusters:2,bootstrapARI:.9,bootstrapCoverage:.95,singletonFraction:0,score:.9,fragmentation:{components:1,introducedTinyNodeFraction:0,introducedTinyClusterFraction:0},...overrides});
test('a supported range spans twofold, requires multiple points, and selects the coarsest near-best point',()=>{
 const result=recommendRange([candidate(.01),candidate(.02),candidate(.04)]);
 assert.deepEqual(result.range,[.01,.04]);assert.equal(result.representative,.01);
 assert.equal(recommendRange([candidate(.01),candidate(.011),candidate(.012)]).status,'no_clear_recommendation');
 assert.equal(recommendRange([candidate(.01),candidate(.02)]).range,null);
 assert.equal(recommendRange([candidate(.01),candidate(.02,{bootstrapCoverage:.5}),candidate(.04)]).range,null);
});
test('incompatible partitions break plateaus and singleton defaults are rejected',()=>{
 const fragmented=candidate(.08,{memberships:{a:1,b:2,c:3,d:4},clusters:4,singletonFraction:1,score:1,fragmentation:{components:1,introducedTinyNodeFraction:1,introducedTinyClusterFraction:1}});
 const result=recommendRange([candidate(.01),candidate(.02),candidate(.04),fragmented]);assert.equal(result.representative,.01);
 assert.equal(recommendRange([candidate(.01),candidate(.02,{memberships:{a:1,c:1,b:2,d:2}}),candidate(.04)]).range,null);
});
test('intact disconnected pairs and triples are exempt, but split fragments are counted',()=>{
 const graph={links:[{source:'a',target:'b'},{source:'c',target:'d'},{source:'d',target:'e'},{source:'f',target:'g'},{source:'g',target:'h'},{source:'h',target:'i'}]};
 const intact=fragmentation(graph,{a:1,b:1,c:2,d:2,e:2,f:3,g:3,h:3,i:3});
 assert.equal(intact.components,3);assert.equal(intact.tinyNodes,5);assert.equal(intact.introducedTinyNodes,0);
 const split=fragmentation(graph,{a:1,b:1,c:2,d:2,e:2,f:3,g:3,h:4,i:4});
 assert.equal(split.introducedTinyNodes,4);assert.equal(split.introducedTinyClusters,2);assert.equal(split.introducedTinyClusterFraction,1);
});
test('refinement-only points cannot make a narrow interval eligible',()=>{
 const result=recommendRange([candidate(.01),candidate(.014,{selectionEligible:false}),candidate(.02)]);
 assert.equal(result.status,'no_clear_recommendation');
});
test('overview scoring penalizes introduced pairs and triples, not just singletons',()=>{
 const broad=candidate(.01),tiny=candidate(.1,{fragmentation:{components:1,introducedTinyNodeFraction:.4,introducedTinyClusterFraction:.7}});
 scoreCandidates([broad,tiny]);assert(broad.score>tiny.score);assert.equal(broad.score,.9*.95);
});
test('fallback is explicitly uncertain and does not choose an unstable coarse result just for fewer clusters',()=>{
 const result=recommendRange([candidate(.001,{clusters:1,bootstrapARI:.2,score:.2}),candidate(.01,{clusters:3,bootstrapARI:.65,score:.65}),candidate(.1,{clusters:20,bootstrapARI:.69,score:.69})]);
 assert.equal(result.status,'no_clear_recommendation');assert.equal(result.range,null);assert.equal(result.representative,.01);
});
test('empty graphs report no recommendation and bootstrap output is deterministic',()=>{
 const articles=['s1','s2','s3','s4','s5','s6'],nodes=['a','b'].map(id=>({id,articles}));
 const empty=analyzeCPM({nodes,links:[],order:2,bundles:[]},articles);assert.equal(empty.recommendation.status,'no_edges');assert.equal(empty.recommendation.range,null);
 const graph={nodes,links:[{source:'a',target:'b',articles,count:6,strength:1}],order:2,bundles:[]};
 const first=analyzeCPM(graph,articles),second=analyzeCPM(graph,articles);assert.deepEqual(first,second);assert.equal(first.bootstrapCount,50);assert.equal(first.bootstrapRestarts,2);
 assert(first.candidates.every(item=>item.bootstrapARIInterval[0]<=item.bootstrapARIInterval[1]));
});
