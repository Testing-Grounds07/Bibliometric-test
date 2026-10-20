import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('scripts/canvas-extensions.mjs', 'utf8');
const body = source.slice(source.indexOf('function showPeriod(next, replace = false) {') + 'function showPeriod(next, replace = false) {'.length, source.indexOf('\nfunction numberField')).trim().slice(0, -1);
const showPeriod = new Function('graph', 'records', 'window', 'sync', 'draw', 'next', 'replace', body);

for (const clone of [false, true]) test('period method and hierarchy changes retain the full parent destination' + (clone ? ' with coupling clones' : ''), () => {
 const parent = {id: 'full'}, period = {id: 'period'}, revised = {id: 'new method'}, level = {id: 'new level'};
 const records = new WeakMap([[parent, {periods: [], status: ''}]]);
 let current = parent, restored;
 const window = {atlasSharedCanvas: {
  capture: () => ({graph: current}),
  restore: snapshot => { restored = snapshot.graph; },
  applyAnalysis: next => { current = clone ? {...next} : next; },
  graph: () => current
 }};
 const apply = (next, replace = false) => showPeriod(current, records, window, () => {}, () => {}, next, replace);
 apply(period);
 apply(revised, true);
 apply(level, true);
 assert.equal(records.get(current).parent, parent);
 records.get(current).restore();
 assert.equal(restored, parent);
});

test('changing hierarchy on a full map does not invent a parent navigation step', () => {
 const graph = {}, next = {}, records = new WeakMap([[graph, {periods: []}]]);
 const window = {atlasSharedCanvas: {capture: () => ({graph}), applyAnalysis: () => {}, graph: () => next}};
 showPeriod(graph, records, window, () => {}, () => {}, next, true);
 assert.equal(records.get(next).restore, undefined);
});

test('canvas snapshots include order controls and period summaries for parent restoration', () => {
 const app = fs.readFileSync('public/conservative-atlas/app.js', 'utf8');
 const controls = app.match(/const canvasControlIds=([^;]+);/)[1];
 const texts = app.match(/const canvasTextIds=([^;]+);/)[1];
 for (const id of ['orderMode', 'orderSlider', 'maximumOrder', 'coCitationOrder']) assert(controls.includes("'" + id + "'"));
 for (const id of ['orderStructure', 'orderSliderValue', 'maximumOrderValue']) assert(texts.includes("'" + id + "'"));
});
