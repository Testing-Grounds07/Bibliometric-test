import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {railArticles,projectedRailAnchor,railConnectorPath,railConnectorAppearance} from './hypergraph-3d-rail.mjs';

test('3D article rail lists exact members once and tracked context separately',()=>{
 const group={members:['a','b','c'],articles:['s1','s2']},before=structuredClone(group);
 assert.deepEqual(railArticles(group,'b'),{members:['a','b','c'],context:null});assert.deepEqual(railArticles(group,'d'),{members:['a','b','c'],context:'d'});assert.deepEqual(railArticles(null),{members:[],context:null});assert.deepEqual(group,before);
});

test('rail leaders project 3D nodes into their actual canvas viewport',()=>{
 const scene={left:20,top:100,width:600,height:400},body={left:10,top:80};
 assert.deepEqual(projectedRailAnchor({x:0,y:0,z:.5},scene,body),{x:310,y:220});assert.deepEqual(projectedRailAnchor({x:-1,y:1,z:0},scene,body),{x:10,y:20});
 for(const point of [{x:1.01,y:0,z:0},{x:0,y:0,z:1.01},{x:NaN,y:0,z:0}])assert.equal(projectedRailAnchor(point,scene,body),null);
 assert.equal(projectedRailAnchor({x:0,y:0,z:0},{...scene,width:0},body),null);
 const camera=new PerspectiveCamera(42,1.5,.1,12000);camera.position.set(0,0,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();const node=new Vector3(3,2,0),before=projectedRailAnchor(node.clone().project(camera),scene,body);camera.position.set(12,4,16);camera.lookAt(0,0,0);camera.updateMatrixWorld();const after=projectedRailAnchor(node.clone().project(camera),scene,body);assert(before&&after);assert.notDeepEqual(before,after);assert.deepEqual(node.toArray(),[3,2,0]);
});

test('hovered and tracked article leaders emphasize one node without hiding the others',()=>{
 assert(railConnectorAppearance('a','a','b').opacity>railConnectorAppearance('b','a','b').opacity);assert(railConnectorAppearance('c','a','b').opacity>0);assert.equal(railConnectorAppearance('b',null,'b').emphasized,true);
 const start={x:50,y:80},end={x:600,y:140};assert.match(railConnectorPath(start,end),/^M50,80C/);assert.notEqual(railConnectorPath(start,end),railConnectorPath(start,end,true));
});
