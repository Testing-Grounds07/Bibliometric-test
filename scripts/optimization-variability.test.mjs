import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizationVariability} from './optimization-variability.mjs';

test('optimization checks change seeds not evidence and count membership losses', async () => {
 const graph={nodes:['a','b','c'].map(id=>({id,cluster:1})),links:[],clustering:{algorithm:'leiden'},resolution:.02}, seeds=[];
 const before=structuredClone(graph);
 const result=await optimizationVariability(graph,async(input,settings)=>{assert.notEqual(input,graph);assert.deepEqual(input,before);input.nodes[0].cluster=999;assert.equal(settings.trials,1);seeds.push(settings.seed);return {memberships:seeds.length%2?{a:1,b:1,c:1}:{a:1,b:1,c:0}};});
 assert.deepEqual(graph,before);
 assert.equal(new Set(seeds).size,5);assert.ok(result.agreement.mean<1);assert.equal(result.evidenceFixed,true);assert.match(result.limitation,/not evidence-bootstrap/);
});
