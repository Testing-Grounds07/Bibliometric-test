import {analysisErrorMessage} from './analysis-errors.mjs';
import {validateConnections, disparityBackbone, temporalNetwork} from './network-extensions.mjs';
import {partition, densityGrid} from './auto-cpm.mjs';
import {buildHyperedges} from './community-methods.mjs';
import {couplingHyperedges} from './coupling-hypergraph.mjs';
self.onmessage = event => {
 try {
  const {kind, graph, articles, options} = event.data;
  if (kind === 'validation') self.postMessage({result: validateConnections(graph, options.alpha)});
  else if (kind === 'backbone') self.postMessage({result: disparityBackbone(graph, options.alpha)});
  else if (kind === 'temporal' || kind === 'partition') {
   const next = kind === 'temporal' ? temporalNetwork(graph, articles, options.from, options.to) : graph;
   next.hyperedges = null; next.comparison = null; next.autoCPM = null;
   next.clustering = {algorithm: 'leiden'};
   if (next.networkModel === 'hypergraph') next.hyperedges = next.method === 'coupling' || next.canvasKind === 'coupling' ? couplingHyperedges(next) : buildHyperedges(next, next.bundles || []);
   const resolution = graph.resolution || densityGrid(next).density / 4 || .02;
   const result = partition(next, resolution);
   for (const node of next.nodes) node.cluster = result.memberships[node.id] || 0;
   next.resolution = resolution; next.clustering = {algorithm: 'leiden', label: 'Leiden CPM', ...result};
   next.stats = {...next.stats, nodes: next.nodes.length, edges: next.links.length, clusters: new Set(Object.values(result.memberships)).size, isolated_nodes: next.nodes.filter(node => !node.cluster).length};
   self.postMessage({result: next});
  } else throw new Error('Unknown network analysis');
 } catch (error) { self.postMessage({error: analysisErrorMessage(error)}); }
};
