import {standaloneImport} from './imported-theme-evidence.mjs';
import {descriptionRequest} from './cluster-description-core.mjs';
import {createDescriptionQueue} from './description-queue.mjs';
import {titleCase} from './label-case.mjs';
import {descriptionsAllowed} from './description-policy.mjs';
import {automaticNavigationAllowed} from './startup-navigation.mjs';

let currentGraph, updateNames, manualGraph;
const scopes = new WeakMap();
const node = (tag, text) => { const element = document.createElement(tag); element.textContent = text; return element; };
const queue = createDescriptionQueue(async (request, regenerate, signal) => {
 if(!descriptionsAllowed(currentGraph,window.BIBLIOMAP)||(standaloneImport(currentGraph)||currentGraph.temporalSeries||!automaticNavigationAllowed(currentGraph))&&manualGraph!==currentGraph)throw Error('AI naming is unavailable or paused in this analysis context.');
 if (window.BIBLIOMAP?.active) {
  const job = window.BIBLIOMAP.stage(currentGraph, 'description', {cluster: request.cluster}, () => {}, regenerate);
  const abort = () => job.cancel(); signal.addEventListener('abort', abort, {once:true});
  try { return await job.promise; } finally { signal.removeEventListener('abort', abort); }
 }
 const timeout = AbortSignal.timeout(190000), combined = AbortSignal.any([signal, timeout]);
 for (let attempt = 0; attempt < 4; attempt++) {
  if(!descriptionsAllowed(currentGraph,window.BIBLIOMAP)||(standaloneImport(currentGraph)||currentGraph.temporalSeries||!automaticNavigationAllowed(currentGraph))&&manualGraph!==currentGraph)throw Error('The naming context changed.');
  const response = await fetch('analysis-api/describe', {method: 'POST', signal: combined, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...request, regenerate})});
  const result = await response.json();
  if (response.status === 429 && attempt < 3) { await new Promise(resolve => setTimeout(resolve, 3000)); combined.throwIfAborted(); continue; }
  if (!response.ok) throw new Error(result.error === 'fetch failed' ? 'The local language model is unavailable. Existing names remain available; retry shortly.' : result.error || 'Description unavailable.');
  return result;
 }
}, entries => {
 if(!descriptionsAllowed(currentGraph,window.BIBLIOMAP)){drawProgress();return;}
 for (const record of entries) {
  if (record.result && currentGraph?.generatedDescriptions?.[record.request.cluster]?.result !== record.result) {
   currentGraph.generatedDescriptions = {...currentGraph.generatedDescriptions, [record.request.cluster]: {requestKey: record.key, result: record.result}};
   updateNames?.(record.request.cluster, record.result);
  }
  record.draw?.();
 }
 drawProgress();
});

function sync(graph) {
 if (currentGraph !== graph) { queue.stop(); currentGraph = graph; updateNames = null; manualGraph=null; }
 if(!descriptionsAllowed(graph,window.BIBLIOMAP)||(standaloneImport(graph)||graph.temporalSeries||!automaticNavigationAllowed(graph))&&manualGraph!==graph){queue.stop();drawProgress();}
}

function prepare(graph, update) {
 if(!descriptionsAllowed(graph,window.BIBLIOMAP)||(standaloneImport(graph)||graph.temporalSeries||!automaticNavigationAllowed(graph))&&manualGraph!==graph){
  sync(graph);updateNames=update;if(graph.collaboration||graph.temporalSelection||graph.semantic&&graph.entityKind!=='source')return;
  if(standaloneImport(graph)&&!descriptionsAllowed(graph,window.BIBLIOMAP))return;
  for(const [cluster,saved]of Object.entries(graph.generatedDescriptions||{})){const request=descriptionRequest(graph,cluster,window.ATLAS_DATA.summary.corpus_id);if(saved.result&&saved.requestKey===JSON.stringify(request)){queue.seed(request,saved.result);const description=graph.themeDescriptions?.[cluster];if(description){description.generated=saved.result;if(['shared-theme','mixed-themes'].includes(saved.result.status)){description.keywordHeading||=description.heading;description.heading=saved.result.heading;}}}}
  return;
 }
 sync(graph); updateNames = update;
 if (!scopes.has(graph) || scopes.get(graph).themes !== graph.themeDescriptions) {
 const counts = new Map();
 for (const member of graph.nodes) if (member.cluster > 0) counts.set(String(member.cluster), (counts.get(String(member.cluster)) || 0) + 1);
 const base = descriptionRequest(graph, '', window.ATLAS_DATA.summary.corpus_id);
 const requests = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([cluster]) => ({...base, cluster}));
 const key = requests.length ? JSON.stringify({...requests[0], cluster: ''}) : '';
 scopes.set(graph, {key, requests, themes: graph.themeDescriptions});
 }
 const {key, requests} = scopes.get(graph);
 for (const request of requests) { const saved = graph.generatedDescriptions?.[request.cluster]; if (saved?.result && saved.requestKey === JSON.stringify(request)) queue.seed(request, saved.result); }
 const entries = queue.activate(key, requests);
 for (const record of entries) if (record.result) {
  graph.generatedDescriptions = {...graph.generatedDescriptions, [record.request.cluster]: {requestKey: record.key, result: record.result}};
  const description = graph.themeDescriptions?.[record.request.cluster];
  if (description && description.generated !== record.result) {
   description.generated = record.result;
   if (['shared-theme', 'mixed-themes'].includes(record.result.status)) { description.keywordHeading ||= description.heading; description.heading = record.result.heading; }
  }
 }
}

function drawProgress() {
 const host = document.getElementById('clusterNameProgress');
 if (!host) return;
 if(!descriptionsAllowed(currentGraph,window.BIBLIOMAP)){host.replaceChildren(node('span',standaloneImport(currentGraph)?'Load matching pinned-source keywords before naming. Private imported contexts are unsupported.':'Cached keywords only · AI naming is not run for completed windows or read-only contexts.'));return;}
 if((standaloneImport(currentGraph)||currentGraph.temporalSeries||!automaticNavigationAllowed(currentGraph))&&manualGraph!==currentGraph){host.replaceChildren(node('span',standaloneImport(currentGraph)?'Current keyword overlay · Qwen naming starts only when requested; retained network and study reviews are unchanged.':'Completed-view browsing · automatic naming paused; matching cached descriptions remain readable.'));const resume=node('button','Resume naming · full map');resume.type='button';resume.className='secondary';resume.onclick=resumeNaming;host.append(resume);return;}
 const entries = queue.entries(), done = entries.filter(record => record.status === 'done').length;
 const failed = entries.filter(record => ['error', 'cancelled'].includes(record.status));
 host.replaceChildren(node('span', `AI descriptions ${done}/${entries.length}${entries.some(record => ['running', 'idle'].includes(record.status)) ? ' · naming clusters' : failed.length ? ' · finished' : ' · complete'}${failed.length ? ` · ${failed.length} need retry` : ''}. Suggested themes, not validated.`));
 if (failed.length) { const retry = node('button', 'Retry unfinished names'); retry.type = 'button'; retry.className = 'secondary'; retry.onclick = () => { if(!descriptionsAllowed(currentGraph,window.BIBLIOMAP))return;for (const record of failed) queue.retry(record); }; host.append(retry); }
 if (entries.length) { const rerun = node('button', 'Rerun Qwen'); rerun.type = 'button'; rerun.className = 'secondary'; rerun.disabled = entries.some(record => record.status === 'running'); rerun.onclick = rerunAll; host.append(rerun); }
 if (entries.some(record => ['running', 'idle'].includes(record.status))) { const cancel = node('button', 'Pause naming'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.onclick = () => { for (const record of queue.entries()) if (['running', 'idle'].includes(record.status)) queue.cancel(record); }; host.append(cancel); }
}
function resumeNaming(){if(!descriptionsAllowed(currentGraph,window.BIBLIOMAP))return;manualGraph=currentGraph;prepare(currentGraph,updateNames);drawProgress();}
function rerunAll() { if(!descriptionsAllowed(currentGraph,window.BIBLIOMAP))return;if((standaloneImport(currentGraph)||currentGraph.temporalSeries||!automaticNavigationAllowed(currentGraph))&&manualGraph!==currentGraph)resumeNaming();for (const record of queue.entries()) queue.retry(record, true); }

function mount(parent, graph, cluster, inspect) {
 sync(graph);if(standaloneImport(graph)&&!descriptionsAllowed(graph,window.BIBLIOMAP)){parent.append(node('p','Load matching pinned-source keywords before requesting names. No network recomputation is needed.'));return;}if(graph.collaboration||graph.temporalSelection||graph.semantic&&graph.entityKind!=='source'){parent.append(node('p',graph.collaboration?'Actor identities are not article IDs. AI actor descriptions are not implemented.':'Completed windows use cached keywords; no AI description job is started. Return to the full pinned map to name clusters.'));return;}
 const request = descriptionRequest(graph, cluster, window.ATLAS_DATA.summary.corpus_id), key = JSON.stringify(request);
 const saved=graph.generatedDescriptions?.[cluster];
 const record = queue.entries().find(record => record.key === key)||queue.lookup(request)||saved?.result&&saved.requestKey===key&&{key,request,result:saved.result,status:'done'};
 if (!record) return;
 const section = node('section', ''); section.className = 'cluster-ai-description';
 parent.append(section);
 const draw = () => {
  section.replaceChildren(node('h3', 'What connects this cluster?'));
  if (record.result) {
   const result = record.result;
   if (titleCase(graph.themeDescriptions?.[cluster]?.heading) !== titleCase(result.heading)) section.append(node('strong', titleCase(result.heading)));
   if (result.status !== 'shared-theme') section.append(node('p', result.status === 'mixed-themes' ? 'Mixed themes — one label may not represent every member.' : result.status === 'limited-evidence' ? 'Partial description — broader commonality could not be verified; showing one supported concept.' : 'Insufficient evidence for a shared theme.'));
   if (result.summary) section.append(node('p', result.summary.text));
   const coverage = result.packet.coverage;
   const sampledAbstracts = coverage.sampledAbstracts ?? result.packet.documents.filter(document => document.role === 'member' && document.abstract).length;
   section.append(node('small', `${coverage.sampled}/${coverage.members} member titles considered · ${sampledAbstracts} sampled abstracts · ${coverage.withAbstract}/${coverage.members} have abstracts · AI suggestion, not network validation.`));
   const evidence = node('details', ''); evidence.append(node('summary', 'Concepts, supporting text & exceptions'));
   const claims = [result.summary, ...result.concepts.map(claim => ({...claim, text: titleCase(claim.text)})), ...result.exceptions.map(claim => ({...claim, text: 'Exception / variation: ' + titleCase(claim.text)})), result.contrast && {...result.contrast, text: 'Compared with neighbors: ' + result.contrast.text}].filter(Boolean);
   for (const claim of claims) {
    const item = node('details', ''); item.append(node('summary', claim.text));
    for (const citation of claim.evidence) {
     const document = result.packet.documents.find(document => document.id === citation.id);
     item.append(node('blockquote', citation.quote));
     const button = node('button', (document.role === 'neighbor' ? 'Neighbor: ' : '') + document.title); button.type = 'button'; button.className = 'secondary'; button.onclick = () => inspect(citation.id); item.append(button, node('small', citation.field + ' · ' + citation.id));
    }
    evidence.append(item);
   }
   evidence.append(node('p', result.verification), node('small', result.model + ' · ' + new Date(result.createdAt).toLocaleString()));
   for (const warning of result.evidenceWarnings || []) evidence.append(node('p', warning));
   if (request.kind === 'coupling') evidence.append(node('p', 'This describes source-article subject matter. Shared foundations are listed separately; sharing a reference does not establish a shared research finding.'));
   section.append(evidence);
  }
  const status = node('p', record.status === 'running' ? 'Reading representative and diverse article evidence…' : record.error || (!record.result ? 'Queued automatically. Extracted keywords remain available while names are generated.' : ''));
  status.setAttribute('role', 'status'); section.append(status);
  const controls = node('div', ''); controls.className = 'description-actions';
  const run = node('button', record.result ? 'Regenerate description' : record.status === 'error' || record.status === 'cancelled' ? 'Retry description' : 'Describe next'); run.type = 'button'; run.className = 'secondary'; run.disabled = !descriptionsAllowed(graph,window.BIBLIOMAP)||record.status === 'running'; run.onclick = () => {if(currentGraph===graph&&descriptionsAllowed(graph,window.BIBLIOMAP)){manualGraph=graph;queue.retry(record, Boolean(record.result));}}; controls.append(run);
  if (record.status === 'running' || record.status === 'idle') { const cancel = node('button', 'Cancel'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.onclick = () => queue.cancel(record); controls.append(cancel); }
  if (record.result) { const download = node('button', 'Export description'); download.type = 'button'; download.className = 'secondary'; download.onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({request, ...record.result}, null, 2)], {type: 'application/json'})), link = document.createElement('a'); link.href = url; link.download = 'cluster-' + cluster + '-description.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }; controls.append(download); }
  section.append(controls);
 };
 record.draw = () => { if (section.isConnected) draw(); };
 draw();
 if(descriptionsAllowed(graph,window.BIBLIOMAP)&&(!standaloneImport(graph)&&!graph.temporalSeries&&automaticNavigationAllowed(graph)||manualGraph===graph))queue.prioritize(record);
}

window.ATLAS_DESCRIPTIONS = {mount, sync, prepare, drawProgress, rerunAll,resumeNaming};
window.addEventListener?.('atlas:navigation-state',()=>{manualGraph=null;queue.stop();drawProgress();});
