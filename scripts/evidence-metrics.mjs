export function connectionRoles(graph) {
 const nodes = new Map(graph.nodes.map(node => [node.id, node]));
 const roles = Object.fromEntries(graph.nodes.map(node => [node.id, {degree: 0, strength: 0, internalStrength: 0, externalStrength: 0, connections: {}}]));
 for (const edge of graph.links) {
  if (!(edge.strength > 0) || !nodes.has(edge.source) || !nodes.has(edge.target)) continue;
  for (const [id, other] of [[edge.source, edge.target], [edge.target, edge.source]]) {
   const role = roles[id], cluster = nodes.get(other).cluster || 0;
   role.degree++; role.strength += edge.strength;
   role.connections[cluster] = (role.connections[cluster] || 0) + edge.strength;
   if (cluster === nodes.get(id).cluster) role.internalStrength += edge.strength;
   else role.externalStrength += edge.strength;
  }
 }
 const groups = new Map();
 for (const node of graph.nodes) {
  if (!groups.has(node.cluster)) groups.set(node.cluster, []);
  groups.get(node.cluster).push(roles[node.id].internalStrength);
 }
 for (const node of graph.nodes) {
  const role = roles[node.id], values = groups.get(node.cluster), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  role.participation = role.strength ? Math.max(0, 1 - Object.values(role.connections).reduce((sum, value) => sum + (value / role.strength) ** 2, 0)) : null;
  role.externalShare = role.strength ? role.externalStrength / role.strength : null;
  role.withinClusterZ = deviation ? (role.internalStrength - mean) / deviation : null;
  role.connectedClusters = Object.keys(role.connections).map(Number).filter(cluster => cluster > 0 && cluster !== node.cluster);
  role.label = !role.degree ? 'No eligible connections' : role.connectedClusters.length >= 2 && role.participation >= .3 ? 'Cross-cluster connector' : role.externalStrength > 0 ? 'Some cross-cluster connections' : 'Within-cluster only';
  role.partitionAssessed = graph.clustering?.algorithm !== 'not_requested' && Number(node.cluster) > 0;
  if (!role.partitionAssessed) { role.participation = null; role.externalShare = null; role.withinClusterZ = null; role.internalStrength = null; role.externalStrength = null; role.connectedClusters = []; role.label = 'Community-relative role not assessed'; }
 }
 return roles;
}

export function sourcesForCluster(articles, graph, cluster) {
 if (cluster == null) return articles;
 const sources = new Set(graph.nodes.filter(node => node.cluster === cluster).flatMap(node => node.articles || []));
 return articles.filter(article => sources.has(article.id));
}

export function couplingPairs(articles, maximumPairs = Infinity) {
 const postings = new Map(), counts = new Map();
 for (const article of articles) {
  for (const reference of new Set(article.references || [])) {
   if (!postings.has(reference)) postings.set(reference, []);
   postings.get(reference).push(article.id);
  }
 }
 for (const [reference, sources] of postings) {
  for (let left = 0; left < sources.length; left++) for (let right = left + 1; right < sources.length; right++) {
   const pair = [sources[left], sources[right]].sort(), key = pair.join('|');
   if (!counts.has(key)) { if (counts.size >= maximumPairs) throw new Error('Coupling candidate universe exceeds its pair limit. Narrow the source scope; no partial network was used.'); counts.set(key, {source: pair[0], target: pair[1], references: []}); }
   counts.get(key).references.push(reference);
  }
 }
 return [...counts.values()];
}

export function couplingGraph(articles, pairs, minimumShared = 3, minimumCosine = .05, weights = null) {
 const count = references => references.reduce((sum, id) => sum + (weights ? weights[id] || 0 : 1), 0);
 const nodes = articles.map(article => ({...article, referenceCount: new Set(article.references || []).size, cluster: 0}));
 const lengths = new Map(nodes.map(node => [node.id, count([...new Set(node.references || [])])])), links = [];
 for (const pair of pairs) {
  const shared = count(pair.references), denominator = Math.sqrt(lengths.get(pair.source) * lengths.get(pair.target));
  if (!denominator || shared < minimumShared) continue;
  const strength = shared / denominator;
  if (strength >= minimumCosine) links.push({...pair, count: shared, strength});
 }
 return {nodes, links, method: 'coupling', minimumShared, minimumCosine, counting: 'full', construction: {counting:'full',normalization:'cosine'}, normalization: 'Shared distinct OpenAlex references / sqrt(available reference counts). All available references used; no citation-frequency cutoff.'};
}

export function clusterRecovery(original, sampled) {
 const base = new Map(), next = new Map();
 for (const [id, cluster] of Object.entries(original)) if (+cluster > 0) {
  if (!base.has(cluster)) base.set(cluster, new Set());
  base.get(cluster).add(id);
 }
 for (const [id, cluster] of Object.entries(sampled)) if (+cluster > 0) {
  if (!next.has(cluster)) next.set(cluster, new Set());
  next.get(cluster).add(id);
 }
 const results = {};
 for (const [cluster, members] of base) {
  let best = 0, retained = 0;
  for (const id of members) if (+sampled[id] > 0) retained++;
  for (const candidates of next.values()) {
   let overlap = 0;
   for (const id of members) if (candidates.has(id)) overlap++;
   best = Math.max(best, overlap / (members.size + candidates.size - overlap));
  }
  results[cluster] = {jaccard: best, retention: retained / members.size, size: members.size};
 }
 return results;
}

export function bootstrapWeights(ids, sample) {
 let seed = 20261016 + sample;
 const weights = {};
 for (let draw = 0; draw < ids.length; draw++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const id = ids[Math.floor(seed / 4294967296 * ids.length)];
  weights[id] = (weights[id] || 0) + 1;
 }
 return weights;
}

export function summarizeRecovery(samples) {
 const output = {}, quantile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right), offset = (sorted.length - 1) * fraction, index = Math.floor(offset);
  return sorted[index] + (sorted[Math.min(index + 1, sorted.length - 1)] - sorted[index]) * (offset - index);
 };
 for (const cluster of Object.keys(samples[0] || {})) {
  const records = samples.map(sample => sample[cluster]), values = records.map(record => record.jaccard);
  output[cluster] = {size: records[0].size, meanJaccard: values.reduce((sum, value) => sum + value, 0) / values.length, interval: [quantile(values, .1), quantile(values, .9)], meanRetention: records.reduce((sum, record) => sum + record.retention, 0) / records.length};
 }
 return output;
}
