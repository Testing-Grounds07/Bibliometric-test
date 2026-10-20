import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {settingsBadgeLabel,settingsValidationState} from './canvas-settings.mjs';
import {createStartupNavigation} from './startup-navigation.mjs';
import {threeDPreviewSummary} from './hypergraph-3d-core.mjs';

test('idle completed, linked and project views never advertise queued settings', context => {
 const previous=globalThis.window;
 context.after(()=>{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
 const graph={networkModel:'hypergraph',clustering:{algorithm:'hypergraph'}};
 const policy=createStartupNavigation('/conservative-atlas/');
 globalThis.window={ATLAS_STARTUP_NAVIGATION:policy};
 assert.equal(settingsValidationState(graph),'queued');
 assert.equal(settingsBadgeLabel(settingsValidationState(graph)),'Auto settings · queued');
 for(const current of [{...graph,linkedBrowse:true},{...graph,temporalSeries:{windows:[]}},{...graph,appliedSettings:{}}]) {
  assert.equal(settingsValidationState(current),'idle');
  assert.equal(settingsBadgeLabel(settingsValidationState(current)),'Auto settings · not run');
 }
 policy.saved();
 assert.equal(settingsBadgeLabel(settingsValidationState(graph)),'Auto settings · not run');
 policy.baseline();globalThis.window.BIBLIOMAP={active:true};
 assert.equal(settingsBadgeLabel(settingsValidationState(graph)),'Auto settings · not run');
});

test('settings badge preserves running, completed, unsuccessful and cancelled outcomes',()=>{
 assert.equal(settingsBadgeLabel('running'),'Auto settings · testing…');
 assert.equal(settingsBadgeLabel('idle',{report:{recommendation:{chosen:'setting'}}}),'Auto settings · stable range');
 assert.equal(settingsBadgeLabel('idle',{report:{recommendation:{chosen:null}}}),'Auto settings · no clear recommendation');
 assert.equal(settingsBadgeLabel('idle',{report:{recommendation:{chosen:null},compareObjectives:true}}),'Settings · objective comparison');
 assert.equal(settingsBadgeLabel('idle',{autoAttempted:true}),'Auto settings · stopped / retry');
 assert(readFileSync('scripts/canvas-settings.mjs','utf8').includes('badge.textContent=settingsBadgeLabel(panel.dataset.validationPhase,record)'));
});

test('3D preview distinguishes visible complete combinations from the analytical universe',()=>{
 const counts={articles:68,totalArticles:91,combinations:67,totalCombinations:397,crossing:186},before=structuredClone(counts);
 assert.equal(threeDPreviewSummary(counts),'3D preview: 68 / 91 articles in 67 / 397 within-cluster combinations · 186 cross-cluster groups stay in 2D. Analysis unchanged.');
 assert.equal(threeDPreviewSummary({...counts,articles:6,combinations:7}),'3D preview: 6 / 91 articles in 7 / 397 within-cluster combinations · 186 cross-cluster groups stay in 2D. Analysis unchanged.');
 assert(!threeDPreviewSummary({...counts,articles:0,combinations:0,crossing:0}).includes('cross-cluster'));
 assert.deepEqual(counts,before);
 const source=readFileSync('scripts/hypergraph-3d.mjs','utf8');
 assert(source.indexOf('toolbar.append(preview)')<source.indexOf('body.append(sceneHost,rail)'));
 assert(source.includes('preview.textContent=threeDPreviewSummary'));
 assert(source.includes('status.textContent=decks.length'));
});
