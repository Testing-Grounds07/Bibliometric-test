import test from 'node:test';
import assert from 'node:assert/strict';
import {executeStage,implementationVersion} from './stages.mjs';
import {fixture} from './fixtures.mjs';
import {createScientificManifest} from '../scientific-manifest.mjs';
const context={signal:new AbortController().signal,progress:()=>{}};
test('trusted temporal and activity stages use pinned evidence and remain separate analytical outputs',async()=>{
 const evidence=fixture(),graph={nodes:evidence.metadata.map(work=>({id:work.id,label:work.display_name,articles:evidence.works.filter(source=>source.referenced_works.includes(work.id)).map(source=>source.id),x:0,y:0})),links:[],method:'cocitation',networkModel:'pairwise',order:2,threshold:2,minimumSupport:1,resolution:.02,clustering:{algorithm:'leiden'},evidenceProvenance:{evidenceId:'pin',retrievedAt:evidence.retrievedAt}};
 const series=await executeStage('temporal-series',{graph,works:evidence.works},{from:2000,to:2009,width:3,step:3,resolution:.02},context);assert.equal(series.windows.length,4);assert.equal(series.evidence.evidenceId,'pin');assert.equal(series.coverage.knownYear,10);
 const bursts=await executeStage('publication-bursts',{graph,works:evidence.works},{kind:'references',from:2000,to:2009},context);assert.equal(bursts.status,'completed');assert.equal(bursts.features.length,6);assert.equal(bursts.evidence.evidenceId,'pin');assert.equal(bursts.latestPeriod.excludedYear,2026);
 series.implementationVersion=await implementationVersion('temporal-series');bursts.implementationVersion=await implementationVersion('publication-bursts');assert.match(series.implementationVersion,/^[a-f0-9]{64}$/);
 const manifest=await createScientificManifest({...graph,temporalSeries:series,burstReport:bursts},evidence.works);assert.equal(manifest.settings.temporal.width,3);assert.equal(manifest.settings.bursts.kind,'references');
 const changed=await createScientificManifest({...graph,temporalSeries:{...series,settings:{...series.settings,width:4}}},evidence.works);assert.notEqual(manifest.fingerprints.analysis,changed.fingerprints.analysis);
});
