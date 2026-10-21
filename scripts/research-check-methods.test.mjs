import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {adjustedRandIndex, preflightResearchCheck, researchCheckCapabilities, researchCheckComparison, researchCheckMemberships, runResearchCheck, RESEARCH_CHECK_SEEDS} from './research-check-methods.mjs';
import {couplingPairs, couplingGraph} from './evidence-metrics.mjs';
import {scienceDigest} from './scientific-manifest.mjs';

const node = (id, cluster = 1) => ({id, cluster});
function graph() {return {nodes: [node('a'), node('b'), node('c', 0), node('d', 0)], links: [{source: 'a', target: 'b', strength: .123456789123}], entityKind: 'source', networkModel: 'pairwise', order: 2, normalization: 'cosine', minimumCosine: 0, clustering: {algorithm: 'leiden', objective: 'modularity'}};}
function couplingFixture() {
 const records = [{id: 'a', type: 'article', references: ['W1', 'W2']}, {id: 'b', type: 'book', references: ['W1', 'W2']}, {id: 'c', type: 'article', references: ['W2', 'W3']}, {id: 'd', type: 'article', references: []}];
 const normalized = records.map(record => ({...record, references: record.references.map(id => 'https://openalex.org/' + id)}));
 const result = couplingGraph(normalized, couplingPairs(normalized), 1, 0);
 return {records, graph: {...result, entityKind: 'source', networkModel: 'pairwise', order: 2, clustering: {algorithm: 'leiden', objective: 'modularity'}, nodes: result.nodes.map((item, i) => ({...item, cluster: i === 3 ? 0 : 1}))}};
}
async function semanticFixture() {
 const records = Array.from({length: 6}, (_, i) => ({id: String(i), title: 'Source ' + i, abstract: 'Exact retained abstract ' + i}));
 const cache = {model: 'sentence-transformers/all-MiniLM-L6-v2', revision: 'a'.repeat(40), dimensions: 384, encoding: 'signed-int8-base64-unit-vector', textScope: 'titles and available abstracts', sourceCorpusId: 'corpus', documents: {}};
 for (const [i, record] of records.entries()) {const bytes = new Uint8Array(384); bytes[0] = 50; bytes[i + 1] = 25; cache.documents[record.id] = {title: record.title, abstract: record.abstract, embedding: Buffer.from(bytes).toString('base64')};}
 const documents = records.map(work => ({id: work.id, title: work.title, abstract: work.abstract, embedding: cache.documents[work.id].embedding}));
 const embeddingFingerprint = await scienceDigest({model: cache.model, revision: cache.revision, dimensions: cache.dimensions, encoding: cache.encoding, textScope: cache.textScope, documents});
 const textFingerprint = await scienceDigest(records);
 return {records, cache, graph: {...graph(), nodes: records.map(record => ({...record, cluster: 1})), links: [{source: '0', target: '1', strength: .8}], sourceCorpusId: 'corpus', semantic: {kind: 'embeddings', minimumSimilarity: 0, model: {id: cache.model, revision: cache.revision, dimensions: 384}, embeddingFingerprint, textFingerprint}}};
}

test('ARI independent hand cases include zero labels, relabeling and crossing partitions', () => {
 assert.equal(adjustedRandIndex({a: 0, b: 0, c: 1, d: 1}, {a: 'x', b: 'x', c: 'y', d: 'y'}), 1);
 assert.ok(Math.abs(adjustedRandIndex({a: 0, b: 0, c: 1, d: 1}, {a: 0, b: 1, c: 0, d: 1}) + .5) < 1e-15);
 assert.equal(adjustedRandIndex({a: 1, b: 2}, {a: 10, b: 20}), 1);
 assert.equal(adjustedRandIndex({a: 1}, {a: 1}), null);
 assert.throws(() => adjustedRandIndex({a: 1}, {}, ['a', 'b']), /without membership/);
});

test('comparison preserves engine label zero and distinct isolates with explicit denominators', () => {
 const a = graph(), b = graph(); a.nodes[0].engineCommunity = 0; a.nodes[1].engineCommunity = 0;
 assert.equal(researchCheckMemberships(a).a, 'engine:0');
 assert.notEqual(researchCheckMemberships(a).c, researchCheckMemberships(a).d);
 b.links = [{source: 'b', target: 'c', strength: 1}]; b.nodes[2].cluster = 1;
 const result = researchCheckComparison(a, b);
 assert.equal(result.commonFullUniverse.count, 4); assert.equal(result.baselineConnectedCommonUniverse.count, 2); assert.equal(result.bothConnectedCommonUniverse.count, 1);
 assert.equal(result.bothConnectedCommonUniverse.adjustedRandIndex, null);
 a.nodes[2].engineCommunity = 12; a.nodes[3].engineCommunity = 12;
 assert.equal(researchCheckMemberships(a).c, researchCheckMemberships(a).d, 'actual original engine communities take precedence even for disconnected nodes');
});

test('no unsupported objective or representation falls back to CPM', () => {
 for (const patch of [{clustering: {algorithm: 'leiden', objective: 'unknown'}}, {clustering: {algorithm: 'infomap', objective: 'modularity'}}, {clustering: {algorithm: 'leiden', objective: 'CPM'}}, {directed: true}, {networkModel: 'hypergraph'}, {temporalSelection: {}}, {collaboration: {}}, {order: 3}, {entityKind: 'term'}]) assert.throws(() => preflightResearchCheck({kind: 'seed', graph: {...graph(), ...patch}}));
 const cpm = {...graph(), resolution: .02, clustering: {algorithm: 'leiden', objective: 'CPM'}};
 assert.equal(preflightResearchCheck({kind: 'seed', graph: cpm}).settings.objective, 'cpm');
 assert.throws(() => preflightResearchCheck({kind: 'seed', graph: {...cpm, importedStandalone: {}}}), /scale is unspecified/);
});

test('preflight enforces hard node, edge, fit and duplicate-edge budgets', () => {
 assert.throws(() => preflightResearchCheck({kind: 'seed', graph: {...graph(), nodes: Array.from({length: 2001}, (_, i) => node(String(i)))}}), /budget/);
 assert.throws(() => preflightResearchCheck({kind: 'seed', graph: {...graph(), links: Array(200001).fill(graph().links[0])}}), /budget/);
 assert.throws(() => preflightResearchCheck({kind: 'seed', graph: {...graph(), links: [...graph().links, {source: 'b', target: 'a', strength: 1}]}}), /Duplicate/);
 assert.throws(() => preflightResearchCheck({kind: 'threshold', graph: graph(), options: {thresholds: [0, .1, .2, .3]}}), /one to three/);
 assert.equal(preflightResearchCheck({kind: 'threshold', graph: graph()}).budget.fits, 15);
});

test('raw positive weights are mandatory and never replaced by counts', () => {
 for (const value of [undefined, 0, -1, NaN, Infinity]) assert.throws(() => preflightResearchCheck({kind: 'seed', graph: {...graph(), links: [{source: 'a', target: 'b', strength: value, count: 17}]}}), /positive raw weights/);
});

test('five seeded fits keep inputs unchanged, preserve objective and report isolates', async () => {
 const input = graph(), retained = structuredClone(input), result = await runResearchCheck({kind: 'seed', graph: input});
 assert.deepEqual(input, retained); assert.equal(result.status, 'completed'); assert.deepEqual(result.variants[0].runs.map(run => run.seed), RESEARCH_CHECK_SEEDS);
 assert.equal(result.variants[0].pairwiseAgreement.length, 10); assert.equal(result.universe.isolates, 2);
 for (const run of result.variants[0].runs) {assert.equal(run.actualSettings.objective, 'modularity'); assert.equal(run.actualSettings.scale, 1); assert.equal(Object.keys(run.memberships).length, 4); assert.notEqual(run.memberships.c, run.memberships.d);}
 assert.equal(result.actualSettings.objective, 'modularity'); assert.match(result.limitations[0], /not evidence-bootstrap/); assert.equal(result.reliability, undefined); assert.equal(result.inputFingerprint.length, 64);
});

test('native CPM uses exact variant mean scaling and unchanged gamma', async () => {
 const input = {...graph(), resolution: .012, clustering: {algorithm: 'leiden', objective: 'CPM'}};
 const result = await runResearchCheck({kind: 'seed', graph: input});
 assert.equal(result.variants[0].runs[0].actualSettings.scale, .123456789123);
 assert.equal(result.variants[0].runs[0].actualSettings.resolution, .012); assert.equal(input.links[0].strength, .123456789123);
});

test('threshold scopes explicitly unavailable lower thresholds and keeps every node', async () => {
 const input = {...graph(), minimumCosine: .05};
 const preflight = preflightResearchCheck({kind: 'threshold', graph: input});
 assert.deepEqual(preflight.details.thresholds, [.05, .1]); assert.equal(preflight.details.unavailable[0].threshold, 0);
 assert.throws(() => preflightResearchCheck({kind: 'threshold', graph: input, options: {thresholds: [0]}}), /below the retained/);
 const result = await runResearchCheck({kind: 'threshold', graph: input, options: {thresholds: [.2]}});
 assert.equal(result.variants[0].runs[0].nodes, 4); assert.equal(result.variants[0].runs[0].edges, 0); assert.equal(result.variants[0].runs[0].isolates, 4);
 assert.throws(() => preflightResearchCheck({kind: 'threshold', graph: {...graph(), minimumCosine: .5}, options: {minimumRetainedWeight: 0, thresholds: [0]}}), /cannot weaken/);
});

test('scientific fingerprints bind operation kind and operative graph settings', async () => {
 const first = await runResearchCheck({kind: 'seed', graph: graph()}), second = await runResearchCheck({kind: 'seed', graph: {...graph(), minimumSupport: 2}});
 assert.notEqual(first.inputFingerprint, second.inputFingerprint);
 const otherKind = await runResearchCheck({kind: 'threshold', graph: graph(), options: {thresholds: [0]}});
 assert.notEqual(first.inputFingerprint, otherKind.inputFingerprint);
 const layout = await runResearchCheck({kind: 'seed', graph: {...graph(), nodes: graph().nodes.map(n => ({...n, x: 10, y: -20}))}});
 assert.equal(first.inputFingerprint, layout.inputFingerprint);
});

test('article-only refuses missing/inferred types and uses exact supplied type supplements', async () => {
 const fixture = couplingFixture(); delete fixture.records[3].type;
 assert.throws(() => preflightResearchCheck({kind: 'article-only', ...fixture}), /types are missing/);
 const result = await runResearchCheck({kind: 'article-only', ...fixture, options: {typeMap: {d: 'article'}}});
 assert.deepEqual(result.variants[0].nodeIds, ['a', 'c', 'd']); assert.equal(result.variants[0].definition.supplementalTypes, 1);
 assert.equal(result.variants[0].runs[0].comparison.nodeCoverage.baselineOnly, 1);
 assert.throws(() => preflightResearchCheck({kind: 'article-only', ...fixture, options: {typeMap: {a: 'book', d: 'article'}}}), /conflicts/);
});

test('source IDs and missing reference lists cannot be silently filtered', () => {
 const fixture = couplingFixture(); fixture.records.pop();
 assert.throws(() => preflightResearchCheck({kind: 'edge-audit', ...fixture}), /no matching exact source/);
 const other = couplingFixture(); delete other.records[3].references;
 assert.throws(() => preflightResearchCheck({kind: 'edge-audit', ...other}), /Missing lists are unknown coverage/);
});

test('edge audit recomputes all exact shared counts and cosines, distinguishing failed audit from completed execution', async () => {
 const fixture = couplingFixture(), retained = structuredClone(fixture), result = await runResearchCheck({kind: 'edge-audit', ...fixture});
 assert.equal(result.results.status, 'verified'); assert.equal(result.results.expectedEdges, 3); assert.deepEqual(fixture, retained);
 fixture.graph.links[0].rawSupport = 100;
 const failure = await runResearchCheck({kind: 'edge-audit', ...fixture});
 assert.equal(failure.status, 'completed'); assert.equal(failure.results.status, 'mismatch'); assert.equal(failure.results.mismatchCount, 1);
 fixture.graph.links.pop();
 const missing = await runResearchCheck({kind: 'edge-audit', ...fixture}); assert.ok(missing.results.mismatches.some(item => item.kind === 'missing-retained-edge'));
});

test('ablation gates on verified baseline, rebuilds denominators, retains alternatives and node universe', async () => {
 const fixture = couplingFixture(), result = await runResearchCheck({kind: 'reference-ablation', ...fixture, options: {referenceIds: ['W1', 'https://openalex.org/W2']}});
 assert.equal(result.variants.length, 3); assert.deepEqual(result.variants.map(variant => variant.edges), [3, 1, 0]);
 assert.ok(result.variants.every(variant => variant.runs.length === 5 && variant.nodeIds.length === 4));
 assert.equal(fixture.records[0].references.length, 2);
 fixture.graph.links[0].strength += .01;
 await assert.rejects(() => runResearchCheck({kind: 'reference-ablation', ...fixture, options: {referenceIds: ['W1']}}), /Baseline coupling edge audit failed/);
 assert.throws(() => preflightResearchCheck({kind: 'reference-ablation', ...couplingFixture(), options: {referenceIds: ['W999']}}), /absent/);
});

test('compare is read-only with explicitly distinct common-full and connected denominators', async () => {
 const first = graph(), second = {...graph(), nodes: [node('a'), node('b'), node('e', 0)]};
 const retained = structuredClone([first, second]), result = await runResearchCheck({kind: 'compare', graph: first, comparisonGraph: second});
 assert.equal(result.results.comparison.commonFullUniverse.count, 2); assert.equal(result.results.comparison.nodeCoverage.baselineOnly, 2); assert.equal(result.results.comparison.nodeCoverage.comparisonOnly, 1);
 assert.deepEqual([first, second], retained); assert.equal(result.variants.length, 0); assert.equal(result.preflight.budget.fits, 0);
});

test('text kNN uses exact pinned cache, keeps full sources, and binds every vector and text', async () => {
 const fixture = await semanticFixture(), retained = structuredClone(fixture);
 const result = await runResearchCheck({kind: 'text-neighbours', ...fixture});
 assert.deepEqual(result.variants.map(variant => variant.definition.k), [5, 10, 15]); assert.equal(result.variants.length, 3);
 assert.ok(result.variants.every(variant => variant.edges === 15 && variant.runs.length === 5 && variant.nodeIds.length === 6));
 assert.equal(result.vectorPins.embeddingFingerprint, fixture.graph.semantic.embeddingFingerprint); assert.deepEqual(fixture, retained);
 fixture.cache.documents['0'].abstract += ' changed';
 assert.throws(() => preflightResearchCheck({kind: 'text-neighbours', ...fixture}), /missing or stale/);
});

test('text check refuses missing vectors, changed model revisions or changed exact vector pins', async () => {
 const missing = await semanticFixture(); delete missing.cache.documents['0']; assert.throws(() => preflightResearchCheck({kind: 'text-neighbours', ...missing}), /missing or stale/);
 const model = await semanticFixture(); model.cache.revision = 'b'.repeat(40); assert.throws(() => preflightResearchCheck({kind: 'text-neighbours', ...model}), /model\/revision/);
 const vector = await semanticFixture(); vector.cache.documents['0'].embedding = vector.cache.documents['1'].embedding;
 await assert.rejects(() => runResearchCheck({kind: 'text-neighbours', ...vector}), /Pinned semantic vectors changed/);
});

test('text evidence decodes retained JSON inverted indexes without inventing source text', async () => {
 const fixture = await semanticFixture();
 const text = fixture.records[0].abstract, inverted = {};
 for (const [offset, token] of text.split(' ').entries()) (inverted[token] ||= []).push(offset);
 delete fixture.records[0].abstract; fixture.records[0].abstract_inverted_index = JSON.stringify(inverted);
 const result = await runResearchCheck({kind: 'text-neighbours', ...fixture}); assert.equal(result.status, 'completed');
 fixture.records[0].abstract_inverted_index = '{bad'; assert.throws(() => preflightResearchCheck({kind: 'text-neighbours', ...fixture}), /JSON is malformed/);
});

test('capabilities returns per-kind missing-evidence reasons without initiating computation', () => {
 const result = researchCheckCapabilities(graph(), []);
 assert.equal(result.seed.available, true); assert.equal(result['reference-ablation'].available, false); assert.equal(result['text-neighbours'].available, false); assert.equal(result.compare.available, false);
 assert.match(result['article-only'].reason, /source record/);
 assert.equal(researchCheckCapabilities(graph(), [], {cache: {}, options: {rankMetric: 'strength'}})['rank-cutoff'].available, true);
});

test('worker entry exposes explicit progress, completed result and honest error without map-open computation', async () => {
 const source = await readFile(new URL('./research-check-worker.mjs', import.meta.url), 'utf8');
 assert.match(source, /self\.onmessage/); assert.match(source, /self\.postMessage\(\{result\}\)/); assert.match(source, /self\.postMessage\(\{error:/);
});

test('rank cutoff sums exact graph weights, preserves all zero-score works and stores deterministic boundary alternatives', async () => {
 const input = {...graph(), nodes: Array.from({length: 25}, (_, i) => node('n' + String(i).padStart(2, '0'), 0)), links: [{source: 'n00', target: 'n01', strength: .123456789123}]};
 const retained = structuredClone(input), result = await runResearchCheck({kind: 'rank-cutoff', graph: input}), rank = result.results;
 assert.deepEqual(input, retained); assert.equal(result.preflight.budget.fits, 0); assert.equal(result.variants.length, 0);
 assert.equal(rank.metric, 'strength'); assert.equal(rank.rankedSources.length, 25); assert.equal(rank.rankedSources[0].score, .123456789123);
 assert.deepEqual(rank.cutoffs.map(c => c.selectedCount), [10, 20]); assert.equal(rank.cutoffs[0].nodeCoverage, .4); assert.equal(rank.cutoffs[1].nodeCoverage, .8);
 assert.equal(rank.cutoffs[0].boundaryTiedIds.length, 23); assert.equal(rank.cutoffs[0].includingBoundaryTies.selectedCount, 25); assert.equal(rank.cutoffs[0].boundaryTiesOmitted.length, 15);
 assert.equal(rank.cutoffOverlap.commonCount, 10); assert.equal(rank.cutoffOverlap.jaccard, .5); assert.equal(rank.coverage.zeroScores, 23);
 assert.match(rank.limitations[0], /historical priority/);
});

test('incoming rank uses only explicit matched selected-source references, deduplicates aliases, excludes self matches, and declares coverage', async () => {
 const input = {nodes: [node('https://openalex.org/W1'), node('https://openalex.org/W2'), node('https://openalex.org/W3', 0)], links: [{source: 'https://openalex.org/W1', target: 'https://openalex.org/W2', strength: 2}], entityKind: 'source', networkModel: 'pairwise', order: 2};
 const records = [{id: 'https://openalex.org/W1', references: ['W2', 'https://openalex.org/W2', 'W1', 'W999']}, {id: 'https://openalex.org/W2', references: ['http://openalex.org/W1']}, {id: 'https://openalex.org/W3', references: ['W2']}, {id: 'outside', references: ['W2']}];
 const result = await runResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {rankMetric: 'incoming'}}), rank = result.results;
 assert.deepEqual(rank.rankedSources.map(row => [row.id, row.score]), [['https://openalex.org/W2', 2], ['https://openalex.org/W1', 1], ['https://openalex.org/W3', 0]]);
 assert.equal(rank.diagnostics.sourceRecordsOutsideNodeUniverse, 1); assert.equal(rank.diagnostics.excludedSelfMatches, 1); assert.equal(rank.diagnostics.matchedNonSelfReferences, 3); assert.equal(rank.diagnostics.unmatchedReferences, 1);
 assert.equal(rank.cutoffs[0].selectedCount, 3); assert.equal(rank.cutoffs[0].nodeCoverage, 1);
 delete records[2].references;
 assert.throws(() => preflightResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {rankMetric: 'incoming'}}), /missing lists are unknown coverage/);
});

test('global citation rank requires declared available count field and rejects inferred zero and unknown metric options', async () => {
 const input = graph(), records = input.nodes.map((n, i) => ({id: n.id, cited_by_count: [1, 20, 0, 10][i]}));
 assert.throws(() => preflightResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {rankMetric: 'global-citations'}}), /explicit globalCitationField/);
 const result = await runResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {rankMetric: 'global-citations', globalCitationField: 'cited_by_count'}});
 assert.deepEqual(result.results.rankedSources.map(row => row.id), ['b', 'd', 'a', 'c']); assert.equal(result.results.diagnostics.field, 'cited_by_count');
 delete records[2].cited_by_count;
 assert.throws(() => preflightResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {rankMetric: 'global-citations', globalCitationField: 'cited_by_count'}}), /unknown global citations cannot be replaced by zero/);
 assert.throws(() => preflightResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {rankMetric: 'quality'}}), /Unknown rank metric/);
 assert.throws(() => preflightResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {cutoffs: [5]}}), /Unsupported rank-cutoff protocol option/);
 assert.throws(() => preflightResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {globalCitationField: 'citedBy'}}), /applies only/);
});

test('incoming rank refuses ambiguous source aliases and missing reference evidence rather than merging candidates', () => {
 const input = {...graph(), nodes: [node('W1'), node('https://openalex.org/W1')], links: []}, records = input.nodes.map(n => ({id: n.id, references: []}));
 assert.throws(() => preflightResearchCheck({kind: 'rank-cutoff', graph: input, records, options: {rankMetric: 'incoming'}}), /ambiguous OpenAlex aliases/);
});

test('actual native coupling builder supports CPM audits, cosine thresholds and exact ablation without descriptive-label fallback', async () => {
 const fixture = couplingFixture(); fixture.graph.clustering = {algorithm: 'leiden', objective: 'CPM', resolution: .02}; fixture.graph.resolution = .02;
 assert.equal(fixture.graph.construction.normalization, 'cosine'); assert.equal(/cosine/i.test(fixture.graph.normalization), false);
 const retained = structuredClone(fixture), audit = await runResearchCheck({kind: 'edge-audit', ...fixture});
 assert.equal(audit.results.status, 'verified'); assert.equal(audit.results.expectedEdges, 3);
 const threshold = preflightResearchCheck({kind: 'threshold', ...fixture}); assert.equal(threshold.details.metric, 'retained exact cosine edge weight');
 const result = await runResearchCheck({kind: 'reference-ablation', ...fixture, options: {referenceIds: ['W1']}});
 assert.equal(result.variants.length, 1); assert.ok(result.variants[0].runs.every(run => run.actualSettings.objective === 'cpm' && run.actualSettings.resolution === .02));
 assert.deepEqual(fixture, retained);
 fixture.graph.clustering.objective = 'unspecified';
 assert.throws(() => preflightResearchCheck({kind: 'reference-ablation', ...fixture, options: {referenceIds: ['W1']}}), /no fallback objective/);
});

test('conflicting or unknown operative cosine declarations are refused consistently by construction checks', () => {
 const fixture = couplingFixture(); fixture.graph.normalization = 'raw shared references';
 for (const kind of ['edge-audit', 'threshold', 'reference-ablation']) assert.throws(() => preflightResearchCheck({kind, ...fixture, options: kind === 'reference-ablation' ? {referenceIds: ['W1']} : {}}), /Conflicting declared edge normalizations/);
 fixture.graph.normalization = 'cosine'; fixture.graph.construction.normalization = 'unknown custom formula';
 assert.throws(() => preflightResearchCheck({kind: 'edge-audit', ...fixture}), /operative construction normalization is unknown/);
});

test('wrong-method protocol fields fail instead of pretending a different check was executed', () => {
 for (const [kind, options] of [['seed', {thresholds: [0]}], ['seed', {seed: 99}], ['article-only', {rankMetric: 'strength'}], ['edge-audit', {referenceIds: ['W1']}], ['text-neighbours', {minimumCosine: .2}]]) assert.throws(() => preflightResearchCheck({kind, graph: graph(), options}), /protocol option/);
 assert.throws(() => preflightResearchCheck({kind: 'seed', graph: graph(), options: []}), /options must be an object/);
 assert.equal(preflightResearchCheck({kind: 'seed', graph: graph(), options: {typeMap: {a: 'article'}}}).available, true);
});
