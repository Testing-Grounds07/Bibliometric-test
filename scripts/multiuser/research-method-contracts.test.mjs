import test from 'node:test';
import assert from 'node:assert/strict';
import {frozenGraph,validateFrozenGraph,methodInput,graphPreflight} from './research-method-contracts.mjs';

test('frozen native graph import keeps source universe, edge weights and actual isolation without preset selection',()=>{
 const payload={settings:{method:'coupling',minimumShared:1,minimumCosine:0,preset:'conservative'},graph:{canvasKind:'coupling',nodes:[{id:'W1',cluster:0},{id:'W2',cluster:0},{id:'W3',cluster:9}],links:[{source:'W1',target:'W2',strength:.5}],construction:{counting:'full',normalization:'cosine'}}};
 const result=frozenGraph(payload,{result_id:'a'.repeat(64),checksum:'b'.repeat(64)});assert.deepEqual(result.graph.isolates,['W3']);assert.equal(result.graph.edges[0].weight,.5);assert.equal(result.graph.nodes.length,3);assert.equal(result.graph.spec.method,'imported_frozen_graph');assert.equal(result.origin.original_settings.preset,'conservative');
 assert.throws(()=>frozenGraph({...payload,graph:{...payload.graph,links:[{source:'W1',target:'W2'}]}},{}),/weight/);
 assert.throws(()=>validateFrozenGraph({...result.graph,edges:[...result.graph.edges,...result.graph.edges]}),/Repeated/);
 assert.throws(()=>frozenGraph({...payload,graph:{...payload.graph,networkModel:'hypergraph'}},{}),/not silently flattened/);
 assert.equal(frozenGraph({...payload,graph:{...payload.graph,networkModel:'pairwise',trial:{label:'Explicitly pairwise optimizer metadata'}}},{}).graph.edges.length,1);
});

test('method settings reject ignored fields and expose rather than bypass operation bounds',()=>{
 const input={parentResultId:'a'.repeat(64),idempotencyKey:'explicit-test',group:'structural',operation:'structural_metrics',request:{metrics:['degree']},maxOperations:100};
 assert.equal(methodInput(input).operation,'structural_metrics');assert.throws(()=>methodInput({...input,omega:1}),/not used/);
 assert.throws(()=>methodInput({...input,request:'free text'}),/settings/);assert.throws(()=>methodInput({...input,maxOperations:50000001}),/operation bound/);
 assert.throws(()=>methodInput({...input,request:{operation:'motif_evaluation',metrics:['degree']}}),/Nested operation/);
 for(const unused of [{pagerank:{}},{eigenvector:{}},{path_distance:'unweighted'}])assert.throws(()=>methodInput({...input,request:{metrics:['degree'],...unused}}),/require|used only/);
 const graph={nodes:Array.from({length:951},(_,i)=>({id:'W'+i})),edges:Array.from({length:10891},()=>({})),isolates:Array(655)};
 const preview=graphPreflight(graph,input);assert.equal(preview.minimum_known_operations,11261742);assert.equal(preview.isolates,655);assert(preview.exceeds_known_bound);
});
