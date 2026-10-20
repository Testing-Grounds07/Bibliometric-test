import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('completed window scrubbing uses stored graphs, not a compute path, and restores bounded parent',()=>{
 const source=readFileSync('scripts/temporal-browser.mjs','utf8'),selection=source.slice(source.indexOf(' function select(index)'),source.indexOf(' function fullMap()'));
 assert.match(selection,/structuredClone\(series.windows\[index\].graph\)/);assert.doesNotMatch(selection,/\.stage\(|new Worker|local\(/);assert.match(source,/structuredClone\(series.parentGraph\)/);
 assert.match(source,/Object.assign\(parent,\{temporalSeries:series,burstReport:visible.burstReport/);
 assert.match(source,/if\(parent.temporalSelection\)throw Error\('Return to the full pinned map first/);assert.match(source,/else\{currentSeries=null;baseSnapshot=null;seriesView.replaceChildren\(\);strip.hidden=true;\}/);assert.match(source,/else burstView.replaceChildren\(\)/);
 assert.match(source,/generation!==ticket\|\|canvas.graph\(\)!==parent/);assert.match(source,/worker\?\.terminate\(\)/);assert.match(source,/remoteJob\?\.cancel\(\)/);
});
test('window selection persists personal display without mutating stored parent memberships',()=>{
 const workspace=readFileSync('public/conservative-atlas/multiuser-workspace.js','utf8'),app=readFileSync('public/conservative-atlas/app.js','utf8'),reliability=readFileSync('scripts/canvas-reliability.mjs','utf8');
 assert.match(workspace,/temporalWindow:graph.temporalSelection\?\.index\?\?null/);assert.match(workspace,/Number.isInteger\(display.temporalWindow\)\)window.ATLAS_TEMPORAL\?\.select\(display.temporalWindow\)/);assert.match(app,/temporal-canvas',!!graph.temporalSelection/);assert.match(reliability,/if\(graph.temporalSelection\)/);
});
test('saved project installation only invokes an exported reference-workspace adapter',()=>{
 const app=readFileSync('public/conservative-atlas/app.js','utf8'),evidence=readFileSync('scripts/evidence-explorer.mjs','utf8'),exports=evidence.split('window.ATLAS_EVIDENCE = {')[1].split('\n};')[0],method=exports.match(/showReferenceWorkspace\(\)\{([^}]+)\}/);assert.match(app,/window.ATLAS_EVIDENCE.showReferenceWorkspace\(\)/);assert(method,'reference-workspace adapter must be an actual exported method');let selected;assert.equal(new Function('mode','selectTab',method[1]+'return mode;')('coupling',value=>selected=value),'references');assert.equal(selected,'map');
});
