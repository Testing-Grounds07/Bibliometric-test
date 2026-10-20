import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPaginationAudit,acceptPaginationPage,finishPaginationAudit} from './openalex-pagination.mjs';
import {executeStage} from './multiuser/stages.mjs';
import {searchSpecification} from './workspace-projects-core.mjs';

const query='("leadership development" OR "leader development" OR "leadership training" OR "leader training" OR "leadership education" OR "leadership program" OR "leadership programme") AND "adaptive leadership"';
const work=(id,extra={})=>({id:'https://openalex.org/W'+id,...extra});
const page=(results,count,next)=>({results,meta:{count,...(next===undefined?{}:{next_cursor:next})}});
const clone=value=>JSON.parse(JSON.stringify(value));

async function legacy(pages,limit=20000,afterRequest=()=>{}){
 const saved=[],requests=[],controller=new AbortController(),job={controller,pages:0},specification=searchSpecification({query,phrase:false,limit}),source=readFileSync('scripts/workspace-projects-service.mjs','utf8');
 const context={createPaginationAudit,acceptPaginationPage,finishPaginationAudit,AbortSignal,Date,fields:'unchanged-fields',store:{create:async(kind,record)=>{saved.push(clone(record));return {id:'saved-search',...record};},driver:{executeQuery:async()=>{}}},openalex:async parameters=>{requests.push(parameters);afterRequest(controller,requests.length);const next=pages[requests.length-1];if(next instanceof Error)throw next;if(!next)throw Error('Unexpected page request');return next;}};
 vm.runInNewContext(source.match(/async function searchJob\(job, projectId, specification\) \{[\s\S]*?\n\}/)[0],context);
 await context.searchJob(job,'unchanged-project',specification);return {job,saved,requests,specification};
}

function protectedContext(responses,checkpoint,blobs=new Map()){
 const requests=[],saved=[];let nextBlob=blobs.size;
 return {requests,saved,blobs,signal:new AbortController().signal,checkpoint,progress(){},rateLimit:async()=>{},saveCheckpoint:async value=>saved.push(structuredClone(value)),files:{get:async checksum=>blobs.get(checksum),put:async value=>{const checksum='page-'+ ++nextBlob;blobs.set(checksum,structuredClone(value));return {checksum};}},fetch:async target=>{const url=new URL(target);requests.push(url);const response=responses[requests.length-1];if(response instanceof Error)throw response;if(!response)throw Error('Unexpected page request');return Response.json(response);}};
}

test('actual legacy retrieval follows cursors despite changing counts, duplicate IDs and empty nonterminal pages',async()=>{
 const result=await legacy([page([work(1),work(2)],2,'cursor-2'),page([work(2,{display_name:'Later observation'}),work(3)],1,'cursor-3'),page([],4,'cursor-4'),page([work(4)],4,null)]);
 assert.equal(result.job.status,'complete');assert.equal(result.requests.length,4);for(const request of result.requests){assert.equal(request.search,query);assert.equal(request.filter,result.specification.filter);assert.equal(request.corpus,'core');}
 const record=result.saved[0],audit=record.query.pagination;assert.equal(record.query.exhausted,true);assert.equal(record.result_snapshot.exhausted,true);assert.deepEqual(record.result_snapshot.pagination,audit);assert.equal(record.result_snapshot.works[1].display_name,'Later observation');
 assert.equal(audit.rawRows,5);assert.equal(audit.uniqueRecords,4);assert.equal(audit.duplicateRows,1);assert.equal(audit.initialTotal,2);assert.equal(audit.latestTotal,4);assert.equal(audit.countChanged,true);assert.deepEqual(audit.pages.map(item=>item.rows),[2,2,0,1]);assert.equal(audit.terminalCursorNull,true);assert.equal(audit.stopReason,'cursor-exhausted');
 for(const entry of audit.pages){assert.match(entry.requestCursorFingerprint,/^[a-f0-9]{64}$/);assert.match(entry.responseChecksum,/^[a-f0-9]{64}$/);assert(!JSON.stringify(entry).includes('cursor-'));assert(!JSON.stringify(entry).includes(query));}assert.equal(audit.pages.at(-1).nextCursorFingerprint,null);
});

test('actual legacy result limit stays partial, while null cursor on a nonempty final page is complete',async()=>{
 const bounded=await legacy([page([work(1),work(2)],100,'more')],2);assert.equal(bounded.saved[0].query.exhausted,false);assert.equal(bounded.saved[0].query.pagination.stopReason,'result-limit');assert.equal(bounded.requests.length,1);
 const terminal=await legacy([page([work(1),work(2)],100,null)],2);assert.equal(terminal.saved[0].query.exhausted,true);assert.equal(terminal.saved[0].query.pagination.pages[0].rows,2);
});

test('invalid or cyclic provider cursors fail actual legacy retrieval without publishing a complete search',async()=>{
 for(const invalid of [undefined,'',0,{},'*']){const result=await legacy([page([work(1)],1,invalid)]);assert.equal(result.job.status,'failed');assert.equal(result.saved.length,0);assert.match(result.job.error,/pagination/);}
 const cyclic=await legacy([page([work(1)],1,'second'),page([work(2)],2,'third'),page([],2,'second')]);assert.equal(cyclic.job.status,'failed');assert.equal(cyclic.saved.length,0);assert.match(cyclic.job.error,/repeated a cursor/);
 const cancelled=await legacy([page([work(1)],1,null)],20,controller=>controller.abort());assert.equal(cancelled.job.status,'cancelled');assert.equal(cancelled.saved.length,0);
});

test('protected retrieval persists audit/checkpoint and resumes to actual terminal cursor after interruption',async()=>{
 const specification=searchSpecification({query,phrase:false,limit:20000}),first=protectedContext([page([work(1),work(2)],1,'resume'),Error('Interrupted')]);
 await assert.rejects(executeStage('retrieval',{specification},{},first),/Interrupted/);const checkpoint=first.saved.at(-1);assert.equal(checkpoint.exhausted,false);assert.equal(checkpoint.cursor,'resume');assert.equal(checkpoint.pagination.pages.length,1);
 const second=protectedContext([page([work(2),work(3)],0,'empty-next'),page([],3,'final'),page([work(4)],4,null)],checkpoint,first.blobs),result=await executeStage('retrieval',{specification},{},second);
 assert.equal(result.exhausted,true);assert.equal(result.pagination.rawRows,5);assert.equal(result.pagination.uniqueRecords,4);assert.equal(result.pagination.duplicateRows,1);assert.equal(result.pagination.pages.length,4);assert.equal(result.pagination.latestTotal,4);assert.equal(second.saved.at(-1).cursor,null);assert.equal(second.requests[0].searchParams.get('cursor'),'resume');
 for(const request of second.requests){assert.equal(request.searchParams.get('search'),query);assert.equal(request.searchParams.get('corpus'),'core');assert.equal(request.searchParams.get('filter'),specification.filter);}
 const completed=protectedContext([],second.saved.at(-1),second.blobs),restored=await executeStage('retrieval',{specification},{},completed);assert.equal(completed.requests.length,0);assert.deepEqual(restored.pagination,result.pagination);
});

test('old protected checkpoints never imply terminal completion from count or historical exhausted flag',async()=>{
 const specification=searchSpecification({query,limit:20000}),blobs=new Map([['old-page',[work(1)]]]),old={cursor:'remaining',pages:['old-page'],total:1,exhausted:true,startedAt:'2026-10-19T00:00:00Z'},context=protectedContext([page([work(2)],2,null)],structuredClone(old),blobs),result=await executeStage('retrieval',{specification},{},context);
 assert.equal(context.requests.length,1);assert.equal(result.works.length,2);assert.equal(result.pagination.priorPagesUnaudited,1);assert.equal(result.pagination.initialTotal,null);assert.equal(result.pagination.firstAuditedTotal,2);assert.equal(result.pagination.rawRows,2);assert.equal(result.pagination.terminalCursorNull,true);
 for(const cursor of ['',null])await assert.rejects(executeStage('retrieval',{specification},{},protectedContext([],{...old,cursor},blobs)),/no verifiable terminal cursor/);
});

test('protected invalid cursors fail closed and bounded results retain nonterminal audit',async()=>{
 const specification=searchSpecification({query,limit:2});
 const bounded=await executeStage('retrieval',{specification},{},protectedContext([page([work(1),work(2)],2,'more')]));assert.equal(bounded.exhausted,false);assert.equal(bounded.pagination.stopReason,'result-limit');
 for(const cursor of [undefined,0,'','*'])await assert.rejects(executeStage('retrieval',{specification},{},protectedContext([page([work(1)],1,cursor)])),/pagination/);
 await assert.rejects(executeStage('retrieval',{specification},{},protectedContext([page([work(1)],1,'second'),page([],0,'third'),page([],0,'second')])),/repeated a cursor/);
 const source=readFileSync('scripts/multiuser/stages.mjs','utf8');assert.match(source,/if\(stage==='retrieval'\)contents.push\(await readFile\(new URL\('\.\.\/openalex-pagination.mjs'/);
});

test('page audit rejects malformed work/count and unproven terminal checkpoint without logging provider content',()=>{
 for(const response of [page([{}],1,null),page([work(1)],-1,null),page([work(1)],1.5,null)])assert.throws(()=>acceptPaginationPage(createPaginationAudit(),response,'*',new Map()),/invalid page/);
 assert.throws(()=>createPaginationAudit({version:'openalex-pagination-v1',pages:[],terminalCursorNull:true,stopReason:'cursor-exhausted'}),/not supported/);
 const audit=createPaginationAudit();finishPaginationAudit(audit,2);assert.equal(audit.stopReason,'pending');assert.equal(audit.terminalCursorNull,false);
});
