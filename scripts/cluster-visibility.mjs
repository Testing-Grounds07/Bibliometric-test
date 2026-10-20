export function clusterSizeFilter(nodes, value = 1) {
 const numeric = Number(value), minimum = Number.isFinite(numeric) ? Math.max(1, Math.ceil(numeric)) : 1;
 const counts = new Map();
 for (const node of nodes) { const cluster = Number(node.cluster); counts.set(cluster, (counts.get(cluster) || 0) + 1); }
 const hiddenClusters = new Set([...counts].filter(([cluster, count]) => cluster > 0 && count < minimum).map(([cluster]) => cluster));
 return {minimum, counts, hiddenClusters};
}

export function hasObservedLinks(node,edges=[]){
 return Number.isFinite(node.degree)?node.degree>0:edges.some(edge=>edge.source===node.id||edge.target===node.id);
}
