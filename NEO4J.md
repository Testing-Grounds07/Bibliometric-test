# Neo4j storage

The OpenAlex API, corpus presets, network calculations, Leiden clustering, and
browser API remain the same. Neo4j mode stores projects, saved searches, corpus
versions, analysis snapshots, works, citations, and computed networks in Neo4j.
It does not open PostgreSQL or `.local-db/` in this mode.

## Start locally

Requires Node.js 20.11 or later and a Neo4j 5.26+ database. Use an existing
database (including Aura), or start the supplied Docker Compose service.
For PowerShell:

```powershell
npm ci
$env:NEO4J_PASSWORD = 'your-own-strong-password'
docker compose -f compose.neo4j.yaml up -d
$env:STORAGE_BACKEND = 'neo4j'
$env:NEO4J_URI = 'bolt://localhost:7687'
$env:NEO4J_USERNAME = 'neo4j'
$env:NEO4J_DATABASE = 'neo4j'
npm start
```

Open <http://localhost:3000> for BiblioMap and <http://localhost:7474> for Neo4j
Browser. The Compose service binds only to localhost and keeps its data in a
named volume. Changing the environment password does not change a password
already stored in an existing volume. Do not remove the volume to reset a
password if it contains data you need.

For a hosted database, set `NEO4J_URI` to its supplied address (typically
`neo4j+s://...`) and use its credentials. Set these as deployment environment
variables along with `STORAGE_BACKEND=neo4j` and `NODE_ENV=production`.
`DATABASE_URL` is unnecessary in Neo4j mode. The app creates uniqueness
constraints at startup, so its database user needs schema privileges on the
chosen database. A connection/configuration failure stops startup; it never
silently switches storage backends. `.env.example` documents the variables;
the app does not load `.env` files automatically.

For backward compatibility, an unconfigured checkout uses the existing local
PGlite database. A configured `NEO4J_URI` selects Neo4j automatically, or set
`STORAGE_BACKEND` explicitly to `neo4j` or `postgres`.

## Graph model

| Node | Purpose |
| --- | --- |
| `BMProject` | Project identity and metadata |
| `BMSearch` | Saved query and retrieved results |
| `BMCorpus` | Versioned selection and screening decisions |
| `BMAnalysis` | Parameters, coverage, computed network and display settings |
| `BMWork` | Shared scholarly work identity, keyed by OpenAlex ID |
| `BMObservation` | Exact work metadata as saved in one search/corpus/analysis |
| `BMNetworkNode` | One work's metrics and community in a particular analysis |

All four saved record types also carry `BMRecord`. A project's `HAS_SEARCH`,
`HAS_CORPUS`, and `HAS_ANALYSIS` relationships identify its records. `FROM_SEARCH`
and `USES_CORPUS` preserve dependencies.

`(record)-[:OBSERVED]->(observation)-[:REPRESENTS]->(work)` preserves the role
(`search`, `corpus`, `cited`) and array position. Selected work properties such
as title, DOI, publication year, and type are also native properties on `BMWork`.
The shared work properties reflect the last supplied non-null values, not a
claim that the observation is chronologically newest. Exact historical metadata
remains on each observation, including authorships, topics, abstracts and source
metadata as JSON. These nested entities are not separately normalized into
author/topic/source nodes in this version.

`(work)-[:CITES]->(reference)` represents actual indexed references. Each edge
records `record_id`, `observation_id`, and `role`. Saving the same work in
multiple snapshots intentionally creates separate citation observations; filter
to one record/role or use distinct pairs when counting citations. A cited work
can exist with only its ID when OpenAlex metadata has not been retrieved.

`(analysis)-[:HAS_NODE]->(networkNode)-[:REPRESENTS]->(work)` scopes node metrics
and community assignments to an analysis. Computed relationships connect these
analysis-specific nodes:

| Relationship | Method |
| --- | --- |
| `CO_CITED_WITH` | Co-citation |
| `SHARES_REFERENCES` | Bibliographic coupling |
| `DIRECT_CITATION` | Direct citation |

These edges store raw, normalized and active weights, analysis ID, position,
and the exact original edge payload. Co-citation and coupling are mathematically
undirected; their stored direction is an implementation ordering. Match them
without an arrow. Direct citations retain their source-to-target direction.

Each record also retains a JSON payload for exact browser/API round trips,
including unknown nested settings. These snapshots and the native graph are
written in the same transaction. Writes are serialized with a store lock to
protect parent/deletion rules. Saved networks are immutable through the app;
renames and display changes update only the record. Direct manual edits in
Neo4j do not rewrite snapshot payloads or recalculate bibliometric results.

Deleting a search unlinks its corpora. Deleting a corpus used by an analysis is
blocked. Deleting a project cascades its records and scoped graph data.
Shared `BMWork` identities remain, even if no saved record still uses them;
deletion does not erase scholarly identities another project may need.

## Example queries

In Neo4j Browser, set a saved corpus or analysis UUID:

```cypher
:param corpusId => 'saved-corpus-uuid'
:param analysisId => 'saved-analysis-uuid'
```

Actual references recorded in one corpus:

```cypher
MATCH (work:BMWork)-[citation:CITES]->(reference:BMWork)
WHERE citation.record_id = $corpusId AND citation.role = 'corpus'
RETURN DISTINCT work, reference
LIMIT 100;
```

Strongest co-citation links in one analysis:

```cypher
MATCH (a:BMAnalysis {id: $analysisId})-[:HAS_NODE]->(left:BMNetworkNode)
MATCH (left)-[link:CO_CITED_WITH]->(right:BMNetworkNode)
MATCH (left)-[:REPRESENTS]->(first:BMWork)
MATCH (right)-[:REPRESENTS]->(second:BMWork)
RETURN first.id, second.id, link.raw_weight, link.normalized_weight
ORDER BY link.raw_weight DESC
LIMIT 25;
```

Community membership:

```cypher
MATCH (:BMAnalysis {id: $analysisId})-[:HAS_NODE]->(node:BMNetworkNode)
MATCH (node)-[:REPRESENTS]->(work:BMWork)
RETURN node.community, work.id, work.display_name, node.total_link_strength
ORDER BY node.community, node.total_link_strength DESC;
```

## Migrate existing saved data

Back up the source database and pause app writes while migrating and switching
backends. Configure the target Neo4j variables above. Set **one** source:

```powershell
$env:DATABASE_URL = 'postgresql://...'
npm run migrate:neo4j
```

Or, with the local app stopped and `DATABASE_URL` unset:

```powershell
$env:MIGRATION_LOCAL_DB = 'C:\path\to\Bibliometric-test\.local-db'
npm run migrate:neo4j
```

The migration reads a consistent SQL snapshot, copies parent records first,
preserves IDs/timestamps and all saved fields, and builds native graph nodes
and relationships. It rereads and compares each saved record with its source.
Reruns skip identical IDs; a conflicting existing ID stops migration instead
of overwriting data. Each record imports atomically, so an interrupted import
can be resumed. The migration does not delete source rows. Cross-project parent
links, if present in legacy data, must be resolved before import.

After success, start the app with Neo4j selected and inspect `/api/db-integrity`
and representative saved analyses. Keep the source backup through cutover.
New data saved after cutover exists only in Neo4j; switching back to SQL does
not synchronize those new records.

## Verification

`npm test` checks existing bibliometric/corpus fixtures and graph projection
validation. To run integration checks against a disposable Neo4j database:

```powershell
$env:NEO4J_TEST_URI = 'bolt://localhost:7687'
$env:NEO4J_TEST_USERNAME = 'neo4j'
$env:NEO4J_TEST_PASSWORD = 'test-database-password'
npm run test:neo4j
```

The integration test checks native citations and weighted links, saved-record
round trips, independent runs, deletion rules, HTTP behavior, and repeatable
SQL-to-Neo4j import. It creates constraints and temporary test records; use a
test database. Without `NEO4J_TEST_URI`, the integration test reports a skip.
