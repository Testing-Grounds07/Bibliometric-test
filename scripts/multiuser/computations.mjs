import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {calculation, digest, canonical, analysisSettings, topologyInputs, workInputs, scopeFor, error} from './core.mjs';
import {implementationVersion, decorateGraph, OPENALEX_FIELDS} from './stages.mjs';
import {referenceMetadataCandidates} from '../work-deduplication.mjs';
import {evidenceDataset, searchSpecification} from '../workspace-projects-core.mjs';
import {descriptionRequest} from '../cluster-description-core.mjs';
import {createScientificManifest, SCIENCE_VERSION, pinnedEvidenceProvenance} from '../scientific-manifest.mjs';
import {semanticSettings} from '../semantic-network.mjs';
import {temporalSettings,temporalSupport} from '../temporal-series.mjs';
import {burstSettings} from '../publication-bursts.mjs';
import {collaborationSettings} from '../collaboration-networks.mjs';
import {researchCanvasPacket} from './research-canvas.mjs';
import {methodCanvasPacket} from './research-method-canvas.mjs';

const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
export class Computations {
 constructor(store,files,options={}){this.store=store;this.files=files;this.workerId=randomUUID();this.running=new Map();this.limits={cpu:2,retrieval:1,model:1,coordinator:2,...options.limits};this.pollMs=options.pollMs||500;this.closed=false;this.versions=new Map();}
 async version(stage){if(!this.versions.has(stage))this.versions.set(stage,await implementationVersion(stage));return this.versions.get(stage);}
 async input(scope,payload){const blob=await this.files.put(payload);const id=await this.store.tx(true,transaction=>this.store.registerArtifact(transaction,{...blob,scope,kind:'input'}));return {id,...blob};}
 async request(userId,projectId,stage,scope,input,settings={},force=false){
  const artifact=await this.input(scope,input),specification=calculation(stage,scope,digest(input.identity||input),settings,[],await this.version(stage));
  return this.store.submit(userId,projectId,specification,artifact.id,force);
 }
 async search(userId,projectId,input,refresh=false){
  await this.store.gate(userId,projectId,'editor');const specification=searchSpecification(input);delete specification.searchedAt;
  return this.request(userId,projectId,'retrieval','public',{identity:specification,specification,metadataPolicy:refresh?randomUUID():'pinned-v1'},{fields:OPENALEX_FIELDS},refresh);
 }
 async analysis(userId,projectId,evidenceId,input,force=false){
  const evidence=await this.store.evidence(userId,projectId,evidenceId),settings=analysisSettings(input),snapshot=await this.files.get(evidence.artifact.checksum);
  return this.request(userId,projectId,'analysis',evidence.artifact.scope,{identity:{evidence:evidence.artifact.checksum,settings},evidenceArtifactId:evidence.artifact.id,settings,force},{},force);
 }
 async screen(userId,projectId,input){
  await this.store.gate(userId,projectId,'editor');const parent=await this.store.evidence(userId,projectId,input.evidenceId),original=await this.files.get(parent.artifact.checksum);
  if(!Number.isInteger(input.revision)||!Array.isArray(input.decisions)||input.decisions.length>original.works.length)throw error('Provide the current screening revision and valid decisions.');
  const available=new Set(original.works.map(work=>work.id)),seen=new Set(),decisions=input.decisions.map(item=>{
   if(!item||!available.has(item.workId)||seen.has(item.workId)||!['include','exclude','undecided'].includes(item.status)||typeof (item.note??'')!=='string'||(item.note||'').length>10000)throw error('Invalid or repeated screening decision.');seen.add(item.workId);return {workId:item.workId,status:item.status,note:item.note||''};
  }).sort((left,right)=>left.workId.localeCompare(right.workId));
  const excluded=new Set(decisions.filter(item=>item.status==='exclude').map(item=>item.workId)),snapshot={...original,works:original.works.filter(work=>!excluded.has(work.id)),publicEvidence:false,screening:{parentEvidenceChecksum:parent.artifact.checksum,decisions,recordedAt:new Date().toISOString()}};
  const blob=await this.files.put(snapshot);return this.store.saveScreening(userId,projectId,input.revision,parent,blob,snapshot,decisions);
 }
 async derive(userId,projectId,resultId,stage,options={},force=false){
  const result=await this.store.result(userId,projectId,resultId),saved=await this.files.get(result.artifact.checksum);
  if(result.job.stage==='research-engine')throw error('Native derived stages do not apply to this imported engine definition. Use the project Research controls or deliberately create a separate native analysis.',422);
  if(!saved.graph)throw error('Open a completed analysis first.');
  if(saved.graph.collaboration&&['clustering','reliability','scan','coupling-scan','sensitivity','incidence-null','construction-comparison','role-sensitivity','temporal','validation','backbone','description','keywords','temporal-series','publication-bursts'].includes(stage))throw error('This stage is not supported for collaboration actors. Use collaboration construction settings/sensitivity or deliberately open a work-based relationship.');
  if(stage==='collaboration-network'||stage==='collaboration-sensitivity'){const settings=collaborationSettings(stage==='collaboration-sensitivity'?saved.graph.collaboration:options);if(options.usePublicSupplement)throw error('Private evidence cannot use a public metadata supplement.');const scope=settings.identityScenario?'project:'+projectId:result.artifact.scope;return this.request(userId,projectId,'analysis',scope,{identity:{parent:result.artifact.checksum,stage,settings},parentArtifactId:result.artifact.id,evidenceArtifactId:saved.evidenceArtifactId,settings:saved.settings,operation:stage,operationSettings:settings,force},{},force);}
  if(['temporal-series','publication-bursts'].includes(stage)){
   if(stage==='temporal-series')temporalSupport(saved.graph);
   const settings=stage==='temporal-series'?temporalSettings({...options,resolution:options.resolution??saved.graph.resolution,seed:options.seed??saved.graph.clustering?.seed??42,algorithm:saved.graph.clustering?.algorithm==='Leiden CPM'?'leiden':saved.graph.clustering?.algorithm||'leiden'}):burstSettings(options);
   return this.request(userId,projectId,'analysis',result.artifact.scope,{identity:{parent:result.artifact.checksum,stage,settings},parentArtifactId:result.artifact.id,evidenceArtifactId:saved.evidenceArtifactId,settings:saved.settings,operation:stage,operationSettings:settings,force},{},force);
  }
  if(saved.graph.semantic&&stage==='clustering')throw error('Semantic reclustering uses its own construction settings. Build a semantic network with the requested CPM; citation reconstruction is not a fallback.');
  if(saved.graph.semantic&&['reliability','scan','coupling-scan','sensitivity','incidence-null','construction-comparison','role-sensitivity','temporal','validation','backbone'].includes(stage))throw error('Citation-specific checks do not apply to semantic networks. Use semantic text/threshold sensitivity.');
  if(saved.graph.semantic&&saved.graph.entityKind!=='source'&&['description','keywords'].includes(stage))throw error('Feature nodes are not article IDs. Grounded feature AI descriptions are not implemented.');
  if(stage==='semantic-comparison'){
   const other=await this.store.result(userId,projectId,options.otherResultId),payload=await this.files.get(other.artifact.checksum);
   if(payload.evidenceChecksum!==saved.evidenceChecksum||saved.graph.entityKind!=='source'||payload.graph.canvasKind!=='coupling')throw error('Compare an authorized source coupling result and semantic source result pinned to the same evidence.',409);
   return this.request(userId,projectId,'analysis',result.artifact.scope,{identity:{parent:result.artifact.checksum,comparison:other.artifact.checksum},parentArtifactId:result.artifact.id,comparisonArtifactId:other.artifact.id,evidenceArtifactId:saved.evidenceArtifactId,settings:saved.settings,operation:stage,operationSettings:{},force},{},force);
  }
  if(stage==='semantic-network'||stage==='semantic-sensitivity'){
   const settings={...semanticSettings(stage==='semantic-sensitivity'?saved.graph.semantic:options),useCachedAbstracts:options.useCachedAbstracts===true};
   let cacheArtifactId=null,cacheChecksum=null;
   if(settings.kind==='embeddings'||settings.useCachedAbstracts){const workspace=await this.store.workspace(userId,projectId);if(!workspace.keywordsId)throw error('Prepare project keywords/embeddings first; this operation does not download a model.',422);const reference=await this.store.result(userId,projectId,workspace.keywordsId),keywords=await this.files.get(reference.artifact.checksum);if(keywords.operation!=='keywords'||keywords.textVersion!==saved.textVersion||keywords.evidenceChecksum!==saved.evidenceChecksum)throw error('Prepared embeddings do not match this pinned evidence and text version.',409);cacheArtifactId=reference.artifact.id;cacheChecksum=reference.artifact.checksum;}
   return this.request(userId,projectId,'analysis',result.artifact.scope,{identity:{parent:result.artifact.checksum,stage,settings,cacheChecksum},parentArtifactId:result.artifact.id,evidenceArtifactId:saved.evidenceArtifactId,settings:saved.settings,operation:stage,operationSettings:settings,cacheArtifactId,cacheChecksum,force},{},force);
  }
  if(stage==='clustering'||stage==='history'||stage==='coupling'){
   const settings=analysisSettings({...saved.settings,...options,...(stage==='history'?{method:'history',history:options}:stage==='coupling'?{method:'coupling'}:{})});
   if(stage==='clustering'&&saved.graph.temporal)return this.request(userId,projectId,'analysis',result.artifact.scope,{identity:{parent:result.artifact.checksum,stage:'recluster',settings},parentArtifactId:result.artifact.id,evidenceArtifactId:saved.evidenceArtifactId,settings,operation:'recluster',operationSettings:settings,force},{},force);
   return this.request(userId,projectId,'analysis',result.artifact.scope,{identity:{evidence:saved.evidenceChecksum,settings},evidenceArtifactId:saved.evidenceArtifactId,settings,force},{},force);
  }
  if(!['reliability','scan','coupling-scan','sensitivity','roles','validation','backbone','temporal','keywords','description','scientific-roles','incidence-null','construction-comparison','role-sensitivity','optimization-variability'].includes(stage))throw error('Unknown analysis stage.');
  if(['scan','sensitivity'].includes(stage)&&saved.graph.clustering?.algorithm==='sbm')throw error('Block models select hierarchy by description length. Use hierarchy levels and method-specific reliability instead.');
  const settings={};
  if(stage==='scientific-roles'){settings.paths=options.paths===true;settings.distance=options.distance||'inverse-strength';if(!['inverse-strength','unweighted'].includes(settings.distance))throw error('Unknown path-distance definition.');}
  if(stage==='incidence-null'){settings.samples=Number(options.samples||50);if(![10,50,199].includes(settings.samples))throw error('Choose 10, 50 or 199 null samples.');settings.seed=20261019;}
  if(stage==='role-sensitivity'){settings.samples=Number(options.samples||10);if(![10,50].includes(settings.samples))throw error('Choose 10 or 50 role resamples.');}
  if(stage==='scan')settings.compareObjectives=options.compareObjectives===true;
  if(stage==='reliability'){if(![10,50].includes(Number(options.samples||10)))throw error('Choose 10 or 50 resamples.');settings.samples=Number(options.samples||10);settings.options={mode:options.mode||'evidence',seedOffset:options.mode==='sources'?2000:0};if(!['evidence','sources'].includes(settings.options.mode))throw error('Invalid reliability mode.');}
  if(stage==='description'){if(!/^\d+$/.test(String(options.cluster))||!saved.graph.nodes.some(node=>String(node.cluster)===String(options.cluster)))throw error('Unknown cluster.');settings.cluster=String(options.cluster);settings.model=process.env.BIBLIOMAP_QWEN_REVISION||'unconfigured';}
  if(['keywords','description'].includes(stage))settings.miniLM=process.env.BIBLIOMAP_MINILM_REVISION||'unconfigured';
  if(['validation','backbone'].includes(stage)){settings.alpha=Number(options.alpha??.05);if(!Number.isFinite(settings.alpha)||settings.alpha<=0||settings.alpha>=1)throw error('Choose alpha between zero and one.');}
  if(stage==='temporal'){settings.from=Number(options.from);settings.to=Number(options.to);if(!Number.isInteger(settings.from)||!Number.isInteger(settings.to)||settings.from<1500||settings.to>2100||settings.from>settings.to)throw error('Invalid temporal window.');}
  return this.request(userId,projectId,'analysis',result.artifact.scope,{identity:{parent:result.artifact.checksum,stage,settings},parentArtifactId:result.artifact.id,evidenceArtifactId:saved.evidenceArtifactId,settings:saved.settings,operation:stage,operationSettings:settings,force},{},force);
 }
 async child(parent,stage,input,settings={},force=false,identityInput=input){
  const artifact=await this.input(parent.scope,input),specification=calculation(stage,parent.scope,digest(identityInput),settings,[],await this.version(stage));
  const job=await this.store.child(parent,specification,artifact.id,force);
  while(!this.closed){
   const current=await this.store.job(job.id);if(current.state==='succeeded'){const output=await this.store.artifact(current.artifactId);return {artifact:output,value:await this.files.get(output.checksum),reused:current.completedAt<parent.startedAt};}
   if(['failed','cancelled'].includes(current.state))throw error(stage+': '+(current.error||'Calculation did not complete.')+' Previous results remain available.',422);
   parent.controller?.signal.throwIfAborted();await delay(this.pollMs);
  }
  throw error('Worker is shutting down.',503);
 }
 async pipeline(job,input){
  const evidenceArtifact=await this.store.artifact(input.evidenceArtifactId),snapshot=await this.files.get(evidenceArtifact.checksum),settings=input.settings;
  const audit=[];
  const stage=async(name,value,configuration={},force=false,identityInput=value)=>{const result=await this.child(job,name,value,configuration,force,identityInput);audit.push({stage:name,checksum:result.artifact.checksum,reused:result.reused});return result.value;};
  if(input.operation){
   const parent=await this.store.artifact(input.parentArtifactId),saved=await this.files.get(parent.checksum),operation=input.operation;
   let value;
   if(['collaboration-network','collaboration-sensitivity','temporal-series','publication-bursts'].includes(operation))value=await stage(operation,{graph:saved.graph,works:saved.prepared.works,sourceCorpusId:'immutable-evidence'},input.operationSettings,input.force);
   else if(operation==='semantic-comparison'){const other=await this.store.artifact(input.comparisonArtifactId),payload=await this.files.get(other.checksum);if(payload.evidenceChecksum!==saved.evidenceChecksum)throw error('Incompatible comparison evidence.',409);value=await stage(operation,{graph:saved.graph,otherGraph:payload.graph},{},input.force);}
   else if(operation==='semantic-network'||operation==='semantic-sensitivity'){
    let cache=null;if(input.cacheArtifactId){const artifact=await this.store.artifact(input.cacheArtifactId);if(artifact.checksum!==input.cacheChecksum||artifact.scope!==parent.scope)throw error('Prepared semantic evidence identity changed.',409);const cached=await this.files.get(artifact.checksum);if(cached.operation!=='keywords'||cached.evidenceChecksum!==saved.evidenceChecksum||cached.textVersion!==saved.textVersion)throw error('Prepared semantic evidence is incompatible.',409);cache=cached.value;}
    value=await stage(operation,{works:saved.prepared.works,cache,cacheChecksum:input.cacheChecksum,graph:saved.graph,sourceCorpusId:'immutable-evidence'},input.operationSettings,input.force);
   }else if(operation==='recluster')value=await stage('clustering',{graph:saved.graph,articleIds:saved.evidence.articles.map(article=>article.id)},input.operationSettings,input.force);
   else if(operation==='keywords'||operation==='description'){
    const texts=[...saved.prepared.works,...saved.prepared.metadata];
    const themes=await stage('keywords',{works:texts},{revision:process.env.BIBLIOMAP_MINILM_REVISION||'unconfigured'},input.force&&operation==='keywords');
    value=operation==='keywords'?themes:await stage('description',{graph:saved.graph,themes,works:saved.prepared.works},input.operationSettings,input.force);
   }else value=await stage(operation,{graph:saved.graph,articleIds:saved.evidence.articles.map(article=>article.id),articles:saved.evidence.articles},input.operationSettings,input.force);
   const graph=structuredClone(saved.graph);
   if(operation==='collaboration-network'){for(const key of Object.keys(graph))delete graph[key];Object.assign(graph,value);graph.collaboration.implementationVersion=await this.version(operation);}
   if(operation==='collaboration-sensitivity'){graph.collaborationSensitivity=value;value.implementationVersion=await this.version(operation);}
   if(operation==='temporal-series'){value.implementationVersion=await this.version(operation);graph.temporalSeries=value;}
   if(operation==='publication-bursts'){value.implementationVersion=await this.version(operation);graph.burstReport=value;}
   if(operation==='reliability')graph[input.operationSettings.options?.mode==='sources'?'sourceReliability':'reliability']=value;
   if(operation==='scan')graph.settingsSearch=value;
   if(operation==='sensitivity')graph.evidenceSensitivity=value;
   if(operation==='temporal')Object.assign(graph,value);
   if(operation==='recluster')Object.assign(graph,value);
   if(operation==='semantic-network'){for(const key of Object.keys(graph))delete graph[key];Object.assign(graph,value);}
   if(operation==='semantic-network')graph.semantic.implementationVersion=await this.version('semantic-network');
   if(operation==='semantic-sensitivity')graph.semanticSensitivity=value;
   if(operation==='semantic-sensitivity')value.implementationVersion=await this.version('semantic-sensitivity');
   if(operation==='semantic-comparison')graph.semanticComparison=value;
   if(operation==='semantic-comparison')value.implementationVersion=await this.version('semantic-comparison');
   if(operation==='description')graph.generatedDescriptions={...graph.generatedDescriptions,[input.operationSettings.cluster]:{result:value}};
   if(operation==='keywords')graph.keywordArtifactReady=true;
   const scienceKey={'scientific-roles':'roles','incidence-null':'null','construction-comparison':'construction','role-sensitivity':'roleSensitivity','optimization-variability':'optimization'}[operation];
   if(scienceKey)graph.scienceAudit={...graph.scienceAudit,[scienceKey]:value};
   const algorithmVersion=operation==='collaboration-network'?await this.version(operation):operation==='semantic-network'?await this.version('semantic-network'):operation==='recluster'?await this.version('clustering'):saved.algorithmVersion;
   graph.evidenceProvenance=pinnedEvidenceProvenance(snapshot,saved.evidenceChecksum,{algorithm:algorithmVersion,...(graph.collaboration?{collaboration:graph.collaboration.implementationVersion||'Legacy/unverified collaboration implementation'}:{}),...(graph.semantic?{semantic:graph.semantic.implementationVersion||'Legacy/unverified semantic implementation'}:{}),science:SCIENCE_VERSION},{evidence:saved.textVersion});
   graph.scientificManifest=await createScientificManifest(graph,saved.prepared?.works||saved.evidence.articles,graph.evidenceProvenance);
   return {...saved,graph,operation,value,parentArtifactId:input.parentArtifactId,algorithmVersion,stageAudit:audit};
  }
  const candidates=referenceMetadataCandidates(snapshot.works,settings.threshold||10),metadata=await stage('reference-metadata',{ids:[...candidates.ids].sort(),known:workInputs(snapshot.metadata||[])},{epoch:snapshot.metadataPolicy||evidenceArtifact.checksum});
  const prepared=await stage('preparation',{works:workInputs(snapshot.works),metadata:workInputs(metadata)},{preset:settings.preset});
  const evidence=evidenceDataset(prepared.works,'immutable-evidence',Object.fromEntries(prepared.metadata.map(work=>[work.id,work.display_name])),prepared.metadata,false);
  let graph;
  if(settings.method==='history')graph=await stage('history',{articles:evidence.articles},settings.history,input.force);
  else{
   const networkSettings=settings.method==='coupling'?{method:'coupling',minimumShared:settings.minimumShared,minimumCosine:settings.minimumCosine}:{method:'cocitation',threshold:settings.threshold,support:settings.support,members:settings.members};
   const selectedSources=settings.sourceMembers?new Set(settings.sourceMembers):null,workTopology=prepared.works.filter(work=>!selectedSources||selectedSources.has(work.id)).map(work=>({id:work.id,referenced_works:work.referenced_works||[]}));
   graph=await stage('network',{works:workTopology},networkSettings,input.force,{works:topologyInputs(workTopology)});
   if(settings.method==='cocitation'&&(settings.order!==2||settings.networkModel==='hypergraph')){
    const bundles=await stage('bundles',{graph},{support:settings.support},input.force);
    graph=await stage('order',{graph,bundles},{order:settings.order,maximumOrder:Math.min(settings.maximumOrder,bundles.maximumOrder)},input.force);
   }
   const clustering={algorithm:settings.algorithm,networkModel:settings.networkModel,resolution:settings.resolution??null,markovTime:settings.markovTime??null,hypergraphObjective:settings.hypergraphObjective??null,hypergraphResolution:settings.hypergraphResolution??null,hypergraphSearch:settings.hypergraphSearch??null,hypergraphSearchVersion:settings.hypergraphSearchVersion??null,selectedLevel:settings.selectedLevel??0,seed:settings.seed,trials:settings.trials};
   graph=await stage('clustering',{graph,articleIds:evidence.articles.map(article=>article.id)},clustering,input.force);
   graph=decorateGraph(graph,prepared);
  }
  const algorithmVersion=await this.version(settings.method==='history'?'history':'clustering'),textVersion=digest([...prepared.works,...prepared.metadata].map(work=>({id:work.id,title:work.display_name||'',abstract:work.abstract_inverted_index||{}})));
  graph.evidenceProvenance=pinnedEvidenceProvenance(snapshot,evidenceArtifact.checksum,{algorithm:algorithmVersion,science:SCIENCE_VERSION},{evidence:textVersion});
  graph.scientificManifest=await createScientificManifest(graph,prepared.works,graph.evidenceProvenance);
  return {graph,evidence,prepared,settings,counts:prepared.counts,preset:prepared.preset,evidenceArtifactId:input.evidenceArtifactId,evidenceChecksum:evidenceArtifact.checksum,evidenceDate:snapshot.retrievedAt||snapshot.importedAt,algorithmVersion,textVersion,stageAudit:audit};
 }
 async reserveRate(){
  const wait=await this.store.tx(true,async transaction=>{await this.store.lock(transaction,'openalex-rate');const result=await transaction.run('MERGE (item:BMScheduler {id:"openalex"}) ON CREATE SET item.nextAt=0 WITH item,item.nextAt AS previous SET item.nextAt=CASE WHEN item.nextAt>$now THEN item.nextAt+$interval ELSE $now+$interval END RETURN previous',{now:Date.now(),interval:1000});return Math.max(0,result.records[0].get('previous')-Date.now());});
  if(wait)await delay(wait);
 }
 async execute(job){
  const controller=new AbortController();job.controller=controller;let message='Running',worker;
  controller.signal.addEventListener('abort',()=>{worker?.postMessage({cancel:true});const timer=setTimeout(()=>worker?.terminate(),1000);timer.unref();},{once:true});
  const timeout=setTimeout(()=>controller.abort(error('Computation reached its time limit. Narrow the scope and retry.',422)),({analysis:7200000,retrieval:3600000,scan:3600000,keywords:1200000,description:190000,bundles:190000}[job.stage]||1200000));
  const heartbeat=setInterval(async()=>{try{if(!await this.store.heartbeat(job,message)){controller.abort();worker?.terminate();}}catch{controller.abort();worker?.terminate();}},15000);
  try{
   const artifact=await this.store.artifact(job.inputArtifact),input=await this.files.get(artifact.checksum);let result;
   if(job.stage==='research-engine'){if(!this.researchIntegration)throw error('Independent engine integration is not configured.',503);result=await this.researchIntegration.run(job,input,controller.signal);}
   else if(job.stage==='analysis')result=await this.pipeline(job,input);
   else{
    const record=await this.store.tx(false,async transaction=>(await transaction.run('MATCH (item:BMCalculation {id:$id}) RETURN item.specification AS value',{id:job.calculationId})).records[0].get('value'));
    result=await new Promise((resolve,reject)=>{
     worker=new Worker(new URL('./stage-worker.mjs',import.meta.url),{resourceLimits:{maxOldGenerationSizeMb:512},workerData:{job:{...job,controller:undefined},input:artifact,settings:JSON.parse(record).settings,storageRoot:this.files.root}});
     let completed=false;
     worker.on('message',async event=>{
      if(event.progress){message=event.progress;return;}
      if(event.id){try{let value;if(event.kind==='checkpoint')value=await this.store.checkpoint(job,event.value);else if(event.kind==='metadata-get'){const versions=await this.store.referenceVersions(job.scope,event.value.epoch,event.value.ids);value=await Promise.all(versions.map(item=>this.files.get(item.checksum)));}else if(event.kind==='metadata-put'){const blob=await this.files.put(event.value.work);value=await this.store.saveReferenceVersion(job,event.value.epoch,event.value.work.id,blob);}else value=await this.reserveRate();worker.postMessage({id:event.id,value:value??null});}catch(problem){worker.postMessage({id:event.id,error:problem.message});}return;}
      completed=true;if(event.error)reject(Object.assign(new Error(event.error.message),event.error));else resolve(event.result);
     });worker.on('error',reject);worker.on('exit',code=>{if(!completed)reject(controller.signal.aborted?controller.signal.reason:Object.assign(error('Worker stopped before publication.',503),{transient:true}));});
    });
   }
   controller.signal.throwIfAborted();const blob=await this.files.put(result);await this.store.publish(job,blob,result,this.researchIntegration?tx=>this.researchIntegration.publication(job,result,tx):undefined);
  }catch(problem){if(this.closed)problem.transient=true;if(problem.retryAfter>0)await this.store.tx(true,async transaction=>{await this.store.lock(transaction,'openalex-rate');await transaction.run('MERGE (item:BMScheduler {id:"openalex"}) SET item.nextAt=CASE WHEN coalesce(item.nextAt,0)>$until THEN item.nextAt ELSE $until END',{until:Date.now()+problem.retryAfter*1000});}).catch(()=>{});console.error(JSON.stringify({job:job.id,stage:job.stage,error:problem.message}));await this.store.fail(job,problem).catch(()=>{});}
  finally{clearTimeout(timeout);clearInterval(heartbeat);worker?.terminate();this.running.delete(job.id);}
 }
 start(){
  let polling=false;
  this.timer=setInterval(async()=>{if(polling||this.closed)return;polling=true;try{let job;while(!this.closed&&(job=await this.store.claim(this.workerId,this.limits))){const promise=this.execute(job);this.running.set(job.id,{job,promise});}}catch(problem){console.error('Worker coordinator: '+problem.message);}finally{polling=false;}},this.pollMs);return this;
 }
 async close(){this.closed=true;clearInterval(this.timer);for(const {job} of this.running.values())job.controller?.abort();await Promise.allSettled([...this.running.values()].map(item=>item.promise));}
 async status(userId,subscriptionId){
  const {subscription,job}=await this.store.subscription(userId,subscriptionId);if(subscription.cancelled)return {id:subscriptionId,status:'cancelled'};
  const response={id:subscriptionId,status:job.state,message:job.state==='failed'?job.error||'Computation failed.':job.message||job.state,computedAt:job.state==='succeeded'?job.completedAt:null};
  if(job.state==='succeeded'){
   if(job.stage==='retrieval'){
    const artifact=await this.store.artifact(job.artifactId),snapshot=await this.files.get(artifact.checksum),reference=await this.store.attachEvidence(userId,subscription.projectId,artifact.id,{query:snapshot.specification.query,terms:snapshot.specification.terms,phrase:snapshot.specification.phrase,limit:snapshot.specification.limit,from:snapshot.specification.from,through:snapshot.specification.through,retrieved:snapshot.works.length,total:snapshot.total,exhausted:snapshot.exhausted,evidenceDate:snapshot.retrievedAt});response.evidenceId=reference.id;
   }else response.resultId=await this.store.attachResult(userId,subscription.projectId,job.id);
  }
  return response;
 }
 async result(userId,projectId,resultId,attachmentIds=[],methodDisplay={}){
  const reference=await this.store.result(userId,projectId,resultId),result=await this.files.get(reference.artifact.checksum);
  if(reference.job.stage==='research-engine'){if(attachmentIds.length)throw error('Native attachments do not apply to an imported engine result.',409);if(result.operation==='research-method'){const parent=await this.result(userId,projectId,result.parentResultId);return methodCanvasPacket(result,parent,{resultId,projectId,computedAt:reference.job.completedAt,analysisKey:reference.artifact.analysisKey},methodDisplay);}return researchCanvasPacket(result,{resultId,projectId,computedAt:reference.job.completedAt,analysisKey:reference.artifact.analysisKey});}
  const graph=structuredClone(result.graph);graph._resultId=resultId;graph._projectId=projectId;graph._analysisKey=reference.artifact.analysisKey;graph.sourceCorpusId=projectId;
  if(!graph.evidenceProvenance&&result.evidenceArtifactId){const pinned=await this.store.artifact(result.evidenceArtifactId);if(!pinned||pinned.checksum!==result.evidenceChecksum)throw error('Pinned evidence provenance could not be verified.',409);graph.evidenceProvenance=pinnedEvidenceProvenance(await this.files.get(pinned.checksum),pinned.checksum,{algorithm:result.algorithmVersion,science:SCIENCE_VERSION},{evidence:result.textVersion});}
  if(!Array.isArray(attachmentIds)||attachmentIds.length>200)throw error('Invalid analysis attachments.');
  for(const id of attachmentIds){
   const attached=await this.store.result(userId,projectId,id);if(attached.artifact.analysisKey!==reference.artifact.analysisKey)throw error('Attached result does not match this analysis.',409);
   const value=await this.files.get(attached.artifact.checksum);if(value.operation==='reliability')graph[value.value.mode==='sources'?'sourceReliability':'reliability']=value.value;
   if(value.operation==='scan')graph.settingsSearch=value.value;if(value.operation==='sensitivity')graph.evidenceSensitivity=value.value;
   if(value.operation==='semantic-sensitivity')graph.semanticSensitivity=value.value;
   if(value.operation==='semantic-comparison')graph.semanticComparison=value.value;
   if(value.operation==='collaboration-sensitivity')graph.collaborationSensitivity=value.value;
   if(value.operation==='temporal-series')graph.temporalSeries=value.value;
   if(value.operation==='publication-bursts')graph.burstReport=value.value;
   if(value.operation==='description')graph.generatedDescriptions={...graph.generatedDescriptions,...value.graph.generatedDescriptions};
   const scienceKey={'scientific-roles':'roles','incidence-null':'null','construction-comparison':'construction','role-sensitivity':'roleSensitivity','optimization-variability':'optimization'}[value.operation];
   if(scienceKey)graph.scienceAudit={...graph.scienceAudit,[scienceKey]:value.value};
  }
  graph._attachments=attachmentIds;
  for(const [cluster,description] of Object.entries(graph.generatedDescriptions||{}))description.requestKey=JSON.stringify(descriptionRequest(graph,cluster,projectId));
  const evidence={...result.evidence,sourceCorpusId:projectId};
  return {id:resultId,projectId,graph,evidence,counts:result.counts,preset:result.preset,settings:result.settings,evidenceDate:result.evidenceDate,computedAt:reference.job.completedAt,operation:result.operation,value:result.value,generation:{maximumOrder:graph.higherOrderArtifact?.maximumOrder||2,higherOrdersReady:!!graph.higherOrderArtifact,themesReady:false}};
 }
}
