import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('semantic shared canvas gates citation actions and restores captured controls/camera',()=>{
 const app=readFileSync('public/conservative-atlas/app.js','utf8');assert.match(app,/showSemantic:showSemanticCanvas/);assert.match(app,/restore:restoreSavedCanvas/);assert.match(app,/if\(\['semantic','collaboration'\].includes\(session.graph.canvasKind\)\)[^\r\n]*showSemanticCanvas\(session.graph,semanticParent\);restoreCanvas\(session\)/);
 assert.match(app,/if\(graph.trial\|\|isEntityMap\(\)\|\|graph.temporalSelection\)return/);assert.match(app,/if\(!isCoupling\(\)&&!isEntityMap\(\)&&!graph.temporalSelection&&!graph.trial\)action\(dialog,'Explore subclusters'/);assert.match(app,/if\(!isEntityMap\(\)&&!graph.temporalSelection\)action\(dialog,'Explode cluster combinations'/);
 assert.match(app,/for\(const id of \['clusteringMethod','networkModel','modelResolution','threshold'\]\)\$\(id\).disabled=true/);assert.match(app,/canvasMode\(isCoupling\(\)\)/);
 assert.match(app,/isEntityMap\(\)&&\(graph.entityKind==='source'\|\|graph.collaboration\)\?edge.strength/);assert.match(app,/graph.entityKind==='source'\)themePanel\(detail/);
});

test('semantic context hides all native citation settings without changing their restore state',()=>{
 const css=readFileSync('public/conservative-atlas/science.css','utf8'),app=readFileSync('public/conservative-atlas/app.js','utf8'),browser=readFileSync('scripts/semantic-browser.mjs','utf8'),workspace=readFileSync('public/conservative-atlas/multiuser-workspace.js','utf8');
 for(const selector of ['.analysis-switches','#autoCPMInfo','#metricExplanation','.community-controls','#analysisNote','#cpmRecommendation','#orderStructure','#projectNetworkControls','.shell-field-group[aria-labelledby="networkSettingsHeading"]','[data-citation-only="true"]'])assert.ok(css.includes('.semantic-canvas '+selector),selector);
 assert.match(app,/document.body.classList.toggle\('semantic-canvas',isEntityMap\(\)\)/);assert.match(app,/const isEntityMap=\(\)=>\['semantic','collaboration'\].includes/);
 assert.match(browser,/function sync\(graph\)\{const body=document.querySelector\('#analysisPanel .shell-panel-body'\);if\(body&&panel.parentElement!==body\)body.prepend\(panel\)/);
 assert.match(browser,/construction.textContent=method\(graph\).title/);assert.match(browser,/graph.stats.clusters/);
 assert.match(workspace,/for\(const input of \[preset,threshold,support,cpm,order,maximumOrder\]\)input.parentElement.dataset.citationOnly='true'/);
 assert.match(workspace,/graph\(\).semantic\?window.ATLAS_SEMANTIC.recompute\(\):rebuild\(\{\},true\)/);
 assert.match(browser,/recompute:\(\)=>run\(false,true\)/);assert.match(browser,/status.textContent = message;\}, force\)/);
 assert.doesNotMatch(css,/semantic-canvas #multiuserNetworkControls\s*\{/);
});

test('workspace relationship tabs are bounded and scroll rather than expanding mobile document',()=>{
 const css=readFileSync('public/conservative-atlas/science.css','utf8');
 assert.match(css,/\.workspace-shell \.workspace-tabs\{[^}]*box-sizing:border-box;[^}]*min-width:0;max-width:100%;width:100%;overflow-x:auto;flex-wrap:nowrap/);
 assert.match(css,/\.workspace-shell \.workspace-tabs button\{flex:0 0 auto;white-space:nowrap\}/);
});
