(() => {
 'use strict';
const errorMessage = problem => window.ATLAS_EVIDENCE?.errorMessage?.(problem) || (typeof problem?.message === 'string' && !['', 'undefined', 'null'].includes(problem.message.trim()) ? problem.message : 'The request failed. Reload and retry.');
 const element=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;return node;};
 function previewRecordLinks(work){
  const links=[],id=typeof work.id==='string'?work.id.trim():'',match=id.match(/^(?:https?:\/\/openalex\.org\/)?(W[1-9]\d*)$/i);
  if(match)links.push({kind:'id',label:'OpenAlex: '+match[1].toUpperCase(),href:'https://openalex.org/'+match[1].toUpperCase()});
  if(typeof work.doi==='string'){
   let doi=work.doi.trim();
   if(/^https?:\/\//i.test(doi)){try{const url=new URL(doi);if(!['doi.org','dx.doi.org'].includes(url.hostname.toLowerCase())||url.username||url.password||url.port||url.search||url.hash)return links;doi=decodeURIComponent(url.pathname.slice(1));}catch{return links;}}
   if(/^10\.\d{4,9}\/[^\u0000-\u0020\u007f<>"\\]+$/i.test(doi))links.push({kind:'doi',label:'DOI: '+doi,href:'https://doi.org/'+doi.split('/').map(part=>encodeURIComponent(part)).join('/')});
  }
  return links;
 }
 function previewArticle(work){
  const row=element('p',work.title+(work.year?' ('+work.year+')':'')),links=previewRecordLinks(work);
  for(const kind of ['id','doi']){const link=links.find(item=>item.kind===kind),raw=work[kind];if(link){const anchor=element('a',link.label);anchor.href=link.href;anchor.target='_blank';anchor.rel='noopener noreferrer';row.append(document.createTextNode(' · '),anchor);}else if(typeof raw==='string'&&raw.trim())row.append(document.createTextNode(' · '+(kind==='id'?'Record ID: ':'DOI: ')+raw));}
  return row;
 }
 const button=(text,action)=>{const node=element('button',text,'secondary');node.type='button';node.onclick=()=>action().catch(error=>message(errorMessage(error)));return node;};
 const field=(parent,title,type='text',value='')=>{const label=element('label',title),input=element(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;input.setAttribute('aria-label',title);label.append(input);parent.append(label);return input;};
 const panel=window.atlasWorkspaceShell.addTool('projects','Projects');panel.classList.add('project-tools');
 const status=element('p','','project-status');status.setAttribute('role','status');panel.append(status);
 const message=text=>{status.textContent=text;};
 const section=title=>{const node=element('section','','project-section');node.append(element('h3',title));panel.append(node);return node;};
 let project=null,selectedSearch=null,packet=null,jobId=null,working=false,buildGeneration=0,projectGeneration=0,drillMembers=null,generationJobId=null;
 const originalSnapshot=structuredClone(window.atlasSharedCanvas.captureProject());
 const api=async(route,method='GET',body)=>{
  const response=await fetch('workspace-api'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body,(key,value)=>value instanceof Set?[...value]:value):undefined});
  let result;try{result=await response.json();}catch{throw Error('Project service returned an incomplete response. Retry shortly.');}
  if(!response.ok)throw Error(result.error||'Project request failed.');return result;
 };
 const projects=section('Project'),projectLabel=element('label','Open project'),projectSelect=element('select');projectSelect.setAttribute('aria-label','Open project');projectLabel.append(projectSelect);projects.append(projectLabel);
 const projectName=field(projects,'Project name');projectName.maxLength=200;
 const create=button('Create project',async()=>{if(!projectName.value.trim())throw Error('Enter a project name.');const next=await api('/projects','POST',{name:projectName.value});await refreshProjects(next.id);await openProject(next.id);minimum.value=10;support.value=5;resolution.value='';preset.value='conservative';prepare.checked=true;connection.value='2';drillMembers=null;message('Project created · Conservative corpus · reference citations ≥10 · joint citations ≥5.');});projects.append(create);
 projects.append(button('Rename project',async()=>{if(!project)throw Error('Open a project first.');if(!projectName.value.trim())throw Error('Enter a project name.');project=await api('/projects/'+project.id,'PATCH',{name:projectName.value.trim()});await refreshProjects();updateProjectContext();message('Project renamed.');}));
 const finding=section('Save a finding'),findingName=field(finding,'Finding name','text','Research map'),notes=field(finding,'Findings & notes','textarea');notes.rows=3;notes.maxLength=30000;
 const canvasNotice=element('p','','canvas-evidence-notice');canvasNotice.id='canvasEvidenceNotice';finding.prepend(canvasNotice);
 const copyLabel=element('label','','project-checkbox'),copyDisplayed=element('input');copyDisplayed.type='checkbox';copyDisplayed.setAttribute('aria-label','Confirm copying the displayed study');copyLabel.append(copyDisplayed,document.createTextNode('Save the displayed study, not the selected search (copy its evidence).'));finding.append(copyLabel);
 const mismatchedCanvas=()=>!!project&&(!packet||packet.projectId!==project.id||selectedSearch&&selectedSearch.id!==packet.searchId);
 const save=button('Save current map',async()=>{
  if(working||jobId)throw Error('Wait for the current operation to finish before saving.');
  if(!project)throw Error('Create or open a project first.');
  if(mismatchedCanvas()&&!copyDisplayed.checked)throw Error('The canvas still shows a different study. Open the selected search map, or explicitly confirm copying the displayed study.');
  const projectId=project.id,findings=notes.value;
  working=true;save.disabled=true;message('Saving map, settings and findings…');
  try{
   const captured=window.atlasSharedCanvas.captureProject(),transport=await window.ATLAS_EVIDENCE.compactSnapshotTransport(captured,packet?.evidence.articles||[],packet?.snapshotSources);
   const request={projectId,corpusId:packet?.corpusId,copyEvidenceAcknowledged:copyDisplayed.checked,name:findingName.value,findings,...transport};if(new TextEncoder().encode(JSON.stringify(request)).length>30000000)throw Error(packet?.snapshotSources?'This lossless snapshot still exceeds the existing 30 MB save limit. No sources or fields were dropped.':'This map exceeds the existing 30 MB save limit. Reopen its saved study to load pinned source checksums, then retry saving.');
   const saved=await api('/snapshots','POST',request);
   await api('/projects/'+projectId,'PATCH',{description:findings});if(project?.id===projectId)await openProject(projectId,false);window.dispatchEvent(new CustomEvent('atlas:map-saved',{detail:{projectId,mapId:saved.id}}));message('Saved “'+saved.name+'”.');
  }finally{working=false;save.disabled=false;}
 });finding.append(save);
 const searchSection=section('Search OpenAlex'),form=element('form');searchSection.append(form);
 const terms=field(form,'Search terms','search','adaptive leadership');terms.required=true;terms.maxLength=500;
 const phraseLabel=element('label','', 'project-checkbox'),phrase=element('input');phrase.type='checkbox';phrase.checked=true;phraseLabel.append(phrase,document.createTextNode('Exact phrase'));form.append(phraseLabel);
 const limits=element('div','','project-field-grid');form.append(limits);
 const limit=field(limits,'Maximum results','number','500');limit.min=1;limit.max=20000;limit.step=1;
 const from=field(limits,'From year','number');from.min=1500;from.max=2100;
 const through=field(limits,'Through year','number');through.min=1500;through.max=2100;
 const run=element('button','Search & save','secondary');run.type='submit';
 const cancel=button('Cancel search',async()=>{if(jobId)await api('/jobs/'+jobId+'/cancel','POST',{});});cancel.hidden=true;form.append(run,cancel);
 const searchHelp=element('details');searchHelp.append(element('summary','Search scope'),element('p','Searches OpenAlex titles, abstracts and indexed full text. Exact phrase adds quotation marks. Articles, reviews, book chapters and conference papers are retrieved. The selected metadata filter is applied when building a map. A capped download is a partial search result.'));form.append(searchHelp);
 const history=section('Search history'),savedMaps=section('Saved findings');
 const researchReports=section('Reports & supporting files');researchReports.id='projectResearchReports';researchReports.hidden=true;
 const preview=section('Selected search'),previewInfo=element('p'),examples=element('details');examples.append(element('summary','Preview articles'));preview.append(previewInfo,examples);preview.hidden=true;
 const exportSources=button('Export retrieved sources',async()=>{
  if(window.BIBLIOMAP?.active)throw Error('Use the authenticated evidence export for this workspace. Legacy search export is unavailable here.');
  const searchId=selectedSearch?.id;if(!searchId||!project||selectedSearch.project_id!==project.id)throw Error('Open a saved search in this project first.');
  exportSources.disabled=true;message('Preparing all stored retrieved sources, before corpus filters…');
  try{const response=await fetch('workspace-api/searches/'+encodeURIComponent(searchId)+'/export');if(!response.ok){let problem;try{problem=await response.json();}catch{}throw Error(problem?.error||'Retrieved source export failed.');}const url=URL.createObjectURL(await response.blob()),link=element('a');link.href=url;link.download='bibliomap-retrieved-sources-'+searchId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Downloaded the selected search’s stored sources and retrieval audit. No corpus filters or new retrieval were applied.');}finally{exportSources.disabled=false;}
 });preview.append(exportSources,element('p','Exports all stored source records for this search, before metadata presets or DOI/title cleanup. This is separate from exporting the displayed map.'));
 const filterLabel=element('label','Corpus filter'),preset=element('select');preset.setAttribute('aria-label','Corpus filter');for(const [value,label]of[['conservative','Conservative'],['balanced','Balanced Core'],['inclusive','Inclusive Scholarly']])preset.append(new Option(label,value));filterLabel.append(preset);preview.append(filterLabel);
 const prepareLabel=element('label','','project-checkbox'),prepare=element('input');prepare.type='checkbox';prepare.checked=true;prepareLabel.append(prepare,document.createTextNode('Prepare higher orders, keywords & Qwen names'));preview.append(prepareLabel);
 const build=button('Open co-citation map',async()=>{drillMembers=null;return buildMap({searchId:selectedSearch.id,preset:preset.value});});preview.append(build,element('p','Filters check scholarly metadata; topical relevance needs review.'));
 const baseline=button('Return to adaptive leadership map',async()=>{if(working)throw Error('Wait for generation to finish, or cancel it first.');window.ATLAS_STARTUP_NAVIGATION?.baseline();buildGeneration++;packet=null;selectedSearch=null;window.atlasSharedCanvas.installCorpus(null);restoreSnapshot(structuredClone(originalSnapshot));updateProjectContext();message('Original adaptive leadership map restored.');});panel.append(baseline);
 const controls=element('section','','project-section');controls.id='projectNetworkControls';controls.hidden=true;controls.append(element('h3','Search network'));
 const referenceControls=element('div');referenceControls.id='projectReferenceControls';controls.append(referenceControls);
 const grid=element('div','','project-field-grid');referenceControls.append(grid);
 const minimum=field(grid,'Reference citations ≥','number','10'),support=field(grid,'Joint citations ≥','number','5'),resolution=field(referenceControls,'CPM (blank = density start)','number');
 for(const input of[minimum,support]){input.min=1;input.max=1000;input.step=1;}resolution.min=.000001;resolution.max=100;resolution.step='any';
 const connectionLabel=element('label','Connections'),connection=element('select');connection.setAttribute('aria-label','Project connections');for(const[value,label]of[['2','Pairwise'],['single','Single higher order'],['all','Combined orders']])connection.append(new Option(label,value));connectionLabel.append(connection);referenceControls.append(connectionLabel);
 const selectedOrder=field(referenceControls,'Selected higher order','range','3'),maximumOrder=field(referenceControls,'Maximum combined order','range','2');selectedOrder.min=3;selectedOrder.max=3;maximumOrder.min=2;maximumOrder.max=2;
 const orderValue=element('p');referenceControls.append(orderValue);
 const rebuild=button('Rebuild network',async()=>window.ATLAS_PROJECTS.rebuild());
 const parent=button('Return to full search network',async()=>{drillMembers=null;return window.ATLAS_PROJECTS.rebuild();});parent.hidden=true;
 referenceControls.append(rebuild,parent);
 const generationStatus=element('p');generationStatus.setAttribute('role','status');
 const generate=button('Generate full analysis',async()=>generateAnalysis(false)),regenerate=button('Rerun generation',async()=>generateAnalysis(true)),cancelGeneration=button('Cancel generation',async()=>{if(generationJobId)await api('/jobs/'+generationJobId+'/cancel','POST',{});});cancelGeneration.hidden=true;
 controls.append(generate,regenerate,cancelGeneration,generationStatus);
 document.querySelector('#analysisPanel .shell-panel-body').prepend(controls);

 async function refreshProjects(selected=project?.id){const result=await api('/projects');projectSelect.replaceChildren(new Option('Choose a project…',''),...result.projects.map(item=>new Option(item.name,item.id)));projectSelect.value=selected||'';}
 async function openProject(id,resetNotes=true){
  const ticket=++projectGeneration;window.dispatchEvent(new CustomEvent('atlas:project-opening',{detail:{projectId:id}}));save.disabled=true;run.disabled=true;notes.disabled=true;if(resetNotes)message('Opening project…');
  let result;try{result=await api('/projects/'+id);}finally{if(ticket===projectGeneration){save.disabled=working;run.disabled=!!jobId;notes.disabled=false;}}
  if(ticket!==projectGeneration)return;
  if(project?.id!==id){selectedSearch=null;preview.hidden=true;copyDisplayed.checked=false;}project=result.project;projectSelect.value=id;projectName.value=project.name;if(resetNotes)notes.value=project.description||'';
  localStorage.setItem('bibliomap.project',id);history.replaceChildren(element('h3','Search history'));
  for(const search of result.searches){const row=element('div','','project-record');row.append(button(search.name,async()=>openSearch(search.id)),element('small',((search.query.retrieved??search.query.limit)||search.result_count).toLocaleString()+' retrieved'+(search.query.cleanup?' · '+search.query.cleanup.cleanedSources.toLocaleString()+' after cleanup':'')+' · '+new Date(search.query.searchedAt||search.created_at).toLocaleDateString()));history.append(row);}
  if(!result.searches.length)history.append(element('p','No saved searches yet.'));
  savedMaps.replaceChildren(element('h3','Saved findings'));
  for(const saved of result.analyses.filter(item=>item.parameters.workspaceVersion===1)){const row=element('div','','project-record');row.append(button(saved.name,async()=>openSnapshot(saved.id)),element('small',new Date(saved.created_at).toLocaleString()+(saved.stats?' · '+saved.stats.clusters+' clusters':'')));if(saved.findings)row.append(element('p',saved.findings.length>180?saved.findings.slice(0,180)+'…':saved.findings));savedMaps.append(row);}
  if(savedMaps.children.length===1)savedMaps.append(element('p','Save a map to record its settings and findings.'));
  updateProjectContext();
  if(resetNotes)message(mismatchedCanvas()?'Project selected. The canvas still shows the previous study; open a search map to replace it.':'Project and displayed study ready.');
  window.dispatchEvent(new CustomEvent(resetNotes?'atlas:project-opened':'atlas:project-reports-ready',{detail:{projectId:id}}));
  return result;
 }
 async function openSearch(id){
  selectedSearch=await api('/searches/'+id);const query=selectedSearch.query;
  copyDisplayed.checked=false;
  const rawTerms=query.query||query.terms||'',legacyPhrase=query.phrase==null&&/^".*"$/.test(rawTerms);
  terms.value=legacyPhrase?rawTerms.slice(1,-1):rawTerms;phrase.checked=!!query.phrase||legacyPhrase;limit.value=query.limit||500;from.value=query.from||'';through.value=query.through||'';
  const snapshot=selectedSearch.result_snapshot;preview.hidden=false;
  previewInfo.textContent=(query.terms||query.query||selectedSearch.name)+' · '+snapshot.retrieved.toLocaleString()+' retrieved / '+snapshot.total.toLocaleString()+' matches'+(snapshot.exhausted?' · complete':' · partial')+'.';
  if(selectedSearch.cleanup){const cleanup=selectedSearch.cleanup;previewInfo.textContent+=' '+cleanup.cleanedSources.toLocaleString()+' after cleanup · '+cleanup.sourceDuplicateGroups+' duplicate source groups · '+cleanup.referenceDuplicateGroups+' combined reference groups. Originals retained.';previewInfo.title=cleanup.limitation;}
  examples.replaceChildren(element('summary','Preview articles'));for(const work of snapshot.examples)examples.append(previewArticle(work));
  build.disabled=!!query.imported||(!snapshot.examples.length&&snapshot.retrieved>0);
  if(build.disabled)previewInfo.textContent+=' Original search is linked through its saved map.';
  message('Search loaded. Choose a corpus filter, then open its map.');
  updateProjectContext();
 }
 async function buildMap(options){
  if(working)throw Error('A map operation is already running.');
  const ticket=++buildGeneration,algorithm=document.getElementById('clusteringMethod').value,selectedModel=document.getElementById('networkModel').value,hypergraphSearch=algorithm==='hypergraph'?(document.getElementById('clusteringSearch')?.value||'mixed'):undefined;
  if(algorithm==='hypergraph'&&!['mixed','leiden-seeded','group-moves','annealing'].includes(hypergraphSearch))throw Error('Choose a supported direct hypergraph search.');
  working=true;window.atlasSharedCanvas.refreshAnalysisControls?.();build.disabled=true;rebuild.disabled=true;document.getElementById('workspace-coupling').disabled=true;message('Building co-citation map and retrieving reference titles…');
  document.getElementById('analysisNote').textContent='Preparing project map…';window.ATLAS_EVIDENCE.cancelCanvasReliability();
  try{
   let next=await api('/map','POST',{...options,threshold:+minimum.value,support:+support.value,resolution:resolution.value,members:drillMembers,order:connection.value==='single'?+selectedOrder.value:connection.value,maximumOrder:+maximumOrder.value});
   if(ticket!==buildGeneration)return;
   const networkModel=algorithm==='hypergraph'||selectedModel==='hypergraph'?'hypergraph':next.graph.order===2?'pairwise':'higher-order';next.graph.networkModel=networkModel;
   if(algorithm!=='leiden'||networkModel==='hypergraph'){
    await window.ATLAS_EVIDENCE.loadCommunities();
    const community=window.ATLAS_COMMUNITIES.start(next.graph,algorithm,next.graph.bundles||[],message,{networkModel,...(algorithm==='hypergraph'?{hypergraphSearch}:{})});next.graph=await community.promise;
    next.graph.appliedSettings={settings:{label:next.graph.clustering.label}};
   }
   if(ticket!==buildGeneration)return;
   packet=next;next.graph.projectDrillMembers=drillMembers;parent.hidden=!drillMembers;window.atlasSharedCanvas.installCorpus(next);minimum.value=next.graph.threshold;support.value=next.graph.minimumSupport;updateOrderControls();updateProjectContext();window.atlasWorkspaceShell.show('analysis');
   const counts=next.counts;message(next.evidence.articles.length+' sources · '+next.graph.nodes.length+' cited works · '+next.graph.stats.clusters+' clusters.'+(counts?' '+counts.unknown+' uncertain; '+counts.excluded+' excluded by metadata.':''));
  }finally{working=false;build.disabled=false;rebuild.disabled=false;document.getElementById('workspace-coupling').disabled=false;window.atlasSharedCanvas.refreshAnalysisControls?.();}
  if(options.searchId&&prepare.checked)await generateAnalysis(false);
 }
 function updateOrderControls(){
  const maximum=packet?.generation?.maximumOrder||packet?.graph.higherOrderArtifact?.maximumOrder||2;
  for(const option of connection.options)option.disabled=option.value!=='2'&&maximum<3;
  if(maximum<3)connection.value='2';
  selectedOrder.max=Math.max(3,maximum);maximumOrder.max=maximum;selectedOrder.value=Math.min(+selectedOrder.value,maximum);maximumOrder.value=packet?.graph.maximumOrder||maximum;
  selectedOrder.parentElement.hidden=connection.value!=='single';maximumOrder.parentElement.hidden=connection.value!=='all';
  orderValue.textContent=maximum>2?'Available through '+maximum+'-way · '+(connection.value==='single'?selectedOrder.value+'-way':connection.value==='all'?'combined 2–'+maximumOrder.value:'pairwise'):(packet?.generation?.higherOrdersReady?'No supported triples at these minimums.':'Generate analysis to discover supported higher orders.');
 }
 connection.onchange=()=>{updateOrderControls();window.ATLAS_PROJECTS.rebuild();};for(const input of[selectedOrder,maximumOrder]){input.oninput=()=>{orderValue.textContent=input===selectedOrder?input.value+'-way':'Combined 2–'+input.value;};input.onchange=()=>window.ATLAS_PROJECTS.rebuild();}
 async function generateAnalysis(force){
  if(!packet)throw Error('Open a project search map first.');if(working)throw Error('Wait for the current operation to finish.');
  const locked=new Map([...referenceControls.querySelectorAll('input,select,button'),save,run,build,projectSelect,document.getElementById('clusteringMethod')].map(control=>[control,control.disabled]));for(const control of locked.keys())control.disabled=true;
  const target=packet.corpusId;working=true;window.atlasSharedCanvas.refreshAnalysisControls?.();generate.disabled=regenerate.disabled=true;cancelGeneration.hidden=false;cancelGeneration.disabled=true;generationStatus.textContent='Starting analysis generation…';
  try{
   const job=await api('/generate','POST',{corpusId:target,threshold:+minimum.value,support:+support.value,members:drillMembers,force});generationJobId=job.id;cancelGeneration.disabled=false;
   let result;
   while(generationJobId){result=await api('/jobs/'+generationJobId);generationStatus.textContent=result.message||result.error||'Generating…';document.getElementById('analysisNote').textContent='Preparing analysis: '+generationStatus.textContent;if(['complete','failed','cancelled'].includes(result.status))break;await new Promise(resolve=>setTimeout(resolve,1000));}
   if(result.status!=='complete')throw Error(result.error||'Generation did not complete.');
   if(packet?.corpusId!==target)return;
   packet.generation=result.result;working=false;generationJobId=null;
   if(!window.atlasSharedCanvas.isCoupling()){if(result.result.maximumOrder>2){connection.value='all';maximumOrder.max=result.result.maximumOrder;maximumOrder.value=result.result.maximumOrder;}await buildMap({corpusId:target});}
   working=true;window.atlasSharedCanvas.refreshAnalysisControls?.();await window.atlasSharedCanvas.reloadThemes();if(force)window.ATLAS_DESCRIPTIONS.rerunAll();
   generationStatus.textContent='Higher orders and keywords saved. Qwen descriptions generate below the cluster strip; save a finding to bookmark this view.';updateOrderControls();
  }catch(error){generationStatus.textContent=errorMessage(error);message(errorMessage(error));document.getElementById('analysisNote').textContent='Analysis generation: '+errorMessage(error);}
  finally{working=false;generationJobId=null;for(const[control,disabled]of locked)control.disabled=disabled;generate.disabled=regenerate.disabled=false;cancelGeneration.hidden=true;window.atlasSharedCanvas.refreshAnalysisControls?.();}
 }
 function restoreSnapshot(snapshot){
  window.atlasSharedCanvas.restore(snapshot);window.atlasWorkspaceShell.refresh();
 }
 async function openSnapshot(id){
  if(working||jobId)throw Error('Wait for the current operation to finish.');
  message('Opening saved map…');const saved=await api('/snapshots/'+id);buildGeneration++;
  const nextPacket=saved.baseline?null:{...saved.packet,graph:saved.snapshot.reference?.graph||saved.snapshot.graph};
  await window.atlasSharedCanvas.installSavedSnapshot(nextPacket,saved.snapshot);packet=nextPacket;drillMembers=saved.snapshot.graph.projectDrillMembers||null;parent.hidden=!drillMembers;window.atlasWorkspaceShell.refresh();
  findingName.value=saved.analysis.name;notes.value=saved.analysis.findings||'';if(packet){minimum.value=packet.graph.threshold;support.value=packet.graph.minimumSupport;connection.value=packet.graph.order==='all'?'all':packet.graph.order>2?'single':'2';selectedOrder.value=packet.graph.order>2?packet.graph.order:3;updateOrderControls();}
  updateProjectContext();message('Opened saved map and findings.'+(saved.snapshot.graph.deduplication?'':' Historical snapshot: rebuild from its search to apply title-and-author deduplication.'));window.dispatchEvent(new CustomEvent('atlas:map-opened',{detail:{projectId:project?.id,mapId:id}}));
 }
 function updateProjectContext(){const label=document.querySelector('.shell-project'),name=packet?packet.name:'Adaptive leadership',count=packet?packet.evidence.articles.length.toLocaleString():'2,855',mismatch=mismatchedCanvas();if(label){label.textContent='Canvas: '+name+' · '+count+' sources';label.title=mismatch?'Selected project/search has not replaced this displayed evidence. Open its map explicitly.':'Displayed study and evidence.';}canvasNotice.textContent='Displayed study: '+name+' · '+count+' sources.'+(mismatch?' The selected project/search has not replaced this map. Saving requires an explicit evidence-copy confirmation.':'');copyLabel.hidden=!mismatch;}
 projectSelect.onchange=()=>{if(projectSelect.value)openProject(projectSelect.value).catch(error=>message(errorMessage(error)));else{projectGeneration++;save.disabled=working;run.disabled=!!jobId;notes.disabled=false;window.dispatchEvent(new CustomEvent('atlas:project-opening',{detail:{projectId:null}}));project=null;projectName.value='';notes.value='';history.replaceChildren(element('h3','Search history'));savedMaps.replaceChildren(element('h3','Saved findings'));updateProjectContext();}};
 form.onsubmit=async event=>{
  event.preventDefault();if(working||jobId)return;
  working=true;run.disabled=true;projectSelect.disabled=true;
  try{
   if(!project){const created=await api('/projects','POST',{name:projectName.value.trim()||terms.value.trim()});await refreshProjects(created.id);await openProject(created.id);}
   const job=await api('/search','POST',{projectId:project.id,query:terms.value,phrase:phrase.checked,limit:+limit.value,from:from.value,through:through.value});jobId=job.id;run.disabled=true;projectSelect.disabled=true;cancel.hidden=false;
   let result;
   while(jobId){result=await api('/jobs/'+jobId);cancel.disabled=result.status!=='running';message(result.status==='saving'?'Saving search evidence to Neo4j…':result.retrieved.toLocaleString()+' / '+(result.total?.toLocaleString()||'…')+' matches retrieved · '+result.pages+' pages');if(['complete','failed','cancelled'].includes(result.status))break;await new Promise(resolve=>setTimeout(resolve,1000));}
   if(result.status==='complete'){await openProject(project.id,false);await openSearch(result.searchId);message('Search saved. Open its co-citation map below.');}else message(result.error||'Search stopped.');
  }catch(error){message(errorMessage(error));}finally{working=false;jobId=null;save.disabled=false;run.disabled=false;projectSelect.disabled=false;cancel.hidden=true;cancel.disabled=false;}
 };
 window.ATLAS_PROJECTS={isBusy:()=>working||!!jobId,setNetworkModel:async model=>{if(model==='pairwise')connection.value='2';else if(connection.value==='2'&&(packet?.generation?.maximumOrder||packet?.graph.higherOrderArtifact?.maximumOrder||2)>2)connection.value='all';updateOrderControls();await window.ATLAS_PROJECTS.rebuild();},rebuild:async()=>{if(!packet)return;try{await buildMap({corpusId:packet.corpusId});}catch(error){message(errorMessage(error));document.getElementById('analysisNote').textContent='Analysis failed: '+errorMessage(error);const algorithm=window.atlasSharedCanvas.graph().clustering?.algorithm;document.getElementById('clusteringMethod').value=['infomap','hypergraph','sbm'].includes(algorithm)?algorithm:'leiden';}},drill:async cluster=>{drillMembers=window.atlasSharedCanvas.graph().nodes.filter(node=>String(node.cluster)===String(cluster)).map(node=>node.id);if(drillMembers.length>1)await window.ATLAS_PROJECTS.rebuild();},openSnapshot,openProject,restoreBaseline:()=>baseline.click(),activeProject:()=>project,activeCorpus:()=>packet};
 window.ATLAS_PROJECTS.ready=refreshProjects(localStorage.getItem('bibliomap.project')).then(()=>{if(!location.pathname.includes('/projects')&&projectSelect.value)return openProject(projectSelect.value);}).catch(error=>message(errorMessage(error)));
})();
