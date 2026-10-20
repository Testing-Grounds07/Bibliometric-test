import {createHash} from 'node:crypto';
import {build} from '../analysis-engine.mjs';
import {densityGrid, partition} from './auto-cpm.mjs';
import '../public/corpus-presets.js';
import {deduplicateWorks, applyWorkIdentity} from './work-deduplication.mjs';

export function searchSpecification(input) {
 const query = String(input.query || '').trim();
 if (!query || query.length > 500) throw new Error('Enter search terms (up to 500 characters).');
 const limit = Number(input.limit ?? 500);
 if (!Number.isInteger(limit) || limit < 1 || limit > 20000) throw new Error('Choose 1–20,000 results.');
 const from = input.from ? Number(input.from) : null, through = input.through ? Number(input.through) : null;
 if ([from, through].some(year => year != null && (!Number.isInteger(year) || year < 1500 || year > 2100)) || from && through && from > through) throw new Error('Check the publication year range.');
 const terms = input.phrase ? '"' + query.replaceAll('"', '') + '"' : query;
 const filter = ['type:article|review|book-chapter|conference-paper', ...(from ? ['from_publication_date:' + from + '-01-01'] : []), ...(through ? ['to_publication_date:' + through + '-12-31'] : [])].join(',');
 return {query, terms, phrase: !!input.phrase, limit, from, through, filter, corpus: 'core', searchField: 'search', searchedAt: new Date().toISOString()};
}

export function selectCorpus(works, preset = 'conservative') {
 if (!['conservative', 'balanced', 'inclusive'].includes(preset)) throw new Error('Unknown corpus filter.');
 const counts = {included: 0, excluded: 0, unknown: 0};
 const selected = works.filter(work => { const result = globalThis.BiblioMapCorpus.evaluate(work, preset); counts[result.status]++; return result.status === 'included'; });
 return {works: selected, counts, preset, humanValidated: false};
}

export function selectCleanedCorpus(works, preset, cleanup) {
 const selection = selectCorpus(works, preset);
 if (!cleanup) return selection;
 const cleaned = applyWorkIdentity(selection.works, cleanup.audit);
 return {...selection, works: cleaned, cleanup: {...cleanup.summary, selectedSourcesBefore: selection.works.length, selectedSourcesAfter: cleaned.length}};
}

export function evidenceDataset(works, corpusId, referenceLabels = {}, metadata = [], identity = null) {
 const prepared = identity === false ? {works, audit: undefined} : identity ? {works: applyWorkIdentity(works, identity), audit: identity} : deduplicateWorks(works, metadata);
 const articles = prepared.works.map(work => ({id: work.id, title: work.display_name || work.id, year: work.publication_year || null, publication_date: work.publication_date || null, authors_count: work.authors_count, retainedAuthorshipCount: Array.isArray(work.authorships) ? work.authorships.length : null, authorships: work.authorships, abstract_inverted_index: work.abstract_inverted_index, topics: work.topics, years: work.years, yearLabel: work.yearLabel, variants: work.variants, mergedRecords: work.mergedRecords, deduplicationNote: work.deduplicationNote, doi: work.doi?.replace(/^https?:\/\/doi.org\//, '') || null, authors: (work.authorships || []).map(entry => entry.author?.display_name).filter(Boolean).join('; '), references: [...new Set(work.referenced_works || [])], referenceMetadata: work.referenced_works?.length ? 'Available OpenAlex references; completeness unknown' : 'Insufficient reference metadata', citedBy: work.cited_by_count || 0}));
 return {version: 1, sourceCorpusId: corpusId, articles, referenceLabels, deduplication: prepared.audit, incidenceHash: createHash('sha256').update(JSON.stringify(articles.map(article => [article.id, article.references]))).digest('hex')};
}

export function buildProjectGraph(works, metadata, options = {}, limits = {}) {
 const prepared = deduplicateWorks(works, metadata); works = prepared.works; metadata = prepared.metadata;
 const threshold = Number(options.threshold ?? 10), support = Number(options.support ?? 5);
 if (![threshold, support].every(value => Number.isInteger(value) && value >= 1 && value <= 1000)) throw new Error('Citation and connection minimums must be integers from 1 to 1,000.');
 const frequencies = new Map();
 for (const work of works) for (const id of new Set(work.referenced_works || [])) frequencies.set(id, (frequencies.get(id) || 0) + 1);
 const eligible = [...frequencies].filter(([, count]) => count >= threshold).map(([id]) => id);
 const nodeLimit = limits.nodes || 1500, edgeLimit = limits.edges || 100000;
 if (eligible.length > nodeLimit) throw new Error(`This scope has more than ${nodeLimit.toLocaleString()} references. Increase the reference citation minimum.`);
 const buildOptions = {method: 'co_citation', minNode: threshold, minRaw: support, normalization: 'association_strength', resolution: .02, restarts: 1};
 const raw = build(works, buildOptions), byId = new Map(metadata.map(work => [work.id, work]));
 if (raw.edges.length > edgeLimit) throw new Error(`This scope has more than ${edgeLimit.toLocaleString()} connections. Increase the reference citation or joint citation minimum. No connections were silently removed.`);
 const postings = new Map(eligible.map(id => [id, []]));
 for (const work of works) for (const id of new Set(work.referenced_works || [])) postings.get(id)?.push(work.id);
 const graph = {method: 'cocitation', externalCorpus: true, order: 2, threshold, minimumSupport: support, resolution: .02, bundles: [], nodes: raw.nodes.map((node, position) => {
  const work = byId.get(node.id), author = work?.authorships?.[0]?.author?.display_name;
  return {id: node.id, key: node.id, label: work ? [author, work.display_name].filter(Boolean).join(', ') : node.id, title: work?.display_name || node.id, year: work?.publication_year || null, years: work?.years || [], yearLabel: work?.yearLabel || '', doi: work?.doi?.replace(/^https?:\/\/doi.org\//, '') || null, citations: node.occurrence, articles: postings.get(node.id), variants: work?.variants || [node.id], mergedRecords: work?.mergedRecords || [], deduplicationNote: work?.deduplicationNote, rules: work?.deduplicationNote ? [work.deduplicationNote, prepared.audit.policy] : [], cluster: 0, degree: node.degree, x: Math.cos(position * 2.39996) * Math.sqrt(position + 1) * 32, y: Math.sin(position * 2.39996) * Math.sqrt(position + 1) * 32};
 }), links: raw.edges.map(edge => {
  const targets = new Set(postings.get(edge.target));
  return {source: edge.source, target: edge.target, count: edge.raw_weight, strength: edge.weight, articles: postings.get(edge.source).filter(id => targets.has(id))};
 })};
 const density = densityGrid(graph).density;
 const resolution = options.resolution == null || options.resolution === '' ? Math.max(.000001, density / 4) : Number(options.resolution);
 if (!Number.isFinite(resolution) || resolution <= 0 || resolution > 100) throw new Error('CPM must be greater than zero and at most 100.');
 const result = partition(graph, resolution);
 for (const node of graph.nodes) node.cluster = result.memberships[node.id] || 0;
 graph.resolution = resolution;
 graph.normalization = 'association_strength'; graph.counting = 'full';
 graph.deduplication = prepared.audit;
 graph.clustering = {algorithm: 'leiden', label: 'Leiden CPM', objective: 'cpm', resolution, restarts: 10, quality: result.quality};
 graph.stats = {nodes: graph.nodes.length, edges: graph.links.length, clusters: new Set(graph.nodes.map(node => node.cluster).filter(Boolean)).size, isolated_nodes: graph.nodes.filter(node => !node.degree).length};
 graph.appliedSettings = {settings: {label: options.resolution ? 'Manual CPM ' + resolution : 'Density starting CPM ' + Number(resolution.toPrecision(4))}, validated: false};
 graph.resolutionSelection = options.resolution ? 'Manually selected CPM. Find settings and reliability assess it separately.' : 'Density / 4 is an exploratory starting setting. Find settings and reliability assess it separately.';
 return graph;
}

export function workspaceNetworkMethod(graph) { return graph.collaboration ? 'collaboration_' + graph.collaboration.kind : graph.semantic ? 'semantic_' + graph.semantic.kind : graph.canvasKind === 'historiography' ? 'direct_citation' : graph.canvasKind === 'coupling' ? 'bibliographic_coupling' : 'co_citation'; }

export function assertSnapshotCorpus(snapshot, corpusId) {
 const declared = snapshot.evidenceCorpusId || snapshot.graph?.sourceCorpusId || snapshot.reference?.graph?.sourceCorpusId;
 if (declared && declared !== corpusId) throw new Error('The displayed map belongs to different evidence. Open the selected search map before saving, or explicitly copy its original evidence.');
 if (!declared && snapshot.graph?.externalCorpus) throw new Error('This map lacks an evidence identity. Reopen its saved finding or rebuild before saving.');
 return declared || null;
}

export function rebindSnapshotCorpus(snapshot, corpusId) {
 const original = snapshot.evidenceCorpusId || snapshot.graph?.sourceCorpusId;
 snapshot.evidenceCorpusId = corpusId;
 if (snapshot.graph) {
  const previous = snapshot.graph.sourceCorpusId || original;
  if (previous && previous !== corpusId) snapshot.graph.sourceCorpusLineage = [...new Set([...(snapshot.graph.sourceCorpusLineage || []), previous])];
  if (previous && previous !== corpusId) delete snapshot.graph.scientificManifest;
  snapshot.graph.sourceCorpusId = corpusId;
  if(snapshot.graph.evidenceProvenance)snapshot.graph.evidenceProvenance.evidenceId=corpusId;
  if(snapshot.graph.egoParent)rebindSnapshotCorpus({graph:snapshot.graph.egoParent},corpusId);
  const series=snapshot.graph.temporalSeries;
  if(series){if(series.evidence)series.evidence.evidenceId=corpusId;if(series.parentGraph)rebindSnapshotCorpus({graph:series.parentGraph},corpusId);for(const window of series.windows||[])rebindSnapshotCorpus({graph:window.graph},corpusId);}
  if(snapshot.graph.burstReport?.evidence)snapshot.graph.burstReport.evidence.evidenceId=corpusId;
 }
 if (snapshot.reference) rebindSnapshotCorpus(snapshot.reference, corpusId);
 return snapshot;
}

export function nativeNetwork(graph) {
 return {...graph, method: workspaceNetworkMethod(graph), edges: graph.links.map(edge => ({...edge, raw_weight: Object.hasOwn(edge,'rawSupport') ? edge.rawSupport : edge.count, normalized_weight: edge.strength, weight: edge.strength})), nodes: graph.nodes.map(node => ({...node, occurrence: node.citations, community: node.cluster || null}))};
}
