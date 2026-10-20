import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validationSummary} from './clustering-concepts.mjs';

test('validation distinguishes scan progress, final scan outcome, and evidence recovery', () => {
 assert.equal(validationSummary({}, {validationRunning:'true'}).label, 'Finding settings…');
 assert.equal(validationSummary({}, {validationOutcome:'No stable range'}).label, 'No stable range');
 assert.equal(validationSummary({}, {validationOutcome:'Stable range found'}).label, 'Stable range found');
 assert.equal(validationSummary({validationState:'running'}, {validationOutcome:'No stable range'}).label, 'Checking evidence…');
 const completed = validationSummary({validationState:'done', validationOutcome:'The group boundaries are approximate', preliminary:'true'}, {validationOutcome:'No stable range'});
 assert.equal(completed.label, 'Sensitive · preliminary');
 assert(completed.detail.includes('No stable range'));
 assert.equal(validationSummary({validationOutcome:'Most articles are in groups that hold together',preliminary:'false'}).label, 'Holds together');
});

test('failed, cancelled, queued, and pending checks are not mislabeled as running or unchecked', () => {
 assert.equal(validationSummary({}, {validationStatus:'No completed new result: offline'}).label,'Check failed · retry');
 assert.equal(validationSummary({validationStatus:'Cancelled. No incomplete result is reported.'}).label,'Stopped · rerun');
 assert.equal(validationSummary({}, {validationPhase:'queued'}).label,'Settings queued');
 assert.equal(validationSummary({validationState:'pending'}, {validationRunning:'true'}).label,'Waiting for map');
 assert.equal(validationSummary().label,'Not checked');
});

test('settings completion hands off to one preliminary check even with no recommendation', () => {
 const settings=fs.readFileSync('scripts/canvas-settings.mjs','utf8');
 const reliability=fs.readFileSync('scripts/canvas-reliability.mjs','utf8');
 assert(settings.includes("new CustomEvent('atlas-settings-settled', {detail: selected})"));
 assert(reliability.includes("window.addEventListener('atlas-settings-settled'"));
 assert(reliability.includes("settingsValidationState(graph) === 'idle'"));
 assert(reliability.includes('!record.autoAttempted'));
 assert(!reliability.includes('!automaticSettingsPending(graph)'));
});
test('a restored completed check is never described as not assessed',()=>{
 const source=fs.readFileSync('scripts/canvas-reliability.mjs','utf8');assert(source.includes("status: restored ? 'Restored completed check: '"));assert(source.includes('result: restored'));
});
