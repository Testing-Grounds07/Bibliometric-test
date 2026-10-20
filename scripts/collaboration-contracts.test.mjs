import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCollaborationGraph,collaborationEgo,linkedSourceScope} from './collaboration-networks.mjs';
import {fixture} from './multiuser/fixtures.mjs';
import {createScientificManifest,methodSupport,validationDimensions} from './scientific-manifest.mjs';
import {descriptionRequest} from './cluster-description-core.mjs';
import {descriptionsAllowed} from './description-policy.mjs';
import {graphRows} from '../neo4j-store.mjs';
import {nativeNetwork} from './workspace-projects-core.mjs';
import {prepareReliability} from './network-reliability.mjs';
import {settingsGrid,evidenceSensitivity} from './method-settings.mjs';
import {validateConnections,temporalNetwork} from './network-extensions.mjs';
import {incidenceEvidence} from './construction-audit.mjs';
test('collaboration registry and manifest carry construction/identity pins without citation or AI fallback',async()=>{
 const snapshot=fixture({richMetadata:true}),graph=await buildCollaborationGraph(snapshot.works,{kind:'author',minimumPublications:2},{sourceCorpusId:'private',evidenceProvenance:{evidenceId:'pin',retrievedAt:snapshot.retrievedAt}}),support=methodSupport(graph);assert(support.supported);assert.equal(support.evidenceResampling,false);assert.equal(support.marginNull,false);assert.equal(support.constructionComparison,false);assert.equal(descriptionsAllowed(graph),false);assert.throws(()=>descriptionRequest(graph,1,'private'),/article-description/);
 const manifest=await createScientificManifest(graph,snapshot.works),display=structuredClone(graph);display.nodes[0].x+=100;assert.equal((await createScientificManifest(display,snapshot.works)).fingerprints.analysis,manifest.fingerprints.analysis);display.collaboration.minimumPublications=3;assert.notEqual((await createScientificManifest(display,snapshot.works)).fingerprints.analysis,manifest.fingerprints.analysis);assert.equal(manifest.settings.collaboration.minimumPublications,2);assert.equal(validationDimensions(graph,{records:10}).find(item=>item.id==='null').status,'not-implemented');
 const invalid=structuredClone(graph);invalid.clustering.algorithm='infomap';assert.equal(methodSupport(invalid).supported,false);
 assert.throws(()=>prepareReliability(graph,[]),/collaboration actors/);assert.throws(()=>settingsGrid(graph),/collaboration actors/);assert.throws(()=>validateConnections(graph),/collaboration actors/);assert.throws(()=>temporalNetwork(graph,[],2000,2009),/collaboration actors/);assert.throws(()=>incidenceEvidence(graph),/collaboration actors/);await assert.rejects(evidenceSensitivity(graph,[],null),/collaboration actors/);
});
test('native projection distinguishes actors from works including audited keys',async()=>{
 const graph=await buildCollaborationGraph(fixture({richMetadata:true}).works,{kind:'country'}),rows=graphRows('analyses',{id:'test-analysis',network:nativeNetwork(graph)});assert(rows.networkNodes.every(node=>node.work_id===null&&node.entity_kind==='country'));assert(rows.networkEdges.length>0);
 const ego=collaborationEgo(graph,graph.nodes[0].id);assert.equal(ego.nodes.length,2);assert.equal(ego.collaboration.ego.parentNodes,graph.nodes.length);
});
test('shared actor adapter retains typed canvas, role units, view-only ego persistence and complete temporal exports',()=>{
 const app=readFileSync(new URL('../public/conservative-atlas/app.js',import.meta.url),'utf8'),browser=readFileSync(new URL('./collaboration-browser.mjs',import.meta.url),'utf8'),workspace=readFileSync(new URL('../public/conservative-atlas/multiuser-workspace.js',import.meta.url),'utf8');assert(app.includes("['semantic','collaboration'].includes"));assert(app.includes('entityAdapter().inspectNode'));assert(app.includes('collaborationSensitivity:graph.collaborationSensitivity'));assert(app.includes('temporalSeries:graph.temporalSeries'));assert(app.includes('burstReport:graph.burstReport'));assert(browser.includes('collaborationEgo(graph,node.id,hops)'));assert(workspace.includes('collaborationEgo:graph.collaboration?.ego'));assert(browser.includes('Private/project')||browser.includes('Private evidence cannot'));assert(browser.includes('Citation Auto CPM'));
});
test('linked source memberships retain their exact parent construction and model without unlike-universe agreement',()=>{
 const graph={canvasKind:'coupling',method:'coupling',minimumShared:3,minimumCosine:.1,clustering:{algorithm:'leiden',resolution:.02},nodes:[{id:'W1',cluster:1}],scientificManifest:{fingerprints:{analysis:'fixed-analysis'}}},scope=linkedSourceScope(graph);assert.equal(scope.parentAnalysisFingerprint,'fixed-analysis');assert.equal(scope.construction.clustering.resolution,.02);assert.notDeepEqual(linkedSourceScope({...graph,clustering:{algorithm:'leiden',resolution:.1}}),scope);assert.equal(linkedSourceScope({collaboration:{kind:'author'}}),null);
});

test('actual actor labels omit publication years and ego installation keeps unlinked seed visible',()=>{
 const app=readFileSync('public/conservative-atlas/app.js','utf8'),body=app.match(/function articleLabel\(n\)\{([^\r\n]+)\}\r?\n/)[1],label=new Function('n','graph','$','foundationLabelsActive','isCoupling','state','window',body);
 for(const entityKind of ['author','institution','country'])assert.equal(label({label:'Observed actor'}, {entityKind},()=>{throw Error('Actor labels must not inspect citation/year controls');}), 'Observed actor');
 assert.match(app,/mapVisibility.hideUnlinked=!graph.collaboration\?\.ego;if\(graph.collaboration\?\.ego\)mapVisibility.minimumClusterSize=1/);
});

test('non-actor installation clears only collaboration panel presentation, retaining completed graph reports',()=>{
 const browser=readFileSync('scripts/collaboration-browser.mjs','utf8'),body=browser.match(/function resetContext\(\)\{([^\n]+)\}\n/)[1],reset=new Function('panel','construction','reports','back','status',body),panel={open:true},construction={textContent:'7 authors'},reports={replaceChildren(){this.cleared=true;}},back={hidden:false},status={textContent:'Old context'};
 reset(panel,construction,reports,back,status);assert.equal(panel.open,false);assert.equal(construction.textContent,'');assert.equal(reports.cleared,true);assert.equal(back.hidden,true);assert.match(status.textContent,/Choose observed actors/);assert(!/graph|temporalSeries|burstReport/.test(body));
 assert.match(readFileSync('public/conservative-atlas/app.js','utf8'),/if\(!graph.collaboration\)window.ATLAS_COLLABORATION\?\.resetContext\(\)/);
});
