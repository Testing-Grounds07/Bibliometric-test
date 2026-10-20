import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseWorkspaceRoute,workspacePath} from './workspace-route-path.mjs';
import {mapSignature,isViewReturn} from './workspace-routing.mjs';
const projectId='12345678-1234-1234-1234-123456789abc',mapId='abcdef12-1234-1234-1234-123456789abc';
test('closing an evidence view recognizes its exact parent without resetting a live analysis',()=>{
 assert(isViewReturn('https://example.com/conservative-atlas/index.html','/conservative-atlas/index.html'));
 assert(isViewReturn('/conservative-atlas/map?mode=3d','/conservative-atlas/map?mode=3d'));
 assert(!isViewReturn('/conservative-atlas/map?mode=2d','/conservative-atlas/map?mode=3d'));
 assert(!isViewReturn('/conservative-atlas/projects/'+projectId,'/conservative-atlas/index.html'));
 assert(!isViewReturn('/conservative-atlas/index.html',null));
});
test('project, saved-map and cluster paths round trip with exact combination selection',()=>{
 assert.equal(parseWorkspaceRoute('/conservative-atlas/projects').projectId,null);
 const path=workspacePath({projectId,mapId,cluster:'2',size:'4',combination:'["W1","W2","W3","W4"]'});
 const route=parseWorkspaceRoute(path);assert.equal(route.projectId,projectId);assert.equal(route.mapId,mapId);assert.equal(route.cluster,'2');assert.equal(route.size,'4');assert.equal(route.combination,'["W1","W2","W3","W4"]');
 assert.equal(workspacePath({projectId,mapId}),'/conservative-atlas/projects/'+projectId+'/maps/'+mapId);
});
test('connection paths encode full OpenAlex identifiers without inventing filesystem directories',()=>{
 const route=parseWorkspaceRoute(workspacePath({projectId,mapId,source:'https://openalex.org/W1',target:'W2',size:'3'}));
 assert.equal(route.source,'https://openalex.org/W1');assert.equal(route.target,'W2');
});
test('live workspace directories do not need a saved finding',()=>{
 const path=workspacePath({live:true,cluster:'2'});assert.equal(path,'/conservative-atlas/map/clusters/2/combinations');
 assert.equal(parseWorkspaceRoute(path).live,true);assert.equal(parseWorkspaceRoute(path).cluster,'2');assert.equal(parseWorkspaceRoute(path).mapId,null);
 const scoped=workspacePath({live:true,projectId,source:'W1',target:'W2'});assert.equal(scoped,'/conservative-atlas/projects/'+projectId+'/map/connections/W1/W2/combinations');assert.equal(parseWorkspaceRoute(scoped).live,true);
});
test('navigation has no automatic save or copy-link actions',()=>{
 const source=readFileSync(new URL('./workspace-routing.mjs',import.meta.url),'utf8');
 assert(!source.includes('saveLinkedView'));assert(!source.includes('clipboard'));assert(!source.includes('Save & copy'));
});
test('route handling does not swallow static assets, APIs, malformed identifiers or invalid sizes',()=>{
 for(const path of ['/conservative-atlas/app.js','/conservative-atlas/workspace-api/projects','/conservative-atlas/projects/../../private','/conservative-atlas/projects/not-a-uuid','/unrelated/projects',workspacePath({projectId,mapId,cluster:'1'})+'?size=-1'])assert.equal(parseWorkspaceRoute(path),null);
 assert.throws(()=>workspacePath({mapId}));assert.throws(()=>workspacePath({projectId:'invalid'}));
});
test('map identity ignores layout animation but changes with membership, filters or evidence',()=>{
 const snapshot={graph:{nodes:[{id:'one',cluster:1,x:0,y:0}],links:[],clustering:{algorithm:'leiden'}},controls:{labels:{value:'on'}},hiddenClusters:new Set(),hideUnlinked:true};
 const signature=mapSignature(snapshot);snapshot.graph.nodes[0].x=90;assert.equal(mapSignature(snapshot),signature);snapshot.graph.nodes[0].cluster=2;assert.notEqual(mapSignature(snapshot),signature);snapshot.graph.nodes[0].cluster=1;snapshot.hideUnlinked=false;assert.notEqual(mapSignature(snapshot),signature);
});
