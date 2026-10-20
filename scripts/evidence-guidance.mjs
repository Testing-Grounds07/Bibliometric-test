export const RELIABILITY_RULES = 'Exploratory reading guide v1: mostly holds together requires mean recovery ≥0.75, 10th percentile ≥0.60 and retention ≥0.80; changes substantially means mean recovery <0.50 or retention <0.60. Other results are sensitive. Groups of fewer than four members and single-group partitions need extra caution. These are heuristics, not validated confidence levels.';

export function interpretRecovery(record, clusterCount = 2) {
 if (!record || ![record.meanJaccard, record.meanRetention, record.interval?.[0]].every(Number.isFinite)) return {status: 'unknown', heading: 'Not enough evidence yet', explanation: 'Run the reliability check before judging how well this group holds together.'};
 const fragile = record.meanJaccard < .5 || record.meanRetention < .6;
 const strong = record.meanJaccard >= .75 && record.interval[0] >= .6 && record.meanRetention >= .8;
 const status = fragile ? 'changing' : strong ? 'holding' : 'sensitive';
 const heading = fragile ? 'Changes substantially' : strong ? 'Mostly holds together' : 'Sensitive to the evidence';
 const explanation = record.meanRetention < .6 ? 'Many articles lose their eligible connections when the evidence is resampled. Treat this grouping cautiously.' : fragile ? 'Most articles remain connected, but they often regroup, split or merge. Do not treat this boundary as settled.' : strong ? 'The same group generally reappears when the citation evidence is resampled. It is a useful starting point for reading, not a confirmed theme.' : 'Parts of this group reappear, but its boundaries shift. Read it as an approximate grouping rather than a firm category.';
 const caution = record.size < 4 ? 'Very small group: staying intact is a weak test of meaningful structure.' : clusterCount === 1 ? 'Only one group: this cannot establish a meaningful subdivision.' : '';
 return {status, heading, explanation, caution};
}

export function recoveryOverview(clusters) {
 const entries = Object.values(clusters), counts = {holding: 0, sensitive: 0, changing: 0, unknown: 0};
 let members = 0, holdingMembers = 0;
 for (const record of entries) {
  const outcome = interpretRecovery(record, entries.length); counts[outcome.status]++;
  members += record.size; if (outcome.status === 'holding') holdingMembers += record.size;
 }
 return {counts, members, holdingMembers, heading: !entries.length ? 'No linked groups to assess' : holdingMembers >= .75 * members ? 'Most articles are in groups that hold together' : counts.changing ? 'Treat this map as exploratory' : 'The group boundaries are approximate', explanation: !entries.length ? 'Try less restrictive connection settings; no reliability conclusion is available.' : `Groups that mostly hold together: ${counts.holding}. Sensitive groups: ${counts.sensitive}. Groups that change substantially: ${counts.changing}. ${holdingMembers} of ${members} clustered articles are in groups that mostly hold together. Unlinked articles are not assessed. Small stable groups do not establish stable boundaries for the larger groups.`};
}

export function recoveryMetrics(clusters, totalSources) {
 const records = Object.values(clusters), linked = records.reduce((sum, record) => sum + record.size, 0);
 return {coverage: linked / Math.max(1, totalSources), recovery: records.reduce((sum, record) => sum + record.size * record.meanJaccard, 0) / Math.max(1, linked), retention: records.reduce((sum, record) => sum + record.size * record.meanRetention, 0) / Math.max(1, linked)};
}

export function assessCouplingCandidate(candidate) {
 const reasons = [];
 if (candidate.coverage < .6) reasons.push('connects fewer than 60% of sources');
 if (candidate.recovery < .7) reasons.push('group recovery is below 70%');
 if (candidate.retention < .8) reasons.push('resampled connection retention is below 80%');
 if (candidate.fragmentation.introducedTinyNodeFraction > .2) reasons.push('too many articles fall into newly split groups of 1–3');
 if (candidate.clusters <= candidate.fragmentation.components) reasons.push('groups only reproduce disconnected components');
 if (candidate.largestShare > .9) reasons.push('one group contains over 90% of linked sources');
 return {...candidate, score: candidate.coverage * candidate.recovery - .2 * candidate.fragmentation.introducedTinyNodeFraction, admissible: reasons.length === 0, reasons};
}

export function chooseCouplingCandidate(candidates) {
 const eligible = candidates.filter(candidate => candidate.admissible), pool = eligible.length ? eligible : candidates.filter(candidate => candidate.edges > 0);
 if (!pool.length) return null;
 const best = Math.max(...pool.map(candidate => candidate.score));
 return [...pool.filter(candidate => candidate.score >= best - .03)].sort((left, right) => left.clusters - right.clusters || right.coverage - left.coverage || left.resolution - right.resolution)[0];
}
