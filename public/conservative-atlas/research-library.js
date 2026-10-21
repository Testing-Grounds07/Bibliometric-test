(() => {
 'use strict';
 if (!window.atlasWorkspaceShell || window.ATLAS_PROJECT_REPORTS) return;
 const base = new URL('/conservative-atlas/', window.location.href);
 const manifestURL = new URL('ai-research/library.json', base);
 const node = (tag, text, className) => { const value = document.createElement(tag); if (text) value.textContent = text; if (className) value.className = className; return value; };
 const library = node('div', '', 'ai-studies-library'); library.id = 'projectResearchReportContent';
 const status = node('p', '', 'ai-studies-status'); status.setAttribute('role', 'status');
 const refresh = node('button', 'Refresh reports', 'secondary'); refresh.type = 'button';
 const cards = node('div', '', 'ai-studies-cards'); library.append(status, refresh, cards);
 let selectedProject = null, generation = 0, cachedStudies = null;
 function mount() { const host = document.getElementById('projectResearchReports'); if (host && library.parentElement !== host) host.append(library); return host; }
 function clearProject() { generation++; selectedProject = null; cards.replaceChildren(); status.textContent = ''; refresh.disabled = false; const host = mount(); if (host) host.hidden = true; const count = document.getElementById('projectReportCount'); if (count) count.textContent = '0'; }
 const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
 const projectPath = new RegExp('^' + base.pathname + 'projects/' + uuid + '(?:/map|/maps/' + uuid + ')?/?$', 'i');
 function text(value, name, maximum = 12000) { if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw Error('The study library has an invalid ' + name + '.'); return value; }
 function linkURL(value, kind) {
  text(value, 'link', 2048);
  if (/[\\\u0000-\u0020]/.test(value) || /%(?:2f|5c|00|25)/i.test(value)) throw Error('The study library contains an unsafe link.');
  const url = new URL(value, base);
  if (url.origin !== base.origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Study links must stay on this BiblioMap site.');
  const allowed = kind === 'map' ? projectPath.test(url.pathname) : url.pathname.startsWith(base.pathname + 'ai-research/');
  if (!allowed) throw Error('A study link points outside the retained research library or project views.');
  return url.href;
 }
 function checkedLinks(values, kind) {
  if (!Array.isArray(values) || values.length > 50) throw Error('The study library has an invalid ' + kind + ' list.');
  return values.map(value => {
   if (!value || typeof value !== 'object') throw Error('Invalid study link.');
   const checked = { label: text(value.label, 'link label', 300), url: linkURL(value.url, kind) };
   if (kind !== 'map') { if (!/^[a-f0-9]{64}$/i.test(value.sha256 || '')) throw Error('A retained download is missing its SHA256 identity.'); checked.sha256 = value.sha256; }
   else { for (const key of ['node_count', 'edge_count']) if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw Error('A study map has invalid counts.'); Object.assign(checked, {node_count: value.node_count, edge_count: value.edge_count, scope: text(value.scope, 'map scope')}); }
   return checked;
  });
 }
 function checkedManifest(value) {
  if (value?.schema_version !== 'bibliomap.standalone-library.v1' || !Array.isArray(value.studies) || value.studies.length > 50) throw Error('The retained study library format is not supported.');
  const seen = new Set();
  return value.studies.map(study => {
   const id = text(study?.id, 'study ID', 200); if (seen.has(id)) throw Error('The retained study library contains duplicate study IDs.'); seen.add(id);
   const checked = {id, title: text(study.title, 'title', 500), summary: text(study.summary, 'summary'), scope: text(study.scope, 'study scope'), reports: checkedLinks(study.reports, 'report'), downloads: checkedLinks(study.downloads, 'download'), maps: checkedLinks(study.maps, 'map'), review: {status: text(study.review?.status, 'review status', 500), scope: text(study.review?.scope, 'review scope')}};
   if (study.project_id != null) { if (typeof study.project_id !== 'string' || !new RegExp('^' + uuid + '$', 'i').test(study.project_id)) throw Error('A study has an invalid project identity.'); checked.project_id = study.project_id.toLowerCase(); checked.project = linkURL('projects/' + study.project_id, 'map'); for (const map of checked.maps) if (!new URL(map.url).pathname.toLowerCase().startsWith(base.pathname + 'projects/' + checked.project_id + '/')) throw Error('A retained map belongs to a different project.'); }
   return checked;
  });
 }
 function link(value) { const anchor = node('a', value.label); anchor.href = value.url; if (value.sha256) {anchor.target = '_blank'; anchor.rel = 'noopener';} return anchor; }
 function fileLinks(card, title, values, linked = true) {
  if (!values.length) return;
  card.append(node('h4', title)); const list = node('ul');
  for (const value of values) { const row = node('li'); row.append(linked ? link(value) : node('span', value.label)); const digest = node('details', '', 'ai-studies-digest'); digest.append(node('summary', 'File SHA256'), node('code', value.sha256)); row.append(digest); list.append(row); }
  card.append(list);
 }
 function render(studies) {
  cards.replaceChildren();
  for (const study of studies) {
   const card = node('article', '', 'ai-study-card'); card.dataset.studyId = study.id;
   card.append(node('h3', study.title));
   const reportLinks = node('div', '', 'project-report-links'); for (const report of study.reports) reportLinks.append(link(report)); card.append(reportLinks);
   if (!study.maps.length) card.append(node('p', 'No network map is attached. The reports and source appraisal can be read without a graph.', 'ai-studies-source-only'));
   const details = node('details', '', 'project-report-details'); details.append(node('summary', 'Scope, review & supporting files'));
   details.append(node('p', study.summary), node('h4', 'Evidence and claim limits'), node('p', study.scope), node('h4', 'Review status'), node('p', study.review.status), node('p', study.review.scope));
   fileLinks(details, 'Report file identities', study.reports, false); fileLinks(details, 'Sources and review downloads', study.downloads); card.append(details);
   cards.append(card);
  }
 }
 async function readManifest(response) {
  if (!response.ok) throw Error('The retained study library could not be loaded (HTTP ' + response.status + ').');
  if (!response.body?.getReader) throw Error('This browser cannot read the bounded study manifest.');
  const reader = response.body.getReader(), parts = []; let bytes = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 262144) throw Error('The retained study library exceeds its 256 KiB display limit.'); parts.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const raw = new Uint8Array(bytes); let offset = 0; for (const part of parts) {raw.set(part, offset); offset += part.byteLength;}
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw));
 }
 function show(studies) {
  const relevant = studies.filter(study => study.project_id === selectedProject);
  render(relevant); const count = document.getElementById('projectReportCount'); if (count) count.textContent = String(relevant.length); const host = mount(); if (host) host.hidden = !relevant.length;
  status.textContent = relevant.length ? 'Retained reports for this project. Review labels describe recorded checks, not human expert approval.' : '';
 }
 async function load(force = false) {
  const projectId = selectedProject, ticket = ++generation;
  if (!projectId) return;
  const host = mount(); if (!host) return;
  if (!force && cachedStudies) { refresh.disabled = false; show(cachedStudies); return; }
  host.hidden = false; refresh.disabled = true; status.textContent = 'Loading reports for this project…';
  try {
   const response = await window.fetch(manifestURL.href, {method: 'GET', credentials: 'same-origin', cache: 'no-cache'});
   const studies = checkedManifest(await readManifest(response));
   if (ticket !== generation || selectedProject !== projectId) return;
   cachedStudies = studies; show(studies);
  } catch (error) {
   if (ticket !== generation || selectedProject !== projectId) return;
   status.textContent = (error instanceof SyntaxError ? 'The report index is not valid JSON.' : error.message) + ' Use Refresh reports to retry, or ask the local operator to check this project’s report index.';
  } finally { if (ticket === generation) refresh.disabled = false; }
 }
 function openProjectReports(projectId) {
  clearProject();
  if (typeof projectId !== 'string' || !new RegExp('^' + uuid + '$', 'i').test(projectId)) return;
  selectedProject = projectId.toLowerCase(); return load();
 }
 refresh.addEventListener('click', () => load(true));
 window.addEventListener?.('atlas:project-opening', clearProject);
 window.addEventListener?.('atlas:project-opened', event => openProjectReports(event.detail?.projectId));
 window.addEventListener?.('atlas:project-reports-ready', event => openProjectReports(event.detail?.projectId));
 window.addEventListener?.('atlas:map-opened', event => { const id = event.detail?.projectId; if (id?.toLowerCase() !== selectedProject) return openProjectReports(id); });

 // A display adapter for exact standalone imports; never change their graph,
 // memberships, objective or settings to match the native application's CPM UI.
 const blockedIds = new Set(['clusteringMethod','clusteringScore','clusteringSearch','networkModel','modelResolution','threshold','coCitationOrder','orderMode','orderSlider','maximumOrder','cpmSlider','cpmAuto','reset','drillMode','drillReferenceMinimum','drillSupport','validationQuick','validationFull','validationSettings','reliabilityButton']);
 const blockedLabels = /^(?:Rebuild network|Recompute analysis|Return to full search network|Generate full analysis|Rerun generation|Generate keywords & labels|Quick check(?: ·.*)?|Full check(?: ·.*)?|Find stable settings|Find settings|Use Auto CPM|Reset analysis & view)$/;
 const savedControls = new Map(), savedTexts = new Map(), wrappedProjects = new WeakSet(), fittedImports = new WeakSet();
 let notice = null, guardedGraph = null, refreshQueued = false, patchedContext = null;
 const imported = graph => !!graph?.importedStandalone && graph._backend === 'independent-bnr-standalone';
 const currentImported = () => {const graph = window.atlasSharedCanvas?.graph?.(); return imported(graph) ? graph : null;};
 const importedLabel = graph => graph.clustering?.objective === 'modularity' ? 'Imported Leiden modularity' : 'Imported objective: ' + (graph.clustering?.objective || graph.importedStandalone.objective || 'not recorded');
 function announceFrozen() { if (notice) {notice.hidden = false; notice.setAttribute('role','status');} }
 function blockedControl(control) { if(['canvasLabelMode','validationResultsDetails'].includes(control?.id))return false;return !!control && (blockedIds.has(control.id) || !!control.closest?.('#projectReferenceControls,#canvasSettings,#canvasReliability,#autoCPMInfo,#validationMenu') || blockedLabels.test(control.textContent?.trim() || '')); }
 function setDisplayText(id, value) {const target = document.getElementById(id); if (!target) return; if (!savedTexts.has(target)) savedTexts.set(target,{original:target.textContent,last:value}); savedTexts.get(target).last=value; if (target.textContent !== value) target.textContent=value;}
 function protectControls() {
  for (const control of document.querySelectorAll?.('input,select,button') || []) {
   if (!blockedControl(control)) continue;
   if (!savedControls.has(control)) savedControls.set(control,{disabled:control.disabled,title:control.title});
   if (!control.disabled) control.disabled=true;
   if (control.title !== 'Frozen imported result. Open another map to use native analysis controls.') control.title='Frozen imported result. Open another map to use native analysis controls.';
  }
 }
 function wrapProjectActions() {
  const projects=window.ATLAS_PROJECTS; if (!projects || wrappedProjects.has(projects)) return;
  wrappedProjects.add(projects);
  for (const name of ['rebuild','drill','setNetworkModel']) {
   const original=projects[name]; if (typeof original !== 'function') continue;
   projects[name]=function(...args){if(currentImported()){announceFrozen();return Promise.resolve(null);}return original.apply(this,args);};
  }
  const originalBusy=projects.isBusy;
  if(typeof originalBusy==='function')projects.isBusy=function(...args){return !!currentImported()||originalBusy.apply(this,args);};
 }
 function syncImported() {
  const graph=currentImported(); wrapProjectActions();
  if (!notice) {const host=document.querySelector?.('.map-intro');if(host){notice=node('section','','analysis-note');notice.id='importedStandaloneNotice';notice.setAttribute('aria-label','Frozen standalone study result');notice.hidden=true;host.after(notice);}}
  if (!graph) {
   if (notice) notice.hidden=true;
   if (guardedGraph) {
    if(patchedContext){delete patchedContext.textContent;patchedContext=null;}
    for(const [control,prior]of savedControls){control.disabled=prior.disabled;control.title=prior.title;}
    savedControls.clear();
    for(const [target,prior]of savedTexts)if(target.textContent===prior.last)target.textContent=prior.original;
    savedTexts.clear();document.getElementById('clusteringScore')?.querySelector?.('option[value="standalone-import"]')?.remove();
    guardedGraph=null;window.atlasSharedCanvas?.refreshAnalysisControls?.();window.atlasWorkspaceShell.refresh?.();
   }
   return;
  }
  const changed=guardedGraph!==graph; guardedGraph=graph;
  // Older deployed shells do not read methodDisplayLabel. Confine their
  // legacy CPM-prefix translation to this single display node; keep the real
  // algorithm/objective unchanged in both graph and canvas summary.
  const context=document.getElementById('shellContext'), nativeText=window.Node&&Object.getOwnPropertyDescriptor(window.Node.prototype,'textContent');
  if(context&&context!==patchedContext&&nativeText?.get&&nativeText?.set){
   Object.defineProperty(context,'textContent',{configurable:true,get(){return nativeText.get.call(this);},set(value){const applied=currentImported(),shown=applied?String(value).replace(/^Leiden · CPM.*?(?= · [\d,]+\/[\d,]+(?: |$)|$)/,importedLabel(applied)):value;if(nativeText.get.call(this)!==shown)nativeText.set.call(this,shown);}});
   patchedContext=context;context.textContent=context.textContent;
  }
  if (notice && (changed || notice.hidden)) {
   const settings=graph.clustering||{}, detail=[];
   if(Number.isSafeInteger(settings.seed))detail.push('seed '+settings.seed);
   if(Number.isSafeInteger(settings.iterations))detail.push(settings.iterations+' iterations');
   notice.replaceChildren(node('strong',importedLabel(graph)+(detail.length?' · '+detail.join(' · '):'')),node('p','Frozen standalone study result. No recomputation on open. Native rebuilding and CPM tuning are disabled. Optional research checks run separately without replacing this map. Keywords and Qwen names load automatically as a current interpretation overlay once the exact saved source text and map are ready; they do not alter this network or extend the retained study’s review approval.'));
   const reload=node('button','Reload keywords','secondary');reload.type='button';reload.onclick=async()=>{reload.disabled=true;try{await window.atlasSharedCanvas?.reloadThemes?.();if(currentImported()!==graph)return;if(!window.ATLAS_EVIDENCE?.importedThemeBinding?.(graph)){const status=node('p',graph.themeError||'Matching pinned-source text is unavailable. No public/default corpus was substituted.');status.setAttribute('role','status');notice.append(status);}}finally{reload.disabled=false;}};notice.append(reload);
   if(graph.importedStandalone.report_url)try{notice.append(link({label:'Read the retained study report and run settings',url:linkURL(graph.importedStandalone.report_url,'report')}));}catch{notice.append(node('p','Read the retained report in this project’s Reports & supporting files section.'));}
   notice.hidden=false;
  }
  const score=document.getElementById('clusteringScore');
  if(score&&!score.querySelector?.('option[value="standalone-import"]')){const option=node('option',graph.clustering?.objective==='modularity'?'Modularity · imported':'Imported objective');option.value='standalone-import';score.append(option);}
  protectControls();
  if(graph.method==='coupling'||graph.canvasKind==='coupling')setDisplayText('methodTitle','Source-article coupling');
  setDisplayText('analysisNote',importedLabel(graph)+'. Exact retained memberships and graph; native CPM settings do not apply. See the retained study report for scope, run settings and limitations.');
  setDisplayText('cpmValue','Not used · imported objective');setDisplayText('cpmHint','Native CPM controls do not describe this retained fit.');
  if(changed)window.atlasWorkspaceShell.refresh?.();
 }
 function installDisplayHooks() {
  const canvas=window.atlasSharedCanvas,concepts=window.ATLAS_CLUSTERING_CONCEPTS;
  if(canvas?.summary){const original=canvas.summary;canvas.summary=function(...args){const summary=original.apply(this,args),graph=currentImported();return graph&&summary?{...summary,methodDisplayLabel:importedLabel(graph),automatic:false}:summary;};}
  if(concepts){
   const originalScore=concepts.scoreForAlgorithm,originalDescribe=concepts.describe,originalHeading=concepts.heading;
   if(originalScore)concepts.scoreForAlgorithm=function(...args){return currentImported()?{value:'standalone-import',label:'Modularity · imported',algorithm:'leiden'}:originalScore.apply(this,args);};
   if(originalDescribe)concepts.describe=function(graph,...args){const displayed=imported(graph)?graph:!Array.isArray(graph?.nodes)?currentImported():null;if(!displayed)return originalDescribe.call(this,graph,...args);const label=importedLabel(displayed);return {algorithm:displayed.clustering?.algorithm||'leiden',score:'standalone-import',scoreTitle:label,searchTitle:'Retained Leiden run',clusterLabel:label,formula:'Retained standalone modularity fit; not native CPM.',scoreSummary:'The displayed memberships are from the original standalone run. The application has not refit them.',example:'Display filters and layout do not change the imported graph or memberships.',searchSteps:['Read the exact seed and finite iteration count in the retained report.'],searchSummary:'This imported view does not start a new optimizer.',tuning:'Native CPM and automatic settings are disabled for this frozen imported view.',validity:'Numerical completion and recorded review do not establish substantive themes or human expert approval.'};};
   if(originalHeading)concepts.heading=function(graph,previous){return imported(graph)?(previous?'Previous result · ':'')+importedLabel(graph)+' clusters':originalHeading.call(this,graph,previous);};
  }
 }
 installDisplayHooks();
 for(const eventName of ['click','input','change','submit'])document.addEventListener?.(eventName,event=>{if(!currentImported())return;const target=event.target?.closest?.('input,select,button');if(blockedControl(target)){event.preventDefault();event.stopImmediatePropagation();announceFrozen();}},true);
 const scheduleImported=()=>{if(refreshQueued)return;refreshQueued=true;(window.requestAnimationFrame||((callback)=>setTimeout(callback,0)))(()=>{refreshQueued=false;syncImported();});};
 function fitImportedOnce(){const graph=currentImported();if(!graph||fittedImports.has(graph))return;fittedImports.add(graph);(window.requestAnimationFrame||((callback)=>callback()))(()=>{if(currentImported()===graph)window.atlasSharedCanvas?.redraw?.();});}
 function openedImported(){syncImported();fitImportedOnce();}
 window.addEventListener?.('atlas:map-opened',openedImported);window.addEventListener?.('atlas:project-opened',scheduleImported);
 if(typeof MutationObserver!=='undefined')new MutationObserver(scheduleImported).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 syncImported();fitImportedOnce();
 window.ATLAS_PROJECT_REPORTS = {refresh: () => load(true),refreshImportedView:syncImported};
 // Retain the programmatic compatibility alias; it creates no navigation tool.
 window.ATLAS_AI_STUDIES = window.ATLAS_PROJECT_REPORTS;
})();
