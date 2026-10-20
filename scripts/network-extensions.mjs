import {couplingPairs, couplingGraph} from './evidence-metrics.mjs';
import {invalidateScientificOutputs} from './scientific-invalidation.mjs';

export const edgeKey = edge => JSON.stringify([edge.source, edge.target].sort());

export function hypergeometricTail(population, successes, draws, observed) {
 if (![population, successes, draws, observed].every(Number.isInteger) || population < 0 || successes < 0 || draws < 0 || successes > population || draws > population) throw new Error('Invalid overlap counts');
 const lower = Math.max(0, draws + successes - population), upper = Math.min(successes, draws);
 if (observed <= lower) return 1;
 if (observed > upper) return 0;
 const logChoose = (total, count) => {
  const size = Math.min(count, total - count);
  let value = 0;
  for (let position = 1; position <= size; position++) value += Math.log(total - size + position) - Math.log(position);
  return value;
 };
 let logTerm = logChoose(successes, observed) + logChoose(population - successes, draws - observed) - logChoose(population, draws);
 let maximum = logTerm, sum = 1;
 for (let count = observed; count < upper; count++) {
  logTerm += Math.log(successes - count) + Math.log(draws - count) - Math.log(count + 1) - Math.log(population - successes - draws + count + 1);
  if (logTerm > maximum) { sum = sum * Math.exp(maximum - logTerm) + 1; maximum = logTerm; }
  else sum += Math.exp(logTerm - maximum);
 }
 return Math.min(1, Math.exp(maximum) * sum);
}

export function holmAdjust(values, familySize = values.length) {
 if (!Number.isInteger(familySize) || familySize < values.length) throw new Error('Invalid test family');
 const ordered = values.map((value, index) => ({value, index})).sort((left, right) => left.value - right.value), adjusted = [];
 let previous = 0;
 for (const [rank, item] of ordered.entries()) {
  if (!(item.value >= 0 && item.value <= 1)) throw new Error('Invalid p value');
  previous = Math.max(previous, Math.min(1, item.value * (familySize - rank)));
  adjusted[item.index] = previous;
 }
 return adjusted;
}

export function validateConnections(graph, alpha = .05) {
 if(graph.collaboration)throw Error('Citation connection significance is not defined for collaboration actors.');
 if (!(alpha > 0 && alpha < 1)) throw new Error('Choose a significance level between zero and one');
 const coupling = graph.canvasKind === 'coupling' || graph.method === 'coupling';
 const sets = new Map(graph.nodes.map(node => [node.id, new Set(coupling ? node.references || [] : node.articles || [])]));
 const degrees = new Map();
 for (const values of sets.values()) for (const id of values) degrees.set(id, (degrees.get(id) || 0) + 1);
 const strata = new Map();
 for (const [id, degree] of degrees) { if (!strata.has(degree)) strata.set(degree, []); strata.get(degree).push(id); }
 const eligible = [...strata].filter(([degree]) => degree >= 2), margins = new Map();
 for (const [id, values] of sets) {
  const counts = new Map();
  for (const opposite of values) counts.set(degrees.get(opposite), (counts.get(degrees.get(opposite)) || 0) + 1);
  margins.set(id, counts);
 }
 const records = graph.links.map(edge => {
  const left = sets.get(edge.source), right = sets.get(edge.target), overlaps = new Map();
  for (const id of left) if (right.has(id)) overlaps.set(degrees.get(id), (overlaps.get(degrees.get(id)) || 0) + 1);
  let minimum = 1, strongestStratum = null;
  for (const [degree, ids] of eligible) {
   const overlap = overlaps.get(degree) || 0;
   if (!overlap) continue;
   const probability = hypergeometricTail(ids.length, margins.get(edge.source).get(degree) || 0, margins.get(edge.target).get(degree) || 0, overlap);
   if (probability < minimum) { minimum = probability; strongestStratum = degree; }
  }
  return {key: edgeKey(edge), overlap: [...overlaps.values()].reduce((sum, count) => sum + count, 0), p: Math.min(1, minimum * eligible.length), strongestStratum};
 });
 const familySize = graph.nodes.length * (graph.nodes.length - 1) / 2;
 const adjusted = holmAdjust(records.map(record => record.p), familySize);
 records.forEach((record, index) => { record.adjustedP = adjusted[index]; record.retained = record.adjustedP <= alpha; });
 return {kind: 'validation', alpha, familySize, strata: eligible.length, oppositeNodes: degrees.size, records, retained: records.filter(record => record.retained).length,
  method: 'Degree-stratified hypergeometric overlap: Bonferroni across opposite-node degree strata, then Holm across every possible pair in the selected node universe. Unexamined pairs receive p=1.',
  limitation: 'Conditional on this corpus and node scope. Detects unusual pair overlap within at least one degree stratum; does not establish relevance, causation, or significance of a whole higher-order combination.'};
}

export function disparityBackbone(graph, alpha = .05) {
 if(graph.collaboration)throw Error('This citation-backbone adapter is not enabled for collaboration actors.');
 if (!(alpha > 0 && alpha < 1)) throw new Error('Choose a backbone threshold between zero and one');
 const totals = new Map(graph.nodes.map(node => [node.id, {degree: 0, strength: 0}]));
 for (const edge of graph.links) if (edge.strength > 0) for (const id of [edge.source, edge.target]) { const total = totals.get(id); total.degree++; total.strength += edge.strength; }
 const records = graph.links.map(edge => {
  const ends = [edge.source, edge.target].map(id => { const total = totals.get(id); return total.degree > 1 ? (Math.max(0, 1 - edge.strength / total.strength)) ** (total.degree - 1) : null; });
  const bothLeaves = ends.every(value => value == null);
  return {key: edgeKey(edge), endpointScores: ends, retained: edge.strength > 0 && (bothLeaves || ends.some(value => value != null && value < alpha)), isolatedPair: bothLeaves};
 });
 return {kind: 'backbone', alpha, records, retained: records.filter(record => record.retained).length,
  method: 'Disparity filter on analytical normalized edge strengths; retain if either testable endpoint passes. Isolated pairs are retained explicitly.',
  limitation: 'A local weight-allocation filter with an unadjusted threshold. It does not control network-wide false discoveries. Display filtering leaves clustering and reliability unchanged.'};
}

export function temporalNetwork(graph, articles, from, to) {
 if(graph.collaboration)throw Error('Citation temporal reconstruction is not defined for collaboration actors.');
 if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) throw new Error('Choose an ordered year range');
 const coupling = graph.canvasKind === 'coupling' || graph.method === 'coupling';
 const universe = coupling ? graph.nodes : articles;
 const selected = universe.filter(article => Number.isInteger(article.year) && article.year >= from && article.year <= to);
 if (!selected.length) throw new Error('No dated source articles in this period');
 const selectedIds = new Set(selected.map(article => article.id));
 let next;
 if (coupling) next = {...graph, ...couplingGraph(selected, couplingPairs(selected), graph.minimumShared, graph.minimumCosine)};
 else {
  const nodes = graph.nodes.map(node => ({...node, articles: [...new Set((node.articles || []).filter(id => selectedIds.has(id)))], cluster: 0}));
  for (const node of nodes) node.citations = node.articles.length;
  const postings = new Map(), pairs = new Map(), byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) for (const article of node.articles) { if (!postings.has(article)) postings.set(article, []); postings.get(article).push(node.id); }
  for (const [article, members] of postings) for (let left = 0; left < members.length; left++) for (let right = left + 1; right < members.length; right++) {
   const edge = {source: members[left], target: members[right]}, key = edgeKey(edge);
   if (!pairs.has(key)) pairs.set(key, {...edge, articles: [], references: [], match: ''});
   pairs.get(key).articles.push(article);
  }
  const links = [...pairs.values()].filter(edge => edge.articles.length >= (graph.minimumSupport || 5)).map(edge => ({...edge, count: edge.articles.length, strength: edge.articles.length / (byId.get(edge.source).citations * byId.get(edge.target).citations)}));
  next = {...graph, nodes, links, order: 2, maximumOrder: 2, bundles: [], hyperedges: null, excludedByOrder: nodes.filter(node => !node.articles.length).length};
 }
 next.temporal = {from, to, sourceCount: selected.length, sourceIds: [...selectedIds], missingYear: universe.filter(article => !Number.isInteger(article.year)).length, referenceUniverse: coupling ? 'All available references in the selected sources' : 'Fixed references from the parent scope', interpretation: 'Periods use source publication years. Co-citation is rebuilt pairwise on the fixed parent reference universe; coupling uses sources published in the period. Unequal corpus coverage and citation age can affect comparisons.'};
 next.networkModel = graph.networkModel === 'hypergraph' ? 'hypergraph' : 'pairwise';
 const degrees = new Map(next.nodes.map(node => [node.id, 0]));
 for (const edge of next.links) for (const id of [edge.source, edge.target]) degrees.set(id, degrees.get(id) + 1);
 for (const node of next.nodes) node.degree = degrees.get(node.id);
 next.scopeLabel = 'Sources published ' + from + '–' + to;
 delete next.extensionFilter; delete next.extensionResults; delete next.extensionAudit;
 next.reliability = null; next.settingsSearch = null; next.evidenceSensitivity = null; next.autoCPM = null; next.themeDescriptions = null;
 return invalidateScientificOutputs(next);
}

export function clusterTransitions(first, second) {
 const earlier = new Map(first.nodes.map(node => [node.id, node.cluster])), counts = new Map();
 for (const node of second.nodes) if (earlier.get(node.id) > 0 && node.cluster > 0) {
  const key = JSON.stringify([earlier.get(node.id), node.cluster]); counts.set(key, (counts.get(key) || 0) + 1);
 }
 return [...counts].map(([key, count]) => ({from: JSON.parse(key)[0], to: JSON.parse(key)[1], count})).sort((left, right) => right.count - left.count);
}
