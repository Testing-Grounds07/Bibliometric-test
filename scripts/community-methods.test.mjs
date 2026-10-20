import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {run} from '@mapequation/infomap/node';
import {INFOMAP_ARGS, infomapInput, infomapResult, buildHyperedges, hypergraphModularity, refineHypergraph, hypergraphPartition, applyCommunityResult} from './community-methods.mjs';

const articles = ['s1', 's2', 's3', 's4', 's5'];

test('changing community algorithm discards previous reliability results', () => {
 const graph = {nodes: [{id: 'reference', cluster: 1}], stats: {}, reliability: {algorithm: 'leiden', clusters: {}}};
 const result = applyCommunityResult(graph, {algorithm: 'hypergraph', memberships: {reference: 1}});
 assert.equal(result.reliability, null);
 assert.equal(result.clustering.algorithm, 'hypergraph');
});
const graph = {
 order: 3, maximumOrder: 4, minimumSupport: 5, resolution: .02, analysisId: 'fixture',
 nodes: ['a', 'b', 'c', 'd', 'z'].map(id => ({id, articles: id === 'z' ? [] : articles, cluster: id === 'z' ? 0 : 1})),
 links: [{source: 'a', target: 'b', strength: .1, count: 5}, {source: 'a', target: 'c', strength: .1, count: 5}, {source: 'b', target: 'c', strength: .1, count: 5}], stats: {clusters: 1}, autoCPM: {enabled: true}
};
const bundles = [{members: ['d', 'c', 'b', 'a'], articles}, {members: ['a', 'b', 'c'], articles}];

test('exact order combinations are deduplicated and each supporting source has one total unit', () => {
 const edges = buildHyperedges(graph, bundles);
 assert.equal(edges.length, 4);
 assert(edges.every(edge => edge.members.length === 3 && edge.articles.length === 5));
 assert.equal(edges.reduce((sum, edge) => sum + edge.weight, 0), 5);
 assert.equal(buildHyperedges({...graph, order: 4}, bundles).length, 1);
 assert.equal(buildHyperedges({...graph, order: 5}, bundles).length, 0);
 assert.equal(buildHyperedges({...graph, order: 'all', maximumOrder: 3}, bundles).length, 7);
 assert.equal(buildHyperedges({...graph, order: 'all'}, bundles).length, 8);
 assert.equal(buildHyperedges({...graph, order: 2}, bundles).length, 3);
 assert.throws(() => buildHyperedges(graph, bundles, 2), /no truncated hypergraph/);
});

test('support is recomputed from actual incidence, not trusted from closed bundle metadata', () => {
 const sparse = structuredClone(graph); sparse.nodes.find(node => node.id === 'd').articles = ['s1'];
 assert.equal(buildHyperedges(sparse, bundles).length, 1);
 assert.equal(buildHyperedges({...graph, minimumSupport: 6}, bundles).length, 0);
});

test('direct majority modularity matches independent analytic examples', () => {
 const edges = [{members: ['a', 'b', 'c'], weight: 1}, {members: ['d', 'e', 'f'], weight: 1}];
 const partition = {a: 1, b: 1, c: 1, d: 2, e: 2, f: 2};
 assert.equal(hypergraphModularity(edges, partition), .25);
 assert.equal(hypergraphModularity(edges, {a: 1, b: 1, c: 1, d: 1, e: 1, f: 1}), 0);
 const pairs = [{members: ['a', 'b'], weight: 1}, {members: ['c', 'd'], weight: 1}];
 assert.equal(hypergraphModularity(pairs, {a: 1, b: 1, c: 2, d: 2}), .5);
 assert.throws(() => hypergraphModularity(edges, {a: 1}), /missing a member/);
});

test('identical weighted pair projections can have different whole-combination modularity', () => {
 const triple = [{members: ['a', 'b', 'c'], weight: 1}];
 const pairs = [{members: ['a', 'b'], weight: .5}, {members: ['a', 'c'], weight: .5}, {members: ['b', 'c'], weight: .5}];
 const membership = {a: 1, b: 1, c: 2};
 assert.notEqual(hypergraphModularity(triple, membership), hypergraphModularity(pairs, membership));
});

test('direct refinement never decreases its hypergraph objective and is deterministic', () => {
 const edges = [{members: ['a', 'b', 'c'], weight: 3}, {members: ['d', 'e', 'f'], weight: 3}, {members: ['c', 'd', 'e'], weight: .1}];
 const initial = {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6};
 const result = refineHypergraph(edges, initial);
 assert(result.quality >= hypergraphModularity(edges, initial));
 assert.deepEqual(result, refineHypergraph(edges, initial));
 const best = hypergraphPartition({}, edges);
 assert.equal(best.trials, 10); assert.equal(best.trialResults.length, 10);
 assert.equal(best.quality, Math.max(...best.trialResults.map(trial => trial.quality)));
 assert.deepEqual(best.memberships, hypergraphPartition({}, edges).memberships);
});

test('official Infomap engine finds two strongly connected groups using fractional weights', async () => {
 const links = [];
 for (const members of [['a', 'b', 'c'], ['d', 'e', 'f']]) for (let left = 0; left < members.length; left++) for (let right = left + 1; right < members.length; right++) links.push({source: members[left], target: members[right], strength: .1});
 links.push({source: 'c', target: 'd', strength: .0001});
 const {ids, network} = infomapInput({links});
 assert(network.includes('0.0001'));
 const result = infomapResult(await run(network, {args: INFOMAP_ARGS}), ids);
 assert.equal(new Set(Object.values(result.memberships)).size, 2);
 assert.equal(result.memberships.a, result.memberships.c);
 assert.notEqual(result.memberships.a, result.memberships.d);
 assert(Number.isFinite(result.quality));
 assert.throws(() => infomapResult({json: {nodes: []}}, ids), /omitted connected nodes/);
});

test('alternate results preserve edges and isolates, remove Leiden audits, and report comparison coverage', () => {
 const original = structuredClone(graph), copy = structuredClone(graph), linksBefore = structuredClone(copy.links);
 const result = applyCommunityResult(copy, {algorithm: 'infomap', memberships: {a: 1, b: 1, c: 2}});
 assert.equal(result.nodes.find(node => node.id === 'z').cluster, 0);
 assert.equal(result.stats.clusters, 2); assert.equal(result.stats.isolated_nodes, 2);
 assert.equal(result.autoCPM, null); assert.equal(result.resolution, null);
 assert.equal(result.analysisId, null); assert.equal(result.derivedFromAnalysisId, 'fixture');
 assert.equal(result.comparison.sharedNodes, 3); assert.equal(result.comparison.baselineLinkedNodes, 4);
 assert.deepEqual(result.links, linksBefore); assert.deepEqual(graph, original);
});

test('published worker returns whole-combination memberships and explicit bounded errors', () => {
 const messages = [], context = {self: {postMessage: message => messages.push(message)}};
 vm.runInNewContext(fs.readFileSync('public/conservative-atlas/community-worker.js', 'utf8'), context);
 context.self.onmessage({data: {graph, bundles}});
 assert.equal(messages.at(-1).result.algorithm, 'hypergraph');
 assert.equal(messages.at(-1).hyperedges.length, 4);
 assert.equal(messages.at(-1).result.trials, 10);
 context.self.onmessage({data: {graph: {...graph, order: 5}, bundles}});
 assert.equal(messages.at(-1).hyperedges.length, 0);
 assert.equal(Object.keys(messages.at(-1).result.memberships).length, 0);
 const members = Array.from({length: 17}, (_, index) => 'node-' + index);
 context.self.onmessage({data: {graph: {order: 8, nodes: members.map(id => ({id, articles})), links: []}, bundles: [{members, articles}]}});
 assert.match(messages.at(-1).error, /no truncated hypergraph was clustered/);
});

test('real corpus preserves original saved partitions and hyperedges exactly cover selected links', () => {
 const context = {window: {}};
 for (const file of ['data.js', 'settings-data.js', 'atlas-settings.js']) vm.runInNewContext(fs.readFileSync('public/conservative-atlas/' + file, 'utf8'), context);
 const {ATLAS_DATA: data, resolveAtlasGraph: resolve} = context.window;
 const original = JSON.stringify(data.graphs);
 for (const order of [2, 3, 4, 'all']) {
  const selected = resolve(`cocitation_s10_${order === 'all' ? 'all' : 'n' + order}_cpm0_02`, 'auto', 4);
  const hyperedges = buildHyperedges(selected, data.bundlesByScope[10]);
  const pairKeys = new Set(hyperedges.flatMap(edge => edge.members.flatMap((source, index) => edge.members.slice(index + 1).map(target => JSON.stringify([source, target].sort())))));
  assert.equal(pairKeys.size, selected.links.length);
  for (const edge of selected.links) assert(pairKeys.has(JSON.stringify([edge.source, edge.target].sort())));
  assert(hyperedges.every(edge => edge.members.length >= 2 && edge.members.length <= 4 && edge.articles.length >= 5));
 }
 assert.equal(JSON.stringify(data.graphs), original);
});
