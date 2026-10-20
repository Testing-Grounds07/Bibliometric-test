import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completeCouplingDiagnostics} from './coupling-install.mjs';

test('legacy completed coupling windows get genuine diagnostics without inheriting full-map components',()=>{
 const graph={nodes:[{id:'a',cluster:1},{id:'b',cluster:1},{id:'c',cluster:0}],links:[{source:'a',target:'b',strength:.5,count:1,references:['r']}],method:'coupling',networkModel:'pairwise',temporal:{from:2000,to:2004},clustering:{algorithm:'leiden'},fragmentation:{components:99}},before=JSON.stringify(graph),next=completeCouplingDiagnostics(graph);assert.equal(next.clustering.clusters,1);assert.equal(next.fragmentation.components,1);assert.deepEqual(next.fragmentation.componentSizes,[2]);assert.equal(JSON.stringify(graph),before);assert.equal(next.links,graph.links);
});
test('coupling window and dataset switches update inspector and reference state before drawing',()=>{
 const source=readFileSync('scripts/evidence-explorer.mjs','utf8'),app=readFileSync('public/conservative-atlas/app.js','utf8'),temporal=readFileSync('scripts/temporal-browser.mjs','utf8');
 assert.match(source,/restoreCoupling\(next\) \{ next=completeCouplingDiagnostics\(next\);context =[\s\S]*?coupling = next;[\s\S]*?shell\(\); \}/);
 assert.match(source,/applyCouplingSettings\(next\) \{ next=completeCouplingDiagnostics\(next\)/);assert.match(source,/setDataset\(next\)[^\n]*selectTab\('map',false\)/);
 const install=app.slice(app.indexOf('window.atlasSharedCanvas.installCorpus='),app.indexOf('window.atlasSharedCanvas.currentCorpus='));assert.doesNotMatch(install,/if\(isCoupling\(\)\)showReferenceCanvas\(\)/);assert.match(install,/referenceSession=null/);
 assert.match(temporal,/if\(next.canvasKind==='coupling'\)window.ATLAS_EVIDENCE.restoreCoupling\(next\)/);assert.match(temporal,/if\(parent.canvasKind==='coupling'\)window.ATLAS_EVIDENCE.restoreCoupling\(parent\)/);
});
