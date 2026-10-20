import neo4j from 'neo4j-driver';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const kinds = {
  projects: {label: 'BMProject', name: 'Untitled project'},
  searches: {label: 'BMSearch', name: 'Saved search', relation: 'HAS_SEARCH'},
  corpora: {label: 'BMCorpus', name: 'Corpus', relation: 'HAS_CORPUS'},
  analyses: {label: 'BMAnalysis', name: 'Analysis', relation: 'HAS_ANALYSIS'}
};
const networkTypes = {co_citation: 'CO_CITED_WITH', bibliographic_coupling: 'SHARES_REFERENCES', direct_citation: 'DIRECT_CITATION', semantic_terms: 'TERM_CO_OCCURS_WITH', semantic_topics: 'TOPIC_CO_OCCURS_WITH', semantic_embeddings: 'TEXT_SIMILAR_TO', collaboration_author: 'CO_AUTHORED_WITH', collaboration_institution: 'CO_AFFILIATED_WITH', collaboration_country: 'CO_REPRESENTED_WITH'};
const parseRecord = node => node ? JSON.parse(node.properties.payload) : null;
function fail(message, status = 400) {
  throw Object.assign(new Error(message), {status});
}
function definition(kind) {
  const spec = kinds[kind];
  if (!spec) fail('Unknown record type');
  return spec;
}
function defaults(kind, body) {
  const base = {name: body.name || definition(kind).name};
  if (kind === 'projects') return {...base, description: body.description ?? null};
  if (kind === 'searches') return {...base, project_id: body.project_id, query: body.query || {}, result_snapshot: body.result_snapshot || {}, result_count: body.result_count || 0};
  if (kind === 'corpora') return {...base, project_id: body.project_id, search_id: body.search_id || null, version: body.version || 1, works: body.works || [], decisions: body.decisions || {}};
  return {...base, project_id: body.project_id, corpus_id: body.corpus_id || null, query: body.query || {}, search_snapshot: body.search_snapshot || {}, corpus: body.corpus || [], ref_coverage: body.ref_coverage || {}, parameters: body.parameters || {}, network: body.network || {}, cited_works: body.cited_works || {}, view_state: body.view_state || {}};
}

export function graphRows(kind, record) {
  const groups = kind === 'searches' ? [['search', record.result_snapshot?.works || []]]
    : kind === 'corpora' ? [['corpus', record.works || []]]
    : kind === 'analyses' ? [['search', record.search_snapshot?.works || []], ['corpus', record.corpus || []], ['cited', Object.values(record.cited_works || {})]] : [];
  const observations = [], citations = [];
  for (const [role, works] of groups) {
    if (!Array.isArray(works)) fail('Saved works must be arrays');
    for (const [position, work] of works.entries()) {
      if (!work || typeof work.id !== 'string' || !work.id) fail('Every saved work must have an ID');
      const id = JSON.stringify([record.id, role, position]);
      const properties = Object.fromEntries(['doi', 'display_name', 'publication_year', 'type', 'language', 'cited_by_count', 'referenced_works_count', 'is_retracted'].filter(key => work[key] != null).map(key => [key, work[key]]));
      observations.push({id, work_id: work.id, role, position, payload: JSON.stringify(work), properties});
      if (work.referenced_works != null && (!Array.isArray(work.referenced_works) || work.referenced_works.some(target => typeof target !== 'string' || !target))) fail('Reference IDs must be nonempty strings');
      for (const target of new Set(work.referenced_works || [])) citations.push({source: work.id, target, observation_id: id, role});
    }
  }
  const nodes = record.network?.nodes || [], edges = record.network?.edges || [];
  if (!Array.isArray(nodes) || !Array.isArray(edges)) fail('Network nodes and edges must be arrays');
  const nodeIds = new Set();
  const networkNodes = nodes.map((node, position) => {
    if (typeof node.id !== 'string' || !node.id || nodeIds.has(node.id)) fail('Network node IDs must be unique nonempty strings');
    nodeIds.add(node.id);
    const entityKind = node.entityKind || record.network?.entityKind || 'work';
    return {id: JSON.stringify([record.id, node.id]), work_id: ['term','topic','author','institution','country'].includes(entityKind) ? null : node.id, entity_key: node.id, entity_kind: entityKind, position, payload: JSON.stringify(node), properties: Object.fromEntries(['occurrence', 'degree', 'total_link_strength', 'isolated', 'community'].filter(key => node[key] != null).map(key => [key, node[key]]))};
  });
  if (edges.length && !networkTypes[record.network.method]) fail('Unsupported network method');
  const networkEdges = edges.map((edge, position) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) fail('Network edge endpoints must exist in this analysis');
    return {source: JSON.stringify([record.id, edge.source]), target: JSON.stringify([record.id, edge.target]), position, payload: JSON.stringify(edge), properties: Object.fromEntries(['raw_weight', 'normalized_weight', 'weight'].filter(key => edge[key] != null).map(key => [key, edge[key]]))};
  });
  return {observations, citations, networkNodes, networkEdges, networkType: networkTypes[record.network?.method]};
}

export class Neo4jStore {
  constructor(driver, database = 'neo4j') {
    this.driver = driver;
    this.database = database;
  }
  static fromEnvironment(env = process.env) {
    for (const key of ['NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD']) if (!env[key]) throw new Error(`${key} is required for Neo4j storage`);
    return new Neo4jStore(neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD), {disableLosslessIntegers: true}), env.NEO4J_DATABASE || 'neo4j');
  }
  async transaction(write, callback) {
    const session = this.driver.session({database: this.database});
    try {
      return await session[write ? 'executeWrite' : 'executeRead'](async tx => {
        if (write) await tx.run('MERGE (s:BMStore {id: "bibliomap"}) SET s.lock = coalesce(s.lock, 0) + 1');
        return callback(tx);
      });
    } finally {
      await session.close();
    }
  }
  async init() {
    await this.driver.verifyConnectivity();
    for (const label of ['BMStore', 'BMRecord', 'BMWork', 'BMObservation', 'BMNetworkNode']) {
      await this.driver.executeQuery(`CREATE CONSTRAINT ${label.toLowerCase()}_id IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`, {}, {database: this.database});
    }
  }
  async close() { await this.driver.close(); }
  async getIn(tx, kind, id) {
    const {label} = definition(kind);
    const result = await tx.run(`MATCH (n:BMRecord:${label} {id: $id}) RETURN n`, {id});
    return parseRecord(result.records[0]?.get('n'));
  }
  async get(kind, id) { return this.transaction(false, tx => this.getIn(tx, kind, id)); }
  async listIn(tx, kind, projectId = null) {
    const {label} = definition(kind);
    const result = await tx.run(`MATCH (n:BMRecord:${label}) WHERE $projectId IS NULL OR n.project_id = $projectId RETURN n ORDER BY n.updated_at DESC, n.id`, {projectId});
    return result.records.map(row => parseRecord(row.get('n')));
  }
  async list(kind, projectId = null) {
    return this.transaction(false, async tx => {
      const records = await this.listIn(tx, kind, projectId);
      if (kind === 'projects') {
        const analyses = await this.listIn(tx, 'analyses');
        return records.map(record => ({...record, analysis_count: analyses.filter(item => item.project_id === record.id).length}));
      }
      return records.map(record => {
        if (kind === 'searches') {
          const {result_snapshot, ...summary} = record;
          return summary;
        }
        if (kind === 'corpora') {
          const {works, decisions, ...summary} = record;
          return {...summary, work_count: works.length};
        }
        const {corpus, network, search_snapshot, cited_works, ref_coverage, ...summary} = record;
        return {...summary, corpus_count: corpus.length};
      });
    });
  }
  async validateParents(tx, kind, record) {
    if (kind === 'projects') return;
    if (!record.project_id || !await this.getIn(tx, 'projects', record.project_id)) fail('Project not found', 409);
    const parentKind = kind === 'corpora' ? 'searches' : kind === 'analyses' ? 'corpora' : null;
    const parentId = kind === 'corpora' ? record.search_id : record.corpus_id;
    if (parentKind && parentId) {
      const parent = await this.getIn(tx, parentKind, parentId);
      if (!parent || parent.project_id !== record.project_id) fail('Linked record must exist in the same project', 409);
    }
  }
  async writeIn(tx, kind, record, rows) {
    const {label, relation} = definition(kind);
    await tx.run(`CREATE (n:BMRecord:${label}) SET n = $properties`, {properties: {id: record.id, project_id: record.project_id || null, name: record.name, created_at: record.created_at, updated_at: record.updated_at, payload: JSON.stringify(record)}});
    if (relation) await tx.run(`MATCH (p:BMProject {id: $projectId}), (n:BMRecord {id: $id}) CREATE (p)-[:${relation}]->(n)`, {projectId: record.project_id, id: record.id});
    if (kind === 'corpora' && record.search_id) await tx.run('MATCH (c:BMCorpus {id: $id}), (s:BMSearch {id: $parentId}) CREATE (c)-[:FROM_SEARCH]->(s)', {id: record.id, parentId: record.search_id});
    if (kind === 'analyses' && record.corpus_id) await tx.run('MATCH (a:BMAnalysis {id: $id}), (c:BMCorpus {id: $parentId}) CREATE (a)-[:USES_CORPUS]->(c)', {id: record.id, parentId: record.corpus_id});
    for (let offset = 0; offset < rows.observations.length; offset += 500) {
      await tx.run(`MATCH (record:BMRecord {id: $id}) UNWIND $rows AS row
        MERGE (work:BMWork {id: row.work_id}) SET work += row.properties
        CREATE (snapshot:BMObservation {id: row.id, record_id: $id, role: row.role, position: row.position, payload: row.payload})
        CREATE (record)-[:OBSERVED]->(snapshot)-[:REPRESENTS]->(work)`, {id: record.id, rows: rows.observations.slice(offset, offset + 500)});
    }
    for (let offset = 0; offset < rows.citations.length; offset += 2000) {
      await tx.run(`UNWIND $rows AS row MATCH (source:BMWork {id: row.source})
        MERGE (target:BMWork {id: row.target})
        CREATE (source)-[:CITES {record_id: $id, observation_id: row.observation_id, role: row.role}]->(target)`, {id: record.id, rows: rows.citations.slice(offset, offset + 2000)});
    }
    for (let offset = 0; offset < rows.networkNodes.length; offset += 500) {
      await tx.run(`MATCH (analysis:BMAnalysis {id: $id}) UNWIND $rows AS row
        CREATE (node:BMNetworkNode {id: row.id, analysis_id: $id, entityKey: row.entity_key, entityKind: row.entity_kind, position: row.position, payload: row.payload}) SET node += row.properties
        CREATE (analysis)-[:HAS_NODE]->(node)
        FOREACH (workId IN CASE WHEN row.work_id IS NULL THEN [] ELSE [row.work_id] END | MERGE (work:BMWork {id: workId}) CREATE (node)-[:REPRESENTS]->(work))`, {id: record.id, rows: rows.networkNodes.slice(offset, offset + 500)});
    }
    for (let offset = 0; offset < rows.networkEdges.length; offset += 2000) {
      await tx.run(`UNWIND $rows AS row MATCH (source:BMNetworkNode {id: row.source}), (target:BMNetworkNode {id: row.target})
        CREATE (source)-[edge:${rows.networkType} {analysis_id: $id, position: row.position, payload: row.payload}]->(target) SET edge += row.properties`, {id: record.id, rows: rows.networkEdges.slice(offset, offset + 2000)});
    }
  }
  async create(kind, body, {preserveIdentity = false} = {}) {
    const now = new Date().toISOString();
    const record = {...defaults(kind, body), ...(preserveIdentity ? body : {}), id: preserveIdentity ? body.id : randomUUID(), created_at: preserveIdentity ? new Date(body.created_at).toISOString() : now, updated_at: preserveIdentity ? new Date(body.updated_at).toISOString() : now};
    if (typeof record.id !== 'string' || !record.id) fail('Record ID is required');
    const rows = graphRows(kind, record);
    return this.transaction(true, async tx => {
      const existing = await this.getIn(tx, kind, record.id);
      if (existing) {
        if (preserveIdentity && isDeepStrictEqual(existing, record)) return existing;
        fail('Record ID already exists with different data', 409);
      }
      await this.validateParents(tx, kind, record);
      await this.writeIn(tx, kind, record, rows);
      if (kind === 'analyses' && !preserveIdentity) {
        const project = await this.getIn(tx, 'projects', record.project_id);
        project.updated_at = now;
        await tx.run('MATCH (p:BMProject {id: $id}) SET p.updated_at = $now, p.payload = $payload', {id: project.id, now, payload: JSON.stringify(project)});
      }
      return record;
    });
  }
  async update(kind, id, body) {
    return this.transaction(true, async tx => {
      const record = await this.getIn(tx, kind, id);
      if (!record) return null;
      const fields = kind === 'projects' ? ['name', 'description'] : kind === 'analyses' ? ['name', 'view_state'] : ['name'];
      for (const field of fields) if (body[field] != null) record[field] = body[field];
      record.updated_at = new Date().toISOString();
      await tx.run('MATCH (n:BMRecord {id: $id}) SET n.name = $name, n.updated_at = $now, n.payload = $payload', {id, name: record.name, now: record.updated_at, payload: JSON.stringify(record)});
      return record;
    });
  }
  async delete(kind, id) {
    return this.transaction(true, async tx => {
      const record = await this.getIn(tx, kind, id);
      if (!record) return;
      if (kind === 'corpora') {
        const used = await tx.run('MATCH (:BMAnalysis)-[:USES_CORPUS]->(c:BMCorpus {id: $id}) RETURN count(c) AS total', {id});
        if (used.records[0].get('total')) fail('This corpus is used by a saved analysis. Delete the analysis first.', 409);
      }
      if (kind === 'searches') {
        const corpora = (await this.listIn(tx, 'corpora', record.project_id)).filter(corpus => corpus.search_id === id);
        for (const corpus of corpora) {
          corpus.search_id = null;
          await tx.run('MATCH (c:BMCorpus {id: $id}) SET c.payload = $payload', {id: corpus.id, payload: JSON.stringify(corpus)});
        }
      }
      const ids = [id];
      if (kind === 'projects') {
        const children = await tx.run('MATCH (n:BMRecord {project_id: $id}) RETURN n.id AS id', {id});
        ids.push(...children.records.map(row => row.get('id')));
      }
      await tx.run('MATCH ()-[edge:CITES]->() WHERE edge.record_id IN $ids DELETE edge', {ids});
      await tx.run('MATCH (n:BMObservation) WHERE n.record_id IN $ids DETACH DELETE n', {ids});
      await tx.run('MATCH (n:BMNetworkNode) WHERE n.analysis_id IN $ids DETACH DELETE n', {ids});
      await tx.run('MATCH (n:BMCoCitationBundle) WHERE n.analysis_id IN $ids DETACH DELETE n', {ids});
      await tx.run('MATCH (n:BMRecord) WHERE n.id IN $ids DETACH DELETE n', {ids});
    });
  }
  async integrity() {
    return this.transaction(false, async tx => {
      const records = {};
      for (const kind of Object.keys(kinds)) records[kind] = await this.listIn(tx, kind);
      const counts = Object.fromEntries(Object.entries(records).map(([kind, values]) => [kind, values.length]));
      const projects = records.projects.map(project => ({id: project.id, name: project.name, ...Object.fromEntries(['searches', 'corpora', 'analyses'].map(kind => [kind, records[kind].filter(record => record.project_id === project.id).length]))}));
      const searches = records.searches.map(record => ({id: record.id, project_id: record.project_id, name: record.name, result_count: record.result_count, snapshot_count: (record.result_snapshot.works || []).length}));
      const corpora = records.corpora.map(record => ({id: record.id, project_id: record.project_id, search_id: record.search_id, name: record.name, version: record.version, work_count: record.works.length}));
      const analyses = records.analyses.map(record => ({id: record.id, project_id: record.project_id, corpus_id: record.corpus_id, name: record.name, corpus_count: record.corpus.length, node_count: (record.network.nodes || []).length, edge_count: (record.network.edges || []).length, parameters: record.parameters, stats: record.network.stats || null, has_search_snapshot: Object.keys(record.search_snapshot).length > 0, has_cited_works: Object.keys(record.cited_works).length > 0, has_view_state: Object.keys(record.view_state).length > 0}));
      const integrity = Object.fromEntries(['searches', 'corpora', 'analyses'].map(kind => [`orphan_${kind}`, records[kind].filter(record => !records.projects.some(project => project.id === record.project_id)).length]));
      integrity.broken_corpus_search_links = records.corpora.filter(record => record.search_id && !records.searches.some(search => search.id === record.search_id)).length;
      integrity.broken_analysis_corpus_links = records.analyses.filter(record => record.corpus_id && !records.corpora.some(corpus => corpus.id === record.corpus_id)).length;
      const result = await tx.run(`MATCH (n) WHERE n:BMWork OR n:BMObservation OR n:BMNetworkNode
        RETURN count(CASE WHEN n:BMWork THEN 1 END) AS works,
        count(CASE WHEN n:BMObservation THEN 1 END) AS observations,
        count(CASE WHEN n:BMNetworkNode THEN 1 END) AS network_nodes`);
      const graph = result.records[0].toObject();
      const edges = await tx.run('MATCH ()-[r:CITES|CO_CITED_WITH|SHARES_REFERENCES|DIRECT_CITATION]->() RETURN type(r) AS type, count(r) AS count');
      graph.relationships = Object.fromEntries(edges.records.map(row => [row.get('type'), row.get('count')]));
      return {counts, projects, searches, corpora, analyses, integrity, storage: 'neo4j', graph};
    });
  }
}
