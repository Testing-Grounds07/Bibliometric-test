import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

const directory = 'public/conservative-atlas/', context = {window: {}};
for (const name of ['data.js', 'settings-data.js', 'atlas-settings.js']) vm.runInNewContext(fs.readFileSync(directory + name, 'utf8'), context);
const data = context.window.ATLAS_DATA, settings = context.window.ATLAS_SETTINGS;
const evidence = JSON.parse(fs.readFileSync(directory + 'source-evidence.json'));

test('published Heifetz records have one node, combined years and unioned source support', () => {
 const graph = data.graphs.cocitation_s10_n2_cpm0_02, node = graph.nodes.find(node => node.id === 'W4207026187');
 assert.equal(graph.nodes.some(node => node.id === 'W1496461393'), false);
 assert.deepEqual([...node.years], [1994, 2009]); assert.equal(node.variants.length, 2); assert.equal(node.citations, 165);
 assert.equal(new Set(node.articles).size, node.citations);
 const sources = evidence.articles.filter(article => article.references.includes(node.key));
 assert.equal(sources.length, node.citations);
});

test('all default orders, source evidence and expanded drills use the same canonical identities', () => {
 const aliases = new Set(data.summary.deduplication.mergedGroups.flatMap(group => group.records.filter(record => record.id !== group.canonicalId).map(record => record.id)));
 for (const article of evidence.articles) { assert.equal(new Set(article.references).size, article.references.length); assert(article.references.every(id => !aliases.has(id))); }
 const expanded = JSON.parse(fs.readFileSync(directory + 'expanded-data.json'));
 for (const graph of [...Object.values(data.graphs), expanded.base]) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  assert.equal(nodes.size, graph.nodes.length);
  for (const node of graph.nodes) { assert(!aliases.has(node.key)); assert.equal(new Set(node.articles).size, node.citations); }
  for (const edge of graph.links) {
   assert.notEqual(edge.source, edge.target); assert(nodes.has(edge.source) && nodes.has(edge.target));
   assert.equal(new Set(edge.articles).size, edge.count); assert(edge.count >= graph.minimumSupport);
   assert(edge.articles.every(id => nodes.get(edge.source).articles.includes(id) && nodes.get(edge.target).articles.includes(id)));
  }
 }
 for (const [threshold, bundles] of Object.entries(data.bundlesByScope)) {
  const graph = data.graphs[`cocitation_s${threshold}_n2_cpm0_02`], nodes = new Map(graph.nodes.map(node => [node.id, node]));
  for (const bundle of bundles) {
   assert.equal(new Set(bundle.members).size, bundle.members.length);
   const actual = nodes.get(bundle.members[0]).articles.filter(article => bundle.members.every(id => nodes.get(id).articles.includes(article))).sort();
   assert.deepEqual([...bundle.articles].sort(), [...actual]);
  }
 }
});

test('CPM bootstrap audits were rebuilt for the published cleaned graph, not copied from old memberships', () => {
 assert.equal(settings.sourceDataSha256, createHash('sha256').update(fs.readFileSync(directory + 'data.js')).digest('hex'));
 for (const config of Object.values(settings.configs)) {
  const graph = data.graphs[config.base], ids = new Set(graph.nodes.map(node => node.id));
  assert.equal(config.bootstrapCount, 50);
  for (const candidate of config.candidates) assert(Object.keys(candidate.memberships).every(id => ids.has(id)));
  const resolved = context.window.resolveAtlasGraph(config.base, 'auto', config.maximumOrder);
  assert.equal(resolved.deduplication.version, 1);
 }
});
