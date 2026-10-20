import test from 'node:test';
import assert from 'node:assert/strict';
import {roleSensitivity} from './role-sensitivity.mjs';
import {projectIncidence} from './construction-audit.mjs';

test('bootstrap multiplicity changes analytical weight, never distinct support', () => {
 const evidence = {ids:['a','b'],rows:[{id:'s',members:['a','b']}],scope:'test',coupling:false};
 assert.equal(projectIncidence(evidence,{normalization:'raw',minimumSupport:2,rowWeights:{s:10}}).links.length,0);
 const result = projectIncidence(evidence,{normalization:'raw',rowWeights:{s:10}}).links[0];
 assert.equal(result.rawSupport,1);assert.equal(result.weightedSupport,10);
});
test('rank sensitivity is deterministic and separates fixed communities from uncertain evidence', () => {
 const graph = {nodes:[{id:'a',cluster:1,articles:['s1','s2']},{id:'b',cluster:1,articles:['s1','s2']},{id:'c',cluster:2,articles:['s1']}],links:[],minimumSupport:1};
 const result=roleSensitivity(graph,{samples:10});assert.deepEqual(result,roleSensitivity(graph,{samples:10}));assert.equal(result.preliminary,true);assert.match(result.limitation,/communities are held fixed/);
 assert.ok(Object.values(result.ranks).every(value=>value.topTen>=0&&value.topTen<=1));
});
test('coupling cosine threshold stays part of the resampled analytical definition',()=>{
 const graph={method:'coupling',minimumShared:1,minimumCosine:.99,nodes:[{id:'a',cluster:1,references:['r1',...Array.from({length:10},(_,position)=>'a'+position)]},{id:'b',cluster:2,references:['r1',...Array.from({length:10},(_,position)=>'b'+position)]}],links:[]};
 const result=roleSensitivity(graph);assert.equal(result.minimumCosine,.99);assert.ok(Object.values(result.ranks).every(rank=>rank.topTen===0));
});
