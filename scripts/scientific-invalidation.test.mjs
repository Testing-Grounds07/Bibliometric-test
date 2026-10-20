import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommunityResult} from './community-methods.mjs';
import {materializeSetting} from './method-settings.mjs';
import {projectOrderGraph} from './project-higher-orders.mjs';
import {temporalNetwork} from './network-extensions.mjs';
import {trialCanvasGraph} from './trial-canvas-core.mjs';
import {drillGraph} from './drill-analysis.mjs';
import {invalidateScientificOutputs} from './scientific-invalidation.mjs';
import {createScientificManifest} from './scientific-manifest.mjs';

const graph=()=>({nodes:[{id:'a',cluster:1,citations:2,articles:['s1','s2']},{id:'b',cluster:1,citations:2,articles:['s1','s2']}],links:[{source:'a',target:'b',strength:.5,count:2,articles:['s1','s2']}],order:2,maximumOrder:2,minimumSupport:1,resolution:.02,clustering:{algorithm:'leiden'},temporalSeries:{old:true},temporalSelection:{index:1},burstReport:{old:true},scienceAudit:{roles:{old:true}},scientificManifest:{old:true},stats:{nodes:2,edges:1,clusters:1}});
const check=next=>{assert.equal(next.scienceAudit,undefined);assert.equal(next.scientificManifest,undefined);assert.equal(next.temporalSeries,undefined);assert.equal(next.temporalSelection,undefined);assert.equal(next.burstReport,undefined);};
test('analytical transformations invalidate dependent scientific outputs, not historical parents',()=>{
 const original=graph();
 check(materializeSetting(original,{algorithm:'leiden',settings:{resolution:.1},partition:{memberships:{a:1,b:2}}}));
 assert(original.scienceAudit);
 check(applyCommunityResult(graph(),{algorithm:'infomap',memberships:{a:1,b:2}}));
 check(projectOrderGraph(graph(),{complete:true,maximumOrder:2,bundles:[],minimumSupport:1,referenceIds:['a','b']},{order:2,resolution:.1}));
 check(temporalNetwork(graph(),[{id:'s1',year:2020},{id:'s2',year:2021}],2020,2020));
 check(trialCanvasGraph(graph(),{definition:{name:'Trial'},family:'spectral',settings:{k:2},memberships:{a:1,b:2},clusters:2},[{members:['a','b'],weight:1}]));
 check(drillGraph(graph(),['a','b'],[],2,2,1));
 check(invalidateScientificOutputs(structuredClone(graph())));
 const display=graph();display.hiddenClusters=[1];display.nodes[0].x=123;assert(display.scienceAudit);assert(display.scientificManifest);
});
test('analytical invalidation retains pinned evidence provenance for later exports',async()=>{
 const source=graph(),records=[{id:'s1',references:['a','b']},{id:'s2',references:['a','b']}],context={evidenceId:'frozen-snapshot',retrievedAt:'2026-10-17T12:00:00Z',retrieval:{query:'Synthetic evidence'},versions:{algorithm:'original-version'},textVersions:{model:'pinned'}};
 source.scientificManifest=await createScientificManifest(source,records,context);
 const next=materializeSetting(source,{algorithm:'leiden',settings:{resolution:.1},partition:{memberships:{a:1,b:2}}});
 assert.equal(next.scientificManifest,undefined);assert.equal(next.evidenceProvenance.evidenceId,context.evidenceId);
 const exported=await createScientificManifest(next,records);assert.equal(exported.evidence.id,context.evidenceId);assert.equal(exported.evidence.retrievedAt,context.retrievedAt);assert.deepEqual(exported.evidence.retrieval,context.retrieval);assert.deepEqual(exported.dependencies.textVersions,context.textVersions);
});
