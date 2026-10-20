import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const path = 'public/conservative-atlas/data.js';
const content = await readFile(path, 'utf8');
const data = JSON.parse(content.slice('window.ATLAS_DATA='.length).trim().replace(/;$/, ''));
const positions = JSON.parse(await readFile('.trials/conservative-cocitation/layout-unweighted.json', 'utf8'));
for (const [name, graph] of Object.entries(data.graphs)) {
  const next = positions[name];
  assert.deepEqual(graph.links, next.links);
  assert.equal(graph.nodes.length, next.nodes.length);
  const byId = new Map(next.nodes.map(node => [node.id, node]));
  for (const node of graph.nodes) {
    const other = byId.get(node.id);
    assert(other);
    node.x = other.x;
    node.y = other.y;
  }
}
data.summary.layout = {algorithm: 'unweighted spring within separately packed connected components', seed: 7, iterations: 350, affects_clustering: false};
await writeFile(path, 'window.ATLAS_DATA=' + JSON.stringify(data).replaceAll('<', '\\u003c') + ';\n');
for (const summary of ['public/conservative-atlas/summary.json', '.trials/conservative-cocitation/summary.json']) await writeFile(summary, JSON.stringify(data.summary));
const report = await readFile('public/conservative-atlas/report.html', 'utf8');
await writeFile('public/conservative-atlas/report.html', report + '<p>Display layout: unweighted spring within separately packed connected components, seed 7, 350 iterations. Analytical weights and Leiden groups are unchanged.</p>');
console.log('Updated display coordinates; all network edges and node memberships preserved.');
