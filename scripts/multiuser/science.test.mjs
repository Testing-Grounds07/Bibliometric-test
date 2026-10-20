import test from 'node:test';
import assert from 'node:assert/strict';
import {executeStage} from './stages.mjs';
import {fixture} from './fixtures.mjs';

const context={signal:new AbortController().signal,progress:()=>{}};
async function graphFor(){const source=fixture(),prepared=await executeStage('preparation',source,{preset:'conservative'},context),raw=await executeStage('network',{works:prepared.works},{method:'cocitation',threshold:2,support:2},context);return executeStage('clustering',{graph:raw,articleIds:prepared.works.map(work=>work.id)},{algorithm:'leiden',networkModel:'pairwise',resolution:.02,trials:2,seed:42},context);}
test('bounded scientific stages retain support semantics and reject unsupported analyses',async()=>{
 const graph=await graphFor(),roles=await executeStage('scientific-roles',{graph},{paths:true},context);assert.equal(roles.directed,false);assert.equal(roles.paths.distance,'inverse-strength');
 assert.equal(graph.normalization,'association_strength');assert.equal(graph.counting,'full');
 const construction=await executeStage('construction-comparison',{graph},{},context);assert.equal(construction.comparisons.length,6);assert.match(construction.limitation,/scale sensitivity/);
 const baseline=await executeStage('incidence-null',{graph},{samples:10},context);assert.equal(baseline.marginsPreserved,true);assert.equal(baseline.diagnostics.length,10);
 const ranks=await executeStage('role-sensitivity',{graph},{samples:10},context);assert.match(ranks.rawSupport,/Distinct citing/);
 const starts=await executeStage('optimization-variability',{graph},{},context);assert.equal(starts.results.length,5);assert.equal(starts.evidenceFixed,true);
 for(const stage of ['construction-comparison','incidence-null','role-sensitivity','optimization-variability'])await assert.rejects(executeStage(stage,{graph:{...graph,order:3}},{},context),/currently support/);
});
