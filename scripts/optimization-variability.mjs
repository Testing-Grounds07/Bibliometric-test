import {agreement} from './auto-cpm.mjs';

export async function optimizationVariability(graph, fit, progress = () => {}, options = {}) {
 const fits = options.fits ?? 5;
 if (fits !== 5) throw new Error('This diagnostic uses five fixed-evidence fits.');
 const results = [];
 for (let position = 0; position < fits; position++) {
  const seed = 20261019 + position * 101;
  progress('Fixed-evidence fit ' + (position + 1) + '/' + fits);
  const result = await fit(structuredClone(graph), {...graph.clustering, resolution: graph.resolution, trials: 1, seed});
  const memberships = result.memberships || Object.fromEntries(result.nodes.map(node => [node.id, node.cluster]));
  results.push({seed, memberships, quality: result.quality ?? result.clustering?.quality ?? null, converged: result.converged ?? result.clustering?.converged ?? null, linked: graph.nodes.filter(node => Number(memberships[node.id]) > 0).length});
 }
 const similarities = [];
 const labels = result => Object.fromEntries(graph.nodes.map(node => [node.id, Number(result.memberships[node.id]) > 0 ? String(result.memberships[node.id]) : 'unassigned:' + node.id]));
 for (let left = 0; left < results.length; left++) for (let right = left + 1; right < results.length; right++) similarities.push(graph.nodes.length < 2 ? 1 : agreement(labels(results[left]), labels(results[right])));
 return {version: 'optimization-variability-v1', fits, evidenceFixed: true, results, agreement: {mean: similarities.reduce((sum, value) => sum + value, 0) / similarities.length, minimum: Math.min(...similarities)}, limitation: 'Optimization-only variability on unchanged evidence and settings; distinct seeds, one requested start per fit where supported. Engine-specific fixed initialization budgets remain in force. Agreement uses the full supplied article universe, treating unassigned articles as distinct singletons, not one community. This is not evidence-bootstrap stability, an optimum guarantee, statistical significance or thematic validation.'};
}
