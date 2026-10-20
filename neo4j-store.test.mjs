import assert from 'node:assert/strict';
import test from 'node:test';
import {graphRows, Neo4jStore} from './neo4j-store.mjs';

test('raw citations retain snapshot provenance and deduplicate repeated references', () => {
  const work = {id: 'A', display_name: 'First observation', referenced_works: ['B', 'B', 'C']};
  const rows = graphRows('analyses', {id: 'run1', search_snapshot: {works: [work]}, corpus: [{...work, display_name: 'Later observation'}], cited_works: {B: {id: 'B'}}});
  assert.equal(rows.observations.length, 3);
  assert.equal(rows.citations.length, 4);
  assert.equal(new Set(rows.observations.map(row => row.id)).size, 3);
  assert.deepEqual(rows.citations.map(row => row.role), ['search', 'search', 'corpus', 'corpus']);
  assert.deepEqual(JSON.parse(rows.observations[0].payload), work);
  assert.notEqual(rows.observations[0].payload, rows.observations[1].payload);
});

test('computed nodes and weighted links are scoped to the saved analysis', () => {
  const network = {method: 'co_citation', nodes: [{id: 'A', community: 0}, {id: 'B', community: 1}], edges: [{source: 'A', target: 'B', raw_weight: 2, normalized_weight: 0.5, weight: 0.5}]};
  const first = graphRows('analyses', {id: 'run1', network});
  const second = graphRows('analyses', {id: 'run2', network});
  assert.notEqual(first.networkNodes[0].id, second.networkNodes[0].id);
  assert.equal(first.networkType, 'CO_CITED_WITH');
  assert.equal(first.networkNodes[0].properties.community, 0);
  assert.equal(first.networkEdges[0].properties.raw_weight, 2);
  assert.equal(first.networkEdges[0].source, first.networkNodes[0].id);
  assert.equal(graphRows('analyses', {id: 'run3', network: {...network, method: 'direct_citation'}}).networkType, 'DIRECT_CITATION');
  assert.equal(graphRows('analyses', {id: 'run4', network: {...network, method: 'bibliographic_coupling'}}).networkType, 'SHARES_REFERENCES');
});

test('rejects graph corruption before opening a write transaction', () => {
  assert.throws(() => graphRows('corpora', {id: 'c', works: [{}]}), /must have an ID/);
  assert.throws(() => graphRows('corpora', {id: 'c', works: [{id: 'A', referenced_works: [null]}]}), /Reference IDs/);
  assert.throws(() => graphRows('analyses', {id: 'a', network: {nodes: [{id: 'A'}, {id: 'A'}]}}), /unique/);
  assert.throws(() => graphRows('analyses', {id: 'a', network: {method: 'co_citation', nodes: [{id: 'A'}], edges: [{source: 'A', target: 'missing'}]}}), /endpoints/);
  assert.throws(() => Neo4jStore.fromEnvironment({NEO4J_URI: 'bolt://localhost'}), /NEO4J_USERNAME/);
});
