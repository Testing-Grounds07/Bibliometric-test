import test from 'node:test';
import assert from 'node:assert/strict';
import {ShapeGeometry,Vector2} from 'three';
import {clusterLayerShape} from './hypergraph-3d-style.mjs';

function inside(point,boundary){let winding=false;for(let position=0,previous=boundary.length-1;position<boundary.length;previous=position++){const left=boundary[position],right=boundary[previous];if((left.y>point.y)!==(right.y>point.y)&&point.x<(right.x-left.x)*(point.y-left.y)/(right.y-left.y)+left.x)winding=!winding;}return winding;}

test('cluster sheets follow a padded rounded hull rather than filling a rectangular corner',()=>{
 const members=[{x:0,y:0},{x:200,y:0},{x:0,y:200},{x:30,y:30}],before=structuredClone(members),shape=clusterLayerShape(members),boundary=shape.getPoints();
 assert(boundary.length>30);assert(boundary[0].distanceTo(boundary.at(-1))<1e-8);assert(members.every(point=>inside(point,boundary)));assert(!inside(new Vector2(190,190),boundary));assert(inside(new Vector2(-10,0),boundary));assert.deepEqual(members,before);
 const geometry=new ShapeGeometry(shape);assert(geometry.index.count>0);assert([...geometry.attributes.position.array].every(Number.isFinite));geometry.dispose();
});

test('single-node, coincident and collinear clusters produce usable circular or capsule outlines',()=>{
 for(const members of [[],[{x:0,y:0}],[{x:5,y:10},{x:5,y:10}],[{x:-100,y:-100},{x:0,y:0},{x:100,y:100}],[{x:NaN,y:Infinity}]]){const boundary=clusterLayerShape(members).getPoints();assert(boundary.length>=32);assert(boundary.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));assert(boundary[0].distanceTo(boundary.at(-1))<1e-8);for(const member of members.filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)))assert(inside(member,boundary));}
});

test('outline ignores input ordering, duplicate coordinates and depth without moving articles',()=>{
 const members=[{x:-60,y:30,z:0},{x:100,y:70,z:72},{x:40,y:-80,z:144}],shape=clusterLayerShape(members).getPoints();assert.deepEqual(clusterLayerShape([...members].reverse().concat(members[0])).getPoints(),shape);assert.deepEqual(clusterLayerShape(members.map(point=>({...point,z:999}))).getPoints(),shape);
});
