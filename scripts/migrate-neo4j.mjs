import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {resolve} from 'node:path';
import {Neo4jStore} from '../neo4j-store.mjs';
import assert from 'node:assert/strict';

const localPath = process.env.MIGRATION_LOCAL_DB;
if (!!process.env.DATABASE_URL === !!localPath) throw new Error('Set exactly one migration source: DATABASE_URL or MIGRATION_LOCAL_DB');
const source = localPath ? new PGlite(resolve(localPath)) : new pg.Pool({connectionString: process.env.DATABASE_URL});
const target = Neo4jStore.fromEnvironment();
const kinds = ['projects', 'searches', 'corpora', 'analyses'];
try {
  await target.init();
  const snapshots = {};
  const reader = localPath ? source : await source.connect();
  try {
    await reader.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      for (const kind of kinds) snapshots[kind] = (await reader.query(`SELECT * FROM ${kind} ORDER BY created_at, id`)).rows;
      await reader.query('COMMIT');
    } catch (error) {
      await reader.query('ROLLBACK');
      throw error;
    }
  } finally {
    if (!localPath) reader.release();
  }
  for (const kind of kinds) {
    let copied = 0;
    for (const row of snapshots[kind]) {
      await target.create(kind, row, {preserveIdentity: true});
      const expected = {...row, created_at: new Date(row.created_at).toISOString(), updated_at: new Date(row.updated_at).toISOString()};
      assert.deepEqual(await target.get(kind, row.id), expected, `Migration verification failed for ${kind}/${row.id}`);
      copied++;
    }
    console.log(`${kind}: ${copied} records copied or already identical`);
  }
  console.log(JSON.stringify(await target.integrity(), null, 2));
} finally {
  await Promise.allSettled([localPath ? source.close() : source.end(), target.close()]);
}
