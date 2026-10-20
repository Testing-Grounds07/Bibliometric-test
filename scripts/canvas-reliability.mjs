import {analysisErrorMessage} from './analysis-errors.mjs';
import {isIncidenceModel} from './hypergraph-network.mjs';
import {interpretRecovery, recoveryOverview, RELIABILITY_RULES} from './evidence-guidance.mjs';
import {revealSection} from './evidence-navigation.mjs';
import {loadCommunities} from './community-loader.mjs';
import {startTrialReliability} from './trial-reliability-client.mjs';
import {syncCanvasSettings, cancelCanvasSettings, settingsValidationState} from './canvas-settings.mjs';
import {mountScience, cancelScience} from './canvas-science.mjs';
import {automaticNavigationAllowed,navigationReady} from './startup-navigation.mjs';

const records = new WeakMap();
let activeGraph, focus, lastFilter, articleIds, bundles, panel, job, generation = 0;
let autoTimer;
const element = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const percent = value => (value * 100).toFixed(1) + '%';
const algorithm = graph => ['infomap', 'hypergraph', 'sbm', 'trial'].includes(graph.clustering?.algorithm) ? graph.clustering.algorithm : 'leiden';
const method = graph => (algorithm(graph) === 'sbm' ? 'Nested block model · level ' + ((graph.clustering.selectedLevel || 0) + 1) : algorithm(graph) === 'infomap' ? 'Infomap · Markov time ' + (graph.clustering.markovTime || 1) : algorithm(graph) === 'hypergraph' ? 'Hypergraph · ' + (graph.clustering.hypergraphObjective || 'linear') : graph.resolution == null ? 'Preparing network' : 'Leiden CPM · ' + Number(graph.resolution.toPrecision(4))) + (graph.networkModel === 'hypergraph' && algorithm(graph) !== 'hypergraph' ? (isIncidenceModel(graph) ? ' · incidence' : ' · legacy projection') : '');
const pendingMethod = () => document.getElementById('clusteringMethod')?.value !== algorithm(activeGraph) || (document.getElementById('networkModel')?.value === 'hypergraph') !== (activeGraph?.networkModel === 'hypergraph' || algorithm(activeGraph) === 'hypergraph') || algorithm(activeGraph)==='hypergraph'&&['mixed','leiden-seeded','group-moves','annealing'].includes(document.getElementById('clusteringSearch')?.value)&&document.getElementById('clusteringSearch').value!==(activeGraph.clustering?.hypergraphSearch||'mixed');
if (typeof document !== 'undefined') document.getElementById('clusteringMethod')?.addEventListener('change', () => { cancelCanvasReliability(); draw(); });
if (typeof window !== 'undefined') window.addEventListener('atlas-settings-settled', event => {
 if (event.detail === activeGraph) { draw(); scheduleQuickCheck(); }
});
if(typeof window!=='undefined')window.addEventListener('atlas-semantic-check',event=>{if(event.detail===activeGraph)draw();});
if(typeof window!=='undefined')window.addEventListener('bibliomap:collaboration-check',event=>{if(event.detail===activeGraph)draw();});
if(typeof window!=='undefined')window.addEventListener?.('atlas:navigation-state',()=>{if(!automaticNavigationAllowed(activeGraph))cancelCanvasReliability();});

export function cancelCanvasReliability() {
 cancelScience();
 cancelCanvasSettings();
 clearTimeout(autoTimer);
 generation++; job?.cancel(); job = null;
 const record = records.get(activeGraph);
 if (record?.running) { record.running = false; record.status = 'Cancelled. No incomplete result is reported.'; draw(); }
}

export function syncCanvasReliability(graph, cluster, ids, sourceBundles = []) {
 if (!panel) {
  panel = element('details'); panel.id = 'canvasReliability'; panel.className = 'canvas-reliability';
  document.getElementById('mapCaption').after(panel);
 }
 const nextFocus = Number(cluster) > 0 ? Number(cluster) : null;
 if (graph === activeGraph && nextFocus === lastFilter) {syncCanvasSettings(graph,ids,sourceBundles);return;}
 if (graph !== activeGraph) cancelCanvasReliability();
 activeGraph = graph; focus = nextFocus; lastFilter = nextFocus; articleIds = ids; bundles = sourceBundles;
 if (!records.has(graph)) {
  const restored = graph.reliability?.algorithm === algorithm(graph) ? graph.reliability : null;
  records.set(graph, {result: restored, running: false, status: restored ? 'Restored completed check: ' + restored.samples + ' resamples using ' + restored.method + '.' : ''});
 }
 draw();
 syncCanvasSettings(graph, ids, sourceBundles);
 scheduleQuickCheck();
}

function scheduleQuickCheck() {
 const graph = activeGraph, record = records.get(graph);
 if(!automaticNavigationAllowed(graph))return;
 if (graph.linkedBrowse||graph.collaboration||graph.semantic||graph.temporalSelection||graph.temporalSeries) return;
 if (window.ATLAS_TRIAL_WORKSPACE && !graph.trial) return;
 if ((!window.BIBLIOMAP?.active || window.BIBLIOMAP.canCompute !== false) && settingsValidationState(graph) === 'idle' && algorithm(graph) !== 'sbm' && !record.result && !record.running && !record.autoAttempted && !pendingMethod() && graph.nodes.some(node => node.cluster > 0)) {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => { if (activeGraph === graph && automaticNavigationAllowed(graph)&&!graph.temporalSeries&&!graph.temporalSelection&&!graph.semantic&&!graph.collaboration&&!graph.linkedBrowse&&!pendingMethod()) { record.autoAttempted = true; run(10); } }, 800);
 }
}

export function showCanvasReliability(cluster) {
 if (!panel) return;
 if (Number(cluster) > 0) { focus = Number(cluster); draw(); }
 panel.open = true; revealSection(panel, true);
}

async function run(samples) {
 if(!navigationReady(activeGraph))return;
 if (activeGraph?.collaboration||activeGraph?.semantic||activeGraph?.temporalSelection) return;
 if (pendingMethod() || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false) return;
 cancelCanvasSettings();
 clearTimeout(autoTimer);
 records.get(activeGraph).autoAttempted = true;
 const graph = activeGraph, record = records.get(graph), ticket = ++generation;
 job?.cancel(); job = null; record.running = true; record.result = null; graph.reliability = null; window.ATLAS_EVIDENCE?.recordCanvasReliability(graph, null);
 record.status = 'Preparing ' + (graph.trial?.result.definition.name || method(graph)) + ' resampling…'; draw();
 try {
  if (!graph.trial) await loadCommunities();
  if (ticket !== generation||!navigationReady(graph)) return;
  const progress = message => {
   if (ticket !== generation) return;
   record.status = message; panel.dataset.validationStatus = message; panel.querySelector('.reliability-progress').textContent = message;
  };
  job = graph.trial ? startTrialReliability(structuredClone({...graph, bundles}), samples, progress) : window.ATLAS_COMMUNITIES.startReliability(structuredClone({...graph, bundles}), articleIds, samples, progress);
  const result = await job.promise;
  if (ticket !== generation) return;
  record.result = result; graph.reliability = result;
  window.ATLAS_EVIDENCE?.recordCanvasReliability(graph, result);
  record.status = 'Completed ' + result.samples + ' resamples using ' + result.method + '.';
 } catch (error) { if (ticket === generation) record.status = 'No completed reliability result: ' + analysisErrorMessage(error); }
 finally { if (ticket === generation) { record.running = false; job = null; draw(); } }
}

function action(parent, label, callback, disabled = false) {
 const button = element('button', label); button.type = 'button'; button.className = 'secondary'; button.disabled = disabled; button.onclick = callback; parent.append(button); return button;
}

function draw() {
 if (!activeGraph || !panel) return;
 const graph = activeGraph, record = records.get(graph), selected = focus;
 if(graph.temporalSelection){panel.dataset.validationMode='window';panel.dataset.validationState='not-assessed';panel.dataset.validationOutcome='';panel.dataset.validationStatus='';panel.dataset.preliminary='false';graph.reliabilityState='not-assessed';panel.replaceChildren(element('summary','Temporal window validation'),element('p','Independent publication windows are descriptive, not a reliability or significance test. Per-window persisted audits are not implemented; no parent validation is inherited.'));return;}
 if(graph.collaboration){panel.dataset.validationMode='collaboration';panel.dataset.validationState='collaboration';panel.dataset.validationOutcome='';panel.dataset.validationStatus=graph.collaborationSensitivity?.completed?'completed':'not-assessed';panel.dataset.preliminary='false';graph.reliabilityState='not-applicable';panel.replaceChildren(element('summary','Collaboration validation'),element('p','Citation bootstrap/nulls do not apply. Use Collaboration maps for construction and explicit human-audited identity sensitivity. Structural groups are not validated social or thematic communities.'));mountScience(panel,graph,Object.values(window.ATLAS_DATA?.articles||{}));return;}
 if (graph.semantic) {panel.dataset.validationMode='semantic';panel.dataset.validationState='semantic';panel.dataset.validationOutcome='';panel.dataset.validationStatus=graph.semanticSensitivity?.status||'not-assessed';panel.dataset.preliminary='false';graph.reliabilityState='not-applicable';panel.replaceChildren(element('summary', 'Semantic validation'), element('p', 'Citation bootstrap and incidence-margin null tests do not apply to this network. Use Semantic maps → Check text & threshold sensitivity. A stable partition does not validate a theme.')); mountScience(panel, graph, Object.values(window.ATLAS_DATA?.articles || {})); return;}
 delete panel.dataset.validationMode;
 const state = pendingMethod() ? 'pending' : record.running ? 'running' : record.result ? 'done' : 'unknown';
 panel.dataset.validationState = state;
 panel.dataset.validationOutcome = record.result ? recoveryOverview(record.result.clusters).heading : '';
 panel.dataset.preliminary = String(!!record.result?.preliminary);
 panel.dataset.validationStatus = record.status || '';
 if (graph.reliabilityState !== state || record.publishedResult !== record.result) {
  graph.reliabilityState = state; record.publishedResult = record.result;
  queueMicrotask(() => window.dispatchEvent(new CustomEvent('atlas-reliability-change', {detail: graph})));
 }
 if (pendingMethod()) {
  panel.replaceChildren(element('summary', 'Roles & reliability · waiting for selected method'), element('p', 'The selected clustering method has not finished loading. Reliability checks will become available when its map is ready. If analysis failed, retry the clustering selection. No results from the previous method are shown.'));
  return;
 }
 const shortOutcome = record.result ? recoveryOverview(record.result.clusters).heading : record.running ? 'Checking…' : algorithm(graph) === 'sbm' ? 'Run a preliminary check' : 'Automatic preliminary check';
 panel.replaceChildren(element('summary', 'Reliability · ' + shortOutcome));
 panel.append(element('p', (graph.trial?.result.definition.name || method(graph)) + ' · resampled citation evidence'));
 const explanation = element('details'); explanation.append(element('summary', 'How this works'), element('p', (algorithm(graph) === 'sbm' ? 'Block-model checks run on demand because every resample fits a new hierarchy. The selected hierarchy level is used, or the coarsest available level if a resample has fewer levels. ' : 'Automatically runs 10 preliminary resamples for each new map unless a completed check is available. ') + 'Rerun or use 50 resamples below. The selected algorithm is rerun on resampled citation evidence; the map is unchanged. Filters only narrow the displayed results. This checks structural stability, not thematic validity. Switching tabs cancels unfinished checks.'));
 panel.append(explanation);
 const controls = element('div'); controls.className = 'reliability-controls';
 const unavailable = !graph.nodes.some(node => node.cluster > 0) || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
 action(controls, 'Rerun quick · 10', () => run(10), record.running || unavailable).id = 'validationQuick';
 action(controls, 'Fuller check · 50', () => run(50), record.running || unavailable).id = 'validationFull';
 action(controls, 'Cancel reliability check', cancelCanvasReliability, !record.running).hidden = !record.running;
 panel.append(controls);
 const status = element('p', record.status || (unavailable ? 'No linked groups to assess.' : 'Not assessed yet.')); status.className = 'reliability-progress'; status.setAttribute('role', 'status'); panel.append(status);
 panel.append(element('p', selected ? 'Showing Cluster ' + selected + '. The entire network is resampled.' : 'Showing all clusters.'));
 if (selected) action(panel, 'Show reliability for all clusters', () => { focus = null; draw(); });
 const result = record.result;
 if (result) {
  const clusters = Object.fromEntries(Object.entries(result.clusters).filter(([cluster]) => !selected || +cluster === selected));
  const overview = recoveryOverview(clusters);
  const outcome = element('section'); outcome.className = 'reliability-outcome';
  outcome.append(element('h3', (result.preliminary ? 'Preliminary: ' : '') + overview.heading), element('p', 'Structural stability; thematic relevance still needs review.'));
  if (result.nonconverged) outcome.append(element('p', result.nonconverged + ' resamples reached the optimization pass limit. Interpret recovery cautiously.'));
  panel.append(outcome);
  const details = element('details'); details.append(element('summary', 'Cluster outcomes & technical scores'), element('p', overview.explanation));
  for (const [cluster, values] of Object.entries(clusters)) {
   const interpretation = interpretRecovery(values, Object.keys(result.clusters).length);
   details.append(element('h4', 'Cluster ' + cluster + ' — ' + interpretation.heading), element('p', interpretation.explanation + ' ' + interpretation.caution), element('p', values.size + ' members · recovery ' + percent(values.meanJaccard) + ' · 10th–90th percentile ' + values.interval.map(percent).join('–') + ' · retention ' + percent(values.meanRetention)));
  }
  details.append(element('p', result.samples + ' resamples · ' + result.method + ' · ' + result.restarts + ' starts each. Resampling unit: ' + result.resamplingUnit + '.'), element('p', 'Recovery is best Jaccard overlap: intersection divided by union. Lost members, splits and merges lower it. Retention measures members still clustered. Percentiles describe observed resampling spread, not confidence intervals.'), element('p', result.limitations), element('p', RELIABILITY_RULES));
  panel.append(details);
 }
 mountScience(panel, graph, Object.values(window.ATLAS_DATA?.articles || {}), {selectNode: id => { window.atlasSharedCanvas.selectSource(id); revealSection(document.getElementById('details'), true); }});
}
