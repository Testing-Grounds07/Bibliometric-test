import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {drillGraph,expandedMembers} from './drill-analysis.mjs';

const expanded=JSON.parse(fs.readFileSync('public/conservative-atlas/expanded-data.json','utf8'));
const context={window:{}};vm.runInNewContext(fs.readFileSync('public/conservative-atlas/data.js','utf8'),context);
const data=context.window.ATLAS_DATA;
test('expanded incidence preserves the original reference counts and source corpus',()=>{
 assert.equal(expanded.sourceCorpusId,data.summary.corpus_id);assert.equal(expanded.sourceArticleCount,2855);assert(expanded.complete);
 const original=Object.values(data.graphs).find(graph=>graph.threshold===10&&graph.order===2),nodes=new Map(expanded.base.nodes.map(node=>[node.id,node]));
 for(const node of original.nodes){assert.equal(nodes.get(node.id).citations,node.citations);assert.deepEqual(nodes.get(node.id).articles.slice().sort(),Array.from(node.articles).sort());}
});
test('expanded data reproduces existing strict pairwise and higher-order support',()=>{
 const original=Object.values(data.graphs).find(graph=>graph.threshold===10&&graph.order===2),members=original.nodes.map(node=>node.id);
 for(const order of [2,3,4,10]){
  const graph=drillGraph(expanded.base,members,expanded.bundles,order,10,5),prior=Object.values(data.graphs).find(graph=>graph.threshold===10&&graph.order===order);
  const key=edge=>[edge.source,edge.target].sort().join('|'),actual=new Map(graph.links.map(edge=>[key(edge),edge]));assert.equal(actual.size,prior.links.length);
  for(const edge of prior.links){assert.equal(actual.get(key(edge)).count,edge.count);assert.deepEqual(actual.get(key(edge)).articles.slice().sort(),Array.from(edge.articles).sort());}
 }
});
test('every real expansion addition satisfies the selected anchor and citation thresholds',()=>{
 const original=Object.values(data.graphs).find(graph=>graph.threshold===10&&graph.order===2),anchors=original.nodes.filter(node=>node.cluster===1).map(node=>node.id),anchorSet=new Set(anchors),nodes=new Map(expanded.base.nodes.map(node=>[node.id,node]));
 for(const support of [3,5]){
  const selected=expandedMembers(expanded.base,anchors,5,support,10);assert(selected.length>anchors.length);
  for(const id of selected.filter(id=>!anchorSet.has(id))){assert(nodes.get(id).citations>=5&&nodes.get(id).citations<10);assert(expanded.base.links.some(edge=>edge.count>=support&&((edge.source===id&&anchorSet.has(edge.target))||(edge.target===id&&anchorSet.has(edge.source)))));}
 }
});
