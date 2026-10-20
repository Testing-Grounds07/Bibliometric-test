import {partition} from './auto-cpm.mjs';
import {scienceDigest} from './scientific-manifest.mjs';

export const COLLABORATION_VERSION = 'work-specific-collaboration-v1';
export function linkedSourceScope(graph){
 if(!graph||!(graph.canvasKind==='coupling'||graph.semantic&&graph.entityKind==='source'))return null;
 return {kind:graph.canvasKind==='coupling'?'coupling':'source-text',evidenceId:graph.evidenceProvenance?.evidenceId||null,parentAnalysisFingerprint:graph.scientificManifest?.fingerprints?.analysis||null,parentFingerprintStatus:graph.scientificManifest?.fingerprints?.analysis?'Recorded completed analysis fingerprint':'No historical fingerprint retained; explicit construction/memberships below identify the observed linkage.',construction:{method:graph.method,counting:graph.counting,normalization:graph.normalization,minimumShared:graph.minimumShared??null,minimumCosine:graph.minimumCosine??null,clustering:graph.clustering||null,semantic:graph.semantic?{kind:graph.semantic.kind,textScope:graph.semantic.textScope,minimumSimilarity:graph.semantic.minimumSimilarity,model:graph.semantic.model,textFingerprint:graph.semantic.textFingerprint,embeddingFingerprint:graph.semantic.embeddingFingerprint,implementationVersion:graph.semantic.implementationVersion||graph.semantic.version}:null},nodes:graph.nodes.map(node=>({id:node.id,cluster:node.cluster}))};
}
const clean = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values)].sort();
const actorId = (value, kind) => typeof value === 'string' && new RegExp('^(?:https?://openalex\\.org/)?' + (kind === 'author' ? 'A' : 'I') + '\\d+$', 'i').test(value) ? 'https://openalex.org/' + value.split('/').pop().toUpperCase() : null;
export async function preparedCollaborationEvidence(works, supplemental, corpusId, useSupplement = false, privateContext = false) {
 if (!useSupplement) return {works, supplementalMetadata: null};
 if (privateContext) throw Error('Private project evidence cannot use the public supplemental metadata endpoint.');
 if (!supplemental || supplemental.sourceCorpusId !== corpusId || supplemental.publicCorpus !== true || supplemental.works.length !== works.length) throw Error('Supplemental metadata does not match the complete allowlisted public source corpus.');
 const expected = new Map(works.map(work => [work.id, work]));
 if (new Set(supplemental.works.map(work => work.id)).size !== works.length || supplemental.works.some(work => !expected.has(work.id) || clean(work.title) !== clean(expected.get(work.id).title || expected.get(work.id).display_name))) throw Error('Supplemental source IDs or titles differ from the pinned public corpus.');
 const checksum = await scienceDigest(supplemental.works);
 if (checksum !== supplemental.checksum) throw Error('Supplemental metadata checksum failed.');
 const lookup = new Map(supplemental.works.map(work => [work.id, work]));
 return {works: works.map(work => {const extra = lookup.get(work.id); if (Array.isArray(work.authorships) && JSON.stringify(work.authorships) !== JSON.stringify(extra.authorships)) throw Error('Retained authorships differ from the supplemental pin.'); return {...work, authors_count: work.authors_count ?? extra.authors_count, authorships: work.authorships || extra.authorships};}), supplementalMetadata: {checksum, sourceCorpusId: corpusId, preparedAt: supplemental.preparedAt, retrievedAt: supplemental.retrievedAt || null, extractionVersion: supplemental.extractionVersion, sourceFileChecksum: supplemental.sourceFileChecksum, scope: 'Exact allowlisted public source IDs and titles. Retained authorship/affiliation evidence only; independently pinned, not a fresh retrieval or verified historical metadata completeness.'}};
}
export function collaborationSettings(options = {}) {
 const settings = {kind: options.kind || 'author', counting: options.counting || 'fractional-pair', minimumPublications: Number(options.minimumPublications ?? 1), minimumSupport: Number(options.minimumSupport ?? 1), resolution: Number(options.resolution ?? .02), seed: Number(options.seed ?? 42), institutionPolicy: options.institutionPolicy || 'direct', parentInstitutionId: options.parentInstitutionId || null, maximumTeamSize: options.maximumTeamSize == null || options.maximumTeamSize === '' ? null : Number(options.maximumTeamSize), affiliationPolicy: options.affiliationPolicy || 'all-recorded', identityScenario: options.identityScenario || null};
 if (!['author', 'institution', 'country'].includes(settings.kind) || !['full-pair', 'fractional-pair'].includes(settings.counting) || !['direct', 'recorded-parent'].includes(settings.institutionPolicy) || !['all-recorded', 'single-institution-authorships'].includes(settings.affiliationPolicy)) throw Error('Unsupported collaboration construction.');
 if (!Number.isInteger(settings.minimumSupport) || settings.minimumSupport < 1 || settings.minimumSupport > 50000 || !Number.isFinite(settings.resolution) || settings.resolution <= 0 || settings.resolution > 1 || !Number.isInteger(settings.seed) || settings.seed < 0 || settings.maximumTeamSize != null && (!Number.isInteger(settings.maximumTeamSize) || settings.maximumTeamSize < 2 || settings.maximumTeamSize > 1000)) throw Error('Collaboration settings exceed the supported bounds.');
 if (settings.institutionPolicy === 'recorded-parent' && !actorId(settings.parentInstitutionId, 'institution')) throw Error('Choose an explicit recorded OpenAlex parent institution ID. No parent is inferred from a name.');
 if (settings.identityScenario && (settings.kind !== 'author' || !clean(settings.identityScenario.note))) throw Error('Identity scenarios require author nodes and an explicit human audit note.');
 if(!Number.isInteger(settings.minimumPublications)||settings.minimumPublications<1||settings.minimumPublications>50000)throw Error('Actor publication minimum must be 1–50,000 distinct works in this pinned corpus, not global citations.');
 return settings;
}
export function collaborationIncidence(works, options = {}) {
 const settings = collaborationSettings(options);
 if (!Array.isArray(works) || !works.length || works.length > 50000 || new Set(works.map(work => work.id)).size !== works.length || works.some(work => typeof work.id !== 'string' || !work.id)) throw Error('Supply 1–50,000 distinct pinned source records. No sources are silently sampled.');
 if(works.some(work=>Array.isArray(work.authorships)&&work.authorships.length>5000)||works.reduce((sum,work)=>sum+(work.authorships?.length||0),0)>500000)throw Error('Retained authorship input exceeds 5,000 per source or 500,000 total. Narrow evidence; no authorships are silently truncated.');
 const actors = new Map(), events = [], coverage = {records: works.length, retainedAuthorshipLists: 0, missingAuthorshipLists: 0, retainedAuthorships: 0, missingAuthorIds: 0, duplicateAuthorIds: 0, missingAffiliationAuthorships: 0, missingInstitutionIds: 0, missingCountryAffiliations: 0, rawCountryAuthorships: 0, reportedAuthorCountsKnown: 0, reportedAuthorCountsUnknown: 0, potentiallyTruncatedLists: 0, atListResponseBoundary: 0, lineageKnownAffiliations: 0, lineageUnknownAffiliations: 0, excludedMultiAffiliationAuthorships: 0, excludedLargeTeamWorks: 0, eligibleWorks: 0, withPairs: 0, completeness: 'Recorded counts and lists do not establish complete authorship/affiliation coverage. List responses may stop at 100 authorships; provider counts can themselves be capped.'};
 const add = (map, id, label, evidence) => {if (!map.has(id)) map.set(id, {id, label: clean(label) || id, evidence: []}); map.get(id).evidence.push(evidence);};
 for (const work of works) {
  const list = Array.isArray(work.authorships) ? work.authorships : [], declared = work.authors_count ?? work.authorsCount;
  if (Array.isArray(work.authorships)) coverage.retainedAuthorshipLists++; else coverage.missingAuthorshipLists++;
  if (Number.isInteger(declared) && declared >= 0) {coverage.reportedAuthorCountsKnown++; if (declared > list.length) coverage.potentiallyTruncatedLists++;} else coverage.reportedAuthorCountsUnknown++;
  coverage.retainedAuthorships += list.length;
  if (list.length >= 100) coverage.atListResponseBoundary++;
  const members = new Map(), seen = new Set();
  for (const authorship of list) {
   const author = actorId(authorship.author?.id, 'author'), institutions = Array.isArray(authorship.institutions) ? authorship.institutions : [];
   if (!author) coverage.missingAuthorIds++; else if (seen.has(author)) coverage.duplicateAuthorIds++; else seen.add(author);
   if (!institutions.length) coverage.missingAffiliationAuthorships++;
   if (settings.kind === 'author' && author) add(members, author, authorship.author.display_name, {workId: work.id, authorId: author, institutions: institutions.map(item => item.id).filter(Boolean)});
   const rawCountries = unique((authorship.countries || []).filter(value => typeof value === 'string' && /^[A-Z]{2}$/i.test(value)).map(value => value.toUpperCase()));
   if (rawCountries.length) coverage.rawCountryAuthorships++;
   const affiliationIds = unique(institutions.map(item => actorId(item.id, 'institution')).filter(Boolean));
   if (settings.affiliationPolicy === 'single-institution-authorships' && affiliationIds.length > 1) {coverage.excludedMultiAffiliationAuthorships++; continue;}
   if (settings.kind === 'country') for (const country of rawCountries) add(members, 'country:' + country, country, {workId: work.id, authorId: author, country, source: 'Recorded authorship country; may derive from an unmatched raw affiliation address.'});
   for (const institution of institutions) {
    const direct = actorId(institution.id, 'institution'); if (!direct) coverage.missingInstitutionIds++;
    const lineage = Array.isArray(institution.lineage) ? unique(institution.lineage.map(value => actorId(typeof value === 'string' ? value : value.id, 'institution')).filter(Boolean)) : null;
    if (lineage) coverage.lineageKnownAffiliations++; else coverage.lineageUnknownAffiliations++;
    const country = typeof institution.country_code === 'string' && /^[A-Z]{2}$/.test(institution.country_code.toUpperCase()) ? institution.country_code.toUpperCase() : null;
    if (!country) coverage.missingCountryAffiliations++;
    if (settings.kind === 'country') {if (country) add(members, 'country:' + country, country, {workId: work.id, authorId: author, institutionId: direct, country}); continue;}
    if (settings.kind === 'author') continue;
    if (!direct) continue;
    const parent = actorId(settings.parentInstitutionId, 'institution'), rolled = settings.institutionPolicy === 'recorded-parent' && lineage?.includes(parent), id = rolled ? parent : direct;
    add(members, id, rolled ? parent : institution.display_name, {workId: work.id, authorId: author, institutionId: direct, country, recordedLineage: lineage, rolledUp: rolled});
   }
  }
  if (settings.maximumTeamSize && Math.max(seen.size, list.length, Number.isInteger(declared) ? declared : 0) > settings.maximumTeamSize) {coverage.excludedLargeTeamWorks++; continue;}
  if (members.size) coverage.eligibleWorks++; if (members.size > 1) coverage.withPairs++;
  for (const member of members.values()) {if (!actors.has(member.id)) actors.set(member.id, {id: member.id, label: member.label, sourceIds: [], evidence: {}}); const actor = actors.get(member.id); actor.sourceIds.push(work.id); actor.evidence[work.id] = member.evidence;}
  events.push({workId: work.id, members: [...members.keys()].sort()});
 }
 if (!actors.size) throw Error('No stable ' + settings.kind + ' identities are retained in the pinned authorships. Names and free-text affiliations are not identity keys.');
 if (settings.kind === 'institution' && settings.institutionPolicy === 'recorded-parent' && !coverage.lineageKnownAffiliations) throw Error('No recorded institution lineage is retained. A parent rollup cannot be inferred.');
 if (actors.size > 10000 || events.reduce((sum, event) => sum + event.members.length * (event.members.length - 1) / 2, 0) > 2000000) throw Error('Collaboration exceeds 10,000 actors or two million per-work pair contributions. Narrow the corpus or explicitly exclude large teams; no actors are silently sampled.');
 const result = applyIdentityScenario({settings, actors, events, coverage});
 if (result.actors.size > 10000 || result.events.reduce((sum, event) => sum + event.members.length * (event.members.length - 1) / 2, 0) > 2000000) throw Error('The audited scenario exceeds the supported actor/pair budget. No identities are sampled.');
 const selected=new Set([...result.actors.values()].filter(actor=>actor.sourceIds.length>=settings.minimumPublications).map(actor=>actor.id));
 result.coverage.candidateActors=result.actors.size;result.coverage.excludedLowPublicationActors=result.actors.size-selected.size;result.coverage.excludedActorWorkIncidences=[...result.actors.values()].filter(actor=>!selected.has(actor.id)).reduce((sum,actor)=>sum+actor.sourceIds.length,0);result.coverage.beforeActorThresholdPairWorks=result.coverage.withPairs;
 result.actors=new Map([...result.actors].filter(([id])=>selected.has(id)));result.events=result.events.map(event=>({...event,observedTeamSize:event.members.length,members:event.members.filter(id=>selected.has(id))}));result.coverage.eligibleWorks=result.events.filter(event=>event.members.length).length;result.coverage.withPairs=result.events.filter(event=>event.members.length>1).length;
 if(!result.actors.size)throw Error('No actors meet the explicit distinct-source publication minimum. Lower it to include the complete observed actor universe.');
 return result;
}
function applyIdentityScenario(input) {
 const scenario = input.settings.identityScenario; if (!scenario) return input;
 const {actors} = input, sourceIds = new Set(input.events.map(event => event.workId)), mappings = new Map(), used = new Set(), targets = new Set();
 for (const merge of scenario.merges || []) {
  if (!actors.has(merge.into) || !Array.isArray(merge.from) || !merge.from.length || used.has(merge.into)) throw Error('Audit merges must target an existing retained author ID without chains.');
  targets.add(merge.into);
  for (const id of merge.from) {if (!actors.has(id) || used.has(id) || targets.has(id)) throw Error('Unknown, chained or overlapping audited author merge.'); used.add(id); mappings.set(id, {all: merge.into});}
 }
 for (const split of scenario.splits || []) {
  if (!actors.has(split.actorId) || used.has(split.actorId) || targets.has(split.actorId) || !Array.isArray(split.assignments) || !split.assignments.length) throw Error('Unknown or overlapping audited author split.');
  used.add(split.actorId); const assigned = new Map();
  for (const assignment of split.assignments) {
   if (typeof assignment.targetId !== 'string' || !/^audit:[\w.-]{1,80}$/.test(assignment.targetId) || actors.has(assignment.targetId) || !clean(assignment.label)) throw Error('Split identities need an explicit unique audit: key and label; they are not OpenAlex identities.');
   for (const id of assignment.sourceIds || []) {if (!sourceIds.has(id) || !actors.get(split.actorId).sourceIds.includes(id) || assigned.has(id)) throw Error('Split assignments must be distinct observed works for that author.'); assigned.set(id, assignment.targetId);}
   actors.set(assignment.targetId, {id: assignment.targetId, label: clean(assignment.label), sourceIds: [], evidence: {}, auditedLocalIdentity: true});
  }
  mappings.set(split.actorId, {byWork: assigned});
 }
 const result = new Map(), events = input.events.map(event => ({...event, members: unique(event.members.map(id => mappings.get(id)?.all || mappings.get(id)?.byWork?.get(event.workId) || id))}));
 for (const event of input.events) for (const oldId of event.members) {
  const id = mappings.get(oldId)?.all || mappings.get(oldId)?.byWork?.get(event.workId) || oldId, actor = actors.get(id);
  if (!result.has(id)) result.set(id, {...actor, sourceIds: [], evidence: {}});
  const target = result.get(id); if (!target.sourceIds.includes(event.workId)) target.sourceIds.push(event.workId);
  target.evidence[event.workId] = [...(target.evidence[event.workId] || []), ...actors.get(oldId).evidence[event.workId]];
 }
 return {...input, actors: result, events};
}
export function collaborationHeadings(graph, works) {
 const lookup = new Map(works.map(work => [work.id, work]));
 return Object.fromEntries(unique(graph.nodes.filter(node => node.cluster > 0).map(node => node.cluster)).map(cluster => {
  const ids = unique(graph.nodes.filter(node => node.cluster === cluster).flatMap(node => node.articles)), records = ids.map(id => lookup.get(id)).filter(Boolean), phrases = new Map();
  for (const work of records) for (const phrase of new Set((clean(work.display_name || work.title)===work.id?[]:(clean(work.display_name || work.title).toLowerCase().match(/[\p{L}]{4,}/gu) || [])).filter(word => !['with','from','this','that','their','using','study','research','review','into','between'].includes(word)))) {if (!phrases.has(phrase)) phrases.set(phrase, []); phrases.get(phrase).push(work.id);}
  const keywords = [...phrases].sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0])).slice(0, 5).map(([text, sourceIds]) => ({text, sources: sourceIds.map(id => ({id}))}));
  return [cluster, {heading: keywords.slice(0, 2).map(item => item.text).join(' · ') || 'Associated source articles', keywords, representatives: ids.slice(0, 3).map(id => ({id})), total: ids.length, withText: records.filter(work => work.title || work.display_name).length, withAbstract: 0, evidenceMode: 'Associated source titles', method: 'Deterministic title words counted once per associated source work. Not a validated research theme; person/institution IDs are never sent to Qwen.'}];
 }));
}
export async function buildCollaborationGraph(works, options = {}, context = {}, progress = () => {}) {
 const {settings, actors, events, coverage} = collaborationIncidence(works, options), edges = new Map();
 for (const event of events) {
  const size = event.members.length, observed=event.observedTeamSize, contribution = settings.counting === 'fractional-pair' ? 2 / (observed * (observed - 1)) : 1;
  for (let left = 0; left < size; left++) for (let right = left + 1; right < size; right++) {const source = event.members[left], target = event.members[right], key = source + '\0' + target; if (!edges.has(key)) edges.set(key, {source, target, strength: 0, count: 0, rawSupport: 0, articles: []}); const edge = edges.get(key); edge.strength += contribution; edge.count++; edge.rawSupport++; edge.articles.push(event.workId);}
  if (edges.size > 100000) throw Error('More than 100,000 collaboration edges. Narrow the evidence; no edges are silently discarded.');
 }
 const links = [...edges.values()].filter(edge => edge.rawSupport >= settings.minimumSupport), degrees = new Map([...actors.keys()].map(id => [id, 0])); for (const edge of links) {degrees.set(edge.source, degrees.get(edge.source) + 1); degrees.set(edge.target, degrees.get(edge.target) + 1);}
 coverage.retainedPairWeight=links.reduce((sum,edge)=>sum+edge.strength,0);coverage.observedPairWorksBeforePublicationCutoff=events.filter(event=>event.observedTeamSize>1).length;coverage.denominatorPolicy='Distinct observed actors after declared identity/affiliation policies, before publication minimum. Dropped actors remove their pair mass; remaining pairs are not renormalized.';
 const nodes = [...actors.values()].sort((left, right) => left.id.localeCompare(right.id)).map((actor, position) => ({...actor, key: actor.id, title: actor.label, authors: '', entityKind: settings.kind, citations: actor.sourceIds.length, articles: actor.sourceIds, degree: degrees.get(actor.id), year: null, cluster: 0, x: Math.cos(position * 2.399963229728653) * 40 * Math.sqrt(position + 1), y: Math.sin(position * 2.399963229728653) * 40 * Math.sqrt(position + 1)}));
 const graph = {nodes, links, canvasKind: 'collaboration',externalCorpus:context.externalCorpus===true, method: 'collaboration', entityKind: settings.kind, networkModel: 'pairwise', order: 2, maximumOrder: 2, minimumSupport: settings.minimumSupport, normalization: settings.counting, counting: settings.counting, sourceCorpusId: context.sourceCorpusId, evidenceProvenance: context.evidenceProvenance, resolution: settings.resolution, appliedSettings: {settings: {label: 'Collaboration construction'}}, collaboration: {version: COLLABORATION_VERSION, ...settings, coverage, sourceIds: works.map(work => work.id).sort(), supplementalMetadata: context.supplementalMetadata || null, referenceScope: context.referenceScope || null,linkedWorkScope:context.linkedWorkScope||null, evidencePolicy: settings.kind === 'author' ? 'Authors are connected by observed co-authorship on a source work. Co-authorship is not proof of interpersonal collaboration or equal contribution.' : 'Actors co-occur in work-specific authorship affiliations. Co-affiliation on a paper is not proof of a direct person-to-person or organization-to-organization collaboration.', limitations: 'OpenAlex identities and affiliation metadata may split, merge or omit real entities. Missing author counts, affiliations, countries and lineage do not mean known absence. These are descriptive projected networks, not validated social or thematic communities.'}};
 progress('Partitioning the declared collaboration network'); const fit = partition(graph, settings.resolution, 3, settings.seed); for (const node of nodes) node.cluster = fit.memberships[node.id] || 0;
 graph.clustering = {algorithm: 'leiden', label: 'Leiden CPM', objective: 'CPM', resolution: settings.resolution, seed: settings.seed, restarts: 3}; graph.stats = {nodes: nodes.length, edges: links.length, clusters: fit.clusters, isolated_nodes: nodes.filter(node => !node.degree).length};
 graph.collaboration.metadataFingerprint = await scienceDigest(works.map(work => ({id: work.id, authors_count: work.authors_count ?? work.authorsCount ?? null, authorships: work.authorships ?? null})).sort((left, right) => left.id.localeCompare(right.id)));
 graph.themeDescriptions = collaborationHeadings(graph, works); return graph;
}
export function collaborationEgo(parent, seedId, hops = 1) {
 if (!parent.collaboration || parent.collaboration.ego || !parent.nodes.some(node => node.id === seedId) || ![1, 2].includes(hops)) throw Error('Choose a retained actor in a full collaboration map, with one or two hops.');
 const selected = new Set([seedId]); for (let hop = 0; hop < hops; hop++) {const next = new Set(selected); for (const edge of parent.links) {if (selected.has(edge.source)) next.add(edge.target); if (selected.has(edge.target)) next.add(edge.source);} for (const id of next) selected.add(id);}
 if (selected.size > 1000) throw Error('The ego view exceeds 1,000 actors. Use one hop or a narrower graph. No neighbors are sampled.');
 const graph = structuredClone(parent); graph.nodes = graph.nodes.filter(node => selected.has(node.id)); graph.links = graph.links.filter(edge => selected.has(edge.source) && selected.has(edge.target)); delete graph.scienceAudit; delete graph.scientificManifest;delete graph.collaborationSensitivity;
 const degrees=new Map(graph.nodes.map(node=>[node.id,0]));for(const edge of graph.links){degrees.set(edge.source,degrees.get(edge.source)+1);degrees.set(edge.target,degrees.get(edge.target)+1);}for(const node of graph.nodes)node.degree=degrees.get(node.id);
 graph.themeDescriptions=Object.fromEntries(unique(graph.nodes.filter(node=>node.cluster>0).map(node=>node.cluster)).map(cluster=>{const members=graph.nodes.filter(node=>node.cluster===cluster),sources=new Set(members.flatMap(node=>node.articles)),previous=parent.themeDescriptions?.[cluster],keywords=(previous?.keywords||[]).map(keyword=>({...keyword,sources:keyword.sources.filter(source=>sources.has(source.id))})).filter(keyword=>keyword.sources.length).sort((left,right)=>right.sources.length-left.sources.length||left.text.localeCompare(right.text));return [cluster,{heading:keywords.slice(0,2).map(keyword=>keyword.text).join(' · ')||members[0].label,keywords,representatives:(previous?.representatives||[]).filter(record=>sources.has(record.id)),total:sources.size,evidenceMode:'Associated source titles · induced scope',method:'Retained observed parent title words filtered to the distinct source works associated with ego actors; not a re-mined theme or full-parent sensitivity result.'}];}));
 graph.collaboration.ego = {seedId, hops, nodeIds: [...selected].sort(), parentNodes: parent.nodes.length, parentEdges: parent.links.length, boundaryEdges: parent.links.filter(edge => selected.has(edge.source) !== selected.has(edge.target)).length, definition: 'Induced neighborhood of the completed parent graph. Parent cluster labels are retained; this is view-only, not reclustering. Parent metadata coverage remains full-pinned evidence; displayed degrees and any local roles describe only this induced scope.'}; graph.egoParent = structuredClone(parent); graph.stats = {...graph.stats, nodes: graph.nodes.length, edges: graph.links.length,isolated_nodes:graph.nodes.filter(node=>!node.degree).length, clusters: new Set(graph.nodes.filter(node => node.cluster > 0).map(node => node.cluster)).size}; return graph;
}
export async function collaborationSensitivity(works, parent, context = {}, progress = () => {}) {
 if (!parent.collaboration || parent.collaboration.ego) throw Error('Return to the full collaboration map before checking construction sensitivity.');
 const original = parent.collaboration, fingerprint = await scienceDigest(works.map(work => ({id: work.id, authors_count: work.authors_count ?? work.authorsCount ?? null, authorships: work.authorships ?? null})).sort((left, right) => left.id.localeCompare(right.id)));
 if (fingerprint !== original.metadataFingerprint) throw Error('The pinned authorship metadata changed; the original sensitivity evidence is unavailable.');
 if((original.supplementalMetadata?.checksum||null)!==(context.supplementalMetadata?.checksum||null))throw Error('The supplemental metadata pin changed; retrieve the original pinned supplement before comparison.');
 const alternatives = [{...original, counting: original.counting === 'full-pair' ? 'fractional-pair' : 'full-pair'}, {...original, maximumTeamSize: original.maximumTeamSize === 20 ? 10 : 20}, {...original,minimumPublications:original.minimumPublications===1?2:1}];
 if (original.kind !== 'author') alternatives.push({...original, affiliationPolicy: original.affiliationPolicy === 'all-recorded' ? 'single-institution-authorships' : 'all-recorded'});
 if(original.identityScenario)alternatives.push({...original,identityScenario:null});
 const originalEdges = new Set(parent.links.map(edge => edge.source + '\0' + edge.target)), variants = [];
 for (const options of alternatives) {progress('Checking collaboration definition ' + (variants.length + 1)); try {const graph = await buildCollaborationGraph(works, options, context), current = new Set(graph.links.map(edge => edge.source + '\0' + edge.target)), common = [...current].filter(key => originalEdges.has(key)).length; variants.push({settings: collaborationSettings(options), nodes: graph.nodes.length, edges: graph.links.length, edgeJaccard: common / (current.size + originalEdges.size - common || 1), coverage: graph.collaboration.coverage, memberships: Object.fromEntries(graph.nodes.map(node => [node.id, node.cluster]))});} catch (problem) {variants.push({settings: collaborationSettings(options), reason: problem.message});}}
 const completed=variants.filter(item=>!item.reason).length;return {version: COLLABORATION_VERSION,status:completed===variants.length?'completed':completed?'partial':'unavailable',attempted: variants.length, completed, variants, limitation: 'Fixed numeric CPM across different weight units measures construction-plus-scale sensitivity, not pure normalization robustness. Identity alternatives can change actor universes; edge overlap is descriptive, not equivalence of people or identity correctness. No probabilities are inferred.'};
}
