import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {run as runInfomap} from '@mapequation/infomap/node';
import {prepareReliability, resampleHyperedges} from './network-reliability.mjs';
import {infomapInput, infomapResult, INFOMAP_ARGS} from './community-methods.mjs';
import {couplingGraph, couplingPairs, bootstrapWeights} from './evidence-metrics.mjs';

const articles = [{id: 'alpha', references: ['one', 'two', 'three']}, {id: 'beta', references: ['one', 'two', 'three']}, {id: 'isolated', references: []}];
function graphFor(algorithm) {
 const graph = couplingGraph(articles, couplingPairs(articles), 1, 0);
 graph.nodes.forEach(node => { node.cluster = node.id === 'isolated' ? 0 : 1; });
 return {...graph, resolution: .02, clustering: {algorithm}};
}

test('source-normalized co-citation hyperedges reapply support and conserve each sampled source contribution', () => {
 const edges = [{members: ['alpha', 'beta'], articles: ['source1', 'source2']}, {members: ['alpha', 'gamma'], articles: ['source1']}];
 const result = resampleHyperedges(edges, {source1: 2, source2: 1}, 2);
 assert.deepEqual(result.map(edge => edge.weight), [2, 1]);
 assert.equal(result.reduce((sum, edge) => sum + edge.weight, 0), 3);
 assert.deepEqual(resampleHyperedges(edges, {source1: 1, source2: 1}, 2).map(edge => edge.weight), [2]);
});

test('coupling hypergraph samples carry reference multiplicities and preserve the original analysis', () => {
 const graph = graphFor('hypergraph'), before = structuredClone(graph), session = prepareReliability(graph, [], 10);
 const weights = bootstrapWeights(['one', 'three', 'two'], 0), sample = session.sample(0);
 for (const edge of sample.hyperedges) assert.equal(edge.weight, weights[edge.reference]);
 assert.equal(sample.hyperedges.reduce((sum, edge) => sum + edge.weight, 0), 3);
 assert.deepEqual(graph, before);
 assert.throws(() => session.finish(), /Incomplete/);
});

for (const algorithm of ['leiden', 'hypergraph', 'infomap']) test(algorithm + ' reliability reruns its own objective and produces a complete audit', async () => {
 const graph = graphFor(algorithm), session = prepareReliability(graph, [], 10);
 for (let index = 0; index < 10; index++) {
  const sample = session.sample(index);
  if (algorithm === 'infomap') {
   assert.throws(() => session.partition(sample), /own engine/);
   const {ids, network} = infomapInput(sample.graph);
   session.record(infomapResult(await runInfomap(network, {args: INFOMAP_ARGS.replace('--num-trials 10', '--num-trials 2')}), ids));
  } else session.record(session.partition(sample));
 }
 const result = session.finish();
 assert.equal(result.algorithm, algorithm); assert.equal(result.samples, 10); assert.equal(result.preliminary, true);
 assert.equal(result.restarts, 2); assert.equal(result.clusters[1].meanJaccard, 1); assert.equal(result.clusters[1].meanRetention, 1);
});

test('published reliability worker handles whole groups and Infomap handshake without substituting Leiden', () => {
 for (const algorithm of ['hypergraph', 'infomap']) {
  const messages = [], queue = [], sandbox = {self: {postMessage: message => messages.push(message)}, setTimeout: callback => queue.push(callback)};
  vm.runInNewContext(fs.readFileSync('public/conservative-atlas/reliability-worker.js', 'utf8'), sandbox);
  sandbox.self.onmessage({data: {start: true, graph: graphFor(algorithm), articleIds: [], samples: 10}});
  if (algorithm === 'infomap') for (let index = 0; index < 10; index++) {
   assert(messages.at(-1).infomap);
   sandbox.self.onmessage({data: {partition: {memberships: {alpha: 1, beta: 1}}}});
  }
  while (queue.length) queue.shift()();
  assert.equal(messages.at(-1).result.algorithm, algorithm);
  assert.equal(messages.at(-1).result.samples, 10);
 }
});

test('reliability lives in the shared canvas rather than a third workspace tab', () => {
 const explorer = fs.readFileSync('scripts/evidence-explorer.mjs', 'utf8');
 const app = fs.readFileSync('public/conservative-atlas/app.js', 'utf8');
 assert(!explorer.includes("['references', 'Roles & reliability']"));
 assert(app.includes('syncCanvasReliability(graph,'));
 assert(app.includes('reliability:graph.reliability||null'));
 assert(app.includes('settingsSearch:graph.settingsSearch||null'));
 assert(app.includes('graph.bundles||data.bundlesByScope[graph.threshold]||[]'));
});

test('higher-order Infomap samples retain supported bundle evidence and reject unsupported algorithms', () => {
 const sources = ['source1', 'source2', 'source3', 'source4', 'source5'];
 const graph = {clustering: {algorithm: 'infomap'}, order: 3, minimumSupport: 5,
  nodes: ['alpha', 'beta', 'gamma'].map(id => ({id, articles: sources, cluster: 1})),
  links: [['alpha', 'beta'], ['beta', 'gamma'], ['alpha', 'gamma']].map(([source, target]) => ({source, target, articles: sources, strength: .2, bundleIds: ['bundle']})),
  bundles: [{id: 'bundle', members: ['alpha', 'beta', 'gamma'], articles: sources}]};
 assert.equal(prepareReliability(graph, sources, 10).sample(0).graph.links.length, 3);
 assert.throws(() => prepareReliability({...graph, clustering: {algorithm: 'unknown'}}, sources, 10), /does not support/);
 assert.throws(() => prepareReliability(graph, sources, 20), /10 or 50/);
});

test('50-resample audit is complete rather than preliminary', () => {
 const session = prepareReliability(graphFor('leiden'), [], 50);
 for (let index = 0; index < 50; index++) session.record(session.partition(session.sample(index)));
 assert.equal(session.finish().samples, 50);
 assert.equal(session.finish().preliminary, false);
});
