import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Neo4jStore} from '../neo4j-store.mjs';
import {build} from '../analysis-engine.mjs';
import '../public/corpus-presets.js';

const phrase = '"adaptive leadership"';
const limit = 200;
const startedAt = new Date().toISOString();
const trialDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Chicago'}).format(new Date(startedAt));
const directory = fileURLToPath(new URL(`../.trials/adaptive-leadership-${startedAt.replace(/[:.]/g, '-')}/`, import.meta.url));
await mkdir(directory, {recursive: true});
const receipts = [];
async function fetchPage(parameters, label) {
  const target = new URL('https://api.openalex.org/works');
  target.search = new URLSearchParams(parameters).toString();
  const headers = {'User-Agent': 'BiblioMap/1.0 trial'};
  if (process.env.OPENALEX_API_KEY) headers.Authorization = `Bearer ${process.env.OPENALEX_API_KEY}`;
  const response = await fetch(target, {headers, signal: AbortSignal.timeout(60000)});
  const raw = await response.text();
  await writeFile(join(directory, `${label}.json`), raw);
  if (!response.ok) throw new Error(`OpenAlex ${response.status}: ${raw.slice(0, 200)}`);
  const body = JSON.parse(raw);
  receipts.push({url: target.toString(), fetched_at: new Date().toISOString(), status: response.status, meta: body.meta});
  return body;
}
const fields = 'id,doi,display_name,publication_year,cited_by_count,authorships,primary_location,topics,open_access,referenced_works,referenced_works_count,abstract_inverted_index,keywords,type,language,is_retracted,institutions_distinct_count';
let works = [], cursor = '*', total = null;
for (let page = 1; works.length < limit; page++) {
  const parameters = {search: phrase, corpus: 'core', filter: 'type:article|review|book-chapter|conference-paper', per_page: String(Math.min(process.env.OPENALEX_API_KEY ? 100 : limit, limit - works.length)), select: fields};
  if (process.env.OPENALEX_API_KEY) parameters.cursor = cursor;
  const result = await fetchPage(parameters, `search-page-${page}`);
  total ??= result.meta.count;
  works.push(...result.results);
  if (!process.env.OPENALEX_API_KEY || !result.results.length || !result.meta.next_cursor) break;
  cursor = result.meta.next_cursor;
}
works = [...new Map(works.map(work => [work.id, work])).values()];
console.log(JSON.stringify({phase: 'retrieved', matching: total, downloaded: works.length, directory}));
const referenceFrequency = new Map();
for (const work of works) for (const reference of new Set(work.referenced_works || [])) referenceFrequency.set(reference, (referenceFrequency.get(reference) || 0) + 1);
const rankedReferences = [...referenceFrequency].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
const referenceIds = rankedReferences.slice(0, 100).map(([id]) => id);
const citedWorks = {};
for (let offset = 0; offset < referenceIds.length; offset += 50) {
  const batch = referenceIds.slice(offset, offset + 50).map(id => id.split('/').pop()).join('|');
  const result = await fetchPage({filter: `openalex:${batch}`, per_page: '100', select: fields}, `reference-metadata-${offset / 50 + 1}`);
  for (const work of result.results) citedWorks[work.id] = work;
}
const evaluations = Object.fromEntries(works.map(work => [work.id, globalThis.BiblioMapCorpus.evaluate(work, 'balanced')]));
const referenceCoverage = {
  downloaded: works.length,
  with_references: works.filter(work => work.referenced_works?.length).length,
  without_references: works.filter(work => !work.referenced_works?.length).length,
  indexed_reference_links: works.reduce((sum, work) => sum + new Set(work.referenced_works || []).size, 0),
  distinct_references: referenceFrequency.size,
  with_abstracts: works.filter(work => work.abstract_inverted_index).length,
  reference_metadata_retrieved: Object.keys(citedWorks).length
};
const presetCounts = Object.values(evaluations).reduce((counts, result) => { counts[result.status]++; return counts; }, {included: 0, excluded: 0, unknown: 0});
const query = {query: phrase, mode: 'search', searchedAt: startedAt, openalexCorpus: 'core', workTypes: ['article', 'review', 'book-chapter', 'conference-paper'], trialLimit: limit, ranking: 'OpenAlex default relevance', note: 'Phrase match in OpenAlex broad search, potentially including full text. Relevance-ranked sample, not the complete search result. No manual or preset exclusions applied.'};
const store = Neo4jStore.fromEnvironment();
const summaries = [];
let project;
try {
  await store.init();
  project = await store.create('projects', {name: `Adaptive leadership — OpenAlex trial ${trialDate}`, description: 'First 200 relevance-ranked phrase matches; all retrieved works retained for exploratory network screening.'});
  const search = await store.create('searches', {project_id: project.id, name: 'Adaptive leadership phrase — first 200', query, result_snapshot: {works, total}, result_count: works.length});
  const corpus = await store.create('corpora', {project_id: project.id, search_id: search.id, name: 'Unscreened trial corpus', works, decisions: {reviewed_work_ids: [], excluded_work_ids: [], selectionReasons: evaluations, presetVersion: globalThis.BiblioMapCorpus.version, preset_applied: false, trial: true, searchedAt: startedAt}});
  for (const method of ['bibliographic_coupling', 'co_citation', 'direct_citation']) {
    const options = {method, counting: 'full', normalization: method === 'direct_citation' ? 'raw' : 'association_strength', minNode: method === 'co_citation' ? 3 : 1, minRaw: method === 'direct_citation' ? 1 : 2, resolution: 0.02, seed: 42, restarts: 10};
    const network = build(works, options);
    network.clustering = options._cluster_meta || {};
    const analysis = await store.create('analyses', {project_id: project.id, corpus_id: corpus.id, name: `Trial — ${method.replaceAll('_', ' ')}`, query: {...query, searchSpec: query}, search_snapshot: {works, total}, corpus: works, ref_coverage: referenceCoverage, parameters: {method, counting: options.counting, normalization: network.normalization, minNodeOccurrence: options.minNode, minRawEdgeCount: options.minRaw, clustering: network.clustering}, network, cited_works: citedWorks, view_state: {clusterMode: 'detailed'}});
    const groups = new Map();
    for (const node of network.nodes) {
      if (node.community == null) continue;
      if (!groups.has(node.community)) groups.set(node.community, []);
      groups.get(node.community).push(node);
    }
    const metadata = new Map([...works, ...Object.values(citedWorks)].map(work => [work.id, work]));
    const communities = [...groups].map(([community, nodes]) => ({community, works: nodes.length, examples: nodes.sort((left, right) => right.total_link_strength - left.total_link_strength).slice(0, 5).map(node => ({id: node.id, title: metadata.get(node.id)?.display_name || null, year: metadata.get(node.id)?.publication_year || null, total_link_strength: node.total_link_strength}))})).sort((left, right) => right.works - left.works || left.community - right.community);
    const native = await store.transaction(false, async tx => {
      const nodes = await tx.run('MATCH (:BMAnalysis {id: $id})-[:HAS_NODE]->(n) RETURN count(n) AS total', {id: analysis.id});
      const edges = await tx.run('MATCH (:BMNetworkNode)-[edge]->(:BMNetworkNode) WHERE edge.analysis_id = $id RETURN count(edge) AS total', {id: analysis.id});
      return {nodes: nodes.records[0].get('total'), edges: edges.records[0].get('total')};
    });
    if (native.nodes !== network.nodes.length || native.edges !== network.edges.length) throw new Error('Native graph counts do not match computed network');
    const summary = {method, analysis_id: analysis.id, stats: network.stats, community_count: groups.size, native_graph_verified: native, communities};
    summaries.push(summary);
    await writeFile(join(directory, `${method}.json`), JSON.stringify({summary, parameters: analysis.parameters, network}, null, 2));
    console.log(JSON.stringify({phase: 'saved', method, ...network.stats, communities: groups.size}));
  }
  const citations = await store.transaction(false, tx => tx.run('MATCH ()-[r:CITES {record_id: $id, role: "corpus"}]->() RETURN count(r) AS total', {id: corpus.id}));
  if (citations.records[0].get('total') !== referenceCoverage.indexed_reference_links) throw new Error('Raw citation count does not match source corpus');
  const summary = {status: 'complete', started_at: startedAt, completed_at: new Date().toISOString(), project_id: project.id, search_id: search.id, corpus_id: corpus.id, query, total_matches: total, reference_coverage: referenceCoverage, balanced_preset_preview: presetCounts, top_references: rankedReferences.slice(0, 20).map(([id, citing_works_in_sample]) => ({id, title: citedWorks[id]?.display_name || null, year: citedWorks[id]?.publication_year || null, citing_works_in_sample})), analyses: summaries, api_receipts: receipts, limitations: ['Only first 200 relevance-ranked results; not a full corpus or random sample.', 'Broad phrase search may match full text beyond titles and abstracts.', 'No works screened for substantive relevance; communities are unlabeled candidates for review.', 'Missing OpenAlex references and metadata can change observed network structure.', 'No semantic extraction or higher-order co-citation analysis was performed.']};
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  const lines = [`Adaptive leadership OpenAlex trial`, `Downloaded ${works.length} of ${total} matches.`, `Project: ${project.id}`, `Corpus: ${corpus.id}`, ``, `Reference coverage: ${referenceCoverage.with_references}/${works.length}; ${referenceCoverage.indexed_reference_links} indexed links; ${referenceCoverage.distinct_references} distinct references.`, `Balanced Core preview (not applied): ${JSON.stringify(presetCounts)}`, ``, ...summaries.flatMap(analysis => [`${analysis.method}: ${analysis.stats.nodes} nodes, ${analysis.stats.edges} links, ${analysis.community_count} communities, ${analysis.stats.isolated_nodes} isolated nodes.`, ...analysis.communities.slice(0, 8).map(group => `  Community ${group.community} (${group.works} works): ${group.examples.map(example => example.title || example.id).join(' | ')}`), '']), 'Limitations:', ...summary.limitations];
  await writeFile(join(directory, 'REPORT.txt'), lines.join('\n') + '\n');
  console.log(JSON.stringify({phase: 'complete', project_id: project.id, summary: join(directory, 'summary.json'), report: join(directory, 'REPORT.txt'), reference_coverage: referenceCoverage}));
} catch (error) {
  await writeFile(join(directory, 'failure.json'), JSON.stringify({status: 'failed', message: error.message, project_id: project?.id || null, completed_analyses: summaries, receipts}, null, 2));
  throw error;
} finally {
  await store.close();
}
