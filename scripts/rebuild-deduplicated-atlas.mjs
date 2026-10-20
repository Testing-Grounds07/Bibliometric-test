import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {deduplicateWorks} from './work-deduplication.mjs';
import {buildProjectGraph, evidenceDataset} from './workspace-projects-core.mjs';
import {mineProjectBundles, projectOrderGraph} from './project-higher-orders.mjs';
import {analyzeCPM, AUTO_CPM_VERSION, AUTO_CPM_METHOD, AUTO_CPM_LIMITATIONS} from './auto-cpm.mjs';

const directory = 'public/conservative-atlas', output = '.trials/conservative-cocitation/deduplicated-v1';
const previousContext = {window: {}};
if(fs.existsSync(path.join(output,'data.js')))vm.runInNewContext(fs.readFileSync(path.join(output,'data.js'),'utf8'),previousContext);
const previousData = previousContext.window.ATLAS_DATA;
fs.mkdirSync(output, {recursive: true});
const backup = path.join(output, 'original'); fs.mkdirSync(backup, {recursive: true});
for (const name of ['data.js', 'settings-data.js', 'source-evidence.json', 'expanded-data.json', 'summary.json']) if (!fs.existsSync(path.join(backup, name))) fs.copyFileSync(path.join(directory, name), path.join(backup, name));
const context = {window: {}}; vm.runInNewContext(fs.readFileSync(path.join(backup, 'data.js'), 'utf8'), context);
const data = context.window.ATLAS_DATA, originalEvidence = JSON.parse(fs.readFileSync(path.join(backup, 'source-evidence.json')));
const sourceIds = new Set(originalEvidence.articles.map(article => article.id));
const works = JSON.parse(fs.readFileSync('.trials/adaptive-leadership-full/works.json')).filter(work => sourceIds.has(work.id));
const metadata = [];
for (const name of fs.readdirSync('.trials/conservative-cocitation').filter(name => /^(reference-metadata-|expanded-metadata-).*\.json$/.test(name))) metadata.push(...(JSON.parse(fs.readFileSync('.trials/conservative-cocitation/' + name)).results || []));
const prepared = deduplicateWorks(works, metadata);
fs.writeFileSync(path.join(output, 'deduplication-audit.json'), JSON.stringify(prepared.audit, null, 2));
console.log(JSON.stringify({sourcesBefore: works.length, sourcesAfter: prepared.works.length, mergedGroups: prepared.audit.mergedGroups.length, groups: prepared.audit.mergedGroups.map(group => ({id: group.canonicalId, titles: group.records.map(record => record.title), years: group.years}))}));
if (process.argv.includes('--audit-only')) process.exit(0);

const originalPositions = new Map(Object.values(data.graphs).flatMap(graph => graph.nodes).map(node => [node.key || 'https://openalex.org/' + node.id, node]));
function displayGraph(graph) {
 const compact = id => id.replace('https://openalex.org/', '');
 graph.nodes = graph.nodes.map(node => ({...node, id: compact(node.id), ...(originalPositions.has(node.id) ? {x: originalPositions.get(node.id).x, y: originalPositions.get(node.id).y} : {})}));
 graph.links = graph.links.map(edge => ({...edge, source: compact(edge.source), target: compact(edge.target)}));
 delete graph.externalCorpus;
 return graph;
}
const graphs = {}, bundlesByScope = {};
for (const threshold of [10, 20, 30]) {
 const base = displayGraph(buildProjectGraph(works, metadata, {threshold, support: 5, resolution: .02}));
 const artifact = mineProjectBundles(base.nodes, 5);
 bundlesByScope[threshold] = artifact.bundles;
 for (const order of [...Array.from({length: artifact.maximumOrder - 1}, (_, position) => position + 2), 'all']) for (const resolution of [.02, .1]) {
  const graph = projectOrderGraph(base, artifact, {order, maximumOrder: artifact.maximumOrder, resolution});
  graph.method = 'cocitation'; graph.label = `References cited by ≥${threshold} articles`; graph.directed = false;
  const name = `cocitation_s${threshold}_${order === 'all' ? 'all' : 'n' + order}_cpm${String(resolution).replace('.', '_')}`;
  graphs[name] = graph;
 }
 console.log(JSON.stringify({threshold, nodes: base.nodes.length, edges: base.links.length, maximumOrder: artifact.maximumOrder, bundles: artifact.bundles.length}));
}
const expandedBase = displayGraph(buildProjectGraph(works, metadata, {threshold: 5, support: 3, resolution: .02}, {nodes: 10000}));
const expandedArtifact = mineProjectBundles(expandedBase.nodes, 3);
const expanded = {version: 2, sourceCorpusId: data.summary.corpus_id, sourceArticleCount: prepared.works.length, minimumReferenceCitations: 5, minimumSupport: 3, maximumOrder: expandedArtifact.maximumOrder, complete: true, base: expandedBase, bundles: expandedArtifact.bundles};
const labels = Object.fromEntries(prepared.metadata.map(work => [work.id, work.display_name || work.id]));
const evidence = evidenceDataset(works, data.summary.corpus_id, labels, metadata);
data.articles = Object.fromEntries(evidence.articles.map(article => [article.id, {...article, journal: works.find(work => work.id === article.id)?.primary_location?.source?.display_name || '', category: 'Conservative metadata eligible; relevance unreviewed', citations: article.citedBy}]));
data.graphs = graphs; data.bundlesByScope = bundlesByScope; data.version = 'deduplicated-works-v1';
data.methods.cocitation.scopes = Object.keys(graphs);
const updatedAt = fs.existsSync(path.join(output, 'summary.json')) ? JSON.parse(fs.readFileSync(path.join(output, 'summary.json'))).updated_at : new Date().toISOString();
data.summary = {...data.summary, updated_at: updatedAt, source_corpus_size: evidence.articles.length, deduplication: prepared.audit, analyses: Object.entries(graphs).map(([name, graph]) => ({name, threshold: graph.threshold, order: graph.order, resolution: graph.resolution, ...graph.stats}))};
const dataScript = 'window.ATLAS_DATA=' + JSON.stringify(data).replaceAll('<', '\\u003c') + ';\n';
fs.writeFileSync(path.join(output, 'data.js'), dataScript);
fs.writeFileSync(path.join(output, 'source-evidence.json'), JSON.stringify(evidence));
fs.writeFileSync(path.join(output, 'expanded-data.json'), JSON.stringify(expanded));
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(data.summary));

const fingerprint = createHash('sha256').update(dataScript).digest('hex'), checkpoint = path.join(output, 'settings-checkpoint.json');
const settings = fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint)) : {version: AUTO_CPM_VERSION, createdAt: new Date().toISOString(), sourceDataSha256: fingerprint, bootstrapCount: 50, method: AUTO_CPM_METHOD, limitations: AUTO_CPM_LIMITATIONS, configs: {}};
settings.sourceDataSha256 = fingerprint;
const evidenceSignature = graph => {const linked=new Set(graph.links.flatMap(edge=>[edge.source,edge.target]));return createHash('sha256').update(JSON.stringify({order:graph.order,cap:graph.maximumOrder,nodes:graph.nodes.filter(node=>linked.has(node.id)).map(node=>[node.id,node.articles,node.citations]),links:graph.links.map(edge=>[edge.source,edge.target,edge.articles,edge.strength,edge.bundleIds]),bundles:graph.bundles})).digest('hex');};
for (const threshold of [10, 20, 30]) {
 const baseline = Object.entries(graphs).filter(([, graph]) => graph.threshold === threshold && graph.resolution === .02);
 const combined = baseline.find(([, graph]) => graph.order === 'all');
 const tasks = baseline.filter(([, graph]) => graph.order !== 'all').map(([name, graph]) => ({key: `s${threshold}_n${graph.order}`, name, graph}));
 for (let cap = 2; cap <= combined[1].maximumOrder; cap++) {
  const base = baseline.find(([, graph]) => graph.order === 2)[1], artifact = {complete: true, minimumSupport: 5, referenceIds: base.nodes.map(node => node.id).sort(), maximumOrder: combined[1].maximumOrder, bundles: bundlesByScope[threshold]};
  tasks.push({key: `s${threshold}_cap${cap}`, name: combined[0], graph: projectOrderGraph(base, artifact, {order: 'all', maximumOrder: cap, resolution: .02})});
 }
 for (const task of tasks) {
  task.graph.bundles = bundlesByScope[threshold];
  const signature=evidenceSignature(task.graph),cached=settings.configs[task.key];
  let previousSignature=cached?.evidenceSignature;
  if(cached&&!previousSignature&&previousData?.graphs[task.name]){
   let previousGraph=structuredClone(previousData.graphs[task.name]);
   if(task.graph.order==='all'){const base=Object.values(previousData.graphs).find(graph=>graph.threshold===threshold&&graph.order===2&&graph.resolution===.02);previousGraph=projectOrderGraph(base,{complete:true,minimumSupport:5,referenceIds:base.nodes.map(node=>node.id).sort(),maximumOrder:previousGraph.maximumOrder,bundles:previousData.bundlesByScope[threshold]},{order:'all',maximumOrder:task.graph.maximumOrder,resolution:.02});}
   previousGraph.bundles=previousData.bundlesByScope[threshold];previousSignature=evidenceSignature(previousGraph);
  }
  if(cached&&previousSignature===signature){cached.evidenceSignature=signature;console.log(task.key+': reused identical analytical evidence');continue;}
  const config = analyzeCPM(task.graph, Object.keys(data.articles));
  settings.configs[task.key] = {...config, evidenceSignature:signature, base: task.name, threshold, order: task.graph.order, maximumOrder: task.graph.order === 'all' ? task.graph.maximumOrder : null};
  fs.writeFileSync(checkpoint, JSON.stringify(settings)); console.log(task.key + ': rebuilt Auto CPM and 50 bootstrap samples');
 }
}
fs.writeFileSync(path.join(output, 'settings-data.js'), 'window.ATLAS_SETTINGS=' + JSON.stringify(settings).replaceAll('<', '\\u003c') + ';\n');
if (process.argv.includes('--publish')) for (const name of ['data.js', 'settings-data.js', 'source-evidence.json', 'expanded-data.json', 'summary.json']) fs.copyFileSync(path.join(output, name), path.join(directory, name));
console.log('Rebuilt all analytical evidence, orders and CPM audits. Original inputs and saved findings remain unchanged.');
