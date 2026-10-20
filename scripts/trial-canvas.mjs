import {analysisErrorMessage} from './analysis-errors.mjs';
import {TRIAL_METHODS} from './hypergraph-trials.mjs';
import {trialCanvasGraph} from './trial-canvas-core.mjs';

const byId = id => document.getElementById(id), data = window.ATLAS_DATA;
const element = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const canvas = window.atlasSharedCanvas, shell = window.atlasWorkspaceShell;
let worker, ticket = 0, current, pinned, history = [];
const controls = element('section'); controls.id = 'trialControls'; controls.className = 'trial-controls';
const fields = element('div'); fields.className = 'trial-fields';
function selectField(id, title, values) {
 const label = element('label', title), select = element('select'); select.id = id;
 for (const [value, caption] of values) select.append(new Option(caption, value));
 label.append(select); fields.append(label); return select;
}
function numberField(id, title, value, minimum, maximum, step = 1) {
 const label = element('label', title), input = element('input'); input.id = id; input.type = 'number'; input.value = value; input.min = minimum; input.max = maximum; input.step = step;
 label.append(input); fields.append(label); return input;
}
const scope = selectField('trialScope', 'Reference scope', [10,20,30].map(value => [value, 'Cited by ≥' + value + ' sources']));
const orders = selectField('trialOrders', 'Combination orders', [['all','Combined 2–10'],[3,'3-way'],[4,'4-way']]);
const groups = numberField('trialGroups', 'Requested groups (k)', 24, 2, 60);
const imbalance = numberField('trialImbalance', 'Size tolerance', .15, 0, 1, .05);
const restart = numberField('trialRestart', 'Return to seed probability', .15, .01, .95, .01);
const seed = selectField('trialSeed', 'Seed article', []);
const choice = element('label', 'Hypergraph trial'), family = element('select'); family.id = 'trialFamily';
for (const [value, definition] of Object.entries(TRIAL_METHODS)) family.append(new Option(definition.name, value));
choice.append(family); choice.className = 'trial-method';
byId('workspaceControls').prepend(choice);
const representation = byId('hypergraphRepresentation'), representationField = representation.parentElement;
representationField.firstChild.textContent = 'Canvas'; representationField.classList.add('trial-representation');
representation.querySelector('option[value="network"]').textContent = 'Pair connections';
representation.title = 'Envelopes show whole combinations of 3+ articles (up to 60 strongest eligible). Pair connections are citation context, not the hypergraph clustering score. Filter a cluster to inspect its combinations, or choose 3D to explode the clusters.';
choice.after(representationField);
const methodOption = new Option('Experimental trial', 'trial'); methodOption.hidden = true; byId('clusteringMethod').append(methodOption);
const summary = canvas.summary;
canvas.summary = () => { const value = summary(), graph = canvas.graph(); return graph?.trial ? {...value, algorithm: 'trial', trialLabel: graph.trial.result.definition.name} : value; };
const description = element('p'), actions = element('div'); actions.className = 'trial-actions';
function button(title, handler) { const node = element('button', title); node.type = 'button'; node.onclick = handler; actions.append(node); return node; }
const runButton = button('Run trial', () => run()), continueButton = button('Continue refinement', () => run(true)), cancelButton = button('Cancel', stop);
const status = element('p', 'Preparing trial…'); status.id = 'trialStatus'; status.setAttribute('role', 'status');
const diagnostics = element('details'), audit = element('pre'); diagnostics.append(element('summary', 'Method & diagnostics'), audit);
const historyPanel = element('details'); historyPanel.append(element('summary', 'This session’s trials'));
controls.append(element('h3', 'Trial settings'), fields, description, actions, diagnostics, historyPanel);
byId('analysisPanel').querySelector('.shell-panel-body').prepend(controls);
const chip = element('div'); chip.className = 'trial-status-chip'; chip.append(status);
const returnLink = element('a', 'Main workspace ↗'); returnLink.href = 'index.html'; returnLink.className = 'trial-return'; chip.append(returnLink);
byId('workspaceControls').after(chip);
byId('workspace-map').textContent = 'Hypergraph trials';
byId('workspace-coupling').hidden = true;
document.querySelector('.workspace-tabs').setAttribute('aria-label', 'Experimental co-citation workspace');
const originalReset = byId('reset').onclick;
byId('reset').onclick = () => { if (current) install(current, pinned, false); else originalReset(); };
function graphForForm() {
 const graph = window.resolveAtlasGraph('cocitation_s' + scope.value + '_' + (orders.value === 'all' ? 'all' : 'n' + orders.value) + '_cpm0_02', 'auto', 10);
 return structuredClone({...graph, networkModel: 'hypergraph', maximumOrder: Math.min(10, graph.maximumOrder || 10)});
}
function seedOptions() {
 const previous = seed.value;
 seed.replaceChildren(...graphForForm().nodes.slice().sort((left, right) => right.citations - left.citations).map(node => new Option(node.label + ' — ' + (node.title || node.id), node.id)));
 if ([...seed.options].some(option => option.value === previous)) seed.value = previous;
}
function settings() {
 for (const input of [groups, imbalance, restart]) if (!input.checkValidity()) { input.reportValidity(); throw new Error('Check the trial settings.'); }
 return {family: family.value, k: +groups.value, seed: 42, starts: 3, imbalance: +imbalance.value, restart: +restart.value, seedId: seed.value};
}
function explain(changed = true) {
 const definition = TRIAL_METHODS[family.value];
 description.textContent = definition.help;
 groups.parentElement.hidden = ['local','categorical'].includes(family.value);
 imbalance.parentElement.hidden = family.value !== 'balanced';
 restart.parentElement.hidden = seed.parentElement.hidden = family.value !== 'local';
 continueButton.hidden = !current || current.family !== 'balanced' || current.converged;
 if (changed && current) status.textContent = 'Settings changed · previous completed map shown. Run trial to apply.';
 shell.refresh();
}
function busy(value) {
 for (const control of [family, ...fields.querySelectorAll('input,select'), runButton, continueButton]) control.disabled = value;
 cancelButton.hidden = !value;
 continueButton.hidden = !current || current.family !== 'balanced' || current.converged;
}
function stop() {
 ticket++; worker?.terminate(); worker = null; busy(false);
 status.textContent = 'Stopped · previous completed map retained.';
}
function install(result, source, remember = true, edges = result.canvasEdges) {
 const next = trialCanvasGraph(source.graph, result, edges);
 if (!current) representation.value = 'envelopes';
 next.bundles = source.bundles;
 byId('clusteringMethod').value = 'trial'; byId('networkModel').value = 'hypergraph';
 byId('orderMode').value = source.order === 'all' ? 'combined' : 'single';
 byId('orderSlider').value = source.order === 'all' ? 2 : source.order;
 byId('coCitationOrder').value = source.order;
 byId('threshold').value = 'cocitation_s' + source.scope + '_' + (source.order === 'all' ? 'all' : 'n' + source.order) + '_cpm0_02';
 current = result; pinned = source;
 document.body.classList.add('trial-ready');
 canvas.applySettings(next); canvas.reloadThemes();
 byId('methodTitle').textContent = result.definition.name;
 byId('analysisNote').textContent = result.definition.score + ' · ' + result.definition.search;
 const {memberships, canvasEdges, ...metadata} = result;
 audit.textContent = JSON.stringify(metadata, null, 2);
 status.textContent = 'Completed · ' + result.clusters + ' groups · ' + (result.localOnly ? 'outside-neighborhood articles remain unassigned · ' : '') + (result.converged ? 'solver finished' : 'provisional; inspect diagnostics') + ' · session only';
 if (remember) { history.push({result, source}); renderHistory(); }
 explain(false); shell.refresh();
}
function renderHistory() {
 historyPanel.querySelectorAll('button,p').forEach(node => node.remove());
 historyPanel.append(element('p', 'Session only. Export data to retain evidence and trial settings.'));
 for (const entry of history) {
  const node = element('button', entry.result.definition.name + ' · ' + entry.result.clusters + ' groups'); node.type = 'button';
  node.onclick = () => {
   stop(); family.value = entry.result.family; scope.value = entry.source.scope; orders.value = entry.source.order;
   groups.value = entry.result.settings.k; imbalance.value = entry.result.settings.imbalance; restart.value = entry.result.settings.restart;
   seedOptions(); seed.value = entry.result.settings.seedId;
   install(entry.result, entry.source, false);
  }; historyPanel.append(node);
 }
}
function run(continuing = false) {
 if (window.BIBLIOMAP_MULTIUSER) { status.textContent = 'These public-snapshot trials are not connected to institutional projects.'; return; }
 let options, source;
 try {
  options = continuing ? {...current.settings, starts: 1, balancedMaxPasses: Math.min(512, current.settings.balancedMaxPasses * 2), resumeMemberships: current.memberships} : settings();
  source = continuing ? pinned : {graph: graphForForm(), bundles: data.bundlesByScope[scope.value], scope: scope.value, order: orders.value};
 } catch (error) { status.textContent = analysisErrorMessage(error); return; }
 worker?.terminate(); window.ATLAS_EVIDENCE.cancelCanvasReliability();
 const request = ++ticket; worker = new Worker('hypergraph-trials-worker.js?v=coupling-errors-2'); busy(true);
 status.textContent = 'Running trial · previous completed map retained';
 worker.onerror = event => { if (ticket !== request) return; worker.terminate(); worker = null; busy(false); status.textContent = 'Trial failed: ' + analysisErrorMessage(event); };
 worker.onmessage = event => {
  if (ticket !== request) return;
  const message = event.data;
  if (message.progress) { status.textContent = message.progress + ' · previous completed map retained'; return; }
  worker.terminate(); worker = null; busy(false);
  if (Object.hasOwn(message, 'error')) { status.textContent = 'Trial failed: ' + analysisErrorMessage(message.error); return; }
  const result = {...message.result, coverage: message.coverage, canvasEdges: message.edges, createdAt: new Date().toISOString()};
  try { install(result, source); shell.show(null); }
  catch (error) { status.textContent = 'Trial could not be displayed: ' + analysisErrorMessage(error); }
 };
 worker.postMessage({action: 'fit', graph: source.graph, bundles: source.bundles, articles: data.articles, options});
}
family.onchange = () => { explain(); shell.show('analysis'); };
for (const field of [groups, imbalance, restart, seed]) field.addEventListener('change', () => explain());
for (const field of [scope, orders]) field.addEventListener('change', () => { seedOptions(); explain(); });
seedOptions(); explain(false); busy(false); run();
window.addEventListener('atlas-reliability-change', event => {
 if (current && event.detail === canvas.graph() && event.detail.trial) current.audit = event.detail.reliability;
});
