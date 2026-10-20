import {partition, densityGrid, resample, fragmentation} from './auto-cpm.mjs';
import {couplingPairs, couplingGraph, clusterRecovery, bootstrapWeights, summarizeRecovery, connectionRoles} from './evidence-metrics.mjs';
import {compareCouplingSettings} from './coupling-settings.mjs';
import {analysisErrorMessage} from './analysis-errors.mjs';

self.onmessage = event => {
 try {
  const request = event.data;
  if (request.action === 'compare-coupling') {
   self.postMessage({audit: compareCouplingSettings(request.articles, request.current, progress => self.postMessage({progress}))});
  } else if (request.action === 'coupling') {
   self.postMessage({progress: 'Counting shared references…'});
   const pairs = couplingPairs(request.articles);
   const graph = couplingGraph(request.articles, pairs, request.minimumShared, request.minimumCosine);
   const density = densityGrid(graph).density;
   graph.resolution = request.resolution || Math.max(.000001, density / 4);
   graph.resolutionSelection = request.resolution ? 'Manual CPM' : 'Exploratory scaled density / 4; floor 0.000001; not a stability-selected optimum';
   self.postMessage({progress: 'Clustering source articles with ten Leiden starts…'});
   const result = partition(graph, graph.resolution);
   for (const node of graph.nodes) node.cluster = result.memberships[node.id] || 0;
   graph.clustering = {...result, algorithm: 'Leiden CPM', resolution: graph.resolution, starts: 10};
   graph.fragmentation = fragmentation(graph, result.memberships);
   graph.density = density;
   self.postMessage({graph, roles: connectionRoles(graph)});
  } else if (request.action === 'stability') {
   if (['infomap', 'hypergraph'].includes(request.graph.clustering?.algorithm)) throw new Error('Reliability is not implemented for this method. Leiden resamples cannot validate another algorithm.');
   const graph = request.graph, original = Object.fromEntries(graph.nodes.map(node => [node.id, node.cluster]));
   const coupling = graph.method === 'coupling';
   const pairs = coupling ? couplingPairs(graph.nodes) : null;
   const ids = coupling ? [...new Set(graph.nodes.flatMap(node => node.references))].sort() : request.articleIds;
   const samples = [];
   for (let sample = 0; sample < 50; sample++) {
    const weights = bootstrapWeights(ids, sample);
    const sampled = coupling ? couplingGraph(graph.nodes, pairs, graph.minimumShared, graph.minimumCosine, weights) : resample(graph, weights, graph.bundles || []);
    samples.push(clusterRecovery(original, partition(sampled, graph.resolution, 2).memberships));
    self.postMessage({progress: 'Stability resample ' + (sample + 1) + '/50'});
   }
   self.postMessage({stability: {samples: 50, seed: 20261016, restarts: 2, resamplingUnit: coupling ? 'Distinct available reference IDs, with replacement' : 'Source articles, with replacement', clusters: summarizeRecovery(samples), limitations: coupling ? 'Source selection is fixed. Reference bootstrap is a sensitivity diagnostic, not source-article bootstrap or a confidence interval. Shared-reference thresholds and cosine weights are rebuilt; previously excluded pairs can enter.' : 'Conditional on the selected reference universe, original eligible edges, discovered bundles and any expanded neighborhood. No re-mining or neighbor re-selection. Not a confidence interval or thematic validation.'}});
  } else throw new Error('Unknown evidence request');
 } catch (error) { self.postMessage({error: analysisErrorMessage(error)}); }
};
