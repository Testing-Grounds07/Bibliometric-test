import test from 'node:test';
import assert from 'node:assert/strict';
import {HYPERGRAPH_OBJECTIVES, HYPERGRAPH_SEARCHES, hypergraphModularity, refineHypergraph, searchHypergraph, hypergraphPartition} from './community-methods.mjs';
import {clusteringConcepts} from './clustering-concepts.mjs';
import {analysisSettings, calculation} from './multiuser/core.mjs';
import {settingsGrid, materializeSetting} from './method-settings.mjs';
import {prepareReliability} from './network-reliability.mjs';

const edges = [{members:['a','b','c','d'],weight:3,articles:['s1','s2','s3']},{members:['e','f','g','h'],weight:3,articles:['s4','s5','s6']}];
const initial = {a:1,b:1,c:2,d:2,e:3,f:3,g:4,h:4};
const graph = {nodes:Object.keys(initial).map(id=>({id,cluster:initial[id],articles:edges.find(edge=>edge.members.includes(id)).articles})),links:[],order:4,minimumSupport:1,networkModel:'hypergraph',hyperedges:edges,clustering:{algorithm:'hypergraph',hypergraphObjective:'strict'}};

test('whole-group moves escape a strict-score barrier that individual moves cannot cross', () => {
 const reinforced = [...edges,...['ab','cd','ef','gh'].map(pair=>({members:[...pair],weight:.3}))];
 const local = refineHypergraph(reinforced, initial,42,20,'strict');
 assert.equal(new Set(Object.values(local.memberships)).size,4);
 const grouped = searchHypergraph(reinforced, initial,42,'strict',1,'group-moves');
 assert(grouped.quality > local.quality);
 assert.equal(new Set(Object.values(grouped.memberships)).size,2);
 assert(grouped.groupMerges >= 2);
 assert.equal(grouped.quality, hypergraphModularity(reinforced,grouped.memberships,'strict'));
});

test('new searches are seeded, bounded, preserve inputs and report the unchanged score for every objective', () => {
 for (const strategy of ['group-moves','annealing']) for (const objective of HYPERGRAPH_OBJECTIVES) {
  const before = structuredClone({edges,initial});
  const result = searchHypergraph(edges,initial,42,objective,.7,strategy);
  assert.deepEqual(result, searchHypergraph(edges,initial,42,objective,.7,strategy));
  assert.deepEqual({edges,initial}, before);
  assert.deepEqual(Object.keys(result.memberships).sort(), Object.keys(initial).sort());
  assert.equal(result.quality, hypergraphModularity(edges,result.memberships,objective,.7));
  assert(result.quality >= refineHypergraph(edges,initial,42,20,objective,.7).quality - 1e-12);
  if (strategy==='annealing') { assert.equal(result.annealingSweeps,12); assert(result.acceptedDownhill>0); assert.equal(result.budgetLimited,true); }
  else assert(result.groupRounds <= 4);
 }
});

test('partition, settings and recovery retain each selected search rather than substituting local moves', () => {
 for (const hypergraphSearch of ['group-moves','annealing']) {
  const result = hypergraphPartition(graph,edges,()=>{},{hypergraphSearch,hypergraphObjective:'strict',trials:2});
  assert.equal(result.hypergraphSearch,hypergraphSearch); assert.equal(result.trials,2); assert.equal(result.searchVersion,'direct-search-v1');
  const configured={...graph,clustering:result};
  assert(settingsGrid(configured).every(setting=>setting.hypergraphSearch===hypergraphSearch));
  const applied=materializeSetting(configured,{algorithm:'hypergraph',partition:result,settings:{hypergraphSearch}});
  assert.equal(applied.clustering.hypergraphSearch,hypergraphSearch);
  const audit=prepareReliability(configured,['s1','s2','s3','s4','s5','s6'],10,{trials:1});
  const sampled=audit.sample(0);
  assert.equal(audit.partition(sampled,()=>{}).hypergraphSearch,hypergraphSearch);
  assert(clusteringConcepts(configured).searchSummary.includes('Experimental'));
 }
});

test('each search has a distinct versioned calculation identity and rejects unsupported optimizers', () => {
 const ids=HYPERGRAPH_SEARCHES.map(hypergraphSearch=>{
  const settings=analysisSettings({algorithm:'hypergraph',hypergraphSearch});
  if (['group-moves','annealing'].includes(hypergraphSearch)) assert.equal(settings.hypergraphSearchVersion,'direct-search-v1');
  return calculation('clustering','public',settings).id;
 });
 assert.equal(new Set(ids).size,HYPERGRAPH_SEARCHES.length);
 assert.throws(()=>hypergraphPartition(graph,edges,()=>{},{hypergraphSearch:'infomap'}),/Unsupported/);
 assert.throws(()=>analysisSettings({algorithm:'hypergraph',hypergraphSearch:'h-louvain'}));
});
