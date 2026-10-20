import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {Neo4jStore} from '../neo4j-store.mjs';
import {build} from '../analysis-engine.mjs';
import '../public/corpus-presets.js';

const output = resolve('.trials/conservative-cocitation');
const atlas = resolve('public/conservative-atlas');
const template = 'C:/Users/Austin/Documents/Codex/2026-10-14/can-you-access-the-k-state/sites/adaptive-leadership-atlas/dist';
await mkdir(output, {recursive: true});
await mkdir(atlas, {recursive: true});
async function save(path, value) { await writeFile(path, JSON.stringify(value)); }
const original = JSON.parse(await readFile('.trials/adaptive-leadership-full/works.json', 'utf8'));
const source = JSON.parse(await readFile('.trials/adaptive-leadership-full/summary.json', 'utf8'));
const evaluations = Object.fromEntries(original.map(work => [work.id, globalThis.BiblioMapCorpus.evaluate(work, 'conservative')]));
const corpus = original.filter(work => evaluations[work.id].status === 'included');
const unknown = original.filter(work => evaluations[work.id].status === 'unknown');
const stamp = new Date().toISOString();
const identity = {corpus_id: randomUUID(), analyses: {}};
const networks = {};
for (const threshold of [10, 20, 30]) {
  const options = {method: 'co_citation', counting: 'full', normalization: 'association_strength', minNode: threshold, minRaw: 1, resolution: 0.02, seed: 42, restarts: 10};
  const network = build(corpus, options);
  network.clustering = options._cluster_meta || {};
  networks[threshold] = network;
  console.log(JSON.stringify({phase: 'computed', threshold, ...network.stats, clustering: network.clustering}));
}
const ids = networks[10].nodes.map(node => node.id);
const metadata = new Map(original.map(work => [work.id, work]));
for (let offset = 0; offset < ids.length; offset += 100) {
  const path = join(output, `reference-metadata-${offset / 100 + 1}.json`);
  let result;
  try { result = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const url = new URL('https://api.openalex.org/works');
    url.search = new URLSearchParams({filter: 'openalex:' + ids.slice(offset, offset + 100).map(id => id.split('/').pop()).join('|'), per_page: '100', select: 'id,doi,display_name,publication_year,authorships,type,primary_location'}).toString();
    const response = await fetch(url, {headers: {Authorization: `Bearer ${process.env.OPENALEX_API_KEY}`}, signal: AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`Reference metadata lookup: ${response.status}`);
    result = await response.json();
    await save(path, result);
  }
  for (const work of result.results) metadata.set(work.id, work);
}
const citedBy = new Map(ids.map(id => [id, new Set()]));
for (const work of corpus) for (const reference of new Set(work.referenced_works || [])) citedBy.get(reference)?.add(work.id);
const articles = Object.fromEntries(corpus.map(work => [work.id, {id: work.id, title: work.display_name || work.id, authors: (work.authorships || []).map(item => item.author?.display_name).filter(Boolean).join('; '), year: work.publication_year, doi: (work.doi || '').replace(/^https?:\/\/doi.org\//, ''), journal: work.primary_location?.source?.display_name || '', category: 'Conservative metadata eligible; relevance unreviewed', citations: work.cited_by_count || 0}]));
const graphs = {};
for (const [threshold, network] of Object.entries(networks)) {
  const nodes = network.nodes.map(node => {
    const work = metadata.get(node.id);
    const author = work?.authorships?.[0]?.author?.display_name;
    const label = work ? [author, work.display_name].filter(Boolean).join(', ') : node.id;
    assert.equal(citedBy.get(node.id).size, node.occurrence);
    return {id: node.id.split('/').pop(), key: node.id, label, citations: node.occurrence, cluster: node.community == null ? 0 : node.community + 1, year: work?.publication_year || null, doi: (work?.doi || '').replace(/^https?:\/\/doi.org\//, ''), variants: [node.id], rules: ['OpenAlex ID; distinct IDs retained without automatic title merging'], articles: [...citedBy.get(node.id)], degree: node.degree, x: 0, y: 0};
  });
  const links = network.edges.map(edge => {
    const evidence = [...citedBy.get(edge.source)].filter(id => citedBy.get(edge.target).has(id));
    assert.equal(evidence.length, edge.raw_weight);
    assert(edge.raw_weight <= Math.min(citedBy.get(edge.source).size, citedBy.get(edge.target).size));
    return {source: edge.source.split('/').pop(), target: edge.target.split('/').pop(), count: edge.raw_weight, strength: edge.normalized_weight, articles: evidence, references: [], match: ''};
  });
  graphs[`cocitation_min${threshold}`] = {method: 'cocitation', label: `At least ${threshold} citing source articles`, nodes, links, stats: {...network.stats, clusters: network.clustering.communities}, directed: false};
}
await save(join(output, 'layout-input.json'), graphs);
execFileSync('C:/Users/Austin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe', ['-X', 'utf8', 'scripts/layout-cocitation.py', join(output, 'layout-input.json'), join(output, 'layout-output.json')], {stdio: 'inherit'});
const positioned = JSON.parse(await readFile(join(output, 'layout-output.json'), 'utf8'));
const coverage = {primaryWorks: corpus.length, withReferences: corpus.filter(work => work.referenced_works?.length).length, referenceLinks: corpus.reduce((sum, work) => sum + new Set(work.referenced_works || []).size, 0)};
const store = Neo4jStore.fromEnvironment();
const checks = [];
try {
  await store.init();
  await store.create('corpora', {id: identity.corpus_id, project_id: source.project_id, search_id: source.search_id, name: 'Conservative — co-citation source corpus', version: 4, works: corpus, created_at: stamp, updated_at: stamp, decisions: {derived_from_corpus_id: source.corpus_id, corpusPreset: 'conservative', presetVersion: globalThis.BiblioMapCorpus.version, selectionReasons: evaluations, reviewed_work_ids: [], excluded_work_ids: original.filter(work => evaluations[work.id].status !== 'included').map(work => work.id), review_pending_ids: unknown.map(work => work.id), human_validated: false}}, {preserveIdentity: true});
  const citedWorks = Object.fromEntries(ids.filter(id => metadata.has(id)).map(id => [id, metadata.get(id)]));
  for (const [threshold, network] of Object.entries(networks)) {
    const analysis = await store.create('analyses', {project_id: source.project_id, corpus_id: identity.corpus_id, name: `Conservative co-citation — Leiden — minimum ${threshold}`, corpus, search_snapshot: {total: source.initial_matches}, query: {corpusPreset: 'conservative', presetVersion: globalThis.BiblioMapCorpus.version, searchSpec: {query: '"adaptive leadership"', mode: 'search', searchedAt: source.started_at}}, network, cited_works: citedWorks, ref_coverage: coverage, parameters: {method: 'co_citation', counting: 'full', normalization: 'association_strength', minNodeOccurrence: +threshold, minRawEdgeCount: 1, clustering: network.clustering}, view_state: {clusterMode: 'detailed'}});
    identity.analyses[threshold] = analysis.id;
    const verified = await store.transaction(false, async tx => {
      const nodes = await tx.run('MATCH (:BMAnalysis {id: $id})-[:HAS_NODE]->(n) RETURN count(n) AS nodes', {id: analysis.id});
      const edges = await tx.run('MATCH ()-[r:CO_CITED_WITH {analysis_id: $id}]->() RETURN count(r) AS edges', {id: analysis.id});
      return {threshold: +threshold, nodes: nodes.records[0].get('nodes'), edges: edges.records[0].get('edges')};
    });
    assert.equal(verified.nodes, network.nodes.length);
    assert.equal(verified.edges, network.edges.length);
    checks.push(verified);
  }
} finally { await store.close(); }
const summary = {created_at: stamp, source_corpus_size: corpus.length, review_pending: unknown.length, original_corpus_id: source.corpus_id, corpus_id: identity.corpus_id, coverage, layout: {algorithm: 'unweighted spring', seed: 7, iterations: 350, affects_clustering: false}, analyses: Object.entries(networks).map(([threshold, network]) => ({threshold: +threshold, analysis_id: identity.analyses[threshold], ...network.stats, clustering: network.clustering})), verification: checks, reference_metadata_missing: ids.filter(id => !metadata.has(id)).length, limitations: ['Metadata eligibility is not verified peer review or topical relevance.', 'Conservative filtering applies to citing source articles, not cited references; books and other cited works remain eligible as intellectual roots.', 'Distinct OpenAlex IDs remain separate even when titles match.', 'Leiden CPM resolution is 0.02 after mean retained edge weight scaling; full counting and association-strength edge weights.', 'Thresholds change the analytical graph; strongest-three line display does not recalculate communities.', 'Layouts are exploratory and not calibrated distances.']};
await save(join(output, 'summary.json'), summary);
const data = {summary, methods: {cocitation: {title: 'Co-citation · Leiden', question: 'Which works form a shared intellectual base?', node: 'cited work', plural: 'cited works', size: 'Citing source articles', edge: 'Co-citing source articles', group: 'Leiden community', explanation: 'A line joins two references when a Conservative-eligible source article cites both. Node size counts citing articles.', caveat: `${corpus.length.toLocaleString()} metadata-eligible source articles. Their topical relevance remains unreviewed. Source filters do not remove cited books or other intellectual roots.`, weight: 'Association strength = co-citing articles / product of each reference’s citing-article counts. Full counting; Leiden CPM, resolution 0.02, mean-weight scaling, seed 42, 10 restarts.', default: 'cocitation_min10', scopes: Object.keys(positioned)}}, graphs: positioned, articles, references: {}, version: 'openalex-conservative-leiden-v1'};
await writeFile(join(atlas, 'data.js'), 'window.ATLAS_DATA=' + JSON.stringify(data).replaceAll('<', '\\u003c') + ';\n');
await copyFile(join(template, 'styles.css'), join(atlas, 'styles.css'));
let app = await readFile(join(template, 'app.js'), 'utf8');
app = app.replaceAll('249', String(corpus.length)).replaceAll('Louvain', 'Leiden').replace("name:'cocitation_min5'", "name:'cocitation_min10'").replace("['coupling','citedauthors','citedjournals','terms'].includes(state.method)", "['cocitation','coupling','citedauthors','citedjournals','terms'].includes(state.method)");
app = app.replace('supported source articles; inclusion decisions await human validation.', 'Conservative metadata-eligible source articles; topical relevance awaits human review.').replace('the report tests other seeds, resolutions and subsets.', 'the scope selector compares citation thresholds; seed and resolution sensitivity were not tested in this run.');
await writeFile(join(atlas, 'app.js'), app);
let index = await readFile(join(template, 'index.html'), 'utf8');
index = index.replace(/<link rel="stylesheet" href="(?:historiography|milestones)\.css">/g, '').replace(/<script src="(?!data\.js|app\.js)[^"]+"><\/script>/g, '').replaceAll('249 provisional source articles', `${corpus.length.toLocaleString()} Conservative source articles`).replaceAll('249 provisional articles', `${corpus.length.toLocaleString()} Conservative source articles`).replaceAll('Adaptive Leadership Atlas', 'Adaptive Leadership · OpenAlex Atlas').replaceAll('analysis/report.html', 'report.html').replaceAll('extensions/report.html', 'report.html').replace('New methods & downloads', 'Parameters & audit');
index = index.replace(/<dialog id="help"[\s\S]*?<\/dialog>/, `<dialog id="help" aria-labelledby="helpTitle"><div class="dialog-header"><p class="eyebrow">Method & interpretation</p><button id="closeHelp" type="button" aria-label="Close method help">×</button></div><h2 id="helpTitle">Conservative source corpus · co-citation · Leiden</h2><p>${corpus.length.toLocaleString()} source articles pass Conservative metadata rules. ${unknown.length} uncertain records are held out. Source articles are not yet screened for topical relevance.</p><p>Each distinct citing article contributes once per reference and co-cited pair. Edges use association strength. Leiden uses CPM, resolution 0.02 after mean-weight scaling, seed 42 and 10 restarts. Communities use all analysis edges; display filters only hide lines.</p><p>The 10-, 20- and 30-citation scopes are separately calculated networks. Cited books remain eligible. Duplicate titles with distinct OpenAlex IDs are not merged. Click a line to inspect every contributing source article.</p><p>Layout is exploratory, not a calibrated similarity scale. Moving lights are decorative; co-citation is undirected.</p><a href="report.html">Parameters and audit</a></dialog>`);
await writeFile(join(atlas, 'index.html'), index);
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
await writeFile(join(atlas, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Conservative co-citation methods</title><style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:20px;line-height:1.6}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{padding:10px;border:1px solid #bbb}</style><h1>Conservative corpus · co-citation · Leiden</h1><p><a href="index.html">Open Atlas</a> · <a href="summary.json">Download methods and verification</a></p><p>${corpus.length} source articles; ${coverage.referenceLinks.toLocaleString()} indexed source-reference links.</p><table><tr><th>Minimum citing articles</th><th>Cited works</th><th>Co-citation links</th><th>Leiden communities</th></tr>${summary.analyses.map(run => `<tr><td>${run.threshold}</td><td>${run.nodes}</td><td>${run.edges}</td><td>${run.clustering.communities}</td></tr>`).join('')}</table><ul>${summary.limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul><pre>${esc(JSON.stringify(summary, null, 2))}</pre>`);
await save(join(atlas, 'summary.json'), summary);
console.log(JSON.stringify({phase: 'complete', ...summary, url: 'http://localhost:3011/conservative-atlas/index.html'}));
