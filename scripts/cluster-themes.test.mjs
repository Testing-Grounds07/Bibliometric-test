import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{},atob};
vm.runInNewContext(fs.readFileSync(new URL('../public/conservative-atlas/cluster-themes.js',import.meta.url),'utf8'),context);
const describe=context.window.ATLAS_THEMES.describe;
const document=(title,phrases)=>({title,abstract:'',embedding:Buffer.from([100,0]).toString('base64'),phrases:phrases.map(text=>({text,semantic:.8,count:1,evidence:[{field:'title',start:title.indexOf(text),end:title.indexOf(text)+text.length}]}))});
test('themes are evidence-linked, exclude unlinked works, and leave membership unchanged',()=>{
 const nodes=[{id:'a',cluster:1,citations:10},{id:'b',cluster:2,citations:5},{id:'c',cluster:0,citations:20}],before=JSON.stringify(nodes);
 const data={dimensions:2,documents:{a:document('shared leadership',['shared leadership']),b:document('public leadership',['public leadership']),c:document('noise',['noise'])}};
 const result=describe(nodes,data);assert.equal(result[1].heading,'shared leadership');assert.equal(result[1].keywords[0].sources[0].id,'a');assert.equal(result[0],undefined);assert.equal(result[1].evidenceMode,'Title-only');assert.equal(JSON.stringify(nodes),before);
});
test('sibling comparison downweights common phrases and updates after membership changes',()=>{
 const data={dimensions:2,documents:{a:document('leadership governance',['leadership','governance']),b:document('leadership teams',['leadership','teams'])}};
 const nodes=[{id:'a',cluster:1,citations:1},{id:'b',cluster:2,citations:1}],split=describe(nodes,data);
 assert.equal(split[1].keywords[0].text,'governance');assert.equal(split[2].keywords[0].text,'teams');
 const merged=describe(nodes.map(node=>({...node,cluster:1})),data);assert.equal(merged[1].comparisonClusters,1);assert.equal(merged[2],undefined);
});
test('missing metadata is disclosed without fabricated phrases',()=>{
 const result=describe([{id:'missing',cluster:1}],{dimensions:2,documents:{}})[1];
 assert.equal(result.heading,'Insufficient text');assert.equal(result.keywords.length,0);assert.equal(result.withText,0);
});
test('representative titles do not repeat, without merging graph references',()=>{
 const data={dimensions:2,documents:{a:document('Shared Leadership',['shared leadership']),b:document('SHARED LEADERSHIP.',['shared leadership']),c:document('Team creativity',['team creativity'])}};
 const result=describe([{id:'a',cluster:1,citations:3},{id:'b',cluster:1,citations:2},{id:'c',cluster:1,citations:1}],data)[1];
 assert.equal(result.total,3);assert.equal(result.representatives.length,2);assert.equal(result.keywords.find(term=>term.text==='shared leadership').sources.length,2);
});
test('published cached phrases have literal source spans and valid reference embeddings',()=>{
 const cache=JSON.parse(fs.readFileSync(new URL('../public/conservative-atlas/cluster-themes.json',import.meta.url),'utf8'));
 const expanded=JSON.parse(fs.readFileSync(new URL('../public/conservative-atlas/expanded-data.json',import.meta.url),'utf8'));
 const ids=new Set(expanded.base.nodes.flatMap(node=>[node.id,...(node.variants||[]).map(id=>id.split('/').pop())]));assert.equal(cache.sourceCorpusId,expanded.sourceCorpusId);
 assert.equal(Object.keys(cache.documents).length,cache.coverage.withText);
 for(const [id,record] of Object.entries(cache.documents)){
  assert(ids.has(id));assert.equal(Buffer.from(record.embedding,'base64').length,384);
  assert(record.phrases.length<=20);
  for(const phrase of record.phrases){assert(phrase.evidence.length);for(const span of phrase.evidence){assert(['title','abstract'].includes(span.field));assert.equal(Array.from(record[span.field]).slice(span.start,span.end).join('').toLowerCase().replace(/\s+/gu,' '),phrase.text);}}
 }
});

test('source keyword cache covers coupling with traceable titles and available abstracts',()=>{
 const cache=JSON.parse(fs.readFileSync(new URL('../public/conservative-atlas/source-cluster-themes.json',import.meta.url),'utf8'));
 const corpus=JSON.parse(fs.readFileSync(new URL('../public/conservative-atlas/source-evidence.json',import.meta.url),'utf8'));
 assert.equal(cache.sourceCorpusId,corpus.sourceCorpusId);
 assert.equal(cache.documentUnit,'source articles');
 assert.equal(cache.coverage.withAbstract,Object.values(cache.documents).filter(record=>record.abstract).length);
 assert(cache.coverage.withAbstract>0);
 assert.equal(Object.keys(cache.documents).length,corpus.articles.length);
 for(const article of corpus.articles){
  const record=cache.documents[article.id];assert.equal(record.title,article.title.trim());assert.equal(typeof record.abstract,'string');
  assert.equal(Buffer.from(record.embedding,'base64').length,384);
  for(const phrase of record.phrases)for(const span of phrase.evidence){assert(['title','abstract'].includes(span.field));assert.equal(Array.from(record[span.field]).slice(span.start,span.end).join('').toLowerCase().replace(/\s+/gu,' '),phrase.text);}
 }
});

test('phrases supported by several members outrank single-document fragments',()=>{
 const data={dimensions:2,documents:{a:document('shared leadership peculiar fragment',['shared leadership','peculiar fragment']),b:document('shared leadership',['shared leadership']),c:document('other topic',['other topic'])}};
 const result=describe([{id:'a',cluster:1},{id:'b',cluster:1},{id:'c',cluster:1}],data)[1];
 assert.equal(result.keywords[0].text,'shared leadership');
});
