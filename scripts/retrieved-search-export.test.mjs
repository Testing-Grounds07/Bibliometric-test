import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import {PassThrough,Readable,Writable} from 'node:stream';
import {once} from 'node:events';
import {retrievedSearchExport} from './retrieved-search-export.mjs';
import {proxyAnalysis} from './analysis-proxy.mjs';

const id='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',route='/conservative-atlas/workspace-api/searches/'+id+'/export';
const record=()=>({id,project_id:projectId,name:'Focused master',created_at:'2026-10-19T00:00:00Z',query:{query:'original unchanged query',limit:20000,exhausted:true,pagination:{version:'openalex-pagination-v1',terminalCursorNull:true,stopReason:'cursor-exhausted',pages:[{rows:2,nextCursorFingerprint:null}]}},result_count:2,result_snapshot:{works:[{id:'https://openalex.org/W1',display_name:'Raw original one',type:'article',abstract_inverted_index:{Original:[0]}},{id:'https://openalex.org/W2',display_name:'Raw original two',type:'review'}],exhausted:true,total:2}});

test('retrieved export returns every stored source and original query before presets or identity cleanup',async()=>{
 const search=record(),before=structuredClone(search),calls=[],result=await retrievedSearchExport(id,async(kind,key)=>{calls.push([kind,key]);return kind==='searches'?search:{id:projectId,name:'Research project'};});
 assert.deepEqual(calls,[['searches',id],['projects',projectId]]);assert.deepEqual(result.result_snapshot.works,search.result_snapshot.works);assert.deepEqual(result.query,search.query);assert.equal(result.storedRecords,2);assert.equal(result.cursorCompletionVerified,true);assert.equal(result.pagination,search.query.pagination);assert.match(result.scope,/before corpus presets/);assert.match(result.scope,/not a raw response-page archive/);assert.deepEqual(search,before);
 const historical=record();delete historical.query.pagination;const old=await retrievedSearchExport(id,async kind=>kind==='searches'?historical:{id:projectId});assert.equal(old.pagination,null);assert.equal(old.cursorCompletionVerified,null);assert.equal(old.result_snapshot.exhausted,true);
});

test('retrieved export validates exact saved ID and existing matching parent, without writes or provider requests',async()=>{
 for(const invalid of ['../private','-'.repeat(36),null,'https://private.invalid/'+id]){let reads=0;await assert.rejects(retrievedSearchExport(invalid,async()=>reads++),/saved search/);assert.equal(reads,0);}
 await assert.rejects(retrievedSearchExport(id,async()=>null),/not found/);
 await assert.rejects(retrievedSearchExport(id,async kind=>kind==='searches'?record():null),/project was not found/);
 await assert.rejects(retrievedSearchExport(id,async kind=>kind==='searches'?record():{id:'wrong-project'}),/project was not found/);
 await assert.rejects(retrievedSearchExport(id,async kind=>kind==='searches'?{...record(),result_snapshot:{}}:{id:projectId}),/no retained source records/);
});

test('actual legacy export handler returns JSON attachment and refuses non-GET methods before reading',async()=>{
 const source=readFileSync('scripts/workspace-projects-service.mjs','utf8'),block=source.split('  const searchExportMatch = ')[1].split('\n  const searchMatch = ')[0],run=new Function('route','request','response','retrievedSearchExport','required','send','fail','return (async()=>{const searchExportMatch = '+block+'})()');
 const headers={},response={setHeader:(name,value)=>headers[name]=value};let reads=0;
 const result=await run('/searches/'+id+'/export',{method:'GET'},response,retrievedSearchExport,async kind=>{reads++;return kind==='searches'?record():{id:projectId};},(status,value)=>({status,value}),message=>{throw Error(message);});assert.equal(result.status,200);assert.equal(result.value.storedRecords,2);assert.equal(reads,2);assert.equal(headers['Content-Disposition'],'attachment; filename="bibliomap-retrieved-sources-'+id+'.json"');assert.equal(headers['X-Content-Type-Options'],'nosniff');
 await assert.rejects(run('/searches/'+id+'/export',{method:'POST'},response,retrievedSearchExport,async()=>{throw Error('Unexpected read');},()=>{},message=>{throw Error(message);}),/read-only/);
});

test('actual selected-search export button downloads only selected stored evidence and fails closed in protected mode',async()=>{
 const source=readFileSync('public/conservative-atlas/workspace-projects.js','utf8'),body=source.split(" const exportSources=button('Export retrieved sources',async()=>{")[1].split('\n });preview.append(exportSources')[0],calls=[],messages=[],links=[],context={window:{},selectedSearch:record(),project:{id:projectId},exportSources:{disabled:false},encodeURIComponent,setTimeout:callback=>callback(),URL:{createObjectURL:blob=>{assert(blob instanceof Blob);return 'blob:stored';},revokeObjectURL:url=>calls.push(['revoke',url])},element:()=>{const link={click(){links.push(this);}};return link;},message:text=>messages.push(text),fetch:async(...args)=>{calls.push(args);return Response.json({all:'stored sources'});}};
 const action=vm.runInNewContext('(async()=>{'+body+'})',context);await action();assert.equal(calls[0][0],'workspace-api/searches/'+id+'/export');assert.equal(calls[0].length,1);assert.equal(links[0].download,'bibliomap-retrieved-sources-'+id+'.json');assert.equal(context.exportSources.disabled,false);assert.match(messages.at(-1),/No corpus filters or new retrieval/);
 context.window.BIBLIOMAP={active:true};const before=calls.length;await assert.rejects(action(),/unavailable here/);assert.equal(calls.length,before);context.window.BIBLIOMAP=null;context.project.id='other';await assert.rejects(action(),/this project first/);assert.equal(calls.length,before);
 const protectedSource=readFileSync('scripts/multiuser/http.mjs','utf8');assert(!protectedSource.includes('retrievedSearchExport'));assert.match(protectedSource,/throw error\('Unsupported workspace request\.',404\);\s*\}\s*if\(url\.pathname\.startsWith\('\/api\/'\)\)/);
});

test('actual proxy streams exact GET export and safe attachment headers, rejecting writes and path/query variants',async()=>{
 const original=http.request,called=[];http.request=(options,callback)=>{called.push(options);const upstream=new PassThrough();upstream.on('finish',()=>{const result=Readable.from(['{"storedRecords":2}']);result.statusCode=200;result.headers={'content-disposition':'attachment; filename="bibliomap-retrieved-sources-'+id+'.json"'};callback(result);});return upstream;};
 try{for(const [url,method,expected] of [[route,'GET',200],[route,'POST',400],[route,'PATCH',400],[route+'?path=C:/private','GET',400],[route+'/../private','GET',400],[route.replace(id,'-'.repeat(36)),'GET',400]]){const request=Readable.from([]);Object.assign(request,{url,method,headers:{}});let body='',status,headers;const response=new Writable({write(chunk,encoding,done){body+=chunk;done();}});response.writeHead=(value,next)=>{status=value;headers=next;response.headersSent=true;};const completed=once(response,'finish');assert.equal(proxyAnalysis(request,response),true);await completed;assert.equal(status,expected);if(expected===200){assert.equal(body,'{"storedRecords":2}');assert.equal(headers['Content-Disposition'],'attachment; filename="bibliomap-retrieved-sources-'+id+'.json"');assert.equal(headers['Content-Type'],'application/json');assert.equal(headers['Cache-Control'],'no-store');assert.equal(headers['X-Content-Type-Options'],'nosniff');}}assert.equal(called.length,1);assert.equal(called[0].path,'/searches/'+id+'/export');assert.equal(called[0].port,8094);}finally{http.request=original;}
});
