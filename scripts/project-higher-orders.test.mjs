import test from 'node:test';
import assert from 'node:assert/strict';
import {mineProjectBundles, projectOrderGraph} from './project-higher-orders.mjs';
import {buildProjectGraph} from './workspace-projects-core.mjs';
import {generationKey, generationText} from './project-generation.mjs';

const transactions = ['ABCD', 'ABCD', 'ABCE', 'ABCE', 'ABF', 'ACF', 'XYZ', 'XYZ'];
const works = transactions.map((references, position) => ({id: 'source-' + position, display_name: 'Source ' + position, referenced_works: [...references]}));
const base = buildProjectGraph(works, [], {threshold: 2, support: 2});
const artifact = mineProjectBundles(base.nodes, 2);
const supportFor = members => works.filter(work => members.every(id => work.referenced_works.includes(id))).map(work => work.id);

test('closed bundles losslessly represent every supported triple and larger set', () => {
 const ids = base.nodes.map(node => node.id).sort();
 for (let mask = 0; mask < 2 ** ids.length; mask++) {
  const members = ids.filter((id, position) => mask & 2 ** position);
  if (members.length < 3) continue;
  const expected = supportFor(members);
  const actual = [...new Set(artifact.bundles.filter(bundle => members.every(id => bundle.members.includes(id))).flatMap(bundle => bundle.articles))].sort();
  assert.deepEqual(actual, expected.length >= 2 ? expected.sort() : [], members.join(''));
 }
 assert.equal(artifact.maximumOrder, 4);
 for (const bundle of artifact.bundles) assert.deepEqual(bundle.articles, supportFor(bundle.members).sort());
});

test('single-order projection counts distinct supporting sources, not overlapping bundles', () => {
 const triples = projectOrderGraph(base, artifact, {order: 3});
 const edge = triples.links.find(edge => [edge.source, edge.target].sort().join('') === 'AB');
 assert.equal(edge.count, 4); assert.deepEqual(edge.articles, ['source-0', 'source-1', 'source-2', 'source-3']);
 assert.equal(triples.links.find(edge => [edge.source, edge.target].sort().join('') === 'XY').count, 2);
 const fourth = projectOrderGraph(base, artifact, {order: 4});
 assert(!fourth.nodes.some(node => node.id === 'X'));
 assert.equal(fourth.links.find(edge => [edge.source, edge.target].sort().join('') === 'AB').count, 4);
});

test('closed mining agrees with exhaustive itemsets across different incidence patterns', () => {
 let seed = 719;
 const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
 for (let trial = 0; trial < 12; trial++) {
  const ids = [...'ABCDEFG'], transactions = Array.from({length: 12}, (_, position) => ({id: 'S' + position, references: ids.filter(() => random() < .65)}));
  const nodes = ids.map(id => ({id, articles: transactions.filter(source => source.references.includes(id)).map(source => source.id)}));
  const result = mineProjectBundles(nodes, 3);
  for (let mask = 0; mask < 2 ** ids.length; mask++) {
   const members = ids.filter((id, position) => mask & 2 ** position);
   if (members.length < 3) continue;
   const expected = transactions.filter(source => members.every(id => source.references.includes(id))).map(source => source.id).sort();
   const actual = [...new Set(result.bundles.filter(bundle => members.every(id => bundle.members.includes(id))).flatMap(bundle => bundle.articles))].sort();
   assert.deepEqual(actual, expected.length >= 3 ? expected : []);
  }
 }
});

test('combined weighting caps the order and counts each source once', () => {
 const combined = projectOrderGraph(base, artifact, {order: 'all', maximumOrder: 4});
 const edge = combined.links.find(edge => [edge.source, edge.target].sort().join('') === 'AB');
 assert.equal(edge.count, 5); assert.equal(edge.combinedScore, 4 * (1 + Math.log2(3)) + 1);
 assert.deepEqual(edge.orderProfile, [{order: 2, support: 5}, {order: 3, support: 4}, {order: 4, support: 4}]);
 const capped = projectOrderGraph(base, artifact, {order: 'all', maximumOrder: 2}).links.find(other => other.source === edge.source && other.target === edge.target);
 assert.equal(capped.combinedScore, edge.count); assert.equal(capped.higherOrderBonus, 0);
});

test('incompatible artifacts, unavailable orders and incomplete mining fail explicitly', () => {
 assert.throws(() => projectOrderGraph(base, {...artifact, complete: false}));
 assert.throws(() => projectOrderGraph({...base, minimumSupport: 3}, artifact));
 assert.throws(() => projectOrderGraph(base, artifact, {order: 5}));
 assert.throws(() => mineProjectBundles(base.nodes, 2, {limit: 0}), /no partial/);
 assert.equal(mineProjectBundles(base.nodes, 20).maximumOrder, 2);
});

test('generation uses incidence scope, preserves source/reference titles and abstracts', () => {
 assert.equal(generationKey(base), generationKey({...base, resolution: .1}));
 assert.notEqual(generationKey(base), generationKey({...base, minimumSupport: 3}));
 const input = generationText({id: 'corpus', works}, base, [{id: 'A', display_name: 'Foundation title', abstract_inverted_index: {Leadership: [0], research: [1]}}]);
 assert.equal(input.documents.find(document => document.id === 'A').abstract, 'Leadership research');
 assert.equal(input.documents.find(document => document.id === 'A').title, 'Foundation title');
 assert.equal(input.sourceIds.length, works.length); assert(input.referenceIds.includes('A'));
 const next = generationText({id: 'corpus', works}, {...base, nodes: []}, [{id: 'A', display_name: ''}], input);
 assert.equal(next.documents.find(document => document.id === 'A').title, 'Foundation title');
});
