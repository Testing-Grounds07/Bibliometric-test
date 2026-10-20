import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const workers=[],window={},Worker=class{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}};
 vm.runInNewContext(fs.readFileSync('public/conservative-atlas/community-methods.js','utf8'),{window,Worker,AbortController,console});return {workers,engine:window.ATLAS_COMMUNITIES};
}

test('direct-modularity browser requests explicitly identify the optimizer and settle invalid responses',async()=>{
 const {workers,engine}=fixture(),graph={nodes:[{id:'a',cluster:1},{id:'b',cluster:1},{id:'c',cluster:1}],links:[],stats:{},resolution:.02},job=engine.start(graph,'hypergraph',[],()=>{},{networkModel:'hypergraph'}),worker=workers[0];
 assert.equal(worker.message.options.algorithm,'hypergraph');assert.equal(worker.message.options.networkModel,'hypergraph');
 const rejected=assert.rejects(job.promise,/invalid result/);worker.onmessage({data:{incidence:{}}});await rejected;assert(worker.terminated);
 const valid=engine.start(graph,'hypergraph',[],()=>{},{networkModel:'hypergraph'});workers[1].onmessage({data:{result:{algorithm:'hypergraph',label:'Hypergraph modularity',memberships:{a:1,b:1,c:1}},hyperedges:[{members:['a','b','c'],weight:1}]}});const result=await valid.promise;assert.equal(result.clustering.algorithm,'hypergraph');assert.equal(result.stats.clusters,1);assert.equal(result.hyperedges.length,1);
});
