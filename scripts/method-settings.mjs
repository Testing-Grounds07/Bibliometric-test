import {agreement, densityGrid, fragmentation, partition, resample} from './auto-cpm.mjs';
import {invalidateScientificOutputs} from './scientific-invalidation.mjs';
import {buildHyperedges, hypergraphPartition, HYPERGRAPH_OBJECTIVES, HYPERGRAPH_SEARCHES} from './community-methods.mjs';
import {couplingHyperedges, COUPLING_HYPERGRAPH_METHOD} from './coupling-hypergraph.mjs';
import {couplingGraph, couplingPairs} from './evidence-metrics.mjs';
import {prepareReliability} from './network-reliability.mjs';
import {HYPERGRAPH_PROJECTION, isIncidenceModel, HYPERGRAPH_INCIDENCE} from './hypergraph-network.mjs';

export const SETTINGS_VERSION = 3;
export const SETTINGS_RULES = {recovery: .7, retention: .8, coverage: .5, starts: .8, plateau: .9, tiny: .2, largest: .65};
export function settingsAlgorithm(graph) {
 const declared = graph?.clustering?.algorithm, algorithm = declared === 'Leiden CPM' ? 'leiden' : declared;
 return ['leiden', 'infomap', 'hypergraph'].includes(algorithm) ? algorithm : null;
}

export function assertSettingsContext(graph) {
 if (!graph || typeof graph !== 'object') throw Error('Open a completed supported citation analysis before searching settings.');
 if (graph.collaboration) throw Error('Citation settings search is not defined for collaboration actors.');
 if (graph.semantic || graph.canvasKind === 'semantic') throw Error('Citation settings search is not defined for semantic maps. Use their text and construction controls.');
 if (graph.directed || graph.historiography || graph.method === 'direct_citation' || graph.canvasKind === 'historiography' || graph.networkModel === 'direct-citation') throw Error('Citation history has no Leiden/Infomap/hypergraph settings search.');
 if (graph.trial || graph.clustering?.algorithm === 'trial') throw Error('Experimental trial methods use their own settings; citation settings search is unavailable.');
 if (graph.temporalSelection) throw Error('Return to the full pinned map before searching analytical settings.');
 if (graph.networkModel && !['pairwise', 'higher-order', 'hypergraph'].includes(graph.networkModel)) throw Error('Settings search does not support this network representation.');
 const declared = graph.clustering?.algorithm, algorithm = settingsAlgorithm(graph);
 if (!['leiden', 'infomap', 'hypergraph'].includes(algorithm)) throw Error('Settings search is unavailable for '+(typeof declared === 'string' ? declared : 'an unspecified algorithm')+'. No Leiden fallback is applied.');
 if (algorithm === 'hypergraph' && (!HYPERGRAPH_OBJECTIVES.includes(graph.clustering.hypergraphObjective || 'linear') || !HYPERGRAPH_SEARCHES.includes(graph.clustering.hypergraphSearch || 'mixed'))) throw Error('Settings search does not support this direct hypergraph objective/search.');
 return algorithm;
}
export const isCouplingGraph = graph => graph.method === 'coupling' || graph.canvasKind === 'coupling';
export const membershipMap = graph => Object.fromEntries(graph.nodes.filter(node => node.cluster > 0).map(node => [node.id, node.cluster]));
const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

export function settingsGrid(graph, options = {}) {
 if(graph.collaboration)throw Error('Citation settings search is not defined for collaboration actors.');
 const algorithm = assertSettingsContext(graph);
 if (algorithm === 'hypergraph') {
  const hypergraphSearch=graph.clustering?.hypergraphSearch||'mixed';
  if (options.compareObjectives) return HYPERGRAPH_OBJECTIVES.map(hypergraphObjective => ({hypergraphObjective, hypergraphSearch, hypergraphResolution: graph.clustering?.hypergraphResolution ?? 1, label: hypergraphObjective}));
  const hypergraphObjective = graph.clustering?.hypergraphObjective || 'linear';
  return Array.from({length:9}, (_,position)=>2**(-2+position/2)).map(hypergraphResolution=>({hypergraphObjective,hypergraphSearch,hypergraphResolution,label:hypergraphObjective+' · resolution '+Number(hypergraphResolution.toPrecision(5))}));
 }
 if (algorithm === 'infomap') return Array.from({length:13}, (_,position)=>2**(-2+position/2)).map(markovTime => ({markovTime, label: 'Markov time ' + Number(markovTime.toPrecision(5))}));
 const center = densityGrid(graph).density || .02;
 return [...new Set([graph.resolution || center / 4, ...Array.from({length:17},(_,position)=>center*2**(-5+position/2))].map(value => Number(value.toPrecision(7))))].sort((left, right) => left - right).map(resolution => ({resolution, label: 'CPM ' + resolution.toPrecision(7)}));
}

export function recoveryMetrics(report) {
 const clusters = Object.values(report.clusters), total = clusters.reduce((sum, cluster) => sum + cluster.size, 0);
 return {recovery: clusters.reduce((sum, cluster) => sum + cluster.size * cluster.meanJaccard, 0) / Math.max(1, total), retention: clusters.reduce((sum, cluster) => sum + cluster.size * cluster.meanRetention, 0) / Math.max(1, total)};
}

export function materializeSetting(graph, candidate) {
 if(graph.collaboration)throw Error('Collaboration settings must rebuild their declared work–actor projection.');
 const {memberships, ...metadata} = candidate.partition;
 const nodes = graph.nodes.map(node => ({...node, cluster: memberships[node.id] || 0}));
 const clusters = new Set(Object.values(memberships)).size;
 return invalidateScientificOutputs({...graph, nodes, analysisId: null, derivedFromAnalysisId: graph.analysisId || graph.derivedFromAnalysisId,
  resolution: candidate.settings.resolution ?? null, autoCPM: null, comparison: null, themeDescriptions: null,
  clustering: {...metadata, ...candidate.settings, networkModel: graph.networkModel, algorithm: candidate.algorithm, label: (candidate.algorithm === 'leiden' ? 'Leiden CPM' : candidate.algorithm === 'infomap' ? 'Infomap' : 'Hypergraph modularity') + (graph.networkModel === 'hypergraph' && candidate.algorithm !== 'hypergraph' ? isIncidenceModel(graph) ? ' · hypergraph incidence' : ' · hypergraph legacy projection' : ''), limitations: graph.networkModel === 'hypergraph' && candidate.algorithm !== 'hypergraph' ? isIncidenceModel(graph) ? HYPERGRAPH_INCIDENCE : HYPERGRAPH_PROJECTION : metadata.limitations, clusters, communities: clusters},
  reliability: candidate.validation || candidate.screening || null, sourceReliability: candidate.sourceValidation || null,
  stats: {...graph.stats, clusters, isolated_nodes: nodes.filter(node => !node.cluster).length}});
}

export function recommendation(candidates, algorithm, options = {}) {
 for (const candidate of candidates) {
  const measured = recoveryMetrics(candidate.validation || candidate.screening);
  candidate.metrics = {...candidate.metrics, ...measured};
  candidate.reasons = [];
  const fail = (condition, reason) => { if (condition) candidate.reasons.push(reason); };
  fail(candidate.metrics.clusters < 2, 'No subdivision');
  fail(candidate.metrics.clusters <= candidate.metrics.components, 'Only disconnected components');
  fail(candidate.metrics.largest > SETTINGS_RULES.largest, 'One group dominates');
  fail(candidate.metrics.coverage < SETTINGS_RULES.coverage, 'Low source/reference coverage');
  fail(measured.recovery < SETTINGS_RULES.recovery, 'Sensitive memberships');
  fail(measured.retention < SETTINGS_RULES.retention, 'Low retained membership');
  fail(candidate.metrics.startAgreement < SETTINGS_RULES.starts, 'Initialization-sensitive');
  fail(candidate.metrics.tiny > SETTINGS_RULES.tiny, 'Excess tiny fragments');
  fail(candidate.partition.converged === false || (candidate.validation || candidate.screening).nonconverged > 0, 'Optimization pass limit reached');
  if (candidate.sourceValidation) {
   const source = recoveryMetrics(candidate.sourceValidation);
   fail(source.recovery < .6 || source.retention < .7, 'Sensitive to source selection');
  }
 }
 if (options.compareObjectives || algorithm === 'hypergraph' && new Set(candidates.map(candidate=>candidate.settings.hypergraphObjective)).size>1) return {status: 'experimental_comparison', heading: 'Experimental model comparison', ranges: [], chosen: null, explanation: 'Objectives express different definitions of a community. Review results and explicitly apply a model; no automatic winner or cross-objective quality ranking.'};
 const ranges = [];
 for (let start = 0; start < candidates.length; start++) {
  const band = [];
  for (const candidate of candidates.slice(start)) {
   if (candidate.reasons.length || band.some(other => agreement(other.partition.memberships, candidate.partition.memberships) < SETTINGS_RULES.plateau)) break;
   band.push(candidate);
  }
  const value = candidate => candidate.settings.resolution || candidate.settings.markovTime || candidate.settings.hypergraphResolution;
  if (band.length >= 3 && value(band.at(-1)) / value(band[0]) >= 2 - 1e-5 && !ranges.some(range => range.ids.includes(band[0].id))) ranges.push({ids: band.map(candidate => candidate.id), from: value(band[0]), to: value(band.at(-1))});
 }
 const eligible = candidates.filter(candidate => ranges.some(range => range.ids.includes(candidate.id)) && !candidate.reasons.length);
 eligible.sort((left, right) => left.metrics.clusters - right.metrics.clusters || right.metrics.recovery - left.metrics.recovery);
 const validated = eligible.filter(candidate => candidate.validation && candidate.validation.samples === 50);
 return {status: ranges.length ? validated.length ? ranges.length > 1 ? 'several_scales' : 'recommended_range' : 'screening_range' : 'no_clear_recommendation',
  heading: ranges.length ? validated.length ? ranges.length > 1 ? 'Several useful scales' : 'Recommended tested range' : 'Promising range; validation pending' : 'No clear recommendation',
  chosen: validated[0]?.id || null, shortlist: eligible.length ? [...new Set([eligible[0].id, eligible.at(-1).id])] : [], ranges,
  explanation: 'Overview-oriented heuristics: recovery ≥70%, retention ≥80%, coverage ≥50%, start agreement ≥0.80, introduced tiny-node share ≤20%, largest group ≤65%; ranges need three tested points spanning twofold with every-pair ARI ≥0.90. Coupling finalists also need source-subsample recovery ≥60% and retention ≥70%. Direct hypergraph tunes an experimental null-penalty multiplier within a fixed objective. Not CHAMP, proof of an optimum, or thematic validation. Stability between tested points is unknown.'};
}

export async function runSettingsSearch(graph, articleIds, infomap, progress = () => {}, options = {}) {
 if(graph.collaboration)throw Error('Citation settings search is not defined for collaboration actors.');
 const algorithm = assertSettingsContext(graph), coupling = isCouplingGraph(graph);
 if (!graph.links.length) throw new Error('No eligible connections to tune.');
 const hyperedges = algorithm === 'hypergraph' || graph.networkModel === 'hypergraph' ? graph.hyperedges || (coupling ? couplingHyperedges(graph) : buildHyperedges(graph, graph.bundles || [])) : null;
 graph = {...graph, hyperedges};
 async function solve(network, settings, trials = 2, seed = 42, edges = hyperedges) {
  if (algorithm === 'leiden' && isIncidenceModel(network)) return infomap(network, {...settings, algorithm: 'leiden', trials, seed});
  if (algorithm === 'infomap') return infomap(network, {...settings, networkModel: graph.networkModel, trials, seed});
  if (algorithm === 'hypergraph') {
   const result = hypergraphPartition(network, edges, () => {}, {...settings, trials, seed});
   if (coupling) result.method = COUPLING_HYPERGRAPH_METHOD + ' ' + result.method;
   return result;
  }
  return partition(network, settings.resolution, trials, seed);
 }
 async function audit(candidate, count, seedOffset, mode = 'evidence') {
  const configured = materializeSetting({...graph, hyperedges}, candidate);
  const session = prepareReliability(configured, articleIds, count, {seedOffset, mode});
  for (let position = 0; position < count; position++) {
   progress(candidate.settings.label + ' · ' + mode + ' resample ' + (position + 1) + '/' + count);
   const sample = session.sample(position);
   session.record(await solve(sample.graph, candidate.settings, 2, 42, sample.hyperedges));
   await new Promise(resolve => setTimeout(resolve, 0));
  }
  return session.finish();
 }
 const candidates = [];
 for (const [position, settings] of (options.settings || settingsGrid(graph, options)).entries()) {
  progress('Testing ' + settings.label + ' · ' + (position + 1));
  const result = await solve(graph, settings, 10);
  const starts = [];
  for (const seed of [101, 307, 701]) starts.push(await solve(graph, settings, 1, seed));
  const groups = new Map(); for (const cluster of Object.values(result.memberships)) groups.set(cluster, (groups.get(cluster) || 0) + 1);
  const fragments = fragmentation(graph, result.memberships), linked = Object.keys(result.memberships).length;
  const candidate = {id: position + 1, algorithm, settings, partition: result, metrics: {clusters: groups.size, coverage: linked / Math.max(1, graph.nodes.length), largest: Math.max(0, ...groups.values()) / Math.max(1, linked), tiny: fragments.introducedTinyNodeFraction, components: fragments.components, startAgreement: mean(starts.map(start => agreement(result.memberships, start.memberships)))}};
  candidate.screening = await audit(candidate, 10, 0);
  candidates.push(candidate);
 }
 const screened = recommendation(candidates, algorithm, options);
 const selected = options.screenOnly ? [] : options.compareObjectives ? candidates.map(candidate => candidate.id) : screened.shortlist || [];
 for (const candidate of candidates.filter(candidate => selected.includes(candidate.id))) {
  candidate.validation = await audit(candidate, 50, 1000);
  if (coupling) candidate.sourceValidation = await audit(candidate, 10, 2000, 'sources');
 }
 const finalRecommendation = recommendation(candidates, algorithm, options);
 if (finalRecommendation.status === 'screening_range') { finalRecommendation.status = 'no_clear_recommendation'; finalRecommendation.heading = 'No clear recommendation'; finalRecommendation.explanation = 'Fresh validation did not confirm a shortlisted representative. Remaining screening ranges are preliminary. ' + finalRecommendation.explanation; }
 return {version: SETTINGS_VERSION, algorithm, networkModel: graph.networkModel, compareObjectives: !!options.compareObjectives, evidenceFixed: true, candidates, recommendation: finalRecommendation, createdAt: new Date().toISOString(), screeningSamples: 10, validationSamples: 50, validationSeedOffset: 1000,
  limitations: 'Fresh resamples reduce reuse of screening draws but are not independent external validation. Coverage includes unlinked nodes. Source subsampling omits 10% intentionally and counts those losses, so do not compare its recovery directly with reference bootstrap. No null-model significance test. Hypergraph objectives are experimental; scores across objectives or methods are not comparable.'};
}

export async function evidenceSensitivity(graph, articleIds, infomap, progress) {
 if(graph.collaboration)throw Error('Citation evidence resampling is not defined for collaboration actors.');
 const coupling = isCouplingGraph(graph), algorithm = assertSettingsContext(graph), current = graph.clustering || {};
 const settings = {resolution: graph.resolution, markovTime: current.markovTime || 1, hypergraphObjective: current.hypergraphObjective || 'linear', hypergraphSearch: current.hypergraphSearch || 'mixed', hypergraphResolution: current.hypergraphResolution ?? 1, label: 'Fixed clustering settings'};
 let variants;
 if (coupling) {
  const pairs = couplingPairs(graph.nodes);
  variants = [{shared: graph.minimumShared, cosine: graph.minimumCosine}, {shared: graph.minimumShared + 1, cosine: graph.minimumCosine}, {shared: graph.minimumShared, cosine: Math.min(1, graph.minimumCosine + .05)}].map(value => ({label: 'Shared ≥' + value.shared + ', cosine ≥' + value.cosine, graph: {...graph, ...couplingGraph(graph.nodes, pairs, value.shared, value.cosine), hyperedges: null}}));
 } else {
  const weights = Object.fromEntries(articleIds.map(id => [id, 1]));
  variants = [graph.minimumSupport || 5, (graph.minimumSupport || 5) + 2].map(minimumSupport => { const configured = {...graph, minimumSupport}; return {label: 'Support ≥' + minimumSupport, graph: {...configured, ...resample(configured, weights, graph.bundles || []), hyperedges: null}}; });
  if (graph.order === 'all' && graph.maximumOrder > 2) { const configured = {...graph, maximumOrder: 2}; variants.push({label: 'Combined cap 2', graph: {...configured, ...resample(configured, weights, graph.bundles || []), hyperedges: null}}); }
 }
 const results = [];
 for (const variant of variants) {
  if (!variant.graph.links.length) { results.push({label: variant.label, edges: 0, clusters: 0, coverage: 0, agreement: null}); continue; }
  const audit = await runSettingsSearch(variant.graph, articleIds, infomap, progress, {settings: [settings], screenOnly: true});
  const candidate = audit.candidates[0];
  results.push({label: variant.label, edges: variant.graph.links.length, clusters: candidate.metrics.clusters, coverage: candidate.metrics.coverage, recovery: candidate.metrics.recovery, agreement: agreement(membershipMap(graph), candidate.partition.memberships)});
 }
 return {algorithm, results, limitations: 'Evidence sensitivity only; does not apply or recommend new thresholds. Stricter evidence uses the existing candidate universe, never mines new combinations. ARI compares shared linked nodes; inspect coverage alongside it. Order-cap comparison is available for combined views. Single-order changes must be selected explicitly on the canvas.'};
}
