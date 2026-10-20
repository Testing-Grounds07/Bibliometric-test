import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Neo4jStore} from '../neo4j-store.mjs';
import {deduplicateWorks, referenceMetadataCandidates} from './work-deduplication.mjs';

const folder = process.argv[2];
if (!folder) throw Error('Specify a completed retrieval directory.');
const retrieval = JSON.parse(fs.readFileSync(path.join(folder, 'summary.json'), 'utf8'));
if (retrieval.status !== 'complete') throw Error('Only complete retrievals can be cleaned.');
const raw = fs.readFileSync(path.join(folder, 'works.json'));
const works = JSON.parse(raw.toString('utf8'));
const sourceHash = createHash('sha256').update(raw).digest('hex');
const output = path.join('.trials/workspace-search-cleanups', retrieval.search_id);
fs.mkdirSync(output, {recursive: true});
const candidates = referenceMetadataCandidates(works, 10), metadata = new Map(works.map(work => [work.id, work]));
for (const name of fs.readdirSync('.trials/conservative-cocitation').filter(name => /^reference-metadata-.*\.json$/.test(name))) for (const work of JSON.parse(fs.readFileSync('.trials/conservative-cocitation/' + name)).results || []) if (!metadata.has(work.id)) metadata.set(work.id, work);
const cachedFile = path.join(output, 'reference-metadata.json');
if (fs.existsSync(cachedFile)) for (const work of JSON.parse(fs.readFileSync(cachedFile, 'utf8'))) metadata.set(work.id, work);
const missing = candidates.ids.filter(id => !metadata.get(id)?.type);
for (let offset = 0; offset < missing.length; offset += 100) {
 const ids = missing.slice(offset, offset + 100), filename = path.join(output, 'metadata-' + createHash('sha256').update(JSON.stringify(ids)).digest('hex') + '.json');
 let result;
 if (fs.existsSync(filename)) result = JSON.parse(fs.readFileSync(filename, 'utf8'));
 else {
  if (!process.env.OPENALEX_API_KEY) throw Error('Set OPENALEX_API_KEY before requesting reference metadata.');
  const url = new URL('https://api.openalex.org/works');
  url.search = new URLSearchParams({filter: 'openalex:' + ids.map(id => id.split('/').pop()).join('|'), per_page: 100, select: 'id,display_name,publication_year,authorships,doi,type,abstract_inverted_index'}).toString();
  const response = await fetch(url, {headers: {Authorization: 'Bearer ' + process.env.OPENALEX_API_KEY}, signal: AbortSignal.timeout(60000)});
  if (!response.ok) throw Error('OpenAlex metadata request failed (' + response.status + '); completed batches are retained for resumption.');
  result = await response.json(); fs.writeFileSync(filename, JSON.stringify(result));
 }
 for (const work of result.results) metadata.set(work.id, work);
 console.log(JSON.stringify({phase: 'metadata', processed: Math.min(offset + 100, missing.length), requested: missing.length}));
}
const references = new Set(works.flatMap(work => work.referenced_works || []));
const referenceMetadata = [...metadata.values()].filter(work => references.has(work.id));
fs.writeFileSync(cachedFile, JSON.stringify(referenceMetadata));
const prepared = deduplicateWorks(works, referenceMetadata), sourceIds = new Set(works.map(work => work.id));
const sourceGroups = prepared.audit.mergedGroups.filter(group => group.records.filter(record => sourceIds.has(record.id)).length > 1);
const referenceGroups = prepared.audit.mergedGroups.filter(group => group.records.filter(record => references.has(record.id)).length > 1);
const beforeLinks = works.reduce((sum, work) => sum + new Set(work.referenced_works || []).size, 0), afterLinks = prepared.works.reduce((sum, work) => sum + work.referenced_works.length, 0);
const summary = {originalSources: works.length, cleanedSources: prepared.works.length, sourceDuplicateGroups: sourceGroups.length, referenceDuplicateGroups: referenceGroups.length, originalReferenceLinks: beforeLinks, cleanedReferenceLinks: afterLinks, referenceCandidates: candidates.candidates, requestedReferenceMetadata: candidates.ids.length, availableRequestedReferenceMetadata: candidates.ids.filter(id => metadata.has(id)).length, inspectedReferenceMetadata: referenceMetadata.length, candidateMinimumFrequency: candidates.minimumFrequency, limited: candidates.candidates > candidates.ids.length, limitation: 'All retrieved source titles were checked. Reference matching uses available source/cached metadata plus the 5,000 most frequent candidates cited at least five times. Unresolved IDs and uninspected lower-frequency references remain separate. No topical relevance screening is implied.'};
const cleanup = {version: 1, completedAt: new Date().toISOString(), projectId: retrieval.project_id, searchId: retrieval.search_id, originalCorpusId: retrieval.corpus_id, sourceDataSha256: sourceHash, summary, audit: prepared.audit};
const store = Neo4jStore.fromEnvironment();
try {
 await store.init();
 const found = await store.driver.executeQuery('MATCH (s:BMSearch {id:$searchId,project_id:$projectId}) OPTIONAL MATCH (s)-[:OBSERVED]->(o:BMObservation) RETURN s.workspace_summary AS summary,count(o) AS sources', {searchId: retrieval.search_id, projectId: retrieval.project_id}, {database: store.database});
 if (found.records.length !== 1 || found.records[0].get('sources') !== works.length) throw Error('Stored search does not match the completed retrieval. No cleanup was applied.');
 const searchSummary = JSON.parse(found.records[0].get('summary') || '{}');
 const result = await store.driver.executeQuery('MATCH (s:BMSearch {id:$searchId,project_id:$projectId}) SET s.workspace_cleanup=$cleanup,s.workspace_summary=$summary RETURN s.id AS id', {searchId: retrieval.search_id, projectId: retrieval.project_id, cleanup: JSON.stringify(cleanup), summary: JSON.stringify({...searchSummary, cleanup: summary})}, {database: store.database});
 if (result.records.length !== 1) throw Error('Cleanup registration failed.');
 fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify(cleanup, null, 2));
 console.log(JSON.stringify({status: 'complete', projectId: retrieval.project_id, searchId: retrieval.search_id, ...summary}));
} finally { await store.close(); }
