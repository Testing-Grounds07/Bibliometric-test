import {clusterFoundations} from './coupling-foundations.mjs';

export const COUPLING_METHOD = {
 title: 'Bibliographic coupling', node: 'Source article', plural: 'source articles', group: 'Coupling cluster', size: 'Available references', edge: 'Shared references',
 question: 'Which source articles share a research foundation?',
 explanation: 'Articles are connected when their reference lists overlap. Clusters group source articles—not the cited works in the co-citation map.',
 weight: 'Clustering uses cosine similarity: shared references divided by the geometric mean of the two reference-list lengths. Line intensity shows shared-reference count; strongest-line filtering uses cosine similarity.',
 caveat: 'Available reference lists may be incomplete. Shared references and cluster membership do not establish relevance, agreement, or research quality.'
};

export function couplingNodeRadius(referenceCount, scale, zoom) {
 return Math.max(.7, Math.min(22, (4 + Math.sqrt(Math.max(0, referenceCount)) * scale / 12) * zoom));
}

export function couplingCanvasGraph(source, scopeLabel = 'All conservative source articles') {
 const graph = structuredClone(source || {nodes: [], links: [], minimumShared: 3, minimumCosine: .05, resolution: null});
 const degrees = new Map(graph.nodes.map(node => [node.id, 0]));
 for (const edge of graph.links) for (const id of [edge.source, edge.target]) degrees.set(id, (degrees.get(id) || 0) + 1);
 graph.nodes = graph.nodes.map((node, position) => ({...node, label: node.title || node.id, key: node.id,
  citations: new Set(node.references || []).size, degree: degrees.get(node.id), articles: [], variants: node.variants || [], rules: node.rules || [],
  x: Math.cos(position * 2.399963229728653) * 40 * Math.sqrt(position + 1), y: Math.sin(position * 2.399963229728653) * 40 * Math.sqrt(position + 1)}));
 const foundations = new Map([...new Set(graph.nodes.map(node => node.cluster).filter(cluster => cluster > 0))].map(cluster => [cluster, clusterFoundations(graph.nodes, cluster)]));
 for (const node of graph.nodes) {
  const group = foundations.get(node.cluster), references = new Set(node.references || []), foundation = group?.references.find(reference => references.has(reference.id));
  node.foundation = foundation ? {id: foundation.id, count: foundation.count, share: foundation.share, members: group.members} : null;
 }
 return {...graph, canvasKind: 'coupling', method: 'coupling', scopeLabel, order: 2, minimumSupport: graph.minimumShared,
  clustering: {...graph.clustering, label: 'Coupling · ' + (graph.clustering?.label || 'Leiden CPM')},
  stats: {nodes: graph.nodes.length, edges: graph.links.length, clusters: new Set(graph.nodes.map(node => node.cluster).filter(cluster => cluster > 0)).size, isolated_nodes: graph.nodes.filter(node => !node.degree).length}};
}
