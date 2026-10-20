import test from 'node:test';
import assert from 'node:assert/strict';
import {incidenceEvidence, projectIncidence, switchIncidence, marginSignature, incidenceNull, constructionCandidates} from './construction-audit.mjs';

const graph = {nodes: [{id:'a',articles:['s1','s2','s3'],cluster:1},{id:'b',articles:['s1','s2','s4'],cluster:1},{id:'c',articles:['s2','s3','s4'],cluster:2},{id:'d',articles:['s1','s4'],cluster:2}],links:[{source:'a',target:'b',count:2,strength:1}],minimumSupport:2,clustering:{algorithm:'leiden'}};

test('binary incidence removes duplicates and preserves raw support under fractional counting', () => {
 const evidence = incidenceEvidence(graph), full = projectIncidence(evidence,{normalization:'raw',minimumSupport:2}), fractional = projectIncidence(evidence,{counting:'event-fractional',normalization:'raw',minimumSupport:2});
 const first = full.links.find(edge=>edge.source==='a'&&edge.target==='b'), second = fractional.links.find(edge=>edge.source==='a'&&edge.target==='b');
 assert.equal(first.rawSupport,2); assert.equal(second.rawSupport,2); assert.equal(second.count,2); assert.ok(second.strength<2);
 assert.equal(full.links.length,fractional.links.length);
});
test('margin switches are deterministic and preserve both margins exactly', () => {
 const evidence = incidenceEvidence(graph), first = switchIncidence(evidence,{seed:42,attempts:1000}), second = switchIncidence(evidence,{seed:42,attempts:1000});
 assert.equal(marginSignature(first.evidence),marginSignature(evidence)); assert.deepEqual(first,second); assert.ok(first.accepted>0);
});
test('frozen margins are not reported as successful validation', () => {
 const frozen = {nodes:[{id:'a',articles:['s1','s2']},{id:'b',articles:['s1','s2']}],links:[{source:'a',target:'b',count:2,strength:1}]};
 const result = incidenceNull(frozen,{samples:10});
 assert.equal(result.status,'degenerate-not-assessed'); assert.equal(result.records[0].adjustedP,null); assert.equal(result.acceptedSwitches,0);
});
test('null tests expose finite resolution, family adjustment and movement diagnostics', () => {
 const result = incidenceNull(graph,{samples:10});
 assert.equal(result.marginsPreserved,true); assert.equal(result.familySize,6); assert.equal(result.records[0].observed,2); assert.equal(result.diagnostics.length,10); assert.match(result.multiplicityResolution,/Too few/);
 assert.equal(result.minimumP,1/11); assert.ok(result.records[0].adjustedP>=result.records[0].p); assert.match(result.limitation,/not convergence/);
});
test('construction candidates retain node universe and clear stale thematic/reliability outputs', () => {
 const variants = constructionCandidates({...graph,reliability:{samples:50},themeDescriptions:{}});
 assert.equal(variants.length,6); for(const variant of variants){assert.equal(variant.nodes.length,4);assert.equal(variant.reliability,undefined);assert.equal(variant.themeDescriptions,undefined);assert.ok(variant.nodes.every(node=>node.cluster===0));}
});
test('coupling preserves complete references and explicit event semantics', () => {
 const evidence = incidenceEvidence({method:'coupling',nodes:[{id:'a',references:['r1','r1','r2']},{id:'b',references:['r1']},{id:'c',references:['r1','r2']}],links:[]});
 const projected = projectIncidence(evidence,{counting:'event-fractional',normalization:'cosine'});
 assert.equal(projected.supportMeaning,'Distinct shared reference IDs'); assert.match(projected.weightingMeaning,/events are shared references/);
 assert.ok(projected.links.every(edge=>edge.strength<=1+1e-12));
});
