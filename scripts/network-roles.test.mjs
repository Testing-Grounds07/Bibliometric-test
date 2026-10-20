import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRoles, roleNetwork, directedPageRank} from './network-roles.mjs';

const path = {nodes: ['a', 'b', 'c', 'd'].map(id => ({id, cluster: id === 'd' ? 2 : 1})), links: [{source: 'a', target: 'b', strength: 1}, {source: 'b', target: 'c', strength: 1}]};
test('exact paths and cores handle disconnected nodes and preserve normalization', () => {
 const result = analyzeRoles(path, {paths: true});
 assert.equal(result.roles.b.betweenness, 1 / 3); assert.equal(result.roles.a.betweenness, 0); assert.equal(result.roles.d.betweenness, 0);
 assert.equal(result.roles.b.core, 1); assert.equal(result.roles.d.core, 0); assert.equal(result.pageRank, null);
});
test('PageRank only follows documented direct citations, including dangling mass', () => {
 const result = analyzeRoles({...path, directed: true, method: 'direct_citation'});
 assert.equal(result.directed, true); assert.equal(result.pageRank.converged, true);
 assert.ok(result.roles.c.pageRank > result.roles.b.pageRank); assert.ok(Math.abs(Object.values(result.roles).reduce((sum, value) => sum + value.pageRank, 0) - 1) < 1e-10);
 assert.equal(result.roles.a.outgoing, 1); assert.equal(result.roles.c.incoming, 1);
 assert.throws(() => directedPageRank(roleNetwork(path)), /only offered/);
});
test('inverse strength and unweighted paths are explicit and can differ', () => {
 const graph = {nodes: ['a','b','c'].map(id => ({id, cluster: 1})), links: [{source:'a',target:'b',strength:10},{source:'b',target:'c',strength:10},{source:'a',target:'c',strength:1}]};
 assert.equal(analyzeRoles(graph,{paths:true}).roles.b.betweenness,1);
 assert.equal(analyzeRoles(graph,{paths:true,distance:'unweighted'}).roles.b.betweenness,0);
 assert.throws(() => analyzeRoles(graph,{paths:true,maximumOperations:1}),/no partial/);
});
test('a negligible external tie does not imply a cross-community connector', () => {
 const graph = {nodes: ['a','b','c'].map((id, position) => ({id,cluster:position===2?2:1})),links:[{source:'a',target:'b',strength:10},{source:'a',target:'c',strength:.01}]};
 const result = analyzeRoles(graph);
 assert.equal(result.roles.a.label,'Some cross-community connections'); assert.ok(result.roles.a.participation<.01);
 assert.throws(() => analyzeRoles({...graph,links:[...graph.links,graph.links[0]]}),/Duplicate/);
});
test('reciprocal direct citations, singleton and alternative shortest paths are explicit', () => {
 const graph = {directed:true,method:'direct_citation',nodes:['a','b','c','d'].map(id=>({id,cluster:1})),links:[{source:'a',target:'b'},{source:'b',target:'a'},{source:'a',target:'c'},{source:'b',target:'d'},{source:'c',target:'d'}]};
 const result = analyzeRoles(graph,{paths:true});
 assert.equal(result.roles.a.incoming,1);assert.equal(result.roles.a.outgoing,2);assert.equal(result.paths.distance,'unweighted');assert.ok(result.roles.b.betweenness>0);
 const alone=analyzeRoles({directed:true,nodes:[{id:'a'}],links:[]},{paths:true});assert.equal(alone.roles.a.pageRank,1);assert.equal(alone.roles.a.betweenness,0);
});
