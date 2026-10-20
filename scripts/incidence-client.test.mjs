import test from 'node:test';
import assert from 'node:assert/strict';
import {fitIncidenceLeiden} from './incidence-client.mjs';

const graph={nodes:[{id:'a'},{id:'b'}],hyperedges:[{members:['a','b'],weight:1}]};
const success=()=>new Response(JSON.stringify({modelVersion:'incidence-v1',memberships:{a:1,b:1}}),{headers:{'content-type':'application/json'}});

test('incidence adapter recovers from a transient tunnel failure without changing models',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{if(++calls===1)throw new TypeError('Failed to fetch');return success();};const result=await fitIncidenceLeiden(graph);assert.equal(calls,2);assert.equal(result.modelVersion,'incidence-v1');}
 finally{globalThis.fetch=original;}
});

test('incidence validation failures and cancellation are not retried',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'Invalid evidence'}),{status:422,headers:{'content-type':'application/json'}});};
  await assert.rejects(fitIncidenceLeiden(graph),/Invalid evidence/);assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;throw new DOMException('Cancelled','AbortError');};
  await assert.rejects(fitIncidenceLeiden(graph),/Cancelled/);assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
