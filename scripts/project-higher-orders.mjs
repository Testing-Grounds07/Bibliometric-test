import {densityGrid, partition} from './auto-cpm.mjs';
import {invalidateScientificOutputs} from './scientific-invalidation.mjs';

export function mineProjectBundles(nodes, minimumSupport, options = {}) {
 const started = Date.now(), timeout = options.timeout ?? 180000, limit = options.limit ?? 50000;
 const articles = [...new Set(nodes.flatMap(node => node.articles))].sort(), positions = new Map(articles.map((id, index) => [id, index]));
 const ordered = [...nodes].sort((left, right) => right.articles.length - left.articles.length || left.id.localeCompare(right.id));
 const masks = ordered.map(node => [...new Set(node.articles)].reduce((mask, id) => mask | 1n << BigInt(positions.get(id)), 0n));
 const count = value => { let total = 0; while (value) { value &= value - 1n; total++; } return total; };
 const bundles = []; let visits = 0;
 const add = (closure, mask) => {
  if (closure.size < 3) return;
  if (bundles.length >= limit) throw new Error('Higher-order mining exceeded the exact-bundle limit. Raise the reference or joint-support minimum; no partial mining result was published.');
  bundles.push({id: 'project-bundle-' + (bundles.length + 1), members: [...closure].map(position => ordered[position].id).sort(), articles: articles.filter((id, index) => mask & 1n << BigInt(index))});
 };
 const visit = (closed, mask, start) => {
  if (Date.now() - started > timeout) throw new Error('Higher-order mining reached its time limit. Raise the minimums and rerun; no partial result was published.');
  if (++visits % 256 === 0) options.progress?.({visits, bundles: bundles.length});
  for (let position = start; position < ordered.length; position++) {
   if (closed.has(position)) continue;
   const intersection = mask & masks[position];
   if (count(intersection) < minimumSupport) continue;
   const closure = new Set();
   for (let candidate = 0; candidate < masks.length; candidate++) if ((intersection & masks[candidate]) === intersection) closure.add(candidate);
   if ([...closure].some(candidate => candidate < position && !closed.has(candidate))) continue;
   add(closure, intersection); visit(closure, intersection, position + 1);
  }
 };
 const universal = (1n << BigInt(articles.length)) - 1n, root = new Set(masks.flatMap((mask, position) => mask === universal ? [position] : []));
 if (articles.length >= minimumSupport) { add(root, universal); visit(root, universal, 0); }
 return {version: 1, complete: true, minimumSupport, referenceIds: nodes.map(node => node.id).sort(), maximumOrder: Math.max(2, ...bundles.map(bundle => bundle.members.length)), bundles};
}

export function projectOrderGraph(base, artifact, options = {}) {
 if (!artifact.complete || artifact.minimumSupport !== base.minimumSupport || JSON.stringify(artifact.referenceIds) !== JSON.stringify(base.nodes.map(node => node.id).sort())) throw new Error('Higher-order evidence does not match this reference scope and support setting. Regenerate the analysis.');
 const order = options.order === 'all' ? 'all' : Number(options.order ?? 2), cap = Number(options.maximumOrder ?? artifact.maximumOrder);
 if (order !== 'all' && (!Number.isInteger(order) || order < 2 || order > artifact.maximumOrder) || !Number.isInteger(cap) || cap < 2 || cap > artifact.maximumOrder) throw new Error('Choose an available connection order.');
 const graph = structuredClone(base), nodes = new Map(base.nodes.map(node => [node.id, node])), keyFor = edge => JSON.stringify([edge.source, edge.target].sort()), originals = new Map(base.links.map(edge => [keyFor(edge), edge])), pairs = new Map(base.links.map(edge => [keyFor(edge), {...edge, articles: new Set(), bundleIds: [], maximumOrderByArticle: Object.fromEntries(edge.articles.map(id => [id, 2]))}]));
 for (const bundle of artifact.bundles) {
  if (order !== 'all' && bundle.members.length < order) continue;
  for (let left = 0; left < bundle.members.length; left++) for (let right = left + 1; right < bundle.members.length; right++) {
   const edge = pairs.get(JSON.stringify([bundle.members[left], bundle.members[right]].sort()));
   if (!edge) continue;
   edge.bundleIds.push(bundle.id);
   for (const id of bundle.articles) { edge.articles.add(id); edge.maximumOrderByArticle[id] = Math.max(edge.maximumOrderByArticle[id] || 2, Math.min(bundle.members.length, cap)); }
  }
 }
 graph.order = order; graph.maximumOrder = cap; graph.bundles = artifact.bundles; graph.higherOrderArtifact = {complete: true, maximumOrder: artifact.maximumOrder, generatedAt: artifact.generatedAt};
 graph.links = [...pairs.values()].flatMap(edge => {
  const original = originals.get(keyFor(edge));
  if (order === 2) return [{...original, bundleIds: edge.bundleIds}];
  if (order !== 'all') return edge.articles.size ? [{source: edge.source, target: edge.target, articles: [...edge.articles].sort(), count: edge.articles.size, strength: edge.articles.size / (nodes.get(edge.source).citations * nodes.get(edge.target).citations), bundleIds: edge.bundleIds}] : [];
  const maximums = Object.values(edge.maximumOrderByArticle), combinedScore = maximums.reduce((sum, value) => sum + 1 + Math.log2(value - 1), 0);
  return [{...original, bundleIds: edge.bundleIds, combinedScore, higherOrderBonus: combinedScore - original.count, maximumOrderByArticle: edge.maximumOrderByArticle, maximumSupportedOrder: Math.max(2, ...maximums), orderProfile: Array.from({length: cap - 1}, (_, offset) => ({order: offset + 2, support: maximums.filter(value => value >= offset + 2).length})), strength: combinedScore / (nodes.get(edge.source).citations * nodes.get(edge.target).citations)}];
 });
 const degrees = new Map(base.nodes.map(node => [node.id, 0])); for (const edge of graph.links) for (const id of [edge.source, edge.target]) degrees.set(id, degrees.get(id) + 1);
 if (order !== 'all' && order > 2) graph.nodes = graph.nodes.filter(node => degrees.get(node.id));
 graph.excludedByOrder = base.nodes.length - graph.nodes.length;
 graph.resolution = options.resolution ? Number(options.resolution) : Math.max(.000001, densityGrid(graph).density / 4);
 const result = partition(graph, graph.resolution);
 for (const node of graph.nodes) { node.degree = degrees.get(node.id); node.cluster = result.memberships[node.id] || 0; }
 graph.clustering = {...graph.clustering, resolution: graph.resolution, quality: result.quality};
 graph.stats = {nodes: graph.nodes.length, edges: graph.links.length, clusters: result.clusters, isolated_nodes: graph.nodes.filter(node => !node.degree).length};
 graph.metric = order === 'all' ? {definition: 'Each distinct co-citing source contributes 1 + log₂(K − 1), using its largest supported bundle containing the pair, capped at the selected maximum order.', maximumIncludedOrder: cap} : undefined;
 graph.counting = order === 'all' ? 'Distinct-source maximum-order logarithmic bonus; experimental combined metric' : 'full';
 graph.appliedSettings = {settings: {label: (order === 'all' ? 'Combined 2–' + cap : order + '-way') + ' · CPM ' + Number(graph.resolution.toPrecision(4))}};
 return invalidateScientificOutputs(graph);
}
