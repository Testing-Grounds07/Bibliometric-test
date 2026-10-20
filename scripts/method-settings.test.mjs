import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SETTINGS_VERSION, assertSettingsContext, settingsAlgorithm, settingsGrid, recommendation, materializeSetting, runSettingsSearch, evidenceSensitivity} from './method-settings.mjs';
import {sourceSubset, prepareReliability} from './network-reliability.mjs';
import {infomapArgs, hypergraphModularity, refineHypergraph, HYPERGRAPH_OBJECTIVES} from './community-methods.mjs';
import {couplingGraph, couplingPairs} from './evidence-metrics.mjs';
import {run as runInfomap} from '@mapequation/infomap/node';
import {infomapInput, infomapResult} from './community-methods.mjs';
import {automaticSettingsPending} from './canvas-settings.mjs';
import {analysisSettings} from './multiuser/core.mjs';

const sources = Array.from({length: 12}, (_, position) => ({id: 'source-' + position, references: position < 6 ? ['a', 'b', 'c'] : ['c', 'd', 'e']}));
const graph = {...couplingGraph(sources, couplingPairs(sources), 1, 0), resolution: .1, clustering: {algorithm: 'leiden'}};
const report = score => ({samples: 10, clusters: {1: {size: 10, meanJaccard: score, meanRetention: 1}}, nonconverged: 0});

test('unsupported settings contexts fail before grids, custom scans or evidence sensitivity can substitute Leiden', async()=>{
 const unsupported=[{clustering:{algorithm:'sbm'}},{clustering:{algorithm:'invented'}},{clustering:{}},{semantic:{kind:'terms'}},{canvasKind:'semantic'},{trial:{result:{family:'spectral'}}},{clustering:{algorithm:'trial'}},{directed:true},{historiography:{}},{method:'direct_citation'},{canvasKind:'historiography'},{networkModel:'direct-citation'},{networkModel:'invented'},{temporalSelection:{index:0}},{collaboration:{kind:'author'}},{clustering:{algorithm:'hypergraph',hypergraphSearch:'invented'}},{clustering:{algorithm:'hypergraph',hypergraphObjective:'invented'}}];
 let calls=0;const engine=()=>{calls++;throw Error('An unsupported context reached a solver');},progress=()=>calls++;
 for(const change of unsupported){const configured={...graph,...change};assert.throws(()=>assertSettingsContext(configured));assert.throws(()=>settingsGrid(configured));await assert.rejects(runSettingsSearch(configured,[],engine,progress,{settings:[{resolution:.1,label:'Caller-supplied CPM'}]}));await assert.rejects(evidenceSensitivity(configured,[],engine,progress));}
 assert.equal(calls,0);assert.throws(()=>assertSettingsContext(null));assert.equal(settingsAlgorithm(null),null);assert.equal(settingsAlgorithm({clustering:{algorithm:'sbm'}}),null);assert.equal(settingsAlgorithm({clustering:{algorithm:'invented'}}),null);assert.equal(settingsAlgorithm({...graph,clustering:{algorithm:'Leiden CPM'}}),'leiden');assert.deepEqual(settingsGrid({...graph,clustering:{algorithm:'Leiden CPM'}}),settingsGrid(graph));
});
function candidate(id, resolution, memberships = {a: 1, b: 1, c: 2, d: 2}) {
 return {id, algorithm: 'leiden', settings: {resolution}, partition: {memberships}, screening: report(.85), metrics: {clusters: 2, components: 1, largest: .5, tiny: 0, coverage: 1, startAgreement: .95}};
}

test('method grids expose distinct controls, never CPM for Infomap or hypergraphs', () => {
 assert(settingsGrid(graph).every(setting => setting.resolution > 0));
 assert(settingsGrid({...graph, clustering: {algorithm: 'infomap'}}).every(setting => setting.markovTime && !setting.resolution));
 const direct={...graph,clustering:{algorithm:'hypergraph'}};
 assert(settingsGrid(direct).every(setting=>setting.hypergraphObjective==='linear'&&setting.hypergraphResolution>0));
 assert.deepEqual(settingsGrid(direct,{compareObjectives:true}).map(setting => setting.hypergraphObjective), HYPERGRAPH_OBJECTIVES);
 assert.equal(settingsGrid({...graph,clustering:{algorithm:'infomap'}}).at(-1).markovTime,16);
 assert.match(infomapArgs({markovTime: 2, trials: 2, seed: 101}), /--num-trials 2 --seed 101 --markov-time 2/);
 assert.throws(() => infomapArgs({markovTime: -1}));
});

test('actual public baseline graphs and the fitted coupling baseline retain their declared supported settings',()=>{
 const context={window:{}};vm.runInNewContext(readFileSync('public/conservative-atlas/data.js','utf8'),context);const defaults=Object.values(context.window.ATLAS_DATA.graphs);assert(defaults.length>0);
 for(const baseline of defaults){assert.equal(settingsAlgorithm(baseline),'leiden');assert.equal(assertSettingsContext(baseline),'leiden');assert(settingsGrid(baseline).every(setting=>setting.resolution>0));}
 assert.equal(assertSettingsContext(graph),'leiden');assert(settingsGrid(graph).every(setting=>setting.resolution>0));assert.equal(assertSettingsContext({...graph,clustering:{...graph.clustering,algorithm:'Leiden CPM'}}),'leiden');
});

test('recommendations require broad stable ranges and fresh validation, not just recovery', () => {
 const candidates = [candidate(1, .1), candidate(2, .15), candidate(3, .2)];
 assert.equal(recommendation(candidates, 'leiden').status, 'screening_range');
 candidates[0].validation = {...report(.85), samples: 50};
 assert.equal(recommendation(candidates, 'leiden').chosen, 1);
 candidates[0].validation = {...report(.1), samples: 50};
 assert.equal(recommendation(candidates, 'leiden').chosen, null);
 for (const current of candidates) current.metrics.clusters = 1;
 assert.equal(recommendation(candidates, 'leiden').status, 'no_clear_recommendation');
 assert.equal(recommendation(candidates, 'hypergraph').chosen, null);
});

test('hypergraph objectives match independently calculated binomial null rewards', () => {
 const edges = [{members: ['a', 'b', 'c'], weight: 1}], memberships = {a: 1, b: 1, c: 2};
 for (const objective of HYPERGRAPH_OBJECTIVES) {
  const eta = count => objective === 'strict' ? Number(count === 3) : (count / 3) ** ({majority: 0, linear: 1, quadratic: 2}[objective]);
  const expected = fraction => 3 * fraction ** 2 * (1 - fraction) * eta(2) + fraction ** 3;
  assert(Math.abs(hypergraphModularity(edges, memberships, objective) - (eta(2) - expected(2 / 3) - expected(1 / 3))) < 1e-10);
  const refined = refineHypergraph(edges, memberships, 101, 20, objective);
  assert(refined.quality >= hypergraphModularity(edges, memberships, objective) - 1e-10);
 }
 assert.throws(() => hypergraphModularity(edges, memberships, 'invented'));
});

test('source subsampling is reproducible, without replacement, and keeps original data intact', () => {
 const before = structuredClone(sources), subset = sourceSubset(sources, 9);
 assert.equal(subset.length, 10); assert.equal(new Set(subset.map(node => node.id)).size, 10);
 assert.deepEqual(subset, sourceSubset(sources, 9)); assert.deepEqual(sources, before);
 const configured = materializeSetting(graph, candidate(1, .1, Object.fromEntries(sources.map(node => [node.id, 1]))));
 const session = prepareReliability(configured, [], 10, {mode: 'sources', seedOffset: 2000});
 assert.equal(session.sample(0).graph.nodes.length, 10);
 assert(session.sample(0).graph.links.every(edge => edge.strength <= 1));
 assert.throws(() => session.finish(), /Incomplete/);
 const second = prepareReliability(configured, [], 10, {seedOffset: 1000});
 const screening = prepareReliability(configured, [], 10);
 assert(Array.from({length: 10}, (_, index) => JSON.stringify(second.sample(index).graph.links) !== JSON.stringify(screening.sample(index).graph.links)).some(Boolean));
});

test('search preserves evidence, records independent starts, and materializes only the chosen partition', async () => {
 const before = structuredClone(graph);
 const result = await runSettingsSearch(graph, [], () => { throw new Error('wrong engine'); }, () => {}, {settings: [{resolution: .1, label: 'CPM .1'}]});
 assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].screening.samples, 10);
 assert(Number.isFinite(result.candidates[0].metrics.startAgreement));
 const applied = materializeSetting(graph, result.candidates[0]);
 assert.deepEqual(applied.links, graph.links); assert.equal(applied.clustering.algorithm, 'leiden'); assert.equal(applied.resolution, .1);
 assert.deepEqual(graph, before);
});

test('evidence sensitivity returns comparisons without modifying the map', async () => {
 const before = structuredClone(graph);
 const result = await evidenceSensitivity(graph, [], () => { throw new Error('wrong engine'); }, () => {});
 assert.equal(result.results.length, 3); assert.deepEqual(graph, before);
});

test('real Infomap scan and resamples honor Markov time and independent start seeds', async () => {
 const calls = [];
 const engine = async (networkGraph, settings) => {
  calls.push(settings);
  const {ids, network} = infomapInput(networkGraph);
  return ids.length ? infomapResult(await runInfomap(network, {args: infomapArgs(settings)}), ids, settings) : {memberships: {}};
 };
 const result = await runSettingsSearch({...graph, clustering: {algorithm: 'infomap'}}, [], engine, () => {}, {settings: [{markovTime: 2, label: 'Markov time 2'}]});
 assert(calls.every(settings => settings.markovTime === 2));
 assert(calls.some(settings => settings.seed === 701));
 assert.equal(result.candidates[0].screening.settings.markovTime, 2);
 assert.equal(result.candidates[0].partition.markovTime, 2);
});

test('all hypergraph objectives receive fresh validation without an automatic winner', async () => {
 const result = await runSettingsSearch({...graph, clustering: {algorithm: 'hypergraph'}}, [], () => { throw new Error('wrong engine'); },()=>{},{compareObjectives:true});
 assert.equal(result.candidates.length, 4);
 assert.equal(result.recommendation.chosen, null);
 for (const candidate of result.candidates) {
  assert.equal(candidate.validation.samples, 50);
  assert.equal(candidate.validation.seedOffset, 1000);
  assert.equal(candidate.validation.settings.hypergraphObjective, candidate.settings.hypergraphObjective);
  assert.equal(candidate.sourceValidation.mode, 'sources');
 }
});

test('direct resolution scales only the null penalty and defaults remain equivalent',()=>{
 const edges=[{members:['a','b','c'],weight:2}],memberships={a:1,b:1,c:2};
 const normal=hypergraphModularity(edges,memberships),twice=hypergraphModularity(edges,memberships,'linear',2),observed=2/3;
 assert(Math.abs(twice-(2*normal-observed))<1e-10);
 assert.equal(normal,hypergraphModularity(edges,memberships,'linear',1));
 for(const resolution of [.25,1,4]){
  const refined=refineHypergraph(edges,memberships,42,20,'linear',resolution);
  assert(refined.quality>=hypergraphModularity(edges,memberships,'linear',resolution)-1e-10);
  assert.equal(refined.quality,hypergraphModularity(edges,refined.memberships,'linear',resolution));
 }
 assert.throws(()=>hypergraphModularity(edges,memberships,'linear',0),/resolution/);
 assert.notDeepEqual(analysisSettings({algorithm:'hypergraph',hypergraphResolution:2}),analysisSettings({algorithm:'hypergraph'}));
 assert.throws(()=>analysisSettings({algorithm:'hypergraph',hypergraphResolution:-1}));
});

test('fixed-objective hypergraph can recommend only a fresh-validated stable range',()=>{
 const candidates=[.5,.707107,1].map((value,index)=>({...candidate(index+1,value),algorithm:'hypergraph',settings:{hypergraphObjective:'linear',hypergraphResolution:value}}));
 assert.equal(recommendation(candidates,'hypergraph').status,'screening_range');
 candidates[0].validation={...report(.85),samples:50};
 assert.equal(recommendation(candidates,'hypergraph').chosen,1);
 candidates[0].validation={...report(.1),samples:50};
 assert.equal(recommendation(candidates,'hypergraph').chosen,null);
 for(const current of candidates)current.metrics.largest=.73;
 assert(recommendation(candidates,'hypergraph').chosen===null);
 assert(candidates.every(current=>current.reasons.includes('One group dominates')));
});

test('automatic hypergraph scans skip manual settings and completed audits',()=>{
 const current={...graph,networkModel:'hypergraph',clustering:{algorithm:'leiden',modelVersion:'incidence-v1'}};
 assert(automaticSettingsPending(current));
 assert(!automaticSettingsPending({...current,settingsSearch:{version:SETTINGS_VERSION}}));
 assert(automaticSettingsPending({...current,settingsSearch:{version:SETTINGS_VERSION-1}}));
 assert(!automaticSettingsPending({...current,appliedSettings:{settings:{resolution:.1}}}));
 assert(!automaticSettingsPending({...current,clustering:{algorithm:'sbm'}}));
 assert(!automaticSettingsPending(graph));
 assert(!automaticSettingsPending({...current,clustering:{algorithm:'leiden'}}));
});

test('eligible stable ranges receive fresh validation before Auto can choose',async()=>{
 const articles=Array.from({length:20},(_,position)=>'source-'+position),nodes=Array.from({length:8},(_,position)=>({id:'node-'+position,articles}));
 const links=nodes.slice(1).map((node,position)=>({source:nodes[position].id,target:node.id,articles,count:20,strength:.05}));
 const current={nodes,links,order:2,minimumSupport:1,clustering:{algorithm:'infomap'},stats:{}};
 const fit=async network=>({memberships:Object.fromEntries(network.nodes.map((node,position)=>[node.id,position<4?1:2])),algorithm:'infomap'});
 const result=await runSettingsSearch(current,articles,fit,()=>{},{settings:[.5,Math.SQRT1_2,1].map(markovTime=>({markovTime,label:'Markov time '+markovTime}))});
 assert.equal(result.recommendation.status,'recommended_range');
 const chosen=result.candidates.find(candidate=>candidate.id===result.recommendation.chosen);
 assert.equal(chosen.validation.samples,50);assert.equal(chosen.validation.seedOffset,1000);assert.equal(chosen.reasons.length,0);
 assert(current.nodes.every(node=>node.cluster===undefined));
});
