import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {cluster} from './cocitation-clustering.mjs';
import {Neo4jStore} from '../neo4j-store.mjs';

const output = '.trials/conservative-cocitation';
const atlas = 'public/conservative-atlas';
const source = JSON.parse(await readFile(`${output}/layout-input.json`, 'utf8'));
const current = JSON.parse((await readFile(`${atlas}/data.js`, 'utf8')).slice('window.ATLAS_DATA='.length).trim().replace(/;$/, ''));
const baseline = JSON.parse(await readFile(`${output}/layout-unweighted.json`, 'utf8'));
const mined = JSON.parse(await readFile(`${output}/higher-order-bundles.json`, 'utf8'));
const identity = JSON.parse(await readFile('.trials/adaptive-leadership-full/summary.json', 'utf8'));
const nodesById = new Map(source.cocitation_min10.nodes.map(node => [node.id, node]));
const articleSets = new Map([...nodesById].map(([id, node]) => [id, new Set(node.articles)]));
assert.equal(mined.complete, true);
assert.equal(mined.minimum_support, 5);
const supportOf = members => [...articleSets.get(members[0])].filter(article => members.every(id => articleSets.get(id).has(article))).sort();
for (const bundle of mined.bundles) assert.deepEqual([...bundle.articles].sort(), supportOf(bundle.members));


const graphs = {}, bundlesByScope = {};
for (const threshold of [10, 20, 30]) {
  const base = baseline[`cocitation_min${threshold}`];
  const eligible = new Set(base.nodes.map(node => node.id));
  const unique = new Map();
  for (const original of mined.bundles) {
    const members = original.members.filter(id => eligible.has(id)).sort();
    if (members.length < 3) continue;
    const key = members.join('|');
    if (!unique.has(key)) unique.set(key, {id: `s${threshold}b${unique.size}`, members, articles: supportOf(members)});
  }
  const bundles = [...unique.values()];
  bundlesByScope[threshold] = bundles;
  const maximum = Math.max(2, ...bundles.map(bundle => bundle.members.length));
  for (let order = 2; order <= maximum; order++) {
    let links, nodes;
    if (order === 2) {
      links = base.links.filter(edge => edge.count >= 5).map(edge => ({...edge}));
      nodes = base.nodes;
    } else {
      const pairs = new Map();
      for (const bundle of bundles.filter(bundle => bundle.members.length >= order)) {
        for (let left = 0; left < bundle.members.length; left++) for (let right = left + 1; right < bundle.members.length; right++) {
          const sourceId = bundle.members[left], targetId = bundle.members[right], key = `${sourceId}|${targetId}`;
          if (!pairs.has(key)) pairs.set(key, {source: sourceId, target: targetId, articles: new Set(), bundleIds: []});
          const edge = pairs.get(key);
          edge.bundleIds.push(bundle.id);
          for (const article of bundle.articles) edge.articles.add(article);
        }
      }
      links = [...pairs.values()].map(edge => ({...edge, articles: [...edge.articles].sort(), count: edge.articles.size, strength: edge.articles.size / (nodesById.get(edge.source).citations * nodesById.get(edge.target).citations)}));
      const participating = new Set(links.flatMap(edge => [edge.source, edge.target]));
      nodes = base.nodes.filter(node => participating.has(node.id));
    }
    for (const edge of links) {
      assert(edge.count >= 5);
      assert.equal(edge.count, new Set(edge.articles).size);
      assert(edge.articles.every(article => articleSets.get(edge.source).has(article) && articleSets.get(edge.target).has(article)));
    }
    for (const resolution of [0.02, 0.1]) {
      const name = `cocitation_s${threshold}_n${order}_cpm${String(resolution).replace('.', '_')}`;
      const graph = {method: order === 2 ? 'cocitation' : 'higherorder', label: `References cited by ≥${threshold} articles`, threshold, order, resolution, minimumSupport: 5, nodes: nodes.map(node => ({...node})), links, directed: false, excludedByOrder: base.nodes.length - nodes.length};
      cluster(graph, resolution);
      graphs[name] = graph;
      console.log(JSON.stringify({name, ...graph.stats}));
    }
  }
}

const store = Neo4jStore.fromEnvironment();
const records = [];
try {
  await store.init();
  for (const [name, graph] of Object.entries(graphs)) {
    const bundles = graph.order > 2 ? bundlesByScope[graph.threshold].filter(bundle => bundle.members.length >= graph.order) : [];
    const network = {method: 'co_citation', representation: graph.order > 2 ? 'higher_order_pair_projection' : 'pairwise', nodes: graph.nodes.map(node => ({id: node.key, occurrence: node.citations, community: node.cluster ? node.cluster - 1 : null, degree: node.degree, isolated: !node.degree})), edges: graph.links.map(edge => ({source: nodesById.get(edge.source).key, target: nodesById.get(edge.target).key, raw_weight: edge.count, normalized_weight: edge.strength, weight: edge.strength, articles: edge.articles, bundle_ids: edge.bundleIds || []})), bundles, clustering: graph.clustering, stats: graph.stats};
    const record = await store.create('analyses', {project_id: identity.project_id, corpus_id: current.summary.corpus_id, name: `${graph.order}-way co-citation · support 5 · reference threshold ${graph.threshold} · CPM ${graph.resolution}`, parameters: {order: graph.order, minimum_support: 5, minimum_reference_occurrence: graph.threshold, clustering: graph.clustering, bundle_representation: 'closed frequent sets; every qualifying N-subset represented', projection_count: 'distinct union of source articles supporting qualifying bundles containing this pair'}, network});
    graph.analysisId = record.id;
    if (bundles.length) await store.transaction(true, async transaction => {
      await transaction.run('UNWIND $bundles AS bundle MATCH (analysis:BMAnalysis {id: $analysisId}) CREATE (hyperedge:BMCoCitationBundle {id: bundle.id, analysis_id: $analysisId, support: bundle.support, order: bundle.order}) CREATE (analysis)-[:HAS_COCITATION_BUNDLE]->(hyperedge) WITH hyperedge, bundle UNWIND bundle.members AS member MERGE (work:BMWork {id: member}) CREATE (hyperedge)-[:CONTAINS_REFERENCE]->(work)', {analysisId: record.id, bundles: bundles.map(bundle => ({id: `${record.id}:${bundle.id}`, support: bundle.articles.length, order: bundle.members.length, members: bundle.members.map(id => nodesById.get(id).key)}))});
      await transaction.run('UNWIND $bundles AS bundle MATCH (hyperedge:BMCoCitationBundle {id: bundle.id}) UNWIND bundle.articles AS article MERGE (work:BMWork {id: article}) CREATE (hyperedge)-[:SUPPORTED_BY]->(work)', {bundles: bundles.map(bundle => ({id: `${record.id}:${bundle.id}`, articles: bundle.articles}))});
    });
    const verified = await store.transaction(false, async transaction => {
      const result = await transaction.run('MATCH (analysis:BMAnalysis {id: $id}) RETURN COUNT { (analysis)-[:HAS_NODE]->() } AS nodes, COUNT { ()-[:CO_CITED_WITH {analysis_id: $id}]->() } AS edges, COUNT { (analysis)-[:HAS_COCITATION_BUNDLE]->() } AS bundles', {id: record.id});
      return result.records[0].toObject();
    });
    assert.deepEqual(verified, {nodes: graph.nodes.length, edges: graph.links.length, bundles: bundles.length});
    records.push({name, analysis_id: record.id, order: graph.order, threshold: graph.threshold, ...graph.stats, clustering: graph.clustering, verified});
  }
} finally { await store.close(); }

const shared = {node: 'cited work', plural: 'cited works', size: 'Citing source articles', group: 'Leiden community', clustered: true, weight: 'Association strength; Leiden CPM on the displayed analysis graph, mean-edge-weight scaling, seeds 42–51. Display-only line filters do not recalculate communities.', caveat: '2,855 Conservative source articles; topical relevance unreviewed. Every retained connection or bundle has at least five distinct supporting articles. Reference frequency scopes remain 10, 20, and 30.'};
const methods = {
  cocitation: {...shared, title: 'Pairwise co-citation', question: 'Which references are repeatedly cited together?', edge: 'Co-citing source articles', explanation: 'Each edge joins two works cited together by at least five source articles. Clusters are recalculated after applying that support threshold.'},
  higherorder: {...shared, title: 'Higher-order co-citation', question: 'Which bundles of references are repeatedly cited together?', edge: 'Supporting source articles', explanation: 'Choose N to retain pairs belonging to an N-reference bundle cited together by at least five source articles. Lines project genuine bundles onto pairs; their counts are distinct source articles across qualifying bundles. Click a line to inspect complete bundles and their joint evidence. Leiden clusters this pair projection, not the hypergraph directly.'}
};
for (const [key, method] of Object.entries(methods)) {
  method.scopes = Object.keys(graphs).filter(name => graphs[name].method === key);
  method.default = method.scopes[0];
}
const summary = {...current.summary, created_at: new Date().toISOString(), analyses: records, higher_order: {complete: true, maximum_order: mined.maximum_order, closed_bundles: mined.bundles.length, minimum_support: 5, reference_universe: 584, minimum_reference_occurrence: 10}, layout: {algorithm: 'Coordinates retained from baseline for comparable views; not recalculated by order or resolution', affects_clustering: false}, limitations: ['Source metadata eligibility is not topical relevance or verified peer review.', 'Higher-order search is exhaustive within the 584-reference universe cited at least ten times, not all OpenAlex references.', 'Closed frequent sets losslessly represent supported subsets; displayed bundles may contain more than the selected N.', 'Projected edge counts union bundle-supporting articles without double counting; clustering uses this pair projection, not a hypergraph objective.', 'CPM resolutions 0.02 and 0.1 use ten starts each; substantive validity and bootstrap stability are not established.', 'Distinct OpenAlex IDs are not automatically merged.']};
await writeFile(`${atlas}/data.js`, 'window.ATLAS_DATA=' + JSON.stringify({summary, methods, graphs, articles: current.articles, references: {}, bundlesByScope, version: 'openalex-conservative-higher-order-v2'}).replaceAll('<', '\\u003c') + ';\n');
await writeFile(`${atlas}/summary.json`, JSON.stringify(summary));
await writeFile(`${output}/higher-order-summary.json`, JSON.stringify(summary, null, 2));
await writeFile(`${atlas}/report.html`, `<!doctype html><meta charset="utf-8"><title>Co-citation methods and audit</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:20px;line-height:1.6}td,th{padding:8px;border:1px solid #bbb}table{border-collapse:collapse}pre{white-space:pre-wrap}</style><h1>Pairwise and higher-order co-citation</h1><p><a href="index.html">Open Atlas</a> · <a href="summary.json">Download audit</a></p><p>2,855 Conservative source articles. Minimum support: five distinct citing articles. CPM 0.02 and 0.1. Exact closed-set mining finds ${mined.bundles.length} closed bundles, maximum order ${mined.maximum_order}, within 584 references cited at least ten times. Every supported N-item set is contained in a closed set with the same supporting articles. No pairwise triangle inference or itemset truncation is used.</p><p>For selected N, the chart projects qualifying bundles onto cited-work pairs. Edge support is the deduplicated union of qualifying bundle-supporting articles. Normalization divides by the product of the original two reference frequencies. This is an exploratory projection, not a direct hypergraph community detector. Closed bundles and supporting evidence are also stored natively in Neo4j.</p><ul>${summary.limitations.map(item => `<li>${item}</li>`).join('')}</ul><table><tr><th>Reference threshold</th><th>Order</th><th>CPM</th><th>Nodes</th><th>Edges</th><th>Communities</th><th>Isolates</th></tr>${records.map(record => `<tr><td>${record.threshold}</td><td>${record.order}</td><td>${record.clustering.resolution}</td><td>${record.nodes}</td><td>${record.edges}</td><td>${record.clusters}</td><td>${record.isolated_nodes}</td></tr>`).join('')}</table>`);
console.log(JSON.stringify({saved: records.length, maximumOrder: mined.maximum_order, closedBundles: mined.bundles.length}));
