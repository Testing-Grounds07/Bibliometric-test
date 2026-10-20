export const ROLE_VERSION = 'network-roles-v1';

export function roleNetwork(graph) {
 const ids = graph.nodes.map(node => node.id);
 if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id)) throw new Error('Roles require unique entity identifiers.');
 const positions = new Map(ids.map((id, position) => [id, position]));
 const directed = graph.directed === true || graph.method === 'direct_citation' || graph.canvasKind === 'historiography';
 const edges = new Map();
 for (const link of graph.links || []) {
  if (!positions.has(link.source) || !positions.has(link.target)) throw new Error('A role connection refers to an unknown entity.');
  if (link.source === link.target) continue;
  const source = positions.get(link.source), target = positions.get(link.target), strength = directed ? 1 : Number(link.strength);
  if (!Number.isFinite(strength) || strength < 0) throw new Error('Role weights must be finite and nonnegative.');
  if (!strength) continue;
  const pair = directed || source < target ? [source, target] : [target, source], key = pair.join(':');
  if (edges.has(key)) throw new Error('Duplicate analytical connections must be consolidated before role analysis.');
  edges.set(key, {source: pair[0], target: pair[1], strength});
 }
 const adjacent = ids.map(() => []), weak = ids.map(() => new Set());
 for (const edge of edges.values()) {
  adjacent[edge.source].push({target: edge.target, weight: edge.strength});
  if (!directed) adjacent[edge.target].push({target: edge.source, weight: edge.strength});
  weak[edge.source].add(edge.target); weak[edge.target].add(edge.source);
 }
 return {ids, directed, adjacent, weak, edges: [...edges.values()]};
}

export function coreNumbers(weak) {
 const remaining = new Set(weak.map((_, position) => position)), degrees = weak.map(neighbors => neighbors.size), core = weak.map(() => 0);
 let level = 0;
 while (remaining.size) {
  let chosen = remaining.values().next().value;
  for (const candidate of remaining) if (degrees[candidate] < degrees[chosen]) chosen = candidate;
  level = Math.max(level, degrees[chosen]); core[chosen] = level; remaining.delete(chosen);
  for (const neighbor of weak[chosen]) if (remaining.has(neighbor)) degrees[neighbor]--;
 }
 return core;
}

export function directedPageRank(network, options = {}) {
 if (!network.directed) throw new Error('PageRank is only offered for direct citation networks.');
 const damping = options.damping ?? .85, tolerance = options.tolerance ?? 1e-10, maxIterations = options.maxIterations ?? 1000;
 if (!(damping > 0 && damping < 1) || !(tolerance > 0) || !Number.isInteger(maxIterations) || maxIterations < 1) throw new Error('Invalid PageRank settings.');
 const count = network.ids.length;
 if (!count) return {values: [], converged: true, iterations: 0, residual: 0, damping};
 let values = Array(count).fill(1 / count), residual = Infinity;
 for (let iteration = 1; iteration <= maxIterations; iteration++) {
  const dangling = values.reduce((sum, value, position) => sum + (network.adjacent[position].length ? 0 : value), 0);
  const next = Array(count).fill((1 - damping + damping * dangling) / count);
  network.adjacent.forEach((neighbors, source) => { for (const edge of neighbors) next[edge.target] += damping * values[source] / neighbors.length; });
  residual = next.reduce((sum, value, position) => sum + Math.abs(value - values[position]), 0); values = next;
  if (residual <= tolerance) return {values, converged: true, iterations: iteration, residual, damping};
 }
 return {values, converged: false, iterations: maxIterations, residual, damping};
}

export function betweenness(network, distance = 'inverse-strength', maximumOperations = 30000000) {
 if (!['inverse-strength', 'unweighted'].includes(distance)) throw new Error('Choose inverse-strength or unweighted path distance.');
 if (network.directed && distance !== 'unweighted') throw new Error('Direct citations use one step per citation, not inverse similarity.');
 const size = network.ids.length, centrality = Array(size).fill(0);
 let operations = 0;
 const push = (heap, item) => {
  heap.push(item); let position = heap.length - 1;
  while (position > 0) { const parent = Math.floor((position - 1) / 2); if (heap[parent].distance <= item.distance) break; heap[position] = heap[parent]; position = parent; }
  heap[position] = item;
 };
 const pop = heap => {
  const first = heap[0], last = heap.pop();
  if (heap.length) { let position = 0; while (position * 2 + 1 < heap.length) { let child = position * 2 + 1; if (child + 1 < heap.length && heap[child + 1].distance < heap[child].distance) child++; if (heap[child].distance >= last.distance) break; heap[position] = heap[child]; position = child; } heap[position] = last; }
  return first;
 };
 for (let source = 0; source < size; source++) {
  const lengths = Array(size).fill(Infinity), paths = Array(size).fill(0), predecessors = Array.from({length: size}, () => []), order = [], visited = new Set();
  lengths[source] = 0; paths[source] = 1;
  const heap = [{target: source, distance: 0}];
  while (heap.length) {
   const nearest = pop(heap).target;
   if (visited.has(nearest)) continue;
   visited.add(nearest); order.push(nearest);
   for (const edge of network.adjacent[nearest]) {
    if (++operations > maximumOperations) throw new Error('Exact path analysis exceeded its calculation budget. Narrow the analytical scope; no partial scores were published.');
    const candidate = lengths[nearest] + (distance === 'unweighted' ? 1 : 1 / edge.weight), tolerance = 1e-12 * Math.max(Number.MIN_VALUE, Math.abs(candidate), Number.isFinite(lengths[edge.target]) ? lengths[edge.target] : 0);
    if (!Number.isFinite(candidate)) throw new Error('Path weights are outside the supported numeric range.');
    if (candidate < lengths[edge.target] - tolerance) { lengths[edge.target] = candidate; paths[edge.target] = paths[nearest]; predecessors[edge.target] = [nearest]; push(heap, {target: edge.target, distance: candidate}); }
    else if (!visited.has(edge.target) && Math.abs(candidate - lengths[edge.target]) <= tolerance) { paths[edge.target] += paths[nearest]; predecessors[edge.target].push(nearest); }
    if (!Number.isFinite(paths[edge.target])) throw new Error('Too many equal shortest paths for exact numeric brokerage; no partial scores published.');
   }
  }
  const dependency = Array(size).fill(0);
  for (const target of order.reverse()) {
   for (const previous of predecessors[target]) dependency[previous] += paths[previous] / paths[target] * (1 + dependency[target]);
   if (target !== source) centrality[target] += dependency[target];
  }
 }
 const denominator = size > 2 ? (size - 1) * (size - 2) : 1;
 return {values: centrality.map(value => value / denominator), distance, normalized: true, operations};
}

export function analyzeRoles(graph, options = {}) {
 const network = roleNetwork(graph);
 if (network.ids.length > 1500 || network.edges.length > 100000) throw new Error('Role analysis supports at most 1,500 articles and 100,000 connections. Narrow the analytical scope.');
 const cores = coreNumbers(network.weak), roles = Object.fromEntries(network.ids.map((id, position) => [id, {degree: network.weak[position].size, strength: 0, internalStrength: 0, externalStrength: 0, incoming: 0, outgoing: 0, core: cores[position], connections: {}}]));
 const nodes = new Map(graph.nodes.map(node => [node.id, node]));
 for (const edge of network.edges) {
  const source = network.ids[edge.source], target = network.ids[edge.target];
  if (network.directed) { roles[source].outgoing++; roles[target].incoming++; }
  for (const [id, other] of [[source, target], [target, source]]) {
   const role = roles[id], cluster = Number(nodes.get(other).cluster) || 0;
   role.strength += edge.strength; role.connections[cluster] = (role.connections[cluster] || 0) + edge.strength;
   if (cluster > 0 && cluster === Number(nodes.get(id).cluster)) role.internalStrength += edge.strength; else role.externalStrength += edge.strength;
  }
 }
 const groups = new Map();
 for (const node of graph.nodes) { const cluster = Number(node.cluster) || 0; if (!groups.has(cluster)) groups.set(cluster, []); groups.get(cluster).push(roles[node.id].internalStrength); }
 for (const node of graph.nodes) {
  const role = roles[node.id], cluster = Number(node.cluster) || 0, values = groups.get(cluster), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  role.withinClusterZ = cluster > 0 && deviation > 0 ? (role.internalStrength - mean) / deviation : null;
  role.participation = cluster > 0 && role.strength ? Math.max(0, 1 - Object.values(role.connections).reduce((sum, value) => sum + (value / role.strength) ** 2, 0)) : null;
  role.externalShare = role.strength ? role.externalStrength / role.strength : null;
  role.connectedClusters = Object.keys(role.connections).map(Number).filter(other => other > 0 && other !== cluster);
  role.label = !role.degree ? 'No eligible connections' : network.directed ? 'Citation-network position' : cluster <= 0 ? 'Outside assigned communities' : role.withinClusterZ >= 2 && role.participation < .3 ? 'Local hub' : role.connectedClusters.length >= 2 && role.participation >= .3 ? 'Cross-community connector' : role.externalStrength ? 'Some cross-community connections' : 'Within-community connections';
 }
 let paths = null, pageRank = null;
 if (options.paths) { paths = betweenness(network, network.directed ? 'unweighted' : options.distance || 'inverse-strength', options.maximumOperations); network.ids.forEach((id, position) => { roles[id].betweenness = paths.values[position]; }); }
 if (network.directed) { pageRank = directedPageRank(network, options.pageRank); network.ids.forEach((id, position) => { roles[id].pageRank = pageRank.values[position]; }); }
 return {version: ROLE_VERSION, directed: network.directed, scope: 'Full supplied analytical network, before display filtering. Citation history may supply a capped analytical result; this is not catalogue-wide prominence.', roles, paths, pageRank, limitations: 'Roles describe connectivity, not quality, relevance, agreement or causal influence. Core numbers ignore direction. Community-role labels are descriptive heuristics, not validated classes. Hypergraph views use pair connections, not whole-hyperedge roles. Inverse-strength distances assume stronger similarities are shorter paths; shortest paths are not observed knowledge-transfer routes.'};
}
