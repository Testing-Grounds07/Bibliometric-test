import {run as runInfomap} from '@mapequation/infomap/node';
import {readFile, mkdir, writeFile, mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {OPENALEX_WORK_SELECT,fetchOpenAlexWorks} from '../openalex-request.mjs';
import {createPaginationAudit,acceptPaginationPage,finishPaginationAudit} from '../openalex-pagination.mjs';
import {deduplicateWorks} from '../work-deduplication.mjs';
import {selectCleanedCorpus, evidenceDataset, buildProjectGraph} from '../workspace-projects-core.mjs';
import {couplingPairs, couplingGraph, connectionRoles} from '../evidence-metrics.mjs';
import {couplingCanvasGraph} from '../shared-canvas.mjs';
import {densityGrid, partition, analyzeCPM, AUTO_CPM_VERSION} from '../auto-cpm.mjs';
import {mineProjectBundles, projectOrderGraph} from '../project-higher-orders.mjs';
import {buildHyperedges, hypergraphPartition, infomapInput, infomapResult, infomapArgs, applyCommunityResult} from '../community-methods.mjs';
import {couplingHyperedges} from '../coupling-hypergraph.mjs';
import {compareCouplingSettings} from '../coupling-settings.mjs';
import {incidenceNetwork, HYPERGRAPH_MODEL_VERSION, HYPERGRAPH_INCIDENCE} from '../hypergraph-network.mjs';
import {prepareReliability} from '../network-reliability.mjs';
import {runSettingsSearch, evidenceSensitivity} from '../method-settings.mjs';
import {buildHistoriography} from '../historiography.mjs';
import {validateConnections, disparityBackbone, temporalNetwork} from '../network-extensions.mjs';
import {DESCRIPTION_VERSION, MODEL_ID, prepareDescription, descriptionMessages, descriptionRepairMessage, groundedSchema, verifiedDescription, resolveExcerpts} from '../cluster-description-core.mjs';
import {canonical, digest, unique, error} from './core.mjs';
import {createScientificManifest, methodSupport} from '../scientific-manifest.mjs';
import {analyzeRoles} from '../network-roles.mjs';
import {constructionCandidates, incidenceNull} from '../construction-audit.mjs';
import {roleSensitivity} from '../role-sensitivity.mjs';
import {optimizationVariability} from '../optimization-variability.mjs';
import {buildSemanticGraph, semanticSensitivity, preparedSemanticEvidence, commonSourceComparison} from '../semantic-network.mjs';
import {buildTemporalSeries} from '../temporal-series.mjs';
import {publicationBursts} from '../publication-bursts.mjs';
import {buildCollaborationGraph,collaborationSensitivity,linkedSourceScope} from '../collaboration-networks.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const OPENALEX_FIELDS=OPENALEX_WORK_SELECT;
const referenceFields='id,display_name,publication_year,authorships,doi,type,abstract_inverted_index';
export async function implementationVersion(stage){
 const temporalDependencies=['temporal-series.mjs','publication-bursts.mjs','semantic-network.mjs','auto-cpm.mjs','evidence-metrics.mjs','shared-canvas.mjs','scientific-invalidation.mjs'];
 const files={preparation:['work-deduplication.mjs','workspace-projects-core.mjs'],network:['analysis-engine.mjs','evidence-metrics.mjs','workspace-projects-core.mjs'],bundles:['project-higher-orders.mjs'],order:['project-higher-orders.mjs','combined-cocitation-metric.mjs'],clustering:['auto-cpm.mjs','community-methods.mjs','hypergraph-network.mjs','incidence-service.py','blockmodel-service.py'],reliability:['network-reliability.mjs','evidence-metrics.mjs'],scan:['method-settings.mjs','auto-cpm.mjs'],keywords:['build-cluster-themes.py'],description:['cluster-description-core.mjs'],history:['historiography.mjs']};
 const contents=await Promise.all((files[stage]||[]).map(file=>readFile(new URL(file==='analysis-engine.mjs'?'../../'+file:'../'+file,import.meta.url),'utf8')));
 if(['retrieval','reference-metadata'].includes(stage))contents.push(await readFile(new URL('../openalex-request.mjs',import.meta.url),'utf8'));
 if(stage==='retrieval')contents.push(await readFile(new URL('../openalex-pagination.mjs',import.meta.url),'utf8'));
 if(['analysis','temporal-series','publication-bursts'].includes(stage))contents.push(...await Promise.all(temporalDependencies.map(file=>readFile(new URL('../'+file,import.meta.url),'utf8'))));
 if(['analysis','collaboration-network','collaboration-sensitivity'].includes(stage))contents.push(...await Promise.all(['collaboration-networks.mjs','auto-cpm.mjs','scientific-manifest.mjs'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8'))));
 if(['analysis','clustering','order','history'].includes(stage))contents.push(await readFile(new URL('../scientific-invalidation.mjs',import.meta.url),'utf8'));
 if(['analysis','semantic-network','semantic-sensitivity','semantic-comparison'].includes(stage))contents.push(...await Promise.all(['semantic-network.mjs','auto-cpm.mjs','hypergraph-network.mjs','scientific-manifest.mjs'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8'))));
 if(['analysis','scientific-manifest','scientific-roles','incidence-null','construction-comparison','role-sensitivity','optimization-variability'].includes(stage))contents.push(...await Promise.all(['scientific-manifest.mjs','network-roles.mjs','construction-audit.mjs','network-extensions.mjs','role-sensitivity.mjs','optimization-variability.mjs'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8'))));
 if(stage==='analysis')contents.push(await readFile(new URL('./computations.mjs',import.meta.url),'utf8'),await readFile(new URL('./core.mjs',import.meta.url),'utf8'));
 return digest([stage,AUTO_CPM_VERSION,DESCRIPTION_VERSION,MODEL_ID,HYPERGRAPH_MODEL_VERSION,...contents,await readFile(new URL('../../package-lock.json',import.meta.url),'utf8'),await readFile(new URL('./stages.mjs',import.meta.url),'utf8')]);
}
async function engine(port,route,payload,context){
 const secret=process.env.BIBLIOMAP_SERVICE_TOKEN;if(!secret)throw error('Internal computation authentication is not configured.',503);
 const origin=process.env[port===8095?'BIBLIOMAP_INCIDENCE_URL':'BIBLIOMAP_BLOCKMODEL_URL']||'http://127.0.0.1:'+port;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw error('Internal engines must use loopback addresses.',503);
 const health=await fetch(origin+'/health',{signal:AbortSignal.any([context.signal,AbortSignal.timeout(5000)])});if(!health.ok||!(await health.json()).serviceAuthentication)throw error('Restart the analysis engine with service authentication configured.',503);
 const response=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+secret},body:JSON.stringify(payload),signal:AbortSignal.any([context.signal,AbortSignal.timeout(95000)])});
 if(!response.ok){const problem=error('An analysis engine is unavailable. Previous results remain unchanged.',503);problem.transient=[429,502,503,504].includes(response.status);throw problem;}
 return response.json();
}
export async function solve(graph,settings,context){
 context.signal?.throwIfAborted();
 if(settings.algorithm==='leiden'&&graph.networkModel==='hypergraph'){
  const incidence=incidenceNetwork(graph),resolution=settings.resolution==='auto'?Math.max(.000001,incidence.density/4):settings.resolution;
  if(!incidence.articleIds.length)return {memberships:{},algorithm:'leiden',label:'Leiden · bipartite CPM',resolution,modelVersion:HYPERGRAPH_MODEL_VERSION,limitations:HYPERGRAPH_INCIDENCE};
  const result=await engine(8095,'/incidence',{nodes:incidence.articleIds,groups:incidence.groups.map(group=>({members:group.members,weight:group.weight})),resolution,trials:settings.trials,seed:settings.seed},context);
  if(result.modelVersion!==HYPERGRAPH_MODEL_VERSION||incidence.articleIds.some(id=>!Number.isInteger(result.memberships?.[id])))throw error('Incomplete incidence partition.',502);return {...result,networkModel:'hypergraph',limitations:HYPERGRAPH_INCIDENCE};
 }
 if(settings.algorithm==='infomap'){
  const {ids,network}=infomapInput(graph);if(!ids.length)return {memberships:{},algorithm:'infomap',label:'Infomap',quality:null,limitations:graph.networkModel==='hypergraph'?HYPERGRAPH_INCIDENCE:'No eligible weighted connections.'};
  return infomapResult(await runInfomap(network,{args:infomapArgs(settings)}),ids,{...settings,modelVersion:graph.networkModel==='hypergraph'?HYPERGRAPH_MODEL_VERSION:undefined});
 }
 if(settings.algorithm==='hypergraph')return hypergraphPartition(graph,graph.hyperedges,context.progress,settings);
 if(settings.algorithm==='sbm'){
  const nodes=unique(graph.links.flatMap(edge=>[edge.source,edge.target])),edges=graph.links.map(edge=>[edge.source,edge.target]);if(!nodes.length)return {memberships:{},algorithm:'sbm',hierarchy:[],selectedLevel:0,label:'Nested block model'};
  const result=await engine(8091,'/sbm',{nodes,edges,starts:settings.trials===2?2:3},context),level=Math.min(settings.selectedLevel||0,Math.max(0,result.hierarchy.length-1));
  if(nodes.some(id=>!Number.isInteger(result.memberships?.[id])))throw error('Incomplete block-model result.',502);
  if(result.hierarchy[level])result.memberships=result.hierarchy[level].memberships;return {...result,selectedLevel:level};
 }
 const resolution=settings.resolution==='auto'?Math.max(.000001,densityGrid(graph).density/4):settings.resolution;
 return {...partition(graph,resolution,settings.trials,settings.seed),resolution,algorithm:'leiden',label:'Leiden CPM'};
}
async function openalex(parameters,context){
 await context.rateLimit();context.signal?.throwIfAborted();
 return fetchOpenAlexWorks(parameters,{fetch:context.fetch,apiKey:process.env.OPENALEX_API_KEY,signal:AbortSignal.any([context.signal,AbortSignal.timeout(45000)])});
}
const extractAbstract=work=>Object.entries(work.abstract_inverted_index||{}).flatMap(([word,offsets])=>offsets.map(offset=>[offset,word])).sort((left,right)=>left[0]-right[0]).map(([,word])=>word).join(' ');
export async function executeStage(stage,input,settings,context){
 if(stage==='collaboration-network'||stage==='collaboration-sensitivity'){const configuration={sourceCorpusId:input.sourceCorpusId,externalCorpus:true,evidenceProvenance:input.graph.evidenceProvenance,linkedWorkScope:input.graph.collaboration?.linkedWorkScope||linkedSourceScope(input.graph),referenceScope:input.graph.collaboration?.referenceScope||input.graph.semantic?.referenceScope||(!input.graph.semantic&&!input.graph.collaboration&&input.graph.method==='cocitation'?input.graph:null)};return stage==='collaboration-network'?buildCollaborationGraph(input.works,settings,configuration,context.progress):collaborationSensitivity(input.works,input.graph,configuration,context.progress);}
 if(stage==='temporal-series')return buildTemporalSeries(input.graph,input.works,settings,context.progress);
 if(stage==='publication-bursts')return publicationBursts(input.works,input.graph,settings,context.progress);
 if(stage==='semantic-comparison')return commonSourceComparison(input.otherGraph,input.graph);
 if(stage==='semantic-network'||stage==='semantic-sensitivity'){
  const prepared=await preparedSemanticEvidence(input.works,input.cache,input.cache?.sourceCorpusId,settings.useCachedAbstracts===true),configuration={sourceCorpusId:input.sourceCorpusId,externalCorpus:true,evidenceProvenance:input.graph.evidenceProvenance,referenceGraph:input.graph.collaboration?.referenceScope||input.graph.semantic?.referenceScope||(!input.graph.semantic&&!input.graph.collaboration&&input.graph.method==='cocitation'?input.graph:null)};
  if(stage==='semantic-sensitivity')return semanticSensitivity(prepared.works,input.graph,input.cache,{...configuration,supplementalText:prepared.supplementalText},context.progress);
  const graph=await buildSemanticGraph(prepared.works,settings,input.cache,{...configuration,sourceCorpusId:input.cache?.sourceCorpusId||input.sourceCorpusId},context.progress);graph.semantic.supplementalText=prepared.supplementalText;graph.semantic.cacheChecksum=input.cacheChecksum||null;return graph;
 }
 if(stage==='retrieval'){
  const specification=input.specification,checkpoint=context.checkpoint||{cursor:'*',pages:[],startedAt:new Date().toISOString()},works=new Map();
  let rawRows=0;for(const checksum of checkpoint.pages)for(const work of await context.files.get(checksum)){works.set(work.id,work);rawRows++;}
  const pagination=createPaginationAudit(checkpoint.pagination,{pages:checkpoint.pages.length,rawRows,uniqueRecords:works.size,latestTotal:checkpoint.total});
  if(pagination.rawRows!==rawRows||pagination.uniqueRecords!==works.size)throw error('The retrieval checkpoint does not match its retained pages. Restart this retrieval.',502);
  let cursor=pagination.terminalCursorNull?null:checkpoint.cursor,total=checkpoint.total??null,exhausted=pagination.terminalCursorNull;
  if(!exhausted&&(typeof cursor!=='string'||!cursor))throw error('The old retrieval checkpoint has no verifiable terminal cursor. Restart this retrieval; completeness was not inferred.',502);
  while(!exhausted&&works.size<specification.limit){
   const result=await openalex({search:specification.terms,corpus:specification.corpus,filter:specification.filter,cursor,per_page:Math.min(100,specification.limit-works.size),select:OPENALEX_FIELDS},context);
   cursor=acceptPaginationPage(pagination,result,cursor,works);total=pagination.latestTotal;exhausted=pagination.terminalCursorNull;
   const page=await context.files.put(result.results);checkpoint.pages.push(page.checksum);finishPaginationAudit(pagination,specification.limit);Object.assign(checkpoint,{cursor,exhausted,total,pagination});await context.saveCheckpoint(checkpoint);context.progress(`${works.size} / ${total} retrieved`);
  }
  finishPaginationAudit(pagination,specification.limit);
  return {works:[...works.values()].sort((left,right)=>left.id.localeCompare(right.id)),metadata:[],publicEvidence:true,specification,retrievedAt:new Date().toISOString(),startedAt:checkpoint.startedAt,total,exhausted,pagination,complete:true,fields:OPENALEX_FIELDS,metadataPolicy:input.metadataPolicy||'pinned-v1',coverage:'Available indexed reference lists; completeness unknown.'};
 }
 if(stage==='reference-metadata'){
  const result=[...(input.known||[])],known=new Set(result.map(work=>work.id));
  const epoch=digest([settings.epoch,referenceFields]);
  for(const cached of await context.metadataGet(input.ids,epoch)){known.add(cached.id);if(!cached.missing&&!result.some(work=>work.id===cached.id))result.push(cached);}
  const missing=input.ids.filter(id=>!known.has(id)&&/^https:\/\/openalex.org\/W\d+$/.test(id));
  for(let offset=0;offset<missing.length;offset+=100){const ids=missing.slice(offset,offset+100),page=await openalex({filter:'openalex:'+ids.map(id=>id.split('/').pop()).join('|'),per_page:100,select:referenceFields},context);if(!Array.isArray(page.results))throw error('Invalid metadata response.',502);result.push(...page.results);for(const id of ids)await context.metadataPut(page.results.find(work=>work.id===id)||{id,missing:true,observedAt:new Date().toISOString()},epoch);context.progress('Reference metadata '+Math.min(offset+100,missing.length)+'/'+missing.length);}
  return result.sort((left,right)=>left.id.localeCompare(right.id));
 }
 if(stage==='prepared-work')return {work:input.work};
 if(stage==='preparation'){
  const selection=selectCleanedCorpus(input.works,settings.preset,null),prepared=deduplicateWorks(selection.works,input.metadata||[]);
  return {...prepared,counts:selection.counts,preset:selection.preset};
 }
 if(stage==='network'){
  let graph;
  if(settings.method==='coupling'){
   const articles=input.works.map(work=>({id:work.id,references:unique(work.referenced_works||[])}));graph=couplingGraph(articles,couplingPairs(articles,1000000),settings.minimumShared,settings.minimumCosine);
   if(graph.nodes.length>20000||graph.links.length>100000)throw error('Coupling exceeds network limits. Narrow the corpus or increase the minimums.');
  }else{
   graph=buildProjectGraph(input.works,[],{threshold:settings.threshold,support:settings.support});
   if(settings.members){const selected=new Set(settings.members);graph.nodes=graph.nodes.filter(node=>selected.has(node.id));graph.links=graph.links.filter(edge=>selected.has(edge.source)&&selected.has(edge.target));}
  }
  for(const node of graph.nodes){for(const field of ['label','title','year','years','yearLabel','doi','variants','mergedRecords','deduplicationNote','rules'])delete node[field];node.cluster=0;}
  graph.clustering=null;delete graph.deduplication;delete graph.appliedSettings;delete graph.resolutionSelection;graph.resolution=null;return graph;
 }
 if(stage==='bundles')return mineProjectBundles(input.graph.nodes,settings.support,{progress:value=>context.progress('Mining combinations · '+value.bundles)});
 if(stage==='order')return projectOrderGraph(input.graph,input.bundles,{order:settings.order,maximumOrder:Math.min(settings.maximumOrder,input.bundles.maximumOrder),resolution:.02});
 if(stage==='clustering'){
  const graph=structuredClone(input.graph);graph.networkModel=settings.networkModel;
  if(graph.networkModel==='hypergraph'){graph.hyperedges=graph.method==='coupling'?couplingHyperedges(graph):buildHyperedges(graph,graph.bundles||[]);graph.clustering={modelVersion:HYPERGRAPH_MODEL_VERSION};}
  let result;
  if(settings.algorithm==='leiden'&&settings.resolution==='auto'&&graph.method!=='coupling'&&graph.networkModel!=='hypergraph'&&graph.links.length){
   const audit=analyzeCPM(graph,input.articleIds,context.progress),candidate=audit.candidates.find(item=>item.resolution===audit.autoResolution);result={...candidate,algorithm:'leiden',label:'Leiden CPM',resolution:candidate.resolution};graph.autoCPM={...audit,enabled:true,selectedResolution:audit.autoResolution};
  }else result=await solve(graph,settings,context);
  graph.resolution=result.resolution||graph.resolution;const output=applyCommunityResult(graph,result,graph.hyperedges);output.clustering={...output.clustering,...settings,resolution:graph.resolution,label:result.label,modelVersion:graph.networkModel==='hypergraph'?HYPERGRAPH_MODEL_VERSION:undefined};
  output.appliedSettings={settings:{label:result.label}};return output;
 }
 if(stage==='history')return buildHistoriography(input.articles,settings,context.progress);
 if(stage==='reliability'){
  const session=prepareReliability(input.graph,input.articleIds,settings.samples,settings.options||{});
  for(let position=0;position<session.sampleCount;position++){context.progress('Resample '+(position+1)+'/'+session.sampleCount);const sample=session.sample(position);session.record(await solve(sample.graph,{...input.graph.clustering,algorithm:session.algorithm,resolution:input.graph.resolution,trials:2},context));}
  return session.finish();
 }
 if(stage==='scan'||stage==='sensitivity'){
  const fit=(graph,options)=>solve(graph,{...input.graph.clustering,...options,algorithm:options.algorithm||input.graph.clustering.algorithm},context);
   return stage==='scan'?runSettingsSearch(input.graph,input.articleIds,fit,context.progress,{compareObjectives:settings.compareObjectives===true}):evidenceSensitivity(input.graph,input.articleIds,fit,context.progress);
 }
 if(stage==='roles')return connectionRoles(input.graph);
 if(stage==='scientific-manifest')return createScientificManifest(input.graph,input.articles,settings);
 if(stage==='scientific-roles')return analyzeRoles(input.graph,settings);
 if(stage==='role-sensitivity'){if(!methodSupport(input.graph).constructionComparison)throw error('Role rank sensitivity currently supports pairwise citation-derived networks only.');return roleSensitivity(input.graph,settings,context.progress);}
 if(stage==='optimization-variability'){const support=methodSupport(input.graph);if(!support.constructionComparison||!['leiden','infomap'].includes(support.algorithm))throw error('This fixed-evidence diagnostic currently supports pairwise Leiden and Infomap only.');return optimizationVariability(input.graph,(graph,configuration)=>solve(graph,{...configuration,algorithm:support.algorithm},context),context.progress);}
 if(stage==='incidence-null'){if(!methodSupport(input.graph).marginNull)throw error('Margin-preserving null tests currently support pairwise citation-derived networks only.');return incidenceNull(input.graph,settings,context.progress);}
 if(stage==='construction-comparison'){
  if(!methodSupport(input.graph).constructionComparison)throw error('Construction comparisons currently support pairwise citation-derived networks only.');
  const original=Object.fromEntries(input.graph.nodes.map(node=>[node.id,node.cluster])),comparisons=[];
  const {clusterRecovery}=await import('../evidence-metrics.mjs');
  for(const candidate of constructionCandidates(input.graph)){
   const fit=await solve(candidate,{...input.graph.clustering,resolution:input.graph.resolution,trials:2},context),recovery=clusterRecovery(original,fit.memberships),values=Object.values(recovery),total=values.reduce((sum,value)=>sum+value.size,0);
   comparisons.push({definition:candidate.construction,edges:candidate.links.length,clusters:new Set(Object.values(fit.memberships).filter(cluster=>cluster>0)).size,weightedRecovery:total?values.reduce((sum,value)=>sum+value.jaccard*value.size,0)/total:null,recovery,settings:input.graph.clustering,nonconverged:fit.converged===false});
  }
  return {version:'construction-comparison-v1',comparisons,limitation:'Construction-and-scale sensitivity at fixed settings, not pure normalization invariance. Leiden rescales by mean edge weight, but equal gamma need not mean equal effective granularity across different weight distributions. No per-definition retuning, cross-objective quality comparison or automatic winner. Block models ignore weights. Conditional on retained universe; no higher-order re-mining or identity scenarios.'};
 }
 if(stage==='coupling-scan')return compareCouplingSettings(input.articles.filter(article=>input.graph.nodes.some(node=>node.id===article.id)),{minimumShared:input.graph.minimumShared,minimumCosine:input.graph.minimumCosine,resolution:input.graph.resolution},context.progress);
 if(stage==='validation')return validateConnections(input.graph,settings.alpha);
 if(stage==='backbone')return disparityBackbone(input.graph,settings.alpha);
 if(stage==='temporal')return temporalNetwork(input.graph,input.articles,settings.from,settings.to);
 if(stage==='keywords'){
  const revision=process.env.BIBLIOMAP_MINILM_REVISION;if(!/^[a-f0-9]{40}$/.test(revision||''))throw error('Configure a pinned MiniLM revision before generating keywords.',503);
  const folder=path.join(context.files.root,'semantic',digest(context.scope));await mkdir(folder,{recursive:true});const temporary=await mkdtemp(path.join(folder,'run-'));
  try{
   const documents=input.works.map(work=>({id:work.id,title:work.display_name||'',abstract:extractAbstract(work)})),inputFile=path.join(temporary,'input.json'),output=path.join(temporary,'output.json');
   await writeFile(inputFile,canonical({sourceCorpusId:'immutable-evidence',documents}));
   await new Promise((resolve,reject)=>{
    const executable=process.env.PYTHON_EXECUTABLE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
    const child=spawn(executable,['scripts/build-cluster-themes.py','--input',inputFile,'--output',output,'--cache-root',folder,'--model-revision',revision],{cwd:root,windowsHide:true,signal:context.signal,env:{...process.env,PYTHONIOENCODING:'utf-8'}});let diagnostics='';
    const timer=setTimeout(()=>child.kill(),1200000);child.stdout.on('data',data=>context.progress(data.toString().trim().slice(-250)));child.stderr.on('data',data=>{diagnostics=(diagnostics+data).slice(-4000);});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(error('Keyword generation failed. Check the private worker log.',503));});
   });return JSON.parse(await readFile(output,'utf8'));
  }finally{if(!path.resolve(temporary).startsWith(path.resolve(folder)+path.sep))throw error('Unsafe temporary directory.',500);await rm(temporary,{recursive:true,force:true});}
 }
 if(stage==='description'){
  if(input.graph.collaboration)throw error('Actor identities are not article IDs. Grounded actor AI descriptions are not implemented.');
  if(input.graph.semantic&&input.graph.entityKind!=='source')throw error('Generated feature descriptions are not implemented; observed feature headings remain available.');
  if(process.env.BIBLIOMAP_QWEN_REVISION!==MODEL_ID)throw error('Configure the pinned Qwen revision before generating descriptions.',503);
  const probe=await fetch('http://127.0.0.1:8092/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.any([context.signal,AbortSignal.timeout(5000)])});if(probe.status!==401)throw error('Restart the local language model with its API key enabled.',503);
  const sandbox={window:{},atob};vm.runInNewContext(await readFile(path.join(root,'public/conservative-atlas/cluster-themes.js'),'utf8'),sandbox);
  const themes=sandbox.window.ATLAS_THEMES.describe(input.graph.nodes,input.themes),request={kind:input.graph.method==='coupling'||input.graph.semantic&&input.graph.entityKind==='source'?'coupling':'cocitation',cluster:String(settings.cluster),nodes:input.graph.nodes.map(node=>({id:node.id,cluster:String(node.cluster)}))},references=Object.fromEntries(input.works.map(work=>[work.id,work.referenced_works||[]])),packet=prepareDescription(request,input.themes,themes,references);
  const base={model:MODEL_ID,version:DESCRIPTION_VERSION,createdAt:new Date().toISOString(),packet,verification:'Literal evidence verified; thematic accuracy requires researcher review.'};
  if(packet.coverage.distinctTitles<2)return {...base,heading:'Insufficient text evidence',status:'insufficient-evidence',summary:null,concepts:[],exceptions:[],contrast:null};
  const messages=descriptionMessages(packet);
  for(let attempt=0;attempt<2;attempt++){
   const response=await fetch('http://127.0.0.1:8092/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.BIBLIOMAP_SERVICE_TOKEN},body:JSON.stringify({model:'bibliomap-cluster-slm',messages,temperature:0,seed:42,max_tokens:2000,response_format:{type:'json_schema',json_schema:{name:'cluster_description',strict:true,schema:groundedSchema(packet)}}}),signal:AbortSignal.any([context.signal,AbortSignal.timeout(190000)])});
   if(!response.ok)throw error('The local language model is unavailable.',503);
   const output=(await response.json()).choices[0].message.content;
   try{return {...base,...verifiedDescription(resolveExcerpts(JSON.parse(output),packet),packet),attempts:attempt+1};}
   catch(problem){if(attempt)throw error('Generated evidence could not be verified. Keywords remain available.',422);messages.push({role:'assistant',content:output},{role:'user',content:descriptionRepairMessage(output,packet,problem)});}
  }
 }
 throw error('Unknown calculation stage.');
}

export function decorateGraph(graph,prepared){
 const metadata=new Map([...prepared.works,...prepared.metadata].map(work=>[work.id,work]));
 for(const node of graph.nodes){const work=metadata.get(node.id);node.title=work?.display_name||node.id;node.label=[work?.authorships?.[0]?.author?.display_name,node.title].filter(Boolean).join(', ');node.year=work?.publication_year||null;node.years=work?.years||[];node.yearLabel=work?.yearLabel||'';node.variants=work?.variants||[node.id];node.mergedRecords=work?.mergedRecords||[];node.deduplicationNote=work?.deduplicationNote||null;node.doi=work?.doi||null;node.authors=(work?.authorships||[]).map(author=>author.author?.display_name).filter(Boolean).join('; ');}
 graph.deduplication=prepared.audit;graph.externalCorpus=true;
 return graph.method==='coupling'?couplingCanvasGraph(graph):graph;
}
