import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {Neo4jStore} from './neo4j-store.mjs';
import {build} from './analysis-engine.mjs';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Neo4j persistence, graph provenance, API compatibility and deletion rules', {skip: !process.env.NEO4J_TEST_URI}, async () => {
  const environment = {NEO4J_URI: process.env.NEO4J_TEST_URI, NEO4J_USERNAME: process.env.NEO4J_TEST_USERNAME, NEO4J_PASSWORD: process.env.NEO4J_TEST_PASSWORD, NEO4J_DATABASE: process.env.NEO4J_TEST_DATABASE || 'neo4j'};
  const store = Neo4jStore.fromEnvironment(environment);
  const prefix = `test:${randomUUID()}:`;
  let project, otherProject, server, migrationDirectory;
  try {
    await store.init();
    project = await store.create('projects', {name: prefix});
    otherProject = await store.create('projects', {name: prefix + 'other'});
    const works = [{id: prefix + 'A', display_name: 'Original A', referenced_works: [prefix + 'R1', prefix + 'R2']}, {id: prefix + 'B', referenced_works: [prefix + 'R1', prefix + 'R2']}];
    const search = await store.create('searches', {project_id: project.id, query: {mode: 'exact', query: 'test'}, result_snapshot: {works, total: 5}, result_count: 2});
    const corpus = await store.create('corpora', {project_id: project.id, search_id: search.id, works, decisions: {reviewed_work_ids: [works[0].id], presetVersion: 'test'}});
    await assert.rejects(store.create('corpora', {project_id: otherProject.id, search_id: search.id, works}), /same project/);
    const network = build(works, {method: 'co_citation', minNode: 1, minRaw: 1, restarts: 1});
    const input = {project_id: project.id, corpus_id: corpus.id, corpus: works, search_snapshot: {works, total: 5}, network, cited_works: {[prefix + 'R1']: {id: prefix + 'R1', display_name: 'Reference 1'}}, view_state: {minVisibleLink: 0.5}, parameters: {method: 'co_citation'}};
    const analysis = await store.create('analyses', input);
    const other = await store.create('analyses', {...input, network: {...network, edges: network.edges.map(edge => ({...edge, raw_weight: 99}))}});
    assert.deepEqual(await store.get('analyses', analysis.id), analysis);
    assert.deepEqual(await store.get('corpora', corpus.id), corpus);
    const reconnected = Neo4jStore.fromEnvironment(environment);
    try { assert.deepEqual(await reconnected.get('analyses', analysis.id), analysis); }
    finally { await reconnected.close(); }
    const relationshipCounts = await store.transaction(false, tx => tx.run(`MATCH (a:BMAnalysis {id: $id})-[:HAS_NODE]->(n)-[r:CO_CITED_WITH]->() RETURN count(r) AS total, sum(r.raw_weight) AS weight`, {id: analysis.id}));
    assert.equal(relationshipCounts.records[0].get('total'), network.edges.length);
    assert.equal(relationshipCounts.records[0].get('weight'), 2);
    const rawCitations = await store.transaction(false, tx => tx.run('MATCH (w:BMWork {id: $id})-[r:CITES {record_id: $recordId, role: "corpus"}]->(target) RETURN target.id AS target', {id: works[0].id, recordId: corpus.id}));
    assert.deepEqual(rawCitations.records.map(row => row.get('target')).sort(), [prefix + 'R1', prefix + 'R2']);
    await assert.rejects(store.delete('corpora', corpus.id), error => error.status === 409);
    const invalid = {...analysis, id: randomUUID(), corpus_id: randomUUID()};
    await assert.rejects(store.create('analyses', invalid, {preserveIdentity: true}), /same project/);
    assert.equal(await store.get('analyses', invalid.id), null);
    const imported = {...search, id: randomUUID(), name: 'Imported'};
    await store.create('searches', imported, {preserveIdentity: true});
    await store.create('searches', imported, {preserveIdentity: true});
    await assert.rejects(store.create('searches', {...imported, name: 'Changed'}, {preserveIdentity: true}), /different data/);
    migrationDirectory = await mkdtemp(join(tmpdir(), 'bibliomap-migration-'));
    const source = new PGlite(migrationDirectory);
    try {
      await source.exec(`
        CREATE TABLE projects(id text, name text, description text, created_at timestamptz, updated_at timestamptz);
        CREATE TABLE searches(id text, project_id text, name text, query jsonb, result_snapshot jsonb, result_count integer, created_at timestamptz, updated_at timestamptz);
        CREATE TABLE corpora(id text, project_id text, search_id text, name text, version integer, works jsonb, decisions jsonb, created_at timestamptz, updated_at timestamptz);
        CREATE TABLE analyses(id text, project_id text, corpus_id text, name text, query jsonb, search_snapshot jsonb, corpus jsonb, ref_coverage jsonb, parameters jsonb, network jsonb, cited_works jsonb, view_state jsonb, created_at timestamptz, updated_at timestamptz);
      `);
      for (const [kind, record] of [['projects', project], ['searches', search], ['corpora', corpus], ['analyses', analysis], ['analyses', other]]) {
        const fields = Object.keys(record);
        const values = fields.map(field => typeof record[field] === 'object' && record[field] !== null ? JSON.stringify(record[field]) : record[field]);
        await source.query(`INSERT INTO ${kind} (${fields.join(',')}) VALUES (${fields.map((field, position) => '$' + (position + 1)).join(',')})`, values);
      }
    } finally { await source.close(); }
    await store.delete('projects', project.id);
    for (let attempt = 0; attempt < 2; attempt++) {
      const migration = spawn(process.execPath, ['scripts/migrate-neo4j.mjs'], {cwd: import.meta.dirname, env: {...process.env, ...environment, DATABASE_URL: '', MIGRATION_LOCAL_DB: migrationDirectory}, stdio: ['ignore', 'pipe', 'pipe']});
      let output = '';
      migration.stdout.on('data', chunk => { output += chunk; });
      migration.stderr.on('data', chunk => { output += chunk; });
      const [exitCode] = await once(migration, 'exit');
      assert.equal(exitCode, 0, output);
      assert.match(output, /analyses: 2 records copied or already identical/);
    }
    assert.deepEqual(await store.get('analyses', analysis.id), analysis);
    const importedCitations = await store.transaction(false, tx => tx.run('MATCH ()-[r:CITES {record_id: $id, role: "corpus"}]->() RETURN count(r) AS total', {id: corpus.id}));
    assert.equal(importedCitations.records[0].get('total'), 4);
    const listener = net.createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    server = spawn(process.execPath, ['server.mjs'], {cwd: import.meta.dirname, env: {...process.env, ...environment, STORAGE_BACKEND: 'neo4j', NODE_ENV: 'production', PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe']});
    let errors = '';
    server.stderr.on('data', chunk => { errors += chunk; });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode != null) throw new Error(`Server exited: ${errors}`);
      try { ready = (await fetch(base + '/health')).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, errors);
    assert.deepEqual(await (await fetch(base + '/api/analyses/' + analysis.id)).json(), analysis);
    const listed = await (await fetch(base + '/api/analyses?project_id=' + project.id)).json();
    assert.equal(listed.analyses.length, 2);
    const conflict = await fetch(base + '/api/corpora/' + corpus.id, {method: 'DELETE'});
    assert.equal(conflict.status, 409);
    const compute = await fetch(base + '/api/compute', {method: 'POST', body: JSON.stringify({corpus: works, method: 'co_citation', min_node_occurrence: 1, min_raw_edge_count: 1, restarts: 1})});
    assert.equal(compute.status, 200);
    assert.deepEqual((await compute.json()).network.edges, network.edges);
    const updated = await fetch(base + '/api/analyses/' + analysis.id, {method: 'PATCH', body: JSON.stringify({name: 'Renamed', view_state: {minVisibleLink: 1}})});
    assert.equal(updated.status, 200);
    assert.deepEqual((await store.get('analyses', analysis.id)).network, network);
    assert.equal((await store.list('projects')).find(item => item.id === project.id).analysis_count, 2);
    const integrity = await (await fetch(base + '/api/db-integrity')).json();
    assert.equal(integrity.storage, 'neo4j');
    assert(Object.values(integrity.integrity).every(value => value === 0));
    await store.transaction(true, tx => tx.run('UNWIND $ids AS id MATCH (analysis:BMAnalysis {id: id}) CREATE (bundle:BMCoCitationBundle {id: id + ":test-bundle", analysis_id: id}) CREATE (analysis)-[:HAS_COCITATION_BUNDLE]->(bundle)', {ids: [analysis.id, other.id]}));
    await store.delete('analyses', analysis.id);
    const remainingBundles = await store.transaction(false, tx => tx.run('MATCH (bundle:BMCoCitationBundle) WHERE bundle.analysis_id IN $ids RETURN bundle.analysis_id AS id', {ids: [analysis.id, other.id]}));
    assert.deepEqual(remainingBundles.records.map(row => row.get('id')), [other.id]);
    assert.deepEqual((await store.get('analyses', other.id)).network.edges.map(edge => edge.raw_weight), [99]);
    await store.delete('searches', search.id);
    assert.equal((await store.get('corpora', corpus.id)).search_id, null);
    await store.delete('analyses', other.id);
    await store.delete('corpora', corpus.id);
  } finally {
    if (server && server.exitCode == null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    if (project) await store.delete('projects', project.id);
    if (otherProject) await store.delete('projects', otherProject.id);
    if (migrationDirectory) await rm(migrationDirectory, {recursive: true, force: true});
    await store.transaction(true, async tx => {
      await tx.run('MATCH (w:BMWork) WHERE w.id STARTS WITH $prefix DETACH DELETE w', {prefix});
    });
    await store.close();
  }
});
