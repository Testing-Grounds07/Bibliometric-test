import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {TRIAL_METHODS,trialNetwork,normalizedOperator,spectralEigenspace,balancedMoveGain,balancedSwapGain,cutCost,normalizedCutCost,aonProfile,periodCategories,runHypergraphTrial} from './hypergraph-trials.mjs';

const edges=[{members:['alpha','beta','gamma'],weight:4,articles:['s1','s2']},{members:['delta','epsilon','zeta'],weight:4,articles:['s3','s4']}];
const settings={k:2,seed:42,starts:2,seedId:'alpha'};
test('weighted incidence operator matches dense analytic entries and the degree stationary vector',()=>{
 const network=trialNetwork([{members:['alpha','beta'],weight:2},{members:['beta','gamma'],weight:1}]);
 const matrix=network.ids.map((_,column)=>normalizedOperator(network,network.ids.map((__,index)=>Number(index===column))));
 assert(Math.abs(matrix[0][0]-.5)<1e-12);assert(Math.abs(matrix[0][1]-1/Math.sqrt(6))<1e-12);
 for(let left=0;left<3;left++)for(let right=0;right<3;right++)assert(Math.abs(matrix[left][right]-matrix[right][left])<1e-12);
 const stationary=network.degree.map(Math.sqrt),actual=normalizedOperator(network,stationary);
 actual.forEach((value,index)=>assert(Math.abs(value-stationary[index])<1e-12));
});

test('direct symmetric eigenvectors meet the unchanged operator rather than suppressing a limit warning',()=>{
 const network=trialNetwork([{members:['alpha','beta'],weight:2},{members:['beta','gamma'],weight:1}]),result=spectralEigenspace(network,3);
 assert(result.converged);assert(result.eigenResiduals.every(value=>value<1e-10));assert(result.orthogonalityError<1e-10);
 assert.equal(result.engine,'ml-matrix 6.15.0 symmetric EVD');
 for(const vector of result.basis)assert(Math.abs(vector.reduce((total,value)=>total+value*value,0)-1)<1e-10);
 assert.throws(()=>spectralEigenspace(network,4),/Invalid spectral dimension/);
});

test('nearly tied spectral modes remain numerically accurate and retain their small boundary gap',()=>{
 const network=trialNetwork([...edges,{members:['eta','theta','iota'],weight:4},{members:['alpha','delta'],weight:1e-10},{members:['delta','eta'],weight:1e-10}]);
 const result=spectralEigenspace(network,2);
 assert(result.converged);assert(result.residual<1e-8);assert(result.boundaryGap<1e-8);assert(result.boundaryGap>=0);
});
test('cut objectives count whole edges and distinguish normalized spectral cuts',()=>{
 const network=trialNetwork([{members:['alpha','beta','gamma'],weight:3}]);
 assert.equal(cutCost(network,[0,0,1]),3);assert.equal(cutCost(network,[0,0,0]),0);
 assert.equal(normalizedCutCost(network,[0,0,0]),0);
 assert(Math.abs(normalizedCutCost(network,[0,0,1])-1)<1e-12);
});
test('spectral solver retains disconnected components and handles rank-deficient incidence',()=>{
 const result=runHypergraphTrial(edges,{...settings,family:'spectral'});
 assert.equal(result.clusters,2);assert.equal(result.quality,0);
 assert.equal(result.memberships.alpha,result.memberships.beta);assert.notEqual(result.memberships.alpha,result.memberships.delta);
 const more=runHypergraphTrial(edges,{...settings,k:4,family:'spectral'});
 assert.equal(more.clusters,4);assert(more.subspaceResiduals.every(Number.isFinite));
 const three=runHypergraphTrial([...edges,{members:['eta','theta'],weight:2}],{...settings,family:'spectral'});
 assert.equal(three.requestedGroups,2);assert.equal(three.effectiveGroups,3);
});
test('AON weighted profile objective matches a hand-calculated two-rate exposure model',()=>{
 const network=trialNetwork(edges),labels=network.ids.map(id=>['alpha','beta','gamma'].includes(id)?0:1);
 assert(Math.abs(aonProfile(network,labels)-8*Math.log(4))<1e-12);
 assert.equal(aonProfile(network,labels.map(()=>0)),0);
 assert.equal(aonProfile(network,labels.map((_,index)=>index)),0);
 const result=runHypergraphTrial(edges,{...settings,family:'aon'});
 assert(result.quality>0);assert.match(result.limitations,/NOT a full/);
});
test('balanced partition enforces nonempty bounded groups without claiming a multilevel solver',()=>{
 const result=runHypergraphTrial(edges,{...settings,family:'balanced',imbalance:0});
 const sizes=Object.values(result.memberships).reduce((counts,group)=>(counts[group]=(counts[group]||0)+1,counts),{});
 assert.equal(Object.keys(sizes).length,2);assert(Object.values(sizes).every(size=>size===3));assert.equal(result.quality,0);
 assert.match(result.limitations,/not hMETIS/);
 assert.equal(result.stoppingReason,'all-feasible-single-moves-and-swaps-stable');assert(result.verificationChecks>0);
});

test('incremental cut gains match full recomputation, including shared hyperedges in swaps',()=>{
 const network=trialNetwork([...edges,{members:['alpha','beta','delta'],weight:.3},{members:['gamma','epsilon'],weight:1.7}]);
 const labels=network.ids.map((_,index)=>index%3),counts=network.groups.map(edge=>{const groups=new Map();for(const member of edge.members)groups.set(labels[member],(groups.get(labels[member])||0)+1);return groups;}),incidenceSets=network.incidence.map(positions=>new Set(positions)),before=cutCost(network,labels);
 for(let member=0;member<labels.length;member++)for(let target=0;target<3;target++){const changed=[...labels];changed[member]=target;assert(Math.abs(balancedMoveGain(network,labels,counts,member,target)-(before-cutCost(network,changed)))<1e-12);}
 for(let left=0;left<labels.length;left++)for(let right=left+1;right<labels.length;right++){const changed=[...labels];[changed[left],changed[right]]=[changed[right],changed[left]];assert(Math.abs(balancedSwapGain(network,labels,counts,left,right,incidenceSets)-(before-cutCost(network,changed)))<1e-12);}
});

test('settled balanced results have no improving feasible move or swap by independent exhaustive scoring',()=>{
 const varied=[...edges,{members:['alpha','beta','delta'],weight:.3},{members:['gamma','epsilon'],weight:1.7}],network=trialNetwork(varied),result=runHypergraphTrial(varied,{...settings,family:'balanced',imbalance:.5});
 assert(result.converged);
 const labels=network.ids.map(id=>result.memberships[id]),sizes=labels.reduce((counts,group)=>(counts[group]=(counts[group]||0)+1,counts),{}),cost=cutCost(network,labels);
 for(let member=0;member<labels.length;member++)for(const target of Object.keys(sizes).map(Number))if(target!==labels[member]&&sizes[labels[member]]>1&&sizes[target]<result.maximumGroupSize){const changed=[...labels];changed[member]=target;assert(cutCost(network,changed)>=cost-1e-10);}
 for(let left=0;left<labels.length;left++)for(let right=left+1;right<labels.length;right++){const changed=[...labels];[changed[left],changed[right]]=[changed[right],changed[left]];assert(cutCost(network,changed)>=cost-1e-10);}
});

test('a limited balanced search stays provisional and resumes its partition without raising its cut cost',()=>{
 const varied=Array.from({length:18},(_,index)=>({members:['node'+index,'node'+((index+1)%18),'node'+((index+3)%18)],weight:index%5+1}));
 const limited=runHypergraphTrial(varied,{family:'balanced',k:3,starts:1,balancedMaxPasses:1});
 assert.equal(limited.converged,false);assert.equal(limited.stoppingReason,'round-budget');assert(limited.remainingImprovement>1e-10);
 const resumed=runHypergraphTrial(varied,{...limited.settings,balancedMaxPasses:96,resumeMemberships:limited.memberships});
 assert(resumed.converged);assert(resumed.quality<=limited.quality+1e-10);assert(!resumed.settings.resumeMemberships);assert.deepEqual(resumed.continuation.initialMemberships,limited.memberships);
 assert(resumed.cutHistory.every((cost,index)=>!index||cost<=resumed.cutHistory[index-1]+1e-10));
 assert.throws(()=>runHypergraphTrial(varied,{...limited.settings,resumeMemberships:{}}),/same evidence/);
 assert.throws(()=>runHypergraphTrial(varied,{family:'balanced',balancedMaxPasses:999}),/1–512/);
});
test('local walk conserves probability and reports only its seed neighborhood',()=>{
 const result=runHypergraphTrial(edges,{...settings,family:'local'});
 assert.equal(result.memberships.alpha,1);assert.equal(result.memberships.delta,undefined);assert.equal(result.quality,0);
 assert(Math.abs(result.probabilityMass-1)<1e-10);assert(result.localOnly);
 const missing=runHypergraphTrial(edges,{...settings,seedId:'unknown',family:'local'});
 assert.equal(missing.clusters,0);assert(missing.seedAbsent);
});
test('period categories have traceable known-year coverage and are not fabricated themes',()=>{
 const articles={s1:{year:1999},s2:{year:2001},s3:{year:2015}};
 const categorized=periodCategories([...edges,{members:['alpha','delta'],weight:1,articles:['unknown']}],articles);
 assert.equal(categorized.length,2);assert.equal(categorized[0].category,'1990s');assert.deepEqual(categorized[0].categoryEvidence.counts,{'1990':1,'2000':1});
 const result=runHypergraphTrial(categorized,{...settings,family:'categorical'});
 assert.equal(result.clusters,2);assert.equal(result.quality,8);assert.equal(result.categoryByCluster[result.memberships.alpha],'1990s');assert.match(result.limitations,/NOT semantic themes/);
});
test('all trials are deterministic, non-mutating, bounded, and reject invalid settings',()=>{
 const categorized=edges.map((edge,index)=>({...edge,category:index?'2010s':'1990s'}));
 for(const family of Object.keys(TRIAL_METHODS)){const input=structuredClone(categorized),first=runHypergraphTrial(input,{...settings,family});assert.deepEqual(first,runHypergraphTrial(input,{...settings,family}));assert.deepEqual(input,categorized);assert(Number.isFinite(first.quality));}
 assert.throws(()=>runHypergraphTrial(edges,{family:'tensor'}),/Unknown/);
 assert.throws(()=>runHypergraphTrial(edges,{k:1}),/Choose k/);
 assert.throws(()=>trialNetwork([{members:['alpha','alpha'],weight:1}]),/Invalid/);
 assert.throws(()=>trialNetwork(Array.from({length:801},(_,index)=>({members:['hub','node'+index],weight:1}))),/800/);
});

test('published worker fits and resamples each family without replacing its objective',()=>{
 const articles={s1:{year:1995},s2:{year:1996},s3:{year:2015},s4:{year:2016}};
 const graph={nodes:edges.flatMap(edge=>edge.members.map(id=>({id,articles:edge.articles}))),links:[],order:3,minimumSupport:1,maximumOrder:3};
 for(const family of Object.keys(TRIAL_METHODS)){
  const messages=[],sandbox={self:{postMessage:message=>messages.push(message)}};
  vm.runInNewContext(fs.readFileSync('public/conservative-atlas/hypergraph-trials-worker.js','utf8'),sandbox);
  sandbox.self.onmessage({data:{graph,bundles:edges,articles,options:{...settings,family}}});
  const fitted=messages.at(-1);assert(!fitted.error,fitted.error);assert.equal(fitted.result.family,family);
  sandbox.self.onmessage({data:{action:'check',graph,bundles:edges,articles,options:{...settings,family},result:fitted.result}});
  const audited=messages.at(-1);assert(!audited.error,audited.error);assert.equal(audited.audit.method,TRIAL_METHODS[family].name);assert.equal(audited.audit.algorithm,'trial');assert.equal(audited.audit.samples,10);assert.equal(audited.audit.settings.family,family);
  sandbox.self.onmessage({data:{action:'check',graph,bundles:edges,articles,options:{...settings,family},result:fitted.result,samples:50}});
  assert.equal(messages.at(-1).audit.samples,50);assert.equal(messages.at(-1).audit.preliminary,false);assert.equal(messages.at(-1).audit.settings.family,family);
  sandbox.self.onmessage({data:{action:'check',graph,bundles:edges,articles,options:{...settings,family},result:fitted.result,samples:1}});
  assert.match(messages.at(-1).error,/10 or 50/);
  sandbox.self.onmessage({data:{action:'check',graph,bundles:edges,articles,options:{...settings,family},result:{...fitted.result,version:'hypergraph-trials-v1'}}});
  assert.match(messages.at(-1).error,/engine has changed/);
 }
});
