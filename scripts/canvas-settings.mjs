import {analysisErrorMessage} from './analysis-errors.mjs';
import {loadCommunities} from './community-loader.mjs';
import {isIncidenceModel} from './hypergraph-network.mjs';
import {revealSection} from './evidence-navigation.mjs';
import {materializeSetting, settingsAlgorithm, isCouplingGraph, recoveryMetrics, SETTINGS_VERSION} from './method-settings.mjs';
import {automaticNavigationAllowed,navigationReady} from './startup-navigation.mjs';

const records = new WeakMap();
let graph, articleIds, bundles, panel, job, generation = 0;
let autoTimer, badge;
if(typeof window!=='undefined')window.addEventListener?.('atlas:navigation-state',()=>{if(!automaticNavigationAllowed(graph))cancelCanvasSettings();});
export function settingsValidationState(current) {
 const record = records.get(current);
 return record?.running ? 'running' : automaticSettingsPending(current) && !record?.autoAttempted && !window.BIBLIOMAP?.active ? 'queued' : 'idle';
}
export function settingsBadgeLabel(phase, record = {}) {
 if (phase === 'running') return 'Auto settings · testing…';
 if (record.report) return record.report.recommendation.chosen ? 'Auto settings · stable range' : record.report.compareObjectives ? 'Settings · objective comparison' : 'Auto settings · no clear recommendation';
 if (phase === 'queued') return 'Auto settings · queued';
 return record.autoAttempted ? 'Auto settings · stopped / retry' : 'Auto settings · not run';
}
const element = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const percent = value => Number.isFinite(value) ? (100 * value).toFixed(0) + '%' : '—';
const decimal = value => Number.isFinite(value) ? value.toFixed(2) : '—';
const method = () => ({leiden: 'Leiden CPM', infomap: 'Infomap', hypergraph: 'Hypergraph'})[settingsAlgorithm(graph)] + (graph.networkModel === 'hypergraph' && settingsAlgorithm(graph) !== 'hypergraph' ? (isIncidenceModel(graph) ? ' · incidence' : ' · legacy projection') : '');
const pending = () => document.getElementById('clusteringMethod').value !== settingsAlgorithm(graph) || (document.getElementById('networkModel')?.value === 'hypergraph') !== (graph.networkModel === 'hypergraph' || settingsAlgorithm(graph) === 'hypergraph') || settingsAlgorithm(graph)==='hypergraph'&&['mixed','leiden-seeded','group-moves','annealing'].includes(document.getElementById('clusteringSearch')?.value)&&document.getElementById('clusteringSearch').value!==(graph.clustering?.hypergraphSearch||'mixed');

export function cancelCanvasSettings() {
 clearTimeout(autoTimer);
 generation++; job?.cancel(); job = null;
 const record = records.get(graph);
 if (record && (record.running || !record.autoAttempted && automaticSettingsPending(graph))) { record.running = false; record.autoAttempted = true; record.status = 'Cancelled. Incomplete search results are not reported.'; draw(); }
}

export function syncCanvasSettings(next, ids, sourceBundles) {
 if (!panel) {
  panel = element('details'); panel.id = 'canvasSettings'; panel.className = 'canvas-reliability';
  document.querySelector('.community-controls').after(panel);
  badge=element('button');badge.id='autoSettingsStatus';badge.type='button';badge.className='secondary';badge.style.cssText='font-size:12px;padding:4px 9px;min-height:30px;margin:0 0 8px';
  document.getElementById('methodTitle').after(badge);
  badge.onclick=()=>{panel.open=true;revealSection(panel,true);};
 }
 if (graph === next) { if (pending()) draw(); return; }
 cancelCanvasSettings(); graph = next; articleIds = ids; bundles = sourceBundles;
 if (!records.has(graph)) records.set(graph, {report: graph.settingsSearch || null, sensitivity: graph.evidenceSensitivity || null, source: graph.sourceReliability || null, status: '', running: false, autoAttempted:false});
 draw();
 const selected=graph,record=records.get(graph);
 if (automaticSettingsPending(graph) && !record.autoAttempted && !pending() && !window.BIBLIOMAP?.active) {
  autoTimer=setTimeout(()=>{if(graph===selected&&automaticNavigationAllowed(graph)&&!pending()){record.autoAttempted=true;run('auto');}},1200);
 }
}

export function automaticSettingsPending(current) {
 if(!automaticNavigationAllowed(current))return false;
 if (current?.linkedBrowse||current?.collaboration||current?.semantic||current?.temporalSelection||current?.temporalSeries) return false;
 if (current?.trial || typeof window !== 'undefined' && window.ATLAS_TRIAL_WORKSPACE) return false;
 return (isIncidenceModel(current||{})||current?.clustering?.algorithm==='hypergraph') && current.clustering?.algorithm!=='sbm' && !current.appliedSettings && current.settingsSearch?.version!==SETTINGS_VERSION;
}

function action(parent, title, callback, disabled = false) {
 const button = element('button', title); button.type = 'button'; button.className = 'secondary'; button.disabled = disabled; button.onclick = callback; parent.append(button); return button;
}

async function run(kind) {
 if(!navigationReady(graph))return;
 if (graph?.collaboration||graph?.semantic||graph?.temporalSelection) return;
 if (pending()) return;
 window.ATLAS_EVIDENCE.cancelCanvasReliability();
 const selected = graph, record = records.get(graph), ticket = ++generation;
 record.autoAttempted=true;
 record.running = true; record.status = 'Preparing ' + method() + ' analysis…'; draw();
 try {
  await loadCommunities(); if (ticket !== generation||!navigationReady(selected)) return;
  const progress = message => { if (ticket === generation) { record.status = message; panel.dataset.validationStatus = message; panel.querySelector('[role=status]').textContent = message; } };
  const evidence = structuredClone({...graph, bundles});
  job = kind === 'sources' ? window.ATLAS_COMMUNITIES.startReliability(evidence, articleIds, 10, progress, {mode: 'sources', seedOffset: 2000}) : window.ATLAS_COMMUNITIES.startSettings(evidence, articleIds, kind, progress);
  const result = await job.promise;
  if (ticket !== generation || selected !== graph) return;
  if (kind === 'sources') { record.source = result; graph.sourceReliability = result; }
  else if (kind === 'sensitivity') { record.sensitivity = result; graph.evidenceSensitivity = result; }
  else { record.report = result; graph.settingsSearch = result; }
  window.ATLAS_EVIDENCE.recordSettingsAudit?.(graph);
  const chosen=kind==='auto'&&result.recommendation?.chosen?result.candidates.find(candidate=>candidate.id===result.recommendation.chosen):null;
  if(chosen?.validation?.samples===50){record.running=false;job=null;apply(chosen,true);return;}
  record.status = kind==='auto' ? 'Auto finished: no setting passed all stable-range safeguards. Current exploratory map retained.' : 'Complete. The displayed map is unchanged until you apply a setting.';
 } catch (error) { if (ticket === generation) record.status = 'No completed new result: ' + analysisErrorMessage(error); }
 finally { if (ticket === generation) { record.running = false; job = null; draw(); } }
 if (selected === graph) window.dispatchEvent(new CustomEvent('atlas-settings-settled', {detail: selected}));
}

function apply(candidate, automatic=false) {
 if (window.BIBLIOMAP?.active) { window.ATLAS_PROJECTS.applyCandidate(candidate); return; }
 const record = records.get(graph);
 const next = materializeSetting({...graph, bundles}, candidate);
 next.settingsSearch = record.report; next.evidenceSensitivity = null;
 next.appliedSettings = {id: candidate.id, settings: candidate.settings, validated: !!candidate.validation, automatic, experimental: candidate.algorithm === 'hypergraph'};
 window.atlasSharedCanvas.applySettings(next);
}

function draw() {
 if (!graph || !panel) return;
 if(graph.temporalSelection){badge.hidden=true;panel.dataset.validationMode='window';panel.dataset.validationRunning='false';panel.dataset.validationPhase='idle';panel.dataset.validationOutcome='';panel.dataset.validationStatus='';panel.replaceChildren(element('summary','Completed temporal window'),element('p','Independent fixed-setting window. Change the complete series settings in Time windows; no automatic per-window setting search is applied.'));return;}
 if(graph.collaboration){badge.hidden=true;panel.dataset.validationMode='collaboration';panel.dataset.validationRunning='false';panel.dataset.validationPhase='idle';panel.dataset.validationOutcome='';panel.dataset.validationStatus='';panel.replaceChildren(element('summary','Collaboration construction'),element('p','Use Collaboration maps for full/fractional counting, institution rollup, team/affiliation evidence and CPM. Citation Auto CPM does not apply.'));return;}
 if (graph.semantic) {badge.hidden = true;panel.dataset.validationMode='semantic';panel.dataset.validationRunning='false';panel.dataset.validationPhase='idle';panel.dataset.validationOutcome='';panel.dataset.validationStatus=''; panel.replaceChildren(element('summary', 'Semantic construction settings'), element('p', 'Adjust vocabulary, text evidence, topic confidence, cosine or CPM in Semantic maps. Citation Auto CPM and citation resampling are not applied.')); return;}
 delete panel.dataset.validationMode;
 if (graph.trial) {
  badge.hidden = true;
  panel.dataset.validationRunning = 'false'; panel.dataset.validationPhase = 'idle'; panel.dataset.validationOutcome = ''; panel.dataset.validationStatus = '';
  panel.replaceChildren(element('summary', 'Trial settings'), element('p', 'Adjust this method in Analysis, then Run trial. Reliability repeats the selected trial on 10 or 50 resamples; it does not choose k or apply Auto CPM.'));
  return;
 }
 panel.dataset.validationRunning = String(!!records.get(graph)?.running);
 const validationRecord = records.get(graph), recommendation = validationRecord?.report?.recommendation;
 panel.dataset.validationOutcome = recommendation ? recommendation.chosen ? 'Stable range found' : validationRecord.report.compareObjectives ? 'Objectives compared' : 'No stable range' : '';
 panel.dataset.validationStatus = validationRecord?.status || '';
 panel.dataset.validationPhase = settingsValidationState(graph);
 if (graph.clustering?.algorithm === 'sbm') { panel.replaceChildren(element('summary', 'Block-model settings · automatic description-length selection'), element('p', 'The nested model selects a hierarchy by minimum description length across three starts. Choose a hierarchy level in Additional analyses. Reliability can rerun this model on resampled evidence. CPM and Markov time do not apply.')); return; }
 const record = records.get(graph), report = record.report;
 badge.hidden=!(graph.networkModel==='hypergraph'||settingsAlgorithm(graph)==='hypergraph')||graph.clustering?.algorithm==='sbm';
 badge.textContent=settingsBadgeLabel(panel.dataset.validationPhase,record);
 badge.title='Open settings, progress and stability evidence. Current map stays visible while testing.';
 const active = (graph.appliedSettings?.automatic?'Auto · ':'')+(graph.appliedSettings?.settings.label || (settingsAlgorithm(graph) === 'infomap' ? 'Markov time ' + (graph.clustering.markovTime || 1) : settingsAlgorithm(graph) === 'hypergraph' ? (graph.clustering.hypergraphObjective || 'linear')+' · resolution '+(graph.clustering.hypergraphResolution??1) : graph.resolution == null ? 'Preparing network' : 'CPM ' + Number(graph.resolution.toPrecision(4))));
 panel.replaceChildren(element('summary', 'Find settings' + (record.running ? ' · testing…' : report ? ' · results ready' : '')));
 panel.append(element('p', method() + ' · ' + active));
 if (pending()) { panel.append(element('p', 'Waiting for the selected clustering method. Previous results cannot be applied.')); return; }
 const controls = element('div'); controls.className = 'reliability-controls';
 panel.append(element('p', 'Compare settings; apply a result to update the map.'));
 const readOnly=window.BIBLIOMAP?.active&&window.BIBLIOMAP.canCompute===false;
 action(controls, report ? 'Rerun Auto settings' : 'Find stable settings', () => run('auto'), record.running || !graph.links.length || readOnly).id = 'validationSettings';
 if(settingsAlgorithm(graph)==='hypergraph')action(controls,'Compare experimental objectives',()=>run('objectives'),record.running||!graph.links.length||readOnly);
 action(controls, 'Check evidence sensitivity', () => run('sensitivity'), record.running || !graph.links.length || readOnly);
 if (isCouplingGraph(graph)) action(controls, 'Check source sampling · 10', () => run('sources'), record.running || !graph.links.length || readOnly);
 action(controls, 'Cancel', cancelCanvasSettings, !record.running).hidden = !record.running; panel.append(controls);
 const status = element('p', record.status); status.setAttribute('role', 'status'); panel.append(status);
 const help = element('details'); help.append(element('summary', 'What Auto tests & limitations'), element('p', 'Auto keeps the evidence fixed and tests repeat starts, ten source-evidence resamples per setting, and agreement across a tested range. Eligible representatives get 50 fresh resamples. Only a confirmed representative is applied automatically; otherwise the current map stays exploratory. The map remains visible while testing. Cancel stops this search; Rerun starts it again.'), element('p', 'Leiden hypergraph sweeps bipartite CPM. Infomap sweeps Markov time (higher means broader groups). Direct hypergraph sweeps an experimental expected-baseline multiplier within the selected objective; 1 preserves the original score. Objective comparison is separate and never picks an automatic winner. Safeguards reject dominant groups and excessive tiny fragments. These are overview preferences, not proof of an optimum or thematic validation.'));
 panel.append(help);
 if (report) {
  const outcome = report.recommendation.chosen ? 'A representative passed fresh resampling within a stable tested range. Auto favors a broader overview; inspect alternatives below.' : report.compareObjectives ? 'These models define a group differently. Compare how well each holds together, then explicitly choose one; no model is declared the winner.' : 'No stable range met all safeguards. The current map remains exploratory; you can inspect and apply individual settings below.';
  panel.append(element('h3', report.recommendation.heading), element('p', outcome));
  help.append(element('p', report.recommendation.explanation));
  const chosen = report.candidates.find(candidate => candidate.id === report.recommendation.chosen);
  if (chosen) action(panel, 'Apply Auto · ' + chosen.settings.label, () => apply(chosen), record.running || readOnly);
  for (const range of report.recommendation.ranges) panel.append(element('p', 'Stable tested range: ' + range.from.toPrecision(4) + '–' + range.to.toPrecision(4)));
  const details = element('details'); details.append(element('summary', 'Compare settings / apply manually'));
  const table = element('table'), header = element('tr');
  table.style.minWidth='850px';table.style.tableLayout='auto';
  for (const label of ['Setting', 'Groups', 'Coverage', 'Start ARI', 'Recovery', 'Validation', 'Safeguards / action']) header.append(element('th', label));
  table.append(header);
  for (const candidate of report.candidates) {
   const row = element('tr');
   for (const value of [candidate.settings.label, candidate.metrics.clusters, percent(candidate.metrics.coverage), decimal(candidate.metrics.startAgreement), percent(candidate.metrics.recovery), candidate.validation ? '50 fresh' : '10 preliminary']) row.append(element('td', value));
   const cell = element('td', candidate.reasons.join('; ') || 'Pass heuristics');
   action(cell, 'Apply ' + candidate.settings.label, () => apply(candidate), record.running || readOnly); row.append(cell); table.append(row);
  }
  const wrap = element('div'); wrap.className = 'evidence-table-wrap'; wrap.append(table); details.append(wrap, element('p', report.limitations)); panel.append(details);
 }
 if (record.source) {
  const measured = recoveryMetrics(record.source);
  panel.append(element('p', 'Source-sample sensitivity: recovery ' + percent(measured.recovery) + ', retention ' + percent(measured.retention) + '. Ten 90%-source subsamples; intentionally omitted members count as losses. This differs from reference-feature resampling.'));
 }
 if (record.sensitivity) {
  const details = element('details'); details.append(element('summary', 'Evidence sensitivity results · map unchanged'));
  for (const result of record.sensitivity.results) details.append(element('p', result.label + ' · ' + result.clusters + ' groups · coverage ' + percent(result.coverage) + ' · recovery ' + percent(result.recovery) + ' · shared-node ARI ' + decimal(result.agreement)));
  details.append(element('p', record.sensitivity.limitations)); panel.append(details);
 }
}
