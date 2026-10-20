import {interpretRecovery} from './evidence-guidance.mjs';

export function hasGeneratedLabel(description) {
 return !!description?.generated && ['shared-theme', 'mixed-themes'].includes(description.generated.status) && description.heading === description.generated.heading;
}

export function clusterReliability(graph, cluster) {
 if(graph.collaboration)return {status:'unknown',label:'No cluster stability rating',dash:null,title:'Collaboration construction sensitivity is not per-cluster stability or thematic validation. Use Collaboration maps for counting/team/affiliation and audited identity alternatives.'};
 if(graph.semantic)return {status:'unknown',label:'No cluster stability rating',dash:null,title:'Citation resampling is not applicable to semantic clusters. Use Semantic maps for text/threshold sensitivity; this does not provide a per-cluster stability rating.'};
 if (!(Number(cluster) > 0)) return {status: 'unlinked', label: 'Not assessed', dash: null, title: 'Unlinked articles are not assessed as a cluster.'};
 const algorithm = ['infomap', 'hypergraph', 'sbm', 'trial'].includes(graph.clustering?.algorithm) ? graph.clustering.algorithm : 'leiden';
 const result = graph.reliability?.algorithm === algorithm ? graph.reliability : null;
 if (['running', 'pending'].includes(graph.reliabilityState)) return {status: 'checking', label: 'Checking', dash: null, title: 'Cluster stability is being checked for the selected method. No completed rating is shown yet.'};
 const outcome = interpretRecovery(result?.clusters?.[cluster], Object.keys(result?.clusters || {}).length);
 if (outcome.status === 'unknown') return {status: 'unknown', label: 'Not checked', dash: null, title: 'No completed cluster stability rating for this map. Open Reliability to run or retry a check.'};
 const styles = {holding: {label: 'Holds together', dash: 'none'}, sensitive: {label: 'Sensitive', dash: '4 3'}, changing: {label: 'Changes', dash: '1 3'}};
 return {...outcome, ...styles[outcome.status], preliminary: !!result.preliminary, title: `${result.preliminary ? 'Preliminary · ' : ''}${outcome.heading} · ${result.samples} resamples. ${outcome.explanation} ${outcome.caution || ''} This is cluster-level structural stability, not article quality or validation of the AI label.`};
}

if (typeof window !== 'undefined') window.ATLAS_INDICATORS = {hasGeneratedLabel, clusterReliability};
