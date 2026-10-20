import {partition, densityGrid, agreement} from './auto-cpm.mjs';
import {invalidateScientificOutputs} from './scientific-invalidation.mjs';
import {analysisNetwork, HYPERGRAPH_PROJECTION, HYPERGRAPH_INCIDENCE, HYPERGRAPH_MODEL_VERSION, isIncidenceModel, incidenceNetwork} from './hypergraph-network.mjs';

export const INFOMAP_ARGS = '--two-level --flow-model undirected --num-trials 10 --seed 42 --markov-time 1 --output json --silent';
export function infomapArgs(options = {}) {
 const {markovTime = 1, trials = 10, seed = 42} = options;
 if (!Number.isFinite(markovTime) || markovTime <= 0 || !Number.isInteger(trials) || trials < 1 || !Number.isInteger(seed) || seed < 1) throw new Error('Invalid Infomap settings');
 return INFOMAP_ARGS.replace('--markov-time 1', '--markov-time ' + markovTime).replace('--num-trials 10', '--num-trials ' + trials).replace('--seed 42', '--seed ' + seed);
}
export const HYPERGRAPH_OBJECTIVES = ['majority', 'linear', 'quadratic', 'strict'];
export const HYPERGRAPH_SEARCHES = ['mixed', 'leiden-seeded', 'group-moves', 'annealing'];
function contribution(count, size, objective = 'linear') {
 if (!HYPERGRAPH_OBJECTIVES.includes(objective)) throw new Error('Unknown hypergraph objective');
 if (count <= size / 2) return 0;
 return objective === 'strict' ? Number(count === size) : (count / size) ** ({majority: 0, linear: 1, quadratic: 2}[objective]);
}
export const HYPERGRAPH_METHOD = 'Direct weighted linear-majority hypergraph modularity. Exact supported combinations at the selected order, or orders 2 through the combined cap, are reconstructed from closed bundles and reference incidence. Each source contributes one unit divided equally across its included combinations. Ten deterministic initializations; direct vertex moves maximize hypergraph modularity, not a pair-projection objective. Initialization uses three Leiden two-section partitions, components, singletons, and seeded bundle assignments. A bounded local search is not a global optimum.';

export function canonicalMemberships(memberships) {
 const groups = new Map();
 for (const [id, group] of Object.entries(memberships)) {
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(id);
 }
 return Object.fromEntries([...groups.values()].map(members => members.sort()).sort((left, right) => right.length - left.length || left[0].localeCompare(right[0])).flatMap((members, position) => members.map(id => [id, position + 1])));
}

export function infomapInput(graph) {
 if (isIncidenceModel(graph)) {
  const incidence = incidenceNetwork(graph);
  return {ids: [...incidence.articleIds, ...incidence.groups.map(() => null)], network: incidence.links.map(edge => `${edge.source} ${edge.target} ${edge.strength}`).join('\n')};
 }
 graph = analysisNetwork(graph);
 const ids = [...new Set(graph.links.filter(edge => edge.strength > 0).flatMap(edge => [edge.source, edge.target]))].sort();
 const index = new Map(ids.map((id, position) => [id, position]));
 return {ids, network: graph.links.filter(edge => edge.strength > 0).map(edge => `${index.get(edge.source)} ${index.get(edge.target)} ${edge.strength}`).join('\n')};
}

export function infomapResult(output, ids, options = {}) {
 if (!output?.json?.nodes) throw new Error('Infomap returned no partition');
 const memberships = {};
 for (const node of output.json.nodes) {
  if (options.modelVersion === HYPERGRAPH_MODEL_VERSION && Number.isInteger(node.id) && node.id >= 0 && node.id < ids.length && ids[node.id] === null) continue;
  if (!ids[node.id] || !node.path?.length) throw new Error('Infomap returned an unknown node');
  memberships[ids[node.id]] = node.path[0];
 }
 if (Object.keys(memberships).length !== ids.filter(id => id !== null).length) throw new Error('Infomap omitted connected nodes');
 if (options.modelVersion === HYPERGRAPH_MODEL_VERSION) return {memberships: canonicalMemberships(memberships), algorithm: 'infomap', label: 'Infomap · incidence flow', networkModel: 'hypergraph', modelVersion: HYPERGRAPH_MODEL_VERSION, objective: 'Two-level map equation encoding article and group visits on weighted incidence', quality: output.json.codelength, qualityLabel: 'Code length (bits; same incidence model and settings only)', trials: options.trials || 10, seed: options.seed || 42, markovTime: options.markovTime || 1, flowModel: 'undirected-incidence-both-classes-encoded', groupNodes: ids.filter(id => id === null).length, engine: '@mapequation/infomap 2.15.1', limitations: HYPERGRAPH_INCIDENCE};
 return {memberships: canonicalMemberships(memberships), algorithm: 'infomap', label: options.networkModel === 'hypergraph' ? 'Infomap · hypergraph flow' : 'Infomap', networkModel: options.networkModel, objective: 'Two-level map equation', quality: output.json.codelength, qualityLabel: 'Code length (bits; compare starts only at the same settings)', trials: options.trials || 10, seed: options.seed || 42, markovTime: options.markovTime || 1, flowModel: 'undirected', engine: '@mapequation/infomap 2.15.1', limitations: options.networkModel === 'hypergraph' ? HYPERGRAPH_PROJECTION : 'Uses the selected weighted pair projection, including higher-order pair projections. Not direct hypergraph inference. Algorithm agreement is not thematic validation. CPM does not apply.'};
}

export function buildHyperedges(graph, bundles, limit = 20000) {
 const nodes = new Map(graph.nodes.map(node => [node.id, node])), combinations = new Map();
 const add = members => {
  const key = JSON.stringify(members);
  if (combinations.has(key)) return;
  if (combinations.size >= limit) throw new Error(`More than ${limit.toLocaleString()} exact combinations. Choose a smaller reference scope or a single lower order; no truncated hypergraph was clustered.`);
  combinations.set(key, members);
 };
 if (graph.order === 2 || graph.order === 'all') for (const edge of graph.links) add([edge.source, edge.target].sort());
 if (graph.order !== 2) for (const bundle of bundles) {
  const members = [...new Set(bundle.members.filter(id => nodes.has(id)))].sort(), minimum = graph.order === 'all' ? 3 : graph.order, maximum = graph.order === 'all' ? Math.min(graph.maximumOrder, members.length) : graph.order;
  for (let order = minimum; order <= maximum && order <= members.length; order++) {
   const visit = (offset, chosen) => {
    if (chosen.length === order) { add(chosen); return; }
    for (let position = offset; position <= members.length - (order - chosen.length); position++) visit(position + 1, [...chosen, members[position]]);
   }; visit(0, []);
  }
 }
 const postings = new Map(graph.nodes.map(node => [node.id, new Set(node.articles || [])])), hyperedges = [];
 for (const [key, members] of combinations) {
  const first = [...members].sort((left, right) => postings.get(left).size - postings.get(right).size)[0];
  const articles = [...postings.get(first)].filter(article => members.every(id => postings.get(id).has(article))).sort();
  if (articles.length >= (graph.minimumSupport || 5)) hyperedges.push({id: key, members, articles});
 }
 const occurrences = new Map();
 for (const edge of hyperedges) for (const article of edge.articles) occurrences.set(article, (occurrences.get(article) || 0) + 1);
 for (const edge of hyperedges) edge.weight = edge.articles.reduce((sum, article) => sum + 1 / occurrences.get(article), 0);
 return hyperedges;
}

const reward = (counts, size, objective = 'linear') => {
 const maximum = Math.max(0, ...counts.values());
 return contribution(maximum, size, objective);
};
function expectedReward(size, fraction, objective) {
 if (fraction <= 0) return 0;
 if (fraction >= 1) return 1;
 let coefficient = 1, total = 0;
 for (let count = 0; count <= size; count++) {
  if (count > size / 2) total += contribution(count, size, objective) * coefficient * fraction ** count * (1 - fraction) ** (size - count);
  coefficient *= (size - count) / (count + 1);
 }
 return total;
}
function hypergraphModel(hyperedges, objective = 'linear', resolution = 1) {
 if (!Number.isFinite(resolution) || resolution <= 0) throw new Error('Invalid hypergraph resolution');
 const degrees = new Map(), sizes = new Map(), incidence = new Map();
 let weight = 0, volume = 0;
 for (const [position, edge] of hyperedges.entries()) {
  weight += edge.weight; volume += edge.members.length * edge.weight;
  sizes.set(edge.members.length, (sizes.get(edge.members.length) || 0) + edge.weight);
  for (const id of edge.members) {
   degrees.set(id, (degrees.get(id) || 0) + edge.weight);
   if (!incidence.has(id)) incidence.set(id, []);
   incidence.get(id).push(position);
  }
 }
 const taxCache = new Map();
 const tax = groupVolume => {
  if (taxCache.has(groupVolume)) return taxCache.get(groupVolume);
  const value = resolution * [...sizes].reduce((sum, [size, edgeWeight]) => sum + edgeWeight * expectedReward(size, groupVolume / volume, objective), 0);
  if (taxCache.size < 50000) taxCache.set(groupVolume, value);
  return value;
 };
 return {degrees, sizes, incidence, weight, volume, tax};
}

export function hypergraphModularity(hyperedges, memberships, objective = 'linear', resolution = 1) {
 if (!hyperedges.length) return 0;
 const model = hypergraphModel(hyperedges, objective, resolution), volumes = new Map();
 for (const [id, degree] of model.degrees) {
  if (memberships[id] == null) throw new Error('Hypergraph partition is missing a member');
  volumes.set(memberships[id], (volumes.get(memberships[id]) || 0) + degree);
 }
 const observed = hyperedges.reduce((sum, edge) => {
  const counts = new Map(); for (const id of edge.members) counts.set(memberships[id], (counts.get(memberships[id]) || 0) + 1);
  return sum + edge.weight * reward(counts, edge.members.length, objective);
 }, 0);
 return (observed - [...volumes.values()].reduce((sum, value) => sum + model.tax(value), 0)) / model.weight;
}

export function refineHypergraph(hyperedges, initial, seed = 42, maxPasses = 20, objective = 'linear', resolution = 1) {
 if (!hyperedges.length) return {memberships: {}, quality: 0, passes: 0, converged: true};
 const model = hypergraphModel(hyperedges, objective, resolution), memberships = {...initial}, ids = [...model.degrees.keys()].sort(), volumes = new Map();
 for (const id of ids) volumes.set(memberships[id], (volumes.get(memberships[id]) || 0) + model.degrees.get(id));
 const counts = hyperedges.map(edge => { const groups = new Map(); for (const id of edge.members) groups.set(memberships[id], (groups.get(memberships[id]) || 0) + 1); return groups; });
 let nextGroup = Math.max(...Object.values(memberships)) + 1, passes = 0, changed = true, random = seed;
 while (changed && passes < maxPasses) {
  changed = false; passes++;
  const order = [...ids];
  for (let position = order.length - 1; position > 0; position--) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; const other = random % (position + 1); [order[position], order[other]] = [order[other], order[position]]; }
  for (const id of order) {
   const original = memberships[id], degree = model.degrees.get(id), adjacent = model.incidence.get(id), candidates = new Set([nextGroup]);
   for (const position of adjacent) for (const group of counts[position].keys()) candidates.add(group);
   let selected = original, bestGain = 1e-10 * model.weight;
   const removalTax = model.tax(volumes.get(original)) - model.tax(Math.max(0, volumes.get(original) - degree));
   for (const candidate of candidates) {
    if (candidate === original) continue;
    let gain = removalTax + model.tax(volumes.get(candidate) || 0) - model.tax((volumes.get(candidate) || 0) + degree);
    for (const position of adjacent) {
     const edge = hyperedges[position], groups = counts[position], before = reward(groups, edge.members.length, objective), oldCount = groups.get(original), newCount = groups.get(candidate) || 0;
     groups.set(original, oldCount - 1); groups.set(candidate, newCount + 1);
     gain += edge.weight * (reward(groups, edge.members.length, objective) - before);
     groups.set(original, oldCount); if (newCount) groups.set(candidate, newCount); else groups.delete(candidate);
    }
    if (gain > bestGain) { bestGain = gain; selected = candidate; }
   }
   if (selected === original) continue;
   changed = true; if (selected === nextGroup) nextGroup++;
   memberships[id] = selected; volumes.set(original, Math.max(0, volumes.get(original) - degree)); volumes.set(selected, (volumes.get(selected) || 0) + degree);
   for (const position of adjacent) { const groups = counts[position], count = groups.get(original); if (count === 1) groups.delete(original); else groups.set(original, count - 1); groups.set(selected, (groups.get(selected) || 0) + 1); }
  }
 }
 return {memberships: canonicalMemberships(memberships), quality: hypergraphModularity(hyperedges, memberships, objective, resolution), passes, converged: !changed};
}

function moveState(hyperedges, initial, objective, resolution) {
 const model = hypergraphModel(hyperedges, objective, resolution), memberships = {...initial}, volumes = new Map();
 for (const [id, degree] of model.degrees) {
  if (memberships[id] == null) throw new Error('Hypergraph partition is missing a member');
  volumes.set(memberships[id], (volumes.get(memberships[id]) || 0) + degree);
 }
 const counts = hyperedges.map(edge => {
  const groups = new Map();
  for (const id of edge.members) groups.set(memberships[id], (groups.get(memberships[id]) || 0) + 1);
  return groups;
 });
 const proposal = members => {
  const original = memberships[members[0]], affected = new Map();
  let degree = 0;
  for (const id of members) {
   if (memberships[id] !== original) throw new Error('A group move must have one origin');
   degree += model.degrees.get(id);
   for (const position of model.incidence.get(id)) affected.set(position, (affected.get(position) || 0) + 1);
  }
  const candidates = new Set();
  for (const position of affected.keys()) for (const group of counts[position].keys()) if (group !== original) candidates.add(group);
  const gain = candidate => {
   if (candidate === original) return 0;
   let value = model.tax(volumes.get(original)) - model.tax(Math.max(0, volumes.get(original) - degree)) + model.tax(volumes.get(candidate) || 0) - model.tax((volumes.get(candidate) || 0) + degree);
   for (const [position, moved] of affected) {
    const groups = counts[position], edge = hyperedges[position], before = reward(groups, edge.members.length, objective), oldCount = groups.get(original), newCount = groups.get(candidate) || 0;
    groups.set(original, oldCount - moved); groups.set(candidate, newCount + moved);
    value += edge.weight * (reward(groups, edge.members.length, objective) - before);
    groups.set(original, oldCount);
    if (newCount) groups.set(candidate, newCount); else groups.delete(candidate);
   }
   return value;
  };
  const accept = candidate => {
   for (const id of members) memberships[id] = candidate;
   volumes.set(original, Math.max(0, volumes.get(original) - degree)); volumes.set(candidate, (volumes.get(candidate) || 0) + degree);
   for (const [position, moved] of affected) {
    const groups = counts[position], remaining = groups.get(original) - moved;
    if (remaining) groups.set(original, remaining); else groups.delete(original);
    groups.set(candidate, (groups.get(candidate) || 0) + moved);
   }
  };
  return {original, degree, candidates, gain, accept};
 };
 return {model, memberships, proposal};
}

function seededOrder(values, random) {
 const order = [...values];
 for (let position = order.length - 1; position > 0; position--) {
  const other = Math.floor(random() * (position + 1));
  [order[position], order[other]] = [order[other], order[position]];
 }
 return order;
}

export function searchHypergraph(hyperedges, initial, seed = 42, objective = 'linear', resolution = 1, strategy = 'group-moves') {
 if (!['group-moves', 'annealing'].includes(strategy)) throw new Error('Unsupported extended hypergraph search');
 if (!hyperedges.length) return {memberships:{}, quality:0, passes:0, converged:true};
 let randomState = seed >>> 0;
 const random = () => { randomState = (Math.imul(randomState,1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
 let best = refineHypergraph(hyperedges, initial, seed, 20, objective, resolution), totalPasses = best.passes;
 if (strategy === 'group-moves') {
  let groupMerges = 0;
  for (let round = 0; round < 4; round++) {
   const state = moveState(hyperedges, best.memberships, objective, resolution), groups = new Map();
   for (const [id, group] of Object.entries(state.memberships)) {
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(id);
   }
   let merged = false;
   for (const group of seededOrder(groups.keys(), random)) {
    const members = groups.get(group);
    if (!members.length) continue;
    const move = state.proposal(members);
    let target = group, bestGain = 1e-10 * state.model.weight;
    for (const candidate of move.candidates) {
     const gain = move.gain(candidate);
     if (gain > bestGain) { target = candidate; bestGain = gain; }
    }
    if (target === group) continue;
    move.accept(target); groups.get(target).push(...members); groups.set(group, []);
    groupMerges++; merged = true;
   }
   const refined = refineHypergraph(hyperedges, state.memberships, seed + round + 1, 20, objective, resolution);
   totalPasses += refined.passes;
   if (refined.quality > best.quality + 1e-12) best = refined;
   else return {...best, passes:totalPasses, groupRounds:round + 1, groupMerges, converged:!merged && refined.converged};
  }
  return {...best, passes:totalPasses, groupRounds:4, groupMerges, converged:false};
 }
 const state = moveState(hyperedges, best.memberships, objective, resolution), ids = [...state.model.degrees.keys()].sort();
 let currentQuality = best.quality, nextGroup = Math.max(...Object.values(state.memberships)) + 1, acceptedDownhill = 0, bestMemberships = {...state.memberships};
 for (let sweep = 0; sweep < 12; sweep++) {
  const temperature = .2 * (.002 / .2) ** (sweep / 11);
  for (const id of seededOrder(ids, random)) {
   const move = state.proposal([id]), candidates = [...move.candidates, nextGroup], target = candidates[Math.floor(random() * candidates.length)], gain = move.gain(target);
   if (gain <= 0 && random() >= Math.exp(gain / (temperature * move.degree))) continue;
   move.accept(target); if (target === nextGroup) nextGroup++;
   if (gain < 0) acceptedDownhill++;
   currentQuality += gain / state.model.weight;
   if (currentQuality > best.quality + 1e-12) { bestMemberships = {...state.memberships}; best = {...best, quality:currentQuality}; }
  }
 }
 const refined = refineHypergraph(hyperedges, bestMemberships, seed + 13, 20, objective, resolution);
 return {...refined, passes:totalPasses + refined.passes, annealingSweeps:12, acceptedDownhill, annealingSchedule:{initial:.2, final:.002, scale:'moved vertex degree'}, budgetLimited:true};
}

export function hypergraphPartition(graph, hyperedges, progress = () => {}, options = {}) {
 const objective = options.hypergraphObjective || 'linear', initialSeed = options.seed || 42, hypergraphResolution = options.hypergraphResolution ?? 1, hypergraphSearch=options.hypergraphSearch||'mixed';
 if(!HYPERGRAPH_SEARCHES.includes(hypergraphSearch))throw new Error('Unsupported direct hypergraph search');
 if (!Number.isFinite(hypergraphResolution) || hypergraphResolution <= 0) throw new Error('Invalid hypergraph resolution');
 if (!HYPERGRAPH_OBJECTIVES.includes(objective)) throw new Error('Unknown hypergraph objective');
 const pairs = new Map(), ids = [...new Set(hyperedges.flatMap(edge => edge.members))].sort();
 if (!ids.length) return {memberships: {}, algorithm: 'hypergraph', label: 'Hypergraph modularity', hypergraphObjective:objective, hypergraphResolution, hypergraphSearch, objective: objective+' hypergraph modularity', quality: 0, trials: 0, converged: true, limitations: 'No supported combinations at this order.'};
 for (const edge of hyperedges) for (let left = 0; left < edge.members.length; left++) for (let right = left + 1; right < edge.members.length; right++) {
  const members = [edge.members[left], edge.members[right]].sort(), key = JSON.stringify(members);
  if (!pairs.has(key)) pairs.set(key, {source: members[0], target: members[1], strength: 0});
  pairs.get(key).strength += edge.weight / (edge.members.length - 1);
 }
 const projection = {nodes: ids.map(id => ({id})), links: [...pairs.values()]}, density = densityGrid(projection).density;
 const starts = [.125, .5, 2].map(factor => partition(projection, Math.max(.000001, density * factor), 2).memberships);
 const component = {}, adjacency = new Map(ids.map(id => [id, []]));
 for (const edge of projection.links) { adjacency.get(edge.source).push(edge.target); adjacency.get(edge.target).push(edge.source); }
 let group = 0;
 for (const id of ids) if (!component[id]) { component[id] = ++group; const stack = [id]; while (stack.length) for (const other of adjacency.get(stack.pop())) if (!component[other]) { component[other] = group; stack.push(other); } }
 if(hypergraphSearch!=='leiden-seeded')starts.push(component, Object.fromEntries(ids.map((id, position) => [id, position + 1])));
 if(hypergraphSearch==='leiden-seeded')for(let trial=3;trial<10;trial++)starts.push(partition(projection,Math.max(.000001,density*[.125,.5,2][trial%3]),2,initialSeed+trial*10).memberships);
 for (let trial = 5; hypergraphSearch!=='leiden-seeded' && trial < 10; trial++) {
  const memberships = Object.fromEntries(ids.map((id, position) => [id, position + 1])); let random = 42 + trial;
  for (let position = 0; position < hyperedges.length; position++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; const edge = hyperedges[random % hyperedges.length]; for (const id of edge.members) memberships[id] = ids.length + position + 1; }
  starts.push(memberships);
 }
 let best; const trials = [];
 for (const [position, initial] of starts.slice(0, options.trials || 10).entries()) {
  progress(`Hypergraph modularity: initialization ${position + 1}/${options.trials || 10}…`);
  const result = ['group-moves','annealing'].includes(hypergraphSearch) ? searchHypergraph(hyperedges, initial, initialSeed + position, objective, hypergraphResolution, hypergraphSearch) : refineHypergraph(hyperedges, initial, initialSeed + position, 20, objective, hypergraphResolution);
  trials.push({seed: initialSeed + position, quality: result.quality, passes: result.passes, converged: result.converged, ...(['group-moves','annealing'].includes(hypergraphSearch)?{groupRounds:result.groupRounds,groupMerges:result.groupMerges,annealingSweeps:result.annealingSweeps,acceptedDownhill:result.acceptedDownhill,budgetLimited:result.budgetLimited}: {})});
  if (!best || result.quality > best.quality) best = {...result, seed: initialSeed + position};
 }
 const methodDescription=HYPERGRAPH_METHOD.replace('linear-majority',objective).replace('Initialization uses three Leiden two-section partitions, components, singletons, and seeded bundle assignments.',hypergraphSearch==='leiden-seeded'?'Initialization uses ten Leiden-generated guesses on a temporary projection.':'Initialization uses three Leiden two-section partitions, components, singletons, and seeded bundle assignments.');
 const searchLabel = {mixed:'Direct local moves · mixed starts','leiden-seeded':'Direct local moves · Leiden-generated starts','group-moves':'Group moves · experimental',annealing:'Annealing · experimental'}[hypergraphSearch];
 const extra = hypergraphSearch === 'group-moves' ? ' After vertex refinement, greedily merge neighboring whole communities and refine vertices again, for at most four rounds. This is a custom direct-score group-move heuristic, not the published h-Louvain algorithm.' : hypergraphSearch === 'annealing' ? ' After vertex refinement, run twelve cooling sweeps with degree-scaled temperatures 0.2 to 0.002, allowing downhill moves. Retain the best encountered partition and finish with greedy vertex refinement. Cooling is a fixed exploration budget, not a convergence guarantee.' : '';
 return {...best, algorithm: 'hypergraph', label: 'Hypergraph modularity', hypergraphObjective: objective, hypergraphResolution, hypergraphSearch, searchVersion: ['group-moves','annealing'].includes(hypergraphSearch)?'direct-search-v1':undefined, searchLabel, objective: objective + ' hypergraph modularity', qualityLabel: 'Hypergraph modularity (same objective and resolution only)', trials: trials.length, trialResults: trials, method: methodDescription + extra + ' Score = observed reward − resolution × expected reward; resolution 1 retains the original objective.', limitations: 'Experimental resolution extension and bounded search, not a significance test, global optimum or validated theme. For annealing, converged refers only to the final greedy refinement, not global convergence. Nested combinations are dependent; source-normalized weights prevent counting each as independent evidence. Pairwise lines remain a visualization, not the optimization objective.'};
}

export function applyCommunityResult(graph, result, hyperedges = null) {
 const baseline = Object.fromEntries(graph.nodes.filter(node => node.cluster > 0).map(node => [node.id, node.cluster]));
 const shared = Object.keys(baseline).filter(id => result.memberships[id]);
 const comparison = {baseline: 'Leiden CPM', baselineResolution: graph.resolution, baselineClusters: new Set(Object.values(baseline)).size, sharedNodes: shared.length, baselineLinkedNodes: Object.keys(baseline).length, methodLinkedNodes: Object.keys(result.memberships).length, adjustedRandIndex: shared.length > 1 ? agreement(baseline, result.memberships) : null, note: 'Agreement on shared linked nodes only; cluster numbers and colors do not correspond across methods. Agreement is not thematic validation. Quality scores have different definitions and cannot be compared across methods.'};
 for (const node of graph.nodes) node.cluster = result.memberships[node.id] || 0;
 const communities = new Set(Object.values(result.memberships)).size;
 const resolution = result.algorithm === 'leiden' ? result.resolution : null;
 return invalidateScientificOutputs({...graph, reliability: null, settingsSearch: null, appliedSettings: null, analysisId: null, derivedFromAnalysisId: graph.analysisId || graph.derivedFromAnalysisId, resolution, autoCPM: null, clustering: {...result, memberships: undefined, communities, clusters: communities, resolution}, comparison, hyperedges, stats: {...graph.stats, clusters: communities, isolated_nodes: graph.nodes.filter(node => !node.cluster).length}});
}
