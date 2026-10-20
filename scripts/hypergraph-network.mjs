export const HYPERGRAPH_PROJECTION = 'Size-normalized hypergraph projection: each supported group contributes weight / (group size − 1) to every member pair. This models choosing an incident group by weight, then a different member uniformly. Leiden optimizes CPM on this projection; Infomap optimizes its two-level map equation on the same walk. This is not direct hypergraph modularity or memory-network inference. Original pair lines retain their evidence counts; envelopes show whole groups.';
export const HYPERGRAPH_MODEL_VERSION = 'incidence-v1';
export const HYPERGRAPH_INCIDENCE = 'Whole groups are retained as article–group incidence nodes, without clique projection. Each membership has its group weight; Leiden normalizes membership weights to mean one and optimizes bipartite CPM with cross-class gamma and zero within-class penalties. Infomap encodes visits to both article and group nodes in a weighted undirected incidence walk (including return to the same article). This is a memoryless incidence model, not a multilayer memory model or direct hypergraph modularity. Helper groups never become article tiles. Original pair lines and bridge roles retain their original evidence; envelopes show complete groups. Stability is not thematic validation.';

export function incidenceNetwork(graph) {
 if (!Array.isArray(graph.hyperedges)) throw new Error('Hypergraph evidence must be reconstructed before clustering.');
 const universe = new Set(graph.nodes.map(node => node.id)), edges = [];
 let occurrences = 0;
 for (const edge of graph.hyperedges) {
  if (!Number.isFinite(edge.weight) || edge.weight < 0) throw new Error('Invalid hyperedge weight');
  const members = [...new Set(edge.members)].sort();
  if (members.some(id => !universe.has(id))) throw new Error('Unknown hypergraph member');
  if (members.length < 2 || !edge.weight) continue;
  occurrences += members.length;
  if (occurrences > 200000 || edges.length >= 20000) throw new Error('Hypergraph incidence exceeds safe limits. Narrow the scope; no truncated network was used.');
  edges.push({...edge, members});
 }
 const articleIds = [...new Set(edges.flatMap(edge => edge.members))].sort(), positions = new Map(articleIds.map((id, position) => [id, position]));
 const links = edges.flatMap((edge, position) => edge.members.map(id => ({source: positions.get(id), target: articleIds.length + position, strength: edge.weight})));
 const scale = links.reduce((sum, edge) => sum + edge.strength, 0) / Math.max(1, links.length);
 return {articleIds, groups: edges, links, scale, density: articleIds.length && edges.length ? links.length / (articleIds.length * edges.length) : 0, modelVersion: HYPERGRAPH_MODEL_VERSION};
}

export function isIncidenceModel(graph) { return graph.networkModel === 'hypergraph' && graph.clustering?.algorithm !== 'hypergraph' && graph.clustering?.modelVersion === HYPERGRAPH_MODEL_VERSION; }

export function connectionModel(graph) {
 return graph.networkModel || graph.clustering?.networkModel || (graph.clustering?.algorithm === 'hypergraph' ? 'hypergraph' : graph.order && graph.order !== 2 ? 'higher-order' : 'pairwise');
}

export function hypergraphProjection(hyperedges, limit = 200000) {
 const pairs = new Map();
 let work = 0;
 for (const edge of hyperedges) {
  const members = [...new Set(edge.members)].sort();
  if (!Number.isFinite(edge.weight) || edge.weight < 0) throw new Error('Invalid hyperedge weight');
  if (members.length < 2 || !edge.weight) continue;
  work += members.length * (members.length - 1) / 2;
  if (work > 3000000) throw new Error('Hypergraph projection exceeds the safe computation limit. Narrow the scope; no truncated network was used.');
  for (let left = 0; left < members.length; left++) for (let right = left + 1; right < members.length; right++) {
   const key = JSON.stringify([members[left], members[right]]);
   if (!pairs.has(key)) {
    if (pairs.size >= limit) throw new Error('Too many projected hypergraph connections. Narrow the scope; no truncated network was used.');
    pairs.set(key, {source: members[left], target: members[right], strength: 0});
   }
   pairs.get(key).strength += edge.weight / (members.length - 1);
  }
 }
 return [...pairs.values()];
}

export function analysisNetwork(graph) {
 if (graph.networkModel !== 'hypergraph' || graph.clustering?.algorithm === 'hypergraph') return graph;
 if (!graph.hyperedges) throw new Error('Hypergraph evidence must be reconstructed before clustering.');
 if (isIncidenceModel(graph)) {
  const incidence = incidenceNetwork(graph);
  return {...graph, links: incidence.links.map(edge => ({...edge, source: edge.source < incidence.articleIds.length ? incidence.articleIds[edge.source] : JSON.stringify(['group', edge.source]), target: JSON.stringify(['group', edge.target])}))};
 }
 return {...graph, links: hypergraphProjection(graph.hyperedges)};
}
