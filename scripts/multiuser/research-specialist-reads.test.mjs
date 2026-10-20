import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ResearchSessions} from './research-sessions.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=value=>Buffer.from(JSON.stringify(value),'utf8');

test('authorized archived bulk excerpts preserve Unicode/codepoint spans and explicit pagination',async()=>{
 const sourceId='source-fixture',specialistId='specialist-fixture',text=('μ'.repeat(499)+'😀').repeat(20),characters=Array.from(text),units={};
 for(let index=0;index<20;index++){const start=index*500,end=start+500;units['Q'+(index+1)]={source_id:sourceId,segment_id:'segment-0',start,end,offset_unit:'Unicode codepoints within selected segment; end exclusive',text_sha256:sha(Buffer.from(characters.slice(start,end).join(''),'utf8'))};}
 const manifest=bytes({work_id:'W1'}),extraction=bytes({segments:[{id:'segment-0',locator:'PDF-page:1',text}]}),chart=bytes({status:'machine_proposed_literal_bound',bindings:[{source_id:sourceId,selected_segment_ids:['segment-0'],manifest_sha256:sha(manifest),extraction_sha256:sha(extraction)}],appraisals:[]});
 const contents=new Map([['sources/'+sourceId+'/source.json',manifest],['sources/'+sourceId+'/extraction.json',extraction],['specialists/'+specialistId+'/appraisal.json',chart],['specialists/'+specialistId+'/excerpt-unit-map.json',bytes(units)]]);
 let authorizations=0;const service=new ResearchSessions({auth:{authorize:async()=>{authorizations++;}},store:{},files:{}});
 service.record=async()=>({lastJobId:'job-fixture'});service.archive=async()=>({contents,payload:{exchange:{result:{specialist_ids:[specialistId]}}}});
 const original=Object.keys(units).slice(0,16);let remaining=original,seen=[];
 while(remaining.length){const result=await service.read({projectId:'project-a'},'specialist_page','session-a',{specialist_id:specialistId,excerpt_ids:remaining});assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=16000);assert.ok(result.excerpts.length);seen.push(...result.excerpts);assert.deepEqual([...seen.map(row=>row.excerpt_id),...result.remaining_excerpt_ids],original);remaining=result.remaining_excerpt_ids;}
 assert.equal(seen.map(row=>row.quote).join(''),characters.slice(0,8000).join(''));assert.ok(authorizations>=2);
 for(const args of [{excerpt_ids:[]},{excerpt_ids:['missing']},{excerpt_ids:['Q1','Q1']},{excerpt_ids:['Q1'],fields:['rater']}])await assert.rejects(()=>service.read({},'specialist_page','session-a',{specialist_id:specialistId,...args}));
 await assert.rejects(()=>service.read({},'specialist_page','session-a',{specialist_id:'other-chart',excerpt_ids:['Q1']}));
});
