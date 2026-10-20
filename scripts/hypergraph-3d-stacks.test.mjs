import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterStacks,visibleClusterStacks,clusterLayerCoordinates,stackMapCenter,wheelStackStep,select3DGroups} from './hypergraph-3d-core.mjs';
import {fittedStackCamera,LAYER_STYLE} from './hypergraph-3d-style.mjs';
import {PerspectiveCamera,Vector3} from 'three';

const nodes=Array.from({length:12},(_,position)=>({id:String(position),cluster:Math.floor(position/4)+1,x:1000+position*30,y:1000+position%4*30}));
const edges=[{id:'one',members:['0','1','2'],articles:['s1','s2']},{id:'two',members:['0','2','3'],articles:['s1']},{id:'three',members:['4','5','6'],articles:['s1']},{id:'four',members:['5','6','7'],articles:['s1']},{id:'crossing',members:['0','4','5'],articles:['s1']}];

test('cluster stacks are equivalent to separate cluster filters, without partial crossing groups',()=>{
 const before=structuredClone({nodes,edges}),result=clusterStacks(edges,nodes);
 assert.equal(result.stacks.length,3);assert.equal(result.crossing,1);
 for(const stack of result.stacks){const filtered=nodes.filter(node=>String(node.cluster)===stack.cluster);assert.deepEqual(stack.groups,select3DGroups(edges,filtered).groups);assert.deepEqual(clusterLayerCoordinates(stack),clusterLayerCoordinates(clusterStacks(edges,filtered).stacks[0]));}
 assert.equal(result.stacks[2].groups.length,0);assert.equal(result.stacks[2].nodes.length,4);assert.deepEqual({nodes,edges},before);
});

test('layers and independent scroll cursors belong to their cluster, not the global canvas',()=>{
 const result=clusterStacks(edges,nodes),decks=visibleClusterStacks(result.stacks,'',false,8,{'1':1,'2':0});
 assert.deepEqual(decks.map(deck=>deck.cursor),[1,0,0]);assert.equal(new Set(decks.map(deck=>deck.x+'|'+deck.y)).size,3);
 assert.deepEqual(decks[0].groups.map(group=>group.id),['one','two']);assert.deepEqual(decks[1].groups.map(group=>group.id),['four','three']);
 assert.equal(visibleClusterStacks(result.stacks,'0',true,8).flatMap(deck=>deck.groups).length,2);
 assert.equal(visibleClusterStacks(result.stacks,'',false,4,{'1':100})[0].cursor,1);
 const points=clusterLayerCoordinates(decks[0]);assert(Object.values(points).every(point=>Math.abs(point.x)<=200&&Math.abs(point.y)<=200));assert(points['3']);
});

test('wheel traverses one layer per gesture, accumulates trackpad motion and clamps endpoints',()=>{
 assert.deepEqual(wheelStackStep(0,4,100),{cursor:1,remainder:0});assert.equal(wheelStackStep(3,4,100).cursor,3);assert.equal(wheelStackStep(0,4,-100).cursor,0);assert.equal(wheelStackStep(2,4,-100).cursor,1);
 const partial=wheelStackStep(0,4,20);assert.deepEqual(partial,{cursor:0,remainder:20});assert.equal(wheelStackStep(0,4,40,0,partial.remainder).cursor,1);
 assert.equal(wheelStackStep(0,4,4,1).cursor,1);assert.equal(wheelStackStep(0,4,1,2).cursor,1);assert.equal(wheelStackStep(0,4,5000).cursor,1);assert.equal(wheelStackStep(0,1,100).cursor,0);
});

test('overview fit contains every stack and any independently scrolled layer',()=>{
 const stacks=visibleClusterStacks(clusterStacks(edges,nodes).stacks,'',false,8);
 for(const aspect of [.6,1,2.6]){const camera=new PerspectiveCamera(42,aspect,.1,12000);camera.position.fromArray(fittedStackCamera(stacks,true,aspect));camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const stack of stacks)for(const x of [stack.x-250,stack.x+250])for(const z of [-stack.y-280,-stack.y+280])for(const y of [-1,1].map(sign=>sign*Math.max(0,stack.groups.length-1)*LAYER_STYLE.spacing)){const point=new Vector3(x,y,z).project(camera);assert(Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1);}
 }
});

test('global preview budgets distribute complete groups round-robin instead of clipping members',()=>{
 const many=Array.from({length:300},(_,position)=>({cluster:String(position+1),nodes:[],groups:[{id:String(position),members:['a','b','c']}],total:1})),visible=visibleClusterStacks(many,'',false,8);
 assert.equal(visible.length,300);assert.equal(visible.flatMap(deck=>deck.groups).length,256);assert(visible.flatMap(deck=>deck.groups).every(group=>group.members.length===3));
});

test('3D preserves all main-map node displacements with one shared scale, not a grid or per-cluster normalization',()=>{
 const spatial=[{id:'a',cluster:1,x:-100,y:20},{id:'b',cluster:1,x:0,y:60},{id:'c',cluster:2,x:40,y:-90},{id:'d',cluster:2,x:60,y:-80},{id:'e',cluster:3,x:200,y:180}],before=structuredClone(spatial),decks=visibleClusterStacks(clusterStacks([],spatial).stacks,'',false,8),positions=new Map();
 for(const deck of decks)for(const [id,point]of Object.entries(clusterLayerCoordinates(deck)))positions.set(id,{x:deck.x+point.x,y:deck.y+point.y});
 const scale=decks[0].scale;assert(decks.every(deck=>deck.scale===scale));assert(decks[0].width>decks[1].width);
 for(const left of spatial)for(const right of spatial){assert(Math.abs((positions.get(right.id).x-positions.get(left.id).x)-(right.x-left.x)*scale)<1e-8);assert(Math.abs((positions.get(right.id).y-positions.get(left.id).y)+(right.y-left.y)*scale)<1e-8);}
 assert.deepEqual(spatial,before);assert.deepEqual(stackMapCenter([]),{x:0,y:0});
});

test('display filters, layer limits and cursor changes never rearrange the map plane',()=>{
 const all=clusterStacks(edges,nodes).stacks,initial=visibleClusterStacks(all,'',false,8),filtered=visibleClusterStacks(clusterStacks(edges,nodes.filter(node=>node.cluster===2),{},nodes).stacks,'',false,4,{'2':1})[0];
 const full=initial.find(stack=>stack.cluster==='2');assert.equal(filtered.x,full.x);assert.equal(filtered.y,full.y);assert.equal(filtered.scale,full.scale);assert.deepEqual(clusterLayerCoordinates(filtered),clusterLayerCoordinates(full));
 const matching=visibleClusterStacks(all,'0',true,4);for(const deck of matching){const original=initial.find(stack=>stack.cluster===deck.cluster);assert.equal(deck.x,original.x);assert.equal(deck.y,original.y);assert.equal(deck.width,original.width);}
});

test('irregular sheet bounds fit narrow and wide cameras without losing the preserved map layout',()=>{
 const stacks=[{x:-900,y:300,width:900,height:200,groups:[{},{}]},{x:400,y:-600,width:130,height:700,groups:[{}]}],midpoint=stackMapCenter(stacks),relative=stacks.map(stack=>({...stack,x:stack.x-midpoint.x,y:stack.y-midpoint.y}));
 for(const aspect of [.6,2.6]){const camera=new PerspectiveCamera(42,aspect,.1,12000);camera.position.fromArray(fittedStackCamera(relative,true,aspect));camera.lookAt(0,0,0);camera.updateMatrixWorld();for(const stack of relative)for(const x of [stack.x-stack.width/2,stack.x+stack.width/2])for(const z of [-stack.y-stack.height/2,-stack.y+stack.height/2])for(const y of [-72,72]){const point=new Vector3(x,y,z).project(camera);assert(Math.abs(point.x)<1&&Math.abs(point.y)<1);}}
});
