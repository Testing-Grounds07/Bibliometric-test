import createGraph from 'ngraph.graph';
import {detectClusters} from 'ngraph.leiden';

export function cluster(graph, resolution) {
  const network = createGraph();
  const connected = new Set(graph.links.flatMap(edge => [edge.source, edge.target]));
  for (const node of graph.nodes) if (connected.has(node.id)) network.addNode(node.id);
  const scale = graph.links.reduce((sum, edge) => sum + edge.strength, 0) / graph.links.length;
  for (const edge of graph.links) network.addLink(edge.source, edge.target, {weight: edge.strength / scale});
  let best;
  for (let seed = 42; seed < 52; seed++) {
    const result = detectClusters(network, {quality: 'cpm', resolution, randomSeed: seed, linkWeight: link => link.data.weight});
    if (!best || result.quality() > best.quality) best = {result, quality: result.quality(), seed};
  }
  const groups = [...best.result.getCommunities().values()].sort((first, second) => second.length - first.length);
  const memberships = new Map(groups.flatMap((members, index) => members.map(id => [id, index + 1])));
  for (const node of graph.nodes) {
    node.cluster = memberships.get(node.id) || 0;
    node.degree = graph.links.filter(edge => edge.source === node.id || edge.target === node.id).length;
  }
  graph.clustering = {algorithm: 'leiden', objective: 'cpm', resolution, weight_scale: scale, seed: 42, restarts: 10, selected_seed: best.seed, quality: best.quality, communities: groups.length};
  graph.stats = {nodes: graph.nodes.length, edges: graph.links.length, clusters: groups.length, isolated_nodes: graph.nodes.filter(node => !node.degree).length};
}
