import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildHistoriography, citationCore, citationKey, reduceCitations} from './historiography.mjs';
import {nativeNetwork, workspaceNetworkMethod} from './workspace-projects-core.mjs';
import {mapSignature} from './workspace-routing.mjs';
import {graphRows} from '../neo4j-store.mjs';

const article = (id, year, references = []) => ({id, title: 'Article ' + id, year, references, authors: 'Author ' + id});
const corpus = [article('a', 2000), article('b', 2010, ['a']), article('c', 2020, ['a','b','b','c','external']), article('d', 2021, ['a']), article('unknown', null, ['a'])];
const reach = (nodes, links) => {
 const adjacent = new Map(nodes.map(node => [node.id, []])); for (const edge of links) adjacent.get(edge.source).push(edge.target);
 const result = [];
 for (const node of nodes) { const seen = new Set(), queue = [...adjacent.get(node.id)]; for (let position = 0; position < queue.length; position++) if (!seen.has(queue[position])) { seen.add(queue[position]); queue.push(...adjacent.get(queue[position])); } for (const id of seen) result.push(node.id + '>' + id); }
 return result.sort();
};

test('history uses directed binary source-to-source citations and audits duplicates and external references', () => {
 const before = structuredClone(corpus), graph = buildHistoriography(corpus);
 assert.equal(graph.links.length, 5); assert(graph.links.every(edge => edge.count === 1 && edge.strength === 1));
 assert.equal(graph.historiography.selfCitations, 1); assert.equal(graph.historiography.duplicateReferences, 1); assert.equal(graph.historiography.externalReferences, 1);
 assert.equal(graph.nodes.find(node => node.id === 'a').citations, 4); assert(!graph.nodes.some(node => node.id === 'external'));
 assert.deepEqual(corpus, before); assert.equal(graph.directed, true); assert.equal(graph.historiography.reduction.removed, 1);
});

test('recursive core is not an incoming-citation cutoff and never auto-lowers an empty core', () => {
 const star = [article('center', 2000), ...Array.from({length: 12}, (_, position) => article('leaf' + position, 2020, ['center']))];
 const graph = buildHistoriography(star, {core: 2}); assert.equal(graph.nodes.length, 0); assert.equal(graph.historiography.coreArticles, 0); assert.equal(graph.historiography.settings.core, 2);
 assert.equal(buildHistoriography(star, {core: 1}).nodes.length, 13);
 const triangle = buildHistoriography(corpus.slice(0,3), {core: 2}); assert.equal(triangle.nodes.length, 3);
 const reciprocal = citationCore([{id:'a'},{id:'b'}], [{source:'a',target:'b'},{source:'b',target:'a'}], 2); assert.equal(reciprocal.size, 0);
});

test('ranking is calculated before capping and reduction never invents paths through omitted articles', () => {
 const graph = buildHistoriography(corpus, {limit: 2});
 assert.equal(graph.nodes.length, 2); assert.equal(graph.nodes[0].id, 'a'); assert.equal(graph.nodes[0].citations, 4); assert.equal(graph.historiography.cappedArticles, 3);
 assert.equal(graph.historiography.coreLinks, 5); assert.equal(graph.links.length, 1); assert.equal(graph.historiography.reduction.removed, 0);
});

test('DAG transitive reduction preserves exactly the reachability of the displayed graph', () => {
 for (let size = 2; size <= 35; size++) {
  const nodes = Array.from({length:size}, (_, position) => ({id:'node'+position})), links = [];
  for (let source = 0; source < size; source++) for (let target = source + 1; target < size; target++) if ((source * 17 + target * 13) % 7 < 3) links.push({source:nodes[source].id,target:nodes[target].id});
  const reduction = reduceCitations(nodes, links), keys = new Set(reduction.kept), retained = links.filter(edge => keys.has(citationKey(edge)));
  assert.equal(reduction.hasCycle, false); assert.deepEqual(reach(nodes, links), reach(nodes, retained));
  for (const edge of retained) assert.notDeepEqual(reach(nodes, retained.filter(other => other !== edge)), reach(nodes, retained));
 }
});

test('same-year cycles are protected without losing or reversing their citation links', () => {
 const graph = buildHistoriography([article('a', 2000, ['b']), article('b', 2000, ['a'])]);
 assert.equal(graph.links.length, 2); assert.equal(graph.historiography.reduction.hasCycle, true); assert.equal(graph.historiography.reduction.kept.length, 2);
 assert.equal(graph.historiography.reduction.removed, 0);
 assert.equal(graph.historiography.reduction.mode, 'scc-condensation'); assert.equal(graph.historiography.reduction.cycleArticles, 2);
});

test('cyclic graphs reduce only redundant inter-component relations and preserve full reachability', () => {
 const nodes = ['a','b','c','d','e'].map(id => ({id})), links = [['a','b'],['b','a'],['a','c'],['b','c'],['c','d'],['a','d'],['d','e'],['e','d'],['b','e']].map(([source,target]) => ({source,target}));
 const reduction = reduceCitations(nodes, links), keys = new Set(reduction.kept), reduced = links.filter(edge => keys.has(citationKey(edge)));
 assert.equal(reduction.mode, 'scc-condensation'); assert(reduction.removed > 0); assert.deepEqual(reach(nodes, reduced), reach(nodes, links));
 for (const pair of [['a','b'],['b','a'],['d','e'],['e','d']]) assert(keys.has(citationKey({source:pair[0],target:pair[1]})));
});

test('chronology preserves years, flags forward-year citations and separates unknown dates', () => {
 const graph = buildHistoriography([...corpus, article('early', 1990, ['c'])]);
 assert.equal(graph.historiography.futureDatedLinks, 1); assert(graph.links.find(edge => edge.source === 'early').futureDated);
 const positions = new Map(graph.nodes.map(node => [node.id, node.y])); assert(positions.get('a') < positions.get('b')); assert(positions.get('b') < positions.get('c')); assert(positions.get('unknown') > positions.get('d'));
 assert.deepEqual(graph, buildHistoriography([...corpus, article('early', 1990, ['c'])]));
});

test('inclusive year scope and missing-year policy are applied before core and ranking', () => {
 const graph = buildHistoriography(corpus, {from:2010,through:2020,includeUndated:false});
 assert.deepEqual(graph.nodes.map(node => node.id).sort(), ['b','c']); assert.equal(graph.links.length, 1); assert.equal(graph.nodes.find(node => node.id === 'b').citations, 1);
 assert.equal(buildHistoriography(corpus, {includeUndated:false}).nodes.length, 4);
 assert.equal(buildHistoriography([article('none',null)]).historiography.layout.minimum, null);
});

test('invalid requests fail rather than silently truncating the analytical corpus', () => {
 for (const settings of [{core:-1},{limit:1001},{limit:1.5},{from:2025,through:2020}]) assert.throws(() => buildHistoriography(corpus, settings));
 assert.throws(() => buildHistoriography([article('a',2000),article('a',2001)]), /Duplicate/);
 assert.throws(() => buildHistoriography(Array(20001).fill(article('a',2000))), /no partial/);
});

test('history snapshots retain native direct-citation semantics and distinguish settings and view changes', () => {
 const graph = buildHistoriography(corpus), native = nativeNetwork(graph);
 assert.equal(workspaceNetworkMethod(graph), 'direct_citation'); assert.equal(native.method, 'direct_citation'); assert.equal(native.directed, true); assert.deepEqual(native.historiography, graph.historiography);
 const rows = graphRows('analyses', {id:'history-test',network:native}); assert.equal(rows.networkType,'DIRECT_CITATION'); assert.equal(rows.networkEdges.length,graph.links.length); assert.equal(JSON.parse(rows.networkEdges[0].payload).source,graph.links[0].source);
 const snapshot = {graph, controls: {}, historyView: {reduced:true}, hiddenClusters:[]}, before = mapSignature(snapshot); snapshot.historyView.reduced = false; assert.notEqual(before, mapSignature(snapshot));
 snapshot.historyView.reduced = true; graph.historiography.settings.core = 1; assert.notEqual(before, mapSignature(snapshot));
 assert.equal(workspaceNetworkMethod({canvasKind:'coupling'}), 'bibliographic_coupling'); assert.equal(workspaceNetworkMethod({}), 'co_citation');
});

test('published history worker uses the same pure computation and reports errors', () => {
 const messages = [], sandbox = {self:{postMessage:message=>messages.push(message)}}; vm.runInNewContext(fs.readFileSync('public/conservative-atlas/historiography-worker.js','utf8'), sandbox);
 sandbox.self.onmessage({data:{articles:corpus,options:{core:2}}}); assert.equal(messages.at(-1).result.nodes.length, 3);
 sandbox.self.onmessage({data:{articles:corpus,options:{core:-1}}}); assert.match(messages.at(-1).error, /core/);
});

test('history help shows data coverage without comparison notes or resource links', () => {
 const browser = fs.readFileSync('scripts/historiography-browser.mjs','utf8'), shell = fs.readFileSync('public/conservative-atlas/workspace-shell.js','utf8');
 assert.equal(fs.existsSync('public/conservative-atlas/vogel-methods.html'), false);
 assert.equal(browser.includes('How this differs from Vogel'), false); assert.equal(browser.includes('vogel-methods.html'), false); assert.equal(shell.includes('vogel-methods.html'), false); assert(browser.includes('audit.open = true'));
 assert(browser.includes('aria-controls')); assert(browser.includes('parentSnapshot.reference || parentSnapshot')); assert(browser.includes('No thematic clustering or bootstrap reliability'));
});
