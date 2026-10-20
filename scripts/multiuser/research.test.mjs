import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Neo4jStore} from '../../neo4j-store.mjs';
import {MultiuserStore} from './store.mjs';
import {FileArtifacts} from './artifacts.mjs';
import {Computations} from './computations.mjs';
import {ResearchIntegration} from './research.mjs';
import {runnerConfiguration} from './research-runner.mjs';
import {createMultiuserServer} from './http.mjs';
import {evidenceExchange,wire,unwire,normalizedId} from './research-contracts.mjs';
import {identity,digest} from './core.mjs';

test('wire codec retains raw bytes, finite Unicode and distinct semantic identity',()=>{
 const value={z:1.0,text:'μ 😃',nested:{b:2,a:1},missing:null},packed=wire('records',[value]);assert.deepEqual(unwire(packed,'records'),[value]);assert.equal(packed.records_sha256,digest(Buffer.from(packed.records_json,'utf8')));
 assert.throws(()=>unwire({...packed,records_json:packed.records_json+' '},'records'),/integrity/);
 assert.equal(normalizedId('https://openalex.org/W123'),'W123');assert.throws(()=>normalizedId('source-a'),/OpenAlex/);
 const evidence=evidenceExchange({id:'a',artifact:{checksum:'b'}},{works:[{id:'W1'},{id:'W2',referenced_works:[]},{id:'W3',referenced_works:null}]},{});const records=unwire(evidence,'records');assert(!Object.hasOwn(records[0],'referenced_works'));assert.deepEqual(records[1].referenced_works,[]);assert.equal(records[2].referenced_works,null);
});

test('disposable protected research delegation, durable engine exchange and exact replay',{skip:!process.env.BIBLIOMAP_TEST_URI,timeout:120000},async t=>{
 if(process.env.BIBLIOMAP_TEST_DISPOSABLE!=='true'||process.env.BIBLIOMAP_TEST_URI===process.env.NEO4J_URI)throw Error('Explicit separate disposable database required.');
 const root=await mkdtemp(path.join(os.tmpdir(),'bm-research-')),engine=path.resolve('../bibliometric-network-researcher');
 const legacy=Neo4jStore.fromEnvironment({NEO4J_URI:process.env.BIBLIOMAP_TEST_URI,NEO4J_USERNAME:'neo4j',NEO4J_PASSWORD:process.env.BIBLIOMAP_TEST_PASSWORD,NEO4J_DATABASE:'neo4j'}),store=new MultiuserStore(legacy),files=new FileArtifacts(path.join(root,'artifacts'));await files.init(path.resolve('public'));await store.init();
 await writeFile(path.join(root,'research-operator.json'),JSON.stringify({schema_version:'bnr.connector.v1',workspace_root:path.join(root,'operator'),snapshots:{},source_providers:{text:{kind:'imported_text',enabled:true}},research_provider:{kind:'codex_exec',executable:path.join(engine,'.venv','Scripts','python.exe'),model:'test-no-inference',max_session_steps:25}}));
 await writeFile(path.join(root,'config.json'),JSON.stringify({python:path.join(engine,'.venv','Scripts','python.exe'),engineRoot:engine,workspace:path.join(root,'engine'),researchConfig:path.join(root,'research-operator.json'),maxOutputBytes:30000000}));
 const computations=new Computations(store,files,{pollMs:30}),integration=new ResearchIntegration(store,files,computations,await runnerConfiguration(path.join(root,'config.json')));await integration.init();
 const issuer='https://research-test.invalid/'+randomUUID(),users=['owner','viewer','outside'].map(subject=>({id:identity(issuer,subject),issuer,subject,name:subject,enabled:true}));for(const user of users)await store.tx(true,tx=>tx.run('CREATE (item:BMUser) SET item=$user',{user}));
 const project=await store.createProject(users[0].id,'Research private fixture');await store.tx(true,tx=>tx.run('MATCH (user:BMUser {id:$userId}),(project:BMProject {id:$projectId}) CREATE (member:BMMembership {id:$id,userId:$userId,projectId:$projectId,role:"viewer"}) CREATE (user)-[:HAS_MEMBERSHIP]->(member)-[:IN_PROJECT]->(project)',{userId:users[1].id,projectId:project.id,id:digest([users[1].id,project.id])}));
 const sessions=await Promise.all(users.map(u=>store.newSession(u.id))),rows=[{id:'W1',display_name:'μ original',referenced_works:['W8','W9']},{id:'W2',referenced_works:['W8']},{id:'W3'},{id:'W4',referenced_works:[]}],blob=await files.put({works:rows,exhausted:false,total:100,specification:{query:'explicit synthetic project fixture'},privateNotes:'must not export'}),artifactId=await store.tx(true,tx=>store.registerArtifact(tx,{...blob,scope:'project:'+project.id,kind:'evidence'})),evidence=await store.attachEvidence(users[0].id,project.id,artifactId,{retrieved:4});
 const server=createMultiuserServer({store,files,computations,config:{origin:'http://127.0.0.1:0',configured:true,issuer,secure:false}});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 // Server validates the same exact origin used by its session authentication.
 server.close();await once(server,'close');const config={origin,configured:true,issuer,secure:false},http=createMultiuserServer({store,files,computations,config});http.listen(Number(new URL(origin).port),'127.0.0.1');await once(http,'listening');
 const endpoint=origin+'/conservative-atlas/workspace-api/projects/'+project.id+'/research/';
 const request=async(suffix,{method='GET',data,token,as=0}={})=>{const headers=token?{Authorization:'Bearer '+token}:{cookie:'bm_session='+sessions[as].secret,Origin:origin,'x-csrf-token':sessions[as].csrf};if(data)headers['Content-Type']='application/json';const response=await fetch(endpoint+suffix,{method,headers,body:data?JSON.stringify(data):undefined});return {status:response.status,value:await response.json()};};
 let grant;
 try{
  await t.test('cookie session issues scoped local grant; viewer cannot compute; service token rejected',async()=>{
   const issued=await request('delegations',{method:'POST',data:{scopes:['read','compute'],expiresInSeconds:300}});assert.equal(issued.status,201,JSON.stringify(issued));grant=issued.value;
   assert([403,404].includes((await request('delegations',{method:'POST',as:1,data:{scopes:['read','compute']}})).status));
   assert.equal((await request('evidence/'+evidence.id,{token:'A'.repeat(43)})).status,401);
   assert([403,404].includes((await request('evidence/'+evidence.id,{as:2})).status));
  });
  await t.test('read pages preserve missing/null/empty and exclude project notes',async()=>{const result=await request('evidence/'+evidence.id+'?limit=2',{token:grant.token});assert.equal(result.status,200);assert.deepEqual(result.value.records,rows.slice(0,2));assert.equal(result.value.next_offset,2);assert(!JSON.stringify(result).includes('must not export'));});
  const protocol=JSON.parse(await readFile(path.join(engine,'examples/protocol.json'),'utf8')),input={evidenceId:evidence.id,idempotencyKey:'roundtrip',protocol,network:{method:'bibliographic_coupling',counting:'full',normalization:'cosine',min_support:1,min_occurrence:1,min_weight:0}};
  let requested,completed;
  await t.test('one durable owner completes actual Python pipeline; replay same key and bytes',async()=>{
   requested=await request('jobs',{method:'POST',token:grant.token,data:input});assert.equal(requested.status,202,JSON.stringify(requested));
   const replay=await request('jobs',{method:'POST',token:grant.token,data:input});assert.equal(replay.value.id,requested.value.id);
   assert.equal((await request('jobs',{method:'POST',token:grant.token,data:{...input,network:{...input.network,min_support:2}}})).status,409);
   computations.start();for(let i=0;i<600;i++){completed=await request('jobs/'+requested.value.id,{token:grant.token});if(['succeeded','failed','cancelled'].includes(completed.value.status))break;await new Promise(r=>setTimeout(r,50));}
   assert.equal(completed.value.status,'succeeded',JSON.stringify(completed));const result=await request('results/'+completed.value.resultId,{token:grant.token});assert.equal(result.status,200);const graph=unwire(result.value.exchange,'graph');assert.equal(graph.nodes.length,4);assert.equal(graph.edges.length,1);assert(Math.abs(graph.edges[0].weight-1/Math.sqrt(2))<1e-12);assert(result.value.exchange.exact_study_archive.sha256);
   const sub=await store.subscription(users[0].id,requested.value.id);assert.equal(sub.job.attempt,1);assert.equal(JSON.parse(sub.job.checkpoint).execution_id,result.value.exchange.execution_id);
  });
  await t.test('official MCP SDK discovers and executes configured project tools',async()=>{
   const connectorConfig=path.join(root,'connector.json');await writeFile(connectorConfig,JSON.stringify({schema_version:'bnr.connector.v1',workspace_root:path.join(root,'connector'),snapshots:{},bibliomap_connections:{disposable:{origin,project_id:project.id,token_env:'BM_DISPOSABLE_DELEGATION'}}}));
   const output=await promisify(execFile)(path.join(engine,'.venv','Scripts','python.exe'),[path.resolve('scripts/multiuser/research-mcp-probe.py')],{env:{...process.env,PYTHONPATH:path.join(engine,'src'),PYTHONIOENCODING:'utf-8',BM_DISPOSABLE_DELEGATION:grant.token,BM_TEST_CONNECTOR_CONFIG:connectorConfig,BM_TEST_EVIDENCE:evidence.id,BM_TEST_JOB:requested.value.id},timeout:30000,windowsHide:true});
   const receipt=JSON.parse(output.stdout);assert.equal(receipt.official_sdk,true);
   const reopened=await fetch(origin+'/conservative-atlas/workspace-api/snapshots/'+receipt.finding_id,{headers:{cookie:'bm_session='+sessions[0].secret}});const snapshot=await reopened.json();assert.equal(reopened.status,200,JSON.stringify(snapshot));assert.equal(snapshot.packet.graph.nodes.length,4);assert.equal(snapshot.packet.graph.links.length,1);assert.equal(snapshot.packet.graph.stats.clusters,0);assert.equal(snapshot.packet.graph.nodes.find(n=>n.id==='W3').referenceMetadata,'missing');assert.equal(snapshot.packet.graph._backend,'independent-bnr');
  });
  await t.test('actual bounded source ingress and no-inference project research session is durable, viewer-readable and cancellable',async()=>{
   const wait=async created=>{assert.equal(created.status,202,JSON.stringify(created));for(let i=0;i<500;i++){const value=await request('jobs/'+created.value.id);if(value.value.status==='succeeded')return value.value.research;if(['failed','cancelled'].includes(value.value.status))assert.fail(JSON.stringify(value));await new Promise(r=>setTimeout(r,40));}assert.fail('Job polling timeout');};
   const bytes=Buffer.from('Participants rated their own leadership. μ exact supplied text.','utf8');
   const imported=await wait(await request('sources/import-begin',{method:'POST',data:{idempotencyKey:'m4-begin',arguments:{provider_id:'text',kind:'imported_text',work_id:'W1',content_bytes:bytes.length,content_sha256:digest(bytes),content_kind:'excerpt',provenance_note:'Synthetic integration fixture; not a real paper.'}}}));
   await wait(await request('sources/import-chunk',{method:'POST',data:{idempotencyKey:'m4-chunk',arguments:{upload_id:imported.upload_id,offset:0,data_base64:bytes.toString('base64')}}}));
   const source=await wait(await request('sources/import-extract',{method:'POST',data:{idempotencyKey:'m4-extract',arguments:{provider_id:'text',kind:'imported_text',work_id:'W1',upload_id:imported.upload_id}}}));assert.equal(source.status,'extracted');
   const created=await request('sessions',{method:'POST',data:{idempotencyKey:'m4-session',evidenceId:evidence.id,arguments:{question:'What was measured and by whom?',source_ids:[source.source_id],require_literature_specialist:true,max_tokens:50000,max_steps:20}}});
   const ready=await wait(created),jobStatus=await request('jobs/'+created.value.id),sessionId=jobStatus.value.sessionId;assert.equal(ready.state,'ready');assert(sessionId);
   const inventory=await request('sessions');assert(inventory.value.sessions.some(s=>s.id===sessionId));
   assert.equal((await request('sessions/'+sessionId,{as:1})).status,200);const page=await request('sources/'+source.source_id+'?limit=1',{as:1});assert.equal(page.status,200,JSON.stringify(page));assert.equal(page.value.segments[0].text,bytes.toString('utf8'));
   assert([403,404].includes((await request('sessions/'+sessionId+'/advance',{as:1,method:'POST',data:{idempotencyKey:'viewer-no',arguments:{}}})).status));
   const cancelled=await request('sessions/'+sessionId+'/cancel',{method:'POST',data:{idempotencyKey:'m4-cancel',arguments:{}}});assert.equal(cancelled.status,202,JSON.stringify(cancelled));assert.equal(cancelled.value.status,'cancel_requested');assert.equal((await request('sessions/'+sessionId)).value.state,'cancelled');
   const {cleanupReport}=await import('./maintenance.mjs');const cleanup=await cleanupReport(store,files),all=await store.subscription(users[0].id,created.value.id);assert(!cleanup.artifacts.some(a=>a.id===all.job.artifactId),'Completed research archive must not be a cleanup candidate');
  });
  await t.test('project mismatch and forged nested path rejected; queued cancellation persists',async()=>{
   const other=await store.createProject(users[0].id,'Other fixture project');const response=await fetch(endpoint.replace(project.id,other.id)+'evidence/'+evidence.id,{headers:{Authorization:'Bearer '+grant.token}});assert.equal(response.status,403);
   assert.equal((await request('jobs',{method:'POST',token:grant.token,data:{...input,idempotencyKey:'bad-path',network:{...input.network,path:'C:/untrusted'}}})).status,400);
   clearInterval(computations.timer);const queued=await request('jobs',{method:'POST',token:grant.token,data:{...input,idempotencyKey:'cancelled-attempt'}});assert.equal(queued.status,202);assert.equal((await request('jobs/'+queued.value.id+'/cancel',{method:'POST',token:grant.token,data:{}})).status,200);assert.equal((await request('jobs/'+queued.value.id,{token:grant.token})).value.status,'cancelled');
  });
  await t.test('live membership/session/grant revocation applies to status and result',async()=>{
   await request('delegations/'+grant.id,{method:'DELETE'});assert.equal((await request('jobs/'+requested.value.id,{token:grant.token})).status,403);assert.equal((await request('results/'+completed.value.resultId,{token:grant.token})).status,403);
   const other=await request('delegations',{method:'POST',data:{scopes:['read']}});await store.logout(sessions[0].secret);assert.equal((await request('evidence/'+evidence.id,{token:other.value.token})).status,401);
  });
 }finally{await computations.close();http.close();await once(http,'close');await legacy.close();await rm(root,{recursive:true,force:true});}
});
