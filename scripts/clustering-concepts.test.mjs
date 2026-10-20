import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CLUSTERING_SCORES,scoreForAlgorithm,searchesForScore,clusteringConcepts,clusterResultHeading} from './clustering-concepts.mjs';
import {hypergraphPartition,hypergraphModularity} from './community-methods.mjs';
import {analysisSettings,calculation} from './multiuser/core.mjs';
import {settingsGrid,materializeSetting} from './method-settings.mjs';

const graph={nodes:['a','b','c','d','e','f'].map(id=>({id})),links:[],networkModel:'hypergraph',clustering:{algorithm:'hypergraph'}};
const edges=[{members:['a','b','c'],weight:4},{members:['d','e','f'],weight:4},{members:['c','d'],weight:.1}];

test('score and search choices expose only implemented compatible searches',()=>{
 assert.equal(CLUSTERING_SCORES.length,4);
 assert.equal(scoreForAlgorithm('infomap').value,'map-equation');
 assert.deepEqual(searchesForScore('cpm').map(search=>search.value),['leiden']);
 assert.deepEqual(searchesForScore('hypergraph-modularity').map(search=>search.value),['mixed','leiden-seeded']);
 assert.deepEqual(searchesForScore('hypergraph-modularity',{experimental:true}).map(search=>search.value),['mixed','leiden-seeded','group-moves','annealing']);
 assert(!searchesForScore('hypergraph-modularity').some(search=>search.value==='leiden'));
});

test('labels follow actual result metadata and explicitly identify previous results',()=>{
 const stale={...graph,clustering:{algorithm:'hypergraph',label:'Leiden CPM',hypergraphSearch:'leiden-seeded'}};
 assert.match(clusterResultHeading(stale),/Hypergraph modularity.*local moves/);
 assert(!clusterResultHeading(stale).includes('Leiden CPM'));
 assert.match(clusterResultHeading(stale,true),/^Previous result/);
 const description=clusteringConcepts(stale);
 assert.match(description.searchTitle,/Leiden starts/);
 assert.match(description.searchSummary,/initialization only/);
 assert.match(description.example,/3 of 4.*0.75.*2 of 4.*0/);
 assert.match(clusteringConcepts({...graph,clustering:{algorithm:'leiden',modelVersion:'incidence-v1'}}).scoreSummary,/Bipartite CPM/);
});

test('direct search strategies optimize the same whole-group objective and are deterministic',()=>{
 for(const hypergraphSearch of ['mixed','leiden-seeded','group-moves','annealing']){
  const before=structuredClone(graph),settings={hypergraphSearch,hypergraphObjective:'quadratic',hypergraphResolution:.7};
  const first=hypergraphPartition(graph,edges,()=>{},settings),second=hypergraphPartition(graph,edges,()=>{},settings);
  assert.deepEqual(first.memberships,second.memberships);assert.equal(first.hypergraphSearch,hypergraphSearch);assert.equal(first.trials,10);
  assert.equal(first.quality,hypergraphModularity(edges,first.memberships,'quadratic',.7));
  assert.deepEqual(graph,before);
 }
 assert.throws(()=>hypergraphPartition(graph,edges,()=>{},{hypergraphSearch:'leiden'}),/Unsupported direct hypergraph search/);
});

test('search strategy is canonical scientific configuration, not display state',()=>{
 const mixed=analysisSettings({algorithm:'hypergraph'}),seeded=analysisSettings({algorithm:'hypergraph',hypergraphSearch:'leiden-seeded'});
 assert.equal(mixed.hypergraphSearch,'mixed');
 assert.notEqual(calculation('clustering','public',mixed).id,calculation('clustering','public',seeded).id);
 assert.throws(()=>analysisSettings({algorithm:'hypergraph',hypergraphSearch:'infomap'}));
 const configured={...graph,clustering:{algorithm:'hypergraph',hypergraphSearch:'leiden-seeded'}};
 assert(settingsGrid(configured).every(setting=>setting.hypergraphSearch==='leiden-seeded'));
 assert(settingsGrid(configured,{compareObjectives:true}).every(setting=>setting.hypergraphSearch==='leiden-seeded'));
 const partition=hypergraphPartition(graph,edges,()=>{},{hypergraphSearch:'leiden-seeded'}),applied=materializeSetting(configured,{algorithm:'hypergraph',partition,settings:{hypergraphSearch:'leiden-seeded'}});
 assert.equal(applied.clustering.hypergraphSearch,'leiden-seeded');
});

test('shared shell replaces the ambiguous Algorithm field while preserving its adapter',()=>{
 const shell=fs.readFileSync('public/conservative-atlas/workspace-shell.js','utf8'),app=fs.readFileSync('public/conservative-atlas/app.js','utf8');
 assert(shell.includes("scoreSelect.id='clusteringScore'"));assert(shell.includes("searchSelect.id='clusteringSearch'"));
 assert(shell.includes('methodSelect.hidden=true'));assert(shell.includes('searches.length===1'));
 assert(shell.includes("create('summary', 'Score, search & audit')"));
 assert(app.includes("hypergraphSearch:algorithm==='hypergraph'?$('clusteringSearch')?.value||'mixed'"));
 assert(app.includes('window.ATLAS_CLUSTERING_CONCEPTS.heading(graph,communityPending)'));
});

test('coupling does not capture its temporary disabled state into the reference workspace',()=>{
 const source=fs.readFileSync('scripts/evidence-explorer.mjs','utf8'),body=source.match(/function shell\(\) \{([\s\S]*?) const header =/)[1];
 const control={disabled:false},captured=[];
 const initialize=new Function('dialog','document','mode','dataset','window','coupling','contextKey','focusCluster','fullSourceScope',body);
 initialize({replaceChildren(){}},{getElementById:()=>control},'coupling',null,{atlasSharedCanvas:{showCoupling:()=>captured.push(control.disabled)}},null,'test',null,()=> 'sources');
 assert.deepEqual(captured,[false]);assert.equal(control.disabled,true);
});
