import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {researchGraphDigest,bindRetainedChecks,researchTypeMap,assertLegacyCountEvidence} from './retained-research-checks.mjs';
const root='public/conservative-atlas/',manifest=JSON.parse(await fs.readFile(root+'ai-research/research-checks-v1.json','utf8'));
const graph=()=>({nodes:[{id:'https://openalex.org/W1',cluster:1,engineCommunity:0,references:['https://openalex.org/W8']},{id:'https://openalex.org/W2',cluster:0,engineCommunity:1,references:[]}],links:[],method:'coupling',order:2,maximumOrder:2,sourceCorpusId:'c',_projectId:'p',clustering:{algorithm:'leiden',objective:'modularity'},importedStandalone:{map_key:'m'}});
test('scientific settings and isolate memberships change identity; interpretation and layout do not',async()=>{
 const g=graph(),before=await researchGraphDigest(g);g.nodes[0].x=123;g.nodes[0].title='A current label';g.clustering.clusters=1;g.generatedDescriptions={x:'draft'};g.researchCheckRuns=[{result:{}}];assert.equal(await researchGraphDigest(g),before);
 for(const change of[g=>g.nodes[1].engineCommunity=99,g=>g.nodes[0].cluster=2,g=>g.nodes[0].references.push('W9'),g=>g.clustering.objective='CPM',g=>g.method='cocitation',g=>g.order=3,g=>g.maximumOrder=4,g=>g.normalization='other']){const changed=graph();change(changed);assert.notEqual(await researchGraphDigest(changed),before);}
});
test('supporting file corruption and scientific mutations withhold original results',async()=>{
 const g=graph(),file=new TextEncoder().encode('original'),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',file))].map(x=>x.toString(16).padStart(2,'0')).join(''),m={schema_version:'bibliomap.retained-checks.v1',maps:[{map_key:'m',corpus_id:'c',project_id:'p',graph_sha256:await researchGraphDigest(g),artifacts:[{path:'ai-research/original.json',sha256:sha}],checks:[]}]};
 assert(await bindRetainedChecks(g,m,async()=>file));await assert.rejects(bindRetainedChecks(g,m,async()=>new TextEncoder().encode('changed')),/identity changed/);
 g.nodes[1].engineCommunity=2;await assert.rejects(bindRetainedChecks(g,m,async()=>file),/membership/);
 assert.equal(await bindRetainedChecks({...graph(),importedStandalone:null},m,async()=>file),null);
});
test('all retained artifacts match published identities; source type metadata is complete',async()=>{
 assert.equal(manifest.maps.length,13);const seen=new Map();
 for(const m of manifest.maps){assert.equal(m.graph_sha256.length,64);assert(m.checks.length>=10);assert(m.not_assessed.some(x=>x.includes('bootstrap')));for(const a of m.artifacts){if(!seen.has(a.path))seen.set(a.path,await fs.readFile(root+a.path));const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',seen.get(a.path)))].map(x=>x.toString(16).padStart(2,'0')).join('');assert.equal(actual,a.sha256,a.path);}}
 const types=researchTypeMap((await fs.readFile(root+manifest.maps[0].artifacts.find(a=>a.path.endsWith('/work-theme-map.csv')).path)).toString());assert.equal(Object.keys(types).length,951);assert.equal(Object.values(types).filter(x=>x==='article').length,638);
});
test('quoted CSV titles with commas and newlines preserve exact source types',()=>{assert.deepEqual(researchTypeMap('id,title,type\r\nW1,"a,b\nsecond line",article\r\nW2,"a ""quote""",book\r\n'),{'https://openalex.org/W1':'article','https://openalex.org/W2':'book'});assert.throws(()=>researchTypeMap('id,type\nW1,article\nW1,book'),/duplicate/);});
test('legacy zero-filled count packets require a bound complete-source audit for global ranking',()=>{
 const g=graph(),records=g.nodes.map(n=>({id:n.id,citedBy:0})),input={kind:'rank-cutoff',options:{rankMetric:'global-citations',globalCitationField:'citedBy'}};
 assert.throws(()=>assertLegacyCountEvidence(g,records,null,input),/unknown missingness/);assert.doesNotThrow(()=>assertLegacyCountEvidence(g,records,{checks:[{id:'rank-cutoff',result:{audit:{global_count_missing:0}}}]},input));
 assert.doesNotThrow(()=>assertLegacyCountEvidence(g,records.map(r=>({...r,citedBy:2})),null,input));assert.doesNotThrow(()=>assertLegacyCountEvidence(g,records,null,{...input,options:{rankMetric:'incoming'}}));assert.doesNotThrow(()=>assertLegacyCountEvidence(g,records,null,{...input,options:{rankMetric:'global-citations',globalCitationField:'cited_by_count'}}));
});
