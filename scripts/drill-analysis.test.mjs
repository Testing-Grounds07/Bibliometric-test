import test from 'node:test';
import assert from 'node:assert/strict';
import {drillGraph,analyzeDrill,expandedMembers} from './drill-analysis.mjs';
const articles=['s1','s2','s3','s4','s5','s6'];
const base={nodes:['a','b','c','d'].map(id=>({id,citations:6,articles})),links:[['a','b'],['a','c'],['b','c'],['a','d']].map(([source,target])=>({source,target,articles,count:6,strength:1/6})),analysisId:'parent'};
const bundles=[{id:'full',members:['a','b','c','d'],articles}];
test('drill isolates the parent reference set without mutating it',()=>{
 const before=structuredClone(base),graph=drillGraph(base,['a','b','c'],bundles,2,4);
 assert.deepEqual(base,before);assert.equal(graph.nodes.length,3);assert.equal(graph.links.length,3);assert.equal(graph.analysisId,null);
 assert(graph.links.every(edge=>edge.count===6));
});
test('higher orders exclude outside companions and combined bonuses are restricted',()=>{
 const triple=drillGraph(base,['a','b','c'],bundles,3,4),four=drillGraph(base,['a','b','c'],bundles,4,4),combined=drillGraph(base,['a','b','c'],bundles,'all',4);
 assert.equal(triple.links.length,3);assert.equal(four.links.length,0);
 assert(combined.links.every(edge=>edge.maximumSupportedOrder===3&&edge.combinedScore===12));
 assert.deepEqual(triple.bundles[0].members,['a','b','c']);
});
test('fresh local sweep handles a pair and an empty graph without forcing a split',()=>{
 const pair=drillGraph(base,['a','b'],bundles,2,3),result=analyzeDrill(pair,articles);
 assert(result.candidates.length>7);assert.equal(result.bootstrapCount,50);assert.equal(result.recommendation.status,'no_subdivision');assert(result.candidates.some(candidate=>candidate.clusters===1));
 const empty=analyzeDrill(drillGraph(base,['a','b'],bundles,3,3),articles);
 assert(empty.candidates.every(candidate=>candidate.clusters===0&&Number.isFinite(candidate.score)));
});
test('projected bundle evidence is unioned and local normalization is recomputed',()=>{
 const extended=structuredClone(base);for(const node of extended.nodes){node.articles.push('s7');node.citations++;}for(const edge of extended.links){edge.articles=[...articles,'s7'];edge.count=7;}
 const graph=drillGraph(extended,['a','b','c'],[...bundles,{id:'another',members:['a','b','c'],articles:['s7']}],3,4);
 assert.equal(graph.bundles.length,1);assert.equal(graph.links[0].count,7);
 const result=analyzeDrill(graph,[...articles,'s7']);
 assert(result.candidates.every(candidate=>Object.keys(candidate.memberships).length===3));
});
test('expansion adds only direct lower-cited neighbors, never chains or high-frequency outsiders',()=>{
 const network={nodes:[{id:'anchor',citations:20},{id:'low',citations:5},{id:'weak',citations:7},{id:'chain',citations:5},{id:'high',citations:12}],links:[{source:'anchor',target:'low',count:5},{source:'anchor',target:'weak',count:3},{source:'low',target:'chain',count:5},{source:'anchor',target:'high',count:8}]};
 assert.deepEqual(expandedMembers(network,['anchor'],5,5,10),['anchor','low']);
 assert.deepEqual(expandedMembers(network,['anchor'],5,3,10),['anchor','low','weak']);
 assert.deepEqual(expandedMembers(network,['anchor'],6,5,10),['anchor']);
});
test('joint support three rebuilds weak pairs and combinations rather than just displaying them',()=>{
 const network=structuredClone(base);network.nodes[2].articles=articles.slice(0,3);network.nodes[2].citations=3;
 for(const edge of network.links)if(edge.source==='c'||edge.target==='c'){edge.articles=articles.slice(0,3);edge.count=3;}
 const evidence=[{members:['a','b','c'],articles:articles.slice(0,3)}];
 assert.equal(drillGraph(network,['a','b','c'],evidence,3,3,5).links.length,0);
 const graph=drillGraph(network,['a','b','c'],evidence,3,3,3);assert.equal(graph.links.length,3);assert(graph.links.every(edge=>edge.count===3));
 assert(analyzeDrill(graph,articles).candidates.length>7);
});
