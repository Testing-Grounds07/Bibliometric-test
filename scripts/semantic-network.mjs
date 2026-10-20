import {partition} from './auto-cpm.mjs';
import {scienceDigest} from './scientific-manifest.mjs';

export const SEMANTIC_VERSION = 'semantic-networks-v1';
const stopWords = new Set('a an and are as at be been being by can did do does for from had has have how if in into is it its may more most not of on or our than that the their them there these they this those through to under using was we were what when where which who will with within without would'.split(' '));
const cleanText = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const textIdentity = (works,kind) => scienceDigest(works.map(work=>({id:work.id,...semanticText(work),topics:kind==='topics'?work.topics||[]:undefined})).sort((left,right)=>left.id.localeCompare(right.id)));
const vectorIdentity = (works,cache) => scienceDigest({model:cache.model,revision:cache.revision,dimensions:cache.dimensions,encoding:cache.encoding,textScope:cache.textScope,documents:works.map(work=>({id:work.id,title:cleanText(cache.documents[work.id].title),abstract:cleanText(cache.documents[work.id].abstract),embedding:cache.documents[work.id].embedding})).sort((left,right)=>left.id.localeCompare(right.id))});
export function semanticText(work) {
 const inverted = work.abstract_inverted_index;
 const abstract = work.abstract || (inverted ? Object.entries(inverted).flatMap(([word, offsets]) => offsets.map(offset => [offset, word])).sort((left, right) => left[0] - right[0]).map(([, word]) => word).join(' ') : '');
 const rawTitle=cleanText(work.display_name||work.title),title=rawTitle===work.id||/^(?:https?:\/\/openalex\.org\/)?W\d+$/i.test(rawTitle)?'':rawTitle;
 return {title, abstract: cleanText(abstract)};
}
export function semanticSettings(options = {}) {
 const settings = {kind: options.kind || 'terms', textScope: options.textScope || 'titles-abstracts', minimumSupport: Number(options.minimumSupport ?? 3), vocabularyLimit: Number(options.vocabularyLimit ?? 120), minimumScore: Number(options.minimumScore ?? .3), minimumSimilarity: Number(options.minimumSimilarity ?? .65), resolution: Number(options.resolution ?? .02), seed: 42};
 if (!['terms', 'topics', 'embeddings'].includes(settings.kind) || !['titles', 'titles-abstracts'].includes(settings.textScope)) throw new Error('Unknown semantic representation or text scope.');
 if (!Number.isInteger(settings.minimumSupport) || settings.minimumSupport < 1 || settings.minimumSupport > 100000 || !Number.isInteger(settings.vocabularyLimit) || settings.vocabularyLimit < 2 || settings.vocabularyLimit > 300 || !Number.isFinite(settings.minimumScore) || settings.minimumScore < 0 || settings.minimumScore > 1 || !Number.isFinite(settings.minimumSimilarity) || settings.minimumSimilarity < .1 || settings.minimumSimilarity > 1 || !Number.isFinite(settings.resolution) || settings.resolution <= 0 || settings.resolution > 1) throw new Error('Semantic thresholds are outside the supported range.');
 return settings;
}
function validateWorks(works) {
 if (!Array.isArray(works) || !works.length || works.length > 50000 || works.some(work => typeof work.id !== 'string' || !work.id) || new Set(works.map(work => work.id)).size !== works.length) throw new Error('Supply 1–50,000 distinct evidence records. No records are silently sampled.');
 let characters = 0;
 for (const work of works) {const text = semanticText(work), length = text.title.length + text.abstract.length; characters += length; if (length > 100000 || characters > 30000000) throw new Error('Text exceeds the bounded extraction budget (100,000 characters per source; 30 million total). Narrow the evidence; no text is silently truncated.');}
}
function literalFeatures(text, field) {
 const tokens = [...text.matchAll(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)], features = new Map();
 for (let offset = 0; offset < tokens.length; offset++) for (let size = 1; size <= 3 && offset + size <= tokens.length; size++) {
  const group = tokens.slice(offset, offset + size), words = group.map(token => token[0].toLocaleLowerCase('en'));
  if (words.some(word => stopWords.has(word) || word.length < 3 || /^\d+$/.test(word))) continue;
  const start = group[0].index, end = group.at(-1).index + group.at(-1)[0].length;
  if (size > 1 && /[^\p{L}\p{N}\s’'\-]/u.test(text.slice(start, end))) continue;
  const key = words.join(' ');
  if (!features.has(key)) features.set(key, {label: key, field, start, end, excerpt: text.slice(start, end)});
 }
 return features;
}
export function featureIncidence(works, options = {}) {
 validateWorks(works); const settings = semanticSettings(options), features = new Map();
 if (settings.kind === 'embeddings') throw new Error('Embedding similarity is not a co-occurrence graph.');
 let withText = 0, withAbstract = 0, withTopics = 0, assignments = 0;
 for (const work of works) {
  const text = semanticText(work); if (text.title || text.abstract) withText++; if (text.abstract) withAbstract++;if(work.topics?.length)withTopics++;
  const items = new Map();
  if (settings.kind === 'terms') for (const [field, value] of Object.entries(text)) {
   if (field === 'abstract' && settings.textScope === 'titles') continue;
   for (const [key, evidence] of literalFeatures(value, field)) if (!items.has(key)) items.set(key, {label: evidence.label, score: 1, evidence});
  } else {
   for (const topic of work.topics || []) {
    if (typeof topic.id !== 'string' || !topic.id || typeof topic.display_name !== 'string' || !Number.isFinite(topic.score) || topic.score < settings.minimumScore || topic.score > 1) continue;
    items.set(topic.id, {label: topic.display_name, score: topic.score, taxonomy: {subfield: topic.subfield, field: topic.field, domain: topic.domain}});
   }
  }
  for (const [key, item] of items) {
   if (++assignments > 2000000 || features.size > 300000) throw new Error('Term/topic extraction exceeds the bounded feature budget (300,000 candidates; two million source-feature assignments). Narrow the corpus or use titles only. No evidence was sampled.');
   if (!features.has(key)) features.set(key, {id: (settings.kind === 'terms' ? 'term:' : 'topic:') + key, key, label: item.label, support: [], scores: {}, evidence: {}, taxonomy: item.taxonomy});
   const feature = features.get(key); feature.support.push(work.id); feature.scores[work.id] = item.score; if (item.evidence) feature.evidence[work.id] = item.evidence;
  }
 }
 const eligible = [...features.values()].filter(feature => feature.support.length >= settings.minimumSupport).sort((left, right) => right.support.length - left.support.length || left.id.localeCompare(right.id));
 const selected = eligible.slice(0, settings.vocabularyLimit), coverage = {records: works.length, withText, withAbstract, withTopics, candidateFeatures: features.size, eligibleFeatures: eligible.length, displayedVocabulary: selected.length, vocabularyPolicy: 'Top features by distinct source support; all source records contribute. The vocabulary limit is an explicit analytical definition, not a sample of works.'};
 if (!selected.length) throw new Error(settings.kind === 'topics' ? 'No retained OpenAlex topic assignments meet these thresholds. Topics cannot be inferred from legacy concepts or titles.' : 'No literal terms meet these thresholds. Lower the minimum source support.');
 return {settings, features: selected, coverage};
}
function featureGraph(works, options) {
 const {settings, features, coverage} = featureIncidence(works, options), inverted = new Map(), links = new Map();
 for (const feature of features) for (const id of feature.support) {if (!inverted.has(id)) inverted.set(id, []); inverted.get(id).push(feature);}
 let contributions = 0;
 for (const [id, items] of inverted) for (let left = 0; left < items.length; left++) for (let right = left + 1; right < items.length; right++) {
  if (++contributions > 10000000) throw new Error('Co-occurrence exceeds 10 million feature-pair contributions. Reduce the vocabulary or narrow the evidence; nothing has been sampled.');
  const pair = [items[left], items[right]].sort((first, second) => first.id.localeCompare(second.id)), key = pair[0].id + '\u0000' + pair[1].id;
  if (!links.has(key)) links.set(key, {source: pair[0].id, target: pair[1].id, count: 0, rawSupport: 0, strength: 0, articles: []});
  const edge = links.get(key); edge.count++; edge.rawSupport++; edge.strength += settings.kind === 'topics' ? pair[0].scores[id] * pair[1].scores[id] : 1; edge.articles.push(id);
 }
 return {nodes: features.map(feature => ({...feature, title: feature.label, articles: feature.support, citations: feature.support.length, cluster: 0, entityKind: settings.kind === 'terms' ? 'term' : 'topic'})), links: [...links.values()].filter(edge => edge.rawSupport >= settings.minimumSupport), semantic: {version: SEMANTIC_VERSION, ...settings, coverage, sourceIds: works.map(work => work.id).sort(), classifierVersion: settings.kind === 'topics' ? 'Not retained by OpenAlex assignments; retrieval snapshot pins the observations.' : null, evidencePolicy: settings.kind === 'topics' ? 'Machine-assigned OpenAlex topics; not literal author keywords. Edge weight sums score products; raw support counts distinct sources.' : 'Verbatim normalized one-to-three-word phrases; English stop words; no stemming, synonym merging or generated concepts. Spans refer to normalized source text.'}};
}
function decodeEmbedding(value) {
 if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{512}$/.test(value)) throw new Error('Invalid signed-int8 MiniLM vector.');
 const bytes = atob(value), vector = new Float32Array(384); let norm = 0;
 for (let position = 0; position < 384; position++) {const code = bytes.charCodeAt(position), weight = code > 127 ? code - 256 : code; vector[position] = weight; norm += weight * weight;}
 if (!norm) throw new Error('Zero-norm MiniLM vector.'); norm = Math.sqrt(norm); for (let position = 0; position < 384; position++) vector[position] /= norm; return vector;
}
export function embeddingEvidence(works, cache, options = {}, corpusId) {
 validateWorks(works); const settings = semanticSettings({...options, kind: 'embeddings'});
 if (works.length > 3000) throw new Error('Exact MiniLM comparison supports up to 3,000 sources. Narrow the source scope; no automatic sampling is used.');
 if (!cache || cache.model !== 'sentence-transformers/all-MiniLM-L6-v2' || !/^[a-f0-9]{40}$/.test(cache.revision || '') || cache.dimensions !== 384 || cache.encoding !== 'signed-int8-base64-unit-vector' || typeof cache.textScope !== 'string' || !cache.textScope.trim()) throw new Error('A real pinned 384-dimensional MiniLM cache is required; no text-overlap fallback is used.');
 if (corpusId && cache.sourceCorpusId !== corpusId) throw new Error('Embedding cache belongs to different evidence.');
 if (settings.textScope !== 'titles-abstracts') throw new Error('This cached model was prepared from titles and available abstracts. A title-only model is not interchangeable.');
 let abstracts = 0;
 const records = works.map(work => {
  const document = cache.documents?.[work.id], current = semanticText(work);
  if(!current.title&&!current.abstract)throw new Error('No genuine title or abstract text is retained for '+work.id+'.');
  if (!document || cleanText(document.title) !== current.title || cleanText(document.abstract) !== current.abstract) throw new Error('Embedding text is missing or stale for ' + work.id + '. Prepare matching embeddings before running this view.');
  if (current.abstract) abstracts++;
  return {work, vector: decodeEmbedding(document.embedding)};
 });
 return {records, settings, model: {id: cache.model, revision: cache.revision, dimensions: cache.dimensions, encoding: cache.encoding, textScope: cache.textScope}, coverage: {records: works.length, withText: works.length, withAbstract: abstracts, vectors: records.length, missingVectors: 0, textMatch: 'All source titles and abstracts exactly match the normalized cached input.'}};
}
export async function preparedSemanticEvidence(works, cache, corpusId, useCachedAbstracts = false) {
 validateWorks(works);
 if (!useCachedAbstracts) return {works, supplementalText: null};
 if (!cache || !corpusId || cache.sourceCorpusId !== corpusId) throw new Error('Prepared text must match the selected evidence corpus.');
 let suppliedAbstracts = 0;
 const prepared = works.map(work => {
  const current = semanticText(work), document = cache.documents?.[work.id];
  if (!document || cleanText(document.title) !== current.title) throw new Error('Prepared title does not match selected source ' + work.id + '.');
  if (current.abstract && current.abstract !== cleanText(document.abstract)) throw new Error('Retained abstract differs from cached prepared text for ' + work.id + '.');
  if (!current.abstract && document.abstract) suppliedAbstracts++;
  return {...work, abstract: current.abstract || cleanText(document.abstract)};
 });
 const checksum = await scienceDigest({model: cache.model, revision: cache.revision, textScope: cache.textScope, documents: prepared.map(work => ({id: work.id, ...semanticText(work), embedding: cache.documents[work.id].embedding})).sort((left, right) => left.id.localeCompare(right.id))});
 return {works: prepared, supplementalText: {checksum, suppliedAbstracts, model: cache.model, revision: cache.revision, textScope: cache.textScope, source: 'Existing prepared source-text/model cache; independently pinned supplemental evidence, not a new OpenAlex retrieval.', verification: 'Corpus/source IDs and titles match; retained abstracts match. Missing source-record abstracts are supplied from the pinned cache, not verified against the retrieval snapshot.'}};
}
function embeddingGraph(works, cache, options, corpusId, progress) {
 const {records, settings, model, coverage} = embeddingEvidence(works, cache, options, corpusId), links = [];
 for (let left = 0; left < records.length; left++) {
  if (left % 50 === 0) progress('Comparing source text ' + left + '/' + records.length);
  for (let right = left + 1; right < records.length; right++) {
   let similarity = 0; for (let dimension = 0; dimension < 384; dimension++) similarity += records[left].vector[dimension] * records[right].vector[dimension];
   if (similarity + 1e-7 < settings.minimumSimilarity) continue;
   links.push({source: records[left].work.id, target: records[right].work.id, strength: Math.min(1, similarity), count: 1, rawSupport: null, similarity: Math.min(1, similarity), articles: []});
   if (links.length > 100000) throw new Error('More than 100,000 semantic edges. Raise minimum cosine similarity; no edges are silently discarded.');
  }
 }
 return {nodes: records.map(({work}) => ({...work, title: semanticText(work).title, label: semanticText(work).title,year:work.year??work.publication_year??null,authors:typeof work.authors==='string'?work.authors:(work.authorships||[]).map(item=>item.author?.display_name).filter(Boolean).join('; '), citations: 1, articles: [], cluster: 0, entityKind: 'source'})), links, semantic: {version: SEMANTIC_VERSION, ...settings, model, coverage, sourceIds: works.map(work => work.id).sort(), evidencePolicy: 'Cosine of real cached MiniLM document vectors. Similarity is not shared-reference support, agreement, significance or verified topical relevance.'}};
}
export function semanticHeadings(graph) {
 const result = {};
 for (const node of graph.nodes) if (node.cluster > 0) {if (!result[node.cluster]) result[node.cluster] = []; result[node.cluster].push(node);}
 return Object.fromEntries(Object.entries(result).map(([cluster, members]) => [cluster, {heading: members.slice().sort((left, right) => right.citations - left.citations || left.id.localeCompare(right.id)).slice(0, 2).map(node => node.label || node.title).join(' · '), keywords: [], representatives: [], total: members.length, withText: members.length, withAbstract: 0, evidenceMode: 'Deterministic feature heading', method: 'Most-supported observed features; not AI-generated or a validated theme.'}]));
}
export function semanticSourceHeadings(graph,cache){
 const groups=new Map();for(const node of graph.nodes)if(node.cluster>0){if(!groups.has(node.cluster))groups.set(node.cluster,[]);groups.get(node.cluster).push(node);}
 return Object.fromEntries([...groups].map(([cluster,members])=>{const terms=new Map();for(const node of members)for(const phrase of cache.documents[node.id].phrases||[]){if(!terms.has(phrase.text))terms.set(phrase.text,{text:phrase.text,sources:[],score:0});const term=terms.get(phrase.text);term.sources.push({id:node.id,evidence:phrase.evidence||[]});term.score+=Math.max(0,phrase.semantic||0);}const keywords=[...terms.values()].sort((left,right)=>right.sources.length-left.sources.length||right.score-left.score||left.text.localeCompare(right.text)).slice(0,5);return [cluster,{heading:keywords.slice(0,2).map(term=>term.text).join(' · ')||members[0].title,keywords,representatives:members.slice(0,3).map(node=>({id:node.id})),total:members.length,withText:members.length,withAbstract:members.filter(node=>cache.documents[node.id].abstract).length,evidenceMode:members.some(node=>cache.documents[node.id].abstract)?'Titles + available abstracts':'Title-only',method:'Immediate deterministic heading from observed cached source phrases; not an AI-generated theme.',model:cache.model,revision:cache.revision}];}));
}
export async function buildSemanticGraph(works, options = {}, cache = null, context = {}, progress = () => {}) {
 const settings = semanticSettings(options), graph = settings.kind === 'embeddings' ? embeddingGraph(works, cache, settings, context.sourceCorpusId, progress) : featureGraph(works, settings);
 const degrees = new Map(graph.nodes.map(node => [node.id, 0])); for (const edge of graph.links) for (const id of [edge.source, edge.target]) degrees.set(id, degrees.get(id) + 1);
 for (const [position, node] of graph.nodes.entries()) Object.assign(node, {key: node.id, degree: degrees.get(node.id), x: Math.cos(position * 2.399963229728653) * 40 * Math.sqrt(position + 1), y: Math.sin(position * 2.399963229728653) * 40 * Math.sqrt(position + 1)});
 const fit = partition(graph, settings.resolution, 3, settings.seed); for (const node of graph.nodes) node.cluster = fit.memberships[node.id] || 0;
 Object.assign(graph, {canvasKind: 'semantic',externalCorpus:context.externalCorpus===true, method: 'semantic', entityKind: settings.kind === 'embeddings' ? 'source' : settings.kind === 'terms' ? 'term' : 'topic', networkModel: 'pairwise', order: 2, maximumOrder: 2, minimumSupport: settings.kind === 'embeddings' ? 1 : settings.minimumSupport, normalization: settings.kind === 'embeddings' ? 'MiniLM cosine' : settings.kind === 'topics' ? 'classifier-score-products' : 'raw co-occurrence', counting: 'distinct-source-full', sourceCorpusId: context.sourceCorpusId, evidenceProvenance: context.evidenceProvenance, resolution: settings.resolution, clustering: {algorithm: 'leiden', label: 'Leiden CPM', resolution: settings.resolution, seed: settings.seed, restarts: 3, objective: 'CPM'}, appliedSettings: {settings: {label: 'Semantic network'}}, stats: {nodes: graph.nodes.length, edges: graph.links.length, clusters: fit.clusters, isolated_nodes: graph.nodes.filter(node => !node.degree).length}});
 graph.semantic.textFingerprint = await textIdentity(works,settings.kind);
 if(settings.kind==='embeddings')graph.semantic.embeddingFingerprint=await vectorIdentity(works,cache);
 if(context.referenceGraph)graph.semantic.referenceScope={nodes:context.referenceGraph.nodes.map(node=>({id:node.id,key:node.key||node.id,aliases:[...new Set([node.id,node.key,...(node.aliases||node.variants||[])].filter(value=>typeof value==='string'))],label:node.label||node.title||node.id,cluster:node.cluster})),parentAnalysis:context.referenceGraph.scientificManifest?.fingerprints?.analysis||null};
 if (graph.entityKind !== 'source') graph.themeDescriptions = semanticHeadings(graph);
 else graph.themeDescriptions=semanticSourceHeadings(graph,cache);
 return graph;
}
export function semanticLinkage(graph, sourceIds) {
 const selected = new Set(sourceIds), links = graph.nodes.map(node => ({id: node.id, sourceIds: graph.entityKind === 'source' || graph.canvasKind === 'coupling' ? selected.has(node.id) ? [node.id] : [] : (node.articles || []).filter(id => selected.has(id))}));
 return {mapping: 'Observed source membership/citations, not an equivalence between reference and source partitions.', nodes: links, coveredSources: new Set(links.flatMap(node => node.sourceIds)).size};
}
export function citationCrosswalk(graph, works, cluster = null) {
 const scope=graph.semantic?.referenceScope;if(!scope)return {status:'unavailable',reason:'No parent co-citation scope was retained for this semantic result. Open its co-citation map and build a semantic view to create the crosswalk.'};
 const selected=new Set(graph.nodes.filter(node=>!Number(cluster)||node.cluster===Number(cluster)).flatMap(node=>graph.entityKind==='source'?[node.id]:node.articles)),references=new Map(scope.nodes.map(node=>[node.id,{...node,sourceIds:[]}])),lookup=new Map(),referenceKey=value=>{const key=value.replace(/^https?:\/\/openalex\.org\//i,'');return /^W\d+$/i.test(key)?key.toUpperCase():value;};
 for(const node of references.values())for(const alias of new Set([node.id,node.key,...(node.aliases||[])].filter(value=>typeof value==='string'))){const key=referenceKey(alias);if(lookup.has(key)&&lookup.get(key)!==node.id)return {status:'unavailable',reason:'The retained parent scope has ambiguous reference aliases; no crosswalk is inferred.'};lookup.set(key,node.id);}
 for(const work of works)if(selected.has(work.id)){const matched=new Set();for(const id of new Set(work.references||work.referenced_works||[])){const nodeId=lookup.get(referenceKey(id));if(nodeId&&!matched.has(nodeId)){references.get(nodeId).sourceIds.push(work.id);matched.add(nodeId);}}}
 const retained=[...references.values()].filter(node=>node.sourceIds.length).sort((left,right)=>right.sourceIds.length-left.sourceIds.length||left.id.localeCompare(right.id)),groups=new Map();
 for(const node of retained){if(!groups.has(node.cluster))groups.set(node.cluster,new Set());for(const id of node.sourceIds)groups.get(node.cluster).add(id);}
 return {status:'observed',selectedSources:selected.size,references:retained,clusters:[...groups].map(([id,sourceIds])=>({id,sourceIds:[...sourceIds].sort()})).sort((left,right)=>right.sourceIds.length-left.sourceIds.length),limitation:'Observed citations link distinct source papers to the retained co-citation scope. Cluster supports overlap and are not additive; no ARI is computed between different node types.'};
}
export function commonSourceComparison(first, second) {
 const sourceGraph = graph => graph.entityKind === 'source' || graph.canvasKind === 'coupling';
 if (!sourceGraph(first) || !sourceGraph(second)) throw new Error('Partition comparison requires two source-article graphs; feature and cited-reference universes are not interchangeable.');
 const secondIds = new Set(second.nodes.map(node => node.id)), common = first.nodes.filter(node => secondIds.has(node.id)).map(node => node.id).sort(), commonSet = new Set(common);
 const memberships = graph => new Map(graph.nodes.filter(node => commonSet.has(node.id)).map(node => [node.id, node.cluster > 0 ? String(node.cluster) : 'unassigned:' + node.id]));
 const left = memberships(first), right = memberships(second), leftCounts = new Map(), rightCounts = new Map(), joint = new Map(), choose = value => value * (value - 1) / 2;
 for (const id of common) {const row = left.get(id), column = right.get(id), key = row + '\u0000' + column; leftCounts.set(row, (leftCounts.get(row) || 0) + 1); rightCounts.set(column, (rightCounts.get(column) || 0) + 1); joint.set(key, (joint.get(key) || 0) + 1);}
 const pairs = choose(common.length), rowPairs = [...leftCounts.values()].reduce((sum, value) => sum + choose(value), 0), columnPairs = [...rightCounts.values()].reduce((sum, value) => sum + choose(value), 0), jointPairs = [...joint.values()].reduce((sum, value) => sum + choose(value), 0), expected = pairs ? rowPairs * columnPairs / pairs : 0, denominator = (rowPairs + columnPairs) / 2 - expected;
 const firstUnassigned = common.filter(id => left.get(id).startsWith('unassigned:')).length, secondUnassigned = common.filter(id => right.get(id).startsWith('unassigned:')).length, commonAssignedBoth = common.filter(id => !left.get(id).startsWith('unassigned:') && !right.get(id).startsWith('unassigned:')).length;
 return {universe: 'Exact intersection of source IDs; unassigned articles treated as separate singletons.', commonIds: common, firstOnly: first.nodes.length - common.length, secondOnly: second.nodes.length - common.length, firstUnassigned, secondUnassigned, commonAssignedBoth, adjustedRandIndex: common.length < 2 ? null : denominator ? (jointPairs - expected) / denominator : 1, trivialPartition: !denominator, limitation: 'Agreement compares definitions, not truth, topic quality or relevance. Identical all-singleton or all-in-one partitions can have ARI 1 without meaningful research groups.'};
}
export async function semanticSensitivity(works, graph, cache, context, progress = () => {}) {
 if (!graph.semantic) throw new Error('A semantic parent graph is required.');
 if(await textIdentity(works,graph.semantic.kind)!==graph.semantic.textFingerprint)throw new Error('Pinned semantic source text/assignments changed. Build a new map rather than label this fixed-evidence sensitivity.');
 if(graph.semantic.supplementalText&&context?.supplementalText?.checksum!==graph.semantic.supplementalText.checksum)throw new Error('Pinned supplemental prepared-text evidence changed or is unavailable.');
 if(graph.semantic.kind==='embeddings'){const validated=embeddingEvidence(works,cache,graph.semantic,context?.sourceCorpusId);if(JSON.stringify(validated.model)!==JSON.stringify(graph.semantic.model)||!graph.semantic.embeddingFingerprint||await vectorIdentity(works,cache)!==graph.semantic.embeddingFingerprint)throw new Error('Pinned embedding model revision/vector/text evidence changed. Rebuild rather than claim a fixed-model sensitivity check.');}
 const settings = graph.semantic, variants = settings.kind === 'embeddings' ? [{...settings, minimumSimilarity: Math.max(.1, settings.minimumSimilarity - .05)}, {...settings, minimumSimilarity: Math.min(1, settings.minimumSimilarity + .05)}] : [{...settings, minimumSupport: Math.max(1, settings.minimumSupport - 1)}, {...settings, minimumSupport: settings.minimumSupport + 1}, ...(settings.kind === 'terms' ? [{...settings, textScope: settings.textScope === 'titles' ? 'titles-abstracts' : 'titles'}] : [{...settings, minimumScore: Math.min(1, settings.minimumScore + .1)}])];
 const results = [];
 for (const options of variants) {
  progress('Checking semantic definition ' + (results.length + 1) + '/' + variants.length);
  try {const candidate = await buildSemanticGraph(works, options, cache, context, progress), first = new Set(graph.nodes.map(node => node.id)), shared = candidate.nodes.filter(node => first.has(node.id)).length; results.push({settings: semanticSettings(options), nodes: candidate.nodes.length, edges: candidate.links.length, sharedNodes: shared, nodeJaccard: shared / (graph.nodes.length + candidate.nodes.length - shared), comparison: graph.entityKind === 'source' ? commonSourceComparison(graph, candidate) : null});} catch (problem) {results.push({settings: semanticSettings(options), status: 'unavailable', reason: problem.message});}
 }
 return semanticSensitivityReport(results,settings);
}
export function semanticSensitivityReport(results,settings={}){const completed=results.filter(result=>result.status!=='unavailable').length;return {version:SEMANTIC_VERSION,status:completed===results.length&&results.length?'completed':completed?'partial':'unavailable',attempted:results.length,completed,unavailable:results.length-completed,variants:results,fixedModel:settings.model||null,modelSensitivity:settings.kind==='embeddings'?'Only the pinned cached model is available; no alternative model was computed or downloaded.':'No embedding model is used for literal-term or classifier-topic co-occurrence. Text/assignment observations remain pinned; no alternative classifier was computed.',limitation:'Bounded text/threshold/feature-definition sensitivity, not citation bootstrap, significance or proof of a best setting. Fixed CPM also changes effective scale when edge weights change.'};}
