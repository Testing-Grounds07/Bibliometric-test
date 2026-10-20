import {incidenceEvidence, projectIncidence} from './construction-audit.mjs';
import {bootstrapWeights} from './evidence-metrics.mjs';
import {analyzeRoles} from './network-roles.mjs';

export function roleSensitivity(graph, options = {}, progress = () => {}) {
 const samples = options.samples ?? 10;
 if (![10, 50].includes(samples)) throw new Error('Choose 10 or 50 role resamples.');
 const evidence = incidenceEvidence(graph), ids = evidence.rows.map(row => row.id), ranks = Object.fromEntries(evidence.ids.map(id => [id, {topTen: 0, meanPercentile: 0}]));
 const minimumSupport = graph.minimumShared || graph.minimumSupport || 1, normalization = graph.construction?.normalization || (evidence.coupling ? 'cosine' : 'association'), counting = graph.construction?.counting || 'full';
 const compared = ['raw', 'cosine', 'jaccard', 'association'].includes(normalization) ? normalization : null;
 if (!compared) throw new Error('The original normalization is not reproducible for role resampling.');
 for (let sample = 0; sample < samples; sample++) {
  progress('Role sensitivity ' + (sample + 1) + '/' + samples);
  const weights = bootstrapWeights(ids, sample + 4000), projection = projectIncidence(evidence, {normalization: compared, counting, minimumSupport, rowWeights: weights});
  if(evidence.coupling)projection.links=projection.links.filter(edge=>edge.strength>=(graph.minimumCosine||0));
  const roles = analyzeRoles({...graph, links: projection.links}).roles;
  const ordered = graph.nodes.map(node => ({id: node.id, score: roles[node.id].externalStrength})).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  for (const item of ordered) {
   const greater = ordered.filter(other => other.score > item.score).length, equal = ordered.filter(other => other.score === item.score).length, midrank = greater + (equal + 1) / 2;
   const topFraction = item.score > 0 ? Math.max(0, Math.min(equal, 10 - greater)) / equal : 0;
   ranks[item.id].topTen += topFraction / samples;
   ranks[item.id].meanPercentile += (ordered.length > 1 ? 1 - (midrank - 1) / (ordered.length - 1) : 1) / samples;
  }
 }
 return {version: 'role-sensitivity-v1', samples, preliminary: samples < 50, metric: 'External connection weight with original memberships held fixed', normalization: compared, counting, minimumSupport, minimumCosine: evidence.coupling ? graph.minimumCosine || 0 : null, rawSupport: evidence.coupling ? 'Distinct shared references present at least once; multiplicity affects weight only.' : 'Distinct citing source articles present at least once; multiplicity affects weight only.', ranks, limitation: 'Conditional structural rank sensitivity, not confidence or substantive bridge validation. Source/reference incidence events are resampled; pair evidence and thresholds, including the coupling cosine minimum, are rebuilt, but communities are held fixed. Raw support counts distinct retained event IDs, never fractional weight or bootstrap multiplicity. Ties share top-ten credit; all-zero scores receive none. PageRank and whole-hyperedge roles are not assessed.'};
}
