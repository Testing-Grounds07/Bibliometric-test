import {partition, resample} from './auto-cpm.mjs';
import {couplingPairs, couplingGraph, bootstrapWeights, clusterRecovery, summarizeRecovery} from './evidence-metrics.mjs';
import {buildHyperedges, hypergraphPartition} from './community-methods.mjs';
import {couplingHyperedges} from './coupling-hypergraph.mjs';

export function resampleHyperedges(edges, weights, minimumSupport) {
 const retained = edges.filter(edge => edge.articles.reduce((sum, id) => sum + (weights[id] || 0), 0) >= minimumSupport);
 const occurrences = new Map();
 for (const edge of retained) for (const id of edge.articles) occurrences.set(id, (occurrences.get(id) || 0) + 1);
 return retained.map(edge => ({...edge, weight: edge.articles.reduce((sum, id) => sum + (weights[id] || 0) / occurrences.get(id), 0)}));
}

export function sourceSubset(nodes, sample) {
 let seed = 20261016 + sample;
 const shuffled = [...nodes].sort((left, right) => left.id.localeCompare(right.id));
 for (let position = shuffled.length - 1; position > 0; position--) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const other = seed % (position + 1); [shuffled[position], shuffled[other]] = [shuffled[other], shuffled[position]];
 }
 return shuffled.slice(0, Math.max(1, Math.floor(nodes.length * .9)));
}

export function prepareReliability(graph, articleIds, sampleCount = 10, options = {}) {
 if (graph.collaboration) throw new Error('Citation bootstrap is not defined for collaboration actors. Use declared collaboration construction sensitivity.');
 if (graph.semantic) throw new Error('Citation bootstrap is not defined for semantic networks. Use text and threshold sensitivity.');
 if (![10, 50].includes(sampleCount)) throw new Error('Choose 10 or 50 resamples.');
 if (graph.clustering?.algorithm && !['leiden', 'Leiden CPM', 'infomap', 'hypergraph', 'sbm'].includes(graph.clustering.algorithm)) throw new Error('Reliability does not support this clustering algorithm.');
 const coupling = graph.method === 'coupling' || graph.canvasKind === 'coupling';
 if (options.mode && !['evidence', 'sources'].includes(options.mode)) throw new Error('Unknown reliability mode');
 if (options.mode === 'sources' && !coupling) throw new Error('Source subsampling is only available for coupling.');
 const algorithm = ['infomap', 'hypergraph', 'sbm'].includes(graph.clustering?.algorithm) ? graph.clustering.algorithm : 'leiden';
 const ids = [...new Set(coupling ? graph.nodes.flatMap(node => node.references || []) : articleIds)].sort();
 if (!ids.length) throw new Error('No resampling evidence is available.');
 if (!graph.nodes.some(node => node.cluster > 0)) throw new Error('No linked clusters to assess.');
 const pairs = coupling ? couplingPairs(graph.nodes) : null;
 const wholeGroups = algorithm === 'hypergraph' || graph.networkModel === 'hypergraph';
 const hyperedges = wholeGroups && !coupling ? graph.hyperedges || buildHyperedges(graph, graph.bundles || []) : null;
 const original = Object.fromEntries(graph.nodes.map(node => [node.id, node.cluster]));
 const results = [];
 let nonconverged = 0;
 return {
  algorithm, sampleCount,
  sample(index) {
   const weights = bootstrapWeights(ids, index + (options.seedOffset || 0));
   const selected = options.mode === 'sources' ? sourceSubset(graph.nodes, index + (options.seedOffset || 0)) : graph.nodes;
   const selectedIds = new Set(selected.map(node => node.id));
   const sampled = coupling ? couplingGraph(selected, options.mode === 'sources' ? pairs.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target)) : pairs, graph.minimumShared, graph.minimumCosine, options.mode === 'sources' ? null : weights) : resample(graph, weights, graph.bundles || []);
   sampled.clustering = graph.clustering;
   sampled.networkModel = graph.networkModel;
   if (!wholeGroups) return {graph: sampled};
   const edges = coupling ? couplingHyperedges(sampled).filter(edge => options.mode === 'sources' || weights[edge.reference] > 0).map(edge => ({...edge, weight: options.mode === 'sources' ? 1 : weights[edge.reference]})) : resampleHyperedges(hyperedges, weights, graph.minimumSupport || 5);
   sampled.hyperedges = edges;
   return {graph: sampled, hyperedges: edges};
  },
  partition(sample, progress) {
   if (algorithm === 'infomap' || algorithm === 'sbm') throw new Error('This method must use its own engine.');
   return algorithm === 'hypergraph' ? hypergraphPartition(sample.graph, sample.hyperedges, progress, {...graph.clustering, trials: 2}) : partition(sample.graph, graph.resolution, 2);
  },
  record(result) {
   if (result.converged === false) nonconverged++;
   results.push(clusterRecovery(original, result.memberships));
  },
  finish() {
   if (results.length !== sampleCount) throw new Error('Incomplete resampling results cannot be reported as a completed check.');
   return {algorithm, method: algorithm === 'leiden' ? 'Leiden CPM' : algorithm === 'infomap' ? 'Infomap' : algorithm === 'sbm' ? 'Nested block model' : 'Hypergraph modularity', samples: results.length, preliminary: results.length < 50, restarts: 2, seed: 20261016, nonconverged,
    settings: graph.clustering, networkModel: graph.networkModel, seedOffset: options.seedOffset || 0, mode: options.mode || 'evidence',
    resamplingUnit: options.mode === 'sources' ? '90% of source articles, without replacement; deliberately omitted members count as losses' : coupling ? 'Distinct available reference IDs, with replacement (feature sensitivity, not source-sample stability)' : 'Source articles, with replacement', clusters: summarizeRecovery(results),
    limitations: (options.mode === 'sources' ? 'Complementary source-sample sensitivity. Reference lists and thresholds remain fixed; 10% of sources are deliberately removed without replacement. Removed sources count as losses in recovery and retention, so these scores are not directly comparable to feature-bootstrap recovery.' : coupling ? 'Source selection is fixed. Reference bootstrap rebuilds shared-reference thresholds, cosine weights and eligible source membership. Hypergraph reference weights equal bootstrap multiplicities.' : 'Conditional on the selected reference universe and discovered evidence. Original pair candidates and exact hyperedges are fixed; support and source-normalized hyperedge weights are recomputed. No new combinations or neighbors are mined.') + ' Two optimization starts per resample; optimization variability is included. This is a sensitivity diagnostic, not a confidence interval, significance test or thematic validation.'};
  }
 };
}
