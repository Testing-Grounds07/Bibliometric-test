import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunityLoader} from './community-loader.mjs';

test('deduplicates, retries a fresh URL, and caches success', async () => {
 const host = {}, scripts = [];
 const document = {createElement: () => ({remove() {}}), head: {append(script) { scripts.push(script); }}};
 const load = createCommunityLoader(host, document), result = load();
 assert.equal(result, load());
 scripts[0].onerror(); await Promise.resolve();
 assert.match(scripts[1].src, /&retry=/);
 host.ATLAS_COMMUNITIES = {start() {}, startReliability() {}};
 scripts[1].onload();
 assert.equal(await result, host.ATLAS_COMMUNITIES);
 await load(); assert.equal(scripts.length, 2);
});

test('failed initialization allows a subsequent user retry', async () => {
 const host = {}, scripts = [];
 const document = {createElement: () => ({remove() {}}), head: {append(script) { scripts.push(script); }}};
 const load = createCommunityLoader(host, document), result = load();
 scripts[0].onload(); await Promise.resolve(); scripts[1].onerror();
 await assert.rejects(result, /after two attempts/);
 const retry = load();
 host.ATLAS_COMMUNITIES = {start() {}, startReliability() {}};
 scripts[2].onload(); await retry;
});
