import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {couplingHyperedges} from './coupling-hypergraph.mjs';
import {hypergraphPartition, applyCommunityResult} from './community-methods.mjs';
import {couplingCanvasGraph} from './shared-canvas.mjs';

const fixture = () => ({method: 'coupling', resolution: .02, nodes: [
 {id: 'alpha', references: ['shared', 'shared', 'pair'], cluster: 1},
 {id: 'beta', references: ['shared', 'pair'], cluster: 1},
 {id: 'gamma', references: ['shared'], cluster: 2},
 {id: 'isolated', references: ['shared'], cluster: 0}
], links: [{source: 'alpha', target: 'beta', strength: 1}, {source: 'beta', target: 'gamma', strength: .5}]});

test('coupling hyperedges preserve whole reference groups and distinct source membership', () => {
 const graph = fixture(), before = structuredClone(graph);
 assert.deepEqual(couplingHyperedges(graph), [
  {members: ['alpha', 'beta'], weight: 1, reference: 'pair', order: 2},
  {members: ['alpha', 'beta', 'gamma'], weight: 1, reference: 'shared', order: 3}
 ]);
 assert.deepEqual(graph, before);
 assert.deepEqual(couplingHyperedges({...graph, links: []}), []);
 assert.throws(() => couplingHyperedges(graph, 2), /no truncated result/);
});

test('coupling community results keep method identity and original pair evidence', () => {
 const graph = fixture(), edges = couplingHyperedges(graph);
 const result = hypergraphPartition(graph, edges);
 const clustered = applyCommunityResult(structuredClone(graph), result, edges);
 const canvas = couplingCanvasGraph(clustered);
 assert.equal(canvas.clustering.label, 'Coupling · Hypergraph modularity');
 assert.equal(canvas.resolution, null);
 assert.deepEqual(canvas.links, graph.links);
 assert.deepEqual(canvas.hyperedges, edges);
 assert.equal(canvas.nodes.find(node => node.id === 'isolated').cluster, 0);
 assert.equal(canvas.comparison.baseline, 'Leiden CPM');
});

test('published coupling hypergraph worker uses the source-reference construction', () => {
 for(const options of [{},{networkModel:'hypergraph'},{networkModel:'hypergraph',algorithm:'hypergraph'}]){
  const messages = [], sandbox = {self: {postMessage: message => messages.push(message)}, console};
  vm.runInNewContext(fs.readFileSync('public/conservative-atlas/community-worker.js', 'utf8'), sandbox);
  sandbox.self.onmessage({data: {graph: fixture(), bundles: [],options}});
  const output = messages.at(-1);
  assert.equal(output.error, undefined);assert(!output.incidence);assert.equal(output.result.algorithm,'hypergraph');
  assert.equal(output.hyperedges.length, 2);
  assert.match(output.result.method, /unit weight per reference/);
 }
});

test('reliability refuses alternative-method partitions instead of silently using Leiden', () => {
 const messages = [], sandbox = {self: {postMessage: message => messages.push(message)}, console};
 vm.runInNewContext(fs.readFileSync('public/conservative-atlas/evidence-worker.js', 'utf8'), sandbox);
 for (const algorithm of ['infomap', 'hypergraph']) {
  sandbox.self.onmessage({data: {action: 'stability', graph: {clustering: {algorithm}}}});
  assert.match(messages.at(-1).error, /Leiden resamples cannot validate/);
 }
});

test('both analysis focuses use one method selector and keep method identity in the shared session', () => {
 const html = fs.readFileSync('public/conservative-atlas/index.html', 'utf8');
 const app = fs.readFileSync('public/conservative-atlas/app.js', 'utf8');
 assert.equal(html.match(/id="clusteringMethod"/g).length, 1);
 assert(html.indexOf('id="clusteringMethod"') < html.indexOf('class="analysis-switches"'));
 assert(app.includes("if(isCoupling())window.ATLAS_EVIDENCE.changeCouplingMethod();else loadGraph()"));
 assert(app.includes("value:id==='clusteringMethod'?"));
});
