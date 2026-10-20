import test from 'node:test';
import assert from 'node:assert/strict';
import {hypergeometricTail, holmAdjust, validateConnections, disparityBackbone, temporalNetwork, clusterTransitions} from './network-extensions.mjs';

test('hypergeometric survival agrees with exact small enumerations and boundaries', () => {
 assert(Math.abs(hypergeometricTail(10, 4, 3, 2) - 1 / 3) < 1e-12);
 assert.equal(hypergeometricTail(10, 4, 3, 0), 1);
 assert.equal(hypergeometricTail(10, 4, 3, 4), 0);
 assert.equal(hypergeometricTail(10, 10, 3, 3), 1);
 assert(Math.abs(hypergeometricTail(10000, 100, 100, 10) - 5.207039160650171e-8) < 1e-10);
});

test('Holm includes unexamined pairs in its family and is monotone by raw probability', () => {
 assert.deepEqual(holmAdjust([.02, .001, .5], 10), [.18, .01, 1]);
 assert.throws(() => holmAdjust([.1, .2], 1));
});

test('degree-stratified validation detects unusual repeated pairs without changing a graph', () => {
 const nodes = Array.from({length: 20}, (_, index) => ({id: String(index), articles: []}));
 for (let pair = 0; pair < 10; pair++) for (let count = 0; count < 10; count++) {
  nodes[pair * 2].articles.push(pair + ':' + count); nodes[pair * 2 + 1].articles.push(pair + ':' + count);
 }
 const graph = {nodes, links: [{source: '0', target: '1', strength: .1}]}, original = structuredClone(graph);
 const result = validateConnections(graph);
 assert.equal(result.familySize, 190);
 assert.equal(result.strata, 1);
 assert.equal(result.records[0].overlap, 10);
 assert.equal(result.retained, 1);
 assert.deepEqual(graph, original);
});

test('backbone uses the full normalized strengths and handles leaves explicitly', () => {
 const graph = {nodes: ['a','b','c','d','e'].map(id => ({id})), links: [{source:'a', target:'b', strength:99}, {source:'a', target:'c', strength:1}, {source:'d', target:'e', strength:1}]};
 const result = disparityBackbone(graph, .05);
 assert.deepEqual(result.records.map(record => record.retained), [true, false, true]);
 assert.equal(result.records[2].isolatedPair, true);
});

test('time windows use source years, deduplicated pair incidence and fixed reference scope', () => {
 const graph = {order:'all', minimumSupport:2, nodes:[{id:'a',year:1990,articles:['s1','s2','s3'],citations:3},{id:'b',year:1991,articles:['s1','s2'],citations:2},{id:'c',year:1992,articles:['s3'],citations:1}],links:[]};
 const original = structuredClone(graph);
 const result = temporalNetwork(graph, [{id:'s1',year:2020},{id:'s2',year:2020},{id:'s3',year:null}], 2020, 2020);
 assert.equal(result.order, 2);
 assert.equal(result.nodes.length, 3);
 assert.equal(result.nodes[2].citations, 0);
 assert.equal(result.links.length, 1);
 assert.equal(result.links[0].count, 2);
 assert.equal(result.links[0].strength, .5);
 assert.equal(result.temporal.missingYear, 1);
 assert.deepEqual(graph, original);
 assert.throws(() => temporalNetwork(graph, [], 2021, 2020));
});

test('coupling windows preserve reference lists and exclude sources outside the period', () => {
 const graph = {method:'coupling',minimumShared:1,minimumCosine:0,nodes:[{id:'a',year:2020,references:['r1','r2']},{id:'b',year:2020,references:['r1']},{id:'c',year:2021,references:['r1']}],links:[]};
 const next = temporalNetwork(graph, [], 2020, 2020);
 assert.equal(next.nodes.length, 2);
 assert.equal(next.links.length, 1);
 assert.equal(next.links[0].count, 1);
 assert.deepEqual(next.nodes[0].references, ['r1','r2']);
 assert.deepEqual(clusterTransitions({nodes:[{id:'a',cluster:1},{id:'b',cluster:1}]},{nodes:[{id:'a',cluster:3},{id:'b',cluster:3}]}), [{from:1,to:3,count:2}]);
});
