import {fragmentation} from './auto-cpm.mjs';

export function retainCouplingBaseline(graph, settings) {
 if (!['leiden', 'Leiden CPM'].includes(graph?.clustering?.algorithm) || graph.networkModel === 'hypergraph' || graph.temporalSelection) return null;
 return {graph: {...graph, nodes: graph.nodes.map(node => ({...node}))}, settings: {...settings}};
}

export function reuseCouplingBaseline(baseline, settings) {
 if (!baseline || ['minimumShared', 'minimumCosine', 'resolution'].some(key => (baseline.settings[key] ?? null) !== (settings[key] ?? null))) return null;
 return {...baseline.graph, nodes: baseline.graph.nodes.map(node => ({...node}))};
}

export function completeCouplingDiagnostics(graph){
 const memberships=Object.fromEntries(graph.nodes.filter(node=>node.cluster>0).map(node=>[node.id,node.cluster]));
 return {...graph,clustering:{...graph.clustering,clusters:new Set(Object.values(memberships)).size},fragmentation:graph.temporal||!graph.fragmentation?fragmentation(graph,memberships):graph.fragmentation};
}
