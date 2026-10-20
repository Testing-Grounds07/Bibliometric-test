import {partition, densityGrid, fragmentation} from './auto-cpm.mjs';
import {couplingPairs, couplingGraph, bootstrapWeights, clusterRecovery, summarizeRecovery} from './evidence-metrics.mjs';
import {recoveryMetrics, assessCouplingCandidate, chooseCouplingCandidate} from './evidence-guidance.mjs';

export const COUPLING_SEARCH_METHOD = 'Exploratory bounded comparison v1. Test shared/cosine thresholds (1, 0.02), (3, 0.05), (5, 0.10), plus the current pair; CPM = scaled density × [1/8, 1/4, 1/2, 1], plus current manual CPM for current thresholds. Ten baseline Leiden starts, eight reference-ID bootstrap resamples with two starts each. Score = source coverage × member-weighted recovery − 0.20 × introduced tiny-member fraction. Prefer fewer groups within 0.03 of the best admissible score. Safeguards: coverage ≥0.60, recovery ≥0.70, retention ≥0.80, introduced tiny-member fraction ≤0.20, some internal subdivision, and no group containing >90% of linked sources. Validate the selected candidate on 50 additional resamples (seed offsets 100–149). No automatic application; no claim of a global optimum or thematic relevance.';

export function compareCouplingSettings(articles, current = {}, progress = () => {}) {
 const pairs = couplingPairs(articles), ids = [...new Set(articles.flatMap(article => article.references))].sort();
 const thresholds = [...new Map([[1, .02], [3, .05], [5, .1], [current.minimumShared ?? 3, current.minimumCosine ?? .05]].map(pair => [pair.join('|'), pair])).values()];
 const candidates = [];
 function sampleGraph(graph, sample) { return couplingGraph(articles, pairs, graph.minimumShared, graph.minimumCosine, bootstrapWeights(ids, sample)); }
 function evaluate(graph, resolution, samples) {
  const result = partition(graph, resolution), fragments = fragmentation(graph, result.memberships);
  const recovery = summarizeRecovery(samples.map(sample => clusterRecovery(result.memberships, partition(sample, resolution, 2).memberships)));
  const sizes = Object.values(recovery).map(record => record.size), linked = sizes.reduce((sum, size) => sum + size, 0);
  return assessCouplingCandidate({minimumShared: graph.minimumShared, minimumCosine: graph.minimumCosine, resolution, clusters: result.clusters, edges: graph.links.length, fragmentation: fragments, largestShare: Math.max(0, ...sizes) / Math.max(1, linked), ...recoveryMetrics(recovery, articles.length)});
 }
 for (const [minimumShared, minimumCosine] of thresholds) {
  const graph = couplingGraph(articles, pairs, minimumShared, minimumCosine), density = densityGrid(graph).density;
  const resolutions = new Set([.125, .25, .5, 1].map(factor => Math.max(.000001, density * factor)));
  if (current.resolution > 0 && minimumShared === current.minimumShared && minimumCosine === current.minimumCosine) resolutions.add(current.resolution);
  const samples = Array.from({length: 8}, (_, sample) => sampleGraph(graph, sample));
  for (const resolution of resolutions) {
   progress(`Comparing settings ${candidates.length + 1} · shared ≥${minimumShared}, cosine ≥${minimumCosine}, CPM ${resolution.toPrecision(3)}…`);
   candidates.push({id: candidates.length + 1, ...evaluate(graph, resolution, samples)});
  }
 }
 const selected = chooseCouplingCandidate(candidates);
 const base = {version: 1, method: COUPLING_SEARCH_METHOD, candidates, screeningSamples: 8, validationSamples: 50, seed: 20261016, validationSeedOffset: 100};
 if (!selected) return {...base, status: 'no_connections', outcome: 'No tested setting connects these sources. There is no recommendation.', selectedId: null};
 const graph = couplingGraph(articles, pairs, selected.minimumShared, selected.minimumCosine), result = partition(graph, selected.resolution), samples = [];
 for (let sample = 100; sample < 150; sample++) {
  progress(`Checking the selected trade-off on additional resample ${sample - 99}/50…`);
  samples.push(clusterRecovery(result.memberships, partition(sampleGraph(graph, sample), selected.resolution, 2).memberships));
 }
 const clusters = summarizeRecovery(samples), validation = assessCouplingCandidate({...selected, ...recoveryMetrics(clusters, articles.length)});
 const supported = selected.admissible && validation.admissible;
 return {...base, selectedId: selected.id, validation, validationClusters: clusters, status: supported ? 'promising' : 'no_clear_recommendation', outcome: supported ? 'A promising starting point among the tested settings: it balances keeping articles connected with groups that reappear under resampling. Review the articles before treating these as themes.' : 'No clear best setting. The selected trade-off still fails one or more safeguards; use it for exploration, not as a settled partition.', limitations: 'Reference-list sensitivity only; source selection and missing metadata are not tested. Eight screening resamples are coarse; 50 additional resamples check the selected choice, not every candidate. Grid limits and decision thresholds are heuristics. Disconnected groups can appear stable trivially. No stable CPM range or global optimum is established.'};
}
