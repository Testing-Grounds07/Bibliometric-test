import test from 'node:test';
import assert from 'node:assert/strict';
import {revealSection, restoreOrigin} from './evidence-navigation.mjs';

test('reveals off-screen details with focus, but does not jump from visible desktop details', () => {
 globalThis.window = {innerHeight: 844};
 const calls = [], target = {setAttribute: (...args) => calls.push(args), focus: options => calls.push(['focus', options]), getBoundingClientRect: () => ({top: -2010}), scrollIntoView: options => calls.push(['scroll', options])};
 revealSection(target);
 assert.deepEqual(calls.at(-1), ['scroll', {behavior: 'auto', block: 'start'}]);
 assert.deepEqual(calls[1], ['focus', {preventScroll: true}]);
 calls.length = 0; target.getBoundingClientRect = () => ({top: 100}); revealSection(target);
 assert.equal(calls.some(call => call[0] === 'scroll'), false);
 revealSection(target, true); assert.equal(calls.at(-1)[0], 'scroll');
 delete globalThis.window;
});

test('return to list preserves the originating row position despite changed detail height', () => {
 let destination, focused = false;
 globalThis.window = {scrollY: 2000, scrollTo: options => { destination = options.top; }};
 const node = {isConnected: true, focus: () => { focused = true; }, getBoundingClientRect: () => ({top: 1300})};
 restoreOrigin({node, scrollY: 900, viewportTop: 250});
 assert.equal(destination, 3050); assert.equal(focused, true);
 delete globalThis.window;
});

test('removed source row falls back to the map without throwing', () => {
 let revealed = false;
 globalThis.window = {innerHeight: 844};
 const fallback = {setAttribute() {}, focus() {}, getBoundingClientRect: () => ({top: 10}), scrollIntoView: () => { revealed = true; }};
 restoreOrigin({node: {isConnected: false}}, fallback); assert.equal(revealed, true);
 delete globalThis.window;
});
