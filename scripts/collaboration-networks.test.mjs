import test from 'node:test';
import assert from 'node:assert/strict';
import {collaborationSettings, collaborationIncidence, buildCollaborationGraph, collaborationEgo, collaborationSensitivity} from './collaboration-networks.mjs';

const author = (id, institutions = [], name = 'Same name') => ({author: {id: 'https://openalex.org/A' + id, display_name: name}, institutions});
const institution = (id, country = 'US', lineage) => ({id: 'https://openalex.org/I' + id, display_name: 'Institution ' + id, country_code: country, ...(lineage ? {lineage} : {})});
const fixture = () => [{id: 'W1', display_name: 'Adaptive leadership education', authors_count: 3, authorships: [author(1, [institution(1), institution(2, 'GB')]), author(2, [institution(1)]), author(3, [institution(3, 'CA')])]}, {id: 'W2', display_name: 'Clinical leadership learning', authorships: [author(1, [institution(1)]), author(2, [institution(2, 'GB')])]}, {id: 'W3', display_name: 'Learning education networks', authors_count: 4, authorships: [author(3), author(4)]}, {id: 'W4', authors_count: 2}];
test('distinct stable IDs, duplicate authorships and missing names never merge identities', async () => {
 const works = fixture(); works[0].authorships.push(author(1)); works[1].authorships.push({author: {display_name: 'Same name'}, institutions: []});
 const graph = await buildCollaborationGraph(works); assert.equal(graph.nodes.length, 4); assert.equal(graph.links.find(edge => edge.source.endsWith('A1') && edge.target.endsWith('A2')).rawSupport, 2); assert.equal(graph.collaboration.coverage.duplicateAuthorIds, 1); assert.equal(graph.collaboration.coverage.missingAuthorIds, 1); assert.equal(graph.collaboration.coverage.potentiallyTruncatedLists, 2); assert.equal(graph.collaboration.coverage.missingAuthorshipLists, 1);
 assert.throws(() => collaborationIncidence([{id: 'W', authorships: [{author: {display_name: 'A'}}]}]), /No stable/);
});
test('fractional pairs sum to one per contributing work while raw support remains distinct source count', async () => {
 const graph = await buildCollaborationGraph(fixture().slice(0, 1)); assert.equal(graph.links.length, 3); assert.ok(Math.abs(graph.links.reduce((sum, edge) => sum + edge.strength, 0) - 1) < 1e-12); assert.ok(graph.links.every(edge => edge.rawSupport === 1 && edge.articles[0] === 'W1'));
 const full = await buildCollaborationGraph(fixture().slice(0, 1), {counting: 'full-pair'}); assert.equal(full.links.reduce((sum, edge) => sum + edge.strength, 0), 3);
});
test('work-specific institutions and countries are unique; raw recorded countries may retain unmatched addresses', async () => {
 const works = fixture(); works[2].authorships[0].countries = ['US', 'US', 'FR'];
 const graph = await buildCollaborationGraph(works, {kind: 'institution'}); assert.equal(graph.nodes.length, 3); assert.equal(graph.nodes.find(node => node.id.endsWith('I1')).citations, 2);
 const countries = await buildCollaborationGraph(works, {kind: 'country'}); assert.equal(countries.nodes.length, 4); assert.equal(countries.links.find(edge => edge.source === 'country:CA' && edge.target === 'country:US').rawSupport, 1); assert.ok(countries.nodes.find(node => node.id === 'country:FR').evidence.W3[0].source.includes('raw affiliation'));
});
test('recorded parent policy requires explicit ID and ancestry, never lineage order or name guessing', async () => {
 assert.throws(() => collaborationSettings({institutionPolicy: 'recorded-parent'}), /explicit/); assert.throws(() => collaborationIncidence(fixture(), {kind: 'institution', institutionPolicy: 'recorded-parent', parentInstitutionId: 'I9'}), /No recorded/);
 const works = fixture(); works[0].authorships[0].institutions[0].lineage = ['I1', 'I9', 'I7'];
 const graph = await buildCollaborationGraph(works, {kind: 'institution', institutionPolicy: 'recorded-parent', parentInstitutionId: 'I9'}); assert.ok(graph.nodes.some(node => node.id.endsWith('I9'))); assert.ok(graph.nodes.some(node => node.id.endsWith('I1'))); assert.ok(!graph.nodes.some(node => node.id.endsWith('I7'))); assert.ok(graph.collaboration.coverage.lineageUnknownAffiliations > 0);
});
test('single actor is retained unlinked and explicit team exclusions report sources rather than silently sampling', async () => {
 const graph = await buildCollaborationGraph([{id: 'W', authorships: [author(1)]}]); assert.equal(graph.nodes.length, 1); assert.equal(graph.links.length, 0); assert.equal(graph.nodes[0].cluster, 0);
 const bounded = await buildCollaborationGraph(fixture(), {maximumTeamSize: 2}); assert.equal(bounded.collaboration.coverage.excludedLargeTeamWorks, 2); assert.ok(!bounded.nodes.some(node => node.articles.includes('W1')));
});
test('audited merge/split scenarios are deterministic and tied to observed work assignments', async () => {
 const works = fixture(), note = 'Human inspected the underlying authorships; sensitivity only';
 const merged = await buildCollaborationGraph(works, {identityScenario: {note, merges: [{from: ['https://openalex.org/A2'], into: 'https://openalex.org/A1'}]}}); assert.equal(merged.nodes.length, 3); assert.equal(merged.nodes.find(node => node.id.endsWith('A1')).citations, 2);
 const split = await buildCollaborationGraph(works, {identityScenario: {note, splits: [{actorId: 'https://openalex.org/A1', assignments: [{targetId: 'audit:person-one', label: 'Audited person', sourceIds: ['W1']}]}]}}); assert.ok(split.nodes.some(node => node.id === 'audit:person-one' && node.auditedLocalIdentity)); assert.deepEqual(split.nodes.find(node => node.id.endsWith('A1')).articles, ['W2']);
 await assert.rejects(buildCollaborationGraph(works, {identityScenario: {note, splits: [{actorId: 'https://openalex.org/A1', assignments: [{targetId: 'audit:test', label: 'Test', sourceIds: ['W3']}]}]}}), /observed works/);
});
test('ego is induced, retains parent memberships/evidence, records boundary and does not mutate parent', async () => {
 const graph = await buildCollaborationGraph(fixture()), original = structuredClone(graph), ego = collaborationEgo(graph, 'https://openalex.org/A4'); assert.equal(ego.nodes.length, 2); assert.equal(ego.links.length, 1); assert.equal(ego.collaboration.ego.boundaryEdges, 2); assert.deepEqual(graph, original); assert.equal(ego.egoParent.nodes.length, 4); assert.ok(ego.nodes.every(node => node.cluster === graph.nodes.find(item => item.id === node.id).cluster));
});
test('bounded sensitivity checks metadata pin and reports counting scale, team and affiliation definitions', async () => {
 const works = fixture(), graph = await buildCollaborationGraph(works, {kind: 'institution'}), report = await collaborationSensitivity(works, graph); assert.equal(report.completed, 4); assert.match(report.limitation, /scale/); assert.equal(report.variants[0].settings.counting, 'full-pair'); works[0].authorships[0].author.id = 'A99'; await assert.rejects(collaborationSensitivity(works, graph), /metadata changed/);
});
test('affiliation sensitivity excludes raw country evidence from excluded multi-affiliated authorships', async () => {
 const works = [{id:'W',authorships:[{...author(1,[institution(1),institution(2,'GB')]),countries:['US','GB']},{...author(2,[institution(3,'CA')]),countries:['CA']}]}];
 const graph=await buildCollaborationGraph(works,{kind:'country',affiliationPolicy:'single-institution-authorships'});assert.deepEqual(graph.nodes.map(node=>node.id),['country:CA']);assert.equal(graph.collaboration.coverage.excludedMultiAffiliationAuthorships,1);
});
test('reported large teams are excluded despite truncated retained IDs; ambiguous merge chains fail closed', async () => {
 const works=fixture();works[0].authors_count=50;const graph=await buildCollaborationGraph(works,{maximumTeamSize:20});assert.equal(graph.collaboration.coverage.excludedLargeTeamWorks,1);assert.ok(!graph.nodes.some(node=>node.articles.includes('W1')));
 await assert.rejects(buildCollaborationGraph(fixture(),{identityScenario:{note:'Audited alternative',merges:[{from:['https://openalex.org/A1'],into:'https://openalex.org/A2'},{from:['https://openalex.org/A2'],into:'https://openalex.org/A3'}]}}),/chained|chains/);
});
test('identity splitting cannot bypass the actor budget',()=>{
 const works=Array.from({length:10001},(_,index)=>({id:'W'+index,authorships:[author(1)]}));
 assert.throws(()=>collaborationIncidence(works,{identityScenario:{note:'Explicit audit',splits:[{actorId:'https://openalex.org/A1',assignments:works.map((work,index)=>({targetId:'audit:p'+index,label:'Audited '+index,sourceIds:[work.id]}))}]}}),/budget/);
});
test('publication cutoff removes pair mass without renormalizing the full observed per-work team',async()=>{
 const works=fixture().slice(0,2),graph=await buildCollaborationGraph(works,{minimumPublications:2});assert.equal(graph.nodes.length,2);assert.equal(graph.links[0].rawSupport,2);assert.ok(Math.abs(graph.links[0].strength-4/3)<1e-12);assert.equal(graph.collaboration.coverage.excludedLowPublicationActors,1);assert.equal(graph.collaboration.coverage.retainedPairWeight,graph.links[0].strength);
 const affiliations=[{id:'W1',authorships:[author(1,[institution(1),institution(2),institution(3)])]},{id:'W2',authorships:[author(2,[institution(1),institution(2)])]}],institutions=await buildCollaborationGraph(affiliations,{kind:'institution',minimumPublications:2});assert.ok(Math.abs(institutions.links[0].strength-4/3)<1e-12);
});
test('missing person IDs do not erase observed institutional/country evidence and ego drops parent-only audits',async()=>{
 const works=[{id:'W',authorships:[{author:{display_name:'Unresolved name'},institutions:[institution(1)],countries:['US']},author(2,[institution(2,'GB')])]}];
 const institutions=await buildCollaborationGraph(works,{kind:'institution'}),countries=await buildCollaborationGraph(works,{kind:'country'});assert.equal(institutions.nodes.length,2);assert.equal(countries.nodes.length,2);assert.equal(institutions.collaboration.coverage.missingAuthorIds,1);
 const graph=await buildCollaborationGraph(fixture());graph.collaborationSensitivity={completed:3};const ego=collaborationEgo(graph,'https://openalex.org/A4');assert.equal(ego.collaborationSensitivity,undefined);assert.equal(ego.egoParent.collaborationSensitivity.completed,3);assert.equal(ego.nodes.find(node=>node.id.endsWith('A3')).degree,1);assert.equal(ego.stats.isolated_nodes,0);const scope=new Set(ego.nodes.flatMap(node=>node.articles));assert(Object.values(ego.themeDescriptions).every(description=>description.keywords.every(keyword=>keyword.sources.every(source=>scope.has(source.id)))));
});
