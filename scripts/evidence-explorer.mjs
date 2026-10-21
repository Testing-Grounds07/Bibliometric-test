import {bindImportedThemes,importedThemeBinding,clearImportedThemes} from './imported-theme-evidence.mjs';
import './clustering-concepts.mjs';
import './canvas-extensions.mjs';
import './canvas-descriptions.mjs';
import './cluster-indicators.mjs';
import './hypergraph-view.mjs';
import {titleCase} from './label-case.mjs';
import {currentStudySummary,currentStudyMethod} from './current-study.mjs';
import {prepareCanvasSnapshot,validateCanvasPacket} from './saved-canvas.mjs';
import {connectionRoles, sourcesForCluster} from './evidence-metrics.mjs';
import {loadCommunities} from './community-loader.mjs';
import {RELIABILITY_RULES} from './evidence-guidance.mjs';
import {revealSection} from './evidence-navigation.mjs';
import {couplingCanvasGraph, couplingNodeRadius, COUPLING_METHOD} from './shared-canvas.mjs';
import {clusterFoundations} from './coupling-foundations.mjs';
import {clusterSizeFilter,hasObservedLinks} from './cluster-visibility.mjs';
import {syncCanvasReliability, showCanvasReliability, cancelCanvasReliability} from './canvas-reliability.mjs';
import {createScientificManifest} from './scientific-manifest.mjs';
import {mountSemanticBrowser} from './semantic-browser.mjs';
import {mountTemporalBrowser} from './temporal-browser.mjs';
import {completeCouplingDiagnostics, retainCouplingBaseline, reuseCouplingBaseline} from './coupling-install.mjs';
import {mountCollaborationBrowser} from './collaboration-browser.mjs';
import {analysisErrorMessage} from './analysis-errors.mjs';
import {inheritEvidenceContext} from './evidence-provenance.mjs';
import {compactSnapshotTransport} from './snapshot-transport.mjs';

const element = (tag, content = '', className = '') => {
 const node = document.createElement(tag); node.textContent = content; node.className = className; return node;
};
const button = (label, action) => { const node = element('button', label, 'secondary'); node.type = 'button'; node.onclick = action; return node; };
const paragraph = (parent, content) => parent.append(element('p', content));
const percent = value => value == null ? 'N/A' : (100 * value).toFixed(1) + '%';

const roleCache = new WeakMap();
const rolesFor = graph => { if (!roleCache.has(graph)) roleCache.set(graph, connectionRoles(graph)); return roleCache.get(graph); };
let datasetPromise, dataset, context, focusCluster, coupling, couplingRoles, referenceStability, couplingStability;
let worker, communityJob, couplingBaseline, generation = 0, mode = 'coupling';
let sourceDetails;

let contextKey, settingsAudit, draft = {minimumShared: 3, minimumCosine: .05, resolution: ''};

const mapPanel = document.querySelector('.workspace'), workspaceTabs = element('nav', '', 'workspace-tabs');
workspaceTabs.setAttribute('role', 'tablist'); workspaceTabs.setAttribute('aria-label', 'Analysis workspace');
mapPanel.id = 'cocitation-workspace'; mapPanel.setAttribute('role', 'tabpanel'); mapPanel.setAttribute('aria-labelledby', 'workspace-map');
const dialog = element('section', '', 'evidence-explorer');
dialog.id = 'evidence-workspace'; dialog.hidden = true; dialog.setAttribute('role', 'tabpanel');
mapPanel.before(workspaceTabs); mapPanel.after(dialog);
for (const [value, label] of [['map', 'Co-citation map'], ['coupling', 'Source-article coupling']]) {
 const tab = button(label, () => value === 'map' ? showMap() : open(undefined, value));
 tab.id = 'workspace-' + value; tab.dataset.view = value; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', value === 'references' ? dialog.id : mapPanel.id);
 tab.onkeydown = event => {
  const tabs = [...workspaceTabs.children], position = tabs.indexOf(tab);
  const next = event.key === 'ArrowRight' ? (position + 1) % tabs.length : event.key === 'ArrowLeft' ? (position + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
  if (next != null) { event.preventDefault(); tabs[next].focus(); tabs[next].click(); }
 }; workspaceTabs.append(tab);
}
function selectTab(value,restoreReferences=true) {
 window.ATLAS_SEMANTIC?.stop();
 window.ATLAS_TEMPORAL?.stop();
 window.ATLAS_EXTENSIONS?.cancel();
 cancelCanvasReliability();
 for (const tab of workspaceTabs.children) { const selected = tab.dataset.view === value; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
 mapPanel.hidden = value === 'references'; dialog.hidden = value === 'map';
 if(window.atlasWorkspaceShell)window.atlasWorkspaceShell.placeCoupling(dialog);else if(value === 'coupling')document.querySelector('.map-column').insertBefore(dialog,document.querySelector('.analysis-switches'));else mapPanel.after(dialog);
 mapPanel.setAttribute('aria-labelledby','workspace-'+(value === 'references'?'map':value));dialog.setAttribute('role',value === 'coupling'?'region':'tabpanel');
 if(value !== 'coupling'&&restoreReferences)window.atlasSharedCanvas?.showReferences();
 document.body.classList.toggle('evidence-mode', value === 'references');
 dialog.setAttribute('aria-labelledby', 'workspace-' + value);
 syncSkipLink();
}
function syncSkipLink() {
 const link = document.querySelector('.skip-link');
 const target = !mapPanel.hidden ? 'network' : 'evidence-workspace';
 link.href = '#' + target; link.textContent = target === 'evidence-workspace' ? 'Skip to analysis' : 'Skip to the network';
 link.onclick = event => { event.preventDefault(); revealSection(document.getElementById(target), true); };
}
function stopWorker() { generation++; worker?.terminate(); worker = null; communityJob?.cancel(); communityJob = null; }
function showMap() { stopWorker(); selectTab('map'); }
selectTab('map');

function visibilityControls(parent, nodes, state, onChange, plural='works') {
 const controls = element('div', '', 'visibility-controls'), toggle = button(state.hideUnlinked ? 'Show unlinked nodes' : 'Hide unlinked nodes', () => { state.hideUnlinked = !state.hideUnlinked; refresh(); onChange(); });
 toggle.setAttribute('aria-pressed', String(state.hideUnlinked)); controls.append(toggle);
 const sizeLabel = element('label', 'Minimum cluster size ('+plural+')', 'cluster-size-filter'), size = element('input'); size.type = 'number'; size.min = '1'; size.step = '1'; size.value = clusterSizeFilter(nodes, state.minimumClusterSize).minimum; size.setAttribute('aria-label', 'Minimum cluster size ('+plural+')'); sizeLabel.append(size); controls.append(sizeLabel);
 const changeSize = () => { const filter = clusterSizeFilter(nodes, size.value); size.value = filter.minimum; state.minimumClusterSize = filter.minimum; refresh(); onChange(); };
 size.oninput = () => { if (size.value.trim() && size.validity.valid) changeSize(); }; size.onchange = changeSize;
 const disclosure = element('details'), summary = element('summary', 'Show / hide clusters'); disclosure.append(summary);
 const choices = element('div', '', 'cluster-visibility-list'), counts = new Map();
 for (const node of nodes) if (node.cluster > 0) counts.set(node.cluster, (counts.get(node.cluster) || 0) + 1);
 for (const [cluster, count] of [...counts].sort((left, right) => left[0] - right[0])) {
  const label = element('label'), checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = !state.hiddenClusters.has(cluster);
  checkbox.onchange = () => { checkbox.checked ? state.hiddenClusters.delete(cluster) : state.hiddenClusters.add(cluster); refresh(); onChange(); };
  label.append(checkbox, document.createTextNode(`Cluster ${cluster} · ${count} ${plural}`)); choices.append(label);
 }
 const restore = button('Show all groups', () => { state.hideUnlinked = false; state.hiddenClusters.clear(); state.minimumClusterSize = 1; size.value = 1; refresh(); onChange(); });
 const hideAll = button('Hide all clusters', () => { for (const cluster of counts.keys()) state.hiddenClusters.add(cluster); for (const checkbox of choices.querySelectorAll('input')) checkbox.checked = false; refresh(); onChange(); });
 const search = element('input'); search.type = 'search'; search.placeholder = 'Find a cluster by number…'; search.setAttribute('aria-label', 'Find cluster visibility option');
 search.oninput = () => { for (const row of choices.children) row.hidden = !row.textContent.toLowerCase().includes(search.value.trim().toLowerCase()); };
 disclosure.append(restore, hideAll, search, choices); controls.append(disclosure);
 const note = element('p', '', 'field-note'); controls.append(note);
 function refresh() {
  const filter = clusterSizeFilter(nodes, state.minimumClusterSize), hidden = new Set([...state.hiddenClusters, ...filter.hiddenClusters]);
  for (const [position, [cluster]] of [...counts].sort((left, right) => left[0] - right[0]).entries()) { const checkbox = choices.children[position].querySelector('input'); checkbox.disabled = filter.hiddenClusters.has(Number(cluster)); checkbox.checked = !checkbox.disabled && !state.hiddenClusters.has(cluster); checkbox.title = checkbox.disabled ? 'Below the minimum cluster size. Lower the minimum to show this group.' : ''; }
  toggle.textContent = state.hideUnlinked ? 'Show unlinked nodes' : 'Hide unlinked nodes'; toggle.setAttribute('aria-pressed', String(state.hideUnlinked)); summary.textContent = `Show / hide clusters${hidden.size ? ' · ' + hidden.size + ' hidden' : ''}`;
  note.textContent = `${filter.hiddenClusters.size} clusters below ${filter.minimum} ${plural} · ${state.hiddenClusters.size} manually hidden. Display only.`; note.title = 'Small clusters are hidden from the canvas and tiles. Counts use full cluster membership. Unlinked nodes are controlled separately. Memberships, reliability and analytical edges stay unchanged.';
 }
 refresh(); parent.append(controls);
}

async function loadData() {
 if (!datasetPromise) datasetPromise = fetch('source-evidence.json?v=dedup-1').then(response => {
  if (!response.ok) throw new Error('Source evidence could not be loaded'); return response.json();
 }).then(result => {
  if (result.sourceCorpusId !== window.ATLAS_DATA.summary.corpus_id) throw new Error('Source evidence corpus mismatch');
  dataset = result; return result;
 }).catch(error => { datasetPromise = null; throw error; });
 return datasetPromise;
}

function runWorker(request, onResult) {
 if (window.BIBLIOMAP?.active) {
  stopWorker(); const ticket = generation, progress = dialog.querySelector('.evidence-progress');
  const stage = request.action === 'compare-coupling' ? 'coupling-scan' : 'reliability';
  communityJob = window.BIBLIOMAP.stage(window.atlasSharedCanvas.graph(), stage, {samples:request.samples || 10}, message => { if(progress) progress.textContent=message; });
  communityJob.promise.then(value => { if(ticket===generation) onResult(request.action==='compare-coupling'?{audit:value}:{stability:value}); }).catch(problem => { if(progress) progress.textContent=analysisErrorMessage(problem); }); return;
 }
 worker?.terminate(); communityJob?.cancel(); communityJob = null; const ticket = ++generation;
 const progress = dialog.querySelector('.evidence-progress');
 progress.textContent = 'Preparing analysis…';
 worker = new Worker('evidence-worker.js?v=coupling-errors-2');
 worker.onmessage = event => {
  if (ticket !== generation) return;
  if (event.data.progress) { progress.textContent = event.data.progress; return; }
  worker.terminate(); worker = null;
  if (Object.hasOwn(event.data, 'error')) { progress.textContent = 'Analysis failed: ' + analysisErrorMessage(event.data.error); return; }
  progress.textContent = 'Analysis complete.'; onResult(event.data);
 };
 worker.onerror = event => { if (ticket === generation) { progress.textContent = 'Analysis failed: ' + analysisErrorMessage(event); worker?.terminate(); worker = null; } };
 worker.postMessage(request);
}

function scopeArticles() {
 return context?.graph?sourcesForCluster(dataset.articles, context.graph, focusCluster):dataset.articles;
}
const fullSourceScope = () => window.atlasSharedCanvas?.currentCorpus() ? 'All project source articles' : 'All conservative source articles';

function shell() {
 dialog.replaceChildren();
 if(mode==='coupling')window.atlasSharedCanvas?.showCoupling(coupling,contextKey+'|'+focusCluster,coupling?.temporal?coupling.scopeLabel:focusCluster==null?fullSourceScope():'Sources citing reference cluster '+focusCluster);
 document.getElementById('clusteringMethod').disabled = mode === 'coupling' && !dataset;
 const header = element('header', '', 'evidence-header');
 const exportAction = button('Export evidence JSON', exportEvidence); exportAction.dataset.workspaceGroup = 'export';
 header.append(element('h2', mode === 'coupling' ? 'Source-article coupling' : 'Roles & reliability'), exportAction);
 if (mode === 'coupling' && coupling) { const jump = button('Jump to coupling map', () => revealSection(document.getElementById('network'), true)); jump.dataset.workspaceGroup = 'resources'; header.append(jump); }
 header.id = 'evidence-settings';
 dialog.append(header);
 paragraph(dialog, coupling?.temporal ? coupling.scopeLabel + '. Rebuild uses the parent source scope; Return to parent map restores its saved view.' : focusCluster == null ? fullSourceScope() + '.' : `Sources citing at least one reference in Cluster ${focusCluster}. This is a structural connection, not a relevance decision.`);
 if (focusCluster != null) dialog.append(button('Use all source articles / reference clusters', () => open(null, mode)));
 const progress = element('p', '', 'evidence-progress'); progress.setAttribute('role', 'status'); dialog.append(progress);
 if (!dataset) { progress.textContent = 'Loading full source reference lists…'; return; }
 if (mode === 'coupling') {
  couplingPanel();
  const settings = element('details', '', 'coupling-settings');settings.append(element('summary','Evidence thresholds & rebuild'));
  for(const child of [...dialog.children])if(child!==header&&child!==progress)settings.append(child);dialog.append(settings);
 }
 syncSkipLink();
}

async function open(cluster, selectedMode = 'coupling') {
 if (selectedMode === 'references') { showCanvasReliability(cluster); return; }
 const next = window.atlasEvidenceContext?.();
 if (!next?.graph) {if(window.atlasSharedCanvas?.isCoupling()&&coupling){mode='coupling';selectTab('coupling',false);shell();}return;}
 const graph = next.graph, key = JSON.stringify([graph.clustering?.algorithm, graph.analysisId, graph.order, graph.maximumOrder, graph.resolution, graph.threshold, graph.minimumSupport, graph.drillPath, graph.nodes.map(node => [node.id, node.cluster]), graph.links.map(edge => [edge.source, edge.target, edge.strength, edge.count]), next.articleIds]);
 const changed = key !== contextKey, nextFocus = cluster === undefined ? changed ? null : focusCluster : cluster;
 if (changed || nextFocus !== focusCluster) {
  coupling = null; couplingBaseline = null; couplingRoles = null; couplingStability = null; settingsAudit = null;

  draft = {minimumShared: 3, minimumCosine: .05, resolution: ''};
 }
 if (changed) referenceStability = null;
 context = next; contextKey = key; focusCluster = nextFocus; mode = selectedMode;
 stopWorker(); selectTab(mode); shell();
 const ticket = generation;
 try { await loadData(); if (ticket === generation && !dialog.hidden) { shell(); if (!coupling) autoCoupling(); } }
 catch (error) { if (ticket === generation) dialog.querySelector('.evidence-progress').textContent = analysisErrorMessage(error) + '. Switch tabs to retry.'; }
}

let inputSequence = 0;
function autoCoupling() {
 const current = {minimumShared: +draft.minimumShared, minimumCosine: +draft.minimumCosine, resolution: +draft.resolution || null};
 buildCoupling(current);
}
function labeled(parent, label, input) {
 const wrapper = element('div', '', 'evidence-field'), caption = element('label', label);
 input.id = 'evidence-input-' + ++inputSequence; caption.htmlFor = input.id;
 wrapper.append(caption, input); parent.append(wrapper); return input;
}

function couplingPanel() {
 const articles = scopeArticles(), available = articles.filter(article => article.references.length).length;
 paragraph(dialog, `${available}/${articles.length} sources have reference lists; completeness unknown.`);
 const controls = element('div', '', 'evidence-controls');
 const minimum = element('input'); minimum.type = 'number'; minimum.required = true; minimum.min = '1'; minimum.max = '1000'; minimum.value = draft.minimumShared;
 labeled(controls, 'Minimum shared references', minimum);
 const cosine = element('input'); cosine.type = 'number'; cosine.required = true; cosine.min = '0'; cosine.max = '1'; cosine.step = '.01'; cosine.value = draft.minimumCosine;
 labeled(controls, 'Minimum cosine similarity (analytical)', cosine);
 const resolution = element('input'); resolution.type = 'number'; resolution.min = '.000001'; resolution.step = 'any'; resolution.placeholder = 'Blank: density ÷ 4'; resolution.value = draft.resolution;
 labeled(controls, 'CPM resolution', resolution);
 const alternative = ['infomap', 'hypergraph', 'sbm'].includes(document.getElementById('clusteringMethod').value) || document.getElementById('networkModel').value === 'hypergraph';
 resolution.disabled = alternative; resolution.parentElement.hidden = alternative;
 const currentCPM = coupling?.resolution;
 resolution.parentElement.append(element('small', (currentCPM ? 'Current map: CPM ' + Number(currentCPM.toPrecision(4)) + '. ' : '') + 'Blank rebuild uses the density-based starting value.', 'field-note'));
 const valid = () => minimum.reportValidity() && cosine.reportValidity() && resolution.reportValidity() && Number.isInteger(+minimum.value) && +minimum.value >= 1;
 const remember = () => { draft = {minimumShared: minimum.value, minimumCosine: cosine.value, resolution: resolution.value}; };
 for (const input of [minimum, cosine, resolution]) input.oninput = remember;
 const build = button(coupling ? 'Rebuild coupling' : 'Build coupling network', () => { if (valid()) buildCoupling({minimumShared: +minimum.value, minimumCosine: +cosine.value, resolution: +resolution.value || null}); });
 controls.append(build, button('Compare thresholds + CPM', () => {
  if (!valid()) return;
  if (document.getElementById('clusteringMethod').value !== 'leiden' || document.getElementById('networkModel').value === 'hypergraph') { dialog.querySelector('.evidence-progress').textContent = 'Use Find settings for the active algorithm and network model. This threshold comparison evaluates ordinary pairwise Leiden only.'; return; }
  runWorker({action: 'compare-coupling', articles, current: {minimumShared: +minimum.value, minimumCosine: +cosine.value, resolution: +resolution.value || null}}, result => { settingsAudit = result.audit; shell(); });
 })); controls.lastElementChild.disabled = alternative; dialog.append(controls);
 const explanation = element('details'); explanation.append(element('summary', 'How coupling works')); dialog.append(explanation);
 paragraph(explanation, `${articles.length - available} sources have insufficient reference metadata. All available references are used, including rarely cited works. Thresholds change which analytical connections qualify.`);
 paragraph(explanation, 'Auto settings tests clustering on the current network. Compare thresholds + CPM also changes which connections qualify; its results are applied only when you choose a setting. Switching tabs cancels unfinished work.');
 if (settingsAudit && !alternative) settingsComparison(dialog, settingsAudit);
 paragraph(explanation, 'Pair connections use shared references ÷ √(reference count A × reference count B). Leiden uses ten CPM starts; blank CPM uses scaled density ÷ 4 as an exploratory starting point. Infomap uses weighted pair flow; hypergraph uses whole groups citing the same reference. A Leiden baseline is calculated for comparison. Thresholds change analysis; canvas filters only change display.');
 if (!coupling) return;
 paragraph(dialog, `Displayed analysis: shared ≥${coupling.minimumShared}, cosine ≥${coupling.minimumCosine}, CPM ${coupling.resolution == null ? 'not applicable · ' + coupling.clustering.label : Number(coupling.resolution.toPrecision(4))}. Editing controls does not change it until you rebuild.`);
 const linked = new Set(coupling.links.flatMap(edge => [edge.source, edge.target]));
 paragraph(explanation, `${coupling.clustering.clusters} coupling clusters · ${coupling.fragmentation.components} disconnected components · ${linked.size} linked sources · ${coupling.nodes.length - linked.size} unlinked sources · ${coupling.links.length.toLocaleString()} analytical edges · CPM ${coupling.resolution == null ? 'not applicable · ' + coupling.clustering.label : coupling.resolution.toPrecision(5)}. Small isolated groups are not necessarily distinct themes. Unlinked does not mean irrelevant.`);
 const views = element('div', '', 'evidence-controls');
 views.append(button('Roles & reliability in the canvas ↓', () => showCanvasReliability()));
 paragraph(explanation, coupling.clustering.method || coupling.clustering.limitations || 'Leiden CPM uses the cosine-weighted pair network.');
 if (coupling.comparison) paragraph(explanation, 'Agreement with the Leiden baseline (adjusted Rand index): ' + (coupling.comparison.adjustedRandIndex?.toFixed(3) ?? 'undefined') + '. Agreement is not validation; cluster numbers do not correspond.');
 dialog.append(views);

}

function buildCoupling(settings, reuse = false) {
 if (window.BIBLIOMAP?.active) { window.ATLAS_PROJECTS.coupling({...settings,sourceMembers:focusCluster==null?null:scopeArticles().map(article=>article.id)}); return; }
 cancelCanvasReliability();
 const algorithm = document.getElementById('clusteringMethod').value;
 const networkModel = algorithm === 'hypergraph' || document.getElementById('networkModel').value === 'hypergraph' ? 'hypergraph' : 'pairwise';
 draft = {...settings, resolution: settings.resolution || ''};
 const evidenceParent=context?.graph||window.atlasSharedCanvas.currentCorpus?.()?.graph,sourceCorpusId=dataset.sourceCorpusId;
 const install = async result => {
  const ticket = generation;
  result.graph.networkModel = networkModel;
  if (algorithm !== 'leiden' || networkModel === 'hypergraph') {
   try {
   await loadCommunities();
    if (ticket !== generation) return;
    communityJob = window.ATLAS_COMMUNITIES.start(result.graph, algorithm, [], message => { if (ticket === generation) dialog.querySelector('.evidence-progress').textContent = message; }, {networkModel, hypergraphSearch:algorithm==='hypergraph'?document.getElementById('clusteringSearch')?.value||'mixed':undefined, resolution: networkModel === 'hypergraph' ? null : settings.resolution});
    result.graph = await communityJob.promise;
    if (ticket !== generation) return;
    communityJob = null; result.roles = connectionRoles(result.graph);
   } catch (error) { if (ticket === generation) dialog.querySelector('.evidence-progress').textContent = 'Analysis failed; previous map retained: ' + analysisErrorMessage(error); return; }
  }
  try{coupling=inheritEvidenceContext(result.graph,evidenceParent,sourceCorpusId);}catch(problem){dialog.querySelector('.evidence-progress').textContent=analysisErrorMessage(problem);return;}coupling.deduplication = dataset.deduplication; couplingRoles = result.roles; couplingStability = null;

  if (algorithm === 'leiden' && networkModel !== 'hypergraph' && settingsAudit?.validation && settings.minimumShared === settingsAudit.validation.minimumShared && settings.minimumCosine === settingsAudit.validation.minimumCosine && settings.resolution === settingsAudit.validation.resolution) {
   couplingStability = {samples: 50, seed: settingsAudit.seed, seedOffset: 100, restarts: 2, resamplingUnit: 'Distinct available reference IDs, with replacement', clusters: settingsAudit.validationClusters, limitations: settingsAudit.limitations};
  }
  if (couplingStability) coupling.reliability = {...couplingStability, algorithm: 'leiden', method: 'Leiden CPM', preliminary: false};
  window.ATLAS_STARTUP_NAVIGATION?.installed();
  shell();
 };
 const baseline = reuse ? reuseCouplingBaseline(couplingBaseline, settings) : null;
 if (baseline) {
  stopWorker();
  dialog.querySelector('.evidence-progress').textContent = 'Reusing completed coupling evidence; changing clustering only…';
  void install({graph: baseline, roles: connectionRoles(baseline)});
 } else runWorker({action: 'coupling', articles: scopeArticles(), ...settings}, result => {
  couplingBaseline = retainCouplingBaseline(result.graph, settings);
  void install(result);
 });
}

function settingsComparison(parent, audit) {
 const section = element('section', '', 'settings-comparison'); section.append(element('h3', audit.status === 'promising' ? 'Promising settings—not a proven optimum' : 'No clear best settings'));
 paragraph(section, audit.outcome);
 const chosen = audit.validation;
 if (chosen) {
  paragraph(section, `Selected trade-off: ≥${chosen.minimumShared} shared references · cosine ≥${chosen.minimumCosine} · CPM ${chosen.resolution.toPrecision(5)} · ${chosen.clusters} groups. Additional 50-resample check: ${percent(chosen.coverage)} of all sources connected; ${percent(chosen.recovery)} member-weighted group recovery; ${percent(chosen.retention)} connected-member retention.`);
  if (chosen.reasons.length) paragraph(section, 'Safeguards not met: ' + chosen.reasons.join('; ') + '.');
  section.append(button(audit.status === 'promising' ? 'Apply promising settings' : 'Try exploratory trade-off', () => buildCoupling({minimumShared: chosen.minimumShared, minimumCosine: chosen.minimumCosine, resolution: chosen.resolution})));
 }
 const details = element('details'); details.append(element('summary', `Compare all ${audit.candidates.length} tested settings & method`));
 paragraph(details, 'Recovery below uses eight screening resamples. The selected setting is separately checked above on 50 additional resamples. Coverage includes all scoped sources, including those with missing references. Cluster counts exclude unlinked sources. These scores are not probabilities of correctness.');
 const table = element('table'); table.append(tableHeading(['Shared ≥', 'Cosine ≥', 'CPM', 'Groups', 'Connected', 'Recovery', 'Safeguards', 'Use']));
 for (const candidate of audit.candidates) {
  const row = element('tr');
  for (const value of [candidate.minimumShared, candidate.minimumCosine, candidate.resolution.toPrecision(4), candidate.clusters, percent(candidate.coverage), percent(candidate.recovery), candidate.reasons.join('; ') || 'Pass screening']) row.append(element('td', value));
  const action = element('td'); action.append(button('Use setting ' + candidate.id, () => buildCoupling({minimumShared: candidate.minimumShared, minimumCosine: candidate.minimumCosine, resolution: candidate.resolution}))); row.append(action); table.append(row);
 }
 const wrap = element('div', '', 'evidence-table-wrap'); wrap.append(table); details.append(wrap); paragraph(details, audit.method); paragraph(details, audit.limitations || 'No eligible edges in the tested grid.'); section.append(details); parent.append(section);
}

function roleDetails(parent, role) {
 if (!role) return;
 parent.append(element('h3', role.label));
 if (role.partitionAssessed === false) { paragraph(parent, `${role.degree} neighbors · total connection weight ${role.strength}. Community assignment was not executed or this node is unassigned; participation and within-community position are not assessed.`); return; }
 paragraph(parent, `${role.degree} neighbors · external connection weight ${percent(role.externalShare)} · participation ${role.participation == null ? 'N/A' : role.participation.toFixed(3)} · within-cluster strength z ${role.withinClusterZ == null ? 'N/A (no variation)' : role.withinClusterZ.toFixed(2)}.`);
 paragraph(parent, 'Participation measures how evenly connection weight spans clusters; it is not relevance or importance. Roles use all analytical edges, before display filtering. Methods references can be generic connectors.');
 if (role.connectedClusters.length) paragraph(parent, 'Connected clusters: ' + role.connectedClusters.join(', ') + '.');
}

function tableHeading(labels) {
 const header = element('thead'), row = element('tr');
 for (const label of labels) { const cell = element('th', label); cell.scope = 'col'; row.append(cell); }
 header.append(row); return header;
}

const foundationCache = new WeakMap();
let foundationGraph, foundationPreference, foundationCluster, foundationThemes;
function renderFoundations(preferredCluster, themes) {
 let panel = document.getElementById('couplingFoundations');
 if (!panel) {
  panel = element('section', '', 'coupling-foundations'); panel.id = 'couplingFoundations'; panel.setAttribute('aria-label', 'Shared foundations of coupling clusters');
  document.getElementById('mapCaption').after(panel);
 }
 panel.hidden = !window.atlasSharedCanvas?.isCoupling() || !coupling;
 if (panel.hidden) return;
 if (foundationGraph === coupling && foundationPreference === preferredCluster && foundationThemes === themes) return;
 const previousGraph = foundationGraph; foundationGraph = coupling; foundationPreference = preferredCluster; foundationThemes = themes;
 const counts = new Map();
 for (const article of coupling.nodes) if (article.cluster > 0) counts.set(article.cluster, (counts.get(article.cluster) || 0) + 1);
 const groups = [...counts].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
 foundationCluster = counts.has(Number(preferredCluster)) ? Number(preferredCluster) : previousGraph === coupling && counts.has(foundationCluster) ? foundationCluster : groups[0]?.[0];
 panel.replaceChildren(element('h3', 'Shared foundations'));
 paragraph(panel, 'The references most frequently cited by articles in each coupling cluster. Counts use the full cluster, regardless of canvas filters. Shared means cited by at least two members—not necessarily by every member, and not unique to this cluster.');
 if (!groups.length) { paragraph(panel, 'Build a network with linked clusters to inspect shared foundations. Unlinked sources are not a cluster.'); return; }
 const select = element('select'); select.id = 'foundationCluster';
 const label = element('label', 'Foundations for cluster'); label.htmlFor = select.id;
 for (const [cluster, count] of groups) select.append(new Option(`Cluster ${cluster}${themes?.[cluster] ? ' · ' + titleCase(themes[cluster].heading) : ''} · ${count} articles`, String(cluster)));
 select.value = String(foundationCluster); panel.append(label, select);
 const results = element('div'); results.setAttribute('aria-live', 'polite'); panel.append(results);
 function show() {
  foundationCluster = Number(select.value); results.replaceChildren();
  if (!foundationCache.has(coupling)) foundationCache.set(coupling, new Map());
  const cache = foundationCache.get(coupling);
  if (!cache.has(foundationCluster)) cache.set(foundationCluster, clusterFoundations(coupling.nodes, foundationCluster));
  const record = cache.get(foundationCluster);
  paragraph(results, `${record.references.length.toLocaleString()} shared foundations · ${record.members} cluster articles · ${record.withReferences} with available reference lists. Sorted by citing-article count. Missing reference metadata may understate sharing; this is not a relevance or significance score.`);
  if (!record.references.length) { paragraph(results, 'No reference appears in at least two members’ available reference lists.'); return; }
  const search = element('input'); search.type = 'search'; search.placeholder = 'Find a foundation by title, author or ID…'; search.setAttribute('aria-label', 'Search shared foundations'); results.append(search);
  const list = element('div', '', 'foundation-list'), status = element('p', '', 'field-note'); results.append(list, status);
  let limit = 20;
  const more = button('Show 20 more foundations', () => { limit += 20; draw(); }); results.append(more);
  function draw() {
   const query = search.value.trim().toLowerCase(), matches = record.references.filter(reference => ((dataset.referenceLabels[reference.id] || '') + ' ' + reference.id).toLowerCase().includes(query));
   list.replaceChildren();
   for (const reference of matches.slice(0, limit)) {
    const row = element('details'); row.append(element('summary', `${dataset.referenceLabels[reference.id] || reference.id} — ${reference.count}/${record.members} articles (${(100 * reference.share).toFixed(1)}%)`));
    row.addEventListener('toggle', () => {
     if (!row.open || row.dataset.loaded) return; row.dataset.loaded = 'true';
     const link = element('a', 'Open cited reference ↗'); link.href = reference.id; link.target = '_blank'; link.rel = 'noopener'; row.append(link);
     paragraph(row, 'Cluster articles citing this reference:');
     for (const id of reference.sources) { const article = coupling.nodes.find(node => node.id === id); row.append(button(`${article.title || id}${article.year ? ' (' + article.year + ')' : ''}`, () => window.atlasSharedCanvas.selectSource(id))); }
    }); list.append(row);
   }
   status.textContent = `Showing ${Math.min(limit, matches.length)} of ${matches.length} matching foundations.`; more.hidden = matches.length <= limit;
  }
  search.oninput = () => { limit = 20; draw(); }; draw();
 }
 select.onchange = show; show();
}

function inspectSource(article) {
 sourceDetails.scrollTop = 0;
 sourceDetails.replaceChildren(button('Back to coupling network', () => revealSection(document.getElementById('network'), true)), element('h3', article.title));
 sourceDetails.append(button('Clear selection · return to foundation labels', () => window.atlasSharedCanvas.clearSelection()));
 if(article.outsideWindow)paragraph(sourceDetails,'Outside this publication window: retained only as unassigned context. Its bibliography is not used here; return to the full pinned map for its complete retained reference evidence.');
 paragraph(sourceDetails, `${article.authors || 'Authors unknown'} · ${article.yearLabel || article.year || 'year unknown'} · ${article.references.length} available references. ${article.referenceMetadata || 'Reference coverage retained as supplied'}.`);
 if(article.deduplicationNote){paragraph(sourceDetails,article.deduplicationNote);const provenance=element('details');provenance.append(element('summary','Combined source records'));for(const record of article.mergedRecords||[])paragraph(provenance,`${record.year||'Year unknown'} · ${record.title} · ${record.id}${record.doi?' · '+record.doi:''}`);sourceDetails.append(provenance);}
 const link = element('a', 'Open source article ↗'); link.href = article.id; link.target = '_blank'; link.rel = 'noopener'; sourceDetails.append(link);
 roleDetails(sourceDetails, couplingRoles[article.id]);
 const references = new Set(article.references), foundations = new Map();
 for (const node of context?.graph?.nodes||[]) if (node.cluster > 0 && references.has(node.key)) {
  if (!foundations.has(node.cluster)) foundations.set(node.cluster, []);
  foundations.get(node.cluster).push(node);
 }
 sourceDetails.append(element('h3', 'Connections to the co-citation map'));
 if (!context?.graph) paragraph(sourceDetails, 'The saved finding does not retain a completed co-citation parent. Open a saved co-citation result from this study to inspect that relationship; no unrelated map is substituted.');
 else if (!foundations.size) paragraph(sourceDetails, 'No references in the currently selected co-citation clusters. This does not establish irrelevance.');
 for (const [cluster, nodes] of foundations) {
  const section = element('details'); section.append(element('summary', `Reference cluster ${cluster}: ${nodes.length} cited works`));
  for (const node of nodes) section.append(button(node.label, () => { showMap(); window.atlasInspectReference(node.id); }));
  sourceDetails.append(section);
 }
 const evidence = element('details'); evidence.append(element('summary', 'All ' + article.references.length + ' available references'));
 for (const id of article.references) { const item = element('p'), reference = element('a', dataset.referenceLabels[id] || id); reference.href = id; reference.target = '_blank'; reference.rel = 'noopener'; item.append(reference); evidence.append(item); }
 sourceDetails.append(evidence);
 revealSection(sourceDetails);
}

function inspectPair(edge) {
 sourceDetails.scrollTop = 0;
 sourceDetails.replaceChildren(button('Back to coupling network', () => revealSection(document.getElementById('network'), true)), element('h3', edge.count + ' shared references'));
 paragraph(sourceDetails, `Cosine similarity ${edge.strength.toFixed(4)}. Shared references do not establish agreement, topical relevance or causation.`);
 for (const id of [edge.source, edge.target]) { const article = coupling.nodes.find(node => node.id === id); sourceDetails.append(button(article.title, () => window.atlasSharedCanvas.selectSource(article.id))); }
 for (const id of edge.references) { const item = element('p'), link = element('a', dataset.referenceLabels[id] || id); link.href = id; link.target = '_blank'; link.rel = 'noopener'; item.append(link); sourceDetails.append(item); }
 revealSection(sourceDetails);
}


async function exportEvidence() {
 const studySummary=window.atlasSharedCanvas?.studySummary?.();
 const completed=window.atlasSharedCanvas.graph(),exportedCoupling=window.atlasSharedCanvas.isCoupling()?completed:coupling;
 const output = {version: 1, createdAt: new Date().toISOString(), sourceCorpusId: dataset?.sourceCorpusId, incidenceHash: dataset?.incidenceHash, focusReferenceCluster: focusCluster, parentAnalysis: context?.graph?{clustering: context.graph.clustering, comparison: context.graph.comparison || null, hyperedges: context.graph.hyperedges || null, analysisId: context.graph.analysisId, order: context.graph.order, maximumOrder: context.graph.maximumOrder, resolution: context.graph.resolution, threshold: context.graph.threshold, drillPath: context.graph.drillPath || [], memberships: Object.fromEntries(context.graph.nodes.map(node => [node.id, node.cluster]))}:null, referenceRoles: context?.graph?rolesFor(context.graph):null, referenceStability, coupling:exportedCoupling, couplingRoles, couplingStability, display: window.atlasSharedCanvas?.isCoupling()?window.atlasSharedCanvas.displayState():{}, limitations: 'Exploratory structural evidence, not automatic relevance decisions. Coupling uses all available references; completeness unknown. Analysis results are downloadable, not automatically persisted to Neo4j.'};
 output.version = 2; output.settingsAudit = settingsAudit; output.reliabilityInterpretationRules = RELIABILITY_RULES;
 output.temporalSeries=completed.temporalSeries||null;output.temporalSelection=completed.temporalSelection||null;output.burstReport=completed.burstReport||null;output.evidenceProvenance=completed.evidenceProvenance||null;

 output.scientificManifest = await createScientificManifest(exportedCoupling || context?.graph, dataset?.articles || Object.values(window.ATLAS_DATA?.articles || {}));
 if(studySummary)output.summary=studySummary;
 const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], {type: 'application/json'})), link = element('a'); link.href = url; link.download = 'bibliomap-linked-evidence.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.ATLAS_EVIDENCE = {
 bindImportedThemes,importedThemeBinding,clearImportedThemes,
 compactSnapshotTransport,
 currentStudySummary,currentStudyMethod,
 prepareCanvasSnapshot,validateCanvasPacket,
 showReferenceWorkspace(){mode='references';selectTab('map',false);},
 adoptCoupling(next,parentGraph=null){next=completeCouplingDiagnostics(next);context=parentGraph?{graph:parentGraph}:null;contextKey='saved-'+dataset.sourceCorpusId;mode='coupling';focusCluster=null;coupling=next;couplingBaseline=null;couplingRoles=connectionRoles(next);couplingStability=next.reliability;draft={minimumShared:next.minimumShared,minimumCosine:next.minimumCosine,resolution:next.resolution||''};selectTab('coupling',false);return next;},
 showCouplingControls(){shell();},
 prepareDataset: loadData,
 restoreCoupling(next) { next=completeCouplingDiagnostics(next);context = window.atlasEvidenceContext(); contextKey = 'saved-' + dataset.sourceCorpusId; mode = 'coupling'; focusCluster = null; selectTab('coupling'); coupling = next; couplingBaseline = null; couplingRoles = connectionRoles(next); couplingStability = next.reliability; draft = {minimumShared: next.minimumShared, minimumCosine: next.minimumCosine, resolution: next.resolution || ''}; shell(); },
 setDataset(next) { stopWorker(); cancelCanvasReliability(); dataset = next; datasetPromise = next ? Promise.resolve(next) : null; context = null; contextKey = null; focusCluster = null; coupling = null; couplingBaseline = null; couplingRoles = null; couplingStability = null; settingsAudit = null;mode='references'; dialog.replaceChildren(); selectTab('map',false); },
 applyCouplingSettings(next) { next=completeCouplingDiagnostics(next);mode='coupling';selectTab('coupling');cancelCanvasReliability(); coupling = next; couplingBaseline = null; couplingRoles = connectionRoles(next); couplingStability = next.reliability; draft.resolution = next.resolution || ''; shell(); },
 recordSettingsAudit(graph) { if (graph.canvasKind === 'coupling' && coupling) { coupling.settingsSearch = graph.settingsSearch; coupling.evidenceSensitivity = graph.evidenceSensitivity; coupling.sourceReliability = graph.sourceReliability; } },
 loadCommunities,
 errorMessage: analysisErrorMessage,
 syncCanvasReliability, showCanvasReliability, cancelCanvasReliability,
 recordCanvasReliability(graph, result) { if (graph.canvasKind === 'coupling') { couplingStability = result; if (coupling) coupling.reliability = result; } else referenceStability = result; },
 foundationLabel(node) { const label = dataset?.referenceLabels[node.foundation?.id] || node.foundation?.id; if (!label) return null; const title = label.includes(', ') ? label.slice(label.indexOf(', ') + 2) : label; return 'Shares: ' + (title.length > 48 ? title.slice(0, 45) + '…' : title); },
 renderFoundations,
 changeCouplingMethod() { if (mode !== 'coupling' || !dataset) return; const input = dialog.querySelector('input[placeholder="Blank: density ÷ 4"]'); for (const button of dialog.querySelectorAll('button')) if (button.textContent === 'Compare thresholds + CPM') button.disabled = document.getElementById('clusteringMethod').value !== 'leiden'; const audit = dialog.querySelector('.settings-comparison'); if (audit) audit.hidden = document.getElementById('clusteringMethod').value !== 'leiden'; if (input) { input.disabled = document.getElementById('clusteringMethod').value !== 'leiden'; input.parentElement.hidden = input.disabled; } buildCoupling({minimumShared: +draft.minimumShared, minimumCosine: +draft.minimumCosine, resolution: +draft.resolution || null}, true); },
 couplingCanvasGraph,
 couplingNodeRadius,
 couplingMethod: COUPLING_METHOD,
 exportCanvasEvidence: exportEvidence,
 inspectCanvasSource(id, container) { sourceDetails=container;const article=coupling?.nodes.find(node=>node.id===id);if(article)inspectSource(article); },
 inspectCanvasPair(edge, container) { sourceDetails=container;inspectPair(edge); },
 open,
 revealSection,
 visibilityControls,
 clusterSizeFilter,hasObservedLinks,
 addClusterActions(parent, graph, cluster) {
  if (!(cluster > 0)) return;
  if (graph.trial) { parent.append(button('Cluster roles & stability', () => showCanvasReliability(cluster))); return; }
  parent.append(element('h3', 'Linked evidence'), button('Explore sources citing this cluster', () => open(cluster)), button('Cluster roles & stability', () => open(cluster, 'references')));
 },
 addNodeRole(parent, graph, id) { const section = element('section', '', 'evidence-role'); roleDetails(section, rolesFor(graph)[id]); parent.append(section); }
};
window.ATLAS_EVIDENCE.showEntityWorkspace = kind => {stopWorker();mode=kind;mapPanel.hidden=false;dialog.hidden=true;document.body.classList.remove('evidence-mode');for(const tab of workspaceTabs.children){const selected=tab.id==='workspace-'+kind;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}};
window.ATLAS_EVIDENCE.showSemanticWorkspace=()=>window.ATLAS_EVIDENCE.showEntityWorkspace('semantic');
mountSemanticBrowser();
mountTemporalBrowser();
mountCollaborationBrowser();
