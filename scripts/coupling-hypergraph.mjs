export const COUPLING_HYPERGRAPH_METHOD = 'Each distinct shared reference is one hyperedge containing the eligible source articles citing it, with unit weight per reference. Duplicate references within a source count once. The source universe is restricted to articles with at least one threshold-eligible coupling edge. Pair thresholds select this universe; they do not prune whole reference groups. Lines retain thresholded shared-reference counts, not hyperedge weights. This differs from co-citation combinations and from cosine-weighted pair clustering.';

export function couplingHyperedges(graph, limit = 3000000) {
 const eligible = new Set(graph.links.flatMap(edge => [edge.source, edge.target]));
 const references = new Map();
 for (const node of graph.nodes) if (eligible.has(node.id)) {
  for (const reference of new Set(node.references || [])) {
   if (!references.has(reference)) references.set(reference, new Set());
   references.get(reference).add(node.id);
  }
 }
 const hyperedges = [];
 let pairWork = 0;
 for (const [reference, sources] of [...references].sort(([left], [right]) => left.localeCompare(right))) {
  if (sources.size < 2) continue;
  pairWork += sources.size * (sources.size - 1) / 2;
  if (pairWork > limit) throw new Error('Coupling hypergraph exceeds the safe computation limit. Choose a smaller source scope or stronger connection thresholds; no truncated result was used.');
  hyperedges.push({members: [...sources].sort(), weight: 1, reference, order: sources.size});
 }
 return hyperedges;
}
