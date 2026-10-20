import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Neo4jStore} from '../neo4j-store.mjs';
import '../public/corpus-presets.js';

const directory = resolve('.trials/adaptive-leadership-scholarly-filter');
await mkdir(directory, {recursive: true});
async function optional(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(name, value) { await writeFile(join(directory, name), JSON.stringify(value, null, 2)); }
const original = JSON.parse(await readFile('.trials/adaptive-leadership-full/works.json', 'utf8'));
const source = JSON.parse(await readFile('.trials/adaptive-leadership-full/summary.json', 'utf8'));
const evaluations = Object.fromEntries(original.map(work => [work.id, globalThis.BiblioMapCorpus.evaluate(work, 'inclusive')]));
const candidates = original.filter(work => evaluations[work.id].status !== 'included' && work.is_retracted !== true);
const metadata = new Map();
for (let offset = 0; offset < candidates.length; offset += 100) {
  const name = `venue-metadata-${String(offset / 100 + 1).padStart(3, '0')}.json`;
  let receipt = await optional(join(directory, name));
  if (!receipt) {
    const url = new URL('https://api.openalex.org/works');
    url.search = new URLSearchParams({filter: 'openalex:' + candidates.slice(offset, offset + 100).map(work => work.id.split('/').pop()).join('|'), per_page: '100', select: 'id,type,is_retracted,primary_location,locations'}).toString();
    const headers = {'User-Agent': 'BiblioMap/1.0 venue screening'};
    if (process.env.OPENALEX_API_KEY) headers.Authorization = `Bearer ${process.env.OPENALEX_API_KEY}`;
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(url, {headers, signal: AbortSignal.timeout(60000)});
      if (response.status !== 429 && response.status < 500) break;
      await response.body?.cancel();
      await new Promise(resolveWait => setTimeout(resolveWait, 1000 * 2 ** attempt));
    }
    if (!response.ok) throw new Error(`OpenAlex venue lookup returned ${response.status}`);
    receipt = {requested_ids: candidates.slice(offset, offset + 100).map(work => work.id), requested_at: new Date().toISOString(), response: await response.json()};
    await save(name, receipt);
  }
  for (const work of receipt.response.results) metadata.set(work.id, work);
  console.log(JSON.stringify({phase: 'venue_check', checked: Math.min(offset + 100, candidates.length), candidates: candidates.length}));
}
const selected = [], review = [], excluded = [], decisions = {}, overrides = [];
for (const work of original) {
  const evaluation = evaluations[work.id];
  const fresh = metadata.get(work.id);
  if (work.is_retracted === true || fresh?.is_retracted === true) {
    excluded.push(work);
    decisions[work.id] = {decision: 'excluded', reasons: ['Known retraction'], preset: evaluation, human_validated: false};
    continue;
  }
  if (evaluation.status === 'included') {
    selected.push(work);
    decisions[work.id] = {decision: 'included', reasons: ['Passes Inclusive Scholarly metadata rules'], preset: evaluation, human_validated: false};
    continue;
  }
  const alternate = (fresh?.locations || []).find(location =>
    location.source?.id && ['publishedVersion', 'acceptedVersion'].includes(location.version) &&
    globalThis.BiblioMapCorpus.evaluate({...work, primary_location: location}, 'inclusive').status === 'included');
  if (alternate) {
    selected.push(work);
    overrides.push(work.id);
    decisions[work.id] = {decision: 'included', reasons: ['Alternate published/accepted location passes Inclusive Scholarly source rules'], preset: evaluation, override: true, evidence: alternate, checked_at: new Date().toISOString(), human_validated: false};
  } else {
    review.push(work);
    decisions[work.id] = {decision: 'needs_review', reasons: [...evaluation.reasons, ...evaluation.unknown], preset: evaluation, metadata_found: !!fresh, alternate_locations_checked: fresh?.locations?.length || 0, human_validated: false};
  }
}
assert.equal(selected.length + review.length + excluded.length, original.length);
assert.equal(new Set([...selected, ...review, ...excluded].map(work => work.id)).size, original.length);
const coverage = works => ({works: works.length, with_references: works.filter(work => work.referenced_works?.length).length, reference_links: works.reduce((sum, work) => sum + new Set(work.referenced_works || []).size, 0)});
let identity = await optional(join(directory, 'identity.json'));
identity ||= {selected_id: randomUUID(), review_id: randomUUID(), created_at: new Date().toISOString()};
await save('identity.json', identity);
await save('screening-decisions.json', decisions);
const store = Neo4jStore.fromEnvironment();
const native = {};
try {
  await store.init();
  const originalRecord = await store.get('corpora', source.corpus_id);
  assert.equal(originalRecord.works.length, original.length);
  assert.deepEqual(originalRecord.works, original);
  for (const [name, id, works, version, reviewOnly] of [
    ['Inclusive Scholarly — metadata-screened', identity.selected_id, selected, 2, false],
    ['Scholarly status — needs venue review', identity.review_id, review, 3, true]
  ]) {
    const corpus = await store.create('corpora', {
      id, project_id: source.project_id, search_id: source.search_id, name, version, works,
      created_at: identity.created_at, updated_at: identity.created_at,
      decisions: {
        derived_from_corpus_id: source.corpus_id, corpusPreset: 'inclusive', presetVersion: globalThis.BiblioMapCorpus.version,
        presetOverrideIds: reviewOnly ? review.map(work => work.id) : overrides,
        reviewed_work_ids: [], excluded_work_ids: reviewOnly ? excluded.map(work => work.id) : [...review, ...excluded].map(work => work.id),
        selectionReasons: evaluations, screening_decisions: decisions, automated_metadata_screening: true,
        review_only: reviewOnly, review_pending_ids: review.map(work => work.id), human_validated: false,
        screening_policy: 'Inclusive Scholarly primary-source rules; retain alternate published/accepted scholarly venues with recorded evidence; quarantine other venue uncertainties; exclude known retractions. No minimum citation/reference/DOI/abstract/affiliation requirement. No topical relevance screening.'
      }
    }, {preserveIdentity: true});
    const result = await store.transaction(false, async tx => {
      const nodes = await tx.run('MATCH (:BMCorpus {id: $id})-[:OBSERVED]->(o)-[:REPRESENTS]->(w) RETURN count(o) AS observations, count(DISTINCT w.id) AS works', {id});
      const links = await tx.run('MATCH ()-[r:CITES {record_id: $id, role: "corpus"}]->() RETURN count(r) AS citations', {id});
      return {...nodes.records[0].toObject(), ...links.records[0].toObject()};
    });
    assert.equal(result.works, works.length);
    assert.equal(result.observations, works.length);
    assert.equal(result.citations, coverage(works).reference_links);
    assert.deepEqual((await store.get('corpora', corpus.id)).works, works);
    native[reviewOnly ? 'review' : 'selected'] = result;
  }
  const after = await store.get('corpora', source.corpus_id);
  assert.deepEqual(after, originalRecord);
} finally { await store.close(); }
const venueCounts = new Map();
for (const work of review) {
  const venue = work.primary_location?.source;
  const id = venue?.id || 'unknown';
  if (!venueCounts.has(id)) venueCounts.set(id, {id, name: venue?.display_name || 'Missing source metadata', type: venue?.type || 'unknown', works: 0, examples: []});
  const entry = venueCounts.get(id);
  entry.works++;
  if (entry.examples.length < 3) entry.examples.push({id: work.id, title: work.display_name});
}
await save('venue-review-queue.json', [...venueCounts.values()].sort((left, right) => right.works - left.works));
const summary = {
  status: 'complete', original_corpus_id: source.corpus_id, original_works: original.length,
  selected_corpus_id: identity.selected_id, selected: coverage(selected), review_corpus_id: identity.review_id, needs_review: coverage(review),
  excluded_retracted: excluded.length, recovered_from_alternate_venues: overrides.length, metadata_lookups_returned: metadata.size,
  original_preserved: true, native_graph_verification: native,
  limitations: ['Metadata-based eligibility, not verified peer review or a claim that all retained papers are academic.', 'Uncertain venues are separated for review, not classified as non-academic.', 'No human topical relevance decisions or network recalculation performed.']
};
await save('summary.json', summary);
console.log(JSON.stringify(summary, null, 2));
