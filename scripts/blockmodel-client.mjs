import {canonicalMemberships} from './community-methods.mjs';

export async function fitBlockModel(graph, signal, starts = 3) {
 const edges = graph.links.filter(edge => edge.strength > 0).map(edge => [edge.source, edge.target]);
 const nodes = [...new Set(edges.flat())].sort();
 if (!nodes.length) return {algorithm: 'sbm', label: 'Nested block model', memberships: {}, hierarchy: [], selectedLevel: 0, trials: 0, objective: 'No eligible topology to fit', limitations: 'No eligible connections.'};
 let response;
 for (let attempt = 0; attempt < 4; attempt++) {
  response = await fetch('analysis-api/sbm', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({nodes, edges, starts}), signal});
  if (response.status !== 429 || attempt === 3) break;
  await new Promise((resolve, reject) => {
   const abort = () => { clearTimeout(timer); reject(new Error('Block-model fit cancelled')); };
   const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 1500);
   if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
  });
 }
 if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Block-model service is unavailable. The map has not changed.');
 const result = await response.json();
 if (!response.ok) throw new Error(result.error || 'Block-model service is unavailable');
 if (result.algorithm !== 'sbm' || !Array.isArray(result.hierarchy) || nodes.some(id => !Number.isInteger(result.memberships?.[id]))) throw new Error('Incomplete block-model result');
 result.memberships = canonicalMemberships(result.memberships);
 for (const level of result.hierarchy) level.memberships = canonicalMemberships(level.memberships);
 return result;
}
