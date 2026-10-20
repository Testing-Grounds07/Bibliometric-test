import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleHyperedges,hullPath,clusterCombinations} from './hypergraph-view.mjs';
const nodes=[{id:'a',cluster:1},{id:'b',cluster:1},{id:'c',cluster:2},{id:'d',cluster:2}];
const edges=[{id:'abc',members:['a','b','c'],articles:['one','two']},{id:'bcd',members:['b','c','d'],articles:['one']},{id:'ab',members:['a','b'],articles:['one']}];
test('only complete higher-order combinations survive display filters',()=>{
 assert.equal(visibleHyperedges(edges,nodes).total,2);
 assert.deepEqual(visibleHyperedges(edges,nodes.slice(0,3)).edges.map(edge=>edge.id),['abc']);
 assert.equal(visibleHyperedges(edges,nodes.slice(0,2)).total,0);
});
test('focus uses exact membership and deterministic strongest-first limits',()=>{
 assert.equal(visibleHyperedges(edges,nodes,{node:'a'}).total,1);
 assert.equal(visibleHyperedges(edges,nodes,{edge:'a|d'}).total,0);
 assert.equal(visibleHyperedges(edges,nodes,{cluster:1}).total,2);
 const selected=visibleHyperedges(edges,nodes,{},1);assert.equal(selected.total,2);assert.equal(selected.edges[0].id,'abc');
});
test('envelopes remain valid for collinear members and expand around nodes',()=>{
 const path=hullPath([{x:0,y:0},{x:10,y:0},{x:20,y:0}],5);
 assert(path.startsWith('M'));assert(path.endsWith('Z'));assert(path.includes('-5'));assert(!path.includes('NaN'));assert.equal(hullPath([]),'');
});
test('cluster explosion uses complete within-cluster groups, never clipped cross-cluster groups',()=>{
 assert.equal(clusterCombinations(edges,nodes,1).total,0);
 const same=nodes.map(node=>({...node,cluster:1}));
 const result=clusterCombinations(edges,same,1,1);
 assert.equal(result.total,2);assert.equal(result.groups.length,1);assert.equal(result.groups[0].id,'abc');
 assert.equal(clusterCombinations(edges,same,2).total,0);
});
test('coupling reference groups preserve distinct reference identity',()=>{
 const result=clusterCombinations([{reference:'reference-one',members:['a','b','c'],weight:1}],nodes.map(node=>({...node,cluster:1})),1);
 assert.equal(result.groups[0].id,'reference-one');assert.equal(result.groups[0].reference,'reference-one');
});
