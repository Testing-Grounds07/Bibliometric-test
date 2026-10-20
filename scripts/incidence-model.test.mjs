import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {run} from '@mapequation/infomap/node';
import {incidenceNetwork, HYPERGRAPH_MODEL_VERSION, isIncidenceModel} from './hypergraph-network.mjs';
import {infomapInput, infomapResult, infomapArgs} from './community-methods.mjs';
import {partition, densityGrid, fragmentation} from './auto-cpm.mjs';
import {prepareReliability} from './network-reliability.mjs';
import {runSettingsSearch, materializeSetting} from './method-settings.mjs';
import {clusterDecks, deckCoordinates} from './hypergraph-overview-core.mjs';

const graph = {networkModel: 'hypergraph', order: 3, minimumSupport: 1, resolution: .02, clustering: {algorithm: 'leiden', modelVersion: HYPERGRAPH_MODEL_VERSION}, nodes: ['a','b','c','d','e','f','z'].map((id, position) => ({id, cluster: id === 'z' ? 0 : position < 3 ? 1 : 2, articles: ['s1','s2','s3']})), links: [{source: 'a', target: 'b', strength: 999, articles: ['s1','s2','s3']}, {source: 'd', target: 'e', strength: 999, articles: ['s1','s2','s3']}], hyperedges: [{id: 'first', members: ['a','b','c'], weight: 6, articles: ['s1','s2','s3']}, {id: 'second', members: ['d','e','f'], weight: 6, articles: ['s1','s2','s3']}]};
const python = '.trials/hypergraph-engine/Scripts/python.exe';
function fit(network, settings = {}) {
 const incidence = incidenceNetwork(network);
 return JSON.parse(execFileSync(python, ['scripts/incidence-service.py', '--fit'], {input: JSON.stringify({nodes: incidence.articleIds, groups: incidence.groups, resolution: settings.resolution || .02, trials: settings.trials || 2, seed: settings.seed || 42}), encoding: 'utf8'}));
}

test('incidence preserves full group identity and has no article-to-article edges', () => {
 const before = structuredClone(graph), network = incidenceNetwork(graph);
 assert.equal(network.links.length, 6); assert.equal(network.articleIds.length, 6);
 assert.equal(network.groups.length, 2); assert.equal(network.density, .5);
 assert(network.links.every(edge => edge.source < 6 && edge.target >= 6 && edge.strength === 6));
 assert.deepEqual(graph, before); assert.equal(densityGrid(graph).density, .5);
 assert.throws(() => incidenceNetwork({...graph, hyperedges: [{members: ['a','unknown'], weight: 1}]}), /Unknown/);
 assert.throws(() => partition(graph, .02), /must use the incidence/);
 assert(!isIncidenceModel({...graph, clustering: {algorithm: 'leiden'}}));
 assert.equal(fragmentation(graph, {a: 1, b: 1, c: 1, d: 2, e: 2, f: 2}).introducedTinyNodeFraction, 0);
});

test('official Infomap encodes article and group visits but returns only article memberships', async () => {
 const network = {...graph, clustering: {...graph.clustering, algorithm: 'infomap'}}, {ids, network: input} = infomapInput(network);
 assert.equal(ids.length, 8); assert.equal(ids.filter(id => id === null).length, 2); assert(!input.includes('999'));
 const result = infomapResult(await run(input, {args: infomapArgs({trials: 2})}), ids, {...network.clustering, networkModel: 'hypergraph', trials: 2});
 assert.equal(Object.keys(result.memberships).length, 6); assert.equal(result.memberships.a, result.memberships.c); assert.notEqual(result.memberships.a, result.memberships.d);
 assert.equal(result.modelVersion, HYPERGRAPH_MODEL_VERSION); assert.match(result.objective, /article and group visits/); assert.match(result.limitations, /memoryless/);
 assert.throws(() => infomapResult({json: {nodes: [{id: 100, path: [1]}]}}, ids, network.clustering), /unknown/);
});

test('real bipartite Leiden uses only cross-class penalties, not ordinary CPM', {skip: !fs.existsSync(python)}, () => {
 const result = fit(graph);
 assert.equal(result.clusters, 2); assert.deepEqual(result.withinClassResolution, [0, 0]); assert.equal(result.groupNodes, 2);
 assert.equal(Object.keys(result.memberships).length, 6); assert.equal(result.memberships.a, result.memberships.c); assert.notEqual(result.memberships.a, result.memberships.d);
 assert(Math.abs(result.quality - (12 - 2 * .02 * 6)) < 1e-9);
 assert.deepEqual(result, fit(graph));
});

test('incidence settings and bootstraps dispatch to the bipartite engine and retain model provenance', {skip: !fs.existsSync(python)}, async () => {
 let solves = 0;
 const report = await runSettingsSearch(graph, ['s1','s2','s3'], async (network, settings) => { solves++; assert(isIncidenceModel(network)); assert.equal(settings.algorithm, 'leiden'); return fit(network, settings); }, () => {}, {settings: [{resolution: .02, label: 'Bipartite CPM .02'}], screenOnly: true});
 assert.equal(solves, 14); const applied = materializeSetting(graph, report.candidates[0]);
 assert.equal(applied.clustering.modelVersion, HYPERGRAPH_MODEL_VERSION); assert.match(applied.clustering.label, /incidence/);
 const session = prepareReliability(applied, ['s1','s2','s3'], 10);
 for (let position = 0; position < 10; position++) { const sample = session.sample(position); assert(isIncidenceModel(sample.graph)); assert(sample.graph.hyperedges); session.record(fit(sample.graph)); }
 assert.equal(session.finish().samples, 10);
});

test('3D overview includes every linked cluster and never clips cross-cluster groups', () => {
 const complete = {...graph, nodes: [...graph.nodes, {id: 'lonely', cluster: 3}], hyperedges: [...graph.hyperedges, {id: 'cross', members: ['b','c','d'], weight: 1, articles: ['s1']}]};
 const before = structuredClone(complete), decks = clusterDecks(complete, 3);
 assert.equal(decks.length, 3); assert.equal(decks.at(-1).nodes.length, 1); assert.equal(decks.at(-1).groups.length, 0);
 const crossed = decks.flatMap(deck => deck.groups).find(edge => edge.id === 'cross'); assert.deepEqual(crossed.members, ['b','c','d']); assert.equal(crossed.crossing, true);
 assert.equal(decks.reduce((sum, deck) => sum + deck.groups.filter(edge => edge.id === 'cross').length, 0), 2);
 for (const deck of decks) { const points = deckCoordinates(deck); assert([...deck.nodes.map(node => node.id), ...deck.groups.flatMap(edge => edge.members)].every(id => points[id] && Number.isFinite(points[id].x))); }
 assert.deepEqual(complete, before); assert.throws(() => clusterDecks(graph, 0));
});

test('3D previews prefer higher-order groups to pairs without changing evidence weights', () => {
 const mixed = {...graph, hyperedges: [{id: 'pair', members: ['a','b'], weight: 1000, articles: Array(100).fill('s')}, ...graph.hyperedges]};
 const decks = clusterDecks(mixed, 1);
 assert.equal(decks[0].groups[0].members.length, 3);
 assert.equal(mixed.hyperedges[0].weight, 1000);
});
