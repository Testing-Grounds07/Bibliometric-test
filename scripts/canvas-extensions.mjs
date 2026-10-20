import {analysisErrorMessage} from './analysis-errors.mjs';
import {edgeKey, clusterTransitions} from './network-extensions.mjs';
import {invalidateScientificOutputs} from './scientific-invalidation.mjs';
import {loadCommunities} from './community-loader.mjs';

const records = new WeakMap();
let graph, panel, job, generation = 0;
const element = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const button = (text, action) => { const node = element('button', text); node.type = 'button'; node.className = 'secondary'; node.onclick = action; return node; };
const actionRow = (...nodes) => { const row = element('div'); row.className = 'reliability-controls'; row.append(...nodes); return row; };
const description = (parent, text) => parent.append(element('p', text));
const algorithm = current => ['infomap', 'hypergraph', 'sbm'].includes(current.clustering?.algorithm) ? current.clustering.algorithm : 'leiden';

function cancel() { generation++; job?.cancel(); job = null; if (graph && records.has(graph)) { records.get(graph).running = false; draw(); } }
function workerTask(kind, current, options) {
 if (window.BIBLIOMAP?.active) return window.BIBLIOMAP.stage(current, kind === 'partition' ? 'clustering' : kind, options);
 const worker = new Worker('network-extensions-worker.js?v=coupling-errors-2');
 let rejectJob;
 const promise = new Promise((resolve, reject) => {
  rejectJob = reject;
  worker.onmessage = event => { worker.terminate(); Object.hasOwn(event.data, 'error') ? reject(new Error(analysisErrorMessage(event.data.error))) : resolve(event.data.result); };
  worker.onerror = event => { worker.terminate(); reject(new Error(analysisErrorMessage(event))); };
  worker.postMessage({kind, graph: current, options, articles: Object.values(window.ATLAS_DATA.articles)});
 });
 return {promise, cancel() { worker.terminate(); rejectJob(new Error('Analysis cancelled')); }};
}

async function run(kind, options) {
 if (graph?.semantic||graph?.collaboration||graph?.temporalSelection) return;
 const current = graph, record = records.get(current);
 cancel(); window.ATLAS_EVIDENCE.cancelCanvasReliability(); const ticket = ++generation;
 record.running = true; record.status = kind === 'temporal' ? 'Building this publication period…' : 'Checking the full analytical network…'; draw();
 try {
  job = workerTask(kind, structuredClone(current), options);
  let result = await job.promise;
  if (ticket !== generation) return;
  if (kind === 'temporal') {
   const selected = algorithm(current);
   if (selected !== 'leiden' || result.networkModel === 'hypergraph') {
    await loadCommunities(); if (ticket !== generation) return;
    job = window.ATLAS_COMMUNITIES.start(result, selected, [], message => { if (ticket === generation) { record.status = message; draw(); } }, {...current.clustering, networkModel: result.networkModel});
    result = await job.promise; if (ticket !== generation) return;
   }
   const previous = record.periods.at(-1);
   result.temporal.transitions = previous ? clusterTransitions(previous, result) : [];
   result.appliedSettings = {settings: {label: options.from + '–' + options.to + ' · source publication period'}};
   result.extensionAudit = {kind: 'temporal', ...result.temporal};
   record.periods.push(result); record.status = 'Period ready: ' + result.temporal.sourceCount + ' sources, ' + result.stats.clusters + ' groups. Choose Show period to view it.';
  } else {
   record[kind] = result; current.extensionResults = {...current.extensionResults, [kind]: result};
   record.status = result.retained + ' of ' + current.links.length + ' analytical lines retained. Show on map applies a display filter.';
  }
 } catch (error) { if (ticket === generation) record.status = analysisErrorMessage(error); }
 finally { if (ticket === generation) { record.running = false; job = null; draw(); } }
}

function showPeriod(next, replace = false) {
 const parent = graph, record = records.get(parent), snapshot = window.atlasSharedCanvas.capture();
 const navigation = replace ? {restore: record.restore, parent: record.parent} : {restore: () => window.atlasSharedCanvas.restore(snapshot), parent};
 records.set(next, {periods: [], status: '', running: false, ...next.extensionResults, ...navigation});
 window.atlasSharedCanvas.applyAnalysis(next);
 const actual = window.atlasSharedCanvas.graph();
 if (actual !== next) records.set(actual, records.get(next));
 if (graph !== actual) sync(actual); else draw(); record.status = '';
}

function numberField(parent, label, value, minimum, maximum, step = 1) {
 const wrap = element('label', label), input = element('input'); input.type = 'number'; input.value = value; input.min = minimum; input.max = maximum; input.step = step; input.setAttribute('aria-label', label);
 wrap.append(input); parent.append(wrap); return input;
}

function changeMethod() {
 if (!graph?.temporal) return false;
 const selected = document.getElementById('clusteringMethod').value, current = graph, record = records.get(current);
 cancel(); window.ATLAS_EVIDENCE.cancelCanvasReliability(); const ticket = ++generation;
 record.running = true; record.status = 'Reclustering this publication period…'; draw();
 (async () => {
  try {
   job = workerTask('partition', structuredClone({...current, networkModel: document.getElementById('networkModel').value}), {}); let next = await job.promise;
   if (ticket !== generation) return;
   if (selected !== 'leiden' || next.networkModel === 'hypergraph') {
    await loadCommunities(); if (ticket !== generation) return;
    job = window.ATLAS_COMMUNITIES.start(next, selected, [], message => { if (ticket === generation) { record.status = message; draw(); } }, {...current.clustering, hypergraphSearch:selected==='hypergraph'?document.getElementById('clusteringSearch')?.value||'mixed':undefined, networkModel: next.networkModel});
    next = await job.promise; if (ticket !== generation) return;
   }
   next.reliability = null; next.settingsSearch = null; next.themeDescriptions = null;
   next.appliedSettings = {settings: {label: next.temporal.from + '–' + next.temporal.to + ' · source publication period'}};
   record.running = false; showPeriod(next, true);
  } catch (error) { if (ticket === generation) record.status = analysisErrorMessage(error); }
  finally { if (ticket === generation) { record.running = false; job = null; draw(); } }
 })();
 return true;
}

function draw() {
 if (!panel || !graph) return;
 if(graph.temporalSelection){panel.replaceChildren(element('summary','Completed temporal window'),element('p','Return to the full pinned map for new calculations. Switching completed windows only redraws saved results.'));return;}
 if (graph.collaboration) {panel.replaceChildren(element('summary', 'Collaboration checks'),element('p','Use Collaboration maps for counting, team-size, affiliation and audited identity sensitivity. Citation significance and citation resampling do not apply.'));return;}
 if (graph.semantic) {panel.replaceChildren(element('summary', 'Semantic checks'), element('p', 'Citation-overlap significance, citation resampling and citation temporal projections do not apply here. Use the semantic text/threshold sensitivity controls.')); return;}
 if (graph.trial) {
  panel.replaceChildren(element('summary', 'Trial method & limitations'), element('p', graph.trial.result.limitations), element('p', 'Temporal reclustering, automatic settings searches and subcluster recomputation are not supported for these experimental methods. Use the main workspace for those analyses.'));
  return;
 }
 const record = records.get(graph), open = new Set([...panel.querySelectorAll('details[open]')].map(node => node.dataset.kind));
 panel.replaceChildren(element('summary', 'Additional analyses' + (graph.extensionFilter ? ' · line filter active' : graph.temporal ? ' · ' + graph.temporal.from + '–' + graph.temporal.to : '')));
 const status = element('p', record.status); status.setAttribute('role', 'status'); panel.append(status);
 if (record.running) panel.append(button('Cancel analysis', cancel));
 if (record.restore) panel.append(button('Return to parent map', record.restore));
 for (const [kind, title, explanation] of [
  ['validation', 'Unusual connections', 'Tests whether pair overlap is unusually large among sources or references of equal degree. The threshold includes correction for multiple comparisons.'],
  ['backbone', 'Network backbone', 'Keeps connections that carry a substantial share of either endpoint’s analytical weight.'],
  ['temporal', 'Research over time', 'Build a publication-year window and compare cluster membership across periods. Co-citation windows use pairwise evidence on the fixed parent reference scope.']
 ]) {
  const details = element('details'); details.dataset.kind = kind; details.open = open.has(kind); details.append(element('summary', title)); description(details, explanation);
  const controls = element('div'); controls.className = 'extension-fields';
  if (kind === 'temporal') {
   const years = Object.values(window.ATLAS_DATA.articles).map(article => article.year).filter(Number.isInteger);
   const from = numberField(controls, 'From year', record.from ?? Math.max(Math.min(...years), 2015), Math.min(...years), Math.max(...years));
   const to = numberField(controls, 'Through year', record.to ?? Math.max(...years), Math.min(...years), Math.max(...years));
   from.oninput = () => { record.from = +from.value; }; to.oninput = () => { record.to = +to.value; };
   const build = button('Build period', () => run(kind, {from: +from.value, to: +to.value})); build.disabled = record.running; details.append(controls, build);
   for (const period of record.periods) {
    const row = element('section'); description(row, period.temporal.from + '–' + period.temporal.to + ' · ' + period.temporal.sourceCount + ' sources · ' + period.stats.clusters + ' groups');
    row.append(button('Show ' + period.temporal.from + '–' + period.temporal.to, () => showPeriod(period)));
    if (period.temporal.transitions.length) {
     const transitions = element('details'); transitions.append(element('summary', 'Shared members with previous period'));
     for (const item of period.temporal.transitions.slice(0, 30)) description(transitions, 'Previous group ' + item.from + ' → this group ' + item.to + ': ' + item.count + ' shared articles');
     description(transitions, 'Group numbers are local to each period. Overlap describes membership continuity; different source cohorts can have no shared nodes. Full overlap counts are included in export.'); row.append(transitions);
    }
    details.append(row);
   }
  } else {
   const alpha = numberField(controls, kind === 'validation' ? 'Adjusted significance threshold' : 'Local weight threshold', record[kind + 'Alpha'] ?? .05, .001, .5, .01);
   alpha.oninput = () => { record[kind + 'Alpha'] = +alpha.value; };
   const calculate = button(record[kind] ? 'Rerun check' : 'Check connections', () => run(kind, {alpha: +alpha.value})); calculate.disabled = record.running;
   details.append(controls, calculate);
   if (record[kind]) {
    const result = record[kind]; description(details, result.retained + ' / ' + graph.links.length + ' lines retained at ' + result.alpha + '.');
    details.append(actionRow(button('Show on map', () => { graph.extensionFilter = {kind, alpha: result.alpha, keys: result.records.filter(item => item.retained).map(item => item.key)}; window.atlasSharedCanvas.redraw(); draw(); }), button('Clear line filter', () => { delete graph.extensionFilter; window.atlasSharedCanvas.redraw(); draw(); })));
    description(details, 'The existing Lines and cluster display filters also apply. Memberships and reliability use the full analytical network.');
    const notes = element('details'); notes.append(element('summary', 'Method & interpretation')); description(notes, result.method); description(notes, result.limitation); details.append(notes);
   }
  }
  panel.append(details);
 }
 if (graph.clustering?.algorithm === 'sbm') {
  const section = element('section'), label = element('label', 'Hierarchy level'), select = element('select'); select.setAttribute('aria-label', 'Hierarchy level');
  for (const level of graph.clustering.hierarchy || []) { const option = element('option', 'Level ' + (level.level + 1) + ' · ' + level.clusters + ' groups'); option.value = level.level; select.append(option); }
  select.value = graph.clustering.selectedLevel || 0;
  select.disabled = !graph.clustering.hierarchy?.length;
  select.onchange = () => {
   const level = graph.clustering.hierarchy[+select.value], next = invalidateScientificOutputs(structuredClone(graph));
   for (const node of next.nodes) node.cluster = level.memberships[node.id] || 0;
   next.clustering.selectedLevel = level.level; next.stats.clusters = level.clusters; next.reliability = null;
   next.appliedSettings = {settings: {label: 'Block-model hierarchy · level ' + (level.level + 1)}};
   showPeriod(next, true);
  };
  label.append(select); section.append(label);
  const modelHelp = element('details'); modelHelp.append(element('summary', 'How block models work')); description(modelHelp, graph.clustering.objective + '. ' + graph.clustering.limitations); section.append(modelHelp);
  panel.insertBefore(section, panel.querySelector('details'));
 }
 panel.append(button('Export additional analyses', () => {
  const output = {createdAt: new Date().toISOString(), sourceCorpusId: window.ATLAS_DATA.summary.corpus_id, analysis: {id: graph.analysisId, derivedFrom: graph.derivedFromAnalysisId, scope: graph.threshold, method: graph.clustering, order: graph.order, temporal: graph.temporal, nodes: graph.nodes.map(node => node.id)}, validation: record.validation, backbone: record.backbone, displayFilter: graph.extensionFilter || null, periods: record.periods};
  const url = URL.createObjectURL(new Blob([JSON.stringify(output)], {type: 'application/json'})), link = element('a'); link.href = url; link.download = 'bibliomap-additional-analyses.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 }));
}

function sync(next) {
 window.ATLAS_DESCRIPTIONS?.sync(next);
 if (next === graph) return;
 cancel(); graph = next;
 if (!records.has(next)) records.set(next, {periods: [], status: '', running: false, ...next.extensionResults});
 if (!panel) { panel = element('details'); panel.id = 'canvasExtensions'; panel.className = 'canvas-reliability'; document.getElementById('mapCaption').after(panel); }
 draw();
}

const filters = new WeakMap();
window.ATLAS_EXTENSIONS = {sync, cancel, changeMethod, accepts(current, edge) { if (!current.extensionFilter) return true; if (!filters.has(current.extensionFilter)) filters.set(current.extensionFilter, new Set(current.extensionFilter.keys)); return filters.get(current.extensionFilter).has(edgeKey(edge)); }, describeEdge(parent, edge, current) {
 const record = records.get(current), key = edgeKey(edge);
 const validation = record?.validation?.records.find(item => item.key === key);
 if (validation) description(parent, 'Degree-stratified pair overlap: ' + validation.overlap + ' · adjusted p = ' + validation.adjustedP.toPrecision(4) + '. ' + (validation.retained ? 'Passes' : 'Does not pass') + ' the selected multiple-comparison threshold. This tests the pair, not a whole higher-order combination.');
 const backbone = record?.backbone?.records.find(item => item.key === key);
 if (backbone) description(parent, 'Backbone: ' + (backbone.retained ? 'retained' : 'filtered') + ' at local threshold ' + record.backbone.alpha + '.');
}};
