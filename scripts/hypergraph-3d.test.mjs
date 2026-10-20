import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {select3DGroups,layerCoordinates,explodedDepth,matching3DGroups} from './hypergraph-3d-core.mjs';
import {LAYER_STYLE,roundedLayerShape,layerAppearance,layerCaption,layerCaptionVisible,fittedLayerCamera} from './hypergraph-3d-style.mjs';
import {PerspectiveCamera,Vector3} from 'three';

const nodes=['a','b','c','d','e','f'].map((id,position)=>({id,cluster:position<3?1:2,x:position*20,y:position%3*50}));
const groups=[{id:'one',members:['a','b','c'],articles:['s1','s2']},{id:'two',members:['a','b','d'],articles:['s1']},{id:'three',members:['d','e','f'],articles:['s1']}];

test('only the selected layer has a combination caption, while cluster headings remain visible',()=>{
 for(const active of [0,2,7])assert.deepEqual(Array.from({length:8},(_,position)=>position).filter(position=>layerCaptionVisible(position,active)),[active]);
 assert(!layerCaptionVisible(0,0,0));assert(!layerCaptionVisible(-1,-1));assert(!layerCaptionVisible(0,-1));assert(layerCaptionVisible(-1,-1,0,true));assert(!layerCaptionVisible(2,0));assert(layerCaptionVisible(2,2));
});

test('3D reset fits complete exploded sheets in narrow and wide viewports',()=>{
 for(const count of [1,4,8,16])for(const aspect of [.6,1,2.6,3.5]){
  const camera=new PerspectiveCamera(42,aspect,.1,12000);camera.position.fromArray(fittedLayerCamera(count,true,aspect));camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const x of [-250,250])for(const y of [-1,1].map(sign=>sign*(count-1)*LAYER_STYLE.spacing/2))for(const z of [-280,280]){const point=new Vector3(x,y,z).project(camera);assert(Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1);}
 }
});

test('3D sheets match exploded-view emphasis without changing group evidence',()=>{
 const before=structuredClone(groups),shape=roundedLayerShape(),points=shape.getPoints(12);
 assert(points.length>12);assert(points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&Math.abs(point.x)<=LAYER_STYLE.width/2&&Math.abs(point.y)<=LAYER_STYLE.height/2));
 assert(points[0].distanceTo(points.at(-1))<.001);
 const focused=layerAppearance(1,1),context=layerAppearance(0,1),overview=layerAppearance(0,-1);
 for(const property of ['sheet','border','member','caption'])assert(focused[property]>context[property]);assert(overview.sheet>.9);
 assert(Object.values(layerAppearance(1,1,0)).every(value=>value===0));assert(Object.values(layerAppearance(0,1,2)).every(value=>value>=0&&value<=1));
 assert.equal(layerCaption(groups[0],1),'Combination 1 · 3 members · 2 sources');assert.equal(layerCaption(groups[0],1,true),'Combination 1 · 3 members · 1 shared reference');assert.deepEqual(groups,before);
});
test('3D preview retains only complete groups and samples distinct cluster coverage',()=>{
 const result=select3DGroups(groups,nodes,{},2);assert.equal(result.total,3);assert.equal(result.groups.length,2);
 assert(!select3DGroups(groups,nodes.slice(0,3)).groups.includes(groups[1]));
 assert.deepEqual(select3DGroups(groups,nodes,{node:'a'}).groups.map(group=>group.id),['one','two']);
 assert.deepEqual(select3DGroups(groups,nodes,{edge:'e|f'}).groups.map(group=>group.id),['three']);
 assert.equal(select3DGroups(groups,nodes,{query:'not present'}).total,0);
 assert.equal(select3DGroups(groups,nodes,{query:'a'}).total,2);
});
test('3D positions retain article identity on all planes without altering data',()=>{
 const before=structuredClone({nodes,groups}),positions=layerCoordinates(nodes,groups);
 assert(Object.values(positions).every(point=>Object.values(point).every(Number.isFinite)));
 assert.equal(explodedDepth(0,3),-55);assert.equal(explodedDepth(2,3),55);
 assert.deepEqual(layerCoordinates([],[]),{});assert.deepEqual({nodes,groups},before);
 assert.equal(matching3DGroups(groups,'a',false),groups);assert.deepEqual(matching3DGroups(groups,'a',true),groups.slice(0,2));
});
test('large complete groups are omitted explicitly, never clipped into false combinations',()=>{
 const large=Array.from({length:241},(_,position)=>({id:'work'+position,cluster:1})),edge={members:large.map(node=>node.id)};
 const result=select3DGroups([edge],large);assert.equal(result.total,1);assert.equal(result.oversized,1);assert.equal(result.groups.length,0);
});
test('offline animated guide computes CPM and map-equation values on its toy graph',()=>{
 const html=fs.readFileSync('public/conservative-atlas/methods-explained.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const {exampleNetwork,cpmScore,mapEquation}=new Function(script+';return {exampleNetwork,cpmScore,mapEquation};')();
 const {nodes,edges}=exampleNetwork(),one=nodes.map(()=>0),three=nodes.map(node=>node.group);
 assert.equal(nodes.length,12);assert.equal(edges.length,21);
 assert(cpmScore(edges,three,.1)>cpmScore(edges,one,.1));
 assert(mapEquation(edges,three)<mapEquation(edges,one));
 assert(mapEquation(edges,three)>0);assert(Number.isFinite(mapEquation(edges,one)));
 assert(!/<script\s+src|<link[^>]+stylesheet|fetch\(/.test(html));
});
