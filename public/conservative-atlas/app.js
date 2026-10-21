(()=>{'use strict';
const errorMessage = problem => window.ATLAS_EVIDENCE?.errorMessage?.(problem) || (typeof problem?.message === 'string' && !['', 'undefined', 'null'].includes(problem.message.trim()) ? problem.message : 'The request failed. Reload and retry.');
const data=window.ATLAS_DATA,$=id=>document.getElementById(id),svg=$('network'),vp=$('viewport');
const originalDataset={summary:data.summary,articles:data.articles,references:data.references};
let externalPacket=null,originalThemes=null;
const titleCase=window.ATLAS_LABELS.titleCase;
const displaySection=$('displayHeading').closest('section');$('canvasDisplay').append(displaySection);
$('canvasClusterSelect').append($('groupLabel'),$('cluster'));
for(const element of [document.querySelector('label[for="edgeDisplay"]'),$('edgeDisplay'),$('edgeDisplay').nextElementSibling,$('edgeLabel').parentElement,$('minEdge'),$('edgeHelp').parentElement])$('canvasDisplay').append(element);
svg.setAttribute('viewBox','0 0 980 700');
const measure=document.createElement('canvas').getContext('2d');
const NS='http://www.w3.org/2000/svg',colors=['#257b75','#c77936','#5c6eac','#a45070','#658343','#8c65a0','#3c839c','#aa654e'];
const state={name:'cocitation_min10',method:'cocitation',selected:null,selectedEdge:null,zoom:1,tx:0,ty:0,view:'network',drag:null,moved:false,width:980,height:700,hover:null};
let graph,nodes=[],links=[],index;
const isCoupling=()=>graph?.canvasKind==='coupling';
const constructionOnly=()=>graph?._backend?.startsWith('independent-bnr')&&graph.clustering?.algorithm==='not_requested';
const isEntityMap=()=>['semantic','collaboration'].includes(graph?.canvasKind); const entityAdapter=()=>graph?.collaboration?window.ATLAS_COLLABORATION:window.ATLAS_SEMANTIC;
let semanticParent;
let referenceSession,couplingSession,couplingSource,couplingScope;
const representationLabel=document.createElement('label');representationLabel.textContent='Representation';const representation=document.createElement('select');representation.id='hypergraphRepresentation';representation.setAttribute('aria-label','Network representation');for(const [value,label]of [['network','Network'],['envelopes','Hyperedge envelopes'],['3d','3D hypergraph · orbit / explode']])representation.append(new Option(label,value));representationLabel.append(representation);$('canvasDisplay').append(representationLabel);const hypergraphStatus=document.createElement('p');hypergraphStatus.className='hypergraph-view-status';hypergraphStatus.hidden=true;$('network').closest('.network-stage').after(hypergraphStatus);
let threeLoading;
const threeButton=document.createElement('button');threeButton.type='button';threeButton.id='view3D';threeButton.textContent='3D';threeButton.title='Orbit the hypergraph and explode exact combinations';threeButton.setAttribute('aria-pressed','false');$('viewTable').after(threeButton);threeButton.onclick=()=>{representation.value='3d';view('network');render();};
function syncThreeD(){
 const active=representation.value==='3d'&&state.view==='network',stage=svg.closest('.network-stage');stage.classList.toggle('is-three-d',active);$('exportSvg').disabled=active;
 threeButton.classList.toggle('active',active);threeButton.setAttribute('aria-pressed',String(active));$('viewNetwork').classList.toggle('active',state.view==='network'&&!active);$('viewNetwork').setAttribute('aria-pressed',String(state.view==='network'&&!active));
 if(!active){window.ATLAS_HYPERGRAPH_3D?.hide();return;}
 if(!window.ATLAS_HYPERGRAPH_3D){if(!threeLoading){threeLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='hypergraph-3d.js?v=canvas-ui-clarity-1';script.onload=resolve;script.onerror=()=>reject(new Error('Could not download the 3D renderer.'));document.head.append(script);}).then(()=>{threeLoading=null;if(representation.value==='3d')syncThreeD();}).catch(error=>{threeLoading=null;representation.value='envelopes';stage.classList.remove('is-three-d');$('exportSvg').disabled=false;hypergraphStatus.hidden=false;hypergraphStatus.textContent=errorMessage(error)+' Select 3D again to retry.';});}return;}
 window.ATLAS_HYPERGRAPH_3D.show({container:stage,graph,nodes,color,focus:{node:state.selected,edge:state.selectedEdge,cluster:pinnedCluster||$('cluster').value,query:$('query').value,colorBy:$('colorMode').value},bundles:graph.bundles||data.bundlesByScope[graph.threshold]||[],inspect:inspectHyperedge,inspectNode:selectNode,sourceArticles,openLayers:edge=>window.openClusterCombinationLayers({groups:[edge],total:1,nodes:graph.nodes,clusterLabel:'Selected 3D combination',coupling:isCoupling(),nodeColor:color,sourceArticles})});
}
const canvasControlIds=['hypergraphRepresentation','clusteringMethod','networkModel','query','cluster','canvasLabelMode','couplingLabelMode','minEdge','nodeScale','labels','labelSize','clusterHover','edgeDisplay','colorMode','threshold','orderMode','orderSlider','maximumOrder','coCitationOrder','modelResolution','cpmSlider'];
function graphModel(current=graph){return current?.networkModel||current?.clustering?.networkModel||(current?.clustering?.algorithm==='hypergraph'?'hypergraph':current?.order&&current.order!==2?'higher-order':'pairwise');}
function syncNetworkModel(){
 const model=graphModel();$('networkModel').value=model;$('networkModel').disabled=!graph;
 $('clusteringMethod').querySelector('option[value="leiden"]').textContent=model==='hypergraph'?'Leiden · bipartite CPM':isCoupling()?'Leiden · CPM':'Leiden · CPM / Auto';
 $('networkModel').querySelector('option[value="higher-order"]').disabled=isCoupling()||!!graph?.temporal;
 $('networkModel').querySelector('option[value="hypergraph"]').disabled=graph?.clustering?.algorithm==='sbm';
 $('orderMode').parentElement.hidden=isCoupling()||model==='pairwise';$('orderControl').hidden=isCoupling()||model==='pairwise';$('maximumOrder').parentElement.hidden=isCoupling()||model==='pairwise'||$('orderMode').value!=='combined';
 $('orderSlider').min=model==='higher-order'?3:2;
 if(model==='hypergraph'){$('cpmSlider').parentElement.hidden=true;$('autoCPMInfo').hidden=true;}
}
const canvasTextIds=['methodTitle','methodQuestion','searchHeading','groupLabel','edgeLabel','edgeHelp','nodeColumn','sizeColumn','groupColumn','analysisNote','mapCaption','labelHint','interactionHint','orderStructure','orderSliderValue','maximumOrderValue','cpmValue','cpmHint'];
function captureCanvas(){
return {graph,state:{...state,drag:null,hover:null},controls:Object.fromEntries(canvasControlIds.map(id=>{const control=$(id);return [id,{value:id==='clusteringMethod'?(['infomap','hypergraph','sbm'].includes(graph.clustering?.algorithm)?graph.clustering.algorithm:'leiden'):control.value,checked:control.checked,min:control.min,max:control.max,disabled:control.disabled,options:control.tagName==='SELECT'?[...control.options].map(option=>[option.text,option.value]):null}];})),texts:Object.fromEntries(canvasTextIds.map(id=>[id,$(id).textContent])),hideUnlinked:mapVisibility.hideUnlinked,minimumClusterSize:mapVisibility.minimumClusterSize,hiddenClusters:new Set(mapVisibility.hiddenClusters),filteredClusters:filteredClusters?new Set(filteredClusters):null,pinnedCluster,includeConnected,activeBundle,expanded:document.body.classList.contains('map-expanded')};
}
function syncCommunityReport(){
 const alternative=['infomap','hypergraph','sbm'].includes(graph.clustering?.algorithm)||graph.networkModel==='hypergraph',comparison=graph.comparison;
 $('communityReport').hidden=!alternative||!comparison;
 if(!alternative||!comparison)return;
 $('communityAudit').textContent=(graph.networkModel==='hypergraph'?communityExplanation():isCoupling()?(graph.clustering.method||'Infomap uses modeled flow on the cosine-weighted coupling network.')+' '+graph.clustering.limitations:communityExplanation())+' Compared with Leiden CPM '+comparison.baselineResolution+' ('+comparison.baselineClusters+' clusters): adjusted Rand agreement '+(comparison.adjustedRandIndex==null?'undefined':comparison.adjustedRandIndex.toFixed(3))+' on '+comparison.sharedNodes+' shared linked nodes. '+comparison.note+(graph.hyperedges?' '+graph.hyperedges.length+' whole groups used.':'');
}
function refreshAnalysisControls(){
 const disabled=!graph||isEntityMap()||!!graph.temporalSelection||!!graph.trial||!!window.ATLAS_HISTORY?.active()||!!(window.BIBLIOMAP?.active&&window.BIBLIOMAP.canCompute===false)||!!window.ATLAS_PROJECTS?.isBusy?.();
 $('clusteringMethod').disabled=disabled;$('networkModel').disabled=disabled;
 $('modelResolution').disabled=disabled||!!externalPacket||isCoupling();$('threshold').disabled=disabled||!!externalPacket||isCoupling();
 window.atlasWorkspaceShell?.refresh();
}
function canvasMode(coupling){
 if(!graph.semantic)window.ATLAS_SEMANTIC?.resetContext();
 if(externalPacket)data.summary=window.ATLAS_EVIDENCE.currentStudySummary(externalPacket,graph,data.articles);
 if(!graph.collaboration)window.ATLAS_COLLABORATION?.resetContext();
 document.body.classList.toggle('temporal-canvas',!!graph.temporalSelection);window.ATLAS_TEMPORAL?.sync(graph);window.ATLAS_DESCRIPTIONS?.sync(graph);
 document.body.classList.toggle('semantic-canvas',isEntityMap());threeButton.disabled=isEntityMap();for(const option of representation.options)option.disabled=isEntityMap()&&option.value!=='network';if(!isEntityMap())$('minEdge').step='1';
 $('clusteringMethod').querySelector('option[value="leiden"]').textContent=coupling?'Leiden · CPM':'Leiden · CPM / Auto';
 syncCommunityReport();$('cpmSlider').parentElement.hidden=coupling||!!graph.appliedSettings||['infomap','hypergraph','sbm'].includes(graph.clustering?.algorithm);
 $('couplingLabelControl').hidden=!coupling;document.body.classList.toggle('coupling-canvas',coupling);document.querySelector('.analysis-switches').hidden=coupling||!!externalPacket;
 document.querySelector('.shell-scope')?.toggleAttribute('hidden',!!externalPacket);
 if($('projectNetworkControls'))$('projectNetworkControls').hidden=!externalPacket;
 if($('projectReferenceControls'))$('projectReferenceControls').hidden=coupling;
 if($('drillBreadcrumb'))$('drillBreadcrumb').hidden=coupling||!drillStack.length;
 $('metricExplanation').hidden=coupling||graph.order!=='all';
 $('workList').setAttribute('aria-label',coupling?'Matching source articles':'Matching cited works');
 $('query').placeholder=coupling?'Source title, author, year or ID…':'Name, title, year or record ID…';
 syncNetworkModel();
 document.querySelector('label[for="threshold"]').textContent=coupling?'Source scope':'Analysis scope';
 if(graph.temporalSelection)for(const id of ['clusteringMethod','networkModel','modelResolution','threshold'])$(id).disabled=true;
 if(isEntityMap()){
  for(const id of ['clusteringMethod','networkModel','modelResolution','threshold'])$(id).disabled=true;
  $('couplingLabelControl').hidden=true;$('orderMode').parentElement.hidden=true;$('orderControl').hidden=true;$('maximumOrder').parentElement.hidden=true;$('cpmSlider').parentElement.hidden=true;
  $('query').placeholder='Find a '+method().node.toLowerCase()+'…';$('metricExplanation')?.setAttribute('hidden','');
 }
 refreshAnalysisControls();
}
const importedCouplingLayouts=new WeakSet();
function restoreCanvas(session){
 representation.value=session.controls?.hypergraphRepresentation?.value||'network';
 graph=session.graph;index=new Map(graph.nodes.map(node=>[node.id,node]));Object.assign(state,session.state);
 for(const [id,saved] of Object.entries(session.controls)){const control=$(id);if(saved.options)control.replaceChildren(...saved.options.map(([label,value])=>new Option(label,value)));for(const key of ['min','max','disabled','checked','value'])if(saved[key]!==undefined)control[key]=saved[key];}
 const previousRepresentation=representation.value;representation.replaceChildren(new Option('Network','network'),new Option('Hyperedge envelopes','envelopes'),new Option('3D hypergraph · orbit / explode','3d'));representation.value=previousRepresentation==='layered'?'envelopes':previousRepresentation||'network';
 for(const [id,value] of Object.entries(session.texts))$(id).textContent=value;
 if(!externalPacket&&graph.autoCPM&&!graph.appliedSettings){const restoredMode=graph.autoCPM.enabled?'auto':String(graph.resolution);if(![...$('modelResolution').options].some(option=>option.value===restoredMode))$('modelResolution').append(new Option(restoredMode,restoredMode));$('modelResolution').value=restoredMode;annotateOrderOptions();}
 mapVisibility.hideUnlinked=session.hideUnlinked;mapVisibility.minimumClusterSize=session.minimumClusterSize||1;mapVisibility.hiddenClusters=new Set(session.hiddenClusters);filteredClusters=session.filteredClusters;pinnedCluster=session.pinnedCluster;includeConnected=session.includeConnected;activeBundle=session.activeBundle;
 document.body.classList.toggle('map-expanded',session.expanded);$('expandMap').textContent=session.expanded?'Restore panels':'Expand map';$('expandMap').setAttribute('aria-pressed',String(session.expanded));
 if(!isCoupling()&&!isEntityMap()&&themeData)graph.themeDescriptions=window.ATLAS_THEMES.describe(graph.nodes,themeData);
 const layoutImported=graph._backend==='independent-bnr-standalone'&&graph.importedStandalone&&isCoupling()&&!importedCouplingLayouts.has(graph);
 if(layoutImported){importedCouplingLayouts.add(graph);separateClusters();}
 canvasMode(isCoupling());mountMapVisibility();clusterListGraph=null;view(state.view);render();if(layoutImported)fit();if(sourceThemeMap())requestCouplingThemes();else if(!isEntityMap()&&!themeData)requestThemes();
 if(state.selected&&index.has(state.selected))selectNode(state.selected,false);else if(state.selectedEdge){const edge=graph.links.find(edge=>edge.source+'|'+edge.target===state.selectedEdge);if(edge)selectEdge(edge,false);else overview();}else overview();
 requestAnimationFrame(()=>{const bounds=svg.getBoundingClientRect();if(bounds.width>=50&&(Math.abs(bounds.width-state.width)>1||Math.abs(bounds.height-state.height)>1))resizeMap();});
}
function showCouplingCanvas(source,scopeKey,scopeLabel){
 if(isEntityMap())showReferenceCanvas();
 if(isCoupling()&&couplingSource===source&&couplingScope===scopeKey)return;
 if(!isCoupling())referenceSession=captureCanvas();
 if(couplingSession&&couplingSource===source&&couplingScope===scopeKey){if(!isCoupling())restoreCanvas(couplingSession);return;}
 couplingSource=source;couplingScope=scopeKey;couplingSession=null;
 graph=window.ATLAS_EVIDENCE.couplingCanvasGraph(source,scopeLabel);graph.externalCorpus=!!externalPacket;$('clusteringMethod').value=['infomap','hypergraph','sbm'].includes(source?.clustering?.algorithm)?source.clustering.algorithm:'leiden';index=new Map(graph.nodes.map(node=>[node.id,node]));
 state.name='source-coupling';state.method='coupling';state.selected=null;state.selectedEdge=null;state.hover=null;state.zoom=1;state.tx=0;state.ty=0;state.drag=null;
 activeBundle=null;pinnedCluster=null;includeConnected=false;filteredClusters=null;mapVisibility.hideUnlinked=true;mapVisibility.hiddenClusters.clear();$('nodeScale').value=10;$('labelSize').value=11;$('couplingLabelMode').value=constructionOnly()?'sources':'foundations';$('clusterActionsDialog')?.hidePopover();
 $('cluster').replaceChildren(new Option('All coupling clusters and unlinked sources','all'),...[...new Set(graph.nodes.map(node=>node.cluster))].sort((left,right)=>left-right).map(cluster=>new Option(groupName(cluster),String(cluster))));
 $('threshold').replaceChildren(new Option(scopeLabel,'source-scope'));$('threshold').disabled=true;
 $('labelHint').textContent='Default labels show the most-shared reference cited by that source within its cluster (Shares: …). Nodes remain source articles. Selecting a node or searching restores source-article labels; clearing selection restores foundations. Repeated foundation labels are suppressed within each cluster. Overview labels are limited to 12. Node size means reference-list size, not citations.';
 $('interactionHint').textContent='Right-click or long-press a node or cluster for highlighting and filtering. Tap or long-press a line for shared-reference evidence. Drag to pan; pinch to zoom.';
 $('query').value='';$('minEdge').min=graph.minimumShared;$('minEdge').max=graph.links.reduce((maximum,edge)=>Math.max(maximum,edge.count),graph.minimumShared);$('minEdge').value=graph.minimumShared;$('edgeDisplay').value='strongest';
 $('colorMode').replaceChildren(new Option('Coupling cluster','cluster'),new Option('Publication year','year'));
 const info=method();for(const [id,value] of Object.entries({methodTitle:info.title,methodQuestion:info.question,searchHeading:'Find a source article',groupLabel:'Coupling cluster',edgeLabel:'Display minimum shared references',edgeHelp:info.weight,nodeColumn:info.node,sizeColumn:info.size,groupColumn:info.group,analysisNote:source?scopeLabel+' · shared ≥'+graph.minimumShared+' · cosine ≥'+graph.minimumCosine+' · '+communityLabel()+(graph.resolution==null?'':' · CPM '+graph.resolution)+'. Display filters never recluster.':'Build a coupling network using the settings above. The co-citation map is preserved in its tab.',mapCaption:'Node size: available references (not citations). Line intensity: shared references (compressed scale). Colors: coupling communities. Distances are not similarity scores.'}))$(id).textContent=value;
 canvasMode(true);mountMapVisibility();clusterListGraph=null;separateClusters();view('network');render();fit();overview();if(source&&!constructionOnly()&&!graph.derivedMethod)requestCouplingThemes();requestAnimationFrame(resizeMap);
}
function showReferenceCanvas(){if(isEntityMap()){const parent=semanticParent;if(!parent){window.ATLAS_EVIDENCE.showEntityWorkspace(graph.canvasKind);$('analysisNote').textContent='Open a saved co-citation result from this project, or use the Co-citation tab to build one. No unrelated study is restored.';return;}restoreSavedCanvas(parent);return;}if(!isCoupling())return;if(!referenceSession){window.ATLAS_EVIDENCE.showEntityWorkspace('coupling');$('analysisNote').textContent='This saved view has no completed co-citation parent. Open a saved co-citation result from this study; no unrelated map is substituted.';return;}couplingSession=captureCanvas();restoreSavedCanvas(referenceSession);}
function showSemanticCanvas(next,parentSnapshot){
 next.externalCorpus=!!externalPacket;
 window.ATLAS_EVIDENCE.showEntityWorkspace(next.canvasKind);
 window.ATLAS_EVIDENCE.cancelCanvasReliability();if(arguments.length>1)semanticParent=parentSnapshot;else if(!isEntityMap())semanticParent={...captureCanvas(),reference:isCoupling()?referenceSession:null};graph=next;entityAdapter().sync(graph);index=new Map(graph.nodes.map(node=>[node.id,node]));state.method='cocitation';state.name=graph.canvasKind+'-'+(graph.semantic||graph.collaboration).kind;state.selected=null;state.selectedEdge=null;state.hover=null;state.tx=0;state.ty=0;state.zoom=1;
 pinnedCluster=null;filteredClusters=null;includeConnected=false;activeBundle=null;mapVisibility.hideUnlinked=!graph.collaboration?.ego;if(graph.collaboration?.ego)mapVisibility.minimumClusterSize=1;mapVisibility.hiddenClusters.clear();representation.value='network';$('query').value='';$('edgeDisplay').value='strongest';$('minEdge').min=graph.semantic?.kind==='embeddings'?0:graph.minimumSupport;$('minEdge').max=Math.max(1,...graph.links.map(edge=>edge.count));$('minEdge').value=$('minEdge').min;$('minEdge').step=graph.entityKind==='source'?.01:1;if(graph.entityKind==='source'){$('minEdge').max=1;$('minEdge').value=graph.semantic.minimumSimilarity;}
 $('threshold').replaceChildren(new Option('Pinned '+graph.canvasKind+' source evidence',graph.canvasKind));$('cluster').replaceChildren(new Option('All clusters','all'),...[...new Set(graph.nodes.map(node=>node.cluster))].sort((left,right)=>left-right).map(cluster=>new Option('Cluster '+cluster,String(cluster))));$('colorMode').replaceChildren(new Option('Community','cluster'));$('clusteringMethod').value='leiden';$('networkModel').value='pairwise';
 const info=method();for(const [id,value] of Object.entries({methodTitle:info.title,methodQuestion:info.question,searchHeading:'Find '+info.node.toLowerCase(),groupLabel:'Cluster',edgeLabel:graph.semantic?.kind==='embeddings'?'Display connections':'Display minimum source support',edgeHelp:info.weight,nodeColumn:info.node,sizeColumn:info.size,groupColumn:'Cluster',analysisNote:info.explanation,labelHint:'Labels name '+info.plural+'. Cluster headings are exploratory; display changes never recompute the analysis.',interactionHint:'Select a node or curved line for its observed supporting evidence.'}))$(id).textContent=value;
 canvasMode(false);mountMapVisibility();clusterListGraph=null;separateClusters();view('network');render();fit();overview();if(graph.entityKind==='source')requestCouplingThemes();requestAnimationFrame(resizeMap);
}
function applyCanvasSettings(next){
 window.ATLAS_EVIDENCE.cancelCanvasReliability();
 if(isCoupling()){window.ATLAS_EVIDENCE.applyCouplingSettings(next);return;}
 graph=next;window.ATLAS_TEMPORAL?.sync(graph);window.ATLAS_DESCRIPTIONS?.sync(graph);index=new Map(graph.nodes.map(node=>[node.id,node]));$('minEdge').min=graph.minimumSupport||5;$('minEdge').max=Math.max(graph.minimumSupport||5,...graph.links.map(edge=>edge.count));$('minEdge').value=graph.minimumSupport||5;
 syncNetworkModel();
 state.selected=null;state.selectedEdge=null;state.hover=null;pinnedCluster=null;includeConnected=false;filteredClusters=null;activeBundle=null;mapVisibility.hiddenClusters.clear();
 $('cluster').replaceChildren(new Option('All communities and unlinked works','all'),...[...new Set(graph.nodes.map(node=>node.cluster))].sort((left,right)=>left-right).map(cluster=>new Option(groupName(cluster),String(cluster))));
 $('query').value='';$('clusterActionsDialog')?.hidePopover();clusterListGraph=null;
 $('cpmSlider').parentElement.hidden=true;$('autoCPMReport').parentElement.hidden=true;if($('cpmRecommendation'))$('cpmRecommendation').hidden=true;$('communityReport').hidden=true;
 $('orderStructure').textContent=graph.stats.clusters+' clusters · '+graph.appliedSettings.settings.label+(graph.temporal?' · period-specific pairwise evidence':' · fixed evidence network');
 $('analysisNote').textContent=orderDescription()+' · '+communityLabel()+' · '+graph.appliedSettings.settings.label+'. Settings audit is available beside the method selector; changing scope or order starts a new analysis.';
 $('groupLabel').textContent=communityLabel()+' community';$('groupColumn').textContent=communityLabel()+' community';
 if(themeData)graph.themeDescriptions=window.ATLAS_THEMES.describe(graph.nodes,themeData);
 mountMapVisibility();separateClusters();render();fit();overview();
}
function restoreSavedCanvas(snapshot){
 const session=window.ATLAS_EVIDENCE.prepareCanvasSnapshot(snapshot,{corpusId:externalPacket?.corpusId});
 if(['semantic','collaboration'].includes(session.graph.canvasKind)){semanticParent=session.reference||null;referenceSession=semanticParent?.graph.canvasKind==='coupling'?semanticParent.reference||null:semanticParent;showSemanticCanvas(session.graph,semanticParent);restoreCanvas(session);return;}
 semanticParent=null;
 if(session.graph.canvasKind==='coupling'){referenceSession=session.reference||null;const next=window.ATLAS_EVIDENCE.adoptCoupling(session.graph,referenceSession?.graph||null);graph=next;couplingSource=next;couplingScope='saved-'+data.summary.corpus_id+'|null';restoreCanvas({...session,graph:next});window.ATLAS_EVIDENCE.showCouplingControls();refreshAnalysisControls();return;}
 referenceSession=null;window.ATLAS_EVIDENCE.showReferenceWorkspace();restoreCanvas(session);
}
async function installSavedSnapshot(packet,snapshot){
 window.ATLAS_EVIDENCE.validateCanvasPacket(packet);
 const prepared=window.ATLAS_EVIDENCE.prepareCanvasSnapshot(snapshot,{corpusId:packet?.corpusId,completedBrowse:true}),previousPacket=externalPacket,previous=window.ATLAS_EVIDENCE.prepareCanvasSnapshot(window.atlasSharedCanvas.captureProject());
 try{window.ATLAS_STARTUP_NAVIGATION?.saved();window.atlasSharedCanvas.installCorpus(packet,{deferGraph:true});await window.atlasSharedCanvas.restore(prepared);}
 catch(problem){window.atlasSharedCanvas.installCorpus(previousPacket,{deferGraph:true});await window.atlasSharedCanvas.restore(previous);throw Error('The saved map could not be opened; the previous study was restored. '+errorMessage(problem));}
}
let communityJob,communityPending=false;
const communityLabel=()=>window.ATLAS_CLUSTERING_CONCEPTS.describe(graph).clusterLabel;
function communityExplanation(){if(graph?.clustering?.objective==='joint_CPM')return window.ATLAS_CLUSTERING_CONCEPTS.describe(graph).scoreSummary+' '+window.ATLAS_CLUSTERING_CONCEPTS.describe(graph).validity;if(constructionOnly())return 'Only the declared graph construction was executed. No optimizer, CPM selection, communities or thematic interpretation was requested.';if(graph?.networkModel==='hypergraph'&&graph.clustering?.algorithm!=='hypergraph')return graph.clustering.limitations;if(graph?.clustering?.algorithm==='sbm')return graph.clustering.objective+'. '+graph.clustering.limitations;return graph?.clustering?.algorithm==='hypergraph'?'Groups are optimized using whole supported combinations and a degree-based hypergraph null model. Each source contributes one total unit across its included combinations. Lines still show the original pair projection; line intensity is not the hypergraph optimization weight. '+graph.clustering.limitations:graph?.clustering?.algorithm==='infomap'?'Infomap groups references by modeled flow on the selected weighted pair network, using ten trials of the two-level map equation. '+graph.clustering.limitations:method().weight;}
const mapVisibility={hideUnlinked:true,hiddenClusters:new Set(),minimumClusterSize:1};
function mountMapVisibility(){
 let host=$('mapVisibility');if(!host){host=text('div');host.id='mapVisibility';$('canvasVisibility').append(host);}host.replaceChildren();
 window.ATLAS_EVIDENCE?.visibilityControls(host,graph.nodes,mapVisibility,()=>{const hidden=window.ATLAS_EVIDENCE.clusterSizeFilter(graph.nodes,mapVisibility.minimumClusterSize).hiddenClusters;if(hidden.has(Number(pinnedCluster))||hidden.has(Number($('cluster').value))){$('cluster').value='all';pinnedCluster=null;includeConnected=false;filteredClusters=null;}activeBundle=null;state.selected=null;state.selectedEdge=null;state.hover=null;clusterListGraph=null;render();fit();overview();},method().plural);
}
const drillStack=[],drillCache=new Map();let graphRequest=0;
let expandedData,expandedLoading;
let themeData,themeLoading,themeError='',sourceThemeData,sourceThemeLoading;
const importedThemeLoads=new WeakMap();
function sourceThemeMap(){return isCoupling()||isEntityMap()&&graph.entityKind==='source';}
function requestImportedThemes(){
 const target=graph,packet=externalPacket;
 if(importedThemeLoads.has(target))return importedThemeLoads.get(target);
 const loading=(async()=>{
  if(window.BIBLIOMAP?.active||window.BIBLIOMAP_MULTIUSER)throw Error('Imported naming is unavailable in this authenticated context. No public fallback was used.');
  if(!sourceThemeMap()||!packet||!window.ATLAS_EVIDENCE.bindImportedThemes)throw Error('Pinned source-article evidence is unavailable for this imported map.');
  const response=await fetch('workspace-api/corpora/'+encodeURIComponent(packet.corpusId)+'/themes');if(!response.ok)throw Error('Pinned-source keywords are not prepared for this corpus. Ask the local operator to prepare its exact saved text; no graph rebuild is needed.');
  const result=await response.json();await window.ATLAS_EVIDENCE.bindImportedThemes(target,result,packet);if(graph!==target||externalPacket!==packet)return;
  sourceThemeData=result;sourceThemeLoading=null;themeError='';delete target.themeError;target.themeDescriptions=window.ATLAS_THEMES.describe(target.nodes,result);target.themeInterpretation={kind:'current-source-text-overlay',textBinding:result.importedSourceText,model:result.model,revision:result.revision,limitation:'Current interpretative overlay, not the retained study report or reviewer approval. No network, membership or objective changes.'};clusterListGraph=null;render();if(!state.selected&&!state.selectedEdge)overview();
 })().catch(error=>{if(graph!==target)return;window.ATLAS_EVIDENCE.clearImportedThemes?.(target);delete target.themeDescriptions;target.themeError=error.message;themeError=error.message;clusterListGraph=null;renderClusterList();}).finally(()=>{if(importedThemeLoads.get(target)===loading)importedThemeLoads.delete(target);});
 importedThemeLoads.set(target,loading);return loading;
}
function requestCouplingThemes(){
 if(graph?._backend==='independent-bnr-standalone'&&graph.importedStandalone)return requestImportedThemes();
 if(window.BIBLIOMAP_MULTIUSER&&(!externalPacket||graph?._backend?.startsWith('independent-bnr')))return Promise.resolve();
 if(isEntityMap()&&graph.entityKind!=='source')return;
 const target=graph,corpusId=data.summary.corpus_id;
 if(isEntityMap()&&window.ATLAS_SEMANTIC.sourceCache?.sourceCorpusId===corpusId){sourceThemeData=window.ATLAS_SEMANTIC.sourceCache;sourceThemeLoading=Promise.resolve(sourceThemeData);}
 if(!sourceThemeLoading)sourceThemeLoading=fetch(externalPacket?'workspace-api/corpora/'+corpusId+'/themes'+(window.BIBLIOMAP?.active?'?result='+encodeURIComponent(target._resultId):''):'source-cluster-themes.json?v=2').then(response=>{if(!response.ok)throw new Error('Source keywords unavailable');return response.json();}).then(result=>{if(result.sourceCorpusId!==corpusId)throw new Error('Source keyword corpus mismatch');if(data.summary.corpus_id===corpusId)sourceThemeData=result;return result;});
 return sourceThemeLoading.then(result=>{if(graph!==target)return;delete graph.themeError;graph.themeDescriptions=window.ATLAS_THEMES.describe(graph.nodes,result);for(const option of $('cluster').options)if(graph.themeDescriptions[option.value])option.text=groupName(option.value)+' · '+titleCase(graph.themeDescriptions[option.value].heading);clusterListGraph=null;render();if(!state.selected&&!state.selectedEdge)overview();}).catch(()=>{if(graph!==target)return;sourceThemeLoading=null;graph.themeError=externalPacket?'Generate project analysis for keywords and Qwen descriptions.':'Source keywords unavailable; analysis is unaffected.';clusterListGraph=null;renderClusterList();});
}
function requestThemes(){
 if(graph?._backend==='independent-bnr-standalone'&&graph.importedStandalone)return requestImportedThemes();
 if(window.BIBLIOMAP_MULTIUSER&&(!externalPacket||graph?._backend?.startsWith('independent-bnr')))return Promise.resolve();
 if(isEntityMap())return;
 const target=graph,corpusId=data.summary.corpus_id;
 if(!themeLoading)themeLoading=fetch(externalPacket?'workspace-api/corpora/'+corpusId+'/themes'+(window.BIBLIOMAP?.active?'?result='+encodeURIComponent(target._resultId):''):'cluster-themes.json?v=2').then(response=>{if(!response.ok)throw new Error('Keyword cache unavailable');return response.json();}).then(result=>{if(result.sourceCorpusId!==corpusId)throw new Error('Keyword cache corpus mismatch');if(data.summary.corpus_id===corpusId)themeData=result;return result;});
 return themeLoading.then(result=>{if(graph!==target)return;delete graph.themeError;themeError='';graph.themeDescriptions=window.ATLAS_THEMES.describe(graph.nodes,result);clusterListGraph=null;render();if(!state.selected&&!state.selectedEdge)overview();}).catch(()=>{if(graph!==target)return;themeError=externalPacket?'Generate project analysis for keywords and Qwen descriptions.':'Suggested themes unavailable; network analysis is unaffected.';themeLoading=null;clusterListGraph=null;renderClusterList();});
}
function themePanel(parent,cluster){
 if(graph?._backend==='independent-bnr-standalone'&&graph.importedStandalone&&!window.ATLAS_EVIDENCE.importedThemeBinding?.(graph))return;
 const description=graph.themeDescriptions?.[cluster];if(!description)return;
 const themeEvidence=sourceThemeMap()||isEntityMap()&&graph.entityKind==='source'?sourceThemeData:themeData;if(!themeEvidence)return;
 const section=text('section','','theme-description');section.append(text('span','SUGGESTED THEME · CLUSTER '+cluster,'eyebrow'),text('h2',titleCase(description.heading)));
 if(graph.importedStandalone){const coverage=themeEvidence.importedSourceText.coverage;para(section,'Current source-text interpretation overlay; not part of the retained study report or its review approval. The network and memberships are unchanged. Pinned corpus: '+coverage.withAbstract+'/'+coverage.sources+' valid retained abstracts; '+coverage.omittedInvalidAbstracts+' malformed or gapped abstracts omitted (titles remain available).','theme-coverage');}
 window.ATLAS_DESCRIPTIONS?.mount(section,graph,cluster,id=>selectNode(id));
 const keywordStart=section.children.length;
 para(section,description.evidenceMode+' · '+description.withText+'/'+description.total+' '+(sourceThemeMap()?'source articles':'references')+' have text; '+description.withAbstract+' have abstracts.','theme-coverage');
 para(section,'MiniLM + KeyBERT suggestions, not validated themes. '+(description.comparisonClusters>1?'Phrases ranked against '+(description.comparisonClusters-1)+(graph.drillPath?.length?' sibling subclusters.':' other clusters.'):'Only one cluster: no sibling contrast is available.')+(description.total<3?' Very small cluster; interpret cautiously.':''));
 const keywords=text('div','','theme-keywords'),evidence=text('div','','theme-evidence');evidence.setAttribute('aria-live','polite');
for(const term of description.keywords){const button=text('button',titleCase(term.text),'secondary');button.type='button';button.setAttribute('aria-label',titleCase(term.text)+' — show text evidence from '+term.sources.length+(sourceThemeMap()?' source articles':' references'));button.onclick=()=>{evidence.replaceChildren(text('h3','Text evidence: '+titleCase(term.text)));para(evidence,term.sources.length+(sourceThemeMap()?' matching source articles.':' matching references.')+' Phrase ranking is not a probability or validation.');for(const source of term.sources){const record=themeEvidence.documents[source.id],details=document.createElement('details');details.append(text('summary',record.title||source.id));for(const match of source.evidence){const characters=Array.from(record[match.field]),start=Math.max(0,match.start-90),end=Math.min(characters.length,match.end+120),quote=text('p','');quote.append(document.createTextNode(match.field+': '+(start?'…':'')+characters.slice(start,match.start).join('')),text('mark',characters.slice(match.start,match.end).join('')),document.createTextNode(characters.slice(match.end,end).join('')+(end<characters.length?'…':'')));details.append(quote);}const inspect=text('button',sourceThemeMap()?'Inspect source article':'Inspect reference','secondary');inspect.onclick=()=>selectNode(source.id);details.append(inspect);evidence.append(details);}};keywords.append(button);}
 section.append(keywords,evidence,text('h3',sourceThemeMap()?'Representative source articles':'Representative references'));
 for(const reference of description.representatives){const button=text('button',themeEvidence.documents[reference.id].title||reference.id,'evidence-work');button.onclick=()=>selectNode(reference.id);section.append(button);}
 para(section,'Representatives are closest to the mean text embedding, not necessarily most cited. English-focused model; missing text and language differences can weaken suggestions.','muted');
 const exportButton=text('button','Export theme evidence','secondary');exportButton.onclick=()=>{const ids=new Set([...description.keywords.flatMap(term=>term.sources.map(source=>source.id)),...description.representatives.map(reference=>reference.id)]);save(JSON.stringify({cluster,description,documents:Object.fromEntries([...ids].map(id=>[id,{title:themeEvidence.documents[id].title,abstract:themeEvidence.documents[id].abstract}])),analysis:{analysisId:graph.analysisId,threshold:graph.threshold,resolution:graph.resolution,order:graph.order,maximumOrder:graph.maximumOrder,drillPath:graph.drillPath||[]}},null,2),'application/json','cluster-'+cluster+'-theme-evidence.json');};section.append(exportButton);const keywordDetails=document.createElement('details');keywordDetails.append(text('summary','Extracted keywords & representative articles'));for(const child of [...section.children].slice(keywordStart))keywordDetails.append(child);section.append(keywordDetails);parent.append(section);
}
async function expansionData(){
 if(!expandedLoading)expandedLoading=fetch('expanded-data.json?v=dedup-1').then(response=>{if(!response.ok)throw new Error('Expanded reference data unavailable');return response.json();}).then(result=>{if(result.sourceCorpusId!==data.summary.corpus_id||!result.complete)throw new Error('Expanded data does not match this corpus');expandedData=result;return result;}).catch(error=>{expandedLoading=null;throw error;});
 return expandedLoading;
}
function setting(threshold,order,cap,mode){
 if(!graph?.drillConfig)return window.atlasSetting(threshold,order,cap,mode);
 const config=graph.drillConfig;return {config,candidate:window.selectAtlasCandidate(config,mode)};
}
function drillControls(){return Object.fromEntries(['clusteringMethod','modelResolution','orderMode','orderSlider','maximumOrder','drillMode','drillReferenceMinimum','drillSupport'].map(id=>[id,$(id).value]));}
function enterCluster(cluster){
 if(graph.trial||isEntityMap()||graph.temporalSelection)return;
 if(externalPacket){window.ATLAS_PROJECTS.drill(cluster).catch(error=>{$('analysisNote').textContent=errorMessage(error);});return;}
 if(graph.drillPath?.length!==drillStack.length&&drillStack.length)return;
 const members=graph.nodes.filter(node=>String(node.cluster)===String(cluster)).map(node=>node.id);
 if(members.length<2)return;
 drillStack.push({members,label:(drillStack.length?'Subcluster ':'Cluster ')+cluster,controls:drillControls(),parentAnalysisId:graph.analysisId,parentResolution:graph.resolution});
 $('modelResolution').value='auto';$('drillMode').value='expanded';$('drillReferenceMinimum').value=5;$('drillSupport').value=5;syncAnalysisOptions();
}
function leaveCluster(depth){
 const restore=drillStack[depth];drillStack.splice(depth);
 if(restore)for(const [id,value] of Object.entries(restore.controls)){if(id==='modelResolution'&&![...$(id).options].some(option=>option.value===value))$(id).append(new Option(value,value));$(id).value=value;}
 syncAnalysisOptions();
}
function drillBreadcrumb(){
 let bar=$('drillBreadcrumb');if(!bar){bar=text('nav','','analysis-note');bar.id='drillBreadcrumb';bar.setAttribute('aria-label','Cluster drill-down');$('analysisNote').before(bar);}
 bar.replaceChildren();bar.hidden=!drillStack.length;$('threshold').disabled=!!drillStack.length;
 $('drillScopeControls').hidden=!drillStack.length;
 $('drillReferenceMinimum').disabled=$('drillMode').value!=='expanded';$('drillReferenceMinimum').max=(graph?.threshold||10)-1;$('drillReferenceValue').textContent=$('drillReferenceMinimum').value;
 if(!drillStack.length)return;
 const root=text('button','Full network','secondary');root.onclick=()=>leaveCluster(0);bar.append(root);
 drillStack.forEach((level,position)=>{bar.append(document.createTextNode(' → '));if(position===drillStack.length-1)bar.append(text('strong',level.label));else{const button=text('button',level.label,'secondary');button.onclick=()=>leaveCluster(position+1);bar.append(button);}});
 const back=text('button','Back one level','secondary');back.onclick=()=>leaveCluster(drillStack.length-1);bar.append(document.createTextNode(' '),back);
}
async function resolveDrill(base,request){
 const level=drillStack.at(-1),cap=+$('maximumOrder').value,expanded=$('drillMode').value==='expanded',referenceMinimum=+$('drillReferenceMinimum').value,minimumSupport=+$('drillSupport').value,key=JSON.stringify([base.threshold,base.order,cap,expanded,referenceMinimum,minimumSupport,level.members.slice().sort()]);
 const expandedSource=await expansionData();
 if(!drillCache.has(key)){
  const pair={...expandedSource.base,threshold:base.threshold};
  drillCache.set(key,new Promise((resolve,reject)=>{const worker=new Worker('drill-worker.js?v=coupling-errors-2');worker.onmessage=event=>{if(event.data.progress){if(request===graphRequest)$('analysisNote').textContent='Auto CPM: '+event.data.progress.tested+' settings tested · '+event.data.progress.phase+' · 50 source bootstraps per setting…';return;}worker.terminate();Object.hasOwn(event.data,'error')?reject(new Error(errorMessage(event.data.error))):resolve(event.data);};worker.onerror=event=>{worker.terminate();reject(new Error(errorMessage(event)));};worker.postMessage({base:pair,members:level.members,bundles:expandedSource.bundles,order:base.order,cap,articleIds:Object.keys(data.articles),expanded,referenceMinimum,minimumSupport,parentThreshold:base.threshold});}));
 }
 let result;try{result=await drillCache.get(key);}catch(error){drillCache.delete(key);throw error;}
 const next=structuredClone(result.graph),config=result.config,mode=$('modelResolution').value,candidate=window.selectAtlasCandidate(config,mode);
 next.drillConfig=config;next.resolution=candidate.resolution;next.derivedFromAnalysisId=level.parentAnalysisId;next.drillPath=drillStack.map(item=>({label:item.label,members:item.members,parentResolution:item.parentResolution,parentAnalysisId:item.parentAnalysisId,parentControls:item.controls}));
 for(const [position,node] of next.nodes.entries()){node.cluster=candidate.memberships[node.id]||0;node.x=Math.cos(position*2.399963229728653)*45*Math.sqrt(position+1);node.y=Math.sin(position*2.399963229728653)*45*Math.sqrt(position+1);}
 next.stats={nodes:next.nodes.length,edges:next.links.length,clusters:candidate.clusters,isolated_nodes:next.excludedByOrder};
 next.clustering={algorithm:'leiden',objective:'cpm',resolution:candidate.resolution,weight_scale:candidate.scale,restarts:10,selected_seed:candidate.seed,quality:candidate.quality,communities:candidate.clusters};
 next.autoCPM=window.atlasAudit(config,candidate,mode);
 next.metric=next.order==='all'?{type:'experimental_combined_score',maximumIncludedOrder:cap,definition:'Sum of 1 + log2(K - 1) over distinct co-citing source articles, where K is the largest qualifying bundle inside the selected reference set, capped at '+cap+'. Association strength divides by the product of original source-reference frequencies.'}:base.metric;return next;
}
const baseMethod=()=>isEntityMap()?entityAdapter().method(graph):isCoupling()?{...window.ATLAS_EVIDENCE.couplingMethod,weight:graph.networkModel==='hypergraph'&&graph.clustering?.algorithm!=='hypergraph'?graph.clustering.limitations:graph.clustering?.algorithm==='hypergraph'?graph.clustering.method+' '+graph.clustering.limitations:window.ATLAS_EVIDENCE.couplingMethod.weight}:data.methods[state.method];
const method=()=>window.ATLAS_EVIDENCE.currentStudyMethod(baseMethod(),externalPacket,graph,data.articles);
const isPanel=()=>state.method==='profiles'||!!method().panel;
const groupName=c=>+c===0?(graph._backend?.startsWith('independent-bnr')&&graph.clustering?.algorithm==='not_requested'?'Unassigned · analysis not requested':graph.trial?'Unassigned works':isCoupling()?'Unlinked sources':'Unlinked works'):(['cocitation','higherorder'].includes(state.method)?'Cluster '+c:state.method==='citation'?(+c===1?'Central':'Application'):method().group+' '+c);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let motionEnabled=!reducedMotion.matches,flowFrame=0,cameraFrame=0,flowDots=[],entry=false;
function palette(){return document.body.classList.contains('night-mode')?['#58d8bd','#ffba72','#a6b2ff','#f49dbc','#badd85','#c6a1ef','#8cd7f1','#efae8f']:colors;}
const text=(tag,content,cls)=>{let e=document.createElement(tag);e.textContent=content;if(cls)e.className=cls;return e};
const el=(tag,attrs={},parent)=>{let e=document.createElementNS(NS,tag);for(let [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(parent)parent.append(e);return e};
function clusterColor(cluster){return +cluster===0?'#87939b':+cluster<=8?palette()[(cluster-1)%colors.length]:`hsl(${(cluster*137.508)%360} 58% ${document.body.classList.contains('night-mode')?70:42}%)`;}
function color(n){if($('colorMode').value==='year'){if(!n.year)return '#87939b';let y=n.year,t=Math.max(0,Math.min(1,(y-1970)/55));return `hsl(${215-180*t} 48% ${40+10*t}%)`;}return clusterColor(n.cluster);}
function syncMotion(){
 const active=motionEnabled&&!reducedMotion.matches;
 document.body.classList.toggle('motion-paused',!active);
 $('motionToggle').textContent=reducedMotion.matches?'Reduced motion':active?'Pause motion':'Resume motion';$('motionToggle').removeAttribute('aria-pressed');$('motionToggle').disabled=reducedMotion.matches;$('motionToggle').title=reducedMotion.matches?'Motion disabled by your system preference':active?'Motion is running. Pause decorative animation.':'Motion is paused. Resume decorative animation.';
 cancelAnimationFrame(flowFrame);flowFrame=0;if(!active){cancelAnimationFrame(cameraFrame);cameraFrame=0;}if(active&&!document.hidden&&state.view==='network'&&!isPanel())flowFrame=requestAnimationFrame(animateFlows);
}
function animateFlows(time){
 if(!motionEnabled||reducedMotion.matches||document.hidden||state.view!=='network'){flowFrame=0;return;}
 for(let {dot,edge,phase} of flowDots){let a=screen(index.get(edge.source)),b=screen(index.get(edge.target)),t=(Math.sin(time*.0005+phase)+1)/2,point=window.atlasNetworkAppearance.curvePoint(a,b,edge.source+'|'+edge.target,t);dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);dot.setAttribute('opacity',.3+.6*Math.sin(Math.PI*t));}
 flowFrame=requestAnimationFrame(animateFlows);
}
function addFlows(){
 flowDots=[];let layer=el('g',{'data-animation':'connections','pointer-events':'none','aria-hidden':'true'},vp);
 let featured=links.filter(e=>state.selectedEdge?state.selectedEdge===e.source+'|'+e.target:state.selected?e.source===state.selected||e.target===state.selected:e.count>=3).sort((a,b)=>b.count-a.count).slice(0,8);
 for(let [i,edge] of featured.entries()){let dot=el('circle',{r:2.6,fill:'#e5fff8',stroke:'#76dac6','stroke-width':.7,opacity:0,class:'connection-spark'},layer);flowDots.push({dot,edge,phase:i*.83});}
 syncMotion();
}
function moveCamera(target){
 cancelAnimationFrame(cameraFrame);
 if(!motionEnabled||reducedMotion.matches){Object.assign(state,target);transform();return;}
 const from={zoom:state.zoom,tx:state.tx,ty:state.ty},start=performance.now();
 function frame(now){let t=Math.min(1,(now-start)/320),ease=1-Math.pow(1-t,3);for(let key of ['zoom','tx','ty'])state[key]=from[key]+(target[key]-from[key])*ease;transform();if(t<1)cameraFrame=requestAnimationFrame(frame);else cameraFrame=0;}
 cameraFrame=requestAnimationFrame(frame);
}
function foundationLabelsActive(){return isCoupling()&&$('couplingLabelMode').value==='foundations'&&!state.selected&&!$('query').value.trim();}
function articleLabel(n){if(['author','institution','country','term','topic'].includes(graph.entityKind))return n.label.length>38?n.label.slice(0,35)+'…':n.label;if($('canvasLabelMode').value==='articles'&&foundationLabelsActive()&&n.foundation)return window.ATLAS_EVIDENCE.foundationLabel(n);if(isCoupling())return (n.authors?.split(';')[0]?.split(',')[0]||n.label.slice(0,28))+' ('+(n.yearLabel||n.year||'?')+')';if(['cocitation','higherorder'].includes(state.method)){if(n.key==='heifetz2009')return 'Practice (2009)';if(n.key==='heifetz1994')return 'Without Easy Answers (1994)';if(n.key==='heifetz2002')return 'On the Line (2002)';return n.label.split(',')[0]+' ('+(n.yearLabel||n.year||'?')+')';}return n.label.length>38?n.label.slice(0,35)+'…':n.label;}
function semanticLabel(n){
 if($('canvasLabelMode').value==='articles'||n.id===state.selected||n.id===state.hover||$('query').value.trim())return null;
 const description=graph.themeDescriptions?.[n.cluster];if(!description)return null;
 const generated=description.generated||graph.generatedDescriptions?.[n.cluster]?.result;
 const heading=$('canvasLabelMode').value==='ai'&&['shared-theme','mixed-themes'].includes(generated?.status)?generated.heading:description.keywordHeading||description.keywords?.slice(0,2).map(term=>term.text).join(' · ')||description.heading;
 return {heading:titleCase(heading),summary:generated?.summary?.text||'Qwen description is not available yet. Select this label for keywords and article evidence.',generated};
}
function mapLabel(n){return semanticLabel(n)?.heading||articleLabel(n);}
function inspectCluster(cluster){filteredClusters=null;pinnedCluster=null;includeConnected=false;$('cluster').value=String(cluster);state.selected=null;state.selectedEdge=null;state.hover=null;render();fit();overview();window.atlasWorkspaceShell.show('inspect');}

function short(n){let raw=n.label.replace(/, DOI.*$/i,'');return raw;}
function point(e){let p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function screen(n){return {x:n.x*state.zoom+state.tx,y:n.y*state.zoom+state.ty};}
function radius(n){if(isCoupling())return window.ATLAS_EVIDENCE.couplingNodeRadius(n.citations,+$('nodeScale').value,state.zoom);return (4+Math.sqrt(n.citations)*(+$('nodeScale').value)/6)*Math.min(1.8,Math.max(.85,Math.sqrt(state.zoom)));}
function transform(){
 vp.removeAttribute('transform');
 for(const ring of vp.querySelectorAll('.node-reliability-ring')){const member=index.get(ring.parentElement.dataset.node);ring.setAttribute('r',radius(member)+(state.selected===member.id?6:3));}
 for(let edge of vp.querySelectorAll('[data-edge]')){let ids=edge.dataset.edge.split('|'),[start,end]=ids.map(id=>screen(index.get(id)));if(graph.directed){let deltaX=end.x-start.x,deltaY=end.y-start.y,length=Math.hypot(deltaX,deltaY)||1,cut=radius(index.get(ids[1]))+5;end={x:end.x-deltaX/length*cut,y:end.y-deltaY/length*cut};}const path=window.atlasNetworkAppearance.curvePath(start,end,edge.dataset.edge);for(const segment of edge.querySelectorAll('path'))segment.setAttribute('d',path);}
 for(let group of vp.querySelectorAll('g[data-node]')){let n=index.get(group.dataset.node),p=screen(n);group.setAttribute('transform',`translate(${p.x} ${p.y})`);group.querySelector('circle').setAttribute('r',radius(n)+(state.selected===n.id?3:0));if(isCoupling())group.querySelector('circle').setAttribute('stroke-width',state.selected===n.id?2:Math.max(.35,Math.min(1.2,state.zoom)));}
 window.ATLAS_HYPERGRAPH_VIEW?.draw({graph,nodes,viewport:vp,screen,radius,color,mode:representation.value==='3d'?'network':representation.value,focus:{node:state.selected,edge:state.selectedEdge,cluster:pinnedCluster||$('cluster').value},status:hypergraphStatus,bundles:graph.bundles||data.bundlesByScope[graph.threshold]||[],inspect:inspectHyperedge});
 syncThreeD();
 layoutLabels();
 highlightCluster(null);
 $('status').textContent=`${nodes.length} ${method().plural} · ${links.length.toLocaleString()} of ${graph.links.length.toLocaleString()} lines shown · ${Math.round(state.zoom*100)}% zoom`;
}
function layoutLabels(){
 $('tooltip').hidden=true;
 let layer=vp.querySelector('#mapLabels');if(!layer)layer=el('g',{id:'mapLabels','pointer-events':'none'},vp);layer.replaceChildren();
 if(!$('labels').checked||svg.classList.contains('touch-manipulating'))return;
 let fs=+$('labelSize').value,q=$('query').value.trim().toLowerCase(),placed=[];
 let base=svg.getBoundingClientRect(),reserved=[...svg.parentElement.querySelectorAll('.zoom-controls,.map-hint')].map(e=>{let r=e.getBoundingClientRect();return {x:r.left-base.left-4,y:r.top-base.top-4,w:r.width+8,h:r.height+8}});
 $('labelSizeValue').textContent=fs+' px';
 const clusterLeaders=new Set(),primaryLeaders=new Set(),clusterMaxima=new Map(),foundationLabels=new Set();
 const labelWeight=node=>$('canvasLabelMode').value==='articles'&&foundationLabelsActive()?(node.foundation?.count||0):node.citations;
 if(graph.stats.clusters>1||$('canvasLabelMode').value!=='articles'){
  for(const node of nodes)if(+node.cluster!==0)clusterMaxima.set(node.cluster,Math.max(clusterMaxima.get(node.cluster)||0,labelWeight(node)));
  const represented=new Set();
  for(const node of [...nodes].sort((left,right)=>left.id.localeCompare(right.id)))if(labelWeight(node)===clusterMaxima.get(node.cluster)){clusterLeaders.add(node.id);if(!represented.has(node.cluster)){primaryLeaders.add(node.id);represented.add(node.cluster);}}
 }
 const matchesQuery=node=>!!(q&&(node.label+' '+(node.authors||'')+' '+node.key+' '+(node.yearLabel||node.year||'')+' '+(node.variants||[]).join(' ')).toLowerCase().includes(q));
 const priority=node=>node.id===state.selected||node.id===state.hover?4:activeBundle?.members.includes(node.id)?3.5:matchesQuery(node)?3:primaryLeaders.has(node.id)?2:clusterLeaders.has(node.id)?1:0;
 let candidates=[...nodes].sort((left,right)=>priority(right)-priority(left)||right.citations-left.citations||left.id.localeCompare(right.id));
 candidates=candidates.filter((node,position)=>$('canvasLabelMode').value!=='articles'?(priority(node)>=3||primaryLeaders.has(node.id)):(priority(node)>0||position<24));if(isCoupling()&&nodes.length>300)candidates=candidates.filter((node,position)=>priority(node)>=3||position<12);
 let boxes=nodes.map(n=>{let p=screen(n),r=radius(n)+3;return {id:n.id,x:p.x-r,y:p.y-r,w:r*2,h:r*2};});
 const intersects=(a,b)=>a.x<b.x+b.w+4&&a.x+a.w+4>b.x&&a.y<b.y+b.h+3&&a.y+a.h+3>b.y;
 for(let n of candidates){
  if(state.hover&&n.id!==state.hover)continue;
  let p=screen(n);if(p.x<-30||p.y<-30||p.x>state.width+30||p.y>state.height+30)continue;
  let interactive=n.id===state.selected||n.id===state.hover||matchesQuery(n);if(q&&!interactive)continue;
  const semantic=semanticLabel(n),foundationKey=!semantic&&foundationLabelsActive()&&n.foundation?n.cluster+'|'+n.foundation.id:null;if(foundationKey&&foundationLabels.has(foundationKey)&&!interactive)continue;
  let important=interactive||activeBundle?.members.includes(n.id)||clusterLeaders.has(n.id);
  let content=mapLabel(n);measure.font=`${important?650:550} ${fs}px system-ui,sans-serif`;const fullContent=content;while(content.length>8&&measure.measureText(content).width>Math.min(300,state.width-40))content=content.slice(0,-2);if(content!==fullContent)content+='…';let w=Math.ceil(measure.measureText(content).width)+12,h=fs+12,r=radius(n)+7;
  let positions=[[p.x+r,p.y-h/2],[p.x-w-r,p.y-h/2],[p.x-w/2,p.y-r-h],[p.x-w/2,p.y+r]];
  for(let offset of [30,60,90])positions.push([p.x+r,p.y-h/2-offset],[p.x-w-r,p.y-h/2-offset],[p.x+r,p.y-h/2+offset],[p.x-w-r,p.y-h/2+offset]);
  let b=positions.map(([x,y])=>({x,y,w,h})).find(b=>b.x>=6&&b.y>=6&&b.x+w<state.width-6&&b.y+h<state.height-6&&!reserved.some(other=>intersects(b,other))&&!placed.some(other=>intersects(b,other))&&!boxes.some(other=>other.id!==n.id&&intersects(b,other)));
  if(!b&&important){let free=[];for(let x=8;x+w<state.width-8;x+=36)for(let y=8;y+h<state.height-8;y+=30){let candidate={x,y,w,h};if(!reserved.some(o=>intersects(candidate,o))&&!placed.some(o=>intersects(candidate,o))&&!boxes.some(o=>o.id!==n.id&&intersects(candidate,o)))free.push(candidate);}free.sort((a,b)=>Math.hypot(a.x+w/2-p.x,a.y+h/2-p.y)-Math.hypot(b.x+w/2-p.x,b.y+h/2-p.y));b=free[0];}
  if(!b)continue;placed.push(b);if(foundationKey)foundationLabels.add(foundationKey);
  let g=el('g',{'data-label':n.id,'data-label-box':JSON.stringify(b),'pointer-events':'all',role:'button',tabindex:0,'aria-label':n.label,style:'cursor:pointer'},layer),cx=Math.max(b.x,Math.min(p.x,b.x+w)),cy=Math.max(b.y,Math.min(p.y,b.y+h));
  g.setAttribute('aria-label',semantic?'Cluster '+n.cluster+': '+fullContent+'. Open cluster details.':n.label);
  const activate=()=>semantic?inspectCluster(n.cluster):selectNode(n.id);
  g.addEventListener('click',event=>{event.stopPropagation();$('tooltip').hidden=true;activate()});g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$('tooltip').hidden=true;activate()}});
  el('title',{},g).textContent=semantic?fullContent+' — '+semantic.summary+' Suggested theme, not validation.':(foundationLabelsActive()&&n.foundation?window.ATLAS_EVIDENCE.foundationLabel(n)+' · '+n.foundation.count+'/'+n.foundation.members+' cluster articles. Source: ':'')+n.label;
  if(semantic){const show=()=>{const box=g.getBoundingClientRect(),tip=$('tooltip');tip.replaceChildren(text('strong',fullContent),text('p',semantic.summary),text('small','Cluster '+n.cluster+' · '+(semantic.generated?'Qwen · ':'')+'Suggested theme, not validation. Tap to inspect.'));tip.hidden=false;tip.style.left=Math.max(8,Math.min(box.left,innerWidth-340))+'px';tip.style.top=Math.max(8,Math.min(box.bottom+8,innerHeight-tip.offsetHeight-12))+'px';};g.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')show();});g.addEventListener('focus',show);for(const event of['pointerleave','blur'])g.addEventListener(event,()=>{$('tooltip').hidden=true;});}
  el('line',{x1:p.x,y1:p.y,x2:cx,y2:cy,stroke:color(n),'stroke-opacity':.45,'stroke-width':1,'stroke-dasharray':'3 3'},g);
  el('rect',{x:b.x,y:b.y,width:w,height:h,rx:4,fill:'#fff','fill-opacity':.96,stroke:important?color(n):'#e3e9e5','stroke-width':important?1.5:.6},g);
  let label=el('text',{x:b.x+6,y:b.y+fs+2,fill:'#163440','font-family':'system-ui,sans-serif','font-size':fs,'font-weight':important?650:550},g);label.textContent=content;
 }
}
function resizeMap(){let r=svg.getBoundingClientRect();if(r.width<50||r.height<50)return;let oldW=state.width,oldH=state.height;state.width=r.width;state.height=r.height;svg.setAttribute('viewBox',`0 0 ${state.width} ${state.height}`);state.tx+=(state.width-oldW)/2;state.ty+=(state.height-oldH)/2;if(graph&&!isPanel())fit();}
function visible(){let c=$('cluster').value,min=+$('minEdge').value;const sizeFilter=window.ATLAS_EVIDENCE.clusterSizeFilter(graph.nodes,mapVisibility.minimumClusterSize);nodes=graph.nodes.filter(n=>!sizeFilter.hiddenClusters.has(Number(n.cluster))&&(!mapVisibility.hideUnlinked||window.ATLAS_EVIDENCE.hasObservedLinks(n,graph.links))&&!mapVisibility.hiddenClusters.has(n.cluster)&&(c==='cluster-set'?filteredClusters?.has(String(n.cluster)):c==='all'||String(n.cluster)===c));let ids=new Set(nodes.map(n=>n.id));links=graph.links.filter(e=>(!window.ATLAS_EXTENSIONS||window.ATLAS_EXTENSIONS.accepts(graph,e))&&ids.has(e.source)&&ids.has(e.target)&&((isEntityMap()&&graph.entityKind==='source'?e.strength:e.count)>=min||isFocusBridge(e)||isBundleEdge(e)));if($('edgeDisplay').value==='strongest'){let adjacency=new Map(nodes.map(n=>[n.id,[]]));for(let e of links){adjacency.get(e.source).push(e);adjacency.get(e.target).push(e)}let keep=new Set();for(let es of adjacency.values())for(let e of es.sort((a,b)=>b.strength-a.strength||b.count-a.count).slice(0,3))keep.add(e);links=links.filter(e=>keep.has(e)||isFocusBridge(e)||isBundleEdge(e));}}
function isFocusBridge(edge){return pinnedCluster!==null&&includeConnected&&((String(index.get(edge.source).cluster)===pinnedCluster)!==(String(index.get(edge.target).cluster)===pinnedCluster));}

let pinnedCluster=null,includeConnected=false,filteredClusters=null,activeBundle=null;
function isBundleEdge(edge){return !!activeBundle&&activeBundle.members.includes(edge.source)&&activeBundle.members.includes(edge.target);}
function highlightBundle(){
 if(!activeBundle)return;
 const members=new Set(activeBundle.members);
 for(const element of vp.querySelectorAll('[data-node],[data-label]'))element.style.opacity=String(members.has(element.dataset.node||element.dataset.label)?1:.08);
 for(const element of vp.querySelectorAll('[data-edge]')){const inside=element.dataset.edge.split('|').every(id=>members.has(id));element.style.opacity=inside?'1':'.025';}
 for(const element of vp.querySelectorAll('[data-node] .node-core'))if(members.has(element.parentElement.dataset.node)){element.style.stroke='#fff';element.style.strokeWidth='3.5';}
 $('clusterHighlightStatus').textContent='Exact co-cited group: '+members.size+' references jointly cited by '+activeBundle.articles.length+' source articles. Highlighted lines belong to this group; their intensity still summarizes all qualifying groups for each pair.';
}
function showBundle(bundle){
 activeBundle=bundle;pinnedCluster=null;includeConnected=false;filteredClusters=null;$('cluster').value='all';state.selected=null;state.hover=null;$('query').value='';render();
 const members=bundle.members.map(id=>index.get(id)),xs=members.map(node=>node.x),ys=members.map(node=>node.y),width=Math.max(...xs)-Math.min(...xs)+200,height=Math.max(...ys)-Math.min(...ys)+160;
 const zoom=Math.min((state.width-30)/width,(state.height-30)/height,2);
 state.zoom=zoom;state.tx=state.width/2-(Math.max(...xs)+Math.min(...xs))/2*zoom;state.ty=state.height/2-(Math.max(...ys)+Math.min(...ys))/2*zoom;transform();
}
function connectedClusters(cluster){
 const connected=new Set([String(cluster)]);
 for(const edge of graph.links){const source=String(index.get(edge.source).cluster),target=String(index.get(edge.target).cluster);if(source===String(cluster)&&+target!==0)connected.add(target);if(target===String(cluster)&&+source!==0)connected.add(source);}
 return connected;
}
function highlightCluster(cluster){
 const hovered=$('clusterHover').checked&&cluster!==null&&+cluster!==0&&cluster!=='all';
 const primary=hovered?String(cluster):pinnedCluster,active=primary!==null;
 const highlighted=active?(includeConnected&&!hovered?connectedClusters(primary):new Set([primary])):new Set();
 const gradient=active&&includeConnected&&!hovered,distances=new Map(),adjacency=new Map();
 if(gradient){
  for(const node of graph.nodes)if(highlighted.has(String(node.cluster)))adjacency.set(node.id,[]);
  for(const edge of graph.links)if(adjacency.has(edge.source)&&adjacency.has(edge.target)){adjacency.get(edge.source).push(edge.target);adjacency.get(edge.target).push(edge.source);}
  const queue=graph.nodes.filter(node=>String(node.cluster)===primary).map(node=>node.id);for(const id of queue)distances.set(id,0);
  for(let position=0;position<queue.length;position++)for(const neighbor of adjacency.get(queue[position])||[])if(!distances.has(neighbor)){distances.set(neighbor,distances.get(queue[position])+1);queue.push(neighbor);}
 }
 const opacity=node=>!gradient?(highlighted.has(String(node.cluster))?1:.12):distances.get(node.id)<=1?1:distances.get(node.id)===2?.4:distances.get(node.id)===3?.2:.1;
 for(const element of vp.querySelectorAll('[data-node],[data-label]')){
  const node=index.get(element.dataset.node||element.dataset.label);if(active)element.style.opacity=String(node.id===state.hover?1:opacity(node));else element.style.removeProperty('opacity');
  const circle=element.querySelector('.node-core');if(circle){if(gradient&&distances.get(node.id)===1){circle.style.stroke='#fff';circle.style.strokeWidth='3.5';}else{circle.style.removeProperty('stroke');circle.style.removeProperty('stroke-width');}}
 }
 for(const element of vp.querySelectorAll('[data-edge]')){
  const members=element.dataset.edge.split('|').map(id=>index.get(id)),bridge=gradient&&((String(members[0].cluster)===primary)!==(String(members[1].cluster)===primary));
  if(active)element.style.opacity=String(gradient?bridge?1:Math.min(...members.map(opacity)):members.every(node=>highlighted.has(String(node.cluster)))?1:members.some(node=>highlighted.has(String(node.cluster)))?.35:.04);else element.style.removeProperty('opacity');
 }
 if($('clusterHighlightStatus'))$('clusterHighlightStatus').textContent=active?groupName(primary)+(includeConnected&&!hovered?' + '+(highlighted.size-1)+' directly connected clusters':'')+(filteredClusters&&$('cluster').value==='cluster-set'?' filtered. Use All clusters to restore the full view.':' highlighted. Other clusters are dimmed.'):'';
 if(gradient&&$('clusterHighlightStatus'))$('clusterHighlightStatus').textContent+=' Direct connectors are outlined; more distant nodes fade. Focus-to-neighbor links stay visible regardless of line display filters.';
 highlightBundle();
}
function openClusterActions(cluster,event){
 let dialog=$('clusterActionsDialog');if(!dialog){dialog=text('div','','cluster-actions-dialog');dialog.id='clusterActionsDialog';dialog.setAttribute('popover','auto');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Cluster actions');document.body.append(dialog);}
 dialog.replaceChildren();
 const label=text('label','Choose a cluster'),select=document.createElement('select');label.append(select);dialog.append(label);
 for(const value of [...new Set(graph.nodes.map(node=>String(node.cluster)))].filter(value=>+value!==0).sort((left,right)=>Number(left)-Number(right)))select.append(new Option(groupName(value),value));
 if([...select.options].some(option=>option.value===String(cluster)))select.value=String(cluster);
 const note=text('p','','muted');dialog.append(note);
 const updateNote=()=>{note.textContent=(connectedClusters(select.value).size-1)+' directly connected clusters (all retained connections).';};select.onchange=updateNote;updateNote();
 function action(parent,title,handler,accessibleLabel){const button=text('button',title,'secondary');button.type='button';if(accessibleLabel)button.setAttribute('aria-label',accessibleLabel);button.onclick=()=>{handler();dialog.hidePopover();};parent.append(button);}
 function apply(connected,filterOnly){activeBundle=null;pinnedCluster=select.value;includeConnected=connected;filteredClusters=filterOnly?(connected?connectedClusters(select.value):new Set([select.value])):null;if(filteredClusters){if(!$('cluster').querySelector('option[value="cluster-set"]'))$('cluster').append(new Option('Custom cluster filter','cluster-set'));$('cluster').value='cluster-set';}else $('cluster').value='all';state.selected=null;state.selectedEdge=null;state.hover=null;$('query').value='';render();fit();overview();}
 for(const connected of [false,true]){const row=text('div','','cluster-action-row');action(row,connected?'Highlight + connected':'Highlight this cluster',()=>apply(connected,false));action(row,'Filter only',()=>apply(connected,true),connected?'Filter to this cluster and connected clusters':'Filter to this cluster only');dialog.append(row);}
 if(!isCoupling()&&!isEntityMap()&&!graph.temporalSelection&&!graph.trial)action(dialog,'Explore subclusters',()=>enterCluster(select.value));
 if(!isCoupling()&&!isEntityMap()&&!graph.trial){const drillButton=dialog.lastElementChild;const previousChange=select.onchange;select.onchange=()=>{previousChange();drillButton.disabled=graph.nodes.filter(node=>String(node.cluster)===select.value).length<2;};select.onchange();}
 if(!isEntityMap()&&!graph.temporalSelection)action(dialog,'Explode cluster combinations',()=>openClusterCombinations(select.value));
 action(dialog,'Clear / show all clusters',()=>{pinnedCluster=null;includeConnected=false;filteredClusters=null;$('cluster').value='all';state.selected=null;state.selectedEdge=null;state.hover=null;render();fit();overview();});
 const anchor=document.querySelector('.cluster-actions-button').getBoundingClientRect();
 dialog.style.left=Math.max(8,Math.min(event?.clientX||anchor.left,window.innerWidth-350))+'px';
 dialog.style.top=Math.max(8,Math.min(event?.clientY||anchor.bottom+6,window.innerHeight-260))+'px';
 dialog.showPopover();
}
let clusterListGraph=null;
function renderClusterList(){
 let panel=$('clusterOverview');
 const sizeFilter=window.ATLAS_EVIDENCE.clusterSizeFilter(graph.nodes,mapVisibility.minimumClusterSize);
 for(const option of $('cluster').options)if(Number(option.value)>0){option.disabled=sizeFilter.hiddenClusters.has(Number(option.value));option.title=option.disabled?'Below minimum cluster size ('+sizeFilter.minimum+' works).':'';}
 if(panel&&clusterListGraph===graph){for(const button of panel.querySelectorAll('.cluster-button'))button.setAttribute('aria-pressed',String($('cluster').value===button.dataset.cluster));return;}
 clusterListGraph=graph;const previousScroll=panel?.querySelector('.cluster-buttons')?.scrollLeft||0;
 const automaticThemes=!graph.temporalSelection&&graph.themeDescriptions&&(sourceThemeMap()||state.method==='cocitation');
 if(automaticThemes&&(!isEntityMap()||graph.entityKind==='source')&&(!window.ATLAS_TRIAL_WORKSPACE||graph.trial)){const target=graph;window.ATLAS_DESCRIPTIONS?.prepare(target,(cluster,result)=>{if(graph!==target)return;const description=target.themeDescriptions?.[cluster];if(!description)return;description.generated=result;if(['shared-theme','mixed-themes'].includes(result.status)){description.keywordHeading=description.keywordHeading||description.heading;description.heading=result.heading;}const option=[...$('cluster').options].find(option=>option.value===cluster);if(option)option.text=groupName(cluster)+' · '+titleCase(description.heading);clusterListGraph=null;renderClusterList();layoutLabels();if(!state.selected&&!state.selectedEdge&&String(pinnedCluster||$('cluster').value)===cluster)overview();});}
 if(!panel){panel=document.createElement('section');panel.id='clusterOverview';panel.className='cluster-overview';panel.setAttribute('aria-label','Leiden clusters');document.querySelector('.analysis-switches').after(panel);}
 panel.replaceChildren();
 panel.dataset.resultState=communityPending?'previous':'current';
 const heading=window.ATLAS_CLUSTERING_CONCEPTS.heading(graph,communityPending);panel.setAttribute('aria-label',heading);panel.append(text('h3',heading),text('p','Select a cluster to inspect its members. Counts use the full selected analysis scope.','cluster-help'));
 const themeStatus=text('p',graph.derivedMethod?'Derived method result. No thematic interpretation or new theme generation was requested.':constructionOnly()?'Construction only. Communities and thematic labels were not requested.':graph.themeDescriptions?'Suggested themes · select a cluster for keywords and evidence. Not validated themes.':graph.themeError||themeError||'Loading cached thematic descriptions…','cluster-help theme-status');if(automaticThemes&&(!isEntityMap()||graph.entityKind==='source')){themeStatus.id='clusterNameProgress';themeStatus.setAttribute('role','status');}panel.append(themeStatus);if(automaticThemes&&(!isEntityMap()||graph.entityKind==='source'))window.ATLAS_DESCRIPTIONS?.drawProgress();
 const actions=text('button','Cluster actions ⋯','cluster-actions-button');actions.type='button';actions.onclick=()=>openClusterActions(pinnedCluster||$('cluster').value);panel.append(actions);if(isCoupling()){const foundations=text('button','Shared foundations ↓','secondary');foundations.onclick=()=>window.ATLAS_EVIDENCE.revealSection($('couplingFoundations'),true);panel.append(foundations);}
 const status=text('p','','cluster-help');status.id='clusterHighlightStatus';status.setAttribute('aria-live','polite');panel.append(status);
 const counts=sizeFilter.counts;
 const list=text('div','','cluster-buttons');
 function addButton(value,label,count,color){
  const button=text('button','','cluster-button');button.type='button';button.dataset.cluster=value;button.setAttribute('aria-pressed',String($('cluster').value===value));
  if(color){const swatch=text('span','','cluster-swatch');swatch.style.background=color;swatch.setAttribute('aria-hidden','true');button.append(swatch);}
  button.append(text('span',label),text('strong',count+' '+(isEntityMap()?(count===1?method().node.toLowerCase():method().plural):isCoupling()?(count===1?'source':'sources'):(count===1?'work':'works'))));
  const description=graph.themeDescriptions?.[value];
  if(description){const heading=text('small','','cluster-theme-heading');heading.append(text('span',titleCase(description.heading),'cluster-theme-text'));if(window.ATLAS_INDICATORS?.hasGeneratedLabel(description)){const badge=text('span','AI','cluster-ai-badge');badge.title='AI-suggested name grounded in sampled article text. Not a validated theme.';badge.setAttribute('aria-label',badge.title);heading.append(badge);}button.append(heading);}
  if(+value>0&&window.ATLAS_INDICATORS){const rating=window.ATLAS_INDICATORS.clusterReliability(graph,value),badge=text('small','','cluster-reliability-badge');badge.dataset.rating=rating.status;badge.title=rating.title;badge.setAttribute('aria-label',rating.title);badge.append(text('span','','reliability-ring-key'),text('span',rating.label+(rating.preliminary?' · preliminary':'')));button.append(badge);}
  button.addEventListener('pointerenter',()=>highlightCluster(value));button.addEventListener('pointerleave',()=>highlightCluster(null));
  button.addEventListener('focus',()=>highlightCluster(value));button.addEventListener('blur',()=>highlightCluster(null));
  if(value!=='all'&&+value!==0){button.title='Right-click for cluster highlighting options';button.addEventListener('contextmenu',event=>{event.preventDefault();openClusterActions(value,event);});}
  if(value!=='all'&&+value!==0)window.attachAtlasLongPress(button,event=>openClusterActions(value,event));
  button.onclick=()=>{activeBundle=null;filteredClusters=null;pinnedCluster=null;includeConnected=false;$('cluster').value=value;state.selected=null;state.selectedEdge=null;state.hover=null;$('query').value='';render();fit();overview();};list.append(button);
 }
 addButton('all','All clusters',graph.nodes.length);
 for(const [cluster,count] of [...counts].sort((left,right)=>right[1]-left[1]))if(!sizeFilter.hiddenClusters.has(cluster)&&(!mapVisibility.hideUnlinked||cluster>0||graph.nodes.some(n=>n.cluster===cluster&&n.degree>0)))addButton(String(cluster),groupName(cluster),mapVisibility.hideUnlinked&&constructionOnly()?graph.nodes.filter(n=>n.cluster===cluster&&n.degree>0).length:count,clusterColor(cluster));
 panel.append(list);list.scrollLeft=previousScroll;
}

function syncAnalysisOptions(thresholdOverride){
 if(externalPacket)return window.ATLAS_PROJECTS.rebuild();
 const threshold=typeof thresholdOverride==='number'?thresholdOverride:graph?.threshold||10;
 const scopes=method().scopes.map(name=>({name,...data.graphs[name]})).filter(item=>item.resolution===.02);
 const maximum=drillStack.length&&expandedData?Math.max(2,...expandedData.bundles.filter(bundle=>bundle.articles.length>=+$('drillSupport').value).map(bundle=>bundle.members.length)):Math.max(...scopes.filter(item=>item.threshold===threshold&&typeof item.order==='number').map(item=>item.order));
 $('orderSlider').max=maximum;$('maximumOrder').max=maximum;
 $('orderSlider').value=Math.min(+$('orderSlider').value,maximum);$('maximumOrder').value=Math.min(+$('maximumOrder').value,maximum);
 const combined=$('orderMode').value==='combined',order=combined?'all':+$('orderSlider').value;
 $('orderSlider').disabled=combined;$('maximumOrder').disabled=!combined;
 $('orderSliderValue').textContent=$('orderSlider').value==='2'?'2 · pairwise':$('orderSlider').value+'-way';
 $('maximumOrderValue').textContent='2–'+$('maximumOrder').value;
 $('coCitationOrder').replaceChildren(...['all',...Array.from({length:maximum-1},(_,position)=>position+2)].map(value=>new Option(String(value),String(value))));$('coCitationOrder').value=String(order);
 const available=scopes.filter(item=>String(item.order)===String(drillStack.length?2:order));
 const eligible=available.filter(item=>item.threshold===threshold);
 if(!eligible.length)throw new Error('No graph for the selected scope and order');
 $('threshold').replaceChildren(...[10,20,30].map(scope=>{const candidate=available.find(item=>item.threshold===scope)||scopes.find(item=>item.threshold===scope&&item.order===2);return new Option('References cited by ≥'+scope+' articles',candidate.name);}));
 $('threshold').value=eligible[0].name;
 loadGraph();
}
function orderDescription(){return graph.order==='all'?'Combined orders 2–'+graph.maximumOrder+' · experimental score':graph.order+'-way co-citation';}
function annotateOrderOptions(){
 const alternative=['infomap','hypergraph','sbm'].includes(graph.clustering?.algorithm)||graph.networkModel==='hypergraph';
 $('cpmSlider').disabled=alternative;$('cpmAuto').disabled=alternative;$('cpmSlider').parentElement.hidden=alternative;
 $('autoCPMReport').parentElement.hidden=alternative;
 if($('cpmRecommendation'))$('cpmRecommendation').hidden=alternative;
 $('communityReport').hidden=!alternative;
 if(alternative){
  $('cpmValue').textContent=graph.clustering?.algorithm==='leiden'?'Projection CPM '+graph.resolution:'Not used by '+communityLabel();$('cpmHint').textContent=graph.networkModel==='hypergraph'?'Hypergraph projection has its own CPM scale. Use Find settings to scan it; the pairwise Auto audit is not reused.':'CPM / Auto applies only to Leiden. Its previous setting is preserved for comparison.';
  const comparison=graph.comparison;
  $('orderStructure').textContent=graph.stats.clusters+' '+communityLabel()+' clusters · scope ≥'+graph.threshold+'. Unlinked works excluded.';
  $('communityAudit').textContent=communityExplanation()+' Compared with Leiden CPM '+comparison.baselineResolution+' ('+comparison.baselineClusters+' clusters): membership agreement (adjusted Rand index) '+(comparison.adjustedRandIndex==null?'not defined':comparison.adjustedRandIndex.toFixed(3))+' on '+comparison.sharedNodes+' shared linked references; '+comparison.methodLinkedNodes+' linked here versus '+comparison.baselineLinkedNodes+' in Leiden. '+comparison.note+(graph.hyperedges?' '+graph.hyperedges.length.toLocaleString()+' exact supported combinations.':'')+(graph.clustering.quality==null?'':' '+graph.clustering.qualityLabel+': '+graph.clustering.quality.toFixed(4)+'.');
  return;
 }
 let mode=$('modelResolution').value;const cap=+$('maximumOrder').value,multicluster=[],format=value=>Number(value.toPrecision(4)).toString();
 const resolutions=setting(graph.threshold,graph.order,cap,mode).config.candidates.map(candidate=>candidate.resolution);
 mode=mode==='auto'?'auto':String(graph.resolution);$('modelResolution').replaceChildren(new Option('Auto','auto'),...resolutions.map(resolution=>new Option(String(resolution),String(resolution))));$('modelResolution').value=mode;
 $('cpmHint').textContent=resolutions.length+' tested settings · drag for manual CPM.';
 $('cpmSlider').max=resolutions.length-1;$('cpmSlider').value=resolutions.indexOf(graph.resolution);
 $('cpmSlider').setAttribute('aria-valuetext',graph.resolution+(mode==='auto'?(graph.autoCPM.recommendation?.status==='supported_range'?' (Auto overview)':' (Auto, exploratory)'):' (manual)'));
 $('cpmValue').textContent=format(graph.resolution)+(mode==='auto'?(graph.autoCPM.recommendation?.status==='supported_range'?' · Auto overview':' · Auto · exploratory'):' · Manual');$('cpmAuto').setAttribute('aria-pressed',String(mode==='auto'));
 if(!graph.drillConfig)for(const option of $('coCitationOrder').options){const order=option.value==='all'?'all':+option.value;const {candidate}=setting(graph.threshold,order,cap,mode);if(candidate.clusters>1&&(mode==='auto'||candidate.resolution===Number(mode)))multicluster.push(order==='all'?'Combined':String(order));}
 const notice=$('orderStructure');notice.replaceChildren();notice.classList.toggle('single-cluster',graph.stats.clusters===1);
 notice.append(text('strong',graph.stats.clusters===1?'Single cluster. ':graph.stats.clusters+' clusters. '));
 notice.append(document.createTextNode(graph.drillConfig?(graph.expansion?.enabled?'Expanded neighborhood.':'Within parent cluster.'):'Multicluster orders: '+(multicluster.join(', ')||'none')+'.'));
 const report=$('autoCPMReport');report.replaceChildren();
 let recommendation=$('cpmRecommendation');if(!recommendation){recommendation=text('p','','cpm-recommendation');recommendation.id='cpmRecommendation';recommendation.setAttribute('aria-live','polite');$('orderStructure').after(recommendation);}
 const audit=graph.autoCPM,range=audit.recommendation?.range;
 recommendation.classList.toggle('cpm-uncertain',!range);
 recommendation.textContent=range?'Supported CPM range: '+range.map(format).join('–')+'.':'Exploratory setting: no stable CPM range confirmed.';
 if(audit.boundarySelected)recommendation.textContent+=' At search boundary.';
 if(audit.requestedResolution&&audit.requestedResolution!==graph.resolution)recommendation.textContent+=' Snapped to nearest tested CPM.';
 para(report,audit.recommendation?.reason||'Auto uses '+format(audit.selectedResolution)+'.');
 para(report,'Changing scope or order keeps the nearest tested manual CPM. Cluster counts exclude unlinked works.');
 if(audit.boundarySelected)para(report,'The selected value is at the search boundary; a wider search may be needed.');
 para(report,'Scaled weighted density: '+format(audit.density||0)+' across '+audit.linkedNodes+' linked references (unlinked works excluded). Tested range '+(audit.searchRange||[]).map(format).join('–')+'. '+audit.bootstrapSamples+' source bootstraps; '+audit.bootstrapRestarts+' starts per bootstrap.');
 para(report,(mode==='auto'?'Auto selected ':'Manual CPM ')+graph.resolution+'. Bootstrap membership agreement: '+graph.autoCPM.bootstrapARI.toFixed(3)+'; mean reference retention: '+Math.round(graph.autoCPM.bootstrapCoverage*100)+'%; singleton references: '+Math.round(graph.autoCPM.singletonFraction*100)+'%.');
 if(audit.bootstrapARIInterval)para(report,'Bootstrap ARI 10th–90th percentile: '+audit.bootstrapARIInterval.map(value=>value.toFixed(3)).join('–')+'. Coverage 10th–90th percentile: '+audit.bootstrapCoverageInterval.map(value=>Math.round(value*100)+'%').join('–')+'. These are empirical spreads, not confidence intervals.');
 para(report,audit.method);para(report,audit.limitations);
 para(report,'Auto favors broader near-best groupings, not a target number of clusters. Adjacent ARI is diagnostic only and does not affect selection. Historical refinement-only slider points are excluded from Auto selection and range tests. A recommended range must span at least a twofold change in CPM; these safeguards are design choices, not thematic validation.');
 if(audit.recommendation?.status==='no_clear_recommendation'&&audit.recommendation.admissibleSettings===0)para(report,'No setting passed all safeguards. The fallback uses the fewest clusters within 0.05 of the best overall penalized score, rather than simply choosing the lowest CPM. This trade-off remains exploratory.');
 const fragments=audit.fragmentation;
 if(fragments)para(report,fragments.components+' disconnected linked components. '+fragments.singletons+' singleton clusters, '+fragments.pairs+' pairs, '+fragments.triples+' triples. '+fragments.introducedTinyNodes+' references lie in tiny groups introduced by subdivision ('+Math.round(fragments.introducedTinyNodeFraction*100)+'% of linked references); '+Math.round(fragments.introducedTinyClusterFraction*100)+'% of groups produced by subdivision are tiny. Intact disconnected components are exempt.');
 if(graph.expansion)para(report,'Anchor and neighbor membership is held fixed during bootstrap resampling; stability scores do not test the neighbor-selection step.');
 const {config}=setting(graph.threshold,graph.order,cap,mode),table=document.createElement('table'),header=document.createElement('tr');
 for(const label of ['CPM','Clusters','Bootstrap ARI','ARI 10–90%','Coverage','Introduced tiny refs','Introduced tiny groups','Overview score'])header.append(text('th',label));table.append(header);
 for(const candidate of config.candidates){const row=document.createElement('tr');if(candidate.selectionEligible!==false&&range&&candidate.resolution>=range[0]&&candidate.resolution<=range[1])row.className='recommended-cpm';for(const value of [format(candidate.resolution)+(candidate.resolution===config.autoResolution?' · Auto':'')+(candidate.selectionEligible===false?' · manual only':''),candidate.clusters,candidate.bootstrapARI.toFixed(3),(candidate.bootstrapARIInterval||[]).map(value=>value.toFixed(2)).join('–'),Math.round(candidate.bootstrapCoverage*100)+'%',Math.round((candidate.fragmentation?.introducedTinyNodeFraction||0)*100)+'%',Math.round((candidate.fragmentation?.introducedTinyClusterFraction||0)*100)+'%',candidate.score.toFixed(3)])row.append(text('td',String(value)));table.append(row);}report.append(table);
}
function edgeDescription(edge){if(isEntityMap())return graph.entityKind==='source'?'Text cosine '+edge.strength.toFixed(4):edge.rawSupport+' distinct sources · weight '+edge.strength.toFixed(4);if(isCoupling())return edge.count+' shared references · cosine '+edge.strength.toFixed(3);return edge.count+' supporting articles'+(graph.order==='all'?' · combined score '+edge.combinedScore.toFixed(2):'');}
function chooseMethod(){
 window.scrollTo({top:0,behavior:'instant'});state.method=$('analysisMethod').value;
 const selectedMethod=method();
 $('methodTitle').textContent=selectedMethod.title;$('methodQuestion').textContent=selectedMethod.question;
 $('query').value='';state.selected=null;state.selectedEdge=null;
 document.body.classList.remove('has-selection','map-expanded');$('expandMap').textContent='Expand map';$('expandMap').setAttribute('aria-pressed','false');
 $('profilesView').hidden=true;$('exportSvg').disabled=false;cancelAnimationFrame(flowFrame);flowDots=[];
 $('edgeDisplay').value='strongest';
 $('searchHeading').textContent='Find a cited work';$('query').placeholder='Name, title, year or record ID…';
 $('workList').setAttribute('aria-label','Matching cited works');$('groupLabel').textContent=selectedMethod.group;
 $('edgeLabel').textContent='Display minimum supporting articles';$('edgeHelp').textContent=selectedMethod.weight;
 $('nodeColumn').textContent=selectedMethod.node;$('sizeColumn').textContent=selectedMethod.size;$('groupColumn').textContent=selectedMethod.group;
 $('colorMode').replaceChildren(new Option(selectedMethod.group,'cluster'),new Option('Publication year','year'));
 $('mapCaption').textContent='Node size: citing source articles. Line intensity: '+selectedMethod.edge.toLowerCase()+' (compressed scale). Colors: Leiden communities. Gray: unlinked works.';
 syncAnalysisOptions();view('network');requestAnimationFrame(resizeMap);
}
function separateClusters(){
 if(graph.stats.clusters<1||(!isCoupling()&&!graph.trial&&graph.stats.clusters<2))return;
 const groups=new Map();
 for(const node of graph.nodes){const key=+node.cluster===0?'unlinked':String(node.cluster);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);}
 const packed=[];
 const communities=[...groups.entries()].filter(([key])=>key!=='unlinked').sort((left,right)=>right[1].length-left[1].length||Number(left[0])-Number(right[0]));
 for(const [key,members] of communities){
  if(isCoupling())members.sort((left,right)=>right.citations-left.citations||left.id.localeCompare(right.id)).forEach((node,position)=>{const angle=position*2.399963229728653,distance=14*Math.sqrt(position);node.x=Math.cos(angle)*distance;node.y=Math.sin(angle)*distance;});
  const center={x:members.reduce((sum,node)=>sum+node.x,0)/members.length,y:members.reduce((sum,node)=>sum+node.y,0)/members.length};
  const extent=Math.max(1,...members.map(node=>Math.hypot(node.x-center.x,node.y-center.y)));
  const radius=24+14*Math.sqrt(members.length),gap=55;
  let position={x:0,y:0};
  for(let step=0;step<100000;step++){
   const angle=step*2.399963229728653,distance=9*Math.sqrt(step);
   position={x:Math.cos(angle)*distance,y:Math.sin(angle)*distance};
   if(packed.every(other=>Math.hypot(position.x-other.x,position.y-other.y)>=radius+other.radius+gap))break;
  }
  packed.push({...position,radius,key,members,originalX:position.x,originalY:position.y});
  for(const node of members){node.x=position.x+(node.x-center.x)/extent*radius;node.y=position.y+(node.y-center.y)/extent*radius;}
 }
 const clusterIndex=new Map(packed.map((group,position)=>[group.key,position])),connections=new Map();
 for(const edge of graph.links){const source=clusterIndex.get(String(index.get(edge.source).cluster)),target=clusterIndex.get(String(index.get(edge.target).cluster));if(source===undefined||target===undefined||source===target)continue;const key=[Math.min(source,target),Math.max(source,target)].join('|');connections.set(key,(connections.get(key)||0)+edge.strength);}
 const maximum=Math.max(1e-12,...connections.values());
 for(let iteration=0;iteration<300;iteration++){
  const forces=packed.map(group=>({x:-group.x*.001,y:-group.y*.001}));
  for(const [key,weight] of connections){const [source,target]=key.split('|').map(Number),left=packed[source],right=packed[target],dx=right.x-left.x,dy=right.y-left.y,distance=Math.hypot(dx,dy)||1,desired=left.radius+right.radius+28,force=Math.max(0,distance-desired)*.045*Math.sqrt(weight/maximum);forces[source].x+=dx/distance*force;forces[source].y+=dy/distance*force;forces[target].x-=dx/distance*force;forces[target].y-=dy/distance*force;}
  packed.forEach((group,position)=>{group.x+=Math.max(-8,Math.min(8,forces[position].x));group.y+=Math.max(-8,Math.min(8,forces[position].y));});
  for(let source=0;source<packed.length;source++)for(let target=source+1;target<packed.length;target++){const left=packed[source],right=packed[target],dx=right.x-left.x,dy=right.y-left.y,distance=Math.hypot(dx,dy)||1,overlap=left.radius+right.radius+28-distance;if(overlap>0){const shift=overlap/2;left.x-=dx/distance*shift;left.y-=dy/distance*shift;right.x+=dx/distance*shift;right.y+=dy/distance*shift;}}
 }
 for(const group of packed)for(const node of group.members){node.x+=group.x-group.originalX;node.y+=group.y-group.originalY;}
 const unlinked=groups.get('unlinked')||[],columns=Math.max(1,Math.ceil(Math.sqrt(unlinked.length)*2));
 const bottom=Math.max(...packed.map(group=>group.y+group.radius))+100;
 unlinked.sort((left,right)=>right.citations-left.citations||left.id.localeCompare(right.id)).forEach((node,position)=>{node.x=(position%columns-(columns-1)/2)*24;node.y=bottom+Math.floor(position/columns)*24;});
}
async function loadGraph(){
 if(externalPacket)return window.ATLAS_PROJECTS.rebuild();
 window.ATLAS_EXTENSIONS?.cancel();
 window.ATLAS_EVIDENCE?.cancelCanvasReliability();
 const request=++graphRequest;communityJob?.cancel();communityJob=null;communityPending=true;drillBreadcrumb();
 const previousClusters=$('clusterOverview');if(previousClusters){const heading=window.ATLAS_CLUSTERING_CONCEPTS.heading(graph,true);previousClusters.dataset.resultState='previous';previousClusters.setAttribute('aria-label',heading);previousClusters.querySelector('h3').textContent=heading;}
 for(const panel of [$('clusterOverview'),$('details'),$('workList'),$('tableBody'),$('exportData'),$('exportSvg'),document.querySelector('.network-stage')])if(panel)panel.inert=true;
 activeBundle=null;pinnedCluster=null;includeConnected=false;filteredClusters=null;$('clusterActionsDialog')?.hidePopover();
 state.name=$('threshold').value;let next=drillStack.length?{...data.graphs[state.name],order:$('orderMode').value==='combined'?'all':+$('orderSlider').value}:window.resolveAtlasGraph(state.name,$('modelResolution').value,+$('maximumOrder').value);
 if(drillStack.length){$('analysisNote').textContent='Analyzing subclusters: a density-adaptive CPM sweep and 50 source resamples…';try{next=await resolveDrill(next,request);}catch(error){if(request!==graphRequest)return;$('analysisNote').textContent='Subcluster analysis failed. Return using the breadcrumb or retry a setting. '+errorMessage(error);return;}}
 if(request!==graphRequest)return;
 const algorithm=$('clusteringMethod').value,networkModel=$('networkModel').value;
 next.networkModel=networkModel;
 if(algorithm!=='leiden'||networkModel==='hypergraph'){
  $('analysisNote').textContent='Loading '+algorithm+' analysis… The previous map is inactive until the new result is ready.';
  try{
   await window.ATLAS_EVIDENCE.loadCommunities();if(request!==graphRequest)return;
   communityJob=window.ATLAS_COMMUNITIES.start(next,algorithm,next.bundles||data.bundlesByScope[next.threshold]||[],message=>{if(request===graphRequest)$('analysisNote').textContent=message;},{networkModel,hypergraphSearch:algorithm==='hypergraph'?$('clusteringSearch')?.value||'mixed':undefined});
   next=await communityJob.promise;
  }catch(error){if(request!==graphRequest)return;$('analysisNote').textContent='Community analysis failed; the previous map remains inactive. Choose another method or scope to retry. '+errorMessage(error);return;}
 }
 if(request!==graphRequest)return;communityJob=null;communityPending=false;graph=next;window.ATLAS_TEMPORAL?.sync(graph);window.ATLAS_DESCRIPTIONS?.sync(graph);index=new Map(graph.nodes.map(node=>[node.id,node]));$('minEdge').min=graph.minimumSupport||5;$('minEdge').max=Math.max(graph.minimumSupport||5,...graph.links.map(edge=>edge.count));$('minEdge').value=graph.minimumSupport||5;
 mapVisibility.hideUnlinked=true;mapVisibility.hiddenClusters.clear();
 mountMapVisibility();
 if(graph.expansion){const maximum=Math.max(2,...expandedData.bundles.filter(bundle=>bundle.articles.length>=graph.minimumSupport).map(bundle=>bundle.members.length));$('orderSlider').max=maximum;$('maximumOrder').max=maximum;$('drillScopeStatus').textContent=graph.expansion.anchorCount+' original members + '+graph.expansion.addedCount+' added neighbors. '+(graph.expansion.enabled?'Additions are cited ≥'+graph.expansion.referenceMinimum+' and <'+graph.threshold+' times, and share a pairwise connection supported by ≥'+graph.minimumSupport+' source articles with an original member. No neighbor-of-neighbor expansion. Dashed outlines = added references.':'Strict mode: no new references.')+' Counts use the original 2,855-source corpus.';}
 for(const panel of [$('clusterOverview'),$('details'),$('workList'),$('tableBody'),$('exportData'),$('exportSvg'),document.querySelector('.network-stage')])if(panel)panel.inert=false;
 separateClusters();
 if(!window.BIBLIOMAP_MULTIUSER||graph.nodes.length)annotateOrderOptions();else $('analysisNote').textContent='Open a project and choose its evidence.';
 syncNetworkModel();
 $('groupLabel').textContent=communityLabel()+' community';$('groupColumn').textContent=communityLabel()+' community';$('colorMode').querySelector('option[value="cluster"]').textContent=communityLabel()+' community';
 $('edgeHelp').textContent=['infomap','hypergraph','sbm'].includes(graph.clustering?.algorithm)?'Lines retain their original support / combined-score weights. '+communityExplanation():method().weight;
 $('cluster').replaceChildren(new Option('All communities and unlinked works','all'));
 for(const cluster of [...new Set(graph.nodes.map(node=>node.cluster))].sort((first,second)=>first-second))$('cluster').append(new Option(groupName(cluster),cluster));
 $('analysisNote').textContent=orderDescription()+' · '+communityLabel()+(graph.resolution==null?'':' '+graph.resolution)+' · minimum joint support: '+(graph.minimumSupport||5)+' articles. '+(graph.order==='all'?'Line intensity includes a diminishing bonus for larger jointly cited bundles.':graph.order>2?graph.excludedByOrder+' references do not participate at this order.':graph.stats.isolated_nodes+' unlinked works shown in gray.');
 if(drillStack.length)$('analysisNote').textContent+=' '+(graph.expansion.enabled?'Expanded neighborhood':'Strict drill-down')+': original citing corpus; only combinations inside the selected reference set. '+(graph.stats.clusters<2?'No subdivision at this resolution. ':'Subclusters are exploratory, not validated themes. ')+(graph.autoCPM?.bootstrapARI<.7?'Low resampling agreement; interpret subdivisions cautiously.':'');
 $('mapCaption').textContent='Node size: citing articles. Line intensity: '+(graph.order==='all'?'combined score (experimental; compressed scale)':'supporting article count (compressed scale)')+'. Colors: '+communityLabel()+' communities. Gray: unlinked works.';
 if(graph.stats.clusters>1)$('mapCaption').textContent+=' Compact clusters are pulled closer by cross-cluster connections, with a minimum gap. Distances are not similarity scores. Unlinked works sit below.';
 $('metricExplanation').hidden=graph.order!=='all';
 entry=true;state.selected=null;state.selectedEdge=null;state.hover=null;state.zoom=1;state.tx=0;state.ty=0;
 $('minEdge').min=graph.minimumSupport||5;$('minEdge').max=Math.max(...graph.links.map(edge=>edge.count),graph.minimumSupport||5);$('minEdge').value=graph.minimumSupport||5;
 if(themeData)graph.themeDescriptions=window.ATLAS_THEMES.describe(graph.nodes,themeData);
 render();fit();overview();if(!themeData)requestThemes();
}

function render(){if(window.ATLAS_HISTORY?.active()||isPanel())return;window.ATLAS_EXTENSIONS?.sync(graph);window.ATLAS_EVIDENCE?.syncCanvasReliability(graph,pinnedCluster||$('cluster').value,graph.temporal?.sourceIds||Object.keys(data.articles),graph.bundles||data.bundlesByScope[graph.threshold]||[]);window.ATLAS_EVIDENCE?.renderFoundations(pinnedCluster||$('cluster').value,graph.themeDescriptions);svg.setAttribute('aria-label','Interactive '+method().title+' network. Select a node or line to inspect its evidence.');visible();renderClusterList();$('edgeValue').textContent=$('minEdge').value;$('stats').textContent=`${nodes.length} ${method().plural} / ${links.length.toLocaleString()} of ${graph.links.length.toLocaleString()} lines shown`;
 vp.replaceChildren();if(graph.directed){let defs=el('defs',{},vp),marker=el('marker',{id:'citationArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto',markerUnits:'userSpaceOnUse'},defs);el('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#86c8d9'},marker);}let edgeG=el('g',{'aria-label':method().title+' connections'},vp),nodeG=el('g',{'aria-label':method().plural},vp);
 let q=$('query').value.trim().toLowerCase(),matches=new Set(nodes.filter(n=>(n.label+' '+(n.authors||'')+' '+n.key+' '+(n.yearLabel||n.year||'')+' '+(n.variants||[]).join(' ')).toLowerCase().includes(q)).map(n=>n.id));
 let related=state.selected?new Set([state.selected,...links.filter(e=>e.source===state.selected||e.target===state.selected).flatMap(e=>[e.source,e.target])]):null;
 const maximumWeight=graph.links.reduce((maximum,edge)=>Math.max(maximum,isEntityMap()&&(graph.entityKind==='source'||graph.collaboration)?edge.strength:edge.combinedScore??edge.count),0);
 for(let e of links){let a=index.get(e.source),b=index.get(e.target),selected=state.selectedEdge===e.source+'|'+e.target,connected=state.selected&&(e.source===state.selected||e.target===state.selected);
 const intensity=window.atlasNetworkAppearance.edgeIntensity(isEntityMap()&&(graph.entityKind==='source'||graph.collaboration)?e.strength:e.combinedScore??e.count,maximumWeight),opacity=state.selected?(connected?1:.06):q?((matches.has(e.source)||matches.has(e.target))?1:.06):1;
 const stroke=+a.cluster!==0&&String(a.cluster)===String(b.cluster)?clusterColor(a.cluster):document.body.classList.contains('night-mode')?'#b5b5b5':'#777777';
 let line=el('g',{stroke,'stroke-opacity':intensity,opacity,'data-edge':e.source+'|'+e.target,tabindex:0,role:'button','aria-label':`${edgeDescription(e)}: ${short(a)} ${graph.directed?'to':'and'} ${short(b)}`},edgeG);
 el('path',{fill:'none','stroke-width':1.5,'stroke-linecap':'round','marker-end':graph.directed?'url(#citationArrow)':'none',class:'edge-visual'},line);
 el('path',{fill:'none',stroke:'transparent','stroke-opacity':0,'stroke-width':12,'pointer-events':'stroke',class:'edge-hit'},line);
 if(selected)line.classList.add('edge-selected');
 el('title',{},line).textContent=`${short(a)} ${graph.directed?'→':'↔'} ${short(b)}: ${edgeDescription(e)}`;
 line.addEventListener('click',event=>{event.stopPropagation();selectEdge(e)});line.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEdge(e)}});
 }
 addFlows();
 for(let [nodeIndex,n] of nodes.entries()){let match=!q||matches.has(n.id),active=state.selected===n.id,opacity=!match?.15:related&&!related.has(n.id)?.24:1,r=4+Math.sqrt(n.citations)*(+$('nodeScale').value)/5;
 let group=el('g',{'data-node':n.id,tabindex:0,role:'button','aria-label':`${n.label}; ${method().size}: ${n.citations}`,'aria-pressed':String(active),opacity,transform:`translate(${n.x} ${n.y})`},nodeG);
 el('circle',{r:r+(active?3:0),fill:color(n),class:'node-core'+(entry?' node-enter':''),style:'--enter-delay:'+Math.min(nodeIndex*18,280)+'ms',stroke:active?'#172d43':'#fff','stroke-dasharray':n.addedReference?'3 2':'none','data-added-reference':String(!!n.addedReference),'stroke-width':n.addedReference?3:active?3:1.8},group);if(active)el('circle',{r:r+9,fill:'none',stroke:color(n),'stroke-width':1.5,class:'selection-orbit','pointer-events':'none'},group);el('title',{},group).textContent=(graph.expansion?(n.addedReference?'Added lower-cited neighbor: ':'Original cluster member: '):'')+n.label+'\n'+method().size+': '+n.citations;
 group.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;state.hover=n.id;layoutLabels();highlightCluster(n.cluster)});group.addEventListener('pointerleave',event=>{if(event.pointerType==='touch')return;state.hover=null;layoutLabels();highlightCluster(null)});
 if(+n.cluster!==0)group.addEventListener('contextmenu',event=>{event.preventDefault();state.hover=null;layoutLabels();openClusterActions(n.cluster,event);});
group.addEventListener('pointerdown',event=>{if(event.button!==0||event.pointerType==='touch')return;cancelAnimationFrame(cameraFrame);event.stopPropagation();let p=point(event);state.drag={id:n.id,start:p,x:n.x,y:n.y};state.moved=false;svg.setPointerCapture(event.pointerId)});
 group.addEventListener('click',event=>{event.stopPropagation();if(!state.moved)selectNode(n.id)});
 group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNode(n.id)}});
 }
 for(const group of nodeG.querySelectorAll('[data-node]')){const member=index.get(group.dataset.node),rating=window.ATLAS_INDICATORS?.clusterReliability(graph,member.cluster);if(!rating||rating.status==='unlinked')continue;group.dataset.reliability=rating.status;group.setAttribute('aria-label',group.getAttribute('aria-label')+'; Cluster stability: '+rating.title);group.querySelector('title').textContent+='\nCluster stability: '+rating.title;if(rating.dash!==null)el('circle',{r:radius(member)+3,fill:'none',stroke:document.body.classList.contains('night-mode')?'#ddd':'#494949','stroke-opacity':.65,'stroke-width':1,'stroke-dasharray':rating.dash,'stroke-linecap':'round',class:'node-reliability-ring','pointer-events':'none','aria-hidden':'true'},group);}
 entry=false;updateList(matches,q);updateConnectionLegend(maximumWeight);transform();}
function updateConnectionLegend(maximumWeight){
 if(isEntityMap()){$('mapCaption').textContent='Node size: '+method().size+'. '+method().weight+' Same-cluster lines carry community color; crossing lines are gray. Positions are exploratory, not measured distances.';return;}
 const metric=isCoupling()?'shared references':graph.order==='all'?'combined score (experimental)':'supporting articles';
 $('mapCaption').textContent='Node size: '+method().size.toLowerCase()+'. Line intensity: '+metric+' (log scale within this analysis). Same-cluster lines match community colors; cross-cluster lines are gray. Focus and search dim unrelated evidence. Distances are not similarity scores.';
 const key=text('span','','edge-intensity-key');key.append(text('span','0'),text('span','','edge-intensity-ramp'),text('span',Number(maximumWeight.toPrecision(4))+' '+metric));key.title='Full-analysis scale. More intense means more evidence, not higher similarity or significance. Display filters do not rescale intensity. Select a line for exact values.';$('mapCaption').append(key);
 const reliabilityKey=text('button','Cluster stability: solid = holds · dashed = sensitive · dotted = changes · no ring = unchecked','canvas-reliability-key');reliabilityKey.type='button';reliabilityKey.title='Rings describe the whole cluster, not individual article quality. Quick checks are preliminary. Click for the reliability report.';reliabilityKey.onclick=()=>window.ATLAS_EVIDENCE?.showCanvasReliability();if(graph.reliability?.preliminary)reliabilityKey.textContent+=' · preliminary';$('mapCaption').append(reliabilityKey);
}
function updateList(matches,q){let sorted=[...nodes].filter(n=>!q||matches.has(n.id)).sort((a,b)=>b.citations-a.citations||a.label.localeCompare(b.label));$('resultCount').textContent=`${sorted.length} ${method().plural}${q?' matching your search':''}`;
 $('workList').replaceChildren();$('tableBody').replaceChildren();for(let n of sorted){let li=text('li',''),button=text('button','');button.type='button';const description=text('span',short(n));const author=typeof n.authors==='string'?n.authors.split(';')[0].trim():'';description.append(text('small',(graph.collaboration?[n.id]:[n.yearLabel||n.year||'Year unknown',author]).filter(Boolean).join(' · '),'search-metadata'));const count=text('span',String(n.citations),'count'),metric=isEntityMap()?(graph.entityKind==='source'?'article':'supporting sources'):isCoupling()?'references':'citing articles';count.append(text('small',metric));count.title=n.citations+' '+metric;button.append(description,count);button.title=n.label+(n.year?' ('+(n.yearLabel||n.year)+')':'');button.setAttribute('aria-pressed',String(n.id===state.selected));button.onclick=()=>selectNode(n.id);li.append(button);$('workList').append(li);
 let tr=document.createElement('tr'),td=document.createElement('td'),b=text('button',n.label);b.className='table-work';b.onclick=()=>selectNode(n.id);td.append(b);tr.append(td,text('td',String(n.citations)),text('td',groupName(n.cluster)));$('tableBody').append(tr);}
 if(!sorted.length)$('workList').append(text('li','No matching works. Try another name or clear a filter.','empty'));}
function openClusterCombinations(cluster,viewOptions={}){if(isEntityMap())return;try{const result=window.ATLAS_HYPERGRAPH_VIEW.forCluster(graph,graph.bundles||data.bundlesByScope[graph.threshold]||[],cluster,graph.nodes);window.openClusterCombinationLayers({...result,...viewOptions,nodes:graph.nodes,clusterId:String(cluster),clusterLabel:groupName(cluster),coupling:isCoupling(),nodeColor:color,sourceArticles});}catch(error){window.atlasWorkspaceShell?.selected('cluster:'+cluster);const detail=$('details');detail.replaceChildren(text('h2','Cluster combinations'),text('p',errorMessage(error)));}}
function inspectHyperedge(edge){window.atlasWorkspaceShell?.selected('hyperedge:'+edge.id);const detail=$('details');detail.replaceChildren();detail.scrollTop=0;detail.append(text('span',isCoupling()?'SHARED-REFERENCE GROUP':'EXACT COMBINATION','eyebrow'),text('h2',edge.members.length+' articles together'));const explode=text('button','Explode this combination','secondary');explode.onclick=()=>window.openClusterCombinationLayers({groups:[edge],total:1,nodes:graph.nodes,clusterLabel:'Selected combination',coupling:isCoupling(),nodeColor:color,sourceArticles});detail.append(explode);para(detail,isCoupling()?'These source articles all cite the same reference. This is not a repeatedly co-cited reference combination.':(edge.articles?.length||0)+' supporting sources. Counts overlap across combinations; do not add them.');const list=document.createElement('ol');for(const id of edge.members){const item=document.createElement('li'),member=index.get(id),button=text('button',member?.title||member?.label||id,'secondary');button.onclick=()=>selectNode(id);item.append(button);list.append(item);}detail.append(list);const sources=document.createElement('details'),evidence=isCoupling()?[edge.reference]:edge.articles||[];sources.append(text('summary',(isCoupling()?'Shared reference':'Supporting sources')+' ('+evidence.length+')'));for(const id of evidence){const source=data.articles[id],link=text('a',source?.title||source?.display_name||id);link.href=/^https:\/\//.test(id)?id:'https://openalex.org/'+encodeURIComponent(id);link.target='_blank';link.rel='noopener';const row=text('p','');row.append(link);sources.append(row);}detail.append(sources);para(detail,'Only the listed articles are members. An outline may enclose unrelated nodes. Layer depth represents group size, not importance or similarity.');}
function resetDetail(){let d=$('details');d.replaceChildren();d.scrollTop=0;if(!isCoupling()&&!isEntityMap()&&!state.selected&&!state.selectedEdge){window.ATLAS_EVIDENCE?.addClusterActions(d,graph,+(pinnedCluster||$('cluster').value));themePanel(d,+(pinnedCluster||$('cluster').value));}return d;}
function para(parent,str,cls){str=String(str??'Method details were not recorded for this result.');if(externalPacket&&str.startsWith('2855 Conservative'))str=Object.keys(data.articles).length+' metadata-screened sources; topical relevance awaits review.';if(externalPacket&&str.startsWith('Leiden groups use'))str='Leiden uses the full selected network. The density starting CPM is exploratory; Find settings compares alternatives and reliability resamples the evidence.';parent.append(text('p',str,cls));}
function overview(){if(window.ATLAS_HISTORY?.active())return;if(isEntityMap()){document.body.classList.remove('has-selection');const detail=resetDetail();if(graph.entityKind==='source')themePanel(detail,+(pinnedCluster||$('cluster').value));entityAdapter().overview(graph,detail,pinnedCluster||$('cluster').value,sourceArticles);return;}if(isCoupling()){const detail=resetDetail(),notes=text('div','','overview-context');themePanel(detail,+(pinnedCluster||$('cluster').value));document.body.classList.remove('has-selection');if(!detail.querySelector('h2'))detail.append(text('h2','Explore source articles'));detail.append(text('p','Select an article or connection for evidence, or browse shared foundations below.','inspect-invitation'),notes);para(notes,method().explanation);para(notes,graph.scopeLabel);para(notes,graph.stats.clusters+' coupling clusters · '+graph.stats.isolated_nodes+' unlinked sources. Node size means available references, not citation count.');para(notes,method().weight);para(notes,method().caveat);para(notes,'Select a source for its reference list, or a line for the references shared by both sources. Cluster highlighting and connected-cluster filters use all analytical edges.');return;}document.body.classList.remove('has-selection');let d=resetDetail(),m=method(),notes=text('div','','overview-context');if(!d.querySelector('h2'))d.append(text('h2','Explore cited works'));d.append(text('p','Select an article or connection to inspect its evidence.','inspect-invitation'),notes);notes.append(text('h3',m.question));para(notes,graph.expansion?'This drill-down keeps the original citing corpus. Minimum joint support is '+graph.minimumSupport+' source articles. '+(graph.expansion.enabled?'Dashed node outlines mark added lower-cited neighbors; solid outlines mark original members.':'Only the original parent members are included.'):m.explanation);para(notes,'Select a node for its neighbors, or a line for the exact count and supporting evidence.');let box=text('div','','detail-note');para(box,graph.expansion?'Source eligibility and topical relevance limitations are unchanged. Expanded neighborhoods are exploratory; inclusion does not establish thematic relevance.':m.caveat);para(box,externalPacket?data.summary.source_corpus_size+' '+(externalPacket.preset||'selected')+' metadata-eligible sources in this project; topical relevance awaits human review.':'2855 Conservative metadata-eligible source articles; topical relevance awaits human review.');notes.append(box);notes.append(text('h3','What determines the groups?'));para(notes,orderDescription()+'; '+communityLabel()+(graph.resolution==null?'':' '+graph.resolution)+'; minimum joint support '+(graph.minimumSupport||5)+'. Unlinked works are not a community.');para(notes,communityExplanation());para(notes,externalPacket?'Membership uses the full selected evidence before display filters. '+(graph.resolutionSelection||graph.appliedSettings?.settings.label||'')+' Use Find settings and Reliability to assess structural sensitivity. AI descriptions are separate thematic suggestions.':graph.trial?graph.trial.result.limitations:['infomap','hypergraph','sbm'].includes(graph.clustering?.algorithm)?'Membership uses the full selected analysis, before display filters. Method agreement is descriptive, not proof of stable or meaningful themes. Run a method-specific reliability check in Roles & reliability below the canvas.':(['cocitation','coupling','keywords'].includes(state.method)||m.clustered)?'Leiden groups use all analysis edges, before display filters. Groups require interpretation; the scope selector compares citation thresholds; the selected CPM setting uses ten random starts; Auto CPM uses a density-adaptive sweep and 50 conditional source-article bootstrap samples; inspect the Auto CPM audit for selection scores and limitations.':['institutions','countries'].includes(state.method)?'Colors identify connected components of the selected scope. Repeated colors do not imply a shared component.':state.method==='coauthorship'?'Colors identify components of the full 776-name network. Repeated colors do not imply a shared component.':'Central and application are eligibility categories, not citation clusters.');if($('colorMode').value==='year')para(notes,'Year overlay: blue represents older years; green represents newer years; gray means unavailable. Author and keyword years are rounded means of contributing source years.');let counts=new Map();for(let n of graph.nodes)counts.set(n.cluster,(counts.get(n.cluster)||0)+1);for(let [c,count] of [...counts].sort((a,b)=>b[1]-a[1]).slice(0,12)){let row=text('p',groupName(c)+' · '+count+' '+m.plural);row.style.borderLeft='4px solid '+clusterColor(c);row.style.paddingLeft='10px';notes.append(row)}if(counts.size>12)para(notes,counts.size+' components in this view; use the filter for the full list.');para(notes,'Node size: '+m.size+'. Line intensity: '+m.edge+'. Positions are an exploratory layout, not a measured distance scale.','muted');}
function sourceArticles(parent,ids){let ol=text('ol','','source-articles');for(let id of ids){let art=data.articles[id];if(!art)continue;let li=text('li','');li.append(text('strong',art.title),text('p',`${art.yearLabel||art.year} · ${art.authors}`,'muted'),text('p',`${id} · ${art.category} · ${art.journal}`,'muted'));if(art.deduplicationNote)li.append(text('p',art.deduplicationNote,'deduplication-note'));if(art.doi){let a=text('a','Article DOI ↗');a.href='https://doi.org/'+encodeURI(art.doi.replace(/^https?:\/\/doi.org\//,''));a.target='_blank';a.rel='noopener';li.append(a)}ol.append(li)}parent.append(ol);}

function selectNode(id,reveal=true){if(reveal)window.atlasWorkspaceShell?.selected('node:'+id);if(isEntityMap()){state.selected=id;state.selectedEdge=null;state.hover=null;render();document.body.classList.add('has-selection');entityAdapter().inspectNode(graph,index.get(id),resetDetail(),sourceArticles,selectNode);return;}if(isCoupling()){state.selected=id;state.selectedEdge=null;state.hover=null;render();document.body.classList.add('has-selection');window.ATLAS_EVIDENCE.inspectCanvasSource(id,resetDetail());return;}activeBundle=null;document.body.classList.add('has-selection');state.selected=id;state.selectedEdge=null;render();let n=index.get(id),d=resetDetail();d.append(text('span',method().node.toUpperCase(),'eyebrow'),text('h2',n.label));para(d,`${method().size}: ${n.citations} · ${groupName(n.cluster)}${n.year?' · '+n.year:''}`,'detail-metric');
 window.ATLAS_EVIDENCE?.addNodeRole(d,graph,id);
 if(n.deduplicationNote){para(d,n.deduplicationNote,'deduplication-note');const records=document.createElement('details');records.append(text('summary','Combined records · '+n.yearLabel));for(const record of n.mergedRecords||[])para(records,`${record.year||'Year unknown'} · ${record.title} · ${record.id}${record.doi?' · '+record.doi:''}`,'reference-variant');d.append(records);}
 if(n.doi){let a=text('a','Open DOI ↗');a.href='https://doi.org/'+encodeURI(n.doi.replace(/^https?:\/\/doi.org\//,''));a.target='_blank';a.rel='noopener';d.append(a)}
 let edges=graph.links.filter(e=>e.source===id||e.target===id).sort((a,b)=>b.count-a.count);let focus=text('button','Zoom to this node','secondary');focus.onclick=()=>{let z=Math.max(state.zoom,2.2);moveCamera({zoom:z,tx:state.width/2-n.x*z,ty:state.height/2-n.y*z});svg.scrollIntoView({block:'center',behavior:'smooth'})};d.append(focus);const neighborsDisclosure=document.createElement('details');neighborsDisclosure.append(text('summary',edges.length+' connected neighbors'));d.append(neighborsDisclosure);para(neighborsDisclosure,`${edges.length} neighbors in this threshold network. Counts below use all its connections, before display filters.`,'muted');
 let list=text('div','','neighbors');for(let e of edges){let other=index.get(e.source===id?e.target:e.source),b=text('button','');b.append(text('span',(graph.directed?(e.source===id?'Cites → ':'Cited by ← '):'')+short(other)),text('strong',String(e.count)));b.title=other.label;b.onclick=()=>selectEdge(e);list.append(b)}neighborsDisclosure.append(list);
 if(n.articles.length){let evidence=document.createElement('details');evidence.append(text('summary',n.articles.length+' source article record(s)'));sourceArticles(evidence,n.articles);d.append(evidence);}let disclosure=document.createElement('details');disclosure.append(text('summary',`Reference cleanup (${n.variants.length} variants)`));for(let rule of n.rules)para(disclosure,rule.replaceAll('_',' '),'muted');for(let raw of n.variants)para(disclosure,raw,'reference-variant');if(n.variants.length)d.append(disclosure);let clear=text('button','Clear selection');clear.className='secondary';clear.onclick=()=>{state.selected=null;render();overview()};d.append(clear);}
function selectEdge(e,reveal=true){if(reveal)window.atlasWorkspaceShell?.selected('edge:'+e.source+'|'+e.target);if(isEntityMap()){state.selected=null;state.selectedEdge=e.source+'|'+e.target;render();document.body.classList.add('has-selection');entityAdapter().inspectEdge(graph,e,resetDetail(),sourceArticles);return;}if(isCoupling()){state.selected=null;state.selectedEdge=e.source+'|'+e.target;render();document.body.classList.add('has-selection');const detail=resetDetail();window.ATLAS_EVIDENCE.inspectCanvasPair(e,detail);window.ATLAS_EXTENSIONS?.describeEdge(detail,e,graph);return;}activeBundle=null;document.body.classList.add('has-selection');state.selected=null;state.selectedEdge=e.source+'|'+e.target;render();let a=index.get(e.source),b=index.get(e.target),d=resetDetail();d.append(text('span',method().title.toUpperCase()+' EVIDENCE','eyebrow'),text('h2',e.count+' '+method().edge.toLowerCase()));for(let [j,n] of [a,b].entries()){if(graph.directed)para(d,j?'Cited article':'Citing article');let btn=text('button',n.label,'evidence-work');btn.onclick=()=>selectNode(n.id);d.append(btn)}if(graph.order==='all')combinedEvidence(d,e);para(d,'Pair-projection weight: '+e.strength.toPrecision(5)+'. '+communityExplanation(),'muted');hyperedgeEvidence(d,e);window.ATLAS_EXTENSIONS?.describeEdge(d,e,graph);if(state.method==='coupling'){para(d,'The following normalized references occur in both articles.');let ol=text('ol','','source-articles');for(let key of e.references)ol.append(text('li',data.references[key]||key));d.append(ol);sourceArticles(d,[a.key,b.key]);}else{if(graph.directed)para(d,'Conservative matching rule: '+e.match);else para(d,'Each source article below contributes one count to this connection. Co-occurrence does not establish agreement or causation.');if(e.bundleIds?.length&&!(graph.order==='all'&&graph.maximumOrder===2))bundleEvidence(d,e);sourceArticles(d,e.articles);}}
function hyperedgeEvidence(parent,edge){
 if(!graph.hyperedges)return;
 const combinations=graph.hyperedges.filter(bundle=>bundle.members.includes(edge.source)&&bundle.members.includes(edge.target)).sort((left,right)=>right.weight-left.weight||left.id.localeCompare(right.id));
 const section=document.createElement('details');section.append(text('summary',combinations.length+' exact hyperedges containing this pair'));
 para(section,'These are the whole combinations used in hypergraph clustering. Weight is the sum of source-normalized contributions, not a citation count or significance score. Showing up to 20; Export data contains all combinations.');
 for(const bundle of combinations.slice(0,20)){const button=text('button',bundle.members.map(id=>short(index.get(id))).join(' + '),'evidence-work');button.onclick=()=>showBundle(bundle);section.append(button);para(section,bundle.articles.length+' supporting articles · hyperedge weight '+bundle.weight.toFixed(4),'muted');}
 parent.append(section);
}
function combinedEvidence(parent,edge){
 const section=text('section','','combined-evidence');
 section.append(text('h3','Combined connection score · experimental'));
 para(section,edge.combinedScore.toFixed(2)+' = '+edge.count+' co-citing articles + '+edge.higherOrderBonus.toFixed(2)+' higher-order bonus.','detail-metric');
 para(section,'Each article contributes once, weighted by its largest qualifying bundle, capped at order '+graph.maximumOrder+'. This experimental score is not an article count or a significance measure.');
 section.append(text('h3','Supporting articles at each order'));
 para(section,'Nested counts: rows overlap and must not be added.');
 const table=document.createElement('table');table.className='order-profile';
 const head=document.createElement('thead'),heading=document.createElement('tr');
 for(const label of ['Order','Articles','Share of pair support'])heading.append(text('th',label));
 head.append(heading);table.append(head);const body=document.createElement('tbody');
 for(const row of edge.orderProfile){
  const line=document.createElement('tr'),cell=document.createElement('td'),bar=document.createElement('meter');
  bar.min=0;bar.max=edge.count;bar.value=row.support;bar.setAttribute('aria-label',row.support+' of '+edge.count+' articles at order '+row.order);
  cell.append(bar,text('span',Math.round(100*row.support/edge.count)+'%'));
  line.append(text('td',row.order===2?'2 · pairwise':String(row.order)),text('td',String(row.support)),cell);body.append(line);
 }
 table.append(body);section.append(table);parent.append(section);
}
function openLineLayers(edge,viewOptions={}){
 if(isCoupling()){selectEdge(edge);return;}
 const minimum=typeof graph.order==='number'?Math.max(3,graph.order):3;
 const bundles=(graph.bundles||data.bundlesByScope[graph.threshold]||[]).filter(bundle=>bundle.members.length>=minimum&&bundle.members.includes(edge.source)&&bundle.members.includes(edge.target));
 svg.classList.remove('touch-manipulating');
 if(!bundles.length||(graph.order==='all'&&graph.maximumOrder===2)){selectEdge(edge);para($('details'),'No higher-order combinations qualify for this pair at the current reference scope.','detail-note');return;}
 window.openCoCitationLayers({...viewOptions,edge,bundles,nodes:graph.nodes,minimumSupport:graph.minimumSupport||5,order:graph.order,maximumOrder:graph.order==='all'?graph.maximumOrder:null,label:mapLabel,nodeColor:color,sourceArticles});
}
function bundleEvidence(parent,edge){
 const relevant=new Set(edge.bundleIds||[]);
 const bundles=(graph.bundles||data.bundlesByScope[graph.threshold]||[]).filter(bundle=>relevant.has(bundle.id));
 parent.append(text('h3','Jointly cited reference bundles'));
 const explode=text('button','Explore layered combinations ↗','secondary');explode.onclick=()=>openLineLayers(edge);parent.append(explode);
 para(parent,graph.order==='all'?'These complete bundles establish the higher-order evidence. Each occurs in at least '+(graph.minimumSupport||5)+' articles. The score uses only the largest supported bundle per article for this pair.':'These complete bundles each occur together in at least '+(graph.minimumSupport||5)+' articles. A bundle may contain more than N='+graph.order+' references and represents its N-reference subsets. The line count unions their source articles without double counting.');
 for(const bundle of bundles){
  const disclosure=document.createElement('details');disclosure.className='bundle-evidence';
  disclosure.append(text('summary',bundle.members.length+' references jointly cited · '+bundle.articles.length+' articles'));
  disclosure.addEventListener('toggle',()=>{
   if(!disclosure.open||disclosure.dataset.loaded)return;disclosure.dataset.loaded='true';
   const show=text('button','Show co-cited group','secondary');show.onclick=()=>showBundle(bundle);disclosure.append(show);
   const clear=text('button','Clear group highlight','secondary');clear.onclick=()=>{activeBundle=null;render();fit();};disclosure.append(clear);
   para(disclosure,'Exact group: all '+bundle.members.length+' references below occur together in these '+bundle.articles.length+' source articles. This may be larger than the selected order.','muted');
   for(const id of bundle.members){const node=index.get(id);const button=text('button',node?.label||id,'evidence-work');button.onclick=()=>selectNode(id);disclosure.append(button);}
   sourceArticles(disclosure,bundle.articles);
  });
  parent.append(disclosure);
 }
 parent.append(text('h3','All distinct supporting articles for this line'));
}
function showExtensionPanel(variantKey){
 const p=$('profilesView'),parent=data.extensions.panels[state.method];variantKey=variantKey||parent.defaultVariant;const panel={...parent,...(parent.variants?.[variantKey]||{})},base=panel.assetBase||'extensions/';p.replaceChildren();
 $('stats').textContent='2855 provisional source articles · coverage varies by analysis';$('status').textContent=panel.title+' · methods and audit files available';
 const card=(title)=>{let section=text('section','','profile-card extension-card');section.append(text('h3',title));p.append(section);return section};
 let intro=card(panel.question);para(intro,panel.intro);let report=text('a','Read methods, limitations and validation ↗');report.href=base+'report.html';report.target='_blank';report.rel='noopener';intro.append(report);
 if(parent.variants){let label=text('label','Compare analysis settings');label.htmlFor='panelVariant';let select=document.createElement('select');select.id='panelVariant';for(let [key,v] of Object.entries(parent.variants))select.append(new Option(v.label,key));select.value=variantKey;select.onchange=()=>showExtensionPanel(select.value);intro.append(label,select);para(intro,panel.note);}
 if(panel.milestones){let section=card('Explore the milestones');window.renderMilestones(section,id=>{$('analysisMethod').value='historiography';chooseMethod();const finder=document.querySelector('.hist-toolbar select[aria-label="Find an article"]');finder.value=id;finder.dispatchEvent(new Event('change'));});}
 if(state.method==='evolution'){let b=text('button','Explore the three period networks','secondary');b.onclick=()=>{$('analysisMethod').value='terms';chooseMethod();$('threshold').value='terms_1995_2014';loadGraph()};intro.append(b)}
   if(panel.historiographyKey){let section=card('Follow the citation history');window.renderHistoriography(section,panel.historiographyKey);}
 for(let [file,title] of panel.figures){let section=card(title),img=document.createElement('img');img.src=base+file;img.alt=title;section.append(img)}
 for(let t of panel.tables){let section=card(t.title);if(!t.rows.length){para(section,'No eligible rows.');continue}let wrap=text('div','','extension-table-wrap'),table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr'),keys=Object.keys(t.rows[0]);for(let key of keys)tr.append(text('th',key.replaceAll('_',' ')));head.append(tr);table.append(head);let body=document.createElement('tbody');for(let row of t.rows){let tr=document.createElement('tr');for(let key of keys)tr.append(text('td',String(row[key]??'')));body.append(tr)}table.append(body);wrap.append(table);section.append(wrap)}
 for(let d of panel.dossiers||[]){let section=card(d.title);para(section,d.network+' · cluster '+d.cluster+' · '+d.members+' members','eyebrow');para(section,d.interpretation);para(section,'Alternative / limitation: '+d.alternative);para(section,'Evidence level: '+d.evidence_level+'. '+d.selection,'muted');let button=text('button','Open this baseline cluster','secondary');button.onclick=()=>{$('analysisMethod').value=data.graphs[d.network].method;chooseMethod();$('threshold').value=d.network;loadGraph();$('cluster').value=d.cluster;render();overview()};section.append(button);let details=document.createElement('details');details.append(text('summary','Inspect member labels and supporting article records'));para(details,d.member_labels.join(' · '));sourceArticles(details,d.article_ids);section.append(details)}
 if(panel.article_ids){let section=card('Inspect the source article records');sourceArticles(section,panel.article_ids);}
 let downloads=card('Download the evidence');for(let file of panel.files){let a=text('a',file.replaceAll('_',' '));a.href=base+file;a.download=file;downloads.append(a)}let a=text('a','Complete reproducible research package (.zip)');a.href=base+'research_package.zip';a.download='bibliometric_research_package.zip';downloads.append(a);
}

function showProfiles(){let p=$('profilesView');p.replaceChildren();$('stats').textContent='2855 articles · 14 October 2026 citation snapshot';$('status').textContent='Descriptive profiles · 2026 is incomplete';for(let [file,title] of [['publication_history.png','Publication history'],['journal_productivity.png','Leading publication venues']]){let section=text('section','','profile-card');section.append(text('h3',title));let img=document.createElement('img');img.src='analysis/'+file;img.alt=title+' for the 2855 provisional source articles';section.append(img);p.append(section)}let section=text('section','','profile-card');section.append(text('h3','Highest recorded citation totals'),text('p','Web of Science totals are a dated global snapshot. Matched local citations count only citations inside this core. They are not age-normalized impact scores.'));let table=document.createElement('table'),head=document.createElement('thead'),row=document.createElement('tr');for(let title of ['Article','Year','WoS citations','Matched local citations'])row.append(text('th',title));head.append(row);table.append(head);let body=document.createElement('tbody');for(let r of data.profiles.citations.slice(0,20)){let tr=document.createElement('tr');for(let key of ['title','year','times_cited_wos_snapshot','matched_local_citing_articles'])tr.append(text('td',r[key]));body.append(tr)}table.append(body);section.append(table);for(let [file,label] of [['publication_years.csv','All publication years CSV'],['journal_productivity.csv','All journals CSV'],['citation_ranking.csv','All 2855 citation records CSV']]){let a=text('a',label);a.href='analysis/'+file;a.download=file;section.append(a)}p.append(section);}

function zoom(factor,center={x:state.width/2,y:state.height/2}){let z=Math.max(.25,Math.min(12,state.zoom*factor));moveCamera({zoom:z,tx:center.x-(center.x-state.tx)*z/state.zoom,ty:center.y-(center.y-state.ty)*z/state.zoom});}
function fit(){cancelAnimationFrame(cameraFrame);let xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);if(!xs.length)return;let w=Math.max(...xs)-Math.min(...xs)+160,h=Math.max(...ys)-Math.min(...ys)+140;state.zoom=Math.min((state.width-30)/w,(state.height-30)/h,2);state.tx=state.width/2-(Math.max(...xs)+Math.min(...xs))/2*state.zoom;state.ty=state.height/2-(Math.max(...ys)+Math.min(...ys))/2*state.zoom;transform();}
svg.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),point(e))},{passive:false});
let touchFrame=0;
window.attachAtlasTouch(svg,{point,camera:()=>({zoom:state.zoom,tx:state.tx,ty:state.ty}),start:()=>{cancelAnimationFrame(cameraFrame);state.drag=null;state.hover=null;svg.classList.add('touch-manipulating');},end:()=>{svg.classList.remove('touch-manipulating');transform();},move:camera=>{Object.assign(state,camera);if(!touchFrame)touchFrame=requestAnimationFrame(()=>{touchFrame=0;transform();});},tap:target=>{const node=target.closest('[data-node],[data-label]'),line=target.closest('[data-edge]');if(node)selectNode(node.dataset.node||node.dataset.label);else if(line){const edge=links.find(edge=>edge.source+'|'+edge.target===line.dataset.edge);if(edge)selectEdge(edge);}else{state.selected=null;state.selectedEdge=null;render();overview();}},hold:(target,event)=>{const node=target.closest('[data-node],[data-label]');if(node){const cluster=index.get(node.dataset.node||node.dataset.label).cluster;if(+cluster!==0)openClusterActions(cluster,event);}else{const line=target.closest('[data-edge]');if(line){const edge=links.find(edge=>edge.source+'|'+edge.target===line.dataset.edge);if(edge)openLineLayers(edge);}}}});
svg.addEventListener('pointerdown',e=>{cancelAnimationFrame(cameraFrame);if(e.target===svg||e.target===vp){state.drag={start:point(e),tx:state.tx,ty:state.ty};state.moved=false;svg.setPointerCapture(e.pointerId)}});
svg.addEventListener('pointermove',e=>{let p=point(e);if(state.drag){let d=state.drag,dx=p.x-d.start.x,dy=p.y-d.start.y;if(Math.abs(dx)+Math.abs(dy)>3)state.moved=true;if(d.id){let n=index.get(d.id);n.x=d.x+dx/state.zoom;n.y=d.y+dy/state.zoom;render()}else{state.tx=d.tx+dx;state.ty=d.ty+dy;transform()}}});
svg.addEventListener('pointerup',e=>{if(state.drag&&!state.moved){if(state.drag.id)selectNode(state.drag.id);else{state.selected=null;state.selectedEdge=null;state.hover=null;render();overview();}}state.drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId)});
svg.addEventListener('pointercancel',()=>{state.drag=null;state.moved=false;});
svg.addEventListener('keydown',e=>{if(e.target!==svg)return;if(e.key==='+'||e.key==='=')zoom(1.2);else if(e.key==='-')zoom(1/1.2);else if(e.key==='0')fit();else if(e.key==='Escape'){state.selected=null;state.selectedEdge=null;render();overview()}else return;e.preventDefault()});
function save(content,type,name){let u=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);$('status').textContent='Export prepared: '+name;}
$('exportSvg').onclick=()=>{let clone=svg.cloneNode(true);clone.setAttribute('xmlns',NS);clone.setAttribute('width',state.width);clone.setAttribute('height',state.height);clone.removeAttribute('tabindex');clone.querySelectorAll('[data-animation],.selection-orbit,.edge-hit').forEach(e=>e.remove());let rect=document.createElementNS(NS,'rect');for(let [k,v] of Object.entries({width:state.width,height:state.height,fill:'#fafbf9'}))rect.setAttribute(k,v);clone.prepend(rect);save(new XMLSerializer().serializeToString(clone),'image/svg+xml',state.name+'.svg')};
$('reliabilityButton').onclick=()=>window.ATLAS_EVIDENCE.showCanvasReliability();
$('clusteringMethod').onchange=()=>{const algorithm=$('clusteringMethod').value;if(algorithm==='hypergraph'){$('networkModel').value='hypergraph';representation.value='envelopes';}if(algorithm==='sbm'&&$('networkModel').value==='hypergraph'){$('networkModel').value=isCoupling()?'pairwise':graph.order===2?'pairwise':'higher-order';representation.value='network';}if(window.ATLAS_EXTENSIONS?.changeMethod())return;if(isCoupling())window.ATLAS_EVIDENCE.changeCouplingMethod();else loadGraph();};
$('networkModel').onchange=()=>{
 const model=$('networkModel').value;
 if(model!=='hypergraph'&&$('clusteringMethod').value==='hypergraph')$('clusteringMethod').value='leiden';
 representation.value=model==='hypergraph'?'envelopes':'network';
 if(isCoupling()){window.ATLAS_EVIDENCE.changeCouplingMethod();return;}
 if(externalPacket){window.ATLAS_PROJECTS.setNetworkModel(model);return;}
 if(window.ATLAS_EXTENSIONS?.changeMethod())return;
 if(model==='pairwise'){$('orderMode').value='single';$('orderSlider').min=2;$('orderSlider').value=2;}
 else if(graph.order===2){$('orderMode').value='combined';}
 $('orderSlider').min=model==='higher-order'?3:2;
 if(model==='higher-order'&&$('orderMode').value==='single'&&+$('orderSlider').value<3)$('orderSlider').value=3;
 syncAnalysisOptions();
};
$('exportData').onclick=()=>isCoupling()?window.ATLAS_EVIDENCE.exportCanvasEvidence():save(JSON.stringify(isPanel()?(method().panel?{panel:data.extensions.panels[state.method],selectedVariant:$("panelVariant")?.value||null,milestones:["milestones","historiography"].includes(state.method)?data.milestones:undefined,historiography:state.method==="historiography"?data.historiography:undefined,summary:data.extensions.summary,version:data.extensions.version}:{profiles:data.profiles,version:data.version,summary:data.summary}):{version:data.extensions?.methods[state.method]?data.extensions.version:data.version,network:state.name,filters:{cluster:$('cluster').value,minimum_raw_count:+$('minEdge').value,edge_display:$('edgeDisplay').value,hide_unlinked:mapVisibility.hideUnlinked,minimum_cluster_size:mapVisibility.minimumClusterSize,hidden_clusters:[...mapVisibility.hiddenClusters]},nodes,links,bundles:graph.order!==2?(graph.bundles||data.bundlesByScope[graph.threshold]||[]).filter(bundle=>graph.order==='all'||bundle.members.length>=graph.order):[],analysis:{collaboration:graph.collaboration||null,collaborationSensitivity:graph.collaborationSensitivity||null,egoParent:graph.egoParent||null,temporalSeries:graph.temporalSeries||null,temporalSelection:graph.temporalSelection||null,burstReport:graph.burstReport||null,evidenceProvenance:graph.evidenceProvenance||null,semantic:graph.semantic||null,semanticSensitivity:graph.semanticSensitivity||null,semanticComparison:graph.semanticComparison||null,entityKind:graph.entityKind||null,scientificManifest:graph.scientificManifest||null,scienceAudit:graph.scienceAudit||null,settingsSearch:graph.settingsSearch||null,evidenceSensitivity:graph.evidenceSensitivity||null,sourceReliability:graph.sourceReliability||null,appliedSettings:graph.appliedSettings||null,reliability:graph.reliability||null,drillPath:graph.drillPath||[],order:graph.order,maximumIncludedOrder:graph.maximumOrder,autoCPM:graph.autoCPM,themeDescriptions:graph.themeDescriptions||null,derivedFromAnalysisId:graph.derivedFromAnalysisId,metric:graph.metric||null,expansion:graph.expansion||null,minimumSupport:graph.minimumSupport||5,clustering:graph.clustering,memberships:Object.fromEntries(graph.nodes.map(node=>[node.id,node.cluster])),comparison:graph.comparison||null,hyperedges:graph.hyperedges||null,analysisId:graph.analysisId},articles:data.articles,method:method(),summary:externalPacket?window.ATLAS_EVIDENCE.currentStudySummary(externalPacket,graph,data.articles,{nodes:nodes.length,edges:links.length}):data.extensions?.methods[state.method]?data.extensions.summary:data.summary},null,2),'application/json',(isPanel()?state.method:state.name)+'.json');
const ordinaryScientificExport=$('exportData').onclick;$('exportData').onclick=async()=>{const selectedGraph=graph;try{if(!isPanel()&&!isCoupling())await window.ATLAS_SCIENCE.prepareExport(selectedGraph);if(graph!==selectedGraph)return;return ordinaryScientificExport();}catch(error){$('status').textContent='Export not completed: '+errorMessage(error);}};
 $('threshold').onchange=()=>syncAnalysisOptions(data.graphs[$('threshold').value].threshold);$('analysisMethod').onchange=chooseMethod;
$('modelResolution').onchange=syncAnalysisOptions;$('coCitationOrder').onchange=syncAnalysisOptions;
 for(const id of ['drillMode','drillReferenceMinimum','drillSupport'])$(id).onchange=()=>{$('modelResolution').value='auto';syncAnalysisOptions();};
 $('drillReferenceMinimum').oninput=()=>{$('drillReferenceValue').textContent=$('drillReferenceMinimum').value;};
 $('cpmSlider').oninput=()=>{const {config}=setting(graph.threshold,graph.order,+$('maximumOrder').value,'auto'),resolution=config.candidates[+$('cpmSlider').value].resolution;$('cpmValue').textContent=resolution+' · Manual';$('cpmSlider').setAttribute('aria-valuetext',resolution+' (manual)');};
 $('cpmSlider').onchange=()=>{const {config}=setting(graph.threshold,graph.order,+$('maximumOrder').value,'auto');$('modelResolution').value=String(config.candidates[+$('cpmSlider').value].resolution);syncAnalysisOptions();};
 $('cpmAuto').onclick=()=>{$('modelResolution').value='auto';syncAnalysisOptions();};
 $('orderMode').onchange=syncAnalysisOptions;
 for(const id of ['orderSlider','maximumOrder']){$(id).oninput=()=>{$('orderSliderValue').textContent=$('orderSlider').value==='2'?'2 · pairwise':$('orderSlider').value+'-way';$('maximumOrderValue').textContent='2–'+$('maximumOrder').value;};$(id).onchange=syncAnalysisOptions;}
for(let id of ['hypergraphRepresentation','canvasLabelMode','couplingLabelMode','cluster','minEdge','nodeScale','labels','labelSize','edgeDisplay'])$(id).addEventListener('input',render);
representation.addEventListener('input',()=>{svg.classList.remove('hypergraph-transition');requestAnimationFrame(()=>{svg.classList.add('hypergraph-transition');setTimeout(()=>svg.classList.remove('hypergraph-transition'),450);});});
$('cluster').addEventListener('change',()=>{if($('cluster').value==='cluster-set'&&filteredClusters){render();fit();overview();return;}if($('cluster').value==='cluster-set')$('cluster').value='all';activeBundle=null;filteredClusters=null;pinnedCluster=null;includeConnected=false;state.selected=null;state.selectedEdge=null;state.hover=null;render();fit();overview();});
$('colorMode').onchange=()=>{$('mapCaption').textContent=$('mapCaption').textContent.replace(/Colors:.*$/, 'Colors: '+($('colorMode').value==='year'?((['keywords','coauthorship'].includes(state.method)||method().meanYear)?'mean source year':'publication year')+' (blue older; green newer; gray unknown)':method().group.toLowerCase())+'.');render();if(!state.selected&&!state.selectedEdge)overview()};$('query').oninput=render;$('fit').onclick=fit;$('zoomIn').onclick=()=>zoom(1.25);$('zoomOut').onclick=()=>zoom(.8);
$('reset').onclick=()=>{mapVisibility.minimumClusterSize=1;if(isEntityMap()){showSemanticCanvas(graph);return;}if(isCoupling()){const source=couplingSource,key=couplingScope,label=graph.scopeLabel;couplingSource=undefined;showCouplingCanvas(source,key,label);return;}drillStack.length=0;chooseMethod();};
$('helpButton').onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();
function view(mode){if(isPanel())return;state.view=mode;$('viewNetwork').classList.toggle('active',mode==='network');$('viewTable').classList.toggle('active',mode==='table');$('tableView').hidden=mode!=='table';svg.hidden=mode==='table';syncMotion();$('viewNetwork').setAttribute('aria-pressed',String(mode==='network'));$('viewTable').setAttribute('aria-pressed',String(mode==='table'));syncThreeD();}
$('motionToggle').onclick=()=>{motionEnabled=!motionEnabled;syncMotion()};reducedMotion.addEventListener('change',syncMotion);document.addEventListener('visibilitychange',syncMotion);
$('themeToggle').onclick=()=>{let active=document.body.classList.toggle('night-mode');$('themeToggle').setAttribute('aria-pressed',String(active));if(isPanel())return;render();if(state.selected)selectNode(state.selected,false);else if(state.selectedEdge){let edge=graph.links.find(e=>state.selectedEdge===e.source+'|'+e.target);if(edge)selectEdge(edge,false)}else overview()};
$('expandMap').onclick=()=>{let active=document.body.classList.toggle('map-expanded');$('expandMap').textContent=active?'Restore panels':'Expand map';$('expandMap').setAttribute('aria-pressed',String(active));requestAnimationFrame(resizeMap)};
window.atlasEvidenceContext=()=>{if(communityPending)return null;const savedParent=isEntityMap()?semanticParent:null,parent=isEntityMap()?(savedParent?.graph.canvasKind==='coupling'?savedParent.reference?.graph:savedParent?.graph):isCoupling()?referenceSession?.graph:graph;if(!parent)return null;return {graph:structuredClone({...parent,bundles:parent.bundles||data.bundlesByScope[parent.threshold]||[]}),articleIds:Object.keys(data.articles)};};
window.atlasSharedCanvas={graph:()=>graph,capture:captureCanvas,showSemantic:showSemanticCanvas,showCollaboration:showSemanticCanvas,showTemporal:next=>{graph=next;canvasMode(isCoupling());applyCanvasSettings(next);},restore:restoreSavedCanvas,redraw:()=>{render();fit();},applyAnalysis:next=>{window.ATLAS_EXTENSIONS?.cancel();$('clusteringMethod').value=next.clustering?.algorithm||'leiden';if(next.temporal&&!isCoupling()){$('orderMode').value='single';$('orderSlider').value=2;$('coCitationOrder').value=2;}applyCanvasSettings(next);},summary:()=>graph?({collaboration:graph.collaboration?.kind||null,semantic:graph.semantic?.kind||null,entityKind:graph.entityKind||null,title:method().title,selection:state.selected?'node:'+state.selected:state.selectedEdge?'edge:'+state.selectedEdge:null,algorithm:constructionOnly()?'not_requested':['infomap','hypergraph','sbm'].includes(graph.clustering?.algorithm)?graph.clustering.algorithm:'leiden',methodDisplayLabel:graph.derivedMethod?.display_scope||null,resolution:graph.resolution,markovTime:graph.clustering?.markovTime||1,objective:graph.clustering?.hypergraphObjective||'linear',automatic:!!graph.autoCPM?.enabled,extensionLabel:graph.extensionFilter?graph.extensionFilter.kind+' line filter':graph.temporal?graph.temporal.from+'–'+graph.temporal.to:'',shown:nodes.length,total:graph.nodes.length,hideUnlinked:mapVisibility.hideUnlinked,minimumClusterSize:mapVisibility.minimumClusterSize,hiddenClusters:mapVisibility.hiddenClusters.size}):null,applySettings:applyCanvasSettings,showCoupling:showCouplingCanvas,showReferences:showReferenceCanvas,selectSource:selectNode,clearSelection:()=>{state.selected=null;state.selectedEdge=null;state.hover=null;render();overview();},displayState:()=>({cluster:$('cluster').value,query:$('query').value,minimumSharedDisplay:+$('minEdge').value,edgeDisplay:$('edgeDisplay').value,hideUnlinked:mapVisibility.hideUnlinked,minimumClusterSize:mapVisibility.minimumClusterSize,hiddenClusters:[...mapVisibility.hiddenClusters]}),isCoupling};
window.atlasSharedCanvas.captureProject=()=>({...captureCanvas(),evidenceCorpusId:data.summary.corpus_id,reference:isEntityMap()?semanticParent:isCoupling()?referenceSession:null});
window.atlasSharedCanvas.openClusterCombinations=openClusterCombinations;
window.atlasSharedCanvas.openConnectionCombinations=(source,target,options)=>{const edge=graph.links.find(link=>link.source===source&&link.target===target||link.source===target&&link.target===source);if(!edge)throw Error('This connection is not in the saved map.');openLineLayers(edge,options);};
window.atlasSharedCanvas.installCorpus=(packet,options={})=>{
 window.ATLAS_EVIDENCE.validateCanvasPacket(packet);
 window.ATLAS_SEMANTIC?.resetContext();
 semanticParent=null;
 window.ATLAS_EXTENSIONS?.cancel();window.ATLAS_EVIDENCE.cancelCanvasReliability();communityJob?.cancel();communityJob=null;graphRequest++;communityPending=false;drillStack.length=0;
 if(!originalThemes)originalThemes={themeData,themeLoading,sourceThemeData,sourceThemeLoading};
 couplingSession=null;couplingSource=null;referenceSession=null;
 window.ATLAS_EVIDENCE.setDataset(packet?.evidence||null);couplingSession=null;couplingSource=null;referenceSession=null;externalPacket=packet;
 if(packet){data.articles=Object.fromEntries(packet.evidence.articles.map(article=>[article.id,{...article,doi:article.doi?.replace('https://doi.org/',''),category:'Metadata screened',journal:'OpenAlex source'}]));data.summary=window.ATLAS_EVIDENCE.currentStudySummary(packet,packet.graph,data.articles);data.references=packet.evidence.referenceLabels;themeData=null;themeLoading=null;sourceThemeData=null;sourceThemeLoading=null;}
 else{Object.assign(data,originalDataset);({themeData,themeLoading,sourceThemeData,sourceThemeLoading}=originalThemes);}
 themeError='';expandedData=null;expandedLoading=null;document.body.classList.toggle('project-corpus',!!packet);
 document.querySelector('.status-bar>span:last-child').textContent=(packet?packet.evidence.articles.length.toLocaleString():'2,855')+' source articles · Human validation pending';
 if(options.deferGraph)return;
 if(packet){if(options.completedBrowse)window.ATLAS_STARTUP_NAVIGATION?.saved();else window.ATLAS_STARTUP_NAVIGATION?.installed();}
 if(packet){
  state.method='cocitation';state.name='project-search';state.selected=null;state.selectedEdge=null;state.zoom=1;state.tx=0;state.ty=0;state.hover=null;
  graph=packet.graph;if(graph.semantic||graph.collaboration){showSemanticCanvas(graph,null);return;}if(graph.canvasKind==='coupling'){const next=window.ATLAS_EVIDENCE.adoptCoupling(graph,null);couplingSource=null;showCouplingCanvas(next,'saved-'+data.summary.corpus_id+'|null',graph.scopeLabel||'Saved source-article coupling');window.ATLAS_EVIDENCE.showCouplingControls();refreshAnalysisControls();return;}window.ATLAS_EVIDENCE.showReferenceWorkspace();if(!graph.themeDescriptions)graph.themeError='Generate project analysis for keywords and Qwen descriptions.';graph.appliedSettings||={settings:{label:'Saved analysis'}};
  $('threshold').replaceChildren(new Option('References cited by ≥'+graph.threshold+' sources','project-search'));$('threshold').disabled=true;$('clusteringMethod').value=graph.clustering?.algorithm||'leiden';
  $('orderMode').value=graph.order==='all'?'combined':'single';$('orderSlider').value=graph.order==='all'?2:graph.order||2;$('coCitationOrder').replaceChildren(new Option(String(graph.order||2),String(graph.order||2)));$('colorMode').replaceChildren(new Option('Community','cluster'),new Option('Publication year','year'));
  $('methodTitle').textContent='Co-citation';$('searchHeading').textContent='Find a cited work';$('mapCaption').textContent='Node size: citing sources. Curved line intensity: jointly citing sources. Colors: communities. Distances are not similarity scores.';
  mapVisibility.hideUnlinked=true;mapVisibility.hiddenClusters.clear();canvasMode(false);applyCanvasSettings(graph);if(packet.generation?.themesReady||graph.themeDescriptions)requestThemes();
 }else{canvasMode(false);}
};
window.atlasSharedCanvas.currentCorpus=()=>externalPacket;
window.atlasSharedCanvas.prepareSnapshot=window.ATLAS_EVIDENCE.prepareCanvasSnapshot;
window.atlasSharedCanvas.installSavedSnapshot=installSavedSnapshot;
window.atlasSharedCanvas.refreshAnalysisControls=refreshAnalysisControls;
window.atlasSharedCanvas.studySummary=()=>externalPacket?window.ATLAS_EVIDENCE.currentStudySummary(externalPacket,graph,data.articles,{nodes:nodes.length,edges:links.length}):data.summary;
window.atlasSharedCanvas.reloadThemes=()=>{if(isEntityMap()&&graph.entityKind!=='source')return Promise.resolve();if(graph?._backend==='independent-bnr-standalone'&&graph.importedStandalone){importedThemeLoads.delete(graph);window.ATLAS_EVIDENCE.clearImportedThemes?.(graph);}themeLoading=null;sourceThemeLoading=null;return sourceThemeMap()?requestCouplingThemes():requestThemes();};
window.atlasInspectReference=id=>{if(!index.has(id))return;filteredClusters=null;pinnedCluster=null;includeConnected=false;mapVisibility.hideUnlinked=false;mapVisibility.minimumClusterSize=1;mapVisibility.hiddenClusters.clear();mountMapVisibility();$('cluster').value='all';$('query').value='';$('minEdge').value=graph.minimumSupport||5;if(document.body.classList.contains('map-expanded'))$('expandMap').click();view('network');selectNode(id);fit();requestAnimationFrame(()=>{$('details').scrollTop=0;window.ATLAS_EVIDENCE?.revealSection($('details'),true);});};
window.addEventListener('atlas-reliability-change',event=>{if(event.detail!==graph||isPanel())return;clusterListGraph=null;render();});
$('viewNetwork').onclick=()=>{if(representation.value==='3d')representation.value=$('networkModel').value==='hypergraph'?'envelopes':'network';view('network');render();requestAnimationFrame(resizeMap)};$('viewTable').onclick=()=>view('table');for(let [key,m] of Object.entries(data.methods))$('analysisMethod').append(new Option(m.title,key));chooseMethod();new ResizeObserver(resizeMap).observe(svg);requestAnimationFrame(resizeMap);
})();
