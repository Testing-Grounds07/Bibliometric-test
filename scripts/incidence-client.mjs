import {incidenceNetwork, HYPERGRAPH_INCIDENCE, HYPERGRAPH_MODEL_VERSION} from './hypergraph-network.mjs';

export async function fitIncidenceLeiden(graph, settings = {}, signal) {
 const network = incidenceNetwork(graph);
 const resolution = settings.resolution ?? Math.max(.000001, network.density / 4);
 const trials = settings.trials ?? 10, seed = settings.seed ?? 42;
 if (!network.links.length) return {memberships: {}, clusters: 0, algorithm: 'leiden', label: 'Leiden · bipartite CPM', networkModel: 'hypergraph', modelVersion: HYPERGRAPH_MODEL_VERSION, resolution, trials, limitations: HYPERGRAPH_INCIDENCE};
 const payload = {nodes: network.articleIds, groups: network.groups.map(edge => ({members: edge.members, weight: edge.weight})), resolution, trials, seed};
 let response, transientFailures = 0;
 for (let attempt = 0; attempt < 90; attempt++) {
  try { response = await fetch('analysis-api/incidence', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal}); }
  catch (error) { if (signal?.aborted || error.name === 'AbortError') throw error; response = null; if (++transientFailures >= 3) throw new Error('Incidence service connection failed after three attempts. Rerun the settings search.'); }
  const transient = response && [502,503,504].includes(response.status);
  if (transient && ++transientFailures >= 3) break;
  if (response && response.status !== 429 && !transient || attempt === 89) break;
  await new Promise((resolve, reject) => {
   const abort = () => { clearTimeout(timer); reject(new Error('Incidence clustering cancelled')); };
   const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 1000);
   if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
  });
 }
 if (!response?.headers.get('content-type')?.includes('application/json')) throw new Error('Bipartite Leiden service is unavailable. No pair-projection fallback was used.');
 const result = await response.json();
 if (!response.ok) throw new Error(result.error || 'Bipartite Leiden service is unavailable.');
 if (result.modelVersion !== HYPERGRAPH_MODEL_VERSION || Object.keys(result.memberships || {}).length !== network.articleIds.length || network.articleIds.some(id => !Number.isInteger(result.memberships?.[id]) || result.memberships[id] < 1)) throw new Error('Incomplete bipartite Leiden result');
 return {...result, networkModel: 'hypergraph', limitations: HYPERGRAPH_INCIDENCE};
}
