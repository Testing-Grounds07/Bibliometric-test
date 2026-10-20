import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const data = JSON.parse((await readFile('public/conservative-atlas/data.js', 'utf8')).slice('window.ATLAS_DATA='.length).trim().replace(/;$/, ''));
for (const graph of Object.values(data.graphs)) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const bundles = new Map(data.bundlesByScope[graph.threshold].map(bundle => [bundle.id, bundle]));
  const counterpart = Object.values(data.graphs).find(other => other.threshold === graph.threshold && other.order === graph.order && other.resolution !== graph.resolution);
  assert.deepEqual(graph.links, counterpart.links);
  for (const edge of graph.links) {
    assert(edge.count >= 5);
    assert.equal(edge.count, new Set(edge.articles).size);
    assert(nodes.has(edge.source) && nodes.has(edge.target));
    if (graph.order === 'all') {
      const maximumByArticle = Object.fromEntries(edge.articles.map(article => [article, 2]));
      for (const id of edge.bundleIds) {
        const bundle = bundles.get(id);
        assert(bundle.members.includes(edge.source) && bundle.members.includes(edge.target));
        for (const article of bundle.articles) {
          assert(article in maximumByArticle);
          maximumByArticle[article] = Math.max(maximumByArticle[article], bundle.members.length);
        }
      }
      assert.deepEqual(edge.maximumOrderByArticle, maximumByArticle);
      const score = Object.values(maximumByArticle).reduce((sum, order) => sum + 1 + Math.log2(order - 1), 0);
      assert(Math.abs(edge.combinedScore - score) < 1e-9);
      for (const row of edge.orderProfile) assert.equal(row.support, Object.values(maximumByArticle).filter(order => order >= row.order).length);
      assert.equal(edge.strength, edge.combinedScore / (nodes.get(edge.source).citations * nodes.get(edge.target).citations));
    }
    if (graph.order > 2) {
      const evidence = new Set();
      for (const id of edge.bundleIds) {
        const bundle = bundles.get(id);
        assert(bundle.members.length >= graph.order);
        assert(bundle.articles.length >= 5);
        assert(bundle.members.includes(edge.source) && bundle.members.includes(edge.target));
        for (const article of bundle.articles) {
          assert(bundle.members.every(member => nodes.get(member).articles.includes(article)));
          evidence.add(article);
        }
      }
      assert.deepEqual([...evidence].sort(), [...edge.articles].sort());
      const previous = Object.values(data.graphs).find(other => other.threshold === graph.threshold && other.order === graph.order - 1 && other.resolution === graph.resolution);
      const previousEdge = previous.links.find(other => [other.source, other.target].includes(edge.source) && [other.source, other.target].includes(edge.target));
      assert(previousEdge && previousEdge.count >= edge.count);
    }
  }
  assert.equal(graph.stats.isolated_nodes, graph.nodes.filter(node => node.cluster === 0).length);
}
assert.equal(Math.max(...Object.values(data.graphs).filter(graph => graph.order !== 'all').map(graph => graph.order)), 10);
assert.equal(Object.keys(data.graphs).length, 50);
assert.deepEqual(Object.keys(data.methods), ['cocitation']);
console.log('Verified all 50 unified views, including combined scores independently reconstructed from complete bundle evidence.');
