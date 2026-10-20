import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReliability} from './network-reliability.mjs';

const endpoint = process.env.BIBLIOMAP_BLOCKMODEL_URL;
test('real graph-tool inference returns a nested hierarchy and its own recovery samples', {skip: !endpoint}, async () => {
 const nodes = Array.from({length: 24}, (_, index) => ({id: 'n' + index, articles: ['s1','s2','s3','s4','s5','s6']})), links = [];
 for (let left = 0; left < nodes.length; left++) for (let right = left + 1; right < nodes.length; right++) if (Math.floor(left / 6) === Math.floor(right / 6) || (right === left + 1 && left % 6 === 5)) links.push({source: nodes[left].id, target: nodes[right].id, strength: 1, count: 6, articles: ['s1','s2','s3','s4','s5','s6']});
 const fit = async (network, starts = 2) => {
  const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:network.nodes.map(node=>node.id),edges:network.links.map(edge=>[edge.source,edge.target]),starts})});
  assert.equal(response.status, 200); return response.json();
 };
 const result = await fit({nodes,links});
 assert.equal(result.algorithm, 'sbm'); assert.match(result.engine, /graph-tool/);
 assert(Number.isFinite(result.quality)); assert.equal(result.startScores.length, 2);
 assert.equal(Object.keys(result.memberships).length, 24);
 for (let index = 1; index < result.hierarchy.length; index++) {
  const parents = new Map();
  for (const node of nodes) {
   const child = result.hierarchy[index - 1].memberships[node.id], parent = result.hierarchy[index].memberships[node.id];
   if (parents.has(child)) assert.equal(parents.get(child), parent);
   parents.set(child, parent);
  }
 }
 const graph = {nodes:nodes.map(node=>({...node,cluster:result.memberships[node.id]})),links,order:2,minimumSupport:5,clustering:result};
 const session = prepareReliability(graph,['s1','s2','s3','s4','s5','s6'],10);
 assert.equal(session.algorithm,'sbm');
 assert.throws(()=>session.partition(session.sample(0)), /own engine/);
 const sampled = await fit(session.sample(0).graph);
 session.record(sampled);
 assert.equal(sampled.algorithm,'sbm');
});
