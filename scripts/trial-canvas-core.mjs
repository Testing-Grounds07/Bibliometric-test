import {invalidateScientificOutputs} from './scientific-invalidation.mjs';

export function trialCanvasGraph(source, result, edges) {
 if (!result?.definition || !Array.isArray(edges)) throw new Error('A completed trial and its exact combinations are required.');
 const ids = new Set(source.nodes.map(node => node.id));
 for (const [id, cluster] of Object.entries(result.memberships)) {
  if (!ids.has(id) || !Number.isInteger(cluster) || cluster < 1) throw new Error('Invalid trial membership.');
 }
 const linked = new Set(edges.flatMap(edge => edge.members));
 if ([...linked].some(id => !ids.has(id))) throw new Error('Unknown combination member.');
 if (!result.localOnly && [...linked].some(id => !result.memberships[id])) throw new Error('Missing trial membership.');
 const next = structuredClone(source);
 next.nodes = next.nodes.map(node => ({...node, cluster: result.memberships[node.id] || 0}));
 const positions = new Map();
 for (const node of next.nodes) {
  const position = positions.get(node.cluster) || 0, angle = position * 2.399963229728653;
  node.x = Math.cos(angle) * Math.sqrt(position) * 14;
  node.y = Math.sin(angle) * Math.sqrt(position) * 14;
  positions.set(node.cluster, position + 1);
 }
 next.networkModel = 'hypergraph';
 next.hyperedges = structuredClone(edges);
 const {canvasEdges, audit, memberships, ...diagnostics} = result;
 next.trial = {result: structuredClone({...diagnostics, memberships})};
 next.clustering = {algorithm: 'trial', trialFamily: result.family, trialVersion: result.version, trialSettings: structuredClone(result.settings), diagnostics: structuredClone(diagnostics), method: result.definition.name, limitations: result.limitations};
 for (const key of ['reliability','reliabilityState','sourceReliability','settingsSearch','evidenceSensitivity','autoCPM','comparison','themeDescriptions','generatedDescriptions','themeError','analysisId','extensionFilter','extensionResults','temporal','drillConfig']) delete next[key];
 next.resolution = null;
 next.appliedSettings = {settings: {label: result.definition.name + (['spectral','aon','balanced'].includes(result.family) ? ' · k=' + result.settings.k : '')}};
 next.stats = {...next.stats, nodes: next.nodes.length, clusters: result.clusters, isolated_nodes: next.nodes.filter(node => !node.cluster).length};
 next.reliability = result.audit || null;
 return invalidateScientificOutputs(next);
}
