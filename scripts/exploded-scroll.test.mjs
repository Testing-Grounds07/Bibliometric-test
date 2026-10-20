import test from 'node:test';
import assert from 'node:assert/strict';
import {alignedLayerPoints,combinationsForEdge,centeredLayer,selectedArticlePlacement,articleConnectorStyle,filterLayerGroups} from './exploded-view.mjs';
const nodes=[{id:'a',x:0,y:0},{id:'b',x:100,y:100},{id:'c',x:50,y:25},{id:'d',x:80,y:20}];
test('layer filtering is optional and requires a tracked article',()=>{
 const groups=[{members:['a','b']},{members:['b','c']}];
 assert.equal(filterLayerGroups(groups,'a',false),groups);
 assert.equal(filterLayerGroups(groups,null,true),groups);
});
test('only real members match, including combinations beyond the first loaded batch',()=>{
 const groups=Array.from({length:8},(value,position)=>({key:String(position),members:position===6?['a','d']:['b','c']}));
 const original=structuredClone(groups),filtered=filterLayerGroups(groups,'a',true);
 assert.deepEqual(filtered,[groups[6]]);
 assert.equal(selectedArticlePlacement(groups[0],'a'),'context');
 assert(!filtered.includes(groups[0]));
 assert.deepEqual(groups,original);
 assert.deepEqual(filterLayerGroups(groups,'missing',true),[]);
});
test('filtering retains combination identity and full-scope article numbering',()=>{
 const groups=[{key:'one',members:['a','b']},{key:'two',members:['b','c']},{key:'three',members:['a','d']}];
 const ids=[...new Set(groups.flatMap(group=>group.members))].sort(),points=alignedLayerPoints(nodes,ids);
 const filtered=filterLayerGroups(groups,'d',true);
 assert.equal(filtered[0],groups[2]);
 assert.equal(groups.indexOf(filtered[0])+1,3);
 assert.equal(ids.indexOf('d')+1,4);
 assert.equal(points.get('d'),filtered[0].members.map(id=>points.get(id))[1]);
});
test('tracking emphasizes one connector without hiding the other article leaders',()=>{
 const tracked=articleConnectorStyle('a','a'),other=articleConnectorStyle('a','b'),plain=articleConnectorStyle(null,'b');
 assert(other.opacity>=.3);assert.equal(other.opacity,plain.opacity);assert(tracked.opacity>other.opacity);assert(other.width>=1);
});
test('one full-universe layout keeps article positions stable as more layers are appended',()=>{
 const points=alignedLayerPoints(nodes,['a','b','c','d']);
 const before={...points.get('c')};
 for(const members of [['a','b','c'],['b','c','d']])assert.deepEqual(members.map(id=>points.get(id))[members.indexOf('c')],before);
 assert([...points.values()].every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
});
test('connection layers keep A and B anchored while other identities keep fixed positions',()=>{
 const points=alignedLayerPoints(nodes,['a','b','c','d'],{source:'a',target:'b'});
 assert.deepEqual(points.get('a'),{x:75,y:35});assert.deepEqual(points.get('b'),{x:365,y:35});assert(points.get('c').y>=85);
});
test('missing coordinates and empty scopes do not produce invalid rendered points',()=>{
 assert.deepEqual([...alignedLayerPoints([],[])],[]);
 assert([...alignedLayerPoints([{id:'a'},{id:'b'}],['a','b']).values()].every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
});
test('connection expansion still deduplicates supporting articles',()=>{
 const groups=combinationsForEdge({source:'a',target:'b'},[{members:['a','b','c'],articles:['one','two','three']},{members:['a','b','c'],articles:['one','four','five']}],3,5);
 assert.equal(groups.length,1);assert.equal(groups[0].articles.length,5);
});
test('scroll focus follows the nearest visible plane in either direction',()=>{
 const layers=[{position:0,top:-50,bottom:50},{position:1,top:80,bottom:180},{position:2,top:210,bottom:310}];
 assert.equal(centeredLayer(layers,0,400,0),2);
 assert.equal(centeredLayer(layers,0,180,2),1);
 assert.equal(centeredLayer(layers,210,310,1),2);
});
test('scroll focus has a small deadband so boundary jitter does not flicker',()=>{
 const layers=[{position:0,top:100,bottom:200},{position:1,top:230,bottom:330}];
 assert.equal(centeredLayer(layers,16,416,0),0);
 assert.equal(centeredLayer(layers,40,440,0),1);
 assert.equal(centeredLayer(layers,16,416,1),1);
});
test('offscreen, collapsed and invalid planes cannot retain scroll focus',()=>{
 assert.equal(centeredLayer([{position:0,top:-200,bottom:-100},{position:1,top:40,bottom:100}],0,200,0),1);
 assert.equal(centeredLayer([{position:0,top:50,bottom:50},{position:1,top:NaN,bottom:100}],0,200,0),null);
 assert.equal(centeredLayer([],0,200,0),null);
 assert.equal(centeredLayer([{position:0,top:0,bottom:200}],100,100,0),null);
});
test('tracked articles are listed once as members or separately as context without changing the combination',()=>{
 const group={members:['a','b','c']},original=group.members.slice();
 assert.equal(selectedArticlePlacement(group,null),'none');
 assert.equal(selectedArticlePlacement(group,'a'),'member');
 assert.equal(selectedArticlePlacement(group,'d'),'context');
 assert.deepEqual(group.members,original);
 assert.equal(selectedArticlePlacement({members:['b','c','d']},'a'),'context');
});
