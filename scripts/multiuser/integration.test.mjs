import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Neo4jStore} from '../../neo4j-store.mjs';
import {MultiuserStore} from './store.mjs';
import {FileArtifacts} from './artifacts.mjs';
import {Computations} from './computations.mjs';
import {createMultiuserServer} from './http.mjs';
import {Authentication} from './auth.mjs';
import {identity,digest,calculation} from './core.mjs';
import {migrate,cleanup} from './maintenance.mjs';
import {fixture as scientificFixture} from './fixtures.mjs';

export const fixture=()=>{
 const works=Array.from({length:10},(_,index)=>({id:'source-'+index,display_name:'Distinct research source '+index,doi:'10.123/source-'+index,type:'article',language:'en',is_retracted:false,primary_location:{source:{type:'journal',is_core:true}},authorships:[{author:{display_name:'Author '+index},institutions:[{}]}],institutions_distinct_count:1,publication_year:2000+index,referenced_works:[...(index<5?['reference-a','reference-b','reference-c']:['reference-d','reference-e','reference-f']),...(index?['source-'+(index-1)]:[])],referenced_works_count:4}));
 return {...scientificFixture(),works:works.map((work,index)=>({...work,topics:scientificFixture().works[index].topics,authorships:scientificFixture({richMetadata:true}).works[index].authorships,authors_count:2}))};
};

test('disposable Neo4j multiuser reuse, privacy, durable jobs and immutable findings',{skip:!process.env.BIBLIOMAP_TEST_URI,timeout:180000},async context=>{
 if(!process.env.BIBLIOMAP_TEST_DISPOSABLE||process.env.BIBLIOMAP_TEST_URI===process.env.NEO4J_URI)throw Error('Explicit separate disposable test database is required.');
 const legacy=Neo4jStore.fromEnvironment({NEO4J_URI:process.env.BIBLIOMAP_TEST_URI,NEO4J_USERNAME:'neo4j',NEO4J_PASSWORD:process.env.BIBLIOMAP_TEST_PASSWORD,NEO4J_DATABASE:'neo4j'}),store=new MultiuserStore(legacy),directory=await mkdtemp(path.join(os.tmpdir(),'bibliomap-multiuser-')),files=new FileArtifacts(directory);await files.init(path.resolve('public'));await store.init();
 const issuer='https://institution.example.test/'+randomUUID(),users=['first','second','outsider'].map(subject=>({id:identity(issuer,subject),issuer,subject,name:subject,email:subject+'@example.test',enabled:true,admin:subject==='first'}));
 for(const user of users)await store.tx(true,transaction=>transaction.run('CREATE (item:BMUser) SET item=$user',{user}));
 let computations=new Computations(store,files,{pollMs:30});let server;
 try{
  const first=await store.createProject(users[0].id,'First private project'),second=await store.createProject(users[1].id,'Second private project');
  const snapshot=fixture(),suffix=randomUUID();for(const work of snapshot.works){work.id+='-'+suffix;work.referenced_works=work.referenced_works.map(id=>id+'-'+suffix);}for(const work of snapshot.metadata)work.id+='-'+suffix;
  const blob=await files.put(snapshot),artifactId=await store.tx(true,transaction=>store.registerArtifact(transaction,{...blob,scope:'public',kind:'evidence'}));
  const firstEvidence=await store.attachEvidence(users[0].id,first.id,artifactId,{query:'same public search',retrieved:10}),secondEvidence=await store.attachEvidence(users[1].id,second.id,artifactId,{query:'same public search',retrieved:10});
  const settings={threshold:2,support:2,resolution:.02};
  const wait=async(owner,subscription)=>{for(let attempt=0;attempt<1200;attempt++){const value=await computations.status(owner,subscription);if(value.status==='succeeded')return value;if(['failed','cancelled'].includes(value.status))throw Error(JSON.stringify(value));await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Test calculation timed out.');};
  let firstResult,secondResult;
  await context.test('simultaneous cross-user requests share one run without sharing project state',async()=>{
   const requested=await Promise.all([computations.analysis(users[0].id,first.id,firstEvidence.id,settings),computations.analysis(users[1].id,second.id,secondEvidence.id,settings)]);
   const subscriptions=await Promise.all(requested.map((item,index)=>store.subscription(users[index].id,item.id)));assert.equal(subscriptions[0].job.id,subscriptions[1].job.id);
   computations.start();const completed=await Promise.all(requested.map((item,index)=>wait(users[index].id,item.id)));firstResult=completed[0].resultId;secondResult=completed[1].resultId;assert.notEqual(firstResult,secondResult);
   const firstMap=await computations.result(users[0].id,first.id,firstResult),secondMap=await computations.result(users[1].id,second.id,secondResult);assert.equal(firstMap.graph.nodes.length,6);assert.deepEqual(firstMap.graph.nodes.map(item=>item.cluster),secondMap.graph.nodes.map(item=>item.cluster));
   const firstNative=await store.result(users[0].id,first.id,firstResult),secondNative=await store.result(users[1].id,second.id,secondResult);assert.equal(firstNative.artifact.id,secondNative.artifact.id);const nativeCount=await store.tx(false,transaction=>transaction.run('MATCH (:BMArtifact {id:$id})-[:HAS_NODE]->(node) RETURN count(node) AS total',{id:firstNative.artifact.id}));assert.equal(nativeCount.records[0].get('total'),6);
   await assert.rejects(store.result(users[1].id,first.id,firstResult),problem=>problem.status===404);await assert.rejects(store.evidence(users[2].id,first.id,firstEvidence.id),problem=>problem.status===404);await assert.rejects(store.subscription(users[1].id,requested[0].id),problem=>problem.status===404);
   const signature=JSON.stringify(await store.history(users[0].id,first.id));assert(!signature.includes(second.name));assert(!JSON.stringify(firstMap).includes('jobId'));
  });
  if(!firstResult)throw Error('The initial computation failed; dependent scenarios were not run.');
  await context.test('independent submitting processes resolve one normal calculation job',async()=>{
   const program=`import {Neo4jStore} from './neo4j-store.mjs';import {MultiuserStore} from './scripts/multiuser/store.mjs';import {FileArtifacts} from './scripts/multiuser/artifacts.mjs';import {Computations} from './scripts/multiuser/computations.mjs';const legacy=Neo4jStore.fromEnvironment({NEO4J_URI:process.env.BIBLIOMAP_TEST_URI,NEO4J_USERNAME:'neo4j',NEO4J_PASSWORD:process.env.BIBLIOMAP_TEST_PASSWORD,NEO4J_DATABASE:'neo4j'});try{const files=new FileArtifacts(process.env.BIBLIOMAP_TEST_FILES);await files.init('public');const computations=new Computations(new MultiuserStore(legacy),files);console.log(JSON.stringify(await computations.analysis(process.env.BIBLIOMAP_TEST_USER,process.env.BIBLIOMAP_TEST_PROJECT,process.env.BIBLIOMAP_TEST_EVIDENCE,{threshold:2,support:2,resolution:.037})));}finally{await legacy.close();}`;
   const submitted=await Promise.all(users.slice(0,2).map((user,index)=>promisify(execFile)(process.execPath,['--input-type=module','--eval',program],{env:{...process.env,BIBLIOMAP_TEST_FILES:directory,BIBLIOMAP_TEST_USER:user.id,BIBLIOMAP_TEST_PROJECT:[first.id,second.id][index],BIBLIOMAP_TEST_EVIDENCE:[firstEvidence.id,secondEvidence.id][index]}}).then(value=>JSON.parse(value.stdout))));
   const subscriptions=await Promise.all(submitted.map((item,index)=>store.subscription(users[index].id,item.id)));assert.equal(subscriptions[0].job.id,subscriptions[1].job.id);await Promise.all(submitted.map((item,index)=>wait(users[index].id,item.id)));
  });
  await context.test('workspace revisions, findings, and display changes do not compute',async()=>{
   const before=(await store.tx(false,transaction=>transaction.run('MATCH (item:BMJob) RETURN count(item) AS total'))).records[0].get('total');
   await store.saveWorkspace(users[0].id,first.id,0,{resultId:firstResult,display:{zoom:2,hideUnlinked:true}});await assert.rejects(store.saveWorkspace(users[0].id,first.id,0,{resultId:firstResult}),problem=>problem.status===409);
   assert.equal((await store.workspace(users[0].id,first.id)).display.zoom,2);assert.equal((await store.workspace(users[1].id,second.id)).resultId,undefined);
   const finding=await store.saveFinding(users[0].id,first.id,{resultId:firstResult,name:'Original finding',findings:'Private note'});assert.equal((await legacy.get('analyses',finding.id)).view_state.resultId,firstResult);
   const after=(await store.tx(false,transaction=>transaction.run('MATCH (item:BMJob) RETURN count(item) AS total'))).records[0].get('total');assert.equal(before,after);
  });
  await context.test('a CPM change only executes dependent network stages; force creates new immutable run',async()=>{
   const completed=await wait(users[0].id,(await computations.analysis(users[0].id,first.id,firstEvidence.id,{...settings,resolution:.1})).id),reference=await store.result(users[0].id,first.id,completed.resultId),payload=await files.get(reference.artifact.checksum);
   assert(payload.stageAudit.find(item=>item.stage==='network').reused);assert(!payload.stageAudit.find(item=>item.stage==='clustering').reused);
   const forced=await wait(users[0].id,(await computations.analysis(users[0].id,first.id,firstEvidence.id,settings,true)).id);assert.notEqual(forced.resultId,firstResult);assert.equal((await computations.result(users[0].id,first.id,firstResult)).settings.resolution,.02);
  });
  await context.test('restart reuses completed work and retains project findings',async()=>{
   await computations.close();computations=new Computations(store,files,{pollMs:30}).start();const completed=await wait(users[1].id,(await computations.analysis(users[1].id,second.id,secondEvidence.id,settings)).id);assert(completed.resultId);assert.equal((await store.history(users[0].id,first.id)).findings.length,1);
  });
  await context.test('coupling, Infomap, direct hypergraph, higher orders, history and method-specific reliability persist',async()=>{
   for(const configured of [{method:'coupling',minimumShared:2,minimumCosine:.05,algorithm:'infomap',resolution:null},{...settings,algorithm:'infomap'},{...settings,networkModel:'higher-order',order:3,maximumOrder:3,algorithm:'hypergraph'},{method:'history',history:{core:0,limit:100}}]){
    const completed=await wait(users[1].id,(await computations.analysis(users[1].id,second.id,secondEvidence.id,configured)).id),value=await computations.result(users[1].id,second.id,completed.resultId);assert(value.graph.nodes.length>0);
    if(configured.algorithm==='infomap'){
     assert.equal(value.graph.clustering.algorithm,'infomap');const check=await wait(users[1].id,(await computations.derive(users[1].id,second.id,completed.resultId,'reliability',{samples:10})).id),report=await computations.result(users[1].id,second.id,check.resultId);assert.equal(report.value.algorithm,'infomap');assert.equal(report.value.samples,10);const finding=await store.saveFinding(users[1].id,second.id,{resultId:completed.resultId,attachmentIds:[check.resultId],name:'Checked map'});assert.deepEqual((await legacy.get('analyses',finding.id)).view_state.attachmentIds,[check.resultId]);assert.equal((await computations.result(users[1].id,second.id,completed.resultId,[check.resultId])).graph.reliability.algorithm,'infomap');
    }
    if(configured.method==='history')assert.equal(value.graph.canvasKind,'historiography');
   }
  });
  await context.test('scientific manifests, roles, construction and null audits survive saved findings and restart',async()=>{
   const original=await computations.result(users[0].id,first.id,firstResult),manifest=original.graph.scientificManifest;
   assert.equal(manifest.version,'bibliomap-science-v1');assert.equal(manifest.evidence.retrievedAt,snapshot.retrievedAt);assert.equal(manifest.evidence.coverage.records,10);assert.match(manifest.fingerprints.network,/^[a-f0-9]{64}$/);assert.equal(manifest.construction.normalization,'association_strength');assert.equal(manifest.construction.counting,'full');assert.equal(manifest.evidence.retrieval.acquisition,'Imported pinned evidence');
   const attachments=[];
   for(const [stage,configuration,key] of [['scientific-roles',{paths:true},'roles'],['construction-comparison',{},'construction'],['incidence-null',{samples:10},'null'],['role-sensitivity',{samples:10},'roleSensitivity'],['optimization-variability',{},'optimization']]){
    const completed=await wait(users[0].id,(await computations.derive(users[0].id,first.id,firstResult,stage,configuration)).id),result=await computations.result(users[0].id,first.id,completed.resultId);
    assert(result.graph.scienceAudit[key]);assert.deepEqual(result.graph.scienceAudit[key],result.value);assert.equal(result.graph.scientificManifest.fingerprints.network,manifest.fingerprints.network);attachments.push(completed.resultId);
    await assert.rejects(computations.result(users[1].id,first.id,completed.resultId),problem=>problem.status===404);
   }
   const finding=await store.saveFinding(users[0].id,first.id,{resultId:firstResult,attachmentIds:attachments,name:'Scientifically audited finding'});
   await computations.close();computations=new Computations(store,files,{pollMs:30}).start();
   const saved=await legacy.get('analyses',finding.id),restored=await computations.result(users[0].id,first.id,saved.view_state.resultId,saved.view_state.attachmentIds);
   assert.deepEqual(Object.keys(restored.graph.scienceAudit).sort(),['construction','null','optimization','roleSensitivity','roles']);assert.equal(restored.graph.scienceAudit.null.marginsPreserved,true);assert.equal(restored.graph.scienceAudit.construction.comparisons.length,6);assert.equal(restored.graph.scienceAudit.roles.paths.distance,'inverse-strength');
  });
  await context.test('semantic terms and topics persist typed scoped entities, exact manifests and sensitivity attachments',async()=>{
   for(const kind of ['terms','topics']){
    const completed=await wait(users[0].id,(await computations.derive(users[0].id,first.id,firstResult,'semantic-network',{kind,minimumSupport:2})).id),result=await computations.result(users[0].id,first.id,completed.resultId);
    assert.equal(result.graph.semantic.kind,kind);assert.equal(result.graph.scientificManifest.settings.semantic.kind,kind);assert.equal(result.graph.semantic.coverage.records,10);assert(result.graph.nodes.every(node=>node.entityKind===(kind==='terms'?'term':'topic')));
    assert.match(result.graph.semantic.implementationVersion,/^[a-f0-9]{64}$/);assert.equal(result.graph.scientificManifest.versions.semantic,result.graph.semantic.implementationVersion);assert.equal(result.graph.scientificManifest.versions.algorithm,result.graph.semantic.implementationVersion);
    const checked=await wait(users[0].id,(await computations.derive(users[0].id,first.id,completed.resultId,'semantic-sensitivity',{})).id),finding=await store.saveFinding(users[0].id,first.id,{resultId:completed.resultId,attachmentIds:[checked.resultId],name:'Semantic '+kind});
    const saved=await legacy.get('analyses',finding.id),restored=await computations.result(users[0].id,first.id,saved.view_state.resultId,saved.view_state.attachmentIds);assert(restored.graph.semanticSensitivity.variants.length>=2);assert.equal(restored.graph.evidenceProvenance.evidenceId,result.graph.evidenceProvenance.evidenceId);
    await assert.rejects(computations.result(users[1].id,first.id,completed.resultId),problem=>problem.status===404);await assert.rejects(computations.derive(users[0].id,first.id,completed.resultId,'reliability',{samples:10}),/Citation-specific/);
    await assert.rejects(computations.derive(users[0].id,first.id,completed.resultId,'clustering',{resolution:.1}),/not a fallback/);
   }
   const count=await store.tx(false,transaction=>transaction.run('MATCH (item:BMWork) WHERE item.id STARTS WITH "term:" OR item.id STARTS WITH "topic:" RETURN count(item) AS total'));assert.equal(count.records[0].get('total'),0);
   await assert.rejects(computations.derive(users[0].id,first.id,firstResult,'semantic-network',{kind:'embeddings'}),/Prepare project keywords/);
  });
  await context.test('collaboration actors remain typed private entities with durable pins, sensitivity, role gates and saved ego display',async()=>{
   for(const kind of ['author','institution','country']){
    const completed=await wait(users[0].id,(await computations.derive(users[0].id,first.id,firstResult,'collaboration-network',{kind,minimumPublications:1,counting:'fractional-pair'})).id),result=await computations.result(users[0].id,first.id,completed.resultId);
    assert.equal(result.graph.canvasKind,'collaboration');assert.equal(result.graph.entityKind,kind);assert(result.graph.nodes.length>1);assert.equal(result.graph.collaboration.coverage.records,10);assert.equal(result.graph.scientificManifest.settings.collaboration.kind,kind);assert.equal(result.graph.scientificManifest.evidence.retrievedAt,snapshot.retrievedAt);assert.match(result.graph.collaboration.implementationVersion,/^[a-f0-9]{64}$/);assert.equal(result.graph.scientificManifest.versions.collaboration,result.graph.collaboration.implementationVersion);
    const checked=await wait(users[0].id,(await computations.derive(users[0].id,first.id,completed.resultId,'collaboration-sensitivity',{})).id),finding=await store.saveFinding(users[0].id,first.id,{resultId:completed.resultId,attachmentIds:[checked.resultId],name:'Observed '+kind,display:{collaborationEgo:{seedId:result.graph.nodes[0].id,hops:1}}});
    await computations.close();computations=new Computations(store,files,{pollMs:30}).start();const saved=await legacy.get('analyses',finding.id),restored=await computations.result(users[0].id,first.id,saved.view_state.resultId,saved.view_state.attachmentIds);assert(restored.graph.collaborationSensitivity.completed>=2);assert.equal(saved.view_state.display.collaborationEgo.hops,1);assert.equal(restored.graph.collaboration.metadataFingerprint,result.graph.collaboration.metadataFingerprint);
    await assert.rejects(computations.result(users[1].id,first.id,completed.resultId),problem=>problem.status===404);for(const stage of ['reliability','clustering','description','keywords','incidence-null','temporal-series','publication-bursts'])await assert.rejects(computations.derive(users[0].id,first.id,completed.resultId,stage,{}),/not supported/);
   }
   const fake=await store.tx(false,transaction=>transaction.run('MATCH (work:BMWork) WHERE work.id STARTS WITH "https://openalex.org/A" OR work.id STARTS WITH "https://openalex.org/I" OR work.id STARTS WITH "country:" OR work.id STARTS WITH "audit:" RETURN count(work) AS total'));assert.equal(fake.records[0].get('total'),0);
   await assert.rejects(computations.derive(users[0].id,first.id,firstResult,'collaboration-network',{usePublicSupplement:true}),/Private evidence/);
  });
  await context.test('plain public collaboration math reuses but audited identity notes and descendants remain project scoped',async()=>{
   const baseline={kind:'author',minimumPublications:1},firstPlain=await wait(users[0].id,(await computations.derive(users[0].id,first.id,firstResult,'collaboration-network',baseline)).id),secondPlain=await wait(users[1].id,(await computations.derive(users[1].id,second.id,secondResult,'collaboration-network',baseline)).id),plainA=await store.result(users[0].id,first.id,firstPlain.resultId),plainB=await store.result(users[1].id,second.id,secondPlain.resultId);assert.equal(plainA.artifact.id,plainB.artifact.id);assert.equal(plainA.artifact.scope,'public');
   const configuration={...baseline,identityScenario:{note:'Human reviewed this private identity rationale',merges:[{from:['https://openalex.org/A900000001'],into:'https://openalex.org/A900000000'}]}},auditedA=await wait(users[0].id,(await computations.derive(users[0].id,first.id,firstResult,'collaboration-network',configuration)).id),auditedB=await wait(users[1].id,(await computations.derive(users[1].id,second.id,secondResult,'collaboration-network',configuration)).id),privateA=await store.result(users[0].id,first.id,auditedA.resultId),privateB=await store.result(users[1].id,second.id,auditedB.resultId);assert.notEqual(privateA.artifact.id,privateB.artifact.id);assert.equal(privateA.artifact.scope,'project:'+first.id);assert.equal(privateB.artifact.scope,'project:'+second.id);await assert.rejects(computations.result(users[1].id,first.id,auditedA.resultId),problem=>problem.status===404);
   const checked=await wait(users[0].id,(await computations.derive(users[0].id,first.id,auditedA.resultId,'collaboration-sensitivity',{})).id);assert.equal((await store.result(users[0].id,first.id,checked.resultId)).artifact.scope,'project:'+first.id);
  });
  await context.test('publication windows and activity persist as authorized pinned attachments without replacing parent findings',async()=>{
   const original=await computations.result(users[0].id,first.id,firstResult),attachments=[];
   for(const [operation,configuration]of [['temporal-series',{from:2000,to:2009,width:3,step:3,resolution:.02}],['publication-bursts',{kind:'references',from:2000,to:2009}]]){
    const completed=await wait(users[0].id,(await computations.derive(users[0].id,first.id,firstResult,operation,configuration)).id),result=await computations.result(users[0].id,first.id,completed.resultId),value=operation==='temporal-series'?result.graph.temporalSeries:result.graph.burstReport;
    assert.equal(value.evidence.evidenceId,original.graph.evidenceProvenance.evidenceId);assert.match(value.implementationVersion,/^[a-f0-9]{64}$/);assert.equal(value.coverage.knownYear,10);if(operation==='temporal-series'){assert.equal(value.windows.length,4);assert.equal(value.windows[0].graph.clustering.algorithm,'leiden');}else assert.equal(value.status,'completed');attachments.push(completed.resultId);
    await assert.rejects(computations.result(users[1].id,first.id,completed.resultId),problem=>problem.status===404);
   }
   const finding=await store.saveFinding(users[0].id,first.id,{resultId:firstResult,attachmentIds:attachments,name:'Pinned publication-time series',display:{temporalWindow:2}}),saved=await legacy.get('analyses',finding.id);await computations.close();computations=new Computations(store,files,{pollMs:30}).start();
   const reopened=await computations.result(users[0].id,first.id,saved.view_state.resultId,saved.view_state.attachmentIds);assert.equal(reopened.graph.temporalSeries.windows.length,4);assert.equal(reopened.graph.burstReport.settings.kind,'references');assert.deepEqual(reopened.graph.nodes.map(node=>[node.id,node.cluster]),original.graph.nodes.map(node=>[node.id,node.cluster]));assert.equal((await computations.result(users[0].id,first.id,firstResult)).graph.temporalSeries,undefined);
  });
  await context.test('private inputs never share calculation identities',async()=>{
   const snapshot={...fixture(),publicEvidence:false,privateText:'Not shared'},privateBlob=await files.put(snapshot),firstArtifact=await store.tx(true,transaction=>store.registerArtifact(transaction,{...privateBlob,scope:'project:'+first.id,kind:'evidence'})),secondArtifact=await store.tx(true,transaction=>store.registerArtifact(transaction,{...privateBlob,scope:'project:'+second.id,kind:'evidence'}));
   const firstReference=await store.attachEvidence(users[0].id,first.id,firstArtifact),secondReference=await store.attachEvidence(users[1].id,second.id,secondArtifact),requests=await Promise.all([computations.analysis(users[0].id,first.id,firstReference.id,settings),computations.analysis(users[1].id,second.id,secondReference.id,settings)]),jobs=await Promise.all(requests.map((item,index)=>store.subscription(users[index].id,item.id)));assert.notEqual(jobs[0].job.calculationId,jobs[1].job.calculationId);
   await Promise.all(requests.map((item,index)=>store.cancel(users[index].id,item.id)));
  });
  await context.test('shared screening is versioned, private and conflict checked without replacing workspaces',async()=>{
   const before=await store.workspace(users[0].id,first.id),decisions=[{workId:snapshot.works[0].id,status:'exclude',note:'Project-private screening rationale'}],version=await computations.screen(users[0].id,first.id,{revision:0,evidenceId:firstEvidence.id,decisions});
   assert.equal(version.revision,1);const screened=await store.evidence(users[0].id,first.id,version.evidenceId);assert.equal(screened.artifact.scope,'project:'+first.id);assert.equal((await files.get(screened.artifact.checksum)).works.length,9);assert.equal((await files.get(blob.checksum)).works.length,10);
   await assert.rejects(computations.screen(users[0].id,first.id,{revision:0,evidenceId:firstEvidence.id,decisions}),problem=>problem.status===409);assert.equal((await store.screening(users[0].id,first.id)).versions.length,1);assert.deepEqual(await store.workspace(users[0].id,first.id),before);await assert.rejects(store.screening(users[1].id,first.id),problem=>problem.status===404);
  });
  await context.test('durable leases fence stale workers and cancellation preserves another subscriber',async()=>{
   await computations.close();
   const inputBlob=await files.put({graph:{nodes:[],links:[]}}),inputId=await store.tx(true,transaction=>store.registerArtifact(transaction,{...inputBlob,scope:'public',kind:'input'})),specification=calculation('roles','public',{test:randomUUID()}),requested=await Promise.all([store.submit(users[0].id,first.id,specification,inputId),store.submit(users[1].id,second.id,specification,inputId)]),firstJob=(await store.subscription(users[0].id,requested[0].id)).job;
   await store.tx(true,transaction=>transaction.run('MATCH (item:BMJob {id:$id}) SET item.resource="lease-test"',{id:firstJob.id}));await store.cancel(users[0].id,requested[0].id);
   const limits={cpu:0,model:0,retrieval:0,coordinator:0,'lease-test':1},claims=await Promise.all([store.claim('first-worker',limits),store.claim('second-worker',limits)]);assert.equal(claims.filter(Boolean).length,1);const previous=claims.find(Boolean);assert.equal(previous.id,firstJob.id);
   await store.checkpoint(previous,{cursor:'persisted-cursor'});await store.tx(true,transaction=>transaction.run('MATCH (item:BMJob {id:$id}) SET item.leaseUntil=0',{id:previous.id}));const recovered=await store.claim('recovery-worker',limits);assert.equal(recovered.id,previous.id);assert.equal(recovered.lease,previous.lease+1);assert.equal(JSON.parse(recovered.checkpoint).cursor,'persisted-cursor');
   const output=await files.put({completed:true});await assert.rejects(store.publish(previous,output,{completed:true}),problem=>problem.status===409);await store.publish(recovered,output,{completed:true});assert.equal((await store.subscription(users[1].id,requested[1].id)).job.state,'succeeded');assert.equal((await computations.status(users[0].id,requested[0].id)).status,'cancelled');
   const failedRequest=await store.submit(users[0].id,first.id,calculation('roles','public',{test:randomUUID()}),inputId),failedId=(await store.subscription(users[0].id,failedRequest.id)).job.id;await store.tx(true,transaction=>transaction.run('MATCH (item:BMJob {id:$id}) SET item.resource="lease-test"',{id:failedId}));const failing=await store.claim('failing-worker',limits);await store.fail(failing,Object.assign(Error('Transient upstream error'),{transient:true}));assert.equal((await store.job(failedId)).state,'queued');assert.equal((await store.job(failedId)).artifactId,undefined);
   await store.tx(true,transaction=>transaction.run('MATCH (item:BMJob {id:$id}) SET item.availableAt=0',{id:failedId}));const retry=await store.claim('retry-worker',limits);assert.equal(retry.attempt,2);await store.fail(retry,Object.assign(Error('Invalid data'),{status:422}));assert.equal((await store.job(failedId)).state,'failed');assert.equal((await store.job(failedId)).artifactId,undefined);
   computations=new Computations(store,files,{pollMs:30}).start();
  });
  await context.test('migration is repeatable, leaves other owners alone and retains legacy snapshots',async()=>{
   const legacyProject=await legacy.create('projects',{name:'Legacy research'}),corpus=await legacy.create('corpora',{project_id:legacyProject.id,name:'Original corpus',works:fixture().works}),finding=await legacy.create('analyses',{project_id:legacyProject.id,corpus_id:corpus.id,name:'Historical finding',view_state:{snapshot:{graph:{nodes:[],links:[]},controls:{},state:{}},findings:'Original annotation'}}),owner={issuer,subject:'first',email:users[0].email};
   const dry=await migrate(store,files,owner);assert(dry.dryRun);await assert.rejects(store.gate(users[0].id,legacyProject.id),problem=>problem.status===404);
   await migrate(store,files,owner,{execute:true});const before=await store.history(users[0].id,legacyProject.id);assert.equal(before.evidence.length,1);await migrate(store,files,owner,{execute:true});assert.equal((await store.history(users[0].id,legacyProject.id)).evidence.length,1);assert.deepEqual(await legacy.get('analyses',finding.id),finding);await assert.rejects(store.gate(users[0].id,second.id),problem=>problem.status===404);
  });
  await context.test('invitation identity, viewer permissions, revocation and final-owner guard',async()=>{
   const invite=await store.invite(users[0].id,first.id,users[2].email,'viewer',issuer);await assert.rejects(store.acceptIdentity({iss:issuer,sub:'wrong',email:users[2].email,email_verified:false},invite),problem=>problem.status===403);
   await store.acceptIdentity({iss:issuer,sub:'outsider',email:users[2].email,email_verified:true},invite);await store.gate(users[2].id,first.id);await assert.rejects(computations.analysis(users[2].id,first.id,firstEvidence.id,settings),problem=>problem.status===404);
   await store.saveWorkspace(users[2].id,first.id,0,{resultId:firstResult,display:{zoom:4,hideUnlinked:false}});assert.equal((await store.workspace(users[0].id,first.id)).display.zoom,2);assert.equal((await store.workspace(users[2].id,first.id)).display.zoom,4);
   await assert.rejects(store.acceptIdentity({iss:issuer,sub:'outsider',email:users[2].email,email_verified:true},invite),problem=>problem.status===403);await assert.rejects(store.changeMember(users[0].id,first.id,users[0].id,'editor'),problem=>problem.status===409);
   await store.changeMember(users[0].id,first.id,users[2].id,null);await assert.rejects(store.result(users[2].id,first.id,firstResult),problem=>problem.status===404);
  });
  await context.test('HTTP denies unauthorized APIs, static datasets, forged origins and exports',async()=>{
   await computations.close();
   const session=await store.newSession(users[0].id),config={configured:true,origin:'http://127.0.0.1:18086',secure:false,issuer};server=createMultiuserServer({store,files,computations,config});await new Promise(resolve=>server.listen(18086,'127.0.0.1',resolve));
   assert.equal((await fetch(config.origin+'/conservative-atlas/workspace-api/projects')).status,401);
   const headers={Cookie:'bm_session='+session.secret};assert.equal((await fetch(config.origin+'/api/corpora?project_id='+second.id,{headers})).status,404);
   assert.equal((await fetch(config.origin+'/conservative-atlas/workspace-api/projects/'+second.id+'/results/'+secondResult+'/export',{headers})).status,404);
   assert.equal((await fetch(config.origin+'/conservative-atlas/workspace-api/projects',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'forged'})})).status,403);
   const neutral=await (await fetch(config.origin+'/conservative-atlas/data.js',{headers})).text();assert(!neutral.includes('Ronald'));assert(neutral.includes('empty-workspace'));
   assert.equal((await fetch(config.origin+'/conservative-atlas/report.html',{headers})).status,404);assert.equal((await fetch(config.origin+'/conservative-atlas/workspace-api/jobs/'+randomUUID(),{headers})).status,404);
   const invitation=await store.invite(users[0].id,first.id,users[2].email,'editor',issuer);await store.acceptIdentity({iss:issuer,sub:'outsider',email:users[2].email,email_verified:true},invitation);const invitedSession=await store.newSession(users[2].id),invitedHeaders={Cookie:'bm_session='+invitedSession.secret},queued=await computations.analysis(users[2].id,first.id,firstEvidence.id,{...settings,resolution:.061});
   const exported=config.origin+'/conservative-atlas/workspace-api/projects/'+first.id+'/results/'+firstResult+'/export';assert.equal((await fetch(exported,{headers:invitedHeaders})).status,200);assert.equal((await fetch(config.origin+'/conservative-atlas/workspace-api/jobs/'+queued.id,{headers:invitedHeaders})).status,200);await store.changeMember(users[0].id,first.id,users[2].id,null);assert.equal((await fetch(exported,{headers:invitedHeaders})).status,404);assert.equal((await fetch(config.origin+'/conservative-atlas/workspace-api/jobs/'+queued.id,{headers:invitedHeaders})).status,404);
   await store.logout(session.secret);assert.equal((await fetch(config.origin+'/auth/session',{headers})).status,401);
  });
  const metrics=await store.tx(false,async transaction=>{
   const reuse=(await transaction.run('MATCH (calculation:BMCalculation)-[:HAS_RUN]->(job:BMJob) WHERE job.userId IN $ids WITH DISTINCT calculation RETURN calculation.stage AS stage,sum(coalesce(calculation.cacheHits,0)) AS cacheHits,sum(coalesce(calculation.joinedRequests,0)) AS joinedRequests,count(calculation) AS configurations',{ids:users.map(user=>user.id)})).records.map(record=>record.toObject());
   const runs=(await transaction.run('MATCH (job:BMJob) WHERE job.userId IN $ids RETURN job.stage AS stage,job.state AS state,count(job) AS runs',{ids:users.map(user=>user.id)})).records.map(record=>record.toObject());return {reuse,runs};
  });await mkdir('.trials',{recursive:true});await writeFile('.trials/multiuser-verification.json',JSON.stringify({synthetic:true,verifiedAt:new Date().toISOString(),...metrics},null,2));
  await context.test('deleting a project and manual cleanup preserve shared dependencies',async()=>{await computations.close();await store.deleteProject(users[0].id,first.id);await assert.rejects(store.result(users[0].id,first.id,firstResult),problem=>problem.status===404);assert.equal((await computations.result(users[1].id,second.id,secondResult)).graph.nodes.length,6);const orphan=await files.put({unreferenced:randomUUID()}),report=await cleanup(store,files);assert(report.files.some(item=>item.checksum===orphan.checksum));await cleanup(store,files,{execute:true});await assert.rejects(files.get(orphan.checksum));assert.equal((await computations.result(users[1].id,second.id,secondResult)).graph.nodes.length,6);});
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await computations.close();await legacy.close();assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});}
});
