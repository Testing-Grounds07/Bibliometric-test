import test from 'node:test';
import assert from 'node:assert/strict';
import {createDescriptionQueue} from './description-queue.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const requests = ['1', '2', '3'].map(cluster => ({kind: 'cocitation', cluster}));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }

test('loading a map names every cluster sequentially without an inspector', async () => {
 const calls = [], pending = [];
 const queue = createDescriptionQueue(request => { calls.push(request.cluster); const task = deferred(); pending.push(task); return task.promise; });
 const entries = queue.activate('map', requests);
 assert.deepEqual(calls, ['1']);
 pending[0].resolve({heading: 'First'}); await tick();
 assert.deepEqual(calls, ['1', '2']);
 pending[1].resolve({heading: 'Second'}); await tick();
 pending[2].resolve({heading: 'Third'}); await tick();
 assert(entries.every(record => record.status === 'done'));
 queue.activate('map', requests); await tick();
 assert.equal(calls.length, 3);
 queue.stop(); queue.activate('map', requests); await tick();
 assert.equal(calls.length, 3);
});

test('selection prioritizes pending work without cancelling the current generation', async () => {
 const calls = [], first = deferred(); let signal;
 const queue = createDescriptionQueue((request, regenerate, currentSignal) => { calls.push(request.cluster); signal ||= currentSignal; return request.cluster === '1' ? first.promise : Promise.resolve({heading: request.cluster}); });
 const entries = queue.activate('map', requests);
 queue.prioritize(entries[2]);
 assert.equal(signal.aborted, false);
 first.resolve({heading: 'First'}); await tick();
 assert.deepEqual(calls, ['1', '3', '2']);
});

test('scope changes abort old work, ignore stale results and resume unfinished work', async () => {
 const first = deferred(), calls = []; let oldSignal;
 const queue = createDescriptionQueue((request, regenerate, signal) => { calls.push(request.cluster); if (calls.length === 1) { oldSignal = signal; return first.promise; } return Promise.resolve({heading: request.cluster}); });
 const old = queue.activate('old', [requests[0]]);
 queue.activate('new', [{kind: 'coupling', cluster: '7'}]);
 assert.equal(oldSignal.aborted, true);
 first.resolve({heading: 'Stale'}); await tick();
 assert.equal(old[0].result, null);
 assert.equal(queue.entries()[0].result.heading, '7');
 queue.activate('old', [requests[0]]); await tick();
 assert.equal(queue.entries()[0].result.heading, '1');
 assert.deepEqual(calls, ['1', '7', '1']);
});

test('failures retain fallback, continue the queue and can be retried', async () => {
 let failed = false;
 const queue = createDescriptionQueue(async request => { if (!failed) { failed = true; throw new Error('Unavailable'); } return {heading: request.cluster}; });
 const entries = queue.activate('map', requests); await tick();
 assert.equal(entries[0].status, 'error');
 assert.equal(entries[0].result, null);
 assert.equal(entries[2].status, 'done');
 queue.retry(entries[0]); await tick();
 assert.equal(entries[0].status, 'done');
});

test('regeneration is explicit and keeps the previous result after failure', async () => {
 const modes = [];
 const queue = createDescriptionQueue(async (request, regenerate) => { modes.push(regenerate); if (regenerate) throw new Error('Failed'); return {heading: 'Cached'}; });
 const [record] = queue.activate('map', [requests[0]]); await tick();
 queue.retry(record, true); await tick();
 assert.deepEqual(modes, [false, true]);
 assert.equal(record.result.heading, 'Cached');
 assert.equal(record.status, 'error');
});

test('cancelling one cluster does not stop the remaining names', async () => {
 const first = deferred();
 const queue = createDescriptionQueue(request => request.cluster === '1' ? first.promise : Promise.resolve({heading: request.cluster}));
 const entries = queue.activate('map', requests);
 queue.cancel(entries[0]); first.resolve({heading: 'Discarded'}); await tick();
 assert.equal(entries[0].status, 'cancelled');
 assert.equal(entries[0].result, null);
 assert.equal(entries[2].status, 'done');
});

test('saved descriptions reopen without inference but remain explicitly regenerable', async () => {
 const calls = [], queue = createDescriptionQueue(async (request, regenerate) => { calls.push(regenerate); return {heading: 'Updated'}; });
 queue.seed(requests[0], {heading: 'Saved'});
 const [record] = queue.activate('restored', [requests[0]]); await tick();
 assert.deepEqual(calls, []); assert.equal(record.status, 'done'); assert.equal(record.result.heading, 'Saved');
 queue.retry(record, true); await tick();
 queue.seed(requests[0], {heading: 'Stale'});
 assert.deepEqual(calls, [true]); assert.equal(record.result.heading, 'Updated');
});
