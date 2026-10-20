import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trialCanvasGraph} from './trial-canvas-core.mjs';
import {clusteringConcepts} from './clustering-concepts.mjs';
import {clusterReliability} from './cluster-indicators.mjs';
import {automaticSettingsPending} from './canvas-settings.mjs';

const source = {nodes:[{id:'alpha',cluster:9,title:'Alpha'},{id:'beta',cluster:9,title:'Beta'},{id:'gamma',cluster:9}],links:[],stats:{clusters:1},resolution:.02,autoCPM:{enabled:true},themeDescriptions:{9:{heading:'Old label'}},reliability:{algorithm:'leiden'},analysisId:'old'};
const result = {memberships:{alpha:1,beta:1},clusters:1,family:'spectral',version:'test',settings:{k:2},definition:{name:'Spectral trial',score:'Normalized cut',search:'Eigenvectors'},limitations:'Trial only'};
const edges = [{members:['alpha','beta'],weight:1}];

test('trial installation replaces memberships and stale labels, not article evidence', () => {
 const graph = trialCanvasGraph(source,result,edges);
 assert.deepEqual(graph.nodes.map(node=>node.cluster),[1,1,0]);
 assert.equal(graph.nodes[0].title,'Alpha'); assert.equal(source.nodes[0].cluster,9);
 assert.equal(graph.clustering.algorithm,'trial'); assert.deepEqual(graph.hyperedges,edges);
 for(const key of ['autoCPM','comparison','themeDescriptions','analysisId']) assert.equal(graph[key],undefined);
 assert.equal(graph.reliability,null); assert.equal(graph.resolution,null);
 assert.equal(graph.stats.clusters,1); assert.equal(graph.stats.isolated_nodes,1);
 assert.deepEqual(graph.clustering.trialSettings,{k:2});
 assert(!automaticSettingsPending(graph));
 assert.equal(clusteringConcepts(graph).scoreTitle,'Normalized cut');
 assert.equal(clusteringConcepts(graph).clusterLabel,'Spectral trial');
});

test('partial local neighborhoods stay unassigned rather than inheriting old clusters', () => {
 const graph=trialCanvasGraph(source,{...result,localOnly:true,memberships:{alpha:1}},edges);
 assert.deepEqual(graph.nodes.map(node=>node.cluster),[1,0,0]);
 assert.throws(()=>trialCanvasGraph(source,{...result,memberships:{alpha:1}},edges),/Missing/);
 assert.throws(()=>trialCanvasGraph(source,{...result,memberships:{unknown:1}},edges),/Invalid/);
 assert.throws(()=>trialCanvasGraph(source,result,[{members:['unknown'],weight:1}]),/Unknown/);
});

test('only same-trial completed checks produce reliability indicators', () => {
 const graph=trialCanvasGraph(source,result,edges);
 graph.reliability={algorithm:'leiden',clusters:{1:{size:2,meanJaccard:1,meanRetention:1,interval:[1,1]}}};
 assert.equal(clusterReliability(graph,1).status,'unknown');
 graph.reliability.algorithm='trial';graph.reliability.samples=10;graph.reliability.preliminary=true;
 assert.notEqual(clusterReliability(graph,1).status,'unknown');
});

test('lab is generated from the shared shell, not a second canvas implementation', () => {
 const html=fs.readFileSync('public/conservative-atlas/hypergraph-lab.html','utf8');
 for(const id of ['network','canvasLabelMode','canvasVisibility','cluster','query']) assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert(html.includes('trial-app.js'));assert(html.includes('trial-workspace-shell.js'));assert(!html.includes('workspace-projects.js'));
 for(const name of ['app','workspace-shell']) assert.equal(fs.readFileSync('public/conservative-atlas/trial-'+name+'.js','utf8'),fs.readFileSync('public/conservative-atlas/'+name+'.js','utf8'));
 const controller=fs.readFileSync('scripts/trial-canvas.mjs','utf8');
 assert(controller.includes('canvas.applySettings(next)')); assert(controller.includes('canvas.reloadThemes()'));
 assert(!controller.includes('createElementNS')); assert(!controller.includes('innerHTML'));
});

test('trials start with hyperedge envelopes and expose the shared representation chooser', () => {
 const controller=fs.readFileSync('scripts/trial-canvas.mjs','utf8');
 assert(controller.includes("const representation = byId('hypergraphRepresentation')"));
 assert(controller.includes('choice.after(representationField)'));
 assert(controller.indexOf("if (!current) representation.value = 'envelopes';") < controller.indexOf('current = result; pinned = source;'));
 assert(controller.includes('Pair connections are citation context'));
 assert(controller.includes('up to 60 strongest eligible'));
});
