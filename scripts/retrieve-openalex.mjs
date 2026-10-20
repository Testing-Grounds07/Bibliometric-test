import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Neo4jStore, graphRows} from '../neo4j-store.mjs';
import {OPENALEX_WORK_SELECT} from './openalex-request.mjs';

const output = resolve(process.argv[2] || '.trials/adaptive-leadership-full');
const checkpointPath = join(output, 'checkpoint.json');
const phrase = process.env.RETRIEVAL_QUERY || '"adaptive leadership"';
const projectName = process.env.RETRIEVAL_PROJECT_NAME || 'Adaptive leadership — full OpenAlex retrieval';
const fields = OPENALEX_WORK_SELECT;
const specification = {search: phrase, corpus: 'core', filter: process.env.RETRIEVAL_FILTER || 'type:article|review|book-chapter|conference-paper', per_page: '100', select: fields};
if (!process.env.OPENALEX_API_KEY) throw new Error('Set OPENALEX_API_KEY in the local environment file before starting the full download. Cursor paging requires a free activated OpenAlex key.');
await mkdir(output, {recursive: true});
async function readOptional(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(path, data) {
  await writeFile(path + '.tmp', JSON.stringify(data));
  await rename(path + '.tmp', path);
}
async function persistWorks(store, kind, record, works, role) {
  const existing = await store.driver.executeQuery('MATCH (n:BMRecord {id:$id}) RETURN n.id AS id', {id: record.id}, {database: store.database});
  if (!existing.records.length) await store.transaction(true, tx => store.writeIn(tx, kind, record, {observations: [], citations: [], networkNodes: [], networkEdges: []}));
  const progressKey = kind + '_saved_works';
  for (let offset = checkpoint[progressKey] || 0; offset < works.length; offset += 100) {
    const batch = works.slice(offset, offset + 100);
    const rows = graphRows(kind, {...record, ...(kind === 'searches' ? {result_snapshot: {works: batch}} : {works: batch})});
    for (const row of rows.observations) {
      const oldId = row.id;
      row.position += offset;
      row.id = JSON.stringify([record.id, role, row.position]);
      for (const citation of rows.citations) if (citation.observation_id === oldId) citation.observation_id = row.id;
    }
    await store.transaction(true, async tx => {
      await tx.run(`MATCH (record:BMRecord {id:$id}) UNWIND $rows AS row
        MERGE (work:BMWork {id:row.work_id}) SET work += row.properties
        MERGE (snapshot:BMObservation {id:row.id}) SET snapshot.record_id=$id,snapshot.role=row.role,snapshot.position=row.position,snapshot.payload=row.payload
        MERGE (record)-[:OBSERVED]->(snapshot) MERGE (snapshot)-[:REPRESENTS]->(work)`, {id:record.id,rows:rows.observations});
      for (let index=0;index<rows.citations.length;index+=2000) await tx.run(`UNWIND $rows AS row MATCH (source:BMWork {id:row.source})
        MERGE (target:BMWork {id:row.target})
        MERGE (source)-[:CITES {record_id:$id,observation_id:row.observation_id,role:row.role}]->(target)`, {id:record.id,rows:rows.citations.slice(index,index+2000)});
    });
    checkpoint[progressKey] = offset + batch.length;
    await save(checkpointPath, checkpoint);
    if (offset % 2000 === 0) console.log(JSON.stringify({phase:'save',kind,saved:checkpoint[progressKey],total:works.length}));
  }
}
let checkpoint = await readOptional(checkpointPath);
if (checkpoint && JSON.stringify(checkpoint.specification) !== JSON.stringify(specification)) throw new Error('Existing checkpoint has different search settings; choose another output directory');
checkpoint ||= {specification, started_at: new Date().toISOString(), cursor: '*', pages: 0, retrieved_rows: 0, first_total: null, download_complete: false, stored: false, project_id: randomUUID(), search_id: randomUUID(), corpus_id: randomUUID()};
await save(checkpointPath, checkpoint);
const wait = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds));
async function requestPage(cursor) {
  const target = new URL('https://api.openalex.org/works');
  target.search = new URLSearchParams({...specification, cursor}).toString();
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(target, {headers: {'User-Agent': 'BiblioMap/1.0 full retrieval', Authorization: `Bearer ${process.env.OPENALEX_API_KEY}`}, signal: AbortSignal.timeout(60000)});
    } catch (error) {
      if (attempt === 4) throw error;
      await wait(Math.min(30000, 1000 * 2 ** attempt));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 4) throw new Error(`OpenAlex ${response.status}; download is checkpointed and can be resumed`);
      const retry = response.headers.get('retry-after');
      const retrySeconds = retry && Number.isFinite(Number(retry)) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1000 : 0;
      await response.body?.cancel();
      await wait(Math.min(60000, Math.max(1000 * 2 ** attempt, retrySeconds * 1000 || 0)));
      continue;
    }
    if (!response.ok) throw new Error(`OpenAlex ${response.status}; check key activation, permissions and remaining budget. Saved pages remain available for resumption.`);
    const body = await response.json();
    if (!Array.isArray(body.results) || !body.meta || body.results.some(work => typeof work.id !== 'string' || !work.id)) throw new Error('Unexpected OpenAlex result shape');
    return {requested_cursor: cursor, request_url: target.toString(), received_at: new Date().toISOString(), response: body};
  }
}
while (!checkpoint.download_complete) {
  const pagePath = join(output, `page-${String(checkpoint.pages + 1).padStart(5, '0')}.json`);
  const page = await readOptional(pagePath) || await requestPage(checkpoint.cursor);
  if (page.requested_cursor !== checkpoint.cursor) throw new Error('Saved page does not match the checkpoint cursor');
  await save(pagePath, page);
  const {results, meta} = page.response;
  if (results.length && meta.next_cursor === checkpoint.cursor) throw new Error('OpenAlex returned a repeated cursor');
  checkpoint.first_total ??= meta.count;
  checkpoint.latest_total = meta.count;
  checkpoint.pages++;
  checkpoint.retrieved_rows += results.length;
  checkpoint.download_complete = !results.length || !meta.next_cursor;
  checkpoint.cursor = meta.next_cursor || null;
  checkpoint.updated_at = new Date().toISOString();
  await save(checkpointPath, checkpoint);
  console.log(JSON.stringify({phase: 'download', pages: checkpoint.pages, retrieved: checkpoint.retrieved_rows, initial_matches: checkpoint.first_total, complete: checkpoint.download_complete}));
  if (!checkpoint.download_complete) await wait(150);
}
const byId = new Map();
let cost = 0;
for (let index = 1; index <= checkpoint.pages; index++) {
  const page = await readOptional(join(output, `page-${String(index).padStart(5, '0')}.json`));
  if (!page) throw new Error(`Missing saved page ${index}`);
  for (const work of page.response.results) if (!byId.has(work.id)) byId.set(work.id, work);
  cost += page.response.meta.cost_usd || 0;
}
const works = [...byId.values()];
const coverage = {works: works.length, with_references: works.filter(work => work.referenced_works?.length).length, with_abstracts: works.filter(work => work.abstract_inverted_index).length, reference_links: works.reduce((sum, work) => sum + new Set(work.referenced_works || []).size, 0)};
await save(join(output, 'works.json'), works);
if (!checkpoint.stored) {
  const store = Neo4jStore.fromEnvironment();
  const identity = {created_at: checkpoint.started_at, updated_at: checkpoint.started_at};
  const query = {query: phrase, mode: 'search', searchedAt: checkpoint.started_at, openalexCorpus: 'core', retrieval: 'cursor_exhaustion', filter: specification.filter, workTypes: ['article', 'review', 'book-chapter', 'conference-paper']};
  try {
    await store.init();
    await store.create('projects', {...identity, id: checkpoint.project_id, name: projectName, description: 'All available phrase matches retrieved by cursor. Filter: ' + specification.filter + '. No additional screening or preset exclusions applied.'}, {preserveIdentity: true});
    await persistWorks(store, 'searches', {...identity, id: checkpoint.search_id, project_id: checkpoint.project_id, name: 'Full ' + phrase + ' phrase search', query, result_snapshot: {works, total: checkpoint.first_total, exhausted: true}, result_count: works.length}, works, 'search');
    await store.driver.executeQuery('MATCH (s:BMSearch {id:$id}) SET s.workspace_summary=$summary', {id: checkpoint.search_id, summary: JSON.stringify({...query, retrieved: works.length, exhausted: true})}, {database: store.database});
    await persistWorks(store, 'corpora', {...identity, id: checkpoint.corpus_id, project_id: checkpoint.project_id, search_id: checkpoint.search_id, name: 'Full unscreened ' + phrase + ' corpus', version: 1, works, decisions: {reviewed_work_ids: [], excluded_work_ids: [], preset_applied: false, searchedAt: checkpoint.started_at, retrieval_complete: true}}, works, 'corpus');
    const citations = await store.transaction(false, tx => tx.run('MATCH ()-[citation:CITES {record_id: $id, role: "corpus"}]->() RETURN count(citation) AS total', {id: checkpoint.corpus_id}));
    if (citations.records[0].get('total') !== coverage.reference_links) throw new Error('Stored native citations do not match the downloaded corpus');
    checkpoint.stored = true;
    await save(checkpointPath, checkpoint);
  } finally { await store.close(); }
}
const summary = {status: 'complete', project_id: checkpoint.project_id, search_id: checkpoint.search_id, corpus_id: checkpoint.corpus_id, initial_matches: checkpoint.first_total, latest_matches: checkpoint.latest_total, retrieved_rows: checkpoint.retrieved_rows, duplicate_rows: checkpoint.retrieved_rows - works.length, pages: checkpoint.pages, reported_api_cost_usd: cost, coverage, started_at: checkpoint.started_at, completed_at: new Date().toISOString(), limitations: ['Live OpenAlex results can change during retrieval; cursor exhaustion is not an immutable snapshot guarantee.', 'Full-text phrase matches have not been screened for relevance.', 'Indexed references can be missing. No derived network was recalculated automatically.']};
await save(join(output, 'summary.json'), summary);
console.log(JSON.stringify(summary, null, 2));
