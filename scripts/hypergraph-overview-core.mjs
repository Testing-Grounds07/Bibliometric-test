export function clusterDecks(graph, layers = 3) {
 if (!Number.isInteger(layers) || layers < 1 || layers > 8) throw new Error('Choose one to eight layers per cluster.');
 const nodes = new Map(graph.nodes.map(node => [node.id, node])), decks = new Map();
 for (const node of graph.nodes) if (node.cluster > 0) {
  if (!decks.has(node.cluster)) decks.set(node.cluster, {cluster: node.cluster, nodes: [], groups: [], eligible: 0});
  decks.get(node.cluster).nodes.push(node);
 }
 for (const edge of graph.hyperedges || []) {
  const members = [...new Set(edge.members)];
  if (members.length < 2 || !members.every(id => nodes.has(id) && nodes.get(id).cluster > 0)) continue;
  const counts = new Map();
  for (const id of members) { const cluster = nodes.get(id).cluster; counts.set(cluster, (counts.get(cluster) || 0) + 1); }
  for (const cluster of counts.keys()) {
   const deck = decks.get(cluster); deck.eligible++; deck.groups.push({...edge, members, crossing: counts.size > 1});
  }
 }
 for (const deck of decks.values()) {
  deck.groups.sort((left, right) => Number(right.members.length >= 3) - Number(left.members.length >= 3) || (right.articles?.length || 0) - (left.articles?.length || 0) || right.weight - left.weight || String(left.id || left.reference).localeCompare(String(right.id || right.reference)));
  deck.groups = deck.groups.slice(0, layers);
 }
 return [...decks.values()].sort((left, right) => right.nodes.length - left.nodes.length || left.cluster - right.cluster);
}

export function deckCoordinates(deck) {
 const ownIds = deck.nodes.map(node => node.id).sort(), foreignIds = [...new Set(deck.groups.flatMap(group => group.members))].filter(id => !ownIds.includes(id)).sort();
 const points = ownIds.map((id, position) => [id, {x: Math.cos(position * 2.399963) * Math.sqrt((position + .5) / ownIds.length) * 130, y: Math.sin(position * 2.399963) * Math.sqrt((position + .5) / ownIds.length) * 130}]);
 foreignIds.forEach((id, position) => points.push([id, {x: Math.cos(position / foreignIds.length * Math.PI * 2) * 170, y: Math.sin(position / foreignIds.length * Math.PI * 2) * 170}]));
 return Object.fromEntries(points);
}
