import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hypergraphModularity} from './community-methods.mjs';

const html=fs.readFileSync('public/conservative-atlas/hypergraph-help.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const {groups,membership,positions,together,adjacency,copy,scene,cpm,choice,flow,modularity}=new Function(script+';return {groups:GUIDE_GROUPS,membership:guideMembership,positions:guidePositions,together:combinationTogether,adjacency:guideAdjacency,copy:guideCopy,scene:guideScene,cpm:guideCPM,choice:guideLeidenChoice,flow:guideFlowScore,modularity:guideHypergraphScore};')();

test('guide uses the same whole combinations under all three explanations',()=>{
 assert.equal(groups.length,5);assert(groups.every(group=>group.length===3&&new Set(group).size===3));assert.equal(membership().length,8);
 assert.deepEqual(membership(true).map((value,position)=>value!==membership()[position]?position:-1).filter(position=>position>=0),[4]);
 assert.equal(together(groups[4],membership()),2);assert.equal(together(groups[4],membership(true)),3);assert.equal(together(groups[2],membership(true)),2);
});

test('illustrative walk follows actual article–combination memberships and permits backtracking',()=>{
 const graph=adjacency();assert.equal(graph.length,13);
 for(const [vertex,neighbors]of graph.entries())for(const neighbor of neighbors){assert.notEqual(vertex<8,neighbor<8);assert(graph[neighbor].includes(vertex));assert(groups[Math.max(vertex,neighbor)-8].includes(Math.min(vertex,neighbor)));}
});

test('each method has eight plain-English steps with visible actions and honest limits',()=>{
 for(const method of ['leiden','infomap','direct'])for(let phase=0;phase<8;phase++){const text=copy(method,phase);assert(text.heading&&text.short&&text.action&&text.copy&&text.outcome);for(const alternate of [false,true])assert(positions(phase,alternate).every(point=>point.x>20&&point.x<620&&point.y>20&&point.y<340));}
 assert(copy('leiden',4).copy.includes('CPM'));assert(copy('infomap',7).copy.includes('not its control'));assert(copy('direct',3).outcome.includes('only one part'));assert(copy('direct',7).copy.includes('without guaranteeing'));
});

test('method scenes use distinct motion mechanisms, not the same regrouping animation',()=>{
 assert.equal(new Set(['leiden','infomap','direct'].map(method=>scene(method,3).motion)).size,3);
 assert.notDeepEqual(scene('leiden',3,false,15,0).points,scene('leiden',3,false,15,1).points);
 assert.deepEqual(scene('direct',4,false,15,0).points,scene('direct',4,false,15,1).points);assert.notDeepEqual(scene('direct',4,false,15,0).membership,scene('direct',4,false,15,1).membership);
 assert(scene('leiden',5).compress===1);assert(scene('infomap',4).showTraveler);assert(!scene('leiden',4).showTraveler);assert(scene('direct',1).showEnvelopes);assert(!scene('direct',1).showHelpers);
 for(let phase=0;phase<8;phase++)assert.deepEqual(scene('infomap',phase).points,scene('infomap',0).points);
 for(const method of ['leiden','infomap','direct'])for(let phase=0;phase<8;phase++)for(const detail of [0,100])for(const progress of [0,.5,1])assert(scene(method,phase,false,detail,progress).points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=20&&point.x<=620&&point.y>=20&&point.y<=340));
});

test('CPM toy comparison uses memberships and size cost, and its detail slider changes the preferred candidate',()=>{
 const first=cpm(membership(),.188),other=cpm(membership(true),.188);assert.equal(first.internal,14);assert.equal(other.internal,14);assert(first.score>other.score);assert(first.cost<other.cost);
 assert.equal(new Set(choice(0).membership).size,2);assert.equal(new Set(choice(100).membership).size,4);
});

test('Infomap route lengths and direct modularity ingredients are calculated, not decorative scores',()=>{
 const one=flow(Array(8).fill(0)),local=flow(membership());assert(Number.isFinite(one)&&one>0);assert(Number.isFinite(local)&&local>0);assert.notEqual(one,local);
 const merged=modularity(Array(8).fill(0)),first=modularity(membership()),other=modularity(membership(true));assert(Math.abs(merged.score)<1e-12);assert(Math.abs(first.score-(first.observed-first.expected))<1e-12);assert(Math.abs(first.observed-other.observed)<1e-12);assert(first.expected<other.expected);assert(first.score>other.score);
 const hyperedges=groups.map(members=>({members:members.map(String),weight:1}));for(const alternate of [false,true]){const partition=membership(alternate);assert(Math.abs(modularity(partition).score-hypergraphModularity(hyperedges,Object.fromEntries(partition.map((group,position)=>[String(position),group]))))<1e-12);}
 assert(Math.abs(flow(membership())-flow(membership().map(group=>group+7)))<1e-12);
});

test('help is standalone, accessible, motion-aware and linked from the app',()=>{
 assert(!/<script\s+src|<link[^>]+stylesheet|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/.test(html));
 assert(html.includes('does not run the optimizers'));assert(html.includes('prefers-reduced-motion'));assert(html.includes("reduced.addEventListener('change'"));assert(html.includes("document.hidden"));assert(html.includes('role="tablist"'));assert(html.includes('aria-controls="guide"'));assert(html.includes("event.key==='ArrowRight'"));
 assert(html.includes('id="previous"'));assert(html.includes('aria-label="Explanation steps"'));assert(html.includes('Illustrative CPM detail'));
 const shell=fs.readFileSync('public/conservative-atlas/workspace-shell.js','utf8');assert(shell.includes("methodGuide.href='hypergraph-help.html'"));
});
