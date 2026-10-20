import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {cluster} from './cocitation-clustering.mjs';
import {combineOrderEvidence} from './combined-cocitation-metric.mjs';
import {Neo4jStore} from '../neo4j-store.mjs';

const atlas = 'public/conservative-atlas';
const data = JSON.parse((await readFile(`${atlas}/data.js`, 'utf8')).slice('window.ATLAS_DATA='.length).trim().replace(/;$/, ''));
const identity = JSON.parse(await readFile('.trials/adaptive-leadership-full/summary.json', 'utf8'));
const graphs = Object.fromEntries(Object.entries(data.graphs).filter(([, graph]) => graph.order !== 'all'));
const pairKey = edge => [edge.source, edge.target].sort().join('|');
const metric = {
  id: 'log_order_support_v1', label: 'Combined connection score', experimental: true,
  formula: 'S(i,j) = sum over distinct co-citing source articles a of [1 + log2(K(i,j,a) - 1)]',
  definition: 'K is the largest qualifying jointly cited bundle containing the pair and supported by this article; K=2 for pair-only evidence. Qualifying bundles have at least five distinct supporting articles. Only one largest-order value is used per article and pair, regardless of the number of overlapping bundles.',
  normalization: 'S divided by the product of the two original reference citing-article counts; then mean-edge-weight scaling for Leiden CPM.',
  interpretation: 'A pair-only article contributes 1; an article supporting a triple contributes 2; one supporting a ten-reference bundle contributes about 4.17. Score is weighted evidence, not an article count, probability, significance test, or validated bibliometric standard.',
  limitations: 'Rewards larger jointly cited contexts by design. Does not establish topical specificity or correct all effects of long bibliographies. It depends on reference scope and support threshold. Order-profile rows are nested and must not be added as independent observations.',
  reference: 'https://arxiv.org/abs/2010.14355',
  reference_note: 'Background on projection choices; the logarithmic score here is a custom exploratory choice, not the cited paper’s metric.'
};
const store = Neo4jStore.fromEnvironment();
const records = [];
try {
  await store.init();
  for (const threshold of [10, 20, 30]) {
    const candidates = Object.values(graphs).filter(graph => graph.threshold === threshold && graph.resolution === 0.02);
    const pair = candidates.find(graph => graph.order === 2);
    const higherOrders = candidates.filter(graph => graph.order > 2).map(graph => ({order: graph.order, edges: new Map(graph.links.map(edge => [pairKey(edge), edge]))}));
    const maximumOrder = Math.max(...candidates.map(graph => graph.order));
    const nodes = new Map(pair.nodes.map(node => [node.id, node]));
    const links = pair.links.map(edge => {
      const evidence = higherOrders.map(graph => ({order: graph.order, ...graph.edges.get(pairKey(edge))}));
      const combined = combineOrderEvidence(edge, evidence, maximumOrder);
      return {...edge, ...combined, pairwiseStrength: edge.strength, strength: combined.combinedScore / (nodes.get(edge.source).citations * nodes.get(edge.target).citations), bundleIds: higherOrders.find(graph => graph.order === 3)?.edges.get(pairKey(edge))?.bundleIds || []};
    });
    for (const resolution of [0.02, 0.1]) {
      const name = `cocitation_s${threshold}_all_cpm${String(resolution).replace('.', '_')}`;
      const graph = {...pair, nodes: pair.nodes.map(node => ({...node})), links, order: 'all', resolution, method: 'cocitation', metric, maximumOrder, excludedByOrder: 0};
      delete graph.analysisId;
      cluster(graph, resolution);
      const network = {method: 'co_citation', representation: 'all_order_weighted_pair_projection', metric, nodes: graph.nodes.map(node => ({id: node.key, occurrence: node.citations, community: node.cluster ? node.cluster - 1 : null, degree: node.degree, isolated: !node.degree})), edges: links.map(edge => ({source: nodes.get(edge.source).key, target: nodes.get(edge.target).key, raw_weight: edge.count, normalized_weight: edge.strength, weight: edge.strength, combined_score: edge.combinedScore, higher_order_bonus: edge.higherOrderBonus, order_profile: edge.orderProfile, maximum_order_by_article: edge.maximumOrderByArticle, bundle_ids: edge.bundleIds, articles: edge.articles})), bundles: data.bundlesByScope[threshold], stats: graph.stats, clustering: graph.clustering};
      const record = await store.create('analyses', {project_id: identity.project_id, corpus_id: data.summary.corpus_id, name: `All-order co-citation · support 5 · reference threshold ${threshold} · CPM ${resolution}`, parameters: {order: 'all', minimum_support: 5, minimum_reference_occurrence: threshold, metric, clustering: graph.clustering, source_analysis_ids: candidates.map(candidate => candidate.analysisId)}, ref_coverage: data.summary.coverage, network});
      graph.analysisId = record.id;
      await store.transaction(true, transaction => transaction.run('MATCH (combined:BMAnalysis {id: $id}) UNWIND $sources AS sourceId MATCH (source:BMAnalysis {id: sourceId}) CREATE (combined)-[:DERIVED_FROM]->(source)', {id: record.id, sources: candidates.map(candidate => candidate.analysisId)}));
      const saved = await store.get('analyses', record.id);
      assert.deepEqual(saved.network, network);
      graphs[name] = graph;
      records.push({name, analysis_id: record.id, order: 'all', threshold, ...graph.stats, clustering: graph.clustering, boosted_connections: links.filter(edge => edge.higherOrderBonus > 0).length});
      console.log(JSON.stringify(records.at(-1)));
    }
  }
} finally { await store.close(); }

for (const graph of Object.values(graphs)) graph.method = 'cocitation';
const method = {...data.methods.cocitation, title: 'Co-citation', question: 'Which references form repeated citation connections and bundles?', explanation: 'Use one order selector to compare pairwise connections, individual higher orders, and an experimental all-orders combination. Each pair or bundle requires at least five distinct supporting articles. Click a line for its raw support, order profile, and complete bundle evidence.', weight: 'Single-order views use support divided by the product of reference frequencies. All orders uses the experimental combined score divided by that same product. Leiden CPM uses mean-edge-weight scaling and ten starts.', scopes: Object.keys(graphs), default: 'cocitation_s10_all_cpm0_02'};
const summary = {...data.summary, updated_at: new Date().toISOString(), combined_metric: metric, analyses: [...data.summary.analyses.filter(record => record.order !== 'all'), ...records]};
data.graphs = graphs;data.methods = {cocitation: method};data.summary = summary;data.version = 'openalex-unified-cocitation-v3';
await writeFile(`${atlas}/data.js`, 'window.ATLAS_DATA=' + JSON.stringify(data).replaceAll('<', '\\u003c') + ';\n');
await writeFile(`${atlas}/summary.json`, JSON.stringify(summary));
await writeFile('.trials/conservative-cocitation/combined-summary.json', JSON.stringify(summary, null, 2));
const report = (await readFile(`${atlas}/report.html`, 'utf8')).split('<!-- combined-metric -->')[0];
await writeFile(`${atlas}/report.html`, report + `<!-- combined-metric --><section><h2>Unified all-orders view: experimental combined score</h2><p>${metric.formula}</p><p>${metric.definition}</p><p>${metric.interpretation}</p><p>${metric.normalization}</p><p>${metric.limitations}</p><p>Line thickness uses S on a compressed scale. The detail panel reports the original article count, bonus, normalized analysis weight, and nested support at every order. Node size remains original citation frequency. This projection is not a direct hypergraph community detector.</p><p><a href="${metric.reference}">Background: random walks and community detection in hypergraphs</a>. ${metric.reference_note}</p></section>`);
console.log('Unified 50 views; original individual-order evidence retained.');
