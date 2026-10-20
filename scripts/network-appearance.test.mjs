import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {window: {}};
vm.runInNewContext(fs.readFileSync('public/conservative-atlas/network-appearance.js', 'utf8'), context);
const {edgeIntensity, curvePath, curvePoint} = context.window.atlasNetworkAppearance;

test('connection intensity is monotonic, bounded and logarithmic', () => {
 const values = [0, 1, 5, 10, 50, 100].map(weight => edgeIntensity(weight, 100));
 assert(values.every((value, position) => value >= .12 && value <= .92 && (!position || value > values[position - 1])));
 assert(edgeIntensity(50, 100) > (.12 + .92) / 2);
 assert.equal(edgeIntensity(5, 100), edgeIntensity(5, 100));
 assert.equal(edgeIntensity(0, 0), .12);
 assert.equal(edgeIntensity(NaN, Infinity), .12);
});

test('curves and moving evidence points share stable geometry and endpoints', () => {
 const start = {x: 10, y: 20}, end = {x: 210, y: 20}, key = 'reference-a|reference-b';
 assert.equal(curvePath(start, end, key), curvePath(start, end, key));
 assert.match(curvePath(start, end, key), /^M 10 20 Q .+ 210 20$/);
 assert.equal(JSON.stringify(curvePoint(start, end, key, 0)), JSON.stringify(start));
 assert.equal(JSON.stringify(curvePoint(start, end, key, 1)), JSON.stringify(end));
 assert.notEqual(curvePoint(start, end, key, .5).y, 20);
 assert.equal(curvePoint(start, end, key, .5).x, 110);
 assert(!curvePath(start, start, key).includes('NaN'));
});

test('interface tokens stay monochrome in both appearances', () => {
 const css = fs.readFileSync('public/conservative-atlas/workspace-theme.css', 'utf8');
 for (const selector of ['body.workspace-shell', 'body.workspace-shell.night-mode']) {
  const block = css.slice(css.indexOf(selector + '{')).split('}')[0];
  for (const [, token, value] of block.matchAll(/--([\w-]+):#([a-f0-9]{6})(?:[a-f0-9]{2})?;/g)) {
   assert.equal(value.slice(0, 2), value.slice(2, 4), token);
   assert.equal(value.slice(2, 4), value.slice(4, 6), token);
  }
 }
 assert(css.includes('@media(prefers-reduced-motion:reduce)'));
 const layout = fs.readFileSync('public/conservative-atlas/styles.css', 'utf8');
 assert((css+layout).includes('@media(min-width:1100px)'));
});
