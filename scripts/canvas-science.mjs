import {analysisErrorMessage} from './analysis-errors.mjs';
import {evidenceCoverage, methodSupport, validationDimensions, createScientificManifest} from './scientific-manifest.mjs';
import {clusterRecovery} from './evidence-metrics.mjs';
import {loadCommunities} from './community-loader.mjs';
import {optimizationVariability} from './optimization-variability.mjs';

const recordsByGraph = new WeakMap();
let active;
const element = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const button = (label, callback) => { const node = element('button', label); node.type = 'button'; node.className = 'secondary'; node.onclick = callback; return node; };
const paragraphs = (parent, values) => values.filter(Boolean).forEach(value => parent.append(element('p', value)));
const number = value => Number.isFinite(value) ? Number(value.toPrecision(4)).toString() : 'Not assessed';
const percent = value => Number.isFinite(value) ? (100 * value).toFixed(1) + '%' : 'Not assessed';

async function fullEvidence(record) {
 const packet = await window.ATLAS_EVIDENCE.prepareDataset(), expected = record.graph.sourceCorpusId || window.ATLAS_DATA?.summary?.corpus_id;
 if (expected && packet.sourceCorpusId !== expected) throw new Error('Source evidence does not match this map.');
 record.sources = packet.articles; record.fullLoaded = true; return packet.articles;
}

export async function prepareScientificExport(graph) {
 const record = recordsByGraph.get(graph), sources = record ? await fullEvidence(record) : Object.values(window.ATLAS_DATA?.articles || {});
 graph.scientificManifest = await createScientificManifest(graph, sources); return graph.scientificManifest;
}

if (typeof window !== 'undefined') window.ATLAS_SCIENCE = {prepareExport: prepareScientificExport, cancel: cancelScience};

function stop(record) {
 record.ticket++; record.worker?.terminate(); record.worker = null; record.fitting?.cancel(); record.fitting = null;
 record.running = false;
}

export function cancelScience() {
 if (!active) return;
 const record = recordsByGraph.get(active);
 if (record?.running) { stop(record); record.status.textContent = 'Cancelled. No partial audit installed.'; draw(record); }
}

function workerTask(record, kind, options = {}, graph = record.graph) {
 if (window.BIBLIOMAP?.active && kind !== 'manifest' && kind !== 'fit') {
  const stage = {roles: 'scientific-roles', null: 'incidence-null', construction: 'construction-comparison', roleSensitivity: 'role-sensitivity', optimization: 'optimization-variability'}[kind];
  record.fitting = window.BIBLIOMAP.stage(graph, stage, options, message => { record.status.textContent = message; });
  return record.fitting.promise.finally(() => { record.fitting = null; });
 }
 return new Promise((resolve, reject) => {
  const worker = new Worker('science-worker.js?v=coupling-errors-2'); record.worker = worker;
  worker.onmessage = event => {
   if (record.worker !== worker) return;
   if (event.data.progress) { record.status.textContent = event.data.progress; return; }
   worker.terminate(); if (record.worker === worker) record.worker = null;
   Object.hasOwn(event.data, 'error') ? reject(new Error(analysisErrorMessage(event.data.error))) : resolve(event.data.result);
  };
  worker.onerror = event => { worker.terminate(); if (record.worker === worker) record.worker = null; reject(new Error(analysisErrorMessage(event))); };
  worker.postMessage({kind, graph, records: record.sources, options});
 });
}

async function run(record, kind, options = {}) {
 if (record.running) return;
 if(kind!=='manifest'&&(record.graph.temporalSelection||record.graph.collaboration?.ego)){record.status.textContent='Return to the full pinned map before running an audit. Neighborhood/window browsing does not submit new jobs.';return;}
 if (kind !== 'manifest' && window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false) { record.status.textContent = 'View-only project: ask an editor to run an audit.'; return; }
 const ticket = ++record.ticket; record.running = true; draw(record); record.status.textContent = 'Preparing ' + kind + '…';
 try {
  if (kind === 'manifest') await fullEvidence(record);
  let result;
  if (kind === 'optimization' && !window.BIBLIOMAP?.active) {
   const support = methodSupport(record.graph); await loadCommunities();
   result = await optimizationVariability(record.graph, async (candidate, settings) => {
    if (ticket !== record.ticket) throw new Error('Optimization check cancelled.');
    if (support.algorithm === 'leiden') return workerTask(record, 'fit', {...settings, algorithm: 'leiden'}, candidate);
    record.fitting = window.ATLAS_COMMUNITIES.start(candidate, support.algorithm, candidate.bundles || [], message => { if (ticket === record.ticket) record.status.textContent = message; }, {...settings, networkModel: candidate.networkModel || 'pairwise'});
    const fitted = await record.fitting.promise; record.fitting = null; return fitted;
   }, message => { record.status.textContent = message; });
  } else result = await workerTask(record, kind, options);
  if (ticket !== record.ticket) return;
  if (kind === 'construction' && !window.BIBLIOMAP?.active) {
   await loadCommunities(); if (ticket !== record.ticket) return;
   const support = methodSupport(record.graph), original = Object.fromEntries(record.graph.nodes.map(node => [node.id, node.cluster])), comparisons = [];
   for (const [position, candidate] of result.entries()) {
    record.status.textContent = 'Comparing definition ' + (position + 1) + '/' + result.length + ' with the selected ' + support.algorithm + ' method…';
    let fitted;
    if (support.algorithm === 'leiden') fitted = await workerTask(record, 'fit', {...record.graph.clustering, algorithm: 'leiden'}, candidate);
    else {
     record.fitting = window.ATLAS_COMMUNITIES.start(candidate, support.algorithm, [], message => { if (record.ticket === ticket) record.status.textContent = message; }, {...record.graph.clustering, resolution: record.graph.resolution, networkModel: 'pairwise'});
     fitted = await record.fitting.promise; record.fitting = null;
    }
    if (ticket !== record.ticket) return;
    const recovery = clusterRecovery(original, Object.fromEntries(fitted.nodes.map(node => [node.id, node.cluster]))), clusterValues = Object.values(recovery), total = clusterValues.reduce((sum, value) => sum + value.size, 0);
    const baseEdges = new Set(record.graph.links.map(edge => JSON.stringify([edge.source, edge.target].sort()))), nextEdges = new Set(candidate.links.map(edge => JSON.stringify([edge.source, edge.target].sort()))), intersection = [...nextEdges].filter(key => baseEdges.has(key)).length;
    comparisons.push({definition: candidate.construction, edges: candidate.links.length, clusters: new Set(fitted.nodes.map(node => node.cluster).filter(cluster => cluster > 0)).size, edgeJaccard: intersection / (baseEdges.size + nextEdges.size - intersection || 1), weightedRecovery: total ? clusterValues.reduce((sum, value) => sum + value.jaccard * value.size, 0) / total : null, recovery, settings: {...record.graph.clustering, resolution: record.graph.resolution}, nonconverged: fitted.clustering?.converged === false});
   }
   result = {version: 'construction-comparison-v1', comparisons, limitation: 'Construction-and-scale sensitivity at fixed selected settings, not a pure normalization-invariance test. Leiden rescales weights by mean edge weight, but fixed gamma need not imply equivalent effective granularity across weight distributions; no per-definition retuning occurs. Objective values are not compared across definitions. Block-model fits ignore weights. Reference/source universe stays fixed. Higher-order re-mining and ambiguous-identity scenarios are not performed. Recovery is descriptive best-match Jaccard, not chance-adjusted agreement or confidence.'};
  }
  if (ticket !== record.ticket) return;
  if (kind === 'manifest') {
   record.graph.scientificManifest = result;
   const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'})), anchor = element('a'); anchor.href = url; anchor.download = 'bibliomap-analysis-manifest.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
   record.graph.scienceAudit = {...record.graph.scienceAudit, [kind]: result};
   if (kind === 'roles' || kind === 'null') record[kind] = result;
  }
  record.status.textContent = kind === 'manifest' ? 'Manifest exported. Audit fingerprints do not authorize shared computation reuse.' : 'Completed ' + kind + '. The map is unchanged.';
 } catch (error) { if (ticket === record.ticket) record.status.textContent = 'Not completed: ' + analysisErrorMessage(error); }
 finally { if (ticket === record.ticket) { record.running = false; draw(record); } }
}

function drawRoles(record, host) {
 const result = record.roles;
 const noun=['term','topic','author','institution','country'].includes(record.graph.entityKind)?record.graph.entityKind:'article';
 host.replaceChildren();
 if (!result) { host.append(element('p', 'Calculate '+noun+' roles on the full analytical network, not the currently visible subset.')); return; }
 const searchLabel = element('label', 'Find '+noun+(noun==='article'?' by title or author':' by label')), search = element('input'); search.type = 'search'; search.value = record.roleQuery || ''; search.setAttribute('aria-label', 'Find '+noun+' in roles'); searchLabel.append(search);
 const rankLabel = element('label', 'Rank by'), rank = element('select'); rank.setAttribute('aria-label', 'Rank '+noun+' roles');
 for (const [value, label] of [...(result.directed ? [['pageRank','Citation PageRank'],['incoming','Incoming citations'],['outgoing','Outgoing citations']] : [['externalStrength','Cross-community weight'],['participation','Participation'],['withinClusterZ','Within-community position']]),['core','Core membership'],...(result.paths ? [['betweenness','Path brokerage']] : [])]) rank.append(new Option(label, value));
 rankLabel.append(rank); const list = element('div');
 if (record.roleRank && [...rank.options].some(option => option.value === record.roleRank)) rank.value = record.roleRank;
 const redraw = () => {
  record.roleQuery = search.value; record.roleRank = rank.value;
  const query = search.value.trim().toLowerCase(), selected = record.graph.nodes.filter(node => !query || [node.title, node.label, node.authors, node.id].filter(Boolean).join(' ').toLowerCase().includes(query)).sort((left, right) => (result.roles[right.id][rank.value] ?? -Infinity) - (result.roles[left.id][rank.value] ?? -Infinity));
  list.replaceChildren();
  for (const node of selected.slice(0, 15)) {
   const role = result.roles[node.id], row = element('div'); row.append(button(node.title || node.label || node.id, () => record.selectNode?.(node.id)));
   paragraphs(row, [role.label + ' · ' + rank.selectedOptions[0].textContent + ': ' + number(role[rank.value]), role.degree + ' neighbors · ' + (result.directed ? role.incoming + ' incoming / ' + role.outgoing + ' outgoing' : 'external share ' + percent(role.externalShare)) + ' · core ' + role.core + (role.degree < 3 ? ' · Few connections: role interpretation is fragile.' : '')]); list.append(row);
  }
  list.append(element('p', 'Showing ' + Math.min(15, selected.length) + ' of ' + selected.length + ' matching '+(noun==='country'?'countries':noun+'s')+'. Labels are exploratory structural descriptions, not validated functional roles.'));
 };
 search.oninput = redraw; rank.onchange = redraw; host.append(searchLabel, rankLabel, list); paragraphs(host, [result.scope, result.limitations, result.paths ? 'Path distance: ' + result.paths.distance + '.' : 'Path brokerage has not been calculated.']); redraw();
}

function draw(record) {
 const coverage = evidenceCoverage(record.sources), dimensions = validationDimensions(record.graph, coverage), support = methodSupport(record.graph);
 if (record.coverageBody) record.coverageBody.replaceChildren(element('p', coverage.withReferences + '/' + coverage.records + ' records with references · ' + coverage.titles + ' titles · ' + coverage.abstracts + ' abstracts · ' + coverage.publicationYears + ' publication years. Completeness unknown.'), element('p', coverage.authorshipTruncation), element('p', coverage.authorCountKnown ? coverage.potentiallyTruncatedAuthorships + ' potentially truncated author lists among ' + coverage.authorCountKnown + ' assessable records; remaining records unknown.' : 'Potentially truncated author lists: unknown.'));
 record.dimensions.replaceChildren();
 for (const dimension of dimensions) {
  const line = element('details'); line.append(element('summary', dimension.label + ' · ' + dimension.status.replaceAll('-', ' ')), element('p', dimension.outcome)); record.dimensions.append(line);
 }
 const readOnly = !!record.graph.temporalSelection || !!record.graph.collaboration?.ego || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
 record.runRoles.disabled = record.running || readOnly; record.runPaths.disabled = record.running || readOnly; record.manifest.disabled = record.running;
 record.construction.disabled = record.running || readOnly || !support.constructionComparison; record.nullButton.disabled = record.running || readOnly || !support.marginNull;
 record.roleSensitivity.disabled = record.running || readOnly || !support.constructionComparison;
 record.optimization.disabled = record.running || readOnly || !support.constructionComparison || !['leiden','infomap'].includes(support.algorithm);
 record.cancel.hidden = !record.running;
 record.construction.title = support.constructionComparison ? '' : 'Available only for supported pairwise co-citation/coupling. No substitute method is run.';
 record.nullButton.title = support.marginNull ? '' : 'Whole-hypergraph and directed null assessments are not implemented here.';
 record.unsupported.textContent = support.constructionComparison ? 'Definition and rank checks are conditional on retained evidence. Optimization-only repeats currently support pairwise Leiden and Infomap.' : 'Connection-definition, role-resampling and margin-null comparisons currently support pairwise co-citation/coupling only. They do not substitute another method for directed, higher-order or hypergraph analysis. Article roles remain explicitly pair-based.';
 drawRoles(record, record.rolesHost);
 record.auditResults.replaceChildren();
 if (record.graph.scienceAudit?.construction) {
  const result = record.graph.scienceAudit.construction;
  for (const comparison of result.comparisons) record.auditResults.append(element('p', comparison.definition.counting + ' · ' + comparison.definition.normalization + ' · support ≥' + comparison.definition.minimumSupport + ': ' + comparison.clusters + ' groups, ' + comparison.edges + ' connections; edge overlap ' + percent(comparison.edgeJaccard) + ', membership recovery ' + percent(comparison.weightedRecovery) + (comparison.nonconverged ? ' · solver limit reached' : '')));
  paragraphs(record.auditResults, [result.limitation]);
 }
 if (record.null) {
  const result = record.null;
  paragraphs(record.auditResults, ['Null baseline: ' + result.status + ' · ' + result.samples + ' samples · both incidence margins preserved. ' + result.acceptedSwitches + ' accepted switches.', result.multiplicityResolution, result.limitation]);
  const diagnostics = element('details'); diagnostics.append(element('summary', 'Null movement diagnostics and pair outcomes'), element('pre', JSON.stringify({feasibility: result.feasibility, lagOne: result.lagOne, diagnostics: result.diagnostics, records: result.records}, null, 2))); record.auditResults.append(diagnostics);
 }
 if (record.graph.scienceAudit?.roleSensitivity) {
  const result = record.graph.scienceAudit.roleSensitivity; paragraphs(record.auditResults, ['Role sensitivity · ' + result.samples + ' resamples · original memberships fixed.', result.limitation]);
  const top = Object.entries(result.ranks).sort(([, left], [, right]) => right.topTen - left.topTen).slice(0, 10);
  for (const [id, rank] of top) { const node = record.graph.nodes.find(node => node.id === id); paragraphs(record.auditResults, [(node.title || node.label || id) + ' · top-ten credit ' + percent(rank.topTen) + ' · average rank percentile ' + percent(rank.meanPercentile)]); }
 }
 if (record.graph.scienceAudit?.optimization) { const result = record.graph.scienceAudit.optimization; paragraphs(record.auditResults, ['Fixed-evidence optimization · ' + result.fits + ' fits · mean full-universe ARI ' + number(result.agreement.mean) + ' · minimum ' + number(result.agreement.minimum), result.limitation]); }
}

export function mountScience(parent, graph, sources = [], options = {}) {
 if (!graph?.nodes || !graph?.links) return;
 if (active !== graph) { cancelScience(); active = graph; }
 let record = recordsByGraph.get(graph);
 if (!record) {
  const noun=['term','topic','author','institution','country'].includes(graph.entityKind)?graph.entityKind:'article';
  const panel = element('details'); panel.id = graph.canvasKind === 'historiography' ? 'historyScience' : 'canvasScience'; panel.className = 'science-panel'; panel.append(element('summary', 'Evidence, validation & '+noun+' roles'));
  const dimensions = element('div'), actions = element('div'); actions.className = 'reliability-controls';
  record = {graph, panel, sources, dimensions, ticket: 0, selectNode: options.selectNode, roles: graph.scienceAudit?.roles, null: graph.scienceAudit?.null};
  record.runRoles = button(noun[0].toUpperCase()+noun.slice(1)+' roles', () => run(record, 'roles'));
  record.runPaths = button('Add path brokerage', () => run(record, 'roles', {paths: true}));
  record.manifest = button('Export analysis manifest', () => run(record, 'manifest', options.context || {}));
  record.construction = button('Compare connection definitions', () => run(record, 'construction'));
  record.nullButton = button('Deep null check · 50', () => run(record, 'null', {samples: 50}));
  record.roleSensitivity = button('Role sensitivity · 10', () => run(record, 'roleSensitivity', {samples: 10}));
  record.optimization = button('Repeat optimization · 5', () => run(record, 'optimization'));
  record.cancel = button('Cancel audit', () => { stop(record); record.status.textContent = 'Cancelled. No partial audit installed.'; draw(record); });
  record.status = element('p'); record.status.setAttribute('role', 'status');
  record.rolesHost = element('div'); record.auditResults = element('div'); record.unsupported = element('p');
  const evidence = element('details'); record.coverageBody = element('div'); evidence.append(element('summary', 'Metadata coverage'), record.coverageBody);
  const loadMetadata = button('Load full available source metadata', async () => { loadMetadata.disabled = true; record.status.textContent = 'Loading source metadata…'; try { await fullEvidence(record); record.status.textContent = 'Loaded ' + record.sources.length + ' source records for ' + (record.graph.sourceCorpusId || window.ATLAS_DATA?.summary?.corpus_id || 'the current evidence') + '. Unretained fields remain unknown.'; draw(record); } catch (error) { record.status.textContent = 'Metadata not loaded: ' + analysisErrorMessage(error); } finally { loadMetadata.disabled = false; } }); evidence.append(loadMetadata);
  actions.append(record.runRoles, record.runPaths, record.manifest, record.construction, record.nullButton, record.roleSensitivity, record.optimization, record.cancel);
  panel.append(dimensions, evidence, actions, record.unsupported, record.status, record.rolesHost, record.auditResults, element('p', 'The map remains unchanged. Deep checks are bounded and conditional on retained evidence. Full higher-order re-mining, identity-uncertainty audits and researcher thematic review are not automated.'));
  recordsByGraph.set(graph, record);
 }
 if (!record.fullLoaded) record.sources = sources; record.selectNode = options.selectNode || record.selectNode;
 parent.append(record.panel); draw(record); return record;
}
