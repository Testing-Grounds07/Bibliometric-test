import createGraph from 'ngraph.graph';
import {detectClusters} from 'ngraph.leiden';
import {couplingPairs, couplingGraph} from './evidence-metrics.mjs';
import {embeddingEvidence, semanticText} from './semantic-network.mjs';
import {scienceDigest} from './scientific-manifest.mjs';
import {researchGraphIdentity} from './retained-research-checks.mjs';

export const RESEARCH_CHECK_VERSION = 'bibliomap-research-checks-v1';
export const RESEARCH_CHECK_KINDS = Object.freeze(['seed', 'threshold', 'article-only', 'reference-ablation', 'text-neighbours', 'compare', 'edge-audit', 'rank-cutoff']);
export const RESEARCH_CHECK_LIMITS = Object.freeze({nodes: 2000, pairs: 2000000, edges: 200000, fits: 15, milliseconds: 180000, referenceAssignments: 1000000, referencePairContributions: 10000000, maxLevels: 10, maxLocalPasses: 30});
export const RESEARCH_CHECK_SEEDS = Object.freeze([11, 23, 37, 53, 71]);
const limitation = 'Experimental diagnostic on the declared retained evidence. Partition agreement is not evidence-bootstrap stability, confidence, significance, an optimum guarantee or thematic validation. Original null-model and bootstrap studies are not implied. No graph.reliability result is produced.';
const fail = message => { throw new Error(message); };
const recordsArray = records => Array.isArray(records) ? records : Object.values(records || {});
const nodeId = value => typeof value === 'string' && value.length > 0;
const referenceId = value => /^(?:https?:\/\/openalex\.org\/)?W\d+$/i.test(value) ? 'https://openalex.org/' + value.replace(/^https?:\/\/openalex\.org\//i, '').toUpperCase() : value;
const pairKey = (left, right) => JSON.stringify([left, right].sort());
const connectedIds = graph => new Set(graph.links.flatMap(edge => [edge.source, edge.target]));
const weight = edge => edge.strength ?? edge.weight;
const choose2 = count => count * (count - 1) / 2;

function validateCheckOptions(kind, options) {
 if (!options || typeof options !== 'object' || Array.isArray(options)) fail('Research-check options must be an object of declared protocol fields.');
 const allowed = new Set(['typeMap', ...({seed: [], threshold: ['thresholds', 'minimumRetainedWeight'], 'article-only': [], 'reference-ablation': ['referenceIds', 'minimumShared', 'minimumCosine'], 'text-neighbours': [], compare: [], 'edge-audit': ['minimumShared', 'minimumCosine'], 'rank-cutoff': ['rankMetric', 'globalCitationField']}[kind] || [])]);
 const unsupported = Object.keys(options).filter(key => !allowed.has(key));
 if (unsupported.length) fail('Unsupported ' + kind + ' protocol option: ' + unsupported.join(', ') + '. No option is silently ignored.');
 if (options.typeMap != null && (typeof options.typeMap !== 'object' || Array.isArray(options.typeMap))) fail('Supplemental typeMap must map exact source IDs to explicit publication-type strings.');
}

function cosineNormalization(graph) {
 const classify = value => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim().toLowerCase();
  if (/\b(?:not|non)[ -]?cosine\b/.test(text)) return 'other';
  if (/\bcosine\b/.test(text)) return 'cosine';
  if (/^raw\b/.test(text)) return 'other';
  if (/^(?:raw|none|unnormalized|no normalization|count|counts|raw co-occurrence|classifier-score-products|association[ -]strength|jaccard|fractional|shared[ -]reference[ -]counts?)$/.test(text)) return 'other';
  return 'description';
 };
 const operative = classify(graph.construction?.normalization), declaration = classify(graph.normalization), semanticCosine = graph.semantic?.kind === 'embeddings';
 if (operative && operative !== 'description' && declaration && declaration !== 'description' && operative !== declaration || semanticCosine && (operative === 'other' || declaration === 'other')) fail('Conflicting declared edge normalizations; the check cannot choose a construction silently.');
 if (operative === 'description' && (declaration === 'cosine' || semanticCosine)) fail('The operative construction normalization is unknown; a cosine display declaration cannot override it.');
 return operative === 'cosine' || declaration === 'cosine' || semanticCosine;
}

function validateGraph(graph, requireObjective = true) {
 if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.links) || !graph.nodes.length) fail('A nonempty retained analytical graph is required.');
 if (graph.nodes.length > RESEARCH_CHECK_LIMITS.nodes || graph.links.length > RESEARCH_CHECK_LIMITS.edges) fail('Graph exceeds the 2,000-node or 200,000-edge diagnostic budget; no sampling is used.');
 if (graph.temporalSelection || graph.collaboration || graph.directed || graph.method === 'direct_citation' || graph.canvasKind === 'historiography' || ['author', 'institution', 'country', 'term', 'topic', 'cited-work'].includes(graph.entityKind) || graph.semantic?.kind && graph.semantic.kind !== 'embeddings' || graph.trial || graph.networkModel && graph.networkModel !== 'pairwise' || graph.order != null && graph.order !== 2 || graph.hyperedges?.length) fail('Only undirected pairwise source-work graphs are supported; temporal, actor and hypergraph representations require their own checks.');
 const coupling = graph.method === 'coupling' || graph.canvasKind === 'coupling' || graph.construction?.method === 'bibliographic_coupling';
 const semantic = graph.semantic?.kind === 'embeddings' || graph.construction?.method === 'semantic_embeddings';
 if (!coupling && !semantic && graph.entityKind !== 'source') fail('The graph must explicitly declare a source-work universe. Cited-reference, term and actor partitions are not interchangeable.');
 const ids = new Set();
 for (const node of graph.nodes) {if (!nodeId(node.id) || ids.has(node.id)) fail('Every graph node must have a distinct exact string ID.'); ids.add(node.id);}
 const pairs = new Set();
 for (const edge of graph.links) {
  if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target || !Number.isFinite(weight(edge)) || weight(edge) <= 0) fail('Edges require distinct retained endpoints and explicit finite positive raw weights.');
  const key = pairKey(edge.source, edge.target); if (pairs.has(key)) fail('Duplicate undirected edges are unsupported; no silent aggregation is permitted.'); pairs.add(key);
 }
 let settings = null;
 if (requireObjective) {
  const algorithm = graph.clustering?.algorithm, objective = String(graph.clustering?.objective || '').toLowerCase();
  if (algorithm !== 'leiden' || !['modularity', 'cpm'].includes(objective)) fail('Only explicitly declared Leiden modularity or CPM can be refitted; no fallback objective is permitted.');
  const declaredResolution = graph.clustering?.resolution ?? graph.resolution;
  if (objective === 'cpm' && (!Number.isFinite(declaredResolution) || declaredResolution <= 0)) fail('CPM requires its retained positive resolution/gamma.');
  if (objective === 'modularity' && declaredResolution != null && declaredResolution !== 1) fail('Non-unit generalized modularity resolution is not supported by this bounded implementation.');
  settings = {algorithm: 'leiden', objective, resolution: objective === 'cpm' ? declaredResolution : 1, weightPolicy: objective === 'cpm' ? 'Native BiblioMap CPM: raw edge weights divided by this variant mean positive edge weight; gamma unchanged.' : 'Exact raw edge weights, unchanged; unit-resolution modularity.', maxLevels: RESEARCH_CHECK_LIMITS.maxLevels, maxLocalPasses: RESEARCH_CHECK_LIMITS.maxLocalPasses, startsPerSeed: 1};
  if (objective === 'cpm' && graph.importedStandalone) fail('Imported CPM scale is unspecified; native mean-weight CPM scaling cannot be assumed.');
 }
 return {ids, coupling, semantic, settings};
}

function sourceRecords(graph, records) {
 const supplied = recordsArray(records), lookup = new Map();
 for (const record of supplied) {if (!nodeId(record?.id) || lookup.has(record.id)) fail('Source evidence must have distinct exact string IDs.'); lookup.set(record.id, record);}
 const missing = graph.nodes.filter(node => !lookup.has(node.id)).map(node => node.id);
 if (missing.length) fail(missing.length + ' graph nodes have no matching exact source record; source IDs are never inferred.');
 return {selected: graph.nodes.map(node => lookup.get(node.id)), supplied: supplied.length, extra: supplied.length - graph.nodes.length};
}

function semanticSourceRecords(graph, records) {
 const source = sourceRecords(graph, records);
 return {...source, selected: source.selected.map(record => {
  if (typeof record.abstract_inverted_index !== 'string') return record;
  let parsed; try {parsed = JSON.parse(record.abstract_inverted_index);} catch {fail('Retained abstract inverted-index JSON is malformed for ' + record.id);}
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some(offsets => !Array.isArray(offsets) || offsets.some(offset => !Number.isInteger(offset) || offset < 0))) fail('Retained abstract inverted-index offsets are invalid for ' + record.id);
  return {...record, abstract_inverted_index: parsed};
 })};
}

function referencesFor(graph, records) {
 const source = sourceRecords(graph, records), postings = new Map(); let assignments = 0;
 const works = source.selected.map(record => {
  const values = record.references ?? record.referenced_works;
  if (!Array.isArray(values) || values.some(value => !nodeId(value))) fail('Explicit reference lists are required for every source. Missing lists are unknown coverage, not empty lists.');
  const references = [...new Set(values.map(referenceId))]; assignments += references.length;
  if (assignments > RESEARCH_CHECK_LIMITS.referenceAssignments) fail('Reference incidence exceeds one million assignments.');
  for (const id of references) postings.set(id, (postings.get(id) || 0) + 1);
  return {...record, references};
 });
 const contributions = [...postings.values()].reduce((sum, count) => sum + choose2(count), 0);
 if (contributions > RESEARCH_CHECK_LIMITS.referencePairContributions) fail('Reference reconstruction exceeds ten million pair contributions; no partial reconstruction is permitted.');
 return {...source, works, assignments, contributions, emptyLists: works.filter(work => !work.references.length).length};
}

function couplingSettings(graph, options) {
 if (!(graph.method === 'coupling' || graph.canvasKind === 'coupling' || graph.construction?.method === 'bibliographic_coupling') || !cosineNormalization(graph)) fail('This check requires explicitly declared source-work cosine bibliographic coupling.');
 const minimumShared = options.minimumShared ?? graph.minimumShared, minimumCosine = options.minimumCosine ?? graph.minimumCosine;
 if (!Number.isInteger(minimumShared) || minimumShared < 1 || !Number.isFinite(minimumCosine) || minimumCosine < 0 || minimumCosine > 1) fail('Retained minimumShared and minimumCosine construction thresholds are required.');
 if (options.minimumShared != null && options.minimumShared !== graph.minimumShared || options.minimumCosine != null && options.minimumCosine !== graph.minimumCosine) fail('Construction thresholds must equal the retained baseline settings.');
 return {minimumShared, minimumCosine};
}

function articleSelection(graph, records, options) {
 const source = sourceRecords(graph, records), typeMap = options.typeMap || {}, missing = [], types = {}, articles = [];
 for (const record of source.selected) {
  const declared = record.type ?? record.publication_type, supplemental = typeMap[record.id];
  if (declared != null && supplemental != null && declared !== supplemental) fail('Supplemental publication type conflicts with retained source type: ' + record.id);
  const type = declared ?? supplemental;
  if (typeof type !== 'string' || !type.trim()) missing.push(record.id);
  else {types[type] = (types[type] || 0) + 1; if (type === 'article') articles.push(record.id);}
 }
 if (missing.length) fail(missing.length + ' source publication types are missing; article-only restriction cannot infer types from titles or venues.');
 if (!articles.length) fail('No source records have the exact declared publication type article.');
 return {...source, ids: articles, types, supplementalTypes: source.selected.filter(record => record.type == null && record.publication_type == null).length};
}

function thresholdPlan(graph, options) {
 const cosine = cosineNormalization(graph);
 const declaredFloors = [graph.minimumRetainedWeight, ...(cosine ? [graph.minimumCosine, graph.semantic?.minimumSimilarity] : [])].filter(value => value != null);
 if (declaredFloors.some(value => !Number.isFinite(value) || value < 0)) fail('The declared retained edge floor is invalid.');
 const knownFloor = declaredFloors.length ? Math.max(...declaredFloors) : null;
 if (options.minimumRetainedWeight != null && knownFloor != null && options.minimumRetainedWeight < knownFloor) fail('An override cannot weaken the graph\'s declared minimum retained edge weight.');
 const minimumRetained = options.minimumRetainedWeight ?? knownFloor;
 if (!Number.isFinite(minimumRetained) || minimumRetained < 0) fail('Declare the minimum retained edge weight; missing edges below the retained scope cannot be reconstructed by filtering.');
 const requested = options.thresholds ?? [0, .05, .1];
 if (!Array.isArray(requested) || !requested.length || requested.length > 3 || requested.some(value => !Number.isFinite(value) || value < 0 || cosine && value > 1) || new Set(requested).size !== requested.length) fail('Supply one to three distinct exact nonnegative edge thresholds.');
 const thresholds = requested.filter(value => value >= minimumRetained), unavailable = requested.filter(value => value < minimumRetained).map(value => ({threshold: value, reason: 'Below the retained minimum; missing edges cannot be added by this check.'}));
 if (!thresholds.length) fail('All requested thresholds fall below the retained edge scope.');
 if (options.thresholds && unavailable.length) fail('An explicitly requested threshold is below the retained edge scope.');
 return {thresholds, unavailable, minimumRetained, metric: cosine ? 'retained exact cosine edge weight' : 'retained exact edge weight', fixedNodeUniverse: true};
}

function rankScores(graph, records, options) {
 const metric = options.rankMetric ?? 'strength';
 if (!['strength', 'incoming', 'global-citations'].includes(metric)) fail('Unknown rank metric. Choose strength, incoming or global-citations; no fallback score is permitted.');
 if (metric !== 'global-citations' && options.globalCitationField != null) fail('globalCitationField applies only to the global-citations metric.');
 const scores = new Map(graph.nodes.map(node => [node.id, 0])); let definition, diagnostics;
 if (metric === 'strength') {
  for (const edge of graph.links) for (const id of [edge.source, edge.target]) scores.set(id, scores.get(id) + weight(edge));
  if ([...scores.values()].some(score => !Number.isFinite(score))) fail('Retained edge strength sum exceeds finite numeric precision.');
  definition = 'Sum of exact retained positive undirected edge weights incident to each source work; graph-local strength, not a citation count.';
  diagnostics = {sourceRecordsRequired: false, retainedEdges: graph.links.length, edgeWeightsChanged: false};
 } else {
  const source = sourceRecords(graph, records);
  if (metric === 'global-citations') {
   const field = options.globalCitationField;
   if (!['cited_by_count', 'citedBy'].includes(field)) fail('Global citation ranking requires explicit globalCitationField: cited_by_count or citedBy. Node citations are not assumed to be global counts.');
   const missing = source.selected.filter(record => !Object.hasOwn(record, field) || !Number.isSafeInteger(record[field]) || record[field] < 0);
   if (missing.length) fail(missing.length + ' selected source works lack an explicit nonnegative integer ' + field + ' value; unknown global citations cannot be replaced by zero.');
   for (const record of source.selected) scores.set(record.id, record[field]);
   definition = 'Exact retained source-record field ' + field + '; observed database-wide cited-by count at its retained observation, not a current or historical-priority claim.';
   diagnostics = {field, valuesAvailable: source.selected.length, sourceRecordsSupplied: source.supplied, sourceRecordsOutsideNodeUniverse: source.extra, observationDate: 'Not inferred; inspect pinned source retrieval provenance.'};
  } else {
   const lookup = new Map(); let assignments = 0, selfMatches = 0, matchedReferences = 0, emptyLists = 0, unmatchedReferences = 0;
   for (const node of graph.nodes) {const key = referenceId(node.id); if (lookup.has(key)) fail('Source-work IDs have ambiguous OpenAlex aliases; local incoming citations cannot infer a merge.'); lookup.set(key, node.id);}
   for (const record of source.selected) {
    const values = record.references ?? record.referenced_works;
    if (!Array.isArray(values) || values.some(value => !nodeId(value))) fail('Every selected source needs an explicit reference list for observed incoming citation counts; missing lists are unknown coverage.');
    const refs = new Set(values.map(referenceId)); assignments += refs.size; if (!refs.size) emptyLists++;
    if (assignments > RESEARCH_CHECK_LIMITS.referenceAssignments) fail('Observed incoming citation counting exceeds one million distinct source-reference assignments.');
    for (const ref of refs) {
     const target = lookup.get(ref);
     if (!target) {unmatchedReferences++; continue;}
     if (target === record.id) {selfMatches++; continue;}
     scores.set(target, scores.get(target) + 1); matchedReferences++;
    }
   }
   definition = 'Number of distinct other selected source works whose explicit retained reference lists cite this exact selected source-work ID; OpenAlex W/HTTP/HTTPS aliases only, with exact self-matches excluded.';
   diagnostics = {citingSourceUniverse: graph.nodes.map(node => node.id), sourceRecordsSupplied: source.supplied, sourceRecordsOutsideNodeUniverse: source.extra, distinctSourceReferenceAssignments: assignments, matchedNonSelfReferences: matchedReferences, unmatchedReferences, excludedSelfMatches: selfMatches, emptyReferenceLists: emptyLists, bibliographyCompleteness: 'Unknown. Explicit empty lists remain observed unavailable bibliography coverage; no missing citations are imputed.'};
  }
 }
 return {metric, scores, definition, diagnostics};
}

function rankCutoffReport(graph, rank) {
 const ordered = [...rank.scores].map(([id, score]) => ({id, score})).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
 const connected = connectedIds(graph), positives = ordered.filter(row => row.score > 0).length;
 const cutoffs = [10, 20].map(k => {
  const selected = ordered.slice(0, k), boundary = selected.at(-1)?.score ?? null, boundaryTiedIds = ordered.filter(row => row.score === boundary).map(row => row.id), includingBoundaryTies = ordered.filter(row => row.score >= boundary).map(row => row.id);
  return {cutoff: k, selectedIds: selected.map(row => row.id), selectedCount: selected.length, nodeCoverage: selected.length / ordered.length, denominator: {name: 'full-retained-source-work-universe', count: ordered.length}, selectedConnected: selected.filter(row => connected.has(row.id)).length, selectedIsolates: selected.filter(row => !connected.has(row.id)).length, selectedPositiveScores: selected.filter(row => row.score > 0).length, boundaryScore: boundary, boundaryTiedIds, boundaryTiesOmitted: boundaryTiedIds.filter(id => !selected.some(row => row.id === id)), includingBoundaryTies: {selectedIds: includingBoundaryTies, selectedCount: includingBoundaryTies.length, nodeCoverage: includingBoundaryTies.length / ordered.length}};
 });
 const first = new Set(cutoffs[0].selectedIds), second = new Set(cutoffs[1].selectedIds), sharedIds = [...first].filter(id => second.has(id));
 return {metric: rank.metric, definition: rank.definition, actualSettings: {cutoffs: [10, 20], tiePolicy: 'Descending exact observed score, then ascending exact source ID using Unicode code-unit order. Fixed-size cutoffs retain at most k sources; the full boundary-tie alternative is saved separately.', scoreTransformation: 'None', selectedSourceUniverse: 'All retained analytical source-work nodes, including isolates and zero-score nodes.'}, diagnostics: rank.diagnostics, rankedSources: ordered.map((row, index) => ({...row, position: index + 1})), coverage: {analyzedSources: ordered.length, positiveScores: positives, zeroScores: ordered.length - positives, connectedSources: connected.size, isolates: ordered.length - connected.size}, cutoffs, cutoffOverlap: {firstCutoff: 10, secondCutoff: 20, commonIds: sharedIds, commonCount: sharedIds.length, unionCount: new Set([...first, ...second]).size, jaccard: sharedIds.length / new Set([...first, ...second]).size, firstRetainedFraction: sharedIds.length / first.size, secondRetainedFraction: sharedIds.length / second.size, interpretation: 'Nested cutoffs of one fixed observed ranking; overlap is a deterministic selection comparison, not stability or statistical evidence.'}, limitations: ['Observed counts and graph strength do not establish seminal status, historical priority, scientific quality, thematic validity or causal importance.', 'Zero-score ordering and boundary ties depend on the explicit exact-ID tie rule; inspect the saved all-boundary-ties alternative.', 'Coverage is relative to this retained source-work universe; incomplete source retrieval and missing bibliographies are not repaired.']};
}

export function preflightResearchCheck(input) {
 const {kind, graph, records, cache, comparisonGraph, options = {}} = input || {};
 if (!RESEARCH_CHECK_KINDS.includes(kind)) fail('Unknown research check kind.');
 validateCheckOptions(kind, options);
 const base = validateGraph(graph, !['compare', 'edge-audit', 'rank-cutoff'].includes(kind));
 if (!['edge-audit', 'rank-cutoff'].includes(kind)) researchCheckMemberships(graph);
 const pairs = choose2(graph.nodes.length); if (pairs > RESEARCH_CHECK_LIMITS.pairs) fail('Candidate universe exceeds two million pairs.');
 let fits = kind === 'seed' || kind === 'article-only' ? 5 : 0, details = {};
 if (kind === 'threshold') {details = thresholdPlan(graph, options); fits = details.thresholds.length * 5;}
 if (kind === 'article-only') {const selected = articleSelection(graph, records, options); details = {retainedArticleIds: selected.ids, typeCounts: selected.types, supplementalTypes: selected.supplementalTypes, removed: graph.nodes.length - selected.ids.length};}
 if (kind === 'edge-audit' || kind === 'reference-ablation') {
  const settings = couplingSettings(graph, options), evidence = referencesFor(graph, records);
  details = {...settings, referenceAssignments: evidence.assignments, referencePairContributions: evidence.contributions, emptyReferenceLists: evidence.emptyLists, referenceIdentityPolicy: 'Exact distinct references; OpenAlex W IDs/HTTP/HTTPS aliases reversibly normalized to HTTPS OpenAlex W IDs.'};
  if (kind === 'reference-ablation') {
   const ids = options.referenceIds;
   if (!Array.isArray(ids) || !ids.length || ids.length > 2 || ids.some(id => !nodeId(id)) || new Set(ids.map(referenceId)).size !== ids.length) fail('Select one or two explicit distinct reference IDs for ablation.');
   const canonical = ids.map(referenceId);
   if (canonical.some(id => !evidence.works.some(work => work.references.includes(id)))) fail('An ablated reference ID is absent from the exact retained source incidence.');
   details.referenceIds = canonical; details.variants = canonical.map(id => [id]); if (canonical.length === 2) details.variants.push(canonical); fits = details.variants.length * 5;
  }
 }
 if (kind === 'text-neighbours') {
  if (!base.semantic || graph.semantic?.kind !== 'embeddings') fail('Text-neighbour checks require a source MiniLM cosine graph.');
  const source = semanticSourceRecords(graph, records), evidence = embeddingEvidence(source.selected, cache, {textScope: 'titles-abstracts'}, graph.sourceCorpusId);
  const model = graph.semantic.model;
  if (!model || model.id !== evidence.model.id || model.revision !== evidence.model.revision || model.dimensions !== evidence.model.dimensions) fail('The cache model/revision/dimensions do not match the retained semantic graph.');
  details = {kValues: [5, 10, 15], mode: 'symmetric union of strictly positive top-k neighbours; ties by exact source ID', model: evidence.model, coverage: evidence.coverage, vectorDimensions: 384, vectorProducts: pairs * 384}; fits = 15;
 }
 if (kind === 'compare') {validateGraph(comparisonGraph, false); researchCheckMemberships(comparisonGraph); details = {secondNodes: comparisonGraph.nodes.length, secondEdges: comparisonGraph.links.length};}
 if (kind === 'rank-cutoff') {const rank = rankScores(graph, records, options); details = {rankMetric: rank.metric, definition: rank.definition, cutoffs: [10, 20], diagnostics: rank.diagnostics, communityOptimizerExecuted: false};}
 if (fits > RESEARCH_CHECK_LIMITS.fits) fail('Check exceeds fifteen fixed-seed fits.');
 return {version: RESEARCH_CHECK_VERSION, kind, available: true, settings: base.settings, budget: {nodes: graph.nodes.length, edges: graph.links.length, candidatePairs: pairs, fits, maximumMilliseconds: RESEARCH_CHECK_LIMITS.milliseconds, limits: {...RESEARCH_CHECK_LIMITS}}, details};
}

export function researchCheckCapabilities(graph, records, context = {}) {
 const {options = {}, cache, comparisonGraph, ...legacyOptions} = context;
 return Object.fromEntries(RESEARCH_CHECK_KINDS.map(kind => {
  try {const preflight = preflightResearchCheck({kind, graph, records, cache, comparisonGraph, options: {...legacyOptions, ...options}}); return [kind, {available: true, reason: null, budget: preflight.budget}];}
  catch (error) {return [kind, {available: false, reason: error.message}];}
 }));
}

export function researchCheckMemberships(graph) {
 const connected = connectedIds(graph), memberships = {};
 for (const node of graph.nodes) {
  const engine = node.engineCommunity;
  if (typeof engine === 'string' && engine.length || Number.isFinite(engine)) memberships[node.id] = 'engine:' + engine;
  else if (connected.has(node.id) && (typeof node.cluster === 'string' && node.cluster.length || Number.isFinite(node.cluster) && node.cluster > 0)) memberships[node.id] = 'cluster:' + node.cluster;
  else if (!connected.has(node.id)) memberships[node.id] = 'singleton:' + node.id;
  else fail('A connected source has no retained partition membership: ' + node.id);
 }
 return memberships;
}

export function adjustedRandIndex(first, second, ids = Object.keys(first).filter(id => Object.hasOwn(second, id))) {
 if (ids.length < 2) return null;
 const rows = new Map(), columns = new Map(), cells = new Map();
 for (const id of ids) {
  if (!Object.hasOwn(first, id) || !Object.hasOwn(second, id)) fail('ARI denominator contains a source without membership.');
  const row = first[id], column = second[id], key = JSON.stringify([row, column]); rows.set(row, (rows.get(row) || 0) + 1); columns.set(column, (columns.get(column) || 0) + 1); cells.set(key, (cells.get(key) || 0) + 1);
 }
 const sum = map => [...map.values()].reduce((total, count) => total + choose2(count), 0), a = sum(rows), b = sum(columns), expected = a * b / choose2(ids.length), denominator = (a + b) / 2 - expected;
 return denominator ? (sum(cells) - expected) / denominator : 1;
}

export function researchCheckComparison(firstGraph, secondGraph, first = researchCheckMemberships(firstGraph), second = researchCheckMemberships(secondGraph)) {
 const left = new Set(firstGraph.nodes.map(node => node.id)), right = new Set(secondGraph.nodes.map(node => node.id)), common = [...left].filter(id => right.has(id)).sort(), baseConnected = connectedIds(firstGraph), otherConnected = connectedIds(secondGraph);
 const measure = ids => ({count: ids.length, ids, adjustedRandIndex: adjustedRandIndex(first, second, ids)});
 return {commonFullUniverse: measure(common), baselineConnectedCommonUniverse: measure(common.filter(id => baseConnected.has(id))), bothConnectedCommonUniverse: measure(common.filter(id => baseConnected.has(id) && otherConnected.has(id))), nodeCoverage: {baselineFull: left.size, comparisonFull: right.size, commonFull: common.length, baselineOnly: left.size - common.length, comparisonOnly: right.size - common.length, baselineConnected: baseConnected.size, comparisonConnected: otherConnected.size, baselineIsolates: left.size - baseConnected.size, comparisonIsolates: right.size - otherConnected.size}, isolatePolicy: 'Original engineCommunity when retained; otherwise each disconnected or unassigned isolate is its own distinct singleton. Display cluster 0 never pools isolates.', limitation: 'These denominators compare partitions of explicit source IDs. ARI 1 for trivial all-singleton/all-in-one partitions does not establish meaningful communities.'};
}

function fitGraph(graph, settings, seed) {
 const connected = connectedIds(graph), network = createGraph(), scale = settings.objective === 'cpm' && graph.links.length ? graph.links.reduce((sum, edge) => sum + weight(edge), 0) / graph.links.length : 1;
 for (const node of graph.nodes) if (connected.has(node.id)) network.addNode(node.id);
 for (const edge of graph.links) network.addLink(edge.source, edge.target, {weight: weight(edge) / scale});
 const actualSettings = {...settings, seed, scale, optimizer: 'ngraph.leiden 0.3.0', initialization: 'singletons; one fixed-seed start', convergence: 'Not certified; bounded maximum levels and local passes.'}, memberships = Object.fromEntries(graph.nodes.filter(node => !connected.has(node.id)).map(node => [node.id, 'singleton:' + node.id]));
 let quality = null, levels = 0;
 if (graph.links.length) {
  const result = detectClusters(network, {quality: settings.objective, resolution: settings.resolution, randomSeed: seed, maxLevels: settings.maxLevels, maxLocalPasses: settings.maxLocalPasses, linkWeight: link => link.data.weight});
  for (const node of graph.nodes) if (connected.has(node.id)) memberships[node.id] = 'fit:' + result.getClass(node.id);
  quality = result.quality(); levels = result.toJSON().meta.levels;
  if (!Number.isFinite(quality)) fail('The declared objective returned a nonfinite score.');
 }
 return {seed, memberships, communities: new Set(Object.values(memberships)).size, connectedCommunities: new Set([...connected].map(id => memberships[id])).size, nodes: graph.nodes.length, connectedNodes: connected.size, isolates: graph.nodes.length - connected.size, edges: graph.links.length, quality, levels, actualSettings};
}

function auditEdges(graph, rebuilt) {
 const expected = new Map(rebuilt.links.map(edge => [pairKey(edge.source, edge.target), edge])), observed = new Map(graph.links.map(edge => [pairKey(edge.source, edge.target), edge])), mismatches = [];
 for (const [key, edge] of expected) {
  const retained = observed.get(key);
  if (!retained) mismatches.push({kind: 'missing-retained-edge', source: edge.source, target: edge.target});
  else {
   const raw = retained.rawSupport ?? retained.count;
   if (raw !== edge.count || retained.count != null && retained.count !== edge.count || retained.rawSupport != null && retained.rawSupport !== edge.count || Math.abs(weight(retained) - edge.strength) > 1e-12) mismatches.push({kind: 'edge-evidence-mismatch', source: edge.source, target: edge.target, observedRawShared: raw ?? null, observedCount: retained.count ?? null, expectedRawShared: edge.count, observedWeight: weight(retained), expectedCosine: edge.strength});
   if (Array.isArray(retained.references) && JSON.stringify([...new Set(retained.references.map(referenceId))].sort()) !== JSON.stringify([...edge.references].sort())) mismatches.push({kind: 'shared-reference-ID-mismatch', source: edge.source, target: edge.target});
  }
 }
 for (const [key, edge] of observed) if (!expected.has(key)) mismatches.push({kind: 'unexpected-retained-edge', source: edge.source, target: edge.target});
 return {status: mismatches.length ? 'mismatch' : 'verified', expectedEdges: expected.size, observedEdges: observed.size, mismatchCount: mismatches.length, mismatches, toleranceAbsoluteCosine: 1e-12, candidateUniverse: 'Every pair of the exact retained node universe; zero-shared-reference pairs cannot pass minimumShared >= 1.'};
}

async function semanticPins(graph, works, cache) {
 const documents = works.map(work => ({id: work.id, title: semanticText(work).title, abstract: semanticText(work).abstract, embedding: cache.documents[work.id].embedding})).sort((left, right) => left.id.localeCompare(right.id));
 const embeddingFingerprint = await scienceDigest({model: cache.model, revision: cache.revision, dimensions: cache.dimensions, encoding: cache.encoding, textScope: cache.textScope, documents});
 if (graph.semantic.embeddingFingerprint && embeddingFingerprint !== graph.semantic.embeddingFingerprint) fail('Pinned semantic vectors changed; this is not a fixed-model check.');
 const textFingerprint = await scienceDigest(works.map(work => ({id: work.id, ...semanticText(work)})).sort((left, right) => left.id.localeCompare(right.id)));
 if (graph.semantic.textFingerprint && textFingerprint !== graph.semantic.textFingerprint) fail('Pinned semantic source text changed; this is not fixed-evidence sensitivity.');
 if (!graph.semantic.embeddingFingerprint && !graph.importedStandalone) fail('The baseline semantic graph lacks a pinned vector fingerprint.');
 return {embeddingFingerprint, textFingerprint, baselineVectorBinding: graph.semantic.embeddingFingerprint ? 'Exact retained native SHA-256 vector pin verified.' : 'Imported original lacks a native vector fingerprint: this is a new computation on the supplied exact-text/model cache, not an exact replay of its original vectors.'};
}

export async function runResearchCheck(input, progress = () => {}) {
 const start = Date.now(), preflight = preflightResearchCheck(input), {kind, graph, records, cache, comparisonGraph, options = {}} = input;
 const checkTime = () => {if (Date.now() - start > RESEARCH_CHECK_LIMITS.milliseconds) fail('Research check exceeded its 180-second budget; discard partial output.');};
 const emit = message => {checkTime(); progress({kind, message, elapsedMilliseconds: Date.now() - start});};
 emit('Validated exact graph and bounded operation plan.');
 const supplied = recordsArray(records), inputs = {version: RESEARCH_CHECK_VERSION, kind, graph: {...researchGraphIdentity(graph), minimumRetainedWeight: graph.minimumRetainedWeight}, records: supplied, options, cache: kind === 'text-neighbours' ? cache : null, comparisonGraph: kind === 'compare' ? researchGraphIdentity(comparisonGraph) : null};
 const fingerprint = await scienceDigest(inputs), baseMemberships = ['edge-audit', 'rank-cutoff'].includes(kind) ? null : researchCheckMemberships(graph), variants = []; let result;
 const runVariant = (candidate, definition) => {
  if (candidate.links.length > RESEARCH_CHECK_LIMITS.edges) fail('A reconstructed variant exceeds 200,000 edges; no partial graph is retained.');
  const runs = [];
  for (const seed of RESEARCH_CHECK_SEEDS) {
   emit('Fitting ' + definition.label + ' · seed ' + seed);
   const run = fitGraph(candidate, preflight.settings, seed); checkTime(); run.comparison = researchCheckComparison(graph, candidate, baseMemberships, run.memberships); runs.push(run);
  }
  const pairwiseAgreement = [];
  for (let left = 0; left < runs.length; left++) for (let right = left + 1; right < runs.length; right++) pairwiseAgreement.push({firstSeed: runs[left].seed, secondSeed: runs[right].seed, comparison: researchCheckComparison(candidate, candidate, runs[left].memberships, runs[right].memberships)});
  variants.push({definition, nodeIds: candidate.nodes.map(node => node.id), edges: candidate.links.length, _links: candidate.links, runs, pairwiseAgreement});
 };
 if (kind === 'compare') result = {comparison: researchCheckComparison(graph, comparisonGraph)};
 if (kind === 'rank-cutoff') {emit('Ranking exact observed ' + preflight.details.rankMetric + ' scores at cutoffs 10 and 20.'); result = rankCutoffReport(graph, rankScores(graph, records, options));}
 if (kind === 'seed') runVariant(graph, {label: 'fixed evidence', evidenceFixed: true});
 if (kind === 'threshold') for (const threshold of preflight.details.thresholds) runVariant({...graph, links: graph.links.filter(edge => weight(edge) >= threshold)}, {label: 'edge threshold ' + threshold, threshold, ...preflight.details, thresholds: undefined});
 if (kind === 'article-only') {const retained = new Set(preflight.details.retainedArticleIds); runVariant({...graph, nodes: graph.nodes.filter(node => retained.has(node.id)), links: graph.links.filter(edge => retained.has(edge.source) && retained.has(edge.target))}, {label: 'exact publication type article', ...preflight.details, policy: 'Induced retained graph on exact declared article source records; all matching source nodes retained including isolates.'});}
 if (kind === 'edge-audit' || kind === 'reference-ablation') {
  const evidence = referencesFor(graph, records), settings = couplingSettings(graph, options), reconstruct = works => couplingGraph(works, couplingPairs(works, RESEARCH_CHECK_LIMITS.pairs), settings.minimumShared, settings.minimumCosine);
  emit('Reconstructing every candidate shared-reference pair.');
  const rebuilt = reconstruct(evidence.works); if (rebuilt.links.length > RESEARCH_CHECK_LIMITS.edges) fail('Baseline reconstruction exceeds the 200,000-edge budget; no partial audit is retained.');
  const audit = auditEdges(graph, rebuilt); checkTime();
  if (kind === 'edge-audit') result = {...audit, coverage: {sources: evidence.works.length, emptyReferenceLists: evidence.emptyLists, bibliographyCompleteness: 'Unknown; explicit empty lists are retained as observed unavailable bibliographies.'}, actualSettings: settings};
  else {
   if (audit.mismatchCount) fail('Baseline coupling edge audit failed (' + audit.mismatchCount + ' mismatches); ablation cannot silently rebuild a different baseline.');
   for (const deleted of preflight.details.variants) {const removed = new Set(deleted), candidate = reconstruct(evidence.works.map(work => ({...work, references: work.references.filter(id => !removed.has(id))}))); runVariant(candidate, {label: 'remove ' + deleted.join(', '), deletedReferenceIds: deleted, ...settings, fixedNodeUniverse: true});}
   result = {baselineEdgeAudit: audit};
  }
 }
 let vectorPins = null;
 if (kind === 'text-neighbours') {
  const source = semanticSourceRecords(graph, records), evidence = embeddingEvidence(source.selected, cache, {textScope: 'titles-abstracts'}, graph.sourceCorpusId); vectorPins = await semanticPins(graph, source.selected, cache);
  const neighbors = new Map(evidence.records.map(({work}) => [work.id, []]));
  for (let left = 0; left < evidence.records.length; left++) {
   if (left % 25 === 0) emit('Exact cached-vector cosine comparisons ' + left + '/' + evidence.records.length);
   const a = evidence.records[left];
   for (let right = left + 1; right < evidence.records.length; right++) {const b = evidence.records[right]; let cosine = 0; for (let dimension = 0; dimension < 384; dimension++) cosine += a.vector[dimension] * b.vector[dimension]; cosine = Math.min(1, cosine); if (cosine > 0) {neighbors.get(a.work.id).push({id: b.work.id, cosine}); neighbors.get(b.work.id).push({id: a.work.id, cosine});}}
  }
  for (const list of neighbors.values()) list.sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id));
  for (const k of [5, 10, 15]) {const edges = new Map(); for (const [id, list] of neighbors) for (const item of list.slice(0, k)) {const ends = [id, item.id].sort(); edges.set(pairKey(...ends), {source: ends[0], target: ends[1], strength: item.cosine, similarity: item.cosine, rawSupport: null});} runVariant({...graph, links: [...edges.values()]}, {label: 'positive union kNN ' + k, k, mode: preflight.details.mode, vectorPins});}
 }
 // Hash the computed memberships and actual definitions. Full memberships are retained; no unreported sampling or summary-only truncation.
 for (const variant of variants) {variant.edgeFingerprint = await scienceDigest(variant._links); delete variant._links; variant.membershipFingerprint = await scienceDigest(variant.runs.map(run => ({seed: run.seed, memberships: run.memberships, actualSettings: run.actualSettings})));}
 checkTime();
 return {version: RESEARCH_CHECK_VERSION, kind, status: 'completed', executed: true, createdAt: new Date().toISOString(), inputFingerprint: fingerprint, vectorPins, preflight, actualSettings: preflight.settings ?? (kind === 'rank-cutoff' ? {...result.actualSettings, rankMetric: result.metric} : null), implementation: {engine: preflight.budget.fits ? 'ngraph.leiden 0.3.0; ngraph.graph 20.1.2' : 'No community optimizer executed.', execution: 'New bounded JavaScript diagnostic computation', originalImplementation: graph.importedStandalone ? 'Imported standalone Python igraph/leidenalg result; original optimizer is not replayed by these checks.' : 'Native retained BiblioMap graph', equivalentToOriginalImplementation: false}, universe: {sourceRecordsSupplied: supplied.length, analyzedNodeIds: graph.nodes.map(node => node.id), analyzedNodes: graph.nodes.length, connectedNodes: connectedIds(graph).size, isolates: graph.nodes.length - connectedIds(graph).size, sourceScope: 'Exact retained analytical node universe before display filters; source records outside it are not added.'}, variants, results: result || null, elapsedMilliseconds: Date.now() - start, limitations: [limitation, ...(kind === 'rank-cutoff' ? result.limitations : []), ...(kind === 'threshold' ? ['Edge filtering cannot recover missing edges or support a threshold below the retained construction scope.'] : []), ...(kind === 'text-neighbours' ? ['Uses only the exact supplied cache after model/text validation; it does not fetch text, create embeddings or establish topical validity.'] : [])]};
}
