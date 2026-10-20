import fs from 'node:fs/promises';
import vm from 'node:vm';
import {descriptionRequest} from './cluster-description-core.mjs';
import {couplingPairs, couplingGraph} from './evidence-metrics.mjs';
import {partition, densityGrid} from './auto-cpm.mjs';

const context = {window: {}};
vm.runInNewContext(await fs.readFile('public/conservative-atlas/data.js', 'utf8'), context);
const data = context.window.ATLAS_DATA;
const corpus = JSON.parse(await fs.readFile('public/conservative-atlas/source-evidence.json', 'utf8'));
const coupling = couplingGraph(corpus.articles, couplingPairs(corpus.articles));
const resolution = densityGrid(coupling).density / 4, groups = partition(coupling, resolution);
for (const node of coupling.nodes) node.cluster = groups.memberships[node.id] || 0;
coupling.canvasKind = 'coupling';
const largest = graph => [...new Set(graph.nodes.map(node => node.cluster))].filter(cluster => cluster > 0).sort((left, right) => graph.nodes.filter(node => node.cluster === right).length - graph.nodes.filter(node => node.cluster === left).length);
const cases = [];
for (const [name, graph, limit] of [['pairwise', data.graphs.cocitation_s10_n2_cpm0_02, 4], ['higher-order', data.graphs.cocitation_s10_n3_cpm0_02, 3], ['coupling', coupling, 4]]) {
 for (const cluster of largest(graph).slice(0, limit)) cases.push({name, graph, cluster});
}
const small = largest(coupling).find(cluster => coupling.nodes.filter(node => node.cluster === cluster).length === 2);
if (small) cases.push({name: 'coupling-small', graph: coupling, cluster: small});
const results = [];
for (const item of cases) {
 const started = Date.now(), request = descriptionRequest(item.graph, item.cluster, data.summary.corpus_id);
 const response = await fetch('http://127.0.0.1:8093/describe', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(request)});
 const result = await response.json();
 results.push({case: item.name, cluster: item.cluster, seconds: (Date.now() - started) / 1000, status: response.status, result});
 console.log(JSON.stringify({case: item.name, cluster: item.cluster, status: response.status, seconds: results.at(-1).seconds, baseline: result.packet?.baseline, heading: result.heading, summary: result.summary?.text, error: result.error}));
 await fs.writeFile('.trials/conservative-cocitation/cluster-description-benchmark.json', JSON.stringify(results, null, 2));
}
console.log('Benchmark completed: ' + results.length + ' clusters. Semantic support requires manual evidence review.');
