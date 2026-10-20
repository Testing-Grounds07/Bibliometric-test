import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {couplingCanvasGraph, couplingNodeRadius, COUPLING_METHOD} from './shared-canvas.mjs';

test('foundation labels yield to source labels during selection and search', () => {
 const app = fs.readFileSync('public/conservative-atlas/app.js', 'utf8');
 const body = app.match(/function foundationLabelsActive\(\)\{([^}]+)\}/)[1];
 const active = new Function('isCoupling', '$', 'state', body);
 const controls = {couplingLabelMode: {value: 'foundations'}, query: {value: ''}};
 const state = {selected: null};
 const check = () => active(() => true, id => controls[id], state);
 assert.equal(check(), true);
 state.selected = 'source-article';
 assert.equal(check(), false);
 state.selected = null;
 assert.equal(check(), true);
 controls.query.value = 'leadership';
 assert.equal(check(), false);
 controls.query.value = '';
 controls.couplingLabelMode.value = 'sources';
 assert.equal(check(), false);
 assert.equal(active(() => false, id => controls[id], state), false);
});

test('coupling nodes shrink with the overview instead of obscuring adjacent communities', () => {
 assert(couplingNodeRadius(362, 10, .22) < 5);
 assert.equal(couplingNodeRadius(100, 10, .25), couplingNodeRadius(100, 10, 1) / 4);
 assert(couplingNodeRadius(100, 10, 1) > couplingNodeRadius(10, 10, 1));
 assert(couplingNodeRadius(100, 18, 1) > couplingNodeRadius(100, 6, 1));
 assert.equal(couplingNodeRadius(1000, 18, 10), 22);
});

test('cluster and display controls live beside the canvas and retain existing handlers', () => {
 const app = fs.readFileSync('public/conservative-atlas/app.js', 'utf8');
 const html = fs.readFileSync('public/conservative-atlas/index.html', 'utf8');
 assert(html.includes('id="canvasFilters"'));
 assert(app.includes("$('canvasClusterSelect').append($('groupLabel'),$('cluster'))"));
 assert(app.includes("$('canvasDisplay').append(displaySection)"));
 assert(app.includes("$('canvasVisibility').append(host)"));
 assert(app.includes('mapVisibility.hideUnlinked=true'));
});

test('unlinked nodes start hidden and stay hidden by default when a new map loads', () => {
 const app = fs.readFileSync('public/conservative-atlas/app.js', 'utf8');
 assert(app.includes('const mapVisibility={hideUnlinked:true,hiddenClusters:new Set(),minimumClusterSize:1}'));
 assert(app.includes('mapVisibility.hideUnlinked=true;mapVisibility.hiddenClusters.clear();\n mountMapVisibility();') || app.includes('mapVisibility.hideUnlinked=true;mapVisibility.hiddenClusters.clear();\r\n mountMapVisibility();'));
 const controls = fs.readFileSync('scripts/evidence-explorer.mjs', 'utf8');
 assert(controls.includes("state.hideUnlinked ? 'Show unlinked nodes' : 'Hide unlinked nodes'"));
});

test('adapts source articles to the shared renderer without changing analytical evidence', () => {
 const original = {nodes: [{id: 'a', title: 'First article', authors: 'A. Author', references: ['r1', 'r2', 'r2'], cluster: 1}, {id: 'b', title: 'Second article', references: ['r1'], cluster: 1}, {id: 'c', title: 'Missing references', references: [], cluster: 0}], links: [{source: 'a', target: 'b', count: 1, strength: 1 / Math.sqrt(2), references: ['r1']}], minimumShared: 1, minimumCosine: 0, resolution: .02, clustering: {algorithm: 'Leiden CPM'}};
 const snapshot = structuredClone(original), adapted = couplingCanvasGraph(original, 'Sources citing cluster 4');
 assert.equal(adapted.nodes[0].label, 'First article');
 assert.equal(adapted.nodes[0].citations, 2);
 assert.equal(adapted.nodes[0].degree, 1);
 assert.equal(adapted.nodes[2].degree, 0);
 assert.deepEqual(adapted.nodes[0].foundation, {id: 'r1', count: 2, share: 1, members: 2});
 assert.equal(adapted.nodes[2].foundation, null);
 assert.deepEqual(adapted.stats, {nodes: 3, edges: 1, clusters: 1, isolated_nodes: 1});
 assert.equal(adapted.order, 2); assert.equal(adapted.canvasKind, 'coupling');
 assert.equal(adapted.scopeLabel, 'Sources citing cluster 4');
 assert.deepEqual(adapted.links, original.links);
 assert(adapted.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
 adapted.nodes[0].x = 100; adapted.nodes[0].cluster = 9; adapted.links[0].count = 7;
 assert.deepEqual(original, snapshot);
 assert.equal(COUPLING_METHOD.size, 'Available references');
 assert.equal(COUPLING_METHOD.edge, 'Shared references');
});

test('empty and unlinked coupling views retain explicit source semantics', () => {
 const empty = couplingCanvasGraph(null);
 assert.equal(empty.stats.nodes, 0); assert.equal(empty.stats.clusters, 0); assert.equal(empty.resolution, null);
 const unlinked = couplingCanvasGraph({nodes: [{id: 'a', references: [], cluster: 0}], links: [], minimumShared: 3});
 assert.equal(unlinked.stats.isolated_nodes, 1); assert.equal(unlinked.nodes[0].label, 'a');
});

test('coupling uses the main canvas rather than a second graph renderer', () => {
 const explorer = fs.readFileSync('scripts/evidence-explorer.mjs', 'utf8'), app = fs.readFileSync('public/conservative-atlas/app.js', 'utf8');
 assert(!explorer.includes('function drawNetwork('));
 assert(!explorer.includes('function drawSources('));
 assert(explorer.includes('window.atlasSharedCanvas?.showCoupling'));
 assert(app.includes('function restoreCanvas(session)'));
 const accessor = app.split(/\r?\n/).find(line => line.startsWith('window.atlasEvidenceContext='));
 assert(accessor, 'shared renderer exposes an evidence-context accessor');
 const evidenceContext = new Function('window', 'communityPending', 'isEntityMap', 'semanticParent', 'isCoupling', 'referenceSession', 'graph', 'data', accessor + '\nreturn window.atlasEvidenceContext();');
 const reference = {canvasKind: 'references', nodes: [{id: 'cited-work'}], links: [], bundles: []};
 const coupling = {canvasKind: 'coupling', nodes: [{id: 'source-work'}], links: [], bundles: []};
 const semantic = {canvasKind: 'semantic', nodes: [{id: 'topic'}], links: []};
 const data = {articles: {'source-work': {}}, bundlesByScope: {}};
 for (const [graph, referenceSession, semanticParent, pending, expected] of [
  [reference, null, null, false, reference],
  [coupling, {graph: reference}, null, false, reference],
  [coupling, null, null, false, null],
  [semantic, null, {graph: coupling}, false, null],
  [semantic, null, {graph: coupling, reference: {graph: reference}}, false, reference],
  [semantic, null, {graph: reference}, false, reference],
  [reference, null, null, true, null],
 ]) {
  const result = evidenceContext({}, pending, () => graph.canvasKind === 'semantic', semanticParent, () => graph.canvasKind === 'coupling', referenceSession, graph, data);
  if (expected === null) assert.equal(result, null);
  else {
   assert.deepEqual(result.graph, expected);
   assert.notEqual(result.graph, expected, 'evidence inspection receives an isolated graph copy');
   assert.deepEqual(result.articleIds, ['source-work']);
  }
 }
 assert(app.includes('if(isCoupling()){selectEdge(edge);return;}'));
});
