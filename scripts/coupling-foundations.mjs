export function clusterFoundations(nodes, cluster) {
 const members = [...new Map(nodes.filter(node => Number(node.cluster) === Number(cluster) && Number(cluster) > 0).map(node => [node.id, node])).values()];
 const citations = new Map();
 for (const article of members) for (const reference of new Set(article.references || [])) {
  if (!citations.has(reference)) citations.set(reference, []);
  citations.get(reference).push(article.id);
 }
 const references = [...citations].filter(([, sources]) => sources.length >= 2).map(([id, sources]) => ({id, sources: sources.sort(), count: sources.length, share: sources.length / members.length}));
 references.sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
 return {cluster: Number(cluster), members: members.length, withReferences: members.filter(article => article.references?.length).length, references};
}
