import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Authentication} from './auth.mjs';
import {error, digest} from './core.mjs';
import {evidenceDataset} from '../workspace-projects-core.mjs';

const root=fileURLToPath(new URL('../../public/conservative-atlas/',import.meta.url));
const uuid='[a-f0-9-]{36}',identifier='[a-f0-9-]{36}|[a-f0-9]{64}';
const neutral=()=>{
 const graphs={},configs={},scopes=[];
 for(const threshold of [10,20,30])for(const order of [2,'all']){
  const name=`cocitation_s${threshold}_${order===2?'n2':'all'}_cpm0_02`;scopes.push(name);
  graphs[name]={method:'cocitation',order,threshold,minimumSupport:5,resolution:.02,maximumOrder:2,bundles:[],nodes:[],links:[],clustering:{algorithm:'leiden'},stats:{nodes:0,edges:0,clusters:0,isolated_nodes:0},metric:{definition:'No evidence selected.'}};
  configs[`s${threshold}_${order===2?'n2':'cap2'}`]={version:3,autoResolution:.02,candidates:[{resolution:.02,memberships:{},clusters:0,quality:0,scale:1,seed:42}],recommendation:{status:'no_clear_recommendation',explanation:'Open a project and choose evidence.'},searchRange:[.02,.02],linkedNodes:0,density:0};
 }
 return 'window.ATLAS_DATA='+JSON.stringify({version:'empty-workspace',summary:{source_corpus_size:0,corpus_id:'00000000-0000-0000-0000-000000000000',coverage:{},analyses:[],limitations:[]},methods:{cocitation:{node:'cited work',plural:'cited works',size:'Citing sources',group:'Community',clustered:true,weight:'',caveat:'',title:'Co-citation',question:'Open a project to explore its evidence.',edge:'Co-citing sources',explanation:'',scopes,default:scopes[1]}},graphs,articles:[],references:{},bundlesByScope:{10:[],20:[],30:[]}})+';window.ATLAS_SETTINGS='+JSON.stringify({version:3,configs,bootstrapCount:0,method:'No evidence selected.',limitations:'',createdAt:null})+';';
};
export async function body(request,maximum=3000000){let length=0;const chunks=[];for await(const chunk of request){length+=chunk.length;if(length>maximum)throw error('Request is too large.',413);chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}catch{throw error('Invalid JSON request.');}}
export function createMultiuserServer({store,files,computations,config,authentication,research=computations?.researchIntegration,assetRoot=root}){
 const auth=authentication||new Authentication(store,config);
 const send=(response,status,value,type='application/json')=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});response.end(type==='application/json'?JSON.stringify(value):value);};
 async function current(user){if(!user.lastProjectId)return null;try{const workspace=await store.workspace(user.id,user.lastProjectId);return workspace.resultId?await computations.result(user.id,user.lastProjectId,workspace.resultId,[],workspace.display?.methodDisplay||{}):null;}catch(problem){if(problem.status===404)return null;throw problem;}}
 const server=http.createServer(async(request,response)=>{
  const url=new URL(request.url,config.origin),write=!['GET','HEAD'].includes(request.method);
  response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  try{
   if(url.pathname==='/health'){send(response,200,{ready:true,configured:config.configured});return;}
   if(request.headers.host!==new URL(config.origin).host)throw error('Public address does not match the configured origin.',400);
   if(await auth.handle(request,response,url))return;
   const researchRoute=/^\/conservative-atlas\/workspace-api\/projects\/([a-f0-9-]{36})\/research(?:\/(.*))?$/.exec(url.pathname);
   if(researchRoute){
    if(!config.configured)throw error('Institutional authentication is not configured.',503);
    if(!research)throw error('Optional independent research integration is not configured.',503);
    const projectId=researchRoute[1],suffix=researchRoute[2]||'capabilities',bearer=/^Bearer (.+)$/.exec(request.headers.authorization||'');
    const researchWrite=write&&!(request.method==='POST'&&suffix==='methods/preflight');
    let session,binding;
    if(bearer){if(suffix==='delegations'||suffix.startsWith('delegations/'))throw error('Issuing/revoking delegations requires the institutional browser session.',403);binding=await research.auth.bearer(bearer[1],projectId,researchWrite);if(binding.issuer!==config.issuer)throw error('Delegation issuer does not match configured institution.',401);}
    else{session=await auth.authenticate(request,write);binding=research.binding(session,projectId);await research.auth.authorize(binding,projectId,researchWrite&&!suffix.startsWith('delegations'));}
    if(researchWrite&&!await store.maintenance())throw error('Storage maintenance is in progress.',503);
    if(suffix==='delegations'&&request.method==='POST'){send(response,201,await research.auth.issue(session,projectId,await body(request)));return;}
    const delegation=/^delegations\/([a-f0-9]{64})$/.exec(suffix);
    if(delegation&&request.method==='DELETE'){await research.auth.revoke(binding,delegation[1]);send(response,200,{ok:true});return;}
    if(suffix==='capabilities'&&request.method==='GET'){send(response,200,await research.capabilities(binding));return;}
    if(suffix==='methods'&&request.method==='GET'){send(response,200,await research.methods.capabilities(binding));return;}
    if(suffix==='methods/preflight'&&request.method==='POST'){send(response,200,await research.methods.preflight(binding,await body(request,200000)));return;}
    if(suffix==='methods/jobs'&&request.method==='POST'){send(response,202,await research.methods.submit(binding,await body(request,200000)));return;}
    const methodResult=/^methods\/([a-f0-9]{64})$/.exec(suffix);
    if(methodResult&&request.method==='GET'){send(response,200,await research.methods.page(binding,methodResult[1],url.searchParams.get('section')||'summary',Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('limit')||25),Number(url.searchParams.get('run')||0),url.searchParams.has('layer')?Number(url.searchParams.get('layer')):null,url.searchParams.get('algorithm')));return;}
    if(suffix==='sessions'&&request.method==='GET'){send(response,200,await research.sessions.list(binding));return;}
    if(suffix==='sessions'&&request.method==='POST'){send(response,202,await research.sessions.submit(binding,'session_create',await body(request)));return;}
    const specialistRead=/^sessions\/([a-f0-9-]{36})\/specialists\/(specialist-[a-f0-9]{32})$/.exec(suffix);
    if(specialistRead&&request.method==='GET'){const excerptIds=url.searchParams.getAll('excerpt_id');send(response,200,await research.sessions.read(binding,'specialist_page',specialistRead[1],{specialist_id:specialistRead[2],...(excerptIds.length?{excerpt_ids:excerptIds,...(url.searchParams.has('source_id')?{source_id:url.searchParams.get('source_id')}:{}),...(url.searchParams.has('field')?{fields:url.searchParams.getAll('field')}:{})}:{source_id:url.searchParams.get('source_id'),fields:url.searchParams.getAll('field')})}));return;}
    const attachmentRead=/^sessions\/([a-f0-9-]{36})\/attachments\/(attachment-[a-f0-9]{32})$/.exec(suffix);
    if(attachmentRead&&request.method==='GET'){send(response,200,await research.sessions.read(binding,'attachment_page',attachmentRead[1],{attachment_id:attachmentRead[2],document:url.searchParams.get('document'),offset:Number(url.searchParams.get('offset')||0),max_bytes:Number(url.searchParams.get('max_bytes')||16000)}));return;}
    const saveResearch=/^sessions\/([a-f0-9-]{36})\/findings$/.exec(suffix);
    if(saveResearch&&request.method==='POST'){send(response,201,await research.sessions.saveFinding(binding,saveResearch[1],await body(request)));return;}
    const researchFinding=/^saved-findings\/([a-f0-9-]{36})$/.exec(suffix);
    if(researchFinding&&request.method==='GET'){send(response,200,await research.sessions.finding(binding,researchFinding[1]));return;}
    const researcher=/^sessions\/([a-f0-9-]{36})(?:\/(advance|cancel|pause|resume|retry|budget-extend|report))?$/.exec(suffix);
    if(researcher&&request.method==='GET'){send(response,200,await research.sessions.read(binding,researcher[2]==='report'?'session_report':'session_status',researcher[1],researcher[2]==='report'?{format:url.searchParams.get('format')||'accessible',offset:Number(url.searchParams.get('offset')||0),max_bytes:Number(url.searchParams.get('max_bytes')||16000)}:{offset:Number(url.searchParams.get('offset')||0),limit:Number(url.searchParams.get('limit')||10)}));return;}
    if(researcher&&request.method==='POST'&&['advance','cancel','pause','resume','retry','budget-extend'].includes(researcher[2])){send(response,202,await research.sessions.submit(binding,'session_'+researcher[2].replaceAll('-','_'),{...await body(request),sessionId:researcher[1]}));return;}
    const sourceOperation=/^sources\/(import-begin|import-chunk|import-extract)$/.exec(suffix);
    if(sourceOperation&&request.method==='POST'){send(response,202,await research.sessions.submit(binding,'source_'+sourceOperation[1].replaceAll('-','_'),await body(request,200000)));return;}
    const sourceRead=/^sources\/(source-[a-f0-9]{32})$/.exec(suffix);
    if(sourceRead&&request.method==='GET'){send(response,200,await research.sessions.read(binding,'source_page',null,{source_id:sourceRead[1],offset:Number(url.searchParams.get('offset')||0),limit:Number(url.searchParams.get('limit')||3)}));return;}
    if(suffix==='snapshot'&&request.method==='GET'){send(response,200,await research.snapshots.capabilities(binding));return;}
    if(suffix==='snapshot/history'&&request.method==='GET'){send(response,200,await research.snapshots.list(binding));return;}
    const snapshotMutation=/^snapshot\/(catalog|search|freeze)$/.exec(suffix);
    if(snapshotMutation&&request.method==='POST'){send(response,202,await research.snapshots.submit(binding,snapshotMutation[1],await body(request,200000)));return;}
    const snapshotText=/^snapshot\/([a-f0-9-]{36})\/text$/.exec(suffix);
    if(snapshotText&&request.method==='GET'){if([...url.searchParams.keys()].some(key=>!['offset','max_bytes'].includes(key)||url.searchParams.getAll(key).length!==1))throw error('Exact snapshot metadata byte page required.',422);send(response,200,await research.snapshots.text(binding,snapshotText[1],Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('max_bytes')||16000)));return;}
    const snapshotPage=/^snapshot\/([a-f0-9-]{36})$/.exec(suffix);
    if(snapshotPage&&request.method==='GET'){if([...url.searchParams.keys()].some(key=>!['offset','limit'].includes(key)||url.searchParams.getAll(key).length!==1))throw error('Exact bounded snapshot page required.',422);send(response,200,await research.snapshots.page(binding,snapshotPage[1],Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('limit')||25)));return;}
    if(suffix==='versions'&&request.method==='GET'){const allowed=['beforeEvidenceId','afterEvidenceId','section','offset','limit','workId'];if([...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1))throw error('Exact typed evidence-version query required.',422);send(response,200,await research.versions.page(binding,{beforeEvidenceId:url.searchParams.get('beforeEvidenceId'),afterEvidenceId:url.searchParams.get('afterEvidenceId'),section:url.searchParams.get('section')||'summary',offset:Number(url.searchParams.get('offset')||0),limit:Number(url.searchParams.get('limit')||25),...(url.searchParams.has('workId')?{workId:url.searchParams.get('workId')}:{})}));return;}
    if(suffix==='inventory'&&request.method==='GET'){send(response,200,await research.inventory(binding,url.searchParams.get('section')||'evidence',Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('limit')||25)));return;}
    if(suffix==='findings'&&request.method==='GET'){send(response,200,await research.findings(binding,Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('limit')||25)));return;}
    if(suffix==='findings'&&request.method==='POST'){send(response,201,await research.saveFinding(binding,await body(request)));return;}
    const evidence=/^evidence\/([a-f0-9-]{36}|[a-f0-9]{64})$/.exec(suffix);
    if(evidence&&request.method==='GET'){send(response,200,await research.evidence(binding,evidence[1],Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('limit')||100)));return;}
    if(suffix==='jobs'&&request.method==='POST'){send(response,202,await research.submit(binding,await body(request)));return;}
    const job=/^jobs\/([a-f0-9-]{36})(\/cancel)?$/.exec(suffix);
    if(job&&request.method==='GET'&&!job[2]){send(response,200,await research.status(binding,job[1]));return;}
    if(job&&request.method==='POST'&&job[2]){await body(request);send(response,200,await research.cancel(binding,job[1]));return;}
    const result=/^results\/([a-f0-9]{64})$/.exec(suffix);
    const artifact=/^results\/([a-f0-9]{64})\/artifacts\/(\d+)$/.exec(suffix);
    if(artifact&&request.method==='GET'){send(response,200,await research.artifactText(binding,artifact[1],Number(artifact[2]),Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('max_bytes')||16000)));return;}
    if(result&&request.method==='GET'){send(response,200,url.searchParams.has('section')?await research.resultPage(binding,result[1],url.searchParams.get('section'),Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('limit')||25)):await research.result(binding,result[1]));return;}
    if(suffix==='comparisons'&&request.method==='POST'){send(response,200,await research.compare(binding,await body(request)));return;}
    throw error('Unknown research operation.',404);
   }
   let session;
   try{session=await auth.authenticate(request,write);}catch(problem){
    if(problem.status===401&&request.method==='GET'&&(!url.pathname.includes('-api/')&&!url.pathname.startsWith('/api/'))){
     const destination='/auth/login?return='+encodeURIComponent(url.pathname+url.search);
     send(response,config.configured?401:503,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>BiblioMap · Sign in</title></head><body><main><h1>BiblioMap</h1><p>${config.configured?'Sign in with your invited institutional account.':'Institutional sign-in needs administrator configuration.'}</p>${config.configured?'<a href="'+destination.replaceAll('&','&amp;')+'">Sign in</a>':''}</main></body></html>`,'text/html; charset=utf-8');return;
    }throw problem;
   }
   const user=session.user,route=url.pathname.replace(/^\/conservative-atlas\/workspace-api/,'');
   if(write&&!await store.maintenance())throw error('Storage maintenance is in progress. Retry shortly.',503);
   if(url.pathname.startsWith('/conservative-atlas/workspace-api/')){
    if(route==='/projects'&&request.method==='GET'){send(response,200,{projects:await store.projects(user.id)});return;}
    if(route==='/projects'&&request.method==='POST'){const input=await body(request);send(response,201,await store.createProject(user.id,input.name));return;}
    const project=/^\/projects\/([a-f0-9-]{36})$/.exec(route);
    if(project){
     if(request.method==='GET'){const item=(await store.projects(user.id)).find(item=>item.id===project[1]);if(!item)throw error('Project not found.',404);send(response,200,{project:item,...await store.history(user.id,item.id),workspace:await store.workspace(user.id,item.id)});return;}
     if(request.method==='PATCH'){send(response,200,await store.editProject(user.id,project[1],await body(request)));return;}
     if(request.method==='DELETE'){await store.deleteProject(user.id,project[1]);send(response,200,{ok:true});return;}
    }
    const member=new RegExp(`^/projects/(${uuid})/members(?:/([a-f0-9]{64}))?$`).exec(route);
    if(member){
     if(request.method==='GET'){send(response,200,{members:await store.members(user.id,member[1])});return;}
     if(request.method==='PATCH'&&member[2]){const input=await body(request);await store.changeMember(user.id,member[1],member[2],input.role);send(response,200,{ok:true});return;}
     if(request.method==='POST'&&!member[2]){const input=await body(request),secret=await store.invite(user.id,member[1],input.email,input.role,config.issuer);send(response,201,{url:config.origin+'/auth/login?invite='+secret,expiresInDays:7});return;}
    }
    const workspace=new RegExp(`^/projects/(${uuid})/workspace$`).exec(route);
    if(workspace){if(request.method==='GET'){send(response,200,await store.workspace(user.id,workspace[1]));return;}if(request.method==='PATCH'){const input=await body(request);send(response,200,await store.saveWorkspace(user.id,workspace[1],input.revision,input.state||{}));return;}}
    const screening=new RegExp(`^/projects/(${uuid})/screening$`).exec(route);
    if(screening){if(request.method==='GET'){send(response,200,await store.screening(user.id,screening[1]));return;}if(request.method==='POST'){send(response,201,await computations.screen(user.id,screening[1],await body(request)));return;}}
    const evidence=new RegExp(`^/projects/(${uuid})/evidence/(${identifier})$`).exec(route);
    if(evidence&&request.method==='GET'){const item=await store.evidence(user.id,evidence[1],evidence[2]);send(response,200,{id:item.id,...JSON.parse(item.details),snapshot:await files.get(item.artifact.checksum)});return;}
    const compute=new RegExp(`^/projects/(${uuid})/computations$`).exec(route);
    if(compute&&request.method==='POST'){const input=await body(request);send(response,202,input.resultId?await computations.derive(user.id,compute[1],input.resultId,input.stage,input.settings,!!input.force):await computations.analysis(user.id,compute[1],input.evidenceId,input.settings,!!input.force));return;}
    const result=new RegExp(`^/projects/(${uuid})/results/(${identifier})(/export)?$`).exec(route);
    if(result&&request.method==='GET'){const ids=url.searchParams.getAll('attachment'),value=await computations.result(user.id,result[1],result[2],ids,{run:Number(url.searchParams.get('methodRun')||0),layer:Number(url.searchParams.get('methodLayer')||0)});if(result[3])response.setHeader('Content-Disposition','attachment; filename="bibliomap-analysis.json"');send(response,200,value);return;}
    if(route==='/search'&&request.method==='POST'){const input=await body(request);send(response,202,await computations.search(user.id,input.projectId,input));return;}
    if(route==='/refresh'&&request.method==='POST'){const input=await body(request),item=await store.evidence(user.id,input.projectId,input.evidenceId),snapshot=await files.get(item.artifact.checksum);if(!snapshot.specification)throw error('This imported evidence cannot be refreshed through OpenAlex.');send(response,202,await computations.search(user.id,input.projectId,snapshot.specification,true));return;}
    const job=new RegExp(`^/jobs/(${uuid})(/cancel)?$`).exec(route);
    if(job){if(job[2]&&request.method==='POST'){await store.cancel(user.id,job[1]);send(response,200,{status:'cancelled'});return;}if(request.method==='GET'){send(response,200,await computations.status(user.id,job[1]));return;}}
    if(route==='/snapshots'&&request.method==='POST'){const input=await body(request);if(Object.hasOwn(input,'snapshotTransport')||Object.hasOwn(input,'snapshot'))throw error('Legacy pinned-source snapshot transport is not accepted here. Save a completed authorized project result instead.',422);send(response,201,await store.saveFinding(user.id,input.projectId,input));return;}
    const finding=new RegExp(`^/snapshots/(${uuid})$`).exec(route);
    if(finding&&request.method==='GET'){
     const analysis=await store.legacy.get('analyses',finding[1]);if(!analysis)throw error('Finding not found.',404);await store.gate(user.id,analysis.project_id);
     if(analysis.view_state.resultId){send(response,200,{analysis,packet:await computations.result(user.id,analysis.project_id,analysis.view_state.resultId,analysis.view_state.attachmentIds||[],analysis.view_state.display?.methodDisplay||{}),display:analysis.view_state.display});return;}
     const snapshot=analysis.view_state.snapshot;if(!snapshot)throw error('Legacy finding has no canvas snapshot.',422);const corpus=analysis.corpus_id?await store.legacy.get('corpora',analysis.corpus_id):null;
     send(response,200,{analysis,legacy:true,snapshot,packet:corpus?{projectId:analysis.project_id,corpusId:corpus.id,graph:snapshot.reference?.graph||snapshot.graph,evidence:evidenceDataset(corpus.works,corpus.id,{},[],false)}:null});return;
    }
    if(route==='/map'&&request.method==='POST'){const input=await body(request);send(response,202,await computations.analysis(user.id,input.projectId,input.evidenceId,input.settings||input,!!input.force));return;}
    if(route==='/generate'&&request.method==='POST'){const input=await body(request);send(response,202,await computations.derive(user.id,input.projectId,input.resultId,input.stage||'keywords',{},!!input.force));return;}
    const themes=new RegExp(`^/corpora/(${uuid})/themes$`).exec(route);
    if(themes&&request.method==='GET'){
     await store.gate(user.id,themes[1]);const workspace=await store.workspace(user.id,themes[1]);if(!workspace.keywordsId)throw error('Generate keywords first.',404);
     const keywords=await store.result(user.id,themes[1],workspace.keywordsId),selected=await store.result(user.id,themes[1],url.searchParams.get('result')||workspace.resultId),keywordData=await files.get(keywords.artifact.checksum),selectedData=await files.get(selected.artifact.checksum);
     if(keywordData.operation!=='keywords'||keywordData.textVersion!==selectedData.textVersion||keywordData.evidenceChecksum!==selectedData.evidenceChecksum)throw error('Generate keywords for this evidence version and scope.',404);
     send(response,200,{...keywordData.value,sourceCorpusId:themes[1]});return;
    }
    throw error('Unsupported workspace request.',404);
   }
   if(url.pathname.startsWith('/api/')){
    const match=/^\/api\/(projects|searches|corpora|analyses)(?:\/([a-f0-9-]{36}))?$/.exec(url.pathname);if(!match)throw error('Use the authenticated project computation API.',410);
    const [,kind,id]=match;
    if(kind==='projects'&&request.method==='GET'){const available=await store.projects(user.id),project=id?available.find(item=>item.id===id):null;if(id&&!project)throw error('Project not found.',404);send(response,200,id?{project}:{projects:available});return;}
    if(request.method==='GET'&&id){const item=await store.legacy.get(kind,id);if(!item)throw error('Record not found.',404);await store.gate(user.id,item.project_id);send(response,200,item);return;}
    if(request.method==='GET'&&!id){const projectId=url.searchParams.get('project_id');await store.gate(user.id,projectId);send(response,200,{[kind]:await store.legacy.list(kind,projectId)});return;}
    throw error('Use the project API to version data and save findings.',410);
   }
   if(url.pathname.includes('/analysis-api/'))throw error('Use a project-scoped computation request.',410);
   if(!['GET','HEAD'].includes(request.method))throw error('Method not allowed.',405);
   if(!url.pathname.startsWith('/conservative-atlas/'))throw error('Not found.',404);
   let filename=decodeURIComponent(url.pathname.slice('/conservative-atlas/'.length));
   if(!filename||filename==='index.html'||/^projects(?:\/|$)|^map(?:\/|$)/.test(filename))filename='index.html';
   if(filename==='data.js'){send(response,200,neutral(),'application/javascript');return;}
   if(filename==='settings-data.js'){send(response,200,'','application/javascript');return;}
   if(filename==='multiuser-bootstrap.js'){send(response,200,'window.BIBLIOMAP_MULTIUSER=true;','application/javascript');return;}
   if(filename==='source-evidence.json'){const active=await current(user);send(response,200,active?.evidence||{articles:[],referenceLabels:{},sourceCorpusId:null});return;}
   if(filename==='expanded-data.json'){const active=await current(user);send(response,200,{sourceCorpusId:active?.projectId,base:active?.graph||{nodes:[],links:[]},bundles:active?.graph.bundles||[]});return;}
   if(filename==='cluster-themes.json'||filename==='source-cluster-themes.json'){throw error('Open project keywords through the project API.',404);}
   if(filename==='workspace-projects.js')filename='multiuser-workspace.js';
   if(!/^[a-z0-9-]+\.(?:js|css)$/.test(filename)&&filename!=='index.html'&&!['INFOMAP-LICENSE.txt','THREE-LICENSE.txt'].includes(filename))throw error('Not found.',404);
   const location=await realpath(path.join(assetRoot,filename));if(path.dirname(location)!==await realpath(assetRoot))throw error('Not found.',404);
   let content=await readFile(location);if(filename==='index.html')content=Buffer.from(content.toString().replace('<script src="workspace-startup.js?v=1"></script>','<script src="multiuser-bootstrap.js"></script><script src="multiuser-client.js"></script><script src="workspace-startup.js?v=1"></script>').replaceAll('2,855','0').replaceAll('Adaptive Leadership','Projects'));
   send(response,200,request.method==='HEAD'?'':content,filename.endsWith('.css')?'text/css':filename.endsWith('.js')?'application/javascript':filename.endsWith('.txt')?'text/plain':'text/html; charset=utf-8');
  }catch(problem){if(response.writableEnded||response.destroyed)return;const status=problem.status||(['ENOENT','ENOTDIR'].includes(problem.code)?404:500);if(status===500)console.error(problem);send(response,status,{error:problem.status?problem.message:status===404?'Not found.':'Operation failed. Existing results remain available.'});}
 });return server;
}
