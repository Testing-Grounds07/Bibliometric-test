import http from 'node:http';
import {randomUUID, createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Neo4jStore} from '../neo4j-store.mjs';
import {searchSpecification, selectCleanedCorpus, evidenceDataset, buildProjectGraph, nativeNetwork, workspaceNetworkMethod, assertSnapshotCorpus, rebindSnapshotCorpus} from './workspace-projects-core.mjs';
import {projectOrderGraph} from './project-higher-orders.mjs';
import {generateProjectAnalysis, readGeneration, corpusFolder, copyGeneration} from './project-generation.mjs';
import {deduplicateWorks, referenceMetadataCandidates} from './work-deduplication.mjs';
import {createScientificManifest} from './scientific-manifest.mjs';
import {readPublicCollaborationMetadata,PUBLIC_COLLABORATION_PATH} from './public-collaboration-metadata.mjs';
import {OPENALEX_WORK_SELECT,fetchOpenAlexWorks} from './openalex-request.mjs';
import {createPaginationAudit,acceptPaginationPage,finishPaginationAudit} from './openalex-pagination.mjs';
import {retrievedSearchExport} from './retrieved-search-export.mjs';
import {snapshotSourceDigests,hydrateSnapshotTransport,assertPlainSnapshot} from './snapshot-transport.mjs';

const store = Neo4jStore.fromEnvironment();
await store.init();
const jobs = new Map(), metadataCache = new Map();
const root = fileURLToPath(new URL('../', import.meta.url));
const fields = OPENALEX_WORK_SELECT;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
async function projectList() {
 const result = await store.driver.executeQuery('MATCH (p:BMProject) OPTIONAL MATCH (p)-[:HAS_ANALYSIS]->(a:BMAnalysis) RETURN p.id AS id,p.name AS name,p.created_at AS created_at,p.updated_at AS updated_at,count(a) AS analysis_count ORDER BY updated_at DESC', {}, {database: store.database});
 return result.records.map(record => record.toObject());
}
async function projectHistory(projectId) {
 const searches = await store.driver.executeQuery('MATCH (s:BMSearch {project_id:$projectId}) OPTIONAL MATCH (s)-[:OBSERVED]->(o:BMObservation) RETURN s.id AS id,s.name AS name,s.created_at AS created_at,s.workspace_summary AS summary,count(o) AS retrieved ORDER BY created_at DESC', {projectId}, {database: store.database});
 const analyses = await store.driver.executeQuery('MATCH (a:BMAnalysis {project_id:$projectId}) WHERE a.workspace_version=1 RETURN a.id AS id,a.name AS name,a.created_at AS created_at,a.workspace_summary AS summary ORDER BY created_at DESC', {projectId}, {database: store.database});
 return {searches: searches.records.map(record => {const row=record.toObject();return {id:row.id,name:row.name,created_at:row.created_at,result_count:row.retrieved,query:row.summary?JSON.parse(row.summary):{retrieved:row.retrieved}};}), analyses: analyses.records.map(record => {const row=record.toObject();return {id:row.id,name:row.name,created_at:row.created_at,...JSON.parse(row.summary)};})};
}
async function openalex(parameters, signal) {
 return fetchOpenAlexWorks(parameters, {apiKey: process.env.OPENALEX_API_KEY, userAgent: 'BiblioMap/0.2', signal});
}
async function required(kind, id) {
 if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) fail('Choose a saved ' + kind.slice(0, -1) + '.');
 const record = await store.get(kind, id);
 if (!record) fail('Saved record was not found.', 404);
 return record;
}
async function searchJob(job, projectId, specification) {
 try {
  const works = new Map(), pagination = createPaginationAudit(); let cursor = '*';
  while (works.size < specification.limit) {
   const result = await openalex({search: specification.terms, corpus: 'core', filter: specification.filter, cursor, per_page: Math.min(100, specification.limit - works.size), select: fields}, AbortSignal.any([job.controller.signal, AbortSignal.timeout(45000)]));
   cursor = acceptPaginationPage(pagination, result, cursor, works);
   job.total = pagination.latestTotal;
   job.retrieved = works.size; job.pages++;
   if (cursor === null) break;
  }
  job.controller.signal.throwIfAborted();
  job.status = 'saving';
  finishPaginationAudit(pagination, specification.limit); const exhausted = pagination.terminalCursorNull;
  const record = await store.create('searches', {project_id: projectId, name: specification.query, query: {...specification, completedAt: new Date().toISOString(), exhausted, retrieved: works.size, pagination}, result_count: job.total, result_snapshot: {works: [...works.values()], total: job.total, retrieved: works.size, exhausted, pagination}});
  await store.driver.executeQuery('MATCH (s:BMSearch {id:$id}) SET s.workspace_summary=$summary', {id:record.id,summary:JSON.stringify(record.query)}, {database:store.database});
  job.searchId = record.id; job.status = 'complete';
 } catch (error) { job.status = job.controller.signal.aborted ? 'cancelled' : 'failed'; job.error = job.status === 'cancelled' ? 'Search cancelled. No partial result was saved.' : error.message; }
 finally { job.finishedAt = Date.now(); }
}
async function referenceMetadata(ids, corpusId, signal) {
 if(corpusId)try{for(const work of JSON.parse(await readFile(path.join(corpusFolder(corpusId),'reference-metadata.json'),'utf8')))metadataCache.set(work.id,work);}catch(error){if(error.code!=='ENOENT')throw error;}
 const missing = ids.filter(id => !metadataCache.get(id)?.type);
 for (let offset = 0; offset < missing.length; offset += 100) {
  const result = await openalex({filter: 'openalex:' + missing.slice(offset, offset + 100).map(id => id.split('/').pop()).join('|'), per_page: 100, select: 'id,display_name,publication_year,authorships,doi,type,abstract_inverted_index'},signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):undefined);
  for (const work of result.results) metadataCache.set(work.id, work);
 }
 const result=ids.map(id => metadataCache.get(id)).filter(Boolean);
 if(corpusId){await mkdir(corpusFolder(corpusId),{recursive:true});await writeFile(path.join(corpusFolder(corpusId),'reference-metadata.json'),JSON.stringify([...metadataCache.values()].filter(work=>ids.includes(work.id))));}
 return result;
}
async function searchCleanup(searchId) {
 const result=await store.driver.executeQuery('MATCH (s:BMSearch {id:$id}) RETURN s.workspace_cleanup AS cleanup',{id:searchId},{database:store.database});
 const raw=result.records[0]?.get('cleanup');return raw?JSON.parse(raw):null;
}
async function corpusFor(input) {
 if (input.corpusId) {const record=await required('corpora',input.corpusId),cleanup=record.search_id?await searchCleanup(record.search_id):null;if(!cleanup||JSON.stringify(record.decisions.cleanup?.audit.mergedGroups)===JSON.stringify(cleanup.audit.mergedGroups))return record;return corpusFor({searchId:record.search_id,preset:record.decisions.preset||record.decisions.corpusPreset||'conservative'});}
 const search = await required('searches', input.searchId), cleanup = await searchCleanup(search.id), selection = selectCleanedCorpus(search.result_snapshot.works, input.preset, cleanup);
 const name='Workspace · '+selection.preset+(cleanup?' · cleaned '+createHash('sha256').update(JSON.stringify(cleanup.audit.mergedGroups)).digest('hex').slice(0,12):'');
 const existing = (await store.list('corpora', search.project_id)).find(record => record.search_id === search.id && record.name === name);
 if (existing) return required('corpora', existing.id);
 return store.create('corpora', {project_id: search.project_id, search_id: search.id, name, works: selection.works, decisions: {preset: selection.preset, counts: selection.counts, ...(cleanup?{cleanup:{sourceDataSha256:cleanup.sourceDataSha256,summary:selection.cleanup,audit:cleanup.audit}}:{}), automatedMetadataScreening: true, humanValidated: false}});
}
async function scopeMetadata(corpus, input, signal) {
 const candidates = referenceMetadataCandidates(corpus.works, input.threshold);
 if(corpus.decisions.cleanup&&corpus.search_id){try{for(const work of JSON.parse(await readFile(path.join(root,'.trials/workspace-search-cleanups',corpus.search_id,'reference-metadata.json'),'utf8')))metadataCache.set(work.id,work);}catch(error){if(error.code!=='ENOENT')throw error;}}
 const selected=new Set(candidates.ids),aliases=(corpus.decisions.cleanup?.audit.mergedGroups||[]).filter(group=>selected.has(group.canonicalId)).flatMap(group=>group.records.map(record=>record.id));
 const metadata = await referenceMetadata([...new Set([...candidates.ids,...aliases])], corpus.id, signal);
 const returned=new Set(metadata.map(work=>work.id)),available=candidates.ids.filter(id=>returned.has(id)).length;
 return {metadata, coverage: {candidateRecords: candidates.candidates, requested: candidates.ids.length, available, additionalAliasRecords:metadata.length-available, minimumFrequency: candidates.minimumFrequency, limited: candidates.candidates > candidates.ids.length, limitation: 'Matching uses available metadata above the candidate frequency cutoff, up to 5,000 records. Unresolved IDs and uninspected lower-frequency references remain separate.'}};
}
async function packet(corpus, graph, labels, metadata = []) {
 const evidence = evidenceDataset(corpus.works, corpus.id, labels, metadata, graph.deduplication || false);
 const snapshotSources=await snapshotSourceDigests(evidenceDataset(corpus.works,corpus.id,{},[],false).articles,{corpusId:corpus.id,evidenceId:corpus.id});
 return {corpusId: corpus.id, projectId: corpus.project_id, searchId: corpus.search_id, name: corpus.name, counts: corpus.decisions.counts, preset: corpus.decisions.preset || corpus.decisions.corpusPreset, graph, evidence,snapshotSources};
}
async function generateJob(job,corpus,input){
 try{
  let graph=buildProjectGraph(corpus.works,[],input);
  if(input.members){const allowed=new Set(input.members);graph.nodes=graph.nodes.filter(node=>allowed.has(node.id));graph.links=graph.links.filter(edge=>allowed.has(edge.source)&&allowed.has(edge.target));}
  if(!graph.nodes.length)fail('No references meet this scope. Lower the reference citation minimum.');
  job.message='Loading titles and available abstracts for '+graph.nodes.length+' references…';
  const {metadata,coverage}=await scopeMetadata(corpus,input,job.controller.signal);job.controller.signal.throwIfAborted();
  const prepared=deduplicateWorks(corpus.works,metadata);graph=buildProjectGraph(corpus.works,metadata,input);
  graph.deduplication.metadataCoverage=coverage;
  if(input.members){const allowed=new Set(input.members.map(id=>prepared.aliases[id]||id));graph.nodes=graph.nodes.filter(node=>allowed.has(node.id));graph.links=graph.links.filter(edge=>allowed.has(edge.source)&&allowed.has(edge.target));}
  job.result=await generateProjectAnalysis({...corpus,works:prepared.works},graph,prepared.metadata,job,input);
  await store.driver.executeQuery('MATCH (c:BMCorpus {id:$id}) SET c.workspace_artifacts=$artifacts',{id:corpus.id,artifacts:JSON.stringify(job.result)},{database:store.database});
  if(job.result.themesReady){
   try{for(const port of[8092,8093]){const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(2000)});if(!response.ok)throw Error('Warming model');}}catch{spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/start-cluster-descriptions.ps1')],{cwd:root,windowsHide:true,stdio:'ignore'}).on('error',()=>{});}
  }
  job.status='complete';job.message='Analysis generated and cached for this project.';
 }catch(error){job.status=job.controller.signal.aborted?'cancelled':'failed';job.error=job.controller.signal.aborted?'Generation cancelled. Previous completed results remain available.':error.message;}
 finally{job.finishedAt=Date.now();}
}
async function body(request) {
 const chunks = []; let length = 0;
 for await (const chunk of request) { length += chunk.length; if (length > 30000000) fail('Snapshot is too large.', 413); chunks.push(chunk); }
 try { const value = JSON.parse(Buffer.concat(chunks).toString() || '{}'); if (!value || Array.isArray(value) || typeof value !== 'object') fail('Invalid request.'); return value; }
 catch { fail('Invalid JSON request.'); }
}

export async function workspaceRequest(request, response) {
 const send = (status, result) => { response.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); response.end(JSON.stringify(result)); };
 try {
  const url = new URL(request.url, 'http://localhost'), route = url.pathname;
  if (route === '/health') return send(200, {ready: true, storage: 'neo4j', openalex: !!process.env.OPENALEX_API_KEY});
  if(route===PUBLIC_COLLABORATION_PATH){if(request.method!=='GET')fail('Supplemental metadata is read-only.',405);if(url.searchParams.getAll('corpus').length!==1||[...url.searchParams.keys()].some(key=>key!=='corpus'))fail('Choose the exact public corpus.',400);const evidence=JSON.parse(await readFile(path.join(root,'public/conservative-atlas/source-evidence.json'),'utf8'));return send(200,await readPublicCollaborationMetadata(process.env.BIBLIOMAP_PUBLIC_COLLABORATION_METADATA,evidence,url.searchParams.get('corpus')));}
  if (request.method === 'POST' && request.headers.origin && !['127.0.0.1', 'localhost', 'limited-display-lauren-bee.trycloudflare.com'].includes(new URL(request.headers.origin).hostname)) fail('Request origin is not allowed.', 403);
  if (request.method === 'GET' && route === '/projects') return send(200, {projects: await projectList()});
  if (request.method === 'POST' && route === '/projects') {
   const input = await body(request);
   if (!String(input.name || '').trim() || input.name.length > 200) fail('Enter a project name (up to 200 characters).');
   return send(201, await store.create('projects', {name: input.name.trim(), description: String(input.description || '').slice(0, 30000)}));
  }
  const projectMatch = /^\/projects\/([0-9a-f-]{36})$/.exec(route);
  if (projectMatch && request.method === 'GET') {
   const project = await required('projects', projectMatch[1]);
   return send(200, {project, ...await projectHistory(project.id)});
  }
  if (projectMatch && request.method === 'PATCH') { const input = await body(request); return send(200, await store.update('projects', projectMatch[1], {name: input.name?.slice(0, 200), description: input.description?.slice(0, 30000)})); }
  if (route === '/search' && request.method === 'POST') {
   const input = await body(request); await required('projects', input.projectId);
   if ([...jobs.values()].some(job => ['running', 'saving'].includes(job.status))) fail('Another OpenAlex search is running. Wait or cancel it first.', 409);
   for (const [id, job] of jobs) if (job.finishedAt && Date.now() - job.finishedAt > 3600000) jobs.delete(id);
   const specification = searchSpecification(input), job = {id: randomUUID(), status: 'running', pages: 0, retrieved: 0, total: null, controller: new AbortController()}; jobs.set(job.id, job);
   searchJob(job, input.projectId, specification);
   return send(202, {id: job.id});
  }
  const jobMatch = /^\/jobs\/([0-9a-f-]{36})(\/cancel)?$/.exec(route);
  if (jobMatch) {
   const job = jobs.get(jobMatch[1]); if (!job) fail('Search job expired. Check the project search history.', 404);
   if (jobMatch[2] && request.method === 'POST') { if (job.status === 'running') job.controller.abort(); return send(200, {status: job.status}); }
   if (request.method === 'GET') { const {controller, ...status} = job; return send(200, status); }
  }
  const searchExportMatch = /^\/searches\/([0-9a-f-]{36})\/export$/.exec(route);
  if (searchExportMatch) {if(request.method!=='GET')fail('Retrieved source export is read-only.',405);const exported=await retrievedSearchExport(searchExportMatch[1],required);response.setHeader('Content-Disposition','attachment; filename="bibliomap-retrieved-sources-'+searchExportMatch[1]+'.json"');response.setHeader('X-Content-Type-Options','nosniff');return send(200,exported);}
  const searchMatch = /^\/searches\/([0-9a-f-]{36})$/.exec(route);
  if (searchMatch && request.method === 'GET') { const search = await required('searches', searchMatch[1]),cleanup=await searchCleanup(search.id); return send(200, {...search,cleanup:cleanup?.summary||null, result_snapshot: {total: search.result_count, retrieved: search.result_snapshot.works.length, exhausted: search.result_snapshot.exhausted, examples: search.result_snapshot.works.slice(0, 10).map(work => ({title: work.display_name, year: work.publication_year, id: work.id, doi: work.doi || null}))}}); }
  const themeMatch=/^\/corpora\/([0-9a-f-]{36})\/themes$/.exec(route);
  if(themeMatch&&request.method==='GET'){
   try{return send(200,JSON.parse(await readFile(path.join(corpusFolder(themeMatch[1]),'themes.json'),'utf8')));}catch(error){if(error.code==='ENOENT')fail('Generate keywords and Qwen descriptions in Analysis first.',404);throw error;}
  }
  if(route==='/generate'&&request.method==='POST'){
   const input=await body(request),corpus=await corpusFor(input);
   if([...jobs.values()].some(job=>job.kind==='generation'&&job.status==='running'))fail('Another project analysis is generating. Wait or cancel it first.',409);
   if(input.members&&(!Array.isArray(input.members)||input.members.length>1500||input.members.some(id=>typeof id!=='string')))fail('Invalid reference scope.');
   const job={id:randomUUID(),kind:'generation',status:'running',message:'Preparing project evidence…',controller:new AbortController()};jobs.set(job.id,job);generateJob(job,corpus,input);return send(202,{id:job.id});
  }
  if (route === '/map' && request.method === 'POST') {
   const input = await body(request), corpus = await corpusFor(input);
   if (!corpus.works.length) fail('No sources pass this filter. Try Inclusive Scholarly or a broader search.');
   let first = buildProjectGraph(corpus.works, [], input);
   if (input.members) {
    if (!Array.isArray(input.members) || input.members.length > 1500 || input.members.some(id => typeof id !== 'string')) fail('Invalid subcluster scope.');
    const allowed = new Set(input.members); first.nodes = first.nodes.filter(node => allowed.has(node.id)); first.links = first.links.filter(edge => allowed.has(edge.source) && allowed.has(edge.target));
   }
   const {metadata, coverage} = await scopeMetadata(corpus,input);
   let graph = buildProjectGraph(corpus.works, metadata, input); graph.sourceCorpusId = corpus.id;
   graph.deduplication.metadataCoverage=coverage;
   if(input.members){
    const aliases=deduplicateWorks(corpus.works,metadata).aliases,allowed=new Set(input.members.map(id=>aliases[id]||id));graph.nodes=graph.nodes.filter(node=>allowed.has(node.id));graph.links=graph.links.filter(edge=>allowed.has(edge.source)&&allowed.has(edge.target));
    const {partition,densityGrid}=await import('./auto-cpm.mjs');const resolution=input.resolution?Number(input.resolution):Math.max(.000001,densityGrid(graph).density/4);const result=partition(graph,resolution);
    const degree=new Map(graph.nodes.map(node=>[node.id,0]));for(const edge of graph.links)for(const id of[edge.source,edge.target])degree.set(id,degree.get(id)+1);
    for(const node of graph.nodes){node.cluster=result.memberships[node.id]||0;node.degree=degree.get(node.id);}graph.resolution=resolution;graph.clustering={...graph.clustering,resolution,quality:result.quality};
    graph.stats={nodes:graph.nodes.length,edges:graph.links.length,clusters:result.clusters,isolated_nodes:graph.nodes.filter(node=>!node.degree).length};graph.appliedSettings={settings:{label:'Within selected cluster · CPM '+Number(resolution.toPrecision(4))}};
   }
   if (!graph.nodes.length) fail('No cited references meet this minimum. Lower the reference citation minimum.');
   const artifact=await readGeneration(corpus.id,graph);
   if(artifact)graph=projectOrderGraph(graph,artifact,{order:input.order||2,maximumOrder:input.maximumOrder||artifact.maximumOrder,resolution:input.resolution});
   let themesReady=false;try{themesReady=!!JSON.parse(await readFile(path.join(corpusFolder(corpus.id),'themes.json'),'utf8')).documents;}catch{}
   const sourceSearch=corpus.search_id?await required('searches',corpus.search_id):null;
   graph.evidenceProvenance={evidenceId:corpus.id,retrievedAt:sourceSearch?.query?.completedAt||null,retrieval:sourceSearch?.query||{acquisition:'Pinned existing corpus',originalSearchSpecification:'Not recorded'},completeness:sourceSearch?.result_snapshot?.exhausted?'Recorded retrieval cursor exhausted; metadata completeness unknown.':'Bounded or unknown retrieval completeness.'};
   graph.scientificManifest=await createScientificManifest(graph,corpus.works,graph.evidenceProvenance);
   return send(200, {...await packet(corpus, graph, Object.fromEntries(metadata.map(work => [work.id, work.display_name])),metadata),generation:{maximumOrder:artifact?.maximumOrder||2,higherOrdersReady:!!artifact,themesReady}});
  }
  if (route === '/snapshots' && request.method === 'POST') {
   const input = await body(request); await required('projects', input.projectId);
   let snapshot = input.snapshot;
   let corpus = await required('corpora', input.corpusId || 'a67fdd5f-d449-4016-87fd-6b78e3e878fc');
   if(Object.hasOwn(input,'snapshotTransport')){
    if(corpus.project_id!==input.projectId&&input.copyEvidenceAcknowledged!==true)fail('The displayed study belongs to different evidence. Explicitly confirm copying that study before saving it in this project.',409);
    snapshot=await hydrateSnapshotTransport(snapshot,input.snapshotTransport,evidenceDataset(corpus.works,corpus.id,{},[],false).articles,{corpusId:corpus.id,evidenceId:corpus.id});
   }else assertPlainSnapshot(snapshot);
   if (!snapshot?.graph || !Array.isArray(snapshot.graph.nodes) || !Array.isArray(snapshot.graph.links) || !snapshot.controls || !snapshot.state) fail('A ready map is required to save a finding.');
   assertSnapshotCorpus(snapshot,corpus.id);
   if (corpus.project_id !== input.projectId) {
    if(input.copyEvidenceAcknowledged!==true)fail('The displayed study belongs to different evidence. Explicitly confirm copying that study before saving it in this project.',409);
    const sourceCorpusId=corpus.id;
    const name = 'Workspace copy · ' + corpus.id;
    const existing = (await store.list('corpora', input.projectId)).find(record => record.name === name);
    if (existing) corpus = await required('corpora', existing.id);
    else {
     const source = corpus.search_id ? await required('searches', corpus.search_id) : null;
     const search = source ? await store.create('searches', {project_id: input.projectId, name: source.name, query: {...source.query,imported:true,retrieved:source.result_snapshot.works.length}, result_snapshot: {sourceSearchId: source.id, works: [], total: source.result_count, retrieved: source.result_snapshot.works.length, imported: true, exhausted:source.query.retrieval==='cursor_exhaustion'||!!source.result_snapshot.exhausted}, result_count: source.result_count}) : null;
     if(search)await store.driver.executeQuery('MATCH (s:BMSearch {id:$id}) SET s.workspace_summary=$summary',{id:search.id,summary:JSON.stringify(search.query)},{database:store.database});
     corpus = await store.create('corpora', {project_id: input.projectId, search_id: search?.id, name, works: corpus.works, decisions: {...corpus.decisions, copiedFromCorpus: corpus.id}});
    }
    await copyGeneration(sourceCorpusId,corpus.id);
   }
   const search = corpus.search_id ? await required('searches', corpus.search_id) : null;
   rebindSnapshotCorpus(snapshot,corpus.id);
   snapshot.graph.scientificManifest = await createScientificManifest(snapshot.graph, corpus.works, {evidenceId: corpus.id, retrievedAt: search?.query?.completedAt || null, retrieval: search?.query || null, completeness: search?.result_snapshot?.exhausted === true ? 'Recorded retrieval cursor exhausted; matching does not establish metadata completeness.' : 'Retrieval completeness unknown or bounded.'});
   const analysis = await store.create('analyses', {project_id: input.projectId, corpus_id: corpus.id, name: String(input.name || 'Saved map').slice(0, 200), query: {...search?.query, sourceSearchId: search?.id}, parameters: {workspaceVersion: 1, method: workspaceNetworkMethod(snapshot.graph), historiography: snapshot.graph.historiography, clustering: snapshot.graph.clustering, order: snapshot.graph.order, threshold: snapshot.graph.threshold, minimumSupport: snapshot.graph.minimumSupport}, network: nativeNetwork(snapshot.graph), view_state: {snapshot, findings: String(input.findings || '').slice(0, 30000), originalCorpusId: input.corpusId || 'a67fdd5f-d449-4016-87fd-6b78e3e878fc'}});
   await store.driver.executeQuery('MATCH (a:BMAnalysis {id:$id}) SET a.workspace_version=1,a.workspace_summary=$summary', {id:analysis.id,summary:JSON.stringify({query:analysis.query,parameters:analysis.parameters,findings:analysis.view_state.findings,stats:snapshot.graph.stats})}, {database:store.database});
   return send(201, {id: analysis.id, name: analysis.name});
  }
  const snapshotMatch = /^\/snapshots\/([0-9a-f-]{36})$/.exec(route);
  if (snapshotMatch && request.method === 'GET') {
   const analysis = await required('analyses', snapshotMatch[1]);
   if (!analysis.view_state.snapshot) fail('This older analysis has no canvas snapshot.');
   if(!analysis.view_state.snapshot.graph.externalCorpus)return send(200,{analysis:{id:analysis.id,name:analysis.name,findings:analysis.view_state.findings,query:analysis.query},snapshot:analysis.view_state.snapshot,baseline:true,packet:null});
   const corpus = await required('corpora', analysis.corpus_id);
   const snapshot=analysis.view_state.snapshot,reference=snapshot.reference?.graph||snapshot.graph;
   let themesReady=false;try{themesReady=JSON.parse(await readFile(path.join(corpusFolder(corpus.id),'themes.json'),'utf8')).sourceCorpusId===corpus.id;}catch{}
   return send(200, {analysis: {id: analysis.id, name: analysis.name, findings: analysis.view_state.findings, query: analysis.query}, snapshot, baseline: false, packet: {...await packet(corpus,reference,Object.fromEntries(reference.nodes.map(node=>[node.id,node.title||node.label]))),generation:{maximumOrder:reference.higherOrderArtifact?.maximumOrder||2,higherOrdersReady:!!reference.higherOrderArtifact,themesReady}}});
  }
  return send(404, {error: 'Unknown workspace request.'});
 } catch (error) { send(error.status || 500, {error: error.status ? error.message : 'Project operation failed. Please retry.'}); console.error(error.message); }
}

const servicePort = Number(process.env.WORKSPACE_PROJECTS_PORT || 8094);
if (!Number.isInteger(servicePort) || servicePort < 1024 || servicePort > 65535) throw new Error('Invalid loopback workspace service port.');
http.createServer(workspaceRequest).listen(servicePort, '127.0.0.1', () => console.log('Workspace projects ready on localhost:' + servicePort));
