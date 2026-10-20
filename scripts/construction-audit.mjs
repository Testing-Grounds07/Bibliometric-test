import {holmAdjust} from './network-extensions.mjs';

export const CONSTRUCTION_VERSION = 'incidence-audit-v1';
const keyFor = (left, right) => JSON.stringify([left, right].sort());
const chooseTwo = size => size * (size - 1) / 2;

export function incidenceEvidence(graph) {
 if(graph.collaboration)throw Error('Citation incidence audits are not defined for collaboration actors.');
 if (graph.directed || graph.canvasKind === 'historiography' || graph.method === 'direct_citation') throw new Error('This audit requires an undirected citation-derived projection.');
 const ids = graph.nodes.map(node => node.id), eligible = new Set(ids);
 if (eligible.size !== ids.length) throw new Error('Evidence identifiers must be unique.');
 const coupling = graph.method === 'coupling' || graph.canvasKind === 'coupling', rows = new Map();
 if (coupling) {
  for (const node of graph.nodes) {
   if (!Array.isArray(node.references)) throw new Error('Full available source reference lists are required.');
   for (const reference of new Set(node.references)) { if (!rows.has(reference)) rows.set(reference, new Set()); rows.get(reference).add(node.id); }
  }
 } else {
  for (const node of graph.nodes) {
   if (!Array.isArray(node.articles)) throw new Error('Source-to-reference incidence is required.');
   for (const source of new Set(node.articles)) { if (!rows.has(source)) rows.set(source, new Set()); rows.get(source).add(node.id); }
  }
 }
 const records = [...rows].sort(([left], [right]) => left.localeCompare(right)).map(([id, members]) => ({id, members: [...members].filter(member => eligible.has(member)).sort()}));
 const incidences = records.reduce((sum, row) => sum + row.members.length, 0), pairs = records.reduce((sum, row) => sum + chooseTwo(row.members.length), 0);
 if (ids.length > 800 || incidences > 50000 || pairs > 3000000) throw new Error('Deep projection audits support up to 800 articles, 50,000 incidences and 3 million event-pair contributions. Narrow the analytical scope; no evidence was truncated.');
 return {ids: [...ids].sort(), rows: records, coupling, incidences, contributions: pairs, scope: coupling ? 'Selected source articles and their full available reference lists' : 'Selected reference universe and observed citing-source incidence'};
}

export function projectIncidence(evidence, options = {}) {
 const counting = options.counting || 'full', normalization = options.normalization || 'cosine', minimumSupport = options.minimumSupport ?? 1;
 if (!['full', 'event-fractional'].includes(counting) || !['raw', 'cosine', 'jaccard', 'association'].includes(normalization) || !Number.isInteger(minimumSupport) || minimumSupport < 1) throw new Error('Invalid construction definition.');
 const candidates = new Map(), masses = Object.fromEntries(evidence.ids.map(id => [id, 0]));
 for (const row of evidence.rows) {
  const multiplicity = options.rowWeights ? options.rowWeights[row.id] || 0 : 1;
  if (!multiplicity) continue;
  const weight = multiplicity * (counting === 'event-fractional' ? row.members.length > 1 ? 1 / chooseTwo(row.members.length) : 1 : 1);
  for (const member of row.members) masses[member] += weight;
  for (let left = 0; left < row.members.length; left++) for (let right = left + 1; right < row.members.length; right++) {
   const source = row.members[left], target = row.members[right], key = keyFor(source, target);
   if (!candidates.has(key)) candidates.set(key, {source, target, rawSupport: 0, weightedSupport: 0});
   const pair = candidates.get(key); pair.rawSupport++; pair.weightedSupport += weight;
  }
 }
 const links = [];
 for (const pair of candidates.values()) if (pair.rawSupport >= minimumSupport) {
  const left = masses[pair.source], right = masses[pair.target], denominator = normalization === 'cosine' ? Math.sqrt(left * right) : normalization === 'jaccard' ? left + right - pair.weightedSupport : normalization === 'association' ? left * right : 1;
  const strength = denominator > 0 ? pair.weightedSupport / denominator : 0;
  if (strength > 0) links.push({...pair, count: pair.rawSupport, strength});
 }
 return {links, counting, normalization, minimumSupport, candidatePairs: candidates.size, scope: evidence.scope, supportMeaning: evidence.coupling ? 'Distinct shared reference IDs' : 'Distinct citing source IDs', weightingMeaning: counting === 'full' ? 'Each incidence event contributes one to each member pair.' : 'Each multi-member incidence event contributes total pair weight one; singleton events retain marginal weight one. For coupling, events are shared references, not source bibliographies.'};
}

export function constructionCandidates(graph) {
 const evidence = incidenceEvidence(graph), minimumSupport = Math.max(1, graph.method === 'coupling' || graph.canvasKind === 'coupling' ? graph.minimumShared || 3 : graph.minimumSupport || 5);
 const variants = [
  {counting: 'full', normalization: 'raw', minimumSupport},
  {counting: 'full', normalization: 'cosine', minimumSupport},
  {counting: 'full', normalization: 'jaccard', minimumSupport},
  {counting: 'full', normalization: 'association', minimumSupport},
  {counting: 'event-fractional', normalization: 'cosine', minimumSupport},
  {counting: 'full', normalization: 'cosine', minimumSupport: minimumSupport + 1}
 ];
 return variants.map(definition => {
  const construction = projectIncidence(evidence, definition), adjacent = new Set(construction.links.flatMap(edge => [edge.source, edge.target]));
  return {...graph, nodes: graph.nodes.map(node => ({...node, cluster: 0})), links: construction.links, scienceAudit: undefined, reliability: undefined, appliedSettings: undefined, autoCPM: undefined, themeDescriptions: undefined, generatedDescriptions: undefined, construction: {...construction, links: undefined}, stats: {nodes: graph.nodes.length, edges: construction.links.length, clusters: 0, isolated_nodes: graph.nodes.length - adjacent.size}, normalization: construction.normalization};
 });
}

function randomSource(seed) {
 let state = seed >>> 0;
 return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}

export function marginSignature(evidence) {
 const columns = Object.fromEntries(evidence.ids.map(id => [id, 0]));
 for (const row of evidence.rows) for (const id of row.members) columns[id]++;
 return JSON.stringify({rows: evidence.rows.map(row => [row.id, row.members.length]), columns});
}

export function switchIncidence(evidence, options = {}) {
 const rows = evidence.rows.map(row => ({id: row.id, members: [...row.members], membership: new Set(row.members)})), random = randomSource(options.seed ?? 42), attempts = options.attempts ?? Math.max(100, evidence.incidences * 20);
 if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10000000) throw new Error('Invalid switch-chain budget.');
 let accepted = 0, feasible = false;
 for (let attempt = 0; attempt < attempts; attempt++) {
  if (rows.length < 2) break;
  const left = Math.floor(random() * rows.length), right = Math.floor(random() * rows.length);
  if (left === right || !rows[left].members.length || !rows[right].members.length) continue;
  const leftPosition = Math.floor(random() * rows[left].members.length), rightPosition = Math.floor(random() * rows[right].members.length), first = rows[left].members[leftPosition], second = rows[right].members[rightPosition];
  if (first === second || rows[left].membership.has(second) || rows[right].membership.has(first)) continue;
  rows[left].membership.delete(first); rows[left].membership.add(second); rows[right].membership.delete(second); rows[right].membership.add(first);
  rows[left].members[leftPosition] = second; rows[right].members[rightPosition] = first; accepted++; feasible = true;
 }
 const next = {...evidence, rows: rows.map(row => ({id: row.id, members: [...row.members].sort()}))};
 if (marginSignature(next) !== marginSignature(evidence)) throw new Error('Incidence margin preservation failed; no null result published.');
 let shared = 0;
 for (let position = 0; position < rows.length; position++) for (const member of evidence.rows[position].members) if (rows[position].membership.has(member)) shared++;
 return {evidence: next, attempted: attempts, accepted, acceptance: accepted / attempts, overlap: evidence.incidences ? shared / evidence.incidences : 1, feasible};
}

export function switchFeasibility(evidence, maximumComparisons = 100000) {
 const rows = evidence.rows.map(row => new Set(row.members)); let comparisons = 0;
 for (let left = 0; left < rows.length; left++) for (let right = left + 1; right < rows.length; right++) {
  if (++comparisons > maximumComparisons) return {status: 'undetermined-within-budget', comparisons};
  const first = [...rows[left]].some(id => !rows[right].has(id)), second = [...rows[right]].some(id => !rows[left].has(id));
  if (first && second) return {status: 'feasible-switch-found', comparisons};
 }
 return {status: 'frozen-margins-proven', comparisons};
}

export function incidenceNull(graph, options = {}, progress = () => {}) {
 const samples = options.samples ?? 50, seed = options.seed ?? 20261019;
 if (![10, 50, 199].includes(samples)) throw new Error('Choose 10, 50 or 199 null samples.');
 const evidence = incidenceEvidence(graph), signature = marginSignature(evidence), observed = projectIncidence(evidence, {normalization: 'raw'}), byPair = new Map(observed.links.map(edge => [keyFor(edge.source, edge.target), edge.rawSupport]));
 const keys = graph.links.map(edge => keyFor(edge.source, edge.target));
 if (new Set(keys).size !== keys.length) throw new Error('Null tests require unique undirected analytical pairs.');
 const records = keys.map(key => ({key, observed: byPair.get(key) || 0, exceedances: 0, total: 0, totalSquared: 0})), diagnostics = [], feasibility = switchFeasibility(evidence), statistics = [];
 let current = evidence;
 for (let position = 0; position < samples; position++) {
  progress('Margin-preserving null ' + (position + 1) + '/' + samples);
  const chain = switchIncidence(current, {seed: seed + position * 104729, attempts: Math.max(100, evidence.incidences * (position === 0 ? 200 : 100))});
  current = chain.evidence;
  if (marginSignature(current) !== signature) throw new Error('Null margins changed; no result published.');
  const nullPairs = new Map(projectIncidence(current, {normalization: 'raw'}).links.map(edge => [keyFor(edge.source, edge.target), edge.rawSupport]));
  for (const record of records) { const value = nullPairs.get(record.key) || 0; record.exceedances += value >= record.observed ? 1 : 0; record.total += value; record.totalSquared += value * value; }
  statistics.push(records.reduce((sum, record) => sum + (nullPairs.get(record.key) || 0), 0));
  const originalRows = new Map(evidence.rows.map(row => [row.id, new Set(row.members)]));
  const originalShared = current.rows.reduce((sum, row) => sum + row.members.filter(id => originalRows.get(row.id).has(id)).length, 0);
  diagnostics.push({attempted: chain.attempted, accepted: chain.accepted, acceptance: chain.acceptance, consecutiveOverlap: chain.overlap, originalOverlap: evidence.incidences ? originalShared / evidence.incidences : 1});
 }
 const accepted = diagnostics.reduce((sum, item) => sum + item.accepted, 0), familySize = chooseTwo(evidence.ids.length), adjusted = holmAdjust(records.map(record => (record.exceedances + 1) / (samples + 1)), familySize);
 const status = feasibility.status === 'frozen-margins-proven' ? 'degenerate-not-assessed' : diagnostics.some(item => item.accepted < evidence.incidences) || !accepted ? 'insufficient-movement' : 'exploratory-null';
 const average = statistics.reduce((sum, value) => sum + value, 0) / statistics.length, variance = statistics.reduce((sum, value) => sum + (value - average) ** 2, 0), lagOne = variance ? statistics.slice(1).reduce((sum, value, position) => sum + (value - average) * (statistics[position] - average), 0) / variance : null;
 return {version: CONSTRUCTION_VERSION, status, samples, seed, familySize, minimumP: 1 / (samples + 1), multiplicityResolution: familySize / (samples + 1) > .05 ? 'Too few simulations to attain Holm-adjusted 0.05 for the smallest p value across this pair family; no absence-of-significance reassurance is warranted.' : 'Finite Monte Carlo resolution still limits attainable p values.', marginsPreserved: true, scope: evidence.scope, diagnostics, feasibility, lagOne: {statistic: 'Total overlap on examined pairs', value: lagOne, limitation: 'One scalar movement diagnostic; low autocorrelation is not proof of mixing.'}, acceptedSwitches: accepted, records: records.map((record, position) => { const mean = record.total / samples, variance = Math.max(0, record.totalSquared / samples - mean * mean); return {key: record.key, observed: record.observed, nullMean: mean, enrichment: mean ? record.observed / mean : null, excess: record.observed - mean, nullSD: Math.sqrt(variance), p: (record.exceedances + 1) / (samples + 1), adjustedP: status === 'exploratory-null' ? adjusted[position] : null}; }), limitation: 'Exploratory binary-incidence switch-chain baseline preserving each event size and article incidence frequency exactly. Attempt/acceptance counts and successive/original overlaps diagnose movement, not convergence or independence. Empirical p values use +1 correction and Holm over all possible pairs in the selected universe. This is a pair-overlap test, not whole-hyperedge significance, thematic validity or evidence-bootstrap reliability. Frozen or low-movement chains are not assessed. Higher-order combination re-mining is not performed.'};
}
