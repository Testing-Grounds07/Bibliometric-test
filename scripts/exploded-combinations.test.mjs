import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../public/conservative-atlas/exploded-view.js',import.meta.url),'utf8'),context);
const combinations=context.window.coCitationCombinations;
const edge={source:'A',target:'B'};
test('expands exact combinations while retaining the selected anchors',()=>{
 const result=combinations(edge,[{members:['A','B','C','D'],articles:['1','2','3','4','5']}],3);
 assert.equal(result.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(result.map(group=>group.members))),[['A','B','C'],['A','B','D']]);
 assert(result.every(group=>group.articles.length===5));
});
test('unions overlapping evidence once per exact combination',()=>{
 const result=combinations(edge,[{members:['A','B','C','D'],articles:['1','2','3','4','5']},{members:['A','B','C','E'],articles:['3','4','5','6','7']}],3);
 assert.equal(result.find(group=>group.members.includes('C')).articles.length,7);
 assert.equal(result.length,3);
});
test('respects order, pair membership, and minimum joint support',()=>{
 const bundles=[{members:['A','B','C'],articles:['1','2','3','4','5']},{members:['A','C','D','E'],articles:['1','2','3','4','5']},{members:['A','B','F','G'],articles:['1','2','3','4']}];
 assert.equal(combinations(edge,bundles,4).length,0);
});
test('exploratory support three is honored by the layer inspector',()=>{
 const bundles=[{members:['A','B','C'],articles:['1','2','3']}];
 assert.equal(combinations(edge,bundles,3).length,0);
 assert.equal(combinations(edge,bundles,3,3).length,1);
});
test('large previews are bounded without truncating shown support evidence',()=>{
 const members=['A','B',...Array.from({length:19},(_,position)=>'R'+position)];
 const result=combinations(edge,[{members,articles:['1','2','3']},{members,articles:['4','5','6']}],11,3);
 assert.equal(result.length,2000);assert(result.truncated);
 assert(result.every(group=>group.members.length===11&&group.articles.length===6));
});
